import { describe, it, expect } from 'vitest';
import { corsHeaders, handlePreflight } from '../functions/api/_shared/cors.js';

describe('corsHeaders', () => {
    it('reflects allowed origin https://groupsmix.com', () => {
        const hdrs = corsHeaders('https://groupsmix.com');
        expect(hdrs['Access-Control-Allow-Origin']).toBe('https://groupsmix.com');
    });

    it('reflects allowed origin https://www.groupsmix.com', () => {
        const hdrs = corsHeaders('https://www.groupsmix.com');
        expect(hdrs['Access-Control-Allow-Origin']).toBe('https://www.groupsmix.com');
    });

    it('falls back to primary origin for unknown origins', () => {
        const hdrs = corsHeaders('https://evil.com');
        expect(hdrs['Access-Control-Allow-Origin']).toBe('https://groupsmix.com');
    });

    it('falls back to primary origin for empty string', () => {
        const hdrs = corsHeaders('');
        expect(hdrs['Access-Control-Allow-Origin']).toBe('https://groupsmix.com');
    });

    it('includes standard CORS methods and headers', () => {
        const hdrs = corsHeaders('https://groupsmix.com');
        expect(hdrs['Access-Control-Allow-Methods']).toContain('GET');
        expect(hdrs['Access-Control-Allow-Methods']).toContain('POST');
        expect(hdrs['Access-Control-Allow-Methods']).toContain('OPTIONS');
        expect(hdrs['Access-Control-Allow-Headers']).toContain('Content-Type');
        expect(hdrs['Access-Control-Allow-Headers']).toContain('Authorization');
    });

    it('merges extra headers', () => {
        const hdrs = corsHeaders('https://groupsmix.com', { 'Content-Type': 'application/json' });
        expect(hdrs['Content-Type']).toBe('application/json');
        expect(hdrs['Access-Control-Allow-Origin']).toBe('https://groupsmix.com');
    });
});

describe('handlePreflight', () => {
    it('returns a 204 Response with CORS headers', () => {
        const res = handlePreflight('https://groupsmix.com');
        expect(res).toBeInstanceOf(Response);
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://groupsmix.com');
    });
});
