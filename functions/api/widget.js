/**
 * /api/widget — Serve group data for embeddable widgets + track impressions/clicks
 *
 * GET  /api/widget?group=GROUP_ID          → returns group data
 * POST /api/widget { group, event }        → tracks impression or click
 */

/* ── CORS headers — widgets can be embedded anywhere ──────── */
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
}

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const supabaseUrl = env?.SUPABASE_URL || 'https://hmlqppacanpxmrfdlkec.supabase.co';
    const supabaseKey = env?.SUPABASE_SERVICE_KEY || env?.SUPABASE_ANON_KEY || '';

    if (!supabaseKey) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Service unavailable' }),
            { status: 503, headers: corsHeaders() }
        );
    }

    // GET — fetch group data for widget rendering
    if (request.method === 'GET') {
        const url = new URL(request.url);
        const groupId = url.searchParams.get('group');
        if (!groupId) {
            return new Response(
                JSON.stringify({ ok: false, error: 'Missing group parameter' }),
                { status: 400, headers: corsHeaders() }
            );
        }

        try {
            const res = await fetch(
                supabaseUrl + '/rest/v1/groups?id=eq.' + encodeURIComponent(groupId) + '&status=eq.approved&select=id,name,platform,description,members_count,avg_rating&limit=1',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) {
                return new Response(
                    JSON.stringify({ ok: false, error: 'Group not found' }),
                    { status: 404, headers: corsHeaders() }
                );
            }
            return new Response(
                JSON.stringify({ ok: true, group: data[0] }),
                { status: 200, headers: corsHeaders() }
            );
        } catch (err) {
            return new Response(
                JSON.stringify({ ok: false, error: 'Failed to fetch group' }),
                { status: 500, headers: corsHeaders() }
            );
        }
    }

    // POST — track widget impression or click
    if (request.method === 'POST') {
        let body;
        try {
            body = await request.json();
        } catch {
            return new Response(
                JSON.stringify({ ok: false, error: 'Invalid JSON' }),
                { status: 400, headers: corsHeaders() }
            );
        }

        const { group, event } = body;
        if (!group || !event) {
            return new Response(
                JSON.stringify({ ok: false, error: 'Missing group or event' }),
                { status: 400, headers: corsHeaders() }
            );
        }

        const rpcName = event === 'click' ? 'increment_widget_clicks' : 'increment_widget_impressions';

        try {
            await fetch(supabaseUrl + '/rest/v1/rpc/' + rpcName, {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ p_group_id: group })
            });
            return new Response(
                JSON.stringify({ ok: true }),
                { status: 200, headers: corsHeaders() }
            );
        } catch {
            return new Response(
                JSON.stringify({ ok: false, error: 'Failed to track event' }),
                { status: 500, headers: corsHeaders() }
            );
        }
    }

    return new Response(
        JSON.stringify({ ok: false, error: 'Method not allowed' }),
        { status: 405, headers: corsHeaders() }
    );
}
