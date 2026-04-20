-- ═══════════════════════════════════════════════════════════════
-- Migration 029: Lock down coin minting + contact form persistence
--
-- 1. credit_coins() was SECURITY DEFINER with NO caller check and
--    default PUBLIC EXECUTE → any authenticated user could call it
--    from the browser and mint arbitrary coins. Revoke EXECUTE from
--    anon/authenticated/public so only the service-role key (server
--    functions, internal trigger chains) and internal SECURITY
--    DEFINER callers can invoke it.
--
-- 2. Replace the client-side "admin rejects withdrawal → refund"
--    flow in fuel-community.js (two separate client RPC calls) with
--    an atomic server-side RPC that verifies the caller is admin.
--
-- 3. Add contact_submissions table so POSTs to /api/contact-notify
--    are never silently dropped when Resend is unconfigured.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. Lock down credit_coins / debit_coins direct RPC access
-- ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER functions are still callable by internal triggers
-- and by the service-role key (which bypasses role-level EXECUTE
-- checks via PostgREST's authenticator). They are no longer callable
-- from the browser with an anon/authenticated JWT.
REVOKE EXECUTE ON FUNCTION credit_coins(UUID, INT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION credit_coins(UUID, INT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION credit_coins(UUID, INT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM authenticated;

REVOKE EXECUTE ON FUNCTION debit_coins(UUID, INT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION debit_coins(UUID, INT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION debit_coins(UUID, INT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM authenticated;

-- ───────────────────────────────────────────────────────────────
-- 2. Atomic reject-withdrawal RPC (replaces client-side 2-step flow)
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reject_withdrawal(
    p_request_id UUID,
    p_admin_note TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_request withdrawal_requests;
    v_admin_id UUID;
BEGIN
    -- Verify caller is admin
    SELECT id INTO v_admin_id
    FROM users
    WHERE auth_id = auth.uid() AND role = 'admin'
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: only admins can reject withdrawals';
    END IF;

    -- Lock the row to prevent concurrent double-reject / double-refund
    SELECT * INTO v_request
    FROM withdrawal_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Withdrawal request % not found', p_request_id;
    END IF;

    IF v_request.status <> 'pending' THEN
        RAISE EXCEPTION 'Withdrawal % already %', p_request_id, v_request.status;
    END IF;

    -- Update status (trim the note to stop unbounded admin_note blobs)
    UPDATE withdrawal_requests
    SET status = 'rejected',
        admin_note = LEFT(COALESCE(p_admin_note, ''), 500),
        processed_at = now(),
        processed_by = v_admin_id
    WHERE id = p_request_id;

    -- Refund coins. credit_coins() is SECURITY DEFINER so the REVOKE
    -- above does NOT block this internal PERFORM — internal callers
    -- with EXECUTE on this wrapper inherit access through the
    -- definer chain.
    PERFORM credit_coins(
        v_request.user_id,
        v_request.coins_amount,
        'refund',
        'Withdrawal rejected: ' || LEFT(COALESCE(p_admin_note, ''), 200),
        p_request_id::TEXT,
        'withdrawal',
        '{}'::JSONB,
        'earned'
    );
END;
$$;

-- Only admins need to call this; PostgREST still enforces EXECUTE
-- in addition to the explicit role check inside the function.
REVOKE EXECUTE ON FUNCTION reject_withdrawal(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reject_withdrawal(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION reject_withdrawal(UUID, TEXT) TO authenticated;

-- ───────────────────────────────────────────────────────────────
-- 3. contact_submissions table (never drop a message silently)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT DEFAULT '',
    message TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    email_sent BOOLEAN NOT NULL DEFAULT false,
    email_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_created ON contact_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_email_sent ON contact_submissions (email_sent);

ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent) and recreate
DROP POLICY IF EXISTS "Admins read contact submissions" ON contact_submissions;
CREATE POLICY "Admins read contact submissions" ON contact_submissions
    FOR SELECT USING (
        (SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin'
    );

-- No INSERT policy for anon/authenticated — only the service-role
-- key (used by the /api/contact-notify function) can insert.
