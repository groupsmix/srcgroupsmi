-- ============================================================
-- Custom Platforms + Category System + Auto-Growth Algorithm
-- ============================================================
-- 1. Add category column to marketplace_listings
-- 2. Create custom_platforms table for auto-growth
-- 3. RPC functions for custom platform tracking
-- ============================================================

-- 1. Add category column to marketplace_listings
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other';
CREATE INDEX IF NOT EXISTS idx_ml_category ON marketplace_listings (category);

-- 2. Create custom_platforms table for auto-growth algorithm
CREATE TABLE IF NOT EXISTS custom_platforms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE,
    usage_count INTEGER NOT NULL DEFAULT 1,
    is_promoted BOOLEAN NOT NULL DEFAULT false,
    category TEXT NOT NULL DEFAULT 'other',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cp_normalized ON custom_platforms (normalized_name);
CREATE INDEX IF NOT EXISTS idx_cp_usage ON custom_platforms (usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_cp_promoted ON custom_platforms (is_promoted) WHERE is_promoted = true;

-- 3. RPC: Increment custom platform usage and auto-promote at threshold (10)
CREATE OR REPLACE FUNCTION increment_custom_platform(p_name TEXT, p_category TEXT DEFAULT 'other')
RETURNS VOID AS $$
DECLARE
    v_normalized TEXT;
BEGIN
    v_normalized := lower(trim(p_name));
    INSERT INTO custom_platforms (name, normalized_name, usage_count, category)
    VALUES (trim(p_name), v_normalized, 1, COALESCE(p_category, 'other'))
    ON CONFLICT (normalized_name)
    DO UPDATE SET usage_count = custom_platforms.usage_count + 1, updated_at = now();

    -- Auto-promote if 10+ uses
    UPDATE custom_platforms SET is_promoted = true, updated_at = now()
    WHERE normalized_name = v_normalized AND usage_count >= 10 AND is_promoted = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: Get promoted custom platforms (auto-growth results)
CREATE OR REPLACE FUNCTION get_promoted_platforms()
RETURNS TABLE (
    name TEXT,
    normalized_name TEXT,
    usage_count INTEGER,
    category TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT cp.name, cp.normalized_name, cp.usage_count, cp.category
    FROM custom_platforms cp
    WHERE cp.is_promoted = true
    ORDER BY cp.usage_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RLS for custom_platforms
ALTER TABLE custom_platforms ENABLE ROW LEVEL SECURITY;
CREATE POLICY cp_select_all ON custom_platforms FOR SELECT USING (true);
