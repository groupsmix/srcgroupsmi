/**
 * Edge-side Sentry helper (scaffold) for Cloudflare Pages Functions.
 *
 * Sends exceptions to Sentry's /api/<project>/envelope/ endpoint over HTTP
 * without pulling in the Sentry Node/Edge SDK. Designed to run inside the
 * Cloudflare Workers runtime where `fetch`, `crypto`, and `TextEncoder`
 * are all globals.
 *
 * Usage pattern:
 *
 *   import { captureEdgeException } from './_shared/sentry.js';
 *
 *   export async function onRequest(ctx) {
 *       try {
 *           // handler work
 *       } catch (err) {
 *           ctx.waitUntil(captureEdgeException(ctx.env, err, {
 *               request: ctx.request,
 *               tags: { endpoint: 'lemonsqueezy-webhook' }
 *           }));
 *           throw err;
 *       }
 *   }
 *
 * Environment variables consumed (all optional — when unset, the helper is
 * a no-op so nothing breaks in local dev or preview deploys):
 *   SENTRY_DSN_EDGE    — Sentry DSN for the server-side project
 *   SENTRY_ENVIRONMENT — e.g. 'production', 'preview'
 *   SENTRY_RELEASE     — e.g. 'groupsmix@<git-sha>'
 */

const DEFAULT_TIMEOUT_MS = 1500;

/**
 * @param {string} dsn  Sentry DSN of the form https://<public>@<host>/<projectId>
 * @returns {{publicKey: string, host: string, projectId: string, endpoint: string}|null}
 */
function parseDsn(dsn) {
    if (!dsn || typeof dsn !== 'string') return null;
    try {
        const url = new URL(dsn);
        const publicKey = url.username;
        const projectId = url.pathname.replace(/^\/+/, '');
        if (!publicKey || !projectId) return null;
        const endpoint = url.origin + '/api/' + projectId + '/envelope/';
        return { publicKey, host: url.host, projectId, endpoint };
    } catch (_err) {
        return null;
    }
}

function genEventId() {
    // 32 lowercase hex characters — Sentry's event_id format.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, '0');
    }
    return out;
}

function serializeError(err) {
    if (!err) return { type: 'Error', value: 'unknown' };
    return {
        type: err.name || 'Error',
        value: String(err.message || err),
        stacktrace: err.stack ? { frames: parseStack(err.stack) } : undefined
    };
}

function parseStack(stack) {
    const lines = String(stack).split('\n').slice(1, 20);
    return lines.map((line) => {
        const m = line.match(/at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
        if (!m) return { function: line.trim() };
        return {
            function: m[1] || '<anonymous>',
            filename: m[2],
            lineno: parseInt(m[3], 10),
            colno: parseInt(m[4], 10)
        };
    }).reverse();
}

/**
 * Capture an exception from a Cloudflare Pages Function.
 *
 * Returns a Promise that resolves once the Sentry envelope request has been
 * sent (or the configured timeout has elapsed). Never rejects — a broken
 * telemetry pipeline must not take down the handler.
 *
 * @param {object} env                 Environment bindings
 * @param {Error} err                  Error to capture
 * @param {object} [context]           Optional context
 * @param {Request} [context.request]  Inbound request for URL/method tags
 * @param {Record<string,string>} [context.tags]
 * @param {Record<string,unknown>} [context.extra]
 */
export async function captureEdgeException(env, err, context) {
    try {
        const dsnInfo = parseDsn(env && env.SENTRY_DSN_EDGE);
        if (!dsnInfo) return;

        const eventId = genEventId();
        const timestamp = Date.now() / 1000;
        const request = context && context.request;

        const event = {
            event_id: eventId,
            timestamp: timestamp,
            platform: 'javascript',
            environment: (env && env.SENTRY_ENVIRONMENT) || 'production',
            release: (env && env.SENTRY_RELEASE) || undefined,
            server_name: 'cloudflare-pages',
            exception: { values: [serializeError(err)] },
            tags: Object.assign({ runtime: 'cloudflare' }, (context && context.tags) || {}),
            extra: (context && context.extra) || undefined,
            request: request ? {
                url: request.url,
                method: request.method,
                headers: { 'user-agent': request.headers.get('user-agent') || '' }
            } : undefined
        };

        const envelope =
            JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }) + '\n' +
            JSON.stringify({ type: 'event' }) + '\n' +
            JSON.stringify(event) + '\n';

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
        try {
            await fetch(dsnInfo.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-sentry-envelope',
                    'X-Sentry-Auth':
                        'Sentry sentry_version=7, sentry_client=groupsmix-edge/0.1, ' +
                        'sentry_key=' + dsnInfo.publicKey
                },
                body: envelope,
                signal: controller.signal
            });
        } finally {
            clearTimeout(timer);
        }
    } catch (_sendErr) {
        // Never surface telemetry failures.
    }
}
