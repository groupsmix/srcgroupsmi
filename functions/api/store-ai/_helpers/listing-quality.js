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
