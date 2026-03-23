/**
 * Action: Wishlist Price Drop Alerts — notify users when wishlisted items drop in price
 */

export async function handleWishlistAlerts(env, body) {
    const userId = (body.user_id || '').trim();
    const wishlistItems = body.wishlist || [];
    const products = body.products || [];
    const batchMode = body.batch === true;

    if (!batchMode && (!userId || !wishlistItems.length || !products.length)) {
        return { ok: false, error: 'Missing user_id, wishlist, or products' };
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    // Batch mode: process all users with wishlists at once
    if (batchMode && supabaseUrl && supabaseKey) {
        try {
            const wlRes = await fetch(
                supabaseUrl + '/rest/v1/wishlists?select=user_id,product_id,price_when_added&limit=2000',
                { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
            );
            const allWishlists = await wlRes.json();
            if (!Array.isArray(allWishlists) || !allWishlists.length) {
                return { ok: true, alerts_sent: 0, message: 'No wishlists found' };
            }

            const productMap = {};
            products.forEach(p => { productMap[p.id] = p; });

            const userAlerts = {};
            allWishlists.forEach(wl => {
                const product = productMap[wl.product_id];
                if (!product) return;
                const savedPrice = wl.price_when_added || 0;
                const currentPrice = product.price || 0;
                if (savedPrice > 0 && currentPrice > 0 && currentPrice < savedPrice) {
                    if (!userAlerts[wl.user_id]) userAlerts[wl.user_id] = [];
                    userAlerts[wl.user_id].push({
                        product_id: product.id,
                        product_name: product.name,
                        original_price: savedPrice,
                        current_price: currentPrice,
                        drop_percent: Math.round((1 - currentPrice / savedPrice) * 100),
                        savings_formatted: '$' + ((savedPrice - currentPrice) / 100).toFixed(2)
                    });
                }
            });

            let totalAlertsSent = 0;
            const userIds = Object.keys(userAlerts);
            for (let bi = 0; bi < userIds.length; bi += 5) {
                const batch = userIds.slice(bi, bi + 5);
                await Promise.all(batch.map(async (uid) => {
                    const alerts = userAlerts[uid];
                    const topAlert = alerts.sort((a, b) => b.drop_percent - a.drop_percent)[0];
                    const message = alerts.length === 1
                        ? topAlert.product_name + ' dropped ' + topAlert.drop_percent + '% \u2014 save ' + topAlert.savings_formatted + '!'
                        : alerts.length + ' wishlisted items dropped in price! ' + topAlert.product_name + ' is down ' + topAlert.drop_percent + '%.';
                    try {
                        await fetch(supabaseUrl + '/rest/v1/notifications', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': supabaseKey,
                                'Authorization': 'Bearer ' + supabaseKey
                            },
                            body: JSON.stringify({
                                uid: uid,
                                type: 'price_drop',
                                title: 'Price Drop Alert!',
                                message: message,
                                link: '/pages/store.html?product=' + topAlert.product_id,
                                metadata: JSON.stringify({ alerts: alerts })
                            })
                        });
                        totalAlertsSent++;
                    } catch (e) {
                        console.error('Batch notification error for user ' + uid + ':', e);
                    }
                }));
            }

            return {
                ok: true,
                batch: true,
                users_notified: totalAlertsSent,
                total_users_with_drops: userIds.length,
                total_product_drops: Object.values(userAlerts).reduce((s, a) => s + a.length, 0)
            };
        } catch (e) {
            console.error('Batch wishlist alerts error:', e);
            return { ok: false, error: 'Batch processing failed: ' + e.message };
        }
    }

    const alerts = [];

    for (const item of wishlistItems) {
        const product = products.find(p => p.id === item.product_id);
        if (!product) continue;

        const savedPrice = item.price_when_added || 0;
        const currentPrice = product.price || 0;

        if (savedPrice > 0 && currentPrice > 0 && currentPrice < savedPrice) {
            const dropPercent = Math.round((1 - currentPrice / savedPrice) * 100);
            alerts.push({
                product_id: product.id,
                product_name: product.name,
                original_price: savedPrice,
                current_price: currentPrice,
                drop_percent: dropPercent,
                savings_formatted: '$' + ((savedPrice - currentPrice) / 100).toFixed(2)
            });
        }
    }

    // Store alerts in Supabase notifications if available
    if (alerts.length > 0 && supabaseUrl && supabaseKey) {
        try {
            const notifBodies = alerts.map(alert => ({
                uid: userId,
                type: 'price_drop',
                title: 'Price Drop Alert!',
                message: alert.product_name + ' dropped ' + alert.drop_percent + '% \u2014 save ' + alert.savings_formatted + '!',
                link: '/pages/store.html?product=' + alert.product_id,
                metadata: JSON.stringify(alert)
            }));
            await fetch(supabaseUrl + '/rest/v1/notifications', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey
                },
                body: JSON.stringify(notifBodies)
            });
        } catch (e) {
            console.error('Notification batch error:', e);
        }
    }

    return {
        ok: true,
        alerts: alerts,
        total_drops: alerts.length
    };
}
