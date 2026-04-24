import { z } from 'zod';

const lsWebhookSchema = z.object({
    meta: z.object({
        event_name: z.string(),
        custom_data: z.record(z.string(), z.any()).optional()
    }).passthrough(),
    data: z.object({
        id: z.string().or(z.number()).transform(String),
        type: z.string(),
        attributes: z.record(z.string(), z.any())
    }).passthrough()
}).passthrough();

const ORDER_BODY = {
    meta: {
        event_name: 'order_created',
        custom_data: { uid: 'auth-123' }
    },
    data: {
        id: '999',
        type: 'orders',
        attributes: {
            status: 'paid',
            user_email: 'buyer@example.com',
            total: 500,
            currency: 'USD',
            first_order_item: { product_id: 42, variant_id: 7, product_name: 'Popular' },
            urls: { receipt: 'https://ls.example/r' }
        }
    }
};

const res = lsWebhookSchema.safeParse(ORDER_BODY);
console.log(res);
