/**
 * POST /api/purge-deleted  (Epic C, C-3)
 *
 * Scheduled hard-delete job. Gated by the same CRON_SECRET pattern
 * used by /api/compute-feed: every request must carry an
 * X-Cron-Secret header whose value matches env.CRON_SECRET, otherwise
 * the handler rejects with 401. Without the env var set the handler
 * refuses to run at all (fail-closed) so a forgotten secret never
 * silently enables a public purge endpoint.
 *
 * The endpoint delegates to the SQL function purge_soft_deleted_users
 * which iterates users with `deleted_at IS NOT NULL AND
 * deletion_scheduled_at <= now()` and calls delete_user_cascade for
 * each. One `hard_delete` dsar_audit row is written per purged user.
 *
 * Suggested Cloudflare Pages cron trigger: once per day.
 *   crons = ["17 3 * * *"]   # 03:17 UTC
 */

import { handlePreflight } from './_shared/cors.js';
import { errorResponse, successResponse } from './_shared/response.js';
import { getSupabaseConfig } from './_shared/config.js';
import { timingSafeEqualHex } from './_shared/webhook-verify.js';
import { captureEdgeException } from './_shared/sentry.js';
import { z } from 'zod';

const purgeSchema = z.object({
    limit: z.number().int().min(1).max(5000).optional()
}).passthrough();

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
        console.error('purge-deleted.js: RPC', fnName, 'failed', res.status, text);
        return { ok: false, error: text };
    }
    try {
        return { ok: true, data: JSON.parse(text) };
    } catch (_e) {
        return { ok: true, data: text };
    }
}

async function writeAudit(url, serviceKey, rows) {
    if (!rows.length) return;
    try {
        await fetch(url + '/rest/v1/dsar_audit', {
            method: 'POST',
            headers: {
                apikey: serviceKey,
                Authorization: 'Bearer ' + serviceKey,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            },
            body: JSON.stringify(rows)
        });
    } catch (err) {
        console.error('purge-deleted.js: audit insert threw', err?.message || err);
    }
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') return handlePreflight(origin);
    if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405, origin);
    }

    const cronSecret = env?.CRON_SECRET;
    if (!cronSecret) {
        // Fail closed — an unconfigured secret must not become a
        // public "delete everyone" endpoint.
        console.error('purge-deleted.js: CRON_SECRET not configured');
        return errorResponse('Service not configured', 503, origin);
    }

    const presented = request.headers.get('X-Cron-Secret') || '';
    if (!timingSafeEqualHex(presented, cronSecret)) {
        return errorResponse('Unauthorized', 401, origin);
    }

    let cfg;
    try {
        cfg = getSupabaseConfig(env);
    } catch (err) {
        console.error('purge-deleted.js: missing Supabase config', err?.message || err);
        return errorResponse('Service not configured', 503, origin);
    }

    let limit = 500;
    try {
        const body = await request.json();
        const validation = purgeSchema.safeParse(body);
        if (validation.success && validation.data.limit) {
            limit = validation.data.limit;
        }
    } catch {
        // No body or invalid JSON is fine — use the default limit of 500.
    }

    const started = Date.now();
    const rpc = await callRpc(cfg.url, cfg.serviceKey, 'purge_soft_deleted_users', { p_limit: limit });
    if (!rpc.ok) {
        context.waitUntil(captureEdgeException(env, new Error('purge_soft_deleted_users failed: ' + rpc.error), {
            request: request,
            tags: { endpoint: 'purge-deleted' }
        }));
        return errorResponse('Purge failed', 500, origin);
    }

    const rows = Array.isArray(rpc.data) ? rpc.data : [];
    const ip = request.headers.get('CF-Connecting-IP')
        || request.headers.get('x-forwarded-for')
        || 'cron';

    const auditRows = rows.map(r => ({
        user_id: null, // public.users row is already gone
        auth_id: r?.auth_id || null,
        action: 'hard_delete',
        metadata: { original_user_id: r?.user_id || null },
        ip,
        user_agent: 'cron/purge-deleted'
    }));
    await writeAudit(cfg.url, cfg.serviceKey, auditRows);

    return successResponse({
        purged: rows.length,
        limit,
        duration_ms: Date.now() - started
    }, origin);
}
