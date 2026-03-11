-- ============================================================
-- ISSUE #4: Server-side Trust Score Calculation
-- ============================================================
-- Mirrors the client-side Algorithms.calculateTrustScore logic
-- so that trust_score is stored in the DB and consistent across
-- all clients. Runs as a trigger on INSERT/UPDATE of groups.
-- ============================================================

-- 1. Add trust_score column if it doesn't exist
ALTER TABLE groups ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 0;

-- 2. Create the calculation function
CREATE OR REPLACE FUNCTION calculate_trust_score()
RETURNS TRIGGER AS $$
DECLARE
    score INTEGER := 20;
    tier TEXT;
    avg_rating NUMERIC;
    review_count INTEGER;
    views INTEGER;
    reports INTEGER;
BEGIN
    -- Determine effective VIP tier (check expiry)
    tier := COALESCE(NEW.vip_tier, 'none');
    IF tier != 'none' AND (NEW.vip_expiry IS NULL OR NOW() > NEW.vip_expiry) THEN
        tier := 'none';
    END IF;

    -- VIP bonus
    score := score + CASE tier
        WHEN 'verified' THEN 15
        WHEN 'niche'    THEN 20
        WHEN 'global'   THEN 25
        WHEN 'diamond'  THEN 30
        ELSE 0
    END;

    -- Review bonus
    avg_rating  := COALESCE(NEW.avg_rating, 0);
    review_count := COALESCE(NEW.review_count, 0);
    IF review_count >= 3 THEN
        score := score + LEAST(25, ROUND(avg_rating * 5)::INTEGER);
    ELSIF review_count >= 1 THEN
        score := score + LEAST(15, ROUND(avg_rating * 3)::INTEGER);
    END IF;

    -- Views bonus
    views := COALESCE(NEW.views, 0);
    IF views >= 1000 THEN score := score + 15;
    ELSIF views >= 500 THEN score := score + 10;
    ELSIF views >= 100 THEN score := score + 5;
    ELSIF views >= 10  THEN score := score + 2;
    END IF;

    -- Reports penalty
    reports := COALESCE(NEW.reports, 0);
    IF reports = 0 THEN score := score + 10;
    ELSIF reports <= 2 THEN score := score + 5;
    ELSE score := score - LEAST(30, reports * 5);
    END IF;

    -- Clamp 0–100
    NEW.trust_score := GREATEST(0, LEAST(100, score));

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS trg_calculate_trust_score ON groups;
CREATE TRIGGER trg_calculate_trust_score
    BEFORE INSERT OR UPDATE ON groups
    FOR EACH ROW
    EXECUTE FUNCTION calculate_trust_score();

-- 4. Backfill existing rows
-- (Run this once after applying the migration)
UPDATE groups SET trust_score = trust_score WHERE id = id;
