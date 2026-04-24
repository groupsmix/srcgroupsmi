/**
 * Action: Negotiation / Offers — create, respond, list offers
 */

export async function handleOffers(env, body) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Server not configured' };

    const offerAction = (body.offer_action || '').trim();

    if (offerAction === 'create') {
        const buyerId = (body.buyer_id || '').trim();
        const sellerId = (body.seller_id || '').trim();
        const productId = (body.product_id || '').trim();
        const offerPrice = parseInt(body.offer_price, 10) || 0;
        const message = (body.message || '').substring(0, 500).trim();

        if (!buyerId || !sellerId || !productId || !offerPrice) {
            return { ok: false, error: 'Missing buyer_id, seller_id, product_id, or offer_price' };
        }

        const offerRes = await fetch(supabaseUrl + '/rest/v1/marketplace_offers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                buyer_id: buyerId,
                seller_id: sellerId,
                product_id: productId,
                offer_price: offerPrice,
                message: message,
                status: 'pending',
                expires_at: new Date(Date.now() + 48 * 3600000).toISOString()
            })
        });

        if (!offerRes.ok) return { ok: false, error: 'Failed to create offer' };
        const offer = await offerRes.json();

        // Notify seller
        await fetch(supabaseUrl + '/rest/v1/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify({
                uid: sellerId,
                type: 'new_offer',
                title: 'New Offer Received',
                message: 'You received an offer of ' + offerPrice + ' coins. ' + (message || ''),
                link: '/offers'
            })
        });

        return { ok: true, offer: offer[0] || offer };
    }

    if (offerAction === 'respond') {
        const offerId = (body.offer_id || '').trim();
        const response = (body.response || '').trim(); // accept, reject, counter
        const counterPrice = parseInt(body.counter_price, 10) || 0;

        if (!offerId || !response) return { ok: false, error: 'Missing offer_id or response' };

        const updateData = { status: response };
        if (response === 'counter' && counterPrice > 0) {
            updateData.counter_price = counterPrice;
            updateData.status = 'countered';
        }

        await fetch(supabaseUrl + '/rest/v1/marketplace_offers?id=eq.' + encodeURIComponent(offerId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify(updateData)
        });

        // Notify buyer
        const getOffer = await fetch(
            supabaseUrl + '/rest/v1/marketplace_offers?id=eq.' + encodeURIComponent(offerId) + '&select=buyer_id&limit=1',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const offerData = await getOffer.json();
        if (offerData?.[0]?.buyer_id) {
            await fetch(supabaseUrl + '/rest/v1/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                body: JSON.stringify({
                    uid: offerData[0].buyer_id,
                    type: 'offer_' + response,
                    title: 'Offer ' + response.charAt(0).toUpperCase() + response.slice(1),
                    message: response === 'counter'
                        ? 'The seller countered with ' + counterPrice + ' coins.'
                        : 'Your offer was ' + response + '.',
                    link: '/offers'
                })
            });
        }

        return { ok: true, status: updateData.status };
    }

    if (offerAction === 'list') {
        const userId = (body.user_id || '').trim();
        const role = (body.role || 'buyer').trim();
        if (!userId) return { ok: false, error: 'Missing user_id' };

        const field = role === 'seller' ? 'seller_id' : 'buyer_id';
        const listRes = await fetch(
            supabaseUrl + '/rest/v1/marketplace_offers?' + field + '=eq.' + encodeURIComponent(userId) + '&order=created_at.desc&limit=50',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const offerList = await listRes.json();
        return { ok: true, offers: offerList || [] };
    }

    return { ok: false, error: 'Unknown offer_action. Use create, respond, or list.' };
}
/**
 * Action: Dispute Resolution — create, respond, resolve, list disputes
 */

export async function handleDispute(env, body) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Server not configured' };

    const disputeAction = (body.dispute_action || '').trim();

    if (disputeAction === 'create') {
        const buyerId = (body.buyer_id || '').trim();
        const sellerId = (body.seller_id || '').trim();
        const orderId = (body.order_id || '').trim();
        const reason = (body.reason || '').substring(0, 1000).trim();
        const category = (body.category || 'other').trim();

        if (!buyerId || !orderId || !reason) return { ok: false, error: 'Missing buyer_id, order_id, or reason' };

        const disputeRes = await fetch(supabaseUrl + '/rest/v1/marketplace_disputes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                buyer_id: buyerId,
                seller_id: sellerId,
                order_id: orderId,
                reason: reason,
                category: category,
                status: 'open',
                seller_deadline: new Date(Date.now() + 48 * 3600000).toISOString()
            })
        });

        if (!disputeRes.ok) return { ok: false, error: 'Failed to create dispute' };
        const dispute = await disputeRes.json();

        // Notify seller with 48h deadline
        if (sellerId) {
            await fetch(supabaseUrl + '/rest/v1/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                body: JSON.stringify({
                    uid: sellerId,
                    type: 'dispute_opened',
                    title: 'Dispute Opened \u2014 48h to Respond',
                    message: 'A buyer has reported an issue with order ' + orderId + '. You have 48 hours to respond before admin mediation.',
                    link: '/disputes'
                })
            });
        }

        return { ok: true, dispute: dispute[0] || dispute };
    }

    if (disputeAction === 'respond') {
        const disputeId = (body.dispute_id || '').trim();
        const responseMsg = (body.message || '').substring(0, 1000).trim();
        const resolution = (body.resolution || '').trim();

        if (!disputeId || !responseMsg) return { ok: false, error: 'Missing dispute_id or message' };

        await fetch(supabaseUrl + '/rest/v1/marketplace_disputes?id=eq.' + encodeURIComponent(disputeId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify({
                status: resolution === 'reject' ? 'escalated' : 'seller_responded',
                seller_response: responseMsg,
                proposed_resolution: resolution || null,
                responded_at: new Date().toISOString()
            })
        });

        // If seller rejected, auto-escalate to admin
        if (resolution === 'reject') {
            await fetch(supabaseUrl + '/rest/v1/marketplace_disputes?id=eq.' + encodeURIComponent(disputeId), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                body: JSON.stringify({ status: 'escalated', escalated_at: new Date().toISOString() })
            });
        }

        return { ok: true, status: resolution === 'reject' ? 'escalated' : 'seller_responded' };
    }

    if (disputeAction === 'resolve') {
        const disputeId = (body.dispute_id || '').trim();
        const adminDecision = (body.decision || '').trim();
        const adminNote = (body.admin_note || '').substring(0, 500).trim();

        if (!disputeId || !adminDecision) return { ok: false, error: 'Missing dispute_id or decision' };

        await fetch(supabaseUrl + '/rest/v1/marketplace_disputes?id=eq.' + encodeURIComponent(disputeId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify({
                status: 'resolved',
                admin_decision: adminDecision,
                admin_note: adminNote,
                resolved_at: new Date().toISOString()
            })
        });

        return { ok: true, status: 'resolved', decision: adminDecision };
    }

    if (disputeAction === 'list') {
        const userId = (body.user_id || '').trim();
        const role = (body.role || 'buyer').trim();
        if (!userId) return { ok: false, error: 'Missing user_id' };

        const dField = role === 'seller' ? 'seller_id' : (role === 'admin' ? '' : 'buyer_id');
        let dQuery = supabaseUrl + '/rest/v1/marketplace_disputes?';
        if (dField) dQuery += dField + '=eq.' + encodeURIComponent(userId) + '&';
        dQuery += 'order=created_at.desc&limit=50';

        const dListRes = await fetch(dQuery, {
            headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
        });
        const disputes = await dListRes.json();
        return { ok: true, disputes: disputes || [] };
    }

    return { ok: false, error: 'Unknown dispute_action. Use create, respond, resolve, or list.' };
}
/**
 * Action: Flash Sales — Seasonal/flash sales with countdown timers
 */

export async function handleFlashSales(env, body) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Server not configured' };

    const saleAction = (body.sale_action || '').trim();

    if (saleAction === 'create') {
        const sellerId = (body.seller_id || '').trim();
        const pId = (body.product_id || '').trim();
        const discountPct = parseInt(body.discount_percent, 10) || 0;
        const originalPrice = parseInt(body.original_price, 10) || 0;
        const durationHours = parseInt(body.duration_hours, 10) || 24;

        if (!sellerId || !pId || !discountPct) return { ok: false, error: 'Missing seller_id, product_id, or discount_percent' };
        if (discountPct < 5 || discountPct > 80) return { ok: false, error: 'Discount must be between 5% and 80%' };
        if (durationHours < 1 || durationHours > 168) return { ok: false, error: 'Duration must be 1-168 hours (1 week max)' };

        const salePrice = Math.round(originalPrice * (1 - discountPct / 100));
        const endsAt = new Date(Date.now() + durationHours * 3600000).toISOString();

        const saleRes = await fetch(supabaseUrl + '/rest/v1/flash_sales', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                seller_id: sellerId,
                product_id: pId,
                original_price: originalPrice,
                sale_price: salePrice,
                discount_percent: discountPct,
                starts_at: new Date().toISOString(),
                ends_at: endsAt,
                status: 'active'
            })
        });

        if (!saleRes.ok) return { ok: false, error: 'Failed to create flash sale' };
        const sale = await saleRes.json();
        return { ok: true, sale: sale[0] || sale };
    }

    if (saleAction === 'active') {
        const activeRes = await fetch(
            supabaseUrl + '/rest/v1/flash_sales?status=eq.active&ends_at=gt.' + encodeURIComponent(new Date().toISOString()) + '&order=ends_at.asc&limit=50',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        let activeSales = await activeRes.json();
        activeSales = Array.isArray(activeSales) ? activeSales : [];

        // Add countdown info
        const now = Date.now();
        activeSales = activeSales.map(s => {
            const msLeft = new Date(s.ends_at).getTime() - now;
            const hoursLeft = Math.max(0, msLeft / 3600000);
            s.time_remaining = {
                hours: Math.floor(hoursLeft),
                minutes: Math.floor((hoursLeft % 1) * 60),
                total_seconds: Math.max(0, Math.round(msLeft / 1000)),
                is_ending_soon: hoursLeft < 6,
                formatted: hoursLeft >= 1 ? Math.floor(hoursLeft) + 'h ' + Math.floor((hoursLeft % 1) * 60) + 'm left' : Math.floor(hoursLeft * 60) + 'm left'
            };
            return s;
        });

        return { ok: true, sales: activeSales, count: activeSales.length };
    }

    if (saleAction === 'end') {
        const saleId = (body.sale_id || '').trim();
        if (!saleId) return { ok: false, error: 'Missing sale_id' };

        await fetch(supabaseUrl + '/rest/v1/flash_sales?id=eq.' + encodeURIComponent(saleId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify({ status: 'ended', ended_at: new Date().toISOString() })
        });

        return { ok: true, status: 'ended' };
    }

    return { ok: false, error: 'Unknown sale_action. Use create, active, or end.' };
}
/**
 * Action: Review Verification — Verify reviewer is an actual buyer
 */

export async function handleReviewVerification(env, body) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Server not configured' };

    const reviewerId = (body.reviewer_id || '').trim();
    const productId = (body.product_id || '').trim();
    const sellerId = (body.seller_id || '').trim();

    if (!reviewerId) return { ok: false, error: 'Missing reviewer_id' };
    if (!productId && !sellerId) return { ok: false, error: 'Missing product_id or seller_id' };

    // Check if the reviewer has purchased from this seller or this product
    let purchaseQuery = supabaseUrl + '/rest/v1/wallet_transactions?user_id=eq.' + encodeURIComponent(reviewerId) + '&type=in.(purchase,store_purchase)';
    if (productId) purchaseQuery += '&description=like.*' + encodeURIComponent(productId) + '*';
    else if (sellerId) purchaseQuery += '&description=like.*' + encodeURIComponent(sellerId) + '*';
    purchaseQuery += '&limit=1';

    const purchaseRes = await fetch(purchaseQuery, {
        headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
    });
    const purchases = await purchaseRes.json();
    let isVerifiedBuyer = Array.isArray(purchases) && purchases.length > 0;

    // Also check escrow transactions
    if (!isVerifiedBuyer) {
        let escrowQuery = supabaseUrl + '/rest/v1/escrow_transactions?buyer_id=eq.' + encodeURIComponent(reviewerId) + '&status=eq.completed';
        if (productId) escrowQuery += '&product_id=eq.' + encodeURIComponent(productId);
        else if (sellerId) escrowQuery += '&seller_id=eq.' + encodeURIComponent(sellerId);
        escrowQuery += '&limit=1';

        const escrowRes = await fetch(escrowQuery, {
            headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
        });
        const escrows = await escrowRes.json();
        isVerifiedBuyer = Array.isArray(escrows) && escrows.length > 0;
    }

    return {
        ok: true,
        reviewer_id: reviewerId,
        product_id: productId || null,
        seller_id: sellerId || null,
        is_verified_buyer: isVerifiedBuyer,
        can_review: isVerifiedBuyer,
        badge: isVerifiedBuyer ? { label: 'Verified Purchase', label_ar: '\u0634\u0631\u0627\u0621 \u0645\u0648\u062b\u0642', color: '#10b981' } : null,
        message: isVerifiedBuyer ? 'You are a verified buyer and can leave a review.' : 'Only verified buyers can leave reviews. Purchase this product first.'
    };
}
/**
 * Action: Seller Trust Score — Compute seller trust score + badges
 */

export async function handleSellerTrust(env, body) {
    const sellerId = (body.seller_id || '').trim();
    if (!sellerId) return { ok: false, error: 'Missing seller_id' };

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Server not configured' };

    // Fetch seller profile
    const profileRes = await fetch(
        supabaseUrl + '/rest/v1/users?id=eq.' + encodeURIComponent(sellerId) + '&select=id,display_name,photo_url,created_at,identity_verified,phone_verified,email&limit=1',
        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    );
    const profiles = await profileRes.json();
    if (!profiles || !profiles.length) return { ok: false, error: 'Seller not found' };
    const seller = profiles[0];

    // Fetch completed transactions (as seller)
    const txnRes = await fetch(
        supabaseUrl + '/rest/v1/wallet_transactions?type=in.(purchase,store_purchase)&description=like.*' + encodeURIComponent(sellerId) + '*&select=amount,created_at,type&limit=500',
        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    );
    const txns = await txnRes.json();
    const completedTxns = Array.isArray(txns) ? txns : [];

    // Fetch reviews for this seller's products
    const reviewRes = await fetch(
        supabaseUrl + '/rest/v1/reviews?seller_id=eq.' + encodeURIComponent(sellerId) + '&select=rating,created_at&limit=200',
        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    );
    let sellerReviews = await reviewRes.json();
    sellerReviews = Array.isArray(sellerReviews) ? sellerReviews : [];

    // Fetch disputes/refunds
    const refundRes = await fetch(
        supabaseUrl + '/rest/v1/wallet_transactions?type=eq.refund&description=like.*' + encodeURIComponent(sellerId) + '*&select=amount&limit=100',
        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    );
    let refunds = await refundRes.json();
    refunds = Array.isArray(refunds) ? refunds : [];

    // Calculate trust score components (0-100 each)
    let score = 0;
    const breakdown = {};

    // 1. Account age (max 20 points) — 1 point per month, capped at 20
    const accountAgeDays = (Date.now() - new Date(seller.created_at).getTime()) / 86400000;
    const ageScore = Math.min(20, Math.floor(accountAgeDays / 30));
    breakdown.account_age = { score: ageScore, max: 20, months: Math.floor(accountAgeDays / 30) };
    score += ageScore;

    // 2. Completed transactions (max 25 points)
    const txnScore = Math.min(25, completedTxns.length);
    breakdown.completed_transactions = { score: txnScore, max: 25, count: completedTxns.length };
    score += txnScore;

    // 3. Review ratings (max 25 points)
    let avgRating = 0;
    if (sellerReviews.length > 0) {
        avgRating = sellerReviews.reduce((s, r) => s + (r.rating || 0), 0) / sellerReviews.length;
    }
    const ratingScore = sellerReviews.length > 0 ? Math.round(avgRating * 5) : 0; // 5 stars * 5 = max 25
    breakdown.review_ratings = { score: ratingScore, max: 25, avg_rating: parseFloat(avgRating.toFixed(1)), count: sellerReviews.length };
    score += ratingScore;

    // 4. Refund rate (max 15 points — lower is better)
    const refundRate = completedTxns.length > 0 ? (refunds.length / completedTxns.length) : 0;
    const refundScore = Math.max(0, Math.round(15 * (1 - refundRate * 5))); // 0% refunds = 15, 20%+ = 0
    breakdown.refund_rate = { score: refundScore, max: 15, rate: parseFloat((refundRate * 100).toFixed(1)), refund_count: refunds.length };
    score += refundScore;

    // 5. Verification bonus (max 15 points)
    let verifyScore = 0;
    if (seller.email) verifyScore += 5;
    if (seller.phone_verified) verifyScore += 5;
    if (seller.identity_verified) verifyScore += 5;
    breakdown.verification = { score: verifyScore, max: 15, email: !!seller.email, phone: !!seller.phone_verified, identity: !!seller.identity_verified };
    score += verifyScore;

    // Determine badges
    const badges = [];
    if (seller.identity_verified) badges.push({ id: 'verified', label: 'Verified Seller', label_ar: '\u0628\u0627\u0626\u0639 \u0645\u0648\u062b\u0642', color: '#10b981' });
    if (score >= 80 && completedTxns.length >= 20) badges.push({ id: 'top-seller', label: 'Top Seller', label_ar: '\u0628\u0627\u0626\u0639 \u0645\u0645\u064a\u0632', color: '#f59e0b' });
    if (score >= 60 && completedTxns.length >= 5) badges.push({ id: 'trusted', label: 'Trusted Seller', label_ar: '\u0628\u0627\u0626\u0639 \u0645\u0648\u062b\u0648\u0642', color: '#3b82f6' });
    if (accountAgeDays > 365) badges.push({ id: 'veteran', label: 'Veteran Member', label_ar: '\u0639\u0636\u0648 \u0645\u062e\u0636\u0631\u0645', color: '#8b5cf6' });
    if (refundRate === 0 && completedTxns.length >= 10) badges.push({ id: 'zero-refund', label: 'Zero Refunds', label_ar: '\u0628\u062f\u0648\u0646 \u0627\u0633\u062a\u0631\u062f\u0627\u062f', color: '#06b6d4' });

    // Trust tier
    let tier = 'new';
    if (score >= 80) tier = 'excellent';
    else if (score >= 60) tier = 'good';
    else if (score >= 40) tier = 'average';
    else if (score >= 20) tier = 'building';

    return {
        ok: true,
        seller_id: sellerId,
        trust_score: score,
        tier: tier,
        badges: badges,
        breakdown: breakdown,
        display_name: seller.display_name || 'Seller'
    };
}
/**
 * Action: Wishlist Price Drop Alerts — notify users when wishlisted items drop in price
 */

export async function handleWishlistAlerts(env, body) {
    const userId = (body.user_id || '').trim();
    const wishlistItems = body.wishlist || [];
    const products = body.products || [];
    const batchMode = body.batch === true;

    if (!batchMode && (!userId || !wishlistItems.length || !products.length)) {
        return { ok: false, error: 'Missing user_id, wishlist, or products' };
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    // Batch mode: process all users with wishlists at once
    if (batchMode && supabaseUrl && supabaseKey) {
        try {
            const wlRes = await fetch(
                supabaseUrl + '/rest/v1/wishlists?select=user_id,product_id,price_when_added&limit=2000',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const allWishlists = await wlRes.json();
            if (!Array.isArray(allWishlists) || !allWishlists.length) {
                return { ok: true, alerts_sent: 0, message: 'No wishlists found' };
            }

            const productMap = {};
            products.forEach(p => { productMap[p.id] = p; });

            const userAlerts = {};
            allWishlists.forEach(wl => {
                const product = productMap[wl.product_id];
                if (!product) return;
                const savedPrice = wl.price_when_added || 0;
                const currentPrice = product.price || 0;
                if (savedPrice > 0 && currentPrice > 0 && currentPrice < savedPrice) {
                    if (!userAlerts[wl.user_id]) userAlerts[wl.user_id] = [];
                    userAlerts[wl.user_id].push({
                        product_id: product.id,
                        product_name: product.name,
                        original_price: savedPrice,
                        current_price: currentPrice,
                        drop_percent: Math.round((1 - currentPrice / savedPrice) * 100),
                        savings_formatted: '$' + ((savedPrice - currentPrice) / 100).toFixed(2)
                    });
                }
            });

            let totalAlertsSent = 0;
            const userIds = Object.keys(userAlerts);
            for (let bi = 0; bi < userIds.length; bi += 5) {
                const batch = userIds.slice(bi, bi + 5);
                await Promise.all(batch.map(async (uid) => {
                    const alerts = userAlerts[uid];
                    const topAlert = alerts.sort((a, b) => b.drop_percent - a.drop_percent)[0];
                    const message = alerts.length === 1
                        ? topAlert.product_name + ' dropped ' + topAlert.drop_percent + '% \u2014 save ' + topAlert.savings_formatted + '!'
                        : alerts.length + ' wishlisted items dropped in price! ' + topAlert.product_name + ' is down ' + topAlert.drop_percent + '%.';
                    try {
                        await fetch(supabaseUrl + '/rest/v1/notifications', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': supabaseKey,
                                'Authorization': 'Bearer ' + supabaseKey
                            },
                            body: JSON.stringify({
                                uid: uid,
                                type: 'price_drop',
                                title: 'Price Drop Alert!',
                                message: message,
                                link: '/pages/store.html?product=' + topAlert.product_id,
                                metadata: JSON.stringify({ alerts: alerts })
                            })
                        });
                        totalAlertsSent++;
                    } catch (e) {
                        console.error('Batch notification error for user ' + uid + ':', e);
                    }
                }));
            }

            return {
                ok: true,
                batch: true,
                users_notified: totalAlertsSent,
                total_users_with_drops: userIds.length,
                total_product_drops: Object.values(userAlerts).reduce((s, a) => s + a.length, 0)
            };
        } catch (e) {
            console.error('Batch wishlist alerts error:', e);
            return { ok: false, error: 'Batch processing failed: ' + e.message };
        }
    }

    const alerts = [];

    for (const item of wishlistItems) {
        const product = products.find(p => p.id === item.product_id);
        if (!product) continue;

        const savedPrice = item.price_when_added || 0;
        const currentPrice = product.price || 0;

        if (savedPrice > 0 && currentPrice > 0 && currentPrice < savedPrice) {
            const dropPercent = Math.round((1 - currentPrice / savedPrice) * 100);
            alerts.push({
                product_id: product.id,
                product_name: product.name,
                original_price: savedPrice,
                current_price: currentPrice,
                drop_percent: dropPercent,
                savings_formatted: '$' + ((savedPrice - currentPrice) / 100).toFixed(2)
            });
        }
    }

    // Store alerts in Supabase notifications if available
    if (alerts.length > 0 && supabaseUrl && supabaseKey) {
        try {
            const notifBodies = alerts.map(alert => ({
                uid: userId,
                type: 'price_drop',
                title: 'Price Drop Alert!',
                message: alert.product_name + ' dropped ' + alert.drop_percent + '% \u2014 save ' + alert.savings_formatted + '!',
                link: '/pages/store.html?product=' + alert.product_id,
                metadata: JSON.stringify(alert)
            }));
            await fetch(supabaseUrl + '/rest/v1/notifications', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                },
                body: JSON.stringify(notifBodies)
            });
        } catch (e) {
            console.error('Notification batch error:', e);
        }
    }

    return {
        ok: true,
        alerts: alerts,
        total_drops: alerts.length
    };
}
