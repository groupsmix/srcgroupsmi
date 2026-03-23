/**
 * Shared JWT authentication middleware for Cloudflare Pages Functions.
 *
 * Verifies Supabase access tokens by calling the Supabase Auth /user endpoint.
 * Returns the authenticated user object or null if verification fails.
 */


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

    const url = env && env.SUPABASE_URL;
    const key = env && env.SUPABASE_ANON_KEY;

    if (!url || !key) {
        console.error('verifyToken: SUPABASE_URL or SUPABASE_ANON_KEY not configured');
        return null;
    }

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

/**
 * Middleware: require auth + verify that the claimed user_id matches the authenticated user.
 * Combines JWT verification with profile lookup and ownership check in one call.
 *
 * @param {Request} request
 * @param {object} env
 * @param {object} headers - CORS headers
 * @param {string} claimedUserId - The user_id from the request body/params to verify ownership of
 * @returns {Promise<Response|{user: object, token: string, internalUserId: string}>}
 */
export async function requireAuthWithOwnership(request, env, headers, claimedUserId) {
    const authResult = await requireAuth(request, env, headers);
    if (authResult instanceof Response) return authResult;

    const url = env?.SUPABASE_URL;
    const serviceKey = env?.SUPABASE_SERVICE_KEY;

    if (!url || !serviceKey) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Service not configured' }),
            { status: 503, headers: { ...headers, 'Content-Type': 'application/json' } }
        );
    }

    const profileRes = await fetch(
        url + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(authResult.user.id) + '&select=id&limit=1',
        { headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey } }
    );
    const profiles = await profileRes.json();
    if (!profiles?.length || profiles[0].id !== claimedUserId) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Forbidden: user_id mismatch' }),
            { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } }
        );
    }

    return { ...authResult, internalUserId: profiles[0].id };
}

/**
 * Middleware: require auth + fetch internal user profile with specified fields.
 * Used by endpoints that need the internal user ID and profile data (e.g., seller-dashboard, coins-wallet).
 *
 * @param {Request} request
 * @param {object} env
 * @param {string} [selectFields] - Comma-separated fields to select from the users table (default: 'id,role')
 * @returns {Promise<{authId: string, userId: string, profile: object}>}
 * @throws {Error} On auth failure or missing user
 */
export async function requireAuthWithProfile(request, env, selectFields) {
    const url = env?.SUPABASE_URL;
    const serviceKey = env?.SUPABASE_SERVICE_KEY;
    if (!url || !serviceKey) throw new Error('Server not configured');

    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) throw new Error('Unauthorized');

    const token = authHeader.replace('Bearer ', '');
    const userRes = await fetch(url + '/auth/v1/user', {
        headers: { 'Authorization': 'Bearer ' + token, 'apikey': serviceKey }
    });
    if (!userRes.ok) throw new Error('Invalid token');
    const authUser = await userRes.json();

    const fields = selectFields || 'id,role';
    const profileRes = await fetch(
        url + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(authUser.id) + '&select=' + fields + '&limit=1',
        { headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey } }
    );
    const profiles = await profileRes.json();
    if (!profiles || !profiles.length) throw new Error('User not found');

    return { authId: authUser.id, userId: profiles[0].id, profile: profiles[0] };
}

/**
 * Middleware: require admin role authentication.
 * Verifies JWT, fetches internal profile, and checks for admin role.
 *
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<{authId: string, userId: string, role: string}>}
 * @throws {Error} On auth failure, missing user, or non-admin role
 */
export async function requireAdmin(request, env) {
    const result = await requireAuthWithProfile(request, env, 'id,role');
    if (result.profile.role !== 'admin') throw new Error('Admin access required');
    return { authId: result.authId, userId: result.userId, role: result.profile.role };
}
