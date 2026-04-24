/**
 * Action: Enhance Description — AI SEO-enhanced product description
 */
import { callAI } from './ai-providers.js';
import { wrapUserInput, withUserInputDirective } from '../../_shared/prompt-safety.js';
import { moderateOutput } from '../../_shared/moderation.js';

export async function handleEnhanceDesc(env, body) {
    const name = (body.name || '').substring(0, 200).trim();
    const description = (body.description || '').substring(0, 2000).trim();
    const productType = body.product_type || 'digital';
    if (!name && !description) return { ok: false, error: 'Missing product info' };

    const systemPrompt = `You are an expert SEO copywriter for digital products. Your job is to enhance the product description inside <user_input> for maximum conversion and search discoverability. Rules:
1. Keep the enhanced description under 300 characters
2. Add relevant emojis strategically (2-3 max)
3. Include power words that drive sales (exclusive, proven, essential, etc.)
4. Add relevant keywords naturally
5. Keep the core message intact
6. Support both Arabic and English — detect and match language
7. Output ONLY a JSON object with key "enhanced" containing the improved description string. Nothing else.`;

    const userBlock = wrapUserInput(
        `Product: "${name}"\nType: ${productType}\nOriginal description: "${description}"\n\nEnhance for SEO and conversion. Output JSON only.`
    );

    const messages = [
        { role: 'system', content: withUserInputDirective(systemPrompt) },
        { role: 'user', content: userBlock }
    ];

    const result = await callAI(env, messages, 400, 0.6);
    if (!result) return { ok: true, enhanced: description };

    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const enhanced = parsed.enhanced || description;
            // E-3: Moderate the free-form enhanced description before returning.
            if (enhanced && enhanced !== description) {
                const verdict = await moderateOutput(env, enhanced, { userText: name + ' ' + description });
                if (verdict.flagged) {
                    console.warn('enhance-desc: output blocked by moderation', verdict.category);
                    return { ok: true, enhanced: description, moderation: { flagged: true, category: verdict.category } };
                }
            }
            return { ok: true, enhanced: enhanced };
        }
    } catch (e) {
        console.error('Parse error for enhance desc:', e);
    }
    return { ok: true, enhanced: description };
}
/**
 * Action: Listing Quality — Rate listing quality with improvement tips
 */

export async function handleListingQuality(env, body) {
    const name = (body.name || '').trim();
    const description = (body.description || '').trim();
    const thumbUrl = (body.thumb_url || '').trim();
    const productType = (body.product_type || '').trim();
    const price = body.price || 0;
    const variants = body.variants || [];

    let score = 0;
    const maxScore = 100;
    const checks = [];

    // 1. Title quality (max 20)
    if (name.length >= 5 && name.length <= 80) {
        score += 15;
        checks.push({ field: 'title', score: 15, max: 20, status: 'good', tip: name.length < 20 ? 'Consider a more descriptive title (20+ characters) for better searchability.' : null });
    } else if (name.length > 0) {
        score += 8;
        checks.push({ field: 'title', score: 8, max: 20, status: 'needs_work', tip: name.length < 5 ? 'Title is too short. Use 10-60 characters for best results.' : 'Title is too long. Keep it under 80 characters.' });
    } else {
        checks.push({ field: 'title', score: 0, max: 20, status: 'missing', tip: 'Add a clear, descriptive title.' });
    }
    // Title keyword richness bonus
    if (name.length >= 20) { score += 5; checks[checks.length - 1].score += 5; }

    // 2. Description quality (max 30)
    const plainDesc = description.replace(/<[^>]*>/g, '').trim();
    const descWords = plainDesc.split(/\s+/).filter(Boolean).length;
    if (descWords >= 50) {
        score += 30;
        checks.push({ field: 'description', score: 30, max: 30, status: 'excellent', tip: null });
    } else if (descWords >= 20) {
        score += 20;
        checks.push({ field: 'description', score: 20, max: 30, status: 'good', tip: 'Add more detail (50+ words) to improve buyer confidence and SEO.' });
    } else if (descWords > 0) {
        score += 10;
        checks.push({ field: 'description', score: 10, max: 30, status: 'needs_work', tip: 'Your description is thin. Aim for 50+ words covering features, benefits, and who it is for.' });
    } else {
        checks.push({ field: 'description', score: 0, max: 30, status: 'missing', tip: 'Add a detailed description. Products without descriptions get 80% fewer sales.' });
    }

    // 3. Image (max 20)
    if (thumbUrl) {
        score += 20;
        checks.push({ field: 'image', score: 20, max: 20, status: 'good', tip: null });
    } else {
        checks.push({ field: 'image', score: 0, max: 20, status: 'missing', tip: 'Add a preview image to get 3x more views. Use a clear, high-quality product screenshot.' });
    }

    // 4. Category/Type (max 10)
    if (productType && productType !== 'digital') {
        score += 10;
        checks.push({ field: 'category', score: 10, max: 10, status: 'good', tip: null });
    } else {
        score += 3;
        checks.push({ field: 'category', score: 3, max: 10, status: 'needs_work', tip: 'Set a specific product type (guide, template, course, tool) instead of generic "digital" for better discoverability.' });
    }

    // 5. Pricing (max 10)
    if (price > 0) {
        score += 10;
        checks.push({ field: 'pricing', score: 10, max: 10, status: 'good', tip: null });
    } else {
        score += 5;
        checks.push({ field: 'pricing', score: 5, max: 10, status: 'info', tip: 'Free products get more downloads but less revenue. Consider a paid tier if your product has unique value.' });
    }

    // 6. Variants (max 10)
    if (variants.length > 1) {
        score += 10;
        checks.push({ field: 'variants', score: 10, max: 10, status: 'good', tip: null });
    } else {
        score += 3;
        checks.push({ field: 'variants', score: 3, max: 10, status: 'info', tip: 'Adding multiple variants (e.g., Basic/Pro tiers) can increase revenue by 40%.' });
    }

    // Overall grade
    let grade = 'F';
    if (score >= 90) grade = 'A+';
    else if (score >= 80) grade = 'A';
    else if (score >= 70) grade = 'B';
    else if (score >= 60) grade = 'C';
    else if (score >= 40) grade = 'D';

    // Priority tips (only actionable items)
    const priorityTips = checks.filter(c => c.tip).sort((a, b) => (a.max - a.score) - (b.max - b.score)).reverse().slice(0, 3);

    return {
        ok: true,
        quality: {
            score: score,
            max_score: maxScore,
            grade: grade,
            checks: checks,
            priority_tips: priorityTips.map(t => ({ field: t.field, tip: t.tip, potential_gain: t.max - t.score }))
        }
    };
}
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
