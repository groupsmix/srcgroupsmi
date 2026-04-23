# GroupsMix

> Discover, join, and promote trusted social media groups across WhatsApp, Telegram, Discord, and Facebook.

[groupsmix.com](https://groupsmix.com)

## Tech Stack

- **[Astro](https://astro.build/)** — Static Site Generation (SSG)
- **[Cloudflare Pages](https://pages.cloudflare.com/)** — Hosting + Edge Functions (API)
- **[Supabase](https://supabase.com/)** — Database, Auth, Row Level Security
- **Vanilla JavaScript** — Frontend (no framework)
- **[LemonSqueezy](https://www.lemonsqueezy.com/)** — Payments

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v22+
- npm

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/groupsmix/srcgroupsmi.git
cd srcgroupsmi

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env
# Fill in your API keys in .env

# 4. Start the dev server
npm run dev
```

### Scripts

| Command         | Description                              |
|-----------------|------------------------------------------|
| `npm run dev`   | Start the Astro dev server               |
| `npm run build` | Build for production (Astro + SW stamp)  |
| `npm run preview` | Preview the production build locally   |
| `npm test`      | Run tests with Vitest                    |

## Project Structure

```
srcgroupsmi/
├── src/
│   ├── layouts/          # Astro layouts (BaseLayout)
│   └── pages/            # Astro pages (routes)
├── functions/
│   ├── api/              # Cloudflare Pages Functions (API endpoints)
│   │   └── _shared/      # Shared utilities (auth, cors)
│   └── gm-ctrl-x7.js    # Admin panel server-side gate
├── public/
│   ├── assets/
│   │   ├── css/          # Stylesheets
│   │   └── js/           # Client-side JavaScript
│   ├── manifest.json     # PWA manifest
│   └── sw.js             # Service worker
├── supabase/
│   └── migrations/       # Database migrations (001–028, plus 017b / 020b)
├── tests/                # Test files (Vitest)
├── scripts/              # Build scripts (SW stamping)
└── .github/workflows/    # CI pipeline
```

## Deployment

The site is deployed on **Cloudflare Pages** with Git integration. Pushing to `main` triggers an automatic deployment.

### Environment Variables

Set the following in your Cloudflare Pages dashboard:

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase public anon key
- `SUPABASE_SERVICE_KEY` — Supabase service role key (server-side only)
- `TURNSTILE_SECRET_KEY` — Cloudflare Turnstile secret key
- `GROQ_API_KEY` — Groq API key (AI features)
- `OPENROUTER_API_KEY` — OpenRouter API key (AI features)
- `LEMONSQUEEZY_WEBHOOK_SECRET` — **required** for `/api/lemonsqueezy-webhook`; the handler refuses all requests when unset
- `CRON_SECRET` — **required** for every cron-triggered endpoint (`/api/compute-feed`, `/api/purge-deleted`, `/api/newsletter-digest`, `/api/article-schedule`); each handler refuses to run when unset and returns 401 on a mismatched `X-Cron-Secret` header
- `AI_QUOTA_DAILY_LIMIT` — optional integer override for the per-user daily AI quota (default: `100` units). Each AI tool has a weight (see `functions/api/_shared/ai-quota.js` `TOOL_WEIGHTS`); the counter is keyed `aiq:{userId}:{YYYY-MM-DD}` in `RATE_LIMIT_KV` and resets at UTC midnight.

See [`.env.example`](.env.example) for the full list and [`wrangler.toml`](wrangler.toml) for the expected KV namespaces, env vars, and cron triggers.

### Operations

- [`RUNBOOK.md`](RUNBOOK.md) — on-call playbooks, manual cron invocation, secret rotation, deploy / rollback.
- [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md) — RTO / RPO, recovery procedures, Supabase cutover.
- [`docs/backups.md`](docs/backups.md) — Supabase PITR, logical dump, KV and Storage backup policy.
- [`docs/slos.md`](docs/slos.md) — SLOs, error budgets, uptime tracking.
- [`docs/observability.md`](docs/observability.md) — Sentry + Cloudflare Logpush scaffolding.

## Security

- **Row Level Security (RLS)** on all Supabase tables
- **RBAC** with DB-level triggers preventing self-role-elevation
- `credit_coins` / `debit_coins` RPCs have `EXECUTE` revoked from `anon` and `authenticated` — only the service-role key (via server Functions) and other `SECURITY DEFINER` functions may invoke them
- **Turnstile CAPTCHA** on auth flows (client + server verification)
- **Rate limiting** at both client and server levels (KV-backed with in-memory fallback on KV failure)
- **HSTS, X-Frame-Options, frame-ancestors, COOP, CORP** security headers; CSP is enforced but still permits `'unsafe-inline'` pending a separate hardening pass tracked in `public/_headers`
- **Webhook signature verification** (HMAC-SHA256, constant-time via `crypto.subtle.verify`) on payment webhooks — handler **fails closed** when the signing secret is not configured
- **Session inactivity timeout** (30-minute auto-logout)
- **Disposable email blocking** on signup

### Known hardening TODOs

- Drop `'unsafe-inline'` from CSP once inline `<script>` blocks and `style="..."` attributes are moved to external files / nonce-based CSP.
- `functions/api/groq.js` `sanitizeInput()` is a length cap, not prompt-injection defense. A separate pass should validate model output shape for tool-driven prompts.
- No centralized error tracking yet. `public/assets/js/head-scripts.js` has a placeholder Sentry / GA4 block that is inert until a DSN / measurement ID is provided.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

See [LICENSE](LICENSE) for details.
