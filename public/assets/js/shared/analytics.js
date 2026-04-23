/**
 * Client-side product analytics loader (Plausible-first).
 *
 * The loader is a no-op until `window.PLAUSIBLE_CONFIG.domain` is set at
 * build time by `scripts/stamp-observability-config.js`. When enabled, it
 * loads Plausible's script and exposes a uniform tracking API:
 *
 *   window.GMAnalytics.track('CTA clicked', { location: 'hero' });
 *
 * Events emitted before Plausible has finished loading are queued and
 * replayed on load; this mirrors the Segment/Heap/etc pattern so callers
 * never need to guard on `window.plausible` being ready.
 *
 * Respects:
 *   • DoNotTrack — any value of '1' / 'yes' disables the loader.
 *   • Admin pages — anything under `/gm-ctrl` never emits analytics.
 *   • Global cookie-consent flag (`window.__gm_cookie_consent`) if set —
 *     when present and false, nothing loads. When the flag is not
 *     defined (e.g. pre-consent banner), Plausible is still safe to load
 *     because it uses no cookies or persistent identifiers.
 *
 * PostHog alternative: Plausible is the default because it is cookieless
 * and privacy-first. To swap in PostHog, set `window.PLAUSIBLE_CONFIG` to
 * `{ provider: 'posthog', apiKey: '…', apiHost: 'https://eu.posthog.com' }`
 * in the stamp script — the loader branches on `provider`.
 */
(function initAnalytics(global) {
    'use strict';

    if (typeof global === 'undefined' || !global.document) return;

    var cfg = global.PLAUSIBLE_CONFIG;
    if (!cfg || typeof cfg !== 'object') return;

    var provider = cfg.provider || 'plausible';
    var domain = typeof cfg.domain === 'string' ? cfg.domain.trim() : '';
    var apiHost = typeof cfg.apiHost === 'string' && cfg.apiHost
        ? cfg.apiHost.replace(/\/+$/, '')
        : 'https://plausible.io';

    if (provider === 'plausible' && !domain) return;
    if (provider === 'posthog' && !cfg.apiKey) return;

    try {
        var dnt = global.navigator && (global.navigator.doNotTrack || global.navigator.msDoNotTrack);
        if (dnt === '1' || dnt === 'yes') return;
    } catch (_e) { /* ignore */ }

    try {
        var path = global.location && global.location.pathname;
        if (path && path.indexOf('/gm-ctrl') === 0) return;
    } catch (_e) { /* ignore */ }

    if (global.__gm_cookie_consent === false) return;

    // Uniform tracking API — survives the script-loading gap by queueing
    // calls and replaying them as soon as the provider is ready.
    var queue = [];
    var ready = false;

    function flushQueue(dispatch) {
        ready = true;
        for (var i = 0; i < queue.length; i++) {
            try { dispatch.apply(null, queue[i]); } catch (_e) { /* swallow */ }
        }
        queue.length = 0;
    }

    var GMAnalytics = {
        track: function track(eventName, props) {
            if (typeof eventName !== 'string' || !eventName) return;
            if (!ready) {
                queue.push([eventName, props || {}]);
                return;
            }
            try { dispatchEvent(eventName, props || {}); } catch (_e) { /* swallow */ }
        },
        isReady: function isReady() { return ready; },
        _provider: provider
    };

    global.GMAnalytics = GMAnalytics;

    function dispatchEvent(eventName, props) {
        if (provider === 'plausible' && typeof global.plausible === 'function') {
            global.plausible(eventName, { props: props });
        } else if (provider === 'posthog' && global.posthog && typeof global.posthog.capture === 'function') {
            global.posthog.capture(eventName, props);
        }
    }

    if (provider === 'plausible') {
        loadPlausible();
    } else if (provider === 'posthog') {
        loadPostHog();
    }

    function loadPlausible() {
        // The standard `script.js` build auto-tracks pageviews and exposes
        // `window.plausible()` for custom events. We do NOT use the
        // `manual` build because it would require every page to call
        // `plausible('pageview')` itself.
        var script = global.document.createElement('script');
        script.defer = true;
        script.src = apiHost + '/js/script.js';
        script.setAttribute('data-domain', domain);
        script.crossOrigin = 'anonymous';
        script.onload = function () {
            if (typeof global.plausible !== 'function') {
                // Defensive: provide a stub so queued calls don't crash.
                global.plausible = function () { /* noop */ };
            }
            flushQueue(function (name, props) { global.plausible(name, { props: props }); });
        };
        script.onerror = function () {
            // Silent: a broken analytics pipeline must never break the app.
            queue.length = 0;
        };
        global.document.head.appendChild(script);
    }

    function loadPostHog() {
        var apiKey = cfg.apiKey;
        var script = global.document.createElement('script');
        script.async = true;
        script.src = apiHost.replace(/\/+$/, '') + '/array.js';
        script.crossOrigin = 'anonymous';
        script.onload = function () {
            if (!global.posthog || typeof global.posthog.init !== 'function') return;
            try {
                global.posthog.init(apiKey, {
                    api_host: apiHost,
                    capture_pageview: true,
                    persistence: 'memory',
                    disable_session_recording: true
                });
                flushQueue(function (name, props) { global.posthog.capture(name, props); });
            } catch (_e) { queue.length = 0; }
        };
        script.onerror = function () { queue.length = 0; };
        global.document.head.appendChild(script);
    }
})(typeof window !== 'undefined' ? window : undefined);
