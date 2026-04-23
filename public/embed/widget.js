/**
 * GroupsMix Embeddable Widget
 * Drop this script on any website to show a "Join on GroupsMix" badge.
 *
 * Usage:
 *   <div class="groupsmix-widget" data-group-id="GROUP_ID" data-theme="dark" data-size="medium"></div>
 *   <script src="https://groupsmix.com/embed/widget.js" async></script>
 */
(function() {
    'use strict';

    var BASE = 'https://groupsmix.com';
    var API  = BASE + '/embed/data';
    var CACHE_KEY = 'gmx_widget_';
    var CACHE_TTL = 300000; // 5 min

    // Platform display info
    var PLATFORMS = {
        whatsapp:          { name: 'WhatsApp',  color: '#25D366', icon: 'W' },
        whatsapp_channel:  { name: 'WhatsApp',  color: '#25D366', icon: 'W' },
        telegram:          { name: 'Telegram',  color: '#0088cc', icon: 'T' },
        telegram_channel:  { name: 'Telegram',  color: '#0088cc', icon: 'T' },
        discord:           { name: 'Discord',   color: '#5865F2', icon: 'D' },
        facebook:          { name: 'Facebook',  color: '#1877F2', icon: 'F' }
    };

    // Inject styles once
    function injectStyles() {
        if (document.getElementById('gmx-widget-styles')) return;
        var style = document.createElement('style');
        style.id = 'gmx-widget-styles';
        style.textContent = [
            '.gmx-widget{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:inline-block;max-width:360px;width:100%;border-radius:12px;overflow:hidden;text-decoration:none;transition:transform .2s,box-shadow .2s}',
            '.gmx-widget:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.15)}',
            '.gmx-widget--dark{background:#181824;border:1px solid #2a2a3d;color:#e4e4ed}',
            '.gmx-widget--light{background:#fff;border:1px solid #e2e8f0;color:#0f172a}',
            '.gmx-widget__inner{display:flex;align-items:center;gap:12px;padding:14px 16px;text-decoration:none;color:inherit}',
            '.gmx-widget__icon{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;flex-shrink:0}',
            '.gmx-widget__info{flex:1;min-width:0}',
            '.gmx-widget__name{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}',
            '.gmx-widget__meta{font-size:11px;opacity:.7;display:flex;align-items:center;gap:6px}',
            '.gmx-widget__trust{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,.12);color:#10b981}',
            '.gmx-widget__join{display:flex;align-items:center;justify-content:center;padding:10px;font-size:13px;font-weight:600;text-decoration:none;color:#fff;gap:6px;transition:opacity .2s}',
            '.gmx-widget__join:hover{opacity:.9}',
            '.gmx-widget__powered{display:flex;align-items:center;justify-content:center;gap:4px;padding:6px;font-size:10px;opacity:.5;text-decoration:none;color:inherit;border-top:1px solid rgba(128,128,128,.15)}',
            '.gmx-widget__powered:hover{opacity:.8}',
            '.gmx-widget--small .gmx-widget__inner{padding:10px 12px;gap:8px}',
            '.gmx-widget--small .gmx-widget__icon{width:32px;height:32px;font-size:15px;border-radius:8px}',
            '.gmx-widget--small .gmx-widget__name{font-size:13px}',
            '.gmx-widget--small .gmx-widget__join{padding:8px;font-size:12px}',
            '.gmx-widget--large .gmx-widget__inner{padding:18px 20px;gap:14px}',
            '.gmx-widget--large .gmx-widget__icon{width:52px;height:52px;font-size:22px}',
            '.gmx-widget--large .gmx-widget__name{font-size:16px}',
            '.gmx-widget--large .gmx-widget__join{padding:12px;font-size:14px}'
        ].join('\n');
        document.head.appendChild(style);
    }

    // Fetch group data (with caching)
    function fetchGroup(groupId, callback) {
        var cacheKey = CACHE_KEY + groupId;
        try {
            var cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                var parsed = JSON.parse(cached);
                if (Date.now() - parsed.ts < CACHE_TTL) {
                    callback(null, parsed.data);
                    return;
                }
            }
        } catch(_e) {}

        var xhr = new XMLHttpRequest();
        xhr.open('GET', API + '?id=' + encodeURIComponent(groupId));
        xhr.onload = function() {
            if (xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    if (data.ok && data.group) {
                        try {
                            sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: data.group }));
                        } catch(_e) {}
                        callback(null, data.group);
                    } else {
                        callback('Group not found');
                    }
                } catch(_e) {
                    callback('Parse error');
                }
            } else {
                callback('Fetch error');
            }
        };
        xhr.onerror = function() { callback('Network error'); };
        xhr.send();
    }

    // Sanitize text
    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Render a widget
    function renderWidget(el) {
        var groupId = el.getAttribute('data-group-id');
        if (!groupId) return;

        var theme = el.getAttribute('data-theme') || 'dark';
        var size  = el.getAttribute('data-size')  || 'medium';

        el.innerHTML = '<div class="gmx-widget gmx-widget--' + theme + ' gmx-widget--' + size + '" style="opacity:.5"><div class="gmx-widget__inner"><div style="width:44px;height:44px;border-radius:10px;background:rgba(128,128,128,.2)"></div><div style="flex:1"><div style="width:60%;height:14px;border-radius:4px;background:rgba(128,128,128,.2);margin-bottom:6px"></div><div style="width:40%;height:10px;border-radius:4px;background:rgba(128,128,128,.15)"></div></div></div></div>';

        fetchGroup(groupId, function(err, group) {
            if (err || !group) {
                el.innerHTML = '';
                return;
            }

            var p = PLATFORMS[group.platform] || { name: group.platform || 'Group', color: '#6366f1', icon: 'G' };
            var trustScore = group.trust_score || 0;
            var profileUrl = BASE + '/group?id=' + encodeURIComponent(group.id);
            var joinUrl = BASE + '/go?ref=' + encodeURIComponent(group.link || '');

            var html = '<div class="gmx-widget gmx-widget--' + esc(theme) + ' gmx-widget--' + esc(size) + '">';
            html += '<a href="' + esc(profileUrl) + '" target="_blank" rel="noopener" class="gmx-widget__inner">';
            html += '<div class="gmx-widget__icon" style="background:' + p.color + '">' + p.icon + '</div>';
            html += '<div class="gmx-widget__info">';
            html += '<div class="gmx-widget__name">' + esc(group.name) + '</div>';
            html += '<div class="gmx-widget__meta">';
            html += '<span>' + esc(p.name) + '</span>';
            if (trustScore > 0) {
                html += '<span class="gmx-widget__trust">';
                html += '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
                html += trustScore + '</span>';
            }
            html += '</div></div></a>';
            html += '<a href="' + esc(joinUrl) + '" target="_blank" rel="noopener" class="gmx-widget__join" style="background:' + p.color + '">Join on GroupsMix &rarr;</a>';
            html += '<a href="' + esc(BASE) + '?ref=widget" target="_blank" rel="noopener" class="gmx-widget__powered">';
            html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
            html += 'Powered by GroupsMix</a>';
            html += '</div>';

            el.innerHTML = html;

            // Track embed impression
            try {
                var img = new Image();
                img.src = BASE + '/api/analytics-event?t=widget_impression&gid=' + encodeURIComponent(groupId) + '&r=' + encodeURIComponent(window.location.hostname);
            } catch(_e) {}
        });
    }

    // Initialize all widgets on page
    function init() {
        injectStyles();
        var widgets = document.querySelectorAll('.groupsmix-widget');
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
    window.GroupsMixWidget = { render: renderWidget, init: init };
})();
