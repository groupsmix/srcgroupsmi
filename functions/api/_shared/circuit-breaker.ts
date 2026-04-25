/**
 * KV-backed circuit breaker for upstream AI providers (Groq, OpenRouter).
 *
 * Wraps the existing `RATE_LIMIT_KV` namespace — no new Cloudflare
 * binding is required. Persists breaker state across isolate recycles
 * and across colos (as far as KV consistency allows) so that a
 * provider-wide outage trips the breaker globally, not per-isolate.
 *
 * Covers requirement E-6.
 *
 * States:
 *   closed    — requests are allowed; failures accumulate.
 *   open      — requests are short-circuited until `nextTry`.
 *   half-open — one probe is allowed; success closes, failure re-opens.
 *
 * Fail-safe: if KV is unbound or throws, we allow the request and fall
 * back to an isolate-local state so a KV outage never blocks AI calls.
 */

import type { WorkerEnv } from './types';

/** Consecutive failures (within a rolling window) before the breaker opens. */
const FAILURE_THRESHOLD = 5;

/** How long failures "count" (ms). Older failures are discarded. */
const FAILURE_WINDOW_MS = 60_000;

/** How long the breaker stays open before allowing a probe. */
const OPEN_COOLDOWN_MS = 30_000;

/** KV TTL — longer than cooldown so half-open probes can read state. */
const KV_TTL_SECONDS = 300;

export interface BreakerState {
    state: 'closed' | 'open' | 'half';
    failures: number[];
    openedAt: number;
    nextTry: number;
}

/* ── In-memory fallback (per isolate) ──────────────────────────── */
const memState = new Map<string, BreakerState>();

function emptyState(): BreakerState {
    return { state: 'closed', failures: [], openedAt: 0, nextTry: 0 };
}

function pruneFailures(arr: number[] | undefined, now: number): number[] {
    return (arr || []).filter((t) => now - t < FAILURE_WINDOW_MS);
}

function kvKey(provider: string): string {
    return 'cb:' + provider;
}

async function readState(kv: KVNamespace | null, provider: string): Promise<BreakerState> {
    if (!kv) {
        return memState.get(provider) || emptyState();
    }
    try {
        const raw = await kv.get(kvKey(provider));
        if (!raw) return emptyState();
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return emptyState();
        return {
            state: parsed.state === 'open' || parsed.state === 'half' ? parsed.state : 'closed',
            failures: Array.isArray(parsed.failures) ? parsed.failures : [],
            openedAt: typeof parsed.openedAt === 'number' ? parsed.openedAt : 0,
            nextTry: typeof parsed.nextTry === 'number' ? parsed.nextTry : 0
        };
    } catch {
        return memState.get(provider) || emptyState();
    }
}

async function writeState(kv: KVNamespace | null, provider: string, state: BreakerState): Promise<void> {
    memState.set(provider, state);
    if (!kv) return;
    try {
        await kv.put(kvKey(provider), JSON.stringify(state), { expirationTtl: KV_TTL_SECONDS });
    } catch {
        // KV write failed — memory copy still good for this isolate.
    }
}

function getKv(env: WorkerEnv | null | undefined): KVNamespace | null {
    return env && env.RATE_LIMIT_KV ? env.RATE_LIMIT_KV : null;
}

/**
 * Decide whether a provider should be attempted right now.
 *
 * Returns `true` when the breaker is closed, when it has cooled down
 * enough to allow a half-open probe, or when KV state is unavailable
 * (fail-safe). Returns `false` only when the breaker is open and the
 * cooldown has not elapsed.
 *
 * @param {WorkerEnv} env
 * @param {string} provider  e.g. 'groq', 'openrouter'
 * @returns {Promise<boolean>}
 */
export async function shouldAttempt(env: WorkerEnv, provider: string): Promise<boolean> {
    const kv = getKv(env);
    const state = await readState(kv, provider);
    const now = Date.now();

    if (state.state === 'open') {
        if (now >= state.nextTry) {
            // Transition to half-open: allow exactly one probe.
            const next: BreakerState = { state: 'half', failures: state.failures, openedAt: state.openedAt, nextTry: state.nextTry };
            await writeState(kv, provider, next);
            return true;
        }
        return false;
    }
    return true;
}

/**
 * Record a successful call. Clears the failure history and closes the
 * breaker (half-open → closed).
 *
 * @param {WorkerEnv} env
 * @param {string} provider
 */
export async function recordSuccess(env: WorkerEnv, provider: string): Promise<void> {
    const kv = getKv(env);
    const prev = await readState(kv, provider);
    if (prev.state === 'closed' && (!prev.failures || prev.failures.length === 0)) {
        return;
    }
    await writeState(kv, provider, emptyState());
}

/**
 * Record a failed call. Opens the breaker once `FAILURE_THRESHOLD`
 * failures have occurred within `FAILURE_WINDOW_MS`, or immediately
 * re-opens it from half-open.
 *
 * @param {WorkerEnv} env
 * @param {string} provider
 */
export async function recordFailure(env: WorkerEnv, provider: string): Promise<void> {
    const kv = getKv(env);
    const prev = await readState(kv, provider);
    const now = Date.now();

    if (prev.state === 'half') {
        await writeState(kv, provider, {
            state: 'open',
            failures: pruneFailures(prev.failures, now).concat(now),
            openedAt: now,
            nextTry: now + OPEN_COOLDOWN_MS
        });
        return;
    }

    const failures = pruneFailures(prev.failures, now).concat(now);
    if (failures.length >= FAILURE_THRESHOLD) {
        await writeState(kv, provider, {
            state: 'open',
            failures,
            openedAt: now,
            nextTry: now + OPEN_COOLDOWN_MS
        });
        return;
    }
    await writeState(kv, provider, {
        state: 'closed',
        failures,
        openedAt: 0,
        nextTry: 0
    });
}

/**
 * Expose current state (for observability / tests). Never throws.
 * @param {WorkerEnv} env
 * @param {string} provider
 * @returns {Promise<BreakerState>}
 */
export async function inspectBreaker(env: WorkerEnv, provider: string): Promise<BreakerState> {
    return await readState(getKv(env), provider);
}

/** Test-only: reset the in-memory fallback state. */
export function __resetForTests(): void {
    memState.clear();
}

/* Constants are exported for tests / telemetry. */
export const BREAKER_CONSTANTS = Object.freeze({
    FAILURE_THRESHOLD,
    FAILURE_WINDOW_MS,
    OPEN_COOLDOWN_MS,
    KV_TTL_SECONDS
});
