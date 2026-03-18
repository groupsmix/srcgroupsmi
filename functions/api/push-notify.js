/**
 * /api/push-notify — Push Notification Sender API
 *
 * POST /api/push-notify { type, title, body, url, ... }
 *
 * Notification types:
 *   - "new_group"     — "New group in your favorite category"
 *   - "group_views"   — "Your group got 50 new views"
 *   - "tips_received" — "Someone tipped your article"
 *   - "trending"      — "Trending groups this week"
 *   - "custom"        — Admin custom push to all subscribers
 *
 * Also:
 *   GET /api/push-notify?user_id=X  — Get notification preferences
 *   POST { action: "update_prefs", user_id, prefs: {...} }  — Update preferences
 *
 * Environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (for web push)
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
            var url = new URL(request.url);
            var userId = url.searchParams.get('user_id');
            if (!userId) {
                return new Response(JSON.stringify({ ok: false, error: 'user_id required' }), {
                    status: 400, headers: corsHeaders(origin)
                });
            }

            var prefsRes = await fetch(supabaseUrl + '/rest/v1/rpc/get_notification_preferences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                },
                body: JSON.stringify({ p_user_id: userId })
            });
            var prefs = prefsRes.ok ? await prefsRes.json() : {};
            return new Response(JSON.stringify({ ok: true, preferences: prefs }), {
                status: 200, headers: corsHeaders(origin)
            });
        }

        // POST
        var body;
        try { body = await request.json(); } catch (e) {
            return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        // Update preferences
        if (body.action === 'update_prefs') {
            if (!body.user_id || !body.prefs) {
                return new Response(JSON.stringify({ ok: false, error: 'user_id and prefs required' }), {
                    status: 400, headers: corsHeaders(origin)
                });
            }

            var updateRes = await fetch(supabaseUrl + '/rest/v1/rpc/update_notification_preferences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                },
                body: JSON.stringify({
                    p_user_id: body.user_id,
                    p_prefs: body.prefs
                })
            });

            return new Response(JSON.stringify({
                ok: updateRes.ok,
                message: updateRes.ok ? 'Preferences updated' : 'Failed to update'
            }), {
                status: updateRes.ok ? 200 : 500,
                headers: corsHeaders(origin)
            });
        }

        // Send notification
        var notifType = body.type || 'custom';
        var title = body.title || 'GroupsMix';
        var notifBody = body.body || '';
        var notifUrl = body.url || 'https://groupsmix.com';
        var targetUserId = body.user_id || null;
        var limit = Math.min(parseInt(body.limit) || 100, 500);

        // Get push targets
        var targets = [];
        if (targetUserId) {
            // Single user notification
            var singleRes = await fetch(
                supabaseUrl + '/rest/v1/push_subscriptions?uid=eq.' + encodeURIComponent(targetUserId) + '&status=eq.active&select=endpoint,keys_p256dh,keys_auth&limit=5',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            targets = singleRes.ok ? await singleRes.json() : [];
        } else {
            // Broadcast by notification type
            var targetRes = await fetch(supabaseUrl + '/rest/v1/rpc/get_push_targets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                },
                body: JSON.stringify({ p_notification_type: notifType, p_limit: limit })
            });
            targets = targetRes.ok ? await targetRes.json() : [];
        }

        if (!targets || !targets.length) {
            return new Response(JSON.stringify({
                ok: true,
                message: 'No push targets found',
                sent: 0
            }), { status: 200, headers: corsHeaders(origin) });
        }

        // Build push payload
        var payload = JSON.stringify({
            title: title,
            body: notifBody,
            icon: '/assets/icons/icon-192.png',
            badge: '/assets/icons/badge-72.png',
            url: notifUrl,
            timestamp: Date.now()
        });

        // Note: Actual web push sending requires VAPID keys and the web-push library.
        // This endpoint prepares the payload and targets. In production, integrate with
        // a web push service or use the Web Push API with VAPID credentials.
        //
        // For now, we store the notification intent so it can be processed by a worker.
        var notifLog = {
            type: notifType,
            title: title,
            body: notifBody,
            url: notifUrl,
            targets_count: targets.length,
            payload: payload,
            created_at: new Date().toISOString()
        };

        // Store in notifications table for each target user
        var stored = 0;
        for (var i = 0; i < Math.min(targets.length, 100); i++) {
            var t = targets[i];
            if (t.user_id) {
                try {
                    await fetch(supabaseUrl + '/rest/v1/notifications', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': supabaseKey,
                            'Authorization': 'Bearer ' + supabaseKey,
                            'Prefer': 'resolution=merge-duplicates'
                        },
                        body: JSON.stringify({
                            uid: t.user_id,
                            type: notifType,
                            title: title,
                            message: notifBody,
                            link: notifUrl
                        })
                    });
                    stored++;
                } catch (e) { /* continue */ }
            }
        }

        return new Response(JSON.stringify({
            ok: true,
            type: notifType,
            targets_found: targets.length,
            notifications_stored: stored,
            message: 'Push notification queued for ' + targets.length + ' targets'
        }), {
            status: 200, headers: corsHeaders(origin)
        });

    } catch (err) {
        console.error('push-notify error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}
