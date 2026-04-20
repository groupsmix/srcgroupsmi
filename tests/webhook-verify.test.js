import { describe, it, expect } from 'vitest';
import { timingSafeEqualHex, verifyHmacSignature } from '../functions/api/_shared/webhook-verify.js';

/**
 * Helper: compute the lowercase-hex HMAC-SHA256 of `body` using `secret`.
 * Mirrors what LemonSqueezy's signer produces and what our function verifies.
 */
async function hmacHex(secret, body) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    return Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

describe('timingSafeEqualHex', () => {
    it('returns true for identical strings', () => {
        expect(timingSafeEqualHex('deadbeef', 'deadbeef')).toBe(true);
    });

    it('returns false when a single byte differs', () => {
        expect(timingSafeEqualHex('deadbeef', 'deadbeee')).toBe(false);
    });

    it('returns false for length mismatch without throwing', () => {
        expect(timingSafeEqualHex('deadbeef', 'deadbeefab')).toBe(false);
    });

    it('returns false for non-string inputs', () => {
        // @ts-expect-error — deliberate wrong types
        expect(timingSafeEqualHex(null, 'deadbeef')).toBe(false);
        // @ts-expect-error — deliberate wrong types
        expect(timingSafeEqualHex(undefined, undefined)).toBe(false);
    });
});

describe('verifyHmacSignature', () => {
    const secret = 'test-secret-abc-123';
    const body = JSON.stringify({ meta: { event_name: 'order_created' }, data: { id: '42' } });

    it('accepts a correctly signed payload', async () => {
        const sig = await hmacHex(secret, body);
        expect(await verifyHmacSignature(secret, sig, body)).toBe(true);
    });

    it('rejects a tampered body with otherwise-valid signature', async () => {
        const sig = await hmacHex(secret, body);
        const tampered = body.replace('order_created', 'order_refunded');
        expect(await verifyHmacSignature(secret, sig, tampered)).toBe(false);
    });

    it('rejects a signature signed with the wrong secret', async () => {
        const sig = await hmacHex('wrong-secret', body);
        expect(await verifyHmacSignature(secret, sig, body)).toBe(false);
    });

    it('rejects when the secret is missing (fail-closed)', async () => {
        const sig = await hmacHex(secret, body);
        expect(await verifyHmacSignature('', sig, body)).toBe(false);
        expect(await verifyHmacSignature(undefined, sig, body)).toBe(false);
    });

    it('rejects when the signature header is missing', async () => {
        expect(await verifyHmacSignature(secret, '', body)).toBe(false);
        expect(await verifyHmacSignature(secret, null, body)).toBe(false);
    });

    it('rejects when the body is empty', async () => {
        const sig = await hmacHex(secret, body);
        expect(await verifyHmacSignature(secret, sig, '')).toBe(false);
    });

    it('is case-insensitive on the signature input (hex case-fold)', async () => {
        const sig = await hmacHex(secret, body);
        expect(await verifyHmacSignature(secret, sig.toUpperCase(), body)).toBe(true);
    });
});
