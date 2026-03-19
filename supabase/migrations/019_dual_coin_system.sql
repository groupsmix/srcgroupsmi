-- =============================================
-- Migration 019: Dual Coin System
-- Separates coins into Bought (purchased) and Earned types.
-- Bought coins can only be spent on-platform.
-- Earned coins can be spent OR cashed out (with manual review).
-- Spending deducts from purchased balance first.
-- =============================================

-- ═══════════════════════════════════════
-- 1. ADD SPLIT BALANCE COLUMNS TO user_wallets
-- ═══════════════════════════════════════
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS purchased_balance INT DEFAULT 0;
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS earned_balance INT DEFAULT 0;

-- ═══════════════════════════════════════
-- 2. ADD coin_source TO wallet_transactions
-- ═══════════════════════════════════════
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS coin_source TEXT DEFAULT 'earned';

-- ═══════════════════════════════════════
-- 3. BACKFILL: Classify existing transactions
--    purchases → purchased, everything else → earned
-- ═══════════════════════════════════════
UPDATE wallet_transactions SET coin_source = 'purchased' WHERE type = 'purchase' AND coin_source = 'earned';

-- Backfill user_wallets split balances from existing data:
-- purchased_balance = sum of purchase credits minus refunds
-- earned_balance = coins_balance - purchased_balance (clamped to 0)
UPDATE user_wallets uw SET
    purchased_balance = GREATEST(COALESCE((
        SELECT SUM(CASE WHEN wt.type = 'purchase' THEN wt.amount ELSE 0 END)
             + SUM(CASE WHEN wt.type = 'refund' THEN wt.amount ELSE 0 END)
        FROM wallet_transactions wt WHERE wt.user_id = uw.user_id
    ), 0), 0),
    earned_balance = GREATEST(uw.coins_balance - GREATEST(COALESCE((
        SELECT SUM(CASE WHEN wt.type = 'purchase' THEN wt.amount ELSE 0 END)
             + SUM(CASE WHEN wt.type = 'refund' THEN wt.amount ELSE 0 END)
        FROM wallet_transactions wt WHERE wt.user_id = uw.user_id
    ), 0), 0), 0);

-- Clamp purchased_balance to not exceed coins_balance
UPDATE user_wallets SET purchased_balance = coins_balance WHERE purchased_balance > coins_balance;
UPDATE user_wallets SET earned_balance = coins_balance - purchased_balance WHERE earned_balance != coins_balance - purchased_balance;

-- ═══════════════════════════════════════
-- 4. ADD cashout_fee_percent TO platform_config
-- ═══════════════════════════════════════
INSERT INTO platform_config (key, value, description) VALUES
    ('cashout_fee_percent', '10', 'Platform fee percentage on earned-coin cashouts (0-100)'),
    ('cashout_min_coins', '5000', 'Minimum earned coins required for cashout'),
    ('cashout_processing_days', '7-14', 'Expected processing time for cashout requests')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════
-- 5. ADD identity verification columns to users
-- ═══════════════════════════════════════
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT false;

-- ═══════════════════════════════════════
-- 6. ADD coin_source and fee columns to withdrawal_requests
-- ═══════════════════════════════════════
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS fee_percent NUMERIC(5,2) DEFAULT 10;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS payout_amount NUMERIC(10,2) DEFAULT 0;

-- Allow 'bank' as payment method (add to check constraint)
ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_payment_method_check;
ALTER TABLE withdrawal_requests ADD CONSTRAINT withdrawal_requests_payment_method_check
    CHECK (payment_method IN ('paypal', 'wise', 'crypto', 'bank'));

-- Update minimum withdrawal to 5000
ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_coins_amount_check;
ALTER TABLE withdrawal_requests ADD CONSTRAINT withdrawal_requests_coins_amount_check
    CHECK (coins_amount >= 5000);

-- ═══════════════════════════════════════
-- 7. REPLACE credit_coins WITH coin_source SUPPORT
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION credit_coins(
    p_user_id UUID,
    p_amount INT,
    p_type TEXT,
    p_description TEXT DEFAULT '',
    p_reference_id TEXT DEFAULT '',
    p_reference_type TEXT DEFAULT '',
    p_metadata JSONB DEFAULT '{}',
    p_coin_source TEXT DEFAULT 'earned'
)
RETURNS wallet_transactions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_wallet user_wallets;
    v_txn wallet_transactions;
    v_source TEXT;
BEGIN
    -- Normalize source
    v_source := CASE WHEN p_coin_source = 'purchased' THEN 'purchased' ELSE 'earned' END;

    -- Ensure wallet exists
    PERFORM ensure_user_wallet(p_user_id);

    -- Update balance based on source
    IF v_source = 'purchased' THEN
        UPDATE user_wallets
        SET coins_balance = coins_balance + p_amount,
            purchased_balance = purchased_balance + p_amount,
            total_earned = total_earned + p_amount,
            updated_at = now()
        WHERE user_id = p_user_id
        RETURNING * INTO v_wallet;
    ELSE
        UPDATE user_wallets
        SET coins_balance = coins_balance + p_amount,
            earned_balance = earned_balance + p_amount,
            total_earned = total_earned + p_amount,
            updated_at = now()
        WHERE user_id = p_user_id
        RETURNING * INTO v_wallet;
    END IF;

    -- Create transaction with coin_source
    INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reference_id, reference_type, description, metadata, coin_source)
    VALUES (p_user_id, p_type, p_amount, v_wallet.coins_balance, p_reference_id, p_reference_type, p_description, p_metadata, v_source)
    RETURNING * INTO v_txn;

    RETURN v_txn;
END;
$$;

-- ═══════════════════════════════════════
-- 8. REPLACE debit_coins WITH SPEND-FROM-PURCHASED-FIRST
-- ═══════════════════════════════════════
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
    v_from_purchased INT;
    v_from_earned INT;
    v_meta JSONB;
BEGIN
    -- Ensure wallet exists
    PERFORM ensure_user_wallet(p_user_id);

    -- Check balance
    SELECT * INTO v_wallet FROM user_wallets WHERE user_id = p_user_id;
    IF v_wallet.coins_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance: have %, need %', v_wallet.coins_balance, p_amount;
    END IF;

    -- Spend from purchased balance first (those can never be cashed out)
    v_from_purchased := LEAST(v_wallet.purchased_balance, p_amount);
    v_from_earned := p_amount - v_from_purchased;

    -- Debit
    UPDATE user_wallets
    SET coins_balance = coins_balance - p_amount,
        purchased_balance = purchased_balance - v_from_purchased,
        earned_balance = earned_balance - v_from_earned,
        total_spent = total_spent + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING * INTO v_wallet;

    -- Merge source breakdown into metadata
    v_meta := COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object(
        'from_purchased', v_from_purchased,
        'from_earned', v_from_earned
    );

    -- Create transaction
    INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reference_id, reference_type, description, metadata, coin_source)
    VALUES (p_user_id, p_type, -p_amount, v_wallet.coins_balance, p_reference_id, p_reference_type, p_description, v_meta, 'mixed')
    RETURNING * INTO v_txn;

    RETURN v_txn;
END;
$$;

-- ═══════════════════════════════════════
-- 9. REPLACE send_tip WITH DUAL-COIN SUPPORT
--    Debit sender (purchased first), credit receiver (earned)
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
    v_from_purchased INT;
    v_from_earned INT;
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

    -- Calculate spend-from-purchased-first for sender
    v_from_purchased := LEAST(v_sender_wallet.purchased_balance, p_coins_amount);
    v_from_earned := p_coins_amount - v_from_purchased;

    -- Debit sender (full amount, purchased first)
    UPDATE user_wallets
    SET coins_balance = coins_balance - p_coins_amount,
        purchased_balance = purchased_balance - v_from_purchased,
        earned_balance = earned_balance - v_from_earned,
        total_spent = total_spent + p_coins_amount,
        total_tipped = total_tipped + p_coins_amount,
        updated_at = now()
    WHERE user_id = p_sender_id;

    -- Credit receiver (amount minus fee) as EARNED coins
    PERFORM ensure_user_wallet(p_receiver_id);
    UPDATE user_wallets
    SET coins_balance = coins_balance + v_author_amount,
        earned_balance = earned_balance + v_author_amount,
        total_earned = total_earned + v_author_amount,
        total_received = total_received + v_author_amount,
        updated_at = now()
    WHERE user_id = p_receiver_id;

    -- Create tip record with fee info
    INSERT INTO tips (sender_id, receiver_id, article_id, tip_type, coins_amount, message, is_anonymous, platform_fee, author_received)
    VALUES (p_sender_id, p_receiver_id, p_article_id, p_tip_type, p_coins_amount, p_message, p_is_anonymous, v_fee_amount, v_author_amount)
    RETURNING * INTO v_tip;

    -- Transaction log: sender (full amount debited)
    INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reference_id, reference_type, description, metadata, coin_source)
    VALUES (
        p_sender_id, 'tip_sent', -p_coins_amount,
        (SELECT coins_balance FROM user_wallets WHERE user_id = p_sender_id),
        v_tip.id::TEXT, 'tip',
        'Tipped ' || (v_tip_names->>p_tip_type) || ' to writer',
        jsonb_build_object('receiver_id', p_receiver_id, 'article_id', p_article_id, 'tip_type', p_tip_type, 'fee', v_fee_amount, 'from_purchased', v_from_purchased, 'from_earned', v_from_earned),
        'mixed'
    );

    -- Transaction log: receiver (amount after fee) — tagged as EARNED
    INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reference_id, reference_type, description, metadata, coin_source)
    VALUES (
        p_receiver_id, 'tip_received', v_author_amount,
        (SELECT coins_balance FROM user_wallets WHERE user_id = p_receiver_id),
        v_tip.id::TEXT, 'tip',
        'Received ' || (v_tip_names->>p_tip_type) || ' tip (' || v_author_amount || ' coins after ' || v_fee_percent || '% platform fee)',
        jsonb_build_object('sender_id', CASE WHEN p_is_anonymous THEN NULL ELSE p_sender_id END, 'article_id', p_article_id, 'tip_type', p_tip_type, 'gross_amount', p_coins_amount, 'fee', v_fee_amount),
        'earned'
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
-- 10. UPDATE article publish trigger to tag as earned
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION trg_article_xp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status != 'published') THEN
        SELECT id INTO v_user_id FROM users WHERE auth_id = NEW.user_id;
        IF v_user_id IS NOT NULL THEN
            PERFORM award_writer_xp(v_user_id, 10, 'Published article: ' || LEFT(NEW.title, 50));
            -- Credit small coin reward as EARNED
            PERFORM credit_coins(v_user_id, 5, 'reward', 'Published article reward', NEW.id::TEXT, 'article', '{}'::JSONB, 'earned');
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════
-- 11. HELPER: Get cashable (earned) balance for a user
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_cashable_balance(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_earned INT;
BEGIN
    SELECT COALESCE(earned_balance, 0) INTO v_earned FROM user_wallets WHERE user_id = p_user_id;
    RETURN COALESCE(v_earned, 0);
END;
$$;

-- ═══════════════════════════════════════
-- 12. HELPER: Validate withdrawal (earned coins only)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION validate_withdrawal(p_user_id UUID, p_amount INT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_wallet user_wallets;
    v_min_coins INT;
    v_fee_percent INT;
    v_fee INT;
    v_payout INT;
    v_user RECORD;
BEGIN
    -- Get config
    SELECT COALESCE(value::INT, 5000) INTO v_min_coins FROM platform_config WHERE key = 'cashout_min_coins';
    SELECT COALESCE(value::INT, 10) INTO v_fee_percent FROM platform_config WHERE key = 'cashout_fee_percent';

    -- Get wallet
    SELECT * INTO v_wallet FROM user_wallets WHERE user_id = p_user_id;
    IF v_wallet IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Wallet not found');
    END IF;

    -- Check earned balance
    IF v_wallet.earned_balance < p_amount THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Insufficient earned coin balance. You have ' || v_wallet.earned_balance || ' earned coins. Bought coins cannot be cashed out.');
    END IF;

    -- Check minimum
    IF p_amount < v_min_coins THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Minimum cashout is ' || v_min_coins || ' coins ($' || (v_min_coins * 0.01)::NUMERIC(10,2) || ')');
    END IF;

    -- Check identity
    SELECT email, phone_verified, identity_verified INTO v_user FROM users WHERE id = p_user_id;
    IF v_user.email IS NULL OR v_user.email = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Email verification required for cashout');
    END IF;

    -- Calculate fee
    v_fee := GREATEST(FLOOR(p_amount * v_fee_percent / 100.0)::INT, 0);
    v_payout := p_amount - v_fee;

    RETURN jsonb_build_object(
        'valid', true,
        'earned_balance', v_wallet.earned_balance,
        'amount', p_amount,
        'fee_percent', v_fee_percent,
        'fee_coins', v_fee,
        'payout_coins', v_payout,
        'payout_usd', (v_payout * 0.01)::NUMERIC(10,2),
        'phone_verified', COALESCE(v_user.phone_verified, false)
    );
END;
$$;

-- ═══════════════════════════════════════
-- 13. INDEX for coin_source queries
-- ═══════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_transactions_coin_source ON wallet_transactions(coin_source);
