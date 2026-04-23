/**
 * KV-backed circuit breaker for upstream AI providers (Groq / OpenRouter).
 *
 * Goal: when a primary provider is failing, stop paying the round-trip
 * and fall through to the secondary immediately. Consumers call
 * `shouldSkipProvider(kv, name)` before the upstream fetch, then
 * `recordSuccess` / `recordFailure` based on the result.
 *
 * State machine:
 *   closed   — normal; every call hits the provider.
 *   open     — consecutive failures crossed the threshold; skip the
 *              provider until the cooldown TTL expires.
 *   half-open (implicit) — cooldown expired; the next call is allowed
 *              through. A success resets the breaker; a failure
 *              re-opens it for another cooldown.
 *
 * Persistence: uses the RATE_LIMIT_KV binding (same namespace as
 * `rate-limit.js`) under a `cb:<provider>` key prefix. Falls back to
 * an in-memory Map when KV is unavailable — matches `rate-limit.js`
 * behavior so local dev and KV-less environments still function.
 */

const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 60_000;
const COOLDOWN_MS = 60_000;

const memoryState = new Map();

function keyFor(provider) {
    return 'cb:' + provider;
}

function parseState(raw) {
    if (!raw) return null;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed || typeof parsed !== 'object') return null;
        return {
            failures: Array.isArray(parsed.failures) ? parsed.failures : [],
            openUntil: typeof parsed.openUntil === 'number' ? parsed.openUntil : 0
        };
    } catch {
        return null;
    }
}

async function readState(kv, provider) {
    const key = keyFor(provider);
    if (kv) {
        try {
            const raw = await kv.get(key);
            const parsed = parseState(raw);
            if (parsed) return parsed;
        } catch {
            // Fall through to memory below.
        }
    }
    const mem = memoryState.get(key);
    if (mem) return mem;
    return { failures: [], openUntil: 0 };
}

async function writeState(kv, provider, state) {
    const key = keyFor(provider);
    memoryState.set(key, state);
    if (!kv) return;
    try {
        // TTL covers the longest interval we still care about so stale
        // entries auto-evict. Add a small buffer over COOLDOWN_MS.
        const ttlSeconds = Math.ceil((Math.max(FAILURE_WINDOW_MS, COOLDOWN_MS) + 30_000) / 1000);
        await kv.put(key, JSON.stringify(state), { expirationTtl: ttlSeconds });
    } catch {
        // KV write failed — in-memory copy above still applies per isolate.
    }
}

/**
 * Returns true when the breaker is currently open and the provider
 * should be skipped. Safe to call on every request.
 */
export async function shouldSkipProvider(kv, provider) {
    const state = await readState(kv, provider);
    if (!state.openUntil) return false;
    if (Date.now() < state.openUntil) return true;
    // Cooldown expired — transition to half-open by clearing openUntil.
    // We intentionally keep the failure list so a single half-open
    // failure re-opens the breaker.
    state.openUntil = 0;
    await writeState(kv, provider, state);
    return false;
}

/**
 * Record that a call to `provider` succeeded. Resets the breaker to a
 * clean closed state so the next transient failure does not immediately
 * re-open it.
 */
export async function recordSuccess(kv, provider) {
    await writeState(kv, provider, { failures: [], openUntil: 0 });
}

/**
 * Record that a call to `provider` failed. If consecutive failures
 * within `FAILURE_WINDOW_MS` reach `FAILURE_THRESHOLD`, the breaker
 * opens for `COOLDOWN_MS`.
 */
export async function recordFailure(kv, provider) {
    const now = Date.now();
    const state = await readState(kv, provider);
    const recent = state.failures.filter((t) => now - t < FAILURE_WINDOW_MS);
    recent.push(now);

    const next = { failures: recent, openUntil: state.openUntil };
    if (recent.length >= FAILURE_THRESHOLD) {
        next.openUntil = now + COOLDOWN_MS;
        // Reset the failure list once we've opened so the next window
        // starts fresh after cooldown.
        next.failures = [];
    }
    await writeState(kv, provider, next);
}

// Exported for tests to reset in-memory state deterministically.
export function __resetCircuitBreakerForTests() {
    memoryState.clear();
}

export const CIRCUIT_BREAKER_CONFIG = Object.freeze({
    FAILURE_THRESHOLD,
    FAILURE_WINDOW_MS,
    COOLDOWN_MS
});
