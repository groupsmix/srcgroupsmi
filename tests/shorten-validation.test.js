import { describe, it, expect } from 'vitest';

/**
 * Tests for URL validation logic used in the shorten endpoint.
 * We re-implement the pure functions here to test them in isolation
 * (the originals are not exported from shorten.js).
 */

function isValidUrl(url) {
    if (typeof url !== 'string') return false;
    try {
        const u = new URL(url);
        return u.protocol === 'https:';
    } catch {
        return false;
    }
}

const ALLOWED_LINK_DOMAINS = [
    'chat.whatsapp.com',
    't.me', 'telegram.me',
    'discord.gg', 'discord.com/invite',
    'facebook.com/groups', 'www.facebook.com/groups', 'fb.com/groups'
];

function isAllowedGroupLink(url) {
    try {
        const u = new URL(url);
        const hostname = u.hostname.toLowerCase();
        const pathname = u.pathname.toLowerCase();
        const hostAndPath = hostname + pathname;
        return ALLOWED_LINK_DOMAINS.some(function(domain) {
            if (domain.includes('/')) {
                return hostAndPath.startsWith(domain) || hostAndPath.startsWith('www.' + domain);
            }
            return hostname === domain || hostname.endsWith('.' + domain);
        });
    } catch {
        return false;
    }
}

describe('isValidUrl', () => {
    it('accepts valid HTTPS URLs', () => {
        expect(isValidUrl('https://chat.whatsapp.com/abc123')).toBe(true);
        expect(isValidUrl('https://t.me/mygroup')).toBe(true);
    });

    it('rejects HTTP URLs', () => {
        expect(isValidUrl('http://chat.whatsapp.com/abc')).toBe(false);
    });

    it('rejects non-string input', () => {
        expect(isValidUrl(null)).toBe(false);
        expect(isValidUrl(undefined)).toBe(false);
        expect(isValidUrl(123)).toBe(false);
    });

    it('rejects invalid URLs', () => {
        expect(isValidUrl('not-a-url')).toBe(false);
        expect(isValidUrl('')).toBe(false);
    });
});

describe('isAllowedGroupLink', () => {
    it('allows WhatsApp group links', () => {
        expect(isAllowedGroupLink('https://chat.whatsapp.com/ABC123')).toBe(true);
    });

    it('allows Telegram links', () => {
        expect(isAllowedGroupLink('https://t.me/mygroup')).toBe(true);
        expect(isAllowedGroupLink('https://telegram.me/mygroup')).toBe(true);
    });

    it('allows Discord invite links', () => {
        expect(isAllowedGroupLink('https://discord.gg/abc123')).toBe(true);
        expect(isAllowedGroupLink('https://discord.com/invite/abc123')).toBe(true);
    });

    it('allows Facebook group links', () => {
        expect(isAllowedGroupLink('https://facebook.com/groups/mygroup')).toBe(true);
        expect(isAllowedGroupLink('https://www.facebook.com/groups/mygroup')).toBe(true);
    });

    it('rejects arbitrary URLs', () => {
        expect(isAllowedGroupLink('https://evil.com/phishing')).toBe(false);
        expect(isAllowedGroupLink('https://google.com')).toBe(false);
    });

    it('rejects non-group Facebook links', () => {
        expect(isAllowedGroupLink('https://facebook.com/profile/someone')).toBe(false);
    });

    it('handles invalid input gracefully', () => {
        expect(isAllowedGroupLink('not-a-url')).toBe(false);
        expect(isAllowedGroupLink('')).toBe(false);
    });
});
