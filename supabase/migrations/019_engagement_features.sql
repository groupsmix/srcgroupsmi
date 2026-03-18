-- ═══════════════════════════════════════════════════════════════
-- Migration 019: Engagement & Retention Features
-- Group comparison, health dashboard, weekly digest,
-- owner leaderboard, verified badge, push notifications
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Group Comparison Tool ─────────────────────────────────
-- Saved comparisons so users can share/bookmark them
CREATE TABLE IF NOT EXISTS group_comparisons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_ids UUID[] NOT NULL,
    created_by UUID,
    slug TEXT UNIQUE,
    view_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE group_comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read comparisons" ON group_comparisons FOR SELECT USING (true);
CREATE POLICY "Anyone can create comparisons" ON group_comparisons FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_group_comparisons_slug ON group_comparisons(slug);

-- RPC: Compare up to 5 groups side-by-side
CREATE OR REPLACE FUNCTION compare_groups(p_group_ids UUID[])
RETURNS TABLE(
    id UUID,
    name TEXT,
    platform TEXT,
    category TEXT,
    description TEXT,
    link TEXT,
    members_count INT,
    views BIGINT,
    clicks BIGINT,
    click_count BIGINT,
    likes_count INT,
    avg_rating NUMERIC,
    review_count INT,
    trust_score INT,
    reports INT,
    tags TEXT[],
    country TEXT,
    language TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    recent_reviews BIGINT,
    recent_views BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        g.id, g.name, g.platform, g.category, g.description, g.link,
        g.members_count,
        COALESCE(g.views, 0)::BIGINT AS views,
        COALESCE(g.clicks, 0)::BIGINT AS clicks,
        COALESCE(g.click_count, 0)::BIGINT AS click_count,
        COALESCE(g.likes_count, 0) AS likes_count,
        COALESCE(g.avg_rating, 0) AS avg_rating,
        COALESCE(g.review_count, 0) AS review_count,
        COALESCE(g.trust_score, 0) AS trust_score,
        COALESCE(g.reports, 0) AS reports,
        g.tags,
        g.country,
        g.language,
        g.status,
        g.created_at,
        (SELECT COUNT(*) FROM reviews r WHERE r.group_id = g.id AND r.created_at > now() - INTERVAL '30 days') AS recent_reviews,
        COALESCE(
            (SELECT COUNT(*) FROM group_interactions gi WHERE gi.group_id = g.id AND gi.created_at > now() - INTERVAL '7 days'),
            0
        )::BIGINT AS recent_views
    FROM groups g
    WHERE g.id = ANY(p_group_ids)
    ORDER BY array_position(p_group_ids, g.id);
END;
$$;

-- RPC: Save a comparison and return the slug
CREATE OR REPLACE FUNCTION save_comparison(p_group_ids UUID[], p_created_by UUID DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_slug TEXT;
    v_existing TEXT;
BEGIN
    -- Check if this exact comparison already exists
    SELECT slug INTO v_existing FROM group_comparisons
    WHERE group_ids = p_group_ids LIMIT 1;
    IF v_existing IS NOT NULL THEN
        UPDATE group_comparisons SET view_count = view_count + 1 WHERE slug = v_existing;
        RETURN v_existing;
    END IF;

    -- Generate a short slug
    v_slug := substr(md5(random()::text || now()::text), 1, 8);

    INSERT INTO group_comparisons (group_ids, created_by, slug)
    VALUES (p_group_ids, p_created_by, v_slug);

    RETURN v_slug;
END;
$$;

-- RPC: Get a saved comparison by slug
CREATE OR REPLACE FUNCTION get_comparison_by_slug(p_slug TEXT)
RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_ids UUID[];
BEGIN
    SELECT group_ids INTO v_ids FROM group_comparisons WHERE slug = p_slug;
    IF v_ids IS NOT NULL THEN
        UPDATE group_comparisons SET view_count = view_count + 1 WHERE slug = p_slug;
    END IF;
    RETURN v_ids;
END;
$$;


-- ─── 2. Group Health Dashboard ────────────────────────────────
-- Trust score history for tracking trends over time
CREATE TABLE IF NOT EXISTS group_health_snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    trust_score INT DEFAULT 0,
    views_total BIGINT DEFAULT 0,
    clicks_total BIGINT DEFAULT 0,
    review_count INT DEFAULT 0,
    avg_rating NUMERIC DEFAULT 0,
    members_count INT DEFAULT 0,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(group_id, snapshot_date)
);

ALTER TABLE group_health_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read health snapshots" ON group_health_snapshots FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_group_health_group_date ON group_health_snapshots(group_id, snapshot_date DESC);

-- RPC: Take a daily snapshot for all approved groups (cron job)
CREATE OR REPLACE FUNCTION snapshot_group_health()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count INT := 0;
BEGIN
    INSERT INTO group_health_snapshots (group_id, trust_score, views_total, clicks_total, review_count, avg_rating, members_count, snapshot_date)
    SELECT
        g.id,
        COALESCE(g.trust_score, 0),
        COALESCE(g.views, 0),
        COALESCE(g.click_count, 0),
        COALESCE(g.review_count, 0),
        COALESCE(g.avg_rating, 0),
        COALESCE(g.members_count, 0),
        CURRENT_DATE
    FROM groups g
    WHERE g.status = 'approved'
    ON CONFLICT (group_id, snapshot_date) DO UPDATE SET
        trust_score = EXCLUDED.trust_score,
        views_total = EXCLUDED.views_total,
        clicks_total = EXCLUDED.clicks_total,
        review_count = EXCLUDED.review_count,
        avg_rating = EXCLUDED.avg_rating,
        members_count = EXCLUDED.members_count;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- RPC: Get group health history (last N days)
CREATE OR REPLACE FUNCTION get_group_health_history(p_group_id UUID, p_days INT DEFAULT 30)
RETURNS TABLE(
    snapshot_date DATE,
    trust_score INT,
    views_total BIGINT,
    clicks_total BIGINT,
    review_count INT,
    avg_rating NUMERIC,
    members_count INT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        ghs.snapshot_date,
        ghs.trust_score,
        ghs.views_total,
        ghs.clicks_total,
        ghs.review_count,
        ghs.avg_rating,
        ghs.members_count
    FROM group_health_snapshots ghs
    WHERE ghs.group_id = p_group_id
      AND ghs.snapshot_date >= CURRENT_DATE - p_days
    ORDER BY ghs.snapshot_date ASC;
END;
$$;

-- RPC: Get group rank vs similar groups (same category)
CREATE OR REPLACE FUNCTION get_group_rank(p_group_id UUID)
RETURNS TABLE(
    rank_in_category INT,
    total_in_category INT,
    percentile NUMERIC,
    category TEXT,
    avg_trust_in_category NUMERIC,
    avg_views_in_category NUMERIC,
    avg_reviews_in_category NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_category TEXT;
BEGIN
    SELECT g.category INTO v_category FROM groups g WHERE g.id = p_group_id;

    RETURN QUERY
    WITH ranked AS (
        SELECT
            g.id,
            COALESCE(g.trust_score, 0) AS ts,
            ROW_NUMBER() OVER (ORDER BY COALESCE(g.trust_score, 0) DESC, COALESCE(g.views, 0) DESC) AS rn,
            COUNT(*) OVER () AS total
        FROM groups g
        WHERE g.category = v_category AND g.status = 'approved'
    ),
    cat_stats AS (
        SELECT
            AVG(COALESCE(g.trust_score, 0))::NUMERIC AS avg_trust,
            AVG(COALESCE(g.views, 0))::NUMERIC AS avg_views,
            AVG(COALESCE(g.review_count, 0))::NUMERIC AS avg_reviews
        FROM groups g
        WHERE g.category = v_category AND g.status = 'approved'
    )
    SELECT
        r.rn::INT AS rank_in_category,
        r.total::INT AS total_in_category,
        ROUND((1.0 - (r.rn::NUMERIC / GREATEST(r.total, 1))) * 100, 1) AS percentile,
        v_category AS category,
        ROUND(cs.avg_trust, 1) AS avg_trust_in_category,
        ROUND(cs.avg_views, 0) AS avg_views_in_category,
        ROUND(cs.avg_reviews, 1) AS avg_reviews_in_category
    FROM ranked r, cat_stats cs
    WHERE r.id = p_group_id;
END;
$$;


-- ─── 3. Weekly Email Digest ──────────────────────────────────
-- Digest log to avoid sending duplicate digests
CREATE TABLE IF NOT EXISTS digest_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subscriber_email TEXT NOT NULL,
    digest_type TEXT DEFAULT 'weekly',
    sent_at TIMESTAMPTZ DEFAULT now(),
    content_ids UUID[],
    opened BOOLEAN DEFAULT false,
    clicked BOOLEAN DEFAULT false
);

ALTER TABLE digest_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages digest log" ON digest_log FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_digest_log_email_sent ON digest_log(subscriber_email, sent_at DESC);

-- RPC: Get top trending groups for digest (segmented by category if provided)
CREATE OR REPLACE FUNCTION get_digest_content(
    p_category TEXT DEFAULT NULL,
    p_limit INT DEFAULT 5,
    p_days INT DEFAULT 7
)
RETURNS TABLE(
    id UUID,
    name TEXT,
    platform TEXT,
    category TEXT,
    description TEXT,
    members_count INT,
    trust_score INT,
    avg_rating NUMERIC,
    review_count INT,
    views BIGINT,
    velocity_score NUMERIC,
    new_reviews_count BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        g.id, g.name, g.platform, g.category, g.description,
        g.members_count,
        COALESCE(g.trust_score, 0) AS trust_score,
        COALESCE(g.avg_rating, 0) AS avg_rating,
        COALESCE(g.review_count, 0) AS review_count,
        COALESCE(g.views, 0)::BIGINT AS views,
        COALESCE(ts.velocity_score, 0) AS velocity_score,
        (SELECT COUNT(*) FROM reviews r WHERE r.group_id = g.id AND r.created_at > now() - (p_days || ' days')::INTERVAL) AS new_reviews_count
    FROM groups g
    LEFT JOIN trending_scores ts ON ts.content_id = g.id AND ts.content_type = 'group'
    WHERE g.status = 'approved'
      AND (p_category IS NULL OR g.category = p_category)
    ORDER BY COALESCE(ts.velocity_score, 0) DESC, COALESCE(g.views, 0) DESC
    LIMIT p_limit;
END;
$$;

-- RPC: Get subscribers who haven't received a digest this week
CREATE OR REPLACE FUNCTION get_pending_digest_subscribers(p_limit INT DEFAULT 100)
RETURNS TABLE(
    email TEXT,
    name TEXT,
    preferred_categories TEXT[]
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        ns.email,
        COALESCE(ns.name, '') AS name,
        ARRAY(
            SELECT DISTINCT ui.category
            FROM user_interests ui
            JOIN users u ON u.id = ui.user_id
            WHERE u.email = ns.email
            ORDER BY ui.category
            LIMIT 3
        ) AS preferred_categories
    FROM newsletter_subscribers ns
    WHERE ns.status = 'active'
      AND NOT EXISTS (
          SELECT 1 FROM digest_log dl
          WHERE dl.subscriber_email = ns.email
            AND dl.sent_at > now() - INTERVAL '6 days'
      )
    LIMIT p_limit;
END;
$$;

-- RPC: Log a digest send
CREATE OR REPLACE FUNCTION log_digest_sent(
    p_email TEXT,
    p_content_ids UUID[],
    p_digest_type TEXT DEFAULT 'weekly'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO digest_log (subscriber_email, digest_type, content_ids)
    VALUES (p_email, p_digest_type, p_content_ids);
END;
$$;


-- ─── 4. Group Owner Leaderboard ──────────────────────────────
-- RPC: Get top group owners ranked by aggregate metrics
CREATE OR REPLACE FUNCTION get_group_owner_leaderboard(
    p_sort_by TEXT DEFAULT 'score',
    p_limit INT DEFAULT 20,
    p_period TEXT DEFAULT 'all'
)
RETURNS TABLE(
    user_id UUID,
    display_name TEXT,
    photo_url TEXT,
    writer_level INT,
    writer_xp INT,
    gxp INT,
    total_groups BIGINT,
    total_views BIGINT,
    total_clicks BIGINT,
    total_reviews BIGINT,
    avg_trust_score NUMERIC,
    avg_rating NUMERIC,
    owner_score NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id AS user_id,
        COALESCE(u.display_name, 'Anonymous') AS display_name,
        u.photo_url,
        COALESCE(u.writer_level, 0) AS writer_level,
        COALESCE(u.writer_xp, 0) AS writer_xp,
        COALESCE(u.gxp, 0) AS gxp,
        COUNT(g.id) AS total_groups,
        COALESCE(SUM(g.views), 0)::BIGINT AS total_views,
        COALESCE(SUM(g.click_count), 0)::BIGINT AS total_clicks,
        COALESCE(SUM(g.review_count), 0)::BIGINT AS total_reviews,
        ROUND(AVG(COALESCE(g.trust_score, 0)), 1) AS avg_trust_score,
        ROUND(AVG(COALESCE(g.avg_rating, 0)), 2) AS avg_rating,
        ROUND(
            (COUNT(g.id) * 10 +
             COALESCE(SUM(g.views), 0) * 0.01 +
             COALESCE(SUM(g.click_count), 0) * 0.1 +
             COALESCE(SUM(g.review_count), 0) * 5 +
             AVG(COALESCE(g.trust_score, 0)) * 2)::NUMERIC,
            1
        ) AS owner_score
    FROM users u
    JOIN groups g ON g.submitted_by = u.id
    WHERE g.status = 'approved'
      AND (p_period = 'all' OR g.created_at > now() - (p_period || ' days')::INTERVAL)
    GROUP BY u.id, u.display_name, u.photo_url, u.writer_level, u.writer_xp, u.gxp
    HAVING COUNT(g.id) >= 1
    ORDER BY
        CASE WHEN p_sort_by = 'score' THEN
            (COUNT(g.id) * 10 + COALESCE(SUM(g.views), 0) * 0.01 + COALESCE(SUM(g.click_count), 0) * 0.1 + COALESCE(SUM(g.review_count), 0) * 5 + AVG(COALESCE(g.trust_score, 0)) * 2)
        WHEN p_sort_by = 'groups' THEN COUNT(g.id)::NUMERIC
        WHEN p_sort_by = 'views' THEN COALESCE(SUM(g.views), 0)::NUMERIC
        WHEN p_sort_by = 'trust' THEN AVG(COALESCE(g.trust_score, 0))
        ELSE (COUNT(g.id) * 10 + COALESCE(SUM(g.views), 0) * 0.01 + COALESCE(SUM(g.click_count), 0) * 0.1 + COALESCE(SUM(g.review_count), 0) * 5 + AVG(COALESCE(g.trust_score, 0)) * 2)
        END DESC
    LIMIT p_limit;
END;
$$;


-- ─── 5. Verified Group Badge Program ─────────────────────────
CREATE TABLE IF NOT EXISTS verified_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE UNIQUE,
    verified_by TEXT DEFAULT 'coins' CHECK (verified_by IN ('coins', 'admin', 'earned')),
    coins_paid INT DEFAULT 0,
    verified_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
    verified_by_user UUID
);

ALTER TABLE verified_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read verified groups" ON verified_groups FOR SELECT USING (true);
CREATE POLICY "Auth users can request verification" ON verified_groups FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_verified_groups_group ON verified_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_verified_groups_status ON verified_groups(status);

-- RPC: Purchase verified badge with GMX coins
CREATE OR REPLACE FUNCTION purchase_verified_badge(
    p_group_id UUID,
    p_user_id UUID,
    p_cost INT DEFAULT 500
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_balance INT;
    v_group_owner UUID;
BEGIN
    -- Check group ownership
    SELECT submitted_by INTO v_group_owner FROM groups WHERE id = p_group_id;
    IF v_group_owner IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Group not found');
    END IF;
    IF v_group_owner != p_user_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'You do not own this group');
    END IF;

    -- Check if already verified
    IF EXISTS (SELECT 1 FROM verified_groups WHERE group_id = p_group_id AND status = 'active' AND expires_at > now()) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Group is already verified');
    END IF;

    -- Check balance
    SELECT COALESCE(gxp, 0) INTO v_balance FROM users WHERE id = p_user_id;
    IF v_balance < p_cost THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Insufficient GMX coins. Need ' || p_cost || ', have ' || v_balance);
    END IF;

    -- Deduct coins
    UPDATE users SET gxp = gxp - p_cost WHERE id = p_user_id;

    -- Record transaction
    INSERT INTO wallet_transactions (user_id, amount, type, description, reference_type)
    VALUES (p_user_id, -p_cost, 'purchase', 'Verified badge for group', 'verified_badge');

    -- Insert or update verified status
    INSERT INTO verified_groups (group_id, verified_by, coins_paid, verified_by_user, expires_at, status)
    VALUES (p_group_id, 'coins', p_cost, p_user_id, now() + INTERVAL '30 days', 'active')
    ON CONFLICT (group_id) DO UPDATE SET
        verified_by = 'coins',
        coins_paid = verified_groups.coins_paid + p_cost,
        verified_at = now(),
        expires_at = now() + INTERVAL '30 days',
        status = 'active',
        verified_by_user = p_user_id;

    -- Boost trust score
    UPDATE groups SET trust_score = LEAST(COALESCE(trust_score, 0) + 15, 100) WHERE id = p_group_id;

    RETURN jsonb_build_object('ok', true, 'expires_at', (now() + INTERVAL '30 days')::TEXT);
END;
$$;

-- RPC: Admin grant verified badge (free)
CREATE OR REPLACE FUNCTION admin_verify_group(p_group_id UUID, p_admin_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO verified_groups (group_id, verified_by, verified_by_user, expires_at, status)
    VALUES (p_group_id, 'admin', p_admin_id, now() + INTERVAL '365 days', 'active')
    ON CONFLICT (group_id) DO UPDATE SET
        verified_by = 'admin',
        verified_at = now(),
        expires_at = now() + INTERVAL '365 days',
        status = 'active',
        verified_by_user = p_admin_id;

    UPDATE groups SET trust_score = LEAST(COALESCE(trust_score, 0) + 15, 100) WHERE id = p_group_id;
END;
$$;

-- RPC: Check if a group is verified
CREATE OR REPLACE FUNCTION is_group_verified(p_group_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM verified_groups
        WHERE group_id = p_group_id AND status = 'active' AND expires_at > now()
    );
END;
$$;

-- RPC: Expire outdated verified badges (cron job)
CREATE OR REPLACE FUNCTION expire_verified_badges()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE verified_groups SET status = 'expired'
    WHERE status = 'active' AND expires_at <= now();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


-- ─── 6. Push Notification Helpers ─────────────────────────────
-- User notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    push_new_group BOOLEAN DEFAULT true,
    push_group_views BOOLEAN DEFAULT true,
    push_tips_received BOOLEAN DEFAULT true,
    push_weekly_digest BOOLEAN DEFAULT false,
    push_trending BOOLEAN DEFAULT true,
    email_weekly_digest BOOLEAN DEFAULT true,
    email_new_follower BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own notification prefs" ON notification_preferences FOR SELECT USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "Users can update own notification prefs" ON notification_preferences FOR UPDATE USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "Auth users can create notification prefs" ON notification_preferences FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- RPC: Get or create notification preferences
CREATE OR REPLACE FUNCTION get_notification_preferences(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_prefs JSONB;
BEGIN
    SELECT to_jsonb(np) INTO v_prefs FROM notification_preferences np WHERE np.user_id = p_user_id;
    IF v_prefs IS NULL THEN
        INSERT INTO notification_preferences (user_id) VALUES (p_user_id)
        ON CONFLICT (user_id) DO NOTHING;
        SELECT to_jsonb(np) INTO v_prefs FROM notification_preferences np WHERE np.user_id = p_user_id;
    END IF;
    RETURN v_prefs;
END;
$$;

-- RPC: Update notification preferences
CREATE OR REPLACE FUNCTION update_notification_preferences(
    p_user_id UUID,
    p_prefs JSONB
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO notification_preferences (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE notification_preferences SET
        push_new_group = COALESCE((p_prefs->>'push_new_group')::BOOLEAN, push_new_group),
        push_group_views = COALESCE((p_prefs->>'push_group_views')::BOOLEAN, push_group_views),
        push_tips_received = COALESCE((p_prefs->>'push_tips_received')::BOOLEAN, push_tips_received),
        push_weekly_digest = COALESCE((p_prefs->>'push_weekly_digest')::BOOLEAN, push_weekly_digest),
        push_trending = COALESCE((p_prefs->>'push_trending')::BOOLEAN, push_trending),
        email_weekly_digest = COALESCE((p_prefs->>'email_weekly_digest')::BOOLEAN, email_weekly_digest),
        email_new_follower = COALESCE((p_prefs->>'email_new_follower')::BOOLEAN, email_new_follower),
        updated_at = now()
    WHERE user_id = p_user_id;
END;
$$;

-- RPC: Get push subscribers for a notification type
CREATE OR REPLACE FUNCTION get_push_targets(
    p_notification_type TEXT,
    p_limit INT DEFAULT 100
)
RETURNS TABLE(
    user_id UUID,
    endpoint TEXT,
    keys_p256dh TEXT,
    keys_auth TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id AS user_id,
        ps.endpoint,
        ps.keys_p256dh,
        ps.keys_auth
    FROM push_subscriptions ps
    JOIN users u ON u.auth_id::TEXT = ps.uid
    JOIN notification_preferences np ON np.user_id = u.id
    WHERE ps.status = 'active'
      AND CASE
          WHEN p_notification_type = 'new_group' THEN np.push_new_group
          WHEN p_notification_type = 'group_views' THEN np.push_group_views
          WHEN p_notification_type = 'tips_received' THEN np.push_tips_received
          WHEN p_notification_type = 'weekly_digest' THEN np.push_weekly_digest
          WHEN p_notification_type = 'trending' THEN np.push_trending
          ELSE true
      END
    LIMIT p_limit;
END;
$$;
