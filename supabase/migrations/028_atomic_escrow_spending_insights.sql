-- ═══════════════════════════════════════════════════════════════
-- Migration 028: Atomic Escrow RPC + Server-Side Spending Insights
--
-- Part 1 (P1): Escrow create flow in coins-wallet.js performs
-- separate balance check, debit, and insert steps without
-- transaction locking — same TOCTOU pattern fixed for withdrawals
-- in migration 027. Fix: atomic create_escrow() with FOR UPDATE.
--
-- Part 2 (P2): spending-insights action fetches up to 500
-- transactions and aggregates client-side. Fix: move aggregation
-- to PostgreSQL with get_spending_insights() RPC.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────
-- Ensure escrow_transactions table exists
-- ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS escrow_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL DEFAULT 'Product',
    amount INTEGER NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'held'
        CHECK (status IN ('held', 'completed', 'disputed', 'refunded', 'auto_released')),
    auto_release_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    completed_at TIMESTAMPTZ,
    dispute_reason TEXT,
    disputed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escrow_txn_buyer ON escrow_transactions (buyer_id);
CREATE INDEX IF NOT EXISTS idx_escrow_txn_seller ON escrow_transactions (seller_id);
CREATE INDEX IF NOT EXISTS idx_escrow_txn_status ON escrow_transactions (status);
CREATE INDEX IF NOT EXISTS idx_escrow_txn_auto_release ON escrow_transactions (auto_release_at) WHERE status = 'held';

ALTER TABLE escrow_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS escrow_select_own ON escrow_transactions
    FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════
-- PART 1: Atomic Escrow Create RPC
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_escrow(
    p_buyer_id UUID,
    p_seller_id UUID,
    p_product_id TEXT,
    p_amount INTEGER,
    p_product_name TEXT DEFAULT 'Product'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_wallet RECORD;
    v_from_purchased INTEGER;
    v_from_earned INTEGER;
    v_auto_release_at TIMESTAMPTZ;
    v_escrow RECORD;
BEGIN
    -- Validate inputs
    IF p_buyer_id = p_seller_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Cannot buy from yourself');
    END IF;

    IF p_amount < 1 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Amount must be at least 1 coin');
    END IF;

    -- Lock the buyer's wallet row to prevent concurrent escrow/debit races
    SELECT coins_balance, purchased_balance, earned_balance
    INTO v_wallet
    FROM user_wallets
    WHERE user_id = p_buyer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Wallet not found');
    END IF;

    -- Check sufficient total balance
    IF v_wallet.coins_balance < p_amount THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'Insufficient balance. You need ' || p_amount || ' coins.',
            'balance', v_wallet.coins_balance
        );
    END IF;

    -- Spend from purchased balance first (cannot be cashed out)
    v_from_purchased := LEAST(COALESCE(v_wallet.purchased_balance, 0), p_amount);
    v_from_earned := p_amount - v_from_purchased;

    -- Atomically debit buyer wallet
    UPDATE user_wallets
    SET coins_balance    = coins_balance - p_amount,
        purchased_balance = purchased_balance - v_from_purchased,
        earned_balance    = earned_balance - v_from_earned,
        total_spent       = COALESCE(total_spent, 0) + p_amount,
        updated_at        = NOW()
    WHERE user_id = p_buyer_id;

    -- Create escrow record
    v_auto_release_at := NOW() + INTERVAL '7 days';

    INSERT INTO escrow_transactions (
        buyer_id, seller_id, product_id, product_name,
        amount, status, auto_release_at
    ) VALUES (
        p_buyer_id, p_seller_id, p_product_id,
        LEFT(p_product_name, 200), p_amount, 'held', v_auto_release_at
    )
    RETURNING * INTO v_escrow;

    -- Log the escrow hold transaction
    INSERT INTO wallet_transactions (
        user_id, type, amount, balance_after, description,
        reference_id, reference_type, coin_source, metadata
    ) VALUES (
        p_buyer_id,
        'escrow_hold',
        -p_amount,
        v_wallet.coins_balance - p_amount,
        'Escrow hold for ' || LEFT(p_product_name, 100),
        v_escrow.id::TEXT,
        'escrow',
        'mixed',
        jsonb_build_object(
            'seller_id', p_seller_id,
            'product_id', p_product_id,
            'from_purchased', v_from_purchased,
            'from_earned', v_from_earned
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'data', row_to_json(v_escrow)::jsonb,
        'message', p_amount || ' coins held in escrow. Seller must deliver within 7 days, then you confirm to release funds.'
    );
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- PART 2: Server-Side Spending Insights RPC
-- Replaces client-side aggregation of up to 500 transactions
-- with a single SQL query returning ~2KB of pre-aggregated data.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_spending_insights(
    p_user_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_categories JSONB;
    v_earnings JSONB;
    v_chart_data JSONB;
    v_total_spent NUMERIC;
    v_total_earned NUMERIC;
    v_txn_count INTEGER;
    v_first_half_spent NUMERIC;
    v_second_half_spent NUMERIC;
    v_first_half_earned NUMERIC;
    v_second_half_earned NUMERIC;
    v_half_point TIMESTAMPTZ;
    v_spending_trend TEXT;
    v_spending_change INTEGER;
    v_earning_trend TEXT;
    v_earning_change INTEGER;
    v_top_cat_key TEXT;
    v_top_cat_label TEXT;
    v_top_cat_total NUMERIC;
    v_avg_daily_spend INTEGER;
    v_avg_daily_earn INTEGER;
BEGIN
    v_cutoff := NOW() - (p_days || ' days')::INTERVAL;
    v_half_point := NOW() - (p_days / 2 || ' days')::INTERVAL;

    -- Count transactions in period
    SELECT COUNT(*) INTO v_txn_count
    FROM wallet_transactions
    WHERE user_id = p_user_id AND created_at >= v_cutoff;

    -- Aggregate spending categories
    SELECT jsonb_build_object(
        'tips', jsonb_build_object(
            'total', COALESCE(SUM(CASE WHEN type IN ('tip_sent', 'tip') AND amount < 0 THEN ABS(amount) END), 0),
            'count', COALESCE(SUM(CASE WHEN type IN ('tip_sent', 'tip') AND amount < 0 THEN 1 END), 0),
            'label', 'Tips Sent'
        ),
        'purchases', jsonb_build_object(
            'total', COALESCE(SUM(CASE WHEN type IN ('purchase', 'store_purchase') AND amount < 0 THEN ABS(amount) END), 0),
            'count', COALESCE(SUM(CASE WHEN type IN ('purchase', 'store_purchase') AND amount < 0 THEN 1 END), 0),
            'label', 'Store Purchases'
        ),
        'boosts', jsonb_build_object(
            'total', COALESCE(SUM(CASE WHEN type IN ('boost', 'promote') AND amount < 0 THEN ABS(amount) END), 0),
            'count', COALESCE(SUM(CASE WHEN type IN ('boost', 'promote') AND amount < 0 THEN 1 END), 0),
            'label', 'Boosts & Promotions'
        ),
        'withdrawals_cat', jsonb_build_object(
            'total', COALESCE(SUM(CASE WHEN type = 'withdrawal' AND amount < 0 THEN ABS(amount) END), 0),
            'count', COALESCE(SUM(CASE WHEN type = 'withdrawal' AND amount < 0 THEN 1 END), 0),
            'label', 'Withdrawals'
        ),
        'other_spending', jsonb_build_object(
            'total', COALESCE(SUM(CASE WHEN amount < 0 AND type NOT IN ('tip_sent', 'tip', 'purchase', 'store_purchase', 'boost', 'promote', 'withdrawal') THEN ABS(amount) END), 0),
            'count', COALESCE(SUM(CASE WHEN amount < 0 AND type NOT IN ('tip_sent', 'tip', 'purchase', 'store_purchase', 'boost', 'promote', 'withdrawal') THEN 1 END), 0),
            'label', 'Other'
        )
    ) INTO v_categories
    FROM wallet_transactions
    WHERE user_id = p_user_id AND created_at >= v_cutoff;

    -- Aggregate earning categories
    SELECT jsonb_build_object(
        'purchases_received', jsonb_build_object(
            'total', COALESCE(SUM(CASE WHEN type IN ('purchase', 'coin_purchase') AND amount > 0 THEN amount END), 0),
            'count', COALESCE(SUM(CASE WHEN type IN ('purchase', 'coin_purchase') AND amount > 0 THEN 1 END), 0),
            'label', 'Coins Purchased'
        ),
        'tips_received', jsonb_build_object(
            'total', COALESCE(SUM(CASE WHEN type = 'tip_received' AND amount > 0 THEN amount END), 0),
            'count', COALESCE(SUM(CASE WHEN type = 'tip_received' AND amount > 0 THEN 1 END), 0),
            'label', 'Tips Received'
        ),
        'rewards', jsonb_build_object(
            'total', COALESCE(SUM(CASE WHEN type IN ('reward', 'bonus', 'signup_bonus') AND amount > 0 THEN amount END), 0),
            'count', COALESCE(SUM(CASE WHEN type IN ('reward', 'bonus', 'signup_bonus') AND amount > 0 THEN 1 END), 0),
            'label', 'Rewards & Bonuses'
        ),
        'referrals', jsonb_build_object(
            'total', COALESCE(SUM(CASE WHEN type IN ('referral', 'referral_bonus') AND amount > 0 THEN amount END), 0),
            'count', COALESCE(SUM(CASE WHEN type IN ('referral', 'referral_bonus') AND amount > 0 THEN 1 END), 0),
            'label', 'Referral Bonuses'
        ),
        'other_earning', jsonb_build_object(
            'total', COALESCE(SUM(CASE WHEN amount > 0 AND type NOT IN ('purchase', 'coin_purchase', 'tip_received', 'reward', 'bonus', 'signup_bonus', 'referral', 'referral_bonus') THEN amount END), 0),
            'count', COALESCE(SUM(CASE WHEN amount > 0 AND type NOT IN ('purchase', 'coin_purchase', 'tip_received', 'reward', 'bonus', 'signup_bonus', 'referral', 'referral_bonus') THEN 1 END), 0),
            'label', 'Other Earnings'
        )
    ) INTO v_earnings
    FROM wallet_transactions
    WHERE user_id = p_user_id AND created_at >= v_cutoff;

    -- Build daily chart data
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'date', d.day::TEXT,
            'spent', COALESCE(s.spent, 0),
            'earned', COALESCE(s.earned, 0)
        ) ORDER BY d.day
    ), '[]'::JSONB) INTO v_chart_data
    FROM generate_series(v_cutoff::DATE, CURRENT_DATE, '1 day'::INTERVAL) AS d(day)
    LEFT JOIN (
        SELECT
            created_at::DATE AS day,
            COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) END), 0) AS spent,
            COALESCE(SUM(CASE WHEN amount > 0 THEN amount END), 0) AS earned
        FROM wallet_transactions
        WHERE user_id = p_user_id AND created_at >= v_cutoff
        GROUP BY created_at::DATE
    ) s ON s.day = d.day::DATE;

    -- Calculate totals
    SELECT
        COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) END), 0),
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount END), 0)
    INTO v_total_spent, v_total_earned
    FROM wallet_transactions
    WHERE user_id = p_user_id AND created_at >= v_cutoff;

    -- Trend analysis: compare first half vs second half of period
    SELECT
        COALESCE(SUM(CASE WHEN amount < 0 AND created_at < v_half_point THEN ABS(amount) END), 0),
        COALESCE(SUM(CASE WHEN amount < 0 AND created_at >= v_half_point THEN ABS(amount) END), 0),
        COALESCE(SUM(CASE WHEN amount > 0 AND created_at < v_half_point THEN amount END), 0),
        COALESCE(SUM(CASE WHEN amount > 0 AND created_at >= v_half_point THEN amount END), 0)
    INTO v_first_half_spent, v_second_half_spent, v_first_half_earned, v_second_half_earned
    FROM wallet_transactions
    WHERE user_id = p_user_id AND created_at >= v_cutoff;

    -- Spending trend
    v_spending_trend := 'stable';
    v_spending_change := 0;
    IF v_first_half_spent > 0 THEN
        v_spending_change := ROUND(((v_second_half_spent - v_first_half_spent) / v_first_half_spent) * 100)::INTEGER;
        IF v_spending_change > 20 THEN v_spending_trend := 'increasing';
        ELSIF v_spending_change < -20 THEN v_spending_trend := 'decreasing';
        END IF;
    END IF;

    -- Earning trend
    v_earning_trend := 'stable';
    v_earning_change := 0;
    IF v_first_half_earned > 0 THEN
        v_earning_change := ROUND(((v_second_half_earned - v_first_half_earned) / v_first_half_earned) * 100)::INTEGER;
        IF v_earning_change > 20 THEN v_earning_trend := 'increasing';
        ELSIF v_earning_change < -20 THEN v_earning_trend := 'decreasing';
        END IF;
    END IF;

    -- Find top spending category
    SELECT key, obj->>'label', (obj->>'total')::NUMERIC
    INTO v_top_cat_key, v_top_cat_label, v_top_cat_total
    FROM jsonb_each(v_categories) AS x(key, obj)
    ORDER BY (obj->>'total')::NUMERIC DESC
    LIMIT 1;

    -- Average daily values
    v_avg_daily_spend := CASE WHEN p_days > 0 THEN ROUND(v_total_spent / p_days)::INTEGER ELSE 0 END;
    v_avg_daily_earn := CASE WHEN p_days > 0 THEN ROUND(v_total_earned / p_days)::INTEGER ELSE 0 END;

    RETURN jsonb_build_object(
        'ok', true,
        'data', jsonb_build_object(
            'period_days', p_days,
            'total_spent', v_total_spent,
            'total_earned', v_total_earned,
            'net_flow', v_total_earned - v_total_spent,
            'spending_breakdown', v_categories,
            'earning_breakdown', v_earnings,
            'chart_data', v_chart_data,
            'transaction_count', v_txn_count,
            'trends', jsonb_build_object(
                'spending', jsonb_build_object('direction', v_spending_trend, 'change_percent', v_spending_change),
                'earning', jsonb_build_object('direction', v_earning_trend, 'change_percent', v_earning_change),
                'top_spending_category', CASE WHEN v_top_cat_key IS NOT NULL THEN
                    jsonb_build_object('key', v_top_cat_key, 'label', v_top_cat_label, 'total', v_top_cat_total)
                ELSE NULL END,
                'avg_daily_spend', v_avg_daily_spend,
                'avg_daily_earn', v_avg_daily_earn,
                'projected_monthly_spend', v_avg_daily_spend * 30,
                'projected_monthly_earn', v_avg_daily_earn * 30
            )
        )
    );
END;
$$;
