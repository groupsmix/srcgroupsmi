-- ============================================================
-- Migration 026: Server-Side Input Validation for Pending Submissions
-- ============================================================
-- SEC-1: Group submissions currently rely on client-side sanitization only.
-- An attacker can bypass client-side JS entirely (curl, Postman, devtools)
-- and submit malicious content directly via the Supabase REST API.
--
-- This trigger sanitizes and validates all pending submissions server-side
-- before they are inserted, preventing stored XSS and invalid data.
-- ============================================================

-- ═══════════════════════════════════════
-- 1. SANITIZE + VALIDATE TRIGGER FUNCTION
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION sanitize_pending_submission()
RETURNS TRIGGER AS $$
BEGIN
    -- Enforce name length (3-100 characters)
    IF length(COALESCE(NEW.name, '')) < 3 OR length(NEW.name) > 100 THEN
        RAISE EXCEPTION 'Group name must be between 3 and 100 characters';
    END IF;

    -- Strip HTML tags from name and description to prevent stored XSS
    NEW.name := regexp_replace(NEW.name, '<[^>]+>', '', 'g');
    NEW.description := regexp_replace(COALESCE(NEW.description, ''), '<[^>]+>', '', 'g');

    -- Strip HTML from city if present
    NEW.city := regexp_replace(COALESCE(NEW.city, ''), '<[^>]+>', '', 'g');

    -- Validate link format (must be https)
    IF NEW.link IS NULL OR NEW.link !~ '^https://' THEN
        RAISE EXCEPTION 'Group link must use HTTPS';
    END IF;

    -- Validate category against allowed values
    -- (matches CONFIG.categories in public/assets/js/modules/config.js)
    IF NEW.category NOT IN (
        'crypto', 'technology', 'gaming', 'education', 'business',
        'jobs', 'marketing', 'entertainment', 'music', 'sports',
        'health', 'food', 'travel', 'fashion', 'art', 'photography',
        'news', 'science', 'books', 'movies', 'anime', 'pets',
        'cars', 'realestate', 'religion', 'parenting', 'languages',
        'programming', 'memes', 'dating', 'other'
    ) THEN
        RAISE EXCEPTION 'Invalid category: %', NEW.category;
    END IF;

    -- Validate platform against allowed values
    IF NEW.platform NOT IN (
        'whatsapp', 'telegram', 'discord', 'facebook'
    ) THEN
        RAISE EXCEPTION 'Invalid platform: %', NEW.platform;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════
-- 2. ATTACH TRIGGER TO PENDING TABLE
-- ═══════════════════════════════════════
DROP TRIGGER IF EXISTS trigger_sanitize_pending ON pending;
CREATE TRIGGER trigger_sanitize_pending
    BEFORE INSERT ON pending
    FOR EACH ROW
    EXECUTE FUNCTION sanitize_pending_submission();


-- ═══════════════════════════════════════
-- 3. FIX RACE CONDITION IN approve_group RPC (MISC-1)
--    Move description padding into the RPC so the operation is atomic.
--    Previously, db.js updated the description in a separate call before
--    calling the RPC, creating a race condition if two admins approve
--    simultaneously or if the update succeeds but the RPC fails.
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION approve_group(p_pending_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pending RECORD;
    v_safe_desc TEXT;
BEGIN
    -- Verify caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM users
        WHERE auth_id = auth.uid()
        AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Access denied: admin role required';
    END IF;

    -- Fetch the pending record
    SELECT * INTO v_pending FROM pending WHERE id = p_pending_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pending submission not found: %', p_pending_id;
    END IF;

    -- Check it hasn't already been processed
    IF v_pending.status != 'pending' THEN
        RAISE EXCEPTION 'Submission already processed (status: %)', v_pending.status;
    END IF;

    -- Handle description padding atomically within the RPC
    -- Ensures groups_description_check constraint (min ~20 chars) is satisfied
    v_safe_desc := COALESCE(NULLIF(TRIM(v_pending.description), ''), '');
    IF length(v_safe_desc) < 20 THEN
        IF length(v_safe_desc) > 0 THEN
            v_safe_desc := v_safe_desc || ' — Community group on GroupsMix.';
        ELSE
            v_safe_desc := 'Community group on GroupsMix.';
        END IF;
        -- Update pending row description for consistency
        UPDATE pending SET description = v_safe_desc WHERE id = p_pending_id;
    END IF;

    -- Insert into groups table
    INSERT INTO groups (
        name, link, platform, platform_type, category,
        country, city, language, description, tags,
        search_terms, submitter_uid, submitter_email,
        status, approved_at
    ) VALUES (
        v_pending.name, v_pending.link, v_pending.platform,
        v_pending.platform_type, v_pending.category,
        v_pending.country, v_pending.city, v_pending.language,
        v_safe_desc, v_pending.tags,
        v_pending.search_terms, v_pending.submitter_uid,
        v_pending.submitter_email,
        'approved', NOW()
    );

    -- Mark pending as approved
    UPDATE pending
    SET status = 'approved'
    WHERE id = p_pending_id;

    -- Try to increment group count (ignore if function doesn't exist)
    BEGIN
        PERFORM increment_group_count();
    EXCEPTION WHEN undefined_function THEN
        -- ignore, counter function may not exist
    END;
END;
$$;
