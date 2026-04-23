import { describe, it, expect } from 'vitest';
import { detectPlatform, isSafeHostname } from '../functions/api/health-check.js';

describe('isSafeHostname', () => {
    it('allows known invite domains', () => {
        expect(isSafeHostname('chat.whatsapp.com')).toBe(true);
        expect(isSafeHostname('t.me')).toBe(true);
        expect(isSafeHostname('discord.gg')).toBe(true);
    });

    it('rejects IPv4 literals', () => {
        expect(isSafeHostname('127.0.0.1')).toBe(false);
        expect(isSafeHostname('10.0.0.1')).toBe(false);
        expect(isSafeHostname('192.168.1.1')).toBe(false);
        expect(isSafeHostname('169.254.169.254')).toBe(false);
        expect(isSafeHostname('0.0.0.0')).toBe(false);
    });

    it('rejects IPv6 literals', () => {
        expect(isSafeHostname('[::1]')).toBe(false);
        expect(isSafeHostname('[::ffff:127.0.0.1]')).toBe(false);
        expect(isSafeHostname('[fe80::1]')).toBe(false);
    });

    it('rejects localhost', () => {
        expect(isSafeHostname('localhost')).toBe(false);
        expect(isSafeHostname('sub.localhost')).toBe(false);
    });
});

describe('detectPlatform (strict hostname matching)', () => {
    function parse(url) {
        return new URL(url);
    }

    it('detects WhatsApp group links', () => {
        expect(detectPlatform(parse('https://chat.whatsapp.com/ABC123'))).toBe('whatsapp');
        expect(detectPlatform(parse('https://wa.me/group123'))).toBe('whatsapp');
    });

    it('detects Telegram links', () => {
        expect(detectPlatform(parse('https://t.me/mygroup'))).toBe('telegram');
        expect(detectPlatform(parse('https://telegram.me/mygroup'))).toBe('telegram');
    });

    it('detects Discord invite links', () => {
        expect(detectPlatform(parse('https://discord.gg/abc123'))).toBe('discord');
        expect(detectPlatform(parse('https://discord.com/invite/abc123'))).toBe('discord');
    });

    it('detects Facebook group links', () => {
        expect(detectPlatform(parse('https://facebook.com/groups/mygroup'))).toBe('facebook');
        expect(detectPlatform(parse('https://www.facebook.com/groups/mygroup'))).toBe('facebook');
    });

    it('detects Signal group links', () => {
        expect(detectPlatform(parse('https://signal.group/#abc'))).toBe('signal');
    });

    it('detects Reddit links', () => {
        expect(detectPlatform(parse('https://reddit.com/r/mysubreddit'))).toBe('reddit');
        expect(detectPlatform(parse('https://www.reddit.com/r/mysubreddit'))).toBe('reddit');
    });

    it('rejects arbitrary URLs', () => {
        expect(detectPlatform(parse('https://evil.com/phishing'))).toBe('unknown');
        expect(detectPlatform(parse('https://google.com'))).toBe('unknown');
    });

    it('rejects domains that contain an allowed domain as substring', () => {
        expect(detectPlatform(parse('https://notchat.whatsapp.com.evil.com/abc'))).toBe('unknown');
        expect(detectPlatform(parse('https://evil.com/chat.whatsapp.com/abc'))).toBe('unknown');
        expect(detectPlatform(parse('https://fakechat.whatsapp.com/abc'))).toBe('unknown');
    });

    it('rejects Discord non-invite paths', () => {
        expect(detectPlatform(parse('https://discord.com/channels/123'))).toBe('unknown');
        expect(detectPlatform(parse('https://discord.com/app'))).toBe('unknown');
    });

    it('rejects Facebook non-group paths', () => {
        expect(detectPlatform(parse('https://facebook.com/profile/someone'))).toBe('unknown');
    });
});
