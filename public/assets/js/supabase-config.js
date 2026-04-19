const SUPABASE_URL = 'https://hmlqppacanpxmrfdlkec.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtbHFwcGFjYW5weG1yZmRsa2VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDkxMTUsImV4cCI6MjA4NzkyNTExNX0.xRDweHu4st7Hk--lQyLYlRU5ufUsXWbArvsIjVznr9o';

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
                            return localStorage.getItem(key);
                        },
                        setItem: function(key, value) {
                            localStorage.setItem(key, value);
                            // Also set as cookie for server-side middleware
                            document.cookie = key + '=' + encodeURIComponent(value) + ';path=/;max-age=604800;SameSite=Lax;Secure';
                        },
                        removeItem: function(key) {
                            localStorage.removeItem(key);
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
