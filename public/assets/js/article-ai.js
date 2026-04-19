/**
 * Article AI Module — article-ai.js
 * AI-powered features: Writing Assistant, Moderation, Recommendations, Summaries, Smart Search
 * Uses existing /api/groq endpoint
 *
 * Dependencies: Security (from components.js), Auth (from app.js)
 */

/* global Security, Auth, UI, CONFIG */

const _ArticleAI = {
    _endpoint: '/api/groq',
    _cache: {},
    _rateLimitMs: 2000,
    _lastCall: 0,

    // ═══════════════════════════════════════
    // CORE API CALL
    // ═══════════════════════════════════════
    async _callAI(task, payload) {
        // Rate limiting
        const now = Date.now();
        if (now - this._lastCall < this._rateLimitMs) {
            await new Promise(r => setTimeout(r, this._rateLimitMs - (now - this._lastCall)));
        }
        this._lastCall = Date.now();

        try {
            const response = await fetch(this._endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: task,
                    ...payload
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error('AI API error: ' + response.status + ' ' + errText);
            }

            const data = await response.json();
            return data;
        } catch (err) {
            console.error('ArticleAI._callAI [' + task + ']:', err.message);
            return null;
        }
    },

    // ═══════════════════════════════════════
    // 1. WRITING ASSISTANT
    // ═══════════════════════════════════════

    /**
     * Suggest alternative titles for an article
     * @param {string} currentTitle - Current article title
     * @param {string} contentSnippet - First 500 chars of article content
     * @returns {string[]} Array of suggested titles
     */
    async suggestTitles(currentTitle, contentSnippet) {
        const cacheKey = 'titles:' + (currentTitle || '').slice(0, 50);
        if (this._cache[cacheKey]) return this._cache[cacheKey];

        const result = await this._callAI('article-suggest-titles', {
            prompt: 'You are a professional content editor. Given the following article title and content snippet, suggest 3 alternative, engaging titles that would increase click-through rate while remaining accurate and not clickbait.\n\n' +
                'Current Title: ' + (currentTitle || 'Untitled') + '\n' +
                'Content: ' + (contentSnippet || '').slice(0, 500) + '\n\n' +
                'Return ONLY a JSON array of 3 strings. No explanation. Example: ["Title 1", "Title 2", "Title 3"]'
        });

        if (result && result.result) {
            try {
                const titles = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
                if (Array.isArray(titles)) {
                    this._cache[cacheKey] = titles.slice(0, 3);
                    return this._cache[cacheKey];
                }
            } catch (_e) {
                // Try extracting from text
                const matches = result.result.match(/"([^"]+)"/g);
                if (matches) {
                    const titles = matches.map(m => m.replace(/"/g, '')).slice(0, 3);
                    this._cache[cacheKey] = titles;
                    return titles;
                }
            }
        }
        return [];
    },

    /**
     * Suggest tags based on article content
     */
    async suggestTags(title, contentSnippet) {
        const result = await this._callAI('article-suggest-tags', {
            prompt: 'Analyze the following article and suggest 5 relevant tags/keywords. Return ONLY a JSON array of lowercase strings.\n\n' +
                'Title: ' + (title || '') + '\n' +
                'Content: ' + (contentSnippet || '').slice(0, 1000) + '\n\n' +
                'Return ONLY: ["tag1", "tag2", "tag3", "tag4", "tag5"]'
        });

        if (result && result.result) {
            try {
                const tags = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
                if (Array.isArray(tags)) return tags.map(t => String(t).toLowerCase().trim()).filter(t => t.length > 0).slice(0, 5);
            } catch (_e) {
                const matches = result.result.match(/"([^"]+)"/g);
                if (matches) return matches.map(m => m.replace(/"/g, '').toLowerCase().trim()).slice(0, 5);
            }
        }
        return [];
    },

    /**
     * Generate an excerpt from article content
     */
    async generateExcerpt(title, contentSnippet) {
        const result = await this._callAI('article-generate-excerpt', {
            prompt: 'Write a compelling 1-2 sentence excerpt/summary (max 200 characters) for this article. It should hook the reader to want to read more.\n\n' +
                'Title: ' + (title || '') + '\n' +
                'Content: ' + (contentSnippet || '').slice(0, 1500) + '\n\n' +
                'Return ONLY the excerpt text. No quotes, no explanation.'
        });

        if (result && result.result) {
            return String(result.result).replace(/^["']|["']$/g, '').trim().slice(0, 300);
        }
        return null;
    },

    /**
     * Suggest category from content
     */
    async suggestCategory(title, contentSnippet) {
        const categories = ['technology', 'crypto', 'gaming', 'marketing', 'social-media', 'business', 'education', 'lifestyle', 'news', 'tutorials'];
        const result = await this._callAI('article-suggest-category', {
            prompt: 'Classify the following article into one of these categories: ' + categories.join(', ') + '\n\n' +
                'Title: ' + (title || '') + '\n' +
                'Content: ' + (contentSnippet || '').slice(0, 1000) + '\n\n' +
                'Return ONLY the category slug (one word from the list). No explanation.'
        });

        if (result && result.result) {
            const cat = String(result.result).trim().toLowerCase().replace(/[^a-z-]/g, '');
            if (categories.includes(cat)) return cat;
            // Fuzzy match
            const match = categories.find(c => cat.includes(c) || c.includes(cat));
            if (match) return match;
        }
        return null;
    },

    /**
     * Improve writing quality with suggestions
     */
    async improveWriting(contentSnippet, language) {
        const langPrompt = language === 'ar'
            ? 'The article is written in Arabic. Respond in Arabic.'
            : 'The article is written in English. Respond in English.';

        const result = await this._callAI('article-improve-writing', {
            prompt: 'You are a professional editor. Review this article excerpt and provide 3-5 specific, actionable suggestions to improve clarity, engagement, and readability. ' + langPrompt + '\n\n' +
                'Content:\n' + (contentSnippet || '').slice(0, 2000) + '\n\n' +
                'Format: Numbered list of suggestions. Be specific and helpful.'
        });

        if (result && result.result) {
            return String(result.result).trim();
        }
        return null;
    },

    /**
     * Check grammar and spelling (returns suggestions)
     */
    async checkGrammar(text, language) {
        const result = await this._callAI('article-grammar-check', {
            prompt: 'Check the following text for grammar and spelling errors. ' +
                (language === 'ar' ? 'The text is in Arabic.' : 'The text is in English.') +
                ' List each error and its correction.\n\nText:\n' + (text || '').slice(0, 2000) + '\n\n' +
                'Format: JSON array of objects with "original", "correction", "explanation" keys. If no errors, return empty array [].'
        });

        if (result && result.result) {
            try {
                return typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
            } catch (_e) {
                return [];
            }
        }
        return [];
    },

    /**
     * Generate SEO meta description
     */
    async generateSEO(title, contentSnippet) {
        const result = await this._callAI('article-seo', {
            prompt: 'Generate an SEO-optimized meta description (max 155 characters) and 5 SEO keywords for this article.\n\n' +
                'Title: ' + (title || '') + '\n' +
                'Content: ' + (contentSnippet || '').slice(0, 1000) + '\n\n' +
                'Return JSON: {"meta_description": "...", "keywords": ["k1","k2","k3","k4","k5"]}'
        });

        if (result && result.result) {
            try {
                return typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
            } catch (_e) {
                return null;
            }
        }
        return null;
    },

    // ═══════════════════════════════════════
    // 2. CONTENT MODERATION
    // ═══════════════════════════════════════

    /**
     * Moderate an article — checks for spam, quality, plagiarism patterns
     * Returns moderation_score (0-100) and auto-approves if > 70
     */
    async moderateArticle(articleId, title, content, tags) {
        const plainContent = content ? content.replace(/<[^>]*>/g, '') : '';

        const result = await this._callAI('article-moderate', {
            prompt: 'You are a content moderation AI for a social platform. Analyze this article and return a JSON object with your assessment.\n\n' +
                'Title: ' + (title || '') + '\n' +
                'Tags: ' + (tags || []).join(', ') + '\n' +
                'Content (first 2000 chars): ' + plainContent.slice(0, 2000) + '\n\n' +
                'Evaluate:\n' +
                '1. spam_score (0-100, higher = more spammy)\n' +
                '2. quality_score (0-100, higher = better quality)\n' +
                '3. is_appropriate (boolean)\n' +
                '4. detected_language (en, ar, etc.)\n' +
                '5. issues (array of strings describing any problems)\n' +
                '6. moderation_note (brief summary)\n\n' +
                'Return ONLY valid JSON: {"spam_score": 0, "quality_score": 80, "is_appropriate": true, "detected_language": "en", "issues": [], "moderation_note": "..."}'
        });

        const moderationResult = {
            moderation_score: 75,
            moderation_status: 'approved',
            moderation_note: 'Auto-reviewed',
            language: 'en'
        };

        if (result && result.result) {
            try {
                const parsed = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;

                const spamScore = parseInt(parsed.spam_score, 10) || 0;
                const qualityScore = parseInt(parsed.quality_score, 10) || 50;
                const isAppropriate = parsed.is_appropriate !== false;

                // Calculate final score: higher = better
                const finalScore = Math.max(0, Math.min(100, qualityScore - spamScore));

                moderationResult.moderation_score = finalScore;
                moderationResult.moderation_note = parsed.moderation_note || '';
                moderationResult.language = parsed.detected_language || 'en';

                if (!isAppropriate || finalScore < 40) {
                    moderationResult.moderation_status = 'rejected';
                    moderationResult.moderation_note = 'Content flagged: ' + (parsed.issues || []).join(', ');
                } else if (finalScore >= 70) {
                    moderationResult.moderation_status = 'approved';
                } else {
                    moderationResult.moderation_status = 'pending';
                    moderationResult.moderation_note = 'Requires manual review. Issues: ' + (parsed.issues || []).join(', ');
                }
            } catch (e) {
                console.error('ArticleAI.moderateArticle parse:', e.message);
            }
        }

        // Update article in database
        if (articleId) {
            try {
                await window.supabaseClient
                    .from('articles')
                    .update({
                        moderation_status: moderationResult.moderation_status,
                        moderation_score: moderationResult.moderation_score,
                        moderation_note: moderationResult.moderation_note,
                        language: moderationResult.language
                    })
                    .eq('id', articleId);

                // If approved, award points
                if (moderationResult.moderation_status === 'approved') {
                    const { data: article } = await window.supabaseClient
                        .from('articles')
                        .select('user_id')
                        .eq('id', articleId)
                        .single();

                    if (article && article.user_id) {
                        try { await window.supabaseClient.rpc('add_writer_points', { p_user_id: article.user_id, p_points: 5, p_reason: 'article_approved' }); } catch (_e) { /* ok */ }
                        try { await window.supabaseClient.rpc('check_and_award_badges', { p_user_id: article.user_id }); } catch (_e) { /* ok */ }
                    }
                }
            } catch (err) {
                console.error('ArticleAI.moderateArticle DB update:', err.message);
            }
        }

        return moderationResult;
    },

    // ═══════════════════════════════════════
    // 3. RECOMMENDATIONS
    // ═══════════════════════════════════════

    /**
     * Get personalized article recommendations based on reading history
     */
    async getRecommendations(userId, limit) {
        limit = limit || 6;
        const cacheKey = 'recs:' + userId;
        if (this._cache[cacheKey] && (Date.now() - this._cache[cacheKey].ts < 300000)) {
            return this._cache[cacheKey].data;
        }

        try {
            // Get user's reading history
            const { data: history } = await window.supabaseClient
                .from('article_reading_history')
                .select('article_id')
                .eq('user_id', userId)
                .order('read_at', { ascending: false })
                .limit(20);

            const readIds = (history || []).map(h => h.article_id);

            // Get categories from read articles
            let preferredCategories = [];
            if (readIds.length > 0) {
                const { data: readArticles } = await window.supabaseClient
                    .from('articles')
                    .select('category, tags')
                    .in('id', readIds.slice(0, 10));

                if (readArticles) {
                    const catCounts = {};
                    readArticles.forEach(a => {
                        if (a.category) catCounts[a.category] = (catCounts[a.category] || 0) + 1;
                    });
                    preferredCategories = Object.entries(catCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(e => e[0]);
                }
            }

            // Get following list
            const { data: userRec } = await window.supabaseClient
                .from('users')
                .select('id')
                .eq('auth_id', userId)
                .single();

            let followingIds = [];
            if (userRec) {
                const { data: follows } = await window.supabaseClient
                    .from('user_follows')
                    .select('following_id')
                    .eq('follower_id', userRec.id);
                followingIds = (follows || []).map(f => f.following_id);
            }

            // Build recommendation query
            let query = window.supabaseClient
                .from('articles')
                .select('*')
                .eq('status', 'published')
                .eq('moderation_status', 'approved')
                .order('published_at', { ascending: false })
                .limit(limit * 3); // Get extra for filtering

            // Exclude already read
            if (readIds.length > 0) {
                query = query.not('id', 'in', '(' + readIds.join(',') + ')');
            }

            const { data: candidates } = await query;
            if (!candidates || candidates.length === 0) return [];

            // Score candidates
            const scored = candidates.map(article => {
                let score = 0;

                // Category match
                if (preferredCategories.includes(article.category)) score += 30;

                // From followed authors
                if (followingIds.length > 0 && followingIds.includes(article.user_id)) score += 25;

                // Engagement score
                score += Math.min(20, (article.like_count || 0) * 2);
                score += Math.min(10, (article.comment_count || 0) * 3);

                // Recency bonus
                const ageHours = (Date.now() - new Date(article.published_at).getTime()) / 3600000;
                if (ageHours < 24) score += 15;
                else if (ageHours < 72) score += 10;
                else if (ageHours < 168) score += 5;

                // Featured bonus
                if (article.featured) score += 10;

                return { article, score };
            });

            // Sort by score and take top results
            scored.sort((a, b) => b.score - a.score);
            const recommended = scored.slice(0, limit).map(s => s.article);

            this._cache[cacheKey] = { data: recommended, ts: Date.now() };
            return recommended;
        } catch (err) {
            console.error('ArticleAI.getRecommendations:', err.message);
            return [];
        }
    },

    /**
     * Get related articles for a specific article
     */
    async getRelatedArticles(articleId, category, tags, limit) {
        limit = limit || 3;
        const cacheKey = 'related:' + articleId;
        if (this._cache[cacheKey]) return this._cache[cacheKey];

        try {
            let query = window.supabaseClient
                .from('articles')
                .select('*')
                .eq('status', 'published')
                .eq('moderation_status', 'approved')
                .neq('id', articleId)
                .limit(limit * 2);

            // Prefer same category
            if (category) {
                query = query.eq('category', category);
            }

            const { data } = await query;
            if (!data || data.length === 0) {
                // Fallback: get any published articles
                const { data: fallback } = await window.supabaseClient
                    .from('articles')
                    .select('*')
                    .eq('status', 'published')
                    .eq('moderation_status', 'approved')
                    .neq('id', articleId)
                    .order('like_count', { ascending: false })
                    .limit(limit);
                const result = fallback || [];
                this._cache[cacheKey] = result;
                return result;
            }

            // Score by tag overlap
            const articleTags = tags || [];
            const scored = data.map(a => {
                let score = 0;
                const aTags = a.tags || [];
                articleTags.forEach(t => { if (aTags.includes(t)) score += 10; });
                score += Math.min(10, (a.like_count || 0));
                return { article: a, score };
            });

            scored.sort((a, b) => b.score - a.score);
            const result = scored.slice(0, limit).map(s => s.article);
            this._cache[cacheKey] = result;
            return result;
        } catch (err) {
            console.error('ArticleAI.getRelatedArticles:', err.message);
            return [];
        }
    },

    // ═══════════════════════════════════════
    // 4. SMART SUMMARIES
    // ═══════════════════════════════════════

    /**
     * Generate TL;DR summary for an article
     */
    async generateSummary(title, content) {
        const cacheKey = 'summary:' + (title || '').slice(0, 30);
        if (this._cache[cacheKey]) return this._cache[cacheKey];

        const plainContent = content ? content.replace(/<[^>]*>/g, '') : '';

        const result = await this._callAI('article-summary', {
            prompt: 'Generate a TL;DR summary of this article in 3-5 key bullet points. Be concise and capture the main ideas.\n\n' +
                'Title: ' + (title || '') + '\n' +
                'Content:\n' + plainContent.slice(0, 3000) + '\n\n' +
                'Format: Return a JSON object: {"summary": "One sentence summary", "key_points": ["point 1", "point 2", "point 3"]}'
        });

        if (result && result.result) {
            try {
                const parsed = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
                this._cache[cacheKey] = parsed;
                return parsed;
            } catch (_e) {
                const text = String(result.result).trim();
                const fallback = { summary: text.slice(0, 200), key_points: [text] };
                this._cache[cacheKey] = fallback;
                return fallback;
            }
        }
        return null;
    },

    /**
     * Translate article content (AR ↔ EN)
     */
    async translateArticle(title, content, targetLang) {
        const plainContent = content ? content.replace(/<[^>]*>/g, '') : '';
        const langName = targetLang === 'ar' ? 'Arabic' : 'English';

        const result = await this._callAI('article-translate', {
            prompt: 'Translate the following article to ' + langName + '. Maintain the same tone and style.\n\n' +
                'Title: ' + (title || '') + '\n' +
                'Content:\n' + plainContent.slice(0, 3000) + '\n\n' +
                'Return JSON: {"title": "translated title", "content": "translated content"}'
        });

        if (result && result.result) {
            try {
                return typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
            } catch (_e) {
                return { title: '', content: String(result.result).trim() };
            }
        }
        return null;
    },

    /**
     * Convert article to shareable thread format
     */
    async toThread(title, content) {
        const plainContent = content ? content.replace(/<[^>]*>/g, '') : '';

        const result = await this._callAI('article-to-thread', {
            prompt: 'Convert this article into a social media thread format (5-8 short posts). Each post should be under 280 characters.\n\n' +
                'Title: ' + (title || '') + '\n' +
                'Content:\n' + plainContent.slice(0, 3000) + '\n\n' +
                'Return JSON array of strings: ["post 1", "post 2", ...]'
        });

        if (result && result.result) {
            try {
                const parsed = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
                if (Array.isArray(parsed)) return parsed;
            } catch (_e) {
                return [String(result.result).trim()];
            }
        }
        return null;
    },

    // ═══════════════════════════════════════
    // 5. SMART SEARCH
    // ═══════════════════════════════════════

    /**
     * Smart search — uses AI to understand intent and return better results
     */
    async smartSearch(query, limit) {
        limit = limit || 10;

        // First, use AI to understand the search intent
        const result = await this._callAI('article-smart-search', {
            prompt: 'A user is searching for articles with this query: "' + (query || '') + '"\n\n' +
                'Understand their intent and return search parameters.\n' +
                'Return JSON: {"keywords": ["keyword1", "keyword2"], "categories": ["category-slug"], "intent": "brief description of what they want"}'
        });

        let searchKeywords = [query];
        let searchCategories = [];

        if (result && result.result) {
            try {
                const parsed = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
                if (parsed.keywords && Array.isArray(parsed.keywords)) searchKeywords = parsed.keywords;
                if (parsed.categories && Array.isArray(parsed.categories)) searchCategories = parsed.categories;
            } catch (_e) { /* use original query */ }
        }

        // Execute search against database
        try {
            let queryBuilder = window.supabaseClient
                .from('articles')
                .select('*')
                .eq('status', 'published')
                .eq('moderation_status', 'approved');

            // Text search using OR across keywords
            const _searchTerms = searchKeywords.join(' | ');
            queryBuilder = queryBuilder.or(
                'title.ilike.%' + searchKeywords[0] + '%,excerpt.ilike.%' + searchKeywords[0] + '%'
            );

            if (searchCategories.length > 0) {
                queryBuilder = queryBuilder.in('category', searchCategories);
            }

            queryBuilder = queryBuilder.order('like_count', { ascending: false }).limit(limit);

            const { data } = await queryBuilder;
            return data || [];
        } catch (err) {
            console.error('ArticleAI.smartSearch:', err.message);
            // Fallback to basic search
            try {
                const { data } = await window.supabaseClient
                    .from('articles')
                    .select('*')
                    .eq('status', 'published')
                    .eq('moderation_status', 'approved')
                    .ilike('title', '%' + query + '%')
                    .limit(limit);
                return data || [];
            } catch (_e) {
                return [];
            }
        }
    },

    // ═══════════════════════════════════════
    // UTILITY
    // ═══════════════════════════════════════
    clearCache() {
        this._cache = {};
    }
};
