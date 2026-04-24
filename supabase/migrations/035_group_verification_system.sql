-- ═══════════════════════════════════════════════════════════════
-- Migration 020: Group Verification System
-- Allows group owners to verify ownership by posting a code
-- in their group description. Verified groups get a badge
-- and rank higher in search results.
-- ═══════════════════════════════════════════════════════════════

-- ─── Add is_verified flag to groups table ─────────────────────
ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_groups_is_verified ON groups(is_verified) WHERE is_verified = true;

-- ─── Group Verifications Table ────────────────────────────────
CREATE TABLE IF NOT EXISTS group_verifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    uid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    verification_code TEXT NOT NULL,
    method TEXT DEFAULT 'description' CHECK (method IN ('description', 'bot', 'manual')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now(),
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '48 hours'),
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT DEFAULT '',
    UNIQUE(group_id, verification_code)
);

CREATE INDEX IF NOT EXISTS idx_group_verifications_group ON group_verifications(group_id);
CREATE INDEX IF NOT EXISTS idx_group_verifications_uid ON group_verifications(uid);
CREATE INDEX IF NOT EXISTS idx_group_verifications_status ON group_verifications(status);
CREATE INDEX IF NOT EXISTS idx_group_verifications_code ON group_verifications(verification_code);

-- ─── RLS Policies ─────────────────────────────────────────────
ALTER TABLE group_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own verifications" ON group_verifications
    FOR SELECT USING (auth.uid() = uid);

CREATE POLICY "Users can create verifications for own groups" ON group_verifications
    FOR INSERT WITH CHECK (
        auth.uid() = uid AND
        EXISTS (SELECT 1 FROM groups WHERE id = group_id AND submitter_uid = auth.uid())
    );

CREATE POLICY "Admins manage all verifications" ON group_verifications
    FOR ALL USING ((SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin');

-- ─── RPC: Generate verification code ─────────────────────────
CREATE OR REPLACE FUNCTION generate_verification_code(p_group_id UUID, p_uid UUID)
RETURNS TABLE(verification_code TEXT, expires_at TIMESTAMPTZ) AS $$
DECLARE
    v_code TEXT;
    v_expires TIMESTAMPTZ;
    v_group_owner UUID;
BEGIN
    -- Check user owns this group
    SELECT submitter_uid INTO v_group_owner FROM groups WHERE id = p_group_id;
    IF v_group_owner IS NULL THEN
        RAISE EXCEPTION 'Group not found';
    END IF;
    IF v_group_owner != p_uid THEN
        RAISE EXCEPTION 'Not the group owner';
    END IF;

    -- Check if already verified
    IF EXISTS (SELECT 1 FROM groups WHERE id = p_group_id AND is_verified = true) THEN
        RAISE EXCEPTION 'Group is already verified';
    END IF;

    -- Expire any existing pending codes for this group
    UPDATE group_verifications
    SET status = 'expired'
    WHERE group_verifications.group_id = p_group_id AND status = 'pending';

    -- Generate unique code
    v_code := 'GMX-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    v_expires := now() + INTERVAL '48 hours';

    -- Insert new verification record
    INSERT INTO group_verifications (group_id, uid, verification_code, status, expires_at)
    VALUES (p_group_id, p_uid, v_code, 'pending', v_expires);

    RETURN QUERY SELECT v_code, v_expires;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── RPC: Confirm verification ───────────────────────────────
CREATE OR REPLACE FUNCTION confirm_group_verification(p_group_id UUID, p_uid UUID, p_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_record RECORD;
BEGIN
    -- Find matching pending verification
    SELECT * INTO v_record
    FROM group_verifications
    WHERE group_id = p_group_id
      AND uid = p_uid
      AND verification_code = p_code
      AND status = 'pending'
      AND expires_at > now()
    LIMIT 1;

    IF v_record IS NULL THEN
        RETURN false;
    END IF;

    -- Mark verification as verified
    UPDATE group_verifications
    SET status = 'verified', verified_at = now()
    WHERE id = v_record.id;

    -- Mark the group as verified
    UPDATE groups
    SET is_verified = true, verified_at = now()
    WHERE id = p_group_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── RPC: Get verification status ────────────────────────────
CREATE OR REPLACE FUNCTION get_verification_status(p_group_id UUID)
RETURNS TABLE(
    is_verified BOOLEAN,
    verified_at TIMESTAMPTZ,
    pending_code TEXT,
    pending_expires_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(g.is_verified, false),
        g.verified_at,
        gv.verification_code,
        gv.expires_at
    FROM groups g
    LEFT JOIN group_verifications gv
        ON gv.group_id = g.id AND gv.status = 'pending' AND gv.expires_at > now()
    WHERE g.id = p_group_id
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Update trust score to include verification bonus ────────
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

    -- Owner verification bonus
    IF COALESCE(NEW.is_verified, false) THEN
        score := score + 10;
    END IF;

    -- Clamp 0–100
    NEW.trust_score := GREATEST(0, LEAST(100, score));

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Backfill trust scores for any verified groups ───────────
-- (safe no-op if no verified groups exist yet)
UPDATE groups SET trust_score = trust_score WHERE is_verified = true;
