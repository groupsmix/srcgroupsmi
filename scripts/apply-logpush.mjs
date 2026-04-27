#!/usr/bin/env node

/**
 * Script to apply Cloudflare Logpush config
 * Usage: CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=xxx node scripts/apply-logpush.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../logpush-config.json');

const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
  console.error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

async function applyLogpush() {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/logpush/jobs`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(config)
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    console.error('Failed to apply Logpush config:', res.status, JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('Successfully applied Logpush config:', data.result.id);
}

applyLogpush().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
