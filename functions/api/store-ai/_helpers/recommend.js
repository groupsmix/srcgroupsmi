/**
 * Action: Recommendations — AI product recommendations based on user context
 */
import { callAI } from './ai-providers.js';

export async function handleRecommend(env, body) {
    const products = body.products || [];
    const viewedCategories = body.viewed_categories || [];
    const viewedProducts = body.viewed_products || [];
    if (!products.length) return { ok: false, error: 'No products' };

    // If no browsing history, return newest products
    if (!viewedCategories.length && !viewedProducts.length) {
        const sorted = [...products].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return { ok: true, recommended: sorted.slice(0, 4).map(p => p.id) };
    }

    const productList = products.map((p, i) =>
        `${i + 1}. [ID:${p.id}] "${p.name}" - Type: ${p.product_type} - Price: ${p.price_formatted}`
    ).join('\n');

    const messages = [
        {
            role: 'system',
            content: `You are a product recommendation engine for GroupsMix Store. Based on the user's browsing history (categories they viewed and products they interacted with), recommend the most relevant products from the catalog. Output ONLY a JSON object with key "recommended" containing an array of product indices (1-based numbers from the catalog), ordered by relevance. Maximum 6 recommendations. Exclude already-viewed products.`
        },
        {
            role: 'user',
            content: `Product catalog:\n${productList}\n\nUser browsing history:\n- Viewed categories: ${viewedCategories.join(', ') || 'none'}\n- Already viewed product IDs: ${viewedProducts.join(', ') || 'none'}\n\nRecommend products as JSON.`
        }
    ];

    const result = await callAI(env, messages, 200, 0.3);
    if (!result) {
        // Fallback: return random products
        const shuffled = [...products];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const bytes = new Uint8Array(1);
            crypto.getRandomValues(bytes);
            const j = bytes[0] % (i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return { ok: true, recommended: shuffled.slice(0, 4).map(p => p.id) };
    }

    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const indices = (parsed.recommended || []).filter(i => typeof i === 'number' && i >= 1 && i <= products.length);
            return { ok: true, recommended: indices.map(i => products[i - 1].id) };
        }
    } catch (e) {
        console.error('Parse error for AI recommendations:', e);
    }

    const sorted = [...products].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { ok: true, recommended: sorted.slice(0, 4).map(p => p.id) };
}
