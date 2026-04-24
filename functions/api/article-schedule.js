/**
 * /api/article-schedule — Scheduled Publishing
 *
 * POST: Schedule an article for future publishing.
 *       Not a cron path; not gated by CRON_SECRET.
 * GET:  Cron endpoint — publishes all articles whose scheduled_at has
 *       passed. Gated by the same CRON_SECRET / X-Cron-Secret pattern
 *       used by /api/compute-feed and /api/purge-deleted (H-7).
 *       Fail-closed: the handler refuses to run when CRON_SECRET is
 *       unset so an unconfigured secret never becomes an open endpoint.
 *
 * Environment variables required:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 *   CRON_SECRET          — REQUIRED for the GET cron branch. Must match
 *                          the X-Cron-Secret request header exactly.
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';
import { requireAuth } from './_shared/auth.js';
import { timingSafeEqualHex } from './_shared/webhook-verify.js';
import { captureEdgeException } from './_shared/sentry.js';
import { z } from 'zod';

const scheduleSchema = z.object({
    article_id: z.string().min(1),
    scheduled_at: z.string().datetime()
}).passthrough();

function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
    }

    // Cron gate (H-7): the GET branch publishes scheduled articles via
    // the service-role key and must never be reachable without the
    // shared CRON_SECRET. Fail closed when the env var is unset.
    if (request.method === 'GET') {
        const cronSecret = env?.CRON_SECRET;
        if (!cronSecret) {
            console.error('article-schedule: CRON_SECRET not configured');
            return new Response(
                JSON.stringify({ ok: false, error: 'Service not configured' }),
                { status: 503, headers: corsHeaders(origin) }
            );
        }
        const presented = request.headers.get('X-Cron-Secret') || '';
        if (!timingSafeEqualHex(presented, cronSecret)) {
            return new Response(
                JSON.stringify({ ok: false, error: 'Unauthorized' }),
                { status: 401, headers: corsHeaders(origin) }
            );
        }
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Service not configured' }),
            { status: 503, headers: corsHeaders(origin) }
        );
    }

    const headers = {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey
    };

    try {
        if (request.method === 'GET') {
            // Cron: publish scheduled articles. Fail closed — require CRON_SECRET.
            const cronSecret = env?.CRON_SECRET;
            if (!cronSecret) {
                return new Response(
                    JSON.stringify({ ok: false, error: 'Cron secret not configured' }),
                    { status: 503, headers: corsHeaders(origin) }
                );
            }
            const providedSecret = request.headers.get('X-Cron-Secret') || '';
            if (!timingSafeEqualHex(cronSecret, providedSecret)) {
                return new Response(
                    JSON.stringify({ ok: false, error: 'Unauthorized' }),
                    { status: 401, headers: corsHeaders(origin) }
                );
            }

            const res = await fetch(supabaseUrl + '/rest/v1/rpc/publish_scheduled_articles', {
                method: 'POST',
                headers,
                body: JSON.stringify({})
            });

            if (!res.ok) {
                const errText = await res.text();
                console.error('publish_scheduled_articles error:', res.status, errText);
                context.waitUntil(captureEdgeException(env, new Error('publish_scheduled_articles RPC failed: ' + errText), {
                    request: request,
                    tags: { endpoint: 'article-schedule', mode: 'cron' }
                }));
                return new Response(
                    JSON.stringify({ ok: false, error: 'Failed to publish scheduled articles' }),
                    { status: 500, headers: corsHeaders(origin) }
                );
            }

            const count = await res.json();
            return new Response(
                JSON.stringify({ ok: true, published_count: count }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        if (request.method === 'POST') {
            const authResult = await requireAuth(request, env, corsHeaders(origin));
            if (authResult instanceof Response) return authResult;

            let body;
            try {
                const rawBody = await request.json();
                const validation = scheduleSchema.safeParse(rawBody);
                if (!validation.success) {
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Validation failed', details: validation.error.errors }),
                        { status: 400, headers: corsHeaders(origin) }
                    );
                }
                body = validation.data;
            } catch {
                return new Response(
                    JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
                    { status: 400, headers: corsHeaders(origin) }
                );
            }

            const { article_id, scheduled_at } = body;

            // Validate scheduled_at is in the future
            const schedDate = new Date(scheduled_at);
            if (Number.isNaN(schedDate.getTime()) || schedDate <= new Date()) {
                return new Response(
                    JSON.stringify({ ok: false, error: 'scheduled_at must be a future date' }),
                    { status: 400, headers: corsHeaders(origin) }
                );
            }

            // Verify the caller owns the article. Service-role bypasses RLS.
            const callerRes = await fetch(
                supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(authResult.user.id) + '&select=id&limit=1',
                { headers }
            );
            const callers = await callerRes.json();
            const callerInternalId = Array.isArray(callers) && callers[0]?.id;
            const articleRes = await fetch(
                supabaseUrl + '/rest/v1/articles?id=eq.' + encodeURIComponent(article_id) + '&select=user_id&limit=1',
                { headers }
            );
            const articles = await articleRes.json();
            const articleOwnerId = Array.isArray(articles) && articles[0]?.user_id;
            if (!callerInternalId || !articleOwnerId || callerInternalId !== articleOwnerId) {
                return new Response(
                    JSON.stringify({ ok: false, error: 'Forbidden' }),
                    { status: 403, headers: corsHeaders(origin) }
                );
            }

            // Update article with scheduled_at
            const res = await fetch(
                supabaseUrl + '/rest/v1/articles?id=eq.' + encodeURIComponent(article_id),
                {
                    method: 'PATCH',
                    headers: { ...headers, 'Prefer': 'return=representation' },
                    body: JSON.stringify({
                        scheduled_at: schedDate.toISOString(),
                        status: 'draft'
                    })
                }
            );

            if (!res.ok) {
                const errText = await res.text();
                console.error('schedule article error:', res.status, errText);
                return new Response(
                    JSON.stringify({ ok: false, error: 'Failed to schedule article' }),
                    { status: 500, headers: corsHeaders(origin) }
                );
            }

            return new Response(
                JSON.stringify({ ok: true, scheduled_at: schedDate.toISOString() }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        return new Response(
            JSON.stringify({ ok: false, error: 'Method not allowed' }),
            { status: 405, headers: corsHeaders(origin) }
        );

    } catch (err) {
        console.error('article-schedule error:', err);
        context.waitUntil(captureEdgeException(env, err, {
            request: request,
            tags: { endpoint: 'article-schedule', method: request.method }
        }));
        return new Response(
            JSON.stringify({ ok: false, error: 'Internal server error' }),
            { status: 500, headers: corsHeaders(origin) }
        );
    }
}
