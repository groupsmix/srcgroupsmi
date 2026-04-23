/**
 * GET/POST /api/account/preferences  (Epic C, C-4)
 *
 * Reads and updates the privacy opt-out flags on public.users. Every
 * update writes a `preferences_updated` DSAR audit row so the change
 * history is reviewable.
 *
 *   GET  → { ok: true, preferences: { marketing_opt_out, analytics_opt_out,
 *                                      personalization_opt_out } }
 *   POST → { ok: true, preferences: {...updated} }
 *          Body accepts any subset of the three boolean flags.
 */

import { requireAuth } from '../_shared/auth.js';
import { corsHeaders, handlePreflight } from '../_shared/cors.js';
import { errorResponse, successResponse } from '../_shared/response.js';
import { getSupabaseConfig } from '../_shared/config.js';

const ALLOWED_PREFS = [
    'marketing_opt_out',
    'analytics_opt_out',
    'personalization_opt_out'
];

async function fetchProfile(url, serviceKey, authId) {
    const res = await fetch(
        url + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(authId)
        + '&select=id,' + ALLOWED_PREFS.join(',') + '&limit=1',
        { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0] || null;
}

async function patchProfile(url, serviceKey, userId, patch) {
    const res = await fetch(
        url + '/rest/v1/users?id=eq.' + encodeURIComponent(userId),
        {
            method: 'PATCH',
            headers: {
                apikey: serviceKey,
                Authorization: 'Bearer ' + serviceKey,
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
            },
            body: JSON.stringify(patch)
        }
    );
    if (!res.ok) {
        const text = await res.text();
        console.error('preferences.js: patch failed', res.status, text);
        return null;
    }
    const rows = await res.json();
    return rows?.[0] || null;
}

async function writeAudit(url, serviceKey, row) {
    try {
        await fetch(url + '/rest/v1/dsar_audit', {
            method: 'POST',
            headers: {
                apikey: serviceKey,
                Authorization: 'Bearer ' + serviceKey,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            },
            body: JSON.stringify(row)
        });
    } catch (err) {
        console.error('preferences.js: audit insert threw', err?.message || err);
    }
}

function pickPrefs(row) {
    const out = {};
    ALLOWED_PREFS.forEach(k => {
        out[k] = Boolean(row?.[k]);
    });
    return out;
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') return handlePreflight(origin);
    if (request.method !== 'GET' && request.method !== 'POST') {
        return errorResponse('Method not allowed', 405, origin);
    }

    const authResult = await requireAuth(request, env, corsHeaders(origin));
    if (authResult instanceof Response) return authResult;
    const { user } = authResult;

    let cfg;
    try {
        cfg = getSupabaseConfig(env);
    } catch (err) {
        console.error('preferences.js: missing Supabase config', err?.message || err);
        return errorResponse('Service not configured', 503, origin);
    }

    const profile = await fetchProfile(cfg.url, cfg.serviceKey, user.id);
    if (!profile) {
        return errorResponse('User profile not found', 404, origin);
    }

    if (request.method === 'GET') {
        return successResponse({ preferences: pickPrefs(profile) }, origin);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return errorResponse('Invalid JSON body', 400, origin);
    }

    const patch = {};
    const before = pickPrefs(profile);
    const changed = [];
    ALLOWED_PREFS.forEach(k => {
        if (k in (body || {})) {
            const v = Boolean(body[k]);
            patch[k] = v;
            if (v !== before[k]) changed.push(k);
        }
    });

    if (Object.keys(patch).length === 0) {
        return errorResponse('No valid preference fields supplied', 400, origin);
    }

    const updated = await patchProfile(cfg.url, cfg.serviceKey, profile.id, patch);
    if (!updated) {
        return errorResponse('Failed to update preferences', 500, origin);
    }

    const ip = request.headers.get('CF-Connecting-IP')
        || request.headers.get('x-forwarded-for')
        || 'unknown';
    const userAgent = request.headers.get('User-Agent') || '';

    if (changed.length > 0) {
        const after = pickPrefs(updated);
        const diff = {};
        changed.forEach(k => {
            diff[k] = { from: before[k], to: after[k] };
        });
        await writeAudit(cfg.url, cfg.serviceKey, {
            user_id: profile.id,
            auth_id: user.id,
            action: 'preferences_updated',
            metadata: { changes: diff },
            ip,
            user_agent: userAgent
        });
    }

    return successResponse({ preferences: pickPrefs(updated) }, origin);
}
