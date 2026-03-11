// ═══════════════════════════════════════
// GROUPSMIX — components.js
// UI Module — All rendering functions
// ═══════════════════════════════════════
const UI = {

    // ─── Role Badge (RBAC) ──────────────────
    roleBadge(role) {
        if (!role || role === 'user') return '';
        if (role === 'admin') return ' <span class="role-badge role-badge--admin">' + ICONS.zap + ' Admin</span>';
        if (role === 'moderator') return ' <span class="role-badge role-badge--moderator">' + ICONS.shield + ' Mod</span>';
        if (role === 'editor') return ' <span class="role-badge role-badge--editor">' + ICONS.edit + ' Editor</span>';
        return '';
    },

    // ─── Group Card ──────────────────────────
    groupCard(group) {
        if (!group) return '';
        const tier = Algorithms.getEffectiveTier(group);
        const platform = CONFIG.platforms.find(p => p.id === group.platform);
        const trustScore = Algorithms.calculateTrustScore(group);
        const isSaved = Saved.isSaved(group.id);
        const tags = Array.isArray(group.tags) ? group.tags.slice(0, 3) : [];
        const avgRating = parseFloat(group.avg_rating) || 0;
        const views = group.views || 0;
        const likes = group.likes_count || 0;
        const commentsCount = group.comments_count || 0;

        return '<div class="group-card" data-id="' + group.id + '">' +
            '<div class="group-card__header">' +
            '<span class="group-card__platform">' + (platform?.svgIcon || platform?.emoji || ICONS.smartphone) + ' ' + Security.sanitize(platform?.name || group.platform || '') + '</span>' +
            (tier !== 'none' ? UI.trustBadge(tier) : '') +
            '</div>' +
            '<div class="group-card__body">' +
            '<div class="group-card__name">' + Security.sanitize(group.name || 'Unnamed') + '</div>' +
            '<div class="group-card__description">' + Security.sanitize(group.description || '') + '</div>' +
            (tags.length ? '<div class="group-card__tags">' + tags.map(t => '<span class="group-card__tag">' + Security.sanitize(t) + '</span>').join('') + '</div>' : '') +
            '<!-- Live Stats Bar -->' +
            '<div class="group-card__live-stats" data-group-id="' + group.id + '">' +
            '<span class="live-stat live-stat--views" data-stat="views" title="Views">' +
            '<svg class="live-stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
            '<span class="live-stat__count" data-count="views">' + UI.formatNumber(views) + '</span>' +
            '</span>' +
            '<span class="live-stat live-stat--likes" data-stat="likes" title="Like">' +
            '<svg class="live-stat__icon live-stat__heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>' +
            '<span class="live-stat__count" data-count="likes">' + UI.formatNumber(likes) + '</span>' +
            '</span>' +
            '<span class="live-stat live-stat--rating" data-stat="rating" title="Rating">' +
            '<svg class="live-stat__icon live-stat__star" viewBox="0 0 24 24" fill="' + (avgRating > 0 ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
            '<span class="live-stat__count" data-count="rating">' + avgRating.toFixed(1) + '</span>' +
            '</span>' +
            '<span class="live-stat live-stat--comments" data-stat="comments" title="Comments">' +
            '<svg class="live-stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' +
            '<span class="live-stat__count" data-count="comments">' + UI.formatNumber(commentsCount) + '</span>' +
            '</span>' +
            '<span class="live-stat live-stat--trust" data-stat="trust" title="Trust Score">' +
            '<svg class="live-stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
            '<span class="live-stat__count" data-count="trust">' + trustScore + '</span>' +
            '</span>' +
            '</div>' +
            '</div>' +
            '<div class="group-card__footer">' +
            '<button type="button" class="btn btn-primary btn-sm group-card__btn-join" data-group-id="' + group.id + '" data-group-name="' + Security.sanitize(group.name || 'Unnamed').replace(/"/g, '&quot;') + '" data-group-platform="' + (group.platform || '') + '" data-group-tier="' + tier + '">Join</button>' +
            '</div>' +
            UI.interactionToolbar(group.id, 'group') +
            '</div>';
    },

    groupGrid(groups, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!Array.isArray(groups) || !groups.length) {
            UI.emptyState(containerId, ICONS.inbox, 'No Groups Found', 'Try adjusting your filters or search terms.', 'Browse All', '/search');
            return;
        }
        container.innerHTML = '<div class="grid grid-4">' + groups.map(g => UI.groupCard(g)).join('') + '</div>';
        container.style.animation = 'fadeIn 0.3s ease';
        container.querySelectorAll('.group-card__btn-join').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const gid = btn.dataset.groupId;
                const group = groups.find(g => g.id === gid);
                if (group) UI.groupPreviewModal(group);
            });
        });
        // Initialize live stat interactions (likes, rating)
        UI.initLiveStats(container, groups);
        // Initialize interaction toolbars (Like/Dislike/Save/Comment/Share)
        UI.initInteractionToolbar(container);
    },

    groupCardSkeleton() {
        return '<div class="skeleton skeleton-card"></div>';
    },

    groupGridSkeleton(count, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '<div class="grid grid-4">' + Array(count || 12).fill('').map(() => UI.groupCardSkeleton()).join('') + '</div>';
    },

    // ─── Common Components ──────────────────
    emptyState(containerId, icon, title, description, ctaText, ctaHref) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '<div class="empty-state">' +
            '<div class="empty-state__icon">' + (icon || ICONS.inbox) + '</div>' +
            '<div class="empty-state__title">' + Security.sanitize(title || 'Nothing Here') + '</div>' +
            '<div class="empty-state__text">' + Security.sanitize(description || '') + '</div>' +
            (ctaText ? '<a href="' + (ctaHref || '#') + '" class="btn btn-primary">' + Security.sanitize(ctaText) + '</a>' : '') +
            '</div>';
    },

    errorState(containerId, retryFn) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '<div class="error-state">' +
            '<div class="error-state__icon">' + ICONS.frown + '</div>' +
            '<div class="error-state__title">Something went wrong</div>' +
            '<div class="error-state__text">We couldn\'t load this content. Please try again.</div>' +
            '<button class="btn btn-primary" id="retry-btn-' + containerId + '">' + ICONS.refresh + ' Try Again</button>' +
            '</div>';
        if (retryFn) {
            document.getElementById('retry-btn-' + containerId)?.addEventListener('click', retryFn);
        }
    },

    timeoutState(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '<div class="error-state">' +
            '<div class="error-state__icon">' + ICONS.clock + '</div>' +
            '<div class="error-state__title">Taking too long</div>' +
            '<div class="error-state__text">Please refresh the page.</div>' +
            '<button class="btn btn-primary" id="timeout-refresh-btn-' + containerId + '">' + ICONS.refresh + ' Refresh</button>' +
            '</div>';
        document.getElementById('timeout-refresh-btn-' + containerId)?.addEventListener('click', () => location.reload());
    },

    // ─── Toast ──────────────────────────────
    toast(message, type, duration) {
        type = type || 'info';
        duration = duration || CONFIG.toastDuration;
        const container = document.getElementById('toast-container');
        if (!container) return;
        const icons = { success: ICONS.check_circle, error: ICONS.x_circle, warning: ICONS.warning, info: ICONS.info };
        const toast = document.createElement('div');
        toast.className = 'toast toast--' + type;
        toast.innerHTML = '<span class="toast__icon">' + (icons[type] || ICONS.info) + '</span>' +
            '<div class="toast__content"><div class="toast__message">' + Security.sanitize(message) + '</div></div>' +
            '<button class="toast__close" aria-label="Dismiss">&times;</button>';

        const dismiss = () => {
            toast.classList.add('toast--exit');
            setTimeout(() => toast.remove(), 200);
        };
        toast.querySelector('.toast__close').addEventListener('click', dismiss);
        container.appendChild(toast);

        const toasts = container.querySelectorAll('.toast');
        if (toasts.length > CONFIG.maxToasts) toasts[0].remove();

        setTimeout(dismiss, duration);
    },

    // ─── Modal ──────────────────────────────
    modal(options) {
        UI.closeModal();
        const sizeClass = options.size === 'small' ? ' modal--small' : options.size === 'large' ? ' modal--large' : '';
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'modal-overlay';
        overlay.innerHTML = '<div class="modal' + sizeClass + '" role="dialog" aria-modal="true">' +
            '<div class="modal__header">' +
            '<h3 class="modal__title">' + Security.sanitize(options.title || '') + '</h3>' +
            '<button class="modal__close" aria-label="Close modal">&times;</button>' +
            '</div>' +
            '<div class="modal__body">' + (options.content || '') + '</div>' +
            (options.footer ? '<div class="modal__footer">' + options.footer + '</div>' : '') +
            '</div>';

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        const previousFocus = document.activeElement;

        // Issue #2 fix: store escHandler reference so it's always cleaned up on any close path
        // (not just when Escape is pressed, but also overlay click and close button)
        // Audit fix #10: also store on overlay element so closeModal() can remove it
        const escHandler = function(e) {
            if (e.key === 'Escape') { close(); }
        };
        overlay._escHandler = escHandler;
        document.addEventListener('keydown', escHandler);

        const close = () => {
            document.removeEventListener('keydown', escHandler); // Always remove on any close
            overlay.remove();
            document.body.style.overflow = '';
            if (previousFocus) previousFocus.focus();
            if (options.onClose) options.onClose();
        };

        overlay.querySelector('.modal__close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        const focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length) {
            focusable[0].focus();
            overlay.addEventListener('keydown', (e) => {
                if (e.key !== 'Tab') return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            });
        }
    },

    // Audit fix #10: also remove the escHandler listener stored on the overlay to prevent orphaned listeners
    closeModal() {
        const overlay = document.getElementById('modal-overlay');
        if (overlay) {
            // Remove escape key handler if it was stored on the overlay
            if (overlay._escHandler) {
                document.removeEventListener('keydown', overlay._escHandler);
            }
            overlay.remove();
            document.body.style.overflow = '';
        }
    },

    confirmModal(title, message, onConfirm) {
        UI.modal({
            title: title || 'Confirm',
            content: '<p style="color:var(--text-secondary)">' + Security.sanitize(message || 'Are you sure?') + '</p>',
            footer: '<button class="btn btn-secondary" id="confirm-cancel">Cancel</button>' +
                '<button class="btn btn-danger" id="confirm-yes">Yes</button>',
            size: 'small'
        });
        document.getElementById('confirm-cancel')?.addEventListener('click', UI.closeModal);
        document.getElementById('confirm-yes')?.addEventListener('click', () => { UI.closeModal(); if (onConfirm) onConfirm(); });
    },

    // ─── Auth Modal ─────────────────────────
    authModal(defaultTab) {
        const tab = defaultTab || 'signin';
        UI.modal({
            title: (tab === 'signup' ? 'Create Account' : 'Sign In to GroupsMix'),
            content: UI._authModalContent(tab),
            size: 'small'
        });
        UI._initAuthModal(tab);
    },

    /**
     * Update modal title dynamically when switching auth tabs.
     * @param {string} tab - 'signin' or 'signup'
     */
    _updateAuthModalTitle(tab) {
        var titleEl = document.querySelector('.modal__title');
        if (titleEl) {
            titleEl.textContent = (tab === 'signup' ? 'Create Account' : 'Sign In to GroupsMix');
        }
    },

    /**
     * Render password strength meter HTML.
     * Called on password input events during signup/reset.
     */
    _passwordStrengthMeter(password) {
        var strength = Security.getPasswordStrength(password);
        var pct = (strength.score / 4) * 100;
        return '<div class="password-strength" style="margin-top:var(--space-1)">' +
            '<div style="height:4px;background:var(--bg-tertiary);border-radius:var(--radius-full);overflow:hidden">' +
            '<div style="height:100%;width:' + pct + '%;background:' + strength.color + ';border-radius:var(--radius-full);transition:width 0.3s ease,background 0.3s ease"></div>' +
            '</div>' +
            '<div style="font-size:var(--text-xs);color:' + strength.color + ';margin-top:2px">' + Security.sanitize(strength.label) + '</div>' +
            '</div>';
    },

    _authModalContent(tab) {
        return '<div class="auth-tabs">' +
            '<button class="auth-tab' + (tab === 'signin' ? ' auth-tab--active' : '') + '" data-tab="signin">Sign In</button>' +
            '<button class="auth-tab' + (tab === 'signup' ? ' auth-tab--active' : '') + '" data-tab="signup">Sign Up</button>' +
            '</div>' +
            '<div id="auth-error" class="auth-form__error hidden"></div>' +
            '<form id="auth-form">' +
            '<div id="auth-name-group" class="form-group' + (tab === 'signin' ? ' hidden' : '') + '">' +
            '<label class="form-label" for="auth-name">Display Name</label>' +
            '<input type="text" id="auth-name" class="form-input" placeholder="Your name" minlength="2" maxlength="50">' +
            '</div>' +
            '<div class="form-group">' +
            '<label class="form-label" for="auth-email">Email</label>' +
            '<input type="email" id="auth-email" class="form-input" placeholder="you@example.com" autocomplete="email" required>' +
            '</div>' +
            '<div class="form-group">' +
            '<label class="form-label" for="auth-password">Password</label>' +
            '<div class="password-wrapper">' +
            '<input type="password" id="auth-password" class="form-input" placeholder="Min 8 characters (Aa1!@)" minlength="8" autocomplete="' + (tab === 'signup' ? 'new-password' : 'current-password') + '" required>' +
            '<button type="button" class="password-toggle" aria-label="Toggle password visibility">' + ICONS.eye + '</button>' +
            '</div>' +
            '</div>' +
            (tab === 'signup' ? '<div id="password-strength-container"></div>' : '') +
            '<div id="auth-confirm-group" class="form-group' + (tab === 'signin' ? ' hidden' : '') + '">' +
            '<label class="form-label" for="auth-confirm">Confirm Password</label>' +
            '<div class="password-wrapper">' +
            '<input type="password" id="auth-confirm" class="form-input" placeholder="Confirm password" autocomplete="new-password"' + (tab === 'signup' ? ' required' : '') + '>' +
            '<button type="button" class="password-toggle" aria-label="Toggle password visibility">' + ICONS.eye + '</button>' +
            '</div>' +
            '</div>' +
            (tab === 'signup' ? '<div class="form-group" id="auth-turnstile-wrapper"><div id="auth-turnstile-widget"></div></div>' : '') +
            (tab === 'signin' ? '<div style="text-align:right;margin-bottom:var(--space-4)"><a href="#" id="forgot-password-link" style="font-size:var(--text-sm)">Forgot Password?</a></div>' : '') +
            '<button type="submit" class="btn btn-primary btn-full" id="auth-submit">' + (tab === 'signup' ? ICONS.rocket + ' Create Account' : ICONS.lock + ' Sign In') + '</button>' +
            '</form>' +
            '<div class="auth-footer">' +
            (tab === 'signin' ? 'Don\'t have an account? <a id="switch-to-signup">Sign Up</a>' : 'Already have an account? <a id="switch-to-signin">Sign In</a>') +
            '</div>';
    },

    _initAuthModal(tab) {
        let currentTab = tab;
        document.querySelectorAll('.auth-tab').forEach(t => {
            t.addEventListener('click', () => {
                currentTab = t.dataset.tab;
                const savedEmail = document.getElementById('auth-email')?.value || '';
                const body = document.querySelector('.modal__body');
                // Bug fix: update modal title when switching tabs
                UI._updateAuthModalTitle(currentTab);
                if (body) { body.innerHTML = UI._authModalContent(currentTab); UI._initAuthModal(currentTab); }
                const emailEl = document.getElementById('auth-email');
                if (emailEl && savedEmail) emailEl.value = savedEmail;
            });
        });
        document.querySelectorAll('.password-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = btn.previousElementSibling;
                if (input) { input.type = input.type === 'password' ? 'text' : 'password'; btn.innerHTML = input.type === 'password' ? ICONS.eye : ICONS.eye_off; }
            });
        });
        // Security: real-time password strength meter during signup
        if (currentTab === 'signup') {
            var pwInput = document.getElementById('auth-password');
            var strengthContainer = document.getElementById('password-strength-container');
            if (pwInput && strengthContainer) {
                pwInput.addEventListener('input', function() {
                    strengthContainer.innerHTML = pwInput.value ? UI._passwordStrengthMeter(pwInput.value) : '';
                });
            }
        }
        document.getElementById('switch-to-signup')?.addEventListener('click', (e) => {
            e.preventDefault();
            const savedEmail = document.getElementById('auth-email')?.value || '';
            const body = document.querySelector('.modal__body');
            // Bug fix: update modal title when switching to signup
            UI._updateAuthModalTitle('signup');
            if (body) { body.innerHTML = UI._authModalContent('signup'); UI._initAuthModal('signup'); }
            const emailEl = document.getElementById('auth-email');
            if (emailEl && savedEmail) emailEl.value = savedEmail;
        });
        // ── Turnstile CAPTCHA: poll for SDK readiness ──────────────
        // The Turnstile SDK loads with async/defer so it may not be
        // available when the modal first opens. We poll every 200 ms
        // for up to 10 seconds, then render the widget once ready.
        if (currentTab === 'signup' && CONFIG.turnstileSiteKey) {
            window._authTurnstileToken = null;
            var _tsAttempts = 0, _tsMaxAttempts = 50; // 50 × 200 ms = 10 s
            var _tsWidgetEl = document.getElementById('auth-turnstile-widget');
            if (_tsWidgetEl) {
                // Show a small loading indicator while SDK loads
                _tsWidgetEl.innerHTML = '<div style="text-align:center;padding:var(--space-2);color:var(--text-tertiary);font-size:var(--text-sm)">Loading CAPTCHA…</div>';
            }
            (function pollTurnstile() {
                if (typeof turnstile !== 'undefined') {
                    var el = document.getElementById('auth-turnstile-widget');
                    if (el) {
                        el.innerHTML = ''; // clear loading text
                        turnstile.render('#auth-turnstile-widget', {
                            sitekey: CONFIG.turnstileSiteKey,
                            callback: function(token) { window._authTurnstileToken = token; }
                        });
                    }
                } else if (++_tsAttempts < _tsMaxAttempts) {
                    setTimeout(pollTurnstile, 200);
                } else {
                    // Audit fix #7: SDK never loaded — do NOT set a bypass token.
                    // Instead, block the action and inform the user.
                    var el = document.getElementById('auth-turnstile-wrapper');
                    if (el) el.innerHTML = '<div style="color:var(--text-warning, #f59e0b);font-size:var(--text-xs);text-align:center">CAPTCHA failed to load. Please disable your ad blocker or try a different browser, then refresh.</div>';
                    window._authTurnstileToken = null;
                }
            })();
        }
        document.getElementById('switch-to-signin')?.addEventListener('click', (e) => {
            e.preventDefault();
            const savedEmail = document.getElementById('auth-email')?.value || '';
            const body = document.querySelector('.modal__body');
            // Bug fix: update modal title when switching to signin
            UI._updateAuthModalTitle('signin');
            if (body) { body.innerHTML = UI._authModalContent('signin'); UI._initAuthModal('signin'); }
            const emailEl = document.getElementById('auth-email');
            if (emailEl && savedEmail) emailEl.value = savedEmail;
        });
        document.getElementById('forgot-password-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            const body = document.querySelector('.modal__body');
            if (body) {
                body.innerHTML = '<div style="text-align:center;margin-bottom:var(--space-6)"><p style="color:var(--text-secondary)">Enter your email to receive a reset link</p></div>' +
                    '<form id="reset-form"><div class="form-group"><label class="form-label" for="reset-email">Email</label>' +
                    '<input type="email" id="reset-email" class="form-input" placeholder="you@example.com" required></div>' +
                    '<button type="submit" class="btn btn-primary btn-full">Send Reset Link</button></form>' +
                    '<div class="auth-footer" style="margin-top:var(--space-4)"><a id="back-to-signin" href="#">← Back to Sign In</a></div>';
                document.getElementById('back-to-signin')?.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    body.innerHTML = UI._authModalContent('signin');
                    UI._initAuthModal('signin');
                });
                document.getElementById('reset-form')?.addEventListener('submit', async (ev) => {
                    ev.preventDefault();
                    const email = document.getElementById('reset-email')?.value?.trim();
                    if (!email || !Security.isValidEmail(email)) { UI.toast('Please enter a valid email', 'error'); return; }
                    const btn = ev.target.querySelector('button[type="submit"]');
                    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Sending...'; }
                    await Auth.resetPassword(email);
                    UI.closeModal();
                });
            }
        });
        document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = document.getElementById('auth-error');
            if (errEl) errEl.classList.add('hidden');
            const email = document.getElementById('auth-email')?.value?.trim();
            const password = document.getElementById('auth-password')?.value;
            if (!email || !Security.isValidEmail(email)) { showAuthError('Please enter a valid email address'); return; }
            if (!password || password.length < 8) { showAuthError('Password must be at least 8 characters'); return; }
            // Security: enforce strong password on signup via client-side check
            if (currentTab === 'signup') {
                var pwCheck = Security.validatePassword(password);
                if (!pwCheck.valid) { showAuthError(pwCheck.errors.join('. ')); return; }
            }
            const btn = document.getElementById('auth-submit');
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> ' + (currentTab === 'signup' ? 'Creating...' : 'Signing in...'); }
            if (currentTab === 'signup') {
                const name = document.getElementById('auth-name')?.value?.trim();
                const confirm = document.getElementById('auth-confirm')?.value;
                if (!name || name.length < 2) { showAuthError('Display name must be at least 2 characters'); resetBtn(); return; }
                if (password !== confirm) { showAuthError('Passwords do not match'); resetBtn(); return; }
                if (Security.isDisposableEmail(email)) { showAuthError('Disposable email addresses are not allowed'); resetBtn(); return; }
                if (CONFIG.turnstileSiteKey && !window._authTurnstileToken) { showAuthError('Please complete the CAPTCHA verification.'); resetBtn(); return; }
                const result = await Auth.signUp(email, password, name, window._authTurnstileToken);
                if (result === 'email_verification_pending') {
                    // ── Show "check your email" confirmation screen ──
                    const body = document.querySelector('.modal__body');
                    if (body) {
                        body.innerHTML =
                            '<div style="text-align:center;padding:var(--space-6) 0">' +
                            '<div style="font-size:3rem;margin-bottom:var(--space-4)">' + ICONS.search + '</div>' +
                            '<h3 style="margin-bottom:var(--space-3)">Check your email</h3>' +
                            '<p style="color:var(--text-secondary);margin-bottom:var(--space-4)">' +
                            'We sent a confirmation link to <strong>' + Security.sanitize(email) + '</strong>.<br>' +
                            'Click the link in the email to activate your account.</p>' +
                            '<div style="background:var(--bg-card);border:1px solid var(--border-primary);border-radius:var(--radius-lg);padding:var(--space-4);margin-bottom:var(--space-6);text-align:left">' +
                            '<p style="font-size:var(--text-sm);color:var(--text-secondary);margin:0">' +
                            '<strong style="color:var(--text-primary)">Didn\'t get the email?</strong><br>' +
                            '&bull; Check your spam / junk folder<br>' +
                            '&bull; Make sure <strong>' + Security.sanitize(email) + '</strong> is correct<br>' +
                            '&bull; Wait a few minutes and try again</p>' +
                            '</div>' +
                            '<button class="btn btn-primary btn-full" id="verify-close-btn">Got it</button>' +
                            '<button class="btn btn-secondary btn-full" id="resend-signup-verify-btn" style="margin-top:var(--space-3)">Resend Verification Email</button>' +
                            '<p style="margin-top:var(--space-4);font-size:var(--text-sm);color:var(--text-secondary)">' +
                            'Already confirmed? <a href="#" id="verify-signin-link">Sign In</a></p>' +
                            '</div>';
                        document.getElementById('verify-close-btn')?.addEventListener('click', () => UI.closeModal());
                        document.getElementById('resend-signup-verify-btn')?.addEventListener('click', async function() {
                            this.disabled = true;
                            this.innerHTML = '<span class="btn-spinner"></span> Sending...';
                            await Auth.resendVerification(email);
                            this.disabled = false;
                            this.textContent = 'Resend Verification Email';
                        });
                        document.getElementById('verify-signin-link')?.addEventListener('click', (ev) => {
                            ev.preventDefault();
                            body.innerHTML = UI._authModalContent('signin');
                            UI._initAuthModal('signin');
                        });
                    }
                } else if (result) {
                    UI.closeModal();
                    // Redirect to dashboard after successful sign-up (instant login)
                    // If already on dashboard, just re-init instead of full reload
                    var _onDash = window.location.pathname === '/dashboard' || window.location.pathname === '/pages/user/dashboard';
                    if (_onDash && typeof initDashboard === 'function') {
                        renderHeader(); initDashboard();
                    } else {
                        window.location.href = '/dashboard';
                    }
                } else {
                    resetBtn();
                }
            } else {
                const result = await Auth.signIn(email, password);
                if (result === 'email_not_confirmed') {
                    // ── Show "verify your email" screen with resend option ──
                    const body = document.querySelector('.modal__body');
                    if (body) {
                        body.innerHTML =
                            '<div style="text-align:center;padding:var(--space-6) 0">' +
                            '<div style="font-size:3rem;margin-bottom:var(--space-4)">' + ICONS.search + '</div>' +
                            '<h3 style="margin-bottom:var(--space-3)">Email not verified</h3>' +
                            '<p style="color:var(--text-secondary);margin-bottom:var(--space-4)">' +
                            'Your account exists but the email <strong>' + Security.sanitize(email) + '</strong> has not been confirmed yet.</p>' +
                            '<button class="btn btn-primary btn-full" id="resend-verify-btn">Resend Verification Email</button>' +
                            '<p style="margin-top:var(--space-4);font-size:var(--text-sm);color:var(--text-secondary)">' +
                            'Already confirmed? <a href="#" id="retry-signin-link">Try Sign In again</a></p>' +
                            '</div>';
                        document.getElementById('resend-verify-btn')?.addEventListener('click', async function() {
                            this.disabled = true;
                            this.innerHTML = '<span class="btn-spinner"></span> Sending...';
                            await Auth.resendVerification(email);
                            this.disabled = false;
                            this.textContent = 'Resend Verification Email';
                        });
                        document.getElementById('retry-signin-link')?.addEventListener('click', (ev) => {
                            ev.preventDefault();
                            body.innerHTML = UI._authModalContent('signin');
                            UI._initAuthModal('signin');
                        });
                    }
                } else if (result) {
                    UI.closeModal();
                    // Redirect to dashboard after successful sign-in
                    // If already on dashboard, just re-init instead of full reload
                    var _onDash = window.location.pathname === '/dashboard' || window.location.pathname === '/pages/user/dashboard';
                    if (_onDash && typeof initDashboard === 'function') {
                        renderHeader(); initDashboard();
                    } else {
                        window.location.href = '/dashboard';
                    }
                } else {
                    resetBtn();
                }
            }
            function resetBtn() { if (btn) { btn.disabled = false; btn.innerHTML = currentTab === 'signup' ? ICONS.rocket + ' Create Account' : ICONS.lock + ' Sign In'; } }
            function showAuthError(msg) { if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); } }
        });
    },

    // ─── Pagination ─────────────────────────
    pagination(current, total, callback) {
        if (total <= 1) return '';
        let pages = [];
        if (total <= 7) {
            for (let i = 1; i <= total; i++) pages.push(i);
        } else {
            pages.push(1);
            if (current > 3) pages.push('...');
            for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
            if (current < total - 2) pages.push('...');
            pages.push(total);
        }
        return '<nav class="pagination" aria-label="Pagination">' +
            '<button class="pagination__btn"' + (current === 1 ? ' disabled' : '') + ' data-page="' + (current - 1) + '" aria-label="Previous page">←</button>' +
            pages.map(p => {
                if (p === '...') return '<span class="pagination__ellipsis">…</span>';
                return '<button class="pagination__btn' + (p === current ? ' pagination__btn--active' : '') + '" data-page="' + p + '"' +
                    (p === current ? ' aria-current="page"' : '') + ' aria-label="Page ' + p + '">' + p + '</button>';
            }).join('') +
            '<button class="pagination__btn"' + (current === total ? ' disabled' : '') + ' data-page="' + (current + 1) + '" aria-label="Next page">→</button>' +
            '</nav>';
    },

    initPagination(containerId, callback) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.pagination__btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page);
                if (!isNaN(page) && !btn.disabled) callback(page);
            });
        });
    },

    // ─── Trust & Rating ─────────────────────
    trustBadge(tier) {
        const badges = {
            verified: '<span class="vip-badge vip-badge--verified">' + ICONS.check_circle + ' Verified</span>',
            niche: '<span class="vip-badge vip-badge--niche">' + ICONS.globe + ' Niche</span>',
            global: '<span class="vip-badge vip-badge--global">' + ICONS.globe + ' Global</span>',
            diamond: '<span class="vip-badge vip-badge--diamond">' + ICONS.sparkles + ' Diamond</span>'
        };
        return badges[tier] || '';
    },

    trustScore(score) {
        const s = isNaN(score) ? 0 : Math.max(0, Math.min(100, Number(score)));
        let color = 'var(--error)';
        if (s > 80) color = 'var(--success)';
        else if (s > 60) color = 'var(--info)';
        else if (s > 30) color = 'var(--warning)';
        return '<div class="trust-score">' +
            '<div class="trust-score__bar"><div class="trust-score__fill" style="width:' + s + '%;background:' + color + '"></div></div>' +
            '<span class="trust-score__value" style="color:' + color + '">' + s + '</span>' +
            '</div>';
    },

    starRating(rating, interactive, onChange) {
        const r = parseFloat(rating) || 0;
        const cls = interactive ? ' star-rating--interactive' : '';
        let html = '<div class="star-rating' + cls + '">';
        for (let i = 1; i <= 5; i++) {
            const filled = i <= Math.round(r);
            html += '<span class="star-rating__star star-rating__star--' + (filled ? 'filled' : 'empty') + '" data-value="' + i + '">' + (filled ? ICONS.star : '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>') + '</span>';
        }
        html += '</div>';
        return html;
    },

    initStarRating(container, onChange) {
        if (!container) return;
        container.querySelectorAll('.star-rating__star').forEach(star => {
            star.addEventListener('click', () => {
                const val = parseInt(star.dataset.value);
                container.querySelectorAll('.star-rating__star').forEach((s, i) => {
                    s.className = 'star-rating__star star-rating__star--' + (i < val ? 'filled' : 'empty');
                    s.innerHTML = i < val ? ICONS.star : '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
                });
                if (onChange) onChange(val);
            });
        });
    },

    reviewCard(review) {
        if (!review) return '';
        const initial = (review.display_name || 'A').charAt(0).toUpperCase();
        return '<div class="review-card">' +
            '<div class="review-card__header">' +
            '<div class="review-card__avatar">' + initial + '</div>' +
            '<div><div class="review-card__name">' + Security.sanitize(review.display_name || 'Anonymous') + UI.roleBadge(review.role) + '</div>' +
            '<div class="review-card__date">' + UI.formatDate(review.created_at) + '</div></div>' +
            '<div style="margin-left:auto">' + UI.starRating(review.rating) + '</div>' +
            '</div>' +
            (review.text ? '<div class="review-card__text">' + Security.sanitize(review.text) + '</div>' : '') +
            '</div>';
    },

    // ─── Article Card ───────────────────────
    articleCard(article) {
        if (!article) return '';
        return '<div class="article-card-wrapper">' +
            '<a href="/article?slug=' + encodeURIComponent(article.slug || '') + '" class="card card--clickable article-card">' +
            (article.cover_image ? '<img class="article-card__image" src="' + Security.sanitize(article.cover_image) + '" alt="' + Security.sanitize(article.title || 'Article cover image').replace(/"/g, '&quot;') + '" loading="lazy">' : '<div class="article-card__image skeleton"></div>') +
            '<div class="article-card__body">' +
            '<div class="article-card__title">' + Security.sanitize(article.title || '') + '</div>' +
            '<div class="article-card__excerpt">' + Security.sanitize(article.excerpt || '') + '</div>' +
            '<div class="article-card__meta"><span>' + Security.sanitize(article.author_name || '') + '</span><span>' + ICONS.eye + ' ' + UI.formatNumber(article.views || 0) + '</span></div>' +
            '</div>' +
            '</a>' +
            UI.interactionToolbar(article.slug || article.id, 'article') +
            '</div>';
    },

    articleCardSkeleton() {
        return '<div class="card article-card"><div class="skeleton" style="height:180px"></div><div style="padding:var(--space-4)"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text" style="width:90%"></div><div class="skeleton skeleton-text" style="width:70%"></div></div></div>';
    },

    // ─── Ad Card ────────────────────────────
    // Audit fix #2: use sanitizeUrl() for href/src attributes to block javascript: protocol XSS
    adCard(ad) {
        if (!ad) return '';
        return '<a href="' + Security.sanitizeUrl(ad.link || '#') + '" target="_blank" rel="noopener noreferrer" class="ad-card" data-ad-id="' + ad.id + '">' +
            '<span class="ad-card__label">Ad</span>' +
            (ad.image_url ? '<img class="ad-card__image" src="' + Security.sanitizeUrl(ad.image_url) + '" alt="' + Security.sanitize(ad.title || 'Advertisement').replace(/"/g, '&quot;') + '" loading="lazy">' : '') +
            '<div class="ad-card__body">' +
            '<div class="ad-card__title">' + Security.sanitize(ad.title || '') + '</div>' +
            '<div class="ad-card__desc">' + Security.sanitize(ad.description || '') + '</div>' +
            '</div>' +
            '</a>';
    },

    // ─── Marketplace Listing Card ───────────
    marketplaceCard(listing) {
        if (!listing) return '';
        var safeTitle = Security.sanitize(listing.title || 'Untitled');
        var safeDesc = Security.sanitize(listing.description || '');
        var platformId = listing.platform || 'other';
        var platformIcon = ICONS[platformId] || ICONS.globe || '';
        var platformName = platformId.charAt(0).toUpperCase() + platformId.slice(1);
        var price = parseFloat(listing.price) || 0;
        var currency = listing.currency || 'USD';
        var priceDisplay = price > 0 ? UI.formatCurrency(price) : 'Contact';
        var sellerId = listing.seller_id || '';
        var impressions = listing.impressions || 0;
        var clicks = listing.clicks || 0;

        return '<article class="mk-listing-card" data-listing-id="' + listing.id + '" data-seller-id="' + sellerId + '">' +
            '<div class="mk-listing-card__header">' +
            '<span class="mk-listing-card__platform" title="' + platformName + '">' + platformIcon + '</span>' +
            '<span class="mk-listing-card__price">' + priceDisplay + '</span>' +
            '<button type="button" class="mk-listing-card__report" data-listing-id="' + listing.id + '" title="Report listing" aria-label="Report listing">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>' +
            '</button>' +
            '</div>' +
            '<div class="mk-listing-card__body">' +
            '<div class="mk-listing-card__title">' + safeTitle + '</div>' +
            '<div class="mk-listing-card__desc">' + safeDesc + '</div>' +
            '</div>' +
            '<div class="mk-listing-card__seller">' +
            '<a href="/seller?id=' + sellerId + '" class="mk-listing-card__seller-link" title="View seller profile">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
            ' <span class="mk-listing-card__seller-name">Seller</span>' +
            '</a>' +
            '<span class="mk-listing-card__rating" title="Seller rating">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
            ' <span class="mk-listing-card__rating-value" data-seller-id="' + sellerId + '">--</span>' +
            '</span>' +
            '</div>' +
            '<div class="mk-listing-card__footer">' +
            '<span class="mk-listing-card__stats">' +
            '<span title="Views">' + UI.formatNumber(impressions) + ' views</span>' +
            '<span title="Clicks">' + UI.formatNumber(clicks) + ' clicks</span>' +
            '</span>' +
            '<a href="/seller?id=' + sellerId + '#listing-' + listing.id + '" class="btn btn-primary btn-sm mk-listing-card__contact">Contact</a>' +
            '</div>' +
            UI.interactionToolbar(listing.id, 'marketplace') +
            '</article>';
    },

    /**
     * Render a grid of marketplace listing cards.
     */
    marketplaceGrid(listings, containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        if (!Array.isArray(listings) || !listings.length) {
            UI.emptyState(containerId, ICONS.inbox, 'No Listings Found', 'Be the first to sell something! Only social media services accepted.', 'Sell Now', '/sell');
            return;
        }
        container.innerHTML = '<div class="mk-listings-grid">' + listings.map(function(l) { return UI.marketplaceCard(l); }).join('') + '</div>';
        container.style.animation = 'fadeIn 0.3s ease';
        // Initialize interaction toolbars
        UI.initInteractionToolbar(container);
        // Report button handlers
        container.querySelectorAll('.mk-listing-card__report').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                var listingId = btn.dataset.listingId;
                if (!listingId) return;
                UI.confirmModal('Report this listing?', 'Are you sure you want to report this listing? Our team will review it.', function() {
                    if (typeof Marketplace !== 'undefined') Marketplace.reportListing(listingId);
                });
            });
        });
        // Track impressions
        listings.forEach(function(l) {
            if (typeof Marketplace !== 'undefined') Marketplace.incrementImpressions(l.id);
        });
        // Load seller ratings async
        UI._loadSellerRatings(container, listings);
    },

    /**
     * Load seller ratings for marketplace cards (async, non-blocking).
     */
    async _loadSellerRatings(container, listings) {
        try {
            var sellerIds = [];
            listings.forEach(function(l) {
                if (l.seller_id && sellerIds.indexOf(l.seller_id) === -1) sellerIds.push(l.seller_id);
            });
            for (var i = 0; i < sellerIds.length; i++) {
                try {
                    var stats = await window.supabaseClient.rpc('get_seller_stats', { p_seller_id: sellerIds[i] });
                    var data = stats.data;
                    if (Array.isArray(data) && data.length > 0) data = data[0];
                    if (data) {
                        var rating = parseFloat(data.avg_rating) || 0;
                        container.querySelectorAll('.mk-listing-card__rating-value[data-seller-id="' + sellerIds[i] + '"]').forEach(function(el) {
                            el.textContent = rating > 0 ? rating.toFixed(1) : 'New';
                        });
                    }
                } catch (e) { /* ignore individual seller rating errors */ }
            }
        } catch (err) { console.warn('_loadSellerRatings:', err.message); }
    },

    /**
     * Star rating input component for reviews.
     * @param {string} containerId
     * @param {Function} onChange - called with rating value (1-5)
     */
    starRatingInput(containerId, onChange) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var html = '<div class="star-rating-input">';
        for (var i = 1; i <= 5; i++) {
            html += '<button type="button" class="star-rating-input__star" data-rating="' + i + '" aria-label="Rate ' + i + ' star' + (i > 1 ? 's' : '') + '">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
                '</button>';
        }
        html += '</div>';
        container.innerHTML = html;
        var currentRating = 0;
        container.querySelectorAll('.star-rating-input__star').forEach(function(star) {
            star.addEventListener('click', function() {
                currentRating = parseInt(star.dataset.rating);
                container.querySelectorAll('.star-rating-input__star svg').forEach(function(svg, idx) {
                    svg.setAttribute('fill', idx < currentRating ? 'currentColor' : 'none');
                });
                if (typeof onChange === 'function') onChange(currentRating);
            });
            star.addEventListener('mouseenter', function() {
                var r = parseInt(star.dataset.rating);
                container.querySelectorAll('.star-rating-input__star svg').forEach(function(svg, idx) {
                    svg.setAttribute('fill', idx < r ? 'currentColor' : 'none');
                });
            });
        });
        container.addEventListener('mouseleave', function() {
            container.querySelectorAll('.star-rating-input__star svg').forEach(function(svg, idx) {
                svg.setAttribute('fill', idx < currentRating ? 'currentColor' : 'none');
            });
        });
    },

    // ─── Formatting ─────────────────────────
    formatDate(isoString) {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return '';
            const now = Date.now();
            const diff = now - date.getTime();
            if (diff < 60000) return 'Just now';
            /* Fix: handle singular forms (1 minute ago, 1 hour ago, 1 day ago) */
            const mins = Math.floor(diff / 60000);
            if (diff < 3600000) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
            const hrs = Math.floor(diff / 3600000);
            if (diff < 86400000) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
            const days = Math.floor(diff / 86400000);
            if (diff < 604800000) return days + (days === 1 ? ' day ago' : ' days ago');
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch { return ''; }
    },

    formatNumber(n) {
        const num = isNaN(n) ? 0 : Number(n);
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    },

    formatCurrency(amount) {
        const a = parseFloat(amount) || 0;
        return '$' + a.toFixed(2);
    },

    // ─── Utilities ──────────────────────────
    countUp(element, target, duration) {
        if (!element) return;
        const t = isNaN(target) ? 0 : Number(target);
        const d = duration || 1500;
        let start = 0;
        const step = (timestamp) => {
            if (!start) start = timestamp;
            const progress = Math.min((timestamp - start) / d, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            element.textContent = UI.formatNumber(Math.floor(eased * t));
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    },

    debounce(fn, delay) {
        let timer;
        return function (...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay || CONFIG.debounceDelay); };
    },

    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            UI.toast('Copied to clipboard!', 'success');
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
            UI.toast('Copied to clipboard!', 'success');
        }
    },

    async shareGroup(group) {
        if (!group) return;
        const url = CONFIG.siteUrl + '/group?id=' + group.id;
        const text = 'Check out ' + (group.name || 'this group') + ' on GroupsMix!';
        if (navigator.share) {
            try { await navigator.share({ title: group.name, text, url }); }
            catch { UI.copyToClipboard(url); }
        } else {
            UI.copyToClipboard(url);
        }
    },

    // ─── Search Filters ────────────────────
    searchFilters(options, onFilter) {
        const platforms = '<option value="">All Platforms</option>' + CONFIG.platforms.map(p => '<option value="' + p.id + '"' + (options.platform === p.id ? ' selected' : '') + '>' + (p.emoji || '') + ' ' + p.name + '</option>').join('');
        const categories = '<option value="">All Categories</option>' + CONFIG.categories.map(c => '<option value="' + c.id + '"' + (options.category === c.id ? ' selected' : '') + '>' + c.emoji + ' ' + c.name + '</option>').join('');
        const countries = '<option value="">All Countries</option>' + CONFIG.countries.map(c => '<option value="' + c.code + '"' + (options.country === c.code ? ' selected' : '') + '>' + c.flag + ' ' + c.name + '</option>').join('');
        // Issue 12 fix: aligned sorts indentation to match platforms, categories, countries above
        const sorts = ['<option value="ranking"' + (options.sort === 'ranking' ? ' selected' : '') + '>Ranking</option>',
            '<option value="newest"' + (options.sort === 'newest' ? ' selected' : '') + '>Newest</option>',
            '<option value="views"' + (options.sort === 'views' ? ' selected' : '') + '>Most Viewed</option>',
            '<option value="rating"' + (options.sort === 'rating' ? ' selected' : '') + '>Top Rated</option>',
            '<option value="trending"' + (options.sort === 'trending' ? ' selected' : '') + '>Trending</option>'].join('');

        return '<div class="filter-bar">' +
            '<div class="form-group"><label class="form-label">Platform</label><select class="form-select" id="filter-platform">' + platforms + '</select></div>' +
            '<div class="form-group"><label class="form-label">Category</label><select class="form-select" id="filter-category">' + categories + '</select></div>' +
            '<div class="form-group"><label class="form-label">Country</label><select class="form-select" id="filter-country">' + countries + '</select></div>' +
            '<div class="form-group"><label class="form-label">Sort</label><select class="form-select" id="filter-sort">' + sorts + '</select></div>' +
            '</div>';
    },

    // ─── Group Preview Modal ────────────
    groupPreviewModal(group) {
        if (!group) return;
        const platform = CONFIG.platforms.find(p => p.id === group.platform);
        const tier = Algorithms.getEffectiveTier(group);
        const trustScore = Algorithms.calculateTrustScore(group);

        const badgeMap = {
            verified: '<span class="gpm-badge gpm-badge--verified">&#9989; Safety Verified</span>',
            niche: '<span class="gpm-badge gpm-badge--niche">&#128309; Niche Verified</span>',
            global: '<span class="gpm-badge gpm-badge--global">&#128993; Global Verified</span>',
            diamond: '<span class="gpm-badge gpm-badge--diamond">&#128142; Diamond Verified</span>'
        };
        const safetyBadge = badgeMap[tier] || '<span class="gpm-badge gpm-badge--default">&#128737; Community Group</span>';

        const content = '<div class="gpm-preview">' +
            '<div class="gpm-preview__icon">' + (platform?.emoji || '&#128241;') + '</div>' +
            '<div class="gpm-preview__name">' + Security.sanitize(group.name || 'Unnamed') + '</div>' +
            '<div class="gpm-preview__platform">' + Security.sanitize(platform?.name || group.platform || '') + '</div>' +
            '<div class="gpm-preview__badge">' + safetyBadge + '</div>' +
            (group.description ? '<div class="gpm-preview__desc">' + Security.sanitize(group.description) + '</div>' : '') +
            '<div class="gpm-preview__stats">' +
            '<div class="gpm-preview__stat"><span class="gpm-preview__stat-value">&#128065; ' + UI.formatNumber(group.views || 0) + '</span><span class="gpm-preview__stat-label">Views</span></div>' +
            '<div class="gpm-preview__stat"><span class="gpm-preview__stat-value">&#11088; ' + (parseFloat(group.avg_rating) || 0).toFixed(1) + '</span><span class="gpm-preview__stat-label">Rating</span></div>' +
            '<div class="gpm-preview__stat"><span class="gpm-preview__stat-value">&#128737;&#65039; ' + trustScore + '</span><span class="gpm-preview__stat-label">Trust</span></div>' +
            '</div>' +
            '</div>';

        const footer = '<a href="/go?id=' + encodeURIComponent(group.id) + '" class="btn btn-primary btn-lg gpm-preview__confirm">Confirm &amp; Redirect &#8594;</a>';

        UI.modal({
            title: '&#128279; Group Preview',
            content: content,
            footer: footer,
            size: 'small'
        });

        /* Increment views on preview */
        DB.groups.incrementViews(group.id);
    },

    initFilters(onFilter) {
        ['filter-platform', 'filter-category', 'filter-country', 'filter-sort'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => {
                if (onFilter) onFilter({
                    platform: document.getElementById('filter-platform')?.value || '',
                    category: document.getElementById('filter-category')?.value || '',
                    country: document.getElementById('filter-country')?.value || '',
                    sort: document.getElementById('filter-sort')?.value || 'ranking'
                });
            });
        });
    },

    // ═══════════════════════════════════════
    // Interaction Toolbar (Like/Dislike/Save/Comment/Share)
    // ═══════════════════════════════════════
    interactionToolbar(contentId, contentType) {
        const isLiked = Interactions.isActive(contentId, contentType, 'like');
        const isDisliked = Interactions.isActive(contentId, contentType, 'dislike');
        const isSaved = Interactions.isActive(contentId, contentType, 'save');
        return '<div class="ix-toolbar" data-content-id="' + contentId + '" data-content-type="' + contentType + '">' +
            '<button class="ix-btn ix-btn--like' + (isLiked ? ' ix-btn--active' : '') + '" data-action="like" aria-label="Like" title="Like">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + (isLiked ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>' +
            '</button>' +
            '<button class="ix-btn ix-btn--dislike' + (isDisliked ? ' ix-btn--active' : '') + '" data-action="dislike" aria-label="Dislike" title="Dislike">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + (isDisliked ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>' +
            '</button>' +
            '<button class="ix-btn ix-btn--save' + (isSaved ? ' ix-btn--active' : '') + '" data-action="save" aria-label="Save" title="Save">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + (isSaved ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' +
            '</button>' +
            '<button class="ix-btn ix-btn--comment" data-action="comment" aria-label="Comments" title="Comments">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
            '<span class="ix-count" data-count-type="comments"></span>' +
            '</button>' +
            '<button class="ix-btn ix-btn--share" data-action="share" aria-label="Share" title="Share">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
            '</button>' +
            '</div>';
    },

    initInteractionToolbar(container) {
        if (!container) return;
        container.querySelectorAll('.ix-toolbar').forEach(toolbar => {
            const contentId = toolbar.dataset.contentId;
            const contentType = toolbar.dataset.contentType;
            if (!contentId || !contentType) return;

            // Like / Dislike / Save buttons
            toolbar.querySelectorAll('.ix-btn[data-action="like"], .ix-btn[data-action="dislike"], .ix-btn[data-action="save"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    // Optimistic UI: toggle active state immediately
                    const wasActive = btn.classList.contains('ix-btn--active');
                    btn.classList.toggle('ix-btn--active');
                    const svg = btn.querySelector('svg');
                    if (svg) svg.setAttribute('fill', wasActive ? 'none' : 'currentColor');
                    // If toggling like, remove dislike active and vice versa
                    if (action === 'like' && !wasActive) {
                        const dislikeBtn = toolbar.querySelector('.ix-btn--dislike');
                        if (dislikeBtn) { dislikeBtn.classList.remove('ix-btn--active'); const ds = dislikeBtn.querySelector('svg'); if (ds) ds.setAttribute('fill', 'none'); }
                    } else if (action === 'dislike' && !wasActive) {
                        const likeBtn = toolbar.querySelector('.ix-btn--like');
                        if (likeBtn) { likeBtn.classList.remove('ix-btn--active'); const ls = likeBtn.querySelector('svg'); if (ls) ls.setAttribute('fill', 'none'); }
                    }
                    const result = await Interactions.toggle(contentId, contentType, action);
                    if (!result) {
                        // Revert optimistic update on failure
                        btn.classList.toggle('ix-btn--active');
                        if (svg) svg.setAttribute('fill', wasActive ? 'currentColor' : 'none');
                    }
                });
            });

            // Comment button
            toolbar.querySelector('.ix-btn[data-action="comment"]')?.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                UI.openCommentsPanel(contentId, contentType);
            });

            // Share button
            toolbar.querySelector('.ix-btn[data-action="share"]')?.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                UI.smartShare(contentId, contentType);
            });
        });
    },

    // ═══════════════════════════════════════
    // Comments Panel (Bottom Sheet / Sidebar)
    // ═══════════════════════════════════════
    openCommentsPanel(contentId, contentType) {
        // Remove existing panel if any
        const existing = document.getElementById('comments-panel-overlay');
        if (existing) existing.remove();

        const isMobile = window.innerWidth < 768;
        const panelClass = isMobile ? 'comments-panel comments-panel--bottom-sheet' : 'comments-panel comments-panel--sidebar';

        const overlay = document.createElement('div');
        overlay.id = 'comments-panel-overlay';
        overlay.className = 'comments-panel-overlay';
        overlay.innerHTML =
            '<div class="' + panelClass + '">' +
            '<div class="comments-panel__header">' +
            '<h3 class="comments-panel__title">Comments</h3>' +
            '<button class="comments-panel__close" aria-label="Close comments">&#10005;</button>' +
            '</div>' +
            '<div class="comments-panel__list" id="comments-list">' +
            '<div class="comments-panel__loading"><span class="btn-spinner"></span> Loading comments...</div>' +
            '</div>' +
            '<div class="comments-panel__input">' +
            '<div class="comments-panel__input-row">' +
            '<textarea id="comment-input" class="form-input comments-panel__textarea" placeholder="Write a comment..." maxlength="1000" rows="2"></textarea>' +
            '<button class="btn btn-primary btn-sm comments-panel__submit" id="comment-submit-btn">Post</button>' +
            '</div>' +
            '<div class="comments-panel__char-count"><span id="comment-char-count">0</span>/1000</div>' +
            '</div>' +
            '</div>';

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        // Close handlers
        const close = () => { overlay.remove(); document.body.style.overflow = ''; };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.comments-panel__close').addEventListener('click', close);
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
        });

        // Character count
        const textarea = document.getElementById('comment-input');
        const charCount = document.getElementById('comment-char-count');
        if (textarea && charCount) {
            textarea.addEventListener('input', () => { charCount.textContent = textarea.value.length; });
        }

        // Submit handler
        document.getElementById('comment-submit-btn')?.addEventListener('click', async () => {
            const body = textarea?.value?.trim();
            if (!body) return;
            const submitBtn = document.getElementById('comment-submit-btn');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span class="btn-spinner"></span>'; }
            const result = await Comments.submit(contentId, contentType, body);
            if (result) {
                textarea.value = '';
                if (charCount) charCount.textContent = '0';
                // Prepend new comment to list
                const list = document.getElementById('comments-list');
                if (list) {
                    const noComments = list.querySelector('.comments-panel__empty');
                    if (noComments) noComments.remove();
                    list.insertAdjacentHTML('afterbegin', UI._commentItem(result));
                    UI._initCommentReportBtns(list);
                }
            }
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Post'; }
        });

        // Fetch comments on-demand
        UI._loadComments(contentId, contentType);
    },

    async _loadComments(contentId, contentType) {
        const list = document.getElementById('comments-list');
        if (!list) return;
        const { data, count } = await Comments.getByContent(contentId, contentType, 20, 0);
        if (!data || data.length === 0) {
            list.innerHTML = '<div class="comments-panel__empty">No comments yet. Be the first!</div>';
            return;
        }
        list.innerHTML = data.map(c => UI._commentItem(c)).join('');
        UI._initCommentReportBtns(list);
    },

    _commentItem(comment) {
        if (!comment) return '';
        const initial = (comment.display_name || 'U').charAt(0).toUpperCase();
        return '<div class="comment-item" data-comment-id="' + comment.id + '">' +
            '<div class="comment-item__avatar">' + initial + '</div>' +
            '<div class="comment-item__body">' +
            '<div class="comment-item__header">' +
            '<span class="comment-item__name">' + Security.sanitize(comment.display_name || 'User') + UI.roleBadge(comment.role) + '</span>' +
            '<span class="comment-item__date">' + UI.formatDate(comment.created_at) + '</span>' +
            '</div>' +
            '<div class="comment-item__text">' + Security.sanitize(comment.body || '') + '</div>' +
            '</div>' +
            '<button class="comment-item__report" data-comment-id="' + comment.id + '" aria-label="Report comment" title="Report">&#128681;</button>' +
            '</div>';
    },

    _initCommentReportBtns(container) {
        if (!container) return;
        container.querySelectorAll('.comment-item__report').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const cid = btn.dataset.commentId;
                if (!cid) return;
                UI.confirmModal('Report Comment', 'Are you sure you want to report this comment?', async () => {
                    await Comments.report(cid);
                    const item = container.querySelector('.comment-item[data-comment-id="' + cid + '"]');
                    if (item) { item.style.opacity = '0.5'; item.style.pointerEvents = 'none'; }
                });
            });
        });
    },

    // ═══════════════════════════════════════
    // Smart Share (Section-Aware)
    // ═══════════════════════════════════════
    smartShare(contentId, contentType) {
        const urlMap = {
            group: CONFIG.siteUrl + '/group?id=' + contentId,
            article: CONFIG.siteUrl + '/article?slug=' + contentId,
            store: CONFIG.siteUrl + '/store#' + contentId,
            marketplace: CONFIG.siteUrl + '/marketplace#' + contentId
        };
        const titleMap = {
            group: 'Check out this group on GroupsMix!',
            article: 'Read this article on GroupsMix!',
            store: 'Check out this item on GroupsMix Store!',
            marketplace: 'Check out this listing on GroupsMix Marketplace!'
        };
        const url = urlMap[contentType] || CONFIG.siteUrl;
        const text = titleMap[contentType] || 'Check this out on GroupsMix!';

        if (navigator.share) {
            navigator.share({ title: 'GroupsMix', text: text, url: url }).catch(() => {
                UI._showShareMenu(url, text);
            });
        } else {
            UI._showShareMenu(url, text);
        }
    },

    _showShareMenu(url, text) {
        const encodedUrl = encodeURIComponent(url);
        const encodedText = encodeURIComponent(text);
        const shareIconSvg = function(paths) { return '<svg class="svg-icon share-menu__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>'; };
        UI.modal({
            title: 'Share',
            content:
                '<div class="share-menu">' +
                '<a href="https://wa.me/?text=' + encodedText + '%20' + encodedUrl + '" target="_blank" rel="noopener" class="share-menu__item"><span class="share-menu__icon">' + shareIconSvg('<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>') + '</span> WhatsApp</a>' +
                '<a href="https://t.me/share/url?url=' + encodedUrl + '&text=' + encodedText + '" target="_blank" rel="noopener" class="share-menu__item"><span class="share-menu__icon">' + shareIconSvg('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>') + '</span> Telegram</a>' +
                '<a href="https://twitter.com/intent/tweet?text=' + encodedText + '&url=' + encodedUrl + '" target="_blank" rel="noopener" class="share-menu__item"><span class="share-menu__icon">' + shareIconSvg('<path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/>') + '</span> Twitter / X</a>' +
                '<a href="https://www.facebook.com/sharer/sharer.php?u=' + encodedUrl + '" target="_blank" rel="noopener" class="share-menu__item"><span class="share-menu__icon">' + shareIconSvg('<path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>') + '</span> Facebook</a>' +
                '<a href="https://www.linkedin.com/sharing/share-offsite/?url=' + encodedUrl + '" target="_blank" rel="noopener" class="share-menu__item"><span class="share-menu__icon">' + shareIconSvg('<path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>') + '</span> LinkedIn</a>' +
                '<a href="mailto:?subject=' + encodedText + '&body=' + encodedUrl + '" class="share-menu__item"><span class="share-menu__icon">' + shareIconSvg('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>') + '</span> Email</a>' +
                '<button class="share-menu__item share-menu__copy" id="share-copy-btn"><span class="share-menu__icon">' + shareIconSvg('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>') + '</span> Copy Link</button>' +
                '</div>',
            size: 'small'
        });
        document.getElementById('share-copy-btn')?.addEventListener('click', () => {
            UI.copyToClipboard(url);
            UI.closeModal();
        });
    },

    // ─── Live Stats Interactions ────────────────
    initLiveStats(container, groups) {
        if (!container) return;

        // Heart/Like click handler
        container.querySelectorAll('.live-stat--likes').forEach(stat => {
            stat.style.cursor = 'pointer';
            stat.addEventListener('click', async function(e) {
                e.preventDefault();
                e.stopPropagation();
                const bar = stat.closest('.group-card__live-stats');
                if (!bar) return;
                const groupId = bar.dataset.groupId;
                if (!groupId) return;

                const heart = stat.querySelector('.live-stat__heart');
                const countEl = stat.querySelector('[data-count="likes"]');

                // Optimistic UI: toggle active state
                const isActive = stat.classList.contains('live-stat--active');
                stat.classList.toggle('live-stat--active');

                // Animate heart pop
                if (heart) {
                    heart.classList.add('live-stat__heart--pop');
                    setTimeout(function() { heart.classList.remove('live-stat__heart--pop'); }, 400);
                }

                // Optimistic count update
                if (countEl) {
                    var current = parseInt(countEl.textContent.replace(/[^\d]/g, '')) || 0;
                    countEl.textContent = UI.formatNumber(isActive ? Math.max(0, current - 1) : current + 1);
                }

                // Persist to Supabase via Interactions module
                try {
                    var result = await Interactions.toggle(groupId, 'group', 'like');
                    if (!result) {
                        // Revert on failure
                        stat.classList.toggle('live-stat--active');
                        if (countEl) {
                            var reverted = parseInt(countEl.textContent.replace(/[^\d]/g, '')) || 0;
                            countEl.textContent = UI.formatNumber(isActive ? reverted + 1 : Math.max(0, reverted - 1));
                        }
                    }
                } catch (err) {
                    console.error('LiveStats like error:', err);
                }
            });
        });

        // Star Rating click handler - opens rating modal
        container.querySelectorAll('.live-stat--rating').forEach(stat => {
            stat.style.cursor = 'pointer';
            stat.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                var bar = stat.closest('.group-card__live-stats');
                if (!bar) return;
                var groupId = bar.dataset.groupId;
                if (!groupId) return;
                var group = groups.find(function(g) { return g.id === groupId; });
                var currentRating = parseFloat(group?.avg_rating) || 0;

                // Build star rating modal
                var starHtml = '<div class="live-rating-modal"><p style="margin-bottom:12px;color:var(--text-secondary);font-size:var(--text-sm)">Rate this group</p>';
                starHtml += '<div class="live-rating-stars" data-group-id="' + groupId + '">';
                for (var i = 1; i <= 5; i++) {
                    var filled = i <= Math.round(currentRating);
                    starHtml += '<span class="live-rating-star' + (filled ? ' live-rating-star--filled' : '') + '" data-value="' + i + '">' +
                        '<svg viewBox="0 0 24 24" fill="' + (filled ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
                        '</span>';
                }
                starHtml += '</div></div>';

                UI.modal({ title: 'Rate Group', content: starHtml, size: 'small' });

                // Bind star click events
                setTimeout(function() {
                    document.querySelectorAll('.live-rating-star').forEach(function(starEl) {
                        starEl.addEventListener('click', async function() {
                            var val = parseInt(starEl.dataset.value);
                            // Visual update
                            document.querySelectorAll('.live-rating-star').forEach(function(s, idx) {
                                var isFilled = idx < val;
                                s.classList.toggle('live-rating-star--filled', isFilled);
                                s.querySelector('svg').setAttribute('fill', isFilled ? 'currentColor' : 'none');
                            });
                            // Submit to Supabase
                            try {
                                await DB.reviews.submit(groupId, 'group', val);
                                UI.toast('Rating submitted!', 'success');
                                // Update the stat on the card
                                var countEl = bar.querySelector('[data-count="rating"]');
                                if (countEl) countEl.textContent = val.toFixed(1);
                                var starIcon = bar.querySelector('.live-stat__star');
                                if (starIcon) starIcon.setAttribute('fill', 'currentColor');
                                setTimeout(function() { UI.closeModal(); }, 600);
                            } catch (err) {
                                console.error('LiveStats rating error:', err);
                                UI.toast('Could not submit rating', 'error');
                            }
                        });
                    });
                }, 100);
            });
        });

        // Comments click handler - opens comments panel
        container.querySelectorAll('.live-stat--comments').forEach(stat => {
            stat.style.cursor = 'pointer';
            stat.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                var bar = stat.closest('.group-card__live-stats');
                if (!bar) return;
                var groupId = bar.dataset.groupId;
                if (groupId) UI.openCommentsPanel(groupId, 'group');
            });
        });

        // Load interaction states for authenticated users
        UI._loadLiveStatStates(container, groups);
    },

    async _loadLiveStatStates(container, groups) {
        try {
            var groupIds = groups.map(function(g) { return g.id; });
            if (!groupIds.length) return;
            var interactions = await Interactions.getUserInteractions(groupIds, 'group');
            if (!interactions) return;
            for (var id in interactions) {
                if (!interactions.hasOwnProperty(id)) continue;
                var actions = interactions[id];
                if (Array.isArray(actions) && actions.includes('like')) {
                    var bar = container.querySelector('.group-card__live-stats[data-group-id="' + id + '"]');
                    if (bar) {
                        var likeStat = bar.querySelector('.live-stat--likes');
                        if (likeStat) likeStat.classList.add('live-stat--active');
                    }
                }
            }
        } catch (err) {
            console.error('_loadLiveStatStates:', err);
        }
    }
};
