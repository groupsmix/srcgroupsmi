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

-- Allow any authenticated user to INSERT into pending
CREATE POLICY "Authenticated users can submit groups" ON pending
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

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
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION approve_group(p_pending_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pending RECORD;
BEGIN
    -- Verify caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM users
        WHERE auth_id = auth.uid()
        AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Access denied: admin role required';
    END IF;

    -- Fetch the pending record
    SELECT * INTO v_pending FROM pending WHERE id = p_pending_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pending submission not found: %', p_pending_id;
    END IF;

    -- Check it hasn't already been processed
    IF v_pending.status != 'pending' THEN
        RAISE EXCEPTION 'Submission already processed (status: %)', v_pending.status;
    END IF;

    -- Insert into groups table
    INSERT INTO groups (
        name, link, platform, platform_type, category,
        country, city, language, description, tags,
        search_terms, submitter_uid, submitter_email,
        status, approved_at
    ) VALUES (
        v_pending.name, v_pending.link, v_pending.platform,
        v_pending.platform_type, v_pending.category,
        v_pending.country, v_pending.city, v_pending.language,
        v_pending.description, v_pending.tags,
        v_pending.search_terms, v_pending.submitter_uid,
        v_pending.submitter_email,
        'approved', NOW()
    );

    -- Mark pending as approved
    UPDATE pending
    SET status = 'approved'
    WHERE id = p_pending_id;

    -- Try to increment group count (ignore if function doesn't exist)
    BEGIN
        PERFORM increment_group_count();
    EXCEPTION WHEN undefined_function THEN
        -- ignore, counter function may not exist
    END;
END;
$$;
