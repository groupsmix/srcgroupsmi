#!/usr/bin/env node

/**
 * Script to apply Sentry alert rules from sentry-alerts.json
 * Usage: SENTRY_AUTH_TOKEN=xxx SENTRY_ORG=groupsmix SENTRY_PROJECT=groupsmix node scripts/apply-sentry-alerts.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const alertsPath = path.join(__dirname, '../sentry-alerts.json');

const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG || 'groupsmix';
const SENTRY_PROJECT = process.env.SENTRY_PROJECT || 'groupsmix';

if (!SENTRY_AUTH_TOKEN) {
  console.error('SENTRY_AUTH_TOKEN is required');
  process.exit(1);
}

const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));

async function applyAlerts() {
  const url = `https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/rules/`;

  // First, fetch existing rules
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Failed to fetch existing rules:', res.status, text);
    process.exit(1);
  }

  const existingRules = await res.json();
  const existingNames = new Set(existingRules.map(r => r.name));

  for (const alert of alerts) {
    if (existingNames.has(alert.name)) {
      console.log(`Alert "${alert.name}" already exists, skipping creation...`);
      // Could implement update logic here if needed
      continue;
    }

    console.log(`Creating alert "${alert.name}"...`);
    const createRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENTRY_AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(alert)
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error(`Failed to create alert "${alert.name}":`, createRes.status, text);
    } else {
      console.log(`Successfully created alert "${alert.name}"`);
    }
  }
}

applyAlerts().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
