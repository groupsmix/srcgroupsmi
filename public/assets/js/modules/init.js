// ─── Module: init ───
// Exports: Global init, service worker, error handlers
// Split from app.js for maintainability

// ═══════════════════════════════════════
// MODULE 15: Global Init
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    Theme.init();
    Security.init();
    // Start auth listener BEFORE rendering header so that
    // the INITIAL_SESSION callback can update the header with
    // the correct logged-in state as soon as possible.
    Auth._initListener();
    // Render header: if a Supabase session exists in localStorage the
    // header will briefly show "Sign In" until the INITIAL_SESSION
    // callback fires and re-renders it. We check localStorage here to
    // avoid the flash by rendering a placeholder instead.
    renderHeader();
    renderFooter();
    renderMobileNav();
    loadSettings();
    // Check maintenance mode (async, non-blocking for admins)
    MaintenanceMode.check();
    // Initialize real-time live stats (views, likes, ratings, comments)
    LiveRealtime.init();
    // Premium header scroll effect
    (function initHeaderScroll() {
        var header = document.querySelector('.site-header');
        if (!header) return;
        var onScroll = function() {
            if (window.scrollY > 20) { header.classList.add('scrolled'); }
            else { header.classList.remove('scrolled'); }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    })();
    // CookieConsent.init(); // Disabled — no popup on page load
    // Load Turnstile SDK globally so auth modal CAPTCHA works on every page
    if (CONFIG.turnstileSiteKey && !document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
        const ts = document.createElement('script');
        ts.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        ts.async = true;
        ts.defer = true;
        document.head.appendChild(ts);
    }
});

// ═══════════════════════════════════════
// SERVICE WORKER REGISTRATION & AUTO-UPDATE
// Registers the SW once, then checks for updates on every page load.
// When a new SW is found, it auto-activates and reloads the page so
// users always see the latest version without manually clearing cache.
// ═══════════════════════════════════════
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(reg) {
            // Check for SW updates immediately and on every page load
            reg.update();

            // Also check for updates periodically (every 60 seconds)
            setInterval(function() { reg.update(); }, 60000);

            // When a new SW is found and installed, tell it to activate
            reg.addEventListener('updatefound', function() {
                var newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', function() {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New SW is ready — tell it to skip waiting
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });
        }).catch(function(err) {
            console.warn('SW registration failed:', err);
        });

        // When the new SW takes over, reload so user sees the latest content
        var refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', function() {
            if (!refreshing) {
                refreshing = true;
                window.location.reload();
            }
        });
    });
}

window.onerror = function (msg, src, line, col, err) {
    if (err && err.message) console.warn('GlobalError:', err.message, src, line);
};
window.onunhandledrejection = function (e) {
    if (e && e.reason) console.warn('UnhandledRejection:', e.reason.message || e.reason);
};
