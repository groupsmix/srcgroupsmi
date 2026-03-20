// ═══════════════════════════════════════
// Article Platform Features — article-platform-features.js
//
// New modules: AuthorAnalytics, ArticleRevisions, ArticleSchedule,
// ArticlePaywall, PlagiarismCheck, ArticleCollaborate,
// SocialConversion, NewsletterDigest, TrendingV2
//
// Dependencies: UI (components.js), DB (app.js), Auth (app.js),
//               Security (app.js), ICONS (app.js)
// ═══════════════════════════════════════

// ═══════════════════════════════════════
// 1. AUTHOR ANALYTICS — Dashboard with charts
// ═══════════════════════════════════════
var AuthorAnalytics = {
    _data: null,
    _days: 30,

    async init() {
        if (!Auth.isLoggedIn()) return;

        // Period selector buttons
        var self = this;
        document.querySelectorAll('.analytics__period-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.analytics__period-btn').forEach(function (b) { b.classList.remove('analytics__period-btn--active'); });
                btn.classList.add('analytics__period-btn--active');
                self._days = parseInt(btn.dataset.days) || 30;
                self._load();
            });
        });

        await this._load();
    },

    async _load() {
        try {
            var userId = Auth.getAuthId();
            var res = await fetch('/api/article-analytics?user_id=' + encodeURIComponent(userId) + '&days=' + this._days);
            var json = await res.json();

            if (json.ok && json.data) {
                this._data = json.data;
                this._renderStats();
                this._renderCharts();
            } else {
                this._renderEmpty();
            }
        } catch (err) {
            console.error('AuthorAnalytics._load:', err.message);
            this._renderEmpty();
        }
    },

    _renderStats() {
        var d = this._data;
        var dailyViews = d.daily_views || [];
        var totalViews = 0;
        var totalReadPct = 0;
        for (var i = 0; i < dailyViews.length; i++) {
            totalViews += (dailyViews[i].views || 0);
            totalReadPct += (parseFloat(dailyViews[i].avg_read_pct) || 0);
        }
        var avgRead = dailyViews.length > 0 ? Math.round(totalReadPct / dailyViews.length) : 0;
        var topArticles = d.top_articles || [];

        var statsEl = document.getElementById('analytics-stats');
        if (statsEl) {
            statsEl.innerHTML =
                '<div class="stat-box"><div class="stat-box__value">' + UI.formatNumber(totalViews) + '</div><div class="stat-box__label">Total Views</div></div>' +
                '<div class="stat-box"><div class="stat-box__value">' + avgRead + '%</div><div class="stat-box__label">Avg Read %</div></div>' +
                '<div class="stat-box"><div class="stat-box__value">' + topArticles.length + '</div><div class="stat-box__label">Published</div></div>' +
                '<div class="stat-box"><div class="stat-box__value">—</div><div class="stat-box__label">Earnings</div></div>';
        }
    },

    _renderCharts() {
        var d = this._data;
        var dailyViews = d.daily_views || [];
        var sources = d.traffic_sources || [];
        var topArticles = d.top_articles || [];
        var completionRates = d.completion_rates || [];

        var chartsEl = document.getElementById('analytics-charts');
        if (!chartsEl) return;

        var html = '';

        // Views bar chart
        if (dailyViews.length > 0) {
            var maxViews = Math.max.apply(null, dailyViews.map(function (d) { return d.views || 0; }));
            if (maxViews === 0) maxViews = 1;

            html += '<div class="chart-card"><div class="chart-card__title">Views Over Time</div>';
            html += '<div class="bar-chart">';
            for (var i = 0; i < dailyViews.length; i++) {
                var v = dailyViews[i].views || 0;
                var pct = Math.round((v / maxViews) * 100);
                var date = dailyViews[i].view_date || '';
                html += '<div class="bar-chart__bar" style="height:' + Math.max(pct, 2) + '%" data-tooltip="' + Security.sanitize(date) + ': ' + v + ' views"></div>';
            }
            html += '</div>';
            html += '<div class="chart-labels">';
            for (var j = 0; j < dailyViews.length; j++) {
                var label = (dailyViews[j].view_date || '').slice(5);
                html += '<span>' + Security.sanitize(label) + '</span>';
            }
            html += '</div></div>';
        }

        // Traffic sources + Top articles side by side
        html += '<div class="analytics-grid-2">';

        // Traffic sources
        if (sources.length > 0) {
            var maxSource = sources[0].views || 1;
            html += '<div class="chart-card"><div class="chart-card__title">Traffic Sources</div><div class="source-list">';
            for (var s = 0; s < sources.length; s++) {
                var src = sources[s];
                var srcPct = Math.round(((src.views || 0) / maxSource) * 100);
                html += '<div class="source-item">' +
                    '<span class="source-item__name">' + Security.sanitize(src.source || 'direct') + '</span>' +
                    '<div class="source-item__bar-bg"><div class="source-item__bar-fill" style="width:' + srcPct + '%"></div></div>' +
                    '<span class="source-item__count">' + UI.formatNumber(src.views || 0) + '</span>' +
                    '</div>';
            }
            html += '</div></div>';
        }

        // Top articles
        if (topArticles.length > 0) {
            html += '<div class="chart-card"><div class="chart-card__title">Top Articles</div><div class="top-articles-list">';
            for (var t = 0; t < Math.min(topArticles.length, 10); t++) {
                var a = topArticles[t];
                html += '<a class="top-article" href="/article?slug=' + encodeURIComponent(a.slug || '') + '">' +
                    '<span class="top-article__title">' + Security.sanitize(a.title || 'Untitled') + '</span>' +
                    '<span class="top-article__stats">' +
                    '<span>' + UI.formatNumber(a.views || 0) + ' views</span>' +
                    '<span>' + UI.formatNumber(a.like_count || 0) + ' likes</span>' +
                    '</span></a>';
            }
            html += '</div></div>';
        }

        html += '</div>';

        // Read completion rates
        if (completionRates.length > 0) {
            html += '<div class="chart-card"><div class="chart-card__title">Read Completion Rates</div><div class="top-articles-list">';
            for (var c = 0; c < Math.min(completionRates.length, 10); c++) {
                var cr = completionRates[c];
                html += '<a class="top-article" href="/article?slug=' + encodeURIComponent(cr.slug || '') + '">' +
                    '<span class="top-article__title">' + Security.sanitize(cr.title || 'Untitled') + '</span>' +
                    '<span class="top-article__stats">' +
                    '<span>' + (cr.avg_completion || 0) + '% avg</span>' +
                    '<span>' + (cr.total_readers || 0) + ' readers</span>' +
                    '</span></a>';
            }
            html += '</div></div>';
        }

        chartsEl.innerHTML = html;
    },

    _renderEmpty() {
        var chartsEl = document.getElementById('analytics-charts');
        if (chartsEl) {
            chartsEl.innerHTML = '<div class="chart-card" style="text-align:center;color:var(--text-tertiary);padding:var(--space-8)">' +
                '<p>No analytics data yet. Views will be tracked as readers visit your articles.</p>' +
                '<a href="/write-article" class="btn btn-primary btn-sm" style="margin-top:var(--space-4)">Write an Article</a>' +
                '</div>';
        }
    },

    // Track a view with read percentage and source (called from article detail)
    async trackView(articleId, readPct, source) {
        try {
            await fetch('/api/article-analytics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    article_id: articleId,
                    read_pct: readPct || 0,
                    source: source || AuthorAnalytics._detectSource()
                })
            });
        } catch (e) { /* non-critical */ }
    },

    _detectSource() {
        var ref = document.referrer || '';
        if (!ref) return 'direct';
        if (ref.indexOf('google.') !== -1) return 'google';
        if (ref.indexOf('twitter.com') !== -1 || ref.indexOf('x.com') !== -1) return 'twitter';
        if (ref.indexOf('facebook.com') !== -1) return 'facebook';
        if (ref.indexOf('linkedin.com') !== -1) return 'linkedin';
        if (ref.indexOf('t.me') !== -1 || ref.indexOf('telegram') !== -1) return 'telegram';
        if (ref.indexOf('wa.me') !== -1 || ref.indexOf('whatsapp') !== -1) return 'whatsapp';
        if (ref.indexOf('groupsmix.com') !== -1) return 'internal';
        return 'other';
    }
};

// ═══════════════════════════════════════
// 2. ARTICLE REVISIONS — Version history
// ═══════════════════════════════════════
var ArticleRevisions = {
    _articleId: null,
    _revisions: [],

    async init() {
        if (!Auth.isLoggedIn()) return;

        var params = new URLSearchParams(window.location.search);
        this._articleId = params.get('article_id');

        if (!this._articleId) {
            var pageEl = document.getElementById('revisions-page');
            if (pageEl) {
                pageEl.innerHTML = '<div style="text-align:center;padding:var(--space-8);color:var(--text-tertiary)">No article specified. Go to <a href="/articles">My Articles</a> to select an article.</div>';
            }
            return;
        }

        // Update back to editor link
        var backBtn = document.getElementById('btn-back-edit');
        if (backBtn) backBtn.href = '/write-article?edit=' + this._articleId;

        await this._loadRevisions();
    },

    async _loadRevisions() {
        var listEl = document.getElementById('revisions-list');
        if (!listEl) return;

        try {
            var res = await fetch('/api/article-revisions?article_id=' + encodeURIComponent(this._articleId));
            var json = await res.json();

            if (!json.ok || !json.revisions || json.revisions.length === 0) {
                listEl.innerHTML = '<div style="text-align:center;padding:var(--space-6);color:var(--text-tertiary)">No revisions yet. Revisions are saved automatically when you publish or save your article.</div>';
                return;
            }

            this._revisions = json.revisions;
            var self = this;

            listEl.innerHTML = json.revisions.map(function (rev, idx) {
                return '<div class="revision-item" data-idx="' + idx + '" data-id="' + rev.id + '">' +
                    '<div class="revision-item__info">' +
                    '<div class="revision-item__number">Revision #' + rev.revision_number + '</div>' +
                    '<div class="revision-item__meta">' +
                    UI.formatDate(rev.created_at) +
                    (rev.title ? ' — ' + Security.sanitize(rev.title).slice(0, 60) : '') +
                    '</div>' +
                    '</div>' +
                    '<div class="revision-item__actions">' +
                    '<button class="btn btn-ghost btn-sm btn-preview-rev" data-idx="' + idx + '">Preview</button>' +
                    '<button class="btn btn-secondary btn-sm btn-restore-rev" data-id="' + rev.id + '">Restore</button>' +
                    '</div></div>';
            }).join('');

            // Bind preview buttons
            listEl.querySelectorAll('.btn-preview-rev').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var idx = parseInt(btn.dataset.idx);
                    self._previewRevision(idx);
                });
            });

            // Bind restore buttons
            listEl.querySelectorAll('.btn-restore-rev').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var revId = btn.dataset.id;
                    self._restoreRevision(revId);
                });
            });

            // Bind item clicks to preview
            listEl.querySelectorAll('.revision-item').forEach(function (item) {
                item.addEventListener('click', function () {
                    var idx = parseInt(item.dataset.idx);
                    self._previewRevision(idx);
                });
            });

        } catch (err) {
            console.error('ArticleRevisions._loadRevisions:', err.message);
            listEl.innerHTML = '<div style="text-align:center;padding:var(--space-6);color:var(--text-tertiary)">Unable to load revisions.</div>';
        }
    },

    _previewRevision(idx) {
        var rev = this._revisions[idx];
        if (!rev) return;

        // Highlight active
        document.querySelectorAll('.revision-item').forEach(function (item) {
            item.classList.remove('revision-item--active');
        });
        document.querySelector('.revision-item[data-idx="' + idx + '"]')?.classList.add('revision-item--active');

        var previewEl = document.getElementById('revision-preview');
        var titleEl = document.getElementById('revision-preview-title');
        var contentEl = document.getElementById('revision-preview-content');

        if (previewEl && titleEl && contentEl) {
            previewEl.style.display = '';
            titleEl.textContent = rev.title || 'Untitled';
            contentEl.innerHTML = rev.content || '<em>No content</em>';
        }
    },

    async _restoreRevision(revisionId) {
        if (!confirm('Restore this revision? Your current article will be saved as a new revision first.')) return;

        try {
            var res = await fetch('/api/article-revisions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'restore',
                    revision_id: revisionId,
                    user_id: Auth.getAuthId()
                })
            });

            var json = await res.json();
            if (json.ok) {
                UI.toast('Revision restored successfully!', 'success');
                window.location.href = '/write-article?edit=' + this._articleId;
            } else {
                UI.toast(json.error || 'Failed to restore revision', 'error');
            }
        } catch (err) {
            UI.toast('Failed to restore revision', 'error');
        }
    },

    // Save a revision (called from editor on publish/save)
    async saveRevision(articleId) {
        if (!Auth.isLoggedIn() || !articleId) return;
        try {
            await fetch('/api/article-revisions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'save',
                    article_id: articleId,
                    user_id: Auth.getAuthId()
                })
            });
        } catch (e) { /* non-critical */ }
    }
};

// ═══════════════════════════════════════
// 3. ARTICLE SCHEDULE — Scheduled publishing
// ═══════════════════════════════════════
var ArticleSchedule = {
    renderUI() {
        return '<div class="schedule-section" style="margin-top:var(--space-4)">' +
            '<label class="write-article__meta-label" style="display:flex;align-items:center;gap:var(--space-2)">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
            'Schedule Publishing' +
            '</label>' +
            '<div style="display:flex;gap:var(--space-2);align-items:center;flex-wrap:wrap">' +
            '<input type="datetime-local" id="schedule-datetime" class="write-article__meta-select" style="flex:1;min-width:200px">' +
            '<button type="button" id="btn-schedule" class="btn btn-secondary btn-sm" style="white-space:nowrap">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
            ' Schedule' +
            '</button>' +
            '</div>' +
            '<div id="schedule-status" style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-1)"></div>' +
            '</div>';
    },

    init(articleId) {
        var scheduleBtn = document.getElementById('btn-schedule');
        var statusEl = document.getElementById('schedule-status');
        if (!scheduleBtn) return;

        scheduleBtn.addEventListener('click', async function () {
            var datetimeInput = document.getElementById('schedule-datetime');
            var scheduledAt = datetimeInput ? datetimeInput.value : '';

            if (!scheduledAt) {
                UI.toast('Please select a date and time', 'warning');
                return;
            }

            if (!articleId) {
                UI.toast('Please save the article first', 'warning');
                return;
            }

            var schedDate = new Date(scheduledAt);
            if (schedDate <= new Date()) {
                UI.toast('Scheduled time must be in the future', 'warning');
                return;
            }

            scheduleBtn.disabled = true;
            scheduleBtn.textContent = 'Scheduling...';

            try {
                var res = await fetch('/api/article-schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        article_id: articleId,
                        scheduled_at: schedDate.toISOString()
                    })
                });

                var json = await res.json();
                if (json.ok) {
                    UI.toast('Article scheduled for ' + schedDate.toLocaleString(), 'success');
                    if (statusEl) statusEl.textContent = 'Scheduled for ' + schedDate.toLocaleString();
                } else {
                    UI.toast(json.error || 'Failed to schedule', 'error');
                }
            } catch (err) {
                UI.toast('Failed to schedule article', 'error');
            }

            scheduleBtn.disabled = false;
            scheduleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Schedule';
        });
    }
};

// ═══════════════════════════════════════
// 4. ARTICLE PAYWALL — Monetization
// ═══════════════════════════════════════
var ArticlePaywall = {
    // Render paywall settings UI for the editor
    renderEditorUI() {
        return '<div class="paywall-section" style="margin-top:var(--space-4)">' +
            '<label class="write-article__meta-label" style="display:flex;align-items:center;gap:var(--space-2)">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' +
            'Monetization (Paywall)' +
            '</label>' +
            '<div style="display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap">' +
            '<div style="display:flex;align-items:center;gap:var(--space-2)">' +
            '<label for="paywall-price" style="font-size:var(--text-sm);color:var(--text-secondary)">Coin Price:</label>' +
            '<input type="number" id="paywall-price" class="write-article__meta-select" style="width:100px" min="0" max="10000" value="0" placeholder="0 = Free">' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:var(--space-2)">' +
            '<label for="paywall-preview" style="font-size:var(--text-sm);color:var(--text-secondary)">Free Preview:</label>' +
            '<select id="paywall-preview" class="write-article__meta-select" style="width:80px">' +
            '<option value="10">10%</option>' +
            '<option value="20">20%</option>' +
            '<option value="30" selected>30%</option>' +
            '<option value="50">50%</option>' +
            '</select>' +
            '</div>' +
            '</div>' +
            '<div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-1)">Set to 0 for free articles. Authors receive 90% of coin payments.</div>' +
            '</div>';
    },

    // Get paywall settings from the editor form
    getSettings() {
        var priceEl = document.getElementById('paywall-price');
        var previewEl = document.getElementById('paywall-preview');
        return {
            coin_price: priceEl ? parseInt(priceEl.value) || 0 : 0,
            free_preview_pct: previewEl ? parseInt(previewEl.value) || 30 : 30
        };
    },

    // Set paywall settings in the editor form (when editing)
    setSettings(coinPrice, freePreview) {
        var priceEl = document.getElementById('paywall-price');
        var previewEl = document.getElementById('paywall-preview');
        if (priceEl) priceEl.value = coinPrice || 0;
        if (previewEl) previewEl.value = freePreview || 30;
    },

    // Render paywall overlay on article detail page
    renderPaywallOverlay(article) {
        if (!article || !article.coin_price || article.coin_price <= 0) return '';
        var previewPct = article.free_preview_pct || 30;
        return '<div id="paywall-overlay" class="paywall-overlay" style="' +
            'position:relative;margin-top:-120px;padding-top:120px;' +
            'background:linear-gradient(to bottom, transparent 0%, var(--bg-primary) 40%);' +
            'text-align:center;padding-bottom:var(--space-8)">' +
            '<div style="max-width:400px;margin:0 auto;padding:var(--space-6);' +
            'background:var(--bg-card);border:1px solid var(--border-primary);border-radius:var(--radius-xl)">' +
            '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:var(--space-3);color:var(--accent-primary)"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
            '<h3 style="margin:0 0 var(--space-2)">Premium Content</h3>' +
            '<p style="color:var(--text-secondary);font-size:var(--text-sm);margin:0 0 var(--space-4)">' +
            'This article requires ' + article.coin_price + ' GMX Coins to read. You can preview the first ' + previewPct + '%.' +
            '</p>' +
            '<button id="btn-purchase-article" class="btn btn-primary" data-article-id="' + article.id + '" data-price="' + article.coin_price + '">' +
            'Unlock for ' + article.coin_price + ' Coins' +
            '</button>' +
            '<div style="margin-top:var(--space-3);font-size:var(--text-xs);color:var(--text-tertiary)">' +
            'One-time purchase. Access forever.' +
            '</div></div></div>';
    },

    // Initialize paywall on article detail page
    async initPaywall(article) {
        if (!article || !article.coin_price || article.coin_price <= 0) return;

        // Check if user has access
        if (Auth.isLoggedIn()) {
            var user = Auth.getUser();
            if (user) {
                // Author always has access
                if (Auth.getAuthId() === article.user_id) return;

                try {
                    var res = await fetch('/api/article-paywall', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'check_access',
                            article_id: article.id,
                            user_id: user.id
                        })
                    });
                    var json = await res.json();
                    if (json.ok && json.has_access) return; // Already purchased
                } catch (e) { /* continue to show paywall */ }
            }
        }

        // Truncate content to free preview percentage
        var contentEl = document.querySelector('.article-content');
        if (contentEl) {
            var previewPct = (article.free_preview_pct || 30) / 100;
            var fullHtml = contentEl.innerHTML;
            var previewLen = Math.floor(fullHtml.length * previewPct);
            // Find the last closing tag before the cut point
            var cutIdx = fullHtml.lastIndexOf('>', previewLen);
            if (cutIdx === -1) cutIdx = previewLen;
            contentEl.innerHTML = fullHtml.slice(0, cutIdx + 1);

            // Insert paywall overlay
            contentEl.insertAdjacentHTML('afterend', this.renderPaywallOverlay(article));

            // Bind purchase button
            var purchaseBtn = document.getElementById('btn-purchase-article');
            if (purchaseBtn) {
                purchaseBtn.addEventListener('click', function () {
                    ArticlePaywall._purchaseArticle(article, fullHtml, contentEl);
                });
            }
        }
    },

    async _purchaseArticle(article, fullHtml, contentEl) {
        if (!Auth.isLoggedIn()) {
            UI.authModal('signin');
            return;
        }

        var user = Auth.getUser();
        if (!user) {
            UI.toast('Please sign in to purchase', 'warning');
            return;
        }

        var purchaseBtn = document.getElementById('btn-purchase-article');
        if (purchaseBtn) {
            purchaseBtn.disabled = true;
            purchaseBtn.textContent = 'Purchasing...';
        }

        try {
            var res = await fetch('/api/article-paywall', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'purchase',
                    article_id: article.id,
                    user_id: user.id
                })
            });

            var json = await res.json();
            if (json.ok) {
                UI.toast('Article unlocked!', 'success');
                // Show full content
                if (contentEl) contentEl.innerHTML = fullHtml;
                var overlay = document.getElementById('paywall-overlay');
                if (overlay) overlay.remove();
            } else {
                UI.toast(json.error || 'Purchase failed', 'error');
                if (purchaseBtn) {
                    purchaseBtn.disabled = false;
                    purchaseBtn.textContent = 'Unlock for ' + article.coin_price + ' Coins';
                }
            }
        } catch (err) {
            UI.toast('Purchase failed', 'error');
            if (purchaseBtn) {
                purchaseBtn.disabled = false;
                purchaseBtn.textContent = 'Unlock for ' + article.coin_price + ' Coins';
            }
        }
    }
};

// ═══════════════════════════════════════
// 5. PLAGIARISM CHECK — Content similarity detection
// ═══════════════════════════════════════
var PlagiarismCheck = {
    renderButton() {
        return '<button type="button" id="btn-plagiarism-check" class="ai-assistant-btn" title="Check for similar content">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
            ' Plagiarism Check</button>';
    },

    init(getContentFn, articleId) {
        var btn = document.getElementById('btn-plagiarism-check');
        if (!btn) return;

        btn.addEventListener('click', async function () {
            var content = getContentFn();
            if (!content || content.length < 50) {
                UI.toast('Write more content before checking for plagiarism', 'warning');
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Checking...';

            try {
                var res = await fetch('/api/plagiarism-check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: content,
                        article_id: articleId || null
                    })
                });

                var json = await res.json();
                if (json.ok) {
                    PlagiarismCheck._showResult(json);
                } else {
                    UI.toast(json.error || 'Plagiarism check failed', 'error');
                }
            } catch (err) {
                UI.toast('Plagiarism check failed', 'error');
            }

            btn.disabled = false;
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Plagiarism Check';
        });
    },

    _showResult(result) {
        var verdictMap = {
            original: { color: '#2ea043', label: 'Original', icon: '&#10003;' },
            low_similarity: { color: '#d29922', label: 'Low Similarity', icon: '&#9888;' },
            moderate_similarity: { color: '#db6d28', label: 'Moderate Similarity', icon: '&#9888;' },
            high_similarity: { color: '#f85149', label: 'High Similarity', icon: '&#10007;' }
        };

        var verdict = verdictMap[result.verdict] || verdictMap.original;
        var matchesHtml = '';

        if (result.matches && result.matches.length > 0) {
            matchesHtml = '<div style="margin-top:var(--space-3);font-size:var(--text-sm)">' +
                '<strong>Similar articles found:</strong>' +
                result.matches.map(function (m) {
                    return '<div style="display:flex;justify-content:space-between;padding:var(--space-1) 0;border-bottom:1px solid var(--border-primary)">' +
                        '<span>Article ID: ' + Security.sanitize((m.article_id || '').slice(0, 8)) + '...</span>' +
                        '<span style="color:' + (m.similarity > 40 ? '#f85149' : '#d29922') + '">' + m.similarity + '% similar' + (m.exact_match ? ' (exact match)' : '') + '</span>' +
                        '</div>';
                }).join('') +
                '</div>';
        }

        var suggestionsEl = document.getElementById('ai-suggestions');
        if (suggestionsEl) {
            suggestionsEl.style.display = '';
            suggestionsEl.innerHTML =
                '<div style="padding:var(--space-4);border-radius:var(--radius-md);border:1px solid ' + verdict.color + ';background:' + verdict.color + '11">' +
                '<div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2)">' +
                '<span style="font-size:var(--text-xl);color:' + verdict.color + '">' + verdict.icon + '</span>' +
                '<strong style="color:' + verdict.color + '">' + verdict.label + '</strong>' +
                '<span style="font-size:var(--text-sm);color:var(--text-secondary)">(' + (result.max_similarity || 0) + '% max similarity)</span>' +
                '</div>' +
                '<div style="font-size:var(--text-sm);color:var(--text-secondary)">' +
                result.word_count + ' words analyzed, ' + result.shingle_count + ' text segments compared' +
                '</div>' +
                matchesHtml +
                '</div>';
        }
    }
};

// ═══════════════════════════════════════
// 6. ARTICLE COLLABORATE — Co-authoring
// ═══════════════════════════════════════
var ArticleCollaborate = {
    renderUI() {
        return '<div class="collab-section" style="margin-top:var(--space-4)">' +
            '<label class="write-article__meta-label" style="display:flex;align-items:center;gap:var(--space-2)">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' +
            'Collaborators' +
            '</label>' +
            '<div style="display:flex;gap:var(--space-2);align-items:center;flex-wrap:wrap">' +
            '<input type="text" id="collab-username" class="write-article__meta-select" style="flex:1;min-width:150px" placeholder="Enter username to invite...">' +
            '<select id="collab-role" class="write-article__meta-select" style="width:100px">' +
            '<option value="editor">Editor</option>' +
            '<option value="reviewer">Reviewer</option>' +
            '<option value="viewer">Viewer</option>' +
            '</select>' +
            '<button type="button" id="btn-invite-collab" class="btn btn-secondary btn-sm">Invite</button>' +
            '</div>' +
            '<div id="collab-list" style="margin-top:var(--space-2);font-size:var(--text-sm)"></div>' +
            '</div>';
    },

    init(articleId) {
        var inviteBtn = document.getElementById('btn-invite-collab');
        if (!inviteBtn) return;

        var self = this;

        inviteBtn.addEventListener('click', async function () {
            var usernameEl = document.getElementById('collab-username');
            var roleEl = document.getElementById('collab-role');
            var username = usernameEl ? usernameEl.value.trim() : '';
            var role = roleEl ? roleEl.value : 'editor';

            if (!username) {
                UI.toast('Enter a username to invite', 'warning');
                return;
            }

            if (!articleId) {
                UI.toast('Save the article first before inviting collaborators', 'warning');
                return;
            }

            inviteBtn.disabled = true;
            inviteBtn.textContent = 'Inviting...';

            try {
                var user = Auth.getUser();
                var res = await fetch('/api/article-collaborate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'invite',
                        article_id: articleId,
                        inviter_user_id: user ? user.id : null,
                        invitee_username: username,
                        role: role
                    })
                });

                var json = await res.json();
                if (json.ok) {
                    UI.toast('Invitation sent to @' + Security.sanitize(username), 'success');
                    if (usernameEl) usernameEl.value = '';
                    self._loadCollaborators(articleId);
                } else {
                    UI.toast(json.error || 'Failed to invite', 'error');
                }
            } catch (err) {
                UI.toast('Failed to invite collaborator', 'error');
            }

            inviteBtn.disabled = false;
            inviteBtn.textContent = 'Invite';
        });

        if (articleId) {
            this._loadCollaborators(articleId);
        }
    },

    async _loadCollaborators(articleId) {
        var listEl = document.getElementById('collab-list');
        if (!listEl) return;

        try {
            var res = await fetch('/api/article-collaborate?article_id=' + encodeURIComponent(articleId));
            var json = await res.json();

            if (!json.ok || !json.collaborators || json.collaborators.length === 0) {
                listEl.innerHTML = '<span style="color:var(--text-tertiary)">No collaborators yet</span>';
                return;
            }

            listEl.innerHTML = json.collaborators.map(function (c) {
                var statusBadge = c.status === 'accepted' ? '<span style="color:#2ea043">Accepted</span>' :
                    c.status === 'declined' ? '<span style="color:#f85149">Declined</span>' :
                    '<span style="color:#d29922">Pending</span>';
                var name = (c.users && c.users.username) ? '@' + Security.sanitize(c.users.username) : 'User';
                return '<div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;border-bottom:1px solid var(--border-primary)">' +
                    '<span>' + name + ' <span style="color:var(--text-tertiary)">(' + Security.sanitize(c.role) + ')</span></span>' +
                    statusBadge +
                    '</div>';
            }).join('');
        } catch (err) {
            listEl.innerHTML = '<span style="color:var(--text-tertiary)">Unable to load collaborators</span>';
        }
    }
};

// ═══════════════════════════════════════
// 7. SOCIAL CONVERSION — Article to social posts
// ═══════════════════════════════════════
var SocialConversion = {
    renderButton() {
        return '<button id="btn-social-convert" class="btn btn-ghost btn-sm" title="Convert to social media format" style="display:inline-flex;align-items:center;gap:4px">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
            'Share as...</button>';
    },

    init(article) {
        var btn = document.getElementById('btn-social-convert');
        if (!btn || !article) return;

        btn.addEventListener('click', function () {
            SocialConversion._showModal(article);
        });
    },

    _showModal(article) {
        var title = article.title || 'Untitled';
        var excerpt = (article.excerpt || '').slice(0, 200);
        var url = 'https://groupsmix.com/article?slug=' + encodeURIComponent(article.slug || '');
        var tags = Array.isArray(article.tags) ? article.tags.map(function (t) { return '#' + t.replace(/\s+/g, ''); }).join(' ') : '';

        // Generate different formats
        var twitterThread = SocialConversion._generateTwitterThread(title, excerpt, url, tags);
        var instagramCaption = SocialConversion._generateInstagramCaption(title, excerpt, url, tags);
        var whatsappMessage = SocialConversion._generateWhatsAppMessage(title, excerpt, url);

        UI.modal({
            title: 'Convert to Social Post',
            content:
                '<div style="display:flex;flex-direction:column;gap:var(--space-4)">' +
                // Twitter/X Thread
                '<div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2)">' +
                '<strong style="font-size:var(--text-sm)">Twitter/X Thread</strong>' +
                '<button class="btn btn-ghost btn-xs btn-copy-social" data-target="social-twitter">Copy</button>' +
                '</div>' +
                '<textarea id="social-twitter" class="write-article__excerpt-input" rows="4" style="font-size:var(--text-sm)">' + Security.sanitize(twitterThread) + '</textarea>' +
                '</div>' +
                // Instagram Caption
                '<div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2)">' +
                '<strong style="font-size:var(--text-sm)">Instagram Caption</strong>' +
                '<button class="btn btn-ghost btn-xs btn-copy-social" data-target="social-instagram">Copy</button>' +
                '</div>' +
                '<textarea id="social-instagram" class="write-article__excerpt-input" rows="4" style="font-size:var(--text-sm)">' + Security.sanitize(instagramCaption) + '</textarea>' +
                '</div>' +
                // WhatsApp
                '<div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2)">' +
                '<strong style="font-size:var(--text-sm)">WhatsApp Message</strong>' +
                '<button class="btn btn-ghost btn-xs btn-copy-social" data-target="social-whatsapp">Copy</button>' +
                '</div>' +
                '<textarea id="social-whatsapp" class="write-article__excerpt-input" rows="3" style="font-size:var(--text-sm)">' + Security.sanitize(whatsappMessage) + '</textarea>' +
                '</div>' +
                '</div>',
            size: 'large'
        });

        // Bind copy buttons
        document.querySelectorAll('.btn-copy-social').forEach(function (copyBtn) {
            copyBtn.addEventListener('click', function () {
                var targetEl = document.getElementById(copyBtn.dataset.target);
                if (targetEl) {
                    navigator.clipboard.writeText(targetEl.value).then(function () {
                        UI.toast('Copied to clipboard!', 'success');
                    }).catch(function () {
                        targetEl.select();
                        document.execCommand('copy');
                        UI.toast('Copied to clipboard!', 'success');
                    });
                }
            });
        });
    },

    _generateTwitterThread(title, excerpt, url, tags) {
        var thread = '1/ ' + title + '\n\n' + excerpt + '\n\n';
        thread += '2/ Read the full article:\n' + url + '\n\n';
        if (tags) thread += tags + '\n';
        thread += '#GroupsMix #Article';
        return thread;
    },

    _generateInstagramCaption(title, excerpt, url, tags) {
        return title + '\n\n' + excerpt + '\n\n' +
            'Read the full article on GroupsMix (link in bio)\n\n' +
            (tags ? tags + ' ' : '') + '#GroupsMix #ContentCreator #Article';
    },

    _generateWhatsAppMessage(title, excerpt, url) {
        return '*' + title + '*\n\n' + excerpt + '\n\n' + 'Read more: ' + url;
    }
};

// ═══════════════════════════════════════
// 8. TRENDING V2 — Velocity-based trending
// ═══════════════════════════════════════
var TrendingV2 = {
    async fetchTrending(limit, offset) {
        try {
            var res = await window.supabaseClient.rpc('get_trending_articles_v2', {
                p_limit: limit || 20,
                p_offset: offset || 0
            });
            return res.data || [];
        } catch (err) {
            console.error('TrendingV2.fetchTrending:', err.message);
            return [];
        }
    }
};

// ═══════════════════════════════════════
// 9. NEWSLETTER DIGEST (admin-facing preview)
// ═══════════════════════════════════════
var NewsletterDigest = {
    async previewDigest(email) {
        try {
            var res = await fetch('/api/newsletter-digest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email || '' })
            });
            var json = await res.json();
            if (json.ok) return json.html;
            return null;
        } catch (err) {
            console.error('NewsletterDigest.previewDigest:', err.message);
            return null;
        }
    }
};

// ═══════════════════════════════════════
// EXPORT: Make all modules globally available
// ═══════════════════════════════════════
window.AuthorAnalytics = AuthorAnalytics;
window.ArticleRevisions = ArticleRevisions;
window.ArticleSchedule = ArticleSchedule;
window.ArticlePaywall = ArticlePaywall;
window.PlagiarismCheck = PlagiarismCheck;
window.ArticleCollaborate = ArticleCollaborate;
window.SocialConversion = SocialConversion;
window.TrendingV2 = TrendingV2;
window.NewsletterDigest = NewsletterDigest;
