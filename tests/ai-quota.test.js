import { describe, it, expect } from 'vitest';
import {
    consumeAIQuota,
    DEFAULT_DAILY_QUOTA,
    resolveDailyQuota,
    weightForTool,
    TOOL_WEIGHTS
} from '../functions/api/_shared/ai-quota.js';

describe('weightForTool', () => {
    it('returns the configured weight for known tools', () => {
        expect(weightForTool('chat')).toBe(TOOL_WEIGHTS.chat);
        expect(weightForTool('name-generator')).toBe(TOOL_WEIGHTS['name-generator']);
    });

    it('defaults to 1 for unknown or invalid tool ids', () => {
        expect(weightForTool('some-unknown-tool')).toBe(1);
        expect(weightForTool('')).toBe(1);
        expect(weightForTool(null)).toBe(1);
        expect(weightForTool(undefined)).toBe(1);
        expect(weightForTool(123)).toBe(1);
    });
});

describe('resolveDailyQuota', () => {
    it('returns the default when env is undefined', () => {
        expect(resolveDailyQuota()).toBe(DEFAULT_DAILY_QUOTA);
        expect(resolveDailyQuota({})).toBe(DEFAULT_DAILY_QUOTA);
    });

    it('parses a positive integer from env', () => {
        expect(resolveDailyQuota({ AI_DAILY_QUOTA: '250' })).toBe(250);
    });

    it('falls back to default for invalid values', () => {
        expect(resolveDailyQuota({ AI_DAILY_QUOTA: '0' })).toBe(DEFAULT_DAILY_QUOTA);
        expect(resolveDailyQuota({ AI_DAILY_QUOTA: '-5' })).toBe(DEFAULT_DAILY_QUOTA);
        expect(resolveDailyQuota({ AI_DAILY_QUOTA: 'abc' })).toBe(DEFAULT_DAILY_QUOTA);
        expect(resolveDailyQuota({ AI_DAILY_QUOTA: '' })).toBe(DEFAULT_DAILY_QUOTA);
    });
});

function makeMockKV() {
    const store = {};
    return {
        store,
        get: async (key) => (key in store ? store[key] : null),
        put: async (key, value) => { store[key] = value; }
    };
}

describe('consumeAIQuota (in-memory fallback)', () => {
    // Each test uses a distinct userId so the per-isolate map doesn't
    // leak state between cases.
    it('allows calls up to the limit and then blocks', async () => {
        const userId = 'u-mem-' + Date.now();
        const a = await consumeAIQuota({ userId, weight: 1, limit: 3 });
        const b = await consumeAIQuota({ userId, weight: 1, limit: 3 });
        const c = await consumeAIQuota({ userId, weight: 1, limit: 3 });
        const d = await consumeAIQuota({ userId, weight: 1, limit: 3 });

        expect(a.allowed).toBe(true);
        expect(b.allowed).toBe(true);
        expect(c.allowed).toBe(true);
        expect(c.remaining).toBe(0);
        expect(d.allowed).toBe(false);
        expect(d.used).toBe(3);
        expect(d.limit).toBe(3);
    });

    it('respects per-call weights', async () => {
        const userId = 'u-weight-' + Date.now();
        const first  = await consumeAIQuota({ userId, weight: 3, limit: 5 });
        const second = await consumeAIQuota({ userId, weight: 3, limit: 5 });

        expect(first.allowed).toBe(true);
        expect(first.used).toBe(3);
        // 3 + 3 = 6 > limit 5, so the second call must be rejected without
        // mutating the counter past the limit.
        expect(second.allowed).toBe(false);
        expect(second.used).toBe(3);
    });

    it('derives weight from toolId when weight is omitted', async () => {
        const userId = 'u-tool-' + Date.now();
        const res = await consumeAIQuota({ userId, toolId: 'name-generator', limit: 100 });
        expect(res.allowed).toBe(true);
        expect(res.weight).toBe(TOOL_WEIGHTS['name-generator']);
    });

    it('isolates counters by userId', async () => {
        const a = 'u-iso-a-' + Date.now();
        const b = 'u-iso-b-' + Date.now();

        await consumeAIQuota({ userId: a, weight: 1, limit: 1 });
        const aSecond = await consumeAIQuota({ userId: a, weight: 1, limit: 1 });
        const bFirst  = await consumeAIQuota({ userId: b, weight: 1, limit: 1 });

        expect(aSecond.allowed).toBe(false);
        expect(bFirst.allowed).toBe(true);
    });

    it('returns a UTC-midnight reset timestamp', async () => {
        const userId = 'u-reset-' + Date.now();
        const now = Date.UTC(2030, 5, 15, 10, 0, 0); // 2030-06-15T10:00:00Z
        const res = await consumeAIQuota({ userId, weight: 1, limit: 10, now });
        const reset = new Date(res.resetsAt);
        expect(reset.getUTCFullYear()).toBe(2030);
        // The next UTC midnight is 2030-06-16T00:00:00Z.
        expect(reset.getUTCMonth()).toBe(5);
        expect(reset.getUTCDate()).toBe(16);
        expect(reset.getUTCHours()).toBe(0);
    });
});

describe('consumeAIQuota (KV-backed)', () => {
    it('persists the counter via the KV namespace', async () => {
        const kv = makeMockKV();
        const userId = 'u-kv-' + Date.now();

        const a = await consumeAIQuota({ userId, weight: 1, limit: 2, kv });
        const b = await consumeAIQuota({ userId, weight: 1, limit: 2, kv });
        const c = await consumeAIQuota({ userId, weight: 1, limit: 2, kv });

        expect(a.allowed).toBe(true);
        expect(b.allowed).toBe(true);
        expect(c.allowed).toBe(false);

        // Exactly one day-scoped key should have been written.
        const keys = Object.keys(kv.store).filter(k => k.startsWith('aiq:' + userId + ':'));
        expect(keys).toHaveLength(1);
        expect(kv.store[keys[0]]).toBe('2');
    });

    it('falls back to memory when KV reads throw', async () => {
        const brokenKV = {
            get: async () => { throw new Error('KV down'); },
            put: async () => { throw new Error('KV down'); }
        };
        const userId = 'u-kv-broken-' + Date.now();
        const res = await consumeAIQuota({ userId, weight: 1, limit: 5, kv: brokenKV });
        expect(res.allowed).toBe(true);
        expect(res.used).toBe(1);
    });

    it('keys counters by UTC calendar day', async () => {
        const kv = makeMockKV();
        const userId = 'u-kv-day-' + Date.now();

        const day1 = Date.UTC(2030, 0, 1, 12, 0, 0); // 2030-01-01
        const day2 = Date.UTC(2030, 0, 2, 12, 0, 0); // 2030-01-02

        // Exhaust a 1-unit quota on day 1.
        const d1a = await consumeAIQuota({ userId, weight: 1, limit: 1, kv, now: day1 });
        const d1b = await consumeAIQuota({ userId, weight: 1, limit: 1, kv, now: day1 });
        expect(d1a.allowed).toBe(true);
        expect(d1b.allowed).toBe(false);

        // Day 2 should start fresh under a new key.
        const d2 = await consumeAIQuota({ userId, weight: 1, limit: 1, kv, now: day2 });
        expect(d2.allowed).toBe(true);

        const dayKeys = Object.keys(kv.store).filter(k => k.startsWith('aiq:' + userId + ':'));
        expect(dayKeys.sort()).toEqual([
            'aiq:' + userId + ':20300101',
            'aiq:' + userId + ':20300102'
        ]);
    });
});
