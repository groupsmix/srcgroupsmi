import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sha256Hex, logAIInvocation } from '../functions/api/_shared/ai-log.js';

describe('sha256Hex', () => {
    it('returns an empty string for empty input', async () => {
        expect(await sha256Hex('')).toBe('');
        expect(await sha256Hex(null)).toBe('');
        expect(await sha256Hex(undefined)).toBe('');
    });

    it('returns a 64-char hex digest for non-empty input', async () => {
        const h = await sha256Hex('hello');
        expect(h).toMatch(/^[0-9a-f]{64}$/);
        // Known SHA-256 of 'hello'.
        expect(h).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('is deterministic — identical input produces identical digest', async () => {
        const a = await sha256Hex('the quick brown fox');
        const b = await sha256Hex('the quick brown fox');
        expect(a).toBe(b);
    });
});

describe('logAIInvocation', () => {
    let fetchMock;
    let originalFetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
        globalThis.fetch = fetchMock;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('no-ops when SUPABASE credentials are missing', async () => {
        const ok = await logAIInvocation({}, {
            userAuthId: 'u1',
            tool: 'chat',
            prompt: 'hi',
            response: 'hello'
        });
        expect(ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('posts a hashed row to /rest/v1/ai_invocations', async () => {
        const env = {
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_SERVICE_KEY: 'service-role-key'
        };

        const ok = await logAIInvocation(env, {
            userAuthId: 'user-uuid',
            tool: 'scam-detector',
            lang: 'en',
            prompt: 'analyze this message',
            response: 'looks suspicious',
            status: 'ok',
            weight: 2,
            ip: '203.0.113.7',
            metadata: { provider: 'groq' }
        });

        expect(ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://example.supabase.co/rest/v1/ai_invocations');
        expect(init.method).toBe('POST');
        expect(init.headers.apikey).toBe('service-role-key');
        expect(init.headers.Authorization).toBe('Bearer service-role-key');
        expect(init.headers.Prefer).toMatch(/return=minimal/);

        const body = JSON.parse(init.body);
        expect(body.user_auth_id).toBe('user-uuid');
        expect(body.tool).toBe('scam-detector');
        expect(body.lang).toBe('en');
        expect(body.prompt_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(body.response_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(body.prompt_length).toBe('analyze this message'.length);
        expect(body.response_length).toBe('looks suspicious'.length);
        expect(body.status).toBe('ok');
        expect(body.quota_weight).toBe(2);
        expect(body.ip).toBe('203.0.113.7');
        expect(body.metadata).toEqual({ provider: 'groq' });

        // Crucially, raw prompt / response text must NEVER appear in the body.
        expect(init.body).not.toContain('analyze this message');
        expect(init.body).not.toContain('looks suspicious');
    });

    it('refuses to insert when prompt is empty (no meaningful hash)', async () => {
        const env = {
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_SERVICE_KEY: 'k'
        };
        const ok = await logAIInvocation(env, {
            userAuthId: 'u',
            tool: 'chat',
            prompt: '',
            response: 'anything'
        });
        expect(ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns false and does not throw when REST call fails', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
        const env = {
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_SERVICE_KEY: 'k'
        };
        const ok = await logAIInvocation(env, {
            userAuthId: 'u',
            tool: 'chat',
            prompt: 'hi',
            response: 'hello'
        });
        expect(ok).toBe(false);
    });

    it('swallows network errors', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));
        const env = {
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_SERVICE_KEY: 'k'
        };
        const ok = await logAIInvocation(env, {
            userAuthId: 'u',
            tool: 'chat',
            prompt: 'hi',
            response: 'hello'
        });
        expect(ok).toBe(false);
    });

    it('coerces invalid metadata into an empty object', async () => {
        const env = {
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_SERVICE_KEY: 'k'
        };
        await logAIInvocation(env, {
            userAuthId: 'u',
            tool: 'chat',
            prompt: 'hi',
            response: 'ok',
            metadata: 'not-an-object'
        });
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.metadata).toEqual({});
    });
});
