/**
 * site-config.js — per-environment config stamped at build time.
 *
 * Populated by `scripts/stamp-site-config.js` using the PUBLIC_* env vars
 * set in Cloudflare Pages → Settings → Env. When the env vars are unset
 * the fields below are left as empty strings and the consuming loaders
 * (`public/assets/js/shared/sentry.js`, `public/assets/js/shared/plausible.js`)
 * stay inert.
 *
 * Do not edit in source — the stamper rewrites the three `window.*`
 * assignments below by matching the exact regexes. Adding anything between
 * them will break the replacement.
 */
(function (global) {
    'use strict';
    if (!global) return;

    // Sentry client config. The loader at public/assets/js/shared/sentry.js
    // reads this and no-ops when `dsn` is empty.
    global.SENTRY_CONFIG = {
        dsn: '',
        environment: 'production',
        release: '',
        tracesSampleRate: 0
    };

    // Plausible config. The loader at public/assets/js/shared/plausible.js
    // reads this and no-ops when `domain` is empty.
    global.PLAUSIBLE_CONFIG = {
        domain: '',
        apiHost: 'https://plausible.io',
        scriptVariant: 'script.outbound-links.js'
    };

    // Environment tag used by features.js / article-platform-features.js etc.
    global.GM_ENV = 'production';
})(typeof window !== 'undefined' ? window : undefined);
