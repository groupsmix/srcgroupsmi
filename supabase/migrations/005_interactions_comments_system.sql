-- ═══════════════════════════════════════════════════════════════
-- Migration 005: Universal Interaction System + Comments System
-- ═══════════════════════════════════════════════════════════════

-- 1. user_interactions table
-- Supports like, dislike, save across all content types
CREATE TABLE IF NOT EXISTS user_interactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    content_id TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('group', 'article', 'store', 'marketplace')),
    action TEXT NOT NULL CHECK (action IN ('like', 'dislike', 'save')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, content_id, content_type, action)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_interactions_user ON user_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_content ON user_interactions(content_id, content_type);
CREATE INDEX IF NOT EXISTS idx_interactions_action ON user_interactions(action);

-- Enable RLS
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own interactions
CREATE POLICY "Users read own interactions" ON user_interactions
    FOR SELECT USING (auth.uid()::text IN (
        SELECT auth_id::text FROM users WHERE id = user_interactions.user_id
    ));

-- Users can insert their own interactions
CREATE POLICY "Users insert own interactions" ON user_interactions
    FOR INSERT WITH CHECK (auth.uid()::text IN (
        SELECT auth_id::text FROM users WHERE id = user_interactions.user_id
    ));

-- Users can delete their own interactions
CREATE POLICY "Users delete own interactions" ON user_interactions
    FOR DELETE USING (auth.uid()::text IN (
        SELECT auth_id::text FROM users WHERE id = user_interactions.user_id
    ));

-- 2. RPC: handle_user_interaction (toggle)
-- Insert if not exists, delete if exists (toggle behavior)
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
        -- If toggling like, also ensure dislike is removed and vice versa
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

-- 3. RPC: get_interaction_counts
-- Returns like/dislike/save counts for a content item
CREATE OR REPLACE FUNCTION get_interaction_counts(
    p_content_id TEXT,
    p_content_type TEXT
) RETURNS JSONB AS $$
DECLARE
    like_count INT;
    dislike_count INT;
    save_count INT;
BEGIN
    SELECT COUNT(*) INTO like_count FROM user_interactions
    WHERE content_id = p_content_id AND content_type = p_content_type AND action = 'like';

    SELECT COUNT(*) INTO dislike_count FROM user_interactions
    WHERE content_id = p_content_id AND content_type = p_content_type AND action = 'dislike';

    SELECT COUNT(*) INTO save_count FROM user_interactions
    WHERE content_id = p_content_id AND content_type = p_content_type AND action = 'save';

    RETURN jsonb_build_object('likes', like_count, 'dislikes', dislike_count, 'saves', save_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: get_user_interactions
-- Returns all interactions for a user on specific content items
CREATE OR REPLACE FUNCTION get_user_interactions(
    p_user_id UUID,
    p_content_ids TEXT[],
    p_content_type TEXT
) RETURNS JSONB AS $$
DECLARE
    result JSONB := '{}'::JSONB;
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT content_id, action FROM user_interactions
        WHERE user_id = p_user_id
          AND content_id = ANY(p_content_ids)
          AND content_type = p_content_type
    LOOP
        IF result ? rec.content_id THEN
            result := jsonb_set(result, ARRAY[rec.content_id],
                (result->rec.content_id) || jsonb_build_array(rec.action));
        ELSE
            result := jsonb_set(result, ARRAY[rec.content_id], jsonb_build_array(rec.action));
        END IF;
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: get_user_saved_items
-- Returns all saved items for a user, optionally filtered by content_type
CREATE OR REPLACE FUNCTION get_user_saved_items(
    p_user_id UUID,
    p_content_type TEXT DEFAULT NULL
) RETURNS SETOF user_interactions AS $$
BEGIN
    IF p_content_type IS NOT NULL THEN
        RETURN QUERY SELECT * FROM user_interactions
        WHERE user_id = p_user_id AND action = 'save' AND content_type = p_content_type
        ORDER BY created_at DESC;
    ELSE
        RETURN QUERY SELECT * FROM user_interactions
        WHERE user_id = p_user_id AND action = 'save'
        ORDER BY created_at DESC;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 6. comments table
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    content_id TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('group', 'article', 'store', 'marketplace')),
    display_name TEXT NOT NULL DEFAULT 'User',
    photo_url TEXT,
    body TEXT NOT NULL CHECK (char_length(body) >= 1 AND char_length(body) <= 1000),
    reported BOOLEAN DEFAULT false,
    report_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comments_content ON comments(content_id, content_type);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);

-- Enable RLS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read non-reported comments
CREATE POLICY "Anyone reads comments" ON comments
    FOR SELECT USING (true);

-- Authenticated users can insert
CREATE POLICY "Auth users insert comments" ON comments
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Users can delete their own comments
CREATE POLICY "Users delete own comments" ON comments
    FOR DELETE USING (auth.uid()::text IN (
        SELECT auth_id::text FROM users WHERE id = comments.user_id
    ));

-- 7. RPC: get_comment_count
CREATE OR REPLACE FUNCTION get_comment_count(
    p_content_id TEXT,
    p_content_type TEXT
) RETURNS INT AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM comments
            WHERE content_id = p_content_id AND content_type = p_content_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RPC: report_comment
CREATE OR REPLACE FUNCTION report_comment(p_comment_id UUID) RETURNS VOID AS $$
BEGIN
    UPDATE comments
    SET report_count = report_count + 1,
        reported = CASE WHEN report_count + 1 >= 3 THEN true ELSE reported END
    WHERE id = p_comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
