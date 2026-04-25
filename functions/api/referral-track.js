import { logError, logWarn } from "./_shared/log.js";
/**
 * /api/referral-track — Referral Event Tracker
 *
 * Tracks referral clicks, signups, and purchases.
 * Called when a user visits with ?ref=CODE parameter.
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

    const refCode = sanitize(body.code || '');
    const eventType = sanitize(body.event_type || 'click'); // click, signup, purchase
    const referredUid = body.referred_uid || null;

    if (!refCode) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Referral code is required' }),
            { status: 422, headers: corsHeaders(origin) }
        );
    }

    // Validate event type
    const validEvents = ['click', 'signup', 'purchase'];
    if (!validEvents.includes(eventType)) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Invalid event type' }),
            { status: 422, headers: corsHeaders(origin) }
        );
    }

    try {
        // Verify the referral code exists and is active
        const codeRes = await fetch(
            supabaseUrl + '/rest/v1/referral_codes?code=eq.' + encodeURIComponent(refCode) + '&status=eq.active&select=uid,code',
            {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                }
            }
        );

        const codeData = await codeRes.json();
        if (!codeData || !codeData.length) {
            return new Response(
                JSON.stringify({ ok: false, error: 'Invalid or inactive referral code' }),
                { status: 404, headers: corsHeaders(origin) }
            );
        }

        const referrerUid = codeData[0].uid;

        // Insert referral event
        const eventData = {
            referrer_uid: referrerUid,
            referral_code: refCode,
            event_type: eventType,
            referred_uid: referredUid,
            metadata: {
                user_agent: request.headers.get('User-Agent') || '',
                country: request.headers.get('CF-IPCountry') || '',
                page_url: sanitize(body.page_url || '')
            }
        };

        // Add commission for purchase events
        if (eventType === 'purchase' && body.amount) {
            eventData.commission = Math.round(Number(body.amount) * 0.10) / 100; // 10% commission in dollars
        }

        const insertRes = await fetch(supabaseUrl + '/rest/v1/referral_events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify(eventData)
        });

        if (!insertRes.ok) {
            const errText = await insertRes.text();
            logError('Referral event insert error:', errText, { status: insertRes.status });
            return new Response(
                JSON.stringify({ ok: false, error: 'Failed to track referral' }),
                { status: 500, headers: corsHeaders(origin) }
            );
        }

        // Update click/signup/purchase count on the referral code
        const countField = eventType === 'click' ? 'clicks' : eventType === 'signup' ? 'signups' : 'purchases';
        const rpcName = 'increment_referral_' + countField;

        await fetch(supabaseUrl + '/rest/v1/rpc/' + rpcName, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify({ p_code: refCode })
        });

        return new Response(
            JSON.stringify({ ok: true, message: 'Referral event tracked' }),
            { status: 200, headers: corsHeaders(origin) }
        );

    } catch (err) {
        console.error('referral-track error:', err);
        return new Response(
            JSON.stringify({ ok: false, error: 'Internal server error' }),
            { status: 500, headers: corsHeaders(origin) }
        );
    }
}
