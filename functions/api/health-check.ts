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

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors';
import { checkRateLimit, RateLimitConfig } from './_shared/rate-limit';
import { PagesContext } from './_shared/types';
import { z } from 'zod';

const healthCheckSchema = z.object({
    url: z.string().url("Invalid URL format").min(1)
}).passthrough();

function corsHeaders(origin: string | null): Record<string, string> {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

/* ── Rate limit config ── */
const HEALTH_CHECK_LIMIT: RateLimitConfig = { window: 60000, max: 10 }; // 10 checks per minute

/* ── Known invite link hostname allowlist ── */
interface AllowlistEntry {
    hostname: string;
    pathPrefix: string;
    platform: string;
}

const INVITE_ALLOWLIST: AllowlistEntry[] = [
    { hostname: 'chat.whatsapp.com', pathPrefix: '/', platform: 'whatsapp' },
    { hostname: 'wa.me', pathPrefix: '/', platform: 'whatsapp' },
    { hostname: 't.me', pathPrefix: '/', platform: 'telegram' },
    { hostname: 'telegram.me', pathPrefix: '/', platform: 'telegram' },
    { hostname: 'discord.gg', pathPrefix: '/', platform: 'discord' },
    { hostname: 'discord.com', pathPrefix: '/invite/', platform: 'discord' },
    { hostname: 'www.discord.com', pathPrefix: '/invite/', platform: 'discord' },
    { hostname: 'facebook.com', pathPrefix: '/groups/', platform: 'facebook' },
    { hostname: 'www.facebook.com', pathPrefix: '/groups/', platform: 'facebook' },
    { hostname: 'signal.group', pathPrefix: '/', platform: 'signal' },
    { hostname: 'www.reddit.com', pathPrefix: '/r/', platform: 'reddit' },
    { hostname: 'reddit.com', pathPrefix: '/r/', platform: 'reddit' },
    { hostname: 'invite.viber.com', pathPrefix: '/', platform: 'viber' },
    { hostname: 'line.me', pathPrefix: '/', platform: 'line' },
];

/* ── Max redirects to follow manually ── */
const MAX_REDIRECTS = 3;

/**
 * Detect platform by strict parsed-hostname matching.
 * Returns 'unknown' if the URL does not match the allowlist.
 */
export function detectPlatform(parsedUrl: URL): string {
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    for (const entry of INVITE_ALLOWLIST) {
        if (hostname === entry.hostname && pathname.startsWith(entry.pathPrefix)) {
            return entry.platform;
        }
    }
    return 'unknown';
}

/**
 * Reject IP literals (v4 and v6) and private/reserved ranges.
 * Returns true if the hostname is safe (a public domain name).
 */
export function isSafeHostname(hostname: string): boolean {
    // Reject trailing dots which bypass simple DNS resolution logic
    if (hostname.endsWith('.')) return false;

    // Reject IPv6 literals (bracketed or bare)
    if (hostname.includes(':') || hostname.startsWith('[')) return false;

    // Reject IPv4 literals (all-digit dotted notation)
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;

    // Reject localhost variants, AWS metadata IP, and .internal / .local domains
    const lower = hostname.toLowerCase();
    if (lower === 'localhost' || lower.endsWith('.localhost')) return false;
    if (lower.endsWith('.local') || lower.endsWith('.internal')) return false;
    if (lower === '0.0.0.0' || lower === '169.254.169.254') return false;

    return true;
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

function analyzeResponse(httpStatus: number, body: string, platform: string): string {
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
export async function onRequest(context: PagesContext): Promise<Response> {
    const { request } = context;
    const origin = request.headers.get('Origin') || null;

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

    const kvStore = context.env?.RATE_LIMIT_KV || null;
    const allowed = await checkRateLimit(ip, 'health', HEALTH_CHECK_LIMIT, kvStore);
    if (!allowed) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Too many requests. Try again later.' }),
            { status: 429, headers: corsHeaders(origin) }
        );
    }

    let body: any;
    try {
        const rawBody = await request.json();
        const validation = healthCheckSchema.safeParse(rawBody);
        if (!validation.success) {
            return new Response(
                JSON.stringify({ ok: false, error: validation.error.issues[0].message }),
                { status: 400, headers: corsHeaders(origin) }
            );
        }
        body = validation.data;
    } catch {
        return new Response(
            JSON.stringify({ ok: false, error: 'Invalid JSON' }),
            { status: 400, headers: corsHeaders(origin) }
        );
    }

    const url = body.url;

    // Validate URL format
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('bad protocol');
    } catch {
        return new Response(
            JSON.stringify({ ok: false, error: 'Invalid URL format' }),
            { status: 400, headers: corsHeaders(origin) }
        );
    }

    // Reject IP literals and private ranges
    if (!isSafeHostname(parsedUrl.hostname)) {
        return new Response(
            JSON.stringify({ ok: false, error: 'IP addresses and private hostnames are not allowed' }),
            { status: 422, headers: corsHeaders(origin) }
        );
    }

    const platform = detectPlatform(parsedUrl);

    if (platform === 'unknown') {
        return new Response(
            JSON.stringify({ ok: false, error: 'Only known group invite links are allowed (WhatsApp, Telegram, Discord, Facebook, Signal, Reddit, Viber, Line)' }),
            { status: 422, headers: corsHeaders(origin) }
        );
    }

    const checkedAt = new Date().toISOString();

    try {
        let currentUrl = url;
        let lastRes: Response | undefined;

        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);

            lastRes = await fetch(currentUrl, {
                method: 'GET',
                signal: controller.signal,
                redirect: 'manual',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; GroupsMix HealthCheck/1.0)',
                    'Accept': 'text/html,application/xhtml+xml,*/*'
                }
            });

            clearTimeout(timeout);

            if (![301, 302, 303, 307, 308].includes(lastRes.status)) break;

            const location = lastRes.headers.get('Location');
            if (!location) break;

            let redirectUrl: URL;
            try {
                redirectUrl = new URL(location, currentUrl);
            } catch {
                break;
            }

            if (!['http:', 'https:'].includes(redirectUrl.protocol)) break;
            if (!isSafeHostname(redirectUrl.hostname)) break;

            currentUrl = redirectUrl.href;
        }

        if (!lastRes) throw new Error('No response');
        const bodyText = await lastRes.text().then(t => t.slice(0, 5000)).catch(() => '');
        const status = analyzeResponse(lastRes.status, bodyText, platform);

        return new Response(
            JSON.stringify({
                ok: true,
                status: status,
                httpStatus: lastRes.status,
                platform: platform,
                checkedAt: checkedAt
            }),
            { status: 200, headers: corsHeaders(origin) }
        );
    } catch (err: any) {
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
