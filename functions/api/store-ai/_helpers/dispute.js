/**
 * Action: Dispute Resolution — create, respond, resolve, list disputes
 */

export async function handleDispute(env, body) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Server not configured' };

    const disputeAction = (body.dispute_action || '').trim();

    if (disputeAction === 'create') {
        const buyerId = (body.buyer_id || '').trim();
        const sellerId = (body.seller_id || '').trim();
        const orderId = (body.order_id || '').trim();
        const reason = (body.reason || '').substring(0, 1000).trim();
        const category = (body.category || 'other').trim();

        if (!buyerId || !orderId || !reason) return { ok: false, error: 'Missing buyer_id, order_id, or reason' };

        const disputeRes = await fetch(supabaseUrl + '/rest/v1/marketplace_disputes', {
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
                order_id: orderId,
                reason: reason,
                category: category,
                status: 'open',
                seller_deadline: new Date(Date.now() + 48 * 3600000).toISOString()
            })
        });

        if (!disputeRes.ok) return { ok: false, error: 'Failed to create dispute' };
        const dispute = await disputeRes.json();

        // Notify seller with 48h deadline
        if (sellerId) {
            await fetch(supabaseUrl + '/rest/v1/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                body: JSON.stringify({
                    uid: sellerId,
                    type: 'dispute_opened',
                    title: 'Dispute Opened \u2014 48h to Respond',
                    message: 'A buyer has reported an issue with order ' + orderId + '. You have 48 hours to respond before admin mediation.',
                    link: '/pages/user/disputes.html'
                })
            });
        }

        return { ok: true, dispute: dispute[0] || dispute };
    }

    if (disputeAction === 'respond') {
        const disputeId = (body.dispute_id || '').trim();
        const responseMsg = (body.message || '').substring(0, 1000).trim();
        const resolution = (body.resolution || '').trim();

        if (!disputeId || !responseMsg) return { ok: false, error: 'Missing dispute_id or message' };

        await fetch(supabaseUrl + '/rest/v1/marketplace_disputes?id=eq.' + encodeURIComponent(disputeId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify({
                status: resolution === 'reject' ? 'escalated' : 'seller_responded',
                seller_response: responseMsg,
                proposed_resolution: resolution || null,
                responded_at: new Date().toISOString()
            })
        });

        // If seller rejected, auto-escalate to admin
        if (resolution === 'reject') {
            await fetch(supabaseUrl + '/rest/v1/marketplace_disputes?id=eq.' + encodeURIComponent(disputeId), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
                body: JSON.stringify({ status: 'escalated', escalated_at: new Date().toISOString() })
            });
        }

        return { ok: true, status: resolution === 'reject' ? 'escalated' : 'seller_responded' };
    }

    if (disputeAction === 'resolve') {
        const disputeId = (body.dispute_id || '').trim();
        const adminDecision = (body.decision || '').trim();
        const adminNote = (body.admin_note || '').substring(0, 500).trim();

        if (!disputeId || !adminDecision) return { ok: false, error: 'Missing dispute_id or decision' };

        await fetch(supabaseUrl + '/rest/v1/marketplace_disputes?id=eq.' + encodeURIComponent(disputeId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
            body: JSON.stringify({
                status: 'resolved',
                admin_decision: adminDecision,
                admin_note: adminNote,
                resolved_at: new Date().toISOString()
            })
        });

        return { ok: true, status: 'resolved', decision: adminDecision };
    }

    if (disputeAction === 'list') {
        const userId = (body.user_id || '').trim();
        const role = (body.role || 'buyer').trim();
        if (!userId) return { ok: false, error: 'Missing user_id' };

        const dField = role === 'seller' ? 'seller_id' : (role === 'admin' ? '' : 'buyer_id');
        let dQuery = supabaseUrl + '/rest/v1/marketplace_disputes?';
        if (dField) dQuery += dField + '=eq.' + encodeURIComponent(userId) + '&';
        dQuery += 'order=created_at.desc&limit=50';

        const dListRes = await fetch(dQuery, {
            headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
        });
        const disputes = await dListRes.json();
        return { ok: true, disputes: disputes || [] };
    }

    return { ok: false, error: 'Unknown dispute_action. Use create, respond, resolve, or list.' };
}
