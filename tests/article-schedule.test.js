import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { onRequest } from '../functions/api/article-schedule.js';

const BASE_ENV = {
    SUPABASE_URL: 'https://supa.test',
    SUPABASE_SERVICE_KEY: 'service-key'
};

function makeRequest(method, headers = {}, body = null) {
    return new Request('https://groupsmix.com/api/article-schedule', {
        method,
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

describe('/api/article-schedule GET cron gate', () => {
    it('returns 503 when CRON_SECRET is unset (fail closed)', async () => {
        const res = await onRequest({
            request: makeRequest('GET', { 'X-Cron-Secret': 'whatever' }),
            env: BASE_ENV
        });
        expect(res.status).toBe(503);
    });

    it('returns 401 when X-Cron-Secret does not match', async () => {
        const res = await onRequest({
            request: makeRequest('GET', { 'X-Cron-Secret': 'wrong' }),
            env: { ...BASE_ENV, CRON_SECRET: 'right' }
        });
        expect(res.status).toBe(401);
    });

    it('returns 401 when X-Cron-Secret is missing', async () => {
        const res = await onRequest({
            request: makeRequest('GET', {}),
            env: { ...BASE_ENV, CRON_SECRET: 'right' }
        });
        expect(res.status).toBe(401);
    });

    it('invokes publish_scheduled_articles RPC when the secret matches', async () => {
        fetchMock.mockImplementation(async (url) => {
            if (typeof url === 'string' && url.includes('/rest/v1/rpc/publish_scheduled_articles')) {
                return jsonResponse(7);
            }
            return jsonResponse({}, { status: 500 });
        });

        const res = await onRequest({
            request: makeRequest('GET', { 'X-Cron-Secret': 's3cret' }),
            env: { ...BASE_ENV, CRON_SECRET: 's3cret' }
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.published_count).toBe(7);
    });
});

describe('/api/article-schedule POST (user-initiated, no cron gate)', () => {
    it('does not require CRON_SECRET for user scheduling', async () => {
        fetchMock.mockImplementation(async () => jsonResponse([{ id: 'a1' }]));
        const futureDate = new Date(Date.now() + 3600_000).toISOString();
        const res = await onRequest({
            request: makeRequest('POST', {}, { article_id: 'a1', scheduled_at: futureDate }),
            env: BASE_ENV
        });
        expect(res.status).toBe(200);
    });

    it('rejects POST bodies with a scheduled_at in the past', async () => {
        const pastDate = new Date(Date.now() - 3600_000).toISOString();
        const res = await onRequest({
            request: makeRequest('POST', {}, { article_id: 'a1', scheduled_at: pastDate }),
            env: BASE_ENV
        });
        expect(res.status).toBe(400);
    });
});
