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

/* ── Allowed origins for CORS ────────────────────────────────── */
const ALLOWED_ORIGINS = [
    'https://groupsmix.com'
];

/* ── CORS headers ────────────────────────────────────────────── */
/* Security: restrict CORS to known origins instead of wildcard */
function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };
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

/* ── Main handler ────────────────────────────────────────────── */
export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
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

    // Determine code
    let code = alias ? alias.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 30) : generateCode();
    if (!code) code = generateCode();

    // Use Supabase REST API to insert the short link
    const supabaseUrl = env?.SUPABASE_URL || 'https://hmlqppacanpxmrfdlkec.supabase.co';
    const supabaseKey = env?.SUPABASE_SERVICE_KEY || env?.SUPABASE_ANON_KEY || '';

    if (!supabaseKey) {
        // Fallback: return a client-side-only short link (no persistence)
        return new Response(
            /* Fix: include https:// protocol in shortUrl */
            JSON.stringify({ ok: true, code, shortUrl: 'https://groupsmix.com/go?code=' + code, persisted: false }),
            { status: 200, headers: corsHeaders(origin) }
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
            // Code taken — generate a new random one
            code = generateCode() + Math.floor(Math.random() * 100);
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
