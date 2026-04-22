# Disaster Recovery Plan

This document covers the worst-case scenario: GroupsMix's production
environment has been destroyed (account compromise, accidental deletion,
region-wide provider outage) and must be rebuilt from scratch.

For day-to-day incidents see [`RUNBOOK.md`](./RUNBOOK.md). For what is
backed up and where, see [`docs/backups.md`](./docs/backups.md).

## 1. Recovery objectives

| Metric | Target | Notes |
| --- | --- | --- |
| **RPO** (max data loss) | **1 hour** | Supabase Point-In-Time Recovery is the binding constraint. |
| **RTO — public site** | **< 30 min** | Cloudflare Pages rebuild from git is fast; limits below assume the Cloudflare account itself is still intact. |
| **RTO — API + DB** | **< 4 hours** | Supabase PITR restore + env re-wire. |
| **RTO — payments reconciled** | **< 24 hours** | LemonSqueezy webhook replay for the data-loss window. |

If the Cloudflare account itself is lost, RTO for the full site extends to
**≤ 24h** (propagating DNS through a new provider and warming the cache).

## 2. Scenarios

### 2.1 Cloudflare Pages project deleted / corrupted

Impact: site offline; API offline; Supabase + data still intact.

1. From the `main` branch of this repo, re-create the Pages project:
   - Dashboard → **Pages → Create a project → Connect to Git →** select
     `groupsmix/srcgroupsmi`.
   - Build command: `npm run build`, output directory: `dist`.
2. Restore env variables from 1Password → *GroupsMix / Cloudflare Env*
   (the vault should contain a secure note named `pages-env.json`).
3. Re-bind KV namespaces per [`wrangler.toml`](./wrangler.toml):
   `STORE_KV`, `RATE_LIMIT_KV`. Values are ephemeral (cache + rate-limit
   counters) so binding fresh empty namespaces is acceptable.
4. Recreate the Cron Triggers listed in `wrangler.toml [triggers]` under
   **Pages → Settings → Cron Triggers**.
5. Verify:
   - `curl https://<new-pages-domain>/` returns `200`.
   - `curl https://<new-pages-domain>/api/health-check` returns `200`.
6. Point `groupsmix.com` CNAME at the new Pages project.

### 2.2 Supabase project lost

Impact: DB gone; site partially working (static pages only) but all
authenticated flows, comments, purchases broken.

1. Create a new Supabase project in the same region.
2. Restore from the most recent **daily backup** (Project Settings →
   Database → Backups → Restore). For a narrower RPO use **Point-In-Time
   Recovery** — requires Pro tier + PITR enabled. See
   `docs/backups.md` for the retention we maintain.
3. Apply any migrations created after the backup was taken:
   ```bash
   # From a clean checkout of this repo at the commit matching the
   # backup's Supabase schema:
   supabase db push --project-ref <new-ref>
   ```
4. Update Cloudflare Pages env to point at the new project:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`,
     `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`.
5. Re-deploy (empty commit or Pages **Retry deployment**).
6. Run the §4 reconciliation.

### 2.3 LemonSqueezy account / API key compromised

1. Rotate the API key and webhook signing secret in the LemonSqueezy
   dashboard.
2. Update `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_WEBHOOK_SECRET` in
   Cloudflare Pages env.
3. Re-deploy.
4. Review the **webhook replay ledger** table for any events signed with
   the old secret during the suspected compromise window; any row whose
   event cannot be verified against the *new* secret and does not appear
   in the LemonSqueezy dashboard is suspect — refund and flag the user.

### 2.4 Full-account compromise (Cloudflare + Supabase + LemonSqueezy)

1. Declare the incident; notify all users via a static page hosted on a
   fresh provider (e.g. GitHub Pages with the `groupsmix.com` CNAME).
2. Freeze all automated credit operations.
3. Execute §2.1, §2.2, §2.3 in parallel across multiple on-calls.
4. Engage legal / DPO for the GDPR notification clock (72 hours if
   personal data was exposed).

## 3. Recovery runbook (step-by-step, happy path)

Assume §2.2 (Supabase lost) — the most common destructive scenario.

```bash
# 0. Checkout the repo at the commit matching the backup's schema
git clone https://github.com/groupsmix/srcgroupsmi.git
cd srcgroupsmi
git checkout <sha-at-backup-time>

# 1. Create the new Supabase project via dashboard, then:
export SUPABASE_PROJECT_REF=<new-ref>
supabase link --project-ref "$SUPABASE_PROJECT_REF"

# 2. Restore from the managed backup via dashboard (no CLI today).

# 3. Apply any schema drift since the backup:
supabase db push

# 4. Re-seed the service role key in Cloudflare Pages env and re-deploy.
#    (Done via dashboard — no CLI step here.)

# 5. Sanity check from the site itself:
curl -fsS https://groupsmix.com/api/health-check
```

## 4. Post-recovery reconciliation

After the site is healthy again:

1. **Payments:** replay LemonSqueezy webhooks for the data-loss window:
   - LemonSqueezy dashboard → **Webhooks → Deliveries →** filter by date,
     click **Retry** on each delivery that landed during the outage.
   - The replay ledger's `ON CONFLICT DO NOTHING` insert keeps replays
     idempotent.
2. **DSAR state:** check `dsar_audit` for any `soft_delete` rows that no
   longer have matching `users` rows — those are users already purged by
   the cron job; no action needed. Any `soft_delete` with a user still
   present and `deletion_scheduled_at < now()` should be re-enqueued.
3. **Feed scores / trending:** manually invoke `compute-feed?job=all`
   once to rebuild scores from the restored data.
4. **Cache warming:** KV-backed caches (STORE_KV) will self-populate; no
   action needed.

## 5. Quarterly DR drill

Once per quarter:

1. Spin up a **preview** Pages project + a **throwaway** Supabase project.
2. Restore the latest production backup into the throwaway project.
3. Point the preview Pages project at it.
4. Verify the drill environment is healthy (login, checkout, compute-feed).
5. Log the drill in `docs/incidents/YYYY-QN-dr-drill.md` with timing.

The drill proves our RTO claims and catches migration drift before a real
incident.
