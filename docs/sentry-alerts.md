# Sentry Alert Rules

Tracking issue: **H-1**.

S0-8 committed the Sentry scaffolds
([`docs/observability.md §1`](./observability.md)). This document is the
authoritative spec for the Sentry **alert rules** that sit on top of those
two projects. Provisioning happens in the Sentry dashboard (Alerts → Create
Alert) or via the [Sentry API][sentry-api-alerts]; the rules here are the
source of truth and MUST be kept in sync with the dashboard.

Thresholds are chosen to mirror the multiwindow burn-rate table in
[`docs/slos.md §3.1`](./slos.md#31-burn-rate-alerting) so that a Sentry
page and an SLO page fire on the same underlying fault.

## 1. Projects

| Project         | Platform  | DSN env var         | Owner    |
| --------------- | --------- | ------------------- | -------- |
| `groupsmix-web` | Browser   | `PUBLIC_SENTRY_DSN` | Frontend |
| `groupsmix-edge`| JavaScript / Cloudflare Workers | `SENTRY_DSN_EDGE` | Platform |

Both projects tag events with `environment` (`production` / `preview` /
`development`) and `release` (`groupsmix@<git-sha>`). All alert rules below
scope to `environment:production` unless otherwise stated.

## 2. Notification channels

| Channel         | Use                                                 |
| --------------- | --------------------------------------------------- |
| PagerDuty       | SEV-1 / SEV-2 (see [`RUNBOOK.md §1.2`](../RUNBOOK.md#severity-definitions)) |
| Slack `#oncall` | SEV-2 / SEV-3 and all regressions                   |
| Email on-call   | SEV-3 (ticket-level), weekly digests                |

Every rule below names its channel explicitly. Do not route straight to
PagerDuty without a ticket-tier rule catching it first — PD pages are
reserved for the two burn-rate tiers (14.4× / 6×) and SEV-1 endpoints.

## 3. Alert rules — `groupsmix-web`

### 3.1 Spike: new high-frequency issue

- **Type:** Issue alert
- **Trigger:** "An issue is seen more than **50 times** in **5 minutes**"
- **Filter:** `environment:production`
- **Action:** Slack `#oncall` (mention `@web-oncall`)
- **Rationale:** catches a regression shipped to prod within one release
  wave before it consumes the SLO-S1 budget.

### 3.2 Regression: resolved issue reopened

- **Type:** Issue alert
- **Trigger:** "A resolved issue changes state from `resolved` to
  `unresolved`"
- **Filter:** `environment:production`
- **Action:** Slack `#oncall`
- **Rationale:** regressions are disproportionately expensive because a
  "resolved" state implies the team has already reasoned about the failure
  mode once. Reopens must never be silent.

### 3.3 Crash-free sessions — 14.4× burn (SLO-S1 1h)

- **Type:** Metric alert ("crash-free session rate")
- **Trigger:** rate < **99.5%** over **1 hour**
- **Resolve:** rate >= 99.9% sustained for 1 hour
- **Filter:** `environment:production`
- **Action:** PagerDuty (SEV-2), mirror to Slack `#oncall`
- **Rationale:** matches the 14.4× burn row in `docs/slos.md §3.1`
  (2% of the 28-day budget spent in 1h).

### 3.4 Crash-free sessions — 6× burn (SLO-S1 6h)

- **Type:** Metric alert ("crash-free session rate")
- **Trigger:** rate < **99.9%** over **6 hours**
- **Resolve:** rate >= 99.95% sustained for 6 hours
- **Filter:** `environment:production`
- **Action:** PagerDuty (SEV-2)
- **Rationale:** matches the 6× burn row. Pairs with 3.3 so a slow burn
  that stays under the 1h threshold still pages before 10% of the budget
  is gone.

### 3.5 Admin pages — level:fatal

- **Type:** Issue alert
- **Trigger:** any new issue where `level:fatal`
- **Filter:** `environment:production url:*gm-ctrl-x7*`
- **Action:** PagerDuty (SEV-1) — matches RUNBOOK "data integrity" tier
- **Rationale:** admin panel is low-traffic, so a fatal there is almost
  certainly an operator-blocking bug.

## 4. Alert rules — `groupsmix-edge`

### 4.1 Webhook handler — any new issue

- **Type:** Issue alert
- **Trigger:** first seen (`age:-1s`)
- **Filter:** `environment:production endpoint:lemonsqueezy-webhook`
- **Action:** PagerDuty (SEV-1) — "webhook silent-drop" row in
  [`RUNBOOK.md §1.2`](../RUNBOOK.md#severity-definitions)
- **Rationale:** webhook faults are silent money loss (SLO-W1); they
  always page on first occurrence.

### 4.2 Cron handler — any new issue

- **Type:** Issue alert
- **Trigger:** first seen
- **Filter:** `environment:production endpoint:compute-feed OR
  endpoint:purge-deleted OR endpoint:newsletter-digest OR
  endpoint:article-schedule`
- **Action:** Slack `#oncall` + ticket (SEV-3)
- **Rationale:** crons are retryable and user-invisible; ticket, don't
  page.

### 4.3 Edge error count — 14.4× burn (SLO-A1 1h)

- **Type:** Metric alert ("event count")
- **Trigger:** `event.type:error` count > **20** in **10 minutes**
- **Resolve:** count < 5 sustained for 10 minutes
- **Filter:** `environment:production !endpoint:cron*`
- **Action:** PagerDuty (SEV-2)
- **Rationale:** at ~500k fn invocations / 28d = ~180 / hour baseline,
  20 errors / 10 min is the ~14.4× burn threshold for the non-cron API
  surface.

### 4.4 Edge error count — 6× burn (SLO-A1 6h)

- **Type:** Metric alert ("event count")
- **Trigger:** `event.type:error` count > **40** in **6 hours**
- **Resolve:** count < 10 sustained for 6 hours
- **Filter:** `environment:production !endpoint:cron*`
- **Action:** ticket (SEV-3), Slack `#oncall`
- **Rationale:** slow-burn counterpart to 4.3.

### 4.5 Turnstile / auth path — abuse signal

- **Type:** Issue alert
- **Trigger:** issue seen > **100** times in **10 minutes**
- **Filter:** `environment:production endpoint:turnstile OR
  endpoint:auth`
- **Action:** Slack `#oncall` + ticket (SEV-3)
- **Rationale:** a spike here is more often abuse than a bug; it needs
  eyes but does not page.

## 5. Silencing / snooze policy

- No alert rule above may have its notification removed to silence a
  known bad deploy — roll back per [`RUNBOOK.md §6.2`](../RUNBOOK.md)
  and file a ticket to re-tune instead.
- Metric alerts (3.3, 3.4, 4.3, 4.4) auto-resolve on the "Resolve"
  threshold; there is no manual resolve path so a flapping alert points
  to a real underlying burn.
- Snoozing an issue alert is allowed for up to **24 hours** while a fix
  is in flight. Longer snoozes require a follow-up issue linked in the
  Sentry note.

## 6. Changing these rules

Changes to alert rules land as a PR against this file. The on-call
rotation reviews the diff before the Sentry dashboard is updated so the
spec and the provisioned rules never drift.

To export the current provisioned rules for comparison:

```sh
sentry-cli issues-alert list --org groupsmix --project groupsmix-web
sentry-cli issues-alert list --org groupsmix --project groupsmix-edge
```

Or via the API: `GET /api/0/projects/groupsmix/<project>/rules/` —
see [Sentry's alert API reference][sentry-api-alerts].

[sentry-api-alerts]: https://docs.sentry.io/api/alerts/
