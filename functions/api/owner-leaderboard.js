/**
 * /api/owner-leaderboard — Group Owner Leaderboard API
 *
 * GET /api/owner-leaderboard                                  — Top owners by score
 * GET /api/owner-leaderboard?sort=views&limit=20&period=30    — Custom sort/filter
 *
 * Ranks group owners by: total groups, views, clicks, reviews, trust scores.
 * Gamified with scores — owners compete and share rankings.
 */

const ALLOWED_ORIGINS = ['https://groupsmix.com', 'https://www.groupsmix.com'];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
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

    try {
        var url = new URL(request.url);
        var sortBy = url.searchParams.get('sort') || 'score';
        var limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 50);
        var period = url.searchParams.get('period') || 'all';

        // Try RPC first
        var rpcRes = await fetch(supabaseUrl + '/rest/v1/rpc/get_group_owner_leaderboard', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify({
                p_sort_by: sortBy,
                p_limit: limit,
                p_period: period
            })
        });

        if (rpcRes.ok) {
            var leaderboard = await rpcRes.json();
            return new Response(JSON.stringify({
                ok: true,
                leaderboard: leaderboard || [],
                count: (leaderboard || []).length,
                sort_by: sortBy,
                period: period
            }), {
                status: 200, headers: corsHeaders(origin)
            });
        }

        // Fallback: manual query
        var orderCol = 'views';
        if (sortBy === 'groups') orderCol = 'submitted_count';
        else if (sortBy === 'trust') orderCol = 'trust_score';

        var fbRes = await fetch(
            supabaseUrl + '/rest/v1/users?select=id,display_name,photo_url,writer_level,writer_xp,gxp&order=gxp.desc.nullslast&limit=' + limit,
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        var users = await fbRes.json();

        return new Response(JSON.stringify({
            ok: true,
            leaderboard: users || [],
            count: (users || []).length,
            sort_by: sortBy,
            source: 'fallback'
        }), {
            status: 200, headers: corsHeaders(origin)
        });

    } catch (err) {
        console.error('owner-leaderboard error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}
