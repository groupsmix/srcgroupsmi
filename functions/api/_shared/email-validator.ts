export const DISPOSABLE_DOMAINS: Set<string> = new Set([
    'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com', 'yopmail.com',
    'temp-mail.org', 'fakeinbox.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
    'dispostable.com', 'trashmail.com', 'mailnesia.com', 'maildrop.cc', 'discard.email',
    'mailcatch.com', 'tempail.com', 'tempr.email', '10minutemail.com', 'mohmal.com',
    'burnermail.io', 'temp-mail.io', 'tmpmail.net', 'tmpmail.org', 'boun.cr',
    'mailtemp.net', 'emailondeck.com', '33mail.com', 'getnada.com', 'inboxkitten.com',
    'throwmail.com', 'trashmail.net', 'mytemp.email', 'tempmailo.com', 'emailtemp.org',
    'crazymailing.com', 'mailsac.com', 'tempmailco.com', 'tempmailer.com', 'getairmail.com',
    'trash-mail.com', 'one-time.email', 'moakt.com', 'tmail.ws', 'tempsky.com',
    'mailexpire.com', 'emailfake.com', 'throwawaymail.com', 'spamgourmet.com', 'jetable.org'
]);

export function validateEmail(email: string): string | null {
    if (typeof email !== 'string') return 'Invalid email address';
    const trimmed = email.trim().toLowerCase();
    if (trimmed.length > 254) return 'Email address is too long';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Invalid email format';
    const domain = trimmed.split('@')[1];
    if (!domain) return 'Invalid email domain';
    if (DISPOSABLE_DOMAINS.has(domain)) return 'Disposable email addresses are not allowed';
    return null; // valid
}
