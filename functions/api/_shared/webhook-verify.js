/**
 * Shared HMAC-SHA256 webhook signature verification for Cloudflare Pages Functions.
 *
 * Uses Web Crypto (crypto.subtle) so it runs unchanged on both the Cloudflare
 * runtime and Node 20+ (via the global `crypto` object). Comparison is done
 * with a constant-time equality check to avoid leaking information about the
 * expected signature via timing side channels.
 */

/**
 * Constant-time equality check for two hex strings of equal length.
 * Falls back to `false` for length mismatches without leaking which side differs.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqualHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

/**
 * Convert a Uint8Array to a lowercase hex string.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToHex(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, '0');
    }
    return out;
}

/**
 * Compute the HMAC-SHA256 of `body` using `secret` and compare it to
 * `signatureHex` in constant time.
 *
 * All inputs are required — a missing secret, signature, or body results in
 * `false` (fail-closed). Any exception during key import or HMAC computation
 * is also treated as a verification failure.
 *
 * @param {string} secret      - Shared webhook signing secret
 * @param {string} signatureHex - Signature from the request (hex-encoded)
 * @param {string} body        - Raw request body (as received, pre-parse)
 * @returns {Promise<boolean>} true iff the signature matches
 */
export async function verifyHmacSignature(secret, signatureHex, body) {
    if (!secret || !signatureHex || !body) return false;

    try {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
        const expected = bytesToHex(new Uint8Array(signed));
        return timingSafeEqualHex(expected, String(signatureHex).toLowerCase());
    } catch (err) {
        // Do not leak detail; callers treat `false` as "reject the request".
        console.error('verifyHmacSignature error:', err?.message || err);
        return false;
    }
}
