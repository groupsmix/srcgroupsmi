/**
 * /api/newsletter-digest — Weekly Newsletter Digest
 *
 * GET:  Cron endpoint — generates and queues weekly digest emails.
 *       Gated by the same CRON_SECRET / X-Cron-Secret pattern used by
 *       /api/compute-feed and /api/purge-deleted (H-7). Fail-closed:
 *       the handler refuses to run at all when CRON_SECRET is unset
 *       so an unconfigured secret never becomes an open endpoint.
 * POST: Generate a preview digest for a specific subscriber.
 *       Not a cron path; not gated by CRON_SECRET.
 *
 * Environment variables required:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 *   CRON_SECRET          — REQUIRED for the GET cron branch. Must match
 *                          the X-Cron-Secret request header exactly.
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';
import { timingSafeEqualHex } from './_shared/webhook-verify.js';
import { captureEdgeException } from './_shared/sentry.js';
import { z } from 'zod';

const previewSchema = z.object({
    email: z.string().email("Invalid email format for preview").max(320)
}).passthrough();

function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

/**
 * Build HTML digest content from articles.
 */
function buildDigestHtml(articles, subscriberEmail) {
    const articleCards = articles.map((a) => {
        return '<tr><td style="padding:16px 0;border-bottom:1px solid #eee">' +
            (a.cover_image ? '<img src="' + a.cover_image + '" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-bottom:12px">' : '') +
            '<h3 style="margin:0 0 8px;font-size:18px"><a href="https://groupsmix.com/article?slug=' + (a.slug || '') + '" style="color:#1a1a1a;text-decoration:none">' + (a.title || 'Untitled') + '</a></h3>' +
            '<p style="margin:0 0 8px;color:#666;font-size:14px">' + (a.excerpt || '').slice(0, 150) + '</p>' +
            '<span style="font-size:12px;color:#999">' + (a.author_name || 'Anonymous') + ' &middot; ' + (a.reading_time || 5) + ' min read</span>' +
            '</td></tr>';
    }).join('');

    return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>' +
        '<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9f9f9">' +
        '<div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">' +
        '<h1 style="margin:0 0 4px;font-size:24px;color:#1a1a1a">GroupsMix Weekly</h1>' +
        '<p style="margin:0 0 24px;color:#666;font-size:14px">Top articles you may have missed</p>' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0">' + articleCards + '</table>' +
        '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;text-align:center">' +
        '<a href="https://groupsmix.com/articles" style="color:#0066cc;font-size:14px">Browse all articles</a>' +
        '<p style="margin:16px 0 0;font-size:12px;color:#999">You received this because you subscribed to GroupsMix Newsletter.<br>' +
        '<a href="https://groupsmix.com/unsubscribe?email=' + encodeURIComponent(subscriberEmail || '') + '" style="color:#999">Unsubscribe</a></p>' +
        '</div></div></body></html>';
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
    }

    // Cron gate (H-7): the GET branch performs batch digest generation
    // using the service-role key and must never be reachable without
    // the shared CRON_SECRET. Fail closed when the env var is unset.
    if (request.method === 'GET') {
        const cronSecret = env?.CRON_SECRET;
        if (!cronSecret) {
            console.error('newsletter-digest: CRON_SECRET not configured');
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
        // Fetch top articles from the past 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const articlesRes = await fetch(
            supabaseUrl + '/rest/v1/articles?select=id,title,slug,excerpt,cover_image,author_name,reading_time,views,like_count' +
            '&status=eq.published&moderation_status=eq.approved' +
            '&published_at=gte.' + encodeURIComponent(sevenDaysAgo) +
            '&order=views.desc&limit=10',
            { method: 'GET', headers }
        );

        if (!articlesRes.ok) {
            return new Response(
                JSON.stringify({ ok: false, error: 'Failed to fetch articles' }),
                { status: 500, headers: corsHeaders(origin) }
            );
        }

        const topArticles = await articlesRes.json();

        if (topArticles.length === 0) {
            return new Response(
                JSON.stringify({ ok: true, message: 'No articles to include in digest', digests_created: 0 }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        if (request.method === 'POST') {
            // Preview mode: return digest HTML for a specific email
            let body;
            try {
                const rawBody = await request.json();
                const validation = previewSchema.safeParse(rawBody);
                if (!validation.success) {
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Validation failed', details: validation.error.issues }),
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

            const html = buildDigestHtml(topArticles, body.email);
            return new Response(
                JSON.stringify({ ok: true, html, article_count: topArticles.length }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        // GET: Cron mode — generate digests for all subscribers
        const subsRes = await fetch(
            supabaseUrl + '/rest/v1/newsletter_subscribers?select=email,categories&status=eq.active&limit=1000',
            { method: 'GET', headers }
        );

        if (!subsRes.ok) {
            return new Response(
                JSON.stringify({ ok: false, error: 'Failed to fetch subscribers' }),
                { status: 500, headers: corsHeaders(origin) }
            );
        }

        const subscribers = await subsRes.json();
        let digestsCreated = 0;

        for (const sub of subscribers) {
            const html = buildDigestHtml(topArticles, sub.email);
            const subject = 'GroupsMix Weekly: ' + topArticles.length + ' articles you may have missed';

            // Insert digest record
            const digestRes = await fetch(supabaseUrl + '/rest/v1/newsletter_digests', {
                method: 'POST',
                headers: { ...headers, 'Prefer': 'return=minimal' },
                body: JSON.stringify({
                    subscriber_email: sub.email,
                    articles: topArticles.map((a) => { return { id: a.id, title: a.title, slug: a.slug }; }),
                    subject: subject,
                    html_content: html,
                    status: 'pending'
                })
            });

            if (digestRes.ok) digestsCreated++;
        }

        return new Response(
            JSON.stringify({
                ok: true,
                digests_created: digestsCreated,
                subscriber_count: subscribers.length,
                article_count: topArticles.length
            }),
            { status: 200, headers: corsHeaders(origin) }
        );

    } catch (err) {
        console.error('newsletter-digest error:', err);
        context.waitUntil(captureEdgeException(env, err, {
            request: request,
            tags: { endpoint: 'newsletter-digest', method: request.method }
        }));
        return new Response(
            JSON.stringify({ ok: false, error: 'Internal server error' }),
            { status: 500, headers: corsHeaders(origin) }
        );
    }
}
