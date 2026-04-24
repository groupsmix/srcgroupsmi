-- ═══════════════════════════════════════
-- 036_full_text_search.sql
-- ═══════════════════════════════════════

-- 1. Add tsvector column for groups (pending and approved)
ALTER TABLE pending ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(city, '')), 'C')
) STORED;

ALTER TABLE approved ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(city, '')), 'C')
) STORED;

-- 2. Create GIN indexes for fast full-text search
CREATE INDEX IF NOT EXISTS idx_pending_search_vector ON pending USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_approved_search_vector ON approved USING GIN(search_vector);

-- 3. Add duplicate detection function (Trigram similarity or exact URL match)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION check_duplicate_group(p_url TEXT, p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    -- Check for exact URL match or very similar name in either pending or approved
    SELECT EXISTS (
        SELECT 1 FROM pending 
        WHERE link = p_url OR similarity(name, p_name) > 0.8
        UNION ALL
        SELECT 1 FROM approved 
        WHERE link = p_url OR similarity(name, p_name) > 0.8
    ) INTO v_exists;
    
    RETURN v_exists;
END;
$$;
