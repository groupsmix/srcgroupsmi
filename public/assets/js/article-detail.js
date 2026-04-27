/**
 * Article Detail Module — article-detail.js
 * Enhanced article detail page with author box, tags, inline comments,
 * related articles, AI summaries, reading history tracking
 *
 * Dependencies: UI (components.js), DB (app.js), Auth (app.js), Security (app.js), ArticleAI (article-ai.js)
 */

/* global Security, Auth, DB, UI, CONFIG, ICONS, ArticleAI, ArticleAudio, ArticleTranslator, ArticlePolls, ArticleSeries, ReadingLists, FollowersOnlyGate */

const _ArticleDetail = {
    _article: null,
    _slug: null,

    // ═══════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════
    async init() {
        this._slug = new URLSearchParams(window.location.search).get('slug');
        if (!this._slug) { window.location.href = '/articles'; return; }

        const container = document.getElementById('article-detail');
        if (!container) return;

        try {
            // Fetch article
            const { data: article, error } = await window.supabaseClient
                .from('articles')
                .select('*')
                .eq('slug', this._slug)
                .single();

            if (error || !article) {
                container.innerHTML = '<div class="articles-empty">' +
                    '<div class="articles-empty__icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
                    '<div class="articles-empty__title">Article Not Found</div>' +
                    '<a href="/articles" class="btn btn-primary btn-sm">Browse Articles</a></div>';
                return;
            }

            // Check visibility: only published+approved or own article
            const isOwner = Auth.isLoggedIn() && Auth.getAuthId() === article.user_id;
            const isAdmin = Auth.isLoggedIn() && Auth.hasRole('admin');
            const isEditor = Auth.isLoggedIn() && Auth.hasRole('editor');
            if (article.status !== 'published' && !isOwner && !isAdmin && !isEditor) {
                container.innerHTML = '<div class="articles-empty">' +
                    '<div class="articles-empty__title">Article Not Available</div>' +
                    '<div class="articles-empty__text">This article is not publicly available yet.</div>' +
                    '<a href="/articles" class="btn btn-primary btn-sm">Browse Articles</a></div>';
                return;
            }

            this._article = article;

            // Check followers-only access
            if (typeof FollowersOnlyGate !== 'undefined' && article.visibility === 'followers_only') {
                const hasAccess = await FollowersOnlyGate.checkAccess(article);
                if (!hasAccess) {
                    container.innerHTML = FollowersOnlyGate.renderGate(article.author_name);
                    // Bind follow-to-unlock button
                    const unlockBtn = document.getElementById('btn-follow-unlock');
                    if (unlockBtn && Auth.isLoggedIn()) {
                        unlockBtn.addEventListener('click', async () => {
                            unlockBtn.disabled = true;
                            try {
                                const user = Auth.getUser();
                                const { data: author } = await window.supabaseClient
                                    .from('users').select('id').eq('auth_id', article.user_id).single();
                                if (author && user) {
                                    await window.supabaseClient.rpc('toggle_follow', {
                                        p_follower_id: user.id, p_following_id: author.id
                                    });
                                    UI.toast('Followed! Reloading...', 'success');
                                    setTimeout(() => window.location.reload(), 800);
                                }
                            } catch (_err) {
                                UI.toast('Failed to follow', 'error');
                                unlockBtn.disabled = false;
                            }
                        });
                    }
                    return;
                }
            }

            // Update page meta
            document.title = Security.sanitize(article.title) + ' — GroupsMix';
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) metaDesc.setAttribute('content', Security.sanitize(article.excerpt || '').slice(0, 160));

            // Increment views
            try { await window.supabaseClient.rpc('increment_article_views', { p_article_id: article.id }); } catch (_e) { /* ok */ }

            // Track reading history
            this._trackReading(article.id);

            // Render article
            this._render(container, article);

            // Load author info
            this._loadAuthorBox(article);

            // Load related articles
            this._loadRelated(article);

            // Load comments
            this._loadComments(article);

            // Load more from author
            this._loadMoreFromAuthor(article);

            // Init interaction toolbar
            if (typeof UI.initInteractionToolbar === 'function') {
                UI.initInteractionToolbar();
            }

            // Init advanced features (audio, translate, polls, series, reading lists)
            this._initAdvancedFeatures(article);

            // Load tip section
            this._loadTipSection(article);

        } catch (err) {
            console.error('ArticleDetail.init:', err.message);
            container.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);padding:var(--space-8)">Unable to load article</div>';
        }
    },

    // ═══════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════
    _render(container, article) {
        const isRTL = article.language === 'ar';
        const categoryLabel = this._getCategoryLabel(article.category);
        const tags = article.tags || [];
        const sanitizedContent = this._sanitizeContent(article.content);

        container.innerHTML =
            // Category badge
            (article.category
                ? '<a href="/articles?category=' + encodeURIComponent(article.category) + '" class="article-detail__category-badge">' + Security.sanitize(categoryLabel) + '</a>'
                : '') +

            // Title
            '<h1 class="article-detail__title"' + (isRTL ? ' dir="rtl"' : '') + '>' + Security.sanitize(article.title || '') + '</h1>' +

            // Meta
            '<div class="article-detail__meta">' +
                '<span>' + UI.formatDate(article.published_at || article.created_at) + '</span>' +
                (article.reading_time ? '<span>' + article.reading_time + ' min read</span>' : '') +
                '<span>' + UI.formatNumber(article.views || 0) + ' views</span>' +
            '</div>' +

            // Cover image
            (article.cover_image
                ? '<img class="article-detail__cover" src="' + Security.sanitize(article.cover_image) + '" alt="' + Security.sanitize(article.title || 'Article cover').replace(/"/g, '&quot;') + '">'
                : '') +

            // Followers-only badge
            (article.visibility === 'followers_only'
                ? '<div class="article-detail__followers-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Followers Only</div>'
                : '') +

            // Author box placeholder
            '<div id="author-box" class="article-detail__author-box"></div>' +

            // Audio + Translate + Save toolbar
            '<div id="article-toolbar" class="article-detail__toolbar"></div>' +

            // Series navigation (top)
            '<div id="series-nav-top"></div>' +

            // AI Summary button
            '<div id="summary-section" class="article-detail__summary-section"></div>' +

            // Polls section (before content)
            '<div id="article-polls" class="article-detail__polls"></div>' +

            // Content
            '<div class="article-detail__content"' + (isRTL ? ' dir="rtl"' : '') + '>' + sanitizedContent + '</div>' +

            // Tags
            (tags.length > 0
                ? '<div class="article-detail__tags">' + tags.map(t =>
                    '<a href="/articles?category=' + encodeURIComponent(t) + '" class="article-detail__tag">#' + Security.sanitize(t) + '</a>'
                ).join('') + '</div>'
                : '') +

            // Tip section
            '<div id="article-tip-section" class="article-detail__tip-section"></div>' +

            // Interaction bar
            '<div class="article-detail__interaction">' +
                UI.interactionToolbar(article.slug || article.id, 'article') +
            '</div>' +

            // Related articles
            '<div id="related-articles" class="article-detail__section" style="display:none">' +
                '<h2 class="article-detail__section-title">Related Articles</h2>' +
                '<div id="related-articles-grid" class="articles-grid articles-grid--small"></div>' +
            '</div>' +

            // Comments section
            '<div id="comments-section" class="article-detail__section">' +
                '<h2 class="article-detail__section-title" id="comments-title">Comments</h2>' +
                '<div id="comment-form-wrap"></div>' +
                '<div id="comments-list"></div>' +
            '</div>' +

            // Series navigation (bottom)
            '<div id="series-nav-bottom"></div>' +

            // More from author
            '<div id="more-from-author" class="article-detail__section" style="display:none">' +
                '<h2 class="article-detail__section-title">More from this Author</h2>' +
                '<div id="more-from-author-grid" class="articles-grid articles-grid--small"></div>' +
            '</div>';

        // Init summary button
        this._initSummary(article);
    },

    // ═══════════════════════════════════════
    // SANITIZE CONTENT (XSS protection)
    // ═══════════════════════════════════════
    _sanitizeContent(html) {
        if (!html) return '';
        if (typeof DOMPurify !== 'undefined') {
            return DOMPurify.sanitize(html, {
                USE_PROFILES: { html: true },
                ADD_TAGS: ['iframe'],
                ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling']
            });
        }
        // Fallback if DOMPurify failed to load
        return Security.sanitize(html);
    },

    // ═══════════════════════════════════════
    // AUTHOR BOX
    // ═══════════════════════════════════════
    async _loadAuthorBox(article) {
        const box = document.getElementById('author-box');
        if (!box) return;

        try {
            // Try to load full author profile
            let author = null;
            if (article.user_id) {
                const { data } = await window.supabaseClient
                    .from('users')
                    .select('*')
                    .eq('auth_id', article.user_id)
                    .single();
                author = data;
            }

            const displayName = author ? (author.display_name || 'Anonymous') : (article.author_name || 'GroupsMix');
            const initial = displayName.charAt(0).toUpperCase();
            const authorId = author ? author.id : null;

            // Check follow status
            let isFollowing = false;
            const currentUser = Auth.isLoggedIn() ? Auth.getUser() : null;
            if (currentUser && authorId) {
                const { data: followCheck } = await window.supabaseClient
                    .from('user_follows')
                    .select('follower_id')
                    .eq('follower_id', currentUser.id)
                    .eq('following_id', authorId)
                    .maybeSingle();
                isFollowing = !!followCheck;
            }

            const isOwnArticle = currentUser && article.user_id && Auth.getAuthId() === article.user_id;

            box.innerHTML =
                '<div class="author-box">' +
                    '<div class="author-box__avatar">' +
                        (author && author.photo_url
                            ? '<img src="' + Security.sanitize(author.photo_url) + '" alt="' + Security.sanitize(displayName).replace(/"/g, '&quot;') + '">'
                            : initial) +
                    '</div>' +
                    '<div class="author-box__info">' +
                        '<div class="author-box__name">' + Security.sanitize(displayName) + '</div>' +
                        (author && author.username ? '<div class="author-box__username">@' + Security.sanitize(author.username) + '</div>' : '') +
                        (author && author.bio ? '<div class="author-box__bio">' + Security.sanitize(author.bio) + '</div>' : '') +
                        '<div class="author-box__stats">' +
                            (author ? '<span>' + UI.formatNumber(author.article_count || 0) + ' articles</span>' : '') +
                            (author ? '<span>' + UI.formatNumber(author.follower_count || 0) + ' followers</span>' : '') +
                        '</div>' +
                    '</div>' +
                    '<div class="author-box__actions">' +
                        (authorId ? '<a href="/author?id=' + authorId + '" class="btn btn-ghost btn-sm">View Profile</a>' : '') +
                        (!isOwnArticle && currentUser && authorId
                            ? '<button id="btn-follow-detail" class="btn ' + (isFollowing ? 'btn-secondary' : 'btn-primary') + ' btn-sm">' +
                                (isFollowing ? 'Following' : 'Follow') +
                              '</button>'
                            : '') +
                    '</div>' +
                '</div>';

            // Follow handler
            const followBtn = document.getElementById('btn-follow-detail');
            if (followBtn && currentUser && authorId) {
                followBtn.addEventListener('click', async () => {
                    followBtn.disabled = true;
                    try {
                        const result = await window.supabaseClient.rpc('toggle_follow', {
                            p_follower_id: currentUser.id,
                            p_following_id: authorId
                        });
                        if (result.data && result.data.action === 'followed') {
                            followBtn.textContent = 'Following';
                            followBtn.className = 'btn btn-secondary btn-sm';
                        } else {
                            followBtn.textContent = 'Follow';
                            followBtn.className = 'btn btn-primary btn-sm';
                        }
                    } catch (_err) {
                        UI.toast('Failed to update follow status', 'error');
                    }
                    followBtn.disabled = false;
                });
            }
        } catch (err) {
            console.error('ArticleDetail._loadAuthorBox:', err.message);
            // Fallback with article data
            box.innerHTML =
                '<div class="author-box">' +
                    '<div class="author-box__avatar">' + (article.author_name || 'G').charAt(0).toUpperCase() + '</div>' +
                    '<div class="author-box__info">' +
                        '<div class="author-box__name">' + Security.sanitize(article.author_name || 'GroupsMix') + '</div>' +
                    '</div>' +
                '</div>';
        }
    },

    // ═══════════════════════════════════════
    // RELATED ARTICLES
    // ═══════════════════════════════════════
    async _loadRelated(article) {
        const section = document.getElementById('related-articles');
        const grid = document.getElementById('related-articles-grid');
        if (!section || !grid) return;

        try {
            let related = [];
            if (typeof ArticleAI !== 'undefined') {
                related = await ArticleAI.getRelatedArticles(article.id, article.category, article.tags, 3);
            }

            if (!related || related.length === 0) {
                // Fallback: same category
                const { data } = await window.supabaseClient
                    .from('articles')
                    .select('*')
                    .eq('status', 'published')
                    .eq('moderation_status', 'approved')
                    .neq('id', article.id)
                    .eq('category', article.category || 'general')
                    .order('like_count', { ascending: false })
                    .limit(3);
                related = data || [];
            }

            if (related.length > 0) {
                grid.innerHTML = related.map(a => UI.articleCardEnhanced(a)).join('');
                section.style.display = '';
                if (typeof UI.initInteractionToolbar === 'function') UI.initInteractionToolbar();
            }
        } catch (err) {
            console.error('ArticleDetail._loadRelated:', err.message);
        }
    },

    // ═══════════════════════════════════════
    // COMMENTS (inline, not panel)
    // ═══════════════════════════════════════
    async _loadComments(article) {
        const formWrap = document.getElementById('comment-form-wrap');
        const listEl = document.getElementById('comments-list');
        const titleEl = document.getElementById('comments-title');
        if (!listEl) return;

        // Comment form
        if (formWrap) {
            if (Auth.isLoggedIn()) {
                formWrap.innerHTML =
                    '<div class="comment-form">' +
                        '<textarea id="comment-input" class="comment-form__input" placeholder="Write a comment..." maxlength="2000" rows="3"></textarea>' +
                        '<div class="comment-form__actions">' +
                            '<button id="btn-submit-comment" class="btn btn-primary btn-sm">Post Comment</button>' +
                        '</div>' +
                    '</div>';

                const submitBtn = document.getElementById('btn-submit-comment');
                const input = document.getElementById('comment-input');
                if (submitBtn && input) {
                    submitBtn.addEventListener('click', async () => {
                        const text = input.value.trim();
                        if (!text) { UI.toast('Please write a comment first', 'warning'); return; }
                        if (!Security.checkRateLimit('comment')) { UI.toast('Too many comments. Please wait.', 'error'); return; }

                        submitBtn.disabled = true;
                        try {
                            const user = Auth.getUser();
                            const { error } = await window.supabaseClient
                                .from('comments')
                                .insert({
                                    content_id: article.slug || article.id,
                                    content_type: 'article',
                                    user_id: Auth.getAuthId(),
                                    display_name: user ? user.display_name : 'Anonymous',
                                    text: Security.sanitize(text).slice(0, 2000)
                                });

                            if (error) throw error;

                            input.value = '';
                            UI.toast('Comment posted!', 'success');

                            // Update comment count
                            try {
                                await window.supabaseClient
                                    .from('articles')
                                    .update({ comment_count: (article.comment_count || 0) + 1 })
                                    .eq('id', article.id);
                            } catch (_e) { /* ok */ }

                            // Reload comments
                            this._fetchComments(article, listEl, titleEl);

                            // Create notification for article author
                            if (article.user_id && article.user_id !== Auth.getAuthId()) {
                                try {
                                    await window.supabaseClient.from('notifications').insert({
                                        user_id: article.user_id,
                                        type: 'comment',
                                        actor_id: Auth.getAuthId(),
                                        content_id: article.id,
                                        content_type: 'article',
                                        message: (user ? user.display_name : 'Someone') + ' commented on your article "' + (article.title || '').slice(0, 50) + '"'
                                    });
                                } catch (_e) { /* ok */ }
                            }
                        } catch (err) {
                            console.error('Comment submit:', err.message);
                            UI.toast('Failed to post comment', 'error');
                        }
                        submitBtn.disabled = false;
                    });
                }
            } else {
                formWrap.innerHTML = '<div class="comment-form__login">Please <a href="#" onclick="UI.authModal(\'signin\');return false;">sign in</a> to leave a comment.</div>';
            }
        }

        // Load comments
        this._fetchComments(article, listEl, titleEl);
    },

    async _fetchComments(article, listEl, titleEl) {
        try {
            const { data: comments, error } = await window.supabaseClient
                .from('comments')
                .select('*')
                .eq('content_id', article.slug || article.id)
                .eq('content_type', 'article')
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            if (titleEl) titleEl.textContent = 'Comments (' + (comments ? comments.length : 0) + ')';

            if (!comments || comments.length === 0) {
                listEl.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);padding:var(--space-4);font-size:var(--text-sm)">No comments yet. Be the first to share your thoughts!</div>';
                return;
            }

            listEl.innerHTML = comments.map(c => this._commentItem(c)).join('');

            // Init report buttons
            listEl.querySelectorAll('.comment-report-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!Auth.isLoggedIn()) { UI.authModal('signin'); return; }
                    if (!Security.checkRateLimit('report')) { UI.toast('Too many reports. Please wait.', 'error'); return; }
                    try {
                        await window.supabaseClient
                            .from('comments')
                            .update({ reports: (parseInt(btn.dataset.reports, 10) || 0) + 1 })
                            .eq('id', btn.dataset.commentId);
                        btn.textContent = 'Reported';
                        btn.disabled = true;
                        UI.toast('Comment reported', 'info');
                    } catch (_e) {
                        UI.toast('Failed to report', 'error');
                    }
                });
            });
        } catch (err) {
            console.error('ArticleDetail._fetchComments:', err.message);
            listEl.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);padding:var(--space-4)">Unable to load comments</div>';
        }
    },

    _commentItem(comment) {
        const initial = (comment.display_name || 'A').charAt(0).toUpperCase();
        return '<div class="comment-item">' +
            '<div class="comment-item__avatar">' + initial + '</div>' +
            '<div class="comment-item__body">' +
                '<div class="comment-item__header">' +
                    '<span class="comment-item__name">' + Security.sanitize(comment.display_name || 'Anonymous') + '</span>' +
                    '<span class="comment-item__date">' + UI.formatDate(comment.created_at) + '</span>' +
                '</div>' +
                '<div class="comment-item__text">' + Security.sanitize(comment.text || '') + '</div>' +
                '<div class="comment-item__actions">' +
                    '<button class="comment-report-btn" data-comment-id="' + comment.id + '" data-reports="' + (comment.reports || 0) + '">Report</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    },

    // ═══════════════════════════════════════
    // MORE FROM AUTHOR
    // ═══════════════════════════════════════
    async _loadMoreFromAuthor(article) {
        if (!article.user_id) return;

        const section = document.getElementById('more-from-author');
        const grid = document.getElementById('more-from-author-grid');
        if (!section || !grid) return;

        try {
            const { data } = await window.supabaseClient
                .from('articles')
                .select('*')
                .eq('user_id', article.user_id)
                .eq('status', 'published')
                .eq('moderation_status', 'approved')
                .neq('id', article.id)
                .order('published_at', { ascending: false })
                .limit(3);

            if (data && data.length > 0) {
                grid.innerHTML = data.map(a => UI.articleCardEnhanced(a)).join('');
                section.style.display = '';
                if (typeof UI.initInteractionToolbar === 'function') UI.initInteractionToolbar();
            }
        } catch (err) {
            console.error('ArticleDetail._loadMoreFromAuthor:', err.message);
        }
    },

    // ═══════════════════════════════════════
    // AI SUMMARY
    // ═══════════════════════════════════════
    _initSummary(article) {
        const section = document.getElementById('summary-section');
        if (!section || typeof ArticleAI === 'undefined') return;

        // Only show for longer articles (3+ min read)
        if ((article.reading_time || 0) < 3) return;

        section.innerHTML =
            '<div class="summary-actions">' +
                '<button id="btn-tldr" class="btn btn-ghost btn-sm">TL;DR Summary</button>' +
                '<button id="btn-translate" class="btn btn-ghost btn-sm">' +
                    (article.language === 'ar' ? 'Translate to English' : 'ترجم إلى العربية') +
                '</button>' +
                '<button id="btn-thread" class="btn btn-ghost btn-sm">Convert to Thread</button>' +
            '</div>' +
            '<div id="summary-output" class="summary-output" style="display:none"></div>';

        // TL;DR
        const tldrBtn = document.getElementById('btn-tldr');
        if (tldrBtn) {
            tldrBtn.addEventListener('click', async () => {
                const output = document.getElementById('summary-output');
                tldrBtn.disabled = true;
                tldrBtn.textContent = 'Generating...';
                try {
                    const result = await ArticleAI.generateSummary(article.title, article.content);
                    if (result) {
                        let html = '<h3>TL;DR</h3>';
                        if (result.summary) html += '<p>' + Security.sanitize(result.summary) + '</p>';
                        if (result.key_points && result.key_points.length > 0) {
                            html += '<ul>' + result.key_points.map(p => '<li>' + Security.sanitize(p) + '</li>').join('') + '</ul>';
                        }
                        output.innerHTML = html;
                        output.style.display = '';
                    } else {
                        UI.toast('Unable to generate summary', 'error');
                    }
                } catch (_e) {
                    UI.toast('Summary generation failed', 'error');
                }
                tldrBtn.textContent = 'TL;DR Summary';
                tldrBtn.disabled = false;
            });
        }

        // Translate
        const translateBtn = document.getElementById('btn-translate');
        if (translateBtn) {
            translateBtn.addEventListener('click', async () => {
                const output = document.getElementById('summary-output');
                translateBtn.disabled = true;
                translateBtn.textContent = 'Translating...';
                try {
                    const targetLang = article.language === 'ar' ? 'en' : 'ar';
                    const result = await ArticleAI.translateArticle(article.title, article.content, targetLang);
                    if (result) {
                        let html = '<h3>' + (targetLang === 'ar' ? 'الترجمة العربية' : 'English Translation') + '</h3>';
                        if (result.title) html += '<h4>' + Security.sanitize(result.title) + '</h4>';
                        if (result.content) html += '<div' + (targetLang === 'ar' ? ' dir="rtl"' : '') + '>' + Security.sanitize(result.content) + '</div>';
                        output.innerHTML = html;
                        output.style.display = '';
                    } else {
                        UI.toast('Translation failed', 'error');
                    }
                } catch (_e) {
                    UI.toast('Translation failed', 'error');
                }
                translateBtn.textContent = article.language === 'ar' ? 'Translate to English' : 'ترجم إلى العربية';
                translateBtn.disabled = false;
            });
        }

        // Thread
        const threadBtn = document.getElementById('btn-thread');
        if (threadBtn) {
            threadBtn.addEventListener('click', async () => {
                const output = document.getElementById('summary-output');
                threadBtn.disabled = true;
                threadBtn.textContent = 'Converting...';
                try {
                    const posts = await ArticleAI.toThread(article.title, article.content);
                    if (posts && posts.length > 0) {
                        let html = '<h3>Thread Format</h3>';
                        html += posts.map((p, i) => '<div class="thread-post"><span class="thread-post__num">' + (i + 1) + '</span><span>' + Security.sanitize(p) + '</span></div>').join('');
                        html += '<button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText(' + JSON.stringify(posts.join('\n\n')).replace(/'/g, "\\'") + ');UI.toast(\'Thread copied!\',\'success\')">Copy Thread</button>';
                        output.innerHTML = html;
                        output.style.display = '';
                    }
                } catch (_e) {
                    UI.toast('Thread conversion failed', 'error');
                }
                threadBtn.textContent = 'Convert to Thread';
                threadBtn.disabled = false;
            });
        }
    },

    // ═══════════════════════════════════════
    // READING HISTORY TRACKING
    // ═══════════════════════════════════════
    async _trackReading(articleId) {
        if (!Auth.isLoggedIn()) return;
        try {
            await window.supabaseClient
                .from('article_reading_history')
                .upsert({
                    user_id: Auth.getAuthId(),
                    article_id: articleId,
                    read_at: new Date().toISOString()
                }, { onConflict: 'user_id,article_id' });
        } catch (_e) { /* ok */ }
    },

    // ═══════════════════════════════════════
    // ADVANCED FEATURES
    // ═══════════════════════════════════════
    async _initAdvancedFeatures(article) {
        var toolbar = document.getElementById('article-toolbar');
        if (toolbar) {
            var toolbarHtml = '';

            // Audio button
            if (typeof ArticleAudio !== 'undefined' && ArticleAudio.isSupported()) {
                toolbarHtml += ArticleAudio.renderButton(article.language);
            }

            // Translate button (always show, not just for 3+ min reads)
            if (typeof ArticleTranslator !== 'undefined') {
                toolbarHtml += ArticleTranslator.renderButton(article.language);
            }

            // Save to reading list
            if (typeof ReadingLists !== 'undefined') {
                toolbarHtml += ReadingLists.renderAddButton(article.id);
            }

            toolbar.innerHTML = toolbarHtml;

            // Init audio
            if (typeof ArticleAudio !== 'undefined' && ArticleAudio.isSupported()) {
                var contentEl = document.querySelector('.article-detail__content');
                ArticleAudio.init(contentEl, article.language);
            }

            // Init translate
            if (typeof ArticleTranslator !== 'undefined') {
                ArticleTranslator.init(article);
            }

            // Init reading list button
            if (typeof ReadingLists !== 'undefined') {
                ReadingLists.initAddButton();
            }
        }

        // Polls
        if (typeof ArticlePolls !== 'undefined') {
            var pollsContainer = document.getElementById('article-polls');
            if (pollsContainer) {
                var pollsHtml = await ArticlePolls.renderPolls(article.id);
                if (pollsHtml) {
                    pollsContainer.innerHTML = pollsHtml;
                    ArticlePolls.bindVoteHandlers();
                }
            }
        }

        // Series navigation
        if (typeof ArticleSeries !== 'undefined' && article.series_id) {
            var seriesHtml = await ArticleSeries.renderSeriesNav(article);
            if (seriesHtml) {
                var seriesTop = document.getElementById('series-nav-top');
                var seriesBottom = document.getElementById('series-nav-bottom');
                if (seriesTop) seriesTop.innerHTML = seriesHtml;
                // Show compact nav at bottom
                if (seriesBottom) seriesBottom.innerHTML = seriesHtml;
                ArticleSeries.bindFollowHandler();
            }
        }
    },

    // ═══════════════════════════════════════
    // TIP SECTION
    // ═══════════════════════════════════════
    async _loadTipSection(article) {
        var section = document.getElementById('article-tip-section');
        if (!section) return;

        // Need fuel modules loaded
        if (typeof TIP_TYPES === 'undefined' || typeof Tips === 'undefined' || typeof Wallet === 'undefined') return;

        try {
            // Get author's internal user ID
            var authorUserId = null;
            var authorName = article.author_name || 'this writer';
            if (article.user_id) {
                var { data: authorData } = await window.supabaseClient
                    .from('users')
                    .select('id, display_name')
                    .eq('auth_id', article.user_id)
                    .single();
                if (authorData) {
                    authorUserId = authorData.id;
                    authorName = authorData.display_name || authorName;
                }
            }

            if (!authorUserId) return;

            // Don't show tip section for own articles
            var currentUser = Auth.isLoggedIn() ? Auth.getUser() : null;
            var isOwnArticle = currentUser && currentUser.id === authorUserId;

            // Get fee percentage
            var feePercent = 20;
            try {
                var { data: feeData } = await window.supabaseClient.rpc('get_tip_fee_percent');
                if (feeData !== null && feeData !== undefined) feePercent = feeData;
            } catch (_e) { /* use default */ }

            // Build tip options
            var tipOptionsHtml = Object.keys(TIP_TYPES).map(function(key) {
                var tip = TIP_TYPES[key];
                var authorGets = Math.floor(tip.coins * (100 - feePercent) / 100);
                var icon = typeof WriterBadges !== 'undefined' ? WriterBadges.getBadgeIcon(tip.icon) : tip.emoji;
                return '<button class="tip-section__option' + (isOwnArticle ? ' tip-section__option--disabled' : '') + '" data-tip-type="' + key + '" data-coins="' + tip.coins + '"' + (isOwnArticle ? ' disabled' : '') + '>' +
                    '<span class="tip-section__option-icon" style="color:' + tip.color + '">' + icon + '</span>' +
                    '<span class="tip-section__option-name">' + tip.name + '</span>' +
                    '<span class="tip-section__option-coins">' + tip.coins + ' GMX</span>' +
                    '<span class="tip-section__option-fee">Author gets ' + authorGets + '</span>' +
                    '</button>';
            }).join('');

            // Build section HTML
            section.innerHTML =
                '<div class="tip-section">' +
                    '<div class="tip-section__header">' +
                        '<div class="tip-section__title">' +
                            '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
                            ' Fuel This Writer' +
                        '</div>' +
                        '<div class="tip-section__subtitle">Show your appreciation for <strong>' + Security.sanitize(authorName) + '</strong> with GMX Coins</div>' +
                        '<div class="tip-section__fee-note">' + feePercent + '% platform fee applies to all tips</div>' +
                    '</div>' +
                    '<div class="tip-section__options">' + tipOptionsHtml + '</div>' +
                    (isOwnArticle ? '<div class="tip-section__own-note">You cannot tip your own article</div>' : '') +
                    '<div class="tip-section__stats" id="tip-section-stats"></div>' +
                '</div>';

            // Bind tip buttons
            if (!isOwnArticle) {
                section.querySelectorAll('.tip-section__option').forEach(function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.preventDefault();
                        if (typeof UI.fuelTipModal === 'function') {
                            UI.fuelTipModal(authorUserId, authorName, article.id);
                        } else {
                            // Fallback: direct tip send
                            if (!Auth.isLoggedIn()) { UI.authModal('signin'); return; }
                            var tipType = btn.dataset.tipType;
                            btn.disabled = true;
                            btn.querySelector('.tip-section__option-name').textContent = 'Sending...';
                            Tips.send(authorUserId, article.id, tipType, '', false).then(function(result) {
                                if (result) {
                                    _ArticleDetail._loadTipStats(article.id);
                                }
                                var tipInfo = TIP_TYPES[tipType];
                                var _icon = typeof WriterBadges !== 'undefined' ? WriterBadges.getBadgeIcon(tipInfo.icon) : tipInfo.emoji;
                                btn.disabled = false;
                                btn.querySelector('.tip-section__option-name').textContent = tipInfo.name;
                            });
                        }
                    });
                });
            }

            // Load tip stats
            this._loadTipStats(article.id);
        } catch (err) {
            console.error('ArticleDetail._loadTipSection:', err.message);
        }
    },

    async _loadTipStats(articleId) {
        var statsEl = document.getElementById('tip-section-stats');
        if (!statsEl || !articleId) return;

        try {
            var { data } = await window.supabaseClient.rpc('get_article_tip_stats', { p_article_id: articleId });
            if (!data) return;

            var html = '';
            if (data.tip_count > 0) {
                html += '<div class="tip-stats">';
                html += '<div class="tip-stats__summary">';
                html += '<span class="tip-stats__count">' + data.tip_count + ' tip' + (data.tip_count !== 1 ? 's' : '') + '</span>';
                html += '<span class="tip-stats__total">' + data.tip_total + ' GMX total</span>';
                html += '</div>';

                // Recent tips
                if (data.recent_tips && data.recent_tips.length > 0) {
                    html += '<div class="tip-stats__recent">';
                    html += '<div class="tip-stats__recent-title">Recent Tips</div>';
                    data.recent_tips.slice(0, 5).forEach(function(tip) {
                        var tipInfo = (typeof TIP_TYPES !== 'undefined' && TIP_TYPES[tip.tip_type]) ? TIP_TYPES[tip.tip_type] : { name: 'Tip', color: '#F59E0B', icon: 'star' };
                        var icon = typeof WriterBadges !== 'undefined' ? WriterBadges.getBadgeIcon(tipInfo.icon) : '';
                        html += '<div class="tip-stats__item">';
                        html += '<span class="tip-stats__item-icon" style="color:' + tipInfo.color + '">' + icon + '</span>';
                        html += '<span class="tip-stats__item-name">' + Security.sanitize(tip.sender_name || 'Anonymous') + '</span>';
                        html += '<span class="tip-stats__item-type">' + tipInfo.name + '</span>';
                        html += '<span class="tip-stats__item-time">' + UI.formatDate(tip.created_at) + '</span>';
                        html += '</div>';
                    });
                    html += '</div>';
                }
                html += '</div>';
            }

            statsEl.innerHTML = html;
        } catch (err) {
            console.error('ArticleDetail._loadTipStats:', err.message);
        }
    },

    _getCategoryLabel(slug) {
        const labels = {
            'general': 'General',
            'technology': 'Technology',
            'crypto': 'Crypto & Blockchain',
            'gaming': 'Gaming',
            'marketing': 'Marketing',
            'social-media': 'Social Media',
            'business': 'Business',
            'education': 'Education',
            'lifestyle': 'Lifestyle',
            'news': 'News',
            'tutorials': 'Tutorials'
        };
        return labels[slug] || slug || 'General';
    }
};
