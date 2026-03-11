/**
 * fuel-components.js — UI Components for Fuel the Community
 * Badges display, level progress, tip modal, coin purchase, wallet UI, challenges
 *
 * Dependencies: components.js (UI), fuel-community.js (Wallet, Tips, WriterBadges, etc.)
 * Must be loaded AFTER components.js and fuel-community.js
 */

/* global UI, Security, Auth, ICONS, CONFIG, Wallet, Tips, TIP_TYPES, WriterBadges, WriterLevels, WRITER_LEVELS, Challenges, FuelCommunity, Analytics */

// ═══════════════════════════════════════
// BADGE DISPLAY COMPONENTS
// ═══════════════════════════════════════

/**
 * Render a single badge pill with icon and tooltip
 */
UI.fuelBadge = function (badge) {
    if (!badge) return '';
    var def = badge.badge || badge;
    var icon = WriterBadges.getBadgeIcon(def.icon || 'star');
    return '<span class="fuel-badge" style="--badge-color:' + Security.sanitize(def.color || '#6C63FF') + '" title="' + Security.sanitize(def.description || def.name || '') + '">' +
        '<span class="fuel-badge__icon">' + icon + '</span>' +
        '<span class="fuel-badge__name">' + Security.sanitize(def.name || '') + '</span>' +
        '</span>';
};

/**
 * Render a row of badge pills for a user
 */
UI.fuelBadgeRow = function (badges) {
    if (!badges || !Array.isArray(badges) || badges.length === 0) return '';
    return '<div class="fuel-badge-row">' + badges.map(function(b) { return UI.fuelBadge(b); }).join('') + '</div>';
};

/**
 * Render full badge showcase (profile page)
 */
UI.fuelBadgeShowcase = function (badges, allDefinitions) {
    if (!allDefinitions || allDefinitions.length === 0) return '';
    var earnedIds = (badges || []).map(function(b) { return b.badge_id || (b.badge && b.badge.id); });
    return '<div class="fuel-badge-showcase">' +
        '<h3 class="fuel-section-title">Writer Badges</h3>' +
        '<div class="fuel-badge-grid">' +
        allDefinitions.map(function(def) {
            var earned = earnedIds.indexOf(def.id) !== -1;
            var earnedBadge = earned ? badges.find(function(b) { return (b.badge_id || (b.badge && b.badge.id)) === def.id; }) : null;
            var icon = WriterBadges.getBadgeIcon(def.icon || 'star');
            return '<div class="fuel-badge-card' + (earned ? ' fuel-badge-card--earned' : ' fuel-badge-card--locked') + '">' +
                '<div class="fuel-badge-card__icon" style="--badge-color:' + Security.sanitize(def.color || '#6C63FF') + '">' + icon + '</div>' +
                '<div class="fuel-badge-card__name">' + Security.sanitize(def.name) + '</div>' +
                '<div class="fuel-badge-card__desc">' + Security.sanitize(def.description || '') + '</div>' +
                (earned && earnedBadge ? '<div class="fuel-badge-card__date">Earned ' + UI.formatDate(earnedBadge.awarded_at) + '</div>' : '') +
                (!earned ? '<div class="fuel-badge-card__locked">Locked</div>' : '') +
                '</div>';
        }).join('') +
        '</div></div>';
};


// ═══════════════════════════════════════
// WRITER LEVEL COMPONENTS
// ═══════════════════════════════════════

/**
 * Compact level badge (for cards, lists)
 */
UI.fuelLevelBadge = function (levelKey, xp) {
    var info = WriterLevels.getLevelInfo(levelKey || 'newcomer');
    return '<span class="fuel-level-badge" style="--level-color:' + info.color + '" title="' + info.name + ' (' + (xp || 0) + ' XP)">' +
        '<span class="fuel-level-badge__name">' + Security.sanitize(info.name) + '</span>' +
        '</span>';
};

/**
 * Level progress bar with XP info
 */
UI.fuelLevelProgress = function (xp) {
    var progress = WriterLevels.getLevelProgress(xp);
    var current = progress.current;
    var next = progress.next;
    return '<div class="fuel-level-progress">' +
        '<div class="fuel-level-progress__header">' +
        '<span class="fuel-level-progress__current" style="color:' + current.color + '">' + Security.sanitize(current.name) + '</span>' +
        (next ? '<span class="fuel-level-progress__next">Next: ' + Security.sanitize(next.name) + ' (' + progress.xpToNext + ' XP needed)</span>' : '<span class="fuel-level-progress__max">Max Level!</span>') +
        '</div>' +
        '<div class="fuel-level-progress__bar">' +
        '<div class="fuel-level-progress__fill" style="width:' + progress.progress + '%;background:' + current.color + '"></div>' +
        '</div>' +
        '<div class="fuel-level-progress__xp">' + (xp || 0) + ' XP</div>' +
        '</div>';
};

/**
 * Writer level card (for profile page)
 */
UI.fuelLevelCard = function (levelKey, xp) {
    var info = WriterLevels.getLevelInfo(levelKey || 'newcomer');
    var progress = WriterLevels.getLevelProgress(xp);
    return '<div class="fuel-level-card" style="--level-color:' + info.color + '">' +
        '<div class="fuel-level-card__icon">' + WriterBadges.getBadgeIcon(info.icon) + '</div>' +
        '<div class="fuel-level-card__info">' +
        '<div class="fuel-level-card__name">' + Security.sanitize(info.name) + '</div>' +
        '<div class="fuel-level-card__xp">' + (xp || 0) + ' XP</div>' +
        '</div>' +
        UI.fuelLevelProgress(xp) +
        (info.perks.length ? '<div class="fuel-level-card__perks"><strong>Perks:</strong> ' + info.perks.join(', ') + '</div>' : '') +
        '</div>';
};


// ═══════════════════════════════════════
// WALLET & COINS COMPONENTS
// ═══════════════════════════════════════

/**
 * Wallet balance header widget
 */
UI.fuelWalletWidget = function (wallet) {
    var balance = wallet ? wallet.coins_balance : 0;
    return '<div class="fuel-wallet-widget" id="fuel-wallet-widget">' +
        '<a href="/pages/user/wallet.html" class="fuel-wallet-widget__link">' +
        '<span class="fuel-wallet-widget__icon">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
        '</span>' +
        '<span class="fuel-wallet-widget__balance">' + Wallet.formatCoins(balance) + '</span>' +
        '<span class="fuel-wallet-widget__label">GMX</span>' +
        '</a>' +
        '</div>';
};

/**
 * Coin purchase card
 */
UI.fuelCoinPackageCard = function (pkg) {
    if (!pkg) return '';
    var totalCoins = (pkg.coins || 0) + (pkg.bonus_coins || 0);
    return '<div class="fuel-coin-package' + (pkg.is_popular ? ' fuel-coin-package--popular' : '') + '" data-package-id="' + pkg.id + '">' +
        (pkg.is_popular ? '<div class="fuel-coin-package__badge">Most Popular</div>' : '') +
        '<div class="fuel-coin-package__coins">' +
        '<span class="fuel-coin-package__amount">' + Wallet.formatCoins(totalCoins) + '</span>' +
        '<span class="fuel-coin-package__label">GMX Coins</span>' +
        '</div>' +
        (pkg.bonus_coins > 0 ? '<div class="fuel-coin-package__bonus">+' + pkg.bonus_coins + ' Bonus!</div>' : '') +
        '<div class="fuel-coin-package__price">$' + parseFloat(pkg.price_usd).toFixed(2) + '</div>' +
        '<button class="btn btn-primary fuel-coin-package__btn" data-package-id="' + pkg.id + '" data-lemon-product="' + Security.sanitize(pkg.lemon_product_id || '') + '" data-lemon-variant="' + Security.sanitize(pkg.lemon_variant_id || '') + '">Buy Now</button>' +
        '</div>';
};

/**
 * Coin purchase grid modal
 */
UI.fuelCoinPurchaseModal = function () {
    Wallet.getCoinPackages().then(function(packages) {
        var content = '<div class="fuel-coin-purchase">' +
            '<p class="fuel-coin-purchase__intro">Support your favorite writers by purchasing GMX Coins. Use them to tip articles and fuel the community!</p>' +
            '<div class="fuel-coin-purchase__grid">' +
            packages.map(function(pkg) { return UI.fuelCoinPackageCard(pkg); }).join('') +
            '</div>' +
            '<p class="fuel-coin-purchase__note">Payments processed securely by LemonSqueezy. Coins are added to your wallet instantly after purchase.</p>' +
            '</div>';

        UI.modal({
            title: 'Buy GMX Coins',
            content: content,
            size: 'large'
        });

        // Bind buy buttons
        document.querySelectorAll('.fuel-coin-package__btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var lemonProduct = btn.dataset.lemonProduct;
                var lemonVariant = btn.dataset.lemonVariant;
                if (!lemonProduct) {
                    UI.toast('Coin purchase will be available soon! LemonSqueezy integration pending.', 'info');
                    return;
                }
                // Redirect to LemonSqueezy checkout with uid in custom data
                var userId = Auth.getUserId() || '';
                var email = Auth.getEmail() || '';
                var checkoutUrl = 'https://groupsmix.lemonsqueezy.com/checkout/buy/' + lemonProduct;
                if (lemonVariant) checkoutUrl += '?variant=' + lemonVariant;
                checkoutUrl += (checkoutUrl.indexOf('?') !== -1 ? '&' : '?') + 'checkout[custom][uid]=' + encodeURIComponent(userId) + '&checkout[email]=' + encodeURIComponent(email);
                window.open(checkoutUrl, '_blank');
                UI.closeModal();
                Analytics.track('coin_purchase_started', 'monetization', { package_id: btn.dataset.packageId, product_id: lemonProduct });
            });
        });
    });
};

/**
 * Transaction row
 */
UI.fuelTransactionRow = function (txn) {
    if (!txn) return '';
    var isCredit = txn.amount > 0;
    var typeLabels = {
        purchase: 'Coin Purchase',
        tip_sent: 'Tip Sent',
        tip_received: 'Tip Received',
        reward: 'Activity Reward',
        challenge_bonus: 'Challenge Bonus',
        withdrawal: 'Withdrawal',
        refund: 'Refund',
        admin_credit: 'Admin Credit',
        admin_debit: 'Admin Debit'
    };
    var typeIcons = {
        purchase: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
        tip_sent: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
        tip_received: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
        reward: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
        withdrawal: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z"/></svg>'
    };
    return '<div class="fuel-txn-row' + (isCredit ? ' fuel-txn-row--credit' : ' fuel-txn-row--debit') + '">' +
        '<div class="fuel-txn-row__icon">' + (typeIcons[txn.type] || typeIcons.reward) + '</div>' +
        '<div class="fuel-txn-row__info">' +
        '<div class="fuel-txn-row__type">' + (typeLabels[txn.type] || txn.type) + '</div>' +
        '<div class="fuel-txn-row__desc">' + Security.sanitize(txn.description || '') + '</div>' +
        '</div>' +
        '<div class="fuel-txn-row__amount">' + (isCredit ? '+' : '') + txn.amount + ' GMX</div>' +
        '<div class="fuel-txn-row__date">' + UI.formatDate(txn.created_at) + '</div>' +
        '</div>';
};


// ═══════════════════════════════════════
// TIP MODAL COMPONENTS
// ═══════════════════════════════════════

/**
 * Open tip modal for an article/writer
 */
UI.fuelTipModal = function (receiverId, receiverName, articleId) {
    if (!Auth.isLoggedIn()) {
        UI.authModal('signin');
        return;
    }
    if (receiverId === Auth.getUserId()) {
        UI.toast('You cannot tip yourself', 'info');
        return;
    }

    var tipOptions = Object.keys(TIP_TYPES).map(function(key) {
        var tip = TIP_TYPES[key];
        return '<button class="fuel-tip-option" data-tip-type="' + key + '" data-coins="' + tip.coins + '">' +
            '<span class="fuel-tip-option__icon" style="color:' + tip.color + '">' + WriterBadges.getBadgeIcon(tip.icon) + '</span>' +
            '<span class="fuel-tip-option__name">' + Security.sanitize(tip.name) + '</span>' +
            '<span class="fuel-tip-option__coins">' + tip.coins + ' GMX</span>' +
            '</button>';
    }).join('');

    var content = '<div class="fuel-tip-modal">' +
        '<p class="fuel-tip-modal__intro">Send a tip to <strong>' + Security.sanitize(receiverName || 'this writer') + '</strong></p>' +
        '<div class="fuel-tip-modal__options">' + tipOptions + '</div>' +
        '<div class="fuel-tip-modal__message-wrap">' +
        '<textarea id="fuel-tip-message" class="form-input" placeholder="Add a message (optional)" maxlength="200" rows="2"></textarea>' +
        '</div>' +
        '<label class="fuel-tip-modal__anon"><input type="checkbox" id="fuel-tip-anonymous"> Send anonymously</label>' +
        '<div class="fuel-tip-modal__balance" id="fuel-tip-balance">Loading balance...</div>' +
        '<div class="fuel-tip-modal__actions">' +
        '<button class="btn btn-secondary" id="fuel-tip-buy-coins">Buy Coins</button>' +
        '</div>' +
        '</div>';

    UI.modal({
        title: 'Fuel This Writer',
        content: content,
        size: 'small'
    });

    // Load balance
    Wallet.getBalance().then(function(wallet) {
        var el = document.getElementById('fuel-tip-balance');
        if (el) {
            el.textContent = 'Your balance: ' + Wallet.formatCoins(wallet ? wallet.coins_balance : 0) + ' GMX Coins';
        }
    });

    // Bind tip option clicks
    document.querySelectorAll('.fuel-tip-option').forEach(function(btn) {
        btn.addEventListener('click', function() {
            // Visual selection
            document.querySelectorAll('.fuel-tip-option').forEach(function(b) { b.classList.remove('fuel-tip-option--selected'); });
            btn.classList.add('fuel-tip-option--selected');

            var tipType = btn.dataset.tipType;
            var message = (document.getElementById('fuel-tip-message') || {}).value || '';
            var isAnonymous = (document.getElementById('fuel-tip-anonymous') || {}).checked || false;

            // Confirm and send
            btn.disabled = true;
            btn.textContent = 'Sending...';
            Tips.send(receiverId, articleId, tipType, message, isAnonymous).then(function(result) {
                if (result) {
                    UI.closeModal();
                    // Show success animation
                    UI.fuelTipAnimation(TIP_TYPES[tipType]);
                } else {
                    btn.disabled = false;
                    btn.innerHTML = '<span class="fuel-tip-option__icon" style="color:' + TIP_TYPES[tipType].color + '">' + WriterBadges.getBadgeIcon(TIP_TYPES[tipType].icon) + '</span>' +
                        '<span class="fuel-tip-option__name">' + TIP_TYPES[tipType].name + '</span>' +
                        '<span class="fuel-tip-option__coins">' + TIP_TYPES[tipType].coins + ' GMX</span>';
                }
            });
        });
    });

    // Buy coins button
    var buyBtn = document.getElementById('fuel-tip-buy-coins');
    if (buyBtn) {
        buyBtn.addEventListener('click', function() {
            UI.closeModal();
            UI.fuelCoinPurchaseModal();
        });
    }
};

/**
 * Tip success animation overlay
 */
UI.fuelTipAnimation = function (tipInfo) {
    var overlay = document.createElement('div');
    overlay.className = 'fuel-tip-anim';
    overlay.innerHTML = '<div class="fuel-tip-anim__content">' +
        '<div class="fuel-tip-anim__icon" style="color:' + (tipInfo.color || '#F59E0B') + '">' + WriterBadges.getBadgeIcon(tipInfo.icon || 'star') + '</div>' +
        '<div class="fuel-tip-anim__text">' + Security.sanitize(tipInfo.name || 'Tip') + ' Sent!</div>' +
        '</div>';
    document.body.appendChild(overlay);
    setTimeout(function() { overlay.classList.add('fuel-tip-anim--show'); }, 10);
    setTimeout(function() {
        overlay.classList.remove('fuel-tip-anim--show');
        setTimeout(function() { overlay.remove(); }, 400);
    }, 2000);
};

/**
 * Inline "Fuel This Writer" button for article pages
 */
UI.fuelButton = function (receiverId, receiverName, articleId) {
    return '<button class="fuel-btn" data-receiver-id="' + receiverId + '" data-receiver-name="' + Security.sanitize(receiverName || '').replace(/"/g, '&quot;') + '" data-article-id="' + (articleId || '') + '">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
        ' Fuel This Writer' +
        '</button>';
};

/**
 * Initialize fuel buttons in a container
 */
UI.initFuelButtons = function (container) {
    container = container || document;
    container.querySelectorAll('.fuel-btn').forEach(function(btn) {
        if (btn._fuelInit) return;
        btn._fuelInit = true;
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            UI.fuelTipModal(btn.dataset.receiverId, btn.dataset.receiverName, btn.dataset.articleId);
        });
    });
};


// ═══════════════════════════════════════
// CHALLENGE COMPONENTS
// ═══════════════════════════════════════

/**
 * Challenge card
 */
UI.fuelChallengeCard = function (challenge) {
    if (!challenge) return '';
    var isActive = challenge.status === 'active';
    var myParticipation = challenge.my_participation;
    var timeLeft = '';
    if (isActive && challenge.ends_at) {
        var diff = new Date(challenge.ends_at) - new Date();
        var days = Math.floor(diff / 86400000);
        var hours = Math.floor((diff % 86400000) / 3600000);
        timeLeft = days > 0 ? days + 'd ' + hours + 'h left' : hours + 'h left';
    }

    return '<div class="fuel-challenge-card' + (isActive ? ' fuel-challenge-card--active' : '') + '">' +
        '<div class="fuel-challenge-card__header">' +
        '<h3 class="fuel-challenge-card__title">' + Security.sanitize(challenge.title) + '</h3>' +
        (timeLeft ? '<span class="fuel-challenge-card__time">' + timeLeft + '</span>' : '') +
        '</div>' +
        '<p class="fuel-challenge-card__desc">' + Security.sanitize(challenge.description || '') + '</p>' +
        '<div class="fuel-challenge-card__rewards">' +
        '<span class="fuel-challenge-card__reward">' + (challenge.reward_coins || 0) + ' GMX Coins</span>' +
        '<span class="fuel-challenge-card__reward">' + (challenge.reward_xp || 0) + ' XP</span>' +
        '</div>' +
        '<div class="fuel-challenge-card__meta">' +
        '<span>' + (challenge.participant_count || 0) + ' participants</span>' +
        (challenge.max_participants > 0 ? '<span>Max: ' + challenge.max_participants + '</span>' : '') +
        '</div>' +
        '<div class="fuel-challenge-card__actions">' +
        (isActive && !myParticipation ?
            '<button class="btn btn-primary btn-sm fuel-challenge-join-btn" data-challenge-id="' + challenge.id + '">Join Challenge</button>' :
            myParticipation ?
                (myParticipation.completed ? '<span class="fuel-challenge-card__status fuel-challenge-card__status--done">Completed!</span>' : '<span class="fuel-challenge-card__status">Joined - Progress: ' + (myParticipation.progress || 0) + '/' + (challenge.required_count || 1) + '</span>') :
                '<span class="fuel-challenge-card__status">Coming Soon</span>'
        ) +
        '</div>' +
        '</div>';
};

/**
 * Initialize challenge join buttons
 */
UI.initChallengeButtons = function (container) {
    container = container || document;
    container.querySelectorAll('.fuel-challenge-join-btn').forEach(function(btn) {
        if (btn._challengeInit) return;
        btn._challengeInit = true;
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            btn.disabled = true;
            btn.textContent = 'Joining...';
            Challenges.join(btn.dataset.challengeId).then(function(result) {
                if (result) {
                    btn.textContent = 'Joined!';
                    btn.classList.remove('btn-primary');
                    btn.classList.add('btn-secondary');
                } else {
                    btn.disabled = false;
                    btn.textContent = 'Join Challenge';
                }
            });
        });
    });
};


// ═══════════════════════════════════════
// LEADERBOARD COMPONENTS
// ═══════════════════════════════════════

/**
 * Enhanced leaderboard row with level and badges
 */
UI.fuelLeaderboardRow = function (user, rank) {
    var medalIcons = { 1: 'crown', 2: 'star', 3: 'award' };
    var medalColors = { 1: '#EAB308', 2: '#94A3B8', 3: '#D97706' };
    var medal = rank <= 3 ? '<span class="fuel-lb-medal" style="color:' + medalColors[rank] + '">' + WriterBadges.getBadgeIcon(medalIcons[rank]) + '</span>' : '<span class="fuel-lb-rank">#' + rank + '</span>';

    return '<div class="fuel-lb-row' + (rank <= 3 ? ' fuel-lb-row--top' + rank : '') + '">' +
        '<div class="fuel-lb-row__rank">' + medal + '</div>' +
        '<div class="fuel-lb-row__avatar">' +
        (user.photo_url ? '<img src="' + Security.sanitize(user.photo_url) + '" alt="" class="fuel-lb-row__img" loading="lazy">' : '<div class="fuel-lb-row__placeholder">' + (user.display_name || '?').charAt(0).toUpperCase() + '</div>') +
        '</div>' +
        '<div class="fuel-lb-row__info">' +
        '<a href="/pages/user/profile.html?id=' + user.id + '" class="fuel-lb-row__name">' + Security.sanitize(user.display_name || 'Anonymous') + '</a>' +
        UI.fuelLevelBadge(user.writer_level, user.writer_xp) +
        '</div>' +
        '<div class="fuel-lb-row__xp">' + (user.writer_xp || user.gxp || 0) + ' XP</div>' +
        '</div>';
};


// ═══════════════════════════════════════
// ARTICLE FUEL SECTION
// ═══════════════════════════════════════

/**
 * Article tip section (shown below article content)
 */
UI.fuelArticleSection = function (article, authorUserId, authorName) {
    if (!article) return '';
    return '<div class="fuel-article-section">' +
        '<div class="fuel-article-section__header">' +
        '<h3>Fuel This Article</h3>' +
        '<p>Show your appreciation with GMX Coins</p>' +
        '</div>' +
        '<div class="fuel-article-section__tips">' +
        Object.keys(TIP_TYPES).map(function(key) {
            var tip = TIP_TYPES[key];
            return '<button class="fuel-article-tip-btn" data-tip-type="' + key + '" data-receiver-id="' + authorUserId + '" data-receiver-name="' + Security.sanitize(authorName || '').replace(/"/g, '&quot;') + '" data-article-id="' + article.id + '">' +
                '<span class="fuel-article-tip-btn__icon" style="color:' + tip.color + '">' + WriterBadges.getBadgeIcon(tip.icon) + '</span>' +
                '<span class="fuel-article-tip-btn__name">' + tip.name + '</span>' +
                '<span class="fuel-article-tip-btn__coins">' + tip.coins + '</span>' +
                '</button>';
        }).join('') +
        '</div>' +
        '<div class="fuel-article-section__recent" id="fuel-article-tips-list"></div>' +
        '</div>';
};

/**
 * Initialize article tip buttons
 */
UI.initArticleTipButtons = function (container) {
    container = container || document;
    container.querySelectorAll('.fuel-article-tip-btn').forEach(function(btn) {
        if (btn._tipInit) return;
        btn._tipInit = true;
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            UI.fuelTipModal(btn.dataset.receiverId, btn.dataset.receiverName, btn.dataset.articleId);
        });
    });
};

/**
 * Load and display article tips
 */
UI.loadArticleTips = function (articleId) {
    if (!articleId) return;
    Tips.getArticleTips(articleId).then(function(tips) {
        var container = document.getElementById('fuel-article-tips-list');
        if (!container || !tips.length) return;
        container.innerHTML = '<div class="fuel-article-tips-header">Recent Tips</div>' +
            tips.slice(0, 5).map(function(tip) {
                var info = TIP_TYPES[tip.tip_type] || TIP_TYPES.coffee;
                var senderName = tip.is_anonymous ? 'Anonymous' : (tip.sender ? tip.sender.display_name : 'Someone');
                return '<div class="fuel-article-tip-item">' +
                    '<span class="fuel-article-tip-item__icon" style="color:' + info.color + '">' + WriterBadges.getBadgeIcon(info.icon) + '</span>' +
                    '<span class="fuel-article-tip-item__name">' + Security.sanitize(senderName) + '</span>' +
                    '<span class="fuel-article-tip-item__type">' + info.name + '</span>' +
                    '<span class="fuel-article-tip-item__time">' + UI.formatDate(tip.created_at) + '</span>' +
                    '</div>';
            }).join('');
    });
};


// ═══════════════════════════════════════
// HEADER WALLET WIDGET INJECTION
// ═══════════════════════════════════════

/**
 * Inject wallet widget into site header
 */
UI.initFuelHeader = function () {
    if (!Auth.isLoggedIn()) return;
    Wallet.getBalance().then(function(wallet) {
        var nav = document.querySelector('.nav__actions') || document.querySelector('.header__actions') || document.querySelector('nav');
        if (!nav) return;
        var existing = document.getElementById('fuel-wallet-widget');
        if (existing) existing.remove();
        var widget = document.createElement('div');
        widget.innerHTML = UI.fuelWalletWidget(wallet);
        // Insert before first child of nav actions
        if (nav.firstChild) {
            nav.insertBefore(widget.firstChild, nav.firstChild);
        } else {
            nav.appendChild(widget.firstChild);
        }
    });
};

// Auto-init header widget after auth
if (typeof Auth !== 'undefined' && Auth.waitForAuth) {
    Auth.waitForAuth().then(function() {
        setTimeout(UI.initFuelHeader, 500);
    });
}
