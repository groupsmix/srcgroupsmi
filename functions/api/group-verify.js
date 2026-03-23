/**
 * /api/group-verify — Group Ownership Verification API
 *
 * POST /api/group-verify  { action: 'generate', group_id }  — Generate verification code
 * POST /api/group-verify  { action: 'confirm', group_id, code } — Confirm verification
 * GET  /api/group-verify?group_id=X&action=status            — Check verification status
 *
 * Allows group owners to verify ownership by posting a unique code
 * in their group description. Verified groups get a badge and rank higher.
 */

import { requireAuth } from './_shared/auth.js';

const ALLOWED_ORIGINS = ['https://groupsmix.com', 'https://www.groupsmix.com'];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const supabaseUrl = env?.SUPABASE_URL || 'https://hmlqppacanpxmrfdlkec.supabase.co';
    const supabaseKey = env?.SUPABASE_SERVICE_KEY || env?.SUPABASE_ANON_KEY || '';

    if (!supabaseKey) {
        return new Response(JSON.stringify({ ok: false, error: 'Server not configured' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }

    try {
        if (request.method === 'GET') {
            return await handleGet(request, supabaseUrl, supabaseKey, origin);
        }

        if (request.method === 'POST') {
            const authResult = await requireAuth(request, env, corsHeaders(origin));
            if (authResult instanceof Response) return authResult;
            const { user } = authResult;
            return await handlePost(request, user, supabaseUrl, supabaseKey, origin);
        }

        return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
            status: 405, headers: corsHeaders(origin)
        });
    } catch (err) {
        console.error('group-verify error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}

async function handleGet(request, supabaseUrl, supabaseKey, origin) {
    const url = new URL(request.url);
    const groupId = url.searchParams.get('group_id');
    const action = url.searchParams.get('action') || 'status';

    if (!groupId) {
        return new Response(JSON.stringify({ ok: false, error: 'group_id required' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    if (action === 'status') {
        const res = await fetch(
            supabaseUrl + '/rest/v1/rpc/get_verification_status',
            {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ p_group_id: groupId })
            }
        );
        const data = await res.json();
        if (!res.ok) {
            return new Response(JSON.stringify({ ok: false, error: data.message || 'Failed to get status' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }
        const status = Array.isArray(data) ? data[0] : data;
        return new Response(JSON.stringify({ ok: true, data: status || { is_verified: false } }), {
            status: 200, headers: corsHeaders(origin)
        });
    }

    return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), {
        status: 400, headers: corsHeaders(origin)
    });
}

async function handlePost(request, user, supabaseUrl, supabaseKey, origin) {
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    let action = body.action;
    const groupId = body.group_id;

    if (!groupId) {
        return new Response(JSON.stringify({ ok: false, error: 'group_id required' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    if (action === 'generate') {
        // Generate a verification code via RPC
        const res = await fetch(
            supabaseUrl + '/rest/v1/rpc/generate_verification_code',
            {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ p_group_id: groupId, p_uid: user.id })
            }
        );
        const data = await res.json();
        if (!res.ok) {
            let errMsg = (data && data.message) ? data.message : 'Failed to generate code';
            // Clean up common DB errors for user-friendly messages
            if (errMsg.includes('already verified')) errMsg = 'This group is already verified.';
            if (errMsg.includes('Not the group owner')) errMsg = 'You can only verify groups you submitted.';
            return new Response(JSON.stringify({ ok: false, error: errMsg }), {
                status: 400, headers: corsHeaders(origin)
            });
        }
        const result = Array.isArray(data) ? data[0] : data;
        return new Response(JSON.stringify({ ok: true, data: result }), {
            status: 200, headers: corsHeaders(origin)
        });
    }

    if (action === 'confirm') {
        const code = body.code;
        if (!code) {
            return new Response(JSON.stringify({ ok: false, error: 'Verification code required' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        const res = await fetch(
            supabaseUrl + '/rest/v1/rpc/confirm_group_verification',
            {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ p_group_id: groupId, p_uid: user.id, p_code: code })
            }
        );
        const data = await res.json();
        if (!res.ok) {
            return new Response(JSON.stringify({ ok: false, error: (data && data.message) || 'Verification failed' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        if (data === true) {
            return new Response(JSON.stringify({ ok: true, verified: true, message: 'Group verified successfully!' }), {
                status: 200, headers: corsHeaders(origin)
            });
        } else {
            return new Response(JSON.stringify({ ok: false, error: 'Verification code not found, expired, or does not match. Please generate a new code.' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }
    }

    return new Response(JSON.stringify({ ok: false, error: 'Unknown action. Use generate, confirm, or status.' }), {
        status: 400, headers: corsHeaders(origin)
    });
}
