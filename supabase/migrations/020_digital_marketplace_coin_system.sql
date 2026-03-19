-- =============================================
-- Migration 020: Digital Products Marketplace & Enhanced Coin System
-- 
-- 1. Updates marketplace_listings for digital products
-- 2. Adds product_type column for digital product categorization
-- 3. Updates coin packages with new $1=100 coins rate and bonuses
-- 4. Adds seller payout tracking
-- 5. Adds marketplace purchase flow with coins
-- =============================================

-- ═══════════════════════════════════════
-- 1. ADD product_type AND price_coins TO marketplace_listings
-- ═══════════════════════════════════════
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'other';
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS price_coins INT DEFAULT 0;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS file_url TEXT DEFAULT '';
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS preview_url TEXT DEFAULT '';
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS download_count INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ml_product_type ON marketplace_listings (product_type);

-- ═══════════════════════════════════════
-- 2. CREATE marketplace_purchases TABLE
--    Tracks when a buyer purchases a digital product with coins
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketplace_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coins_paid INT NOT NULL DEFAULT 0,
    seller_coins INT NOT NULL DEFAULT 0,
    platform_fee_coins INT NOT NULL DEFAULT 0,
    fee_percent NUMERIC(5,2) DEFAULT 15,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded', 'disputed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mp_buyer_id ON marketplace_purchases (buyer_id);
CREATE INDEX IF NOT EXISTS idx_mp_seller_id ON marketplace_purchases (seller_id);
CREATE INDEX IF NOT EXISTS idx_mp_listing_id ON marketplace_purchases (listing_id);

-- RLS for marketplace_purchases
ALTER TABLE marketplace_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY mp_select_own ON marketplace_purchases
    FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE POLICY mp_insert_system ON marketplace_purchases
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════
-- 3. UPDATE coin_packages WITH NEW $1=100 RATE AND BONUSES
-- ═══════════════════════════════════════
-- Delete old packages and insert new ones with correct rates
DELETE FROM coin_packages;

INSERT INTO coin_packages (name, coins, bonus_coins, price_usd, sort_order, is_popular, is_active) VALUES
    ('Starter',   100,    0, 1.00,  1, false, true),
    ('Basic',     500,   50, 5.00,  2, false, true),
    ('Popular',  1000,  150, 10.00, 3, true,  true),
    ('Premium',  2500,  500, 25.00, 4, false, true),
    ('Elite',    5000, 1500, 50.00, 5, false, true),
    ('Ultimate', 10000, 4000, 100.00, 6, false, true);

-- ═══════════════════════════════════════
-- 4. ADD marketplace_fee_percent TO platform_config
-- ═══════════════════════════════════════
INSERT INTO platform_config (key, value, description) VALUES
    ('marketplace_fee_percent', '15', 'Platform fee percentage on marketplace sales (seller pays)'),
    ('coin_rate_usd', '0.01', 'USD value per coin ($1 = 100 coins)')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════
-- 5. RPC: Purchase a digital product with coins
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION purchase_marketplace_listing(
    p_buyer_id UUID,
    p_listing_id UUID
)
RETURNS marketplace_purchases
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_listing marketplace_listings;
    v_purchase marketplace_purchases;
    v_fee_percent INT;
    v_fee_coins INT;
    v_seller_coins INT;
    v_buyer_wallet user_wallets;
BEGIN
    -- Get listing
    SELECT * INTO v_listing FROM marketplace_listings WHERE id = p_listing_id AND status = 'active';
    IF v_listing IS NULL THEN
        RAISE EXCEPTION 'Listing not found or not active';
    END IF;

    -- Cannot buy own listing
    IF v_listing.seller_id = p_buyer_id THEN
        RAISE EXCEPTION 'Cannot purchase your own listing';
    END IF;

    -- Check price
    IF v_listing.price_coins <= 0 THEN
        RAISE EXCEPTION 'This listing has no coin price set';
    END IF;

    -- Check buyer balance
    SELECT * INTO v_buyer_wallet FROM user_wallets WHERE user_id = p_buyer_id;
    IF v_buyer_wallet IS NULL OR v_buyer_wallet.coins_balance < v_listing.price_coins THEN
        RAISE EXCEPTION 'Insufficient coin balance';
    END IF;

    -- Get platform fee
    SELECT COALESCE(value::INT, 15) INTO v_fee_percent FROM platform_config WHERE key = 'marketplace_fee_percent';
    IF v_fee_percent IS NULL THEN v_fee_percent := 15; END IF;

    -- Calculate fee and seller payout
    v_fee_coins := GREATEST(FLOOR(v_listing.price_coins * v_fee_percent / 100.0)::INT, 0);
    v_seller_coins := v_listing.price_coins - v_fee_coins;

    -- Debit buyer (uses purchased coins first via debit_coins)
    PERFORM debit_coins(
        p_buyer_id,
        v_listing.price_coins,
        'marketplace_purchase',
        'Purchased: ' || LEFT(v_listing.title, 80),
        v_listing.id::TEXT,
        'marketplace_listing',
        jsonb_build_object('seller_id', v_listing.seller_id, 'price_coins', v_listing.price_coins)
    );

    -- Credit seller as EARNED coins (can be cashed out)
    PERFORM credit_coins(
        v_listing.seller_id,
        v_seller_coins,
        'marketplace_sale',
        'Sale: ' || LEFT(v_listing.title, 80) || ' (after ' || v_fee_percent || '% fee)',
        v_listing.id::TEXT,
        'marketplace_listing',
        jsonb_build_object('buyer_id', p_buyer_id, 'gross_coins', v_listing.price_coins, 'fee_coins', v_fee_coins, 'fee_percent', v_fee_percent),
        'earned'
    );

    -- Create purchase record
    INSERT INTO marketplace_purchases (listing_id, buyer_id, seller_id, coins_paid, seller_coins, platform_fee_coins, fee_percent)
    VALUES (v_listing.id, p_buyer_id, v_listing.seller_id, v_listing.price_coins, v_seller_coins, v_fee_coins, v_fee_percent)
    RETURNING * INTO v_purchase;

    -- Increment download count
    UPDATE marketplace_listings SET download_count = download_count + 1 WHERE id = p_listing_id;

    -- Log platform revenue
    INSERT INTO platform_revenue (source, amount, reference_id, reference_type, metadata)
    VALUES ('marketplace_fee', v_fee_coins, v_purchase.id::TEXT, 'marketplace_purchase',
        jsonb_build_object('listing_id', p_listing_id, 'buyer_id', p_buyer_id, 'seller_id', v_listing.seller_id, 'gross_coins', v_listing.price_coins, 'fee_percent', v_fee_percent)
    );

    -- Notify seller
    INSERT INTO notifications (uid, type, title, message, link)
    VALUES (
        v_listing.seller_id,
        'marketplace_sale',
        'Product Sold!',
        'Your product "' || LEFT(v_listing.title, 50) || '" was purchased. You earned ' || v_seller_coins || ' GMX Coins!',
        '/pages/user/wallet.html'
    );

    RETURN v_purchase;
END;
$$;

-- ═══════════════════════════════════════
-- 6. ADD seller_total_sales AND seller_total_earnings TO users
-- ═══════════════════════════════════════
ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_total_sales INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_total_earnings INT DEFAULT 0;
