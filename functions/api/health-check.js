/**
 * /api/health-check — Group invite link health checker
 *
 * Cloudflare Pages Function that checks if a group invite link is still valid
 * by performing a HEAD/GET request and analyzing the response.
 *
 * Request (POST JSON):
 *   { url: "https://chat.whatsapp.com/..." }
 *
 * Response (JSON):
 *   { ok: true, status: "active"|"dead"|"uncertain", httpStatus: 200, checkedAt: "..." }
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';

function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

/* ── In-memory rate limiter ── */
const ipBuckets = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    const window = 60000; // 1 minute
    const max = 10;       // 10 checks per minute
    const key = ip + ':health';

    let bucket = ipBuckets.get(key);
    if (!bucket) { bucket = []; ipBuckets.set(key, bucket); }

    const recent = bucket.filter(t => now - t < window);
    if (recent.length >= max) { ipBuckets.set(key, recent); return false; }

    recent.push(now);
    ipBuckets.set(key, recent);

    if (ipBuckets.size > 2000) {
        for (const [k, v] of ipBuckets) {
            const f = v.filter(t => now - t < 300000);
            if (f.length === 0) ipBuckets.delete(k);
            else ipBuckets.set(k, f);
        }
    }
    return true;
}

/* ── Known invite link patterns ── */
const INVITE_PATTERNS = [
    { domain: 'chat.whatsapp.com', platform: 'whatsapp' },
    { domain: 'wa.me', platform: 'whatsapp' },
    { domain: 't.me', platform: 'telegram' },
    { domain: 'telegram.me', platform: 'telegram' },
    { domain: 'discord.gg', platform: 'discord' },
    { domain: 'discord.com/invite', platform: 'discord' },
    { domain: 'facebook.com/groups', platform: 'facebook' },
    { domain: 'signal.group', platform: 'signal' },
    { domain: 'reddit.com/r/', platform: 'reddit' },
    { domain: 'viber.com', platform: 'viber' },
    { domain: 'line.me', platform: 'line' },
];

function detectPlatform(url) {
    const lower = url.toLowerCase();
    for (const p of INVITE_PATTERNS) {
        if (lower.includes(p.domain)) return p.platform;
    }
    return 'unknown';
}

/* ── Dead-link detection heuristics ── */
const DEAD_INDICATORS = [
    'invite link has expired',
    'invite link is invalid',
    'this invite link has been revoked',
    'group not found',
    'page not found',
    'this group is no longer available',
    'couldn\'t find this group',
    'the invite link is no longer valid',
    'this channel is private',
    'expired invite link',
    'join link is invalid',
    'link has been reset',
];

function analyzeResponse(httpStatus, body, platform) {
    // HTTP-level checks
    if (httpStatus === 404 || httpStatus === 410) return 'dead';
    if (httpStatus >= 500) return 'uncertain';
    if (httpStatus === 403) return 'uncertain'; // could be geo-blocked

    // Body content checks
    if (body) {
        const lower = body.toLowerCase();
        for (const indicator of DEAD_INDICATORS) {
            if (lower.includes(indicator)) return 'dead';
        }
    }

    // If we get a 200/301/302, the link is likely alive
    if (httpStatus >= 200 && httpStatus < 400) return 'active';

    return 'uncertain';
}

/* ── Main handler ── */
export async function onRequest(context) {
    const { request } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
    }

    if (request.method !== 'POST') {
        return new Response(
            JSON.stringify({ ok: false, error: 'Method not allowed' }),
            { status: 405, headers: corsHeaders(origin) }
        );
    }

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

    if (!checkRateLimit(ip)) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Too many requests. Try again later.' }),
            { status: 429, headers: corsHeaders(origin) }
        );
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({ ok: false, error: 'Invalid JSON' }),
            { status: 400, headers: corsHeaders(origin) }
        );
    }

    const url = body.url;
    if (!url || typeof url !== 'string') {
        return new Response(
            JSON.stringify({ ok: false, error: 'Missing url field' }),
            { status: 400, headers: corsHeaders(origin) }
        );
    }

    // Validate URL format
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('bad protocol');
    } catch {
        return new Response(
            JSON.stringify({ ok: false, error: 'Invalid URL format' }),
            { status: 400, headers: corsHeaders(origin) }
        );
    }

    const platform = detectPlatform(url);
    const checkedAt = new Date().toISOString();

    try {
        // Attempt a fetch with a short timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; GroupsMix HealthCheck/1.0)',
                'Accept': 'text/html,application/xhtml+xml,*/*'
            }
        });

        clearTimeout(timeout);

        // Read a limited portion of the body for analysis
        const bodyText = await res.text().then(t => t.slice(0, 5000)).catch(() => '');
        const status = analyzeResponse(res.status, bodyText, platform);

        return new Response(
            JSON.stringify({
                ok: true,
                status: status,
                httpStatus: res.status,
                platform: platform,
                checkedAt: checkedAt
            }),
            { status: 200, headers: corsHeaders(origin) }
        );
    } catch (err) {
        // Network error / timeout — uncertain
        const isAbort = err.name === 'AbortError';
        return new Response(
            JSON.stringify({
                ok: true,
                status: 'uncertain',
                httpStatus: 0,
                platform: platform,
                checkedAt: checkedAt,
                reason: isAbort ? 'timeout' : 'network_error'
            }),
            { status: 200, headers: corsHeaders(origin) }
        );
    }
}
