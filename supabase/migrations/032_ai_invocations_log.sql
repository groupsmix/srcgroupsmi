-- ═══════════════════════════════════════════════════════════════
-- Migration 032: ai_invocations — per-call abuse-investigation log
--
-- Epic E-5 / F-004: record the *shape* of every AI tool call so that
-- operators can investigate abuse, prompt-injection, or leaked-prompt
-- incidents without storing the raw prompt or response text.
--
-- Design goals:
--   • Append-only. No UPDATE/DELETE policy for anon or authenticated;
--     only the service-role key (or SECURITY DEFINER helpers) write.
--   • Store SHA-256 hashes of the prompt and response — not the raw
--     text. Hashes let us cluster repeat offenders and correlate with
--     third-party reports ("we saw this exact prompt elsewhere")
--     without creating a PII liability.
--   • Identify the acting user via auth.users id (mirrors the
--     convention used by audit_events.actor_auth_id). NULL is allowed
--     because some AI endpoints (e.g. the public chatbot) may relax
--     auth in future; the row is still useful as an abuse signal
--     keyed by IP and tool.
--   • Cheap reads for common investigative queries: by user, by tool,
--     and by time window.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. ai_invocations table
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_invocations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- auth.users.id of the caller. NULL if the endpoint allows
    -- anonymous calls (e.g. during a future migration). Mirrors
    -- audit_events.actor_auth_id so the join convention is the
    -- same across audit surfaces.
    user_auth_id    UUID,

    -- Free-form tool identifier (e.g. 'scam-detector',
    -- 'name-generator', 'chat', 'article-ai:article-seo').
    tool            TEXT NOT NULL,

    -- Optional response language tag ('en', 'ar', 'fr', ...). Stored
    -- separately from metadata so investigations can filter on it
    -- without a JSONB scan.
    lang            TEXT,

    -- SHA-256 of the raw prompt text, hex-encoded (64 chars). Also
    -- the response body. Hashes are deterministic so operators can
    -- cluster identical payloads across users / tools.
    prompt_hash     TEXT NOT NULL,
    response_hash   TEXT,

    -- Lengths in characters. Useful to spot anomalously long prompts
    -- (potential injection attempts) without inspecting the content.
    prompt_length   INT  NOT NULL DEFAULT 0,
    response_length INT  NOT NULL DEFAULT 0,

    -- Terminal outcome: 'ok', 'quota_exceeded', 'upstream_error',
    -- 'blocked', etc. Free-form to stay forward compatible.
    status          TEXT NOT NULL DEFAULT 'ok',

    -- Weighted quota cost that this call consumed (matches the
    -- per-tool weight used by functions/api/_shared/ai-quota.js).
    quota_weight    INT  NOT NULL DEFAULT 1,

    -- Client IP as reported by Cloudflare's CF-Connecting-IP header.
    -- Kept alongside user_auth_id so that unauthenticated abuse is
    -- still attributable to a network source.
    ip              TEXT,

    -- Additional structured context (request id, user agent family,
    -- routing primary, etc.). Default to empty object so JSONB
    -- operators never hit NULL.
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_invocations_created_at
    ON ai_invocations (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_invocations_user_created
    ON ai_invocations (user_auth_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_invocations_tool_created
    ON ai_invocations (tool, created_at DESC);

-- Equality lookups on the hash columns are the primary "cluster this
-- prompt" query used by investigators. Btree is sufficient here —
-- prompt_hash is a short fixed-width hex string.
CREATE INDEX IF NOT EXISTS idx_ai_invocations_prompt_hash
    ON ai_invocations (prompt_hash);

CREATE INDEX IF NOT EXISTS idx_ai_invocations_response_hash
    ON ai_invocations (response_hash)
    WHERE response_hash IS NOT NULL;

-- ───────────────────────────────────────────────────────────────
-- 2. RLS — append-only, admin-read-only
-- ───────────────────────────────────────────────────────────────
ALTER TABLE ai_invocations ENABLE ROW LEVEL SECURITY;

-- Admins can read every row. Regular users get no SELECT — prompt
-- hashes plus IPs are sensitive enough that this should be treated
-- like the audit_events table.
DROP POLICY IF EXISTS ai_invocations_admin_select ON ai_invocations;
CREATE POLICY ai_invocations_admin_select
    ON ai_invocations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
              AND users.role = 'admin'
        )
    );

-- Only the service-role key (bypasses RLS) and SECURITY DEFINER
-- helpers may write. Explicitly revoke any grant PUBLIC/anon/auth
-- might otherwise inherit.
REVOKE INSERT, UPDATE, DELETE ON ai_invocations FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON ai_invocations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON ai_invocations FROM authenticated;
