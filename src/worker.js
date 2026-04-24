/**
 * GroupsMix — Cloudflare Worker entry point
 *
 * Replaces the previous Cloudflare Pages deployment. The Worker pairs
 * Cloudflare's Static Assets feature with the existing Pages Function
 * handlers in `functions/` so the runtime API surface stays identical:
 *
 *   - Static output from `astro build` is served directly from the
 *     `ASSETS` binding (see wrangler.toml `[assets] directory = "./dist"`).
 *   - `/api/*`, `/gm-ctrl-x7`, and `/sitemap.xml` are dispatched to the
 *     same `onRequest` / `onRequestPost` / `onRequestGet` / `onRequestOptions`
 *     exports the Pages runtime used to call.
 *   - Scheduled cron invocations fan out to the corresponding endpoint
 *     with the `X-Cron-Secret` header populated from `env.CRON_SECRET`,
 *     matching the Pages-era contract enforced by every cron handler.
 *
 * The Pages Function signature (`{ request, env, waitUntil, ctx, params,
 * data }`) is reconstructed here so the handler modules under
 * `functions/` do not need any changes.
 *
 * See also:
 *   - wrangler.toml       — bindings, cron schedule, compatibility flags
 *   - RUNBOOK.md          — deploy + manual cron invocation
 *   - DISASTER_RECOVERY.md — Workers rollback procedure
 */

// ── /api/* handlers ────────────────────────────────────────────────
import * as abTestAssign from '../functions/api/ab-test-assign.js';
import * as analyticsEvent from '../functions/api/analytics-event.js';
import * as articleAi from '../functions/api/article-ai.js';
import * as articleAnalytics from '../functions/api/article-analytics.js';
import * as articleCollaborate from '../functions/api/article-collaborate.js';
import * as articlePaywall from '../functions/api/article-paywall.js';
import * as articleRevisions from '../functions/api/article-revisions.js';
import * as articleSchedule from '../functions/api/article-schedule.js';
import * as botWebhook from '../functions/api/bot-webhook.js';
import * as chat from '../functions/api/chat.js';
import * as coinsWallet from '../functions/api/coins-wallet.js';
import * as computeFeed from '../functions/api/compute-feed.js';
import * as contactNotify from '../functions/api/contact-notify.js';
import * as embedData from '../functions/api/embed-data.js';
import * as events from '../functions/api/events.js';
import * as feed from '../functions/api/feed.js';
import * as feedTrack from '../functions/api/feed-track.js';
import * as groupDashboard from '../functions/api/group-dashboard.js';
import * as groupOfDay from '../functions/api/group-of-day.js';
import * as groupVerify from '../functions/api/group-verify.js';
import * as groq from '../functions/api/groq.ts';
import * as gxpRewards from '../functions/api/gxp-rewards.js';
import * as healthCheck from '../functions/api/health-check.ts';
import * as jobsAi from '../functions/api/jobs-ai.js';
import * as jobsBoard from '../functions/api/jobs-board.js';
import * as lemonsqueezy from '../functions/api/lemonsqueezy.js';
import * as lemonsqueezyWebhook from '../functions/api/lemonsqueezy-webhook.js';
import * as linkAnalytics from '../functions/api/link-analytics.js';
import * as newsletterDigest from '../functions/api/newsletter-digest.js';
import * as newsletterSubscribe from '../functions/api/newsletter-subscribe.js';
import * as ownerDashboard from '../functions/api/owner-dashboard.js';
import * as plagiarismCheck from '../functions/api/plagiarism-check.js';
import * as purgeDeleted from '../functions/api/purge-deleted.js';
import * as pushSubscribe from '../functions/api/push-subscribe.js';
import * as recommendations from '../functions/api/recommendations.js';
import * as referral from '../functions/api/referral.js';
import * as referralTrack from '../functions/api/referral-track.js';
import * as sellerDashboard from '../functions/api/seller-dashboard.js';
import * as shorten from '../functions/api/shorten.js';
import * as storeAi from '../functions/api/store-ai/index.js';
import * as validate from '../functions/api/validate.ts';
import * as validateListing from '../functions/api/validate-listing.js';
import * as widget from '../functions/api/widget.js';

// ── /api/account/* handlers ────────────────────────────────────────
import * as accountDelete from '../functions/api/account/delete.js';
import * as accountExport from '../functions/api/account/export.js';
import * as accountPreferences from '../functions/api/account/preferences.js';

// ── Non-/api handlers ──────────────────────────────────────────────
import * as sitemap from '../functions/sitemap.xml.js';

// ── Middleware ─────────────────────────────────────────────────────
import * as adminGate from '../functions/api/_shared/admin-gate.js';

/**
 * Route table: pathname → handler module.
 *
 * Paths mirror the file layout under `functions/` exactly so this table
 * is a 1:1 map of the old Pages file-based routing.
 */
const ROUTES = {
    '/api/ab-test-assign': abTestAssign,
    '/api/analytics-event': analyticsEvent,
    '/api/article-ai': articleAi,
    '/api/article-analytics': articleAnalytics,
    '/api/article-collaborate': articleCollaborate,
    '/api/article-paywall': articlePaywall,
    '/api/article-revisions': articleRevisions,
    '/api/article-schedule': articleSchedule,
    '/api/bot-webhook': botWebhook,
    '/api/chat': chat,
    '/api/coins-wallet': coinsWallet,
    '/api/compute-feed': computeFeed,
    '/api/contact-notify': contactNotify,
    '/api/embed-data': embedData,
    '/api/events': events,
    '/api/feed': feed,
    '/api/feed-track': feedTrack,
    '/api/group-dashboard': groupDashboard,
    '/api/group-of-day': groupOfDay,
    '/api/group-verify': groupVerify,
    '/api/groq': groq,
    '/api/gxp-rewards': gxpRewards,
    '/api/health-check': healthCheck,
    '/api/jobs-ai': jobsAi,
    '/api/jobs-board': jobsBoard,
    '/api/lemonsqueezy': lemonsqueezy,
    '/api/lemonsqueezy-webhook': lemonsqueezyWebhook,
    '/api/link-analytics': linkAnalytics,
    '/api/newsletter-digest': newsletterDigest,
    '/api/newsletter-subscribe': newsletterSubscribe,
    '/api/owner-dashboard': ownerDashboard,
    '/api/plagiarism-check': plagiarismCheck,
    '/api/purge-deleted': purgeDeleted,
    '/api/push-subscribe': pushSubscribe,
    '/api/recommendations': recommendations,
    '/api/referral': referral,
    '/api/referral-track': referralTrack,
    '/api/seller-dashboard': sellerDashboard,
    '/api/shorten': shorten,
    '/api/store-ai': storeAi,
    '/api/validate': validate,
    '/api/validate-listing': validateListing,
    '/api/widget': widget,

    '/api/account/delete': accountDelete,
    '/api/account/export': accountExport,
    '/api/account/preferences': accountPreferences,

    '/sitemap.xml': sitemap
};

/**
 * Map a `Request` + handler module onto the Pages Function export that
 * should serve it. Preserves the Pages behaviour where method-specific
 * exports (`onRequestPost` / `onRequestGet` / `onRequestOptions`) take
 * precedence over the catch-all `onRequest`, and an unsupported method
 * produces a 405 when no matching export exists.
 */
function pickHandler(module, method) {
    if (method === 'OPTIONS' && typeof module.onRequestOptions === 'function') {
        return module.onRequestOptions;
    }
    if (method === 'GET' && typeof module.onRequestGet === 'function') {
        return module.onRequestGet;
    }
    if (method === 'POST' && typeof module.onRequestPost === 'function') {
        return module.onRequestPost;
    }
    if (method === 'PUT' && typeof module.onRequestPut === 'function') {
        return module.onRequestPut;
    }
    if (method === 'DELETE' && typeof module.onRequestDelete === 'function') {
        return module.onRequestDelete;
    }
    if (method === 'PATCH' && typeof module.onRequestPatch === 'function') {
        return module.onRequestPatch;
    }
    if (typeof module.onRequest === 'function') {
        return module.onRequest;
    }
    return null;
}

/**
 * Compute the allowed methods for a handler module to correctly populate
 * the Allow header on a 405 response (RFC 7231 §6.5.5).
 */
function getAllowedMethods(module) {
    if (typeof module.onRequest === 'function') {
        return 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
    }
    const allowed = [];
    if (typeof module.onRequestGet === 'function') allowed.push('GET');
    if (typeof module.onRequestPost === 'function') allowed.push('POST');
    if (typeof module.onRequestPut === 'function') allowed.push('PUT');
    if (typeof module.onRequestDelete === 'function') allowed.push('DELETE');
    if (typeof module.onRequestPatch === 'function') allowed.push('PATCH');
    if (typeof module.onRequestOptions === 'function') allowed.push('OPTIONS');
    return allowed.length > 0 ? allowed.join(', ') : 'GET, POST, OPTIONS';
}

/**
 * Reconstruct the Cloudflare Pages Function `context` object that every
 * handler under `functions/` expects. The Worker runtime hands us
 * `(request, env, ctx)` instead, so we adapt the shape here.
 */
function buildPagesContext(request, env, ctx) {
    return {
        request,
        env,
        params: {},
        data: {},
        waitUntil: ctx.waitUntil.bind(ctx),
        passThroughOnException: ctx.passThroughOnException.bind(ctx),
        // `next()` is only meaningful for Pages middleware chains, which
        // this project does not use. Returning a 404 keeps the contract
        // safe if a handler ever calls it.
        next: () => new Response('Not Found', { status: 404 })
    };
}

/**
 * Dispatch a cron event to the endpoint that used to be triggered by
 * the matching Cloudflare Pages cron in the dashboard.
 *
 * Every cron endpoint enforces `X-Cron-Secret` against `env.CRON_SECRET`
 * (H-7) so we forge an internal `Request` with that header. If
 * `CRON_SECRET` is unset the handler will fail closed with HTTP 503,
 * matching the pre-migration behaviour.
 *
 * Keep this table aligned with the `[triggers].crons` list in
 * wrangler.toml and the §Manual cron invocation section of RUNBOOK.md.
 */
const CRON_DISPATCH = {
    // Feed algorithm — trending scores, every 30 minutes
    '*/30 * * * *': { path: '/api/compute-feed', method: 'POST', body: '{}' },
    // Scheduled article publishing — every 15 minutes
    '*/15 * * * *':  { path: '/api/article-schedule', method: 'GET' },
    // Weekly newsletter digest — Mondays at 13:00 UTC
    '0 13 * * 1':   { path: '/api/newsletter-digest', method: 'GET' },
    // Hard-delete soft-deleted users past their grace window — 03:17 UTC daily
    '17 3 * * *':   { path: '/api/purge-deleted', method: 'POST', body: '{}' }
};

async function runCron(cronSpec, env, ctx) {
    const job = CRON_DISPATCH[cronSpec];
    if (!job) {
        console.error('cron: no dispatch entry for schedule', cronSpec);
        return;
    }

    const module = ROUTES[job.path];
    if (!module) {
        console.error('cron: no route registered for', job.path);
        return;
    }

    const headers = {
        'X-Cron-Secret': env.CRON_SECRET || '',
        'X-Cron-Internal': 'true',
        'Content-Type': 'application/json',
        'User-Agent': 'groupsmix-worker-cron/1.0'
    };

    const init = { method: job.method, headers };
    if (job.body !== undefined) init.body = job.body;

    const request = new Request(`https://groupsmix.com${job.path}`, init);
    const handler = pickHandler(module, job.method);
    if (!handler) {
        console.error('cron: no handler export for', job.path, job.method);
        return;
    }

    const context = buildPagesContext(request, env, ctx);
    try {
        const res = await handler(context);
        if (res && typeof res.status === 'number' && res.status >= 400) {
            // Drain body so the log carries the failure reason.
            const text = await res.text().catch(() => '');
            console.error('cron', cronSpec, job.path, 'status', res.status, text.slice(0, 500));
        }
    } catch (err) {
        console.error('cron handler threw:', cronSpec, job.path, err && err.stack ? err.stack : err);
    }
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // C2, H1, M1: Intercept /admin/* requests with the server-side admin gate
        if (url.pathname.startsWith('/admin/') || url.pathname === '/admin') {
            const context = buildPagesContext(request, env, ctx);
            // Change next() so that on success, we proxy to the static asset
            context.next = () => env.ASSETS.fetch(request);
            
            try {
                return await adminGate.onRequest(context);
            } catch (err) {
                console.error('admin-gate middleware error:', url.pathname, err && err.stack ? err.stack : err);
                return new Response('Internal Server Error', { status: 500 });
            }
        }

        const module = ROUTES[url.pathname];

        if (module) {
            const handler = pickHandler(module, request.method);
            if (!handler) {
                const allow = getAllowedMethods(module);
                return new Response('Method Not Allowed', {
                    status: 405,
                    headers: { Allow: allow }
                });
            }

            const context = buildPagesContext(request, env, ctx);
            try {
                return await handler(context);
            } catch (err) {
                console.error('worker fetch error:', url.pathname, err && err.stack ? err.stack : err);
                return new Response('Internal Server Error', { status: 500 });
            }
        }

        // Fall through to the static-assets binding so Astro-built HTML,
        // CSS, JS, images, sw.js, manifest.json, etc. are served the
        // same way Cloudflare Pages served them. The `not_found_handling`
        // setting in wrangler.toml controls 404 behaviour (see `assets`).
        return env.ASSETS.fetch(request);
    },

    async scheduled(event, env, ctx) {
        ctx.waitUntil(runCron(event.cron, env, ctx));
    }
};
