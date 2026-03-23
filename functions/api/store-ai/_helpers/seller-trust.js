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
