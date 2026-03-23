/**
 * Action: Flash Sales — Seasonal/flash sales with countdown timers
 */

export async function handleFlashSales(env, body) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Server not configured' };

    const saleAction = (body.sale_action || '').trim();

    if (saleAction === 'create') {
        const sellerId = (body.seller_id || '').trim();
        const pId = (body.product_id || '').trim();
        const discountPct = parseInt(body.discount_percent) || 0;
        const originalPrice = parseInt(body.original_price) || 0;
        const durationHours = parseInt(body.duration_hours) || 24;

        if (!sellerId || !pId || !discountPct) return { ok: false, error: 'Missing seller_id, product_id, or discount_percent' };
        if (discountPct < 5 || discountPct > 80) return { ok: false, error: 'Discount must be between 5% and 80%' };
        if (durationHours < 1 || durationHours > 168) return { ok: false, error: 'Duration must be 1-168 hours (1 week max)' };

        const salePrice = Math.round(originalPrice * (1 - discountPct / 100));
        const endsAt = new Date(Date.now() + durationHours * 3600000).toISOString();

        const saleRes = await fetch(supabaseUrl + '/rest/v1/flash_sales', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                seller_id: sellerId,
                product_id: pId,
                original_price: originalPrice,
                sale_price: salePrice,
                discount_percent: discountPct,
                starts_at: new Date().toISOString(),
                ends_at: endsAt,
                status: 'active'
            })
        });

        if (!saleRes.ok) return { ok: false, error: 'Failed to create flash sale' };
        const sale = await saleRes.json();
        return { ok: true, sale: sale[0] || sale };
    }

    if (saleAction === 'active') {
        const activeRes = await fetch(
            supabaseUrl + '/rest/v1/flash_sales?status=eq.active&ends_at=gt.' + encodeURIComponent(new Date().toISOString()) + '&order=ends_at.asc&limit=50',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        let activeSales = await activeRes.json();
        activeSales = Array.isArray(activeSales) ? activeSales : [];

        // Add countdown info
        const now = Date.now();
        activeSales = activeSales.map(s => {
            const msLeft = new Date(s.ends_at).getTime() - now;
            const hoursLeft = Math.max(0, msLeft / 3600000);
            s.time_remaining = {
                hours: Math.floor(hoursLeft),
                minutes: Math.floor((hoursLeft % 1) * 60),
                total_seconds: Math.max(0, Math.round(msLeft / 1000)),
                is_ending_soon: hoursLeft < 6,
                formatted: hoursLeft >= 1 ? Math.floor(hoursLeft) + 'h ' + Math.floor((hoursLeft % 1) * 60) + 'm left' : Math.floor(hoursLeft * 60) + 'm left'
            };
            return s;
        });

        return { ok: true, sales: activeSales, count: activeSales.length };
    }

    if (saleAction === 'end') {
        const saleId = (body.sale_id || '').trim();
        if (!saleId) return { ok: false, error: 'Missing sale_id' };

        await fetch(supabaseUrl + '/rest/v1/flash_sales?id=eq.' + encodeURIComponent(saleId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify({ status: 'ended', ended_at: new Date().toISOString() })
        });

        return { ok: true, status: 'ended' };
    }

    return { ok: false, error: 'Unknown sale_action. Use create, active, or end.' };
}
