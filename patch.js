import { readFileSync, writeFileSync } from 'fs';

// 1. functions/api/groq.ts
let groq = readFileSync('functions/api/groq.ts', 'utf8');
groq = groq.replace('validation.error.errors.map(e =>', 'validation.error.issues.map((e: any) =>');
groq = groq.replace('const { done, value } = chunk;', 'const { done, value } = chunk as any;');
groq = groq.replace('if (chunk && chunk.idle) {', 'if (chunk && (chunk as any).idle) {');
groq = groq.replace('const reader = aiRes.body.getReader();', 'if (!aiRes.body) return;\n        const reader = aiRes.body.getReader();');
groq = groq.replace('const models = OPENROUTER_MODELS[category] || OPENROUTER_MODELS.creative;', 'const models = OPENROUTER_MODELS[category as keyof typeof OPENROUTER_MODELS] || OPENROUTER_MODELS.creative;');
writeFileSync('functions/api/groq.ts', groq);

// 2. functions/api/health-check.ts
let hc = readFileSync('functions/api/health-check.ts', 'utf8');
hc = hc.replace('validation.error.errors[0].message', 'validation.error.issues[0].message');
hc = hc.replace('kvStore);', 'kvStore || undefined);');
writeFileSync('functions/api/health-check.ts', hc);

// 3. functions/api/validate.ts
let val = readFileSync('functions/api/validate.ts', 'utf8');
val = val.replace('errors.push(turnstileResult.error);', "errors.push(turnstileResult.error || 'Turnstile verification failed');");
val = val.replace('kvStore);', 'kvStore || undefined);');
val = val.replace('err.errors.map(e => e.message)', 'err.issues.map((e: any) => e.message)');
writeFileSync('functions/api/validate.ts', val);

// 4. functions/api/_shared/auth.ts
let auth = readFileSync('functions/api/_shared/auth.ts', 'utf8');
auth = auth.replace('const user = await userRes.json();', 'const user = await userRes.json() as SupabaseUser;');
auth = auth.replace('const user = await res.json();', 'const user = await res.json() as SupabaseUser;');
writeFileSync('functions/api/_shared/auth.ts', auth);

// 5. functions/api/_shared/circuit-breaker.ts
let cb = readFileSync('functions/api/_shared/circuit-breaker.ts', 'utf8');
cb = cb.replace("const next = { state: 'half', failures: [], openedAt: Date.now(), nextTry: Date.now() + 5000 };", "const next: BreakerState = { state: 'half', failures: [], openedAt: Date.now(), nextTry: Date.now() + 5000 };");
cb = cb.replace("const next = { ...state, state: 'half' };", "const next: BreakerState = { state: 'half', failures: state.failures, openedAt: state.openedAt, nextTry: state.nextTry };");
writeFileSync('functions/api/_shared/circuit-breaker.ts', cb);
