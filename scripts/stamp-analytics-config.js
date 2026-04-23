/**
 * stamp-analytics-config.js — Inject Plausible analytics config into the
 * built analytics-config.js so different environments can target
 * different Plausible sites (or disable analytics entirely) without
 * editing source.
 *
 * Run after `astro build`.
 *
 * Source env vars:
 *   PUBLIC_PLAUSIBLE_DOMAIN — Plausible site identifier (e.g. "groupsmix.com")
 *   PUBLIC_PLAUSIBLE_SRC    — Optional override for the Plausible script URL
 *                             (useful for proxied setups); falls back to the
 *                             default already written in source.
 *
 * If no env vars are set the file is left untouched (source default is an
 * empty domain, which makes shared/analytics.js a no-op) so local dev and
 * preview deploys keep working.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const distFile = join(process.cwd(), 'dist', 'assets', 'js', 'shared', 'analytics-config.js');

if (!existsSync(distFile)) {
    console.log('stamp-analytics-config: dist/assets/js/shared/analytics-config.js not found — skipping.');
    process.exit(0);
}

const domain = process.env.PUBLIC_PLAUSIBLE_DOMAIN || '';
const src = process.env.PUBLIC_PLAUSIBLE_SRC || '';

if (!domain && !src) {
    console.log('stamp-analytics-config: no PUBLIC_PLAUSIBLE_DOMAIN / PUBLIC_PLAUSIBLE_SRC — leaving defaults.');
    process.exit(0);
}

const source = readFileSync(distFile, 'utf8');

// Strict regexes targeting only the two known quoted fields.
const domainRe = /(domain:\s*)'[^']*'/;
const srcRe = /(src:\s*)'[^']*'/;

if (!domainRe.test(source) || !srcRe.test(source)) {
    console.warn('stamp-analytics-config: expected fields not found in built file; skipping.');
    process.exit(0);
}

// Sanity-check the domain to avoid pushing garbage into the built file.
// Plausible site identifiers are hostnames (lowercase letters, digits,
// dots, and hyphens), no scheme and no path.
if (domain && !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(domain)) {
    console.error(`stamp-analytics-config: PUBLIC_PLAUSIBLE_DOMAIN "${domain}" is not a valid hostname; aborting.`);
    process.exit(1);
}

// If src is overridden, require https:// — Plausible only serves the
// script over TLS and loading it from plain HTTP would mixed-content-
// block in every modern browser.
if (src && !/^https:\/\/[^\s'"]+$/.test(src)) {
    console.error(`stamp-analytics-config: PUBLIC_PLAUSIBLE_SRC "${src}" is not an https:// URL; aborting.`);
    process.exit(1);
}

let out = source;
if (domain) out = out.replace(domainRe, `$1'${domain}'`);
if (src) out = out.replace(srcRe, `$1'${src}'`);

writeFileSync(distFile, out, 'utf8');
console.log(
    'stamp-analytics-config: injected' +
    (domain ? ' PUBLIC_PLAUSIBLE_DOMAIN' : '') +
    (src ? ' PUBLIC_PLAUSIBLE_SRC' : '')
);
