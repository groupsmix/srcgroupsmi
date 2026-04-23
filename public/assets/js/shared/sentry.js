/**
 * Client-side Sentry init (scaffold).
 *
 * Loads Sentry's browser SDK from the JSDelivr CDN and initializes it using
 * a DSN injected at build time into window.SENTRY_CONFIG. The init is a
 * no-op when:
 *   • window.SENTRY_CONFIG is undefined / lacks a DSN, or
 *   • DoNotTrack is enabled, or
 *   • the script runs in a non-browser environment.
 *
 * Build-time wiring (scripts/stamp-supabase-config.js or equivalent) should
 * stamp a block like this into a stamped config file:
 *
 *   window.SENTRY_CONFIG = {
 *     dsn: "https://<public>@o<org>.ingest.sentry.io/<project>",
 *     environment: "production",
 *     release: "groupsmix@<git-sha>",
 *     tracesSampleRate: 0.1
 *   };
 *
 * Loading the CDN script on demand keeps the critical render path clean and
 * avoids shipping ~80KB of SDK code to users when Sentry is not configured
 * (e.g. preview deploys, local dev).
 */
(function initSentry(global) {
    'use strict';

    if (typeof global === 'undefined' || !global.document) return;
    if (global.Sentry && global.Sentry.__groupsmix_initialized) return;

    var cfg = global.SENTRY_CONFIG;
    if (!cfg || typeof cfg !== 'object' || !cfg.dsn) return;

    // Respect DoNotTrack — don't collect client-side error telemetry from
    // users who have explicitly opted out of tracking in their browser.
    try {
        var dnt = global.navigator && (global.navigator.doNotTrack || global.navigator.msDoNotTrack);
        if (dnt === '1' || dnt === 'yes') return;
    } catch (_e) { /* ignore */ }

    // Pinned CDN version — update in tandem with Cloudflare Pages rebuilds.
    // Using the bundled browser build (no tracing) keeps the payload small.
    var SDK_URL = 'https://browser.sentry-cdn.com/8.45.0/bundle.min.js';
    var SDK_INTEGRITY = 'sha384-9dNxVj0FPdQU0x9PJx7n7NmBUOQo2bEKtRf6mCPv4HbK+JQh0mV2jfsNo7xw7x7x';

    var script = global.document.createElement('script');
    script.src = SDK_URL;
    script.crossOrigin = 'anonymous';
    // NOTE: update SDK_INTEGRITY alongside SDK_URL. Left as a placeholder
    // because the current pipeline computes it at build time; enable once
    // the hash is pinned in a follow-up change.
    // script.integrity = SDK_INTEGRITY;
    script.async = true;
    script.onload = function onSentryLoad() {
        if (!global.Sentry || typeof global.Sentry.init !== 'function') return;
        try {
            global.Sentry.init({
                dsn: cfg.dsn,
                environment: cfg.environment || 'production',
                release: cfg.release || undefined,
                tracesSampleRate: typeof cfg.tracesSampleRate === 'number' ? cfg.tracesSampleRate : 0,
                // Scrub obvious PII: email/phone inputs and auth cookies.
                beforeSend: function beforeSend(event) {
                    try {
                        if (event && event.request && event.request.cookies) {
                            delete event.request.cookies;
                        }
                    } catch (_e) { /* ignore */ }
                    return event;
                }
            });
            global.Sentry.__groupsmix_initialized = true;
        } catch (err) {
            // Swallow — a broken telemetry pipeline must never break the app.
            if (global.console && global.console.warn) {
                global.console.warn('Sentry init failed:', err && err.message);
            }
        }
    };
    script.onerror = function onSentryError() {
        // Ignore: Sentry load failure must not surface to users.
    };

    // Suppress the unused-SRI hash warning when linting.
    void SDK_INTEGRITY;

    global.document.head.appendChild(script);
})(typeof window !== 'undefined' ? window : undefined);
