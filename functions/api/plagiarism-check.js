/**
 * /api/plagiarism-check — AI-Powered Plagiarism Detection
 *
 * POST: Check article content for similarity against existing articles
 *
 * Uses n-gram shingling to detect content overlap without external APIs.
 *
 * Environment variables required:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';
import { requireAuth } from './_shared/auth.js';

function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

/**
 * Strip HTML tags and normalize whitespace.
 */
function stripHtml(html) {
    return (html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Generate n-gram shingles from text.
 */
function generateShingles(text, n) {
    const words = text.split(/\s+/).filter((w) => { return w.length > 0; });
    const shingles = [];
    for (let i = 0; i <= words.length - n; i++) {
        shingles.push(words.slice(i, i + n).join(' '));
    }
    return shingles;
}

/**
 * Simple hash function for shingles.
 */
function hashShingle(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
    }
    return hash.toString(36);
}

/**
 * Calculate Jaccard similarity between two sets of hashes.
 */
function jaccardSimilarity(setA, setB) {
    if (setA.length === 0 && setB.length === 0) return 0;
    const a = new Set(setA);
    const b = new Set(setB);
    let intersection = 0;
    a.forEach((v) => { if (b.has(v)) intersection++; });
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
    }

    if (request.method !== 'POST') {
        return new Response(
            JSON.stringify({ ok: false, error: 'Method not allowed' }),
            { status: 405, headers: corsHeaders(origin) }
        );
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Service not configured' }),
            { status: 503, headers: corsHeaders(origin) }
        );
    }

    const headers = {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey
    };

    const authResult = await requireAuth(request, env, corsHeaders(origin));
    if (authResult instanceof Response) return authResult;

    try {
        const body = await request.json();
        const { content, article_id } = body;

        if (!content || content.length < 50) {
            return new Response(
                JSON.stringify({ ok: false, error: 'Content too short for plagiarism check' }),
                { status: 400, headers: corsHeaders(origin) }
            );
        }

        // Generate shingles for the new content
        const plainText = stripHtml(content);
        const shingles = generateShingles(plainText, 5);
        const shingleHashes = shingles.map(hashShingle);
        const contentHash = hashShingle(plainText.slice(0, 500));
        const wordCount = plainText.split(/\s+/).length;

        // Fetch existing article hashes
        const res = await fetch(
            supabaseUrl + '/rest/v1/article_content_hashes?select=article_id,content_hash,shingle_hashes,word_count' +
            (article_id ? '&article_id=neq.' + encodeURIComponent(article_id) : ''),
            { method: 'GET', headers }
        );

        if (!res.ok) {
            const errText = await res.text();
            console.error('fetch hashes error:', res.status, errText);
            return new Response(
                JSON.stringify({ ok: true, similarity: 0, matches: [], message: 'Could not check existing content' }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        const existingHashes = await res.json();
        const matches = [];

        for (const existing of existingHashes) {
            const existingShingles = existing.shingle_hashes || [];
            if (existingShingles.length === 0) continue;

            const similarity = jaccardSimilarity(shingleHashes, existingShingles);
            if (similarity > 0.15) {
                matches.push({
                    article_id: existing.article_id,
                    similarity: Math.round(similarity * 100),
                    exact_match: existing.content_hash === contentHash
                });
            }
        }

        // Sort by similarity descending
        matches.sort((a, b) => { return b.similarity - a.similarity; });

        // If article_id provided, save/update the content hash
        if (article_id) {
            await fetch(supabaseUrl + '/rest/v1/article_content_hashes', {
                method: 'POST',
                headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
                body: JSON.stringify({
                    article_id: article_id,
                    content_hash: contentHash,
                    shingle_hashes: shingleHashes.slice(0, 200),
                    word_count: wordCount,
                    updated_at: new Date().toISOString()
                })
            });
        }

        const maxSimilarity = matches.length > 0 ? matches[0].similarity : 0;
        let verdict = 'original';
        if (maxSimilarity > 70) verdict = 'high_similarity';
        else if (maxSimilarity > 40) verdict = 'moderate_similarity';
        else if (maxSimilarity > 15) verdict = 'low_similarity';

        return new Response(
            JSON.stringify({
                ok: true,
                verdict,
                max_similarity: maxSimilarity,
                matches: matches.slice(0, 5),
                shingle_count: shingleHashes.length,
                word_count: wordCount
            }),
            { status: 200, headers: corsHeaders(origin) }
        );

    } catch (err) {
        console.error('plagiarism-check error:', err);
        return new Response(
            JSON.stringify({ ok: false, error: 'Internal server error' }),
            { status: 500, headers: corsHeaders(origin) }
        );
    }
}
