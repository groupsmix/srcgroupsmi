/**
 * GroupsMix Embeddable Widget
 * Renders a "Join on GroupsMix" badge/card/button on external websites.
 * Usage: <script src="https://groupsmix.com/assets/js/widget.js" data-group="GROUP_ID" data-style="badge|card|button" data-theme="light|dark|auto"></script>
 */
(function() {
    'use strict';
    var GROUPSMIX_URL = 'https://groupsmix.com';
    var API_URL = GROUPSMIX_URL + '/api/widget';

    var script = document.currentScript;
    if (!script) return;

    var groupId = script.getAttribute('data-group');
    var style = script.getAttribute('data-style') || 'badge';
    var theme = script.getAttribute('data-theme') || 'light';

    if (!groupId) return;

    // Detect theme
    if (theme === 'auto') {
        theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    var isDark = theme === 'dark';
    var colors = {
        bg: isDark ? '#1a1a2e' : '#ffffff',
        text: isDark ? '#e0e0e0' : '#1a1a2e',
        border: isDark ? '#333' : '#e0e0e0',
        muted: isDark ? '#888' : '#777',
        accent: '#6200ea'
    };

    // Fetch group data via API
    fetch(API_URL + '?group=' + encodeURIComponent(groupId))
    .then(function(res) { return res.json(); })
    .then(function(result) {
        if (!result || !result.ok || !result.group) return;
        renderWidget(result.group);
        trackEvent(groupId, 'impression');
    })
    .catch(function() { /* silent fail on external sites */ });

    function sanitize(str) {
        if (!str) return '';
        var el = document.createElement('div');
        el.textContent = str;
        return el.innerHTML;
    }

    function formatNumber(n) {
        if (!n) return '0';
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return String(n);
    }

    function renderWidget(g) {
        var container = document.createElement('div');
        container.className = 'gmx-widget';
        var groupUrl = GROUPSMIX_URL + '/group?id=' + g.id;
        var name = sanitize(g.name || 'Group');
        var platform = sanitize(g.platform || '');
        var desc = sanitize((g.description || '').slice(0, 100));
        var members = formatNumber(g.members_count || 0);
        var logoUrl = GROUPSMIX_URL + '/assets/img/favicon.svg';

        if (style === 'badge') {
            container.innerHTML = '<a href="' + groupUrl + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:20px;background:' + colors.bg + ';border:1px solid ' + colors.border + ';font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:' + colors.text + ';text-decoration:none;transition:box-shadow 0.2s">' +
                '<img src="' + logoUrl + '" alt="GroupsMix" style="width:20px;height:20px">' +
                '<span>Join <strong>' + name + '</strong> on GroupsMix</span>' +
                (platform ? '<span style="background:' + colors.accent + ';color:#fff;font-size:11px;padding:2px 8px;border-radius:12px">' + platform + '</span>' : '') +
                '</a>';
        } else if (style === 'card') {
            container.innerHTML = '<a href="' + groupUrl + '" target="_blank" rel="noopener" style="display:block;max-width:320px;border-radius:12px;overflow:hidden;background:' + colors.bg + ';border:1px solid ' + colors.border + ';font-family:system-ui,-apple-system,sans-serif;color:' + colors.text + ';text-decoration:none;transition:box-shadow 0.2s">' +
                '<div style="padding:16px">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
                '<img src="' + logoUrl + '" alt="GroupsMix" style="width:24px;height:24px">' +
                '<span style="font-weight:600;font-size:15px">' + name + '</span>' +
                '</div>' +
                (desc ? '<div style="font-size:13px;color:' + colors.muted + ';margin-bottom:12px">' + desc + '</div>' : '') +
                '<div style="display:flex;gap:12px;font-size:12px;color:' + colors.muted + ';margin-bottom:12px">' +
                '<span>' + members + ' members</span>' +
                (platform ? '<span>' + platform + '</span>' : '') +
                '</div>' +
                '<div style="display:flex;align-items:center;justify-content:space-between">' +
                '<span style="display:inline-block;padding:8px 20px;background:' + colors.accent + ';color:#fff;border-radius:8px;font-size:13px;font-weight:600">Join Group</span>' +
                '<span style="font-size:11px;color:' + colors.muted + '">Powered by GroupsMix</span>' +
                '</div>' +
                '</div></a>';
        } else {
            container.innerHTML = '<a href="' + groupUrl + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:10px 24px;border-radius:8px;background:' + colors.accent + ';color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:600;text-decoration:none;transition:opacity 0.2s">' +
                '<img src="' + logoUrl + '" alt="" style="width:18px;height:18px;filter:brightness(10)">' +
                'Join ' + name + ' on GroupsMix' +
                '</a>';
        }

        // Track clicks
        container.addEventListener('click', function() {
            trackEvent(groupId, 'click');
        });

        // Insert after the script tag
        if (script.parentNode) {
            script.parentNode.insertBefore(container, script.nextSibling);
        }
    }

    function trackEvent(gid, event) {
        try {
            fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group: gid, event: event })
            });
        } catch(_e) { /* silent */ }
    }
})();
