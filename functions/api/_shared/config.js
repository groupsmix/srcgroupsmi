/**
 * Shared Supabase configuration for Cloudflare Pages Functions.
 *
 * Centralizes environment variable access so that no endpoint
 * hardcodes Supabase URLs or falls back to anon keys silently.
 */

/**
 * Get Supabase configuration from environment variables.
 * Throws if required variables are missing — fail loudly instead of
 * silently falling back to anon keys.
 *
 * @param {object} env - Cloudflare Pages environment variables
 * @returns {{ url: string, serviceKey: string }}
 */
export function getSupabaseConfig(env) {
    const url = env?.SUPABASE_URL;
    const serviceKey = env?.SUPABASE_SERVICE_KEY;

    if (!url || !serviceKey) {
        throw new Error(
            'Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.'
        );
    }

    return { url, serviceKey };
}
