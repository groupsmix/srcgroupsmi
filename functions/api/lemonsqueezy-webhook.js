/**
 * /api/lemonsqueezy-webhook — LemonSqueezy Webhook Handler
 *
 * Receives webhooks from LemonSqueezy when products are created/updated/deleted
 * AND when orders are completed (order_created).
 * Invalidates the KV cache and syncs purchases to Supabase.
 *
 * === FUEL THE COMMUNITY ADDITION ===
 * Also handles GMX Coin purchases: automatically credits coins to user wallets
 * when a coin package is purchased via LemonSqueezy.
 *
 * Environment variables required:
 *   LEMONSQUEEZY_WEBHOOK_SECRET — Webhook signing secret from LemonSqueezy
 *   STORE_KV                    — Cloudflare KV namespace binding
 *   SUPABASE_URL                — Supabase project URL
 *   SUPABASE_SERVICE_KEY        — Supabase service role key (for server-side writes)
 */

import { verifyHmacSignature } from './_shared/webhook-verify.js';

/* ── Constants ───────────────────────────────────────────────── */
const CACHE_KEY = 'ls_products_cache';

/* ── Sync order to Supabase purchases table ──────────────────── */
async function syncOrderToSupabase(env, payload) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        console.warn('Supabase not configured — skipping purchase sync');
        return;
    }

    try {
        const attrs = payload.data?.attributes || {};
        const meta = payload.meta?.custom_data || {};

        const order = {
            order_id: String(payload.data?.id || ''),
            email: attrs.user_email || '',
            uid: meta.uid || null,
            product_name: attrs.first_order_item?.product_name || meta.product_name || 'Purchase',
            product_id: String(attrs.first_order_item?.product_id || meta.product_id || ''),
            variant_id: String(attrs.first_order_item?.variant_id || meta.variant_id || ''),
            status: attrs.status || 'paid',
            price: attrs.total || 0,
            currency: attrs.currency || 'USD',
            receipt_url: attrs.urls?.receipt || '',
            order_data: {
                customer_id: attrs.customer_id,
                store_id: attrs.store_id,
                identifier: attrs.identifier,
                user_name: attrs.user_name,
                ls_order_id: String(payload.data?.id || '')
            }
        };

        const res = await fetch(supabaseUrl + '/rest/v1/purchases', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(order)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('Supabase purchase sync error:', res.status, errText);
        } else {
            console.info('Purchase synced to Supabase:', order.order_id);
        }

        // Track referral purchase if referral code exists
        if (meta.ref) {
            await trackReferralPurchase(env, meta.ref, order);
        }

        // ═══════════════════════════════════════
        // FUEL THE COMMUNITY: Auto-credit GMX Coins
        // ═══════════════════════════════════════
        if (meta.uid && order.status === 'paid') {
            await creditCoinsForPurchase(env, meta.uid, order);
        }
    } catch (err) {
        console.error('syncOrderToSupabase error:', err);
    }
}

/* ── FUEL: Credit GMX Coins to user wallet after purchase ────── */
async function creditCoinsForPurchase(env, userId, order) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey || !userId) return;

    try {
        // Look up the coin package by product_id or variant_id
        let coinsToCredit = 0;
        let packageName = '';

        // Try to find matching coin package in database
        const pkgRes = await fetch(
            supabaseUrl + '/rest/v1/coin_packages?is_active=eq.true&or=(lemon_product_id.eq.' +
            encodeURIComponent(order.product_id) + ',lemon_variant_id.eq.' +
            encodeURIComponent(order.variant_id) + ')&limit=1',
            {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                }
            }
        );

        const packages = await pkgRes.json();

        if (packages && packages.length > 0) {
            // Found a matching coin package
            const pkg = packages[0];
            coinsToCredit = (pkg.coins || 0) + (pkg.bonus_coins || 0);
            packageName = pkg.name || 'Coin Package';
        }

        // coin_packages is the only source of truth. If no row matches
        // the purchased product/variant this is not a coin purchase —
        // do not fall back to substring-matching the product name,
        // which let anyone with product-edit access change the coin
        // rate without a code review.
        if (coinsToCredit <= 0) {
            console.info('No coin_packages row for order — skipping wallet credit for order:', order.order_id);
            return;
        }

        // Find the internal user ID from uid (which is auth_id)
        const userRes = await fetch(
            supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(userId) + '&select=id&limit=1',
            {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                }
            }
        );
        const users = await userRes.json();
        if (!users || !users.length) {
            console.error('User not found for uid:', userId);
            return;
        }
        const internalUserId = users[0].id;

        // Credit coins via RPC
        const creditRes = await fetch(supabaseUrl + '/rest/v1/rpc/credit_coins', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify({
                p_user_id: internalUserId,
                p_amount: coinsToCredit,
                p_type: 'purchase',
                p_description: 'Purchased ' + coinsToCredit + ' GMX Coins (' + packageName + ')',
                p_reference_id: order.order_id,
                p_reference_type: 'lemon_order',
                p_metadata: { product_id: order.product_id, variant_id: order.variant_id, price: order.price, currency: order.currency },
                p_coin_source: 'purchased'
            })
        });

        if (!creditRes.ok) {
            const errText = await creditRes.text();
            console.error('Failed to credit coins:', creditRes.status, errText);
            return;
        }

        console.info('Credited', coinsToCredit, 'GMX Coins to user', internalUserId, 'for order', order.order_id);

        // Send notification to user
        await fetch(supabaseUrl + '/rest/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify({
                uid: internalUserId,
                type: 'gxp_awarded',
                title: 'Coins Added!',
                message: coinsToCredit + ' GMX Coins have been added to your wallet. Thank you for your purchase!',
                link: '/wallet'
            })
        });

        // Increment unread notifications
        await fetch(supabaseUrl + '/rest/v1/rpc/increment_unread_notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify({ p_user_id: internalUserId })
        });

    } catch (err) {
        console.error('creditCoinsForPurchase error:', err);
    }
}

/* ── FUEL: Handle refund — debit coins back ──────────────────── */
async function handleCoinRefund(env, payload) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    try {
        const orderId = String(payload.data?.id || '');
        if (!orderId) return;

        // Find the original credit transaction for this order
        const txnRes = await fetch(
            supabaseUrl + '/rest/v1/wallet_transactions?reference_id=eq.' + encodeURIComponent(orderId) +
            '&type=eq.purchase&limit=1',
            {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                }
            }
        );
        const txns = await txnRes.json();
        if (!txns || !txns.length) {
            console.info('No coin purchase transaction found for refunded order:', orderId);
            return;
        }

        const originalTxn = txns[0];
        const coinsToDebit = originalTxn.amount; // positive number from original credit
        const userId = originalTxn.user_id;

        if (coinsToDebit <= 0) return;

        // Debit coins via RPC
        const debitRes = await fetch(supabaseUrl + '/rest/v1/rpc/debit_coins', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify({
                p_user_id: userId,
                p_amount: coinsToDebit,
                p_type: 'refund',
                p_description: 'Refund for order ' + orderId,
                p_reference_id: orderId,
                p_reference_type: 'lemon_refund'
            })
        });

        if (!debitRes.ok) {
            console.error('Failed to debit coins for refund:', await debitRes.text());
        } else {
            console.info('Debited', coinsToDebit, 'coins from user', userId, 'for refund on order', orderId);
        }

        // Notify user
        await fetch(supabaseUrl + '/rest/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify({
                uid: userId,
                type: 'system',
                title: 'Purchase Refunded',
                message: coinsToDebit + ' GMX Coins have been removed from your wallet due to a refund.',
                link: '/wallet'
            })
        });

    } catch (err) {
        console.error('handleCoinRefund error:', err);
    }
}

/* ── Track referral purchase ─────────────────────────────────── */
async function trackReferralPurchase(env, refCode, order) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey || !refCode) return;

    try {
        // Find the referral code owner
        const refRes = await fetch(supabaseUrl + '/rest/v1/referral_codes?code=eq.' + encodeURIComponent(refCode) + '&status=eq.active&select=uid', {
            headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
        });
        const refData = await refRes.json();
        if (!refData || !refData.length) return;

        // Log referral purchase event
        await fetch(supabaseUrl + '/rest/v1/referral_events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify({
                referrer_uid: refData[0].uid,
                referral_code: refCode,
                event_type: 'purchase',
                referred_uid: order.uid || null,
                commission: Math.round((order.price || 0) * 0.10) / 100, // 10% commission in dollars
                metadata: { order_id: order.order_id, product_name: order.product_name }
            })
        });

        // Update referral code purchase count
        await fetch(supabaseUrl + '/rest/v1/rpc/increment_referral_purchases', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify({ p_code: refCode })
        });

        console.info('Referral purchase tracked for code:', refCode);
    } catch (err) {
        console.error('trackReferralPurchase error:', err);
    }
}

/* ── Handle subscription events ──────────────────────────────── */
async function syncSubscriptionEvent(env, eventName, payload) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    try {
        const _attrs = payload.data?.attributes || {};
        const orderId = String(payload.data?.id || '');
        let status = 'active';

        if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
            status = 'cancelled';
        } else if (eventName === 'subscription_paused') {
            status = 'paused';
        } else if (eventName === 'subscription_resumed' || eventName === 'subscription_unpaused') {
            status = 'active';
        }

        // Update the purchase status
        await fetch(supabaseUrl + '/rest/v1/purchases?order_id=eq.' + encodeURIComponent(orderId), {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify({ status: status })
        });

        console.info('Subscription status updated:', orderId, '->', status);
    } catch (err) {
        console.error('syncSubscriptionEvent error:', err);
    }
}

/* ── Main handler ────────────────────────────────────────────── */
export async function onRequest(context) {
    const { request, env } = context;

    // Only accept POST
    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const webhookSecret = env?.LEMONSQUEEZY_WEBHOOK_SECRET;

    // Fail closed: refuse to process webhooks when the signing secret is not
    // configured. A missing secret means we cannot verify authenticity, so
    // accepting the request would allow an attacker to forge order events and
    // trigger purchase syncs, coin credits, or subscription state changes.
    if (!webhookSecret) {
        console.error('LEMONSQUEEZY_WEBHOOK_SECRET is not configured — refusing webhook');
        return new Response(
            JSON.stringify({ ok: false, error: 'Webhook signing secret not configured' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // Read raw body for signature verification
    const rawBody = await request.text();

    const signature = request.headers.get('X-Signature') || '';
    const valid = await verifyHmacSignature(webhookSecret, signature, rawBody);
    if (!valid) {
        console.error('Invalid webhook signature');
        return new Response(JSON.stringify({ ok: false, error: 'Invalid signature' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Parse the webhook payload
    let payload;
    try {
        payload = JSON.parse(rawBody);
    } catch (_e) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const eventName = request.headers.get('X-Event-Name') || payload.meta?.event_name || 'unknown';
    console.info('LemonSqueezy webhook received:', eventName);

    // Events that should trigger cache invalidation
    const cacheInvalidationEvents = [
        'product_created',
        'product_updated',
        'variant_created',
        'variant_updated'
    ];

    // Events that create/update purchases
    const orderEvents = [
        'order_created',
        'order_refunded'
    ];

    // Subscription events
    const subscriptionEvents = [
        'subscription_created',
        'subscription_updated',
        'subscription_cancelled',
        'subscription_expired',
        'subscription_paused',
        'subscription_resumed',
        'subscription_unpaused'
    ];

    // Handle cache invalidation
    if (cacheInvalidationEvents.includes(eventName)) {
        if (env?.STORE_KV) {
            try {
                await env.STORE_KV.delete(CACHE_KEY);
                console.info('KV cache invalidated for event:', eventName);
            } catch (kvErr) {
                console.error('KV delete error:', kvErr);
            }
        }
    }

    // Handle order events — sync to Supabase
    if (orderEvents.includes(eventName)) {
        await syncOrderToSupabase(env, payload);
        if (eventName === 'order_refunded') {
            // Update purchase status to refunded
            const supabaseUrl = env?.SUPABASE_URL;
            const supabaseKey = env?.SUPABASE_SERVICE_KEY;
            if (supabaseUrl && supabaseKey) {
                const orderId = String(payload.data?.id || '');
                await fetch(supabaseUrl + '/rest/v1/purchases?order_id=eq.' + encodeURIComponent(orderId), {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({ status: 'refunded' })
                });
            }
            // FUEL: Handle coin refund
            await handleCoinRefund(env, payload);
        }
    }

    // Handle subscription events
    if (subscriptionEvents.includes(eventName)) {
        await syncSubscriptionEvent(env, eventName, payload);
    }

    return new Response(
        JSON.stringify({
            ok: true,
            event: eventName,
            cache_cleared: cacheInvalidationEvents.includes(eventName),
            purchase_synced: orderEvents.includes(eventName)
        }),
        {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        }
    );
}
