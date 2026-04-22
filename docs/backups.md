# Backups

What data GroupsMix backs up, where it lives, and how long it is retained.
See [`DISASTER_RECOVERY.md`](../DISASTER_RECOVERY.md) for how to restore.

## 1. Supabase Postgres

The canonical data store — users, groups, articles, purchases, audit logs.

| Backup type | Cadence | Retention | Source of truth |
| --- | --- | --- | --- |
| **Managed daily snapshot** | Every 24h (Supabase managed) | **7 days** rolling | Supabase project dashboard → *Database → Backups*. |
| **Point-In-Time Recovery (PITR)** | Continuous WAL | **7 days** (Pro tier default) | Supabase dashboard → *Database → Point-In-Time Recovery*. |
| **Weekly logical dump** | Every Sunday 04:00 UTC | **90 days** in R2 (`r2://gm-backups/supabase/`) | `scripts/dump-supabase.sh` (tracked as follow-up — see RUNBOOK §4.x). |
| **Monthly encrypted dump → cold storage** | 1st of month 04:00 UTC | **13 months** in R2 glacier-equivalent tier | Same script; additional `--encrypt` flag with the GPG key in
1Password → *GroupsMix / Backup Encryption*. |

RPO is bounded by PITR: **1 hour** is the realistic worst-case loss; in
practice it is seconds, because PITR streams WAL continuously.

### 1.1 Verifying a Supabase backup

Once a quarter, during the DR drill (see `DISASTER_RECOVERY.md §5`):

1. Create a throwaway Supabase project.
2. From the source project dashboard → *Backups → Download* a daily
   snapshot.
3. Restore it into the throwaway project.
4. Run the smoke suite against the restored project:
   ```bash
   SUPABASE_URL=<throwaway> \
   SUPABASE_SERVICE_KEY=<throwaway-key> \
   npm run test -- tests/smoke
   ```
5. Delete the throwaway project.

## 2. Cloudflare KV namespaces

`STORE_KV` and `RATE_LIMIT_KV` hold ephemeral cache and rate-limit counters.

- **No backup.** Both are derivable:
  - `STORE_KV` repopulates on first request from LemonSqueezy's API.
  - `RATE_LIMIT_KV` is short-TTL counters; losing it resets some users'
    windows but never corrupts state.

If either is accidentally wiped, no recovery action is needed beyond
allowing traffic to warm the caches.

## 3. Cloudflare R2 — Logpush

See [`docs/observability.md §2`](./observability.md). Retention is
enforced per-prefix by R2 lifecycle rules:

| Prefix | Retention |
| --- | --- |
| `http-requests/` | 30 days |
| `pages-functions/` | 90 days |
| `workers-trace/` | 30 days |

These are log archives; they do **not** back up application data and are
not part of the RPO calculation.

## 4. LemonSqueezy

- **Order / customer history** — queryable via the LemonSqueezy dashboard
  and API **indefinitely**. No repo-side backup needed.
- **Webhook secret** — stored in 1Password; rotation tracked in
  `RUNBOOK.md §4.7`.
- **Webhook replay ledger** (local `purchases_webhook_events` table)
  is covered by the Supabase backups above.

## 5. 1Password

The shared vault `GroupsMix / Production` is the source of truth for every
secret not stored in Cloudflare Pages env. 1Password provides:

- **Item history** — previous values are retained per-item (default
  365 days).
- **Account-level export** — the workspace admin exports a `.1pux`
  archive quarterly, stored offline on an encrypted drive.

No secret is ever committed to this repo.

## 6. Source code

- **GitHub** — primary remote at https://github.com/groupsmix/srcgroupsmi.
- **Shallow-clone mirror** — not maintained; GitHub's own redundancy is
  treated as sufficient. If GitHub itself is lost, every contributor's
  local clone is a partial mirror.

## 7. Config / environment

Cloudflare Pages env variables are **not** backed up by Cloudflare. Our
mitigation:

- The canonical list of required env vars is checked in as
  [`wrangler.toml`](../wrangler.toml) and `.env.example`.
- Current *values* are mirrored in 1Password → *GroupsMix / Cloudflare Env*
  as a secure note, updated whenever a secret is rotated.

This keeps the "what do I need to re-set after rebuilding the Pages
project" question answerable from 1Password alone.

## 8. Audit

Every entry in `public.dsar_audit` is retained **indefinitely** via the
Supabase backups above. This is a regulatory requirement (GDPR Article
5(1)(f) — accountability) and must not be pruned as part of normal
cleanup jobs.
