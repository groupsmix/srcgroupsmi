/**
 * Cloudflare Pages Function — Server-side admin gate for /gm-ctrl-x7
 *
 * This middleware intercepts requests to the admin panel and verifies:
 * 1. A valid Supabase auth token exists in the request cookies
 * 2. The JWT is verified server-side against Supabase Auth
 * 3. The authenticated user has role = 'admin' (or 'moderator') in the users table
 *
 * If any check fails, the user is redirected to the homepage.
 * The admin HTML is NEVER served to unauthenticated or non-admin users.
 */

/**
 * Parse the Supabase auth token from cookies.
 * Supabase JS SDK stores the session in cookies with key patterns like:
 * sb-<project-ref>-auth-token or sb-<project-ref>-auth-token.0, .1, etc.
 */
function getAccessTokenFromCookies(cookieHeader, projectRef) {
    if (!cookieHeader || !projectRef) return null;

    const cookies = {};
    cookieHeader.split(';').forEach(function (c) {
        const parts = c.trim().split('=');
        if (parts.length >= 2) {
            cookies[parts[0]] = parts.slice(1).join('=');
        }
    });

    const tokenKey = 'sb-' + projectRef + '-auth-token';

    // It might be a single cookie or chunked (.0, .1, etc.)
    let raw = cookies[tokenKey] || '';

    // Check for chunked cookies
    if (!raw) {
        const chunks = [];
        let i = 0;
        while (cookies[tokenKey + '.' + i] !== undefined) {
            chunks.push(cookies[tokenKey + '.' + i]);
            i++;
        }
        if (chunks.length) raw = chunks.join('');
    }

    if (!raw) return null;

    try {
        const decoded = decodeURIComponent(raw);
        let session;
        try {
            session = JSON.parse(decoded);
        } catch (e) {
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
 * Extract the Supabase project ref (e.g. "hmlqppacanpxmrfdlkec")
 * from the SUPABASE_URL so we don't have to hardcode it.
 */
function getProjectRef(supabaseUrl) {
    try {
        const host = new URL(supabaseUrl).hostname;
        const ref = host.split('.')[0];
        return ref || null;
    } catch (e) {
        return null;
    }
}

/**
 * Verify the access token with Supabase Auth server
 * and check admin role in the users table.
 */
async function verifyAdmin(accessToken, supabaseUrl, supabaseAnonKey) {
    // Step 1: Verify token with Supabase Auth (getUser endpoint)
    const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'apikey': supabaseAnonKey
        }
    });

    if (!userRes.ok) return false;

    const userData = await userRes.json();
    if (!userData || !userData.id) return false;

    // Step 2: Check the user's role in the users table via PostgREST
    const roleRes = await fetch(
        supabaseUrl + '/rest/v1/users?select=id,role&auth_id=eq.' + userData.id + '&limit=1',
        {
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'apikey': supabaseAnonKey,
                'Accept': 'application/json'
            }
        }
    );

    if (!roleRes.ok) return false;

    const rows = await roleRes.json();
    if (!Array.isArray(rows) || rows.length === 0) return false;

    return rows[0].role === 'admin' || rows[0].role === 'moderator';
}

function redirectHome(request) {
    return Response.redirect(new URL('/', request.url).toString(), 302);
}

export async function onRequest(context) {
    const { request, next, env } = context;

    // Only gate GET requests to the admin page
    if (request.method !== 'GET') {
        return next();
    }

    const SUPABASE_URL = env && env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = env && env.SUPABASE_ANON_KEY;

    // Fail closed: without Supabase config we cannot verify anything,
    // so refuse to serve the admin page.
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error('gm-ctrl-x7: SUPABASE_URL or SUPABASE_ANON_KEY not configured — refusing to serve admin page');
        return redirectHome(request);
    }

    const projectRef = getProjectRef(SUPABASE_URL);
    if (!projectRef) {
        console.error('gm-ctrl-x7: could not derive Supabase project ref from SUPABASE_URL');
        return redirectHome(request);
    }

    const cookieHeader = request.headers.get('Cookie');
    const accessToken = getAccessTokenFromCookies(cookieHeader, projectRef);

    // Fail closed: no auth cookie → redirect. A client-side-only gate
    // is trivially bypassed (disable JS / edit DOM), so we will not
    // fall through to it.
    if (!accessToken) {
        return redirectHome(request);
    }

    try {
        const isAdmin = await verifyAdmin(accessToken, SUPABASE_URL, SUPABASE_ANON_KEY);
        if (!isAdmin) {
            return redirectHome(request);
        }
    } catch (err) {
        // Verification error → fail closed rather than leaking the page.
        console.error('gm-ctrl-x7: admin verification error (' + (err.message || 'unknown') + ') — denying access');
        return redirectHome(request);
    }

    // Admin verified via cookie → serve the page normally.
    return next();
}
