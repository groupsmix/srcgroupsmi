/**
 * Cloudflare Worker Function — article-ai.js
 * AI endpoint for article-specific tasks using Groq API
 * Extends existing /api/groq pattern
 *
 * Route: /api/article-ai
 */

import { wrapUserInput, withUserInputDirective } from './_shared/prompt-safety.js';
import { moderateOutput } from './_shared/moderation.js';
import { capMaxTokens } from './_shared/ai-limits.js';

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
            'article-smart-search',
            'article-trending-topics',
            'article-reading-stats',
            'article-related'
        ];

        if (!allowedTasks.includes(task)) {
            return new Response(JSON.stringify({ error: 'Invalid task type' }), {
                status: 400,
                headers: corsHeaders
            });
        }

        // Rate limiting via CF
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        const _rateLimitKey = `article-ai:${clientIP}:${task}`;

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
            'article-smart-search': 'You are a search intent analyzer. Understand user queries and extract search parameters. Always return valid JSON.',
            'article-trending-topics': 'You are a content strategist. Analyze engagement data from groups and articles to suggest trending topics that will perform well. Consider group activity levels, member counts, recent growth, and cross-topic patterns. Return valid JSON with key "topics" containing an array of objects with: "title" (suggested topic), "title_ar" (Arabic title), "reasoning" (why it is trending, reference specific engagement signals), "estimated_engagement" (high/medium/low), "category" (best category slug), "keywords" (array of SEO keywords), "related_groups" (array of group names that indicate demand). Maximum 8 topics.',
            'article-reading-stats': 'You are a content analyst. Analyze the given article text and return valid JSON with: "reading_time_minutes" (integer, estimated reading time based on ~200 words/minute), "word_count" (integer), "difficulty" ("beginner", "intermediate", or "advanced"), "difficulty_score" (1-10 integer), "difficulty_reasons" (array of short reasons for the difficulty rating, e.g. technical jargon, complex sentence structure), "target_audience" (short description of ideal reader).',
            'article-related': 'You are a content recommendation engine using semantic embedding similarity. Given a source article and a list of candidate articles, find the most related ones using deep topic analysis: identify shared concepts, complementary subtopics, overlapping entities, and semantic similarity beyond surface-level keyword matching. Consider the embedding space of topics — articles about related domains (e.g. "crypto trading" and "DeFi protocols") should score higher even without shared keywords. Return valid JSON with key "related" containing an array of objects with: "index" (1-based index from the candidate list), "relevance_score" (0.0-1.0), "connection" (short explanation of the semantic relationship), "shared_concepts" (array of 2-4 shared or related concepts). Maximum 6 results, ordered by relevance.'
        };

        // Select model based on task complexity
        const complexTasks = ['article-moderate', 'article-improve-writing', 'article-translate', 'article-trending-topics', 'article-related'];
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
            'article-smart-search': 200,
            'article-trending-topics': 800,
            'article-reading-stats': 300,
            'article-related': 600
        };

        // For trending-topics: enrich prompt with group engagement data if available
        if (task === 'article-trending-topics' && body.group_engagement) {
            const groupData = body.group_engagement;
            const enrichedPrompt = prompt + '\n\n--- GROUP ENGAGEMENT DATA ---\n' +
                'Top growing categories: ' + (groupData.top_categories || []).join(', ') + '\n' +
                'Trending tags: ' + (groupData.trending_tags || []).join(', ') + '\n' +
                'Active groups count: ' + (groupData.active_groups || 0) + '\n' +
                'Recent popular topics: ' + (groupData.popular_topics || []).join(', ') + '\n' +
                'User interest signals: ' + (groupData.interest_signals || []).join(', ');
            body.prompt = enrichedPrompt.slice(0, 4000);
        }

        // For related articles: add embedding hints if available
        if (task === 'article-related' && body.source_tags) {
            const embeddingHint = '\n\n--- EMBEDDING CONTEXT ---\n' +
                'Source article tags: ' + (body.source_tags || []).join(', ') + '\n' +
                'Source category: ' + (body.source_category || 'unknown') + '\n' +
                'Prefer articles that share semantic space even without exact keyword overlap.';
            body.prompt = (body.prompt + embeddingHint).slice(0, 4000);
        }

        // Call Groq API
        // For reading-stats, compute locally without AI for speed
        if (task === 'article-reading-stats') {
            const text = (body.prompt || '').replace(/<[^>]*>/g, '').trim();
            const words = text.split(/\s+/).filter(Boolean);
            const wordCount = words.length;
            const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

            // Difficulty heuristics
            const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / (wordCount || 1);
            const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
            const avgSentenceLength = wordCount / (sentences.length || 1);
            const complexWords = words.filter(w => w.length > 10).length;
            const complexRatio = complexWords / (wordCount || 1);

            let difficultyScore = 3; // baseline
            const difficultyReasons = [];

            if (avgWordLength > 6) { difficultyScore += 2; difficultyReasons.push('Long average word length'); }
            else if (avgWordLength > 5) { difficultyScore += 1; difficultyReasons.push('Moderate vocabulary complexity'); }

            if (avgSentenceLength > 25) { difficultyScore += 2; difficultyReasons.push('Complex sentence structure'); }
            else if (avgSentenceLength > 18) { difficultyScore += 1; difficultyReasons.push('Moderate sentence length'); }

            if (complexRatio > 0.15) { difficultyScore += 2; difficultyReasons.push('High density of technical/complex terms'); }
            else if (complexRatio > 0.08) { difficultyScore += 1; difficultyReasons.push('Some technical terminology'); }

            if (wordCount > 3000) { difficultyScore += 1; difficultyReasons.push('Long-form content'); }

            difficultyScore = Math.min(10, Math.max(1, difficultyScore));

            let difficulty = 'beginner';
            if (difficultyScore >= 7) difficulty = 'advanced';
            else if (difficultyScore >= 4) difficulty = 'intermediate';

            let targetAudience = 'General readers';
            if (difficulty === 'advanced') targetAudience = 'Experienced professionals and experts';
            else if (difficulty === 'intermediate') targetAudience = 'Readers with some background knowledge';

            if (difficultyReasons.length === 0) difficultyReasons.push('Straightforward, accessible writing');

            return new Response(JSON.stringify({
                result: JSON.stringify({
                    reading_time_minutes: readingTimeMinutes,
                    word_count: wordCount,
                    difficulty: difficulty,
                    difficulty_score: difficultyScore,
                    difficulty_reasons: difficultyReasons,
                    target_audience: targetAudience
                }),
                task: task,
                model: 'local',
                usage: null
            }), { status: 200, headers: corsHeaders });
        }

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
                    { role: 'system', content: withUserInputDirective(systemPrompts[task] || 'You are a helpful assistant.') },
                    { role: 'user', content: wrapUserInput(prompt, { maxLength: 4000 }) }
                ],
                max_tokens: capMaxTokens(maxTokens[task], 300),
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

        // E-3: Run output moderation on the AI-generated text. Skip for the
        // built-in `article-moderate` task (it already produces a moderation
        // verdict as JSON), but still guard free-form outputs.
        let moderation = null;
        if (result && task !== 'article-moderate') {
            const verdict = await moderateOutput(env, result, { userText: prompt });
            moderation = { flagged: verdict.flagged, category: verdict.category };
            if (verdict.flagged) {
                console.warn('article-ai: result blocked by moderation', task, verdict.category);
                return new Response(JSON.stringify({
                    error: 'Response blocked by content moderation',
                    task: task,
                    moderation: moderation
                }), {
                    status: 422,
                    headers: corsHeaders
                });
            }
        }

        return new Response(JSON.stringify({
            result: result,
            task: task,
            model: model,
            usage: groqData.usage || null,
            moderation: moderation
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
