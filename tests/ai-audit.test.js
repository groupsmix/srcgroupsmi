import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sha256Hex, logAiAudit } from '../functions/api/_shared/ai-audit.js';

describe('sha256Hex', () => {
    it('produces the canonical SHA-256 of "hello"', async () => {
        const hex = await sha256Hex('hello');
        expect(hex).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('returns an empty string for empty input', async () => {
        expect(await sha256Hex('')).toBe('');
    });

    it('returns an empty string for non-string input', async () => {
        expect(await sha256Hex(null)).toBe('');
        expect(await sha256Hex(undefined)).toBe('');
        expect(await sha256Hex(123)).toBe('');
    });
});

describe('logAiAudit', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        global.fetch = vi.fn();
    });

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('no-ops (returns false) when SUPABASE env is missing', async () => {
        const ok = await logAiAudit({}, {
            endpoint: 'api/groq',
            prompt: 'p',
            response: 'r'
        });
        expect(ok).toBe(false);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('inserts into /rest/v1/audit_events with hashed payload', async () => {
        global.fetch.mockResolvedValue({ ok: true, status: 201 });
        const env = {
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_SERVICE_KEY: 'srv'
        };
        const ok = await logAiAudit(env, {
            authId: 'auth-1',
            endpoint: 'api/groq',
            tool: 'scam-detector',
            provider: 'groq',
            model: 'llama-3.3-70b-versatile',
            prompt: 'hello',
            response: 'world',
            ip: '1.2.3.4',
            status: 200,
            blocked: false
        });
        expect(ok).toBe(true);
        expect(global.fetch).toHaveBeenCalledOnce();

        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe('https://example.supabase.co/rest/v1/audit_events');
        expect(init.method).toBe('POST');
        expect(init.headers.apikey).toBe('srv');
        expect(init.headers.Authorization).toBe('Bearer srv');

        const body = JSON.parse(init.body);
        expect(body.event_type).toBe('ai.prompt');
        expect(body.actor_auth_id).toBe('auth-1');
        expect(body.source).toBe('api/groq');
        expect(body.metadata.provider).toBe('groq');
        expect(body.metadata.tool).toBe('scam-detector');
        expect(body.metadata.prompt_hash).toBe(
            '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
        );
        expect(body.metadata.prompt_length).toBe(5);
        expect(body.metadata.response_length).toBe(5);
        // Raw prompt / response must never be in the row.
        expect(JSON.stringify(body)).not.toContain('hello');
        expect(JSON.stringify(body)).not.toContain('world');
        expect(JSON.stringify(body)).not.toContain('1.2.3.4');
    });

    it('returns false when Supabase responds non-OK', async () => {
        global.fetch.mockResolvedValue({ ok: false, status: 500 });
        const env = {
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_SERVICE_KEY: 'srv'
        };
        const ok = await logAiAudit(env, {
            endpoint: 'api/chat',
            prompt: 'p',
            response: 'r'
        });
        expect(ok).toBe(false);
    });

    it('never throws when fetch itself rejects', async () => {
        global.fetch.mockRejectedValue(new Error('network down'));
        const env = {
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_SERVICE_KEY: 'srv'
        };
        const ok = await logAiAudit(env, {
            endpoint: 'api/chat',
            prompt: 'p',
            response: 'r'
        });
        expect(ok).toBe(false);
    });
});
