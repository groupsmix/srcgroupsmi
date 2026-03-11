/**
 * /api/owner-dashboard — Owner/Admin Dashboard API
 *
 * Provides platform analytics, withdrawal management, and challenge creation.
 * All endpoints require admin role authentication.
 *
 * GET  /api/owner-dashboard?action=stats&days=30          — Platform stats
 * GET  /api/owner-dashboard?action=withdrawals            — Pending withdrawals
 * GET  /api/owner-dashboard?action=leaderboard&type=xp&limit=10  — Leaderboard
 * POST /api/owner-dashboard  { action: 'process_withdrawal', request_id, decision, admin_note }
 * POST /api/owner-dashboard  { action: 'create_challenge', ...challengeData }
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

                // Total users
                const usersRes = await fetch(
                    supabaseUrl + '/rest/v1/users?select=id&limit=1',
                    {
                        headers: {
                            'apikey': supabaseKey,
                            'Authorization': 'Bearer ' + supabaseKey,
                            'Prefer': 'count=estimated'
                        }
                    }
                );
                const totalUsersRange = usersRes.headers.get('content-range') || '0/0';
                const totalUsers = parseInt(totalUsersRange.split('/')[1]) || 0;

                // New users in period
                const newUsersRes = await fetch(
                    supabaseUrl + '/rest/v1/users?created_at=gte.' + cutoff + '&select=id&limit=1',
                    {
                        headers: {
                            'apikey': supabaseKey,
                            'Authorization': 'Bearer ' + supabaseKey,
                            'Prefer': 'count=estimated'
                        }
                    }
                );
                const newUsersRange = newUsersRes.headers.get('content-range') || '0/0';
                const newUsers = parseInt(newUsersRange.split('/')[1]) || 0;

                // Total articles
                const articlesRes = await fetch(
                    supabaseUrl + '/rest/v1/articles?select=id&limit=1',
                    {
                        headers: {
                            'apikey': supabaseKey,
                            'Authorization': 'Bearer ' + supabaseKey,
                            'Prefer': 'count=estimated'
                        }
                    }
                );
                const totalArticlesRange = articlesRes.headers.get('content-range') || '0/0';
                const totalArticles = parseInt(totalArticlesRange.split('/')[1]) || 0;

                // New articles in period
                const newArticlesRes = await fetch(
                    supabaseUrl + '/rest/v1/articles?created_at=gte.' + cutoff + '&select=id&limit=1',
                    {
                        headers: {
                            'apikey': supabaseKey,
                            'Authorization': 'Bearer ' + supabaseKey,
                            'Prefer': 'count=estimated'
                        }
                    }
                );
                const newArticlesRange = newArticlesRes.headers.get('content-range') || '0/0';
                const newArticles = parseInt(newArticlesRange.split('/')[1]) || 0;

                // Total coins purchased
                const coinsRes = await fetch(
                    supabaseUrl + '/rest/v1/wallet_transactions?type=eq.purchase&select=amount',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const coinsTxns = await coinsRes.json();
                const totalCoinsPurchased = (coinsTxns || []).reduce(function (sum, t) { return sum + (t.amount || 0); }, 0);

                // Total tips
                const tipsRes = await fetch(
                    supabaseUrl + '/rest/v1/wallet_transactions?type=eq.tip_sent&select=amount',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const tipsTxns = await tipsRes.json();
                const totalTips = (tipsTxns || []).reduce(function (sum, t) { return sum + Math.abs(t.amount || 0); }, 0);

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
                            p_reference_type: 'withdrawal_refund'
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

            case 'create_challenge': {
                const title = (body.title || '').trim();
                if (!title) {
                    return new Response(JSON.stringify({ ok: false, error: 'Challenge title is required' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                const challengeData = {
                    title: title,
                    title_ar: (body.title_ar || '').trim() || null,
                    description: (body.description || '').trim() || null,
                    challenge_type: body.challenge_type || 'write',
                    target_category: (body.target_category || '').trim() || null,
                    required_count: parseInt(body.required_count) || 1,
                    max_participants: parseInt(body.max_participants) || 0,
                    reward_coins: parseInt(body.reward_coins) || 0,
                    reward_xp: parseInt(body.reward_xp) || 0,
                    reward_badge_id: body.reward_badge_id || null,
                    starts_at: body.starts_at || new Date().toISOString(),
                    ends_at: body.ends_at || new Date(Date.now() + 7 * 86400000).toISOString(),
                    is_active: true,
                    created_by: admin.userId
                };

                const createRes = await fetch(supabaseUrl + '/rest/v1/weekly_challenges', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey,
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify(challengeData)
                });

                if (!createRes.ok) {
                    const errText = await createRes.text();
                    console.error('Create challenge error:', errText);
                    return new Response(JSON.stringify({ ok: false, error: 'Failed to create challenge' }), {
                        status: 500, headers: corsHeaders(origin)
                    });
                }

                const challenge = await createRes.json();
                return new Response(JSON.stringify({ ok: true, data: challenge[0] || challenge }), {
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
