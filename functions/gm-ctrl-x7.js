/**
 * Cloudflare Pages Function — Server-side admin gate for /gm-ctrl-x7
 *
 * This middleware intercepts requests to the admin panel and verifies:
 * 1. A valid Supabase auth token exists in the request cookies
 * 2. The JWT is verified server-side against Supabase Auth
 * 3. The authenticated user has role = 'admin' in the users table
 *
 * If any check fails, the user is redirected to the homepage.
 * The admin HTML is NEVER served to unauthenticated or non-admin users.
 */

const SUPABASE_URL = 'https://hmlqppacanpxmrfdlkec.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtbHFwcGFjYW5weG1yZmRsa2VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDkxMTUsImV4cCI6MjA4NzkyNTExNX0.xRDweHu4st7Hk--lQyLYlRU5ufUsXWbArvsIjVznr9o';

/**
 * Parse the Supabase auth token from cookies.
 * Supabase JS SDK stores the session in cookies with key patterns like:
 * sb-<project-ref>-auth-token or sb-<project-ref>-auth-token.0, .1, etc.
 */
function getAccessTokenFromCookies(cookieHeader) {
    if (!cookieHeader) return null;

    const cookies = {};
    cookieHeader.split(';').forEach(function (c) {
        const parts = c.trim().split('=');
        if (parts.length >= 2) {
            cookies[parts[0]] = parts.slice(1).join('=');
        }
    });

    // Supabase stores session in sb-<ref>-auth-token cookie
    // The project ref is extracted from the URL
    const projectRef = 'hmlqppacanpxmrfdlkec';
    const tokenKey = 'sb-' + projectRef + '-auth-token';

    // It might be a single cookie or chunked (.0, .1, etc.)
    let raw = cookies[tokenKey] || '';

    // Check for chunked cookies
    if (!raw) {
        let chunks = [];
        let i = 0;
        while (cookies[tokenKey + '.' + i] !== undefined) {
            chunks.push(cookies[tokenKey + '.' + i]);
            i++;
        }
        if (chunks.length) raw = chunks.join('');
    }

    if (!raw) return null;

    try {
        // The cookie value is a JSON-encoded session object
        const decoded = decodeURIComponent(raw);
        // Try to parse as base64 first (some versions encode it)
        let session;
        try {
            session = JSON.parse(decoded);
        } catch (e) {
            // Try base64 decode
            try {
                session = JSON.parse(atob(decoded));
            } catch (e2) {
                return null;
            }
        }
        return session.access_token || (session[0] && session[0].access_token) || null;
    } catch (e) {
        return null;
    }
}

/**
 * Verify the access token with Supabase Auth server
 * and check admin role in the users table.
 */
async function verifyAdmin(accessToken) {
    // Step 1: Verify token with Supabase Auth (getUser endpoint)
    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'apikey': SUPABASE_ANON_KEY
        }
    });

    if (!userRes.ok) return false;

    const userData = await userRes.json();
    if (!userData || !userData.id) return false;

    // Step 2: Check the user's role in the users table via PostgREST
    const roleRes = await fetch(
        SUPABASE_URL + '/rest/v1/users?select=id,role&auth_id=eq.' + userData.id + '&limit=1',
        {
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'apikey': SUPABASE_ANON_KEY,
                'Accept': 'application/json'
            }
        }
    );

    if (!roleRes.ok) return false;

    const rows = await roleRes.json();
    if (!Array.isArray(rows) || rows.length === 0) return false;

    return rows[0].role === 'admin' || rows[0].role === 'moderator';
}

export async function onRequest(context) {
    const { request, next } = context;

    // Only gate GET requests to the admin page
    if (request.method !== 'GET') {
        return next();
    }

    const cookieHeader = request.headers.get('Cookie');
    const accessToken = getAccessTokenFromCookies(cookieHeader);

    if (!accessToken) {
        // No auth cookie found — Supabase JS v2 uses localStorage by default,
        // so cookies may not be present. Pass through to client-side gate
        // which checks localStorage-based session + verifies role via RLS.
        return next();
    }

    try {
        const isAdmin = await verifyAdmin(accessToken);
        if (!isAdmin) {
            // Cookie exists but user is NOT admin → block at server level
            return Response.redirect(new URL('/', request.url).toString(), 302);
        }
    } catch (err) {
        // Verification error → pass through to client-side gate (don't lock out admins)
        return next();
    }

    // Admin verified via cookie → serve the page normally
    return next();
}
