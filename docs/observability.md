# Observability (scaffold)

This document describes the **current scaffolding** for Sentry, Cloudflare
Logpush, and product analytics. Nothing in here is switched on by default —
each component activates only when its DSN / destination / domain is
configured via environment variables or the Cloudflare dashboard.

## Index

- §1 — Sentry (client + edge) — [alert rules live in `observability/sentry/`](../observability/sentry/README.md) (H-1).
- §2 — Cloudflare Logpush → Axiom / R2 — [declarative job + retention config in `observability/logpush/`](../observability/logpush/README.md) (H-2).
- §3 — Product analytics (Plausible / PostHog) (H-3).
- §4 — Overall status.

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

## 2. Cloudflare Logpush → Axiom / R2

Cloudflare Pages emits the following log datasets:

- `pages_function_invocation_logs` — per-function invocation outcome
- `http_requests` — all edge requests (used for access logs)
- `workers_trace_events` — trace events from Workers/Pages Functions

### Option A: Axiom

1. Create an Axiom dataset, e.g. `cloudflare-pages-groupsmix`.
2. Generate an Axiom ingest token.
3. In Cloudflare dashboard → **Analytics & Logs → Logpush → Create a Logpush
   job** using the HTTP destination:

   ```
   https://api.axiom.co/v1/datasets/cloudflare-pages-groupsmix/ingest?timestamp-field=EdgeStartTimestamp
   Authorization: Bearer <AXIOM_INGEST_TOKEN>
   ```

4. Select the `http_requests` dataset and scope it to the GroupsMix zone /
   Pages project. Repeat for `pages_function_invocation_logs`.

### Option B: Cloudflare R2

1. Create a bucket (e.g. `gm-logs`) and an API token with `Object Write` on it.
2. In Cloudflare dashboard → **Logpush → Create a Logpush job** using the
   R2 destination, pointing at `r2://gm-logs/pages-functions/{DATE}/`.
3. Retention: use the R2 Lifecycle UI to age objects to Glacier-equivalent
   or delete after N days.

### Required secrets

| Variable | Purpose |
| --- | --- |
| `AXIOM_INGEST_TOKEN` | Only if using Axiom. Stored at the Cloudflare Logpush job level — **not** as a Pages env var. |
| `R2_LOGS_ACCESS_KEY_ID` / `R2_LOGS_SECRET_ACCESS_KEY` | Only if using R2. Same — job-level. |

Neither token is read by application code; they are used by Cloudflare's
managed Logpush runner. This doc only exists so the config is reviewable
alongside the rest of the repo.

## 3. Product analytics (Plausible / PostHog)

Loader: [`public/assets/js/shared/analytics.js`](../public/assets/js/shared/analytics.js).
Seed: [`public/assets/js/shared/observability-config.js`](../public/assets/js/shared/observability-config.js).
Stamp: [`scripts/stamp-observability-config.js`](../scripts/stamp-observability-config.js).

### Default: Plausible

Plausible is the default because it is **cookieless**, respects DNT out of
the box, and does not require a consent banner under GDPR/ePrivacy. The
loader is inert until `PUBLIC_PLAUSIBLE_DOMAIN` is set at build time.

Required Cloudflare Pages build variables:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_PLAUSIBLE_DOMAIN` | The domain Plausible tracks as (e.g. `groupsmix.com`). |
| `PUBLIC_PLAUSIBLE_API_HOST` | Optional — defaults to `https://plausible.io`. Override to point at self-hosted. |

The loader refuses to run when any of these are true:

- `navigator.doNotTrack === '1'` or `'yes'`.
- The current path starts with `/gm-ctrl` (admin console — never track).
- `window.__gm_cookie_consent === false` (consent explicitly denied).

Once loaded, emit custom events with the uniform wrapper:

```js
window.GMAnalytics.track('CTA clicked', { location: 'hero' });
```

Calls before the Plausible script has finished loading are queued and
replayed when it is ready, so nothing needs to guard on readiness.

### Alternative: PostHog

PostHog is supported via the same loader by setting
`window.PLAUSIBLE_CONFIG = { provider: 'posthog', apiKey, apiHost }` in
the stamp script. Session recording is disabled by default; persistence
is forced to `memory` so PostHog never writes cookies.

PostHog requires a consent banner under GDPR/ePrivacy; wire
`__gm_cookie_consent` before opting users in.

### CSP

Plausible is allow-listed in [`public/_headers`](../public/_headers) on
both `script-src` (to load `https://plausible.io/js/script.js`) and
`connect-src` (to send events to `https://plausible.io`). The Sentry
browser CDN (`https://browser.sentry-cdn.com`) and all regional Sentry
ingest hosts (`https://*.ingest.sentry.io`, `.us.`, `.de.`) are
allow-listed for §1.

### Tests

- [`tests/analytics.test.js`](../tests/analytics.test.js) — loader
  behaviour: inert states, queueing, DNT, admin gate, PostHog branch.
- [`tests/stamp-observability-config.test.js`](../tests/stamp-observability-config.test.js) —
  build-time stamping, validation, injection escaping.

## 4. Status

| Component | Status |
| --- | --- |
| Client Sentry loader | **Scaffold committed** — inert until `PUBLIC_SENTRY_DSN` is set. |
| Edge Sentry helper | **Scaffold committed** — inert until `SENTRY_DSN_EDGE` is set. |
| Sentry alert rules (H-1) | **Declarative spec committed** — see `observability/sentry/alert-rules.json`. Apply via Sentry REST API. |
| Cloudflare Logpush → Axiom/R2 (H-2) | **Declarative config committed** — see `observability/logpush/`. Apply via Cloudflare API. |
| Product analytics (H-3) | **Loader committed + tested** — inert until `PUBLIC_PLAUSIBLE_DOMAIN` is set. |

Follow-ups:

- Wire `captureEdgeException` into the highest-risk handlers
  (`lemonsqueezy-webhook`, `compute-feed`, `owner-dashboard`).
- Add a build step that stamps `PUBLIC_SENTRY_RELEASE = groupsmix@<git-sha>`
  so front- and back-end releases match.
- Turn on Logpush once the destination is provisioned.
- Once Plausible is live in production, audit which CTAs / funnels we
  actually track and prune/extend via `GMAnalytics.track(...)`.
