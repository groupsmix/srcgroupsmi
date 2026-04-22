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

- [Node.js](https://nodejs.org/) v20+
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
- `CRON_SECRET` — **required** for `/api/compute-feed`; the handler refuses to run when unset

See `.env.example` for the full list and `wrangler.toml` for the expected KV + cron bindings.

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

## Observability & SRE

- [`docs/observability.md`](docs/observability.md) — Sentry (client + edge) and Cloudflare Logpush setup, including retention policy.
- [`docs/alerts.md`](docs/alerts.md) — concrete Sentry alert rules, severities, channels.
- [`docs/slos.md`](docs/slos.md) — SLOs, error budgets, uptime tracking.
- [`docs/backups.md`](docs/backups.md) — what is backed up and where.
- [`RUNBOOK.md`](RUNBOOK.md) — on-call playbooks.
- [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md) — full rebuild procedure.
- [`wrangler.toml`](wrangler.toml) — authoritative Cloudflare bindings + cron triggers; mirror to the Pages dashboard in the same PR.

Product analytics uses **Plausible** (cookieless, GDPR-safe). The loader at `public/assets/js/shared/plausible.js` is inert until `PUBLIC_PLAUSIBLE_DOMAIN` is set. Sentry uses the loaders at `public/assets/js/shared/sentry.js` (client) and `functions/api/_shared/sentry.js` (edge); both are inert until their DSN env vars are set.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

See [LICENSE](LICENSE) for details.
