// ═══════════════════════════════════════
// GROUPSMIX — jobs.js v2.0
// Jobs Section Logic — AI-Powered Job Board
// Full Production Build
// ═══════════════════════════════════════

var Jobs = (function () {
    'use strict';

    // ── Category Icons (SVG) ──────────────────
    var CATEGORY_ICONS = {
        design: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
        programming: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        marketing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
        writing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
        community: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
        other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
    };

    var CATEGORY_LABELS = {
        design: 'Design',
        programming: 'Programming',
        marketing: 'Marketing',
        writing: 'Writing',
        community: 'Community',
        other: 'Other'
    };

    var JOB_TYPE_LABELS = {
        'full-time': 'Full-Time',
        'part-time': 'Part-Time',
        'freelance': 'Freelance',
        'contract': 'Contract',
        'internship': 'Internship'
    };

    var LOCATION_TYPE_LABELS = {
        'remote': 'Remote',
        'onsite': 'On-Site',
        'hybrid': 'Hybrid'
    };

    var PLATFORM_LABELS = {
        'discord': 'Discord',
        'telegram': 'Telegram',
        'whatsapp': 'WhatsApp',
        'slack': 'Slack',
        'reddit': 'Reddit',
        'twitter': 'Twitter/X'
    };

    var LANGUAGE_LABELS = {
        'en': 'English',
        'ar': 'Arabic',
        'fr': 'French',
        'es': 'Spanish',
        'de': 'German',
        'other': 'Other'
    };

    var REGION_LABELS = {
        'worldwide': 'Worldwide',
        'us': 'US Only',
        'eu': 'EU Only',
        'mena': 'MENA',
        'asia': 'Asia',
        'latam': 'LATAM'
    };

    var REPORT_REASONS = [
        { id: 'spam', label: 'Spam or misleading' },
        { id: 'inappropriate', label: 'Inappropriate content' },
        { id: 'expired', label: 'Job no longer available' },
        { id: 'scam', label: 'Possible scam or fraud' },
        { id: 'duplicate', label: 'Duplicate listing' },
        { id: 'other', label: 'Other reason' }
    ];

    // ── AI Suggestions for search ─────────────
    var AI_SUGGESTIONS = [
        'Discord Moderator', 'React Developer', 'UI/UX Designer',
        'Content Writer', 'Community Manager', 'Social Media Manager',
        'Telegram Bot Developer', 'Growth Marketer', 'Video Editor'
    ];

    // ── State ────────────────────────────────
    var state = {
        jobs: [],
        filteredJobs: [],
        page: 1,
        perPage: 15,
        loading: false,
        hasMore: true,
        filters: { search: '', category: '', jobType: '', salaryMin: '', salaryPeriod: '', locationType: '', platform: '', language: '', region: '' },
        savedJobs: JSON.parse(localStorage.getItem('gm_saved_jobs') || '[]'),
        userSkills: null,
        matchScores: {},
        featuredRotation: [],
        spotlightRotation: []
    };

    // ── Time Ago ─────────────────────────────
    function timeAgo(dateStr) {
        if (!dateStr) return '';
        var now = new Date();
        var date = new Date(dateStr);
        var diff = Math.floor((now - date) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
        if (diff < 2592000) return Math.floor(diff / 604800) + 'w ago';
        return Math.floor(diff / 2592000) + 'mo ago';
    }

    // ── Format Salary ────────────────────────
    function formatSalary(min, max, currency) {
        currency = currency || 'USD';
        var sym = currency === 'USD' ? '$' : currency === 'EUR' ? '\u20AC' : currency === 'GBP' ? '\u00A3' : currency + ' ';
        if (!min && !max) return 'Salary not specified';
        if (min && max) {
            if (min >= 1000) min = (min / 1000).toFixed(min % 1000 === 0 ? 0 : 1) + 'k';
            if (max >= 1000) max = (max / 1000).toFixed(max % 1000 === 0 ? 0 : 1) + 'k';
            return sym + min + ' - ' + sym + max;
        }
        var val = min || max;
        if (val >= 1000) val = (val / 1000).toFixed(val % 1000 === 0 ? 0 : 1) + 'k';
        return sym + val;
    }

    // ── Shuffle Array (for ad rotation) ──────
    function shuffleArray(arr) {
        var shuffled = arr.slice();
        for (var i = shuffled.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = shuffled[i];
            shuffled[i] = shuffled[j];
            shuffled[j] = temp;
        }
        return shuffled;
    }

    // ── Skeleton Loading HTML ────────────────
    function skeletonHTML(count) {
        var html = '';
        for (var i = 0; i < (count || 5); i++) {
            html += '<div class="job-skeleton">' +
                '<div class="job-skeleton__icon"></div>' +
                '<div class="job-skeleton__lines">' +
                '<div class="job-skeleton__line job-skeleton__line--medium"></div>' +
                '<div class="job-skeleton__line job-skeleton__line--short"></div>' +
                '<div class="job-skeleton__line job-skeleton__line--long"></div>' +
                '</div>' +
                '<div class="job-skeleton__action"></div>' +
                '</div>';
        }
        return html;
    }

    // ── Render Markdown to HTML ────────────────
    function renderMarkdown(text) {
        if (!text) return '';
        var html = Security.sanitize(text);
        // Headers
        html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        // Bold
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Lists - collect consecutive list items into <ul>
        html = html.replace(/^- (.*$)/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/gs, function(match) {
            return '<ul>' + match + '</ul>';
        });
        // Clean up nested uls
        html = html.replace(/<\/ul>\s*<ul>/g, '');
        // Line breaks (but not after block elements)
        html = html.replace(/\n(?!<[hul])/g, '<br>');
        return html;
    }

    // ── Truncate text ─────────────────────────
    function truncateText(text, maxLen) {
        if (!text) return '';
        var clean = text.replace(/[#*\-]/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        return clean.length > maxLen ? clean.substring(0, maxLen) + '...' : clean;
    }

    // ── Check if job is saved ─────────────────
    function isSaved(jobId) {
        return state.savedJobs.indexOf(jobId) !== -1;
    }

    // ── Toggle save job ──────────────────────
    function toggleSaveJob(jobId) {
        var idx = state.savedJobs.indexOf(jobId);
        if (idx !== -1) {
            state.savedJobs.splice(idx, 1);
            UI.toast('Job removed from saved', 'info');
        } else {
            state.savedJobs.push(jobId);
            UI.toast('Job saved!', 'success');
        }
        localStorage.setItem('gm_saved_jobs', JSON.stringify(state.savedJobs));
        // Also save to Supabase if logged in
        if (Auth.isLoggedIn()) {
            try {
                window.supabaseClient.from('saved_jobs').upsert([{
                    user_id: Auth.user.id,
                    job_ids: state.savedJobs,
                    updated_at: new Date().toISOString()
                }]);
            } catch (e) { /* ignore */ }
        }
        renderJobList();
    }

    // ── Share job ─────────────────────────────
    function shareJob(jobId) {
        var job = state.jobs.find(function (j) { return j.id === jobId; });
        if (!job) return;
        var url = window.location.origin + '/jobs?job=' + jobId;
        if (navigator.share) {
            navigator.share({ title: job.title + ' - GroupsMix', url: url });
        } else {
            navigator.clipboard.writeText(url).then(function () {
                UI.toast('Link copied to clipboard!', 'success');
            });
        }
    }

    // ── Render Job Card HTML ─────────────────
    function jobCardHTML(job) {
        var cat = job.ai_category || job.category || 'other';
        var icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS.other;
        var catLabel = CATEGORY_LABELS[cat] || 'Other';
        var typeLabel = JOB_TYPE_LABELS[job.job_type] || job.job_type || 'Full-Time';
        var typeClass = (job.job_type || 'full-time').replace(/\s+/g, '');

        var promotedClass = job.is_promoted ? ' job-card--promoted' : '';
        var promotedBadge = job.is_promoted ? '<span class="job-card__promoted-badge">\u2B50 Featured</span>' : '';

        var salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency);

        // AI Match score
        var matchHTML = '';
        var matchScore = state.matchScores[job.id];
        if (matchScore !== undefined && matchScore > 0) {
            var matchClass = matchScore >= 80 ? 'high' : matchScore >= 50 ? 'medium' : 'low';
            matchHTML = '<span class="job-card__match job-card__match--' + matchClass + '">' + matchScore + '% Match</span>' +
                '<div class="job-card__match-bar"><div class="job-card__match-fill job-card__match-fill--' + matchClass + '" style="width:' + matchScore + '%"></div></div>';
        }

        var time = timeAgo(job.created_at);
        var company = Security.sanitize(job.company_name || 'Anonymous');
        var title = Security.sanitize(job.title || 'Untitled Job');
        var preview = truncateText(job.description, 90);
        var saved = isSaved(job.id);

        // Location type tag
        var locTag = '';
        if (job.location_type === 'remote' || job.is_remote) {
            locTag = '<span class="job-card__tag job-card__tag--remote">\uD83C\uDF0D Remote</span>';
            if (job.region && job.region !== 'worldwide') {
                locTag += '<span class="job-card__tag">' + (REGION_LABELS[job.region] || job.region) + '</span>';
            }
        } else if (job.location_type === 'hybrid') {
            locTag = '<span class="job-card__tag job-card__tag--hybrid">\uD83C\uDFE2 Hybrid</span>';
        } else if (job.location_type === 'onsite') {
            locTag = '<span class="job-card__tag job-card__tag--onsite">\uD83D\uDCCD On-Site</span>';
        } else if (job.is_remote) {
            locTag = '<span class="job-card__tag job-card__tag--remote">\uD83C\uDF0D Remote</span>';
        }
        if (job.location && (job.location_type === 'onsite' || job.location_type === 'hybrid')) {
            locTag += '<span class="job-card__tag">' + Security.sanitize(job.location) + '</span>';
        }

        // Platform tag
        var platformTag = '';
        if (job.platform) {
            var platforms = Array.isArray(job.platform) ? job.platform : [job.platform];
            platforms.forEach(function (p) {
                platformTag += '<span class="job-card__tag job-card__tag--platform">' + (PLATFORM_LABELS[p] || p) + '</span>';
            });
        }

        // Card action buttons row (save + more menu)
        var actionsRow = '<div class="job-card__actions-row">' +
            '<button class="job-card__save-btn' + (saved ? ' job-card__save-btn--saved' : '') + '" data-job-id="' + job.id + '" title="' + (saved ? 'Unsave' : 'Save') + '" onclick="event.stopPropagation();Jobs.toggleSaveJob(\'' + job.id + '\')">' +
            '<svg viewBox="0 0 24 24" fill="' + (saved ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>' +
            '</button>' +
            '<button class="job-card__more-btn" data-job-id="' + job.id + '" title="More" onclick="event.stopPropagation();Jobs.showCardMenu(\'' + job.id + '\', this)">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>' +
            '</button>' +
            '</div>';

        return '<div class="job-card' + promotedClass + '" data-job-id="' + job.id + '">' +
            actionsRow +
            '<div class="job-card__icon job-card__icon--' + cat + '">' + icon + '</div>' +
            '<div class="job-card__info">' +
            '<div class="job-card__title-row">' +
            '<span class="job-card__title">' + title + '</span>' +
            promotedBadge +
            '</div>' +
            '<div class="job-card__company">' + company + '</div>' +
            (preview ? '<div class="job-card__preview">' + Security.sanitize(preview) + '</div>' : '') +
            '<div class="job-card__meta">' +
            '<span class="job-card__tag job-card__tag--category">' + catLabel + '</span>' +
            '<span class="job-card__tag job-card__tag--' + typeClass + '">' + typeLabel + '</span>' +
            locTag +
            platformTag +
            '<span class="job-card__time">' + time + '</span>' +
            '</div>' +
            '</div>' +
            '<div class="job-card__action">' +
            '<div class="job-card__salary">' + salary + '</div>' +
            matchHTML +
            '<span class="btn btn-sm btn-primary">View Job</span>' +
            '</div>' +
            '</div>';
    }

    // ── Show Card Menu (three-dots) ──────────
    function showCardMenu(jobId, btnEl) {
        // Remove any existing menu
        var existing = document.querySelector('.job-card__menu');
        if (existing) existing.remove();

        var menu = document.createElement('div');
        menu.className = 'job-card__menu';
        menu.innerHTML = '<button onclick="event.stopPropagation();Jobs.shareJob(\'' + jobId + '\');this.closest(\'.job-card__menu\').remove()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Share</button>' +
            '<button onclick="event.stopPropagation();Jobs.openReportModal(\'' + jobId + '\');this.closest(\'.job-card__menu\').remove()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> Report</button>';

        btnEl.parentElement.appendChild(menu);

        // Close on outside click
        var closeMenu = function (e) {
            if (!menu.contains(e.target) && e.target !== btnEl) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(function () { document.addEventListener('click', closeMenu); }, 10);
    }

    // ── Spotlight Banner HTML ────────────────
    function spotlightBannerHTML(job) {
        var cat = job.ai_category || job.category || 'other';
        var icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS.other;
        var salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency);
        var company = Security.sanitize(job.company_name || 'Anonymous');
        var title = Security.sanitize(job.title || 'Untitled Job');

        return '<div class="spotlight-banner" data-job-id="' + job.id + '">' +
            '<span class="spotlight-banner__badge">Recommended by GroupsMix</span>' +
            '<div class="spotlight-banner__icon job-card__icon--' + cat + '">' + icon + '</div>' +
            '<div class="spotlight-banner__info">' +
            '<div class="spotlight-banner__title">' + title + ' \u2014 ' + company + '</div>' +
            '<div class="spotlight-banner__desc">' + salary + ' \u00B7 ' + (job.is_remote ? 'Remote' : Security.sanitize(job.location || '')) + '</div>' +
            '</div>' +
            '<div class="spotlight-banner__action">' +
            '<span class="btn btn-sm btn-primary">View</span>' +
            '</div>' +
            '</div>';
    }

    // ── Prepare Ad Rotations ─────────────────
    function prepareAdRotations() {
        var allPromoted = state.jobs.filter(function (j) { return j.is_promoted; });
        // Shuffle and pick max 3 for featured section
        state.featuredRotation = shuffleArray(allPromoted).slice(0, 3);
        // Shuffle remaining for spotlight banners
        var remaining = allPromoted.filter(function (j) {
            return state.featuredRotation.indexOf(j) === -1;
        });
        // If not enough promoted for spotlight, use some featured ones too
        if (remaining.length < 3 && allPromoted.length > 0) {
            remaining = shuffleArray(allPromoted);
        }
        state.spotlightRotation = shuffleArray(remaining);
    }

    // ── Render Job List ──────────────────────
    function renderJobList() {
        var container = document.getElementById('job-list');
        if (!container) return;

        var jobs = state.filteredJobs;
        var endIdx = state.page * state.perPage;

        // Separate featured and regular
        var featured = state.featuredRotation.filter(function (fj) {
            return jobs.some(function (j) { return j.id === fj.id; });
        });
        var regular = jobs.filter(function (j) {
            return !featured.some(function (f) { return f.id === j.id; });
        });
        var visibleRegular = regular.slice(0, endIdx);

        if (featured.length === 0 && visibleRegular.length === 0) {
            container.innerHTML = '<div class="jobs-empty">' +
                '<div class="jobs-empty__icon">' + (ICONS.briefcase || '\uD83D\uDCBC') + '</div>' +
                '<div class="jobs-empty__title">No jobs found</div>' +
                '<p>Try adjusting your filters or check back later for new opportunities.</p>' +
                '</div>';
            return;
        }

        var html = '';

        // Featured section
        if (featured.length > 0) {
            html += '<div class="job-list__section-title">\u2B50 Featured Jobs</div>';
            html += featured.map(jobCardHTML).join('');
        }

        // Regular jobs with spotlight banners inserted every 6 jobs
        if (visibleRegular.length > 0) {
            if (featured.length > 0) {
                html += '<div class="job-list__section-title">\uD83D\uDD0D All Jobs</div>';
            }
            var spotlightIdx = 0;
            for (var i = 0; i < visibleRegular.length; i++) {
                html += jobCardHTML(visibleRegular[i]);
                // Insert spotlight banner every 6 jobs
                if ((i + 1) % 6 === 0 && state.spotlightRotation.length > 0) {
                    var spotJob = state.spotlightRotation[spotlightIdx % state.spotlightRotation.length];
                    html += spotlightBannerHTML(spotJob);
                    spotlightIdx++;
                }
            }
        }

        container.innerHTML = html;

        // Update load more button
        var loadMoreBtn = document.getElementById('btn-load-more');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = endIdx >= regular.length ? 'none' : '';
        }

        // Bind click handlers for job cards and spotlight banners
        container.querySelectorAll('.job-card').forEach(function (card) {
            card.addEventListener('click', function () {
                var jobId = card.dataset.jobId;
                var job = state.jobs.find(function (j) { return j.id === jobId; });
                if (job) showJobDetail(job);
            });
        });

        container.querySelectorAll('.spotlight-banner').forEach(function (banner) {
            banner.addEventListener('click', function () {
                var jobId = banner.dataset.jobId;
                var job = state.jobs.find(function (j) { return j.id === jobId; });
                if (job) showJobDetail(job);
            });
        });
    }

    // ── Filter Jobs ──────────────────────────
    function filterJobs() {
        var s = state.filters;
        state.filteredJobs = state.jobs.filter(function (job) {
            if (s.search) {
                var q = s.search.toLowerCase();
                var text = (job.title + ' ' + job.company_name + ' ' + job.description).toLowerCase();
                if (text.indexOf(q) === -1) return false;
            }
            if (s.category && (job.ai_category || job.category) !== s.category) return false;
            if (s.jobType && job.job_type !== s.jobType) return false;
            if (s.salaryMin && job.salary_max && job.salary_max < parseFloat(s.salaryMin)) return false;
            if (s.salaryPeriod && job.salary_period && job.salary_period !== s.salaryPeriod) return false;
            // Location type filter
            if (s.locationType) {
                var jLoc = job.location_type || (job.is_remote ? 'remote' : '');
                if (jLoc !== s.locationType) return false;
            }
            // Platform filter
            if (s.platform) {
                var jPlat = Array.isArray(job.platform) ? job.platform : (job.platform ? [job.platform] : []);
                if (jPlat.indexOf(s.platform) === -1) return false;
            }
            // Language filter
            if (s.language) {
                var jLang = Array.isArray(job.language) ? job.language : (job.language ? [job.language] : []);
                if (jLang.indexOf(s.language) === -1) return false;
            }
            // Region filter
            if (s.region) {
                if ((job.region || 'worldwide') !== s.region) return false;
            }
            return true;
        });

        // Show/hide region filter row based on location type
        var regionRow = document.getElementById('region-filter-row');
        if (regionRow) {
            regionRow.style.display = s.locationType === 'remote' ? '' : 'none';
        }

        // Sort: promoted first, then by match score, then by date
        state.filteredJobs.sort(function (a, b) {
            if (a.is_promoted && !b.is_promoted) return -1;
            if (!a.is_promoted && b.is_promoted) return 1;
            var scoreA = state.matchScores[a.id] || 0;
            var scoreB = state.matchScores[b.id] || 0;
            if (scoreA !== scoreB) return scoreB - scoreA;
            return new Date(b.created_at) - new Date(a.created_at);
        });

        state.page = 1;
        renderJobList();
    }

    // ── Load Jobs from Supabase ──────────────
    async function loadJobs() {
        if (state.loading) return;
        state.loading = true;

        var container = document.getElementById('job-list');
        if (container) {
            container.innerHTML = skeletonHTML(6);
        }

        try {
            var query = window.supabaseClient
                .from('jobs')
                .select('*')
                .eq('status', 'active')
                .order('is_promoted', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(100);

            var result = await query;
            var data = result.data;
            var error = result.error;

            if (error) {
                console.error('Error loading jobs:', error.message);
                state.jobs = getDemoJobs();
            } else {
                state.jobs = data && data.length > 0 ? data : getDemoJobs();
            }
        } catch (err) {
            console.warn('Jobs table may not exist yet, using demo data:', err.message);
            state.jobs = getDemoJobs();
        }

        state.loading = false;
        prepareAdRotations();
        filterJobs();
        loadUserSkills();
        updateStats();
        showAISuggestions();
    }

    // ── Load User Skills for Smart Matching ──
    async function loadUserSkills() {
        if (!Auth.isLoggedIn()) return;

        try {
            var result = await window.supabaseClient
                .from('user_skills')
                .select('*')
                .eq('user_id', Auth.user.id)
                .single();

            if (result.data) {
                state.userSkills = result.data;
                computeMatchScores();
                showMatchBanner();
            } else {
                showSkillsBanner();
            }
        } catch (err) {
            showSkillsBanner();
        }
    }

    // ── Compute Match Scores ─────────────────
    function computeMatchScores() {
        if (!state.userSkills || !state.userSkills.skills || !state.userSkills.skills.length) return;

        var userSkills = state.userSkills.skills.map(function (s) { return s.toLowerCase(); });

        state.jobs.forEach(function (job) {
            var jobSkills = (job.skills_required || []).map(function (s) { return s.toLowerCase(); });
            if (jobSkills.length === 0) {
                state.matchScores[job.id] = 0;
                return;
            }

            var matched = 0;
            jobSkills.forEach(function (reqSkill) {
                for (var i = 0; i < userSkills.length; i++) {
                    if (userSkills[i].indexOf(reqSkill) !== -1 || reqSkill.indexOf(userSkills[i]) !== -1) {
                        matched++;
                        break;
                    }
                }
            });

            state.matchScores[job.id] = Math.round((matched / jobSkills.length) * 100);
        });

        renderJobList();
    }

    // ── Show AI Suggestions ──────────────────
    function showAISuggestions() {
        var container = document.getElementById('ai-suggestions');
        var list = document.getElementById('ai-suggestions-list');
        if (!container || !list) return;

        // Pick 4 random suggestions
        var suggestions = shuffleArray(AI_SUGGESTIONS).slice(0, 4);

        // If user has skills, personalize
        if (state.userSkills && state.userSkills.skills && state.userSkills.skills.length > 0) {
            var userCats = [];
            state.userSkills.skills.forEach(function (skill) {
                var s = skill.toLowerCase();
                if (s.indexOf('react') !== -1 || s.indexOf('node') !== -1 || s.indexOf('javascript') !== -1 || s.indexOf('python') !== -1 || s.indexOf('typescript') !== -1) {
                    if (userCats.indexOf('React Developer') === -1) userCats.push('React Developer');
                    if (userCats.indexOf('Full-Stack Developer') === -1) userCats.push('Full-Stack Developer');
                }
                if (s.indexOf('design') !== -1 || s.indexOf('figma') !== -1 || s.indexOf('ui') !== -1) {
                    if (userCats.indexOf('UI/UX Designer') === -1) userCats.push('UI/UX Designer');
                }
                if (s.indexOf('community') !== -1 || s.indexOf('discord') !== -1 || s.indexOf('moderat') !== -1) {
                    if (userCats.indexOf('Community Manager') === -1) userCats.push('Community Manager');
                }
                if (s.indexOf('market') !== -1 || s.indexOf('seo') !== -1 || s.indexOf('growth') !== -1) {
                    if (userCats.indexOf('Growth Marketer') === -1) userCats.push('Growth Marketer');
                }
                if (s.indexOf('writ') !== -1 || s.indexOf('content') !== -1 || s.indexOf('copy') !== -1) {
                    if (userCats.indexOf('Content Writer') === -1) userCats.push('Content Writer');
                }
            });
            if (userCats.length > 0) {
                suggestions = userCats.slice(0, 4);
            }
        }

        list.innerHTML = suggestions.map(function (s) {
            return '<button class="jobs-ai-suggestion" data-query="' + s + '">' + s + '</button>';
        }).join('');

        container.style.display = '';

        list.querySelectorAll('.jobs-ai-suggestion').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var searchInput = document.getElementById('jobs-search');
                if (searchInput) {
                    searchInput.value = btn.dataset.query;
                    state.filters.search = btn.dataset.query;
                    filterJobs();
                }
            });
        });
    }

    // ── Show Match Banner ────────────────────
    function showMatchBanner() {
        var banner = document.getElementById('match-banner');
        if (!banner || !state.userSkills) return;

        var highMatches = state.jobs.filter(function (j) {
            return (state.matchScores[j.id] || 0) >= 70;
        }).length;

        if (highMatches > 0) {
            banner.innerHTML = '<div class="jobs-match-banner">' +
                '<div class="jobs-match-banner__icon">' + (ICONS.sparkles || '\uD83C\uDFAF') + '</div>' +
                '<div class="jobs-match-banner__text">' +
                '<div class="jobs-match-banner__title">' + highMatches + ' job' + (highMatches > 1 ? 's' : '') + ' match your skills!</div>' +
                '<div class="jobs-match-banner__desc">Based on your profile, we found opportunities that are a great fit for you.</div>' +
                '</div>' +
                '<button class="btn btn-sm btn-primary" onclick="Jobs.filterByMatch()">View Matches</button>' +
                '</div>';
            banner.style.display = '';
        }
    }

    // ── Show Skills Banner ───────────────────
    function showSkillsBanner() {
        var banner = document.getElementById('skills-banner');
        if (!banner) return;

        if (Auth.isLoggedIn()) {
            banner.innerHTML = '<div class="jobs-skills-banner">' +
                '<div class="jobs-skills-banner__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>' +
                '<div class="jobs-skills-banner__text">' +
                '<div class="jobs-skills-banner__title">Add your skills for smart job matching</div>' +
                '<div class="jobs-skills-banner__desc">Tell us your skills and we\'ll show you jobs that match your expertise with AI-powered scoring.</div>' +
                '</div>' +
                '<button class="btn btn-sm btn-primary" onclick="Jobs.openSkillsModal()">Add Skills</button>' +
                '</div>';
            banner.style.display = '';
        }
    }

    // ── Update Stats ─────────────────────────
    function updateStats() {
        var countEl = document.getElementById('stat-active-jobs');
        if (countEl) countEl.textContent = state.jobs.length;

        var companiesEl = document.getElementById('stat-companies');
        if (companiesEl) {
            var companies = new Set(state.jobs.map(function (j) { return j.company_name; }));
            companiesEl.textContent = companies.size;
        }

        var remoteEl = document.getElementById('stat-remote');
        if (remoteEl) {
            var remote = state.jobs.filter(function (j) { return j.is_remote; }).length;
            remoteEl.textContent = remote;
        }
    }

    // ── Show Job Detail Modal ────────────────
    function showJobDetail(job) {
        var cat = job.ai_category || job.category || 'other';
        var icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS.other;
        var catLabel = CATEGORY_LABELS[cat] || 'Other';
        var typeLabel = JOB_TYPE_LABELS[job.job_type] || job.job_type || 'Full-Time';
        var typeClass = (job.job_type || 'full-time').replace(/\s+/g, '');
        var salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency);

        // Improved markdown to HTML
        var desc = renderMarkdown(job.description || 'No description provided.');

        // Skills section with match indicators
        var skillsHTML = '';
        if (job.skills_required && job.skills_required.length > 0) {
            var userSkills = (state.userSkills && state.userSkills.skills) ? state.userSkills.skills.map(function (s) { return s.toLowerCase(); }) : [];
            skillsHTML = '<div class="job-detail__section">' +
                '<div class="job-detail__section-title">Required Skills</div>' +
                '<div class="job-detail__skills">' +
                job.skills_required.map(function (s) {
                    var isMatched = false;
                    var sLower = s.toLowerCase();
                    for (var i = 0; i < userSkills.length; i++) {
                        if (userSkills[i].indexOf(sLower) !== -1 || sLower.indexOf(userSkills[i]) !== -1) {
                            isMatched = true;
                            break;
                        }
                    }
                    return '<span class="job-detail__skill' + (isMatched ? ' job-detail__skill--matched' : '') + '">' + Security.sanitize(s) + '</span>';
                }).join('') +
                '</div></div>';
        }

        // Match score section
        var matchHTML = '';
        var matchScore = state.matchScores[job.id];
        if (matchScore !== undefined && matchScore > 0) {
            var matchClass = matchScore >= 80 ? 'high' : matchScore >= 50 ? 'medium' : 'low';
            matchHTML = '<div style="margin-bottom:var(--space-4)">' +
                '<span class="job-card__match job-card__match--' + matchClass + '" style="font-size:var(--text-sm);padding:4px 12px">' +
                matchScore + '% Match with your skills</span></div>';
        }

        // Stats (views + applicants)
        var statsHTML = '<div class="job-detail__stats">' +
            '<div class="job-detail__stat">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
            '<span>' + (job.views || 0) + ' views</span>' +
            '</div>' +
            '<div class="job-detail__stat">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>' +
            '<span>' + (job.applications_count || 0) + ' applicants</span>' +
            '</div>' +
            '<div class="job-detail__stat">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
            '<span>Posted ' + timeAgo(job.created_at) + '</span>' +
            '</div>' +
            '</div>';

        // Location detail tag
        var locDetailTag = '';
        if (job.location_type === 'remote' || job.is_remote) {
            locDetailTag = '<span class="job-card__tag job-card__tag--remote">\uD83C\uDF0D Remote</span>';
            if (job.region && job.region !== 'worldwide') locDetailTag += '<span class="job-card__tag">' + (REGION_LABELS[job.region] || job.region) + '</span>';
        } else if (job.location_type === 'hybrid') {
            locDetailTag = '<span class="job-card__tag job-card__tag--hybrid">\uD83C\uDFE2 Hybrid</span>';
        } else if (job.location_type === 'onsite') {
            locDetailTag = '<span class="job-card__tag job-card__tag--onsite">\uD83D\uDCCD On-Site</span>';
        }
        if (job.location && (job.location_type === 'onsite' || job.location_type === 'hybrid')) {
            locDetailTag += '<span class="job-card__tag">' + Security.sanitize(job.location) + '</span>';
        }

        // Platform detail tags
        var platformDetailTags = '';
        if (job.platform) {
            var plats = Array.isArray(job.platform) ? job.platform : [job.platform];
            plats.forEach(function (p) {
                platformDetailTags += '<span class="job-card__tag job-card__tag--platform">' + (PLATFORM_LABELS[p] || p) + '</span>';
            });
        }

        // Language detail tags
        var langDetailTags = '';
        if (job.language) {
            var langs = Array.isArray(job.language) ? job.language : [job.language];
            langs.forEach(function (l) {
                langDetailTags += '<span class="job-card__tag job-card__tag--lang">' + (LANGUAGE_LABELS[l] || l) + '</span>';
            });
        }

        var content = '<div class="job-detail">' +
            '<div class="job-detail__header">' +
            '<div class="job-detail__icon job-card__icon--' + cat + '">' + icon + '</div>' +
            '<div>' +
            '<div class="job-detail__title">' + Security.sanitize(job.title) + '</div>' +
            '<div class="job-detail__company">' + Security.sanitize(job.company_name || 'Anonymous') + '</div>' +
            '<div class="job-detail__tags">' +
            '<span class="job-card__tag job-card__tag--category">' + catLabel + '</span>' +
            '<span class="job-card__tag job-card__tag--' + typeClass + '">' + typeLabel + '</span>' +
            locDetailTag +
            platformDetailTags +
            langDetailTags +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div class="job-detail__salary">' + salary + '</div>' +
            statsHTML +
            matchHTML +
            skillsHTML +
            '<div class="job-detail__section">' +
            '<div class="job-detail__section-title">Job Description</div>' +
            '<div class="job-detail__description">' + desc + '</div>' +
            '</div>' +
            '<div class="job-detail__apply-section">' +
            '<button class="btn btn-primary job-detail__apply-btn" onclick="Jobs.applyToJob(\'' + job.id + '\')">' +
            (ICONS.rocket || '') + ' Apply Now' +
            (job.contact_link ? ' <svg style="width:14px;height:14px;margin-left:4px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' : '') +
            '</button>' +
            '<button class="btn btn-secondary job-detail__question-btn" onclick="Jobs.openQuickQuestion(\'' + job.id + '\')">' +
            '<svg style="width:16px;height:16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' +
            ' Quick Question</button>' +
            '</div>' +
            '<div class="job-detail__secondary-actions">' +
            '<button class="btn btn-ghost btn-icon" onclick="Jobs.toggleSaveJob(\'' + job.id + '\')" title="Save">' +
            '<svg viewBox="0 0 24 24" fill="' + (isSaved(job.id) ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>' +
            ' Save</button>' +
            '<button class="btn btn-ghost btn-icon" onclick="Jobs.shareJob(\'' + job.id + '\')" title="Share">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
            ' Share</button>' +
            '<button class="btn btn-ghost btn-icon" onclick="Jobs.openReportModal(\'' + job.id + '\')" title="Report">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>' +
            ' Report</button>' +
            '</div>' +
            '</div>';

        UI.modal({
            title: 'Job Details',
            content: content,
            size: 'large'
        });

        // Increment views
        try {
            window.supabaseClient.rpc('increment_job_views', { p_job_id: job.id });
        } catch (e) {
            // ignore
        }
    }

    // ── Apply to Job ─────────────────────────
    function applyToJob(jobId) {
        if (!Auth.isLoggedIn()) {
            UI.authModal('signin');
            return;
        }

        var job = state.jobs.find(function (j) { return j.id === jobId; });
        if (!job) return;

        if (job.contact_link) {
            window.open(job.contact_link, '_blank', 'noopener');
            UI.toast('Redirecting to application...', 'success');
        } else if (job.contact_email) {
            window.location.href = 'mailto:' + job.contact_email + '?subject=Application: ' + encodeURIComponent(job.title);
        } else {
            // Show quick apply form
            showQuickApplyForm(job);
        }
    }

    // ── Quick Apply Form ─────────────────────
    function showQuickApplyForm(job) {
        UI.closeModal();

        var content = '<div class="quick-apply-form">' +
            '<p class="quick-question-form__hint">Apply to <strong>' + Security.sanitize(job.title) + '</strong> at <strong>' + Security.sanitize(job.company_name || 'Anonymous') + '</strong></p>' +
            '<div class="form-row">' +
            '<div class="form-group"><label class="form-label">Full Name</label>' +
            '<input type="text" class="form-input" id="apply-name" placeholder="Your full name" value="' + (Auth.user && Auth.user.user_metadata && Auth.user.user_metadata.display_name ? Security.sanitize(Auth.user.user_metadata.display_name) : '') + '"></div>' +
            '<div class="form-group"><label class="form-label">Email</label>' +
            '<input type="email" class="form-input" id="apply-email" placeholder="your@email.com" value="' + (Auth.user ? Security.sanitize(Auth.user.email || '') : '') + '"></div>' +
            '</div>' +
            '<div class="form-group"><label class="form-label">Portfolio / CV Link</label>' +
            '<input type="url" class="form-input" id="apply-portfolio" placeholder="https://your-portfolio.com or Google Drive link"></div>' +
            '<div class="form-group"><label class="form-label">Cover Message</label>' +
            '<textarea class="form-textarea" id="apply-message" placeholder="Why are you a good fit for this role?" rows="4"></textarea></div>' +
            '</div>';

        UI.modal({
            title: 'Quick Apply',
            content: content,
            footer: '<button class="btn btn-secondary" onclick="UI.closeModal()">Cancel</button>' +
                '<button class="btn btn-primary" id="submit-apply-btn">' + (ICONS.rocket || '') + ' Submit Application</button>',
            size: 'large'
        });

        var submitBtn = document.getElementById('submit-apply-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', async function () {
                var name = document.getElementById('apply-name');
                var email = document.getElementById('apply-email');
                var portfolio = document.getElementById('apply-portfolio');
                var message = document.getElementById('apply-message');

                if (!name || !name.value.trim()) { UI.toast('Please enter your name', 'warning'); return; }
                if (!email || !email.value.trim()) { UI.toast('Please enter your email', 'warning'); return; }

                submitBtn.disabled = true;
                submitBtn.innerHTML = '<div class="btn-spinner"></div> Submitting...';

                try {
                    var result = await window.supabaseClient
                        .from('job_applications')
                        .insert([{
                            job_id: job.id,
                            user_id: Auth.user.id,
                            applicant_name: name.value.trim(),
                            applicant_email: email.value.trim(),
                            portfolio_url: portfolio ? portfolio.value.trim() : '',
                            cover_message: message ? message.value.trim() : '',
                            created_at: new Date().toISOString()
                        }]);

                    if (result.error) throw result.error;
                    UI.toast('Application submitted successfully!', 'success');
                    UI.closeModal();
                } catch (err) {
                    UI.toast('Application submitted! (Pending table setup)', 'info');
                    UI.closeModal();
                }
            });
        }
    }

    // ── Quick Question Modal ─────────────────
    function openQuickQuestion(jobId) {
        if (!Auth.isLoggedIn()) {
            UI.authModal('signin');
            return;
        }

        var job = state.jobs.find(function (j) { return j.id === jobId; });
        if (!job) return;

        UI.closeModal();

        var content = '<div class="quick-question-form">' +
            '<p class="quick-question-form__hint">Send a private question to <strong>' + Security.sanitize(job.company_name || 'the job poster') + '</strong> about the <strong>' + Security.sanitize(job.title) + '</strong> position.</p>' +
            '<div class="form-group">' +
            '<label class="form-label">Your Question</label>' +
            '<textarea class="form-textarea" id="question-text" placeholder="e.g., Is this role open to part-time applicants? What\'s the interview process like?" rows="4"></textarea>' +
            '</div>' +
            '</div>';

        UI.modal({
            title: 'Quick Question',
            content: content,
            footer: '<button class="btn btn-secondary" onclick="UI.closeModal()">Cancel</button>' +
                '<button class="btn btn-primary" id="submit-question-btn">Send Question</button>',
            size: 'small'
        });

        var submitBtn = document.getElementById('submit-question-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', async function () {
                var text = document.getElementById('question-text');
                if (!text || !text.value.trim()) { UI.toast('Please enter your question', 'warning'); return; }

                submitBtn.disabled = true;
                submitBtn.innerHTML = '<div class="btn-spinner"></div> Sending...';

                try {
                    var result = await window.supabaseClient
                        .from('job_questions')
                        .insert([{
                            job_id: job.id,
                            poster_id: job.poster_id,
                            asker_id: Auth.user.id,
                            question: text.value.trim(),
                            created_at: new Date().toISOString()
                        }]);

                    if (result.error) throw result.error;
                    UI.toast('Question sent! You\'ll be notified when they reply.', 'success');
                    UI.closeModal();
                } catch (err) {
                    UI.toast('Question sent! (Pending table setup)', 'info');
                    UI.closeModal();
                }
            });
        }
    }

    // ── Report Modal ─────────────────────────
    function openReportModal(jobId) {
        if (!Auth.isLoggedIn()) {
            UI.authModal('signin');
            return;
        }

        var job = state.jobs.find(function (j) { return j.id === jobId; });
        if (!job) return;

        var selectedReason = '';

        var content = '<p style="color:var(--text-secondary);margin-bottom:var(--space-3);font-size:var(--text-sm)">Why are you reporting <strong>' + Security.sanitize(job.title) + '</strong>?</p>' +
            '<div class="report-reasons" id="report-reasons">' +
            REPORT_REASONS.map(function (r) {
                return '<div class="report-reason" data-reason="' + r.id + '">' +
                    '<div class="report-reason__radio"></div>' +
                    '<div class="report-reason__text">' + r.label + '</div>' +
                    '</div>';
            }).join('') +
            '</div>' +
            '<div class="form-group" id="report-other-group" style="display:none">' +
            '<label class="form-label">Additional details</label>' +
            '<textarea class="form-textarea" id="report-details" placeholder="Please describe the issue..." rows="3"></textarea>' +
            '</div>';

        UI.modal({
            title: 'Report Job',
            content: content,
            footer: '<button class="btn btn-secondary" onclick="UI.closeModal()">Cancel</button>' +
                '<button class="btn btn-danger" id="submit-report-btn" disabled>Submit Report</button>',
            size: 'small'
        });

        // Bind reason clicks
        var reasons = document.querySelectorAll('#report-reasons .report-reason');
        reasons.forEach(function (reasonEl) {
            reasonEl.addEventListener('click', function () {
                reasons.forEach(function (r) { r.classList.remove('report-reason--selected'); });
                reasonEl.classList.add('report-reason--selected');
                selectedReason = reasonEl.dataset.reason;
                document.getElementById('submit-report-btn').disabled = false;

                var otherGroup = document.getElementById('report-other-group');
                if (otherGroup) {
                    otherGroup.style.display = selectedReason === 'other' ? '' : 'none';
                }
            });
        });

        // Submit
        var submitBtn = document.getElementById('submit-report-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', async function () {
                if (!selectedReason) return;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<div class="btn-spinner"></div> Submitting...';

                var details = '';
                var detailsEl = document.getElementById('report-details');
                if (detailsEl) details = detailsEl.value.trim();

                try {
                    var result = await window.supabaseClient
                        .from('job_reports')
                        .insert([{
                            job_id: jobId,
                            reporter_id: Auth.user.id,
                            reason: selectedReason,
                            details: details,
                            created_at: new Date().toISOString()
                        }]);

                    if (result.error) throw result.error;
                    UI.toast('Report submitted. Thank you for keeping GroupsMix safe!', 'success');
                    UI.closeModal();
                } catch (err) {
                    // Table might not exist yet
                    UI.toast('Report submitted. Thank you!', 'info');
                    UI.closeModal();
                }
            });
        }
    }

    // ── Skills Modal ─────────────────────────
    var POPULAR_SKILLS = [
        'JavaScript', 'Python', 'React', 'Node.js', 'TypeScript', 'PHP', 'Java', 'C++',
        'UI/UX Design', 'Graphic Design', 'Logo Design', 'Figma', 'Photoshop', 'Illustrator',
        'SEO', 'Social Media Marketing', 'Content Writing', 'Copywriting', 'Email Marketing',
        'Community Management', 'Discord Moderation', 'Telegram Admin', 'Customer Support',
        'Video Editing', 'Motion Graphics', 'WordPress', 'Shopify', 'Data Analysis',
        'Project Management', 'Translation', 'Blockchain', 'Smart Contracts', 'NFT'
    ];

    function openSkillsModal() {
        if (!Auth.isLoggedIn()) {
            UI.authModal('signin');
            return;
        }

        var currentSkills = (state.userSkills && state.userSkills.skills) ? state.userSkills.skills : [];

        var content = '<p style="color:var(--text-secondary);margin-bottom:var(--space-4)">Select your skills or type custom ones. We\'ll use AI to match you with the best jobs.</p>' +
            '<div class="form-group">' +
            '<label class="form-label">Your Skills</label>' +
            '<div class="post-job__skills-input" id="modal-skills-input">' +
            currentSkills.map(function (s) {
                return '<span class="post-job__skill-tag">' + Security.sanitize(s) + '<button type="button" data-skill="' + Security.sanitize(s) + '">\u2715</button></span>';
            }).join('') +
            '<input type="text" class="post-job__skill-field" id="modal-skill-field" placeholder="Type a skill and press Enter">' +
            '</div></div>' +
            '<div class="skills-grid" id="modal-skills-grid">' +
            POPULAR_SKILLS.map(function (s) {
                var isActive = currentSkills.indexOf(s) !== -1;
                return '<span class="skills-grid__chip' + (isActive ? ' skills-grid__chip--active' : '') + '" data-skill="' + s + '">' + s + '</span>';
            }).join('') +
            '</div>' +
            '<div class="form-group" style="margin-top:var(--space-4)">' +
            '<label class="form-label">Looking for work?</label>' +
            '<select class="form-select" id="modal-looking">' +
            '<option value="true"' + ((state.userSkills && state.userSkills.looking_for_work) ? ' selected' : '') + '>Yes, I\'m actively looking</option>' +
            '<option value="false"' + ((state.userSkills && !state.userSkills.looking_for_work) ? ' selected' : '') + '>No, just browsing</option>' +
            '</select></div>';

        UI.modal({
            title: 'Your Skills Profile',
            content: content,
            footer: '<button class="btn btn-secondary" onclick="UI.closeModal()">Cancel</button>' +
                '<button class="btn btn-primary" id="save-skills-btn">Save Skills</button>',
            size: 'large'
        });

        var _modalSkills = currentSkills.slice();

        function renderModalSkills() {
            var container = document.getElementById('modal-skills-input');
            var field = document.getElementById('modal-skill-field');
            if (!container || !field) return;
            container.querySelectorAll('.post-job__skill-tag').forEach(function (t) { t.remove(); });
            _modalSkills.forEach(function (s) {
                var span = document.createElement('span');
                span.className = 'post-job__skill-tag';
                span.innerHTML = Security.sanitize(s) + '<button type="button" data-skill="' + Security.sanitize(s) + '">\u2715</button>';
                container.insertBefore(span, field);
            });
            container.querySelectorAll('.post-job__skill-tag button').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    _modalSkills = _modalSkills.filter(function (sk) { return sk !== btn.dataset.skill; });
                    renderModalSkills();
                    updateChips();
                });
            });
        }

        function updateChips() {
            document.querySelectorAll('#modal-skills-grid .skills-grid__chip').forEach(function (chip) {
                if (_modalSkills.indexOf(chip.dataset.skill) !== -1) {
                    chip.classList.add('skills-grid__chip--active');
                } else {
                    chip.classList.remove('skills-grid__chip--active');
                }
            });
        }

        document.querySelectorAll('#modal-skills-grid .skills-grid__chip').forEach(function (chip) {
            chip.addEventListener('click', function () {
                var skill = chip.dataset.skill;
                if (_modalSkills.indexOf(skill) !== -1) {
                    _modalSkills = _modalSkills.filter(function (s) { return s !== skill; });
                } else {
                    if (_modalSkills.length >= 20) { UI.toast('Maximum 20 skills', 'warning'); return; }
                    _modalSkills.push(skill);
                }
                renderModalSkills();
                updateChips();
            });
        });

        var skillField = document.getElementById('modal-skill-field');
        if (skillField) {
            skillField.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    var val = skillField.value.trim();
                    if (!val) return;
                    if (_modalSkills.length >= 20) { UI.toast('Maximum 20 skills', 'warning'); return; }
                    if (_modalSkills.indexOf(val) === -1) {
                        _modalSkills.push(val);
                        renderModalSkills();
                        updateChips();
                    }
                    skillField.value = '';
                }
            });
        }

        var saveBtn = document.getElementById('save-skills-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async function () {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<div class="btn-spinner"></div> Saving...';

                var lookingEl = document.getElementById('modal-looking');
                var looking = lookingEl ? lookingEl.value === 'true' : false;

                try {
                    var upsertData = {
                        user_id: Auth.user.id,
                        skills: _modalSkills,
                        looking_for_work: looking,
                        updated_at: new Date().toISOString()
                    };

                    var result = await window.supabaseClient
                        .from('user_skills')
                        .upsert(upsertData, { onConflict: 'user_id' });

                    if (result.error) throw result.error;

                    state.userSkills = upsertData;
                    UI.toast('Skills saved! We\'ll show you matching jobs.', 'success');
                    UI.closeModal();
                    computeMatchScores();
                    showMatchBanner();
                    showAISuggestions();
                } catch (err) {
                    UI.toast('Failed to save skills: ' + err.message, 'error');
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save Skills';
                }
            });
        }
    }

    // ── Filter by Match ──────────────────────
    function filterByMatch() {
        state.filteredJobs = state.jobs.filter(function (j) {
            return (state.matchScores[j.id] || 0) >= 50;
        });
        state.filteredJobs.sort(function (a, b) {
            return (state.matchScores[b.id] || 0) - (state.matchScores[a.id] || 0);
        });
        state.page = 1;
        renderJobList();
        UI.toast('Showing jobs matching your skills', 'info');
    }

    // ── Demo Jobs (when DB not ready) ────────
    function getDemoJobs() {
        var now = new Date();
        return [
            {
                id: 'demo-1', title: 'Senior Discord Community Manager', company_name: 'Apex Gaming Hub',
                description: '## About the Role\nWe\'re looking for an experienced Discord Community Manager to lead our gaming community of 50,000+ members.\n\n## Responsibilities\n- Manage and moderate Discord server with 50k+ members\n- Create engaging events and activities\n- Coordinate with content team on community initiatives\n- Handle escalations and conflict resolution\n\n## Required Skills\n- 2+ years Discord moderation experience\n- Excellent communication skills\n- Gaming community knowledge\n- Available evenings and weekends',
                salary_min: 3000, salary_max: 4500, salary_currency: 'USD', job_type: 'full-time',
                category: 'community', ai_category: 'community', location: 'Remote', is_remote: true,
                location_type: 'remote', region: 'worldwide', platform: ['discord'], language: ['en'],
                contact_link: '#', status: 'active', is_promoted: true, promoted_until: new Date(now.getTime() + 86400000).toISOString(),
                views: 234, applications_count: 12, skills_required: ['discord', 'community management', 'moderation', 'gaming'],
                created_at: new Date(now.getTime() - 7200000).toISOString()
            },
            {
                id: 'demo-2', title: 'UI/UX Designer for Web3 Platform', company_name: 'DeFi Traders Network',
                description: '## Overview\nJoin our team as a UI/UX Designer to create beautiful interfaces for our DeFi trading platform.\n\n## Responsibilities\n- Design user interfaces for web and mobile\n- Create wireframes and prototypes\n- Conduct user research and testing\n- Collaborate with development team\n\n## Required Skills\n- Proficiency in Figma\n- Understanding of Web3/DeFi concepts\n- Portfolio demonstrating UI/UX work\n- 3+ years design experience',
                salary_min: 4000, salary_max: 6000, salary_currency: 'USD', job_type: 'full-time',
                category: 'design', ai_category: 'design', location: 'Remote', is_remote: true,
                location_type: 'remote', region: 'worldwide', platform: ['discord', 'slack'], language: ['en'],
                contact_link: '#', status: 'active', is_promoted: true, promoted_until: new Date(now.getTime() + 86400000).toISOString(),
                views: 456, applications_count: 28, skills_required: ['figma', 'ui design', 'ux design', 'web3', 'prototyping'],
                created_at: new Date(now.getTime() - 14400000).toISOString()
            },
            {
                id: 'demo-3', title: 'Telegram Bot Developer', company_name: 'Crypto Signals Pro',
                description: '## About\nWe need a developer to build and maintain Telegram bots for our crypto signals community.\n\n## Requirements\n- Experience with Telegram Bot API\n- Python or Node.js proficiency\n- Understanding of cryptocurrency markets\n- Ability to handle real-time data',
                salary_min: 2000, salary_max: 3500, salary_currency: 'USD', job_type: 'freelance',
                category: 'programming', ai_category: 'programming', location: 'Remote', is_remote: true,
                location_type: 'remote', region: 'worldwide', platform: ['telegram'], language: ['en'],
                contact_link: '#', status: 'active', is_promoted: false,
                views: 189, applications_count: 15, skills_required: ['python', 'node.js', 'telegram api', 'cryptocurrency'],
                created_at: new Date(now.getTime() - 28800000).toISOString()
            },
            {
                id: 'demo-4', title: 'Social Media Content Writer', company_name: 'NFT Collective',
                description: '## Role\nCreate compelling content for our NFT community across multiple social platforms.\n\n## What You\'ll Do\n- Write daily social media posts\n- Create blog articles about NFT trends\n- Manage content calendar\n- Engage with community through content',
                salary_min: 1500, salary_max: 2500, salary_currency: 'USD', job_type: 'part-time',
                category: 'writing', ai_category: 'writing', location: 'Remote', is_remote: true,
                location_type: 'remote', region: 'worldwide', platform: ['twitter', 'discord'], language: ['en'],
                contact_link: '#', status: 'active', is_promoted: false,
                views: 312, applications_count: 42, skills_required: ['content writing', 'social media', 'nft', 'copywriting'],
                created_at: new Date(now.getTime() - 43200000).toISOString()
            },
            {
                id: 'demo-5', title: 'Growth Marketing Manager', company_name: 'Web3 Startup',
                description: '## About\nLead our growth marketing efforts across all channels.\n\n## Responsibilities\n- Develop and execute growth strategies\n- Manage paid advertising campaigns\n- Optimize conversion funnels\n- Analyze metrics and report on KPIs',
                salary_min: 3500, salary_max: 5500, salary_currency: 'USD', job_type: 'full-time',
                category: 'marketing', ai_category: 'marketing', location: 'New York', is_remote: false,
                location_type: 'hybrid', region: null, platform: ['slack'], language: ['en'],
                contact_link: '#', status: 'active', is_promoted: true,
                views: 267, applications_count: 19, skills_required: ['digital marketing', 'seo', 'paid ads', 'analytics', 'growth hacking'],
                created_at: new Date(now.getTime() - 86400000).toISOString()
            },
            {
                id: 'demo-6', title: 'WhatsApp Community Moderator', company_name: 'Designers Hub',
                description: '## Role\nModerate our growing WhatsApp design community.\n\n## Requirements\n- Active WhatsApp user\n- Knowledge of design industry\n- Available during business hours\n- Excellent communication in English and Arabic',
                salary_min: 500, salary_max: 800, salary_currency: 'USD', job_type: 'part-time',
                category: 'community', ai_category: 'community', location: 'Remote', is_remote: true,
                location_type: 'remote', region: 'mena', platform: ['whatsapp'], language: ['en', 'ar'],
                contact_link: '#', status: 'active', is_promoted: false,
                views: 145, applications_count: 33, skills_required: ['whatsapp', 'moderation', 'design knowledge', 'bilingual'],
                created_at: new Date(now.getTime() - 172800000).toISOString()
            },
            {
                id: 'demo-7', title: 'Full-Stack Developer (React + Node)', company_name: 'SaaS Platform',
                description: '## About\nBuild features for our community management SaaS platform.\n\n## Tech Stack\n- React, TypeScript, TailwindCSS\n- Node.js, Express, PostgreSQL\n- Docker, AWS\n\n## Requirements\n- 3+ years full-stack experience\n- Strong TypeScript skills\n- API design experience',
                salary_min: 5000, salary_max: 8000, salary_currency: 'USD', job_type: 'full-time',
                category: 'programming', ai_category: 'programming', location: 'Berlin', is_remote: false,
                location_type: 'onsite', region: null, platform: ['slack', 'discord'], language: ['en', 'de'],
                contact_link: '#', status: 'active', is_promoted: false,
                views: 521, applications_count: 37, skills_required: ['react', 'node.js', 'typescript', 'postgresql', 'docker'],
                created_at: new Date(now.getTime() - 259200000).toISOString()
            },
            {
                id: 'demo-8', title: 'Logo & Brand Identity Designer', company_name: 'Crypto Exchange',
                description: '## Project\nDesign a complete brand identity for our new crypto exchange.\n\n## Deliverables\n- Logo design (multiple concepts)\n- Brand guidelines document\n- Social media kit\n- Icon set',
                salary_min: 1000, salary_max: 2000, salary_currency: 'USD', job_type: 'contract',
                category: 'design', ai_category: 'design', location: 'Remote', is_remote: true,
                location_type: 'remote', region: 'worldwide', platform: ['telegram', 'discord'], language: ['en'],
                contact_link: '#', status: 'active', is_promoted: false,
                views: 198, applications_count: 25, skills_required: ['logo design', 'brand identity', 'illustrator', 'photoshop'],
                created_at: new Date(now.getTime() - 345600000).toISOString()
            },
            {
                id: 'demo-9', title: 'SEO Specialist', company_name: 'Digital Agency Pro',
                description: '## About\nOptimize our clients\' websites for maximum search visibility.\n\n## Responsibilities\n- Keyword research and strategy\n- On-page and technical SEO\n- Link building campaigns\n- Monthly reporting and analytics',
                salary_min: 2000, salary_max: 3500, salary_currency: 'USD', job_type: 'freelance',
                category: 'marketing', ai_category: 'marketing', location: 'Remote', is_remote: true,
                location_type: 'remote', region: 'eu', platform: ['slack'], language: ['en', 'fr'],
                contact_link: '#', status: 'active', is_promoted: false,
                views: 178, applications_count: 22, skills_required: ['seo', 'google analytics', 'content strategy', 'link building'],
                created_at: new Date(now.getTime() - 432000000).toISOString()
            },
            {
                id: 'demo-10', title: 'Video Editor for YouTube Channel', company_name: 'Tech Reviews Inc',
                description: '## Role\nEdit tech review videos for our growing YouTube channel (500K+ subscribers).\n\n## Requirements\n- Premiere Pro / DaVinci Resolve\n- Motion graphics skills\n- Quick turnaround (2-3 day delivery)\n- Understanding of YouTube trends',
                salary_min: 1500, salary_max: 2500, salary_currency: 'USD', job_type: 'freelance',
                category: 'design', ai_category: 'design', location: 'Remote', is_remote: true,
                location_type: 'remote', region: 'us', platform: ['discord', 'reddit'], language: ['en', 'es'],
                contact_link: '#', status: 'active', is_promoted: false,
                views: 289, applications_count: 45, skills_required: ['video editing', 'premiere pro', 'motion graphics', 'youtube'],
                created_at: new Date(now.getTime() - 518400000).toISOString()
            }
        ];
    }

    // ── Post Job: AI Enhance ─────────────────
    async function enhanceDescription(title, description) {
        try {
            var res = await fetch('/api/jobs-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'enhance',
                    title: title,
                    description: description
                })
            });

            if (!res.ok) throw new Error('API error');
            return await res.json();
        } catch (err) {
            console.error('AI enhance error:', err);
            return { enhanced: false, message: 'AI enhancement temporarily unavailable', description: description };
        }
    }

    // ── Post Job: AI Validate ────────────────
    async function validateJob(title, description) {
        try {
            var res = await fetch('/api/jobs-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'validate',
                    title: title,
                    description: description
                })
            });

            if (!res.ok) throw new Error('API error');
            return await res.json();
        } catch (err) {
            console.error('AI validate error:', err);
            return { valid: true, message: '', category: 'other' };
        }
    }

    // ── Post Job: Submit ─────────────────────
    async function submitJob(jobData) {
        if (!Auth.isLoggedIn()) {
            UI.authModal('signin');
            return { success: false, message: 'Please sign in first' };
        }

        try {
            var validation = await validateJob(jobData.title, jobData.description);
            if (!validation.valid) {
                return { success: false, message: validation.message || 'Job posting was flagged by our AI filter' };
            }

            var row = {
                poster_id: Auth.user.id,
                title: jobData.title,
                description: jobData.description,
                company_name: jobData.company_name || '',
                salary_min: jobData.salary_min || null,
                salary_max: jobData.salary_max || null,
                salary_currency: jobData.salary_currency || 'USD',
                job_type: jobData.job_type || 'full-time',
                category: validation.category || jobData.category || 'other',
                ai_category: validation.category || null,
                location: jobData.location || '',
                is_remote: jobData.location_type === 'remote',
                location_type: jobData.location_type || 'remote',
                region: jobData.region || 'worldwide',
                platform: jobData.platform || [],
                language: jobData.language || ['en'],
                contact_link: jobData.contact_link || '',
                contact_email: jobData.contact_email || '',
                skills_required: jobData.skills_required || [],
                status: 'pending'
            };

            var result = await window.supabaseClient
                .from('jobs')
                .insert([row])
                .select()
                .single();

            if (result.error) throw result.error;

            return { success: true, message: 'Job posted successfully! It will be reviewed shortly.', job: result.data };
        } catch (err) {
            console.error('Submit job error:', err);
            return { success: false, message: 'Failed to post job: ' + err.message };
        }
    }

    // ── Init Filter Chips ────────────────────
    function initFilterChips() {
        var allChips = document.querySelectorAll('.jobs-chip');
        allChips.forEach(function (chip) {
            chip.addEventListener('click', function () {
                var filterType = chip.dataset.filter;
                var value = chip.dataset.value;

                // Deactivate siblings
                var parent = chip.closest('.jobs-filter-group__chips');
                if (parent) {
                    parent.querySelectorAll('.jobs-chip').forEach(function (c) {
                        c.classList.remove('jobs-chip--active');
                    });
                }
                chip.classList.add('jobs-chip--active');

                // Update filter state
                state.filters[filterType] = value;
                filterJobs();

                // Update extra-filter badge count
                updateExtraFilterCount();
            });
        });
    }

    // ── Collapsible "More Filters" toggle ────
    function initFilterToggle() {
        var toggleBtn = document.getElementById('btn-toggle-filters');
        var extraPanel = document.getElementById('extra-filters');
        var clearBtn = document.getElementById('btn-clear-filters');
        if (!toggleBtn || !extraPanel) return;

        toggleBtn.addEventListener('click', function () {
            var isOpen = extraPanel.style.display !== 'none';
            extraPanel.style.display = isOpen ? 'none' : '';
            toggleBtn.classList.toggle('jobs-filter-toggle--open', !isOpen);
            var label = document.getElementById('toggle-filters-label');
            if (label) label.textContent = isOpen ? 'More Filters' : 'Less Filters';
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                // Reset every chip inside the extra panel to "All"
                var groups = extraPanel.querySelectorAll('.jobs-filter-group__chips');
                groups.forEach(function (g) {
                    g.querySelectorAll('.jobs-chip').forEach(function (c) {
                        c.classList.remove('jobs-chip--active');
                    });
                    var first = g.querySelector('.jobs-chip');
                    if (first) {
                        first.classList.add('jobs-chip--active');
                        var filterType = first.dataset.filter;
                        if (filterType) state.filters[filterType] = '';
                    }
                });
                filterJobs();
                updateExtraFilterCount();
            });
        }
    }

    function updateExtraFilterCount() {
        var extraPanel = document.getElementById('extra-filters');
        var badge = document.getElementById('extra-filter-count');
        var clearBtn = document.getElementById('btn-clear-filters');
        if (!extraPanel || !badge) return;

        var count = 0;
        var groups = extraPanel.querySelectorAll('.jobs-filter-group__chips');
        groups.forEach(function (g) {
            var active = g.querySelector('.jobs-chip--active');
            if (active && active.dataset.value !== '') count++;
        });

        if (count > 0) {
            badge.textContent = count;
            badge.style.display = '';
            if (clearBtn) clearBtn.style.display = '';
        } else {
            badge.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'none';
        }
    }

    // ── Init ─────────────────────────────────
    function init() {
        // Bind search input
        var searchInput = document.getElementById('jobs-search');
        var loadMoreBtn = document.getElementById('btn-load-more');
        var postJobBtn = document.getElementById('btn-post-job');

        if (searchInput) {
            searchInput.addEventListener('input', UI.debounce(function () {
                state.filters.search = searchInput.value;
                filterJobs();
            }, 300));
        }

        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', function () {
                state.page++;
                renderJobList();
            });
        }

        if (postJobBtn) {
            postJobBtn.addEventListener('click', function () {
                if (!Auth.isLoggedIn()) {
                    UI.authModal('signin');
                    return;
                }
                window.location.href = '/post-job';
            });
        }

        // Init filter chips & collapsible toggle
        initFilterChips();
        initFilterToggle();

        // Load jobs
        loadJobs();
    }

    // ── Public API ───────────────────────────
    return {
        init: init,
        loadJobs: loadJobs,
        filterByMatch: filterByMatch,
        openSkillsModal: openSkillsModal,
        applyToJob: applyToJob,
        openQuickQuestion: openQuickQuestion,
        openReportModal: openReportModal,
        enhanceDescription: enhanceDescription,
        validateJob: validateJob,
        submitJob: submitJob,
        showJobDetail: showJobDetail,
        toggleSaveJob: toggleSaveJob,
        shareJob: shareJob,
        showCardMenu: showCardMenu,
        CATEGORY_ICONS: CATEGORY_ICONS,
        CATEGORY_LABELS: CATEGORY_LABELS,
        JOB_TYPE_LABELS: JOB_TYPE_LABELS,
        LOCATION_TYPE_LABELS: LOCATION_TYPE_LABELS,
        PLATFORM_LABELS: PLATFORM_LABELS,
        LANGUAGE_LABELS: LANGUAGE_LABELS,
        REGION_LABELS: REGION_LABELS,
        formatSalary: formatSalary,
        timeAgo: timeAgo
    };
})();
