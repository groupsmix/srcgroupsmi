// ─── Module: theme ───
// Exports: Theme
// Split from app.js for maintainability

// ═══════════════════════════════════════
// MODULE 6: Theme
// ═══════════════════════════════════════
const Theme = {
    _current: 'dark',
    init() {
        const saved = localStorage.getItem('gm_theme');
        this._current = saved === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', this._current);
    },
    set(theme) {
        if (theme !== 'dark' && theme !== 'light') return;
        this._current = theme;
        document.documentElement.setAttribute('data-theme', this._current);
        localStorage.setItem('gm_theme', this._current);
        const btn = document.getElementById('theme-toggle');
        if (btn) btn.innerHTML = this._current === 'dark' ? ICONS.moon : ICONS.sun;
    },
    toggle() {
        this._current = this._current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', this._current);
        localStorage.setItem('gm_theme', this._current);
        const btn = document.getElementById('theme-toggle');
        if (btn) btn.innerHTML = this._current === 'dark' ? ICONS.moon : ICONS.sun;
    },
    get() { return this._current; }
};
