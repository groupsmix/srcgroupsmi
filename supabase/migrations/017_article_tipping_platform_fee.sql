-- =============================================
-- Migration 017: Article Tipping with Platform Fee
-- Adds 20% platform fee to tips, tip stats on articles,
-- and platform revenue tracking
-- =============================================

-- ═══════════════════════════════════════
-- 1. ADD TIP STATS TO ARTICLES
-- ═══════════════════════════════════════
ALTER TABLE articles ADD COLUMN IF NOT EXISTS tip_count INT DEFAULT 0;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS tip_total INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_articles_tip_total ON articles(tip_total DESC) WHERE tip_total > 0;

-- ═══════════════════════════════════════
-- 2. PLATFORM FEE CONFIG TABLE
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS platform_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO platform_config (key, value, description) VALUES
    ('tip_fee_percent', '20', 'Platform fee percentage on tips (0-100)')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS config_read ON platform_config;
CREATE POLICY config_read ON platform_config FOR SELECT USING (true);

DROP POLICY IF EXISTS config_admin ON platform_config;
CREATE POLICY config_admin ON platform_config FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin'));

-- ═══════════════════════════════════════
-- 3. PLATFORM REVENUE LOG
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS platform_revenue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL DEFAULT 'tip_fee',
    amount INT NOT NULL,
    reference_id TEXT DEFAULT '',
    reference_type TEXT DEFAULT '',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenue_source ON platform_revenue(source);
CREATE INDEX IF NOT EXISTS idx_revenue_created ON platform_revenue(created_at DESC);

ALTER TABLE platform_revenue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS revenue_admin ON platform_revenue;
CREATE POLICY revenue_admin ON platform_revenue FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin'));

-- ═══════════════════════════════════════
-- 4. ADD platform_fee COLUMN TO tips TABLE
-- ═══════════════════════════════════════
ALTER TABLE tips ADD COLUMN IF NOT EXISTS platform_fee INT DEFAULT 0;
ALTER TABLE tips ADD COLUMN IF NOT EXISTS author_received INT DEFAULT 0;

-- ═══════════════════════════════════════
-- 5. REPLACE send_tip WITH FEE LOGIC
-- ═══════════════════════════════════════
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
    v_fee_percent INT;
    v_fee_amount INT;
    v_author_amount INT;
BEGIN
    IF p_sender_id = p_receiver_id THEN
        RAISE EXCEPTION 'Cannot tip yourself';
    END IF;

    -- Get platform fee percentage from config
    SELECT COALESCE(value::INT, 20) INTO v_fee_percent
    FROM platform_config WHERE key = 'tip_fee_percent';
    IF v_fee_percent IS NULL THEN v_fee_percent := 20; END IF;

    -- Calculate fee and author amounts
    v_fee_amount := GREATEST(FLOOR(p_coins_amount * v_fee_percent / 100.0)::INT, 0);
    v_author_amount := p_coins_amount - v_fee_amount;

    -- Check sender balance
    SELECT * INTO v_sender_wallet FROM user_wallets WHERE user_id = p_sender_id;
    IF v_sender_wallet IS NULL OR v_sender_wallet.coins_balance < p_coins_amount THEN
        RAISE EXCEPTION 'Insufficient coins balance';
    END IF;

    -- Debit sender (full amount)
    UPDATE user_wallets
    SET coins_balance = coins_balance - p_coins_amount,
        total_spent = total_spent + p_coins_amount,
        total_tipped = total_tipped + p_coins_amount,
        updated_at = now()
    WHERE user_id = p_sender_id;

    -- Credit receiver (amount minus fee)
    PERFORM ensure_user_wallet(p_receiver_id);
    UPDATE user_wallets
    SET coins_balance = coins_balance + v_author_amount,
        total_earned = total_earned + v_author_amount,
        total_received = total_received + v_author_amount,
        updated_at = now()
    WHERE user_id = p_receiver_id;

    -- Create tip record with fee info
    INSERT INTO tips (sender_id, receiver_id, article_id, tip_type, coins_amount, message, is_anonymous, platform_fee, author_received)
    VALUES (p_sender_id, p_receiver_id, p_article_id, p_tip_type, p_coins_amount, p_message, p_is_anonymous, v_fee_amount, v_author_amount)
    RETURNING * INTO v_tip;

    -- Transaction log: sender (full amount debited)
    INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reference_id, reference_type, description, metadata)
    VALUES (
        p_sender_id, 'tip_sent', -p_coins_amount,
        (SELECT coins_balance FROM user_wallets WHERE user_id = p_sender_id),
        v_tip.id::TEXT, 'tip',
        'Tipped ' || (v_tip_names->>p_tip_type) || ' to writer',
        jsonb_build_object('receiver_id', p_receiver_id, 'article_id', p_article_id, 'tip_type', p_tip_type, 'fee', v_fee_amount)
    );

    -- Transaction log: receiver (amount after fee)
    INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reference_id, reference_type, description, metadata)
    VALUES (
        p_receiver_id, 'tip_received', v_author_amount,
        (SELECT coins_balance FROM user_wallets WHERE user_id = p_receiver_id),
        v_tip.id::TEXT, 'tip',
        'Received ' || (v_tip_names->>p_tip_type) || ' tip (' || v_author_amount || ' coins after ' || v_fee_percent || '% platform fee)',
        jsonb_build_object('sender_id', CASE WHEN p_is_anonymous THEN NULL ELSE p_sender_id END, 'article_id', p_article_id, 'tip_type', p_tip_type, 'gross_amount', p_coins_amount, 'fee', v_fee_amount)
    );

    -- Log platform revenue
    INSERT INTO platform_revenue (source, amount, reference_id, reference_type, metadata)
    VALUES ('tip_fee', v_fee_amount, v_tip.id::TEXT, 'tip',
        jsonb_build_object('sender_id', p_sender_id, 'receiver_id', p_receiver_id, 'article_id', p_article_id, 'gross_amount', p_coins_amount, 'fee_percent', v_fee_percent)
    );

    -- Update user stats
    UPDATE users SET total_tips_sent = COALESCE(total_tips_sent, 0) + 1 WHERE id = p_sender_id;
    UPDATE users SET total_tips_received = COALESCE(total_tips_received, 0) + 1, total_coins_earned = COALESCE(total_coins_earned, 0) + v_author_amount WHERE id = p_receiver_id;

    -- Update article tip stats
    IF p_article_id IS NOT NULL THEN
        UPDATE articles
        SET tip_count = COALESCE(tip_count, 0) + 1,
            tip_total = COALESCE(tip_total, 0) + p_coins_amount
        WHERE id = p_article_id;
    END IF;

    RETURN v_tip;
END;
$$;

-- ═══════════════════════════════════════
-- 6. RPC: Get tip fee config (public)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_tip_fee_percent()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_fee INT;
BEGIN
    SELECT COALESCE(value::INT, 20) INTO v_fee FROM platform_config WHERE key = 'tip_fee_percent';
    RETURN COALESCE(v_fee, 20);
END;
$$;

-- ═══════════════════════════════════════
-- 7. RPC: Get article tip stats
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_article_tip_stats(p_article_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN (
        SELECT jsonb_build_object(
            'tip_count', COALESCE(a.tip_count, 0),
            'tip_total', COALESCE(a.tip_total, 0),
            'recent_tips', COALESCE((
                SELECT jsonb_agg(row_to_json(t)) FROM (
                    SELECT tip.tip_type, tip.coins_amount, tip.created_at, tip.is_anonymous,
                        CASE WHEN tip.is_anonymous THEN 'Anonymous'
                             ELSE COALESCE((SELECT display_name FROM users WHERE id = tip.sender_id), 'User')
                        END as sender_name
                    FROM tips tip
                    WHERE tip.article_id = p_article_id
                    ORDER BY tip.created_at DESC
                    LIMIT 10
                ) t
            ), '[]'::JSONB),
            'top_tippers', COALESCE((
                SELECT jsonb_agg(row_to_json(t)) FROM (
                    SELECT tip.sender_id, SUM(tip.coins_amount) as total_tipped,
                        CASE WHEN bool_and(tip.is_anonymous) THEN 'Anonymous'
                             ELSE COALESCE((SELECT display_name FROM users WHERE id = tip.sender_id), 'User')
                        END as sender_name
                    FROM tips tip
                    WHERE tip.article_id = p_article_id
                    GROUP BY tip.sender_id
                    ORDER BY total_tipped DESC
                    LIMIT 5
                ) t
            ), '[]'::JSONB)
        )
        FROM articles a WHERE a.id = p_article_id
    );
END;
$$;
