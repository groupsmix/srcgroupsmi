import { logError, logWarn } from './_shared/log.js';
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
import { requireAuthWithOwnership } from './_shared/auth.js';
import { errorResponse, successResponse } from './_shared/response.js';

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
        return errorResponse('Service not configured', 503, origin);
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
                return errorResponse('Missing article_id or user_id', 400, origin);
            }

            // Verify the caller's JWT and ensure ownership
            const auth = await requireAuthWithOwnership(request, env, corsHeaders(origin), user_id);
            if (auth instanceof Response) return auth;

            if (action === 'check_access') {
                const res = await fetch(supabaseUrl + '/rest/v1/rpc/check_article_access', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ p_article_id: article_id, p_user_id: user_id })
                });

                if (!res.ok) {
                    return errorResponse('Failed to check access', 500, origin);
                }

                const hasAccess = await res.json();
                return successResponse({ has_access: hasAccess }, origin);
            }

            if (action === 'purchase') {
                const res = await fetch(supabaseUrl + '/rest/v1/rpc/purchase_article', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ p_article_id: article_id, p_user_id: user_id })
                });

                if (!res.ok) {
                    const errText = await res.text();
                    logError('purchase_article error:', errText, { status: res.status });
                    return errorResponse('Purchase failed', 500, origin);
                }

                const result = await res.json();
                if (result.error) {
                    return errorResponse(result.error, 400, origin);
                }

                return successResponse({ result }, origin);
            }

            if (action === 'earnings') {
                const res = await fetch(supabaseUrl + '/rest/v1/rpc/get_author_earnings', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ p_user_id: user_id })
                });

                if (!res.ok) {
                    return errorResponse('Failed to fetch earnings', 500, origin);
                }

                const data = await res.json();
                return successResponse({ data }, origin);
            }

            return errorResponse('Invalid action. Use "check_access", "purchase", or "earnings"', 400, origin);
        }

        return errorResponse('Method not allowed', 405, origin);

    } catch (err) {
        console.error('article-paywall error:', err);
        return errorResponse('Internal server error', 500, origin);
    }
}
