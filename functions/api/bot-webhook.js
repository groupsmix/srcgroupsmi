/**
 * /api/bot-webhook — WhatsApp/Telegram Bot Integration Webhook
 *
 * POST /api/bot-webhook  — Receive updates from bots
 *   { action: 'register', platform, group_link, group_name, admin_uid }
 *   { action: 'sync', group_id, member_count, active_members }
 *   { action: 'verify', group_id, verification_code }
 *
 * GET /api/bot-webhook?action=bot-config&group_id=X  — Get bot config for a group
 * GET /api/bot-webhook?action=bot-instructions&platform=whatsapp — Get setup instructions
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';
import { errorResponse, successResponse } from './_shared/response.js';
import { requireAuthWithOwnership } from './_shared/auth.js';

function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

function generateVerificationCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'GMX-';
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 6; i++) {
        code += chars[bytes[i] % chars.length];
    }
    return code;
}

function generateBotToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => { return b.toString(16).padStart(2, '0'); }).join('');
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
        return errorResponse('Service not configured', 503, origin);
    }

    if (request.method === 'GET') {
        const url = new URL(request.url);
        const action = url.searchParams.get('action');

        if (action === 'bot-instructions') {
            const platform = url.searchParams.get('platform') || 'whatsapp';
            let instructions = {};

            if (platform === 'whatsapp') {
                instructions = {
                    platform: 'whatsapp',
                    title: 'WhatsApp Bot Setup',
                    steps: [
                        'Go to your Group Settings on GroupsMix',
                        'Click "Connect Bot" and copy your verification code',
                        'Add the GroupsMix Bot number to your WhatsApp group',
                        'Send the verification code in the group chat',
                        'The bot will auto-sync your group details to GroupsMix',
                        'Member count and trust score update automatically'
                    ],
                    features: [
                        'Auto-sync member count every 24 hours',
                        'Real-time trust score updates',
                        'Scam protection alerts',
                        'Auto-post group to GroupsMix directory',
                        'Group health monitoring'
                    ],
                    bot_number: '+1-555-GMX-BOT'
                };
            } else if (platform === 'telegram') {
                instructions = {
                    platform: 'telegram',
                    title: 'Telegram Bot Setup',
                    steps: [
                        'Go to your Group Settings on GroupsMix',
                        'Click "Connect Bot" and copy your verification code',
                        'Add @GroupsMixBot to your Telegram group as admin',
                        'Send /verify YOUR_CODE in the group',
                        'The bot will auto-sync your group details to GroupsMix',
                        'Member count and trust score update automatically'
                    ],
                    features: [
                        'Auto-sync member count in real-time',
                        'Real-time trust score updates',
                        'Scam detection and alerts',
                        'Auto-post group to GroupsMix directory',
                        'Group analytics in Telegram',
                        '/stats command for quick group insights'
                    ],
                    bot_username: '@GroupsMixBot'
                };
            }

            return new Response(JSON.stringify({ ok: true, instructions: instructions }), {
                status: 200, headers: corsHeaders(origin)
            });
        }

        if (action === 'bot-config') {
            const groupId = url.searchParams.get('group_id');
            if (!groupId) {
                return errorResponse('group_id required', 400, origin);
            }

            // Get bot integration record
            const res = await fetch(
                supabaseUrl + '/rest/v1/bot_integrations?group_id=eq.' + encodeURIComponent(groupId) + '&select=*&limit=1',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const records = await res.json();

            if (!records || !records.length) {
                // Generate new verification code
                const verificationCode = generateVerificationCode();
                return new Response(JSON.stringify({
                    ok: true,
                    connected: false,
                    verification_code: verificationCode,
                    message: 'Use this code to verify your bot connection'
                }), { status: 200, headers: corsHeaders(origin) });
            }

            return new Response(JSON.stringify({
                ok: true,
                connected: true,
                config: {
                    platform: records[0].platform,
                    status: records[0].status,
                    last_sync: records[0].last_sync,
                    member_count: records[0].member_count,
                    connected_at: records[0].created_at
                }
            }), { status: 200, headers: corsHeaders(origin) });
        }

        return errorResponse('Unknown action', 400, origin);
    }

    if (request.method === 'POST') {
        let body;
        try {
            body = await request.json();
        } catch(_e) {
            return errorResponse('Invalid JSON', 400, origin);
        }

        const action = body.action;

        if (action === 'register') {
            // Verify authentication and ownership for register action
            if (body.admin_uid) {
                const regAuth = await requireAuthWithOwnership(request, env, corsHeaders(origin), body.admin_uid);
                if (regAuth instanceof Response) return regAuth;
            }

            // Register a new bot integration
            const verificationCode = generateVerificationCode();
            const botToken = generateBotToken();

            const record = {
                group_id: body.group_id || null,
                platform: body.platform || 'whatsapp',
                admin_uid: body.admin_uid || null,
                group_name: body.group_name || '',
                group_link: body.group_link || '',
                verification_code: verificationCode,
                bot_token: botToken,
                status: 'pending',
                member_count: 0
            };

            const res = await fetch(supabaseUrl + '/rest/v1/bot_integrations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(record)
            });

            if (!res.ok) {
                return errorResponse('Failed to register bot', 500, origin);
            }

            const _result = await res.json();
            return new Response(JSON.stringify({
                ok: true,
                verification_code: verificationCode,
                bot_token_hint: botToken.substring(0, 8) + '...',
                message: 'Bot registered. Token has been saved. Use the verification code in your group.'
            }), { status: 200, headers: corsHeaders(origin) });
        }

        if (action === 'sync') {
            // Sync member count and status
            const botToken = request.headers.get('X-Bot-Token') || body.bot_token;
            if (!botToken) {
                return errorResponse('Bot token required', 401, origin);
            }

            const updates = {
                last_sync: new Date().toISOString(),
                status: 'active'
            };
            if (body.member_count !== undefined) updates.member_count = parseInt(body.member_count, 10) || 0;
            if (body.active_members !== undefined) updates.active_members = parseInt(body.active_members, 10) || 0;

            const res = await fetch(
                supabaseUrl + '/rest/v1/bot_integrations?bot_token=eq.' + encodeURIComponent(botToken),
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify(updates)
                }
            );

            if (!res.ok) {
                return errorResponse('Sync failed', 500, origin);
            }

            return successResponse({ message: 'Sync successful' }, origin);
        }

        if (action === 'verify') {
            const code = body.verification_code || body.code;
            if (!code) {
                return errorResponse('Verification code required', 400, origin);
            }

            // Find pending integration with this code
            const res = await fetch(
                supabaseUrl + '/rest/v1/bot_integrations?verification_code=eq.' + encodeURIComponent(code) + '&status=eq.pending&limit=1',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const records = await res.json();

            if (!records || !records.length) {
                return errorResponse('Invalid or expired verification code', 404, origin);
            }

            // Mark as verified
            await fetch(
                supabaseUrl + '/rest/v1/bot_integrations?id=eq.' + encodeURIComponent(records[0].id),
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    },
                    body: JSON.stringify({
                        status: 'active',
                        verified_at: new Date().toISOString()
                    })
                }
            );

            return successResponse({ message: 'Bot verified successfully! Your group is now connected to GroupsMix.' }, origin);
        }

        return errorResponse('Unknown action', 400, origin);
    }

    return errorResponse('Method not allowed', 405, origin);
}
