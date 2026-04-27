import { logError, logWarn } from './_shared/log.js';
/**
 * /api/analytics-event — Analytics Event Logger
 *
 * Logs analytics events from the frontend to Supabase.
 * Accepts: event_name, event_category, event_data, page_path, session_id
 *
 * Environment variables required:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';

/** CORS headers with Content-Type for JSON responses */
function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

/* ── Sanitize input ──────────────────────────────────────────────── */
function sanitize(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>"']/g, '').trim().slice(0, 1000);
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
        // Silently succeed if not configured — don't break the site
        return new Response(
            JSON.stringify({ ok: true, warning: 'Analytics not configured' }),
            { status: 200, headers: corsHeaders(origin) }
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

    const eventName = sanitize(body.event_name || '');
    if (!eventName) {
        return new Response(
            JSON.stringify({ ok: false, error: 'event_name is required' }),
            { status: 422, headers: corsHeaders(origin) }
        );
    }

    // Extract user info from request
    const userAgent = request.headers.get('User-Agent') || '';
    const cfCountry = request.headers.get('CF-IPCountry') || '';
    const _ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';

    // Detect device type from User-Agent
    let deviceType = 'desktop';
    if (/Mobile|Android|iPhone|iPad/i.test(userAgent)) {
        deviceType = /iPad|Tablet/i.test(userAgent) ? 'tablet' : 'mobile';
    }

    // Detect browser
    let _browser = 'other';
    if (/Chrome/i.test(userAgent) && !/Edg/i.test(userAgent)) _browser = 'chrome';
    else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) _browser = 'safari';
    else if (/Firefox/i.test(userAgent)) _browser = 'firefox';
    else if (/Edg/i.test(userAgent)) _browser = 'edge';

    const eventData = {
        event_name: eventName,
        event_category: sanitize(body.event_category || 'general'),
        event_data: typeof body.event_data === 'object' ? body.event_data : {},
        page_path: sanitize(body.page_url || body.page_path || ''),
        session_id: sanitize(body.session_id || ''),
        uid: body.uid || null,
        device_type: deviceType,
        country: cfCountry || sanitize(body.country || ''),
        referrer: sanitize(body.referrer || ''),
        user_agent: userAgent.slice(0, 500)
    };

    try {
        const res = await fetch(supabaseUrl + '/rest/v1/analytics_events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify(eventData)
        });

        if (!res.ok) {
            const errText = await res.text();
            logError('Analytics event insert error:', errText, { status: res.status });
            // Don't return error to client — analytics should be silent
            return new Response(
                JSON.stringify({ ok: true }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        return new Response(
            JSON.stringify({ ok: true }),
            { status: 200, headers: corsHeaders(origin) }
        );

    } catch (err) {
        console.error('analytics-event error:', err);
        // Silent success — never break the site for analytics
        return new Response(
            JSON.stringify({ ok: true }),
            { status: 200, headers: corsHeaders(origin) }
        );
    }
}
