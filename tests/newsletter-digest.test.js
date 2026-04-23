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

let fetchMock;
beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('/api/newsletter-digest cron gate (H-7)', () => {
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

    it('GET: proceeds past the cron gate when the secret matches', async () => {
        // Return zero articles so the handler short-circuits cleanly
        // without the test caring about downstream Supabase shape.
        fetchMock.mockImplementation(async () => {
            return new Response('[]', {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        });
        const res = await onRequest({
            request: makeRequest('GET', { 'X-Cron-Secret': 's3cret' }),
            env: { ...BASE_ENV, CRON_SECRET: 's3cret' }
        });
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalled();
    });

    it('POST preview mode is NOT gated by CRON_SECRET', async () => {
        // The preview path is a non-cron surface, so an unset
        // CRON_SECRET must not affect it. Upstream Supabase is mocked
        // to return one article so preview HTML renders.
        fetchMock.mockImplementation(async () => {
            return new Response(
                JSON.stringify([{ id: '1', title: 'T', slug: 't', excerpt: 'e' }]),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        });
        const res = await onRequest({
            request: makeRequest('POST', {}, { email: 'user@example.com' }),
            env: BASE_ENV
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(typeof body.html).toBe('string');
    });
});
