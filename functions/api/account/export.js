/**
 * POST /api/account/export  (Epic C, C-1)
 *
 * Returns a JSON bundle of every row we hold for the authenticated user
 * so they can fulfil a DSAR "right of access". The bundle is built
 * server-side using the Supabase service-role key so it includes
 * tables the user's own JWT cannot read directly (e.g. moderation
 * flags, server-side rate-limit counters we keep in KV are NOT
 * included by design — only DB-resident data is in scope here).
 *
 * Response: 200 JSON with Content-Disposition: attachment so browsers
 * offer a direct download. Every successful export writes a
 * `dsar_audit` row with action='export_completed'.
 */

import { requireAuth } from '../_shared/auth.js';
import { corsHeaders, handlePreflight } from '../_shared/cors.js';
import { errorResponse } from '../_shared/response.js';
import { getSupabaseConfig } from '../_shared/config.js';
import { checkRateLimit } from '../_shared/rate-limit.js';
import { z } from 'zod';

const exportSchema = z.object({}).passthrough();

/**
 * Tables that are keyed directly by the internal `user_id` column.
 * Each entry is [table, selectColumns]. We use `select=*` for most
 * tables and let RLS filter with the service-role bypass — but we
 * still attach ?user_id=eq.<id> so we never accidentally ship another
 * user's row if the service role somehow exported the whole table.
 */
const USER_ID_TABLES = [
    'user_wallets',
    'wallet_transactions',
    'user_interests',
    'content_impressions',
    'user_feed_sessions',
    'article_reading_history',
    'user_badges',
    'user_resumes',
    'job_applications',
    'withdrawal_requests',
    'challenge_participants',
    'series_followers',
    'reading_lists',
    'reading_list_items',
    'reading_list_followers',
    'poll_votes',
    'article_collaborators',
    'article_purchases'
];

async function fetchRows(url, serviceKey, path) {
    const res = await fetch(url + '/rest/v1/' + path, {
        headers: {
            apikey: serviceKey,
            Authorization: 'Bearer ' + serviceKey,
            Accept: 'application/json'
        }
    });
    if (!res.ok) {
        const text = await res.text();
        console.error('export.js: fetch failed for', path, res.status, text);
        return [];
    }
    return res.json();
}

async function buildBundle(url, serviceKey, userId, authId, email) {
    const bundle = { user_id: userId, auth_id: authId };
    const userIdFilter = 'user_id=eq.' + encodeURIComponent(userId);

    // Profile — this is the canonical row, fetch it first so the
    // export is useless without it if something upstream breaks.
    const [profile] = await fetchRows(url, serviceKey, 'users?id=eq.' + encodeURIComponent(userId) + '&select=*');
    if (!profile) {
        return null;
    }
    bundle.profile = profile;

    // Tables keyed by user_id.
    const userIdResults = await Promise.all(
        USER_ID_TABLES.map(t => fetchRows(url, serviceKey, t + '?' + userIdFilter + '&select=*'))
    );
    USER_ID_TABLES.forEach((t, i) => {
        bundle[t] = userIdResults[i];
    });

    // Tables with bespoke column names — fetched one at a time so a
    // missing/renamed table in a given environment doesn't break the
    // whole export.
    const [
        tipsSent, tipsReceived,
        followsOut, followsIn,
        marketplacePurchasesBuyer, marketplacePurchasesSeller,
        escrowBuyer, escrowSeller,
        disputesBuyer, disputesSeller,
        productReviewsByUser,
        referralsMade,
        shortLinks,
        contactSubmissions
    ] = await Promise.all([
        fetchRows(url, serviceKey, 'tips?sender_id=eq.' + userId + '&select=*'),
        fetchRows(url, serviceKey, 'tips?receiver_id=eq.' + userId + '&select=*'),
        fetchRows(url, serviceKey, 'user_follows?follower_id=eq.' + userId + '&select=*'),
        fetchRows(url, serviceKey, 'user_follows?following_id=eq.' + userId + '&select=*'),
        fetchRows(url, serviceKey, 'marketplace_purchases?buyer_id=eq.' + userId + '&select=*'),
        fetchRows(url, serviceKey, 'marketplace_purchases?seller_id=eq.' + userId + '&select=*'),
        fetchRows(url, serviceKey, 'marketplace_escrow?buyer_id=eq.' + userId + '&select=*'),
        fetchRows(url, serviceKey, 'marketplace_escrow?seller_id=eq.' + userId + '&select=*'),
        fetchRows(url, serviceKey, 'marketplace_disputes?buyer_id=eq.' + userId + '&select=*'),
        fetchRows(url, serviceKey, 'marketplace_disputes?seller_id=eq.' + userId + '&select=*'),
        fetchRows(url, serviceKey, 'product_reviews?reviewer_id=eq.' + userId + '&select=*'),
        fetchRows(url, serviceKey, 'referral_events?referrer_id=eq.' + userId + '&select=*'),
        fetchRows(url, serviceKey, 'short_links?creator_uid=eq.' + userId + '&select=*'),
        email
            ? fetchRows(url, serviceKey, 'contact_submissions?email=eq.' + encodeURIComponent(email) + '&select=*')
            : Promise.resolve([])
    ]);

    bundle.tips_sent = tipsSent;
    bundle.tips_received = tipsReceived;
    bundle.follows_out = followsOut;
    bundle.follows_in = followsIn;
    bundle.marketplace_purchases_as_buyer = marketplacePurchasesBuyer;
    bundle.marketplace_purchases_as_seller = marketplacePurchasesSeller;
    bundle.marketplace_escrow_as_buyer = escrowBuyer;
    bundle.marketplace_escrow_as_seller = escrowSeller;
    bundle.marketplace_disputes_as_buyer = disputesBuyer;
    bundle.marketplace_disputes_as_seller = disputesSeller;
    bundle.product_reviews = productReviewsByUser;
    bundle.referral_events = referralsMade;
    bundle.short_links = shortLinks;
    bundle.contact_submissions = contactSubmissions;

    // Caller's own audit history — self-inclusive.
    bundle.dsar_audit = await fetchRows(
        url,
        serviceKey,
        'dsar_audit?user_id=eq.' + encodeURIComponent(userId) + '&select=*&order=created_at.desc'
    );

    return bundle;
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
            console.error('export.js: dsar_audit insert failed', res.status, text);
        }
    } catch (err) {
        console.error('export.js: dsar_audit insert threw', err?.message || err);
    }
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') return handlePreflight(origin);
    if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405, origin);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        // Body is optional for export, but if provided must be valid JSON
        body = {};
    }

    const validation = exportSchema.safeParse(body);
    if (!validation.success) {
        return errorResponse('Validation failed', 400, origin);
    }

    const cors = corsHeaders(origin);
    const authResult = await requireAuth(request, env, cors);
    if (authResult instanceof Response) return authResult;
    const { user } = authResult;

    const ip = request.headers.get('CF-Connecting-IP')
        || request.headers.get('x-forwarded-for')
        || 'unknown';

    const allowed = await checkRateLimit(
        ip,
        'account_export',
        { window: 3600000, max: 2 },
        env?.RATE_LIMIT_KV
    );
    if (!allowed) {
        return errorResponse('Too many export requests. Try again later.', 429, origin);
    }

    let cfg;
    try {
        cfg = getSupabaseConfig(env);
    } catch (err) {
        console.error('export.js: missing Supabase config', err?.message || err);
        return errorResponse('Service not configured', 503, origin);
    }

    const profileRes = await fetch(
        cfg.url + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(user.id) + '&select=id,email&limit=1',
        { headers: { apikey: cfg.serviceKey, Authorization: 'Bearer ' + cfg.serviceKey } }
    );
    const profiles = profileRes.ok ? await profileRes.json() : [];
    if (!profiles.length) {
        return errorResponse('User profile not found', 404, origin);
    }
    const { id: internalUserId, email } = profiles[0];

    const userAgent = request.headers.get('User-Agent') || '';
    await writeAudit(cfg.url, cfg.serviceKey, {
        user_id: internalUserId,
        auth_id: user.id,
        action: 'export_requested',
        metadata: {},
        ip,
        user_agent: userAgent
    });

    const bundle = await buildBundle(cfg.url, cfg.serviceKey, internalUserId, user.id, email);
    if (!bundle) {
        return errorResponse('Failed to build export bundle', 500, origin);
    }

    const generatedAt = new Date().toISOString();
    const payload = {
        ok: true,
        generated_at: generatedAt,
        schema_version: 1,
        data: bundle
    };

    await writeAudit(cfg.url, cfg.serviceKey, {
        user_id: internalUserId,
        auth_id: user.id,
        action: 'export_completed',
        metadata: { generated_at: generatedAt, tables: Object.keys(bundle).length },
        ip,
        user_agent: userAgent
    });

    const filename = 'groupsmix-export-' + internalUserId + '-' + generatedAt.replace(/[:.]/g, '-') + '.json';
    return new Response(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: corsHeaders(origin, {
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="' + filename + '"',
            'Cache-Control': 'no-store'
        })
    });
}
