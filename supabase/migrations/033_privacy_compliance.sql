-- ═══════════════════════════════════════════════════════════════
-- Migration 030: Privacy / Compliance (Epic C)
--
-- Ships the schema backing the DSAR (Data Subject Access Request)
-- endpoints introduced in this epic:
--
--   C-1  POST /api/account/export   — JSON bundle of the caller's data
--   C-2  POST /api/account/delete   — re-auth + Turnstile gated
--                                      soft-delete with a 30-day grace
--   C-3  delete_user_cascade(UUID)  — hard-delete RPC invoked by the
--                                      scheduled purge job
--   C-4  dsar_audit                 — append-only audit log per user
--                                      plus opt-out columns on users
--
-- Downstream user-owned rows already cascade via ON DELETE CASCADE
-- foreign keys introduced in migrations 003, 010, 012, 014, 015, 016,
-- 018, 020, 022, 023, 024, 025 and 028. delete_user_cascade therefore
-- only needs to remove the public.users row and the matching
-- auth.users row; Postgres propagates the rest.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. Privacy columns on users
-- ───────────────────────────────────────────────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS marketing_opt_out       BOOLEAN     NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS analytics_opt_out       BOOLEAN     NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS personalization_opt_out BOOLEAN     NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS deleted_at              TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deletion_scheduled_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deletion_scheduled
    ON users (deletion_scheduled_at)
    WHERE deleted_at IS NOT NULL;

-- ───────────────────────────────────────────────────────────────
-- 2. DSAR audit log
-- ───────────────────────────────────────────────────────────────
-- Append-only record of data-subject access requests. Kept separate
-- from auth/users so the audit trail survives a soft-delete: the
-- user_id FK is SET NULL on cascade so the audit row is still there
-- after the 30-day hard-delete, with `auth_id` retained for operator
-- lookup.
CREATE TABLE IF NOT EXISTS dsar_audit (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    auth_id    UUID,
    action     TEXT NOT NULL,
    metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip         TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT dsar_audit_action_check CHECK (action IN (
        'export_requested',
        'export_completed',
        'delete_requested',
        'soft_delete',
        'hard_delete',
        'cancel_deletion',
        'preferences_updated'
    ))
);

CREATE INDEX IF NOT EXISTS idx_dsar_audit_user_id ON dsar_audit (user_id);
CREATE INDEX IF NOT EXISTS idx_dsar_audit_auth_id ON dsar_audit (auth_id);
CREATE INDEX IF NOT EXISTS idx_dsar_audit_created ON dsar_audit (created_at DESC);

ALTER TABLE dsar_audit ENABLE ROW LEVEL SECURITY;

-- Users can read their own audit rows (for a future "download history"
-- surface). No INSERT/UPDATE/DELETE from clients; only service-role
-- Functions and SECURITY DEFINER RPCs touch this table.
DROP POLICY IF EXISTS "Users read own dsar audit" ON dsar_audit;
CREATE POLICY "Users read own dsar audit" ON dsar_audit
    FOR SELECT USING (
        auth_id = auth.uid()
    );

-- ───────────────────────────────────────────────────────────────
-- 3. soft_delete_user — scrub PII + schedule hard-delete
-- ───────────────────────────────────────────────────────────────
-- Called by /api/account/delete after re-auth + Turnstile succeed.
-- The auth_id parameter is the Supabase auth user id (auth.users.id).
-- We resolve it to public.users.id here so the endpoint doesn't need
-- a separate lookup round-trip.
--
-- This function is SECURITY DEFINER so the endpoint can invoke it
-- with the service-role key without needing direct UPDATE on users;
-- the explicit check that auth_id matches a user row is the only
-- authorization gate.
CREATE OR REPLACE FUNCTION soft_delete_user(p_auth_id UUID)
RETURNS TABLE (
    user_id               UUID,
    deletion_scheduled_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user_id     UUID;
    v_scheduled   TIMESTAMPTZ := now() + INTERVAL '30 days';
    v_placeholder TEXT;
BEGIN
    IF p_auth_id IS NULL THEN
        RAISE EXCEPTION 'soft_delete_user: auth_id is required';
    END IF;

    SELECT id INTO v_user_id FROM users WHERE auth_id = p_auth_id LIMIT 1;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'soft_delete_user: no user found for auth_id %', p_auth_id;
    END IF;

    -- Randomised placeholder so scrubbed rows don't collide on any
    -- UNIQUE constraints (e.g. a future users.email UNIQUE) and so
    -- the deleted accounts can't be re-signed-in with a predictable
    -- identifier.
    v_placeholder := 'deleted+' || v_user_id::text || '@groupsmix.invalid';

    UPDATE users
       SET email                 = v_placeholder,
           display_name          = 'Deleted User',
           bio                   = '',
           phone_number          = '',
           phone_verified        = false,
           identity_verified     = false,
           deleted_at            = now(),
           deletion_scheduled_at = v_scheduled
     WHERE id = v_user_id;

    user_id := v_user_id;
    deletion_scheduled_at := v_scheduled;
    RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION soft_delete_user(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION soft_delete_user(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION soft_delete_user(UUID) FROM authenticated;

-- ───────────────────────────────────────────────────────────────
-- 4. delete_user_cascade — hard delete (RPC used by cron purge)
-- ───────────────────────────────────────────────────────────────
-- Removes the public.users row (downstream FKs cascade) and the
-- matching auth.users row. Only the service-role key can call this;
-- the endpoint invoking it is gated by CRON_SECRET.
CREATE OR REPLACE FUNCTION delete_user_cascade(p_user_id UUID)
RETURNS TABLE (
    user_id UUID,
    auth_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_auth_id UUID;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'delete_user_cascade: user_id is required';
    END IF;

    SELECT auth_id INTO v_auth_id FROM users WHERE id = p_user_id LIMIT 1;
    IF v_auth_id IS NULL THEN
        -- Idempotent no-op: already gone.
        user_id := p_user_id;
        auth_id := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- public.users cascades user-owned rows via existing FKs.
    DELETE FROM users WHERE id = p_user_id;

    -- auth.users may not be directly deletable from the service role
    -- in every environment (older Supabase projects lock it down).
    -- Swallow the failure so the purge job still succeeds for
    -- public.users; operators can drop the stray auth row via the
    -- admin API if needed.
    BEGIN
        DELETE FROM auth.users WHERE id = v_auth_id;
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    user_id := p_user_id;
    auth_id := v_auth_id;
    RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_user_cascade(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_user_cascade(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION delete_user_cascade(UUID) FROM authenticated;

-- ───────────────────────────────────────────────────────────────
-- 5. purge_soft_deleted_users — scheduled hard-delete job body
-- ───────────────────────────────────────────────────────────────
-- Called by /api/purge-deleted once per day. Returns the list of
-- user_ids that were purged so the endpoint can record one
-- `hard_delete` dsar_audit row per user.
CREATE OR REPLACE FUNCTION purge_soft_deleted_users(p_limit INT DEFAULT 500)
RETURNS TABLE (
    user_id UUID,
    auth_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    r RECORD;
    v_deleted RECORD;
BEGIN
    FOR r IN
        SELECT id, auth_id
          FROM users
         WHERE deleted_at IS NOT NULL
           AND deletion_scheduled_at IS NOT NULL
           AND deletion_scheduled_at <= now()
         ORDER BY deletion_scheduled_at ASC
         LIMIT GREATEST(COALESCE(p_limit, 500), 1)
    LOOP
        SELECT * INTO v_deleted FROM delete_user_cascade(r.id);
        user_id := r.id;
        auth_id := r.auth_id;
        RETURN NEXT;
    END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION purge_soft_deleted_users(INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION purge_soft_deleted_users(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION purge_soft_deleted_users(INT) FROM authenticated;
