// ─── Module: cache ───
// Exports: CACHE

// All Supabase client calls use window.supabaseClient directly
// (initialised by supabase-config.js). window.supabase is left
// untouched so the CDN library namespace is never overwritten.

// ═══════════════════════════════════════
// MODULE 2: CACHE (sessionStorage)
// ═══════════════════════════════════════
// Audit fix #8: added _maxSize and eviction to prevent unbounded memory growth in sessionStorage
const _CACHE = {
    _prefix: 'gm_cache_',
    _maxSize: 100,
    get(key, maxAgeMs) {
        try {
            const raw = sessionStorage.getItem(this._prefix + key);
            if (!raw) return null;
            const { data, ts } = JSON.parse(raw);
            if (Date.now() - ts > maxAgeMs) { sessionStorage.removeItem(this._prefix + key); return null; }
            return data;
        } catch (err) { console.error('CACHE.get:', err.message); return null; }
    },
    set(key, data) {
        try {
            // Evict oldest entries if cache exceeds max size
            const allKeys = Object.keys(sessionStorage).filter(k => k.startsWith(this._prefix));
            if (allKeys.length >= this._maxSize) {
                const entries = allKeys.map(k => {
                    try { const parsed = JSON.parse(sessionStorage.getItem(k)); return { key: k, ts: parsed.ts || 0 }; }
                    catch (_e) { return { key: k, ts: 0 }; }
                }).sort((a, b) => a.ts - b.ts);
                // Remove oldest 20% to avoid evicting on every set
                const removeCount = Math.max(1, Math.floor(this._maxSize * 0.2));
                for (let i = 0; i < removeCount && i < entries.length; i++) {
                    sessionStorage.removeItem(entries[i].key);
                }
            }
            sessionStorage.setItem(this._prefix + key, JSON.stringify({ data, ts: Date.now() }));
        } catch (err) { console.error('CACHE.set:', err.message); }
    },
    remove(key) {
        try { sessionStorage.removeItem(this._prefix + key); } catch (err) { console.error('CACHE.remove:', err.message); }
    },
    clear() {
        try {
            Object.keys(sessionStorage).forEach(k => { if (k.startsWith(this._prefix)) sessionStorage.removeItem(k); });
        } catch (err) { console.error('CACHE.clear:', err.message); }
    }
};

