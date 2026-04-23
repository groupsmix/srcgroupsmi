# Service Level Objectives (SLOs) and Error Budgets

Tracking issue: **H-4**.

This document defines GroupsMix's SLOs, the error budgets they imply,
and the mechanical process by which the team will measure and act on
them. It is deliberately narrow — start small, measure what we already
emit, and only widen scope once the first cycle has been run.

Nothing in here is a contractual SLA. These are internal targets used
to prioritize reliability work and to decide when to halt feature work
in favor of stability work (error-budget exhaustion).

---

## 1. Scope

GroupsMix is:

- A static Astro site served from Cloudflare Pages (the marketing and
  listing surface — mostly HTML/CSS/JS cached at the edge).
- Cloudflare Pages Functions (`functions/api/**`) providing the API and
  webhook surface.
- Supabase (Postgres + Auth + Storage) as the data plane, invoked
  exclusively from Pages Functions using the service-role key.
- A small set of cron-triggered jobs under `/api/compute-feed`,
  `/api/purge-deleted`, `/api/newsletter-digest`, and
  `/api/article-schedule` (see [`wrangler.toml`](../wrangler.toml)).

The SLOs below cover the three user-visible surfaces that matter for
the product promise: **page availability**, **API availability**, and
**cron job success**. Latency is tracked but not yet SLO'd — we will
add a latency SLO once we have at least 30 days of Logpush data to
pick a realistic target from.

## 2. SLO definitions

Each SLO is written in the `N% of <event class> over <window>` form.
All windows are **rolling 28 days** unless otherwise noted — this
matches Cloudflare's default analytics retention and is long enough
that a single bad hour cannot dominate the signal.

### 2.1 Site availability

> **SLO-S1:** 99.9% of HTTP requests to `https://groupsmix.com` and
> `https://www.groupsmix.com` return a status `< 500` over the rolling
> 28-day window.

- **Good events:** requests with `EdgeResponseStatus` in `[100, 500)`.
- **Bad events:** requests with `EdgeResponseStatus >= 500` or where
  `EdgeResponseStatus = 0` (dropped at edge).
- **Excluded:** requests with `EdgeResponseStatus` in `[300, 400)` from
  intentional redirects; 4xx responses that represent expected client
  errors (404 on a missing group slug, 401 on a logged-out API hit).
- **Source:** Cloudflare Logpush `http_requests` dataset, filtered to
  the GroupsMix zone.

### 2.2 API availability

> **SLO-A1:** 99.5% of requests to `/api/*` return a status `< 500`
> over the rolling 28-day window, excluding intentional 4xx responses
> and excluding cron-triggered endpoints.

- **Good events:** `pages_function_invocation_logs` rows where
  `Outcome = 'ok'` AND `StatusCode < 500`.
- **Bad events:** rows where `Outcome != 'ok'` OR `StatusCode >= 500`.
- **Excluded:** endpoints gated by `CRON_SECRET` — they are measured
  by SLO-C1 below. Explicit list, mirroring the cron triggers in
  [`wrangler.toml`](../wrangler.toml):
  - `/api/compute-feed`
  - `/api/purge-deleted`
  - `/api/newsletter-digest` (GET)
  - `/api/article-schedule` (GET)

### 2.3 Cron success rate

> **SLO-C1:** 99.0% of cron invocations of the gated endpoints listed
> under SLO-A1 complete with HTTP 200 over the rolling 28-day window.

- **Good events:** cron-initiated invocations with `StatusCode = 200`.
- **Bad events:** cron-initiated invocations with any other status
  EXCEPT `401` / `503` where the invoker was external (those indicate
  a misconfigured caller, not a service defect; they still need to be
  fixed but they are tracked separately — see §4).
- **Source:** `pages_function_invocation_logs` joined on the User-Agent
  or a `X-Cron-Caller` header the scheduler sets.

### 2.4 Webhook integrity

> **SLO-W1:** 99.9% of accepted LemonSqueezy webhook deliveries are
> processed exactly once and reflected in the `coins_ledger` within
> 60 seconds over the rolling 28-day window.

- **Good events:** `lemonsqueezy-webhook` invocations that return 200
  AND result in exactly one ledger row with matching `order_id`.
- **Bad events:** invocations returning 5xx, silent drops, or
  duplicate ledger rows with the same `order_id`.
- **Source:** join `pages_function_invocation_logs` on
  `Supabase coins_ledger` (spot-check nightly).

Note: requests rejected because the signature is invalid or the
`LEMONSQUEEZY_WEBHOOK_SECRET` is unset are **not** counted against
SLO-W1 — those are correct fail-closed behavior.

## 3. Error budgets

The error budget for an SLO is `(1 - target) * total_events`. Spent
budget is `bad_events`. When remaining budget hits zero, the reliability
policy in §5 kicks in.

| SLO    | Target  | Budget over 28 days (at ~10M req / ~500k fn invoke / ~30k cron invoke) |
|--------|---------|-------------------------------------------------------------------------|
| SLO-S1 | 99.9%   | ~10,000 failed page requests                                             |
| SLO-A1 | 99.5%   | ~2,500 failed API invocations                                            |
| SLO-C1 | 99.0%   | ~300 failed cron invocations                                             |
| SLO-W1 | 99.9%   | ~30 missing/duplicate ledger events (on ~30k webhooks)                   |

The actual totals vary with traffic; compute the denominator from the
real Logpush data for each review, do not reuse the sample above.

### 3.1 Burn-rate alerting

Cloudflare's primary usefulness for alerting is the `http_requests` and
`pages_function_invocation_logs` Logpush datasets. Standard multiwindow
burn-rate alerts (from the Google SRE workbook, chapter 5):

| Window        | Burn rate | Budget consumed | Fires a page? |
|---------------|-----------|-----------------|---------------|
| 1 hour        | 14.4×     | 2% in 1h        | Yes (critical) |
| 6 hours       | 6×        | 5% in 6h        | Yes (critical) |
| 1 day         | 3×        | 10% in 1d       | Yes (ticket)   |
| 3 days        | 1×        | 10% in 3d       | No (info)      |

Implement these as Axiom alerts against the Logpush dataset (Option A
in [`observability.md`](./observability.md)) once the ingest pipeline
is on. Until then this section is the contract; review §4 monthly and
page on-call manually from the Cloudflare dashboard if the 1h budget
burns > 2%.

## 4. Uptime tracking

Three independent signals, listed in order of increasing trust:

1. **External synthetic probe.** An external uptime monitor
   (UptimeRobot, Better Stack, Pingdom — whichever the ops account
   already owns) hits the following endpoints every 60 seconds from
   at least 3 geographic regions:

   - `GET https://groupsmix.com/` — expect `200` with body containing
     `"GroupsMix"`.
   - `GET https://groupsmix.com/api/health-check` — expect `200` with
     `{ "ok": true }` (already implemented; see
     `functions/api/health-check.js`).

   These drive a public status indicator (recommended: Better Stack
   Status Page, free tier). The probe endpoints must remain
   unauthenticated and free of per-request DB work.

2. **Cloudflare Health Checks.** Configure two in the dashboard on
   the same two URLs, 30s cadence, 2/5 failure threshold, alerting
   into the on-call PagerDuty / email list. Cloudflare's checks run
   from inside the edge but outside our account plane and catch
   origin issues the external probe would miss during DNS flap.

3. **RUM ping.** The client `sentry.js` loader emits a lightweight
   beacon on every page load. A sustained drop in beacon volume is a
   proxy for "users can't load the site" and is the one signal that
   works when DNS itself is down for a third party. See
   [`observability.md §1`](./observability.md).

### 4.1 What counts as "down"

The status page is RED when **both** synthetic probes fail for 3
consecutive minutes. It is YELLOW when only one probe fails or when
SLO-A1 burns > 10% in the last hour.

### 4.2 Monthly review

On the first Monday of every month:

1. Pull the 28-day numbers for SLO-S1, SLO-A1, SLO-C1, SLO-W1 from
   Axiom / Cloudflare analytics.
2. Fill out the table in [`RUNBOOK.md §SLO review`](../RUNBOOK.md).
3. If any SLO is below target, open a reliability issue tagged
   `slo-violation` and link it from the review.
4. Review §5 below; if budget is exhausted, follow the policy.

## 5. Reliability policy when budget is exhausted

The budget is "exhausted" when remaining budget for a given SLO drops
below 0 over the trailing 28 days.

When a budget is exhausted:

- **Feature freeze on the affected surface.** Only reliability fixes,
  security fixes, and revert-only PRs may merge into that surface until
  the rolling budget is back above zero. Other PRs can be reviewed but
  not merged.
- **Post-incident review required.** Even if no single incident caused
  the burn, write a short review that lists the bad events and the
  remediation. Link it from the monthly review.
- **No change to cron cadence.** Do not reduce cron frequency to paper
  over SLO-C1 violations — fix the underlying job.

The freeze lifts automatically once the 28-day rolling budget is
positive again.

## 6. What is explicitly out of scope (for now)

- **Latency SLOs.** Added once Logpush has ≥ 30 days of data.
- **Supabase availability.** Depends on a third party; we track it via
  SLO-A1 (since Supabase outages manifest there) but do not own a
  separate Supabase SLO.
- **CDN cache hit ratio.** Measured, not SLO'd.
- **Email deliverability (Resend).** Tracked at the webhook layer only.

These will be added in subsequent revisions once we have the data to
pick realistic targets.
