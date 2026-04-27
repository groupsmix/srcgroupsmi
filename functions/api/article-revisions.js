import { logError, logWarn } from './_shared/log.js';
/**
 * /api/article-revisions — Version History / Revisions
 *
 * GET:  Fetch revisions for an article
 * POST: Save a revision or restore a previous one
 *
 * Environment variables required:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';
import { requireAuth, requireAuthWithOwnership } from './_shared/auth.js';

function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
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
            const authResult = await requireAuth(request, env, corsHeaders(origin));
            if (authResult instanceof Response) return authResult;
            const url = new URL(request.url);
            const articleId = url.searchParams.get('article_id');
            const limit = parseInt(url.searchParams.get('limit') || '20', 10);

            if (!articleId) {
                return new Response(
                    JSON.stringify({ ok: false, error: 'Missing article_id' }),
                    { status: 400, headers: corsHeaders(origin) }
                );
            }

            const res = await fetch(supabaseUrl + '/rest/v1/rpc/get_article_revisions', {
                method: 'POST',
                headers,
                body: JSON.stringify({ p_article_id: articleId, p_limit: limit })
            });

            if (!res.ok) {
                const errText = await res.text();
                logError('get_article_revisions error:', errText, { status: res.status });
                return new Response(
                    JSON.stringify({ ok: false, error: 'Failed to fetch revisions' }),
                    { status: 500, headers: corsHeaders(origin) }
                );
            }

            const data = await res.json();
            return new Response(
                JSON.stringify({ ok: true, revisions: data }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        if (request.method === 'POST') {
            const body = await request.json();
            const { action, article_id, user_id, revision_id } = body;

            if (!user_id) {
                return new Response(
                    JSON.stringify({ ok: false, error: 'Missing user_id' }),
                    { status: 400, headers: corsHeaders(origin) }
                );
            }

            const ownAuth = await requireAuthWithOwnership(request, env, corsHeaders(origin), user_id);
            if (ownAuth instanceof Response) return ownAuth;

            if (action === 'save') {
                if (!article_id) {
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Missing article_id' }),
                        { status: 400, headers: corsHeaders(origin) }
                    );
                }

                const res = await fetch(supabaseUrl + '/rest/v1/rpc/save_article_revision', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ p_article_id: article_id, p_user_id: user_id })
                });

                if (!res.ok) {
                    const errText = await res.text();
                    logError('save_article_revision error:', errText, { status: res.status });
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Failed to save revision' }),
                        { status: 500, headers: corsHeaders(origin) }
                    );
                }

                const revision = await res.json();
                return new Response(
                    JSON.stringify({ ok: true, revision }),
                    { status: 200, headers: corsHeaders(origin) }
                );
            }

            if (action === 'restore') {
                if (!revision_id) {
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Missing revision_id' }),
                        { status: 400, headers: corsHeaders(origin) }
                    );
                }

                const res = await fetch(supabaseUrl + '/rest/v1/rpc/restore_article_revision', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ p_revision_id: revision_id, p_user_id: user_id })
                });

                if (!res.ok) {
                    const errText = await res.text();
                    logError('restore_article_revision error:', errText, { status: res.status });
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Failed to restore revision' }),
                        { status: 500, headers: corsHeaders(origin) }
                    );
                }

                const result = await res.json();
                return new Response(
                    JSON.stringify({ ok: true, result }),
                    { status: 200, headers: corsHeaders(origin) }
                );
            }

            return new Response(
                JSON.stringify({ ok: false, error: 'Invalid action. Use "save" or "restore"' }),
                { status: 400, headers: corsHeaders(origin) }
            );
        }

        return new Response(
            JSON.stringify({ ok: false, error: 'Method not allowed' }),
            { status: 405, headers: corsHeaders(origin) }
        );

    } catch (err) {
        console.error('article-revisions error:', err);
        return new Response(
            JSON.stringify({ ok: false, error: 'Internal server error' }),
            { status: 500, headers: corsHeaders(origin) }
        );
    }
}
