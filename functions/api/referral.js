/**
 * /api/referral — Referral Program API
 *
 * GET  /api/referral?action=code          — Get or generate referral code for current user
 * GET  /api/referral?action=stats&uid=X   — Get referral stats for a user
 * POST /api/referral { action: 'apply', referral_code, new_user_id } — Apply referral code
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';
import { requireAuth } from './_shared/auth.js';

function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ ok: false, error: 'Service not configured' }), {
            status: 503, headers: corsHeaders(origin)
        });
    }

    if (request.method === 'GET') {
        const url = new URL(request.url);
        const action = url.searchParams.get('action');

        if (action === 'code') {
            const uid = url.searchParams.get('uid');
            if (!uid) {
                return new Response(JSON.stringify({ ok: false, error: 'User ID required' }), {
                    status: 400, headers: corsHeaders(origin)
                });
            }

            // Verify authentication and ownership
            const authResult = await requireAuth(request, env, corsHeaders(origin));
            if (authResult instanceof Response) return authResult;
            const profileRes = await fetch(
                supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(authResult.user.id) + '&select=id&limit=1',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const codeProfiles = await profileRes.json();
            if (!codeProfiles || !codeProfiles.length || codeProfiles[0].id !== uid) {
                return new Response(JSON.stringify({ ok: false, error: 'Forbidden: user_id mismatch' }), {
                    status: 403, headers: corsHeaders(origin)
                });
            }

            // Get or generate referral code
            const res = await fetch(
                supabaseUrl + '/rest/v1/rpc/generate_referral_code',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({ p_user_id: uid })
                }
            );
            const code = await res.json();

            return new Response(JSON.stringify({
                ok: true,
                referral_code: code,
                referral_url: 'https://groupsmix.com/?ref=' + code,
                share_urls: {
                    twitter: 'https://twitter.com/intent/tweet?text=' + encodeURIComponent('Join GroupsMix and discover trusted social media groups! Use my referral code: ' + code) + '&url=' + encodeURIComponent('https://groupsmix.com/?ref=' + code),
                    whatsapp: 'https://wa.me/?text=' + encodeURIComponent('Join GroupsMix and discover trusted groups! Sign up with my link: https://groupsmix.com/?ref=' + code),
                    facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent('https://groupsmix.com/?ref=' + code)
                }
            }), { status: 200, headers: corsHeaders(origin) });
        }

        if (action === 'stats') {
            const uid = url.searchParams.get('uid');
            if (!uid) {
                return new Response(JSON.stringify({ ok: false, error: 'User ID required' }), {
                    status: 400, headers: corsHeaders(origin)
                });
            }

            // Verify authentication and ownership
            const statsAuth = await requireAuth(request, env, corsHeaders(origin));
            if (statsAuth instanceof Response) return statsAuth;
            const statsProfileRes = await fetch(
                supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(statsAuth.user.id) + '&select=id&limit=1',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const statsProfiles = await statsProfileRes.json();
            if (!statsProfiles || !statsProfiles.length || statsProfiles[0].id !== uid) {
                return new Response(JSON.stringify({ ok: false, error: 'Forbidden: user_id mismatch' }), {
                    status: 403, headers: corsHeaders(origin)
                });
            }

            // Get referral stats
            const [userRes, referralsRes] = await Promise.all([
                fetch(
                    supabaseUrl + '/rest/v1/users?id=eq.' + encodeURIComponent(uid) + '&select=referral_code,referral_count,gxp&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                ),
                fetch(
                    supabaseUrl + '/rest/v1/referrals?referrer_uid=eq.' + encodeURIComponent(uid) + '&select=id,status,reward_coins,created_at,completed_at&order=created_at.desc&limit=50',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                )
            ]);

            const users = await userRes.json();
            const referrals = await referralsRes.json();
            const user = users && users[0] ? users[0] : {};

            const totalEarned = (referrals || []).reduce((sum, r) => {
                return sum + (r.status === 'completed' || r.status === 'rewarded' ? (r.reward_coins || 0) : 0);
            }, 0);

            return new Response(JSON.stringify({
                ok: true,
                stats: {
                    referral_code: user.referral_code || null,
                    total_referrals: user.referral_count || 0,
                    total_earned: totalEarned,
                    current_gxp: user.gxp || 0,
                    referrals: (referrals || []).slice(0, 20)
                }
            }), { status: 200, headers: corsHeaders(origin) });
        }

        return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    if (request.method === 'POST') {
        let body;
        try {
            body = await request.json();
        } catch(e) {
            return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        if (body.action === 'apply') {
            if (!body.referral_code || !body.new_user_id) {
                return new Response(JSON.stringify({ ok: false, error: 'referral_code and new_user_id required' }), {
                    status: 400, headers: corsHeaders(origin)
                });
            }

            // Verify authentication and ownership of new_user_id
            const applyAuth = await requireAuth(request, env, corsHeaders(origin));
            if (applyAuth instanceof Response) return applyAuth;
            const applyProfileRes = await fetch(
                supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(applyAuth.user.id) + '&select=id&limit=1',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const applyProfiles = await applyProfileRes.json();
            if (!applyProfiles || !applyProfiles.length || applyProfiles[0].id !== body.new_user_id) {
                return new Response(JSON.stringify({ ok: false, error: 'Forbidden: user_id mismatch' }), {
                    status: 403, headers: corsHeaders(origin)
                });
            }

            // Process the referral
            const res = await fetch(
                supabaseUrl + '/rest/v1/rpc/process_referral',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({
                        p_referral_code: body.referral_code,
                        p_new_user_id: body.new_user_id
                    })
                }
            );

            const result = await res.json();
            if (result && result.ok) {
                return new Response(JSON.stringify({
                    ok: true,
                    message: 'Referral applied! Both you and your friend earn ' + (result.reward || 50) + ' GMX coins.',
                    reward: result.reward || 50
                }), { status: 200, headers: corsHeaders(origin) });
            }

            return new Response(JSON.stringify({
                ok: false,
                error: (result && result.error) || 'Failed to apply referral'
            }), { status: 400, headers: corsHeaders(origin) });
        }

        return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405, headers: corsHeaders(origin)
    });
}
