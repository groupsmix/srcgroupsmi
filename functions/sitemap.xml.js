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

const SUPABASE_URL_FALLBACK = 'https://hmlqppacanpxmrfdlkec.supabase.co';

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
    { loc: '/pages/tools/', priority: '0.7', changefreq: 'monthly' },
    { loc: '/pages/tools/name-generator', priority: '0.6', changefreq: 'monthly' },
    { loc: '/pages/tools/group-rules-generator', priority: '0.6', changefreq: 'monthly' },
    { loc: '/pages/tools/viral-post', priority: '0.6', changefreq: 'monthly' },
    { loc: '/pages/tools/scam-detector', priority: '0.6', changefreq: 'monthly' },
    { loc: '/pages/tools/group-health-analyzer', priority: '0.6', changefreq: 'monthly' },
    { loc: '/pages/tools/privacy-auditor', priority: '0.6', changefreq: 'monthly' },
    { loc: '/pages/tools/bio-generator', priority: '0.6', changefreq: 'monthly' },
    { loc: '/pages/tools/cover-designer', priority: '0.6', changefreq: 'monthly' },
    { loc: '/pages/tools/link-generator', priority: '0.6', changefreq: 'monthly' },
    { loc: '/pages/tools/whatsapp-direct', priority: '0.6', changefreq: 'monthly' },
    { loc: '/pages/browse/', priority: '0.7', changefreq: 'weekly' },
    { loc: '/pages/browse/platform', priority: '0.7', changefreq: 'weekly' },
    { loc: '/pages/browse/category', priority: '0.7', changefreq: 'weekly' },
    { loc: '/pages/browse/country', priority: '0.7', changefreq: 'weekly' },
    { loc: '/pages/boards/leaderboard', priority: '0.6', changefreq: 'weekly' },
    { loc: '/pages/content/articles', priority: '0.6', changefreq: 'weekly' },
    { loc: '/pages/promote/', priority: '0.5', changefreq: 'monthly' },
    { loc: '/pages/promote/advertise', priority: '0.5', changefreq: 'monthly' },
    { loc: '/pages/promote/donate', priority: '0.5', changefreq: 'monthly' },
    { loc: '/pages/legal/about', priority: '0.3', changefreq: 'yearly' },
    { loc: '/pages/legal/terms', priority: '0.3', changefreq: 'yearly' },
    { loc: '/pages/legal/privacy', priority: '0.3', changefreq: 'yearly' },
    { loc: '/pages/legal/faq', priority: '0.4', changefreq: 'monthly' },
    { loc: '/pages/legal/contact', priority: '0.4', changefreq: 'yearly' },
    { loc: '/pages/legal/support', priority: '0.4', changefreq: 'yearly' },
    { loc: '/pages/trust/stats', priority: '0.5', changefreq: 'weekly' }
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

    // Fetch approved groups from Supabase
    var supabaseUrl = env?.SUPABASE_URL || SUPABASE_URL_FALLBACK;
    var anonKey = env?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtbHFwcGFjYW5weG1yZmRsa2VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDkxMTUsImV4cCI6MjA4NzkyNTExNX0.xRDweHu4st7Hk--lQyLYlRU5ufUsXWbArvsIjVznr9o';

    try {
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
                    '    <loc>' + baseUrl + '/pages/groups/profile?id=' + escapeXml(groups[i].id) + '</loc>\n' +
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
