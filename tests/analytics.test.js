import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const analyticsSrc = readFileSync(
    join(__dirname, '../public/assets/js/shared/analytics.js'),
    'utf8'
);

/**
 * Build a minimal stub `window` good enough to load analytics.js in a
 * fresh vm context. Each call returns a new object so tests don't share
 * state; pass `opts` to toggle DNT / cookie consent / missing config.
 */
function makeWindow(opts = {}) {
    const createdScripts = [];
    const docHead = {
        appendChild: vi.fn((el) => createdScripts.push(el))
    };
    const document = {
        createElement: vi.fn((tag) => {
            // Minimal element stub; onload/onerror handlers are attached
            // directly by the loader.
            return {
                tagName: String(tag).toUpperCase(),
                attributes: {},
                setAttribute(name, value) { this.attributes[name] = String(value); },
                getAttribute(name) { return this.attributes[name]; }
            };
        }),
        head: docHead,
        // `shared/analytics.js` uses document.querySelector to dedupe the
        // script tag. Returning null on first load, then the stub once the
        // loader has appended it.
        querySelector: vi.fn(() => {
            for (const s of createdScripts) {
                if (s && s.attributes && s.attributes['data-gm-analytics'] === 'plausible') {
                    return s;
                }
            }
            return null;
        })
    };

    const navigator = {};
    if (opts.dnt !== undefined) navigator.doNotTrack = opts.dnt;

    const safeStorageData = new Map();
    if (opts.cookieConsent !== undefined) {
        safeStorageData.set('gm_cookie_consent', opts.cookieConsent);
    }

    const window = {
        document,
        navigator,
        SafeStorage: {
            get: vi.fn((k) => safeStorageData.has(k) ? safeStorageData.get(k) : null)
        },
        ANALYTICS_CONFIG: Object.prototype.hasOwnProperty.call(opts, 'config')
            ? opts.config
            : { plausible: { domain: 'example.com', src: 'https://plausible.io/js/script.js' } },
        plausible: opts.plausible
    };
    // Make `window` self-referential the way browsers do so the loader's
    // `typeof window !== 'undefined' ? window : undefined` branch picks it.
    window.window = window;

    // vm contexts require the object to BE the global; the loader reads
    // `global` / `window` interchangeably depending on the IIFE argument.
    vm.createContext(window);
    // Execute. The loader installs `window.gmAnalytics`.
    vm.runInContext(analyticsSrc, window);

    return { window, createdScripts, docHead };
}

describe('shared/analytics.js', () => {
    describe('disabled paths', () => {
        it('installs a no-op gmAnalytics when ANALYTICS_CONFIG is missing', () => {
            const { window, createdScripts } = makeWindow({ config: undefined });
            // Still exposes the API so callers don't have to feature-detect.
            expect(window.gmAnalytics).toBeDefined();
            expect(typeof window.gmAnalytics.track).toBe('function');
            expect(window.gmAnalytics.isEnabled()).toBe(false);
            expect(createdScripts).toHaveLength(0);
            // track() must not throw and must not queue when disabled.
            window.gmAnalytics.track('noop');
        });

        it('is disabled when plausible.domain is empty', () => {
            const { window, createdScripts } = makeWindow({
                config: { plausible: { domain: '', src: 'https://plausible.io/s.js' } }
            });
            expect(window.gmAnalytics.isEnabled()).toBe(false);
            expect(createdScripts).toHaveLength(0);
        });

        it('is disabled when navigator.doNotTrack is "1"', () => {
            const { window, createdScripts } = makeWindow({ dnt: '1' });
            expect(window.gmAnalytics.isEnabled()).toBe(false);
            expect(createdScripts).toHaveLength(0);
        });

        it('is disabled when navigator.doNotTrack is "yes"', () => {
            const { window, createdScripts } = makeWindow({ dnt: 'yes' });
            expect(window.gmAnalytics.isEnabled()).toBe(false);
            expect(createdScripts).toHaveLength(0);
        });

        it('is disabled when cookie consent is rejected', () => {
            const { window, createdScripts } = makeWindow({ cookieConsent: 'rejected' });
            expect(window.gmAnalytics.isEnabled()).toBe(false);
            expect(createdScripts).toHaveLength(0);
        });
    });

    describe('enabled path', () => {
        it('injects the plausible script with the configured domain and src', () => {
            const { createdScripts } = makeWindow({
                config: { plausible: { domain: 'groupsmix.com', src: 'https://plausible.io/js/script.outbound-links.tagged-events.js' } }
            });
            expect(createdScripts).toHaveLength(1);
            const script = createdScripts[0];
            expect(script.src).toBe('https://plausible.io/js/script.outbound-links.tagged-events.js');
            expect(script.defer).toBe(true);
            expect(script.getAttribute('data-domain')).toBe('groupsmix.com');
            expect(script.getAttribute('data-gm-analytics')).toBe('plausible');
            expect(typeof script.onload).toBe('function');
            expect(typeof script.onerror).toBe('function');
        });

        it('is enabled when consent is accepted (not rejected)', () => {
            const { window, createdScripts } = makeWindow({ cookieConsent: 'accepted' });
            expect(window.gmAnalytics.isEnabled()).toBe(true);
            expect(createdScripts).toHaveLength(1);
        });

        it('is enabled when consent has not been chosen yet (null)', () => {
            const { window, createdScripts } = makeWindow({});
            expect(window.gmAnalytics.isEnabled()).toBe(true);
            expect(createdScripts).toHaveLength(1);
        });

        it('tolerates a missing SafeStorage shim', () => {
            const analyticsSrcLocal = analyticsSrc;
            const window = {
                document: {
                    createElement: vi.fn(() => ({ setAttribute() {}, getAttribute() { return null; } })),
                    head: { appendChild: vi.fn() },
                    querySelector: vi.fn(() => null)
                },
                navigator: {},
                ANALYTICS_CONFIG: { plausible: { domain: 'x.com' } }
            };
            window.window = window;
            vm.createContext(window);
            vm.runInContext(analyticsSrcLocal, window);
            expect(window.gmAnalytics.isEnabled()).toBe(true);
        });
    });

    describe('track()', () => {
        it('queues events until plausible loads, then flushes on script load', () => {
            const { window, createdScripts } = makeWindow({});
            window.gmAnalytics.track('page_view');
            window.gmAnalytics.track('click_signup', { button: 'hero' });

            // Plausible has not loaded yet — calls are queued, not
            // forwarded anywhere, and track() must not throw.
            expect(window.plausible).toBeUndefined();

            // Simulate plausible finishing load: install the stub and fire
            // the onload handler the loader attached.
            const plausibleStub = vi.fn();
            window.plausible = plausibleStub;
            createdScripts[0].onload();

            expect(plausibleStub).toHaveBeenCalledTimes(2);
            expect(plausibleStub).toHaveBeenNthCalledWith(1, 'page_view', undefined);
            expect(plausibleStub).toHaveBeenNthCalledWith(2, 'click_signup', { props: { button: 'hero' } });
        });

        it('forwards to window.plausible directly once loaded', () => {
            const plausibleStub = vi.fn();
            const { window } = makeWindow({ plausible: plausibleStub });
            window.gmAnalytics.track('instant', { x: 1 });
            expect(plausibleStub).toHaveBeenCalledWith('instant', { props: { x: 1 } });
        });

        it('ignores falsy / non-string event names', () => {
            const plausibleStub = vi.fn();
            const { window } = makeWindow({ plausible: plausibleStub });
            window.gmAnalytics.track('');
            window.gmAnalytics.track(null);
            window.gmAnalytics.track(undefined);
            window.gmAnalytics.track(42);
            expect(plausibleStub).not.toHaveBeenCalled();
        });

        it('drops events silently when plausible throws', () => {
            const plausibleStub = vi.fn(() => { throw new Error('blocked'); });
            const { window } = makeWindow({ plausible: plausibleStub });
            // Must not throw — a broken telemetry pipeline must not break
            // the caller.
            expect(() => window.gmAnalytics.track('evt')).not.toThrow();
        });

        it('drops pre-load events if the script errors out', () => {
            const { window, createdScripts } = makeWindow({});
            window.gmAnalytics.track('before_error');
            createdScripts[0].onerror();
            // After onerror, plausible never arrives; installing it later
            // and firing onload isn't the path here, but track() must not
            // resurrect or throw.
            expect(() => window.gmAnalytics.track('after_error')).not.toThrow();
        });
    });

    describe('dedupe', () => {
        it('does not inject the script twice when loaded against a pre-existing tag', () => {
            // First load installs the tag.
            const first = makeWindow({});
            expect(first.createdScripts).toHaveLength(1);

            // Reuse the same document / window and re-run the script to
            // simulate a page where BaseLayout somehow ended up included
            // twice. We rerun by creating a fresh vm context that mirrors
            // the first but also seeds `gmAnalytics.__initialized=false`
            // so the top-of-IIFE guard doesn't short-circuit.
            first.window.gmAnalytics.__initialized = false;
            vm.runInContext(analyticsSrc, first.window);

            // Still one script — the `data-gm-analytics="plausible"`
            // selector guard kicked in.
            expect(first.createdScripts).toHaveLength(1);
        });
    });
});
