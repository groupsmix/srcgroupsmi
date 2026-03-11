// ═══════════════════════════════════════
// GROUPSMIX — head-scripts.js
// Analytics (GA4), Error Monitoring (Sentry),
// Structured Data (JSON-LD), and Lazy Loading
// Loaded on every page via <script> tag
// ═══════════════════════════════════════

(function () {
    'use strict';

    // ─── Google Analytics 4 ────────────────────────────────────
    // Replace G-XXXXXXXXXX with your actual GA4 Measurement ID
    var GA4_ID = 'G-XXXXXXXXXX';

    if (GA4_ID && GA4_ID !== 'G-XXXXXXXXXX') {
        var gtagScript = document.createElement('script');
        gtagScript.async = true;
        gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
        document.head.appendChild(gtagScript);

        window.dataLayer = window.dataLayer || [];
        function gtag() { window.dataLayer.push(arguments); }
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('config', GA4_ID, {
            send_page_view: true,
            cookie_flags: 'SameSite=None;Secure'
        });
    }

    // ─── Sentry Error Monitoring ───────────────────────────────
    // Replace the DSN with your actual Sentry DSN
    // Free tier: 5K errors/month
    var SENTRY_DSN = '';

    if (SENTRY_DSN) {
        var sentryScript = document.createElement('script');
        sentryScript.src = 'https://browser.sentry-cdn.com/7.119.0/bundle.tracing.min.js';
        sentryScript.crossOrigin = 'anonymous';
        sentryScript.onload = function () {
            if (window.Sentry) {
                window.Sentry.init({
                    dsn: SENTRY_DSN,
                    tracesSampleRate: 0.1,
                    environment: window.location.hostname === 'groupsmix.com' ? 'production' : 'development',
                    beforeSend: function (event) {
                        // Don't send events from admin pages
                        if (window.location.pathname.indexOf('gm-ctrl') !== -1) return null;
                        return event;
                    }
                });
            }
        };
        document.head.appendChild(sentryScript);
    }

    // ─── Structured Data (JSON-LD) ─────────────────────────────
    // Injects Organization schema on all pages,
    // plus page-specific schemas for Jobs, Marketplace, etc.
    function injectJsonLd(data) {
        var script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(data);
        document.head.appendChild(script);
    }

    // Organization schema (all pages)
    injectJsonLd({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        'name': 'GroupsMix',
        'url': 'https://groupsmix.com',
        'logo': 'https://groupsmix.com/assets/img/og-default.png',
        'description': 'Discover Trusted Social Media Groups — Find, join, and promote verified communities across WhatsApp, Telegram, Discord, Facebook and more.',
        'sameAs': [],
        'contactPoint': {
            '@type': 'ContactPoint',
            'contactType': 'customer support',
            'url': 'https://groupsmix.com/contact'
        }
    });

    // Page-specific schemas
    var path = window.location.pathname;

    if (path === '/jobs' || path === '/jobs.html') {
        // JobPosting list page schema
        injectJsonLd({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            'name': 'Community Jobs | GroupsMix',
            'description': 'Find community management jobs, moderators, social media managers, and content creator roles.',
            'url': 'https://groupsmix.com/jobs',
            'isPartOf': {
                '@type': 'WebSite',
                'name': 'GroupsMix',
                'url': 'https://groupsmix.com'
            },
            'mainEntity': {
                '@type': 'ItemList',
                'name': 'Community Jobs',
                'description': 'AI-powered job board for community managers, designers, developers, and marketers.',
                'itemListElement': []
            }
        });
    }

    if (path === '/marketplace' || path === '/marketplace.html') {
        // Marketplace page schema
        injectJsonLd({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            'name': 'Group Marketplace | GroupsMix',
            'description': 'Buy & sell social media accounts, channels, groups, and services.',
            'url': 'https://groupsmix.com/marketplace',
            'isPartOf': {
                '@type': 'WebSite',
                'name': 'GroupsMix',
                'url': 'https://groupsmix.com'
            },
            'mainEntity': {
                '@type': 'ItemList',
                'name': 'Marketplace Listings',
                'description': 'Social media marketplace for groups, channels, accounts, and services.',
                'itemListElement': []
            }
        });
    }

    if (path === '/about' || path === '/about.html' || path === '/pages/legal/about.html') {
        injectJsonLd({
            '@context': 'https://schema.org',
            '@type': 'AboutPage',
            'name': 'About GroupsMix',
            'url': 'https://groupsmix.com/about',
            'mainEntity': {
                '@type': 'Organization',
                'name': 'GroupsMix'
            }
        });
    }

    if (path === '/search' || path === '/search.html') {
        // SearchResultsPage schema
        injectJsonLd({
            '@context': 'https://schema.org',
            '@type': 'SearchResultsPage',
            'name': 'Search Groups | GroupsMix',
            'url': 'https://groupsmix.com/search'
        });
    }

    // ─── Lazy Loading for Images ───────────────────────────────
    // Add loading="lazy" to all existing images that don't have it
    // and set up a MutationObserver for dynamically added images
    function applyLazyLoading() {
        var images = document.querySelectorAll('img:not([loading])');
        for (var i = 0; i < images.length; i++) {
            images[i].setAttribute('loading', 'lazy');
        }
    }

    // Apply on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyLazyLoading);
    } else {
        applyLazyLoading();
    }

    // Watch for dynamically added images
    if (typeof MutationObserver !== 'undefined') {
        var observer = new MutationObserver(function (mutations) {
            var hasNewImages = false;
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    if (added[j].nodeType === 1) {
                        if (added[j].tagName === 'IMG' || (added[j].querySelectorAll && added[j].querySelectorAll('img').length)) {
                            hasNewImages = true;
                            break;
                        }
                    }
                }
                if (hasNewImages) break;
            }
            if (hasNewImages) applyLazyLoading();
        });
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                observer.observe(document.body, { childList: true, subtree: true });
            });
        } else {
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

})();
