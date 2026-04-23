import { describe, it, expect } from 'vitest';
import {
    secureRandomString,
    secureRandomUpperAlnum,
    secureRandomHex
} from '../functions/api/_shared/secure-random.js';

describe('secureRandomString', () => {
    it('returns a string of the requested length', () => {
        for (const n of [1, 6, 12, 32, 128]) {
            expect(secureRandomString(n)).toHaveLength(n);
        }
    });

    it('only emits characters from the default alphabet [a-z0-9]', () => {
        const s = secureRandomString(256);
        expect(s).toMatch(/^[a-z0-9]+$/);
    });

    it('only emits characters from a custom alphabet', () => {
        const s = secureRandomString(200, 'ABC');
        expect(s).toMatch(/^[ABC]+$/);
    });

    it('generates different strings on successive calls (collision sanity)', () => {
        const set = new Set();
        for (let i = 0; i < 200; i++) set.add(secureRandomString(16));
        // With 16 chars over 36-symbol alphabet, 200 samples should never collide.
        expect(set.size).toBe(200);
    });

    it('approximates a uniform distribution over the alphabet', () => {
        // Chi-squared-ish sanity check: after 36_000 samples over 36 symbols,
        // each symbol should appear roughly 1000 times. We allow a generous
        // tolerance to keep the test non-flaky.
        const counts = new Map();
        const s = secureRandomString(36_000);
        for (const c of s) counts.set(c, (counts.get(c) || 0) + 1);
        expect(counts.size).toBe(36);
        for (const v of counts.values()) {
            expect(v).toBeGreaterThan(700);
            expect(v).toBeLessThan(1300);
        }
    });

    it('throws for non-positive / non-integer lengths', () => {
        expect(() => secureRandomString(0)).toThrow(TypeError);
        expect(() => secureRandomString(-1)).toThrow(TypeError);
        expect(() => secureRandomString(1.5)).toThrow(TypeError);
        // @ts-expect-error — deliberately wrong
        expect(() => secureRandomString('abc')).toThrow(TypeError);
    });

    it('rejects alphabets longer than 256', () => {
        const big = 'x'.repeat(257);
        expect(() => secureRandomString(8, big)).toThrow(RangeError);
    });
});

describe('secureRandomUpperAlnum', () => {
    it('returns only uppercase letters and digits', () => {
        const s = secureRandomUpperAlnum(500);
        expect(s).toMatch(/^[A-Z0-9]+$/);
        expect(s).toHaveLength(500);
    });
});

describe('secureRandomHex', () => {
    it('returns only lowercase hex of the requested length', () => {
        for (const n of [1, 2, 7, 16, 64]) {
            const s = secureRandomHex(n);
            expect(s).toHaveLength(n);
            expect(s).toMatch(/^[0-9a-f]+$/);
        }
    });

    it('throws for non-positive lengths', () => {
        expect(() => secureRandomHex(0)).toThrow(TypeError);
        expect(() => secureRandomHex(-5)).toThrow(TypeError);
    });
});
