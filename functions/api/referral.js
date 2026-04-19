/**
 * /api/referral — Referral Program API
 *
 * GET  /api/referral?action=code          — Get or generate referral code for current user
 * GET  /api/referral?action=stats&uid=X   — Get referral stats for a user
 * POST /api/referral { action: 'apply', referral_code, new_user_id } — Apply referral code
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';
import { errorResponse, } from './_shared/response.js';
import { requireAuthWithOwnership } from './_shared/auth.js';

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
        return errorResponse('Service not configured', 503, origin);
    }

    if (request.method === 'GET') {
        const url = new URL(request.url);
        const action = url.searchParams.get('action');

        if (action === 'code') {
            const uid = url.searchParams.get('uid');
            if (!uid) {
                return errorResponse('User ID required', 400, origin);
            }

            // Verify authentication and ownership
            const codeAuth = await requireAuthWithOwnership(request, env, corsHeaders(origin), uid);
            if (codeAuth instanceof Response) return codeAuth;

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
                return errorResponse('User ID required', 400, origin);
            }

            // Verify authentication and ownership
            const statsAuth = await requireAuthWithOwnership(request, env, corsHeaders(origin), uid);
            if (statsAuth instanceof Response) return statsAuth;

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

        return errorResponse('Unknown action', 400, origin);
    }

    if (request.method === 'POST') {
        let body;
        try {
            body = await request.json();
        } catch(_e) {
            return errorResponse('Invalid JSON', 400, origin);
        }

        if (body.action === 'apply') {
            if (!body.referral_code || !body.new_user_id) {
                return errorResponse('referral_code and new_user_id required', 400, origin);
            }

            // Verify authentication and ownership of new_user_id
            const applyAuth = await requireAuthWithOwnership(request, env, corsHeaders(origin), body.new_user_id);
            if (applyAuth instanceof Response) return applyAuth;

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

            return errorResponse((result && result.error) || 'Failed to apply referral', 400, origin);
        }

        return errorResponse('Unknown action', 400, origin);
    }

    return errorResponse('Method not allowed', 405, origin);
}
