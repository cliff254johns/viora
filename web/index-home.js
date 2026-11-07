/* ═══════════════════════════════════════════════════════════════
   VIORA — INDEX HOME CONTROLLER (v3.2)
   ═══════════════════════════════════════════════════════════════

   Bug fixes over v3.1:
     • Moved "Bind product cards" block inside renderTourStepDetail
       (was outside the function scope, threw ReferenceError at line 687)
     • Added normalizeIcon() helper for FontAwesome class normalization
     • Applied normalizeIcon to bucket/family chips, industry fallback,
       tour product cards, and strip product cards
     • Exposed App.openOrderModal and App.openCategoryModal globally
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

/* v3.2 — Normalize a FontAwesome icon class string.
   Accepts: "fa-robot", "fa-solid fa-robot", "fas fa-robot", ""
   Returns: "fa-solid fa-robot" or fallback */
const normalizeIcon = (raw, fallback = 'fa-solid fa-cube') => {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return fallback;
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\bfas\b/g, 'fa-solid')
       .replace(/\bfar\b/g, 'fa-regular')
       .replace(/\bfal\b/g, 'fa-light')
       .replace(/\bfab\b/g, 'fa-brands');
  if (/^fa-(solid|regular|light|thin|brands|duotone)\s+/.test(s)) return s;
  return 'fa-solid ' + s;
};
window.normalizeIcon = normalizeIcon;

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

  initGlobe();
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
      <div class="intent-icon"><i class="${escAttr(normalizeIcon(t.icon))}"></i></div>
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
                <i class="${escAttr(normalizeIcon(b.icon))}" style="color:${escAttr(b.color || '#2267EE')}"></i>
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
                <i class="${escAttr(normalizeIcon(f.icon, 'fa-solid fa-folder'))}" style="color:${escAttr(bucket.color || '#2267EE')}"></i>
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
              : `<i class="${escAttr(normalizeIcon(ind.icon))}" style="color:${escAttr(color)};font-size:64px;"></i>`}
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
          const marketCat = String(ind.marketCategory || '').trim().toLowerCase();
          const products = (S.products || []).filter(p => {
            if (p.status === 'archived' || p.status === 'draft') return false;
            return String(p.category || '').trim().toLowerCase() === marketCat;
          });

          if (products.length === 0) return '';

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
                             <div class="tour-product-fallback" style="display:none;"><i class="${escAttr(normalizeIcon(icon))}"></i></div>`
                          : `<div class="tour-product-fallback" style="display:grid;"><i class="${escAttr(normalizeIcon(icon))}"></i></div>`}
                      </div>
                      <div class="tour-product-body">
                        <div class="tour-product-name">${escHtml(p.name || '')}</div>
                        <div class="tour-product-price">KSh ${kes.toLocaleString('en-KE')}</div>
                        <div class="tour-product-actions">
                          <button type="button" class="tour-product-buy" data-tour-buy="${escAttr(p.id)}">
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

  /* Wire back buttons */
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

  /* Wire "Buy now" (category-level) */
  host.querySelector('[data-buy]')?.addEventListener('click', () => {
    openOrderModal({ category: ind.marketCategory || ind.name });
  });

  /* Wire "More" */
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

  /* Wire individual product "Buy" buttons (INSIDE this function's scope) */
  host.querySelectorAll('[data-tour-buy]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = btn.dataset.tourBuy;
      if (pid) openOrderModal({ productId: pid });
    });
  });
}

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

  let list = (S.products || []).filter(p =>
    p.status !== 'archived' && p.status !== 'draft'
  );

  if (list.length === 0) {
    stripSection.style.display = 'none';
    return;
  }
  stripSection.style.display = 'block';

  list.sort((a, b) => (Number(b.totalSold) || 0) - (Number(a.totalSold) || 0));

  const limit = Number(ps.limit) || 0;
  if (limit > 0) list = list.slice(0, limit);

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
            <i class="${escAttr(normalizeIcon(p.icon))}"></i>
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
   STRIP AUTOPLAY
   ═══════════════════════════════════════════════════════════════ */
let _stripAutoplayTimer = null;
let _stripPaused = false;

function startStripAutoplay(host) {
  if (_stripAutoplayTimer) clearInterval(_stripAutoplayTimer);

  _stripPaused = false;
  if (!host._stripHoverBound) {
    host._stripHoverBound = true;
    host.addEventListener('mouseenter', () => { _stripPaused = true; });
    host.addEventListener('mouseleave', () => { _stripPaused = false; });
    host.addEventListener('touchstart', () => { _stripPaused = true; }, { passive: true });
    host.addEventListener('touchend', () => {
      setTimeout(() => { _stripPaused = false; }, 3000);
    }, { passive: true });
  }

  _stripAutoplayTimer = setInterval(() => {
    if (_stripPaused || document.hidden) return;
    const card = host.querySelector('.strip-card');
    if (!card) return;
    const step = card.getBoundingClientRect().width + 16;

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
   REALISTIC HIGH-RES FIBRE CABLE GLOBE (v5.0)
   ─────────────────────────────────────────────────────────────
   · 4096×2048 NASA Blue Marble day texture (crisp continents)
   · Night lights layer (city glow visible on the dark side)
   · Bump map for terrain relief (mountains catch light)
   · Specular highlight for ocean shine
   · ~30 real submarine cables with accurate waypoints
     (2Africa, SEACOM, EASSy, MainOne, SAT-3, EIG, FLAG,
      SEA-ME-WE, MAREA, TAT-14, Dunant, JGA, SJC, etc.)
   · Cables lifted 1.2% above surface — visible on land + sea
   · Animated data pulses flowing in both directions
   · City hub markers with atmospheric glow
   ═══════════════════════════════════════════════════════════════ */
function initGlobe() {
  const container = document.getElementById('globe-container');
  if (!container) return;

  if (typeof THREE === 'undefined') {
    console.warn('[viora-home] Three.js not loaded — globe disabled');
    container.innerHTML = `
      <div style="display:grid;place-items:center;height:100%;color:var(--muted);font-size:14px;text-align:center;padding:40px;background:linear-gradient(135deg,rgba(34,103,238,.08),rgba(35,199,217,.08));border-radius:50%;">
        <div>
          <p style="margin:0 0 12px;font-weight:700;color:var(--ink);font-size:16px;">Global fibre network</p>
          <p style="margin:0;font-size:13px;">Africa · Europe · Middle East · Asia · Americas<br>connected by submarine cables.</p>
        </div>
      </div>`;
    return;
  }

  /* ═══════════════════════════════════════════════════════════
     CITY HUBS — landing points + internet exchange points
     [name, lat, lon, size 1-3]
     ═══════════════════════════════════════════════════════════ */
  const HUBS = [
    // ── Africa ──
    ['Nairobi',      -1.292, 36.822, 3],
    ['Mombasa',      -4.043, 39.668, 2],
    ['Dar es Salaam',-6.792, 39.208, 2],
    ['Johannesburg',-26.204, 28.047, 3],
    ['Cape Town',   -33.925, 18.424, 2],
    ['Durban',      -29.858, 31.021, 2],
    ['Maputo',      -25.966, 32.573, 1],
    ['Lagos',         6.524,  3.379, 3],
    ['Accra',         5.604, -0.187, 2],
    ['Abidjan',       5.360, -4.008, 1],
    ['Dakar',        14.716,-17.467, 2],
    ['Casablanca',   33.573, -7.590, 1],
    ['Cairo',        30.044, 31.236, 3],
    ['Alexandria',   31.200, 29.919, 2],
    ['Port Said',    31.265, 32.301, 2],
    ['Djibouti',     11.588, 43.145, 2],
    ['Mogadishu',     2.046, 45.342, 1],
    ['Khartoum',     15.500, 32.559, 1],
    ['Suez',         29.966, 32.549, 2],
    // ── Middle East ──
    ['Dubai',        25.205, 55.271, 3],
    ['Abu Dhabi',    24.453, 54.377, 2],
    ['Muscat',       23.588, 58.408, 2],
    ['Fujairah',     25.128, 56.349, 2],
    ['Riyadh',       24.713, 46.675, 1],
    ['Jeddah',       21.485, 39.193, 2],
    ['Beirut',       33.888, 35.495, 2],
    ['Istanbul',     41.008, 28.978, 2],
    // ── South Asia ──
    ['Karachi',      24.861, 67.010, 3],
    ['Mumbai',       19.076, 72.878, 3],
    ['Chennai',      13.083, 80.270, 2],
    ['Cochin',        9.931, 76.267, 2],
    ['Colombo',       6.927, 79.861, 2],
    ['Dhaka',        23.810, 90.412, 1],
    // ── SE Asia ──
    ['Singapore',     1.352,103.820, 3],
    ['Jakarta',      -6.208,106.845, 2],
    ['Kuala Lumpur',  3.139,101.687, 2],
    ['Bangkok',      13.756,100.502, 2],
    ['Hong Kong',    22.319,114.169, 3],
    ['Manila',       14.599,120.984, 2],
    ['Taipei',       25.033,121.565, 2],
    // ── East Asia ──
    ['Tokyo',        35.676,139.650, 3],
    ['Seoul',        37.567,126.978, 2],
    ['Shanghai',     31.230,121.474, 3],
    ['Beijing',      39.904,116.407, 2],
    // ── Oceania ──
    ['Sydney',      -33.868,151.209, 3],
    ['Perth',       -31.952,115.861, 2],
    ['Auckland',    -36.848,174.763, 1],
    ['Suva',        -18.141,178.442, 1],
    // ── Europe ──
    ['London',       51.507, -0.128, 3],
    ['Paris',        48.857,  2.352, 3],
    ['Marseille',    43.297,  5.369, 3],
    ['Frankfurt',    50.110,  8.682, 3],
    ['Amsterdam',    52.370,  4.895, 3],
    ['Lisbon',       38.722, -9.139, 2],
    ['Madrid',       40.417, -3.704, 2],
    ['Milan',        45.464,  9.190, 2],
    ['Athens',       37.984, 23.727, 1],
    ['Copenhagen',   55.676, 12.568, 2],
    ['Stockholm',    59.329, 18.069, 2],
    ['Dublin',       53.350, -6.260, 1],
    ['Oslo',         59.914, 10.752, 1],
    ['Helsinki',     60.169, 24.938, 1],
    ['Warsaw',       52.229, 21.011, 1],
    ['Moscow',       55.756, 37.617, 2],
    // ── North America ──
    ['New York',     40.713,-74.006, 3],
    ['Ashburn',      39.044,-77.487, 3],
    ['Chicago',      41.878,-87.630, 2],
    ['Los Angeles',  34.052,-118.244, 3],
    ['Seattle',      47.606,-122.332, 2],
    ['Miami',        25.762,-80.192, 3],
    ['Houston',      29.760,-95.370, 1],
    ['Dallas',       32.777,-96.797, 1],
    ['Toronto',      43.653,-79.383, 2],
    ['Vancouver',    49.283,-123.121, 1],
    ['Montreal',     45.501,-73.567, 1],
    ['Mexico City',  19.433,-99.133, 2],
    // ── South America ──
    ['Sao Paulo',   -23.551,-46.633, 3],
    ['Rio de Janeiro',-22.907,-43.173, 2],
    ['Buenos Aires',-34.607,-58.382, 3],
    ['Santiago',    -33.449,-70.669, 2],
    ['Lima',        -12.046,-77.043, 2],
    ['Bogota',        4.711,-74.072, 2],
    ['Cartagena',    10.391,-75.479, 1],
    ['Fortaleza',    -3.718,-38.543, 2],
    ['Recife',       -8.048,-34.877, 2],
    ['Salvador',    -12.973,-38.502, 1],
  ];

  /* ═══════════════════════════════════════════════════════════
     SUBMARINE CABLES — real landing points & ocean waypoints
     Sources: TeleGeography Submarine Cable Map
     Each cable: { name, color, waypoints }
     ═══════════════════════════════════════════════════════════ */
  const CABLES = [
    /* ────── 2Africa (Meta/Meta + partners) ────── */
    {
      name: '2Africa',
      color: 0x00E0FF,
      waypoints: [
        [51.507, -0.128],   // London
        [43.297,  5.369],   // Marseille
        [36.000, -5.500],   // Gibraltar
        [31.200, 32.200],   // Port Said
        [29.966, 32.549],   // Suez
        [15.500, 40.500],   // Red Sea
        [11.588, 43.145],   // Djibouti
        [2.046, 45.342],    // Mogadishu
        [-4.043, 39.668],   // Mombasa
        [-6.792, 39.208],   // Dar es Salaam
        [-19.000, 40.000],  // Mozambique
        [-25.966, 32.573],  // Maputo
        [-29.858, 31.021],  // Durban
        [-33.925, 18.424],  // Cape Town
        [-6.000, 4.000],    // Gulf of Guinea
        [5.360, -4.008],    // Abidjan
        [5.604, -0.187],    // Accra
        [6.524, 3.379],     // Lagos
        [14.716, -17.467],  // Dakar
        [28.000, -15.000],  // Canaries
        [38.722, -9.139],   // Lisbon
        [51.507, -0.128],   // London
      ],
    },
    /* ────── SEACOM ────── */
    {
      name: 'SEACOM',
      color: 0x23C7D9,
      waypoints: [
        [-4.043, 39.668],   // Mombasa
        [-6.792, 39.208],   // Dar es Salaam
        [-19.000, 40.500],  // Mozambique Channel
        [-25.966, 32.573],  // Maputo
        [-29.858, 31.021],  // Durban
        [-33.925, 18.424],  // Cape Town
        [5.000, 3.000],     // Gulf of Guinea
        [14.716, -17.467],  // Dakar
        [28.000, -15.000],  // Canaries
        [36.000, -5.500],   // Gibraltar
        [43.297, 5.369],    // Marseille
        [51.507, -0.128],   // London
        [25.205, 55.271],   // Dubai
        [19.076, 72.878],   // Mumbai
      ],
    },
    /* ────── EASSy ────── */
    {
      name: 'EASSy',
      color: 0x8B5CF6,
      waypoints: [
        [-29.858, 31.021],  // Durban
        [-25.966, 32.573],  // Maputo
        [-19.000, 40.500],  // Mozambique
        [-6.792, 39.208],   // Dar es Salaam
        [-4.043, 39.668],   // Mombasa
        [-1.292, 36.822],   // Nairobi (via land)
        [2.046, 45.342],    // Mogadishu
        [11.588, 43.145],   // Djibouti
        [15.500, 40.500],   // Red Sea
        [29.966, 32.549],   // Suez
        [31.200, 32.200],   // Port Said
        [33.500, 10.000],   // Tunisia
        [43.297, 5.369],    // Marseille
        [51.507, -0.128],   // London
      ],
    },
    /* ────── MainOne ────── */
    {
      name: 'MainOne',
      color: 0x10B981,
      waypoints: [
        [6.524, 3.379],     // Lagos
        [5.604, -0.187],    // Accra
        [14.716, -17.467],  // Dakar
        [22.000, -18.000],  // Canaries
        [36.000, -5.500],   // Gibraltar
        [38.722, -9.139],   // Lisbon
        [51.507, -0.128],   // London
      ],
    },
    /* ────── SAT-3 / WASC ────── */
    {
      name: 'SAT-3',
      color: 0xF59E0B,
      waypoints: [
        [14.716, -17.467],  // Dakar
        [6.524, 3.379],     // Lagos
        [5.604, -0.187],    // Accra
        [5.360, -4.008],    // Abidjan
        [-22.960, 14.510],  // Namibia coast
        [-33.925, 18.424],  // Cape Town
        [-25.966, 32.573],  // Maputo
        [-4.043, 39.668],   // Mombasa
      ],
    },
    /* ────── Europe India Gateway ────── */
    {
      name: 'Europe India Gateway',
      color: 0xEC4899,
      waypoints: [
        [51.507, -0.128],   // London
        [38.722, -9.139],   // Lisbon
        [36.000, -5.500],   // Gibraltar
        [38.000, 15.000],   // Sicily
        [31.200, 32.200],   // Port Said
        [29.966, 32.549],   // Suez
        [15.500, 40.500],   // Red Sea
        [11.588, 43.145],   // Djibouti
        [12.500, 45.000],   // Gulf of Aden
        [23.588, 58.408],   // Muscat
        [25.205, 55.271],   // Dubai
        [24.861, 67.010],   // Karachi
        [19.076, 72.878],   // Mumbai
      ],
    },
    /* ────── FLAG Europe Asia ────── */
    {
      name: 'FLAG Europe-Asia',
      color: 0xEF4444,
      waypoints: [
        [51.507, -0.128],   // London
        [36.000, -5.500],   // Gibraltar
        [38.000, 15.000],   // Sicily
        [31.200, 32.200],   // Port Said
        [29.966, 32.549],   // Suez
        [15.500, 40.500],   // Red Sea
        [11.588, 43.145],   // Djibouti
        [23.588, 58.408],   // Muscat
        [25.205, 55.271],   // Dubai
        [24.861, 67.010],   // Karachi
        [19.076, 72.878],   // Mumbai
        [6.927, 79.861],    // Colombo
        [1.352, 103.820],   // Singapore
        [22.319, 114.169],  // Hong Kong
        [35.676, 139.650],  // Tokyo
      ],
    },
    /* ────── SEA-ME-WE 3 ────── */
    {
      name: 'SEA-ME-WE 3',
      color: 0x6366F1,
      waypoints: [
        [52.370, 4.895],    // Amsterdam
        [51.507, -0.128],   // London
        [48.857, 2.352],    // Paris
        [43.297, 5.369],    // Marseille
        [36.000, -5.500],   // Gibraltar
        [38.000, 15.000],   // Sicily
        [31.200, 32.200],   // Port Said
        [29.966, 32.549],   // Suez
        [15.500, 40.500],   // Red Sea
        [11.588, 43.145],   // Djibouti
        [23.588, 58.408],   // Muscat
        [25.205, 55.271],   // Dubai
        [24.861, 67.010],   // Karachi
        [19.076, 72.878],   // Mumbai
        [6.927, 79.861],    // Colombo
        [1.352, 103.820],   // Singapore
        [14.599, 120.984],  // Manila
        [35.676, 139.650],  // Tokyo
      ],
    },
    /* ────── SEA-ME-WE 5 ────── */
    {
      name: 'SEA-ME-WE 5',
      color: 0xA855F7,
      waypoints: [
        [43.297, 5.369],    // Marseille
        [36.000, -5.500],   // Gibraltar
        [31.200, 32.200],   // Port Said
        [29.966, 32.549],   // Suez
        [15.500, 40.500],   // Red Sea
        [11.588, 43.145],   // Djibouti
        [23.588, 58.408],   // Muscat
        [25.205, 55.271],   // Dubai
        [24.861, 67.010],   // Karachi
        [19.076, 72.878],   // Mumbai
        [6.927, 79.861],    // Colombo
        [1.352, 103.820],   // Singapore
      ],
    },
    /* ────── SEA-ME-WE 4 ────── */
    {
      name: 'SEA-ME-WE 4',
      color: 0x14B8A6,
      waypoints: [
        [43.297, 5.369],    // Marseille
        [36.000, -5.500],   // Gibraltar
        [31.200, 32.200],   // Port Said
        [29.966, 32.549],   // Suez
        [15.500, 40.500],   // Red Sea
        [11.588, 43.145],   // Djibouti
        [23.588, 58.408],   // Muscat
        [25.205, 55.271],   // Dubai
        [24.861, 67.010],   // Karachi
        [19.076, 72.878],   // Mumbai
        [6.927, 79.861],    // Colombo
        [1.352, 103.820],   // Singapore
        [3.139, 101.687],   // Kuala Lumpur
      ],
    },
    /* ────── Africa-1 ────── */
    {
      name: 'Africa-1',
      color: 0xF97316,
      waypoints: [
        [43.297, 5.369],    // Marseille
        [31.200, 32.200],   // Port Said
        [29.966, 32.549],   // Suez
        [11.588, 43.145],   // Djibouti
        [-4.043, 39.668],   // Mombasa
        [-6.792, 39.208],   // Dar es Salaam
        [-25.966, 32.573],  // Maputo
        [-29.858, 31.021],  // Durban
        [-33.925, 18.424],  // Cape Town
        [6.524, 3.379],     // Lagos
        [14.716, -17.467],  // Dakar
        [38.722, -9.139],   // Lisbon
        [51.507, -0.128],   // London
      ],
    },
    /* ────── Dunant (Google) ────── */
    {
      name: 'Dunant',
      color: 0x0EA5E9,
      waypoints: [
        [36.850, -76.000],  // Virginia Beach
        [38.000, -30.000],  // Azores
        [43.297,  5.369],   // Marseille
      ],
    },
    /* ────── MAREA (Microsoft/Meta) ────── */
    {
      name: 'MAREA',
      color: 0xDC2626,
      waypoints: [
        [36.850, -76.000],  // Virginia Beach
        [40.000, -40.000],  // Mid-Atlantic
        [43.700, -7.000],   // Spanish coast
        [43.500, -1.500],   // Bilbao
      ],
    },
    /* ────── TAT-14 ────── */
    {
      name: 'TAT-14',
      color: 0xDB2777,
      waypoints: [
        [36.850, -76.000],  // Virginia Beach
        [47.606, -122.332], // Seattle (via land route approximation)
        [52.370,  4.895],   // Amsterdam (via Nordic)
        [55.676, 12.568],   // Copenhagen
        [59.329, 18.069],   // Stockholm
        [51.507, -0.128],   // London
      ],
    },
    /* ────── GTT Atlantic ────── */
    {
      name: 'GTT Atlantic',
      color: 0x059669,
      waypoints: [
        [40.713, -74.006],  // New York
        [51.507, -0.128],   // London
        [51.507, -0.128],   // (branch)
        [53.350, -6.260],   // Dublin
      ],
    },
    /* ────── America Movil SAm-1 ────── */
    {
      name: 'SAm-1',
      color: 0x0891B2,
      waypoints: [
        [40.713, -74.006],  // New York
        [25.762, -80.192],  // Miami
        [10.391, -75.479],  // Cartagena
        [4.711, -74.072],   // Bogota
        [-12.046, -77.043], // Lima
        [-33.449, -70.669], // Santiago
        [-34.607, -58.382], // Buenos Aires
        [-34.000, -55.000],
        [-23.551, -46.633], // Sao Paulo
        [-22.907, -43.173], // Rio
        [-8.048, -34.877],  // Recife
        [-3.718, -38.543],  // Fortaleza
        [25.762, -80.192],  // Miami
      ],
    },
    /* ────── Pacific Light Cable Network ────── */
    {
      name: 'PLCN',
      color: 0x7C3AED,
      waypoints: [
        [34.052, -118.244], // Los Angeles
        [25.000, -160.000], // Pacific
        [22.319, 114.169],  // Hong Kong
        [14.599, 120.984],  // Manila
      ],
    },
    /* ────── JGA (Japan-Guam-Australia) ────── */
    {
      name: 'JGA',
      color: 0xEA580C,
      waypoints: [
        [35.676, 139.650],  // Tokyo
        [13.500, 144.800],  // Guam
        [-31.952, 115.861], // Perth
        [-33.868, 151.209], // Sydney
      ],
    },
    /* ────── Australia-Singapore Cable ────── */
    {
      name: 'Australia-Singapore',
      color: 0xFBBF24,
      waypoints: [
        [1.352, 103.820],   // Singapore
        [-6.208, 106.845],  // Jakarta
        [-12.000, 115.000], // Indian Ocean
        [-31.952, 115.861], // Perth
        [-33.868, 151.209], // Sydney
      ],
    },
    /* ────── Southern Cross Cable ────── */
    {
      name: 'Southern Cross',
      color: 0x15803D,
      waypoints: [
        [-33.868, 151.209], // Sydney
        [-18.141, 178.442], // Suva
        [-36.848, 174.763], // Auckland
        [21.500, -157.500], // Hawaii
        [34.052, -118.244], // Los Angeles
      ],
    },
    /* ────── Hawaiki ────── */
    {
      name: 'Hawaiki',
      color: 0xBE123C,
      waypoints: [
        [-36.848, 174.763], // Auckland
        [-18.141, 178.442], // Suva
        [-13.833, -171.750],// Samoa
        [21.500, -157.500], // Hawaii
        [47.606, -122.332], // Seattle
      ],
    },
    /* ────── SEA-US ────── */
    {
      name: 'SEA-US',
      color: 0x65A30D,
      waypoints: [
        [14.599, 120.984],  // Manila
        [7.000, 130.000],   // Philippine Sea
        [21.500, -157.500], // Hawaii
        [34.052, -118.244], // Los Angeles
      ],
    },
    /* ────── Indian Ocean crossing (Mumbai-Africa) ────── */
    {
      name: 'Mumbai–Djibouti',
      color: 0x0891B2,
      waypoints: [
        [19.076, 72.878],   // Mumbai
        [15.000, 60.000],   // Arabian Sea
        [11.588, 43.145],   // Djibouti
      ],
    },
    /* ────── Karachi to Djibouti ────── */
    {
      name: 'Karachi–Djibouti',
      color: 0x4338CA,
      waypoints: [
        [24.861, 67.010],   // Karachi
        [18.000, 55.000],   // Arabian Sea
        [11.588, 43.145],   // Djibouti
      ],
    },
    /* ────── Mumbai to Singapore ────── */
    {
      name: 'Mumbai–Singapore',
      color: 0x0EA5E9,
      waypoints: [
        [19.076, 72.878],   // Mumbai
        [6.927, 79.861],    // Colombo
        [1.352, 103.820],   // Singapore
      ],
    },
    /* ────── Chennai to Singapore ────── */
    {
      name: 'Chennai–Singapore',
      color: 0x14B8A6,
      waypoints: [
        [13.083, 80.270],   // Chennai
        [5.000, 90.000],    // Bay of Bengal
        [1.352, 103.820],   // Singapore
      ],
    },
    /* ────── Europe to South America ────── */
    {
      name: 'EllaLink',
      color: 0x6366F1,
      waypoints: [
        [38.722, -9.139],   // Lisbon
        [28.000, -18.000],  // Canaries
        [-3.718, -38.543],  // Fortaleza
        [-23.551, -46.633], // Sao Paulo
      ],
    },
    /* ────── Africa to South America ────── */
    {
      name: 'SAIL',
      color: 0xDC2626,
      waypoints: [
        [5.604, -0.187],    // Accra
        [-3.718, -38.543],  // Fortaleza
        [-22.907, -43.173], // Rio
      ],
    },
  ];

  /* ── Scene setup ── */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
  camera.position.set(0, 0, 300);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  const globeGroup = new THREE.Group();
  globeGroup.rotation.y = -0.9;
  globeGroup.rotation.x = 0.15;
  scene.add(globeGroup);

  /* ── Lights ── */
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.35);
  sunLight.position.set(500, 250, 400);
  scene.add(sunLight);

  /* Soft fill from the opposite side so the dark side isn't pitch black */
  const fillLight = new THREE.DirectionalLight(0x1a3a5c, 0.35);
  fillLight.position.set(-400, -100, -300);
  scene.add(fillLight);

  const earthRadius = 100;
  const textureLoader = new THREE.TextureLoader();

  /* ═══════════════════════════════════════════════════════════
     HIGH-RES EARTH — 4096×2048 NASA Blue Marble
     Multiple CDN fallbacks in case one fails
     ═══════════════════════════════════════════════════════════ */
  const DAY_URLS = [
    'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg',
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/textures/planets/earth_atmos_2048.jpg',
  ];
  const NIGHT_URLS = [
    'https://unpkg.com/three-globe/example/img/earth-night.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_lights_2048.png',
  ];
  const BUMP_URLS = [
    'https://unpkg.com/three-globe/example/img/earth-topology.png',
    'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg',
  ];
  const SPECULAR_URLS = [
    'https://unpkg.com/three-globe/example/img/earth-water.png',
  ];

  function tryLoadTexture(urls, onLoad) {
    let i = 0;
    function attempt() {
      if (i >= urls.length) return;
      const url = urls[i++];
      textureLoader.load(
        url,
        (tex) => {
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy?.() || 1;
          if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
          onLoad(tex);
        },
        undefined,
        () => { attempt(); }
      );
    }
    attempt();
  }

  /* Phong material — supports bump, specular, night-emissive */
  const earthMat = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.35,
    specular: new THREE.Color(0x1e3a8a),
    shininess: 15,
    bumpScale: 0.8,
  });

  tryLoadTexture(DAY_URLS, (tex) => {
    earthMat.map = tex;
    earthMat.needsUpdate = true;
  });
  tryLoadTexture(NIGHT_URLS, (tex) => {
    earthMat.emissiveMap = tex;
    earthMat.emissiveIntensity = 0.55;
    earthMat.needsUpdate = true;
  });
  tryLoadTexture(BUMP_URLS, (tex) => {
    earthMat.bumpMap = tex;
    earthMat.needsUpdate = true;
  });
  tryLoadTexture(SPECULAR_URLS, (tex) => {
    earthMat.specularMap = tex;
    earthMat.needsUpdate = true;
  });

  const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(earthRadius, 96, 96), earthMat);
  globeGroup.add(earthMesh);

  /* ═══════════════════════════════════════════════════════════
     ATMOSPHERE — soft blue halo
     ═══════════════════════════════════════════════════════════ */
  const atmMat = new THREE.MeshBasicMaterial({
    color: 0x2267EE,
    transparent: true,
    opacity: 0.12,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  globeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(earthRadius * 1.035, 64, 64), atmMat));

  /* ═══════════════════════════════════════════════════════════
     LAT/LON → VECTOR
     ═══════════════════════════════════════════════════════════ */
  function latLonToVec3(lat, lon, radius) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -(radius * Math.sin(phi) * Math.cos(theta)),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  /* ═══════════════════════════════════════════════════════════
     CABLES — CatmullRom curves + animated pulses
     Cables lifted 1.2% above surface → visible on land + sea
     ═══════════════════════════════════════════════════════════ */
  const CABLE_LIFT = 1.012;   // 1.2% above surface — visible both on land and water
  const cableCurves = [];
  const cableLayer = new THREE.Group();
  globeGroup.add(cableLayer);

  CABLES.forEach(cable => {
    const waypoints = cable.waypoints;
    if (!waypoints || waypoints.length < 2) return;

    const vecPoints = waypoints.map(([lat, lon]) =>
      latLonToVec3(lat, lon, earthRadius * CABLE_LIFT)
    );

    const curve = new THREE.CatmullRomCurve3(vecPoints, false, 'catmullrom', 0.5);
    const points = curve.getPoints(Math.max(60, waypoints.length * 24));

    /* Cable line */
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: cable.color,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    cableLayer.add(line);

    /* Pulses along this cable */
    const pulses = [];
    const PULSE_COUNT = 4;
    for (let i = 0; i < PULSE_COUNT; i++) {
      const pulseGeo = new THREE.SphereGeometry(1.15, 6, 6);
      const pulseMat = new THREE.MeshBasicMaterial({
        color: cable.color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pulse = new THREE.Mesh(pulseGeo, pulseMat);
      pulse.userData.offset = i / PULSE_COUNT;
      pulse.userData.speed = 0.05 + Math.random() * 0.035;
      pulse.userData.direction = Math.random() > 0.5 ? 1 : -1;
      globeGroup.add(pulse);
      pulses.push(pulse);
    }

    cableCurves.push({ curve, color: cable.color, pulses });
  });

  /* ═══════════════════════════════════════════════════════════
     CITY HUB MARKERS
     ═══════════════════════════════════════════════════════════ */
  const hubGroup = new THREE.Group();
  globeGroup.add(hubGroup);

  HUBS.forEach(([name, lat, lon, size]) => {
    const pos = latLonToVec3(lat, lon, earthRadius * 1.014);
    const radius = size === 3 ? 2.4 : size === 2 ? 1.7 : 1.2;

    /* Outer glow */
    const glowGeo = new THREE.SphereGeometry(radius * 3, 10, 10);
    const glowMat = new THREE.MeshBasicMaterial({
      color: size === 3 ? 0x00E0FF : size === 2 ? 0x23C7D9 : 0x64D2FF,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(pos);
    hubGroup.add(glow);

    /* Solid marker */
    const nodeGeo = new THREE.SphereGeometry(radius, 10, 10);
    const nodeMat = new THREE.MeshBasicMaterial({
      color: size === 3 ? 0xFFFFFF : 0x00E0FF,
    });
    const node = new THREE.Mesh(nodeGeo, nodeMat);
    node.position.copy(pos);
    hubGroup.add(node);

    /* Bright center for largest hubs */
    if (size === 3) {
      const centerGeo = new THREE.SphereGeometry(radius * 0.5, 8, 8);
      const centerMat = new THREE.MeshBasicMaterial({ color: 0x00FFFF });
      const center = new THREE.Mesh(centerGeo, centerMat);
      center.position.copy(pos);
      hubGroup.add(center);
    }
  });


  /* ═══════════════════════════════════════════════════════════
     VIORA CORE — central hub with per-node coloured data flows
     ─────────────────────────────────────────────────────────
     A pulsing core at the centre of the network. Data pulses
     flow FROM each hub TO the core AND from the core BACK to
     each hub — using that hub's unique colour. This visually
     communicates the VIORA metaphor: one central system,
     many connected domains.
     ═══════════════════════════════════════════════════════════ */

  /* Per-node colours — one distinct colour per hub.
     Each hub gets a colour from the palette below, cycled. */
  const NODE_COLORS = [
    0xFF3B30,  // Apple Red
    0xFF9500,  // Apple Orange
    0xFFCC00,  // Apple Yellow
    0x34C759,  // Apple Green
    0x30D158,  // Apple Mint
    0x00E0FF,  // Cyan
    0x64D2FF,  // Light Blue
    0x0A84FF,  // Apple Blue
    0x5E5CE6,  // Apple Indigo
    0xBF5AF2,  // Apple Purple
    0xFF2D55,  // Apple Pink
    0xAF52DE,  // Apple Violet
    0xFF9F0A,  // Apple Amber
    0x30B0C7,  // Teal
    0x14B8A6,  // Deep Teal
    0xF97316,  // Orange
    0xEC4899,  // Rose
    0x8B5CF6,  // Purple
    0x10B981,  // Emerald
    0x06B6D4,  // Sky
  ];

  /* ── VIORA Core central sphere ── */
  const coreGroup = new THREE.Group();
  globeGroup.add(coreGroup);

  /* Outer glow */
  const coreGlowGeo = new THREE.SphereGeometry(5.5, 24, 24);
  const coreGlowMat = new THREE.MeshBasicMaterial({
    color: 0x00E0FF,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coreGlow = new THREE.Mesh(coreGlowGeo, coreGlowMat);
  coreGroup.add(coreGlow);

  /* Mid glow */
  const coreMidGeo = new THREE.SphereGeometry(3.5, 20, 20);
  const coreMidMat = new THREE.MeshBasicMaterial({
    color: 0x0A84FF,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coreMid = new THREE.Mesh(coreMidGeo, coreMidMat);
  coreGroup.add(coreMid);

  /* Solid core */
  const coreGeo = new THREE.SphereGeometry(2.2, 20, 20);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreGroup.add(coreMesh);

  /* Bright center */
  const coreCenterGeo = new THREE.SphereGeometry(1.0, 16, 16);
  const coreCenterMat = new THREE.MeshBasicMaterial({ color: 0x00FFFF });
  const coreCenter = new THREE.Mesh(coreCenterGeo, coreCenterMat);
  coreGroup.add(coreCenter);

  /* Pulsing rings around the core */
  const coreRings = [];
  for (let r = 0; r < 3; r++) {
    const ringGeo = new THREE.RingGeometry(4 + r * 1.5, 4.3 + r * 1.5, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: r === 0 ? 0x00E0FF : r === 1 ? 0x0A84FF : 0xBF5AF2,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.userData.baseScale = 1;
    ring.userData.phase = r / 3;
    coreGroup.add(ring);
    coreRings.push(ring);
  }

  /* ── Flows: 3 legs per hub (in → core → out) ──
     Each hub gets:
       · IN line   (hub → core)
       · OUT line  (core → hub)
       · 2 pulses  (one inward, one outward, offset)
     Coloured per that hub's assigned colour. */

  const coreOrigin = new THREE.Vector3(0, 0, 0);
  const flowGroup = new THREE.Group();
  globeGroup.add(flowGroup);
  const coreFlows = [];    // [{ inCurve, outCurve, inPulses[], outPulses[] }]

  /* Only use hubs that are "primary" (size 3) for clarity — 18 flows
     is enough visual density. To use all 85, change the filter below. */
  const FLOW_HUBS = HUBS.filter(h => h[3] === 3);

  FLOW_HUBS.forEach(([name, lat, lon, size], idx) => {
    const color = NODE_COLORS[idx % NODE_COLORS.length];
    const hubPos = latLonToVec3(lat, lon, earthRadius * 1.015);

    /* ── IN curve: hub → core (arc lifted slightly above surface) ── */
    const inMid = hubPos.clone().multiplyScalar(0.5).add(coreOrigin.clone().multiplyScalar(0.5));
    /* Push the mid-point outward from the globe centre so the arc curves nicely */
    const inMidLen = inMid.length() || 1;
    const inControl = inMid.normalize().multiplyScalar(inMidLen + 8);
    const inCurve = new THREE.QuadraticBezierCurve3(hubPos, inControl, coreOrigin);

    const inPoints = inCurve.getPoints(40);
    const inGeo = new THREE.BufferGeometry().setFromPoints(inPoints);
    const inMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const inLine = new THREE.Line(inGeo, inMat);
    flowGroup.add(inLine);

    /* ── OUT curve: core → hub ── */
    const outMid = coreOrigin.clone().multiplyScalar(0.5).add(hubPos.clone().multiplyScalar(0.5));
    const outMidLen = outMid.length() || 1;
    const outControl = outMid.normalize().multiplyScalar(outMidLen + 8);
    const outCurve = new THREE.QuadraticBezierCurve3(coreOrigin, outControl, hubPos);

    const outPoints = outCurve.getPoints(40);
    const outGeo = new THREE.BufferGeometry().setFromPoints(outPoints);
    const outMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const outLine = new THREE.Line(outGeo, outMat);
    flowGroup.add(outLine);

    /* ── IN pulse (hub → core) ── */
    const inPulseGeo = new THREE.SphereGeometry(1.4, 8, 8);
    const inPulseMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const inPulse = new THREE.Mesh(inPulseGeo, inPulseMat);
    inPulse.userData.offset = Math.random();
    inPulse.userData.speed = 0.18 + Math.random() * 0.08;
    flowGroup.add(inPulse);

    /* ── OUT pulse (core → hub) ── */
    const outPulseGeo = new THREE.SphereGeometry(1.4, 8, 8);
    const outPulseMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const outPulse = new THREE.Mesh(outPulseGeo, outPulseMat);
    outPulse.userData.offset = Math.random();
    outPulse.userData.speed = 0.18 + Math.random() * 0.08;
    flowGroup.add(outPulse);

    coreFlows.push({
      inCurve, outCurve,
      inPulse, outPulse,
      color,
    });
  });

  /* ═══════════════════════════════════════════════════════════
     CONTROLS
     ═══════════════════════════════════════════════════════════ */
   
  /* ═══════════════════════════════════════════════════════════
     CONTROLS
     ═══════════════════════════════════════════════════════════ */
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

  /* ═══════════════════════════════════════════════════════════
     RESIZE
     ═══════════════════════════════════════════════════════════ */
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

  /* ═══════════════════════════════════════════════════════════
     ANIMATE
     ═══════════════════════════════════════════════════════════ */
  const clock = new THREE.Clock();
  let rafId = 0;
  const autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animate() {
    rafId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    if (autoRotate && !isDragging) targetRotY += 0.0009;
    currentRotX += (targetRotX - currentRotX) * 0.08;
    currentRotY += (targetRotY - currentRotY) * 0.08;
    globeGroup.rotation.x = currentRotX;
    globeGroup.rotation.y = currentRotY;

      /* Move pulses along their cable */
    cableCurves.forEach(({ curve, pulses }) => {
      pulses.forEach(pulse => {
        const offset = pulse.userData.offset;
        const speed = pulse.userData.speed;
        const direction = pulse.userData.direction;

        let progress = (offset + t * speed * direction) % 1;
        if (progress < 0) progress += 1;

        try {
          const point = curve.getPoint(Math.min(0.9999, Math.max(0.0001, progress)));
          pulse.position.copy(point);

          /* Fade near endpoints so it looks like the pulse enters/exits */
          const edgeFade = Math.min(1, Math.min(progress, 1 - progress) * 6);
          pulse.material.opacity = 0.35 + edgeFade * 0.65;
        } catch (_) {}
      });
    });

    /* ═══ VIORA CORE FLOWS ═══ */

    /* Pulsing rings around the core */
    coreRings.forEach(ring => {
      const phase = ring.userData.phase;
      const cycle = ((t * 0.4) + phase) % 1;
      const scale = 1 + cycle * 2.2;
      ring.scale.set(scale, scale, scale);
      ring.material.opacity = 0.5 * (1 - cycle);
    });

    /* Gentle core glow breathing */
    const breathe = 1 + Math.sin(t * 1.5) * 0.08;
    coreGroup.scale.set(breathe, breathe, breathe);

    /* IN / OUT pulses */
    coreFlows.forEach(flow => {
      /* IN pulse: hub → core */
      const inProgress = (flow.inPulse.userData.offset + t * flow.inPulse.userData.speed) % 1;
      try {
        const inPoint = flow.inCurve.getPoint(Math.min(0.9999, Math.max(0.0001, inProgress)));
        flow.inPulse.position.copy(inPoint);
        /* Bright in the middle, fade at ends */
        const inFade = Math.min(1, Math.min(inProgress, 1 - inProgress) * 4);
        flow.inPulse.material.opacity = 0.4 + inFade * 0.6;
      } catch (_) {}

      /* OUT pulse: core → hub */
      const outProgress = (flow.outPulse.userData.offset + t * flow.outPulse.userData.speed) % 1;
      try {
        const outPoint = flow.outCurve.getPoint(Math.min(0.9999, Math.max(0.0001, outProgress)));
        flow.outPulse.position.copy(outPoint);
        const outFade = Math.min(1, Math.min(outProgress, 1 - outProgress) * 4);
        flow.outPulse.material.opacity = 0.4 + outFade * 0.6;
      } catch (_) {}
    });

    renderer.render(scene, camera);
  }
  animate();

  /* Pause when tab hidden */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    } else if (!rafId) {
      animate();
    }
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

/* ═══════════════════════════════════════════════════════════════
   EXPOSE GLOBALLY
   ═══════════════════════════════════════════════════════════════ */
window.VioraHome = { S, renderAll, openOrderModal, openCategoryModal };
if (typeof window.App !== 'object' || !window.App) window.App = {};
window.App.openOrderModal = openOrderModal;
window.App.openCategoryModal = openCategoryModal;
