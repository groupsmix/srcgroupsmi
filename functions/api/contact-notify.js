/**
 * /api/contact-notify — Email notification for new contact form submissions
 *
 * Cloudflare Pages Function that sends an email notification to the site owner
 * when someone submits the contact form.
 *
 * Uses Resend API (free tier: 100 emails/day).
 *
 * Environment variables required (set in Cloudflare Pages dashboard):
 *   RESEND_API_KEY     — Your Resend API key (get from https://resend.com)
 *   CONTACT_EMAIL_TO   — Email address to receive notifications (your Gmail)
 */

import { corsHeaders as _corsHeaders, handlePreflight } from './_shared/cors.js';
import { checkRateLimit } from './_shared/rate-limit.js';
import { verifyTurnstile } from './_shared/turnstile.js';

function corsHeaders(origin) {
    return _corsHeaders(origin, { 'Content-Type': 'application/json' });
}

/* ── Rate limit config ── */
const CONTACT_LIMIT = { window: 60000, max: 3 };

/* ── Main handler ───────────────────────────────────────────────── */
export async function onRequest(context) {
    const { request } = context;
    const origin = request.headers.get('Origin') || '';

    // Handle CORS preflight
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
    const kvStore = context.env?.RATE_LIMIT_KV || null;
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
    const turnstileResult = await verifyTurnstile(turnstileToken, context.env?.TURNSTILE_SECRET_KEY, ip);
    if (!turnstileResult.success) {
        return new Response(
            JSON.stringify({ ok: false, error: turnstileResult.error }),
            { status: 403, headers: corsHeaders(origin) }
        );
    }

    const resendKey = context.env?.RESEND_API_KEY;
    const contactTo = context.env?.CONTACT_EMAIL_TO;

    if (!resendKey || !contactTo) {
        console.error('contact-notify: RESEND_API_KEY or CONTACT_EMAIL_TO not configured');
        return new Response(
            JSON.stringify({ ok: false, error: 'Email service not configured' }),
            { status: 503, headers: corsHeaders(origin) }
        );
    }

    const { name, email, subject, message } = body;

    if (!name || !email || !message) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Missing required fields' }),
            { status: 422, headers: corsHeaders(origin) }
        );
    }

    // Subject label mapping
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

    // Build the email HTML
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

        if (!res.ok) {
            const errData = await res.text();
            console.error('Resend API error:', res.status, errData);
            return new Response(
                JSON.stringify({ ok: false, error: 'Failed to send notification' }),
                { status: 502, headers: corsHeaders(origin) }
            );
        }

        return new Response(
            JSON.stringify({ ok: true }),
            { status: 200, headers: corsHeaders(origin) }
        );
    } catch (err) {
        console.error('contact-notify error:', err);
        // Don't break the form if email fails
        return new Response(
            JSON.stringify({ ok: true, warning: 'Email notification failed but form was saved' }),
            { status: 200, headers: corsHeaders(origin) }
        );
    }
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
