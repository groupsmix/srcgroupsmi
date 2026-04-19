// ─── Module: ui-render ───
// Exports: renderHeader, renderFooter, renderMobileNav, and related functions

// ═══════════════════════════════════════
// MODULE 11: renderHeader
// ═══════════════════════════════════════
function renderHeader() {
    const header = document.getElementById('site-header');
    if (!header) return;
    const isLoggedIn = Auth.isLoggedIn();
    const user = Auth.getUser();
    const unread = user?.unread_notifications || 0;
    const _displayName = Security.sanitize(user?.display_name || 'User').slice(0, 16);
    const photoUrl = user?.photo_url || '';
    const avatarInitial = (user?.display_name || 'U').charAt(0).toUpperCase();

    // Build avatar HTML: use Google photo if available, otherwise initials
    // Issue #10 fix: use sanitizeUrl instead of sanitize to preserve forward slashes in URLs
    var avatarHtml = photoUrl
        ? '<img src="' + Security.sanitizeUrl(photoUrl) + '" alt="" class="header-avatar__img">'
        : '<span class="header-avatar__initials">' + avatarInitial + '</span>';

    // Determine active nav item from current path
    var currentPath = window.location.pathname;
    function navActive(paths) {
        for (var i = 0; i < paths.length; i++) {
            if (currentPath === paths[i] || currentPath.startsWith(paths[i] + '/') || currentPath.startsWith(paths[i] + '?')) return ' subnav__item--active';
        }
        return '';
    }

    // ── Build Top Header Bar ──
    header.innerHTML = '<nav class="site-header"><div class="site-header__inner">' +
        // ── Left: Hamburger Menu ──
        '<div class="site-header__left">' +
        '<button id="drawer-toggle" class="site-header__hamburger" aria-label="Open menu">' + ICONS.menu + '</button>' +
        '</div>' +
        // ── Center: Logo + Magic + Button ──
        '<div class="site-header__center">' +
        '<a href="/" class="site-header__logo"><img src="/assets/img/favicon.svg" alt="GroupsMix" class="site-header__logo-icon"><span class="site-header__logo-text">GroupsMix</span></a>' +
        '<div class="magic-plus-wrapper" style="position:relative">' +
        '<button id="magic-plus-btn" class="magic-plus-btn" aria-label="Submit Group, Post Job, or more" title="Submit Group, Post Job, or more">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        '</button>' +
        '</div>' +
        '</div>' +
        // ── Right: Login / User Actions ──
        '<div class="site-header__right">' +
        (isLoggedIn ?
            '<div id="notification-wrapper" class="header-notification" style="position:relative">' +
            '<button id="notification-btn" class="header-notification__btn" aria-label="Notifications">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
            (unread > 0 ? '<span class="header-notification__dot"></span>' : '') +
            '</button>' +
            '</div>' +
            '<div id="user-menu-wrapper" style="position:relative">' +
            '<button id="user-menu-btn" class="header-user-link" title="Account menu" aria-label="Account menu" type="button">' +
            '<div class="header-avatar">' + avatarHtml + '</div>' +
            '</button>' +
            '</div>'
            :
            '<button id="auth-signup-btn" class="header-signup-btn">Sign Up Free</button>' +
            '<button id="auth-btn" class="header-login-btn">Login</button>'
        ) +
        '</div>' +
        '</div></nav>' +
        // ── Horizontal Sub-Navigation Bar (Expanded) ──
        '<div class="subnav" id="subnav">' +
        '<div class="subnav__inner">' +
                '<a href="/" class="subnav__item' + (currentPath === '/' ? ' subnav__item--active' : '') + '">All</a>' +
                '<a href="/jobs" class="subnav__item' + navActive(['/jobs', '/post-job']) + '">Jobs</a>' +
                '<a href="/marketplace" class="subnav__item' + navActive(['/marketplace']) + '">Markets</a>' +
                '<a href="/store" class="subnav__item' + navActive(['/store']) + '">Store</a>' +
                '<a href="/tools" class="subnav__item' + navActive(['/tools']) + '">AI Tools</a>' +
                '<a href="/articles" class="subnav__item' + navActive(['/articles']) + '">Articles</a>' +
                '<div class="subnav__more-wrapper" style="position:relative">' +
                '<button class="subnav__item subnav__more-btn" id="subnav-more-btn" type="button">More <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-left:2px"><polyline points="6 9 12 15 18 9"/></svg></button>' +
                '</div>' +
        '</div>' +
        '</div>';

    // ── Event listeners ──
    // Magic + button dropdown
    var magicBtn = document.getElementById('magic-plus-btn');
    if (magicBtn) {
        magicBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var wrapper = magicBtn.closest('.magic-plus-wrapper');
            var existing = wrapper.querySelector('.magic-plus-dropdown');
            if (existing) { existing.remove(); return; }
            closeAllDropdowns();
            var dropdown = document.createElement('div');
            dropdown.className = 'magic-plus-dropdown';
            dropdown.innerHTML =
                                '<a href="/post-job" class="magic-plus-dropdown__item">' + ICONS.briefcase + ' <span>Post a Job</span></a>' +
                                '<a href="/submit" class="magic-plus-dropdown__item">' + ICONS.users + ' <span>Submit Group</span></a>' +
                                '<a href="/write-article" class="magic-plus-dropdown__item">' + ICONS.newspaper + ' <span>Write Article</span></a>' +
                                '<a href="/sell" class="magic-plus-dropdown__item">' + ICONS.store + ' <span>Sell Product</span></a>';
            wrapper.appendChild(dropdown);
        });
    }

    if (isLoggedIn) {
        document.getElementById('notification-btn')?.addEventListener('click', toggleNotificationDropdown);
        document.getElementById('user-menu-btn')?.addEventListener('click', function(e) { e.preventDefault(); toggleUserDropdown(); });
    } else {
        document.getElementById('auth-btn')?.addEventListener('click', () => UI.authModal('signin'));
        document.getElementById('auth-signup-btn')?.addEventListener('click', () => UI.authModal('signup'));
    }
    document.getElementById('drawer-toggle')?.addEventListener('click', openDrawer);

    // "More" dropdown in sub-nav
    var moreBtn = document.getElementById('subnav-more-btn');
    if (moreBtn) {
        moreBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var subnav = document.getElementById('subnav');
            var existing = subnav.querySelector('.subnav__more-dropdown');
            if (existing) { existing.remove(); return; }
            closeAllDropdowns();
            var dd = document.createElement('div');
            dd.className = 'subnav__more-dropdown';
            dd.innerHTML =
                '<a href="/browse" class="subnav__more-item">' + ICONS.search + ' Browse Groups</a>' +
                '<a href="/submit" class="subnav__more-item">' + ICONS.upload + ' Submit Group</a>' +
                '<a href="/scam-wall" class="subnav__more-item">' + ICONS.shield + ' Scam Wall</a>' +
                '<a href="/leaderboard" class="subnav__more-item">' + ICONS.star + ' Leaderboard</a>' +
                '<a href="/stats" class="subnav__more-item">' + ICONS.zap + ' Stats</a>' +
                '<a href="/fuel" class="subnav__more-item">' + ICONS.heart + ' Fuel the Community</a>';
            // Position dropdown aligned to the More button, appended to subnav to avoid overflow clipping
            var btnRect = moreBtn.getBoundingClientRect();
            var subnavRect = subnav.getBoundingClientRect();
            dd.style.position = 'absolute';
            dd.style.top = (btnRect.bottom - subnavRect.top + 4) + 'px';
            dd.style.right = (subnavRect.right - btnRect.right) + 'px';
            subnav.appendChild(dd);
        });
    }

    renderAnnouncement();
}

function toggleNotificationDropdown() {
    const wrapper = document.getElementById('notification-wrapper');
    if (!wrapper) return;
    const existing = wrapper.querySelector('.notification-dropdown');
    if (existing) { existing.remove(); return; }
    closeAllDropdowns();
    const dropdown = document.createElement('div');
    dropdown.className = 'notification-dropdown';
    dropdown.innerHTML = '<div style="padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--border-primary);font-weight:var(--font-semibold);font-size:var(--text-sm)">Notifications</div>' +
        '<div id="notification-list" style="max-height:300px;overflow-y:auto"><div style="padding:var(--space-4);text-align:center;color:var(--text-tertiary);font-size:var(--text-sm)">Loading...</div></div>' +
        '<a href="/dashboard" style="display:block;text-align:center;padding:var(--space-3);border-top:1px solid var(--border-primary);font-size:var(--text-sm)">View All</a>';
    wrapper.appendChild(dropdown);
    loadNotificationDropdown();
}

async function loadNotificationDropdown() {
    const list = document.getElementById('notification-list');
    if (!list) return;
    try {
        const { data } = await DB.notifications.getByUser(Auth.getUserId(), { limit: 5 });
        if (!data?.length) { list.innerHTML = '<div style="padding:var(--space-4);text-align:center;color:var(--text-tertiary);font-size:var(--text-sm)">No notifications</div>'; return; }
        list.innerHTML = data.map(n => {
            const t = CONFIG.notificationTypes[n.type] || CONFIG.notificationTypes.info;
            return '<div class="notification-dropdown__item' + (n.read ? '' : ' notification-dropdown__item--unread') + '" data-id="' + n.id + '"' + (n.link ? ' data-link="' + Security.sanitize(n.link) + '"' : '') + '>' +
                '<span>' + t.icon + '</span><div><div style="font-weight:var(--font-semibold);font-size:var(--text-sm)">' + Security.sanitize(n.title || t.title) + '</div>' +
                '<div style="font-size:var(--text-xs);color:var(--text-tertiary)">' + Security.sanitize(n.message || '') + '</div></div></div>';
        }).join('');
        list.querySelectorAll('.notification-dropdown__item').forEach(item => {
            item.addEventListener('click', async () => {
                const id = item.dataset.id;
                if (id) await DB.notifications.markRead(id);
                // Security: validate notification URL before navigation to prevent XSS
                if (item.dataset.link && Security.isSafeNavigationUrl(item.dataset.link)) {
                    window.location.href = item.dataset.link;
                } else if (item.dataset.link) {
                    console.warn('Blocked unsafe notification link:', item.dataset.link);
                }
            });
        });
    } catch (err) { console.error('loadNotificationDropdown:', err.message); list.innerHTML = '<div style="padding:var(--space-4);text-align:center;color:var(--text-tertiary);font-size:var(--text-sm)">Unable to load</div>'; }
}

function toggleUserDropdown() {
    const wrapper = document.getElementById('user-menu-wrapper');
    if (!wrapper) return;
    const existing = wrapper.querySelector('.user-dropdown');
    if (existing) { existing.remove(); return; }
    closeAllDropdowns();
    const dropdown = document.createElement('div');
    dropdown.className = 'user-dropdown';
    // User info header in dropdown
    var userObj = Auth.getUser();
    var dropdownAvatarInitial = (userObj?.display_name || 'U').charAt(0).toUpperCase();
    var dropdownPhotoUrl = userObj?.photo_url || '';
    var dropdownAvatarHtml = dropdownPhotoUrl
        ? '<img src="' + Security.sanitizeUrl(dropdownPhotoUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
        : '<span style="font-size:var(--text-base);font-weight:var(--font-bold);color:#6200ea">' + dropdownAvatarInitial + '</span>';
    let items = '<div class="user-dropdown__header">' +
        '<div class="user-dropdown__header-avatar">' + dropdownAvatarHtml + '</div>' +
        '<div class="user-dropdown__header-info">' +
        '<div class="user-dropdown__header-name">' + Security.sanitize(userObj?.display_name || 'User') + '</div>' +
        '<div class="user-dropdown__header-email">' + Security.sanitize(userObj?.email || '') + '</div>' +
        '</div></div>' +
        '<div class="user-dropdown__divider"></div>' +
        '<a href="/dashboard" class="user-dropdown__item"><span class="user-dropdown__icon">' + ICONS.dashboard + '</span> Dashboard</a>' +
        '<a href="/settings" class="user-dropdown__item"><span class="user-dropdown__icon">' + ICONS.settings + '</span> Settings</a>' +
        '<a href="/my-groups" class="user-dropdown__item"><span class="user-dropdown__icon">' + ICONS.clipboard + '</span> My Groups</a>' +
        '<a href="/saved" class="user-dropdown__item"><span class="user-dropdown__icon">' + ICONS.heart + '</span> Saved</a>' +
        '<div class="user-dropdown__divider"></div>' +
        '<a href="/dashboard" class="user-dropdown__item"><span class="user-dropdown__icon">' + ICONS.bell + '</span> Notifications' + (userObj?.unread_notifications > 0 ? ' <span style="background:var(--error);color:#fff;font-size:10px;padding:1px 6px;border-radius:var(--radius-full)">' + userObj.unread_notifications + '</span>' : '') + '</a>' +
        '<button id="dropdown-theme-toggle" class="user-dropdown__item" style="width:100%;border:none;background:none;cursor:pointer;text-align:left"><span class="user-dropdown__icon theme-toggle-icon">' + (Theme.get() === 'dark' ? ICONS.sun : ICONS.moon) + '</span> ' + (Theme.get() === 'dark' ? 'Light Mode' : 'Dark Mode') + '</button>';
    if (Auth.isAdmin() || Auth.isModerator() || Auth.isEditor()) items += '<a href="/admin" class="user-dropdown__item"><span class="user-dropdown__icon">' + ICONS.zap + '</span> Admin Panel</a>';
    items += '<div class="user-dropdown__divider"></div>' +
        '<button id="signout-btn" class="user-dropdown__item user-dropdown__item--danger" style="width:100%;border:none;background:none;cursor:pointer;text-align:left"><span class="user-dropdown__icon">' + ICONS.log_out + '</span> Sign Out</button>';
    dropdown.innerHTML = items;
    wrapper.appendChild(dropdown);
    document.getElementById('signout-btn')?.addEventListener('click', () => Auth.signOut());
    document.getElementById('dropdown-theme-toggle')?.addEventListener('click', function() { Theme.toggle(); closeAllDropdowns(); renderHeader(); });
}

function closeAllDropdowns() {
    document.querySelectorAll('.notification-dropdown, .user-dropdown, .magic-plus-dropdown, .subnav__more-dropdown').forEach(d => d.remove());
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#notification-wrapper') && !e.target.closest('#user-menu-wrapper') && !e.target.closest('.magic-plus-wrapper') && !e.target.closest('.subnav__more-wrapper') && !e.target.closest('.subnav__more-dropdown')) closeAllDropdowns();
});

function openDrawer() {
    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.id = 'drawer-overlay';
    const drawer = document.createElement('div');
    drawer.className = 'drawer';
    drawer.id = 'main-drawer';
    const isLoggedIn = Auth.isLoggedIn();
    let links = '<div class="drawer__header"><span style="font-weight:var(--font-bold)">' + ICONS.globe + ' GroupsMix</span><button id="drawer-close" class="btn btn-ghost btn-icon" aria-label="Close menu">&times;</button></div>';
    // Mobile-only: user info, notifications, theme toggle at top of drawer
    if (isLoggedIn) {
        links += '<div class="drawer__item" style="font-weight:var(--font-semibold);color:var(--text-primary)">' + ICONS.user + ' ' + Security.sanitize(Auth.getUser()?.display_name || 'User') + '</div>';
        links += '<a href="/dashboard" class="drawer__item">' + ICONS.bell + ' Notifications' + (Auth.getUser()?.unread_notifications > 0 ? ' <span style="background:var(--error);color:#fff;font-size:10px;padding:1px 6px;border-radius:var(--radius-full);margin-left:4px">' + Auth.getUser().unread_notifications + '</span>' : '') + '</a>';
    }
    links += '<button id="drawer-theme-toggle" class="drawer__item" style="width:100%;border:none;background:none;cursor:pointer;text-align:left"><span class="theme-toggle-icon">' + (Theme.get() === 'dark' ? ICONS.sun : ICONS.moon) + '</span> ' + (Theme.get() === 'dark' ? 'Light Mode' : 'Dark Mode') + '</button>';
    links += '<div class="drawer__divider"></div>';
    // Main sections
    links += '<a href="/" class="drawer__item">' + ICONS.home + ' Home</a>';
    links += '<a href="/browse" class="drawer__item">' + ICONS.users + ' Groups</a>';
    links += '<a href="/jobs" class="drawer__item">' + ICONS.briefcase + ' Jobs</a>';
    links += '<a href="/marketplace" class="drawer__item">' + ICONS.store + ' Marketplace</a>';
    links += '<a href="/store" class="drawer__item">' + ICONS.shopping_cart + ' Store</a>';
    links += '<a href="/tools" class="drawer__item">' + ICONS.tools + ' Tools</a>';
    links += '<div class="drawer__divider"></div>';
    // User profile & settings
    if (isLoggedIn) {
        links += '<a href="/dashboard" class="drawer__item">' + ICONS.dashboard + ' Profile</a>';
        links += '<a href="/settings" class="drawer__item">' + ICONS.settings + ' Settings</a>';
        links += '<a href="/my-groups" class="drawer__item">' + ICONS.clipboard + ' My Groups</a>';
        if (Auth.isAdmin() || Auth.isModerator() || Auth.isEditor()) links += '<a href="/admin" class="drawer__item">' + ICONS.settings + ' Admin Panel</a>';
        links += '<div class="drawer__divider"></div>';
    }
    // More links
    links += '<a href="/search" class="drawer__item">' + ICONS.search + ' Search</a>';
    links += '<a href="/submit" class="drawer__item">' + ICONS.upload + ' Submit Group</a>';
    if (CONFIG.features.articles) links += '<a href="/articles" class="drawer__item">' + ICONS.newspaper + ' Articles</a>';
    links += '<div class="drawer__divider"></div>';
    links += '<a href="/about" class="drawer__item">' + ICONS.info + ' About</a>';
    links += '<a href="/contact" class="drawer__item">' + ICONS.phone + ' Contact</a>';
    links += '<a href="/privacy" class="drawer__item">' + ICONS.lock + ' Privacy</a>';
    links += '<a href="/terms" class="drawer__item">' + ICONS.file_text + ' Terms</a>';
    if (CONFIG.features.donate) { links += '<div class="drawer__divider"></div>'; links += '<a href="/fuel" class="drawer__item">' + ICONS.heart + ' Fuel the Community</a>'; }
    if (isLoggedIn) {
        links += '<div class="drawer__divider"></div>';
        links += '<button id="drawer-signout" class="drawer__item" style="width:100%;border:none;background:none;cursor:pointer;text-align:left">' + ICONS.log_out + ' Sign Out</button>';
    }
    drawer.innerHTML = links;
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    const closeDrawer = () => { overlay.remove(); drawer.remove(); };
    overlay.addEventListener('click', closeDrawer);
    document.getElementById('drawer-close')?.addEventListener('click', closeDrawer);
    document.getElementById('drawer-signout')?.addEventListener('click', () => { closeDrawer(); Auth.signOut(); });
    document.getElementById('drawer-theme-toggle')?.addEventListener('click', () => { Theme.toggle(); closeDrawer(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { closeDrawer(); document.removeEventListener('keydown', esc); } });
}

function renderAnnouncement() {
    const bar = document.getElementById('announcement-bar');
    if (!bar) return;
    if (!CONFIG.announcement.enabled) { bar.innerHTML = ''; return; }
    if (sessionStorage.getItem('gm_announcement_dismissed')) { bar.innerHTML = ''; return; }
    const typeClass = 'announcement-bar--' + (CONFIG.announcement.type || 'info');
    bar.innerHTML = '<div class="announcement-bar ' + typeClass + '">' +
        '<span>' + Security.sanitize(CONFIG.announcement.text || '') +
        // Audit fix #3: use sanitizeUrl() for href to block javascript: protocol XSS
        (CONFIG.announcement.link ? ' <a href="' + Security.sanitizeUrl(CONFIG.announcement.link) + '" style="color:#fff;text-decoration:underline">Learn more</a>' : '') +
        '</span>' +
        '<button class="announcement-bar__close" aria-label="Dismiss announcement">✕</button>' +
        '</div>';
    bar.querySelector('.announcement-bar__close')?.addEventListener('click', () => {
        bar.innerHTML = '';
        sessionStorage.setItem('gm_announcement_dismissed', 'true');
    });
}

// ═══════════════════════════════════════
// MODULE 12: renderFooter
// ═══════════════════════════════════════
function _renderFooter() {
    const footer = document.getElementById('site-footer');
    if (!footer) return;
    footer.innerHTML = '<div class="site-footer">' +
        '<div class="site-footer__grid">' +
        // Column 1: Explore
        '<div class="site-footer__column">' +
            '<div class="site-footer__heading">EXPLORE</div>' +
            '<a href="/search" class="site-footer__link">Search</a>' +
            '<a href="/browse" class="site-footer__link">Groups</a>' +
            '<a href="/articles" class="site-footer__link">Articles</a>' +
            '<a href="/stats" class="site-footer__link">Stats</a>' +
            '<a href="/scam-wall" class="site-footer__link">Scam Wall</a>' +
            '<a href="/tools" class="site-footer__link">Free Tools</a>' +
        '</div>' +
        // Column 2: Grow
        '<div class="site-footer__column">' +
            '<div class="site-footer__heading">GROW</div>' +
            '<a href="/promote" class="site-footer__link">Promote</a>' +
            '<a href="/advertise" class="site-footer__link">Advertise</a>' +
            '<a href="/store" class="site-footer__link">Store</a>' +
            '<a href="/marketplace" class="site-footer__link">Marketplace</a>' +
            '<a href="/jobs" class="site-footer__link">Jobs</a>' +
        '</div>' +
        // Column 3: Community
        '<div class="site-footer__column">' +
            '<div class="site-footer__heading">COMMUNITY</div>' +
            '<a href="/fuel" class="site-footer__link">Fuel the Community</a>' +
            '<a href="/leaderboard" class="site-footer__link">Leaderboard</a>' +
            '<a href="/submit" class="site-footer__link">Submit Group</a>' +
        '</div>' +
        // Column 4: Company
        '<div class="site-footer__column">' +
            '<div class="site-footer__heading">COMPANY</div>' +
            '<a href="/about" class="site-footer__link">About</a>' +
            '<a href="/contact" class="site-footer__link">Contact Us</a>' +
            '<a href="/faq" class="site-footer__link">FAQ</a>' +
            '<a href="/support" class="site-footer__link">Support Center</a>' +
            '<a href="/privacy" class="site-footer__link">Privacy</a>' +
            '<a href="/terms" class="site-footer__link">Terms</a>' +
        '</div>' +
        '</div>' +
        '<div class="site-footer__cta">' +
            '<a href="/fuel" class="site-footer__cta-link">' + ICONS.zap + ' Did GroupsMix help you? Help us keep going &amp; growing</a>' +
        '</div>' +
        '<div class="site-footer__bottom">&copy; ' + new Date().getFullYear() + ' GroupsMix.com. All rights reserved.</div>' +
        '</div>';
}

// ═══════════════════════════════════════
// MODULE 12.5: renderMobileNav
// ═══════════════════════════════════════
function _renderMobileNav() {
    const nav = document.createElement('nav');
    nav.className = 'mobile-nav';
    nav.id = 'mobile-nav';
    const path = window.location.pathname;

    nav.innerHTML = '<a href="/" class="mobile-nav__item' + (path === '/' ? ' active' : '') + '"><span class="mobile-nav__icon">' + ICONS.home + '</span><span class="mobile-nav__label">Home</span></a>' +
        '<a href="/browse" class="mobile-nav__item' + (path.startsWith('/browse') || path.startsWith('/search') || path.startsWith('/category') || path.startsWith('/country') || path.startsWith('/platform') ? ' active' : '') + '"><span class="mobile-nav__icon">' + ICONS.users + '</span><span class="mobile-nav__label">Groups</span></a>' +
        '<a href="/submit" class="mobile-nav__item mobile-nav__item--primary"><span class="mobile-nav__icon">' + ICONS.plus + '</span><span class="mobile-nav__label">Submit</span></a>' +
        '<a href="/tools" class="mobile-nav__item' + (path.startsWith('/tools') ? ' active' : '') + '"><span class="mobile-nav__icon">' + ICONS.tools + '</span><span class="mobile-nav__label">Tools</span></a>' +
        '<button class="mobile-nav__item" id="mobile-nav-ai"><span class="mobile-nav__icon"><svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect x="2" y="8" width="20" height="12" rx="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/><path d="M9 16s.9 1 3 1 3-1 3-1"/></svg></span><span class="mobile-nav__label">AI Chat</span></button>';
    document.body.appendChild(nav);
    // AI Chat button in bottom nav toggles chatbot
    document.getElementById('mobile-nav-ai')?.addEventListener('click', function() {
        if (typeof window.toggleChatbot === 'function') {
            window.toggleChatbot();
        }
    });
}

