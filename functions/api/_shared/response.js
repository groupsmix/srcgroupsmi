import { corsHeaders } from './cors.js';

/**
 * Standardize JSON responses for the API
 * 
 * @param {Object} payload 
 * @param {number} status 
 * @param {string} origin 
 * @returns {Response}
 */
export function jsonResponse(payload, status = 200, origin = '') {
    // Ensure all responses have { ok: boolean }
    const formatted = {
        ok: status >= 200 && status < 300,
        ...payload
    };

    return new Response(JSON.stringify(formatted), {
        status,
        headers: corsHeaders(origin, { 'Content-Type': 'application/json' })
    });
}
