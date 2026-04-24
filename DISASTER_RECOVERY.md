# Disaster Recovery

Tracking issue: **H-5**.

Companion to [`RUNBOOK.md`](./RUNBOOK.md) (day-to-day ops) and
[`docs/backups.md`](./docs/backups.md) (backup policy). This document
covers **recovery** — what to do when something is already lost.

> **Platform migration note (pre-launch):** The site moved from
> Cloudflare **Pages** to Cloudflare **Workers + Static Assets**
> pre-launch. Where the recovery procedures below reference "Cloudflare
> Pages → `gm-prod`", substitute "Cloudflare Workers & Pages →
> `groupsmix` Worker". The edge-recovery steps are otherwise
> unchanged: the build artifact is still `dist/`, bindings are still
> `STORE_KV` and `RATE_LIMIT_KV`, and the cron schedules listed in
> [`wrangler.toml`](./wrangler.toml) are the authoritative source of
> truth. To rebuild the edge from scratch: `npm install && npm run
> worker:deploy` with the required secrets set via
> `wrangler secret put`.

Scope:

1. RTO / RPO targets.
2. What can be lost and what cannot.
3. Recovery procedures for the realistic failure modes.
4. Cutover procedure when the primary Supabase project is declared
   lost and we need to bring up a restored snapshot.
5. Post-incident checklist.

---

## 1. RTO / RPO targets

- **RTO (Recovery Time Objective) — 4 hours** for a full-site outage
  where no data is lost. RTO is the wall-clock time between an
  operator declaring the incident and the site serving real user
  traffic again.
- **RPO (Recovery Point Objective) — 1 hour** for a Supabase-side
  data-loss event (project destruction, accidental mass delete,
  restore from backup required). The RPO is bounded by whichever of
  Supabase PITR (continuous, ~2 minutes) or the logical daily dump
  ([`docs/backups.md §2`](./docs/backups.md)) is applicable.

RTO / RPO are **targets**, not SLAs. Actual numbers depend on how
fast the operator can get to a keyboard and on Supabase's restore
throughput. Report the actual measured time in the post-incident
review.

## 2. What can be lost, what cannot

### 2.1 Can be lost (acceptable up to the RPO)

- Per-request analytics rows (`link_analytics`, `feed-track` events,
  impression log): these are already cleaned up on a cron cadence
  (`cleanup_old_impressions`, `cleanup_old_sessions`), so ≤ 60 min of
  loss is invisible after the next cleanup run.
- Rate-limit counters in `RATE_LIMIT_KV`: the code already falls back
  to an in-memory counter on KV failure (see
  `functions/api/_shared/rate-limit.js`). A wiped KV rehydrates
  naturally on first hit.
- Client-side local storage (saved drafts, preferences): regrettable
  but not an incident.

### 2.2 Must NOT be lost

- **`coins_ledger`** — every row must be recoverable. This is the
  money trail for LemonSqueezy credits; a lost row can manifest as
  either an overcharged user or an unpaid creator. See §3.2.
- **`users`, `auth.users`, and all RBAC tables** (see `006_role_based_access_control.sql`).
  Losing RBAC means every subsequent action could run under the
  wrong permissions.
- **`dsar_audit`** — regulatory artifact; losing it puts us offside
  on the privacy migrations (`030_privacy_compliance.sql`).
- **LemonSqueezy webhook deliveries**. The webhook endpoint is
  fail-closed; deliveries LemonSqueezy still has in its retry queue
  are safe, but any dropped-and-acked delivery is lost.

## 3. Recovery procedures

### 3.1 Edge lost (Cloudflare Pages project destroyed or unreachable)

Probability: low (requires either account-level compromise or a
Cloudflare outage in our region). Recovery:

1. Confirm via <https://www.cloudflarestatus.com>. If Cloudflare is
   zone-wide down, wait — there is no immediate failover (§ 3.4).
2. If the Pages **project** is the only casualty (e.g. accidentally
   deleted), recreate it from the GitHub repo:

   ```bash
   # using the wrangler CLI from a trusted operator box
   wrangler pages project create gm-prod \
     --production-branch main \
     --compatibility-date 2024-11-01
   wrangler pages deploy dist --project-name gm-prod --branch main
   ```

3. Re-attach custom domains `groupsmix.com` and `www.groupsmix.com`
   under Pages → Custom domains.
4. Re-enter every env var from
   [`wrangler.toml`](./wrangler.toml) and the KV namespace bindings.
   Pull the actual values from the ops vault; the checked-in
   `wrangler.toml` only lists names.
5. Trigger a deploy from `main` and confirm `/api/health-check`
   returns 200 with the right `version`.

Target: RTO 4 hours from declared incident. The slow steps are
custom domain re-verification and re-binding KVs.

### 3.2 Data plane lost (Supabase project destroyed or corrupted)

Probability: low, but this is the highest-impact scenario. Recovery
uses Supabase Point-In-Time-Recovery (PITR).

1. In Supabase dashboard → Database → Backups, confirm PITR is
   available (Pro plan and up — see
   [`docs/backups.md §1`](./docs/backups.md)). If not, escalate to
   the billing owner before anything else.
2. Create a **new** Supabase project — do NOT restore over the top
   of a potentially-tampered project. Choose a recovery point from
   PITR that is immediately before the incident start (bias earlier,
   not later — restoring into an already-corrupt state is harder to
   reason about than restoring into a slightly stale one).
3. Wait for the restore (~minutes to ~tens of minutes depending on
   DB size).
4. On the restored project: verify the critical tables are intact:

   ```sql
   SELECT count(*) FROM public.users;
   SELECT count(*) FROM public.coins_ledger;
   SELECT max(created_at) FROM public.coins_ledger;
   SELECT count(*) FROM public.dsar_audit WHERE action = 'hard_delete';
   ```

   The `max(created_at)` on `coins_ledger` tells you the actual
   recovery point in user-visible terms.
5. Replay LemonSqueezy deliveries that occurred between the
   recovery point and the incident: in LemonSqueezy → Webhooks →
   History, filter by timestamp and "Resend" each delivery. This is
   what makes the 1-hour RPO achievable.
6. Proceed to [§4 Cutover](#4-cutover).

### 3.3 KV lost (STORE_KV or RATE_LIMIT_KV wiped)

1. Do nothing on `RATE_LIMIT_KV` — it rehydrates on first hit.
2. For `STORE_KV`, invoke `/api/lemonsqueezy` once as an
   authenticated admin to force a cache refresh from the
   LemonSqueezy API (the handler re-caches on miss).
3. Re-bind both namespaces in Pages → Settings → Functions → KV
   namespace bindings if the bindings themselves are gone (e.g. an
   entire Cloudflare account compromise).

### 3.4 Cloudflare zone-wide outage

We do not currently run a secondary edge. Options:

- **Wait.** Post to the status page, drop a note in the incident
  channel, hold.
- **Manual DNS cutover to a bare static mirror** — only if the
  outage is prolonged (> 4 hours) and the static marketing page
  being reachable is business-critical. The mirror is not
  provisioned today; if the ops team decides to provision one in
  the future, document it here and update §6 below.

## 4. Cutover

Use this when a restored Supabase project needs to become the new
primary.

### 4.1 Pre-flight

- [ ] Incident channel is open and a single Incident Commander
      owns the cutover.
- [ ] The restored project has passed the verification queries in
      §3.2 step 4.
- [ ] LemonSqueezy webhook replay plan is ready (§3.2 step 5).
- [ ] Maintenance mode is ENABLED on the production Pages project
      (see [`RUNBOOK.md §3`](./RUNBOOK.md)).

### 4.2 Cutover steps

1. In Cloudflare Pages → `gm-prod` → Settings → Environment
   variables, update:

   - `SUPABASE_URL` → new project URL
   - `SUPABASE_ANON_KEY` → new anon key
   - `SUPABASE_SERVICE_KEY` → new service-role key
   - `PUBLIC_SUPABASE_URL` → matches `SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY` → matches `SUPABASE_ANON_KEY`

2. Trigger a redeploy (Deployments → Retry latest). Do **not**
   push a code commit just to trigger the deploy — that mixes the
   cutover with an unrelated change.

3. Once the redeploy finishes, run a smoke test as Incident
   Commander:

   - `GET /api/health-check` → 200 `{ "ok": true }`.
   - Log into the site with a real test account. Confirm the
     profile row appears.
   - Trigger one cron endpoint manually (see
     [`RUNBOOK.md §4`](./RUNBOOK.md)). Confirm 200 and Supabase
     Reports shows the RPC ran.

4. Replay LemonSqueezy webhooks per §3.2 step 5. Watch
   `coins_ledger` in real time to confirm each replayed event
   lands exactly once:

   ```sql
   SELECT order_id, COUNT(*)
   FROM coins_ledger
   WHERE created_at > now() - interval '2 hours'
   GROUP BY order_id HAVING COUNT(*) > 1;
   ```

   If ANY duplicate appears, stop and open an IC-led side
   investigation before continuing.

5. Disable maintenance mode.

### 4.3 Post-cutover

- Retain the old Supabase project (read-only) for at least 14 days.
  Do not delete it until the post-incident review is closed.
- Rotate `SUPABASE_SERVICE_KEY` and `CRON_SECRET` within 24 hours
  ([`RUNBOOK.md §5`](./RUNBOOK.md)) — the old values were in the
  ops path during an incident, treat them as tainted.
- Update all schedulers with the new `CRON_SECRET`.

## 5. Post-incident checklist

Within 24 hours of resolution:

- [ ] Write a short post-incident review. Template:
      1. Summary (one paragraph).
      2. Timeline (UTC, one line per event).
      3. Impact (users affected, SLO budget spent, dollars if any).
      4. Root cause (not "human error" — the system that let the
         error happen).
      5. What went well / what went poorly.
      6. Action items with owners and dates.
- [ ] Link the review from the monthly SLO review
      ([`docs/slos.md §4.2`](./docs/slos.md)).
- [ ] File action items as issues tagged `reliability`.
- [ ] If `coins_ledger` was touched during recovery, attach the
      before/after counts and any replayed delivery IDs.

## 6. What is NOT covered here (yet)

Document as follow-ups rather than pretending we have a plan:

- **Active-active edge.** We run single-region Cloudflare Pages.
  No current plan for a secondary edge provider.
- **Cross-region Supabase replica.** PITR is our only recovery
  mechanism today; promoting a replica is not in scope.
- **Long-term backup storage beyond Supabase retention.** See
  [`docs/backups.md §2`](./docs/backups.md) for the current
  logical-dump approach; offsite cold storage is on the roadmap.

Open a ticket against this file when any of those land.
