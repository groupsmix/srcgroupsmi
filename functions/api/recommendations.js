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
import { requireAuthWithOwnership } from './_shared/auth.js';

/** CORS headers with caching for GET responses */
function cachedCorsHeaders(origin) {
    return corsHeaders(origin, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800'
    });
}

/* ── Content-based similarity score ──────────────────────────── */
function contentBasedScore(source, candidate) {
    let score = 0;

    if (source.category && candidate.category && source.category === candidate.category) {
        score += 40;
    }
    if (source.platform && candidate.platform && source.platform === candidate.platform) {
        score += 15;
    }
    if (source.country && candidate.country && source.country === candidate.country) {
        score += 15;
    }

    const sourceTags = (source.tags || []).map((t) => { return (t || '').toLowerCase(); });
    const candidateTags = (candidate.tags || []).map((t) => { return (t || '').toLowerCase(); });
    const tagOverlap = sourceTags.filter((t) => { return candidateTags.includes(t); }).length;
    score += Math.min(20, tagOverlap * 10);
    score += Math.min(10, Math.floor((candidate.trust_score || 0) / 10));

    return score;
}

/* ── Decay-aware trending score ──────────────────────────────── */
function decayAwareTrendingScore(group, decayHalfLifeHours) {
    const halfLife = decayHalfLifeHours || 72; // 3-day half-life default
    const now = Date.now();
    const createdAt = new Date(group.created_at || group.updated_at || now).getTime();
    const ageHours = Math.max(0, (now - createdAt) / 3600000);
    const decayFactor = Math.pow(2, -ageHours / halfLife);

    const views = group.views || 0;
    const clicks = group.click_count || group.clicks || 0;
    const reviews = group.review_count || 0;
    const likes = group.likes_count || 0;
    const engagement = (views * 1) + (clicks * 3) + (reviews * 10) + (likes * 5);
    const velocity = ageHours > 0 ? engagement / ageHours : engagement;

    return velocity * decayFactor;
}

/* ── Lightweight user embedding vector ───────────────────────── */
const CATEGORY_DIMENSIONS = [
    'education', 'technology', 'business', 'marketing', 'design',
    'community', 'entertainment', 'gaming', 'health', 'finance',
    'sports', 'music', 'food', 'travel', 'news',
    'science', 'art', 'religion', 'politics', 'lifestyle'
];

function buildGroupEmbedding(group) {
    const vec = new Array(CATEGORY_DIMENSIONS.length).fill(0);
    const cat = (group.category || '').toLowerCase();
    const idx = CATEGORY_DIMENSIONS.indexOf(cat);
    if (idx !== -1) vec[idx] = 1.0;

    const tags = (group.tags || []).map((t) => { return (t || '').toLowerCase(); });
    tags.forEach((tag) => {
        const tagIdx = CATEGORY_DIMENSIONS.indexOf(tag);
        if (tagIdx !== -1) vec[tagIdx] += 0.3;
    });

    const platform = (group.platform || '').toLowerCase();
    if (platform === 'discord' || platform === 'twitch') {
        const gamingIdx = CATEGORY_DIMENSIONS.indexOf('gaming');
        const techIdx = CATEGORY_DIMENSIONS.indexOf('technology');
        if (gamingIdx !== -1) vec[gamingIdx] += 0.15;
        if (techIdx !== -1) vec[techIdx] += 0.1;
    }
    if (platform === 'linkedin') {
        const bizIdx = CATEGORY_DIMENSIONS.indexOf('business');
        if (bizIdx !== -1) vec[bizIdx] += 0.2;
    }
    return vec;
}

function buildUserEmbedding(interactions) {
    let vec = new Array(CATEGORY_DIMENSIONS.length).fill(0);
    interactions.forEach((interaction) => {
        const cat = (interaction.category || '').toLowerCase();
        const idx = CATEGORY_DIMENSIONS.indexOf(cat);
        const weight = interaction.weight || 1;
        if (idx !== -1) vec[idx] += weight;
        (interaction.tags || []).forEach((tag) => {
            const tagIdx = CATEGORY_DIMENSIONS.indexOf((tag || '').toLowerCase());
            if (tagIdx !== -1) vec[tagIdx] += weight * 0.3;
        });
    });
    const magnitude = Math.sqrt(vec.reduce((s, v) => { return s + v * v; }, 0));
    if (magnitude > 0) {
        vec = vec.map((v) => { return v / magnitude; });
    }
    return vec;
}

function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0, magA = 0, magB = 0;
    for (let i = 0; i < vecA.length; i++) {
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
    const cat = (group.category || '').toLowerCase();
    const wasEngaged = previousCategories.some((pc) => {
        return (pc || '').toLowerCase() === cat;
    });
    if (!wasEngaged) return 0;
    return Math.min(50, daysSinceLastVisit * 5);
}

/* ── Hybrid recommendation score ─────────────────────────────── */
function hybridScore(contentScore, collaborativeScore, embeddingScore, trendingScore, reEngageScore, weights) {
    const w = weights || { content: 0.25, collaborative: 0.35, embedding: 0.20, trending: 0.10, reEngage: 0.10 };
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
    const explorationRate = epsilon || 0.12;
    const exploitCount = Math.ceil(rankedItems.length * (1 - explorationRate));
    const exploreCount = rankedItems.length - exploitCount;
    const exploited = rankedItems.slice(0, exploitCount);

    const exploitedIds = new Set(exploited.map((g) => { return g.id; }));
    const exploitedCategories = new Set(exploited.map((g) => { return g.category; }));

    let exploreCandidates = allItems.filter((g) => {
        return !exploitedIds.has(g.id) && !exploitedCategories.has(g.category);
    });
    if (exploreCandidates.length < exploreCount) {
        const moreCandidates = allItems.filter((g) => { return !exploitedIds.has(g.id); });
        exploreCandidates = exploreCandidates.concat(
            moreCandidates.filter((g) => { return !exploitedCategories.has(g.category); })
        );
    }
    for (let i = exploreCandidates.length - 1; i > 0; i--) {
        const bytes = new Uint8Array(1);
        crypto.getRandomValues(bytes);
        const j = bytes[0] % (i + 1);
        const temp = exploreCandidates[i];
        exploreCandidates[i] = exploreCandidates[j];
        exploreCandidates[j] = temp;
    }
    const explored = exploreCandidates.slice(0, exploreCount).map((g) => {
        g._is_exploration = true;
        return g;
    });
    const result = exploited.slice();
    const explorePositions = [2, 6, 11, 16, 21];
    explored.forEach((item, idx) => {
        const pos = explorePositions[idx] !== undefined ? Math.min(explorePositions[idx], result.length) : result.length;
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
    const limit = parseInt(url.searchParams.get('limit'), 10) || 6;
    const epsilon = parseFloat(url.searchParams.get('epsilon')) || 0.12;

    try {
        /* ── User-based hybrid recommendations ─────────────────── */
        if (userId) {
            // Verify the caller owns this user_id (NEW-SEC-2)
            const authCheck = await requireAuthWithOwnership(request, env, cachedCorsHeaders(origin), userId);
            if (authCheck instanceof Response) return authCheck;

            // Parallelize all 5 independent data fetches (NEW-PERF-1)
            const [userInteractionsRes, implicitRes, sessionRes, collabRes, candidatesRes] = await Promise.all([
                fetch(
                    supabaseUrl + '/rest/v1/user_interests?user_id=eq.' + encodeURIComponent(userId) + '&select=category,tags,weight&order=weight.desc&limit=50',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                ),
                fetch(
                    supabaseUrl + '/rest/v1/feed_impressions?user_id=eq.' + encodeURIComponent(userId) + '&select=content_id,dwell_seconds,clicked,content_type&content_type=eq.group&order=created_at.desc&limit=100',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                ),
                fetch(
                    supabaseUrl + '/rest/v1/user_sessions?user_id=eq.' + encodeURIComponent(userId) + '&select=created_at&order=created_at.desc&limit=2',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                ),
                fetch(
                    supabaseUrl + '/rest/v1/collaborative_pairs?content_type=eq.group&select=content_id_a,content_id_b,co_occurrence_count,similarity_score&order=similarity_score.desc&limit=200',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                ),
                fetch(
                    supabaseUrl + '/rest/v1/groups?status=eq.approved&select=id,name,platform,category,country,description,trust_score,views,click_count,avg_rating,review_count,tags,link,likes_count,created_at&order=trust_score.desc&limit=200',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                )
            ]);

            let userInteractions = await userInteractionsRes.json();
            userInteractions = Array.isArray(userInteractions) ? userInteractions : [];

            let implicitFeedback = await implicitRes.json();
            implicitFeedback = Array.isArray(implicitFeedback) ? implicitFeedback : [];

            const implicitSignals = {};
            implicitFeedback.forEach((fb) => {
                let signal = 0;
                if (fb.clicked) signal += 1;
                if ((fb.dwell_seconds || 0) > 30) signal += 0.5;
                if ((fb.dwell_seconds || 0) < 3 && !fb.clicked) signal -= 0.5;
                implicitSignals[fb.content_id] = (implicitSignals[fb.content_id] || 0) + signal;
            });

            let sessions = await sessionRes.json();
            sessions = Array.isArray(sessions) ? sessions : [];
            let daysSinceLastVisit = 0;
            if (sessions.length >= 2) {
                daysSinceLastVisit = (new Date(sessions[0].created_at) - new Date(sessions[1].created_at)) / 86400000;
            }

            const previousCategories = userInteractions.map((ui) => { return ui.category; }).filter(Boolean);
            const userEmbedding = buildUserEmbedding(userInteractions);

            let collabPairs = await collabRes.json();
            collabPairs = Array.isArray(collabPairs) ? collabPairs : [];

            const viewedGroupIds = new Set(implicitFeedback.map((fb) => { return fb.content_id; }).filter(Boolean));
            const collabScores = {};
            collabPairs.forEach((pair) => {
                if (viewedGroupIds.has(pair.content_id_a)) {
                    collabScores[pair.content_id_b] = (collabScores[pair.content_id_b] || 0) + (pair.similarity_score || pair.co_occurrence_count || 1);
                }
                if (viewedGroupIds.has(pair.content_id_b)) {
                    collabScores[pair.content_id_a] = (collabScores[pair.content_id_a] || 0) + (pair.similarity_score || pair.co_occurrence_count || 1);
                }
            });

            let allCandidates = await candidatesRes.json();
            allCandidates = Array.isArray(allCandidates) ? allCandidates : [];

            const isNewUser = userInteractions.length < 3;
            const weights = isNewUser
                ? { content: 0.40, collaborative: 0.10, embedding: 0.20, trending: 0.20, reEngage: 0.10 }
                : { content: 0.25, collaborative: 0.35, embedding: 0.20, trending: 0.10, reEngage: 0.10 };

            if (daysSinceLastVisit > 3) {
                weights.reEngage = 0.25;
                weights.content -= 0.08;
                weights.trending -= 0.07;
            }

            const collabValues = Object.values(collabScores);
            const maxCollab = collabValues.length > 0 ? Math.max.apply(null, collabValues) : 1;
            let maxTrending = 1;
            allCandidates.forEach((c) => {
                const ts = decayAwareTrendingScore(c, 72);
                if (ts > maxTrending) maxTrending = ts;
            });

            const scored = allCandidates.map((c) => {
                let cScore = 0;
                previousCategories.forEach((cat) => {
                    if ((c.category || '').toLowerCase() === (cat || '').toLowerCase()) cScore += 40;
                });
                userInteractions.forEach((ui) => {
                    (ui.tags || []).forEach((t) => {
                        if ((c.tags || []).some((ct) => { return (ct || '').toLowerCase() === (t || '').toLowerCase(); })) {
                            cScore += 10;
                        }
                    });
                });
                cScore = Math.min(100, cScore);

                const collabScore = collabScores[c.id] ? (collabScores[c.id] / maxCollab * 100) : 0;
                const groupEmbed = buildGroupEmbedding(c);
                const embScore = cosineSimilarity(userEmbedding, groupEmbed) * 100;
                const trendScore = (decayAwareTrendingScore(c, 72) / maxTrending) * 100;
                const reEngageScore = reEngagementBoost(c, previousCategories, daysSinceLastVisit);
                const implicitAdj = implicitSignals[c.id] || 0;

                let finalScore = hybridScore(cScore, collabScore, embScore, trendScore, reEngageScore, weights);
                finalScore += implicitAdj * 10;
                if (viewedGroupIds.has(c.id)) finalScore *= 0.3;

                c._hybrid_score = finalScore;
                return c;
            });

            scored.sort((a, b) => { return b._hybrid_score - a._hybrid_score; });

            const topScored = scored.slice(0, limit + 5);
            let finalResults = applyExploration(topScored, allCandidates, epsilon);
            finalResults = finalResults.slice(0, limit);

            finalResults.forEach((c) => {
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
            const source = sourceGroups[0];
            const sourceEmbedding = buildGroupEmbedding(source);

            let queryParams = 'status=eq.approved&id=neq.' + encodeURIComponent(groupId);
            if (source.category) {
                queryParams += '&or=(category.eq.' + encodeURIComponent(source.category) + ',platform.eq.' + encodeURIComponent(source.platform || '') + ')';
            }
            queryParams += '&select=id,name,platform,category,country,description,trust_score,views,click_count,avg_rating,review_count,tags,link,likes_count,created_at&order=trust_score.desc&limit=50';

            const candidatesRes = await fetch(
                supabaseUrl + '/rest/v1/groups?' + queryParams,
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const candidates = await candidatesRes.json();

            const scored = (candidates || []).map((c) => {
                const cbScore = contentBasedScore(source, c);
                const candEmbedding = buildGroupEmbedding(c);
                const embScore = cosineSimilarity(sourceEmbedding, candEmbedding) * 50;
                const trendScore = Math.min(20, decayAwareTrendingScore(c, 72) / 10);
                c._score = cbScore + embScore + trendScore;
                return c;
            }).filter((c) => {
                return c._score > 15;
            }).sort((a, b) => {
                return b._score - a._score;
            }).slice(0, limit);

            scored.forEach((c) => { delete c._score; });

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

            const sortedGroups = (groups || []).map((g) => {
                g._trending = decayAwareTrendingScore(g, 72);
                return g;
            }).sort((a, b) => {
                const aScore = (a.trust_score || 0) * 0.7 + a._trending * 0.3;
                const bScore = (b.trust_score || 0) * 0.7 + b._trending * 0.3;
                return bScore - aScore;
            });
            sortedGroups.forEach((g) => { delete g._trending; });

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
