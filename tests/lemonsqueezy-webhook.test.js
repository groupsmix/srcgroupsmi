import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyHmacSignature as verifySignature } from '../functions/api/_shared/webhook-verify.js';
import { onRequest } from '../functions/api/lemonsqueezy-webhook.js';

/* ── Test helpers ────────────────────────────────────────────── */

function makeKv(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        store,
        get: vi.fn(async (k) => (store.has(k) ? store.get(k) : null)),
        put: vi.fn(async (k, v) => { store.set(k, v); }),
        delete: vi.fn(async (k) => { store.delete(k); })
    };
}

/**
 * Capture every fetch call and respond based on a simple URL+method match
 * table. Unmatched calls return 200 with "[]" so downstream code can parse.
 */
function installFetchMock(routes) {
    const calls = [];
    const handler = vi.fn(async (url, init) => {
        const method = (init?.method || 'GET').toUpperCase();
        calls.push({
            url: typeof url === 'string' ? url : url.toString(),
            method,
            body: init?.body ? String(init.body) : '',
            headers: init?.headers || {}
        });
        for (const route of routes) {
            if (route.match(calls[calls.length - 1])) {
                return route.respond(calls[calls.length - 1]);
            }
        }
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const orig = globalThis.fetch;
    globalThis.fetch = handler;
    return {
        calls,
        restore() { globalThis.fetch = orig; }
    };
}

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
        const body = JSON.stringify({
            meta: {
                event_name: 'noop'
            },
            data: {
                id: 'x',
                type: 'orders',
                attributes: {}
            }
        });
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

/* ── Epic B — Payments Integrity ─────────────────────────────── */

const SECRET = 'secret';
const ORDER_BODY = JSON.stringify({
    meta: {
        event_name: 'order_created',
        custom_data: { uid: 'auth-123' }
    },
    data: {
        id: '999',
        type: 'orders',
        attributes: {
            status: 'paid',
            user_email: 'buyer@example.com',
            total: 500,
            currency: 'USD',
            first_order_item: { product_id: '42', variant_id: '7', product_name: 'Popular' },
            urls: { receipt: 'https://ls.example/r' }
        }
    }
});

describe('B-1 replay-window ledger', () => {
    let fetchMock;
    afterEach(() => { fetchMock?.restore(); });

    it('writes to STORE_KV only after successful processing and rejects replays', async () => {
        fetchMock = installFetchMock([
            {
                match: (c) => c.url.includes('/rest/v1/purchases') && c.method === 'POST',
                respond: () => new Response(JSON.stringify([{ order_id: '999' }]), { status: 201 })
            },
            {
                match: (c) => c.url.includes('/rest/v1/rpc/credit_coins_from_order'),
                respond: () => new Response(JSON.stringify({ status: 'credited', coins: 600 }), { status: 200 })
            }
        ]);

        const sig = await hmacHex(SECRET, ORDER_BODY);
        const kv = makeKv();
        const env = {
            LEMONSQUEEZY_WEBHOOK_SECRET: SECRET,
            STORE_KV: kv,
            SUPABASE_URL: 'https://db.example',
            SUPABASE_SERVICE_KEY: 'service-role'
        };

        // First delivery: no ledger entry → processes, then marks.
        const res1 = await onRequest({
            request: makeRequest(ORDER_BODY, { 'X-Signature': sig, 'X-Event-Name': 'order_created' }),
            env
        });
        expect(res1.status).toBe(200);
        const body1 = await res1.json();
        expect(body1.replay).toBeUndefined();
        expect(kv.put).toHaveBeenCalledTimes(1);
        expect(kv.put.mock.calls[0][0]).toContain(sig);
        expect(kv.put.mock.calls[0][2]).toMatchObject({ expirationTtl: 7 * 24 * 60 * 60 });

        // Second delivery with same body+signature: short-circuits, no
        // additional Supabase calls.
        const beforeCalls = fetchMock.calls.length;
        const res2 = await onRequest({
            request: makeRequest(ORDER_BODY, { 'X-Signature': sig, 'X-Event-Name': 'order_created' }),
            env
        });
        expect(res2.status).toBe(200);
        const body2 = await res2.json();
        expect(body2.replay).toBe(true);
        expect(fetchMock.calls.length).toBe(beforeCalls);
    });
});

describe('B-2 ignore-duplicates + dup logging', () => {
    let fetchMock;
    afterEach(() => { fetchMock?.restore(); });

    it('sends Prefer: resolution=ignore-duplicates on the purchase insert', async () => {
        fetchMock = installFetchMock([
            {
                match: (c) => c.url.includes('/rest/v1/purchases') && c.method === 'POST',
                respond: () => new Response(JSON.stringify([{ order_id: '999' }]), { status: 201 })
            },
            {
                match: (c) => c.url.includes('/rest/v1/rpc/credit_coins_from_order'),
                respond: () => new Response(JSON.stringify({ status: 'credited', coins: 600 }), { status: 200 })
            }
        ]);

        const sig = await hmacHex(SECRET, ORDER_BODY);
        await onRequest({
            request: makeRequest(ORDER_BODY, { 'X-Signature': sig, 'X-Event-Name': 'order_created' }),
            env: {
                LEMONSQUEEZY_WEBHOOK_SECRET: SECRET,
                SUPABASE_URL: 'https://db.example',
                SUPABASE_SERVICE_KEY: 'service-role'
            }
        });
        const purchaseCall = fetchMock.calls.find(c => c.url.includes('/rest/v1/purchases') && c.method === 'POST');
        expect(purchaseCall).toBeDefined();
        const prefer = purchaseCall.headers.Prefer || purchaseCall.headers.Prefer || '';
        expect(prefer).toMatch(/resolution=ignore-duplicates/);
    });

    it('skips coin crediting + referral tracking when the purchase row was a duplicate', async () => {
        fetchMock = installFetchMock([
            {
                // Duplicate insert: PostgREST returns 201 with "[]" under
                // resolution=ignore-duplicates,return=representation.
                match: (c) => c.url.includes('/rest/v1/purchases') && c.method === 'POST',
                respond: () => new Response('[]', { status: 201, headers: { 'Content-Type': 'application/json' } })
            }
        ]);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });

        const body = JSON.stringify({
            meta: {
                event_name: 'order_created',
                custom_data: { uid: 'auth-123', ref: 'CODE1' }
            },
            data: {
                id: '999',
                type: 'orders',
                attributes: {
                    status: 'paid',
                    user_email: 'b@x',
                    total: 500,
                    currency: 'USD',
                    first_order_item: { product_id: '42', variant_id: '7' }
                }
            }
        });
        const sig = await hmacHex(SECRET, body);
        const res = await onRequest({
            request: makeRequest(body, { 'X-Signature': sig, 'X-Event-Name': 'order_created' }),
            env: {
                LEMONSQUEEZY_WEBHOOK_SECRET: SECRET,
                SUPABASE_URL: 'https://db.example',
                SUPABASE_SERVICE_KEY: 'service-role'
            }
        });
        expect(res.status).toBe(200);

        // No coin RPC, no referral RPC.
        const creditCall = fetchMock.calls.find(c => c.url.includes('/credit_coins_from_order'));
        const refCall = fetchMock.calls.find(c => c.url.includes('/increment_referral_purchases'));
        expect(creditCall).toBeUndefined();
        expect(refCall).toBeUndefined();

        // A duplicate log line was emitted.
        const logged = warn.mock.calls.some(args => String(args[0] || '').includes('Duplicate order_created webhook'));
        expect(logged).toBe(true);
        warn.mockRestore();
    });
});

describe('B-3 single-RPC coin credit flow', () => {
    let fetchMock;
    afterEach(() => { fetchMock?.restore(); });

    it('calls credit_coins_from_order with the normalised payload and makes no lookup calls', async () => {
        fetchMock = installFetchMock([
            {
                match: (c) => c.url.includes('/rest/v1/purchases') && c.method === 'POST',
                respond: () => new Response(JSON.stringify([{ order_id: '999' }]), { status: 201 })
            },
            {
                match: (c) => c.url.includes('/rest/v1/rpc/credit_coins_from_order'),
                respond: () => new Response(JSON.stringify({ status: 'credited', coins: 600, user_id: 'u1' }), { status: 200 })
            }
        ]);

        const sig = await hmacHex(SECRET, ORDER_BODY);
        await onRequest({
            request: makeRequest(ORDER_BODY, { 'X-Signature': sig, 'X-Event-Name': 'order_created' }),
            env: {
                LEMONSQUEEZY_WEBHOOK_SECRET: SECRET,
                SUPABASE_URL: 'https://db.example',
                SUPABASE_SERVICE_KEY: 'service-role'
            }
        });

        // No legacy lookup calls.
        const pkgLookup = fetchMock.calls.find(c => c.url.includes('/rest/v1/coin_packages'));
        const userLookup = fetchMock.calls.find(c => c.url.includes('/rest/v1/users?auth_id='));
        const oldCredit = fetchMock.calls.find(c => c.url.endsWith('/rest/v1/rpc/credit_coins'));
        expect(pkgLookup).toBeUndefined();
        expect(userLookup).toBeUndefined();
        expect(oldCredit).toBeUndefined();

        const rpc = fetchMock.calls.find(c => c.url.includes('/rest/v1/rpc/credit_coins_from_order'));
        expect(rpc).toBeDefined();
        const parsed = JSON.parse(rpc.body);

        // Golden fixture test: enforce exact strict payload matching
        const expectedGoldenFixture = {
            order_id: '999',
            product_id: '42',
            variant_id: '7',
            auth_id: 'auth-123',
            price: 500,
            currency: 'USD'
        };
        
        expect(parsed.payload).toStrictEqual(expectedGoldenFixture);
    });
});

describe('B-4 dead-letter queue on handler errors', () => {
    let fetchMock;
    afterEach(() => { fetchMock?.restore(); });

    it('writes the failed event to webhook_dead_letters, clears replay, returns 500', async () => {
        fetchMock = installFetchMock([
            {
                // Purchase insert fails with 500 — the handler throws and
                // the outer try/catch should DLQ + clearReplay + 500.
                match: (c) => c.url.includes('/rest/v1/purchases') && c.method === 'POST',
                respond: () => new Response('boom', { status: 500 })
            },
            {
                match: (c) => c.url.includes('/rest/v1/webhook_dead_letters') && c.method === 'POST',
                respond: () => new Response('', { status: 201 })
            }
        ]);

        const sig = await hmacHex(SECRET, ORDER_BODY);
        const kv = makeKv();
        const res = await onRequest({
            request: makeRequest(ORDER_BODY, { 'X-Signature': sig, 'X-Event-Name': 'order_created' }),
            env: {
                LEMONSQUEEZY_WEBHOOK_SECRET: SECRET,
                STORE_KV: kv,
                SUPABASE_URL: 'https://db.example',
                SUPABASE_SERVICE_KEY: 'service-role'
            }
        });
        expect(res.status).toBe(500);

        const dlqCall = fetchMock.calls.find(c => c.url.includes('/rest/v1/webhook_dead_letters'));
        expect(dlqCall).toBeDefined();
        const dlqBody = JSON.parse(dlqCall.body);
        expect(dlqBody.provider).toBe('lemonsqueezy');
        expect(dlqBody.event_name).toBe('order_created');
        expect(dlqBody.signature).toBe(sig);
        expect(String(dlqBody.error)).toContain('Supabase purchase sync failed');

        // Replay ledger was NOT kept — clearReplay was called so a
        // provider retry can actually succeed.
        expect(kv.put).not.toHaveBeenCalled();
        expect(kv.delete).toHaveBeenCalled();
    });
});

describe('Refund Flow constraints', () => {
    let fetchMock;
    afterEach(() => { fetchMock?.restore(); });

    it('throws error and DLQs when user has insufficient coin balance to refund', async () => {
        fetchMock = installFetchMock([
            {
                // Sync order
                match: (c) => c.url.includes('/rest/v1/purchases?order_id=eq.999') && c.method === 'PATCH',
                respond: () => new Response('[]', { status: 200 })
            },
            {
                // Find original transaction
                match: (c) => c.url.includes('/rest/v1/wallet_transactions') && c.method === 'GET',
                respond: () => new Response(JSON.stringify([{ amount: 100, user_id: 'auth-123' }]), { status: 200 })
            },
            {
                // Debit coins fails because of negative balance constraint
                match: (c) => c.url.includes('/rest/v1/rpc/debit_coins'),
                respond: () => new Response('negative balance constraint violated', { status: 400 })
            },
            {
                // DLQ insert
                match: (c) => c.url.includes('/rest/v1/webhook_dead_letters') && c.method === 'POST',
                respond: () => new Response('', { status: 201 })
            }
        ]);

        const REFUND_BODY = JSON.stringify({
            meta: { event_name: 'order_refunded' },
            data: { id: '999', type: 'orders', attributes: {} }
        });

        const sig = await hmacHex(SECRET, REFUND_BODY);
        const kv = makeKv();
        const res = await onRequest({
            request: makeRequest(REFUND_BODY, { 'X-Signature': sig, 'X-Event-Name': 'order_refunded' }),
            env: {
                LEMONSQUEEZY_WEBHOOK_SECRET: SECRET,
                STORE_KV: kv,
                SUPABASE_URL: 'https://db.example',
                SUPABASE_SERVICE_KEY: 'service-role'
            }
        });
        
        // It must return 500 to LemonSqueezy so they retry the webhook,
        // and must write to the DLQ so operators know a refund failed.
        expect(res.status).toBe(500);

        const dlqCall = fetchMock.calls.find(c => c.url.includes('/rest/v1/webhook_dead_letters'));
        expect(dlqCall).toBeDefined();
        const dlqBody = JSON.parse(dlqCall.body);
        expect(String(dlqBody.error)).toContain('Refund failed: unable to debit 100 coins');
    });
});

// Silence the replay-ledger-read console.error noise in unrelated tests.
beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => { });
    vi.spyOn(console, 'info').mockImplementation(() => { });
});
afterEach(() => {
    vi.restoreAllMocks();
});
