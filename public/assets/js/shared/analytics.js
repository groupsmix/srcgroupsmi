/**
 * Client-side product analytics loader (Plausible).
 *
 * No-op unless ALL of the following hold:
 *   • window.ANALYTICS_CONFIG.plausible.domain is a non-empty string
 *   • navigator.doNotTrack is NOT "1" / "yes"
 *   • SafeStorage.get('gm_cookie_consent') is NOT "rejected"
 *
 * When enabled, loads Plausible's browser script with the configured
 * data-domain and exposes window.gmAnalytics with a `.track(event, props)`
 * helper. Calls before the script has finished loading are queued and
 * flushed on script load; calls after load forward to window.plausible.
 *
 * Plausible is cookieless and does not set storage, so no cookie-banner
 * interaction is strictly required — but we still honor an explicit
 * "rejected" choice so the consent UI is meaningful to users.
 *
 * Attached to `window.gmAnalytics` so it can be called from inline /
 * extracted scripts without an import system, matching SafeStorage and
 * SecureRandom.
 */
(function (global) {
    'use strict';

    if (typeof global === 'undefined' || !global.document) return;
    if (global.gmAnalytics && global.gmAnalytics.__initialized) return;

    var cfg = global.ANALYTICS_CONFIG && global.ANALYTICS_CONFIG.plausible;
    var domain = cfg && typeof cfg.domain === 'string' ? cfg.domain.trim() : '';
    var src = (cfg && typeof cfg.src === 'string' && cfg.src) ||
        'https://plausible.io/js/script.outbound-links.tagged-events.js';

    /** Queued events until plausible loads. */
    var queue = [];

    /**
     * Public API — safe to call at any time, including before this module
     * (or plausible) has loaded. Events before opt-in are dropped, not
     * queued, so toggling consent later does not back-fill history.
     */
    function track(event, props) {
        if (!event || typeof event !== 'string') return;
        if (!isEnabled()) return;
        if (global.plausible) {
            try {
                global.plausible(event, props ? { props: props } : undefined);
            } catch (_e) { /* ignore */ }
            return;
        }
        queue.push({ event: event, props: props });
    }

    function flushQueue() {
        if (!global.plausible) return;
        for (var i = 0; i < queue.length; i++) {
            try {
                var item = queue[i];
                global.plausible(item.event, item.props ? { props: item.props } : undefined);
            } catch (_e) { /* ignore */ }
        }
        queue.length = 0;
    }

    function isEnabled() {
        if (!domain) return false;

        // DoNotTrack — matches the sentry.js loader's handling.
        try {
            var dnt = global.navigator && (global.navigator.doNotTrack || global.navigator.msDoNotTrack);
            if (dnt === '1' || dnt === 'yes') return false;
        } catch (_e) { /* treat as opted-in */ }

        // Explicit cookie-consent rejection overrides everything.
        try {
            var consent = global.SafeStorage && typeof global.SafeStorage.get === 'function'
                ? global.SafeStorage.get('gm_cookie_consent')
                : null;
            if (consent === 'rejected') return false;
        } catch (_e) { /* ignore */ }

        return true;
    }

    // Expose the API even when disabled so callers don't have to feature-
    // detect. In the disabled path, `.track` becomes a cheap no-op.
    global.gmAnalytics = {
        track: track,
        isEnabled: isEnabled,
        __initialized: true
    };

    if (!isEnabled()) return;

    // Guard against double-loading (BaseLayout runs on every page, and
    // some pages include shared scripts more than once historically).
    var existing = global.document.querySelector('script[data-gm-analytics="plausible"]');
    if (existing) {
        flushQueue();
        return;
    }

    var script = global.document.createElement('script');
    script.src = src;
    script.defer = true;
    script.setAttribute('data-domain', domain);
    script.setAttribute('data-gm-analytics', 'plausible');
    script.onload = function onAnalyticsLoad() {
        // plausible's script sets `window.plausible` to a queueing stub
        // immediately on evaluation. Flush anything we queued before.
        try {
            flushQueue();
        } catch (_e) { /* ignore */ }
    };
    script.onerror = function onAnalyticsError() {
        // Never surface analytics load failures to users.
        queue.length = 0;
    };

    global.document.head.appendChild(script);
}(typeof window !== 'undefined' ? window : undefined));
