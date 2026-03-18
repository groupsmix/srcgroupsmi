-- ============================================================
-- GROWTH FEATURES MIGRATION
-- Bot integrations, referral tracking, group of the day,
-- enhanced reviews, and widget tracking
-- ============================================================

-- ── Bot Integrations Table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_integrations (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id          UUID REFERENCES groups(id) ON DELETE CASCADE,
    platform          TEXT NOT NULL DEFAULT 'whatsapp',
    admin_uid         UUID REFERENCES users(id) ON DELETE SET NULL,
    group_name        TEXT DEFAULT '',
    group_link        TEXT DEFAULT '',
    verification_code TEXT,
    bot_token         TEXT UNIQUE,
    status            TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'error')),
    member_count      INTEGER DEFAULT 0,
    active_members    INTEGER DEFAULT 0,
    last_sync         TIMESTAMPTZ,
    verified_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_integrations_group_id ON bot_integrations (group_id);
CREATE INDEX IF NOT EXISTS idx_bot_integrations_bot_token ON bot_integrations (bot_token);
CREATE INDEX IF NOT EXISTS idx_bot_integrations_status ON bot_integrations (status);

ALTER TABLE bot_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read bot_integrations" ON bot_integrations FOR SELECT USING (true);
CREATE POLICY "Auth insert bot_integrations" ON bot_integrations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update bot_integrations" ON bot_integrations FOR UPDATE USING (true);

-- ── Referral Tracking Table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    referrer_uid    UUID REFERENCES users(id) ON DELETE CASCADE,
    referred_uid    UUID REFERENCES users(id) ON DELETE CASCADE,
    referral_code   TEXT NOT NULL,
    status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rewarded')),
    reward_coins    INTEGER DEFAULT 50,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    UNIQUE(referrer_uid, referred_uid)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_uid);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals (referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals (status);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own referrals" ON referrals FOR SELECT USING (referrer_uid = auth.uid() OR referred_uid = auth.uid());
CREATE POLICY "Auth insert referrals" ON referrals FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update referrals" ON referrals FOR UPDATE USING (referrer_uid = auth.uid());

-- ── Add referral_code column to users ───────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0;

-- ── Group of the Day History ────────────────────────────────
CREATE TABLE IF NOT EXISTS group_of_day (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id    UUID REFERENCES groups(id) ON DELETE CASCADE,
    featured_date DATE NOT NULL UNIQUE,
    views       INTEGER DEFAULT 0,
    clicks      INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_of_day_date ON group_of_day (featured_date);

ALTER TABLE group_of_day ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read group_of_day" ON group_of_day FOR SELECT USING (true);
CREATE POLICY "Service insert group_of_day" ON group_of_day FOR INSERT WITH CHECK (true);

-- ── Widget Impressions Tracking ─────────────────────────────
CREATE TABLE IF NOT EXISTS widget_impressions (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id    UUID REFERENCES groups(id) ON DELETE CASCADE,
    hostname    TEXT DEFAULT '',
    page_url    TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_widget_impressions_group ON widget_impressions (group_id);
CREATE INDEX IF NOT EXISTS idx_widget_impressions_date ON widget_impressions (created_at);

ALTER TABLE widget_impressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert widget_impressions" ON widget_impressions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read widget_impressions" ON widget_impressions FOR SELECT USING (true);

-- ── Enhanced link_clicks: add browser column ────────────────
ALTER TABLE link_clicks ADD COLUMN IF NOT EXISTS browser TEXT DEFAULT 'Unknown';

-- ── RPC: Generate referral code for user ────────────────────
CREATE OR REPLACE FUNCTION generate_referral_code(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
    code TEXT;
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    i INTEGER;
BEGIN
    -- Check if user already has a code
    SELECT referral_code INTO code FROM users WHERE id = p_user_id;
    IF code IS NOT NULL THEN RETURN code; END IF;

    -- Generate unique 8-char code
    LOOP
        code := 'GMX';
        FOR i IN 1..5 LOOP
            code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
        END LOOP;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE referral_code = code);
    END LOOP;

    UPDATE users SET referral_code = code WHERE id = p_user_id;
    RETURN code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: Process referral reward ────────────────────────────
CREATE OR REPLACE FUNCTION process_referral(p_referral_code TEXT, p_new_user_id UUID)
RETURNS JSON AS $$
DECLARE
    referrer_id UUID;
    reward INTEGER := 50;
    referral_id UUID;
BEGIN
    -- Find the referrer
    SELECT id INTO referrer_id FROM users WHERE referral_code = p_referral_code;
    IF referrer_id IS NULL THEN RETURN '{"ok": false, "error": "Invalid referral code"}'::JSON; END IF;
    IF referrer_id = p_new_user_id THEN RETURN '{"ok": false, "error": "Cannot refer yourself"}'::JSON; END IF;

    -- Check if already referred
    IF EXISTS (SELECT 1 FROM referrals WHERE referred_uid = p_new_user_id) THEN
        RETURN '{"ok": false, "error": "Already referred"}'::JSON;
    END IF;

    -- Create referral record
    INSERT INTO referrals (referrer_uid, referred_uid, referral_code, status, reward_coins)
    VALUES (referrer_id, p_new_user_id, p_referral_code, 'completed', reward)
    RETURNING id INTO referral_id;

    -- Update referrer stats
    UPDATE users SET referral_count = COALESCE(referral_count, 0) + 1 WHERE id = referrer_id;

    -- Set referred_by on new user
    UPDATE users SET referred_by = referrer_id WHERE id = p_new_user_id;

    RETURN json_build_object('ok', true, 'referral_id', referral_id, 'referrer_id', referrer_id, 'reward', reward);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
