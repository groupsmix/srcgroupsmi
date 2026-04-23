/**
 * Output moderation helper.
 *
 * Runs a lightweight classifier over AI output before it is returned to the
 * client so that jailbroken or policy-violating completions are caught
 * server-side, independent of the generating model.
 *
 * Primary backend: Groq's Llama Guard (fast, free tier on Groq).
 * Fail-open on transient errors so a moderation outage does not take the
 * whole AI surface down; call sites log when this happens.
 */

import { capMaxTokens } from './ai-limits.js';

const DEFAULT_MODEL = 'meta-llama/llama-guard-4-12b';
const MODERATION_TIMEOUT_MS = 4000;

/**
 * @typedef {object} ModerationResult
 * @property {boolean} flagged    - True if content should be blocked.
 * @property {string}  category   - Short category code if flagged, else ''.
 * @property {string}  [reason]   - Optional human-readable note.
 * @property {boolean} [checked]  - False when moderation could not run.
 */

/**
 * Call Groq's Llama Guard model and parse its safe/unsafe verdict.
 *
 * Llama Guard returns either:
 *   "safe"
 *   or
 *   "unsafe\nS1" (or similar category codes S1-S14).
 *
 * @param {string} apiKey
 * @param {string} model
 * @param {Array<{role:string,content:string}>} messages
 * @returns {Promise<ModerationResult|null>}
 */
async function callGroqGuard(apiKey, model, messages) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS);
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                max_tokens: capMaxTokens(50),
                temperature: 0,
                stream: false
            }),
            signal: controller.signal
        });
        if (!res.ok) {
            console.warn('Llama Guard returned', res.status);
            return null;
        }
        const json = await res.json();
        const raw = (json.choices?.[0]?.message?.content || '').trim().toLowerCase();
        if (!raw) return null;
        if (raw.startsWith('safe')) {
            return { flagged: false, category: '', checked: true };
        }
        if (raw.startsWith('unsafe')) {
            const match = raw.match(/s\d+/);
            return {
                flagged: true,
                category: match ? match[0].toUpperCase() : 'unsafe',
                reason: 'Content flagged by output moderation.',
                checked: true
            };
        }
        return null;
    } catch (err) {
        console.warn('Llama Guard error:', err && err.message ? err.message : err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Moderate AI-generated text (assistant output).
 *
 * Fails open: if no key is configured, moderation is explicitly disabled,
 * or the moderation call errors, we return `{ flagged: false, checked: false }`
 * so upstream code can still serve the response. Call sites should log when
 * `checked` is false if they need to track moderation coverage.
 *
 * @param {object} env                       - Worker env bindings.
 * @param {string} assistantText             - The AI-generated text to check.
 * @param {object} [opts]
 * @param {string} [opts.userText]           - Optional user message for context.
 * @returns {Promise<ModerationResult>}
 */
export async function moderateOutput(env, assistantText, opts) {
    const text = typeof assistantText === 'string' ? assistantText.trim() : '';
    if (!text) return { flagged: false, category: '', checked: true };

    if (env?.AI_MODERATION_ENABLED === 'false' || env?.AI_MODERATION_ENABLED === false) {
        return { flagged: false, category: '', checked: false };
    }

    const apiKey = env?.GROQ_API_KEY;
    if (!apiKey) {
        return { flagged: false, category: '', checked: false };
    }

    const model = env?.AI_MODERATION_MODEL || DEFAULT_MODEL;
    const userText = (opts && typeof opts.userText === 'string') ? opts.userText : '';

    // Llama Guard expects a chat-style conversation so it can classify the
    // *assistant turn* in context. Provide the user turn when available.
    const messages = [];
    if (userText) {
        messages.push({ role: 'user', content: userText.slice(0, 4000) });
    } else {
        messages.push({ role: 'user', content: '(omitted)' });
    }
    messages.push({ role: 'assistant', content: text.slice(0, 8000) });

    const result = await callGroqGuard(apiKey, model, messages);
    if (!result) {
        return { flagged: false, category: '', checked: false };
    }
    return result;
}

/**
 * Convenience: returns the shape of the SSE event used by streaming endpoints
 * to signal that the stream was blocked by the output moderator.
 *
 * @param {ModerationResult} result
 * @returns {string} JSON payload to send after `data: `.
 */
export function moderationBlockedEvent(result) {
    return JSON.stringify({
        blocked: true,
        category: (result && result.category) || 'unsafe',
        reason: (result && result.reason) || 'Response blocked by content moderation.'
    });
}
