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

let fetchMock;
beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('/api/article-schedule cron gate (H-7)', () => {
    it('GET: fails closed with 503 when CRON_SECRET is unset', async () => {
        const res = await onRequest({
            request: makeRequest('GET', { 'X-Cron-Secret': 'whatever' }),
            env: BASE_ENV
        });
        expect(res.status).toBe(503);
    });

    it('GET: returns 401 when X-Cron-Secret does not match', async () => {
        const res = await onRequest({
            request: makeRequest('GET', { 'X-Cron-Secret': 'wrong' }),
            env: { ...BASE_ENV, CRON_SECRET: 'correct' }
        });
        expect(res.status).toBe(401);
    });

    it('GET: returns 401 when X-Cron-Secret header is missing', async () => {
        const res = await onRequest({
            request: makeRequest('GET'),
            env: { ...BASE_ENV, CRON_SECRET: 'correct' }
        });
        expect(res.status).toBe(401);
    });

    it('GET: invokes publish_scheduled_articles when the secret matches', async () => {
        fetchMock.mockImplementation(async (url) => {
            if (String(url).includes('/rest/v1/rpc/publish_scheduled_articles')) {
                return new Response('3', {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return new Response('{}', { status: 204 });
        });
        const res = await onRequest({
            request: makeRequest('GET', { 'X-Cron-Secret': 's3cret' }),
            env: { ...BASE_ENV, CRON_SECRET: 's3cret' }
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.published_count).toBe(3);
    });

    it('POST scheduling mode is NOT gated by CRON_SECRET', async () => {
        // Schedule-an-article is a non-cron surface and must still work
        // without a CRON_SECRET configured. It is gated by the caller's
        // Supabase JWT and an ownership check against the article.
        fetchMock.mockImplementation(async (url, init) => {
            const u = String(url);
            if (u.endsWith('/auth/v1/user')) {
                return new Response(JSON.stringify({ id: 'auth-user-1' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            if (u.includes('/rest/v1/users?auth_id=')) {
                return new Response(JSON.stringify([{ id: 'internal-1' }]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            if (u.includes('/rest/v1/articles?id=') && (!init || init.method !== 'PATCH')) {
                return new Response(JSON.stringify([{ user_id: 'internal-1' }]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return new Response(JSON.stringify([{ id: 'a1', scheduled_at: 'x' }]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        });
        const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const res = await onRequest({
            request: makeRequest(
                'POST',
                { 'Authorization': 'Bearer test-jwt' },
                { article_id: 'a1', scheduled_at: future }
            ),
            env: { ...BASE_ENV, SUPABASE_ANON_KEY: 'anon-key' }
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
    });
});
