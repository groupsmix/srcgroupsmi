/**
 * /api/push-subscribe — Push Notification Subscription Handler
 *
 * Saves push notification subscriptions from the browser to Supabase.
 * Supports subscribe and unsubscribe actions.
 *
 * Environment variables required:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

/* ── Allowed origins for CORS ───────────────────────────────────── */
const ALLOWED_ORIGINS = [
    'https://groupsmix.com',
    'https://www.groupsmix.com'
];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
}

/* ── Main handler ────────────────────────────────────────────────── */
export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
        return new Response(
            JSON.stringify({ ok: false, error: 'Method not allowed' }),
            { status: 405, headers: corsHeaders(origin) }
        );
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Service not configured' }),
            { status: 503, headers: corsHeaders(origin) }
        );
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
            { status: 400, headers: corsHeaders(origin) }
        );
    }

    const action = body.action || 'subscribe';
    const subscription = body.subscription;
    const uid = body.uid || null;

    if (!subscription || !subscription.endpoint) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Push subscription data is required' }),
            { status: 422, headers: corsHeaders(origin) }
        );
    }

    try {
        if (action === 'unsubscribe') {
            // Remove subscription by endpoint
            const res = await fetch(
                supabaseUrl + '/rest/v1/push_subscriptions?endpoint=eq.' + encodeURIComponent(subscription.endpoint),
                {
                    method: 'DELETE',
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    }
                }
            );

            if (!res.ok) {
                console.error('Push unsubscribe error:', res.status);
            }

            return new Response(
                JSON.stringify({ ok: true, message: 'Unsubscribed from push notifications' }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        // Subscribe — upsert by endpoint
        const subscriptionData = {
            uid: uid,
            endpoint: subscription.endpoint,
            keys_p256dh: subscription.keys?.p256dh || '',
            keys_auth: subscription.keys?.auth || '',
            user_agent: request.headers.get('User-Agent') || '',
            status: 'active'
        };

        const res = await fetch(supabaseUrl + '/rest/v1/push_subscriptions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(subscriptionData)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('Push subscribe error:', res.status, errText);
            return new Response(
                JSON.stringify({ ok: false, error: 'Failed to save subscription' }),
                { status: 500, headers: corsHeaders(origin) }
            );
        }

        return new Response(
            JSON.stringify({ ok: true, message: 'Subscribed to push notifications' }),
            { status: 200, headers: corsHeaders(origin) }
        );

    } catch (err) {
        console.error('push-subscribe error:', err);
        return new Response(
            JSON.stringify({ ok: false, error: 'Internal server error' }),
            { status: 500, headers: corsHeaders(origin) }
        );
    }
}
