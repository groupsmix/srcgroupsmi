/**
 * AI audit logging — prompt + response hashes keyed by user_id.
 *
 * Covers requirement E-5: emit a tamper-evident breadcrumb for every AI
 * completion so abuse investigations can correlate a user to a specific
 * prompt/response without storing the raw text. Only SHA-256 hashes are
 * written to `audit_events`; the original strings never leave the
 * request context.
 *
 * Storage: existing `audit_events` table (migration 030). No new
 * migration is required — this only adds a new `event_type` value
 * (`ai.prompt`) populated via the Supabase REST API with the
 * service-role key.
 *
 * Best-effort: the logger never throws. Call sites should invoke it via
 * `ctx.waitUntil(...)` so the audit round-trip does not block the user
 * response.
 */

const TEXT_ENCODER = new TextEncoder();

/**
 * SHA-256 hex digest of a UTF-8 string.
 * Returns '' for empty / non-string input.
 *
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function sha256Hex(text) {
    if (typeof text !== 'string' || text.length === 0) return '';
    try {
        const buf = await crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(text));
        const bytes = new Uint8Array(buf);
        let out = '';
        for (let i = 0; i < bytes.length; i++) {
            out += bytes[i].toString(16).padStart(2, '0');
        }
        return out;
    } catch {
        return '';
    }
}

/**
 * @typedef {object} AiAuditEntry
 * @property {string}  [userId]        - Internal users.id (UUID) when known.
 * @property {string}  [authId]        - auth.users id (UUID) when known.
 * @property {string}  endpoint        - e.g. 'api/groq', 'api/chat'.
 * @property {string}  [tool]          - Tool id for /api/groq, else ''.
 * @property {string}  [provider]      - 'groq' | 'openrouter' | ''.
 * @property {string}  [model]         - Upstream model id when known.
 * @property {string}  prompt          - Raw user prompt (never stored).
 * @property {string}  response        - Raw assistant response (never stored).
 * @property {string}  [ip]            - Client IP (hashed before storage).
 * @property {number}  [status]        - HTTP status of the AI call, if any.
 * @property {boolean} [blocked]       - True when blocked by moderation.
 * @property {string}  [blockedCategory] - Llama Guard category, if blocked.
 */

/**
 * Write one AI audit row. Never throws; returns `true` on a likely
 * successful write, `false` otherwise (including missing env).
 *
 * @param {object} env
 * @param {AiAuditEntry} entry
 * @returns {Promise<boolean>}
 */
export async function logAiAudit(env, entry) {
    if (!env || !entry || typeof entry !== 'object') return false;

    const supabaseUrl = env.SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !serviceKey) return false;

    const [promptHash, responseHash, ipHash] = await Promise.all([
        sha256Hex(entry.prompt || ''),
        sha256Hex(entry.response || ''),
        sha256Hex(entry.ip || '')
    ]);

    const row = {
        event_type: 'ai.prompt',
        table_name: 'ai_calls',
        record_id: null,
        actor_auth_id: entry.authId || null,
        actor_user_id: entry.userId || null,
        source: entry.endpoint || 'api/ai',
        old_values: null,
        new_values: null,
        metadata: {
            endpoint: entry.endpoint || '',
            tool: entry.tool || '',
            provider: entry.provider || '',
            model: entry.model || '',
            prompt_hash: promptHash,
            response_hash: responseHash,
            prompt_length: (entry.prompt || '').length,
            response_length: (entry.response || '').length,
            ip_hash: ipHash,
            status: typeof entry.status === 'number' ? entry.status : null,
            blocked: entry.blocked === true,
            blocked_category: entry.blockedCategory || ''
        }
    };

    try {
        const res = await fetch(supabaseUrl + '/rest/v1/audit_events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
                'Authorization': 'Bearer ' + serviceKey,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(row)
        });
        if (!res.ok) {
            console.warn('ai-audit: insert failed', res.status);
            return false;
        }
        return true;
    } catch (err) {
        console.warn('ai-audit: insert error', err && err.message ? err.message : err);
        return false;
    }
}
