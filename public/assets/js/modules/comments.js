// ─── Module: comments ───
// Exports: Comments

// ═══════════════════════════════════════
// MODULE 5c: Comments (On-Demand Comments System)
// ═══════════════════════════════════════
const _Comments = {
    // Blacklist of banned words (basic list, extend as needed)
    _blacklist: ['spam', 'scam', 'hack', 'nigger', 'faggot', 'porn', 'xxx', 'viagra', 'casino'],

    _containsUrl(text) {
        return /https?:\/\/|www\.|\.com\/|\.net\/|\.org\/|\.io\/|bit\.ly|t\.co|goo\.gl/i.test(text);
    },

    // Audit fix #15: use word boundary regex to prevent false positives (e.g. "hackathon", "anti-scam")
    _containsBlacklisted(text) {
        const lower = text.toLowerCase();
        return _Comments._blacklist.some(word => new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(lower));
    },

    _validate(body) {
        if (!body || body.trim().length < 1) return 'Comment cannot be empty.';
        if (body.length > 1000) return 'Comment must be under 1000 characters.';
        if (_Comments._containsUrl(body)) return 'Links are not allowed in comments.';
        if (_Comments._containsBlacklisted(body)) return 'Your comment contains inappropriate content.';
        return null;
    },

    async submit(contentId, contentType, body) {
        try {
            if (!Auth.requireAuth()) return null;
            const userId = Auth.getUserId();
            if (!userId) { UI.authModal(); return null; }
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            if (!Security.checkRateLimit('comment')) { UI.toast('Too many comments. Please wait.', 'error'); return null; }
            const err = _Comments._validate(body);
            if (err) { UI.toast(err, 'warning'); return null; }
            const user = Auth.getUser();
            const displayName = user?.display_name || user?.email?.split('@')[0] || 'User';
            const photoUrl = user?.photo_url || null;
            const { data, error } = await window.supabaseClient.from('comments').insert({
                user_id: userId,
                content_id: String(contentId),
                content_type: contentType,
                display_name: Security.sanitize(displayName),
                photo_url: photoUrl,
                body: Security.sanitize(body.trim())
            }).select().single();
            if (error) { UI.toast('Failed to post comment.', 'error'); console.error('Comments.submit:', error.message); return null; }
            return data;
        } catch (err) { console.error('Comments.submit:', err.message); UI.toast('Something went wrong.', 'error'); return null; }
    },

    async getByContent(contentId, contentType, limit, offset) {
        try {
            const l = limit || 20;
            const o = offset || 0;
            const { data, error, count } = await window.supabaseClient.from('comments')
                .select('*', { count: 'exact' })
                .eq('content_id', String(contentId))
                .eq('content_type', contentType)
                .eq('reported', false)
                .order('created_at', { ascending: false })
                .range(o, o + l - 1);
            if (error) { console.error('Comments.getByContent:', error.message); return { data: [], count: 0 }; }
            return { data: data || [], count: count || 0 };
        } catch (err) { console.error('Comments.getByContent:', err.message); return { data: [], count: 0 }; }
    },

    async getCount(contentId, contentType) {
        try {
            const { data, error } = await window.supabaseClient.rpc('get_comment_count', {
                p_content_id: String(contentId),
                p_content_type: contentType
            });
            if (error) { console.error('Comments.getCount:', error.message); return 0; }
            return data || 0;
        } catch (err) { console.error('Comments.getCount:', err.message); return 0; }
    },

    async report(commentId) {
        try {
            if (!commentId) return;
            const { error } = await window.supabaseClient.rpc('report_comment', { p_comment_id: commentId });
            if (error) { UI.toast('Failed to report.', 'error'); return; }
            UI.toast('Comment reported. Thank you.', 'success');
        } catch (err) { console.error('Comments.report:', err.message); }
    }
};

