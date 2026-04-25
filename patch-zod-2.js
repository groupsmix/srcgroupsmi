import { readFileSync, writeFileSync } from 'fs';

let ad = readFileSync('functions/api/account/delete.js', 'utf8');
ad = ad.replace('validation.error.issues.map((e: any) => e.message)', 'validation.error.issues.map(e => e.message)');
writeFileSync('functions/api/account/delete.js', ad);

let ap = readFileSync('functions/api/account/preferences.js', 'utf8');
ap = ap.replace('validation.error.issues.map((e: any) => e.message)', 'validation.error.issues.map(e => e.message)');
writeFileSync('functions/api/account/preferences.js', ap);
