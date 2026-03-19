// ─── Module: marketplace ───
// Exports: Marketplace
// Split from app.js for maintainability

// ═══════════════════════════════════════
// MODULE 5a: DB.marketplace (Marketplace Listings System)
// ═══════════════════════════════════════
const Marketplace = {
    // ── Digital product category definitions (whitelist — no freeform "Other") ──
    _categories: [
        {
            id: 'templates',
            name: 'Templates',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
            platforms: []
        },
        {
            id: 'bots',
            name: 'Bots',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/><path d="M9 15h6"/><line x1="12" y1="1" x2="12" y2="4"/></svg>',
            platforms: []
        },
        {
            id: 'scripts',
            name: 'Scripts',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
            platforms: []
        },
        {
            id: 'design_assets',
            name: 'Design Assets',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>',
            platforms: []
        },
        {
            id: 'guides',
            name: 'Guides',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
            platforms: []
        },
        {
            id: 'tools',
            name: 'Tools',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
            platforms: []
        }
    ],

    // ── Banned keywords — auto-reject listings containing these ──
    _bannedKeywords: [
        'account', 'followers', 'subscribers', 'verified badge',
        'hacked', 'cracked', 'leaked', 'stolen',
        'login', 'password', 'credentials',
        'exploit', 'crack', 'nulled', 'warez', 'pirated'
    ],

    /**
     * Get all marketplace categories.
     */
    getCategories() {
        return this._categories;
    },

    /**
     * Check if a category ID is valid (in the whitelist).
     */
    isValidCategory(categoryId) {
        return this._categories.some(function(c) { return c.id === categoryId; });
    },

    /**
     * Check text for banned keywords. Returns { banned: boolean, keyword: string }.
     */
    checkBannedKeywords(text) {
        var lower = (text || '').toLowerCase();
        for (var i = 0; i < this._bannedKeywords.length; i++) {
            if (lower.indexOf(this._bannedKeywords[i]) !== -1) {
                return { banned: true, keyword: this._bannedKeywords[i] };
            }
        }
        return { banned: false, keyword: '' };
    },

    /**
     * Check if current user is a verified seller (email + phone verified).
     * Returns { verified: boolean, reason: string }.
     */
    async checkSellerVerification() {
        try {
            var userId = Auth.getUserId();
            if (!userId) return { verified: false, reason: 'Not signed in' };
            var { data, error } = await window.supabaseClient
                .from('users').select('email, phone_verified').eq('id', userId).single();
            if (error) throw error;
            if (!data) return { verified: false, reason: 'User not found' };
            if (!data.email) return { verified: false, reason: 'Email not verified. Please verify your email in Settings.' };
            if (!data.phone_verified) return { verified: false, reason: 'Phone not verified. Please verify your phone number in Settings before selling.' };
            return { verified: true, reason: '' };
        } catch (err) {
            console.error('checkSellerVerification:', err.message);
            return { verified: false, reason: 'Could not verify seller status. Please try again.' };
        }
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
            if (category) {
                q = q.eq('product_category', category);
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

            // Feature 1: Seller verification — require email + phone
            var verification = await Marketplace.checkSellerVerification();
            if (!verification.verified) {
                UI.toast(verification.reason, 'error');
                return null;
            }

            // Feature 2: Validate product category is in the whitelist
            var category = listingData.category || '';
            if (!Marketplace.isValidCategory(category)) {
                UI.toast('Please select a valid product category.', 'error');
                return null;
            }

            // Feature 5: Banned keywords filter
            var titleCheck = Marketplace.checkBannedKeywords(listingData.title || '');
            var descCheck = Marketplace.checkBannedKeywords(listingData.description || '');
            if (titleCheck.banned) {
                UI.toast('Listing rejected: title contains banned keyword "' + titleCheck.keyword + '". Please remove it.', 'error');
                return null;
            }
            if (descCheck.banned) {
                UI.toast('Listing rejected: description contains banned keyword "' + descCheck.keyword + '". Please remove it.', 'error');
                return null;
            }

            var row = {
                seller_id: Auth.getUserId(),
                platform: listingData.platform || '',
                product_category: category,
                title: Security.sanitize(listingData.title || '').slice(0, 100),
                description: Security.sanitize(listingData.description || '').slice(0, 1000),
                price: Math.max(0, parseFloat(listingData.price) || 0),
                currency: listingData.currency || 'USD',
                contact_link: Security.sanitize(listingData.contact_link || ''),
                status: 'pending',
                seller_verified: true
            };

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

    // ═══════════════════════════════════════
    // ESCROW SYSTEM — coin-based purchases
    // ═══════════════════════════════════════

    /**
     * Purchase a listing with coins (creates escrow hold).
     * Buyer's coins are held until they confirm delivery or 48h auto-release.
     */
    async purchaseWithCoins(listingId, coinAmount) {
        try {
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            if (!Auth.requireAuth()) return null;
            var { data, error } = await window.supabaseClient.rpc('create_marketplace_escrow', {
                p_listing_id: listingId,
                p_buyer_id: Auth.getUserId(),
                p_coin_amount: coinAmount
            });
            if (error) throw error;
            UI.toast('Purchase successful! Coins held in escrow until you confirm delivery.', 'success');
            CACHE.clear();
            return data;
        } catch (err) {
            console.error('Marketplace.purchaseWithCoins:', err.message);
            UI.toast(err.message || 'Purchase failed.', 'error');
            return null;
        }
    },

    /**
     * Buyer confirms delivery — releases coins to seller.
     */
    async confirmDelivery(escrowId) {
        try {
            if (!Auth.requireAuth()) return null;
            var { data, error } = await window.supabaseClient.rpc('release_marketplace_escrow', {
                p_escrow_id: escrowId,
                p_buyer_id: Auth.getUserId()
            });
            if (error) throw error;
            UI.toast('Delivery confirmed! Coins released to seller.', 'success');
            return data;
        } catch (err) {
            console.error('Marketplace.confirmDelivery:', err.message);
            UI.toast(err.message || 'Failed to confirm delivery.', 'error');
            return null;
        }
    },

    /**
     * Get escrow transactions for current user (as buyer or seller).
     */
    async getMyEscrows() {
        try {
            if (!Auth.requireAuth()) return [];
            var userId = Auth.getUserId();
            var { data, error } = await window.supabaseClient
                .from('marketplace_escrow').select('*, marketplace_listings(title, description)')
                .or('buyer_id.eq.' + userId + ',seller_id.eq.' + userId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('Marketplace.getMyEscrows:', err.message);
            return [];
        }
    },

    // ═══════════════════════════════════════
    // DISPUTE / REFUND SYSTEM
    // ═══════════════════════════════════════

    /**
     * Open a dispute on an escrow transaction (buyer only, within 24h).
     */
    async openDispute(escrowId, reason) {
        try {
            if (!Auth.requireAuth()) return null;
            if (!reason || reason.trim().length < 10) {
                UI.toast('Please provide a detailed reason for the dispute (at least 10 characters).', 'error');
                return null;
            }
            var { data, error } = await window.supabaseClient.rpc('create_marketplace_dispute', {
                p_escrow_id: escrowId,
                p_buyer_id: Auth.getUserId(),
                p_reason: reason.trim()
            });
            if (error) throw error;
            UI.toast('Dispute opened. An admin will review it within 24 hours.', 'success');
            return data;
        } catch (err) {
            console.error('Marketplace.openDispute:', err.message);
            UI.toast(err.message || 'Failed to open dispute.', 'error');
            return null;
        }
    },

    /**
     * Get disputes for current user.
     */
    async getMyDisputes() {
        try {
            if (!Auth.requireAuth()) return [];
            var userId = Auth.getUserId();
            var { data, error } = await window.supabaseClient
                .from('marketplace_disputes').select('*, marketplace_listings(title)')
                .or('buyer_id.eq.' + userId + ',seller_id.eq.' + userId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('Marketplace.getMyDisputes:', err.message);
            return [];
        }
    },

    // ═══════════════════════════════════════
    // PRODUCT REVIEWS (buyer reviews on products)
    // ═══════════════════════════════════════

    /**
     * Submit a product review (only buyers who purchased via escrow can review).
     */
    async submitProductReview(listingId, escrowId, rating, reviewText) {
        try {
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            if (!Auth.requireAuth()) return null;
            if (!Security.checkRateLimit('review')) { UI.toast('Too many reviews. Please wait.', 'error'); return null; }

            // Get listing to find seller
            var listing = await Marketplace.getOne(listingId);
            if (!listing) { UI.toast('Listing not found.', 'error'); return null; }
            if (listing.seller_id === Auth.getUserId()) { UI.toast('You cannot review your own product.', 'warning'); return null; }

            var row = {
                listing_id: listingId,
                escrow_id: escrowId || null,
                reviewer_id: Auth.getUserId(),
                seller_id: listing.seller_id,
                rating: Math.max(1, Math.min(5, parseInt(rating) || 1)),
                review_text: Security.sanitize(reviewText || '').slice(0, 500)
            };

            var { data, error } = await window.supabaseClient
                .from('product_reviews').insert(row).select().single();
            if (error) {
                if (error.code === '23505') {
                    UI.toast('You have already reviewed this product.', 'warning');
                } else {
                    UI.toast('Failed to submit review: ' + (error.message || 'Unknown error'), 'error');
                }
                return null;
            }

            // Feature 6: Check seller rating threshold for auto-delisting
            try {
                await window.supabaseClient.rpc('check_seller_rating_threshold', { p_seller_id: listing.seller_id });
            } catch (e) { console.warn('check_seller_rating_threshold:', e.message); }

            UI.toast('Review submitted!', 'success');
            return data;
        } catch (err) {
            console.error('Marketplace.submitProductReview:', err.message);
            UI.toast('Failed to submit review.', 'error');
            return null;
        }
    },

    /**
     * Get product reviews for a specific listing.
     */
    async getProductReviews(listingId, options) {
        try {
            if (!listingId) return { data: [], count: 0 };
            var opts = options || {};
            var limit = opts.limit || 20;
            var offset = opts.offset || 0;
            var { data, error, count } = await window.supabaseClient
                .from('product_reviews').select('*', { count: 'exact' })
                .eq('listing_id', listingId)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (error) throw error;
            return { data: data || [], count: count || 0 };
        } catch (err) {
            console.error('Marketplace.getProductReviews:', err.message);
            return { data: [], count: 0 };
        }
    },

    /**
     * Get product review stats (average rating + count) for a listing.
     */
    async getProductReviewStats(listingId) {
        try {
            if (!listingId) return { avg_rating: 0, review_count: 0 };
            var { data, error } = await window.supabaseClient.rpc('get_product_review_stats', { p_listing_id: listingId });
            if (error) throw error;
            var stats = Array.isArray(data) && data.length > 0 ? data[0] : (data || {});
            return {
                avg_rating: parseFloat(stats.avg_rating) || 0,
                review_count: parseInt(stats.review_count) || 0
            };
        } catch (err) {
            console.error('Marketplace.getProductReviewStats:', err.message);
            return { avg_rating: 0, review_count: 0 };
        }
    }
};
