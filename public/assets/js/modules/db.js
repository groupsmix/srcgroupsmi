// ─── Module: db ───
// Exports: DB

// CONTINUE IN NEXT MESSAGE
// ═══════════════════════════════════════
// MODULE 5: DB
// ═══════════════════════════════════════
const _DB = {
    groups: {
        async getApproved({ platform, category, country, sort, limit, offset } = {}) {
            try {
                const l = limit || CONFIG.perPage;
                const o = offset || 0;
                const s = sort || CONFIG.defaultSort;
                const cacheKey = 'groups_' + [platform, category, country, s, l, o].join('_');
                const cached = CACHE.get(cacheKey, CONFIG.cacheDurations.groups);
                if (cached) return cached;
                let q = window.supabaseClient.from('groups').select('*', { count: 'exact' }).eq('status', 'approved');
                if (platform) q = q.eq('platform', platform);
                if (category) q = q.eq('category', category);
                if (country) q = q.eq('country', country);
                const sortCol = s === 'newest' ? 'approved_at' : s === 'views' ? 'views' : s === 'rating' ? 'avg_rating' : s === 'trending' ? 'click_count' : 'ranking_score';
                q = q.order(sortCol, { ascending: false }).range(o, o + l - 1);
                const { data, error, count } = await q;
                if (error) throw error;
                const result = { data: data || [], count: count || 0 };
                CACHE.set(cacheKey, result);
                return result;
            } catch (err) { console.error('DB.groups.getApproved:', err.message); return { data: [], count: 0 }; }
        },
        async getOne(id) {
            try {
                if (!id) return null;
                const cached = CACHE.get('group_' + id, CONFIG.cacheDurations.group);
                if (cached) return cached;
                const { data, error } = await window.supabaseClient.from('groups').select('*').eq('id', id).single();
                if (error) throw error;
                CACHE.set('group_' + id, data);
                return data;
            } catch (err) { console.error('DB.groups.getOne:', err.message); return null; }
        },
        async getFeatured() {
            try {
                const cached = CACHE.get('featured_groups', CONFIG.cacheDurations.homepage);
                if (cached) return cached;
                const now = new Date().toISOString();
                const { data, error } = await window.supabaseClient.from('groups').select('*').eq('status', 'approved')
                    .in('vip_tier', ['diamond', 'global']).gt('vip_expiry', now)
                    .order('ranking_score', { ascending: false }).limit(6);
                if (error) throw error;
                CACHE.set('featured_groups', data || []);
                return data || [];
            } catch (err) { console.error('DB.groups.getFeatured:', err.message); return []; }
        },
        async getTrending() {
            try {
                const cached = CACHE.get('trending_groups', CONFIG.cacheDurations.homepage);
                if (cached) return cached;
                const { data, error } = await window.supabaseClient.from('groups').select('*').eq('status', 'approved')
                    .order('ranking_score', { ascending: false }).limit(12);
                if (error) throw error;
                CACHE.set('trending_groups', data || []);
                return data || [];
            } catch (err) { console.error('DB.groups.getTrending:', err.message); return []; }
        },
        async getNew() {
            try {
                const cached = CACHE.get('new_groups', CONFIG.cacheDurations.homepage);
                if (cached) return cached;
                const { data, error } = await window.supabaseClient.from('groups').select('*').eq('status', 'approved')
                    .order('approved_at', { ascending: false }).limit(12);
                if (error) throw error;
                CACHE.set('new_groups', data || []);
                return data || [];
            } catch (err) { console.error('DB.groups.getNew:', err.message); return []; }
        },
        async getByPlatform(platform, opts = {}) { return _DB.groups.getApproved({ ...opts, platform }); },
        async getByCategory(category, opts = {}) { return _DB.groups.getApproved({ ...opts, category }); },
        async getByCountry(country, opts = {}) { return _DB.groups.getApproved({ ...opts, country }); },
        async getSimilar(group) {
            try {
                if (!group) return [];
                const { data, error } = await window.supabaseClient.from('groups').select('*').eq('status', 'approved')
                    .neq('id', group.id).or('category.eq.' + group.category + ',platform.eq.' + group.platform)
                    .order('ranking_score', { ascending: false }).limit(6);
                if (error) throw error;
                return data || [];
            } catch (err) { console.error('DB.groups.getSimilar:', err.message); return []; }
        },
        async getByUser(userId) {
            try {
                if (!userId) return [];
                const { data, error } = await window.supabaseClient.from('groups').select('*')
                    .eq('submitter_uid', userId).order('submitted_at', { ascending: false });
                if (error) throw error;
                return data || [];
            } catch (err) { console.error('DB.groups.getByUser:', err.message); return []; }
        },
        async search(query, opts = {}) {
            try {
                if (!query || query.trim().length < 2) return { data: [], count: 0 };
                const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
                if (!words.length) return { data: [], count: 0 };
                const l = opts.limit || CONFIG.perPage;
                const o = opts.offset || 0;
                let q = window.supabaseClient.from('groups').select('*', { count: 'exact' }).eq('status', 'approved')
                    .overlaps('search_terms', words);
                if (opts.platform) q = q.eq('platform', opts.platform);
                if (opts.category) q = q.eq('category', opts.category);
                if (opts.country) q = q.eq('country', opts.country);
                const sortCol = opts.sort === 'newest' ? 'approved_at' : opts.sort === 'views' ? 'views' : opts.sort === 'rating' ? 'avg_rating' : 'ranking_score';
                q = q.order(sortCol, { ascending: false }).range(o, o + l - 1);
                const { data, error, count } = await q;
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.groups.search:', err.message); return { data: [], count: 0 }; }
        },
        async incrementViews(id) {
            try {
                const key = 'gm_view_' + id;
                const last = SafeStorage.get(key);
                if (last && Date.now() - parseInt(last, 10) < 3600000) return;
                await window.supabaseClient.rpc('increment_views', { p_group_id: id });
                SafeStorage.set(key, Date.now().toString());
            } catch (err) { console.error('DB.groups.incrementViews:', err.message); }
        },
        async incrementClicks(id) {
            try {
                const key = 'gm_click_' + id;
                const last = SafeStorage.get(key);
                if (last && Date.now() - parseInt(last, 10) < 1800000) return;
                await window.supabaseClient.rpc('increment_clicks', { p_group_id: id });
                SafeStorage.set(key, Date.now().toString());
            } catch (err) { console.error('DB.groups.incrementClicks:', err.message); }
        },
        async incrementReports(id) {
            try { await window.supabaseClient.rpc('increment_reports', { p_group_id: id }); }
            catch (err) { console.error('DB.groups.incrementReports:', err.message); }
        },
        async getHighReports({ limit } = {}) {
            try {
                const l = limit || 20;
                const { data, error } = await window.supabaseClient.from('groups').select('*').eq('status', 'approved')
                    .gt('reports', 2).order('reports', { ascending: false }).limit(l);
                if (error) throw error;
                return data || [];
            } catch (err) { console.error('DB.groups.getHighReports:', err.message); return []; }
        }
    },
    pending: {
        // Audit fix: Server-side validation is now enforced via the
        // sanitize_pending_submission() trigger (migration 026) which strips HTML,
        // validates name length, link format, category, and platform on INSERT.
        async submit(data) {
            try {
                // Issue 13 fix: guard against offline mutations to prevent silent failures
                if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
                if (!Auth.requireAuth()) return null;
                if (!Security.checkRateLimit('submit')) { UI.toast('Too many submissions. Please wait.', 'error'); return null; }
                var dupResult;
                try {
                    dupResult = await window.supabaseClient.rpc('check_duplicate_link', { p_link: data.link });
                } catch (dupErr) {
                    // If the RPC doesn't exist or fails, skip duplicate check gracefully
                    console.warn('DB.pending.submit: check_duplicate_link unavailable, skipping:', dupErr.message);
                    dupResult = { data: false };
                }
                if (dupResult && dupResult.data) { UI.toast('This group link has already been submitted.', 'warning'); return null; }
                var searchTerms = '';
                try {
                    searchTerms = Algorithms.generateSearchTerms(data.name, data.description, data.tags, data.category, data.platform);
                } catch (stErr) {
                    console.warn('DB.pending.submit: generateSearchTerms failed, using fallback:', stErr.message);
                    searchTerms = (data.name + ' ' + data.description + ' ' + data.category + ' ' + data.platform).toLowerCase();
                }
                const row = {
                    name: Security.sanitize(data.name), link: data.link, platform: data.platform,
                    platform_type: data.platform_type || 'group', category: data.category,
                    country: data.country || 'GLOBAL', city: Security.sanitize(data.city || ''),
                    language: data.language || 'English', description: Security.sanitize(data.description),
                    tags: Array.isArray(data.tags) ? data.tags.map(t => Security.sanitize(t)) : [],
                    search_terms: searchTerms, submitter_uid: Auth.getUserId(),
                    submitter_email: Auth.getEmail() || '', status: 'pending'
                };
                const { data: result, error } = await window.supabaseClient.from('pending').insert(row).select().single();
                if (error) {
                    console.error('DB.pending.submit insert error:', error.code, error.message, error.details, error.hint);
                    if (error.code === '42501' || (error.message && error.message.indexOf('policy') !== -1)) {
                        UI.toast('Permission denied. Please sign out and sign in again.', 'error');
                    } else if (error.code === '23505') {
                        UI.toast('This group has already been submitted.', 'warning');
                    } else {
                        UI.toast('Failed to submit: ' + (error.message || 'Unknown error'), 'error');
                    }
                    return null;
                }
                return result;
            } catch (err) { console.error('DB.pending.submit:', err.message); UI.toast('Failed to submit. Please try again later.', 'error'); return null; }
        },
        async getByUser(userId) {
            try {
                if (!userId) return [];
                const { data, error } = await window.supabaseClient.from('pending').select('*')
                    .eq('submitter_uid', userId).order('submitted_at', { ascending: false });
                if (error) throw error;
                return data || [];
            } catch (err) { console.error('DB.pending.getByUser:', err.message); return []; }
        },
        async getAll({ status, limit, offset } = {}) {
            try {
                if (!Auth.requireAdmin()) return { data: [], count: 0 };
                let q = window.supabaseClient.from('pending').select('*', { count: 'exact' });
                if (status) q = q.eq('status', status);
                q = q.order('submitted_at', { ascending: false });
                if (limit) q = q.range(offset || 0, (offset || 0) + limit - 1);
                const { data, error, count } = await q;
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.pending.getAll:', err.message); return { data: [], count: 0 }; }
        },
        async approve(id) {
            try {
                if (!Auth.requireAdmin()) return 'Permission denied. You must be an admin.';

                // Description padding is now handled atomically inside the
                // approve_group RPC (migration 026) to avoid the race condition
                // where a separate UPDATE + RPC could leave data inconsistent.

                // Try the RPC first
                const { error: rpcErr } = await window.supabaseClient.rpc('approve_group', { p_pending_id: id });
                if (!rpcErr) {
                    CACHE.clear();
                    _DB.admin.log('approve_group', { pending_id: id });
                    return true;
                }

                // RPC failed — log and try manual fallback
                console.warn('DB.pending.approve RPC failed, attempting manual fallback:', rpcErr.code, rpcErr.message);

                // Manual fallback: fetch pending row and insert into groups
                const { data: p, error: fetchErr } = await window.supabaseClient
                    .from('pending').select('*').eq('id', id).single();
                if (fetchErr || !p) {
                    return 'RPC failed: ' + rpcErr.message + ' | Could not fetch pending row';
                }

                // Pad description if needed (mirrors logic in approve_group RPC)
                var rawDesc = (p.description && p.description.trim().length > 0) ? p.description.trim() : '';
                var safeDesc = rawDesc;
                if (rawDesc.length < 20) {
                    safeDesc = rawDesc.length > 0
                        ? rawDesc + ' — Community group on GroupsMix.'
                        : 'Community group on GroupsMix.';
                }

                const now = new Date().toISOString();
                const groupRow = {
                    name: p.name,
                    link: p.link,
                    platform: p.platform,
                    platform_type: p.platform_type || 'group',
                    category: p.category,
                    country: p.country || 'GLOBAL',
                    city: p.city || '',
                    language: p.language || 'English',
                    description: safeDesc,
                    tags: p.tags || [],
                    search_terms: p.search_terms || '',
                    submitter_uid: p.submitter_uid,
                    submitter_email: p.submitter_email || '',
                    status: 'approved',
                    approved_at: now,
                    submitted_at: p.submitted_at || now,
                    views: 0,
                    clicks: 0,
                    reports: 0,
                    avg_rating: 0,
                    review_count: 0,
                    ranking_score: 0
                };
                const { error: insertErr } = await window.supabaseClient
                    .from('groups').insert(groupRow);
                if (insertErr) {
                    console.error('DB.pending.approve manual insert error:', insertErr.code, insertErr.message, insertErr.details, insertErr.hint);
                    return 'RPC failed: ' + rpcErr.message + ' | Manual insert also failed: ' + insertErr.message;
                }

                // Mark the pending row as approved
                await window.supabaseClient.from('pending')
                    .update({ status: 'approved', description: safeDesc }).eq('id', id);

                CACHE.clear();
                _DB.admin.log('approve_group', { pending_id: id, method: 'manual_fallback' });
                return true;
            } catch (err) { console.error('DB.pending.approve:', err.message); return err.message || 'Unknown error'; }
        },
        async reject(id, reason) {
            try {
                if (!Auth.requireAdmin()) return 'Permission denied. You must be an admin.';
                const { error } = await window.supabaseClient.from('pending').update({ status: 'rejected' }).eq('id', id);
                if (error) {
                    console.error('DB.pending.reject error:', error.code, error.message, error.details, error.hint);
                    return error.message || 'Reject update failed';
                }
                _DB.admin.log('reject_group', { pending_id: id, reason });
                return true;
            } catch (err) { console.error('DB.pending.reject:', err.message); return err.message || 'Unknown error'; }
        }
    },
    reviews: {
        async getByGroup(groupId, { limit, offset } = {}) {
            try {
                if (!groupId) return { data: [], count: 0 };
                const l = limit || 10;
                const o = offset || 0;
                const { data, error, count } = await window.supabaseClient.from('reviews').select('*', { count: 'exact' })
                    .eq('group_id', groupId).order('created_at', { ascending: false }).range(o, o + l - 1);
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.reviews.getByGroup:', err.message); return { data: [], count: 0 }; }
        },
        async submit({ groupId, rating, text }) {
            try {
                // Issue 13 fix: guard against offline mutations to prevent silent failures
                if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
                if (!Auth.requireAuth()) return null;
                if (!Security.checkRateLimit('review')) { UI.toast('Too many reviews. Please wait.', 'error'); return null; }
                const hasReviewed = await _DB.reviews.hasReviewed(Auth.getUserId(), groupId);
                if (hasReviewed) { UI.toast('You have already reviewed this group.', 'warning'); return null; }
                const row = {
                    group_id: groupId, uid: Auth.getUserId(),
                    display_name: Auth.getUser()?.display_name || 'Anonymous',
                    photo_url: Auth.getUser()?.photo_url || '',
                    rating: Math.max(1, Math.min(5, parseInt(rating, 10) || 1)),
                    text: Security.sanitize(text || '').slice(0, 500)
                };
                const { data, error } = await window.supabaseClient.from('reviews').insert(row).select().single();
                if (error) throw error;
                try { await window.supabaseClient.rpc('update_review_stats', { p_group_id: groupId, p_new_rating: row.rating }); } catch (err) { console.error('DB.reviews.submit update_review_stats:', err.message); }
                try { await _DB.user.addGXP(Auth.getUserId(), 10); } catch (err) { console.error('DB.reviews.submit addGXP:', err.message); }
                CACHE.remove('group_' + groupId);
                return data;
            } catch (err) { console.error('DB.reviews.submit:', err.message); UI.toast('Failed to submit review.', 'error'); return null; }
        },
        async hasReviewed(userId, groupId) {
            try {
                if (!userId || !groupId) return false;
                const { data } = await window.supabaseClient.from('reviews').select('id').eq('uid', userId).eq('group_id', groupId).limit(1);
                return Array.isArray(data) && data.length > 0;
            } catch (err) { console.error('DB.reviews.hasReviewed:', err.message); return false; }
        }
    },
    reports: {
        async submit({ groupId, reason, details }) {
            try {
                // Issue 13 fix: guard against offline mutations to prevent silent failures
                if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
                if (!Auth.requireAuth()) return null;
                if (!Security.checkRateLimit('report')) { UI.toast('Too many reports. Please wait.', 'error'); return null; }
                const row = { group_id: groupId, reporter_uid: Auth.getUserId(), reason: Security.sanitize(reason || ''), details: Security.sanitize(details || '').slice(0, 1000) };
                const { data, error } = await window.supabaseClient.from('reports').insert(row).select().single();
                if (error) throw error;
                try { await _DB.groups.incrementReports(groupId); } catch (err) { console.error('DB.reports.submit incrementReports:', err.message); }
                return data;
            } catch (err) { console.error('DB.reports.submit:', err.message); UI.toast('Failed to submit report.', 'error'); return null; }
        },
        async getAll({ status, limit, offset } = {}) {
            try {
                if (!Auth.requireAdmin()) return { data: [], count: 0 };
                let q = window.supabaseClient.from('reports').select('*', { count: 'exact' });
                if (status) q = q.eq('status', status);
                q = q.order('created_at', { ascending: false });
                if (limit) q = q.range(offset || 0, (offset || 0) + limit - 1);
                const { data, error, count } = await q;
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.reports.getAll:', err.message); return { data: [], count: 0 }; }
        },
        async resolve(id, action) {
            try {
                if (!Auth.requireAdmin()) return false;
                const { error } = await window.supabaseClient.from('reports').update({ status: 'resolved', action: Security.sanitize(action || ''), resolved_at: new Date().toISOString(), resolved_by: Auth.getUserId() }).eq('id', id);
                if (error) throw error;
                _DB.admin.log('resolve_report', { report_id: id, action });
                return true;
            } catch (err) { console.error('DB.reports.resolve:', err.message); return false; }
        }
    },
    payments: {
        async submit(data) {
            try {
                // Issue 13 fix: guard against offline mutations to prevent silent failures
                if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
                if (!Auth.requireAuth()) return null;
                if (!Security.checkRateLimit('payment')) { UI.toast('Too many payment attempts. Please wait.', 'error'); return null; }
                const row = {
                    uid: Auth.getUserId(), email: Auth.getEmail() || '', type: data.type || '',
                    service: data.service || '', group_id: data.group_id || null,
                    currency: data.currency || '', amount: parseFloat(data.amount) || 0,
                    tx_hash: Security.sanitize(data.tx_hash || ''), wallet_address: data.wallet_address || '',
                    status: 'pending'
                };
                const { data: result, error } = await window.supabaseClient.from('payments').insert(row).select().single();
                if (error) throw error;
                return result;
            } catch (err) {
                console.error('DB.payments.submit:', err.message);
                const failed = SafeStorage.getJSON('gm_failed_payments', []);
                failed.push({ ...data, timestamp: Date.now() });
                SafeStorage.setJSON('gm_failed_payments', failed);
                UI.toast('Payment recorded locally. Please contact support.', 'warning');
                return null;
            }
        },
        async getByUser(userId) {
            try {
                if (!userId) return [];
                const { data, error } = await window.supabaseClient.from('payments').select('*').eq('uid', userId).order('created_at', { ascending: false });
                if (error) throw error;
                return data || [];
            } catch (err) { console.error('DB.payments.getByUser:', err.message); return []; }
        },
        async getAll({ status, limit, offset } = {}) {
            try {
                if (!Auth.requireAdmin()) return { data: [], count: 0 };
                let q = window.supabaseClient.from('payments').select('*', { count: 'exact' });
                if (status) q = q.eq('status', status);
                q = q.order('created_at', { ascending: false });
                if (limit) q = q.range(offset || 0, (offset || 0) + limit - 1);
                const { data, error, count } = await q;
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.payments.getAll:', err.message); return { data: [], count: 0 }; }
        },
        async verify(id) {
            try {
                if (!Auth.requireAdmin()) return false;
                const { error } = await window.supabaseClient.from('payments').update({ status: 'verified', verified_at: new Date().toISOString(), verified_by: Auth.getUserId() }).eq('id', id);
                if (error) throw error;
                _DB.admin.log('verify_payment', { payment_id: id });
                return true;
            } catch (err) { console.error('DB.payments.verify:', err.message); return false; }
        },
        async reject(id, reason) {
            try {
                if (!Auth.requireAdmin()) return false;
                const { error } = await window.supabaseClient.from('payments').update({ status: 'rejected', rejection_reason: Security.sanitize(reason || '') }).eq('id', id);
                if (error) throw error;
                _DB.admin.log('reject_payment', { payment_id: id, reason });
                return true;
            } catch (err) { console.error('DB.payments.reject:', err.message); return false; }
        }
    },
    notifications: {
        async getByUser(userId, { limit, offset } = {}) {
            try {
                if (!userId) return { data: [], count: 0 };
                const l = limit || 20;
                const o = offset || 0;
                const { data, error, count } = await window.supabaseClient.from('notifications').select('*', { count: 'exact' })
                    .eq('uid', userId).order('created_at', { ascending: false }).range(o, o + l - 1);
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.notifications.getByUser:', err.message); return { data: [], count: 0 }; }
        },
        async markRead(id) {
            try {
                const { error } = await window.supabaseClient.from('notifications').update({ read: true }).eq('id', id).eq('read', false);
                if (error) throw error;
                if (Auth.getUserId()) {
                    await window.supabaseClient.from('users').update({ unread_notifications: Math.max(0, (Auth.getUser()?.unread_notifications || 1) - 1) }).eq('id', Auth.getUserId());
                }
                return true;
            } catch (err) { console.error('DB.notifications.markRead:', err.message); return false; }
        },
        async markAllRead(userId) {
            try {
                if (!userId) return false;
                const { error } = await window.supabaseClient.from('notifications').update({ read: true }).eq('uid', userId).eq('read', false);
                if (error) throw error;
                await window.supabaseClient.from('users').update({ unread_notifications: 0 }).eq('id', userId);
                return true;
            } catch (err) { console.error('DB.notifications.markAllRead:', err.message); return false; }
        },
        async create({ uid, type, title, message, link }) {
            try {
                if (!uid) return null;
                const { data, error } = await window.supabaseClient.from('notifications').insert({
                    uid, type: type || 'info', title: title || '', message: message || '', link: link || ''
                }).select().single();
                if (error) throw error;
                await window.supabaseClient.from('users').update({ unread_notifications: (Auth.getUser()?.unread_notifications || 0) + 1 }).eq('id', uid);
                return data;
            } catch (err) { console.error('DB.notifications.create:', err.message); return null; }
        },
        async getUnreadCount(userId) {
            try {
                if (!userId) return 0;
                const { count, error } = await window.supabaseClient.from('notifications').select('id', { count: 'exact', head: true })
                    .eq('uid', userId).eq('read', false);
                if (error) throw error;
                return count || 0;
            } catch (err) { console.error('DB.notifications.getUnreadCount:', err.message); return 0; }
        }
    },
    user: {
        async getProfile(authId) {
            try {
                if (!authId) return null;
                const { data, error } = await window.supabaseClient.from('users').select('*').eq('auth_id', authId).single();
                if (error) throw error;
                return data;
            } catch (err) { console.error('DB.user.getProfile:', err.message); return null; }
        },
        async createProfile(profileData) {
            try {
                const { data, error } = await window.supabaseClient.from('users').insert(profileData).select().single();
                if (error) throw error;
                try { await window.supabaseClient.rpc('increment_user_count'); } catch (err) { console.error('DB.user.createProfile increment_user_count:', err.message); }
                return data;
            } catch (err) { console.error('DB.user.createProfile:', err.message); return null; }
        },
        async updateProfile(userId, updates) {
            try {
                if (!userId) return false;
                const allowed = {};
                if (updates.display_name !== undefined) allowed.display_name = Security.sanitize(updates.display_name);
                if (updates.photo_url !== undefined) allowed.photo_url = Security.sanitize(updates.photo_url);
                const { error } = await window.supabaseClient.from('users').update(allowed).eq('id', userId);
                if (error) throw error;
                CACHE.remove('user_profile');
                return true;
            } catch (err) { console.error('DB.user.updateProfile:', err.message); return false; }
        },
        async addGXP(userId, amount) {
            try {
                if (!userId || !amount) return;
                await window.supabaseClient.rpc('add_gxp', { p_user_id: userId, p_amount: amount });
            } catch (err) { console.error('DB.user.addGXP:', err.message); }
        },
        async getLeaderboard({ limit, offset } = {}) {
            try {
                const cached = CACHE.get('leaderboard', CONFIG.cacheDurations.lists);
                if (cached) return cached;
                const l = limit || 50;
                const o = offset || 0;
                const { data, error } = await window.supabaseClient.from('users')
                    .select('id, display_name, photo_url, gxp, level')
                    .order('gxp', { ascending: false }).range(o, o + l - 1);
                if (error) throw error;
                CACHE.set('leaderboard', data || []);
                return data || [];
            } catch (err) { console.error('DB.user.getLeaderboard:', err.message); return []; }
        },
        async dailyLoginCheck(userId) {
            try {
                if (!userId) return;
                const today = new Date().toISOString().split('T')[0];
                const key = 'gm_last_daily_' + userId;
                if (SafeStorage.get(key) === today) return;
                await _DB.user.addGXP(userId, 3);
                await window.supabaseClient.from('users').update({ last_login: new Date().toISOString() }).eq('id', userId);
                SafeStorage.set(key, today);
            } catch (err) { console.error('DB.user.dailyLoginCheck:', err.message); }
        }
    },
    contacts: {
        async submit(data) {
            try {
                // Issue 13 fix: guard against offline mutations to prevent silent failures
                if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
                if (!Security.checkRateLimit('contact')) { UI.toast('Too many messages. Please wait.', 'error'); return null; }
                const row = {
                    name: Security.sanitize(data.name || ''), email: data.email || '',
                    subject: Security.sanitize(data.subject || ''), message: Security.sanitize(data.message || ''),
                    uid: Auth.getUserId() || null
                };
                const { data: result, error } = await window.supabaseClient.from('contacts').insert(row).select().single();
                if (error) throw error;
                return result;
            } catch (err) { console.error('DB.contacts.submit:', err.message); UI.toast('Failed to send message.', 'error'); return null; }
        }
    },
    donations: {
        async submit(data) {
            try {
                // Issue 13 fix: guard against offline mutations to prevent silent failures
                if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
                if (!Security.checkRateLimit('payment')) { UI.toast('Too many attempts. Please wait.', 'error'); return null; }
                const row = {
                    uid: Auth.getUserId() || null, display_name: Security.sanitize(data.display_name || 'Anonymous'),
                    message: Security.sanitize(data.message || '').slice(0, 500),
                    currency: data.currency || '', amount: parseFloat(data.amount) || 0,
                    tx_hash: Security.sanitize(data.tx_hash || ''), status: 'pending'
                };
                const { data: result, error } = await window.supabaseClient.from('donations').insert(row).select().single();
                if (error) throw error;
                return result;
            } catch (err) { console.error('DB.donations.submit:', err.message); return null; }
        },
        async getVerified({ limit } = {}) {
            try {
                const cached = CACHE.get('donations_verified', CONFIG.cacheDurations.donations);
                if (cached) return cached;
                const { data, error } = await window.supabaseClient.from('donations').select('*').eq('status', 'verified')
                    .order('created_at', { ascending: false }).limit(limit || 20);
                if (error) throw error;
                CACHE.set('donations_verified', data || []);
                return data || [];
            } catch (err) { console.error('DB.donations.getVerified:', err.message); return []; }
        }
    },
    articles: {
        async getPublished({ limit, offset } = {}) {
            try {
                const cached = CACHE.get('articles', CONFIG.cacheDurations.articles);
                if (cached && !offset) return cached;
                const l = limit || CONFIG.perPage;
                const o = offset || 0;
                const { data, error, count } = await window.supabaseClient.from('articles').select('*', { count: 'exact' })
                    .eq('status', 'published').order('published_at', { ascending: false }).range(o, o + l - 1);
                if (error) throw error;
                const result = { data: data || [], count: count || 0 };
                if (!offset) CACHE.set('articles', result);
                return result;
            } catch (err) { console.error('DB.articles.getPublished:', err.message); return { data: [], count: 0 }; }
        },
        async getBySlug(slug) {
            try {
                if (!slug) return null;
                const cached = CACHE.get('article_' + slug, CONFIG.cacheDurations.articles);
                if (cached) return cached;
                const { data, error } = await window.supabaseClient.from('articles').select('*').eq('slug', slug).single();
                if (error) throw error;
                CACHE.set('article_' + slug, data);
                return data;
            } catch (err) { console.error('DB.articles.getBySlug:', err.message); return null; }
        },
        async incrementViews(id) {
            try { await window.supabaseClient.rpc('increment_article_views', { p_article_id: id }); }
            catch (err) { console.error('DB.articles.incrementViews:', err.message); }
        },
        async getAll() {
            try {
                if (!Auth.requireAdmin()) return { data: [] };
                const { data, error } = await window.supabaseClient.from('articles').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                return { data: data || [] };
            } catch (err) { console.error('DB.articles.getAll:', err.message); return { data: [] }; }
        },
        async create(articleData) {
            try {
                if (!Auth.requireAdmin()) return null;
                if (articleData.published !== undefined) {
                    articleData.status = articleData.published ? 'published' : 'draft';
                    delete articleData.published;
                }
                articleData.published_at = new Date().toISOString();
                const { data, error } = await window.supabaseClient.from('articles').insert(articleData).select().single();
                if (error) throw error;
                return data;
            } catch (err) { console.error('DB.articles.create:', err.message); return null; }
        },
        async update(id, articleData) {
            try {
                if (!Auth.requireAdmin()) return null;
                if (articleData.published !== undefined) {
                    articleData.status = articleData.published ? 'published' : 'draft';
                    delete articleData.published;
                }
                const { data, error } = await window.supabaseClient.from('articles').update(articleData).eq('id', id).select().single();
                if (error) throw error;
                return data;
            } catch (err) { console.error('DB.articles.update:', err.message); return null; }
        }
    },
    ads: {
        _seenKey: 'gm_seen_ads',
        _getSeenIds() {
            try {
                const raw = sessionStorage.getItem(this._seenKey);
                return raw ? JSON.parse(raw) : [];
            } catch (_err) { return []; }
        },
        _markSeen(adId) {
            try {
                const seen = this._getSeenIds();
                if (!seen.includes(adId)) seen.push(adId);
                sessionStorage.setItem(this._seenKey, JSON.stringify(seen));
            } catch (err) { console.error('DB.ads._markSeen:', err.message); }
        },
        async getActive(position, options) {
            try {
                const category = (options && options.category) ? options.category : '';
                const cacheKey = 'ads_' + position + (category ? '_' + category : '');
                const cached = CACHE.get(cacheKey, CONFIG.cacheDurations.ads);
                if (cached) return cached;
                const now = new Date().toISOString();
                const limit = CONFIG.adSlotLimits[position] || 2;
                var allAds = [];
                if (category) {
                    const { data: nicheAds, error: nicheErr } = await window.supabaseClient.from('ads').select('*')
                        .eq('status', 'active').eq('position', position).eq('target_category', category)
                        .gt('expires_at', now).limit(limit);
                    if (!nicheErr && nicheAds) allAds = nicheAds;
                    if (allAds.length < limit) {
                        const nicheIds = allAds.map(function(a) { return a.id; });
                        var q = window.supabaseClient.from('ads').select('*')
                            .eq('status', 'active').eq('position', position)
                            .gt('expires_at', now).limit(limit - allAds.length);
                        if (nicheIds.length > 0) {
                            q = q.not('id', 'in', '(' + nicheIds.join(',') + ')');
                        }
                        const { data: fallback, error: fbErr } = await q;
                        if (!fbErr && fallback) allAds = allAds.concat(fallback);
                    }
                } else {
                    const { data, error } = await window.supabaseClient.from('ads').select('*')
                        .eq('status', 'active').eq('position', position)
                        .gt('expires_at', now).limit(limit * 3);
                    if (error) throw error;
                    allAds = data || [];
                }
                var qualityAds = allAds.filter(function(ad) {
                    var trustScore = ad.trust_score !== undefined ? (Number.isNaN(ad.trust_score) ? 0 : Number(ad.trust_score)) : 100;
                    return trustScore >= 70;
                });
                var seenIds = this._getSeenIds();
                var unseenAds = qualityAds.filter(function(ad) { return seenIds.indexOf(ad.id) === -1; });
                if (unseenAds.length === 0) {
                    try { sessionStorage.removeItem(this._seenKey); } catch (_e) { /* ok */ }
                    unseenAds = qualityAds;
                }
                for (var i = unseenAds.length - 1; i > 0; i--) {
                    var j = Math.floor(Math.random() * (i + 1));
                    var temp = unseenAds[i];
                    unseenAds[i] = unseenAds[j];
                    unseenAds[j] = temp;
                }
                var result = unseenAds.slice(0, limit);
                CACHE.set(cacheKey, result);
                return result;
            } catch (err) { console.error('DB.ads.getActive:', err.message); return []; }
        },
        async trackImpression(adId) {
            try {
                if (!adId) return;
                this._markSeen(adId);
                await window.supabaseClient.rpc('increment_ad_impressions', { p_ad_id: adId });
            } catch (err) { console.error('DB.ads.trackImpression:', err.message); }
        },
        async trackClick(adId) {
            try {
                if (!adId) return;
                await window.supabaseClient.rpc('increment_ad_clicks', { p_ad_id: adId });
            } catch (err) { console.error('DB.ads.trackClick:', err.message); }
        },
        async incrementImpressions(id) {
            try { await window.supabaseClient.rpc('increment_ad_impressions', { p_ad_id: id }); } catch (err) { console.error('DB.ads.incrementImpressions:', err.message); }
        },
        async incrementClicks(id) {
            try { await window.supabaseClient.rpc('increment_ad_clicks', { p_ad_id: id }); } catch (err) { console.error('DB.ads.incrementClicks:', err.message); }
        },
        async getInsights(userId) {
            try {
                if (!userId) return [];
                const { data, error } = await window.supabaseClient.rpc('get_ad_insights', { p_uid: userId });
                if (error) throw error;
                return Array.isArray(data) ? data : [];
            } catch (err) { console.error('DB.ads.getInsights:', err.message); return []; }
        }
    },
    stats: {
        async getGlobal() {
            try {
                const cached = CACHE.get('stats_global', CONFIG.cacheDurations.stats);
                if (cached) return cached;
                // Try dedicated stats table first
                const { data, error } = await window.supabaseClient.from('stats').select('*').eq('key', 'global').maybeSingle();
                if (!error && data && (data.total_groups || data.total_users)) {
                    CACHE.set('stats_global', data);
                    return data;
                }
                // Fallback: compute stats from actual tables when stats row is missing or empty
                const [groupsRes, usersRes] = await Promise.allSettled([
                    window.supabaseClient.from('groups').select('country', { count: 'exact', head: false }).eq('status', 'approved'),
                    window.supabaseClient.from('users').select('id', { count: 'exact', head: true })
                ]);
                var totalGroups = 0, totalUsers = 0, totalCountries = 0;
                if (groupsRes.status === 'fulfilled' && !groupsRes.value.error) {
                    totalGroups = groupsRes.value.count || (groupsRes.value.data ? groupsRes.value.data.length : 0);
                    // Count unique countries from group data
                    var countries = new Set();
                    (groupsRes.value.data || []).forEach(function(g) { if (g.country && g.country !== 'GLOBAL') countries.add(g.country); });
                    totalCountries = countries.size || 1; // at least 1 if there are groups
                }
                if (usersRes.status === 'fulfilled' && !usersRes.value.error) {
                    totalUsers = usersRes.value.count || 0;
                }
                var computed = { total_groups: totalGroups, total_users: totalUsers, total_countries: totalCountries };
                if (totalGroups || totalUsers) CACHE.set('stats_global', computed);
                return computed;
            } catch (err) { console.error('DB.stats.getGlobal:', err.message); return null; }
        }
    },
    config: {
        async getSettings() {
            try {
                const cached = CACHE.get('settings', CONFIG.cacheDurations.settings);
                if (cached) return cached;
                const { data, error } = await window.supabaseClient.from('config').select('value').eq('key', 'settings').single();
                if (error) throw error;
                CACHE.set('settings', data?.value || {});
                return data?.value || {};
            } catch (err) { console.error('DB.config.getSettings:', err.message); return {}; }
        },
        async updateSettings(value) {
            try {
                if (!Auth.requireAdmin()) return false;
                const { error } = await window.supabaseClient.from('config').update({ value }).eq('key', 'settings');
                if (error) throw error;
                CACHE.remove('settings');
                _DB.admin.log('update_settings', { keys: Object.keys(value) });
                return true;
            } catch (err) { console.error('DB.config.updateSettings:', err.message); return false; }
        }
    },
    admin: {
        async log(action, details) {
            try {
                await window.supabaseClient.from('admin_log').insert({
                    action, details: details || {}, admin_uid: Auth.getUserId(), admin_email: Auth.getEmail() || ''
                });
            } catch (err) { console.error('DB.admin.log:', err.message); }
        },
        async getLog({ limit, offset } = {}) {
            try {
                if (!Auth.requireAdmin()) return { data: [], count: 0 };
                const l = limit || CONFIG.adminPerPage;
                const o = offset || 0;
                const { data, error, count } = await window.supabaseClient.from('admin_log').select('*', { count: 'exact' })
                    .order('created_at', { ascending: false }).range(o, o + l - 1);
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.admin.getLog:', err.message); return { data: [], count: 0 }; }
        },
        async getStats() {
            try {
                if (!Auth.requireAdmin()) return null;
                const [groups, pending, users, payments, reports] = await Promise.all([
                    window.supabaseClient.from('groups').select('id', { count: 'exact', head: true }),
                    window.supabaseClient.from('pending').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
                    window.supabaseClient.from('users').select('id', { count: 'exact', head: true }),
                    window.supabaseClient.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
                    window.supabaseClient.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending')
                ]);
                return { totalGroups: groups.count || 0, pendingGroups: pending.count || 0, totalUsers: users.count || 0, pendingPayments: payments.count || 0, pendingReports: reports.count || 0 };
            } catch (err) { console.error('DB.admin.getStats:', err.message); return null; }
        },
        async getUsers({ limit, offset, search } = {}) {
            try {
                if (!Auth.requireAdmin()) return { data: [], count: 0 };
                const l = limit || CONFIG.adminPerPage;
                const o = offset || 0;
                let q = window.supabaseClient.from('users').select('*', { count: 'exact' });
                if (search) q = q.ilike('email', '%' + search + '%');
                q = q.order('created_at', { ascending: false }).range(o, o + l - 1);
                const { data, error, count } = await q;
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.admin.getUsers:', err.message); return { data: [], count: 0 }; }
        },
        async updateUser(userId, updates) {
            try {
                if (!Auth.requireAdmin()) return false;
                const { error } = await window.supabaseClient.from('users').update(updates).eq('id', userId);
                if (error) throw error;
                _DB.admin.log('update_user', { user_id: userId, updates });
                return true;
            } catch (err) { console.error('DB.admin.updateUser:', err.message); return false; }
        },
        async updateUserRole(userId, newRole) {
            try {
                if (!Auth.requireAdmin()) return false;
                const validRoles = ['admin', 'moderator', 'editor', 'user'];
                if (!validRoles.includes(newRole)) { UI.toast('Invalid role', 'error'); return false; }
                const { error } = await window.supabaseClient.rpc('update_user_role', { p_user_id: userId, p_new_role: newRole });
                if (error) throw error;
                _DB.admin.log('update_user_role', { user_id: userId, new_role: newRole });
                return true;
            } catch (err) { console.error('DB.admin.updateUserRole:', err.message); UI.toast(err.message || 'Failed to update role', 'error'); return false; }
        },
        async getContacts({ limit, offset } = {}) {
            try {
                if (!Auth.requireAdmin()) return { data: [], count: 0 };
                const l = limit || CONFIG.adminPerPage;
                const o = offset || 0;
                const { data, error, count } = await window.supabaseClient.from('contacts').select('*', { count: 'exact' })
                    .order('created_at', { ascending: false }).range(o, o + l - 1);
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.admin.getContacts:', err.message); return { data: [], count: 0 }; }
        },
        async updateContact(id, updates) {
            try {
                if (!Auth.requireAdmin()) return false;
                const { error } = await window.supabaseClient.from('contacts').update(updates).eq('id', id);
                if (error) throw error;
                return true;
            } catch (err) { console.error('DB.admin.updateContact:', err.message); return false; }
        },
        async getDonations({ limit, offset } = {}) {
            try {
                if (!Auth.requireAdmin()) return { data: [], count: 0 };
                const l = limit || CONFIG.adminPerPage;
                const o = offset || 0;
                const { data, error, count } = await window.supabaseClient.from('donations').select('*', { count: 'exact' })
                    .order('created_at', { ascending: false }).range(o, o + l - 1);
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.admin.getDonations:', err.message); return { data: [], count: 0 }; }
        },
        async updateDonation(id, updates) {
            try {
                if (!Auth.requireAdmin()) return false;
                const { error } = await window.supabaseClient.from('donations').update(updates).eq('id', id);
                if (error) throw error;
                _DB.admin.log('update_donation', { donation_id: id });
                return true;
            } catch (err) { console.error('DB.admin.updateDonation:', err.message); return false; }
        }
    }
};

