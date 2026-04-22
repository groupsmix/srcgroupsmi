# GroupsMix Runbook

Operational playbooks for the GroupsMix production stack. This file is the
first thing on-call should open during an incident. Everything here should
be **actionable** — if a section points at a tool or command, it must
exist and be runnable without additional setup.

See also:
- [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md) — full rebuild procedure.
- [`docs/backups.md`](./docs/backups.md) — what is backed up and where.
- [`docs/slos.md`](./docs/slos.md) — SLOs + error-budget policy.
- [`docs/alerts.md`](./docs/alerts.md) — Sentry alert routing.
- [`docs/observability.md`](./docs/observability.md) — Sentry + Logpush setup.

## 0. On-call quick links

- **Cloudflare Pages:** https://dash.cloudflare.com/?to=/:account/pages/view/groupsmix
- **Supabase project:** https://supabase.com/dashboard/project/hmlqppacanpxmrfdlkec
- **Sentry orgs:** `groupsmix-web`, `groupsmix-edge` at https://sentry.io/organizations/groupsmix/
- **LemonSqueezy dashboard:** https://app.lemonsqueezy.com/
- **Status page:** https://groupsmix.betteruptime.com (external probe)
- **PagerDuty service:** `groupsmix-edge`

## 1. Incident classification

Use the severity tiers from [`docs/alerts.md`](./docs/alerts.md):

- **P1:** user-visible money / auth path broken. Page immediately.
- **P2:** elevated error rate; notify `#oncall-groupsmix`.
- **P3:** informational; triage during business hours.

An event only becomes an **incident** once a P1 is confirmed or a P2 has
been firing for > 30 min. Open a Slack incident channel named
`#inc-YYYY-MM-DD-<slug>` and post updates there.

## 2. Standard response loop

1. **Acknowledge** the PagerDuty page or Sentry alert.
2. **Check status page** (BetterStack) — is the external probe also
   failing? If yes, assume edge / DNS outage before application bug.
3. **Check Cloudflare** [status](https://www.cloudflarestatus.com/) and
   [Supabase](https://status.supabase.com/). If either is incident,
   post the link in the incident channel and wait — do not roll back
   application code until the upstream resolves.
4. **Check recent deploys:** `git log --since='2 hours ago' --oneline origin/main`.
   If the window aligns with the first event, strongly consider
   rolling back per §3.
5. **Search Sentry** for the error; pin the issue to the incident
   channel.
6. **Mitigate** before investigating root cause. Rollback > feature flag
   > code fix.

## 3. Rolling back a bad deploy

Cloudflare Pages keeps every prior deployment. To revert:

1. Open the Pages project → **Deployments** tab.
2. Find the last known-good deploy (pre-incident commit SHA — compare
   against `git log`).
3. Click **⋯ → Rollback to this deployment**. The rollback is typically
   live in < 30 seconds.
4. After rollback stabilizes, revert the offending commit via PR:
   ```bash
   git revert <bad-sha> && git push -u origin revert/<bad-sha>
   ```
   Do **not** force-push over main.

## 4. Common playbooks

### 4.1 Payments — webhook failing
**Symptoms:** `P1-EDGE-1` firing, LemonSqueezy dashboard shows failing
deliveries to `/api/lemonsqueezy-webhook`.

1. Verify the secret is still set in Cloudflare Pages → Settings → Env:
   `LEMONSQUEEZY_WEBHOOK_SECRET`. If missing → this is a config drift
   incident, re-set from 1Password → *GroupsMix / LemonSqueezy*.
2. Check the replay ledger table (introduced by Epic B) for recent
   inserts — if the handler is running but rejecting as duplicate the
   upstream is retrying correctly and no action is needed beyond
   monitoring.
3. If truly dropping events: replay from LemonSqueezy dashboard →
   *Webhooks → Deliveries → Retry* for each failed delivery **after**
   the fix is live.

### 4.2 Payments — customer did not receive coins
1. Cross-reference the purchase in LemonSqueezy (receipt / order ID)
   against the `purchases` table in Supabase.
2. If purchase is absent → check the webhook replay ledger; if present
   there but not reconciled, run the dead-letter reprocessor (Epic B).
3. If purchase is present but `credited_coins` is 0 → manually run
   `SELECT public.credit_coins(:user_id, :coins, :reason);` from the
   Supabase SQL editor, then write a `credit_adjustment` audit row.
4. Notify the customer via Resend once credited.

### 4.3 Supabase degraded
1. Confirm via https://status.supabase.com/.
2. The edge handlers already fail closed on missing config; existing 503s
   are expected during an upstream outage.
3. Freeze any background writes that rely on Supabase: **pause**
   `compute-feed`, `newsletter-digest`, and `purge-deleted` cron triggers
   from the Cloudflare dashboard (Cron Triggers tab). Do **not** delete
   them.
4. Resume all paused crons once Supabase reports all green + 10 min of
   recovery headroom.

### 4.4 Bot surge / Turnstile spike
**Symptoms:** `P2-EDGE-2` firing, elevated 429s on auth endpoints.
1. Confirm via Cloudflare Analytics → *Security Events*.
2. Temporarily raise Cloudflare WAF sensitivity to *High* on the zone.
3. If abuse is from a single ASN → add a Cloudflare firewall rule
   blocking it. Document the rule in the incident channel.
4. After the surge subsides, roll back WAF sensitivity to *Medium*.

### 4.5 Cron endpoint not running
1. Cloudflare Pages dashboard → **Triggers → Cron**: verify each schedule
   declared in [`wrangler.toml`](./wrangler.toml) is present with the
   expected cron expression.
2. Manually invoke with the cron secret to confirm the handler is alive:
   ```bash
   curl -fsS -X POST \
     -H "X-Cron-Secret: $CRON_SECRET" \
     -H 'Content-Type: application/json' \
     -d '{"job":"trending"}' \
     https://groupsmix.com/api/compute-feed
   ```
3. If the manual call returns `503 service not configured` → the
   `CRON_SECRET` secret is missing from the Pages environment. Re-set
   from 1Password → *GroupsMix / Cron Secret*.
4. If the manual call returns `200` but the schedule still is not firing,
   re-create the Cron Trigger from the dashboard (a known Cloudflare
   quirk: edits sometimes silently disable the trigger).

### 4.6 DSAR / GDPR delete request
1. User files a DSAR via the `/account/export` or `/account/delete` UI;
   both endpoints are authenticated and require Turnstile.
2. Soft delete is immediate. Hard delete runs via `purge-deleted` cron
   (default: 03:17 UTC daily).
3. To force an immediate hard delete:
   ```bash
   curl -fsS -X POST \
     -H "X-Cron-Secret: $CRON_SECRET" \
     -H 'Content-Type: application/json' \
     -d '{"limit":1}' \
     https://groupsmix.com/api/purge-deleted
   ```
4. Confirm the user's `auth_id` is absent from `public.users` and a
   `hard_delete` row is present in `dsar_audit`.

### 4.7 Secrets rotation
1. Rotate the upstream secret (Supabase / LemonSqueezy / Turnstile / etc.).
2. Update Cloudflare Pages → Settings → Env Variables → *re-deploy is
   required for values to take effect*. Trigger a redeploy by pushing an
   empty commit or using **Deployments → Retry**.
3. Delete the previous value from the provider once traffic on the new
   deployment is confirmed healthy (wait ≥ 15 min).

### 4.8 Synthetic alert tests
Quarterly, verify each P1 rule still pages end-to-end:
- `P1-EDGE-1`: set `LEMONSQUEEZY_WEBHOOK_SECRET=test-only` on a preview
  deploy and POST to `/api/lemonsqueezy-webhook` — should refuse and emit
  a Sentry event tagged `endpoint:lemonsqueezy-webhook`.
- `P1-EDGE-2`: unset `SUPABASE_SERVICE_KEY` on a preview deploy and call
  `/api/compute-feed` — should 503 and emit a Sentry event.
- Record pass/fail in the incident-log spreadsheet.

## 5. Post-incident

Within **5 business days** of any P1 or any incident lasting ≥ 30 min:

1. Open a post-mortem PR under `docs/incidents/YYYY-MM-DD-<slug>.md`.
2. Include: timeline (UTC), impact, root cause, detection gap,
   response gap, action items with owners + due dates.
3. Review in the next weekly on-call sync.

## 6. Contact matrix

| Role | Primary | Backup |
| --- | --- | --- |
| On-call engineer | PagerDuty schedule `groupsmix-edge` | Manual page to `#oncall-groupsmix` |
| Supabase support | project dashboard → *Support* | — |
| LemonSqueezy support | support@lemonsqueezy.com | — |
| Cloudflare support | Enterprise ticket (if applicable) | Twitter `@CloudflareHelp` |
