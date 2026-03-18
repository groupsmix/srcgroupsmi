/**
 * /api/verified-badge — Verified Group Badge Program API
 *
 * GET  /api/verified-badge?group_id=X     — Check verification status
 * POST /api/verified-badge { action: "purchase", group_id, user_id }  — Buy badge with GMX
 * POST /api/verified-badge { action: "admin_verify", group_id }       — Admin grant (admin only)
 * POST /api/verified-badge { action: "expire" }                       — Expire old badges (cron)
 *
 * Verified badge costs 500 GMX coins, lasts 30 days, boosts trust score by 15.
 */

const ALLOWED_ORIGINS = ['https://groupsmix.com', 'https://www.groupsmix.com'];
const BADGE_COST = 500;

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
            var url = new URL(request.url);
            var groupId = url.searchParams.get('group_id');
            if (!groupId) {
                return new Response(JSON.stringify({ ok: false, error: 'group_id required' }), {
                    status: 400, headers: corsHeaders(origin)
                });
            }

            // Check verified status
            var checkRes = await fetch(supabaseUrl + '/rest/v1/rpc/is_group_verified', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                },
                body: JSON.stringify({ p_group_id: groupId })
            });

            var isVerified = checkRes.ok ? await checkRes.json() : false;

            // Get details if verified
            var details = null;
            if (isVerified) {
                var detRes = await fetch(
                    supabaseUrl + '/rest/v1/verified_groups?group_id=eq.' + encodeURIComponent(groupId) + '&status=eq.active&select=*&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                var dets = await detRes.json();
                if (dets && dets.length) {
                    details = {
                        verified_by: dets[0].verified_by,
                        verified_at: dets[0].verified_at,
                        expires_at: dets[0].expires_at
                    };
                }
            }

            return new Response(JSON.stringify({
                ok: true,
                is_verified: isVerified,
                details: details,
                cost: BADGE_COST,
                duration_days: 30
            }), {
                status: 200, headers: corsHeaders(origin)
            });
        }

        // POST
        var body;
        try { body = await request.json(); } catch (e) {
            return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        var action = body.action;

        if (action === 'purchase') {
            var groupId = body.group_id;
            var userId = body.user_id;
            if (!groupId || !userId) {
                return new Response(JSON.stringify({ ok: false, error: 'group_id and user_id required' }), {
                    status: 400, headers: corsHeaders(origin)
                });
            }

            var purchaseRes = await fetch(supabaseUrl + '/rest/v1/rpc/purchase_verified_badge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                },
                body: JSON.stringify({
                    p_group_id: groupId,
                    p_user_id: userId,
                    p_cost: BADGE_COST
                })
            });

            var result = purchaseRes.ok ? await purchaseRes.json() : { ok: false, error: 'RPC failed' };
            return new Response(JSON.stringify(result), {
                status: result.ok ? 200 : 400,
                headers: corsHeaders(origin)
            });
        }

        if (action === 'admin_verify') {
            var groupId = body.group_id;
            var adminId = body.admin_id;
            if (!groupId || !adminId) {
                return new Response(JSON.stringify({ ok: false, error: 'group_id and admin_id required' }), {
                    status: 400, headers: corsHeaders(origin)
                });
            }

            var adminRes = await fetch(supabaseUrl + '/rest/v1/rpc/admin_verify_group', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                },
                body: JSON.stringify({ p_group_id: groupId, p_admin_id: adminId })
            });

            return new Response(JSON.stringify({
                ok: adminRes.ok,
                message: adminRes.ok ? 'Group verified by admin' : 'Failed to verify'
            }), {
                status: adminRes.ok ? 200 : 500,
                headers: corsHeaders(origin)
            });
        }

        if (action === 'expire') {
            var expireRes = await fetch(supabaseUrl + '/rest/v1/rpc/expire_verified_badges', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                },
                body: '{}'
            });
            var expired = expireRes.ok ? await expireRes.json() : 0;
            return new Response(JSON.stringify({ ok: true, expired_count: expired }), {
                status: 200, headers: corsHeaders(origin)
            });
        }

        return new Response(JSON.stringify({ ok: false, error: 'Unknown action: ' + action }), {
            status: 400, headers: corsHeaders(origin)
        });

    } catch (err) {
        console.error('verified-badge error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}
