/**
 * /api/jobs-board — Advanced Jobs Board Features for GroupsMix
 *
 * Cloudflare Pages Function providing:
 * 1.  Job Alerts (saved searches)
 * 2.  Application Tracking (in-app apply + status management)
 * 3.  Employer Profiles & Verified Badges
 * 4.  AI Resume/Skills Parser
 * 5.  Salary Insights
 * 6.  Job Expiration & Renewal
 * 7.  Featured/Boosted Jobs (GMX Coins)
 * 8.  Skill Gap Analysis (AI)
 * 9.  Referral Bounties
 * 10. Interview Scheduling
 */

const ALLOWED_ORIGINS = [
    'https://groupsmix.com',
    'https://www.groupsmix.com'
];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };
}

/* ── Rate limiter ─────────────────────────────────────────────── */
const ipBuckets = new Map();
function checkRateLimit(ip, action) {
    const now = Date.now();
    const window = 60000;
    const max = 15;
    const key = ip + ':jobs-board:' + action;
    let bucket = ipBuckets.get(key);
    if (!bucket) { bucket = []; ipBuckets.set(key, bucket); }
    const recent = bucket.filter((t) => { return now - t < window; });
    if (recent.length >= max) { ipBuckets.set(key, recent); return false; }
    recent.push(now);
    ipBuckets.set(key, recent);
    if (ipBuckets.size > 2000) {
        for (let [k, v] of ipBuckets) {
            const f = v.filter((t) => { return now - t < 120000; });
            if (f.length === 0) ipBuckets.delete(k);
            else ipBuckets.set(k, f);
        }
    }
    return true;
}

/* ── Supabase helper ──────────────────────────────────────────── */
function supaFetch(supabaseUrl, supabaseKey, path, options) {
    const url = supabaseUrl + '/rest/v1/' + path;
    const headers = {
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': options && options.prefer ? options.prefer : 'return=representation'
    };
    return fetch(url, {
        method: options && options.method ? options.method : 'GET',
        headers: headers,
        body: options && options.body ? JSON.stringify(options.body) : undefined
    });
}

/* ── AI helper ────────────────────────────────────────────────── */
async function callAI(apiKey, prompt, maxTokens) {
    maxTokens = maxTokens || 500;
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://groupsmix.com',
            'X-Title': 'GroupsMix Jobs'
        },
        body: JSON.stringify({
            model: 'meta-llama/llama-3.1-8b-instruct:free',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature: 0.3
        })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : '';
    return content.trim();
}

function parseAIJSON(content) {
    if (!content) return null;
    try {
        const jsonStr = content.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        try {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
        } catch (e2) { /* ignore */ }
        return null;
    }
}

/* ═══════════════════════════════════════════════════════════════ */
/* 1. JOB ALERTS                                                  */
/* ═══════════════════════════════════════════════════════════════ */
async function handleJobAlerts(env, body) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
    const sub = body.sub_action || 'list';
    const userId = body.user_id;
    if (!userId) return { ok: false, error: 'Missing user_id' };

    if (sub === 'create') {
        let filters = body.filters || {};
        let name = body.name || 'My Alert';
        let frequency = body.frequency || 'daily';
        const res = await supaFetch(supabaseUrl, supabaseKey, 'job_alerts', {
            method: 'POST',
            body: { user_id: userId, name: name, filters: filters, frequency: frequency }
        });
        const data = await res.json();
        return { ok: true, alert: Array.isArray(data) ? data[0] : data };
    }

    if (sub === 'update') {
        const alertId = body.alert_id;
        if (!alertId) return { ok: false, error: 'Missing alert_id' };
        const updates = {};
        if (body.name !== undefined) updates.name = body.name;
        if (body.filters !== undefined) updates.filters = body.filters;
        if (body.frequency !== undefined) updates.frequency = body.frequency;
        if (body.is_active !== undefined) updates.is_active = body.is_active;
        updates.updated_at = new Date().toISOString();
        const res = await supaFetch(supabaseUrl, supabaseKey, 'job_alerts?id=eq.' + alertId + '&user_id=eq.' + userId, {
            method: 'PATCH',
            body: updates
        });
        return { ok: true };
    }

    if (sub === 'delete') {
        const alertId = body.alert_id;
        if (!alertId) return { ok: false, error: 'Missing alert_id' };
        await supaFetch(supabaseUrl, supabaseKey, 'job_alerts?id=eq.' + alertId + '&user_id=eq.' + userId, {
            method: 'DELETE',
            prefer: 'return=minimal'
        });
        return { ok: true };
    }

    // Default: list
    const res = await supaFetch(supabaseUrl, supabaseKey, 'job_alerts?user_id=eq.' + encodeURIComponent(userId) + '&order=created_at.desc');
    const alerts = await res.json();
    return { ok: true, alerts: alerts || [] };
}

/* ═══════════════════════════════════════════════════════════════ */
/* 2. APPLICATION TRACKING                                        */
/* ═══════════════════════════════════════════════════════════════ */
async function handleApplications(env, body) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
    const sub = body.sub_action || 'list';
    const userId = body.user_id;
    if (!userId) return { ok: false, error: 'Missing user_id' };

    if (sub === 'apply') {
        const jobId = body.job_id;
        if (!jobId) return { ok: false, error: 'Missing job_id' };
        const appData = {
            job_id: jobId,
            user_id: userId,
            applicant_name: body.applicant_name || '',
            applicant_email: body.applicant_email || '',
            portfolio_url: body.portfolio_url || '',
            cover_message: body.cover_message || '',
            resume_url: body.resume_url || '',
            status: 'pending'
        };
        const res = await supaFetch(supabaseUrl, supabaseKey, 'job_applications', {
            method: 'POST',
            body: appData,
            prefer: 'return=representation,resolution=merge-duplicates'
        });
        const data = await res.json();
        // Increment applications_count on jobs
        await supaFetch(supabaseUrl, supabaseKey, 'rpc/increment_applications', {
            method: 'POST',
            body: { p_job_id: jobId }
        });
        return { ok: true, application: Array.isArray(data) ? data[0] : data };
    }

    if (sub === 'update-status') {
        // Employer updating applicant status
        const appId = body.application_id;
        if (!appId) return { ok: false, error: 'Missing application_id' };
        const updates = { updated_at: new Date().toISOString() };
        if (body.status) updates.status = body.status;
        if (body.employer_notes !== undefined) updates.employer_notes = body.employer_notes;
        if (body.status === 'reviewed' || body.status === 'shortlisted' || body.status === 'rejected') {
            updates.reviewed_at = new Date().toISOString();
        }
        // If hired, update employer profile hire count
        if (body.status === 'hired') {
            await supaFetch(supabaseUrl, supabaseKey, 'rpc/increment_employer_hires', {
                method: 'POST',
                body: { p_user_id: userId }
            });
        }
        await supaFetch(supabaseUrl, supabaseKey, 'job_applications?id=eq.' + appId, {
            method: 'PATCH',
            body: updates
        });
        return { ok: true };
    }

    if (sub === 'employer-list') {
        // Employer views applicants for a specific job
        const jobId = body.job_id;
        if (!jobId) return { ok: false, error: 'Missing job_id' };
        const res = await supaFetch(supabaseUrl, supabaseKey,
            'job_applications?job_id=eq.' + jobId + '&order=created_at.desc');
        const apps = await res.json();
        return { ok: true, applications: apps || [] };
    }

    if (sub === 'my-applications') {
        // Candidate views their applications
        const res = await supaFetch(supabaseUrl, supabaseKey,
            'job_applications?user_id=eq.' + encodeURIComponent(userId) + '&order=created_at.desc');
        const apps = await res.json();
        return { ok: true, applications: apps || [] };
    }

    return { ok: false, error: 'Unknown sub_action' };
}

/* ═══════════════════════════════════════════════════════════════ */
/* 3. EMPLOYER PROFILES                                           */
/* ═══════════════════════════════════════════════════════════════ */
async function handleEmployerProfile(env, body) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
    const sub = body.sub_action || 'get';
    const userId = body.user_id;

    if (sub === 'get') {
        const targetId = body.employer_id || userId;
        if (!targetId) return { ok: false, error: 'Missing employer_id' };
        const res = await supaFetch(supabaseUrl, supabaseKey,
            'employer_profiles?user_id=eq.' + encodeURIComponent(targetId) + '&limit=1');
        const data = await res.json();
        const profile = Array.isArray(data) && data.length > 0 ? data[0] : null;
        return { ok: true, profile: profile };
    }

    if (sub === 'upsert') {
        if (!userId) return { ok: false, error: 'Missing user_id' };
        const profileData = {
            user_id: userId,
            company_name: body.company_name || '',
            company_description: body.company_description || '',
            company_logo_url: body.company_logo_url || '',
            company_website: body.company_website || '',
            company_size: body.company_size || '',
            industry: body.industry || '',
            location: body.location || '',
            updated_at: new Date().toISOString()
        };
        const res = await supaFetch(supabaseUrl, supabaseKey, 'employer_profiles', {
            method: 'POST',
            body: profileData,
            prefer: 'return=representation,resolution=merge-duplicates'
        });
        const data = await res.json();
        return { ok: true, profile: Array.isArray(data) ? data[0] : data };
    }

    return { ok: false, error: 'Unknown sub_action' };
}

/* ═══════════════════════════════════════════════════════════════ */
/* 4. AI RESUME/SKILLS PARSER                                     */
/* ═══════════════════════════════════════════════════════════════ */
async function handleResumeParser(env, body) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
    const apiKey = env.OPENROUTER_API_KEY || '';
    const userId = body.user_id;
    if (!userId) return { ok: false, error: 'Missing user_id' };

    const resumeText = body.resume_text || '';
    const linkedinUrl = body.linkedin_url || '';

    if (!resumeText && !linkedinUrl) {
        return { ok: false, error: 'Provide resume_text or linkedin_url' };
    }

    if (!apiKey) {
        return { ok: false, error: 'AI parsing temporarily unavailable' };
    }

    const inputText = resumeText || ('LinkedIn Profile: ' + linkedinUrl);

    const prompt = 'You are a resume parser. Extract structured information from this resume/profile text.\n\n' +
        'Text:\n' + inputText.substring(0, 3000) + '\n\n' +
        'Respond with ONLY a JSON object (no markdown):\n' +
        '{\n' +
        '  "skills": ["skill1", "skill2", ...],\n' +
        '  "experience": [{"title": "...", "company": "...", "duration": "...", "description": "..."}],\n' +
        '  "education": [{"degree": "...", "school": "...", "year": "..."}],\n' +
        '  "summary": "1-2 sentence professional summary"\n' +
        '}';

    const aiContent = await callAI(apiKey, prompt, 800);
    const parsed = parseAIJSON(aiContent);

    if (!parsed) {
        return { ok: false, error: 'Failed to parse resume. Please try again.' };
    }

    // Save to user_resumes
    const resumeData = {
        user_id: userId,
        resume_url: body.resume_url || '',
        linkedin_url: linkedinUrl,
        parsed_skills: parsed.skills || [],
        parsed_experience: parsed.experience || [],
        parsed_education: parsed.education || [],
        parsed_summary: parsed.summary || '',
        raw_text: inputText.substring(0, 5000),
        parsed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    await supaFetch(supabaseUrl, supabaseKey, 'user_resumes', {
        method: 'POST',
        body: resumeData,
        prefer: 'return=representation,resolution=merge-duplicates'
    });

    // Also update user_skills with parsed skills
    if (parsed.skills && parsed.skills.length > 0) {
        await supaFetch(supabaseUrl, supabaseKey, 'user_skills', {
            method: 'POST',
            body: {
                user_id: userId,
                skills: parsed.skills,
                looking_for_work: true,
                updated_at: new Date().toISOString()
            },
            prefer: 'return=representation,resolution=merge-duplicates'
        });
    }

    return {
        ok: true,
        parsed: {
            skills: parsed.skills || [],
            experience: parsed.experience || [],
            education: parsed.education || [],
            summary: parsed.summary || ''
        }
    };
}

/* ═══════════════════════════════════════════════════════════════ */
/* 5. SALARY INSIGHTS                                             */
/* ═══════════════════════════════════════════════════════════════ */
async function handleSalaryInsights(env, body) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
    const sub = body.sub_action || 'get';

    if (sub === 'get') {
        let category = body.category || '';
        const roleTitle = body.role_title || '';
        let query = 'salary_insights?';
        if (category) query += 'category=eq.' + encodeURIComponent(category) + '&';
        if (roleTitle) query += 'role_title=ilike.*' + encodeURIComponent(roleTitle) + '*&';
        query += 'order=sample_count.desc&limit=20';

        const res = await supaFetch(supabaseUrl, supabaseKey, query);
        const data = await res.json();
        return { ok: true, insights: data || [] };
    }

    if (sub === 'compute') {
        // Compute salary insights from active jobs
        const res = await supaFetch(supabaseUrl, supabaseKey,
            'jobs?status=eq.active&salary_min=not.is.null&select=ai_category,title,salary_min,salary_max,salary_currency,region');
        const jobs = await res.json();
        if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
            return { ok: true, message: 'No salary data available yet' };
        }

        // Group by category
        const groups = {};
        jobs.forEach((j) => {
            const cat = j.ai_category || 'other';
            const title = (j.title || '').toLowerCase().split(/\s+/).slice(0, 3).join(' ');
            const key = cat + '::' + title;
            if (!groups[key]) groups[key] = { category: cat, role_title: title, salaries: [] };
            if (j.salary_min) groups[key].salaries.push(j.salary_min);
            if (j.salary_max) groups[key].salaries.push(j.salary_max);
        });

        const insights = [];
        for (let key in groups) {
            const g = groups[key];
            if (g.salaries.length < 2) continue;
            g.salaries.sort((a, b) => { return a - b; });
            const sum = g.salaries.reduce((a, b) => { return a + b; }, 0);
            insights.push({
                category: g.category,
                role_title: g.role_title,
                region: 'worldwide',
                sample_count: g.salaries.length,
                salary_min_avg: g.salaries[0],
                salary_max_avg: g.salaries[g.salaries.length - 1],
                salary_median: g.salaries[Math.floor(g.salaries.length / 2)],
                salary_currency: 'USD',
                updated_at: new Date().toISOString()
            });
        }

        return { ok: true, insights: insights };
    }

    return { ok: false, error: 'Unknown sub_action' };
}

/* ═══════════════════════════════════════════════════════════════ */
/* 6. JOB EXPIRATION & RENEWAL                                    */
/* ═══════════════════════════════════════════════════════════════ */
async function handleJobExpiration(env, body) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
    const sub = body.sub_action || 'check';
    const userId = body.user_id;

    if (sub === 'renew') {
        const jobId = body.job_id;
        if (!jobId || !userId) return { ok: false, error: 'Missing job_id or user_id' };
        const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await supaFetch(supabaseUrl, supabaseKey, 'jobs?id=eq.' + jobId + '&poster_id=eq.' + userId, {
            method: 'PATCH',
            body: {
                expires_at: newExpiry,
                is_expired: false,
                status: 'active',
                renewal_count: body.current_renewal_count ? body.current_renewal_count + 1 : 1,
                expiry_notified: false
            }
        });
        return { ok: true, expires_at: newExpiry };
    }

    if (sub === 'my-expiring') {
        if (!userId) return { ok: false, error: 'Missing user_id' };
        const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const res = await supaFetch(supabaseUrl, supabaseKey,
            'jobs?poster_id=eq.' + encodeURIComponent(userId) +
            '&status=eq.active&expires_at=lt.' + sevenDaysFromNow +
            '&is_expired=eq.false&order=expires_at.asc');
        const jobs = await res.json();
        return { ok: true, expiring_jobs: jobs || [] };
    }

    return { ok: false, error: 'Unknown sub_action' };
}

/* ═══════════════════════════════════════════════════════════════ */
/* 7. FEATURED / BOOSTED JOBS                                     */
/* ═══════════════════════════════════════════════════════════════ */
async function handleJobBoost(env, body) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
    const sub = body.sub_action || 'boost';
    const userId = body.user_id;

    if (sub === 'boost') {
        const jobId = body.job_id;
        if (!jobId || !userId) return { ok: false, error: 'Missing job_id or user_id' };

        const boostType = body.boost_type || 'featured';
        const durationDays = body.duration_days || 7;
        const coinsCost = { featured: 100, highlighted: 50, pinned: 150 };
        const cost = coinsCost[boostType] || 100;

        // Check user balance
        const balRes = await supaFetch(supabaseUrl, supabaseKey,
            'coins_wallets?user_id=eq.' + encodeURIComponent(userId) + '&limit=1');
        const balData = await balRes.json();
        const balance = Array.isArray(balData) && balData[0] ? (balData[0].balance || 0) : 0;

        if (balance < cost) {
            return { ok: false, error: 'Insufficient GMX Coins. Need ' + cost + ' coins, you have ' + balance };
        }

        const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

        // Create boost record
        await supaFetch(supabaseUrl, supabaseKey, 'job_boosts', {
            method: 'POST',
            body: {
                job_id: jobId,
                user_id: userId,
                boost_type: boostType,
                coins_spent: cost,
                ends_at: endsAt
            }
        });

        // Update job as promoted
        await supaFetch(supabaseUrl, supabaseKey, 'jobs?id=eq.' + jobId, {
            method: 'PATCH',
            body: { is_promoted: true, promoted_until: endsAt }
        });

        // Deduct coins
        await supaFetch(supabaseUrl, supabaseKey, 'rpc/deduct_coins', {
            method: 'POST',
            body: { p_user_id: userId, p_amount: cost, p_reason: 'Job boost: ' + boostType }
        });

        return { ok: true, boost_type: boostType, ends_at: endsAt, coins_spent: cost };
    }

    if (sub === 'pricing') {
        return {
            ok: true,
            plans: [
                { type: 'highlighted', name: 'Highlighted', coins: 50, duration: 7, description: 'Colored border to stand out in the list' },
                { type: 'featured', name: 'Featured', coins: 100, duration: 7, description: 'Featured badge + pinned in Featured Jobs section' },
                { type: 'pinned', name: 'Pinned', coins: 150, duration: 7, description: 'Pinned at the very top + Featured badge + highlighted border' }
            ]
        };
    }

    return { ok: false, error: 'Unknown sub_action' };
}

/* ═══════════════════════════════════════════════════════════════ */
/* 8. SKILL GAP ANALYSIS (AI)                                     */
/* ═══════════════════════════════════════════════════════════════ */
async function handleSkillGap(env, body) {
    const apiKey = env.OPENROUTER_API_KEY || '';
    const userSkills = body.user_skills || [];
    const jobSkills = body.job_skills || [];
    const jobTitle = body.job_title || '';

    if (!userSkills.length || !jobSkills.length) {
        return { ok: false, error: 'Missing user_skills or job_skills' };
    }

    // Compute basic match
    const matched = [];
    const missing = [];
    jobSkills.forEach((reqSkill) => {
        let found = false;
        const reqLower = reqSkill.toLowerCase();
        for (let i = 0; i < userSkills.length; i++) {
            if (userSkills[i].toLowerCase().indexOf(reqLower) !== -1 ||
                reqLower.indexOf(userSkills[i].toLowerCase()) !== -1) {
                found = true;
                break;
            }
        }
        if (found) matched.push(reqSkill);
        else missing.push(reqSkill);
    });

    const matchPercent = Math.round((matched.length / jobSkills.length) * 100);

    let result = {
        ok: true,
        match_percent: matchPercent,
        matched_skills: matched,
        missing_skills: missing,
        suggestions: []
    };

    // Use AI for learning suggestions if we have missing skills
    if (apiKey && missing.length > 0) {
        const prompt = 'A job seeker wants to learn these missing skills for a "' + jobTitle + '" role: ' +
            missing.join(', ') + '\n\n' +
            'They already know: ' + userSkills.join(', ') + '\n\n' +
            'Suggest 2-3 specific, actionable learning resources or steps for each missing skill. ' +
            'Respond with ONLY a JSON array:\n' +
            '[{"skill": "...", "suggestions": ["suggestion 1", "suggestion 2"]}]';

        const aiContent = await callAI(apiKey, prompt, 400);
        const parsed = parseAIJSON(aiContent);
        if (parsed && Array.isArray(parsed)) {
            result.suggestions = parsed;
        } else if (parsed && parsed.suggestions) {
            result.suggestions = parsed.suggestions;
        }
    }

    return result;
}

/* ═══════════════════════════════════════════════════════════════ */
/* 9. REFERRAL BOUNTIES                                           */
/* ═══════════════════════════════════════════════════════════════ */
async function handleReferrals(env, body) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
    const sub = body.sub_action || 'get-bounty';
    const userId = body.user_id;

    if (sub === 'set-bounty') {
        if (!userId) return { ok: false, error: 'Missing user_id' };
        const jobId = body.job_id;
        if (!jobId) return { ok: false, error: 'Missing job_id' };
        const bountyCoins = body.bounty_coins || 500;
        const bountyDesc = body.bounty_description || 'Refer a friend who gets hired and earn ' + bountyCoins + ' GMX Coins!';

        await supaFetch(supabaseUrl, supabaseKey, 'job_referral_bounties', {
            method: 'POST',
            body: {
                job_id: jobId,
                employer_id: userId,
                bounty_coins: bountyCoins,
                bounty_description: bountyDesc
            }
        });
        return { ok: true };
    }

    if (sub === 'get-bounty') {
        const jobId = body.job_id;
        if (!jobId) return { ok: false, error: 'Missing job_id' };
        const res = await supaFetch(supabaseUrl, supabaseKey,
            'job_referral_bounties?job_id=eq.' + jobId + '&is_active=eq.true&limit=1');
        const data = await res.json();
        return { ok: true, bounty: Array.isArray(data) && data[0] ? data[0] : null };
    }

    if (sub === 'create-referral') {
        if (!userId) return { ok: false, error: 'Missing user_id' };
        const jobId = body.job_id;
        const referredEmail = body.referred_email;
        if (!jobId || !referredEmail) return { ok: false, error: 'Missing job_id or referred_email' };

        const code = 'REF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        await supaFetch(supabaseUrl, supabaseKey, 'job_referrals', {
            method: 'POST',
            body: {
                job_id: jobId,
                referrer_id: userId,
                referred_email: referredEmail,
                referral_code: code
            }
        });
        return { ok: true, referral_code: code, referral_link: 'https://groupsmix.com/jobs?ref=' + code };
    }

    if (sub === 'my-referrals') {
        if (!userId) return { ok: false, error: 'Missing user_id' };
        const res = await supaFetch(supabaseUrl, supabaseKey,
            'job_referrals?referrer_id=eq.' + encodeURIComponent(userId) + '&order=created_at.desc');
        const refs = await res.json();
        return { ok: true, referrals: refs || [] };
    }

    return { ok: false, error: 'Unknown sub_action' };
}

/* ═══════════════════════════════════════════════════════════════ */
/* 10. INTERVIEW SCHEDULING                                       */
/* ═══════════════════════════════════════════════════════════════ */
async function handleInterviewScheduling(env, body) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
    const sub = body.sub_action || 'propose';
    const userId = body.user_id;
    if (!userId) return { ok: false, error: 'Missing user_id' };

    if (sub === 'propose') {
        // Employer proposes time slots
        const applicationId = body.application_id;
        const candidateId = body.candidate_id;
        const jobId = body.job_id;
        const proposedTimes = body.proposed_times || [];

        if (!applicationId || !candidateId || !jobId || proposedTimes.length === 0) {
            return { ok: false, error: 'Missing required fields (application_id, candidate_id, job_id, proposed_times)' };
        }

        const res = await supaFetch(supabaseUrl, supabaseKey, 'interview_slots', {
            method: 'POST',
            body: {
                job_id: jobId,
                application_id: applicationId,
                employer_id: userId,
                candidate_id: candidateId,
                proposed_times: proposedTimes,
                notes: body.notes || ''
            }
        });
        const data = await res.json();
        return { ok: true, interview: Array.isArray(data) ? data[0] : data };
    }

    if (sub === 'select-time') {
        // Candidate selects a time slot
        const interviewId = body.interview_id;
        const selectedTime = body.selected_time;
        if (!interviewId || !selectedTime) return { ok: false, error: 'Missing interview_id or selected_time' };

        await supaFetch(supabaseUrl, supabaseKey, 'interview_slots?id=eq.' + interviewId, {
            method: 'PATCH',
            body: {
                selected_time: selectedTime,
                selected_duration: body.duration || 30,
                status: 'confirmed',
                updated_at: new Date().toISOString()
            }
        });

        // Generate Google Calendar link
        const start = new Date(selectedTime);
        const end = new Date(start.getTime() + (body.duration || 30) * 60000);
        const calendarLink = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
            '&text=' + encodeURIComponent('Interview - GroupsMix') +
            '&dates=' + start.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') +
            '/' + end.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') +
            '&details=' + encodeURIComponent('Interview scheduled via GroupsMix Jobs');

        return { ok: true, calendar_link: calendarLink };
    }

    if (sub === 'cancel') {
        const interviewId = body.interview_id;
        if (!interviewId) return { ok: false, error: 'Missing interview_id' };
        await supaFetch(supabaseUrl, supabaseKey, 'interview_slots?id=eq.' + interviewId, {
            method: 'PATCH',
            body: { status: 'cancelled', updated_at: new Date().toISOString() }
        });
        return { ok: true };
    }

    if (sub === 'my-interviews') {
        // Get interviews for user (as candidate or employer)
        const res = await supaFetch(supabaseUrl, supabaseKey,
            'interview_slots?or=(candidate_id.eq.' + encodeURIComponent(userId) +
            ',employer_id.eq.' + encodeURIComponent(userId) + ')&order=created_at.desc');
        const interviews = await res.json();
        return { ok: true, interviews: interviews || [] };
    }

    return { ok: false, error: 'Unknown sub_action' };
}

/* ═══════════════════════════════════════════════════════════════ */
/* MAIN HANDLER                                                   */
/* ═══════════════════════════════════════════════════════════════ */
export async function onRequest(context) {
    const request = context.request;
    const env = context.env || {};
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: corsHeaders(origin) });
    }

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid request body' }),
            { status: 400, headers: corsHeaders(origin) });
    }

    let action = (body.action || '').trim();

    if (!checkRateLimit(ip, action)) {
        return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }),
            { status: 429, headers: corsHeaders(origin) });
    }

    try {
        let result;
        switch (action) {
            case 'job-alerts':
                result = await handleJobAlerts(env, body);
                break;
            case 'applications':
                result = await handleApplications(env, body);
                break;
            case 'employer-profile':
                result = await handleEmployerProfile(env, body);
                break;
            case 'resume-parser':
                result = await handleResumeParser(env, body);
                break;
            case 'salary-insights':
                result = await handleSalaryInsights(env, body);
                break;
            case 'job-expiration':
                result = await handleJobExpiration(env, body);
                break;
            case 'job-boost':
                result = await handleJobBoost(env, body);
                break;
            case 'skill-gap':
                result = await handleSkillGap(env, body);
                break;
            case 'referrals':
                result = await handleReferrals(env, body);
                break;
            case 'interviews':
                result = await handleInterviewScheduling(env, body);
                break;
            default:
                result = { ok: false, error: 'Unknown action: ' + action };
        }

        return new Response(JSON.stringify(result),
            { status: 200, headers: corsHeaders(origin) });
    } catch (err) {
        console.error('Jobs Board error:', err.message);
        return new Response(JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: corsHeaders(origin) });
    }
}
