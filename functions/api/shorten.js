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
import { extractToken, verifyToken } from './_shared/auth.js';

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

    const { url, alias } = body;

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

    // Use Supabase REST API to insert the short link.
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY || env?.SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
        return new Response(
            JSON.stringify({ ok: false, errors: ['Service temporarily unavailable. Please try again later.'] }),
            { status: 503, headers: corsHeaders(origin) }
        );
    }

    // Derive user identity server-side
    let creator_uid = null;
    const token = extractToken(request);
    if (token) {
        const authUser = await verifyToken(token, env);
        if (authUser && authUser.id && env?.SUPABASE_SERVICE_KEY) {
            const serviceKey = env.SUPABASE_SERVICE_KEY;
            try {
                const profileRes = await fetch(
                    supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(authUser.id) + '&select=id&limit=1',
                    { headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey } }
                );
                if (profileRes.ok) {
                    const profiles = await profileRes.json();
                    if (profiles && profiles.length > 0) {
                        creator_uid = profiles[0].id;
                    }
                }
            } catch (err) {
                console.error('Failed to fetch user profile:', err);
            }
        }
    }

    let retries = 3;
    let finalCode = code;
    let record = null;

    try {
        while (retries > 0) {
            const insertRes = await fetch(supabaseUrl + '/rest/v1/short_links', {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    code: finalCode,
                    long_url: url,
                    creator_uid
                })
            });

            if (insertRes.ok) {
                [record] = await insertRes.json();
                break;
            } else if (insertRes.status === 409 || insertRes.status === 400) {
                // Conflict - generate new code and retry
                finalCode = generateCode() + generateCode().slice(0, 2);
                retries--;
                if (retries === 0) {
                    return new Response(
                        JSON.stringify({ ok: false, errors: ['Failed to generate unique short code. Please try again.'] }),
                        { status: 500, headers: corsHeaders(origin) }
                    );
                }
            } else {
                const err = await insertRes.text();
                console.error('Supabase insert error:', err);
                return new Response(
                    JSON.stringify({ ok: false, errors: ['Failed to create short link. Please try again.'] }),
                    { status: 500, headers: corsHeaders(origin) }
                );
            }
        }

        return new Response(
            JSON.stringify({
                ok: true,
                code: finalCode,
                shortUrl: 'https://groupsmix.com/go?code=' + finalCode,
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
