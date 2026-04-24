/**
 * Shared CORS utility for Cloudflare Pages Functions.
 *
 * Centralizes allowed origins and CORS header generation so that
 * every API endpoint uses the same list without copy-pasting.
 */

const ALLOWED_ORIGINS: string[] = [
    'https://groupsmix.com',
    'https://www.groupsmix.com'
];

/**
 * Build CORS headers for the given request origin.
 * @param {string | null} origin - The Origin header value from the request.
 * @param {Record<string, string>} [extra] - Additional headers to merge (e.g. Content-Type, Cache-Control).
 * @returns {Record<string, string>} Headers object with CORS fields.
 */
export function corsHeaders(origin: string | null, extra: Record<string, string> = {}): Record<string, string> {
    const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        ...extra
    };
}

/**
 * Handle an OPTIONS preflight request.
 * @param {string | null} origin
 * @returns {Response}
 */
export function handlePreflight(origin: string | null): Response {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
