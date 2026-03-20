-- ============================================================
-- Migration 025: Marketplace Offers, Flash Sales & Enhanced Disputes
-- ============================================================
-- 1. Marketplace offers table (buyer negotiation system)
-- 2. Flash sale columns on marketplace_listings
-- 3. Dispute response columns for seller responses
-- 4. Seller trust score RPC
-- 5. Also-bought recommendations RPC
-- ============================================================

-- ═══════════════════════════════════════
-- 1. MARKETPLACE OFFERS TABLE
--    Buyers can make offers below list price; sellers accept/reject/counter.
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketplace_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offer_amount INTEGER NOT NULL CHECK (offer_amount > 0),
    original_price INTEGER NOT NULL CHECK (original_price > 0),
    counter_amount INTEGER,
    message TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'countered', 'expired', 'withdrawn')),
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(listing_id, buyer_id, status)
);

CREATE INDEX IF NOT EXISTS idx_mo_listing_id ON marketplace_offers (listing_id);
CREATE INDEX IF NOT EXISTS idx_mo_buyer_id ON marketplace_offers (buyer_id);
CREATE INDEX IF NOT EXISTS idx_mo_seller_id ON marketplace_offers (seller_id);
CREATE INDEX IF NOT EXISTS idx_mo_status ON marketplace_offers (status);

-- RLS for marketplace_offers
ALTER TABLE marketplace_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY mo_select_own ON marketplace_offers
    FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE POLICY mo_insert_buyer ON marketplace_offers
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND buyer_id = auth.uid());

CREATE POLICY mo_update_seller ON marketplace_offers
    FOR UPDATE USING (seller_id = auth.uid())
    WITH CHECK (seller_id = auth.uid());

-- ═══════════════════════════════════════
-- 2. FLASH SALE COLUMNS ON marketplace_listings
--    Sellers can set time-limited discounts with countdown timers.
-- ═══════════════════════════════════════
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS sale_price INTEGER;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMPTZ;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS sale_discount INTEGER;

CREATE INDEX IF NOT EXISTS idx_ml_sale_ends_at ON marketplace_listings (sale_ends_at)
    WHERE sale_price IS NOT NULL AND sale_ends_at IS NOT NULL;

-- ═══════════════════════════════════════
-- 3. DISPUTE RESPONSE COLUMNS
--    Allow sellers to respond to disputes (48h window).
-- ═══════════════════════════════════════
ALTER TABLE marketplace_disputes ADD COLUMN IF NOT EXISTS seller_response TEXT DEFAULT '';
ALTER TABLE marketplace_disputes ADD COLUMN IF NOT EXISTS seller_responded_at TIMESTAMPTZ;

-- Add 'seller_responded' to allowed dispute statuses
ALTER TABLE marketplace_disputes DROP CONSTRAINT IF EXISTS marketplace_disputes_status_check;
ALTER TABLE marketplace_disputes ADD CONSTRAINT marketplace_disputes_status_check
    CHECK (status IN ('open', 'under_review', 'seller_responded', 'resolved_refund', 'resolved_no_refund', 'expired'));

-- ═══════════════════════════════════════
-- 4. RPC: Get seller trust score
--    Computes trust score based on account age, transactions, ratings, disputes.
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_seller_trust_score(p_seller_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user RECORD;
    v_completed_count INTEGER;
    v_total_tx INTEGER;
    v_dispute_count INTEGER;
    v_avg_rating NUMERIC;
    v_review_count INTEGER;
    v_listing_count INTEGER;
    v_account_age_days INTEGER;
    v_age_score INTEGER;
    v_tx_score NUMERIC;
    v_rating_score NUMERIC;
    v_response_score INTEGER;
    v_refund_score INTEGER;
    v_dispute_rate NUMERIC;
    v_total_score INTEGER;
BEGIN
    -- Get user info
    SELECT id, created_at INTO v_user FROM users WHERE id = p_seller_id;
    IF v_user IS NULL THEN
        RETURN json_build_object('score', 0, 'factors', '{}'::JSON);
    END IF;

    -- Account age
    v_account_age_days := EXTRACT(DAY FROM (now() - v_user.created_at));
    v_age_score := LEAST(20, FLOOR(v_account_age_days / 15.0));

    -- Completed transactions
    SELECT COUNT(*) INTO v_completed_count
    FROM marketplace_escrow WHERE seller_id = p_seller_id AND status IN ('released', 'completed', 'auto_released');

    SELECT COUNT(*) INTO v_total_tx
    FROM marketplace_escrow WHERE seller_id = p_seller_id;

    v_tx_score := LEAST(25, v_completed_count * 2.5);

    -- Review ratings
    SELECT COALESCE(AVG(rating), 0), COUNT(*) INTO v_avg_rating, v_review_count
    FROM product_reviews WHERE seller_id = p_seller_id;

    IF v_review_count > 0 THEN
        v_rating_score := (v_avg_rating / 5.0) * 25;
    ELSE
        v_rating_score := 10; -- neutral starting score
    END IF;

    -- Listing activity
    SELECT COUNT(*) INTO v_listing_count
    FROM marketplace_listings WHERE seller_id = p_seller_id AND status = 'active';

    v_response_score := LEAST(15, v_listing_count * 3);

    -- Dispute rate
    SELECT COUNT(*) INTO v_dispute_count
    FROM marketplace_disputes WHERE seller_id = p_seller_id;

    IF v_total_tx > 0 THEN
        v_dispute_rate := v_dispute_count::NUMERIC / v_total_tx;
    ELSE
        v_dispute_rate := 0;
    END IF;
    v_refund_score := GREATEST(0, 15 - FLOOR(v_dispute_rate * 100));

    v_total_score := LEAST(100, ROUND(v_age_score + v_tx_score + v_rating_score + v_response_score + v_refund_score));

    RETURN json_build_object(
        'score', v_total_score,
        'factors', json_build_object(
            'account_age', json_build_object('score', v_age_score, 'max', 20, 'days', v_account_age_days),
            'transactions', json_build_object('score', ROUND(v_tx_score), 'max', 25, 'count', v_completed_count),
            'ratings', json_build_object('score', ROUND(v_rating_score), 'max', 25, 'avg', ROUND(v_avg_rating, 1), 'count', v_review_count),
            'response', json_build_object('score', v_response_score, 'max', 15, 'listings', v_listing_count),
            'refund_rate', json_build_object('score', v_refund_score, 'max', 15, 'rate', ROUND(v_dispute_rate, 2), 'disputes', v_dispute_count)
        )
    );
END;
$$;

-- ═══════════════════════════════════════
-- 5. RPC: Get "also bought" recommendations
--    Finds other listings purchased by buyers who also bought the given listing.
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_also_bought(p_listing_id UUID)
RETURNS SETOF marketplace_listings
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT ml.*
    FROM marketplace_listings ml
    WHERE ml.id IN (
        -- Get other listings purchased by buyers who bought this listing
        SELECT DISTINCT me2.listing_id
        FROM marketplace_escrow me1
        JOIN marketplace_escrow me2 ON me2.buyer_id = me1.buyer_id
        WHERE me1.listing_id = p_listing_id
          AND me1.status IN ('released', 'completed', 'auto_released')
          AND me2.status IN ('released', 'completed', 'auto_released')
          AND me2.listing_id != p_listing_id
    )
    AND ml.status = 'active'
    ORDER BY ml.clicks DESC
    LIMIT 4;
END;
$$;

-- ═══════════════════════════════════════
-- 6. DELIVERY URL COLUMN
--    For digital product delivery links.
-- ═══════════════════════════════════════
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS delivery_url TEXT DEFAULT '';
