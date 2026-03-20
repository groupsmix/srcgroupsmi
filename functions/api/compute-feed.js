/**
 * /api/compute-feed — Feed Algorithm Compute Jobs
 *
 * POST /api/compute-feed
 *   job: "trending"       — Recompute trending/velocity scores with exponential decay
 *   job: "collaborative"  — Recompute collaborative filtering matrix
 *   job: "decay"          — Decay old interest weights
 *   job: "embeddings"     — Compute/update user embedding vectors
 *   job: "re-engagement"  — Score inactive users for re-engagement targeting
 *   job: "cleanup"        — Clean up old impressions & sessions
 *   job: "all"            — Run all jobs sequentially
 *
 * Designed to be called by a cron scheduler (e.g., Cloudflare Cron Triggers,
 * external cron service, or admin dashboard).
 *
 * Recommended schedule:
 *   - trending: every 1-2 hours
 *   - collaborative: nightly (once per day)
 *   - embeddings: nightly (once per day)
 *   - re-engagement: daily
 *   - decay: nightly
 *   - cleanup: weekly
 */

var ALLOWED_ORIGINS = ['https://groupsmix.com', 'https://www.groupsmix.com'];

function corsHeaders(origin) {
    var allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cron-Secret',
        'Content-Type': 'application/json'
    };
}

function jsonResponse(data, status, origin) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: corsHeaders(origin)
    });
}

async function callRpc(supabaseUrl, supabaseKey, fnName, params) {
    var res = await fetch(supabaseUrl + '/rest/v1/rpc/' + fnName, {
        method: 'POST',
        headers: {
            'apikey': supabaseKey,
            'Authorization': 'Bearer ' + supabaseKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(params || {})
    });

    if (!res.ok) {
        var errText = await res.text();
        console.error('RPC ' + fnName + ' error:', res.status, errText);
        return { error: errText, status: res.status };
    }

    var text = await res.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        return text;
    }
}

async function runTrending(supabaseUrl, supabaseKey, hours) {
    var startTime = Date.now();

    var groupsResult = await callRpc(supabaseUrl, supabaseKey, 'compute_trending_scores_groups', {
        p_hours: hours
    });

    var articlesResult = await callRpc(supabaseUrl, supabaseKey, 'compute_trending_scores_articles', {
        p_hours: hours
    });

    return {
        job: 'trending',
        duration_ms: Date.now() - startTime,
        groups_updated: typeof groupsResult === 'number' ? groupsResult : groupsResult,
        articles_updated: typeof articlesResult === 'number' ? articlesResult : articlesResult,
        window_hours: hours
    };
}

async function runCollaborative(supabaseUrl, supabaseKey, minCoOccurrence) {
    var startTime = Date.now();

    var groupsResult = await callRpc(supabaseUrl, supabaseKey, 'compute_collaborative_groups', {
        p_min_co_occurrence: minCoOccurrence
    });

    var articlesResult = await callRpc(supabaseUrl, supabaseKey, 'compute_collaborative_articles', {
        p_min_co_occurrence: minCoOccurrence
    });

    return {
        job: 'collaborative',
        duration_ms: Date.now() - startTime,
        group_pairs: typeof groupsResult === 'number' ? groupsResult : groupsResult,
        article_pairs: typeof articlesResult === 'number' ? articlesResult : articlesResult,
        min_co_occurrence: minCoOccurrence
    };
}

async function runDecay(supabaseUrl, supabaseKey, decayFactor) {
    var startTime = Date.now();

    var result = await callRpc(supabaseUrl, supabaseKey, 'decay_user_interests', {
        p_decay_factor: decayFactor
    });

    return {
        job: 'decay',
        duration_ms: Date.now() - startTime,
        interests_decayed: typeof result === 'number' ? result : result
    };
}

async function runEmbeddings(supabaseUrl, supabaseKey) {
    var startTime = Date.now();

    // Compute user embedding vectors based on interaction history
    var userResult = await callRpc(supabaseUrl, supabaseKey, 'compute_user_embeddings', {});

    // Compute group embedding vectors based on metadata
    var groupResult = await callRpc(supabaseUrl, supabaseKey, 'compute_group_embeddings', {});

    return {
        job: 'embeddings',
        duration_ms: Date.now() - startTime,
        users_computed: typeof userResult === 'number' ? userResult : userResult,
        groups_computed: typeof groupResult === 'number' ? groupResult : groupResult
    };
}

async function runReEngagement(supabaseUrl, supabaseKey, inactiveDays) {
    var startTime = Date.now();

    // Flag users inactive for N+ days and compute re-engagement scores
    var result = await callRpc(supabaseUrl, supabaseKey, 'compute_re_engagement_scores', {
        p_inactive_days: inactiveDays || 7
    });

    return {
        job: 're-engagement',
        duration_ms: Date.now() - startTime,
        users_scored: typeof result === 'number' ? result : result,
        inactive_threshold_days: inactiveDays || 7
    };
}

async function runCleanup(supabaseUrl, supabaseKey) {
    var startTime = Date.now();

    var impressionsResult = await callRpc(supabaseUrl, supabaseKey, 'cleanup_old_impressions', {
        p_days: 60
    });

    var sessionsResult = await callRpc(supabaseUrl, supabaseKey, 'cleanup_old_sessions', {
        p_days: 30
    });

    return {
        job: 'cleanup',
        duration_ms: Date.now() - startTime,
        impressions_cleaned: typeof impressionsResult === 'number' ? impressionsResult : impressionsResult,
        sessions_cleaned: typeof sessionsResult === 'number' ? sessionsResult : sessionsResult
    };
}

export async function onRequest(context) {
    var request = context.request;
    var env = context.env;
    var origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
    }

    var supabaseUrl = env?.SUPABASE_URL || 'https://hmlqppacanpxmrfdlkec.supabase.co';
    var supabaseKey = env?.SUPABASE_SERVICE_KEY || env?.SUPABASE_ANON_KEY || '';

    if (!supabaseKey) {
        return jsonResponse({ ok: false, error: 'Server not configured' }, 500, origin);
    }

    // Optional: verify cron secret for security
    var cronSecret = env?.CRON_SECRET;
    if (cronSecret) {
        var providedSecret = request.headers.get('X-Cron-Secret') || '';
        if (providedSecret !== cronSecret) {
            return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, origin);
        }
    }

    var body;
    try {
        body = await request.json();
    } catch (e) {
        body = {};
    }

    var job = body.job || 'all';
    var hours = parseInt(body.hours) || 6;
    var minCoOccurrence = parseInt(body.min_co_occurrence) || 2;
    var decayFactor = parseFloat(body.decay_factor) || 0.95;
    var inactiveDays = parseInt(body.inactive_days) || 7;

    try {
        var results = [];
        var totalStart = Date.now();

        if (job === 'trending' || job === 'all') {
            results.push(await runTrending(supabaseUrl, supabaseKey, hours));
        }

        if (job === 'collaborative' || job === 'all') {
            results.push(await runCollaborative(supabaseUrl, supabaseKey, minCoOccurrence));
        }

        if (job === 'embeddings' || job === 'all') {
            results.push(await runEmbeddings(supabaseUrl, supabaseKey));
        }

        if (job === 're-engagement' || job === 'all') {
            results.push(await runReEngagement(supabaseUrl, supabaseKey, inactiveDays));
        }

        if (job === 'decay' || job === 'all') {
            results.push(await runDecay(supabaseUrl, supabaseKey, decayFactor));
        }

        if (job === 'cleanup' || job === 'all') {
            results.push(await runCleanup(supabaseUrl, supabaseKey));
        }

        if (results.length === 0) {
            return jsonResponse({
                ok: false,
                error: 'Invalid job. Use: trending, collaborative, embeddings, re-engagement, decay, cleanup, all'
            }, 400, origin);
        }

        return jsonResponse({
            ok: true,
            total_duration_ms: Date.now() - totalStart,
            jobs_run: results.length,
            results: results
        }, 200, origin);

    } catch (err) {
        console.error('compute-feed error:', err);
        return jsonResponse({ ok: false, error: 'Internal error' }, 500, origin);
    }
}
