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
import { errorResponse, successResponse } from './_shared/response.js';
import { requireAuthWithOwnership } from './_shared/auth.js';

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
        return errorResponse('Method not allowed', 405, origin);
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return errorResponse('Service not configured', 503, origin);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return errorResponse('Invalid JSON body', 400, origin);
    }

    const action = body.action || 'subscribe';
    const subscription = body.subscription;
    let uid = body.uid || null;

    // Verify authentication and ownership when uid is provided
    if (uid) {
        const authResult = await requireAuthWithOwnership(request, env, corsHeaders(origin), uid);
        if (authResult instanceof Response) return authResult;
    }

    if (!subscription || !subscription.endpoint) {
        return errorResponse('Push subscription data is required', 422, origin);
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

            return successResponse({ message: 'Unsubscribed from push notifications' }, origin);
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
            return errorResponse('Failed to save subscription', 500, origin);
        }

        return successResponse({ message: 'Subscribed to push notifications' }, origin);

    } catch (err) {
        console.error('push-subscribe error:', err);
        return errorResponse('Internal server error', 500, origin);
    }
}
