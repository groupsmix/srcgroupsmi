/**
 * /api/article-analytics — Author Reading Analytics
 *
 * GET: Fetch analytics data for an author's articles
 * POST: Record a view with read percentage and traffic source
 *
 * Environment variables required:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';

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
            // Record a view
            const body = await request.json();
            const { article_id, read_pct, source } = body;

            if (!article_id) {
                return new Response(
                    JSON.stringify({ ok: false, error: 'Missing article_id' }),
                    { status: 400, headers: corsHeaders(origin) }
                );
            }

            const res = await fetch(supabaseUrl + '/rest/v1/rpc/record_article_view_daily', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    p_article_id: article_id,
                    p_read_pct: read_pct || 0,
                    p_source: source || 'direct'
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                console.error('record_article_view_daily error:', res.status, errText);
            }

            return new Response(
                JSON.stringify({ ok: true }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        if (request.method === 'GET') {
            // Get analytics for an author
            const url = new URL(request.url);
            const userId = url.searchParams.get('user_id');
            const days = parseInt(url.searchParams.get('days') || '30', 10);

            if (!userId) {
                return new Response(
                    JSON.stringify({ ok: false, error: 'Missing user_id' }),
                    { status: 400, headers: corsHeaders(origin) }
                );
            }

            const res = await fetch(supabaseUrl + '/rest/v1/rpc/get_author_analytics', {
                method: 'POST',
                headers,
                body: JSON.stringify({ p_user_id: userId, p_days: days })
            });

            if (!res.ok) {
                const errText = await res.text();
                console.error('get_author_analytics error:', res.status, errText);
                return new Response(
                    JSON.stringify({ ok: false, error: 'Failed to fetch analytics' }),
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
            JSON.stringify({ ok: false, error: 'Method not allowed' }),
            { status: 405, headers: corsHeaders(origin) }
        );

    } catch (err) {
        console.error('article-analytics error:', err);
        return new Response(
            JSON.stringify({ ok: false, error: 'Internal server error' }),
            { status: 500, headers: corsHeaders(origin) }
        );
    }
}
