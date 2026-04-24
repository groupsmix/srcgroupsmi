/**
 * GroupsMix Embeddable Review Widget
 * Drop this script on any website to show reviews for a group.
 *
 * Usage:
 *   <div class="groupsmix-reviews" data-group-id="GROUP_ID" data-theme="dark" data-max="5"></div>
 *   <script src="https://groupsmix.com/embed/review-widget.js" async></script>
 */
(function() {
    'use strict';

    var BASE = 'https://groupsmix.com';
    var API_GROUP = BASE + '/embed/data';
    var CACHE_KEY = 'gmx_reviews_';
    var CACHE_TTL = 300000; // 5 min

    // Inject styles once
    function injectStyles() {
        if (document.getElementById('gmx-review-widget-styles')) return;
        var style = document.createElement('style');
        style.id = 'gmx-review-widget-styles';
        style.textContent = [
            '.gmx-reviews{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:480px;width:100%;border-radius:14px;overflow:hidden;transition:box-shadow .2s}',
            '.gmx-reviews--dark{background:#181824;border:1px solid #2a2a3d;color:#e4e4ed}',
            '.gmx-reviews--light{background:#fff;border:1px solid #e2e8f0;color:#0f172a}',
            '.gmx-reviews__header{padding:16px 18px 12px;display:flex;align-items:center;justify-content:space-between}',
            '.gmx-reviews__title{font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px}',
            '.gmx-reviews__summary{display:flex;align-items:center;gap:6px;font-size:13px}',
            '.gmx-reviews__avg{font-weight:700;font-size:18px}',
            '.gmx-reviews__stars{color:#f59e0b;font-size:14px;letter-spacing:1px}',
            '.gmx-reviews__count{font-size:12px;opacity:.6}',
            '.gmx-reviews__list{padding:0 18px 8px}',
            '.gmx-reviews__item{padding:12px 0;border-top:1px solid rgba(128,128,128,.15)}',
            '.gmx-reviews__item:first-child{border-top:none}',
            '.gmx-reviews__item-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}',
            '.gmx-reviews__author{display:flex;align-items:center;gap:8px}',
            '.gmx-reviews__avatar{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0}',
            '.gmx-reviews__name{font-size:13px;font-weight:600}',
            '.gmx-reviews__date{font-size:11px;opacity:.5}',
            '.gmx-reviews__item-stars{color:#f59e0b;font-size:12px;letter-spacing:1px}',
            '.gmx-reviews__text{font-size:13px;line-height:1.5;opacity:.85}',
            '.gmx-reviews__footer{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;border-top:1px solid rgba(128,128,128,.15)}',
            '.gmx-reviews__write{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;color:#fff;transition:opacity .2s}',
            '.gmx-reviews__write:hover{opacity:.85}',
            '.gmx-reviews__powered{display:flex;align-items:center;gap:4px;font-size:10px;opacity:.4;text-decoration:none;color:inherit}',
            '.gmx-reviews__powered:hover{opacity:.7}',
            '.gmx-reviews__empty{padding:24px 18px;text-align:center;font-size:13px;opacity:.5}',
            '.gmx-reviews__loading{padding:24px;text-align:center;opacity:.4;font-size:13px}'
        ].join('\n');
        document.head.appendChild(style);
    }

    // Sanitize text
    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Generate star HTML
    function starsHtml(rating) {
        var html = '';
        for (var i = 1; i <= 5; i++) {
            html += '<span style="color:' + (i <= Math.round(rating) ? '#f59e0b' : 'rgba(128,128,128,.3)') + '">&#9733;</span>';
        }
        return html;
    }

    // Format date
    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            var d = new Date(dateStr);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (_e) { return ''; }
    }

    // Avatar color based on name
    function avatarColor(name) {
        var colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'];
        var hash = 0;
        var str = name || 'A';
        for (var i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    }

    // Fetch group data
    function fetchGroupData(groupId, callback) {
        var cacheKey = CACHE_KEY + 'group_' + groupId;
        try {
            var cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                var parsed = JSON.parse(cached);
                if (Date.now() - parsed.ts < CACHE_TTL) { callback(null, parsed.data); return; }
            }
        } catch (_e) {}

        var xhr = new XMLHttpRequest();
        xhr.open('GET', API_GROUP + '?id=' + encodeURIComponent(groupId));
        xhr.onload = function() {
            if (xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    if (data.ok && data.group) {
                        try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: data.group })); } catch (_e) {}
                        callback(null, data.group);
                    } else { callback('Group not found'); }
                } catch (_e) { callback('Parse error'); }
            } else { callback('Fetch error'); }
        };
        xhr.onerror = function() { callback('Network error'); };
        xhr.send();
    }

    // Fetch reviews for a group
    function fetchReviews(groupId, limit, callback) {
        var cacheKey = CACHE_KEY + 'reviews_' + groupId;
        try {
            var cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                var parsed = JSON.parse(cached);
                if (Date.now() - parsed.ts < CACHE_TTL) { callback(null, parsed.data); return; }
            }
        } catch (_e) {}

        var xhr = new XMLHttpRequest();
        xhr.open('GET', BASE + '/embed/reviews-data?id=' + encodeURIComponent(groupId) + '&limit=' + (limit || 5));
        xhr.onload = function() {
            if (xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    if (data.ok) {
                        try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: data })); } catch (_e) {}
                        callback(null, data);
                    } else { callback('No reviews'); }
                } catch (_e) { callback('Parse error'); }
            } else { callback('Fetch error'); }
        };
        xhr.onerror = function() { callback('Network error'); };
        xhr.send();
    }

    // Render widget
    function renderWidget(el) {
        var groupId = el.getAttribute('data-group-id');
        if (!groupId) return;

        var theme = el.getAttribute('data-theme') || 'dark';
        var maxReviews = parseInt(el.getAttribute('data-max'), 10) || 5;

        // Show loading state
        el.innerHTML = '<div class="gmx-reviews gmx-reviews--' + esc(theme) + '"><div class="gmx-reviews__loading">Loading reviews...</div></div>';

        // Fetch group + reviews in parallel
        var groupData = null;
        var reviewsData = null;
        var completed = 0;

        function checkDone() {
            completed++;
            if (completed < 2) return;
            renderFull(el, theme, maxReviews, groupData, reviewsData);
        }

        fetchGroupData(groupId, function(err, data) {
            if (!err && data) groupData = data;
            checkDone();
        });

        fetchReviews(groupId, maxReviews, function(err, data) {
            if (!err && data) reviewsData = data;
            checkDone();
        });
    }

    function renderFull(el, theme, maxReviews, group, reviewsResult) {
        if (!group) { el.innerHTML = ''; return; }

        var reviews = (reviewsResult && reviewsResult.reviews) ? reviewsResult.reviews : [];
        var avgRating = parseFloat(group.avg_rating) || 0;
        var reviewCount = group.review_count || reviews.length || 0;
        var groupUrl = BASE + '/group?id=' + encodeURIComponent(group.id);
        var reviewUrl = BASE + '/group-reviews?group=' + encodeURIComponent(group.id);
        var _isDark = theme === 'dark';
        var accent = '#6366f1';

        var html = '<div class="gmx-reviews gmx-reviews--' + esc(theme) + '">';

        // Header
        html += '<div class="gmx-reviews__header">';
        html += '<div class="gmx-reviews__title">';
        html += '<a href="' + esc(groupUrl) + '" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">' + esc(group.name) + '</a>';
        html += '</div>';
        html += '<div class="gmx-reviews__summary">';
        html += '<span class="gmx-reviews__avg">' + avgRating.toFixed(1) + '</span>';
        html += '<span class="gmx-reviews__stars">' + starsHtml(avgRating) + '</span>';
        html += '<span class="gmx-reviews__count">(' + reviewCount + ')</span>';
        html += '</div>';
        html += '</div>';

        // Reviews list
        if (reviews.length > 0) {
            html += '<div class="gmx-reviews__list">';
            var displayCount = Math.min(reviews.length, maxReviews);
            for (var i = 0; i < displayCount; i++) {
                var r = reviews[i];
                var authorName = (r.profiles && r.profiles.display_name) ? r.profiles.display_name : (r.display_name || 'Anonymous');
                var initial = authorName.charAt(0).toUpperCase();
                var color = avatarColor(authorName);
                var date = formatDate(r.created_at);
                var rating = r.rating || 0;
                var body = r.body || r.text || '';

                html += '<div class="gmx-reviews__item">';
                html += '<div class="gmx-reviews__item-header">';
                html += '<div class="gmx-reviews__author">';
                html += '<div class="gmx-reviews__avatar" style="background:' + color + '">' + esc(initial) + '</div>';
                html += '<div><div class="gmx-reviews__name">' + esc(authorName) + '</div>';
                html += '<div class="gmx-reviews__date">' + esc(date) + '</div></div>';
                html += '</div>';
                html += '<div class="gmx-reviews__item-stars">' + starsHtml(rating) + '</div>';
                html += '</div>';
                if (body) {
                    html += '<div class="gmx-reviews__text">' + esc(body.length > 200 ? body.slice(0, 200) + '...' : body) + '</div>';
                }
                html += '</div>';
            }
            html += '</div>';
        } else {
            html += '<div class="gmx-reviews__empty">No reviews yet. Be the first to review!</div>';
        }

        // Footer
        html += '<div class="gmx-reviews__footer">';
        html += '<a href="' + esc(reviewUrl) + '" target="_blank" rel="noopener" class="gmx-reviews__write" style="background:' + accent + '">&#9997; Write a Review</a>';
        html += '<a href="' + esc(BASE) + '?ref=review-widget" target="_blank" rel="noopener" class="gmx-reviews__powered">';
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
        html += 'Powered by GroupsMix</a>';
        html += '</div>';

        html += '</div>';
        el.innerHTML = html;

        // Track impression
        try {
            var img = new Image();
            img.src = BASE + '/api/analytics-event?t=review_widget_impression&gid=' + encodeURIComponent(group.id) + '&r=' + encodeURIComponent(window.location.hostname);
        } catch (_e) {}
    }

    // Initialize all review widgets on page
    function init() {
        injectStyles();
        var widgets = document.querySelectorAll('.groupsmix-reviews');
        for (var i = 0; i < widgets.length; i++) {
            renderWidget(widgets[i]);
        }
    }

    // Run on DOMContentLoaded or immediately if already loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for dynamic usage
    window.GroupsMixReviewWidget = { render: renderWidget, init: init };
})();
