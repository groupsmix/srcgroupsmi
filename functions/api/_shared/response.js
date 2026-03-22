/**
 * Shared response helpers for Cloudflare Pages Functions.
 *
 * Standardizes error and success response shapes across all endpoints
 * so clients can rely on a consistent { ok, error } / { ok, ...data } format.
 */

import { corsHeaders } from './cors.js';

/**
 * Return a JSON error response.
 * @param {string} message - Human-readable error description.
 * @param {number} status  - HTTP status code (default 400).
 * @param {string} origin  - Request Origin header for CORS.
 * @returns {Response}
 */
export function errorResponse(message, status, origin) {
    return new Response(
        JSON.stringify({ ok: false, error: message }),
        {
            status: status || 400,
            headers: corsHeaders(origin, { 'Content-Type': 'application/json' })
        }
    );
}

/**
 * Return a JSON success response.
 * @param {object} data   - Payload fields merged into the response body.
 * @param {string} origin - Request Origin header for CORS.
 * @returns {Response}
 */
export function successResponse(data, origin) {
    return new Response(
        JSON.stringify({ ok: true, ...data }),
        {
            status: 200,
            headers: corsHeaders(origin, { 'Content-Type': 'application/json' })
        }
    );
}
