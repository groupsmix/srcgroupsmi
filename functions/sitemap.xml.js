/**
 * /sitemap.xml — Dynamic Sitemap Generator (Cloudflare Function)
 *
 * Generates a sitemap that includes:
 *   - All static pages
 *   - Dynamic group profile pages from Supabase
 *   - Dynamic job listings from Supabase
 *
 * Cached for 1 hour to avoid excessive DB queries.
 */

// Astro routes are derived directly from `src/pages/`, so URL paths do NOT
// include a `/pages/` prefix. The entries below mirror the real canonical
// routes served by the app. Keep this list in sync with the flat pages in
// `src/pages/` and the known subroutes in `src/pages/tools/`.
const STATIC_PAGES = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/search', priority: '0.9', changefreq: 'daily' },
    { loc: '/jobs', priority: '0.8', changefreq: 'daily' },
    { loc: '/marketplace', priority: '0.8', changefreq: 'daily' },
    { loc: '/submit', priority: '0.7', changefreq: 'monthly' },
    { loc: '/sell', priority: '0.7', changefreq: 'monthly' },
    { loc: '/store', priority: '0.7', changefreq: 'weekly' },
    { loc: '/about', priority: '0.5', changefreq: 'monthly' },
    { loc: '/post-job', priority: '0.6', changefreq: 'monthly' },
    { loc: '/advertise', priority: '0.5', changefreq: 'monthly' },
    { loc: '/donate', priority: '0.5', changefreq: 'monthly' },
    { loc: '/newsletter', priority: '0.5', changefreq: 'monthly' },
    { loc: '/leaderboard', priority: '0.6', changefreq: 'weekly' },
    { loc: '/articles', priority: '0.6', changefreq: 'weekly' },
    { loc: '/platform', priority: '0.7', changefreq: 'weekly' },
    { loc: '/category', priority: '0.7', changefreq: 'weekly' },
    { loc: '/country', priority: '0.7', changefreq: 'weekly' },
    { loc: '/scam-wall', priority: '0.5', changefreq: 'weekly' },
    { loc: '/stats', priority: '0.5', changefreq: 'weekly' },
    { loc: '/tools', priority: '0.7', changefreq: 'monthly' },
    { loc: '/tools/group-rules-generator', priority: '0.6', changefreq: 'monthly' },
    { loc: '/tools/viral-post', priority: '0.6', changefreq: 'monthly' },
    { loc: '/tools/privacy-auditor', priority: '0.6', changefreq: 'monthly' },
    { loc: '/tools/cover-designer', priority: '0.6', changefreq: 'monthly' },
    { loc: '/tools/link-generator', priority: '0.6', changefreq: 'monthly' },
    { loc: '/tools/whatsapp-direct', priority: '0.6', changefreq: 'monthly' },
    { loc: '/tools/group-scorecard', priority: '0.6', changefreq: 'monthly' },
    { loc: '/tools/invite-link-checker', priority: '0.6', changefreq: 'monthly' },
    { loc: '/tools/link-health-monitor', priority: '0.6', changefreq: 'monthly' },
    { loc: '/tools/post-formatter', priority: '0.6', changefreq: 'monthly' },
    { loc: '/tools/compare-groups', priority: '0.6', changefreq: 'monthly' },
    { loc: '/tools/group-creator', priority: '0.6', changefreq: 'monthly' },
    { loc: '/tools/embed-widget', priority: '0.6', changefreq: 'monthly' },
    { loc: '/tools/review-widget', priority: '0.6', changefreq: 'monthly' },
    { loc: '/tools/bot-setup', priority: '0.6', changefreq: 'monthly' },
    { loc: '/terms', priority: '0.3', changefreq: 'yearly' },
    { loc: '/privacy', priority: '0.3', changefreq: 'yearly' },
    { loc: '/faq', priority: '0.4', changefreq: 'monthly' },
    { loc: '/contact', priority: '0.4', changefreq: 'yearly' },
    { loc: '/support', priority: '0.4', changefreq: 'yearly' }
];

function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function formatDate(dateStr) {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    try {
        return new Date(dateStr).toISOString().split('T')[0];
    } catch (e) {
        return new Date().toISOString().split('T')[0];
    }
}

export async function onRequest(context) {
    const { env } = context;
    const baseUrl = 'https://groupsmix.com';
    var today = new Date().toISOString().split('T')[0];

    // Build static URLs
    var urls = STATIC_PAGES.map(function (page) {
        return '  <url>\n' +
            '    <loc>' + baseUrl + escapeXml(page.loc) + '</loc>\n' +
            '    <lastmod>' + today + '</lastmod>\n' +
            '    <changefreq>' + page.changefreq + '</changefreq>\n' +
            '    <priority>' + page.priority + '</priority>\n' +
            '  </url>';
    });

    // Fetch approved groups from Supabase. If env is missing, skip the
    // dynamic section and return only the static pages rather than leaking
    // hardcoded credentials from the repo.
    var supabaseUrl = env?.SUPABASE_URL;
    var anonKey = env?.SUPABASE_ANON_KEY;
    var canFetchDynamic = Boolean(supabaseUrl && anonKey);

    if (!canFetchDynamic) {
        console.warn('sitemap.xml: SUPABASE_URL or SUPABASE_ANON_KEY not set — emitting static pages only');
    }

    try {
        if (!canFetchDynamic) throw new Error('dynamic-disabled');
        // Fetch groups (id and updated_at for sitemap)
        var groupsRes = await fetch(
            supabaseUrl + '/rest/v1/groups?select=id,updated_at&status=eq.approved&order=updated_at.desc&limit=5000',
            {
                headers: {
                    'apikey': anonKey,
                    'Authorization': 'Bearer ' + anonKey
                }
            }
        );
        if (groupsRes.ok) {
            var groups = await groupsRes.json();
            for (var i = 0; i < groups.length; i++) {
                urls.push(
                    '  <url>\n' +
                    '    <loc>' + baseUrl + '/groups/profile?id=' + escapeXml(groups[i].id) + '</loc>\n' +
                    '    <lastmod>' + formatDate(groups[i].updated_at) + '</lastmod>\n' +
                    '    <changefreq>weekly</changefreq>\n' +
                    '    <priority>0.6</priority>\n' +
                    '  </url>'
                );
            }
        }
    } catch (e) {
        console.error('Sitemap: failed to fetch groups:', e);
    }

    try {
        if (!canFetchDynamic) throw new Error('dynamic-disabled');
        // Fetch active jobs
        var jobsRes = await fetch(
            supabaseUrl + '/rest/v1/jobs?select=id,updated_at&status=eq.active&order=updated_at.desc&limit=2000',
            {
                headers: {
                    'apikey': anonKey,
                    'Authorization': 'Bearer ' + anonKey
                }
            }
        );
        if (jobsRes.ok) {
            var jobs = await jobsRes.json();
            for (var j = 0; j < jobs.length; j++) {
                urls.push(
                    '  <url>\n' +
                    '    <loc>' + baseUrl + '/jobs?id=' + escapeXml(jobs[j].id) + '</loc>\n' +
                    '    <lastmod>' + formatDate(jobs[j].updated_at) + '</lastmod>\n' +
                    '    <changefreq>weekly</changefreq>\n' +
                    '    <priority>0.5</priority>\n' +
                    '  </url>'
                );
            }
        }
    } catch (e) {
        console.error('Sitemap: failed to fetch jobs:', e);
    }

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.join('\n') + '\n' +
        '</urlset>';

    return new Response(xml, {
        status: 200,
        headers: {
            'Content-Type': 'application/xml',
            'Cache-Control': 'public, max-age=3600'
        }
    });
}
