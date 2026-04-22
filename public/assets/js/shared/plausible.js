/**
 * Client-side Plausible Analytics loader.
 *
 * Loads the Plausible script from plausible.io and exposes a `plausible()`
 * function for custom event tracking. The loader is a no-op when:
 *   - window.PLAUSIBLE_CONFIG is undefined / lacks a domain
 *   - DoNotTrack is enabled
 *   - the user opted out via /cookie-consent
 *   - the page is the admin gate (`/gm-ctrl*`)
 *   - the script runs in a non-browser environment
 *
 * Why Plausible: cookieless, no consent banner required under GDPR, no PII
 * retention. Matches the existing DNT-respecting posture of
 * `public/assets/js/shared/sentry.js`.
 *
 * Build-time wiring: `scripts/stamp-supabase-config.js` (or equivalent)
 * should stamp:
 *
 *   window.PLAUSIBLE_CONFIG = {
 *     domain: "groupsmix.com",
 *     apiHost: "https://plausible.io",   // optional — defaults to plausible.io
 *     scriptVariant: "script.outbound-links.js"  // optional
 *   };
 *
 * After init, `window.plausible("Custom Event", { props: { foo: "bar" } })`
 * queues/sends events the same way the official snippet does.
 */
(function initPlausible(global) {
    'use strict';

    if (typeof global === 'undefined' || !global.document) return;
    if (global.plausible && global.plausible.__groupsmix_initialized) return;

    var cfg = global.PLAUSIBLE_CONFIG;
    if (!cfg || typeof cfg !== 'object' || !cfg.domain) return;

    // Respect DoNotTrack.
    try {
        var dnt = global.navigator && (global.navigator.doNotTrack || global.navigator.msDoNotTrack);
        if (dnt === '1' || dnt === 'yes') return;
    } catch (_e) { /* ignore */ }

    // Respect cookie-consent opt-out when available.
    try {
        if (global.localStorage && global.localStorage.getItem('gm-analytics-optout') === '1') return;
    } catch (_e) { /* ignore */ }

    // Don't load on admin routes — no analytics inside the console.
    try {
        if (global.location && typeof global.location.pathname === 'string' &&
            global.location.pathname.indexOf('/gm-ctrl') === 0) {
            return;
        }
    } catch (_e) { /* ignore */ }

    var host = (typeof cfg.apiHost === 'string' && cfg.apiHost) ? cfg.apiHost : 'https://plausible.io';
    var variant = (typeof cfg.scriptVariant === 'string' && cfg.scriptVariant)
        ? cfg.scriptVariant
        : 'script.js';

    // Install the standard Plausible queue shim so pages can call
    // `plausible("Event Name", { props: {...} })` before the CDN script
    // finishes loading.
    global.plausible = global.plausible || function () {
        (global.plausible.q = global.plausible.q || []).push(arguments);
    };
    global.plausible.__groupsmix_initialized = true;

    var script = global.document.createElement('script');
    script.src = host.replace(/\/$/, '') + '/js/' + variant;
    script.defer = true;
    // Plausible uses data-domain for multi-site setups.
    script.setAttribute('data-domain', cfg.domain);
    script.setAttribute('data-api', host.replace(/\/$/, '') + '/api/event');
    script.async = true;
    script.onerror = function onPlausibleError() {
        // Ignore: analytics load failure must not surface to users.
    };

    global.document.head.appendChild(script);
})(typeof window !== 'undefined' ? window : undefined);
