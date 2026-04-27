-- AUDIT: public
-- ═══════════════════════════════════════════════════════════════
-- Migration 013: New Features
-- Newsletter, Wishlist, Referrals, Analytics, A/B Testing,
-- Push Subscriptions, Purchase History
-- ═══════════════════════════════════════════════════════════════

-- ─── Newsletter Subscribers ─────────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT DEFAULT '',
    source TEXT DEFAULT 'popup',          -- popup, footer, landing, manual
    status TEXT DEFAULT 'active' CHECK (status IN ('active','unsubscribed','bounced')),
    tags TEXT[] DEFAULT '{}',
    uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    confirmed BOOLEAN DEFAULT false,
    confirm_token UUID DEFAULT gen_random_uuid(),
    ip_address TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    unsubscribed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_created ON newsletter_subscribers(created_at DESC);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe" ON newsletter_subscribers
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users read own subscription" ON newsletter_subscribers
    FOR SELECT USING (auth.uid() = uid OR (SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin');
CREATE POLICY "Admins manage all" ON newsletter_subscribers
    FOR ALL USING ((SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin');

-- ─── Wishlist ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    uid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content_id TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'group' CHECK (content_type IN ('group','store','marketplace','article')),
    title TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    metadata JSONB DEFAULT '{}',
    notes TEXT DEFAULT '',
    priority INTEGER DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(uid, content_id, content_type)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_uid ON wishlists(uid);
CREATE INDEX IF NOT EXISTS idx_wishlist_type ON wishlists(content_type);

ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wishlist" ON wishlists
    FOR ALL USING (auth.uid() = uid);

-- ─── Referrals / Affiliate System ───────────────────────────
CREATE TABLE IF NOT EXISTS referral_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    uid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    commission_rate NUMERIC(5,2) DEFAULT 10.00,    -- percentage
    total_clicks INTEGER DEFAULT 0,
    total_signups INTEGER DEFAULT 0,
    total_purchases INTEGER DEFAULT 0,
    total_earned NUMERIC(10,2) DEFAULT 0.00,
    status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','banned')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_uid ON referral_codes(uid);

CREATE TABLE IF NOT EXISTS referral_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    referrer_uid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('click','signup','purchase')),
    referred_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    order_id TEXT DEFAULT '',
    amount NUMERIC(10,2) DEFAULT 0.00,
    commission NUMERIC(10,2) DEFAULT 0.00,
    metadata JSONB DEFAULT '{}',
    ip_address TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_events_referrer ON referral_events(referrer_uid);
CREATE INDEX IF NOT EXISTS idx_referral_events_code ON referral_events(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_events_type ON referral_events(event_type);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own referral codes" ON referral_codes
    FOR ALL USING (auth.uid() = uid);
CREATE POLICY "Users read own referral events" ON referral_events
    FOR SELECT USING (auth.uid() = referrer_uid);
CREATE POLICY "System inserts referral events" ON referral_events
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins manage referrals" ON referral_codes
    FOR ALL USING ((SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin');
CREATE POLICY "Admins read all referral events" ON referral_events
    FOR ALL USING ((SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin');

-- ─── Analytics Events ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_name TEXT NOT NULL,
    event_category TEXT DEFAULT 'general',
    event_data JSONB DEFAULT '{}',
    page_path TEXT DEFAULT '',
    referrer TEXT DEFAULT '',
    uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id TEXT DEFAULT '',
    ip_address TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    country TEXT DEFAULT '',
    device_type TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_category ON analytics_events(event_category);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_page ON analytics_events(page_path);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert analytics" ON analytics_events
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins read analytics" ON analytics_events
    FOR SELECT USING ((SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin');

-- ─── A/B Tests ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ab_tests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    element_selector TEXT DEFAULT '',
    variants JSONB NOT NULL DEFAULT '[{"id":"control","label":"Control","weight":50},{"id":"variant_a","label":"Variant A","weight":50}]',
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed')),
    traffic_percent INTEGER DEFAULT 100 CHECK (traffic_percent BETWEEN 1 AND 100),
    target_pages TEXT[] DEFAULT '{}',
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ab_test_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    variant_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(test_id, visitor_id)
);

CREATE TABLE IF NOT EXISTS ab_test_conversions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL,
    visitor_id TEXT NOT NULL,
    conversion_type TEXT DEFAULT 'click',
    conversion_value NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_test ON ab_test_assignments(test_id);
CREATE INDEX IF NOT EXISTS idx_ab_conversions_test ON ab_test_conversions(test_id);

ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ab tests" ON ab_tests
    FOR ALL USING ((SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin');
CREATE POLICY "Anyone gets assigned" ON ab_test_assignments
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Read own assignments" ON ab_test_assignments
    FOR SELECT USING (true);
CREATE POLICY "Anyone can convert" ON ab_test_conversions
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins read conversions" ON ab_test_conversions
    FOR SELECT USING ((SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin');

-- ─── Push Notification Subscriptions ────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    uid UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    user_agent TEXT DEFAULT '',
    topics TEXT[] DEFAULT '{new_product,special_offer,weekly_digest}',
    status TEXT DEFAULT 'active' CHECK (status IN ('active','expired','unsubscribed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_uid ON push_subscriptions(uid);
CREATE INDEX IF NOT EXISTS idx_push_status ON push_subscriptions(status);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe push" ON push_subscriptions
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users manage own push" ON push_subscriptions
    FOR ALL USING (auth.uid() = uid);
CREATE POLICY "Admins manage push" ON push_subscriptions
    FOR ALL USING ((SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin');

-- ─── Purchase History (LemonSqueezy orders synced via webhook) ─
CREATE TABLE IF NOT EXISTS purchases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    order_id TEXT NOT NULL UNIQUE,
    product_id TEXT NOT NULL,
    product_name TEXT DEFAULT '',
    variant_id TEXT DEFAULT '',
    variant_name TEXT DEFAULT '',
    price INTEGER DEFAULT 0,           -- cents
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'paid' CHECK (status IN ('paid','refunded','disputed','pending')),
    receipt_url TEXT DEFAULT '',
    license_key TEXT DEFAULT '',
    order_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    refunded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_purchases_uid ON purchases(uid);
CREATE INDEX IF NOT EXISTS idx_purchases_email ON purchases(email);
CREATE INDEX IF NOT EXISTS idx_purchases_order ON purchases(order_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own purchases" ON purchases
    FOR SELECT USING (
        auth.uid() = uid OR
        email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );
CREATE POLICY "System inserts purchases" ON purchases
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins manage purchases" ON purchases
    FOR ALL USING ((SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin');

-- ─── RPC Functions ──────────────────────────────────────────

-- Increment referral clicks
CREATE OR REPLACE FUNCTION increment_referral_clicks(p_code TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE referral_codes SET total_clicks = total_clicks + 1 WHERE code = p_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment referral signups
CREATE OR REPLACE FUNCTION increment_referral_signups(p_code TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE referral_codes SET total_signups = total_signups + 1 WHERE code = p_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment referral purchases
CREATE OR REPLACE FUNCTION increment_referral_purchases(p_code TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE referral_codes SET total_purchases = total_purchases + 1 WHERE code = p_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get analytics summary (admin only)
CREATE OR REPLACE FUNCTION get_analytics_summary(p_days INTEGER DEFAULT 30)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    since TIMESTAMPTZ := now() - (p_days || ' days')::INTERVAL;
BEGIN
    SELECT jsonb_build_object(
        'total_events', (SELECT count(*) FROM analytics_events WHERE created_at >= since),
        'unique_sessions', (SELECT count(DISTINCT session_id) FROM analytics_events WHERE created_at >= since AND session_id != ''),
        'top_pages', (SELECT jsonb_agg(row_to_json(t)) FROM (
            SELECT page_path, count(*) as views FROM analytics_events WHERE created_at >= since AND page_path != '' GROUP BY page_path ORDER BY views DESC LIMIT 10
        ) t),
        'top_events', (SELECT jsonb_agg(row_to_json(t)) FROM (
            SELECT event_name, count(*) as total FROM analytics_events WHERE created_at >= since GROUP BY event_name ORDER BY total DESC LIMIT 10
        ) t),
        'daily_views', (SELECT jsonb_agg(row_to_json(t)) FROM (
            SELECT date_trunc('day', created_at)::DATE as day, count(*) as views FROM analytics_events WHERE created_at >= since AND event_name = 'page_view' GROUP BY day ORDER BY day
        ) t),
        'top_countries', (SELECT jsonb_agg(row_to_json(t)) FROM (
            SELECT country, count(*) as total FROM analytics_events WHERE created_at >= since AND country != '' GROUP BY country ORDER BY total DESC LIMIT 10
        ) t),
        'device_breakdown', (SELECT jsonb_agg(row_to_json(t)) FROM (
            SELECT device_type, count(*) as total FROM analytics_events WHERE created_at >= since AND device_type != '' GROUP BY device_type ORDER BY total DESC
        ) t)
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get newsletter stats (admin only)
CREATE OR REPLACE FUNCTION get_newsletter_stats()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM newsletter_subscribers),
        'active', (SELECT count(*) FROM newsletter_subscribers WHERE status = 'active'),
        'unsubscribed', (SELECT count(*) FROM newsletter_subscribers WHERE status = 'unsubscribed'),
        'today', (SELECT count(*) FROM newsletter_subscribers WHERE created_at::DATE = CURRENT_DATE),
        'this_week', (SELECT count(*) FROM newsletter_subscribers WHERE created_at >= now() - INTERVAL '7 days'),
        'this_month', (SELECT count(*) FROM newsletter_subscribers WHERE created_at >= now() - INTERVAL '30 days'),
        'by_source', (SELECT jsonb_agg(row_to_json(t)) FROM (
            SELECT source, count(*) as total FROM newsletter_subscribers GROUP BY source ORDER BY total DESC
        ) t)
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get referral stats for a user
CREATE OR REPLACE FUNCTION get_referral_stats(p_uid UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_clicks', COALESCE((SELECT SUM(total_clicks) FROM referral_codes WHERE uid = p_uid), 0),
        'total_signups', COALESCE((SELECT SUM(total_signups) FROM referral_codes WHERE uid = p_uid), 0),
        'total_purchases', COALESCE((SELECT SUM(total_purchases) FROM referral_codes WHERE uid = p_uid), 0),
        'total_earned', COALESCE((SELECT SUM(total_earned) FROM referral_codes WHERE uid = p_uid), 0),
        'codes', (SELECT jsonb_agg(row_to_json(t)) FROM (
            SELECT code, total_clicks, total_signups, total_purchases, total_earned, status, created_at
            FROM referral_codes WHERE uid = p_uid ORDER BY created_at DESC
        ) t),
        'recent_events', (SELECT jsonb_agg(row_to_json(t)) FROM (
            SELECT event_type, referral_code, amount, commission, created_at
            FROM referral_events WHERE referrer_uid = p_uid ORDER BY created_at DESC LIMIT 20
        ) t)
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get A/B test results
CREATE OR REPLACE FUNCTION get_ab_test_results(p_test_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'test', (SELECT row_to_json(t) FROM (SELECT * FROM ab_tests WHERE id = p_test_id) t),
        'assignments', (SELECT jsonb_agg(row_to_json(t)) FROM (
            SELECT variant_id, count(*) as total FROM ab_test_assignments WHERE test_id = p_test_id GROUP BY variant_id
        ) t),
        'conversions', (SELECT jsonb_agg(row_to_json(t)) FROM (
            SELECT variant_id, count(*) as total, SUM(conversion_value) as total_value
            FROM ab_test_conversions WHERE test_id = p_test_id GROUP BY variant_id
        ) t)
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
