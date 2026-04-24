/**
 * Per-user daily AI quota (F-017 / E-4).
 *
 * Enforces a per-authenticated-user cap on daily AI usage across the
 * different server-side AI endpoints (/api/groq, /api/chat, …). Each
 * tool has a weight so that expensive tools cost more units against
 * the quota than cheap ones. The counter is keyed per user per UTC
 * calendar day and persisted in Cloudflare KV (RATE_LIMIT_KV binding),
 * with an in-memory fallback per isolate so limits still apply when
 * KV is not bound or is briefly unavailable.
 *
 * KV key format: "aiq:{userId}:{YYYY-MM-DD}"
 * KV value:      stringified integer (units consumed so far today)
 * KV TTL:        seconds until next UTC midnight + 5 min buffer
 *
 * NOTE: Cloudflare KV does not offer atomic increments, so the
 * get-then-put pattern here is best-effort under concurrent requests —
 * same compromise the existing rate limiter makes (see rate-limit.js).
 * This matches project conventions and is acceptable for soft-limit
 * quota enforcement.
 */

import { WorkerEnv } from './types';

/* ── Default daily quota (override with env.AI_QUOTA_DAILY_LIMIT) ── */
export const DEFAULT_DAILY_QUOTA = 100;

/* ── Per-tool weighting ───────────────────────────────────────────
 *
 * Weights are tuned to roughly reflect the cost of each tool —
 * creative/long-output tools and multi-pass analytical tools cost
 * more than simple chat turns. Unknown tool ids fall back to
 * DEFAULT_TOOL_WEIGHT so that new endpoints get reasonable default
 * pricing without having to edit this table.
 */
export const DEFAULT_TOOL_WEIGHT = 1;

export const TOOL_WEIGHTS = {
    // Chat / lightweight
    'chat':                   1,

    // /api/groq creative tools (OpenRouter-primary, medium output)
    'name-generator':         2,
    'group-rules-generator':  2,
    'viral-post':             3,
    'bio-generator':          2,
    'cover-designer':         2,

    // /api/groq precision/analytical tools (Groq-primary, heavier reasoning)
    'scam-detector':          2,
    'privacy-auditor':        3,
    'group-health-analyzer':  4,

    // /api/article-ai tasks
    'article-suggest-titles':    1,
    'article-suggest-tags':      1,
    'article-generate-excerpt':  1,
    'article-suggest-category':  1,
    'article-improve-writing':   2,
    'article-grammar-check':     2,
    'article-seo':               2,
    'article-moderate':          2,
    'article-summary':           2,
    'article-translate':         3,
    'article-to-thread':         3,
    'article-smart-search':      1,
    'article-trending-topics':   3,
    'article-reading-stats':     1,
    'article-related':           1,

    // /api/jobs-ai actions
    'validate':   1,
    'enhance':    2,
    'categorize': 1,
    'match':      2,

    // /api/store-ai actions
    'search':                    1,
    'recommend':                 2,
    'enhance-desc':              2,
    'bundles':                   2,
    'seller-trust':              1,
    'smart-pricing':             2,
    'listing-quality':           2,
    'purchase-recommendations':  2,
    'frequently-bought':         1,
    'wishlist-alerts':           1
};

/**
 * Resolve the weight (quota cost) for a given tool id.
 * @param {string|undefined|null} toolId
 * @returns {number} positive integer weight
 */
export function getToolWeight(toolId) {
    if (!toolId || typeof toolId !== 'string') return DEFAULT_TOOL_WEIGHT;
    const weight = TOOL_WEIGHTS[toolId];
    if (typeof weight === 'number' && weight > 0) return weight;
    return DEFAULT_TOOL_WEIGHT;
}

/**
 * Resolve the configured daily quota from env, falling back to the
 * compile-time default. Non-positive or non-numeric values are
 * ignored so a misconfigured env var cannot accidentally disable
 * enforcement.
 * @param {WorkerEnv} [env]
 * @returns {number}
 */
export function resolveDailyQuota(env) {
    if (env && env.AI_QUOTA_DAILY_LIMIT !== undefined && env.AI_QUOTA_DAILY_LIMIT !== null) {
        const parsed = parseInt(String(env.AI_QUOTA_DAILY_LIMIT), 10);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return DEFAULT_DAILY_QUOTA;
}

/**
 * UTC date stamp in YYYY-MM-DD form for the given instant (defaults to now).
 * @param {number} [nowMs]
 * @returns {string}
 */
export function utcDateString(nowMs) {
    const d = new Date(typeof nowMs === 'number' ? nowMs : Date.now());
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

/**
 * Seconds from the given instant until next UTC midnight.
 * @param {number} [nowMs]
 * @returns {number}
 */
export function secondsUntilUtcMidnight(nowMs) {
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    const d = new Date(now);
    const next = Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate() + 1,
        0, 0, 0, 0
    );
    return Math.max(1, Math.ceil((next - now) / 1000));
}

/* ── In-memory fallback (per isolate, resets on cold start) ──────── */
const memoryCounters = new Map();

function memoryKey(userId, dateStr) {
    return userId + ':' + dateStr;
}

function pruneMemory(nowMs) {
    if (memoryCounters.size <= 5000) return;
    const today = utcDateString(nowMs);
    for (const k of memoryCounters.keys()) {
        const idx = k.lastIndexOf(':');
        if (idx < 0) { memoryCounters.delete(k); continue; }
        if (k.slice(idx + 1) !== today) memoryCounters.delete(k);
    }
}

function checkAndConsumeMemory(userId, weight, limit, nowMs) {
    const dateStr = utcDateString(nowMs);
    const key = memoryKey(userId, dateStr);
    const current = memoryCounters.get(key) || 0;
    if (current + weight > limit) {
        return {
            allowed: false,
            used: current,
            remaining: Math.max(0, limit - current),
            limit: limit,
            weight: weight,
            resetAt: resetAtIso(nowMs)
        };
    }
    const next = current + weight;
    memoryCounters.set(key, next);
    pruneMemory(nowMs);
    return {
        allowed: true,
        used: next,
        remaining: Math.max(0, limit - next),
        limit: limit,
        weight: weight,
        resetAt: resetAtIso(nowMs)
    };
}

function resetAtIso(nowMs) {
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    const d = new Date(now);
    return new Date(Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate() + 1,
        0, 0, 0, 0
    )).toISOString();
}

/* ── KV-backed quota counter ─────────────────────────────────────── */
async function checkAndConsumeKV(userId, weight, limit, kv, nowMs) {
    const dateStr = utcDateString(nowMs);
    const key = 'aiq:' + userId + ':' + dateStr;

    let current = 0;
    try {
        const raw = await kv.get(key);
        if (raw) {
            const parsed = parseInt(raw, 10);
            if (Number.isFinite(parsed) && parsed >= 0) current = parsed;
        }
    } catch {
        // KV read failed — fall back to in-memory so limits still apply
        return checkAndConsumeMemory(userId, weight, limit, nowMs);
    }

    if (current + weight > limit) {
        return {
            allowed: false,
            used: current,
            remaining: Math.max(0, limit - current),
            limit: limit,
            weight: weight,
            resetAt: resetAtIso(nowMs)
        };
    }

    const next = current + weight;
    try {
        // TTL = remaining seconds in day + 5 min buffer so a burst right
        // before midnight can't end up with a value that outlives the day.
        const ttlSeconds = secondsUntilUtcMidnight(nowMs) + 300;
        await kv.put(key, String(next), { expirationTtl: ttlSeconds });
    } catch {
        // KV write failed — mirror into memory so at least this isolate
        // enforces the new total, matching rate-limit.js behavior.
        memoryCounters.set(memoryKey(userId, dateStr), next);
    }

    return {
        allowed: true,
        used: next,
        remaining: Math.max(0, limit - next),
        limit: limit,
        weight: weight,
        resetAt: resetAtIso(nowMs)
    };
}

/**
 * Check the daily AI quota for a user and, if they have enough headroom,
 * atomically consume `weight` units. When the user is over quota the
 * counter is NOT advanced.
 *
 * @param {string} userId   - Stable user identifier (e.g. Supabase auth user id)
 * @param {string} toolId   - Tool / action id used to look up the weight
 * @param {WorkerEnv} env      - Cloudflare Pages env (for AI_QUOTA_DAILY_LIMIT override)
 * @param {any} [kv]     - Cloudflare KV namespace binding (RATE_LIMIT_KV)
 * @param {object} [opts]
 * @param {number} [opts.weight]  - Override weight (bypasses TOOL_WEIGHTS lookup)
 * @param {number} [opts.nowMs]   - Injected clock for deterministic testing
 * @returns {Promise<{allowed: boolean, used: number, remaining: number, limit: number, weight: number, resetAt: string}>}
 */
export async function checkAndConsumeQuota(userId, toolId, env, kv, opts) {
    const options = opts || {};
    const weight = typeof options.weight === 'number' && options.weight > 0
        ? Math.floor(options.weight)
        : getToolWeight(toolId);
    const limit = resolveDailyQuota(env);
    const nowMs = typeof options.nowMs === 'number' ? options.nowMs : Date.now();

    if (!userId || typeof userId !== 'string') {
        // Defensive: without a stable user id we cannot enforce a per-user
        // quota. Report as allowed with zero usage so callers can still
        // decide to deny anonymous requests upstream.
        return {
            allowed: true,
            used: 0,
            remaining: limit,
            limit: limit,
            weight: weight,
            resetAt: resetAtIso(nowMs)
        };
    }

    if (kv) {
        return checkAndConsumeKV(userId, weight, limit, kv, nowMs);
    }
    return checkAndConsumeMemory(userId, weight, limit, nowMs);
}

/**
 * Read-only lookup of the user's current daily quota status without
 * consuming any units. Intended for status/header endpoints.
 *
 * @param {string} userId
 * @param {WorkerEnv} env
 * @param {any} [kv]
 * @param {object} [opts]
 * @param {number} [opts.nowMs]
 * @returns {Promise<{used: number, remaining: number, limit: number, resetAt: string}>}
 */
export async function getQuotaStatus(userId, env, kv, opts) {
    const options = opts || {};
    const limit = resolveDailyQuota(env);
    const nowMs = typeof options.nowMs === 'number' ? options.nowMs : Date.now();
    const dateStr = utcDateString(nowMs);

    let used = 0;
    if (userId && typeof userId === 'string') {
        if (kv) {
            try {
                const raw = await kv.get('aiq:' + userId + ':' + dateStr);
                if (raw) {
                    const parsed = parseInt(raw, 10);
                    if (Number.isFinite(parsed) && parsed >= 0) used = parsed;
                }
            } catch {
                used = memoryCounters.get(memoryKey(userId, dateStr)) || 0;
            }
        } else {
            used = memoryCounters.get(memoryKey(userId, dateStr)) || 0;
        }
    }

    return {
        used: used,
        remaining: Math.max(0, limit - used),
        limit: limit,
        resetAt: resetAtIso(nowMs)
    };
}

/**
 * Build a standard 429 Response when a user exceeds their daily AI
 * quota. Shared so every endpoint returns the same shape.
 *
 * @param {object} status - result from checkAndConsumeQuota where allowed === false
 * @param {object} headers - base headers (usually CORS) to extend
 * @returns {Response}
 */
export function quotaExceededResponse(status, headers) {
    const body = {
        ok: false,
        error: 'Daily AI quota exceeded. Please try again after the reset.',
        quota: {
            used: status.used,
            remaining: status.remaining,
            limit: status.limit,
            weight: status.weight,
            resetAt: status.resetAt
        }
    };
    return new Response(JSON.stringify(body), {
        status: 429,
        headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Retry-After': String(Math.max(1, Math.ceil((new Date(status.resetAt).getTime() - Date.now()) / 1000)))
        }
    });
}

/* ── Test-only: reset in-memory state between tests ──────────────── */
export function __resetMemoryForTests() {
    memoryCounters.clear();
}
