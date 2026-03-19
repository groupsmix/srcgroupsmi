/**
 * /api/gxp-rewards — Award GXP (Writer XP) for various events
 *
 * Called by the frontend or other API endpoints to award XP when
 * a user performs an action (publish article, receive like, etc.)
 *
 * POST /api/gxp-rewards
 * Body: { action, user_id?, article_id?, metadata? }
 *
 * Actions: publish_article, receive_like, receive_comment, article_trending,
 *          new_follower, send_tip, receive_tip, daily_login
 *
 * Environment variables:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

/* ── XP Reward amounts ─────────────────────────────────────── */
const XP_REWARDS = {
    publish_article: 10,
    receive_like: 2,
    receive_comment: 3,
    article_trending: 20,
    new_follower: 5,
    send_tip: 1,
    receive_tip: 2,
    daily_login: 1
};

/* ── Allowed actions (whitelist) ───────────────────────────── */
const ALLOWED_ACTIONS = Object.keys(XP_REWARDS);

/* ── CORS headers ──────────────────────────────────────────── */
function corsHeaders(origin) {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin || 'https://groupsmix.com',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
}

/* ── Main handler ──────────────────────────────────────────── */
export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || 'https://groupsmix.com';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Only accept POST
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
            status: 405, headers: corsHeaders(origin)
        });
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ ok: false, error: 'Server configuration error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }

    // Verify auth
    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401, headers: corsHeaders(origin)
        });
    }

    // Verify the JWT token with Supabase
    const token = authHeader.replace('Bearer ', '');
    let callerAuthId = null;
    try {
        const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
            headers: {
                'Authorization': 'Bearer ' + token,
                'apikey': supabaseKey
            }
        });
        if (!userRes.ok) {
            return new Response(JSON.stringify({ ok: false, error: 'Invalid token' }), {
                status: 401, headers: corsHeaders(origin)
            });
        }
        const userData = await userRes.json();
        callerAuthId = userData.id;
    } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: 'Auth verification failed' }), {
            status: 401, headers: corsHeaders(origin)
        });
    }

    // Parse body
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    const { action, user_id, article_id, metadata } = body;

    // Validate action
    if (!action || !ALLOWED_ACTIONS.includes(action)) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid action: ' + action }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    // Determine target user
    // For "receive" actions, user_id is the recipient (different from caller)
    // For "self" actions (publish, send_tip, daily_login), the caller IS the user
    let targetUserId = user_id || null;

    // Look up the internal user ID for the caller
    try {
        const callerRes = await fetch(
            supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(callerAuthId) + '&select=id,role&limit=1',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const callers = await callerRes.json();
        if (!callers || !callers.length) {
            return new Response(JSON.stringify({ ok: false, error: 'User not found' }), {
                status: 404, headers: corsHeaders(origin)
            });
        }

        const callerInternalId = callers[0].id;
        const callerRole = callers[0].role;

        // Self-actions use the caller's ID
        const selfActions = ['publish_article', 'send_tip', 'daily_login'];
        if (selfActions.includes(action)) {
            targetUserId = callerInternalId;
        }

        // For "receive" actions, an admin/system can specify any user,
        // but a regular user can only award XP to themselves for self-actions
        if (!targetUserId) {
            return new Response(JSON.stringify({ ok: false, error: 'user_id is required for this action' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        // Prevent users from awarding XP to themselves for "receive" actions
        const receiveActions = ['receive_like', 'receive_comment', 'new_follower', 'receive_tip', 'article_trending'];
        if (receiveActions.includes(action) && targetUserId === callerInternalId && callerRole !== 'admin') {
            return new Response(JSON.stringify({ ok: false, error: 'Cannot award XP to yourself for this action' }), {
                status: 403, headers: corsHeaders(origin)
            });
        }

        // Rate limiting: daily_login only once per day
        if (action === 'daily_login') {
            const today = new Date().toISOString().slice(0, 10);
            const checkRes = await fetch(
                supabaseUrl + '/rest/v1/wallet_transactions?user_id=eq.' + encodeURIComponent(targetUserId) +
                '&type=eq.reward&description=like.%25daily_login%25&created_at=gte.' + today + 'T00:00:00Z&limit=1',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const existing = await checkRes.json();
            if (existing && existing.length > 0) {
                return new Response(JSON.stringify({ ok: true, message: 'Daily login XP already awarded today', xp: 0 }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }
        }

        // Award the XP via RPC
        const xpAmount = XP_REWARDS[action] || 0;
        if (xpAmount <= 0) {
            return new Response(JSON.stringify({ ok: true, xp: 0 }), {
                status: 200, headers: corsHeaders(origin)
            });
        }

        const rpcRes = await fetch(supabaseUrl + '/rest/v1/rpc/award_writer_xp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify({
                p_user_id: targetUserId,
                p_xp: xpAmount,
                p_reason: action,
                p_article_id: article_id || null
            })
        });

        if (!rpcRes.ok) {
            const errText = await rpcRes.text();
            console.error('award_writer_xp RPC error:', rpcRes.status, errText);
            return new Response(JSON.stringify({ ok: false, error: 'Failed to award XP' }), {
                status: 500, headers: corsHeaders(origin)
            });
        }

        // Also check for new badges
        try {
            await fetch(supabaseUrl + '/rest/v1/rpc/check_writer_badges', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                },
                body: JSON.stringify({ p_user_id: targetUserId })
            });
        } catch (badgeErr) {
            console.error('check_writer_badges error (non-fatal):', badgeErr);
        }

        return new Response(JSON.stringify({
            ok: true,
            action: action,
            xp_awarded: xpAmount,
            user_id: targetUserId
        }), {
            status: 200, headers: corsHeaders(origin)
        });

    } catch (err) {
        console.error('gxp-rewards error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal server error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}
