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

import { z } from 'zod';
import { checkRateLimit, RateLimitConfig } from './_shared/rate-limit';
import { validateEmail } from './_shared/email-validator';
import { verifyTurnstile } from './_shared/turnstile';
import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors';

function corsHeaders(origin: string | null): Record<string, string> {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

/* ── Schema Validation ──────────────────────────────────────────── */
const ValidateRequestSchema = z.object({
    action: z.string().optional().default('default'),
    email: z.string().email().optional(),
    turnstileToken: z.string().optional()
}).passthrough();

/* ── Rate limit configs ─────────────────────────────────────────── */
const RATE_LIMITS: Record<string, RateLimitConfig> = {
    signup:  { window: 900000,  max: 5  },  // 5 per 15 min
    signin:  { window: 900000,  max: 10 },  // 10 per 15 min
    reset:   { window: 900000,  max: 3  },  // 3 per 15 min
    contact: { window: 3600000, max: 3  },  // 3 per hour
    submit:  { window: 3600000, max: 5  },  // 5 per hour
    comment: { window: 60000,   max: 5  },  // 5 per minute
    payment: { window: 3600000, max: 3  },  // 3 per hour
    report:  { window: 3600000, max: 5  },  // 5 per hour
    review:  { window: 3600000, max: 10 },  // 10 per hour
    default: { window: 900000,  max: 15 }   // 15 per 15 min
};

/* ── Main handler ───────────────────────────────────────────────── */
export async function onRequest(context: any): Promise<Response> {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || null;

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
        const rawBody = await request.json();
        body = ValidateRequestSchema.parse(rawBody);
    } catch (err) {
        if (err instanceof z.ZodError) {
            return new Response(
                JSON.stringify({ ok: false, errors: err.errors.map(e => e.message) }),
                { status: 400, headers: corsHeaders(origin) }
            );
        }
        return new Response(
            JSON.stringify({ ok: false, errors: ['Invalid JSON body'] }),
            { status: 400, headers: corsHeaders(origin) }
        );
    }

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const action = body.action || 'default';
    const errors: string[] = [];

    // 1. Rate limit check (persistent via KV when available, in-memory fallback)
    const kvStore = env?.RATE_LIMIT_KV || null;
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
        const secretKey = env?.TURNSTILE_SECRET_KEY || '';
        const turnstileResult = await verifyTurnstile(body.turnstileToken, secretKey, ip);
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
