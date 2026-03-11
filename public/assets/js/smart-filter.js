/* ============================================= */
/* GROUPSMIX - SMART FILTER ENGINE v2             */
/* Inline Quick Bar + Advanced Sidebar            */
/* ============================================= */

var SmartFilter = (function() {
  'use strict';

  var GXP_LEVELS = [
    { key: 'newcomer',    emoji: '\ud83c\udf31', name: 'Newcomer',    min: 0,    max: 99 },
    { key: 'contributor', emoji: '\u2b50',       name: 'Contributor', min: 100,  max: 499 },
    { key: 'regular',     emoji: '\ud83d\udd25', name: 'Regular',     min: 500,  max: 1499 },
    { key: 'trusted',     emoji: '\ud83d\udee1\ufe0f', name: 'Trusted',     min: 1500, max: 4999 },
    { key: 'elite',       emoji: '\ud83d\udc8e', name: 'Elite',       min: 5000, max: 14999 },
    { key: 'veteran',     emoji: '\ud83c\udf1f', name: 'Veteran',     min: 15000,max: 49999 },
    { key: 'legend',      emoji: '\ud83d\udc51', name: 'Legend',      min: 50000,max: 999999 }
  ];

  var STATUS_CHIPS = [
    { key: 'vip',      icon: '\ud83d\udc51', label: 'VIP' },
    { key: 'verified', icon: '\u2705',       label: 'Verified' },
    { key: 'toprated', icon: '\u2b50',       label: 'Top Rated' },
    { key: 'promoted', icon: '\ud83d\ude80', label: 'Promoted' }
  ];

  var SORT_OPTIONS = [
    { key: 'relevance',  label: 'Relevance' },
    { key: 'newest',     label: 'Newest First' },
    { key: 'popular',    label: 'Most Popular' },
    { key: 'trending',   label: 'Trending' },
    { key: 'price-low',  label: 'Price: Low \u2192 High' },
    { key: 'price-high', label: 'Price: High \u2192 Low' },
    { key: 'gxp-high',   label: 'Highest GXP' }
  ];

  var state = {
    open: false,
    filters: {
      status: [],
      priceMin: 0,
      priceMax: 100,
      gxpLevels: [],
      sort: 'relevance'
    },
    onApply: null,
    containerId: null
  };

  /* ── Helpers ────────────────────────────── */

  function getActiveCount() {
    var c = 0;
    if (state.filters.status.length > 0) c += state.filters.status.length;
    if (state.filters.gxpLevels.length > 0) c += state.filters.gxpLevels.length;
    if (state.filters.priceMin > 0 || state.filters.priceMax < 100) c++;
    if (state.filters.sort !== 'relevance') c++;
    return c;
  }

  function getAdvancedCount() {
    var c = 0;
    if (state.filters.gxpLevels.length > 0) c += state.filters.gxpLevels.length;
    if (state.filters.priceMin > 0 || state.filters.priceMax < 100) c++;
    return c;
  }

  /* ── Render: Inline Quick-Filter Bar ──── */

  function renderBarHTML() {
    var html = '';

    /* Inline chip toggles for status */
    html += '<div class="sf-bar">';
    html += '<div class="sf-bar__chips">';
    for (var i = 0; i < STATUS_CHIPS.length; i++) {
      var sc = STATUS_CHIPS[i];
      var isActive = state.filters.status.indexOf(sc.key) !== -1;
      html += '<div class="sf-chip' + (isActive ? ' sf-chip--active' : '') + '" data-filter="status" data-value="' + sc.key + '">';
      html += sc.icon + ' ' + Security.sanitize(sc.label);
      html += '</div>';
    }
    html += '</div>'; /* end chips */

    /* Sort dropdown */
    html += '<div class="sf-bar__divider"></div>';
    html += '<div class="sf-bar__sort">';
    html += '<span class="sf-bar__sort-label">Sort</span>';
    html += '<select class="sf-bar__sort-select" id="sf-sort-select">';
    for (var k = 0; k < SORT_OPTIONS.length; k++) {
      var so = SORT_OPTIONS[k];
      html += '<option value="' + so.key + '"' + (state.filters.sort === so.key ? ' selected' : '') + '>' + Security.sanitize(so.label) + '</option>';
    }
    html += '</select>';
    html += '</div>'; /* end sort */

    /* Advanced button */
    html += '<div class="sf-bar__divider"></div>';
    html += '<button class="sf-bar__advanced" id="sf-open-advanced" aria-label="Advanced filters">';
    html += '\u2699\ufe0f Advanced';
    html += '<span class="sf-bar__advanced-badge" id="sf-adv-badge">0</span>';
    html += '</button>';

    html += '</div>'; /* end bar */

    return html;
  }

  /* ── Render: Advanced Sidebar ───────────── */

  function renderSidebarHTML() {
    var html = '';

    /* Overlay */
    html += '<div class="sf-overlay" id="sf-overlay"></div>';

    /* Sidebar */
    html += '<div class="sf-sidebar" id="sf-sidebar">';

    /* Header */
    html += '<div class="sf-sidebar__header">';
    html += '<div class="sf-sidebar__title">\u2728 Advanced Filters</div>';
    html += '<button class="sf-sidebar__close" id="sf-close" aria-label="Close filters">\u2715</button>';
    html += '</div>';

    /* Body */
    html += '<div class="sf-sidebar__body">';

    /* Status Section (also in sidebar for convenience) */
    html += '<div class="sf-section">';
    html += '<div class="sf-section__label">\ud83c\udff7\ufe0f Status</div>';
    html += '<div class="sf-chips" id="sf-status-chips">';
    for (var i = 0; i < STATUS_CHIPS.length; i++) {
      var sc = STATUS_CHIPS[i];
      var isActive = state.filters.status.indexOf(sc.key) !== -1;
      html += '<div class="sf-chip' + (isActive ? ' sf-chip--active' : '') + '" data-filter="status-adv" data-value="' + sc.key + '">';
      html += sc.icon + ' ' + Security.sanitize(sc.label);
      html += '</div>';
    }
    html += '</div></div>';

    /* Price Range Section */
    html += '<div class="sf-section">';
    html += '<div class="sf-section__label">\ud83d\udcb0 Price Range</div>';
    html += '<div class="sf-range">';
    html += '<div class="sf-range__track"><div class="sf-range__fill" id="sf-price-fill" style="width:' + state.filters.priceMax + '%"></div></div>';
    html += '<input type="range" id="sf-price-range" min="0" max="100" value="' + state.filters.priceMax + '">';
    html += '</div>';
    html += '<div class="sf-range__labels"><span>Free</span><span>$100+</span></div>';
    html += '<div class="sf-range__value" id="sf-price-value">' + (state.filters.priceMax >= 100 ? 'Any Price' : 'Up to $' + state.filters.priceMax) + '</div>';
    html += '</div>';

    /* GXP Level Section */
    html += '<div class="sf-section">';
    html += '<div class="sf-section__label">\ud83c\udf1f GXP Level</div>';
    html += '<div class="sf-levels" id="sf-gxp-levels">';
    for (var j = 0; j < GXP_LEVELS.length; j++) {
      var lvl = GXP_LEVELS[j];
      var lvlActive = state.filters.gxpLevels.indexOf(lvl.key) !== -1;
      html += '<div class="sf-level' + (lvlActive ? ' sf-level--active' : '') + '" data-filter="gxp" data-value="' + lvl.key + '">';
      html += '<span class="sf-level__emoji">' + lvl.emoji + '</span>';
      html += '<span class="sf-level__name">' + Security.sanitize(lvl.name) + '</span>';
      html += '<span class="sf-level__range">' + lvl.min.toLocaleString() + '-' + lvl.max.toLocaleString() + '</span>';
      html += '</div>';
    }
    html += '</div></div>';

    /* Sort Section */
    html += '<div class="sf-section">';
    html += '<div class="sf-section__label">\ud83d\udd00 Sort By</div>';
    html += '<div class="sf-sort" id="sf-sort-options">';
    for (var m = 0; m < SORT_OPTIONS.length; m++) {
      var opt = SORT_OPTIONS[m];
      var soActive = state.filters.sort === opt.key;
      html += '<div class="sf-sort__option' + (soActive ? ' sf-sort__option--active' : '') + '" data-sort="' + opt.key + '">';
      html += '<div class="sf-sort__radio"></div>';
      html += '<span>' + Security.sanitize(opt.label) + '</span>';
      html += '</div>';
    }
    html += '</div></div>';

    html += '</div>'; /* end body */

    /* Footer */
    html += '<div class="sf-sidebar__footer">';
    html += '<button class="btn btn-secondary" id="sf-reset">Reset All</button>';
    html += '<button class="btn btn-primary" id="sf-apply">Apply Filters</button>';
    html += '</div>';

    html += '</div>'; /* end sidebar */

    return html;
  }

  /* ── Render: Active Filter Pills ────────── */

  function renderActivePills(container) {
    if (!container) return;
    var html = '';
    var filters = state.filters;

    for (var i = 0; i < filters.status.length; i++) {
      var s = filters.status[i];
      html += '<span class="sf-pill">' + Security.sanitize(s.charAt(0).toUpperCase() + s.slice(1));
      html += ' <button class="sf-pill__remove" data-remove="status" data-value="' + s + '">\u2715</button></span>';
    }
    for (var j = 0; j < filters.gxpLevels.length; j++) {
      var g = filters.gxpLevels[j];
      var lvl = GXP_LEVELS.filter(function(l) { return l.key === g; })[0];
      if (lvl) {
        html += '<span class="sf-pill">' + lvl.emoji + ' ' + Security.sanitize(lvl.name);
        html += ' <button class="sf-pill__remove" data-remove="gxp" data-value="' + g + '">\u2715</button></span>';
      }
    }
    if (filters.priceMax < 100) {
      html += '<span class="sf-pill">Up to $' + filters.priceMax;
      html += ' <button class="sf-pill__remove" data-remove="price">\u2715</button></span>';
    }
    if (filters.sort !== 'relevance') {
      var sortLabel = SORT_OPTIONS.filter(function(o) { return o.key === filters.sort; })[0];
      html += '<span class="sf-pill">Sort: ' + Security.sanitize(sortLabel ? sortLabel.label : filters.sort);
      html += ' <button class="sf-pill__remove" data-remove="sort">\u2715</button></span>';
    }

    container.innerHTML = html;

    /* Bind pill remove buttons */
    var removeBtns = container.querySelectorAll('.sf-pill__remove');
    for (var r = 0; r < removeBtns.length; r++) {
      removeBtns[r].addEventListener('click', function() {
        var type = this.getAttribute('data-remove');
        var val = this.getAttribute('data-value');
        if (type === 'status') {
          state.filters.status = state.filters.status.filter(function(s) { return s !== val; });
        } else if (type === 'gxp') {
          state.filters.gxpLevels = state.filters.gxpLevels.filter(function(g) { return g !== val; });
        } else if (type === 'price') {
          state.filters.priceMax = 100;
        } else if (type === 'sort') {
          state.filters.sort = 'relevance';
        }
        refreshUI();
        applyFilters();
      });
    }
  }

  /* ── UI Update Helpers ─────────────────── */

  function updateAdvancedBadge() {
    var badge = document.getElementById('sf-adv-badge');
    if (!badge) return;
    var count = getAdvancedCount();
    badge.textContent = count;
    if (count > 0) {
      badge.classList.add('sf-bar__advanced-badge--visible');
    } else {
      badge.classList.remove('sf-bar__advanced-badge--visible');
    }
  }

  function syncBarChips() {
    /* Sync inline bar chip states with current filter state */
    var chips = document.querySelectorAll('.sf-bar [data-filter="status"]');
    for (var i = 0; i < chips.length; i++) {
      var val = chips[i].getAttribute('data-value');
      if (state.filters.status.indexOf(val) !== -1) {
        chips[i].classList.add('sf-chip--active');
      } else {
        chips[i].classList.remove('sf-chip--active');
      }
    }
    /* Sync sort dropdown */
    var sortSelect = document.getElementById('sf-sort-select');
    if (sortSelect) sortSelect.value = state.filters.sort;
  }

  function refreshUI() {
    syncBarChips();
    updateAdvancedBadge();
    var pillsContainer = document.getElementById('sf-active-pills');
    if (pillsContainer) renderActivePills(pillsContainer);
  }

  function applyFilters() {
    if (state.onApply) state.onApply(state.filters);
  }

  /* ── Open / Close Sidebar ──────────────── */

  function open() {
    state.open = true;
    var sidebar = document.getElementById('sf-sidebar');
    var overlay = document.getElementById('sf-overlay');
    if (sidebar) sidebar.classList.add('sf-sidebar--open');
    if (overlay) overlay.classList.add('sf-overlay--open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    state.open = false;
    var sidebar = document.getElementById('sf-sidebar');
    var overlay = document.getElementById('sf-overlay');
    if (sidebar) sidebar.classList.remove('sf-sidebar--open');
    if (overlay) overlay.classList.remove('sf-overlay--open');
    document.body.style.overflow = '';
  }

  /* ── Bind Events ───────────────────────── */

  function bindEvents() {
    /* === Inline bar: status chips (instant apply) === */
    var barChips = document.querySelectorAll('.sf-bar [data-filter="status"]');
    for (var i = 0; i < barChips.length; i++) {
      barChips[i].addEventListener('click', function() {
        var val = this.getAttribute('data-value');
        var idx = state.filters.status.indexOf(val);
        if (idx === -1) {
          state.filters.status.push(val);
        } else {
          state.filters.status.splice(idx, 1);
        }
        refreshUI();
        applyFilters();
      });
    }

    /* === Inline bar: sort dropdown (instant apply) === */
    var sortSelect = document.getElementById('sf-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', function() {
        state.filters.sort = this.value;
        refreshUI();
        applyFilters();
      });
    }

    /* === Advanced button === */
    var advBtn = document.getElementById('sf-open-advanced');
    if (advBtn) advBtn.addEventListener('click', function() { open(); });

    /* === Sidebar close === */
    var closeBtn = document.getElementById('sf-close');
    var overlay = document.getElementById('sf-overlay');
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (overlay) overlay.addEventListener('click', close);

    /* === Sidebar: status chips === */
    var advStatusChips = document.querySelectorAll('[data-filter="status-adv"]');
    for (var a = 0; a < advStatusChips.length; a++) {
      advStatusChips[a].addEventListener('click', function() {
        var val = this.getAttribute('data-value');
        var idx = state.filters.status.indexOf(val);
        if (idx === -1) {
          state.filters.status.push(val);
          this.classList.add('sf-chip--active');
        } else {
          state.filters.status.splice(idx, 1);
          this.classList.remove('sf-chip--active');
        }
        syncBarChips();
        updateAdvancedBadge();
      });
    }

    /* === Sidebar: GXP levels === */
    var gxpLevels = document.querySelectorAll('[data-filter="gxp"]');
    for (var j = 0; j < gxpLevels.length; j++) {
      gxpLevels[j].addEventListener('click', function() {
        var val = this.getAttribute('data-value');
        var idx = state.filters.gxpLevels.indexOf(val);
        if (idx === -1) {
          state.filters.gxpLevels.push(val);
          this.classList.add('sf-level--active');
        } else {
          state.filters.gxpLevels.splice(idx, 1);
          this.classList.remove('sf-level--active');
        }
        updateAdvancedBadge();
      });
    }

    /* === Sidebar: Price range === */
    var priceRange = document.getElementById('sf-price-range');
    if (priceRange) {
      priceRange.addEventListener('input', function() {
        var val = parseInt(this.value, 10);
        state.filters.priceMax = val;
        var fill = document.getElementById('sf-price-fill');
        var valueEl = document.getElementById('sf-price-value');
        if (fill) fill.style.width = val + '%';
        if (valueEl) valueEl.textContent = val >= 100 ? 'Any Price' : 'Up to $' + val;
        updateAdvancedBadge();
      });
    }

    /* === Sidebar: Sort options === */
    var sortOptions = document.querySelectorAll('[data-sort]');
    for (var k = 0; k < sortOptions.length; k++) {
      sortOptions[k].addEventListener('click', function() {
        var val = this.getAttribute('data-sort');
        state.filters.sort = val;
        for (var s = 0; s < sortOptions.length; s++) {
          sortOptions[s].classList.remove('sf-sort__option--active');
        }
        this.classList.add('sf-sort__option--active');
        /* Also sync the inline sort dropdown */
        var sortSel = document.getElementById('sf-sort-select');
        if (sortSel) sortSel.value = val;
      });
    }

    /* === Sidebar: Reset === */
    var resetBtn = document.getElementById('sf-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        state.filters = { status: [], priceMin: 0, priceMax: 100, gxpLevels: [], sort: 'relevance' };
        close();
        /* Re-render to reset all UI */
        if (state.containerId) {
          SmartFilter.init(state.containerId, state.onApply);
        }
        applyFilters();
      });
    }

    /* === Sidebar: Apply === */
    var applyBtn = document.getElementById('sf-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', function() {
        close();
        refreshUI();
        applyFilters();
      });
    }

    /* === Keyboard: Escape to close === */
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && state.open) close();
    });
  }

  /* ── Init ───────────────────────────────── */

  function init(containerId, onApplyCallback) {
    state.containerId = containerId;
    state.onApply = onApplyCallback || null;

    var container = document.getElementById(containerId);
    if (!container) return;

    /* Render: inline bar + sidebar + pills area */
    container.innerHTML = renderBarHTML() + renderSidebarHTML() + '<div class="sf-active-filters" id="sf-active-pills"></div>';
    bindEvents();
    refreshUI();

    /* Render existing pills if filters are active */
    var pillsContainer = document.getElementById('sf-active-pills');
    if (pillsContainer && getActiveCount() > 0) {
      renderActivePills(pillsContainer);
    }
  }

  /* ── Public API ─────────────────────────── */

  function getFilters() {
    return JSON.parse(JSON.stringify(state.filters));
  }

  function matchesFilters(item) {
    var f = state.filters;

    /* Status filters */
    if (f.status.length > 0) {
      var matchStatus = false;
      for (var i = 0; i < f.status.length; i++) {
        if (f.status[i] === 'vip' && item.vip_tier && item.vip_tier !== 'none') matchStatus = true;
        if (f.status[i] === 'verified' && item.is_verified) matchStatus = true;
        if (f.status[i] === 'toprated' && item.ranking_score >= 80) matchStatus = true;
        if (f.status[i] === 'promoted' && item.is_promoted) matchStatus = true;
      }
      if (!matchStatus) return false;
    }

    /* Price filter */
    if (f.priceMax < 100 && typeof item.price === 'number') {
      if (item.price > f.priceMax) return false;
    }

    /* GXP level filter */
    if (f.gxpLevels.length > 0 && typeof item.gxp !== 'undefined') {
      var matchGxp = false;
      for (var j = 0; j < f.gxpLevels.length; j++) {
        var lvl = GXP_LEVELS.filter(function(l) { return l.key === f.gxpLevels[j]; })[0];
        if (lvl && item.gxp >= lvl.min && item.gxp <= lvl.max) {
          matchGxp = true;
          break;
        }
      }
      if (!matchGxp) return false;
    }

    return true;
  }

  function sortItems(items) {
    var s = state.filters.sort;
    var sorted = items.slice();

    if (s === 'newest') {
      sorted.sort(function(a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); });
    } else if (s === 'popular') {
      sorted.sort(function(a, b) { return (b.click_count || 0) - (a.click_count || 0); });
    } else if (s === 'price-low') {
      sorted.sort(function(a, b) { return (a.price || 0) - (b.price || 0); });
    } else if (s === 'price-high') {
      sorted.sort(function(a, b) { return (b.price || 0) - (a.price || 0); });
    } else if (s === 'trending') {
      sorted.sort(function(a, b) { return (b.click_count || 0) - (a.click_count || 0); });
    } else if (s === 'gxp-high') {
      sorted.sort(function(a, b) { return (b.gxp || 0) - (a.gxp || 0); });
    }

    return sorted;
  }

  return {
    init: init,
    getFilters: getFilters,
    matchesFilters: matchesFilters,
    sortItems: sortItems,
    open: open,
    close: close
  };
})();
