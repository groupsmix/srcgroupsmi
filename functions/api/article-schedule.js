/**
 * /api/article-schedule — Scheduled Publishing
 *
 * POST: Schedule an article for future publishing
 * GET:  Cron endpoint — publishes all articles whose scheduled_at has passed
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
        if (request.method === 'GET') {
            // Cron: publish scheduled articles
            const res = await fetch(supabaseUrl + '/rest/v1/rpc/publish_scheduled_articles', {
                method: 'POST',
                headers,
                body: JSON.stringify({})
            });

            if (!res.ok) {
                const errText = await res.text();
                console.error('publish_scheduled_articles error:', res.status, errText);
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
            const body = await request.json();
            const { article_id, scheduled_at } = body;

            if (!article_id || !scheduled_at) {
                return new Response(
                    JSON.stringify({ ok: false, error: 'Missing article_id or scheduled_at' }),
                    { status: 400, headers: corsHeaders(origin) }
                );
            }

            // Validate scheduled_at is in the future
            const schedDate = new Date(scheduled_at);
            if (Number.isNaN(schedDate.getTime()) || schedDate <= new Date()) {
                return new Response(
                    JSON.stringify({ ok: false, error: 'scheduled_at must be a future date' }),
                    { status: 400, headers: corsHeaders(origin) }
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
        return new Response(
            JSON.stringify({ ok: false, error: 'Internal server error' }),
            { status: 500, headers: corsHeaders(origin) }
        );
    }
}
