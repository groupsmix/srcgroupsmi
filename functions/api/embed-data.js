/**
 * /api/embed-data — Serves group data for embeddable widgets
 *
 * GET /api/embed-data?id=GROUP_ID
 *
 * Returns public group info (name, platform, trust_score, link) for widget rendering.
 * No auth required — public endpoint with CORS for any origin (widgets embed on external sites).
 */

/**
 * Wildcard CORS (`Access-Control-Allow-Origin: *`) is intentional here.
 *
 * This endpoint powers embeddable widgets (`/public/embed.html`) that site
 * owners place on their own domains via `<iframe>` or `<script>` tags.
 * Because widgets run on arbitrary third-party origins we cannot restrict
 * the allowed origin list.  The endpoint is read-only (GET), returns only
 * publicly-visible group metadata, requires no authentication, and exposes
 * no user-specific data — so wildcard CORS carries no additional security
 * risk beyond what the public website already surfaces.
 *
 * See SEC-5 in the audit report for the full rationale.
 */
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
    };
}

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
            status: 405, headers: corsHeaders()
        });
    }

    const url = new URL(request.url);
    const groupId = url.searchParams.get('id');

    if (!groupId) {
        return new Response(JSON.stringify({ ok: false, error: 'Group ID required' }), {
            status: 400, headers: corsHeaders()
        });
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ ok: false, error: 'Service not configured' }), {
            status: 503, headers: corsHeaders()
        });
    }

    try {
        const res = await fetch(
            supabaseUrl + '/rest/v1/groups?id=eq.' + encodeURIComponent(groupId) + '&status=eq.approved&select=id,name,platform,category,country,description,trust_score,link,views,avg_rating,review_count,tags&limit=1',
            {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                }
            }
        );

        if (!res.ok) {
            return new Response(JSON.stringify({ ok: false, error: 'Fetch error' }), {
                status: 500, headers: corsHeaders()
            });
        }

        const groups = await res.json();
        if (!groups || !groups.length) {
            return new Response(JSON.stringify({ ok: false, error: 'Group not found' }), {
                status: 404, headers: corsHeaders()
            });
        }

        return new Response(JSON.stringify({ ok: true, group: groups[0] }), {
            status: 200, headers: corsHeaders()
        });
    } catch (err) {
        console.error('embed-data error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500, headers: corsHeaders()
        });
    }
}
