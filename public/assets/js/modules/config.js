// ─── Module: config ───
// Exports: CONFIG

// ═══════════════════════════════════════
// MODULE 1: CONFIG
// ═══════════════════════════════════════
const CONFIG = {
    siteName: 'GroupsMix',
    // Issue 14 fix: environment-aware siteUrl — uses current origin at runtime,
    // falls back to production domain for non-browser contexts (e.g. build/SSR)
    siteUrl: (typeof window !== 'undefined' && window.location && window.location.origin !== 'null')
        ? window.location.origin
        : 'https://groupsmix.com',
    supabaseUrl: 'https://hmlqppacanpxmrfdlkec.supabase.co',
    perPage: 12,
    adminPerPage: 20,
    maxToasts: 3,
    toastDuration: 4000,
    debounceDelay: 300,
    timeoutDuration: 5000,
    defaultSort: 'ranking',
    defaultTheme: 'dark',
    turnstileSiteKey: '0x4AAAAAACfjfwpiZdD7LJB4',
    cacheDurations: {
        // Issue #16 fix: extended cache durations to reduce frequent API calls
        settings: 600000, homepage: 300000, groups: 600000, group: 600000,
        stats: 1800000, lists: 3600000, ads: 300000, articles: 900000,
        user: 300000, donations: 900000
    },
    platforms: [
        { id: 'whatsapp', name: 'WhatsApp Groups', emoji: ICONS.whatsapp, svgIcon: ICONS.whatsapp, types: ['group', 'community'], kind: 'group' },
        { id: 'whatsapp_channel', name: 'WhatsApp Channels', emoji: ICONS.whatsapp_channel, svgIcon: ICONS.whatsapp_channel, types: ['channel'], kind: 'channel' },
        { id: 'telegram', name: 'Telegram Groups', emoji: ICONS.telegram, svgIcon: ICONS.telegram, types: ['group', 'supergroup'], kind: 'group' },
        { id: 'telegram_channel', name: 'Telegram Channels', emoji: ICONS.telegram_channel, svgIcon: ICONS.telegram_channel, types: ['channel'], kind: 'channel' },
        { id: 'discord', name: 'Discord', emoji: ICONS.discord, svgIcon: ICONS.discord, types: ['server'], kind: 'group' },
        { id: 'facebook', name: 'Facebook', emoji: ICONS.facebook, svgIcon: ICONS.facebook, types: ['group', 'page'], kind: 'group' }
    ],
    categories: [
        { id: 'crypto', name: 'Crypto', emoji: ICONS.bitcoin, svgIcon: ICONS.bitcoin }, { id: 'technology', name: 'Technology', emoji: ICONS.monitor, svgIcon: ICONS.monitor },
        { id: 'gaming', name: 'Gaming', emoji: ICONS.gamepad, svgIcon: ICONS.gamepad }, { id: 'education', name: 'Education', emoji: ICONS.book_open, svgIcon: ICONS.book_open },
        { id: 'business', name: 'Business', emoji: ICONS.briefcase, svgIcon: ICONS.briefcase }, { id: 'jobs', name: 'Jobs', emoji: ICONS.dollar_sign, svgIcon: ICONS.dollar_sign },
        { id: 'marketing', name: 'Marketing', emoji: ICONS.megaphone, svgIcon: ICONS.megaphone }, { id: 'entertainment', name: 'Entertainment', emoji: ICONS.theater, svgIcon: ICONS.theater },
        { id: 'music', name: 'Music', emoji: ICONS.music, svgIcon: ICONS.music }, { id: 'sports', name: 'Sports', emoji: ICONS.activity, svgIcon: ICONS.activity },
        { id: 'health', name: 'Health', emoji: ICONS.dumbbell, svgIcon: ICONS.dumbbell }, { id: 'food', name: 'Food', emoji: ICONS.utensils, svgIcon: ICONS.utensils },
        { id: 'travel', name: 'Travel', emoji: ICONS.plane, svgIcon: ICONS.plane }, { id: 'fashion', name: 'Fashion', emoji: ICONS.scissors, svgIcon: ICONS.scissors },
        { id: 'art', name: 'Art', emoji: ICONS.palette, svgIcon: ICONS.palette }, { id: 'photography', name: 'Photography', emoji: ICONS.camera, svgIcon: ICONS.camera },
        { id: 'news', name: 'News', emoji: ICONS.newspaper, svgIcon: ICONS.newspaper }, { id: 'science', name: 'Science', emoji: ICONS.microscope, svgIcon: ICONS.microscope },
        { id: 'books', name: 'Books', emoji: ICONS.bookmark, svgIcon: ICONS.bookmark }, { id: 'movies', name: 'Movies', emoji: ICONS.film, svgIcon: ICONS.film },
        { id: 'anime', name: 'Anime', emoji: ICONS.flag, svgIcon: ICONS.flag }, { id: 'pets', name: 'Pets', emoji: ICONS.paw, svgIcon: ICONS.paw },
        { id: 'cars', name: 'Cars', emoji: ICONS.car, svgIcon: ICONS.car }, { id: 'realestate', name: 'Real Estate', emoji: ICONS.home_alt, svgIcon: ICONS.home_alt },
        { id: 'religion', name: 'Religion', emoji: ICONS.feather, svgIcon: ICONS.feather }, { id: 'parenting', name: 'Parenting', emoji: ICONS.baby, svgIcon: ICONS.baby },
        { id: 'languages', name: 'Languages', emoji: ICONS.globe, svgIcon: ICONS.globe }, { id: 'programming', name: 'Programming', emoji: ICONS.code, svgIcon: ICONS.code },
        { id: 'memes', name: 'Memes', emoji: ICONS.smile, svgIcon: ICONS.smile }, { id: 'dating', name: 'Dating', emoji: ICONS.heart, svgIcon: ICONS.heart },
        { id: 'other', name: 'Other', emoji: ICONS.map_pin, svgIcon: ICONS.map_pin }
    ],
    countries: [
        { code: 'GLOBAL', name: 'Global', flag: ICONS.globe }, { code: 'US', name: 'United States', flag: getFlagIcon('US') },
        { code: 'GB', name: 'United Kingdom', flag: getFlagIcon('GB') }, { code: 'IN', name: 'India', flag: getFlagIcon('IN') },
        { code: 'NG', name: 'Nigeria', flag: getFlagIcon('NG') }, { code: 'BR', name: 'Brazil', flag: getFlagIcon('BR') },
        { code: 'DE', name: 'Germany', flag: getFlagIcon('DE') }, { code: 'FR', name: 'France', flag: getFlagIcon('FR') },
        { code: 'ES', name: 'Spain', flag: getFlagIcon('ES') }, { code: 'IT', name: 'Italy', flag: getFlagIcon('IT') },
        { code: 'CA', name: 'Canada', flag: getFlagIcon('CA') }, { code: 'AU', name: 'Australia', flag: getFlagIcon('AU') },
        { code: 'MX', name: 'Mexico', flag: getFlagIcon('MX') }, { code: 'JP', name: 'Japan', flag: getFlagIcon('JP') },
        { code: 'KR', name: 'South Korea', flag: getFlagIcon('KR') }, { code: 'SA', name: 'Saudi Arabia', flag: getFlagIcon('SA') },
        { code: 'AE', name: 'UAE', flag: getFlagIcon('AE') }, { code: 'TR', name: 'Turkey', flag: getFlagIcon('TR') },
        { code: 'EG', name: 'Egypt', flag: getFlagIcon('EG') }, { code: 'ZA', name: 'South Africa', flag: getFlagIcon('ZA') },
        { code: 'KE', name: 'Kenya', flag: getFlagIcon('KE') }, { code: 'GH', name: 'Ghana', flag: getFlagIcon('GH') },
        { code: 'PK', name: 'Pakistan', flag: getFlagIcon('PK') }, { code: 'BD', name: 'Bangladesh', flag: getFlagIcon('BD') },
        { code: 'ID', name: 'Indonesia', flag: getFlagIcon('ID') }, { code: 'PH', name: 'Philippines', flag: getFlagIcon('PH') },
        { code: 'MY', name: 'Malaysia', flag: getFlagIcon('MY') }, { code: 'TH', name: 'Thailand', flag: getFlagIcon('TH') },
        { code: 'VN', name: 'Vietnam', flag: getFlagIcon('VN') }, { code: 'RU', name: 'Russia', flag: getFlagIcon('RU') },
        { code: 'PL', name: 'Poland', flag: getFlagIcon('PL') }, { code: 'NL', name: 'Netherlands', flag: getFlagIcon('NL') },
        { code: 'SE', name: 'Sweden', flag: getFlagIcon('SE') }, { code: 'CH', name: 'Switzerland', flag: getFlagIcon('CH') },
        { code: 'AT', name: 'Austria', flag: getFlagIcon('AT') }, { code: 'PT', name: 'Portugal', flag: getFlagIcon('PT') },
        { code: 'AR', name: 'Argentina', flag: getFlagIcon('AR') }, { code: 'CO', name: 'Colombia', flag: getFlagIcon('CO') },
        { code: 'CL', name: 'Chile', flag: getFlagIcon('CL') }, { code: 'PE', name: 'Peru', flag: getFlagIcon('PE') },
        { code: 'MA', name: 'Morocco', flag: getFlagIcon('MA') }, { code: 'TN', name: 'Tunisia', flag: getFlagIcon('TN') },
        { code: 'DZ', name: 'Algeria', flag: getFlagIcon('DZ') }, { code: 'IQ', name: 'Iraq', flag: getFlagIcon('IQ') },
        { code: 'IL', name: 'Israel', flag: getFlagIcon('IL') }, { code: 'UA', name: 'Ukraine', flag: getFlagIcon('UA') },
        { code: 'RO', name: 'Romania', flag: getFlagIcon('RO') }, { code: 'CZ', name: 'Czech Republic', flag: getFlagIcon('CZ') },
        { code: 'GR', name: 'Greece', flag: getFlagIcon('GR') }, { code: 'HU', name: 'Hungary', flag: getFlagIcon('HU') },
        { code: 'SG', name: 'Singapore', flag: getFlagIcon('SG') }, { code: 'NZ', name: 'New Zealand', flag: getFlagIcon('NZ') },
        { code: 'IE', name: 'Ireland', flag: getFlagIcon('IE') }, { code: 'DK', name: 'Denmark', flag: getFlagIcon('DK') },
        { code: 'NO', name: 'Norway', flag: getFlagIcon('NO') }, { code: 'FI', name: 'Finland', flag: getFlagIcon('FI') }
    ],
    // Issue 17 fix: expanded languages list to cover all CONFIG.countries regions
    languages: [
        'English', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Hindi', 'Chinese',
        'Japanese', 'Korean', 'Russian', 'Turkish', 'Italian', 'Dutch', 'Polish', 'Indonesian',
        'Thai', 'Vietnamese', 'Malay', 'Swahili', 'Bengali', 'Urdu', 'Filipino', 'Romanian',
        'Czech', 'Greek', 'Hungarian', 'Hebrew', 'Ukrainian', 'Swedish', 'Norwegian', 'Danish',
        'Finnish', 'Persian'
    ],
    levels: [
        { level: 1, name: 'Seedling', emoji: ICONS.seedling, svgIcon: ICONS.seedling, minGxp: 0 },
        { level: 2, name: 'Sprout', emoji: ICONS.leaf, svgIcon: ICONS.leaf, minGxp: 200 },
        { level: 3, name: 'Tree', emoji: ICONS.tree, svgIcon: ICONS.tree, minGxp: 600 },
        { level: 4, name: 'Star', emoji: ICONS.star, svgIcon: ICONS.star, minGxp: 1500 },
        { level: 5, name: 'Fire', emoji: ICONS.fire, svgIcon: ICONS.fire, minGxp: 3000 },
        { level: 6, name: 'Diamond', emoji: ICONS.diamond, svgIcon: ICONS.diamond, minGxp: 6000 },
        { level: 7, name: 'Crown', emoji: ICONS.crown, svgIcon: ICONS.crown, minGxp: 12000 }
    ],
    nichePricing: {
        crypto: 25, technology: 20, gaming: 20, education: 15, business: 25, jobs: 25,
        marketing: 20, entertainment: 15, music: 15, sports: 15, health: 15, food: 10,
        travel: 15, fashion: 15, art: 10, photography: 10, news: 15, science: 10,
        books: 10, movies: 15, anime: 15, pets: 10, cars: 15, realestate: 20,
        religion: 10, parenting: 10, languages: 15, programming: 20, memes: 10, dating: 20, other: 10
    },
    features: {
        reviews: true, leaderboard: true, scamWall: true, tools: true, articles: true,
        store: true, marketplace: true, jobs: true, donate: true, ads: true
    },
    announcement: { enabled: false, text: '', link: '', type: 'info' },
    // Issue 18 fix: added eth, ltc, ton to match wallet types used in go.html and promote pages
    cryptoWallets: { btc: '', eth: '', usdt: '', sol: '', ltc: '', ton: '' },
    lemonSqueezy: { storeUrl: '', products: {} },
    adSlotLimits: { sidebar: 2, searchTop: 1, categoryBottom: 1, profileSimilar: 2 },
    notificationTypes: {
        welcome: { icon: ICONS.hand_wave || ICONS.user, title: 'Welcome!' },
        group_approved: { icon: ICONS.check_circle, title: 'Group Approved' },
        group_rejected: { icon: ICONS.x_circle, title: 'Group Rejected' },
        payment_verified: { icon: ICONS.check_circle, title: 'Payment Verified' },
        payment_rejected: { icon: ICONS.x_circle, title: 'Payment Rejected' },
        vip_activated: { icon: ICONS.star, title: 'VIP Activated' },
        vip_expired: { icon: ICONS.clock, title: 'VIP Expired' },
        level_up: { icon: ICONS.trophy, title: 'Level Up!' },
        review_received: { icon: ICONS.message_circle, title: 'New Review' },
        report_resolved: { icon: ICONS.shield, title: 'Report Resolved' },
        gxp_awarded: { icon: ICONS.sparkles, title: 'GXP Awarded' },
        system: { icon: ICONS.info, title: 'System Notice' },
        info: { icon: ICONS.info, title: 'Info' }
    },
    disposableEmails: [
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
    ],
    platformPatterns: {
        whatsapp: /^https:\/\/chat\.whatsapp\.com\//,
        whatsapp_channel: /^https:\/\/(www\.)?whatsapp\.com\/channel\//,
        telegram: /^https:\/\/(t\.me|telegram\.me)\//,
        telegram_channel: /^https:\/\/(t\.me|telegram\.me)\//,
        discord: /^https:\/\/(discord\.gg|discord\.com\/invite)\//,
        facebook: /^https:\/\/(www\.)?facebook\.com\//,
    },
    defaultSettings: {}
};

