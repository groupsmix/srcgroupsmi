# Cloudflare Logpush (H-2)

Declarative config for the Logpush jobs that ship edge logs off Cloudflare
to Axiom (hot / queryable) and R2 (cold / compliance backstop). Cloudflare
does not read these files directly — the jobs are created via the
dashboard or the Cloudflare API; this directory is the reviewable source
of truth so the shape + retention are checked in alongside code.

## Jobs

| File | Dataset | Destination | Hot retention | Cold retention |
| --- | --- | --- | --- | --- |
| [`axiom-http-requests.json`](./axiom-http-requests.json) | `http_requests` | Axiom (`cloudflare-pages-groupsmix`) | 30 days (Axiom dataset config) | — |
| [`axiom-pages-function-invocations.json`](./axiom-pages-function-invocations.json) | `pages_function_invocation_logs` | Axiom (`cloudflare-pages-functions-groupsmix`) | 14 days | — |
| [`r2-http-requests.json`](./r2-http-requests.json) | `http_requests` | R2 (`gm-logs/http-requests/`) | — | 90 days (R2 lifecycle) |

Two datasets matter for GroupsMix:

- **`http_requests`** — every edge request, including status / WAF action /
  RayID. Used for 5xx triage, rate-limit tuning, and fraud correlation.
- **`pages_function_invocation_logs`** — per-handler outcome, with
  `console.warn` / `console.error` output (no `console.log` is allowed in
  `functions/`, enforced in CI). Used to correlate Sentry captures with the
  exact request that produced them.

`workers_trace_events` is not shipped by default. Turn it on when doing
Workers-side perf work; don't ship it continuously — it's expensive and
overlaps with `pages_function_invocation_logs`.

## Retention policy

**Why two tiers:** Axiom is fast to query but expensive per-GB; R2 is cheap
but requires manual querying (e.g. via DuckDB or `curl` over ranges).
The split is:

- **Hot (Axiom, 14–30 days)** — active incident triage, perf dashboards,
  ad-hoc analytics. Lives inside the dataset; adjust via the Axiom UI.
- **Cold (R2, 30–90 days)** — durable archive for fraud, compliance, and
  back-filling analytics. Lives in `gm-logs/<prefix>/` and is governed by
  [`r2-lifecycle.json`](./r2-lifecycle.json).

Retention windows:

| Prefix | Window | Rationale |
| --- | --- | --- |
| `r2://gm-logs/http-requests/` | 90 days | Required to chase LemonSqueezy webhook fraud / chargebacks which commonly surface 60-75 days after the fact. |
| `r2://gm-logs/pages-functions/` | 30 days | Request-scoped logs are too PII-adjacent to keep beyond an incident window. |
| `r2://gm-logs/workers-trace-events/` | 14 days | Only enabled during perf work; short retention limits storage cost. |

There is **no retention of raw IPs beyond 90 days** at either tier. The
`http_requests` dataset keeps `ClientIP`; Axiom honours GDPR DSAR requests
against it, and R2 deletes the file on lifecycle rollover.

## Applying the config

### 1. Create the Logpush job

HTTP requests → Axiom:

```bash
export CF_API_TOKEN="..."
export CF_ZONE_ID="..."
export AXIOM_INGEST_TOKEN="..."

curl -sS -X POST \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/logpush/jobs" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(envsubst < observability/logpush/axiom-http-requests.json)"
```

Pages function invocations → Axiom (note: Pages projects have their own
account-scoped Logpush endpoint, not zone-scoped):

```bash
export CF_ACCOUNT_ID="..."
export CF_PAGES_PROJECT="groupsmix"

curl -sS -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${CF_PAGES_PROJECT}/logpush/jobs" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(envsubst < observability/logpush/axiom-pages-function-invocations.json)"
```

HTTP requests → R2:

```bash
export R2_LOGS_ACCESS_KEY_ID="..."
export R2_LOGS_SECRET_ACCESS_KEY="..."

curl -sS -X POST \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/logpush/jobs" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(envsubst < observability/logpush/r2-http-requests.json)"
```

### 2. Apply R2 lifecycle rules

```bash
curl -sS -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/gm-logs/lifecycle" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @observability/logpush/r2-lifecycle.json
```

## Secrets

Never commit any of these:

| Secret | Where to set | Purpose |
| --- | --- | --- |
| `CF_API_TOKEN` | Operator shell only | Creates / updates Logpush jobs. |
| `AXIOM_INGEST_TOKEN` | Embedded in the Logpush job's `destination_conf` (Cloudflare keeps it encrypted). | Axiom ingest auth. |
| `R2_LOGS_ACCESS_KEY_ID` / `R2_LOGS_SECRET_ACCESS_KEY` | Same — embedded in the job's `destination_conf`. | R2 write auth, scoped to `gm-logs`. |

None of these are read by the GroupsMix application — only by Cloudflare's
managed Logpush runner. Pages Functions do not need to know they exist.
