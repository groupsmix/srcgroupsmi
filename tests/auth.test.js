import { describe, it, expect } from 'vitest';
import { extractToken } from '../functions/api/_shared/auth.js';

describe('extractToken', () => {
    it('extracts token from Bearer Authorization header', () => {
        const request = new Request('https://example.com', {
            headers: { 'Authorization': 'Bearer my-jwt-token-123' }
        });
        expect(extractToken(request)).toBe('my-jwt-token-123');
    });

    it('trims whitespace from Bearer token', () => {
        const request = new Request('https://example.com', {
            headers: { 'Authorization': 'Bearer   spaced-token  ' }
        });
        expect(extractToken(request)).toBe('spaced-token');
    });

    it('returns null when no Authorization header', () => {
        const request = new Request('https://example.com');
        expect(extractToken(request)).toBeNull();
    });

    it('returns null for non-Bearer auth schemes', () => {
        const request = new Request('https://example.com', {
            headers: { 'Authorization': 'Basic dXNlcjpwYXNz' }
        });
        expect(extractToken(request)).toBeNull();
    });

    it('extracts token from Supabase cookie (JSON array format)', () => {
        const token = 'cookie-jwt-token';
        const cookieValue = encodeURIComponent(JSON.stringify([token]));
        const request = new Request('https://example.com', {
            headers: { 'Cookie': `sb-abc-auth-token=${cookieValue}` }
        });
        expect(extractToken(request)).toBe(token);
    });

    it('extracts token from Supabase cookie (object format)', () => {
        const token = 'cookie-jwt-obj';
        const cookieValue = encodeURIComponent(JSON.stringify({ access_token: token }));
        const request = new Request('https://example.com', {
            headers: { 'Cookie': `sb-xyz-auth-token=${cookieValue}` }
        });
        expect(extractToken(request)).toBe(token);
    });

    it('prefers Authorization header over cookie', () => {
        const cookieValue = encodeURIComponent(JSON.stringify(['cookie-token']));
        const request = new Request('https://example.com', {
            headers: {
                'Authorization': 'Bearer header-token',
                'Cookie': `sb-abc-auth-token=${cookieValue}`
            }
        });
        expect(extractToken(request)).toBe('header-token');
    });
});
