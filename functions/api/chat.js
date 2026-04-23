/**
 * /api/chat — AI Chatbot proxy (server-side)
 *
 * Smart load-balanced dual-API strategy:
 *   - Alternates primary provider between Groq and OpenRouter per request
 *   - Uses a time-based rotation to distribute load evenly
 *   - If the primary provider fails, falls back to the other automatically
 *   - OpenRouter uses a fallback chain of free models
 *
 * Includes GroupsMix knowledge base in the system prompt.
 *
 * Request (POST JSON):
 *   { messages: [{role, content}] }
 *
 * Response: Server-Sent Events (SSE) stream of text chunks
 */

import { corsHeaders, handlePreflight } from './_shared/cors.js';
import { requireAuth } from './_shared/auth.js';
import { withUserInputDirective } from './_shared/prompt-safety.js';
import { moderateOutput, moderationBlockedEvent } from './_shared/moderation.js';
import { STREAM_IDLE_TIMEOUT_MS, capMaxTokens } from './_shared/ai-limits.js';
import { shouldAttempt, recordSuccess, recordFailure } from './_shared/circuit-breaker.js';
import { logAiAudit } from './_shared/ai-audit.js';
import { checkAndConsumeQuota, quotaExceededResponse } from './_shared/ai-quota.js';

/* ── OpenRouter free models (fallback chain) ─────────────────── */
const OPENROUTER_MODELS = [
    'google/gemma-3-27b-it:free',
    'google/gemma-3-12b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
    'nousresearch/hermes-3-llama-3.1-405b:free'
];

/* ── GroupsMix Knowledge Base (System Prompt) ────────────────── */
const SYSTEM_PROMPT = `You are GroupsMix Assistant — a concise, smart chatbot on GroupsMix.com.

## CRITICAL RESPONSE RULES (MUST FOLLOW)
1. **BE SHORT**: Maximum 2-3 sentences per response. Never write paragraphs.
2. **ONE link per topic**: Give the most relevant link only, not a list of links.
3. **No filler**: No greetings like "Great question!", no "Here's what I found", no "I'd be happy to help". Just answer directly.
4. **No repeating info**: Never restate what the user said. Just answer.
5. **Language match**: Reply in the SAME language the user writes in (Arabic → Arabic, English → English, etc.)
6. **No lists unless asked**: Don't give bullet-point lists unless the user specifically asks for options.
7. **Max 80 words** per response unless the user asks for a detailed explanation.

## RESPONSE STYLE EXAMPLES
- User: "كيف أضيف قروب؟" → "ارفع قروبك من هنا: https://groupsmix.com/submit"
- User: "I want WhatsApp groups for tech" → "Browse tech WhatsApp groups here: https://groupsmix.com/search?platform=whatsapp — use the category filter for Tech."
- User: "ما هو GroupsMix؟" → "GroupsMix دليل موثوق لاكتشاف والانضمام لمجموعات واتساب وتيليجرام وديسكورد وفيسبوك، مع نظام تقييم وحماية من الاحتيال."
- User: "hi" → "Hey! How can I help? Looking for groups, want to submit one, or need help with something?"

## GroupsMix Knowledge
- **Directory** for WhatsApp, Telegram, Discord, Facebook groups across 50+ countries.
- **Features**: Trust scores, AI-powered review, scam protection, 50+ countries, many categories.
- **AI Tools**: Name Generator, Rules Generator, Viral Post Creator, Scam Detector, Health Analyzer, Privacy Auditor.

## Links (use ONLY when relevant — pick ONE, not all)
- Search: https://groupsmix.com/search
- Submit: https://groupsmix.com/submit
- AI Tools: https://groupsmix.com/pages/tools/
- Store: https://groupsmix.com/store
- Jobs: https://groupsmix.com/jobs
- Marketplace: https://groupsmix.com/marketplace
- About: https://groupsmix.com/about
- Platform filters: add ?platform=whatsapp | telegram | discord | facebook to /search
- Country filters: add ?country=us | gb | in | ng | br | de | fr | sa | eg | global to /search

## What NOT to do
- NEVER write more than 80 words unless explicitly asked for details.
- NEVER list all links at once. Pick the ONE most relevant.
- NEVER repeat the question back.
- NEVER use phrases like "Sure!", "Of course!", "Absolutely!", "Great question!".
- NEVER explain what GroupsMix is unless directly asked.
- If you don't know something, say "I'm not sure about that" — don't make things up.`;

/* ── Input validation ────────────────────────────────────────── */
function sanitizeMessage(msg) {
    if (!msg || typeof msg.role !== 'string' || typeof msg.content !== 'string') return null;
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    return { role: role, content: msg.content.substring(0, 2000).trim() };
}

/* ── Main handler ────────────────────────────────────────────── */
export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
    }

    if (request.method !== 'POST') {
        return new Response(
            JSON.stringify({ ok: false, error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    // Get available API keys
    const groqKey = env?.GROQ_API_KEY;
    const openrouterKey = env?.OPENROUTER_API_KEY;

    // Verify JWT authentication
    const authResult = await requireAuth(request, env, corsHeaders(origin));
    if (authResult instanceof Response) return authResult;

    if (!groqKey && !openrouterKey) {
        return new Response(
            JSON.stringify({ ok: false, error: 'AI service not configured' }),
            { status: 503, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
            { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    // Validate and sanitize messages
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const userMessages = rawMessages.map(sanitizeMessage).filter(Boolean);

    // Keep only last 10 messages to control context size
    const trimmedMessages = userMessages.slice(-10);

    if (!trimmedMessages.length) {
        return new Response(
            JSON.stringify({ ok: false, error: 'At least one message is required' }),
            { status: 422, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    // Build full messages array with system prompt.
    // Append the prompt-injection directive so the model treats user turns
    // as data, not instructions, even though multi-turn chat messages cannot
    // be individually delimited without breaking conversation flow.
    const messages = [
        { role: 'system', content: withUserInputDirective(SYSTEM_PROMPT) },
        ...trimmedMessages
    ];

    // E-4 / F-017: Per-user daily AI quota with per-tool weighting.
    // Chatbot turns use the "chat" weight; see ai-quota.js TOOL_WEIGHTS.
    const quotaStatus = await checkAndConsumeQuota(
        authResult.user.id,
        'chat',
        env,
        env?.RATE_LIMIT_KV
    );
    if (!quotaStatus.allowed) {
        return quotaExceededResponse(quotaStatus, corsHeaders(origin));
    }

    // ── Smart Load Balancing ───────────────────────────────────
    // Alternate primary provider using time-based rotation (seconds).
    // Even seconds → Groq first; Odd seconds → OpenRouter first.
    // This distributes load ~50/50 across providers over time,
    // maximizing free tier usage on both APIs.
    const useGroqFirst = (Math.floor(Date.now() / 1000) % 2 === 0);
    const hasBothKeys = groqKey && openrouterKey;

    let aiRes = null;
    let providerUsed = '';
    let modelUsed = '';

    // E-7: chat completions are capped at 300 tokens historically; route
    // them through capMaxTokens as a belt-and-suspenders guard.
    const CHAT_MAX_TOKENS = capMaxTokens(300, 300);

    // Helper: try Groq
    async function tryGroq() {
        const allowed = await shouldAttempt(env, 'groq');
        if (!allowed) {
            console.warn('Groq breaker open for chat, skipping');
            return null;
        }
        try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + groqKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: messages,
                    max_tokens: CHAT_MAX_TOKENS,
                    temperature: 0.6,
                    stream: true
                })
            });
            if (!res.ok) {
                console.error('Groq error:', res.status);
                await recordFailure(env, 'groq');
                return null;
            }
            await recordSuccess(env, 'groq');
            modelUsed = 'llama-3.3-70b-versatile';
            return res;
        } catch (err) {
            console.error('Groq fetch error:', err);
            await recordFailure(env, 'groq');
            return null;
        }
    }

    // Helper: try OpenRouter (model fallback chain)
    async function tryOpenRouter() {
        const allowed = await shouldAttempt(env, 'openrouter');
        if (!allowed) {
            console.warn('OpenRouter breaker open for chat, skipping');
            return null;
        }
        let anyFailure = false;
        for (const model of OPENROUTER_MODELS) {
            try {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + openrouterKey,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://groupsmix.com',
                        'X-Title': 'GroupsMix AI Assistant'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: messages,
                        max_tokens: CHAT_MAX_TOKENS,
                        temperature: 0.6,
                        stream: true
                    })
                });
                if (res.ok) {
                    console.info('OpenRouter success with model:', model);
                    await recordSuccess(env, 'openrouter');
                    modelUsed = model;
                    return res;
                }
                anyFailure = true;
                console.error('OpenRouter error (' + model + '):', res.status);
            } catch (err) {
                anyFailure = true;
                console.error('OpenRouter fetch error (' + model + '):', err);
            }
        }
        if (anyFailure) await recordFailure(env, 'openrouter');
        return null;
    }

    // ── Execute load-balanced routing with fallback ─────────────
    if (hasBothKeys) {
        if (useGroqFirst) {
            aiRes = await tryGroq();
            if (aiRes) providerUsed = 'groq';
            if (!aiRes) {
                console.warn('Groq unavailable for chat, falling back to OpenRouter');
                aiRes = await tryOpenRouter();
                if (aiRes) providerUsed = 'openrouter';
            }
        } else {
            aiRes = await tryOpenRouter();
            if (aiRes) providerUsed = 'openrouter';
            if (!aiRes) {
                console.warn('OpenRouter unavailable for chat, falling back to Groq');
                aiRes = await tryGroq();
                if (aiRes) providerUsed = 'groq';
            }
        }
    } else if (groqKey) {
        aiRes = await tryGroq();
        if (aiRes) providerUsed = 'groq';
    } else {
        aiRes = await tryOpenRouter();
        if (aiRes) providerUsed = 'openrouter';
    }

    // ── All APIs failed ────────────────────────────────────────
    if (!aiRes) {
        return new Response(
            JSON.stringify({ ok: false, error: 'AI service temporarily unavailable. Please try again.' }),
            { status: 503, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    // ── Stream the SSE response back to the client ──────────────
    const lastUserText = trimmedMessages.length
        ? (trimmedMessages[trimmedMessages.length - 1].content || '')
        : '';

    try {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();

        (async () => {
            const reader = aiRes.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulated = '';
            let idleTimedOut = false;
            let blocked = false;
            let blockedCategory = '';

            try {
                while (true) {
                    // E-7: stream-idle timeout — abort the upstream when
                    // no bytes have arrived for STREAM_IDLE_TIMEOUT_MS.
                    const idleTimer = new Promise((resolve) => {
                        setTimeout(() => resolve({ idle: true }), STREAM_IDLE_TIMEOUT_MS);
                    });
                    const chunk = await Promise.race([reader.read(), idleTimer]);
                    if (chunk && chunk.idle) {
                        idleTimedOut = true;
                        try { await reader.cancel('idle-timeout'); } catch (_e) { /* noop */ }
                        await writer.write(encoder.encode('data: ' + JSON.stringify({ error: 'stream_idle_timeout' }) + '\n\n'));
                        break;
                    }
                    const { done, value } = chunk;
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || !trimmed.startsWith('data: ')) continue;
                        const data = trimmed.slice(6);
                        if (data === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) {
                                accumulated += content;
                                await writer.write(encoder.encode('data: ' + JSON.stringify({ text: content }) + '\n\n'));
                            }
                        } catch (_e) {
                            // Skip malformed SSE lines
                        }
                    }
                }

                // ── Output moderation pass ─────────────────────
                // Run after the stream completes so good responses still
                // stream in real time. If the final text is flagged, emit
                // a trailing SSE event so clients can surface a warning /
                // scrub the rendered output.
                if (!idleTimedOut) {
                    const verdict = await moderateOutput(env, accumulated, { userText: lastUserText });
                    if (verdict.flagged) {
                        console.warn('chat.js: response blocked by moderation', verdict.category);
                        blocked = true;
                        blockedCategory = verdict.category || 'unsafe';
                        await writer.write(encoder.encode('data: ' + moderationBlockedEvent(verdict) + '\n\n'));
                    }
                }
                await writer.write(encoder.encode('data: [DONE]\n\n'));

                // E-5: best-effort hashed audit log of prompt + response.
                try {
                    const auditPromise = logAiAudit(env, {
                        authId: authResult && authResult.user ? authResult.user.id : '',
                        userId: '',
                        endpoint: 'api/chat',
                        provider: providerUsed,
                        model: modelUsed,
                        prompt: lastUserText,
                        response: accumulated,
                        ip: request.headers.get('CF-Connecting-IP')
                            || request.headers.get('X-Forwarded-For') || '',
                        status: idleTimedOut ? 0 : 200,
                        blocked,
                        blockedCategory
                    });
                    if (context.waitUntil) {
                        context.waitUntil(auditPromise);
                    } else {
                        await auditPromise;
                    }
                } catch (_e) { /* best-effort */ }
            } catch (e) {
                console.error('Stream processing error:', e);
            } finally {
                await writer.close();
            }
        })();

        return new Response(readable, {
            status: 200,
            headers: {
                ...corsHeaders(origin),
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });
    } catch (err) {
        console.error('Chat proxy error:', err);
        return new Response(
            JSON.stringify({ ok: false, error: 'Internal error' }),
            { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }
}
