# Vendor Lock-in & Exit Plan

This document outlines our dependencies on third-party services and platforms, detailing the technical debt and required migration effort if we ever need to exit these platforms.

## 1. Cloudflare Workers & KV

**Lock-in Depth:** Medium

We heavily rely on Cloudflare Workers for our edge API handlers (`functions/api/`). While the core logic uses standard Web APIs (`fetch`, `Request`, `Response`, `crypto.subtle`), we are tightly coupled to Cloudflare's proprietary bindings for:
- `RATE_LIMIT_KV` and `STORE_KV` namespaces
- Cloudflare Cron Triggers (`wrangler.toml`)
- Cloudflare Pages static asset routing

**Exit Plan:**
To migrate to Deno Deploy, Fly.io, or AWS Lambda:
1. Re-implement the rate limiting (`checkRateLimitKV`) and replay ledger against an external Redis instance or Postgres table.
2. Replace `wrangler.toml` crons with a standalone task scheduler (e.g., AWS EventBridge or a simple VM running `cron` invoking HTTP endpoints with the secret).

## 2. Supabase (Postgres & Auth)

**Lock-in Depth:** High

We rely on Supabase for Auth (JWT issuance), PostgreSQL, Row-Level Security (RLS), Storage, and the PostgREST API layer. Our API handlers directly emit PostgREST queries (e.g., `?select=...&auth_id=eq....`).

**Exit Plan:**
1. **Database:** Standard Postgres. A `pg_dump` can easily be restored to RDS or another managed Postgres provider.
2. **Auth:** Hardest to replace. We would need to build a custom JWT issuer and handle user sessions, or migrate to Auth0/Clerk, mapping old user UUIDs to new identities.
3. **PostgREST:** Can be self-hosted alongside a new Postgres instance. This prevents us from having to rewrite every SQL query string in the Node handlers.

## 3. LemonSqueezy

**Lock-in Depth:** High

We use LemonSqueezy for hosted checkout, subscription management, and webhook deliveries. Our `coins_ledger` and `purchases` tables are direct projections of their proprietary payload structures.

**Exit Plan:**
Migrating to Stripe or Paddle is a multi-month project:
1. **Schema:** Abstract our internal `orders` and `subscriptions` tables away from LemonSqueezy's exact JSON shape.
2. **Webhooks:** Re-write the webhook verification logic and `handleCoinRefund` / `syncSubscriptionEvent` state machines to parse Stripe's event model.
3. **Active Subscriptions:** Coordinate a payment token migration with LemonSqueezy and the new provider, which often requires manual customer intervention.

## 4. AI Providers (Groq & OpenRouter)

**Lock-in Depth:** Low

We use standard OpenAI-compatible JSON APIs (`chat/completions`) for Groq, OpenRouter, and our paid fallbacks (Anthropic/OpenAI). 

**Exit Plan:**
Zero code changes required beyond updating environment variables (`OPENROUTER_API_KEY`) and model string names in `chat.js` and `jobs-board.js`.
