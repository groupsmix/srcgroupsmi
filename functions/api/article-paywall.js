/**
 * /api/article-paywall — Article Monetization
 *
 * POST: Purchase an article with coins, or check access
 *
 * Environment variables required:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';
import { requireAuth } from './_shared/auth.js';

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
        if (request.method === 'POST') {
            const body = await request.json();
            const { action, article_id, user_id } = body;

            if (!article_id || !user_id) {
                return new Response(
                    JSON.stringify({ ok: false, error: 'Missing article_id or user_id' }),
                    { status: 400, headers: corsHeaders(origin) }
                );
            }

            // Verify the caller's JWT and ensure ownership
            const authResult = await requireAuth(request, env, corsHeaders(origin));
            if (authResult instanceof Response) return authResult;

            // Match authenticated user to the user_id in the request
            const profileRes = await fetch(
                supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(authResult.user.id) + '&select=id&limit=1',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const profiles = await profileRes.json();
            if (!profiles || !profiles.length || profiles[0].id !== user_id) {
                return new Response(
                    JSON.stringify({ ok: false, error: 'Forbidden: user_id mismatch' }),
                    { status: 403, headers: corsHeaders(origin) }
                );
            }

            if (action === 'check_access') {
                const res = await fetch(supabaseUrl + '/rest/v1/rpc/check_article_access', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ p_article_id: article_id, p_user_id: user_id })
                });

                if (!res.ok) {
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Failed to check access' }),
                        { status: 500, headers: corsHeaders(origin) }
                    );
                }

                const hasAccess = await res.json();
                return new Response(
                    JSON.stringify({ ok: true, has_access: hasAccess }),
                    { status: 200, headers: corsHeaders(origin) }
                );
            }

            if (action === 'purchase') {
                const res = await fetch(supabaseUrl + '/rest/v1/rpc/purchase_article', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ p_article_id: article_id, p_user_id: user_id })
                });

                if (!res.ok) {
                    const errText = await res.text();
                    console.error('purchase_article error:', res.status, errText);
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Purchase failed' }),
                        { status: 500, headers: corsHeaders(origin) }
                    );
                }

                const result = await res.json();
                if (result.error) {
                    return new Response(
                        JSON.stringify({ ok: false, error: result.error, details: result }),
                        { status: 400, headers: corsHeaders(origin) }
                    );
                }

                return new Response(
                    JSON.stringify({ ok: true, result }),
                    { status: 200, headers: corsHeaders(origin) }
                );
            }

            if (action === 'earnings') {
                const res = await fetch(supabaseUrl + '/rest/v1/rpc/get_author_earnings', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ p_user_id: user_id })
                });

                if (!res.ok) {
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Failed to fetch earnings' }),
                        { status: 500, headers: corsHeaders(origin) }
                    );
                }

                const data = await res.json();
                return new Response(
                    JSON.stringify({ ok: true, data }),
                    { status: 200, headers: corsHeaders(origin) }
                );
            }

            return new Response(
                JSON.stringify({ ok: false, error: 'Invalid action. Use "check_access", "purchase", or "earnings"' }),
                { status: 400, headers: corsHeaders(origin) }
            );
        }

        return new Response(
            JSON.stringify({ ok: false, error: 'Method not allowed' }),
            { status: 405, headers: corsHeaders(origin) }
        );

    } catch (err) {
        console.error('article-paywall error:', err);
        return new Response(
            JSON.stringify({ ok: false, error: 'Internal server error' }),
            { status: 500, headers: corsHeaders(origin) }
        );
    }
}
