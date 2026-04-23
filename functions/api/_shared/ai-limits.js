/**
 * Shared guardrails for upstream AI calls (Groq / OpenRouter).
 *
 * - MAX_OUTPUT_TOKENS: hard ceiling on `max_tokens` requested from any
 *   provider. Prevents a misconfigured caller or a prompt-injection
 *   payload from burning the free-tier quota with a massive completion.
 *
 * - STREAM_IDLE_MS: how long the SSE proxy will wait for a new chunk
 *   from the upstream provider before giving up. Providers occasionally
 *   hang mid-stream; without an idle timeout the worker holds the
 *   connection open until the platform's hard limit and the client
 *   sees an indefinite spinner.
 */

export const MAX_OUTPUT_TOKENS = 2000;
export const STREAM_IDLE_MS = 15_000;

/**
 * Clamp a requested `max_tokens` value to `[1, MAX_OUTPUT_TOKENS]`.
 * Non-numeric / missing inputs fall back to `fallback` (default 300).
 */
export function capMaxTokens(value, fallback = 300) {
    const n = typeof value === 'number' ? value : parseInt(value, 10);
    const base = Number.isFinite(n) && n > 0 ? n : fallback;
    return Math.min(Math.max(1, Math.floor(base)), MAX_OUTPUT_TOKENS);
}

/**
 * Race `reader.read()` against an idle-timeout timer. When the upstream
 * produces no chunk for `idleMs`, the returned promise resolves to
 * `{ done: true, value: undefined, timedOut: true }` so the caller can
 * close its stream cleanly. The reader is cancelled on timeout.
 */
export async function readWithIdleTimeout(reader, idleMs = STREAM_IDLE_MS) {
    let timer;
    const timeoutPromise = new Promise((resolve) => {
        timer = setTimeout(() => {
            try {
                reader.cancel(new Error('stream_idle_timeout'));
            } catch {
                // Reader already closed — nothing to clean up.
            }
            resolve({ done: true, value: undefined, timedOut: true });
        }, idleMs);
    });
    try {
        const result = await Promise.race([reader.read(), timeoutPromise]);
        return result;
    } finally {
        clearTimeout(timer);
    }
}
