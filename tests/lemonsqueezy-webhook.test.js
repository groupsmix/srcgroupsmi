import { describe, it, expect } from 'vitest';
import {
    verifySignature,
    onRequest
} from '../functions/api/lemonsqueezy-webhook.js';

// Compute a LemonSqueezy-style hex HMAC-SHA256 for test bodies.
async function hmacHex(secret, body) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    return Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

describe('verifySignature', () => {
    it('accepts a correctly-signed body', async () => {
        const secret = 'test-secret';
        const body = '{"data":{"id":"1"}}';
        const sig = await hmacHex(secret, body);
        expect(await verifySignature(secret, sig, body)).toBe(true);
    });

    it('rejects an altered body with the original signature', async () => {
        const secret = 'test-secret';
        const body = '{"data":{"id":"1"}}';
        const sig = await hmacHex(secret, body);
        const tampered = '{"data":{"id":"2"}}';
        expect(await verifySignature(secret, sig, tampered)).toBe(false);
    });

    it('rejects a signature from a different secret', async () => {
        const body = '{"data":{"id":"1"}}';
        const goodSig = await hmacHex('attacker-secret', body);
        expect(await verifySignature('real-secret', goodSig, body)).toBe(false);
    });

    it('rejects an empty / missing signature', async () => {
        expect(await verifySignature('s', '', 'body')).toBe(false);
        expect(await verifySignature('s', null, 'body')).toBe(false);
    });

    it('rejects non-hex signatures', async () => {
        expect(await verifySignature('s', 'not-hex!!!', 'body')).toBe(false);
    });

    it('rejects signatures of the wrong byte length', async () => {
        // 16 bytes of hex = 32 chars, not 64 → invalid SHA-256 output length
        expect(await verifySignature('s', 'a'.repeat(32), 'body')).toBe(false);
    });
});

function makeRequest(body, headers = {}) {
    return new Request('https://example.com/api/lemonsqueezy-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body
    });
}

describe('onRequest (webhook fail-closed behaviour)', () => {
    it('returns 503 when LEMONSQUEEZY_WEBHOOK_SECRET is unset', async () => {
        const res = await onRequest({
            request: makeRequest('{}'),
            env: {}
        });
        expect(res.status).toBe(503);
    });

    it('returns 401 when the signature is invalid', async () => {
        const res = await onRequest({
            request: makeRequest('{"ping":1}', { 'X-Signature': 'deadbeef' }),
            env: { LEMONSQUEEZY_WEBHOOK_SECRET: 'secret' }
        });
        expect(res.status).toBe(401);
    });

    it('rejects (not 503) when the signature is valid but payload is empty', async () => {
        const body = '{"meta":{"event_name":"noop"},"data":{"id":"x","type":"orders","attributes":{}}}';
        const sig = await hmacHex('secret', body);
        const res = await onRequest({
            request: makeRequest(body, { 'X-Signature': sig }),
            env: { LEMONSQUEEZY_WEBHOOK_SECRET: 'secret' }
        });
        // Secret is valid, handler proceeds; it may 200 (unrecognized event)
        // or do other work, but it MUST NOT 503 / 401.
        expect(res.status).not.toBe(503);
        expect(res.status).not.toBe(401);
    });
});
