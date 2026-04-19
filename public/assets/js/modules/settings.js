// ─── Module: settings ───
// Exports: loadSettings

// ═══════════════════════════════════════
// MODULE 13: loadSettings
// ═══════════════════════════════════════
async function _loadSettings() {
    try {
        const settings = await DB.config.getSettings();
        if (!settings || !Object.keys(settings).length) return;
        if (settings.features) Object.assign(CONFIG.features, settings.features);
        if (settings.announcement) Object.assign(CONFIG.announcement, settings.announcement);
        if (settings.cryptoWallets) Object.assign(CONFIG.cryptoWallets, settings.cryptoWallets);
        if (settings.lemonSqueezy) Object.assign(CONFIG.lemonSqueezy, settings.lemonSqueezy);
        if (settings.turnstileSiteKey) CONFIG.turnstileSiteKey = settings.turnstileSiteKey;
        renderAnnouncement();
        renderFooter();
    } catch (err) { console.error('loadSettings:', err.message); }
}

