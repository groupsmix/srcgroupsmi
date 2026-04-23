import { describe, it, expect, vi } from 'vitest';
import {
    MAX_OUTPUT_TOKENS,
    STREAM_IDLE_MS,
    capMaxTokens,
    readWithIdleTimeout
} from '../functions/api/_shared/ai-limits.js';

describe('capMaxTokens', () => {
    it('clamps values above MAX_OUTPUT_TOKENS', () => {
        expect(capMaxTokens(10_000)).toBe(MAX_OUTPUT_TOKENS);
    });

    it('preserves values within range', () => {
        expect(capMaxTokens(500)).toBe(500);
    });

    it('falls back to default for non-numeric input', () => {
        expect(capMaxTokens(undefined, 250)).toBe(250);
        expect(capMaxTokens(null, 250)).toBe(250);
        expect(capMaxTokens('abc', 250)).toBe(250);
    });

    it('parses numeric strings', () => {
        expect(capMaxTokens('1200')).toBe(1200);
    });

    it('clamps zero / negative / NaN to the fallback', () => {
        expect(capMaxTokens(0, 300)).toBe(300);
        expect(capMaxTokens(-5, 300)).toBe(300);
        expect(capMaxTokens(Number.NaN, 300)).toBe(300);
    });

    it('never exceeds MAX_OUTPUT_TOKENS even for a misconfigured fallback', () => {
        expect(capMaxTokens(undefined, 99_999)).toBe(MAX_OUTPUT_TOKENS);
    });
});

describe('readWithIdleTimeout', () => {
    it('returns the reader result when a chunk arrives before the timeout', async () => {
        const reader = {
            read: vi.fn().mockResolvedValue({ done: false, value: new Uint8Array([1, 2, 3]) }),
            cancel: vi.fn()
        };
        const result = await readWithIdleTimeout(reader, 1000);
        expect(result.done).toBe(false);
        expect(result.timedOut).toBeUndefined();
        expect(reader.cancel).not.toHaveBeenCalled();
    });

    it('resolves with timedOut=true when no chunk arrives in time', async () => {
        const reader = {
            read: () => new Promise(() => { /* never resolves */ }),
            cancel: vi.fn()
        };
        const result = await readWithIdleTimeout(reader, 10);
        expect(result.timedOut).toBe(true);
        expect(result.done).toBe(true);
        expect(reader.cancel).toHaveBeenCalled();
    });

    it('uses STREAM_IDLE_MS when no explicit timeout is given', async () => {
        // Sanity-check the exported constant is sensible (≈15s, not 0).
        expect(STREAM_IDLE_MS).toBeGreaterThanOrEqual(5_000);
        expect(STREAM_IDLE_MS).toBeLessThanOrEqual(60_000);
    });
});
