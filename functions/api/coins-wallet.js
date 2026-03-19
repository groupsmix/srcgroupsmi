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

            case 'spending-insights': {
                // Fetch all transactions for this user to build spending breakdown
                const insightDays = parseInt(url.searchParams.get('days')) || 30;
                const insightCutoff = new Date(Date.now() - insightDays * 86400000).toISOString();

                const allTxnRes = await fetch(
                    supabaseUrl + '/rest/v1/wallet_transactions?user_id=eq.' + encodeURIComponent(user.userId) +
                    '&created_at=gte.' + encodeURIComponent(insightCutoff) + '&select=type,amount,created_at,coin_source&order=created_at.desc&limit=500',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const allTxns = await allTxnRes.json();
                var txnList = Array.isArray(allTxns) ? allTxns : [];

                // Categorize spending
                var categories = {
                    tips: { total: 0, count: 0, label: 'Tips Sent' },
                    purchases: { total: 0, count: 0, label: 'Store Purchases' },
                    boosts: { total: 0, count: 0, label: 'Boosts & Promotions' },
                    withdrawals_cat: { total: 0, count: 0, label: 'Withdrawals' },
                    other_spending: { total: 0, count: 0, label: 'Other' }
                };
                var earnings = {
                    purchases_received: { total: 0, count: 0, label: 'Coins Purchased' },
                    tips_received: { total: 0, count: 0, label: 'Tips Received' },
                    rewards: { total: 0, count: 0, label: 'Rewards & Bonuses' },
                    referrals: { total: 0, count: 0, label: 'Referral Bonuses' },
                    other_earning: { total: 0, count: 0, label: 'Other Earnings' }
                };

                // Daily spending for chart data
                var dailySpending = {};
                var dailyEarning = {};

                txnList.forEach(function(t) {
                    var amt = Math.abs(t.amount || 0);
                    var day = (t.created_at || '').substring(0, 10);
                    var txType = t.type || '';

                    if (t.amount < 0) {
                        // Spending
                        if (txType === 'tip_sent' || txType === 'tip') categories.tips.total += amt, categories.tips.count++;
                        else if (txType === 'purchase' || txType === 'store_purchase') categories.purchases.total += amt, categories.purchases.count++;
                        else if (txType === 'boost' || txType === 'promote') categories.boosts.total += amt, categories.boosts.count++;
                        else if (txType === 'withdrawal') categories.withdrawals_cat.total += amt, categories.withdrawals_cat.count++;
                        else categories.other_spending.total += amt, categories.other_spending.count++;

                        dailySpending[day] = (dailySpending[day] || 0) + amt;
                    } else if (t.amount > 0) {
                        // Earnings
                        if (txType === 'purchase' || txType === 'coin_purchase') earnings.purchases_received.total += amt, earnings.purchases_received.count++;
                        else if (txType === 'tip_received') earnings.tips_received.total += amt, earnings.tips_received.count++;
                        else if (txType === 'reward' || txType === 'bonus' || txType === 'signup_bonus') earnings.rewards.total += amt, earnings.rewards.count++;
                        else if (txType === 'referral' || txType === 'referral_bonus') earnings.referrals.total += amt, earnings.referrals.count++;
                        else earnings.other_earning.total += amt, earnings.other_earning.count++;

                        dailyEarning[day] = (dailyEarning[day] || 0) + amt;
                    }
                });

                // Build chart-friendly daily data (last N days)
                var chartData = [];
                for (var d = 0; d < insightDays; d++) {
                    var date = new Date(Date.now() - d * 86400000);
                    var dayKey = date.toISOString().substring(0, 10);
                    chartData.unshift({
                        date: dayKey,
                        spent: dailySpending[dayKey] || 0,
                        earned: dailyEarning[dayKey] || 0
                    });
                }

                var totalSpent = Object.values(categories).reduce(function(s, c) { return s + c.total; }, 0);
                var totalEarned = Object.values(earnings).reduce(function(s, c) { return s + c.total; }, 0);

                return new Response(JSON.stringify({
                    ok: true,
                    data: {
                        period_days: insightDays,
                        total_spent: totalSpent,
                        total_earned: totalEarned,
                        net_flow: totalEarned - totalSpent,
                        spending_breakdown: categories,
                        earning_breakdown: earnings,
                        chart_data: chartData,
                        transaction_count: txnList.length
                    }
                }), { status: 200, headers: corsHeaders(origin) });
            }

            case 'earn-more': {
                // Get user profile data to determine personalized earn suggestions
                var profileRes2 = await fetch(
                    supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(user.authId) +
                    '&select=id,display_name,photo_url,bio,article_count,writer_xp,gxp,referral_code&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                var profile = (await profileRes2.json())[0] || {};

                // Get wallet balance
                var walletRes2 = await fetch(
                    supabaseUrl + '/rest/v1/user_wallets?user_id=eq.' + encodeURIComponent(user.userId) + '&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                var wallet = ((await walletRes2.json()) || [])[0] || {};

                var suggestions = [];

                // Suggest based on what the user hasn't done yet
                if ((profile.article_count || 0) === 0) {
                    suggestions.push({
                        type: 'write',
                        icon: 'pencil',
                        title: 'Write Your First Article',
                        title_ar: 'اكتب أول مقال لك',
                        description: 'Earn 50-200 coins per article. Quality articles earn tips from readers too!',
                        description_ar: 'اربح 50-200 عملة لكل مقال. المقالات المميزة تكسب إكراميات من القراء!',
                        potential_coins: 200,
                        action_url: '/pages/user/write-article.html',
                        priority: 'high'
                    });
                } else if ((profile.article_count || 0) < 5) {
                    suggestions.push({
                        type: 'write',
                        icon: 'pencil',
                        title: 'Write More Articles',
                        title_ar: 'اكتب مزيداً من المقالات',
                        description: 'You have ' + profile.article_count + ' articles. Writers with 5+ articles earn 3x more tips!',
                        description_ar: 'لديك ' + profile.article_count + ' مقالات. الكتّاب بـ 5+ مقالات يكسبون 3 أضعاف الإكراميات!',
                        potential_coins: 150,
                        action_url: '/pages/user/write-article.html',
                        priority: 'high'
                    });
                }

                if (!profile.photo_url) {
                    suggestions.push({
                        type: 'profile',
                        icon: 'camera',
                        title: 'Add a Profile Photo',
                        title_ar: 'أضف صورة شخصية',
                        description: 'Complete your profile to earn 25 bonus coins.',
                        description_ar: 'أكمل ملفك الشخصي للحصول على 25 عملة إضافية.',
                        potential_coins: 25,
                        action_url: '/pages/user/settings.html',
                        priority: 'medium'
                    });
                }

                if (!profile.bio || profile.bio.length < 20) {
                    suggestions.push({
                        type: 'profile',
                        icon: 'edit',
                        title: 'Complete Your Bio',
                        title_ar: 'أكمل النبذة الشخصية',
                        description: 'Add a bio (20+ characters) to earn 15 bonus coins.',
                        description_ar: 'أضف نبذة (20+ حرف) للحصول على 15 عملة إضافية.',
                        potential_coins: 15,
                        action_url: '/pages/user/settings.html',
                        priority: 'medium'
                    });
                }

                if (profile.referral_code) {
                    suggestions.push({
                        type: 'referral',
                        icon: 'users',
                        title: 'Refer Friends',
                        title_ar: 'ادعُ أصدقاءك',
                        description: 'Earn 100 coins for each friend who signs up with your referral code: ' + profile.referral_code,
                        description_ar: 'اربح 100 عملة لكل صديق يسجل برمز الإحالة: ' + profile.referral_code,
                        potential_coins: 100,
                        action_url: '/pages/user/referral.html',
                        priority: 'high'
                    });
                }

                suggestions.push({
                    type: 'engage',
                    icon: 'message-circle',
                    title: 'Review Groups You\'ve Joined',
                    title_ar: 'قيّم المجموعات التي انضممت إليها',
                    description: 'Earn 10 coins per review. Helpful reviews earn extra tips!',
                    description_ar: 'اربح 10 عملات لكل تقييم. التقييمات المفيدة تكسب إكراميات إضافية!',
                    potential_coins: 10,
                    action_url: '/',
                    priority: 'low'
                });

                // Sort by priority
                var priorityOrder = { high: 0, medium: 1, low: 2 };
                suggestions.sort(function(a, b) {
                    return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
                });

                return new Response(JSON.stringify({
                    ok: true,
                    data: {
                        suggestions: suggestions,
                        current_balance: wallet.coins_balance || 0,
                        is_low_balance: (wallet.coins_balance || 0) < 100,
                        total_potential: suggestions.reduce(function(s, sg) { return s + (sg.potential_coins || 0); }, 0)
                    }
                }), { status: 200, headers: corsHeaders(origin) });
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
