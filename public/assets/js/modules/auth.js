// ─── Module: auth ───
// Exports: Auth

// ═══════════════════════════════════════
// MODULE 4: Auth
// ═══════════════════════════════════════
const Auth = {
    _session: null,
    _currentUserData: null,
    _isCreatingProfile: false,
    _pendingDisplayName: null,
    _authInitialized: false,
    _authReadyPromise: null,
    _authReadyResolve: null,
    _processingAuthEvent: false,
    _signOutRedirectTimer: null,

    /**
     * Returns a Promise that resolves once the initial auth check
     * (INITIAL_SESSION) has been fully processed, including the
     * profile fetch. Pages can `await Auth.waitForAuth()` before
     * reading Auth.isLoggedIn() / Auth.getUser() to avoid races.
     */
    waitForAuth() {
        if (Auth._authInitialized) return Promise.resolve();
        return Auth._authReadyPromise || Promise.resolve();
    },

    _initListener() {
        Auth._authReadyPromise = new Promise(function (resolve) {
            Auth._authReadyResolve = resolve;
        });
        // IMPORTANT: The callback must NOT be async to avoid a deadlock
        // in Supabase JS v2. The client holds an internal lock while
        // calling onAuthStateChange listeners. If the callback awaits
        // any Supabase REST/RPC call, that call needs the same lock
        // → deadlock. We set only synchronous state here and defer
        // all async work (profile fetch, etc.) via setTimeout(fn, 0).
        window.supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
                Auth._processingAuthEvent = true;
                if (Auth._signOutRedirectTimer) { clearTimeout(Auth._signOutRedirectTimer); Auth._signOutRedirectTimer = null; }
                // Store session synchronously so isLoggedIn() works immediately
                if (session) { Auth._session = session; }
                // Defer heavy async work to next tick to release the Supabase internal lock
                setTimeout(function () { Auth._processSignIn(event, session); }, 0);

            } else if (event === 'SIGNED_OUT') {
                // Guard: if we are currently processing INITIAL_SESSION or
                // SIGNED_IN, this SIGNED_OUT is a spurious race. Ignore it.
                if (Auth._processingAuthEvent) { return; }
                // Defer async recovery check to next tick
                setTimeout(function () { Auth._processSignOut(event); }, 0);
            }
        });
    },

    // Deferred handler for SIGNED_IN / INITIAL_SESSION / TOKEN_REFRESHED.
    // Runs outside the Supabase internal lock so REST/RPC calls work.
    async _processSignIn(event, session) {
        try {
            let currentSession = session;

            // Supabase fix: sometimes session is null on INITIAL_SESSION
            // even though a valid session exists in localStorage.
            if (!currentSession && event === 'INITIAL_SESSION') {
                try {
                    const { data: fallback } = await window.supabaseClient.auth.getSession();
                    currentSession = fallback?.session || null;
                } catch (e) {
                    currentSession = null;
                }
            }

            if (currentSession) {
                Auth._session = currentSession;
                Auth._currentUserData = await DB.user.getProfile(currentSession.user.id);

                // Fix: create missing profile for ALL auth events, not
                // just SIGNED_IN. This prevents the "Missing Profile Trap"
                // where INITIAL_SESSION users with no profile get kicked.
                if (!Auth._currentUserData && !Auth._isCreatingProfile) {
                    Auth._isCreatingProfile = true;
                    try {
                        var savedName = Auth._pendingDisplayName || '';
                        if (!savedName) {
                            try { savedName = localStorage.getItem('gm_pending_display_name') || ''; } catch (e) { /* private browsing */ }
                        }
                        if (!savedName) { savedName = 'User'; }
                        try { localStorage.removeItem('gm_pending_display_name'); } catch (e) { /* ok */ }
                        const newProfile = await DB.user.createProfile({
                            auth_id: currentSession.user.id,
                            email: currentSession.user.email,
                            display_name: savedName,
                            role: 'user',
                            gxp: 0,
                            level: 1
                        });
                        Auth._currentUserData = newProfile;
                        Auth._pendingDisplayName = null;
                        if (newProfile) {
                            // Issue #3 fix: removed duplicate increment_user_count call.
                            // DB.user.createProfile() already calls increment_user_count internally.
                            try {
                                await window.supabaseClient.from('notifications').insert({
                                    uid: newProfile.id, type: 'welcome', title: 'Welcome to GroupsMix!',
                                    message: 'Start exploring trusted social media groups.', link: '/search'
                                });
                            } catch (err) { /* welcome notification is optional */ }
                        }
                    } finally {
                        Auth._isCreatingProfile = false;
                    }
                }

                // Award daily login GXP and stabilize session
                if (Auth._currentUserData) {
                    CACHE.set('user_profile', Auth._currentUserData);
                    await DB.user.dailyLoginCheck(Auth._currentUserData.id);
                    // Security: start inactivity timer when user is authenticated
                    Auth._initInactivityWatch();
                }
                // Resolve any pending signUp/signIn promise
                if (Auth._profileReadyResolve) {
                    Auth._profileReadyResolve(Auth._currentUserData);
                    Auth._profileReadyResolve = null;
                }
            } else {
                Auth._session = null;
                Auth._currentUserData = null;
            }

            try { renderHeader(); } catch (e) { console.error('renderHeader error:', e); }

            Auth._processingAuthEvent = false;

            // NOTE: Admin page access control is handled by the admin
            // panel's own gate (gm-ctrl-x7.html) which performs a full
            // server-verified auth + role check. Removed redundant
            // redirect here to avoid a race condition where the profile
            // hasn't loaded yet but this code fires first.
        } catch (err) {
            console.error('_processSignIn auth event error:', err);
        } finally {
            // ALWAYS signal auth initialization is complete on INITIAL_SESSION,
            // even if an error occurred above. Without this, waitForAuth() hangs
            // forever and the page never loads.
            if (event === 'INITIAL_SESSION') {
                Auth._authInitialized = true;
                if (Auth._authReadyResolve) { Auth._authReadyResolve(); Auth._authReadyResolve = null; }
            }
        }
    },

    // Deferred handler for SIGNED_OUT.
    // Runs outside the Supabase internal lock so recovery calls work.
    async _processSignOut(event) {
        // Guard: verify the session is truly gone by checking
        // localStorage directly. If a session token still exists
        // in storage, this is likely a false SIGNED_OUT event.
        try {
            var storedRaw = localStorage.getItem('sb-hmlqppacanpxmrfdlkec-auth-token');
            if (storedRaw) {
                var storedData = JSON.parse(storedRaw);
                if (storedData && (storedData.access_token || (storedData.currentSession && storedData.currentSession.access_token))) {
                    try {
                        var { data: recoveryData } = await window.supabaseClient.auth.getSession();
                        if (recoveryData?.session) {
                            Auth._session = recoveryData.session;
                            Auth._currentUserData = await DB.user.getProfile(recoveryData.session.user.id);
                            if (Auth._currentUserData) { CACHE.set('user_profile', Auth._currentUserData); }
                            renderHeader();
                            return; // Session recovered — do not sign out
                        }
                    } catch (recErr) { /* recovery failed, proceed with sign-out */ }
                }
            }
        } catch (e) { /* localStorage access failed, proceed normally */ }

        Auth._session = null;
        Auth._currentUserData = null;
        CACHE.remove('user_profile');

        // Also resolve auth ready if still pending (e.g. user signed out before INITIAL_SESSION)
        if (!Auth._authInitialized) {
            Auth._authInitialized = true;
            if (Auth._authReadyResolve) { Auth._authReadyResolve(); Auth._authReadyResolve = null; }
        }

        // Use a short delay before redirecting to allow any pending
        // INITIAL_SESSION or TOKEN_REFRESHED events to arrive first.
        var _dashPaths = ['/dashboard', '/pages/user/dashboard'];
        // NOTE: admin page (/gm-ctrl-x7) removed — its own gate handles sign-out redirect
        if (_dashPaths.indexOf(window.location.pathname) !== -1) {
            Auth._signOutRedirectTimer = setTimeout(function() {
                // Final check: if session was restored by another event, don't redirect
                if (!Auth._session) {
                    window.location.href = '/';
                }
            }, 500);
        } else {
            renderHeader();
        }
    },

    _handleAuthError(error) {
        if (!error) return 'Something went wrong. Please try again.';
        const msg = error.message || '';
        if (msg.includes('Invalid login credentials')) return 'Incorrect email or password';
        if (msg.includes('User already registered')) return 'This email is already registered. Try signing in.';
        // Security: updated to match our stronger 8-char requirement
        if (msg.includes('Password should be at least')) return 'Password must be at least 8 characters with uppercase, lowercase, number, and special character';
        if (msg.includes('Unable to validate email')) return 'Please enter a valid email address';
        if (msg.includes('Email not confirmed')) return 'EMAIL_NOT_CONFIRMED';
        if (msg.includes('For security purposes')) return 'Too many attempts. Please try again later.';
        if (msg.includes('Email rate limit')) return 'Too many requests. Please wait a few minutes.';
        if (msg.includes('User not found')) return 'Incorrect email or password';
        if (msg.includes('Signup disabled')) return 'Registration is temporarily disabled';
        if (msg.includes('Network')) return 'Connection issue. Please check your internet.';
        if (msg.includes('same_password')) return 'New password must be different from your current password';
        return 'Something went wrong. Please try again.';
    },

    async signUp(email, password, displayName, turnstileToken) {
        try {
            if (!Security.checkRateLimit('login')) { UI.toast('Too many attempts. Please try again later.', 'error'); return null; }
            // Security: check network connectivity before attempting signup
            if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
            // Security: enforce strong password on client side before server call
            var pwCheck = Security.validatePassword(password);
            if (!pwCheck.valid) { UI.toast(pwCheck.errors[0], 'error'); return null; }
            // ── Server-side validation (rate limit + email + Turnstile + password) ──
            // Only send turnstileToken if it is a real token (not the bypass placeholder)
            // Audit fix #20: do NOT send password to server-side validation — keep strength check client-side only
            var svParams = { email: email, action: 'signup' };
            if (turnstileToken && turnstileToken !== 'bypass_sdk_unavailable') { svParams.turnstileToken = turnstileToken; }
            var sv = await Security.serverValidate(svParams);
            if (!sv.ok) { UI.toast(sv.errors?.[0] || 'Validation failed. Please try again.', 'error'); return null; }
            // Store display name for _initListener to use when creating profile
            Auth._pendingDisplayName = Security.sanitize(displayName);
            // Also persist to localStorage so it survives the email-verification redirect
            try { localStorage.setItem('gm_pending_display_name', Auth._pendingDisplayName); } catch (e) { /* private browsing */ }
            const { data, error } = await window.supabaseClient.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: CONFIG.siteUrl + '/?verified=1' }
            });
            if (error) {
                Auth._pendingDisplayName = null;
                try { localStorage.removeItem('gm_pending_display_name'); } catch (e) { /* ok */ }
                UI.toast(Auth._handleAuthError(error), 'error');
                return null;
            }
            // ── Email verification check ──────────────────────────────
            // When "Confirm email" is enabled in Supabase, data.session
            // will be null until the user clicks the confirmation link.
            // We return a special string so the UI can show the
            // "check your inbox" screen instead of logging the user in.
            if (!data.session) {
                // Keep display name in localStorage for post-verify profile creation
                return 'email_verification_pending';
            }
            // Instant-login: clean up localStorage since we don't need it
            try { localStorage.removeItem('gm_pending_display_name'); } catch (e) { /* ok */ }
            // ── Instant-login path (email confirmation disabled) ─────
            Auth._isCreatingProfile = true;
            const profilePromise = new Promise(resolve => { Auth._profileReadyResolve = resolve; });
            const profile = await Promise.race([
                profilePromise,
                new Promise(resolve => setTimeout(() => resolve(null), 10000))
            ]);
            Auth._currentUserData = profile || Auth._currentUserData;
            if (Auth._currentUserData) { CACHE.set('user_profile', Auth._currentUserData); }
            renderHeader();
            UI.toast('Account created! Welcome to GroupsMix', 'success');
            return data;
        } catch (err) {
            Auth._pendingDisplayName = null;
            Auth._isCreatingProfile = false;
            Auth._profileReadyResolve = null;
            UI.toast('Something went wrong. Please try again.', 'error');
            return null;
        }
    },

    async signIn(email, password) {
        try {
            if (!Security.checkRateLimit('login')) { UI.toast('Too many attempts. Please try again later.', 'error'); return null; }
            if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
            // ── Server-side validation (rate limit + email) ──
            var sv = await Security.serverValidate({ email: email, action: 'signin' });
            if (!sv.ok) { UI.toast(sv.errors?.[0] || 'Validation failed. Please try again.', 'error'); return null; }
            const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
            if (error) {
                var friendlyMsg = Auth._handleAuthError(error);
                if (friendlyMsg === 'EMAIL_NOT_CONFIRMED') return 'email_not_confirmed';
                UI.toast(friendlyMsg, 'error');
                return null;
            }
            Auth._session = data.session;
            // Use maybeSingle to avoid error if profile doesn't exist yet
            const { data: profile } = await window.supabaseClient.from('users').select('*').eq('auth_id', data.user.id).maybeSingle();
            if (profile) { Auth._currentUserData = profile; CACHE.set('user_profile', profile); }
            UI.toast('Welcome back, ' + (profile?.display_name || 'User') + '!', 'success');
            renderHeader();
            return data;
        } catch (err) {
            console.error('Auth.signIn:', err.message || err);
            UI.toast('Something went wrong. Please try again.', 'error');
            return null;
        }
    },

    async signOut() {
        try {
            await window.supabaseClient.auth.signOut();
            Auth._session = null;
            Auth._currentUserData = null;
            CACHE.clear();
            // Security: clear inactivity timer and remove listeners on sign out (Issue #1)
            if (Auth._inactivityHandler) {
                Auth._inactivityEvents.forEach(function(evt) {
                    document.removeEventListener(evt, Auth._inactivityHandler);
                });
                Auth._inactivityHandler = null;
            }
            if (Auth._inactivityTimer) { clearTimeout(Auth._inactivityTimer); Auth._inactivityTimer = null; }
            renderHeader();
            UI.toast('Signed out successfully', 'success');
            const authPages = ['/user/', '/admin'];
            if (authPages.some(p => window.location.pathname.includes(p))) {
                window.location.href = '/';
            }
        } catch (err) { UI.toast('Something went wrong. Please try again.', 'error'); }
    },

    async resetPassword(email) {
        try {
            // ── Server-side validation (rate limit + email) ──
            var sv = await Security.serverValidate({ email: email, action: 'reset' });
            if (!sv.ok) { UI.toast(sv.errors?.[0] || 'Validation failed. Please try again.', 'error'); return false; }
            // Bug fix: correct redirect path to /pages/user/reset-password
            const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: CONFIG.siteUrl + '/pages/user/reset-password'
            });
            if (error) { UI.toast(Auth._handleAuthError(error), 'error'); return false; }
            UI.toast('Password reset link sent to your email', 'success');
            return true;
        } catch (err) { console.error('Auth.resetPassword:', err.message); UI.toast('Something went wrong. Please try again.', 'error'); return false; }
    },

    async updatePassword(newPassword) {
        try {
            // Security: enforce strong password requirements on password update
            var pwCheck = Security.validatePassword(newPassword);
            if (!pwCheck.valid) { UI.toast(pwCheck.errors[0], 'error'); return false; }
            const { error } = await window.supabaseClient.auth.updateUser({ password: newPassword });
            if (error) { UI.toast(Auth._handleAuthError(error), 'error'); return false; }
            UI.toast('Password updated! You can now sign in', 'success');
            return true;
        } catch (err) { console.error('Auth.updatePassword:', err.message); UI.toast('Something went wrong. Please try again.', 'error'); return false; }
    },

    // ── Session inactivity timeout ─────────────────────────────
    // Auto-logout after 30 minutes of inactivity to protect unattended sessions.
    _inactivityTimer: null,
    _inactivityTimeout: 1800000, // 30 minutes in ms
    _inactivityHandler: null,
    _inactivityEvents: ['mousedown', 'keypress', 'scroll', 'touchstart', 'mousemove'],
    _resetInactivityTimer() {
        if (Auth._inactivityTimer) clearTimeout(Auth._inactivityTimer);
        if (!Auth._session) return;
        Auth._inactivityTimer = setTimeout(function() {
            if (Auth._session) {
                UI.toast('Session expired due to inactivity. Please sign in again.', 'warning', 6000);
                Auth.signOut();
            }
        }, Auth._inactivityTimeout);
    },
    _initInactivityWatch() {
        // Remove previous listeners first to prevent accumulation (Issue #1)
        if (Auth._inactivityHandler) {
            Auth._inactivityEvents.forEach(function(evt) {
                document.removeEventListener(evt, Auth._inactivityHandler);
            });
        }
        Auth._inactivityHandler = function() { Auth._resetInactivityTimer(); };
        Auth._inactivityEvents.forEach(function(evt) {
            document.addEventListener(evt, Auth._inactivityHandler, { passive: true });
        });
        Auth._resetInactivityTimer();
    },

    isLoggedIn() { return !!Auth._session; },
    isAdmin() { return Auth._currentUserData?.role === 'admin'; },
    isModerator() { return Auth._currentUserData?.role === 'moderator' || Auth.isAdmin(); },
    isEditor() { return Auth._currentUserData?.role === 'editor' || Auth.isAdmin(); },
    hasRole(role) {
        const userRole = Auth._currentUserData?.role;
        if (!userRole) return false;
        const hierarchy = { admin: 4, moderator: 3, editor: 2, user: 1 };
        return (hierarchy[userRole] || 0) >= (hierarchy[role] || 0);
    },
    getRole() { return Auth._currentUserData?.role || 'user'; },
    getUser() { return Auth._currentUserData; },
    getUserId() { return Auth._currentUserData?.id; },
    getAuthId() { return Auth._session?.user?.id; },
    getEmail() { return Auth._session?.user?.email; },
    requireAuth() { if (!Auth.isLoggedIn()) { UI.authModal('signin'); return false; } return true; },
    requireAdmin() { if (!Auth.isAdmin()) { UI.toast('Access denied', 'error'); return false; } return true; },
    requireModerator() { if (!Auth.isModerator()) { UI.toast('Access denied', 'error'); return false; } return true; },

    async resendVerification(email) {
        try {
            if (!Security.checkRateLimit('login')) { UI.toast('Too many attempts. Please wait.', 'error'); return false; }
            const { error } = await window.supabaseClient.auth.resend({ type: 'signup', email, options: { emailRedirectTo: CONFIG.siteUrl + '/?verified=1' } });
            if (error) { UI.toast(Auth._handleAuthError(error), 'error'); return false; }
            UI.toast('Verification email sent! Check your inbox.', 'success');
            return true;
        } catch (err) { UI.toast('Something went wrong. Please try again.', 'error'); return false; }
    }
};

