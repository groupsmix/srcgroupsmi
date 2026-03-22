/**
 * Shared rate limiter for Cloudflare Pages Functions.
 *
 * Uses Cloudflare KV (RATE_LIMIT_KV binding) for persistent rate limiting
 * that survives worker isolate recycling. Falls back to in-memory Map
 * when KV is not bound (local dev or unconfigured environments).
 *
 * KV key format: "rl:{ip}:{action}"
 * KV value: JSON array of timestamps within the active window
 * KV TTL: matches the rate limit window (auto-expiry)
 */

/* ── In-memory fallback (per isolate, resets on cold start) ── */
const ipBuckets = new Map();

/**
 * Check and update rate limit for an IP + action pair.
 *
 * @param {string} ip       - Client IP address
 * @param {string} action   - Action identifier (e.g. 'signup', 'health')
 * @param {object} limit    - { window: ms, max: number }
 * @param {object} [kvStore] - Cloudflare KV namespace binding (optional)
 * @returns {Promise<boolean>} true if allowed, false if rate-limited
 */
export async function checkRateLimit(ip, action, limit, kvStore) {
    if (kvStore) {
        return checkRateLimitKV(ip, action, limit, kvStore);
    }
    return checkRateLimitMemory(ip, action, limit);
}

/* ── KV-backed rate limiter (persistent across cold starts) ── */
async function checkRateLimitKV(ip, action, limit, kv) {
    const key = 'rl:' + ip + ':' + action;
    const now = Date.now();

    let timestamps = [];
    try {
        const raw = await kv.get(key);
        if (raw) timestamps = JSON.parse(raw);
    } catch {
        // KV read failed — fall back to in-memory
        return checkRateLimitMemory(ip, action, limit);
    }

    // Prune timestamps outside the window
    const recent = timestamps.filter(t => now - t < limit.window);

    if (recent.length >= limit.max) {
        return false;
    }

    recent.push(now);

    try {
        // TTL in seconds — set to window duration so entries auto-expire
        const ttlSeconds = Math.ceil(limit.window / 1000);
        await kv.put(key, JSON.stringify(recent), { expirationTtl: ttlSeconds });
    } catch {
        // KV write failed — still allow (don't block users due to KV issues)
    }

    return true;
}

/* ── In-memory rate limiter (fallback, resets on isolate recycle) ── */
function checkRateLimitMemory(ip, action, limit) {
    const key = ip + ':' + action;
    const now = Date.now();

    let bucket = ipBuckets.get(key);
    if (!bucket) {
        bucket = [];
        ipBuckets.set(key, bucket);
    }

    const recent = bucket.filter(t => now - t < limit.window);
    if (recent.length >= limit.max) {
        ipBuckets.set(key, recent);
        return false;
    }

    recent.push(now);
    ipBuckets.set(key, recent);

    // Periodic cleanup to prevent unbounded memory growth
    if (ipBuckets.size > 5000) {
        for (const [k, v] of ipBuckets) {
            const filtered = v.filter(t => now - t < 3600000);
            if (filtered.length === 0) ipBuckets.delete(k);
            else ipBuckets.set(k, filtered);
        }
    }

    return true;
}
