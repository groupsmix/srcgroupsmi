import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { onRequest } from '../functions/api/account/export.js';

const ENV = {
    SUPABASE_URL: 'https://supa.test',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_KEY: 'service-key'
};

function makeRequest(opts = {}) {
    const headers = Object.assign(
        {
            'Content-Type': 'application/json',
            Origin: 'https://groupsmix.com',
            'CF-Connecting-IP': '10.0.0.1'
        },
        opts.authed !== false ? { Authorization: 'Bearer user-jwt' } : {},
        opts.headers || {}
    );
    return new Request('https://groupsmix.com/api/account/export', {
        method: opts.method || 'POST',
        headers,
        body: opts.body || null
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

describe('POST /api/account/export', () => {
    it('rejects non-POST methods', async () => {
        const res = await onRequest({
            request: makeRequest({ method: 'GET' }),
            env: ENV
        });
        expect(res.status).toBe(405);
    });

    it('returns 401 when no token is provided', async () => {
        const res = await onRequest({
            request: makeRequest({ authed: false }),
            env: ENV
        });
        expect(res.status).toBe(401);
    });

    it('returns a JSON attachment for the authenticated user', async () => {
        fetchMock.mockImplementation(async (url) => {
            if (url.includes('/auth/v1/user')) {
                return jsonResponse({ id: 'auth-123', email: 'u@test.com' });
            }
            if (url.includes('/rest/v1/users?auth_id=')) {
                return jsonResponse([{ id: 'user-1', email: 'u@test.com' }]);
            }
            if (url.includes('/rest/v1/users?id=')) {
                return jsonResponse([{ id: 'user-1', email: 'u@test.com', bio: 'hi' }]);
            }
            if (url.includes('/rest/v1/dsar_audit')) {
                if (url.endsWith('dsar_audit') || url.includes('rest/v1/dsar_audit?')) {
                    return jsonResponse([]);
                }
            }
            // Everything else: empty rows
            return jsonResponse([]);
        });

        const res = await onRequest({
            request: makeRequest(),
            env: ENV
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="groupsmix-export-user-1-/);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.profile.id).toBe('user-1');
        expect(body.data.user_id).toBe('user-1');
    });

    it('returns 404 when the profile is missing', async () => {
        fetchMock.mockImplementation(async (url) => {
            if (url.includes('/auth/v1/user')) {
                return jsonResponse({ id: 'auth-123', email: 'u@test.com' });
            }
            if (url.includes('/rest/v1/users?auth_id=')) {
                return jsonResponse([]);
            }
            return jsonResponse([]);
        });

        const res = await onRequest({
            request: makeRequest(),
            env: ENV
        });
        expect(res.status).toBe(404);
    });
});
