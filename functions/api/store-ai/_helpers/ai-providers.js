/**
 * Shared AI provider helpers for store-ai modules.
 *
 * Provides callGroq, callOpenRouter, and the unified callAI function
 * that implements round-robin failover between Groq and OpenRouter.
 *
 * F-049: honors the KV-backed circuit breaker in `_shared/circuit-breaker.js`
 *        so a degraded primary is short-circuited to the fallback.
 * F-040: applies the shared `capMaxTokens` ceiling to every upstream call.
 */

import { capMaxTokens } from '../../_shared/ai-limits.js';
import { shouldSkipProvider, recordSuccess, recordFailure } from '../../_shared/circuit-breaker.js';

const OPENROUTER_MODELS = [
    'google/gemma-3-27b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'mistralai/mistral-small-3.1-24b-instruct:free'
];

async function callGroq(apiKey, messages, maxTokens, temperature, kv) {
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: messages,
                max_tokens: capMaxTokens(maxTokens, 500),
                temperature: temperature || 0.4,
                stream: false
            })
        });
        if (!res.ok) {
            await recordFailure(kv, 'groq');
            return null;
        }
        const json = await res.json();
        await recordSuccess(kv, 'groq');
        return json.choices?.[0]?.message?.content || null;
    } catch (err) {
        console.error('Groq error:', err);
        await recordFailure(kv, 'groq');
        return null;
    }
}

async function callOpenRouter(apiKey, messages, maxTokens, temperature, kv) {
    let anyAttemptFailed = false;
    for (const model of OPENROUTER_MODELS) {
        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + apiKey,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://groupsmix.com',
                    'X-Title': 'GroupsMix Store AI'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    max_tokens: capMaxTokens(maxTokens, 500),
                    temperature: temperature || 0.4,
                    stream: false
                })
            });
            if (!res.ok) {
                anyAttemptFailed = true;
                continue;
            }
            const json = await res.json();
            const content = json.choices?.[0]?.message?.content;
            if (content) {
                await recordSuccess(kv, 'openrouter');
                return content;
            }
            anyAttemptFailed = true;
        } catch (err) {
            anyAttemptFailed = true;
            console.error('OpenRouter error (' + model + '):', err);
        }
    }
    if (anyAttemptFailed) {
        await recordFailure(kv, 'openrouter');
    }
    return null;
}

async function callAI(env, messages, maxTokens, temperature) {
    const groqKey = env?.GROQ_API_KEY;
    const orKey = env?.OPENROUTER_API_KEY;
    const kv = env?.RATE_LIMIT_KV || null;
    // Use a simple counter for deterministic round-robin instead of
    // even/odd seconds which creates non-deterministic behavior (MISC-4).
    if (typeof callAI._counter !== 'number') callAI._counter = 0;
    const useGroqFirst = (callAI._counter++ % 2 === 0);

    const groqOpen = await shouldSkipProvider(kv, 'groq');
    const orOpen = await shouldSkipProvider(kv, 'openrouter');

    if (groqKey && orKey) {
        if (useGroqFirst) {
            if (!groqOpen) {
                const out = await callGroq(groqKey, messages, maxTokens, temperature, kv);
                if (out) return out;
            }
            if (!orOpen) return await callOpenRouter(orKey, messages, maxTokens, temperature, kv);
            return null;
        }
        if (!orOpen) {
            const out = await callOpenRouter(orKey, messages, maxTokens, temperature, kv);
            if (out) return out;
        }
        if (!groqOpen) return await callGroq(groqKey, messages, maxTokens, temperature, kv);
        return null;
    } else if (groqKey) {
        if (groqOpen) return null;
        return await callGroq(groqKey, messages, maxTokens, temperature, kv);
    } else if (orKey) {
        if (orOpen) return null;
        return await callOpenRouter(orKey, messages, maxTokens, temperature, kv);
    }
    return null;
}

export { callGroq, callOpenRouter, callAI, OPENROUTER_MODELS };
