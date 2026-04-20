import { describe, it, expect, vi } from 'vitest';
import { verifyTurnstile } from '../functions/api/_shared/turnstile.js';

describe('verifyTurnstile', () => {
    it('rejects missing token', async () => {
        const result = await verifyTurnstile('', 'secret-key');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Missing CAPTCHA token');
    });

    it('rejects null token', async () => {
        const result = await verifyTurnstile(null, 'secret-key');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Missing CAPTCHA token');
    });

    it('rejects non-string token', async () => {
        const result = await verifyTurnstile(123, 'secret-key');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Missing CAPTCHA token');
    });

    it('rejects when secret key is missing', async () => {
        const result = await verifyTurnstile('valid-token', '');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Turnstile not configured');
    });

    it('rejects when secret key is undefined', async () => {
        const result = await verifyTurnstile('valid-token', undefined);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Turnstile not configured');
    });

    it('returns success when Turnstile API confirms token', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true })
        });
        vi.stubGlobal('fetch', mockFetch);

        const result = await verifyTurnstile('valid-token', 'secret-key', '1.2.3.4');
        expect(result.success).toBe(true);

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
        expect(opts.method).toBe('POST');
        expect(opts.body).toContain('secret=secret-key');
        expect(opts.body).toContain('response=valid-token');
        expect(opts.body).toContain('remoteip=1.2.3.4');

        vi.unstubAllGlobals();
    });

    it('rejects when Turnstile API returns success: false', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] })
        }));

        const result = await verifyTurnstile('bad-token', 'secret-key');
        expect(result.success).toBe(false);
        expect(result.error).toBe('CAPTCHA verification failed');

        vi.unstubAllGlobals();
    });

    it('rejects when Turnstile API returns non-OK HTTP status', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 500
        }));

        const result = await verifyTurnstile('token', 'secret-key');
        expect(result.success).toBe(false);
        expect(result.error).toBe('CAPTCHA verification failed');

        vi.unstubAllGlobals();
    });

    it('rejects when fetch throws a network error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));

        const result = await verifyTurnstile('token', 'secret-key');
        expect(result.success).toBe(false);
        expect(result.error).toBe('CAPTCHA verification failed');

        vi.unstubAllGlobals();
    });

    it('omits remoteip when IP is not provided', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true })
        });
        vi.stubGlobal('fetch', mockFetch);

        await verifyTurnstile('token', 'secret-key');
        const body = mockFetch.mock.calls[0][1].body;
        expect(body).not.toContain('remoteip');

        vi.unstubAllGlobals();
    });
});
