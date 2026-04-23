# Observability (scaffold)

This document describes the **current scaffolding** for Sentry + Cloudflare
Logpush. Nothing in here is switched on by default — each component activates
only when its DSN / destination is configured via environment variables or the
Cloudflare dashboard.

## 1. Sentry

### Client (browser)

Loader: [`public/assets/js/shared/sentry.js`](../public/assets/js/shared/sentry.js).

The loader is a no-op until `window.SENTRY_CONFIG.dsn` is defined. The build
pipeline (`scripts/stamp-supabase-config.js` or equivalent) should stamp
something like:

```html
<script is:inline>
  window.SENTRY_CONFIG = {
    dsn: import.meta.env.PUBLIC_SENTRY_DSN,
    environment: import.meta.env.PUBLIC_ENVIRONMENT || 'production',
    release: import.meta.env.PUBLIC_SENTRY_RELEASE || undefined,
    tracesSampleRate: 0
  };
</script>
<script is:inline src="/assets/js/shared/sentry.js" defer></script>
```

Required Cloudflare Pages build variables:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_SENTRY_DSN` | Browser DSN (public). |
| `PUBLIC_SENTRY_RELEASE` | Usually `groupsmix@<git-sha>`. |
| `PUBLIC_ENVIRONMENT` | `production` \| `preview` \| `development`. |

The loader respects DoNotTrack and scrubs cookies via `beforeSend` before any
event leaves the browser.

### Edge (Cloudflare Pages Functions)

Helper: [`functions/api/_shared/sentry.js`](../functions/api/_shared/sentry.js).

```js
import { captureEdgeException } from './_shared/sentry.js';

export async function onRequest(ctx) {
    try {
        // handler work
    } catch (err) {
        ctx.waitUntil(captureEdgeException(ctx.env, err, {
            request: ctx.request,
            tags: { endpoint: 'lemonsqueezy-webhook' }
        }));
        throw err;
    }
}
```

Environment variables (set as Pages secrets):

| Variable | Purpose |
| --- | --- |
| `SENTRY_DSN_EDGE` | Server-side DSN. |
| `SENTRY_ENVIRONMENT` | Matches the client `PUBLIC_ENVIRONMENT`. |
| `SENTRY_RELEASE` | Matches the client `PUBLIC_SENTRY_RELEASE`. |

When `SENTRY_DSN_EDGE` is unset, `captureEdgeException` returns immediately
with no side effects — safe to call unconditionally.

### Alert rules

Sentry alert rules (issue alerts + metric alerts) are specified in
[`sentry-alerts.md`](./sentry-alerts.md). Thresholds mirror the
burn-rate table in [`slos.md §3.1`](./slos.md#31-burn-rate-alerting)
so that a Sentry page and an SLO page fire on the same fault.

## 2. Cloudflare Logpush → Axiom / R2

The full spec — datasets shipped, PII-safe field allow-list,
ready-to-run Cloudflare Logpush API payloads for Axiom and R2, and the
retention policy (**90 days total, tiered at 30d**) — lives in
[`logpush.md`](./logpush.md). That document is the source of truth for
the Logpush jobs; keep it in sync with the provisioned config.

Summary:

- Datasets shipped: `http_requests`, `pages_function_invocation_logs`,
  `workers_trace_events`.
- Primary destination: Axiom (query surface). Archive: R2 (cold).
- Retention: 30 days hot / 60 days cold, then deleted. See
  [`logpush.md §4`](./logpush.md#4-retention-policy).

## 3. Product analytics (Plausible)

GroupsMix uses [Plausible][plausible] for product analytics —
cookieless, no cross-site tracking, GDPR-friendly by default. The
loader ([`public/assets/js/shared/analytics.js`](../public/assets/js/shared/analytics.js))
is inert unless `PUBLIC_PLAUSIBLE_DOMAIN` is set at build time, and
respects both DoNotTrack and the `gm_cookie_consent = rejected`
signal so opted-out users see no beacon.

### Build-time wiring

[`scripts/stamp-analytics-config.js`](../scripts/stamp-analytics-config.js)
runs after `astro build` and stamps the following into
`dist/assets/js/shared/analytics-config.js`:

```js
window.ANALYTICS_CONFIG = {
    plausible: {
        domain: 'groupsmix.com',
        src: 'https://plausible.io/js/script.outbound-links.tagged-events.js'
    }
};
```

Env vars:

| Variable                 | Purpose                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| `PUBLIC_PLAUSIBLE_DOMAIN`| Plausible site identifier (e.g. `groupsmix.com`). Loader is a no-op when unset. |
| `PUBLIC_PLAUSIBLE_SRC`   | Optional override for the Plausible script URL (proxy via Cloudflare Worker when set). Defaults to `script.outbound-links.tagged-events.js`. |

### Custom events

Anywhere in client JS:

```js
if (window.gmAnalytics) window.gmAnalytics.track('submit_group', { category: 'whatsapp' });
```

`gmAnalytics.track` queues events if Plausible has not finished loading
yet, so calling it at page-init time is safe.

## 4. Status

| Component | Status |
| --- | --- |
| Client Sentry loader | **Scaffold committed** — inert until `PUBLIC_SENTRY_DSN` is set. |
| Edge Sentry helper | **Scaffold committed** — inert until `SENTRY_DSN_EDGE` is set. |
| Sentry alert rules | **Specified** — [`sentry-alerts.md`](./sentry-alerts.md); provision via Sentry UI. |
| Cloudflare Logpush → Axiom/R2 | **Specified** — [`logpush.md`](./logpush.md); provision via Cloudflare API. |
| Plausible product analytics | **Wired** — inert until `PUBLIC_PLAUSIBLE_DOMAIN` is set. |

Follow-ups:

- Wire `captureEdgeException` into the highest-risk handlers
  (`lemonsqueezy-webhook`, `compute-feed`, `owner-dashboard`).
- Add a build step that stamps `PUBLIC_SENTRY_RELEASE = groupsmix@<git-sha>`
  so front- and back-end releases match.
- Provision Logpush destinations and the Sentry alert rules.

[plausible]: https://plausible.io/
