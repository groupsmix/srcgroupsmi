# RUNBOOK

Tracking issue: **H-5**.

This is the day-to-day operations guide for GroupsMix. For restore and
cutover steps see [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md); for
backup policy see [`docs/backups.md`](./docs/backups.md); for SLOs and
error budgets see [`docs/slos.md`](./docs/slos.md); for the expected
Cloudflare bindings and env vars see [`wrangler.toml`](./wrangler.toml)
and [`.env.example`](./.env.example).

> **Platform migration note (pre-launch):** GroupsMix was migrated from
> Cloudflare **Pages** to Cloudflare **Workers + Static Assets** while
> still pre-launch. The authoritative edge config is now
> [`wrangler.toml`](./wrangler.toml) and the Worker entry is
> [`src/worker.js`](./src/worker.js). Wherever the text below says
> "Cloudflare Pages → `gm-prod`", read it as "Cloudflare **Workers &
> Pages** → `groupsmix` Worker". Wherever it says "Functions
> invocation logs" / "Functions → Invocation logs", read it as the
> Worker's **Logs** tab (or `wrangler tail` from a shell). Secret and
> environment-variable management moved from the Pages project's
> Settings → Environment variables into the Worker's Settings →
> Variables (or `wrangler secret put <NAME>`). Cron Triggers moved
> from the Pages dashboard into `wrangler.toml` `[triggers].crons`
> and are dispatched by the Worker's `scheduled` handler. A follow-up
> pass to rewrite the dashboard paths throughout this file is
> tracked; the procedures themselves are unchanged.

All commands below assume `gm-prod` is the prod Cloudflare project
(now a Worker, previously a Pages project) and `gm-prod-supabase` is
the prod Supabase project. Substitute the real slugs from your
1Password / ops vault if they differ.

---

## Contents

1. [On-call basics](#1-on-call-basics)
2. [Incident response playbooks](#2-incident-response-playbooks)
3. [Maintenance mode](#3-maintenance-mode)
4. [Manual cron invocation](#4-manual-cron-invocation)
5. [Secret rotation](#5-secret-rotation)
6. [Deploy / rollback](#6-deploy--rollback)
7. [Database operations](#7-database-operations)
8. [SLO review](#8-slo-review)

---

## 1. On-call basics

### Primary dashboards

- **Cloudflare Pages** → `gm-prod` project: deploys, Functions
  invocation logs, error rate.
- `gm-ctrl-x7` endpoint and `functions/gm-ctrl-x7.js` have been retired and replaced by `/admin/*`. The server-side admin gate logic now protects `/admin/*` directly via `src/worker.js`.
- **Cloudflare Analytics** → zone `groupsmix.com`: edge status codes,
  cache hit ratio, bot score distribution.
- **Supabase** → `gm-prod-supabase`: Database → Reports (connections,
  slow queries), Auth → Logs, Storage usage.
- **Sentry** → projects `groupsmix-web` (browser) and
  `groupsmix-edge` (Pages Functions); see
  [`docs/observability.md`](./docs/observability.md). Alert-rule spec
  in [`docs/sentry-alerts.md`](./docs/sentry-alerts.md).
- **Axiom** → dataset `cloudflare-pages-groupsmix`, fed by Cloudflare
  Logpush. Primary surface for SLO computation and post-incident
  queries. R2 bucket `gm-logs` is the 90-day archive. See
  [`docs/logpush.md`](./docs/logpush.md).
- **Status page / external probe** (the uptime monitor configured per
  [`docs/slos.md §4`](./docs/slos.md)).

### Severity definitions

| Severity | Criteria | Initial response |
|----------|----------|------------------|
| SEV-1 | Site fully unreachable OR data integrity incident OR webhook silent-drop | Page on-call within 5 min; create incident channel |
| SEV-2 | Partial outage (1+ API surface down) OR SLO-A1 burning > 14.4× | Ack within 15 min; open ticket |
| SEV-3 | Single cron job failing OR degraded perf | Triage within 1 business day |
| SEV-4 | Cosmetic / low-impact bug | Backlog |

### First five minutes of any incident

1. Acknowledge the page / alert. Create a thread in the ops channel
   titled `INCIDENT <UTC timestamp> <short description>`.
2. Check the external probe and Cloudflare Health Checks — is the
   site actually down, or is it a false positive?
3. Check the Cloudflare status page (<https://www.cloudflarestatus.com>)
   and the Supabase status page
   (<https://status.supabase.com>). If upstream is red, note the
   incident and proceed to [§2.6](#26-upstream-outage-cloudflare-or-supabase).
4. Check for recent deploys in Cloudflare Pages — if a deploy in the
   last 30 minutes correlates with the regression, prepare to roll
   back per [§6.2](#62-rollback).
5. Post an initial status to the status page (if a user-facing
   outage). Keep updates cadenced at every 15–30 min until resolved.

## 2. Incident response playbooks

### 2.1 Site 5xx spike

**Symptom:** SLO-S1 burning, Cloudflare analytics shows rising 5xx,
external probe RED.

1. In Cloudflare Pages → `gm-prod` → Functions → Invocation logs,
   filter by `Outcome != 'ok'` and pick a recent failing invocation.
   The per-invocation logs show the thrown exception.
2. Sentry `groupsmix-edge` will have the same error grouped; use the
   release hash to correlate with the most recent deploy.
3. If the regression is tied to a recent deploy, roll back
   ([§6.2](#62-rollback)).
4. If not, check Supabase Reports → Query performance for a slow or
   failing query. A runaway query can starve the connection pool and
   surface as 5xx on every API route.
5. If Supabase itself is down, enable maintenance mode
   ([§3](#3-maintenance-mode)) so the marketing surface still serves
   static content cleanly and the API returns a consistent 503.

### 2.2 API error rate spike on a single endpoint

1. Identify the endpoint in Cloudflare Pages → Invocation logs.
2. `rg <endpoint>` in `functions/api/` to find the handler.
3. For payment endpoints (`lemonsqueezy-webhook`, `coins-wallet`):
   treat as **SEV-1** until you have confirmed no double-credit /
   silent-drop occurred. Query `coins_ledger` for anomalies:

   ```sql
   -- Look for duplicate credits from webhook events in the last hour
   SELECT order_id, COUNT(*)
   FROM coins_ledger
   WHERE created_at > now() - interval '1 hour'
     AND source = 'lemonsqueezy'
   GROUP BY order_id HAVING COUNT(*) > 1;
   ```

4. For AI endpoints (`article-ai`, `jobs-ai`, `store-ai`, `chat`,
   `groq`): a 5xx spike here usually means a provider outage. Check
   Groq / OpenRouter status first before digging into code.

### 2.3 Cron job failing (SLO-C1 burn)

1. Find which job: Pages → Invocation logs filtered by the endpoint
   path (`/api/compute-feed`, `/api/purge-deleted`,
   `/api/newsletter-digest`, `/api/article-schedule`).
2. If the job is returning `503` with
   `"error":"Service not configured"` — `CRON_SECRET` is missing or
   the Supabase env vars are missing. Re-apply them in
   Pages → Settings → Environment variables.
3. If the job is returning `401` — the scheduler is not sending
   `X-Cron-Secret`, or the rotated secret didn't propagate. See
   [§5.1](#51-rotate-cron_secret).
4. If the job is 200-ing but leaving the system in a bad state, run
   the per-job checks in [§4](#4-manual-cron-invocation) and add the
   finding to the incident timeline.

### 2.4 Webhook silent drop (SEV-1)

Any scenario where LemonSqueezy reports a successful delivery but
`coins_ledger` has no corresponding row.

1. **Do not retry blindly.** Freeze the webhook first if you have
   access to the LemonSqueezy dashboard (Webhooks → Pause).
2. Pull the raw delivery from LemonSqueezy → Webhooks → History.
3. Verify the signature locally using
   `functions/api/_shared/webhook-verify.js` and the `.env`
   `LEMONSQUEEZY_WEBHOOK_SECRET`.
4. Re-play the delivery only after you have confirmed the code path
   that would have processed it, AND the upstream delivery is not
   already present in `coins_ledger`.
5. Open a SEV-1 post-incident review; webhook drops are a repeat
   offender class and deserve a root-cause note in the review, not
   just a fix commit.

### 2.5 Auth / Turnstile failures

- If every login fails with a Turnstile error, verify
  `TURNSTILE_SECRET_KEY` is set correctly on the Pages project and
  that the public site key embedded in the client matches. A
  mismatch surfaces as an opaque "challenge failed" on signup.
- If only some users fail, check the Supabase Auth → Logs for the
  underlying error (rate-limited email sender is the usual cause).

### 2.6 Upstream outage (Cloudflare or Supabase)

- **Cloudflare zone-wide:** our only option is to wait. Post to the
  status page, do not attempt a DNS cutover — we do not have a
  secondary edge provisioned (see `DISASTER_RECOVERY.md §3`).
- **Supabase project-wide:** enable maintenance mode
  ([§3](#3-maintenance-mode)) so the API returns a consistent 503
  instead of timing out. The marketing surface continues to serve.
  Do NOT attempt to swap the `SUPABASE_URL` to a restored snapshot
  mid-incident unless the primary is declared lost by Supabase — see
  `DISASTER_RECOVERY.md §4`.

## 3. Maintenance mode

The `maintenance_mode` table (migration `007_maintenance_mode.sql`)
toggles a project-wide flag that API handlers and the frontend
check. Enable by flipping a row in Supabase, not by editing code.

```sql
-- Enable maintenance mode
UPDATE maintenance_mode SET enabled = true, message = 'Back shortly',
       updated_at = now()
WHERE id = 1;

-- Disable
UPDATE maintenance_mode SET enabled = false, updated_at = now()
WHERE id = 1;
```

While maintenance mode is on:

- API surfaces refuse user-mutating requests with a consistent 503.
- Read-only browsing of cached pages continues (Cloudflare serves
  stale `Cache-Control` content).
- Cron jobs still run unless paused — pause them in the Pages
  dashboard if they will exacerbate the incident.

## 4. Manual cron invocation

All four cron endpoints require the same `X-Cron-Secret` header
(see H-7 and the comment block in [`wrangler.toml`](./wrangler.toml)).
Pull `CRON_SECRET` from your ops vault; never paste it into a shared
channel.

```bash
export CRON_SECRET="<from ops vault>"
export BASE="https://groupsmix.com"

# Feed algorithm (full sweep)
curl -fsS -X POST "$BASE/api/compute-feed" \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -d '{"job":"all"}'

# Publish scheduled articles
curl -fsS "$BASE/api/article-schedule" \
  -H "X-Cron-Secret: $CRON_SECRET"

# Generate and queue weekly digest
curl -fsS "$BASE/api/newsletter-digest" \
  -H "X-Cron-Secret: $CRON_SECRET"

# Hard-delete soft-deleted users past their grace window
curl -fsS -X POST "$BASE/api/purge-deleted" \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -d '{"limit":500}'
```

Expected responses:

| Status | Meaning |
|--------|---------|
| `200`  | Job ran; inspect response body for counts |
| `401`  | Secret header missing or wrong |
| `405`  | Wrong HTTP method (check above) |
| `503`  | `CRON_SECRET` or Supabase env vars not set on the project |
| `5xx`  | Upstream error; Sentry will have it |

A `compute-feed` run can take 30–90 seconds; `purge-deleted` and
`article-schedule` are usually sub-second.

## 5. Secret rotation

All secrets live in Cloudflare Pages → `gm-prod` → Settings →
Environment variables, as **Encrypted** values. Rotation is always a
two-commit dance: set the new secret with an alternate name first,
flip the consumer, retire the old secret.

### 5.1 Rotate `CRON_SECRET`

1. Generate a new value (32 random bytes, URL-safe base64):
   `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`.
2. Add `CRON_SECRET_NEXT` with the new value in the Pages dashboard
   for both Production and Preview. Redeploy (Pages → Deployments →
   Retry latest).
3. Update every scheduler (the external cron caller, whatever
   fan-out service dispatches to `/api/*`) to send the new value.
4. In `functions/api/_shared` add a temporary shim that accepts
   either `CRON_SECRET` or `CRON_SECRET_NEXT`, redeploy.
5. Once all traffic is on the new value (verify in Logpush), remove
   the shim and rename `CRON_SECRET_NEXT` → `CRON_SECRET` in the
   dashboard. Delete the old one last.

### 5.2 Rotate `LEMONSQUEEZY_WEBHOOK_SECRET`

1. In LemonSqueezy dashboard → Webhooks, click the target endpoint
   and generate a new signing secret. Copy the value.
2. In Cloudflare Pages, add the new value under a second variable
   `LEMONSQUEEZY_WEBHOOK_SECRET_NEXT`.
3. Update `functions/api/_shared/webhook-verify.js` to accept either
   secret (signature valid under old OR new) and redeploy.
4. Update the LemonSqueezy webhook to use only the new secret.
5. Remove the `_NEXT` variable and the dual-accept shim.

LemonSqueezy supports only one signing secret per webhook; do not
rotate without the shim or you will drop real deliveries.

### 5.3 Rotate `SUPABASE_SERVICE_KEY`

Requires Supabase dashboard → Project Settings → API → Generate new
`service_role` key. Generating a new key **invalidates the old one
immediately**, so coordinate:

1. In Cloudflare Pages, add the new value under a second variable
   `SUPABASE_SERVICE_KEY_NEXT` and redeploy a shim that reads the
   `_NEXT` first.
2. Click "Generate new key" in Supabase.
3. Copy the new value into `SUPABASE_SERVICE_KEY`, redeploy, remove
   the shim and the `_NEXT` variable.

Expect a 30–60 second window of 503s on API endpoints between step 2
and step 3. If that is unacceptable, enable maintenance mode first.

## 6. Deploy / rollback

### 6.1 Normal deploy

Pushing to `main` triggers an automatic Pages deploy. Watch the
deploy logs in Pages → Deployments → (latest) and verify:

1. `npm run build` finishes without warnings.
2. The CI workflow (`.github/workflows/ci.yml`) is green on the
   commit. Pages does not gate on CI — it will deploy a commit whose
   CI is red. Do not merge a red commit.
3. After deploy completes, hit the external probe URLs to confirm
   the site is healthy.

### 6.2 Rollback

From Cloudflare Pages → `gm-prod` → Deployments:

1. Find the last known good deployment (green checkmark, stable).
2. Click → "Rollback to this deployment". Rollback is effectively
   instant at the edge.
3. Open a revert PR against `main` that reverts the problem commit,
   so the codebase matches the deployed build and the next forward
   deploy does not re-ship the regression.

Do **not** force-push `main`.

## 7. Database operations

### 7.1 Running a migration

Migrations live in `supabase/migrations/` and run through the
Supabase CLI locally. They are NOT auto-applied to prod; an operator
applies them manually:

1. Review the migration in a PR; merge only after CI passes and
   `scripts/lint-security-definer.mjs` is green (enforces
   `search_path` pinning on every `SECURITY DEFINER` function —
   required by F-1 / F-029).
2. On the operator's laptop:

   ```bash
   supabase link --project-ref <gm-prod-ref>
   supabase db push
   ```

3. Confirm in Supabase → Database → Migrations that the new row
   appears.
4. For schema changes that alter a hot table, announce in the ops
   channel and run off-peak.

### 7.2 Ad-hoc read queries

Use Supabase SQL Editor with a **read-only role** — never the
service role — for incident debugging. Anything that writes to the
database during an incident must be captured in the incident
timeline.

### 7.3 Bulk cleanup

For large deletions, always:

1. Wrap in an explicit transaction.
2. Take a logical snapshot first (see
   [`docs/backups.md §2`](./docs/backups.md)).
3. Prefer calling an existing RPC (e.g. `cleanup_old_impressions`,
   `cleanup_old_sessions`, `purge_soft_deleted_users`) over raw
   `DELETE` — the RPCs pin `search_path` and emit the correct audit
   rows.

## 8. SLO review

On the first Monday of every month, fill in the table below and
file the result as a new row. See
[`docs/slos.md §4.2`](./docs/slos.md).

| Month  | SLO-S1 | SLO-A1 | SLO-C1 | SLO-W1 | Budget status | Notes |
|--------|--------|--------|--------|--------|---------------|-------|
| (YYYY-MM) |   |   |   |   | ok/burn/exhausted | link to post-mortems if any |

If any budget is exhausted, trigger the reliability policy in
[`docs/slos.md §5`](./docs/slos.md).
