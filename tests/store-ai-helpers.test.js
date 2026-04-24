import { describe, it, expect } from 'vitest';
import { handleListingQuality, handleSmartPricing } from '../functions/api/store-ai/_helpers/seller-tools.js';

/**
 * Tests for store-ai helper modules that can run without Supabase.
 * handleSellerTrust requires live Supabase queries so it is not tested here.
 */

describe('handleListingQuality', () => {
    it('scores a well-formed listing highly', async () => {
        const result = await handleListingQuality({}, {
            name: 'Premium Web Development Course - Learn React & Node.js From Scratch',
            description: 'A comprehensive course covering React, Node.js, and modern web development practices. Includes 50+ hours of video content, hands-on projects, and lifetime access to updates. Perfect for beginners and intermediate developers looking to level up their skills quickly and efficiently.',
            thumb_url: 'https://example.com/img.jpg',
            price: 4999,
            product_type: 'course',
            variants: [{ name: 'Basic', price: 2999 }, { name: 'Pro', price: 4999 }]
        });

        expect(result.ok).toBe(true);
        expect(result.quality).toBeDefined();
        expect(result.quality.score).toBeGreaterThan(60);
        expect(result.quality.grade).toBeDefined();
        expect(result.quality.checks).toBeDefined();
        expect(result.quality.checks.length).toBeGreaterThan(0);
    });

    it('scores a minimal listing low', async () => {
        const result = await handleListingQuality({}, {
            name: 'Hi',
            description: 'Buy it',
            thumb_url: '',
            price: 0,
            product_type: 'digital'
        });

        expect(result.ok).toBe(true);
        expect(result.quality.score).toBeLessThan(50);
        expect(result.quality.priority_tips).toBeDefined();
        expect(result.quality.priority_tips.length).toBeGreaterThan(0);
    });

    it('handles empty listing gracefully', async () => {
        const result = await handleListingQuality({}, {});
        expect(result.ok).toBe(true);
        expect(result.quality).toBeDefined();
        expect(result.quality.score).toBeLessThan(30);
    });

    it('gives max title score for 20+ char descriptive title', async () => {
        const result = await handleListingQuality({}, {
            name: 'A Wonderful Product Title That Is Long Enough',
            description: '',
            thumb_url: '',
            price: 0
        });

        expect(result.ok).toBe(true);
        const titleCheck = result.quality.checks.find(c => c.field === 'title');
        expect(titleCheck).toBeDefined();
        expect(titleCheck.score).toBe(20); // 15 base + 5 keyword bonus
    });
});

describe('handleSmartPricing', () => {
    it('returns pricing suggestions based on similar products', async () => {
        const result = await handleSmartPricing({}, {
            product_type: 'course',
            products: [
                { id: '1', product_type: 'course', price: 2999 },
                { id: '2', product_type: 'course', price: 4999 },
                { id: '3', product_type: 'course', price: 3999 },
                { id: '4', product_type: 'course', price: 1999 },
                { id: '5', product_type: 'course', price: 5999 }
            ]
        });

        expect(result.ok).toBe(true);
        expect(result.suggestion).toBeDefined();
        expect(result.suggestion.price_range.min).toBe(1999);
        expect(result.suggestion.price_range.max).toBe(5999);
        expect(result.suggestion.median_price).toBeDefined();
        expect(result.suggestion.suggested_range.low).toBeDefined();
        expect(result.suggestion.suggested_range.high).toBeDefined();
        expect(result.suggestion.similar_count).toBe(5);
    });

    it('returns error when no products provided', async () => {
        const result = await handleSmartPricing({}, {
            product_type: 'course',
            products: []
        });

        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('broadens search when too few similar products exist', async () => {
        const result = await handleSmartPricing({}, {
            product_type: 'membership',
            products: [
                { id: '1', product_type: 'course', price: 2999 },
                { id: '2', product_type: 'guide', price: 999 },
                { id: '3', product_type: 'template', price: 499 }
            ]
        });

        expect(result.ok).toBe(true);
        expect(result.suggestion.similar_count).toBe(3); // broadened to all
    });

    it('handles products with zero prices', async () => {
        const result = await handleSmartPricing({}, {
            product_type: 'guide',
            products: [
                { id: '1', product_type: 'guide', price: 0 },
                { id: '2', product_type: 'guide', price: 0 }
            ]
        });

        expect(result.ok).toBe(true);
        expect(result.suggestion).toBeNull();
    });
});
