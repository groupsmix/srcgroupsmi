/**
 * Cloudflare Pages Function — Server-side admin gate for /admin/*
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
        } catch (_e) {
            try {
                session = JSON.parse(atob(decoded));
            } catch (_e2) {
                return null;
            }
        }
        return session.access_token || (session[0] && session[0].access_token) || null;
    } catch (_e) {
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
    } catch (_e) {
        return null;
    }
}

/**
 * Verify the access token with Supabase Auth server
 * and check admin role in the users table.
 * Caches the result in KV for 30 seconds to prevent
 * excessive Supabase calls on every admin page load.
 */
async function verifyAdmin(accessToken, env) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseAnonKey = env.SUPABASE_ANON_KEY;
    const kv = env.STORE_KV;

    // Check KV cache first to avoid 2x Supabase roundtrips on every request
    const cacheKey = 'admin_role:' + accessToken;
    if (kv) {
        const cached = await kv.get(cacheKey);
        if (cached === 'true') return true;
        if (cached === 'false') return false;
    }

    // Step 1: Verify token with Supabase Auth (getUser endpoint)
    const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'apikey': supabaseAnonKey
        }
    });

    if (!userRes.ok) {
        if (kv) await kv.put(cacheKey, 'false', { expirationTtl: 30 });
        return false;
    }

    const userData = await userRes.json();
    if (!userData || !userData.id) {
        if (kv) await kv.put(cacheKey, 'false', { expirationTtl: 30 });
        return false;
    }

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

    if (!roleRes.ok) {
        if (kv) await kv.put(cacheKey, 'false', { expirationTtl: 30 });
        return false;
    }

    const rows = await roleRes.json();
    if (!Array.isArray(rows) || rows.length === 0) {
        if (kv) await kv.put(cacheKey, 'false', { expirationTtl: 30 });
        return false;
    }

    const isAdmin = rows[0].role === 'admin' || rows[0].role === 'moderator';
    
    // Cache the result for 30 seconds to speed up subsequent loads
    // while keeping the demotion TOCTOU window minimal.
    if (kv) {
        await kv.put(cacheKey, isAdmin ? 'true' : 'false', { expirationTtl: 30 });
    }
    
    return isAdmin;
}

function redirectHome(request) {
    // Return 403 Forbidden instead of redirect to satisfy M1 compliance
    return new Response('Forbidden', { status: 403 });
}

export async function onRequest(context) {
    const { request, next, env } = context;

    const SUPABASE_URL = env && env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = env && env.SUPABASE_ANON_KEY;

    // Fail closed: without Supabase config we cannot verify anything,
    // so refuse to serve the admin page.
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error('admin-gate: SUPABASE_URL or SUPABASE_ANON_KEY not configured — refusing to serve admin page');
        return redirectHome(request);
    }

    const projectRef = getProjectRef(SUPABASE_URL);
    if (!projectRef) {
        console.error('admin-gate: could not derive Supabase project ref from SUPABASE_URL');
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
        const isAdmin = await verifyAdmin(accessToken, env);
        if (!isAdmin) {
            return redirectHome(request);
        }
    } catch (err) {
        // Verification error → fail closed rather than leaking the page.
        console.error('admin-gate: admin verification error (' + (err.message || 'unknown') + ') — denying access');
        return redirectHome(request);
    }

    // Admin verified via cookie → serve the page normally.
    return next();
}
