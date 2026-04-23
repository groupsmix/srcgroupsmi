import { describe, it, expect } from 'vitest';
import {
    MAX_TOKENS_CAP,
    STREAM_IDLE_TIMEOUT_MS,
    capMaxTokens
} from '../functions/api/_shared/ai-limits.js';

describe('ai-limits', () => {
    it('exposes the documented constants', () => {
        expect(MAX_TOKENS_CAP).toBe(2000);
        expect(STREAM_IDLE_TIMEOUT_MS).toBe(15000);
    });

    it('clamps values above the cap to MAX_TOKENS_CAP', () => {
        expect(capMaxTokens(5000)).toBe(MAX_TOKENS_CAP);
        expect(capMaxTokens(MAX_TOKENS_CAP + 1)).toBe(MAX_TOKENS_CAP);
    });

    it('passes through values within range', () => {
        expect(capMaxTokens(300)).toBe(300);
        expect(capMaxTokens(1)).toBe(1);
        expect(capMaxTokens(MAX_TOKENS_CAP)).toBe(MAX_TOKENS_CAP);
    });

    it('accepts numeric strings', () => {
        expect(capMaxTokens('1500')).toBe(1500);
        expect(capMaxTokens('9999')).toBe(MAX_TOKENS_CAP);
    });

    it('uses fallback when input is missing or invalid', () => {
        expect(capMaxTokens(undefined)).toBe(500);
        expect(capMaxTokens(null)).toBe(500);
        expect(capMaxTokens('')).toBe(500);
        expect(capMaxTokens('abc')).toBe(500);
        expect(capMaxTokens(undefined, 250)).toBe(250);
    });

    it('floors negative and zero values to the fallback', () => {
        expect(capMaxTokens(0)).toBe(500);
        expect(capMaxTokens(-10)).toBe(500);
    });

    it('returns an integer', () => {
        expect(capMaxTokens(123.7)).toBe(123);
    });
});
