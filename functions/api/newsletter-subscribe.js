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
