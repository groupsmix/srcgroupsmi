import { useState, useEffect } from 'preact/hooks';

export default function CommentsPanel({ contentId, contentType, isOpen, onClose }) {
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [commentText, setCommentText] = useState('');

    useEffect(() => {
        let isMounted = true;
        
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setLoading(true);
            
            // Load comments
            const loadComments = async () => {
                if (typeof window !== 'undefined' && window.Comments) {
                    try {
                        const { data } = await window.Comments.getByContent(contentId, contentType, 20, 0);
                        if (isMounted) {
                            setComments(data || []);
                            setLoading(false);
                        }
                    } catch (err) {
                        console.error('Failed to load comments:', err);
                        if (isMounted) setLoading(false);
                    }
                }
            };
            loadComments();
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            isMounted = false;
            document.body.style.overflow = '';
        };
    }, [isOpen, contentId, contentType]);

    // Handle escape key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleSubmit = async () => {
        const body = commentText.trim();
        if (!body) return;
        
        setSubmitting(true);
        if (typeof window !== 'undefined' && window.Comments) {
            try {
                const result = await window.Comments.submit(contentId, contentType, body);
                if (result) {
                    setCommentText('');
                    setComments(prev => [result, ...prev]);
                }
            } catch (err) {
                console.error('Failed to submit comment:', err);
            }
        }
        setSubmitting(false);
    };

    const handleReport = async (commentId) => {
        if (typeof window !== 'undefined' && window.UI && window.Comments) {
            window.UI.confirmModal('Report Comment', 'Are you sure you want to report this comment?', async () => {
                await window.Comments.report(commentId);
                // Optimistically dim the reported comment
                setComments(prev => prev.map(c => 
                    c.id === commentId ? { ...c, reported: true } : c
                ));
            });
        }
    };

    if (!isOpen) return null;

    const isMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : false;
    const panelClass = isMobile ? 'comments-panel comments-panel--bottom-sheet' : 'comments-panel comments-panel--sidebar';

    return (
        <div class="comments-panel-overlay" onClick={(e) => { if (e.target.classList.contains('comments-panel-overlay')) onClose(); }}>
            <div class={panelClass}>
                <div class="comments-panel__header">
                    <h3 class="comments-panel__title">Comments</h3>
                    <button class="comments-panel__close" aria-label="Close comments" onClick={onClose}>&#10005;</button>
                </div>
                
                <div class="comments-panel__list">
                    {loading ? (
                        <div class="comments-panel__loading"><span class="btn-spinner"></span> Loading comments...</div>
                    ) : comments.length === 0 ? (
                        <div class="comments-panel__empty">No comments yet. Be the first!</div>
                    ) : (
                        comments.map(c => {
                            const initial = (c.display_name || 'U').charAt(0).toUpperCase();
                            const isReported = c.reported;
                            
                            return (
                                <div class="comment-item" key={c.id} style={isReported ? { opacity: 0.5, pointerEvents: 'none' } : {}}>
                                    <div class="comment-item__avatar">{initial}</div>
                                    <div class="comment-item__body">
                                        <div class="comment-item__header">
                                            <span class="comment-item__name">
                                                {typeof window !== 'undefined' && window.Security ? window.Security.sanitize(c.display_name || 'User') : (c.display_name || 'User')}
                                            </span>
                                            <span class="comment-item__date">
                                                {typeof window !== 'undefined' && window.UI ? window.UI.formatDate(c.created_at) : new Date(c.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <div class="comment-item__text">
                                            {typeof window !== 'undefined' && window.Security ? window.Security.sanitize(c.body || '') : (c.body || '')}
                                        </div>
                                    </div>
                                    <button 
                                        class="comment-item__report" 
                                        aria-label="Report comment" 
                                        title="Report"
                                        onClick={() => handleReport(c.id)}
                                    >
                                        &#128681;
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
                
                <div class="comments-panel__input">
                    <div class="comments-panel__input-row">
                        <textarea 
                            class="form-input comments-panel__textarea" 
                            placeholder="Write a comment..." 
                            maxlength="1000" 
                            rows="2"
                            value={commentText}
                            onInput={(e) => setCommentText(e.target.value)}
                        ></textarea>
                        <button 
                            class="btn btn-primary btn-sm comments-panel__submit" 
                            disabled={submitting || !commentText.trim()}
                            onClick={handleSubmit}
                        >
                            {submitting ? <span class="btn-spinner"></span> : 'Post'}
                        </button>
                    </div>
                    <div class="comments-panel__char-count">
                        <span>{commentText.length}</span>/1000
                    </div>
                </div>
            </div>
        </div>
    );
}