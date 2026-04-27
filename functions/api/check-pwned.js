import { jsonResponse } from './_shared/response.js';
import { logError } from './_shared/log.js';

/**
 * Cloudflare Worker Endpoint
 * GET /api/check-pwned?prefix=ABCDE
 *
 * Proxy for Have I Been Pwned API to implement k-Anonymity password checking.
 * Client sends first 5 characters of SHA-1 hash.
 * We return the raw text response from HIBP.
 */
export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const prefix = url.searchParams.get('prefix');

    if (!prefix || prefix.length !== 5 || !/^[0-9A-F]+$/i.test(prefix)) {
        return jsonResponse({ ok: false, error: 'Invalid prefix' }, 400);
    }

    try {
        const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix.toUpperCase()}`, {
            headers: {
                'User-Agent': 'GroupsMix-Cloudflare-Worker'
            }
        });

        if (!res.ok) {
            logError('check-pwned', `HIBP API returned ${res.status}`);
            return jsonResponse({ ok: false, error: 'Upstream API error' }, 502);
        }

        const text = await res.text();
        return new Response(text, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain',
                'Cache-Control': 'public, max-age=86400'
            }
        });
    } catch (err) {
        logError('check-pwned', err);
        return jsonResponse({ ok: false, error: 'Internal Server Error' }, 500);
    }
}
