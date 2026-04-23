import { describe, it, expect, beforeEach } from 'vitest';
import {
    DEFAULT_DAILY_QUOTA,
    DEFAULT_TOOL_WEIGHT,
    TOOL_WEIGHTS,
    checkAndConsumeQuota,
    getQuotaStatus,
    getToolWeight,
    quotaExceededResponse,
    resolveDailyQuota,
    secondsUntilUtcMidnight,
    utcDateString,
    __resetMemoryForTests
} from '../functions/api/_shared/ai-quota.js';

function makeMockKV() {
    const store = {};
    return {
        store,
        get: async (key) => (Object.hasOwn(store, key) ? store[key] : null),
        put: async (key, value) => { store[key] = value; },
        _delete: (key) => { delete store[key]; }
    };
}

function userId(tag) {
    return 'user-' + tag + '-' + Math.random().toString(36).slice(2, 8);
}

beforeEach(() => {
    __resetMemoryForTests();
});

describe('getToolWeight', () => {
    it('returns the mapped weight for a known tool', () => {
        expect(getToolWeight('viral-post')).toBe(TOOL_WEIGHTS['viral-post']);
        expect(getToolWeight('chat')).toBe(1);
        expect(getToolWeight('group-health-analyzer')).toBe(4);
    });

    it('falls back to the default weight for unknown tool ids', () => {
        expect(getToolWeight('totally-new-tool')).toBe(DEFAULT_TOOL_WEIGHT);
    });

    it('returns the default weight for empty/non-string input', () => {
        expect(getToolWeight('')).toBe(DEFAULT_TOOL_WEIGHT);
        expect(getToolWeight(null)).toBe(DEFAULT_TOOL_WEIGHT);
        expect(getToolWeight(undefined)).toBe(DEFAULT_TOOL_WEIGHT);
        expect(getToolWeight(42)).toBe(DEFAULT_TOOL_WEIGHT);
    });
});

describe('resolveDailyQuota', () => {
    it('uses the default when env is missing or empty', () => {
        expect(resolveDailyQuota(undefined)).toBe(DEFAULT_DAILY_QUOTA);
        expect(resolveDailyQuota({})).toBe(DEFAULT_DAILY_QUOTA);
    });

    it('parses a positive integer override', () => {
        expect(resolveDailyQuota({ AI_QUOTA_DAILY_LIMIT: '250' })).toBe(250);
        expect(resolveDailyQuota({ AI_QUOTA_DAILY_LIMIT: 500 })).toBe(500);
    });

    it('rejects non-positive or non-numeric overrides', () => {
        expect(resolveDailyQuota({ AI_QUOTA_DAILY_LIMIT: '0' })).toBe(DEFAULT_DAILY_QUOTA);
        expect(resolveDailyQuota({ AI_QUOTA_DAILY_LIMIT: '-5' })).toBe(DEFAULT_DAILY_QUOTA);
        expect(resolveDailyQuota({ AI_QUOTA_DAILY_LIMIT: 'abc' })).toBe(DEFAULT_DAILY_QUOTA);
        expect(resolveDailyQuota({ AI_QUOTA_DAILY_LIMIT: null })).toBe(DEFAULT_DAILY_QUOTA);
    });
});

describe('utcDateString / secondsUntilUtcMidnight', () => {
    it('formats the UTC date in YYYY-MM-DD', () => {
        const t = Date.UTC(2025, 0, 2, 3, 4, 5); // 2025-01-02T03:04:05Z
        expect(utcDateString(t)).toBe('2025-01-02');
    });

    it('returns a positive number of seconds until next UTC midnight', () => {
        const justBeforeMidnight = Date.UTC(2025, 5, 15, 23, 59, 0);
        const secs = secondsUntilUtcMidnight(justBeforeMidnight);
        expect(secs).toBeGreaterThan(0);
        expect(secs).toBeLessThanOrEqual(60);
    });
});

describe('checkAndConsumeQuota (in-memory fallback)', () => {
    it('allows usage under the limit and tracks remaining', async () => {
        const uid = userId('mem-allow');
        const env = { AI_QUOTA_DAILY_LIMIT: '10' };

        const r1 = await checkAndConsumeQuota(uid, 'chat', env);
        expect(r1.allowed).toBe(true);
        expect(r1.used).toBe(1);
        expect(r1.remaining).toBe(9);
        expect(r1.limit).toBe(10);
        expect(r1.weight).toBe(1);
        expect(typeof r1.resetAt).toBe('string');

        const r2 = await checkAndConsumeQuota(uid, 'viral-post', env); // weight 3
        expect(r2.allowed).toBe(true);
        expect(r2.used).toBe(4);
        expect(r2.remaining).toBe(6);
    });

    it('denies once the next request would exceed the limit and does not advance the counter', async () => {
        const uid = userId('mem-deny');
        const env = { AI_QUOTA_DAILY_LIMIT: '5' };

        // Consume 4 of 5
        await checkAndConsumeQuota(uid, 'viral-post', env); // +3 → 3
        await checkAndConsumeQuota(uid, 'chat', env);       // +1 → 4

        // Requesting +3 would exceed 5 → denied, counter stays at 4
        const denied = await checkAndConsumeQuota(uid, 'viral-post', env);
        expect(denied.allowed).toBe(false);
        expect(denied.used).toBe(4);
        expect(denied.remaining).toBe(1);

        // A smaller request that still fits is allowed
        const allowed = await checkAndConsumeQuota(uid, 'chat', env);
        expect(allowed.allowed).toBe(true);
        expect(allowed.used).toBe(5);
        expect(allowed.remaining).toBe(0);
    });

    it('isolates counters per user', async () => {
        const a = userId('mem-iso-a');
        const b = userId('mem-iso-b');
        const env = { AI_QUOTA_DAILY_LIMIT: '2' };

        expect((await checkAndConsumeQuota(a, 'chat', env)).allowed).toBe(true);
        expect((await checkAndConsumeQuota(a, 'chat', env)).allowed).toBe(true);
        expect((await checkAndConsumeQuota(a, 'chat', env)).allowed).toBe(false);

        // User B is unaffected
        const bStatus = await checkAndConsumeQuota(b, 'chat', env);
        expect(bStatus.allowed).toBe(true);
        expect(bStatus.used).toBe(1);
    });

    it('uses per-tool weighting so expensive tools cost more', async () => {
        const uid = userId('mem-weight');
        const env = { AI_QUOTA_DAILY_LIMIT: '10' };

        const cheap = await checkAndConsumeQuota(uid, 'chat', env);
        expect(cheap.weight).toBe(1);
        expect(cheap.used).toBe(1);

        const expensive = await checkAndConsumeQuota(uid, 'group-health-analyzer', env); // weight 4
        expect(expensive.weight).toBe(4);
        expect(expensive.used).toBe(5);
    });

    it('supports an explicit weight override', async () => {
        const uid = userId('mem-override');
        const env = { AI_QUOTA_DAILY_LIMIT: '10' };

        const r = await checkAndConsumeQuota(uid, 'chat', env, null, { weight: 7 });
        expect(r.allowed).toBe(true);
        expect(r.weight).toBe(7);
        expect(r.used).toBe(7);
        expect(r.remaining).toBe(3);
    });

    it('allows-with-zero-usage when userId is missing (caller decides what to do)', async () => {
        const r = await checkAndConsumeQuota('', 'chat', { AI_QUOTA_DAILY_LIMIT: '5' });
        expect(r.allowed).toBe(true);
        expect(r.used).toBe(0);
        expect(r.remaining).toBe(5);
    });

    it('resets counters across UTC days via injected clock', async () => {
        const uid = userId('mem-day');
        const env = { AI_QUOTA_DAILY_LIMIT: '2' };
        const day1 = Date.UTC(2025, 5, 15, 12, 0, 0);
        const day2 = Date.UTC(2025, 5, 16, 12, 0, 0);

        await checkAndConsumeQuota(uid, 'chat', env, null, { nowMs: day1 });
        await checkAndConsumeQuota(uid, 'chat', env, null, { nowMs: day1 });
        const denied = await checkAndConsumeQuota(uid, 'chat', env, null, { nowMs: day1 });
        expect(denied.allowed).toBe(false);

        // Next UTC day: fresh counter
        const nextDay = await checkAndConsumeQuota(uid, 'chat', env, null, { nowMs: day2 });
        expect(nextDay.allowed).toBe(true);
        expect(nextDay.used).toBe(1);
    });
});

describe('checkAndConsumeQuota (KV-backed)', () => {
    it('persists usage across calls via KV', async () => {
        const uid = userId('kv-persist');
        const env = { AI_QUOTA_DAILY_LIMIT: '5' };
        const kv = makeMockKV();

        const r1 = await checkAndConsumeQuota(uid, 'viral-post', env, kv); // +3
        expect(r1.allowed).toBe(true);
        expect(r1.used).toBe(3);

        const r2 = await checkAndConsumeQuota(uid, 'chat', env, kv);       // +1
        expect(r2.allowed).toBe(true);
        expect(r2.used).toBe(4);

        const r3 = await checkAndConsumeQuota(uid, 'viral-post', env, kv); // would be 7 — denied
        expect(r3.allowed).toBe(false);
        expect(r3.used).toBe(4);
    });

    it('writes a KV value with a TTL', async () => {
        const uid = userId('kv-ttl');
        const env = { AI_QUOTA_DAILY_LIMIT: '10' };
        const store = {};
        const seen = [];
        const kv = {
            get: async (k) => (Object.hasOwn(store, k) ? store[k] : null),
            put: async (k, v, opts) => { store[k] = v; seen.push({ k, v, opts }); }
        };

        await checkAndConsumeQuota(uid, 'chat', env, kv);
        expect(seen).toHaveLength(1);
        expect(seen[0].opts.expirationTtl).toBeGreaterThan(0);
        expect(seen[0].k.startsWith('aiq:' + uid + ':')).toBe(true);
        expect(seen[0].v).toBe('1');
    });

    it('falls back to memory when KV read throws', async () => {
        const uid = userId('kv-read-fail');
        const env = { AI_QUOTA_DAILY_LIMIT: '3' };
        const brokenKV = {
            get: async () => { throw new Error('KV boom'); },
            put: async () => { throw new Error('KV boom'); }
        };

        const r1 = await checkAndConsumeQuota(uid, 'chat', env, brokenKV);
        expect(r1.allowed).toBe(true);
        expect(r1.used).toBe(1);

        const r2 = await checkAndConsumeQuota(uid, 'chat', env, brokenKV);
        expect(r2.allowed).toBe(true);
        expect(r2.used).toBe(2);
    });

    it('isolates counters per user in KV', async () => {
        const a = userId('kv-iso-a');
        const b = userId('kv-iso-b');
        const env = { AI_QUOTA_DAILY_LIMIT: '2' };
        const kv = makeMockKV();

        expect((await checkAndConsumeQuota(a, 'chat', env, kv)).allowed).toBe(true);
        expect((await checkAndConsumeQuota(a, 'chat', env, kv)).allowed).toBe(true);
        expect((await checkAndConsumeQuota(a, 'chat', env, kv)).allowed).toBe(false);

        const bStatus = await checkAndConsumeQuota(b, 'chat', env, kv);
        expect(bStatus.allowed).toBe(true);
        expect(bStatus.used).toBe(1);
    });
});

describe('getQuotaStatus', () => {
    it('reports current usage without consuming quota (memory)', async () => {
        const uid = userId('status-mem');
        const env = { AI_QUOTA_DAILY_LIMIT: '5' };

        await checkAndConsumeQuota(uid, 'viral-post', env); // +3

        const s1 = await getQuotaStatus(uid, env);
        expect(s1.used).toBe(3);
        expect(s1.remaining).toBe(2);
        expect(s1.limit).toBe(5);

        // getQuotaStatus MUST NOT advance the counter
        const s2 = await getQuotaStatus(uid, env);
        expect(s2.used).toBe(3);
    });

    it('reports current usage from KV', async () => {
        const uid = userId('status-kv');
        const env = { AI_QUOTA_DAILY_LIMIT: '10' };
        const kv = makeMockKV();

        await checkAndConsumeQuota(uid, 'chat', env, kv);       // +1
        await checkAndConsumeQuota(uid, 'viral-post', env, kv); // +3

        const status = await getQuotaStatus(uid, env, kv);
        expect(status.used).toBe(4);
        expect(status.remaining).toBe(6);
    });

    it('returns zero usage for unknown users', async () => {
        const status = await getQuotaStatus(userId('status-none'), { AI_QUOTA_DAILY_LIMIT: '10' });
        expect(status.used).toBe(0);
        expect(status.remaining).toBe(10);
    });
});

describe('quotaExceededResponse', () => {
    it('returns a 429 JSON response with quota metadata and Retry-After', async () => {
        const now = Date.now();
        const resetAt = new Date(now + 60 * 1000).toISOString();
        const status = { allowed: false, used: 10, remaining: 0, limit: 10, weight: 3, resetAt };
        const res = quotaExceededResponse(status, { 'X-Test': 'yes' });

        expect(res.status).toBe(429);
        expect(res.headers.get('Content-Type')).toBe('application/json');
        expect(res.headers.get('X-Test')).toBe('yes');
        const retry = parseInt(res.headers.get('Retry-After'), 10);
        expect(retry).toBeGreaterThan(0);

        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.quota.limit).toBe(10);
        expect(body.quota.remaining).toBe(0);
        expect(body.quota.weight).toBe(3);
        expect(body.quota.resetAt).toBe(resetAt);
    });
});
