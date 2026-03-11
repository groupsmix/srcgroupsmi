-- ============================================================
-- Smart Ads System + Organic Ranking Algorithm
-- ============================================================
-- 1. Add target_category to ads table for niche-based targeting
-- 2. Create/replace RPC functions for safe atomic stat updates
-- 3. Add supporting indexes
-- ============================================================

-- 1. Add target_category column to ads table
ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_category TEXT DEFAULT '';

-- 2. Index for fast category-based ad lookups
CREATE INDEX IF NOT EXISTS idx_ads_target_category ON ads (target_category);
CREATE INDEX IF NOT EXISTS idx_ads_status_position_category ON ads (status, position, target_category);

-- 3. Index for ranking queries on groups (last 7 days engagement)
CREATE INDEX IF NOT EXISTS idx_groups_status_category ON groups (status, category);
CREATE INDEX IF NOT EXISTS idx_groups_clicks ON groups (clicks);

-- 4. RPC: Increment ad impressions atomically
-- Audit fix #6: require authentication to prevent anonymous stat inflation
CREATE OR REPLACE FUNCTION increment_ad_impressions(p_ad_id UUID)
RETURNS VOID AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    UPDATE ads SET impressions = impressions + 1 WHERE id = p_ad_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: Increment ad clicks atomically
-- Audit fix #6: require authentication to prevent anonymous stat inflation
CREATE OR REPLACE FUNCTION increment_ad_clicks(p_ad_id UUID)
RETURNS VOID AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    UPDATE ads SET ad_clicks = ad_clicks + 1 WHERE id = p_ad_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: Fetch ad insights for an advertiser (by user id)
CREATE OR REPLACE FUNCTION get_ad_insights(p_uid UUID)
RETURNS TABLE (
    ad_id UUID,
    title TEXT,
    position TEXT,
    target_category TEXT,
    status TEXT,
    impressions INTEGER,
    ad_clicks INTEGER,
    ctr NUMERIC,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id AS ad_id,
        a.title,
        a.position,
        a.target_category,
        a.status,
        a.impressions,
        a.ad_clicks,
        CASE WHEN a.impressions > 0
            THEN ROUND((a.ad_clicks::NUMERIC / a.impressions::NUMERIC) * 100, 2)
            ELSE 0
        END AS ctr,
        a.expires_at,
        a.created_at
    FROM ads a
    WHERE a.uid = p_uid
    ORDER BY a.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
