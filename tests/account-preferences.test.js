import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { onRequest } from '../functions/api/account/preferences.js';

const ENV = {
    SUPABASE_URL: 'https://supa.test',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_KEY: 'service-key'
};

function makeRequest(method, body) {
    return new Request('https://groupsmix.com/api/account/preferences', {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer user-jwt',
            Origin: 'https://groupsmix.com',
            'CF-Connecting-IP': '10.0.0.3'
        },
        body: body ? JSON.stringify(body) : null
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

describe('/api/account/preferences', () => {
    it('GET returns current preferences', async () => {
        fetchMock.mockImplementation(async (url) => {
            if (url.includes('/auth/v1/user')) {
                return jsonResponse({ id: 'auth-123', email: 'u@test.com' });
            }
            if (url.includes('/rest/v1/users?auth_id=')) {
                return jsonResponse([{
                    id: 'user-1',
                    marketing_opt_out: true,
                    analytics_opt_out: false,
                    personalization_opt_out: false
                }]);
            }
            return jsonResponse({});
        });

        const res = await onRequest({ request: makeRequest('GET'), env: ENV });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.preferences).toEqual({
            marketing_opt_out: true,
            analytics_opt_out: false,
            personalization_opt_out: false
        });
    });

    it('POST updates and echoes preferences', async () => {
        fetchMock.mockImplementation(async (url, init) => {
            if (url.includes('/auth/v1/user')) {
                return jsonResponse({ id: 'auth-123', email: 'u@test.com' });
            }
            if (url.includes('/rest/v1/users?auth_id=')) {
                return jsonResponse([{
                    id: 'user-1',
                    marketing_opt_out: false,
                    analytics_opt_out: false,
                    personalization_opt_out: false
                }]);
            }
            if (url.includes('/rest/v1/users?id=') && init?.method === 'PATCH') {
                return jsonResponse([{
                    id: 'user-1',
                    marketing_opt_out: true,
                    analytics_opt_out: false,
                    personalization_opt_out: false
                }]);
            }
            return jsonResponse({});
        });

        const res = await onRequest({
            request: makeRequest('POST', { marketing_opt_out: true }),
            env: ENV
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.preferences.marketing_opt_out).toBe(true);
    });

    it('POST rejects when no valid fields are supplied', async () => {
        fetchMock.mockImplementation(async (url) => {
            if (url.includes('/auth/v1/user')) {
                return jsonResponse({ id: 'auth-123', email: 'u@test.com' });
            }
            if (url.includes('/rest/v1/users?auth_id=')) {
                return jsonResponse([{
                    id: 'user-1',
                    marketing_opt_out: false,
                    analytics_opt_out: false,
                    personalization_opt_out: false
                }]);
            }
            return jsonResponse({});
        });

        const res = await onRequest({
            request: makeRequest('POST', { unrelated: 'nope' }),
            env: ENV
        });
        expect(res.status).toBe(400);
    });
});
