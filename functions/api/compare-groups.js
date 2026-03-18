/**
 * /api/compare-groups — Group Comparison Tool API
 *
 * GET  /api/compare-groups?ids=uuid1,uuid2,uuid3  — Compare groups side-by-side
 * GET  /api/compare-groups?slug=abc12345           — Load saved comparison
 * POST /api/compare-groups { group_ids: [...], save: true }  — Save comparison & get shareable slug
 *
 * Returns side-by-side data: trust score, members, activity, reviews, etc.
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
        if (request.method === 'GET') {
            return handleGet(request, supabaseUrl, supabaseKey, origin);
        } else if (request.method === 'POST') {
            return handlePost(request, supabaseUrl, supabaseKey, origin);
        }
        return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
            status: 405, headers: corsHeaders(origin)
        });
    } catch (err) {
        console.error('compare-groups error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}

async function handleGet(request, supabaseUrl, supabaseKey, origin) {
    const url = new URL(request.url);
    var groupIds = [];

    // Load from slug
    var slug = url.searchParams.get('slug');
    if (slug) {
        var slugRes = await fetch(supabaseUrl + '/rest/v1/rpc/get_comparison_by_slug', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify({ p_slug: slug })
        });
        if (slugRes.ok) {
            var ids = await slugRes.json();
            if (ids && Array.isArray(ids)) groupIds = ids;
        }
        if (!groupIds.length) {
            return new Response(JSON.stringify({ ok: false, error: 'Comparison not found' }), {
                status: 404, headers: corsHeaders(origin)
            });
        }
    } else {
        // Load from comma-separated ids
        var idsParam = url.searchParams.get('ids') || '';
        groupIds = idsParam.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    }

    if (groupIds.length < 2) {
        return new Response(JSON.stringify({ ok: false, error: 'At least 2 group IDs required' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }
    if (groupIds.length > 5) {
        return new Response(JSON.stringify({ ok: false, error: 'Maximum 5 groups can be compared' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    // Get comparison data via RPC
    var rpcRes = await fetch(supabaseUrl + '/rest/v1/rpc/compare_groups', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': 'Bearer ' + supabaseKey
        },
        body: JSON.stringify({ p_group_ids: groupIds })
    });

    if (!rpcRes.ok) {
        // Fallback: direct query
        var fbRes = await fetch(
            supabaseUrl + '/rest/v1/groups?id=in.(' + groupIds.join(',') + ')&select=*',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        var groups = await fbRes.json();
        return new Response(JSON.stringify({ ok: true, groups: groups || [], source: 'fallback' }), {
            status: 200, headers: corsHeaders(origin)
        });
    }

    var groups = await rpcRes.json();

    // Determine winners for each metric
    var winners = {};
    if (groups && groups.length > 1) {
        var metrics = ['members_count', 'views', 'trust_score', 'avg_rating', 'review_count', 'recent_views'];
        metrics.forEach(function(m) {
            var best = null;
            var bestVal = -1;
            groups.forEach(function(g) {
                var val = parseFloat(g[m]) || 0;
                if (val > bestVal) { bestVal = val; best = g.id; }
            });
            if (best) winners[m] = best;
        });
    }

    return new Response(JSON.stringify({
        ok: true,
        groups: groups || [],
        winners: winners,
        count: (groups || []).length
    }), {
        status: 200, headers: corsHeaders(origin)
    });
}

async function handlePost(request, supabaseUrl, supabaseKey, origin) {
    var body;
    try { body = await request.json(); } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    var groupIds = body.group_ids || [];
    if (groupIds.length < 2 || groupIds.length > 5) {
        return new Response(JSON.stringify({ ok: false, error: '2-5 group IDs required' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    // Save comparison
    var rpcRes = await fetch(supabaseUrl + '/rest/v1/rpc/save_comparison', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': 'Bearer ' + supabaseKey
        },
        body: JSON.stringify({
            p_group_ids: groupIds,
            p_created_by: body.created_by || null
        })
    });

    if (!rpcRes.ok) {
        var errText = await rpcRes.text();
        console.error('save_comparison error:', rpcRes.status, errText);
        return new Response(JSON.stringify({ ok: false, error: 'Failed to save comparison' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }

    var slug = await rpcRes.json();
    return new Response(JSON.stringify({
        ok: true,
        slug: slug,
        share_url: 'https://groupsmix.com/compare?c=' + slug
    }), {
        status: 200, headers: corsHeaders(origin)
    });
}
