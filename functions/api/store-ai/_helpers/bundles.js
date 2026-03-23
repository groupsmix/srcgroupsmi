/**
 * Action: Smart Bundles — AI smart bundle suggestions
 */
import { callAI } from './ai-providers.js';

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
