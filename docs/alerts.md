# Sentry Alert Rules (H-1)

Concrete alert rules for the two Sentry projects seeded in
[`docs/observability.md`](./observability.md):

- `groupsmix-edge` — receives edge (Cloudflare Pages Functions) events via
  `captureEdgeException` (`functions/api/_shared/sentry.js`).
- `groupsmix-web` — receives browser events via
  `public/assets/js/shared/sentry.js`.

The rules below are the source of truth; mirror them in each project under
**Alerts → Create Alert Rule** in the Sentry UI. Every rule is scoped to
`environment:production` so preview deploys cannot generate pages.

All notifications land in the `#oncall-groupsmix` Slack channel via Sentry's
Slack integration, with email fallback to `oncall@groupsmix.com`. PagerDuty
routing keys are only attached to the **P1** rules.

## 1. Severity taxonomy

| Tier | Meaning | Default channels |
| --- | --- | --- |
| P1 | User-visible failure of a money or auth path | Slack `#oncall-groupsmix` + PagerDuty `groupsmix-edge` |
| P2 | Elevated error rate or latency in a non-money path | Slack `#oncall-groupsmix` |
| P3 | Informational; review during business hours | Slack `#groupsmix-observability` |

Each rule must include the `severity:<tier>` tag in Sentry's rule
description so downstream tooling can filter pages vs. review queues.

## 2. Edge project (`groupsmix-edge`)

### P1-EDGE-1 — Payment webhook fail-closed
Triggers when the LemonSqueezy webhook rejects a request because its signing
secret is missing or a signature check fails.

- Event filter: `tags.endpoint:"lemonsqueezy-webhook" AND (message:*"fail closed"* OR message:*"invalid signature"*)`
- Threshold: **≥ 1 event in 5 min**
- Action: Slack `#oncall-groupsmix`, PagerDuty `groupsmix-edge`, email `oncall@groupsmix.com`
- Why P1: a missed `order_created` event means a paying user did not get
  coins credited.

### P1-EDGE-2 — Cron handler 5xx
Triggers on any 5xx / unhandled exception inside the cron-style endpoints.

- Event filter: `tags.endpoint:"compute-feed" OR tags.endpoint:"purge-deleted" OR tags.endpoint:"newsletter-digest" OR tags.endpoint:"article-schedule"`
- Threshold: **≥ 3 events in 15 min** OR **≥ 1 event tagged `severity:p1`**
- Action: Slack + PagerDuty.
- Why P1: these jobs move money (coin purges, re-engagement) and missing a
  run silently backs up the deletion queue (GDPR exposure).

### P2-EDGE-1 — Supabase RPC error rate
Triggers when any edge handler logs repeated Supabase 5xx responses.

- Event filter: `message:*"RPC"* AND tags.runtime:"cloudflare" AND level:error`
- Threshold: **> 20 events in 15 min**
- Action: Slack only.
- Notes: usually indicates Supabase degradation — check
  [Supabase status](https://status.supabase.com/) first.

### P2-EDGE-2 — Turnstile verification failures spike
- Event filter: `tags.endpoint:"turnstile" AND message:*"verification failed"*`
- Threshold: **> 50 events in 10 min**
- Action: Slack.
- Playbook: possible bot surge; see `RUNBOOK.md#bot-surge`.

### P3-EDGE-1 — New edge error type
- Condition: *"A new issue is created"* (Sentry's built-in) with filter
  `environment:production`.
- Action: Slack `#groupsmix-observability`.
- Purpose: keep unknown errors visible without paging.

## 3. Web project (`groupsmix-web`)

### P1-WEB-1 — Auth flow broken
- Event filter: `tags.route:"/login" OR tags.route:"/signup" AND level:error`
- Threshold: **≥ 5 events in 10 min from ≥ 3 distinct users**
- Action: Slack + PagerDuty.
- Why P1: signup/login breakage blocks all new conversions.

### P2-WEB-1 — Client error rate regression
- Condition: `events(environment=production) > 2× 7-day baseline`
- Threshold: Sentry's Metric Alert: `count() by release` — alert when
  current release is > 2× prior release over the same window.
- Action: Slack.

### P2-WEB-2 — Checkout button broken
- Event filter: `tags.route:"/store" AND message:*"checkout"*`
- Threshold: **≥ 3 events in 15 min**
- Action: Slack.

### P3-WEB-1 — First-seen issue in release
- Built-in rule: *"An issue is seen for the first time in a release"*
- Action: Slack `#groupsmix-observability` only.

## 4. Silence / mute rules

- Silence any rule that fires for 15 min continuously so PagerDuty does not
  storm; escalation is governed by the PagerDuty service's own routing.
- Mute `environment:preview` globally. Preview deploys do not page.
- `gm-ctrl-*` admin routes are scrubbed client-side (`head-scripts.js`
  `beforeSend`); no explicit rule needed, but if events leak the filter
  `NOT url:*"gm-ctrl"*` can be added.

## 5. Ownership

| Rule prefix | Owner |
| --- | --- |
| `P1-EDGE-*` | Payments / infra on-call |
| `P2-EDGE-*` | Payments / infra on-call |
| `P1-WEB-*` | Frontend on-call |
| `P2-WEB-*` | Frontend on-call |
| `P3-*` | Weekly rotation — review during business hours |

Rotations are managed in PagerDuty; the calendar link lives in
[`RUNBOOK.md`](../RUNBOOK.md).

## 6. Testing

Once per quarter, fire a synthetic event to verify each P1 rule still pages:

```bash
# From any trusted host with the edge DSN exported:
node scripts/emit-synthetic-sentry.js --severity p1 --endpoint lemonsqueezy-webhook
```

(The synthetic emitter is a follow-up; file `scripts/emit-synthetic-sentry.js`
does not exist yet — tracked in
[`RUNBOOK.md#synthetic-alert-tests`](../RUNBOOK.md).)
