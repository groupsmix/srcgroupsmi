/**
 * Shared JWT authentication middleware for Cloudflare Pages Functions.
 *
 * Verifies Supabase access tokens by calling the Supabase Auth /user endpoint.
 * Returns the authenticated user object or null if verification fails.
 */

const SUPABASE_URL_FALLBACK = 'https://hmlqppacanpxmrfdlkec.supabase.co';
const SUPABASE_ANON_KEY_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtbHFwcGFjYW5weG1yZmRsa2VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDkxMTUsImV4cCI6MjA4NzkyNTExNX0.xRDweHu4st7Hk--lQyLYlRU5ufUsXWbArvsIjVznr9o';

/**
 * Extract the Bearer token from the Authorization header.
 * Also checks for the token in cookies (sb-access-token) as a fallback.
 * @param {Request} request
 * @returns {string|null}
 */
export function extractToken(request) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }

    // Fallback: check cookies for Supabase session token
    const cookies = request.headers.get('Cookie') || '';
    const match = cookies.match(/sb-[^=]+-auth-token=([^;]+)/);
    if (match) {
        try {
            const parsed = JSON.parse(decodeURIComponent(match[1]));
            if (Array.isArray(parsed) && parsed[0]) return parsed[0];
            if (parsed.access_token) return parsed.access_token;
        } catch (e) {
            // Not valid JSON, use raw value
            return match[1];
        }
    }

    return null;
}

/**
 * Verify a Supabase JWT access token by calling the Auth /user endpoint.
 * @param {string} accessToken
 * @param {object} [env] - Environment variables (optional, for custom Supabase URL/key)
 * @returns {Promise<object|null>} The user object if valid, null otherwise.
 */
export async function verifyToken(accessToken, env) {
    if (!accessToken) return null;

    const url = (env && env.SUPABASE_URL) || SUPABASE_URL_FALLBACK;
    const key = (env && env.SUPABASE_ANON_KEY) || SUPABASE_ANON_KEY_FALLBACK;

    try {
        const res = await fetch(url + '/auth/v1/user', {
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'apikey': key
            }
        });

        if (!res.ok) return null;

        const user = await res.json();
        if (!user || !user.id) return null;

        return user;
    } catch (err) {
        console.error('verifyToken error:', err.message || err);
        return null;
    }
}

/**
 * Middleware: require a valid Supabase JWT on the request.
 * Returns { user, token } if valid, or a 401 Response if not.
 *
 * Usage in a Cloudflare Pages Function:
 *   const authResult = await requireAuth(request, env, corsHdrs);
 *   if (authResult instanceof Response) return authResult;  // 401
 *   const { user, token } = authResult;
 *
 * @param {Request} request
 * @param {object} env
 * @param {object} headers - CORS headers to include in 401 response
 * @returns {Promise<Response|{user: object, token: string}>}
 */
export async function requireAuth(request, env, headers) {
    const token = extractToken(request);
    if (!token) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Authentication required' }),
            { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } }
        );
    }

    const user = await verifyToken(token, env);
    if (!user) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Invalid or expired token' }),
            { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } }
        );
    }

    return { user, token };
}
