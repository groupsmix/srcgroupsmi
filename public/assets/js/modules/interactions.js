// ─── Module: interactions ───
// Exports: Interactions
// Split from app.js for maintainability

// ═══════════════════════════════════════
// MODULE 5b: DB.interactions (Universal Interaction System)
// ═══════════════════════════════════════
const Interactions = {
    // In-memory cache of user interactions for current session
    _cache: {},
    _cacheKey(contentId, contentType) { return contentType + ':' + contentId; },

    async toggle(contentId, contentType, actionType) {
        try {
            if (!contentId || !contentType || !actionType) return null;
            if (!Auth.requireAuth()) return null;
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            const userId = Auth.getUserId();
            if (!userId) { UI.authModal(); return null; }
            const { data, error } = await window.supabaseClient.rpc('handle_user_interaction', {
                p_user_id: userId,
                p_content_id: String(contentId),
                p_content_type: contentType,
                p_action: actionType
            });
            if (error) { UI.toast('Error updating interaction', 'error'); console.error('Interactions.toggle:', error.message); return null; }
            // Update local cache
            const key = this._cacheKey(contentId, contentType);
            if (!this._cache[key]) this._cache[key] = [];
            if (data && data.action === 'added') {
                if (!this._cache[key].includes(actionType)) this._cache[key].push(actionType);
                // If like added, remove dislike from cache and vice versa
                if (actionType === 'like') this._cache[key] = this._cache[key].filter(a => a !== 'dislike');
                if (actionType === 'dislike') this._cache[key] = this._cache[key].filter(a => a !== 'like');
            } else if (data && data.action === 'removed') {
                this._cache[key] = this._cache[key].filter(a => a !== actionType);
            }
            return data;
        } catch (err) { console.error('Interactions.toggle:', err.message); UI.toast('Something went wrong', 'error'); return null; }
    },

    async getUserInteractions(contentIds, contentType) {
        try {
            if (!contentIds || !contentIds.length || !contentType) return {};
            const userId = Auth.getUserId();
            if (!userId) return {};
            const { data, error } = await window.supabaseClient.rpc('get_user_interactions', {
                p_user_id: userId,
                p_content_ids: contentIds.map(String),
                p_content_type: contentType
            });
            if (error) { console.error('Interactions.getUserInteractions:', error.message); return {}; }
            // Populate cache
            if (data) {
                for (const [cid, actions] of Object.entries(data)) {
                    this._cache[this._cacheKey(cid, contentType)] = Array.isArray(actions) ? actions : [];
                }
            }
            return data || {};
        } catch (err) { console.error('Interactions.getUserInteractions:', err.message); return {}; }
    },

    async getCounts(contentId, contentType) {
        try {
            if (!contentId || !contentType) return { likes: 0, dislikes: 0, saves: 0 };
            const { data, error } = await window.supabaseClient.rpc('get_interaction_counts', {
                p_content_id: String(contentId),
                p_content_type: contentType
            });
            if (error) { console.error('Interactions.getCounts:', error.message); return { likes: 0, dislikes: 0, saves: 0 }; }
            return data || { likes: 0, dislikes: 0, saves: 0 };
        } catch (err) { console.error('Interactions.getCounts:', err.message); return { likes: 0, dislikes: 0, saves: 0 }; }
    },

    async getSavedItems(contentType) {
        try {
            const userId = Auth.getUserId();
            if (!userId) return [];
            const { data, error } = await window.supabaseClient.rpc('get_user_saved_items', {
                p_user_id: userId,
                p_content_type: contentType || null
            });
            if (error) { console.error('Interactions.getSavedItems:', error.message); return []; }
            return data || [];
        } catch (err) { console.error('Interactions.getSavedItems:', err.message); return []; }
    },

    isActive(contentId, contentType, actionType) {
        const key = this._cacheKey(contentId, contentType);
        return this._cache[key] ? this._cache[key].includes(actionType) : false;
    }
};
