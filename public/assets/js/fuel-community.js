/**
 * fuel-community.js — Fuel the Community Module
 * Complete gamification system: Wallet, Coins, Tips, Badges, Levels
 *
 * Dependencies: app.js (CONFIG, Security, Auth, DB, UI, CACHE, Algorithms)
 * Must be loaded AFTER app.js and components.js
 */

/* global CONFIG, Security, Auth, DB, UI, CACHE, Analytics, window */

// ═══════════════════════════════════════
// WRITER LEVELS CONFIG
// ═══════════════════════════════════════
const WRITER_LEVELS = {
    newcomer:     { name: 'Newcomer',     name_ar: 'مبتدئ',     minXp: 0,    icon: 'seedling', color: '#94A3B8', perks: [] },
    contributor:  { name: 'Contributor',   name_ar: 'مساهم',     minXp: 50,   icon: 'leaf',     color: '#10B981', perks: ['Can comment on articles'] },
    author:       { name: 'Author',        name_ar: 'كاتب',      minXp: 200,  icon: 'pencil',   color: '#6366F1', perks: ['Faster review', 'Can comment'] },
    star_writer:  { name: 'Star Writer',   name_ar: 'كاتب نجم',  minXp: 500,  icon: 'star',     color: '#F59E0B', perks: ['Auto-publish', 'Priority support'] },
    elite:        { name: 'Elite',         name_ar: 'نخبة',      minXp: 1000, icon: 'crown',    color: '#EAB308', perks: ['Featured Author badge', 'Auto-publish', 'Priority'] }
};

// ═══════════════════════════════════════
// TIP TYPES CONFIG
// ═══════════════════════════════════════
const TIP_TYPES = {
    super_like: { name: 'Super Like',   name_ar: 'لايك ذهبي',  coins: 10,  icon: 'thumbs-up', color: '#F59E0B', emoji: 'star' },
    coffee:     { name: 'Coffee',       name_ar: 'قهوة',       coins: 50,  icon: 'coffee',    color: '#8B5CF6', emoji: 'coffee' },
    fire:       { name: 'Fire Tip',     name_ar: 'نصيحة نارية', coins: 200, icon: 'flame',     color: '#EF4444', emoji: 'fire' },
    diamond:    { name: 'Diamond Tip',  name_ar: 'نصيحة ماسية', coins: 500, icon: 'diamond',   color: '#06B6D4', emoji: 'diamond' }
};

// ═══════════════════════════════════════
// XP REWARDS CONFIG
// ═══════════════════════════════════════
const _XP_REWARDS = {
    publish_article: 10,
    receive_like: 2,
    receive_comment: 3,
    article_trending: 20,
    new_follower: 5,
    send_tip: 1,
    receive_tip: 2,
    daily_login: 1
};

// ═══════════════════════════════════════
// MODULE: Wallet
// ═══════════════════════════════════════
const Wallet = {
    _cache: null,
    _cacheTime: 0,
    _cacheTTL: 30000, // 30s

    async getBalance() {
        try {
            if (!Auth.isLoggedIn()) return null;
            if (this._cache && (Date.now() - this._cacheTime) < this._cacheTTL) return this._cache;

            var userId = Auth.getUserId();
            var { data, error } = await window.supabaseClient.rpc('ensure_user_wallet', { p_user_id: userId });
            if (error) throw error;
            this._cache = data;
            this._cacheTime = Date.now();
            return data;
        } catch (err) {
            console.error('Wallet.getBalance:', err.message);
            return null;
        }
    },

    async getTransactions({ limit, offset, type } = {}) {
        try {
            if (!Auth.isLoggedIn()) return { data: [], count: 0 };
            var userId = Auth.getUserId();
            var l = limit || 20;
            var o = offset || 0;
            var q = window.supabaseClient.from('wallet_transactions')
                .select('*', { count: 'exact' })
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .range(o, o + l - 1);
            if (type) q = q.eq('type', type);
            var { data, error, count } = await q;
            if (error) throw error;
            return { data: data || [], count: count || 0 };
        } catch (err) {
            console.error('Wallet.getTransactions:', err.message);
            return { data: [], count: 0 };
        }
    },

    async getCoinPackages() {
        try {
            var cached = CACHE.get('coin_packages', 300000);
            if (cached) return cached;
            var { data, error } = await window.supabaseClient.from('coin_packages')
                .select('*')
                .eq('is_active', true)
                .order('sort_order', { ascending: true });
            if (error) throw error;
            CACHE.set('coin_packages', data || []);
            return data || [];
        } catch (err) {
            console.error('Wallet.getCoinPackages:', err.message);
            return [];
        }
    },

    async requestWithdrawal(coinsAmount, paymentMethod, paymentDetails) {
        try {
            if (!Auth.requireAuth()) return null;
            if (coinsAmount < 5000) {
                UI.toast('Minimum withdrawal is 5,000 earned coins ($50)', 'error');
                return null;
            }
            var wallet = await this.getBalance();
            if (!wallet || wallet.coins_balance < coinsAmount) {
                UI.toast('Insufficient balance', 'error');
                return null;
            }
            var usdAmount = (coinsAmount * 0.01).toFixed(2);
            var { data, error } = await window.supabaseClient.from('withdrawal_requests').insert({
                user_id: Auth.getUserId(),
                coins_amount: coinsAmount,
                usd_amount: usdAmount,
                payment_method: paymentMethod || 'paypal',
                payment_details: paymentDetails || {}
            }).select().single();
            if (error) throw error;
            this._invalidateCache();
            UI.toast('Withdrawal request submitted! We will process it within 48 hours.', 'success');
            Analytics.track('withdrawal_request', 'monetization', { coins: coinsAmount, usd: usdAmount });
            return data;
        } catch (err) {
            console.error('Wallet.requestWithdrawal:', err.message);
            UI.toast('Failed to submit withdrawal request', 'error');
            return null;
        }
    },

    async getWithdrawals() {
        try {
            if (!Auth.isLoggedIn()) return [];
            var { data, error } = await window.supabaseClient.from('withdrawal_requests')
                .select('*')
                .eq('user_id', Auth.getUserId())
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('Wallet.getWithdrawals:', err.message);
            return [];
        }
    },

    _invalidateCache() {
        this._cache = null;
        this._cacheTime = 0;
    },

    formatCoins(amount) {
        if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
        if (amount >= 1000) return (amount / 1000).toFixed(1) + 'K';
        return String(amount || 0);
    },

    coinsToUSD(coins) {
        return (coins * 0.01).toFixed(2);
    }
};


// ═══════════════════════════════════════
// MODULE: Tips
// ═══════════════════════════════════════
const _Tips = {
    async send(receiverId, articleId, tipType, message, isAnonymous) {
        try {
            if (!Auth.requireAuth()) return null;
            if (!receiverId) { UI.toast('Invalid recipient', 'error'); return null; }
            if (!TIP_TYPES[tipType]) { UI.toast('Invalid tip type', 'error'); return null; }

            var coinsAmount = TIP_TYPES[tipType].coins;
            var wallet = await Wallet.getBalance();
            if (!wallet || wallet.coins_balance < coinsAmount) {
                UI.toast('Not enough coins! You need ' + coinsAmount + ' coins.', 'error');
                return null;
            }

            var { data, error } = await window.supabaseClient.rpc('send_tip', {
                p_sender_id: Auth.getUserId(),
                p_receiver_id: receiverId,
                p_article_id: articleId || null,
                p_tip_type: tipType,
                p_coins_amount: coinsAmount,
                p_message: Security.sanitize((message || '').slice(0, 200)),
                p_is_anonymous: isAnonymous || false
            });
            if (error) throw error;

            Wallet._invalidateCache();
            UI.toast('Tip sent! ' + TIP_TYPES[tipType].name + ' (' + coinsAmount + ' coins)', 'success');
            Analytics.track('tip_sent', 'monetization', { tip_type: tipType, coins: coinsAmount, article_id: articleId });

            // Check badges after tipping
            WriterBadges.checkMyBadges();

            return data;
        } catch (err) {
            console.error('Tips.send:', err.message);
            if (err.message && err.message.indexOf('Insufficient') !== -1) {
                UI.toast('Not enough coins! Buy more coins to tip this writer.', 'error');
            } else if (err.message && err.message.indexOf('yourself') !== -1) {
                UI.toast('You cannot tip yourself', 'error');
            } else {
                UI.toast('Failed to send tip. Please try again.', 'error');
            }
            return null;
        }
    },

    async getReceivedTips({ limit, offset } = {}) {
        try {
            if (!Auth.isLoggedIn()) return { data: [], count: 0 };
            var l = limit || 20;
            var o = offset || 0;
            var { data, error, count } = await window.supabaseClient.from('tips')
                .select('*, sender:users!tips_sender_id_fkey(id, display_name, photo_url)', { count: 'exact' })
                .eq('receiver_id', Auth.getUserId())
                .order('created_at', { ascending: false })
                .range(o, o + l - 1);
            if (error) throw error;
            return { data: data || [], count: count || 0 };
        } catch (err) {
            console.error('Tips.getReceivedTips:', err.message);
            return { data: [], count: 0 };
        }
    },

    async getSentTips({ limit, offset } = {}) {
        try {
            if (!Auth.isLoggedIn()) return { data: [], count: 0 };
            var l = limit || 20;
            var o = offset || 0;
            var { data, error, count } = await window.supabaseClient.from('tips')
                .select('*, receiver:users!tips_receiver_id_fkey(id, display_name, photo_url)', { count: 'exact' })
                .eq('sender_id', Auth.getUserId())
                .order('created_at', { ascending: false })
                .range(o, o + l - 1);
            if (error) throw error;
            return { data: data || [], count: count || 0 };
        } catch (err) {
            console.error('Tips.getSentTips:', err.message);
            return { data: [], count: 0 };
        }
    },

    async getArticleTips(articleId) {
        try {
            if (!articleId) return [];
            var { data, error } = await window.supabaseClient.from('tips')
                .select('*, sender:users!tips_sender_id_fkey(id, display_name, photo_url)')
                .eq('article_id', articleId)
                .order('created_at', { ascending: false })
                .limit(50);
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('Tips.getArticleTips:', err.message);
            return [];
        }
    },

    async getTopFueledAuthors(limit) {
        try {
            var { data, error } = await window.supabaseClient.from('user_wallets')
                .select('user_id, total_received, users!user_wallets_user_id_fkey(id, display_name, photo_url, writer_level, writer_xp, badge_count)')
                .gt('total_received', 0)
                .order('total_received', { ascending: false })
                .limit(limit || 10);
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('Tips.getTopFueledAuthors:', err.message);
            return [];
        }
    }
};


// ═══════════════════════════════════════
// MODULE: WriterBadges
// ═══════════════════════════════════════
const WriterBadges = {
    _definitions: null,

    async getDefinitions() {
        try {
            if (this._definitions) return this._definitions;
            var cached = CACHE.get('badge_definitions', 3600000);
            if (cached) { this._definitions = cached; return cached; }
            var { data, error } = await window.supabaseClient.from('writer_badge_definitions')
                .select('*')
                .eq('is_active', true)
                .order('sort_order', { ascending: true });
            if (error) throw error;
            this._definitions = data || [];
            CACHE.set('badge_definitions', this._definitions);
            return this._definitions;
        } catch (err) {
            console.error('WriterBadges.getDefinitions:', err.message);
            return [];
        }
    },

    async getUserBadges(userId) {
        try {
            if (!userId) return [];
            var { data, error } = await window.supabaseClient.from('user_badges')
                .select('*, badge:writer_badge_definitions(*)')
                .eq('user_id', userId)
                .order('awarded_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('WriterBadges.getUserBadges:', err.message);
            return [];
        }
    },

    async checkMyBadges() {
        try {
            if (!Auth.isLoggedIn()) return null;
            var { data, error } = await window.supabaseClient.rpc('check_writer_badges', { p_user_id: Auth.getUserId() });
            if (error) throw error;
            if (data && data.new_badges && data.new_badges.length > 0) {
                var defs = await this.getDefinitions();
                data.new_badges.forEach(function(badgeId) {
                    var def = defs.find(function(d) { return d.id === badgeId; });
                    if (def) {
                        UI.toast('New Badge Earned: ' + def.name + '!', 'success');
                    }
                });
            }
            return data;
        } catch (err) {
            console.error('WriterBadges.checkMyBadges:', err.message);
            return null;
        }
    },

    getBadgeIcon(iconName) {
        var icons = {
            'pencil': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
            'book-open': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
            'heart': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
            'eye': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
            'star': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
            'trending-up': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
            'shield': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
            'cpu': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
            'award': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
            'gift': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
            'sunrise': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/><line x1="23" y1="22" x2="1" y2="22"/><polyline points="8 6 12 2 16 6"/></svg>',
            'crown': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 20h20l-2-8-4 4-4-8-4 8-4-4-2 8zm2-10l2 2 4-8 4 8 2-2 2 8H4l-2-8h2z"/></svg>',
            'message-circle': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
            'zap': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
            'diamond': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M2 9h20"/></svg>',
            'coffee': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
            'flame': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-3.866 0-7-2.686-7-6 0-2.418 1.511-4.497 2.5-5.5.987-.998 1.5-1.878 1.5-3.5 0 0 1 1.5 1 3.5 0 1.454-.478 2.49-1 3.5 2-2 4-5 4-8.5 0 0 3 2.5 3 6.5 0 .857-.143 1.665-.391 2.42C16.668 17.253 18 19 18 19s-1.5 4-6 4z"/></svg>',
            'thumbs-up': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>'
        };
        return icons[iconName] || icons.star;
    }
};


// ═══════════════════════════════════════
// MODULE: WriterLevels
// ═══════════════════════════════════════
const WriterLevels = {
    getLevel(xp) {
        xp = xp || 0;
        if (xp >= 1000) return 'elite';
        if (xp >= 500) return 'star_writer';
        if (xp >= 200) return 'author';
        if (xp >= 50) return 'contributor';
        return 'newcomer';
    },

    getLevelInfo(levelKey) {
        return WRITER_LEVELS[levelKey] || WRITER_LEVELS.newcomer;
    },

    getLevelProgress(xp) {
        xp = xp || 0;
        var currentLevel = this.getLevel(xp);
        var info = WRITER_LEVELS[currentLevel];
        var levels = Object.keys(WRITER_LEVELS);
        var idx = levels.indexOf(currentLevel);
        var nextLevel = levels[idx + 1] ? WRITER_LEVELS[levels[idx + 1]] : null;

        if (!nextLevel) return { current: info, next: null, progress: 100, xpToNext: 0 };

        var xpInLevel = xp - info.minXp;
        var xpRange = nextLevel.minXp - info.minXp;
        var progress = Math.min(100, Math.round((xpInLevel / xpRange) * 100));

        return {
            current: info,
            next: nextLevel,
            progress: progress,
            xpToNext: nextLevel.minXp - xp,
            nextLevelKey: levels[idx + 1]
        };
    },

    async getMyLevel() {
        try {
            if (!Auth.isLoggedIn()) return null;
            var { data, error } = await window.supabaseClient.from('users')
                .select('writer_level, writer_xp, badge_count')
                .eq('id', Auth.getUserId())
                .single();
            if (error) throw error;
            return data;
        } catch (err) {
            console.error('WriterLevels.getMyLevel:', err.message);
            return null;
        }
    }
};


// ═══════════════════════════════════════
// MODULE: OwnerDashboard
// ═══════════════════════════════════════
const _OwnerDashboard = {
    async getStats(days) {
        try {
            if (!Auth.hasRole('admin')) return null;
            var { data, error } = await window.supabaseClient.rpc('get_owner_dashboard', { p_days: days || 30 });
            if (error) throw error;
            return data;
        } catch (err) {
            console.error('OwnerDashboard.getStats:', err.message);
            return null;
        }
    },

    async getPendingWithdrawals() {
        try {
            if (!Auth.hasRole('admin')) return [];
            var { data, error } = await window.supabaseClient.from('withdrawal_requests')
                .select('*, user:users!withdrawal_requests_user_id_fkey(id, display_name, photo_url, email)')
                .eq('status', 'pending')
                .order('created_at', { ascending: true });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('OwnerDashboard.getPendingWithdrawals:', err.message);
            return [];
        }
    },

    async processWithdrawal(requestId, action, adminNote) {
        try {
            if (!Auth.hasRole('admin')) return false;

            if (action === 'reject') {
                // Atomic server-side: verify admin, update status, refund coins.
                var { error: rpcErr } = await window.supabaseClient.rpc('reject_withdrawal', {
                    p_request_id: requestId,
                    p_admin_note: Security.sanitize(adminNote || '')
                });
                if (rpcErr) throw rpcErr;
                UI.toast('Withdrawal rejected', 'success');
                return true;
            }

            // Approve path: no coin refund, just mark approved. The actual
            // payout is handled out-of-band by the operator.
            var { error } = await window.supabaseClient.from('withdrawal_requests').update({
                status: 'approved',
                admin_note: Security.sanitize(adminNote || ''),
                processed_at: new Date().toISOString(),
                processed_by: Auth.getUserId()
            }).eq('id', requestId);
            if (error) throw error;

            UI.toast('Withdrawal approved', 'success');
            return true;
        } catch (err) {
            console.error('OwnerDashboard.processWithdrawal:', err.message);
            UI.toast('Failed to process withdrawal', 'error');
            return false;
        }
    },

    async getLeaderboard(type, limit) {
        try {
            var { data, error } = await window.supabaseClient.rpc('get_fuel_leaderboard', {
                p_type: type || 'xp',
                p_limit: limit || 50
            });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('OwnerDashboard.getLeaderboard:', err.message);
            return [];
        }
    }
};


// ═══════════════════════════════════════
// MODULE: FuelCommunity (orchestrator)
// ═══════════════════════════════════════
const FuelCommunity = {
    initialized: false,

    async init() {
        if (this.initialized) return;
        this.initialized = true;

        // Initialize wallet for logged-in users
        if (Auth.isLoggedIn()) {
            Wallet.getBalance();
            // Check badges periodically
            setTimeout(function() { WriterBadges.checkMyBadges(); }, 5000);
        }
    },

    // Get writer profile with all gamification data
    async getWriterProfile(userId) {
        try {
            var { data, error } = await window.supabaseClient.rpc('get_writer_profile', { p_user_id: userId });
            if (error) throw error;
            return data;
        } catch (err) {
            console.error('FuelCommunity.getWriterProfile:', err.message);
            return null;
        }
    },

    // Quick access to current user's fuel data
    async getMyFuelData() {
        try {
            if (!Auth.isLoggedIn()) return null;
            var [wallet, level, badges] = await Promise.all([
                Wallet.getBalance(),
                WriterLevels.getMyLevel(),
                WriterBadges.getUserBadges(Auth.getUserId())
            ]);
            return { wallet: wallet, level: level, badges: badges };
        } catch (err) {
            console.error('FuelCommunity.getMyFuelData:', err.message);
            return null;
        }
    }
};

// Auto-init when auth is ready
if (typeof Auth !== 'undefined' && Auth.waitForAuth) {
    Auth.waitForAuth().then(function() { FuelCommunity.init(); });
} else {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() { FuelCommunity.init(); }, 1000);
    });
}
