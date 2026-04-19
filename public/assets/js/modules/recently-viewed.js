// ─── Module: recently-viewed ───
// Exports: RecentlyViewed

// ═══════════════════════════════════════
// MODULE 8: RecentlyViewed
// ═══════════════════════════════════════
const _RecentlyViewed = {
    _key: 'gm_recent_groups',
    _max: 20,
    getAll() {
        try { return JSON.parse(localStorage.getItem(this._key) || '[]'); } catch (err) { console.error('RecentlyViewed.getAll:', err.message); return []; }
    },
    add(group) {
        if (!group?.id) return;
        const all = this.getAll().filter(g => g.id !== group.id);
        all.unshift({ id: group.id, name: group.name, platform: group.platform, ts: Date.now() });
        localStorage.setItem(this._key, JSON.stringify(all.slice(0, this._max)));
    },
    clear() { localStorage.removeItem(this._key); }
};

