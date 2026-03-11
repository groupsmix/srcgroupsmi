-- ============================================================
-- RBAC: Role-Based Access Control System
-- ============================================================
-- Roles: admin (full access), moderator (groups & comments),
--        editor (articles), user (default)
-- ============================================================

-- 1. Add role column if not exists (safe idempotent migration)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
    END IF;
END $$;

-- 2. Add CHECK constraint for valid roles
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'users' AND constraint_name = 'users_role_check'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_role_check
            CHECK (role IN ('admin', 'moderator', 'editor', 'user'));
    END IF;
END $$;

-- 3. Index on role for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- ============================================================
-- RLS POLICIES: Prevent self-role-change, admin-only role updates
-- ============================================================

-- Drop existing update policy if any (to recreate with role protection)
-- NOTE: Run these only if your existing policies don't already cover role.
-- The key rule: only admins can update the 'role' column.

-- Policy: Users can update their OWN profile but NOT the role field.
-- This is enforced by checking that the 'role' value doesn't change
-- unless the requester is an admin.
CREATE OR REPLACE FUNCTION check_role_update()
RETURNS TRIGGER AS $$
BEGIN
    -- If role is being changed, verify the requester is an admin
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        -- Check if the current authenticated user is an admin
        IF NOT EXISTS (
            SELECT 1 FROM users
            WHERE auth_id = auth.uid()
            AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Only admins can change user roles';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS trigger_check_role_update ON users;
CREATE TRIGGER trigger_check_role_update
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION check_role_update();

-- ============================================================
-- RPC: Admin-only function to update user role (extra safety)
-- ============================================================
CREATE OR REPLACE FUNCTION update_user_role(p_user_id UUID, p_new_role TEXT)
RETURNS VOID AS $$
BEGIN
    -- Validate role value
    IF p_new_role NOT IN ('admin', 'moderator', 'editor', 'user') THEN
        RAISE EXCEPTION 'Invalid role: %', p_new_role;
    END IF;

    -- Verify caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM users
        WHERE auth_id = auth.uid()
        AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: only admins can change roles';
    END IF;

    -- Prevent admin from demoting themselves (safety)
    IF EXISTS (
        SELECT 1 FROM users
        WHERE id = p_user_id
        AND auth_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Cannot change your own role';
    END IF;

    -- Update the role
    UPDATE users SET role = p_new_role WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
