# GroupsMix AI Agent Playbook (AGENTS.md)

This repository is optimized for autonomous AI Agents (like Trae, GitHub Copilot Workspace, Cursor, or Devin) to assist with development.

## Project Structure

*   `src/`: Astro frontend. Contains pages, layouts, and islands.
*   `public/assets/js/`: Client-side Javascript modules. These are being gradually migrated to Astro island components.
*   `functions/api/`: Cloudflare Pages Functions. Serverless backend API.
*   `supabase/migrations/`: Postgres SQL migrations. All schema changes and RLS policies live here.
*   `tests/`: Vitest unit/integration tests.
*   `e2e/`: Playwright end-to-end tests.

## Key Conventions

1.  **Security First**: Never trust client input. All DB operations run via Supabase client, and user IDs must be derived from `Auth.getUserId()` (frontend) or the verified JWT via `requireAuth()` (backend), *never* from the request body.
2.  **PostgREST Filtering**: When using `.or()`, `.ilike()`, or `.eq()` with user input, always sanitize it using `Security.pgrstQuoteValue()` or `Security.pgrstIlikeContains()` to prevent PostgREST injection.
3.  **RLS Policies**: All tables must have Row Level Security enabled. Changes to schema require corresponding updates to `schema.sql` and migration files.
4.  **Rate Limiting**: Public endpoints in `functions/api/` must implement `checkRateLimit()` to prevent abuse.
5.  **Timeouts**: External fetch requests (e.g., to LemonSqueezy, Resend, Turnstile) must be wrapped in an `AbortController` with a reasonable timeout (e.g., 5000ms - 10000ms).

## AI Instructions

When making changes to this codebase, please:

1.  **Read existing code**: Check `functions/api/_shared/` for existing utilities (auth, validation, cors, response) before writing new ones.
2.  **Write Tests**: For new API endpoints, add a corresponding Vitest suite in `tests/`. For critical UI flows, add to `e2e/`.
3.  **Check Types**: We are migrating to TypeScript. Prefer `.ts` files for new code and add `zod` validation for API request bodies.
4.  **Lint**: Run `npm run lint` (Biome) and `npm test` (Vitest) before finalizing any task.