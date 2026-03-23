/**
 * Action: Smart Pricing — Suggest competitive price range for new listings
 */

export async function handleSmartPricing(env, body) {
    const productType = (body.product_type || 'digital').trim();
    const products = body.products || [];

    if (!products.length) return { ok: false, error: 'Missing products catalog' };

    // Filter similar products by type
    let similar = products.filter(p => p.product_type === productType);
    if (similar.length < 2) {
        // Broaden to all products if not enough of same type
        similar = products;
    }

    const prices = similar.map(p => p.price || 0).filter(p => p > 0);
    if (!prices.length) return { ok: true, suggestion: null, message: 'No pricing data available' };

    prices.sort((a, b) => a - b);

    const min = prices[0];
    const max = prices[prices.length - 1];
    const median = prices[Math.floor(prices.length / 2)];
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;

    // Calculate quartiles for suggested range
    const q1 = prices[Math.floor(prices.length * 0.25)];
    const q3 = prices[Math.floor(prices.length * 0.75)];

    // Build description of similar products
    const typeLabel = productType.charAt(0).toUpperCase() + productType.slice(1) + 's';

    return {
        ok: true,
        suggestion: {
            product_type: productType,
            similar_count: similar.length,
            price_range: {
                min: min,
                max: max,
                min_formatted: '$' + (min / 100).toFixed(2),
                max_formatted: '$' + (max / 100).toFixed(2)
            },
            suggested_range: {
                low: q1,
                high: q3,
                low_formatted: '$' + (q1 / 100).toFixed(2),
                high_formatted: '$' + (q3 / 100).toFixed(2)
            },
            median_price: median,
            median_formatted: '$' + (median / 100).toFixed(2),
            average_price: Math.round(avg),
            average_formatted: '$' + (avg / 100).toFixed(2),
            tip: 'Similar ' + typeLabel.toLowerCase() + ' sell for $' + (q1 / 100).toFixed(0) + '\u2013$' + (q3 / 100).toFixed(0) + '. Price at the median ($' + (median / 100).toFixed(2) + ') for fastest sales, or above $' + (q3 / 100).toFixed(2) + ' if your product has premium features.',
            tip_ar: typeLabel.toLowerCase() + ' \u0645\u0634\u0627\u0628\u0647\u0629 \u062a\u0628\u0627\u0639 \u0628\u064a\u0646 $' + (q1 / 100).toFixed(0) + '\u2013$' + (q3 / 100).toFixed(0) + '.'
        }
    };
}
