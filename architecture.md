# GroupsMix Architecture

## Overview

GroupsMix is a directory, community, and marketplace platform built on the modern edge stack.

## Tech Stack

*   **Frontend**: Astro (SSG + Islands Architecture), Preact/SolidJS (in progress).
*   **Backend**: Cloudflare Pages Functions (Serverless APIs).
*   **Database**: Supabase (PostgreSQL) with Row Level Security (RLS).
*   **Authentication**: Supabase Auth (JWT).
*   **Storage**: Supabase Storage (S3-compatible).
*   **Payments**: LemonSqueezy (Webhooks).
*   **Email**: Resend.
*   **Security**: Cloudflare Turnstile (CAPTCHA), Have I Been Pwned API (Passwords).
*   **Testing**: Vitest (Unit/Integration), Playwright (E2E), pgTAP (Database RLS).

## System Design

1.  **Astro Pages**: The majority of the site (`src/pages/`) is statically generated (SSG) for optimal SEO and Core Web Vitals.
2.  **Interactive Islands**: Dynamic components (like Dashboards, Modals, Forms) are being migrated from vanilla JS (`public/assets/js/`) to Astro Islands (Preact/SolidJS) for better state management and hydration.
3.  **Cloudflare Functions**: The API (`functions/api/`) handles complex business logic that cannot be safely executed on the client (e.g., LemonSqueezy webhooks, external API calls, AI generation, complex data aggregation).
4.  **Supabase RLS**: Direct database access from the client is permitted *only* for operations secured by robust Row Level Security (RLS) policies defined in `supabase/migrations/`.
5.  **AI Integration**: The platform integrates with various LLMs (via OpenRouter) for features like store listing enhancement, article generation, and group moderation.

## Security Posture

*   **Zero Trust Client**: The backend never trusts the client's assertion of identity (e.g., `user_id` in a JSON body). Identity is always extracted from the verified Supabase JWT (`requireAuth` middleware).
*   **Defensive SQL**: All dynamic SQL filters (especially PostgREST `.or()` and `.ilike()`) are strictly sanitized to prevent injection attacks.
*   **Server-Side Validation**: All API endpoints validate input using `zod` and implement rate limiting.
*   **Data Minimization**: User accounts can be permanently deleted or soft-deleted (with a 30-day grace period), complying with GDPR/CCPA.
*   **Secrets Management**: API keys (Turnstile, LemonSqueezy, Resend, OpenRouter) are stored securely in Cloudflare Pages environment variables, never exposed to the client.

## Deployment Pipeline

*   **CI/CD**: GitHub Actions.
*   **Linting**: Biome (strict mode).
*   **Testing**: Vitest (runs on every PR). Playwright E2E (runs on main branch).
*   **Database Migrations**: Supabase CLI (applied automatically on deployment).
*   **Hosting**: Cloudflare Pages.