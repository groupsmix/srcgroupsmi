/**
 * Shared Cloudflare Turnstile verification for Cloudflare Pages Functions.
 *
 * Centralizes CAPTCHA verification so every public-facing endpoint
 * uses the same validation logic without copy-pasting.
 *
 * Environment variable required:
 *   TURNSTILE_SECRET_KEY — Cloudflare Turnstile secret key
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verify a Cloudflare Turnstile token.
 *
 * @param {string} token     - The cf-turnstile-response token from the client.
 * @param {string} secretKey - The Turnstile secret key from env.
 * @param {string} [ip]      - Optional client IP for additional validation.
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function verifyTurnstile(token, secretKey, ip) {
    if (!token || typeof token !== 'string') {
        return { success: false, error: 'Missing CAPTCHA token' };
    }

    if (!secretKey) {
        return { success: false, error: 'Turnstile not configured' };
    }

    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip) formData.append('remoteip', ip);

    try {
        const res = await fetch(TURNSTILE_VERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });

        if (!res.ok) {
            console.error('Turnstile API returned HTTP', res.status);
            return { success: false, error: 'CAPTCHA verification failed' };
        }

        const data = await res.json();

        if (!data.success) {
            const codes = (data['error-codes'] || []).join(', ');
            console.warn('Turnstile rejection:', codes);
            return { success: false, error: 'CAPTCHA verification failed' };
        }

        return { success: true };
    } catch (err) {
        console.error('Turnstile verification error:', err.message || err);
        return { success: false, error: 'CAPTCHA verification failed' };
    }
}
