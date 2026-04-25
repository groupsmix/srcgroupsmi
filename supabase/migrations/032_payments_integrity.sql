-- ═══════════════════════════════════════════════════════════════
-- Migration 030: Payments Integrity (Epic B)
--
-- 1. credit_coins_from_order(payload JSONB) — single-call RPC that
--    replaces the webhook's 2-call lookup-then-credit flow. Accepts
--    the normalised order payload the Cloudflare Function already
--    builds, resolves the internal user + coin package, and credits
--    coins atomically. The insert into wallet_transactions doubles
--    as an idempotency guard: the same (user, order_id, lemon_order)
--    tuple will never be credited twice, even if the webhook fires
--    outside the KV replay window.
--
-- 2. webhook_dead_letters — persistence target for payloads that
--    signature-verified but then failed to process. Keeps raw body,
--    error, and retry bookkeeping so operators can replay without
--    waiting on the provider's retry schedule.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. credit_coins_from_order RPC
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION credit_coins_from_order(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_order_id   TEXT;
    v_product_id TEXT;
    v_variant_id TEXT;
    v_auth_id    UUID;
    v_price      INT;
    v_currency   TEXT;
    v_user_id    UUID;
    v_pkg        coin_packages;
    v_coins      INT;
    v_pkg_name   TEXT;
    v_txn        wallet_transactions;
BEGIN
    v_order_id   := COALESCE(payload->>'order_id', '');
    v_product_id := COALESCE(payload->>'product_id', '');
    v_variant_id := COALESCE(payload->>'variant_id', '');
    v_currency   := COALESCE(payload->>'currency', 'USD');

    BEGIN
        v_auth_id := NULLIF(payload->>'auth_id', '')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        v_auth_id := NULL;
    END;

    v_price := COALESCE(NULLIF(payload->>'price', '')::INT, 0);

    IF v_auth_id IS NULL OR v_order_id = '' THEN
        RETURN jsonb_build_object('status', 'skipped', 'reason', 'missing_identifiers');
    END IF;

    SELECT id INTO v_user_id
    FROM users
    WHERE auth_id = v_auth_id
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'skipped', 'reason', 'user_not_found');
    END IF;

    SELECT * INTO v_pkg
    FROM coin_packages
    WHERE is_active = true
      AND (
          (v_product_id <> '' AND lemon_product_id = v_product_id)
          OR (v_variant_id <> '' AND lemon_variant_id = v_variant_id)
      )
    ORDER BY (lemon_variant_id = v_variant_id) DESC, sort_order ASC
    LIMIT 1;

    IF v_pkg.id IS NULL THEN
        RETURN jsonb_build_object('status', 'skipped', 'reason', 'no_matching_package');
    END IF;

    v_coins    := COALESCE(v_pkg.coins, 0) + COALESCE(v_pkg.bonus_coins, 0);
    v_pkg_name := COALESCE(v_pkg.name, 'Coin Package');

    IF v_coins <= 0 THEN
        RETURN jsonb_build_object('status', 'skipped', 'reason', 'zero_coins');
    END IF;

    -- Idempotency guard: if this order already produced a purchase
    -- transaction for this user, do not double-credit.
    IF EXISTS (
        SELECT 1 FROM wallet_transactions
        WHERE user_id = v_user_id
          AND type = 'purchase'
          AND reference_id = v_order_id
          AND reference_type = 'lemon_order'
    ) THEN
        RETURN jsonb_build_object('status', 'skipped', 'reason', 'already_credited');
    END IF;

    SELECT * INTO v_txn FROM credit_coins(
        v_user_id,
        v_coins,
        'purchase',
        'Purchased ' || v_coins || ' GMX Coins (' || v_pkg_name || ')',
        v_order_id,
        'lemon_order',
        jsonb_build_object(
            'product_id', v_product_id,
            'variant_id', v_variant_id,
            'price', v_price,
            'currency', v_currency,
            'package_id', v_pkg.id
        ),
        'purchased'
    );

    INSERT INTO notifications (uid, type, title, message, link)
    VALUES (
        v_user_id,
        'gxp_awarded',
        'Coins Added!',
        v_coins || ' GMX Coins have been added to your wallet. Thank you for your purchase!',
        '/wallet'
    );

    PERFORM increment_unread_notifications(v_user_id);

    RETURN jsonb_build_object(
        'status', 'credited',
        'coins', v_coins,
        'user_id', v_user_id,
        'transaction_id', v_txn.id,
        'package_id', v_pkg.id
    );
END;
$$;

-- Lock down EXECUTE the same way credit_coins is locked down in 029.
-- Only the service-role key (used by the Cloudflare webhook) and
-- other SECURITY DEFINER callers inside the DB may invoke this.
REVOKE EXECUTE ON FUNCTION credit_coins_from_order(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION credit_coins_from_order(JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION credit_coins_from_order(JSONB) FROM authenticated;

-- ───────────────────────────────────────────────────────────────
-- 2. webhook_dead_letters — failed webhook events for operator replay
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_dead_letters (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider      TEXT NOT NULL DEFAULT 'lemonsqueezy',
    event_name    TEXT DEFAULT '',
    event_id      TEXT DEFAULT '',
    signature     TEXT DEFAULT '',
    raw_payload   JSONB DEFAULT '{}'::JSONB,
    error         TEXT DEFAULT '',
    retry_count   INT NOT NULL DEFAULT 0,
    last_retry_at TIMESTAMPTZ,
    resolved      BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_dlq_resolved_created
    ON webhook_dead_letters (resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_dlq_provider_event
    ON webhook_dead_letters (provider, event_name);
CREATE INDEX IF NOT EXISTS idx_webhook_dlq_event_id
    ON webhook_dead_letters (event_id)
    WHERE event_id <> '';

ALTER TABLE webhook_dead_letters ENABLE ROW LEVEL SECURITY;

-- Only admins can read the dead-letter queue via PostgREST. The
-- Cloudflare webhook uses the service-role key (which bypasses RLS)
-- to insert rows, so no INSERT policy is needed for it.
DROP POLICY IF EXISTS "Admins read dead letters" ON webhook_dead_letters;
CREATE POLICY "Admins read dead letters" ON webhook_dead_letters
    FOR SELECT USING (
        (SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin'
    );

DROP POLICY IF EXISTS "Admins manage dead letters" ON webhook_dead_letters;
CREATE POLICY "Admins manage dead letters" ON webhook_dead_letters
    FOR UPDATE USING (
        (SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin'
    );
