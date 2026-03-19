/**
 * /api/seller-dashboard — Marketplace Seller Analytics Dashboard
 *
 * GET /api/seller-dashboard?action=stats       — Overview stats (views, CTR, conversion, revenue)
 * GET /api/seller-dashboard?action=listings     — Per-listing performance breakdown
 * GET /api/seller-dashboard?action=revenue      — Revenue over time chart data
 * GET /api/seller-dashboard?action=top          — Best-performing listings
 *
 * Requires authentication via Bearer token.
 * Shows marketplace sellers how their products are performing.
 *
 * Environment variables:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

/* ── CORS headers ──────────────────────────────────────────── */
function corsHeaders(origin) {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin || 'https://groupsmix.com',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
}

/* ── Verify auth and get internal user ID ──────────────────── */
async function verifyAndGetUser(request, env) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Server not configured');

    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) throw new Error('Unauthorized');

    const token = authHeader.replace('Bearer ', '');
    const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
        headers: { 'Authorization': 'Bearer ' + token, 'apikey': supabaseKey }
    });
    if (!userRes.ok) throw new Error('Invalid token');
    const authUser = await userRes.json();

    const profileRes = await fetch(
        supabaseUrl + '/rest/v1/users?auth_id=eq.' + encodeURIComponent(authUser.id) + '&select=id,display_name,role&limit=1',
        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    );
    const profiles = await profileRes.json();
    if (!profiles || !profiles.length) throw new Error('User not found');

    return { authId: authUser.id, userId: profiles[0].id, role: profiles[0].role, displayName: profiles[0].display_name };
}

/* ── Main handler ──────────────────────────────────────────── */
export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || 'https://groupsmix.com';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
            status: 405, headers: corsHeaders(origin)
        });
    }

    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ ok: false, error: 'Server configuration error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }

    // Verify authentication
    var user;
    try {
        user = await verifyAndGetUser(request, env);
    } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: 401, headers: corsHeaders(origin)
        });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'stats';
    const days = parseInt(url.searchParams.get('days')) || 30;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    try {
        switch (action) {
            case 'stats': {
                // Fetch seller's sales transactions
                const salesRes = await fetch(
                    supabaseUrl + '/rest/v1/wallet_transactions?type=in.(purchase,store_purchase,escrow_release)&description=like.*' + encodeURIComponent(user.userId) + '*&select=amount,created_at,type,description&order=created_at.desc&limit=500',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                var allSales = await salesRes.json();
                allSales = Array.isArray(allSales) ? allSales : [];

                // Filter to period
                var periodSales = allSales.filter(function(t) { return t.created_at >= cutoff; });

                // Revenue calculations
                var totalRevenue = allSales.reduce(function(s, t) { return s + Math.abs(t.amount || 0); }, 0);
                var periodRevenue = periodSales.reduce(function(s, t) { return s + Math.abs(t.amount || 0); }, 0);

                // Fetch seller's product listings for view/click data
                var listingsRes = await fetch(
                    supabaseUrl + '/rest/v1/marketplace_listings?seller_id=eq.' + encodeURIComponent(user.userId) + '&select=id,title,views,clicks,created_at,status,price,product_type&order=created_at.desc&limit=100',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                var listings = await listingsRes.json();
                listings = Array.isArray(listings) ? listings : [];

                var totalViews = listings.reduce(function(s, l) { return s + (l.views || 0); }, 0);
                var totalClicks = listings.reduce(function(s, l) { return s + (l.clicks || 0); }, 0);
                var ctr = totalViews > 0 ? ((totalClicks / totalViews) * 100) : 0;
                var conversionRate = totalClicks > 0 ? ((allSales.length / totalClicks) * 100) : 0;

                // Fetch seller reviews
                var reviewRes = await fetch(
                    supabaseUrl + '/rest/v1/reviews?seller_id=eq.' + encodeURIComponent(user.userId) + '&select=rating,created_at&limit=200',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                var reviews = await reviewRes.json();
                reviews = Array.isArray(reviews) ? reviews : [];
                var avgRating = reviews.length > 0 ? reviews.reduce(function(s, r) { return s + (r.rating || 0); }, 0) / reviews.length : 0;

                // Fetch active escrows
                var escrowRes = await fetch(
                    supabaseUrl + '/rest/v1/escrow_transactions?seller_id=eq.' + encodeURIComponent(user.userId) + '&status=eq.held&select=amount&limit=100',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                var activeEscrows = await escrowRes.json();
                activeEscrows = Array.isArray(activeEscrows) ? activeEscrows : [];
                var escrowBalance = activeEscrows.reduce(function(s, e) { return s + (e.amount || 0); }, 0);

                // Pending offers
                var offersRes = await fetch(
                    supabaseUrl + '/rest/v1/marketplace_offers?seller_id=eq.' + encodeURIComponent(user.userId) + '&status=eq.pending&select=id&limit=100',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                var pendingOffers = await offersRes.json();
                pendingOffers = Array.isArray(pendingOffers) ? pendingOffers : [];

                return new Response(JSON.stringify({
                    ok: true,
                    data: {
                        overview: {
                            total_revenue: totalRevenue,
                            period_revenue: periodRevenue,
                            total_sales: allSales.length,
                            period_sales: periodSales.length,
                            total_listings: listings.length,
                            active_listings: listings.filter(function(l) { return l.status === 'active'; }).length
                        },
                        engagement: {
                            total_views: totalViews,
                            total_clicks: totalClicks,
                            click_through_rate: parseFloat(ctr.toFixed(1)),
                            conversion_rate: parseFloat(conversionRate.toFixed(1))
                        },
                        reviews: {
                            total: reviews.length,
                            avg_rating: parseFloat(avgRating.toFixed(1)),
                            recent: reviews.slice(0, 5).map(function(r) { return { rating: r.rating, date: r.created_at }; })
                        },
                        escrow: {
                            active_count: activeEscrows.length,
                            held_amount: escrowBalance
                        },
                        offers: {
                            pending_count: pendingOffers.length
                        },
                        period_days: days
                    }
                }), { status: 200, headers: corsHeaders(origin) });
            }

            case 'listings': {
                // Per-listing performance breakdown
                var listRes = await fetch(
                    supabaseUrl + '/rest/v1/marketplace_listings?seller_id=eq.' + encodeURIComponent(user.userId) + '&select=id,title,views,clicks,created_at,status,price,product_type&order=views.desc&limit=100',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                var allListings = await listRes.json();
                allListings = Array.isArray(allListings) ? allListings : [];

                // Get sale counts per listing
                var listingSales = {};
                for (var i = 0; i < allListings.length; i++) {
                    var lid = allListings[i].id;
                    var sRes = await fetch(
                        supabaseUrl + '/rest/v1/wallet_transactions?type=in.(purchase,store_purchase)&description=like.*' + encodeURIComponent(lid) + '*&select=amount&limit=100',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                    );
                    var sTxns = await sRes.json();
                    sTxns = Array.isArray(sTxns) ? sTxns : [];
                    listingSales[lid] = {
                        count: sTxns.length,
                        revenue: sTxns.reduce(function(s, t) { return s + Math.abs(t.amount || 0); }, 0)
                    };
                }

                var enriched = allListings.map(function(l) {
                    var sales = listingSales[l.id] || { count: 0, revenue: 0 };
                    var lCtr = (l.views || 0) > 0 ? ((l.clicks || 0) / l.views * 100) : 0;
                    var lConv = (l.clicks || 0) > 0 ? (sales.count / l.clicks * 100) : 0;
                    return {
                        id: l.id,
                        title: l.title,
                        status: l.status,
                        price: l.price,
                        product_type: l.product_type,
                        views: l.views || 0,
                        clicks: l.clicks || 0,
                        ctr: parseFloat(lCtr.toFixed(1)),
                        sales: sales.count,
                        revenue: sales.revenue,
                        conversion_rate: parseFloat(lConv.toFixed(1)),
                        created_at: l.created_at
                    };
                });

                return new Response(JSON.stringify({ ok: true, data: enriched }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            case 'revenue': {
                // Revenue over time chart data
                var revRes = await fetch(
                    supabaseUrl + '/rest/v1/wallet_transactions?type=in.(purchase,store_purchase,escrow_release)&description=like.*' + encodeURIComponent(user.userId) + '*&created_at=gte.' + encodeURIComponent(cutoff) + '&select=amount,created_at&order=created_at.asc&limit=500',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                var revTxns = await revRes.json();
                revTxns = Array.isArray(revTxns) ? revTxns : [];

                // Build daily revenue chart
                var dailyRevenue = {};
                var dailySales = {};
                revTxns.forEach(function(t) {
                    var day = (t.created_at || '').substring(0, 10);
                    dailyRevenue[day] = (dailyRevenue[day] || 0) + Math.abs(t.amount || 0);
                    dailySales[day] = (dailySales[day] || 0) + 1;
                });

                var chartData = [];
                var cumRevenue = 0;
                for (var d = 0; d < days; d++) {
                    var date = new Date(Date.now() - (days - 1 - d) * 86400000);
                    var dayKey = date.toISOString().substring(0, 10);
                    var dayRev = dailyRevenue[dayKey] || 0;
                    cumRevenue += dayRev;
                    chartData.push({
                        date: dayKey,
                        revenue: dayRev,
                        cumulative_revenue: cumRevenue,
                        sales: dailySales[dayKey] || 0
                    });
                }

                var totalPeriodRevenue = revTxns.reduce(function(s, t) { return s + Math.abs(t.amount || 0); }, 0);
                var avgDailyRevenue = totalPeriodRevenue / days;

                return new Response(JSON.stringify({
                    ok: true,
                    data: {
                        chart_data: chartData,
                        summary: {
                            total_revenue: totalPeriodRevenue,
                            total_sales: revTxns.length,
                            avg_daily_revenue: Math.round(avgDailyRevenue),
                            best_day: chartData.reduce(function(best, d) { return d.revenue > (best.revenue || 0) ? d : best; }, {}),
                            period_days: days
                        }
                    }
                }), { status: 200, headers: corsHeaders(origin) });
            }

            case 'top': {
                // Best-performing listings
                var topRes = await fetch(
                    supabaseUrl + '/rest/v1/marketplace_listings?seller_id=eq.' + encodeURIComponent(user.userId) + '&status=eq.active&select=id,title,views,clicks,price,product_type&order=views.desc&limit=10',
                    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                );
                var topListings = await topRes.json();
                topListings = Array.isArray(topListings) ? topListings : [];

                // Get revenue for each
                var topEnriched = [];
                for (var j = 0; j < topListings.length; j++) {
                    var tl = topListings[j];
                    var tSalesRes = await fetch(
                        supabaseUrl + '/rest/v1/wallet_transactions?type=in.(purchase,store_purchase)&description=like.*' + encodeURIComponent(tl.id) + '*&select=amount&limit=100',
                        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
                    );
                    var tSales = await tSalesRes.json();
                    tSales = Array.isArray(tSales) ? tSales : [];
                    var tRev = tSales.reduce(function(s, t) { return s + Math.abs(t.amount || 0); }, 0);
                    var tCtr = (tl.views || 0) > 0 ? ((tl.clicks || 0) / tl.views * 100) : 0;

                    topEnriched.push({
                        rank: j + 1,
                        id: tl.id,
                        title: tl.title,
                        views: tl.views || 0,
                        clicks: tl.clicks || 0,
                        ctr: parseFloat(tCtr.toFixed(1)),
                        sales: tSales.length,
                        revenue: tRev,
                        price: tl.price,
                        product_type: tl.product_type
                    });
                }

                return new Response(JSON.stringify({ ok: true, data: topEnriched }), {
                    status: 200, headers: corsHeaders(origin)
                });
            }

            default:
                return new Response(JSON.stringify({ ok: false, error: 'Unknown action: ' + action }), {
                    status: 400, headers: corsHeaders(origin)
                });
        }
    } catch (err) {
        console.error('seller-dashboard error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal server error' }), {
            status: 500, headers: corsHeaders(origin)
        });
    }
}
