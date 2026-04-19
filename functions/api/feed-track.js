/**
 * /api/feed-track — Feed Tracking API
 *
 * POST /api/feed-track
 *   action: "impression"   — Record content was shown in feed
 *   action: "click"        — Record user clicked content from feed
 *   action: "interest"     — Track user interest from interaction
 *   action: "session_start"— Start/resume a feed session
 *   action: "session_update"— Update session with shown content IDs
 *   action: "batch_impression" — Record multiple impressions at once
 *
 * This endpoint powers the deduplication filter, interest tracking,
 * and session-aware rotation features.
 */

const ALLOWED_ORIGINS = ['https://groupsmix.com', 'https://www.groupsmix.com'];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    const res = await fetch(supabaseUrl + '/rest/v1/rpc/' + fnName, {
        method: 'POST',
        headers: {
            'apikey': supabaseKey,
            'Authorization': 'Bearer ' + supabaseKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(params)
    });

    if (!res.ok) {
        const errText = await res.text();
        console.error('RPC ' + fnName + ' error:', res.status, errText);
        return { error: errText, status: res.status };
    }

    const text = await res.text();
    if (!text || text === 'null') return { ok: true };

    try {
        return JSON.parse(text);
    } catch (_e) {
        return { ok: true, raw: text };
    }
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

    const supabaseUrl = env?.SUPABASE_URL || 'https://hmlqppacanpxmrfdlkec.supabase.co';
    const supabaseKey = env?.SUPABASE_SERVICE_KEY || env?.SUPABASE_ANON_KEY || '';

    if (!supabaseKey) {
        return jsonResponse({ ok: false, error: 'Server not configured' }, 500, origin);
    }

    let body;
    try {
        body = await request.json();
    } catch (_e) {
        return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, origin);
    }

    const action = body.action;
    const userId = body.user_id;

    if (!action) {
        return jsonResponse({ ok: false, error: 'action required' }, 400, origin);
    }

    if (!userId && action !== 'batch_impression') {
        return jsonResponse({ ok: false, error: 'user_id required' }, 400, origin);
    }

    try {
        // Record a single content impression
        if (action === 'impression') {
            if (!body.content_id || !body.content_type) {
                return jsonResponse({ ok: false, error: 'content_id and content_type required' }, 400, origin);
            }

            const _result = await callRpc(supabaseUrl, supabaseKey, 'record_content_impression', {
                p_user_id: userId,
                p_content_id: body.content_id,
                p_content_type: body.content_type
            });

            return jsonResponse({ ok: true, action: 'impression_recorded' }, 200, origin);
        }

        // Record user clicked content from feed
        if (action === 'click') {
            if (!body.content_id || !body.content_type) {
                return jsonResponse({ ok: false, error: 'content_id and content_type required' }, 400, origin);
            }

            // Record click on impression
            const _clickResult = await callRpc(supabaseUrl, supabaseKey, 'record_impression_click', {
                p_user_id: userId,
                p_content_id: body.content_id,
                p_content_type: body.content_type
            });

            // Also track interest if category is provided
            if (body.category) {
                await callRpc(supabaseUrl, supabaseKey, 'track_user_interest', {
                    p_user_id: userId,
                    p_content_type: body.content_type,
                    p_category: body.category,
                    p_weight_boost: body.weight_boost || 1.0
                });
            }

            return jsonResponse({ ok: true, action: 'click_recorded' }, 200, origin);
        }

        // Track user interest explicitly
        if (action === 'interest') {
            if (!body.content_type || !body.category) {
                return jsonResponse({ ok: false, error: 'content_type and category required' }, 400, origin);
            }

            const _result = await callRpc(supabaseUrl, supabaseKey, 'track_user_interest', {
                p_user_id: userId,
                p_content_type: body.content_type,
                p_category: body.category,
                p_weight_boost: body.weight_boost || 1.0
            });

            return jsonResponse({ ok: true, action: 'interest_tracked' }, 200, origin);
        }

        // Start or resume a feed session
        if (action === 'session_start') {
            if (!body.session_token) {
                return jsonResponse({ ok: false, error: 'session_token required' }, 400, origin);
            }

            const session = await callRpc(supabaseUrl, supabaseKey, 'start_feed_session', {
                p_user_id: userId,
                p_session_token: body.session_token
            });

            // Also get session gap for client-side logic
            const gapHours = await callRpc(supabaseUrl, supabaseKey, 'get_session_gap_hours', {
                p_user_id: userId
            });

            return jsonResponse({
                ok: true,
                action: 'session_started',
                session: session,
                gap_hours: typeof gapHours === 'number' ? gapHours : null,
                show_digest: typeof gapHours === 'number' && gapHours >= 168
            }, 200, origin);
        }

        // Update session with shown content IDs
        if (action === 'session_update') {
            if (!body.session_id || !body.content_ids || !Array.isArray(body.content_ids)) {
                return jsonResponse({ ok: false, error: 'session_id and content_ids[] required' }, 400, origin);
            }

            const _result = await callRpc(supabaseUrl, supabaseKey, 'update_feed_session', {
                p_session_id: body.session_id,
                p_content_ids: body.content_ids
            });

            return jsonResponse({ ok: true, action: 'session_updated' }, 200, origin);
        }

        // Record multiple impressions at once (batch)
        if (action === 'batch_impression') {
            if (!userId || !body.content_ids || !Array.isArray(body.content_ids) || !body.content_type) {
                return jsonResponse({ ok: false, error: 'user_id, content_ids[], and content_type required' }, 400, origin);
            }

            const _result = await callRpc(supabaseUrl, supabaseKey, 'record_batch_impressions', {
                p_user_id: userId,
                p_content_ids: body.content_ids,
                p_content_type: body.content_type
            });

            return jsonResponse({
                ok: true,
                action: 'batch_impressions_recorded',
                count: body.content_ids.length
            }, 200, origin);
        }

        return jsonResponse({ ok: false, error: 'Invalid action. Use: impression, click, interest, session_start, session_update, batch_impression' }, 400, origin);

    } catch (err) {
        console.error('feed-track error:', err);
        return jsonResponse({ ok: false, error: 'Internal error' }, 500, origin);
    }
}
