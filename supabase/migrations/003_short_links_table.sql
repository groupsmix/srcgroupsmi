-- ============================================================
-- ISSUE #3: Link Shortener — Server-side short links table
-- ============================================================
-- Stores shortened links with click tracking.
-- Used by /api/shorten (create) and /go?code=X (redirect+track).
-- ============================================================

CREATE TABLE IF NOT EXISTS short_links (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    long_url    TEXT NOT NULL,
    creator_uid UUID REFERENCES users(id) ON DELETE SET NULL,
    clicks      INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast code lookups
CREATE INDEX IF NOT EXISTS idx_short_links_code ON short_links (code);

-- Click tracking table for analytics
CREATE TABLE IF NOT EXISTS link_clicks (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    link_id     UUID REFERENCES short_links(id) ON DELETE CASCADE,
    country     TEXT DEFAULT 'Unknown',
    device      TEXT DEFAULT 'Unknown',
    referrer    TEXT DEFAULT '',
    clicked_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_link_clicks_link_id ON link_clicks (link_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_clicked_at ON link_clicks (clicked_at);

-- RLS: anyone can read short_links (for redirect), only authenticated users can create
ALTER TABLE short_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE link_clicks ENABLE ROW LEVEL SECURITY;

-- Public read access for redirect lookups
CREATE POLICY "Public read short_links" ON short_links FOR SELECT USING (true);
-- Authenticated users can insert
CREATE POLICY "Auth insert short_links" ON short_links FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
-- Users can update their own links
CREATE POLICY "Owner update short_links" ON short_links FOR UPDATE USING (creator_uid = auth.uid());

-- Audit fix #11: restrict link_clicks inserts to authenticated users to prevent fake analytics injection
CREATE POLICY "Auth insert link_clicks" ON link_clicks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Public read link_clicks" ON link_clicks FOR SELECT USING (true);

-- RPC to increment click count atomically
CREATE OR REPLACE FUNCTION increment_link_clicks(p_link_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE short_links SET clicks = clicks + 1 WHERE id = p_link_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
