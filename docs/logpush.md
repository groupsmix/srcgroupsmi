# Cloudflare Logpush

Tracking issue: **H-2**.

GroupsMix ships edge and Pages Functions logs out of Cloudflare via
[Logpush][cf-logpush] so they can be queried for incident response and
so that SLO-A1 / SLO-C1 in [`docs/slos.md`](./slos.md) can be computed
against authoritative data. This document is the spec for the Logpush
jobs, destination-specific config, retention, and incident-time query
recipes.

Provisioning happens against the Cloudflare API (or the dashboard:
Analytics & Logs → Logpush → Create a Logpush job). The payloads
below are the source of truth — keep them in sync with the dashboard.

## 1. Datasets shipped

| Dataset                           | Purpose                                                               | Feeds   |
| --------------------------------- | --------------------------------------------------------------------- | ------- |
| `http_requests`                   | Every edge HTTP request to the zone (access log).                     | SLO-S1  |
| `pages_function_invocation_logs`  | Per-function invocation outcome (`ok`, `exception`, `canceled`, ...). | SLO-A1, SLO-C1 |
| `workers_trace_events`            | Stack traces from Functions that called `console.error` / threw.      | Debugging |

`firewall_events` and `spectrum_events` are not shipped — GroupsMix does
not use Spectrum, and firewall is covered by zone analytics.

## 2. Field allow-list (PII + secrets hygiene)

Logpush defaults include headers and bodies. Those are intentionally
excluded here so we do not persistently log `Authorization`,
`Cookie`, webhook bodies, or CRON_SECRET headers.

### 2.1 `http_requests`

```
ClientIP,
ClientRequestHost,
ClientRequestMethod,
ClientRequestPath,
ClientRequestProtocol,
EdgeResponseBytes,
EdgeResponseStatus,
EdgeStartTimestamp,
EdgeEndTimestamp,
RayID,
ClientASN,
ClientCountry,
ClientDeviceType,
UserAgent,
WorkerSubrequest,
WorkerSubrequestCount,
CacheCacheStatus,
BotScore,
BotScoreSrc
```

- **Intentionally excluded:** `ClientRequestBytes` (acceptable — body
  size isn't PII, include if needed), `ClientRequestReferer` (could
  leak session tokens on poorly-built upstream tools),
  `ClientRequestScheme` (redundant with Protocol).
- **Never include:** `ClientRequestHeaders`, `EdgeResponseHeaders` —
  they include `Set-Cookie`, `Authorization`, and user-supplied
  headers.

### 2.2 `pages_function_invocation_logs`

```
Outcome,
StatusCode,
ScriptName,
FunctionName,
EventTimestampMs,
DispatchNamespace,
Request.URL,
Request.Method,
Request.CfConnectingIP,
ScriptVersion.Id,
ScriptVersion.Tag,
CPUTime,
WallTime,
Logs
```

- `Logs` includes anything the function passed to `console.error` /
  `console.warn`; functions MUST NOT log secrets (`CONTRIBUTING.md`
  forbids `console.log` in `functions/` as a defense-in-depth rule —
  enforced by `.github/workflows/ci.yml` "Reject console.log").
- **Never include:** `Request.Headers`, `Request.Body`,
  `Response.Body`.

### 2.3 `workers_trace_events`

```
Event.Request.URL,
Event.Request.Method,
Event.Request.CfConnectingIP,
Exceptions,
Logs,
ScriptName,
Outcome,
EventTimestamp
```

## 3. Destinations

### 3.1 Axiom (HTTP)

Create a dataset `cloudflare-pages-groupsmix` in Axiom and an ingest
token scoped to it. Then, for each dataset above, POST to the
Cloudflare Logpush API:

```sh
curl -X POST \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/logpush/jobs" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "name": "groupsmix-http-requests-axiom",
  "dataset": "http_requests",
  "enabled": true,
  "destination_conf": "https://api.axiom.co/v1/datasets/cloudflare-pages-groupsmix/ingest?timestamp-field=EdgeStartTimestamp&header_Authorization=Bearer%20${AXIOM_INGEST_TOKEN}",
  "output_options": {
    "field_names": ["ClientIP", "ClientRequestHost", "ClientRequestMethod", "ClientRequestPath", "ClientRequestProtocol", "EdgeResponseBytes", "EdgeResponseStatus", "EdgeStartTimestamp", "EdgeEndTimestamp", "RayID", "ClientASN", "ClientCountry", "ClientDeviceType", "UserAgent", "WorkerSubrequest", "WorkerSubrequestCount", "CacheCacheStatus", "BotScore", "BotScoreSrc"],
    "timestamp_format": "rfc3339",
    "batch_prefix": "",
    "batch_suffix": "",
    "record_prefix": "",
    "record_suffix": "\n",
    "record_delimiter": ""
  },
  "frequency": "low",
  "max_upload_bytes": 5000000,
  "max_upload_interval_seconds": 30,
  "max_upload_records": 1000
}
JSON
```

Repeat with `dataset` set to `pages_function_invocation_logs` (use
account-level endpoint `/client/v4/accounts/$CF_ACCOUNT_ID/logpush/jobs`)
and `workers_trace_events`. Update `field_names` to match §2.2 / §2.3.

The Axiom token lives only at the Logpush job level; it is NEVER a
Pages env var and NEVER committed to the repo.

### 3.2 Cloudflare R2 (fallback / archive)

Create a bucket `gm-logs` and an R2 access-key pair with `Object Write`
scoped to it.

```sh
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/logpush/jobs" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "name": "groupsmix-pages-fn-r2",
  "dataset": "pages_function_invocation_logs",
  "enabled": true,
  "destination_conf": "r2://gm-logs/pages-function-logs/{DATE}?account-id=${CF_ACCOUNT_ID}&access-key-id=${R2_LOGS_ACCESS_KEY_ID}&secret-access-key=${R2_LOGS_SECRET_ACCESS_KEY}",
  "output_options": {
    "field_names": ["Outcome", "StatusCode", "ScriptName", "FunctionName", "EventTimestampMs", "DispatchNamespace", "Request.URL", "Request.Method", "Request.CfConnectingIP", "ScriptVersion.Id", "ScriptVersion.Tag", "CPUTime", "WallTime", "Logs"],
    "timestamp_format": "rfc3339"
  },
  "frequency": "high"
}
JSON
```

Use R2 when the Axiom tier runs hot or when long-term archive is
needed for forensics beyond the Axiom retention window. Axiom is the
primary query surface; R2 is cold storage.

## 4. Retention policy

| Destination | Hot (queryable)  | Cold / archive    | Total |
| ----------- | ---------------- | ----------------- | ----- |
| Axiom       | 30 days (hot tier) | 60 days (cold tier) | **90 days** |
| R2          | 30 days (Standard) | 60 days (Infrequent Access) | **90 days** — then deleted |

90 days matches the rolling 28-day SLO window with ample headroom for
incident retrospectives and quarterly review. We do NOT retain longer
by default — Logpush data includes IPs and user-agents which, while not
PII strictly, should not accumulate indefinitely.

### 4.1 Axiom configuration

In Axiom → Settings → Datasets → `cloudflare-pages-groupsmix` →
Retention: set "hot" to 30 days and enable the "cold" tier for 60
additional days. Cold-tier queries are slower but cheaper and acceptable
for post-mortems.

### 4.2 R2 lifecycle rules

R2 speaks the S3 lifecycle XML/JSON. Apply the following via `wrangler r2
bucket lifecycle put` (or the dashboard):

```json
{
  "rules": [
    {
      "id": "gm-logs-tier-and-expire",
      "enabled": true,
      "conditions": { "prefix": "pages-function-logs/" },
      "transitions": [
        {
          "condition": { "type": "Age", "maxAge": 2592000 },
          "storageClass": "InfrequentAccess"
        }
      ],
      "deleteObjectsTransition": {
        "condition": { "type": "Age", "maxAge": 7776000 }
      }
    },
    {
      "id": "gm-logs-http-requests-tier-and-expire",
      "enabled": true,
      "conditions": { "prefix": "http-requests/" },
      "transitions": [
        {
          "condition": { "type": "Age", "maxAge": 2592000 },
          "storageClass": "InfrequentAccess"
        }
      ],
      "deleteObjectsTransition": {
        "condition": { "type": "Age", "maxAge": 7776000 }
      }
    },
    {
      "id": "gm-logs-abort-multipart",
      "enabled": true,
      "conditions": {},
      "abortMultipartUploadsTransition": {
        "condition": { "type": "Age", "maxAge": 604800 }
      }
    }
  ]
}
```

Age values are in seconds: 2592000 = 30d, 7776000 = 90d, 604800 = 7d.

Confirm the rules took effect:

```sh
wrangler r2 bucket lifecycle get gm-logs
```

## 5. Incident-time query recipes

### 5.1 Axiom (APL)

28-day API availability (feeds SLO-A1):

```apl
['cloudflare-pages-groupsmix']
| where _time > ago(28d)
| where DispatchNamespace == "production"
| where tostring(Request.URL) matches regex "/api/"
| summarize
    good = countif(Outcome == "ok" and StatusCode < 500),
    bad = countif(Outcome != "ok" or StatusCode >= 500)
| extend slo = 1.0 * good / (good + bad)
```

1-hour burn for the 14.4× alert row in [`docs/slos.md §3.1`](./slos.md#31-burn-rate-alerting):

```apl
['cloudflare-pages-groupsmix']
| where _time > ago(1h)
| where tostring(Request.URL) matches regex "/api/"
| summarize
    good = countif(Outcome == "ok" and StatusCode < 500),
    bad = countif(Outcome != "ok" or StatusCode >= 500)
| extend burn = 1.0 * bad / (good + bad) / (1.0 - 0.995)
| where burn >= 14.4
```

### 5.2 R2

R2 Logpush writes newline-delimited JSON under
`pages-function-logs/{YYYYMMDD}/` and `http-requests/{YYYYMMDD}/`.
For ad-hoc queries during an incident, pull a day's worth locally:

```sh
rclone sync "r2:gm-logs/pages-function-logs/$(date -u +%Y%m%d)/" ./logs/
zcat ./logs/*.log.gz | jq 'select(.Outcome != "ok")' | head
```

(Assuming `rclone` is configured with an R2 profile; `cloudflared` or
`aws s3 sync --endpoint-url` work too.)

## 6. Runbook pointer

On-call queries start at [`RUNBOOK.md §1`](../RUNBOOK.md#1-on-call-basics),
which lists Axiom as the primary log surface and R2 as the archive.
When either destination is unreachable, fall back to the Cloudflare
dashboard → Pages → Functions → Invocation logs (live, ~1 hour of
history).

## 7. Security notes

- Every token referenced above (`CF_API_TOKEN`, `AXIOM_INGEST_TOKEN`,
  `R2_LOGS_ACCESS_KEY_ID`, `R2_LOGS_SECRET_ACCESS_KEY`) is held in
  1Password (ops vault) and passed to Logpush at job-creation time
  only. They are NOT Pages environment variables and MUST NOT be
  committed.
- Rotate the Axiom ingest token and R2 access key pair every 90 days
  per [`RUNBOOK.md §5`](../RUNBOOK.md#5-secret-rotation). Rotation is a
  Logpush job update (`PUT /logpush/jobs/{id}`) — datasets do not have
  to be re-created.
- Logpush destinations MUST be HTTPS / R2 only. No `http://`, no
  unauthenticated S3 buckets, no public webhook destinations.

[cf-logpush]: https://developers.cloudflare.com/logs/logpush/
