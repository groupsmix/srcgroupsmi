/**
 * analytics-config.js — build-time stamped analytics config.
 *
 * Values below are placeholders. scripts/stamp-analytics-config.js rewrites
 * them after `astro build` based on the PUBLIC_PLAUSIBLE_DOMAIN and
 * PUBLIC_PLAUSIBLE_SRC environment variables. If no env var is set the
 * domain stays empty and shared/analytics.js is a no-op.
 *
 * Kept as its own file (instead of inlined into BaseLayout) so reviewers
 * can read the actual stamped values in the built artifact without
 * having to rebuild.
 */
window.ANALYTICS_CONFIG = {
    plausible: {
        domain: '',
        src: 'https://plausible.io/js/script.outbound-links.tagged-events.js'
    }
};
