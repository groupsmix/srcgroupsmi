/**
 * AI invocation logger (Epic E-5 / F-004).
 *
 * Records a privacy-preserving summary of every AI tool call so that
 * abuse investigations can cluster payloads and correlate callers
 * without ever storing the raw prompt or response text.
 *
 * Data contract: see `supabase/migrations/032_ai_invocations_log.sql`.
 *
 * Design:
 *   • Hash, don't store. Prompt and response bodies are reduced to a
 *     SHA-256 hex digest. Identical payloads hash identically, which
 *     is exactly what an abuse investigator wants.
 *   • Non-blocking. The caller should invoke `logAIInvocation` via
 *     `ctx.waitUntil(...)` — a DB failure must never surface to the
 *     end user or hold open the streaming response.
 *   • Fail closed on config, fail quiet on runtime. If service-role
 *     credentials are not set, we swallow the call (logged once as
 *     a warning). If the REST insert fails we log and move on.
 */

/**
 * Compute SHA-256 hex digest of a string using Web Crypto (available
 * in Cloudflare Workers and in Node 20+ via `globalThis.crypto`).
 *
 * @param {string} text
 * @returns {Promise<string>} 64-char hex digest, or '' for empty input.
 */
export async function sha256Hex(text) {
    if (text == null) return '';
    const str = typeof text === 'string' ? text : String(text);
    if (str.length === 0) return '';

    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        // Should never happen in Workers; guard so unit tests don't crash.
        return '';
    }
    const data = new TextEncoder().encode(str);
    const buf = await subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(buf);
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b < 16) out += '0';
        out += b.toString(16);
    }
    return out;
}

/**
 * Insert one row into `ai_invocations`.
 *
 * All failures are caught and logged with `console.warn`; this helper
 * never throws to callers. Intended usage:
 *
 *   ctx.waitUntil(logAIInvocation(env, {
 *       userAuthId: user.id,
 *       tool: 'scam-detector',
 *       lang: 'en',
 *       prompt: rawPrompt,
 *       response: accumulatedText,
 *       status: 'ok',
 *       weight: 2,
 *       ip: request.headers.get('CF-Connecting-IP'),
 *       metadata: { primary: 'groq' }
 *   }));
 *
 * @param {object} env
 * @param {object} fields
 * @returns {Promise<boolean>} true if the row was accepted, false otherwise.
 */
export async function logAIInvocation(env, fields) {
    const url = env?.SUPABASE_URL;
    const serviceKey = env?.SUPABASE_SERVICE_KEY;
    if (!url || !serviceKey) {
        // No service-role key means we can't write past RLS. Stay quiet
        // so local dev environments don't spam the console — a missing
        // service key is already surfaced by every other endpoint.
        return false;
    }

    const tool = typeof fields?.tool === 'string' && fields.tool.length > 0
        ? fields.tool.slice(0, 120)
        : 'unknown';

    const prompt = typeof fields?.prompt === 'string' ? fields.prompt : '';
    const response = typeof fields?.response === 'string' ? fields.response : '';

    let promptHash = '';
    let responseHash = '';
    try {
        [promptHash, responseHash] = await Promise.all([
            sha256Hex(prompt),
            sha256Hex(response)
        ]);
    } catch (err) {
        console.warn('ai-log: hash failed:', err?.message || err);
        return false;
    }

    // Prompt hash is required by the schema. If hashing produced an
    // empty string (empty input or missing SubtleCrypto) we refuse to
    // insert a meaningless row.
    if (!promptHash) return false;

    const row = {
        user_auth_id:    typeof fields?.userAuthId === 'string' ? fields.userAuthId : null,
        tool:            tool,
        lang:            typeof fields?.lang === 'string' ? fields.lang.slice(0, 16) : null,
        prompt_hash:     promptHash,
        response_hash:   responseHash || null,
        prompt_length:   prompt.length,
        response_length: response.length,
        status:          typeof fields?.status === 'string' ? fields.status.slice(0, 40) : 'ok',
        quota_weight:    Number.isFinite(fields?.weight) ? Math.max(0, Math.floor(fields.weight)) : 1,
        ip:              typeof fields?.ip === 'string' ? fields.ip.slice(0, 64) : null,
        metadata:        (fields && typeof fields.metadata === 'object' && fields.metadata !== null)
            ? fields.metadata
            : {}
    };

    try {
        const res = await fetch(url + '/rest/v1/ai_invocations', {
            method: 'POST',
            headers: {
                'apikey':        serviceKey,
                'Authorization': 'Bearer ' + serviceKey,
                'Content-Type':  'application/json',
                // We don't need the inserted row back, and asking for it
                // forces PostgREST to RETURNING * which defeats the point
                // of keeping this endpoint cheap.
                'Prefer':        'return=minimal'
            },
            body: JSON.stringify(row)
        });

        if (!res.ok) {
            // Surface the HTTP status so failures are diagnosable in
            // Cloudflare tail logs without leaking prompts.
            console.warn('ai-log: insert failed:', res.status);
            return false;
        }
        return true;
    } catch (err) {
        console.warn('ai-log: insert error:', err?.message || err);
        return false;
    }
}
