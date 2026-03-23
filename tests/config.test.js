import { describe, it, expect } from 'vitest';
import { getSupabaseConfig } from '../functions/api/_shared/config.js';

describe('getSupabaseConfig', () => {
    it('returns url and serviceKey when both env vars are set', () => {
        const env = { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_KEY: 'sk-123' };
        const config = getSupabaseConfig(env);
        expect(config.url).toBe('https://abc.supabase.co');
        expect(config.serviceKey).toBe('sk-123');
    });

    it('throws when SUPABASE_URL is missing', () => {
        const env = { SUPABASE_SERVICE_KEY: 'sk-123' };
        expect(() => getSupabaseConfig(env)).toThrow('Missing required environment variables');
    });

    it('throws when SUPABASE_SERVICE_KEY is missing', () => {
        const env = { SUPABASE_URL: 'https://abc.supabase.co' };
        expect(() => getSupabaseConfig(env)).toThrow('Missing required environment variables');
    });

    it('throws when env is undefined', () => {
        expect(() => getSupabaseConfig(undefined)).toThrow();
    });

    it('throws when env is null', () => {
        expect(() => getSupabaseConfig(null)).toThrow();
    });

    it('throws when both vars are empty strings', () => {
        const env = { SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '' };
        expect(() => getSupabaseConfig(env)).toThrow('Missing required environment variables');
    });
});
