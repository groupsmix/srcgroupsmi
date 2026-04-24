import { useState, useEffect } from 'preact/hooks';

export default function NotificationsDropdown() {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const [unread, setUnread] = useState(0);

    // Initial load of unread count (you might get this from global state instead)
    useEffect(() => {
        if (typeof window !== 'undefined' && window.Auth) {
            const user = window.Auth.getUser();
            if (user && user.unread_notifications) {
                setUnread(user.unread_notifications);
            }
        }
    }, []);

    const toggleOpen = async () => {
        const nextOpen = !open;
        setOpen(nextOpen);
        if (nextOpen) {
            setLoading(true);
            try {
                if (typeof window !== 'undefined' && window.DB && window.Auth) {
                    const { data } = await window.DB.notifications.getByUser(window.Auth.getUserId(), { limit: 5 });
                    setNotifications(data || []);
                }
            } catch (err) {
                console.error('Failed to load notifications', err);
            } finally {
                setLoading(false);
            }
        }
    };

    const handleNotificationClick = async (n) => {
        if (typeof window !== 'undefined' && window.DB && window.Security) {
            if (n.id) {
                await window.DB.notifications.markRead(n.id);
            }
            if (n.link && window.Security.isSafeNavigationUrl(n.link)) {
                window.location.href = n.link;
            }
        }
    };

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (open && !e.target.closest('#notification-wrapper-island')) {
                setOpen(false);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [open]);

    return (
        <div id="notification-wrapper-island" class="header-notification" style={{ position: 'relative' }}>
            <button 
                class="header-notification__btn" 
                aria-label="Notifications" 
                onClick={toggleOpen}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {unread > 0 && <span class="header-notification__dot"></span>}
            </button>

            {open && (
                <div class="notification-dropdown">
                    <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-primary)', fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>
                        Notifications
                    </div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {loading ? (
                            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                                Loading...
                            </div>
                        ) : notifications.length === 0 ? (
                            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                                No notifications
                            </div>
                        ) : (
                            notifications.map(n => {
                                const t = (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.notificationTypes && window.CONFIG.notificationTypes[n.type]) || { icon: '🔔', title: 'Notification' };
                                return (
                                    <div 
                                        key={n.id} 
                                        class={`notification-dropdown__item ${n.read ? '' : 'notification-dropdown__item--unread'}`}
                                        onClick={() => handleNotificationClick(n)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <span>{t.icon}</span>
                                        <div>
                                            <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>
                                                {typeof window !== 'undefined' && window.Security ? window.Security.sanitize(n.title || t.title) : n.title || t.title}
                                            </div>
                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                                                {typeof window !== 'undefined' && window.Security ? window.Security.sanitize(n.message || '') : n.message || ''}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    <a href="/dashboard" style={{ display: 'block', textAlign: 'center', padding: 'var(--space-3)', borderTop: '1px solid var(--border-primary)', fontSize: 'var(--text-sm)' }}>
                        View All
                    </a>
                </div>
            )}
        </div>
    );
}