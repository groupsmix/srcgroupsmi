/**
 * /api/shorten — Create a shortened link (server-side)
 *
 * Stores the link in Supabase `short_links` table.
 *
 * Request (POST JSON):
 *   { url, alias?, userId? }
 *
 * Response (JSON):
 *   { ok: true, code, shortUrl } or { ok: false, errors: [...] }
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';

/** CORS headers with Content-Type for JSON responses */
function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

/* ── Generate a random 6-char code ───────────────────────────── */
/* Security: use crypto.getRandomValues for unpredictable short codes */
function generateCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[bytes[i] % chars.length];
    }
    return code;
}

/* ── URL validation ──────────────────────────────────────────── */
function isValidUrl(url) {
    if (typeof url !== 'string') return false;
    try {
        const u = new URL(url);
        return u.protocol === 'https:';
    } catch {
        return false;
    }
}

/* ── Allowed group invite link domains ──────────────────────── */
/* Only allow shortening group invite links — not generic URLs */
const ALLOWED_LINK_DOMAINS = [
    'chat.whatsapp.com',
    't.me', 'telegram.me',
    'discord.gg', 'discord.com/invite',
    'facebook.com/groups', 'www.facebook.com/groups', 'fb.com/groups'
];

function isAllowedGroupLink(url) {
    try {
        const u = new URL(url);
        const hostname = u.hostname.toLowerCase();
        const pathname = u.pathname.toLowerCase();
        const hostAndPath = hostname + pathname;
        return ALLOWED_LINK_DOMAINS.some(function(domain) {
            // For domains with paths (e.g. facebook.com/groups), check host+path
            if (domain.includes('/')) {
                return hostAndPath.startsWith(domain) || hostAndPath.startsWith('www.' + domain);
            }
            // For plain domains, just check hostname
            return hostname === domain || hostname.endsWith('.' + domain);
        });
    } catch {
        return false;
    }
}

/* ── Main handler ────────────────────────────────────────────── */
export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
    }

    if (request.method !== 'POST') {
        return new Response(
            JSON.stringify({ ok: false, errors: ['Method not allowed'] }),
            { status: 405, headers: corsHeaders(origin) }
        );
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({ ok: false, errors: ['Invalid JSON body'] }),
            { status: 400, headers: corsHeaders(origin) }
        );
    }

    const { url, alias, userId } = body;

    // Validate URL
    if (!url || !isValidUrl(url)) {
        return new Response(
            JSON.stringify({ ok: false, errors: ['A valid HTTPS URL is required'] }),
            { status: 422, headers: corsHeaders(origin) }
        );
    }

    // Restrict to group invite links only
    if (!isAllowedGroupLink(url)) {
        return new Response(
            JSON.stringify({ ok: false, errors: ['Only group invite links are allowed (WhatsApp, Telegram, Discord, Facebook Groups)'] }),
            { status: 422, headers: corsHeaders(origin) }
        );
    }

    // Determine code
    let code = alias ? alias.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 30) : generateCode();
    if (!code) code = generateCode();

    // Use Supabase REST API to insert the short link. Both values must come
    // from the environment — we no longer fall back to a hardcoded project
    // URL because a stale fallback would silently point writes at whatever
    // Supabase project that ref happens to resolve to.
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY || env?.SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
        return new Response(
            JSON.stringify({ ok: false, errors: ['Service temporarily unavailable. Please try again later.'] }),
            { status: 503, headers: corsHeaders(origin) }
        );
    }

    try {
        // Check if code already exists
        const checkRes = await fetch(
            supabaseUrl + '/rest/v1/short_links?code=eq.' + encodeURIComponent(code) + '&select=id',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const existing = await checkRes.json();
        if (Array.isArray(existing) && existing.length > 0) {
            // Code taken — generate a new unpredictable one. We keep the
            // tie-breaker in the same 36-char alphabet as `generateCode()`
            // rather than a 2-digit decimal suffix so the resulting space is
            // 36^8 (~2.8e12) instead of 36^6 * 100 (~2.2e11).
            code = generateCode() + generateCode().slice(0, 2);
        }

        // Insert the short link
        const insertRes = await fetch(supabaseUrl + '/rest/v1/short_links', {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                code,
                long_url: url,
                creator_uid: userId || null
            })
        });

        if (!insertRes.ok) {
            const err = await insertRes.text();
            console.error('Supabase insert error:', err);
            return new Response(
                JSON.stringify({ ok: false, errors: ['Failed to create short link. Please try again.'] }),
                { status: 500, headers: corsHeaders(origin) }
            );
        }

        const [record] = await insertRes.json();
        return new Response(
            JSON.stringify({
                ok: true,
                code,
                shortUrl: 'https://groupsmix.com/go?code=' + code,
                id: record?.id || null,
                persisted: true
            }),
            { status: 200, headers: corsHeaders(origin) }
        );
    } catch (err) {
        console.error('Shorten error:', err);
        return new Response(
            JSON.stringify({ ok: false, errors: ['Internal error. Please try again.'] }),
            { status: 500, headers: corsHeaders(origin) }
        );
    }
}
