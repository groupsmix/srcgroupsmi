/**
 * observability-config.js — build-time config holder for observability
 * scaffolds (Sentry client, product analytics).
 *
 * This file is intentionally empty in source; `scripts/stamp-observability-
 * config.js` rewrites it at build time by filling in the config objects
 * from the process environment (PUBLIC_SENTRY_DSN, PUBLIC_PLAUSIBLE_DOMAIN,
 * etc.).
 *
 * Keeping the stamp target as its own file (rather than editing
 * `sentry.js` / `analytics.js` directly) means the loader scripts stay
 * purely behavioural code — they read from well-known globals and never
 * need to be regenerated on a config change.
 */
(function seedObservabilityConfig(global) {
    'use strict';
    if (typeof global === 'undefined') return;

    // Sentry browser SDK config — consumed by /assets/js/shared/sentry.js.
    // Leave `dsn` empty to keep the loader inert.
    if (!global.SENTRY_CONFIG) {
        global.SENTRY_CONFIG = {
            dsn: '',
            environment: 'production',
            release: '',
            tracesSampleRate: 0
        };
    }

    // Plausible / PostHog config — consumed by /assets/js/shared/analytics.js.
    // Leave `domain` / `apiHost` empty to keep the loader inert.
    if (!global.PLAUSIBLE_CONFIG) {
        global.PLAUSIBLE_CONFIG = {
            domain: '',
            apiHost: 'https://plausible.io'
        };
    }
})(typeof window !== 'undefined' ? window : undefined);
