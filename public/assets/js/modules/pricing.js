// ─── Module: pricing ───
// Exports: getPrice

// ═══════════════════════════════════════
// MODULE 10: getPrice
// ═══════════════════════════════════════
function getPrice(service, options = {}) {
    const prices = {
        vip_verified: { monthly: 5, quarterly: 12, yearly: 40 },
        vip_global: { monthly: 30, quarterly: 75, yearly: 250 },
        vip_diamond: { monthly: 50, quarterly: 130, yearly: 450 },
        boost_5: 5, boost_10: 10, boost_25: 25,
        priority_review: 10,
        ad_sponsored_weekly: 20, ad_banner_weekly: 30, ad_featured_weekly: 15, ad_profile_weekly: 10,
        audit_basic: 25, audit_pro: 50
    };
    if (service === 'vip_niche') {
        const base = CONFIG.nichePricing[options.category] || 10;
        if (options.period === 'quarterly') return Math.round(base * 2.5);
        if (options.period === 'yearly') return Math.round(base * 8);
        return base;
    }
    const p = prices[service];
    if (!p) return 0;
    if (typeof p === 'object') return p[options.period || 'monthly'] || p.monthly;
    return p;
}

