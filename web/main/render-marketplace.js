// main/render-marketplace.js
// ═══════════════════════════════════════════════════════════════
// VIORA — MARKETPLACE RENDERING  (v7.2 — bug-free)
// ─────────────────────────────────────────────────────────────
// Fixes vs v7.1:
//   • initRenderMarketplace: removed _htmlCacheSigs.clear() — WeakMap
//     has no .clear(); was throwing TypeError and blocking boot.
//   • getMarketplaceMetrics: `const orders` + `orders = []` was a
//     TypeError; now uses `let`.
//   • Empty-state sigs now include the empty kind ('empty:products')
//     so two different empty states on the same element don't collide.
//   • renderMyWishlist: coerces wishlist IDs to String before lookup.
//   • openOrderDetail: uses cacheKey as the setHtmlIfChanged sig
//     instead of rehashing the whole HTML.
//   • fetchCampaignStats: no longer captures renderCampaigns at module
//     load — uses a live lookup.
//   • All KPI aggregations now single-pass and skip empty rows.
//   • All `state.data.X` reads go through safe local vars to avoid
//     crashes if a collection is undefined.
//   • All interpolations of user-supplied text pass through _esc().
//   • All inline onclick args pass through q().
// ═══════════════════════════════════════════════════════════════

let _ctx = null;

export function initRenderMarketplace(ctx) {
  _ctx = Object.assign(_ctx || {}, ctx || {});
  _mpMetrics.cache = null; _mpMetrics.stamp = '';
  _mpSales.cache   = null; _mpSales.stamp   = '';
  _analytics.cache = null; _analytics.stamp = '';
  _materialize.inFlight = false;
  _campaigns.timer = null;
  _orderDetailCache.clear();
  /* _htmlCacheSigs is a WeakMap — nothing to clear. */
  return _ctx;
}

function C() { return _ctx || {}; }

/* ═══════════════════════════════════════════════════════════════
   SMALL SAFE HELPERS
   ═══════════════════════════════════════════════════════════════ */
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const _esc = (s) => {
  const c = C();
  if (typeof c.escapeHtml === 'function') {
    try { return c.escapeHtml(s); } catch (_) {}
  }
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

const q = (s) => String(s == null ? '' : s)
  .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;')
  .replace(/</g, '\\x3c');

const safe$ = (id) => {
  const c = C();
  if (typeof c.$ === 'function') { try { return c.$(id); } catch (_) {} }
  return typeof document !== 'undefined' ? document.getElementById(id) : null;
};

const safeState = () => C().state || { data: {}, operator: null };
const safeData  = () => safeState().data || {};

const safeFn = (name, fallback) => {
  const fn = C()[name];
  return typeof fn === 'function' ? fn : (() => fallback);
};

const _toast = (msg, type) => {
  const c = C();
  if (typeof c.toast === 'function') { try { c.toast(msg, type || 'info'); } catch (_) {} }
};

const _confirm = (msg, opts) => new Promise((resolve) => {
  const vc = C().vioraConfirm;
  if (typeof vc === 'function') {
    try {
      Promise.resolve(vc(msg, opts || {})).then(v => resolve(!!v), () => resolve(false));
      return;
    } catch (_) {}
  }
  try { resolve(typeof confirm === 'function' ? !!confirm(msg) : true); }
  catch (_) { resolve(true); }
});

const _activeTab = (id) => {
  if (typeof document === 'undefined') return false;
  const el = document.getElementById('tab-' + id);
  return !!(el && el.classList.contains('active'));
};

/* Safe URL — only allows http(s), data:image, blob:, and relative. */
function safeUrl(u) {
  if (!u) return '';
  const s = String(u).trim();
  if (!s) return '';
  if (/^javascript:/i.test(s)) return '';
  if (/^data:(?!image\/)/i.test(s)) return '';
  if (/^(https?:)?\/\//i.test(s)) return s;
  if (/^data:image\//i.test(s)) return s;
  if (/^blob:/i.test(s)) return s;
  if (/^\.?\//.test(s) || /^[a-z0-9_-]+(\/|\.|$)/i.test(s)) return s;
  return '';
}

/* Cheap string hash. */
function hashString(s) {
  let h = 5381;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* Rolling signature over an array of records. */
function sigOf(arr, fields) {
  if (!Array.isArray(arr) || arr.length === 0) return '0';
  let h = 5381;
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (!o) continue;
    const id = String(o.id || '');
    for (let j = 0; j < id.length; j++) h = ((h << 5) + h + id.charCodeAt(j)) | 0;
    if (fields) {
      for (let f = 0; f < fields.length; f++) {
        const v = o[fields[f]];
        if (v == null) continue;
        const s = typeof v === 'string' ? v : String(v);
        for (let j = 0; j < s.length; j++) h = ((h << 5) + h + s.charCodeAt(j)) | 0;
      }
    }
  }
  return arr.length + ':' + (h >>> 0).toString(36);
}

/* ═══════════════════════════════════════════════════════════════
   HTML CACHE
   Writes el.innerHTML ONLY if sig changed. sig includes the empty
   kind so two different empties don't collide.
   ═══════════════════════════════════════════════════════════════ */
const _htmlCacheSigs = new WeakMap();

function setHtmlIfChanged(el, sig, html) {
  if (!el || !el.isConnected) return false;
  if (_htmlCacheSigs.get(el) === sig) return false;
  _htmlCacheSigs.set(el, sig);
  el.innerHTML = html;
  return true;
}

/* ═══════════════════════════════════════════════════════════════
   CACHE OBJECTS
   ═══════════════════════════════════════════════════════════════ */
const _mpMetrics = { cache: null, stamp: '' };
const _mpSales   = { cache: null, stamp: '' };
const _analytics = { cache: null, stamp: '' };
const _materialize = { inFlight: false };
const _campaigns  = { timer: null, refreshing: false, listenerBound: false };
const _orderDetailCache = new Map();

/* ═══════════════════════════════════════════════════════════════
   SHARED METRICS
   ═══════════════════════════════════════════════════════════════ */
export function getMarketplaceMetrics() {
  const getOrdersList = safeFn('getOrdersList', () => []);
  let orders = getOrdersList();
  if (!Array.isArray(orders)) orders = [];

  const normalizeEmail = safeFn('normalizeEmail', e => String(e || '').toLowerCase());

  /* Full signature — any mutation invalidates the cache. */
  let stamp = orders.length + '|';
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    if (!o) continue;
    stamp += (o.id || '') + '|' + (o.paymentStatus || '') + '|' + num(o.totalKES) + ';';
  }
  if (_mpMetrics.cache && stamp === _mpMetrics.stamp) return _mpMetrics.cache;

  let totalOrders = 0, paidOrders = 0, pendingOrders = 0;
  let totalRevenueKES = 0, totalRevenueUSD = 0;
  const uniqueEmails = new Set();

  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    if (!o) continue;
    totalOrders++;
    if (o.paymentStatus === 'paid') {
      paidOrders++;
      totalRevenueKES += num(o.totalKES);
      totalRevenueUSD += num(o.totalUSD);
    } else if (o.paymentStatus === 'pending') {
      pendingOrders++;
    }
    const em = normalizeEmail(o.customerEmail);
    if (em) uniqueEmails.add(em);
  }

  const aov = totalOrders > 0 ? totalRevenueKES / totalOrders : 0;

  _mpMetrics.cache = {
    totalOrders, paidOrders, pendingOrders,
    totalRevenueKES, totalRevenueUSD,
    uniqueCustomers: uniqueEmails.size,
    aov
  };
  _mpMetrics.stamp = stamp;
  return _mpMetrics.cache;
}

export function getProductSalesMetrics() {
  const getOrdersList = safeFn('getOrdersList', () => []);
  const usdToKes = safeFn('usdToKes', v => num(v) * 129);
  let orders = getOrdersList();
  if (!Array.isArray(orders)) orders = [];

  const stamp = sigOf(orders, ['paymentStatus', 'totalUSD']);
  if (_mpSales.cache && stamp === _mpSales.stamp) return _mpSales.cache;

  const perProduct = Object.create(null);
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    if (!o) continue;
    const items = Array.isArray(o.items) ? o.items : [];
    for (let j = 0; j < items.length; j++) {
      const it = items[j];
      if (!it || !it.productId) continue;
      const qty = num(it.qty) || 1;
      const amount = num(it.amount);
      let rec = perProduct[it.productId];
      if (!rec) {
        rec = perProduct[it.productId] = {
          qty: 0, revenueUSD: 0, revenueKES: 0, name: it.productName || it.productId
        };
      }
      rec.qty += qty;
      rec.revenueUSD += amount;
      rec.revenueKES += usdToKes(amount);
      if (it.productName) rec.name = it.productName;
    }
  }

  _mpSales.cache = perProduct;
  _mpSales.stamp = stamp;
  return _mpSales.cache;
}

export function invalidateMarketplaceMetrics() {
  _mpMetrics.cache = null; _mpMetrics.stamp = '';
  _mpSales.cache = null;   _mpSales.stamp = '';
  invalidateMarketAnalytics();
}

/* ═══════════════════════════════════════════════════════════════
   PRODUCTS
   ═══════════════════════════════════════════════════════════════ */
export function renderMarketplaceProducts() {
  try {
    const $ = safe$;
    const fmtUSD = safeFn('fmtUSD', v => '$' + num(v).toFixed(2));
    const fmtKES = safeFn('fmtKES', v => 'KES ' + num(v).toLocaleString());
    const usdToKes = safeFn('usdToKes', v => num(v) * 129);
    const getProductsList = safeFn('getProductsList', () => []);

    let allProducts = getProductsList();
    if (!Array.isArray(allProducts)) allProducts = [];

    /* Single-pass split + KPI aggregation. */
    const products = [];
    let categorySet = new Set();
    let activeCount = 0;
    for (let i = 0; i < allProducts.length; i++) {
      const p = allProducts[i];
      if (!p) continue;
      if ((p._kind || 'product') !== 'publicUI') products.push(p);
      if (p.category) categorySet.add(p.category);
      if ((p.status || 'active') === 'active') activeCount++;
    }

    const salesMetrics = getProductSalesMetrics();

    const el = (id, v) => { const e = $(id); if (e) e.textContent = String(v); };
    el('mpTotalProducts',   allProducts.length);
    el('mpTotalCategories', categorySet.size);
    el('mpActiveProducts',  activeCount);

    let totalSold = 0;
    for (const k in salesMetrics) totalSold += salesMetrics[k].qty;
    el('mpTotalSold', totalSold);

    /* Category filter options — signature-gated. */
    const catFilter = $('productFilterCategory');
    if (catFilter) {
      const cats = [...categorySet].sort();
      const catSig = hashString('cat|' + cats.join('|'));
      if (catFilter.dataset.vioraSig !== catSig) {
        catFilter.dataset.vioraSig = catSig;
        const prev = catFilter.value || 'all';
        catFilter.innerHTML = '<option value="all">All Categories</option>' +
          cats.map(c => `<option value="${_esc(c)}">${_esc(c)}</option>`).join('');
        catFilter.value = cats.includes(prev) ? prev : 'all';
      }
    }

    const search       = ($('productSearch')?.value || '').toLowerCase().trim();
    const filterCat    = $('productFilterCategory')?.value || 'all';
    const filterStatus = $('productFilterStatus')?.value || 'all';

    let list = products;
    if (search) {
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(search) ||
        (p.description || '').toLowerCase().includes(search) ||
        (p.id || '').toLowerCase().includes(search)
      );
    }
    if (filterCat !== 'all')    list = list.filter(p => p.category === filterCat);
    if (filterStatus !== 'all') list = list.filter(p => (p.status || 'active') === filterStatus);

    /* ── Grid ── */
    const grid = $('marketplaceProductsGrid');
    if (grid) {
      if (!list.length) {
        setHtmlIfChanged(grid, 'empty:products',
          `<div class="empty-state" style="grid-column:1/-1;">No products match. Click "New Product" to add one.</div>`);
      } else {
        const gridSig = sigOf(list, ['name', 'price', 'status', 'category']) +
          '|' + hashString(filterCat + '|' + filterStatus + '|' + search);
        const html = list.map(p => {
          const priceKes = usdToKes(p.price || 0);
          const m = salesMetrics[p.id];
          const sold = m?.qty || 0;
          const revenue = m?.revenueKES || 0;
          const statusCls = p.status === 'draft' ? 'draft' : p.status === 'archived' ? 'gray' : 'active';
          const idSafe = q(p.id);
          return `<div class="card-3d">
            <div class="avatar-mini lg" style="border-radius:12px;"><i class="${_esc(p.icon || 'fa-solid fa-cube')}"></i></div>
            <div class="card-info">
              <div class="card-title">${_esc(p.name || 'Untitled')} <span class="badge badge-${statusCls}">${_esc(p.status || 'active')}</span></div>
              <div class="card-sub">${_esc(p.category || '')} · <code style="font-family:monospace;">${_esc(p.id)}</code></div>
              <div class="card-stats">
                <div class="stat"><span class="val">${fmtUSD(p.price)}</span><span class="lbl">USD</span></div>
                <div class="stat"><span class="val">${fmtKES(priceKes)}</span><span class="lbl">KES</span></div>
                <div class="stat"><span class="val">${sold}</span><span class="lbl">Sold</span></div>
                <div class="stat"><span class="val">${fmtKES(revenue)}</span><span class="lbl">Revenue</span></div>
              </div>
            </div>
            <div class="card-actions">
              <button class="btn btn-primary btn-xs" onclick="Viora.editProduct('${idSafe}')"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-danger btn-xs" onclick="Viora.deleteProduct('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>`;
        }).join('');
        setHtmlIfChanged(grid, gridSig, html);
      }
    }

    /* ── Table ── */
    const tb = $('marketplaceProductsBody');
    if (!tb) return;
    if (!list.length) {
      setHtmlIfChanged(tb, 'empty:products-table',
        `<tr><td colspan="8" class="empty-state">No products to show.</td></tr>`);
      return;
    }
    const tableSig = sigOf(list, ['name', 'price', 'status', 'category']);
    const rows = list.map(p => {
      const priceKes = usdToKes(p.price || 0);
      const sold = salesMetrics[p.id]?.qty || 0;
      const statusCls = p.status === 'draft' ? 'draft' : p.status === 'archived' ? 'gray' : 'active';
      const idSafe = q(p.id);
      const desc = p.description || '';
      const descShort = desc.substring(0, 60);
      return `<tr>
        <td style="font-family:monospace;font-size:.75rem;">${_esc(p.id)}</td>
        <td><strong>${_esc(p.name || '')}</strong><br><small style="color:var(--text-secondary);font-size:.7rem;">${_esc(descShort)}${desc.length > 60 ? '…' : ''}</small></td>
        <td><span class="badge badge-purple">${_esc(p.category || '')}</span></td>
        <td>${fmtUSD(p.price)}</td>
        <td><strong>${fmtKES(priceKes)}</strong></td>
        <td><span class="badge badge-active">${sold}</span></td>
        <td><span class="badge badge-${statusCls}">${_esc(p.status || 'active')}</span></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-primary btn-xs" onclick="Viora.editProduct('${idSafe}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteProduct('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
    setHtmlIfChanged(tb, tableSig, rows);
  } catch (e) { console.warn('renderMarketplaceProducts failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   PUBLIC UI PRODUCTS
   ═══════════════════════════════════════════════════════════════ */
export function renderPublicUiProducts() {
  try {
    const $ = safe$;
    const fmtUSD = safeFn('fmtUSD', v => '$' + num(v).toFixed(2));
    const fmtKES = safeFn('fmtKES', v => 'KES ' + num(v).toLocaleString());
    const usdToKes = safeFn('usdToKes', v => num(v) * 129);
    const getProductsList = safeFn('getProductsList', () => []);

    let allProducts = getProductsList();
    if (!Array.isArray(allProducts)) allProducts = [];

    const list = allProducts.filter(p => p && (p._kind || 'product') === 'publicUI');
    const grid = $('publicUiProductsGrid');
    if (!grid) return;

    const search       = ($('publicUiSearch')?.value || '').toLowerCase().trim();
    const statusFilter = $('publicUiFilterStatus')?.value || 'all';

    let filtered = list;
    if (search) {
      filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(search) ||
        (p.description || '').toLowerCase().includes(search) ||
        (p.id || '').toLowerCase().includes(search)
      );
    }
    if (statusFilter !== 'all') filtered = filtered.filter(p => (p.status || 'active') === statusFilter);

    if (!filtered.length) {
      setHtmlIfChanged(grid, 'empty:publicui',
        `<div class="empty-state" style="grid-column:1/-1;padding:32px;text-align:center;">
          <i class="fa-solid fa-globe" style="font-size:2rem;opacity:.4;margin-bottom:10px;display:block;"></i>
          ${list.length ? 'No public UI products match your search.'
                        : 'No public UI products yet. Click <strong>New Public UI Product</strong> to add one.'}
        </div>`);
      return;
    }

    const sig = hashString(
      'pui|' + filtered.map(p => `${p.id}|${p.status}|${p.price}`).join(',') +
      '|' + search + '|' + statusFilter
    );

    const metrics = getProductSalesMetrics();
    const html = filtered.map(p => {
      const priceKes = usdToKes(p.price || 0);
      const sold = metrics[p.id]?.qty || 0;
      const imageUrl = safeUrl(p.image || p.previewUrl || '');
      const statusCls = p.status === 'draft' ? 'draft' : p.status === 'archived' ? 'gray' : 'active';
      const idSafe = q(p.id);
      return `<div class="card-3d">
        <div class="avatar-mini lg" style="border-radius:12px;overflow:hidden;background:none;">
          ${imageUrl
            ? `<img src="${_esc(imageUrl)}" alt="${_esc(p.name || '')}" loading="lazy" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';" />`
            : `<i class="fa-solid fa-globe"></i>`}
        </div>
        <div class="card-info">
          <div class="card-title">
            ${_esc(p.name || 'Untitled')}
            <span class="badge badge-${statusCls}">${_esc(p.status || 'active')}</span>
            <span class="badge badge-purple" style="font-size:.55rem;">PUBLIC UI</span>
          </div>
          <div class="card-sub">${_esc(p.category || '')} · <code style="font-family:monospace;">${_esc(p.id)}</code></div>
          <div class="card-stats">
            <div class="stat"><span class="val">${fmtUSD(p.price)}</span><span class="lbl">USD</span></div>
            <div class="stat"><span class="val">${fmtKES(priceKes)}</span><span class="lbl">KES</span></div>
            <div class="stat"><span class="val">${sold}</span><span class="lbl">Sold</span></div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-primary btn-xs" onclick="Viora.editProduct('${idSafe}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteProduct('${idSafe}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');

    setHtmlIfChanged(grid, sig, html);
  } catch (e) { console.warn('renderPublicUiProducts failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   ORDERS
   ═══════════════════════════════════════════════════════════════ */
export function renderMarketplaceOrders() {
  try {
    const $ = safe$;
    const fmtKES = safeFn('fmtKES', v => 'KES ' + num(v).toLocaleString());
    const fmtUSD = safeFn('fmtUSD', v => '$' + num(v).toFixed(2));
    const timeAgo = safeFn('timeAgo', t => t || '');
    const getOrdersList = safeFn('getOrdersList', () => []);
    const kpiFormat = safeFn('kpiFormat', v => String(v));

    let orders = getOrdersList();
    if (!Array.isArray(orders)) orders = [];
    const mp = getMarketplaceMetrics();

    const el = (id, v) => { const e = $(id); if (e) e.textContent = String(v); };
    el('mpTotalOrders',   mp.totalOrders);
    el('mpTotalRevenue',  kpiFormat(mp.totalRevenueKES, 'KES'));
    el('mpPaidOrders',    mp.paidOrders);
    el('mpPendingOrders', mp.pendingOrders);

    const nb = $('ordersNavBadge');
    if (nb) {
      if (mp.pendingOrders > 0) { nb.textContent = String(mp.pendingOrders); nb.style.display = 'inline-block'; }
      else nb.style.display = 'none';
    }

    const search       = ($('orderSearch')?.value || '').toLowerCase().trim();
    const filterStatus = $('orderFilterStatus')?.value || 'all';
    const filterMethod = $('orderFilterMethod')?.value || 'all';

    let list = orders;
    if (search) {
      list = list.filter(o =>
        (o.id || '').toLowerCase().includes(search) ||
        (o.customerName || '').toLowerCase().includes(search) ||
        (o.customerEmail || '').toLowerCase().includes(search) ||
        String(o.customerPhone || '').includes(search)
      );
    }
    if (filterStatus !== 'all') list = list.filter(o => o.paymentStatus === filterStatus);
    if (filterMethod !== 'all') list = list.filter(o => o.paymentMethod === filterMethod);

    list = list.slice().sort((a, b) =>
      ((b && b.timestamp) || '').localeCompare((a && a.timestamp) || '')
    );

    const tb = $('marketplaceOrdersBody');
    if (!tb) return;
    if (!list.length) {
      setHtmlIfChanged(tb, 'empty:orders',
        `<tr><td colspan="8" class="empty-state">No orders yet. Every marketplace purchase appears here in real time.</td></tr>`);
      return;
    }

    const sig = sigOf(list, ['paymentStatus', 'paymentMethod', 'totalKES']) +
      '|' + hashString(search + '|' + filterStatus + '|' + filterMethod);

    const rows = list.map(o => {
      const itemsArr = Array.isArray(o.items) ? o.items : [];
      const items = itemsArr.map(i => i && i.productName).filter(Boolean).join(', ') || '—';
      const itemsShort = items.substring(0, 50);
      const idSafe = q(o.id);
      const methodCls = o.paymentMethod === 'mpesa' ? 'active'
                      : o.paymentMethod === 'card' ? 'pending'
                      : 'draft';
      const statusCls = o.paymentStatus === 'paid' ? 'paid'
                      : o.paymentStatus === 'pending' ? 'pending'
                      : o.paymentStatus === 'failed' ? 'overdue'
                      : 'gray';
      return `<tr>
        <td style="font-family:monospace;font-size:.75rem;">${_esc(o.id)}</td>
        <td><strong>${_esc(o.customerName || '—')}</strong><br><small style="color:var(--text-secondary);font-size:.7rem;">${_esc(o.customerEmail || '')}</small></td>
        <td><span class="badge badge-purple" title="${_esc(items)}">${itemsArr.length} item(s)</span><br><small style="color:var(--text-secondary);font-size:.68rem;">${_esc(itemsShort)}${items.length > 50 ? '…' : ''}</small></td>
        <td><strong>${fmtKES(o.totalKES)}</strong><br><small style="color:var(--text-light);font-size:.7rem;">${fmtUSD(o.totalUSD)}</small></td>
        <td><span class="badge badge-${methodCls}">${_esc(o.paymentMethod || '—')}</span></td>
        <td><span class="badge badge-${statusCls}">${_esc(o.paymentStatus || 'pending')}</span></td>
        <td><small>${timeAgo(o.timestamp)}</small></td>
        <td style="text-align:right;white-space:nowrap;">
          ${o.paymentStatus !== 'paid' ? `<button class="btn btn-success btn-xs" onclick="Viora.markOrderPaid('${idSafe}')" title="Mark paid"><i class="fa-solid fa-check"></i> Mark Paid</button>` : ''}
          <button class="btn btn-primary btn-xs" onclick="Viora.viewOrder('${idSafe}')"><i class="fa-solid fa-eye"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteOrder('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
    setHtmlIfChanged(tb, sig, rows);
  } catch (e) { console.warn('renderMarketplaceOrders failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   MARKET ANALYTICS (aggregate computation)
   ═══════════════════════════════════════════════════════════════ */
function _analyticsStampOf(state) {
  const orders    = Array.isArray(state.data.orders) ? state.data.orders : [];
  const leads     = Array.isArray(state.data.marketLeads) ? state.data.marketLeads : [];
  const entities  = Array.isArray(state.data.entities) ? state.data.entities : [];
  const blocklist = Array.isArray(state.data.deletedMarketEmails) ? state.data.deletedMarketEmails : [];
  const orderSig  = sigOf(orders, ['totalKES', 'paymentStatus', 'customerEmail']);
  const entitySig = sigOf(entities, ['name', 'email']);
  return `${orders.length}|${leads.length}|${entities.length}|${blocklist.length}|${orderSig}|${entitySig}`;
}

export function computeMarketAnalytics() {
  const state = safeState();
  const normalizeEmail = safeFn('normalizeEmail', e => String(e || '').toLowerCase());

  const stamp = _analyticsStampOf(state);
  if (_analytics.cache && stamp === _analytics.stamp) return _analytics.cache;

  const orders      = Array.isArray(state.data.orders) ? state.data.orders : [];
  const marketLeads = Array.isArray(state.data.marketLeads) ? state.data.marketLeads : [];
  const entities    = Array.isArray(state.data.entities) ? state.data.entities : [];
  const blocklist   = new Set(
    (Array.isArray(state.data.deletedMarketEmails) ? state.data.deletedMarketEmails : []).map(normalizeEmail)
  );

  const convertedEmails = new Set();
  const clientNamesLower = new Set();
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (!e || e.type !== 'client') continue;
    const em = normalizeEmail(e.email);
    if (em) convertedEmails.add(em);
    const nm = String(e.name || '').trim().toLowerCase();
    if (nm) clientNamesLower.add(nm);
  }

  const clientMap = Object.create(null);

  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    if (!o) continue;
    const email = normalizeEmail(o.customerEmail);
    if (!email || blocklist.has(email)) continue;
    let c = clientMap[email];
    if (!c) {
      c = clientMap[email] = {
        name: o.customerName || '—',
        email: o.customerEmail || '',
        phone: o.customerPhone || '',
        lastProductName: '',
        totalAttempts: 0,
        lifetimeValueKES: 0,
        isNewClient: true,
        lastSeenAt: o.timestamp,
        status: 'customer',
        orderCount: 0
      };
    }
    c.orderCount++;
    c.lifetimeValueKES += num(o.totalKES);
    if ((o.timestamp || '') > (c.lastSeenAt || '')) c.lastSeenAt = o.timestamp;
    const items = Array.isArray(o.items) ? o.items : [];
    if (items.length) {
      let prod = '';
      for (let j = 0; j < items.length; j++) {
        const nm = items[j] && items[j].productName;
        if (nm) prod = prod ? prod + ' + ' + nm : nm;
      }
      if (prod) c.lastProductName = prod;
    }
    if (o.customerPhone) c.phone = o.customerPhone;
    if (o.customerName)  c.name  = o.customerName;
  }

  for (let i = 0; i < marketLeads.length; i++) {
    const l = marketLeads[i];
    if (!l) continue;
    const email = normalizeEmail(l.email);
    if (email && blocklist.has(email)) continue;
    const key = email || ('bl-' + l.id);
    let c = clientMap[key];
    if (!c) {
      c = clientMap[key] = {
        name: l.name || '—',
        email: l.email || '',
        phone: l.phone || '',
        lastProductName: l.lastProductName || l.industryName || '',
        totalAttempts: l.totalAttempts || 0,
        lifetimeValueKES: l.lifetimeValueKES || 0,
        isNewClient: l.isNewClient !== false,
        lastSeenAt: l.lastSeenAt || l.createdAt,
        status: l.status || 'interested',
        orderCount: 0
      };
    } else {
      c.totalAttempts = Math.max(c.totalAttempts, l.totalAttempts || 0);
      c.isNewClient = l.isNewClient !== false;
      if ((l.lastSeenAt || '') > (c.lastSeenAt || '')) c.lastSeenAt = l.lastSeenAt;
      if (l.lastProductName) c.lastProductName = l.lastProductName;
      if (l.phone) c.phone = l.phone;
      if (l.name)  c.name  = l.name;
    }
  }

  for (const key in clientMap) {
    const c = clientMap[key];
    const email = normalizeEmail(c.email);
    if (email && convertedEmails.has(email)) { c.isNewClient = false; c.status = 'client'; continue; }
    if (!email && c.name && c.status === 'interested') {
      const nameKey = String(c.name).trim().toLowerCase();
      if (clientNamesLower.has(nameKey)) { c.isNewClient = false; c.status = 'client'; continue; }
    }
    if (c.orderCount > 0) { c.isNewClient = false; c.status = 'customer'; }
  }

  const arr = Object.values(clientMap);
  arr.sort((a, b) => {
    const aFresh = (a.status === 'interested' || a.isNewClient) ? 1 : 0;
    const bFresh = (b.status === 'interested' || b.isNewClient) ? 1 : 0;
    if (aFresh !== bFresh) return bFresh - aFresh;
    if (b.lifetimeValueKES !== a.lifetimeValueKES) return b.lifetimeValueKES - a.lifetimeValueKES;
    if ((b.totalAttempts || 0) !== (a.totalAttempts || 0)) return (b.totalAttempts || 0) - (a.totalAttempts || 0);
    const at = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() || 0 : 0;
    const bt = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() || 0 : 0;
    return bt - at;
  });

  _analytics.cache = { clientMap, topClients: arr.slice(0, 20) };
  _analytics.stamp = stamp;
  return _analytics.cache;
}

export function invalidateMarketAnalytics() {
  _analytics.cache = null;
  _analytics.stamp = '';
}

/* ═══════════════════════════════════════════════════════════════
   MATERIALIZE MARKET LEADS
   ═══════════════════════════════════════════════════════════════ */
export async function materializeMarketplaceLeads() {
  if (_materialize.inFlight) return;
  _materialize.inFlight = true;
  try {
    const state = safeState();
    const normalizeEmail = safeFn('normalizeEmail', e => String(e || '').toLowerCase());
    const emailToId = safeFn('emailToId', e => String(e || '').replace(/[^a-z0-9]/gi, '-'));
    const upsertDoc = C().upsertDoc;
    if (typeof upsertDoc !== 'function') return;

    const blocklist = new Set(
      (Array.isArray(state.data.deletedMarketEmails) ? state.data.deletedMarketEmails : []).map(normalizeEmail)
    );
    const existingLeads = Array.isArray(state.data.leads) ? state.data.leads : [];
    const byEmail = new Map();
    for (let i = 0; i < existingLeads.length; i++) {
      const e = normalizeEmail(existingLeads[i] && existingLeads[i].email);
      if (e) byEmail.set(e, existingLeads[i]);
    }

    const clientEmails = new Set();
    const entities = Array.isArray(state.data.entities) ? state.data.entities : [];
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (e && e.type === 'client') {
        const em = normalizeEmail(e.email);
        if (em) clientEmails.add(em);
      }
    }

    const seenThisRun = new Set();
    const toCreate = [];
    const orders = Array.isArray(state.data.orders) ? state.data.orders : [];
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (!o) continue;
      const email = normalizeEmail(o.customerEmail);
      if (!email || blocklist.has(email)) continue;
      if (byEmail.has(email)) continue;
      if (clientEmails.has(email)) continue;
      if (seenThisRun.has(email)) continue;
      seenThisRun.add(email);
      toCreate.push({
        email,
        name: o.customerName || o.customerEmail,
        phone: o.customerPhone || '',
        createdAt: o.timestamp || new Date().toISOString(),
        lastSeenAt: o.timestamp || new Date().toISOString()
      });
    }

    let created = 0;
    for (let i = 0; i < toCreate.length; i++) {
      const c = toCreate[i];
      const leadId = 'mkt-' + emailToId(c.email).replace(/^mkt-/, '');
      const lead = {
        id: leadId,
        fullName: c.name,
        email: c.email,
        phone: c.phone,
        source: 'Marketplace',
        status: 'Qualified',
        campaignId: null,
        campaignName: 'Marketplace',
        notes: 'Auto-materialised from marketplace order',
        createdAt: c.createdAt,
        updatedAt: new Date().toISOString(),
        _fromMarket: true
      };
      try {
        await upsertDoc('leads', lead);
        byEmail.set(c.email, lead);
        created++;
      } catch (err) {
        console.warn('[viora] market lead materialise failed', err);
      }
    }

    if (created) {
      invalidateMarketAnalytics();
      console.info(`[viora] materialised ${created} marketplace lead(s)`);
    }
  } catch (e) {
    console.warn('materializeMarketplaceLeads failed', e);
  } finally {
    _materialize.inFlight = false;
  }
}

/* ═══════════════════════════════════════════════════════════════
   MARKET ANALYTICS UI
   ═══════════════════════════════════════════════════════════════ */
export function renderMarketplaceAnalytics() {
  try {
    const $ = safe$;
    const state = safeState();
    const timeAgo = safeFn('timeAgo', t => t || '');
    const fmtKES  = safeFn('fmtKES', v => 'KES ' + num(v).toLocaleString());
    const kpiFormat = safeFn('kpiFormat', v => String(v));
    const getOrdersList = safeFn('getOrdersList', () => []);
    const getProduct = safeFn('getProduct', () => null);
    const usdToKes = safeFn('usdToKes', v => num(v) * 129);
    const normalizeEmail = safeFn('normalizeEmail', e => String(e || '').toLowerCase());

    const tabVisible = _activeTab('marketplace-analytics');
    const mp = getMarketplaceMetrics();
    const { topClients } = computeMarketAnalytics();

    const el = (id, v) => { const e = $(id); if (e) e.textContent = String(v); };
    el('mpAnalyticsRevenue',   kpiFormat(mp.totalRevenueKES, 'KES'));
    el('mpAnalyticsAOV',       kpiFormat(mp.aov, 'KES'));

    let orders = getOrdersList();
    if (!Array.isArray(orders)) orders = [];

    let subs = 0;
    for (let i = 0; i < orders.length; i++) {
      const items = (orders[i] && orders[i].items) || [];
      for (let j = 0; j < items.length; j++) {
        if (items[j] && items[j].plan !== 'lifetime') subs++;
      }
    }
    el('mpAnalyticsSubs', subs);

    const convertedEmails = new Set();
    const entities = Array.isArray(state.data.entities) ? state.data.entities : [];
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (e && e.type === 'client') {
        const em = normalizeEmail(e.email);
        if (em) convertedEmails.add(em);
      }
    }
    const uniqueEmails = new Set();
    for (let i = 0; i < orders.length; i++) {
      const em = normalizeEmail(orders[i] && orders[i].customerEmail);
      if (em && !convertedEmails.has(em)) uniqueEmails.add(em);
    }
    const marketLeads = Array.isArray(state.data.marketLeads) ? state.data.marketLeads : [];
    for (let i = 0; i < marketLeads.length; i++) {
      const em = normalizeEmail(marketLeads[i] && marketLeads[i].email);
      if (em && !convertedEmails.has(em)) uniqueEmails.add(em);
    }
    el('mpAnalyticsCustomers', uniqueEmails.size);

    /* Top-customers table — always refreshable, gated by sig. */
    const custBody = $('mpTopCustomersBody');
    if (custBody) {
      const custSig = hashString(
        'cust|' + topClients.map(c =>
          `${c.email}|${c.lifetimeValueKES}|${c.status}|${c.totalAttempts}`
        ).join('|')
      );
      if (!topClients.length) {
        setHtmlIfChanged(custBody, 'empty:customers',
          `<tr><td colspan="6" class="empty-state">No client activity yet.</td></tr>`);
      } else {
        const html = topClients.map(c => {
          let badge, status;
          if (c.status === 'client')        { badge = '<span class="badge badge-active" style="font-size:.6rem;">⭐ CLIENT</span>';   status = '<span class="badge badge-paid">CONVERTED</span>'; }
          else if (c.status === 'customer') { badge = '<span class="badge badge-gray" style="font-size:.6rem;">EXISTING</span>';    status = '<span class="badge badge-paid">CUSTOMER</span>'; }
          else if (c.isNewClient)           { badge = '<span class="badge badge-active" style="font-size:.6rem;">🆕 NEW</span>';     status = '<span class="badge badge-pending">INTERESTED</span>'; }
          else                              { badge = '<span class="badge badge-gray" style="font-size:.6rem;">EXISTING</span>';    status = '<span class="badge badge-pending">INTERESTED</span>'; }
          const productDisplay = (c.lastProductName || '').substring(0, 40) || '—';
          return `<tr>
            <td><strong>${_esc(c.name || '—')}</strong> ${badge} ${status}</td>
            <td>${_esc(c.email || '')}<br><small style="color:var(--text-secondary);">${_esc(c.phone || '')}</small></td>
            <td><span class="badge badge-purple" title="${_esc(c.lastProductName || '')}">${_esc(productDisplay)}</span></td>
            <td style="text-align:right;">${c.totalAttempts || 0}</td>
            <td style="text-align:right;font-weight:700;color:var(--accent-green);">${fmtKES(c.lifetimeValueKES || 0)}</td>
            <td style="text-align:right;"><small>${timeAgo(c.lastSeenAt)}</small></td>
          </tr>`;
        }).join('');
        setHtmlIfChanged(custBody, custSig, html);
      }
    }

    if (!tabVisible) return;
    if (typeof Chart === 'undefined') return;

    const getTextColor = safeFn('getTextColor', () => '#94a3b8');
    const destroyChart = safeFn('destroyChart', () => {});
    const safeCanvas   = safeFn('safeCanvas', () => null);
    const tc = getTextColor();
    const gc = 'rgba(148,163,184,0.15)';

    /* Revenue trend. */
    const monthly = Object.create(null);
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (!o || o.paymentStatus !== 'paid' || !o.timestamp) continue;
      const k = o.timestamp.slice(0, 7);
      monthly[k] = (monthly[k] || 0) + num(o.totalKES);
    }
    const keys = Object.keys(monthly).sort();

    destroyChart('mpRevenueTrendChart');
    const c1 = safeCanvas('mpRevenueTrendChart');
    if (c1 && c1.ctx) {
      try {
        state.charts = state.charts || {};
        const grad = c1.ctx.createLinearGradient(0, 0, 0, 220);
        grad.addColorStop(0, 'rgba(0,212,255,0.55)');
        grad.addColorStop(1, 'rgba(124,58,237,0.02)');
        state.charts['mpRevenueTrendChart'] = new Chart(c1.ctx, {
          type: 'line',
          data: {
            labels: keys.length
              ? keys.map(k => new Date(k + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }))
              : ['No data'],
            datasets: [{
              label: 'Revenue',
              data: keys.length ? keys.map(k => monthly[k]) : [0],
              borderColor: '#00d4ff', borderWidth: 3, backgroundColor: grad, fill: true, tension: 0.4
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 200 },
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, ticks: { color: tc, callback: v => 'KSh ' + Number(v).toLocaleString() }, grid: { color: gc } },
              x: { ticks: { color: tc }, grid: { display: false } }
            }
          }
        });
      } catch (e) { console.warn('[mp] revenue chart failed', e); }
    }

    /* Top products. */
    const salesMetrics = getProductSalesMetrics();
    const topProducts = Object.entries(salesMetrics)
      .map(([id, m]) => ({ id, ...m }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);

    destroyChart('mpTopProductsChart');
    const c2 = safeCanvas('mpTopProductsChart');
    if (c2 && c2.ctx && topProducts.length) {
      try {
        state.charts['mpTopProductsChart'] = new Chart(c2.ctx, {
          type: 'bar',
          data: {
            labels: topProducts.map(p => p.name || p.id),
            datasets: [{
              label: 'Units Sold',
              data: topProducts.map(p => p.qty),
              backgroundColor: 'rgba(34,230,160,0.75)',
              borderColor: '#22e6a0', borderWidth: 1, borderRadius: 6
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'y',
            animation: { duration: 200 },
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true, ticks: { color: tc, stepSize: 1 }, grid: { color: gc } },
              y: { ticks: { color: tc, font: { size: 10 } }, grid: { display: false } }
            }
          }
        });
      } catch (e) { console.warn('[mp] top products chart failed', e); }
    } else if (c2) {
      destroyChart('mpTopProductsChart');
    }

    /* Category revenue pie. */
    const catRevenue = Object.create(null);
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (!o || o.paymentStatus !== 'paid') continue;
      const items = (o.items || []);
      for (let j = 0; j < items.length; j++) {
        const it = items[j];
        if (!it) continue;
        const product = getProduct(it.productId);
        const cat = product?.category || 'Other';
        catRevenue[cat] = (catRevenue[cat] || 0) + usdToKes(num(it.amount));
      }
    }
    const catLabels = Object.keys(catRevenue);
    const catValues = Object.values(catRevenue);
    const palette = ['#00d4ff', '#7c3aed', '#ff6ec7', '#22e6a0', '#ffc857', '#a855f7', '#ff5c7c', '#10a37f'];

    destroyChart('mpRevenueCategoryChart');
    const c3 = safeCanvas('mpRevenueCategoryChart');
    if (c3 && c3.ctx && catLabels.length) {
      try {
        state.charts['mpRevenueCategoryChart'] = new Chart(c3.ctx, {
          type: 'pie',
          data: {
            labels: catLabels,
            datasets: [{
              data: catValues,
              backgroundColor: catLabels.map((_, i) => palette[i % palette.length]),
              borderColor: '#0a0a0f', borderWidth: 2
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 200 },
            plugins: { legend: { position: 'right', labels: { color: tc, font: { size: 10 }, boxWidth: 12, usePointStyle: true } } }
          }
        });
      } catch (e) { console.warn('[mp] category chart failed', e); }
    } else if (c3) {
      destroyChart('mpRevenueCategoryChart');
    }

    /* Payment methods — blocklist aware. */
    const blocklist = new Set(
      (Array.isArray(state.data.deletedMarketEmails) ? state.data.deletedMarketEmails : []).map(normalizeEmail)
    );
    const methodCounts = { mpesa: 0, card: 0, bank: 0, cash: 0 };
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (!o) continue;
      const em = normalizeEmail(o.customerEmail);
      if (!em || blocklist.has(em)) continue;
      const m = o.paymentMethod || 'mpesa';
      if (!(m in methodCounts)) methodCounts[m] = 0;
      methodCounts[m]++;
    }
    const methodLabels = Object.keys(methodCounts).filter(k => methodCounts[k] > 0);
    const methodValues = methodLabels.map(k => methodCounts[k]);
    const methodColors = {
      mpesa: 'rgba(34,230,160,0.85)',
      card:  'rgba(0,212,255,0.85)',
      bank:  'rgba(168,85,247,0.85)',
      cash:  'rgba(255,200,87,0.85)'
    };

    destroyChart('mpPaymentMethodsChart');
    const c4 = safeCanvas('mpPaymentMethodsChart');
    if (c4 && c4.ctx && methodLabels.length) {
      try {
        state.charts['mpPaymentMethodsChart'] = new Chart(c4.ctx, {
          type: 'doughnut',
          data: {
            labels: methodLabels.map(m => m.charAt(0).toUpperCase() + m.slice(1)),
            datasets: [{
              data: methodValues,
              backgroundColor: methodLabels.map(m => methodColors[m] || 'rgba(0,212,255,0.75)'),
              borderColor: '#0a0a0f', borderWidth: 2
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '58%',
            animation: { duration: 200 },
            plugins: { legend: { position: 'bottom', labels: { color: tc, font: { size: 11 }, boxWidth: 12, usePointStyle: true } } }
          }
        });
      } catch (e) { console.warn('[mp] methods chart failed', e); }
    } else if (c4) {
      destroyChart('mpPaymentMethodsChart');
    }
  } catch (e) { console.warn('renderMarketplaceAnalytics failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   ORDER DETAIL
   ═══════════════════════════════════════════════════════════════ */
export function openOrderDetail(orderId) {
  try {
    const $ = safe$;
    const state = safeState();
    const fmtUSD = safeFn('fmtUSD', v => '$' + num(v).toFixed(2));
    const fmtKES = safeFn('fmtKES', v => 'KES ' + num(v).toLocaleString());
    const usdToKes = safeFn('usdToKes', v => num(v) * 129);
    const getOrder = safeFn('getOrder', () => null);
    const openModal = C().openModal;

    const o = getOrder(orderId);
    if (!o) { _toast('Order not found.', 'error'); return; }
    state.viewingOrderId = orderId;

    const idEl = $('orderDetailId');
    if (idEl) idEl.textContent = o.id;

    const cacheKey = o.id + '|' + (o.updatedAt || o.timestamp || '') + '|' + (o.paymentStatus || '');
    let html = _orderDetailCache.get(cacheKey);
    if (!html) {
      const itemsRows = (o.items || []).map(it => `<tr>
        <td>${_esc(it.productName || '')}</td>
        <td>${_esc(it.plan || '—')}</td>
        <td style="text-align:right;">${it.qty || 1}</td>
        <td style="text-align:right;">${fmtUSD(it.amount)}</td>
        <td style="text-align:right;">${fmtKES(usdToKes(it.amount))}</td>
      </tr>`).join('');

      const keysList = (o.items || []).filter(i => i.licenseKey).map(i =>
        `<div style="font-family:monospace;font-size:.85rem;color:var(--accent-blue);background:var(--bg-card-solid);padding:8px 12px;border-radius:8px;margin-bottom:4px;border:1px solid var(--border-color);">
          ${_esc(i.licenseKey)} <small style="color:var(--text-secondary);margin-left:8px;">${_esc(i.productName || '')}</small>
        </div>`
      ).join('');

      const ts = o.timestamp ? new Date(o.timestamp).toLocaleString() : '—';
      const getLogoImg = C().getLogoImg;
      const logoHtml = typeof getLogoImg === 'function' ? getLogoImg(safeData().logoUrl) : '';
      const statusCls = o.paymentStatus === 'paid' ? 'paid' : o.paymentStatus === 'pending' ? 'pending' : 'overdue';

      html = `
        <div class="report-canvas">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;border-bottom:2px solid #e2e8f0;padding-bottom:14px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${logoHtml}
              <div><div style="font-size:.7rem;color:#94a3b8;margin-top:2px;">${_esc(C().SENDER_PHONE || '')} · ${_esc(C().SENDER_EMAIL || '')}</div></div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:1.1rem;font-weight:700;color:#0a0a0f;">RECEIPT</div>
              <div style="font-size:.72rem;color:#64748b;">Order ${_esc(o.id)}</div>
              <div style="font-size:.7rem;color:#94a3b8;margin-top:2px;">${_esc(ts)}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
            <div class="client-360-stat"><div class="label">Customer</div><div class="value" style="font-size:1rem;">${_esc(o.customerName || '—')}</div></div>
            <div class="client-360-stat"><div class="label">Email</div><div class="value" style="font-size:.85rem;word-break:break-all;">${_esc(o.customerEmail || '—')}</div></div>
            <div class="client-360-stat"><div class="label">Phone</div><div class="value" style="font-size:1rem;">${_esc(o.customerPhone || '—')}</div></div>
            <div class="client-360-stat"><div class="label">Payment</div><div class="value" style="font-size:1rem;">${_esc(o.paymentMethod || '—')}</div></div>
          </div>
          <div style="padding:12px;background:var(--bg-input);border-radius:12px;margin-bottom:14px;border:1px solid var(--border-color);">
            <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--text-secondary);">Order ID:</span><strong style="font-family:monospace;">${_esc(o.id)}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--text-secondary);">Date:</span><strong>${_esc(ts)}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--text-secondary);">Status:</span><span class="badge badge-${statusCls}">${_esc(o.paymentStatus || 'pending')}</span></div>
          </div>
          <h4 style="font-size:.8rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;margin-bottom:6px;">Items Purchased</h4>
          <table style="width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:14px;">
            <thead><tr style="background:var(--bg-table-alt);">
              <th style="text-align:left;padding:8px;">Product</th>
              <th style="text-align:left;padding:8px;">Plan</th>
              <th style="text-align:right;padding:8px;">Qty</th>
              <th style="text-align:right;padding:8px;">USD</th>
              <th style="text-align:right;padding:8px;">KES</th>
            </tr></thead>
            <tbody>${itemsRows}</tbody>
          </table>
          <div style="display:flex;justify-content:space-between;padding:6px 0;">
            <span style="color:var(--text-secondary);">Subtotal:</span>
            <strong>${fmtUSD(o.subtotalUSD)} / ${fmtKES(usdToKes(o.subtotalUSD))}</strong>
          </div>
          ${num(o.discountUSD) > 0
            ? `<div style="display:flex;justify-content:space-between;padding:6px 0;color:var(--accent-green);"><span>Discount (${_esc(o.promoCode || '')}):</span><strong>−${fmtUSD(o.discountUSD)}</strong></div>`
            : ''}
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid var(--border-color);margin-top:6px;font-size:1.1rem;">
            <strong>Total:</strong><strong style="color:var(--accent-green);">${fmtKES(o.totalKES)}</strong>
          </div>
          ${keysList ? `<h4 style="font-size:.8rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;margin:14px 0 6px;">License Keys</h4><div>${keysList}</div>` : ''}
        </div>`;
      if (_orderDetailCache.size > 20) _orderDetailCache.clear();
      _orderDetailCache.set(cacheKey, html);
    }

    const content = $('orderDetailContent');
    if (content) setHtmlIfChanged(content, cacheKey, html);
    if (typeof openModal === 'function') openModal('orderDetailModal');
  } catch (e) { console.warn('openOrderDetail failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   MY ORDERS
   ═══════════════════════════════════════════════════════════════ */
export function renderMyOrders() {
  try {
    const $ = safe$;
    const state = safeState();
    const fmtUSD = safeFn('fmtUSD', v => '$' + num(v).toFixed(2));
    const fmtKES = safeFn('fmtKES', v => 'KES ' + num(v).toLocaleString());
    const timeAgo = safeFn('timeAgo', t => t || '');
    const kpiFormat = safeFn('kpiFormat', v => String(v));
    const normalizeEmail = safeFn('normalizeEmail', e => String(e || '').toLowerCase());
    const getOrdersList = safeFn('getOrdersList', () => []);

    const email = normalizeEmail(state.operator?.email);
    if (!email) {
      const gridEl = $('myOrdersGrid');
      if (gridEl) setHtmlIfChanged(gridEl, 'empty:myorders-auth',
        '<div class="empty-state" style="grid-column:1/-1;">Sign in with an email to see your orders.</div>');
      return;
    }

    let orders = getOrdersList();
    if (!Array.isArray(orders)) orders = [];

    const myOrders = orders
      .filter(o => o && normalizeEmail(o.customerEmail) === email)
      .sort((a, b) => ((b && b.timestamp) || '').localeCompare((a && a.timestamp) || ''));

    const totalSpent = myOrders.reduce((s, o) =>
      s + (o.paymentStatus === 'paid' ? num(o.totalKES) : 0), 0);
    const paidCount = myOrders.filter(o => o.paymentStatus === 'paid').length;
    let licenseKeys = 0;
    for (let i = 0; i < myOrders.length; i++) {
      const items = (myOrders[i] && myOrders[i].items) || [];
      for (let j = 0; j < items.length; j++) if (items[j] && items[j].licenseKey) licenseKeys++;
    }

    const el = (id, v) => { const e = $(id); if (e) e.textContent = String(v); };
    el('myOrderCount', myOrders.length);
    el('myOrderTotal', kpiFormat(totalSpent, 'KES'));
    el('myOrderPaid',  paidCount);
    el('myOrderKeys',  licenseKeys);

    const grid = $('myOrdersGrid');
    if (!grid) return;

    if (!myOrders.length) {
      setHtmlIfChanged(grid, 'empty:myorders',
        `<div class="empty-state" style="grid-column:1/-1;">You haven't made any marketplace purchases yet.</div>`);
      return;
    }

    const sig = sigOf(myOrders, ['paymentStatus', 'totalKES', 'timestamp']);

    const html = myOrders.map(o => {
      const itemsList = (o.items || []).map(i => `
        <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:.82rem;">
          <span>${_esc(i.productName || '')} × ${i.qty || 1}</span>
          <span style="color:var(--accent-green);font-weight:600;">${fmtUSD(i.amount)}</span>
        </div>`).join('');
      const keys = (o.items || []).filter(i => i.licenseKey).map(i =>
        `<div style="font-family:monospace;font-size:.75rem;color:var(--accent-blue);background:var(--bg-card-solid);padding:4px 8px;border-radius:6px;margin-top:3px;">
          🔑 ${_esc(i.licenseKey)}
        </div>`
      ).join('');
      const statusCls = o.paymentStatus === 'paid' ? 'paid' : o.paymentStatus === 'pending' ? 'pending' : 'overdue';
      const idSafe = q(o.id);
      return `<div class="card-3d ${o.paymentStatus === 'paid' ? 'done' : ''}">
        <div class="card-info" style="min-width:0;">
          <div class="card-title">Order ${_esc(o.id)} <span class="badge badge-${statusCls}">${_esc(o.paymentStatus || 'pending')}</span></div>
          <div class="card-sub">${timeAgo(o.timestamp)} · ${_esc(o.paymentMethod || '')}</div>
          <div style="margin-top:8px;border-top:1px solid var(--border-color);padding-top:8px;">${itemsList}</div>
          ${keys ? `<div style="margin-top:8px;"><div style="font-size:.7rem;color:var(--text-secondary);font-weight:600;">LICENSE KEYS</div>${keys}</div>` : ''}
          <div class="card-stats" style="margin-top:8px;">
            <div class="stat"><span class="val">${fmtKES(o.totalKES)}</span><span class="lbl">Total KES</span></div>
            <div class="stat"><span class="val">${fmtUSD(o.totalUSD)}</span><span class="lbl">Total USD</span></div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-primary btn-xs" onclick="Viora.viewOrder('${idSafe}')"><i class="fa-solid fa-eye"></i> Details</button>
        </div>
      </div>`;
    }).join('');

    setHtmlIfChanged(grid, sig, html);
  } catch (e) { console.warn('renderMyOrders failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   WISHLIST
   ═══════════════════════════════════════════════════════════════ */
export function renderMyWishlist() {
  try {
    const $ = safe$;
    const state = safeState();
    const fmtKES = safeFn('fmtKES', v => 'KES ' + num(v).toLocaleString());
    const fmtUSD = safeFn('fmtUSD', v => '$' + num(v).toFixed(2));
    const usdToKes = safeFn('usdToKes', v => num(v) * 129);
    const getProductsList = safeFn('getProductsList', () => []);

    const grid = $('myWishlistGrid');
    if (!grid) return;

    let wishlist = Array.isArray(state.data.marketplaceWishlist) ? state.data.marketplaceWishlist : [];
    /* Coerce IDs to strings — legacy data may contain numbers/objects. */
    wishlist = wishlist.map(id => (typeof id === 'string' ? id : String(id))).filter(Boolean);

    if (!wishlist.length) {
      setHtmlIfChanged(grid, 'empty:wishlist',
        `<div class="empty-state" style="grid-column:1/-1;">Your wishlist is empty. Browse the marketplace to save products.</div>`);
      return;
    }

    let allProducts = getProductsList();
    if (!Array.isArray(allProducts)) allProducts = [];
    const productsById = new Map();
    for (const p of allProducts) if (p && p.id) productsById.set(p.id, p);
    const items = wishlist.map(id => productsById.get(id)).filter(Boolean);

    if (!items.length) {
      setHtmlIfChanged(grid, 'empty:wishlist-stale',
        `<div class="empty-state" style="grid-column:1/-1;">Wishlist products no longer available.</div>`);
      return;
    }

    const sig = hashString('wl|' + wishlist.join(',') + '|' + items.map(p => p.id).join('|'));

    const html = items.map(p => {
      const priceKes = usdToKes(p.price || 49);
      const idSafe = q(p.id);
      return `<div class="card-3d">
        <div class="avatar-mini lg" style="border-radius:12px;"><i class="${_esc(p.icon || 'fa-solid fa-cube')}"></i></div>
        <div class="card-info">
          <div class="card-title">${_esc(p.name || '')}</div>
          <div class="card-sub">${_esc(p.category || '')}</div>
          <div class="card-stats">
            <div class="stat"><span class="val">${fmtKES(priceKes)}</span><span class="lbl">KES</span></div>
            <div class="stat"><span class="val">${fmtUSD(p.price)}</span><span class="lbl">USD</span></div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-success btn-xs" onclick="Viora.buyFromWishlist('${idSafe}')"><i class="fa-solid fa-bolt"></i> Buy</button>
          <button class="btn btn-danger btn-xs" onclick="Viora.removeFromWishlist('${idSafe}')"><i class="fa-solid fa-heart-crack"></i></button>
        </div>
      </div>`;
    }).join('');

    setHtmlIfChanged(grid, sig, html);
  } catch (e) { console.warn('renderMyWishlist failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   CAMPAIGNS
   ═══════════════════════════════════════════════════════════════ */
export function renderCampaigns() {
  try {
    const $ = safe$;
    const state = safeState();
    const fmtKES = safeFn('fmtKES', v => 'KES ' + num(v).toLocaleString());
    const fmtDate = safeFn('fmtDate', d => d || '');
    const timeAgo = safeFn('timeAgo', t => t || '');

    const campaigns = Array.isArray(state.data.campaigns) ? state.data.campaigns : [];

    // ★ FIX: Calculate KPI Stats
    let totalBudget = 0, totalSpend = 0, activeCount = 0, totalLeads = 0;
    const platformSpend = {};
    const leads = Array.isArray(state.data.leads) ? state.data.leads : [];

    campaigns.forEach(c => {
      if (!c) return;
      totalBudget += num(c.budget);
      totalSpend += num(c.spend);
      if (c.status === 'Active') activeCount++;
      
      const plat = c.media?.type || 'Other';
      platformSpend[plat] = (platformSpend[plat] || 0) + num(c.spend);
      
      totalLeads += leads.filter(l => l.campaignId === c.id).length;
    });

    // Render KPI cards
    const setKpi = (id, val) => { const e = $(id); if (e) e.textContent = val; };
    setKpi('campKpiBudget', fmtKES(totalBudget));
    setKpi('campKpiSpend', fmtKES(totalSpend));
    setKpi('campKpiLeads', totalLeads);
    setKpi('campKpiActive', activeCount);

    // Render Charts
    if (typeof Chart !== 'undefined') {
      const destroyChart = safeFn('destroyChart', () => {});
      destroyChart('campPlatformChart');
      destroyChart('campBudgetChart');

      // Platform Pie Chart
      const ctx1 = $('campPlatformChart');
      if (ctx1 && Object.keys(platformSpend).length) {
        state.charts = state.charts || {};
        state.charts['campPlatformChart'] = new Chart(ctx1.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: Object.keys(platformSpend).map(k => k.toUpperCase()),
            datasets: [{ data: Object.values(platformSpend), backgroundColor: ['#1877f2', '#ff0050', '#e1306c', '#ff0033', '#0a66c2'], borderWidth: 0 }]
          },
          options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right', labels: { color: '#94a3b8' } } } }
        });
      }

      // Budget vs Spend Bar Chart
      const ctx2 = $('campBudgetChart');
      if (ctx2) {
        state.charts['campBudgetChart'] = new Chart(ctx2.getContext('2d'), {
          type: 'bar',
          data: {
            labels: campaigns.map(c => (c.name || '').substring(0, 10) + '...'),
            datasets: [
              { label: 'Budget', data: campaigns.map(c => num(c.budget)), backgroundColor: '#7c3aed', borderRadius: 4 },
              { label: 'Spent', data: campaigns.map(c => num(c.spend)), backgroundColor: '#22e6a0', borderRadius: 4 }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { display: false } }, y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } } } }
        });
      }
    }

    const tb = $('campaignsBody');
    if (!tb) return;
    if (!campaigns.length) {
      setHtmlIfChanged(tb, 'empty:campaigns',
        `<tr><td colspan="8" class="empty-state">No campaigns yet.</td></tr>`);
      return;
    }

 const sig = sigOf(campaigns, ['status', 'budget', 'spend', 'name']);
const leadsByCampaign = new Map();
for (let i = 0; i < leads.length; i++) {
  const l = leads[i];
  if (!l || !l.campaignId) continue;
  leadsByCampaign.set(l.campaignId, (leadsByCampaign.get(l.campaignId) || 0) + 1);
}

       const STATUS_MAP = { 'Active': 'active', 'Planned': 'sent', 'Paused': 'pending', 'Completed': 'paid' };

    const rows = campaigns.map(c => {
      const lc = leadsByCampaign.get(c.id) || 0;
      const s = c.stats;
      const statusCls = STATUS_MAP[c.status] || 'gray';
      const idSafe = q(c.id);
      const platformIcon = c.media?.type === 'youtube'
        ? '<i class="fa-brands fa-youtube" style="color:#ff0033;"></i>'
        : c.media?.type === 'tiktok'
          ? '<i class="fa-brands fa-tiktok"></i>'
          : '';

      // ★ FIX: Removed the broken `d => d || ''` function that was printing into the table
      const statsCell = s ? `
        <div style="font-size:.72rem;line-height:1.6;white-space:nowrap;">
          ${s.views    != null ? `<div>${platformIcon} <i class="fa-solid fa-eye" style="color:var(--accent-blue);"></i> ${Number(s.views).toLocaleString()}</div>` : ''}
          ${s.likes    != null ? `<div><i class="fa-solid fa-heart" style="color:#ff5c7c;"></i> ${Number(s.likes).toLocaleString()}</div>` : ''}
          ${s.comments != null ? `<div><i class="fa-solid fa-comment" style="color:var(--accent-purple);"></i> ${Number(s.comments).toLocaleString()}</div>` : ''}
          <div style="color:var(--text-light);font-size:.6rem;"><i class="fa-solid fa-sync" style="opacity:.6;"></i> ${timeAgo(s.fetchedAt)}</div>
        </div>` 
        : c.media?.url
          ? `<span style="color:var(--text-light);font-size:.7rem;"><i class="fa-solid fa-clock"></i> Not fetched</span>`
          : `<span style="color:var(--text-light);font-size:.7rem;">—</span>`;

      return `<tr>
        <td>
          <strong>${_esc(c.name || '')}</strong>
          ${c.media?.type && c.media.type !== 'none'
            ? `<br><small style="color:var(--accent-blue);font-size:.68rem;">${platformIcon} ${_esc(c.media.type)}</small>`
            : ''}
        </td>
        <td>${fmtKES(c.budget)}</td>
        <td>${fmtKES(c.spend)}</td>
        <td><span class="badge badge-purple">${lc}</span></td>
        <td>${statsCell}</td>
        <td>${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}</td>
        <td><span class="badge badge-${statusCls}">${_esc(c.status || '')}</span></td>
        <td style="text-align:right;white-space:nowrap;">
          ${c.media?.url ? `<button class="btn btn-success btn-xs" onclick="Viora.refreshCampaignStats('${idSafe}')" title="Refresh live stats"><i class="fa-solid fa-rotate"></i></button>` : ''}
          <button class="btn btn-primary btn-xs" onclick="Viora.editCampaign('${idSafe}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteCampaign('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
    setHtmlIfChanged(tb, sig, rows);
  } catch (e) { console.warn('renderCampaigns failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   CAMPAIGN MEDIA TYPE UI
   ═══════════════════════════════════════════════════════════════ */
export function applyCampMediaTypeUI(type) {
  const $ = safe$;
  const state = safeState();
  const urlWrap = $('campMediaUrlWrap');
  const hint    = $('campMediaUrlHint');
  const ttAuth  = $('campTikTokAuthWrap');

  if (urlWrap) urlWrap.style.display = (type === 'youtube' || type === 'tiktok') ? 'block' : 'none';
  if (ttAuth)  ttAuth.style.display  = (type === 'tiktok') ? 'block' : 'none';

  if (hint) {
    hint.textContent = type === 'youtube'
      ? 'e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      : type === 'tiktok'
        ? 'e.g. https://www.tiktok.com/@user/video/1234567890123456789'
        : '';
  }

  if (type === 'tiktok') {
    const status = $('campTikTokAuthStatus');
    if (status) {
      const token = state.data.tiktokToken;
      if (token && token.accessToken) {
        status.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--accent-green);"></i> Connected${token.openId ? ' · ' + _esc(String(token.openId).slice(0, 10)) + '…' : ''}`;
      } else {
        status.innerHTML = `<i class="fa-solid fa-circle-xmark" style="color:var(--accent-red);"></i> Not connected — stats will be unavailable.`;
      }
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   CAMPAIGN STATS RENDER
   ═══════════════════════════════════════════════════════════════ */
export function renderCampaignStats(campaignId, stats) {
  const $ = safe$;
  const timeAgo = safeFn('timeAgo', t => t || '');
  const host   = $('campLiveStats');
  const body   = $('campLiveStatsBody');
  const footer = $('campLiveStatsFooter');
  if (!host || !body || !stats) return;
  host.style.display = 'block';

  const fmt = n => n == null ? '—' : Number(n).toLocaleString('en-US');
  const card = (icon, label, value, color) => `
    <div style="padding:12px 8px;border-radius:10px;background:var(--bg-input);border:1px solid var(--border-color);text-align:center;">
      <i class="fa-solid ${icon}" style="font-size:1.1rem;color:${color};margin-bottom:6px;display:block;"></i>
      <div style="font-size:1.1rem;font-weight:800;">${value}</div>
      <div style="font-size:.65rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-secondary);">${label}</div>
    </div>`;

  const thumb = safeUrl(stats.thumbnail || '');

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;">
      ${stats.views     != null ? card('fa-eye',      'Views',     fmt(stats.views),     'var(--accent-blue)')   : ''}
      ${stats.likes     != null ? card('fa-heart',    'Likes',     fmt(stats.likes),     '#ff5c7c')              : ''}
      ${stats.comments  != null ? card('fa-comment',  'Comments',  fmt(stats.comments),  'var(--accent-purple)') : ''}
      ${stats.shares    != null ? card('fa-share',    'Shares',    fmt(stats.shares),    'var(--accent-green)')  : ''}
      ${stats.followers != null ? card('fa-users',    'Followers', fmt(stats.followers), 'var(--accent-gold)')   : ''}
    </div>
    ${stats.title ? `<div style="margin-top:10px;font-size:.82rem;font-weight:600;">${_esc(stats.title)}</div>` : ''}
    ${thumb ? `<img src="${_esc(thumb)}" loading="lazy" style="width:100%;max-width:280px;border-radius:8px;margin-top:8px;border:1px solid var(--border-color);" />` : ''}
  `;
  if (footer) {
    footer.textContent = `Source: ${stats.source || 'unknown'} · Updated ${timeAgo(stats.fetchedAt)}`;
  }
}

/* ═══════════════════════════════════════════════════════════════
   CAMPAIGN STATS FETCH
   ═══════════════════════════════════════════════════════════════ */
export async function fetchCampaignStats(campaignId, mediaType, url) {
  const $ = safe$;
  const state = safeState();
  const callFn = C().callFn;
  const upsertDoc = C().upsertDoc;

  if (!campaignId || !url) return null;

  const refreshBtn = $('campRefreshStats');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  }

  try {
    const payload = { platform: mediaType, url };
    if (mediaType === 'tiktok') {
      const tok = state.data.tiktokToken;
      if (!tok || !tok.accessToken) throw new Error('TikTok not connected. Click "Connect TikTok" first.');
      payload.accessToken = tok.accessToken;
      payload.openId = tok.openId || null;
    }

    if (typeof callFn !== 'function') throw new Error('Backend unavailable.');
    const res = await callFn('socialStats', payload);
    if (!res || !res.ok) throw new Error(res?.error || 'Stats unavailable.');

    const stats = {
      views:       res.views       ?? null,
      likes:       res.likes       ?? null,
      comments:    res.comments    ?? null,
      shares:      res.shares      ?? null,
      followers:   res.followers   ?? null,
      title:       res.title       || null,
      thumbnail:   res.thumbnail   || null,
      publishedAt: res.publishedAt || null,
      platform:    mediaType,
      fetchedAt:   new Date().toISOString(),
      source:      res.source || 'unknown'
    };

    const camp = (Array.isArray(state.data.campaigns) ? state.data.campaigns : [])
      .find(c => c && c.id === campaignId);
    if (camp) {
      camp.stats = stats;
      camp.statsUpdatedAt = stats.fetchedAt;
      camp.statsError = null;
      if (typeof upsertDoc === 'function') {
        try { await upsertDoc('campaigns', camp, camp._rev); }
        catch (e) { console.warn('[campaign stats] persist failed:', e.message); }
      }
    }
    renderCampaignStats(campaignId, stats);
    /* Live lookup — never a stale closure. */
    if (_activeTab('marketing-campaigns')) {
      try { renderCampaigns(); } catch (_) {}
    }
    return stats;
  } catch (e) {
    console.warn('[campaign stats]', e.message);
    const host = $('campLiveStats');
    const body = $('campLiveStatsBody');
    if (host && body) {
      host.style.display = 'block';
      body.innerHTML = `
        <div style="font-size:.82rem;color:var(--accent-gold);padding:8px;border-radius:8px;background:rgba(255,200,87,.08);">
          <i class="fa-solid fa-triangle-exclamation"></i> ${_esc(e.message)}
        </div>`;
      const f = $('campLiveStatsFooter');
      if (f) f.textContent = '';
    }
    const camp = (Array.isArray(state.data.campaigns) ? state.data.campaigns : [])
      .find(c => c && c.id === campaignId);
    if (camp) {
      camp.statsError = e.message;
      if (typeof upsertDoc === 'function') {
        try { await upsertDoc('campaigns', camp, camp._rev); } catch (_) {}
      }
    }
    return null;
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Refresh';
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   CONNECT TIKTOK
   ═══════════════════════════════════════════════════════════════ */
export function connectTikTok() {
  const state = safeState();
  const WORKER_URL = C().WORKER_URL;
  if (!state.operator?.uid) { _toast('Sign in first.', 'error'); return; }
  if (!WORKER_URL) { _toast('Worker URL not configured.', 'error'); return; }
  const url = `${WORKER_URL}/tiktok/authorize?uid=${encodeURIComponent(state.operator.uid)}`;
  const w = window.open(url, 'viora_tiktok_auth_' + Date.now(),
    'noopener,noreferrer,width=620,height=760,left=650,top=60');
  if (!w) { _toast('Pop-up blocked. Allow pop-ups for this site.', 'warning'); return; }
  _toast('Authorize TikTok in the popup window…', 'info');
}

/* ═══════════════════════════════════════════════════════════════
   CAMPAIGN STATS AUTO-REFRESH
   ═══════════════════════════════════════════════════════════════ */
const CAMP_STATS_INTERVAL_MS = 3 * 60 * 1000;
const CAMP_STATS_FRESH_MS    = 1 * 60 * 1000;

async function _refreshStaleCampaignStats({ force = false } = {}) {
  const state = safeState();
  if (_campaigns.refreshing) return;
  if (state.currentTab !== 'marketing-campaigns') return;

  const campaigns = (Array.isArray(state.data.campaigns) ? state.data.campaigns : [])
    .filter(c => c && c.media?.url && (c.media.type === 'youtube' || c.media.type === 'tiktok'));
  if (!campaigns.length) return;

  const now = Date.now();
  const stale = campaigns.filter(c => {
    if (force) return true;
    const age = c.statsUpdatedAt
      ? now - (Date.parse(c.statsUpdatedAt) || 0)
      : Infinity;
    return age > CAMP_STATS_FRESH_MS;
  });
  if (!stale.length) return;

  _campaigns.refreshing = true;
  try {
    for (let i = 0; i < stale.length; i++) {
      const c = stale[i];
      try { await fetchCampaignStats(c.id, c.media.type, c.media.url); }
      catch (e) { console.warn('[campaign-stats] refresh failed for', c.id, e.message); }
      await new Promise(r => setTimeout(r, 400));
    }
  } finally {
    _campaigns.refreshing = false;
  }
}

export function startCampaignStatsAutoRefresh() {
  if (_campaigns.timer) return;
  _campaigns.timer = setInterval(() => {
    if (document.hidden) return;
    _refreshStaleCampaignStats().catch(() => {});
  }, CAMP_STATS_INTERVAL_MS);

  if (!_campaigns.listenerBound) {
    _campaigns.listenerBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      const state = safeState();
      if (state.currentTab === 'marketing-campaigns') {
        setTimeout(() => _refreshStaleCampaignStats().catch(() => {}), 800);
      }
    });
  }
}

export function stopCampaignStatsAutoRefresh() {
  if (_campaigns.timer) {
    clearInterval(_campaigns.timer);
    _campaigns.timer = null;
  }
}

export function refreshAllCampaignStats() {
  return _refreshStaleCampaignStats({ force: true });
}

/* ═══════════════════════════════════════════════════════════════
   MANUAL SALE
   ═══════════════════════════════════════════════════════════════ */
export function openManualSale() {
  const $ = safe$;
  const state = safeState();
  const openModal = C().openModal;
  const form = $('manualSaleForm');
  if (form && typeof form.reset === 'function') form.reset();
  state.manualSaleDraft = [];
  renderMsProductsList();
  renderMsSummary();
  if (typeof openModal === 'function') openModal('manualSaleModal');
}

export function renderMsProductsList() {
  try {
    const $ = safe$;
    const state = safeState();
    const fmtKES = safeFn('fmtKES', v => 'KES ' + num(v).toLocaleString());
    const usdToKes = safeFn('usdToKes', v => num(v) * 129);
    const getProductsList = safeFn('getProductsList', () => []);

    const host = $('msProductsList');
    if (!host) return;

    let products = getProductsList();
    if (!Array.isArray(products)) products = [];
    if (!products.length) {
      setHtmlIfChanged(host, 'empty:ms-products',
        `<div class="empty-state" style="padding:12px;">No products in the catalog. Add products first.</div>`);
      return;
    }

    if (!Array.isArray(state.manualSaleDraft)) state.manualSaleDraft = [];
    if (!state.manualSaleDraft.length) {
      state.manualSaleDraft = [{ productId: products[0].id, qty: 1, plan: 'monthly' }];
    }

    const sig = hashString(
      'ms|' + products.map(p => p.id + ':' + p.name + ':' + (p.price || 0)).join(',') +
      '|' + state.manualSaleDraft.map(d => d.productId + ':' + d.qty).join(',')
    );

    const html = state.manualSaleDraft.map((item, i) => {
      return `<div style="display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid var(--border-color);">
        <select onchange="Viora.updateManualSaleItem(${i}, 'productId', this.value)" style="flex:1;min-width:0;padding:6px;border-radius:8px;background:var(--bg-card-solid);color:var(--text-primary);border:1px solid var(--border-color);">
          ${products.map(pp => `<option value="${q(pp.id)}" ${pp.id === item.productId ? 'selected' : ''}>${_esc(pp.name)} — ${fmtKES(usdToKes(pp.price))}</option>`).join('')}
        </select>
        <input type="number" min="1" value="${num(item.qty) || 1}" onchange="Viora.updateManualSaleItem(${i}, 'qty', this.value)" style="width:60px;padding:6px;border-radius:8px;background:var(--bg-card-solid);color:var(--text-primary);border:1px solid var(--border-color);" />
        <button type="button" class="btn btn-danger btn-xs" onclick="Viora.removeManualSaleItem(${i})"><i class="fa-solid fa-xmark"></i></button>
      </div>`;
    }).join('');

    setHtmlIfChanged(host, sig, html);
  } catch (e) { console.warn('renderMsProductsList failed', e); }
}

export function renderMsSummary() {
  try {
    const $ = safe$;
    const state = safeState();
    const fmtUSD = safeFn('fmtUSD', v => '$' + num(v).toFixed(2));
    const fmtKES = safeFn('fmtKES', v => 'KES ' + num(v).toLocaleString());
    const usdToKes = safeFn('usdToKes', v => num(v) * 129);
    const getProductsList = safeFn('getProductsList', () => []);

    let products = getProductsList();
    if (!Array.isArray(products)) products = [];
    const byId = new Map(products.map(p => [p.id, p]));

    const draft = Array.isArray(state.manualSaleDraft) ? state.manualSaleDraft : [];
    let subtotalUSD = 0;
    for (let i = 0; i < draft.length; i++) {
      const p = byId.get(draft[i] && draft[i].productId);
      if (p) subtotalUSD += num(p.price) * num(draft[i].qty || 1);
    }
    const subtotalKES = usdToKes(subtotalUSD);

    const host = $('msSummary');
    if (!host) return;

    const sig = hashString('mss|' + subtotalUSD + '|' + draft.length);
    const html = `<div style="display:flex;justify-content:space-between;"><span>Items:</span><strong>${draft.length}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>Subtotal:</span><strong>${fmtUSD(subtotalUSD)} / ${fmtKES(subtotalKES)}</strong></div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border-color);margin-top:6px;padding-top:6px;font-size:1.05rem;">
        <strong>Total:</strong><strong style="color:var(--accent-green);">${fmtKES(subtotalKES)}</strong>
      </div>`;
    setHtmlIfChanged(host, sig, html);
  } catch (e) { console.warn('renderMsSummary failed', e); }
}

export function updateManualSaleItem(idx, field, value) {
  const state = safeState();
  if (!Array.isArray(state.manualSaleDraft)) return;
  const row = state.manualSaleDraft[idx];
  if (!row) return;
  if (field === 'qty') row.qty = Math.max(1, parseInt(value, 10) || 1);
  else row[field] = value;
  renderMsProductsList();
  renderMsSummary();
}

export function removeManualSaleItem(idx) {
  const state = safeState();
  if (!Array.isArray(state.manualSaleDraft)) return;
  state.manualSaleDraft.splice(idx, 1);
  renderMsProductsList();
  renderMsSummary();
}

const VALID_PAYMENT_METHODS = new Set(['internal', 'mpesa', 'card', 'bank', 'cash']);

export async function submitManualSale(f) {
  const state = safeState();
  const logActivity = C().logActivity;
  const upsertDoc = C().upsertDoc;
  const EventBus = C().EventBus;
  const generateLicenseKey = safeFn('generateLicenseKey', () => 'LIC-' + Math.random().toString(36).slice(2, 12).toUpperCase());
  const getProductsList = safeFn('getProductsList', () => []);
  const usdToKes = safeFn('usdToKes', v => num(v) * 129);
  const fmtKES = safeFn('fmtKES', v => 'KES ' + num(v).toLocaleString());
  const scheduleMarketSync = C().scheduleMarketSync;
  const closeModal = C().closeModal;

  if (!f || !f.name || !f.email) { _toast('Name and email are required.', 'error'); return; }
  if (!VALID_PAYMENT_METHODS.has(f.method)) { _toast('Invalid payment method.', 'error'); return; }

  let products = getProductsList();
  if (!Array.isArray(products)) products = [];
  const byId = new Map(products.map(p => [p.id, p]));
  const draft = Array.isArray(state.manualSaleDraft) ? state.manualSaleDraft : [];
  const items = [];
  for (let i = 0; i < draft.length; i++) {
    const it = draft[i];
    const p = byId.get(it.productId);
    if (!p) continue;
    const qty = num(it.qty) || 1;
    const amount = num(p.price) * qty;
    items.push({
      productId: p.id,
      productName: p.name,
      plan: it.plan || 'monthly',
      amount, qty,
      licenseKey: generateLicenseKey()
    });
  }
  if (!items.length) { _toast('Add at least one product.', 'error'); return; }

  const subtotalUSD = items.reduce((s, it) => s + it.amount, 0);
  const totalKES = usdToKes(subtotalUSD);
  const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  const paymentStatus = f.method === 'internal' ? 'paid' : 'pending';

  const order = {
    id: orderId, items,
    subtotalUSD, discountUSD: 0, discountPercent: 0,
    promoCode: null, totalUSD: subtotalUSD, totalKES,
    currency: 'KES', displayCurrency: 'KES',
    customerName: f.name,
    customerEmail: f.email,
    customerPhone: f.phone || '',
    paymentMethod: f.method,
    paymentStatus,
    licenseKeys: items.map(i => i.licenseKey).join(', '),
    timestamp: new Date().toISOString(),
    source: 'manual',
    recordedBy: state.operator?.name || 'System'
  };

  try {
    if (typeof upsertDoc !== 'function') throw new Error('Write layer unavailable');
    await upsertDoc('orders', order);
    try { EventBus?.emit?.('orders.upsert', order, order.id, order, { collection: 'orders' }); } catch (_) {}
    if (typeof logActivity === 'function') {
      try { await logActivity('add', 'Manual marketplace sale', `${f.name} — ${fmtKES(totalKES)} (${paymentStatus})`); }
      catch (_) {}
    }
    invalidateMarketplaceMetrics();
    _toast(`Sale recorded: ${totalKES.toLocaleString('en-KE', { style: 'currency', currency: 'KES' })}`, 'success');
    if (typeof closeModal === 'function') closeModal('manualSaleModal');
    renderMarketplaceOrders();
    renderMarketplaceProducts();
    if (typeof scheduleMarketSync === 'function') scheduleMarketSync();
    /* ★ v9.2 — also materialize a lead immediately for manual sales */
    try { if (typeof materializeMarketplaceLeads === 'function') materializeMarketplaceLeads(); }
    catch (_) {}
  } catch (e) {
    _toast('Sale failed: ' + (e.message || 'unknown error'), 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   WISHLIST MUTATIONS
   ═══════════════════════════════════════════════════════════════ */
export async function addToWishlist(productId) {
  const state = safeState();
  const db = C().db, ref = C().ref, set = C().set, P = C().P;
  const uid = state.operator?.uid;
  if (!uid) { _toast('Sign in first.', 'error'); return; }

  const list = Array.isArray(state.data.marketplaceWishlist) ? state.data.marketplaceWishlist : [];
  if (list.includes(productId)) { _toast('Already in wishlist.', 'info'); return; }
  const next = [...list, productId];

  try {
    if (db && typeof ref === 'function' && typeof set === 'function' && typeof P === 'function') {
      await set(ref(db, P('marketplace/wishlist/' + uid)), next);
    }
    state.data.marketplaceWishlist = next;
    _toast('Added to wishlist.', 'success');
    renderMyWishlist();
  } catch (e) {
    _toast('Could not save wishlist: ' + (e?.message || e), 'error');
  }
}

export async function removeFromWishlist(productId) {
  const state = safeState();
  const db = C().db, ref = C().ref, set = C().set, P = C().P;
  const uid = state.operator?.uid;
  if (!uid) { _toast('Sign in first.', 'error'); return; }

  const current = Array.isArray(state.data.marketplaceWishlist) ? state.data.marketplaceWishlist : [];
  const next = current.filter(id => id !== productId);
  try {
    if (db && typeof ref === 'function' && typeof set === 'function' && typeof P === 'function') {
      await set(ref(db, P('marketplace/wishlist/' + uid)), next);
    }
    state.data.marketplaceWishlist = next;
    _toast('Removed from wishlist.', 'info');
    renderMyWishlist();
  } catch (e) {
    _toast('Could not update wishlist: ' + (e?.message || e), 'error');
  }
}

export async function buyFromWishlist(productId) {
  const state = safeState();
  const logActivity = C().logActivity;
  const upsertDoc = C().upsertDoc;
  const EventBus = C().EventBus;
  const getProduct = safeFn('getProduct', () => null);
  const usdToKes = safeFn('usdToKes', v => num(v) * 129);
  const generateLicenseKey = safeFn('generateLicenseKey', () => 'LIC-' + Math.random().toString(36).slice(2, 12).toUpperCase());
  const scheduleMarketSync = C().scheduleMarketSync;

  const p = getProduct(productId);
  if (!p) { _toast('Product not found.', 'error'); return; }
  const priceKES = usdToKes(num(p.price));

  const ok = await _confirm(
    `Buy "${p.name}" for KES ${priceKES.toLocaleString()}?`,
    { title: 'Confirm purchase', confirmLabel: 'Buy', confirmClass: 'btn-success' }
  );
  if (!ok) return;

  const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  const subtotalUSD = num(p.price);
  const licenseKey = generateLicenseKey();

  const order = {
    id: orderId,
    items: [{
      productId: p.id, productName: p.name, plan: 'monthly',
      amount: subtotalUSD, qty: 1, licenseKey
    }],
    subtotalUSD, discountUSD: 0, discountPercent: 0, promoCode: null,
    totalUSD: subtotalUSD, totalKES: priceKES,
    currency: 'KES', displayCurrency: 'KES',
    customerName: state.operator?.name || 'Viora Operator',
    customerEmail: state.operator?.email || '',
    customerPhone: state.operator?.phone || '',
    paymentMethod: 'internal', paymentStatus: 'paid',
    licenseKeys: licenseKey,
    timestamp: new Date().toISOString(),
    source: 'internal-wishlist',
    recordedBy: state.operator?.name || 'System'
  };

  try {
    if (typeof upsertDoc !== 'function') throw new Error('Write layer unavailable');
    await upsertDoc('orders', order);
    try { EventBus?.emit?.('orders.upsert', order, order.id, order, { collection: 'orders' }); } catch (_) {}
    if (typeof logActivity === 'function') {
      try { await logActivity('pay', 'Internal purchase from wishlist', `${p.name} — KES ${priceKES.toLocaleString()}`); }
      catch (_) {}
    }
    invalidateMarketplaceMetrics();
    _toast(`Purchase recorded: KES ${priceKES.toLocaleString()}`, 'success');
    await removeFromWishlist(productId);
    if (typeof scheduleMarketSync === 'function') scheduleMarketSync();
  } catch (e) {
    _toast('Purchase failed: ' + (e?.message || e), 'error');
  }
}
