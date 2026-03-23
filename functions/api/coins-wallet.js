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

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';
import { errorResponse, successResponse } from './_shared/response.js';
import { requireAuthWithProfile } from './_shared/auth.js';

function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

/* ── Main handler ──────────────────────────────────────────── */
export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || 'https://groupsmix.com';

    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return errorResponse('Server configuration error', 500, origin);
    }

    // Verify authentication using shared auth helper
    let user;
    try {
        const authResult = await requireAuthWithProfile(request, env, 'id,role,email,phone_verified,phone_number,identity_verified');
        user = {
            authId: authResult.authId,
            userId: authResult.userId,
            role: authResult.profile.role,
            email: authResult.profile.email,
            phone_verified: authResult.profile.phone_verified || false,
            phone_number: authResult.profile.phone_number || '',
            identity_verified: authResult.profile.identity_verified || false
        };
    } catch (err) {
        return errorResponse(err.message, 401, origin);
    }

    // Route based on method
    if (request.method === 'GET') {
        return handleGet(request, env, user, origin);
    } else if (request.method === 'POST') {
        return handlePost(request, env, user, origin);
    }

    return errorResponse('Method not allowed', 405, origin);
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
                const walletData = wallets[0] || null;

                // Ensure split balance fields are present
                if (walletData) {
                    walletData.purchased_balance = walletData.purchased_balance || 0;
                    walletData.earned_balance = walletData.earned_balance || 0;
                }

                return successResponse({
                    data: walletData,
                    identity: {
                        email_verified: !!(user.email),
                        phone_verified: user.phone_verified,
                        identity_verified: user.identity_verified
                    }
                }, origin);
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

                return successResponse({
                    data: txns || [],
                    count: count ? parseInt(count.split('/')[1]) || 0 : (txns || []).length
                }, origin);
            }

            case 'packages': {
                const pkgRes = await fetch(
                    supabaseUrl + '/rest/v1/coin_packages?is_active=eq.true&order=price_usd.asc',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const packages = await pkgRes.json();
                return successResponse({ data: packages || [] }, origin);
            }

            case 'withdrawals': {
                const wRes = await fetch(
                    supabaseUrl + '/rest/v1/withdrawal_requests?user_id=eq.' + encodeURIComponent(user.userId) + '&order=created_at.desc',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const withdrawals = await wRes.json();
                return successResponse({ data: withdrawals || [] }, origin);
            }

            case 'escrow-status': {
                // Get escrow transactions for this user (as buyer or seller)
                const escrowRole = url.searchParams.get('role') || 'buyer';
                const escrowField = escrowRole === 'seller' ? 'seller_id' : 'buyer_id';
                const escrowRes = await fetch(
                    supabaseUrl + '/rest/v1/escrow_transactions?' + escrowField + '=eq.' + encodeURIComponent(user.userId) + '&order=created_at.desc&limit=50',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const escrows = await escrowRes.json();
                return successResponse({ data: escrows || [] }, origin);
            }

            case 'spending-insights': {
                // Server-side aggregation via RPC (replaces client-side 500-txn fetch)
                const insightDays = parseInt(url.searchParams.get('days')) || 30;

                const insightRes = await fetch(supabaseUrl + '/rest/v1/rpc/get_spending_insights', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({
                        p_user_id: user.userId,
                        p_days: insightDays
                    })
                });

                if (!insightRes.ok) {
                    console.error('Spending insights RPC error:', await insightRes.text());
                    return errorResponse('Failed to fetch spending insights', 500, origin);
                }

                const insightResult = await insightRes.json();
                return new Response(JSON.stringify(insightResult), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            case 'earn-more': {
                // Parallelize all 3 independent data fetches (NEW-PERF-2)
                const [profileRes2, walletRes2, recentTxnRes] = await Promise.all([
                    fetch(
                        supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(user.authId) +
                        '&select=id,display_name,photo_url,bio,article_count,writer_xp,gxp,referral_code,last_active_at,created_at&limit=1',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                    ),
                    fetch(
                        supabaseUrl + '/rest/v1/user_wallets?user_id=eq.' + encodeURIComponent(user.userId) + '&limit=1',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                    ),
                    fetch(
                        supabaseUrl + '/rest/v1/wallet_transactions?user_id=eq.' + encodeURIComponent(user.userId) +
                        '&order=created_at.desc&select=type,amount,created_at&limit=50',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                    )
                ]);
                const profile = (await profileRes2.json())[0] || {};
                const wallet = ((await walletRes2.json()) || [])[0] || {};
                let recentTxns = await recentTxnRes.json();
                recentTxns = Array.isArray(recentTxns) ? recentTxns : [];

                // Analyze activity patterns
                const hasWritten = recentTxns.some((t) => { return t.type === 'article_reward'; });
                const hasReferred = recentTxns.some((t) => { return t.type === 'referral' || t.type === 'referral_bonus'; });
                const hasReviewed = recentTxns.some((t) => { return t.type === 'review_reward'; });
                const hasTipped = recentTxns.some((t) => { return t.type === 'tip_received'; });
                const daysSinceSignup = Math.max(1, (Date.now() - new Date(profile.created_at || Date.now()).getTime()) / 86400000);
                const isNewUser = daysSinceSignup < 7;

                const suggestions = [];

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

                // Activity-based personalized suggestions
                if (hasWritten && (profile.article_count || 0) >= 5) {
                    suggestions.push({
                        type: 'write_pro',
                        icon: 'award',
                        title: 'Write a Premium Article',
                        title_ar: 'اكتب مقالاً مميزاً',
                        description: 'With ' + profile.article_count + ' articles, you qualify for premium writer rewards (up to 500 coins). Write an in-depth guide or tutorial!',
                        description_ar: 'مع ' + profile.article_count + ' مقال، تأهلت لمكافآت الكتّاب المميزين (حتى 500 عملة).',
                        potential_coins: 500,
                        action_url: '/pages/user/write-article.html',
                        priority: 'high'
                    });
                }

                if (hasTipped) {
                    suggestions.push({
                        type: 'engage',
                        icon: 'heart',
                        title: 'Keep Engaging — Tips Come Back!',
                        title_ar: 'استمر بالتفاعل — الإكراميات ترجع!',
                        description: 'You\'ve received tips before. Active writers who engage with comments earn 2x more tips on average.',
                        description_ar: 'لقد تلقيت إكراميات سابقاً. الكتّاب النشطون يكسبون ضعف الإكراميات.',
                        potential_coins: 50,
                        action_url: '/pages/user/articles.html',
                        priority: 'medium'
                    });
                }

                if (isNewUser) {
                    suggestions.push({
                        type: 'onboarding',
                        icon: 'gift',
                        title: 'Complete Your Onboarding',
                        title_ar: 'أكمل خطوات البداية',
                        description: 'New users who complete their profile within the first week earn a 50 coin bonus!',
                        description_ar: 'المستخدمون الجدد الذين يكملون ملفهم خلال الأسبوع الأول يحصلون على 50 عملة إضافية!',
                        potential_coins: 50,
                        action_url: '/pages/user/settings.html',
                        priority: 'high'
                    });
                }

                if (!hasReviewed) {
                    suggestions.push({
                        type: 'review',
                        icon: 'star',
                        title: 'Write Your First Review',
                        title_ar: 'اكتب أول تقييم لك',
                        description: 'Earn 15 coins for your first group review. Detailed reviews earn bonus tips from group owners!',
                        description_ar: 'اربح 15 عملة لأول تقييم. التقييمات المفصّلة تكسب إكراميات إضافية!',
                        potential_coins: 15,
                        action_url: '/',
                        priority: 'medium'
                    });
                }

                // Sort by priority
                const priorityOrder = { high: 0, medium: 1, low: 2 };
                suggestions.sort((a, b) => {
                    return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
                });

                return successResponse({
                    data: {
                        suggestions: suggestions,
                        current_balance: wallet.coins_balance || 0,
                        is_low_balance: (wallet.coins_balance || 0) < 100,
                        total_potential: suggestions.reduce((s, sg) => { return s + (sg.potential_coins || 0); }, 0),
                        user_activity: {
                            has_written: hasWritten,
                            has_referred: hasReferred,
                            has_reviewed: hasReviewed,
                            has_received_tips: hasTipped,
                            is_new_user: isNewUser,
                            days_since_signup: Math.round(daysSinceSignup)
                        }
                    }
                }, origin);
            }

            default:
                return errorResponse('Unknown action: ' + action, 400, origin);
        }
    } catch (err) {
        console.error('coins-wallet GET error:', err);
        return errorResponse('Internal server error', 500, origin);
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
        return errorResponse('Invalid JSON', 400, origin);
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
                    return errorResponse('Minimum cashout is 5,000 earned coins ($50)', 400, origin);
                }

                if (!paymentMethod) {
                    return errorResponse('Payment method is required', 400, origin);
                }

                const allowedMethods = ['paypal', 'wise', 'bank', 'crypto'];
                if (!allowedMethods.includes(paymentMethod)) {
                    return errorResponse('Invalid payment method. Allowed: ' + allowedMethods.join(', '), 400, origin);
                }

                // Identity verification: email required
                if (!user.email) {
                    return errorResponse('Email verification is required before you can cash out.', 400, origin);
                }

                // Get cashout fee from config
                let feePercent = 10;
                try {
                    const configRes = await fetch(
                        supabaseUrl + '/rest/v1/platform_config?key=eq.cashout_fee_percent&limit=1',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                    );
                    const configData = await configRes.json();
                    if (configData && configData.length > 0) {
                        feePercent = parseInt(configData[0].value) || 10;
                    }
                } catch (e) { /* use default */ }

                // Atomic withdrawal via RPC (prevents race conditions with FOR UPDATE lock)
                const wRes = await fetch(supabaseUrl + '/rest/v1/rpc/create_withdrawal', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({
                        p_user_id: user.userId,
                        p_coins_amount: coinsAmount,
                        p_payment_method: paymentMethod,
                        p_payment_details: paymentDetails,
                        p_fee_percent: feePercent
                    })
                });

                if (!wRes.ok) {
                    const errText = await wRes.text();
                    console.error('Withdrawal RPC error:', errText);
                    return errorResponse('Failed to create withdrawal request', 500, origin);
                }

                const result = await wRes.json();
                if (result.ok === false) {
                    return new Response(JSON.stringify(result), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                return new Response(JSON.stringify(result), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            case 'escrow-create': {
                // Create an escrow transaction — atomic RPC prevents race conditions
                const escrowSellerId = (body.seller_id || '').trim();
                const escrowProductId = (body.product_id || '').trim();
                const escrowAmount = parseInt(body.amount) || 0;
                const escrowProductName = (body.product_name || 'Product').substring(0, 200);

                if (!escrowSellerId || !escrowProductId || !escrowAmount) {
                    return errorResponse('Missing seller_id, product_id, or amount', 400, origin);
                }

                // Atomic escrow via RPC (prevents race conditions with FOR UPDATE lock)
                const escrowRes2 = await fetch(supabaseUrl + '/rest/v1/rpc/create_escrow', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({
                        p_buyer_id: user.userId,
                        p_seller_id: escrowSellerId,
                        p_product_id: escrowProductId,
                        p_amount: escrowAmount,
                        p_product_name: escrowProductName
                    })
                });

                if (!escrowRes2.ok) {
                    const errText = await escrowRes2.text();
                    console.error('Escrow RPC error:', errText);
                    return errorResponse('Failed to create escrow', 500, origin);
                }

                const escrowResult = await escrowRes2.json();
                if (escrowResult.ok === false) {
                    return new Response(JSON.stringify(escrowResult), {
                        status: 400, headers: corsHeaders(origin)
                    });
                }

                // Notify seller (non-critical, fire-and-forget)
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

                return new Response(JSON.stringify(escrowResult), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            case 'escrow-confirm': {
                // Buyer confirms delivery — release coins to seller
                const confirmEscrowId = (body.escrow_id || '').trim();
                if (!confirmEscrowId) {
                    return errorResponse('Missing escrow_id', 400, origin);
                }

                // Get escrow record
                const getEscrowRes = await fetch(
                    supabaseUrl + '/rest/v1/escrow_transactions?id=eq.' + encodeURIComponent(confirmEscrowId) + '&status=eq.held&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const escrowRecords = await getEscrowRes.json();
                if (!escrowRecords || !escrowRecords.length) {
                    return errorResponse('Escrow not found or already resolved', 404, origin);
                }
                const escrowRecord = escrowRecords[0];

                // Verify the confirmer is the buyer
                if (escrowRecord.buyer_id !== user.userId) {
                    return errorResponse('Only the buyer can confirm delivery', 403, origin);
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

                return successResponse({
                    message: 'Delivery confirmed. ' + escrowRecord.amount + ' coins released to seller.'
                }, origin);
            }

            case 'escrow-dispute': {
                // Buyer disputes the escrow — freeze funds, notify admin
                const disputeEscrowId = (body.escrow_id || '').trim();
                const disputeReason = (body.reason || '').substring(0, 500).trim();

                if (!disputeEscrowId || !disputeReason) {
                    return errorResponse('Missing escrow_id or reason', 400, origin);
                }

                // Verify buyer owns this escrow
                const getDispEscrow = await fetch(
                    supabaseUrl + '/rest/v1/escrow_transactions?id=eq.' + encodeURIComponent(disputeEscrowId) + '&buyer_id=eq.' + encodeURIComponent(user.userId) + '&status=eq.held&limit=1',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const dispEscrows = await getDispEscrow.json();
                if (!dispEscrows || !dispEscrows.length) {
                    return errorResponse('Escrow not found or not eligible for dispute', 404, origin);
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

                return successResponse({
                    message: 'Escrow disputed. Funds are frozen and an admin will review within 48 hours.'
                }, origin);
            }

            default:
                return errorResponse('Unknown action: ' + action, 400, origin);
        }
    } catch (err) {
        console.error('coins-wallet POST error:', err);
        return errorResponse('Internal server error', 500, origin);
    }
}
