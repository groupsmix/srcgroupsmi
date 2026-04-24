/**
 * Article Editor Module — article-editor.js
 * Rich text editor with Quill.js, auto-save, image upload, word count
 * Integrates with AI Writing Assistant for suggestions
 *
 * Dependencies: Quill.js (loaded via CDN in write-article.html)
 */

/* global Quill, Security, Auth, DB, UI, CONFIG, ICONS, ArticleAI, ArticlePolls, ArticleSeries, FollowersOnlyGate */

const _ArticleEditor = {
    _quill: null,
    _articleId: null,
    _isDirty: false,
    _autoSaveTimer: null,
    _autoSaveInterval: 30000, // 30 seconds
    _lastSavedContent: '',
    _isNewArticle: true,
    _coverImageUrl: '',
    _tags: [],
    _maxTags: 10,
    _seriesId: null,
    _seriesOrder: 1,
    _visibility: 'public',
    _pollData: null,

    // ═══════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════
    async init() {
        if (!Auth.isLoggedIn()) {
            UI.authModal('signin');
            return;
        }

        // Check if editing existing article
        const params = new URLSearchParams(window.location.search);
        const editId = params.get('edit');
        if (editId) {
            this._isNewArticle = false;
            this._articleId = editId;
        }

        this._initQuill();
        this._initCoverUpload();
        this._initTagsInput();
        this._initMetaFields();
        this._initAutoSave();
        this._initWordCount();
        this._initAIPanel();
        this._initAdvancedFeatures();
        this._bindActions();

        // Load categories
        await this._loadCategories();

        // If editing, load existing article
        if (!this._isNewArticle) {
            await this._loadArticle(this._articleId);
        }

        this._updateStatus('ready');
    },

    // ═══════════════════════════════════════
    // QUILL EDITOR
    // ═══════════════════════════════════════
    _initQuill() {
        const editorEl = document.getElementById('article-editor');
        if (!editorEl) return;

        // Detect RTL
        const lang = document.getElementById('meta-language');
        const isRTL = lang && lang.value === 'ar';

        this._quill = new Quill('#article-editor', {
            theme: 'snow',
            placeholder: isRTL ? 'ابدأ كتابة مقالك هنا...' : 'Start writing your article...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    ['blockquote', 'code-block'],
                    ['link', 'image'],
                    [{ 'direction': 'rtl' }],
                    [{ 'align': [] }],
                    ['clean']
                ]
            }
        });

        // Track changes
        this._quill.on('text-change', () => {
            this._isDirty = true;
            this._updateWordCount();
        });

        // Image handler — upload to Supabase Storage
        const toolbar = this._quill.getModule('toolbar');
        toolbar.addHandler('image', () => this._handleImageUpload());
    },

    async _handleImageUpload() {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                UI.toast('Image must be less than 5MB', 'error');
                return;
            }

            const range = this._quill.getSelection(true);
            this._quill.insertText(range.index, 'Uploading image...', { italic: true, color: '#999' });

            try {
                const ext = file.name.split('.').pop();
                const path = 'articles/' + Auth.getUserId() + '/' + Date.now() + '.' + ext;
                const { error } = await window.supabaseClient.storage
                    .from('uploads')
                    .upload(path, file, { cacheControl: '3600', upsert: false });

                if (error) throw error;

                const { data: urlData } = window.supabaseClient.storage
                    .from('uploads')
                    .getPublicUrl(path);

                // Remove placeholder text and insert image
                this._quill.deleteText(range.index, 'Uploading image...'.length);
                this._quill.insertEmbed(range.index, 'image', urlData.publicUrl);
                this._quill.setSelection(range.index + 1);
            } catch (err) {
                console.error('ArticleEditor._handleImageUpload:', err.message);
                this._quill.deleteText(range.index, 'Uploading image...'.length);
                UI.toast('Failed to upload image. Please try again.', 'error');
            }
        };
    },

    // ═══════════════════════════════════════
    // COVER IMAGE
    // ═══════════════════════════════════════
    _initCoverUpload() {
        const uploadArea = document.getElementById('cover-upload');
        const fileInput = document.getElementById('cover-file-input');
        if (!uploadArea || !fileInput) return;

        uploadArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                UI.toast('Cover image must be less than 5MB', 'error');
                return;
            }

            // Preview
            const reader = new FileReader();
            reader.onload = (ev) => {
                const preview = document.getElementById('cover-preview');
                if (preview) {
                    preview.src = ev.target.result;
                    preview.style.display = 'block';
                }
                uploadArea.classList.add('cover-upload--has-image');
            };
            reader.readAsDataURL(file);

            // Upload to Supabase
            try {
                const ext = file.name.split('.').pop();
                const path = 'articles/covers/' + Auth.getUserId() + '/' + Date.now() + '.' + ext;
                const { error } = await window.supabaseClient.storage
                    .from('uploads')
                    .upload(path, file, { cacheControl: '3600', upsert: false });

                if (error) throw error;

                const { data: urlData } = window.supabaseClient.storage
                    .from('uploads')
                    .getPublicUrl(path);

                this._coverImageUrl = urlData.publicUrl;
                this._isDirty = true;
            } catch (err) {
                console.error('ArticleEditor cover upload:', err.message);
                UI.toast('Failed to upload cover image.', 'error');
            }
        });
    },

    // ═══════════════════════════════════════
    // TAGS INPUT
    // ═══════════════════════════════════════
    _initTagsInput() {
        const container = document.getElementById('tags-container');
        const input = document.getElementById('tags-field');
        if (!container || !input) return;

        input.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
                e.preventDefault();
                this._addTag(input.value.trim());
                input.value = '';
            }
            if (e.key === 'Backspace' && !input.value && this._tags.length > 0) {
                this._removeTag(this._tags.length - 1);
            }
        });

        container.addEventListener('click', () => input.focus());
    },

    _addTag(tag) {
        tag = tag.replace(/[^a-zA-Z0-9\u0600-\u06FF\s_-]/g, '').trim().toLowerCase();
        if (!tag || tag.length > 30) return;
        if (this._tags.includes(tag)) return;
        if (this._tags.length >= this._maxTags) {
            UI.toast('Maximum ' + this._maxTags + ' tags allowed', 'warning');
            return;
        }
        this._tags.push(tag);
        this._renderTags();
        this._isDirty = true;
    },

    _removeTag(index) {
        this._tags.splice(index, 1);
        this._renderTags();
        this._isDirty = true;
    },

    _renderTags() {
        const container = document.getElementById('tags-container');
        const input = document.getElementById('tags-field');
        if (!container) return;

        // Remove existing tag elements
        container.querySelectorAll('.tags-input__tag').forEach(el => { el.remove(); });

        // Add tags before input
        this._tags.forEach((tag, i) => {
            const el = document.createElement('span');
            el.className = 'tags-input__tag';
            el.innerHTML = '#' + Security.sanitize(tag) +
                ' <span class="tags-input__tag-remove" data-index="' + i + '">&times;</span>';
            container.insertBefore(el, input);
        });

        // Bind remove
        container.querySelectorAll('.tags-input__tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._removeTag(parseInt(btn.dataset.index, 10));
            });
        });
    },

    // ═══════════════════════════════════════
    // META FIELDS
    // ═══════════════════════════════════════
    _initMetaFields() {
        // Language change -> update editor direction
        const langSelect = document.getElementById('meta-language');
        if (langSelect) {
            langSelect.addEventListener('change', () => {
                const editorEl = document.querySelector('.ql-editor');
                if (editorEl) {
                    editorEl.dir = langSelect.value === 'ar' ? 'rtl' : 'ltr';
                }
                this._isDirty = true;
            });
        }

        // Category change
        const catSelect = document.getElementById('meta-category');
        if (catSelect) {
            catSelect.addEventListener('change', () => { this._isDirty = true; });
        }
    },

    async _loadCategories() {
        const select = document.getElementById('meta-category');
        if (!select) return;

        try {
            const { data, error } = await window.supabaseClient
                .from('article_categories')
                .select('*')
                .order('sort_order', { ascending: true });

            if (error) throw error;
            if (!data || data.length === 0) return;

            select.innerHTML = '<option value="general">Select Category</option>';
            data.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.slug;
                opt.textContent = cat.name;
                select.appendChild(opt);
            });
        } catch (err) {
            console.error('ArticleEditor._loadCategories:', err.message);
        }
    },

    // ═══════════════════════════════════════
    // WORD COUNT & READING TIME
    // ═══════════════════════════════════════
    _initWordCount() {
        this._updateWordCount();
    },

    _updateWordCount() {
        if (!this._quill) return;
        const text = this._quill.getText().trim();
        const words = text ? text.split(/\s+/).length : 0;
        const chars = text.length;
        const readingTime = Math.max(1, Math.round(words / 200));

        const wordEl = document.getElementById('word-count');
        const charEl = document.getElementById('char-count');
        const readEl = document.getElementById('reading-time');

        if (wordEl) wordEl.textContent = words + ' words';
        if (charEl) charEl.textContent = chars + ' chars';
        if (readEl) readEl.textContent = readingTime + ' min read';
    },

    // ═══════════════════════════════════════
    // AUTO-SAVE
    // ═══════════════════════════════════════
    _initAutoSave() {
        this._autoSaveTimer = setInterval(() => {
            if (this._isDirty && this._articleId) {
                this._saveDraft();
            }
        }, this._autoSaveInterval);

        // Save on page unload
        window.addEventListener('beforeunload', (e) => {
            if (this._isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    },

    async _saveDraft() {
        const articleData = this._gatherData();
        articleData.status = 'draft';

        this._updateStatus('saving');

        try {
            if (this._isNewArticle || !this._articleId) {
                // Create new draft
                articleData.user_id = Auth.getAuthId();
                articleData.source = 'user';
                articleData.moderation_status = 'pending';

                const { data, error } = await window.supabaseClient
                    .from('articles')
                    .insert(articleData)
                    .select()
                    .single();

                if (error) throw error;
                this._articleId = data.id;
                this._isNewArticle = false;

                // Update URL without reload
                const newUrl = window.location.pathname + '?edit=' + data.id;
                window.history.replaceState(null, '', newUrl);
            } else {
                // Update existing
                const { error } = await window.supabaseClient
                    .from('articles')
                    .update(articleData)
                    .eq('id', this._articleId);

                if (error) throw error;
            }

            this._isDirty = false;
            this._lastSavedContent = articleData.content;
            this._updateStatus('saved');
        } catch (err) {
            console.error('ArticleEditor._saveDraft:', err.message);
            this._updateStatus('error');
            UI.toast('Failed to save draft.', 'error');
        }
    },

    // ═══════════════════════════════════════
    // PUBLISH
    // ═══════════════════════════════════════
    async publish() {
        const articleData = this._gatherData();

        // Validation
        if (!articleData.title || articleData.title.length < 5) {
            UI.toast('Please add a title (at least 5 characters)', 'error');
            return;
        }
        if (!this._quill || this._quill.getText().trim().length < 50) {
            UI.toast('Article content is too short (minimum 50 characters)', 'error');
            return;
        }

        // Auto-generate excerpt if empty
        if (!articleData.excerpt) {
            const plainText = this._quill.getText().trim();
            articleData.excerpt = plainText.substring(0, 200).trim() + (plainText.length > 200 ? '...' : '');
        }

        // Auto-generate slug if needed
        if (!articleData.slug) {
            articleData.slug = this._generateSlug(articleData.title);
        }

        articleData.status = 'published';
        articleData.published_at = new Date().toISOString();

        // Set moderation to pending for non-trusted, auto-approve for trusted/admin
        const user = Auth.getUser();
        if (user && (user.trusted_author || user.role === 'admin' || user.role === 'editor')) {
            articleData.moderation_status = 'approved';
        } else {
            articleData.moderation_status = 'pending';
        }

        this._updateStatus('saving');

        try {
            // Get author info
            articleData.author_name = user?.display_name || 'Anonymous';
            articleData.author_avatar = user?.photo_url || '';

            if (this._isNewArticle || !this._articleId) {
                articleData.user_id = Auth.getAuthId();
                articleData.source = 'user';

                const { data, error } = await window.supabaseClient
                    .from('articles')
                    .insert(articleData)
                    .select()
                    .single();

                if (error) throw error;
                this._articleId = data.id;
                this._isNewArticle = false;

                // Award points
                try { await window.supabaseClient.rpc('add_writer_points', { p_user_id: user.id, p_points: 10, p_reason: 'article_published' }); } catch (_e) { /* ok */ }
                // Check badges
                try { await window.supabaseClient.rpc('check_and_award_badges', { p_user_id: user.id }); } catch (_e) { /* ok */ }
            } else {
                const { error } = await window.supabaseClient
                    .from('articles')
                    .update(articleData)
                    .eq('id', this._articleId);

                if (error) throw error;
            }

            this._isDirty = false;

            // Run AI moderation in background
            if (typeof ArticleAI !== 'undefined' && articleData.moderation_status === 'pending') {
                ArticleAI.moderateArticle(this._articleId, articleData.title, articleData.content, articleData.tags || []);
            }

            // Create notification for the author
            try {
                await DB.notifications.create({
                    uid: user.id,
                    type: 'article_status',
                    title: articleData.moderation_status === 'approved' ? 'Article Published!' : 'Article Under Review',
                    message: articleData.moderation_status === 'approved'
                        ? 'Your article "' + articleData.title + '" is now live!'
                        : 'Your article "' + articleData.title + '" is being reviewed.',
                    link: '/article?slug=' + articleData.slug
                });
            } catch (_e) { /* ok */ }

            // Save poll if any
            if (typeof ArticlePolls !== 'undefined') {
                const pollData = ArticlePolls.getPollData();
                if (pollData) {
                    await ArticlePolls.savePoll(this._articleId, pollData);
                }
            }

            // Save revision snapshot
            if (typeof ArticleRevisions !== 'undefined' && this._articleId) {
                try { await ArticleRevisions.saveRevision(this._articleId, articleData.title, articleData.content); } catch (_e) { /* ok */ }
            }

            // Apply paywall settings if any
            if (typeof ArticlePaywall !== 'undefined') {
                const paywallSettings = ArticlePaywall.getSettings();
                if (paywallSettings && paywallSettings.coin_price > 0) {
                    try {
                        await window.supabaseClient.from('articles').update({
                            coin_price: paywallSettings.coin_price,
                            free_preview_pct: paywallSettings.free_preview_pct
                        }).eq('id', this._articleId);
                    } catch (_e) { /* ok */ }
                }
            }

            // Update series article count
            if (articleData.series_id) {
                try { await window.supabaseClient.rpc('update_series_article_count', { p_series_id: articleData.series_id }); } catch (_e) { /* ok */ }
            }

            if (articleData.moderation_status === 'approved') {
                UI.toast('Article published successfully!', 'success');
                window.location.href = '/article?slug=' + articleData.slug;
            } else {
                UI.toast('Article submitted for review. You will be notified once approved.', 'success');
                window.location.href = '/articles?tab=my';
            }
        } catch (err) {
            console.error('ArticleEditor.publish:', err.message);
            this._updateStatus('error');
            UI.toast('Failed to publish article: ' + err.message, 'error');
        }
    },

    // ═══════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════
    _gatherData() {
        const titleInput = document.getElementById('article-title');
        const excerptInput = document.getElementById('article-excerpt');
        const catSelect = document.getElementById('meta-category');
        const langSelect = document.getElementById('meta-language');
        const seriesSelect = document.getElementById('meta-series');
        const seriesOrderInput = document.getElementById('meta-series-order');
        const visibilitySelect = document.getElementById('meta-visibility');

        const content = this._quill ? this._quill.root.innerHTML : '';
        const plainText = this._quill ? this._quill.getText().trim() : '';
        const words = plainText ? plainText.split(/\s+/).length : 0;

        return {
            title: Security.sanitize((titleInput?.value || '').trim()),
            excerpt: Security.sanitize((excerptInput?.value || '').trim()).slice(0, 300),
            content: content,
            cover_image: this._coverImageUrl || '',
            category: catSelect?.value || 'general',
            language: langSelect?.value || 'en',
            tags: this._tags.slice(),
            reading_time: Math.max(1, Math.round(words / 200)),
            slug: this._generateSlug((titleInput?.value || '').trim()),
            series_id: (seriesSelect && seriesSelect.value) ? seriesSelect.value : null,
            series_order: seriesOrderInput ? parseInt(seriesOrderInput.value, 10) || 1 : 1,
            visibility: visibilitySelect ? visibilitySelect.value : 'public'
        };
    },

    _generateSlug(title) {
        if (!title) return 'article-' + Date.now();
        return title
            .toLowerCase()
            .replace(/[^\w\s-\u0600-\u06FF]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 80) + '-' + Date.now().toString(36);
    },

    _updateStatus(status) {
        const dot = document.getElementById('save-status-dot');
        const text = document.getElementById('save-status-text');
        if (!dot || !text) return;

        dot.className = 'write-article__status-dot';
        const statusMap = {
            ready: { cls: '', label: 'Ready' },
            saving: { cls: 'write-article__status-dot--saving', label: 'Saving...' },
            saved: { cls: 'write-article__status-dot--saved', label: 'Saved' },
            error: { cls: 'write-article__status-dot--error', label: 'Error saving' }
        };
        const s = statusMap[status] || statusMap.ready;
        if (s.cls) dot.classList.add(s.cls);
        text.textContent = s.label;
    },

    async _loadArticle(id) {
        try {
            const { data, error } = await window.supabaseClient
                .from('articles')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (!data) { UI.toast('Article not found', 'error'); return; }

            // Verify ownership
            if (data.user_id !== Auth.getAuthId() && !Auth.hasRole('admin') && !Auth.hasRole('editor')) {
                UI.toast('You do not have permission to edit this article', 'error');
                return;
            }

            // Populate fields
            const titleInput = document.getElementById('article-title');
            const excerptInput = document.getElementById('article-excerpt');
            const catSelect = document.getElementById('meta-category');
            const langSelect = document.getElementById('meta-language');

            if (titleInput) titleInput.value = data.title || '';
            if (excerptInput) excerptInput.value = data.excerpt || '';
            if (catSelect) catSelect.value = data.category || 'general';
            if (langSelect) langSelect.value = data.language || 'en';

            if (data.content && this._quill) {
                this._quill.root.innerHTML = data.content;
            }

            if (data.cover_image) {
                this._coverImageUrl = data.cover_image;
                const preview = document.getElementById('cover-preview');
                const uploadArea = document.getElementById('cover-upload');
                if (preview) { preview.src = data.cover_image; preview.style.display = 'block'; }
                if (uploadArea) uploadArea.classList.add('cover-upload--has-image');
            }

            if (data.tags && Array.isArray(data.tags)) {
                this._tags = data.tags;
                this._renderTags();
            }

            // Load series & visibility
            if (data.series_id) {
                const seriesSelect = document.getElementById('meta-series');
                if (seriesSelect) seriesSelect.value = data.series_id;
            }
            if (data.series_order) {
                const orderInput = document.getElementById('meta-series-order');
                if (orderInput) orderInput.value = data.series_order;
            }
            if (data.visibility) {
                const visSelect = document.getElementById('meta-visibility');
                if (visSelect) visSelect.value = data.visibility;
            }

            // Update editor direction
            if (data.language === 'ar') {
                const editorEl = document.querySelector('.ql-editor');
                if (editorEl) editorEl.dir = 'rtl';
            }

            this._lastSavedContent = data.content || '';
            this._isDirty = false;
            this._updateWordCount();
        } catch (err) {
            console.error('ArticleEditor._loadArticle:', err.message);
            UI.toast('Failed to load article', 'error');
        }
    },

    // ═══════════════════════════════════════
    // AI PANEL
    // ═══════════════════════════════════════
    _initAIPanel() {
        // Suggest Titles
        document.getElementById('ai-suggest-titles')?.addEventListener('click', async () => {
            if (typeof ArticleAI === 'undefined') return;
            const btn = document.getElementById('ai-suggest-titles');
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Thinking...'; }

            const content = this._quill ? this._quill.getText().trim().slice(0, 500) : '';
            const title = document.getElementById('article-title')?.value || '';
            const suggestions = await ArticleAI.suggestTitles(title, content);

            const panel = document.getElementById('ai-suggestions');
            if (panel && suggestions && suggestions.length > 0) {
                panel.innerHTML = suggestions.map(s =>
                    '<div class="ai-suggestion-item" data-value="' + Security.sanitize(s).replace(/"/g, '&quot;') + '">' +
                    '<span class="ai-suggestion-item__icon">&#9998;</span> ' + Security.sanitize(s) +
                    '</div>'
                ).join('');
                panel.style.display = 'block';

                panel.querySelectorAll('.ai-suggestion-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const titleInput = document.getElementById('article-title');
                        if (titleInput) titleInput.value = item.dataset.value;
                        this._isDirty = true;
                        panel.style.display = 'none';
                    });
                });
            }
            if (btn) { btn.disabled = false; btn.textContent = 'Suggest Titles'; }
        });

        // Auto Tags
        document.getElementById('ai-auto-tags')?.addEventListener('click', async () => {
            if (typeof ArticleAI === 'undefined') return;
            const btn = document.getElementById('ai-auto-tags');
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Analyzing...'; }

            const content = this._quill ? this._quill.getText().trim().slice(0, 1000) : '';
            const title = document.getElementById('article-title')?.value || '';
            const tags = await ArticleAI.suggestTags(title, content);

            if (tags && tags.length > 0) {
                tags.forEach(t => { this._addTag(t); });
                UI.toast('Tags suggested!', 'success');
            }
            if (btn) { btn.disabled = false; btn.textContent = 'Auto Tags'; }
        });

        // Auto Excerpt
        document.getElementById('ai-auto-excerpt')?.addEventListener('click', async () => {
            if (typeof ArticleAI === 'undefined') return;
            const btn = document.getElementById('ai-auto-excerpt');
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>'; }

            const content = this._quill ? this._quill.getText().trim().slice(0, 1500) : '';
            const title = document.getElementById('article-title')?.value || '';
            const excerpt = await ArticleAI.generateExcerpt(title, content);

            if (excerpt) {
                const excerptInput = document.getElementById('article-excerpt');
                if (excerptInput) excerptInput.value = excerpt;
                this._isDirty = true;
                UI.toast('Excerpt generated!', 'success');
            }
            if (btn) { btn.disabled = false; btn.textContent = 'Auto Excerpt'; }
        });

        // Improve Writing
        document.getElementById('ai-improve')?.addEventListener('click', async () => {
            if (typeof ArticleAI === 'undefined') return;
            const btn = document.getElementById('ai-improve');
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Improving...'; }

            const content = this._quill ? this._quill.getText().trim() : '';
            const lang = document.getElementById('meta-language')?.value || 'en';
            const result = await ArticleAI.improveWriting(content.slice(0, 2000), lang);

            const panel = document.getElementById('ai-suggestions');
            if (panel && result) {
                panel.innerHTML = '<div style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.6;padding:var(--space-2)">' +
                    Security.sanitize(result) + '</div>';
                panel.style.display = 'block';
            }
            if (btn) { btn.disabled = false; btn.textContent = 'Improve Writing'; }
        });

        // Auto Category
        document.getElementById('ai-auto-category')?.addEventListener('click', async () => {
            if (typeof ArticleAI === 'undefined') return;
            const btn = document.getElementById('ai-auto-category');
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>'; }

            const content = this._quill ? this._quill.getText().trim().slice(0, 1000) : '';
            const title = document.getElementById('article-title')?.value || '';
            const category = await ArticleAI.suggestCategory(title, content);

            if (category) {
                const catSelect = document.getElementById('meta-category');
                if (catSelect) {
                    // Find matching option
                    const options = Array.from(catSelect.options);
                    const match = options.find(o => o.value.toLowerCase() === category.toLowerCase());
                    if (match) {
                        catSelect.value = match.value;
                        this._isDirty = true;
                        UI.toast('Category set to: ' + match.textContent, 'success');
                    }
                }
            }
            if (btn) { btn.disabled = false; btn.textContent = 'Auto Category'; }
        });
    },

    // ═══════════════════════════════════════
    // ADVANCED FEATURES (Series, Polls, Visibility)
    // ═══════════════════════════════════════
    _initAdvancedFeatures() {
        // Insert series selector
        if (typeof ArticleSeries !== 'undefined') {
            const metaRow = document.querySelector('.write-article__meta-row');
            if (metaRow) {
                const seriesWrap = document.createElement('div');
                seriesWrap.className = 'write-article__meta-field';
                seriesWrap.innerHTML = ArticleSeries.renderSeriesSelector();
                metaRow.appendChild(seriesWrap);
                ArticleSeries.initSelector();
            }
        }

        // Insert visibility selector
        if (typeof FollowersOnlyGate !== 'undefined') {
            const metaRow = document.querySelector('.write-article__meta-row');
            if (metaRow) {
                const visWrap = document.createElement('div');
                visWrap.className = 'write-article__meta-field';
                visWrap.innerHTML = FollowersOnlyGate.renderVisibilitySelector();
                metaRow.appendChild(visWrap);
            }
        }

        // Insert poll builder before editor
        if (typeof ArticlePolls !== 'undefined') {
            const editorWrap = document.querySelector('.write-article__editor-wrap');
            if (editorWrap) {
                const pollWrap = document.createElement('div');
                pollWrap.innerHTML = ArticlePolls.renderPollBuilder();
                editorWrap.parentNode.insertBefore(pollWrap, editorWrap);
                ArticlePolls.initBuilder();
            }
        }

        // Add revision history link for existing articles
        if (typeof ArticleRevisions !== 'undefined' && this._articleId) {
            const actions = document.querySelector('.write-article__actions');
            if (actions) {
                const revLink = document.createElement('a');
                revLink.href = '/article-revisions?id=' + this._articleId;
                revLink.className = 'btn btn-ghost btn-sm';
                revLink.textContent = 'Revision History';
                actions.appendChild(revLink);
            }
        }
    },

    // ═══════════════════════════════════════
    // BIND ACTIONS
    // ═══════════════════════════════════════
    _bindActions() {
        document.getElementById('btn-save-draft')?.addEventListener('click', () => this._saveDraft());
        document.getElementById('btn-publish')?.addEventListener('click', () => this.publish());
        document.getElementById('btn-preview')?.addEventListener('click', () => this._preview());
    },

    _preview() {
        const data = this._gatherData();
        const previewWin = window.open('', '_blank');
        if (!previewWin) { UI.toast('Please allow popups for preview', 'warning'); return; }

        previewWin.document.write('<!DOCTYPE html><html><head>' +
            '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
            '<title>Preview: ' + Security.sanitize(data.title) + '</title>' +
            '<link rel="stylesheet" href="/assets/css/shared.css">' +
            '<link rel="stylesheet" href="/assets/css/articles.css">' +
            '</head><body>' +
            '<div class="article-detail" style="padding-top:40px">' +
            (data.category ? '<span class="article-detail__category">' + Security.sanitize(data.category) + '</span>' : '') +
            '<h1 class="article-detail__title">' + Security.sanitize(data.title) + '</h1>' +
            (data.cover_image ? '<img class="article-detail__cover" src="' + Security.sanitize(data.cover_image) + '" alt="">' : '') +
            '<div class="article-detail__content">' + data.content + '</div>' +
            '</div></body></html>');
        previewWin.document.close();
    },

    // ═══════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════
    destroy() {
        if (this._autoSaveTimer) clearInterval(this._autoSaveTimer);
        this._quill = null;
    }
};
