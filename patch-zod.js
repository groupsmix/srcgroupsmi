import { readFileSync, writeFileSync } from 'fs';

// 1. functions/api/account/delete.js
let ad = readFileSync('functions/api/account/delete.js', 'utf8');
ad = ad.replace('validation.error.errors.map(e => e.message)', 'validation.error.issues.map((e: any) => e.message)');
writeFileSync('functions/api/account/delete.js', ad);

// 2. functions/api/account/preferences.js
let ap = readFileSync('functions/api/account/preferences.js', 'utf8');
ap = ap.replace('validation.error.errors.map(e => e.message)', 'validation.error.issues.map((e: any) => e.message)');
writeFileSync('functions/api/account/preferences.js', ap);

// 3. functions/api/lemonsqueezy-webhook.js
let lsw = readFileSync('functions/api/lemonsqueezy-webhook.js', 'utf8');
lsw = lsw.replace('const validation = lsWebhookSchema.safeParse(body);', 'const validation = lsWebhookSchema.safeParse(body);\n    if (!validation.success) {\n        console.error("Zod schema failed", validation.error.issues);\n    }');
writeFileSync('functions/api/lemonsqueezy-webhook.js', lsw);
