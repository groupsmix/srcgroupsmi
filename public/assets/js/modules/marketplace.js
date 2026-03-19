// ─── Module: marketplace ───
// Exports: Marketplace
// Split from app.js for maintainability

// ═══════════════════════════════════════
// MODULE 5a: DB.marketplace (Marketplace Listings System)
// ═══════════════════════════════════════
const Marketplace = {
    // ── Category definitions for marketplace ──
    _categories: [
        {
            id: 'social_media',
            name: 'Social Media',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
            platforms: ['facebook', 'instagram', 'twitter', 'snapchat']
        },
        {
            id: 'streaming',
            name: 'Streaming',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
            platforms: ['youtube', 'tiktok', 'twitch', 'kick']
        },
        {
            id: 'messaging',
            name: 'Messaging',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
            platforms: ['whatsapp', 'telegram', 'discord', 'signal']
        },
        {
            id: 'professional',
            name: 'Professional',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
            platforms: ['linkedin', 'reddit', 'quora']
        },
        {
            id: 'other',
            name: 'Other',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
            platforms: []
        }
    ],

    /**
     * Get all marketplace categories.
     */
    getCategories() {
        return this._categories;
    },

    /**
     * Get platforms belonging to a specific category.
     */
    getCategoryPlatforms(categoryId) {
        var cat = this._categories.find(function(c) { return c.id === categoryId; });
        return cat ? cat.platforms : [];
    },

    /**
     * Get the category ID for a given platform.
     */
    getPlatformCategory(platformId) {
        for (var i = 0; i < this._categories.length; i++) {
            if (this._categories[i].platforms.indexOf(platformId) !== -1) {
                return this._categories[i].id;
            }
        }
        return 'other';
    },

    /**
     * Get active marketplace listings with shuffle + popularity weighting.
     * Each page load returns a different order. High-engagement listings appear more.
     * @param {Object} options - { platform, category, limit, offset, sort }
     * @returns {Promise<{data: Array, count: number}>}
     */
    async getListings(options) {
        try {
            var opts = options || {};
            var limit = opts.limit || 24;
            var offset = opts.offset || 0;
            var platform = opts.platform || '';
            var category = opts.category || '';
            var sort = opts.sort || 'smart';
            var cacheKey = 'mk_listings_' + [platform, category, sort, limit, offset].join('_');
            var cached = CACHE.get(cacheKey, 60000); // 1 min cache for freshness
            if (cached) return cached;

            var q = window.supabaseClient.from('marketplace_listings')
                .select('*', { count: 'exact' })
                .eq('status', 'active');
            if (platform) q = q.eq('platform', platform);
            if (category && !platform) {
                if (category === 'other') {
                    // Exclude all known category platforms
                    var allKnown = [];
                    Marketplace._categories.forEach(function(c) {
                        if (c.id !== 'other') allKnown = allKnown.concat(c.platforms);
                    });
                    if (allKnown.length > 0) {
                        q = q.not('platform', 'in', '(' + allKnown.join(',') + ')');
                    }
                } else {
                    var catPlatforms = Marketplace.getCategoryPlatforms(category);
                    if (catPlatforms.length > 0) {
                        q = q.in('platform', catPlatforms);
                    }
                }
            }

            if (sort === 'newest') {
                q = q.order('created_at', { ascending: false });
            } else if (sort === 'price_low') {
                q = q.order('price', { ascending: true });
            } else if (sort === 'price_high') {
                q = q.order('price', { ascending: false });
            } else if (sort === 'popular') {
                q = q.order('clicks', { ascending: false });
            } else {
                // 'smart' sort: fetch more, then shuffle with popularity weighting
                q = q.order('created_at', { ascending: false }).limit(Math.min(limit * 3, 100));
            }

            if (sort !== 'smart') {
                q = q.range(offset, offset + limit - 1);
            }

            var { data, error, count } = await q;
            if (error) throw error;
            var listings = data || [];

            if (sort === 'smart' && listings.length > 0) {
                // Popularity-weighted shuffle algorithm
                listings = Marketplace._popularityShuffle(listings);
                listings = listings.slice(offset, offset + limit);
            }

            var result = { data: listings, count: count || 0 };
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) {
            console.error('Marketplace.getListings:', err.message);
            return { data: [], count: 0 };
        }
    },

    /**
     * Popularity-weighted shuffle: items with more engagement appear more often
     * but order is randomized each time.
     * @param {Array} items
     * @returns {Array}
     */
    _popularityShuffle(items) {
        // Calculate engagement score for each item
        var scored = items.map(function(item) {
            var clickScore = (item.clicks || 0) * 2;
            var impressionScore = (item.impressions || 0) * 0.1;
            var recencyBonus = 1;
            if (item.created_at) {
                var daysSince = (Date.now() - new Date(item.created_at).getTime()) / (24 * 60 * 60 * 1000);
                if (daysSince <= 1) recencyBonus = 3;
                else if (daysSince <= 3) recencyBonus = 2;
                else if (daysSince <= 7) recencyBonus = 1.5;
                else recencyBonus = 1;
            }
            var score = (clickScore + impressionScore + 1) * recencyBonus;
            // Add randomness: multiply by random factor 0.5-1.5
            var randomFactor = 0.5 + Math.random();
            return { item: item, weight: score * randomFactor };
        });

        // Sort by weighted score (randomized)
        scored.sort(function(a, b) { return b.weight - a.weight; });
        return scored.map(function(s) { return s.item; });
    },

    /**
     * Get a single listing by ID.
     */
    async getOne(id) {
        try {
            if (!id) return null;
            var { data, error } = await window.supabaseClient
                .from('marketplace_listings').select('*').eq('id', id).single();
            if (error) throw error;
            return data;
        } catch (err) { console.error('Marketplace.getOne:', err.message); return null; }
    },

    /**
     * Get listings by a specific seller.
     */
    async getBySeller(sellerId) {
        try {
            if (!sellerId) return [];
            var { data, error } = await window.supabaseClient
                .from('marketplace_listings').select('*')
                .eq('seller_id', sellerId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) { console.error('Marketplace.getBySeller:', err.message); return []; }
    },

    /**
     * Submit a new marketplace listing.
     */
    async submit(listingData) {
        try {
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            if (!Auth.requireAuth()) return null;
            if (!Security.checkRateLimit('submit')) { UI.toast('Too many submissions. Please wait.', 'error'); return null; }

            var row = {
                seller_id: Auth.getUserId(),
                platform: listingData.platform || '',
                category: listingData.category || Marketplace.getPlatformCategory(listingData.platform || ''),
                title: Security.sanitize(listingData.title || '').slice(0, 100),
                description: Security.sanitize(listingData.description || '').slice(0, 1000),
                price: Math.max(0, parseFloat(listingData.price) || 0),
                currency: listingData.currency || 'USD',
                contact_link: Security.sanitize(listingData.contact_link || ''),
                status: 'active'
            };

            // Track custom platform for auto-growth algorithm
            if (listingData.custom_platform) {
                Marketplace.trackCustomPlatform(listingData.custom_platform, row.category);
            }

            var { data, error } = await window.supabaseClient
                .from('marketplace_listings').insert(row).select().single();
            if (error) {
                console.error('Marketplace.submit insert error:', error.code, error.message);
                if (error.code === '42501') {
                    UI.toast('Permission denied. Please sign out and sign in again.', 'error');
                } else {
                    UI.toast('Failed to submit listing: ' + (error.message || 'Unknown error'), 'error');
                }
                return null;
            }
            CACHE.clear();
            return data;
        } catch (err) {
            console.error('Marketplace.submit:', err.message);
            UI.toast('Failed to submit listing.', 'error');
            return null;
        }
    },

    /**
     * Update a listing (owner only).
     */
    async update(id, updates) {
        try {
            if (!id || !Auth.requireAuth()) return false;
            var allowed = {};
            if (updates.title !== undefined) allowed.title = Security.sanitize(updates.title).slice(0, 100);
            if (updates.description !== undefined) allowed.description = Security.sanitize(updates.description).slice(0, 1000);
            if (updates.price !== undefined) allowed.price = Math.max(0, parseFloat(updates.price) || 0);
            if (updates.status !== undefined) allowed.status = updates.status;
            allowed.updated_at = new Date().toISOString();

            var { error } = await window.supabaseClient
                .from('marketplace_listings').update(allowed).eq('id', id).eq('seller_id', Auth.getUserId());
            if (error) throw error;
            CACHE.clear();
            return true;
        } catch (err) { console.error('Marketplace.update:', err.message); return false; }
    },

    /**
     * Increment impressions for a listing.
     */
    async incrementImpressions(id) {
        try {
            if (!id) return;
            var key = 'mk_imp_' + id;
            var last = sessionStorage.getItem(key);
            if (last && Date.now() - parseInt(last) < 60000) return; // 1 min throttle
            await window.supabaseClient.rpc('increment_listing_impressions', { p_listing_id: id });
            sessionStorage.setItem(key, Date.now().toString());
        } catch (err) { console.error('Marketplace.incrementImpressions:', err.message); }
    },

    /**
     * Increment clicks for a listing.
     */
    async incrementClicks(id) {
        try {
            if (!id) return;
            await window.supabaseClient.rpc('increment_listing_clicks', { p_listing_id: id });
        } catch (err) { console.error('Marketplace.incrementClicks:', err.message); }
    },

    /**
     * Report a listing.
     */
    async reportListing(id) {
        try {
            if (!id) return;
            if (!Auth.requireAuth()) return;
            await window.supabaseClient.rpc('increment_listing_reports', { p_listing_id: id });
            UI.toast('Listing reported. Thank you.', 'success');
        } catch (err) { console.error('Marketplace.reportListing:', err.message); UI.toast('Failed to report.', 'error'); }
    },

    /**
     * Get seller profile info: user data + avg rating + review count.
     */
    async getSellerProfile(sellerId) {
        try {
            if (!sellerId) return null;
            var [userResult, statsResult, listingsResult] = await Promise.all([
                window.supabaseClient.from('users').select('id, auth_id, display_name, photo_url, gxp, level, created_at').eq('id', sellerId).single(),
                window.supabaseClient.rpc('get_seller_stats', { p_seller_id: sellerId }),
                window.supabaseClient.from('marketplace_listings').select('*').eq('seller_id', sellerId).eq('status', 'active').order('created_at', { ascending: false })
            ]);

            if (userResult.error) throw userResult.error;
            var user = userResult.data;
            var stats = statsResult.data || { avg_rating: 0, review_count: 0 };
            // Handle both array and single object returns from RPC
            if (Array.isArray(stats) && stats.length > 0) stats = stats[0];
            var listings = listingsResult.data || [];

            return {
                user: user,
                avg_rating: parseFloat(stats.avg_rating) || 0,
                review_count: parseInt(stats.review_count) || 0,
                listings: listings
            };
        } catch (err) { console.error('Marketplace.getSellerProfile:', err.message); return null; }
    },

    /**
     * Get reviews for a seller.
     */
    async getSellerReviews(sellerId, options) {
        try {
            if (!sellerId) return { data: [], count: 0 };
            var opts = options || {};
            var limit = opts.limit || 20;
            var offset = opts.offset || 0;
            var { data, error, count } = await window.supabaseClient
                .from('seller_reviews').select('*', { count: 'exact' })
                .eq('seller_id', sellerId)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (error) throw error;
            return { data: data || [], count: count || 0 };
        } catch (err) { console.error('Marketplace.getSellerReviews:', err.message); return { data: [], count: 0 }; }
    },

    /**
     * Submit a review for a seller.
     */
    async submitReview(sellerId, rating, reviewText, listingId) {
        try {
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            if (!Auth.requireAuth()) return null;
            if (!Security.checkRateLimit('review')) { UI.toast('Too many reviews. Please wait.', 'error'); return null; }
            if (sellerId === Auth.getUserId()) { UI.toast('You cannot review yourself.', 'warning'); return null; }

            var row = {
                seller_id: sellerId,
                reviewer_id: Auth.getUserId(),
                listing_id: listingId || null,
                rating: Math.max(1, Math.min(5, parseInt(rating) || 1)),
                review_text: Security.sanitize(reviewText || '').slice(0, 500)
            };

            var { data, error } = await window.supabaseClient
                .from('seller_reviews').insert(row).select().single();
            if (error) {
                if (error.code === '23505') {
                    UI.toast('You have already reviewed this seller.', 'warning');
                } else {
                    UI.toast('Failed to submit review: ' + (error.message || 'Unknown error'), 'error');
                }
                return null;
            }
            UI.toast('Review submitted!', 'success');
            return data;
        } catch (err) { console.error('Marketplace.submitReview:', err.message); UI.toast('Failed to submit review.', 'error'); return null; }
    },

    /**
     * Get trending listings (most clicked).
     * @param {number} limit - max items to return
     * @returns {Promise<Array>}
     */
    async getTrending(limit) {
        try {
            var l = limit || 6;
            var cacheKey = 'mk_trending_' + l;
            var cached = CACHE.get(cacheKey, 120000); // 2 min cache
            if (cached) return cached;
            var { data, error } = await window.supabaseClient
                .from('marketplace_listings').select('*')
                .eq('status', 'active')
                .order('clicks', { ascending: false })
                .limit(l);
            if (error) throw error;
            var result = data || [];
            // Only return items with some engagement
            result = result.filter(function(item) { return (item.clicks || 0) > 0; });
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) { console.error('Marketplace.getTrending:', err.message); return []; }
    },

    /**
     * Track a custom platform name for auto-growth algorithm.
     * When 10+ users add the same platform, it auto-promotes to fixed options.
     */
    async trackCustomPlatform(name, category) {
        try {
            if (!name) return;
            await window.supabaseClient.rpc('increment_custom_platform', {
                p_name: name,
                p_category: category || 'other'
            });
        } catch (err) { console.error('Marketplace.trackCustomPlatform:', err.message); }
    },

    /**
     * Get auto-promoted custom platforms (usage >= 10).
     */
    async getPromotedPlatforms() {
        try {
            var cacheKey = 'mk_promoted_platforms';
            var cached = CACHE.get(cacheKey, 300000); // 5 min cache
            if (cached) return cached;
            var { data, error } = await window.supabaseClient.rpc('get_promoted_platforms');
            if (error) throw error;
            var result = data || [];
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) { console.error('Marketplace.getPromotedPlatforms:', err.message); return []; }
    },

    /**
     * Validate a custom platform name via AI (OpenRouter).
     * Returns { valid: boolean, message: string }
     */
    async validatePlatformWithAI(platformName) {
        try {
            var res = await fetch('/api/validate-platform', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: platformName })
            });
            if (!res.ok) {
                console.warn('Marketplace.validatePlatformWithAI: endpoint returned', res.status);
                return { valid: true, message: '' };
            }
            return await res.json();
        } catch (err) {
            console.warn('Marketplace.validatePlatformWithAI: unavailable, allowing');
            return { valid: true, message: '' };
        }
    },

    /**
     * Validate listing content via AI (OpenRouter) - calls Cloudflare Function.
     * Returns { valid: boolean, message: string }
     */
    async validateWithAI(title, description) {
        try {
            var res = await fetch('/api/validate-listing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title, description: description })
            });
            if (!res.ok) {
                console.warn('Marketplace.validateWithAI: endpoint returned', res.status);
                // If endpoint unavailable, allow submission (graceful degradation)
                return { valid: true, message: '' };
            }
            var data = await res.json();
            return data;
        } catch (err) {
            console.warn('Marketplace.validateWithAI: endpoint unavailable, allowing submission');
            return { valid: true, message: '' };
        }
    },

    /**
     * Get marketplace platforms config for sell form.
     * @param {string} categoryId - optional, filter by category
     * @returns {Array} platform objects with id, name, icon
     */
    getMarketplacePlatforms(categoryId) {
        var allPlatforms = {
            social_media: [
                { id: 'facebook', name: 'Facebook', icon: ICONS.facebook },
                { id: 'instagram', name: 'Instagram', icon: ICONS.instagram || ICONS.camera },
                { id: 'twitter', name: 'Twitter/X', icon: ICONS.twitter || ICONS.smartphone },
                { id: 'snapchat', name: 'Snapchat', icon: ICONS.smartphone }
            ],
            streaming: [
                { id: 'youtube', name: 'YouTube', icon: ICONS.youtube || ICONS.monitor },
                { id: 'tiktok', name: 'TikTok', icon: ICONS.tiktok || ICONS.smartphone },
                { id: 'twitch', name: 'Twitch', icon: ICONS.monitor },
                { id: 'kick', name: 'Kick', icon: ICONS.monitor }
            ],
            messaging: [
                { id: 'whatsapp', name: 'WhatsApp', icon: ICONS.whatsapp },
                { id: 'telegram', name: 'Telegram', icon: ICONS.telegram },
                { id: 'discord', name: 'Discord', icon: ICONS.discord },
                { id: 'signal', name: 'Signal', icon: ICONS.smartphone }
            ],
            professional: [
                { id: 'linkedin', name: 'LinkedIn', icon: ICONS.globe },
                { id: 'reddit', name: 'Reddit', icon: ICONS.globe },
                { id: 'quora', name: 'Quora', icon: ICONS.globe }
            ],
            other: []
        };

        if (categoryId && allPlatforms[categoryId] !== undefined) {
            return allPlatforms[categoryId];
        }

        // Return all platforms flattened
        var all = [];
        Object.keys(allPlatforms).forEach(function(key) {
            all = all.concat(allPlatforms[key]);
        });
        all.push({ id: 'other', name: 'Other', icon: ICONS.globe });
        return all;
    }
};
