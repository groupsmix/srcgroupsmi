-- ═══════════════════════════════════════════════════════════════
-- Migration 041: Coin Economy Reconciliation
--
-- 1. Adds reconciliation_report table
-- 2. Adds CHECK constraints to wallet_transactions and user_wallets
-- 3. Nightly cron to assert wallet_balance = SUM(transactions)
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. Create reconciliation_report table
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reconciliation_report (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_users_checked INT NOT NULL DEFAULT 0,
    mismatched_users INT NOT NULL DEFAULT 0,
    mismatch_details JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reconciliation_report ENABLE ROW LEVEL SECURITY;

-- AUDIT: public
CREATE POLICY "Admins read reconciliation_report" ON reconciliation_report
    FOR SELECT USING (
        (SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin'
    );

-- ───────────────────────────────────────────────────────────────
-- 2. Add CHECK constraints to prevent impossible states
-- ───────────────────────────────────────────────────────────────
-- Ensure user_wallets balances never drop below 0
ALTER TABLE user_wallets DROP CONSTRAINT IF EXISTS user_wallets_coins_balance_check;
ALTER TABLE user_wallets ADD CONSTRAINT user_wallets_coins_balance_check CHECK (coins_balance >= 0);

ALTER TABLE user_wallets DROP CONSTRAINT IF EXISTS user_wallets_purchased_balance_check;
ALTER TABLE user_wallets ADD CONSTRAINT user_wallets_purchased_balance_check CHECK (purchased_balance >= 0);

ALTER TABLE user_wallets DROP CONSTRAINT IF EXISTS user_wallets_earned_balance_check;
ALTER TABLE user_wallets ADD CONSTRAINT user_wallets_earned_balance_check CHECK (earned_balance >= 0);

-- Ensure purchased + earned = total balance
ALTER TABLE user_wallets DROP CONSTRAINT IF EXISTS user_wallets_balance_sum_check;
ALTER TABLE user_wallets ADD CONSTRAINT user_wallets_balance_sum_check CHECK (coins_balance = purchased_balance + earned_balance);

-- ───────────────────────────────────────────────────────────────
-- 3. Add trigger to enforce transaction sign convention
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_transaction_sign()
RETURNS TRIGGER AS $$
BEGIN
    -- Credits should be positive, debits should be negative
    IF NEW.type IN ('purchase', 'tip_received', 'reward', 'refund') AND NEW.amount < 0 THEN
        RAISE EXCEPTION 'Transaction type % must have a positive amount', NEW.type;
    END IF;
    
    IF NEW.type IN ('tip_sent', 'withdrawal', 'penalty') AND NEW.amount > 0 THEN
        RAISE EXCEPTION 'Transaction type % must have a negative amount', NEW.type;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_transaction_sign ON wallet_transactions;
CREATE TRIGGER enforce_transaction_sign
    BEFORE INSERT OR UPDATE ON wallet_transactions
    FOR EACH ROW EXECUTE FUNCTION check_transaction_sign();

-- ───────────────────────────────────────────────────────────────
-- 4. Reconciliation function (to be called by pg_cron or Worker)
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION run_wallet_reconciliation()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_total_users INT := 0;
    v_mismatched INT := 0;
    v_details JSONB := '[]'::JSONB;
    v_report_id UUID;
    r RECORD;
BEGIN
    FOR r IN
        SELECT 
            w.user_id,
            w.coins_balance as actual_balance,
            COALESCE(SUM(t.amount), 0) as expected_balance
        FROM user_wallets w
        LEFT JOIN wallet_transactions t ON t.user_id = w.user_id
        GROUP BY w.user_id, w.coins_balance
        HAVING w.coins_balance <> COALESCE(SUM(t.amount), 0)
    LOOP
        v_mismatched := v_mismatched + 1;
        v_details := v_details || jsonb_build_object(
            'user_id', r.user_id,
            'actual_balance', r.actual_balance,
            'expected_balance', r.expected_balance,
            'diff', r.actual_balance - r.expected_balance
        );
    END LOOP;
    
    SELECT count(*) INTO v_total_users FROM user_wallets;
    
    INSERT INTO reconciliation_report (total_users_checked, mismatched_users, mismatch_details)
    VALUES (v_total_users, v_mismatched, v_details)
    RETURNING id INTO v_report_id;
    
    RETURN jsonb_build_object(
        'report_id', v_report_id,
        'total_checked', v_total_users,
        'mismatched', v_mismatched,
        'details', v_details
    );
END;
$$;
