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
        const limit = parseInt(url.searchParams.get('limit'), 10) || 20;
        const offset = parseInt(url.searchParams.get('offset'), 10) || 0;
        const category = url.searchParams.get('category') || '';
        const eventType = url.searchParams.get('event_type') || '';
        const country = url.searchParams.get('country') || '';
        const groupId = url.searchParams.get('group_id') || '';
        const _search = url.searchParams.get('search') || '';

        const res = await fetch(
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
        const data = await res.json();
        if (!res.ok) {
            return new Response(JSON.stringify({ ok: false, error: (data && data.message) || 'Failed to fetch events' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        // Filter by group_id client-side if provided (RPC doesn't support it directly)
        let events = Array.isArray(data) ? data : [];
        if (groupId) {
            events = events.filter((e) => { return e.group_id === groupId; });
        }

        return new Response(JSON.stringify({ ok: true, events: events, total: events.length }), {
            status: 200, headers: corsHeaders(origin)
        });
    }

    if (action === 'detail') {
        const eventId = url.searchParams.get('event_id');
        if (!eventId) {
            return new Response(JSON.stringify({ ok: false, error: 'event_id required' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        const res = await fetch(
            supabaseUrl + '/rest/v1/community_events?id=eq.' + encodeURIComponent(eventId) + '&select=*&limit=1',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const data = await res.json();
        if (!data || !data.length) {
            return new Response(JSON.stringify({ ok: false, error: 'Event not found' }), {
                status: 404, headers: corsHeaders(origin)
            });
        }

        const event = data[0];

        // Get group info
        if (event.group_id) {
            const groupRes = await fetch(
                supabaseUrl + '/rest/v1/groups?id=eq.' + encodeURIComponent(event.group_id) + '&select=id,name,platform,is_verified&limit=1',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const groupData = await groupRes.json();
            if (groupData && groupData.length) {
                event.group_name = groupData[0].name;
                event.group_platform = groupData[0].platform;
                event.group_is_verified = groupData[0].is_verified || false;
            }
        }

        // Get RSVP counts
        const rsvpRes = await fetch(
            supabaseUrl + '/rest/v1/event_rsvps?event_id=eq.' + encodeURIComponent(eventId) + '&select=status',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const rsvps = await rsvpRes.json();
        event.rsvp_count = (rsvps || []).filter((r) => { return r.status === 'going'; }).length;
        event.interested_count = (rsvps || []).filter((r) => { return r.status === 'interested'; }).length;

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

    if (action === 'recommendations') {
        // Smart event recommendations based on user's groups and engagement topics
        const userId = url.searchParams.get('user_id') || '';
        const recLimit = parseInt(url.searchParams.get('limit'), 10) || 10;

        // Get user's group memberships and interests
        let userGroups = [];
        let userCategories = [];
        let userCountry = '';

        if (userId) {
            try {
                // Get groups the user is associated with
                const userGroupsRes = await fetch(
                    supabaseUrl + '/rest/v1/groups?submitted_by=eq.' + encodeURIComponent(userId) + '&status=eq.approved&select=id,category,country,tags&limit=20',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                userGroups = await userGroupsRes.json();
                if (Array.isArray(userGroups)) {
                    userCategories = [...new Set(userGroups.map((g) => { return g.category; }).filter(Boolean))];
                    // Get most common country
                    const countryCounts = {};
                    userGroups.forEach((g) => {
                        if (g.country) countryCounts[g.country] = (countryCounts[g.country] || 0) + 1;
                    });
                    const topCountry = Object.entries(countryCounts).sort((a, b) => { return b[1] - a[1]; })[0];
                    if (topCountry) userCountry = topCountry[0];
                }
            } catch (e) {
                console.error('Error fetching user groups for recommendations:', e);
            }
        }

        // Fetch upcoming events
        const eventsRes = await fetch(
            supabaseUrl + '/rest/v1/rpc/get_upcoming_events',
            {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ p_limit: 50, p_offset: 0, p_category: '', p_event_type: '', p_country: '' })
            }
        );
        let allEvents = await eventsRes.json();
        allEvents = Array.isArray(allEvents) ? allEvents : [];

        // Get user's engagement topics from feed interactions if available
        let engagementTopics = [];
        if (userId) {
            try {
                const interestsRes = await fetch(
                    supabaseUrl + '/rest/v1/user_interests?user_id=eq.' + encodeURIComponent(userId) + '&select=category,weight&order=weight.desc&limit=10',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                const interests = await interestsRes.json();
                if (Array.isArray(interests)) {
                    engagementTopics = interests.map((i) => { return { category: i.category, weight: i.weight || 1 }; });
                }
            } catch (_e) {
                // silently continue without engagement data
            }
        }

        // Score events by relevance to user
        const scoredEvents = allEvents.map((evt) => {
            let score = 0;

            // Category match (strongest signal)
            if (evt.category && userCategories.indexOf(evt.category) !== -1) score += 40;

            // Engagement topic signals (from feed interactions / implicit feedback)
            engagementTopics.forEach((topic) => {
                if (evt.category === topic.category) {
                    score += 25 * Math.min(3, topic.weight); // weighted by engagement strength
                }
            });

            // Tag overlap with user's group tags
            const evtTags = (evt.tags || []).map((t) => { return (t || '').toLowerCase(); });
            userGroups.forEach((g) => {
                (g.tags || []).forEach((t) => {
                    if (evtTags.indexOf((t || '').toLowerCase()) !== -1) score += 10;
                });
            });

            // Country match
            if (userCountry && evt.country === userCountry) score += 20;

            // Group match (event is from a group the user owns/follows)
            if (evt.group_id) {
                const isUserGroup = userGroups.some((g) => { return g.id === evt.group_id; });
                if (isUserGroup) score += 50;
            }

            // Recency bonus (events happening sooner get a slight boost)
            const daysUntil = (new Date(evt.start_date) - Date.now()) / 86400000;
            if (daysUntil > 0 && daysUntil <= 7) score += 15;
            else if (daysUntil > 7 && daysUntil <= 30) score += 5;

            // Popularity bonus
            if (evt.rsvp_count > 10) score += 10;
            if (evt.rsvp_count > 50) score += 10;

            // Verified group bonus
            if (evt.group_is_verified) score += 10;

            evt._relevance_score = score;
            return evt;
        });

        scoredEvents.sort((a, b) => { return b._relevance_score - a._relevance_score; });
        const recommended = scoredEvents.slice(0, recLimit);
        recommended.forEach((evt) => { delete evt._relevance_score; });

        return new Response(JSON.stringify({
            ok: true,
            events: recommended,
            total: recommended.length,
            personalized: !!userId
        }), { status: 200, headers: corsHeaders(origin) });
    }

    if (action === 'attendance-prediction') {
        // Attendance prediction based on RSVP velocity
        const predEventId = url.searchParams.get('event_id');
        if (!predEventId) {
            return new Response(JSON.stringify({ ok: false, error: 'event_id required' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        // Get event details
        const predEventRes = await fetch(
            supabaseUrl + '/rest/v1/community_events?id=eq.' + encodeURIComponent(predEventId) + '&select=*&limit=1',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const predEvents = await predEventRes.json();
        if (!predEvents || !predEvents.length) {
            return new Response(JSON.stringify({ ok: false, error: 'Event not found' }), {
                status: 404, headers: corsHeaders(origin)
            });
        }
        const predEvent = predEvents[0];

        // Get all RSVPs with timestamps
        const predRsvpRes = await fetch(
            supabaseUrl + '/rest/v1/event_rsvps?event_id=eq.' + encodeURIComponent(predEventId) + '&select=status,created_at&order=created_at.asc',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        let predRsvps = await predRsvpRes.json();
        predRsvps = Array.isArray(predRsvps) ? predRsvps : [];

        const goingCount = predRsvps.filter((r) => { return r.status === 'going'; }).length;
        const interestedCount = predRsvps.filter((r) => { return r.status === 'interested'; }).length;
        const maxAttendees = predEvent.max_attendees || 0;

        // Calculate RSVP velocity (RSVPs per day)
        const eventCreated = new Date(predEvent.created_at);
        const now = new Date();
        const daysLive = Math.max(1, (now - eventCreated) / 86400000);
        const rsvpVelocity = goingCount / daysLive;

        // Calculate days until event
        const eventStart = new Date(predEvent.start_date);
        const daysUntilEvent = Math.max(0, (eventStart - now) / 86400000);

        // Get historical event data for same category/group to improve prediction
        let historicalMultiplier = 1.0;
        if (predEvent.category || predEvent.group_id) {
            try {
                let histQuery = supabaseUrl + '/rest/v1/community_events?start_date=lt.' + encodeURIComponent(new Date().toISOString()) + '&select=id,rsvp_count,max_attendees,category,group_id&limit=50&order=start_date.desc';
                if (predEvent.category) histQuery += '&category=eq.' + encodeURIComponent(predEvent.category);
                const histRes = await fetch(histQuery, { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } });
                const histEvents = await histRes.json();
                if (Array.isArray(histEvents) && histEvents.length >= 3) {
                    const avgHistRsvps = histEvents.reduce((s, e) => { return s + (e.rsvp_count || 0); }, 0) / histEvents.length;
                    if (avgHistRsvps > 0 && goingCount > 0) {
                        // If current velocity is above historical average, boost projection
                        const currentPace = goingCount / daysLive;
                        const historicalPace = avgHistRsvps / 14; // assume avg 2 week event lifecycle
                        if (currentPace > historicalPace * 1.5) historicalMultiplier = 1.2;
                        else if (currentPace < historicalPace * 0.5) historicalMultiplier = 0.8;
                    }
                }
            } catch (_e) {
                // continue with default multiplier
            }
        }

        // Predict total RSVPs by event date (enhanced with historical data)
        const projectedTotal = Math.round((goingCount + (rsvpVelocity * daysUntilEvent)) * historicalMultiplier);

        // Determine fill-up likelihood
        const fillPercentage = maxAttendees > 0 ? (goingCount / maxAttendees * 100) : 0;
        const projectedFillPercentage = maxAttendees > 0 ? (projectedTotal / maxAttendees * 100) : 0;

        let badge = 'normal';
        let badgeLabel = 'Open';
        let badgeLabelAr = '\u0645\u0641\u062a\u0648\u062d';

        if (maxAttendees > 0) {
            if (fillPercentage >= 90) {
                badge = 'almost-full';
                badgeLabel = 'Almost Full!';
                badgeLabelAr = '\u0639\u0644\u0649 \u0648\u0634\u0643 \u0627\u0644\u0627\u0645\u062a\u0644\u0627\u0621!';
            } else if (projectedFillPercentage >= 100) {
                badge = 'likely-full';
                badgeLabel = 'Likely to Fill Up';
                badgeLabelAr = '\u0645\u0646 \u0627\u0644\u0645\u062d\u062a\u0645\u0644 \u0623\u0646 \u064a\u0645\u062a\u0644\u0626';
            } else if (rsvpVelocity > 5) {
                badge = 'trending';
                badgeLabel = 'Trending';
                badgeLabelAr = '\u0631\u0627\u0626\u062c';
            } else if (projectedFillPercentage >= 70) {
                badge = 'filling-fast';
                badgeLabel = 'Filling Fast';
                badgeLabelAr = '\u064a\u0645\u062a\u0644\u0626 \u0628\u0633\u0631\u0639\u0629';
            }
        } else {
            // No max attendees — use velocity-based badges
            if (rsvpVelocity > 10) {
                badge = 'hot';
                badgeLabel = 'Hot Event';
                badgeLabelAr = '\u062d\u062f\u062b \u0633\u0627\u062e\u0646';
            } else if (rsvpVelocity > 3) {
                badge = 'trending';
                badgeLabel = 'Trending';
                badgeLabelAr = '\u0631\u0627\u0626\u062c';
            }
        }

        return new Response(JSON.stringify({
            ok: true,
            prediction: {
                event_id: predEventId,
                current_going: goingCount,
                current_interested: interestedCount,
                max_attendees: maxAttendees,
                rsvp_velocity_per_day: parseFloat(rsvpVelocity.toFixed(2)),
                days_until_event: parseFloat(daysUntilEvent.toFixed(1)),
                projected_total_rsvps: projectedTotal,
                fill_percentage: parseFloat(fillPercentage.toFixed(1)),
                projected_fill_percentage: parseFloat(projectedFillPercentage.toFixed(1)),
                badge: badge,
                badge_label: badgeLabel,
                badge_label_ar: badgeLabelAr
            }
        }), { status: 200, headers: corsHeaders(origin) });
    }

    return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), {
        status: 400, headers: corsHeaders(origin)
    });
}

async function handlePost(request, user, supabaseUrl, supabaseKey, origin) {
    let body;
    try {
        body = await request.json();
    } catch (_e) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    const action = body.action;

    if (action === 'create') {
        if (!body.title || !body.start_date) {
            return new Response(JSON.stringify({ ok: false, error: 'title and start_date are required' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        const eventData = {
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
            max_attendees: parseInt(body.max_attendees, 10) || 0,
            cover_image: body.cover_image || '',
            tags: Array.isArray(body.tags) ? body.tags.slice(0, 10) : [],
            category: body.category || '',
            status: 'published'
        };

        const res = await fetch(
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
        const data = await res.json();
        if (!res.ok) {
            return new Response(JSON.stringify({ ok: false, error: (data && data.message) || 'Failed to create event' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        const created = Array.isArray(data) ? data[0] : data;
        return new Response(JSON.stringify({ ok: true, event: created, message: 'Event created!' }), {
            status: 201, headers: corsHeaders(origin)
        });
    }

    if (action === 'rsvp') {
        const eventId = body.event_id;
        const rsvpStatus = body.status || 'going';

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

        const res = await fetch(
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
        const data = await res.json();
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
        const eventId = body.event_id;
        if (!eventId) {
            return new Response(JSON.stringify({ ok: false, error: 'event_id required' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        // Update event status to cancelled (only creator can do this via RLS)
        const res = await fetch(
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
        const data = await res.json();
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
