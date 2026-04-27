/**
 * /api/groq — AI Tools proxy (server-side)
 *
 * Smart dual-API strategy with task-aware routing:
 *   - Precision tools (scam-detector, privacy-auditor) → Groq primary
 *   - Creative tools (name-generator, viral-post, rules) → OpenRouter primary
 *   - Analytical tools (health-analyzer) → Groq primary
 *   - Each route falls back to the other provider if primary fails
 *
 * Request (POST JSON):
 *   { prompt, tool?, lang?, max_tokens? }
 *
 * Response: Server-Sent Events (SSE) stream of text chunks
 */

import { corsHeaders, handlePreflight } from './_shared/cors';
import { requireAuth } from './_shared/auth';
import { z } from 'zod';
import { wrapUserInput, withUserInputDirective } from './_shared/prompt-safety';
import { moderateOutput, moderationBlockedEvent } from './_shared/moderation';
import { STREAM_IDLE_TIMEOUT_MS, capMaxTokens } from './_shared/ai-limits';
import { shouldAttempt, recordSuccess, recordFailure } from './_shared/circuit-breaker';
import { logAiAudit } from './_shared/ai-audit';
import { checkAndConsumeQuota, quotaExceededResponse } from './_shared/ai-quota';

import type { WorkerEnv, PagesContext } from './_shared/types';

import { getToolPrompt } from './_shared/ai-prompts';

/* ── Supported languages ─────────────────────────────────────── */
const SUPPORTED_LANGUAGES = {
    'en': 'English',
    'ar': 'Arabic',
    'fr': 'French',
    'es': 'Spanish',
    'tr': 'Turkish',
    'pt': 'Portuguese',
    'de': 'German',
    'id': 'Indonesian',
    'hi': 'Hindi',
    'ur': 'Urdu',
    'zh': 'Chinese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'it': 'Italian',
    'nl': 'Dutch',
    'pl': 'Polish',
    'ms': 'Malay',
    'th': 'Thai',
    'vi': 'Vietnamese',
    'sw': 'Swahili',
    'bn': 'Bengali'
};

/* ── OpenRouter free models ordered by task category ─────────── */
const OPENROUTER_MODELS = {
    creative: [
        'google/gemma-3-27b-it:free',
        'mistralai/mistral-small-3.1-24b-instruct:free',
        'meta-llama/llama-3.3-70b-instruct:free'
    ],
    precision: [
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemma-3-27b-it:free',
        'mistralai/mistral-small-3.1-24b-instruct:free'
    ]
};

/* ── Task routing: which provider handles which tool first ──── */
const TASK_ROUTING = {
    'name-generator':        { primary: 'openrouter', category: 'creative' },
    'group-rules-generator': { primary: 'openrouter', category: 'creative' },
    'viral-post':            { primary: 'openrouter', category: 'creative' },
    'scam-detector':         { primary: 'groq',       category: 'precision' },
    'group-health-analyzer': { primary: 'groq',       category: 'precision' },
    'privacy-auditor':       { primary: 'groq',       category: 'precision' },
    'bio-generator':         { primary: 'openrouter', category: 'creative' },
    'cover-designer':        { primary: 'openrouter', category: 'creative' }
    }
};

/* ── Input validation ────────────────────────────────────────── */
const groqRequestSchema = z.object({
    prompt: z.string().min(1, "Prompt is required").max(8000),
    tool: z.string().optional(),
    lang: z.string().optional(),
    max_tokens: z.number().int().positive().optional(),
}).strict();

function sanitizeInput(str: any): string {
    if (typeof str !== 'string') return '';
    return str.substring(0, 2000).trim();
}

/* ── Call Groq API ───────────────────────────────────────────── */
async function callGroq(env: WorkerEnv, apiKey: string, messages: any[], maxTokens: number, temperature: number): Promise<{ res: Response | null, model: string, skipped: boolean }> {
    const allowed = await shouldAttempt(env, 'groq');
    if (!allowed) {
        console.warn('Groq breaker open, skipping primary call');
        return { res: null, model: 'llama-3.3-70b-versatile', skipped: true };
    }
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
                max_tokens: capMaxTokens(maxTokens),
                temperature: temperature,
                stream: true
            })
        });
        if (!res.ok) {
            console.error('Groq API error:', res.status);
            await recordFailure(env, 'groq');
            return { res: null, model: 'llama-3.3-70b-versatile', skipped: false };
        }
        await recordSuccess(env, 'groq');
        return { res, model: 'llama-3.3-70b-versatile', skipped: false };
    } catch (err) {
        console.error('Groq fetch error:', err);
        await recordFailure(env, 'groq');
        return { res: null, model: 'llama-3.3-70b-versatile', skipped: false };
    }
}

/* ── Call OpenRouter API (tries multiple models in chain) ───── */
async function callOpenRouter(env: WorkerEnv, apiKey: string, messages: any[], maxTokens: number, temperature: number, category: string): Promise<{ res: Response | null, model: string, skipped: boolean }> {
    const allowed = await shouldAttempt(env, 'openrouter');
    if (!allowed) {
        console.warn('OpenRouter breaker open, skipping');
        return { res: null, model: '', skipped: true };
    }
    const models = OPENROUTER_MODELS[category as keyof typeof OPENROUTER_MODELS] || OPENROUTER_MODELS.creative;
    let anyFailure = false;
    for (const model of models) {
        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + apiKey,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://groupsmix.com',
                    'X-Title': 'GroupsMix AI Tools'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    max_tokens: capMaxTokens(maxTokens),
                    temperature: temperature,
                    stream: true
                })
            });
            if (res.ok) {
                console.info('OpenRouter success with model:', model);
                await recordSuccess(env, 'openrouter');
                return { res, model, skipped: false };
            }
            anyFailure = true;
            console.error('OpenRouter error (' + model + '):', res.status);
        } catch (err) {
            anyFailure = true;
            console.error('OpenRouter fetch error (' + model + '):', err);
        }
    }
    if (anyFailure) await recordFailure(env, 'openrouter');
    return { res: null, model: '', skipped: false };
}

/* ── Call Paid AI Fallback (Anthropic / OpenAI) ──────────────── */
async function callPaidFallback(env: WorkerEnv, messages: any[], maxTokens: number, temperature: number): Promise<{ res: Response | null, model: string, skipped: boolean }> {
    const anthropicKey = env?.ANTHROPIC_API_KEY;
    const openaiKey = env?.OPENAI_API_KEY;

    if (anthropicKey) {
        try {
            // Anthropic Claude 3.5 Haiku as a fast/cheap paid fallback
            const systemMsg = messages.find(m => m.role === 'system')?.content || '';
            const userMsgs = messages.filter(m => m.role !== 'system');
            
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'claude-3-5-haiku-latest',
                    max_tokens: capMaxTokens(maxTokens),
                    temperature: temperature,
                    system: systemMsg,
                    messages: userMsgs,
                    stream: false
                })
            });
            if (res.ok) {
                // Anthropic's SSE format is incompatible with streamToClient
                // (which expects OpenAI `choices[0].delta.content`). Do a
                // non-streaming call and synthesize an OpenAI-style SSE stream
                // so the existing client pipeline works unchanged.
                const json: any = await res.json();
                const text = json?.content?.[0]?.text || '';
                const sse =
                    'data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n' +
                    'data: [DONE]\n\n';
                const synthetic = new Response(sse, {
                    status: 200,
                    headers: { 'Content-Type': 'text/event-stream' }
                });
                console.info('Anthropic fallback success');
                return { res: synthetic, model: 'claude-3-5-haiku-latest', skipped: false };
            }
            console.error('Anthropic fallback error:', res.status, await res.text());
        } catch (err) {
            console.error('Anthropic fetch error:', err);
        }
    }
    if (openaiKey) {
        try {
            // OpenAI GPT-4o-mini as a fast/cheap paid fallback
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + openaiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: messages,
                    max_tokens: capMaxTokens(maxTokens),
                    temperature: temperature,
                    stream: true
                })
            });
            if (res.ok) {
                console.info('OpenAI fallback success');
                return { res, model: 'gpt-4o-mini', skipped: false };
            }
            console.error('OpenAI fallback error:', res.status, await res.text());
        } catch (err) {
            console.error('OpenAI fetch error:', err);
        }
    }

    return { res: null, model: '', skipped: true };
}

/* ── Stream SSE response to client ───────────────────────────── */
function streamToClient(aiRes: Response, hdrs: Record<string, string>, moderationCtx: any): Response {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
        if (!aiRes.body) {
            await writer.close();
            return;
        }
        const reader = aiRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';
        let idleTimedOut = false;

        try {
            while (true) {
                // E-7: stream-idle timeout. Abort if the upstream goes
                // quiet for longer than STREAM_IDLE_TIMEOUT_MS so we do
                // not hold a client connection open forever.
                const idleTimer = new Promise((resolve) => {
                    setTimeout(() => resolve({ idle: true }), STREAM_IDLE_TIMEOUT_MS);
                });
                const chunk = await Promise.race([reader.read(), idleTimer]);
                if (chunk && (chunk as any).idle) {
                    idleTimedOut = true;
                    try { await reader.cancel('idle-timeout'); } catch (_e) { /* noop */ }
                    await writer.write(encoder.encode('data: ' + JSON.stringify({ error: 'stream_idle_timeout' }) + '\n\n'));
                    break;
                }
                const { done, value } = chunk as any;
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

            // E-3: Output moderation after full stream is received.
            let blocked = false;
            let blockedCategory = '';
            if (moderationCtx && !idleTimedOut) {
                const verdict = await moderateOutput(
                    moderationCtx.env,
                    accumulated,
                    { userText: moderationCtx.userText }
                );
                if (verdict.flagged) {
                    console.warn('groq.js: response blocked by moderation', verdict.category);
                    blocked = true;
                    blockedCategory = verdict.category || 'unsafe';
                    await writer.write(encoder.encode('data: ' + moderationBlockedEvent(verdict) + '\n\n'));
                }
            }
            await writer.write(encoder.encode('data: [DONE]\n\n'));

            // E-5: append a best-effort hashed-audit row. Runs on the
            // `waitUntil` handle captured from the caller so the audit
            // round-trip does not delay stream teardown.
            if (moderationCtx && moderationCtx.audit) {
                try {
                    const auditPromise = logAiAudit(moderationCtx.env, {
                        userId: moderationCtx.audit.userId,
                        authId: moderationCtx.audit.authId,
                        endpoint: 'api/groq',
                        tool: moderationCtx.audit.tool || '',
                        provider: moderationCtx.audit.provider || '',
                        model: moderationCtx.audit.model || '',
                        prompt: moderationCtx.userText || '',
                        response: accumulated,
                        ip: moderationCtx.audit.ip || '',
                        status: idleTimedOut ? 0 : 200,
                        blocked,
                        blockedCategory
                    });
                    if (moderationCtx.waitUntil) {
                        moderationCtx.waitUntil(auditPromise);
                    } else {
                        await auditPromise;
                    }
                } catch (_e) { /* best-effort */ }
            }
        } catch (e) {
            console.error('Stream processing error:', e);
        } finally {
            await writer.close();
        }
    })();

    return new Response(readable, {
        status: 200,
        headers: {
            ...hdrs,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
}

/* ── Main handler ────────────────────────────────────────────── */
export async function onRequest(context: PagesContext): Promise<Response> {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || null;

    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
    }

    if (request.method !== 'POST') {
        return new Response(
            JSON.stringify({ ok: false, error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    // Verify JWT authentication
    const authResult = await requireAuth(request, env, corsHeaders(origin));
    if (authResult instanceof Response) return authResult;

    // Get available API keys
    const groqKey = env?.GROQ_API_KEY;
    const openrouterKey = env?.OPENROUTER_API_KEY;
    const anthropicKey = env?.ANTHROPIC_API_KEY;
    const openaiKey = env?.OPENAI_API_KEY;

    if (!groqKey && !openrouterKey && !anthropicKey && !openaiKey) {
        return new Response(
            JSON.stringify({ ok: false, error: 'AI service not configured' }),
            { status: 503, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
            { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    const validation = groqRequestSchema.safeParse(body);
    if (!validation.success) {
        const errors = validation.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
        return new Response(
            JSON.stringify({ ok: false, error: 'Validation failed', details: errors }),
            { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }
    
    // E-1 is handled implicitly by zod .strict() which rejects unknown keys like "system"
    body = validation.data;

    const prompt = sanitizeInput(body.prompt);
    const toolId = (typeof body.tool === 'string') ? body.tool.trim() : '';
    const toolConfig = await getToolPrompt(env, toolId);

    // Language support: validate and resolve language
    const langCode = (typeof body.lang === 'string') ? body.lang.trim().toLowerCase() : 'en';
    const langName = (SUPPORTED_LANGUAGES as any)[langCode] || 'English';

    // Build system prompt from the server-owned tool catalog.
    let system: string;
    let maxTokens: number;
    let temperature: number;
    if (toolConfig) {
        system = toolConfig.system;
        // Inject language directive into the system prompt
        if (langCode !== 'en') {
            system += '\n\nCRITICAL LANGUAGE REQUIREMENT: You MUST write ALL text content in your JSON output EXCLUSIVELY in ' + langName + '. Every string value (names, bios, rules, tips, titles, subtitles, descriptions, flags, recommendations, posts — everything) MUST be written ONLY in ' + langName + ' using ONLY the ' + langName + ' script/alphabet. DO NOT mix scripts or alphabets — for example, if writing in Arabic, use ONLY Arabic script. Do NOT insert Russian (Cyrillic), Chinese, Japanese, or any other foreign script characters. The text must be pure ' + langName + ' with no characters from other writing systems mixed in. The JSON keys themselves stay in English, but all values must be purely and exclusively in ' + langName + '. This is non-negotiable.';
        }
        maxTokens = toolConfig.maxTokens;
        temperature = toolConfig.temperature;
    } else {
        system = 'You are a helpful assistant for GroupsMix, a social media group directory. Be concise and professional.';
        // E-7: honour the requested max_tokens but hard-cap at MAX_TOKENS_CAP.
        maxTokens = Math.max(capMaxTokens(body.max_tokens, 500), 50);
        temperature = 0.7;
    }

    // E-7: defensive cap — also clamp tool-config values so any future
    // TOOL_PROMPTS entry that slips past MAX_TOKENS_CAP is lowered here.
    maxTokens = capMaxTokens(maxTokens);

    // E-2: Append user-input directive to every system prompt so the model
    // knows anything inside <user_input>...</user_input> is data, not instructions.
    system = withUserInputDirective(system);

    if (!prompt) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Prompt is required' }),
            { status: 422, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    // E-2: Wrap user prompt in explicit delimiters.
    const messages = [
        { role: 'system', content: system },
        { role: 'user', content: wrapUserInput(prompt) }
    ];

    // E-4 / F-017: Per-user daily AI quota with per-tool weighting.
    // Enforced after input validation so malformed requests don't
    // burn quota, and before the upstream AI call so denied users
    // never cost Groq/OpenRouter tokens.
    const quotaToolId = toolId || 'chat';
    const quotaStatus = await checkAndConsumeQuota(
        authResult.user.id,
        quotaToolId,
        env,
        env?.RATE_LIMIT_KV
    );
    if (!quotaStatus.allowed) {
        return quotaExceededResponse(quotaStatus, corsHeaders(origin));
    }

    // ── Smart Task Routing ──────────────────────────────────────
    // Route based on tool type: creative tools → OpenRouter first,
    // precision/analytical tools → Groq first.
    // Each route falls back to the other provider if primary fails.
    const routing: any = toolId
        ? ((TASK_ROUTING as any)[toolId] || { primary: 'groq', category: 'precision' })
        : { primary: 'groq', category: 'precision' };

    let aiRes: Response | null = null;
    let providerUsed = '';
    let modelUsed = '';

    try {
        if (routing.primary === 'openrouter') {
            // ── Creative tools: OpenRouter first, Groq fallback ──
            if (openrouterKey) {
                const r = await callOpenRouter(env, openrouterKey, messages, maxTokens, temperature, routing.category);
                if (r.res) { aiRes = r.res; providerUsed = 'openrouter'; modelUsed = r.model; }
            }
            if (!aiRes && groqKey) {
                console.warn('OpenRouter unavailable for ' + (toolId || 'request') + ', falling back to Groq');
                const r = await callGroq(env, groqKey, messages, maxTokens, temperature);
                if (r.res) { aiRes = r.res; providerUsed = 'groq'; modelUsed = r.model; }
            }
        } else {
            // ── Precision/analytical tools: Groq first, OpenRouter fallback ──
            if (groqKey) {
                const r = await callGroq(env, groqKey, messages, maxTokens, temperature);
                if (r.res) { aiRes = r.res; providerUsed = 'groq'; modelUsed = r.model; }
            }
            if (!aiRes && openrouterKey) {
                console.warn('Groq unavailable for ' + (toolId || 'request') + ', falling back to OpenRouter');
                const r = await callOpenRouter(env, openrouterKey, messages, maxTokens, temperature, routing.category);
                if (r.res) { aiRes = r.res; providerUsed = 'openrouter'; modelUsed = r.model; }
            }
        }
    } catch (err) {
        console.error('AI routing error:', err);
    }

    // ── Paid Fallback ───────────────────────────────────────────
    // If both free tier primary providers failed (or breakers open),
    // and a paid key is configured, use the paid fallback.
    if (!aiRes && (env?.ANTHROPIC_API_KEY || env?.OPENAI_API_KEY)) {
        console.warn('Free tier AI providers failed, attempting paid fallback...');
        const r = await callPaidFallback(env, messages, maxTokens, temperature);
        if (r.res) { aiRes = r.res; providerUsed = 'paid-fallback'; modelUsed = r.model; }
    }

    // ── All APIs failed ────────────────────────────────────────
    if (!aiRes) {
        return new Response(
            JSON.stringify({ ok: false, error: 'AI service temporarily unavailable. Please try again.' }),
            { status: 503, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

        // ── Stream the SSE response back to the client ──────────────
    try {
        const authUser: any = (authResult && (authResult as any).user) ? (authResult as any).user : null;
        const clientIp = request.headers.get('CF-Connecting-IP')
            || request.headers.get('X-Forwarded-For') || '';
        return streamToClient(aiRes, corsHeaders(origin), {
            env: env,
            userText: prompt,
            waitUntil: context.waitUntil ? context.waitUntil.bind(context) : null,
            audit: {
                authId: authUser ? authUser.id : '',
                userId: '',
                tool: toolId,
                provider: providerUsed,
                model: modelUsed,
                ip: clientIp
            }
        });
    } catch (err) {
        console.error('Stream proxy error:', err);
        return new Response(
            JSON.stringify({ ok: false, error: 'Internal error' }),
            { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }
}
