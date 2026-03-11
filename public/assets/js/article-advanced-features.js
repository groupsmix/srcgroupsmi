/**
 * Article Advanced Features — article-advanced-features.js
 * Audio (Web Speech API), AI Translator, Inline Polls,
 * Series Navigation, Reading Lists, Followers-Only
 *
 * MUST be loaded AFTER app.js, components.js, article-components.js
 *
 * Dependencies: UI (components.js), DB (app.js), Auth (app.js), Security (app.js)
 */

/* global Security, Auth, DB, UI, CONFIG, ICONS */

// ═══════════════════════════════════════
// 1. AUDIO — Text-to-Speech (Web Speech API)
// ═══════════════════════════════════════
const ArticleAudio = {
    _synth: window.speechSynthesis || null,
    _utterance: null,
    _isPlaying: false,
    _isPaused: false,

    /**
     * Check if TTS is supported
     */
    isSupported() {
        return !!this._synth;
    },

    /**
     * Render the listen button
     */
    renderButton(articleLang) {
        if (!this.isSupported()) return '';
        var isAr = articleLang === 'ar';
        return '<div class="article-audio">' +
            '<button id="btn-audio-listen" class="btn btn-ghost btn-sm article-audio__btn" title="' + (isAr ? 'استمع للمقال' : 'Listen to article') + '">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>' +
                '<span id="audio-btn-text">' + (isAr ? 'استمع' : 'Listen') + '</span>' +
            '</button>' +
            '<div id="audio-progress" class="article-audio__progress" style="display:none">' +
                '<div class="article-audio__progress-bar"><div id="audio-progress-fill" class="article-audio__progress-fill"></div></div>' +
                '<button id="btn-audio-pause" class="btn btn-ghost btn-xs" title="Pause">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' +
                '</button>' +
                '<button id="btn-audio-stop" class="btn btn-ghost btn-xs" title="Stop">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>' +
                '</button>' +
            '</div>' +
        '</div>';
    },

    /**
     * Initialize audio controls
     */
    init(contentEl, articleLang) {
        if (!this.isSupported()) return;

        var listenBtn = document.getElementById('btn-audio-listen');
        var pauseBtn = document.getElementById('btn-audio-pause');
        var stopBtn = document.getElementById('btn-audio-stop');
        var self = this;

        if (listenBtn) {
            listenBtn.addEventListener('click', function () {
                if (self._isPlaying) {
                    if (self._isPaused) {
                        self.resume();
                    } else {
                        self.pause();
                    }
                } else {
                    self.speak(contentEl, articleLang);
                }
            });
        }

        if (pauseBtn) {
            pauseBtn.addEventListener('click', function () {
                if (self._isPaused) {
                    self.resume();
                } else {
                    self.pause();
                }
            });
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', function () {
                self.stop();
            });
        }
    },

    /**
     * Start reading the article
     */
    speak(contentEl, lang) {
        if (!this._synth || !contentEl) return;

        // Extract plain text from content
        var text = '';
        if (typeof contentEl === 'string') {
            var tmp = document.createElement('div');
            tmp.innerHTML = contentEl;
            text = tmp.textContent || tmp.innerText || '';
        } else {
            text = contentEl.textContent || contentEl.innerText || '';
        }

        if (!text.trim()) {
            if (typeof UI !== 'undefined') UI.toast('No content to read', 'warning');
            return;
        }

        this.stop(); // Stop any existing speech

        this._utterance = new SpeechSynthesisUtterance(text.trim());
        this._utterance.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
        this._utterance.rate = 0.95;
        this._utterance.pitch = 1;

        // Try to find a good voice
        var voices = this._synth.getVoices();
        var targetLang = lang === 'ar' ? 'ar' : 'en';
        var matchedVoice = null;
        for (var i = 0; i < voices.length; i++) {
            if (voices[i].lang.startsWith(targetLang)) {
                matchedVoice = voices[i];
                if (voices[i].name.indexOf('Google') !== -1 || voices[i].name.indexOf('Natural') !== -1) {
                    break; // Prefer Google/Natural voices
                }
            }
        }
        if (matchedVoice) this._utterance.voice = matchedVoice;

        var self = this;
        var progressEl = document.getElementById('audio-progress');
        var btnText = document.getElementById('audio-btn-text');
        var listenBtn = document.getElementById('btn-audio-listen');

        this._utterance.onstart = function () {
            self._isPlaying = true;
            self._isPaused = false;
            if (progressEl) progressEl.style.display = 'flex';
            if (btnText) btnText.textContent = lang === 'ar' ? 'جاري القراءة...' : 'Playing...';
            if (listenBtn) listenBtn.classList.add('article-audio__btn--active');
        };

        this._utterance.onend = function () {
            self._isPlaying = false;
            self._isPaused = false;
            if (progressEl) progressEl.style.display = 'none';
            if (btnText) btnText.textContent = lang === 'ar' ? 'استمع' : 'Listen';
            if (listenBtn) listenBtn.classList.remove('article-audio__btn--active');
        };

        this._utterance.onerror = function () {
            self._isPlaying = false;
            self._isPaused = false;
            if (progressEl) progressEl.style.display = 'none';
            if (btnText) btnText.textContent = lang === 'ar' ? 'استمع' : 'Listen';
            if (listenBtn) listenBtn.classList.remove('article-audio__btn--active');
        };

        this._synth.speak(this._utterance);
    },

    pause() {
        if (this._synth && this._isPlaying) {
            this._synth.pause();
            this._isPaused = true;
            var btnText = document.getElementById('audio-btn-text');
            if (btnText) btnText.textContent = 'Paused';
            var pauseBtn = document.getElementById('btn-audio-pause');
            if (pauseBtn) pauseBtn.title = 'Resume';
        }
    },

    resume() {
        if (this._synth && this._isPaused) {
            this._synth.resume();
            this._isPaused = false;
            var btnText = document.getElementById('audio-btn-text');
            if (btnText) btnText.textContent = 'Playing...';
            var pauseBtn = document.getElementById('btn-audio-pause');
            if (pauseBtn) pauseBtn.title = 'Pause';
        }
    },

    stop() {
        if (this._synth) {
            this._synth.cancel();
            this._isPlaying = false;
            this._isPaused = false;
            var progressEl = document.getElementById('audio-progress');
            var btnText = document.getElementById('audio-btn-text');
            var listenBtn = document.getElementById('btn-audio-listen');
            if (progressEl) progressEl.style.display = 'none';
            if (btnText) btnText.textContent = 'Listen';
            if (listenBtn) listenBtn.classList.remove('article-audio__btn--active');
        }
    }
};


// ═══════════════════════════════════════
// 2. AI TRANSLATOR (Browser-side instant translation)
// ═══════════════════════════════════════
const ArticleTranslator = {
    /**
     * Render translate button for any article
     * Shows on ALL articles regardless of reading_time
     */
    renderButton(articleLang) {
        var isAr = articleLang === 'ar';
        return '<button id="btn-translate-article" class="btn btn-ghost btn-sm article-translate__btn">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg> ' +
            (isAr ? 'Read in English' : 'اقرأ بالعربية') +
        '</button>';
    },

    /**
     * Initialize translate button
     */
    init(article) {
        var btn = document.getElementById('btn-translate-article');
        if (!btn) return;

        var self = this;
        btn.addEventListener('click', function () {
            self.translate(article);
        });
    },

    /**
     * Translate article content using ArticleAI or fallback
     */
    async translate(article) {
        var btn = document.getElementById('btn-translate-article');
        var contentEl = document.querySelector('.article-detail__content');
        var titleEl = document.querySelector('.article-detail__title');
        if (!btn || !contentEl) return;

        var targetLang = article.language === 'ar' ? 'en' : 'ar';
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner"></span> ' + (targetLang === 'ar' ? 'جاري الترجمة...' : 'Translating...');

        try {
            var result = null;

            // Try ArticleAI first
            if (typeof ArticleAI !== 'undefined' && typeof ArticleAI.translateArticle === 'function') {
                result = await ArticleAI.translateArticle(article.title, article.content, targetLang);
            }

            if (result && (result.title || result.content)) {
                // Show translated version with toggle
                var originalTitle = titleEl ? titleEl.innerHTML : '';
                var originalContent = contentEl.innerHTML;
                var originalDir = contentEl.getAttribute('dir') || '';

                if (titleEl && result.title) {
                    titleEl.innerHTML = Security.sanitize(result.title);
                    titleEl.dir = targetLang === 'ar' ? 'rtl' : 'ltr';
                }
                if (result.content) {
                    contentEl.innerHTML = Security.sanitize(result.content).replace(/\n/g, '<br>');
                    contentEl.dir = targetLang === 'ar' ? 'rtl' : 'ltr';
                }

                btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> ' +
                    (article.language === 'ar' ? 'العودة للعربية' : 'Back to English');
                btn.disabled = false;

                // Toggle back
                btn.onclick = function () {
                    if (titleEl) {
                        titleEl.innerHTML = originalTitle;
                        titleEl.dir = article.language === 'ar' ? 'rtl' : 'ltr';
                    }
                    contentEl.innerHTML = originalContent;
                    contentEl.dir = originalDir;

                    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg> ' +
                        (article.language === 'ar' ? 'Read in English' : 'اقرأ بالعربية');
                    btn.onclick = function () { ArticleTranslator.translate(article); };
                };
            } else {
                UI.toast(targetLang === 'ar' ? 'Translation not available' : 'الترجمة غير متوفرة', 'error');
                btn.disabled = false;
                btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg> ' +
                    (article.language === 'ar' ? 'Read in English' : 'اقرأ بالعربية');
            }
        } catch (err) {
            console.error('ArticleTranslator.translate:', err.message);
            UI.toast('Translation failed', 'error');
            btn.disabled = false;
            btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg> ' +
                (article.language === 'ar' ? 'Read in English' : 'اقرأ بالعربية');
        }
    }
};


// ═══════════════════════════════════════
// 3. INLINE POLLS
// ═══════════════════════════════════════
const ArticlePolls = {
    /**
     * Render polls for article detail page
     */
    async renderPolls(articleId) {
        try {
            var { data: polls, error } = await window.supabaseClient
                .from('article_polls')
                .select('*')
                .eq('article_id', articleId)
                .order('created_at', { ascending: true });

            if (error || !polls || polls.length === 0) return '';

            var html = '';
            for (var i = 0; i < polls.length; i++) {
                html += await this._renderPoll(polls[i]);
            }
            return html;
        } catch (err) {
            console.error('ArticlePolls.renderPolls:', err.message);
            return '';
        }
    },

    async _renderPoll(poll) {
        var options = poll.options || [];
        var totalVotes = poll.total_votes || 0;
        var hasEnded = poll.ends_at && new Date(poll.ends_at) < new Date();

        // Check if user already voted
        var userVote = -1;
        if (Auth.isLoggedIn()) {
            try {
                var user = Auth.getUser();
                if (user) {
                    var { data: vote } = await window.supabaseClient
                        .from('poll_votes')
                        .select('option_index')
                        .eq('poll_id', poll.id)
                        .eq('user_id', user.id)
                        .maybeSingle();
                    if (vote) userVote = vote.option_index;
                }
            } catch (e) { /* ok */ }
        }

        var showResults = userVote >= 0 || hasEnded;

        var html = '<div class="article-poll" data-poll-id="' + poll.id + '">' +
            '<div class="article-poll__question">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>' +
                ' ' + Security.sanitize(poll.question) +
            '</div>' +
            '<div class="article-poll__options">';

        for (var i = 0; i < options.length; i++) {
            var opt = options[i];
            var optText = opt.text || opt;
            var votes = opt.votes || 0;
            var pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            var isSelected = userVote === i;

            if (showResults) {
                html += '<div class="article-poll__option article-poll__option--result' + (isSelected ? ' article-poll__option--selected' : '') + '">' +
                    '<div class="article-poll__option-bar" style="width:' + pct + '%"></div>' +
                    '<span class="article-poll__option-text">' + Security.sanitize(optText) + '</span>' +
                    '<span class="article-poll__option-pct">' + pct + '%</span>' +
                '</div>';
            } else {
                html += '<button class="article-poll__option article-poll__option--vote" data-poll-id="' + poll.id + '" data-option="' + i + '">' +
                    '<span class="article-poll__option-text">' + Security.sanitize(optText) + '</span>' +
                '</button>';
            }
        }

        html += '</div>' +
            '<div class="article-poll__footer">' +
                '<span>' + totalVotes + ' vote' + (totalVotes !== 1 ? 's' : '') + '</span>' +
                (hasEnded ? '<span class="article-poll__ended">Poll ended</span>' : '') +
            '</div>' +
        '</div>';

        return html;
    },

    /**
     * Bind vote handlers
     */
    bindVoteHandlers() {
        var buttons = document.querySelectorAll('.article-poll__option--vote');
        var self = this;
        buttons.forEach(function (btn) {
            btn.addEventListener('click', async function () {
                if (!Auth.isLoggedIn()) {
                    UI.authModal('signin');
                    return;
                }

                var pollId = btn.dataset.pollId;
                var optionIndex = parseInt(btn.dataset.option);
                btn.disabled = true;

                try {
                    var user = Auth.getUser();
                    var { data, error } = await window.supabaseClient.rpc('vote_on_poll', {
                        p_poll_id: pollId,
                        p_user_id: user.id,
                        p_option_index: optionIndex
                    });

                    if (error) throw error;
                    if (data && data.error) {
                        UI.toast(data.error, 'error');
                        btn.disabled = false;
                        return;
                    }

                    UI.toast('Vote recorded!', 'success');

                    // Reload the poll container
                    var pollEl = btn.closest('.article-poll');
                    if (pollEl) {
                        var newPollId = pollEl.dataset.pollId;
                        var { data: updatedPoll } = await window.supabaseClient
                            .from('article_polls')
                            .select('*')
                            .eq('id', newPollId)
                            .single();

                        if (updatedPoll) {
                            var newHtml = await self._renderPoll(updatedPoll);
                            pollEl.outerHTML = newHtml;
                        }
                    }
                } catch (err) {
                    console.error('ArticlePolls vote:', err.message);
                    UI.toast('Failed to vote', 'error');
                    btn.disabled = false;
                }
            });
        });
    },

    /**
     * Render poll builder for editor
     */
    renderPollBuilder() {
        return '<div class="poll-builder" id="poll-builder">' +
            '<div class="poll-builder__header">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>' +
                ' <span>Add Poll to Article</span>' +
                '<button id="btn-toggle-poll" class="btn btn-ghost btn-xs" type="button">Add Poll</button>' +
            '</div>' +
            '<div id="poll-form" class="poll-builder__form" style="display:none">' +
                '<input type="text" id="poll-question" class="poll-builder__question" placeholder="Ask a question..." maxlength="200">' +
                '<div id="poll-options-list" class="poll-builder__options">' +
                    '<input type="text" class="poll-builder__option-input" placeholder="Option 1" maxlength="100" data-index="0">' +
                    '<input type="text" class="poll-builder__option-input" placeholder="Option 2" maxlength="100" data-index="1">' +
                '</div>' +
                '<div class="poll-builder__actions">' +
                    '<button id="btn-add-poll-option" class="btn btn-ghost btn-xs" type="button">+ Add Option</button>' +
                    '<button id="btn-remove-poll" class="btn btn-ghost btn-xs" type="button" style="color:var(--red-500)">Remove Poll</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    },

    /**
     * Initialize poll builder in editor
     */
    initBuilder() {
        var toggleBtn = document.getElementById('btn-toggle-poll');
        var form = document.getElementById('poll-form');
        var addOptionBtn = document.getElementById('btn-add-poll-option');
        var removeBtn = document.getElementById('btn-remove-poll');

        if (toggleBtn && form) {
            toggleBtn.addEventListener('click', function () {
                var isVisible = form.style.display !== 'none';
                form.style.display = isVisible ? 'none' : '';
                toggleBtn.textContent = isVisible ? 'Add Poll' : 'Hide';
            });
        }

        if (addOptionBtn) {
            addOptionBtn.addEventListener('click', function () {
                var optionsList = document.getElementById('poll-options-list');
                if (!optionsList) return;
                var inputs = optionsList.querySelectorAll('.poll-builder__option-input');
                if (inputs.length >= 6) {
                    UI.toast('Maximum 6 options', 'warning');
                    return;
                }
                var idx = inputs.length;
                var input = document.createElement('input');
                input.type = 'text';
                input.className = 'poll-builder__option-input';
                input.placeholder = 'Option ' + (idx + 1);
                input.maxLength = 100;
                input.dataset.index = idx;
                optionsList.appendChild(input);
            });
        }

        if (removeBtn && form) {
            removeBtn.addEventListener('click', function () {
                form.style.display = 'none';
                var q = document.getElementById('poll-question');
                if (q) q.value = '';
                var optionsList = document.getElementById('poll-options-list');
                if (optionsList) {
                    optionsList.innerHTML =
                        '<input type="text" class="poll-builder__option-input" placeholder="Option 1" maxlength="100" data-index="0">' +
                        '<input type="text" class="poll-builder__option-input" placeholder="Option 2" maxlength="100" data-index="1">';
                }
                if (toggleBtn) toggleBtn.textContent = 'Add Poll';
            });
        }
    },

    /**
     * Get poll data from builder
     */
    getPollData() {
        var form = document.getElementById('poll-form');
        if (!form || form.style.display === 'none') return null;

        var question = (document.getElementById('poll-question') || {}).value || '';
        if (!question.trim()) return null;

        var inputs = document.querySelectorAll('.poll-builder__option-input');
        var options = [];
        for (var i = 0; i < inputs.length; i++) {
            var val = inputs[i].value.trim();
            if (val) {
                options.push({ text: val, votes: 0 });
            }
        }

        if (options.length < 2) return null;

        return {
            question: question.trim(),
            options: options
        };
    },

    /**
     * Save poll to database after article is published
     */
    async savePoll(articleId, pollData) {
        if (!pollData || !articleId) return;
        try {
            var { error } = await window.supabaseClient
                .from('article_polls')
                .insert({
                    article_id: articleId,
                    question: pollData.question,
                    options: pollData.options,
                    total_votes: 0
                });
            if (error) throw error;
        } catch (err) {
            console.error('ArticlePolls.savePoll:', err.message);
        }
    }
};


// ═══════════════════════════════════════
// 4. SERIES NAVIGATION
// ═══════════════════════════════════════
const ArticleSeries = {
    /**
     * Render series navigation bar in article detail
     */
    async renderSeriesNav(article) {
        if (!article.series_id) return '';

        try {
            // Get series info
            var { data: series } = await window.supabaseClient
                .from('article_series')
                .select('*')
                .eq('id', article.series_id)
                .single();

            if (!series) return '';

            // Get all articles in series
            var { data: seriesArticles } = await window.supabaseClient
                .from('articles')
                .select('id, title, slug, series_order, status, moderation_status')
                .eq('series_id', article.series_id)
                .eq('status', 'published')
                .eq('moderation_status', 'approved')
                .order('series_order', { ascending: true });

            if (!seriesArticles || seriesArticles.length === 0) return '';

            // Find current position
            var currentIndex = -1;
            for (var i = 0; i < seriesArticles.length; i++) {
                if (seriesArticles[i].id === article.id) {
                    currentIndex = i;
                    break;
                }
            }

            var prevArticle = currentIndex > 0 ? seriesArticles[currentIndex - 1] : null;
            var nextArticle = currentIndex < seriesArticles.length - 1 ? seriesArticles[currentIndex + 1] : null;

            // Check if user follows this series
            var isFollowing = false;
            if (Auth.isLoggedIn()) {
                try {
                    var user = Auth.getUser();
                    if (user) {
                        var { data: followCheck } = await window.supabaseClient
                            .from('series_followers')
                            .select('series_id')
                            .eq('series_id', series.id)
                            .eq('user_id', user.id)
                            .maybeSingle();
                        isFollowing = !!followCheck;
                    }
                } catch (e) { /* ok */ }
            }

            var html = '<div class="series-nav">' +
                '<div class="series-nav__header">' +
                    '<div class="series-nav__info">' +
                        '<span class="series-nav__label">Part of series</span>' +
                        '<span class="series-nav__title">' + Security.sanitize(series.title) + '</span>' +
                        '<span class="series-nav__count">Part ' + (currentIndex + 1) + ' of ' + seriesArticles.length + '</span>' +
                    '</div>' +
                    '<button id="btn-follow-series" class="btn ' + (isFollowing ? 'btn-secondary' : 'btn-primary') + ' btn-sm" data-series-id="' + series.id + '">' +
                        (isFollowing ? 'Following Series' : 'Follow Series') +
                    '</button>' +
                '</div>';

            // Parts list
            html += '<div class="series-nav__parts">';
            for (var j = 0; j < seriesArticles.length; j++) {
                var sa = seriesArticles[j];
                var isCurrent = sa.id === article.id;
                html += '<a href="/article?slug=' + encodeURIComponent(sa.slug || '') + '" class="series-nav__part' + (isCurrent ? ' series-nav__part--current' : '') + '">' +
                    '<span class="series-nav__part-num">' + (j + 1) + '</span>' +
                    '<span class="series-nav__part-title">' + Security.sanitize(sa.title || 'Untitled') + '</span>' +
                '</a>';
            }
            html += '</div>';

            // Prev/Next navigation
            html += '<div class="series-nav__arrows">';
            if (prevArticle) {
                html += '<a href="/article?slug=' + encodeURIComponent(prevArticle.slug || '') + '" class="series-nav__arrow series-nav__arrow--prev">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>' +
                    ' Previous: ' + Security.sanitize(prevArticle.title || '').slice(0, 40) +
                '</a>';
            }
            if (nextArticle) {
                html += '<a href="/article?slug=' + encodeURIComponent(nextArticle.slug || '') + '" class="series-nav__arrow series-nav__arrow--next">' +
                    'Next: ' + Security.sanitize(nextArticle.title || '').slice(0, 40) +
                    ' <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
                '</a>';
            }
            html += '</div></div>';

            return html;
        } catch (err) {
            console.error('ArticleSeries.renderSeriesNav:', err.message);
            return '';
        }
    },

    /**
     * Bind series follow button
     */
    bindFollowHandler() {
        var btn = document.getElementById('btn-follow-series');
        if (!btn) return;

        btn.addEventListener('click', async function () {
            if (!Auth.isLoggedIn()) {
                UI.authModal('signin');
                return;
            }

            btn.disabled = true;
            try {
                var user = Auth.getUser();
                var { data, error } = await window.supabaseClient.rpc('toggle_series_follow', {
                    p_series_id: btn.dataset.seriesId,
                    p_user_id: user.id
                });

                if (error) throw error;

                if (data && data.action === 'followed') {
                    btn.textContent = 'Following Series';
                    btn.className = 'btn btn-secondary btn-sm';
                    UI.toast('You will be notified of new parts!', 'success');
                } else {
                    btn.textContent = 'Follow Series';
                    btn.className = 'btn btn-primary btn-sm';
                }
            } catch (err) {
                UI.toast('Failed to update follow', 'error');
            }
            btn.disabled = false;
        });
    },

    /**
     * Render series selector for editor
     */
    renderSeriesSelector() {
        return '<div class="series-selector" id="series-selector">' +
            '<label class="write-article__meta-label">Series (optional)</label>' +
            '<div class="series-selector__row">' +
                '<select id="meta-series" class="write-article__meta-select">' +
                    '<option value="">No Series</option>' +
                '</select>' +
                '<button id="btn-new-series" class="btn btn-ghost btn-xs" type="button">+ New</button>' +
            '</div>' +
            '<div id="new-series-form" class="series-selector__new" style="display:none">' +
                '<input type="text" id="new-series-title" placeholder="Series title..." maxlength="100" class="series-selector__input">' +
                '<input type="text" id="new-series-desc" placeholder="Short description..." maxlength="300" class="series-selector__input">' +
                '<button id="btn-create-series" class="btn btn-primary btn-xs" type="button">Create Series</button>' +
            '</div>' +
            '<div style="margin-top:4px">' +
                '<label class="write-article__meta-label" for="meta-series-order">Part #</label>' +
                '<input type="number" id="meta-series-order" class="write-article__meta-select" min="1" value="1" style="width:80px">' +
            '</div>' +
        '</div>';
    },

    /**
     * Initialize series selector in editor
     */
    async initSelector() {
        if (!Auth.isLoggedIn()) return;

        var select = document.getElementById('meta-series');
        var newBtn = document.getElementById('btn-new-series');
        var newForm = document.getElementById('new-series-form');
        var createBtn = document.getElementById('btn-create-series');

        // Load user's series
        try {
            var user = Auth.getUser();
            if (user) {
                var { data: series } = await window.supabaseClient
                    .from('article_series')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (series && select) {
                    series.forEach(function (s) {
                        var opt = document.createElement('option');
                        opt.value = s.id;
                        opt.textContent = s.title;
                        select.appendChild(opt);
                    });
                }
            }
        } catch (e) {
            console.error('ArticleSeries.initSelector:', e.message);
        }

        // Toggle new series form
        if (newBtn && newForm) {
            newBtn.addEventListener('click', function () {
                newForm.style.display = newForm.style.display === 'none' ? '' : 'none';
            });
        }

        // Create new series
        if (createBtn) {
            createBtn.addEventListener('click', async function () {
                var title = (document.getElementById('new-series-title') || {}).value || '';
                if (!title.trim()) {
                    UI.toast('Enter a series title', 'warning');
                    return;
                }

                createBtn.disabled = true;
                try {
                    var user = Auth.getUser();
                    var { data, error } = await window.supabaseClient.rpc('create_article_series', {
                        p_user_id: user.id,
                        p_title: title.trim(),
                        p_description: (document.getElementById('new-series-desc') || {}).value || ''
                    });

                    if (error) throw error;

                    // Add to select
                    if (data && select) {
                        var opt = document.createElement('option');
                        opt.value = data.id;
                        opt.textContent = data.title;
                        opt.selected = true;
                        select.appendChild(opt);
                    }

                    newForm.style.display = 'none';
                    UI.toast('Series created!', 'success');
                } catch (err) {
                    UI.toast('Failed to create series', 'error');
                }
                createBtn.disabled = false;
            });
        }
    }
};


// ═══════════════════════════════════════
// 5. READING LISTS
// ═══════════════════════════════════════
const ReadingLists = {
    /**
     * Render "Add to Reading List" button
     */
    renderAddButton(articleId) {
        return '<button id="btn-add-reading-list" class="btn btn-ghost btn-sm" data-article-id="' + articleId + '" title="Add to Reading List">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' +
            ' Save' +
        '</button>';
    },

    /**
     * Init "Add to Reading List" button
     */
    initAddButton() {
        var btn = document.getElementById('btn-add-reading-list');
        if (!btn) return;

        var self = this;
        btn.addEventListener('click', async function () {
            if (!Auth.isLoggedIn()) {
                UI.authModal('signin');
                return;
            }

            var articleId = btn.dataset.articleId;
            self._showListPicker(articleId);
        });
    },

    /**
     * Show a modal to pick or create a reading list
     */
    async _showListPicker(articleId) {
        try {
            var user = Auth.getUser();
            if (!user) return;

            // Get user's reading lists
            var { data: lists } = await window.supabaseClient
                .from('reading_lists')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            var listItems = (lists || []).map(function (l) {
                return '<button class="reading-list-picker__item" data-list-id="' + l.id + '">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' +
                    ' ' + Security.sanitize(l.title) +
                    '<span class="reading-list-picker__count">' + (l.article_count || 0) + ' articles</span>' +
                '</button>';
            }).join('');

            var modalHtml = '<div class="modal-overlay" id="reading-list-modal">' +
                '<div class="modal-content" style="max-width:400px">' +
                    '<div class="modal-header">' +
                        '<h3>Save to Reading List</h3>' +
                        '<button class="modal-close" id="close-rl-modal">&times;</button>' +
                    '</div>' +
                    '<div class="reading-list-picker">' +
                        (listItems || '<div style="text-align:center;color:var(--text-tertiary);padding:var(--space-4)">No reading lists yet</div>') +
                    '</div>' +
                    '<div class="reading-list-picker__new">' +
                        '<input type="text" id="new-list-title" placeholder="Create new list..." maxlength="100" class="reading-list-picker__input">' +
                        '<button id="btn-create-list" class="btn btn-primary btn-sm">Create</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

            var container = document.getElementById('modal-container');
            if (container) {
                container.innerHTML = modalHtml;
                container.style.display = 'block';
            }

            // Close button
            var closeBtn = document.getElementById('close-rl-modal');
            if (closeBtn) {
                closeBtn.addEventListener('click', function () {
                    container.innerHTML = '';
                    container.style.display = 'none';
                });
            }

            // Click overlay to close
            var overlay = document.getElementById('reading-list-modal');
            if (overlay) {
                overlay.addEventListener('click', function (e) {
                    if (e.target === overlay) {
                        container.innerHTML = '';
                        container.style.display = 'none';
                    }
                });
            }

            // Add to existing list
            var self = this;
            document.querySelectorAll('.reading-list-picker__item').forEach(function (item) {
                item.addEventListener('click', async function () {
                    await self._addToList(item.dataset.listId, articleId);
                    container.innerHTML = '';
                    container.style.display = 'none';
                });
            });

            // Create new list and add
            var createBtn = document.getElementById('btn-create-list');
            if (createBtn) {
                createBtn.addEventListener('click', async function () {
                    var title = (document.getElementById('new-list-title') || {}).value || '';
                    if (!title.trim()) {
                        UI.toast('Enter a list name', 'warning');
                        return;
                    }

                    createBtn.disabled = true;
                    try {
                        var slug = title.trim().toLowerCase()
                            .replace(/[^a-z0-9\s-]/g, '')
                            .replace(/\s+/g, '-')
                            .slice(0, 50) + '-' + Date.now().toString(36);

                        var { data: newList, error } = await window.supabaseClient
                            .from('reading_lists')
                            .insert({
                                user_id: user.id,
                                title: title.trim(),
                                slug: slug
                            })
                            .select()
                            .single();

                        if (error) throw error;

                        if (newList) {
                            await self._addToList(newList.id, articleId);
                        }

                        container.innerHTML = '';
                        container.style.display = 'none';
                    } catch (err) {
                        UI.toast('Failed to create list', 'error');
                        createBtn.disabled = false;
                    }
                });
            }
        } catch (err) {
            console.error('ReadingLists._showListPicker:', err.message);
        }
    },

    async _addToList(listId, articleId) {
        try {
            var user = Auth.getUser();
            var { error } = await window.supabaseClient
                .from('reading_list_items')
                .insert({
                    list_id: listId,
                    article_id: articleId,
                    added_by: user.id
                });

            if (error) {
                if (error.code === '23505') {
                    UI.toast('Already in this list', 'info');
                } else {
                    throw error;
                }
            } else {
                // Update article count via RPC or manual count
                try {
                    await window.supabaseClient.rpc('update_reading_list_count', { p_list_id: listId });
                } catch (rpcErr) {
                    // Fallback: count items manually
                    var { data: countData } = await window.supabaseClient
                        .from('reading_list_items')
                        .select('id', { count: 'exact', head: true })
                        .eq('list_id', listId);
                    // Supabase count is in the response headers for head:true, skip if unavailable
                }
                UI.toast('Added to reading list!', 'success');
            }
        } catch (err) {
            console.error('ReadingLists._addToList:', err.message);
            UI.toast('Failed to add to list', 'error');
        }
    },

    /**
     * Render a reading list card
     */
    renderListCard(list, creator) {
        var creatorName = creator ? Security.sanitize(creator.display_name || 'Anonymous') : 'Anonymous';
        return '<a href="/reading-lists?id=' + list.id + '" class="reading-list-card">' +
            '<div class="reading-list-card__cover">' +
                (list.cover_image
                    ? '<img src="' + Security.sanitize(list.cover_image) + '" alt="" loading="lazy">'
                    : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.4"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
                ) +
            '</div>' +
            '<div class="reading-list-card__body">' +
                '<div class="reading-list-card__title">' + Security.sanitize(list.title) + '</div>' +
                '<div class="reading-list-card__meta">' +
                    '<span>by ' + creatorName + '</span>' +
                    '<span>' + (list.article_count || 0) + ' articles</span>' +
                    '<span>' + (list.follower_count || 0) + ' followers</span>' +
                '</div>' +
                (list.description ? '<div class="reading-list-card__desc">' + Security.sanitize(list.description).slice(0, 100) + '</div>' : '') +
            '</div>' +
        '</a>';
    }
};


// ═══════════════════════════════════════
// 6. FOLLOWERS-ONLY GATE
// ═══════════════════════════════════════
const FollowersOnlyGate = {
    /**
     * Check if article is followers-only and user has access
     */
    async checkAccess(article) {
        if (!article.visibility || article.visibility === 'public') return true;

        // Owner always has access
        if (Auth.isLoggedIn() && Auth.getAuthId() === article.user_id) return true;

        // Admin/editor always has access
        if (Auth.isLoggedIn() && (Auth.hasRole('admin') || Auth.hasRole('editor'))) return true;

        // Check if follower
        if (Auth.isLoggedIn()) {
            try {
                var user = Auth.getUser();
                if (user && article.user_id) {
                    // Get the author's users.id from their auth_id
                    var { data: author } = await window.supabaseClient
                        .from('users')
                        .select('id')
                        .eq('auth_id', article.user_id)
                        .single();

                    if (author) {
                        var { data: followCheck } = await window.supabaseClient
                            .from('user_follows')
                            .select('follower_id')
                            .eq('follower_id', user.id)
                            .eq('following_id', author.id)
                            .maybeSingle();

                        return !!followCheck;
                    }
                }
            } catch (e) { /* fall through */ }
        }

        return false;
    },

    /**
     * Render the followers-only gate
     */
    renderGate(authorName) {
        return '<div class="followers-only-gate">' +
            '<div class="followers-only-gate__icon">' +
                '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
            '</div>' +
            '<h3 class="followers-only-gate__title">Followers-Only Content</h3>' +
            '<p class="followers-only-gate__text">This article is exclusive to followers of <strong>' + Security.sanitize(authorName || 'this author') + '</strong>.</p>' +
            '<p class="followers-only-gate__text">Follow them to unlock this and future exclusive content.</p>' +
            (Auth.isLoggedIn()
                ? '<button id="btn-follow-unlock" class="btn btn-primary">Follow to Unlock</button>'
                : '<button class="btn btn-primary" onclick="UI.authModal(\'signin\')">Sign in to Follow</button>'
            ) +
        '</div>';
    },

    /**
     * Render visibility selector for editor
     */
    renderVisibilitySelector() {
        return '<div class="visibility-selector">' +
            '<label class="write-article__meta-label">Visibility</label>' +
            '<select id="meta-visibility" class="write-article__meta-select">' +
                '<option value="public">Public (everyone)</option>' +
                '<option value="followers_only">Followers Only</option>' +
            '</select>' +
        '</div>';
    }
};
