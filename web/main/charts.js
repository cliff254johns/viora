/* ═══════════════════════════════════════════════════════════════
   VIORA — CHARTS  (v6.9.1 — debugged + hardened)
   Extracted from main.js (Phase C-1)

   Handles: dashboard charts, marketplace charts, and the shared
            Chart.js lifecycle helpers used by every module.

   Depends on: injected deps — see initCharts()

   Perf highlights:
     • Memoized getTextColor (2s TTL, no per-render style recalc)
     • Data-fingerprint skip — no rebuild when data is unchanged
     • In-place chart.update('none') fast path (≈2ms vs ≈30ms rebuild)
     • Hoisted palettes + static option objects
     • Single-pass aggregation loops (no filter/forEach allocation)
     • Batched DOM lookups

   Changelog v6.9.1:
     • Fingerprints now include text color → theme switches restyle charts
     • clearTextColorCache() also invalidates chart fingerprints
     • statusCounts uses Object.create(null) (prototype-pollution safe)
     • Chart creation guarded against 0-sized canvases (hidden tabs)
     • destroyChart clears fingerprint via delete (cleaner)
   ═══════════════════════════════════════════════════════════════ */

/* ── Injected dependencies ── */
let D = {
  $: null,
  state: null,
  getOrdersList: null,
  getProductsList: null,
  getProductSalesMetrics: null,
  usdToKes: null,
  FX_RATE: null,
};

export function initCharts(d) {
  D = { ...D, ...d };
  if (D.state && !D.state.charts) D.state.charts = Object.create(null);
  // Reset caches — new app context means new theme/data.
  _tcCache = null;
  _tcCacheAt = 0;
  // Clear the fingerprint cache in place (it's a const object).
  for (const k in _fpCache) delete _fpCache[k];
  // Reset the once-only "Chart.js missing" flag so the next render warns again.
  _chartMissingWarned = false;
}

/* ═══════════════════════════════════════════════════════════════
   MODULE-LEVEL CACHES / CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

// getTextColor memo — avoids a style recalc per render.
let _tcCache = null;
let _tcCacheAt = 0;
const TC_TTL = 2000;
const TC_FALLBACK = '#f0f4ff';

// Data fingerprints per chart id — skip rebuild when unchanged.
const _fpCache = Object.create(null);

// One-shot warning latch for missing Chart.js.
let _chartMissingWarned = false;

const GRID_COLOR = 'rgba(148,163,184,0.15)';
const CARD_BORDER = '#0a0a0f';

// Hoisted palettes (never rebuilt).
const PIE_PALETTE = [
  'rgba(0,212,255,0.85)',
  'rgba(124,58,237,0.85)',
  'rgba(255,110,199,0.85)',
  'rgba(34,230,160,0.85)',
  'rgba(255,200,87,0.85)',
  'rgba(168,85,247,0.85)',
];

const MARKET_PALETTE = [
  '#00d4ff', '#7c3aed', '#ff6ec7', '#22e6a0', '#ffc857',
  '#a855f7', '#ff5c7c', '#10a37f', '#f472b6', '#0EA5E9',
];

// Status colors as [fill, border] pairs — avoids string surgery.
const STATUS_COLORS = {
  paid:     ['rgba(34,230,160,0.85)',  'rgba(34,230,160,1)'],
  pending:  ['rgba(255,200,87,0.85)',  'rgba(255,200,87,1)'],
  failed:   ['rgba(255,92,124,0.85)',  'rgba(255,92,124,1)'],
  refunded: ['rgba(148,163,184,0.85)', 'rgba(148,163,184,1)'],
};
const STATUS_FALLBACK = ['rgba(0,212,255,0.75)', '#00d4ff'];

// Static shared options — spliced into per-chart options.
const BASE_OPTIONS = { responsive: true, maintainAspectRatio: false };
const HIDDEN_LEGEND = { legend: { display: false } };

// Doughnut legend config factory (text color varies).
function doughnutLegend(tc) {
  return {
    position: 'bottom',
    labels: { color: tc, font: { size: 10, weight: '600' }, boxWidth: 12, usePointStyle: true },
  };
}

/* ── Internal helpers ── */

function safeGet(id) {
  const f = D.$;
  if (typeof f === 'function') {
    try { return f(id); } catch (_) {}
  }
  if (typeof document !== 'undefined') return document.getElementById(id);
  return null;
}

function ensureChartRegistry() {
  if (!D.state) return null;
  if (!D.state.charts) D.state.charts = Object.create(null);
  return D.state.charts;
}

function chartReady() {
  if (typeof Chart === 'undefined') {
    if (!_chartMissingWarned) {
      _chartMissingWarned = true;
      console.error('[charts] Chart.js is not loaded — charts disabled for this session');
    }
    return false;
  }
  return true;
}

/** Cheap fingerprint — string comparison, no JSON.stringify. */
function fp(...parts) {
  let s = '';
  for (let i = 0; i < parts.length; i++) s += parts[i] + '|';
  return s;
}

/**
 * True if the canvas has non-zero rendered size.
 * Hidden tabs / display:none containers report 0×0, and creating a
 * Chart.js instance on such a canvas throws or produces a blank chart.
 */
function hasSize(c) {
  try {
    const el = c.el;
    if (el.clientWidth > 0 && el.clientHeight > 0) return true;
    const r = el.getBoundingClientRect && el.getBoundingClientRect();
    return !!(r && r.width > 0 && r.height > 0);
  } catch (_) {
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════════
   SHARED CHART LIFECYCLE HELPERS
   ═══════════════════════════════════════════════════════════════ */

export function getTextColor() {
  const now = Date.now();
  if (_tcCache && now - _tcCacheAt < TC_TTL) return _tcCache;
  let v = TC_FALLBACK;
  try {
    v = getComputedStyle(document.documentElement)
      .getPropertyValue('--chart-text')
      .trim() || TC_FALLBACK;
  } catch (_) { /* prerender / detached doc */ }
  _tcCache = v;
  _tcCacheAt = now;
  return v;
}

/**
 * Optional — call from theme switcher to force a fresh read.
 * Also invalidates chart fingerprints so the next render restyles
 * tick/legend colors (which the fingerprints otherwise wouldn't catch).
 */
export function clearTextColorCache() {
  _tcCache = null;
  _tcCacheAt = 0;
  for (const k in _fpCache) delete _fpCache[k];
}

export function destroyChart(id) {
  const charts = D.state && D.state.charts;
  if (!charts || !charts[id]) {
    // Even if no instance, clear any stale fingerprint so next render rebuilds.
    delete _fpCache[id];
    return;
  }
  try { charts[id].destroy(); }
  catch (e) { console.warn('[charts] destroyChart failed', id, e); }
  delete charts[id];
  delete _fpCache[id]; // force next render to rebuild
}

export function destroyAllCharts() {
  const charts = D.state && D.state.charts;
  if (!charts) return;
  for (const id of Object.keys(charts)) {
    try { charts[id].destroy(); } catch (_) {}
    delete charts[id];
  }
  for (const k in _fpCache) delete _fpCache[k];
}

export function safeCanvas(id) {
  const el = safeGet(id);
  if (!el || typeof el.getContext !== 'function') return null;
  let ctx;
  try { ctx = el.getContext('2d'); } catch (_) { return null; }
  if (!ctx) return null;
  return { el, ctx };
}

/** Blank canvas + centered message (DPR-safe, hidden-tab safe). */
function paintEmpty(c, message, tc) {
  const { el, ctx } = c;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

  // Prefer bounding rect; fall back to sane defaults rather than canvas
  // backing-store attributes (which may already be DPR-scaled).
  let w = 300;
  let h = 150;
  try {
    const rect = el.getBoundingClientRect && el.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      w = Math.round(rect.width);
      h = Math.round(rect.height);
    } else if (el.clientWidth > 0 && el.clientHeight > 0) {
      w = el.clientWidth;
      h = el.clientHeight;
    }
  } catch (_) {}

  if (el.width !== w * dpr || el.height !== h * dpr) {
    el.width = w * dpr;
    el.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = tc;
  ctx.font = '14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, w / 2, h / 2);
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD CHARTS
   ═══════════════════════════════════════════════════════════════ */
export function renderCharts() {
  try {
    if (!chartReady()) return;
    const registry = ensureChartRegistry();
    if (!registry) return;
    const tc = getTextColor();

    const data = (D.state && D.state.data) || {};
    const worklogs = Array.isArray(data.worklogs) ? data.worklogs : [];
    const projects = Array.isArray(data.projects) ? data.projects : [];

    /* ── Revenue by month (single pass) ── */
    const monthly = Object.create(null);
    for (let i = 0; i < worklogs.length; i++) {
      const w = worklogs[i];
      if (!w || !w.date) continue;
      const h = Number(w.hours);
      const r = Number(w.rate);
      if (!Number.isFinite(h) || !Number.isFinite(r)) continue;
      const k = w.date.slice(0, 7);
      monthly[k] = (monthly[k] || 0) + h * r;
    }
    const rk = Object.keys(monthly).sort();
    const rl = rk.map(monthLabel);
    const rv = rk.map((k) => monthly[k]);

    const c1 = safeCanvas('revenueChart');
    if (c1) {
      if (!rl.length) {
        destroyChart('revenueChart');
        paintEmpty(c1, 'No worklogs yet', tc);
      } else {
        const sum = rv.reduce((a, b) => a + b, 0);
        const fingerprint = fp('rev', rl.length, rl[0], rl[rl.length - 1], sum, tc);
        const existing = registry['revenueChart'];
        if (existing && _fpCache['revenueChart'] === fingerprint) {
          // Data & theme unchanged — nothing to do.
        } else if (existing && hasSize(c1)) {
          existing.data.labels = rl;
          existing.data.datasets[0].data = rv;
          // Restyle ticks/legend if theme changed.
          try {
            existing.options.scales.y.ticks.color = tc;
            existing.options.scales.x.ticks.color = tc;
          } catch (_) {}
          existing.update('none');
          _fpCache['revenueChart'] = fingerprint;
        } else if (!hasSize(c1)) {
          // Hidden/zero-size — skip; will render when visible.
          destroyChart('revenueChart');
        } else {
          const grad = c1.ctx.createLinearGradient(0, 0, 0, 220);
          grad.addColorStop(0, 'rgba(0,212,255,0.55)');
          grad.addColorStop(1, 'rgba(124,58,237,0.02)');
          registry['revenueChart'] = new Chart(c1.ctx, {
            type: 'line',
            data: {
              labels: rl,
              datasets: [{
                label: 'Revenue',
                data: rv,
                borderColor: '#00d4ff',
                borderWidth: 3,
                backgroundColor: grad,
                fill: true,
                tension: 0.4,
              }],
            },
            options: {
              ...BASE_OPTIONS,
              plugins: HIDDEN_LEGEND,
              scales: {
                y: { beginAtZero: true, ticks: { color: tc, callback: (v) => 'KSh ' + v }, grid: { color: GRID_COLOR } },
                x: { ticks: { color: tc }, grid: { display: false } },
              },
            },
          });
          _fpCache['revenueChart'] = fingerprint;
        }
      }
    }

    /* ── Projects by service area (single pass) ── */
    const svc = Object.create(null);
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      if (!p) continue;
      const a = p.serviceArea || 'Other';
      svc[a] = (svc[a] || 0) + 1;
    }
    const sl = Object.keys(svc);
    const sv = sl.map((k) => svc[k]);

    const c2 = safeCanvas('serviceChart');
    if (c2) {
      if (!sl.length) {
        destroyChart('serviceChart');
        paintEmpty(c2, 'No projects yet', tc);
      } else {
        const fingerprint = fp('svc', sl.join(','), sv.join(','), tc);
        const existing = registry['serviceChart'];
        if (existing && _fpCache['serviceChart'] === fingerprint) {
          // no-op
        } else if (existing && hasSize(c2)) {
          existing.data.labels = sl;
          existing.data.datasets[0].data = sv;
          existing.data.datasets[0].backgroundColor = sl.map((_, i) => PIE_PALETTE[i % PIE_PALETTE.length]);
          existing.options.plugins.legend = doughnutLegend(tc);
          existing.update('none');
          _fpCache['serviceChart'] = fingerprint;
        } else if (!hasSize(c2)) {
          destroyChart('serviceChart');
        } else {
          registry['serviceChart'] = new Chart(c2.ctx, {
            type: 'doughnut',
            data: {
              labels: sl,
              datasets: [{
                data: sv,
                backgroundColor: sl.map((_, i) => PIE_PALETTE[i % PIE_PALETTE.length]),
                borderColor: CARD_BORDER,
                borderWidth: 2,
              }],
            },
            options: {
              ...BASE_OPTIONS,
              cutout: '58%',
              plugins: { legend: doughnutLegend(tc) },
            },
          });
          _fpCache['serviceChart'] = fingerprint;
        }
      }
    }
  } catch (e) {
    console.warn('[charts] renderCharts failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   MARKETPLACE CHARTS
   ═══════════════════════════════════════════════════════════════ */
export function renderMarketplaceCharts() {
  try {
    if (!chartReady()) return;
    const registry = ensureChartRegistry();
    if (!registry) return;
    const tc = getTextColor();

    const orders = (typeof D.getOrdersList === 'function' && D.getOrdersList()) || [];
    const products = (typeof D.getProductsList === 'function' && D.getProductsList()) || [];

    /* ── Revenue by month (single pass, skips non-paid early) ── */
    const monthly = Object.create(null);
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (!o || o.paymentStatus !== 'paid' || !o.timestamp) continue;
      const v = Number(o.totalKES);
      if (!Number.isFinite(v)) continue;
      const k = o.timestamp.slice(0, 7);
      monthly[k] = (monthly[k] || 0) + v;
    }
    const keys = Object.keys(monthly).sort();
    const salesLabels = keys.length ? keys.map(monthLabel) : ['No data'];
    const salesValues = keys.length ? keys.map((k) => monthly[k]) : [0];

    const c1 = safeCanvas('salesRevenueChart');
    if (c1) {
      const sum = salesValues.reduce((a, b) => a + b, 0);
      const fingerprint = fp('sales', salesLabels.length, salesLabels[0], sum, tc);
      const existing = registry['salesRevenueChart'];
      if (existing && _fpCache['salesRevenueChart'] === fingerprint) {
        // no-op
      } else if (existing && hasSize(c1)) {
        existing.data.labels = salesLabels;
        existing.data.datasets[0].data = salesValues;
        try {
          existing.options.scales.y.ticks.color = tc;
          existing.options.scales.x.ticks.color = tc;
        } catch (_) {}
        existing.update('none');
        _fpCache['salesRevenueChart'] = fingerprint;
      } else if (!hasSize(c1)) {
        destroyChart('salesRevenueChart');
      } else {
        const grad = c1.ctx.createLinearGradient(0, 0, 0, 220);
        grad.addColorStop(0, 'rgba(34,230,160,0.55)');
        grad.addColorStop(1, 'rgba(0,212,255,0.02)');
        registry['salesRevenueChart'] = new Chart(c1.ctx, {
          type: 'line',
          data: {
            labels: salesLabels,
            datasets: [{
              label: 'Marketplace Revenue',
              data: salesValues,
              borderColor: '#22e6a0',
              borderWidth: 3,
              backgroundColor: grad,
              fill: true,
              tension: 0.4,
            }],
          },
          options: {
            ...BASE_OPTIONS,
            plugins: HIDDEN_LEGEND,
            scales: {
              y: { beginAtZero: true, ticks: { color: tc, callback: (v) => 'KSh ' + Number(v).toLocaleString() }, grid: { color: GRID_COLOR } },
              x: { ticks: { color: tc }, grid: { display: false } },
            },
          },
        });
        _fpCache['salesRevenueChart'] = fingerprint;
      }
    }

    /* ── Products by category (single pass) ── */
    const catCounts = Object.create(null);
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (!p) continue;
      const c = p.category || 'Other';
      catCounts[c] = (catCounts[c] || 0) + 1;
    }
    const catLabels = Object.keys(catCounts);
    const catValues = catLabels.map((k) => catCounts[k]);

    const c2 = safeCanvas('productsCategoryChart');
    if (c2) {
      if (!catLabels.length) {
        destroyChart('productsCategoryChart');
        paintEmpty(c2, 'No products yet', tc);
      } else {
        const fingerprint = fp('cats', catLabels.join(','), catValues.join(','), tc);
        const existing = registry['productsCategoryChart'];
        if (existing && _fpCache['productsCategoryChart'] === fingerprint) {
          // no-op
        } else if (existing && hasSize(c2)) {
          existing.data.labels = catLabels;
          existing.data.datasets[0].data = catValues;
          existing.data.datasets[0].backgroundColor = catLabels.map((_, i) => MARKET_PALETTE[i % MARKET_PALETTE.length]);
          existing.options.plugins.legend = doughnutLegend(tc);
          existing.update('none');
          _fpCache['productsCategoryChart'] = fingerprint;
        } else if (!hasSize(c2)) {
          destroyChart('productsCategoryChart');
        } else {
          registry['productsCategoryChart'] = new Chart(c2.ctx, {
            type: 'doughnut',
            data: {
              labels: catLabels,
              datasets: [{
                data: catValues,
                backgroundColor: catLabels.map((_, i) => MARKET_PALETTE[i % MARKET_PALETTE.length]),
                borderColor: CARD_BORDER,
                borderWidth: 2,
              }],
            },
            options: {
              ...BASE_OPTIONS,
              cutout: '58%',
              plugins: { legend: doughnutLegend(tc) },
            },
          });
          _fpCache['productsCategoryChart'] = fingerprint;
        }
      }
    }

    /* ── Orders by payment status (single pass) ──
       statusCounts uses Object.create(null) to avoid prototype
       pollution if paymentStatus contains "__proto__"/"constructor". */
    const statusCounts = Object.create(null);
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (!o) continue;
      const s = o.paymentStatus || 'pending';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }
    const statusLabels = Object.keys(statusCounts).filter(k => statusCounts[k] > 0);
    const statusValues = statusLabels.map((k) => statusCounts[k]);
    const statusFills = statusLabels.map((s) => (STATUS_COLORS[s] || STATUS_FALLBACK)[0]);
    const statusBorders = statusLabels.map((s) => (STATUS_COLORS[s] || STATUS_FALLBACK)[1]);
    const statusText = statusLabels.map((s) => s.charAt(0).toUpperCase() + s.slice(1));

    const c3 = safeCanvas('ordersStatusChart');
    if (c3) {
      if (!statusLabels.length) {
        destroyChart('ordersStatusChart');
        paintEmpty(c3, 'No orders yet', tc);
      } else {
        const fingerprint = fp('status', statusLabels.join(','), statusValues.join(','), tc);
        const existing = registry['ordersStatusChart'];
        if (existing && _fpCache['ordersStatusChart'] === fingerprint) {
          // no-op
        } else if (existing && hasSize(c3)) {
          existing.data.labels = statusText;
          existing.data.datasets[0].data = statusValues;
          existing.data.datasets[0].backgroundColor = statusFills;
          existing.data.datasets[0].borderColor = statusBorders;
          try {
            existing.options.scales.y.ticks.color = tc;
            existing.options.scales.x.ticks.color = tc;
          } catch (_) {}
          existing.update('none');
          _fpCache['ordersStatusChart'] = fingerprint;
        } else if (!hasSize(c3)) {
          destroyChart('ordersStatusChart');
        } else {
          registry['ordersStatusChart'] = new Chart(c3.ctx, {
            type: 'bar',
            data: {
              labels: statusText,
              datasets: [{
                label: 'Orders',
                data: statusValues,
                backgroundColor: statusFills,
                borderColor: statusBorders,
                borderWidth: 1,
                borderRadius: 8,
              }],
            },
            options: {
              ...BASE_OPTIONS,
              plugins: HIDDEN_LEGEND,
              scales: {
                y: { beginAtZero: true, ticks: { color: tc, stepSize: 1 }, grid: { color: GRID_COLOR } },
                x: { ticks: { color: tc }, grid: { display: false } },
              },
            },
          });
          _fpCache['ordersStatusChart'] = fingerprint;
        }
      }
    }

    /* ── Source labels (batched DOM lookups, all guarded) ── */
    const src1 = safeGet('salesChartSource');
    if (src1) src1.textContent = `Source: Marketplace Orders · ${orders.length} order(s)`;
    const src2 = safeGet('productsChartSource');
    if (src2) src2.textContent = `Source: Marketplace Catalog · ${products.length} product(s) · ${catLabels.length} category(ies)`;
    const src3 = safeGet('ordersChartSource');
    if (src3) src3.textContent = `Source: Marketplace Orders · ${orders.length} total`;
  } catch (e) {
    console.warn('[charts] renderMarketplaceCharts failed', e);
  }
}

/* ── Month label helper — avoids UTC off-by-one in west timezones ── */
function monthLabel(key) {
  const y = +key.slice(0, 4);
  const m = +key.slice(5, 7);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  });
}

/* ═══════════════════════════════════════════════════════════════
   NAMESPACED EXPORT (for `import * as C`)
   ═══════════════════════════════════════════════════════════════ */
export const C = {
  getTextColor,
  clearTextColorCache,
  destroyChart,
  destroyAllCharts,
  safeCanvas,
  renderCharts,
  renderMarketplaceCharts,
  initCharts,
};

export default C;
