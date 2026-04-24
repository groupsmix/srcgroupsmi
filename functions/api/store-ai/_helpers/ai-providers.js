/**
 * Shared AI provider helpers for store-ai modules.
 *
 * Provides callGroq, callOpenRouter, and the unified callAI function
 * that implements round-robin failover between Groq and OpenRouter.
 */

import { capMaxTokens } from '../../_shared/ai-limits.js';
import { shouldAttempt, recordSuccess, recordFailure } from '../../_shared/circuit-breaker.js';

const OPENROUTER_MODELS = [
    'google/gemma-3-27b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'mistralai/mistral-small-3.1-24b-instruct:free'
];

async function callGroq(apiKey, messages, maxTokens, temperature, env) {
    const providerName = 'groq';
    if (env && !await shouldAttempt(env, providerName)) return null;

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
                max_tokens: capMaxTokens(maxTokens || 500),
                temperature: temperature || 0.4,
                stream: false
            })
        });
        if (!res.ok) {
            if (env) await recordFailure(env, providerName);
            return null;
        }
        if (env) await recordSuccess(env, providerName);
        const json = await res.json();
        return json.choices?.[0]?.message?.content || null;
    } catch (err) {
        if (env) await recordFailure(env, providerName);
        console.error('Groq error:', err);
        return null;
    }
}

async function callOpenRouter(apiKey, messages, maxTokens, temperature, env) {
    const providerName = 'openrouter';
    if (env && !await shouldAttempt(env, providerName)) return null;

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
                    max_tokens: capMaxTokens(maxTokens || 500),
                    temperature: temperature || 0.4,
                    stream: false
                })
            });
            if (!res.ok) {
                if (env) await recordFailure(env, providerName);
                continue;
            }
            if (env) await recordSuccess(env, providerName);
            const json = await res.json();
            const content = json.choices?.[0]?.message?.content;
            if (content) return content;
        } catch (err) {
            if (env) await recordFailure(env, providerName);
            console.error('OpenRouter error (' + model + '):', err);
        }
    }
    return null;
}

async function callAI(env, messages, maxTokens, temperature) {
    const groqKey = env?.GROQ_API_KEY;
    const orKey = env?.OPENROUTER_API_KEY;
    // Use a simple counter for deterministic round-robin instead of
    // even/odd seconds which creates non-deterministic behavior (MISC-4).
    if (typeof callAI._counter !== 'number') callAI._counter = 0;
    const useGroqFirst = (callAI._counter++ % 2 === 0);

    if (groqKey && orKey) {
        if (useGroqFirst) {
            return await callGroq(groqKey, messages, maxTokens, temperature, env)
                || await callOpenRouter(orKey, messages, maxTokens, temperature, env);
        } else {
            return await callOpenRouter(orKey, messages, maxTokens, temperature, env)
                || await callGroq(groqKey, messages, maxTokens, temperature, env);
        }
    } else if (groqKey) {
        return await callGroq(groqKey, messages, maxTokens, temperature, env);
    } else if (orKey) {
        return await callOpenRouter(orKey, messages, maxTokens, temperature, env);
    }
    return null;
}

export { callGroq, callOpenRouter, callAI, OPENROUTER_MODELS };
