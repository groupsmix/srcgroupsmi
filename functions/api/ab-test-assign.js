/**
 * /api/ab-test-assign — A/B Test Variant Assignment
 *
 * Assigns a visitor to an A/B test variant and returns the assignment.
 * Uses deterministic assignment based on session_id for consistency.
 *
 * Environment variables required:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';

/** CORS headers with Content-Type for JSON responses */
function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

/* ── Sanitize input ──────────────────────────────────────────────── */
function sanitize(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>"'&]/g, '').trim().slice(0, 500);
}

/* ── Simple hash for deterministic assignment ────────────────────── */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

/* ── Main handler ────────────────────────────────────────────────── */
export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
        return new Response(
            JSON.stringify({ ok: false, error: 'Method not allowed' }),
            { status: 405, headers: corsHeaders(origin) }
        );
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(
            JSON.stringify({ ok: true, variant: 'control', warning: 'AB testing not configured' }),
            { status: 200, headers: corsHeaders(origin) }
        );
    }

    // Parse parameters from GET query or POST body
    let testId = '';
    let sessionId = '';
    let uid = null;

    if (request.method === 'GET') {
        const url = new URL(request.url);
        testId = sanitize(url.searchParams.get('test_id') || '');
        sessionId = sanitize(url.searchParams.get('session_id') || '');
        uid = url.searchParams.get('uid') || null;
    } else {
        try {
            const body = await request.json();
            testId = sanitize(body.test_id || '');
            sessionId = sanitize(body.session_id || '');
            uid = body.uid || null;
        } catch {
            return new Response(
                JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
                { status: 400, headers: corsHeaders(origin) }
            );
        }
    }

    if (!testId) {
        return new Response(
            JSON.stringify({ ok: false, error: 'test_id is required' }),
            { status: 422, headers: corsHeaders(origin) }
        );
    }

    if (!sessionId) {
        // Generate a random session ID if not provided
        sessionId = 'anon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    }

    try {
        // Check if user already has an assignment for this test
        let existingAssignment = null;
        const lookupField = uid ? 'uid=eq.' + uid : 'visitor_id=eq.' + encodeURIComponent(sessionId);
        const existingRes = await fetch(
            supabaseUrl + '/rest/v1/ab_test_assignments?test_id=eq.' + encodeURIComponent(testId) + '&' + lookupField + '&select=variant_id',
            {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                }
            }
        );

        const existingData = await existingRes.json();
        if (existingData && existingData.length > 0) {
            existingAssignment = existingData[0].variant_id;
        }

        if (existingAssignment) {
            return new Response(
                JSON.stringify({ ok: true, variant: existingAssignment, test_id: testId, cached: true }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        // Fetch the test configuration
        const testRes = await fetch(
            supabaseUrl + '/rest/v1/ab_tests?id=eq.' + encodeURIComponent(testId) + '&status=eq.active&select=id,name,variants,traffic_percent',
            {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                }
            }
        );

        const testData = await testRes.json();
        if (!testData || !testData.length) {
            // Test not found or not active — return control
            return new Response(
                JSON.stringify({ ok: true, variant: 'control', test_id: testId, reason: 'test_not_found' }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        const test = testData[0];
        // Variants can be JSONB array of objects [{id:'control',...}] or simple strings
        let variants = test.variants || [{ id: 'control' }, { id: 'variant_a' }];
        if (typeof variants === 'string') {
            try { variants = JSON.parse(variants); } catch (_e) { variants = [{ id: 'control' }, { id: 'variant_a' }]; }
        }
        const variantIds = variants.map(v => typeof v === 'string' ? v : (v.id || 'control'));
        const trafficPercent = test.traffic_percent || 100;

        // Check if user is in the traffic allocation
        const trafficHash = simpleHash(sessionId + '_traffic') % 100;
        if (trafficHash >= trafficPercent) {
            // User is NOT in the test — return control
            return new Response(
                JSON.stringify({ ok: true, variant: 'control', test_id: testId, in_test: false }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        // Assign variant deterministically based on session
        const variantIndex = simpleHash(sessionId + '_' + testId) % variantIds.length;
        const assignedVariant = variantIds[variantIndex];

        // Save assignment
        await fetch(supabaseUrl + '/rest/v1/ab_test_assignments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
                test_id: testId,
                visitor_id: sessionId,
                variant_id: assignedVariant
            })
        });

        return new Response(
            JSON.stringify({ ok: true, variant: assignedVariant, test_id: testId, in_test: true }),
            { status: 200, headers: corsHeaders(origin) }
        );

    } catch (err) {
        console.error('ab-test-assign error:', err);
        // Default to control on error
        return new Response(
            JSON.stringify({ ok: true, variant: 'control', test_id: testId, error: true }),
            { status: 200, headers: corsHeaders(origin) }
        );
    }
}
