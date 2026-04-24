import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const distFile = join(process.cwd(), 'dist', 'assets', 'js', 'head-scripts.js');

if (!existsSync(distFile)) {
    console.log('stamp-head-scripts: dist/assets/js/head-scripts.js not found — skipping.');
    process.exit(0);
}

const ga4Id = process.env.PUBLIC_GA4_ID || '';
const sentryDsn = process.env.PUBLIC_SENTRY_DSN || '';

if (!ga4Id && !sentryDsn) {
    console.log('stamp-head-scripts: no PUBLIC_GA4_ID / PUBLIC_SENTRY_DSN — leaving defaults.');
    process.exit(0);
}

let source = readFileSync(distFile, 'utf8');

if (ga4Id) {
    source = source.replace(/var GA4_ID = 'G-XXXXXXXXXX';/, `var GA4_ID = '${ga4Id}';`);
}

if (sentryDsn) {
    source = source.replace(/var SENTRY_DSN = '';/, `var SENTRY_DSN = '${sentryDsn}';`);
}

writeFileSync(distFile, source, 'utf8');
console.log('stamp-head-scripts: injected ' + (ga4Id ? 'PUBLIC_GA4_ID ' : '') + (sentryDsn ? 'PUBLIC_SENTRY_DSN ' : ''));
