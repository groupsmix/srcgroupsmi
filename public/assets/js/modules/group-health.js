// ─── Module: group-health ───
// Exports: GroupHealth

// ═══════════════════════════════════════
// GROUP HEALTH — Link validity checking & caching
// Stores health check results in localStorage so badges
// can be shown on group cards and profile pages.
// ═══════════════════════════════════════
const GroupHealth = {
    _storageKey: 'gm_health_cache',
    _cacheDuration: 3600000 * 6, // 6 hours

    _getCache() {
        const cache = SafeStorage.getJSON(this._storageKey, {});
        return cache && typeof cache === 'object' ? cache : {};
    },

    _setCache(cache) {
        SafeStorage.setJSON(this._storageKey, cache);
    },

    getCachedStatus(groupId) {
        const cache = this._getCache();
        const entry = cache[groupId];
        if (!entry) return null;
        if (Date.now() - entry.ts > this._cacheDuration) {
            delete cache[groupId];
            this._setCache(cache);
            return null;
        }
        return entry;
    },

    setCachedStatus(groupId, status, extra) {
        const cache = this._getCache();
        cache[groupId] = { status: status, ts: Date.now(), ...(extra || {}) };
        // Limit cache size
        const keys = Object.keys(cache);
        if (keys.length > 500) {
            keys.sort(function(a, b) { return cache[a].ts - cache[b].ts; });
            for (let i = 0; i < keys.length - 400; i++) delete cache[keys[i]];
        }
        this._setCache(cache);
    },

    async checkLink(url) {
        try {
            const res = await fetch('/api/health-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });
            const data = await res.json();
            if (data.ok) return data;
            return { status: 'uncertain', checkedAt: new Date().toISOString() };
        } catch {
            return { status: 'uncertain', checkedAt: new Date().toISOString() };
        }
    },

    async checkGroup(group) {
        if (!group || !group.link) return { status: 'uncertain' };
        const cached = this.getCachedStatus(group.id);
        if (cached) return cached;
        const result = await this.checkLink(group.link);
        this.setCachedStatus(group.id, result.status, { platform: result.platform });
        return result;
    },

    healthBadge(status) {
        const badges = {
            active: '<span class="health-badge health-badge--active" title="Link verified active">' + ICONS.check_circle + ' Active</span>',
            dead: '<span class="health-badge health-badge--dead" title="Link expired or dead">' + ICONS.x_circle + ' Dead</span>',
            uncertain: '<span class="health-badge health-badge--uncertain" title="Status unknown">' + ICONS.alert_circle + ' Unknown</span>'
        };
        return badges[status] || badges.uncertain;
    }
};
window.GroupHealth = GroupHealth;

