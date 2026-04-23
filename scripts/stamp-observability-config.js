/**
 * stamp-observability-config.js — Inject Sentry + Plausible config into
 * the built observability-config.js so different environments (preview,
 * staging, prod) can target different DSNs / analytics domains without
 * editing source.
 *
 * Run after `astro build`.
 *
 * Source values:
 *   PUBLIC_SENTRY_DSN
 *   PUBLIC_SENTRY_RELEASE
 *   PUBLIC_ENVIRONMENT
 *   PUBLIC_PLAUSIBLE_DOMAIN
 *   PUBLIC_PLAUSIBLE_API_HOST   (optional — defaults to https://plausible.io)
 *
 * If no env var is set the file is left untouched (source defaults hold),
 * so local dev and existing deployments keep working without analytics.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const distFile = join(process.cwd(), 'dist', 'assets', 'js', 'shared', 'observability-config.js');

if (!existsSync(distFile)) {
    console.log('stamp-observability-config: dist/assets/js/shared/observability-config.js not found — skipping.');
    process.exit(0);
}

const sentryDsn = process.env.PUBLIC_SENTRY_DSN || '';
const sentryRelease = process.env.PUBLIC_SENTRY_RELEASE || '';
const environment = process.env.PUBLIC_ENVIRONMENT || '';
const plausibleDomain = process.env.PUBLIC_PLAUSIBLE_DOMAIN || '';
const plausibleApiHost = process.env.PUBLIC_PLAUSIBLE_API_HOST || '';

if (!sentryDsn && !plausibleDomain && !sentryRelease && !environment && !plausibleApiHost) {
    console.log('stamp-observability-config: no PUBLIC_SENTRY_DSN / PUBLIC_PLAUSIBLE_DOMAIN in env — leaving defaults.');
    process.exit(0);
}

const src = readFileSync(distFile, 'utf8');

// Strict validation — we refuse to ship garbage into the build. The
// regexes match the shape of a real DSN / domain; anything malformed
// aborts the build so the operator sees the typo in CI rather than in
// production.
if (sentryDsn && !/^https:\/\/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\/\d+$/.test(sentryDsn)) {
    console.error(`stamp-observability-config: PUBLIC_SENTRY_DSN "${sentryDsn}" does not look like a Sentry DSN; aborting.`);
    process.exit(1);
}
if (plausibleDomain && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(plausibleDomain)) {
    console.error(`stamp-observability-config: PUBLIC_PLAUSIBLE_DOMAIN "${plausibleDomain}" is not a valid domain; aborting.`);
    process.exit(1);
}
if (plausibleApiHost && !/^https:\/\/[a-z0-9.-]+(:\d+)?(\/.*)?$/i.test(plausibleApiHost)) {
    console.error(`stamp-observability-config: PUBLIC_PLAUSIBLE_API_HOST "${plausibleApiHost}" is not a valid https URL; aborting.`);
    process.exit(1);
}

function escapeJsString(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Build the object literals we want to stamp in place. These replace the
// empty-default `window.SENTRY_CONFIG = { ... };` and
// `window.PLAUSIBLE_CONFIG = { ... };` blocks emitted by the source file.
const sentryBlock =
    `global.SENTRY_CONFIG = {\n` +
    `            dsn: '${escapeJsString(sentryDsn)}',\n` +
    `            environment: '${escapeJsString(environment || 'production')}',\n` +
    `            release: '${escapeJsString(sentryRelease)}',\n` +
    `            tracesSampleRate: 0\n` +
    `        };`;

const plausibleBlock =
    `global.PLAUSIBLE_CONFIG = {\n` +
    `            domain: '${escapeJsString(plausibleDomain)}',\n` +
    `            apiHost: '${escapeJsString(plausibleApiHost || 'https://plausible.io')}'\n` +
    `        };`;

const sentryRe = /global\.SENTRY_CONFIG = \{[\s\S]*?\};/;
const plausibleRe = /global\.PLAUSIBLE_CONFIG = \{[\s\S]*?\};/;

if (!sentryRe.test(src) || !plausibleRe.test(src)) {
    console.warn('stamp-observability-config: expected config blocks not found in built file; skipping.');
    process.exit(0);
}

let out = src;
out = out.replace(sentryRe, sentryBlock);
out = out.replace(plausibleRe, plausibleBlock);

writeFileSync(distFile, out, 'utf8');

const stamped = [
    sentryDsn && 'SENTRY_DSN',
    sentryRelease && 'SENTRY_RELEASE',
    environment && 'ENVIRONMENT',
    plausibleDomain && 'PLAUSIBLE_DOMAIN',
    plausibleApiHost && 'PLAUSIBLE_API_HOST'
].filter(Boolean);
console.log('stamp-observability-config: injected ' + stamped.join(', '));
