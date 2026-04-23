/**
 * /api/contact-notify — Persist + email notify for contact form submissions
 *
 * Cloudflare Pages Function. Every submission is first persisted to the
 * `contact_submissions` table (via the Supabase service-role key) so a
 * misconfigured email provider can never silently drop a message. An
 * email notification is then attempted via Resend; failure of the email
 * is logged on the row but still returns 200 to the client because the
 * message was durably captured.
 *
 * Environment variables:
 *   SUPABASE_URL            — Required; used to persist submissions
 *   SUPABASE_SERVICE_KEY    — Required; used to persist submissions
 *   RESEND_API_KEY          — Optional; enables email notifications
 *   CONTACT_EMAIL_TO        — Required iff RESEND_API_KEY is set
 *   TURNSTILE_SECRET_KEY    — Required; CAPTCHA secret for server-side verify
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';
import { checkRateLimit } from './_shared/rate-limit.js';
import { verifyTurnstile } from './_shared/turnstile.js';

function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

/* ── Rate limit config ── */
const CONTACT_LIMIT = { window: 60000, max: 3 };

/* ── Persist submission to Supabase ─────────────────────────────── */
async function persistSubmission(env, payload) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return { ok: false, id: null, err: 'not_configured' };

    try {
        const res = await fetch(supabaseUrl + '/rest/v1/contact_submissions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify([payload])
        });
        if (!res.ok) {
            const errText = await res.text();
            console.error('contact-notify: persist failed', res.status, errText);
            return { ok: false, id: null, err: 'persist_failed' };
        }
        const rows = await res.json();
        return { ok: true, id: rows?.[0]?.id || null, err: null };
    } catch (err) {
        console.error('contact-notify: persist error', err);
        return { ok: false, id: null, err: 'persist_error' };
    }
}

async function markSubmission(env, id, patch) {
    if (!id) return;
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return;
    try {
        await fetch(supabaseUrl + '/rest/v1/contact_submissions?id=eq.' + encodeURIComponent(id), {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify(patch)
        });
    } catch (err) {
        console.warn('contact-notify: mark error', err?.message || err);
    }
}

/* ── Main handler ───────────────────────────────────────────────── */
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

    // Rate limiting
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const kvStore = env?.RATE_LIMIT_KV || null;
    const allowed = await checkRateLimit(ip, 'contact', CONTACT_LIMIT, kvStore);
    if (!allowed) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Too many requests. Try again later.' }),
            { status: 429, headers: corsHeaders(origin) }
        );
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
            { status: 400, headers: corsHeaders(origin) }
        );
    }

    // Turnstile CAPTCHA verification
    const turnstileToken = body['cf-turnstile-response'] || body.turnstileToken || '';
    const turnstileResult = await verifyTurnstile(turnstileToken, env?.TURNSTILE_SECRET_KEY, ip);
    if (!turnstileResult.success) {
        return new Response(
            JSON.stringify({ ok: false, error: turnstileResult.error }),
            { status: 403, headers: corsHeaders(origin) }
        );
    }

    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 200) : '';
    const email = typeof body?.email === 'string' ? body.email.trim().slice(0, 320) : '';
    const subject = typeof body?.subject === 'string' ? body.subject.trim().slice(0, 100) : '';
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 5000) : '';

    if (!name || !email || !message) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Missing required fields' }),
            { status: 422, headers: corsHeaders(origin) }
        );
    }

    // 1. Persist submission. If we cannot persist AND cannot email,
    //    the submission is effectively lost → return 503 so the
    //    client surfaces an error instead of seeing "success".
    const resendKey = env?.RESEND_API_KEY;
    const contactTo = env?.CONTACT_EMAIL_TO;

    const persisted = await persistSubmission(env, {
        name,
        email,
        subject,
        message,
        ip: request.headers.get('CF-Connecting-IP') || '',
        user_agent: (request.headers.get('User-Agent') || '').slice(0, 500)
    });

    if (!persisted.ok && (!resendKey || !contactTo)) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Contact pipeline unavailable' }),
            { status: 503, headers: corsHeaders(origin) }
        );
    }

    // 2. If email is unconfigured we still succeed — the submission
    //    is durably captured in contact_submissions.
    if (!resendKey || !contactTo) {
        console.warn('contact-notify: RESEND_API_KEY or CONTACT_EMAIL_TO not configured; persisted only');
        return new Response(
            JSON.stringify({ ok: true, persisted: !!persisted.id, emailed: false }),
            { status: 200, headers: corsHeaders(origin) }
        );
    }

    const subjectLabels = {
        general: 'General Inquiry',
        support: 'Technical Support',
        report: 'Report an Issue',
        partnership: 'Partnership / Advertising',
        feature: 'Feature Request',
        billing: 'Billing & Payments',
        account: 'Account & Privacy'
    };
    const subjectLabel = subjectLabels[subject] || subject || 'General Inquiry';

    const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9fb;border-radius:12px;overflow:hidden;border:1px solid #e0e0e8">
            <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 32px;color:#fff">
                <h1 style="margin:0;font-size:20px">New Contact Message</h1>
                <p style="margin:8px 0 0;opacity:0.9;font-size:14px">GroupsMix Contact Form</p>
            </div>
            <div style="padding:24px 32px">
                <table style="width:100%;border-collapse:collapse;font-size:14px">
                    <tr>
                        <td style="padding:10px 0;color:#666;width:100px;vertical-align:top"><strong>From:</strong></td>
                        <td style="padding:10px 0;color:#333">${escapeHtml(name)}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px 0;color:#666;vertical-align:top"><strong>Email:</strong></td>
                        <td style="padding:10px 0;color:#333"><a href="mailto:${escapeHtml(email)}" style="color:#6366f1">${escapeHtml(email)}</a></td>
                    </tr>
                    <tr>
                        <td style="padding:10px 0;color:#666;vertical-align:top"><strong>Subject:</strong></td>
                        <td style="padding:10px 0;color:#333">${escapeHtml(subjectLabel)}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px 0;color:#666;vertical-align:top"><strong>Message:</strong></td>
                        <td style="padding:10px 0;color:#333;white-space:pre-wrap;line-height:1.6">${escapeHtml(message)}</td>
                    </tr>
                </table>
            </div>
            <div style="padding:16px 32px;background:#f0f0f5;font-size:12px;color:#888;text-align:center">
                Sent from GroupsMix Contact Form &bull; <a href="https://groupsmix.com/contact" style="color:#6366f1">groupsmix.com</a>
            </div>
        </div>
    `;

    let emailOk = false;
    let emailErr = '';
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + resendKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'GroupsMix <noreply@groupsmix.com>',
                to: [contactTo],
                subject: '[GroupsMix Contact] ' + subjectLabel + ' - ' + name,
                html: htmlBody,
                reply_to: email
            })
        });
        if (res.ok) {
            emailOk = true;
        } else {
            emailErr = (await res.text()).slice(0, 500);
            console.error('Resend API error:', res.status, emailErr);
        }
    } catch (err) {
        emailErr = String(err?.message || err).slice(0, 500);
        console.error('contact-notify email error:', emailErr);
    }

    await markSubmission(env, persisted.id, {
        email_sent: emailOk,
        email_error: emailOk ? null : emailErr
    });

    if (!emailOk && !persisted.ok) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Failed to deliver message' }),
            { status: 502, headers: corsHeaders(origin) }
        );
    }

    return new Response(
        JSON.stringify({ ok: true, persisted: !!persisted.id, emailed: emailOk }),
        { status: 200, headers: corsHeaders(origin) }
    );
}

/* ── Utility: escape HTML to prevent XSS in email body ──────────── */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
