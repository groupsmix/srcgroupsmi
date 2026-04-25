-- AUDIT: public
-- ============================================================
-- Migration 020: Marketplace Trust Layers
-- ============================================================
-- 1. Seller verification flags (reuses phone_verified/identity_verified from 019)
-- 2. Product category column for digital product types
-- 3. Banned keywords config
-- 4. Escrow system for coin-based purchases
-- 5. Product-level reviews (buyer reviews)
-- 6. Dispute/refund system
-- 7. AI scan status tracking
-- ============================================================

-- ═══════════════════════════════════════
-- 1. ADD product_category TO marketplace_listings
--    Fixed whitelist: templates, bots, scripts, design_assets, guides, tools
-- ═══════════════════════════════════════
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS product_category TEXT DEFAULT 'templates'
    CHECK (product_category IN ('templates', 'bots', 'scripts', 'design_assets', 'guides', 'tools'));

-- Add seller_verified flag (denormalized for fast display)
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS seller_verified BOOLEAN DEFAULT false;

-- Add AI scan status: pending_review, approved, flagged, rejected
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS ai_scan_status TEXT DEFAULT 'pending_review'
    CHECK (ai_scan_status IN ('pending_review', 'approved', 'flagged', 'rejected'));

-- Update status check to include 'flagged'
ALTER TABLE marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_status_check;
ALTER TABLE marketplace_listings ADD CONSTRAINT marketplace_listings_status_check
    CHECK (status IN ('pending', 'active', 'sold', 'rejected', 'removed', 'flagged'));

-- Index on product_category
CREATE INDEX IF NOT EXISTS idx_ml_product_category ON marketplace_listings (product_category);
CREATE INDEX IF NOT EXISTS idx_ml_ai_scan_status ON marketplace_listings (ai_scan_status);

-- ═══════════════════════════════════════
-- 2. BANNED KEYWORDS TABLE
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketplace_banned_keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT NOT NULL UNIQUE,
    reason TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed banned keywords
INSERT INTO marketplace_banned_keywords (keyword, reason) VALUES
    ('account', 'Account trading not allowed'),
    ('followers', 'Follower trading not allowed'),
    ('subscribers', 'Subscriber trading not allowed'),
    ('verified badge', 'Badge trading not allowed'),
    ('hacked', 'Hacked content not allowed'),
    ('cracked', 'Cracked content not allowed'),
    ('leaked', 'Leaked content not allowed'),
    ('stolen', 'Stolen content not allowed'),
    ('login', 'Credential trading not allowed'),
    ('password', 'Credential trading not allowed'),
    ('credentials', 'Credential trading not allowed'),
    ('exploit', 'Exploits not allowed'),
    ('crack', 'Cracked content not allowed'),
    ('nulled', 'Nulled content not allowed'),
    ('warez', 'Pirated content not allowed'),
    ('pirated', 'Pirated content not allowed')
ON CONFLICT (keyword) DO NOTHING;

-- RLS for banned keywords (public read, admin write)
ALTER TABLE marketplace_banned_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY mbk_select_all ON marketplace_banned_keywords FOR SELECT USING (true);

-- ═══════════════════════════════════════
-- 3. ESCROW SYSTEM
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketplace_escrow (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coin_amount INTEGER NOT NULL CHECK (coin_amount > 0),
    status TEXT NOT NULL DEFAULT 'held'
        CHECK (status IN ('held', 'released', 'refunded', 'disputed', 'auto_released')),
    buyer_confirmed BOOLEAN DEFAULT false,
    auto_release_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '48 hours'),
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_me_buyer_id ON marketplace_escrow (buyer_id);
CREATE INDEX IF NOT EXISTS idx_me_seller_id ON marketplace_escrow (seller_id);
CREATE INDEX IF NOT EXISTS idx_me_listing_id ON marketplace_escrow (listing_id);
CREATE INDEX IF NOT EXISTS idx_me_status ON marketplace_escrow (status);
CREATE INDEX IF NOT EXISTS idx_me_auto_release ON marketplace_escrow (auto_release_at) WHERE status = 'held';

-- RLS for escrow
ALTER TABLE marketplace_escrow ENABLE ROW LEVEL SECURITY;

-- Buyer and seller can see their own escrow records
CREATE POLICY me_select_own ON marketplace_escrow
    FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Only system/RPC can insert (via create_escrow function)
-- No direct insert policy — use RPC

-- ═══════════════════════════════════════
-- 4. PRODUCT REVIEWS (buyer reviews on products)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS product_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    escrow_id UUID REFERENCES marketplace_escrow(id) ON DELETE SET NULL,
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(reviewer_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_pr_listing_id ON product_reviews (listing_id);
CREATE INDEX IF NOT EXISTS idx_pr_seller_id ON product_reviews (seller_id);
CREATE INDEX IF NOT EXISTS idx_pr_reviewer_id ON product_reviews (reviewer_id);

-- RLS for product reviews
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY pr_select_all ON product_reviews FOR SELECT USING (true);
CREATE POLICY pr_insert_own ON product_reviews
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND reviewer_id = auth.uid() AND seller_id != auth.uid());

-- ═══════════════════════════════════════
-- 5. DISPUTES / REFUND SYSTEM
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketplace_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escrow_id UUID NOT NULL REFERENCES marketplace_escrow(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'under_review', 'resolved_refund', 'resolved_no_refund', 'expired')),
    admin_notes TEXT DEFAULT '',
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    dispute_deadline TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_md_escrow_id ON marketplace_disputes (escrow_id);
CREATE INDEX IF NOT EXISTS idx_md_buyer_id ON marketplace_disputes (buyer_id);
CREATE INDEX IF NOT EXISTS idx_md_seller_id ON marketplace_disputes (seller_id);
CREATE INDEX IF NOT EXISTS idx_md_status ON marketplace_disputes (status);

-- RLS for disputes
ALTER TABLE marketplace_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY md_select_own ON marketplace_disputes
    FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());
CREATE POLICY md_insert_buyer ON marketplace_disputes
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND buyer_id = auth.uid());

-- ═══════════════════════════════════════
-- 6. RPC: Create Escrow (buyer purchases listing with coins)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION create_marketplace_escrow(
    p_listing_id UUID,
    p_buyer_id UUID,
    p_coin_amount INTEGER
)
RETURNS marketplace_escrow
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_listing marketplace_listings;
    v_escrow marketplace_escrow;
    v_wallet user_wallets;
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

    -- Check buyer balance
    SELECT * INTO v_wallet FROM user_wallets WHERE user_id = p_buyer_id;
    IF v_wallet IS NULL OR v_wallet.coins_balance < p_coin_amount THEN
        RAISE EXCEPTION 'Insufficient coin balance';
    END IF;

    -- Debit buyer (coins held in escrow)
    PERFORM debit_coins(
        p_buyer_id, p_coin_amount, 'escrow_hold',
        'Escrow hold for marketplace purchase: ' || LEFT(v_listing.title, 50),
        p_listing_id::TEXT, 'marketplace_escrow'
    );

    -- Create escrow record
    INSERT INTO marketplace_escrow (listing_id, buyer_id, seller_id, coin_amount, status)
    VALUES (p_listing_id, p_buyer_id, v_listing.seller_id, p_coin_amount, 'held')
    RETURNING * INTO v_escrow;

    RETURN v_escrow;
END;
$$;

-- ═══════════════════════════════════════
-- 7. RPC: Release Escrow (buyer confirms delivery)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION release_marketplace_escrow(
    p_escrow_id UUID,
    p_buyer_id UUID
)
RETURNS marketplace_escrow
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_escrow marketplace_escrow;
BEGIN
    SELECT * INTO v_escrow FROM marketplace_escrow WHERE id = p_escrow_id AND buyer_id = p_buyer_id AND status = 'held';
    IF v_escrow IS NULL THEN
        RAISE EXCEPTION 'Escrow not found or already processed';
    END IF;

    -- Credit seller (as earned coins)
    PERFORM credit_coins(
        v_escrow.seller_id, v_escrow.coin_amount, 'escrow_release',
        'Marketplace sale: escrow released by buyer',
        v_escrow.listing_id::TEXT, 'marketplace_escrow',
        '{}'::JSONB, 'earned'
    );

    -- Update escrow
    UPDATE marketplace_escrow
    SET status = 'released', buyer_confirmed = true, released_at = now(), updated_at = now()
    WHERE id = p_escrow_id
    RETURNING * INTO v_escrow;

    RETURN v_escrow;
END;
$$;

-- ═══════════════════════════════════════
-- 8. RPC: Auto-release escrow after 48 hours
--    (Called by a scheduled job or on-demand check)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION auto_release_expired_escrows()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_escrow RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_escrow IN
        SELECT * FROM marketplace_escrow
        WHERE status = 'held' AND auto_release_at <= now()
    LOOP
        -- Credit seller
        PERFORM credit_coins(
            v_escrow.seller_id, v_escrow.coin_amount, 'escrow_auto_release',
            'Marketplace sale: escrow auto-released after 48h',
            v_escrow.listing_id::TEXT, 'marketplace_escrow',
            '{}'::JSONB, 'earned'
        );

        UPDATE marketplace_escrow
        SET status = 'auto_released', released_at = now(), updated_at = now()
        WHERE id = v_escrow.id;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════
-- 9. RPC: Create dispute (buyer disputes within 24h)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION create_marketplace_dispute(
    p_escrow_id UUID,
    p_buyer_id UUID,
    p_reason TEXT
)
RETURNS marketplace_disputes
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_escrow marketplace_escrow;
    v_dispute marketplace_disputes;
BEGIN
    SELECT * INTO v_escrow FROM marketplace_escrow WHERE id = p_escrow_id AND buyer_id = p_buyer_id AND status = 'held';
    IF v_escrow IS NULL THEN
        RAISE EXCEPTION 'Escrow not found, already released, or not yours';
    END IF;

    -- Check no existing dispute
    IF EXISTS (SELECT 1 FROM marketplace_disputes WHERE escrow_id = p_escrow_id AND status IN ('open', 'under_review')) THEN
        RAISE EXCEPTION 'A dispute already exists for this transaction';
    END IF;

    -- Mark escrow as disputed
    UPDATE marketplace_escrow SET status = 'disputed', updated_at = now() WHERE id = p_escrow_id;

    -- Create dispute
    INSERT INTO marketplace_disputes (escrow_id, listing_id, buyer_id, seller_id, reason, status)
    VALUES (p_escrow_id, v_escrow.listing_id, p_buyer_id, v_escrow.seller_id, p_reason, 'open')
    RETURNING * INTO v_dispute;

    RETURN v_dispute;
END;
$$;

-- ═══════════════════════════════════════
-- 10. RPC: Resolve dispute (admin action)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION resolve_marketplace_dispute(
    p_dispute_id UUID,
    p_admin_id UUID,
    p_resolution TEXT, -- 'refund' or 'no_refund'
    p_admin_notes TEXT DEFAULT ''
)
RETURNS marketplace_disputes
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_dispute marketplace_disputes;
    v_escrow marketplace_escrow;
    v_admin_role TEXT;
BEGIN
    -- Verify admin role
    SELECT role INTO v_admin_role FROM users WHERE id = p_admin_id;
    IF v_admin_role NOT IN ('admin', 'owner') THEN
        RAISE EXCEPTION 'Only admins can resolve disputes';
    END IF;

    SELECT * INTO v_dispute FROM marketplace_disputes WHERE id = p_dispute_id AND status IN ('open', 'under_review');
    IF v_dispute IS NULL THEN
        RAISE EXCEPTION 'Dispute not found or already resolved';
    END IF;

    SELECT * INTO v_escrow FROM marketplace_escrow WHERE id = v_dispute.escrow_id;

    IF p_resolution = 'refund' THEN
        -- Refund coins to buyer (as purchased coins since they originally spent them)
        PERFORM credit_coins(
            v_escrow.buyer_id, v_escrow.coin_amount, 'escrow_refund',
            'Marketplace refund: dispute resolved in your favor',
            v_escrow.listing_id::TEXT, 'marketplace_dispute',
            '{}'::JSONB, 'purchased'
        );

        UPDATE marketplace_escrow SET status = 'refunded', updated_at = now() WHERE id = v_escrow.id;
        UPDATE marketplace_disputes
        SET status = 'resolved_refund', admin_notes = p_admin_notes,
            resolved_by = p_admin_id, resolved_at = now(), updated_at = now()
        WHERE id = p_dispute_id
        RETURNING * INTO v_dispute;
    ELSE
        -- No refund — release to seller
        PERFORM credit_coins(
            v_escrow.seller_id, v_escrow.coin_amount, 'escrow_release',
            'Marketplace sale: dispute resolved, payment released',
            v_escrow.listing_id::TEXT, 'marketplace_dispute',
            '{}'::JSONB, 'earned'
        );

        UPDATE marketplace_escrow SET status = 'released', released_at = now(), updated_at = now() WHERE id = v_escrow.id;
        UPDATE marketplace_disputes
        SET status = 'resolved_no_refund', admin_notes = p_admin_notes,
            resolved_by = p_admin_id, resolved_at = now(), updated_at = now()
        WHERE id = p_dispute_id
        RETURNING * INTO v_dispute;
    END IF;

    RETURN v_dispute;
END;
$$;

-- ═══════════════════════════════════════
-- 11. RPC: Get product review stats for a listing
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_product_review_stats(p_listing_id UUID)
RETURNS TABLE (
    avg_rating NUMERIC,
    review_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(ROUND(AVG(pr.rating)::NUMERIC, 1), 0) AS avg_rating,
        COUNT(pr.id) AS review_count
    FROM product_reviews pr
    WHERE pr.listing_id = p_listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════
-- 12. RPC: Check seller average rating and auto-delist if below 2.0
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION check_seller_rating_threshold(p_seller_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_avg NUMERIC;
    v_count BIGINT;
BEGIN
    SELECT COALESCE(AVG(rating), 0), COUNT(*) INTO v_avg, v_count
    FROM product_reviews WHERE seller_id = p_seller_id;

    -- Only auto-delist if they have at least 3 reviews and avg < 2.0
    IF v_count >= 3 AND v_avg < 2.0 THEN
        UPDATE marketplace_listings
        SET status = 'removed', updated_at = now()
        WHERE seller_id = p_seller_id AND status = 'active';
        RETURN true; -- delisted
    END IF;

    RETURN false;
END;
$$;

-- ═══════════════════════════════════════
-- 13. RPC: Check banned keywords in listing text
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION check_banned_keywords(p_text TEXT)
RETURNS TABLE (
    is_banned BOOLEAN,
    matched_keyword TEXT,
    reason TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        true AS is_banned,
        bk.keyword AS matched_keyword,
        bk.reason AS reason
    FROM marketplace_banned_keywords bk
    WHERE LOWER(p_text) LIKE '%' || LOWER(bk.keyword) || '%'
    LIMIT 1;

    -- If no match, return false
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, ''::TEXT, ''::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════
-- 14. RPC: Check if user is verified seller
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION is_verified_seller(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user RECORD;
BEGIN
    SELECT email, phone_verified, identity_verified
    INTO v_user FROM users WHERE id = p_user_id;

    IF v_user IS NULL THEN RETURN false; END IF;

    -- Verified = has email AND phone_verified
    RETURN (v_user.email IS NOT NULL AND v_user.email != '' AND v_user.phone_verified = true);
END;
$$;
