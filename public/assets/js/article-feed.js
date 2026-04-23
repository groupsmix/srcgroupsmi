/**
 * Article Feed Module — article-feed.js
 * Social feed with tabs (All/Trending/Following/My Articles),
 * categories, infinite scroll, search, AI recommendations
 *
 * Dependencies: UI (components.js), DB (app.js), Auth (app.js), ArticleAI (article-ai.js)
 */

/* global Security, Auth, DB, UI, CONFIG, ICONS, ArticleAI */

const _ArticleFeed = {
    _currentTab: 'all',
    _currentCategory: null,
    _page: 0,
    _perPage: 12,
    _loading: false,
    _hasMore: true,
    _searchQuery: '',
    _searchTimer: null,
    _categories: [],

    // ═══════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════
    async init() {
        // Check URL params for initial tab
        const params = new URLSearchParams(window.location.search);
        if (params.get('tab')) this._currentTab = params.get('tab');
        if (params.get('category')) this._currentCategory = params.get('category');

        this._initTabs();
        this._initSearch();
        this._initLoadMore();
        this._initInfiniteScroll();

        // Show auth-dependent elements
        await Auth.waitForAuth();
        if (Auth.isLoggedIn()) {
            const writeBtn = document.getElementById('btn-write-article');
            const writeEmpty = document.getElementById('btn-write-empty');
            const tabFollowing = document.getElementById('tab-following');
            const tabMy = document.getElementById('tab-my');
            if (writeBtn) writeBtn.style.display = '';
            if (writeEmpty) writeEmpty.style.display = '';
            if (tabFollowing) tabFollowing.style.display = '';
            if (tabMy) tabMy.style.display = '';

            // Load AI recommendations
            this._loadRecommendations();
        }

        // Load categories
        await this._loadCategories();

        // Load initial articles
        this._loadArticles(true);
    },

    // ═══════════════════════════════════════
    // TABS
    // ═══════════════════════════════════════
    _initTabs() {
        const tabs = document.querySelectorAll('.articles-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                if (this._loading) return;
                tabs.forEach(t => { t.classList.remove('articles-tab--active'); t.setAttribute('aria-selected', 'false'); });
                tab.classList.add('articles-tab--active');
                tab.setAttribute('aria-selected', 'true');
                this._currentTab = tab.dataset.tab;
                this._page = 0;
                this._hasMore = true;
                this._loadArticles(true);

                // Update URL
                const url = new URL(window.location);
                url.searchParams.set('tab', this._currentTab);
                window.history.replaceState(null, '', url);
            });
        });

        // Set initial active tab
        const activeTab = document.querySelector('.articles-tab[data-tab="' + this._currentTab + '"]');
        if (activeTab) {
            document.querySelectorAll('.articles-tab').forEach(t => { t.classList.remove('articles-tab--active'); t.setAttribute('aria-selected', 'false'); });
            activeTab.classList.add('articles-tab--active');
            activeTab.setAttribute('aria-selected', 'true');
        }
    },

    // ═══════════════════════════════════════
    // CATEGORIES
    // ═══════════════════════════════════════
    async _loadCategories() {
        const bar = document.getElementById('categories-bar');
        if (!bar) return;

        try {
            const { data, error } = await window.supabaseClient
                .from('article_categories')
                .select('*')
                .order('sort_order', { ascending: true });

            if (error) throw error;
            this._categories = data || [];

            // Build category chips
            let html = '<button class="category-chip' + (!this._currentCategory ? ' category-chip--active' : '') + '" data-category="">All</button>';
            this._categories.forEach(cat => {
                html += '<button class="category-chip' + (this._currentCategory === cat.slug ? ' category-chip--active' : '') + '" data-category="' + cat.slug + '">' +
                    Security.sanitize(cat.name) +
                    (cat.article_count ? ' <span class="category-chip__count">' + cat.article_count + '</span>' : '') +
                    '</button>';
            });
            bar.innerHTML = html;

            // Bind
            bar.querySelectorAll('.category-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    if (this._loading) return;
                    bar.querySelectorAll('.category-chip').forEach(c => c.classList.remove('category-chip--active'));
                    chip.classList.add('category-chip--active');
                    this._currentCategory = chip.dataset.category || null;
                    this._page = 0;
                    this._hasMore = true;
                    this._loadArticles(true);
                });
            });
        } catch (err) {
            console.error('ArticleFeed._loadCategories:', err.message);
        }
    },

    // ═══════════════════════════════════════
    // SEARCH
    // ═══════════════════════════════════════
    _initSearch() {
        const input = document.getElementById('articles-search');
        if (!input) return;

        input.addEventListener('input', () => {
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => {
                this._searchQuery = input.value.trim();
                this._page = 0;
                this._hasMore = true;
                this._loadArticles(true);
            }, 400);
        });
    },

    // ═══════════════════════════════════════
    // LOAD MORE / INFINITE SCROLL
    // ═══════════════════════════════════════
    _initLoadMore() {
        const btn = document.getElementById('btn-load-more');
        if (btn) {
            btn.addEventListener('click', () => {
                if (!this._loading && this._hasMore) {
                    this._page++;
                    this._loadArticles(false);
                }
            });
        }
    },

    _initInfiniteScroll() {
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                if (this._loading || !this._hasMore) return;
                const scrollBottom = window.innerHeight + window.scrollY;
                const docHeight = document.documentElement.scrollHeight;
                if (scrollBottom >= docHeight - 600) {
                    this._page++;
                    this._loadArticles(false);
                }
            });
        });
    },

    // ═══════════════════════════════════════
    // LOAD ARTICLES
    // ═══════════════════════════════════════
    async _loadArticles(reset) {
        if (this._loading) return;
        this._loading = true;

        const grid = document.getElementById('articles-grid');
        const emptyEl = document.getElementById('articles-empty');
        const emptyText = document.getElementById('articles-empty-text');
        const loadMoreWrap = document.getElementById('load-more-wrap');
        if (!grid) return;

        if (reset) {
            grid.innerHTML = this._skeletons(6);
            if (emptyEl) emptyEl.style.display = 'none';
            if (loadMoreWrap) loadMoreWrap.style.display = 'none';
        }

        try {
            let articles = [];
            const offset = this._page * this._perPage;

            if (this._searchQuery) {
                // Smart search
                articles = await this._searchArticles(this._searchQuery);
            } else {
                switch (this._currentTab) {
                    case 'trending':
                        articles = await this._fetchTrending(offset);
                        break;
                    case 'following':
                        articles = await this._fetchFollowing(offset);
                        break;
                    case 'my':
                        articles = await this._fetchMyArticles(offset);
                        break;
                    default:
                        articles = await this._fetchAll(offset);
                }
            }

            this._hasMore = articles.length >= this._perPage;

            if (reset) {
                if (articles.length === 0) {
                    grid.innerHTML = '';
                    if (emptyEl) {
                        emptyEl.style.display = 'block';
                        if (emptyText) {
                            if (this._currentTab === 'following') emptyText.textContent = 'Follow authors to see their articles here.';
                            else if (this._currentTab === 'my') emptyText.textContent = 'You haven\'t written any articles yet.';
                            else if (this._searchQuery) emptyText.textContent = 'No articles match your search.';
                            else emptyText.textContent = 'Check back soon for new content!';
                        }
                    }
                } else {
                    grid.innerHTML = articles.map(a => this._currentTab === 'my' ? this._myArticleItem(a) : UI.articleCardEnhanced(a)).join('');
                }
            } else {
                if (articles.length > 0) {
                    grid.insertAdjacentHTML('beforeend', articles.map(a => this._currentTab === 'my' ? this._myArticleItem(a) : UI.articleCardEnhanced(a)).join(''));
                }
            }

            // Show/hide load more
            if (loadMoreWrap) {
                loadMoreWrap.style.display = this._hasMore && articles.length > 0 ? '' : 'none';
            }

            // Init interaction toolbars
            if (typeof UI.initInteractionToolbar === 'function') {
                UI.initInteractionToolbar();
            }
        } catch (err) {
            console.error('ArticleFeed._loadArticles:', err.message);
            if (reset) {
                grid.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);padding:var(--space-8);grid-column:1/-1">Unable to load articles</div>';
            }
        }

        this._loading = false;
    },

    // ═══════════════════════════════════════
    // FETCH METHODS
    // ═══════════════════════════════════════
    async _fetchAll(offset) {
        let query = window.supabaseClient
            .from('articles')
            .select('*')
            .eq('status', 'published')
            .eq('moderation_status', 'approved')
            .order('published_at', { ascending: false })
            .range(offset, offset + this._perPage - 1);

        if (this._currentCategory) {
            query = query.eq('category', this._currentCategory);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    async _fetchTrending(offset) {
        // Use velocity-based trending if available
        if (typeof TrendingV2 !== 'undefined') {
            try {
                return await TrendingV2.fetchTrending(this._perPage, offset);
            } catch (e) {
                console.error('TrendingV2 fallback:', e.message);
            }
        }
        try {
            const { data, error } = await window.supabaseClient.rpc('get_trending_articles', {
                p_limit: this._perPage,
                p_offset: offset
            });
            if (error) throw error;
            return data || [];
        } catch (_err) {
            // Fallback: sort by engagement
            const { data } = await window.supabaseClient
                .from('articles')
                .select('*')
                .eq('status', 'published')
                .eq('moderation_status', 'approved')
                .order('like_count', { ascending: false })
                .range(offset, offset + this._perPage - 1);
            return data || [];
        }
    },

    async _fetchFollowing(offset) {
        if (!Auth.isLoggedIn()) return [];

        try {
            const user = Auth.getUser();
            if (!user) return [];

            const { data, error } = await window.supabaseClient.rpc('get_following_articles', {
                p_user_id: Auth.getAuthId(),
                p_limit: this._perPage,
                p_offset: offset
            });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('ArticleFeed._fetchFollowing:', err.message);
            return [];
        }
    },

    async _fetchMyArticles(offset) {
        if (!Auth.isLoggedIn()) return [];

        const { data, error } = await window.supabaseClient
            .from('articles')
            .select('*')
            .eq('user_id', Auth.getAuthId())
            .order('created_at', { ascending: false })
            .range(offset, offset + this._perPage - 1);

        if (error) throw error;
        return data || [];
    },

    async _searchArticles(query) {
        if (typeof ArticleAI !== 'undefined' && query.length > 15) {
            // Use smart search for longer queries
            return ArticleAI.smartSearch(query, this._perPage);
        }

        // Basic search.
        // F-5: escape user-supplied query for PostgREST + LIKE patterns.
        const ilikeTerm = Security.pgrstIlikeContains(query);
        let q = window.supabaseClient
            .from('articles')
            .select('*')
            .eq('status', 'published')
            .eq('moderation_status', 'approved')
            .or('title.ilike.' + ilikeTerm + ',excerpt.ilike.' + ilikeTerm)
            .order('published_at', { ascending: false })
            .limit(this._perPage);

        if (this._currentCategory) {
            q = q.eq('category', this._currentCategory);
        }

        const { data } = await q;
        return data || [];
    },

    // ═══════════════════════════════════════
    // AI RECOMMENDATIONS
    // ═══════════════════════════════════════
    async _loadRecommendations() {
        if (typeof ArticleAI === 'undefined') return;

        const banner = document.getElementById('ai-rec-banner');
        const list = document.getElementById('ai-rec-list');
        if (!banner || !list) return;

        try {
            const recs = await ArticleAI.getRecommendations(Auth.getAuthId(), 3);
            if (recs && recs.length > 0) {
                list.innerHTML = recs.map(a => UI.articleCardEnhanced(a)).join('');
                banner.style.display = '';
                // Init interaction toolbars on rec cards
                if (typeof UI.initInteractionToolbar === 'function') {
                    UI.initInteractionToolbar();
                }
            }
        } catch (err) {
            console.error('ArticleFeed._loadRecommendations:', err.message);
        }
    },

    // ═══════════════════════════════════════
    // MY ARTICLES ITEM (shows status)
    // ═══════════════════════════════════════
    _myArticleItem(article) {
        const statusLabels = {
            draft: 'Draft',
            published: 'Published',
            pending: 'Pending Review',
            rejected: 'Rejected'
        };
        const status = article.status || 'draft';
        const modStatus = article.moderation_status || 'pending';
        const displayStatus = status === 'published' && modStatus !== 'approved' ? modStatus : status;

        return '<div class="my-article-item">' +
            (article.cover_image
                ? '<img class="my-article-item__thumb" src="' + Security.sanitize(article.cover_image) + '" alt="" loading="lazy">'
                : '<div class="my-article-item__thumb" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>') +
            '<div class="my-article-item__info">' +
                '<div class="my-article-item__title">' + Security.sanitize(article.title || 'Untitled') + '</div>' +
                '<div class="my-article-item__meta">' + UI.formatDate(article.created_at) +
                    (article.reading_time ? ' &middot; ' + article.reading_time + ' min read' : '') +
                    (article.views ? ' &middot; ' + UI.formatNumber(article.views) + ' views' : '') +
                '</div>' +
            '</div>' +
            '<span class="my-article-item__status my-article-item__status--' + displayStatus + '">' + (statusLabels[displayStatus] || displayStatus) + '</span>' +
            '<div class="my-article-item__actions">' +
                '<a href="/write-article?edit=' + article.id + '" class="btn btn-ghost btn-sm" title="Edit">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
                '</a>' +
                (article.status === 'published' && article.moderation_status === 'approved'
                    ? '<a href="/article?slug=' + encodeURIComponent(article.slug || '') + '" class="btn btn-ghost btn-sm" title="View">' +
                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
                      '</a>'
                    : '') +
            '</div>' +
            '</div>';
    },

    // ═══════════════════════════════════════
    // SKELETONS
    // ═══════════════════════════════════════
    _skeletons(count) {
        let html = '';
        for (let i = 0; i < count; i++) {
            html += '<div class="article-skeleton"><div class="article-skeleton__image"></div><div class="article-skeleton__body">' +
                '<div class="article-skeleton__line article-skeleton__line--title"></div>' +
                '<div class="article-skeleton__line article-skeleton__line--text"></div>' +
                '<div class="article-skeleton__line article-skeleton__line--short"></div></div></div>';
        }
        return html;
    }
};
