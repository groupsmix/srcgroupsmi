-- ═══════════════════════════════════════════════════════════════
-- Migration 008: Security Fixes from Audit Report
-- Fixes: Issue #6 (Comments RLS spoofing), Issue #7 (handle_user_interaction auth),
--         Issue #8 (report_comment auth + duplicate prevention)
-- ═══════════════════════════════════════════════════════════════

-- ─── Issue #6: Fix Comments INSERT RLS — enforce user_id ownership ───
-- The old policy only checks auth.uid() IS NOT NULL, allowing any
-- authenticated user to insert comments with a different user_id
-- (identity spoofing).
DROP POLICY IF EXISTS "Auth users insert comments" ON comments;

CREATE POLICY "Auth users insert own comments" ON comments
    FOR INSERT WITH CHECK (
        auth.uid()::text IN (
            SELECT auth_id::text FROM users WHERE id = comments.user_id
        )
    );

-- ─── Issue #7: Fix handle_user_interaction RPC — add auth check ───
-- The old function accepts any p_user_id without verifying ownership,
-- allowing any authenticated user to like/dislike/save on behalf of others.
CREATE OR REPLACE FUNCTION handle_user_interaction(
    p_user_id UUID,
    p_content_id TEXT,
    p_content_type TEXT,
    p_action TEXT
) RETURNS JSONB AS $$
DECLARE
    existing_id UUID;
    result JSONB;
BEGIN
    -- SECURITY: Verify the caller owns this user_id
    IF NOT EXISTS (
        SELECT 1 FROM users WHERE id = p_user_id AND auth_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Unauthorized: user_id does not match authenticated user';
    END IF;

    -- Check if interaction exists
    SELECT id INTO existing_id
    FROM user_interactions
    WHERE user_id = p_user_id
      AND content_id = p_content_id
      AND content_type = p_content_type
      AND action = p_action;

    IF existing_id IS NOT NULL THEN
        -- Remove existing interaction (toggle off)
        DELETE FROM user_interactions WHERE id = existing_id;
        result := jsonb_build_object('action', 'removed', 'type', p_action);
    ELSE
        -- If liking, remove existing dislike and vice versa
        IF p_action = 'like' THEN
            DELETE FROM user_interactions
            WHERE user_id = p_user_id AND content_id = p_content_id
              AND content_type = p_content_type AND action = 'dislike';
        ELSIF p_action = 'dislike' THEN
            DELETE FROM user_interactions
            WHERE user_id = p_user_id AND content_id = p_content_id
              AND content_type = p_content_type AND action = 'like';
        END IF;

        -- Insert new interaction
        INSERT INTO user_interactions (user_id, content_id, content_type, action)
        VALUES (p_user_id, p_content_id, p_content_type, p_action);
        result := jsonb_build_object('action', 'added', 'type', p_action);
    END IF;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Issue #8: Fix report_comment RPC — add auth + duplicate prevention ───
-- The old function has no auth check (anonymous can call it) and no
-- duplicate prevention (same user can report same comment multiple times,
-- hiding any comment with just 3 calls).

-- Create tracking table for comment reports
CREATE TABLE IF NOT EXISTS comment_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reporter_auth_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (comment_id, reporter_auth_id)
);

-- Enable RLS on comment_reports
ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;

-- Users can only see their own reports
CREATE POLICY "Users read own reports" ON comment_reports
    FOR SELECT USING (reporter_auth_id = auth.uid());

-- Users can insert their own reports
CREATE POLICY "Users insert own reports" ON comment_reports
    FOR INSERT WITH CHECK (reporter_auth_id = auth.uid());

-- Replace the vulnerable report_comment function
CREATE OR REPLACE FUNCTION report_comment(p_comment_id UUID) RETURNS VOID AS $$
BEGIN
    -- Require authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required to report comments';
    END IF;

    -- Prevent duplicate reports from same user
    IF EXISTS (
        SELECT 1 FROM comment_reports
        WHERE comment_id = p_comment_id AND reporter_auth_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'You have already reported this comment';
    END IF;

    -- Record the report
    INSERT INTO comment_reports (comment_id, reporter_auth_id)
    VALUES (p_comment_id, auth.uid());

    -- Update comment report count
    UPDATE comments
    SET report_count = report_count + 1,
        reported = CASE WHEN report_count + 1 >= 3 THEN true ELSE reported END
    WHERE id = p_comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
