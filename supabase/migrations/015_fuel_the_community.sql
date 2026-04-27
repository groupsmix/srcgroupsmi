-- AUDIT: public
-- =============================================
-- Migration 015: Fuel the Community
-- Complete gamification, virtual currency, tipping,
-- writer levels, badges, challenges, and owner dashboard
-- =============================================

-- ═══════════════════════════════════════
-- 1. USER WALLETS (GMX Coins balance)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    coins_balance INT DEFAULT 0 CHECK (coins_balance >= 0),
    total_earned INT DEFAULT 0,
    total_spent INT DEFAULT 0,
    total_tipped INT DEFAULT 0,
    total_received INT DEFAULT 0,
    total_withdrawn INT DEFAULT 0,
    pending_withdrawal INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON user_wallets(user_id);

-- ═══════════════════════════════════════
-- 2. WALLET TRANSACTIONS (full audit log)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'purchase',       -- bought coins with real money
        'tip_sent',       -- tipped another writer
        'tip_received',   -- received a tip
        'reward',         -- earned from activity (writing, likes, etc.)
        'challenge_bonus',-- earned from weekly challenge
        'withdrawal',     -- cashed out
        'refund',         -- refunded purchase
        'admin_credit',   -- admin gave coins
        'admin_debit'     -- admin removed coins
    )),
    amount INT NOT NULL,
    balance_after INT NOT NULL DEFAULT 0,
    reference_id TEXT DEFAULT '',
    reference_type TEXT DEFAULT '',
    description TEXT DEFAULT '',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON wallet_transactions(created_at DESC);

-- ═══════════════════════════════════════
-- 3. COIN PACKAGES (purchasable)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS coin_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    coins INT NOT NULL,
    bonus_coins INT DEFAULT 0,
    price_usd NUMERIC(10,2) NOT NULL,
    lemon_product_id TEXT DEFAULT '',
    lemon_variant_id TEXT DEFAULT '',
    sort_order INT DEFAULT 0,
    is_popular BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default coin packages
INSERT INTO coin_packages (name, coins, bonus_coins, price_usd, sort_order, is_popular) VALUES
    ('Starter', 100, 0, 1.00, 1, false),
    ('Popular', 550, 50, 5.00, 2, true),
    ('Value', 1200, 200, 10.00, 3, false),
    ('Premium', 3500, 1000, 25.00, 4, false),
    ('Elite', 8000, 3000, 50.00, 5, false)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════
-- 4. TIPS (article/writer tips)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS tips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
    tip_type TEXT NOT NULL DEFAULT 'coffee' CHECK (tip_type IN ('super_like', 'coffee', 'fire', 'diamond')),
    coins_amount INT NOT NULL CHECK (coins_amount > 0),
    message TEXT DEFAULT '',
    is_anonymous BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tips_sender ON tips(sender_id);
CREATE INDEX IF NOT EXISTS idx_tips_receiver ON tips(receiver_id);
CREATE INDEX IF NOT EXISTS idx_tips_article ON tips(article_id);
CREATE INDEX IF NOT EXISTS idx_tips_created ON tips(created_at DESC);

-- ═══════════════════════════════════════
-- 5. WRITER BADGES (detailed badge system)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS writer_badge_definitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_ar TEXT DEFAULT '',
    description TEXT DEFAULT '',
    description_ar TEXT DEFAULT '',
    icon TEXT DEFAULT '',
    color TEXT DEFAULT '#6C63FF',
    category TEXT DEFAULT 'achievement' CHECK (category IN ('achievement', 'milestone', 'special', 'community')),
    requirement_type TEXT DEFAULT 'manual',
    requirement_value INT DEFAULT 0,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed badge definitions
INSERT INTO writer_badge_definitions (id, name, name_ar, description, description_ar, icon, color, category, requirement_type, requirement_value, sort_order) VALUES
    ('first_article', 'First Article', 'أول مقال', 'Published your first article', 'نشرت أول مقال لك', 'pencil', '#10B981', 'milestone', 'articles_count', 1, 1),
    ('prolific_writer', 'Prolific Writer', 'كاتب غزير', 'Published 10+ articles', 'نشرت 10+ مقالات', 'book-open', '#8B5CF6', 'milestone', 'articles_count', 10, 2),
    ('popular_writer', 'Popular Writer', 'كاتب مشهور', 'Received 50+ total likes', 'حصلت على 50+ إعجاب', 'heart', '#EC4899', 'milestone', 'total_likes', 50, 3),
    ('viral_author', 'Viral Author', 'كاتب فيروسي', 'Reached 1000+ total views', 'وصلت إلى 1000+ مشاهدة', 'eye', '#F59E0B', 'milestone', 'total_views', 1000, 4),
    ('rising_star', 'Rising Star', 'نجم صاعد', '5+ articles with avg 10+ likes', 'مقالات بمعدل 10+ إعجاب', 'star', '#6366F1', 'achievement', 'avg_likes', 10, 5),
    ('trending_star', 'Trending Star', 'نجم الترند', 'Had an article reach Trending', 'مقالك وصل للترند', 'trending-up', '#F43F5E', 'achievement', 'trending_count', 1, 6),
    ('trusted_author', 'Trusted Author', 'كاتب موثوق', 'High trust score — auto-publish', 'نقاط ثقة عالية - نشر تلقائي', 'shield', '#059669', 'special', 'trust_score', 90, 7),
    ('ai_pioneer', 'AI Pioneer', 'رائد الذكاء', 'Used AI Writing Assistant 10+ times', 'استخدمت مساعد الكتابة 10+ مرات', 'cpu', '#7C3AED', 'achievement', 'ai_usage_count', 10, 8),
    ('top_contributor', 'Top Contributor', 'أفضل مساهم', 'Most active writer this month', 'الأكثر نشاطاً هذا الشهر', 'award', '#D97706', 'special', 'manual', 0, 9),
    ('community_supporter', 'Community Supporter', 'داعم المجتمع', 'Tipped other writers 10+ times', 'دعمت كتّاب آخرين 10+ مرات', 'gift', '#0EA5E9', 'community', 'tips_sent_count', 10, 10),
    ('early_bird', 'Early Bird', 'الطائر المبكر', 'Among first to publish in a challenge', 'من أوائل المشاركين في تحدي', 'sunrise', '#F97316', 'special', 'manual', 0, 11),
    ('master_writer', 'Master Writer', 'كاتب محترف', 'Published 50+ articles', 'نشرت 50+ مقال', 'crown', '#EAB308', 'milestone', 'articles_count', 50, 12),
    ('engagement_king', 'Engagement King', 'ملك التفاعل', '500+ total comments on your articles', 'حصلت على 500+ تعليق إجمالي', 'message-circle', '#14B8A6', 'milestone', 'total_comments', 500, 13),
    ('top_fueled', 'Top Fueled Author', 'كاتب مدعوم', 'Received 1000+ coins from tips', 'حصلت على 1000+ عملة من الدعم', 'zap', '#FF6B35', 'community', 'total_tips_received', 1000, 14)
ON CONFLICT (id) DO NOTHING;

-- User-badge assignment table
CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id TEXT NOT NULL REFERENCES writer_badge_definitions(id) ON DELETE CASCADE,
    awarded_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}',
    UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id);

-- ═══════════════════════════════════════
-- 6. WRITER LEVELS (extended level system)
-- ═══════════════════════════════════════
ALTER TABLE users ADD COLUMN IF NOT EXISTS writer_level TEXT DEFAULT 'newcomer';
ALTER TABLE users ADD COLUMN IF NOT EXISTS writer_xp INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_tips_sent INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_tips_received INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_coins_earned INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_usage_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trending_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS badge_count INT DEFAULT 0;

-- ═══════════════════════════════════════
-- 7. WEEKLY CHALLENGES
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS weekly_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    title_ar TEXT DEFAULT '',
    description TEXT DEFAULT '',
    description_ar TEXT DEFAULT '',
    challenge_type TEXT DEFAULT 'write' CHECK (challenge_type IN ('write', 'engage', 'category', 'streak')),
    target_category TEXT DEFAULT '',
    required_count INT DEFAULT 1,
    reward_coins INT DEFAULT 50,
    reward_xp INT DEFAULT 20,
    reward_badge TEXT DEFAULT '',
    max_participants INT DEFAULT 0,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'ended')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_challenges_status ON weekly_challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_dates ON weekly_challenges(starts_at, ends_at);

CREATE TABLE IF NOT EXISTS challenge_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID NOT NULL REFERENCES weekly_challenges(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    progress INT DEFAULT 0,
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    reward_claimed BOOLEAN DEFAULT false,
    joined_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_challenge ON challenge_participants(challenge_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON challenge_participants(user_id);

-- ═══════════════════════════════════════
-- 8. WITHDRAWAL REQUESTS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coins_amount INT NOT NULL CHECK (coins_amount >= 1000),
    usd_amount NUMERIC(10,2) NOT NULL,
    payment_method TEXT DEFAULT 'paypal' CHECK (payment_method IN ('paypal', 'wise', 'crypto')),
    payment_details JSONB DEFAULT '{}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
    admin_note TEXT DEFAULT '',
    processed_at TIMESTAMPTZ,
    processed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawal_requests(status);

-- ═══════════════════════════════════════
-- 9. PLATFORM STATS (for owner dashboard)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS platform_daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stat_date DATE NOT NULL UNIQUE DEFAULT CURRENT_DATE,
    new_users INT DEFAULT 0,
    new_articles INT DEFAULT 0,
    total_views INT DEFAULT 0,
    total_likes INT DEFAULT 0,
    total_comments INT DEFAULT 0,
    total_tips INT DEFAULT 0,
    total_coins_purchased INT DEFAULT 0,
    total_revenue_cents INT DEFAULT 0,
    active_writers INT DEFAULT 0,
    active_readers INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON platform_daily_stats(stat_date DESC);

-- ═══════════════════════════════════════
-- 10. RPC FUNCTIONS
-- ═══════════════════════════════════════

-- Initialize wallet for user (idempotent)
CREATE OR REPLACE FUNCTION ensure_user_wallet(p_user_id UUID)
RETURNS user_wallets
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_wallet user_wallets;
BEGIN
    SELECT * INTO v_wallet FROM user_wallets WHERE user_id = p_user_id;
    IF NOT FOUND THEN
        INSERT INTO user_wallets (user_id) VALUES (p_user_id) RETURNING * INTO v_wallet;
    END IF;
    RETURN v_wallet;
END;
$$;

-- Credit coins to wallet (from purchase or reward)
CREATE OR REPLACE FUNCTION credit_coins(
    p_user_id UUID,
    p_amount INT,
    p_type TEXT,
    p_description TEXT DEFAULT '',
    p_reference_id TEXT DEFAULT '',
    p_reference_type TEXT DEFAULT '',
    p_metadata JSONB DEFAULT '{}'
)
RETURNS wallet_transactions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_wallet user_wallets;
    v_txn wallet_transactions;
BEGIN
    -- Ensure wallet exists
    PERFORM ensure_user_wallet(p_user_id);

    -- Update balance
    UPDATE user_wallets
    SET coins_balance = coins_balance + p_amount,
        total_earned = total_earned + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING * INTO v_wallet;

    -- Create transaction
    INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reference_id, reference_type, description, metadata)
    VALUES (p_user_id, p_type, p_amount, v_wallet.coins_balance, p_reference_id, p_reference_type, p_description, p_metadata)
    RETURNING * INTO v_txn;

    RETURN v_txn;
END;
$$;

-- Debit coins from wallet
CREATE OR REPLACE FUNCTION debit_coins(
    p_user_id UUID,
    p_amount INT,
    p_type TEXT,
    p_description TEXT DEFAULT '',
    p_reference_id TEXT DEFAULT '',
    p_reference_type TEXT DEFAULT '',
    p_metadata JSONB DEFAULT '{}'
)
RETURNS wallet_transactions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_wallet user_wallets;
    v_txn wallet_transactions;
BEGIN
    -- Ensure wallet exists
    PERFORM ensure_user_wallet(p_user_id);

    -- Check balance
    SELECT * INTO v_wallet FROM user_wallets WHERE user_id = p_user_id;
    IF v_wallet.coins_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance: have %, need %', v_wallet.coins_balance, p_amount;
    END IF;

    -- Debit
    UPDATE user_wallets
    SET coins_balance = coins_balance - p_amount,
        total_spent = total_spent + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING * INTO v_wallet;

    -- Create transaction
    INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reference_id, reference_type, description, metadata)
    VALUES (p_user_id, p_type, -p_amount, v_wallet.coins_balance, p_reference_id, p_reference_type, p_description, p_metadata)
    RETURNING * INTO v_txn;

    RETURN v_txn;
END;
$$;

-- Send tip from one user to another
CREATE OR REPLACE FUNCTION send_tip(
    p_sender_id UUID,
    p_receiver_id UUID,
    p_article_id UUID,
    p_tip_type TEXT,
    p_coins_amount INT,
    p_message TEXT DEFAULT '',
    p_is_anonymous BOOLEAN DEFAULT false
)
RETURNS tips
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_sender_wallet user_wallets;
    v_tip tips;
    v_tip_names JSONB := '{"super_like": "Super Like", "coffee": "Coffee", "fire": "Fire Tip", "diamond": "Diamond Tip"}'::JSONB;
BEGIN
    IF p_sender_id = p_receiver_id THEN
        RAISE EXCEPTION 'Cannot tip yourself';
    END IF;

    -- Check sender balance
    SELECT * INTO v_sender_wallet FROM user_wallets WHERE user_id = p_sender_id;
    IF v_sender_wallet IS NULL OR v_sender_wallet.coins_balance < p_coins_amount THEN
        RAISE EXCEPTION 'Insufficient coins balance';
    END IF;

    -- Debit sender
    UPDATE user_wallets
    SET coins_balance = coins_balance - p_coins_amount,
        total_spent = total_spent + p_coins_amount,
        total_tipped = total_tipped + p_coins_amount,
        updated_at = now()
    WHERE user_id = p_sender_id;

    -- Credit receiver
    PERFORM ensure_user_wallet(p_receiver_id);
    UPDATE user_wallets
    SET coins_balance = coins_balance + p_coins_amount,
        total_earned = total_earned + p_coins_amount,
        total_received = total_received + p_coins_amount,
        updated_at = now()
    WHERE user_id = p_receiver_id;

    -- Create tip record
    INSERT INTO tips (sender_id, receiver_id, article_id, tip_type, coins_amount, message, is_anonymous)
    VALUES (p_sender_id, p_receiver_id, p_article_id, p_tip_type, p_coins_amount, p_message, p_is_anonymous)
    RETURNING * INTO v_tip;

    -- Transaction logs
    INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reference_id, reference_type, description, metadata)
    VALUES (
        p_sender_id, 'tip_sent', -p_coins_amount,
        (SELECT coins_balance FROM user_wallets WHERE user_id = p_sender_id),
        v_tip.id::TEXT, 'tip',
        'Tipped ' || (v_tip_names->>p_tip_type) || ' to writer',
        jsonb_build_object('receiver_id', p_receiver_id, 'article_id', p_article_id, 'tip_type', p_tip_type)
    );

    INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reference_id, reference_type, description, metadata)
    VALUES (
        p_receiver_id, 'tip_received', p_coins_amount,
        (SELECT coins_balance FROM user_wallets WHERE user_id = p_receiver_id),
        v_tip.id::TEXT, 'tip',
        'Received ' || (v_tip_names->>p_tip_type) || ' tip',
        jsonb_build_object('sender_id', CASE WHEN p_is_anonymous THEN NULL ELSE p_sender_id END, 'article_id', p_article_id, 'tip_type', p_tip_type)
    );

    -- Update user stats
    UPDATE users SET total_tips_sent = COALESCE(total_tips_sent, 0) + 1 WHERE id = p_sender_id;
    UPDATE users SET total_tips_received = COALESCE(total_tips_received, 0) + 1, total_coins_earned = COALESCE(total_coins_earned, 0) + p_coins_amount WHERE id = p_receiver_id;

    RETURN v_tip;
END;
$$;

-- Award writer XP with level calculation
CREATE OR REPLACE FUNCTION award_writer_xp(p_user_id UUID, p_xp INT, p_reason TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_new_xp INT;
    v_old_level TEXT;
    v_new_level TEXT;
    v_level_changed BOOLEAN := false;
BEGIN
    SELECT writer_xp, writer_level INTO v_new_xp, v_old_level FROM users WHERE id = p_user_id;
    v_new_xp := COALESCE(v_new_xp, 0) + p_xp;

    -- Calculate writer level
    v_new_level := CASE
        WHEN v_new_xp >= 1000 THEN 'elite'
        WHEN v_new_xp >= 500 THEN 'star_writer'
        WHEN v_new_xp >= 200 THEN 'author'
        WHEN v_new_xp >= 50 THEN 'contributor'
        ELSE 'newcomer'
    END;

    v_level_changed := v_old_level IS DISTINCT FROM v_new_level;

    UPDATE users SET writer_xp = v_new_xp, writer_level = v_new_level WHERE id = p_user_id;

    -- Also add to GXP
    BEGIN
        PERFORM add_gxp(p_user_id, p_xp);
    EXCEPTION WHEN OTHERS THEN
        -- If add_gxp fails (auth check), update GXP directly
        UPDATE users SET gxp = COALESCE(gxp, 0) + p_xp WHERE id = p_user_id;
    END;

    RETURN jsonb_build_object(
        'new_xp', v_new_xp,
        'new_level', v_new_level,
        'old_level', v_old_level,
        'level_changed', v_level_changed,
        'xp_awarded', p_xp
    );
END;
$$;

-- Check and award badges
CREATE OR REPLACE FUNCTION check_writer_badges(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_new_badges TEXT[] := '{}';
    v_article_count INT;
    v_total_likes INT;
    v_total_views INT;
    v_total_comments INT;
    v_tips_sent INT;
    v_tips_received_coins INT;
    v_ai_count INT;
    v_trending_count INT;
    v_badge RECORD;
BEGIN
    -- Gather user stats
    SELECT COUNT(*), COALESCE(SUM(like_count), 0), COALESCE(SUM(views), 0), COALESCE(SUM(comment_count), 0)
    INTO v_article_count, v_total_likes, v_total_views, v_total_comments
    FROM articles WHERE user_id = (SELECT auth_id FROM users WHERE id = p_user_id) AND status = 'published';

    SELECT COALESCE(total_tips_sent, 0), COALESCE(total_coins_earned, 0), COALESCE(ai_usage_count, 0), COALESCE(trending_count, 0)
    INTO v_tips_sent, v_tips_received_coins, v_ai_count, v_trending_count
    FROM users WHERE id = p_user_id;

    -- Check each badge definition
    FOR v_badge IN SELECT * FROM writer_badge_definitions WHERE is_active = true AND requirement_type != 'manual' LOOP
        -- Skip already awarded
        IF EXISTS (SELECT 1 FROM user_badges WHERE user_id = p_user_id AND badge_id = v_badge.id) THEN
            CONTINUE;
        END IF;

        -- Check requirement
        IF (v_badge.requirement_type = 'articles_count' AND v_article_count >= v_badge.requirement_value) OR
           (v_badge.requirement_type = 'total_likes' AND v_total_likes >= v_badge.requirement_value) OR
           (v_badge.requirement_type = 'total_views' AND v_total_views >= v_badge.requirement_value) OR
           (v_badge.requirement_type = 'total_comments' AND v_total_comments >= v_badge.requirement_value) OR
           (v_badge.requirement_type = 'tips_sent_count' AND v_tips_sent >= v_badge.requirement_value) OR
           (v_badge.requirement_type = 'total_tips_received' AND v_tips_received_coins >= v_badge.requirement_value) OR
           (v_badge.requirement_type = 'ai_usage_count' AND v_ai_count >= v_badge.requirement_value) OR
           (v_badge.requirement_type = 'trending_count' AND v_trending_count >= v_badge.requirement_value) OR
           (v_badge.requirement_type = 'avg_likes' AND v_article_count >= 5 AND (v_total_likes / GREATEST(v_article_count, 1)) >= v_badge.requirement_value)
        THEN
            INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, v_badge.id) ON CONFLICT DO NOTHING;
            v_new_badges := v_new_badges || v_badge.id;
        END IF;
    END LOOP;

    -- Update badge count
    UPDATE users SET badge_count = (SELECT COUNT(*) FROM user_badges WHERE user_id = p_user_id) WHERE id = p_user_id;

    RETURN jsonb_build_object('new_badges', v_new_badges, 'total_badges', (SELECT COUNT(*) FROM user_badges WHERE user_id = p_user_id));
END;
$$;

-- Get writer profile with all gamification data
CREATE OR REPLACE FUNCTION get_writer_profile(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user RECORD;
    v_wallet RECORD;
    v_badges JSONB;
    v_stats JSONB;
    v_recent_tips JSONB;
BEGIN
    SELECT * INTO v_user FROM users WHERE id = p_user_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT * INTO v_wallet FROM user_wallets WHERE user_id = p_user_id;

    SELECT jsonb_agg(jsonb_build_object('badge_id', ub.badge_id, 'awarded_at', ub.awarded_at, 'name', bd.name, 'name_ar', bd.name_ar, 'description', bd.description, 'icon', bd.icon, 'color', bd.color, 'category', bd.category))
    INTO v_badges
    FROM user_badges ub JOIN writer_badge_definitions bd ON ub.badge_id = bd.id
    WHERE ub.user_id = p_user_id ORDER BY ub.awarded_at DESC;

    SELECT jsonb_build_object(
        'total_articles', (SELECT COUNT(*) FROM articles WHERE user_id = v_user.auth_id AND status = 'published'),
        'total_views', COALESCE((SELECT SUM(views) FROM articles WHERE user_id = v_user.auth_id AND status = 'published'), 0),
        'total_likes', COALESCE((SELECT SUM(like_count) FROM articles WHERE user_id = v_user.auth_id AND status = 'published'), 0),
        'total_comments', COALESCE((SELECT SUM(comment_count) FROM articles WHERE user_id = v_user.auth_id AND status = 'published'), 0),
        'total_shares', COALESCE((SELECT SUM(share_count) FROM articles WHERE user_id = v_user.auth_id AND status = 'published'), 0)
    ) INTO v_stats;

    SELECT jsonb_agg(row_to_json(t)) INTO v_recent_tips
    FROM (
        SELECT t.tip_type, t.coins_amount, t.created_at, t.is_anonymous,
            CASE WHEN t.is_anonymous THEN 'Anonymous' ELSE (SELECT display_name FROM users WHERE id = t.sender_id) END as sender_name
        FROM tips t WHERE t.receiver_id = p_user_id ORDER BY t.created_at DESC LIMIT 10
    ) t;

    RETURN jsonb_build_object(
        'user', row_to_json(v_user),
        'wallet', CASE WHEN v_wallet IS NOT NULL THEN row_to_json(v_wallet) ELSE '{}'::JSONB END,
        'badges', COALESCE(v_badges, '[]'::JSONB),
        'stats', v_stats,
        'recent_tips', COALESCE(v_recent_tips, '[]'::JSONB),
        'writer_level', v_user.writer_level,
        'writer_xp', v_user.writer_xp
    );
END;
$$;

-- Get owner dashboard stats
CREATE OR REPLACE FUNCTION get_owner_dashboard(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_result JSONB;
    v_since TIMESTAMPTZ := now() - (p_days || ' days')::INTERVAL;
BEGIN
    SELECT jsonb_build_object(
        'overview', jsonb_build_object(
            'total_users', (SELECT COUNT(*) FROM users),
            'total_articles', (SELECT COUNT(*) FROM articles WHERE status = 'published'),
            'total_views', COALESCE((SELECT SUM(views) FROM articles), 0),
            'total_likes', COALESCE((SELECT SUM(like_count) FROM articles), 0),
            'total_comments', COALESCE((SELECT SUM(comment_count) FROM articles), 0),
            'total_tips', (SELECT COUNT(*) FROM tips),
            'total_coins_in_circulation', COALESCE((SELECT SUM(coins_balance) FROM user_wallets), 0),
            'total_revenue_cents', COALESCE((SELECT SUM(price) FROM purchases WHERE status = 'paid'), 0)
        ),
        'period', jsonb_build_object(
            'new_users', (SELECT COUNT(*) FROM users WHERE created_at >= v_since),
            'new_articles', (SELECT COUNT(*) FROM articles WHERE status = 'published' AND published_at >= v_since),
            'period_views', COALESCE((SELECT SUM(views) FROM articles WHERE published_at >= v_since), 0),
            'period_tips', (SELECT COUNT(*) FROM tips WHERE created_at >= v_since),
            'period_coins_purchased', COALESCE((SELECT SUM(amount) FROM wallet_transactions WHERE type = 'purchase' AND created_at >= v_since), 0),
            'active_writers', (SELECT COUNT(DISTINCT user_id) FROM articles WHERE published_at >= v_since AND user_id IS NOT NULL),
            'period_revenue_cents', COALESCE((SELECT SUM(price) FROM purchases WHERE status = 'paid' AND created_at >= v_since), 0)
        ),
        'top_writers', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) FROM (
            SELECT u.id, u.display_name, u.photo_url, u.writer_level, u.writer_xp, u.badge_count,
                   COUNT(a.id) as article_count, COALESCE(SUM(a.like_count), 0) as total_likes, COALESCE(SUM(a.views), 0) as total_views
            FROM users u LEFT JOIN articles a ON a.user_id = u.auth_id AND a.status = 'published'
            GROUP BY u.id ORDER BY total_views DESC LIMIT 10
        ) t),
        'top_articles', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) FROM (
            SELECT id, title, slug, like_count, comment_count, views, share_count, author_name, published_at
            FROM articles WHERE status = 'published' ORDER BY (COALESCE(like_count,0)*2 + COALESCE(comment_count,0)*3 + COALESCE(views,0)*0.1) DESC LIMIT 10
        ) t),
        'top_categories', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) FROM (
            SELECT category, COUNT(*) as count, COALESCE(SUM(views), 0) as total_views
            FROM articles WHERE status = 'published' GROUP BY category ORDER BY total_views DESC LIMIT 10
        ) t),
        'daily_stats', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) FROM (
            SELECT * FROM platform_daily_stats WHERE stat_date >= (CURRENT_DATE - p_days) ORDER BY stat_date
        ) t),
        'pending_withdrawals', (SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'pending'),
        'pending_articles', (SELECT COUNT(*) FROM articles WHERE moderation_status = 'pending'),
        'active_challenges', (SELECT COUNT(*) FROM weekly_challenges WHERE status = 'active')
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- Get active and upcoming challenges
CREATE OR REPLACE FUNCTION get_challenges(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'active', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) FROM (
            SELECT c.*,
                (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = c.id) as participant_count,
                CASE WHEN p_user_id IS NOT NULL THEN
                    (SELECT row_to_json(cp) FROM challenge_participants cp WHERE cp.challenge_id = c.id AND cp.user_id = p_user_id)
                ELSE NULL END as my_participation
            FROM weekly_challenges c WHERE c.status = 'active' AND c.ends_at > now() ORDER BY c.ends_at ASC
        ) t),
        'upcoming', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) FROM (
            SELECT c.*, (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = c.id) as participant_count
            FROM weekly_challenges c WHERE c.status = 'upcoming' AND c.starts_at > now() ORDER BY c.starts_at ASC LIMIT 5
        ) t),
        'completed', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) FROM (
            SELECT c.*, (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = c.id) as participant_count,
                CASE WHEN p_user_id IS NOT NULL THEN
                    (SELECT row_to_json(cp) FROM challenge_participants cp WHERE cp.challenge_id = c.id AND cp.user_id = p_user_id)
                ELSE NULL END as my_participation
            FROM weekly_challenges c WHERE c.status = 'ended' ORDER BY c.ends_at DESC LIMIT 10
        ) t)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- Join a challenge
CREATE OR REPLACE FUNCTION join_challenge(p_user_id UUID, p_challenge_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_challenge weekly_challenges;
    v_count INT;
BEGIN
    SELECT * INTO v_challenge FROM weekly_challenges WHERE id = p_challenge_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Challenge not found'); END IF;
    IF v_challenge.status != 'active' THEN RETURN jsonb_build_object('error', 'Challenge is not active'); END IF;

    IF v_challenge.max_participants > 0 THEN
        SELECT COUNT(*) INTO v_count FROM challenge_participants WHERE challenge_id = p_challenge_id;
        IF v_count >= v_challenge.max_participants THEN RETURN jsonb_build_object('error', 'Challenge is full'); END IF;
    END IF;

    INSERT INTO challenge_participants (challenge_id, user_id)
    VALUES (p_challenge_id, p_user_id)
    ON CONFLICT (challenge_id, user_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'message', 'Joined challenge');
END;
$$;

-- Get leaderboard with writer levels and badges
CREATE OR REPLACE FUNCTION get_fuel_leaderboard(p_type TEXT DEFAULT 'xp', p_limit INT DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF p_type = 'tips' THEN
        RETURN (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) FROM (
            SELECT u.id, u.display_name, u.photo_url, u.writer_level, u.writer_xp, u.badge_count,
                   COALESCE(w.total_received, 0) as total_received,
                   COALESCE(u.total_tips_received, 0) as tips_count
            FROM users u LEFT JOIN user_wallets w ON w.user_id = u.id
            WHERE COALESCE(w.total_received, 0) > 0
            ORDER BY w.total_received DESC NULLS LAST LIMIT p_limit
        ) t);
    ELSIF p_type = 'articles' THEN
        RETURN (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) FROM (
            SELECT u.id, u.display_name, u.photo_url, u.writer_level, u.writer_xp, u.badge_count,
                   COALESCE(u.article_count, 0) as article_count
            FROM users u WHERE COALESCE(u.article_count, 0) > 0
            ORDER BY u.article_count DESC LIMIT p_limit
        ) t);
    ELSE
        RETURN (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) FROM (
            SELECT u.id, u.display_name, u.photo_url, u.writer_level, u.writer_xp, u.badge_count, u.gxp
            FROM users u ORDER BY u.writer_xp DESC NULLS LAST LIMIT p_limit
        ) t);
    END IF;
END;
$$;

-- ═══════════════════════════════════════
-- 11. RLS POLICIES
-- ═══════════════════════════════════════

-- user_wallets: users see own wallet
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallets_own ON user_wallets;
CREATE POLICY wallets_own ON user_wallets FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
DROP POLICY IF EXISTS wallets_admin ON user_wallets;
CREATE POLICY wallets_admin ON user_wallets FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('admin')));

-- wallet_transactions: users see own
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS txn_own ON wallet_transactions;
CREATE POLICY txn_own ON wallet_transactions FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
DROP POLICY IF EXISTS txn_admin ON wallet_transactions;
CREATE POLICY txn_admin ON wallet_transactions FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('admin')));

-- coin_packages: public read
ALTER TABLE coin_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS packages_read ON coin_packages;
CREATE POLICY packages_read ON coin_packages FOR SELECT USING (true);
DROP POLICY IF EXISTS packages_admin ON coin_packages;
CREATE POLICY packages_admin ON coin_packages FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('admin')));

-- tips: public read (for display), users create own
ALTER TABLE tips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tips_read ON tips;
CREATE POLICY tips_read ON tips FOR SELECT USING (true);
DROP POLICY IF EXISTS tips_insert ON tips;
CREATE POLICY tips_insert ON tips FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- writer_badge_definitions: public read
ALTER TABLE writer_badge_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS badge_defs_read ON writer_badge_definitions;
CREATE POLICY badge_defs_read ON writer_badge_definitions FOR SELECT USING (true);
DROP POLICY IF EXISTS badge_defs_admin ON writer_badge_definitions;
CREATE POLICY badge_defs_admin ON writer_badge_definitions FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('admin')));

-- user_badges: public read
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_badges_read ON user_badges;
CREATE POLICY user_badges_read ON user_badges FOR SELECT USING (true);

-- weekly_challenges: public read
ALTER TABLE weekly_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS challenges_read ON weekly_challenges;
CREATE POLICY challenges_read ON weekly_challenges FOR SELECT USING (true);
DROP POLICY IF EXISTS challenges_admin ON weekly_challenges;
CREATE POLICY challenges_admin ON weekly_challenges FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('admin')));

-- challenge_participants: users manage own
ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS participants_read ON challenge_participants;
CREATE POLICY participants_read ON challenge_participants FOR SELECT USING (true);
DROP POLICY IF EXISTS participants_own ON challenge_participants;
CREATE POLICY participants_own ON challenge_participants FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- withdrawal_requests: users see own, admin manages all
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS withdrawals_own ON withdrawal_requests;
CREATE POLICY withdrawals_own ON withdrawal_requests FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
DROP POLICY IF EXISTS withdrawals_insert ON withdrawal_requests;
CREATE POLICY withdrawals_insert ON withdrawal_requests FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
DROP POLICY IF EXISTS withdrawals_admin ON withdrawal_requests;
CREATE POLICY withdrawals_admin ON withdrawal_requests FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('admin')));

-- platform_daily_stats: admin only
ALTER TABLE platform_daily_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_stats_admin ON platform_daily_stats;
CREATE POLICY daily_stats_admin ON platform_daily_stats FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('admin')));

-- ═══════════════════════════════════════
-- 12. TRIGGERS: Auto-award XP on actions
-- ═══════════════════════════════════════

-- Award XP when article is published
CREATE OR REPLACE FUNCTION trg_article_xp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status != 'published') THEN
        SELECT id INTO v_user_id FROM users WHERE auth_id = NEW.user_id;
        IF v_user_id IS NOT NULL THEN
            PERFORM award_writer_xp(v_user_id, 10, 'Published article: ' || LEFT(NEW.title, 50));
            -- Credit small coin reward
            PERFORM credit_coins(v_user_id, 5, 'reward', 'Published article reward', NEW.id::TEXT, 'article');
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_article_publish_xp ON articles;
CREATE TRIGGER trg_article_publish_xp
    AFTER INSERT OR UPDATE OF status ON articles
    FOR EACH ROW EXECUTE FUNCTION trg_article_xp();

-- Auto-update challenge status
CREATE OR REPLACE FUNCTION update_challenge_statuses()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE weekly_challenges SET status = 'active' WHERE status = 'upcoming' AND starts_at <= now();
    UPDATE weekly_challenges SET status = 'ended' WHERE status = 'active' AND ends_at <= now();
END;
$$;

-- Seed some initial challenges
INSERT INTO weekly_challenges (title, title_ar, description, description_ar, challenge_type, required_count, reward_coins, reward_xp, starts_at, ends_at, status) VALUES
    ('Write Your First Article', 'اكتب مقالك الأول', 'Publish your first article this week and earn bonus rewards!', 'انشر أول مقال لك هذا الأسبوع واحصل على مكافآت إضافية!', 'write', 1, 50, 20, now(), now() + INTERVAL '7 days', 'active'),
    ('Crypto Writer Challenge', 'تحدي كاتب الكريبتو', 'Write an article about Crypto & Web3 this week', 'اكتب مقال عن الكريبتو والويب3 هذا الأسبوع', 'category', 1, 75, 30, now(), now() + INTERVAL '7 days', 'active'),
    ('Engagement Marathon', 'ماراثون التفاعل', 'Like and comment on 10 articles this week', 'أعجب وعلق على 10 مقالات هذا الأسبوع', 'engage', 10, 40, 15, now(), now() + INTERVAL '7 days', 'active')
ON CONFLICT DO NOTHING;
