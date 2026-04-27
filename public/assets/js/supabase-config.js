const SUPABASE_URL = window.GM_ENV?.PUBLIC_SUPABASE_URL || '{{SUPABASE_URL}}';
const SUPABASE_ANON_KEY = window.GM_ENV?.PUBLIC_SUPABASE_ANON_KEY || '{{SUPABASE_ANON_KEY}}';

(function initSupabase() {
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        try {
            // Issue #11 fix: configure custom storage that mirrors session to cookies
            // so the server-side admin gate (gm-ctrl-x7.js) can validate auth via cookies.
            // Supabase JS v2 uses localStorage by default; without cookies the server
            // middleware falls through to client-side-only gate which can be bypassed.
            // Audit fix #21: removed unused storageKey variable
            window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    flowType: 'pkce',
                    storage: {
                        getItem: function(key) {
                            return SafeStorage.get(key);
                        },
                        setItem: function(key, value) {
                            SafeStorage.set(key, value);
                            // Also set as cookie for server-side middleware
                            document.cookie = key + '=' + encodeURIComponent(value) + ';path=/;max-age=604800;SameSite=Lax;Secure';
                        },
                        removeItem: function(key) {
                            SafeStorage.remove(key);
                            document.cookie = key + '=;path=/;max-age=0';
                        }
                    }
                }
            });
            // Intentionally no console log here — we do not want to leak the
            // Supabase project URL into end-users' browser devtools on every page load.
        } catch (err) {
            console.error('Init failed:', err.message);
        }
    } else {
        console.error('Library not loaded!');
    }
})();
