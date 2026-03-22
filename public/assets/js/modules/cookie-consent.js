// ─── Module: cookie-consent ───
// Exports: CookieConsent

// ═══════════════════════════════════════
// MODULE 14: Cookie Consent
// ═══════════════════════════════════════
const CookieConsent = {
    _key: 'gm_cookie_consent',

    /** Returns 'accepted', 'rejected', or null (no choice yet) */
    getChoice() {
        try { return localStorage.getItem(this._key); } catch (e) { return null; }
    },

    /** Save user's choice and dismiss banner */
    _save(choice) {
        try { localStorage.setItem(this._key, choice); } catch (e) { /* private browsing */ }
        var banner = document.getElementById('cookie-banner');
        if (banner) { banner.style.animation = 'fadeOut 0.2s ease forwards'; setTimeout(function() { banner.remove(); }, 200); }
        if (choice === 'accepted') {
            CookieConsent._loadAnalytics();
        } else {
            CookieConsent._removeAnalytics();
        }
    },

    accept() { this._save('accepted'); },
    reject() { this._save('rejected'); },

    /** Load Cloudflare Web Analytics beacon (only when accepted) */
    _loadAnalytics() {
        if (document.querySelector('script[src*="cloudflareinsights.com/beacon"]')) return;
        var s = document.createElement('script');
        s.defer = true;
        s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
        // Audit fix #19: TODO — replace empty string with actual Cloudflare Web Analytics token
        s.setAttribute('data-cf-beacon', '{"token":""}');
        document.head.appendChild(s);
    },

    /** Remove Cloudflare analytics if already loaded */
    _removeAnalytics() {
        var el = document.querySelector('script[src*="cloudflareinsights.com/beacon"]');
        if (el) el.remove();
    },

    /** Show the consent banner if user hasn't chosen yet */
    init() {
        var choice = this.getChoice();
        if (choice === 'accepted') { this._loadAnalytics(); return; }
        if (choice === 'rejected') { this._removeAnalytics(); return; }
        // No choice yet — show banner
        var banner = document.createElement('div');
        banner.className = 'cookie-banner';
        banner.id = 'cookie-banner';
        banner.innerHTML =
            '<div class="cookie-banner__text">' +
            'We use cookies and local storage to improve your experience. ' +
            'Analytics help us understand how the site is used. ' +
            '<a href="/privacy">Privacy Policy</a>' +
            '</div>' +
            '<div class="cookie-banner__actions">' +
            '<button class="btn btn-secondary btn-sm" id="cookie-reject">Reject</button>' +
            '<button class="btn btn-primary btn-sm" id="cookie-accept">Accept</button>' +
            '</div>';
        document.body.appendChild(banner);
        document.getElementById('cookie-accept')?.addEventListener('click', function() { CookieConsent.accept(); });
        document.getElementById('cookie-reject')?.addEventListener('click', function() { CookieConsent.reject(); });
    }
};

