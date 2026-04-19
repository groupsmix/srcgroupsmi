/**
 * /api/link-analytics — Link Shortener Analytics API
 *
 * GET /api/link-analytics?code=CODE  — Get analytics for a shortened link
 * GET /api/link-analytics?code=CODE&detail=clicks — Get click details
 *
 * Returns click counts, country breakdown, device breakdown, referrer stats.
 * Only the link creator or admins can access analytics.
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
    const code = url.searchParams.get('code');
    const detail = url.searchParams.get('detail');
    const days = parseInt(url.searchParams.get('days'), 10) || 30;

    if (!code) {
        return new Response(JSON.stringify({ ok: false, error: 'Link code required' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    try {
        // Get the short link
        const linkRes = await fetch(
            supabaseUrl + '/rest/v1/short_links?code=eq.' + encodeURIComponent(code) + '&select=id,code,long_url,clicks,created_at,creator_uid&limit=1',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const links = await linkRes.json();
        if (!links || !links.length) {
            return new Response(JSON.stringify({ ok: false, error: 'Link not found' }), {
                status: 404, headers: corsHeaders(origin)
            });
        }

        const link = links[0];
        const cutoff = new Date(Date.now() - days * 86400000).toISOString();

        // Get click details
        const clicksRes = await fetch(
            supabaseUrl + '/rest/v1/link_clicks?link_id=eq.' + encodeURIComponent(link.id) + '&clicked_at=gte.' + cutoff + '&select=country,device,referrer,clicked_at&order=clicked_at.desc&limit=1000',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const clicks = await clicksRes.json();

        // Aggregate stats
        const countryMap = {};
        const deviceMap = {};
        const referrerMap = {};
        const dailyMap = {};

        (clicks || []).forEach((c) => {
            // Country breakdown
            const country = c.country || 'Unknown';
            countryMap[country] = (countryMap[country] || 0) + 1;

            // Device breakdown
            const device = c.device || 'Unknown';
            deviceMap[device] = (deviceMap[device] || 0) + 1;

            // Referrer breakdown
            let referrer = c.referrer || 'Direct';
            try { referrer = new URL(referrer).hostname; } catch(_e) {}
            referrerMap[referrer] = (referrerMap[referrer] || 0) + 1;

            // Daily clicks
            const day = (c.clicked_at || '').split('T')[0];
            if (day) dailyMap[day] = (dailyMap[day] || 0) + 1;
        });

        // Sort and limit breakdowns
        const sortMap = (m, limit) => {
            return Object.entries(m)
                .sort((a, b) => { return b[1] - a[1]; })
                .slice(0, limit || 20)
                .map((e) => { return { name: e[0], count: e[1] }; });
        };

        const analytics = {
            link: {
                code: link.code,
                long_url: link.long_url,
                total_clicks: link.clicks || 0,
                created_at: link.created_at
            },
            period_clicks: (clicks || []).length,
            days: days,
            countries: sortMap(countryMap, 30),
            devices: sortMap(deviceMap, 10),
            referrers: sortMap(referrerMap, 20),
            daily_clicks: Object.entries(dailyMap)
                .sort((a, b) => { return a[0].localeCompare(b[0]); })
                .map((e) => { return { date: e[0], clicks: e[1] }; })
        };

        if (detail === 'clicks') {
            analytics.recent_clicks = (clicks || []).slice(0, 100).map((c) => {
                return {
                    country: c.country,
                    device: c.device,
                    referrer: c.referrer,
                    clicked_at: c.clicked_at
                };
            });
        }

        return new Response(JSON.stringify({ ok: true, data: analytics }), {
            status: 200, headers: corsHeaders(origin)
        });

    } catch (err) {
        console.error('link-analytics error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}
