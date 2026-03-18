/**
 * /api/weekly-digest — Weekly Email Digest API
 *
 * POST /api/weekly-digest { action: "generate" }     — Generate digest content
 * POST /api/weekly-digest { action: "send" }          — Send digests to pending subscribers
 * POST /api/weekly-digest { action: "preview", category: "crypto" } — Preview digest
 *
 * Generates "Top 5 trending groups this week" segmented by user interests.
 * Designed to be called by cron scheduler weekly.
 */

const ALLOWED_ORIGINS = ['https://groupsmix.com', 'https://www.groupsmix.com'];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cron-Secret',
        'Content-Type': 'application/json'
    };
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
            status: 405, headers: corsHeaders(origin)
        });
    }

    const supabaseUrl = env?.SUPABASE_URL || 'https://hmlqppacanpxmrfdlkec.supabase.co';
    const supabaseKey = env?.SUPABASE_SERVICE_KEY || env?.SUPABASE_ANON_KEY || '';

    if (!supabaseKey) {
        return new Response(JSON.stringify({ ok: false, error: 'Server not configured' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }

    var body;
    try { body = await request.json(); } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    var action = body.action || 'generate';

    try {
        switch (action) {
            case 'preview':
            case 'generate': {
                var category = body.category || null;
                var limit = Math.min(parseInt(body.limit) || 5, 10);
                var days = parseInt(body.days) || 7;

                // Get trending content for digest
                var contentRes = await fetch(supabaseUrl + '/rest/v1/rpc/get_digest_content', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({ p_category: category, p_limit: limit, p_days: days })
                });

                var content = [];
                if (contentRes.ok) {
                    content = await contentRes.json();
                } else {
                    // Fallback: get top groups by views
                    var fbRes = await fetch(
                        supabaseUrl + '/rest/v1/groups?status=eq.approved&order=views.desc&limit=' + limit +
                        (category ? '&category=eq.' + encodeURIComponent(category) : '') +
                        '&select=id,name,platform,category,description,members_count,trust_score,avg_rating,review_count,views',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                    );
                    content = await fbRes.json();
                }

                // Generate email HTML
                var subject = category
                    ? 'Top ' + limit + ' Trending ' + category.charAt(0).toUpperCase() + category.slice(1) + ' Groups This Week'
                    : 'Top ' + limit + ' Trending Groups This Week on GroupsMix';

                var emailHtml = generateDigestHtml(content, subject, days);

                return new Response(JSON.stringify({
                    ok: true,
                    subject: subject,
                    groups: content,
                    html: emailHtml,
                    count: content.length,
                    category: category,
                    period_days: days
                }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            case 'send': {
                var batchSize = Math.min(parseInt(body.batch_size) || 50, 100);

                // Get pending subscribers
                var subsRes = await fetch(supabaseUrl + '/rest/v1/rpc/get_pending_digest_subscribers', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({ p_limit: batchSize })
                });

                var subscribers = subsRes.ok ? await subsRes.json() : [];

                if (!subscribers || !subscribers.length) {
                    return new Response(JSON.stringify({
                        ok: true,
                        message: 'No pending subscribers for digest',
                        sent: 0
                    }), { status: 200, headers: corsHeaders(origin) });
                }

                // Get general digest content
                var generalRes = await fetch(supabaseUrl + '/rest/v1/rpc/get_digest_content', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({ p_category: null, p_limit: 5, p_days: 7 })
                });
                var generalContent = generalRes.ok ? await generalRes.json() : [];
                var contentIds = generalContent.map(function(g) { return g.id; });

                // Log each digest as sent
                var sentCount = 0;
                for (var i = 0; i < subscribers.length; i++) {
                    var sub = subscribers[i];
                    try {
                        await fetch(supabaseUrl + '/rest/v1/rpc/log_digest_sent', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': supabaseKey,
                                'Authorization': 'Bearer ' + supabaseKey
                            },
                            body: JSON.stringify({
                                p_email: sub.email,
                                p_content_ids: contentIds,
                                p_digest_type: 'weekly'
                            })
                        });
                        sentCount++;
                    } catch (e) {
                        console.error('Failed to log digest for', sub.email, e);
                    }
                }

                return new Response(JSON.stringify({
                    ok: true,
                    sent: sentCount,
                    total_subscribers: subscribers.length,
                    content_count: generalContent.length,
                    message: 'Digest logged for ' + sentCount + ' subscribers. Use your email provider to send the actual emails.'
                }), { status: 200, headers: corsHeaders(origin) });
            }

            default:
                return new Response(JSON.stringify({ ok: false, error: 'Unknown action: ' + action }), {
                    status: 400, headers: corsHeaders(origin)
                });
        }
    } catch (err) {
        console.error('weekly-digest error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}

function generateDigestHtml(groups, subject, days) {
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
    html += '<meta name="viewport" content="width=device-width,initial-scale=1">';
    html += '<title>' + escapeHtml(subject) + '</title>';
    html += '<style>';
    html += 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:0;background:#0a0a0a;color:#e0e0e0}';
    html += '.container{max-width:600px;margin:0 auto;padding:24px}';
    html += '.header{text-align:center;padding:24px 0;border-bottom:1px solid #222}';
    html += '.header h1{font-size:20px;margin:0 0 8px}';
    html += '.header p{color:#888;font-size:14px;margin:0}';
    html += '.group-card{background:#111;border:1px solid #222;border-radius:12px;padding:20px;margin:16px 0}';
    html += '.group-card h3{margin:0 0 8px;font-size:16px}';
    html += '.group-card .meta{color:#888;font-size:13px;margin-bottom:8px}';
    html += '.group-card .desc{color:#aaa;font-size:14px;margin-bottom:12px}';
    html += '.group-card .stats{display:flex;gap:16px;font-size:13px;color:#888}';
    html += '.group-card .cta{display:inline-block;background:#6366f1;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px;margin-top:8px}';
    html += '.footer{text-align:center;padding:24px 0;color:#666;font-size:12px;border-top:1px solid #222;margin-top:24px}';
    html += '.rank{display:inline-block;background:#6366f1;color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:bold;margin-right:8px}';
    html += '</style></head><body>';
    html += '<div class="container">';
    html += '<div class="header">';
    html += '<h1>' + escapeHtml(subject) + '</h1>';
    html += '<p>The hottest communities from the past ' + days + ' days</p>';
    html += '</div>';

    for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        html += '<div class="group-card">';
        html += '<h3><span class="rank">' + (i + 1) + '</span>' + escapeHtml(g.name || 'Group') + '</h3>';
        html += '<div class="meta">' + escapeHtml(g.platform || '') + ' &middot; ' + escapeHtml(g.category || '') + '</div>';
        if (g.description) {
            html += '<div class="desc">' + escapeHtml((g.description || '').slice(0, 150)) + '</div>';
        }
        html += '<div class="stats">';
        html += '<span>Trust: ' + (g.trust_score || 0) + '/100</span>';
        html += '<span>Rating: ' + (parseFloat(g.avg_rating) || 0).toFixed(1) + '</span>';
        html += '<span>Reviews: ' + (g.review_count || 0) + '</span>';
        html += '</div>';
        html += '<a href="https://groupsmix.com/group?id=' + g.id + '" class="cta">View Group</a>';
        html += '</div>';
    }

    html += '<div class="footer">';
    html += '<p>You\'re receiving this because you subscribed to GroupsMix weekly digest.</p>';
    html += '<p><a href="https://groupsmix.com/newsletter?action=unsubscribe" style="color:#6366f1">Unsubscribe</a></p>';
    html += '</div></div></body></html>';

    return html;
}

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
