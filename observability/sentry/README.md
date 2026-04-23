# Sentry alert rules (H-1)

Declarative spec for the alert rules that must exist in the GroupsMix Sentry
project. The rules themselves live in Sentry (they are not read by the app);
this directory is the reviewable source of truth so that:

- A new on-call can see exactly what pages them and why.
- Threshold changes are reviewed via PR, not silently tweaked in the UI.
- The project can be re-provisioned (new Sentry org, new project) without
  having to remember the rules by hand.

## Files

- [`alert-rules.json`](./alert-rules.json) — issue-based and metric alert
  rules. Field names match the payload shape of Sentry's
  [`POST /api/0/projects/{org}/{project}/rules/`](https://docs.sentry.io/api/alerts/create-an-issue-alert-rule-for-a-project/)
  and
  [`POST /api/0/organizations/{org}/alert-rules/`](https://docs.sentry.io/api/alerts/create-a-metric-alert-rule-for-an-organization/)
  endpoints. Human-readable fields (`name`, `description`) are for reviewers.

## Rule inventory

| Rule | Severity | Who pages | Why |
| --- | --- | --- | --- |
| **Edge 5xx spike — > 20 events in 5m** | Critical | Slack `#alerts-prod` | Catch broken deploys / upstream outages fast. |
| **Webhook verification failure (LemonSqueezy)** | Critical | PagerDuty + Slack `#alerts-payments` | Webhook fails closed — any capture is either a key rotation we missed, or an attempted forgery. |
| **compute-feed cron failure** | Warning | Slack `#alerts-prod` | Cron drives feed scoring + embeddings + soft-delete cleanup. |
| **New issue in production** | Info | Slack `#alerts-prod` | Low-noise triage surface. |
| **Client error burst — > 100 / 10m** | Critical | Slack `#alerts-prod` | Broken client deploy. |
| **Quiet hours — preview environment** | (mute) | — | Stop preview noise from paging. |
| **Metric: edge error rate > 2% (5m)** | Critical → warn at 1% | PagerDuty / Slack | Ratio catches degradation that per-event rules miss. |
| **Metric: p75 LCP > 4s (15m)** | Warning | Slack `#alerts-perf` | Apdex-style perf regression. |

## Applying the rules

Sentry does not ship a first-party importer for issue-alert JSON, so use the
REST API. Example with `curl` (requires a Sentry auth token with
`project:write` scope):

```bash
export SENTRY_AUTH_TOKEN="..."
export SENTRY_ORG="groupsmix"
export SENTRY_PROJECT="groupsmix"

# Issue-alert rules
jq -c '.rules[]' observability/sentry/alert-rules.json | while read -r rule; do
  curl -sS -X POST \
    "https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/rules/" \
    -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${rule}"
done

# Metric-alert rules
jq -c '.metric_alerts[]' observability/sentry/alert-rules.json | while read -r rule; do
  curl -sS -X POST \
    "https://sentry.io/api/0/organizations/${SENTRY_ORG}/alert-rules/" \
    -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${rule}"
done
```

Re-applying will create duplicates — delete the existing rules in the Sentry
UI (or via `DELETE /rules/{rule_id}/`) before re-running. A future
hardening pass can replace this with `sentry-terraform` once the provider
supports issue-alert rules end-to-end.

## Review checklist when editing

- [ ] Each rule has a `description` explaining **why** the threshold was
      chosen — not just what the rule does.
- [ ] Production-paging rules (PagerDuty) are scoped to
      `environment:production` or to tags that only exist in prod.
- [ ] `preview` and `development` environments are either muted or
      Slack-only — they must not page on-call.
- [ ] New high-risk handlers (payments, auth, cron) have a dedicated rule
      or a tag filter that routes them to the right channel.
