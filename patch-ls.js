import { readFileSync, writeFileSync } from 'fs';

let lsw = readFileSync('functions/api/lemonsqueezy-webhook.js', 'utf8');
lsw = lsw.replace('custom_data: z.record(z.any()).optional()', 'custom_data: z.record(z.string(), z.any()).optional()');
lsw = lsw.replace('attributes: z.record(z.any())', 'attributes: z.record(z.string(), z.any())');
writeFileSync('functions/api/lemonsqueezy-webhook.js', lsw);
