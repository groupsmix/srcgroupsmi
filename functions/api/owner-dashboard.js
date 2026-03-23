/**
 * /api/owner-dashboard — Owner/Admin Dashboard API
 *
 * Provides platform analytics and withdrawal management.
 * All endpoints require admin role authentication.
 *
 * GET  /api/owner-dashboard?action=stats&days=30          — Platform stats
 * GET  /api/owner-dashboard?action=withdrawals            — Pending withdrawals
 * GET  /api/owner-dashboard?action=leaderboard&type=xp&limit=10  — Leaderboard
 * POST /api/owner-dashboard  { action: 'process_withdrawal', request_id, decision, admin_note }
 *
 * Environment variables:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

/* ── CORS headers ──────────────────────────────────────────── */
function corsHeaders(origin) {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin || 'https://groupsmix.com',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
}

/* ── Verify admin auth ─────────────────────────────────────── */
async function verifyAdmin(request, env) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Server not configured');

    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) throw new Error('Unauthorized');

    const token = authHeader.replace('Bearer ', '');
    const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
        headers: { 'Authorization': 'Bearer ' + token, 'apikey': supabaseKey }
    });
    if (!userRes.ok) throw new Error('Invalid token');
    const authUser = await userRes.json();

    const profileRes = await fetch(
        supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(authUser.id) + '&select=id,role&limit=1',
        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    );
    const profiles = await profileRes.json();
    if (!profiles || !profiles.length) throw new Error('User not found');
    if (profiles[0].role !== 'admin') throw new Error('Admin access required');

    return { authId: authUser.id, userId: profiles[0].id, role: profiles[0].role };
}

/* ── Main handler ──────────────────────────────────────────── */
export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || 'https://groupsmix.com';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ ok: false, error: 'Server configuration error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }

    // Verify admin
    let admin;
    try {
        admin = await verifyAdmin(request, env);
    } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: err.message === 'Admin access required' ? 403 : 401,
            headers: corsHeaders(origin)
        });
    }

    if (request.method === 'GET') {
        return handleGet(request, env, admin, origin);
    } else if (request.method === 'POST') {
        return handlePost(request, env, admin, origin);
    }

    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405, headers: corsHeaders(origin)
    });
}

/* ── GET handler ───────────────────────────────────────────── */
async function handleGet(request, env, admin, origin) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY;
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'stats';

    try {
        switch (action) {
            case 'stats': {
                const days = parseInt(url.searchParams.get('days')) || 30;

                // Use RPC if available
                try {
                    const rpcRes = await fetch(supabaseUrl + '/rest/v1/rpc/get_owner_dashboard', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': supabaseKey,
                            'Authorization': 'Bearer ' + supabaseKey
                        },
                        body: JSON.stringify({ p_days: days })
                    });
                    if (rpcRes.ok) {
                        const stats = await rpcRes.json();
                        return new Response(JSON.stringify({ ok: true, data: stats }), {
                            status: 200, headers: corsHeaders(origin)
                        });
                    }
                } catch (e) { /* fallback */ }

                // Fallback: manual aggregation
                const cutoff = new Date(Date.now() - days * 86400000).toISOString();

                // Parallelize all 6 independent REST calls
                const countHeaders = { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Prefer': 'count=estimated' };
                const defaultHeaders = { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey };

                const [usersRes, newUsersRes, articlesRes, newArticlesRes, coinsRes, tipsRes] = await Promise.all([
                    fetch(supabaseUrl + '/rest/v1/users?select=id&limit=1', { headers: countHeaders }),
                    fetch(supabaseUrl + '/rest/v1/users?created_at=gte.' + cutoff + '&select=id&limit=1', { headers: countHeaders }),
                    fetch(supabaseUrl + '/rest/v1/articles?select=id&limit=1', { headers: countHeaders }),
                    fetch(supabaseUrl + '/rest/v1/articles?created_at=gte.' + cutoff + '&select=id&limit=1', { headers: countHeaders }),
                    fetch(supabaseUrl + '/rest/v1/wallet_transactions?type=eq.purchase&select=amount', { headers: defaultHeaders }),
                    fetch(supabaseUrl + '/rest/v1/wallet_transactions?type=eq.tip_sent&select=amount', { headers: defaultHeaders })
                ]);

                const totalUsersRange = usersRes.headers.get('content-range') || '0/0';
                const totalUsers = parseInt(totalUsersRange.split('/')[1]) || 0;
                const newUsersRange = newUsersRes.headers.get('content-range') || '0/0';
                const newUsers = parseInt(newUsersRange.split('/')[1]) || 0;
                const totalArticlesRange = articlesRes.headers.get('content-range') || '0/0';
                const totalArticles = parseInt(totalArticlesRange.split('/')[1]) || 0;
                const newArticlesRange = newArticlesRes.headers.get('content-range') || '0/0';
                const newArticles = parseInt(newArticlesRange.split('/')[1]) || 0;
                const coinsTxns = await coinsRes.json();
                const totalCoinsPurchased = (coinsTxns || []).reduce((sum, t) => { return sum + (t.amount || 0); }, 0);
                const tipsTxns = await tipsRes.json();
                const totalTips = (tipsTxns || []).reduce((sum, t) => { return sum + Math.abs(t.amount || 0); }, 0);

                return new Response(JSON.stringify({
                    ok: true,
                    data: {
                        total_users: totalUsers,
                        new_users: newUsers,
                        total_articles: totalArticles,
                        new_articles: newArticles,
                        total_coins_purchased: totalCoinsPurchased,
                        total_tips: totalTips,
                        days: days
                    }
                }), { status: 200, headers: corsHeaders(origin) });
            }

            case 'withdrawals': {
                const wRes = await fetch(
                    supabaseUrl + '/rest/v1/withdrawal_requests?status=eq.pending&order=created_at.asc&select=*,user:user_id(id,display_name,email,photo_url)',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const withdrawals = await wRes.json();
                return new Response(JSON.stringify({ ok: true, data: withdrawals || [] }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            case 'predictive-growth': {
                // Platform-wide predictive growth analytics using linear regression
                const growthDays = parseInt(url.searchParams.get('days')) || 30;
                const growthCutoff = new Date(Date.now() - growthDays * 86400000).toISOString();

                // Fetch daily user signups
                const signupsRes = await fetch(
                    supabaseUrl + '/rest/v1/users?created_at=gte.' + encodeURIComponent(growthCutoff) + '&select=created_at&order=created_at.asc&limit=5000',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const signups = await signupsRes.json();

                // Fetch daily article creation
                const articleGrowthRes = await fetch(
                    supabaseUrl + '/rest/v1/articles?created_at=gte.' + encodeURIComponent(growthCutoff) + '&select=created_at&order=created_at.asc&limit=5000',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const articleGrowth = await articleGrowthRes.json();

                // Build daily data
                const dailyGrowth = [];
                let cumUsers = 0, cumArticles = 0;
                for (let gd = 0; gd < growthDays; gd++) {
                    const gdDate = new Date(Date.now() - (growthDays - 1 - gd) * 86400000);
                    const gdKey = gdDate.toISOString().substring(0, 10);

                    const dayUsers = (signups || []).filter((u) => { return (u.created_at || '').substring(0, 10) === gdKey; }).length;
                    const dayArticles = (articleGrowth || []).filter((a) => { return (a.created_at || '').substring(0, 10) === gdKey; }).length;
                    cumUsers += dayUsers;
                    cumArticles += dayArticles;

                    dailyGrowth.push({
                        date: gdKey,
                        day_index: gd,
                        new_users: dayUsers,
                        new_articles: dayArticles,
                        cumulative_users: cumUsers,
                        cumulative_articles: cumArticles
                    });
                }

                // Linear regression on cumulative users
                const gn = dailyGrowth.length;
                let gsumX = 0, gsumY = 0, gsumXY = 0, gsumXX = 0;
                dailyGrowth.forEach((dp) => {
                    gsumX += dp.day_index;
                    gsumY += dp.cumulative_users;
                    gsumXY += dp.day_index * dp.cumulative_users;
                    gsumXX += dp.day_index * dp.day_index;
                });
                const userSlope = (gn * gsumXY - gsumX * gsumY) / (gn * gsumXX - gsumX * gsumX) || 0;
                const userIntercept = (gsumY - userSlope * gsumX) / gn || 0;

                // Linear regression on cumulative articles
                let asumY = 0, asumXY = 0;
                dailyGrowth.forEach((dp) => {
                    asumY += dp.cumulative_articles;
                    asumXY += dp.day_index * dp.cumulative_articles;
                });
                const articleSlope = (gn * asumXY - gsumX * asumY) / (gn * gsumXX - gsumX * gsumX) || 0;

                // Revenue trend: fetch coin purchase transactions for the period
                let revenueTrend = null;
                try {
                    const revRes = await fetch(
                        supabaseUrl + '/rest/v1/wallet_transactions?type=eq.purchase&created_at=gte.' + encodeURIComponent(growthCutoff) + '&select=amount,created_at&order=created_at.asc&limit=5000',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                    );
                    const revTxns = await revRes.json();
                    if (Array.isArray(revTxns) && revTxns.length > 0) {
                        // Build daily revenue
                        const dailyRevenue = {};
                        revTxns.forEach((t) => {
                            const rKey = (t.created_at || '').substring(0, 10);
                            dailyRevenue[rKey] = (dailyRevenue[rKey] || 0) + Math.abs(t.amount || 0);
                        });

                        // Linear regression on daily revenue
                        const revDays = Object.keys(dailyRevenue).sort();
                        let rsumX = 0, rsumY = 0, rsumXY = 0, rsumXX = 0;
                        revDays.forEach((rd, ri) => {
                            rsumX += ri;
                            rsumY += dailyRevenue[rd];
                            rsumXY += ri * dailyRevenue[rd];
                            rsumXX += ri * ri;
                        });
                        const rn = revDays.length;
                        const revSlope = rn > 1 ? ((rn * rsumXY - rsumX * rsumY) / (rn * rsumXX - rsumX * rsumX) || 0) : 0;
                        const totalRevenue = rsumY;
                        const avgDailyRevenue = totalRevenue / growthDays;

                        revenueTrend = {
                            total_coins: Math.round(totalRevenue),
                            avg_daily_coins: parseFloat(avgDailyRevenue.toFixed(1)),
                            slope: parseFloat(revSlope.toFixed(4)),
                            direction: revSlope > 1 ? 'growing' : (revSlope < -1 ? 'declining' : 'stable'),
                            projected_next_30d: Math.max(0, Math.round(avgDailyRevenue * 30 + revSlope * 30)),
                            projected_next_90d: Math.max(0, Math.round(avgDailyRevenue * 90 + revSlope * 90))
                        };
                    }
                } catch (e) {
                    // revenue data unavailable
                }

                // Project next 14 days
                const growthProjections = [];
                for (let gp = 1; gp <= 14; gp++) {
                    const gpDay = gn + gp - 1;
                    const gpDate = new Date(Date.now() + gp * 86400000);
                    growthProjections.push({
                        date: gpDate.toISOString().substring(0, 10),
                        projected_cumulative_users: Math.max(cumUsers, Math.round(userSlope * gpDay + userIntercept)),
                        projected_cumulative_articles: Math.max(cumArticles, Math.round(articleSlope * gpDay + (asumY - articleSlope * gsumX) / gn)),
                        confidence: Math.max(0.3, 1 - (gp * 0.04))
                    });
                }

                return new Response(JSON.stringify({
                    ok: true,
                    data: {
                        period_days: growthDays,
                        daily_data: dailyGrowth,
                        trends: {
                            users: {
                                slope: parseFloat(userSlope.toFixed(4)),
                                direction: userSlope > 0.5 ? 'growing' : (userSlope < -0.5 ? 'declining' : 'stable'),
                                avg_per_day: parseFloat((cumUsers / growthDays).toFixed(2))
                            },
                            articles: {
                                slope: parseFloat(articleSlope.toFixed(4)),
                                direction: articleSlope > 0.2 ? 'growing' : (articleSlope < -0.2 ? 'declining' : 'stable'),
                                avg_per_day: parseFloat((cumArticles / growthDays).toFixed(2))
                            }
                        },
                        revenue: revenueTrend,
                        projections: growthProjections
                    }
                }), { status: 200, headers: corsHeaders(origin) });
            }

            case 'insights': {
                // Platform-wide actionable insights
                const insightDays = parseInt(url.searchParams.get('days')) || 30;
                const insightCutoff = new Date(Date.now() - insightDays * 86400000).toISOString();
                const prevCutoff = new Date(Date.now() - insightDays * 2 * 86400000).toISOString();

                // Current period users
                const curUsersRes = await fetch(
                    supabaseUrl + '/rest/v1/users?created_at=gte.' + encodeURIComponent(insightCutoff) + '&select=created_at&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Prefer': 'count=estimated' } }
                );
                const curUsersCount = parseInt((curUsersRes.headers.get('content-range') || '0/0').split('/')[1]) || 0;

                // Previous period users
                const prevUsersRes = await fetch(
                    supabaseUrl + '/rest/v1/users?created_at=gte.' + encodeURIComponent(prevCutoff) + '&created_at=lt.' + encodeURIComponent(insightCutoff) + '&select=created_at&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Prefer': 'count=estimated' } }
                );
                const prevUsersCount = parseInt((prevUsersRes.headers.get('content-range') || '0/0').split('/')[1]) || 0;

                // Current period articles
                const curArticlesRes = await fetch(
                    supabaseUrl + '/rest/v1/articles?created_at=gte.' + encodeURIComponent(insightCutoff) + '&select=created_at&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Prefer': 'count=estimated' } }
                );
                const curArticlesCount = parseInt((curArticlesRes.headers.get('content-range') || '0/0').split('/')[1]) || 0;

                const prevArticlesRes = await fetch(
                    supabaseUrl + '/rest/v1/articles?created_at=gte.' + encodeURIComponent(prevCutoff) + '&created_at=lt.' + encodeURIComponent(insightCutoff) + '&select=created_at&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Prefer': 'count=estimated' } }
                );
                const prevArticlesCount = parseInt((prevArticlesRes.headers.get('content-range') || '0/0').split('/')[1]) || 0;

                const platformInsights = [];

                // User growth comparison
                if (prevUsersCount > 0) {
                    const userGrowthPct = ((curUsersCount - prevUsersCount) / prevUsersCount * 100);
                    if (userGrowthPct > 20) {
                        platformInsights.push({
                            type: 'growth',
                            icon: 'trending-up',
                            title: 'User Growth Accelerating',
                            description: 'User signups grew ' + userGrowthPct.toFixed(0) + '% compared to the previous ' + insightDays + ' days (' + curUsersCount + ' vs ' + prevUsersCount + ').',
                            impact: 'high',
                            data: { current: curUsersCount, previous: prevUsersCount, change_pct: parseFloat(userGrowthPct.toFixed(1)) }
                        });
                    } else if (userGrowthPct < -20) {
                        platformInsights.push({
                            type: 'growth',
                            icon: 'trending-down',
                            title: 'User Growth Slowing',
                            description: 'User signups dropped ' + Math.abs(userGrowthPct).toFixed(0) + '% compared to the previous period. Consider increasing marketing efforts.',
                            impact: 'high',
                            data: { current: curUsersCount, previous: prevUsersCount, change_pct: parseFloat(userGrowthPct.toFixed(1)) }
                        });
                    }
                }

                // Article growth comparison
                if (prevArticlesCount > 0) {
                    const articleGrowthPct = ((curArticlesCount - prevArticlesCount) / prevArticlesCount * 100);
                    if (articleGrowthPct > 30) {
                        platformInsights.push({
                            type: 'content',
                            icon: 'file-text',
                            title: 'Content Creation Surging',
                            description: 'Article creation is up ' + articleGrowthPct.toFixed(0) + '% this period (' + curArticlesCount + ' articles). Your content strategy is working!',
                            impact: 'medium',
                            data: { current: curArticlesCount, previous: prevArticlesCount, change_pct: parseFloat(articleGrowthPct.toFixed(1)) }
                        });
                    } else if (articleGrowthPct < -30) {
                        platformInsights.push({
                            type: 'content',
                            icon: 'alert-triangle',
                            title: 'Content Creation Declining',
                            description: 'Article creation dropped ' + Math.abs(articleGrowthPct).toFixed(0) + '%. Consider incentivizing writers with higher coin rewards.',
                            impact: 'high',
                            data: { current: curArticlesCount, previous: prevArticlesCount, change_pct: parseFloat(articleGrowthPct.toFixed(1)) }
                        });
                    }
                }

                // Users per article ratio
                if (curArticlesCount > 0 && curUsersCount > 0) {
                    const usersPerArticle = curUsersCount / curArticlesCount;
                    if (usersPerArticle > 50) {
                        platformInsights.push({
                            type: 'content_gap',
                            icon: 'edit',
                            title: 'Content Gap Detected',
                            description: 'You have ' + usersPerArticle.toFixed(0) + ' users per article. Encouraging more content creation could improve engagement and retention.',
                            impact: 'medium',
                            data: { ratio: parseFloat(usersPerArticle.toFixed(1)) }
                        });
                    }
                }

                // Retention metrics: check returning users vs new users
                let retentionData = null;
                try {
                    const activeUsersRes = await fetch(
                        supabaseUrl + '/rest/v1/users?last_active_at=gte.' + encodeURIComponent(insightCutoff) + '&select=id,created_at,last_active_at&limit=1',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Prefer': 'count=estimated' } }
                    );
                    const activeCount = parseInt((activeUsersRes.headers.get('content-range') || '0/0').split('/')[1]) || 0;

                    const returningRes = await fetch(
                        supabaseUrl + '/rest/v1/users?last_active_at=gte.' + encodeURIComponent(insightCutoff) + '&created_at=lt.' + encodeURIComponent(insightCutoff) + '&select=id&limit=1',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Prefer': 'count=estimated' } }
                    );
                    const returningCount = parseInt((returningRes.headers.get('content-range') || '0/0').split('/')[1]) || 0;

                    if (activeCount > 0) {
                        const retentionRate = (returningCount / activeCount * 100);
                        retentionData = {
                            active_users: activeCount,
                            returning_users: returningCount,
                            new_active_users: activeCount - returningCount,
                            retention_rate: parseFloat(retentionRate.toFixed(1))
                        };

                        if (retentionRate < 30) {
                            platformInsights.push({
                                type: 'retention',
                                icon: 'user-minus',
                                title: 'Low User Retention (' + retentionRate.toFixed(0) + '%)',
                                description: 'Only ' + retentionRate.toFixed(0) + '% of active users are returning users. Consider re-engagement campaigns, push notifications, or email digests to bring users back.',
                                impact: 'high',
                                data: retentionData
                            });
                        } else if (retentionRate > 60) {
                            platformInsights.push({
                                type: 'retention',
                                icon: 'user-check',
                                title: 'Strong Retention (' + retentionRate.toFixed(0) + '%)',
                                description: retentionRate.toFixed(0) + '% of active users are returning — excellent stickiness! ' + returningCount + ' returning users this period.',
                                impact: 'low',
                                data: retentionData
                            });
                        }
                    }
                } catch (e) {
                    // retention data unavailable
                }

                return new Response(JSON.stringify({
                    ok: true,
                    data: {
                        insights: platformInsights,
                        period_days: insightDays,
                        summary: {
                            users_this_period: curUsersCount,
                            users_prev_period: prevUsersCount,
                            articles_this_period: curArticlesCount,
                            articles_prev_period: prevArticlesCount
                        },
                        retention: retentionData
                    }
                }), { status: 200, headers: corsHeaders(origin) });
            }

            case 'leaderboard': {
                const type = url.searchParams.get('type') || 'xp';
                const limit = Math.min(parseInt(url.searchParams.get('limit')) || 10, 100);

                try {
                    const lbRes = await fetch(supabaseUrl + '/rest/v1/rpc/get_fuel_leaderboard', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': supabaseKey,
                            'Authorization': 'Bearer ' + supabaseKey
                        },
                        body: JSON.stringify({ p_type: type, p_limit: limit })
                    });
                    if (lbRes.ok) {
                        const lb = await lbRes.json();
                        return new Response(JSON.stringify({ ok: true, data: lb || [] }), {
                            status: 200, headers: corsHeaders(origin)
                        });
                    }
                } catch (e) { /* fallback */ }

                // Fallback: direct query
                let orderCol = 'writer_xp';
                if (type === 'tips') orderCol = 'writer_points';
                else if (type === 'articles') orderCol = 'article_count';

                const fbRes = await fetch(
                    supabaseUrl + '/rest/v1/users?select=id,display_name,photo_url,writer_xp,writer_level,gxp,article_count&order=' + orderCol + '.desc.nullslast&limit=' + limit,
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const users = await fbRes.json();
                return new Response(JSON.stringify({ ok: true, data: users || [] }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            default:
                return new Response(JSON.stringify({ ok: false, error: 'Unknown action: ' + action }), {
                    status: 400, headers: corsHeaders(origin)
                });
        }
    } catch (err) {
        console.error('owner-dashboard GET error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal server error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}

/* ── POST handler ──────────────────────────────────────────── */
async function handlePost(request, env, admin, origin) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY;

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    const action = body.action;

    try {
        switch (action) {
            case 'process_withdrawal': {
                const requestId = body.request_id;
                const decision = body.decision; // 'approve' or 'reject'
                const adminNote = body.admin_note || '';

                if (!requestId) {
                    return new Response(JSON.stringify({ ok: false, error: 'request_id is required' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                if (decision !== 'approve' && decision !== 'reject') {
                    return new Response(JSON.stringify({ ok: false, error: 'decision must be "approve" or "reject"' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                // Get the withdrawal request
                const reqRes = await fetch(
                    supabaseUrl + '/rest/v1/withdrawal_requests?id=eq.' + encodeURIComponent(requestId) + '&status=eq.pending&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const reqs = await reqRes.json();
                if (!reqs || !reqs.length) {
                    return new Response(JSON.stringify({ ok: false, error: 'Withdrawal request not found or already processed' }), {
                        status: 404, headers: corsHeaders(origin)
                    });
                }

                const withdrawal = reqs[0];

                if (decision === 'approve') {
                    // Update status to approved
                    await fetch(
                        supabaseUrl + '/rest/v1/withdrawal_requests?id=eq.' + encodeURIComponent(requestId),
                        {
                            method: 'PATCH',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': supabaseKey,
                                'Authorization': 'Bearer ' + supabaseKey
                            },
                            body: JSON.stringify({
                                status: 'approved',
                                admin_note: adminNote,
                                processed_at: new Date().toISOString(),
                                processed_by: admin.userId
                            })
                        }
                    );

                    // Notify user
                    await fetch(supabaseUrl + '/rest/v1/notifications', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': supabaseKey,
                            'Authorization': 'Bearer ' + supabaseKey
                        },
                        body: JSON.stringify({
                            uid: withdrawal.user_id,
                            type: 'system',
                            title: 'Withdrawal Approved',
                            message: 'Your withdrawal of ' + withdrawal.coins_amount + ' GMX Coins ($' + parseFloat(withdrawal.usd_amount).toFixed(2) + ') has been approved. Payment will be sent shortly.',
                            link: '/pages/user/wallet.html'
                        })
                    });

                } else {
                    // Reject: refund coins back to wallet
                    await fetch(
                        supabaseUrl + '/rest/v1/withdrawal_requests?id=eq.' + encodeURIComponent(requestId),
                        {
                            method: 'PATCH',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': supabaseKey,
                                'Authorization': 'Bearer ' + supabaseKey
                            },
                            body: JSON.stringify({
                                status: 'rejected',
                                admin_note: adminNote,
                                processed_at: new Date().toISOString(),
                                processed_by: admin.userId
                            })
                        }
                    );

                    // Refund coins
                    await fetch(supabaseUrl + '/rest/v1/rpc/credit_coins', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': supabaseKey,
                            'Authorization': 'Bearer ' + supabaseKey
                        },
                        body: JSON.stringify({
                            p_user_id: withdrawal.user_id,
                            p_amount: withdrawal.coins_amount,
                            p_type: 'refund',
                            p_description: 'Withdrawal request rejected' + (adminNote ? ': ' + adminNote : ''),
                            p_reference_id: requestId,
                            p_reference_type: 'withdrawal_refund',
                            p_coin_source: 'earned'
                        })
                    });

                    // Notify user
                    await fetch(supabaseUrl + '/rest/v1/notifications', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': supabaseKey,
                            'Authorization': 'Bearer ' + supabaseKey
                        },
                        body: JSON.stringify({
                            uid: withdrawal.user_id,
                            type: 'system',
                            title: 'Withdrawal Rejected',
                            message: 'Your withdrawal request has been rejected.' + (adminNote ? ' Reason: ' + adminNote : '') + ' The coins have been returned to your wallet.',
                            link: '/pages/user/wallet.html'
                        })
                    });
                }

                return new Response(JSON.stringify({ ok: true, decision: decision, request_id: requestId }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            default:
                return new Response(JSON.stringify({ ok: false, error: 'Unknown action: ' + action }), {
                    status: 400, headers: corsHeaders(origin)
                });
        }
    } catch (err) {
        console.error('owner-dashboard POST error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal server error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}
