/**
 * Action: Smart Search — AI-powered product search (AR/EN)
 */
import { callAI } from './ai-providers.js';
import { wrapUserInput, withUserInputDirective } from '../../_shared/prompt-safety.js';

export async function handleSearch(env, body) {
    const query = (body.query || '').substring(0, 500).trim();
    const products = body.products || [];
    if (!query || !products.length) return { ok: false, error: 'Missing query or products' };

    const productList = products.map((p, i) =>
        `${i + 1}. "${p.name}" - ${p.description?.substring(0, 100) || 'No description'} - Type: ${p.product_type} - Price: ${p.price_formatted}`
    ).join('\n');

    const systemPrompt = `You are a product search assistant for GroupsMix Store. The user's search query is inside <user_input>. Your job is to return the indices (1-based) of the most relevant products from the product list. Output ONLY a JSON object with key "matches" containing an array of product indices (numbers), ordered by relevance. Maximum 10 matches. If nothing matches well, return {"matches":[]}.`;

    const messages = [
        { role: 'system', content: withUserInputDirective(systemPrompt) },
        {
            role: 'user',
            content: `Product catalog:\n${productList}\n\nUser search: ${wrapUserInput(query, { maxLength: 500 })}\n\nReturn matching product indices as JSON.`
        }
    ];

    const result = await callAI(env, messages, 200, 0.2);
    if (!result) return { ok: false, error: 'AI service unavailable' };

    try {
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
