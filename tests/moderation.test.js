import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { moderateOutput, moderationBlockedEvent } from '../functions/api/_shared/moderation.js';

describe('moderateOutput', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        global.fetch = vi.fn();
    });

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('returns safe + checked=true when Llama Guard says "safe"', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'safe' } }]
            })
        });
        const res = await moderateOutput(
            { GROQ_API_KEY: 'test-key' },
            'hello there'
        );
        expect(res.flagged).toBe(false);
        expect(res.checked).toBe(true);
        expect(global.fetch).toHaveBeenCalledOnce();
    });

    it('returns flagged + category when Llama Guard says "unsafe"', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'unsafe\nS5' } }]
            })
        });
        const res = await moderateOutput(
            { GROQ_API_KEY: 'test-key' },
            'dangerous content'
        );
        expect(res.flagged).toBe(true);
        expect(res.category).toBe('S5');
        expect(res.checked).toBe(true);
    });

    it('fails open (checked=false) when no GROQ_API_KEY is set', async () => {
        const res = await moderateOutput({}, 'anything');
        expect(res.flagged).toBe(false);
        expect(res.checked).toBe(false);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('fails open when AI_MODERATION_ENABLED is "false"', async () => {
        const res = await moderateOutput(
            { GROQ_API_KEY: 'test-key', AI_MODERATION_ENABLED: 'false' },
            'anything'
        );
        expect(res.flagged).toBe(false);
        expect(res.checked).toBe(false);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('fails open when the Llama Guard call returns a non-OK status', async () => {
        global.fetch.mockResolvedValue({ ok: false, status: 500 });
        const res = await moderateOutput(
            { GROQ_API_KEY: 'test-key' },
            'anything'
        );
        expect(res.flagged).toBe(false);
        expect(res.checked).toBe(false);
    });

    it('fails open when fetch throws', async () => {
        global.fetch.mockRejectedValue(new Error('network down'));
        const res = await moderateOutput(
            { GROQ_API_KEY: 'test-key' },
            'anything'
        );
        expect(res.flagged).toBe(false);
        expect(res.checked).toBe(false);
    });

    it('skips the network call for empty text', async () => {
        const res = await moderateOutput({ GROQ_API_KEY: 'test-key' }, '');
        expect(res.flagged).toBe(false);
        expect(res.checked).toBe(true);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('forwards the user context when provided', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'safe' } }] })
        });
        await moderateOutput(
            { GROQ_API_KEY: 'test-key' },
            'assistant reply',
            { userText: 'what is the weather?' }
        );
        const call = global.fetch.mock.calls[0];
        const body = JSON.parse(call[1].body);
        expect(body.messages[0]).toEqual({ role: 'user', content: 'what is the weather?' });
        expect(body.messages[1]).toEqual({ role: 'assistant', content: 'assistant reply' });
    });
});

describe('moderationBlockedEvent', () => {
    it('encodes a blocked SSE payload with category and reason', () => {
        const payload = JSON.parse(
            moderationBlockedEvent({ flagged: true, category: 'S5', reason: 'nope' })
        );
        expect(payload.blocked).toBe(true);
        expect(payload.category).toBe('S5');
        expect(payload.reason).toBe('nope');
    });

    it('falls back to defaults when fields are missing', () => {
        const payload = JSON.parse(moderationBlockedEvent({}));
        expect(payload.blocked).toBe(true);
        expect(payload.category).toBe('unsafe');
        expect(payload.reason).toMatch(/moderation/i);
    });
});
