/**
 * /api/feed — Personalized Smart Feed API
 *
 * GET /api/feed?type=groups&user_id=X    — Personalized group feed
 * GET /api/feed?type=articles&user_id=X  — Personalized article feed
 * GET /api/feed?type=digest&user_id=X    — "What you missed" digest
 * GET /api/feed?type=trending            — Trending content (no auth needed)
 * POST /api/feed/implicit                — Record implicit feedback signals
 *
 * Combines 8 algorithm features:
 * 1. Already-seen filter (decay-based suppression)
 * 2. Collaborative filtering ("users who liked X also liked Y")
 * 3. Interest-based ranking (weighted personalized score)
 * 4. Exploration vs Exploitation (Thompson sampling bandit, ~12% explore)
 * 5. Session-aware rotation (fresh content on return)
 * 6. Trending/velocity scores (engagement per hour with exponential decay)
 * 7. Implicit feedback signals (dwell time, bounce rate, scroll depth)
 * 8. Re-engagement scoring (boost returning user's preferred categories)
 */

import { corsHeaders as _sharedCorsHeaders, handlePreflight } from './_shared/cors.js';
import { requireAuth } from './_shared/auth.js';

function corsHeaders(origin, method) {
    return _sharedCorsHeaders(origin, {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=60'
    });
}

function jsonResponse(data, status, origin) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: corsHeaders(origin)
    });
}

// Call a Supabase RPC function
async function callRpc(supabaseUrl, supabaseKey, fnName, params) {
    const res = await fetch(supabaseUrl + '/rest/v1/rpc/' + fnName, {
        method: 'POST',
        headers: {
            'apikey': supabaseKey,
            'Authorization': 'Bearer ' + supabaseKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(params)
    });

    if (!res.ok) {
        const errText = await res.text();
        console.error('RPC ' + fnName + ' error:', res.status, errText);
        return null;
    }

    return res.json();
}

// Query Supabase REST API
async function queryTable(supabaseUrl, supabaseKey, table, queryParams) {
    const res = await fetch(
        supabaseUrl + '/rest/v1/' + table + '?' + queryParams,
        {
            headers: {
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            }
        }
    );

    if (!res.ok) {
        console.error('Query ' + table + ' error:', res.status);
        return [];
    }

    return res.json();
}

// Get personalized group feed
async function getGroupFeed(supabaseUrl, supabaseKey, userId, limit, offset, explorationRatio) {
    // Try personalized feed via RPC
    const feed = await callRpc(supabaseUrl, supabaseKey, 'get_personalized_group_feed', {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
        p_exploration_ratio: explorationRatio
    });

    if (feed && feed.length > 0) {
        return {
            ok: true,
            feed_type: 'personalized',
            content_type: 'groups',
            items: feed.map((item) => {
                return {
                    id: item.group_id,
                    name: item.group_name,
                    platform: item.group_platform,
                    category: item.group_category,
                    country: item.group_country,
                    description: item.group_description,
                    trust_score: item.group_trust_score,
                    views: item.group_views,
                    clicks: item.group_clicks,
                    avg_rating: item.group_avg_rating,
                    review_count: item.group_review_count,
                    tags: item.group_tags,
                    link: item.group_link,
                    likes_count: item.group_likes_count,
                    feed_score: item.feed_score,
                    feed_reason: item.feed_reason,
                    is_trending: item.is_trending,
                    is_exploration: item.is_exploration
                };
            }),
            total: feed.length,
            algorithm: {
                exploitation_ratio: 1 - explorationRatio,
                exploration_ratio: explorationRatio
            }
        };
    }

    // Fallback: return trending groups if no personalized results
    const groups = await queryTable(supabaseUrl, supabaseKey, 'groups',
        'status=eq.approved&select=id,name,platform,category,country,description,trust_score,views,clicks,avg_rating,review_count,tags,link,likes_count&order=views.desc&limit=' + limit + '&offset=' + offset
    );

    return {
        ok: true,
        feed_type: 'popular',
        content_type: 'groups',
        items: groups || [],
        total: (groups || []).length,
        algorithm: { note: 'Fallback to popular — no user history yet' }
    };
}

// Get personalized article feed
async function getArticleFeed(supabaseUrl, supabaseKey, userId, limit, offset, explorationRatio) {
    const feed = await callRpc(supabaseUrl, supabaseKey, 'get_personalized_article_feed', {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
        p_exploration_ratio: explorationRatio
    });

    if (feed && feed.length > 0) {
        return {
            ok: true,
            feed_type: 'personalized',
            content_type: 'articles',
            items: feed.map((item) => {
                return {
                    id: item.article_id,
                    title: item.article_title,
                    slug: item.article_slug,
                    excerpt: item.article_excerpt,
                    category: item.article_category,
                    tags: item.article_tags,
                    image: item.article_image,
                    views: item.article_views,
                    like_count: item.article_like_count,
                    comment_count: item.article_comment_count,
                    tip_count: item.article_tip_count,
                    reading_time: item.article_reading_time,
                    published_at: item.article_published_at,
                    author_name: item.article_author_name,
                    author_avatar: item.article_author_avatar,
                    user_id: item.article_user_id,
                    feed_score: item.feed_score,
                    feed_reason: item.feed_reason,
                    is_trending: item.is_trending,
                    is_exploration: item.is_exploration
                };
            }),
            total: feed.length,
            algorithm: {
                exploitation_ratio: 1 - explorationRatio,
                exploration_ratio: explorationRatio
            }
        };
    }

    // Fallback: trending articles
    const articles = await queryTable(supabaseUrl, supabaseKey, 'articles',
        'status=eq.published&moderation_status=eq.approved&select=id,title,slug,excerpt,category,tags,image,views,like_count,comment_count,reading_time,published_at,author_name,author_avatar,user_id&order=published_at.desc&limit=' + limit + '&offset=' + offset
    );

    return {
        ok: true,
        feed_type: 'recent',
        content_type: 'articles',
        items: articles || [],
        total: (articles || []).length,
        algorithm: { note: 'Fallback to recent — no user history yet' }
    };
}

// Get "What you missed" digest
async function getDigest(supabaseUrl, supabaseKey, userId, days, limit) {
    const sessionGap = await callRpc(supabaseUrl, supabaseKey, 'get_session_gap_hours', {
        p_user_id: userId
    });

    const gapHours = (typeof sessionGap === 'number') ? sessionGap : 999;
    const digestDays = Math.max(Math.ceil(gapHours / 24), days);

    const groupsPromise = callRpc(supabaseUrl, supabaseKey, 'get_missed_digest_groups', {
        p_user_id: userId,
        p_days: digestDays,
        p_limit: limit
    });

    const articlesPromise = callRpc(supabaseUrl, supabaseKey, 'get_missed_digest_articles', {
        p_user_id: userId,
        p_days: digestDays,
        p_limit: limit
    });

    const results = await Promise.all([groupsPromise, articlesPromise]);

    return {
        ok: true,
        feed_type: 'digest',
        away_hours: Math.round(gapHours),
        away_days: Math.ceil(gapHours / 24),
        digest_window_days: digestDays,
        groups: results[0] || [],
        articles: results[1] || [],
        message: gapHours >= 168
            ? "Welcome back! Here's what happened while you were away"
            : gapHours >= 24
                ? "Here's what's trending since your last visit"
                : "Here's your latest digest"
    };
}

/* ── Record implicit feedback signals (dwell time, bounce rate, scroll depth) ── */
async function recordImplicitFeedback(supabaseUrl, supabaseKey, body) {
    const userId = body.user_id;
    const contentId = body.content_id;
    const contentType = body.content_type || 'group';
    if (!userId || !contentId) return { ok: false, error: 'user_id and content_id required' };

    const dwellSeconds = Math.max(0, Math.min(3600, parseInt(body.dwell_seconds) || 0));
    const scrollDepth = Math.max(0, Math.min(100, parseFloat(body.scroll_depth) || 0));
    const clicked = body.clicked === true || body.clicked === 'true';
    const bounced = dwellSeconds < 3 && !clicked;

    // Upsert implicit feedback into feed_impressions
    const res = await fetch(supabaseUrl + '/rest/v1/feed_impressions', {
        method: 'POST',
        headers: {
            'apikey': supabaseKey,
            'Authorization': 'Bearer ' + supabaseKey,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
            user_id: userId,
            content_id: contentId,
            content_type: contentType,
            dwell_seconds: dwellSeconds,
            scroll_depth: scrollDepth,
            clicked: clicked,
            bounced: bounced,
            created_at: new Date().toISOString()
        })
    });

    // Derive implicit interest signal from feedback
    let interestDelta = 0;
    if (clicked) interestDelta += 1;
    if (dwellSeconds > 30) interestDelta += 0.5;
    if (dwellSeconds > 120) interestDelta += 0.5;
    if (scrollDepth > 75) interestDelta += 0.3;
    if (bounced) interestDelta -= 0.5;

    // Update user interests if signal is significant
    if (Math.abs(interestDelta) >= 0.3) {
        await fetch(supabaseUrl + '/rest/v1/rpc/update_implicit_interest', {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                p_user_id: userId,
                p_content_id: contentId,
                p_content_type: contentType,
                p_delta: interestDelta
            })
        });
    }

    return {
        ok: true,
        recorded: {
            dwell_seconds: dwellSeconds,
            scroll_depth: scrollDepth,
            clicked: clicked,
            bounced: bounced,
            interest_delta: interestDelta
        }
    };
}

// Get trending content (no auth needed) with decay-aware scoring
async function getTrending(supabaseUrl, supabaseKey, contentType, limit) {
    let items = await queryTable(supabaseUrl, supabaseKey, 'trending_scores',
        'content_type=eq.' + encodeURIComponent(contentType) +
        '&order=velocity_score.desc&limit=' + limit +
        '&select=content_id,content_type,velocity_score,hourly_views,hourly_clicks,hourly_likes,hourly_joins,hourly_comments,hourly_tips,total_engagement,computed_at'
    );

    // Enrich with content details
    if (items && items.length > 0) {
        const ids = items.map((i) => { return i.content_id; });

        if (contentType === 'group') {
            const groups = await queryTable(supabaseUrl, supabaseKey, 'groups',
                'id=in.(' + ids.join(',') + ')&status=eq.approved&select=id,name,platform,category,country,description,trust_score,views,clicks,avg_rating,review_count,tags,link,likes_count'
            );
            const groupMap = {};
            (groups || []).forEach((g) => { groupMap[g.id] = g; });

            items = items.map((item) => {
                const group = groupMap[item.content_id] || {};
                return Object.assign({}, item, { details: group });
            }).filter((item) => { return item.details && item.details.id; });
        } else {
            const articles = await queryTable(supabaseUrl, supabaseKey, 'articles',
                'id=in.(' + ids.join(',') + ')&status=eq.published&moderation_status=eq.approved&select=id,title,slug,excerpt,category,tags,image,views,like_count,comment_count,reading_time,published_at,author_name,author_avatar'
            );
            const articleMap = {};
            (articles || []).forEach((a) => { articleMap[a.id] = a; });

            items = items.map((item) => {
                const article = articleMap[item.content_id] || {};
                return Object.assign({}, item, { details: article });
            }).filter((item) => { return item.details && item.details.id; });
        }
    }

    return {
        ok: true,
        feed_type: 'trending',
        content_type: contentType,
        items: items || [],
        total: (items || []).length
    };
}

export async function onRequest(context) {
    const request = context.request;
    const env = context.env;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return jsonResponse({ ok: false, error: 'Service not configured' }, 503, origin);
    }

    const url = new URL(request.url);
    const feedType = url.searchParams.get('type') || 'groups';
    const userId = url.searchParams.get('user_id');
    let limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 50);
    let offset = parseInt(url.searchParams.get('offset')) || 0;
    const explorationRatio = parseFloat(url.searchParams.get('exploration')) || 0.12;
    const contentType = url.searchParams.get('content_type') || 'group';

    try {
        // Handle implicit feedback recording (POST)
        if (request.method === 'POST') {
            let postBody;
            try { postBody = await request.json(); } catch (e) { postBody = {}; }

            if (postBody.action === 'implicit_feedback') {
                // Verify authentication and ownership for implicit feedback
                if (postBody.user_id) {
                    const fbAuth = await requireAuth(request, env, corsHeaders(origin));
                    if (fbAuth instanceof Response) return fbAuth;
                    const fbProfileRes = await fetch(
                        supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(fbAuth.user.id) + '&select=id&limit=1',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                    );
                    const fbProfiles = await fbProfileRes.json();
                    if (!fbProfiles || !fbProfiles.length || fbProfiles[0].id !== postBody.user_id) {
                        return jsonResponse({ ok: false, error: 'Forbidden: user_id mismatch' }, 403, origin);
                    }
                }
                const fbResult = await recordImplicitFeedback(supabaseUrl, supabaseKey, postBody);
                return jsonResponse(fbResult, fbResult.ok ? 200 : 400, origin);
            }

            return jsonResponse({ ok: false, error: 'Unknown POST action' }, 400, origin);
        }

        if (feedType === 'trending') {
            const result = await getTrending(supabaseUrl, supabaseKey, contentType, limit);
            return jsonResponse(result, 200, origin);
        }

        if (!userId) {
            return jsonResponse({ ok: false, error: 'user_id required for personalized feed' }, 400, origin);
        }

        // Verify authentication and ownership for personalized feed
        const feedAuth = await requireAuth(request, env, corsHeaders(origin));
        if (feedAuth instanceof Response) return feedAuth;
        const feedProfileRes = await fetch(
            supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(feedAuth.user.id) + '&select=id&limit=1',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const feedProfiles = await feedProfileRes.json();
        if (!feedProfiles || !feedProfiles.length || feedProfiles[0].id !== userId) {
            return jsonResponse({ ok: false, error: 'Forbidden: user_id mismatch' }, 403, origin);
        }

        if (feedType === 'groups') {
            const result = await getGroupFeed(supabaseUrl, supabaseKey, userId, limit, offset, explorationRatio);
            return jsonResponse(result, 200, origin);
        }

        if (feedType === 'articles') {
            const result = await getArticleFeed(supabaseUrl, supabaseKey, userId, limit, offset, explorationRatio);
            return jsonResponse(result, 200, origin);
        }

        if (feedType === 'digest') {
            const days = parseInt(url.searchParams.get('days')) || 7;
            const result = await getDigest(supabaseUrl, supabaseKey, userId, days, limit);
            return jsonResponse(result, 200, origin);
        }

        return jsonResponse({ ok: false, error: 'Invalid type. Use: groups, articles, digest, trending' }, 400, origin);

    } catch (err) {
        console.error('feed error:', err);
        return jsonResponse({ ok: false, error: 'Internal error' }, 500, origin);
    }
}
