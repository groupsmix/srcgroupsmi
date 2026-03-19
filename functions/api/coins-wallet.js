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

    // Get internal user with identity verification fields
    const profileRes = await fetch(
        supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(authUser.id) + '&select=id,role,email,phone_verified,phone_number,identity_verified&limit=1',
        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    );
    const profiles = await profileRes.json();
    if (!profiles || !profiles.length) throw new Error('User not found');

    return {
        authId: authUser.id,
        userId: profiles[0].id,
        role: profiles[0].role,
        email: profiles[0].email,
        phone_verified: profiles[0].phone_verified || false,
        phone_number: profiles[0].phone_number || '',
        identity_verified: profiles[0].identity_verified || false
    };
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

                // Get full wallet data including split balances
                const walletRes = await fetch(
                    supabaseUrl + '/rest/v1/user_wallets?user_id=eq.' + encodeURIComponent(user.userId) + '&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const wallets = await walletRes.json();
                var walletData = wallets[0] || null;

                // Ensure split balance fields are present
                if (walletData) {
                    walletData.purchased_balance = walletData.purchased_balance || 0;
                    walletData.earned_balance = walletData.earned_balance || 0;
                }

                return new Response(JSON.stringify({
                    ok: true,
                    data: walletData,
                    identity: {
                        email_verified: !!(user.email),
                        phone_verified: user.phone_verified,
                        identity_verified: user.identity_verified
                    }
                }), {
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

            case 'escrow-status': {
                // Get escrow transactions for this user (as buyer or seller)
                const escrowRole = url.searchParams.get('role') || 'buyer';
                var escrowField = escrowRole === 'seller' ? 'seller_id' : 'buyer_id';
                const escrowRes = await fetch(
                    supabaseUrl + '/rest/v1/escrow_transactions?' + escrowField + '=eq.' + encodeURIComponent(user.userId) + '&order=created_at.desc&limit=50',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const escrows = await escrowRes.json();
                return new Response(JSON.stringify({ ok: true, data: escrows || [] }), {
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

                // Validate minimum (5,000 coins = $50)
                if (coinsAmount < 5000) {
                    return new Response(JSON.stringify({ ok: false, error: 'Minimum cashout is 5,000 earned coins ($50)' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                if (!paymentMethod) {
                    return new Response(JSON.stringify({ ok: false, error: 'Payment method is required' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                const allowedMethods = ['paypal', 'wise', 'bank', 'crypto'];
                if (!allowedMethods.includes(paymentMethod)) {
                    return new Response(JSON.stringify({ ok: false, error: 'Invalid payment method. Allowed: ' + allowedMethods.join(', ') }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                // Identity verification: email required
                if (!user.email) {
                    return new Response(JSON.stringify({ ok: false, error: 'Email verification is required before you can cash out.' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                // Check EARNED balance (only earned coins can be cashed out)
                const walletRes = await fetch(
                    supabaseUrl + '/rest/v1/user_wallets?user_id=eq.' + encodeURIComponent(user.userId) + '&select=coins_balance,purchased_balance,earned_balance&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const wallets = await walletRes.json();
                if (!wallets || !wallets.length) {
                    return new Response(JSON.stringify({ ok: false, error: 'Wallet not found' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                var earnedBalance = wallets[0].earned_balance || 0;
                if (earnedBalance < coinsAmount) {
                    return new Response(JSON.stringify({
                        ok: false,
                        error: 'Insufficient earned coin balance. You have ' + earnedBalance + ' earned coins available for cashout. Bought coins cannot be cashed out.',
                        earned_balance: earnedBalance
                    }), {
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

                // Get cashout fee from config
                var feePercent = 10;
                try {
                    var configRes = await fetch(
                        supabaseUrl + '/rest/v1/platform_config?key=eq.cashout_fee_percent&limit=1',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                    );
                    var configData = await configRes.json();
                    if (configData && configData.length > 0) {
                        feePercent = parseInt(configData[0].value) || 10;
                    }
                } catch (e) { /* use default */ }

                // Calculate fee and payout
                var feeCoins = Math.floor(coinsAmount * feePercent / 100);
                var payoutCoins = coinsAmount - feeCoins;
                var usdAmount = payoutCoins * 0.01; // $1 = 100 coins → $0.01 per coin

                // Create withdrawal request with fee details
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
                        status: 'pending',
                        fee_percent: feePercent,
                        fee_amount: feeCoins * 0.01,
                        payout_amount: usdAmount
                    })
                });

                if (!wRes.ok) {
                    const errText = await wRes.text();
                    console.error('Withdrawal request error:', errText);
                    return new Response(JSON.stringify({ ok: false, error: 'Failed to create withdrawal request' }), {
                        status: 500, headers: corsHeaders(origin)
                    });
                }

                // Debit earned coins from wallet (withdrawal only touches earned balance)
                // We directly update earned_balance to prevent debit_coins from spending purchased first
                await fetch(supabaseUrl + '/rest/v1/user_wallets?user_id=eq.' + encodeURIComponent(user.userId), {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({
                        coins_balance: wallets[0].coins_balance - coinsAmount,
                        earned_balance: earnedBalance - coinsAmount,
                        total_withdrawn: (wallets[0].total_withdrawn || 0) + coinsAmount,
                        pending_withdrawal: (wallets[0].pending_withdrawal || 0) + coinsAmount,
                        updated_at: new Date().toISOString()
                    })
                });

                // Log the withdrawal transaction
                await fetch(supabaseUrl + '/rest/v1/wallet_transactions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({
                        user_id: user.userId,
                        type: 'withdrawal',
                        amount: -coinsAmount,
                        balance_after: wallets[0].coins_balance - coinsAmount,
                        description: 'Cashout request: ' + coinsAmount + ' earned coins (fee: ' + feePercent + '%, payout: $' + usdAmount.toFixed(2) + ') via ' + paymentMethod,
                        coin_source: 'earned',
                        metadata: JSON.stringify({ fee_percent: feePercent, fee_coins: feeCoins, payout_usd: usdAmount, payment_method: paymentMethod })
                    })
                });

                // Log platform revenue from cashout fee
                if (feeCoins > 0) {
                    await fetch(supabaseUrl + '/rest/v1/platform_revenue', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': supabaseKey,
                            'Authorization': 'Bearer ' + supabaseKey
                        },
                        body: JSON.stringify({
                            source: 'cashout_fee',
                            amount: feeCoins,
                            reference_type: 'withdrawal',
                            metadata: JSON.stringify({ user_id: user.userId, coins_amount: coinsAmount, fee_percent: feePercent, payout_usd: usdAmount })
                        })
                    });
                }

                const withdrawal = await wRes.json();
                return new Response(JSON.stringify({
                    ok: true,
                    data: withdrawal[0] || withdrawal,
                    fee: { percent: feePercent, coins: feeCoins, payout_usd: usdAmount }
                }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            case 'escrow-create': {
                // Create an escrow transaction — hold coins until buyer confirms delivery
                const escrowSellerId = (body.seller_id || '').trim();
                const escrowProductId = (body.product_id || '').trim();
                const escrowAmount = parseInt(body.amount) || 0;
                const escrowProductName = (body.product_name || 'Product').substring(0, 200);

                if (!escrowSellerId || !escrowProductId || !escrowAmount) {
                    return new Response(JSON.stringify({ ok: false, error: 'Missing seller_id, product_id, or amount' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                if (escrowAmount < 1) {
                    return new Response(JSON.stringify({ ok: false, error: 'Amount must be at least 1 coin' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                if (escrowSellerId === user.userId) {
                    return new Response(JSON.stringify({ ok: false, error: 'Cannot buy from yourself' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                // Check buyer's balance
                const buyerWalletRes = await fetch(
                    supabaseUrl + '/rest/v1/user_wallets?user_id=eq.' + encodeURIComponent(user.userId) + '&select=coins_balance&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const buyerWallets = await buyerWalletRes.json();
                if (!buyerWallets || !buyerWallets.length || (buyerWallets[0].coins_balance || 0) < escrowAmount) {
                    return new Response(JSON.stringify({ ok: false, error: 'Insufficient balance. You need ' + escrowAmount + ' coins.' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                // Debit coins from buyer (hold in escrow)
                const debitRes = await fetch(supabaseUrl + '/rest/v1/rpc/debit_coins', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({
                        p_user_id: user.userId,
                        p_amount: escrowAmount,
                        p_type: 'escrow_hold',
                        p_description: 'Escrow hold for ' + escrowProductName,
                        p_reference_id: escrowProductId,
                        p_reference_type: 'escrow'
                    })
                });

                if (!debitRes.ok) {
                    return new Response(JSON.stringify({ ok: false, error: 'Failed to hold coins in escrow' }), {
                        status: 500, headers: corsHeaders(origin)
                    });
                }

                // Create escrow record
                var autoReleaseAt = new Date(Date.now() + 7 * 86400000).toISOString(); // 7 days auto-release
                const escrowCreateRes = await fetch(supabaseUrl + '/rest/v1/escrow_transactions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey,
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        buyer_id: user.userId,
                        seller_id: escrowSellerId,
                        product_id: escrowProductId,
                        product_name: escrowProductName,
                        amount: escrowAmount,
                        status: 'held',
                        auto_release_at: autoReleaseAt
                    })
                });

                if (!escrowCreateRes.ok) {
                    // Refund the debit if escrow record creation fails
                    await fetch(supabaseUrl + '/rest/v1/rpc/credit_coins', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                        body: JSON.stringify({ p_user_id: user.userId, p_amount: escrowAmount, p_type: 'escrow_refund', p_description: 'Escrow creation failed — refund', p_reference_type: 'escrow_refund' })
                    });
                    return new Response(JSON.stringify({ ok: false, error: 'Failed to create escrow record' }), {
                        status: 500, headers: corsHeaders(origin)
                    });
                }

                const escrowData = await escrowCreateRes.json();

                // Notify seller
                await fetch(supabaseUrl + '/rest/v1/notifications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                    body: JSON.stringify({
                        uid: escrowSellerId,
                        type: 'escrow_created',
                        title: 'New Escrow Purchase!',
                        message: escrowAmount + ' GMX Coins held in escrow for ' + escrowProductName + '. Deliver the product so the buyer can confirm.',
                        link: '/pages/user/escrow.html'
                    })
                });

                return new Response(JSON.stringify({
                    ok: true,
                    data: escrowData[0] || escrowData,
                    message: escrowAmount + ' coins held in escrow. Seller must deliver within 7 days, then you confirm to release funds.'
                }), { status: 200, headers: corsHeaders(origin) });
            }

            case 'escrow-confirm': {
                // Buyer confirms delivery — release coins to seller
                const confirmEscrowId = (body.escrow_id || '').trim();
                if (!confirmEscrowId) {
                    return new Response(JSON.stringify({ ok: false, error: 'Missing escrow_id' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                // Get escrow record
                const getEscrowRes = await fetch(
                    supabaseUrl + '/rest/v1/escrow_transactions?id=eq.' + encodeURIComponent(confirmEscrowId) + '&status=eq.held&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const escrowRecords = await getEscrowRes.json();
                if (!escrowRecords || !escrowRecords.length) {
                    return new Response(JSON.stringify({ ok: false, error: 'Escrow not found or already resolved' }), {
                        status: 404, headers: corsHeaders(origin)
                    });
                }
                var escrowRecord = escrowRecords[0];

                // Verify the confirmer is the buyer
                if (escrowRecord.buyer_id !== user.userId) {
                    return new Response(JSON.stringify({ ok: false, error: 'Only the buyer can confirm delivery' }), {
                        status: 403, headers: corsHeaders(origin)
                    });
                }

                // Credit coins to seller
                await fetch(supabaseUrl + '/rest/v1/rpc/credit_coins', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                    body: JSON.stringify({
                        p_user_id: escrowRecord.seller_id,
                        p_amount: escrowRecord.amount,
                        p_type: 'escrow_release',
                        p_description: 'Escrow released for ' + (escrowRecord.product_name || 'product'),
                        p_reference_id: confirmEscrowId,
                        p_reference_type: 'escrow_release',
                        p_coin_source: 'earned'
                    })
                });

                // Update escrow status
                await fetch(supabaseUrl + '/rest/v1/escrow_transactions?id=eq.' + encodeURIComponent(confirmEscrowId), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                    body: JSON.stringify({ status: 'completed', completed_at: new Date().toISOString() })
                });

                // Notify seller of payment release
                await fetch(supabaseUrl + '/rest/v1/notifications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                    body: JSON.stringify({
                        uid: escrowRecord.seller_id,
                        type: 'escrow_released',
                        title: 'Payment Released!',
                        message: escrowRecord.amount + ' GMX Coins from escrow for ' + (escrowRecord.product_name || 'product') + ' have been added to your wallet.',
                        link: '/pages/user/wallet.html'
                    })
                });

                return new Response(JSON.stringify({
                    ok: true,
                    message: 'Delivery confirmed. ' + escrowRecord.amount + ' coins released to seller.'
                }), { status: 200, headers: corsHeaders(origin) });
            }

            case 'escrow-dispute': {
                // Buyer disputes the escrow — freeze funds, notify admin
                const disputeEscrowId = (body.escrow_id || '').trim();
                const disputeReason = (body.reason || '').substring(0, 500).trim();

                if (!disputeEscrowId || !disputeReason) {
                    return new Response(JSON.stringify({ ok: false, error: 'Missing escrow_id or reason' }), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                // Verify buyer owns this escrow
                const getDispEscrow = await fetch(
                    supabaseUrl + '/rest/v1/escrow_transactions?id=eq.' + encodeURIComponent(disputeEscrowId) + '&buyer_id=eq.' + encodeURIComponent(user.userId) + '&status=eq.held&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const dispEscrows = await getDispEscrow.json();
                if (!dispEscrows || !dispEscrows.length) {
                    return new Response(JSON.stringify({ ok: false, error: 'Escrow not found or not eligible for dispute' }), {
                        status: 404, headers: corsHeaders(origin)
                    });
                }

                // Update escrow to disputed
                await fetch(supabaseUrl + '/rest/v1/escrow_transactions?id=eq.' + encodeURIComponent(disputeEscrowId), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                    body: JSON.stringify({ status: 'disputed', dispute_reason: disputeReason, disputed_at: new Date().toISOString() })
                });

                // Notify seller
                await fetch(supabaseUrl + '/rest/v1/notifications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                    body: JSON.stringify({
                        uid: dispEscrows[0].seller_id,
                        type: 'escrow_disputed',
                        title: 'Escrow Disputed',
                        message: 'The buyer has disputed the escrow for ' + (dispEscrows[0].product_name || 'product') + '. An admin will mediate.',
                        link: '/pages/user/escrow.html'
                    })
                });

                return new Response(JSON.stringify({
                    ok: true,
                    message: 'Escrow disputed. Funds are frozen and an admin will review within 48 hours.'
                }), { status: 200, headers: corsHeaders(origin) });
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
