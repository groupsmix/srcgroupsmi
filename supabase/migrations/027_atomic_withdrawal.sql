-- ═══════════════════════════════════════════════════════════════
-- Migration 027: Atomic Withdrawal RPC
-- Issue: Withdrawal flow in coins-wallet.js performs separate
-- balance check, insert, and debit steps without transaction
-- locking, creating a race-condition window where two concurrent
-- requests could both pass the balance check.
-- Fix: Single PL/pgSQL function with SELECT ... FOR UPDATE lock.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION create_withdrawal(
    p_user_id UUID,
    p_coins_amount INTEGER,
    p_payment_method TEXT,
    p_payment_details JSONB,
    p_fee_percent INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_wallet RECORD;
    v_earned INTEGER;
    v_fee_coins INTEGER;
    v_payout_coins INTEGER;
    v_usd NUMERIC;
    v_pending_count INTEGER;
    v_withdrawal RECORD;
BEGIN
    -- Lock the wallet row to prevent concurrent withdrawals
    SELECT coins_balance, earned_balance, total_withdrawn, pending_withdrawal
    INTO v_wallet
    FROM user_wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Wallet not found');
    END IF;

    v_earned := COALESCE(v_wallet.earned_balance, 0);

    -- Check sufficient earned balance
    IF v_earned < p_coins_amount THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'Insufficient earned coin balance',
            'earned_balance', v_earned
        );
    END IF;

    -- Check for existing pending withdrawal
    SELECT COUNT(*) INTO v_pending_count
    FROM withdrawal_requests
    WHERE user_id = p_user_id AND status = 'pending';

    IF v_pending_count > 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'You already have a pending withdrawal request');
    END IF;

    -- Calculate fee and payout
    v_fee_coins := FLOOR(p_coins_amount * p_fee_percent / 100);
    v_payout_coins := p_coins_amount - v_fee_coins;
    v_usd := v_payout_coins * 0.01;

    -- Create withdrawal request
    INSERT INTO withdrawal_requests (
        user_id, coins_amount, usd_amount, payment_method,
        payment_details, status, fee_percent, fee_amount, payout_amount
    ) VALUES (
        p_user_id, p_coins_amount, v_usd, p_payment_method,
        p_payment_details, 'pending', p_fee_percent,
        v_fee_coins * 0.01, v_usd
    )
    RETURNING * INTO v_withdrawal;

    -- Debit earned coins atomically
    UPDATE user_wallets
    SET coins_balance    = coins_balance - p_coins_amount,
        earned_balance   = earned_balance - p_coins_amount,
        total_withdrawn  = COALESCE(total_withdrawn, 0) + p_coins_amount,
        pending_withdrawal = COALESCE(pending_withdrawal, 0) + p_coins_amount,
        updated_at       = NOW()
    WHERE user_id = p_user_id;

    -- Log the withdrawal transaction
    INSERT INTO wallet_transactions (
        user_id, type, amount, balance_after, description, coin_source, metadata
    ) VALUES (
        p_user_id,
        'withdrawal',
        -p_coins_amount,
        v_wallet.coins_balance - p_coins_amount,
        'Cashout request: ' || p_coins_amount || ' earned coins (fee: ' || p_fee_percent || '%, payout: $' || TRIM(TO_CHAR(v_usd, '999999990.99')) || ') via ' || p_payment_method,
        'earned',
        jsonb_build_object(
            'fee_percent', p_fee_percent,
            'fee_coins', v_fee_coins,
            'payout_usd', v_usd,
            'payment_method', p_payment_method
        )
    );

    -- Log platform revenue from cashout fee
    IF v_fee_coins > 0 THEN
        INSERT INTO platform_revenue (source, amount, reference_type, metadata)
        VALUES (
            'cashout_fee',
            v_fee_coins,
            'withdrawal',
            jsonb_build_object(
                'user_id', p_user_id,
                'coins_amount', p_coins_amount,
                'fee_percent', p_fee_percent,
                'payout_usd', v_usd
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'data', row_to_json(v_withdrawal)::jsonb,
        'fee', jsonb_build_object(
            'percent', p_fee_percent,
            'coins', v_fee_coins,
            'payout_usd', v_usd
        )
    );
END;
$$;
