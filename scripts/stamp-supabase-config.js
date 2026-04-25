#!/usr/bin/env node

/**
 * Replaces {{SUPABASE_URL}} and {{SUPABASE_ANON_KEY}} placeholders in dist/
 * with the actual environment variables.
 * Usage: node scripts/stamp-supabase-config.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '../dist/assets/js/supabase-config.js');

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_ANON_KEY not set during stamping.');
}

if (fs.existsSync(distPath)) {
  let content = fs.readFileSync(distPath, 'utf8');
  if (SUPABASE_URL) content = content.replace(/\{\{SUPABASE_URL\}\}/g, SUPABASE_URL);
  if (SUPABASE_ANON_KEY) content = content.replace(/\{\{SUPABASE_ANON_KEY\}\}/g, SUPABASE_ANON_KEY);
  fs.writeFileSync(distPath, content, 'utf8');
  console.log('Stamped Supabase config in dist/');
} else {
  console.error(`Error: File not found at ${distPath}`);
  process.exit(1);
}
