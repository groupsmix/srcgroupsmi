import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptSrc = readFileSync(
    join(__dirname, '../public/assets/js/shared/safe-storage.js'),
    'utf8'
);

function createStore() {
    const data = new Map();
    return {
        data,
        getItem: vi.fn((k) => (data.has(k) ? data.get(k) : null)),
        setItem: vi.fn((k, v) => { data.set(k, String(v)); }),
        removeItem: vi.fn((k) => { data.delete(k); })
    };
}

function loadSafeStorage(store) {
    const window = { localStorage: store };
    vm.createContext(window);
    vm.runInContext(scriptSrc, window);
    return window.SafeStorage;
}

describe('SafeStorage', () => {
    let store;
    let SafeStorage;

    beforeEach(() => {
        store = createStore();
        SafeStorage = loadSafeStorage(store);
    });

    describe('get', () => {
        it('returns stored value', () => {
            store.data.set('k', 'v');
            expect(SafeStorage.get('k')).toBe('v');
        });

        it('returns null when key is missing and no fallback provided', () => {
            expect(SafeStorage.get('missing')).toBeNull();
        });

        it('returns fallback when key is missing', () => {
            expect(SafeStorage.get('missing', 'default')).toBe('default');
        });

        it('returns fallback when getItem throws', () => {
            store.getItem.mockImplementation(() => { throw new Error('denied'); });
            expect(SafeStorage.get('k', 'fb')).toBe('fb');
        });
    });

    describe('set', () => {
        it('stores value and returns true', () => {
            expect(SafeStorage.set('k', 'v')).toBe(true);
            expect(store.data.get('k')).toBe('v');
        });

        it('returns false when setItem throws (quota exceeded)', () => {
            store.setItem.mockImplementation(() => { throw new Error('quota'); });
            expect(SafeStorage.set('k', 'v')).toBe(false);
        });
    });

    describe('remove', () => {
        it('removes stored value and returns true', () => {
            store.data.set('k', 'v');
            expect(SafeStorage.remove('k')).toBe(true);
            expect(store.data.has('k')).toBe(false);
        });

        it('returns false when removeItem throws', () => {
            store.removeItem.mockImplementation(() => { throw new Error('denied'); });
            expect(SafeStorage.remove('k')).toBe(false);
        });
    });

    describe('getJSON', () => {
        it('parses JSON value', () => {
            store.data.set('k', JSON.stringify({ a: 1, b: [2, 3] }));
            expect(SafeStorage.getJSON('k')).toEqual({ a: 1, b: [2, 3] });
        });

        it('returns fallback when key is missing', () => {
            expect(SafeStorage.getJSON('missing', [])).toEqual([]);
        });

        it('returns null when key is missing and no fallback provided', () => {
            expect(SafeStorage.getJSON('missing')).toBeNull();
        });

        it('returns fallback when stored value is not valid JSON', () => {
            store.data.set('k', 'not-json{');
            expect(SafeStorage.getJSON('k', { default: true })).toEqual({ default: true });
        });

        it('returns fallback when getItem throws', () => {
            store.getItem.mockImplementation(() => { throw new Error('denied'); });
            expect(SafeStorage.getJSON('k', [])).toEqual([]);
        });
    });

    describe('setJSON', () => {
        it('stringifies and stores value', () => {
            expect(SafeStorage.setJSON('k', { a: 1 })).toBe(true);
            expect(JSON.parse(store.data.get('k'))).toEqual({ a: 1 });
        });

        it('returns false when value is not serializable', () => {
            const circular = {};
            circular.self = circular;
            expect(SafeStorage.setJSON('k', circular)).toBe(false);
            expect(store.data.has('k')).toBe(false);
        });

        it('returns false when setItem throws', () => {
            store.setItem.mockImplementation(() => { throw new Error('quota'); });
            expect(SafeStorage.setJSON('k', { a: 1 })).toBe(false);
        });
    });

    describe('isAvailable', () => {
        it('returns true when localStorage accepts writes', () => {
            expect(SafeStorage.isAvailable()).toBe(true);
        });

        it('returns false when setItem throws', () => {
            store.setItem.mockImplementation(() => { throw new Error('denied'); });
            expect(SafeStorage.isAvailable()).toBe(false);
        });

        it('returns false when localStorage is missing', () => {
            const fresh = loadSafeStorage(null);
            expect(fresh.isAvailable()).toBe(false);
        });
    });

    describe('when localStorage is unavailable', () => {
        let S;
        beforeEach(() => {
            S = loadSafeStorage(null);
        });

        it('get returns fallback', () => {
            expect(S.get('k', 'fb')).toBe('fb');
        });

        it('set returns false', () => {
            expect(S.set('k', 'v')).toBe(false);
        });

        it('remove returns false', () => {
            expect(S.remove('k')).toBe(false);
        });

        it('getJSON returns fallback', () => {
            expect(S.getJSON('k', {})).toEqual({});
        });

        it('setJSON returns false', () => {
            expect(S.setJSON('k', {})).toBe(false);
        });
    });
});
