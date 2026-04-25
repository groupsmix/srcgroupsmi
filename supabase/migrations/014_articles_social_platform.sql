-- AUDIT: public
-- =============================================
-- Migration 014: Articles Social Platform
-- Transforms Articles into a full social content platform
-- with AI integration, follows, notifications, gamification
-- =============================================

-- ═══════════════════════════════════════
-- 1. ALTER articles TABLE — add social columns
-- ═══════════════════════════════════════
ALTER TABLE articles ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS reading_time INT DEFAULT 0;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'admin';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'approved';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS moderation_score INT DEFAULT 100;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS moderation_note TEXT DEFAULT '';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS comment_count INT DEFAULT 0;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS share_count INT DEFAULT 0;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_name TEXT DEFAULT '';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_avatar TEXT DEFAULT '';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_bio TEXT DEFAULT '';

-- ═══════════════════════════════════════
-- 2. article_categories TABLE
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS article_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    name_ar TEXT DEFAULT '',
    slug TEXT NOT NULL UNIQUE,
    icon TEXT DEFAULT '',
    color TEXT DEFAULT '#6C63FF',
    article_count INT DEFAULT 0,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default categories
INSERT INTO article_categories (name, name_ar, slug, icon, color, sort_order) VALUES
    ('Technology', 'تكنولوجيا', 'technology', 'monitor', '#6366F1', 1),
    ('Crypto & Web3', 'كريبتو', 'crypto', 'bitcoin', '#F59E0B', 2),
    ('Gaming', 'ألعاب', 'gaming', 'gamepad', '#10B981', 3),
    ('Marketing', 'تسويق', 'marketing', 'megaphone', '#EC4899', 4),
    ('Social Media', 'سوشيال ميديا', 'social-media', 'share', '#8B5CF6', 5),
    ('Business', 'أعمال', 'business', 'briefcase', '#0EA5E9', 6),
    ('Education', 'تعليم', 'education', 'book', '#14B8A6', 7),
    ('Lifestyle', 'أسلوب حياة', 'lifestyle', 'heart', '#F43F5E', 8),
    ('News', 'أخبار', 'news', 'newspaper', '#64748B', 9),
    ('Tutorials', 'دروس', 'tutorials', 'code', '#A855F7', 10)
ON CONFLICT (slug) DO NOTHING;

-- ═══════════════════════════════════════
-- 3. user_follows TABLE
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_follows (
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id);

-- ═══════════════════════════════════════
-- 4. Add follower/following counts to users
-- ═══════════════════════════════════════
ALTER TABLE users ADD COLUMN IF NOT EXISTS follower_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS following_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS article_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS writer_badges TEXT[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS writer_points INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trusted_author BOOLEAN DEFAULT false;

-- ═══════════════════════════════════════
-- 5. article_reading_history TABLE (for AI recommendations)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS article_reading_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT now(),
    read_percentage INT DEFAULT 0,
    UNIQUE(user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_reading_history_user ON article_reading_history(user_id);

-- ═══════════════════════════════════════
-- 6. Indexes for articles social features
-- ═══════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_articles_user_id ON articles(user_id);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_moderation ON articles(moderation_status);
CREATE INDEX IF NOT EXISTS idx_articles_featured ON articles(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_articles_language ON articles(language);
CREATE INDEX IF NOT EXISTS idx_articles_tags ON articles USING GIN(tags);

-- ═══════════════════════════════════════
-- 7. RPC: toggle_follow
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION toggle_follow(p_follower_id UUID, p_following_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    IF p_follower_id = p_following_id THEN
        RETURN jsonb_build_object('error', 'Cannot follow yourself');
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM user_follows
        WHERE follower_id = p_follower_id AND following_id = p_following_id
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM user_follows
        WHERE follower_id = p_follower_id AND following_id = p_following_id;

        UPDATE users SET follower_count = GREATEST(0, follower_count - 1) WHERE id = p_following_id;
        UPDATE users SET following_count = GREATEST(0, following_count - 1) WHERE id = p_follower_id;

        RETURN jsonb_build_object('action', 'unfollowed');
    ELSE
        INSERT INTO user_follows (follower_id, following_id) VALUES (p_follower_id, p_following_id);

        UPDATE users SET follower_count = follower_count + 1 WHERE id = p_following_id;
        UPDATE users SET following_count = following_count + 1 WHERE id = p_follower_id;

        RETURN jsonb_build_object('action', 'followed');
    END IF;
END;
$$;

-- ═══════════════════════════════════════
-- 8. RPC: get_following_articles (feed)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_following_articles(p_user_id UUID, p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS SETOF articles
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT a.*
    FROM articles a
    INNER JOIN user_follows uf ON a.user_id = uf.following_id
    WHERE uf.follower_id = p_user_id
      AND a.status = 'published'
      AND a.moderation_status = 'approved'
    ORDER BY a.published_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ═══════════════════════════════════════
-- 9. RPC: get_trending_articles (7-day engagement)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_trending_articles(p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS SETOF articles
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT a.*
    FROM articles a
    WHERE a.status = 'published'
      AND a.moderation_status = 'approved'
      AND a.published_at >= NOW() - INTERVAL '7 days'
    ORDER BY (COALESCE(a.like_count, 0) * 2 + COALESCE(a.comment_count, 0) * 3 + COALESCE(a.views, 0) * 0.1 + COALESCE(a.share_count, 0) * 5) DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ═══════════════════════════════════════
-- 10. RPC: increment_article_stats
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION increment_article_likes(p_article_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE articles SET like_count = COALESCE(like_count, 0) + 1 WHERE id = p_article_id;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_article_likes(p_article_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE articles SET like_count = GREATEST(0, COALESCE(like_count, 0) - 1) WHERE id = p_article_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_article_comments(p_article_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE articles SET comment_count = COALESCE(comment_count, 0) + 1 WHERE id = p_article_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_article_shares(p_article_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE articles SET share_count = COALESCE(share_count, 0) + 1 WHERE id = p_article_id;
END;
$$;

-- ═══════════════════════════════════════
-- 11. RPC: track_article_read (reading history)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION track_article_read(p_user_id UUID, p_article_id UUID, p_percentage INT DEFAULT 100)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO article_reading_history (user_id, article_id, read_percentage)
    VALUES (p_user_id, p_article_id, p_percentage)
    ON CONFLICT (user_id, article_id)
    DO UPDATE SET read_percentage = GREATEST(article_reading_history.read_percentage, EXCLUDED.read_percentage), read_at = now();
END;
$$;

-- ═══════════════════════════════════════
-- 12. RPC: get_author_stats
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_author_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_articles', COUNT(*),
        'total_views', COALESCE(SUM(views), 0),
        'total_likes', COALESCE(SUM(like_count), 0),
        'total_comments', COALESCE(SUM(comment_count), 0),
        'total_shares', COALESCE(SUM(share_count), 0),
        'avg_reading_time', COALESCE(ROUND(AVG(reading_time)), 0)
    ) INTO v_stats
    FROM articles
    WHERE user_id = p_user_id AND status = 'published';

    RETURN v_stats;
END;
$$;

-- ═══════════════════════════════════════
-- 13. RPC: add_writer_points
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION add_writer_points(p_user_id UUID, p_points INT, p_reason TEXT DEFAULT '')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE users SET writer_points = COALESCE(writer_points, 0) + p_points WHERE id = p_user_id;
    -- Also add to GXP
    PERFORM add_gxp(p_user_id, p_points);
END;
$$;

-- ═══════════════════════════════════════
-- 14. RPC: check_and_award_badges
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION check_and_award_badges(p_user_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_badges TEXT[] := '{}';
    v_article_count INT;
    v_total_likes INT;
    v_total_views INT;
    v_current_badges TEXT[];
BEGIN
    SELECT COALESCE(writer_badges, '{}') INTO v_current_badges FROM users WHERE id = p_user_id;

    SELECT COUNT(*), COALESCE(SUM(like_count), 0), COALESCE(SUM(views), 0)
    INTO v_article_count, v_total_likes, v_total_views
    FROM articles WHERE user_id = p_user_id AND status = 'published';

    -- First Article
    IF v_article_count >= 1 AND NOT ('first_article' = ANY(v_current_badges)) THEN
        v_badges := v_badges || 'first_article';
    END IF;

    -- Prolific Writer (10+ articles)
    IF v_article_count >= 10 AND NOT ('prolific_writer' = ANY(v_current_badges)) THEN
        v_badges := v_badges || 'prolific_writer';
    END IF;

    -- Popular Writer (50+ total likes)
    IF v_total_likes >= 50 AND NOT ('popular_writer' = ANY(v_current_badges)) THEN
        v_badges := v_badges || 'popular_writer';
    END IF;

    -- Viral Author (1000+ total views)
    IF v_total_views >= 1000 AND NOT ('viral_author' = ANY(v_current_badges)) THEN
        v_badges := v_badges || 'viral_author';
    END IF;

    -- Rising Star (5+ articles with avg 10+ likes)
    IF v_article_count >= 5 AND (v_total_likes / GREATEST(v_article_count, 1)) >= 10
       AND NOT ('rising_star' = ANY(v_current_badges)) THEN
        v_badges := v_badges || 'rising_star';
    END IF;

    -- Update badges if new ones earned
    IF array_length(v_badges, 1) > 0 THEN
        UPDATE users SET writer_badges = v_current_badges || v_badges WHERE id = p_user_id;
    END IF;

    RETURN v_badges;
END;
$$;

-- ═══════════════════════════════════════
-- 15. RPC: update_article_category_count
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION update_article_category_counts()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE article_categories ac
    SET article_count = (
        SELECT COUNT(*) FROM articles a
        WHERE a.category = ac.slug AND a.status = 'published' AND a.moderation_status = 'approved'
    );
END;
$$;

-- ═══════════════════════════════════════
-- 16. RLS POLICIES
-- ═══════════════════════════════════════

-- articles: anyone reads published, users manage own
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS articles_select_published ON articles;
CREATE POLICY articles_select_published ON articles FOR SELECT
    USING (status = 'published' AND moderation_status = 'approved');

DROP POLICY IF EXISTS articles_select_own ON articles;
CREATE POLICY articles_select_own ON articles FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS articles_insert_own ON articles;
CREATE POLICY articles_insert_own ON articles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS articles_update_own ON articles;
CREATE POLICY articles_update_own ON articles FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS articles_admin_all ON articles;
CREATE POLICY articles_admin_all ON articles FOR ALL
    USING (
        EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('admin', 'moderator', 'editor'))
    );

-- article_categories: public read
ALTER TABLE article_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_select ON article_categories;
CREATE POLICY categories_select ON article_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS categories_admin ON article_categories;
CREATE POLICY categories_admin ON article_categories FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('admin')));

-- user_follows: users manage own follows
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS follows_select ON user_follows;
CREATE POLICY follows_select ON user_follows FOR SELECT USING (true);

DROP POLICY IF EXISTS follows_insert ON user_follows;
CREATE POLICY follows_insert ON user_follows FOR INSERT
    WITH CHECK (auth.uid() IN (SELECT auth_id FROM users WHERE id = follower_id));

DROP POLICY IF EXISTS follows_delete ON user_follows;
CREATE POLICY follows_delete ON user_follows FOR DELETE
    USING (auth.uid() IN (SELECT auth_id FROM users WHERE id = follower_id));

-- article_reading_history: users manage own
ALTER TABLE article_reading_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reading_history_own ON article_reading_history;
CREATE POLICY reading_history_own ON article_reading_history FOR ALL
    USING (auth.uid() = user_id);

-- ═══════════════════════════════════════
-- 17. TRIGGERS
-- ═══════════════════════════════════════

-- Auto-calculate reading_time on insert/update
CREATE OR REPLACE FUNCTION calculate_reading_time()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    word_count INT;
BEGIN
    -- Strip HTML tags and count words
    word_count := array_length(
        regexp_split_to_array(
            regexp_replace(COALESCE(NEW.content, ''), '<[^>]*>', '', 'g'),
            '\s+'
        ), 1
    );
    NEW.reading_time := GREATEST(1, ROUND(word_count / 200.0));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_article_reading_time ON articles;
CREATE TRIGGER trg_article_reading_time
    BEFORE INSERT OR UPDATE OF content ON articles
    FOR EACH ROW EXECUTE FUNCTION calculate_reading_time();

-- Auto-update author article_count
CREATE OR REPLACE FUNCTION update_author_article_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'published' AND NEW.user_id IS NOT NULL THEN
        UPDATE users SET article_count = COALESCE(article_count, 0) + 1 WHERE auth_id = NEW.user_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status != 'published' AND NEW.status = 'published' AND NEW.user_id IS NOT NULL THEN
            UPDATE users SET article_count = COALESCE(article_count, 0) + 1 WHERE auth_id = NEW.user_id;
        ELSIF OLD.status = 'published' AND NEW.status != 'published' AND NEW.user_id IS NOT NULL THEN
            UPDATE users SET article_count = GREATEST(0, COALESCE(article_count, 0) - 1) WHERE auth_id = NEW.user_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_author_article_count ON articles;
CREATE TRIGGER trg_author_article_count
    AFTER INSERT OR UPDATE OF status ON articles
    FOR EACH ROW EXECUTE FUNCTION update_author_article_count();
