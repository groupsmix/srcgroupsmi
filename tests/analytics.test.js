import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configSrc = readFileSync(
    join(__dirname, '../public/assets/js/shared/observability-config.js'),
    'utf8'
);
const analyticsSrc = readFileSync(
    join(__dirname, '../public/assets/js/shared/analytics.js'),
    'utf8'
);

/**
 * Build a minimal DOM-ish sandbox that exposes just enough of `window` to
 * let analytics.js run. The loader is pure-browser code; running it under
 * Node with a stub document keeps the test free of jsdom.
 */
function makeSandbox({ navigator, config, pathname = '/', cookieConsent } = {}) {
    const appended = [];
    const document = {
        createElement: (tag) => {
            const el = {
                tagName: String(tag).toUpperCase(),
                _attrs: {},
                setAttribute(k, v) { this._attrs[k] = v; },
                getAttribute(k) { return this._attrs[k]; }
            };
            return el;
        },
        head: {
            appendChild: (el) => {
                appended.push(el);
                return el;
            }
        }
    };
    const sandbox = {
        document,
        navigator: navigator || { doNotTrack: null },
        location: { pathname },
        PLAUSIBLE_CONFIG: config,
        __gm_cookie_consent: cookieConsent,
        plausible: undefined,
        posthog: undefined,
        GMAnalytics: undefined
    };
    // analytics.js accesses `global` via `typeof window !== 'undefined' ? window : undefined`
    sandbox.window = sandbox;
    return { sandbox, appended };
}

function loadInto(sandbox) {
    // observability-config.js seeds empty PLAUSIBLE_CONFIG IF the caller
    // didn't already set one. The sandbox mimics the browser where the
    // IIFE checks `typeof window !== 'undefined'` — vm gives us a context
    // that works the same way when we alias sandbox.window = sandbox.
    vm.createContext(sandbox);
    vm.runInContext(configSrc, sandbox);
    vm.runInContext(analyticsSrc, sandbox);
}

describe('analytics.js loader', () => {
    it('is inert when PLAUSIBLE_CONFIG is not set', () => {
        const { sandbox, appended } = makeSandbox({ config: undefined });
        // Override the seed so we actually test the "no config" branch:
        // after the seed runs PLAUSIBLE_CONFIG is {}, with empty domain,
        // which is still inert.
        loadInto(sandbox);
        expect(sandbox.GMAnalytics).toBeUndefined();
        expect(appended).toHaveLength(0);
    });

    it('is inert when PLAUSIBLE_CONFIG.domain is empty', () => {
        const { sandbox, appended } = makeSandbox({ config: { domain: '' } });
        loadInto(sandbox);
        expect(sandbox.GMAnalytics).toBeUndefined();
        expect(appended).toHaveLength(0);
    });

    it('is inert when DoNotTrack is "1"', () => {
        const { sandbox, appended } = makeSandbox({
            config: { domain: 'groupsmix.com' },
            navigator: { doNotTrack: '1' }
        });
        loadInto(sandbox);
        expect(sandbox.GMAnalytics).toBeUndefined();
        expect(appended).toHaveLength(0);
    });

    it('is inert when navigator.msDoNotTrack is "1"', () => {
        const { sandbox, appended } = makeSandbox({
            config: { domain: 'groupsmix.com' },
            navigator: { doNotTrack: null, msDoNotTrack: '1' }
        });
        loadInto(sandbox);
        expect(sandbox.GMAnalytics).toBeUndefined();
        expect(appended).toHaveLength(0);
    });

    it('is inert on admin paths (/gm-ctrl*)', () => {
        const { sandbox, appended } = makeSandbox({
            config: { domain: 'groupsmix.com' },
            pathname: '/gm-ctrl-x7/panel'
        });
        loadInto(sandbox);
        expect(sandbox.GMAnalytics).toBeUndefined();
        expect(appended).toHaveLength(0);
    });

    it('is inert when cookie consent has been explicitly denied', () => {
        const { sandbox, appended } = makeSandbox({
            config: { domain: 'groupsmix.com' },
            cookieConsent: false
        });
        loadInto(sandbox);
        expect(sandbox.GMAnalytics).toBeUndefined();
        expect(appended).toHaveLength(0);
    });

    it('loads the Plausible script tag with data-domain when configured', () => {
        const { sandbox, appended } = makeSandbox({
            config: { domain: 'groupsmix.com' }
        });
        loadInto(sandbox);
        expect(appended).toHaveLength(1);
        expect(appended[0].tagName).toBe('SCRIPT');
        expect(appended[0].src).toBe('https://plausible.io/js/script.js');
        expect(appended[0].getAttribute('data-domain')).toBe('groupsmix.com');
        expect(appended[0].defer).toBe(true);
    });

    it('honours a custom apiHost for self-hosted Plausible', () => {
        const { sandbox, appended } = makeSandbox({
            config: { domain: 'groupsmix.com', apiHost: 'https://plausible.example.com/' }
        });
        loadInto(sandbox);
        expect(appended[0].src).toBe('https://plausible.example.com/js/script.js');
    });

    it('exposes a track() API that queues calls before the script loads', () => {
        const { sandbox, appended } = makeSandbox({
            config: { domain: 'groupsmix.com' }
        });
        loadInto(sandbox);
        expect(sandbox.GMAnalytics).toBeDefined();
        expect(sandbox.GMAnalytics.isReady()).toBe(false);

        // Track before onload — should not throw and should not call plausible.
        sandbox.GMAnalytics.track('Signed up', { plan: 'pro' });
        expect(sandbox.plausible).toBeUndefined();

        // Simulate Plausible having loaded and exposed the `plausible` fn.
        const plausible = vi.fn();
        sandbox.plausible = plausible;
        appended[0].onload();

        expect(sandbox.GMAnalytics.isReady()).toBe(true);
        // Queue was flushed with the queued call.
        expect(plausible).toHaveBeenCalledWith('Signed up', { props: { plan: 'pro' } });
    });

    it('replays queued events in order', () => {
        const { sandbox, appended } = makeSandbox({
            config: { domain: 'groupsmix.com' }
        });
        loadInto(sandbox);
        sandbox.GMAnalytics.track('a', { n: 1 });
        sandbox.GMAnalytics.track('b', { n: 2 });
        sandbox.GMAnalytics.track('c', { n: 3 });

        const plausible = vi.fn();
        sandbox.plausible = plausible;
        appended[0].onload();

        expect(plausible).toHaveBeenCalledTimes(3);
        expect(plausible.mock.calls[0][0]).toBe('a');
        expect(plausible.mock.calls[1][0]).toBe('b');
        expect(plausible.mock.calls[2][0]).toBe('c');
    });

    it('track() ignores non-string event names', () => {
        const { sandbox, appended } = makeSandbox({
            config: { domain: 'groupsmix.com' }
        });
        loadInto(sandbox);
        sandbox.GMAnalytics.track('');
        sandbox.GMAnalytics.track(null);
        sandbox.GMAnalytics.track(42);

        const plausible = vi.fn();
        sandbox.plausible = plausible;
        appended[0].onload();
        expect(plausible).not.toHaveBeenCalled();
    });

    it('swallows errors from the provider so analytics cannot break the app', () => {
        const { sandbox, appended } = makeSandbox({
            config: { domain: 'groupsmix.com' }
        });
        loadInto(sandbox);
        sandbox.GMAnalytics.track('Signed up');
        sandbox.plausible = () => { throw new Error('broken'); };
        // Must not throw.
        expect(() => appended[0].onload()).not.toThrow();
    });

    it('drops queued events when the Plausible script fails to load', () => {
        const { sandbox, appended } = makeSandbox({
            config: { domain: 'groupsmix.com' }
        });
        loadInto(sandbox);
        sandbox.GMAnalytics.track('lost');
        appended[0].onerror();
        // isReady() stays false; further tracks still queue but the
        // important invariant is that the error didn't throw.
        expect(sandbox.GMAnalytics.isReady()).toBe(false);
    });

    it('supports PostHog as an alternate provider', () => {
        const { sandbox, appended } = makeSandbox({
            config: {
                provider: 'posthog',
                apiKey: 'phc_test_key',
                apiHost: 'https://eu.posthog.com'
            }
        });
        loadInto(sandbox);
        expect(appended[0].src).toBe('https://eu.posthog.com/array.js');
        expect(sandbox.GMAnalytics._provider).toBe('posthog');

        sandbox.GMAnalytics.track('Viewed page', { path: '/' });
        const capture = vi.fn();
        sandbox.posthog = { init: vi.fn(), capture };
        appended[0].onload();
        expect(sandbox.posthog.init).toHaveBeenCalledWith(
            'phc_test_key',
            expect.objectContaining({ api_host: 'https://eu.posthog.com' })
        );
        expect(capture).toHaveBeenCalledWith('Viewed page', { path: '/' });
    });

    it('PostHog provider is inert without an apiKey', () => {
        const { sandbox, appended } = makeSandbox({
            config: { provider: 'posthog', apiHost: 'https://eu.posthog.com' }
        });
        loadInto(sandbox);
        expect(appended).toHaveLength(0);
        expect(sandbox.GMAnalytics).toBeUndefined();
    });
});

describe('observability-config.js seed', () => {
    it('seeds empty SENTRY_CONFIG and PLAUSIBLE_CONFIG globals', () => {
        const sandbox = { document: { createElement: () => ({}), head: { appendChild: () => {} } } };
        sandbox.window = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(configSrc, sandbox);
        expect(sandbox.SENTRY_CONFIG).toEqual({
            dsn: '',
            environment: 'production',
            release: '',
            tracesSampleRate: 0
        });
        expect(sandbox.PLAUSIBLE_CONFIG).toEqual({
            domain: '',
            apiHost: 'https://plausible.io'
        });
    });

    it('does not overwrite a pre-existing config', () => {
        const sandbox = {
            document: { createElement: () => ({}), head: { appendChild: () => {} } },
            SENTRY_CONFIG: { dsn: 'https://a@b/1' },
            PLAUSIBLE_CONFIG: { domain: 'pre.example' }
        };
        sandbox.window = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(configSrc, sandbox);
        expect(sandbox.SENTRY_CONFIG).toEqual({ dsn: 'https://a@b/1' });
        expect(sandbox.PLAUSIBLE_CONFIG).toEqual({ domain: 'pre.example' });
    });
});
