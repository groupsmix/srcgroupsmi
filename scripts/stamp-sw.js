/**
 * stamp-sw.js — Replace %%SW_VERSION%% in the built sw.js with a unique hash.
 *
 * Run after `astro build` so the service worker in dist/ gets a fresh
 * cache-busting version on every deploy without manual edits.
 *
 * Usage:  node scripts/stamp-sw.js
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const distSw = join(process.cwd(), 'dist', 'sw.js');

if (!existsSync(distSw)) {
    console.log('stamp-sw: dist/sw.js not found — skipping.');
    process.exit(0);
}

const src = readFileSync(distSw, 'utf8');

// Build a short hash from the current timestamp + a snapshot of dist/sw.js
const stamp = createHash('md5')
    .update(Date.now().toString())
    .update(src)
    .digest('hex')
    .slice(0, 10);

const out = src.replace('%%SW_VERSION%%', stamp);

writeFileSync(distSw, out, 'utf8');
console.log(`stamp-sw: wrote version ${stamp} → dist/sw.js`);
