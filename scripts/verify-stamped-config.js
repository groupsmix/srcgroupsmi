import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const distFile = join(process.cwd(), 'dist', 'assets', 'js', 'head-scripts.js');

// If PUBLIC_GA4_ID or PUBLIC_SENTRY_DSN are set, the stamped file MUST
// exist. A silent skip here would let unstamped prod builds ship.
const requireStamped = Boolean(process.env.PUBLIC_GA4_ID || process.env.PUBLIC_SENTRY_DSN);

if (!existsSync(distFile)) {
    if (requireStamped) {
        console.error('::error::verify-stamped-config: PUBLIC_GA4_ID / PUBLIC_SENTRY_DSN is set but dist/assets/js/head-scripts.js does not exist. The stamp step cannot have run.');
        process.exit(1);
    }
    console.warn('verify-stamped-config: head-scripts.js not found and no PUBLIC_GA4_ID / PUBLIC_SENTRY_DSN set. Skipping verification.');
    process.exit(0);
}

const content = readFileSync(distFile, 'utf8');

if (content.includes('G-XXXXXXXXXX') || content.includes("var SENTRY_DSN = '';")) {
    console.error('::error::verify-stamped-config: Found unstamped GA4_ID or SENTRY_DSN in dist/assets/js/head-scripts.js. Production builds must provide PUBLIC_GA4_ID and PUBLIC_SENTRY_DSN.');
    process.exit(1);
}

console.log('verify-stamped-config: OK');
