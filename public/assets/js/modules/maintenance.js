// ─── Module: maintenance ───
// Exports: MaintenanceMode

// ═══════════════════════════════════════
// MODULE 14b: Maintenance Mode Middleware
// ═══════════════════════════════════════
const _MaintenanceMode = {
    /**
     * Check site_settings in Supabase and enforce maintenance/store locks.
     * Admins bypass all restrictions.
     */
    async check() {
        try {
            // Skip check on maintenance page itself and admin panel
            var path = window.location.pathname;
            if (path === '/maintenance' || path === '/maintenance.html') return;
            if (path.indexOf('/admin') === 0 || path.indexOf('/pages/admin') === 0) return;

            var { data, error } = await window.supabaseClient
                .from('site_settings')
                .select('maintenance_mode, store_locked, maintenance_message')
                .eq('id', 1)
                .single();

            if (error || !data) return; // If table doesn't exist yet, do nothing

            // Check if current user is admin (bypass all restrictions)
            var isAdmin = false;
            try {
                var { data: sessionData } = await window.supabaseClient.auth.getSession();
                if (sessionData && sessionData.session) {
                    var uid = sessionData.session.user.id;
                    var { data: profile } = await window.supabaseClient
                        .from('profiles')
                        .select('role')
                        .eq('id', uid)
                        .single();
                    if (profile && profile.role === 'admin') isAdmin = true;
                }
            } catch (_e) { /* not logged in or error, treat as non-admin */ }

            if (isAdmin) return; // Admins bypass everything

            // Full site maintenance mode
            if (data.maintenance_mode) {
                window.location.replace('/maintenance.html');
                return;
            }

            // Store lock: block access to store page
            if (data.store_locked && (path === '/store' || path === '/store.html' || path.indexOf('/store') === 0)) {
                if (typeof UI !== 'undefined' && UI.toast) {
                    // Defer toast to after page loads
                    setTimeout(function() { UI.toast('The store is temporarily closed for maintenance.', 'warning'); }, 500);
                }
                window.location.replace('/');
                return;
            }
        } catch (err) {
            console.warn('MaintenanceMode.check:', err.message);
        }
    }
};

