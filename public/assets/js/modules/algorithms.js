// ─── Module: algorithms ───
// Exports: Algorithms

// ═══════════════════════════════════════
// MODULE 9: Algorithms
// ═══════════════════════════════════════
const _Algorithms = {
    calculateTrustScore(group) {
        if (!group) return 0;
        let score = 20;
        const vipBonus = { none: 0, verified: 15, niche: 20, global: 25, diamond: 30 };
        const tier = _Algorithms.getEffectiveTier(group);
        score += vipBonus[tier] || 0;
        const avgRating = parseFloat(group.avg_rating) || 0;
        const reviewCount = group.review_count || 0;
        if (reviewCount >= 3) score += Math.min(25, Math.round(avgRating * 5));
        else if (reviewCount >= 1) score += Math.min(15, Math.round(avgRating * 3));
        const views = group.views || 0;
        if (views >= 1000) score += 15;
        else if (views >= 500) score += 10;
        else if (views >= 100) score += 5;
        else if (views >= 10) score += 2;
        const reports = group.reports || 0;
        if (reports === 0) score += 10;
        else if (reports <= 2) score += 5;
        else score -= Math.min(30, reports * 5);
        return Math.max(0, Math.min(100, score));
    },
    calculateRankingScore(group) {
        if (!group) return 0;
        const trust = _Algorithms.calculateTrustScore(group);
        const views = group.views || 0;
        const clicks = group.clicks || 0;
        const rating = parseFloat(group.avg_rating) || 0;
        const reviews = group.review_count || 0;
        const tier = _Algorithms.getEffectiveTier(group);
        const tierMultiplier = { none: 1, verified: 1.2, niche: 1.5, global: 2.0, diamond: 3.0 };
        const base = (trust * 2) + (views * 0.01) + (clicks * 0.05) + (rating * 10) + (reviews * 3);
        return Math.round(base * (tierMultiplier[tier] || 1) * 100) / 100;
    },
    getEffectiveTier(group) {
        if (!group?.vip_tier || group.vip_tier === 'none') return 'none';
        if (!group.vip_expiry) return 'none';
        const expiry = new Date(group.vip_expiry).getTime();
        if (Number.isNaN(expiry) || Date.now() > expiry) return 'none';
        return group.vip_tier;
    },
    generateSearchTerms(name, description, tags, category, platform) {
        const terms = new Set();
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'are', 'was', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'must', 'not', 'no', 'nor', 'so', 'if', 'then', 'than', 'too', 'very', 'just', 'about', 'above', 'after', 'again', 'all', 'also', 'any', 'because', 'before', 'between', 'both', 'each', 'few', 'how', 'into', 'more', 'most', 'other', 'out', 'over', 'own', 'same', 'some', 'such', 'their', 'them', 'these', 'those', 'through', 'under', 'until', 'up', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'you', 'your']);
        (name || '').toLowerCase().split(/\s+/).forEach(w => { const c = w.replace(/[^a-z0-9]/g, ''); if (c.length >= 2) terms.add(c); });
        (description || '').toLowerCase().split(/\s+/).forEach(w => { const c = w.replace(/[^a-z0-9]/g, ''); if (c.length >= 3 && !stopWords.has(c)) terms.add(c); });
        if (Array.isArray(tags)) tags.forEach(t => t.toLowerCase().split(/\s+/).forEach(w => { if (w.length >= 2) terms.add(w); }));
        if (category) terms.add(category.toLowerCase().replace(/[^a-z0-9]/g, ''));
        if (platform) terms.add(platform.toLowerCase());
        return Array.from(terms).slice(0, 40);
    },
    getLevelInfo(gxp) {
        const g = Number.isNaN(gxp) ? 0 : Number(gxp);
        const levels = CONFIG.levels;
        let current = levels[0];
        for (let i = levels.length - 1; i >= 0; i--) {
            if (g >= levels[i].minGxp) { current = levels[i]; break; }
        }
        const next = levels.find(l => l.minGxp > g);
        const progress = next ? (g - current.minGxp) / (next.minGxp - current.minGxp) : 1;
        return { level: current.level, name: current.name, emoji: current.emoji, minGxp: current.minGxp, nextLevelGxp: next?.minGxp || current.minGxp, progress: Math.min(1, Math.max(0, progress)) };
    },
    // ═══════════════════════════════════════
    // Organic Ranking: Best Groups (7-day engagement)
    // Score = (Clicks * 0.4) + (Likes * 0.4) + (Reviews_Avg * 0.2)
    // ═══════════════════════════════════════
    calculateOrganicScore(group) {
        if (!group) return 0;
        var clicks = group.clicks || 0;
        var reviewCount = group.review_count || 0;
        var avgRating = parseFloat(group.avg_rating) || 0;
        return Math.round(((clicks * 0.4) + (reviewCount * 0.4) + (avgRating * 0.2)) * 100) / 100;
    },
    sortByOrganicRanking(groups) {
        if (!Array.isArray(groups)) return [];
        return groups.slice().sort(function(a, b) {
            return _Algorithms.calculateOrganicScore(b) - _Algorithms.calculateOrganicScore(a);
        });
    },
    async getBestGroups(options) {
        try {
            var limit = (options && options.limit) ? options.limit : 12;
            var category = (options && options.category) ? options.category : '';
            var cacheKey = 'best_groups' + (category ? '_' + category : '');
            var cached = CACHE.get(cacheKey, CONFIG.cacheDurations.lists);
            if (cached) return cached;
            var sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            var q = window.supabaseClient.from('groups').select('*')
                .eq('status', 'approved')
                .gte('approved_at', sevenDaysAgo)
                .order('clicks', { ascending: false })
                .limit(limit * 2);
            if (category) q = q.eq('category', category);
            var { data, error } = await q;
            if (error) throw error;
            var ranked = _Algorithms.sortByOrganicRanking(data || []);
            var result = ranked.slice(0, limit);
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) { console.error('Algorithms.getBestGroups:', err.message); return []; }
    },
    // ═══════════════════════════════════════
    // Trending / Velocity Detection
    // Groups with rapid click spikes in a short window
    // ═══════════════════════════════════════
    _velocityKey: 'gm_velocity_snapshots',
    _getVelocitySnapshots() {
        try {
            var raw = sessionStorage.getItem(this._velocityKey);
            return raw ? JSON.parse(raw) : {};
        } catch (_err) { return {}; }
    },
    _saveVelocitySnapshot(groupId, clicks) {
        try {
            var snapshots = this._getVelocitySnapshots();
            snapshots[groupId] = { clicks: clicks, ts: Date.now() };
            sessionStorage.setItem(this._velocityKey, JSON.stringify(snapshots));
        } catch (err) { console.error('Algorithms._saveVelocitySnapshot:', err.message); }
    },
    calculateVelocity(group) {
        if (!group) return 0;
        var snapshots = this._getVelocitySnapshots();
        var prev = snapshots[group.id];
        var currentClicks = group.clicks || 0;
        if (!prev) {
            this._saveVelocitySnapshot(group.id, currentClicks);
            return 0;
        }
        var elapsed = (Date.now() - prev.ts) / 3600000;
        if (elapsed < 0.01) return 0;
        var clickDelta = currentClicks - (prev.clicks || 0);
        var velocity = clickDelta / elapsed;
        this._saveVelocitySnapshot(group.id, currentClicks);
        return Math.round(velocity * 100) / 100;
    },
    detectTrendingGroups(groups, options) {
        if (!Array.isArray(groups)) return [];
        var threshold = (options && options.threshold) ? options.threshold : 5;
        var limit = (options && options.limit) ? options.limit : 12;
        var withVelocity = groups.map(function(g) {
            return { group: g, velocity: _Algorithms.calculateVelocity(g) };
        });
        var trending = withVelocity
            .filter(function(item) { return item.velocity >= threshold; })
            .sort(function(a, b) { return b.velocity - a.velocity; })
            .slice(0, limit)
            .map(function(item) { return item.group; });
        return trending;
    },
    async getTrendingByVelocity(options) {
        try {
            var limit = (options && options.limit) ? options.limit : 12;
            var cached = CACHE.get('trending_velocity', CONFIG.cacheDurations.groups);
            if (cached) return cached;
            var { data, error } = await window.supabaseClient.from('groups').select('*')
                .eq('status', 'approved')
                .order('clicks', { ascending: false })
                .limit(100);
            if (error) throw error;
            var trending = _Algorithms.detectTrendingGroups(data || [], { threshold: 3, limit: limit });
            if (trending.length < limit) {
                var trendingIds = trending.map(function(g) { return g.id; });
                var fallback = (data || [])
                    .filter(function(g) { return trendingIds.indexOf(g.id) === -1; })
                    .sort(function(a, b) { return (b.clicks || 0) - (a.clicks || 0); })
                    .slice(0, limit - trending.length);
                trending = trending.concat(fallback);
            }
            CACHE.set('trending_velocity', trending);
            return trending;
        } catch (err) { console.error('Algorithms.getTrendingByVelocity:', err.message); return []; }
    },
    // ═══════════════════════════════════════
    // Smart Ads: Niche Targeting + Anti-Repetition Rotation
    // Selects ads matching user's current category/niche context,
    // rotates seen ads, and weights by niche pricing relevance.
    // ═══════════════════════════════════════
    _adRotationKey: 'gm_ad_rotation',
    _getAdRotationState() {
        try {
            var raw = sessionStorage.getItem(this._adRotationKey);
            var state = raw ? JSON.parse(raw) : { seen: [], lastCategory: '', rotationIndex: 0 };
            // Reset rotation if category context changed
            if (state.seen && state.seen.length > 50) {
                state.seen = state.seen.slice(-20);
            }
            return state;
        } catch (_err) { return { seen: [], lastCategory: '', rotationIndex: 0 }; }
    },
    _saveAdRotationState(state) {
        try {
            sessionStorage.setItem(this._adRotationKey, JSON.stringify(state));
        } catch (err) { console.error('Algorithms._saveAdRotationState:', err.message); }
    },
    /**
     * Smart ad selection with niche targeting and rotation.
     * @param {Array} ads - Available ads from DB
     * @param {Object} options - { category, limit, position }
     * @returns {Array} Selected ads (rotated, niche-prioritized)
     */
    selectSmartAds(ads, options) {
        if (!Array.isArray(ads) || ads.length === 0) return [];
        var category = (options && options.category) ? options.category : '';
        var limit = (options && options.limit) ? options.limit : 2;
        var state = this._getAdRotationState();

        // 1. Score ads by niche relevance
        var scored = ads.map(function(ad) {
            var nicheScore = 0;
            // Boost ads targeting current category
            if (category && ad.target_category && ad.target_category.toLowerCase() === category.toLowerCase()) {
                nicheScore += (CONFIG.nichePricing[category.toLowerCase()] || 10) * 2;
            }
            // Boost by trust score
            var trust = ad.trust_score !== undefined ? (Number.isNaN(ad.trust_score) ? 50 : Number(ad.trust_score)) : 50;
            nicheScore += trust * 0.5;
            // Penalize already-seen ads
            if (state.seen.indexOf(ad.id) !== -1) {
                nicheScore -= 30;
            }
            return { ad: ad, score: nicheScore };
        });

        // 2. Sort by score (highest first) with randomization for equal scores
        scored.sort(function(a, b) {
            var diff = b.score - a.score;
            if (Math.abs(diff) < 5) return Math.random() - 0.5;
            return diff;
        });

        // 3. Select top ads
        var selected = scored.slice(0, limit).map(function(item) { return item.ad; });

        // 4. Update rotation state
        selected.forEach(function(ad) {
            if (state.seen.indexOf(ad.id) === -1) {
                state.seen.push(ad.id);
            }
        });
        state.lastCategory = category;
        state.rotationIndex = (state.rotationIndex + 1) % Math.max(1, ads.length);
        this._saveAdRotationState(state);

        return selected;
    },
    /**
     * Calculate 7-day engagement score for a group.
     * Uses clicks, review count, average rating weighted by recency.
     * @param {Object} group - Group object
     * @param {string} [sinceDate] - ISO date string for the time window start
     * @returns {number} Engagement score
     */
    calculate7DayEngagement(group) {
        if (!group) return 0;
        var clicks = group.clicks || 0;
        var reviewCount = group.review_count || 0;
        var avgRating = parseFloat(group.avg_rating) || 0;
        var views = group.views || 0;

        // Check if group was active in last 7 days (use approved_at or updated_at as proxy)
        var lastActivity = group.updated_at || group.approved_at || group.created_at;
        var recencyBonus = 1;
        if (lastActivity) {
            var daysSince = (Date.now() - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000);
            if (daysSince <= 1) recencyBonus = 2.0;
            else if (daysSince <= 3) recencyBonus = 1.5;
            else if (daysSince <= 7) recencyBonus = 1.2;
            else recencyBonus = 0.8;
        }

        // Weighted engagement: clicks (40%) + reviews (30%) + rating (20%) + views (10%)
        var baseScore = (clicks * 0.4) + (reviewCount * 5 * 0.3) + (avgRating * 4 * 0.2) + (views * 0.01 * 0.1);
        return Math.round(baseScore * recencyBonus * 100) / 100;
    },
    /**
     * Sort groups by 7-day engagement score.
     * @param {Array} groups
     * @returns {Array} Sorted groups (highest engagement first)
     */
    sortBy7DayEngagement(groups) {
        if (!Array.isArray(groups)) return [];
        var self = this;
        return groups.slice().sort(function(a, b) {
            return self.calculate7DayEngagement(b) - self.calculate7DayEngagement(a);
        });
    },
    /**
     * Get top engaged groups from last 7 days with optional category filter.
     * @param {Object} options - { limit, category }
     * @returns {Promise<Array>}
     */
    async getTopEngaged(options) {
        try {
            var limit = (options && options.limit) ? options.limit : 12;
            var category = (options && options.category) ? options.category : '';
            var cacheKey = 'top_engaged_7d' + (category ? '_' + category : '');
            var cached = CACHE.get(cacheKey, CONFIG.cacheDurations.lists);
            if (cached) return cached;
            var sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            var q = window.supabaseClient.from('groups').select('*')
                .eq('status', 'approved')
                .gte('updated_at', sevenDaysAgo)
                .order('clicks', { ascending: false })
                .limit(limit * 3);
            if (category) q = q.eq('category', category);
            var { data, error } = await q;
            if (error) throw error;
            var ranked = this.sortBy7DayEngagement(data || []);
            var result = ranked.slice(0, limit);
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) { console.error('Algorithms.getTopEngaged:', err.message); return []; }
    }
};

