/**
 * Action: Negotiation / Offers — create, respond, list offers
 */

export async function handleOffers(env, body) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Server not configured' };

    const offerAction = (body.offer_action || '').trim();

    if (offerAction === 'create') {
        const buyerId = (body.buyer_id || '').trim();
        const sellerId = (body.seller_id || '').trim();
        const productId = (body.product_id || '').trim();
        const offerPrice = parseInt(body.offer_price) || 0;
        const message = (body.message || '').substring(0, 500).trim();

        if (!buyerId || !sellerId || !productId || !offerPrice) {
            return { ok: false, error: 'Missing buyer_id, seller_id, product_id, or offer_price' };
        }

        const offerRes = await fetch(supabaseUrl + '/rest/v1/marketplace_offers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': 'Bearer ' + supabaseKey,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                buyer_id: buyerId,
                seller_id: sellerId,
                product_id: productId,
                offer_price: offerPrice,
                message: message,
                status: 'pending',
                expires_at: new Date(Date.now() + 48 * 3600000).toISOString()
            })
        });

        if (!offerRes.ok) return { ok: false, error: 'Failed to create offer' };
        const offer = await offerRes.json();

        // Notify seller
        await fetch(supabaseUrl + '/rest/v1/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify({
                uid: sellerId,
                type: 'new_offer',
                title: 'New Offer Received',
                message: 'You received an offer of ' + offerPrice + ' coins. ' + (message || ''),
                link: '/pages/user/offers.html'
            })
        });

        return { ok: true, offer: offer[0] || offer };
    }

    if (offerAction === 'respond') {
        const offerId = (body.offer_id || '').trim();
        const response = (body.response || '').trim(); // accept, reject, counter
        const counterPrice = parseInt(body.counter_price) || 0;

        if (!offerId || !response) return { ok: false, error: 'Missing offer_id or response' };

        const updateData = { status: response };
        if (response === 'counter' && counterPrice > 0) {
            updateData.counter_price = counterPrice;
            updateData.status = 'countered';
        }

        await fetch(supabaseUrl + '/rest/v1/marketplace_offers?id=eq.' + encodeURIComponent(offerId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify(updateData)
        });

        // Notify buyer
        const getOffer = await fetch(
            supabaseUrl + '/rest/v1/marketplace_offers?id=eq.' + encodeURIComponent(offerId) + '&select=buyer_id&limit=1',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const offerData = await getOffer.json();
        if (offerData?.[0]?.buyer_id) {
            await fetch(supabaseUrl + '/rest/v1/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                body: JSON.stringify({
                    uid: offerData[0].buyer_id,
                    type: 'offer_' + response,
                    title: 'Offer ' + response.charAt(0).toUpperCase() + response.slice(1),
                    message: response === 'counter'
                        ? 'The seller countered with ' + counterPrice + ' coins.'
                        : 'Your offer was ' + response + '.',
                    link: '/pages/user/offers.html'
                })
            });
        }

        return { ok: true, status: updateData.status };
    }

    if (offerAction === 'list') {
        const userId = (body.user_id || '').trim();
        const role = (body.role || 'buyer').trim();
        if (!userId) return { ok: false, error: 'Missing user_id' };

        const field = role === 'seller' ? 'seller_id' : 'buyer_id';
        const listRes = await fetch(
            supabaseUrl + '/rest/v1/marketplace_offers?' + field + '=eq.' + encodeURIComponent(userId) + '&order=created_at.desc&limit=50',
            { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const offerList = await listRes.json();
        return { ok: true, offers: offerList || [] };
    }

    return { ok: false, error: 'Unknown offer_action. Use create, respond, or list.' };
}
