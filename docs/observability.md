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

## 3. Status

| Component | Status |
| --- | --- |
| Client Sentry loader | **Scaffold committed** — inert until `PUBLIC_SENTRY_DSN` is set. |
| Edge Sentry helper | **Scaffold committed** — inert until `SENTRY_DSN_EDGE` is set. |
| Cloudflare Logpush → Axiom/R2 | **Documented** — set up via dashboard, no code required. |

Follow-ups:

- Wire `captureEdgeException` into the highest-risk handlers
  (`lemonsqueezy-webhook`, `compute-feed`, `owner-dashboard`).
- Add a build step that stamps `PUBLIC_SENTRY_RELEASE = groupsmix@<git-sha>`
  so front- and back-end releases match.
- Turn on Logpush once the destination is provisioned.
