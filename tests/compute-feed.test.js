import { describe, it, expect } from 'vitest';
import { onRequest } from '../functions/api/compute-feed.js';

function makeRequest(headers = {}, body = '{}') {
    return new Request('https://example.com/api/compute-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body
    });
}

describe('/api/compute-feed auth gate', () => {
    const supabaseEnv = {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_KEY: 'fake'
    };

    it('returns 503 when CRON_SECRET is unset (fail closed)', async () => {
        const res = await onRequest({
            request: makeRequest(),
            env: { ...supabaseEnv }
        });
        expect(res.status).toBe(503);
    });

    it('returns 401 when X-Cron-Secret does not match', async () => {
        const res = await onRequest({
            request: makeRequest({ 'X-Cron-Secret': 'wrong' }),
            env: { ...supabaseEnv, CRON_SECRET: 'right' }
        });
        expect(res.status).toBe(401);
    });

    it('returns 503 when Supabase is not configured, regardless of cron secret', async () => {
        const res = await onRequest({
            request: makeRequest({ 'X-Cron-Secret': 'right' }),
            env: { CRON_SECRET: 'right' }
        });
        expect(res.status).toBe(503);
    });
});
