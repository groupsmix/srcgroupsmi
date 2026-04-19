/**
 * /api/group-dashboard — Group Owner Dashboard API
 *
 * GET /api/group-dashboard?group_id=X  — Get performance stats for a group
 * GET /api/group-dashboard?group_id=X&action=tips — Get growth tips
 *
 * Shows group owners how their group is performing on GroupsMix.
 * Requires the user to be the group's submitter.
 */

const ALLOWED_ORIGINS = ['https://groupsmix.com', 'https://www.groupsmix.com'];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
            status: 405, headers: corsHeaders(origin)
        });
    }

    const supabaseUrl = env?.SUPABASE_URL || 'https://hmlqppacanpxmrfdlkec.supabase.co';
    const supabaseKey = env?.SUPABASE_SERVICE_KEY || env?.SUPABASE_ANON_KEY || '';

    if (!supabaseKey) {
        return new Response(JSON.stringify({ ok: false, error: 'Server not configured' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }

    const url = new URL(request.url);
    const groupId = url.searchParams.get('group_id');
    const action = url.searchParams.get('action') || 'stats';

    if (!groupId) {
        return new Response(JSON.stringify({ ok: false, error: 'group_id required' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    try {
        // Get the group
        const groupRes = await fetch(
            supabaseUrl + '/rest/v1/groups?id=eq.' + encodeURIComponent(groupId) + '&select=*&limit=1',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const groups = await groupRes.json();
        if (!groups || !groups.length) {
            return new Response(JSON.stringify({ ok: false, error: 'Group not found' }), {
                status: 404, headers: corsHeaders(origin)
            });
        }

        const group = groups[0];

        if (action === 'tips') {
            // Generate growth tips based on group data
            const tips = [];

            if (!group.description || group.description.length < 50) {
                tips.push({
                    type: 'critical',
                    icon: 'edit',
                    title: 'Add a Detailed Description',
                    description: 'Groups with descriptions over 100 characters get 3x more joins. Add details about what your group offers.',
                    impact: 'high'
                });
            }

            if (!group.tags || !group.tags.length) {
                tips.push({
                    type: 'important',
                    icon: 'tag',
                    title: 'Add Tags to Your Group',
                    description: 'Tags help users find your group in search. Add 3-5 relevant tags.',
                    impact: 'high'
                });
            }

            if ((group.trust_score || 0) < 50) {
                tips.push({
                    type: 'important',
                    icon: 'shield',
                    title: 'Improve Your Trust Score',
                    description: 'Groups with trust scores above 50 get featured in recommendations. Get reviews and verify your group to boost your score.',
                    impact: 'high'
                });
            }

            if ((group.review_count || 0) < 3) {
                tips.push({
                    type: 'growth',
                    icon: 'star',
                    title: 'Get More Reviews',
                    description: 'Ask your group members to leave reviews on GroupsMix. 3+ reviews significantly boosts trust score and visibility.',
                    impact: 'medium'
                });
            }

            if ((group.views || 0) < 100) {
                tips.push({
                    type: 'growth',
                    icon: 'share',
                    title: 'Share Your GroupsMix Profile',
                    description: 'Share your group\'s GroupsMix page on social media, your website, or YouTube description to increase visibility.',
                    impact: 'medium'
                });
            }

            tips.push({
                type: 'growth',
                icon: 'widget',
                title: 'Embed a Widget on Your Website',
                description: 'Add a "Join on GroupsMix" widget to your website or blog. It\'s free advertising that drives new members.',
                impact: 'medium',
                action_url: '/tools/embed-widget?group_id=' + groupId
            });

            tips.push({
                type: 'growth',
                icon: 'link',
                title: 'Use Smart Links',
                description: 'Create a shortened GroupsMix link with analytics to track where your members are coming from.',
                impact: 'medium',
                action_url: '/tools/link-generator?group_id=' + groupId
            });

            tips.push({
                type: 'advanced',
                icon: 'bot',
                title: 'Connect a Bot',
                description: 'Add the GroupsMix bot to auto-sync member count and trust score. Your listing stays fresh automatically.',
                impact: 'low',
                action_url: '/tools/bot-setup?group_id=' + groupId
            });

            return new Response(JSON.stringify({ ok: true, tips: tips }), {
                status: 200, headers: corsHeaders(origin)
            });
        }

        if (action === 'predictive-growth') {
            // Predictive growth analytics using linear regression on the last 30 days
            const days = parseInt(url.searchParams.get('days'), 10) || 30;

            // Get daily view snapshots (using analytics events if available)
            const cutoff = new Date(Date.now() - days * 86400000).toISOString();

            // Get reviews over time for growth tracking
            const growthReviewsRes = await fetch(
                supabaseUrl + '/rest/v1/reviews?group_id=eq.' + encodeURIComponent(groupId) + '&created_at=gte.' + encodeURIComponent(cutoff) + '&select=rating,created_at&order=created_at.asc',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            let growthReviews = await growthReviewsRes.json();
            growthReviews = Array.isArray(growthReviews) ? growthReviews : [];

            // Build daily data points
            const dailyData = [];
            let cumulativeReviews = 0;
            for (let d = 0; d < days; d++) {
                const dayDate = new Date(Date.now() - (days - 1 - d) * 86400000);
                const dayKey = dayDate.toISOString().substring(0, 10);

                const dayReviews = growthReviews.filter((r) => {
                    return (r.created_at || '').substring(0, 10) === dayKey;
                });
                cumulativeReviews += dayReviews.length;

                dailyData.push({
                    date: dayKey,
                    day_index: d,
                    new_reviews: dayReviews.length,
                    cumulative_reviews: cumulativeReviews,
                    avg_rating: dayReviews.length > 0
                        ? dayReviews.reduce((s, r) => { return s + (r.rating || 0); }, 0) / dayReviews.length
                        : null
                });
            }

            // Simple linear regression on cumulative reviews
            const n = dailyData.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
            dailyData.forEach((dp) => {
                sumX += dp.day_index;
                sumY += dp.cumulative_reviews;
                sumXY += dp.day_index * dp.cumulative_reviews;
                sumXX += dp.day_index * dp.day_index;
            });

            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) || 0;
            const intercept = (sumY - slope * sumX) / n || 0;

            // Project next 14 days
            const projections = [];
            for (let p = 1; p <= 14; p++) {
                const projDay = n + p - 1;
                const projDate = new Date(Date.now() + p * 86400000);
                projections.push({
                    date: projDate.toISOString().substring(0, 10),
                    projected_cumulative_reviews: Math.max(cumulativeReviews, Math.round(slope * projDay + intercept)),
                    confidence: Math.max(0.3, 1 - (p * 0.04)) // confidence decreases over time
                });
            }

            const growthRate = cumulativeReviews > 0 ? (slope / Math.max(1, cumulativeReviews / n) * 100) : 0;

            // Get view trend data from analytics if available
            let viewTrend = null;
            try {
                const viewsRes = await fetch(
                    supabaseUrl + '/rest/v1/rpc/get_group_view_history',
                    {
                        method: 'POST',
                        headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ p_group_id: groupId, p_days: days })
                    }
                );
                if (viewsRes.ok) {
                    const viewHistory = await viewsRes.json();
                    if (Array.isArray(viewHistory) && viewHistory.length > 1) {
                        // Linear regression on views
                        const vn = viewHistory.length;
                        let vsumX = 0, vsumY = 0, vsumXY = 0, vsumXX = 0;
                        viewHistory.forEach((vp, vi) => {
                            vsumX += vi;
                            vsumY += (vp.views || 0);
                            vsumXY += vi * (vp.views || 0);
                            vsumXX += vi * vi;
                        });
                        const viewSlope = (vn * vsumXY - vsumX * vsumY) / (vn * vsumXX - vsumX * vsumX) || 0;
                        const avgDailyViews = vsumY / vn;
                        viewTrend = {
                            slope: parseFloat(viewSlope.toFixed(4)),
                            direction: viewSlope > 1 ? 'growing' : (viewSlope < -1 ? 'declining' : 'stable'),
                            avg_daily_views: parseFloat(avgDailyViews.toFixed(1)),
                            projected_views_7d: Math.max(0, Math.round(avgDailyViews * 7 + viewSlope * 7))
                        };
                    }
                }
            } catch (_e) {
                // view trend data unavailable, continue without it
            }

            return new Response(JSON.stringify({
                ok: true,
                data: {
                    group_id: groupId,
                    period_days: days,
                    current_stats: {
                        total_reviews: group.review_count || 0,
                        views: group.views || 0,
                        trust_score: group.trust_score || 0,
                        avg_rating: parseFloat(group.avg_rating) || 0
                    },
                    daily_data: dailyData,
                    trend: {
                        slope: parseFloat(slope.toFixed(4)),
                        direction: slope > 0.1 ? 'growing' : (slope < -0.1 ? 'declining' : 'stable'),
                        growth_rate_pct: parseFloat(growthRate.toFixed(2)),
                        reviews_per_day_avg: parseFloat((cumulativeReviews / days).toFixed(2))
                    },
                    view_trend: viewTrend,
                    projections: projections
                }
            }), { status: 200, headers: corsHeaders(origin) });
        }

        if (action === 'insights') {
            // Actionable insights — derive patterns from group data
            const insightsDays = parseInt(url.searchParams.get('days'), 10) || 30;
            const insightsCutoff = new Date(Date.now() - insightsDays * 86400000).toISOString();

            // Get reviews with timestamps for pattern analysis
            const insightReviewsRes = await fetch(
                supabaseUrl + '/rest/v1/reviews?group_id=eq.' + encodeURIComponent(groupId) + '&created_at=gte.' + encodeURIComponent(insightsCutoff) + '&select=rating,created_at&order=created_at.asc',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            let insightReviews = await insightReviewsRes.json();
            insightReviews = Array.isArray(insightReviews) ? insightReviews : [];

            const insights = [];

            // Pattern 1: Best day of week for engagement
            const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
            const dayNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
            insightReviews.forEach((r) => {
                const dow = new Date(r.created_at).getDay();
                dayOfWeekCounts[dow]++;
            });
            const bestDay = dayOfWeekCounts.indexOf(Math.max.apply(null, dayOfWeekCounts));
            const worstDay = dayOfWeekCounts.indexOf(Math.min.apply(null, dayOfWeekCounts));
            if (insightReviews.length >= 5 && dayOfWeekCounts[bestDay] > dayOfWeekCounts[worstDay] * 1.5) {
                const boost = dayOfWeekCounts[worstDay] > 0
                    ? Math.round((dayOfWeekCounts[bestDay] / dayOfWeekCounts[worstDay] - 1) * 100)
                    : 100;
                insights.push({
                    type: 'engagement_pattern',
                    icon: 'calendar',
                    title: 'Best Day for Engagement: ' + dayNames[bestDay],
                    description: 'Your group gets ' + boost + '% more engagement on ' + dayNames[bestDay] + ' compared to ' + dayNames[worstDay] + '. Consider posting updates on ' + dayNames[bestDay] + '.',
                    impact: 'high',
                    data: { best_day: dayNames[bestDay], worst_day: dayNames[worstDay], boost_pct: boost }
                });
            }

            // Pattern 2: Rating trend
            if (insightReviews.length >= 3) {
                const firstHalf = insightReviews.slice(0, Math.floor(insightReviews.length / 2));
                const secondHalf = insightReviews.slice(Math.floor(insightReviews.length / 2));
                const avgFirst = firstHalf.reduce((s, r) => { return s + (r.rating || 0); }, 0) / firstHalf.length;
                const avgSecond = secondHalf.reduce((s, r) => { return s + (r.rating || 0); }, 0) / secondHalf.length;

                if (avgSecond > avgFirst + 0.3) {
                    insights.push({
                        type: 'rating_trend',
                        icon: 'trending-up',
                        title: 'Rating Is Improving!',
                        description: 'Your average rating improved from ' + avgFirst.toFixed(1) + ' to ' + avgSecond.toFixed(1) + ' in the recent period. Keep up the great work!',
                        impact: 'medium',
                        data: { old_avg: parseFloat(avgFirst.toFixed(1)), new_avg: parseFloat(avgSecond.toFixed(1)) }
                    });
                } else if (avgSecond < avgFirst - 0.3) {
                    insights.push({
                        type: 'rating_trend',
                        icon: 'trending-down',
                        title: 'Rating Needs Attention',
                        description: 'Your average rating dropped from ' + avgFirst.toFixed(1) + ' to ' + avgSecond.toFixed(1) + '. Consider engaging more with your community to improve satisfaction.',
                        impact: 'high',
                        data: { old_avg: parseFloat(avgFirst.toFixed(1)), new_avg: parseFloat(avgSecond.toFixed(1)) }
                    });
                }
            }

            // Pattern 3: Conversion rate insight
            const conversionRate = (group.views || 0) > 0 ? ((group.click_count || 0) / group.views * 100) : 0;
            if (conversionRate < 5 && (group.views || 0) > 50) {
                insights.push({
                    type: 'conversion',
                    icon: 'zap',
                    title: 'Low Conversion Rate (' + conversionRate.toFixed(1) + '%)',
                    description: 'Your group has ' + group.views + ' views but only ' + (group.click_count || 0) + ' clicks. Improve your description, add tags, and share a smart link to boost conversions.',
                    impact: 'high',
                    data: { views: group.views, clicks: group.click_count || 0, rate: parseFloat(conversionRate.toFixed(1)) }
                });
            } else if (conversionRate > 20) {
                insights.push({
                    type: 'conversion',
                    icon: 'award',
                    title: 'Excellent Conversion Rate (' + conversionRate.toFixed(1) + '%)',
                    description: 'Your group converts ' + conversionRate.toFixed(1) + '% of visitors into clicks — well above average! Your listing is compelling.',
                    impact: 'low',
                    data: { views: group.views, clicks: group.click_count || 0, rate: parseFloat(conversionRate.toFixed(1)) }
                });
            }

            // Pattern 4: Trust score insight
            if ((group.trust_score || 0) < 30) {
                insights.push({
                    type: 'trust',
                    icon: 'shield-off',
                    title: 'Trust Score Is Low (' + (group.trust_score || 0) + '/100)',
                    description: 'Groups with trust scores above 50 get 4x more visibility. Get more reviews, verify your group, and add a detailed description.',
                    impact: 'high',
                    data: { trust_score: group.trust_score || 0 }
                });
            }

            // Pattern 5: Review velocity
            const recentReviewCount = insightReviews.length;
            const reviewsPerWeek = recentReviewCount / (insightsDays / 7);
            if (reviewsPerWeek > 2) {
                insights.push({
                    type: 'momentum',
                    icon: 'rocket',
                    title: 'Strong Review Momentum',
                    description: 'You\'re getting ' + reviewsPerWeek.toFixed(1) + ' reviews per week — great engagement! Consider adding a review widget to your website to maintain this.',
                    impact: 'medium',
                    data: { reviews_per_week: parseFloat(reviewsPerWeek.toFixed(1)) }
                });
            }

            return new Response(JSON.stringify({
                ok: true,
                data: {
                    group_id: groupId,
                    insights: insights,
                    period_days: insightsDays,
                    total_reviews_in_period: recentReviewCount
                }
            }), { status: 200, headers: corsHeaders(origin) });
        }

        // Default: stats
        // Get review stats
        const reviewsRes = await fetch(
            supabaseUrl + '/rest/v1/reviews?group_id=eq.' + encodeURIComponent(groupId) + '&select=rating,created_at&order=created_at.desc&limit=100',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const reviews = await reviewsRes.json();

        // Get recent click analytics if there's a short link
        let linkAnalytics = null;
        const linkRes = await fetch(
            supabaseUrl + '/rest/v1/short_links?long_url=like.*' + encodeURIComponent(groupId) + '*&select=id,code,clicks,created_at&limit=1',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const linkData = await linkRes.json();
        if (linkData && linkData.length) {
            linkAnalytics = {
                code: linkData[0].code,
                total_clicks: linkData[0].clicks || 0,
                short_url: 'https://groupsmix.com/go?code=' + linkData[0].code
            };
        }

        const stats = {
            group: {
                id: group.id,
                name: group.name,
                platform: group.platform,
                category: group.category,
                status: group.status,
                trust_score: group.trust_score || 0,
                views: group.views || 0,
                click_count: group.click_count || 0,
                avg_rating: parseFloat(group.avg_rating) || 0,
                review_count: group.review_count || 0,
                reports: group.reports || 0,
                created_at: group.created_at
            },
            conversion_rate: (group.views > 0 ? ((group.click_count || 0) / group.views * 100).toFixed(1) : '0.0') + '%',
            review_stats: {
                total: (reviews || []).length,
                avg_rating: (reviews || []).length > 0
                    ? ((reviews || []).reduce((s, r) => { return s + (r.rating || 0); }, 0) / reviews.length).toFixed(1)
                    : '0.0',
                recent: (reviews || []).slice(0, 5).map((r) => {
                    return { rating: r.rating, date: r.created_at };
                })
            },
            link_analytics: linkAnalytics,
            embed_code: '<div class="groupsmix-widget" data-group-id="' + group.id + '" data-theme="dark"></div>\n<script src="https://groupsmix.com/embed/widget.js" async></script>',
            share_urls: {
                profile: 'https://groupsmix.com/group?id=' + group.id,
                twitter: 'https://twitter.com/intent/tweet?text=' + encodeURIComponent('Check out ' + group.name + ' on GroupsMix!') + '&url=' + encodeURIComponent('https://groupsmix.com/group?id=' + group.id),
                facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent('https://groupsmix.com/group?id=' + group.id),
                whatsapp: 'https://wa.me/?text=' + encodeURIComponent('Join ' + group.name + ' on GroupsMix: https://groupsmix.com/group?id=' + group.id)
            }
        };

        return new Response(JSON.stringify({ ok: true, data: stats }), {
            status: 200, headers: corsHeaders(origin)
        });

    } catch (err) {
        console.error('group-dashboard error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}
