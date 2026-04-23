import { describe, it, expect, beforeEach } from 'vitest';
import {
    shouldSkipProvider,
    recordSuccess,
    recordFailure,
    __resetCircuitBreakerForTests,
    CIRCUIT_BREAKER_CONFIG
} from '../functions/api/_shared/circuit-breaker.js';

function makeMockKV() {
    const store = {};
    return {
        store,
        get: async (key) => store[key] ?? null,
        put: async (key, value) => { store[key] = value; }
    };
}

function makeBrokenKV() {
    return {
        get: async () => { throw new Error('KV unavailable'); },
        put: async () => { throw new Error('KV unavailable'); }
    };
}

describe('circuit-breaker', () => {
    beforeEach(() => {
        __resetCircuitBreakerForTests();
    });

    it('starts closed and allows calls', async () => {
        const kv = makeMockKV();
        expect(await shouldSkipProvider(kv, 'groq')).toBe(false);
    });

    it('opens after reaching the failure threshold', async () => {
        const kv = makeMockKV();
        for (let i = 0; i < CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD; i++) {
            await recordFailure(kv, 'groq');
        }
        expect(await shouldSkipProvider(kv, 'groq')).toBe(true);
    });

    it('keeps other providers closed when one opens', async () => {
        const kv = makeMockKV();
        for (let i = 0; i < CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD; i++) {
            await recordFailure(kv, 'groq');
        }
        expect(await shouldSkipProvider(kv, 'groq')).toBe(true);
        expect(await shouldSkipProvider(kv, 'openrouter')).toBe(false);
    });

    it('recordSuccess resets the breaker', async () => {
        const kv = makeMockKV();
        for (let i = 0; i < CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD - 1; i++) {
            await recordFailure(kv, 'groq');
        }
        await recordSuccess(kv, 'groq');
        // Next failure should not immediately re-open since the window is clean.
        await recordFailure(kv, 'groq');
        expect(await shouldSkipProvider(kv, 'groq')).toBe(false);
    });

    it('re-closes after the cooldown expires', async () => {
        const kv = makeMockKV();
        // Hand-craft an expired open state.
        const key = 'cb:groq';
        kv.store[key] = JSON.stringify({
            failures: [],
            openUntil: Date.now() - 1000
        });
        expect(await shouldSkipProvider(kv, 'groq')).toBe(false);
    });

    it('stays open while cooldown is in the future', async () => {
        const kv = makeMockKV();
        const key = 'cb:groq';
        kv.store[key] = JSON.stringify({
            failures: [],
            openUntil: Date.now() + 30_000
        });
        expect(await shouldSkipProvider(kv, 'groq')).toBe(true);
    });

    it('works with no KV binding (in-memory fallback)', async () => {
        // Pass null for kv — provider-wide state should still track.
        for (let i = 0; i < CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD; i++) {
            await recordFailure(null, 'openrouter');
        }
        expect(await shouldSkipProvider(null, 'openrouter')).toBe(true);
    });

    it('falls back to memory when KV read fails', async () => {
        const broken = makeBrokenKV();
        // Should not throw; treats provider as closed since memory has no state.
        expect(await shouldSkipProvider(broken, 'groq')).toBe(false);
        // Trip the breaker via in-memory fallback.
        for (let i = 0; i < CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD; i++) {
            await recordFailure(broken, 'groq');
        }
        expect(await shouldSkipProvider(broken, 'groq')).toBe(true);
    });

    it('ignores malformed KV payloads', async () => {
        const kv = makeMockKV();
        kv.store['cb:groq'] = 'not-json';
        expect(await shouldSkipProvider(kv, 'groq')).toBe(false);
    });
});
