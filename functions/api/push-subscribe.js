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

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';
import { requireAuth } from './_shared/auth.js';

function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

/* ── Main handler ────────────────────────────────────────────────── */
export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
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
    let uid = body.uid || null;

    // Verify authentication and ownership when uid is provided
    if (uid) {
        const authResult = await requireAuth(request, env, corsHeaders(origin));
        if (authResult instanceof Response) return authResult;
        const profileRes = await fetch(
            supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(authResult.user.id) + '&select=id&limit=1',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const profiles = await profileRes.json();
        if (!profiles || !profiles.length || profiles[0].id !== uid) {
            return new Response(
                JSON.stringify({ ok: false, error: 'Forbidden: user_id mismatch' }),
                { status: 403, headers: corsHeaders(origin) }
            );
        }
    }

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
