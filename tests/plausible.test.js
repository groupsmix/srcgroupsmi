/**
 * Behavioural tests for public/assets/js/shared/plausible.js.
 *
 * The loader runs once at module evaluation time against the `window`
 * global it is passed, so each test builds a fresh fake `window` and
 * re-evaluates the file in-process via `vm`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const loaderPath = join(here, '..', 'public', 'assets', 'js', 'shared', 'plausible.js');
const loaderSource = readFileSync(loaderPath, 'utf8');

function makeFakeWindow(overrides) {
    const appended = [];
    const fakeWindow = {
        document: {
            head: {
                appendChild(node) { appended.push(node); return node; }
            },
            createElement(_tag) {
                return {
                    attributes: {},
                    setAttribute(k, v) { this.attributes[k] = v; },
                    set src(v) { this._src = v; },
                    get src() { return this._src; },
                    set defer(v) { this._defer = v; },
                    get defer() { return this._defer; },
                    set async(v) { this._async = v; },
                    get async() { return this._async; },
                    onerror: null
                };
            }
        },
        location: { pathname: '/' },
        navigator: { doNotTrack: '0' },
        localStorage: null,
        ...overrides
    };
    fakeWindow.appended = appended;
    return fakeWindow;
}

function runLoader(fakeWindow) {
    // Re-evaluate the IIFE in a fresh context, passing the fake window.
    const ctx = { window: fakeWindow };
    runInNewContext(loaderSource, ctx);
}

describe('plausible loader', () => {
    it('is a no-op when PLAUSIBLE_CONFIG is absent', () => {
        const win = makeFakeWindow();
        runLoader(win);
        expect(win.appended).toHaveLength(0);
        expect(win.plausible).toBeUndefined();
    });

    it('is a no-op when domain is empty', () => {
        const win = makeFakeWindow({ PLAUSIBLE_CONFIG: { domain: '' } });
        runLoader(win);
        expect(win.appended).toHaveLength(0);
    });

    it('is a no-op when DNT is enabled', () => {
        const win = makeFakeWindow({
            PLAUSIBLE_CONFIG: { domain: 'groupsmix.com' },
            navigator: { doNotTrack: '1' }
        });
        runLoader(win);
        expect(win.appended).toHaveLength(0);
    });

    it('is a no-op on admin routes', () => {
        const win = makeFakeWindow({
            PLAUSIBLE_CONFIG: { domain: 'groupsmix.com' },
            location: { pathname: '/gm-ctrl-x7' }
        });
        runLoader(win);
        expect(win.appended).toHaveLength(0);
    });

    it('is a no-op when the user has opted out via localStorage', () => {
        const store = { 'gm-analytics-optout': '1' };
        const win = makeFakeWindow({
            PLAUSIBLE_CONFIG: { domain: 'groupsmix.com' },
            localStorage: { getItem(k) { return store[k] ?? null; } }
        });
        runLoader(win);
        expect(win.appended).toHaveLength(0);
    });

    it('appends the Plausible script with data-domain when configured', () => {
        const win = makeFakeWindow({
            PLAUSIBLE_CONFIG: {
                domain: 'groupsmix.com',
                apiHost: 'https://plausible.io',
                scriptVariant: 'script.outbound-links.js'
            }
        });
        runLoader(win);
        expect(win.appended).toHaveLength(1);
        const script = win.appended[0];
        expect(script.src).toBe('https://plausible.io/js/script.outbound-links.js');
        expect(script.attributes['data-domain']).toBe('groupsmix.com');
        expect(script.attributes['data-api']).toBe('https://plausible.io/api/event');
        expect(typeof win.plausible).toBe('function');
    });

    it('queues events fired before the CDN script loads', () => {
        const win = makeFakeWindow({
            PLAUSIBLE_CONFIG: { domain: 'groupsmix.com' }
        });
        runLoader(win);
        win.plausible('Signup', { props: { plan: 'pro' } });
        expect(win.plausible.q).toHaveLength(1);
        const queued = Array.from(win.plausible.q[0]);
        expect(queued).toEqual(['Signup', { props: { plan: 'pro' } }]);
    });

    it('honors a custom apiHost', () => {
        const win = makeFakeWindow({
            PLAUSIBLE_CONFIG: {
                domain: 'groupsmix.com',
                apiHost: 'https://pl.groupsmix.com/'
            }
        });
        runLoader(win);
        const script = win.appended[0];
        expect(script.src).toBe('https://pl.groupsmix.com/js/script.js');
        expect(script.attributes['data-api']).toBe('https://pl.groupsmix.com/api/event');
    });

    it('does not double-initialize on repeat invocations', () => {
        const win = makeFakeWindow({
            PLAUSIBLE_CONFIG: { domain: 'groupsmix.com' }
        });
        runLoader(win);
        runLoader(win);
        expect(win.appended).toHaveLength(1);
    });
});
