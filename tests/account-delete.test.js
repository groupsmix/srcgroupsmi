import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { onRequest } from '../functions/api/account/delete.js';

const ENV = {
    SUPABASE_URL: 'https://supa.test',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_KEY: 'service-key',
    TURNSTILE_SECRET_KEY: 'turnstile-secret'
};

let ipCounter = 0;
function makeRequest(body, opts = {}) {
    // Use a unique IP per request so the in-memory rate-limit bucket
    // (3/hour per IP) doesn't bleed across test cases.
    ipCounter += 1;
    return new Request('https://groupsmix.com/api/account/delete', {
        method: opts.method || 'POST',
        headers: Object.assign(
            {
                'Content-Type': 'application/json',
                Origin: 'https://groupsmix.com',
                'CF-Connecting-IP': '10.0.0.' + ipCounter,
                ...(opts.authed !== false ? { Authorization: 'Bearer user-jwt' } : {})
            },
            opts.headers || {}
        ),
        body: typeof body === 'string' ? body : JSON.stringify(body || {})
    });
}

function jsonResponse(body, init = {}) {
    return new Response(JSON.stringify(body), {
        status: init.status || 200,
        headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }
    });
}

let fetchMock;
beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('POST /api/account/delete', () => {
    it('returns 401 when no token is provided', async () => {
        fetchMock.mockResolvedValue(jsonResponse({}, { status: 401 }));
        const res = await onRequest({
            request: makeRequest({ password: 'x', confirm: 'DELETE' }, { authed: false }),
            env: ENV
        });
        expect(res.status).toBe(401);
    });

    it('rejects when confirm phrase is missing', async () => {
        fetchMock.mockImplementation(async (url) => {
            if (url.includes('/auth/v1/user')) {
                return jsonResponse({ id: 'auth-123', email: 'u@test.com' });
            }
            return jsonResponse({});
        });
        const res = await onRequest({
            request: makeRequest({ password: 'hunter2' }),
            env: ENV
        });
        expect(res.status).toBe(400);
    });

    it('rejects when password is missing', async () => {
        fetchMock.mockImplementation(async (url) => {
            if (url.includes('/auth/v1/user')) {
                return jsonResponse({ id: 'auth-123', email: 'u@test.com' });
            }
            return jsonResponse({});
        });
        const res = await onRequest({
            request: makeRequest({ confirm: 'DELETE' }),
            env: ENV
        });
        expect(res.status).toBe(400);
    });

    it('returns 401 when password re-auth fails', async () => {
        fetchMock.mockImplementation(async (url) => {
            if (url.includes('challenges.cloudflare.com/turnstile')) {
                return jsonResponse({ success: true });
            }
            if (url.includes('/auth/v1/user')) {
                return jsonResponse({ id: 'auth-123', email: 'u@test.com' });
            }
            if (url.includes('/auth/v1/token?grant_type=password')) {
                return jsonResponse({ error: 'bad creds' }, { status: 400 });
            }
            return jsonResponse({});
        });
        const res = await onRequest({
            request: makeRequest({ password: 'wrong', confirm: 'DELETE', turnstileToken: 'tok' }),
            env: ENV
        });
        expect(res.status).toBe(401);
    });

    it('soft-deletes and returns the grace deadline on success', async () => {
        const scheduled = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
        fetchMock.mockImplementation(async (url) => {
            if (url.includes('challenges.cloudflare.com/turnstile')) {
                return jsonResponse({ success: true });
            }
            if (url.includes('/auth/v1/user')) {
                return jsonResponse({ id: 'auth-123', email: 'u@test.com' });
            }
            if (url.includes('/auth/v1/token?grant_type=password')) {
                return jsonResponse({ access_token: 'fresh', user: { id: 'auth-123' } });
            }
            if (url.includes('/rest/v1/rpc/soft_delete_user')) {
                return jsonResponse([{ user_id: 'user-1', deletion_scheduled_at: scheduled }]);
            }
            // Admin logout + audit inserts
            return jsonResponse({}, { status: 204 });
        });

        const res = await onRequest({
            request: makeRequest({
                password: 'hunter2',
                confirm: 'DELETE',
                turnstileToken: 'tok'
            }),
            env: ENV
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.soft_deleted).toBe(true);
        expect(body.deletion_scheduled_at).toBe(scheduled);
    });
});
