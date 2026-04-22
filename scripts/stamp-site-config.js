/**
 * stamp-site-config.js — Inject PUBLIC_* observability + analytics config
 * into the built `site-config.js` so different environments (preview,
 * staging, production) can ship different Sentry / Plausible / env values
 * without editing source.
 *
 * Run after `astro build`.
 *
 * Source env vars:
 *   PUBLIC_SENTRY_DSN
 *   PUBLIC_SENTRY_RELEASE
 *   PUBLIC_ENVIRONMENT
 *   PUBLIC_SENTRY_TRACES_SAMPLE_RATE  (optional, float 0–1)
 *   PUBLIC_PLAUSIBLE_DOMAIN
 *   PUBLIC_PLAUSIBLE_HOST             (optional, defaults to https://plausible.io)
 *   PUBLIC_PLAUSIBLE_VARIANT          (optional, e.g. `script.outbound-links.js`)
 *
 * If no env var is set the file is left untouched (source defaults hold)
 * and the corresponding loaders remain inert.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const distFile = join(process.cwd(), 'dist', 'assets', 'js', 'site-config.js');

if (!existsSync(distFile)) {
    console.log('stamp-site-config: dist/assets/js/site-config.js not found — skipping.');
    process.exit(0);
}

const src = readFileSync(distFile, 'utf8');

const replacements = [];

function pushReplacement(re, label, nextValue) {
    if (!re.test(src)) {
        console.warn(`stamp-site-config: expected ${label} constant not found; leaving as-is.`);
        return;
    }
    replacements.push({ re, nextValue });
}

const sentryDsn = process.env.PUBLIC_SENTRY_DSN || '';
if (sentryDsn && !/^https:\/\/[A-Za-z0-9_-]+@[A-Za-z0-9.-]+\/\d+$/.test(sentryDsn)) {
    console.error(`stamp-site-config: PUBLIC_SENTRY_DSN "${sentryDsn}" does not look like a Sentry DSN; aborting.`);
    process.exit(1);
}

const sentryEnv = process.env.PUBLIC_ENVIRONMENT || 'production';
const sentryRelease = process.env.PUBLIC_SENTRY_RELEASE || '';
const sentryTraces = parseFloat(process.env.PUBLIC_SENTRY_TRACES_SAMPLE_RATE || '0');
if (Number.isNaN(sentryTraces) || sentryTraces < 0 || sentryTraces > 1) {
    console.error('stamp-site-config: PUBLIC_SENTRY_TRACES_SAMPLE_RATE must be between 0 and 1; aborting.');
    process.exit(1);
}

pushReplacement(
    /global\.SENTRY_CONFIG = \{[\s\S]*?\};/,
    'SENTRY_CONFIG',
    'global.SENTRY_CONFIG = {\n' +
        `        dsn: '${sentryDsn}',\n` +
        `        environment: '${sentryEnv}',\n` +
        `        release: '${sentryRelease}',\n` +
        `        tracesSampleRate: ${sentryTraces}\n` +
        '    };'
);

const plausibleDomain = process.env.PUBLIC_PLAUSIBLE_DOMAIN || '';
if (plausibleDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(plausibleDomain)) {
    console.error(`stamp-site-config: PUBLIC_PLAUSIBLE_DOMAIN "${plausibleDomain}" does not look like a hostname; aborting.`);
    process.exit(1);
}
const plausibleHost = process.env.PUBLIC_PLAUSIBLE_HOST || 'https://plausible.io';
if (plausibleHost && !/^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(plausibleHost)) {
    console.error(`stamp-site-config: PUBLIC_PLAUSIBLE_HOST "${plausibleHost}" is not a valid http(s) origin; aborting.`);
    process.exit(1);
}
const plausibleVariant = process.env.PUBLIC_PLAUSIBLE_VARIANT || 'script.outbound-links.js';
if (!/^[A-Za-z0-9._-]+\.js$/.test(plausibleVariant)) {
    console.error(`stamp-site-config: PUBLIC_PLAUSIBLE_VARIANT "${plausibleVariant}" is not a safe filename; aborting.`);
    process.exit(1);
}

pushReplacement(
    /global\.PLAUSIBLE_CONFIG = \{[\s\S]*?\};/,
    'PLAUSIBLE_CONFIG',
    'global.PLAUSIBLE_CONFIG = {\n' +
        `        domain: '${plausibleDomain}',\n` +
        `        apiHost: '${plausibleHost}',\n` +
        `        scriptVariant: '${plausibleVariant}'\n` +
        '    };'
);

pushReplacement(
    /global\.GM_ENV = '[^']*';/,
    'GM_ENV',
    `global.GM_ENV = '${sentryEnv}';`
);

let out = src;
for (const { re, nextValue } of replacements) {
    out = out.replace(re, nextValue);
}

writeFileSync(distFile, out, 'utf8');
console.log(
    'stamp-site-config: injected' +
    (sentryDsn ? ' SENTRY_DSN' : '') +
    (plausibleDomain ? ' PLAUSIBLE_DOMAIN' : '') +
    ` environment=${sentryEnv}`
);
