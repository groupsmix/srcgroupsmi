/**
 * SafeStorage — localStorage wrapper for GroupsMix.
 *
 * Centralizes try/catch handling for every localStorage access so that
 * quota-exceeded, private-browsing, and disabled-storage errors cannot
 * crash the page. Exposes JSON helpers for the very common
 * `JSON.parse(localStorage.getItem(k) || '[]')` pattern.
 *
 * Attached to `window.SafeStorage` so it can be used from inline / extracted
 * scripts without an import system, matching SecureRandom and friends.
 *
 * API:
 *   SafeStorage.get(key, fallback?)      → string | fallback | null
 *   SafeStorage.set(key, value)          → boolean (false on failure)
 *   SafeStorage.remove(key)              → boolean
 *   SafeStorage.getJSON(key, fallback?)  → any (swallows JSON.parse errors)
 *   SafeStorage.setJSON(key, value)      → boolean
 *   SafeStorage.isAvailable()            → boolean
 */
(function (root) {
    'use strict';

    function getStore() {
        try {
            return root.localStorage || null;
        } catch (_e) {
            // Some browsers throw on the property access itself.
            return null;
        }
    }

    function safeGet(key, fallback) {
        var fb = fallback === undefined ? null : fallback;
        try {
            var store = getStore();
            if (!store) return fb;
            var v = store.getItem(key);
            return v === null ? fb : v;
        } catch (_e) {
            return fb;
        }
    }

    function safeSet(key, value) {
        try {
            var store = getStore();
            if (!store) return false;
            store.setItem(key, value);
            return true;
        } catch (_e) {
            return false;
        }
    }

    function safeRemove(key) {
        try {
            var store = getStore();
            if (!store) return false;
            store.removeItem(key);
            return true;
        } catch (_e) {
            return false;
        }
    }

    function safeGetJSON(key, fallback) {
        var fb = fallback === undefined ? null : fallback;
        var raw = safeGet(key, null);
        if (raw === null || raw === undefined) return fb;
        try {
            return JSON.parse(raw);
        } catch (_e) {
            return fb;
        }
    }

    function safeSetJSON(key, value) {
        var serialized;
        try {
            serialized = JSON.stringify(value);
        } catch (_e) {
            return false;
        }
        return safeSet(key, serialized);
    }

    function isAvailable() {
        try {
            var store = getStore();
            if (!store) return false;
            var probe = '__gm_storage_probe__';
            store.setItem(probe, '1');
            store.removeItem(probe);
            return true;
        } catch (_e) {
            return false;
        }
    }

    root.SafeStorage = {
        get: safeGet,
        set: safeSet,
        remove: safeRemove,
        getJSON: safeGetJSON,
        setJSON: safeSetJSON,
        isAvailable: isAvailable
    };
}(typeof window !== 'undefined' ? window : globalThis));
