/**
 * /api/validate-listing — AI Content Filter for Marketplace Listings
 *
 * Cloudflare Pages Function that validates marketplace listing content
 * using OpenRouter AI API to ensure only social media related content
 * is accepted.
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

/* ── Social media keywords for fast pre-check ───────────────────── */
const SOCIAL_KEYWORDS = [
    'whatsapp', 'telegram', 'discord', 'facebook', 'youtube', 'tiktok',
    'twitter', 'instagram', 'snapchat', 'reddit', 'linkedin', 'pinterest',
    'twitch', 'kick', 'signal', 'viber', 'wechat', 'line', 'kakaotalk',
    'channel', 'group', 'page', 'account', 'followers', 'subscribers',
    'members', 'community', 'social media', 'social', 'influencer',
    'content creator', 'streamer', 'bot', 'server', 'guild',
    'قناة', 'قروب', 'مجموعة', 'حساب', 'متابعين', 'مشتركين',
    'تواصل اجتماعي', 'سوشيال ميديا'
];

function quickSocialCheck(text) {
    const lower = text.toLowerCase();
    return SOCIAL_KEYWORDS.some(kw => lower.includes(kw));
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

    // Quick keyword check — if clearly social media, allow immediately
    if (quickSocialCheck(combined)) {
        return new Response(
            JSON.stringify({ valid: true, message: '' }),
            { status: 200, headers: corsHeaders(origin) }
        );
    }

    // Use AI to validate if content is social media related
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
        const prompt = `You are a content filter for a social media marketplace. Users can only sell or offer services related to social media platforms (WhatsApp, Telegram, Discord, Facebook, YouTube, TikTok, Twitter, Instagram, Snapchat, etc.) — such as channels, groups, pages, accounts, followers, subscribers, bots, content creation services, social media management, etc.

Analyze this listing and determine if it is related to social media:

Title: ${title}
Description: ${description}

Respond with ONLY a JSON object (no markdown, no extra text):
{"is_social_media": true/false, "reason": "brief explanation"}`;

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
            if (lower.includes('"is_social_media": true') || lower.includes('"is_social_media":true')) {
                result = { is_social_media: true };
            } else if (lower.includes('"is_social_media": false') || lower.includes('"is_social_media":false')) {
                result = { is_social_media: false };
            } else {
                // Cannot parse — allow submission
                result = { is_social_media: true };
            }
        }

        if (result.is_social_media) {
            return new Response(
                JSON.stringify({ valid: true, message: '' }),
                { status: 200, headers: corsHeaders(origin) }
            );
        } else {
            return new Response(
                JSON.stringify({
                    valid: false,
                    message: '\u0646\u062D\u0646 \u0646\u0642\u0628\u0644 \u0641\u0642\u0637 \u062E\u062F\u0645\u0627\u062A \u0648\u0645\u0646\u0635\u0627\u062A \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0627\u0644\u0627\u062C\u062A\u0645\u0627\u0639\u064A'
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
