/**
 * /api/group-of-day — Group of the Day / Trending Groups API
 *
 * GET /api/group-of-day                — Get today's featured group
 * GET /api/group-of-day?action=trending — Get trending groups
 *
 * The "Group of the Day" rotates daily based on a deterministic hash of the date,
 * selecting from highly-rated, approved groups. Trending is based on recent views/clicks.
 */

const ALLOWED_ORIGINS = ['https://groupsmix.com', 'https://www.groupsmix.com'];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
    };
}

// Simple deterministic hash for daily rotation
function dayHash(dateStr) {
    var hash = 0;
    for (var i = 0; i < dateStr.length; i++) {
        hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash);
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
    const action = url.searchParams.get('action') || 'daily';

    try {
        if (action === 'trending') {
            // Trending: groups with most views in last 7 days, sorted by a trending score
            const res = await fetch(
                supabaseUrl + '/rest/v1/groups?status=eq.approved&select=id,name,platform,category,country,description,trust_score,views,click_count,avg_rating,review_count,tags,link,created_at&order=views.desc&limit=20',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const groups = await res.json();

            // Calculate trending score (recency + engagement)
            var now = Date.now();
            var trending = (groups || []).map(function(g) {
                var ageHours = (now - new Date(g.created_at).getTime()) / 3600000;
                var recencyBoost = Math.max(0, 100 - ageHours * 0.1);
                var engagementScore = (g.views || 0) * 0.3 + (g.click_count || 0) * 2 + (g.avg_rating || 0) * 10 + (g.review_count || 0) * 5;
                g._trendingScore = engagementScore + recencyBoost;
                return g;
            }).sort(function(a, b) { return b._trendingScore - a._trendingScore; }).slice(0, 10);

            // Remove internal score
            trending.forEach(function(g) { delete g._trendingScore; });

            return new Response(JSON.stringify({ ok: true, trending: trending }), {
                status: 200, headers: corsHeaders(origin)
            });
        }

        // Daily: Group of the Day
        // Get top-rated approved groups as candidates
        const res = await fetch(
            supabaseUrl + '/rest/v1/groups?status=eq.approved&trust_score=gte.30&select=id,name,platform,category,country,description,trust_score,views,click_count,avg_rating,review_count,tags,link&order=trust_score.desc&limit=100',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const candidates = await res.json();

        if (!candidates || !candidates.length) {
            return new Response(JSON.stringify({ ok: true, group: null, message: 'No eligible groups' }), {
                status: 200, headers: corsHeaders(origin)
            });
        }

        // Pick today's group deterministically
        var today = new Date().toISOString().split('T')[0];
        var index = dayHash(today) % candidates.length;
        var groupOfDay = candidates[index];

        return new Response(JSON.stringify({
            ok: true,
            group: groupOfDay,
            date: today,
            label: 'Group of the Day'
        }), { status: 200, headers: corsHeaders(origin) });

    } catch (err) {
        console.error('group-of-day error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}
