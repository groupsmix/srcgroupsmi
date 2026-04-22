-- ═══════════════════════════════════════════════════════════════
-- Migration 030: audit_events scaffold + users.role audit trigger
--
-- Scaffolds a single append-only table (`audit_events`) plus the
-- first production trigger — role changes on `users`. Subsequent
-- triggers (e.g. privileged RPC calls, payout state transitions,
-- withdrawal decisions) will be attached by follow-up migrations.
--
-- Design goals:
--   • Append-only (no UPDATE/DELETE policy for anyone but service role).
--   • Identifies the acting auth.users id (auth.uid()) at the time of
--     the write, not the targeted user. `auth.uid()` returns NULL when
--     the write comes from a server function using the service-role
--     key — that case is recorded as `actor_auth_id IS NULL` and the
--     `source` column should be filled in by the caller or trigger.
--   • Cheap reads for common queries: by `table_name`, `record_id`,
--     and time-range over the last N days.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. audit_events table
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Human-readable event name (e.g. 'users.role.updated').
    event_type    TEXT NOT NULL,

    -- Schema-qualified table and row this event pertains to.
    table_name    TEXT NOT NULL,
    record_id     UUID,

    -- Who triggered the event. auth_id may be NULL when the write
    -- comes from the service-role key (server functions, cron jobs).
    actor_auth_id UUID,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Free-form source label (e.g. 'trigger', 'api/compute-feed').
    source        TEXT,

    -- Previous and next values for audited columns. Triggers typically
    -- write just the columns that changed; APIs may write the full row.
    old_values    JSONB,
    new_values    JSONB,

    -- Additional structured context (request id, IP, reason, etc.).
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created      ON audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_table_record ON audit_events (table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type   ON audit_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor        ON audit_events (actor_auth_id, created_at DESC);

-- ───────────────────────────────────────────────────────────────
-- 2. RLS — append-only, admin-read-only
-- ───────────────────────────────────────────────────────────────
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Admins can read every event. The service-role key bypasses RLS for
-- platform jobs; no authenticated/anon role gets SELECT.
DROP POLICY IF EXISTS audit_events_admin_select ON audit_events;
CREATE POLICY audit_events_admin_select
    ON audit_events
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
              AND users.role = 'admin'
        )
    );

-- No INSERT/UPDATE/DELETE policies for authenticated or anon: only the
-- service-role key (or SECURITY DEFINER trigger functions) can write.
REVOKE INSERT, UPDATE, DELETE ON audit_events FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON audit_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON audit_events FROM authenticated;

-- ───────────────────────────────────────────────────────────────
-- 3. Trigger: log every change to users.role
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_user_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        INSERT INTO audit_events (
            event_type,
            table_name,
            record_id,
            actor_auth_id,
            actor_user_id,
            source,
            old_values,
            new_values
        )
        VALUES (
            'users.role.updated',
            'users',
            NEW.id,
            auth.uid(),
            (SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1),
            'trigger:log_user_role_change',
            jsonb_build_object('role', OLD.role),
            jsonb_build_object('role', NEW.role)
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_user_role_change ON users;
CREATE TRIGGER trigger_log_user_role_change
    AFTER UPDATE OF role ON users
    FOR EACH ROW
    WHEN (OLD.role IS DISTINCT FROM NEW.role)
    EXECUTE FUNCTION log_user_role_change();
