/* ═══════════════════════════════════════════════════════════════
   VIORA — MARKETPLACE CONTENT EDITOR  v2
   Extracted from main.js (Phase 7)
   Handles: the marketplace storefront content editor on the
   `market-content` tab — hero, featured product, stats, trust
   badges, testimonials, FAQs, steps, footer, promo codes,
   + PRODUCT EXTRAS and FULL PROMO CODES (v2 additions).

   Depends on: injected deps — see initMarketContent()
   ═══════════════════════════════════════════════════════════════ */

/* ── Injected dependencies ── */
let D = {
  // Firebase
  db: null, ref: null, set: null, P: null,
  // State
  state: null,
  // UI
  toast: null, logActivity: null, escapeHtml: null, $: null,
};

export function initMarketContent(d) {
  D = { ...D, ...d };
}

/* ═══════════════════════════════════════════════════════════════
   DEFAULTS
   ═══════════════════════════════════════════════════════════════ */
export const MARKET_DEFAULTS = {
  heroBadge: 'Powered by Viora Intercollective',
  heroLive: 'Live',
  heroTitle1: 'Software Licenses',
  heroTitle2: 'That Power Your Business',
  heroSub: 'Instant access to premium software tools — prices displayed in your local currency.',
  heroBtn1: 'Browse Products',
  heroBtn2: 'How It Works',
  statProducts: 'auto',
  statProductsLabel: 'Products',
  statClients: '128',
  statClientsLabel: 'Happy Clients',
  statProjects: 'auto',
  statProjectsLabel: 'Live Projects',
  featuredLabel: 'Most Popular',
  featuredProductId: '',
  featuredTitle: 'Complete Bundle',
  featuredPrice: 35000,
  featuredNote: 'One-time payment',
  featuredFeatures: ['All Viora apps included', 'Priority support', 'Instantly delivered'],
  featuredBtn: 'Buy Modules',
  floatChips: [
    { icon: 'fa-solid fa-circle-check', text: 'Instant delivery' },
    { icon: 'fa-solid fa-star', text: '4.9/5 rating' },
    { icon: 'fa-solid fa-shield-halved', text: 'Secure checkout' }
  ],
  announcements: [],
  trustItems: [],
  testimonials: [],
  faqs: [],
  steps: [
    { title: 'Choose a License', body: 'Browse the catalog, pick your products, and add them to your cart.' },
    { title: 'Choose a payment method', body: 'Available payment methods and final settlement details are confirmed at checkout.' },
    { title: 'Instant Delivery', body: 'Your license keys and download links are delivered immediately to your email inbox.' },
    { title: 'System Synced', body: 'The Viora system automatically records every purchase in its live dashboard.' }
  ],
  productsSubtitle: 'Our Catalog',
  productsHeading: 'Product UI Systems',
  productsDesc: 'Browse by category or search. Add items to cart, then choose an available payment method at checkout.',
  publicSubtitle: 'From the Viora Ecosystem',
  publicHeading: 'Public UI Platform',
  publicDesc: 'Explore live ventures from across the Viora Collective.',
  howSubtitle: 'Simple Process',
  howHeading: 'How It Works',
  faqSubtitle: 'Questions',
  faqHeading: 'Frequently Asked',
  newsletterHeading: 'Stay in the loop',
  newsletterDesc: 'Get notified about new products and exclusive local-currency offers.',
  brandName: 'VIORA Marketplace',
  brandAccent: '#00e0ff',
  footerBrand: 'VIORA Marketplace',
  footerText: 'Explore software licenses with prices displayed in your local currency.',
  whatsApp: '254713428774',
  footerEmail: 'cliff254johns@gmail.com',
  promoCodes: { 'VIORA10': 10, 'LAUNCH15': 15, 'KES5': 5 }
};

/* ═══════════════════════════════════════════════════════════════
   ATTRIBUTE-SAFE ESCAPE
   ═══════════════════════════════════════════════════════════════ */
function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ═══════════════════════════════════════════════════════════════
   LIST EQUALITY CHECK
   ═══════════════════════════════════════════════════════════════ */
function sameList(a, b, keys) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      if ((a[i]?.[key] ?? '') !== (b[i]?.[key] ?? '')) return false;
    }
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════════
   CACHED DOM REFS
   ═══════════════════════════════════════════════════════════════ */
const REF = {};

function cacheRefs() {
  const ids = [
    'mcHeroBadge', 'mcHeroLive', 'mcHeroTitle1', 'mcHeroTitle2', 'mcHeroSub', 'mcHeroBtn1', 'mcHeroBtn2',
    'mcStatProducts', 'mcStatProductsLabel', 'mcStatClients', 'mcStatClientsLabel',
    'mcStatProjects', 'mcStatProjectsLabel',
    'mcFeaturedLabel', 'mcFeaturedProductId', 'mcFeaturedTitle', 'mcFeaturedPrice',
    'mcFeaturedNote', 'mcFeaturedFeatures', 'mcFeaturedBtn',
    'mcChip1Icon', 'mcChip1Text', 'mcChip2Icon', 'mcChip2Text', 'mcChip3Icon', 'mcChip3Text',
    'mcAnnouncements',
    'mcProductsSubtitle', 'mcProductsHeading', 'mcProductsDesc',
    'mcPublicSubtitle', 'mcPublicHeading', 'mcPublicDesc',
    'mcHowSubtitle', 'mcHowHeading', 'mcFaqSubtitle', 'mcFaqHeading',
    'mcNewsletterHeading', 'mcNewsletterDesc',
    'mcBrandName', 'mcBrandAccent', 'mcFooterBrand', 'mcFooterText',
    'mcWhatsApp', 'mcFooterEmail',
    'mcTrustList', 'mcTestiList', 'mcFaqList', 'mcStepsList',
    'mcAddTrustBtn', 'mcAddTestiBtn', 'mcAddFaqBtn', 'mcAddStepBtn',
    'saveMarketContentBtn',

    /* ➕ NEW refs — promo editor */
    'mcPromoList', 'mcAddPromoBtn', 'savePromosBtn', 'promosSaveStatus',

    /* ➕ NEW refs — product extras editor */
    'mcExtrasProductSelect', 'mcExtrasType', 'mcExtrasDemoUrl', 'mcExtrasGallery',
    'mcExtrasCtaLabel', 'mcExtrasFaqList', 'mcAddExtrasFaqBtn',
    'saveProductExtrasBtn', 'extrasSaveStatus', 'mcExtrasEmptyHint'
  ];
  for (let i = 0; i < ids.length; i++) {
    REF[ids[i]] = document.getElementById(ids[i]);
  }
}

/* ═══════════════════════════════════════════════════════════════
   RENDER — top-level
   ═══════════════════════════════════════════════════════════════ */
export function renderMarketContent() {
  const host = document.getElementById('market-content');
  if (host && !host.offsetParent) return;

  if (!REF.mcHeroBadge) cacheRefs();

  const c = D.state?.data?.marketContent || {};
  const merged = { ...MARKET_DEFAULTS, ...c };

  const set = (id, val) => {
    const el = REF[id] || (REF[id] = document.getElementById(id));
    if (el && el.value !== String(val ?? '')) el.value = val ?? '';
  };

  set('mcHeroBadge',  merged.heroBadge);
  set('mcHeroLive',   merged.heroLive);
  set('mcHeroTitle1', merged.heroTitle1);
  set('mcHeroTitle2', merged.heroTitle2);
  set('mcHeroSub',    merged.heroSub);
  set('mcHeroBtn1',   merged.heroBtn1);
  set('mcHeroBtn2',   merged.heroBtn2);

  set('mcStatProducts',      merged.statProducts);
  set('mcStatProductsLabel', merged.statProductsLabel);
  set('mcStatClients',       merged.statClients);
  set('mcStatClientsLabel',  merged.statClientsLabel);
  set('mcStatProjects',      merged.statProjects);
  set('mcStatProjectsLabel', merged.statProjectsLabel);

  set('mcFeaturedLabel',     merged.featuredLabel);
  set('mcFeaturedProductId', merged.featuredProductId);
  set('mcFeaturedTitle',     merged.featuredTitle);
  set('mcFeaturedPrice',     merged.featuredPrice);
  set('mcFeaturedNote',      merged.featuredNote);
  set('mcFeaturedFeatures',  (merged.featuredFeatures || []).join('\n'));
  set('mcFeaturedBtn',       merged.featuredBtn);

  const chips = merged.floatChips || MARKET_DEFAULTS.floatChips;
  set('mcChip1Icon', chips[0]?.icon || '');
  set('mcChip1Text', chips[0]?.text || '');
  set('mcChip2Icon', chips[1]?.icon || '');
  set('mcChip2Text', chips[1]?.text || '');
  set('mcChip3Icon', chips[2]?.icon || '');
  set('mcChip3Text', chips[2]?.text || '');

  set('mcAnnouncements', (merged.announcements || []).join('\n'));

  set('mcProductsSubtitle', merged.productsSubtitle);
  set('mcProductsHeading',  merged.productsHeading);
  set('mcProductsDesc',     merged.productsDesc);
  set('mcPublicSubtitle',   merged.publicSubtitle);
  set('mcPublicHeading',    merged.publicHeading);
  set('mcPublicDesc',       merged.publicDesc);
  set('mcHowSubtitle',      merged.howSubtitle);
  set('mcHowHeading',       merged.howHeading);
  set('mcFaqSubtitle',      merged.faqSubtitle);
  set('mcFaqHeading',       merged.faqHeading);

  set('mcNewsletterHeading', merged.newsletterHeading);
  set('mcNewsletterDesc',    merged.newsletterDesc);

  set('mcBrandName',   merged.brandName);
  set('mcBrandAccent', merged.brandAccent);
  set('mcFooterBrand', merged.footerBrand);
  set('mcFooterText',  merged.footerText);

  set('mcWhatsApp',    merged.whatsApp);
  set('mcFooterEmail', merged.footerEmail);

  // Sub-lists — skip-if-equal.
  renderList('__mcTrust', 'mcTrustList', merged.trustItems || [], ['icon', 'text'], drawTrust);
  renderList('__mcTesti', 'mcTestiList', merged.testimonials || [], ['name', 'role', 'text'], drawTesti);
  renderList('__mcFaq',   'mcFaqList',   merged.faqs || [], ['q', 'a'], drawFaq);
  renderList('__mcSteps', 'mcStepsList', merged.steps || MARKET_DEFAULTS.steps, ['title', 'body'], drawSteps);

  /* ➕ NEW — render promo + extras sections */
  renderPromoSection();
  renderExtrasSection();
}

/* ═══════════════════════════════════════════════════════════════
   GENERIC LIST RENDERER
   ═══════════════════════════════════════════════════════════════ */
function renderList(globalName, hostId, incoming, keys, drawFn) {
  const host = REF[hostId] || (REF[hostId] = document.getElementById(hostId));
  if (!host) return;

  const live = window[globalName];
  if (Array.isArray(live) && sameList(live, incoming, keys)) {
    host.__draw = drawFn;
    return;
  }

  window[globalName] = incoming.slice();
  host.__keys = keys;
  host.__draw = drawFn;
  drawFn(host, window[globalName]);
}

/* ═══════════════════════════════════════════════════════════════
   INDIVIDUAL DRAW FUNCTIONS
   ═══════════════════════════════════════════════════════════════ */
function drawTrust(host, list) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const row = document.createElement('div');
    row.className = 'mc-row';
    row.innerHTML =
      `<input class="mc-input mc-input-icon" data-i="${i}" data-k="icon" value="${escAttr(t.icon)}" placeholder="fa-solid fa-star">` +
      `<input class="mc-input mc-input-flex" data-i="${i}" data-k="text" value="${escAttr(t.text)}" placeholder="Text">` +
      `<button type="button" class="btn btn-danger btn-xs" data-del="${i}"><i class="fa-solid fa-xmark"></i></button>`;
    frag.appendChild(row);
  }
  host.replaceChildren(frag);
}

function drawTesti(host, list) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const box = document.createElement('div');
    box.className = 'mc-card';
    box.innerHTML =
      `<div class="mc-row">` +
        `<input class="mc-input mc-input-flex" data-i="${i}" data-k="name" value="${escAttr(t.name)}" placeholder="Name">` +
        `<input class="mc-input mc-input-flex2" data-i="${i}" data-k="role" value="${escAttr(t.role)}" placeholder="Role · Company">` +
        `<button type="button" class="btn btn-danger btn-xs" data-del="${i}"><i class="fa-solid fa-xmark"></i></button>` +
      `</div>` +
      `<textarea class="mc-input mc-input-full" data-i="${i}" data-k="text" rows="2">${escAttr(t.text)}</textarea>`;
    frag.appendChild(box);
  }
  host.replaceChildren(frag);
}

function drawFaq(host, list) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const box = document.createElement('div');
    box.className = 'mc-card';
    box.innerHTML =
      `<div class="mc-row">` +
        `<input class="mc-input mc-input-flex" data-i="${i}" data-k="q" value="${escAttr(f.q)}" placeholder="Question">` +
        `<button type="button" class="btn btn-danger btn-xs" data-del="${i}"><i class="fa-solid fa-xmark"></i></button>` +
      `</div>` +
      `<textarea class="mc-input mc-input-full" data-i="${i}" data-k="a" rows="2">${escAttr(f.a)}</textarea>`;
    frag.appendChild(box);
  }
  host.replaceChildren(frag);
}

function drawSteps(host, list) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const box = document.createElement('div');
    box.className = 'mc-card';
    box.innerHTML =
      `<div class="mc-row">` +
        `<input class="mc-input mc-input-flex" data-i="${i}" data-k="title" value="${escAttr(s.title)}" placeholder="Step title">` +
        `<button type="button" class="btn btn-danger btn-xs" data-del="${i}"><i class="fa-solid fa-xmark"></i></button>` +
      `</div>` +
      `<textarea class="mc-input mc-input-full" data-i="${i}" data-k="body" rows="2" placeholder="Description">${escAttr(s.body)}</textarea>`;
    frag.appendChild(box);
  }
  host.replaceChildren(frag);
}

/* ═══════════════════════════════════════════════════════════════
   ➕ NEW — PROMO SECTION
   Renders and edits `promos/{CODE}` on Firebase.
   Source of truth: D.state.data.promos (loaded by main system).
   Each row supports: code, percent, flatKes, minSpendKes,
   maxUses, usedCount, expiresAt, productIds (comma), active.
   ═══════════════════════════════════════════════════════════════ */

function promosToRows(promosObj) {
  if (!promosObj || typeof promosObj !== 'object') return [];
  return Object.entries(promosObj).map(([code, p]) => ({
    code,
    percent: Number(p?.percent) || 0,
    flatKes: Number(p?.flatKes) || 0,
    minSpendKes: Number(p?.minSpendKes) || 0,
    maxUses: Number(p?.maxUses) || 0,
    usedCount: Number(p?.usedCount) || 0,
    expiresAt: p?.expiresAt || '',
    productIds: Array.isArray(p?.productIds) ? p.productIds.join(', ') : '',
    active: p?.active !== false
  }));
}

function drawPromoRow(row, i) {
  const box = document.createElement('div');
  box.className = 'mc-card mc-promo-card';
  box.innerHTML =
    `<div class="mc-row">` +
      `<input class="mc-input mc-input-code" data-i="${i}" data-k="code" value="${escAttr(row.code)}" placeholder="CODE" style="text-transform:uppercase;font-family:monospace;font-weight:700;">` +
      `<label class="mc-toggle" style="display:flex;align-items:center;gap:.4rem;font-size:.78rem;color:var(--text-secondary);">` +
        `<input type="checkbox" data-i="${i}" data-k="active" ${row.active ? 'checked' : ''}> Active` +
      `</label>` +
      `<button type="button" class="btn btn-danger btn-xs" data-del="${i}" style="margin-left:auto;"><i class="fa-solid fa-xmark"></i></button>` +
    `</div>` +
    `<div class="mc-row" style="margin-top:.5rem;">` +
      `<label style="font-size:.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;">% off</label>` +
      `<input type="number" class="mc-input" data-i="${i}" data-k="percent" value="${escAttr(row.percent)}" placeholder="0" min="0" max="100" style="max-width:90px;">` +
      `<label style="font-size:.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;">Flat KSh</label>` +
      `<input type="number" class="mc-input" data-i="${i}" data-k="flatKes" value="${escAttr(row.flatKes)}" placeholder="0" min="0" style="max-width:110px;">` +
      `<label style="font-size:.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;">Min spend KSh</label>` +
      `<input type="number" class="mc-input" data-i="${i}" data-k="minSpendKes" value="${escAttr(row.minSpendKes)}" placeholder="0" min="0" style="max-width:120px;">` +
    `</div>` +
    `<div class="mc-row" style="margin-top:.5rem;">` +
      `<label style="font-size:.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;">Max uses</label>` +
      `<input type="number" class="mc-input" data-i="${i}" data-k="maxUses" value="${escAttr(row.maxUses)}" placeholder="0 = unlimited" min="0" style="max-width:130px;">` +
      `<label style="font-size:.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;">Used</label>` +
      `<input type="number" class="mc-input" data-i="${i}" data-k="usedCount" value="${escAttr(row.usedCount)}" placeholder="0" min="0" readonly style="max-width:90px;opacity:.7;">` +
      `<label style="font-size:.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;">Expires</label>` +
      `<input type="date" class="mc-input" data-i="${i}" data-k="expiresAt" value="${escAttr(row.expiresAt ? String(row.expiresAt).slice(0, 10) : '')}" style="max-width:150px;">` +
    `</div>` +
    `<div class="mc-row" style="margin-top:.5rem;">` +
      `<input class="mc-input mc-input-flex" data-i="${i}" data-k="productIds" value="${escAttr(row.productIds)}" placeholder="Product IDs (comma-separated, optional — leave blank for all)">` +
    `</div>`;
  return box;
}

function renderPromoSection() {
  const host = REF.mcPromoList || (REF.mcPromoList = document.getElementById('mcPromoList'));
  if (!host) return;

  // Source of truth: D.state.data.promos (from main system).
  const source = D.state?.data?.promos || {};
  const rows = promosToRows(source);

  // Preserve in-flight edits if user typed without saving:
  if (Array.isArray(window.__mcPromos) && window.__mcPromos._dirty) {
    drawPromoHost(host, window.__mcPromos);
    return;
  }

  window.__mcPromos = rows;
  drawPromoHost(host, rows);
}

function drawPromoHost(host, rows) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < rows.length; i++) {
    frag.appendChild(drawPromoRow(rows[i], i));
  }
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'mc-empty';
    empty.style.cssText = 'padding:1rem;text-align:center;color:var(--text-muted);font-size:.85rem;';
    empty.textContent = 'No promo codes yet. Click "Add Promo Code" to create one.';
    frag.appendChild(empty);
  }
  host.replaceChildren(frag);
  host.__draw = (h, l) => drawPromoHost(h, l);
}

/* Bind promo list inputs — delegate once */
function bindPromoDelegation() {
  const host = REF.mcPromoList || (REF.mcPromoList = document.getElementById('mcPromoList'));
  if (!host || host.__promoDelegated) return;
  host.__promoDelegated = true;

  host.addEventListener('input', (e) => {
    const el = e.target;
    const i = el.dataset?.i;
    const k = el.dataset?.k;
    if (i == null || !k) return;
    const arr = window.__mcPromos;
    if (!Array.isArray(arr) || !arr[+i]) return;
    if (k === 'active') arr[+i][k] = !!el.checked;
    else if (['percent', 'flatKes', 'minSpendKes', 'maxUses', 'usedCount'].includes(k)) {
      const n = Number(el.value);
      arr[+i][k] = Number.isFinite(n) ? n : 0;
    }
    else if (k === 'code') arr[+i][k] = String(el.value || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    else arr[+i][k] = el.value;
    arr._dirty = true;
  });

  host.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset?.k === 'active') {
      const i = el.dataset.i;
      const arr = window.__mcPromos;
      if (Array.isArray(arr) && arr[+i]) {
        arr[+i].active = !!el.checked;
        arr._dirty = true;
      }
    }
  });

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const i = +btn.dataset.del;
    const arr = window.__mcPromos;
    if (!Array.isArray(arr)) return;
    arr.splice(i, 1);
    arr._dirty = true;
    if (host.__draw) host.__draw(host, arr);
  });
}

/* Save promos → Firebase `promos/` node (full replace) */
export async function savePromos() {
  if (!REF.mcPromoList) cacheRefs();
  const arr = window.__mcPromos;
  if (!Array.isArray(arr)) {
    D.toast('Nothing to save — no promo rows loaded.', 'warning');
    return;
  }

  const btn = REF.savePromosBtn;
  const status = REF.promosSaveStatus;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }
  if (status) { status.textContent = ''; status.style.color = ''; }

  // Build object keyed by CODE.
  const promos = {};
  const seen = new Set();
  for (const row of arr) {
    const code = String(row.code || '').trim().toUpperCase();
    if (!code) continue;
    if (seen.has(code)) {
      D.toast(`Duplicate promo code: ${code}`, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Promo Codes'; }
      return;
    }
    seen.add(code);

    const entry = {
      active: row.active !== false
    };
    if (Number(row.percent) > 0) entry.percent = Math.min(100, Math.max(0, Number(row.percent)));
    if (Number(row.flatKes) > 0) entry.flatKes = Math.max(0, Number(row.flatKes));
    if (Number(row.minSpendKes) > 0) entry.minSpendKes = Math.max(0, Number(row.minSpendKes));
    if (Number(row.maxUses) > 0) entry.maxUses = Math.max(1, Number(row.maxUses));
    entry.usedCount = Math.max(0, Number(row.usedCount) || 0);
    if (row.expiresAt) entry.expiresAt = String(row.expiresAt);
    if (row.productIds) {
      const ids = String(row.productIds).split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length) entry.productIds = ids;
    }
    entry.updatedAt = new Date().toISOString();

    promos[code] = entry;
  }

  try {
    await D.set(D.ref(D.db, D.P('promos')), promos);
    // Update local state
    if (D.state?.data) D.state.data.promos = promos;
    if (Array.isArray(window.__mcPromos)) delete window.__mcPromos._dirty;

    if (status) { status.textContent = '✓ Saved — live on storefront'; status.style.color = 'var(--success)'; }
    D.toast('Promo codes saved. Marketplace will pick them up instantly.', 'success');
    await D.logActivity?.('edit', 'Promo codes updated', 'promos');
  } catch (e) {
    if (status) { status.textContent = '✗ ' + e.message; status.style.color = 'var(--danger)'; }
    D.toast('Promo save failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Promo Codes'; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   ➕ NEW — PRODUCT EXTRAS SECTION
   Renders and edits `productExtras/{productId}` on Firebase.
   ═══════════════════════════════════════════════════════════════ */

function getProductsList() {
  // Products may live in D.state.data.products (object or array)
  const raw = D.state?.data?.products;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(p => p && p.id);
  return Object.entries(raw)
    .map(([id, p]) => ({ id: p?.id || id, name: p?.name || id, category: p?.category || '' }))
    .filter(p => p.id);
}

function renderExtrasSection() {
  const sel = REF.mcExtrasProductSelect || (REF.mcExtrasProductSelect = document.getElementById('mcExtrasProductSelect'));
  if (!sel) return;

  const products = getProductsList();

  // Populate dropdown (preserve current selection)
  const current = sel.value;
  sel.innerHTML = '<option value="">— Select a product —</option>' +
    products.map(p => `<option value="${escAttr(p.id)}">${escAttr(p.name)}${p.category ? ' · ' + escAttr(p.category) : ''}</option>`).join('');
  if (current && products.some(p => p.id === current)) sel.value = current;

  const emptyHint = REF.mcExtrasEmptyHint;
  const fieldsHost = document.getElementById('mcExtrasFields');

  if (!current) {
    if (emptyHint) emptyHint.style.display = 'block';
    if (fieldsHost) fieldsHost.style.display = 'none';
    return;
  }
  if (emptyHint) emptyHint.style.display = 'none';
  if (fieldsHost) fieldsHost.style.display = 'block';

  // Load current extras for this product (from main system state or Firebase)
  loadExtrasIntoForm(current);
}

async function loadExtrasIntoForm(productId) {
  if (!productId) return;
  let extras = {};

  // Prefer local state cache if present
  if (D.state?.data?.productExtras && D.state.data.productExtras[productId]) {
    extras = D.state.data.productExtras[productId];
  } else if (D.db && D.ref && D.P) {
    try {
      const snap = await D.ref(D.db, D.P('productExtras/' + productId)).get?.() ||
                   await D.ref(D.db, D.P('productExtras/' + productId)).once?.('value');
      const val = snap?.val ? snap.val() : null;
      if (val) extras = val;
    } catch (e) {
      console.warn('[extras] load failed', e);
    }
  }

  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v ?? '';
  };
  setVal('mcExtrasType', extras.productType || '');
  setVal('mcExtrasDemoUrl', extras.demoEmbedUrl || '');
  setVal('mcExtrasCtaLabel', extras.ctaLabel || '');
  setVal('mcExtrasGallery', Array.isArray(extras.gallery) ? extras.gallery.join('\n') : '');

  // Load extras-specific FAQ list
  const faqs = Array.isArray(extras.faqs) ? extras.faqs : [];
  window.__mcExtrasFaq = faqs.slice();
  const faqHost = REF.mcExtrasFaqList || (REF.mcExtrasFaqList = document.getElementById('mcExtrasFaqList'));
  if (faqHost) drawExtrasFaq(faqHost, window.__mcExtrasFaq);
}

function drawExtrasFaq(host, list) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const box = document.createElement('div');
    box.className = 'mc-card';
    box.innerHTML =
      `<div class="mc-row">` +
        `<input class="mc-input mc-input-flex" data-i="${i}" data-k="q" value="${escAttr(f.q)}" placeholder="Question">` +
        `<button type="button" class="btn btn-danger btn-xs" data-del="${i}"><i class="fa-solid fa-xmark"></i></button>` +
      `</div>` +
      `<textarea class="mc-input mc-input-full" data-i="${i}" data-k="a" rows="2">${escAttr(f.a)}</textarea>`;
    frag.appendChild(box);
  }
  if (!list.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:.8rem;color:var(--text-muted);font-size:.82rem;text-align:center;';
    empty.textContent = 'No product-specific FAQs. They will fall back to global FAQs.';
    frag.appendChild(empty);
  }
  host.replaceChildren(frag);
  host.__draw = (h, l) => drawExtrasFaq(h, l);
}

/* Save product extras → Firebase `productExtras/{productId}` */
export async function saveProductExtras() {
  if (!REF.mcExtrasProductSelect) cacheRefs();
  const productId = REF.mcExtrasProductSelect?.value;
  if (!productId) {
    D.toast('Select a product first.', 'warning');
    return;
  }

  const btn = REF.saveProductExtrasBtn;
  const status = REF.extrasSaveStatus;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }
  if (status) { status.textContent = ''; status.style.color = ''; }

  const v = (id) => {
    const el = document.getElementById(id);
    return (el?.value ?? '').trim();
  };

  const gallery = v('mcExtrasGallery').split('\n').map(s => s.trim()).filter(Boolean);
  const productType = v('mcExtrasType'); // '', 'license', 'custom', 'service'
  const demoEmbedUrl = v('mcExtrasDemoUrl');
  const ctaLabel = v('mcExtrasCtaLabel');
  const faqs = (window.__mcExtrasFaq || []).filter(f => f && (f.q || f.a));

  const payload = {
    productType: productType || null,
    demoEmbedUrl: demoEmbedUrl || null,
    ctaLabel: ctaLabel || null,
    gallery,
    faqs,
    updatedAt: new Date().toISOString()
  };

  // Strip null values to keep node clean
  Object.keys(payload).forEach(k => { if (payload[k] === null || payload[k] === '') delete payload[k]; });

  try {
    await D.set(D.ref(D.db, D.P('productExtras/' + productId)), payload);
    if (D.state?.data) {
      if (!D.state.data.productExtras) D.state.data.productExtras = {};
      D.state.data.productExtras[productId] = payload;
    }
    if (status) { status.textContent = '✓ Saved — live on storefront'; status.style.color = 'var(--success)'; }
    D.toast(`Product extras saved for "${productId}".`, 'success');
    await D.logActivity?.('edit', `Product extras updated: ${productId}`, 'productExtras');
  } catch (e) {
    if (status) { status.textContent = '✗ ' + e.message; status.style.color = 'var(--danger)'; }
    D.toast('Extras save failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Product Extras'; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   DELEGATED EVENT BINDING FOR LIST HOSTS
   ═══════════════════════════════════════════════════════════════ */
const HOST_BIND = [
  ['mcTrustList', '__mcTrust'],
  ['mcTestiList', '__mcTesti'],
  ['mcFaqList',   '__mcFaq'],
  ['mcStepsList', '__mcSteps'],
  ['mcExtrasFaqList', '__mcExtrasFaq']   // ➕ NEW
];

function bindListDelegation() {
  for (let h = 0; h < HOST_BIND.length; h++) {
    const hostId = HOST_BIND[h][0];
    const globalName = HOST_BIND[h][1];
    const host = REF[hostId] || (REF[hostId] = document.getElementById(hostId));
    if (!host || host.__delegated) continue;
    host.__delegated = true;

    host.addEventListener('input', (e) => {
      const el = e.target;
      const i = el.dataset?.i;
      const k = el.dataset?.k;
      if (i == null || !k) return;
      const arr = window[globalName];
      if (!arr || !arr[+i]) return;
      arr[+i][k] = el.value;
    });

    host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-del]');
      if (!btn) return;
      const i = +btn.dataset.del;
      const arr = window[globalName];
      if (!Array.isArray(arr)) return;
      arr.splice(i, 1);
      const draw = host.__draw;
      if (draw) draw(host, arr);
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   SAVE — main content (hero, etc.) — unchanged from v1
   ═══════════════════════════════════════════════════════════════ */
export async function saveMarketContent() {
  if (!REF.mcHeroBadge) cacheRefs();

  if (!REF.mcHeroBadge || !REF.mcBrandName) {
    D.toast('Marketplace form not available. Reload the page.', 'error');
    return;
  }

  const v = (id) => {
    const el = REF[id] || (REF[id] = document.getElementById(id));
    return (el?.value ?? '').trim();
  };

  const num = (id) => {
    const el = REF[id] || (REF[id] = document.getElementById(id));
    const raw = String(el?.value ?? '').replace(/[^\d.-]/g, '');
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const floatChips = [
    { icon: v('mcChip1Icon'), text: v('mcChip1Text') },
    { icon: v('mcChip2Icon'), text: v('mcChip2Text') },
    { icon: v('mcChip3Icon'), text: v('mcChip3Text') }
  ].filter(c => c.text);

  const pickArr = (name) => {
    const a = window[name];
    return Array.isArray(a) ? a.filter(x => x && typeof x === 'object') : [];
  };

  const payload = {
    heroBadge:   v('mcHeroBadge'),
    heroLive:    v('mcHeroLive'),
    heroTitle1:  v('mcHeroTitle1'),
    heroTitle2:  v('mcHeroTitle2'),
    heroSub:     v('mcHeroSub'),
    heroBtn1:    v('mcHeroBtn1'),
    heroBtn2:    v('mcHeroBtn2'),

    statProducts:      v('mcStatProducts'),
    statProductsLabel: v('mcStatProductsLabel'),
    statClients:       v('mcStatClients'),
    statClientsLabel:  v('mcStatClientsLabel'),
    statProjects:      v('mcStatProjects'),
    statProjectsLabel: v('mcStatProjectsLabel'),

    featuredLabel:     v('mcFeaturedLabel'),
    featuredProductId: v('mcFeaturedProductId'),
    featuredTitle:     v('mcFeaturedTitle'),
    featuredPrice:     num('mcFeaturedPrice'),
    featuredNote:      v('mcFeaturedNote'),
    featuredFeatures:  v('mcFeaturedFeatures').split('\n').map(s => s.trim()).filter(Boolean),
    featuredBtn:       v('mcFeaturedBtn'),

    floatChips,

    announcements: v('mcAnnouncements').split('\n').map(s => s.trim()).filter(Boolean),

    productsSubtitle: v('mcProductsSubtitle'),
    productsHeading:  v('mcProductsHeading'),
    productsDesc:     v('mcProductsDesc'),
    publicSubtitle:   v('mcPublicSubtitle'),
    publicHeading:    v('mcPublicHeading'),
    publicDesc:       v('mcPublicDesc'),
    howSubtitle:      v('mcHowSubtitle'),
    howHeading:       v('mcHowHeading'),
    faqSubtitle:      v('mcFaqSubtitle'),
    faqHeading:       v('mcFaqHeading'),

    newsletterHeading: v('mcNewsletterHeading'),
    newsletterDesc:    v('mcNewsletterDesc'),

    trustItems:   pickArr('__mcTrust'),
    testimonials: pickArr('__mcTesti'),
    faqs:         pickArr('__mcFaq'),
    steps:        pickArr('__mcSteps'),

    brandName:   v('mcBrandName'),
    brandAccent: v('mcBrandAccent') || '#00e0ff',
    footerBrand: v('mcFooterBrand'),
    footerText:  v('mcFooterText'),

    whatsApp:    v('mcWhatsApp'),
    footerEmail: v('mcFooterEmail'),

    updatedAt: new Date().toISOString(),
    updatedBy: D.state?.operator?.name || 'admin'
  };

  D.state.data.marketContent = payload;

  try {
    await D.set(D.ref(D.db, D.P('marketContent')), payload);
    D.toast('Marketplace content saved. Live in seconds.', 'success');
    await D.logActivity('edit', 'Marketplace content updated', 'marketContent');
  } catch (e) {
    D.toast('Save failed: ' + e.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   EVENT BINDING
   ═══════════════════════════════════════════════════════════════ */
export function bindMarketContentEvents() {
  cacheRefs();
  bindListDelegation();
  bindPromoDelegation();   // ➕ NEW

  REF.saveMarketContentBtn?.addEventListener('click', saveMarketContent);

  REF.mcAddTrustBtn?.addEventListener('click', () => {
    if (!Array.isArray(window.__mcTrust)) window.__mcTrust = [];
    window.__mcTrust.push({ icon: 'fa-solid fa-star', text: '' });
    if (REF.mcTrustList?.__draw) REF.mcTrustList.__draw(REF.mcTrustList, window.__mcTrust);
  });

  REF.mcAddTestiBtn?.addEventListener('click', () => {
    if (!Array.isArray(window.__mcTesti)) window.__mcTesti = [];
    window.__mcTesti.push({ name: '', role: '', text: '' });
    if (REF.mcTestiList?.__draw) REF.mcTestiList.__draw(REF.mcTestiList, window.__mcTesti);
  });

  REF.mcAddFaqBtn?.addEventListener('click', () => {
    if (!Array.isArray(window.__mcFaq)) window.__mcFaq = [];
    window.__mcFaq.push({ q: '', a: '' });
    if (REF.mcFaqList?.__draw) REF.mcFaqList.__draw(REF.mcFaqList, window.__mcFaq);
  });

  REF.mcAddStepBtn?.addEventListener('click', () => {
    if (!Array.isArray(window.__mcSteps)) window.__mcSteps = [];
    window.__mcSteps.push({ title: '', body: '' });
    if (REF.mcStepsList?.__draw) REF.mcStepsList.__draw(REF.mcStepsList, window.__mcSteps);
  });

  /* ➕ NEW — promo add */
  REF.mcAddPromoBtn?.addEventListener('click', () => {
    if (!Array.isArray(window.__mcPromos)) window.__mcPromos = [];
    window.__mcPromos.push({
      code: '', percent: 0, flatKes: 0, minSpendKes: 0,
      maxUses: 0, usedCount: 0, expiresAt: '', productIds: '', active: true
    });
    window.__mcPromos._dirty = true;
    if (REF.mcPromoList?.__draw) REF.mcPromoList.__draw(REF.mcPromoList, window.__mcPromos);
  });

  /* ➕ NEW — save promos */
  REF.savePromosBtn?.addEventListener('click', savePromos);

  /* ➕ NEW — product extras: product select change */
  REF.mcExtrasProductSelect?.addEventListener('change', () => {
    renderExtrasSection();
  });

  /* ➕ NEW — product extras: add FAQ */
  REF.mcAddExtrasFaqBtn?.addEventListener('click', () => {
    if (!Array.isArray(window.__mcExtrasFaq)) window.__mcExtrasFaq = [];
    window.__mcExtrasFaq.push({ q: '', a: '' });
    if (REF.mcExtrasFaqList?.__draw) REF.mcExtrasFaqList.__draw(REF.mcExtrasFaqList, window.__mcExtrasFaq);
  });

  /* ➕ NEW — save product extras */
  REF.saveProductExtrasBtn?.addEventListener('click', saveProductExtras);
}

/* ═══════════════════════════════════════════════════════════════
   DESTROY — allow rebinding after DOM re-mount
   ═══════════════════════════════════════════════════════════════ */
export function destroyMarketContent() {
  for (let i = 0; i < HOST_BIND.length; i++) {
    const host = document.getElementById(HOST_BIND[i][0]);
    if (host) host.__delegated = false;
  }
  const promoHost = document.getElementById('mcPromoList');
  if (promoHost) promoHost.__promoDelegated = false;
  for (const k in REF) delete REF[k];
}

export default {
  initMarketContent,
  renderMarketContent,
  saveMarketContent,
  savePromos,              // ➕ NEW
  saveProductExtras,       // ➕ NEW
  bindMarketContentEvents,
  destroyMarketContent,
  MARKET_DEFAULTS
};
