// ─── Module: security ───
// Exports: Security

// ═══════════════════════════════════════
// MODULE 3: Security
// ═══════════════════════════════════════
const _Security = {
    _behavioral: { events: new Set(), startTime: 0, fieldFocused: false },

    init() {
        this._behavioral.startTime = Date.now();
        this.initBehavioral();
    },

    sanitize(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g, '&#x2F;')
            .trim().replace(/\s+/g, ' ');
    },

    // Issue #10 fix: dedicated URL sanitizer that preserves forward slashes
    // sanitize() replaces / with &#x2F; which breaks valid URLs in src attributes
    sanitizeUrl(url) {
        if (typeof url !== 'string') return '';
        const trimmed = url.trim();
        // Only allow https:// URLs
        if (!/^https:\/\//i.test(trimmed)) return '';
        // Block dangerous schemes that could be embedded
        const lower = trimmed.toLowerCase();
        if (lower.includes('javascript:') || lower.includes('data:') ||
            lower.includes('file:') || lower.includes('vbscript:')) return '';
        // Encode only HTML-dangerous characters, NOT forward slashes
        return trimmed
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    isValidEmail(email) {
        if (typeof email !== 'string') return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
    },

    /**
     * Validate password strength.
     * Returns { valid: boolean, errors: string[] }
     * Requirements: min 8 chars, uppercase, lowercase, digit, special char.
     */
    validatePassword(password) {
        const errors = [];
        if (typeof password !== 'string' || password.length < 8) errors.push('Password must be at least 8 characters');
        if (password && !/[A-Z]/.test(password)) errors.push('Must contain an uppercase letter');
        if (password && !/[a-z]/.test(password)) errors.push('Must contain a lowercase letter');
        if (password && !/[0-9]/.test(password)) errors.push('Must contain a number');
        if (password && !/[^A-Za-z0-9]/.test(password)) errors.push('Must contain a special character (!@#$%^&*...)');
        return { valid: errors.length === 0, errors: errors };
    },

    /**
     * Calculate password strength score (0-4) for UI meter.
     * 0 = very weak, 1 = weak, 2 = fair, 3 = strong, 4 = very strong
     */
    getPasswordStrength(password) {
        if (typeof password !== 'string' || !password) return { score: 0, label: 'Too short', color: 'var(--error)' };
        let score = 0;
        if (password.length >= 8) score++;
        if (password.length >= 12) score++;
        if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        // Cap at 4
        score = Math.min(4, score);
        const labels = [
            { label: 'Very weak', color: 'var(--error)' },
            { label: 'Weak', color: 'var(--error)' },
            { label: 'Fair', color: 'var(--warning)' },
            { label: 'Strong', color: 'var(--info)' },
            { label: 'Very strong', color: 'var(--success)' }
        ];
        return { score: score, label: labels[score].label, color: labels[score].color };
    },

    /**
     * Validate a URL is safe for navigation (no javascript:, data:, etc.).
     * Used to sanitize notification links and other user-provided URLs.
     */
    isSafeNavigationUrl(url) {
        if (typeof url !== 'string' || !url.trim()) return false;
        const trimmed = url.trim().toLowerCase();
        // Only allow http(s) and relative paths
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
            // Block dangerous schemes that might be embedded
            const dangerous = ['javascript:', 'data:', 'file:', 'vbscript:', 'blob:'];
            if (dangerous.some(function(d) { return trimmed.includes(d); })) return false;
            return true;
        }
        return false;
    },

    isDisposableEmail(email) {
        if (typeof email !== 'string') return false;
        const domain = email.split('@')[1]?.toLowerCase();
        return CONFIG.disposableEmails.includes(domain);
    },

    isValidUrl(url, platform) {
        if (typeof url !== 'string') return false;
        if (!url.startsWith('https://')) return false;
        const dangerous = ['javascript:', 'data:', 'file:', 'vbscript:', '%6A%61%76%61'];
        if (dangerous.some(d => url.toLowerCase().includes(d))) return false;
        if (platform && CONFIG.platformPatterns[platform]) {
            return CONFIG.platformPatterns[platform].test(url);
        }
        return true;
    },

    isValidTxHash(hash, currency) {
        if (typeof hash !== 'string' || !hash.trim()) return false;
        const h = hash.trim();
        if (currency === 'btc') return /^[a-fA-F0-9]{64}$/.test(h);
        if (currency === 'usdt') return /^[a-fA-F0-9]{64}$/.test(h);
        if (currency === 'sol') return /^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(h);
        return h.length >= 32;
    },

    checkRateLimit(action) {
        const limits = {
            submit: { window: 3600000, max: 5 }, review: { window: 3600000, max: 10 },
            report: { window: 3600000, max: 5 }, payment: { window: 3600000, max: 3 },
            contact: { window: 3600000, max: 2 }, search: { window: 3600000, max: 60 },
            login: { window: 900000, max: 5 }, comment: { window: 60000, max: 5 }
        };
        const l = limits[action];
        if (!l) return true;
        const key = 'gm_rl_' + action;
        const timestamps = SafeStorage.getJSON(key, []);
        const now = Date.now();
        const recent = Array.isArray(timestamps) ? timestamps.filter(t => now - t < l.window) : [];
        if (recent.length >= l.max) return false;
        recent.push(now);
        SafeStorage.setJSON(key, recent);
        return true;
    },

    checkOnline() {
        return navigator.onLine;
    },

    checkBehavioral() {
        const b = this._behavioral;
        return b.events.size >= 2 && (Date.now() - b.startTime) >= 3000 && b.fieldFocused;
    },

    initBehavioral() {
        const track = (e) => { this._behavioral.events.add(e.type); };
        ['mousemove', 'touchstart', 'keypress', 'scroll'].forEach(evt => {
            document.addEventListener(evt, track, { once: true, passive: true });
        });
        document.addEventListener('focusin', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                this._behavioral.fieldFocused = true;
                this._behavioral.events.add('focusin');
            }
        }, { passive: true });
    },

    obfuscateLink(url) {
        if (typeof url !== 'string' || !url) return '';
        try { return btoa(unescape(encodeURIComponent(url))); } catch (_e) { return ''; }
    },

    deobfuscateLink(encoded) {
        if (typeof encoded !== 'string' || !encoded) return '';
        try { return decodeURIComponent(escape(atob(encoded))); } catch (_e) { return ''; }
    },

    /**
     * Server-side validation via /api/validate Cloudflare Pages Function.
     * Verifies Turnstile token, email, and rate limit on the server.
     * Returns { ok, errors, code } or { ok: true } on success.
     * Falls back gracefully if the endpoint is unavailable.
     *
     * @param {Object} params - { email, turnstileToken, action }
     * @returns {Promise<{ok: boolean, errors: string[]}>}
     */
    async serverValidate(params) {
        try {
            const res = await fetch('/api/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });

            if (res.status >= 500) {
                console.error('Security.serverValidate: server error ' + res.status);
                return { ok: false, errors: ['Server validation unavailable. Please try again.'], serverBypassed: true };
            }

            let data;
            try {
                data = await res.json();
            } catch (_jsonErr) {
                console.error('Security.serverValidate: non-JSON response');
                return { ok: false, errors: ['Validation service returned invalid response.'], serverBypassed: true };
            }
            return data;
        } catch (err) {
            console.error('Security.serverValidate: endpoint unreachable', err);
            // In local dev, allow graceful fallback. In production, block.
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                return { ok: true, errors: [], serverBypassed: true };
            }
            return { ok: false, errors: ['Could not reach validation server. Please check your connection.'], serverBypassed: true };
        }
    }
};

