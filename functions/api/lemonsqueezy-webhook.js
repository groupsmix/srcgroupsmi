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
 * === EPIC B — PAYMENTS INTEGRITY ===
 * - B-1: Replay-window check via STORE_KV event ledger (keyed by the HMAC
 *        signature, which is unique per body). Entries are only written after
 *        a webhook is fully processed so provider retries after a 5xx still
 *        succeed. The TTL (7 days) is the window inside which duplicate
 *        deliveries of the same signed body are rejected.
 * - B-2: syncOrderToSupabase inserts with `resolution=ignore-duplicates` so a
 *        replayed `order_created` event never overwrites an existing purchase
 *        row. Duplicate attempts are logged and downstream side-effects
 *        (referral tracking, coin crediting) are skipped.
 * - B-3: Coin crediting is a single `credit_coins_from_order(payload)` RPC
 *        call; the old lookup-user + lookup-package + credit_coins chain is
 *        gone. The RPC is idempotent on (user, order_id).
 * - B-4: Any exception during event handling writes the raw payload, event
 *        name, signature and error to the `webhook_dead_letters` table so
 *        operators can replay, and releases the replay-ledger entry so
 *        provider retries can make progress.
 *
 * Environment variables required:
 *   LEMONSQUEEZY_WEBHOOK_SECRET — Webhook signing secret from LemonSqueezy
 *   STORE_KV                    — Cloudflare KV namespace binding
 *   SUPABASE_URL                — Supabase project URL
 *   SUPABASE_SERVICE_KEY        — Supabase service role key (for server-side writes)
 */

import { verifyHmacSignature } from './_shared/webhook-verify.js';
import { z } from 'zod';

const lsWebhookSchema = z.object({
    meta: z.object({
        event_name: z.string(),
        custom_data: z.record(z.string(), z.any()).optional()
    }).passthrough(),
    data: z.object({
        id: z.string().or(z.number()).transform(String),
        type: z.string(),
        attributes: z.record(z.string(), z.any())
    }).passthrough()
}).passthrough();

/* ── Constants ───────────────────────────────────────────────── */
const CACHE_KEY = 'ls_products_cache';
const REPLAY_KEY_PREFIX = 'ls_webhook_event:';
const REPLAY_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/* ── Replay-window ledger (B-1) ──────────────────────────────── */

/**
 * Returns true when we have already processed this signature inside the
 * replay window. When STORE_KV is not bound (local tests, dev) this is a
 * no-op that treats every event as fresh.
 */
async function isReplay(env, signatureHex) {
    if (!env?.STORE_KV || !signatureHex) return false;
    try {
        const seen = await env.STORE_KV.get(REPLAY_KEY_PREFIX + signatureHex);
        return !!seen;
    } catch (err) {
        console.error('Replay ledger read failed:', err);
        return false;
    }
}

/**
 * Records a signature as processed. Only call this after the handler has
 * finished successfully so that retries of a half-processed event can still
 * make progress.
 */
async function markProcessed(env, signatureHex, meta) {
    if (!env?.STORE_KV || !signatureHex) return;
    try {
        await env.STORE_KV.put(
            REPLAY_KEY_PREFIX + signatureHex,
            JSON.stringify({ at: new Date().toISOString(), ...(meta || {}) }),
            { expirationTtl: REPLAY_TTL_SECONDS }
        );
    } catch (err) {
        console.error('Replay ledger write failed:', err);
    }
}

/**
 * Clears a replay entry so provider retries after a handler error are not
 * blocked by the ledger. Best-effort; failures are logged but ignored.
 */
async function clearReplay(env, signatureHex) {
    if (!env?.STORE_KV || !signatureHex) return;
    try {
        await env.STORE_KV.delete(REPLAY_KEY_PREFIX + signatureHex);
    } catch (err) {
        console.error('Replay ledger clear failed:', err);
    }
}

/* ── Dead-letter queue (B-4) ─────────────────────────────────── */

async function writeDeadLetter(env, entry) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        console.error('webhook_dead_letters not written — Supabase not configured. Entry:', {
            event_name: entry.event_name,
            event_id: entry.event_id,
            error: entry.error
        });
        return;
    }
    try {
        const res = await fetch(supabaseUrl + '/rest/v1/webhook_dead_letters', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                provider: 'lemonsqueezy',
                event_name: entry.event_name || '',
                event_id: entry.event_id || '',
                signature: entry.signature || '',
                raw_payload: entry.raw_payload || {},
                error: String(entry.error || '').slice(0, 4000)
            })
        });
        if (!res.ok) {
            const errText = await res.text();
            console.error('webhook_dead_letters insert failed:', res.status, errText);
        }
    } catch (err) {
        console.error('writeDeadLetter error:', err);
    }
}

/* ── Sync order to Supabase purchases table (B-2) ────────────── */

/**
 * Inserts the order into `purchases` using `resolution=ignore-duplicates`.
 * Returns { inserted: boolean, order }. When `inserted` is false the row
 * already existed (duplicate order_id) — downstream side-effects (referral,
 * coin crediting) MUST be skipped so we don't double-pay anything.
 */
async function syncOrderToSupabase(env, payload) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        console.warn('Supabase not configured — skipping purchase sync');
        return { inserted: false, order: null };
    }

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
            // ignore-duplicates: an existing row with the same `order_id`
            // (the table's UNIQUE column) is left untouched. Combined with
            // `return=representation` we get back an empty array for
            // duplicates and a one-row array for fresh inserts.
            'Prefer': 'resolution=ignore-duplicates,return=representation'
        },
        body: JSON.stringify(order)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error('Supabase purchase sync failed ' + res.status + ': ' + errText);
    }

    let inserted = true;
    try {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length === 0) {
            inserted = false;
        }
    } catch (_parseErr) {
        // No body returned — treat as inserted and let downstream idempotency
        // guards (credit_coins_from_order) prevent double-crediting.
        inserted = true;
    }

    if (inserted) {
        console.info('Purchase synced to Supabase:', order.order_id);
    } else {
        console.warn(
            'Duplicate order_created webhook — purchase row already exists, skipping side-effects. order_id:',
            order.order_id,
            'uid:', order.uid || '(none)'
        );
    }

    return { inserted, order };
}

/* ── FUEL: Credit GMX Coins via single RPC (B-3) ─────────────── */

/**
 * Single-call replacement for the old lookup-user + lookup-package +
 * credit_coins flow. Everything the RPC needs travels in `payload` as JSON,
 * and the RPC is idempotent on (user_id, order_id, 'lemon_order').
 */
async function creditCoinsForPurchase(env, userId, order) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey || !userId) return;

    const res = await fetch(supabaseUrl + '/rest/v1/rpc/credit_coins_from_order', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': 'Bearer ' + supabaseKey
        },
        body: JSON.stringify({
            payload: {
                order_id: order.order_id,
                product_id: order.product_id,
                variant_id: order.variant_id,
                auth_id: userId,
                price: order.price,
                currency: order.currency
            }
        })
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error('credit_coins_from_order RPC failed ' + res.status + ': ' + errText);
    }

    const result = await res.json().catch(() => null);
    if (result && result.status === 'credited') {
        console.info(
            'Credited', result.coins, 'GMX Coins to user', result.user_id,
            'for order', order.order_id
        );
    } else if (result && result.status === 'skipped') {
        console.info(
            'credit_coins_from_order skipped for order', order.order_id,
            '— reason:', result.reason
        );
    } else {
        console.info('credit_coins_from_order returned:', result);
    }
}

/* ── FUEL: Handle refund — debit coins back ──────────────────── */
async function handleCoinRefund(env, payload) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return;

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

    // Debit coins via RPC. If this fails (e.g. negative balance constraint),
    // it will throw an error, which will be caught by the outer handler,
    // written to the dead-letter queue, and return a 500 so LemonSqueezy retries.
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
        const errText = await debitRes.text();
        console.error('Failed to debit coins for refund:', errText);
        throw new Error(`Refund failed: unable to debit ${coinsToDebit} coins from user ${userId}. Reason: ${errText}`);
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
                commission_amount: Math.round((order.price || 0) * 0.10), // 10% commission in cents/smallest unit
                commission_currency: order.currency || 'USD',
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

    const attrs = payload.data?.attributes || {};
    // Subscription events map the original order_id in attributes
    const orderId = String(attrs.order_id || '');
    if (!orderId) {
        console.warn('Subscription event missing order_id in attributes');
        return;
    }
    
    let status = 'active';

    if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
        status = 'cancelled';
    } else if (eventName === 'subscription_paused') {
        status = 'paused';
    } else if (eventName === 'subscription_resumed' || eventName === 'subscription_unpaused') {
        status = 'active';
    }

    // Insert into append-only subscription_events ledger
    const eventTs = attrs.updated_at || attrs.created_at || new Date().toISOString();
    await fetch(supabaseUrl + '/rest/v1/subscription_events', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': 'Bearer ' + supabaseKey,
            'Prefer': 'resolution=ignore-duplicates'
        },
        body: JSON.stringify({
            order_id: orderId,
            event_name: eventName,
            event_ts: eventTs,
            raw_payload: payload
        })
    });

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
}

/* ── Main handler ────────────────────────────────────────────── */

const CACHE_INVALIDATION_EVENTS = [
    'product_created',
    'product_updated',
    'variant_created',
    'variant_updated'
];

const ORDER_EVENTS = ['order_created', 'order_refunded'];

const SUBSCRIPTION_EVENTS = [
    'subscription_created',
    'subscription_updated',
    'subscription_cancelled',
    'subscription_expired',
    'subscription_paused',
    'subscription_resumed',
    'subscription_unpaused'
];

/**
 * Dispatch the already-verified, already-parsed payload. Any error thrown
 * here is caught by the outer handler, written to the dead-letter queue,
 * and returned as a 5xx so the provider retries.
 */
async function processEvent(env, eventName, payload) {
    let cacheCleared = false;
    let orderInserted = false;
    let refundProcessed = false;

    if (CACHE_INVALIDATION_EVENTS.includes(eventName) && env?.STORE_KV) {
        await env.STORE_KV.delete(CACHE_KEY);
        cacheCleared = true;
        console.info('KV cache invalidated for event:', eventName);
    }

    if (ORDER_EVENTS.includes(eventName)) {
        const syncResult = await syncOrderToSupabase(env, payload);
        orderInserted = syncResult.inserted;

        // Only run downstream side-effects when we actually inserted a new
        // purchase row. A duplicate delivery that made it past the KV
        // replay window must not double-credit coins or re-track referrals.
        if (syncResult.inserted && syncResult.order) {
            const meta = payload.meta?.custom_data || {};
            if (meta.ref) {
                await trackReferralPurchase(env, meta.ref, syncResult.order);
            }
            if (meta.uid && syncResult.order.status === 'paid') {
                await creditCoinsForPurchase(env, meta.uid, syncResult.order);
            }
        }

        if (eventName === 'order_refunded') {
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
            await handleCoinRefund(env, payload);
            refundProcessed = true;
        }
    }

    if (SUBSCRIPTION_EVENTS.includes(eventName)) {
        await syncSubscriptionEvent(env, eventName, payload);
    }

    return { cacheCleared, orderInserted, refundProcessed };
}

function jsonResponse(body, status) {
    return new Response(JSON.stringify(body), {
        status: status,
        headers: { 'Content-Type': 'application/json' }
    });
}

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
        return jsonResponse({ ok: false, error: 'Webhook signing secret not configured' }, 503);
    }

    // Read raw body for signature verification
    const rawBody = await request.text();

    const signature = String(request.headers.get('X-Signature') || '').toLowerCase();
    const valid = await verifyHmacSignature(webhookSecret, signature, rawBody);
    if (!valid) {
        console.error('Invalid webhook signature');
        return jsonResponse({ ok: false, error: 'Invalid signature' }, 401);
    }

    // Parse the webhook payload
    let payload;
    try {
        const rawJson = JSON.parse(rawBody);
        const validation = lsWebhookSchema.safeParse(rawJson);
        if (!validation.success) {
            console.error('Invalid LemonSqueezy payload schema:', validation.error);
            return jsonResponse({ ok: false, error: 'Validation failed' }, 400);
        }
        payload = validation.data;
    } catch (_e) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
    }

    const eventName = request.headers.get('X-Event-Name') || payload.meta?.event_name || 'unknown';
    const eventId = String(
        payload.meta?.webhook_id
        || payload.meta?.event_id
        || payload.data?.id
        || ''
    );
    console.info('LemonSqueezy webhook received:', eventName, 'event_id:', eventId || '(none)');

    // B-1: replay-window check. We key on the HMAC signature because it's
    // unique per raw body, so every distinct event has a distinct key. An
    // entry only exists when a prior delivery completed successfully.
    if (await isReplay(env, signature)) {
        console.warn('Replay of already-processed webhook ignored. event:', eventName, 'event_id:', eventId);
        return jsonResponse(
            { ok: true, replay: true, event: eventName, event_id: eventId },
            200
        );
    }

    let result;
    try {
        result = await processEvent(env, eventName, payload);
    } catch (err) {
        console.error('Webhook processing failed:', err);

        // B-4: persist the failure for operator replay and release the
        // replay ledger so the provider's automatic retry is not blocked
        // by a partially-processed event.
        await writeDeadLetter(env, {
            event_name: eventName,
            event_id: eventId,
            signature: signature,
            raw_payload: payload,
            error: err?.stack || err?.message || String(err)
        });
        await clearReplay(env, signature);

        return jsonResponse(
            { ok: false, error: 'Webhook processing failed, recorded to dead-letter queue' },
            500
        );
    }

    // Only mark the signature as processed AFTER success. A prior error
    // path will have cleared any stray entry already.
    await markProcessed(env, signature, { event_name: eventName, event_id: eventId });

    return jsonResponse(
        {
            ok: true,
            event: eventName,
            event_id: eventId,
            cache_cleared: result.cacheCleared,
            purchase_synced: result.orderInserted,
            refund_processed: result.refundProcessed
        },
        200
    );
}
