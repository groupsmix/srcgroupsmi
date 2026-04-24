// ═══════════════════════════════════════
// GROUPSMIX — store.js
// Store Page — LemonSqueezy + AI Integration
// Production-ready client-side logic
// ═══════════════════════════════════════
(function () {
    'use strict';

    /* ── Configuration ────────────────────── */
    var STORE_CONFIG = {
        apiEndpoint: '/api/lemonsqueezy',
        aiEndpoint: '/api/store-ai',
        cacheKey: 'gm_store_products',
        cacheTTL: 300000,         // 5 min client cache
        viewedKey: 'gm_store_viewed',
        viewedCategoriesKey: 'gm_store_viewed_cats',
        maxViewed: 50,
        maxViewedCategories: 20,
        debounceMs: 400
    };

    /* ── i18n (bilingual) ─────────────────── */
    var isArabic = (navigator.language || '').substring(0, 2) === 'ar';

    var i18n = {
        search_placeholder: isArabic ? 'ابحث بالذكاء الاصطناعي... مثلاً "أريد كتاب عن إدارة المجتمعات"' : 'AI Search... e.g. "I need a guide for community management"',
        search_btn: isArabic ? 'بحث ذكي' : 'AI Search',
        search_ai_badge: isArabic ? 'بحث مدعوم بالذكاء الاصطناعي — عربي وإنجليزي' : 'AI-powered search — Arabic & English',
        all: isArabic ? 'الكل' : 'All',
        guide: isArabic ? 'أدلة' : 'Guides',
        template: isArabic ? 'قوالب' : 'Templates',
        course: isArabic ? 'دورات' : 'Courses',
        tool: isArabic ? 'أدوات' : 'Tools',
        membership: isArabic ? 'عضويات' : 'Memberships',
        bundle: isArabic ? 'باقات' : 'Bundles',
        service: isArabic ? 'خدمات' : 'Services',
        digital: isArabic ? 'رقمي' : 'Digital',
        sort_label: isArabic ? 'ترتيب:' : 'Sort:',
        sort_newest: isArabic ? 'الأحدث' : 'Newest',
        sort_price_low: isArabic ? 'السعر: الأقل' : 'Price: Low to High',
        sort_price_high: isArabic ? 'السعر: الأعلى' : 'Price: High to Low',
        sort_name: isArabic ? 'الاسم' : 'Name',
        sort_personalized: isArabic ? 'مخصص لك' : 'For You',
        buy_now: isArabic ? 'اشتر الآن' : 'Buy Now',
        subscribe: isArabic ? 'اشترك الآن' : 'Subscribe',
        free: isArabic ? 'مجاناً' : 'Free',
        loading: isArabic ? 'جاري تحميل المنتجات...' : 'Loading products...',
        no_products: isArabic ? 'لا توجد منتجات' : 'No products found',
        no_products_desc: isArabic ? 'جرب تغيير الفلاتر أو البحث بكلمات مختلفة' : 'Try adjusting your filters or search terms',
        error_title: isArabic ? 'حدث خطأ' : 'Something went wrong',
        error_desc: isArabic ? 'لم نتمكن من تحميل المنتجات. حاول مرة أخرى.' : 'We couldn\'t load the products. Please try again.',
        retry: isArabic ? 'حاول مرة أخرى' : 'Try Again',
        recommended: isArabic ? 'مقترحات لك' : 'Recommended for You',
        recommended_sub: isArabic ? 'بناءً على اهتماماتك' : 'Based on your interests',
        bundles_title: isArabic ? 'باقات ذكية' : 'Smart Bundles',
        bundles_sub: isArabic ? 'وفر أكثر مع هذه الباقات المقترحة بالذكاء الاصطناعي' : 'Save more with AI-suggested bundles',
        ai_searching: isArabic ? 'الذكاء الاصطناعي يبحث لك...' : 'AI is searching for you...',
        results: isArabic ? 'نتيجة' : 'results',
        showing: isArabic ? 'عرض' : 'Showing',
        of: isArabic ? 'من' : 'of',
        save: isArabic ? 'خصم' : 'Save',
        per_month: isArabic ? '/شهر' : '/mo',
        per_year: isArabic ? '/سنة' : '/yr',
        hero_title: isArabic ? 'متجر GroupsMix' : 'GroupsMix Store',
        hero_subtitle: isArabic ? 'أدوات وموارد احترافية لتنمية مجتمعك الرقمي' : 'Professional tools & resources to grow your digital community'
    };

    /* ── State ─────────────────────────────── */
    var state = {
        products: [],
        filteredProducts: [],
        allProducts: [],
        currentType: 'all',
        currentSort: 'personalized',
        searchQuery: '',
        isLoading: true,
        isAISearching: false,
        recommendations: [],
        bundles: []
    };

    /* ── DOM References ───────────────────── */
    var els = {};

    /* ── Utility: Sanitize HTML ───────────── */
    function sanitize(str) {
        if (typeof Security !== 'undefined' && Security.sanitize) return Security.sanitize(str);
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    /* ── Utility: Debounce ────────────────── */
    function debounce(fn, delay) {
        var timer;
        return function (...args) {
            var ctx = this;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
        };
    }

    /* ── Utility: Format price ────────────── */
    function formatPrice(cents) {
        if (!cents || cents === 0) return i18n.free;
        return '$' + (cents / 100).toFixed(2);
    }

    /* ── Utility: Strip HTML from descriptions ── */
    function stripHtml(html) {
        if (!html) return '';
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    /* ── Utility: Local Storage helpers ───── */
    function getStored(key) {
        return SafeStorage.getJSON(key, null);
    }

    function setStored(key, value) {
        SafeStorage.setJSON(key, value);
    }

    /* ── Track viewed product ─────────────── */
    function trackViewed(productId, productType) {
        // Track product IDs
        var viewed = getStored(STORE_CONFIG.viewedKey) || [];
        if (viewed.indexOf(productId) === -1) {
            viewed.unshift(productId);
            if (viewed.length > STORE_CONFIG.maxViewed) viewed.pop();
            setStored(STORE_CONFIG.viewedKey, viewed);
        }
        // Track categories
        if (productType) {
            var cats = getStored(STORE_CONFIG.viewedCategoriesKey) || [];
            if (cats.indexOf(productType) === -1) {
                cats.unshift(productType);
                if (cats.length > STORE_CONFIG.maxViewedCategories) cats.pop();
            } else {
                // Move to front
                cats.splice(cats.indexOf(productType), 1);
                cats.unshift(productType);
            }
            setStored(STORE_CONFIG.viewedCategoriesKey, cats);
        }
    }

    /* ── Fetch products from API ──────────── */
    async function fetchProducts() {
        // Check client cache first
        var cached = getStored(STORE_CONFIG.cacheKey);
        if (cached && cached.products && cached.timestamp) {
            var age = Date.now() - cached.timestamp;
            if (age < STORE_CONFIG.cacheTTL) {
                return cached.products;
            }
        }

        // Build personalized query params
        var endpoint = STORE_CONFIG.apiEndpoint + '?sort=personalized';
        var viewedCats = getStored(STORE_CONFIG.viewedCategoriesKey) || [];
        var viewedIds = getStored(STORE_CONFIG.viewedKey) || [];
        var groupCats = getStored('gm_user_group_categories') || [];
        if (viewedCats.length) endpoint += '&viewed_types=' + encodeURIComponent(viewedCats.join(','));
        if (viewedIds.length) endpoint += '&viewed_ids=' + encodeURIComponent(viewedIds.slice(0, 20).join(','));
        if (groupCats.length) endpoint += '&group_categories=' + encodeURIComponent(groupCats.join(','));

        var res = await fetch(endpoint);
        if (!res.ok) throw new Error('API error: ' + res.status);
        var json = await res.json();
        if (!json.ok) throw new Error(json.error || 'Unknown error');

        // Cache locally
        setStored(STORE_CONFIG.cacheKey, {
            products: json.products,
            timestamp: Date.now()
        });

        return json.products;
    }

    /* ── Render: Product card HTML ────────── */
    function productCardHTML(product) {
        var desc = stripHtml(product.description);
        var priceText = product.price === 0 ? i18n.free : product.price_formatted || formatPrice(product.price);
        var periodText = '';
        if (product.is_subscription && product.interval) {
            periodText = product.interval === 'month' ? i18n.per_month : i18n.per_year;
        }
        var btnText = product.is_subscription ? i18n.subscribe : i18n.buy_now;
        var typeLabel = i18n[product.product_type] || i18n.digital;
        var badgeClass = 'store-card__badge--' + (product.product_type || 'digital');

        var imageHtml = '';
        if (product.large_thumb_url || product.thumb_url) {
            imageHtml = '<img src="' + sanitize(product.large_thumb_url || product.thumb_url) + '" alt="' + sanitize(product.name) + '" loading="lazy">';
        } else {
            // Placeholder icon based on type
            var iconMap = {
                guide: '\uD83D\uDCD6', template: '\uD83D\uDCC4', course: '\uD83C\uDF93',
                tool: '\uD83D\uDEE0', membership: '\u2B50', bundle: '\uD83C\uDF81',
                service: '\uD83D\uDCBC', digital: '\uD83D\uDCE6'
            };
            imageHtml = '<span class="store-card__image-placeholder">' + (iconMap[product.product_type] || '\uD83D\uDCE6') + '</span>';
        }

        return '<div class="store-card" data-product-id="' + sanitize(product.id) + '" data-type="' + sanitize(product.product_type) + '">' +
            '<div class="store-card__image">' +
            imageHtml +
            '<span class="store-card__badge ' + badgeClass + '">' + sanitize(typeLabel) + '</span>' +
            (product.is_subscription ? '<span class="store-card__badge store-card__badge--subscription" style="top:auto;bottom:var(--space-3)">' + (isArabic ? 'اشتراك' : 'Subscription') + '</span>' : '') +
            '</div>' +
            '<div class="store-card__body">' +
            '<div class="store-card__type">' + sanitize(typeLabel) + '</div>' +
            '<div class="store-card__title">' + sanitize(product.name) + '</div>' +
            '<div class="store-card__desc">' + sanitize(desc.substring(0, 200)) + '</div>' +
            '</div>' +
            '<div class="store-card__footer">' +
            '<div class="store-card__price">' + sanitize(priceText) +
            (periodText ? '<span class="store-card__price-period">' + sanitize(periodText) + '</span>' : '') +
            '</div>' +
            '<a href="' + sanitize(product.buy_now_url) + '" target="_blank" rel="noopener noreferrer" class="store-card__buy-btn" data-product-id="' + sanitize(product.id) + '" data-product-type="' + sanitize(product.product_type) + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>' +
            sanitize(btnText) +
            '</a>' +
            '</div>' +
            '</div>';
    }

    /* ── Render: Skeleton loader ──────────── */
    function skeletonHTML(count) {
        var html = '';
        for (var i = 0; i < (count || 6); i++) {
            html += '<div class="store-skeleton">' +
                '<div class="store-skeleton__image"></div>' +
                '<div class="store-skeleton__body">' +
                '<div class="store-skeleton__line store-skeleton__line--title"></div>' +
                '<div class="store-skeleton__line store-skeleton__line--desc"></div>' +
                '<div class="store-skeleton__line store-skeleton__line--desc2"></div>' +
                '</div>' +
                '<div class="store-skeleton__footer">' +
                '<div class="store-skeleton__price"></div>' +
                '<div class="store-skeleton__btn"></div>' +
                '</div>' +
                '</div>';
        }
        return html;
    }

    /* ── Render: Product grid ─────────────── */
    function renderProducts(products) {
        var grid = els.productGrid;
        if (!grid) return;

        if (!products || !products.length) {
            grid.innerHTML = '<div class="store-empty">' +
                '<div class="store-empty__icon">\uD83D\uDCE6</div>' +
                '<div class="store-empty__title">' + sanitize(i18n.no_products) + '</div>' +
                '<div class="store-empty__desc">' + sanitize(i18n.no_products_desc) + '</div>' +
                (state.currentType !== 'all' || state.searchQuery ?
                    '<button class="btn btn-primary" id="store-clear-filters">' + (isArabic ? 'مسح الفلاتر' : 'Clear Filters') + '</button>' : '') +
                '</div>';
            var clearBtn = document.getElementById('store-clear-filters');
            if (clearBtn) {
                clearBtn.addEventListener('click', function () {
                    state.currentType = 'all';
                    state.searchQuery = '';
                    if (els.searchInput) els.searchInput.value = '';
                    updateActiveChip();
                    applyFilters();
                });
            }
            return;
        }

        // Results count
        var countHtml = '';
        if (state.searchQuery || state.currentType !== 'all') {
            countHtml = '<div class="store-results-count">' + i18n.showing + ' <strong>' + products.length + '</strong> ' + i18n.results +
                (state.allProducts.length > products.length ? ' ' + i18n.of + ' ' + state.allProducts.length : '') + '</div>';
        }

        grid.innerHTML = countHtml + '<div class="store-grid">' + products.map(productCardHTML).join('') + '</div>';

        // Bind buy buttons to track views
        grid.querySelectorAll('.store-card__buy-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var pid = btn.dataset.productId;
                var ptype = btn.dataset.productType;
                trackViewed(pid, ptype);
            });
        });

        // Bind card clicks for hover/view tracking
        grid.querySelectorAll('.store-card').forEach(function (card) {
            card.addEventListener('mouseenter', function () {
                var pid = card.dataset.productId;
                var ptype = card.dataset.type;
                trackViewed(pid, ptype);
            });
        });
    }

    /* ── Render: Recommendations ──────────── */
    function renderRecommendations(recommendedIds) {
        var section = els.recommendationsSection;
        if (!section) return;
        if (!recommendedIds || !recommendedIds.length) {
            section.style.display = 'none';
            return;
        }

        var recProducts = recommendedIds
            .map(function (id) { return state.allProducts.find(function (p) { return p.id === id; }); })
            .filter(Boolean)
            .slice(0, 4);

        if (!recProducts.length) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        section.innerHTML = '<div class="store-section__header">' +
            '<div>' +
            '<div class="store-section__title">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>' +
            sanitize(i18n.recommended) +
            '</div>' +
            '<div class="store-section__subtitle">' + sanitize(i18n.recommended_sub) + '</div>' +
            '</div>' +
            '</div>' +
            '<div class="store-grid">' + recProducts.map(productCardHTML).join('') + '</div>';
    }

    /* ── Render: Smart Bundles ────────────── */
    function renderBundles(bundles) {
        var section = els.bundlesSection;
        if (!section) return;
        if (!bundles || !bundles.length) {
            section.style.display = 'none';
            return;
        }

        var html = '<div class="store-section__header">' +
            '<div>' +
            '<div class="store-section__title">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>' +
            sanitize(i18n.bundles_title) +
            '</div>' +
            '<div class="store-section__subtitle">' + sanitize(i18n.bundles_sub) + '</div>' +
            '</div>' +
            '</div>' +
            '<div class="store-bundles">';

        bundles.forEach(function (bundle) {
            var bundleProducts = bundle.product_ids
                .map(function (id) { return state.allProducts.find(function (p) { return p.id === id; }); })
                .filter(Boolean);

            if (bundleProducts.length < 2) return;

            var totalPrice = bundleProducts.reduce(function (sum, p) { return sum + (p.price || 0); }, 0);
            var discountedPrice = Math.round(totalPrice * (1 - bundle.discount_pct / 100));
            var bundleName = isArabic ? bundle.name_ar : bundle.name;
            var reason = isArabic ? bundle.reason_ar : bundle.reason;

            html += '<div class="store-bundle">' +
                '<span class="store-bundle__badge">' +
                '<svg style="width:12px;height:12px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>' +
                (isArabic ? 'باقة ذكية' : 'Smart Bundle') +
                '</span>' +
                '<div class="store-bundle__name">' + sanitize(bundleName) + '</div>' +
                '<div class="store-bundle__reason">' + sanitize(reason) + '</div>' +
                '<ul class="store-bundle__products">' +
                bundleProducts.map(function (p) {
                    return '<li>' + sanitize(p.name) + ' <span style="color:var(--text-muted);margin-' + (isArabic ? 'right' : 'left') + ':auto">' + sanitize(p.price_formatted || formatPrice(p.price)) + '</span></li>';
                }).join('') +
                '</ul>' +
                '<div class="store-bundle__footer">' +
                '<span class="store-bundle__discount">' + i18n.save + ' ' + bundle.discount_pct + '%</span>' +
                '<div class="store-bundle__price">' +
                '<span class="store-bundle__price-original">' + formatPrice(totalPrice) + '</span>' +
                '<span class="store-bundle__price-final">' + formatPrice(discountedPrice) + '</span>' +
                '</div>' +
                '</div>' +
                '</div>';
        });

        html += '</div>';
        section.innerHTML = html;
        section.style.display = 'block';
    }

    /* ── Render: Error state ──────────────── */
    function renderError() {
        var grid = els.productGrid;
        if (!grid) return;
        grid.innerHTML = '<div class="store-empty">' +
            '<div class="store-empty__icon">\u26A0\uFE0F</div>' +
            '<div class="store-empty__title">' + sanitize(i18n.error_title) + '</div>' +
            '<div class="store-empty__desc">' + sanitize(i18n.error_desc) + '</div>' +
            '<button class="btn btn-primary" id="store-retry-btn">' + sanitize(i18n.retry) + '</button>' +
            '</div>';
        document.getElementById('store-retry-btn')?.addEventListener('click', loadStore);
    }

    /* ── Filter & Sort Logic ──────────────── */
    function applyFilters() {
        var products = state.allProducts.slice();

        // Type filter
        if (state.currentType && state.currentType !== 'all') {
            products = products.filter(function (p) { return p.product_type === state.currentType; });
        }

        // Sort
        switch (state.currentSort) {
            case 'newest':
                products.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
                break;
            case 'price-low':
                products.sort(function (a, b) { return a.price - b.price; });
                break;
            case 'price-high':
                products.sort(function (a, b) { return b.price - a.price; });
                break;
            case 'name':
                products.sort(function (a, b) { return a.name.localeCompare(b.name); });
                break;
            case 'personalized':
                // Products are already ranked by server; keep order
                break;
        }

        state.filteredProducts = products;
        renderProducts(products);
    }

    /* ── Update active filter chip ────────── */
    function updateActiveChip() {
        if (!els.filterChips) return;
        els.filterChips.querySelectorAll('.store-filter-chip').forEach(function (chip) {
            if (chip.dataset.type === state.currentType) {
                chip.classList.add('store-filter-chip--active');
            } else {
                chip.classList.remove('store-filter-chip--active');
            }
        });
    }

    /* ── AI Smart Search ──────────────────── */
    var performAISearch = debounce(async function (query) {
        if (!query || query.length < 2) {
            state.searchQuery = '';
            applyFilters();
            return;
        }

        state.searchQuery = query;
        state.isAISearching = true;

        // Show searching indicator
        if (els.productGrid) {
            els.productGrid.innerHTML = '<div class="store-ai-searching">' +
                '<span class="btn-spinner"></span>' +
                sanitize(i18n.ai_searching) +
                '</div>';
        }

        try {
            var res = await fetch(STORE_CONFIG.aiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'search',
                    query: query,
                    products: state.allProducts.map(function (p) {
                        return {
                            id: p.id,
                            name: p.name,
                            description: stripHtml(p.description).substring(0, 150),
                            product_type: p.product_type,
                            price_formatted: p.price_formatted
                        };
                    })
                })
            });

            var json = await res.json();
            if (json.ok && json.matches && json.matches.length > 0) {
                var matchedProducts = json.matches
                    .map(function (idx) { return state.allProducts[idx - 1]; })
                    .filter(Boolean);
                state.filteredProducts = matchedProducts;
                renderProducts(matchedProducts);
            } else {
                // Fallback to text search
                var q = query.toLowerCase();
                var textMatches = state.allProducts.filter(function (p) {
                    return p.name.toLowerCase().indexOf(q) !== -1 ||
                        stripHtml(p.description).toLowerCase().indexOf(q) !== -1;
                });
                state.filteredProducts = textMatches;
                renderProducts(textMatches);
            }
        } catch (e) {
            console.error('AI search error:', e);
            // Fallback to simple text search
            var q = query.toLowerCase();
            var textMatches = state.allProducts.filter(function (p) {
                return p.name.toLowerCase().indexOf(q) !== -1 ||
                    stripHtml(p.description).toLowerCase().indexOf(q) !== -1;
            });
            state.filteredProducts = textMatches;
            renderProducts(textMatches);
        }

        state.isAISearching = false;
    }, STORE_CONFIG.debounceMs);

    /* ── Load AI Recommendations ──────────── */
    async function loadRecommendations() {
        var viewed = getStored(STORE_CONFIG.viewedKey) || [];
        var viewedCats = getStored(STORE_CONFIG.viewedCategoriesKey) || [];

        try {
            var res = await fetch(STORE_CONFIG.aiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'recommend',
                    products: state.allProducts.map(function (p) {
                        return { id: p.id, name: p.name, product_type: p.product_type, price_formatted: p.price_formatted, created_at: p.created_at };
                    }),
                    viewed_products: viewed,
                    viewed_categories: viewedCats
                })
            });
            var json = await res.json();
            if (json.ok && json.recommended) {
                state.recommendations = json.recommended;
                renderRecommendations(json.recommended);
            }
        } catch (e) {
            console.error('Recommendations error:', e);
            // Fallback: show newest products as recommendations
            var newest = state.allProducts
                .slice()
                .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); })
                .slice(0, 4)
                .map(function (p) { return p.id; });
            renderRecommendations(newest);
        }
    }

    /* ── Load Smart Bundles ───────────────── */
    async function loadBundles() {
        if (state.allProducts.length < 3) return;

        try {
            var res = await fetch(STORE_CONFIG.aiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'bundles',
                    products: state.allProducts.map(function (p) {
                        return { id: p.id, name: p.name, product_type: p.product_type, price: p.price, price_formatted: p.price_formatted };
                    })
                })
            });
            var json = await res.json();
            if (json.ok && json.bundles) {
                state.bundles = json.bundles;
                renderBundles(json.bundles);
            }
        } catch (e) {
            console.error('Bundles error:', e);
        }
    }

    /* ── Build Filter UI ──────────────────── */
    function buildFilters() {
        var container = els.filtersContainer;
        if (!container) return;

        // Get unique product types from products
        var types = ['all'];
        state.allProducts.forEach(function (p) {
            if (types.indexOf(p.product_type) === -1) types.push(p.product_type);
        });

        var chipsHtml = types.map(function (type) {
            var label = i18n[type] || type;
            var isActive = state.currentType === type;
            return '<button class="store-filter-chip' + (isActive ? ' store-filter-chip--active' : '') + '" data-type="' + sanitize(type) + '">' + sanitize(label) + '</button>';
        }).join('');

        container.innerHTML = '<div class="store-filters">' +
            '<div class="store-filters__chips" id="store-filter-chips">' + chipsHtml + '</div>' +
            '<div class="store-filters__sort">' +
            '<span class="store-filters__sort-label">' + sanitize(i18n.sort_label) + '</span>' +
            '<select class="store-filters__sort-select" id="store-sort-select">' +
            '<option value="newest"' + (state.currentSort === 'newest' ? ' selected' : '') + '>' + sanitize(i18n.sort_newest) + '</option>' +
            '<option value="price-low"' + (state.currentSort === 'price-low' ? ' selected' : '') + '>' + sanitize(i18n.sort_price_low) + '</option>' +
            '<option value="price-high"' + (state.currentSort === 'price-high' ? ' selected' : '') + '>' + sanitize(i18n.sort_price_high) + '</option>' +
            '<option value="name"' + (state.currentSort === 'name' ? ' selected' : '') + '>' + sanitize(i18n.sort_name) + '</option>' +
            '<option value="personalized"' + (state.currentSort === 'personalized' ? ' selected' : '') + '>' + sanitize(i18n.sort_personalized) + '</option>' +
            '</select>' +
            '</div>' +
            '</div>';

        // Cache refs
        els.filterChips = document.getElementById('store-filter-chips');
        els.sortSelect = document.getElementById('store-sort-select');

        // Bind chip clicks
        if (els.filterChips) {
            els.filterChips.querySelectorAll('.store-filter-chip').forEach(function (chip) {
                chip.addEventListener('click', function () {
                    state.currentType = chip.dataset.type;
                    updateActiveChip();
                    applyFilters();
                });
            });
        }

        // Bind sort change
        if (els.sortSelect) {
            els.sortSelect.addEventListener('change', function () {
                state.currentSort = els.sortSelect.value;
                applyFilters();
            });
        }
    }

    /* ── Build Search UI ──────────────────── */
    function buildSearch() {
        var container = els.searchContainer;
        if (!container) return;

        container.innerHTML = '<div class="store-search">' +
            '<svg class="store-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>' +
            '<input type="text" class="store-search__input" id="store-search-input" placeholder="' + sanitize(i18n.search_placeholder) + '" autocomplete="off">' +
            '<button class="store-search__btn" id="store-search-btn">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>' +
            sanitize(i18n.search_btn) +
            '</button>' +
            '</div>' +
            '<div class="store-search__ai-badge">' +
            '<svg style="width:12px;height:12px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>' +
            sanitize(i18n.search_ai_badge) +
            '</div>';

        els.searchInput = document.getElementById('store-search-input');
        var searchBtn = document.getElementById('store-search-btn');

        // Bind search
        if (els.searchInput) {
            els.searchInput.addEventListener('input', function () {
                var val = els.searchInput.value.trim();
                if (val.length >= 2) {
                    performAISearch(val);
                } else if (val.length === 0) {
                    state.searchQuery = '';
                    applyFilters();
                }
            });

            els.searchInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    var val = els.searchInput.value.trim();
                    if (val) performAISearch(val);
                }
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', function () {
                var val = els.searchInput ? els.searchInput.value.trim() : '';
                if (val) performAISearch(val);
            });
        }
    }

    /* ── Main: Load Store ─────────────────── */
    async function loadStore() {
        state.isLoading = true;

        // Show skeletons
        if (els.productGrid) {
            els.productGrid.innerHTML = '<div class="store-grid">' + skeletonHTML(6) + '</div>';
        }

        try {
            var products = await fetchProducts();
            state.allProducts = products;
            state.filteredProducts = products;
            state.isLoading = false;

            // Build dynamic UI
            buildFilters();
            applyFilters();

            // Load AI features in background (non-blocking)
            loadRecommendations();
            loadBundles();

            // Expose products to chatbot context
            if (typeof window.StoreContext === 'undefined') {
                window.StoreContext = {};
            }
            window.StoreContext.products = products;
            window.StoreContext.getProductById = function (id) {
                return products.find(function (p) { return p.id === id; });
            };
            window.StoreContext.searchProducts = function (q) {
                var lq = q.toLowerCase();
                return products.filter(function (p) {
                    return p.name.toLowerCase().indexOf(lq) !== -1 ||
                        stripHtml(p.description).toLowerCase().indexOf(lq) !== -1;
                });
            };

        } catch (err) {
            console.error('Store load error:', err);
            state.isLoading = false;
            renderError();
        }
    }

    /* ── Initialize ───────────────────────── */
    function init() {
        // Cache DOM references
        els.searchContainer = document.getElementById('store-search-container');
        els.filtersContainer = document.getElementById('store-filters-container');
        els.productGrid = document.getElementById('store-product-grid');
        els.recommendationsSection = document.getElementById('store-recommendations');
        els.bundlesSection = document.getElementById('store-bundles');

        // Build search UI
        buildSearch();

        // Load products
        loadStore();
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /* ── Exports ──────────────────────────── */
    window.GroupsMixStore = {
        refresh: loadStore,
        getProducts: function () { return state.allProducts; },
        getState: function () { return state; },
        trackViewed: trackViewed
    };

})();
