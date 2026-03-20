/**
 * /api/article-collaborate — Collaborative Writing
 *
 * POST: Invite collaborator, accept/decline, list collaborators
 *
 * Environment variables required:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';

function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
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

    try {
        if (request.method === 'GET') {
            // List collaborators for an article
            const url = new URL(request.url);
            const articleId = url.searchParams.get('article_id');

            if (!articleId) {
                return new Response(
                    JSON.stringify({ ok: false, error: 'Missing article_id' }),
                    { status: 400, headers: corsHeaders(origin) }
                );
            }

            const res = await fetch(
                supabaseUrl + '/rest/v1/article_collaborators?select=id,article_id,user_id,role,status,invited_at,accepted_at,users!article_collaborators_user_id_fkey(username,avatar_url,full_name)' +
                '&article_id=eq.' + encodeURIComponent(articleId) +
                '&order=invited_at.desc',
                { method: 'GET', headers }
            );

            if (!res.ok) {
                const errText = await res.text();
                console.error('list collaborators error:', res.status, errText);
                return new Response(
                    JSON.stringify({ ok: false, error: 'Failed to list collaborators' }),
                    { status: 500, headers: corsHeaders(origin) }
                );
            }

            const collaborators = await res.json();
            return new Response(
                JSON.stringify({ ok: true, collaborators }),
                { status: 200, headers: corsHeaders(origin) }
            );
        }

        if (request.method === 'POST') {
            const body = await request.json();
            const { action } = body;

            if (action === 'invite') {
                const { article_id, inviter_user_id, invitee_username, role } = body;

                if (!article_id || !inviter_user_id || !invitee_username) {
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Missing required fields' }),
                        { status: 400, headers: corsHeaders(origin) }
                    );
                }

                const res = await fetch(supabaseUrl + '/rest/v1/rpc/invite_collaborator', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        p_article_id: article_id,
                        p_inviter_user_id: inviter_user_id,
                        p_invitee_username: invitee_username,
                        p_role: role || 'editor'
                    })
                });

                if (!res.ok) {
                    const errText = await res.text();
                    console.error('invite_collaborator error:', res.status, errText);
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Failed to invite collaborator' }),
                        { status: 500, headers: corsHeaders(origin) }
                    );
                }

                const result = await res.json();
                if (result.error) {
                    return new Response(
                        JSON.stringify({ ok: false, error: result.error }),
                        { status: 400, headers: corsHeaders(origin) }
                    );
                }

                return new Response(
                    JSON.stringify({ ok: true, result }),
                    { status: 200, headers: corsHeaders(origin) }
                );
            }

            if (action === 'respond') {
                const { collaboration_id, user_id, accept } = body;

                if (!collaboration_id || !user_id || accept === undefined) {
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Missing required fields' }),
                        { status: 400, headers: corsHeaders(origin) }
                    );
                }

                const res = await fetch(supabaseUrl + '/rest/v1/rpc/respond_collaboration', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        p_collaboration_id: collaboration_id,
                        p_user_id: user_id,
                        p_accept: accept
                    })
                });

                if (!res.ok) {
                    const errText = await res.text();
                    console.error('respond_collaboration error:', res.status, errText);
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Failed to respond to collaboration' }),
                        { status: 500, headers: corsHeaders(origin) }
                    );
                }

                const result = await res.json();
                return new Response(
                    JSON.stringify({ ok: true, result }),
                    { status: 200, headers: corsHeaders(origin) }
                );
            }

            if (action === 'remove') {
                const { collaboration_id } = body;

                if (!collaboration_id) {
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Missing collaboration_id' }),
                        { status: 400, headers: corsHeaders(origin) }
                    );
                }

                const res = await fetch(
                    supabaseUrl + '/rest/v1/article_collaborators?id=eq.' + encodeURIComponent(collaboration_id),
                    { method: 'DELETE', headers }
                );

                if (!res.ok) {
                    return new Response(
                        JSON.stringify({ ok: false, error: 'Failed to remove collaborator' }),
                        { status: 500, headers: corsHeaders(origin) }
                    );
                }

                return new Response(
                    JSON.stringify({ ok: true, action: 'removed' }),
                    { status: 200, headers: corsHeaders(origin) }
                );
            }

            return new Response(
                JSON.stringify({ ok: false, error: 'Invalid action. Use "invite", "respond", or "remove"' }),
                { status: 400, headers: corsHeaders(origin) }
            );
        }

        return new Response(
            JSON.stringify({ ok: false, error: 'Method not allowed' }),
            { status: 405, headers: corsHeaders(origin) }
        );

    } catch (err) {
        console.error('article-collaborate error:', err);
        return new Response(
            JSON.stringify({ ok: false, error: 'Internal server error' }),
            { status: 500, headers: corsHeaders(origin) }
        );
    }
}
