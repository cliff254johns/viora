/* ═══════════════════════════════════════════════════════════════
   VIORA — INDEX HOME CONTROLLER
   ═══════════════════════════════════════════════════════════════

   Loads on index.html only. Requires:
     - shared-app.js          (nav, drawer, theme, canvas network, reveal)
     - order-modal.js         (shared purchase modal)
     - category-modal.js      (tour "More" popup)
     - assets/default-categories.js  (fallback content)
     - Three.js r128+         (for the 3D globe)

   Firebase subscriptions:
     viora_data/orgs/viora/homeContent     → drives most landing sections
     viora_data/orgs/viora/marketContent   → stats, testimonials, FAQs, trust
     viora_data/orgs/viora/products        → product strip (top 6 by totalSold)

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
  categories: {},           // merged homeContent.tour.categories + defaults
  activeBucket: 'run',
  activeFamily: null,
  ready: false,
};

/* ── Helpers ── */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtKSh = (usd) => 'KSh ' + Math.round((Number(usd) || 0) * KES_RATE).toLocaleString('en-KE');
const fmtKShKes = (kes) => 'KSh ' + Math.round(Number(kes) || 0).toLocaleString('en-KE');

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
      mergeCategories();
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
  } else {
    /* Offline fallback — render from defaults */
    S.homeContent = window.__VIORA_DEFAULT_HOME || {};
    mergeCategories();
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
    // shared-app.js doesn't ship a toast, so make one
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 18px;border-radius:10px;
      background:${type === 'error' ? '#DC2626' : type === 'success' ? '#10B981' : '#2267EE'};color:#fff;
      font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);animation:slideIn .25s ease;`;
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
   MERGE CATEGORIES — homeContent.tour.categories + defaults
   ═══════════════════════════════════════════════════════════════ */
function mergeCategories() {
  const defaults = window.__VIORA_DEFAULT_CATEGORIES || {};
  const fromAdmin = (S.homeContent?.tour?.categories) || {};
  S.categories = {};
  Object.keys(defaults).forEach(key => {
    S.categories[key] = { ...defaults[key], ...(fromAdmin[key] || {}) };
  });
  Object.keys(fromAdmin).forEach(key => {
    if (!S.categories[key]) S.categories[key] = { ...fromAdmin[key] };
  });
}

/* ═══════════════════════════════════════════════════════════════
   RENDER ALL SECTIONS
   ═══════════════════════════════════════════════════════════════ */
function renderAll() {
  renderHero();
  renderStatsStrip();
  renderIntentRouter();
  renderTour();
  renderProductStrip();
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
      <div class="stats-strip-label">${esc(mc.statProductsLabel || 'Solutions')}</div>
    </div>
    <div class="stats-strip-item">
      <div class="stats-strip-value">${clients}+</div>
      <div class="stats-strip-label">${esc(mc.statClientsLabel || 'Happy Clients')}</div>
    </div>
    <div class="stats-strip-item">
      <div class="stats-strip-value">${projects}+</div>
      <div class="stats-strip-label">${esc(mc.statProjectsLabel || 'Delivered')}</div>
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
    <a href="${esc(t.href)}" class="intent-tile">
      <div class="intent-icon"><i class="fa-solid ${esc(t.icon || 'fa-cube')}"></i></div>
      <h3>${esc(t.title)}</h3>
      <p>${esc(t.desc || '')}</p>
      <span class="intent-arrow">Open <i class="fa-solid fa-arrow-right"></i></span>
    </a>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════════
   4. TOUR
   ═══════════════════════════════════════════════════════════════ */
function renderTour() {
  const tour = S.homeContent?.tour || {};
  const buckets = tour.buckets || defaultBuckets();

  /* Bucket tabs */
  const tabsHost = $('#tour-buckets');
  if (tabsHost) {
    tabsHost.innerHTML = buckets.map(b => `
      <button type="button" class="tour-bucket-btn"
              data-bucket="${esc(b.key)}"
              aria-selected="${b.key === S.activeBucket ? 'true' : 'false'}"
              role="tab">
        ${esc(b.name)}
      </button>
    `).join('');
    tabsHost.querySelectorAll('[data-bucket]').forEach(btn => {
      btn.addEventListener('click', () => {
        S.activeBucket = btn.dataset.bucket;
        renderTour();
      });
    });
  }

  /* Bucket panels */
  const panelsHost = $('#tour-panels');
  if (!panelsHost) return;

  panelsHost.innerHTML = buckets.map(b => {
    const isActive = b.key === S.activeBucket;
    const families = b.families || [];
    return `
      <div class="tour-bucket-panel" data-active="${isActive ? 'true' : 'false'}" data-bucket-panel="${esc(b.key)}">
        <div class="tour-families">
          ${families.map(f => `
            <div class="tour-family">
              <h3>${esc(f.name)}</h3>
              <p>${esc(f.desc || '')}</p>
              <div class="tour-family-list">
                ${(f.items || []).map(key => {
                  const cat = S.categories[key];
                  if (!cat || cat.hidden) return '';
                  return `
                    <button type="button" class="tour-chip" data-category="${esc(key)}">
                      <i class="fa-solid ${esc(cat.icon || 'fa-cube')}"></i>
                      ${esc(cat.name || key)}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="tour-cards">
          ${families.flatMap(f => (f.items || [])).map(key => {
            const cat = S.categories[key];
            if (!cat || cat.hidden) return '';
            return renderTourCard(key, cat);
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  /* Wire chips → scroll to card */
  panelsHost.querySelectorAll('.tour-chip[data-category]').forEach(chip => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.category;
      const card = panelsHost.querySelector(`[data-tour-card="${key}"]`);
      if (card) {
        card.scrollIntoView({ behavior: prefersReduce() ? 'auto' : 'smooth', block: 'center' });
        card.style.boxShadow = '0 0 0 3px var(--accent)';
        setTimeout(() => { card.style.boxShadow = ''; }, 1200);
      }
    });
  });

  /* Wire tour card buttons */
  panelsHost.querySelectorAll('[data-tour-card]').forEach(card => {
    const key = card.dataset.tourCard;
    const cat = S.categories[key];

    const sampleBtn = card.querySelector('[data-action="sample"]');
    if (sampleBtn && cat?.viewSampleUrl) {
      sampleBtn.addEventListener('click', () => {
        window.open(cat.viewSampleUrl, '_blank', 'noopener,noreferrer');
      });
    } else if (sampleBtn) {
      sampleBtn.style.display = 'none';
    }

    const orderBtn = card.querySelector('[data-action="order"]');
    if (orderBtn) {
      orderBtn.addEventListener('click', () => {
        openOrderModal({
          category: cat?.marketCategory || cat?.name || key,
        });
      });
    }

    const moreBtn = card.querySelector('[data-action="more"]');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        openCategoryModal(key, cat);
      });
    }
  });
}

function renderTourCard(key, cat) {
  const bullets = (cat.bullets || []).slice(0, 3);
  const stats = (cat.stats || []).slice(0, 3);
  return `
    <article class="tour-card" data-tour-card="${esc(key)}">
      <div class="tour-card-icon"><i class="fa-solid ${esc(cat.icon || 'fa-cube')}"></i></div>
      <h4>${esc(cat.name || key)}</h4>
      <p class="tour-card-desc">${esc(cat.desc || '')}</p>
      ${bullets.length ? `
        <ul class="tour-card-bullets">
          ${bullets.map(b => `<li>${esc(b)}</li>`).join('')}
        </ul>
      ` : ''}
      ${stats.length ? `
        <div class="tour-card-stats">
          ${stats.map(s => `
            <div class="tour-card-stat">
              <span class="tour-card-stat-v">${esc(s.v || '')}</span>
              <span class="tour-card-stat-l">${esc(s.l || '')}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="tour-card-actions">
        <button type="button" class="btn btn-ghost" data-action="sample">
          <i class="fa-solid fa-eye"></i> View sample
        </button>
        <button type="button" class="btn btn-primary" data-action="order">
          <i class="fa-solid fa-bolt"></i> Order now
        </button>
        <button type="button" class="btn btn-ghost btn-icon-only" data-action="more" title="More details">
          <i class="fa-solid fa-circle-info"></i>
        </button>
      </div>
    </article>
  `;
}

function defaultBuckets() {
  return [
    {
      key: 'run',
      name: 'Run my business',
      desc: 'Software systems that run your operation — designed, built and supported by VIORA.',
      families: [
        {
          key: 'core',
          name: 'Core business systems',
          desc: 'The foundation — sales, stock, finance.',
          items: ['business-mgmt', 'financial', 'operational', 'inventory-pos'],
        },
        {
          key: 'vertical',
          name: 'Vertical industry systems',
          desc: 'Purpose-built for a specific sector.',
          items: [
            'retail', 'restaurant', 'clinic', 'hospital', 'pharmacy', 'school',
            'hotel', 'salon', 'gym', 'garage', 'veterinary', 'farm',
            'construction', 'real-estate', 'funeral', 'laundry', 'security',
            'cleaning', 'greenhouse', 'photography', 'event', 'recruitment',
            'travel', 'printing',
          ],
        },
        {
          key: 'professional',
          name: 'Professional practice',
          desc: 'Law, architecture, insurance.',
          items: ['law', 'architecture', 'insurance'],
        },
      ],
    },
    {
      key: 'sell',
      name: 'Sell more online',
      desc: 'Online presence and storefronts — designed, built and hosted by VIORA.',
      families: [
        {
          key: 'storefront',
          name: 'Storefronts',
          desc: 'Sell online, connected to your stock.',
          items: ['ecommerce', 'commerce', 'online-stores'],
        },
        {
          key: 'web',
          name: 'Web experiences',
          desc: 'Custom websites and 3D experiences.',
          items: ['web3d', 'web', 'entertainment-web'],
        },
        {
          key: 'media',
          name: 'Media & branding',
          desc: 'Video, graphics, brand identity.',
          items: ['video', 'graphics', 'branding'],
        },
      ],
    },
    {
      key: 'build',
      name: 'Build something custom',
      desc: 'Bespoke systems, AI and mobile — architected and delivered by VIORA.',
      families: [
        {
          key: 'software',
          name: 'Custom software',
          desc: 'Bespoke builds, integrations, APIs.',
          items: ['custom', 'enterprise', 'api'],
        },
        {
          key: 'intelligence',
          name: 'AI & intelligence',
          desc: 'Assistants, automation, analytics.',
          items: ['ai-assistant', 'ai-automation', 'ai-analytics'],
        },
        {
          key: 'mobile',
          name: 'Mobile',
          desc: 'Native and cross-platform apps.',
          items: ['android', 'mobile-apps'],
        },
      ],
    },
  ];
}

function prefersReduce() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ═══════════════════════════════════════════════════════════════
   5. PRODUCT STRIP — LIVE from Firebase
   ═══════════════════════════════════════════════════════════════ */
function renderProductStrip() {
  const host = $('#product-strip-grid');
  if (!host) return;
  const ps = S.homeContent?.productStrip || {};
  const limit = Number(ps.limit) || 6;

  const list = S.products
    .slice()
    .sort((a, b) => (Number(b.totalSold) || 0) - (Number(a.totalSold) || 0))
    .slice(0, limit);

  if (!list.length) {
    host.innerHTML = `<div class="product-strip-loading"><i class="fa-solid fa-spinner"></i> Loading products…</div>`;
    return;
  }

  host.innerHTML = list.map(p => {
    const kes = Math.round((Number(p.price) || 0) * KES_RATE);
    const extras = (S.homeContent?.productExtras || {})[p.id] || {};
    const previewUrl = p.previewUrl || p.link || extras.previewUrl || '';
    const isCustom = extras.productType === 'custom' || extras.productType === 'service' || p.pricing === 'quote';

    const visual = p.image
      ? `<img src="${esc(p.image)}" alt="${esc(p.name || '')}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid';">`
      : '';

    /* Primary CTA row — 3 buttons */
    const actions = isCustom
      ? `<button type="button" class="btn btn-primary" data-action="quote">Request quote</button>
         <a href="client.html" class="btn btn-ghost">Subscribe</a>`
      : `<button type="button" class="btn btn-primary" data-action="buy">Buy</button>
         <a href="client.html" class="btn btn-ghost">Subscribe</a>`;

    const viewBtn = previewUrl
      ? `<a href="${esc(previewUrl)}" target="_blank" rel="noopener" class="btn btn-ghost" data-action="view">View</a>`
      : '';

    const moreBtn = `<button type="button" class="btn btn-ghost" data-action="more">More</button>`;

    return `
      <article class="product-strip-card" data-product-id="${esc(p.id)}">
        <div class="product-strip-visual">
          ${visual}
          <i class="fa-solid ${esc(p.icon || 'fa-cube')}" style="${p.image ? 'display:none' : ''}"></i>
        </div>
        <div class="product-strip-body">
          <span class="product-strip-cat">${esc(p.category || 'Solution')}</span>
          <h3 class="product-strip-name">${esc(p.name || '')}</h3>
          <p class="product-strip-desc">${esc((p.description || '').slice(0, 100))}</p>
          <div class="product-strip-price">${isCustom ? 'Custom pricing' : fmtKShKes(kes)}</div>
          <div class="product-strip-actions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
            ${viewBtn}
            ${actions}
            ${moreBtn}
          </div>
        </div>
      </article>
    `;
  }).join('');

  /* Wire buttons */
  host.querySelectorAll('[data-product-id]').forEach(card => {
    const pid = card.dataset.productId;
    const product = list.find(p => p.id === pid);
    if (!product) return;

    card.querySelector('[data-action="buy"]')?.addEventListener('click', () => {
      openOrderModal({ productId: pid });
    });
    card.querySelector('[data-action="quote"]')?.addEventListener('click', () => {
      openOrderModal({ productId: pid });
    });
    card.querySelector('[data-action="more"]')?.addEventListener('click', () => {
      /* Build a synthetic category-like object from the product */
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
}

/* ═══════════════════════════════════════════════════════════════
   6. ECO MAP — 10 nodes, SVG
   ═══════════════════════════════════════════════════════════════ */
function renderEcoMap() {
  const svg = $('#eco-svg');
  const infoHost = $('#eco-info');
  if (!svg) return;

  const em = S.homeContent?.ecosystemMap || {};
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

  /* SVG defs */
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

  /* Connecting lines */
  svgHTML += `<g id="eco-lines">${positions.map((p, i) =>
    `<line class="eco-line" data-line="${i}" x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}"/>`
  ).join('')}</g>`;

  /* Core pulses */
  svgHTML += `
    <circle class="eco-pulse" cx="${cx}" cy="${cy}" r="46"/>
    <circle class="eco-pulse" cx="${cx}" cy="${cy}" r="46"/>
    <circle class="eco-pulse" cx="${cx}" cy="${cy}" r="46"/>
  `;

  /* Hub */
  svgHTML += `
    <circle class="eco-hub" cx="${cx}" cy="${cy}" r="46"/>
    <circle cx="${cx - 15}" cy="${cy - 15}" r="10" fill="rgba(255,255,255,.55)"/>
    <text class="eco-hub-txt" x="${cx}" y="${cy + 5}">VIORA</text>
  `;

  /* Nodes */
  svgHTML += `<g id="eco-nodes">${nodes.map((n, i) => {
    const p = positions[i];
    const labelY = p.y < cy ? p.y - 22 : p.y + 30;
    return `
      <g class="eco-node" data-idx="${i}" tabindex="0" role="button" aria-label="${esc(n.name)}" style="color:${esc(n.color)}">
        <circle cx="${p.x}" cy="${p.y}" r="11" fill="${esc(n.color)}" opacity="0.95"/>
        <circle cx="${p.x - 3}" cy="${p.y - 4}" r="3.5" fill="rgba(255,255,255,0.7)"/>
        <circle cx="${p.x}" cy="${p.y}" r="18" fill="transparent"/>
        <text x="${p.x}" y="${labelY}">${esc(n.name)}</text>
      </g>
    `;
  }).join('')}</g>`;

  svg.innerHTML = svgHTML;

  /* Wire node clicks */
  function selectNode(i) {
    $$('.eco-node', svg).forEach((el, idx) => el.classList.toggle('active', idx === i));
    $$('.eco-line', svg).forEach((el, idx) => el.classList.toggle('active', idx === i));
    if (infoHost) {
      const n = nodes[i];
      infoHost.innerHTML = `<h3 style="color:${esc(n.color)}">${esc(n.name)}</h3><p>${esc(n.desc || '')}</p>`;
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

  /* Default selection */
  if (infoHost && em.heading) {
    infoHost.innerHTML = `<h3>VIORA Core</h3><p>${esc(em.sub || 'Select any node to see how that domain connects to the ecosystem.')}</p>`;
  }
}

/* ═══════════════════════════════════════════════════════════════
   7. DASHBOARD PREVIEW (static demo)
   ═══════════════════════════════════════════════════════════════ */
function renderDashboard() {
  const dp = S.homeContent?.dashboardPreview || {};
  const rev = Number(dp.revenue) || 4280000;
  const sales = Number(dp.sales) || 1284;
  const revEl = $('#dash-revenue');
  const salesEl = $('#dash-sales');
  if (revEl) revEl.textContent = fmtKShKes(rev);
  if (salesEl) salesEl.textContent = sales.toLocaleString('en-KE');
}

/* ═══════════════════════════════════════════════════════════════
   8. TESTIMONIALS — LIVE from marketContent
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
        <blockquote>${esc(t.text || '')}</blockquote>
        <figcaption>
          <span class="avatar" style="background:${bg};width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0;">${initials}</span>
          <div>
            <strong>${esc(t.name || 'Client')}</strong>
            <small>${esc(t.role || '')}</small>
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
  const cs = S.homeContent?.caseStrip || {};
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
        <h3>${esc(t.name)}</h3>
        <p class="price-sub">${esc(t.tagline || '')}</p>
        <ul>${(t.bullets || []).map(b => `<li>${esc(b)}</li>`).join('')}</ul>
        <a href="${esc(t.ctaHref || 'contact_us.html')}" class="btn ${t.featured ? 'btn-primary' : 'btn-ghost'}">${esc(t.cta || 'Subscribe')}</a>
      </div>
    `;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════════
   11. ACADEMY
   ═══════════════════════════════════════════════════════════════ */
function renderAcademy() {
  const at = S.homeContent?.academyTeaser || {};
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
   12. FAQ — LIVE from marketContent
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
        <span>${esc(f.q || '')}</span>
        <i class="fa-solid fa-chevron-down" style="font-size:12px;color:var(--muted);transition:transform .25s;"></i>
      </summary>
      <div style="padding:0 20px 20px;color:var(--muted);font-size:14px;line-height:1.7;">${esc(f.a || '')}</div>
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
   CONTACT FORM → Firebase `leads`
   ═══════════════════════════════════════════════════════════════ */
function wireContactForm() {
  const form = $('#contact-form');
  const status = $('#contact-status');
  if (!form) return;

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

      /* Mirror to marketLeads so it flows into the marketplace pipeline */
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
        status.innerHTML = `✅ Thanks ${esc(name.split(' ')[0])}! We'll be in touch within one business day.`;
      }
      form.reset();
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = origHTML; }

      /* Notify admin */
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
   3D GLOBE — preserved from current script.js
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
  const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /* Grid lines */
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

  /* Simple animated arcs — a handful of representative connections */
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

  /* Drag controls */
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
  let autoRotate = !prefersReduce;

  function animate() {
    rafId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
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

window.VioraHome = { S, renderAll, openOrderModal, openCategoryModal };
