/**
 * /api/group-health — Group Health Dashboard API
 *
 * GET /api/group-health?group_id=X                    — Full health report
 * GET /api/group-health?group_id=X&action=history     — Trust score history
 * GET /api/group-health?group_id=X&action=rank        — Rank vs similar groups
 * POST /api/group-health { action: "snapshot" }       — Trigger daily snapshot (cron)
 *
 * Shows group owners: growth trends, trust score history, category rank, tips.
 */

const ALLOWED_ORIGINS = ['https://groupsmix.com', 'https://www.groupsmix.com'];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

    const supabaseUrl = env?.SUPABASE_URL || 'https://hmlqppacanpxmrfdlkec.supabase.co';
    const supabaseKey = env?.SUPABASE_SERVICE_KEY || env?.SUPABASE_ANON_KEY || '';

    if (!supabaseKey) {
        return new Response(JSON.stringify({ ok: false, error: 'Server not configured' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }

    try {
        if (request.method === 'POST') {
            var body;
            try { body = await request.json(); } catch (e) {
                return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
                    status: 400, headers: corsHeaders(origin)
                });
            }

            if (body.action === 'snapshot') {
                var snapRes = await fetch(supabaseUrl + '/rest/v1/rpc/snapshot_group_health', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: '{}'
                });
                var count = snapRes.ok ? await snapRes.json() : 0;
                return new Response(JSON.stringify({ ok: true, groups_snapshotted: count }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        // GET
        var url = new URL(request.url);
        var groupId = url.searchParams.get('group_id');
        var action = url.searchParams.get('action') || 'full';
        var days = parseInt(url.searchParams.get('days')) || 30;

        if (!groupId) {
            return new Response(JSON.stringify({ ok: false, error: 'group_id required' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        if (action === 'history') {
            var histRes = await fetch(supabaseUrl + '/rest/v1/rpc/get_group_health_history', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                },
                body: JSON.stringify({ p_group_id: groupId, p_days: days })
            });
            var history = histRes.ok ? await histRes.json() : [];
            return new Response(JSON.stringify({ ok: true, history: history }), {
                status: 200, headers: corsHeaders(origin)
            });
        }

        if (action === 'rank') {
            var rankRes = await fetch(supabaseUrl + '/rest/v1/rpc/get_group_rank', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                },
                body: JSON.stringify({ p_group_id: groupId })
            });
            var rank = rankRes.ok ? await rankRes.json() : null;
            return new Response(JSON.stringify({ ok: true, rank: rank }), {
                status: 200, headers: corsHeaders(origin)
            });
        }

        // Full health report: group data + history + rank + tips
        var groupRes = await fetch(
            supabaseUrl + '/rest/v1/groups?id=eq.' + encodeURIComponent(groupId) + '&select=*&limit=1',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        var groups = await groupRes.json();
        if (!groups || !groups.length) {
            return new Response(JSON.stringify({ ok: false, error: 'Group not found' }), {
                status: 404, headers: corsHeaders(origin)
            });
        }
        var group = groups[0];

        // Fetch history and rank in parallel
        var [histRes2, rankRes2, verifiedRes] = await Promise.all([
            fetch(supabaseUrl + '/rest/v1/rpc/get_group_health_history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                body: JSON.stringify({ p_group_id: groupId, p_days: days })
            }),
            fetch(supabaseUrl + '/rest/v1/rpc/get_group_rank', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                body: JSON.stringify({ p_group_id: groupId })
            }),
            fetch(supabaseUrl + '/rest/v1/rpc/is_group_verified', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                body: JSON.stringify({ p_group_id: groupId })
            })
        ]);

        var history2 = histRes2.ok ? await histRes2.json() : [];
        var rank2 = rankRes2.ok ? await rankRes2.json() : null;
        var isVerified = verifiedRes.ok ? await verifiedRes.json() : false;

        // Calculate trends from history
        var trends = {};
        if (history2 && history2.length >= 2) {
            var first = history2[0];
            var last = history2[history2.length - 1];
            trends = {
                trust_score_change: (last.trust_score || 0) - (first.trust_score || 0),
                views_gained: (last.views_total || 0) - (first.views_total || 0),
                clicks_gained: (last.clicks_total || 0) - (first.clicks_total || 0),
                reviews_gained: (last.review_count || 0) - (first.review_count || 0),
                members_gained: (last.members_count || 0) - (first.members_count || 0),
                period_days: history2.length
            };
        }

        // Generate health score (0-100)
        var healthScore = 0;
        healthScore += Math.min((group.trust_score || 0), 30); // Trust up to 30
        healthScore += Math.min((group.review_count || 0) * 5, 20); // Reviews up to 20
        healthScore += group.description && group.description.length > 100 ? 10 : 0;
        healthScore += (group.tags && group.tags.length > 0) ? 10 : 0;
        healthScore += (group.views || 0) > 100 ? 10 : ((group.views || 0) > 10 ? 5 : 0);
        healthScore += isVerified ? 10 : 0;
        healthScore += (trends.views_gained || 0) > 0 ? 10 : 0;
        healthScore = Math.min(healthScore, 100);

        return new Response(JSON.stringify({
            ok: true,
            group: {
                id: group.id,
                name: group.name,
                platform: group.platform,
                category: group.category,
                status: group.status,
                trust_score: group.trust_score || 0,
                views: group.views || 0,
                clicks: group.click_count || 0,
                members_count: group.members_count || 0,
                avg_rating: parseFloat(group.avg_rating) || 0,
                review_count: group.review_count || 0,
                created_at: group.created_at
            },
            health_score: healthScore,
            is_verified: isVerified,
            trends: trends,
            history: history2,
            rank: rank2,
            period_days: days
        }), {
            status: 200, headers: corsHeaders(origin)
        });

    } catch (err) {
        console.error('group-health error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}
