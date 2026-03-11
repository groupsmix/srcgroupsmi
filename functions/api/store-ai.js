/**
 * /api/store-ai — AI-Powered Store Features
 *
 * Endpoints (via POST JSON body with "action" field):
 *   - action: "search"         — AI smart search for products (AR/EN)
 *   - action: "recommend"      — AI product recommendations based on user context
 *   - action: "enhance-desc"   — AI SEO-enhanced product description
 *   - action: "bundles"        — AI smart bundle suggestions
 *
 * Uses Groq + OpenRouter dual-API strategy (same as chat.js/groq.js)
 *
 * Environment variables required:
 *   GROQ_API_KEY        — Groq API key
 *   OPENROUTER_API_KEY  — OpenRouter API key
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
