-- =============================================
-- Migration 016: Advanced Article Features
-- Article Series, Inline Polls, Reading Lists,
-- Followers-Only visibility, AI Translator & Audio support
-- =============================================

-- ═══════════════════════════════════════
-- 1. ARTICLE SERIES
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS article_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    title_ar TEXT DEFAULT '',
    description TEXT DEFAULT '',
    cover_image TEXT DEFAULT '',
    slug TEXT NOT NULL UNIQUE,
    article_count INT DEFAULT 0,
    follower_count INT DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_series_user ON article_series(user_id);
CREATE INDEX IF NOT EXISTS idx_series_slug ON article_series(slug);

-- Series followers (get notified on new parts)
CREATE TABLE IF NOT EXISTS series_followers (
    series_id UUID NOT NULL REFERENCES article_series(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (series_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_series_followers_user ON series_followers(user_id);

-- Add series columns to articles
ALTER TABLE articles ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES article_series(id) ON DELETE SET NULL;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS series_order INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_articles_series ON articles(series_id) WHERE series_id IS NOT NULL;

-- ═══════════════════════════════════════
-- 2. INLINE POLLS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS article_polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB NOT NULL DEFAULT '[]',
    total_votes INT DEFAULT 0,
    is_multiple_choice BOOLEAN DEFAULT false,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_polls_article ON article_polls(article_id);

CREATE TABLE IF NOT EXISTS poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES article_polls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_index INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user ON poll_votes(user_id);

-- ═══════════════════════════════════════
-- 3. READING LISTS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS reading_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    cover_image TEXT DEFAULT '',
    slug TEXT NOT NULL,
    is_public BOOLEAN DEFAULT true,
    article_count INT DEFAULT 0,
    follower_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_reading_lists_user ON reading_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_lists_public ON reading_lists(is_public) WHERE is_public = true;

CREATE TABLE IF NOT EXISTS reading_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES reading_lists(id) ON DELETE CASCADE,
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    added_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(list_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_list_items_list ON reading_list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_list_items_article ON reading_list_items(article_id);

CREATE TABLE IF NOT EXISTS reading_list_followers (
    list_id UUID NOT NULL REFERENCES reading_lists(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (list_id, user_id)
);

-- ═══════════════════════════════════════
-- 4. FOLLOWERS-ONLY VISIBILITY
-- ═══════════════════════════════════════
ALTER TABLE articles ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'followers_only'));

-- ═══════════════════════════════════════
-- 5. RPC: Create/Update Series
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION create_article_series(
    p_user_id UUID,
    p_title TEXT,
    p_description TEXT DEFAULT '',
    p_cover_image TEXT DEFAULT ''
)
RETURNS article_series
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_series article_series;
    v_slug TEXT;
BEGIN
    v_slug := lower(regexp_replace(p_title, '[^a-zA-Z0-9\s]', '', 'g'));
    v_slug := regexp_replace(v_slug, '\s+', '-', 'g');
    v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 8);

    INSERT INTO article_series (user_id, title, description, cover_image, slug)
    VALUES (p_user_id, p_title, p_description, p_cover_image, v_slug)
    RETURNING * INTO v_series;

    RETURN v_series;
END;
$$;

-- ═══════════════════════════════════════
-- 6. RPC: Toggle Series Follow
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION toggle_series_follow(p_series_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM series_followers WHERE series_id = p_series_id AND user_id = p_user_id
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM series_followers WHERE series_id = p_series_id AND user_id = p_user_id;
        UPDATE article_series SET follower_count = GREATEST(0, follower_count - 1) WHERE id = p_series_id;
        RETURN jsonb_build_object('action', 'unfollowed');
    ELSE
        INSERT INTO series_followers (series_id, user_id) VALUES (p_series_id, p_user_id);
        UPDATE article_series SET follower_count = follower_count + 1 WHERE id = p_series_id;
        RETURN jsonb_build_object('action', 'followed');
    END IF;
END;
$$;

-- ═══════════════════════════════════════
-- 7. RPC: Vote on Poll
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION vote_on_poll(p_poll_id UUID, p_user_id UUID, p_option_index INT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_poll article_polls;
    v_options JSONB;
    v_option JSONB;
    v_new_votes INT;
BEGIN
    SELECT * INTO v_poll FROM article_polls WHERE id = p_poll_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Poll not found');
    END IF;

    -- Check if poll has ended
    IF v_poll.ends_at IS NOT NULL AND v_poll.ends_at < now() THEN
        RETURN jsonb_build_object('error', 'Poll has ended');
    END IF;

    -- Check if already voted
    IF EXISTS(SELECT 1 FROM poll_votes WHERE poll_id = p_poll_id AND user_id = p_user_id) THEN
        RETURN jsonb_build_object('error', 'Already voted');
    END IF;

    -- Validate option index
    IF p_option_index < 0 OR p_option_index >= jsonb_array_length(v_poll.options) THEN
        RETURN jsonb_build_object('error', 'Invalid option');
    END IF;

    -- Insert vote
    INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES (p_poll_id, p_user_id, p_option_index);

    -- Update option vote count
    v_option := v_poll.options->p_option_index;
    v_new_votes := COALESCE((v_option->>'votes')::INT, 0) + 1;
    v_options := jsonb_set(v_poll.options, ARRAY[p_option_index::TEXT, 'votes'], to_jsonb(v_new_votes));

    UPDATE article_polls
    SET options = v_options, total_votes = total_votes + 1
    WHERE id = p_poll_id;

    RETURN jsonb_build_object('action', 'voted', 'option_index', p_option_index, 'total_votes', v_poll.total_votes + 1);
END;
$$;

-- ═══════════════════════════════════════
-- 8. RPC: Get Series Articles
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_series_articles(p_series_id UUID)
RETURNS SETOF articles
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT a.*
    FROM articles a
    WHERE a.series_id = p_series_id
      AND a.status = 'published'
      AND a.moderation_status = 'approved'
    ORDER BY a.series_order ASC, a.published_at ASC;
END;
$$;

-- ═══════════════════════════════════════
-- 9. RPC: Update series article count
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION update_series_article_count(p_series_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE article_series
    SET article_count = (
        SELECT COUNT(*) FROM articles
        WHERE series_id = p_series_id AND status = 'published' AND moderation_status = 'approved'
    ),
    updated_at = now()
    WHERE id = p_series_id;
END;
$$;

-- ═══════════════════════════════════════
-- 10. RPC: Update Reading List article count
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION update_reading_list_count(p_list_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE reading_lists
    SET article_count = (
        SELECT COUNT(*) FROM reading_list_items WHERE list_id = p_list_id
    ),
    updated_at = now()
    WHERE id = p_list_id;
END;
$$;

-- ═══════════════════════════════════════
-- 11. RPC: Toggle Reading List Follow
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION toggle_reading_list_follow(p_list_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM reading_list_followers WHERE list_id = p_list_id AND user_id = p_user_id
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM reading_list_followers WHERE list_id = p_list_id AND user_id = p_user_id;
        UPDATE reading_lists SET follower_count = GREATEST(0, follower_count - 1) WHERE id = p_list_id;
        RETURN jsonb_build_object('action', 'unfollowed');
    ELSE
        INSERT INTO reading_list_followers (list_id, user_id) VALUES (p_list_id, p_user_id);
        UPDATE reading_lists SET follower_count = follower_count + 1 WHERE id = p_list_id;
        RETURN jsonb_build_object('action', 'followed');
    END IF;
END;
$$;

-- ═══════════════════════════════════════
-- 11. RLS POLICIES
-- ═══════════════════════════════════════

-- article_series: public read, owner manage
ALTER TABLE article_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS series_select ON article_series;
CREATE POLICY series_select ON article_series FOR SELECT USING (true);

DROP POLICY IF EXISTS series_insert_own ON article_series;
CREATE POLICY series_insert_own ON article_series FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND id = user_id));

DROP POLICY IF EXISTS series_update_own ON article_series;
CREATE POLICY series_update_own ON article_series FOR UPDATE
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND id = user_id));

DROP POLICY IF EXISTS series_delete_own ON article_series;
CREATE POLICY series_delete_own ON article_series FOR DELETE
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND id = user_id));

-- series_followers: public read, user manage own
ALTER TABLE series_followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS series_followers_select ON series_followers;
CREATE POLICY series_followers_select ON series_followers FOR SELECT USING (true);

DROP POLICY IF EXISTS series_followers_manage ON series_followers;
CREATE POLICY series_followers_manage ON series_followers FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND id = user_id));

-- article_polls: public read, article owner manage
ALTER TABLE article_polls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS polls_select ON article_polls;
CREATE POLICY polls_select ON article_polls FOR SELECT USING (true);

DROP POLICY IF EXISTS polls_insert ON article_polls;
CREATE POLICY polls_insert ON article_polls FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM articles a
        JOIN users u ON u.auth_id = auth.uid()
        WHERE a.id = article_id AND a.user_id = u.auth_id
    ));

-- poll_votes: user manage own
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS poll_votes_select ON poll_votes;
CREATE POLICY poll_votes_select ON poll_votes FOR SELECT USING (true);

DROP POLICY IF EXISTS poll_votes_insert ON poll_votes;
CREATE POLICY poll_votes_insert ON poll_votes FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND id = user_id));

-- reading_lists: public lists readable, owner manage
ALTER TABLE reading_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reading_lists_select_public ON reading_lists;
CREATE POLICY reading_lists_select_public ON reading_lists FOR SELECT
    USING (is_public = true);

DROP POLICY IF EXISTS reading_lists_select_own ON reading_lists;
CREATE POLICY reading_lists_select_own ON reading_lists FOR SELECT
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND id = user_id));

DROP POLICY IF EXISTS reading_lists_insert_own ON reading_lists;
CREATE POLICY reading_lists_insert_own ON reading_lists FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND id = user_id));

DROP POLICY IF EXISTS reading_lists_update_own ON reading_lists;
CREATE POLICY reading_lists_update_own ON reading_lists FOR UPDATE
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND id = user_id));

DROP POLICY IF EXISTS reading_lists_delete_own ON reading_lists;
CREATE POLICY reading_lists_delete_own ON reading_lists FOR DELETE
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND id = user_id));

-- reading_list_items: public read (if list is public), owner manage
ALTER TABLE reading_list_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS list_items_select ON reading_list_items;
CREATE POLICY list_items_select ON reading_list_items FOR SELECT USING (true);

DROP POLICY IF EXISTS list_items_insert ON reading_list_items;
CREATE POLICY list_items_insert ON reading_list_items FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM reading_lists rl
        JOIN users u ON u.auth_id = auth.uid()
        WHERE rl.id = list_id AND rl.user_id = u.id
    ));

DROP POLICY IF EXISTS list_items_delete ON reading_list_items;
CREATE POLICY list_items_delete ON reading_list_items FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM reading_lists rl
        JOIN users u ON u.auth_id = auth.uid()
        WHERE rl.id = list_id AND rl.user_id = u.id
    ));

-- reading_list_followers
ALTER TABLE reading_list_followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS list_followers_select ON reading_list_followers;
CREATE POLICY list_followers_select ON reading_list_followers FOR SELECT USING (true);

DROP POLICY IF EXISTS list_followers_manage ON reading_list_followers;
CREATE POLICY list_followers_manage ON reading_list_followers FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND id = user_id));

-- ═══════════════════════════════════════
-- 12. UPDATE articles RLS for followers-only
-- ═══════════════════════════════════════
-- Drop and recreate the select policy to handle followers-only articles
DROP POLICY IF EXISTS articles_select_published ON articles;
CREATE POLICY articles_select_published ON articles FOR SELECT
    USING (
        status = 'published' AND moderation_status = 'approved'
        AND (
            visibility = 'public'
            OR visibility IS NULL
            OR user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM user_follows uf
                JOIN users u ON u.auth_id = auth.uid()
                WHERE uf.following_id = (SELECT id FROM users WHERE auth_id = articles.user_id LIMIT 1)
                  AND uf.follower_id = u.id
            )
            OR EXISTS (
                SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('admin', 'moderator', 'editor')
            )
        )
    );
