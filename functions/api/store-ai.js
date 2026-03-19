/**
 * /api/store-ai — AI-Powered Store Features
 *
 * Endpoints (via POST JSON body with "action" field):
 *   - action: "search"                   — AI smart search for products (AR/EN)
 *   - action: "recommend"                — AI product recommendations based on user context
 *   - action: "enhance-desc"             — AI SEO-enhanced product description
 *   - action: "bundles"                  — AI smart bundle suggestions
 *   - action: "seller-trust"             — Compute seller trust score + badges
 *   - action: "smart-pricing"            — Suggest competitive price range for new listings
 *   - action: "listing-quality"          — Rate listing quality with improvement tips
 *   - action: "purchase-recommendations" — "Buyers who purchased this also bought..."
 *   - action: "offers"                   — Negotiation/offers (create, respond, list)
 *   - action: "dispute"                  — Dispute resolution flow (create, respond, resolve, list)
 *   - action: "flash-sales"              — Seasonal/flash sales with countdown timers
 *   - action: "review-verification"      — Verify reviewer is an actual buyer
 *
 * Uses Groq + OpenRouter dual-API strategy (same as chat.js/groq.js)
 *
 * Environment variables required:
 *   GROQ_API_KEY        — Groq API key
 *   OPENROUTER_API_KEY  — OpenRouter API key
 *   SUPABASE_URL        — Supabase project URL (for marketplace features)
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

/* ── Allowed origins for CORS ────────────────────────────────── */
const ALLOWED_ORIGINS = [
    'https://groupsmix.com',
    'https://www.groupsmix.com'
];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
}

/* ── AI Provider helpers ─────────────────────────────────────── */
const OPENROUTER_MODELS = [
    'google/gemma-3-27b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'mistralai/mistral-small-3.1-24b-instruct:free'
];

async function callGroq(apiKey, messages, maxTokens, temperature) {
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: messages,
                max_tokens: maxTokens || 500,
                temperature: temperature || 0.4,
                stream: false
            })
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json.choices?.[0]?.message?.content || null;
    } catch (err) {
        console.error('Groq error:', err);
        return null;
    }
}

async function callOpenRouter(apiKey, messages, maxTokens, temperature) {
    for (const model of OPENROUTER_MODELS) {
        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + apiKey,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://groupsmix.com',
                    'X-Title': 'GroupsMix Store AI'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    max_tokens: maxTokens || 500,
                    temperature: temperature || 0.4,
                    stream: false
                })
            });
            if (!res.ok) continue;
            const json = await res.json();
            const content = json.choices?.[0]?.message?.content;
            if (content) return content;
        } catch (err) {
            console.error('OpenRouter error (' + model + '):', err);
        }
    }
    return null;
}

async function callAI(env, messages, maxTokens, temperature) {
    const groqKey = env?.GROQ_API_KEY;
    const orKey = env?.OPENROUTER_API_KEY;
    const useGroqFirst = (Math.floor(Date.now() / 1000) % 2 === 0);

    if (groqKey && orKey) {
        if (useGroqFirst) {
            return await callGroq(groqKey, messages, maxTokens, temperature)
                || await callOpenRouter(orKey, messages, maxTokens, temperature);
        } else {
            return await callOpenRouter(orKey, messages, maxTokens, temperature)
                || await callGroq(groqKey, messages, maxTokens, temperature);
        }
    } else if (groqKey) {
        return await callGroq(groqKey, messages, maxTokens, temperature);
    } else if (orKey) {
        return await callOpenRouter(orKey, messages, maxTokens, temperature);
    }
    return null;
}

/* ── Action: Smart Search ────────────────────────────────────── */
async function handleSearch(env, body) {
    const query = (body.query || '').substring(0, 500).trim();
    const products = body.products || [];
    if (!query || !products.length) return { ok: false, error: 'Missing query or products' };

    const productList = products.map((p, i) =>
        `${i + 1}. "${p.name}" - ${p.description?.substring(0, 100) || 'No description'} - Type: ${p.product_type} - Price: ${p.price_formatted}`
    ).join('\n');

    const messages = [
        {
            role: 'system',
            content: `You are a product search assistant for GroupsMix Store. The user will search for products in Arabic or English. Your job is to return the indices (1-based) of the most relevant products from the product list. Output ONLY a JSON object with key "matches" containing an array of product indices (numbers), ordered by relevance. Maximum 10 matches. If nothing matches well, return {"matches":[]}.`
        },
        {
            role: 'user',
            content: `Product catalog:\n${productList}\n\nUser search: "${query}"\n\nReturn matching product indices as JSON.`
        }
    ];

    const result = await callAI(env, messages, 200, 0.2);
    if (!result) return { ok: false, error: 'AI service unavailable' };

    try {
        // Extract JSON from response
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const indices = (parsed.matches || []).filter(i => typeof i === 'number' && i >= 1 && i <= products.length);
            return { ok: true, matches: indices };
        }
    } catch (e) {
        console.error('Parse error for AI search:', e);
    }
    return { ok: true, matches: [] };
}

/* ── Action: Recommendations ─────────────────────────────────── */
async function handleRecommend(env, body) {
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
        const shuffled = [...products].sort(() => Math.random() - 0.5);
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

/* ── Action: Enhance Description (SEO) ───────────────────────── */
async function handleEnhanceDesc(env, body) {
    const name = (body.name || '').substring(0, 200).trim();
    const description = (body.description || '').substring(0, 2000).trim();
    const productType = body.product_type || 'digital';
    if (!name && !description) return { ok: false, error: 'Missing product info' };

    const messages = [
        {
            role: 'system',
            content: `You are an expert SEO copywriter for digital products. Your job is to enhance product descriptions for maximum conversion and search discoverability. Rules:
1. Keep the enhanced description under 300 characters
2. Add relevant emojis strategically (2-3 max)
3. Include power words that drive sales (exclusive, proven, essential, etc.)
4. Add relevant keywords naturally
5. Keep the core message intact
6. Support both Arabic and English — detect and match language
7. Output ONLY a JSON object with key "enhanced" containing the improved description string. Nothing else.`
        },
        {
            role: 'user',
            content: `Product: "${name}"\nType: ${productType}\nOriginal description: "${description}"\n\nEnhance for SEO and conversion. Output JSON only.`
        }
    ];

    const result = await callAI(env, messages, 400, 0.6);
    if (!result) return { ok: true, enhanced: description };

    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return { ok: true, enhanced: parsed.enhanced || description };
        }
    } catch (e) {
        console.error('Parse error for enhance desc:', e);
    }
    return { ok: true, enhanced: description };
}

/* ── Action: Smart Bundles ───────────────────────────────────── */
async function handleBundles(env, body) {
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

/* ── Action: Seller Trust Score ───────────────────────────────── */
async function handleSellerTrust(env, body) {
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
    var completedTxns = Array.isArray(txns) ? txns : [];

    // Fetch reviews for this seller's products
    const reviewRes = await fetch(
        supabaseUrl + '/rest/v1/reviews?seller_id=eq.' + encodeURIComponent(sellerId) + '&select=rating,created_at&limit=200',
        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    );
    var sellerReviews = await reviewRes.json();
    sellerReviews = Array.isArray(sellerReviews) ? sellerReviews : [];

    // Fetch disputes/refunds
    const refundRes = await fetch(
        supabaseUrl + '/rest/v1/wallet_transactions?type=eq.refund&description=like.*' + encodeURIComponent(sellerId) + '*&select=amount&limit=100',
        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    );
    var refunds = await refundRes.json();
    refunds = Array.isArray(refunds) ? refunds : [];

    // Calculate trust score components (0-100 each)
    var score = 0;
    var breakdown = {};

    // 1. Account age (max 20 points) — 1 point per month, capped at 20
    var accountAgeDays = (Date.now() - new Date(seller.created_at).getTime()) / 86400000;
    var ageScore = Math.min(20, Math.floor(accountAgeDays / 30));
    breakdown.account_age = { score: ageScore, max: 20, months: Math.floor(accountAgeDays / 30) };
    score += ageScore;

    // 2. Completed transactions (max 25 points)
    var txnScore = Math.min(25, completedTxns.length);
    breakdown.completed_transactions = { score: txnScore, max: 25, count: completedTxns.length };
    score += txnScore;

    // 3. Review ratings (max 25 points)
    var avgRating = 0;
    if (sellerReviews.length > 0) {
        avgRating = sellerReviews.reduce(function(s, r) { return s + (r.rating || 0); }, 0) / sellerReviews.length;
    }
    var ratingScore = sellerReviews.length > 0 ? Math.round(avgRating * 5) : 0; // 5 stars * 5 = max 25
    breakdown.review_ratings = { score: ratingScore, max: 25, avg_rating: parseFloat(avgRating.toFixed(1)), count: sellerReviews.length };
    score += ratingScore;

    // 4. Refund rate (max 15 points — lower is better)
    var refundRate = completedTxns.length > 0 ? (refunds.length / completedTxns.length) : 0;
    var refundScore = Math.max(0, Math.round(15 * (1 - refundRate * 5))); // 0% refunds = 15, 20%+ = 0
    breakdown.refund_rate = { score: refundScore, max: 15, rate: parseFloat((refundRate * 100).toFixed(1)), refund_count: refunds.length };
    score += refundScore;

    // 5. Verification bonus (max 15 points)
    var verifyScore = 0;
    if (seller.email) verifyScore += 5;
    if (seller.phone_verified) verifyScore += 5;
    if (seller.identity_verified) verifyScore += 5;
    breakdown.verification = { score: verifyScore, max: 15, email: !!seller.email, phone: !!seller.phone_verified, identity: !!seller.identity_verified };
    score += verifyScore;

    // Determine badges
    var badges = [];
    if (seller.identity_verified) badges.push({ id: 'verified', label: 'Verified Seller', label_ar: '\u0628\u0627\u0626\u0639 \u0645\u0648\u062b\u0642', color: '#10b981' });
    if (score >= 80 && completedTxns.length >= 20) badges.push({ id: 'top-seller', label: 'Top Seller', label_ar: '\u0628\u0627\u0626\u0639 \u0645\u0645\u064a\u0632', color: '#f59e0b' });
    if (score >= 60 && completedTxns.length >= 5) badges.push({ id: 'trusted', label: 'Trusted Seller', label_ar: '\u0628\u0627\u0626\u0639 \u0645\u0648\u062b\u0648\u0642', color: '#3b82f6' });
    if (accountAgeDays > 365) badges.push({ id: 'veteran', label: 'Veteran Member', label_ar: '\u0639\u0636\u0648 \u0645\u062e\u0636\u0631\u0645', color: '#8b5cf6' });
    if (refundRate === 0 && completedTxns.length >= 10) badges.push({ id: 'zero-refund', label: 'Zero Refunds', label_ar: '\u0628\u062f\u0648\u0646 \u0627\u0633\u062a\u0631\u062f\u0627\u062f', color: '#06b6d4' });

    // Trust tier
    var tier = 'new';
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

/* ── Action: Smart Pricing Suggestions ──────────────────────── */
async function handleSmartPricing(env, body) {
    const productType = (body.product_type || 'digital').trim();
    const productName = (body.name || '').trim();
    const products = body.products || [];

    if (!products.length) return { ok: false, error: 'Missing products catalog' };

    // Filter similar products by type
    var similar = products.filter(function(p) { return p.product_type === productType; });
    if (similar.length < 2) {
        // Broaden to all products if not enough of same type
        similar = products;
    }

    var prices = similar.map(function(p) { return p.price || 0; }).filter(function(p) { return p > 0; });
    if (!prices.length) return { ok: true, suggestion: null, message: 'No pricing data available' };

    prices.sort(function(a, b) { return a - b; });

    var min = prices[0];
    var max = prices[prices.length - 1];
    var median = prices[Math.floor(prices.length / 2)];
    var avg = prices.reduce(function(s, p) { return s + p; }, 0) / prices.length;

    // Calculate quartiles for suggested range
    var q1 = prices[Math.floor(prices.length * 0.25)];
    var q3 = prices[Math.floor(prices.length * 0.75)];

    // Build description of similar products
    var typeLabel = productType.charAt(0).toUpperCase() + productType.slice(1) + 's';

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

/* ── Action: Listing Quality Score ──────────────────────────── */
async function handleListingQuality(env, body) {
    const name = (body.name || '').trim();
    const description = (body.description || '').trim();
    const thumbUrl = (body.thumb_url || '').trim();
    const productType = (body.product_type || '').trim();
    const price = body.price || 0;
    const variants = body.variants || [];

    var score = 0;
    var maxScore = 100;
    var checks = [];

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
    var plainDesc = description.replace(/<[^>]*>/g, '').trim();
    var descWords = plainDesc.split(/\s+/).filter(Boolean).length;
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
    var grade = 'F';
    if (score >= 90) grade = 'A+';
    else if (score >= 80) grade = 'A';
    else if (score >= 70) grade = 'B';
    else if (score >= 60) grade = 'C';
    else if (score >= 40) grade = 'D';

    // Priority tips (only actionable items)
    var priorityTips = checks.filter(function(c) { return c.tip; }).sort(function(a, b) { return (a.max - a.score) - (b.max - b.score); }).reverse().slice(0, 3);

    return {
        ok: true,
        quality: {
            score: score,
            max_score: maxScore,
            grade: grade,
            checks: checks,
            priority_tips: priorityTips.map(function(t) { return { field: t.field, tip: t.tip, potential_gain: t.max - t.score }; })
        }
    };
}

/* ── Action: Purchase-Based Recommendations ─────────────────── */
async function handlePurchaseRecommendations(env, body) {
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
            const buyerIds = [...new Set((buyers || []).map(function(b) { return b.user_id; }).filter(Boolean))];

            if (buyerIds.length >= 3) {
                // Find other products these users also bought
                const coProducts = {};
                for (const uid of buyerIds.slice(0, 50)) {
                    const otherRes = await fetch(
                        supabaseUrl + '/rest/v1/wallet_transactions?type=in.(purchase,store_purchase)&user_id=eq.' + encodeURIComponent(uid) + '&select=description&limit=50',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                    );
                    const otherTxns = await otherRes.json();
                    (otherTxns || []).forEach(function(t) {
                        const desc = t.description || '';
                        products.forEach(function(p) {
                            if (p.id !== productId && desc.includes(p.id)) {
                                coProducts[p.id] = (coProducts[p.id] || 0) + 1;
                            }
                        });
                    });
                }

                const ranked = Object.entries(coProducts)
                    .filter(function(e) { return e[1] >= 2; })
                    .sort(function(a, b) { return b[1] - a[1]; })
                    .slice(0, 6)
                    .map(function(e) { return { product_id: e[0], co_purchase_count: e[1], confidence: Math.min(0.99, e[1] / buyerIds.length) }; });

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
    const sourceProduct = products.find(function(p) { return p.id === productId; });
    if (!sourceProduct) return { ok: true, recommendations: [] };

    const complementary = {
        'guide': ['template', 'tool'], 'template': ['guide', 'tool'],
        'course': ['guide', 'tool'], 'tool': ['guide', 'template'],
        'membership': ['course', 'guide'], 'service': ['tool', 'guide']
    };

    var candidates = products
        .filter(function(p) { return p.id !== productId; })
        .map(function(p) {
            var s = 0;
            if (p.product_type === sourceProduct.product_type) s += 3;
            if ((complementary[sourceProduct.product_type] || []).indexOf(p.product_type) !== -1) s += 5;
            if (sourceProduct.price > 0 && p.price > 0) {
                s += Math.min(sourceProduct.price, p.price) / Math.max(sourceProduct.price, p.price) * 3;
            }
            return { product_id: p.id, score: s, confidence: Math.min(0.8, s / 10) };
        })
        .filter(function(c) { return c.score > 2; })
        .sort(function(a, b) { return b.score - a.score; })
        .slice(0, 6)
        .map(function(c) { return { product_id: c.product_id, confidence: parseFloat(c.confidence.toFixed(2)) }; });

    return {
        ok: true,
        source: 'heuristic',
        product_id: productId,
        recommendations: candidates,
        label: 'You might also like...',
        label_ar: '\u0642\u062f \u064a\u0639\u062c\u0628\u0643 \u0623\u064a\u0636\u0627\u064b...'
    };
}

/* ── Action: Negotiation / Offers ───────────────────────────── */
async function handleOffers(env, body) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Server not configured' };

    const offerAction = (body.offer_action || '').trim();

    if (offerAction === 'create') {
        const buyerId = (body.buyer_id || '').trim();
        const sellerId = (body.seller_id || '').trim();
        const pId = (body.product_id || '').trim();
        const offerPrice = parseInt(body.offer_price) || 0;
        const listPrice = parseInt(body.list_price) || 0;
        const message = (body.message || '').substring(0, 500).trim();

        if (!buyerId || !sellerId || !pId || !offerPrice) {
            return { ok: false, error: 'Missing buyer_id, seller_id, product_id, or offer_price' };
        }

        // Validate offer is at least 50% of list price
        if (listPrice > 0 && offerPrice < listPrice * 0.5) {
            return { ok: false, error: 'Offer must be at least 50% of the list price' };
        }

        const offerRes = await fetch(supabaseUrl + '/rest/v1/marketplace_offers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                buyer_id: buyerId,
                seller_id: sellerId,
                product_id: pId,
                offer_price: offerPrice,
                list_price: listPrice,
                message: message,
                status: 'pending',
                expires_at: new Date(Date.now() + 48 * 3600000).toISOString()
            })
        });

        if (!offerRes.ok) return { ok: false, error: 'Failed to create offer' };
        const offer = await offerRes.json();

        // Notify seller
        await fetch(supabaseUrl + '/rest/v1/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify({
                uid: sellerId,
                type: 'offer_received',
                title: 'New Offer Received!',
                message: 'You received an offer of $' + (offerPrice / 100).toFixed(2) + ' (list: $' + (listPrice / 100).toFixed(2) + ')',
                link: '/pages/user/offers.html'
            })
        });

        return { ok: true, offer: offer[0] || offer };
    }

    if (offerAction === 'respond') {
        const offerId = (body.offer_id || '').trim();
        const response = (body.response || '').trim(); // accept, reject, counter
        const counterPrice = parseInt(body.counter_price) || 0;

        if (!offerId || !response) return { ok: false, error: 'Missing offer_id or response' };
        if (!['accept', 'reject', 'counter'].includes(response)) return { ok: false, error: 'Response must be accept, reject, or counter' };

        var updateData = { status: response === 'accept' ? 'accepted' : (response === 'reject' ? 'rejected' : 'countered'), responded_at: new Date().toISOString() };
        if (response === 'counter' && counterPrice > 0) updateData.counter_price = counterPrice;

        await fetch(supabaseUrl + '/rest/v1/marketplace_offers?id=eq.' + encodeURIComponent(offerId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify(updateData)
        });

        // Get offer to notify buyer
        const getOffer = await fetch(
            supabaseUrl + '/rest/v1/marketplace_offers?id=eq.' + encodeURIComponent(offerId) + '&select=*&limit=1',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const offers = await getOffer.json();
        if (offers && offers.length) {
            var statusMsg = response === 'accept' ? 'accepted' : (response === 'counter' ? 'countered at $' + (counterPrice / 100).toFixed(2) : 'declined');
            await fetch(supabaseUrl + '/rest/v1/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                body: JSON.stringify({
                    uid: offers[0].buyer_id,
                    type: 'offer_' + response,
                    title: 'Offer ' + statusMsg.charAt(0).toUpperCase() + statusMsg.slice(1),
                    message: 'Your offer has been ' + statusMsg + '.',
                    link: '/pages/user/offers.html'
                })
            });
        }

        return { ok: true, status: updateData.status };
    }

    if (offerAction === 'list') {
        const userId = (body.user_id || '').trim();
        const role = (body.role || 'buyer').trim();
        if (!userId) return { ok: false, error: 'Missing user_id' };

        var field = role === 'seller' ? 'seller_id' : 'buyer_id';
        const listRes = await fetch(
            supabaseUrl + '/rest/v1/marketplace_offers?' + field + '=eq.' + encodeURIComponent(userId) + '&order=created_at.desc&limit=50',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const offerList = await listRes.json();
        return { ok: true, offers: offerList || [] };
    }

    return { ok: false, error: 'Unknown offer_action. Use create, respond, or list.' };
}

/* ── Action: Dispute Resolution ─────────────────────────────── */
async function handleDispute(env, body) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Server not configured' };

    const disputeAction = (body.dispute_action || '').trim();

    if (disputeAction === 'create') {
        const buyerId = (body.buyer_id || '').trim();
        const sellerId = (body.seller_id || '').trim();
        const orderId = (body.order_id || '').trim();
        const reason = (body.reason || '').substring(0, 1000).trim();
        const category = (body.category || 'other').trim(); // not_received, not_as_described, defective, other

        if (!buyerId || !orderId || !reason) return { ok: false, error: 'Missing buyer_id, order_id, or reason' };

        const disputeRes = await fetch(supabaseUrl + '/rest/v1/marketplace_disputes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                buyer_id: buyerId,
                seller_id: sellerId,
                order_id: orderId,
                reason: reason,
                category: category,
                status: 'open',
                seller_deadline: new Date(Date.now() + 48 * 3600000).toISOString()
            })
        });

        if (!disputeRes.ok) return { ok: false, error: 'Failed to create dispute' };
        const dispute = await disputeRes.json();

        // Notify seller with 48h deadline
        if (sellerId) {
            await fetch(supabaseUrl + '/rest/v1/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                body: JSON.stringify({
                    uid: sellerId,
                    type: 'dispute_opened',
                    title: 'Dispute Opened — 48h to Respond',
                    message: 'A buyer has reported an issue with order ' + orderId + '. You have 48 hours to respond before admin mediation.',
                    link: '/pages/user/disputes.html'
                })
            });
        }

        return { ok: true, dispute: dispute[0] || dispute };
    }

    if (disputeAction === 'respond') {
        const disputeId = (body.dispute_id || '').trim();
        const responderId = (body.responder_id || '').trim();
        const responseMsg = (body.message || '').substring(0, 1000).trim();
        const resolution = (body.resolution || '').trim(); // refund, partial_refund, replacement, reject

        if (!disputeId || !responseMsg) return { ok: false, error: 'Missing dispute_id or message' };

        await fetch(supabaseUrl + '/rest/v1/marketplace_disputes?id=eq.' + encodeURIComponent(disputeId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify({
                status: resolution === 'reject' ? 'escalated' : 'seller_responded',
                seller_response: responseMsg,
                proposed_resolution: resolution || null,
                responded_at: new Date().toISOString()
            })
        });

        // If seller rejected, auto-escalate to admin
        if (resolution === 'reject') {
            await fetch(supabaseUrl + '/rest/v1/marketplace_disputes?id=eq.' + encodeURIComponent(disputeId), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                body: JSON.stringify({ status: 'escalated', escalated_at: new Date().toISOString() })
            });
        }

        return { ok: true, status: resolution === 'reject' ? 'escalated' : 'seller_responded' };
    }

    if (disputeAction === 'resolve') {
        // Admin resolution
        const disputeId = (body.dispute_id || '').trim();
        const adminDecision = (body.decision || '').trim(); // refund, partial_refund, reject, close
        const adminNote = (body.admin_note || '').substring(0, 500).trim();

        if (!disputeId || !adminDecision) return { ok: false, error: 'Missing dispute_id or decision' };

        await fetch(supabaseUrl + '/rest/v1/marketplace_disputes?id=eq.' + encodeURIComponent(disputeId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify({
                status: 'resolved',
                admin_decision: adminDecision,
                admin_note: adminNote,
                resolved_at: new Date().toISOString()
            })
        });

        return { ok: true, status: 'resolved', decision: adminDecision };
    }

    if (disputeAction === 'list') {
        const userId = (body.user_id || '').trim();
        const role = (body.role || 'buyer').trim();
        if (!userId) return { ok: false, error: 'Missing user_id' };

        var dField = role === 'seller' ? 'seller_id' : (role === 'admin' ? '' : 'buyer_id');
        var dQuery = supabaseUrl + '/rest/v1/marketplace_disputes?';
        if (dField) dQuery += dField + '=eq.' + encodeURIComponent(userId) + '&';
        dQuery += 'order=created_at.desc&limit=50';

        const dListRes = await fetch(dQuery, {
            headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
        });
        const disputes = await dListRes.json();
        return { ok: true, disputes: disputes || [] };
    }

    return { ok: false, error: 'Unknown dispute_action. Use create, respond, resolve, or list.' };
}

/* ── Action: Flash Sales / Time-Limited Discounts ───────────── */
async function handleFlashSales(env, body) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Server not configured' };

    const saleAction = (body.sale_action || '').trim();

    if (saleAction === 'create') {
        const sellerId = (body.seller_id || '').trim();
        const pId = (body.product_id || '').trim();
        const discountPct = parseInt(body.discount_percent) || 0;
        const originalPrice = parseInt(body.original_price) || 0;
        const durationHours = parseInt(body.duration_hours) || 24;

        if (!sellerId || !pId || !discountPct) return { ok: false, error: 'Missing seller_id, product_id, or discount_percent' };
        if (discountPct < 5 || discountPct > 80) return { ok: false, error: 'Discount must be between 5% and 80%' };
        if (durationHours < 1 || durationHours > 168) return { ok: false, error: 'Duration must be 1-168 hours (1 week max)' };

        var salePrice = Math.round(originalPrice * (1 - discountPct / 100));
        var endsAt = new Date(Date.now() + durationHours * 3600000).toISOString();

        const saleRes = await fetch(supabaseUrl + '/rest/v1/flash_sales', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                seller_id: sellerId,
                product_id: pId,
                original_price: originalPrice,
                sale_price: salePrice,
                discount_percent: discountPct,
                starts_at: new Date().toISOString(),
                ends_at: endsAt,
                status: 'active'
            })
        });

        if (!saleRes.ok) return { ok: false, error: 'Failed to create flash sale' };
        const sale = await saleRes.json();
        return { ok: true, sale: sale[0] || sale };
    }

    if (saleAction === 'active') {
        // Get all active flash sales
        const activeRes = await fetch(
            supabaseUrl + '/rest/v1/flash_sales?status=eq.active&ends_at=gt.' + encodeURIComponent(new Date().toISOString()) + '&order=ends_at.asc&limit=50',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        var activeSales = await activeRes.json();
        activeSales = Array.isArray(activeSales) ? activeSales : [];

        // Add countdown info
        var now = Date.now();
        activeSales = activeSales.map(function(s) {
            var msLeft = new Date(s.ends_at).getTime() - now;
            var hoursLeft = Math.max(0, msLeft / 3600000);
            s.time_remaining = {
                hours: Math.floor(hoursLeft),
                minutes: Math.floor((hoursLeft % 1) * 60),
                total_seconds: Math.max(0, Math.round(msLeft / 1000)),
                is_ending_soon: hoursLeft < 6,
                formatted: hoursLeft >= 1 ? Math.floor(hoursLeft) + 'h ' + Math.floor((hoursLeft % 1) * 60) + 'm left' : Math.floor(hoursLeft * 60) + 'm left'
            };
            return s;
        });

        return { ok: true, sales: activeSales, count: activeSales.length };
    }

    if (saleAction === 'end') {
        const saleId = (body.sale_id || '').trim();
        if (!saleId) return { ok: false, error: 'Missing sale_id' };

        await fetch(supabaseUrl + '/rest/v1/flash_sales?id=eq.' + encodeURIComponent(saleId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify({ status: 'ended', ended_at: new Date().toISOString() })
        });

        return { ok: true, status: 'ended' };
    }

    return { ok: false, error: 'Unknown sale_action. Use create, active, or end.' };
}

/* ── Action: Review Verification ────────────────────────────── */
async function handleReviewVerification(env, body) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Server not configured' };

    const reviewerId = (body.reviewer_id || '').trim();
    const productId = (body.product_id || '').trim();
    const sellerId = (body.seller_id || '').trim();

    if (!reviewerId) return { ok: false, error: 'Missing reviewer_id' };
    if (!productId && !sellerId) return { ok: false, error: 'Missing product_id or seller_id' };

    // Check if the reviewer has purchased from this seller or this product
    var purchaseQuery = supabaseUrl + '/rest/v1/wallet_transactions?user_id=eq.' + encodeURIComponent(reviewerId) + '&type=in.(purchase,store_purchase)';
    if (productId) purchaseQuery += '&description=like.*' + encodeURIComponent(productId) + '*';
    else if (sellerId) purchaseQuery += '&description=like.*' + encodeURIComponent(sellerId) + '*';
    purchaseQuery += '&limit=1';

    const purchaseRes = await fetch(purchaseQuery, {
        headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
    });
    const purchases = await purchaseRes.json();
    var isVerifiedBuyer = Array.isArray(purchases) && purchases.length > 0;

    // Also check escrow transactions
    if (!isVerifiedBuyer) {
        var escrowQuery = supabaseUrl + '/rest/v1/escrow_transactions?buyer_id=eq.' + encodeURIComponent(reviewerId) + '&status=eq.completed';
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

/* ── Main handler ────────────────────────────────────────────── */
export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
        return new Response(
            JSON.stringify({ ok: false, error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    if (!env?.GROQ_API_KEY && !env?.OPENROUTER_API_KEY) {
        return new Response(
            JSON.stringify({ ok: false, error: 'AI not configured' }),
            { status: 503, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({ ok: false, error: 'Invalid JSON' }),
            { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    const action = (body.action || '').trim();
    let result;

    switch (action) {
        case 'search':
            result = await handleSearch(env, body);
            break;
        case 'recommend':
            result = await handleRecommend(env, body);
            break;
        case 'enhance-desc':
            result = await handleEnhanceDesc(env, body);
            break;
        case 'bundles':
            result = await handleBundles(env, body);
            break;
        case 'seller-trust':
            result = await handleSellerTrust(env, body);
            break;
        case 'smart-pricing':
            result = await handleSmartPricing(env, body);
            break;
        case 'listing-quality':
            result = await handleListingQuality(env, body);
            break;
        case 'purchase-recommendations':
            result = await handlePurchaseRecommendations(env, body);
            break;
        case 'offers':
            result = await handleOffers(env, body);
            break;
        case 'dispute':
            result = await handleDispute(env, body);
            break;
        case 'flash-sales':
            result = await handleFlashSales(env, body);
            break;
        case 'review-verification':
            result = await handleReviewVerification(env, body);
            break;
        default:
            result = { ok: false, error: 'Unknown action: ' + action };
    }

    return new Response(
        JSON.stringify(result),
        {
            status: result.ok === false ? 400 : 200,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        }
    );
}
