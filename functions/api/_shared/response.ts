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
 * @param {string | null} origin  - Request Origin header for CORS.
 * @returns {Response}
 */
export function errorResponse(message: string, status: number = 400, origin: string | null): Response {
    return new Response(
        JSON.stringify({ ok: false, error: message }),
        {
            status: status,
            headers: corsHeaders(origin, { 'Content-Type': 'application/json' })
        }
    );
}

/**
 * Return a JSON success response.
 * @param {Record<string, any>} data   - Payload fields merged into the response body.
 * @param {string | null} origin - Request Origin header for CORS.
 * @returns {Response}
 */
export function successResponse(data: Record<string, any>, origin: string | null): Response {
    return new Response(
        JSON.stringify({ ok: true, ...data }),
        {
            status: 200,
            headers: corsHeaders(origin, { 'Content-Type': 'application/json' })
        }
    );
}
