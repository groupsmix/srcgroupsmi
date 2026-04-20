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

import { corsHeaders as _sharedCorsHeaders, } from './_shared/cors.js';

function corsHeaders(origin) {
    return _sharedCorsHeaders(origin, { 'Content-Type': 'application/json' });
}

function jsonResponse(data, status, origin) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: corsHeaders(origin)
    });
}

async function callRpc(supabaseUrl, supabaseKey, fnName, params) {
    const res = await fetch(supabaseUrl + '/rest/v1/rpc/' + fnName, {
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
        const errText = await res.text();
        console.error('RPC ' + fnName + ' error:', res.status, errText);
        return { error: errText, status: res.status };
    }

    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (_e) {
        return text;
    }
}

async function runTrending(supabaseUrl, supabaseKey, hours) {
    const startTime = Date.now();

    const groupsResult = await callRpc(supabaseUrl, supabaseKey, 'compute_trending_scores_groups', {
        p_hours: hours
    });

    const articlesResult = await callRpc(supabaseUrl, supabaseKey, 'compute_trending_scores_articles', {
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
    const startTime = Date.now();

    const groupsResult = await callRpc(supabaseUrl, supabaseKey, 'compute_collaborative_groups', {
        p_min_co_occurrence: minCoOccurrence
    });

    const articlesResult = await callRpc(supabaseUrl, supabaseKey, 'compute_collaborative_articles', {
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
    const startTime = Date.now();

    const result = await callRpc(supabaseUrl, supabaseKey, 'decay_user_interests', {
        p_decay_factor: decayFactor
    });

    return {
        job: 'decay',
        duration_ms: Date.now() - startTime,
        interests_decayed: typeof result === 'number' ? result : result
    };
}

async function runEmbeddings(supabaseUrl, supabaseKey) {
    const startTime = Date.now();

    // Compute user embedding vectors based on interaction history
    const userResult = await callRpc(supabaseUrl, supabaseKey, 'compute_user_embeddings', {});

    // Compute group embedding vectors based on metadata
    const groupResult = await callRpc(supabaseUrl, supabaseKey, 'compute_group_embeddings', {});

    return {
        job: 'embeddings',
        duration_ms: Date.now() - startTime,
        users_computed: typeof userResult === 'number' ? userResult : userResult,
        groups_computed: typeof groupResult === 'number' ? groupResult : groupResult
    };
}

async function runReEngagement(supabaseUrl, supabaseKey, inactiveDays) {
    const startTime = Date.now();

    // Flag users inactive for N+ days and compute re-engagement scores
    const result = await callRpc(supabaseUrl, supabaseKey, 'compute_re_engagement_scores', {
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
    const startTime = Date.now();

    const impressionsResult = await callRpc(supabaseUrl, supabaseKey, 'cleanup_old_impressions', {
        p_days: 60
    });

    const sessionsResult = await callRpc(supabaseUrl, supabaseKey, 'cleanup_old_sessions', {
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
    const request = context.request;
    const env = context.env;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return jsonResponse({ ok: false, error: 'Service not configured' }, 503, origin);
    }

    // Require CRON_SECRET. Fail closed — previously this was optional which meant
    // anyone who knew the route could trigger expensive recomputation jobs.
    const cronSecret = env?.CRON_SECRET;
    if (!cronSecret) {
        return jsonResponse({ ok: false, error: 'Cron secret not configured' }, 503, origin);
    }
    const providedSecret = request.headers.get('X-Cron-Secret') || '';
    if (providedSecret !== cronSecret) {
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, origin);
    }

    let body;
    try {
        body = await request.json();
    } catch (_e) {
        body = {};
    }

    const job = body.job || 'all';
    const hours = parseInt(body.hours, 10) || 6;
    const minCoOccurrence = parseInt(body.min_co_occurrence, 10) || 2;
    const decayFactor = parseFloat(body.decay_factor) || 0.95;
    const inactiveDays = parseInt(body.inactive_days, 10) || 7;

    try {
        const results = [];
        const totalStart = Date.now();

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
