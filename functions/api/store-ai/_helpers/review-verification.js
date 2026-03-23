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
