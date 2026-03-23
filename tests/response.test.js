import { describe, it, expect } from 'vitest';
import { errorResponse, successResponse } from '../functions/api/_shared/response.js';

describe('errorResponse', () => {
    it('returns a 400 JSON response with ok:false by default', async () => {
        const res = errorResponse('Something went wrong', undefined, 'https://groupsmix.com');
        expect(res).toBeInstanceOf(Response);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error).toBe('Something went wrong');
    });

    it('respects custom status codes', async () => {
        const res = errorResponse('Not found', 404, 'https://groupsmix.com');
        expect(res.status).toBe(404);

        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error).toBe('Not found');
    });

    it('includes CORS headers', () => {
        const res = errorResponse('fail', 400, 'https://groupsmix.com');
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://groupsmix.com');
    });

    it('includes Content-Type application/json', () => {
        const res = errorResponse('fail', 400, 'https://groupsmix.com');
        expect(res.headers.get('Content-Type')).toBe('application/json');
    });
});

describe('successResponse', () => {
    it('returns a 200 JSON response with ok:true', async () => {
        const res = successResponse({ count: 42 }, 'https://groupsmix.com');
        expect(res).toBeInstanceOf(Response);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.count).toBe(42);
    });

    it('merges multiple data fields', async () => {
        const res = successResponse({ a: 1, b: 'two', c: [3] }, 'https://groupsmix.com');
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.a).toBe(1);
        expect(body.b).toBe('two');
        expect(body.c).toEqual([3]);
    });

    it('includes CORS headers', () => {
        const res = successResponse({}, 'https://groupsmix.com');
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://groupsmix.com');
    });

    it('includes Content-Type application/json', () => {
        const res = successResponse({}, 'https://groupsmix.com');
        expect(res.headers.get('Content-Type')).toBe('application/json');
    });
});
