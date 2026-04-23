/**
 * stamp-supabase-config.js — Inject Supabase URL and anon key into the
 * built supabase-config.js so different environments (preview, staging,
 * prod) can target different Supabase projects without editing source.
 *
 * Run after `astro build`.
 *
 * Source values:
 *   PUBLIC_SUPABASE_URL       (preferred)
 *   PUBLIC_SUPABASE_ANON_KEY  (preferred)
 *   SUPABASE_URL              (fallback — same env var the server uses)
 *   SUPABASE_ANON_KEY         (fallback)
 *
 * If no env var is set the file is left untouched (source defaults hold),
 * so local dev and existing deployments keep working.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const distFile = join(process.cwd(), 'dist', 'assets', 'js', 'supabase-config.js');

if (!existsSync(distFile)) {
    console.log('stamp-supabase-config: dist/assets/js/supabase-config.js not found — skipping.');
    process.exit(0);
}

const url = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const key = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!url && !key) {
    console.log('stamp-supabase-config: no PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY in env — leaving defaults.');
    process.exit(0);
}

const src = readFileSync(distFile, 'utf8');

// Strict regexes: only rewrite the two known top-level constants.
const urlRe = /const SUPABASE_URL = '[^']*';/;
const keyRe = /const SUPABASE_ANON_KEY = '[^']*';/;

if (!urlRe.test(src) || !keyRe.test(src)) {
    console.warn('stamp-supabase-config: expected constants not found in built file; skipping.');
    process.exit(0);
}

// Sanity-check URL format to avoid pushing garbage into the build.
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    console.error(`stamp-supabase-config: PUBLIC_SUPABASE_URL "${url}" does not look like a Supabase URL; aborting.`);
    process.exit(1);
}
if (key && !/^[A-Za-z0-9._-]{40,}$/.test(key)) {
    console.error('stamp-supabase-config: PUBLIC_SUPABASE_ANON_KEY does not look like a JWT; aborting.');
    process.exit(1);
}

let out = src;
if (url) out = out.replace(urlRe, `const SUPABASE_URL = '${url}';`);
if (key) out = out.replace(keyRe, `const SUPABASE_ANON_KEY = '${key}';`);

writeFileSync(distFile, out, 'utf8');
console.log('stamp-supabase-config: injected' + (url ? ' SUPABASE_URL' : '') + (key ? ' SUPABASE_ANON_KEY' : ''));
