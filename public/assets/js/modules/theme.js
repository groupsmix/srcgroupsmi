// ─── Module: theme ───
// Exports: Theme

// ═══════════════════════════════════════
// MODULE 6: Theme
// ═══════════════════════════════════════
const _Theme = {
    _current: 'dark',
    init() {
        const saved = SafeStorage.get('gm_theme');
        this._current = saved === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', this._current);
    },
    set(theme) {
        if (theme !== 'dark' && theme !== 'light') return;
        this._current = theme;
        document.documentElement.setAttribute('data-theme', this._current);
        SafeStorage.set('gm_theme', this._current);
        const btn = document.getElementById('theme-toggle');
        if (btn) btn.innerHTML = this._current === 'dark' ? ICONS.moon : ICONS.sun;
    },
    toggle() {
        // Add smooth transition class
        document.documentElement.classList.add('theme-transitioning');
        this._current = this._current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', this._current);
        SafeStorage.set('gm_theme', this._current);
        // Animate all theme toggle icons (header, dropdown, drawer)
        document.querySelectorAll('.theme-toggle-icon').forEach(function(icon) {
            icon.classList.add('theme-toggle-icon--spin');
            setTimeout(function() { icon.classList.remove('theme-toggle-icon--spin'); }, 500);
        });
        // Remove transition class after animation completes
        setTimeout(function() { document.documentElement.classList.remove('theme-transitioning'); }, 450);
    },
    get() { return this._current; }
};

