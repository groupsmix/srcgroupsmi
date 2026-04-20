/**
 * Browser-side cryptographically-secure random-string helpers for GroupsMix.
 *
 * Uses `window.crypto.getRandomValues`, which is available in every browser
 * we target. Replaces ad-hoc `Math.random().toString(36)` usages for
 * security-adjacent identifiers (referral codes, session IDs, visitor IDs).
 *
 * Attached to `window.SecureRandom` so it can be used from inline/extracted
 * scripts without an import system. See functions/api/_shared/secure-random.js
 * for the server-side counterpart.
 */
(function (root) {
    'use strict';

    var LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    function secureRandomString(length, alphabet) {
        var n = Number(length);
        if (!Number.isInteger(n) || n <= 0) {
            throw new TypeError('SecureRandom.string: length must be a positive integer');
        }
        var alpha = (typeof alphabet === 'string' && alphabet.length > 0) ? alphabet : LOWER;
        if (alpha.length > 256) {
            throw new RangeError('SecureRandom.string: alphabet longer than 256 is unsupported');
        }
        var cutoff = 256 - (256 % alpha.length);
        var out = new Array(n);
        var filled = 0;
        // Web Crypto getRandomValues tops out at 65_536 bytes per call.
        var bufSize = Math.min(65536, Math.max(n * 2, 16));
        var buf = new Uint8Array(bufSize);
        var cryptoObj = root.crypto || root.msCrypto;
        while (filled < n) {
            cryptoObj.getRandomValues(buf);
            for (var i = 0; i < buf.length && filled < n; i++) {
                var v = buf[i];
                if (v < cutoff) out[filled++] = alpha[v % alpha.length];
            }
        }
        return out.join('');
    }

    function secureRandomUpperAlnum(length) {
        return secureRandomString(length, UPPER);
    }

    function secureRandomHex(length) {
        var n = Number(length);
        if (!Number.isInteger(n) || n <= 0) {
            throw new TypeError('SecureRandom.hex: length must be a positive integer');
        }
        var bytes = new Uint8Array(Math.ceil(n / 2));
        (root.crypto || root.msCrypto).getRandomValues(bytes);
        var s = '';
        for (var i = 0; i < bytes.length; i++) {
            s += bytes[i].toString(16).padStart(2, '0');
        }
        return s.slice(0, n);
    }

    root.SecureRandom = {
        string: secureRandomString,
        upperAlnum: secureRandomUpperAlnum,
        hex: secureRandomHex
    };
}(typeof window !== 'undefined' ? window : globalThis));
