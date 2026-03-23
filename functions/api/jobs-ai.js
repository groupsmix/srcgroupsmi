/**
 * /api/jobs-ai — AI-Powered Jobs Engine for GroupsMix
 *
 * Cloudflare Pages Function that provides:
 * 1. AI Gatekeeper — validates job posts, rejects spam/fraud
 * 2. Job Description Generator — enhances simple titles into professional descriptions
 * 3. Auto-Categorization — classifies jobs into categories automatically
 * 4. Smart Matching — compares user skills against job requirements
 *
 * Environment variable required (set in Cloudflare Pages dashboard):
 *   OPENROUTER_API_KEY — your OpenRouter API key
 *
 * Request (POST JSON):
 *   { action: "validate"|"enhance"|"categorize"|"match", ...params }
 *
 * Response (JSON):
 *   Varies by action (see individual handlers below)
 */

/* ── Allowed origins for CORS ───────────────────────────────────── */
const ALLOWED_ORIGINS = [
    'https://groupsmix.com',
    'https://www.groupsmix.com'
];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
}

/* ── In-memory rate limiter ─────────────────────────────────────── */
const ipBuckets = new Map();
function checkRateLimit(ip, action) {
    const now = Date.now();
    const window = 60000; // 1 minute
    const limits = { validate: 10, enhance: 5, categorize: 10, match: 10 };
    const max = limits[action] || 10;
    const key = ip + ':jobs-ai:' + action;
    let bucket = ipBuckets.get(key);
    if (!bucket) { bucket = []; ipBuckets.set(key, bucket); }
    const recent = bucket.filter((t) => { return now - t < window; });
    if (recent.length >= max) { ipBuckets.set(key, recent); return false; }
    recent.push(now);
    ipBuckets.set(key, recent);
    if (ipBuckets.size > 2000) {
        for (const [k, v] of ipBuckets) {
            const f = v.filter((t) => { return now - t < 120000; });
            if (f.length === 0) ipBuckets.delete(k);
            else ipBuckets.set(k, f);
        }
    }
    return true;
}

/* ── Spam/fraud detection keywords ────────────────────────────── */
const SPAM_PATTERNS = [
    /earn\s*\$?\d+k?\s*(daily|hourly|per\s*day)/i,
    /guaranteed\s*(income|money|earnings)/i,
    /no\s*experience\s*needed.*\$\d+/i,
    /make\s*money\s*(fast|quick|easy|now)/i,
    /get\s*rich\s*(quick|fast)/i,
    /pyramid\s*scheme/i,
    /mlm\s*(opportunity|business)/i,
    /click\s*(here|this)\s*link/i,
    /bit\.ly|tinyurl|t\.co/i,
    /wire\s*transfer/i,
    /send\s*(money|payment)\s*(first|upfront|before)/i,
    /nigerian?\s*prince/i,
    /lottery\s*win/i,
    /inheritance\s*fund/i,
    /urgent.*transfer.*funds/i,
    /cryptocurrency\s*investment.*guaranteed/i,
    /double\s*your\s*(money|investment|bitcoin)/i
];

const SUSPICIOUS_PATTERNS = [
    /whatsapp\s*only/i,
    /dm\s*(me|for|only)/i,
    /no\s*interview/i,
    /pay\s*upfront/i,
    /registration\s*fee/i,
    /joining\s*fee/i
];

function quickSpamCheck(text) {
    for (let i = 0; i < SPAM_PATTERNS.length; i++) {
        if (SPAM_PATTERNS[i].test(text)) return { spam: true, reason: 'Content matches known spam/fraud pattern' };
    }
    let suspiciousCount = 0;
    for (let j = 0; j < SUSPICIOUS_PATTERNS.length; j++) {
        if (SUSPICIOUS_PATTERNS[j].test(text)) suspiciousCount++;
    }
    if (suspiciousCount >= 2) return { spam: true, reason: 'Content contains multiple suspicious indicators' };
    return { spam: false, reason: '' };
}

/* ── Call OpenRouter AI ───────────────────────────────────────── */
async function callAI(apiKey, prompt, maxTokens) {
    maxTokens = maxTokens || 300;
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

    if (!res.ok) {
        console.warn('OpenRouter API returned', res.status);
        return null;
    }

    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : '';
    return content.trim();
}

/* ── Parse JSON from AI response ──────────────────────────────── */
function parseAIJSON(content) {
    if (!content) return null;
    try {
        const jsonStr = content.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        try {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
        } catch (e2) {
            // ignore
        }
        return null;
    }
}

/* ── ACTION: validate (AI Gatekeeper) ─────────────────────────── */
async function handleValidate(body, apiKey) {
    const title = (body.title || '').trim();
    const description = (body.description || '').trim();

    if (!title) {
        return { valid: false, message: 'Job title is required', category: null };
    }

    const combined = title + ' ' + description;

    // Quick spam check first
    const spamResult = quickSpamCheck(combined);
    if (spamResult.spam) {
        return { valid: false, message: spamResult.reason, category: null };
    }

    // If no API key, allow with basic validation only
    if (!apiKey) {
        return { valid: true, message: '', category: 'other' };
    }

    const prompt = 'You are a job posting content filter for GroupsMix, a social media community platform. Analyze this job posting and determine:\n' +
        '1. Is it legitimate (not spam, scam, or fraudulent)?\n' +
        '2. What category best fits: "design", "programming", "marketing", "writing", "community", "other"\n\n' +
        'Job Title: ' + title + '\n' +
        'Description: ' + description + '\n\n' +
        'Respond with ONLY a JSON object (no markdown, no extra text):\n' +
        '{"is_valid": true/false, "reason": "brief explanation if invalid", "category": "one of the categories above"}';

    const aiContent = await callAI(apiKey, prompt, 150);
    let result = parseAIJSON(aiContent);

    if (!result) {
        return { valid: true, message: '', category: 'other' };
    }

    return {
        valid: result.is_valid !== false,
        message: result.is_valid === false ? (result.reason || 'Job posting was flagged as potentially invalid') : '',
        category: result.category || 'other'
    };
}

/* ── ACTION: enhance (Job Description Generator) ──────────────── */
async function handleEnhance(body, apiKey) {
    const title = (body.title || '').trim();
    const description = (body.description || '').trim();

    if (!title && !description) {
        return { enhanced: false, message: 'Title or description is required', description: '' };
    }

    if (!apiKey) {
        return { enhanced: false, message: 'AI enhancement is temporarily unavailable', description: description };
    }

    const prompt = 'You are a professional job description writer. The user has provided a basic job title/description for their job posting on GroupsMix (a social media community platform).\n\n' +
        'Original title: ' + title + '\n' +
        (description ? 'Original description: ' + description + '\n' : '') +
        '\nTransform this into a professional, compelling job description. Include:\n' +
        '- A brief overview (2-3 sentences)\n' +
        '- Key Responsibilities (3-5 bullet points)\n' +
        '- Required Skills (3-5 bullet points)\n' +
        '- Nice to Have (2-3 bullet points)\n\n' +
        'Use markdown formatting (## for headers, - for bullets). Keep it concise but professional. Do NOT include salary or company info.\n' +
        'Write in a warm, professional tone. Maximum 300 words.';

    const aiContent = await callAI(apiKey, prompt, 500);

    if (!aiContent) {
        return { enhanced: false, message: 'AI enhancement failed. Please try again.', description: description };
    }

    // Also auto-detect skills from the enhanced description
    const skillsPrompt = 'From this job description, extract 5-8 key skills as a JSON array of lowercase strings.\n\n' +
        'Description: ' + aiContent + '\n\n' +
        'Respond with ONLY a JSON array, e.g.: ["javascript", "react", "ui design"]';

    const skillsContent = await callAI(apiKey, skillsPrompt, 100);
    let skills = [];
    try {
        const parsed = JSON.parse(skillsContent.replace(/```json?\s*/g, '').replace(/```/g, '').trim());
        if (Array.isArray(parsed)) skills = parsed.map((s) => { return String(s).toLowerCase().trim(); }).filter(Boolean).slice(0, 8);
    } catch (e) {
        // ignore
    }

    return {
        enhanced: true,
        message: '',
        description: aiContent,
        suggested_skills: skills
    };
}

/* ── ACTION: categorize (Auto-classification) ─────────────────── */
async function handleCategorize(body, apiKey) {
    const title = (body.title || '').trim();
    const description = (body.description || '').trim();

    if (!title) {
        return { category: 'other', confidence: 0 };
    }

    if (!apiKey) {
        return { category: 'other', confidence: 0 };
    }

    const prompt = 'Classify this job posting into exactly ONE category.\n\n' +
        'Categories: design, programming, marketing, writing, community, other\n\n' +
        'Job Title: ' + title + '\n' +
        (description ? 'Description: ' + description.substring(0, 200) + '\n' : '') +
        '\nRespond with ONLY a JSON object:\n' +
        '{"category": "one_category", "confidence": 0.0-1.0}';

    const aiContent = await callAI(apiKey, prompt, 50);
    let result = parseAIJSON(aiContent);

    const validCategories = ['design', 'programming', 'marketing', 'writing', 'community', 'other'];
    if (result && validCategories.indexOf(result.category) !== -1) {
        return { category: result.category, confidence: result.confidence || 0.5 };
    }

    return { category: 'other', confidence: 0 };
}

/* ── ACTION: match (Smart Matching) ───────────────────────────── */
async function handleMatch(body, apiKey) {
    const userSkills = body.skills || [];
    const jobTitle = (body.job_title || '').trim();
    const jobDescription = (body.job_description || '').trim();
    const jobSkills = body.job_skills || [];

    if (!userSkills.length) {
        return { match_score: 0, explanation: 'No skills provided' };
    }

    // Quick keyword-based matching
    let matchCount = 0;
    const totalRequired = jobSkills.length || 1;

    for (let i = 0; i < jobSkills.length; i++) {
        const reqSkill = jobSkills[i].toLowerCase();
        for (let j = 0; j < userSkills.length; j++) {
            if (userSkills[j].toLowerCase().indexOf(reqSkill) !== -1 ||
                reqSkill.indexOf(userSkills[j].toLowerCase()) !== -1) {
                matchCount++;
                break;
            }
        }
    }

    const quickScore = Math.round((matchCount / totalRequired) * 100);

    // If we have an API key and the quick score isn't definitive, use AI for better matching
    if (apiKey && quickScore > 0 && quickScore < 100 && jobDescription) {
        const prompt = 'You are a job matching expert. Rate how well this candidate matches the job.\n\n' +
            'Candidate Skills: ' + userSkills.join(', ') + '\n' +
            'Job Title: ' + jobTitle + '\n' +
            'Job Skills Required: ' + jobSkills.join(', ') + '\n' +
            'Job Description (first 300 chars): ' + jobDescription.substring(0, 300) + '\n\n' +
            'Respond with ONLY a JSON object:\n' +
            '{"score": 0-100, "explanation": "one sentence why"}';

        const aiContent = await callAI(apiKey, prompt, 80);
        let result = parseAIJSON(aiContent);

        if (result && typeof result.score === 'number') {
            return {
                match_score: Math.min(100, Math.max(0, result.score)),
                explanation: result.explanation || ''
            };
        }
    }

    return {
        match_score: quickScore,
        explanation: matchCount + ' of ' + totalRequired + ' required skills matched'
    };
}

/* ── Main handler ───────────────────────────────────────────────── */
export async function onRequest(context) {
    const request = context.request;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: corsHeaders(origin) }
        );
    }

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response(
            JSON.stringify({ error: 'Invalid request body' }),
            { status: 400, headers: corsHeaders(origin) }
        );
    }

    const action = (body.action || '').trim();
    const validActions = ['validate', 'enhance', 'categorize', 'match'];

    if (validActions.indexOf(action) === -1) {
        return new Response(
            JSON.stringify({ error: 'Invalid action. Use: ' + validActions.join(', ') }),
            { status: 400, headers: corsHeaders(origin) }
        );
    }

    if (!checkRateLimit(ip, action)) {
        return new Response(
            JSON.stringify({ error: 'Too many requests. Please try again later.' }),
            { status: 429, headers: corsHeaders(origin) }
        );
    }

    const apiKey = (context.env && context.env.OPENROUTER_API_KEY) || '';

    try {
        let result;
        switch (action) {
            case 'validate':
                result = await handleValidate(body, apiKey);
                break;
            case 'enhance':
                result = await handleEnhance(body, apiKey);
                break;
            case 'categorize':
                result = await handleCategorize(body, apiKey);
                break;
            case 'match':
                result = await handleMatch(body, apiKey);
                break;
            default:
                result = { error: 'Unknown action' };
        }

        return new Response(
            JSON.stringify(result),
            { status: 200, headers: corsHeaders(origin) }
        );
    } catch (err) {
        console.error('Jobs AI error:', err.message);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: corsHeaders(origin) }
        );
    }
}
