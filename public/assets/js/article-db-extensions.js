/**
 * Article DB Extensions — article-db-extensions.js
 * Extends DB.articles with new social platform methods
 * Adds DB.follows, DB.articleCategories, DB.notifications modules
 *
 * MUST be loaded AFTER app.js
 *
 * Dependencies: DB (app.js), Auth (app.js), Security (app.js), CACHE (app.js)
 */

/* global DB, Auth, Security, CACHE, CONFIG */

// ═══════════════════════════════════════
// EXTEND DB.articles with new methods
// ═══════════════════════════════════════

/**
 * Create article as regular user (not admin-only)
 */
DB.articles.createUserArticle = async function (articleData) {
    try {
        if (!Auth.isLoggedIn()) { return null; }
        if (!Security.checkRateLimit('article_create')) { return null; }

        const sanitized = {
            title: Security.sanitize(articleData.title || '').slice(0, 200),
            slug: articleData.slug || '',
            excerpt: Security.sanitize(articleData.excerpt || '').slice(0, 300),
            content: articleData.content || '',
            cover_image: articleData.cover_image || '',
            category: articleData.category || 'general',
            tags: Array.isArray(articleData.tags) ? articleData.tags.map(t => Security.sanitize(t).slice(0, 30)) : [],
            language: articleData.language || 'en',
            status: articleData.status || 'draft',
            moderation_status: 'pending',
            user_id: Auth.getAuthId(),
            source: 'user',
            author_name: articleData.author_name || '',
            author_avatar: articleData.author_avatar || '',
            author_bio: articleData.author_bio || '',
            published_at: articleData.status === 'published' ? new Date().toISOString() : null
        };

        // Generate slug from title if not provided
        if (!sanitized.slug && sanitized.title) {
            sanitized.slug = sanitized.title.toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .slice(0, 100) + '-' + Date.now().toString(36);
        }

        const { data, error } = await window.supabaseClient
            .from('articles')
            .insert(sanitized)
            .select()
            .single();

        if (error) throw error;
        CACHE.remove('articles');
        return data;
    } catch (err) {
        console.error('DB.articles.createUserArticle:', err.message);
        return null;
    }
};

/**
 * Update article as owner
 */
DB.articles.updateUserArticle = async function (id, articleData) {
    try {
        if (!Auth.isLoggedIn()) return null;

        const updates = {};
        if (articleData.title !== undefined) updates.title = Security.sanitize(articleData.title).slice(0, 200);
        if (articleData.excerpt !== undefined) updates.excerpt = Security.sanitize(articleData.excerpt).slice(0, 300);
        if (articleData.content !== undefined) updates.content = articleData.content;
        if (articleData.cover_image !== undefined) updates.cover_image = articleData.cover_image;
        if (articleData.category !== undefined) updates.category = articleData.category;
        if (articleData.tags !== undefined) updates.tags = Array.isArray(articleData.tags) ? articleData.tags.map(t => Security.sanitize(t).slice(0, 30)) : [];
        if (articleData.language !== undefined) updates.language = articleData.language;
        if (articleData.status !== undefined) {
            updates.status = articleData.status;
            if (articleData.status === 'published') {
                updates.published_at = new Date().toISOString();
                updates.moderation_status = 'pending';
            }
        }
        if (articleData.slug !== undefined) updates.slug = articleData.slug;
        if (articleData.author_name !== undefined) updates.author_name = articleData.author_name;
        if (articleData.author_avatar !== undefined) updates.author_avatar = articleData.author_avatar;
        if (articleData.author_bio !== undefined) updates.author_bio = articleData.author_bio;
        if (articleData.moderation_status !== undefined) updates.moderation_status = articleData.moderation_status;
        if (articleData.moderation_score !== undefined) updates.moderation_score = articleData.moderation_score;
        if (articleData.moderation_note !== undefined) updates.moderation_note = articleData.moderation_note;
        if (articleData.reading_time !== undefined) updates.reading_time = articleData.reading_time;

        updates.updated_at = new Date().toISOString();

        const { data, error } = await window.supabaseClient
            .from('articles')
            .update(updates)
            .eq('id', id)
            .eq('user_id', Auth.getAuthId()) // Only owner can update
            .select()
            .single();

        if (error) throw error;
        CACHE.remove('articles');
        return data;
    } catch (err) {
        console.error('DB.articles.updateUserArticle:', err.message);
        return null;
    }
};

/**
 * Get user's own articles (all statuses)
 */
DB.articles.getMyArticles = async function ({ limit, offset } = {}) {
    try {
        if (!Auth.isLoggedIn()) return { data: [], count: 0 };
        const l = limit || 20;
        const o = offset || 0;

        const { data, error, count } = await window.supabaseClient
            .from('articles')
            .select('*', { count: 'exact' })
            .eq('user_id', Auth.getAuthId())
            .order('created_at', { ascending: false })
            .range(o, o + l - 1);

        if (error) throw error;
        return { data: data || [], count: count || 0 };
    } catch (err) {
        console.error('DB.articles.getMyArticles:', err.message);
        return { data: [], count: 0 };
    }
};

/**
 * Get articles by category
 */
DB.articles.getByCategory = async function (category, { limit, offset } = {}) {
    try {
        const l = limit || 12;
        const o = offset || 0;

        const { data, error, count } = await window.supabaseClient
            .from('articles')
            .select('*', { count: 'exact' })
            .eq('status', 'published')
            .eq('moderation_status', 'approved')
            .eq('category', category)
            .order('published_at', { ascending: false })
            .range(o, o + l - 1);

        if (error) throw error;
        return { data: data || [], count: count || 0 };
    } catch (err) {
        console.error('DB.articles.getByCategory:', err.message);
        return { data: [], count: 0 };
    }
};

/**
 * Get trending articles (high engagement in last 7 days)
 */
DB.articles.getTrendingArticles = async function ({ limit, offset } = {}) {
    try {
        const l = limit || 12;
        const o = offset || 0;

        const { data, error } = await window.supabaseClient.rpc('get_trending_articles', {
            p_limit: l,
            p_offset: o
        });

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('DB.articles.getTrendingArticles:', err.message);
        // Fallback
        const { data } = await window.supabaseClient
            .from('articles')
            .select('*')
            .eq('status', 'published')
            .eq('moderation_status', 'approved')
            .order('like_count', { ascending: false })
            .range(offset || 0, (offset || 0) + (limit || 12) - 1);
        return data || [];
    }
};

/**
 * Get articles from followed authors
 */
DB.articles.getFollowingArticles = async function ({ limit, offset } = {}) {
    try {
        if (!Auth.isLoggedIn()) return [];
        const l = limit || 12;
        const o = offset || 0;

        const { data, error } = await window.supabaseClient.rpc('get_following_articles', {
            p_user_id: Auth.getAuthId(),
            p_limit: l,
            p_offset: o
        });

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('DB.articles.getFollowingArticles:', err.message);
        return [];
    }
};

/**
 * Get articles by a specific author
 */
DB.articles.getByAuthor = async function (userId, { limit, offset } = {}) {
    try {
        const l = limit || 20;
        const o = offset || 0;

        const { data, error } = await window.supabaseClient
            .from('articles')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'published')
            .eq('moderation_status', 'approved')
            .order('published_at', { ascending: false })
            .range(o, o + l - 1);

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('DB.articles.getByAuthor:', err.message);
        return [];
    }
};

/**
 * Delete own article
 */
DB.articles.deleteOwn = async function (id) {
    try {
        if (!Auth.isLoggedIn()) return false;
        const { error } = await window.supabaseClient
            .from('articles')
            .delete()
            .eq('id', id)
            .eq('user_id', Auth.getAuthId());
        if (error) throw error;
        CACHE.remove('articles');
        return true;
    } catch (err) {
        console.error('DB.articles.deleteOwn:', err.message);
        return false;
    }
};

/**
 * Admin: get pending articles for moderation
 */
DB.articles.getPending = async function ({ limit } = {}) {
    try {
        if (!Auth.hasRole('editor')) return [];
        const { data, error } = await window.supabaseClient
            .from('articles')
            .select('*')
            .eq('status', 'published')
            .eq('moderation_status', 'pending')
            .order('created_at', { ascending: true })
            .limit(limit || 20);
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('DB.articles.getPending:', err.message);
        return [];
    }
};

/**
 * Admin/Editor: approve or reject article
 */
DB.articles.moderate = async function (id, status, note) {
    try {
        if (!Auth.hasRole('editor')) return false;
        const updates = {
            moderation_status: status, // 'approved' or 'rejected'
            moderation_note: Security.sanitize(note || '').slice(0, 500)
        };
        const { error } = await window.supabaseClient
            .from('articles')
            .update(updates)
            .eq('id', id);
        if (error) throw error;

        // Get article for notification
        const { data: article } = await window.supabaseClient
            .from('articles')
            .select('user_id, title')
            .eq('id', id)
            .single();

        // Notify author
        if (article && article.user_id) {
            try {
                await window.supabaseClient.from('notifications').insert({
                    user_id: article.user_id,
                    type: 'article_approved',
                    content_id: id,
                    content_type: 'article',
                    message: status === 'approved'
                        ? 'Your article "' + (article.title || '').slice(0, 50) + '" has been approved!'
                        : 'Your article "' + (article.title || '').slice(0, 50) + '" was not approved. Reason: ' + (note || 'N/A')
                });
            } catch (e) { /* ok */ }

            // Award points if approved
            if (status === 'approved') {
                try { await window.supabaseClient.rpc('add_writer_points', { p_user_id: article.user_id, p_points: 5, p_reason: 'article_approved' }); } catch (e) { /* ok */ }
                try { await window.supabaseClient.rpc('check_and_award_badges', { p_user_id: article.user_id }); } catch (e) { /* ok */ }
            }
        }

        return true;
    } catch (err) {
        console.error('DB.articles.moderate:', err.message);
        return false;
    }
};


// ═══════════════════════════════════════
// DB.follows — User Follow System
// ═══════════════════════════════════════
DB.follows = {
    /**
     * Toggle follow/unfollow
     */
    async toggle(followingId) {
        try {
            if (!Auth.isLoggedIn()) return null;
            const user = Auth.getUser();
            if (!user) return null;

            const { data, error } = await window.supabaseClient.rpc('toggle_follow', {
                p_follower_id: user.id,
                p_following_id: followingId
            });

            if (error) throw error;
            return data; // { action: 'followed' | 'unfollowed' }
        } catch (err) {
            console.error('DB.follows.toggle:', err.message);
            return null;
        }
    },

    /**
     * Check if current user follows someone
     */
    async isFollowing(followingId) {
        try {
            if (!Auth.isLoggedIn()) return false;
            const user = Auth.getUser();
            if (!user) return false;

            const { data } = await window.supabaseClient
                .from('user_follows')
                .select('follower_id')
                .eq('follower_id', user.id)
                .eq('following_id', followingId)
                .maybeSingle();

            return !!data;
        } catch (err) {
            console.error('DB.follows.isFollowing:', err.message);
            return false;
        }
    },

    /**
     * Get followers of a user
     */
    async getFollowers(userId, { limit } = {}) {
        try {
            const { data, error } = await window.supabaseClient
                .from('user_follows')
                .select('follower_id, users!user_follows_follower_id_fkey(id, display_name, photo_url, username)')
                .eq('following_id', userId)
                .order('created_at', { ascending: false })
                .limit(limit || 20);

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('DB.follows.getFollowers:', err.message);
            return [];
        }
    },

    /**
     * Get users that a user follows
     */
    async getFollowing(userId, { limit } = {}) {
        try {
            const { data, error } = await window.supabaseClient
                .from('user_follows')
                .select('following_id, users!user_follows_following_id_fkey(id, display_name, photo_url, username)')
                .eq('follower_id', userId)
                .order('created_at', { ascending: false })
                .limit(limit || 20);

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('DB.follows.getFollowing:', err.message);
            return [];
        }
    }
};


// ═══════════════════════════════════════
// DB.articleCategories — Article Categories
// ═══════════════════════════════════════
DB.articleCategories = {
    _cache: null,

    /**
     * Get all categories
     */
    async getAll() {
        try {
            if (this._cache) return this._cache;

            const { data, error } = await window.supabaseClient
                .from('article_categories')
                .select('*')
                .order('sort_order', { ascending: true });

            if (error) throw error;
            this._cache = data || [];
            return this._cache;
        } catch (err) {
            console.error('DB.articleCategories.getAll:', err.message);
            return [];
        }
    },

    /**
     * Get category by slug
     */
    async getBySlug(slug) {
        try {
            const all = await this.getAll();
            return all.find(c => c.slug === slug) || null;
        } catch (err) {
            return null;
        }
    },

    clearCache() {
        this._cache = null;
    }
};


// ═══════════════════════════════════════
// DB.notifications — Notification System
// ═══════════════════════════════════════
DB.notifications = {
    /**
     * Get user's notifications
     */
    async getAll({ limit } = {}) {
        try {
            if (!Auth.isLoggedIn()) return [];
            const { data, error } = await window.supabaseClient
                .from('notifications')
                .select('*')
                .eq('user_id', Auth.getAuthId())
                .order('created_at', { ascending: false })
                .limit(limit || 30);

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('DB.notifications.getAll:', err.message);
            return [];
        }
    },

    /**
     * Get unread count
     */
    async getUnreadCount() {
        try {
            if (!Auth.isLoggedIn()) return 0;
            const { count, error } = await window.supabaseClient
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', Auth.getAuthId())
                .eq('read', false);

            if (error) throw error;
            return count || 0;
        } catch (err) {
            console.error('DB.notifications.getUnreadCount:', err.message);
            return 0;
        }
    },

    /**
     * Mark all as read
     */
    async markAllRead() {
        try {
            if (!Auth.isLoggedIn()) return false;
            const { error } = await window.supabaseClient
                .from('notifications')
                .update({ read: true })
                .eq('user_id', Auth.getAuthId())
                .eq('read', false);

            if (error) throw error;
            return true;
        } catch (err) {
            console.error('DB.notifications.markAllRead:', err.message);
            return false;
        }
    },

    /**
     * Mark a single notification as read
     */
    async markRead(id) {
        try {
            if (!Auth.isLoggedIn()) return false;
            const { error } = await window.supabaseClient
                .from('notifications')
                .update({ read: true })
                .eq('id', id)
                .eq('user_id', Auth.getAuthId());

            if (error) throw error;
            return true;
        } catch (err) {
            console.error('DB.notifications.markRead:', err.message);
            return false;
        }
    },

    /**
     * Create a notification
     */
    async create(notification) {
        try {
            const row = {
                user_id: notification.user_id,
                type: notification.type,
                actor_id: notification.actor_id || Auth.getAuthId(),
                content_id: notification.content_id || null,
                content_type: notification.content_type || null,
                message: Security.sanitize(notification.message || '').slice(0, 500)
            };

            const { error } = await window.supabaseClient
                .from('notifications')
                .insert(row);

            if (error) throw error;
            return true;
        } catch (err) {
            console.error('DB.notifications.create:', err.message);
            return false;
        }
    }
};


// ═══════════════════════════════════════
// DB.readingHistory — Reading History Tracking
// ═══════════════════════════════════════
DB.readingHistory = {
    /**
     * Track article read
     */
    async track(articleId) {
        try {
            if (!Auth.isLoggedIn()) return;
            await window.supabaseClient
                .from('article_reading_history')
                .upsert({
                    user_id: Auth.getAuthId(),
                    article_id: articleId,
                    read_at: new Date().toISOString()
                }, { onConflict: 'user_id,article_id' });
        } catch (e) { /* silent */ }
    },

    /**
     * Get user's reading history
     */
    async getRecent({ limit } = {}) {
        try {
            if (!Auth.isLoggedIn()) return [];
            const { data, error } = await window.supabaseClient
                .from('article_reading_history')
                .select('article_id, read_at, articles(*)')
                .eq('user_id', Auth.getAuthId())
                .order('read_at', { ascending: false })
                .limit(limit || 20);

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('DB.readingHistory.getRecent:', err.message);
            return [];
        }
    }
};
