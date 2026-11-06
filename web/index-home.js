/* ═══════════════════════════════════════════════════════════════
   VIORA — INDEX HOME CONTROLLER (v3.0)
   ═══════════════════════════════════════════════════════════════

   Loads on index.html only. Requires:
     - shared-app.js          (nav, drawer, theme, canvas network, reveal)
     - order-modal.js         (shared purchase modal)
     - category-modal.js      (tour "More" popup)
     - Three.js r128+         (for the 3D globe)

   Firebase subscriptions:
     viora_data/orgs/viora/homeContent     → drives most landing sections
     viora_data/orgs/viora/homeContent/tour/meta     → tour eyebrow/heading/sub
     viora_data/orgs/viora/homeContent/tour/buckets  → flat node
     viora_data/orgs/viora/homeContent/tour/families → flat node
     viora_data/orgs/viora/homeContent/productStrip  → strip config
     viora_data/orgs/viora/industries                → tour + strip source
     viora_data/orgs/viora/marketContent   → stats, testimonials, FAQs, trust
     viora_data/orgs/viora/products        → product strip

   Public API (for debugging):
     window.VioraHome
   ═══════════════════════════════════════════════════════════════ */

import { initOrderModal, openOrderModal } from './order-modal.js';
import { initCategoryModal, openCategoryModal } from './category-modal.js';

/* ── Firebase SDK (ES modules from CDN) ── */
const FIREBASE_VERSION = '10.12.5';
const FB_CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC9gCBt-xR8t9n6rTGNvDZ5usUGiW-Dqxc",
  authDomain: "cliffclient-35ec5.firebaseapp.com",
  databaseURL: "https://cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cliffclient-35ec5",
  storageBucket: "cliffclient-35ec5.firebasestorage.app",
  messagingSenderId: "519782791696",
  appId: "1:519782791696:web:6e1a654ddeed14b72b2895",
};

const ROOT = 'viora_data/orgs/viora';
const KES_RATE = 129;

/* ── State ── */
const S = {
  homeContent: null,
  marketContent: null,
  products: [],
  industries: {},
  activeBucket: null,
  activeFamily: null,
  activeIndustry: null,
  step: 'bucket',
  search: '',
  ready: false,
};

/* ── Helpers ── */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const escHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const escAttr = escHtml;

const fmtKSh = (usd) => 'KSh ' + Math.round((Number(usd) || 0) * KES_RATE).toLocaleString('en-KE');
const fmtKShKes = (kes) => 'KSh ' + Math.round(Number(kes) || 0).toLocaleString('en-KE');

const debounceFn = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms || 200);
  };
};

const flattenNode = (node) => {
  if (!node || typeof node !== 'object') return {};
  if (Array.isArray(node)) {
    const out = {};
    node.forEach((item, i) => { if (item) out[item.key || i] = item; });
    return out;
  }
  return node;
};

/* ═══════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════ */
async function boot() {
  /* Wire shared modals */
  initOrderModal({
    firebaseConfig: FIREBASE_CONFIG,
    P: (p) => `${ROOT}/${String(p || '').replace(/^\/+|\/+$/g, '')}`,
    toast: (m, t) => { try { window.Viora?.toast?.(m, t) || toastFallback(m, t); } catch (_) { toastFallback(m, t); } },
    logActivity: () => {},
  });
  initCategoryModal({
    toast: (m, t) => toastFallback(m, t),
  });
  window.__vioraOpenOrderModal = openOrderModal;

  /* Load Firebase + subscribe */
  let fb;
  try {
    fb = await loadFirebase();
  } catch (e) {
    console.error('[viora-home] Firebase load failed:', e);
    fb = null;
  }

  if (fb) {
    fb.onValue(fb.ref(fb.db, `${ROOT}/homeContent`), snap => {
      S.homeContent = snap.exists() ? snap.val() : {};
      S.ready = true;
      renderAll();
    });
    fb.onValue(fb.ref(fb.db, `${ROOT}/marketContent`), snap => {
      S.marketContent = snap.exists() ? snap.val() : {};
      renderAll();
    });
    fb.onValue(fb.ref(fb.db, `${ROOT}/products`), snap => {
      const raw = snap.exists() ? snap.val() : {};
      S.products = Object.entries(raw)
        .map(([id, p]) => ({ ...(p || {}), id: (p && p.id) || id }))
        .filter(p => p.status !== 'archived' && p.status !== 'draft');
      renderAll();
    });
    fb.onValue(fb.ref(fb.db, `${ROOT}/industries`), snap => {
      S.industries = snap.exists() ? snap.val() : {};
      renderAll();
    });
  } else {
    S.homeContent = {};
    S.industries = {};
    S.ready = true;
    renderAll();
  }

  /* Init 3D globe */
  initGlobe();

  /* Wire contact form */
  wireContactForm();
}

function toastFallback(msg, type = 'info') {
  try {
    if (window.Viora?.toast) { window.Viora.toast(msg, type); return; }
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 18px;border-radius:10px;
      background:${type === 'error' ? '#DC2626' : type === 'success' ? '#10B981' : '#2267EE'};color:#fff;
      font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  } catch (_) {}
}

async function loadFirebase() {
  const [appMod, dbMod] = await Promise.all([
    import(`${FB_CDN}/firebase-app.js`),
    import(`${FB_CDN}/firebase-database.js`),
  ]);
  let app;
  try { app = appMod.getApp(); } catch (_) { app = appMod.initializeApp(FIREBASE_CONFIG); }
  const db = dbMod.getDatabase(app);
  return {
    app, db,
    ref: dbMod.ref,
    onValue: dbMod.onValue,
    set: dbMod.set,
    get: dbMod.get,
    push: dbMod.push,
  };
}

/* ═══════════════════════════════════════════════════════════════
   RENDER ALL SECTIONS
   ═══════════════════════════════════════════════════════════════ */
function renderAll() {
  renderHero();
  renderStatsStrip();
  renderIntentRouter();
  renderChatTour();
  renderProductCarousel();
  renderEcoMap();
  renderDashboard();
  renderTestimonials();
  renderCases();
  renderPricing();
  renderAcademy();
  renderFaq();
  renderContact();
}

/* ═══════════════════════════════════════════════════════════════
   1. HERO
   ═══════════════════════════════════════════════════════════════ */
function renderHero() {
  const h = S.homeContent?.hero || {};
  const eyebrow = $('#hero-eyebrow');
  const line1 = $('#hero-line1');
  const line2 = $('#hero-line2');
  const sub = $('#hero-sub');
  const cta1 = $('#hero-cta1');
  const cta2 = $('#hero-cta2');

  if (eyebrow) eyebrow.textContent = h.eyebrow || 'The VIORA Ecosystem';
  if (line1) line1.textContent = h.titleLine1 || 'Everything Your Business Needs.';
  if (line2) line2.textContent = h.titleLine2 || 'Connected.';
  if (sub) sub.textContent = h.subtitle || 'Run smarter, sell more and grow with an integrated ecosystem of business software, digital services, commerce and expert support.';
  if (cta1 && h.primaryCta) {
    cta1.textContent = h.primaryCta.label || 'Explore the Ecosystem →';
    cta1.href = h.primaryCta.href || '#tour';
  }
  if (cta2 && h.secondaryCta) {
    cta2.textContent = h.secondaryCta.label || 'Book a demo';
    cta2.href = h.secondaryCta.href || 'contact_us.html';
  }
}

/* ═══════════════════════════════════════════════════════════════
   2. STATS STRIP
   ═══════════════════════════════════════════════════════════════ */
function renderStatsStrip() {
  const host = $('#stats-strip-inner');
  if (!host) return;
  const mc = S.marketContent || {};
  const prodCount = mc.statProducts === 'auto' || !mc.statProducts
    ? S.products.length
    : parseInt(mc.statProducts, 10) || 0;
  const clients = parseInt(mc.statClients, 10) || 128;
  const projects = parseInt(mc.statProjects, 10) || S.products.length * 3;

  host.innerHTML = `
    <div class="stats-strip-item">
      <div class="stats-strip-value">${prodCount}+</div>
      <div class="stats-strip-label">${escHtml(mc.statProductsLabel || 'Solutions')}</div>
    </div>
    <div class="stats-strip-item">
      <div class="stats-strip-value">${clients}+</div>
      <div class="stats-strip-label">${escHtml(mc.statClientsLabel || 'Happy Clients')}</div>
    </div>
    <div class="stats-strip-item">
      <div class="stats-strip-value">${projects}+</div>
      <div class="stats-strip-label">${escHtml(mc.statProjectsLabel || 'Delivered')}</div>
    </div>
    <div class="stats-strip-item">
      <div class="stats-strip-value">2022</div>
      <div class="stats-strip-label">Founded</div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   3. INTENT ROUTER
   ═══════════════════════════════════════════════════════════════ */
function renderIntentRouter() {
  const host = $('#intent-grid');
  if (!host) return;
  const tiles = S.homeContent?.intentTiles || [
    { title: 'Explore the ecosystem', desc: '45+ solutions across 35 industries', href: '#tour', icon: 'fa-layer-group' },
    { title: 'Browse products', desc: 'Instant KES pricing, delivered live', href: 'market.html', icon: 'fa-store' },
    { title: 'Subscribe to a plan', desc: 'Manage your subscription and invoices', href: 'client.html', icon: 'fa-crown' },
    { title: 'Training academy', desc: 'Courses, checklists, certificates', href: 'training.html', icon: 'fa-graduation-cap' },
  ];

  host.innerHTML = tiles.map(t => `
    <a href="${escAttr(t.href)}" class="intent-tile">
      <div class="intent-icon"><i class="fa-solid ${escAttr(t.icon || 'fa-cube')}"></i></div>
      <h3>${escHtml(t.title)}</h3>
      <p>${escHtml(t.desc || '')}</p>
      <span class="intent-arrow">Open <i class="fa-solid fa-arrow-right"></i></span>
    </a>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════════
   4. CHAT TOUR — ChatGPT-style drill-down
   ═══════════════════════════════════════════════════════════════ */
function renderChatTour() {
  const host = $('#chat-tour');
  if (!host) return;

  const meta = S.homeContent?.tour?.meta || {};
  const eyebrowEl = $('#tour-eyebrow');
  const headingEl = $('#tour-heading');
  const subEl     = $('#tour-sub');
  if (eyebrowEl) eyebrowEl.textContent = meta.eyebrow || 'What we build';
  if (headingEl) headingEl.textContent = meta.heading || '45+ solutions. One core.';
  if (subEl)     subEl.textContent     = meta.sub     || 'Every product in this tour is designed, built and supported by VIORA.';

  const buckets    = Object.values(flattenNode(S.homeContent?.tour?.buckets));
  const families   = Object.values(flattenNode(S.homeContent?.tour?.families));
  const industries = Object.values(flattenNode(S.industries)).filter(i => i.active !== false);

  if (buckets.length === 0) {
    const section = $('#tour');
    if (section) section.style.display = 'none';
    return;
  }
  const section = $('#tour');
  if (section) section.style.display = 'block';

  const step = S.step || 'bucket';

  if (step === 'family' && !S.activeBucket) {
    S.step = 'bucket'; S.activeFamily = null; S.activeIndustry = null;
  }
  if (step === 'industry' && (!S.activeBucket || !S.activeFamily)) {
    S.step = S.activeBucket ? 'family' : 'bucket';
    S.activeIndustry = null;
  }
  if (step === 'detail' && !S.activeIndustry) {
    S.step = 'industry';
  }

  if (S.step === 'bucket')          renderTourStepBucket(host, buckets);
  else if (S.step === 'family')     renderTourStepFamily(host, buckets, families);
  else if (S.step === 'industry')   renderTourStepIndustry(host, buckets, families, industries);
  else                              renderTourStepDetail(host, buckets, families, industries);
}

/* ── Step 1: Bucket selection ── */
function renderTourStepBucket(host, buckets) {
  const q = (S.search || '').toLowerCase().trim();
  const visible = buckets
    .filter(b => !q || (b.name || '').toLowerCase().includes(q) || (b.desc || '').toLowerCase().includes(q))
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));

  host.innerHTML = `
    <div class="chat-bubble assistant">
      <div class="chat-bubble-icon"><i class="fa-solid fa-robot"></i></div>
      <div class="chat-bubble-body">
        <div class="chat-bubble-title">What are you trying to do?</div>
        <div class="chat-search-wrap">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" class="chat-search" id="tour-search" placeholder="Search…" value="${escAttr(S.search)}" autocomplete="off"/>
        </div>
        <div class="chat-chips">
          ${visible.length === 0
            ? `<div class="chat-empty">No matches — try a different word.</div>`
            : visible.map(b => `
              <button type="button" class="chat-chip" data-bucket="${escAttr(b.key)}">
                <i class="${escAttr(b.icon || 'fa-solid fa-cube')}" style="color:${escAttr(b.color || '#2267EE')}"></i>
                <span>${escHtml(b.name || b.key)}</span>
              </button>
            `).join('')}
        </div>
      </div>
    </div>
  `;

  host.querySelectorAll('[data-bucket]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.activeBucket = btn.dataset.bucket;
      S.activeFamily = null;
      S.activeIndustry = null;
      S.step = 'family';
      S.search = '';
      renderChatTour();
    });
  });

  bindSearchInput(host);
}

/* ── Step 2: Family selection ── */
function renderTourStepFamily(host, buckets, families) {
  const bucket = buckets.find(b => b.key === S.activeBucket);
  if (!bucket) { S.step = 'bucket'; return renderChatTour(); }

  const q = (S.search || '').toLowerCase().trim();
  const visible = families
    .filter(f => f.bucket === S.activeBucket)
    .filter(f => !q || (f.name || '').toLowerCase().includes(q) || (f.desc || '').toLowerCase().includes(q))
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));

  host.innerHTML = `
    <div class="chat-bubble user">
      <div class="chat-bubble-body">
        <div class="chat-bubble-title">${escHtml(bucket.name)}</div>
        <button type="button" class="chat-back" data-back="bucket">
          <i class="fa-solid fa-arrow-left"></i> Back
        </button>
      </div>
    </div>

    <div class="chat-bubble assistant">
      <div class="chat-bubble-icon"><i class="fa-solid fa-robot"></i></div>
      <div class="chat-bubble-body">
        <div class="chat-bubble-title">Got it — what area?</div>
        <div class="chat-search-wrap">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" class="chat-search" id="tour-search" placeholder="Search…" value="${escAttr(S.search)}" autocomplete="off"/>
        </div>
        <div class="chat-chips">
          ${visible.length === 0
            ? `<div class="chat-empty">No families here yet — check back soon.</div>`
            : visible.map(f => `
              <button type="button" class="chat-chip" data-family="${escAttr(f.key)}">
                <i class="${escAttr(f.icon || 'fa-solid fa-folder')}" style="color:${escAttr(bucket.color || '#2267EE')}"></i>
                <span>${escHtml(f.name || f.key)}</span>
              </button>
            `).join('')}
        </div>
      </div>
    </div>
  `;

  host.querySelector('[data-back="bucket"]')?.addEventListener('click', () => {
    S.step = 'bucket';
    S.activeBucket = null;
    S.activeFamily = null;
    S.search = '';
    renderChatTour();
  });

  host.querySelectorAll('[data-family]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.activeFamily = btn.dataset.family;
      S.activeIndustry = null;
      S.step = 'industry';
      S.search = '';
      renderChatTour();
    });
  });

  bindSearchInput(host);
}

/* ── Step 3: Industry selection ── */
function renderTourStepIndustry(host, buckets, families, industries) {
  const bucket = buckets.find(b => b.key === S.activeBucket);
  const family = families.find(f => f.key === S.activeFamily);
  if (!bucket || !family) { S.step = 'bucket'; return renderChatTour(); }

  const q = (S.search || '').toLowerCase().trim();
  const visible = industries
    .filter(i => i.bucket === S.activeBucket && i.family === S.activeFamily)
    .filter(i => !q || (i.name || '').toLowerCase().includes(q) || (i.desc || '').toLowerCase().includes(q))
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));

  host.innerHTML = `
    <div class="chat-bubble user">
      <div class="chat-bubble-body">
        <div class="chat-bubble-title">
          <span style="opacity:.6;">${escHtml(bucket.name)}</span>
          <span style="opacity:.4;margin:0 6px;">›</span>
          ${escHtml(family.name)}
        </div>
        <button type="button" class="chat-back" data-back="family">
          <i class="fa-solid fa-arrow-left"></i> Back
        </button>
        <button type="button" class="chat-back" data-back="start" style="margin-left:8px;">
          <i class="fa-solid fa-house"></i> Start over
        </button>
      </div>
    </div>

    <div class="chat-bubble assistant">
      <div class="chat-bubble-icon"><i class="fa-solid fa-robot"></i></div>
      <div class="chat-bubble-body">
        <div class="chat-bubble-title">Which industry?</div>
        <div class="chat-search-wrap">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" class="chat-search" id="tour-search" placeholder="Search…" value="${escAttr(S.search)}" autocomplete="off"/>
        </div>
        <div class="chat-chips">
          ${visible.length === 0
            ? `<div class="chat-empty">No industries here yet — check back soon.</div>`
            : visible.map(i => `
              <button type="button" class="chat-chip" data-industry="${escAttr(i.key)}">
                <span style="font-size:16px;">${escHtml(i.emoji || '📦')}</span>
                <span>${escHtml(i.name || i.key)}</span>
              </button>
            `).join('')}
        </div>
      </div>
    </div>
  `;

  host.querySelector('[data-back="family"]')?.addEventListener('click', () => {
    S.step = 'family';
    S.activeFamily = null;
    S.search = '';
    renderChatTour();
  });
  host.querySelector('[data-back="start"]')?.addEventListener('click', () => {
    S.step = 'bucket';
    S.activeBucket = null;
    S.activeFamily = null;
    S.activeIndustry = null;
    S.search = '';
    renderChatTour();
  });
  host.querySelectorAll('[data-industry]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.activeIndustry = btn.dataset.industry;
      S.step = 'detail';
      S.search = '';
      renderChatTour();
    });
  });

  bindSearchInput(host);
}

/* ── Step 4: Industry detail card ── */
function renderTourStepDetail(host, buckets, families, industries) {
  const bucket = buckets.find(b => b.key === S.activeBucket);
  const family = families.find(f => f.key === S.activeFamily);
  const ind = industries.find(i => i.key === S.activeIndustry);
  if (!ind) { S.step = 'industry'; return renderChatTour(); }

  const imageData = ind.image || ind.imageUrl || '';
  const color = ind.color || '#2267EE';
  const bullets = Array.isArray(ind.bullets) ? ind.bullets : [];
  const stats   = Array.isArray(ind.stats)   ? ind.stats   : [];

  host.innerHTML = `
    <div class="chat-bubble user">
      <div class="chat-bubble-body">
        <div class="chat-bubble-title">
          <span style="opacity:.6;">${escHtml(bucket?.name || '')}</span>
          <span style="opacity:.4;margin:0 6px;">›</span>
          <span style="opacity:.6;">${escHtml(family?.name || '')}</span>
          <span style="opacity:.4;margin:0 6px;">›</span>
          ${escHtml(ind.name)}
        </div>
        <button type="button" class="chat-back" data-back="industry">
          <i class="fa-solid fa-arrow-left"></i> Back
        </button>
        <button type="button" class="chat-back" data-back="start" style="margin-left:8px;">
          <i class="fa-solid fa-house"></i> Start over
        </button>
      </div>
    </div>

    <div class="chat-bubble assistant">
      <div class="chat-bubble-icon"><i class="fa-solid fa-robot"></i></div>
      <div class="chat-bubble-body">
        <div class="chat-bubble-title">Here's your ${escHtml(ind.name)} solution</div>
        <div class="tour-detail-card" style="border-color:${escAttr(color)}33;">
          <div class="tour-detail-visual" style="background:${escAttr(color)}15;">
            ${imageData
              ? `<img src="${escAttr(imageData)}" alt="${escAttr(ind.name || '')}" loading="lazy"/>`
              : `<i class="${escAttr(ind.icon || 'fa-solid fa-cube')}" style="color:${escAttr(color)};font-size:64px;"></i>`}
          </div>
          <div class="tour-detail-body">
            <div class="tour-detail-head">
              <span class="tour-detail-emoji">${escHtml(ind.emoji || '📦')}</span>
              <h3>${escHtml(ind.name)}</h3>
            </div>
            <p class="tour-detail-desc">${escHtml(ind.desc || '')}</p>
            ${bullets.length ? `
              <ul class="tour-detail-bullets">
                ${bullets.map(b => `<li><i class="fa-solid fa-check"></i> ${escHtml(b)}</li>`).join('')}
              </ul>
            ` : ''}
            ${stats.length ? `
              <div class="tour-detail-stats">
                ${stats.map(s => `
                  <div class="tour-detail-stat">
                    <div class="tour-detail-stat-v">${escHtml(s.v || '')}</div>
                    <div class="tour-detail-stat-l">${escHtml(s.l || '')}</div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
                 <div class="tour-detail-actions">
              ${ind.previewUrl ? `
                <a href="${escAttr(ind.previewUrl)}" target="_blank" rel="noopener" class="btn btn-outline">
                  <i class="fa-solid fa-eye"></i> View sample
                </a>
              ` : ''}
              <button type="button" class="btn btn-primary" data-buy>
                <i class="fa-solid fa-bolt"></i> Buy now
              </button>
              <a href="client.html" class="btn btn-ghost">
                <i class="fa-solid fa-crown"></i> Subscribe
              </a>
              <button type="button" class="btn btn-ghost" data-more>
                <i class="fa-solid fa-circle-info"></i> More
              </button>
            </div>
          </div>
        </div>

        ${(() => {
          /* Filter ALL products matching this industry's marketCategory */
          const marketCat = String(ind.marketCategory || '').trim().toLowerCase();
          const products = (S.products || []).filter(p => {
            if (p.status === 'archived' || p.status === 'draft') return false;
            return String(p.category || '').trim().toLowerCase() === marketCat;
          });

          if (products.length === 0) return '';

          /* Sort by totalSold desc */
          products.sort((a, b) => (Number(b.totalSold) || 0) - (Number(a.totalSold) || 0));

          return `
            <div class="tour-products-section">
              <div class="tour-products-head">
                <span class="tour-products-label">
                  <i class="fa-solid fa-box-open"></i>
                  ${products.length} product${products.length === 1 ? '' : 's'} in this industry
                </span>
              </div>
              <div class="tour-products-grid">
                ${products.map(p => {
                  const kes = Math.round((Number(p.price) || 0) * KES_RATE);
                  const image = p.image && String(p.image).trim();
                  const icon = p.icon || 'fa-solid fa-cube';
                  return `
                    <article class="tour-product-card" data-product-id="${escAttr(p.id)}">
                      <div class="tour-product-visual">
                        ${image
                          ? `<img src="${escAttr(image)}" alt="${escAttr(p.name || '')}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid';" />
                             <div class="tour-product-fallback" style="display:none;"><i class="${escAttr(icon)}"></i></div>`
                          : `<div class="tour-product-fallback" style="display:grid;"><i class="${escAttr(icon)}"></i></div>`}
                      </div>
                      <div class="tour-product-body">
                        <div class="tour-product-name">${escHtml(p.name || '')}</div>
                        <div class="tour-product-price">KSh ${kes.toLocaleString('en-KE')}</div>
                        <div class="tour-product-actions">
                          <button type="button" class="tour-product-buy" onclick="event.stopPropagation(); App.openOrderModal({ productId: '${escAttr(p.id)}' })">
                            <i class="fa-solid fa-bolt"></i> Buy
                          </button>
                          ${(p.previewUrl || p.link) ? `
                            <a href="${escAttr(p.previewUrl || p.link)}" class="tour-product-preview" target="_blank" rel="noopener" onclick="event.stopPropagation();" title="Preview">
                              <i class="fa-solid fa-eye"></i>
                            </a>
                          ` : ''}
                        </div>
                      </div>
                    </article>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        })()}
      </div>
    </div>
  `;

  host.querySelector('[data-back="industry"]')?.addEventListener('click', () => {
    S.step = 'industry';
    S.activeIndustry = null;
    renderChatTour();
  });
  host.querySelector('[data-back="start"]')?.addEventListener('click', () => {
    S.step = 'bucket';
    S.activeBucket = null;
    S.activeFamily = null;
    S.activeIndustry = null;
    S.search = '';
    renderChatTour();
  });

  host.querySelector('[data-buy]')?.addEventListener('click', () => {
    openOrderModal({ category: ind.marketCategory || ind.name });
  });
  host.querySelector('[data-more]')?.addEventListener('click', () => {
    openCategoryModal(ind.key, {
      name: ind.name,
      icon: ind.icon || 'fa-cube',
      desc: ind.desc || '',
      longDesc: ind.longDesc || ind.desc || '',
      included: ind.included || [],
      demoUrl: ind.previewUrl || '',
      gallery: [],
      products: [],
      faqs: ind.faqs || [],
      viewSampleUrl: ind.previewUrl || '',
    });
  });
}

  /* Bind product cards in the tour detail */
  host.querySelectorAll('.tour-product-card').forEach(card => {
    card.addEventListener('click', () => {
      const pid = card.dataset.productId;
      if (pid) openOrderModal({ productId: pid });
    });
  });

/* ── Shared search input binder ── */
function bindSearchInput(host) {
  const searchEl = host.querySelector('#tour-search');
  if (!searchEl) return;
  const handler = debounceFn((e) => {
    S.search = e.target.value;
    renderChatTour();
    const newSearch = document.getElementById('tour-search');
    if (newSearch) {
      newSearch.focus();
      const len = newSearch.value.length;
      newSearch.setSelectionRange(len, len);
    }
  }, 200);
  searchEl.addEventListener('input', handler);
}

/* ═══════════════════════════════════════════════════════════════
   5. PRODUCT CAROUSEL
   ═══════════════════════════════════════════════════════════════ */
function renderProductCarousel() {
  const host = $('#strip-carousel');
  if (!host) return;

  const ps = S.homeContent?.productStrip || {};
  const eyebrowEl = $('#strip-eyebrow');
  const headingEl = $('#strip-heading');
  const subEl     = $('#strip-sub');
  const ctaEl     = $('#strip-cta');
  if (eyebrowEl && ps.eyebrow) eyebrowEl.textContent = ps.eyebrow;
  if (headingEl && ps.heading) headingEl.textContent = ps.heading;
  if (subEl && ps.sub)         subEl.textContent     = ps.sub;
  if (ctaEl && ps.ctaHref) {
    ctaEl.href = ps.ctaHref;
    if (ps.ctaLabel) ctaEl.textContent = ps.ctaLabel;
  }

  const stripSection = $('.product-strip');
  if (!stripSection) return;

  /* v3.1 — Show ALL products, not filtered by industry.
     Auto-rotating carousel. Products mixed across all categories. */
  let list = (S.products || []).filter(p =>
    p.status !== 'archived' && p.status !== 'draft'
  );

  if (list.length === 0) {
    stripSection.style.display = 'none';
    return;
  }
  stripSection.style.display = 'block';

  /* Sort by totalSold desc to show best-sellers first */
  list.sort((a, b) => (Number(b.totalSold) || 0) - (Number(a.totalSold) || 0));

  /* Limit to a reasonable carousel size — but "auto-rotate" means we want
     enough to keep it moving. Show up to `ps.limit` if set, else all. */
  const limit = Number(ps.limit) || 0;
  if (limit > 0) list = list.slice(0, limit);

  /* Render cards */
  host.innerHTML = list.map(p => {
    const kes = Math.round((Number(p.price) || 0) * KES_RATE);
    const extras = (S.homeContent?.productExtras || {})[p.id] || {};
    const isCustom = extras.productType === 'custom' || extras.productType === 'service' || p.pricing === 'quote';
    const previewUrl = p.previewUrl || p.link || extras.previewUrl || '';
    const image = p.image || '';

    return `
      <article class="strip-card" data-product-id="${escAttr(p.id)}">
        <div class="strip-card-visual">
          ${image
            ? `<img src="${escAttr(image)}" alt="${escAttr(p.name || '')}" loading="lazy" onerror="this.onerror=null;this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';"/>`
            : ''}
          <div class="strip-card-fallback" style="${image ? 'display:none;' : 'display:flex;'}">
            <i class="${escAttr(p.icon || 'fa-solid fa-cube')}"></i>
          </div>
        </div>
        <div class="strip-card-body">
          <div class="strip-card-cat">${escHtml(p.category || '')}</div>
          <h3 class="strip-card-name">${escHtml(p.name || '')}</h3>
          <p class="strip-card-desc">${escHtml((p.description || '').slice(0, 90))}${(p.description || '').length > 90 ? '…' : ''}</p>
          <div class="strip-card-price">${isCustom ? 'Custom pricing' : 'KSh ' + kes.toLocaleString('en-KE')}</div>
          <div class="strip-card-actions">
            ${previewUrl ? `
              <a href="${escAttr(previewUrl)}" target="_blank" rel="noopener" class="strip-btn strip-btn-outline" title="Preview">
                <i class="fa-solid fa-eye"></i>
              </a>
            ` : ''}
            <button type="button" class="strip-btn strip-btn-primary" data-buy>
              <i class="fa-solid fa-bolt"></i> ${isCustom ? 'Quote' : 'Buy'}
            </button>
            <button type="button" class="strip-btn strip-btn-outline" data-more title="More">
              <i class="fa-solid fa-circle-info"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  host.querySelectorAll('[data-product-id]').forEach(card => {
    const pid = card.dataset.productId;
    const product = list.find(p => p.id === pid);
    if (!product) return;

    card.querySelector('[data-buy]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openOrderModal({ productId: pid });
    });
    card.querySelector('[data-more]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const extras = (S.homeContent?.productExtras || {})[pid] || {};
      openCategoryModal(pid, {
        name: product.name,
        icon: product.icon || 'fa-cube',
        desc: product.description || '',
        longDesc: extras.longDesc || product.description || '',
        included: extras.included || [],
        demoUrl: extras.demoEmbedUrl || product.previewUrl || '',
        gallery: extras.gallery || [],
        products: [],
        faqs: extras.faqs || [],
        viewSampleUrl: product.previewUrl || product.link || '',
      });
    });
  });

  wireStripArrows(host);
  startStripAutoplay(host);
}

/* ═══════════════════════════════════════════════════════════════
   STRIP AUTOPLAY (v3.1)
   Auto-rotates the carousel every 4 seconds. Pauses on hover.
   ═══════════════════════════════════════════════════════════════ */
let _stripAutoplayTimer = null;
let _stripPaused = false;

function startStripAutoplay(host) {
  if (_stripAutoplayTimer) clearInterval(_stripAutoplayTimer);

  _stripPaused = false;
  host.addEventListener('mouseenter', () => { _stripPaused = true; });
  host.addEventListener('mouseleave', () => { _stripPaused = false; });
  host.addEventListener('touchstart', () => { _stripPaused = true; }, { passive: true });
  host.addEventListener('touchend', () => {
    setTimeout(() => { _stripPaused = false; }, 3000);
  }, { passive: true });

  _stripAutoplayTimer = setInterval(() => {
    if (_stripPaused || document.hidden) return;
    const card = host.querySelector('.strip-card');
    if (!card) return;
    const step = card.getBoundingClientRect().width + 16;

    /* Advance by 1 card; wrap to 0 when at end */
    const maxScroll = host.scrollWidth - host.clientWidth;
    if (host.scrollLeft >= maxScroll - 10) {
      host.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      host.scrollBy({ left: step, behavior: 'smooth' });
    }
  }, 4000);
}

function wireStripArrows(host) {
  const prev = $('#strip-prev');
  const next = $('#strip-next');
  if (!prev || !next || prev._bound) return;
  prev._bound = true;
  next._bound = true;

  const step = () => {
    const card = host.querySelector('.strip-card');
    if (!card) return 300;
    const gap = 16;
    return card.getBoundingClientRect().width + gap;
  };
  prev.addEventListener('click', () => host.scrollBy({ left: -step() * 2, behavior: 'smooth' }));
  next.addEventListener('click', () => host.scrollBy({ left:  step() * 2, behavior: 'smooth' }));
}

/* ═══════════════════════════════════════════════════════════════
   6. ECO MAP
   ═══════════════════════════════════════════════════════════════ */
function renderEcoMap() {
  const svg = $('#eco-svg');
  const infoHost = $('#eco-info');
  if (!svg) return;

  const em = S.homeContent?.ecosystem || {};
  const nodes = em.nodes || [
    { name: 'Business',     color: '#2267EE', desc: 'ERP, POS, accounting, inventory — business operations feed the core.' },
    { name: 'Marketplace',  color: '#23C7D9', desc: 'Products, promos, orders — where customers buy.' },
    { name: 'Clients',      color: '#8B5CF6', desc: 'Businesses running on VIORA, streaming operational data.' },
    { name: 'Partners',     color: '#F59E0B', desc: 'Channel and delivery partners implementing VIORA.' },
    { name: 'Products',     color: '#10B981', desc: 'Catalogue synced in real time.' },
    { name: 'Training',     color: '#EF4444', desc: 'Academy courses, checklists, certificates.' },
    { name: 'Finance',      color: '#EC4899', desc: 'Invoicing, payments, reconciliation.' },
    { name: 'Analytics',    color: '#6366F1', desc: 'Reports and business insight.' },
    { name: 'Integrations', color: '#14B8A6', desc: 'APIs and connectors.' },
    { name: 'Security',     color: '#F97316', desc: 'Identity, access, compliance.' },
  ];

  const cx = 200, cy = 200, R = 150;
  const N = nodes.length;

  const positions = nodes.map((_, i) => {
    const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
    return { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
  });

  let svgHTML = `
    <defs>
      <radialGradient id="ecoHubGrad" cx="36%" cy="30%" r="68%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="18%" stop-color="#7fb0ff"/>
        <stop offset="42%" stop-color="#2267EE"/>
        <stop offset="78%" stop-color="#0b2a66"/>
        <stop offset="100%" stop-color="#050d22"/>
      </radialGradient>
    </defs>
  `;

  svgHTML += `<g id="eco-lines">${positions.map((p, i) =>
    `<line class="eco-line" data-line="${i}" x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}"/>`
  ).join('')}</g>`;

  svgHTML += `
    <circle class="eco-pulse" cx="${cx}" cy="${cy}" r="46"/>
    <circle class="eco-pulse" cx="${cx}" cy="${cy}" r="46"/>
    <circle class="eco-pulse" cx="${cx}" cy="${cy}" r="46"/>
  `;

  svgHTML += `
    <circle class="eco-hub" cx="${cx}" cy="${cy}" r="46"/>
    <circle cx="${cx - 15}" cy="${cy - 15}" r="10" fill="rgba(255,255,255,.55)"/>
    <text class="eco-hub-txt" x="${cx}" y="${cy + 5}">VIORA</text>
  `;

  svgHTML += `<g id="eco-nodes">${nodes.map((n, i) => {
    const p = positions[i];
    const labelY = p.y < cy ? p.y - 22 : p.y + 30;
    return `
      <g class="eco-node" data-idx="${i}" tabindex="0" role="button" aria-label="${escAttr(n.name)}" style="color:${escAttr(n.color)}">
        <circle cx="${p.x}" cy="${p.y}" r="11" fill="${escAttr(n.color)}" opacity="0.95"/>
        <circle cx="${p.x - 3}" cy="${p.y - 4}" r="3.5" fill="rgba(255,255,255,0.7)"/>
        <circle cx="${p.x}" cy="${p.y}" r="18" fill="transparent"/>
        <text x="${p.x}" y="${labelY}">${escHtml(n.name)}</text>
      </g>
    `;
  }).join('')}</g>`;

  svg.innerHTML = svgHTML;

  function selectNode(i) {
    $$('.eco-node', svg).forEach((el, idx) => el.classList.toggle('active', idx === i));
    $$('.eco-line', svg).forEach((el, idx) => el.classList.toggle('active', idx === i));
    if (infoHost) {
      const n = nodes[i];
      infoHost.innerHTML = `<h3 style="color:${escAttr(n.color)}">${escHtml(n.name)}</h3><p>${escHtml(n.desc || '')}</p>`;
    }
  }

  $$('.eco-node', svg).forEach(el => {
    el.addEventListener('click', () => selectNode(Number(el.dataset.idx)));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectNode(Number(el.dataset.idx));
      }
    });
  });

  if (infoHost) {
    infoHost.innerHTML = `<h3>VIORA Core</h3><p>${escHtml(em.sub || 'Select any node to see how that domain connects to the ecosystem.')}</p>`;
  }
}

/* ═══════════════════════════════════════════════════════════════
   7. DASHBOARD PREVIEW
   ═══════════════════════════════════════════════════════════════ */
function renderDashboard() {
  const dp = S.homeContent?.dashboard || {};
  const rev = Number(dp.revenue) || 4280000;
  const sales = Number(dp.sales) || 1284;
  const revEl = $('#dash-revenue');
  const salesEl = $('#dash-sales');
  if (revEl) revEl.textContent = fmtKShKes(rev);
  if (salesEl) salesEl.textContent = sales.toLocaleString('en-KE');
}

/* ═══════════════════════════════════════════════════════════════
   8. TESTIMONIALS
   ═══════════════════════════════════════════════════════════════ */
function renderTestimonials() {
  const host = $('#testimonials-grid');
  if (!host) return;
  const list = (S.marketContent?.testimonials || []).slice(0, 4);

  if (!list.length) {
    host.innerHTML = `
      <figure class="testi" style="grid-column:1/-1;text-align:center;color:var(--muted);">
        <p>No testimonials yet — add them in the admin dashboard under <strong>Market Content</strong>.</p>
      </figure>
    `;
    return;
  }

  host.innerHTML = list.map((t, i) => {
    const initials = (t.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const colors = ['#2267EE', '#10B981', '#8B5CF6', '#F59E0B'];
    const bg = colors[i % colors.length];
    return `
      <figure class="testi">
        <blockquote>${escHtml(t.text || '')}</blockquote>
        <figcaption>
          <span class="avatar" style="background:${bg};width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0;">${initials}</span>
          <div>
            <strong>${escHtml(t.name || 'Client')}</strong>
            <small>${escHtml(t.role || '')}</small>
          </div>
        </figcaption>
      </figure>
    `;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════════
   9. CASES
   ═══════════════════════════════════════════════════════════════ */
function renderCases() {
  const cs = S.homeContent?.cases || {};
  const heading = $('#cases-heading');
  if (heading && cs.heading) heading.textContent = cs.heading;
}

/* ═══════════════════════════════════════════════════════════════
   10. PRICING
   ═══════════════════════════════════════════════════════════════ */
function renderPricing() {
  const host = $('#pricing-grid');
  if (!host) return;
  const tiers = S.homeContent?.pricing?.tiers || [
    { name: 'Starter', tagline: 'Small teams', bullets: ['Core modules', 'Up to 5 users', 'Email support'], cta: 'Subscribe', ctaHref: 'client.html' },
    { name: 'Growth', tagline: 'Growing businesses', featured: true, bullets: ['Everything in Starter', 'Up to 25 users', 'POS + Inventory + Accounting', 'Priority support'], cta: 'Subscribe', ctaHref: 'client.html' },
    { name: 'Enterprise', tagline: 'Complex operations', bullets: ['All modules', 'Unlimited users', 'Custom development', 'SLA-backed uptime'], cta: 'Talk to sales', ctaHref: 'contact_us.html' },
  ];

  host.innerHTML = tiers.map(t => {
    const cls = t.featured ? 'growth featured' : t.name.toLowerCase();
    return `
      <div class="price-card ${cls}">
        ${t.featured ? '<div class="badge" style="background:var(--accent-2);color:#fff;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;border-radius:999px;position:absolute;top:-12px;left:50%;transform:translateX(-50%);">Most popular</div>' : ''}
        <h3>${escHtml(t.name)}</h3>
        <p class="price-sub">${escHtml(t.tagline || '')}</p>
        <ul>${(t.bullets || []).map(b => `<li>${escHtml(b)}</li>`).join('')}</ul>
        <a href="${escAttr(t.ctaHref || 'contact_us.html')}" class="btn ${t.featured ? 'btn-primary' : 'btn-ghost'}">${escHtml(t.cta || 'Subscribe')}</a>
      </div>
    `;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════════
   11. ACADEMY
   ═══════════════════════════════════════════════════════════════ */
function renderAcademy() {
  const at = S.homeContent?.academy || {};
  const h = $('#academy-heading');
  const p = $('#academy-sub');
  const cta = $('#academy-cta');
  if (h && at.heading) h.textContent = at.heading;
  if (p && at.sub) p.textContent = at.sub;
  if (cta && at.ctaHref) {
    cta.href = at.ctaHref;
    cta.textContent = at.ctaLabel || 'Explore the Academy →';
  }
}

/* ═══════════════════════════════════════════════════════════════
   12. FAQ
   ═══════════════════════════════════════════════════════════════ */
function renderFaq() {
  const host = $('#faq-list');
  if (!host) return;
  const faqs = S.marketContent?.faqs || [];

  if (!faqs.length) {
    host.innerHTML = `<p style="text-align:center;color:var(--muted);">No FAQs yet — add them in the admin dashboard under <strong>Market Content</strong>.</p>`;
    return;
  }

  host.innerHTML = faqs.map((f, i) => `
    <details class="faq-item" style="border:1px solid var(--line);border-radius:12px;margin-bottom:10px;background:var(--white);">
      <summary style="padding:18px 20px;cursor:pointer;font-weight:600;font-size:15px;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <span>${escHtml(f.q || '')}</span>
        <i class="fa-solid fa-chevron-down" style="font-size:12px;color:var(--muted);transition:transform .25s;"></i>
      </summary>
      <div style="padding:0 20px 20px;color:var(--muted);font-size:14px;line-height:1.7;">${escHtml(f.a || '')}</div>
    </details>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════════
   13. CONTACT
   ═══════════════════════════════════════════════════════════════ */
function renderContact() {
  const c = S.homeContent?.contact || {};
  const email = $('#contact-email');
  const wa = $('#contact-whatsapp');
  const hours = $('#contact-hours');
  const h = $('#contact-heading');
  const sub = $('#contact-sub');

  if (email && c.email) { email.textContent = c.email; email.href = 'mailto:' + c.email; }
  if (wa && c.whatsapp) { wa.href = `https://wa.me/${c.whatsapp}`; }
  if (hours && c.hours) hours.textContent = c.hours;
  if (h && c.heading) h.textContent = c.heading;
  if (sub && c.sub) sub.textContent = c.sub;
}

/* ═══════════════════════════════════════════════════════════════
   CONTACT FORM
   ═══════════════════════════════════════════════════════════════ */
function wireContactForm() {
  const form = $('#contact-form');
  const status = $('#contact-status');
  if (!form || form._bound) return;
  form._bound = true;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#cf-name')?.value.trim() || '';
    const email = $('#cf-email')?.value.trim() || '';
    const phone = $('#cf-phone')?.value.trim() || '';
    const company = $('#cf-company')?.value.trim() || '';
    const message = $('#cf-message')?.value.trim() || '';

    if (!name || !email || !message) {
      if (status) { status.textContent = 'Name, email and message are required.'; status.className = 'form-status show err'; }
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const origHTML = submitBtn?.innerHTML || 'Send';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…'; }

    try {
      const fb = await loadFirebase();
      const leadId = 'lead-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const lead = {
        id: leadId,
        fullName: name,
        email,
        phone,
        company,
        source: 'Landing Form',
        status: 'New',
        notes: message,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await fb.set(fb.ref(fb.db, `${ROOT}/leads/${leadId}`), lead);

      try {
        const mktId = 'mkt-' + leadId;
        await fb.set(fb.ref(fb.db, `${ROOT}/marketLeads/${mktId}`), {
          ...lead,
          id: mktId,
          type: 'contact',
          isNewClient: true,
          lastSeenAt: new Date().toISOString(),
        });
      } catch (_) {}

      if (status) {
        status.className = 'form-status show ok';
        status.innerHTML = `✅ Thanks ${escHtml(name.split(' ')[0])}! We'll be in touch within one business day.`;
      }
      form.reset();
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = origHTML; }

      try {
        if (typeof window.vioraNotify === 'function') {
          await window.vioraNotify({
            title: 'New contact form submission',
            body: `${name} · ${email} · ${message.slice(0, 60)}`,
            icon: 'fa-envelope',
            level: 'info',
            source: 'landing-contact',
          });
        }
      } catch (_) {}
    } catch (err) {
      console.error('[viora-home] contact submit failed:', err);
      if (status) {
        status.className = 'form-status show err';
        status.textContent = 'Failed to send. Please email support@viora.co.ke or WhatsApp us.';
      }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = origHTML; }
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   3D GLOBE
   ═══════════════════════════════════════════════════════════════ */
function initGlobe() {
  const container = document.getElementById('globe-container');
  if (!container) return;
  if (typeof THREE === 'undefined') {
    console.warn('[viora-home] Three.js not loaded — globe disabled');
    container.innerHTML = `
      <div style="display:grid;place-items:center;height:100%;color:var(--muted);font-size:14px;text-align:center;padding:40px;background:linear-gradient(135deg,rgba(34,103,238,.08),rgba(35,199,217,.08));border-radius:50%;">
        <div>
          <p style="margin:0 0 12px;font-weight:700;color:var(--ink);font-size:16px;">Global network</p>
          <p style="margin:0;font-size:13px;">Africa · Europe · Middle East · Asia · Oceania · Americas<br>connected in real time.</p>
        </div>
      </div>`;
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
  camera.position.set(0, 0, 290);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  const globeGroup = new THREE.Group();
  globeGroup.rotation.y = -0.9;
  globeGroup.rotation.x = 0.15;
  scene.add(globeGroup);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.35);
  sunLight.position.set(300, 120, 240);
  scene.add(sunLight);
  const rimLight = new THREE.DirectionalLight(0x2267EE, 0.55);
  rimLight.position.set(-300, -100, -260);
  scene.add(rimLight);

  const earthRadius = 100;
  const textureLoader = new THREE.TextureLoader();
  const prefersReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const earthMat = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    specular: new THREE.Color(0x111111),
    shininess: 8,
  });

  textureLoader.load(
    'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
    (tex) => { earthMat.map = tex; earthMat.needsUpdate = true; },
    undefined,
    () => { earthMat.color.set(0x1E3A8A); }
  );
  textureLoader.load(
    'https://unpkg.com/three-globe/example/img/earth-night.jpg',
    (tex) => { earthMat.emissiveMap = tex; earthMat.needsUpdate = true; },
    undefined,
    () => {}
  );
  earthMat.emissive = new THREE.Color(0xffffff);
  earthMat.emissiveIntensity = 0.75;
  textureLoader.load(
    'https://unpkg.com/three-globe/example/img/earth-topology.png',
    (tex) => { earthMat.bumpMap = tex; earthMat.bumpScale = 0.55; earthMat.needsUpdate = true; },
    undefined,
    () => {}
  );

  const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(earthRadius, 96, 96), earthMat);
  globeGroup.add(earthMesh);

  const atmMat = new THREE.MeshBasicMaterial({
    color: 0x2267EE, transparent: true, opacity: 0.12, side: THREE.BackSide,
  });
  globeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(earthRadius * 1.025, 64, 64), atmMat));

  const gratMat = new THREE.LineBasicMaterial({ color: 0x2a4a7a, transparent: true, opacity: 0.35 });
  const gratGroup = new THREE.Group();
  globeGroup.add(gratGroup);

  function latLonToVec3(lat, lon, radius) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -(radius * Math.sin(phi) * Math.cos(theta)),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  for (let lat = -75; lat <= 75; lat += 15) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 3) pts.push(latLonToVec3(lat, lon, earthRadius * 1.001));
    gratGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat));
  }
  for (let lon = -180; lon < 180; lon += 15) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 3) pts.push(latLonToVec3(lat, lon, earthRadius * 1.001));
    gratGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat));
  }

  const arcGroup = new THREE.Group();
  globeGroup.add(arcGroup);

  const ARC_CITIES = [
    [-1.29, 36.82], [40.71, -74.01], [51.51, -0.13], [1.35, 103.82],
    [-33.87, 151.21], [35.68, 139.69], [-22.91, -43.17], [19.08, 72.88],
    [25.20, 55.27], [30.04, 31.24], [48.85, 2.35], [-33.92, 18.42],
  ];

  function makeArc(start, end, color) {
    const v1 = latLonToVec3(start[0], start[1], earthRadius * 1.005);
    const v2 = latLonToVec3(end[0], end[1], earthRadius * 1.005);
    const mid = v1.clone().add(v2).multiplyScalar(0.5);
    const dist = v1.distanceTo(v2);
    const lift = 0.18 + Math.min(0.35, dist * 0.0008);
    mid.normalize().multiplyScalar(earthRadius + dist * lift);
    const curve = new THREE.QuadraticBezierCurve3(v1, mid, v2);

    const points = curve.getPoints(50);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    arcGroup.add(new THREE.Line(geo, mat));
  }

  for (let i = 0; i < ARC_CITIES.length; i++) {
    for (let j = i + 1; j < ARC_CITIES.length; j++) {
      if (Math.random() > 0.65) makeArc(ARC_CITIES[i], ARC_CITIES[j], 0x23C7D9);
    }
  }

  let isDragging = false;
  let prevPointer = { x: 0, y: 0 };
  let targetRotX = globeGroup.rotation.x;
  let targetRotY = globeGroup.rotation.y;
  let currentRotX = targetRotX;
  let currentRotY = targetRotY;

  container.addEventListener('pointerdown', (e) => {
    isDragging = true;
    prevPointer = { x: e.clientX, y: e.clientY };
    try { container.setPointerCapture(e.pointerId); } catch (_) {}
  });
  container.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - prevPointer.x;
    const dy = e.clientY - prevPointer.y;
    targetRotY += dx * 0.005;
    targetRotX += dy * 0.005;
    targetRotX = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, targetRotX));
    prevPointer = { x: e.clientX, y: e.clientY };
  });
  container.addEventListener('pointerup', () => { isDragging = false; });
  container.addEventListener('pointercancel', () => { isDragging = false; });

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(resize).observe(container);
  } else {
    window.addEventListener('resize', resize);
  }
  resize();

  const clock = new THREE.Clock();
  let rafId = 0;
  const autoRotate = !prefersReduceMotion;

  function animate() {
    rafId = requestAnimationFrame(animate);
    clock.getElapsedTime();
    if (autoRotate && !isDragging) targetRotY += 0.0012;
    currentRotX += (targetRotX - currentRotX) * 0.08;
    currentRotY += (targetRotY - currentRotY) * 0.08;
    globeGroup.rotation.x = currentRotX;
    globeGroup.rotation.y = currentRotY;
    renderer.render(scene, camera);
  }
  animate();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }
    else if (!rafId) animate();
  });
}

/* ═══════════════════════════════════════════════════════════════
   START
   ═══════════════════════════════════════════════════════════════ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

/* ═══════════════════════════════════════════════════════════════
   MODAL SAFETY NETS
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  document.body.style.overflow = '';
  document.body.style.pointerEvents = '';
}, true);

document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-overlay') && e.target.classList.contains('active')) {
    e.target.classList.remove('active');
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';
  }
}, true);

setInterval(() => {
  const anyActive = document.querySelector('.modal-overlay.active');
  if (!anyActive && document.body.style.overflow === 'hidden') {
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';
  }
}, 1000);

window.VioraHome = { S, renderAll, openOrderModal, openCategoryModal };
if (typeof window.App !== 'object' || !window.App) window.App = {};
window.App.openOrderModal = openOrderModal;
window.App.openCategoryModal = openCategoryModal;
