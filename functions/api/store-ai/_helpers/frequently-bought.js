/**
 * Action: Frequently Bought Together — pre-computed from purchase data
 */

export async function handleFrequentlyBought(env, body) {
    const productId = (body.product_id || '').trim();
    const products = body.products || [];
    if (!productId || !products.length) return { ok: false, error: 'Missing product_id or products' };

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    // Check KV cache for pre-computed bundle suggestions
    const kvCacheKey = 'fbt:' + productId;
    if (env?.STORE_KV) {
        try {
            const cached = await env.STORE_KV.get(kvCacheKey, 'json');
            if (cached && cached.frequently_bought_together && cached.timestamp) {
                const ageSeconds = (Date.now() - cached.timestamp) / 1000;
                if (ageSeconds < 3600) { // 1 hour TTL
                    return {
                        ok: true,
                        source: 'kv_cache',
                        product_id: productId,
                        frequently_bought_together: cached.frequently_bought_together,
                        sample_size: cached.sample_size || 0,
                        cache_age_seconds: Math.round(ageSeconds)
                    };
                }
            }
        } catch (e) {
            console.error('KV cache read error:', e);
        }
    }

    // If we have Supabase access, query actual purchase co-occurrence data
    if (supabaseUrl && supabaseKey) {
        try {
            // Find users who bought this product
            const buyersRes = await fetch(
                supabaseUrl + '/rest/v1/wallet_transactions?type=eq.purchase&description=like.*' + encodeURIComponent(productId) + '*&select=user_id&limit=200',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const buyers = await buyersRes.json();
            const buyerIds = [...new Set((buyers || []).map(b => b.user_id).filter(Boolean))];

            if (buyerIds.length >= 3) {
                // Find other products these users also bought
                const coProducts = {};
                for (const uid of buyerIds.slice(0, 50)) {
                    const otherRes = await fetch(
                        supabaseUrl + '/rest/v1/wallet_transactions?type=eq.purchase&user_id=eq.' + encodeURIComponent(uid) + '&select=description&limit=50',
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

                // Sort by co-occurrence frequency
                const ranked = Object.entries(coProducts)
                    .filter(([, count]) => count >= 2)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([id, count]) => ({
                        product_id: id,
                        co_purchase_count: count,
                        confidence: Math.min(0.95, count / buyerIds.length)
                    }));

                if (ranked.length > 0) {
                    // Cache the result in KV for future requests
                    if (env?.STORE_KV) {
                        try {
                            await env.STORE_KV.put(kvCacheKey, JSON.stringify({
                                frequently_bought_together: ranked,
                                sample_size: buyerIds.length,
                                timestamp: Date.now()
                            }), { expirationTtl: 3600 });
                        } catch (e) {
                            console.error('KV cache write error:', e);
                        }
                    }

                    return {
                        ok: true,
                        source: 'purchase_data',
                        product_id: productId,
                        frequently_bought_together: ranked,
                        sample_size: buyerIds.length
                    };
                }
            }
        } catch (e) {
            console.error('Frequently bought together error:', e);
        }
    }

    // Fallback: type + price heuristic
    const sourceProduct = products.find(p => p.id === productId);
    if (!sourceProduct) return { ok: true, frequently_bought_together: [] };

    const candidates = products
        .filter(p => p.id !== productId)
        .map(p => {
            let score = 0;
            if (p.product_type === sourceProduct.product_type) score += 3;
            const complementary = {
                'guide': ['template', 'tool'],
                'template': ['guide', 'tool'],
                'course': ['guide', 'tool'],
                'tool': ['guide', 'template'],
                'membership': ['course', 'guide'],
                'bundle': [],
                'service': ['tool', 'guide']
            };
            if ((complementary[sourceProduct.product_type] || []).includes(p.product_type)) score += 5;
            if (sourceProduct.price > 0 && p.price > 0) {
                const ratio = Math.min(sourceProduct.price, p.price) / Math.max(sourceProduct.price, p.price);
                score += ratio * 3;
            }
            return { product_id: p.id, score, confidence: Math.min(0.8, score / 10) };
        })
        .filter(c => c.score > 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(c => ({ product_id: c.product_id, confidence: parseFloat(c.confidence.toFixed(2)) }));

    return {
        ok: true,
        source: 'heuristic',
        product_id: productId,
        frequently_bought_together: candidates
    };
}
