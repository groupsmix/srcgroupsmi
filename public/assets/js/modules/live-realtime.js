// ─── Module: live-realtime ───
// Exports: LiveRealtime

// ═══════════════════════════════════════
// MODULE 14b: Realtime Live Stats
// ═══════════════════════════════════════
const LiveRealtime = {
    _channel: null,

    init() {
        if (!window.supabaseClient) return;
        try {
            // Subscribe to changes on the groups table for live stat updates
            this._channel = window.supabaseClient
                .channel('live-stats')
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'groups'
                }, (payload) => {
                    if (payload.new) LiveRealtime._handleGroupUpdate(payload.new);
                })
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'comments'
                }, (payload) => {
                    if (payload.new && payload.new.content_id) {
                        LiveRealtime._handleNewComment(payload.new.content_id);
                    }
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('LiveRealtime: connected');
                    }
                });
        } catch (err) {
            console.warn('LiveRealtime.init:', err.message);
        }
    },

    _handleGroupUpdate(group) {
        var bar = document.querySelector('.group-card__live-stats[data-group-id="' + group.id + '"]');
        if (!bar) return;

        // Update views count
        var viewsEl = bar.querySelector('[data-count="views"]');
        if (viewsEl && group.views != null) {
            viewsEl.textContent = UI.formatNumber(group.views);
        }

        // Update rating
        var ratingEl = bar.querySelector('[data-count="rating"]');
        if (ratingEl && group.avg_rating != null) {
            ratingEl.textContent = parseFloat(group.avg_rating).toFixed(1);
            var starIcon = bar.querySelector('.live-stat__star');
            if (starIcon && parseFloat(group.avg_rating) > 0) {
                starIcon.setAttribute('fill', 'currentColor');
            }
        }

        // Update trust score
        var trustEl = bar.querySelector('[data-count="trust"]');
        if (trustEl && typeof Algorithms !== 'undefined') {
            trustEl.textContent = Algorithms.calculateTrustScore(group);
        }
    },

    _handleNewComment(contentId) {
        var bar = document.querySelector('.group-card__live-stats[data-group-id="' + contentId + '"]');
        if (!bar) return;
        var countEl = bar.querySelector('[data-count="comments"]');
        if (countEl) {
            var current = parseInt(countEl.textContent.replace(/[^\d]/g, '')) || 0;
            countEl.textContent = UI.formatNumber(current + 1);
        }
    },

    destroy() {
        if (this._channel) {
            try { window.supabaseClient.removeChannel(this._channel); } catch (e) { /* ignore */ }
            this._channel = null;
        }
    }
};

