import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    shouldAttempt,
    recordSuccess,
    recordFailure,
    inspectBreaker,
    BREAKER_CONSTANTS,
    __resetForTests
} from '../functions/api/_shared/circuit-breaker.js';

function makeMemoryKV() {
    const store = new Map();
    return {
        store,
        get: vi.fn(async (k) => (store.has(k) ? store.get(k) : null)),
        put: vi.fn(async (k, v) => { store.set(k, v); })
    };
}

describe('circuit-breaker', () => {
    beforeEach(() => {
        __resetForTests();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('allows requests when state is closed', async () => {
        const env = { RATE_LIMIT_KV: makeMemoryKV() };
        expect(await shouldAttempt(env, 'groq')).toBe(true);
    });

    it('opens after FAILURE_THRESHOLD consecutive failures', async () => {
        const env = { RATE_LIMIT_KV: makeMemoryKV() };
        for (let i = 0; i < BREAKER_CONSTANTS.FAILURE_THRESHOLD; i++) {
            await recordFailure(env, 'groq');
        }
        const state = await inspectBreaker(env, 'groq');
        expect(state.state).toBe('open');
        expect(await shouldAttempt(env, 'groq')).toBe(false);
    });

    it('enters half-open after cooldown and allows one probe', async () => {
        vi.useFakeTimers();
        const env = { RATE_LIMIT_KV: makeMemoryKV() };
        for (let i = 0; i < BREAKER_CONSTANTS.FAILURE_THRESHOLD; i++) {
            await recordFailure(env, 'groq');
        }
        expect((await inspectBreaker(env, 'groq')).state).toBe('open');

        // Advance past the cooldown window
        vi.setSystemTime(Date.now() + BREAKER_CONSTANTS.OPEN_COOLDOWN_MS + 100);

        expect(await shouldAttempt(env, 'groq')).toBe(true);
        expect((await inspectBreaker(env, 'groq')).state).toBe('half');
    });

    it('success in half-open closes the breaker', async () => {
        vi.useFakeTimers();
        const env = { RATE_LIMIT_KV: makeMemoryKV() };
        for (let i = 0; i < BREAKER_CONSTANTS.FAILURE_THRESHOLD; i++) {
            await recordFailure(env, 'groq');
        }
        vi.setSystemTime(Date.now() + BREAKER_CONSTANTS.OPEN_COOLDOWN_MS + 100);
        await shouldAttempt(env, 'groq'); // → half

        await recordSuccess(env, 'groq');
        const state = await inspectBreaker(env, 'groq');
        expect(state.state).toBe('closed');
        expect(state.failures).toEqual([]);
    });

    it('failure in half-open re-opens the breaker', async () => {
        vi.useFakeTimers();
        const env = { RATE_LIMIT_KV: makeMemoryKV() };
        for (let i = 0; i < BREAKER_CONSTANTS.FAILURE_THRESHOLD; i++) {
            await recordFailure(env, 'groq');
        }
        vi.setSystemTime(Date.now() + BREAKER_CONSTANTS.OPEN_COOLDOWN_MS + 100);
        await shouldAttempt(env, 'groq'); // → half

        await recordFailure(env, 'groq');
        const state = await inspectBreaker(env, 'groq');
        expect(state.state).toBe('open');
    });

    it('isolates breakers per provider', async () => {
        const env = { RATE_LIMIT_KV: makeMemoryKV() };
        for (let i = 0; i < BREAKER_CONSTANTS.FAILURE_THRESHOLD; i++) {
            await recordFailure(env, 'groq');
        }
        expect(await shouldAttempt(env, 'groq')).toBe(false);
        expect(await shouldAttempt(env, 'openrouter')).toBe(true);
    });

    it('fails safe when KV is unbound (allows request)', async () => {
        const env = {};
        expect(await shouldAttempt(env, 'groq')).toBe(true);
        // Failures are still recorded in memory so thresholds still work.
        for (let i = 0; i < BREAKER_CONSTANTS.FAILURE_THRESHOLD; i++) {
            await recordFailure(env, 'groq');
        }
        expect(await shouldAttempt(env, 'groq')).toBe(false);
    });

    it('fails safe when KV.get throws (allows request)', async () => {
        const env = {
            RATE_LIMIT_KV: {
                get: async () => { throw new Error('kv down'); },
                put: async () => { throw new Error('kv down'); }
            }
        };
        expect(await shouldAttempt(env, 'groq')).toBe(true);
    });

    it('prunes stale failures outside the failure window', async () => {
        vi.useFakeTimers();
        const env = { RATE_LIMIT_KV: makeMemoryKV() };
        // Record threshold-1 failures
        for (let i = 0; i < BREAKER_CONSTANTS.FAILURE_THRESHOLD - 1; i++) {
            await recordFailure(env, 'groq');
        }
        // Advance past the failure window
        vi.setSystemTime(Date.now() + BREAKER_CONSTANTS.FAILURE_WINDOW_MS + 1000);
        // One more failure — old ones should be pruned, so we stay closed.
        await recordFailure(env, 'groq');
        expect((await inspectBreaker(env, 'groq')).state).toBe('closed');
    });
});
