import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { onRequest } from '../functions/api/newsletter-digest.js';

const BASE_ENV = {
    SUPABASE_URL: 'https://supa.test',
    SUPABASE_SERVICE_KEY: 'service-key'
};

function makeRequest(method, headers = {}, body = null) {
    return new Request('https://groupsmix.com/api/newsletter-digest', {
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

describe('/api/newsletter-digest cron gate', () => {
    it('returns 503 when SUPABASE config is missing', async () => {
        const res = await onRequest({
            request: makeRequest('GET', { 'X-Cron-Secret': 'x' }),
            env: {}
        });
        expect(res.status).toBe(503);
    });

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

    it('returns 401 when X-Cron-Secret is missing entirely', async () => {
        const res = await onRequest({
            request: makeRequest('GET', {}),
            env: { ...BASE_ENV, CRON_SECRET: 'right' }
        });
        expect(res.status).toBe(401);
    });

    it('runs the digest job when the secret matches', async () => {
        fetchMock.mockImplementation(async (url) => {
            if (typeof url === 'string' && url.includes('/rest/v1/articles?')) {
                return jsonResponse([
                    { id: 'a1', title: 'Hello', slug: 'hello', excerpt: '...', author_name: 'A', reading_time: 3 }
                ]);
            }
            if (typeof url === 'string' && url.includes('/rest/v1/newsletter_subscribers?')) {
                return jsonResponse([
                    { email: 'u1@example.com', categories: [] },
                    { email: 'u2@example.com', categories: [] }
                ]);
            }
            if (typeof url === 'string' && url.includes('/rest/v1/newsletter_digests')) {
                return jsonResponse({}, { status: 201 });
            }
            return jsonResponse({}, { status: 204 });
        });

        const res = await onRequest({
            request: makeRequest('GET', { 'X-Cron-Secret': 's3cret' }),
            env: { ...BASE_ENV, CRON_SECRET: 's3cret' }
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.subscriber_count).toBe(2);
        expect(body.digests_created).toBe(2);
    });

    it('also gates the POST preview path with CRON_SECRET', async () => {
        const res = await onRequest({
            request: makeRequest('POST', { 'X-Cron-Secret': 'wrong' }, { email: 'preview@example.com' }),
            env: { ...BASE_ENV, CRON_SECRET: 'right' }
        });
        expect(res.status).toBe(401);
    });
});
