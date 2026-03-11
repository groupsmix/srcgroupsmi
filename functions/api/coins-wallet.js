/**
 * /api/coins-wallet — Wallet Operations API
 *
 * Handles wallet balance checks, transaction history, and withdrawal requests.
 * All endpoints require authentication via Bearer token.
 *
 * GET  /api/coins-wallet?action=balance          — Get wallet balance
 * GET  /api/coins-wallet?action=transactions&limit=20&offset=0&type=  — Transaction history
 * GET  /api/coins-wallet?action=packages          — Get available coin packages
 * GET  /api/coins-wallet?action=withdrawals       — Get user's withdrawal requests
 * POST /api/coins-wallet  { action: 'withdraw', coins_amount, payment_method, payment_details }
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
    if (!authHeader.startsWith('Bearer ')) throw new Error('Unauthorized');

    const token = authHeader.replace('Bearer ', '');
    const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
        headers: { 'Authorization': 'Bearer ' + token, 'apikey': supabaseKey }
    });
    if (!userRes.ok) throw new Error('Invalid token');
    const authUser = await userRes.json();

    // Get internal user
    const profileRes = await fetch(
        supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(authUser.id) + '&select=id,role,email&limit=1',
        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    );
    const profiles = await profileRes.json();
    if (!profiles || !profiles.length) throw new Error('User not found');

    return { authId: authUser.id, userId: profiles[0].id, role: profiles[0].role, email: profiles[0].email };
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

    // Verify authentication
    let user;
    try {
        user = await verifyAndGetUser(request, env);
    } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: 401, headers: corsHeaders(origin)
        });
    }

    // Route based on method
    if (request.method === 'GET') {
        return handleGet(request, env, user, origin);
    } else if (request.method === 'POST') {
        return handlePost(request, env, user, origin);
    }

    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405, headers: corsHeaders(origin)
    });
}

/* ── GET handler ───────────────────────────────────────────── */
async function handleGet(request, env, user, origin) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY;
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'balance';

    try {
        switch (action) {
            case 'balance': {
                // Ensure wallet exists and get balance
                const res = await fetch(supabaseUrl + '/rest/v1/rpc/ensure_user_wallet', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({ p_user_id: user.userId })
                });

                // Get full wallet data
                const walletRes = await fetch(
                    supabaseUrl + '/rest/v1/user_wallets?user_id=eq.' + encodeURIComponent(user.userId) + '&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const wallets = await walletRes.json();
                return new Response(JSON.stringify({ ok: true, data: wallets[0] || null }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            case 'transactions': {
                const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 100);
                const offset = parseInt(url.searchParams.get('offset')) || 0;
                const type = url.searchParams.get('type') || '';

                let query = supabaseUrl + '/rest/v1/wallet_transactions?user_id=eq.' + encodeURIComponent(user.userId) +
                    '&order=created_at.desc&limit=' + limit + '&offset=' + offset;

                if (type) {
                    query += '&type=eq.' + encodeURIComponent(type);
                }

                const txnRes = await fetch(query, {
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey,
                        'Prefer': 'count=estimated'
                    }
                });
                const txns = await txnRes.json();
                const count = txnRes.headers.get('content-range');

                return new Response(JSON.stringify({
                    ok: true,
                    data: txns || [],
                    count: count ? parseInt(count.split('/')[1]) || 0 : (txns || []).length
                }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            case 'packages': {
                const pkgRes = await fetch(
                    supabaseUrl + '/rest/v1/coin_packages?is_active=eq.true&order=price_usd.asc',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const packages = await pkgRes.json();
                return new Response(JSON.stringify({ ok: true, data: packages || [] }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            case 'withdrawals': {
                const wRes = await fetch(
                    supabaseUrl + '/rest/v1/withdrawal_requests?user_id=eq.' + encodeURIComponent(user.userId) + '&order=created_at.desc',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const withdrawals = await wRes.json();
                return new Response(JSON.stringify({ ok: true, data: withdrawals || [] }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            default:
                return new Response(JSON.stringify({ ok: false, error: 'Unknown action: ' + action }), {
                    status: 400, headers: corsHeaders(origin)
                });
        }
    } catch (err) {
        console.error('coins-wallet GET error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal server error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}

/* ── POST handler ──────────────────────────────────────────── */
async function handlePost(request, env, user, origin) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY;

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    const action = body.action;

    try {
        switch (action) {
            case 'withdraw': {
                const coinsAmount = parseInt(body.coins_amount) || 0;
                const paymentMethod = (body.payment_method || '').trim();
                const paymentDetails = body.payment_details || {};

                // Validate
                if (coinsAmount < 1000) {
                    return new Response(JSON.stringify({ ok: false, error: 'Minimum withdrawal is 1,000 coins' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                if (!paymentMethod) {
                    return new Response(JSON.stringify({ ok: false, error: 'Payment method is required' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                const allowedMethods = ['paypal', 'wise', 'bank'];
                if (!allowedMethods.includes(paymentMethod)) {
                    return new Response(JSON.stringify({ ok: false, error: 'Invalid payment method. Allowed: ' + allowedMethods.join(', ') }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                // Check balance
                const walletRes = await fetch(
                    supabaseUrl + '/rest/v1/user_wallets?user_id=eq.' + encodeURIComponent(user.userId) + '&select=coins_balance&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const wallets = await walletRes.json();
                if (!wallets || !wallets.length || wallets[0].coins_balance < coinsAmount) {
                    return new Response(JSON.stringify({ ok: false, error: 'Insufficient balance' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                // Check for existing pending withdrawals
                const pendingRes = await fetch(
                    supabaseUrl + '/rest/v1/withdrawal_requests?user_id=eq.' + encodeURIComponent(user.userId) +
                    '&status=eq.pending&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const pending = await pendingRes.json();
                if (pending && pending.length > 0) {
                    return new Response(JSON.stringify({ ok: false, error: 'You already have a pending withdrawal request. Please wait for it to be processed.' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                // Calculate USD (70% payout rate: $0.007 per coin)
                var usdAmount = coinsAmount * 0.007;

                // Create withdrawal request
                const wRes = await fetch(supabaseUrl + '/rest/v1/withdrawal_requests', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey,
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        user_id: user.userId,
                        coins_amount: coinsAmount,
                        usd_amount: usdAmount,
                        payment_method: paymentMethod,
                        payment_details: paymentDetails,
                        status: 'pending'
                    })
                });

                if (!wRes.ok) {
                    const errText = await wRes.text();
                    console.error('Withdrawal request error:', errText);
                    return new Response(JSON.stringify({ ok: false, error: 'Failed to create withdrawal request' }), {
                        status: 500, headers: corsHeaders(origin)
                    });
                }

                // Hold coins (debit from wallet)
                await fetch(supabaseUrl + '/rest/v1/rpc/debit_coins', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({
                        p_user_id: user.userId,
                        p_amount: coinsAmount,
                        p_type: 'withdrawal',
                        p_description: 'Withdrawal request: ' + coinsAmount + ' coins ($' + usdAmount.toFixed(2) + ') via ' + paymentMethod
                    })
                });

                const withdrawal = await wRes.json();
                return new Response(JSON.stringify({ ok: true, data: withdrawal[0] || withdrawal }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            default:
                return new Response(JSON.stringify({ ok: false, error: 'Unknown action: ' + action }), {
                    status: 400, headers: corsHeaders(origin)
                });
        }
    } catch (err) {
        console.error('coins-wallet POST error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal server error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}
