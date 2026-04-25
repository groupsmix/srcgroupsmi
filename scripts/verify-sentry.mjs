#!/usr/bin/env node

/**
 * Script to verify Sentry event delivery
 * Usage: SENTRY_AUTH_TOKEN=xxx SENTRY_ORG=groupsmix SENTRY_PROJECT=groupsmix node scripts/verify-sentry.mjs <deploy_id>
 */

const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG || 'groupsmix';
const SENTRY_PROJECT = process.env.SENTRY_PROJECT || 'groupsmix';
const DEPLOY_ID = process.argv[2];

if (!SENTRY_AUTH_TOKEN || !DEPLOY_ID) {
  console.error('SENTRY_AUTH_TOKEN and <deploy_id> argument are required');
  process.exit(1);
}

async function verifySentry() {
  const query = `is:unresolved has:deploy_id deploy_id:${DEPLOY_ID}`;
  const url = `https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/events/?query=${encodeURIComponent(query)}&limit=1`;

  const startTime = Date.now();
  const timeoutMs = 60 * 1000; // 60 seconds

  while (Date.now() - startTime < timeoutMs) {
    console.log(`Polling Sentry API for deploy_id: ${DEPLOY_ID}...`);
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${SENTRY_AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      const events = await res.json();
      if (events && events.length > 0) {
        console.log(`Successfully verified Sentry event delivery for deploy_id: ${DEPLOY_ID}`);
        process.exit(0);
      }
    } else {
      console.warn(`Sentry API returned ${res.status}:`, await res.text());
    }

    // Wait 5 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.error(`Timeout (60s) reached without seeing Sentry event for deploy_id: ${DEPLOY_ID}`);
  process.exit(1);
}

verifySentry().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
