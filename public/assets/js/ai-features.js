// ═══════════════════════════════════════
// GROUPSMIX — ai-features.js
// AI Smart Search, Recommendations, Auto-Moderate,
// Job Matching, Description Enhancer, and Store Product Tracking
// ═══════════════════════════════════════

(function () {
    'use strict';

    var AI_FEATURES_STORAGE = {
        viewedGroups: 'gm_viewed_groups',
        viewedJobs: 'gm_viewed_jobs',
        viewedProducts: 'gm_store_viewed',
        viewedProductCategories: 'gm_store_viewed_cats',
        recommendedDismissed: 'gm_rec_dismissed'
    };

    // ─── Utility: Safe localStorage ────────────────────────────
    function getStoredArray(key, maxItems) {
        try {
            var data = SafeStorage.getJSON(key, []);
            if (!Array.isArray(data)) return [];
            return data.slice(-(maxItems || 50));
        } catch (_e) { return []; }
    }

    function addToStoredArray(key, item, maxItems) {
        var arr = getStoredArray(key, maxItems || 50);
        // Avoid duplicates by id
        arr = arr.filter(function (x) { return x.id !== item.id; });
        arr.push(item);
        if (arr.length > (maxItems || 50)) arr = arr.slice(-(maxItems || 50));
        SafeStorage.setJSON(key, arr);
    }

    // ═══════════════════════════════════════
    // FEATURE 7: AI Smart Search
    // Parses natural language queries to extract filters
    // ═══════════════════════════════════════
    var SmartSearch = {
        // Platform aliases (multilingual)
        platformAliases: {
            'whatsapp': 'whatsapp', 'واتساب': 'whatsapp', 'واتس': 'whatsapp', 'وتساب': 'whatsapp',
            'whatsapp channel': 'whatsapp_channel', 'قناة واتساب': 'whatsapp_channel',
            'telegram': 'telegram', 'تليجرام': 'telegram', 'تلجرام': 'telegram', 'تلقرام': 'telegram',
            'telegram channel': 'telegram_channel', 'قناة تليجرام': 'telegram_channel',
            'discord': 'discord', 'ديسكورد': 'discord',
            'facebook': 'facebook', 'فيسبوك': 'facebook', 'فيس': 'facebook'
        },
        // Category aliases (multilingual)
        categoryAliases: {
            'crypto': 'crypto', 'كريبتو': 'crypto', 'عملات رقمية': 'crypto', 'تداول': 'crypto', 'bitcoin': 'crypto', 'بيتكوين': 'crypto',
            'technology': 'technology', 'تقنية': 'technology', 'تكنولوجيا': 'technology', 'tech': 'technology',
            'gaming': 'gaming', 'ألعاب': 'gaming', 'قيمنق': 'gaming', 'games': 'gaming',
            'education': 'education', 'تعليم': 'education', 'دراسة': 'education',
            'business': 'business', 'أعمال': 'business', 'بزنس': 'business',
            'jobs': 'jobs', 'وظائف': 'jobs', 'عمل': 'jobs', 'توظيف': 'jobs',
            'marketing': 'marketing', 'تسويق': 'marketing',
            'entertainment': 'entertainment', 'ترفيه': 'entertainment',
            'music': 'music', 'موسيقى': 'music',
            'sports': 'sports', 'رياضة': 'sports',
            'health': 'health', 'صحة': 'health',
            'food': 'food', 'طعام': 'food', 'طبخ': 'food',
            'travel': 'travel', 'سفر': 'travel',
            'fashion': 'fashion', 'أزياء': 'fashion', 'موضة': 'fashion',
            'art': 'art', 'فن': 'art',
            'photography': 'photography', 'تصوير': 'photography',
            'news': 'news', 'أخبار': 'news',
            'programming': 'programming', 'برمجة': 'programming', 'coding': 'programming',
            'memes': 'memes', 'ميمز': 'memes',
            'dating': 'dating', 'تعارف': 'dating',
            'anime': 'anime', 'أنمي': 'anime'
        },

        /**
         * Parse a natural language search query into structured filters.
         * Examples:
         *   "crypto groups on telegram" → { platform: 'telegram', category: 'crypto', query: '' }
         *   "أريد قروب تداول عملات رقمية على تلقرام فيه أكثر من 1000 عضو"
         *     → { platform: 'telegram', category: 'crypto', members: 1000, query: '' }
         */
        parse: function (input) {
            if (!input || typeof input !== 'string') return null;
            var text = input.toLowerCase().trim();
            var result = { platform: '', category: '', country: '', query: '', members: 0 };
            var consumed = text;

            // Extract platform
            var platformKeys = Object.keys(this.platformAliases);
            // Sort by length descending so longer phrases match first
            platformKeys.sort(function (a, b) { return b.length - a.length; });
            for (var i = 0; i < platformKeys.length; i++) {
                if (text.indexOf(platformKeys[i]) !== -1) {
                    result.platform = this.platformAliases[platformKeys[i]];
                    consumed = consumed.replace(platformKeys[i], ' ');
                    break;
                }
            }

            // Extract category
            var catKeys = Object.keys(this.categoryAliases);
            catKeys.sort(function (a, b) { return b.length - a.length; });
            for (var j = 0; j < catKeys.length; j++) {
                if (text.indexOf(catKeys[j]) !== -1) {
                    result.category = this.categoryAliases[catKeys[j]];
                    consumed = consumed.replace(catKeys[j], ' ');
                    break;
                }
            }

            // Extract member count (e.g., "more than 1000 members", "أكثر من 1000 عضو")
            var memberPattern = /(?:more\s+than|over|أكثر\s+من|فوق|>)\s*(\d[\d,]*)/i;
            var memberMatch = text.match(memberPattern);
            if (memberMatch) {
                result.members = parseInt(memberMatch[1].replace(/,/g, ''), 10) || 0;
                consumed = consumed.replace(memberMatch[0], ' ');
            }

            // Extract country codes from CONFIG if available
            if (typeof CONFIG !== 'undefined' && CONFIG.countries) {
                for (var k = 0; k < CONFIG.countries.length; k++) {
                    var countryName = CONFIG.countries[k].name.toLowerCase();
                    if (countryName !== 'global' && text.indexOf(countryName) !== -1) {
                        result.country = CONFIG.countries[k].code;
                        consumed = consumed.replace(countryName, ' ');
                        break;
                    }
                }
            }

            // Clean up leftover noise words
            var noiseWords = ['i want', 'find', 'search', 'looking for', 'show me', 'get',
                'أريد', 'ابحث', 'ابحث عن', 'أبغى', 'بغيت', 'ابي',
                'group', 'groups', 'قروب', 'قروبات', 'مجموعة', 'مجموعات',
                'on', 'في', 'على', 'with', 'مع', 'فيه', 'فيها',
                'members', 'عضو', 'أعضاء', 'member',
                'channel', 'channels', 'قناة', 'قنوات',
                'a', 'an', 'the', 'for', 'of'];
            for (var n = 0; n < noiseWords.length; n++) {
                consumed = consumed.replace(new RegExp('\\b' + noiseWords[n].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), ' ');
            }
            result.query = consumed.replace(/\s+/g, ' ').trim();

            // Only return parsed result if we found at least one meaningful filter
            if (result.platform || result.category || result.country || result.members) {
                return result;
            }
            return null;
        }
    };

    // ═══════════════════════════════════════
    // FEATURE 8: AI Group Recommendations
    // "Groups you might like" based on browsing history
    // ═══════════════════════════════════════
    var GroupRecommendations = {
        /** Track a viewed group */
        trackView: function (group) {
            if (!group || !group.id) return;
            addToStoredArray(AI_FEATURES_STORAGE.viewedGroups, {
                id: group.id,
                category: group.category || '',
                platform: group.platform || '',
                tags: group.tags || [],
                viewedAt: Date.now()
            }, 50);
        },

        /** Get user's preferred categories/platforms from history */
        getPreferences: function () {
            var viewed = getStoredArray(AI_FEATURES_STORAGE.viewedGroups, 50);
            if (viewed.length < 2) return null;

            var catCounts = {};
            var platCounts = {};
            var tagCounts = {};
            for (var i = 0; i < viewed.length; i++) {
                var g = viewed[i];
                if (g.category) catCounts[g.category] = (catCounts[g.category] || 0) + 1;
                if (g.platform) platCounts[g.platform] = (platCounts[g.platform] || 0) + 1;
                if (g.tags && Array.isArray(g.tags)) {
                    for (var t = 0; t < g.tags.length; t++) {
                        tagCounts[g.tags[t]] = (tagCounts[g.tags[t]] || 0) + 1;
                    }
                }
            }

            // Sort by frequency
            var topCats = Object.keys(catCounts).sort(function (a, b) { return catCounts[b] - catCounts[a]; });
            var topPlats = Object.keys(platCounts).sort(function (a, b) { return platCounts[b] - platCounts[a]; });
            var topTags = Object.keys(tagCounts).sort(function (a, b) { return tagCounts[b] - tagCounts[a]; });

            return {
                categories: topCats.slice(0, 3),
                platforms: topPlats.slice(0, 2),
                tags: topTags.slice(0, 5),
                viewedIds: viewed.map(function (v) { return v.id; })
            };
        },

        /** Fetch recommended groups based on preferences */
        getRecommendations: async function (limit) {
            var prefs = this.getPreferences();
            if (!prefs || !prefs.categories.length) return [];
            if (!window.supabaseClient) return [];

            try {
                var l = limit || 6;
                var query = window.supabaseClient.from('groups').select('*')
                    .eq('status', 'approved')
                    .in('category', prefs.categories)
                    .order('ranking_score', { ascending: false })
                    .limit(l + prefs.viewedIds.length);

                var result = await query;
                if (result.error) return [];

                // Filter out already-viewed groups
                var data = (result.data || []).filter(function (g) {
                    return prefs.viewedIds.indexOf(g.id) === -1;
                });
                return data.slice(0, l);
            } catch (e) {
                console.error('GroupRecommendations.getRecommendations:', e);
                return [];
            }
        },

        /** Render recommendations section into a container */
        renderSection: async function (containerId) {
            var container = document.getElementById(containerId);
            if (!container) return;

            var groups = await this.getRecommendations(6);
            if (!groups.length) return;

            var isArabic = (navigator.language || '').substring(0, 2) === 'ar';
            var title = isArabic ? 'قروبات قد تعجبك' : 'Groups You Might Like';
            var sectionHtml = '<section class="recommendations-section" style="margin:var(--space-8) 0">' +
                '<h2 style="font-size:var(--text-xl);margin-bottom:var(--space-4)">' + title + '</h2>' +
                '<div class="grid grid-4" id="recommendations-grid"></div>' +
                '</section>';
            container.insertAdjacentHTML('beforeend', sectionHtml);

            if (typeof UI !== 'undefined' && UI.groupGrid) {
                UI.groupGrid(groups, 'recommendations-grid');
            }
        }
    };

    // ═══════════════════════════════════════
    // FEATURE 10: AI Job Matching
    // Recommend jobs based on viewing history
    // ═══════════════════════════════════════
    var JobMatching = {
        /** Track a viewed job */
        trackView: function (job) {
            if (!job || !job.id) return;
            addToStoredArray(AI_FEATURES_STORAGE.viewedJobs, {
                id: job.id,
                category: job.category || '',
                title: (job.title || '').toLowerCase(),
                tags: job.tags || [],
                viewedAt: Date.now()
            }, 30);
        },

        /** Get user's job preferences from history */
        getPreferences: function () {
            var viewed = getStoredArray(AI_FEATURES_STORAGE.viewedJobs, 30);
            if (viewed.length < 2) return null;

            var catCounts = {};
            var titleWords = {};
            for (var i = 0; i < viewed.length; i++) {
                var j = viewed[i];
                if (j.category) catCounts[j.category] = (catCounts[j.category] || 0) + 1;
                if (j.title) {
                    var words = j.title.split(/\s+/);
                    for (var w = 0; w < words.length; w++) {
                        if (words[w].length > 3) {
                            titleWords[words[w]] = (titleWords[words[w]] || 0) + 1;
                        }
                    }
                }
            }

            var topCats = Object.keys(catCounts).sort(function (a, b) { return catCounts[b] - catCounts[a]; });
            var topWords = Object.keys(titleWords).sort(function (a, b) { return titleWords[b] - titleWords[a]; });

            return {
                categories: topCats.slice(0, 3),
                keywords: topWords.slice(0, 5),
                viewedIds: viewed.map(function (v) { return v.id; })
            };
        },

        /** Fetch recommended jobs */
        getRecommendations: async function (limit) {
            var prefs = this.getPreferences();
            if (!prefs || !prefs.categories.length) return [];
            if (!window.supabaseClient) return [];

            try {
                var l = limit || 4;
                var result = await window.supabaseClient.from('jobs').select('*')
                    .eq('status', 'active')
                    .in('category', prefs.categories)
                    .order('created_at', { ascending: false })
                    .limit(l + prefs.viewedIds.length);

                if (result.error) return [];
                var data = (result.data || []).filter(function (j) {
                    return prefs.viewedIds.indexOf(j.id) === -1;
                });
                return data.slice(0, l);
            } catch (e) {
                console.error('JobMatching.getRecommendations:', e);
                return [];
            }
        }
    };

    // ═══════════════════════════════════════
    // FEATURE 9: AI Auto-Moderate
    // Trust score and spam detection on group submit
    // ═══════════════════════════════════════
    var AutoModerate = {
        /** Call the API to check a group submission */
        check: async function (data) {
            try {
                var res = await fetch('/api/groq', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tool: 'scam-detector',
                        input: 'Group Name: ' + (data.name || '') +
                            '\nDescription: ' + (data.description || '') +
                            '\nLink: ' + (data.link || '') +
                            '\nPlatform: ' + (data.platform || '') +
                            '\nCategory: ' + (data.category || '')
                    })
                });
                if (!res.ok) return { trustScore: 50, flags: [], passed: true };

                // Collect streamed response
                var reader = res.body.getReader();
                var decoder = new TextDecoder();
                var fullText = '';
                var buffer = '';

                while (true) {
                    var chunk = await reader.read();
                    if (chunk.done) break;
                    buffer += decoder.decode(chunk.value, { stream: true });
                    var lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i].trim();
                        if (!line || !line.startsWith('data: ')) continue;
                        var d = line.slice(6);
                        if (d === '[DONE]') continue;
                        try {
                            var parsed = JSON.parse(d);
                            if (parsed.error === 'stream_idle_timeout') {
                                fullText += '\n\n⚠ Response timed out — retry?';
                            } else if (parsed.text) fullText += parsed.text;
                        } catch (_e) { /* skip */ }
                    }
                }

                // Try to extract trust score from AI response
                var scoreMatch = fullText.match(/(?:trust|score|rating)[:\s]*(\d+)/i);
                var trustScore = scoreMatch ? parseInt(scoreMatch[1], 10) : 50;
                if (trustScore > 100) trustScore = 100;

                var flags = [];
                var lowerText = fullText.toLowerCase();
                if (lowerText.indexOf('scam') !== -1 || lowerText.indexOf('spam') !== -1) flags.push('potential_scam');
                if (lowerText.indexOf('suspicious') !== -1) flags.push('suspicious');
                if (lowerText.indexOf('adult') !== -1 || lowerText.indexOf('nsfw') !== -1) flags.push('adult_content');

                return {
                    trustScore: trustScore,
                    flags: flags,
                    passed: trustScore >= 30 && flags.indexOf('potential_scam') === -1,
                    analysis: fullText.substring(0, 500)
                };
            } catch (e) {
                console.error('AutoModerate.check:', e);
                // On error, allow submission but flag for manual review
                return { trustScore: 50, flags: [], passed: true, analysis: '' };
            }
        }
    };

    // ═══════════════════════════════════════
    // FEATURE 12: AI Description Enhancer
    // "Enhance with AI" button for group submit form
    // ═══════════════════════════════════════
    var DescriptionEnhancer = {
        /** Enhance a group description using AI */
        enhance: async function (description, category, platform) {
            try {
                var prompt = 'Enhance this social media group description. Make it engaging, add relevant emojis, ' +
                    'improve wording, and add keywords for discoverability. Keep it under 500 characters. ' +
                    'Category: ' + (category || 'general') + '. Platform: ' + (platform || 'general') + '.\n\n' +
                    'Original: ' + description + '\n\nEnhanced version (just the text, no explanation):';

                var res = await fetch('/api/groq', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tool: 'bio-generator',
                        input: prompt
                    })
                });
                if (!res.ok) throw new Error('API error: ' + res.status);

                // Collect streamed response
                var reader = res.body.getReader();
                var decoder = new TextDecoder();
                var fullText = '';
                var buffer = '';

                while (true) {
                    var chunk = await reader.read();
                    if (chunk.done) break;
                    buffer += decoder.decode(chunk.value, { stream: true });
                    var lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i].trim();
                        if (!line || !line.startsWith('data: ')) continue;
                        var d = line.slice(6);
                        if (d === '[DONE]') continue;
                        try {
                            var parsed = JSON.parse(d);
                            if (parsed.error === 'stream_idle_timeout') {
                                fullText += '\n\n⚠ Response timed out — retry?';
                            } else if (parsed.text) fullText += parsed.text;
                        } catch (_e) { /* skip */ }
                    }
                }

                return fullText.trim().substring(0, 500) || description;
            } catch (e) {
                console.error('DescriptionEnhancer.enhance:', e);
                return description;
            }
        },

        /** Initialize the enhance button on submit page */
        initButton: function () {
            var descField = document.getElementById('group-description');
            if (!descField) return;

            // Create the "Enhance with AI" button
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-secondary';
            btn.id = 'enhance-desc-btn';
            btn.style.cssText = 'margin-top:var(--space-2);font-size:var(--text-sm);padding:var(--space-1) var(--space-3);';
            btn.innerHTML = '<svg style="width:14px;height:14px;vertical-align:-2px;margin-right:4px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>Enhance with AI';

            // Insert after the description field's parent form-group
            var formHelp = descField.parentElement.querySelector('.form-help');
            if (formHelp) {
                formHelp.parentElement.insertBefore(btn, formHelp.nextSibling);
            } else {
                descField.parentElement.appendChild(btn);
            }

            var self = this;
            btn.addEventListener('click', async function () {
                var desc = descField.value.trim();
                if (!desc || desc.length < 10) {
                    if (typeof UI !== 'undefined') UI.toast('Please write at least 10 characters first.', 'warning');
                    return;
                }

                btn.disabled = true;
                btn.innerHTML = '<span class="btn-spinner"></span> Enhancing...';

                var category = '';
                var platform = '';
                var catEl = document.getElementById('group-category');
                var platEl = document.getElementById('group-platform');
                if (catEl) category = catEl.value;
                if (platEl) platform = platEl.value;

                var enhanced = await self.enhance(desc, category, platform);
                if (enhanced && enhanced !== desc) {
                    descField.value = enhanced;
                    // Update char counter
                    var counter = document.getElementById('desc-count');
                    if (counter) counter.textContent = enhanced.length;
                    if (typeof UI !== 'undefined') UI.toast('Description enhanced! Review the changes.', 'success');
                } else {
                    if (typeof UI !== 'undefined') UI.toast('Could not enhance. Try again.', 'warning');
                }

                btn.disabled = false;
                btn.innerHTML = '<svg style="width:14px;height:14px;vertical-align:-2px;margin-right:4px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>Enhance with AI';
            });
        }
    };

    // ═══════════════════════════════════════
    // FEATURE 13: Store Product Tracking
    // Track viewed products for AI recommendations
    // ═══════════════════════════════════════
    var ProductTracking = {
        /** Track a viewed store product */
        trackView: function (product) {
            if (!product || !product.id) return;
            addToStoredArray(AI_FEATURES_STORAGE.viewedProducts, {
                id: product.id,
                product_type: product.product_type || 'digital',
                name: (product.name || '').substring(0, 100),
                price: product.price || 0,
                viewedAt: Date.now()
            }, 50);

            // Also track product categories
            if (product.product_type) {
                var cats = getStoredArray(AI_FEATURES_STORAGE.viewedProductCategories, 20);
                var existing = cats.filter(function (c) { return c !== product.product_type; });
                existing.unshift(product.product_type);
                if (existing.length > 20) existing = existing.slice(0, 20);
                SafeStorage.setJSON(AI_FEATURES_STORAGE.viewedProductCategories, existing);
            }
        },

        /** Get user's product preferences from browsing history */
        getPreferences: function () {
            var viewed = getStoredArray(AI_FEATURES_STORAGE.viewedProducts, 50);
            if (!viewed.length) return null;

            var typeCounts = {};
            for (var i = 0; i < viewed.length; i++) {
                var p = viewed[i];
                if (p.product_type) typeCounts[p.product_type] = (typeCounts[p.product_type] || 0) + 1;
            }

            var topTypes = Object.keys(typeCounts).sort(function (a, b) { return typeCounts[b] - typeCounts[a]; });

            return {
                types: topTypes.slice(0, 3),
                viewedIds: viewed.map(function (v) { return v.id; }),
                totalViewed: viewed.length,
                avgPrice: viewed.reduce(function (sum, v) { return sum + (v.price || 0); }, 0) / viewed.length
            };
        },

        /** Get viewed product IDs */
        getViewedIds: function () {
            return getStoredArray(AI_FEATURES_STORAGE.viewedProducts, 50).map(function (v) { return v.id; });
        },

        /** Get viewed product categories */
        getViewedCategories: function () {
            var data = SafeStorage.getJSON(AI_FEATURES_STORAGE.viewedProductCategories, []);
            return Array.isArray(data) ? data : [];
        }
    };

    // ═══════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════
    function init() {
        // Don't load on admin pages
        if (window.location.pathname.indexOf('gm-ctrl') !== -1) return;

        var path = window.location.pathname;

        // Feature 8: Render group recommendations on home page
        if (path === '/' || path === '/index.html') {
            var recTarget = document.getElementById('ai-recommendations');
            if (recTarget) {
                GroupRecommendations.renderSection('ai-recommendations');
            }
        }

        // Feature 12: Init description enhancer on submit page
        if (path === '/submit' || path === '/submit.html') {
            DescriptionEnhancer.initButton();
        }

        // Feature 13: Auto-track products on store page via StoreContext
        if (path === '/store' || path === '/store.html') {
            // Store page uses window.GroupsMixStore.trackViewed() directly
            // ProductTracking is available globally for other pages that link to products
        }
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ═══════════════════════════════════════
    // EXPORTS — make available globally
    // ═══════════════════════════════════════
    window.AIFeatures = {
        SmartSearch: SmartSearch,
        GroupRecommendations: GroupRecommendations,
        JobMatching: JobMatching,
        AutoModerate: AutoModerate,
        DescriptionEnhancer: DescriptionEnhancer,
        ProductTracking: ProductTracking
    };

})();
