/**
 * Article Components Extension — article-components.js
 * Enhanced UI components for the Articles social platform
 *
 * MUST be loaded AFTER components.js (extends UI object)
 *
 * Dependencies: UI (components.js), Security (app.js), ICONS (app.js)
 */

/* global UI, Security, ICONS, Auth */

// ═══════════════════════════════════════
// Enhanced Article Card (with cover, tags, reading time, engagement)
// ═══════════════════════════════════════

/**
 * Render an enhanced article card for the social feed
 * @param {Object} article - Article data object
 * @returns {string} HTML string
 */
UI.articleCardEnhanced = function (article) {
    if (!article) return '';

    var safeTitle = Security.sanitize(article.title || 'Untitled');
    var safeExcerpt = Security.sanitize(article.excerpt || '');
    var safeAuthor = Security.sanitize(article.author_name || 'Anonymous');
    var safeCover = article.cover_image ? Security.sanitize(article.cover_image) : '';
    var slug = encodeURIComponent(article.slug || '');
    var category = article.category || 'general';
    var readingTime = article.reading_time || 0;
    var language = article.language || 'en';
    var isRTL = language === 'ar';

    // Category display
    var categoryLabels = {
        general: 'General', technology: 'Technology', crypto: 'Crypto & Web3',
        gaming: 'Gaming', marketing: 'Marketing', design: 'Design',
        business: 'Business', lifestyle: 'Lifestyle', education: 'Education',
        news: 'News', tutorial: 'Tutorial', opinion: 'Opinion'
    };
    var categoryLabel = categoryLabels[category] || category.charAt(0).toUpperCase() + category.slice(1);

    // Tags
    var tagsHTML = '';
    if (article.tags && article.tags.length > 0) {
        var displayTags = article.tags.slice(0, 3);
        tagsHTML = '<div class="article-card-enhanced__tags">';
        for (var i = 0; i < displayTags.length; i++) {
            tagsHTML += '<span class="article-card-enhanced__tag">#' + Security.sanitize(displayTags[i]) + '</span>';
        }
        if (article.tags.length > 3) {
            tagsHTML += '<span class="article-card-enhanced__tag article-card-enhanced__tag--more">+' + (article.tags.length - 3) + '</span>';
        }
        tagsHTML += '</div>';
    }

    // Author avatar
    var authorAvatar = article.author_avatar
        ? '<img class="article-card-enhanced__avatar-img" src="' + Security.sanitize(article.author_avatar) + '" alt="" loading="lazy">'
        : '<span class="article-card-enhanced__avatar-initial">' + safeAuthor.charAt(0).toUpperCase() + '</span>';

    // Engagement stats
    var likes = UI.formatNumber(article.like_count || 0);
    var comments = UI.formatNumber(article.comment_count || 0);
    var views = UI.formatNumber(article.views || 0);

    // Featured badge
    var featuredBadge = article.featured
        ? '<span class="article-card-enhanced__featured" title="Featured">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
          '</span>'
        : '';

    return '<article class="article-card-enhanced"' + (isRTL ? ' dir="rtl"' : '') + '>' +
        '<a href="/article?slug=' + slug + '" class="article-card-enhanced__link">' +
        // Cover image
        (safeCover
            ? '<div class="article-card-enhanced__cover">' +
              '<img src="' + safeCover + '" alt="' + safeTitle.replace(/"/g, '&quot;') + '" loading="lazy" class="article-card-enhanced__cover-img">' +
              '<span class="article-card-enhanced__category article-card-enhanced__category--' + category + '">' + categoryLabel + '</span>' +
              featuredBadge +
              (readingTime > 0 ? '<span class="article-card-enhanced__reading-time">' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ' +
                readingTime + ' min</span>' : '') +
              '</div>'
            : '<div class="article-card-enhanced__cover article-card-enhanced__cover--empty">' +
              '<span class="article-card-enhanced__category article-card-enhanced__category--' + category + '">' + categoryLabel + '</span>' +
              featuredBadge +
              '</div>'
        ) +
        // Body
        '<div class="article-card-enhanced__body">' +
        '<h3 class="article-card-enhanced__title">' + safeTitle + '</h3>' +
        (safeExcerpt ? '<p class="article-card-enhanced__excerpt">' + safeExcerpt + '</p>' : '') +
        tagsHTML +
        '</div>' +
        // Footer
        '<div class="article-card-enhanced__footer">' +
        '<div class="article-card-enhanced__author">' +
        '<div class="article-card-enhanced__avatar">' + authorAvatar + '</div>' +
        '<div class="article-card-enhanced__author-info">' +
        '<span class="article-card-enhanced__author-name">' + safeAuthor + '</span>' +
        '<span class="article-card-enhanced__date">' + UI.formatDate(article.published_at || article.created_at) + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="article-card-enhanced__stats">' +
        '<span title="Views">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ' +
        views + '</span>' +
        '<span title="Likes">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg> ' +
        likes + '</span>' +
        '<span title="Comments">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> ' +
        comments + '</span>' +
        '</div>' +
        '</div>' +
        '</a>' +
        // Interaction toolbar (existing component)
        UI.interactionToolbar(article.slug || article.id, 'article') +
        '</article>';
};

/**
 * Enhanced article card skeleton for loading state
 * @returns {string} HTML string
 */
UI.articleCardEnhancedSkeleton = function () {
    return '<div class="article-card-enhanced article-card-enhanced--skeleton">' +
        '<div class="article-card-enhanced__cover skeleton" style="height:200px"></div>' +
        '<div class="article-card-enhanced__body" style="padding:var(--space-4)">' +
        '<div class="skeleton skeleton-title" style="width:85%;height:20px;margin-bottom:8px"></div>' +
        '<div class="skeleton skeleton-text" style="width:100%;height:14px;margin-bottom:4px"></div>' +
        '<div class="skeleton skeleton-text" style="width:70%;height:14px"></div>' +
        '</div>' +
        '<div class="article-card-enhanced__footer" style="padding:var(--space-3) var(--space-4)">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<div class="skeleton" style="width:32px;height:32px;border-radius:50%"></div>' +
        '<div class="skeleton" style="width:100px;height:12px"></div>' +
        '</div>' +
        '</div>' +
        '</div>';
};

/**
 * Render a grid of enhanced article cards
 * @param {Array} articles - Array of article objects
 * @param {string} containerId - DOM element ID for the container
 * @param {boolean} append - If true, append instead of replace
 */
UI.articleGridEnhanced = function (articles, containerId, append) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!articles || articles.length === 0) {
        if (!append) {
            container.innerHTML = UI.emptyState('No articles found', 'Try adjusting your filters or check back later.');
        }
        return;
    }

    var html = '';
    for (var i = 0; i < articles.length; i++) {
        html += UI.articleCardEnhanced(articles[i]);
    }

    if (append) {
        container.insertAdjacentHTML('beforeend', html);
    } else {
        container.innerHTML = html;
    }

    // Initialize interaction toolbars on new cards
    UI.initInteractionToolbar(container);
};


// ═══════════════════════════════════════
// Author Box Component (for article detail page)
// ═══════════════════════════════════════

/**
 * Render author profile box
 * @param {Object} author - Author user data
 * @param {boolean} isFollowing - Whether current user follows this author
 * @param {boolean} isSelf - Whether this is the current user's own profile
 * @returns {string} HTML string
 */
UI.authorBox = function (author, isFollowing, isSelf) {
    if (!author) return '';

    var safeName = Security.sanitize(author.display_name || author.username || 'Anonymous');
    var safeUsername = Security.sanitize(author.username || '');
    var safeBio = Security.sanitize(author.bio || '');
    var avatar = author.photo_url
        ? '<img class="author-box__avatar-img" src="' + Security.sanitize(author.photo_url) + '" alt="' + safeName.replace(/"/g, '&quot;') + '">'
        : '<span class="author-box__avatar-initial">' + safeName.charAt(0).toUpperCase() + '</span>';

    var followBtn = '';
    if (!isSelf && Auth.isLoggedIn()) {
        followBtn = '<button class="btn ' + (isFollowing ? 'btn-outline' : 'btn-primary') + ' btn-sm author-box__follow-btn" data-author-id="' + (author.id || '') + '">' +
            (isFollowing ? 'Following' : 'Follow') +
            '</button>';
    }

    return '<div class="author-box">' +
        '<div class="author-box__avatar">' + avatar + '</div>' +
        '<div class="author-box__info">' +
        '<div class="author-box__name-row">' +
        '<span class="author-box__name">' + safeName + '</span>' +
        UI.roleBadge(author.role) +
        '</div>' +
        (safeUsername ? '<div class="author-box__username">@' + safeUsername + '</div>' : '') +
        (safeBio ? '<div class="author-box__bio">' + safeBio + '</div>' : '') +
        '</div>' +
        '<div class="author-box__actions">' +
        followBtn +
        '<a href="/author?id=' + (author.id || '') + '" class="btn btn-outline btn-sm">View Profile</a>' +
        '</div>' +
        '</div>';
};


// ═══════════════════════════════════════
// Author Card Component (for grids/lists)
// ═══════════════════════════════════════

/**
 * Render a compact author card
 * @param {Object} author - Author user data
 * @param {Object} stats - { articles_count, followers_count }
 * @returns {string} HTML string
 */
UI.authorCard = function (author, stats) {
    if (!author) return '';

    var safeName = Security.sanitize(author.display_name || author.username || 'Anonymous');
    var safeBio = Security.sanitize((author.bio || '').slice(0, 100));
    var avatar = author.photo_url
        ? '<img class="author-card__avatar-img" src="' + Security.sanitize(author.photo_url) + '" alt="" loading="lazy">'
        : '<span class="author-card__avatar-initial">' + safeName.charAt(0).toUpperCase() + '</span>';

    var articlesCount = (stats && stats.articles_count) ? stats.articles_count : 0;
    var followersCount = (stats && stats.followers_count) ? stats.followers_count : 0;

    return '<a href="/author?id=' + (author.id || '') + '" class="author-card">' +
        '<div class="author-card__avatar">' + avatar + '</div>' +
        '<div class="author-card__name">' + safeName + UI.roleBadge(author.role) + '</div>' +
        (safeBio ? '<div class="author-card__bio">' + safeBio + '</div>' : '') +
        '<div class="author-card__stats">' +
        '<span>' + UI.formatNumber(articlesCount) + ' articles</span>' +
        '<span>' + UI.formatNumber(followersCount) + ' followers</span>' +
        '</div>' +
        '</a>';
};


// ═══════════════════════════════════════
// Related Articles Grid
// ═══════════════════════════════════════

/**
 * Render related articles section
 * @param {Array} articles - Array of related article objects
 * @returns {string} HTML string
 */
UI.relatedArticlesGrid = function (articles) {
    if (!articles || articles.length === 0) return '';

    var html = '<div class="related-articles">' +
        '<h3 class="related-articles__title">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' +
        ' Related Articles</h3>' +
        '<div class="related-articles__grid">';

    for (var i = 0; i < articles.length; i++) {
        var a = articles[i];
        if (!a) continue;
        var safeTitle = Security.sanitize(a.title || 'Untitled');
        var safeCover = a.cover_image ? Security.sanitize(a.cover_image) : '';

        html += '<a href="/article?slug=' + encodeURIComponent(a.slug || '') + '" class="related-article-card">' +
            (safeCover
                ? '<img class="related-article-card__img" src="' + safeCover + '" alt="" loading="lazy">'
                : '<div class="related-article-card__img related-article-card__img--empty"></div>'
            ) +
            '<div class="related-article-card__body">' +
            '<div class="related-article-card__title">' + safeTitle + '</div>' +
            '<div class="related-article-card__meta">' +
            '<span>' + Security.sanitize(a.author_name || '') + '</span>' +
            (a.reading_time ? '<span>' + a.reading_time + ' min read</span>' : '') +
            '</div>' +
            '</div>' +
            '</a>';
    }

    html += '</div></div>';
    return html;
};


// ═══════════════════════════════════════
// Summary Section Component
// ═══════════════════════════════════════

/**
 * Render AI summary action buttons section
 * @param {string} articleId - Article ID
 * @returns {string} HTML string
 */
UI.summarySectionActions = function (articleId) {
    return '<div class="summary-actions" data-article-id="' + (articleId || '') + '">' +
        '<button class="btn btn-outline btn-sm summary-actions__btn" data-action="tldr">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>' +
        ' TL;DR Summary' +
        '</button>' +
        '<button class="btn btn-outline btn-sm summary-actions__btn" data-action="translate">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>' +
        ' Translate' +
        '</button>' +
        '<button class="btn btn-outline btn-sm summary-actions__btn" data-action="thread">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
        ' Convert to Thread' +
        '</button>' +
        '<div class="summary-actions__result" style="display:none"></div>' +
        '</div>';
};


// ═══════════════════════════════════════
// Badge Display Component
// ═══════════════════════════════════════

/**
 * Render writer badges
 * @param {Array} badges - Array of badge objects
 * @returns {string} HTML string
 */
UI.writerBadges = function (badges) {
    if (!badges || badges.length === 0) return '';

    var badgeIcons = {
        first_article: { icon: '📝', label: 'First Article' },
        prolific_writer: { icon: '✍️', label: 'Prolific Writer' },
        popular_writer: { icon: '🌟', label: 'Popular Writer' },
        viral_author: { icon: '🔥', label: 'Viral Author' },
        rising_star: { icon: '⭐', label: 'Rising Star' },
        trusted_author: { icon: '✅', label: 'Trusted Author' }
    };

    var html = '<div class="writer-badges">';
    for (var i = 0; i < badges.length; i++) {
        var b = badges[i];
        var info = badgeIcons[b.badge_type] || { icon: '🏅', label: b.badge_type };
        html += '<span class="writer-badge" title="' + Security.sanitize(info.label) + ' — earned ' + UI.formatDate(b.awarded_at) + '">' +
            '<span class="writer-badge__icon">' + info.icon + '</span>' +
            '<span class="writer-badge__label">' + Security.sanitize(info.label) + '</span>' +
            '</span>';
    }
    html += '</div>';
    return html;
};


// ═══════════════════════════════════════
// Notification Bell (injected into header)
// ═══════════════════════════════════════

/**
 * Create notification bell element
 * @param {number} unreadCount - Number of unread notifications
 * @returns {string} HTML string
 */
UI.notificationBell = function (unreadCount) {
    var count = unreadCount || 0;
    var badge = count > 0
        ? '<span class="notification-bell__badge">' + (count > 99 ? '99+' : count) + '</span>'
        : '';

    return '<button class="notification-bell" id="notificationBell" aria-label="Notifications" title="Notifications">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
        '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>' +
        '</svg>' +
        badge +
        '</button>';
};


// ═══════════════════════════════════════
// Article Status Badge
// ═══════════════════════════════════════

/**
 * Render article status badge
 * @param {string} status - Article status (draft, published, pending)
 * @param {string} moderationStatus - Moderation status (pending, approved, rejected)
 * @returns {string} HTML string
 */
UI.articleStatusBadge = function (status, moderationStatus) {
    var label = '';
    var className = '';

    if (status === 'draft') {
        label = 'Draft';
        className = 'article-status--draft';
    } else if (status === 'published' && moderationStatus === 'approved') {
        label = 'Published';
        className = 'article-status--published';
    } else if (status === 'published' && moderationStatus === 'pending') {
        label = 'Pending Review';
        className = 'article-status--pending';
    } else if (moderationStatus === 'rejected') {
        label = 'Rejected';
        className = 'article-status--rejected';
    } else {
        label = status || 'Unknown';
        className = 'article-status--default';
    }

    return '<span class="article-status ' + className + '">' + label + '</span>';
};


// ═══════════════════════════════════════
// Reading Time Calculator
// ═══════════════════════════════════════

/**
 * Calculate reading time from text content
 * @param {string} text - Plain text or HTML content
 * @returns {number} Reading time in minutes
 */
UI.calculateReadingTime = function (text) {
    if (!text) return 0;
    // Strip HTML tags
    var plain = text.replace(/<[^>]*>/g, '').trim();
    var words = plain.split(/\s+/).length;
    // Average reading speed: 200 words/min for mixed Arabic/English
    return Math.max(1, Math.ceil(words / 200));
};
