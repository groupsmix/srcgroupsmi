import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const distFile = join(process.cwd(), 'dist', 'assets', 'js', 'head-scripts.js');

if (!existsSync(distFile)) {
    console.warn('verify-stamped-config: head-scripts.js not found. Skipping verification.');
    process.exit(0);
}

const content = readFileSync(distFile, 'utf8');

if (content.includes('G-XXXXXXXXXX') || content.includes("var SENTRY_DSN = '';")) {
    console.error('::error::verify-stamped-config: Found unstamped GA4_ID or SENTRY_DSN in dist/assets/js/head-scripts.js. Production builds must provide PUBLIC_GA4_ID and PUBLIC_SENTRY_DSN.');
    process.exit(1);
}

console.log('verify-stamped-config: OK');
