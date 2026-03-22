// ─── Module: saved ───
// Exports: Saved

// ═══════════════════════════════════════
// MODULE 7: Saved
// ═══════════════════════════════════════
const Saved = {
    _key: 'gm_saved_groups',
    getAll() {
        try { return JSON.parse(localStorage.getItem(this._key) || '[]'); } catch (err) { console.error('Saved.getAll:', err.message); return []; }
    },
    add(group) {
        if (!group?.id) return;
        const all = this.getAll();
        if (all.some(g => g.id === group.id)) return;
        all.unshift({ id: group.id, name: group.name, platform: group.platform, category: group.category, vip_tier: group.vip_tier, vip_expiry: group.vip_expiry });
        localStorage.setItem(this._key, JSON.stringify(all.slice(0, 100)));
    },
    remove(groupId) {
        const all = this.getAll().filter(g => g.id !== groupId);
        localStorage.setItem(this._key, JSON.stringify(all));
    },
    isSaved(groupId) { return this.getAll().some(g => g.id === groupId); },
    count() { return this.getAll().length; },
    clear() { localStorage.removeItem(this._key); }
};

