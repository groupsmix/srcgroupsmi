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

/* ── Blocked keywords — explicitly prohibited items ──────────────── */
const BLOCKED_KEYWORDS = [
    'sell account', 'buy account', 'account for sale', 'selling account',
    'followers for sale', 'buy followers', 'sell followers',
    'subscribers for sale', 'buy subscribers', 'sell subscribers',
    'hacked', 'stolen', 'cracked', 'leaked credentials',
    'pre-built audience', 'aged account', 'verified account for sale',
    'facebook account', 'instagram account', 'tiktok account',
    'youtube account', 'twitter account', 'snapchat account',
    'sell channel', 'buy channel', 'channel for sale',
    'sell group', 'buy group', 'group for sale',
    'sell page', 'buy page', 'page for sale',
    'حساب للبيع', 'بيع حساب', 'شراء حساب', 'متابعين للبيع',
    'بيع قناة', 'شراء قناة', 'بيع قروب', 'شراء قروب'
];

/* ── Allowed digital product keywords for fast pre-check ─────────── */
const DIGITAL_PRODUCT_KEYWORDS = [
    'template', 'bot', 'script', 'tool', 'plugin', 'extension',
    'guide', 'ebook', 'tutorial', 'course', 'playbook',
    'automation', 'workflow', 'zapier', 'n8n', 'make',
    'design', 'banner', 'sticker', 'logo', 'graphic', 'icon',
    'dashboard', 'analytics', 'report', 'spreadsheet',
    'welcome pack', 'rules template', 'onboarding', 'content calendar',
    'source code', 'api', 'integration', 'webhook',
    'moderation', 'management', 'community tool',
    'قالب', 'بوت', 'أداة', 'دليل', 'كتاب', 'تصميم', 'سكربت'
];

function quickBlockedCheck(text) {
    const lower = text.toLowerCase();
    return BLOCKED_KEYWORDS.some(kw => lower.includes(kw));
}

function quickDigitalProductCheck(text) {
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

    // Quick block check — if listing contains prohibited keywords, reject immediately
    if (quickBlockedCheck(combined)) {
        return new Response(
            JSON.stringify({
                valid: false,
                message: 'This listing appears to sell accounts, followers, or credentials. Only digital products (templates, tools, guides, etc.) are allowed.'
            }),
            { status: 200, headers: corsHeaders(origin) }
        );
    }

    // Quick keyword check — if clearly a digital product, allow immediately
    if (quickDigitalProductCheck(combined)) {
        return new Response(
            JSON.stringify({ valid: true, message: '' }),
            { status: 200, headers: corsHeaders(origin) }
        );
    }

    // Use AI to validate if content is a legitimate digital product
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
        const prompt = `You are a content filter for a digital products marketplace. Users can ONLY sell digital products such as:
- Bot templates & source code (Telegram, Discord, WhatsApp, Slack bots)
- Design templates (banners, sticker packs, welcome images, logos)
- Community growth guides & ebooks
- Automation workflows (Zapier templates, n8n flows, Make scenarios)
- Group management tools & scripts
- Premium content packs (welcome packs, rules templates, onboarding kits, content calendars)
- Analytics dashboards & reporting templates
- API integrations & webhooks
- Any other digital tool, template, or educational content

EXPLICITLY BLOCKED (must reject):
- Social media accounts (YouTube, Facebook, Instagram, TikTok, Twitter, Snapchat, etc.)
- Pre-built audiences or follower/subscriber lists
- Hacked, stolen, or cracked credentials
- Any listing that sells access to an existing account, channel, group, or page

Analyze this listing and determine if it is a legitimate digital product:

Title: ${title}
Description: ${description}

Respond with ONLY a JSON object (no markdown, no extra text):
{"is_digital_product": true/false, "reason": "brief explanation"}`;

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
            if (lower.includes('"is_digital_product": true') || lower.includes('"is_digital_product":true')) {
                result = { is_digital_product: true };
            } else if (lower.includes('"is_digital_product": false') || lower.includes('"is_digital_product":false')) {
                result = { is_digital_product: false };
            } else {
                // Cannot parse — allow submission
                result = { is_digital_product: true };
            }
        }

        if (result.is_digital_product) {
            return new Response(
                JSON.stringify({ valid: true, message: '' }),
                { status: 200, headers: corsHeaders(origin) }
            );
        } else {
            return new Response(
                JSON.stringify({
                    valid: false,
                    message: 'Only digital products are allowed (templates, tools, guides, automation workflows, etc.). Selling accounts, followers, or credentials is not permitted.'
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
