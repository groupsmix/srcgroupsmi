// ─── Module: saved ───
// Exports: Saved

// ═══════════════════════════════════════
// MODULE 7: Saved
// ═══════════════════════════════════════
const _Saved = {
    _key: 'gm_saved_groups',
    getAll() {
        return SafeStorage.getJSON(this._key, []);
    },
    add(group) {
        if (!group?.id) return;
        const all = this.getAll();
        if (all.some(g => g.id === group.id)) return;
        all.unshift({ id: group.id, name: group.name, platform: group.platform, category: group.category, vip_tier: group.vip_tier, vip_expiry: group.vip_expiry });
        SafeStorage.setJSON(this._key, all.slice(0, 100));
    },
    remove(groupId) {
        const all = this.getAll().filter(g => g.id !== groupId);
        SafeStorage.setJSON(this._key, all);
    },
    isSaved(groupId) { return this.getAll().some(g => g.id === groupId); },
    count() { return this.getAll().length; },
    clear() { SafeStorage.remove(this._key); }
};

