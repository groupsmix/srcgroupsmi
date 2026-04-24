import { callAI } from './ai-providers.js';

/**
 * Action: Smart Bundles — AI smart bundle suggestions
 */


export async function handleBundles(env, body) {
    const products = body.products || [];
    if (products.length < 3) return { ok: true, bundles: [] };

    const productList = products.map((p, i) =>
        `${i + 1}. [ID:${p.id}] "${p.name}" - Type: ${p.product_type} - Price: $${(p.price / 100).toFixed(2)}`
    ).join('\n');

    const messages = [
        {
            role: 'system',
            content: `You are a product bundling strategist for GroupsMix Store. Analyze the product catalog and suggest smart bundles — combinations of 2-3 products that complement each other and provide more value together. Output ONLY a JSON object with key "bundles" containing an array of bundle objects. Each bundle has: "name" (creative bundle name), "name_ar" (Arabic name), "product_indices" (array of 1-based product indices), "discount_pct" (suggested discount percentage 10-30), "reason" (short English explanation why these go together), "reason_ar" (Arabic explanation). Maximum 3 bundles.`
        },
        {
            role: 'user',
            content: `Product catalog:\n${productList}\n\nSuggest smart bundles. Output JSON only.`
        }
    ];

    const result = await callAI(env, messages, 800, 0.5);
    if (!result) return { ok: true, bundles: [] };

    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const bundles = (parsed.bundles || []).map(b => ({
                name: b.name || 'Bundle',
                name_ar: b.name_ar || b.name || 'باقة',
                product_ids: (b.product_indices || [])
                    .filter(i => typeof i === 'number' && i >= 1 && i <= products.length)
                    .map(i => products[i - 1].id),
                discount_pct: Math.min(30, Math.max(10, b.discount_pct || 15)),
                reason: b.reason || '',
                reason_ar: b.reason_ar || ''
            })).filter(b => b.product_ids.length >= 2);
            return { ok: true, bundles: bundles };
        }
    } catch (e) {
        console.error('Parse error for bundles:', e);
    }
    return { ok: true, bundles: [] };
}
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
