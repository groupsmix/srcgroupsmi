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

## 2. Cloudflare Logpush → Axiom / R2

Cloudflare Pages emits the following log datasets:

- `pages_function_invocation_logs` — per-function invocation outcome
- `http_requests` — all edge requests (used for access logs)
- `workers_trace_events` — trace events from Workers/Pages Functions

### 2.1 Retention policy

| Dataset | Hot (Axiom / R2 standard) | Cold (R2 / deletion) | Rationale |
| --- | --- | --- | --- |
| `http_requests` | **7 days** | Deleted at 30 days | High volume, low per-event value once an incident passes; 7-day hot window matches the longest incident review cycle. |
| `pages_function_invocation_logs` | **30 days** | Deleted at 90 days | Needed for webhook replay debugging and payment reconciliation disputes (LemonSqueezy supports ~45-day chargeback windows). |
| `workers_trace_events` | **14 days** | Deleted at 30 days | Tracing data is only useful while correlated with recent deployments. |
| Audit logs (`dsar_audit` in Supabase) | Indefinite | Governed by Supabase retention (see `docs/backups.md`) | Required for GDPR DSAR responses. |

All retention windows are enforced at the **destination**, not in Cloudflare
Logpush itself (Logpush just forwards). See §2.2 / §2.3 below for how to
encode each policy in the respective destination.

### 2.2 Option A: Axiom

1. Create an Axiom dataset, e.g. `cloudflare-pages-groupsmix`.
2. Generate an Axiom ingest token.
3. In Cloudflare dashboard → **Analytics & Logs → Logpush → Create a Logpush
   job** using the HTTP destination:

   ```
   https://api.axiom.co/v1/datasets/cloudflare-pages-groupsmix/ingest?timestamp-field=EdgeStartTimestamp
   Authorization: Bearer <AXIOM_INGEST_TOKEN>
   ```

4. Create **one dataset per row in §2.1** (mixing retention windows inside a
   single Axiom dataset is not supported):

   | Dataset name | Cloudflare dataset | Axiom retention |
   | --- | --- | --- |
   | `cf-http-requests` | `http_requests` | 30 days |
   | `cf-pages-functions` | `pages_function_invocation_logs` | 90 days |
   | `cf-workers-trace` | `workers_trace_events` | 30 days |

5. Set retention in Axiom under **Dataset settings → Retention**. Axiom
   enforces deletion automatically at the configured window.
6. Logpush filter — for `http_requests`, drop healthcheck + asset noise so
   hot storage stays cheap:

   ```
   not (ClientRequestPath in {"/health", "/favicon.ico"} or
        ClientRequestPath starts_with "/assets/")
   ```

### 2.3 Option B: Cloudflare R2

1. Create a bucket `gm-logs` and an API token with `Object Write` on it.
2. In Cloudflare dashboard → **Logpush → Create a Logpush job** using the
   R2 destination, with one job per dataset so lifecycle rules can be
   scoped by path prefix:

   ```
   r2://gm-logs/http-requests/{DATE}/
   r2://gm-logs/pages-functions/{DATE}/
   r2://gm-logs/workers-trace/{DATE}/
   ```

3. In the R2 bucket → **Lifecycle rules**, add:

   ```jsonc
   // http-requests: 7 days standard, delete at 30
   { "prefix": "http-requests/",    "transition": 7,  "expiration": 30 }
   // pages-functions: 30 days standard, delete at 90
   { "prefix": "pages-functions/",  "transition": 30, "expiration": 90 }
   // workers-trace: 14 days standard, delete at 30
   { "prefix": "workers-trace/",    "transition": 14, "expiration": 30 }
   ```

   (R2 does not currently expose Glacier; "transition" above is a placeholder
   for the Infrequent Access class when it ships. Until then, only the
   `expiration` day counts.)

4. Quarterly: run `scripts/verify-log-retention.sh` (TBD — tracked in
   `RUNBOOK.md`) to list objects older than their expiration and confirm
   the lifecycle rule is actually deleting them.

### 2.4 Required secrets

| Variable | Purpose |
| --- | --- |
| `AXIOM_INGEST_TOKEN` | Only if using Axiom. Stored at the Cloudflare Logpush job level — **not** as a Pages env var. |
| `R2_LOGS_ACCESS_KEY_ID` / `R2_LOGS_SECRET_ACCESS_KEY` | Only if using R2. Same — job-level. |

Neither token is read by application code; they are used by Cloudflare's
managed Logpush runner. This doc only exists so the config is reviewable
alongside the rest of the repo.

## 3. Product analytics — Plausible

GroupsMix uses [Plausible Analytics](https://plausible.io/) for product
analytics. Plausible was chosen over GA4 / PostHog because:

- **Cookieless** — no consent banner required under GDPR / ePrivacy.
- **No PII** — IPs are hashed and dropped, page URLs are stored without
  query-string values.
- **Lightweight** — < 1 KB client script, no bundle impact.

### Client loader

Module: [`public/assets/js/shared/plausible.js`](../public/assets/js/shared/plausible.js).

The loader is a no-op when any of the following are true:

- `window.PLAUSIBLE_CONFIG.domain` is empty.
- The browser sends `DNT: 1`.
- `localStorage['gm-analytics-optout'] === '1'` (user opted out via the
  cookie-consent / privacy preferences UI).
- The page is an admin route (`/gm-ctrl*`).

Build-time wiring: [`scripts/stamp-site-config.js`](../scripts/stamp-site-config.js)
rewrites the `PLAUSIBLE_CONFIG` block in the built
`dist/assets/js/site-config.js` using these env vars:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_PLAUSIBLE_DOMAIN` | Your Plausible site domain (e.g. `groupsmix.com`). |
| `PUBLIC_PLAUSIBLE_HOST` | Optional. Self-hosted Plausible origin. Defaults to `https://plausible.io`. |
| `PUBLIC_PLAUSIBLE_VARIANT` | Optional. `script.outbound-links.js` by default. |

Custom events can be fired from any page script:

```js
window.plausible?.('Signup', { props: { plan: 'pro' } });
```

The loader pre-queues events fired before the CDN script finishes
loading, so calls at page load are safe.

### Verification

Unit coverage for the loader lives at
[`tests/plausible.test.js`](../tests/plausible.test.js) and exercises the
no-op cases (no config, DNT, admin routes, opt-out), the happy path, and
the pre-init event queue.

## 4. Status

| Component | Status |
| --- | --- |
| Client Sentry loader | **Scaffold committed** — inert until `PUBLIC_SENTRY_DSN` is set. Wired into `BaseLayout.astro`. |
| Edge Sentry helper | **Scaffold committed** — inert until `SENTRY_DSN_EDGE` is set. |
| Plausible analytics | **Wired** — inert until `PUBLIC_PLAUSIBLE_DOMAIN` is set. See §3. |
| Cloudflare Logpush → Axiom/R2 | **Documented** — set up via dashboard, no code required. Retention policy in §2.1. |
| Sentry alert rules | **Documented** — see [`alerts.md`](./alerts.md). |
| SLOs / error budgets | **Documented** — see [`slos.md`](./slos.md). |

Follow-ups:

- Wire `captureEdgeException` into the highest-risk handlers
  (`lemonsqueezy-webhook`, `compute-feed`, `owner-dashboard`).
- Add a build step that stamps `PUBLIC_SENTRY_RELEASE = groupsmix@<git-sha>`
  so front- and back-end releases match.
- Turn on Logpush once the destination is provisioned.
- Provision the Plausible site + external uptime probe (BetterStack).
