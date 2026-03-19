-- ═══════════════════════════════════════════════════════════════
-- Migration 021: Community Events / Meetups Board
-- Group owners can post events, users can discover and RSVP.
-- ═══════════════════════════════════════════════════════════════

-- ─── Community Events Table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS community_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
    creator_uid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
    description TEXT DEFAULT '' CHECK (char_length(description) <= 5000),
    event_type TEXT DEFAULT 'online' CHECK (event_type IN ('online', 'in_person', 'hybrid')),
    platform TEXT DEFAULT '',              -- e.g. 'whatsapp', 'telegram', 'discord', 'zoom', 'google_meet'
    platform_link TEXT DEFAULT '',         -- join link for online events
    location TEXT DEFAULT '',              -- physical location for in_person/hybrid
    city TEXT DEFAULT '',
    country TEXT DEFAULT '',
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    timezone TEXT DEFAULT 'UTC',
    max_attendees INTEGER DEFAULT 0,       -- 0 = unlimited
    cover_image TEXT DEFAULT '',
    tags TEXT[] DEFAULT '{}',
    category TEXT DEFAULT '',
    is_recurring BOOLEAN DEFAULT false,
    recurrence_rule TEXT DEFAULT '',        -- e.g. 'weekly', 'monthly'
    status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
    rsvp_count INTEGER DEFAULT 0,
    interested_count INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_group ON community_events(group_id);
CREATE INDEX IF NOT EXISTS idx_events_creator ON community_events(creator_uid);
CREATE INDEX IF NOT EXISTS idx_events_status ON community_events(status);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON community_events(start_date);
CREATE INDEX IF NOT EXISTS idx_events_type ON community_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_category ON community_events(category);
CREATE INDEX IF NOT EXISTS idx_events_country ON community_events(country);
CREATE INDEX IF NOT EXISTS idx_events_created ON community_events(created_at DESC);

-- Full-text search index on title
CREATE INDEX IF NOT EXISTS idx_events_title_search ON community_events USING gin(to_tsvector('english', title));

-- ─── Event RSVPs Table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_rsvps (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
    uid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'going' CHECK (status IN ('going', 'interested', 'not_going')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(event_id, uid)
);

CREATE INDEX IF NOT EXISTS idx_rsvps_event ON event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_uid ON event_rsvps(uid);
CREATE INDEX IF NOT EXISTS idx_rsvps_status ON event_rsvps(status);

-- ─── RLS Policies ─────────────────────────────────────────────
ALTER TABLE community_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

-- Events: anyone can read published, creators can manage own
CREATE POLICY "Anyone can read published events" ON community_events
    FOR SELECT USING (status = 'published' OR auth.uid() = creator_uid);

CREATE POLICY "Authenticated users can create events" ON community_events
    FOR INSERT WITH CHECK (auth.uid() = creator_uid);

CREATE POLICY "Creators can update own events" ON community_events
    FOR UPDATE USING (auth.uid() = creator_uid);

CREATE POLICY "Creators can delete own events" ON community_events
    FOR DELETE USING (auth.uid() = creator_uid);

CREATE POLICY "Admins manage all events" ON community_events
    FOR ALL USING ((SELECT role FROM public.users WHERE auth_id = auth.uid()) = 'admin');

-- RSVPs: anyone can read, users manage own
CREATE POLICY "Anyone can read RSVPs" ON event_rsvps
    FOR SELECT USING (true);

CREATE POLICY "Users can RSVP" ON event_rsvps
    FOR INSERT WITH CHECK (auth.uid() = uid);

CREATE POLICY "Users update own RSVP" ON event_rsvps
    FOR UPDATE USING (auth.uid() = uid);

CREATE POLICY "Users delete own RSVP" ON event_rsvps
    FOR DELETE USING (auth.uid() = uid);

-- ─── RPC: Increment event views ──────────────────────────────
CREATE OR REPLACE FUNCTION increment_event_views(p_event_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE community_events SET views = views + 1 WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── RPC: RSVP to event (upsert + update counts) ────────────
CREATE OR REPLACE FUNCTION rsvp_to_event(p_event_id UUID, p_uid UUID, p_status TEXT)
RETURNS JSONB AS $$
DECLARE
    v_event RECORD;
    v_old_status TEXT;
    v_rsvp_count INTEGER;
    v_interested_count INTEGER;
BEGIN
    -- Check event exists and is published
    SELECT * INTO v_event FROM community_events WHERE id = p_event_id AND status = 'published';
    IF v_event IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Event not found or not published');
    END IF;

    -- Check max attendees for 'going' status
    IF p_status = 'going' AND v_event.max_attendees > 0 THEN
        SELECT count(*) INTO v_rsvp_count FROM event_rsvps
        WHERE event_id = p_event_id AND status = 'going' AND uid != p_uid;
        IF v_rsvp_count >= v_event.max_attendees THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Event is full');
        END IF;
    END IF;

    -- Get existing RSVP status
    SELECT er.status INTO v_old_status FROM event_rsvps er
    WHERE er.event_id = p_event_id AND er.uid = p_uid;

    -- Upsert RSVP
    IF p_status = 'not_going' AND v_old_status IS NOT NULL THEN
        DELETE FROM event_rsvps WHERE event_id = p_event_id AND uid = p_uid;
    ELSIF v_old_status IS NOT NULL THEN
        UPDATE event_rsvps SET status = p_status, updated_at = now()
        WHERE event_id = p_event_id AND uid = p_uid;
    ELSE
        INSERT INTO event_rsvps (event_id, uid, status)
        VALUES (p_event_id, p_uid, p_status);
    END IF;

    -- Update counts on event
    SELECT count(*) INTO v_rsvp_count FROM event_rsvps
    WHERE event_id = p_event_id AND status = 'going';
    SELECT count(*) INTO v_interested_count FROM event_rsvps
    WHERE event_id = p_event_id AND status = 'interested';

    UPDATE community_events
    SET rsvp_count = v_rsvp_count, interested_count = v_interested_count
    WHERE id = p_event_id;

    RETURN jsonb_build_object('ok', true, 'rsvp_count', v_rsvp_count, 'interested_count', v_interested_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── RPC: Get upcoming events ────────────────────────────────
CREATE OR REPLACE FUNCTION get_upcoming_events(
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_category TEXT DEFAULT '',
    p_event_type TEXT DEFAULT '',
    p_country TEXT DEFAULT ''
)
RETURNS TABLE(
    id UUID,
    group_id UUID,
    group_name TEXT,
    group_platform TEXT,
    group_is_verified BOOLEAN,
    creator_uid UUID,
    title TEXT,
    description TEXT,
    event_type TEXT,
    platform TEXT,
    platform_link TEXT,
    location TEXT,
    city TEXT,
    country TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    timezone TEXT,
    max_attendees INTEGER,
    cover_image TEXT,
    tags TEXT[],
    category TEXT,
    status TEXT,
    rsvp_count INTEGER,
    interested_count INTEGER,
    views INTEGER,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id, e.group_id,
        g.name AS group_name,
        g.platform AS group_platform,
        COALESCE(g.is_verified, false) AS group_is_verified,
        e.creator_uid, e.title, e.description, e.event_type,
        e.platform, e.platform_link, e.location, e.city, e.country,
        e.start_date, e.end_date, e.timezone, e.max_attendees,
        e.cover_image, e.tags, e.category, e.status,
        e.rsvp_count, e.interested_count, e.views, e.created_at
    FROM community_events e
    LEFT JOIN groups g ON g.id = e.group_id
    WHERE e.status = 'published'
      AND e.start_date >= now()
      AND (p_category = '' OR e.category = p_category)
      AND (p_event_type = '' OR e.event_type = p_event_type)
      AND (p_country = '' OR e.country = p_country)
    ORDER BY e.start_date ASC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
