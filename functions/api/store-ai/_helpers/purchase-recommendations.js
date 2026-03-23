/**
 * Action: Purchase-Based Recommendations — "Buyers who purchased this also bought..."
 */

export async function handlePurchaseRecommendations(env, body) {
    const productId = (body.product_id || '').trim();
    const products = body.products || [];
    if (!productId || !products.length) return { ok: false, error: 'Missing product_id or products' };

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (supabaseUrl && supabaseKey) {
        try {
            // Find users who bought this product
            const buyersRes = await fetch(
                supabaseUrl + '/rest/v1/wallet_transactions?type=in.(purchase,store_purchase)&description=like.*' + encodeURIComponent(productId) + '*&select=user_id&limit=200',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const buyers = await buyersRes.json();
            const buyerIds = [...new Set((buyers || []).map(b => b.user_id).filter(Boolean))];

            if (buyerIds.length >= 3) {
                // Find other products these users also bought
                const coProducts = {};
                for (const uid of buyerIds.slice(0, 50)) {
                    const otherRes = await fetch(
                        supabaseUrl + '/rest/v1/wallet_transactions?type=in.(purchase,store_purchase)&user_id=eq.' + encodeURIComponent(uid) + '&select=description&limit=50',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                    );
                    const otherTxns = await otherRes.json();
                    (otherTxns || []).forEach(t => {
                        const desc = t.description || '';
                        products.forEach(p => {
                            if (p.id !== productId && desc.includes(p.id)) {
                                coProducts[p.id] = (coProducts[p.id] || 0) + 1;
                            }
                        });
                    });
                }

                const ranked = Object.entries(coProducts)
                    .filter(e => e[1] >= 2)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(e => ({ product_id: e[0], co_purchase_count: e[1], confidence: Math.min(0.99, e[1] / buyerIds.length) }));

                if (ranked.length > 0) {
                    return {
                        ok: true,
                        source: 'purchase_data',
                        product_id: productId,
                        recommendations: ranked,
                        sample_size: buyerIds.length,
                        label: 'Buyers who purchased this also bought...',
                        label_ar: '\u0627\u0644\u0645\u0634\u062a\u0631\u0648\u0646 \u0627\u0644\u0630\u064a\u0646 \u0627\u0634\u062a\u0631\u0648\u0627 \u0647\u0630\u0627 \u0627\u0634\u062a\u0631\u0648\u0627 \u0623\u064a\u0636\u0627\u064b...'
                    };
                }
            }
        } catch (e) {
            console.error('Purchase recommendations error:', e);
        }
    }

    // Fallback: type + price heuristic
    const sourceProduct = products.find(p => p.id === productId);
    if (!sourceProduct) return { ok: true, recommendations: [] };

    const complementary = {
        'guide': ['template', 'tool'], 'template': ['guide', 'tool'],
        'course': ['guide', 'tool'], 'tool': ['guide', 'template'],
        'membership': ['course', 'guide'], 'service': ['tool', 'guide']
    };

    const candidates = products
        .filter(p => p.id !== productId)
        .map(p => {
            let s = 0;
            if (p.product_type === sourceProduct.product_type) s += 3;
            if ((complementary[sourceProduct.product_type] || []).indexOf(p.product_type) !== -1) s += 5;
            if (sourceProduct.price > 0 && p.price > 0) {
                s += Math.min(sourceProduct.price, p.price) / Math.max(sourceProduct.price, p.price) * 3;
            }
            return { product_id: p.id, score: s, confidence: Math.min(0.8, s / 10) };
        })
        .filter(c => c.score > 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map(c => ({ product_id: c.product_id, confidence: parseFloat(c.confidence.toFixed(2)) }));

    return {
        ok: true,
        source: 'heuristic',
        product_id: productId,
        recommendations: candidates,
        label: 'You might also like...',
        label_ar: '\u0642\u062f \u064a\u0639\u062c\u0628\u0643 \u0623\u064a\u0636\u0627\u064b...'
    };
}
