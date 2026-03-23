import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '../functions/api/_shared/rate-limit.js';

describe('checkRateLimit (in-memory fallback)', () => {
    // Use unique action names per test to avoid cross-test contamination
    // since the in-memory Map persists across tests in the same run.

    it('allows requests within the limit', async () => {
        const allowed = await checkRateLimit('10.0.0.1', 'test-allow-' + Date.now(), { window: 60000, max: 5 });
        expect(allowed).toBe(true);
    });

    it('blocks requests that exceed the limit', async () => {
        const action = 'test-block-' + Date.now();
        const limit = { window: 60000, max: 3 };

        // Use up all 3 slots
        expect(await checkRateLimit('10.0.0.2', action, limit)).toBe(true);
        expect(await checkRateLimit('10.0.0.2', action, limit)).toBe(true);
        expect(await checkRateLimit('10.0.0.2', action, limit)).toBe(true);

        // 4th request should be blocked
        expect(await checkRateLimit('10.0.0.2', action, limit)).toBe(false);
    });

    it('isolates limits by IP address', async () => {
        const action = 'test-ip-' + Date.now();
        const limit = { window: 60000, max: 1 };

        expect(await checkRateLimit('10.0.0.3', action, limit)).toBe(true);
        expect(await checkRateLimit('10.0.0.4', action, limit)).toBe(true);

        // Each IP has its own counter
        expect(await checkRateLimit('10.0.0.3', action, limit)).toBe(false);
        expect(await checkRateLimit('10.0.0.4', action, limit)).toBe(false);
    });

    it('isolates limits by action', async () => {
        const ip = '10.0.0.5';
        const action1 = 'test-action1-' + Date.now();
        const action2 = 'test-action2-' + Date.now();
        const limit = { window: 60000, max: 1 };

        expect(await checkRateLimit(ip, action1, limit)).toBe(true);
        expect(await checkRateLimit(ip, action2, limit)).toBe(true);

        // Each action has its own counter
        expect(await checkRateLimit(ip, action1, limit)).toBe(false);
        expect(await checkRateLimit(ip, action2, limit)).toBe(false);
    });

    it('uses KV store when provided', async () => {
        const action = 'test-kv-' + Date.now();
        const limit = { window: 60000, max: 2 };

        // Mock KV store
        const store = {};
        const mockKV = {
            get: async (key) => store[key] || null,
            put: async (key, value) => { store[key] = value; }
        };

        expect(await checkRateLimit('10.0.0.6', action, limit, mockKV)).toBe(true);
        expect(await checkRateLimit('10.0.0.6', action, limit, mockKV)).toBe(true);
        expect(await checkRateLimit('10.0.0.6', action, limit, mockKV)).toBe(false);
    });

    it('falls back to memory when KV read fails', async () => {
        const action = 'test-kv-fail-' + Date.now();
        const limit = { window: 60000, max: 2 };

        const brokenKV = {
            get: async () => { throw new Error('KV unavailable'); },
            put: async () => { throw new Error('KV unavailable'); }
        };

        // Should still work via in-memory fallback
        const allowed = await checkRateLimit('10.0.0.7', action, limit, brokenKV);
        expect(allowed).toBe(true);
    });
});
