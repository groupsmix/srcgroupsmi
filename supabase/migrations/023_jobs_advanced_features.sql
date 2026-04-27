-- ═══════════════════════════════════════════════════════════════
-- Migration 023: Jobs Advanced Features
-- Adds tables for: job alerts, application tracking, employer profiles,
-- salary insights, job expiration, featured/boosted jobs, referral bounties,
-- interview scheduling
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Job Alerts / Saved Searches ──────────────────────────────
CREATE TABLE IF NOT EXISTS job_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    name TEXT NOT NULL DEFAULT 'My Alert',
    filters JSONB NOT NULL DEFAULT '{}',
    -- filters: { category, jobType, locationType, region, platform, language, salaryMin, search }
    frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('instant', 'daily', 'weekly')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_alerts_user ON job_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_job_alerts_active ON job_alerts(is_active) WHERE is_active = true;

-- ── 2. Application Tracking System ──────────────────────────────
-- Extend existing job_applications table (create if not exists)
CREATE TABLE IF NOT EXISTS job_applications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL,
    user_id UUID NOT NULL,
    applicant_name TEXT NOT NULL,
    applicant_email TEXT NOT NULL,
    portfolio_url TEXT DEFAULT '',
    cover_message TEXT DEFAULT '',
    resume_url TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'shortlisted', 'rejected', 'hired')),
    employer_notes TEXT DEFAULT '',
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(job_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_job_applications_job ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_user ON job_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_status ON job_applications(status);

-- ── 3. Employer Profiles & Verified Badges ──────────────────────
CREATE TABLE IF NOT EXISTS employer_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    company_name TEXT NOT NULL,
    company_description TEXT DEFAULT '',
    company_logo_url TEXT DEFAULT '',
    company_website TEXT DEFAULT '',
    company_size TEXT DEFAULT '' CHECK (company_size IN ('', '1-10', '11-50', '51-200', '201-500', '500+')),
    industry TEXT DEFAULT '',
    location TEXT DEFAULT '',
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    total_jobs_posted INTEGER NOT NULL DEFAULT 0,
    total_hires INTEGER NOT NULL DEFAULT 0,
    avg_response_hours NUMERIC(6,1) DEFAULT NULL,
    rating NUMERIC(3,2) DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employer_profiles_user ON employer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_employer_profiles_verified ON employer_profiles(is_verified) WHERE is_verified = true;

-- ── 4. User Resumes (for AI Resume Parser) ─────────────────────
CREATE TABLE IF NOT EXISTS user_resumes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    resume_url TEXT DEFAULT '',
    linkedin_url TEXT DEFAULT '',
    parsed_skills TEXT[] DEFAULT '{}',
    parsed_experience JSONB DEFAULT '[]',
    parsed_education JSONB DEFAULT '[]',
    parsed_summary TEXT DEFAULT '',
    raw_text TEXT DEFAULT '',
    parsed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_resumes_user ON user_resumes(user_id);

-- ── 5. Salary Insights (aggregated from job posts) ──────────────
CREATE TABLE IF NOT EXISTS salary_insights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category TEXT NOT NULL,
    role_title TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'worldwide',
    sample_count INTEGER NOT NULL DEFAULT 0,
    salary_min_avg NUMERIC(10,2) DEFAULT 0,
    salary_max_avg NUMERIC(10,2) DEFAULT 0,
    salary_median NUMERIC(10,2) DEFAULT 0,
    salary_currency TEXT NOT NULL DEFAULT 'USD',
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(category, role_title, region)
);

CREATE INDEX IF NOT EXISTS idx_salary_insights_category ON salary_insights(category);
CREATE INDEX IF NOT EXISTS idx_salary_insights_role ON salary_insights(role_title);

-- ── 6. Job Expiration & Auto-Renewal ────────────────────────────
-- Add expiration columns to jobs table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'expires_at') THEN
        ALTER TABLE jobs ADD COLUMN expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'is_expired') THEN
        ALTER TABLE jobs ADD COLUMN is_expired BOOLEAN NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'renewal_count') THEN
        ALTER TABLE jobs ADD COLUMN renewal_count INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'expiry_notified') THEN
        ALTER TABLE jobs ADD COLUMN expiry_notified BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- ── 7. Featured / Boosted Jobs ──────────────────────────────────
CREATE TABLE IF NOT EXISTS job_boosts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL,
    user_id UUID NOT NULL,
    boost_type TEXT NOT NULL CHECK (boost_type IN ('featured', 'highlighted', 'pinned')),
    coins_spent INTEGER NOT NULL DEFAULT 0,
    starts_at TIMESTAMPTZ DEFAULT now(),
    ends_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_boosts_job ON job_boosts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_boosts_active ON job_boosts(is_active, ends_at) WHERE is_active = true;

-- ── 9. Referral Bounties ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_referral_bounties (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL,
    employer_id UUID NOT NULL,
    bounty_coins INTEGER NOT NULL DEFAULT 0,
    bounty_description TEXT DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_bounties_job ON job_referral_bounties(job_id);

CREATE TABLE IF NOT EXISTS job_referrals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL,
    referrer_id UUID NOT NULL,
    referred_user_id UUID,
    referred_email TEXT NOT NULL,
    referral_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'hired', 'paid')),
    coins_earned INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_job ON job_referrals(job_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON job_referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON job_referrals(referral_code);

-- ── 10. Interview Scheduling ────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_slots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL,
    application_id UUID NOT NULL,
    employer_id UUID NOT NULL,
    candidate_id UUID NOT NULL,
    proposed_times JSONB NOT NULL DEFAULT '[]',
    -- Array of { datetime: ISO string, duration_minutes: number }
    selected_time TIMESTAMPTZ,
    selected_duration INTEGER DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    meeting_link TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_slots_job ON interview_slots(job_id);
CREATE INDEX IF NOT EXISTS idx_interview_slots_application ON interview_slots(application_id);
CREATE INDEX IF NOT EXISTS idx_interview_slots_candidate ON interview_slots(candidate_id);

-- ── Helper function: increment job views ────────────────────────
CREATE OR REPLACE FUNCTION increment_job_views(p_job_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE jobs SET views = COALESCE(views, 0) + 1 WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- ── Helper function: expire old jobs ────────────────────────────
CREATE OR REPLACE FUNCTION expire_old_jobs()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE jobs
    SET is_expired = true, status = 'expired'
    WHERE expires_at < now()
      AND is_expired = false
      AND status = 'active';
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- ── Enable RLS ──────────────────────────────────────────────────
ALTER TABLE job_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_boosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_referral_bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_slots ENABLE ROW LEVEL SECURITY;

-- Default policies to fail-closed
-- Access must be granted via specific policies
