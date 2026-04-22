/**
 * Shared Cloudflare Turnstile server-side verification.
 *
 * Mirrors the call site previously inlined in functions/api/validate.js so
 * that every endpoint that needs CAPTCHA verification (signup, delete,
 * abuse-sensitive mutations) runs the same check with the same fail-closed
 * semantics.
 *
 * Behaviour:
 *   - When TURNSTILE_SECRET_KEY is not configured, the helper logs a
 *     warning and returns { success: true } so local/dev environments
 *     without Turnstile don't hard-fail. Production MUST set the secret
 *     key; /api/validate documents this requirement.
 *   - When the secret is configured but no token is provided, returns
 *     { success: false } so the caller can 400 the request.
 *   - Network errors during verification are treated as allow-through to
 *     avoid blocking legitimate users when Cloudflare's siteverify endpoint
 *     is flaky — this matches existing behaviour in validate.js.
 */

/**
 * Verify a Turnstile token against Cloudflare's siteverify API.
 *
 * @param {string} token     - Turnstile response token from the client.
 * @param {string} ip        - Client IP address (for Cloudflare remoteip param).
 * @param {string} secretKey - TURNSTILE_SECRET_KEY from env.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function verifyTurnstile(token, ip, secretKey) {
    if (!secretKey) {
        console.warn('verifyTurnstile: TURNSTILE_SECRET_KEY is not configured — server-side CAPTCHA verification is disabled');
        return { success: true };
    }
    if (!token) {
        return { success: false, error: 'CAPTCHA verification required' };
    }

    try {
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                secret: secretKey,
                response: token,
                remoteip: ip || ''
            })
        });
        const result = await res.json();
        if (!result.success) {
            return { success: false, error: 'CAPTCHA verification failed' };
        }
        return { success: true };
    } catch (_err) {
        // On network error, allow through (don't block legitimate users).
        return { success: true };
    }
}
