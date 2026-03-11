-- ═══════════════════════════════════════════════════════════
-- Migration 007: Maintenance Mode System
-- Creates site_settings table for maintenance mode controls
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS site_settings (
    id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton row
    maintenance_mode    BOOLEAN     NOT NULL DEFAULT FALSE,
    store_locked        BOOLEAN     NOT NULL DEFAULT FALSE,
    maintenance_message TEXT        NOT NULL DEFAULT 'We are updating the site. Please check back soon.',
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert the default row if it doesn't exist
INSERT INTO site_settings (id, maintenance_mode, store_locked, maintenance_message)
VALUES (1, FALSE, FALSE, 'We are updating the site. Please check back soon.')
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read (anon + authenticated) so the middleware can check
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read site_settings"
    ON site_settings FOR SELECT
    USING (true);

-- Only admins can update
CREATE POLICY "Admins can update site_settings"
    ON site_settings FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
              AND users.role = 'admin'
        )
    );
