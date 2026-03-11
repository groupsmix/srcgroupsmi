-- ============================================================
-- Marketplace Listings + Seller Reviews System
-- ============================================================
-- 1. marketplace_listings table for buy/sell social media accounts/services
-- 2. seller_reviews table for rating sellers
-- 3. RPC functions for atomic stat updates
-- 4. Indexes for performance
-- ============================================================

-- 1. Create marketplace_listings table
CREATE TABLE IF NOT EXISTS marketplace_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    contact_link TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'sold', 'rejected', 'removed')),
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    reports INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create seller_reviews table
CREATE TABLE IF NOT EXISTS seller_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id UUID REFERENCES marketplace_listings(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(reviewer_id, seller_id)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_ml_seller_id ON marketplace_listings (seller_id);
CREATE INDEX IF NOT EXISTS idx_ml_status ON marketplace_listings (status);
CREATE INDEX IF NOT EXISTS idx_ml_platform ON marketplace_listings (platform);
CREATE INDEX IF NOT EXISTS idx_ml_status_created ON marketplace_listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_impressions ON marketplace_listings (impressions);
CREATE INDEX IF NOT EXISTS idx_ml_clicks ON marketplace_listings (clicks);
CREATE INDEX IF NOT EXISTS idx_sr_seller_id ON seller_reviews (seller_id);
CREATE INDEX IF NOT EXISTS idx_sr_reviewer_id ON seller_reviews (reviewer_id);

-- 4. RPC: Increment marketplace listing impressions
CREATE OR REPLACE FUNCTION increment_listing_impressions(p_listing_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE marketplace_listings SET impressions = impressions + 1 WHERE id = p_listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: Increment marketplace listing clicks
CREATE OR REPLACE FUNCTION increment_listing_clicks(p_listing_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE marketplace_listings SET clicks = clicks + 1 WHERE id = p_listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: Increment marketplace listing reports
CREATE OR REPLACE FUNCTION increment_listing_reports(p_listing_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE marketplace_listings SET reports = reports + 1 WHERE id = p_listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC: Get seller average rating and review count
CREATE OR REPLACE FUNCTION get_seller_stats(p_seller_id UUID)
RETURNS TABLE (
    avg_rating NUMERIC,
    review_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(ROUND(AVG(sr.rating)::NUMERIC, 1), 0) AS avg_rating,
        COUNT(sr.id) AS review_count
    FROM seller_reviews sr
    WHERE sr.seller_id = p_seller_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Enable RLS
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_reviews ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies for marketplace_listings
-- Anyone can read active listings
CREATE POLICY ml_select_active ON marketplace_listings
    FOR SELECT USING (status = 'active' OR seller_id = auth.uid());

-- Authenticated users can insert their own listings
CREATE POLICY ml_insert_own ON marketplace_listings
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND seller_id = auth.uid());

-- Users can update their own listings
CREATE POLICY ml_update_own ON marketplace_listings
    FOR UPDATE USING (seller_id = auth.uid());

-- 10. RLS Policies for seller_reviews
-- Anyone can read reviews
CREATE POLICY sr_select_all ON seller_reviews
    FOR SELECT USING (true);

-- Authenticated users can insert reviews (not for themselves)
CREATE POLICY sr_insert_own ON seller_reviews
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND reviewer_id = auth.uid() AND seller_id != auth.uid());
