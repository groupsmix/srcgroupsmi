-- AUDIT: public
-- =============================================
-- Migration 024: Platform Features
-- Reading Analytics, Scheduled Publishing, Version History,
-- Collaborative Writing, Article Monetization (Paywall),
-- Plagiarism Detection, Newsletter Digest, Enhanced Trending
-- =============================================

-- ═══════════════════════════════════════
-- 1. SCHEDULED PUBLISHING
-- ═══════════════════════════════════════
ALTER TABLE articles ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_articles_scheduled ON articles(scheduled_at)
    WHERE scheduled_at IS NOT NULL AND status = 'draft';

-- RPC: Publish all articles whose scheduled_at has passed
CREATE OR REPLACE FUNCTION publish_scheduled_articles()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count INT := 0;
BEGIN
    UPDATE articles
    SET status = 'published',
        published_at = now(),
        scheduled_at = NULL
    WHERE scheduled_at IS NOT NULL
      AND scheduled_at <= now()
      AND status = 'draft';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════
-- 2. VERSION HISTORY / REVISIONS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS article_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    excerpt TEXT DEFAULT '',
    cover_image TEXT DEFAULT '',
    revision_number INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revisions_article ON article_revisions(article_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_user ON article_revisions(user_id);

-- RPC: Save a revision snapshot
CREATE OR REPLACE FUNCTION save_article_revision(
    p_article_id UUID,
    p_user_id UUID
)
RETURNS article_revisions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_revision article_revisions;
    v_next_num INT;
BEGIN
    SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_next_num
    FROM article_revisions WHERE article_id = p_article_id;

    INSERT INTO article_revisions (article_id, user_id, title, content, excerpt, cover_image, revision_number)
    SELECT p_article_id, p_user_id, a.title, a.content, a.excerpt, a.cover_image, v_next_num
    FROM articles a WHERE a.id = p_article_id
    RETURNING * INTO v_revision;

    RETURN v_revision;
END;
$$;

-- RPC: Get revisions for an article
CREATE OR REPLACE FUNCTION get_article_revisions(p_article_id UUID, p_limit INT DEFAULT 20)
RETURNS SETOF article_revisions
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM article_revisions
    WHERE article_id = p_article_id
    ORDER BY revision_number DESC
    LIMIT p_limit;
END;
$$;

-- RPC: Restore a specific revision
CREATE OR REPLACE FUNCTION restore_article_revision(p_revision_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_rev article_revisions;
BEGIN
    SELECT * INTO v_rev FROM article_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Revision not found');
    END IF;

    -- Save current state as a new revision before restoring
    PERFORM save_article_revision(v_rev.article_id, p_user_id);

    -- Restore article to revision state
    UPDATE articles
    SET title = v_rev.title,
        content = v_rev.content,
        excerpt = v_rev.excerpt,
        cover_image = v_rev.cover_image,
        updated_at = now()
    WHERE id = v_rev.article_id AND user_id = p_user_id;

    RETURN jsonb_build_object('action', 'restored', 'revision_number', v_rev.revision_number);
END;
$$;

-- RLS for article_revisions
ALTER TABLE article_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS revisions_select_own ON article_revisions;
CREATE POLICY revisions_select_own ON article_revisions FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM articles a WHERE a.id = article_id AND a.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS revisions_insert ON article_revisions;
CREATE POLICY revisions_insert ON article_revisions FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- ═══════════════════════════════════════
-- 3. COLLABORATIVE WRITING
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS article_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'editor' CHECK (role IN ('editor', 'reviewer', 'viewer')),
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    invited_at TIMESTAMPTZ DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    UNIQUE(article_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_collaborators_article ON article_collaborators(article_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_user ON article_collaborators(user_id);

-- RPC: Invite a collaborator
CREATE OR REPLACE FUNCTION invite_collaborator(
    p_article_id UUID,
    p_inviter_user_id UUID,
    p_invitee_username TEXT,
    p_role TEXT DEFAULT 'editor'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invitee users;
    v_article articles;
BEGIN
    -- Verify article ownership
    SELECT * INTO v_article FROM articles WHERE id = p_article_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Article not found');
    END IF;

    -- Find invitee by username
    SELECT * INTO v_invitee FROM users WHERE username = p_invitee_username;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'User not found');
    END IF;

    IF v_invitee.id = p_inviter_user_id THEN
        RETURN jsonb_build_object('error', 'Cannot invite yourself');
    END IF;

    -- Insert collaboration
    INSERT INTO article_collaborators (article_id, user_id, invited_by, role)
    VALUES (p_article_id, v_invitee.id, p_inviter_user_id, p_role)
    ON CONFLICT (article_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        status = 'pending',
        invited_at = now();

    -- Create notification for invitee
    INSERT INTO notifications (user_id, type, content_id, content_type, message)
    VALUES (v_invitee.auth_id, 'collaboration_invite', p_article_id::TEXT, 'article',
            'You have been invited to collaborate on "' || v_article.title || '"');

    RETURN jsonb_build_object('action', 'invited', 'user_id', v_invitee.id);
END;
$$;

-- RPC: Accept/decline collaboration
CREATE OR REPLACE FUNCTION respond_collaboration(p_collaboration_id UUID, p_user_id UUID, p_accept BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE article_collaborators
    SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
        accepted_at = CASE WHEN p_accept THEN now() ELSE NULL END
    WHERE id = p_collaboration_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Collaboration not found');
    END IF;

    RETURN jsonb_build_object('action', CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END);
END;
$$;

-- RLS for article_collaborators
ALTER TABLE article_collaborators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS collaborators_select ON article_collaborators;
CREATE POLICY collaborators_select ON article_collaborators FOR SELECT USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR invited_by = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND a.user_id = auth.uid())
);

DROP POLICY IF EXISTS collaborators_manage ON article_collaborators;
CREATE POLICY collaborators_manage ON article_collaborators FOR ALL USING (
    EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND a.user_id = auth.uid())
    OR user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
);

-- Update articles RLS to allow collaborators to edit
DROP POLICY IF EXISTS articles_update_collaborator ON articles;
CREATE POLICY articles_update_collaborator ON articles FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM article_collaborators ac
            JOIN users u ON u.id = ac.user_id AND u.auth_id = auth.uid()
            WHERE ac.article_id = id AND ac.status = 'accepted' AND ac.role = 'editor'
        )
    );

-- ═══════════════════════════════════════
-- 4. ARTICLE MONETIZATION (PAYWALL)
-- ═══════════════════════════════════════
ALTER TABLE articles ADD COLUMN IF NOT EXISTS coin_price INT DEFAULT 0;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS free_preview_pct INT DEFAULT 30;

CREATE TABLE IF NOT EXISTS article_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coins_paid INT NOT NULL DEFAULT 0,
    purchased_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(article_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_article_purchases_user ON article_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_article_purchases_article ON article_purchases(article_id);

-- RPC: Purchase an article with coins
CREATE OR REPLACE FUNCTION purchase_article(p_article_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_article articles;
    v_user users;
    v_price INT;
BEGIN
    SELECT * INTO v_article FROM articles WHERE id = p_article_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Article not found');
    END IF;

    v_price := COALESCE(v_article.coin_price, 0);
    IF v_price <= 0 THEN
        RETURN jsonb_build_object('error', 'Article is free');
    END IF;

    -- Check if already purchased
    IF EXISTS(SELECT 1 FROM article_purchases WHERE article_id = p_article_id AND user_id = p_user_id) THEN
        RETURN jsonb_build_object('action', 'already_purchased');
    END IF;

    -- Check user balance
    SELECT * INTO v_user FROM users WHERE id = p_user_id;
    IF NOT FOUND OR COALESCE(v_user.coins, 0) < v_price THEN
        RETURN jsonb_build_object('error', 'Insufficient coins', 'required', v_price, 'balance', COALESCE(v_user.coins, 0));
    END IF;

    -- Deduct coins from buyer
    UPDATE users SET coins = coins - v_price WHERE id = p_user_id;

    -- Credit author (90% to author, 10% platform fee)
    UPDATE users SET coins = COALESCE(coins, 0) + ROUND(v_price * 0.9)
    WHERE auth_id = v_article.user_id;

    -- Record purchase
    INSERT INTO article_purchases (article_id, user_id, coins_paid)
    VALUES (p_article_id, p_user_id, v_price);

    RETURN jsonb_build_object('action', 'purchased', 'coins_paid', v_price);
END;
$$;

-- RPC: Check if user has access to paywalled article
CREATE OR REPLACE FUNCTION check_article_access(p_article_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_article articles;
BEGIN
    SELECT * INTO v_article FROM articles WHERE id = p_article_id;
    IF NOT FOUND THEN RETURN false; END IF;

    -- Free article
    IF COALESCE(v_article.coin_price, 0) <= 0 THEN RETURN true; END IF;

    -- Author always has access
    IF v_article.user_id = (SELECT auth_id FROM users WHERE id = p_user_id) THEN RETURN true; END IF;

    -- Check purchase
    RETURN EXISTS(SELECT 1 FROM article_purchases WHERE article_id = p_article_id AND user_id = p_user_id);
END;
$$;

-- RLS for article_purchases
ALTER TABLE article_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchases_select_own ON article_purchases;
CREATE POLICY purchases_select_own ON article_purchases FOR SELECT
    USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS purchases_select_author ON article_purchases;
CREATE POLICY purchases_select_author ON article_purchases FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM articles a WHERE a.id = article_id AND a.user_id = auth.uid()
    ));

-- ═══════════════════════════════════════
-- 5. READING ANALYTICS (time-series views)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS article_views_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    view_date DATE NOT NULL DEFAULT CURRENT_DATE,
    view_count INT DEFAULT 1,
    unique_viewers INT DEFAULT 1,
    avg_read_pct NUMERIC(5,2) DEFAULT 0,
    UNIQUE(article_id, view_date)
);

CREATE INDEX IF NOT EXISTS idx_views_daily_article ON article_views_daily(article_id, view_date DESC);

CREATE TABLE IF NOT EXISTS article_traffic_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'direct',
    view_count INT DEFAULT 1,
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(article_id, source)
);

CREATE INDEX IF NOT EXISTS idx_traffic_sources_article ON article_traffic_sources(article_id);

-- RPC: Record a daily view (upsert)
CREATE OR REPLACE FUNCTION record_article_view_daily(p_article_id UUID, p_read_pct NUMERIC DEFAULT 0, p_source TEXT DEFAULT 'direct')
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Upsert daily view count
    INSERT INTO article_views_daily (article_id, view_date, view_count, unique_viewers, avg_read_pct)
    VALUES (p_article_id, CURRENT_DATE, 1, 1, p_read_pct)
    ON CONFLICT (article_id, view_date)
    DO UPDATE SET
        view_count = article_views_daily.view_count + 1,
        avg_read_pct = (article_views_daily.avg_read_pct * article_views_daily.view_count + p_read_pct)
            / (article_views_daily.view_count + 1);

    -- Upsert traffic source
    INSERT INTO article_traffic_sources (article_id, source, view_count, last_seen_at)
    VALUES (p_article_id, COALESCE(NULLIF(p_source, ''), 'direct'), 1, now())
    ON CONFLICT (article_id, source)
    DO UPDATE SET
        view_count = article_traffic_sources.view_count + 1,
        last_seen_at = now();
END;
$$;

-- RPC: Get author analytics (aggregated)
CREATE OR REPLACE FUNCTION get_author_analytics(p_user_id UUID, p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_result JSONB;
    v_daily JSONB;
    v_sources JSONB;
    v_top_articles JSONB;
    v_completion JSONB;
BEGIN
    -- Daily views for all author's articles
    SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb) INTO v_daily
    FROM (
        SELECT vd.view_date, SUM(vd.view_count) AS views, ROUND(AVG(vd.avg_read_pct), 1) AS avg_read_pct
        FROM article_views_daily vd
        JOIN articles a ON a.id = vd.article_id
        WHERE a.user_id = p_user_id AND vd.view_date >= CURRENT_DATE - p_days
        GROUP BY vd.view_date ORDER BY vd.view_date
    ) d;

    -- Traffic sources
    SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO v_sources
    FROM (
        SELECT ts.source, SUM(ts.view_count) AS views
        FROM article_traffic_sources ts
        JOIN articles a ON a.id = ts.article_id
        WHERE a.user_id = p_user_id
        GROUP BY ts.source ORDER BY views DESC LIMIT 10
    ) s;

    -- Top articles by views
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top_articles
    FROM (
        SELECT a.id, a.title, a.slug, a.views, a.like_count, a.comment_count,
               COALESCE(a.reading_time, 0) AS reading_time
        FROM articles a
        WHERE a.user_id = p_user_id AND a.status = 'published'
        ORDER BY a.views DESC LIMIT 10
    ) t;

    -- Read completion rates
    SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::jsonb) INTO v_completion
    FROM (
        SELECT a.id, a.title, a.slug,
               ROUND(AVG(rh.read_percentage), 1) AS avg_completion,
               COUNT(rh.id) AS total_readers
        FROM articles a
        LEFT JOIN article_reading_history rh ON rh.article_id = a.id
        WHERE a.user_id = p_user_id AND a.status = 'published'
        GROUP BY a.id, a.title, a.slug
        ORDER BY avg_completion DESC LIMIT 10
    ) c;

    v_result := jsonb_build_object(
        'daily_views', v_daily,
        'traffic_sources', v_sources,
        'top_articles', v_top_articles,
        'completion_rates', v_completion
    );

    RETURN v_result;
END;
$$;

-- RLS for analytics tables
ALTER TABLE article_views_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_traffic_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS views_daily_select ON article_views_daily;
CREATE POLICY views_daily_select ON article_views_daily FOR SELECT USING (
    EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND a.user_id = auth.uid())
);
DROP POLICY IF EXISTS views_daily_manage ON article_views_daily;
CREATE POLICY views_daily_manage ON article_views_daily FOR ALL USING (true);

DROP POLICY IF EXISTS traffic_sources_select ON article_traffic_sources;
CREATE POLICY traffic_sources_select ON article_traffic_sources FOR SELECT USING (
    EXISTS (SELECT 1 FROM articles a WHERE a.id = article_id AND a.user_id = auth.uid())
);
DROP POLICY IF EXISTS traffic_sources_manage ON article_traffic_sources;
CREATE POLICY traffic_sources_manage ON article_traffic_sources FOR ALL USING (true);

-- ═══════════════════════════════════════
-- 6. PLAGIARISM DETECTION (content hashes)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS article_content_hashes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE UNIQUE,
    content_hash TEXT NOT NULL,
    shingle_hashes JSONB DEFAULT '[]',
    word_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_hashes_article ON article_content_hashes(article_id);
CREATE INDEX IF NOT EXISTS idx_content_hashes_hash ON article_content_hashes(content_hash);

ALTER TABLE article_content_hashes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_hashes_select ON article_content_hashes;
CREATE POLICY content_hashes_select ON article_content_hashes FOR SELECT USING (true);

DROP POLICY IF EXISTS content_hashes_manage ON article_content_hashes;
CREATE POLICY content_hashes_manage ON article_content_hashes FOR ALL USING (true);

-- ═══════════════════════════════════════
-- 7. NEWSLETTER DIGEST
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS newsletter_digests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscriber_email TEXT NOT NULL,
    articles JSONB DEFAULT '[]',
    subject TEXT DEFAULT '',
    html_content TEXT DEFAULT '',
    sent_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_digests_email ON newsletter_digests(subscriber_email);
CREATE INDEX IF NOT EXISTS idx_digests_status ON newsletter_digests(status);
CREATE INDEX IF NOT EXISTS idx_digests_sent ON newsletter_digests(sent_at DESC);

ALTER TABLE newsletter_digests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS digests_manage ON newsletter_digests;
CREATE POLICY digests_manage ON newsletter_digests FOR ALL USING (true);

-- ═══════════════════════════════════════
-- 8. ENHANCED TRENDING — use velocity scores for articles feed
-- Create a convenience view that joins trending_scores with articles
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_trending_articles_v2(p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS SETOF articles
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT a.*
    FROM articles a
    LEFT JOIN trending_scores ts ON ts.content_id = a.id::TEXT AND ts.content_type = 'article'
    WHERE a.status = 'published'
      AND a.moderation_status = 'approved'
    ORDER BY COALESCE(ts.velocity_score, 0) DESC,
             (COALESCE(a.like_count, 0) * 2 + COALESCE(a.comment_count, 0) * 3 + COALESCE(a.views, 0) * 0.1 + COALESCE(a.share_count, 0) * 5) DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ═══════════════════════════════════════
-- 9. AUTHOR EARNINGS TRACKING (for monetization)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION get_author_earnings(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_earnings', COALESCE(SUM(ap.coins_paid * 0.9), 0),
        'total_sales', COUNT(ap.id),
        'articles_sold', COUNT(DISTINCT ap.article_id)
    ) INTO v_result
    FROM article_purchases ap
    JOIN articles a ON a.id = ap.article_id
    WHERE a.user_id = p_user_id;

    RETURN v_result;
END;
$$;
