/**
 * Shared AI request limits.
 *
 * Centralises the caps that every AI endpoint (Groq, OpenRouter, chat,
 * article-ai, store-ai, etc.) must respect so that a malicious or
 * misconfigured caller cannot ask upstream providers for arbitrarily
 * long completions or keep a stream open indefinitely.
 *
 * Consumers:
 *   - functions/api/groq.js       — user-facing AI tools proxy
 *   - functions/api/chat.js       — chatbot proxy
 *
 * Covers requirements E-7:
 *   - max_tokens is hard-capped at 2000 on every upstream call.
 *   - SSE streams time out when the upstream goes idle for ~15s.
 */

/** Absolute upper bound on `max_tokens` sent to any AI provider. */
export const MAX_TOKENS_CAP = 2000;

/** How long a stream can be idle (no bytes received) before we abort. */
export const STREAM_IDLE_TIMEOUT_MS = 15000;

/**
 * Clamp a requested `max_tokens` value into `[1, MAX_TOKENS_CAP]`.
 *
 * Accepts numbers or numeric strings; falls back to `fallback` when the
 * value is missing or not parseable. Values over the cap are silently
 * lowered — callers should not rely on a reject-on-overflow behaviour.
 *
 * @param {unknown} requested
 * @param {number} [fallback=500]
 * @returns {number}
 */
export function capMaxTokens(requested, fallback) {
    const fb = typeof fallback === 'number' && fallback > 0 ? fallback : 500;
    let n;
    if (typeof requested === 'number') {
        n = requested;
    } else if (typeof requested === 'string') {
        n = parseInt(requested, 10);
    } else {
        n = Number.NaN;
    }
    if (!Number.isFinite(n) || n <= 0) n = fb;
    if (n > MAX_TOKENS_CAP) n = MAX_TOKENS_CAP;
    if (n < 1) n = 1;
    return Math.floor(n);
}
