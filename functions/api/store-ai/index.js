/**
 * /api/store-ai — AI-Powered Store Features (Router)
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
 *   - action: "frequently-bought"        — Pre-computed frequently bought together
 *   - action: "wishlist-alerts"          — Wishlist price drop alerts
 *
 * Uses Groq + OpenRouter dual-API strategy (same as chat.js/groq.js)
 *
 * Environment variables required:
 *   GROQ_API_KEY        — Groq API key
 *   OPENROUTER_API_KEY  — OpenRouter API key
 *   SUPABASE_URL        — Supabase project URL (for marketplace features)
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

import { corsHeaders as _corsHeaders, handlePreflight } from '../_shared/cors.js';
import { errorResponse } from '../_shared/response.js';
import { handleSearch } from './_helpers/search.js';
import { handleRecommend } from './_helpers/recommend.js';
import { handleEnhanceDesc, handleListingQuality, handleSmartPricing } from './_helpers/seller-tools.js';
import { handleBundles, handleFrequentlyBought, handlePurchaseRecommendations } from './_helpers/cross-sell.js';
import { handleDispute, handleFlashSales, handleOffers, handleReviewVerification, handleSellerTrust, handleWishlistAlerts } from './_helpers/marketplace-ops.js';
import { z } from 'zod';

function corsHeaders(origin) {
    return _corsHeaders(origin);
}

/* ── Input validation ────────────────────────────────────────── */
const storeAiSchema = z.object({
    action: z.enum([
        'search', 'recommend', 'enhance-desc', 'bundles',
        'seller-trust', 'smart-pricing', 'listing-quality',
        'purchase-recommendations', 'offers', 'dispute',
        'flash-sales', 'review-verification', 'frequently-bought',
        'wishlist-alerts'
    ])
}).passthrough(); // pass through because each helper expects varying body parameters

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
    }

    if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405, origin);
    }

    if (!env?.GROQ_API_KEY && !env?.OPENROUTER_API_KEY) {
        return errorResponse('AI not configured', 503, origin);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return errorResponse('Invalid JSON', 400, origin);
    }

    const validation = storeAiSchema.safeParse(body);
    if (!validation.success) {
        return errorResponse('Validation failed: ' + validation.error.errors.map(e => e.message).join(', '), 400, origin);
    }
    body = validation.data;

    const action = body.action;
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
        case 'frequently-bought':
            result = await handleFrequentlyBought(env, body);
            break;
        case 'wishlist-alerts':
            result = await handleWishlistAlerts(env, body);
            break;
        default:
            result = { ok: false, error: 'Unknown action: ' + action };
    }

    return new Response(
        JSON.stringify(result),
        {
            status: result.ok === false ? (result.status || 400) : 200,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        }
    );
}
