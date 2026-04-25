-- AUDIT: public
-- ═══════════════════════════════════════════════════════════════
-- Migration 017: Growth Features
-- Embeddable widgets, link analytics, group of the day,
-- bot integrations, enhanced reviews, referral program
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Widget Embeds Tracking ───────────────────────────────
CREATE TABLE IF NOT EXISTS widget_embeds (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    creator_uid UUID,
    domain TEXT,
    style TEXT DEFAULT 'badge',
    impressions BIGINT DEFAULT 0,
    clicks BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE widget_embeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read widget embeds" ON widget_embeds FOR SELECT USING (true);
CREATE POLICY "Auth users can create widget embeds" ON widget_embeds FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION increment_widget_impressions(p_group_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    UPDATE widget_embeds SET impressions = impressions + 1 WHERE group_id = p_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_widget_clicks(p_group_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    UPDATE widget_embeds SET clicks = clicks + 1 WHERE group_id = p_group_id;
END;
$$;

-- ─── 2. Enhanced Link Click Analytics ────────────────────────
-- Add country column to link_clicks if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'link_clicks' AND column_name = 'country'
    ) THEN
        ALTER TABLE link_clicks ADD COLUMN country TEXT DEFAULT '';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'link_clicks' AND column_name = 'browser'
    ) THEN
        ALTER TABLE link_clicks ADD COLUMN browser TEXT DEFAULT '';
    END IF;
END $$;

-- Link analytics aggregate view
CREATE OR REPLACE VIEW link_analytics AS
SELECT
    sl.id AS link_id,
    sl.code,
    sl.long_url,
    sl.creator_uid,
    sl.clicks AS total_clicks,
    sl.created_at,
    COUNT(lc.id) AS tracked_clicks,
    COUNT(DISTINCT lc.country) FILTER (WHERE lc.country != '') AS unique_countries,
    jsonb_object_agg(
        COALESCE(lc.device, 'Unknown'),
        device_counts.cnt
    ) FILTER (WHERE lc.device IS NOT NULL) AS device_breakdown
FROM short_links sl
LEFT JOIN link_clicks lc ON lc.link_id = sl.id
LEFT JOIN LATERAL (
    SELECT device, COUNT(*) AS cnt
    FROM link_clicks
    WHERE link_id = sl.id
    GROUP BY device
) device_counts ON device_counts.device = lc.device
GROUP BY sl.id, sl.code, sl.long_url, sl.creator_uid, sl.clicks, sl.created_at;

-- ─── 3. Group of the Day ────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_of_the_day (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    featured_date DATE NOT NULL UNIQUE,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE group_of_the_day ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read group of the day" ON group_of_the_day FOR SELECT USING (true);
CREATE POLICY "Admins can manage group of the day" ON group_of_the_day FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
);

-- Function to auto-select group of the day based on trending score
CREATE OR REPLACE FUNCTION select_group_of_the_day()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    selected_id UUID;
    today DATE := CURRENT_DATE;
BEGIN
    -- Check if already selected today
    SELECT group_id INTO selected_id FROM group_of_the_day WHERE featured_date = today;
    IF selected_id IS NOT NULL THEN RETURN selected_id; END IF;

    -- Select highest engagement group not featured in last 30 days
    SELECT g.id INTO selected_id
    FROM groups g
    WHERE g.status = 'approved'
      AND g.id NOT IN (
          SELECT gd.group_id FROM group_of_the_day gd
          WHERE gd.featured_date > today - INTERVAL '30 days'
      )
    ORDER BY (COALESCE(g.views, 0) * 0.3 + COALESCE(g.clicks, 0) * 0.5 + COALESCE(g.likes_count, 0) * 0.2) DESC
    LIMIT 1;

    IF selected_id IS NOT NULL THEN
        INSERT INTO group_of_the_day (group_id, featured_date, reason)
        VALUES (selected_id, today, 'Auto-selected based on engagement score');
    END IF;

    RETURN selected_id;
END;
$$;

-- ─── 4. Bot Integrations ────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_integrations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
    platform TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
    bot_token_hash TEXT,
    chat_id TEXT,
    owner_uid UUID,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
    last_sync_at TIMESTAMPTZ,
    member_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE bot_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can manage their bots" ON bot_integrations FOR ALL USING (
    owner_uid = (SELECT id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "Anyone can read active bots" ON bot_integrations FOR SELECT USING (status = 'active');

-- ─── 5. Enhanced Group Reviews ──────────────────────────────
-- Add helpful_count to reviews if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reviews' AND column_name = 'helpful_count'
    ) THEN
        ALTER TABLE reviews ADD COLUMN helpful_count INT DEFAULT 0;
    END IF;
END $$;

-- Review helpfulness votes
CREATE TABLE IF NOT EXISTS review_votes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    voter_uid UUID NOT NULL,
    vote_type TEXT DEFAULT 'helpful' CHECK (vote_type IN ('helpful', 'unhelpful')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(review_id, voter_uid)
);

ALTER TABLE review_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read review votes" ON review_votes FOR SELECT USING (true);
CREATE POLICY "Auth users can vote on reviews" ON review_votes FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION increment_review_helpful(p_review_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    UPDATE reviews SET helpful_count = COALESCE(helpful_count, 0) + 1 WHERE id = p_review_id;
END;
$$;

-- ─── 6. Group Recommendations (Find Groups Like This) ───────
CREATE TABLE IF NOT EXISTS group_interactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_uid UUID NOT NULL,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    interaction_type TEXT NOT NULL CHECK (interaction_type IN ('view', 'click', 'join', 'save', 'like')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_interactions_user ON group_interactions(user_uid);
CREATE INDEX IF NOT EXISTS idx_group_interactions_group ON group_interactions(group_id);

ALTER TABLE group_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see own interactions" ON group_interactions FOR SELECT USING (
    user_uid = (SELECT id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "Auth users can create interactions" ON group_interactions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Co-occurrence recommendation function
CREATE OR REPLACE FUNCTION get_similar_groups_by_users(p_group_id UUID, p_limit INT DEFAULT 6)
RETURNS TABLE(group_id UUID, score BIGINT) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    RETURN QUERY
    SELECT gi2.group_id, COUNT(*) AS score
    FROM group_interactions gi1
    JOIN group_interactions gi2 ON gi1.user_uid = gi2.user_uid
    WHERE gi1.group_id = p_group_id
      AND gi2.group_id != p_group_id
      AND gi1.interaction_type IN ('click', 'join', 'save')
      AND gi2.interaction_type IN ('click', 'join', 'save')
    GROUP BY gi2.group_id
    ORDER BY score DESC
    LIMIT p_limit;
END;
$$;

-- ─── 7. Group Owner Stats (for dashboard) ───────────────────
CREATE OR REPLACE FUNCTION get_group_owner_stats(p_user_uid UUID)
RETURNS TABLE(
    total_groups BIGINT,
    total_views BIGINT,
    total_clicks BIGINT,
    total_reviews BIGINT,
    avg_rating NUMERIC,
    avg_trust_score NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(g.id) AS total_groups,
        COALESCE(SUM(g.views), 0) AS total_views,
        COALESCE(SUM(g.clicks), 0) AS total_clicks,
        COUNT(r.id) AS total_reviews,
        COALESCE(AVG(r.rating), 0) AS avg_rating,
        COALESCE(AVG(g.avg_rating), 0) AS avg_trust_score
    FROM groups g
    LEFT JOIN reviews r ON r.group_id = g.id
    WHERE g.submitted_by = p_user_uid;
END;
$$;

-- ─── 8. Referral Program with GMX Coins ─────────────────────
-- Referral codes table (if not exists from previous migrations)
CREATE TABLE IF NOT EXISTS referral_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    uid UUID NOT NULL,
    code TEXT NOT NULL UNIQUE,
    clicks INT DEFAULT 0,
    signups INT DEFAULT 0,
    purchases INT DEFAULT 0,
    coins_earned INT DEFAULT 0,
    commission_rate NUMERIC DEFAULT 10,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own referral codes" ON referral_codes FOR SELECT USING (
    uid = (SELECT id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "Auth users can create referral codes" ON referral_codes FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Referral events table (if not exists)
CREATE TABLE IF NOT EXISTS referral_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    referrer_uid UUID NOT NULL,
    referral_code TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('click', 'signup', 'purchase')),
    referred_uid UUID,
    commission NUMERIC DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own referral events" ON referral_events FOR SELECT USING (
    referrer_uid = (SELECT id FROM users WHERE auth_id = auth.uid())
);

-- Referral bonus function: awards 50 GMX to both referrer and referred user
CREATE OR REPLACE FUNCTION award_referral_bonus(p_referrer_uid UUID, p_referred_uid UUID, p_code TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    -- Award 50 GXP to referrer
    UPDATE users SET gxp = COALESCE(gxp, 0) + 50 WHERE id = p_referrer_uid;
    -- Award 50 GXP to referred user
    UPDATE users SET gxp = COALESCE(gxp, 0) + 50 WHERE id = p_referred_uid;
    -- Update referral code stats
    UPDATE referral_codes SET coins_earned = coins_earned + 50 WHERE code = p_code;
END;
$$;

-- Increment functions for referral tracking
CREATE OR REPLACE FUNCTION increment_referral_clicks(p_code TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    UPDATE referral_codes SET clicks = clicks + 1 WHERE code = p_code;
END;
$$;

CREATE OR REPLACE FUNCTION increment_referral_signups(p_code TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    UPDATE referral_codes SET signups = signups + 1 WHERE code = p_code;
END;
$$;

CREATE OR REPLACE FUNCTION increment_referral_purchases(p_code TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    UPDATE referral_codes SET purchases = purchases + 1 WHERE code = p_code;
END;
$$;
