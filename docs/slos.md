# Service Level Objectives (H-4)

This document defines GroupsMix's initial SLOs, error budgets, and the
mechanisms used to track each one. It is intentionally narrow — only the
objectives that map to user-visible or money-critical paths are listed.
Anything outside this list is explicitly **not** an SLO and should not be
used to make rollback decisions.

All SLOs are measured over a **rolling 28-day window** (four
weeks) aligned to UTC. Dashboards and burn-rate alerts are defined in the
Sentry + Plausible + Cloudflare Analytics projects listed under each SLO.

## 1. SLO catalog

### 1.1 Marketing / public site availability
- **SLI:** fraction of successful (`2xx`/`3xx`) responses to the top-level
  routes `/`, `/groups`, `/articles`, `/jobs`, `/marketplace`, as reported
  by Cloudflare Analytics (`http_requests` dataset, excludes `/api/*`).
- **SLO:** **99.9%** successful over 28 days.
- **Error budget:** 43m 12s of downtime per 28 days.
- **Rationale:** Cloudflare Pages + static Astro output; the only realistic
  failure modes are DNS / Cloudflare edge, both rare.

### 1.2 API (Pages Functions) availability
- **SLI:** fraction of `/api/*` requests whose outcome is **not** a 5xx,
  excluding 401/403 (legitimate auth rejections are successful outcomes
  from the service's perspective).
- **SLO:** **99.5%** over 28 days.
- **Error budget:** 3h 36m per 28 days.
- **Rationale:** Supabase dependency and Cloudflare Workers cold-start
  variance cap us below the static site number.

### 1.3 Payment webhook ingestion
- **SLI:** fraction of `/api/lemonsqueezy-webhook` requests that either
  succeed (`2xx`) **or** reject with a 401/403 (signature mismatch — a
  *correct* refusal is still a successful outcome for integrity). A 5xx or
  a drop-with-no-audit-row counts against the SLO.
- **SLO:** **99.95%** over 28 days.
- **Error budget:** 21m 36s per 28 days.
- **Rationale:** every missed webhook is unreconciled money; budget is
  deliberately tight to force immediate page-on-failure.

### 1.4 Cron job completion
- **SLI:** fraction of scheduled cron invocations of each endpoint
  (`compute-feed`, `newsletter-digest`, `article-schedule`, `purge-deleted`)
  that return `2xx`.
- **SLO:** **99.0%** over 28 days, **per endpoint**.
- **Error budget:** ~3 failed invocations per 28-day window at 30-min cadence
  (compute-feed); correspondingly fewer for daily jobs.
- **Rationale:** one-off cron failures self-heal on the next run; the SLO
  catches regressions where the endpoint has been broken for hours.

### 1.5 Auth login latency
- **SLI:** `p95` end-to-end latency of `/login` and `/signup` pages measured
  at the edge (Cloudflare Analytics).
- **SLO:** **p95 ≤ 1500 ms** over 28 days.
- **Rationale:** static routes with a single Supabase round-trip; anything
  slower indicates a regression in the auth module bundle size or a
  Supabase latency incident.

### 1.6 Feed freshness
- **SLI:** lag between the most recent `compute-feed` `trending` run and
  the current time, sampled every minute.
- **SLO:** **≤ 2h lag** 99% of minutes over 28 days.
- **Rationale:** cron is scheduled every 30 min; 4× the schedule is the
  point at which the feed visibly drifts.

## 2. Error budget policy

When the 28-day budget for any SLO is **exhausted**:

1. **Freeze** merges to `main` except explicit SRE / hotfix / rollback work.
2. Open a dedicated incident post-mortem issue; link it from the
   top of [`RUNBOOK.md`](../RUNBOOK.md).
3. The on-call is expected to spend the next business day on reliability
   work (tests, traces, runbooks) rather than feature work.

When the budget is **50% consumed before day 14**:

1. Open a "budget warning" tracking issue; assign to the primary on-call.
2. Review the top-by-count open Sentry issues for that SLO's scope and
   decide whether to roll back a recent release.

Budgets reset at the start of each 28-day window. No carry-over.

## 3. Burn-rate alerts

Pair each SLO with two burn-rate windows in Sentry / Cloudflare:

| Window | Threshold | Severity |
| --- | --- | --- |
| 1 hour | burn rate > **14.4×** | P1 (page) |
| 6 hours | burn rate > **6×** | P2 (notify) |

Thresholds are the Google SRE textbook defaults; see
`docs/alerts.md` for the concrete Sentry filters that implement them.

## 4. Uptime tracking (external probe)

Cloudflare Analytics measures requests **after** traffic reaches
Cloudflare's edge, so it cannot detect Cloudflare outages or DNS failures.
Pair it with an external probe:

- **Primary:** [BetterStack Uptime](https://betterstack.com/uptime) — monitor
  the following checks every 60s from three regions:
  - `GET https://groupsmix.com/` — expect `200` and the body to contain
    `GroupsMix`.
  - `GET https://groupsmix.com/health` — expect `200` and `ok: true`.
  - `GET https://groupsmix.com/api/health-check` — expect `200`.
- **Secondary (free tier):** [UptimeRobot](https://uptimerobot.com/), same
  three URLs, 5-minute cadence.
- Notifications from either provider land in `#oncall-groupsmix` and page
  via PagerDuty if down for ≥ 2 consecutive probes (~2 min on BetterStack).

The external probe is the source of truth for §1.1 and §1.2 during a full
Cloudflare outage, when the first-party dashboards are unreachable.

## 5. Review cadence

- **Weekly:** on-call posts a budget-health update to `#groupsmix-observability`
  with: current 28-day consumption, top three consuming endpoints, and any
  alerts fired in the last 7 days.
- **Quarterly:** SLO review — add, remove, or retune SLOs. Changes land as
  a PR to this file so they are reviewed like code.
