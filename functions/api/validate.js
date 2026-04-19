/**
 * /api/validate — Server-side validation endpoint
 *
 * Cloudflare Pages Function that provides:
 *   1. Turnstile CAPTCHA server-side verification
 *   2. Email format + disposable domain blocking
 *   3. IP-based rate limiting (persistent via KV, in-memory fallback)
 *
 * Environment variable required (set in Cloudflare Pages dashboard):
 *   TURNSTILE_SECRET_KEY — your Cloudflare Turnstile secret key
 *
 * Request (POST JSON):
 *   { turnstileToken, email, action }
 *
 * Response (JSON):
 *   { ok: true/false, errors: [...] }
 */

import { checkRateLimit } from './_shared/rate-limit.js';

/* ── Disposable email domains (server-side mirror of client list) ── */
const DISPOSABLE_DOMAINS = new Set([
    'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com', 'yopmail.com',
    'temp-mail.org', 'fakeinbox.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
    'dispostable.com', 'trashmail.com', 'mailnesia.com', 'maildrop.cc', 'discard.email',
    'mailcatch.com', 'tempail.com', 'tempr.email', '10minutemail.com', 'mohmal.com',
    'burnermail.io', 'temp-mail.io', 'tmpmail.net', 'tmpmail.org', 'boun.cr',
    'mailtemp.net', 'emailondeck.com', '33mail.com', 'getnada.com', 'inboxkitten.com',
    'throwmail.com', 'trashmail.net', 'mytemp.email', 'tempmailo.com', 'emailtemp.org',
    'crazymailing.com', 'mailsac.com', 'tempmailco.com', 'tempmailer.com', 'getairmail.com',
    'trash-mail.com', 'one-time.email', 'moakt.com', 'tmail.ws', 'tempsky.com',
    'mailexpire.com', 'emailfake.com', 'throwawaymail.com', 'spamgourmet.com', 'jetable.org'
]);

/* ── Rate limit configs ─────────────────────────────────────────── */
const RATE_LIMITS = {
    signup:  { window: 900000,  max: 5  },  // 5 per 15 min
    signin:  { window: 900000,  max: 10 },  // 10 per 15 min
    reset:   { window: 900000,  max: 3  },  // 3 per 15 min
    contact: { window: 3600000, max: 3  },  // 3 per hour
    submit:  { window: 3600000, max: 5  },  // 5 per hour
    // Issue #12 fix: add server-side rate limits for actions that were client-side only
    comment: { window: 60000,   max: 5  },  // 5 per minute
    payment: { window: 3600000, max: 3  },  // 3 per hour
    report:  { window: 3600000, max: 5  },  // 5 per hour
    review:  { window: 3600000, max: 10 },  // 10 per hour
    default: { window: 900000,  max: 15 }   // 15 per 15 min
};

/* ── Email validation ───────────────────────────────────────────── */
function validateEmail(email) {
    if (typeof email !== 'string') return 'Invalid email address';
    const trimmed = email.trim().toLowerCase();
    if (trimmed.length > 254) return 'Email address is too long';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Invalid email format';
    const domain = trimmed.split('@')[1];
    if (!domain) return 'Invalid email domain';
    if (DISPOSABLE_DOMAINS.has(domain)) return 'Disposable email addresses are not allowed';
    return null; // valid
}

/* ── Turnstile verification ─────────────────────────────────────── */
async function verifyTurnstile(token, ip, secretKey) {
    if (!secretKey) {
        // If no secret key configured, skip server-side verification
        // (Turnstile is still checked client-side)
        console.warn('verifyTurnstile: TURNSTILE_SECRET_KEY is not configured — server-side CAPTCHA verification is disabled');
        return { success: true };
    }
    if (!token) {
        return { success: false, error: 'CAPTCHA verification required' };
    }

    try {
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                secret: secretKey,
                response: token,
                remoteip: ip
            })
        });
        const result = await res.json();
        if (!result.success) {
            return { success: false, error: 'CAPTCHA verification failed' };
        }
        return { success: true };
    } catch (_err) {
        // On network error, allow through (don't block legitimate users)
        return { success: true };
    }
}

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';

/** CORS headers with Content-Type for JSON responses */
function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

/* ── Main handler ───────────────────────────────────────────────── */
export async function onRequest(context) {
    const { request } = context;
    const origin = request.headers.get('Origin') || '';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
    }

    if (request.method !== 'POST') {
        return new Response(
            JSON.stringify({ ok: false, errors: ['Method not allowed'] }),
            { status: 405, headers: corsHeaders(origin) }
        );
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({ ok: false, errors: ['Invalid JSON body'] }),
            { status: 400, headers: corsHeaders(origin) }
        );
    }

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const action = body.action || 'default';
    const errors = [];

    // 1. Rate limit check (persistent via KV when available, in-memory fallback)
    const kvStore = context.env?.RATE_LIMIT_KV || null;
    const limit = RATE_LIMITS[action] || RATE_LIMITS.default;
    const allowed = await checkRateLimit(ip, action, limit, kvStore);
    if (!allowed) {
        return new Response(
            JSON.stringify({ ok: false, errors: ['Too many requests. Please try again later.'], code: 'RATE_LIMITED' }),
            { status: 429, headers: corsHeaders(origin) }
        );
    }

    // 2. Email validation (if provided)
    if (body.email) {
        const emailError = validateEmail(body.email);
        if (emailError) errors.push(emailError);
    }

    // Audit fix #20: password strength validation removed from server-side.
    // Password strength checking is handled entirely client-side.
    // Supabase Auth handles actual authentication — no need to expose passwords to this endpoint.

    // 4. Turnstile verification (if token provided)
    if (body.turnstileToken !== undefined) {
        const secretKey = context.env?.TURNSTILE_SECRET_KEY || '';
        const turnstileResult = await verifyTurnstile(body.turnstileToken, ip, secretKey);
        if (!turnstileResult.success) {
            errors.push(turnstileResult.error);
        }
    }

    if (errors.length > 0) {
        return new Response(
            JSON.stringify({ ok: false, errors }),
            { status: 422, headers: corsHeaders(origin) }
        );
    }

    return new Response(
        JSON.stringify({ ok: true, errors: [] }),
        { status: 200, headers: corsHeaders(origin) }
    );
}
