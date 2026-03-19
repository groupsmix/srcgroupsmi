/**
 * /api/lemonsqueezy — LemonSqueezy Products Proxy
 *
 * Fetches products from LemonSqueezy API and caches them in Cloudflare KV.
 * Cache TTL: 1 hour (3600 seconds).
 * Supports optional query params: ?type=&sort=newest|price-low|price-high
 *
 * Environment variables required:
 *   LEMONSQUEEZY_API_KEY  — LemonSqueezy API key
 *   LEMONSQUEEZY_STORE_ID — Your LemonSqueezy store ID
 *   STORE_KV              — Cloudflare KV namespace binding
 */

/* ── Allowed origins for CORS ────────────────────────────────── */
const ALLOWED_ORIGINS = [
    'https://groupsmix.com',
    'https://www.groupsmix.com'
];

/* ── CORS headers ────────────────────────────────────────────── */
function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
}

/* ── LemonSqueezy API base ───────────────────────────────────── */
const LS_API_BASE = 'https://api.lemonsqueezy.com/v1';
const CACHE_KEY = 'ls_products_cache';
const CACHE_TTL = 3600; // 1 hour in seconds

/* ── Fetch all products from LemonSqueezy ────────────────────── */
async function fetchLemonSqueezyProducts(apiKey, storeId) {
    const products = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const url = `${LS_API_BASE}/products?filter[store_id]=${storeId}&page[number]=${page}&page[size]=50&include=variants`;
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/vnd.api+json',
                'Content-Type': 'application/vnd.api+json'
            }
        });

        if (!res.ok) {
            console.error('LemonSqueezy API error:', res.status, await res.text());
            throw new Error('LemonSqueezy API error: ' + res.status);
        }

        const json = await res.json();
        const data = json.data || [];
        const included = json.included || [];

        // Build variants map from included data
        const variantsMap = {};
        for (const item of included) {
            if (item.type === 'variants') {
                const variantStoreId = item.attributes.product_id;
                if (!variantsMap[variantStoreId]) variantsMap[variantStoreId] = [];
                variantsMap[variantStoreId].push({
                    id: item.id,
                    name: item.attributes.name,
                    price: item.attributes.price,
                    price_formatted: item.attributes.price_formatted,
                    is_subscription: item.attributes.is_subscription,
                    interval: item.attributes.interval,
                    interval_count: item.attributes.interval_count,
                    status: item.attributes.status,
                    sort: item.attributes.sort
                });
            }
        }

        for (const product of data) {
            const attrs = product.attributes;
            // Skip archived/draft products
            if (attrs.status === 'draft') continue;

            const productId = product.id;
            const productVariants = variantsMap[productId] || [];

            // Get the primary (cheapest active) variant for display price
            const activeVariants = productVariants
                .filter(v => v.status === 'published' || v.status === 'pending')
                .sort((a, b) => a.price - b.price);

            const primaryVariant = activeVariants[0] || null;

            products.push({
                id: productId,
                name: attrs.name,
                slug: attrs.slug,
                description: attrs.description || '',
                status: attrs.status,
                thumb_url: attrs.thumb_url || '',
                large_thumb_url: attrs.large_thumb_url || '',
                price: primaryVariant ? primaryVariant.price : 0,
                price_formatted: primaryVariant ? primaryVariant.price_formatted : 'Free',
                is_subscription: primaryVariant ? primaryVariant.is_subscription : false,
                interval: primaryVariant ? primaryVariant.interval : null,
                buy_now_url: attrs.buy_now_url || '',
                store_id: attrs.store_id,
                created_at: attrs.created_at,
                updated_at: attrs.updated_at,
                variants: activeVariants,
                // Extract product type from description tags or name for filtering
                product_type: extractProductType(attrs.name, attrs.description || '')
            });
        }

        // Check pagination
        const links = json.links || {};
        if (links.next) {
            page++;
        } else {
            hasMore = false;
        }
    }

    return products;
}

/* ── Extract product type from name/description ──────────────── */
function extractProductType(name, description) {
    const text = (name + ' ' + description).toLowerCase();
    if (text.includes('guide') || text.includes('book') || text.includes('ebook') || text.includes('كتاب') || text.includes('دليل')) return 'guide';
    if (text.includes('template') || text.includes('قالب')) return 'template';
    if (text.includes('course') || text.includes('دورة') || text.includes('كورس')) return 'course';
    if (text.includes('tool') || text.includes('أداة') || text.includes('أدوات')) return 'tool';
    if (text.includes('membership') || text.includes('vip') || text.includes('عضوية') || text.includes('اشتراك')) return 'membership';
    if (text.includes('bundle') || text.includes('pack') || text.includes('باقة') || text.includes('حزمة')) return 'bundle';
    if (text.includes('service') || text.includes('خدمة')) return 'service';
    return 'digital';
}

/* ── Personalized ranking algorithm ──────────────────────────── */
function rankPersonalized(products, viewedTypes, viewedIds, groupCategories) {
    // Build a relevance score for each product based on user signals
    const typeFrequency = {};
    viewedTypes.forEach((t, i) => {
        // More recent views get higher weight (index 0 = most recent)
        typeFrequency[t] = (typeFrequency[t] || 0) + Math.max(1, 10 - i);
    });

    // Map group categories to product types for cross-signal boosting
    const categoryTypeMap = {
        'education': ['course', 'guide'],
        'technology': ['tool', 'template'],
        'business': ['guide', 'service', 'template'],
        'marketing': ['guide', 'tool', 'template'],
        'design': ['template', 'tool'],
        'community': ['membership', 'guide'],
        'entertainment': ['digital', 'membership'],
        'gaming': ['digital', 'membership'],
        'health': ['course', 'guide'],
        'finance': ['guide', 'tool', 'course']
    };

    const boostedTypes = new Set();
    groupCategories.forEach(cat => {
        const mapped = categoryTypeMap[cat.toLowerCase()] || [];
        mapped.forEach(t => boostedTypes.add(t));
    });

    const scored = products.map(p => {
        let score = 0;

        // Boost by viewed type frequency (strongest signal)
        if (typeFrequency[p.product_type]) {
            score += typeFrequency[p.product_type] * 5;
        }

        // Boost by group category alignment
        if (boostedTypes.has(p.product_type)) {
            score += 20;
        }

        // Penalize already-viewed products (push to end so user sees new items)
        if (viewedIds.includes(p.id)) {
            score -= 30;
        }

        // Small recency bonus so newer products break ties
        const ageHours = (Date.now() - new Date(p.created_at).getTime()) / 3600000;
        score += Math.max(0, 10 - ageHours / 168); // bonus decays over ~1 week

        return { product: p, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.product);
}

/* ── Main handler ────────────────────────────────────────────── */
export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'GET') {
        return new Response(
            JSON.stringify({ ok: false, error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    const apiKey = env?.LEMONSQUEEZY_API_KEY;
    const storeId = env?.LEMONSQUEEZY_STORE_ID;

    if (!apiKey || !storeId) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Store not configured' }),
            { status: 503, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    try {
        let products = null;
        let servedFromCache = false;

        // Try to get from KV cache first
        if (env?.STORE_KV) {
            try {
                const cached = await env.STORE_KV.get(CACHE_KEY, 'json');
                if (cached && cached.products && cached.timestamp) {
                    const age = (Date.now() - cached.timestamp) / 1000;
                    if (age < CACHE_TTL) {
                        products = cached.products;
                        servedFromCache = true;
                        console.info('Serving products from KV cache (age: ' + Math.round(age) + 's)');
                    }
                }
            } catch (kvErr) {
                console.error('KV read error:', kvErr);
            }
        }

        // Fetch from LemonSqueezy API if no cache
        if (!products) {
            products = await fetchLemonSqueezyProducts(apiKey, storeId);

            // Store in KV cache
            if (env?.STORE_KV) {
                try {
                    await env.STORE_KV.put(CACHE_KEY, JSON.stringify({
                        products: products,
                        timestamp: Date.now()
                    }), { expirationTtl: CACHE_TTL + 300 }); // Extra 5 min buffer
                    console.info('Products cached in KV (' + products.length + ' items)');
                } catch (kvErr) {
                    console.error('KV write error:', kvErr);
                }
            }
        }

        // Apply URL query filters
        const url = new URL(request.url);
        const typeFilter = url.searchParams.get('type');
        const sortParam = url.searchParams.get('sort');
        const searchQuery = url.searchParams.get('q');

        let filtered = [...products];

        // Filter by type
        if (typeFilter && typeFilter !== 'all') {
            filtered = filtered.filter(p => p.product_type === typeFilter);
        }

        // Simple text search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q) ||
                p.product_type.includes(q)
            );
        }

        // Sort
        if (sortParam === 'personalized') {
            // Personalized ranking based on user signals passed via query params
            const viewedTypes = (url.searchParams.get('viewed_types') || '').split(',').filter(Boolean);
            const viewedIds = (url.searchParams.get('viewed_ids') || '').split(',').filter(Boolean);
            const groupCategories = (url.searchParams.get('group_categories') || '').split(',').filter(Boolean);

            filtered = rankPersonalized(filtered, viewedTypes, viewedIds, groupCategories);
        } else if (sortParam === 'newest') {
            filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else if (sortParam === 'price-low') {
            filtered.sort((a, b) => a.price - b.price);
        } else if (sortParam === 'price-high') {
            filtered.sort((a, b) => b.price - a.price);
        } else if (sortParam === 'name') {
            filtered.sort((a, b) => a.name.localeCompare(b.name));
        }

        return new Response(
            JSON.stringify({
                ok: true,
                products: filtered,
                total: products.length,
                filtered_count: filtered.length,
                cached: servedFromCache
            }),
            {
                status: 200,
                headers: {
                    ...corsHeaders(origin),
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=300'
                }
            }
        );
    } catch (err) {
        console.error('LemonSqueezy proxy error:', err);
        return new Response(
            JSON.stringify({ ok: false, error: 'Failed to fetch products' }),
            { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }
}
