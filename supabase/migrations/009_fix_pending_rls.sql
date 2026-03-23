-- ═══════════════════════════════════════════════════════════════
-- Migration 009: Fix pending table RLS for group submissions
-- Issue: Authenticated users cannot insert into the pending table
-- because RLS policies may be missing or too restrictive.
-- ═══════════════════════════════════════════════════════════════

-- Ensure RLS is enabled on the pending table
ALTER TABLE IF EXISTS pending ENABLE ROW LEVEL SECURITY;

-- Drop existing INSERT policies (if any) to avoid conflicts
DROP POLICY IF EXISTS "Auth users insert pending" ON pending;
DROP POLICY IF EXISTS "Authenticated users can submit groups" ON pending;

-- Allow authenticated users to INSERT into pending (only their own submissions)
CREATE POLICY "Authenticated users can submit groups" ON pending
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND submitter_uid::text IN (
            SELECT id::text FROM users WHERE auth_id = auth.uid()
        )
    );

-- Allow users to read their own pending submissions
DROP POLICY IF EXISTS "Users read own pending" ON pending;
CREATE POLICY "Users read own pending" ON pending
    FOR SELECT USING (
        submitter_uid::text IN (
            SELECT id::text FROM users WHERE auth_id = auth.uid()
        )
    );

-- Allow admins to read all pending submissions
DROP POLICY IF EXISTS "Admins read all pending" ON pending;
CREATE POLICY "Admins read all pending" ON pending
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE auth_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Allow admins to update pending submissions (approve/reject)
DROP POLICY IF EXISTS "Admins update pending" ON pending;
CREATE POLICY "Admins update pending" ON pending
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE auth_id = auth.uid()
            AND role = 'admin'
        )
    );

-- ═══════════════════════════════════════════════════════════════
-- RPC: approve_group — copies a pending submission into groups
-- table, marks pending row as approved, and increments group count.
-- Called by: DB.pending.approve(id) in app.js
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Fix: Rebalance GXP level thresholds in add_gxp function
-- Old thresholds were too easy (Level 2 at 100, Crown at 5000)
-- New thresholds require more sustained engagement
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION add_gxp(p_user_id UUID, p_amount INTEGER)
RETURNS VOID AS $$
DECLARE
    new_gxp INTEGER;
    new_level INTEGER;
    caller_auth_id UUID;
BEGIN
    caller_auth_id := auth.uid();
    IF caller_auth_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND auth_id = caller_auth_id) THEN
        RAISE EXCEPTION 'Unauthorized: you can only modify your own GXP';
    END IF;

    -- Cap amount to prevent abuse (1-100 GXP per call)
    IF p_amount < 1 OR p_amount > 100 THEN
        RAISE EXCEPTION 'Invalid GXP amount: must be between 1 and 100';
    END IF;

    UPDATE users
    SET gxp = COALESCE(gxp, 0) + p_amount
    WHERE id = p_user_id
    RETURNING gxp INTO new_gxp;

    new_level := CASE
        WHEN new_gxp >= 12000 THEN 7
        WHEN new_gxp >= 6000  THEN 6
        WHEN new_gxp >= 3000  THEN 5
        WHEN new_gxp >= 1500  THEN 4
        WHEN new_gxp >= 600   THEN 3
        WHEN new_gxp >= 200   THEN 2
        ELSE 1
    END;

    UPDATE users
    SET level = new_level
    WHERE id = p_user_id AND level IS DISTINCT FROM new_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- RPC: approve_group
-- NOTE: Original definition removed (NEW-MISC-1). The current
-- version lives in migration 026_pending_server_side_validation.sql
-- which adds description padding and additional validation.
-- ═══════════════════════════════════════════════════════════════
