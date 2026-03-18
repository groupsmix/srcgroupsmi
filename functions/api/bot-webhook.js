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

const ALLOWED_ORIGINS = ['https://groupsmix.com', 'https://www.groupsmix.com'];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bot-Token',
        'Content-Type': 'application/json'
    };
}

function generateVerificationCode() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var code = 'GMX-';
    var bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    for (var i = 0; i < 6; i++) {
        code += chars[bytes[i] % chars.length];
    }
    return code;
}

function generateBotToken() {
    var bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
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

    if (request.method === 'GET') {
        const url = new URL(request.url);
        const action = url.searchParams.get('action');

        if (action === 'bot-instructions') {
            const platform = url.searchParams.get('platform') || 'whatsapp';
            var instructions = {};

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
                return new Response(JSON.stringify({ ok: false, error: 'group_id required' }), {
                    status: 400, headers: corsHeaders(origin)
                });
            }

            // Get bot integration record
            const res = await fetch(
                supabaseUrl + '/rest/v1/bot_integrations?group_id=eq.' + encodeURIComponent(groupId) + '&select=*&limit=1',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const records = await res.json();

            if (!records || !records.length) {
                // Generate new verification code
                var verificationCode = generateVerificationCode();
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

        return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    if (request.method === 'POST') {
        var body;
        try {
            body = await request.json();
        } catch(e) {
            return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
                status: 400, headers: corsHeaders(origin)
            });
        }

        const action = body.action;

        if (action === 'register') {
            // Register a new bot integration
            var verificationCode = generateVerificationCode();
            var botToken = generateBotToken();

            var record = {
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
                return new Response(JSON.stringify({ ok: false, error: 'Failed to register bot' }), {
                    status: 500, headers: corsHeaders(origin)
                });
            }

            const result = await res.json();
            return new Response(JSON.stringify({
                ok: true,
                verification_code: verificationCode,
                bot_token: botToken,
                message: 'Send this verification code in your group to complete setup'
            }), { status: 200, headers: corsHeaders(origin) });
        }

        if (action === 'sync') {
            // Sync member count and status
            var botToken = request.headers.get('X-Bot-Token') || body.bot_token;
            if (!botToken) {
                return new Response(JSON.stringify({ ok: false, error: 'Bot token required' }), {
                    status: 401, headers: corsHeaders(origin)
                });
            }

            var updates = {
                last_sync: new Date().toISOString(),
                status: 'active'
            };
            if (body.member_count !== undefined) updates.member_count = parseInt(body.member_count) || 0;
            if (body.active_members !== undefined) updates.active_members = parseInt(body.active_members) || 0;

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
                return new Response(JSON.stringify({ ok: false, error: 'Sync failed' }), {
                    status: 500, headers: corsHeaders(origin)
                });
            }

            return new Response(JSON.stringify({ ok: true, message: 'Sync successful' }), {
                status: 200, headers: corsHeaders(origin)
            });
        }

        if (action === 'verify') {
            var code = body.verification_code || body.code;
            if (!code) {
                return new Response(JSON.stringify({ ok: false, error: 'Verification code required' }), {
                    status: 400, headers: corsHeaders(origin)
                });
            }

            // Find pending integration with this code
            const res = await fetch(
                supabaseUrl + '/rest/v1/bot_integrations?verification_code=eq.' + encodeURIComponent(code) + '&status=eq.pending&limit=1',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const records = await res.json();

            if (!records || !records.length) {
                return new Response(JSON.stringify({ ok: false, error: 'Invalid or expired verification code' }), {
                    status: 404, headers: corsHeaders(origin)
                });
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

            return new Response(JSON.stringify({
                ok: true,
                message: 'Bot verified successfully! Your group is now connected to GroupsMix.'
            }), { status: 200, headers: corsHeaders(origin) });
        }

        return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), {
            status: 400, headers: corsHeaders(origin)
        });
    }

    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405, headers: corsHeaders(origin)
    });
}
