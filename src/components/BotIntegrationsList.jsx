import { useState, useEffect } from 'preact/hooks';

export default function BotIntegrationsList() {
    const [loading, setLoading] = useState(true);
    const [integrations, setIntegrations] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isMounted = true;
        const loadIntegrations = async () => {
            try {
                if (typeof window !== 'undefined' && window.Auth && window.Auth.isLoggedIn()) {
                    const uid = window.Auth.getUserId();
                    if (!uid) return;
                    
                    const { data, error: dbError } = await window.supabaseClient
                        .from('bot_integrations')
                        .select('*')
                        .eq('owner_uid', uid)
                        .order('created_at', { ascending: false });
                        
                    if (dbError) throw dbError;
                    
                    if (isMounted) {
                        setIntegrations(data || []);
                    }
                }
            } catch (err) {
                console.error('Failed to load bot integrations:', err);
                if (isMounted) {
                    setError('Failed to load your integrations.');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        if (typeof window !== 'undefined' && window.Auth) {
            window.Auth.waitForAuth().then(loadIntegrations);
        } else {
            setLoading(false);
        }

        return () => { isMounted = false; };
    }, []);

    if (loading) {
        return <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading integrations...</div>;
    }

    if (error) {
        return <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--error)' }}>{error}</div>;
    }

    if (integrations.length === 0) {
        return null; // Don't show the section if they have none
    }

    return (
        <div class="bot-my-integrations" id="my-integrations-section">
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>Your Integrations</h2>
            <div id="my-integrations-list">
                {integrations.map(bot => {
                    const isTelegram = bot.platform === 'telegram';
                    const isActive = bot.status === 'active';
                    
                    return (
                        <div class="integration-item" key={bot.id}>
                            <span class="integration-item__platform" dangerouslySetInnerHTML={{ __html: isTelegram ? '&#128172;' : '&#128242;' }}></span>
                            <div class="integration-item__info">
                                <div class="integration-item__name" style={{ textTransform: 'capitalize' }}>
                                    {bot.platform} Integration
                                </div>
                                <div class="integration-item__meta">
                                    Members: {typeof window !== 'undefined' && window.UI ? window.UI.formatNumber(bot.member_count || 0) : (bot.member_count || 0)} 
                                    {' '}&middot;{' '} 
                                    Last sync: {bot.last_sync_at && typeof window !== 'undefined' && window.UI ? window.UI.formatDate(bot.last_sync_at) : (bot.last_sync_at ? new Date(bot.last_sync_at).toLocaleDateString() : 'Never')}
                                </div>
                            </div>
                            <span 
                                class="integration-item__status" 
                                style={{ 
                                    background: isActive ? 'var(--success)' : 'var(--warning)', 
                                    color: isActive ? '#fff' : '#000',
                                    textTransform: 'capitalize'
                                }}
                            >
                                {bot.status}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}