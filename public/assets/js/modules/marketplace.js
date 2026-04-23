// ─── Module: marketplace ───
// Exports: Marketplace

// ═══════════════════════════════════════
// MODULE 5a: DB.marketplace (Marketplace Listings System)
// ═══════════════════════════════════════
const _Marketplace = {
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
                listings = _Marketplace._popularityShuffle(listings);
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
            var verification = await _Marketplace.checkSellerVerification();
            if (!verification.verified) {
                UI.toast(verification.reason, 'error');
                return null;
            }

            // Feature 2: Validate product category is in the whitelist
            var category = listingData.category || '';
            if (!_Marketplace.isValidCategory(category)) {
                UI.toast('Please select a valid product category.', 'error');
                return null;
            }

            // Feature 5: Banned keywords filter
            var titleCheck = _Marketplace.checkBannedKeywords(listingData.title || '');
            var descCheck = _Marketplace.checkBannedKeywords(listingData.description || '');
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
                price: Math.max(1, parseInt(listingData.price, 10) || 1),
                currency: 'coins',
                contact_link: Security.sanitize(listingData.contact_link || ''),
                delivery_url: Security.sanitize(listingData.delivery_url || ''),
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
            if (last && Date.now() - parseInt(last, 10) < 60000) return; // 1 min throttle
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
                review_count: parseInt(stats.review_count, 10) || 0,
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
                rating: Math.max(1, Math.min(5, parseInt(rating, 10) || 1)),
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
        } catch (_err) {
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
        } catch (_err) {
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
            // F-5: UUID-validate before interpolating into a PostgREST filter.
            if (!Security.isUuid(userId)) return [];
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
            // F-5: UUID-validate before interpolating into a PostgREST filter.
            if (!Security.isUuid(userId)) return [];
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
            var listing = await _Marketplace.getOne(listingId);
            if (!listing) { UI.toast('Listing not found.', 'error'); return null; }
            if (listing.seller_id === Auth.getUserId()) { UI.toast('You cannot review your own product.', 'warning'); return null; }

            var row = {
                listing_id: listingId,
                escrow_id: escrowId || null,
                reviewer_id: Auth.getUserId(),
                seller_id: listing.seller_id,
                rating: Math.max(1, Math.min(5, parseInt(rating, 10) || 1)),
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
                review_count: parseInt(stats.review_count, 10) || 0
            };
        } catch (err) {
            console.error('Marketplace.getProductReviewStats:', err.message);
            return { avg_rating: 0, review_count: 0 };
        }
    },

    // ═══════════════════════════════════════
    // FEATURE 1: SELLER TRUST SCORING
    // ═══════════════════════════════════════

    /**
     * Compute a seller trust score (0–100) based on multiple factors.
     * Factors: account age, completed transactions, review ratings, response time, refund rate.
     * Returns { score, level, badges, factors }.
     */
    async getSellerTrustScore(sellerId) {
        try {
            if (!sellerId) return _Marketplace._defaultTrustScore();
            var cacheKey = 'mk_trust_' + sellerId;
            var cached = CACHE.get(cacheKey, 120000);
            if (cached) return cached;

            // Try server-side RPC first
            try {
                var { data, error } = await window.supabaseClient.rpc('get_seller_trust_score', { p_seller_id: sellerId });
                if (!error && data) {
                    var serverScore = Array.isArray(data) ? data[0] : data;
                    if (serverScore && typeof serverScore.score === 'number') {
                        var result = _Marketplace._enrichTrustScore(serverScore);
                        CACHE.set(cacheKey, result);
                        return result;
                    }
                }
            } catch (_e) { /* RPC may not exist yet — fall back to client computation */ }

            // Client-side computation fallback
            var [profileResult, escrowResult, disputeResult] = await Promise.allSettled([
                _Marketplace.getSellerProfile(sellerId),
                window.supabaseClient.from('marketplace_escrow').select('id, status, created_at', { count: 'exact' }).eq('seller_id', sellerId),
                window.supabaseClient.from('marketplace_disputes').select('id', { count: 'exact' }).eq('seller_id', sellerId)
            ]);

            var profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
            var escrows = escrowResult.status === 'fulfilled' && !escrowResult.value.error ? escrowResult.value : { data: [], count: 0 };
            var disputes = disputeResult.status === 'fulfilled' && !disputeResult.value.error ? disputeResult.value : { data: [], count: 0 };

            if (!profile) return _Marketplace._defaultTrustScore();

            // Factor 1: Account age (max 20 points)
            var accountAgeDays = 0;
            if (profile.user && profile.user.created_at) {
                accountAgeDays = (Date.now() - new Date(profile.user.created_at).getTime()) / (24 * 60 * 60 * 1000);
            }
            var ageScore = Math.min(20, Math.floor(accountAgeDays / 15));

            // Factor 2: Completed transactions (max 25 points)
            var completedCount = 0;
            if (escrows.data) {
                completedCount = escrows.data.filter(function(e) { return e.status === 'released' || e.status === 'completed'; }).length;
            }
            var txScore = Math.min(25, completedCount * 2.5);

            // Factor 3: Review rating (max 25 points)
            var avgRating = profile.avg_rating || 0;
            var reviewCount = profile.review_count || 0;
            var ratingScore = reviewCount > 0 ? (avgRating / 5) * 25 : 10;

            // Factor 4: Response consistency (max 15 points — based on listing count and activity)
            var listingCount = profile.listings ? profile.listings.length : 0;
            var responseScore = Math.min(15, listingCount * 3);

            // Factor 5: Refund/dispute rate (max 15 points — lower is better)
            var totalTx = escrows.count || 0;
            var disputeCount = disputes.count || 0;
            var disputeRate = totalTx > 0 ? disputeCount / totalTx : 0;
            var refundScore = Math.max(0, 15 - Math.floor(disputeRate * 100));

            var totalScore = Math.min(100, Math.round(ageScore + txScore + ratingScore + responseScore + refundScore));

            var result = _Marketplace._enrichTrustScore({
                score: totalScore,
                factors: {
                    account_age: { score: ageScore, max: 20, days: Math.floor(accountAgeDays) },
                    transactions: { score: txScore, max: 25, count: completedCount },
                    ratings: { score: ratingScore, max: 25, avg: avgRating, count: reviewCount },
                    response: { score: responseScore, max: 15, listings: listingCount },
                    refund_rate: { score: refundScore, max: 15, rate: disputeRate, disputes: disputeCount }
                }
            });

            CACHE.set(cacheKey, result);
            return result;
        } catch (err) {
            console.error('Marketplace.getSellerTrustScore:', err.message);
            return _Marketplace._defaultTrustScore();
        }
    },

    _defaultTrustScore() {
        return { score: 0, level: 'new', label: 'New Seller', color: '#9ca3af', badges: [], factors: {} };
    },

    _enrichTrustScore(raw) {
        var score = raw.score || 0;
        var level, label, color;
        if (score >= 90) { level = 'top'; label = 'Top Seller'; color = '#f59e0b'; }
        else if (score >= 70) { level = 'trusted'; label = 'Trusted Seller'; color = '#10b981'; }
        else if (score >= 50) { level = 'verified'; label = 'Verified Seller'; color = '#6366f1'; }
        else if (score >= 25) { level = 'active'; label = 'Active Seller'; color = '#3b82f6'; }
        else { level = 'new'; label = 'New Seller'; color = '#9ca3af'; }

        var badges = [];
        if (score >= 90) badges.push({ id: 'top_seller', label: 'Top Seller', icon: 'trophy', color: '#f59e0b' });
        if (score >= 50) badges.push({ id: 'verified_seller', label: 'Verified Seller', icon: 'shield', color: '#6366f1' });
        if (raw.factors && raw.factors.transactions && raw.factors.transactions.count >= 10) {
            badges.push({ id: 'experienced', label: '10+ Sales', icon: 'trending', color: '#10b981' });
        }
        if (raw.factors && raw.factors.ratings && raw.factors.ratings.avg >= 4.5 && raw.factors.ratings.count >= 5) {
            badges.push({ id: 'highly_rated', label: 'Highly Rated', icon: 'star', color: '#f59e0b' });
        }
        if (raw.factors && raw.factors.refund_rate && raw.factors.refund_rate.disputes === 0 && raw.factors.transactions && raw.factors.transactions.count >= 5) {
            badges.push({ id: 'zero_disputes', label: 'Zero Disputes', icon: 'check', color: '#10b981' });
        }

        return {
            score: score,
            level: level,
            label: label,
            color: color,
            badges: badges,
            factors: raw.factors || {}
        };
    },

    // ═══════════════════════════════════════
    // FEATURE 3: NEGOTIATION / OFFERS
    // ═══════════════════════════════════════

    /**
     * Make an offer on a listing (buyer).
     * @param {string} listingId
     * @param {number} offerAmount - GMX Coins offered
     * @param {string} message - optional message to seller
     */
    async makeOffer(listingId, offerAmount, message) {
        try {
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            if (!Auth.requireAuth()) return null;
            if (!Security.checkRateLimit('offer')) { UI.toast('Too many offers. Please wait.', 'error'); return null; }

            var listing = await _Marketplace.getOne(listingId);
            if (!listing) { UI.toast('Listing not found.', 'error'); return null; }
            if (listing.seller_id === Auth.getUserId()) { UI.toast('You cannot make an offer on your own listing.', 'warning'); return null; }
            if (offerAmount >= listing.price) { UI.toast('Offer must be below list price. Use Buy Now instead.', 'info'); return null; }
            if (offerAmount < 1) { UI.toast('Offer must be at least 1 GMX Coin.', 'error'); return null; }

            var row = {
                listing_id: listingId,
                buyer_id: Auth.getUserId(),
                seller_id: listing.seller_id,
                offer_amount: Math.floor(offerAmount),
                original_price: listing.price,
                message: Security.sanitize(message || '').slice(0, 300),
                status: 'pending'
            };

            var { data, error } = await window.supabaseClient
                .from('marketplace_offers').insert(row).select().single();
            if (error) {
                if (error.code === '23505') {
                    UI.toast('You already have a pending offer on this listing.', 'warning');
                } else {
                    UI.toast('Failed to submit offer: ' + (error.message || 'Unknown error'), 'error');
                }
                return null;
            }
            UI.toast('Offer sent! The seller will be notified.', 'success');
            CACHE.clear();
            return data;
        } catch (err) {
            console.error('Marketplace.makeOffer:', err.message);
            UI.toast('Failed to send offer.', 'error');
            return null;
        }
    },

    /**
     * Respond to an offer (seller): accept, reject, or counter.
     * @param {string} offerId
     * @param {string} action - 'accept' | 'reject' | 'counter'
     * @param {number} counterAmount - required if action is 'counter'
     */
    async respondToOffer(offerId, action, counterAmount) {
        try {
            if (!Auth.requireAuth()) return null;
            var validActions = ['accept', 'reject', 'counter'];
            if (validActions.indexOf(action) === -1) { UI.toast('Invalid action.', 'error'); return null; }

            var updates = { status: action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'countered' };
            if (action === 'counter') {
                if (!counterAmount || counterAmount < 1) { UI.toast('Counter amount must be at least 1 GMX Coin.', 'error'); return null; }
                updates.counter_amount = Math.floor(counterAmount);
            }
            updates.responded_at = new Date().toISOString();

            var { data, error } = await window.supabaseClient
                .from('marketplace_offers').update(updates)
                .eq('id', offerId).eq('seller_id', Auth.getUserId())
                .select().single();
            if (error) throw error;

            var messages = { accepted: 'Offer accepted!', rejected: 'Offer rejected.', countered: 'Counter-offer sent!' };
            UI.toast(messages[updates.status] || 'Response sent.', 'success');

            // If accepted, auto-create escrow
            if (action === 'accept' && data) {
                try {
                    await _Marketplace.purchaseWithCoins(data.listing_id, data.offer_amount);
                } catch (e) { console.warn('Auto-escrow after offer accept:', e.message); }
            }

            CACHE.clear();
            return data;
        } catch (err) {
            console.error('Marketplace.respondToOffer:', err.message);
            UI.toast('Failed to respond to offer.', 'error');
            return null;
        }
    },

    /**
     * Get offers for a listing (seller view).
     */
    async getListingOffers(listingId) {
        try {
            if (!listingId || !Auth.requireAuth()) return [];
            var { data, error } = await window.supabaseClient
                .from('marketplace_offers').select('*')
                .eq('listing_id', listingId).eq('seller_id', Auth.getUserId())
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) { console.error('Marketplace.getListingOffers:', err.message); return []; }
    },

    /**
     * Get all offers for the current user (as buyer or seller).
     */
    async getMyOffers() {
        try {
            if (!Auth.requireAuth()) return [];
            var userId = Auth.getUserId();
            // F-5: UUID-validate before interpolating into a PostgREST filter.
            if (!Security.isUuid(userId)) return [];
            var { data, error } = await window.supabaseClient
                .from('marketplace_offers').select('*, marketplace_listings(title, price)')
                .or('buyer_id.eq.' + userId + ',seller_id.eq.' + userId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) { console.error('Marketplace.getMyOffers:', err.message); return []; }
    },

    // ═══════════════════════════════════════
    // FEATURE 4: SMART PRICING SUGGESTIONS
    // ═══════════════════════════════════════

    /**
     * Get pricing suggestions based on similar active listings in same category.
     * Returns { min, max, median, avg, count, suggestion }.
     */
    async getSimilarPricing(category) {
        try {
            if (!category) return null;
            var cacheKey = 'mk_pricing_' + category;
            var cached = CACHE.get(cacheKey, 300000);
            if (cached) return cached;

            var { data, error } = await window.supabaseClient
                .from('marketplace_listings').select('price')
                .eq('product_category', category).eq('status', 'active')
                .order('price', { ascending: true });
            if (error) throw error;
            var prices = (data || []).map(function(l) { return l.price; }).filter(function(p) { return p > 0; });

            if (prices.length < 2) {
                var result = { min: 0, max: 0, median: 0, avg: 0, count: 0, suggestion: 'Not enough data — set any price you think is fair.' };
                CACHE.set(cacheKey, result);
                return result;
            }

            var min = prices[0];
            var max = prices[prices.length - 1];
            var sum = prices.reduce(function(a, b) { return a + b; }, 0);
            var avg = Math.round(sum / prices.length);
            var mid = Math.floor(prices.length / 2);
            var median = prices.length % 2 === 0 ? Math.round((prices[mid - 1] + prices[mid]) / 2) : prices[mid];

            // Suggest a competitive range (25th to 75th percentile)
            var p25 = prices[Math.floor(prices.length * 0.25)];
            var p75 = prices[Math.floor(prices.length * 0.75)];
            var categoryName = category.replace('_', ' ');
            var suggestion = 'Similar ' + categoryName + ' sell for ' + p25 + '–' + p75 + ' GMX Coins.';

            var result = { min: min, max: max, median: median, avg: avg, count: prices.length, p25: p25, p75: p75, suggestion: suggestion };
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) {
            console.error('Marketplace.getSimilarPricing:', err.message);
            return null;
        }
    },

    // ═══════════════════════════════════════
    // FEATURE 5: LISTING QUALITY SCORE
    // ═══════════════════════════════════════

    /**
     * Compute a listing quality score (0–100) based on title, description, price, etc.
     * Returns { score, grade, tips }.
     */
    getListingQualityScore(listingData) {
        var score = 0;
        var tips = [];
        var title = listingData.title || '';
        var description = listingData.description || '';
        var price = listingData.price || 0;
        var category = listingData.category || '';
        var deliveryUrl = listingData.delivery_url || '';

        // Title quality (max 25)
        if (title.length >= 5) score += 5;
        if (title.length >= 20) score += 5;
        if (title.length >= 40) score += 5;
        if (/[A-Z]/.test(title.charAt(0))) score += 3; // starts with capital
        if (/[-—|:]/.test(title)) score += 4; // uses separator (more descriptive)
        if (title.split(/\s+/).length >= 5) score += 3; // at least 5 words
        if (title.length < 20) tips.push('Make your title longer and more descriptive (20+ chars)');
        if (title.split(/\s+/).length < 4) tips.push('Use 4+ words in your title for better visibility');

        // Description quality (max 30)
        if (description.length >= 20) score += 5;
        if (description.length >= 100) score += 5;
        if (description.length >= 250) score += 5;
        if (description.length >= 500) score += 5;
        var descWords = description.split(/\s+/).length;
        if (descWords >= 30) score += 5;
        if (descWords >= 60) score += 5;
        if (description.length < 100) tips.push('Write a detailed description (100+ chars) to get 3x more views');
        if (description.length < 250) tips.push('Descriptions over 250 chars convert 2x better');

        // Category selected (max 10)
        if (category) score += 10;
        else tips.push('Select a category to help buyers find your product');

        // Price set (max 10)
        if (price > 0) score += 10;
        else tips.push('Set a price to enable purchases');

        // Digital delivery provided (max 15)
        if (deliveryUrl) {
            score += 15;
        } else {
            tips.push('Add a preview image or download link to get 3x more views');
        }

        // Formatting bonus (max 10)
        if (/\n/.test(description) || /\r/.test(description)) score += 5; // uses line breaks
        if (/[•\-*]/.test(description)) score += 5; // uses bullet points
        if (description.indexOf('\n') === -1 && description.length > 100) tips.push('Use line breaks or bullet points to make your description easier to read');

        score = Math.min(100, score);
        var grade;
        if (score >= 90) grade = 'A+';
        else if (score >= 80) grade = 'A';
        else if (score >= 70) grade = 'B';
        else if (score >= 60) grade = 'C';
        else if (score >= 40) grade = 'D';
        else grade = 'F';

        return { score: score, grade: grade, tips: tips.slice(0, 3) };
    },

    // ═══════════════════════════════════════
    // FEATURE 6: PURCHASE-BASED RECOMMENDATIONS
    // ═══════════════════════════════════════

    /**
     * Get "also bought" recommendations for a listing.
     * Finds other listings purchased by buyers who also bought this listing.
     */
    async getAlsoBought(listingId) {
        try {
            if (!listingId) return [];
            var cacheKey = 'mk_also_bought_' + listingId;
            var cached = CACHE.get(cacheKey, 300000);
            if (cached) return cached;

            // Try RPC first
            try {
                var { data, error } = await window.supabaseClient.rpc('get_also_bought', { p_listing_id: listingId });
                if (!error && data && data.length > 0) {
                    CACHE.set(cacheKey, data);
                    return data;
                }
            } catch (_e) { /* RPC may not exist yet */ }

            // Fallback: get same-category listings
            var listing = await _Marketplace.getOne(listingId);
            if (!listing) return [];
            var { data: similar, error: simErr } = await window.supabaseClient
                .from('marketplace_listings').select('*')
                .eq('product_category', listing.product_category)
                .eq('status', 'active')
                .neq('id', listingId)
                .order('clicks', { ascending: false })
                .limit(4);
            if (simErr) throw simErr;
            var result = similar || [];
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) {
            console.error('Marketplace.getAlsoBought:', err.message);
            return [];
        }
    },

    // ═══════════════════════════════════════
    // FEATURE 7: SELLER ANALYTICS
    // ═══════════════════════════════════════

    /**
     * Get analytics data for the current seller.
     * Returns { totalViews, totalClicks, totalSales, totalRevenue, conversionRate, listings }.
     */
    async getSellerAnalytics() {
        try {
            if (!Auth.requireAuth()) return null;
            var sellerId = Auth.getUserId();
            var cacheKey = 'mk_analytics_' + sellerId;
            var cached = CACHE.get(cacheKey, 60000);
            if (cached) return cached;

            var [listingsResult, escrowResult, reviewResult] = await Promise.allSettled([
                window.supabaseClient.from('marketplace_listings').select('*').eq('seller_id', sellerId).order('created_at', { ascending: false }),
                window.supabaseClient.from('marketplace_escrow').select('*').eq('seller_id', sellerId),
                window.supabaseClient.from('product_reviews').select('rating').eq('seller_id', sellerId)
            ]);

            var listings = listingsResult.status === 'fulfilled' && !listingsResult.value.error ? (listingsResult.value.data || []) : [];
            var escrows = escrowResult.status === 'fulfilled' && !escrowResult.value.error ? (escrowResult.value.data || []) : [];
            var reviews = reviewResult.status === 'fulfilled' && !reviewResult.value.error ? (reviewResult.value.data || []) : [];

            var totalViews = 0;
            var totalClicks = 0;
            listings.forEach(function(l) {
                totalViews += (l.impressions || 0);
                totalClicks += (l.clicks || 0);
            });

            var completedSales = escrows.filter(function(e) { return e.status === 'released' || e.status === 'completed'; });
            var totalRevenue = completedSales.reduce(function(sum, e) { return sum + (e.coin_amount || 0); }, 0);
            var pendingSales = escrows.filter(function(e) { return e.status === 'held' || e.status === 'pending'; });

            var ctr = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : '0.0';
            var conversionRate = totalClicks > 0 ? ((completedSales.length / totalClicks) * 100).toFixed(1) : '0.0';

            var avgRating = 0;
            if (reviews.length > 0) {
                avgRating = reviews.reduce(function(sum, r) { return sum + r.rating; }, 0) / reviews.length;
            }

            // Best performing listings (by clicks)
            var bestPerforming = listings.slice().sort(function(a, b) { return (b.clicks || 0) - (a.clicks || 0); }).slice(0, 5);

            // Revenue by month (last 6 months)
            var revenueByMonth = {};
            completedSales.forEach(function(e) {
                if (e.created_at) {
                    var month = e.created_at.substring(0, 7); // YYYY-MM
                    revenueByMonth[month] = (revenueByMonth[month] || 0) + (e.coin_amount || 0);
                }
            });

            var result = {
                totalListings: listings.length,
                activeListings: listings.filter(function(l) { return l.status === 'active'; }).length,
                totalViews: totalViews,
                totalClicks: totalClicks,
                ctr: ctr,
                totalSales: completedSales.length,
                pendingSales: pendingSales.length,
                totalRevenue: totalRevenue,
                conversionRate: conversionRate,
                avgRating: avgRating.toFixed(1),
                reviewCount: reviews.length,
                bestPerforming: bestPerforming,
                revenueByMonth: revenueByMonth,
                listings: listings
            };

            CACHE.set(cacheKey, result);
            return result;
        } catch (err) {
            console.error('Marketplace.getSellerAnalytics:', err.message);
            return null;
        }
    },

    // ═══════════════════════════════════════
    // FEATURE 8: DISPUTE RESOLUTION FLOW
    // ═══════════════════════════════════════

    /**
     * Seller responds to a dispute.
     */
    async respondToDispute(disputeId, response) {
        try {
            if (!Auth.requireAuth()) return null;
            if (!response || response.trim().length < 10) {
                UI.toast('Please provide a detailed response (at least 10 characters).', 'error');
                return null;
            }
            var { data, error } = await window.supabaseClient
                .from('marketplace_disputes').update({
                    seller_response: Security.sanitize(response.trim()).slice(0, 1000),
                    seller_responded_at: new Date().toISOString(),
                    status: 'seller_responded'
                })
                .eq('id', disputeId).eq('seller_id', Auth.getUserId())
                .select().single();
            if (error) throw error;
            UI.toast('Response submitted. An admin will review the dispute.', 'success');
            return data;
        } catch (err) {
            console.error('Marketplace.respondToDispute:', err.message);
            UI.toast('Failed to respond to dispute.', 'error');
            return null;
        }
    },

    /**
     * Get dispute details with timeline.
     */
    async getDisputeDetails(disputeId) {
        try {
            if (!Auth.requireAuth()) return null;
            var { data, error } = await window.supabaseClient
                .from('marketplace_disputes').select('*, marketplace_escrow(*), marketplace_listings(title, description, price)')
                .eq('id', disputeId).single();
            if (error) throw error;
            return data;
        } catch (err) {
            console.error('Marketplace.getDisputeDetails:', err.message);
            return null;
        }
    },

    // ═══════════════════════════════════════
    // FEATURE 9: FLASH SALES
    // ═══════════════════════════════════════

    /**
     * Set a flash sale on a listing (seller only).
     * @param {string} listingId
     * @param {number} discountPercent - 5–80%
     * @param {number} durationHours - how long the sale lasts (1–168 hours / 1 week max)
     */
    async setFlashSale(listingId, discountPercent, durationHours) {
        try {
            if (!Auth.requireAuth()) return null;
            if (discountPercent < 5 || discountPercent > 80) {
                UI.toast('Discount must be between 5% and 80%.', 'error');
                return null;
            }
            if (durationHours < 1 || durationHours > 168) {
                UI.toast('Sale duration must be between 1 hour and 7 days.', 'error');
                return null;
            }

            var listing = await _Marketplace.getOne(listingId);
            if (!listing) { UI.toast('Listing not found.', 'error'); return null; }
            if (listing.seller_id !== Auth.getUserId()) { UI.toast('You can only set sales on your own listings.', 'error'); return null; }

            var salePrice = Math.max(1, Math.floor(listing.price * (1 - discountPercent / 100)));
            var endsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

            var { error } = await window.supabaseClient
                .from('marketplace_listings').update({
                    sale_price: salePrice,
                    sale_ends_at: endsAt,
                    sale_discount: discountPercent,
                    updated_at: new Date().toISOString()
                })
                .eq('id', listingId).eq('seller_id', Auth.getUserId());
            if (error) throw error;

            UI.toast('Flash sale activated! ' + discountPercent + '% off for ' + durationHours + ' hours.', 'success');
            CACHE.clear();
            return { sale_price: salePrice, sale_ends_at: endsAt, discount: discountPercent };
        } catch (err) {
            console.error('Marketplace.setFlashSale:', err.message);
            UI.toast('Failed to set flash sale.', 'error');
            return null;
        }
    },

    /**
     * Remove a flash sale from a listing.
     */
    async removeFlashSale(listingId) {
        try {
            if (!Auth.requireAuth()) return false;
            var { error } = await window.supabaseClient
                .from('marketplace_listings').update({
                    sale_price: null,
                    sale_ends_at: null,
                    sale_discount: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', listingId).eq('seller_id', Auth.getUserId());
            if (error) throw error;
            UI.toast('Flash sale removed.', 'success');
            CACHE.clear();
            return true;
        } catch (err) {
            console.error('Marketplace.removeFlashSale:', err.message);
            return false;
        }
    },

    /**
     * Get active flash sales across the marketplace.
     */
    async getFlashSales(limit) {
        try {
            var l = limit || 6;
            var cacheKey = 'mk_flash_sales_' + l;
            var cached = CACHE.get(cacheKey, 60000);
            if (cached) return cached;

            var { data, error } = await window.supabaseClient
                .from('marketplace_listings').select('*')
                .eq('status', 'active')
                .not('sale_price', 'is', null)
                .gt('sale_ends_at', new Date().toISOString())
                .order('sale_ends_at', { ascending: true })
                .limit(l);
            if (error) throw error;
            var result = data || [];
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) {
            console.error('Marketplace.getFlashSales:', err.message);
            return [];
        }
    },

    // ═══════════════════════════════════════
    // FEATURE 10: REVIEW VERIFICATION
    // ═══════════════════════════════════════

    /**
     * Check if current user has purchased a listing (via escrow).
     * Returns true if there's a completed escrow for this buyer+listing.
     */
    async hasVerifiedPurchase(listingId) {
        try {
            if (!listingId || !Auth.getUserId()) return false;
            var { data, error } = await window.supabaseClient
                .from('marketplace_escrow').select('id')
                .eq('listing_id', listingId)
                .eq('buyer_id', Auth.getUserId())
                .in('status', ['released', 'completed'])
                .limit(1);
            if (error) throw error;
            return data && data.length > 0;
        } catch (err) {
            console.error('Marketplace.hasVerifiedPurchase:', err.message);
            return false;
        }
    },

    /**
     * Submit a verified product review (only if buyer has completed purchase).
     */
    async submitVerifiedReview(listingId, rating, reviewText) {
        try {
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            if (!Auth.requireAuth()) return null;

            // Check verified purchase
            var hasPurchase = await _Marketplace.hasVerifiedPurchase(listingId);
            if (!hasPurchase) {
                UI.toast('Only verified buyers can leave reviews. Please purchase this product first.', 'warning');
                return null;
            }

            // Get escrow ID for the purchase
            var { data: escrows } = await window.supabaseClient
                .from('marketplace_escrow').select('id')
                .eq('listing_id', listingId).eq('buyer_id', Auth.getUserId())
                .in('status', ['released', 'completed'])
                .limit(1);
            var escrowId = escrows && escrows.length > 0 ? escrows[0].id : null;

            return await _Marketplace.submitProductReview(listingId, escrowId, rating, reviewText);
        } catch (err) {
            console.error('Marketplace.submitVerifiedReview:', err.message);
            UI.toast('Failed to submit review.', 'error');
            return null;
        }
    },

    /**
     * Get marketplace platforms config for sell form.
     * @param {string} categoryId - optional, filter by category
     * @returns {Array} platform objects with id, name, icon
     */
    getMarketplacePlatforms(categoryId) {
        var allPlatforms = {
            bot_templates: [
                { id: 'telegram_bot', name: 'Telegram Bot', icon: ICONS.telegram },
                { id: 'discord_bot', name: 'Discord Bot', icon: ICONS.discord },
                { id: 'whatsapp_bot', name: 'WhatsApp Bot', icon: ICONS.whatsapp },
                { id: 'slack_bot', name: 'Slack Bot', icon: ICONS.smartphone }
            ],
            design_templates: [
                { id: 'banners', name: 'Banners', icon: ICONS.monitor },
                { id: 'sticker_packs', name: 'Sticker Packs', icon: ICONS.smartphone },
                { id: 'welcome_images', name: 'Welcome Images', icon: ICONS.camera || ICONS.monitor },
                { id: 'logos', name: 'Logos', icon: ICONS.globe }
            ],
            guides_ebooks: [
                { id: 'growth_guides', name: 'Growth Guides', icon: ICONS.globe },
                { id: 'marketing_ebooks', name: 'Marketing Ebooks', icon: ICONS.globe },
                { id: 'community_playbooks', name: 'Community Playbooks', icon: ICONS.globe },
                { id: 'monetization_guides', name: 'Monetization Guides', icon: ICONS.globe }
            ],
            automation: [
                { id: 'zapier_templates', name: 'Zapier Templates', icon: ICONS.globe },
                { id: 'n8n_flows', name: 'n8n Flows', icon: ICONS.globe },
                { id: 'make_scenarios', name: 'Make Scenarios', icon: ICONS.globe },
                { id: 'api_scripts', name: 'API Scripts', icon: ICONS.globe }
            ],
            management_tools: [
                { id: 'group_tools', name: 'Group Tools', icon: ICONS.globe },
                { id: 'moderation_scripts', name: 'Moderation Scripts', icon: ICONS.globe },
                { id: 'analytics_dashboards', name: 'Analytics Dashboards', icon: ICONS.monitor },
                { id: 'reporting_templates', name: 'Reporting Templates', icon: ICONS.globe }
            ],
            premium_packs: [
                { id: 'welcome_packs', name: 'Welcome Packs', icon: ICONS.globe },
                { id: 'rules_templates', name: 'Rules Templates', icon: ICONS.globe },
                { id: 'onboarding_kits', name: 'Onboarding Kits', icon: ICONS.globe },
                { id: 'content_calendars', name: 'Content Calendars', icon: ICONS.globe }
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
    },

};

