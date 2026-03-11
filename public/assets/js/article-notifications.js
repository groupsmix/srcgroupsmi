/**
 * Article Notifications Module — article-notifications.js
 * Notification system for likes, comments, follows, article approvals, mentions
 * Real-time updates via Supabase Realtime
 *
 * Dependencies: Auth (app.js), UI (components.js), Security (app.js)
 */

/* global Auth, UI, Security */

const ArticleNotifications = {
    _unreadCount: 0,
    _subscription: null,
    _panelOpen: false,
    _notifications: [],
    _bellEl: null,
    _panelEl: null,

    // ═══════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════
    async init() {
        await Auth.waitForAuth();
        if (!Auth.isLoggedIn()) return;

        this._createBell();
        this._loadNotifications();
        this._subscribeRealtime();
    },

    // ═══════════════════════════════════════
    // BELL ICON (injected into header)
    // ═══════════════════════════════════════
    _createBell() {
        const header = document.getElementById('site-header');
        if (!header) return;

        // Wait for header to render
        const observer = new MutationObserver(() => {
            const nav = header.querySelector('.nav__actions, .header__actions, nav');
            if (!nav) return;
            observer.disconnect();

            // Check if bell already exists
            if (document.getElementById('notification-bell')) return;

            const bell = document.createElement('button');
            bell.id = 'notification-bell';
            bell.className = 'notification-bell';
            bell.setAttribute('aria-label', 'Notifications');
            bell.setAttribute('title', 'Notifications');
            bell.innerHTML =
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>' +
                '<span id="notification-badge" class="notification-bell__badge" style="display:none">0</span>';

            nav.insertBefore(bell, nav.firstChild);
            this._bellEl = bell;

            bell.addEventListener('click', (e) => {
                e.stopPropagation();
                this._togglePanel();
            });

            // Close panel on outside click
            document.addEventListener('click', (e) => {
                if (this._panelOpen && this._panelEl && !this._panelEl.contains(e.target) && e.target !== bell) {
                    this._closePanel();
                }
            });
        });

        observer.observe(header, { childList: true, subtree: true });

        // Also try immediately in case header already rendered
        setTimeout(() => {
            const nav = header.querySelector('.nav__actions, .header__actions, nav');
            if (nav && !document.getElementById('notification-bell')) {
                observer.disconnect();
                const bell = document.createElement('button');
                bell.id = 'notification-bell';
                bell.className = 'notification-bell';
                bell.setAttribute('aria-label', 'Notifications');
                bell.innerHTML =
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>' +
                    '<span id="notification-badge" class="notification-bell__badge" style="display:none">0</span>';
                nav.insertBefore(bell, nav.firstChild);
                this._bellEl = bell;
                bell.addEventListener('click', (e) => { e.stopPropagation(); this._togglePanel(); });
                document.addEventListener('click', (e) => {
                    if (this._panelOpen && this._panelEl && !this._panelEl.contains(e.target) && e.target !== bell) {
                        this._closePanel();
                    }
                });
            }
        }, 1500);
    },

    // ═══════════════════════════════════════
    // LOAD NOTIFICATIONS
    // ═══════════════════════════════════════
    async _loadNotifications() {
        try {
            const { data, error } = await window.supabaseClient
                .from('notifications')
                .select('*')
                .eq('user_id', Auth.getAuthId())
                .order('created_at', { ascending: false })
                .limit(30);

            if (error) {
                // Table or column may not exist yet — silence gracefully
                if (error.code === '42703' || error.code === '42P01' || (error.message && error.message.indexOf('does not exist') !== -1)) {
                    this._notifications = [];
                    this._unreadCount = 0;
                    this._updateBadge();
                    return;
                }
                throw error;
            }
            this._notifications = data || [];

            // Count unread
            this._unreadCount = this._notifications.filter(n => !n.read).length;
            this._updateBadge();
        } catch (err) {
            console.error('ArticleNotifications._loadNotifications:', err.message);
            this._notifications = [];
            this._unreadCount = 0;
            this._updateBadge();
        }
    },

    // ═══════════════════════════════════════
    // REALTIME SUBSCRIPTION
    // ═══════════════════════════════════════
    _subscribeRealtime() {
        try {
            this._subscription = window.supabaseClient
                .channel('notifications-' + Auth.getAuthId())
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: 'user_id=eq.' + Auth.getAuthId()
                }, (payload) => {
                    if (payload.new) {
                        this._notifications.unshift(payload.new);
                        this._unreadCount++;
                        this._updateBadge();

                        // Show toast for new notification
                        if (typeof UI !== 'undefined' && UI.toast) {
                            UI.toast(Security.sanitize(payload.new.message || 'New notification'), 'info');
                        }

                        // Update panel if open
                        if (this._panelOpen) {
                            this._renderPanel();
                        }
                    }
                })
                .subscribe();
        } catch (err) {
            // Realtime subscription may fail if table doesn't exist — silence gracefully
            console.warn('ArticleNotifications._subscribeRealtime: skipped —', err.message);
        }
    },

    // ═══════════════════════════════════════
    // BADGE
    // ═══════════════════════════════════════
    _updateBadge() {
        const badge = document.getElementById('notification-badge');
        if (!badge) return;

        if (this._unreadCount > 0) {
            badge.textContent = this._unreadCount > 99 ? '99+' : this._unreadCount;
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    },

    // ═══════════════════════════════════════
    // PANEL
    // ═══════════════════════════════════════
    _togglePanel() {
        if (this._panelOpen) {
            this._closePanel();
        } else {
            this._openPanel();
        }
    },

    _openPanel() {
        if (!this._panelEl) {
            this._panelEl = document.createElement('div');
            this._panelEl.id = 'notification-panel';
            this._panelEl.className = 'notification-panel';
            document.body.appendChild(this._panelEl);
        }

        this._renderPanel();
        this._panelEl.classList.add('notification-panel--open');
        this._panelOpen = true;

        // Mark all as read
        this._markAllRead();
    },

    _closePanel() {
        if (this._panelEl) {
            this._panelEl.classList.remove('notification-panel--open');
        }
        this._panelOpen = false;
    },

    _renderPanel() {
        if (!this._panelEl) return;

        let html = '<div class="notification-panel__header">' +
            '<h3 class="notification-panel__title">Notifications</h3>' +
            (this._unreadCount > 0 ? '<button id="btn-mark-all-read" class="btn btn-ghost btn-sm">Mark all read</button>' : '') +
            '</div>';

        if (this._notifications.length === 0) {
            html += '<div class="notification-panel__empty">No notifications yet</div>';
        } else {
            html += '<div class="notification-panel__list">';
            this._notifications.forEach(n => {
                const icon = this._getNotificationIcon(n.type);
                const timeAgo = UI.formatDate(n.created_at);
                const link = this._getNotificationLink(n);

                html += '<a href="' + link + '" class="notification-item' + (!n.read ? ' notification-item--unread' : '') + '">' +
                    '<div class="notification-item__icon">' + icon + '</div>' +
                    '<div class="notification-item__body">' +
                        '<div class="notification-item__message">' + Security.sanitize(n.message || '') + '</div>' +
                        '<div class="notification-item__time">' + timeAgo + '</div>' +
                    '</div>' +
                '</a>';
            });
            html += '</div>';
        }

        this._panelEl.innerHTML = html;

        // Mark all read button
        const markBtn = document.getElementById('btn-mark-all-read');
        if (markBtn) {
            markBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._markAllRead();
            });
        }
    },

    _getNotificationIcon(type) {
        const icons = {
            like: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>',
            comment: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
            follow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
            article_approved: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            mention: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.92 7.94"/></svg>',
            badge: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>'
        };
        return icons[type] || icons.like;
    },

    _getNotificationLink(notification) {
        if (notification.content_type === 'article' && notification.content_id) {
            return '/article?slug=' + encodeURIComponent(notification.content_id);
        }
        if (notification.type === 'follow' && notification.actor_id) {
            return '/author?id=' + encodeURIComponent(notification.actor_id);
        }
        return '/articles';
    },

    // ═══════════════════════════════════════
    // MARK ALL READ
    // ═══════════════════════════════════════
    async _markAllRead() {
        if (this._unreadCount === 0) return;

        try {
            const { error } = await window.supabaseClient
                .from('notifications')
                .update({ read: true })
                .eq('user_id', Auth.getAuthId())
                .eq('read', false);

            // If table/column doesn't exist, just clear locally
            if (error && (error.code === '42703' || error.code === '42P01' || (error.message && error.message.indexOf('does not exist') !== -1))) {
                console.warn('ArticleNotifications._markAllRead: table issue —', error.message);
            }

            this._notifications.forEach(n => { n.read = true; });
            this._unreadCount = 0;
            this._updateBadge();

            if (this._panelOpen) this._renderPanel();
        } catch (err) {
            console.error('ArticleNotifications._markAllRead:', err.message);
        }
    },

    // ═══════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════
    destroy() {
        if (this._subscription) {
            window.supabaseClient.removeChannel(this._subscription);
            this._subscription = null;
        }
    }
};

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    ArticleNotifications.init();
});
