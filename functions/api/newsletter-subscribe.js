/**
 * /api/newsletter-subscribe — Newsletter Subscription Handler
 *
 * Handles subscribe and unsubscribe requests for the newsletter.
 * Stores subscribers in Supabase newsletter_subscribers table.
 *
 * Environment variables required:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';
import { checkRateLimit } from './_shared/rate-limit.js';
import { verifyTurnstile } from './_shared/turnstile.js';

/** CORS headers with Content-Type for JSON responses */
function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

/* ── Rate limit config ── */
const SUBSCRIBE_LIMIT = { window: 60000, max: 5 };

/* ── Email validation ────────────────────────────────────────────── */
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/* ── Sanitize input ──────────────────────────────────────────────── */
function sanitize(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>"'&]/g, '').trim().slice(0, 500);
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

    // Rate limiting
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const kvStore = env?.RATE_LIMIT_KV || null;
    const allowed = await checkRateLimit(ip, 'newsletter', SUBSCRIBE_LIMIT, kvStore);
    if (!allowed) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Too many requests. Try again later.' }),
            { status: 429, headers: corsHeaders(origin) }
        );
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.warn('newsletter-subscribe: Supabase not configured');
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

    // Turnstile CAPTCHA verification
    const turnstileToken = body['cf-turnstile-response'] || body.turnstileToken || '';
    const turnstileResult = await verifyTurnstile(turnstileToken, env?.TURNSTILE_SECRET_KEY, ip);
    if (!turnstileResult.success) {
        return new Response(
            JSON.stringify({ ok: false, error: turnstileResult.error }),
            { status: 403, headers: corsHeaders(origin) }
        );
    }

    const action = body.action || 'subscribe';
    const email = (body.email || '').trim().toLowerCase();
    const name = sanitize(body.name || '');
    const source = sanitize(body.source || 'website');

    // Validate email
    if (!isValidEmail(email)) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Invalid email address' }),
            { status: 422, headers: corsHeaders(origin) }
        );
    }

    try {
        if (action === 'unsubscribe') {
            // Update status to unsubscribed
            const res = await fetch(supabaseUrl + '/rest/v1/newsletter_subscribers?email=eq.' + encodeURIComponent(email), {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                },
                body: JSON.stringify({
                    status: 'unsubscribed',
                    unsubscribed_at: new Date().toISOString()
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                console.error('Unsubscribe error:', res.status, errText);
                return new Response(
                    JSON.stringify({ ok: false, error: 'Failed to unsubscribe' }),
                    { status: 500, headers: corsHeaders(origin) }
                );
            }

            return new Response(
                JSON.stringify({ ok: true, message: 'Successfully unsubscribed' }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        // Subscribe — upsert to handle re-subscribes
        const subscriberData = {
            email: email,
            name: name || '',
            source: source,
            status: 'active',
            confirmed: false,
            unsubscribed_at: null
        };

        const res = await fetch(supabaseUrl + '/rest/v1/newsletter_subscribers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(subscriberData)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('Subscribe error:', res.status, errText);

            // Check for duplicate (unique constraint)
            if (res.status === 409 || errText.includes('duplicate')) {
                return new Response(
                    JSON.stringify({ ok: true, message: 'Already subscribed' }),
                    { status: 200, headers: corsHeaders(origin) }
                );
            }

            return new Response(
                JSON.stringify({ ok: false, error: 'Failed to subscribe' }),
                { status: 500, headers: corsHeaders(origin) }
            );
        }

        return new Response(
            JSON.stringify({ ok: true, message: 'Successfully subscribed' }),
            { status: 200, headers: corsHeaders(origin) }
        );

    } catch (err) {
        console.error('newsletter-subscribe error:', err);
        return new Response(
            JSON.stringify({ ok: false, error: 'Internal server error' }),
            { status: 500, headers: corsHeaders(origin) }
        );
    }
}
