/**
 * Per-user daily AI quota (Epic E-4 / F-017).
 *
 * Tracks a weighted counter per (user, UTC day) in Cloudflare KV and
 * refuses further AI tool calls once the configured budget is spent.
 *
 * Design:
 *   • Key format: `aiq:{userId}:{yyyymmdd}` where yyyymmdd is the
 *     UTC calendar day. A new key per day means old counters simply
 *     expire — no cron job required.
 *   • Value: the integer count of weighted units already spent.
 *   • TTL: ~48h so the key survives across UTC midnight while the
 *     client may still be holding a request, but never accumulates
 *     indefinitely.
 *   • Fallback: if no KV binding is provided, or if KV reads/writes
 *     throw, fall back to an in-isolate Map. The fallback is *not*
 *     authoritative across isolates, but it still applies the budget
 *     within a single isolate instead of silently allowing every call.
 *   • Per-tool weighting: precision tools (scam detection, privacy
 *     auditing) are cheap to serve but abuse-sensitive; creative
 *     long-form tools burn the most OpenRouter/Groq quota. The
 *     weights table below is therefore *not* proportional to token
 *     cost — it is an abuse-budget in the spirit of "how many of each
 *     tool a legitimate user would reasonably use per day".
 *
 * This module is deliberately standalone (no Supabase lookups) so it
 * can run on the hot path before any DB call.
 */

/* ── Public config ───────────────────────────────────────────── */

/** Default per-day quota if env.AI_DAILY_QUOTA is unset. */
export const DEFAULT_DAILY_QUOTA = 100;

/**
 * Per-tool quota weight. Missing entries default to 1. Keep this
 * small and obvious — bumping a weight is a deliberate policy change.
 */
export const TOOL_WEIGHTS = {
    // Cheap chat turns.
    'chat': 1,

    // Creative generators — one call produces a lot of content.
    'name-generator':        2,
    'group-rules-generator': 2,
    'viral-post':            2,
    'bio-generator':         2,
    'cover-designer':        3,

    // Precision / analytical tools — shorter output but expensive to
    // abuse (scam probes, privacy dossiers).
    'scam-detector':         2,
    'privacy-auditor':       2,
    'group-health-analyzer': 2
};

/** Resolve the quota weight for an arbitrary tool id. */
export function weightForTool(toolId) {
    if (!toolId || typeof toolId !== 'string') return 1;
    const w = TOOL_WEIGHTS[toolId];
    return (typeof w === 'number' && w > 0) ? w : 1;
}

/* ── In-memory fallback (per isolate) ────────────────────────── */
const memBuckets = new Map();

function utcDayKey(now) {
    // YYYYMMDD in UTC — keeps keys short and groupable.
    const d = new Date(now);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return '' + y + m + day;
}

function msUntilUtcMidnight(now) {
    const d = new Date(now);
    const next = Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate() + 1,
        0, 0, 0, 0
    );
    return Math.max(1000, next - now);
}

/**
 * Resolve the daily quota for a given environment. Reads
 * env.AI_DAILY_QUOTA if set to a positive integer; otherwise falls
 * back to DEFAULT_DAILY_QUOTA.
 */
export function resolveDailyQuota(env) {
    const raw = env && env.AI_DAILY_QUOTA;
    if (raw === undefined || raw === null || raw === '') return DEFAULT_DAILY_QUOTA;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAILY_QUOTA;
    return n;
}

/* ── KV-backed counter ───────────────────────────────────────── */
async function consumeKV(kv, key, weight, limit, ttlSeconds) {
    let used = 0;
    try {
        const raw = await kv.get(key);
        if (raw) {
            const parsed = parseInt(raw, 10);
            if (Number.isFinite(parsed) && parsed >= 0) used = parsed;
        }
    } catch {
        return null; // signal: fall back to memory
    }

    if (used + weight > limit) {
        return { allowed: false, used, limit, remaining: Math.max(0, limit - used) };
    }

    const next = used + weight;
    try {
        await kv.put(key, String(next), { expirationTtl: ttlSeconds });
    } catch {
        return null; // signal: fall back to memory so the isolate still charges
    }
    return { allowed: true, used: next, limit, remaining: limit - next };
}

/* ── In-memory counter (fallback) ─────────────────────────────── */
function consumeMemory(key, weight, limit, now) {
    let bucket = memBuckets.get(key);
    const midnight = msUntilUtcMidnight(now);
    const expiresAt = now + midnight;

    if (!bucket || bucket.expiresAt <= now) {
        bucket = { used: 0, expiresAt };
    }

    if (bucket.used + weight > limit) {
        memBuckets.set(key, bucket);
        return { allowed: false, used: bucket.used, limit, remaining: Math.max(0, limit - bucket.used) };
    }

    bucket.used += weight;
    memBuckets.set(key, bucket);

    // Opportunistic cleanup so memBuckets doesn't grow unboundedly on
    // long-lived isolates.
    if (memBuckets.size > 5000) {
        for (const [k, v] of memBuckets) {
            if (v.expiresAt <= now) memBuckets.delete(k);
        }
    }

    return { allowed: true, used: bucket.used, limit, remaining: limit - bucket.used };
}

/* ── Public API ──────────────────────────────────────────────── */

/**
 * Atomically charge a user's daily AI budget.
 *
 * @param {object}  params
 * @param {string}  params.userId       Supabase auth.users.id of the caller.
 * @param {string}  [params.toolId]     Tool identifier (e.g. 'name-generator').
 *                                      Used to look up the quota weight.
 * @param {number}  [params.weight]     Explicit weight override. Wins over toolId.
 * @param {number}  params.limit        Max units the user can spend per UTC day.
 * @param {object}  [params.kv]         Cloudflare KV namespace binding.
 * @param {number}  [params.now]        Injected clock for tests.
 * @returns {Promise<{allowed: boolean, used: number, limit: number, remaining: number, weight: number, resetsAt: number}>}
 */
export async function consumeAIQuota({ userId, toolId, weight, limit, kv, now }) {
    const clock = typeof now === 'number' ? now : Date.now();
    const w = (typeof weight === 'number' && weight > 0)
        ? Math.floor(weight)
        : weightForTool(toolId);

    const safeUser = typeof userId === 'string' && userId.length > 0 ? userId : 'anon';
    const dayKey = utcDayKey(clock);
    const key = 'aiq:' + safeUser + ':' + dayKey;

    // TTL ~ remaining seconds until UTC midnight + 24h grace. Cloudflare
    // KV minimum TTL is 60s; add a floor to be safe.
    const ttlSeconds = Math.max(60, Math.ceil(msUntilUtcMidnight(clock) / 1000) + 24 * 3600);
    const resetsAt = clock + msUntilUtcMidnight(clock);

    let result = null;
    if (kv) {
        result = await consumeKV(kv, key, w, limit, ttlSeconds);
    }
    if (!result) {
        result = consumeMemory(key, w, limit, clock);
    }

    return { ...result, weight: w, resetsAt };
}
