# Backups

Tracking issue: **H-5** (nominally dependent on F-010, which has not
landed in this repo — this document defines the baseline policy
rather than refining an existing one).

Companion to [`../RUNBOOK.md`](../RUNBOOK.md) (day-to-day ops) and
[`../DISASTER_RECOVERY.md`](../DISASTER_RECOVERY.md) (restore /
cutover). This document answers four questions:

1. What do we back up?
2. How do we back it up?
3. How long do we keep it?
4. How do we verify the backups are restorable?

Everything below is deliberately boring. Backups fail the week you
stop looking at them; the goal is a policy a new on-call can execute
without improvisation.

---

## 1. Supabase: Point-In-Time Recovery (PITR)

Supabase PITR is the **primary** recovery mechanism for the data
plane. It's continuous WAL-based replication retained for 7 days on
the Pro plan (upgradeable to longer retention on Team / Enterprise).

### 1.1 Requirements

- Project plan: **Pro or higher**. PITR is not available on Free.
  If this project ever drops below Pro, treat it as a SEV-2
  reliability incident — there is no local logical dump that will
  meet the 1-hour RPO by itself.
- PITR is enabled in Supabase dashboard → Database → Backups. The
  toggle must stay on. Add "verify PITR enabled" to the monthly SLO
  review in [`slos.md §4.2`](./slos.md).

### 1.2 Coverage

PITR covers **all** schemas in the Postgres instance:

- `public` — product data (`users`, `coins_ledger`, `articles`,
  `marketplace_*`, `jobs_*`, `dsar_audit`, …).
- `auth` — Supabase auth users and refresh tokens.
- `storage` — object metadata (the R2 / S3 blobs themselves are
  backed up by the object store; see §3).

It does NOT cover:

- KV namespaces — see §4.
- Anything outside Supabase (e.g. LemonSqueezy's own ledger, which
  is our source of truth for payments — see §5).

### 1.3 RPO

PITR replays WAL, so the recovery point is bounded by the WAL lag
(usually seconds). The DR RPO of 1 hour in
[`../DISASTER_RECOVERY.md §1`](../DISASTER_RECOVERY.md) is set by
the operator-in-the-loop, not by the mechanism.

## 2. Supabase: scheduled logical dump

A logical dump is redundant with PITR when PITR works. It exists
for two cases PITR does not cover:

1. PITR retention has rolled off (> 7 days on the Pro plan).
2. PITR is unavailable (plan downgrade, Supabase incident that
   prevents promotion of a restored snapshot).

### 2.1 Mechanism

Run `pg_dump` against the Supabase project's read-only replica once
per day, upload the resulting `.dump` file to Cloudflare R2 under
`r2://gm-backups/pg/YYYY-MM-DD/groupsmix.dump`.

The dump is scheduled by the same external scheduler that triggers
our cron endpoints; the command, in skeleton form:

```bash
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --exclude-schema=_realtime \
  --exclude-schema=_analytics \
  --exclude-schema=pgsodium \
  "$SUPABASE_DB_URL_READONLY" \
  | aws s3 cp - "s3://gm-backups/pg/$(date -u +%F)/groupsmix.dump" \
    --endpoint-url "$R2_ENDPOINT"
```

Environment:

- `SUPABASE_DB_URL_READONLY` — connection string for a read-only
  Postgres role provisioned specifically for dumps. Do NOT use the
  service-role-linked connection; it has more privileges than we
  want in the dump context.
- `R2_ENDPOINT`, plus `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
  scoped to the `gm-backups` bucket only, with `PutObject` and
  `GetObject` (no delete).

The R2 credentials live in the scheduler's secret store (1Password
/ ops vault). They are **not** exposed to Cloudflare Pages at
runtime — the app does not read backups, it only writes data that
gets backed up.

### 2.2 Schema-excludes

The Supabase internal schemas (`_realtime`, `_analytics`, `pgsodium`
extension tables) are excluded from the dump because:

- They are recreated automatically when a new Supabase project is
  provisioned.
- They include encryption material that must not leave the Supabase
  boundary.

Do not add extensions to the dump without a security review.

### 2.3 Retention

| Frequency | Retention | Storage class |
|-----------|-----------|---------------|
| Daily     | 30 days   | R2 Standard   |
| Weekly (Sunday) | 1 year | R2 Standard → Infrequent Access after 90 days |
| Monthly (1st of month) | 5 years | R2 Infrequent Access |

Lifecycle is enforced by an R2 bucket lifecycle rule, not by the
dump job itself. The job only ever uploads; old objects are expired
by R2. This keeps the job idempotent and stateless.

## 3. Supabase Storage (object blobs)

User-uploaded assets live in Supabase Storage, which is backed by
S3-compatible object storage on Supabase's side. Supabase replicates
these across availability zones within the chosen region; there is
**no built-in cross-region or offsite backup** for storage content.

Policy:

- Treat Storage objects as **reconstructible** where possible:
  avatars and cover images are user-replaceable; thumbnails are
  re-derivable from the source image.
- For objects that are NOT reconstructible (e.g. signed contract
  uploads in `articles`, KYC documents if any are added in the
  future), mirror them to R2 via a Supabase webhook + Edge Function.
  Not implemented today; tracked as a follow-up below.
- The `dsar_audit` table stores the path + hash of every piece of
  PII we generate on a user export, so if object storage is lost we
  can at minimum tell affected users what was involved.

## 4. KV namespaces

| Namespace       | Contents                                   | Recovery |
|-----------------|--------------------------------------------|----------|
| `STORE_KV`      | Cached LemonSqueezy product catalog        | Rehydrated on first cache miss from the LemonSqueezy API. No backup needed. |
| `RATE_LIMIT_KV` | Rate-limit counters with TTL               | Rehydrates naturally; in-memory fallback while empty (see `functions/api/_shared/rate-limit.js`). |

Neither is backed up. A wiped KV is a transient degradation, not a
data-loss event.

If we add a KV namespace that stores non-reconstructible data in
the future, amend this table and add a nightly `wrangler kv:key
list` export to the same R2 bucket used for logical dumps.

## 5. LemonSqueezy as an external source of truth

LemonSqueezy retains the authoritative payment record for every
order. Our `coins_ledger` is a derived projection of LemonSqueezy
webhook deliveries. This means:

- Even in the worst case (`coins_ledger` rows lost and both PITR
  and logical dumps also lost), we can re-derive the ledger by
  replaying webhook deliveries from LemonSqueezy → Webhooks →
  History.
- LemonSqueezy retains webhook history per its own policy (check
  the current retention in their dashboard; historically ~30 days).
  Do NOT rely on LemonSqueezy retention as a substitute for PITR —
  it is a fallback, not a strategy.

See [`../DISASTER_RECOVERY.md §3.2 step 5`](../DISASTER_RECOVERY.md)
for the replay procedure.

## 6. Verification (the part that's easy to skip)

A backup is not a backup until it has been restored.

### 6.1 Monthly drill

On the first Tuesday of every month, an operator runs the following
and files the result in the monthly SLO review
([`slos.md §4.2`](./slos.md)):

1. Pick the most recent logical dump from R2.
2. Stand up a throwaway Supabase project (or local Postgres) and
   run `pg_restore` against the empty instance.
3. Run the verification queries from
   [`../DISASTER_RECOVERY.md §3.2 step 4`](../DISASTER_RECOVERY.md).
4. Tear down the throwaway instance.
5. Note the wall-clock restore time; if it trends upward, raise the
   retention / storage class conversation before the next plan
   renewal.

### 6.2 Quarterly PITR drill

Once per quarter, restore a Supabase PITR snapshot into a throwaway
project and run the same verification queries. This is the only way
to confirm the PITR path actually works — the logical dump monthly
drill does NOT cover the Supabase-side restore mechanism.

### 6.3 Annual full DR drill
 
Once per year, run the full cutover procedure from
[`../DISASTER_RECOVERY.md §4`](../DISASTER_RECOVERY.md) against a
pre-prod Pages project. The only differences from a real cutover:
maintenance mode stays off on the real prod project, and the final
step (env-var swap) happens on the pre-prod project instead.

**ACTION REQUIRED:** The engineering team must maintain a recurring calendar invite for the first week of November every year, titled "GroupsMix Annual DR Drill". This calendar event must include a link to this document and the `DISASTER_RECOVERY.md` runbook. Ensure the event is owned by a team alias, not an individual, to survive employee turnover.

## 7. Follow-ups

Not in scope for this change, but worth tracking:

- [ ] Implement the Storage-object mirror for non-reconstructible
      blobs (§3 bullet).
- [ ] Wire the monthly restore drill result into a dashboard so it
      is visible without someone remembering to look.
- [ ] Evaluate Supabase's longer PITR retention tiers once we have
      a year of cost data.
- [ ] Consider a secondary storage destination for the logical
      dump (e.g. Backblaze B2) so we are not single-vendor on R2
      for the cold-storage copy.
