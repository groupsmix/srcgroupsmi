/**
 * Cloudflare Worker Function — article-ai.js
 * AI endpoint for article-specific tasks using Groq API
 * Extends existing /api/groq pattern
 *
 * Route: /api/article-ai
 */

export async function onRequestPost(context) {
    const { request, env } = context;

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    try {
        const body = await request.json();
        const { task, prompt } = body;

        if (!task || !prompt) {
            return new Response(JSON.stringify({ error: 'Missing task or prompt' }), {
                status: 400,
                headers: corsHeaders
            });
        }

        // Validate task type
        const allowedTasks = [
            'article-suggest-titles',
            'article-suggest-tags',
            'article-generate-excerpt',
            'article-suggest-category',
            'article-improve-writing',
            'article-grammar-check',
            'article-seo',
            'article-moderate',
            'article-summary',
            'article-translate',
            'article-to-thread',
            'article-smart-search'
        ];

        if (!allowedTasks.includes(task)) {
            return new Response(JSON.stringify({ error: 'Invalid task type' }), {
                status: 400,
                headers: corsHeaders
            });
        }

        // Rate limiting via CF
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rateLimitKey = `article-ai:${clientIP}:${task}`;

        // Get API key from environment
        const apiKey = env.GROQ_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({ error: 'AI service not configured' }), {
                status: 503,
                headers: corsHeaders
            });
        }

        // Task-specific system prompts for better results
        const systemPrompts = {
            'article-suggest-titles': 'You are a professional content editor who creates engaging, accurate article titles. Always return valid JSON.',
            'article-suggest-tags': 'You are a content categorization expert. Always return valid JSON arrays of lowercase tags.',
            'article-generate-excerpt': 'You are a copywriter who writes compelling article excerpts that hook readers.',
            'article-suggest-category': 'You are a content classifier. Return only the category slug.',
            'article-improve-writing': 'You are a professional editor providing actionable writing improvement suggestions.',
            'article-grammar-check': 'You are a grammar and spelling checker. Always return valid JSON.',
            'article-seo': 'You are an SEO expert. Always return valid JSON with meta_description and keywords.',
            'article-moderate': 'You are a content moderation AI. Evaluate content fairly and return valid JSON with spam_score, quality_score, is_appropriate, detected_language, issues, and moderation_note.',
            'article-summary': 'You are a content summarizer. Create concise, accurate summaries. Always return valid JSON.',
            'article-translate': 'You are a professional translator. Maintain tone and style. Always return valid JSON.',
            'article-to-thread': 'You are a social media expert who converts articles into engaging thread format. Always return valid JSON array.',
            'article-smart-search': 'You are a search intent analyzer. Understand user queries and extract search parameters. Always return valid JSON.'
        };

        // Select model based on task complexity
        const complexTasks = ['article-moderate', 'article-improve-writing', 'article-translate'];
        const model = complexTasks.includes(task) ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';

        // Max tokens based on task
        const maxTokens = {
            'article-suggest-titles': 200,
            'article-suggest-tags': 150,
            'article-generate-excerpt': 200,
            'article-suggest-category': 50,
            'article-improve-writing': 500,
            'article-grammar-check': 400,
            'article-seo': 250,
            'article-moderate': 300,
            'article-summary': 400,
            'article-translate': 1500,
            'article-to-thread': 800,
            'article-smart-search': 200
        };

        // Call Groq API
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompts[task] || 'You are a helpful assistant.' },
                    { role: 'user', content: prompt.slice(0, 4000) } // Limit input
                ],
                max_tokens: maxTokens[task] || 300,
                temperature: task === 'article-moderate' ? 0.1 : 0.7,
                top_p: 1,
                stream: false
            })
        });

        if (!groqResponse.ok) {
            const errText = await groqResponse.text();
            console.error('Groq API error:', groqResponse.status, errText);
            return new Response(JSON.stringify({ error: 'AI service error', details: groqResponse.status }), {
                status: 502,
                headers: corsHeaders
            });
        }

        const groqData = await groqResponse.json();
        const result = groqData.choices?.[0]?.message?.content || null;

        return new Response(JSON.stringify({
            result: result,
            task: task,
            model: model,
            usage: groqData.usage || null
        }), {
            status: 200,
            headers: corsHeaders
        });

    } catch (err) {
        console.error('article-ai worker error:', err.message);
        return new Response(JSON.stringify({ error: 'Internal error' }), {
            status: 500,
            headers: corsHeaders
        });
    }
}

// Handle OPTIONS for CORS preflight
export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400'
        }
    });
}
