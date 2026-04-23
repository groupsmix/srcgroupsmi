// ─── Module: recently-viewed ───
// Exports: RecentlyViewed

// ═══════════════════════════════════════
// MODULE 8: RecentlyViewed
// ═══════════════════════════════════════
const _RecentlyViewed = {
    _key: 'gm_recent_groups',
    _max: 20,
    getAll() {
        return SafeStorage.getJSON(this._key, []);
    },
    add(group) {
        if (!group?.id) return;
        const all = this.getAll().filter(g => g.id !== group.id);
        all.unshift({ id: group.id, name: group.name, platform: group.platform, ts: Date.now() });
        SafeStorage.setJSON(this._key, all.slice(0, this._max));
    },
    clear() { SafeStorage.remove(this._key); }
};

