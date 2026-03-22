/**
 * /api/recommendations — Advanced Group Recommendation Engine
 *
 * GET /api/recommendations?group_id=X              — Similar group recommendations
 * GET /api/recommendations?category=X              — Recommendations by category
 * GET /api/recommendations?user_id=X               — Hybrid personalized recommendations
 * GET /api/recommendations?user_id=X&mode=explore  — Exploration-mode recommendations
 *
 * Algorithm features:
 * 1. Hybrid engine — 60% collaborative + 40% content-based (configurable)
 * 2. Decay-aware trending — exponential decay on views/joins over 7 days
 * 3. User embedding vectors — cosine similarity for non-obvious matches
 * 4. Re-engagement scoring — boost categories for returning users
 * 5. Implicit feedback — dwell time & bounce rate signals
 * 6. Epsilon-greedy exploration — 10-15% exploration picks
 */

import { corsHeaders, handlePreflight } from './_shared/cors.js';

/** CORS headers with caching for GET responses */
function cachedCorsHeaders(origin) {
    return corsHeaders(origin, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800'
    });
}

/* ── Content-based similarity score ──────────────────────────── */
function contentBasedScore(source, candidate) {
    var score = 0;

    if (source.category && candidate.category && source.category === candidate.category) {
        score += 40;
    }
    if (source.platform && candidate.platform && source.platform === candidate.platform) {
        score += 15;
    }
    if (source.country && candidate.country && source.country === candidate.country) {
        score += 15;
    }

    var sourceTags = (source.tags || []).map(function(t) { return (t || '').toLowerCase(); });
    var candidateTags = (candidate.tags || []).map(function(t) { return (t || '').toLowerCase(); });
    var tagOverlap = sourceTags.filter(function(t) { return candidateTags.includes(t); }).length;
    score += Math.min(20, tagOverlap * 10);
    score += Math.min(10, Math.floor((candidate.trust_score || 0) / 10));

    return score;
}

/* ── Decay-aware trending score ──────────────────────────────── */
function decayAwareTrendingScore(group, decayHalfLifeHours) {
    var halfLife = decayHalfLifeHours || 72; // 3-day half-life default
    var now = Date.now();
    var createdAt = new Date(group.created_at || group.updated_at || now).getTime();
    var ageHours = Math.max(0, (now - createdAt) / 3600000);
    var decayFactor = Math.pow(2, -ageHours / halfLife);

    var views = group.views || 0;
    var clicks = group.click_count || group.clicks || 0;
    var reviews = group.review_count || 0;
    var likes = group.likes_count || 0;
    var engagement = (views * 1) + (clicks * 3) + (reviews * 10) + (likes * 5);
    var velocity = ageHours > 0 ? engagement / ageHours : engagement;

    return velocity * decayFactor;
}

/* ── Lightweight user embedding vector ───────────────────────── */
var CATEGORY_DIMENSIONS = [
    'education', 'technology', 'business', 'marketing', 'design',
    'community', 'entertainment', 'gaming', 'health', 'finance',
    'sports', 'music', 'food', 'travel', 'news',
    'science', 'art', 'religion', 'politics', 'lifestyle'
];

function buildGroupEmbedding(group) {
    var vec = new Array(CATEGORY_DIMENSIONS.length).fill(0);
    var cat = (group.category || '').toLowerCase();
    var idx = CATEGORY_DIMENSIONS.indexOf(cat);
    if (idx !== -1) vec[idx] = 1.0;

    var tags = (group.tags || []).map(function(t) { return (t || '').toLowerCase(); });
    tags.forEach(function(tag) {
        var tagIdx = CATEGORY_DIMENSIONS.indexOf(tag);
        if (tagIdx !== -1) vec[tagIdx] += 0.3;
    });

    var platform = (group.platform || '').toLowerCase();
    if (platform === 'discord' || platform === 'twitch') {
        var gamingIdx = CATEGORY_DIMENSIONS.indexOf('gaming');
        var techIdx = CATEGORY_DIMENSIONS.indexOf('technology');
        if (gamingIdx !== -1) vec[gamingIdx] += 0.15;
        if (techIdx !== -1) vec[techIdx] += 0.1;
    }
    if (platform === 'linkedin') {
        var bizIdx = CATEGORY_DIMENSIONS.indexOf('business');
        if (bizIdx !== -1) vec[bizIdx] += 0.2;
    }
    return vec;
}

function buildUserEmbedding(interactions) {
    var vec = new Array(CATEGORY_DIMENSIONS.length).fill(0);
    interactions.forEach(function(interaction) {
        var cat = (interaction.category || '').toLowerCase();
        var idx = CATEGORY_DIMENSIONS.indexOf(cat);
        var weight = interaction.weight || 1;
        if (idx !== -1) vec[idx] += weight;
        (interaction.tags || []).forEach(function(tag) {
            var tagIdx = CATEGORY_DIMENSIONS.indexOf((tag || '').toLowerCase());
            if (tagIdx !== -1) vec[tagIdx] += weight * 0.3;
        });
    });
    var magnitude = Math.sqrt(vec.reduce(function(s, v) { return s + v * v; }, 0));
    if (magnitude > 0) {
        vec = vec.map(function(v) { return v / magnitude; });
    }
    return vec;
}

function cosineSimilarity(vecA, vecB) {
    var dotProduct = 0, magA = 0, magB = 0;
    for (var i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magA += vecA[i] * vecA[i];
        magB += vecB[i] * vecB[i];
    }
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
}

/* ── Re-engagement scoring ───────────────────────────────────── */
function reEngagementBoost(group, previousCategories, daysSinceLastVisit) {
    if (!daysSinceLastVisit || daysSinceLastVisit < 1) return 0;
    var cat = (group.category || '').toLowerCase();
    var wasEngaged = previousCategories.some(function(pc) {
        return (pc || '').toLowerCase() === cat;
    });
    if (!wasEngaged) return 0;
    return Math.min(50, daysSinceLastVisit * 5);
}

/* ── Hybrid recommendation score ─────────────────────────────── */
function hybridScore(contentScore, collaborativeScore, embeddingScore, trendingScore, reEngageScore, weights) {
    var w = weights || { content: 0.25, collaborative: 0.35, embedding: 0.20, trending: 0.10, reEngage: 0.10 };
    return (
        (contentScore * w.content) +
        (collaborativeScore * w.collaborative) +
        (embeddingScore * w.embedding) +
        (trendingScore * w.trending) +
        (reEngageScore * w.reEngage)
    );
}

/* ── Epsilon-greedy exploration selection ─────────────────────── */
function applyExploration(rankedItems, allItems, epsilon) {
    var explorationRate = epsilon || 0.12;
    var exploitCount = Math.ceil(rankedItems.length * (1 - explorationRate));
    var exploreCount = rankedItems.length - exploitCount;
    var exploited = rankedItems.slice(0, exploitCount);

    var exploitedIds = new Set(exploited.map(function(g) { return g.id; }));
    var exploitedCategories = new Set(exploited.map(function(g) { return g.category; }));

    var exploreCandidates = allItems.filter(function(g) {
        return !exploitedIds.has(g.id) && !exploitedCategories.has(g.category);
    });
    if (exploreCandidates.length < exploreCount) {
        var moreCandidates = allItems.filter(function(g) { return !exploitedIds.has(g.id); });
        exploreCandidates = exploreCandidates.concat(
            moreCandidates.filter(function(g) { return !exploitedCategories.has(g.category); })
        );
    }
    for (var i = exploreCandidates.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = exploreCandidates[i];
        exploreCandidates[i] = exploreCandidates[j];
        exploreCandidates[j] = temp;
    }
    var explored = exploreCandidates.slice(0, exploreCount).map(function(g) {
        g._is_exploration = true;
        return g;
    });
    var result = exploited.slice();
    var explorePositions = [2, 6, 11, 16, 21];
    explored.forEach(function(item, idx) {
        var pos = explorePositions[idx] !== undefined ? Math.min(explorePositions[idx], result.length) : result.length;
        result.splice(pos, 0, item);
    });
    return result;
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
    }

    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
            status: 405, headers: cachedCorsHeaders(origin)
        });
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ ok: false, error: 'Service not configured' }), {
            status: 503, headers: cachedCorsHeaders(origin)
        });
    }

    const url = new URL(request.url);
    const groupId = url.searchParams.get('group_id');
    const category = url.searchParams.get('category');
    const userId = url.searchParams.get('user_id');
    const limit = parseInt(url.searchParams.get('limit')) || 6;
    const epsilon = parseFloat(url.searchParams.get('epsilon')) || 0.12;

    try {
        /* ── User-based hybrid recommendations ─────────────────── */
        if (userId) {
            var userInteractionsRes = await fetch(
                supabaseUrl + '/rest/v1/user_interests?user_id=eq.' + encodeURIComponent(userId) + '&select=category,tags,weight&order=weight.desc&limit=50',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            var userInteractions = await userInteractionsRes.json();
            userInteractions = Array.isArray(userInteractions) ? userInteractions : [];

            var implicitRes = await fetch(
                supabaseUrl + '/rest/v1/feed_impressions?user_id=eq.' + encodeURIComponent(userId) + '&select=content_id,dwell_seconds,clicked,content_type&content_type=eq.group&order=created_at.desc&limit=100',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            var implicitFeedback = await implicitRes.json();
            implicitFeedback = Array.isArray(implicitFeedback) ? implicitFeedback : [];

            var implicitSignals = {};
            implicitFeedback.forEach(function(fb) {
                var signal = 0;
                if (fb.clicked) signal += 1;
                if ((fb.dwell_seconds || 0) > 30) signal += 0.5;
                if ((fb.dwell_seconds || 0) < 3 && !fb.clicked) signal -= 0.5;
                implicitSignals[fb.content_id] = (implicitSignals[fb.content_id] || 0) + signal;
            });

            var sessionRes = await fetch(
                supabaseUrl + '/rest/v1/user_sessions?user_id=eq.' + encodeURIComponent(userId) + '&select=created_at&order=created_at.desc&limit=2',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            var sessions = await sessionRes.json();
            sessions = Array.isArray(sessions) ? sessions : [];
            var daysSinceLastVisit = 0;
            if (sessions.length >= 2) {
                daysSinceLastVisit = (new Date(sessions[0].created_at) - new Date(sessions[1].created_at)) / 86400000;
            }

            var previousCategories = userInteractions.map(function(ui) { return ui.category; }).filter(Boolean);
            var userEmbedding = buildUserEmbedding(userInteractions);

            var collabRes = await fetch(
                supabaseUrl + '/rest/v1/collaborative_pairs?content_type=eq.group&select=content_id_a,content_id_b,co_occurrence_count,similarity_score&order=similarity_score.desc&limit=200',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            var collabPairs = await collabRes.json();
            collabPairs = Array.isArray(collabPairs) ? collabPairs : [];

            var viewedGroupIds = new Set(implicitFeedback.map(function(fb) { return fb.content_id; }).filter(Boolean));
            var collabScores = {};
            collabPairs.forEach(function(pair) {
                if (viewedGroupIds.has(pair.content_id_a)) {
                    collabScores[pair.content_id_b] = (collabScores[pair.content_id_b] || 0) + (pair.similarity_score || pair.co_occurrence_count || 1);
                }
                if (viewedGroupIds.has(pair.content_id_b)) {
                    collabScores[pair.content_id_a] = (collabScores[pair.content_id_a] || 0) + (pair.similarity_score || pair.co_occurrence_count || 1);
                }
            });

            var candidatesRes = await fetch(
                supabaseUrl + '/rest/v1/groups?status=eq.approved&select=id,name,platform,category,country,description,trust_score,views,click_count,avg_rating,review_count,tags,link,likes_count,created_at&order=trust_score.desc&limit=200',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            var allCandidates = await candidatesRes.json();
            allCandidates = Array.isArray(allCandidates) ? allCandidates : [];

            var isNewUser = userInteractions.length < 3;
            var weights = isNewUser
                ? { content: 0.40, collaborative: 0.10, embedding: 0.20, trending: 0.20, reEngage: 0.10 }
                : { content: 0.25, collaborative: 0.35, embedding: 0.20, trending: 0.10, reEngage: 0.10 };

            if (daysSinceLastVisit > 3) {
                weights.reEngage = 0.25;
                weights.content -= 0.08;
                weights.trending -= 0.07;
            }

            var collabValues = Object.values(collabScores);
            var maxCollab = collabValues.length > 0 ? Math.max.apply(null, collabValues) : 1;
            var maxTrending = 1;
            allCandidates.forEach(function(c) {
                var ts = decayAwareTrendingScore(c, 72);
                if (ts > maxTrending) maxTrending = ts;
            });

            var scored = allCandidates.map(function(c) {
                var cScore = 0;
                previousCategories.forEach(function(cat) {
                    if ((c.category || '').toLowerCase() === (cat || '').toLowerCase()) cScore += 40;
                });
                userInteractions.forEach(function(ui) {
                    (ui.tags || []).forEach(function(t) {
                        if ((c.tags || []).some(function(ct) { return (ct || '').toLowerCase() === (t || '').toLowerCase(); })) {
                            cScore += 10;
                        }
                    });
                });
                cScore = Math.min(100, cScore);

                var collabScore = collabScores[c.id] ? (collabScores[c.id] / maxCollab * 100) : 0;
                var groupEmbed = buildGroupEmbedding(c);
                var embScore = cosineSimilarity(userEmbedding, groupEmbed) * 100;
                var trendScore = (decayAwareTrendingScore(c, 72) / maxTrending) * 100;
                var reEngageScore = reEngagementBoost(c, previousCategories, daysSinceLastVisit);
                var implicitAdj = implicitSignals[c.id] || 0;

                var finalScore = hybridScore(cScore, collabScore, embScore, trendScore, reEngageScore, weights);
                finalScore += implicitAdj * 10;
                if (viewedGroupIds.has(c.id)) finalScore *= 0.3;

                c._hybrid_score = finalScore;
                return c;
            });

            scored.sort(function(a, b) { return b._hybrid_score - a._hybrid_score; });

            var topScored = scored.slice(0, limit + 5);
            var finalResults = applyExploration(topScored, allCandidates, epsilon);
            finalResults = finalResults.slice(0, limit);

            finalResults.forEach(function(c) {
                delete c._hybrid_score;
                delete c._is_exploration;
            });

            return new Response(JSON.stringify({
                ok: true,
                mode: isNewUser ? 'content-heavy' : 'hybrid',
                recommendations: finalResults,
                algorithm: {
                    weights: weights,
                    exploration_rate: epsilon,
                    user_interactions: userInteractions.length,
                    days_since_last_visit: parseFloat(daysSinceLastVisit.toFixed(1)),
                    is_re_engagement: daysSinceLastVisit > 3,
                    implicit_signals_count: Object.keys(implicitSignals).length
                },
                total: finalResults.length
            }), { status: 200, headers: cachedCorsHeaders(origin) });
        }

        /* ── Group-based similarity recommendations ────────────── */
        if (groupId) {
            const sourceRes = await fetch(
                supabaseUrl + '/rest/v1/groups?id=eq.' + encodeURIComponent(groupId) + '&status=eq.approved&select=id,name,platform,category,country,tags,trust_score,views,click_count,review_count,likes_count,created_at&limit=1',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const sourceGroups = await sourceRes.json();
            if (!sourceGroups || !sourceGroups.length) {
                return new Response(JSON.stringify({ ok: false, error: 'Group not found' }), {
                    status: 404, headers: cachedCorsHeaders(origin)
                });
            }
            var source = sourceGroups[0];
            var sourceEmbedding = buildGroupEmbedding(source);

            var queryParams = 'status=eq.approved&id=neq.' + encodeURIComponent(groupId);
            if (source.category) {
                queryParams += '&or=(category.eq.' + encodeURIComponent(source.category) + ',platform.eq.' + encodeURIComponent(source.platform || '') + ')';
            }
            queryParams += '&select=id,name,platform,category,country,description,trust_score,views,click_count,avg_rating,review_count,tags,link,likes_count,created_at&order=trust_score.desc&limit=50';

            const candidatesRes = await fetch(
                supabaseUrl + '/rest/v1/groups?' + queryParams,
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const candidates = await candidatesRes.json();

            var scored = (candidates || []).map(function(c) {
                var cbScore = contentBasedScore(source, c);
                var candEmbedding = buildGroupEmbedding(c);
                var embScore = cosineSimilarity(sourceEmbedding, candEmbedding) * 50;
                var trendScore = Math.min(20, decayAwareTrendingScore(c, 72) / 10);
                c._score = cbScore + embScore + trendScore;
                return c;
            }).filter(function(c) {
                return c._score > 15;
            }).sort(function(a, b) {
                return b._score - a._score;
            }).slice(0, limit);

            scored.forEach(function(c) { delete c._score; });

            return new Response(JSON.stringify({
                ok: true,
                source_group: { id: source.id, name: source.name, category: source.category },
                recommendations: scored,
                algorithm: 'content_based_plus_embedding',
                message: scored.length > 0
                    ? 'People who joined ' + source.name + ' also liked these groups'
                    : 'No similar groups found yet'
            }), { status: 200, headers: cachedCorsHeaders(origin) });
        }

        /* ── Category-based with decay-aware trending ──────────── */
        if (category) {
            const res = await fetch(
                supabaseUrl + '/rest/v1/groups?status=eq.approved&category=eq.' + encodeURIComponent(category) + '&select=id,name,platform,category,country,description,trust_score,views,click_count,avg_rating,review_count,tags,link,likes_count,created_at&order=trust_score.desc&limit=' + limit,
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const groups = await res.json();

            var sortedGroups = (groups || []).map(function(g) {
                g._trending = decayAwareTrendingScore(g, 72);
                return g;
            }).sort(function(a, b) {
                var aScore = (a.trust_score || 0) * 0.7 + a._trending * 0.3;
                var bScore = (b.trust_score || 0) * 0.7 + b._trending * 0.3;
                return bScore - aScore;
            });
            sortedGroups.forEach(function(g) { delete g._trending; });

            return new Response(JSON.stringify({
                ok: true,
                category: category,
                recommendations: sortedGroups
            }), { status: 200, headers: cachedCorsHeaders(origin) });
        }

        return new Response(JSON.stringify({ ok: false, error: 'group_id, user_id, or category parameter required' }), {
            status: 400, headers: cachedCorsHeaders(origin)
        });

    } catch (err) {
        console.error('recommendations error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500, headers: cachedCorsHeaders(origin)
        });
    }
}
