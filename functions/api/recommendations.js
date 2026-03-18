/**
 * /api/recommendations — "Find Groups Like This" API
 *
 * GET /api/recommendations?group_id=X  — Get similar group recommendations
 * GET /api/recommendations?category=X  — Get recommendations by category
 *
 * Uses content-based filtering: matches by category, platform, country, tags.
 * Cross-pollinates groups to increase engagement.
 */

const ALLOWED_ORIGINS = ['https://groupsmix.com', 'https://www.groupsmix.com'];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800'
    };
}

// Calculate similarity score between two groups
function similarityScore(source, candidate) {
    var score = 0;

    // Same category = high match
    if (source.category && candidate.category && source.category === candidate.category) {
        score += 40;
    }

    // Same platform = moderate match
    if (source.platform && candidate.platform && source.platform === candidate.platform) {
        score += 15;
    }

    // Same country = moderate match
    if (source.country && candidate.country && source.country === candidate.country) {
        score += 15;
    }

    // Tag overlap
    var sourceTags = (source.tags || []).map(function(t) { return (t || '').toLowerCase(); });
    var candidateTags = (candidate.tags || []).map(function(t) { return (t || '').toLowerCase(); });
    var tagOverlap = sourceTags.filter(function(t) { return candidateTags.includes(t); }).length;
    score += Math.min(20, tagOverlap * 10);

    // Trust score bonus (prefer higher trust)
    score += Math.min(10, Math.floor((candidate.trust_score || 0) / 10));

    return score;
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
    const category = url.searchParams.get('category');
    const limit = parseInt(url.searchParams.get('limit')) || 6;

    try {
        if (groupId) {
            // Get the source group
            const sourceRes = await fetch(
                supabaseUrl + '/rest/v1/groups?id=eq.' + encodeURIComponent(groupId) + '&status=eq.approved&select=id,name,platform,category,country,tags,trust_score&limit=1',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const sourceGroups = await sourceRes.json();
            if (!sourceGroups || !sourceGroups.length) {
                return new Response(JSON.stringify({ ok: false, error: 'Group not found' }), {
                    status: 404, headers: corsHeaders(origin)
                });
            }
            var source = sourceGroups[0];

            // Get candidate groups (same category or platform, excluding the source)
            var queryParams = 'status=eq.approved&id=neq.' + encodeURIComponent(groupId);
            if (source.category) {
                queryParams += '&or=(category.eq.' + encodeURIComponent(source.category) + ',platform.eq.' + encodeURIComponent(source.platform || '') + ')';
            }
            queryParams += '&select=id,name,platform,category,country,description,trust_score,views,avg_rating,review_count,tags,link&order=trust_score.desc&limit=50';

            const candidatesRes = await fetch(
                supabaseUrl + '/rest/v1/groups?' + queryParams,
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const candidates = await candidatesRes.json();

            // Score and rank candidates
            var scored = (candidates || []).map(function(c) {
                c._score = similarityScore(source, c);
                return c;
            }).filter(function(c) {
                return c._score > 20;
            }).sort(function(a, b) {
                return b._score - a._score;
            }).slice(0, limit);

            // Remove internal score
            scored.forEach(function(c) { delete c._score; });

            return new Response(JSON.stringify({
                ok: true,
                source_group: { id: source.id, name: source.name, category: source.category },
                recommendations: scored,
                message: scored.length > 0
                    ? 'People who joined ' + source.name + ' also liked these groups'
                    : 'No similar groups found yet'
            }), { status: 200, headers: corsHeaders(origin) });
        }

        if (category) {
            // Category-based recommendations
            const res = await fetch(
                supabaseUrl + '/rest/v1/groups?status=eq.approved&category=eq.' + encodeURIComponent(category) + '&select=id,name,platform,category,country,description,trust_score,views,avg_rating,review_count,tags,link&order=trust_score.desc&limit=' + limit,
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const groups = await res.json();

            return new Response(JSON.stringify({
                ok: true,
                category: category,
                recommendations: groups || []
            }), { status: 200, headers: corsHeaders(origin) });
        }

        return new Response(JSON.stringify({ ok: false, error: 'group_id or category parameter required' }), {
            status: 400, headers: corsHeaders(origin)
        });

    } catch (err) {
        console.error('recommendations error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}
