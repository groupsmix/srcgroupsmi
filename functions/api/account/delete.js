/**
 * POST /api/account/delete  (Epic C, C-2)
 *
 * Re-auth + Turnstile gated soft-delete. On success the public.users
 * row is PII-scrubbed and flagged for hard deletion 30 days later; the
 * scheduled /api/purge-deleted cron sweeps the actual delete via the
 * delete_user_cascade RPC once the grace window elapses.
 *
 * Body:
 *   {
 *     password:        string  // required, re-verified against Supabase
 *     turnstileToken:  string  // required when TURNSTILE_SECRET_KEY is set
 *     confirm:         "DELETE"
 *   }
 */

import { requireAuth } from '../_shared/auth.js';
import { corsHeaders, handlePreflight } from '../_shared/cors.js';
import { errorResponse, successResponse } from '../_shared/response.js';
import { getSupabaseConfig } from '../_shared/config.js';
import { checkRateLimit } from '../_shared/rate-limit.js';
import { verifyTurnstile } from '../_shared/turnstile.js';
import { z } from 'zod';

const deleteSchema = z.object({
    password: z.string().min(1, "Password is required"),
    turnstileToken: z.string().optional(),
    confirm: z.literal("DELETE", { errorMap: () => ({ message: 'Confirmation phrase must be "DELETE"' }) })
}).passthrough();

async function reauthenticate(url, anonKey, email, password) {
    try {
        const res = await fetch(url + '/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: {
                apikey: anonKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        if (!res.ok) return false;
        const body = await res.json();
        return Boolean(body && body.access_token);
    } catch (err) {
        console.error('delete.js: reauth error', err?.message || err);
        return false;
    }
}

async function writeAudit(url, serviceKey, row) {
    try {
        const res = await fetch(url + '/rest/v1/dsar_audit', {
            method: 'POST',
            headers: {
                apikey: serviceKey,
                Authorization: 'Bearer ' + serviceKey,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            },
            body: JSON.stringify(row)
        });
        if (!res.ok) {
            const text = await res.text();
            console.error('delete.js: dsar_audit insert failed', res.status, text);
        }
    } catch (err) {
        console.error('delete.js: dsar_audit insert threw', err?.message || err);
    }
}

async function callRpc(url, serviceKey, fnName, params) {
    const res = await fetch(url + '/rest/v1/rpc/' + fnName, {
        method: 'POST',
        headers: {
            apikey: serviceKey,
            Authorization: 'Bearer ' + serviceKey,
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        body: JSON.stringify(params || {})
    });
    const text = await res.text();
    if (!res.ok) {
        console.error('delete.js: RPC', fnName, 'failed', res.status, text);
        return { ok: false, error: text };
    }
    try {
        return { ok: true, data: JSON.parse(text) };
    } catch (_e) {
        return { ok: true, data: text };
    }
}

async function signOutAllSessions(url, serviceKey, authId) {
    // Best-effort: Supabase Admin API exposes a logout endpoint that
    // invalidates all refresh tokens for a user. If it's unavailable
    // in the current project config we swallow the error — the
    // scrubbed email prevents password re-auth anyway.
    try {
        await fetch(url + '/auth/v1/admin/users/' + encodeURIComponent(authId) + '/logout', {
            method: 'POST',
            headers: {
                apikey: serviceKey,
                Authorization: 'Bearer ' + serviceKey
            }
        });
    } catch (err) {
        console.warn('delete.js: admin logout failed', err?.message || err);
    }
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') return handlePreflight(origin);
    if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405, origin);
    }

    const authResult = await requireAuth(request, env, corsHeaders(origin));
    if (authResult instanceof Response) return authResult;
    const { user } = authResult;

    const ip = request.headers.get('CF-Connecting-IP')
        || request.headers.get('x-forwarded-for')
        || 'unknown';

    const allowed = await checkRateLimit(
        ip,
        'account_delete',
        { window: 3600000, max: 3 },
        env?.RATE_LIMIT_KV
    );
    if (!allowed) {
        return errorResponse('Too many delete attempts. Try again later.', 429, origin);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return errorResponse('Invalid JSON body', 400, origin);
    }

    const validation = deleteSchema.safeParse(body);
    if (!validation.success) {
        const errorMsg = validation.error.errors.map(e => e.message).join(', ');
        return errorResponse(errorMsg, 400, origin);
    }
    body = validation.data;

    const password = body.password;
    const turnstileToken = body.turnstileToken || '';
    const confirm = body.confirm;

    const captcha = await verifyTurnstile(turnstileToken, env?.TURNSTILE_SECRET_KEY, ip);
    if (!captcha.success) {
        return errorResponse(captcha.error || 'CAPTCHA verification failed', 400, origin);
    }

    let cfg;
    try {
        cfg = getSupabaseConfig(env);
    } catch (err) {
        console.error('delete.js: missing Supabase config', err?.message || err);
        return errorResponse('Service not configured', 503, origin);
    }

    const anonKey = env?.SUPABASE_ANON_KEY;
    if (!anonKey) {
        return errorResponse('Service not configured', 503, origin);
    }

    const email = user.email;
    if (!email) {
        return errorResponse('Account has no email on file; contact support to delete', 400, origin);
    }

    const reauthed = await reauthenticate(cfg.url, anonKey, email, password);
    if (!reauthed) {
        return errorResponse('Password verification failed', 401, origin);
    }

    const userAgent = request.headers.get('User-Agent') || '';

    await writeAudit(cfg.url, cfg.serviceKey, {
        auth_id: user.id,
        action: 'delete_requested',
        metadata: {},
        ip,
        user_agent: userAgent
    });

    const rpc = await callRpc(cfg.url, cfg.serviceKey, 'soft_delete_user', { p_auth_id: user.id });
    if (!rpc.ok) {
        return errorResponse('Failed to soft-delete account', 500, origin);
    }

    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    const internalUserId = row?.user_id || null;
    const scheduled = row?.deletion_scheduled_at || null;

    await writeAudit(cfg.url, cfg.serviceKey, {
        user_id: internalUserId,
        auth_id: user.id,
        action: 'soft_delete',
        metadata: { deletion_scheduled_at: scheduled },
        ip,
        user_agent: userAgent
    });

    // Fire-and-forget: tear down live sessions. We don't block the
    // response on this because the scrubbed email already prevents
    // password re-auth.
    await signOutAllSessions(cfg.url, cfg.serviceKey, user.id);

    return successResponse({
        soft_deleted: true,
        deletion_scheduled_at: scheduled
    }, origin);
}
