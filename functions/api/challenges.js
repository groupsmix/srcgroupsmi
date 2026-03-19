/**
 * /api/challenges — Challenge Management API
 *
 * Handles challenge listing, joining, and progress tracking.
 *
 * GET  /api/challenges                         — List all challenges (active, upcoming, completed)
 * POST /api/challenges  { action: 'join', challenge_id }  — Join a challenge
 * POST /api/challenges  { action: 'progress', challenge_id, progress_count }  — Update progress
 *
 * Environment variables:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

/* ── CORS headers ──────────────────────────────────────────── */
function corsHeaders(origin) {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin || 'https://groupsmix.com',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
}

/* ── Verify auth and get internal user ID ──────────────────── */
async function verifyAndGetUser(request, env) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Server not configured');

    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return null; // Anonymous access allowed for GET

    const token = authHeader.replace('Bearer ', '');
    try {
        const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
            headers: { 'Authorization': 'Bearer ' + token, 'apikey': supabaseKey }
        });
        if (!userRes.ok) return null;
        const authUser = await userRes.json();

        const profileRes = await fetch(
            supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(authUser.id) + '&select=id,role&limit=1',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const profiles = await profileRes.json();
        if (!profiles || !profiles.length) return null;

        return { authId: authUser.id, userId: profiles[0].id, role: profiles[0].role };
    } catch (err) {
        return null;
    }
}

/* ── Main handler ──────────────────────────────────────────── */
export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || 'https://groupsmix.com';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ ok: false, error: 'Server configuration error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }

    if (request.method === 'GET') {
        return handleGet(request, env, origin);
    } else if (request.method === 'POST') {
        return handlePost(request, env, origin);
    }

    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405, headers: corsHeaders(origin)
    });
}

/* ── GET: List challenges ──────────────────────────────────── */
async function handleGet(request, env, origin) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY;

    try {
        const user = await verifyAndGetUser(request, env);
        const userId = user ? user.userId : null;

        // Use RPC to get challenges with participation status
        const rpcRes = await fetch(supabaseUrl + '/rest/v1/rpc/get_challenges', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify({ p_user_id: userId })
        });

        if (!rpcRes.ok) {
            // Fallback: direct query
            const now = new Date().toISOString();

            const activeRes = await fetch(
                supabaseUrl + '/rest/v1/weekly_challenges?starts_at=lte.' + now + '&ends_at=gte.' + now + '&is_active=eq.true&order=ends_at.asc',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const active = await activeRes.json();

            const upcomingRes = await fetch(
                supabaseUrl + '/rest/v1/weekly_challenges?starts_at=gt.' + now + '&is_active=eq.true&order=starts_at.asc&limit=10',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const upcoming = await upcomingRes.json();

            const completedRes = await fetch(
                supabaseUrl + '/rest/v1/weekly_challenges?ends_at=lt.' + now + '&order=ends_at.desc&limit=20',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const completed = await completedRes.json();

            return new Response(JSON.stringify({
                ok: true,
                data: {
                    active: active || [],
                    upcoming: upcoming || [],
                    completed: completed || []
                }
            }), { status: 200, headers: corsHeaders(origin) });
        }

        const challenges = await rpcRes.json();
        return new Response(JSON.stringify({ ok: true, data: challenges }), {
            status: 200, headers: corsHeaders(origin)
        });

    } catch (err) {
        console.error('challenges GET error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal server error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}

/* ── POST: Join challenge or update progress ───────────────── */
async function handlePost(request, env, origin) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY;

    // Auth required for POST
    const user = await verifyAndGetUser(request, env);
    if (!user) {
        return new Response(JSON.stringify({ ok: false, error: 'Authentication required' }), {
            status: 401, headers: corsHeaders(origin)
        });
    }

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    const action = body.action;
    const challengeId = body.challenge_id;

    if (!challengeId) {
        return new Response(JSON.stringify({ ok: false, error: 'challenge_id is required' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    try {
        switch (action) {
            case 'join': {
                // Use RPC
                const joinRes = await fetch(supabaseUrl + '/rest/v1/rpc/join_challenge', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({
                        p_user_id: user.userId,
                        p_challenge_id: challengeId
                    })
                });

                if (!joinRes.ok) {
                    const errText = await joinRes.text();
                    // Parse RPC error message
                    try {
                        const errObj = JSON.parse(errText);
                        return new Response(JSON.stringify({ ok: false, error: errObj.message || 'Failed to join challenge' }), {
                            status: 400, headers: corsHeaders(origin)
                        });
                    } catch (e) {
                        return new Response(JSON.stringify({ ok: false, error: 'Failed to join challenge' }), {
                            status: 400, headers: corsHeaders(origin)
                        });
                    }
                }

                return new Response(JSON.stringify({ ok: true, message: 'Successfully joined challenge' }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            case 'progress': {
                const progressCount = parseInt(body.progress_count) || 0;
                if (progressCount <= 0) {
                    return new Response(JSON.stringify({ ok: false, error: 'progress_count must be positive' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                // Update participant progress
                const updateRes = await fetch(
                    supabaseUrl + '/rest/v1/challenge_participants?user_id=eq.' + encodeURIComponent(user.userId) +
                    '&challenge_id=eq.' + encodeURIComponent(challengeId),
                    {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': supabaseKey,
                            'Authorization': 'Bearer ' + supabaseKey,
                            'Prefer': 'return=representation'
                        },
                        body: JSON.stringify({
                            progress_count: progressCount
                        })
                    }
                );

                if (!updateRes.ok) {
                    return new Response(JSON.stringify({ ok: false, error: 'Failed to update progress' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                const updated = await updateRes.json();
                const participant = updated[0] || {};

                // Check if challenge is now completed
                if (participant.progress_count >= participant.progress_count) {
                    // Get challenge details to check required_count
                    const chRes = await fetch(
                        supabaseUrl + '/rest/v1/weekly_challenges?id=eq.' + encodeURIComponent(challengeId) + '&select=required_count,reward_coins,reward_xp&limit=1',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                    );
                    const challenges = await chRes.json();
                    if (challenges && challenges.length > 0) {
                        const ch = challenges[0];
                        if (progressCount >= ch.required_count && !participant.completed_at) {
                            // Mark as completed
                            await fetch(
                                supabaseUrl + '/rest/v1/challenge_participants?user_id=eq.' + encodeURIComponent(user.userId) +
                                '&challenge_id=eq.' + encodeURIComponent(challengeId),
                                {
                                    method: 'PATCH',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'apikey': supabaseKey,
                                        'Authorization': 'Bearer ' + supabaseKey
                                    },
                                    body: JSON.stringify({ completed_at: new Date().toISOString() })
                                }
                            );

                            // Award coins
                            if (ch.reward_coins > 0) {
                                await fetch(supabaseUrl + '/rest/v1/rpc/credit_coins', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'apikey': supabaseKey,
                                        'Authorization': 'Bearer ' + supabaseKey
                                    },
                                    body: JSON.stringify({
                                        p_user_id: user.userId,
                                        p_amount: ch.reward_coins,
                                        p_type: 'challenge_bonus',
                                        p_description: 'Challenge completion reward',
                                        p_reference_id: challengeId,
                                        p_reference_type: 'challenge',
                                        p_coin_source: 'earned'
                                    })
                                });
                            }

                            // Award XP
                            if (ch.reward_xp > 0) {
                                await fetch(supabaseUrl + '/rest/v1/rpc/award_writer_xp', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'apikey': supabaseKey,
                                        'Authorization': 'Bearer ' + supabaseKey
                                    },
                                    body: JSON.stringify({
                                        p_user_id: user.userId,
                                        p_xp: ch.reward_xp,
                                        p_reason: 'complete_challenge',
                                        p_article_id: null
                                    })
                                });
                            }
                        }
                    }
                }

                return new Response(JSON.stringify({ ok: true, data: participant }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            default:
                return new Response(JSON.stringify({ ok: false, error: 'Unknown action: ' + action }), {
                    status: 400, headers: corsHeaders(origin)
                });
        }
    } catch (err) {
        console.error('challenges POST error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal server error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}
