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

import { WorkerEnv } from './types';

/* ── In-memory fallback (per isolate, resets on cold start) ── */
const ipBuckets = new Map<string, number[]>();

export interface RateLimitConfig {
    window: number;
    max: number;
}

/**
 * Check and update rate limit for an IP + action pair.
 *
 * @param {string} ip       - Client IP address
 * @param {string} action   - Action identifier (e.g. 'signup', 'health')
 * @param {RateLimitConfig} limit    - { window: ms, max: number }
 * @param {WorkerEnv | KVNamespace} [kvStore] - Cloudflare KV namespace binding or WorkerEnv (optional)
 * @returns {Promise<boolean>} true if allowed, false if rate-limited
 */
export async function checkRateLimit(ip: string, action: string, limit: RateLimitConfig, kvStore?: WorkerEnv | KVNamespace): Promise<boolean> {
    const kv = (kvStore && 'get' in kvStore) ? (kvStore as KVNamespace) : ((kvStore as WorkerEnv)?.RATE_LIMIT_KV);
    if (kv) {
        return checkRateLimitKV(ip, action, limit, kv);
    }
    return checkRateLimitMemory(ip, action, limit);
}

/* ── KV-backed rate limiter (persistent across cold starts) ── */
async function checkRateLimitKV(ip: string, action: string, limit: RateLimitConfig, kv: KVNamespace): Promise<boolean> {
    const key = 'rl:' + ip + ':' + action;
    const now = Date.now();

    // H4: Mitigate KV read-modify-write race condition within the same isolate
    // by eagerly checking and updating the local in-memory bucket first.
    // This prevents Nx parallelism from bypassing the limit entirely when
    // concurrent requests land on the same Worker instance.
    const localKey = ip + ':' + action;
    let localBucket = ipBuckets.get(localKey) || [];
    localBucket = localBucket.filter(t => now - t < limit.window);
    
    if (localBucket.length >= limit.max) {
        ipBuckets.set(localKey, localBucket);
        return false;
    }
    // Eagerly push to local to block subsequent concurrent requests in this isolate
    localBucket.push(now);
    ipBuckets.set(localKey, localBucket);

    // Periodic cleanup to prevent unbounded memory growth
    if (ipBuckets.size > 5000) {
        for (const [k, v] of ipBuckets) {
            const filtered = v.filter(t => now - t < 3600000);
            if (filtered.length === 0) ipBuckets.delete(k);
            else ipBuckets.set(k, filtered);
        }
    }

    let timestamps: number[] = [];
    try {
        const raw = await kv.get(key);
        if (raw) timestamps = JSON.parse(raw);
    } catch {
        // KV read failed — we already updated in-memory, so just return true
        return true;
    }

    // Prune timestamps outside the window
    const recent = timestamps.filter(t => now - t < limit.window);

    // If KV says we are already over limit (e.g. from other isolates), reject
    // Note: We already added 1 to the local bucket, which is fine since the request
    // was actually made, and keeping it throttled locally is correct.
    if (recent.length >= limit.max) {
        return false;
    }

    recent.push(now);

    try {
        // TTL in seconds — set to window duration so entries auto-expire
        const ttlSeconds = Math.ceil(limit.window / 1000);
        await kv.put(key, JSON.stringify(recent), { expirationTtl: ttlSeconds });
        return true;
    } catch {
        // KV write failed — we already updated in-memory, so just return true
        return true;
    }
}

/* ── In-memory rate limiter (fallback, resets on isolate recycle) ── */
function checkRateLimitMemory(ip: string, action: string, limit: RateLimitConfig): boolean {
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
