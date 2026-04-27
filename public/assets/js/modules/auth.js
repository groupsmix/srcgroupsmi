// ─── Module: auth ───
// Exports: Auth

// ═══════════════════════════════════════
// MODULE 4: Auth
// ═══════════════════════════════════════
const _Auth = {
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
        if (_Auth._authInitialized) return Promise.resolve();
        return _Auth._authReadyPromise || Promise.resolve();
    },

    _initListener() {
        _Auth._authReadyPromise = new Promise(function (resolve) {
            _Auth._authReadyResolve = resolve;
        });
        window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
                _Auth._processingAuthEvent = true;
                if (_Auth._signOutRedirectTimer) { clearTimeout(_Auth._signOutRedirectTimer); _Auth._signOutRedirectTimer = null; }
                // Store session synchronously so isLoggedIn() works immediately
                if (session) { _Auth._session = session; }
                await _Auth._processSignIn(event, session);

            } else if (event === 'SIGNED_OUT') {
                // Guard: if we are currently processing INITIAL_SESSION or
                // SIGNED_IN, this SIGNED_OUT is a spurious race. Ignore it.
                if (_Auth._processingAuthEvent) { return; }
                await _Auth._processSignOut(event);
            }
        });
    },

    // Handler for SIGNED_IN / INITIAL_SESSION / TOKEN_REFRESHED.
    async _processSignIn(event, session) {
        try {
            let currentSession = session;

            // Supabase fix: sometimes session is null on INITIAL_SESSION
            // even though a valid session exists in localStorage.
            if (!currentSession && event === 'INITIAL_SESSION') {
                try {
                    const { data: fallback } = await window.supabaseClient.auth.getSession();
                    currentSession = fallback?.session || null;
                } catch (_e) {
                    currentSession = null;
                }
            }

            if (currentSession) {
                _Auth._session = currentSession;
                _Auth._currentUserData = await DB.user.getProfile(currentSession.user.id);

                // Fix: create missing profile for ALL auth events, not
                // just SIGNED_IN. This prevents the "Missing Profile Trap"
                // where INITIAL_SESSION users with no profile get kicked.
                if (!_Auth._currentUserData && !_Auth._isCreatingProfile) {
                    _Auth._isCreatingProfile = true;
                    try {
                        let savedName = _Auth._pendingDisplayName || '';
                        if (!savedName) {
                            savedName = SafeStorage.get('gm_pending_display_name', '') || '';
                        }
                        if (!savedName) { savedName = 'User'; }
                        SafeStorage.remove('gm_pending_display_name');
                        const newProfile = await DB.user.createProfile({
                            auth_id: currentSession.user.id,
                            email: currentSession.user.email,
                            display_name: savedName,
                            role: 'user',
                            gxp: 0,
                            level: 1
                        });
                        _Auth._currentUserData = newProfile;
                        _Auth._pendingDisplayName = null;
                        if (newProfile) {
                            // Issue #3 fix: removed duplicate increment_user_count call.
                            // DB.user.createProfile() already calls increment_user_count internally.
                            try {
                                await window.supabaseClient.from('notifications').insert({
                                    uid: newProfile.id, type: 'welcome', title: 'Welcome to GroupsMix!',
                                    message: 'Start exploring trusted social media groups.', link: '/search'
                                });
                            } catch (_err) { /* welcome notification is optional */ }
                        }
                    } finally {
                        _Auth._isCreatingProfile = false;
                    }
                }

                // Award daily login GXP and stabilize session
                if (_Auth._currentUserData) {
                    CACHE.set('user_profile', _Auth._currentUserData);
                    await DB.user.dailyLoginCheck(_Auth._currentUserData.id);
                    // Security: start inactivity timer when user is authenticated
                    _Auth._initInactivityWatch();
                }
                // Resolve any pending signUp/signIn promise
                if (_Auth._profileReadyResolve) {
                    _Auth._profileReadyResolve(_Auth._currentUserData);
                    _Auth._profileReadyResolve = null;
                }
            } else {
                _Auth._session = null;
                _Auth._currentUserData = null;
            }

            try { renderHeader(); } catch (e) { console.error('renderHeader error:', e); }

            _Auth._processingAuthEvent = false;

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
                _Auth._authInitialized = true;
                if (_Auth._authReadyResolve) { _Auth._authReadyResolve(); _Auth._authReadyResolve = null; }
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
            const projectRef = (window.SUPABASE_URL || '').replace('https://', '').split('.')[0] || 'sb';
            const storedRaw = SafeStorage.get('sb-' + projectRef + '-auth-token');
            if (storedRaw) {
                const storedData = JSON.parse(storedRaw);
                if (storedData && (storedData.access_token || (storedData.currentSession && storedData.currentSession.access_token))) {
                    try {
                        const { data: recoveryData } = await window.supabaseClient.auth.getSession();
                        if (recoveryData?.session) {
                            _Auth._session = recoveryData.session;
                            _Auth._currentUserData = await DB.user.getProfile(recoveryData.session.user.id);
                            if (_Auth._currentUserData) { CACHE.set('user_profile', _Auth._currentUserData); }
                            renderHeader();
                            return; // Session recovered — do not sign out
                        }
                    } catch (_recErr) { /* recovery failed, proceed with sign-out */ }
                }
            }
        } catch (_e) { /* localStorage access failed, proceed normally */ }

        _Auth._session = null;
        _Auth._currentUserData = null;
        CACHE.remove('user_profile');

        // Also resolve auth ready if still pending (e.g. user signed out before INITIAL_SESSION)
        if (!_Auth._authInitialized) {
            _Auth._authInitialized = true;
            if (_Auth._authReadyResolve) { _Auth._authReadyResolve(); _Auth._authReadyResolve = null; }
        }

        // Use a short delay before redirecting to allow any pending
        // INITIAL_SESSION or TOKEN_REFRESHED events to arrive first.
        const _dashPaths = ['/dashboard'];
        // NOTE: admin page (/gm-ctrl-x7) removed — its own gate handles sign-out redirect
        if (_dashPaths.indexOf(window.location.pathname) !== -1) {
            _Auth._signOutRedirectTimer = setTimeout(function() {
                // Final check: if session was restored by another event, don't redirect
                if (!_Auth._session) {
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
            const pwCheck = await Security.validatePassword(password);
            if (!pwCheck.valid) { UI.toast(pwCheck.errors[0], 'error'); return null; }
            
            // Security: HIBP compromised password check
            const isCompromised = await Security.checkPwnedPassword(password);
            if (isCompromised) {
                UI.toast('This password has appeared in a data breach. Please choose a different one.', 'error');
                return null;
            }
            // ── Server-side validation (rate limit + email + Turnstile + password) ──
            // Only send turnstileToken if it is a real token (not the bypass placeholder)
            // Audit fix #20: do NOT send password to server-side validation — keep strength check client-side only
            const svParams = { email: email, action: 'signup' };
            if (turnstileToken && turnstileToken !== 'bypass_sdk_unavailable') { svParams.turnstileToken = turnstileToken; }
            const sv = await Security.serverValidate(svParams);
            if (!sv.ok) { UI.toast(sv.errors?.[0] || 'Validation failed. Please try again.', 'error'); return null; }
            if (sv.serverBypassed) { console.warn('Server validation bypassed during signup'); }
            // Store display name for _initListener to use when creating profile
            _Auth._pendingDisplayName = Security.sanitize(displayName);
            // Also persist to localStorage so it survives the email-verification redirect
            SafeStorage.set('gm_pending_display_name', _Auth._pendingDisplayName);
            const { data, error } = await window.supabaseClient.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: CONFIG.siteUrl + '/?verified=1' }
            });
            if (error) {
                _Auth._pendingDisplayName = null;
                SafeStorage.remove('gm_pending_display_name');
                UI.toast(_Auth._handleAuthError(error), 'error');
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
            SafeStorage.remove('gm_pending_display_name');
            // ── Instant-login path (email confirmation disabled) ─────
            _Auth._isCreatingProfile = true;
            const profilePromise = new Promise(resolve => { _Auth._profileReadyResolve = resolve; });
            const profile = await Promise.race([
                profilePromise,
                new Promise(resolve => setTimeout(() => resolve(null), 10000))
            ]);
            _Auth._currentUserData = profile || _Auth._currentUserData;
            if (_Auth._currentUserData) { CACHE.set('user_profile', _Auth._currentUserData); }
            renderHeader();
            UI.toast('Account created! Welcome to GroupsMix', 'success');
            return data;
        } catch (_err) {
            _Auth._pendingDisplayName = null;
            _Auth._isCreatingProfile = false;
            _Auth._profileReadyResolve = null;
            UI.toast('Something went wrong. Please try again.', 'error');
            return null;
        }
    },

    async signIn(email, password) {
        try {
            if (!Security.checkRateLimit('login')) { UI.toast('Too many attempts. Please try again later.', 'error'); return null; }
            if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
            // ── Server-side validation (rate limit + email) ──
            const sv = await Security.serverValidate({ email: email, action: 'signin' });
            if (!sv.ok) { UI.toast(sv.errors?.[0] || 'Validation failed. Please try again.', 'error'); return null; }
            if (sv.serverBypassed) { console.warn('Server validation bypassed during signin'); }
            const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
            if (error) {
                const friendlyMsg = _Auth._handleAuthError(error);
                if (friendlyMsg === 'EMAIL_NOT_CONFIRMED') return 'email_not_confirmed';
                UI.toast(friendlyMsg, 'error');
                return null;
            }
            _Auth._session = data.session;
            // Use maybeSingle to avoid error if profile doesn't exist yet
            const { data: profile } = await window.supabaseClient.from('users').select('*').eq('auth_id', data.user.id).maybeSingle();
            if (profile) { _Auth._currentUserData = profile; CACHE.set('user_profile', profile); }
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
            _Auth._session = null;
            _Auth._currentUserData = null;
            CACHE.clear();
            // Security: clear inactivity timer and remove listeners on sign out (Issue #1)
            if (_Auth._inactivityHandler) {
                _Auth._inactivityEvents.forEach(function(evt) {
                    document.removeEventListener(evt, _Auth._inactivityHandler);
                });
                _Auth._inactivityHandler = null;
            }
            if (_Auth._inactivityTimer) { clearTimeout(_Auth._inactivityTimer); _Auth._inactivityTimer = null; }
            renderHeader();
            UI.toast('Signed out successfully', 'success');
            const authPages = [
                '/admin', '/dashboard', '/wallet', '/wishlist', '/saved',
                '/settings', '/my-groups', '/reset-password', '/seller-dashboard',
                '/owner-dashboard', '/employer-dashboard', '/write-article',
                '/post-job', '/submit', '/sell'
            ];
            const path = window.location.pathname;
            if (authPages.some(p => path === p || path.startsWith(p + '/'))) {
                window.location.href = '/';
            }
        } catch (_err) { UI.toast('Something went wrong. Please try again.', 'error'); }
    },

    async resetPassword(email) {
        try {
            // ── Server-side validation (rate limit + email) ──
            const sv = await Security.serverValidate({ email: email, action: 'reset' });
            if (!sv.ok) { UI.toast(sv.errors?.[0] || 'Validation failed. Please try again.', 'error'); return false; }
            if (sv.serverBypassed) { console.warn('Server validation bypassed during password reset'); }
            const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: CONFIG.siteUrl + '/reset-password'
            });
            if (error) { UI.toast(_Auth._handleAuthError(error), 'error'); return false; }
            UI.toast('Password reset link sent to your email', 'success');
            return true;
        } catch (err) { console.error('Auth.resetPassword:', err.message); UI.toast('Something went wrong. Please try again.', 'error'); return false; }
    },

    async updatePassword(newPassword) {
        try {
            // Security: enforce strong password requirements on password update
            const pwCheck = await Security.validatePassword(newPassword);
            if (!pwCheck.valid) { UI.toast(pwCheck.errors[0], 'error'); return false; }
            const { error } = await window.supabaseClient.auth.updateUser({ password: newPassword });
            if (error) { UI.toast(_Auth._handleAuthError(error), 'error'); return false; }
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
        if (_Auth._inactivityTimer) clearTimeout(_Auth._inactivityTimer);
        if (!_Auth._session) return;
        _Auth._inactivityTimer = setTimeout(function() {
            if (_Auth._session) {
                UI.toast('Session expired due to inactivity. Please sign in again.', 'warning', 6000);
                _Auth.signOut();
            }
        }, _Auth._inactivityTimeout);
    },
    _initInactivityWatch() {
        // Remove previous listeners first to prevent accumulation (Issue #1)
        if (_Auth._inactivityHandler) {
            _Auth._inactivityEvents.forEach(function(evt) {
                document.removeEventListener(evt, _Auth._inactivityHandler);
            });
        }
        _Auth._inactivityHandler = function() { _Auth._resetInactivityTimer(); };
        _Auth._inactivityEvents.forEach(function(evt) {
            document.addEventListener(evt, _Auth._inactivityHandler, { passive: true });
        });
        _Auth._resetInactivityTimer();
    },

    isLoggedIn() { return !!_Auth._session; },
    isAdmin() { return _Auth._currentUserData?.role === 'admin'; },
    isModerator() { return _Auth._currentUserData?.role === 'moderator' || _Auth.isAdmin(); },
    isEditor() { return _Auth._currentUserData?.role === 'editor' || _Auth.isAdmin(); },
    hasRole(role) {
        const userRole = _Auth._currentUserData?.role;
        if (!userRole) return false;
        const hierarchy = { admin: 4, moderator: 3, editor: 2, user: 1 };
        return (hierarchy[userRole] || 0) >= (hierarchy[role] || 0);
    },
    getRole() { return _Auth._currentUserData?.role || 'user'; },
    getUser() { return _Auth._currentUserData; },
    getUserId() { return _Auth._currentUserData?.id; },
    getAuthId() { return _Auth._session?.user?.id; },
    getEmail() { return _Auth._session?.user?.email; },
    requireAuth() { if (!_Auth.isLoggedIn()) { UI.authModal('signin'); return false; } return true; },
    requireAdmin() { if (!_Auth.isAdmin()) { UI.toast('Access denied', 'error'); return false; } return true; },
    requireModerator() { if (!_Auth.isModerator()) { UI.toast('Access denied', 'error'); return false; } return true; },

    async resendVerification(email) {
        try {
            if (!Security.checkRateLimit('login')) { UI.toast('Too many attempts. Please wait.', 'error'); return false; }
            const { error } = await window.supabaseClient.auth.resend({ type: 'signup', email, options: { emailRedirectTo: CONFIG.siteUrl + '/?verified=1' } });
            if (error) { UI.toast(_Auth._handleAuthError(error), 'error'); return false; }
            UI.toast('Verification email sent! Check your inbox.', 'success');
            return true;
        } catch (_err) { UI.toast('Something went wrong. Please try again.', 'error'); return false; }
    }
};

