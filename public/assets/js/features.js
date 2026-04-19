// ═══════════════════════════════════════
// GROUPSMIX — features.js
// New Features Module: Newsletter, Wishlist, Referrals,
// Analytics, Push Notifications, Multi-Currency, A/B Testing
// Depends on: app.js (CONFIG, Security, Auth, DB, UI, CACHE)
// ═══════════════════════════════════════

// ═══════════════════════════════════════
// MODULE: Newsletter
// ═══════════════════════════════════════
const _Newsletter = {
    _subscribedKey: 'gm_newsletter_subscribed',

    isSubscribed() {
        return localStorage.getItem(this._subscribedKey) === '1';
    },

    markSubscribed() {
        localStorage.setItem(this._subscribedKey, '1');
    },

    async subscribe(email, name, source) {
        try {
            if (!email || !Security.isValidEmail(email)) {
                UI.toast('Please enter a valid email address.', 'error');
                return false;
            }
            if (Security.isDisposableEmail(email)) {
                UI.toast('Please use a real email address.', 'error');
                return false;
            }
            if (!Security.checkRateLimit('contact')) {
                UI.toast('Too many attempts. Please wait.', 'error');
                return false;
            }
            var row = {
                email: email.toLowerCase().trim(),
                name: Security.sanitize(name || ''),
                source: source || 'popup',
                uid: Auth.getAuthId() || null,
                status: 'active',
                confirmed: false
            };
            var { error } = await window.supabaseClient.from('newsletter_subscribers').upsert(row, { onConflict: 'email' });
            if (error) throw error;
            _Newsletter.markSubscribed();
            // Track analytics event
            Analytics.track('newsletter_subscribe', 'engagement', { source: source });
            return true;
        } catch (err) {
            console.error('Newsletter.subscribe:', err.message);
            if (err.message && err.message.indexOf('duplicate') !== -1) {
                UI.toast('You are already subscribed!', 'info');
                _Newsletter.markSubscribed();
                return true;
            }
            UI.toast('Failed to subscribe. Please try again.', 'error');
            return false;
        }
    },

    async unsubscribe(email) {
        try {
            if (!email) return false;
            var { error } = await window.supabaseClient.from('newsletter_subscribers')
                .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
                .eq('email', email.toLowerCase().trim());
            if (error) throw error;
            localStorage.removeItem(_Newsletter._subscribedKey);
            return true;
        } catch (err) {
            console.error('Newsletter.unsubscribe:', err.message);
            return false;
        }
    },


    // Admin: get subscriber stats
    async getStats() {
        try {
            if (!Auth.requireAdmin()) return null;
            var { data, error } = await window.supabaseClient.rpc('get_newsletter_stats');
            if (error) throw error;
            return data;
        } catch (err) { console.error('Newsletter.getStats:', err.message); return null; }
    },

    // Admin: export subscribers
    async exportSubscribers() {
        try {
            if (!Auth.requireAdmin()) return [];
            var { data, error } = await window.supabaseClient.from('newsletter_subscribers')
                .select('email, name, source, status, created_at')
                .eq('status', 'active')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) { console.error('Newsletter.exportSubscribers:', err.message); return []; }
    }
};


// ═══════════════════════════════════════
// MODULE: Wishlist
// ═══════════════════════════════════════
const Wishlist = {
    _localKey: 'gm_wishlist',

    _getLocal() {
        try {
            var raw = localStorage.getItem(this._localKey);
            return raw ? JSON.parse(raw) : [];
        } catch (_e) { return []; }
    },

    _saveLocal(items) {
        try {
            localStorage.setItem(this._localKey, JSON.stringify(items));
        } catch (e) { console.error('Wishlist._saveLocal:', e.message); }
    },

    isInWishlist(contentId, contentType) {
        contentType = contentType || 'group';
        var local = this._getLocal();
        return local.some(function(item) { return item.content_id === contentId && item.content_type === contentType; });
    },

    async add(contentId, contentType, title, imageUrl, metadata) {
        try {
            contentType = contentType || 'group';
            title = title || '';
            // Add to localStorage immediately (optimistic)
            var local = this._getLocal();
            if (!local.some(function(i) { return i.content_id === contentId && i.content_type === contentType; })) {
                local.push({ content_id: contentId, content_type: contentType, title: title, image_url: imageUrl || '', created_at: new Date().toISOString() });
                this._saveLocal(local);
            }
            // Sync to Supabase if logged in
            if (Auth.isLoggedIn()) {
                var row = {
                    uid: Auth.getAuthId(),
                    content_id: String(contentId),
                    content_type: contentType,
                    title: Security.sanitize(title || ''),
                    image_url: Security.sanitize(imageUrl || ''),
                    metadata: metadata || {}
                };
                await window.supabaseClient.from('wishlists').upsert(row, { onConflict: 'uid,content_id,content_type' });
            }
            Analytics.track('wishlist_add', 'engagement', { content_id: contentId, content_type: contentType });
            return true;
        } catch (err) { console.error('Wishlist.add:', err.message); return false; }
    },

    async remove(contentId, contentType) {
        try {
            contentType = contentType || 'group';
            // Remove from localStorage
            var local = this._getLocal();
            local = local.filter(function(i) { return !(i.content_id === contentId && i.content_type === contentType); });
            this._saveLocal(local);
            // Remove from Supabase if logged in
            if (Auth.isLoggedIn()) {
                await window.supabaseClient.from('wishlists')
                    .delete()
                    .eq('uid', Auth.getAuthId())
                    .eq('content_id', String(contentId))
                    .eq('content_type', contentType);
            }
            return true;
        } catch (err) { console.error('Wishlist.remove:', err.message); return false; }
    },

    async toggle(contentId, contentType, title, imageUrl) {
        if (this.isInWishlist(contentId, contentType)) {
            await this.remove(contentId, contentType);
            UI.toast('Removed from wishlist', 'info');
            return false;
        } else {
            await this.add(contentId, contentType, title, imageUrl);
            UI.toast('Added to wishlist!', 'success');
            return true;
        }
    },

    async getAll(contentType) {
        try {
            if (Auth.isLoggedIn()) {
                var q = window.supabaseClient.from('wishlists').select('*')
                    .eq('uid', Auth.getAuthId())
                    .order('created_at', { ascending: false });
                if (contentType) q = q.eq('content_type', contentType);
                var { data, error } = await q;
                if (error) throw error;
                // Merge with localStorage
                var local = this._getLocal();
                var merged = data || [];
                local.forEach(function(l) {
                    if (!merged.some(function(m) { return m.content_id === l.content_id && m.content_type === l.content_type; })) {
                        merged.push(l);
                    }
                });
                return merged;
            }
            // Not logged in: return localStorage only
            var local = this._getLocal();
            if (contentType) return local.filter(function(i) { return i.content_type === contentType; });
            return local;
        } catch (err) { console.error('Wishlist.getAll:', err.message); return this._getLocal(); }
    },

    async syncFromServer() {
        try {
            if (!Auth.isLoggedIn()) return;
            var { data, error } = await window.supabaseClient.from('wishlists').select('*')
                .eq('uid', Auth.getAuthId());
            if (error) throw error;
            if (data && data.length) {
                var local = this._getLocal();
                data.forEach(function(item) {
                    if (!local.some(function(l) { return l.content_id === item.content_id && l.content_type === item.content_type; })) {
                        local.push({ content_id: item.content_id, content_type: item.content_type, title: item.title, image_url: item.image_url, created_at: item.created_at });
                    }
                });
                this._saveLocal(local);
            }
        } catch (err) { console.error('Wishlist.syncFromServer:', err.message); }
    },

    getCount() {
        return this._getLocal().length;
    }
};


// ═══════════════════════════════════════
// MODULE: Referrals (Affiliate System)
// ═══════════════════════════════════════
const Referrals = {
    _refKey: 'gm_ref',

    // Check URL for referral code on page load
    checkReferral() {
        var params = new URLSearchParams(window.location.search);
        var ref = params.get('ref') || params.get('r');
        if (ref) {
            localStorage.setItem(this._refKey, ref);
            this.trackClick(ref);
            // Clean URL
            var url = new URL(window.location.href);
            url.searchParams.delete('ref');
            url.searchParams.delete('r');
            window.history.replaceState(null, '', url.toString());
        }
    },

    getStoredCode() {
        return localStorage.getItem(this._refKey) || '';
    },

    async trackClick(code) {
        try {
            if (!code) return;
            await window.supabaseClient.rpc('increment_referral_clicks', { p_code: code });
            await window.supabaseClient.from('referral_events').insert({
                referrer_uid: '00000000-0000-0000-0000-000000000000',
                referral_code: code,
                event_type: 'click'
            });
        } catch (err) { console.error('Referrals.trackClick:', err.message); }
    },

    async trackSignup(referredUid) {
        try {
            var code = this.getStoredCode();
            if (!code) return;
            // Find referrer
            var { data: refCode } = await window.supabaseClient.from('referral_codes')
                .select('uid').eq('code', code).eq('status', 'active').single();
            if (!refCode) return;
            await window.supabaseClient.rpc('increment_referral_signups', { p_code: code });
            await window.supabaseClient.from('referral_events').insert({
                referrer_uid: refCode.uid,
                referral_code: code,
                event_type: 'signup',
                referred_uid: referredUid
            });
            localStorage.removeItem(this._refKey);
        } catch (err) { console.error('Referrals.trackSignup:', err.message); }
    },

    async generateCode() {
        try {
            if (!Auth.requireAuth()) return null;
            // Check if user already has a code
            var { data: existing } = await window.supabaseClient.from('referral_codes')
                .select('*').eq('uid', Auth.getAuthId()).limit(1);
            if (existing && existing.length) return existing[0];
            // Generate new code
            var code = 'GM' + Math.random().toString(36).substring(2, 8).toUpperCase();
            var { data, error } = await window.supabaseClient.from('referral_codes').insert({
                uid: Auth.getAuthId(),
                code: code,
                commission_rate: 10.00
            }).select().single();
            if (error) throw error;
            return data;
        } catch (err) { console.error('Referrals.generateCode:', err.message); UI.toast('Failed to generate referral code', 'error'); return null; }
    },

    async getMyStats() {
        try {
            if (!Auth.requireAuth()) return null;
            var { data, error } = await window.supabaseClient.rpc('get_referral_stats', { p_uid: Auth.getAuthId() });
            if (error) throw error;
            return data;
        } catch (err) { console.error('Referrals.getMyStats:', err.message); return null; }
    },

    getReferralUrl(code) {
        return CONFIG.siteUrl + '/?ref=' + encodeURIComponent(code);
    }
};


// ═══════════════════════════════════════
// MODULE: Analytics (Event Tracking)
// ═══════════════════════════════════════
const Analytics = {
    _sessionId: '',
    _initialized: false,

    init() {
        if (this._initialized) return;
        this._initialized = true;
        // Generate session ID
        this._sessionId = sessionStorage.getItem('gm_session_id') || ('s_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
        sessionStorage.setItem('gm_session_id', this._sessionId);
        // Track page view
        this.trackPageView();
        // Track search queries
        this._trackSearches();
    },

    _getDeviceType() {
        var w = window.innerWidth;
        if (w < 768) return 'mobile';
        if (w < 1024) return 'tablet';
        return 'desktop';
    },

    async track(eventName, category, eventData) {
        try {
            var row = {
                event_name: eventName,
                event_category: category || 'general',
                event_data: eventData || {},
                page_path: window.location.pathname,
                referrer: document.referrer || '',
                uid: Auth.getAuthId() || null,
                session_id: this._sessionId,
                device_type: this._getDeviceType()
            };
            await window.supabaseClient.from('analytics_events').insert(row);
        } catch (_err) { /* silent fail for analytics */ }
    },

    trackPageView() {
        this.track('page_view', 'navigation', {
            title: document.title,
            url: window.location.href
        });
    },

    trackProductView(productId, productName) {
        this.track('product_view', 'engagement', {
            product_id: productId,
            product_name: productName
        });
    },

    trackSearch(query, resultsCount) {
        this.track('search', 'engagement', {
            query: query,
            results_count: resultsCount
        });
    },

    trackConversion(type, value, details) {
        this.track('conversion', 'revenue', {
            conversion_type: type,
            value: value,
            details: details || {}
        });
    },

    _trackSearches() {
        // Listen for search form submissions
        document.addEventListener('submit', function(e) {
            var form = e.target.closest('form[action="/search"]');
            if (form) {
                var input = form.querySelector('input[name="q"]');
                if (input && input.value.trim()) {
                    Analytics.trackSearch(input.value.trim(), -1);
                }
            }
        });
    },

    // Admin: get analytics summary
    async getSummary(days) {
        try {
            if (!Auth.requireAdmin()) return null;
            var { data, error } = await window.supabaseClient.rpc('get_analytics_summary', { p_days: days || 30 });
            if (error) throw error;
            return data;
        } catch (err) { console.error('Analytics.getSummary:', err.message); return null; }
    },

    // Admin: get search analytics
    async getSearchAnalytics(days) {
        try {
            if (!Auth.requireAdmin()) return [];
            var since = new Date(Date.now() - (days || 30) * 86400000).toISOString();
            var { data, error } = await window.supabaseClient.from('analytics_events')
                .select('event_data')
                .eq('event_name', 'search')
                .gte('created_at', since)
                .order('created_at', { ascending: false })
                .limit(500);
            if (error) throw error;
            // Aggregate search terms
            var terms = {};
            (data || []).forEach(function(row) {
                var q = row.event_data && row.event_data.query ? row.event_data.query.toLowerCase() : '';
                if (q) terms[q] = (terms[q] || 0) + 1;
            });
            return Object.entries(terms)
                .map(function(entry) { return { term: entry[0], count: entry[1] }; })
                .sort(function(a, b) { return b.count - a.count; });
        } catch (err) { console.error('Analytics.getSearchAnalytics:', err.message); return []; }
    },

    // Admin: get conversion data
    async getConversionData(days) {
        try {
            if (!Auth.requireAdmin()) return null;
            var since = new Date(Date.now() - (days || 30) * 86400000).toISOString();
            var [viewsRes, conversionsRes] = await Promise.all([
                window.supabaseClient.from('analytics_events').select('id', { count: 'exact', head: true })
                    .eq('event_name', 'product_view').gte('created_at', since),
                window.supabaseClient.from('analytics_events').select('id', { count: 'exact', head: true })
                    .eq('event_name', 'conversion').gte('created_at', since)
            ]);
            var views = viewsRes.count || 0;
            var conversions = conversionsRes.count || 0;
            var rate = views > 0 ? ((conversions / views) * 100).toFixed(2) : '0.00';
            return { views: views, conversions: conversions, rate: rate };
        } catch (err) { console.error('Analytics.getConversionData:', err.message); return null; }
    }
};


// ═══════════════════════════════════════
// MODULE: PushNotifications
// ═══════════════════════════════════════
const PushNotifications = {
    _vapidKey: '', // Set your VAPID public key here
    _supported: false,

    init() {
        this._supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    },

    isSupported() {
        return this._supported;
    },

    getPermission() {
        if (!this._supported) return 'unsupported';
        return Notification.permission; // 'granted', 'denied', 'default'
    },

    async requestPermission() {
        if (!this._supported) {
            UI.toast('Push notifications are not supported in this browser.', 'warning');
            return false;
        }
        try {
            var permission = await Notification.requestPermission();
            if (permission === 'granted') {
                await this.subscribe();
                return true;
            }
            if (permission === 'denied') {
                UI.toast('Notifications blocked. Enable them in browser settings.', 'warning');
            }
            return false;
        } catch (err) {
            console.error('PushNotifications.requestPermission:', err.message);
            return false;
        }
    },

    async subscribe() {
        try {
            var reg = await navigator.serviceWorker.ready;
            var subscription = await reg.pushManager.getSubscription();
            if (subscription) {
                // Already subscribed, update server
                await this._saveSubscription(subscription);
                return subscription;
            }
            // Subscribe with VAPID key
            if (!this._vapidKey) {
                console.warn('PushNotifications: VAPID key not set');
                return null;
            }
            subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this._urlBase64ToUint8Array(this._vapidKey)
            });
            await this._saveSubscription(subscription);
            Analytics.track('push_subscribe', 'engagement');
            return subscription;
        } catch (err) {
            console.error('PushNotifications.subscribe:', err.message);
            return null;
        }
    },

    async unsubscribe() {
        try {
            var reg = await navigator.serviceWorker.ready;
            var subscription = await reg.pushManager.getSubscription();
            if (subscription) {
                var endpoint = subscription.endpoint;
                await subscription.unsubscribe();
                // Remove from server
                await window.supabaseClient.from('push_subscriptions')
                    .update({ status: 'unsubscribed' })
                    .eq('endpoint', endpoint);
                UI.toast('Notifications disabled.', 'info');
            }
            return true;
        } catch (err) {
            console.error('PushNotifications.unsubscribe:', err.message);
            return false;
        }
    },

    async _saveSubscription(subscription) {
        try {
            var json = subscription.toJSON();
            var row = {
                uid: Auth.getAuthId() || null,
                endpoint: json.endpoint,
                keys_p256dh: json.keys ? json.keys.p256dh : '',
                keys_auth: json.keys ? json.keys.auth : '',
                user_agent: navigator.userAgent.substring(0, 255),
                status: 'active'
            };
            await window.supabaseClient.from('push_subscriptions')
                .upsert(row, { onConflict: 'endpoint' });
        } catch (err) { console.error('PushNotifications._saveSubscription:', err.message); }
    },

    _urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - base64String.length % 4) % 4);
        var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        var rawData = atob(base64);
        var outputArray = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; i++) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    },

    showPrompt() {
        if (!this._supported) return;
        if (Notification.permission !== 'default') return;
        if (sessionStorage.getItem('gm_push_prompted')) return;
        sessionStorage.setItem('gm_push_prompted', '1');

        setTimeout(function() {
            var bar = document.createElement('div');
            bar.className = 'push-prompt';
            bar.id = 'push-prompt';
            bar.innerHTML =
                '<div class="push-prompt__content">' +
                '<span class="push-prompt__icon">' + ICONS.bell + '</span>' +
                '<span class="push-prompt__text">Get notified about new groups and special offers</span>' +
                '</div>' +
                '<div class="push-prompt__actions">' +
                '<button class="btn btn-ghost btn-sm" id="push-dismiss">Later</button>' +
                '<button class="btn btn-primary btn-sm" id="push-accept">Enable</button>' +
                '</div>';
            document.body.appendChild(bar);

            document.getElementById('push-dismiss').addEventListener('click', function() {
                bar.classList.add('push-prompt--exit');
                setTimeout(function() { bar.remove(); }, 300);
            });
            document.getElementById('push-accept').addEventListener('click', async function() {
                await PushNotifications.requestPermission();
                bar.remove();
            });
        }, 15000); // Show after 15 seconds
    }
};


// ═══════════════════════════════════════
// MODULE: MultiCurrency
// ═══════════════════════════════════════
const MultiCurrency = {
    _key: 'gm_currency',
    _ratesKey: 'gm_exchange_rates',
    _ratesTTL: 3600000, // 1 hour

    currencies: [
        { code: 'USD', symbol: '$', name: 'US Dollar' },
        { code: 'EUR', symbol: '\u20AC', name: 'Euro' },
        { code: 'GBP', symbol: '\u00A3', name: 'British Pound' },
        { code: 'SAR', symbol: '\u0631.\u0633', name: 'Saudi Riyal' },
        { code: 'AED', symbol: '\u062F.\u0625', name: 'UAE Dirham' },
        { code: 'EGP', symbol: '\u062C.\u0645', name: 'Egyptian Pound' },
        { code: 'INR', symbol: '\u20B9', name: 'Indian Rupee' },
        { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
        { code: 'TRY', symbol: '\u20BA', name: 'Turkish Lira' },
        { code: 'NGN', symbol: '\u20A6', name: 'Nigerian Naira' },
        { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee' },
        { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
        { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
        { code: 'KWD', symbol: '\u062F.\u0643', name: 'Kuwaiti Dinar' }
    ],

    // Static fallback rates (updated periodically)
    _fallbackRates: {
        USD: 1, EUR: 0.92, GBP: 0.79, SAR: 3.75, AED: 3.67,
        EGP: 50.85, INR: 83.12, BRL: 4.97, TRY: 32.15, NGN: 1550,
        PKR: 278.50, IDR: 15650, MYR: 4.72, KWD: 0.31
    },

    getCurrency() {
        return localStorage.getItem(this._key) || 'USD';
    },

    setCurrency(code) {
        localStorage.setItem(this._key, code);
        // Dispatch event for UI updates
        window.dispatchEvent(new CustomEvent('currencyChanged', { detail: { currency: code } }));
    },

    getCurrencyInfo(code) {
        code = code || this.getCurrency();
        return this.currencies.find(function(c) { return c.code === code; }) || this.currencies[0];
    },

    async getRates() {
        try {
            // Check cache
            var cached = localStorage.getItem(this._ratesKey);
            if (cached) {
                var parsed = JSON.parse(cached);
                if (parsed.timestamp && (Date.now() - parsed.timestamp) < this._ratesTTL) {
                    return parsed.rates;
                }
            }
            // Try fetching from a free API
            var response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            if (!response.ok) throw new Error('API error');
            var data = await response.json();
            if (data && data.rates) {
                localStorage.setItem(this._ratesKey, JSON.stringify({
                    rates: data.rates,
                    timestamp: Date.now()
                }));
                return data.rates;
            }
            return this._fallbackRates;
        } catch (_err) {
            console.warn('MultiCurrency.getRates: Using fallback rates');
            return this._fallbackRates;
        }
    },

    async convert(amountUSD, targetCurrency) {
        targetCurrency = targetCurrency || this.getCurrency();
        if (targetCurrency === 'USD') return amountUSD;
        var rates = await this.getRates();
        var rate = rates[targetCurrency] || this._fallbackRates[targetCurrency] || 1;
        return Math.round(amountUSD * rate * 100) / 100;
    },

    formatPrice(amount, currencyCode) {
        currencyCode = currencyCode || this.getCurrency();
        var info = this.getCurrencyInfo(currencyCode);
        var formatted = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return info.symbol + formatted;
    },

    async formatPriceFromUSD(amountUSD, targetCurrency) {
        targetCurrency = targetCurrency || this.getCurrency();
        var converted = await this.convert(amountUSD, targetCurrency);
        return this.formatPrice(converted, targetCurrency);
    },

    renderSelector(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var current = this.getCurrency();
        var html = '<select class="form-select form-select--sm currency-selector" id="currency-select">';
        this.currencies.forEach(function(c) {
            html += '<option value="' + c.code + '"' + (c.code === current ? ' selected' : '') + '>' + c.symbol + ' ' + c.code + '</option>';
        });
        html += '</select>';
        container.innerHTML = html;
        document.getElementById('currency-select').addEventListener('change', function() {
            MultiCurrency.setCurrency(this.value);
            UI.toast('Currency changed to ' + this.value, 'success');
            // Re-render prices if possible
            if (typeof window.refreshPrices === 'function') window.refreshPrices();
        });
    },

    // Auto-detect user's currency based on locale
    autoDetect() {
        if (localStorage.getItem(this._key)) return; // User already chose
        try {
            var locale = navigator.language || navigator.userLanguage || 'en-US';
            var regionMap = {
                'ar-SA': 'SAR', 'ar-AE': 'AED', 'ar-EG': 'EGP', 'ar-KW': 'KWD',
                'en-GB': 'GBP', 'en-IN': 'INR', 'pt-BR': 'BRL', 'tr-TR': 'TRY',
                'en-NG': 'NGN', 'ur-PK': 'PKR', 'id-ID': 'IDR', 'ms-MY': 'MYR',
                'de-DE': 'EUR', 'fr-FR': 'EUR', 'es-ES': 'EUR', 'it-IT': 'EUR'
            };
            var detected = regionMap[locale];
            if (detected) this.setCurrency(detected);
        } catch (_e) { /* ignore detection errors */ }
    }
};


// ═══════════════════════════════════════
// MODULE: ABTesting
// ═══════════════════════════════════════
const ABTesting = {
    _visitorId: '',
    _assignments: {},
    _assignmentsKey: 'gm_ab_assignments',

    init() {
        // Generate or retrieve visitor ID
        this._visitorId = localStorage.getItem('gm_ab_visitor') || ('v_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
        localStorage.setItem('gm_ab_visitor', this._visitorId);
        // Load cached assignments
        try {
            var raw = localStorage.getItem(this._assignmentsKey);
            this._assignments = raw ? JSON.parse(raw) : {};
        } catch (_e) { this._assignments = {}; }
    },

    async getActiveTests() {
        try {
            var cached = CACHE.get('ab_tests_active', 300000); // 5 min cache
            if (cached) return cached;
            var { data, error } = await window.supabaseClient.from('ab_tests')
                .select('*')
                .eq('status', 'running');
            if (error) throw error;
            CACHE.set('ab_tests_active', data || []);
            return data || [];
        } catch (err) { console.error('ABTesting.getActiveTests:', err.message); return []; }
    },

    async getVariant(testId) {
        // Check cached assignment first
        if (this._assignments[testId]) return this._assignments[testId];

        try {
            // Check DB for existing assignment
            var { data: existing } = await window.supabaseClient.from('ab_test_assignments')
                .select('variant_id')
                .eq('test_id', testId)
                .eq('visitor_id', this._visitorId)
                .single();
            if (existing) {
                this._assignments[testId] = existing.variant_id;
                this._saveAssignments();
                return existing.variant_id;
            }

            // Assign a variant based on weights
            var tests = await this.getActiveTests();
            var test = tests.find(function(t) { return t.id === testId; });
            if (!test || !test.variants) return 'control';

            var variants = typeof test.variants === 'string' ? JSON.parse(test.variants) : test.variants;
            var totalWeight = variants.reduce(function(sum, v) { return sum + (v.weight || 50); }, 0);
            var rand = Math.random() * totalWeight;
            var cumulative = 0;
            var assigned = 'control';
            for (var i = 0; i < variants.length; i++) {
                cumulative += (variants[i].weight || 50);
                if (rand <= cumulative) {
                    assigned = variants[i].id;
                    break;
                }
            }

            // Save assignment
            this._assignments[testId] = assigned;
            this._saveAssignments();
            await window.supabaseClient.from('ab_test_assignments').insert({
                test_id: testId,
                visitor_id: this._visitorId,
                variant_id: assigned
            });

            return assigned;
        } catch (err) {
            console.error('ABTesting.getVariant:', err.message);
            return this._assignments[testId] || 'control';
        }
    },

    async trackConversion(testId, conversionType, value) {
        try {
            var variantId = this._assignments[testId] || await this.getVariant(testId);
            await window.supabaseClient.from('ab_test_conversions').insert({
                test_id: testId,
                variant_id: variantId,
                visitor_id: this._visitorId,
                conversion_type: conversionType || 'click',
                conversion_value: value || 0
            });
            Analytics.track('ab_conversion', 'experiment', { test_id: testId, variant: variantId, type: conversionType });
        } catch (err) { console.error('ABTesting.trackConversion:', err.message); }
    },

    async applyTests() {
        try {
            var tests = await this.getActiveTests();
            var currentPath = window.location.pathname;
            for (var i = 0; i < tests.length; i++) {
                var test = tests[i];
                // Check if test applies to current page
                if (test.target_pages && test.target_pages.length > 0) {
                    var applies = test.target_pages.some(function(p) { return currentPath.indexOf(p) !== -1 || p === '*'; });
                    if (!applies) continue;
                }
                var variant = await this.getVariant(test.id);
                if (test.element_selector && variant !== 'control') {
                    var variants = typeof test.variants === 'string' ? JSON.parse(test.variants) : test.variants;
                    var variantData = variants.find(function(v) { return v.id === variant; });
                    if (variantData && variantData.content) {
                        var elements = document.querySelectorAll(test.element_selector);
                        elements.forEach(function(el) {
                            el.innerHTML = variantData.content;
                        });
                    }
                }
            }
        } catch (err) { console.error('ABTesting.applyTests:', err.message); }
    },

    _saveAssignments() {
        try {
            localStorage.setItem(this._assignmentsKey, JSON.stringify(this._assignments));
        } catch (_e) { /* ignore */ }
    },

    // Admin: get test results
    async getResults(testId) {
        try {
            if (!Auth.requireAdmin()) return null;
            var { data, error } = await window.supabaseClient.rpc('get_ab_test_results', { p_test_id: testId });
            if (error) throw error;
            return data;
        } catch (err) { console.error('ABTesting.getResults:', err.message); return null; }
    },

    // Admin: create a new test
    async createTest(testData) {
        try {
            if (!Auth.requireAdmin()) return null;
            var row = {
                name: Security.sanitize(testData.name || ''),
                description: Security.sanitize(testData.description || ''),
                element_selector: Security.sanitize(testData.element_selector || ''),
                variants: testData.variants || [],
                target_pages: testData.target_pages || [],
                status: testData.status || 'draft',
                created_by: Auth.getAuthId()
            };
            var { data, error } = await window.supabaseClient.from('ab_tests').insert(row).select().single();
            if (error) throw error;
            DB.admin.log('create_ab_test', { test_id: data.id, name: row.name });
            return data;
        } catch (err) { console.error('ABTesting.createTest:', err.message); return null; }
    },

    // Admin: update test status
    async updateStatus(testId, status) {
        try {
            if (!Auth.requireAdmin()) return false;
            var updates = { status: status };
            if (status === 'running') updates.start_date = new Date().toISOString();
            if (status === 'completed') updates.end_date = new Date().toISOString();
            var { error } = await window.supabaseClient.from('ab_tests').update(updates).eq('id', testId);
            if (error) throw error;
            DB.admin.log('update_ab_test_status', { test_id: testId, status: status });
            return true;
        } catch (err) { console.error('ABTesting.updateStatus:', err.message); return false; }
    }
};


// ═══════════════════════════════════════
// MODULE: Purchases (LemonSqueezy Order History)
// ═══════════════════════════════════════
const _Purchases = {
    async getByUser() {
        try {
            if (!Auth.requireAuth()) return [];
            var email = Auth.getEmail();
            var uid = Auth.getAuthId();
            var { data, error } = await window.supabaseClient.from('purchases')
                .select('*')
                .or('uid.eq.' + uid + ',email.eq.' + email)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) { console.error('Purchases.getByUser:', err.message); return []; }
    },

    async getOne(orderId) {
        try {
            if (!Auth.requireAuth()) return null;
            var { data, error } = await window.supabaseClient.from('purchases')
                .select('*')
                .eq('order_id', orderId)
                .single();
            if (error) throw error;
            return data;
        } catch (err) { console.error('Purchases.getOne:', err.message); return null; }
    },

    formatStatus(status) {
        var map = {
            paid: '<span class="badge badge--success">Paid</span>',
            refunded: '<span class="badge badge--warning">Refunded</span>',
            disputed: '<span class="badge badge--error">Disputed</span>',
            pending: '<span class="badge badge--info">Pending</span>'
        };
        return map[status] || '<span class="badge">' + Security.sanitize(status) + '</span>';
    },

    formatPrice(cents, currency) {
        var amount = (cents || 0) / 100;
        currency = currency || 'USD';
        return MultiCurrency.formatPrice(amount, currency);
    },

    // Admin: get all purchases
    async getAll(opts) {
        try {
            if (!Auth.requireAdmin()) return { data: [], count: 0 };
            var limit = (opts && opts.limit) || 20;
            var offset = (opts && opts.offset) || 0;
            var { data, error, count } = await window.supabaseClient.from('purchases')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (error) throw error;
            return { data: data || [], count: count || 0 };
        } catch (err) { console.error('Purchases.getAll:', err.message); return { data: [], count: 0 }; }
    }
};


// ═══════════════════════════════════════
// GLOBAL INIT: Initialize all new features
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
    // Initialize analytics tracking
    Analytics.init();

    // Initialize A/B testing
    ABTesting.init();
    ABTesting.applyTests();

    // Initialize push notifications
    PushNotifications.init();

    // Initialize multi-currency (auto-detect)
    MultiCurrency.autoDetect();

    // Check for referral codes in URL
    Referrals.checkReferral();


    // Push notification prompt disabled — intrusive UX
    // setTimeout(function() {
    //     if (Auth.isLoggedIn()) {
    //         PushNotifications.showPrompt();
    //     }
    // }, 20000);

    // Sync wishlist from server on login
    if (Auth.isLoggedIn()) {
        Wishlist.syncFromServer();
    }
});
