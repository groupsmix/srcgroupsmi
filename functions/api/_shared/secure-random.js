/**
 * Cryptographically-secure random-string helpers for Cloudflare Pages Functions.
 *
 * `Math.random()` is not suitable for any identifier that an attacker must not
 * be able to predict or enumerate (referral codes, session IDs, short-URL
 * collision tiebreakers, anti-CSRF tokens, etc.). It is seeded from a weak
 * PRNG and has been shown to leak internal state after a few observed outputs.
 *
 * These helpers wrap `crypto.getRandomValues` (available in both the Cloudflare
 * runtime and Node 20+ via the WebCrypto global) to produce URL-safe strings
 * with uniform distribution over a caller-supplied alphabet.
 */

const DEFAULT_ALPHABET_LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_ALPHABET_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Generate a cryptographically-random string of `length` characters drawn
 * uniformly from `alphabet`.
 *
 * Rejection-sampling is used so the distribution is uniform even when
 * `alphabet.length` does not evenly divide 256.
 *
 * @param {number} length  - Desired output length (must be > 0)
 * @param {string} [alphabet] - Character set to draw from (default: [a-z0-9])
 * @returns {string}
 */
export function secureRandomString(length, alphabet) {
    const n = Number(length);
    if (!Number.isInteger(n) || n <= 0) {
        throw new TypeError('secureRandomString: length must be a positive integer');
    }
    const alpha = typeof alphabet === 'string' && alphabet.length > 0
        ? alphabet
        : DEFAULT_ALPHABET_LOWER;
    if (alpha.length > 256) {
        throw new RangeError('secureRandomString: alphabet longer than 256 is unsupported');
    }

    const out = new Array(n);
    // Rejection sampling: largest multiple of alpha.length that fits in 256.
    const cutoff = 256 - (256 % alpha.length);
    let filled = 0;
    // Oversample to reduce the average number of getRandomValues() calls,
    // but cap at 65_536 bytes — the Web Crypto QuotaExceededError limit.
    const bufSize = Math.min(65_536, Math.max(n * 2, 16));
    const buf = new Uint8Array(bufSize);

    while (filled < n) {
        crypto.getRandomValues(buf);
        for (let i = 0; i < buf.length && filled < n; i++) {
            const v = buf[i];
            if (v < cutoff) out[filled++] = alpha[v % alpha.length];
        }
    }
    return out.join('');
}

/**
 * Generate a uppercase alphanumeric secure random string — convenience wrapper.
 *
 * @param {number} length
 * @returns {string}
 */
export function secureRandomUpperAlnum(length) {
    return secureRandomString(length, DEFAULT_ALPHABET_UPPER);
}

/**
 * Generate a hex-encoded secure random string of `length` hex characters.
 *
 * @param {number} length
 * @returns {string}
 */
export function secureRandomHex(length) {
    const n = Number(length);
    if (!Number.isInteger(n) || n <= 0) {
        throw new TypeError('secureRandomHex: length must be a positive integer');
    }
    const bytes = new Uint8Array(Math.ceil(n / 2));
    crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, '0');
    }
    return out.slice(0, n);
}
