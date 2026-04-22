import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { onRequest } from '../functions/api/purge-deleted.js';

const BASE_ENV = {
    SUPABASE_URL: 'https://supa.test',
    SUPABASE_SERVICE_KEY: 'service-key'
};

function makeRequest(headers = {}, body = null) {
    return new Request('https://groupsmix.com/api/purge-deleted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
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

describe('POST /api/purge-deleted', () => {
    it('fails closed with 503 when CRON_SECRET is unset', async () => {
        const res = await onRequest({
            request: makeRequest({ 'X-Cron-Secret': 'whatever' }),
            env: BASE_ENV
        });
        expect(res.status).toBe(503);
    });

    it('returns 401 when X-Cron-Secret does not match', async () => {
        const res = await onRequest({
            request: makeRequest({ 'X-Cron-Secret': 'wrong' }),
            env: { ...BASE_ENV, CRON_SECRET: 'correct' }
        });
        expect(res.status).toBe(401);
    });

    it('invokes the purge RPC when the cron secret matches', async () => {
        fetchMock.mockImplementation(async (url) => {
            if (url.includes('/rest/v1/rpc/purge_soft_deleted_users')) {
                return jsonResponse([
                    { user_id: 'u1', auth_id: 'a1' },
                    { user_id: 'u2', auth_id: 'a2' }
                ]);
            }
            return jsonResponse({}, { status: 204 });
        });
        const res = await onRequest({
            request: makeRequest({ 'X-Cron-Secret': 's3cret' }, { limit: 10 }),
            env: { ...BASE_ENV, CRON_SECRET: 's3cret' }
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.purged).toBe(2);
        expect(body.limit).toBe(10);
    });
});
