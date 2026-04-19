// ─── Module: ui-effects ───
// Button ripple, image blur-up, keyboard shortcuts, form validation UX

// ═══════════════════════════════════════
// BUTTON RIPPLE EFFECT
// ═══════════════════════════════════════
document.addEventListener('click', function(e) {
    var btn = e.target.closest('.btn');
    if (!btn || btn.disabled || btn.classList.contains('disabled')) return;
    var rect = btn.getBoundingClientRect();
    var ripple = document.createElement('span');
    ripple.className = 'btn-ripple';
    var size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(ripple);
    setTimeout(function() { ripple.remove(); }, 500);
});

// ═══════════════════════════════════════
// IMAGE BLUR-UP LOADING
// ═══════════════════════════════════════
(function() {
    function initBlurUp(img) {
        if (img.dataset.blurInit) return;
        img.dataset.blurInit = '1';
        if (img.complete && img.naturalWidth > 0) {
            img.classList.add('img-loaded');
            return;
        }
        img.classList.add('img-loading');
        img.addEventListener('load', function() {
            img.classList.remove('img-loading');
            img.classList.add('img-loaded');
        }, { once: true });
        img.addEventListener('error', function() {
            img.classList.remove('img-loading');
        }, { once: true });
    }

    function scanImages() {
        document.querySelectorAll('.img-blur-wrap img, .group-card img, .article-card__image').forEach(initBlurUp);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scanImages);
    } else {
        scanImages();
    }

    if (typeof MutationObserver !== 'undefined') {
        var imgObserver = new MutationObserver(function(mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    if (added[j].nodeType === 1) {
                        if (added[j].tagName === 'IMG') initBlurUp(added[j]);
                        else if (added[j].querySelectorAll) {
                            added[j].querySelectorAll('.img-blur-wrap img, .group-card img, .article-card__image').forEach(initBlurUp);
                        }
                    }
                }
            }
        });
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                imgObserver.observe(document.body, { childList: true, subtree: true });
            });
        } else {
            imgObserver.observe(document.body, { childList: true, subtree: true });
        }
    }
})();

// ═══════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════
(function() {
    var shortcutsVisible = false;

    function isInputFocused() {
        var el = document.activeElement;
        if (!el) return false;
        var tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    function showShortcutsOverlay() {
        if (shortcutsVisible) return;
        shortcutsVisible = true;
        var overlay = document.createElement('div');
        overlay.className = 'shortcuts-overlay';
        overlay.id = 'shortcuts-overlay';
        overlay.innerHTML =
            '<div class="shortcuts-panel">' +
            '<div class="shortcuts-panel__header">' +
            '<span class="shortcuts-panel__title">Keyboard Shortcuts</span>' +
            '<button class="btn btn-ghost btn-icon btn-sm" id="shortcuts-close" aria-label="Close">&times;</button>' +
            '</div>' +
            '<div class="shortcuts-panel__body">' +
            '<div class="shortcuts-section">' +
            '<div class="shortcuts-section__title">Navigation</div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Focus search</span><span class="shortcut-row__keys"><kbd class="kbd">/</kbd></span></div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Go to home</span><span class="shortcut-row__keys"><kbd class="kbd">g</kbd> <kbd class="kbd">h</kbd></span></div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Go to dashboard</span><span class="shortcut-row__keys"><kbd class="kbd">g</kbd> <kbd class="kbd">d</kbd></span></div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Go to articles</span><span class="shortcut-row__keys"><kbd class="kbd">g</kbd> <kbd class="kbd">a</kbd></span></div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Go to jobs</span><span class="shortcut-row__keys"><kbd class="kbd">g</kbd> <kbd class="kbd">j</kbd></span></div>' +
            '</div>' +
            '<div class="shortcuts-section">' +
            '<div class="shortcuts-section__title">Actions</div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Toggle dark/light theme</span><span class="shortcut-row__keys"><kbd class="kbd">t</kbd></span></div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Close modal / overlay</span><span class="shortcut-row__keys"><kbd class="kbd">Esc</kbd></span></div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Show this help</span><span class="shortcut-row__keys"><kbd class="kbd">?</kbd></span></div>' +
            '</div>' +
            '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        document.getElementById('shortcuts-close').addEventListener('click', hideShortcutsOverlay);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) hideShortcutsOverlay(); });
    }

    function hideShortcutsOverlay() {
        var overlay = document.getElementById('shortcuts-overlay');
        if (overlay) overlay.remove();
        shortcutsVisible = false;
    }

    var goPrefix = false;
    var goTimer = null;

    document.addEventListener('keydown', function(e) {
        // Don't fire shortcuts when typing in inputs
        if (isInputFocused()) {
            // Exception: Esc should still blur inputs
            if (e.key === 'Escape') {
                document.activeElement.blur();
                e.preventDefault();
            }
            return;
        }

        // Don't interfere with modifier combos (Ctrl+C, etc.)
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        var key = e.key;

        // Close shortcuts overlay on Escape
        if (key === 'Escape' && shortcutsVisible) {
            hideShortcutsOverlay();
            e.preventDefault();
            return;
        }

        // ? — Show shortcuts help
        if (key === '?') {
            e.preventDefault();
            if (shortcutsVisible) hideShortcutsOverlay();
            else showShortcutsOverlay();
            return;
        }

        // / — Focus search
        if (key === '/') {
            e.preventDefault();
            var searchInput = document.querySelector('.hero__search-input') || document.querySelector('[name="q"]') || document.querySelector('input[type="search"]');
            if (searchInput) { searchInput.focus(); searchInput.select(); }
            return;
        }

        // t — Toggle theme
        if (key === 't') {
            e.preventDefault();
            if (typeof Theme !== 'undefined') Theme.toggle();
            return;
        }

        // g + second key — Go-to navigation
        if (key === 'g' && !goPrefix) {
            goPrefix = true;
            clearTimeout(goTimer);
            goTimer = setTimeout(function() { goPrefix = false; }, 1000);
            return;
        }

        if (goPrefix) {
            goPrefix = false;
            clearTimeout(goTimer);
            var routes = { h: '/', d: '/dashboard', a: '/articles', j: '/jobs', m: '/marketplace', s: '/search' };
            if (routes[key]) {
                e.preventDefault();
                window.location.href = routes[key];
            }
            return;
        }
    });
})();

// ═══════════════════════════════════════
// FORM VALIDATION UX
// ═══════════════════════════════════════
(function() {
    function validateField(input) {
        if (!input || !input.closest('.form-group')) return;
        var value = input.value.trim();
        var type = input.type;
        var required = input.hasAttribute('required');
        var minLength = input.getAttribute('minlength');
        var existingError = input.parentElement.querySelector('.form-error');

        // Clear previous state
        input.classList.remove('form-input--error', 'form-input--valid');
        if (existingError) existingError.remove();

        if (!value && !required) return;

        var isValid = true;
        var errorMsg = '';

        if (required && !value) {
            isValid = false;
            errorMsg = 'This field is required';
        } else if (type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            isValid = false;
            errorMsg = 'Please enter a valid email address';
        } else if (minLength && value.length < parseInt(minLength, 10)) {
            isValid = false;
            errorMsg = 'Must be at least ' + minLength + ' characters';
        } else if (type === 'url' && value && !/^https?:\/\/.+/.test(value)) {
            isValid = false;
            errorMsg = 'Please enter a valid URL';
        }

        if (!isValid) {
            input.classList.add('form-input--error');
            var errorEl = document.createElement('div');
            errorEl.className = 'form-error';
            errorEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ' + errorMsg;
            input.parentElement.appendChild(errorEl);
        } else if (value) {
            input.classList.add('form-input--valid');
        }
    }

    // Validate on blur for all form-input elements
    document.addEventListener('focusout', function(e) {
        if (e.target.classList && e.target.classList.contains('form-input')) {
            validateField(e.target);
        }
    });

    // Clear error styling when user starts typing
    document.addEventListener('input', function(e) {
        if (e.target.classList && e.target.classList.contains('form-input')) {
            e.target.classList.remove('form-input--error');
            var err = e.target.parentElement.querySelector('.form-error');
            if (err) err.remove();
        }
    });

    // Add shake animation on invalid form submit
    document.addEventListener('submit', function(e) {
        var form = e.target;
        var invalids = form.querySelectorAll('.form-input:invalid, .form-input--error');
        if (invalids.length > 0) {
            invalids.forEach(function(input) {
                validateField(input);
                input.classList.add('form-shake');
                setTimeout(function() { input.classList.remove('form-shake'); }, 400);
            });
        }
    }, true);
})();

