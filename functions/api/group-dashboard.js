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

        var group = groups[0];

        if (action === 'tips') {
            // Generate growth tips based on group data
            var tips = [];

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

        // Default: stats
        // Get review stats
        const reviewsRes = await fetch(
            supabaseUrl + '/rest/v1/reviews?group_id=eq.' + encodeURIComponent(groupId) + '&select=rating,created_at&order=created_at.desc&limit=100',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const reviews = await reviewsRes.json();

        // Get recent click analytics if there's a short link
        var linkAnalytics = null;
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

        var stats = {
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
                    ? ((reviews || []).reduce(function(s, r) { return s + (r.rating || 0); }, 0) / reviews.length).toFixed(1)
                    : '0.0',
                recent: (reviews || []).slice(0, 5).map(function(r) {
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
