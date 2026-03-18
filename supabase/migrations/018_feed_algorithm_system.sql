-- =============================================
-- Migration 018: Smart Feed Algorithm System
-- Content Deduplication, Collaborative Filtering,
-- Interest-Based Ranking, Exploration/Exploitation,
-- Session-Aware Rotation, Trending/Velocity Scores
-- =============================================

-- ═══════════════════════════════════════
-- 1. USER INTERESTS (track category/tag preferences from clicks)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_interests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL DEFAULT 'group' CHECK (content_type IN ('group', 'article')),
    category TEXT NOT NULL,
    weight NUMERIC(6,3) DEFAULT 1.000,
    interaction_count INT DEFAULT 1,
    last_interaction_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, content_type, category)
);

CREATE INDEX IF NOT EXISTS idx_user_interests_user ON user_interests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interests_category ON user_interests(category);
CREATE INDEX IF NOT EXISTS idx_user_interests_weight ON user_interests(weight DESC);

ALTER TABLE user_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own interests" ON user_interests
    FOR SELECT USING (
        user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    );
CREATE POLICY "System manages interests" ON user_interests
    FOR ALL USING (true);

-- ═══════════════════════════════════════
-- 2. CONTENT IMPRESSIONS (log what was SHOWN, not just clicked)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS content_impressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'group' CHECK (content_type IN ('group', 'article')),
    impression_count INT DEFAULT 1,
    first_shown_at TIMESTAMPTZ DEFAULT now(),
    last_shown_at TIMESTAMPTZ DEFAULT now(),
    clicked BOOLEAN DEFAULT false,
    clicked_at TIMESTAMPTZ,
    UNIQUE(user_id, content_id, content_type)
);

CREATE INDEX IF NOT EXISTS idx_impressions_user ON content_impressions(user_id);
CREATE INDEX IF NOT EXISTS idx_impressions_content ON content_impressions(content_id, content_type);
CREATE INDEX IF NOT EXISTS idx_impressions_last_shown ON content_impressions(last_shown_at DESC);
CREATE INDEX IF NOT EXISTS idx_impressions_user_type ON content_impressions(user_id, content_type, last_shown_at DESC);

ALTER TABLE content_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own impressions" ON content_impressions
    FOR SELECT USING (
        user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    );
CREATE POLICY "System manages impressions" ON content_impressions
    FOR ALL USING (true);

-- ═══════════════════════════════════════
-- 3. TRENDING SCORES (hourly/nightly computed velocity scores)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS trending_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'group' CHECK (content_type IN ('group', 'article')),
    velocity_score NUMERIC(12,4) DEFAULT 0,
    hourly_views INT DEFAULT 0,
    hourly_clicks INT DEFAULT 0,
    hourly_likes INT DEFAULT 0,
    hourly_joins INT DEFAULT 0,
    hourly_comments INT DEFAULT 0,
    hourly_tips INT DEFAULT 0,
    total_engagement INT DEFAULT 0,
    time_window_hours INT DEFAULT 1,
    computed_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(content_id, content_type)
);

CREATE INDEX IF NOT EXISTS idx_trending_velocity ON trending_scores(velocity_score DESC);
CREATE INDEX IF NOT EXISTS idx_trending_type ON trending_scores(content_type, velocity_score DESC);
CREATE INDEX IF NOT EXISTS idx_trending_computed ON trending_scores(computed_at);

ALTER TABLE trending_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads trending" ON trending_scores
    FOR SELECT USING (true);
CREATE POLICY "System manages trending" ON trending_scores
    FOR ALL USING (true);

-- ═══════════════════════════════════════
-- 4. USER SESSIONS (for session-aware rotation)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_feed_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL,
    content_ids_shown TEXT[] DEFAULT '{}',
    content_count INT DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT now(),
    last_activity_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_feed_sessions_user ON user_feed_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_sessions_token ON user_feed_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_feed_sessions_activity ON user_feed_sessions(user_id, last_activity_at DESC);

ALTER TABLE user_feed_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own sessions" ON user_feed_sessions
    FOR SELECT USING (
        user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    );
CREATE POLICY "System manages sessions" ON user_feed_sessions
    FOR ALL USING (true);

-- ═══════════════════════════════════════
-- 5. COLLABORATIVE FILTERING CACHE
-- (pre-computed co-occurrence: "users who joined A also joined B")
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS collaborative_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'group' CHECK (content_type IN ('group', 'article')),
    co_occurrence_count INT DEFAULT 0,
    score NUMERIC(10,4) DEFAULT 0,
    computed_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(source_id, target_id, content_type)
);

CREATE INDEX IF NOT EXISTS idx_collab_source ON collaborative_scores(source_id, content_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_collab_target ON collaborative_scores(target_id, content_type);
CREATE INDEX IF NOT EXISTS idx_collab_score ON collaborative_scores(score DESC);

ALTER TABLE collaborative_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads collaborative scores" ON collaborative_scores
    FOR SELECT USING (true);
CREATE POLICY "System manages collaborative scores" ON collaborative_scores
    FOR ALL USING (true);

-- ═══════════════════════════════════════
-- 6. RPC: Track user interest from interaction
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION track_user_interest(
    p_user_id UUID,
    p_content_type TEXT,
    p_category TEXT,
    p_weight_boost NUMERIC DEFAULT 1.0
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO user_interests (user_id, content_type, category, weight, interaction_count, last_interaction_at)
    VALUES (p_user_id, p_content_type, p_category, p_weight_boost, 1, now())
    ON CONFLICT (user_id, content_type, category)
    DO UPDATE SET
        weight = LEAST(user_interests.weight + (p_weight_boost * 0.1), 10.0),
        interaction_count = user_interests.interaction_count + 1,
        last_interaction_at = now();
END;
$$;

-- ═══════════════════════════════════════
-- 7. RPC: Record content impression
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION record_content_impression(
    p_user_id UUID,
    p_content_id TEXT,
    p_content_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO content_impressions (user_id, content_id, content_type, impression_count, first_shown_at, last_shown_at)
    VALUES (p_user_id, p_content_id, p_content_type, 1, now(), now())
    ON CONFLICT (user_id, content_id, content_type)
    DO UPDATE SET
        impression_count = content_impressions.impression_count + 1,
        last_shown_at = now();
END;
$$;

-- ═══════════════════════════════════════
-- 8. RPC: Record content impression click
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION record_impression_click(
    p_user_id UUID,
    p_content_id TEXT,
    p_content_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE content_impressions
    SET clicked = true, clicked_at = now()
    WHERE user_id = p_user_id
      AND content_id = p_content_id
      AND content_type = p_content_type;

    -- If no impression existed, create one with click
    IF NOT FOUND THEN
        INSERT INTO content_impressions (user_id, content_id, content_type, clicked, clicked_at)
        VALUES (p_user_id, p_content_id, p_content_type, true, now());
    END IF;
END;
$$;

-- ═══════════════════════════════════════
-- 9. RPC: Batch record impressions (for feed loads)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION record_batch_impressions(
    p_user_id UUID,
    p_content_ids TEXT[],
    p_content_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_id TEXT;
BEGIN
    FOREACH v_id IN ARRAY p_content_ids LOOP
        PERFORM record_content_impression(p_user_id, v_id, p_content_type);
    END LOOP;
END;
$$;

-- ═══════════════════════════════════════
-- 10. RPC: Get seen penalty for content (decay-based)
-- Items viewed recently get suppressed hard,
-- items viewed 30+ days ago can resurface
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_seen_penalty(
    p_user_id UUID,
    p_content_id TEXT,
    p_content_type TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_impression content_impressions;
    v_days_since NUMERIC;
    v_penalty NUMERIC;
BEGIN
    SELECT * INTO v_impression
    FROM content_impressions
    WHERE user_id = p_user_id
      AND content_id = p_content_id
      AND content_type = p_content_type;

    IF NOT FOUND THEN
        RETURN 0; -- never seen, no penalty
    END IF;

    v_days_since := EXTRACT(EPOCH FROM (now() - v_impression.last_shown_at)) / 86400.0;

    -- Decay curve: full penalty (1.0) when just seen, drops to 0 after 30 days
    -- penalty = max(0, 1 - (days_since / 30)) * impression_count_factor
    v_penalty := GREATEST(0, 1.0 - (v_days_since / 30.0));
    v_penalty := v_penalty * LEAST(v_impression.impression_count, 5) / 5.0;

    -- Clicked items get extra penalty (user already engaged)
    IF v_impression.clicked THEN
        v_penalty := v_penalty * 1.5;
    END IF;

    RETURN LEAST(v_penalty, 1.0);
END;
$$;

-- ═══════════════════════════════════════
-- 11. RPC: Compute trending scores for groups
-- Tracks engagement velocity (likes per hour, not total likes)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION compute_trending_scores_groups(p_hours INT DEFAULT 6)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count INT := 0;
    v_since TIMESTAMPTZ := now() - (p_hours || ' hours')::INTERVAL;
BEGIN
    -- Upsert trending scores for all approved groups based on recent engagement
    INSERT INTO trending_scores (content_id, content_type, velocity_score, hourly_views, hourly_clicks, hourly_likes, hourly_joins, total_engagement, time_window_hours, computed_at)
    SELECT
        g.id::TEXT,
        'group',
        -- Velocity = weighted engagement per hour
        ROUND((
            COALESCE(recent_views.cnt, 0) * 0.1 +
            COALESCE(recent_clicks.cnt, 0) * 0.5 +
            COALESCE(recent_likes.cnt, 0) * 2.0 +
            COALESCE(recent_joins.cnt, 0) * 5.0
        ) / GREATEST(p_hours, 1)::NUMERIC, 4),
        COALESCE(recent_views.cnt, 0),
        COALESCE(recent_clicks.cnt, 0),
        COALESCE(recent_likes.cnt, 0),
        COALESCE(recent_joins.cnt, 0),
        COALESCE(recent_views.cnt, 0) + COALESCE(recent_clicks.cnt, 0) + COALESCE(recent_likes.cnt, 0) + COALESCE(recent_joins.cnt, 0),
        p_hours,
        now()
    FROM groups g
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM group_interactions
        WHERE group_id = g.id AND interaction_type = 'view' AND created_at >= v_since
    ) recent_views ON true
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM group_interactions
        WHERE group_id = g.id AND interaction_type = 'click' AND created_at >= v_since
    ) recent_clicks ON true
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM group_interactions
        WHERE group_id = g.id AND interaction_type = 'like' AND created_at >= v_since
    ) recent_likes ON true
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM group_interactions
        WHERE group_id = g.id AND interaction_type = 'join' AND created_at >= v_since
    ) recent_joins ON true
    WHERE g.status = 'approved'
    ON CONFLICT (content_id, content_type)
    DO UPDATE SET
        velocity_score = EXCLUDED.velocity_score,
        hourly_views = EXCLUDED.hourly_views,
        hourly_clicks = EXCLUDED.hourly_clicks,
        hourly_likes = EXCLUDED.hourly_likes,
        hourly_joins = EXCLUDED.hourly_joins,
        total_engagement = EXCLUDED.total_engagement,
        time_window_hours = EXCLUDED.time_window_hours,
        computed_at = now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════
-- 12. RPC: Compute trending scores for articles
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION compute_trending_scores_articles(p_hours INT DEFAULT 6)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count INT := 0;
    v_since TIMESTAMPTZ := now() - (p_hours || ' hours')::INTERVAL;
BEGIN
    INSERT INTO trending_scores (content_id, content_type, velocity_score, hourly_views, hourly_likes, hourly_comments, hourly_tips, total_engagement, time_window_hours, computed_at)
    SELECT
        a.id::TEXT,
        'article',
        ROUND((
            COALESCE(recent_reads.cnt, 0) * 0.2 +
            COALESCE(recent_likes.cnt, 0) * 2.0 +
            COALESCE(recent_comments.cnt, 0) * 3.0 +
            COALESCE(recent_tips.cnt, 0) * 5.0
        ) / GREATEST(p_hours, 1)::NUMERIC, 4),
        COALESCE(recent_reads.cnt, 0),
        COALESCE(recent_likes.cnt, 0),
        COALESCE(recent_comments.cnt, 0),
        COALESCE(recent_tips.cnt, 0),
        COALESCE(recent_reads.cnt, 0) + COALESCE(recent_likes.cnt, 0) + COALESCE(recent_comments.cnt, 0) + COALESCE(recent_tips.cnt, 0),
        p_hours,
        now()
    FROM articles a
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM article_reading_history
        WHERE article_id = a.id AND read_at >= v_since
    ) recent_reads ON true
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM user_interactions
        WHERE content_id = a.id::TEXT AND content_type = 'article' AND action = 'like' AND created_at >= v_since
    ) recent_likes ON true
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM comments
        WHERE content_id = a.id::TEXT AND content_type = 'article' AND created_at >= v_since
    ) recent_comments ON true
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM tips
        WHERE article_id = a.id AND created_at >= v_since
    ) recent_tips ON true
    WHERE a.status = 'published' AND a.moderation_status = 'approved'
    ON CONFLICT (content_id, content_type)
    DO UPDATE SET
        velocity_score = EXCLUDED.velocity_score,
        hourly_views = EXCLUDED.hourly_views,
        hourly_likes = EXCLUDED.hourly_likes,
        hourly_comments = EXCLUDED.hourly_comments,
        hourly_tips = EXCLUDED.hourly_tips,
        total_engagement = EXCLUDED.total_engagement,
        time_window_hours = EXCLUDED.time_window_hours,
        computed_at = now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════
-- 13. RPC: Compute collaborative filtering for groups
-- "Users who joined Group A also joined Group B"
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION compute_collaborative_groups(p_min_co_occurrence INT DEFAULT 2)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count INT := 0;
BEGIN
    -- Clear old scores
    DELETE FROM collaborative_scores WHERE content_type = 'group';

    -- Compute co-occurrence matrix from group_interactions
    INSERT INTO collaborative_scores (source_id, target_id, content_type, co_occurrence_count, score, computed_at)
    SELECT
        gi1.group_id::TEXT,
        gi2.group_id::TEXT,
        'group',
        COUNT(DISTINCT gi1.user_uid),
        -- Score = co-occurrence normalized by sqrt(popularity of both groups)
        ROUND(
            COUNT(DISTINCT gi1.user_uid)::NUMERIC /
            GREATEST(SQRT(
                (SELECT COUNT(DISTINCT user_uid) FROM group_interactions WHERE group_id = gi1.group_id AND interaction_type IN ('click', 'join', 'save')) *
                (SELECT COUNT(DISTINCT user_uid) FROM group_interactions WHERE group_id = gi2.group_id AND interaction_type IN ('click', 'join', 'save'))
            ), 1)::NUMERIC,
        4),
        now()
    FROM group_interactions gi1
    JOIN group_interactions gi2 ON gi1.user_uid = gi2.user_uid
    WHERE gi1.group_id != gi2.group_id
      AND gi1.interaction_type IN ('click', 'join', 'save')
      AND gi2.interaction_type IN ('click', 'join', 'save')
    GROUP BY gi1.group_id, gi2.group_id
    HAVING COUNT(DISTINCT gi1.user_uid) >= p_min_co_occurrence
    ON CONFLICT (source_id, target_id, content_type)
    DO UPDATE SET
        co_occurrence_count = EXCLUDED.co_occurrence_count,
        score = EXCLUDED.score,
        computed_at = now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════
-- 14. RPC: Compute collaborative filtering for articles
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION compute_collaborative_articles(p_min_co_occurrence INT DEFAULT 2)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count INT := 0;
BEGIN
    DELETE FROM collaborative_scores WHERE content_type = 'article';

    INSERT INTO collaborative_scores (source_id, target_id, content_type, co_occurrence_count, score, computed_at)
    SELECT
        arh1.article_id::TEXT,
        arh2.article_id::TEXT,
        'article',
        COUNT(DISTINCT arh1.user_id),
        ROUND(
            COUNT(DISTINCT arh1.user_id)::NUMERIC /
            GREATEST(SQRT(
                (SELECT COUNT(DISTINCT user_id) FROM article_reading_history WHERE article_id = arh1.article_id) *
                (SELECT COUNT(DISTINCT user_id) FROM article_reading_history WHERE article_id = arh2.article_id)
            ), 1)::NUMERIC,
        4),
        now()
    FROM article_reading_history arh1
    JOIN article_reading_history arh2 ON arh1.user_id = arh2.user_id
    WHERE arh1.article_id != arh2.article_id
      AND arh1.read_percentage >= 30
      AND arh2.read_percentage >= 30
    GROUP BY arh1.article_id, arh2.article_id
    HAVING COUNT(DISTINCT arh1.user_id) >= p_min_co_occurrence
    ON CONFLICT (source_id, target_id, content_type)
    DO UPDATE SET
        co_occurrence_count = EXCLUDED.co_occurrence_count,
        score = EXCLUDED.score,
        computed_at = now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════
-- 15. RPC: Start/resume feed session
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION start_feed_session(
    p_user_id UUID,
    p_session_token TEXT
)
RETURNS user_feed_sessions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_session user_feed_sessions;
    v_last_session user_feed_sessions;
    v_gap_hours NUMERIC;
BEGIN
    -- Check for existing active session with this token
    SELECT * INTO v_session
    FROM user_feed_sessions
    WHERE user_id = p_user_id AND session_token = p_session_token AND ended_at IS NULL;

    IF FOUND THEN
        -- Update last activity
        UPDATE user_feed_sessions SET last_activity_at = now() WHERE id = v_session.id
        RETURNING * INTO v_session;
        RETURN v_session;
    END IF;

    -- End any previous active sessions
    UPDATE user_feed_sessions
    SET ended_at = now()
    WHERE user_id = p_user_id AND ended_at IS NULL;

    -- Create new session
    INSERT INTO user_feed_sessions (user_id, session_token)
    VALUES (p_user_id, p_session_token)
    RETURNING * INTO v_session;

    RETURN v_session;
END;
$$;

-- ═══════════════════════════════════════
-- 16. RPC: Update session with shown content IDs
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION update_feed_session(
    p_session_id UUID,
    p_content_ids TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE user_feed_sessions
    SET content_ids_shown = content_ids_shown || p_content_ids,
        content_count = content_count + array_length(p_content_ids, 1),
        last_activity_at = now()
    WHERE id = p_session_id;
END;
$$;

-- ═══════════════════════════════════════
-- 17. RPC: Get user's time since last session
-- Returns hours since last activity (for session-aware rotation)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_session_gap_hours(p_user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_last_activity TIMESTAMPTZ;
BEGIN
    SELECT last_activity_at INTO v_last_activity
    FROM user_feed_sessions
    WHERE user_id = p_user_id
    ORDER BY last_activity_at DESC
    LIMIT 1;

    IF v_last_activity IS NULL THEN
        RETURN 999; -- first time user
    END IF;

    RETURN EXTRACT(EPOCH FROM (now() - v_last_activity)) / 3600.0;
END;
$$;

-- ═══════════════════════════════════════
-- 18. RPC: Get last session's content IDs (for session-aware rotation)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_last_session_content_ids(p_user_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_ids TEXT[];
BEGIN
    SELECT content_ids_shown INTO v_ids
    FROM user_feed_sessions
    WHERE user_id = p_user_id AND ended_at IS NOT NULL
    ORDER BY ended_at DESC
    LIMIT 1;

    RETURN COALESCE(v_ids, '{}');
END;
$$;

-- ═══════════════════════════════════════
-- 19. RPC: Get personalized group feed
-- The core feed algorithm combining all 6 features
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_personalized_group_feed(
    p_user_id UUID,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0,
    p_exploration_ratio NUMERIC DEFAULT 0.30
)
RETURNS TABLE(
    group_id UUID,
    group_name TEXT,
    group_platform TEXT,
    group_category TEXT,
    group_country TEXT,
    group_description TEXT,
    group_trust_score INT,
    group_views INT,
    group_clicks INT,
    group_avg_rating NUMERIC,
    group_review_count INT,
    group_tags TEXT[],
    group_link TEXT,
    group_likes_count INT,
    feed_score NUMERIC,
    feed_reason TEXT,
    is_trending BOOLEAN,
    is_exploration BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_exploitation_count INT;
    v_exploration_count INT;
    v_session_gap NUMERIC;
    v_last_session_ids TEXT[];
    v_user_categories TEXT[];
BEGIN
    -- Calculate exploitation vs exploration split
    v_exploitation_count := CEIL(p_limit * (1.0 - p_exploration_ratio));
    v_exploration_count := p_limit - v_exploitation_count;

    -- Get session gap for session-aware rotation
    SELECT get_session_gap_hours(p_user_id) INTO v_session_gap;

    -- Get last session content IDs for exclusion
    IF v_session_gap < 2 THEN
        SELECT get_last_session_content_ids(p_user_id) INTO v_last_session_ids;
    ELSE
        v_last_session_ids := '{}';
    END IF;

    -- Get user's top interest categories
    SELECT ARRAY_AGG(category ORDER BY weight DESC)
    INTO v_user_categories
    FROM (
        SELECT category, weight FROM user_interests
        WHERE user_id = p_user_id AND content_type = 'group'
        ORDER BY weight DESC LIMIT 10
    ) top_cats;

    IF v_user_categories IS NULL THEN
        v_user_categories := '{}';
    END IF;

    -- EXPLOITATION: content the algorithm knows user will like
    RETURN QUERY
    SELECT
        g.id,
        g.name,
        g.platform,
        g.category,
        g.country,
        g.description,
        g.trust_score,
        g.views,
        g.clicks,
        g.avg_rating,
        g.review_count,
        g.tags,
        g.link,
        g.likes_count,
        -- Personalized score formula:
        -- score = freshness + relevance + engagement + diversity - seen_penalty
        ROUND((
            -- Freshness: boost content created in last 48h, decay after
            CASE
                WHEN g.created_at >= now() - INTERVAL '12 hours' THEN 25
                WHEN g.created_at >= now() - INTERVAL '48 hours' THEN 15
                WHEN g.created_at >= now() - INTERVAL '7 days' THEN 8
                ELSE 2
            END
            -- Relevance: match user's preferred categories
            + CASE
                WHEN g.category = ANY(v_user_categories) THEN 30 * COALESCE(
                    (SELECT weight FROM user_interests WHERE user_id = p_user_id AND content_type = 'group' AND category = g.category),
                    1.0
                ) / 10.0
                ELSE 0
              END
            -- Engagement: high-engagement content surfaces more
            + LEAST(20, (COALESCE(g.likes_count, 0) * 0.5 + COALESCE(g.clicks, 0) * 0.1 + COALESCE(g.views, 0) * 0.02))
            -- Trending velocity boost
            + COALESCE((SELECT ts.velocity_score * 10 FROM trending_scores ts WHERE ts.content_id = g.id::TEXT AND ts.content_type = 'group'), 0)
            -- Collaborative filtering boost: if similar to groups user liked
            + COALESCE((
                SELECT AVG(cs.score) * 15
                FROM collaborative_scores cs
                WHERE cs.target_id = g.id::TEXT
                  AND cs.content_type = 'group'
                  AND cs.source_id IN (
                      SELECT gi.group_id::TEXT FROM group_interactions gi
                      WHERE gi.user_uid = p_user_id AND gi.interaction_type IN ('join', 'like', 'save')
                  )
            ), 0)
            -- Trust score bonus
            + COALESCE(g.trust_score, 0) * 0.05
            -- PENALTY: already seen (decay-based)
            - COALESCE((
                SELECT
                    GREATEST(0, 1.0 - (EXTRACT(EPOCH FROM (now() - ci.last_shown_at)) / 86400.0 / 30.0))
                    * LEAST(ci.impression_count, 5) / 5.0
                    * CASE WHEN ci.clicked THEN 40 ELSE 25 END
                FROM content_impressions ci
                WHERE ci.user_id = p_user_id AND ci.content_id = g.id::TEXT AND ci.content_type = 'group'
            ), 0)
        )::NUMERIC, 2) AS feed_score,
        'personalized'::TEXT AS feed_reason,
        COALESCE((SELECT ts.velocity_score > 1 FROM trending_scores ts WHERE ts.content_id = g.id::TEXT AND ts.content_type = 'group'), false) AS is_trending,
        false AS is_exploration
    FROM groups g
    WHERE g.status = 'approved'
      AND NOT (g.id::TEXT = ANY(v_last_session_ids))
    ORDER BY feed_score DESC
    LIMIT v_exploitation_count OFFSET p_offset;

    -- EXPLORATION: random/trending/new stuff user hasn't seen
    RETURN QUERY
    SELECT
        g.id,
        g.name,
        g.platform,
        g.category,
        g.country,
        g.description,
        g.trust_score,
        g.views,
        g.clicks,
        g.avg_rating,
        g.review_count,
        g.tags,
        g.link,
        g.likes_count,
        -- Exploration score: random + freshness + trending
        ROUND((
            random() * 30
            + CASE
                WHEN g.created_at >= now() - INTERVAL '24 hours' THEN 20
                WHEN g.created_at >= now() - INTERVAL '72 hours' THEN 10
                ELSE 0
              END
            + COALESCE((SELECT ts.velocity_score * 5 FROM trending_scores ts WHERE ts.content_id = g.id::TEXT AND ts.content_type = 'group'), 0)
            -- Diversity bonus: categories user does NOT usually browse
            + CASE
                WHEN NOT (g.category = ANY(v_user_categories)) THEN 15
                ELSE 0
              END
        )::NUMERIC, 2) AS feed_score,
        'exploration'::TEXT AS feed_reason,
        COALESCE((SELECT ts.velocity_score > 1 FROM trending_scores ts WHERE ts.content_id = g.id::TEXT AND ts.content_type = 'group'), false) AS is_trending,
        true AS is_exploration
    FROM groups g
    WHERE g.status = 'approved'
      AND NOT (g.id::TEXT = ANY(v_last_session_ids))
      -- Prefer content user hasn't seen recently
      AND NOT EXISTS (
          SELECT 1 FROM content_impressions ci
          WHERE ci.user_id = p_user_id AND ci.content_id = g.id::TEXT AND ci.content_type = 'group'
            AND ci.last_shown_at >= now() - INTERVAL '7 days'
      )
    ORDER BY feed_score DESC
    LIMIT v_exploration_count;
END;
$$;

-- ═══════════════════════════════════════
-- 20. RPC: Get personalized article feed
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_personalized_article_feed(
    p_user_id UUID,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0,
    p_exploration_ratio NUMERIC DEFAULT 0.30
)
RETURNS TABLE(
    article_id UUID,
    article_title TEXT,
    article_slug TEXT,
    article_excerpt TEXT,
    article_category TEXT,
    article_tags TEXT[],
    article_image TEXT,
    article_views INT,
    article_like_count INT,
    article_comment_count INT,
    article_tip_count INT,
    article_reading_time INT,
    article_published_at TIMESTAMPTZ,
    article_author_name TEXT,
    article_author_avatar TEXT,
    article_user_id UUID,
    feed_score NUMERIC,
    feed_reason TEXT,
    is_trending BOOLEAN,
    is_exploration BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_exploitation_count INT;
    v_exploration_count INT;
    v_session_gap NUMERIC;
    v_last_session_ids TEXT[];
    v_user_categories TEXT[];
BEGIN
    v_exploitation_count := CEIL(p_limit * (1.0 - p_exploration_ratio));
    v_exploration_count := p_limit - v_exploitation_count;

    SELECT get_session_gap_hours(p_user_id) INTO v_session_gap;

    IF v_session_gap < 2 THEN
        SELECT get_last_session_content_ids(p_user_id) INTO v_last_session_ids;
    ELSE
        v_last_session_ids := '{}';
    END IF;

    SELECT ARRAY_AGG(category ORDER BY weight DESC)
    INTO v_user_categories
    FROM (
        SELECT category, weight FROM user_interests
        WHERE user_id = p_user_id AND content_type = 'article'
        ORDER BY weight DESC LIMIT 10
    ) top_cats;

    IF v_user_categories IS NULL THEN
        v_user_categories := '{}';
    END IF;

    -- EXPLOITATION
    RETURN QUERY
    SELECT
        a.id,
        a.title,
        a.slug,
        a.excerpt,
        a.category,
        a.tags,
        a.image,
        a.views,
        a.like_count,
        a.comment_count,
        COALESCE(a.tip_count, 0),
        a.reading_time,
        a.published_at,
        a.author_name,
        a.author_avatar,
        a.user_id,
        ROUND((
            -- Freshness
            CASE
                WHEN a.published_at >= now() - INTERVAL '12 hours' THEN 25
                WHEN a.published_at >= now() - INTERVAL '48 hours' THEN 15
                WHEN a.published_at >= now() - INTERVAL '7 days' THEN 8
                ELSE 2
            END
            -- Relevance
            + CASE
                WHEN a.category = ANY(v_user_categories) THEN 30 * COALESCE(
                    (SELECT weight FROM user_interests WHERE user_id = p_user_id AND content_type = 'article' AND category = a.category),
                    1.0
                ) / 10.0
                ELSE 0
              END
            -- Engagement
            + LEAST(20, (COALESCE(a.like_count, 0) * 1.0 + COALESCE(a.comment_count, 0) * 2.0 + COALESCE(a.tip_count, 0) * 3.0 + COALESCE(a.views, 0) * 0.01))
            -- Trending
            + COALESCE((SELECT ts.velocity_score * 10 FROM trending_scores ts WHERE ts.content_id = a.id::TEXT AND ts.content_type = 'article'), 0)
            -- Collaborative boost
            + COALESCE((
                SELECT AVG(cs.score) * 15
                FROM collaborative_scores cs
                WHERE cs.target_id = a.id::TEXT
                  AND cs.content_type = 'article'
                  AND cs.source_id IN (
                      SELECT arh.article_id::TEXT FROM article_reading_history arh
                      WHERE arh.user_id = (SELECT auth_id FROM users WHERE id = p_user_id) AND arh.read_percentage >= 50
                  )
            ), 0)
            -- Following boost
            + CASE WHEN EXISTS (
                SELECT 1 FROM user_follows uf WHERE uf.follower_id = p_user_id AND uf.following_id = a.user_id
            ) THEN 10 ELSE 0 END
            -- Seen penalty
            - COALESCE((
                SELECT
                    GREATEST(0, 1.0 - (EXTRACT(EPOCH FROM (now() - ci.last_shown_at)) / 86400.0 / 30.0))
                    * LEAST(ci.impression_count, 5) / 5.0
                    * CASE WHEN ci.clicked THEN 40 ELSE 25 END
                FROM content_impressions ci
                WHERE ci.user_id = p_user_id AND ci.content_id = a.id::TEXT AND ci.content_type = 'article'
            ), 0)
            -- Already read penalty
            - CASE WHEN EXISTS (
                SELECT 1 FROM article_reading_history arh
                WHERE arh.user_id = (SELECT auth_id FROM users WHERE id = p_user_id) AND arh.article_id = a.id
                  AND arh.read_at >= now() - INTERVAL '14 days'
            ) THEN 50 ELSE 0 END
        )::NUMERIC, 2) AS feed_score,
        'personalized'::TEXT,
        COALESCE((SELECT ts.velocity_score > 1 FROM trending_scores ts WHERE ts.content_id = a.id::TEXT AND ts.content_type = 'article'), false),
        false
    FROM articles a
    WHERE a.status = 'published'
      AND a.moderation_status = 'approved'
      AND (a.visibility = 'public' OR a.visibility IS NULL)
      AND NOT (a.id::TEXT = ANY(v_last_session_ids))
    ORDER BY feed_score DESC
    LIMIT v_exploitation_count OFFSET p_offset;

    -- EXPLORATION
    RETURN QUERY
    SELECT
        a.id,
        a.title,
        a.slug,
        a.excerpt,
        a.category,
        a.tags,
        a.image,
        a.views,
        a.like_count,
        a.comment_count,
        COALESCE(a.tip_count, 0),
        a.reading_time,
        a.published_at,
        a.author_name,
        a.author_avatar,
        a.user_id,
        ROUND((
            random() * 30
            + CASE
                WHEN a.published_at >= now() - INTERVAL '24 hours' THEN 20
                WHEN a.published_at >= now() - INTERVAL '72 hours' THEN 10
                ELSE 0
              END
            + COALESCE((SELECT ts.velocity_score * 5 FROM trending_scores ts WHERE ts.content_id = a.id::TEXT AND ts.content_type = 'article'), 0)
            + CASE WHEN NOT (a.category = ANY(v_user_categories)) THEN 15 ELSE 0 END
        )::NUMERIC, 2) AS feed_score,
        'exploration'::TEXT,
        COALESCE((SELECT ts.velocity_score > 1 FROM trending_scores ts WHERE ts.content_id = a.id::TEXT AND ts.content_type = 'article'), false),
        true
    FROM articles a
    WHERE a.status = 'published'
      AND a.moderation_status = 'approved'
      AND (a.visibility = 'public' OR a.visibility IS NULL)
      AND NOT (a.id::TEXT = ANY(v_last_session_ids))
      AND NOT EXISTS (
          SELECT 1 FROM content_impressions ci
          WHERE ci.user_id = p_user_id AND ci.content_id = a.id::TEXT AND ci.content_type = 'article'
            AND ci.last_shown_at >= now() - INTERVAL '7 days'
      )
    ORDER BY feed_score DESC
    LIMIT v_exploration_count;
END;
$$;

-- ═══════════════════════════════════════
-- 21. RPC: Get "What You Missed" digest (for 7+ day gap)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_missed_digest_groups(
    p_user_id UUID,
    p_days INT DEFAULT 7,
    p_limit INT DEFAULT 10
)
RETURNS TABLE(
    group_id UUID,
    group_name TEXT,
    group_platform TEXT,
    group_category TEXT,
    group_description TEXT,
    group_trust_score INT,
    total_engagement BIGINT,
    digest_reason TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_since TIMESTAMPTZ;
BEGIN
    v_since := now() - (p_days || ' days')::INTERVAL;

    RETURN QUERY
    SELECT
        g.id,
        g.name,
        g.platform,
        g.category,
        g.description,
        g.trust_score,
        (COALESCE(g.views, 0) + COALESCE(g.clicks, 0) + COALESCE(g.likes_count, 0))::BIGINT AS total_engagement,
        'trending_while_away'::TEXT AS digest_reason
    FROM groups g
    LEFT JOIN trending_scores ts ON ts.content_id = g.id::TEXT AND ts.content_type = 'group'
    WHERE g.status = 'approved'
      AND g.created_at >= v_since
    ORDER BY COALESCE(ts.velocity_score, 0) DESC, (COALESCE(g.views, 0) + COALESCE(g.clicks, 0)) DESC
    LIMIT p_limit;
END;
$$;

-- ═══════════════════════════════════════
-- 22. RPC: Get "What You Missed" digest for articles
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_missed_digest_articles(
    p_user_id UUID,
    p_days INT DEFAULT 7,
    p_limit INT DEFAULT 10
)
RETURNS TABLE(
    article_id UUID,
    article_title TEXT,
    article_slug TEXT,
    article_category TEXT,
    article_author_name TEXT,
    article_like_count INT,
    article_comment_count INT,
    article_views INT,
    total_engagement BIGINT,
    digest_reason TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_since TIMESTAMPTZ;
BEGIN
    v_since := now() - (p_days || ' days')::INTERVAL;

    RETURN QUERY
    SELECT
        a.id,
        a.title,
        a.slug,
        a.category,
        a.author_name,
        a.like_count,
        a.comment_count,
        a.views,
        (COALESCE(a.like_count, 0) + COALESCE(a.comment_count, 0) + COALESCE(a.views, 0))::BIGINT,
        'popular_while_away'::TEXT
    FROM articles a
    LEFT JOIN trending_scores ts ON ts.content_id = a.id::TEXT AND ts.content_type = 'article'
    WHERE a.status = 'published'
      AND a.moderation_status = 'approved'
      AND a.published_at >= v_since
      -- Exclude already read
      AND NOT EXISTS (
          SELECT 1 FROM article_reading_history arh
          WHERE arh.user_id = (SELECT auth_id FROM users WHERE id = p_user_id)
            AND arh.article_id = a.id
      )
    ORDER BY COALESCE(ts.velocity_score, 0) DESC, (COALESCE(a.like_count, 0) * 2 + COALESCE(a.comment_count, 0) * 3 + COALESCE(a.views, 0) * 0.1) DESC
    LIMIT p_limit;
END;
$$;

-- ═══════════════════════════════════════
-- 23. RPC: Decay old interest weights (run nightly)
-- Prevents stale interests from dominating
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION decay_user_interests(p_decay_factor NUMERIC DEFAULT 0.95)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE user_interests
    SET weight = GREATEST(weight * p_decay_factor, 0.1)
    WHERE last_interaction_at < now() - INTERVAL '7 days';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Clean up very low weight interests
    DELETE FROM user_interests WHERE weight < 0.15 AND last_interaction_at < now() - INTERVAL '90 days';

    RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════
-- 24. RPC: Clean up old impressions (run weekly)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION cleanup_old_impressions(p_days INT DEFAULT 60)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count INT;
BEGIN
    DELETE FROM content_impressions
    WHERE last_shown_at < now() - (p_days || ' days')::INTERVAL
      AND clicked = false;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════
-- 25. RPC: Clean up old sessions (run weekly)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION cleanup_old_sessions(p_days INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count INT;
BEGIN
    DELETE FROM user_feed_sessions
    WHERE started_at < now() - (p_days || ' days')::INTERVAL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;
