/**
 * Action: Enhance Description — AI SEO-enhanced product description
 */
import { callAI } from './ai-providers.js';

export async function handleEnhanceDesc(env, body) {
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
