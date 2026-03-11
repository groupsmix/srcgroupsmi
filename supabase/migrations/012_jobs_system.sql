-- ============================================================
-- Jobs System — Full AI-Powered Job Board
-- ============================================================
-- 1. jobs table for job listings
-- 2. job_applications table for tracking applications
-- 3. user_skills table for smart matching
-- 4. RPC functions for atomic operations
-- 5. Indexes for performance
-- 6. RLS policies
-- ============================================================

-- 1. Create jobs table
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poster_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    company_name TEXT NOT NULL DEFAULT '',
    salary_min NUMERIC(12,2) DEFAULT NULL,
    salary_max NUMERIC(12,2) DEFAULT NULL,
    salary_currency TEXT NOT NULL DEFAULT 'USD',
    job_type TEXT NOT NULL DEFAULT 'full-time' CHECK (job_type IN ('full-time', 'part-time', 'freelance', 'contract', 'internship')),
    category TEXT NOT NULL DEFAULT 'other',
    ai_category TEXT DEFAULT NULL,
    location TEXT NOT NULL DEFAULT 'Remote',
    is_remote BOOLEAN NOT NULL DEFAULT true,
    contact_link TEXT NOT NULL DEFAULT '',
    contact_email TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'closed', 'rejected', 'expired')),
    is_promoted BOOLEAN NOT NULL DEFAULT false,
    promoted_until TIMESTAMPTZ DEFAULT NULL,
    early_access_until TIMESTAMPTZ DEFAULT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    applications_count INTEGER NOT NULL DEFAULT 0,
    reports INTEGER NOT NULL DEFAULT 0,
    skills_required TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create job_applications table
CREATE TABLE IF NOT EXISTS job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cover_letter TEXT NOT NULL DEFAULT '',
    resume_url TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'accepted', 'rejected')),
    match_score INTEGER DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(job_id, applicant_id)
);

-- 3. Create user_skills table
CREATE TABLE IF NOT EXISTS user_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skills TEXT[] NOT NULL DEFAULT '{}',
    bio TEXT NOT NULL DEFAULT '',
    resume_url TEXT DEFAULT NULL,
    looking_for_work BOOLEAN NOT NULL DEFAULT false,
    preferred_job_types TEXT[] DEFAULT '{}',
    preferred_categories TEXT[] DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_poster_id ON jobs (poster_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs (category);
CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON jobs (job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_promoted ON jobs (is_promoted, promoted_until);
CREATE INDEX IF NOT EXISTS idx_jobs_early_access ON jobs (early_access_until);
CREATE INDEX IF NOT EXISTS idx_jobs_is_remote ON jobs (is_remote);
CREATE INDEX IF NOT EXISTS idx_ja_job_id ON job_applications (job_id);
CREATE INDEX IF NOT EXISTS idx_ja_applicant_id ON job_applications (applicant_id);
CREATE INDEX IF NOT EXISTS idx_us_user_id ON user_skills (user_id);
CREATE INDEX IF NOT EXISTS idx_us_looking ON user_skills (looking_for_work);

-- 5. RPC: Increment job views
CREATE OR REPLACE FUNCTION increment_job_views(p_job_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE jobs SET views = views + 1 WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: Increment job applications count
CREATE OR REPLACE FUNCTION increment_job_applications(p_job_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE jobs SET applications_count = applications_count + 1 WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC: Increment job reports
CREATE OR REPLACE FUNCTION increment_job_reports(p_job_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE jobs SET reports = reports + 1 WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RPC: Get jobs with smart matching score
CREATE OR REPLACE FUNCTION get_matched_jobs(p_user_skills TEXT[], p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
    job_id UUID,
    match_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        j.id AS job_id,
        CASE
            WHEN cardinality(j.skills_required) = 0 THEN 50
            ELSE LEAST(100, (
                SELECT COUNT(*)::INTEGER * 100 / GREATEST(cardinality(j.skills_required), 1)
                FROM unnest(j.skills_required) AS req_skill
                WHERE req_skill = ANY(p_user_skills)
            ))
        END AS match_score
    FROM jobs j
    WHERE j.status = 'active'
    ORDER BY match_score DESC, j.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Enable RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;

-- 10. RLS Policies for jobs
-- Anyone can read active jobs (respecting early_access)
CREATE POLICY jobs_select_active ON jobs
    FOR SELECT USING (
        status = 'active'
        OR poster_id = auth.uid()
    );

-- Authenticated users can insert their own jobs
CREATE POLICY jobs_insert_own ON jobs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND poster_id = auth.uid());

-- Users can update their own jobs
CREATE POLICY jobs_update_own ON jobs
    FOR UPDATE USING (poster_id = auth.uid());

-- 11. RLS Policies for job_applications
-- Job poster can see applications for their jobs
CREATE POLICY ja_select_own ON job_applications
    FOR SELECT USING (
        applicant_id = auth.uid()
        OR EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_applications.job_id AND jobs.poster_id = auth.uid())
    );

-- Authenticated users can insert applications
CREATE POLICY ja_insert_own ON job_applications
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND applicant_id = auth.uid());

-- Applicants can update their own applications
CREATE POLICY ja_update_own ON job_applications
    FOR UPDATE USING (applicant_id = auth.uid());

-- 12. RLS Policies for user_skills
-- Users can read their own skills profile
CREATE POLICY us_select_own ON user_skills
    FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own skills
CREATE POLICY us_insert_own ON user_skills
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- Users can update their own skills
CREATE POLICY us_update_own ON user_skills
    FOR UPDATE USING (user_id = auth.uid());
