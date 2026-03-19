/**
 * /api/validate-listing — AI Content Filter for Marketplace Listings
 *
 * Cloudflare Pages Function that validates marketplace listing content
 * using OpenRouter AI API to ensure only digital products are accepted
 * and prohibited items (accounts, followers, credentials) are blocked.
 *
 * Environment variable required (set in Cloudflare Pages dashboard):
 *   OPENROUTER_API_KEY — your OpenRouter API key
 *
 * Request (POST JSON):
 *   { title: string, description: string }
 *
 * Response (JSON):
 *   { valid: true/false, message: string }
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
function checkRateLimit(ip) {
    const now = Date.now();
    const window = 60000; // 1 minute
    const max = 10;
    const key = ip + ':validate-listing';
    let bucket = ipBuckets.get(key);
    if (!bucket) { bucket = []; ipBuckets.set(key, bucket); }
    const recent = bucket.filter(t => now - t < window);
    if (recent.length >= max) { ipBuckets.set(key, recent); return false; }
    recent.push(now);
    ipBuckets.set(key, recent);
    if (ipBuckets.size > 2000) {
        for (const [k, v] of ipBuckets) {
            const f = v.filter(t => now - t < 120000);
            if (f.length === 0) ipBuckets.delete(k);
            else ipBuckets.set(k, f);
        }
    }
    return true;
}

/* ── Banned keywords — auto-reject listings containing these ────── */
const BANNED_KEYWORDS = [
    'account', 'followers', 'subscribers', 'verified badge',
    'hacked', 'cracked', 'leaked', 'stolen',
    'login', 'password', 'credentials',
    'exploit', 'crack', 'nulled', 'warez', 'pirated'
];

/**
 * Check text for banned keywords.
 * Returns { banned: boolean, keyword: string } if found.
 */
function checkBannedKeywords(text) {
    const lower = (text || '').toLowerCase();
    for (const kw of BANNED_KEYWORDS) {
        if (lower.includes(kw)) {
            return { banned: true, keyword: kw };
        }
    }
    return { banned: false, keyword: '' };
}

/* ── Valid digital product categories ─────────────────────────────── */
const VALID_CATEGORIES = ['templates', 'bots', 'scripts', 'design_assets', 'guides', 'tools'];

/* ── Digital product keywords for fast pre-check ──────────────────── */
const DIGITAL_PRODUCT_KEYWORDS = [
    'template', 'bot', 'script', 'design', 'asset', 'guide', 'tool',
    'plugin', 'extension', 'theme', 'widget', 'module', 'component',
    'automation', 'workflow', 'dashboard', 'api', 'integration',
    'code', 'software', 'app', 'utility', 'resource', 'kit',
    'graphic', 'icon', 'font', 'mockup', 'ui', 'ux', 'layout',
    'tutorial', 'ebook', 'course', 'checklist', 'framework',
    'library', 'snippet', 'preset', 'filter', 'overlay',
    'whatsapp', 'telegram', 'discord', 'facebook', 'youtube', 'tiktok',
    'twitter', 'instagram', 'snapchat', 'reddit', 'linkedin',
    'twitch', 'kick', 'signal',
    'channel', 'group', 'page', 'members', 'community', 'social media',
    'social', 'influencer', 'content creator', 'streamer', 'server', 'guild',
    'قناة', 'قروب', 'مجموعة', 'حساب', 'متابعين', 'مشتركين',
    'تواصل اجتماعي', 'سوشيال ميديا'
];

function quickContentCheck(text) {
    const lower = text.toLowerCase();
    return DIGITAL_PRODUCT_KEYWORDS.some(kw => lower.includes(kw));
}

/* ── Main handler ───────────────────────────────────────────────── */
export async function onRequest(context) {
    const { request } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
        return new Response(
            JSON.stringify({ valid: false, message: 'Method not allowed' }),
            { status: 405, headers: corsHeaders(origin) }
        );
    }

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    if (!checkRateLimit(ip)) {
        return new Response(
            JSON.stringify({ valid: false, message: 'Too many requests. Please try again later.' }),
            { status: 429, headers: corsHeaders(origin) }
        );
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({ valid: false, message: 'Invalid request body' }),
            { status: 400, headers: corsHeaders(origin) }
        );
    }

    const title = (body.title || '').trim();
    const description = (body.description || '').trim();

    if (!title && !description) {
        return new Response(
            JSON.stringify({ valid: false, message: 'Title and description are required' }),
            { status: 400, headers: corsHeaders(origin) }
        );
    }

    const combined = title + ' ' + description;

    // Feature 5: Banned keywords filter — reject immediately
    const bannedCheck = checkBannedKeywords(combined);
    if (bannedCheck.banned) {
        return new Response(
            JSON.stringify({
                valid: false,
                flagged: true,
                message: 'Listing rejected: contains banned keyword "' + bannedCheck.keyword + '". This type of content is not allowed on our marketplace.'
            }),
            { status: 200, headers: corsHeaders(origin) }
        );
    }

    // Quick keyword check — if clearly a valid digital product, allow immediately
    if (quickContentCheck(combined)) {
        return new Response(
            JSON.stringify({ valid: true, flagged: false, message: '' }),
            { status: 200, headers: corsHeaders(origin) }
        );
    }

    // Feature 3: AI auto-scan — validate content with AI before going live
    const apiKey = context.env?.OPENROUTER_API_KEY || '';
    if (!apiKey) {
        // No API key configured — allow submission (graceful degradation)
        console.warn('OPENROUTER_API_KEY not configured, allowing submission');
        return new Response(
            JSON.stringify({ valid: true, message: '' }),
            { status: 200, headers: corsHeaders(origin) }
        );
    }

    try {
        const prompt = `You are a content filter for a trusted digital products marketplace. We ONLY allow these product types: templates, bots, scripts, design assets, guides, and tools.

We strictly PROHIBIT:
- Selling social media accounts, followers, subscribers, or engagement
- Hacked, cracked, leaked, stolen, or pirated content
- Login credentials, passwords, or exploits
- Any form of fraud, scam, or illegal activity

Analyze this listing and determine:
1. Is it a legitimate digital product (template, bot, script, design asset, guide, or tool)?
2. Does it contain any suspicious or scam-like content?

Title: ${title}
Description: ${description}

Respond with ONLY a JSON object (no markdown, no extra text):
{"is_valid_product": true/false, "is_suspicious": true/false, "reason": "brief explanation"}`;

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://groupsmix.com',
                'X-Title': 'GroupsMix Marketplace'
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-3.1-8b-instruct:free',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 100,
                temperature: 0.1
            })
        });

        if (!res.ok) {
            console.warn('OpenRouter API returned', res.status);
            // On API error, allow submission (graceful degradation)
            return new Response(
                JSON.stringify({ valid: true, message: '' }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Try to parse JSON from response
        let result;
        try {
            // Handle potential markdown code blocks
            const jsonStr = content.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
            result = JSON.parse(jsonStr);
        } catch {
            // If parsing fails, check for keywords in raw response
            const lower = content.toLowerCase();
            if (lower.includes('"is_valid_product": true') || lower.includes('"is_valid_product":true')) {
                result = { is_valid_product: true, is_suspicious: false };
            } else if (lower.includes('"is_valid_product": false') || lower.includes('"is_valid_product":false')) {
                result = { is_valid_product: false, is_suspicious: true };
            } else {
                // Cannot parse — allow submission (graceful degradation)
                result = { is_valid_product: true, is_suspicious: false };
            }
        }

        // Feature 3: Flagged listings go to manual review
        if (result.is_suspicious) {
            return new Response(
                JSON.stringify({
                    valid: false,
                    flagged: true,
                    message: 'This listing has been flagged for manual review. ' + (result.reason || 'Our AI detected suspicious content.')
                }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        if (result.is_valid_product) {
            return new Response(
                JSON.stringify({ valid: true, flagged: false, message: '' }),
                { status: 200, headers: corsHeaders(origin) }
            );
        } else {
            return new Response(
                JSON.stringify({
                    valid: false,
                    flagged: false,
                    message: 'We only accept digital products: templates, bots, scripts, design assets, guides, and tools. ' + (result.reason || '')
                }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }
    } catch (err) {
        console.error('AI validation error:', err.message);
        // On error, allow submission (graceful degradation)
        return new Response(
            JSON.stringify({ valid: true, message: '' }),
            { status: 200, headers: corsHeaders(origin) }
        );
    }
}
