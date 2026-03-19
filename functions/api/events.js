/**
 * /api/events — Community Events / Meetups API
 *
 * GET  /api/events?action=list                    — List upcoming events
 * GET  /api/events?action=detail&event_id=X       — Get event detail
 * POST /api/events  { action: 'create', ... }     — Create event (auth required)
 * POST /api/events  { action: 'update', ... }     — Update event (auth required, creator only)
 * POST /api/events  { action: 'rsvp', ... }       — RSVP to event (auth required)
 * POST /api/events  { action: 'cancel', ... }     — Cancel event (auth required, creator only)
 */

import { requireAuth } from './_shared/auth.js';

const ALLOWED_ORIGINS = ['https://groupsmix.com', 'https://www.groupsmix.com'];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const supabaseUrl = env?.SUPABASE_URL || 'https://hmlqppacanpxmrfdlkec.supabase.co';
    const supabaseKey = env?.SUPABASE_SERVICE_KEY || env?.SUPABASE_ANON_KEY || '';

    if (!supabaseKey) {
        return new Response(JSON.stringify({ ok: false, error: 'Server not configured' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }

    try {
        if (request.method === 'GET') {
            return await handleGet(request, supabaseUrl, supabaseKey, origin);
        }

        if (request.method === 'POST') {
            const authResult = await requireAuth(request, env, corsHeaders(origin));
            if (authResult instanceof Response) return authResult;
            const { user } = authResult;
            return await handlePost(request, user, supabaseUrl, supabaseKey, origin);
        }

        return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
            status: 405, headers: corsHeaders(origin)
        });
    } catch (err) {
        console.error('events error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}

async function handleGet(request, supabaseUrl, supabaseKey, origin) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'list';

    if (action === 'list') {
        var limit = parseInt(url.searchParams.get('limit')) || 20;
        var offset = parseInt(url.searchParams.get('offset')) || 0;
        var category = url.searchParams.get('category') || '';
        var eventType = url.searchParams.get('event_type') || '';
        var country = url.searchParams.get('country') || '';
        var groupId = url.searchParams.get('group_id') || '';
        var search = url.searchParams.get('search') || '';

        var res = await fetch(
            supabaseUrl + '/rest/v1/rpc/get_upcoming_events',
            {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    p_limit: Math.min(limit, 50),
                    p_offset: offset,
                    p_category: category,
                    p_event_type: eventType,
                    p_country: country
                })
            }
        );
        var data = await res.json();
        if (!res.ok) {
            return new Response(JSON.stringify({ ok: false, error: (data && data.message) || 'Failed to fetch events' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        // Filter by group_id client-side if provided (RPC doesn't support it directly)
        var events = Array.isArray(data) ? data : [];
        if (groupId) {
            events = events.filter(function(e) { return e.group_id === groupId; });
        }

        return new Response(JSON.stringify({ ok: true, events: events, total: events.length }), {
            status: 200, headers: corsHeaders(origin)
        });
    }

    if (action === 'detail') {
        var eventId = url.searchParams.get('event_id');
        if (!eventId) {
            return new Response(JSON.stringify({ ok: false, error: 'event_id required' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        var res = await fetch(
            supabaseUrl + '/rest/v1/community_events?id=eq.' + encodeURIComponent(eventId) + '&select=*&limit=1',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        var data = await res.json();
        if (!data || !data.length) {
            return new Response(JSON.stringify({ ok: false, error: 'Event not found' }), {
                status: 404, headers: corsHeaders(origin)
            });
        }

        var event = data[0];

        // Get group info
        if (event.group_id) {
            var groupRes = await fetch(
                supabaseUrl + '/rest/v1/groups?id=eq.' + encodeURIComponent(event.group_id) + '&select=id,name,platform,is_verified&limit=1',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            var groupData = await groupRes.json();
            if (groupData && groupData.length) {
                event.group_name = groupData[0].name;
                event.group_platform = groupData[0].platform;
                event.group_is_verified = groupData[0].is_verified || false;
            }
        }

        // Get RSVP counts
        var rsvpRes = await fetch(
            supabaseUrl + '/rest/v1/event_rsvps?event_id=eq.' + encodeURIComponent(eventId) + '&select=status',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        var rsvps = await rsvpRes.json();
        event.rsvp_count = (rsvps || []).filter(function(r) { return r.status === 'going'; }).length;
        event.interested_count = (rsvps || []).filter(function(r) { return r.status === 'interested'; }).length;

        // Increment views
        await fetch(
            supabaseUrl + '/rest/v1/rpc/increment_event_views',
            {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ p_event_id: eventId })
            }
        );

        return new Response(JSON.stringify({ ok: true, event: event }), {
            status: 200, headers: corsHeaders(origin)
        });
    }

    return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), {
        status: 400, headers: corsHeaders(origin)
    });
}

async function handlePost(request, user, supabaseUrl, supabaseKey, origin) {
    var body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    var action = body.action;

    if (action === 'create') {
        if (!body.title || !body.start_date) {
            return new Response(JSON.stringify({ ok: false, error: 'title and start_date are required' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        var eventData = {
            creator_uid: user.id,
            group_id: body.group_id || null,
            title: (body.title || '').slice(0, 200),
            description: (body.description || '').slice(0, 5000),
            event_type: body.event_type || 'online',
            platform: body.platform || '',
            platform_link: body.platform_link || '',
            location: body.location || '',
            city: body.city || '',
            country: body.country || '',
            start_date: body.start_date,
            end_date: body.end_date || null,
            timezone: body.timezone || 'UTC',
            max_attendees: parseInt(body.max_attendees) || 0,
            cover_image: body.cover_image || '',
            tags: Array.isArray(body.tags) ? body.tags.slice(0, 10) : [],
            category: body.category || '',
            status: 'published'
        };

        var res = await fetch(
            supabaseUrl + '/rest/v1/community_events',
            {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(eventData)
            }
        );
        var data = await res.json();
        if (!res.ok) {
            return new Response(JSON.stringify({ ok: false, error: (data && data.message) || 'Failed to create event' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        var created = Array.isArray(data) ? data[0] : data;
        return new Response(JSON.stringify({ ok: true, event: created, message: 'Event created!' }), {
            status: 201, headers: corsHeaders(origin)
        });
    }

    if (action === 'rsvp') {
        var eventId = body.event_id;
        var rsvpStatus = body.status || 'going';

        if (!eventId) {
            return new Response(JSON.stringify({ ok: false, error: 'event_id required' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        if (!['going', 'interested', 'not_going'].includes(rsvpStatus)) {
            return new Response(JSON.stringify({ ok: false, error: 'Invalid RSVP status' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        var res = await fetch(
            supabaseUrl + '/rest/v1/rpc/rsvp_to_event',
            {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ p_event_id: eventId, p_uid: user.id, p_status: rsvpStatus })
            }
        );
        var data = await res.json();
        if (!res.ok) {
            return new Response(JSON.stringify({ ok: false, error: (data && data.message) || 'RSVP failed' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        return new Response(JSON.stringify({ ok: true, data: data }), {
            status: 200, headers: corsHeaders(origin)
        });
    }

    if (action === 'cancel') {
        var eventId = body.event_id;
        if (!eventId) {
            return new Response(JSON.stringify({ ok: false, error: 'event_id required' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        // Update event status to cancelled (only creator can do this via RLS)
        var res = await fetch(
            supabaseUrl + '/rest/v1/community_events?id=eq.' + encodeURIComponent(eventId) + '&creator_uid=eq.' + encodeURIComponent(user.id),
            {
                method: 'PATCH',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({ status: 'cancelled' })
            }
        );
        var data = await res.json();
        if (!res.ok || !data || !data.length) {
            return new Response(JSON.stringify({ ok: false, error: 'Failed to cancel event or not authorized' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        return new Response(JSON.stringify({ ok: true, message: 'Event cancelled' }), {
            status: 200, headers: corsHeaders(origin)
        });
    }

    return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), {
        status: 400, headers: corsHeaders(origin)
    });
}
