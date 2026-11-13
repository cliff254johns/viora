/* ============================================================
   VIORA MARKETPLACE — v3.2 (carousel fixed + seamless loop)
   ============================================================ */
import '../currency-display.js?v=20261112-global-fx-9';
import { initOrderModal, openOrderModal } from '../order-modal.js';

const firebaseConfig = {
  apiKey: "AIzaSyC9gCBt-xR8t9n6rTGNvDZ5usUGiW-Dqxc",
  authDomain: "cliffclient-35ec5.firebaseapp.com",
  databaseURL: "https://cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cliffclient-35ec5",
  storageBucket: "cliffclient-35ec5.firebasestorage.app",
  messagingSenderId: "519782791696",
  appId: "1:519782791696:web:6e1a654ddeed14b72b2895",
  measurementId: "G-G0NB6JGQVF"
};

let db = null;
let auth = null;
let firebaseReady = false;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  auth = firebase.auth();
  firebaseReady = true;
  console.log('%c🔥 Firebase connected', 'color:#00e68a;font-weight:700;');
} catch (e) {
  console.warn('[Viora Market] Firebase init error:', e.message);
}

const ROOT = 'viora_data';
const ORG = 'orgs/viora';
const P = (path) => {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  return `${ROOT}/${ORG}/${clean}`;
};

const PRODUCT_CACHE_KEY = 'viora_market_products_v1';
const PRODUCT_CACHE_MAX_AGE = 86400000;
const FX_RATE = 129; // Safe fallback until the daily reference rate table loads.
const CURRENCY = { code: 'KES', symbol: 'KSh', get rate() { return Number(window.VioraCurrency?.convert(1, 'USD', 'KES')) || FX_RATE; } };
const usdToKes = usd => Math.round(Number(window.VioraCurrency?.convert(Number(usd) || 0, 'USD', 'KES')) || (Number(usd) || 0) * FX_RATE);
const fmtKSh = usd => window.VioraCurrency?.formatUSD(Number(usd) || 0) || ('USD ' + (Number(usd) || 0).toFixed(2));
const fmtKShFromKes = kes => window.VioraCurrency?.formatKES(Number(kes) || 0) || ('KSh ' + Math.round(Number(kes) || 0).toLocaleString('en-KE'));

const DEFAULTS = {
  heroBadge: 'Powered by Viora Intercollective',
  heroLive: 'Live',
  heroTitle1: 'Software Licenses',
  heroTitle2: 'That Power Your Business',
  heroSub: 'Instant access to premium software tools — prices automatically displayed in your local currency.',
  heroBtn1: 'Browse Products',
  heroBtn2: 'How It Works',
  statProducts: 'auto',
  statProductsLabel: 'Software Solutions',
  floatChips: [
    { icon: 'fa-solid fa-circle-check', text: 'Instant delivery' },
    { icon: 'fa-solid fa-star', text: '4.9/5 rating' },
    { icon: 'fa-solid fa-shield-halved', text: 'Secure checkout' }
  ],
  featuredLabel: 'Most Popular',
  featuredProductId: '',
  featuredTitle: '',
  featuredPrice: 0,
  featuredNote: 'One-time payment',
  featuredFeatures: ['Instant delivery', 'Priority support', 'Lifetime updates', 'Cancel anytime'],
  featuredBtn: 'Buy Now',
  announcements: [],
  trustItems: [],
  testimonials: [],
  faqs: [],
  caseStudies: [],
  steps: [
    { title: 'Choose a License', body: 'Browse the catalog, pick your products, and add them to your cart.' },
    { title: 'Choose a payment method', body: 'Available payment options and final settlement details are confirmed at checkout.' },
    { title: 'Instant Delivery', body: 'Your license keys and download links are delivered immediately to your email inbox.' },
    { title: 'System Synced', body: 'The Viora system automatically records every purchase in its live dashboard.' }
  ],
  brandName: 'VIORA',
  brandAccent: '#00e0ff',
  footerText: 'Explore software licenses with prices displayed in your local currency.',
  whatsApp: '254713428774',
  footerEmail: 'support@viora.co.ke',
  productsSubtitle: 'Our Catalog',
  productsHeading: 'Product Collection',
  productsDesc: 'Browse by category or search. Add items to cart, then choose an available payment method at checkout.',
  carouselSubtitle: 'Browse the Collection',
  carouselHeading: 'Featured Products',
  carouselDesc: 'Swipe or scroll through our catalog. Click any product to see details or add it to your cart.',
  caseSubtitle: 'Built for Real Businesses',
  caseHeading: 'Case Studies',
  caseDesc: 'See how Viora has solved real problems for businesses across industries.',
  howSubtitle: 'Simple Process',
  howHeading: 'How It Works',
  faqSubtitle: 'Questions',
  faqHeading: 'Frequently Asked',
  newsletterHeading: 'Stay in the loop',
  newsletterDesc: 'Get notified about new products and exclusive local-currency offers.'
};

let INDUSTRY_MAP = {};

const normalizeMarketCategory = value =>
  String(value || 'Marketplace').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

const MARKET_CATEGORY_LABELS = Object.freeze({
  'bussiness management systems': 'Business Management Systems',
  'ecormmerce website': 'E-commerce Websites',
  'retal property systems': 'Rental Property Systems',
  'recuitment agency systems': 'Recruitment Agency Systems',
  'a.i assistant': 'AI Assistants'
});

const displayMarketCategory = value => {
  const clean = String(value || 'Marketplace').trim().replace(/\s+/g, ' ');
  return MARKET_CATEGORY_LABELS[normalizeMarketCategory(clean)] || clean;
};

let PROMO_CACHE = null;
let REVIEW_CACHE = {};
let EXTRAS_CACHE = {};

const App = {
  /* ── State ── */
  content: {},
  clientsite: {},
  products: [],
  cart: [],
  wishlist: [],
  orders: [],
  activeCategory: 'all',
  searchTerm: '',
  sortMode: 'popular',
  priceFilter: 'all',
  currentPromo: null,
  _productListener: null,
  _contentListener: null,
  _clientsiteListener: null,
  _inventoryByProductId: null,
  _inventoryListener: null,
  _thanksTimer: null,
  _carouselIndex: 0,
  _carouselLoop: true,
  _recentSearches: [],
  _reviewDraft: { productId: null, stars: 0 },
  _activeReviewProductId: null,

  async requestPreview(productId) {
    const product = this.products.find(item => item.id === productId);
    if (!product || product.status !== 'active') {
      this.toast('This product is not currently available for preview requests.', 'warning');
      return;
    }
    if (!auth) {
      this.toast('Preview sign-in is unavailable. Please try again later.', 'error');
      return;
    }
    let user = auth.currentUser;
    if (!user) user = await this.promptPreviewSignIn();
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch('https://viora-api.cliff254johns.workers.dev/marketplace/preview/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ productId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Preview request failed');
      if (data.request?.status === 'approved') {
        this.toast('Your preview request is approved. Secure delivery will be available when the product gateway is ready.', 'success');
      } else if (data.existing) {
        this.toast('Your preview request is already awaiting review.', 'info');
      } else {
        this.toast(data.request?.gatewayReady === true
          ? 'Preview request submitted. VIORA will review it.'
          : 'Request submitted. The product gateway must pass verification before access can be granted.', 'success');
      }
    } catch (error) {
      this.toast(error.message || 'Preview request failed.', 'error');
    }
  },

  promptPreviewSignIn() {
    return new Promise(resolve => {
      let dialog = document.getElementById('vioraPreviewSignIn');
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'vioraPreviewSignIn';
        dialog.style.cssText = 'border:1px solid var(--border);border-radius:18px;padding:24px;max-width:420px;width:calc(100% - 32px);background:var(--surface);color:var(--text-primary);box-shadow:0 24px 80px rgba(0,0,0,.35)';
        dialog.innerHTML = `
          <form id="vioraPreviewSignInForm" method="dialog" style="display:grid;gap:12px">
            <h3 style="margin:0">Sign in to request a preview</h3>
            <p style="margin:0;color:var(--text-secondary);font-size:.85rem">Use your VIORA Client Portal account. New customers can create an account in the Client Portal.</p>
            <label>Email<input name="email" type="email" autocomplete="username" required style="width:100%;padding:12px;border-radius:10px;margin-top:5px"></label>
            <label>Password<input name="password" type="password" autocomplete="current-password" required style="width:100%;padding:12px;border-radius:10px;margin-top:5px"></label>
            <p id="vioraPreviewSignInError" role="alert" style="color:#e5484d;margin:0;font-size:.8rem"></p>
            <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
              <a href="/client.html" style="align-self:center;font-size:.8rem">Create account</a>
              <button type="button" id="vioraPreviewSignInCancel">Cancel</button>
              <button type="submit">Sign in</button>
            </div>
          </form>`;
        document.body.appendChild(dialog);
      }
      const form = dialog.querySelector('#vioraPreviewSignInForm');
      const error = dialog.querySelector('#vioraPreviewSignInError');
      const finish = value => { try { dialog.close(); } catch (_) {} resolve(value || null); };
      dialog.querySelector('#vioraPreviewSignInCancel').onclick = () => finish(null);
      form.onsubmit = async event => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        error.textContent = '';
        try {
          const credentials = await auth.signInWithEmailAndPassword(form.email.value.trim(), form.password.value);
          finish(credentials.user);
        } catch (e) {
          error.textContent = e.code === 'auth/invalid-credential' ? 'Email or password is incorrect.' : (e.message || 'Sign-in failed.');
          submit.disabled = false;
        }
      };
      dialog.onclose = () => resolve(null);
      dialog.showModal();
    });
  },

  /* ═══════════════════════════════════════════════════════════
     TOASTS + MODALS
     ═══════════════════════════════════════════════════════════ */
  toast(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      warning: 'fa-triangle-exclamation',
      info: 'fa-circle-info'
    };
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${msg}</span>`;
    c.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(40px)';
      el.style.transition = 'all 0.35s';
      setTimeout(() => el.remove(), 350);
    }, 3600);
  },

  openModal(id) {
    document.getElementById(id)?.classList.add('active');
    document.body.style.overflow = 'hidden';
  },
  closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
    if (!document.querySelector('.modal-overlay.active')) {
      document.body.style.overflow = '';
    }
  },

  scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('navLinks')?.classList.remove('open');
  },
  scrollToTop(e) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  mobileNav(target) {
    document.querySelectorAll('.mobile-bottom-nav .mn-item').forEach(b =>
      b.classList.toggle('active', b.dataset.target === target));
    if (target === 'cart') {
      this.toggleCart();
      return;
    }
    this.scrollToSection(target);
  },

  toggleCart() {
    document.getElementById('cartDrawer')?.classList.toggle('open');
  },

  escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  /* ═══════════════════════════════════════════════════════════
     PRODUCT TYPE DETECTION
     ═══════════════════════════════════════════════════════════ */
  isCustomProduct(p) {
    if (!p) return false;
    const extras = EXTRAS_CACHE[p.id];
    if (extras && (extras.productType === 'custom' || extras.productType === 'service')) return true;
    if (p.productType === 'custom' || p.productType === 'service' || p.pricing === 'quote') return true;
    const haystack = `${p.category || ''} ${p.name || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
    return /\bcustom\b|bespoke|consulting|enterprise|quote|rfq/.test(haystack);
  },

  getProductExtras(productId) {
    return EXTRAS_CACHE[productId] || {};
  },

  /* ═══════════════════════════════════════════════════════════
     FIREBASE SUBSCRIPTIONS
     ═══════════════════════════════════════════════════════════ */
  watchContent() {
    if (!firebaseReady || !db) {
      this.applyContent(DEFAULTS);
      return;
    }
    this._contentListener = db.ref(P('marketContent'));
    this._contentListener.on('value', snap => {
      const data = snap.exists() ? snap.val() : {};
      this.content = data;
      this.applyContent({ ...DEFAULTS, ...data });
      this.applyClientsite(this.clientsite || {});
    });

    this._clientsiteListener = db.ref(P('clientsite'));
    this._clientsiteListener.on('value', snap => {
      const cs = snap.exists() ? snap.val() : {};
      this.clientsite = cs;
      this.applyClientsite(cs);
    });
  },

  watchProducts() {
    if (!firebaseReady || !db) {
      this.renderCategoryBar();
      this.renderProducts();
      this.renderCarousel();
      return;
    }
    this._productListener = db.ref(P('products'));
    this._productListener.on('value', snap => {
      const val = snap.val() || {};
      const all = Object.entries(val).map(([id, p]) => ({
        id: p.id || id,
        name: p.name || '',
        description: p.description || '',
        category: p.category || 'Marketplace',
        price: Number(p.price) || 0,
        period: p.period || '',
        icon: p.icon || 'fa-solid fa-cube',
        tags: Array.isArray(p.tags) ? p.tags : (typeof p.tags === 'string' ? p.tags.split(',').map(s => s.trim()).filter(Boolean) : []),
        status: p.status || 'active',
        totalSold: p.totalSold || 0,
        totalRevenue: p.totalRevenue || 0,
        previewEnabled: p.previewEnabled === true,
        previewGatewayVerified: p.previewGatewayVerified === true,
        previewProfile: p.previewProfile || '',
        image: p.image || null,
        _kind: p._kind || 'product',
        features: Array.isArray(p.features) ? p.features : []
      })).filter(p => p.status !== 'archived' && p.status !== 'draft');

      this.products = all.slice();
      // Cache the public catalogue so repeat visits paint while Firebase refreshes.
      try {
        localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), products: this.products }));
      } catch (cacheError) {
        console.debug('[market] product cache skipped:', cacheError?.message || cacheError);
      }

      this.renderCategoryBar();
      this.renderProducts();
      this.renderCarousel();
      this.applyClientsite(this.clientsite || {});

      console.log(
        `%c📦 Products synced: ${this.products.length} item(s)`,
        'color:#00e0ff;font-weight:600;'
      );
    }, err => {
      console.warn('Product listener error:', err);
      setTimeout(() => this.watchProducts(), 4000);
    });
  },

  watchInventory() {
    if (!firebaseReady || !db) return;
    this._inventoryByProductId = {};
    this._inventoryListener = db.ref(P('inventory'));
    this._inventoryListener.on('value', snap => {
      const val = snap.exists() ? snap.val() : {};
      const byProductId = {};

      Object.values(val).forEach(row => {
        if (!row) return;
        if (row._productId) byProductId[row._productId] = row;
        if (row.sku) byProductId[String(row.sku).toLowerCase()] = row;
        if (row.id) {
          byProductId[row.id] = row;
          if (String(row.id).startsWith('prod-')) {
            byProductId[String(row.id).slice(5)] = row;
          }
        }
      });

      this._inventoryByProductId = byProductId;
      this.renderProducts();
      this.renderCarousel();
    });
  },

  watchProductExtras() {
    if (!firebaseReady || !db) return;
    db.ref(P('productExtras')).on('value', snap => {
      EXTRAS_CACHE = snap.exists() ? (snap.val() || {}) : {};
      this.renderProducts();
      this.renderCarousel();
    });
  },

  watchPromos() {
    if (!firebaseReady || !db) return;
    db.ref(P('promos')).on('value', snap => {
      PROMO_CACHE = snap.exists() ? (snap.val() || {}) : {};
    });
  },

     watchIndustries() {
    if (!firebaseReady || !db) {
      INDUSTRY_MAP = {};
      this.renderCategoryBar();
      return;
    }
    db.ref(P('industries')).on('value', snap => {
      const val = snap.exists() ? (snap.val() || {}) : {};
      INDUSTRY_MAP = {};

      Object.entries(val).forEach(([key, raw]) => {
        const ind = raw || {};
        if (ind.active === false) return;
        const marketCat = String(ind.marketCategory || '').trim();
        if (!marketCat) return;
        INDUSTRY_MAP[marketCat] = {
          key,
          icon: ind.icon || 'fa-solid fa-tag',
          color: ind.color || '#2267EE',
          name: ind.name || marketCat,
          marketCategory: marketCat,
          order: Number(ind.order) || 999,
        };
      });

      this.renderCategoryBar();
    }, err => {
      console.warn('[market] industries listener failed:', err);
      setTimeout(() => this.watchIndustries(), 4000);
    });
  },

  async loadReviews(productId) {
    if (!firebaseReady || !db) return [];
    try {
      const snap = await db.ref(P('reviews') + '/' + productId).once('value');
      const val = snap.exists() ? snap.val() : {};
      const list = Object.values(val).sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
      REVIEW_CACHE[productId] = list;
      return list;
    } catch (e) {
      console.warn('[reviews] load failed:', e);
      return [];
    }
  },

  getReviewAggregate(productId) {
    const list = REVIEW_CACHE[productId] || [];
    if (!list.length) return { count: 0, avg: 0 };
    const sum = list.reduce((s, r) => s + (Number(r.rating) || 0), 0);
    return { count: list.length, avg: sum / list.length };
  },

  /* ═══════════════════════════════════════════════════════════
     CONTENT APPLICATION
     ═══════════════════════════════════════════════════════════ */
  applyContent(c) {
    const val = (key, fallback = '') => {
      const v = c[key];
      return (v === undefined || v === null) ? fallback : v;
    };

    const setTxt = (id, value, html = false) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (value === undefined || value === null) return;
      if (html) el.innerHTML = String(value);
      else el.textContent = String(value);
    };

    setTxt('heroBadge', val('heroBadge', DEFAULTS.heroBadge));
    setTxt('heroLive', val('heroLive', DEFAULTS.heroLive));
    setTxt('heroTitle1', val('heroTitle1', DEFAULTS.heroTitle1));
    setTxt('heroTitle2', val('heroTitle2', DEFAULTS.heroTitle2));
    setTxt('heroSub', val('heroSub', DEFAULTS.heroSub), true);
    if (window.VioraCurrency?.state?.ready) refreshLocalCurrencyLabels();

    const btn1 = document.getElementById('heroBtn1');
    const btn2 = document.getElementById('heroBtn2');
    if (btn1 && c.heroBtn1 !== undefined) btn1.innerHTML = `<i class="fa-solid fa-bag-shopping"></i> ${this.escape(c.heroBtn1)}`;
    if (btn2 && c.heroBtn2 !== undefined) btn2.innerHTML = `<i class="fa-solid fa-circle-question"></i> ${this.escape(c.heroBtn2)}`;

    if (c.brandAccent) {
      document.documentElement.style.setProperty('--accent', c.brandAccent);
      document.documentElement.style.setProperty('--accent-glow', c.brandAccent + '59');
    }

    const announcements = Array.isArray(c.announcements) ? c.announcements : DEFAULTS.announcements;
    const bar = document.getElementById('announceBar');
    const track = document.getElementById('announceTrack');
    if (bar && track) {
      if (announcements.length) {
        const items = [...announcements, ...announcements];
        track.innerHTML = items.map(a => `<span><i class="fa-solid fa-bolt"></i> ${this.escape(a)}</span>`).join('');
        bar.style.display = 'block';
      } else {
        bar.style.display = 'none';
        track.innerHTML = '';
      }
    }

    const trustItems = Array.isArray(c.trustItems) ? c.trustItems : DEFAULTS.trustItems;
    const strip = document.getElementById('trustStrip');
    const grid = document.getElementById('trustGrid');
    if (strip && grid) {
      if (trustItems.length) {
        grid.innerHTML = trustItems.map(t => `
          <div class="trust-item">
            <i class="${this.escape(t.icon || 'fa-solid fa-star')}"></i>
            <span>${this.escape(t.text || '')}</span>
          </div>`).join('');
        strip.style.display = 'block';
      } else {
        strip.style.display = 'none';
        grid.innerHTML = '';
      }
    }

    const caseStudies = Array.isArray(c.caseStudies) ? c.caseStudies : DEFAULTS.caseStudies;
    const caseSec = document.getElementById('case-studies');
    if (caseSec) {
      if (caseStudies.length) {
        this.renderCaseStudies(caseStudies);
        caseSec.style.display = 'block';
      } else {
        caseSec.style.display = 'none';
      }
    }
    setTxt('caseSubtitle', val('caseSubtitle', DEFAULTS.caseSubtitle));
    setTxt('caseHeading', val('caseHeading', DEFAULTS.caseHeading), true);
    setTxt('caseDesc', val('caseDesc', DEFAULTS.caseDesc));

    const testimonials = Array.isArray(c.testimonials) ? c.testimonials : DEFAULTS.testimonials;
    const tSec = document.getElementById('testimonials');
    const tGrid = document.getElementById('testiGrid');
    if (tSec && tGrid) {
      if (testimonials.length) {
        tGrid.innerHTML = testimonials.map(t => `
          <div class="testi-card">
            <div class="stars">★★★★★</div>
            <div class="quote-icon"><i class="fa-solid fa-quote-left"></i></div>
            <p class="testi-text">"${this.escape(t.text || '')}"</p>
            <div class="testi-author">${this.escape(t.name || '')}</div>
            <div class="testi-role">${this.escape(t.role || '')}</div>
          </div>`).join('');
        tSec.style.display = 'block';
      } else {
        tSec.style.display = 'none';
        tGrid.innerHTML = '';
      }
    }

    const faqs = Array.isArray(c.faqs) ? c.faqs : DEFAULTS.faqs;
    const fSec = document.getElementById('faq');
    if (fSec) {
      if (faqs.length) {
        fSec.style.display = 'block';
        this.renderFaq(faqs);
      } else {
        fSec.style.display = 'none';
        const fl = document.getElementById('faqList');
        if (fl) fl.innerHTML = '';
      }
    }

    const rawSteps = Array.isArray(c.steps) && c.steps.length ? c.steps : DEFAULTS.steps;
    const steps = rawSteps.map(step => (/pay in ksh|pay in kes/i.test(String(step.title || '')) || /payment is confirmed instantly/i.test(String(step.body || '')))
      ? { ...step, title: 'Choose a payment method', body: 'Local-currency prices are indicative. Available payment methods and final settlement details are confirmed at checkout.' }
      : step);
    this.renderSteps(steps);

    setTxt('productsSubtitle', val('productsSubtitle', DEFAULTS.productsSubtitle));
    setTxt('productsHeading', val('productsHeading', DEFAULTS.productsHeading), true);
    setTxt('productsDesc', val('productsDesc', DEFAULTS.productsDesc));
    setTxt('carouselSubtitle', val('carouselSubtitle', DEFAULTS.carouselSubtitle));
    setTxt('carouselHeading', val('carouselHeading', DEFAULTS.carouselHeading), true);
    setTxt('carouselDesc', val('carouselDesc', DEFAULTS.carouselDesc));
    setTxt('howSubtitle', val('howSubtitle', DEFAULTS.howSubtitle));
    setTxt('howHeading', val('howHeading', DEFAULTS.howHeading), true);
    setTxt('faqSubtitle', val('faqSubtitle', DEFAULTS.faqSubtitle));
    setTxt('faqHeading', val('faqHeading', DEFAULTS.faqHeading), true);
    setTxt('newsletterHeading', val('newsletterHeading', DEFAULTS.newsletterHeading));
    setTxt('newsletterDesc', val('newsletterDesc', DEFAULTS.newsletterDesc));

    setTxt('statProductsLabel', val('statProductsLabel', DEFAULTS.statProductsLabel));

    const chips = (Array.isArray(c.floatChips) && c.floatChips.length) ? c.floatChips : DEFAULTS.floatChips;
    for (let i = 0; i < 3; i++) {
      const chip = chips[i];
      const chipEl = document.getElementById('floatChip' + (i + 1));
      const chipIcon = document.getElementById('floatChip' + (i + 1) + 'Icon');
      const chipText = document.getElementById('floatChip' + (i + 1) + 'Text');
      if (!chipEl) continue;
      if (!chip || !chip.text) {
        chipEl.style.display = 'none';
        continue;
      }
      chipEl.style.display = '';
      if (chipIcon) chipIcon.className = chip.icon || 'fa-solid fa-star';
      if (chipText) chipText.textContent = chip.text;
    }

    setTxt('footerBrand', c.brandName ? c.brandName + ' Marketplace' : DEFAULTS.brandName + ' Marketplace');
    setTxt('footerText', val('footerText', DEFAULTS.footerText));

    const waNumber = '254713428774'; // Verified VIORA WhatsApp Business line.
    if (waNumber) {
      const wa = document.getElementById('whatsappFloat');
      const fwa = document.getElementById('footerWhatsApp');
      const fphone = document.getElementById('footerPhone');
      if (wa) { wa.href = 'https://wa.me/' + waNumber; wa.style.display = 'flex'; }
      if (fwa) fwa.href = 'https://wa.me/' + waNumber;
      if (fphone) fphone.textContent = '+' + waNumber;
    }

    const email = c.footerEmail || DEFAULTS.footerEmail;
    if (email) {
      const fe = document.getElementById('footerEmail');
      const fet = document.getElementById('footerEmailText');
      if (fe) fe.href = 'mailto:' + email;
      if (fet) fet.textContent = email;
    }
  },

  applyClientsite(cs) {
    cs = cs || {};
    const mc = this.content || {};
    const csStats = cs.stats || {};

    const resolveStat = (mcValue, csValue, fallback) => {
      if (mcValue !== undefined && mcValue !== null && mcValue !== '' && mcValue !== 'auto') {
        const n = parseInt(mcValue, 10);
        if (!isNaN(n)) return n;
      }
      if (mcValue === 'auto') return parseInt(fallback, 10) || 0;
      const n = parseInt(csValue, 10);
      if (!isNaN(n)) return n;
      return parseInt(fallback, 10) || 0;
    };

    const totalProducts = (this.products?.length || 0);
    const productsStat = resolveStat(mc.statProducts, csStats.products, totalProducts);

    const sp = document.getElementById('statProducts');
    if (sp) this.animateCounter(sp, productsStat);

    this.renderFeatured();
  },

  renderSteps(steps) {
    const host = document.getElementById('stepsGrid');
    if (!host) return;
    host.innerHTML = steps.map((s, i) => `
      <div class="step-card">
        <div class="step-num">${String(i + 1).padStart(2, '0')}</div>
        <h4>${this.escape(s.title || '')}</h4>
        <p>${this.escape(s.body || '')}</p>
      </div>
    `).join('');
  },

  renderFaq(faqs) {
    const host = document.getElementById('faqList');
    if (!host) return;
    host.innerHTML = faqs.map((f, i) => `
      <div class="faq-item" data-idx="${i}">
        <div class="faq-q" onclick="App.toggleFaq(${i})" role="button" tabindex="0">
          <span>${this.escape(f.q || '')}</span>
          <i class="fa-solid fa-chevron-down"></i>
        </div>
        <div class="faq-a">${this.escape(f.a || '')}</div>
      </div>
    `).join('');
  },
  toggleFaq(idx) {
    document.querySelectorAll('#faqList .faq-item').forEach((el, i) => {
      if (i === idx) el.classList.toggle('open');
      else el.classList.remove('open');
    });
  },

  renderCaseStudies(cases) {
    const host = document.getElementById('caseGrid');
    if (!host) return;
    host.innerHTML = cases.map(c => {
      const metrics = Array.isArray(c.metrics) ? c.metrics : [];
      const img = c.image
        ? `<div class="case-image"><img src="${this.escape(c.image)}" alt="${this.escape(c.title || '')}" loading="lazy"></div>`
        : `<div class="case-image"><i class="${this.escape(c.icon || 'fa-solid fa-industry')}"></i></div>`;
      return `
        <div class="case-card">
          ${img}
          <div class="case-body">
            <div class="case-industry">${this.escape(c.industry || 'Case Study')}</div>
            <div class="case-title">${this.escape(c.title || '')}</div>
            <div class="case-result">${this.escape(c.result || '')}</div>
            ${metrics.length ? `<div class="case-metrics">${metrics.map(m => `
              <div class="case-metric">
                <div class="case-metric-val">${this.escape(m.value || '')}</div>
                <div class="case-metric-lbl">${this.escape(m.label || '')}</div>
              </div>`).join('')}</div>` : ''}
            ${c.link ? `<a href="${this.escape(c.link)}" target="_blank" rel="noopener" class="case-cta">See how it works <i class="fa-solid fa-arrow-right"></i></a>` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  /* ═══════════════════════════════════════════════════════════
     FEATURED CARD
     ═══════════════════════════════════════════════════════════ */
  renderFeatured() {
    const card = document.getElementById('featuredCard');
    if (!card) return;
    const mc = this.content || {};

    let featured = null;
    if (mc.featuredProductId) {
      featured = this.products.find(p => p.id === mc.featuredProductId) || null;
    }
    if (!featured) {
      featured = this._seededShuffle(this.products.slice())[0] || null;
    }
    if (!featured && !mc.featuredTitle) {
      card.style.display = 'none';
      return;
    }
    card.style.display = 'block';

    const label = mc.featuredLabel || DEFAULTS.featuredLabel;
    const name = mc.featuredTitle || (featured ? featured.name : 'Featured');
    const priceKes = (mc.featuredPrice && Number(mc.featuredPrice) > 0) ?
      Number(mc.featuredPrice) :
      (featured ? usdToKes(featured.price) : 0);
    const note = mc.featuredNote || (featured && featured.description ? featured.description.substring(0, 60) : DEFAULTS.featuredNote);
    const features = (Array.isArray(mc.featuredFeatures) && mc.featuredFeatures.length) ?
      mc.featuredFeatures :
      (featured && featured.features && featured.features.length) ?
      featured.features :
      DEFAULTS.featuredFeatures;
    const btnLabel = mc.featuredBtn || DEFAULTS.featuredBtn;

        const labelEl = card.querySelector('.featured-label');
    if (labelEl) labelEl.textContent = label;

    const visualHost = document.getElementById('featuredVisual');
    if (visualHost) {
      const img = (featured && featured.image && String(featured.image).trim()) || '';
      if (img) {
        visualHost.innerHTML = `<img src="${this.escape(img)}" alt="${this.escape(name)}" loading="lazy"
          onerror="this.onerror=null;this.parentNode.innerHTML='<i class=\\'${(featured && featured.icon) || 'fa-solid fa-crown'}\\'></i>';" />`;
        visualHost.classList.add('has-image');
      } else {
        visualHost.innerHTML = `<i class="${(featured && featured.icon) || 'fa-solid fa-crown'}"></i>`;
        visualHost.classList.remove('has-image');
      }
    }
    const nameEl = document.getElementById('featuredName');
    if (nameEl) nameEl.textContent = name;
    const priceEl = document.getElementById('featuredPrice');
    if (priceEl) priceEl.textContent = fmtKShFromKes(priceKes);
    const noteEl = document.getElementById('featuredNote');
    if (noteEl) noteEl.textContent = note;
    const featEl = document.getElementById('featuredFeatures');
    if (featEl) {
      featEl.innerHTML = features.slice(0, 6)
        .map(f => `<li><i class="fa-solid fa-check"></i> ${this.escape(f)}</li>`).join('');
    }
    const btn = document.getElementById('featuredBtn');
    if (btn) {
      const isCustom = featured && this.isCustomProduct(featured);
      btn.innerHTML = isCustom
        ? `<i class="fa-solid fa-comments-dollar"></i> Get Quote`
        : `<i class="fa-solid fa-cart-plus"></i> ${this.escape(btnLabel)}`;
      btn.onclick = () => {
        if (!featured) { this.toast('Featured product not configured.', 'warning'); return; }
        if (isCustom) this.openQuoteModal(featured.id);
        else this.openPurchaseModal(featured.id);
      };
    }
  },

  /* ═══════════════════════════════════════════════════════════
     CATEGORIES
     ═══════════════════════════════════════════════════════════ */
    renderCategoryBar() {
    const bar = document.getElementById('categoryBar');
    const trigger = document.getElementById('categoryExplorerTrigger');
    const activeLabel = document.getElementById('activeCategoryLabel');
    const totalCount = document.getElementById('categoryTotalCount');
    if (!bar) return;

    const industryEntries = Object.values(INDUSTRY_MAP).slice().sort((a, b) => a.order - b.order);
    const categoryLabels = new Map();
    const names = [];
    const addCategory = raw => {
      const key = normalizeMarketCategory(raw);
      if (!key || key === 'marketplace' && !raw) return;
      if (!categoryLabels.has(key)) categoryLabels.set(key, displayMarketCategory(raw));
      if (!names.includes(key)) names.push(key);
    };

    industryEntries.forEach(ind => addCategory(ind.marketCategory));
    this.products.forEach(product => addCategory(product.category || 'Marketplace'));

    const allCats = ['all', ...names];
    const counts = new Map();
    this.products.forEach(product => {
      const key = normalizeMarketCategory(product.category || 'Marketplace');
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const visualFor = categoryKey => {
      const ind = industryEntries.find(item => normalizeMarketCategory(item.marketCategory) === categoryKey);
      if (ind) return { icon: ind.icon || 'fa-solid fa-tag', color: ind.color || '#60a5fa' };
      const value = categoryKey;
      const rules = [
        [/software|saas|app|system|erp|crm/, 'fa-solid fa-laptop-code', '#60a5fa'],
        [/design|creative|media|photo|video/, 'fa-solid fa-wand-magic-sparkles', '#c084fc'],
        [/business|finance|account|tax|legal/, 'fa-solid fa-briefcase', '#34d399'],
        [/education|course|training|learn|academy/, 'fa-solid fa-graduation-cap', '#fbbf24'],
        [/security|privacy|network|cloud|hosting/, 'fa-solid fa-shield-halved', '#38bdf8'],
        [/marketing|social|seo|advertis/, 'fa-solid fa-bullhorn', '#fb7185'],
        [/hardware|device|computer|accessor/, 'fa-solid fa-microchip', '#2dd4bf'],
        [/document|template|ebook|digital/, 'fa-solid fa-file-arrow-down', '#f97316']
      ];
      const match = rules.find(([pattern]) => pattern.test(value));
      return match ? { icon: match[1], color: match[2] } : { icon: 'fa-solid fa-cubes-stacked', color: '#818cf8' };
    };

    const q = String(this._catSearch || '').toLowerCase().trim();
    const filtered = allCats.filter(category => category === 'all' || (categoryLabels.get(category) || category).toLowerCase().includes(q));
    const allCount = this.products.length;
    if (totalCount) totalCount.textContent = allCount.toLocaleString() + (allCount === 1 ? ' product' : ' products') + ' across ' + names.length + ' categories';
    if (activeLabel) activeLabel.textContent = this.activeCategory === 'all' ? 'All products' : (categoryLabels.get(this.activeCategory) || displayMarketCategory(this.activeCategory));
    if (trigger) trigger.setAttribute('aria-expanded', String(document.getElementById('categoryExplorerPanel')?.hidden === false));

    bar.innerHTML = filtered.map(category => {
      const all = category === 'all';
      const visual = all ? { icon: 'fa-solid fa-globe', color: '#60a5fa' } : visualFor(category);
      const count = all ? allCount : (counts.get(category) || 0);
      const active = this.activeCategory === category;
      const label = all ? 'All products' : (categoryLabels.get(category) || displayMarketCategory(category));
      return `<button class="category-option ${active ? 'active' : ''}" type="button" role="option" aria-selected="${active}" data-cat="${this.escape(category)}">
        <span class="category-option-icon" style="--category-accent:${this.escape(visual.color)}"><i class="${this.escape(visual.icon)}"></i></span>
        <span class="category-option-copy"><strong>${this.escape(label)}</strong><small>${all ? 'Explore the complete collection' : 'Browse ' + this.escape(label) + ' solutions'}</small></span>
        <span class="category-option-count">${count.toLocaleString()}</span>
      </button>`;
    }).join('') || '<div class="category-empty"><i class="fa-solid fa-magnifying-glass"></i><span>No categories match that search.</span></div>';

    bar.querySelectorAll('[data-cat]').forEach(button => {
      button.addEventListener('click', () => {
        this.activeCategory = button.dataset.cat;
        const panel = document.getElementById('categoryExplorerPanel');
        if (panel) panel.hidden = true;
        this._catSearch = '';
        const input = document.getElementById('catSearchInput');
        if (input) input.value = '';
        this.renderCategoryBar();
        this.renderProducts();
        if (window.matchMedia('(max-width: 900px)').matches) {
          document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    const panel = document.getElementById('categoryExplorerPanel');
    if (trigger && !trigger._vBound) {
      trigger._vBound = true;
      trigger.addEventListener('click', () => {
        if (!panel) return;
        panel.hidden = !panel.hidden;
        trigger.setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden) setTimeout(() => document.getElementById('catSearchInput')?.focus(), 60);
      });
    }
    if (panel && !panel._vBound) {
      panel._vBound = true;
      document.addEventListener('click', event => {
        const explorer = document.getElementById('categoryExplorer');
        if (explorer && !explorer.contains(event.target)) {
          panel.hidden = true;
          document.getElementById('categoryExplorerTrigger')?.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          panel.hidden = true;
          document.getElementById('categoryExplorerTrigger')?.setAttribute('aria-expanded', 'false');
        }
      });
    }
  },

   /* ── Seeded shuffle — stable per visitor, different between visitors ── */
  _shuffleSeed() {
    let seed = localStorage.getItem('viora_market_seed');
    if (!seed) {
      seed = String(Math.floor(Math.random() * 1e9));
      localStorage.setItem('viora_market_seed', seed);
    }
    return Number(seed);
  },

  _seededShuffle(list) {
    const arr = list.slice();
    let seed = this._shuffleSeed();
    const rand = () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  applyPriceFilter(list) {
    if (this.priceFilter === 'all') return list;
    return list.filter(p => {
      const kes = usdToKes(p.price || 0);
      if (this.priceFilter === 'under-2k') return kes < 2000;
      if (this.priceFilter === '2k-5k') return kes >= 2000 && kes < 5000;
      if (this.priceFilter === '5k-10k') return kes >= 5000 && kes < 10000;
      if (this.priceFilter === 'over-10k') return kes >= 10000;
      return true;
    });
  },

  applySort(list) {
    const l = list.slice();
    switch (this.sortMode) {
      case 'price-asc': return l.sort((a, b) => (a.price || 0) - (b.price || 0));
      case 'price-desc': return l.sort((a, b) => (b.price || 0) - (a.price || 0));
      case 'name-asc': return l.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case 'name-desc': return l.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      case 'popular':
      default:
        return this._seededShuffle(l);
    }
  },

  /* ═══════════════════════════════════════════════════════════
     PRODUCTS RENDER
     ═══════════════════════════════════════════════════════════ */
  renderProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    if (!this.products.length) {
      grid.innerHTML = `<div class="empty-catalog"><i class="fa-solid fa-store"></i><h3>Catalog is empty</h3><p>Add products in the main system's Marketplace → Products tab.</p></div>`;
      return;
    }

    let list = this.products;
    if (this.activeCategory !== 'all') list = list.filter(p => normalizeMarketCategory(p.category) === this.activeCategory);

    if (this.activeCategory !== 'all') {
      const stillExists = Object.values(INDUSTRY_MAP).some(
        ind => normalizeMarketCategory(ind.marketCategory) === this.activeCategory
      );
      if (!stillExists && !this.products.some(p => normalizeMarketCategory(p.category) === this.activeCategory)) {
        this.activeCategory = 'all';
        this.renderCategoryBar();
      }
    }
     
    if (this.searchTerm) {
      const q = this.searchTerm;
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.tags || []).some(t => String(t).toLowerCase().includes(q))
      );
    }
    list = this.applyPriceFilter(list);
    list = this.applySort(list);

    if (!list.length) {
      grid.innerHTML = `<div class="empty-catalog"><i class="fa-solid fa-box-open"></i><h3>No matches</h3><p>Try adjusting your search or filters.</p></div>`;
      return;
    }

   grid.innerHTML = list.map(p => {
  /* v3.1 — normalize icon class: ensure `fa-solid` prefix is present */
  let iconClass = p.icon || 'fa-solid fa-cube';
  if (!/^fa-(solid|regular|light|thin|brands|duotone)\s/.test(iconClass)) {
    iconClass = 'fa-solid ' + iconClass.replace(/^fa-/, 'fa-');
  }
      const priceKes = usdToKes(p.price || 0);
      const inWish = this.wishlist.includes(p.id);
      const stock = this.getProductStock(p.id);
      const soldOut = stock.loaded && stock.qty <= 0;
      const isCustom = this.isCustomProduct(p);
      const agg = this.getReviewAggregate(p.id);

      const previewAvailable = p.status === 'active';

      const previewBtn = previewAvailable
        ? `<button type="button" class="preview-btn" onclick="event.stopPropagation(); App.requestPreview('${p.id}')" title="Request a controlled preview"><i class="fa-solid fa-eye"></i> Preview</button>`
        : '';

      const stockBadge = !stock.loaded
        ? `<span class="stock-badge"><i class="fa-solid fa-circle"></i> Available</span>`
        : soldOut
          ? `<span class="stock-badge out"><i class="fa-solid fa-circle"></i> Sold Out</span>`
          : `<span class="stock-badge"><i class="fa-solid fa-circle"></i> ${stock.qty} in stock</span>`;

      const imageHtml = (p.image && String(p.image).trim())
        ? `<div class="product-visual">
             <img src="${this.escape(p.image)}" alt="${this.escape(p.name)}" loading="lazy"
                  onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex';" />
             <div class="product-visual-fallback" style="display:none;"><i class="${iconClass}"></i></div>
           </div>`
        : `<div class="product-visual">
             <div class="product-visual-fallback" style="display:flex;"><i class="${iconClass}"></i></div>
           </div>`;

      const primaryBtn = isCustom
        ? `<button class="quote-btn" onclick="event.stopPropagation(); App.openQuoteModal('${p.id}')">
             <i class="fa-solid fa-comments-dollar"></i> Get Quote
           </button>`
        : `<button class="buy-btn" ${soldOut ? 'disabled' : ''} onclick="event.stopPropagation(); App.openPurchaseModal('${p.id}')">
             <i class="fa-solid fa-bolt"></i> ${soldOut ? 'Sold Out' : 'Buy Now'}
           </button>`;

      const cartBtn = isCustom
        ? ''
        : `<button class="icon-btn" ${soldOut ? 'disabled' : ''} onclick="event.stopPropagation(); App.addToCart('${p.id}')" title="Add to cart" aria-label="Add to cart"><i class="fa-solid fa-cart-plus"></i></button>`;
      const subscribeBtn = `<a class="subscribe-btn" href="/client.html" onclick="event.stopPropagation();" title="Subscribe through your VIORA Client Portal"><i class="fa-solid fa-key"></i> Subscribe</a>`;

      return `
        <div class="product-card${soldOut ? ' sold-out' : ''}" data-product-id="${this.escape(p.id)}" onclick="App.openProductDetail('${p.id}')">
          ${stockBadge}
          <div class="product-layout">
            ${imageHtml}
            <div class="product-details">
              <div class="product-meta">
                <span class="product-category">${this.escape(p.category || 'Software')}</span>
                ${isCustom ? `<span class="product-type-pill">Custom</span>` : ''}
                ${p.period ? `<span class="product-period">${this.escape(p.period)}</span>` : ''}
              </div>
              <h3 class="product-title">${this.escape(p.name)}</h3>
                         ${agg.count > 0 ? `<div class="product-rating">${this.renderStars(agg.avg)} <span class="rev-count">${agg.avg.toFixed(1)} (${agg.count})</span></div>` : ''}
              <p class="product-desc">${this.escape(p.description || 'Premium software license.')}</p>
              ${(p.tags && p.tags.length)
                ? `<div class="product-tags">${p.tags.slice(0, 4).map(t => `<span>${this.escape(t)}</span>`).join('')}</div>`
                : ''}
              <div class="product-actions">
                <div class="product-price${isCustom ? ' quote-price' : ''}">${isCustom ? 'Custom pricing' : fmtKShFromKes(priceKes)}</div>
                <div class="product-action-buttons">
                  ${previewBtn}
                  ${subscribeBtn}
                  <button class="icon-btn ${inWish ? 'active' : ''}" onclick="event.stopPropagation(); App.toggleWishlist('${p.id}')" title="Wishlist" aria-label="Toggle wishlist"><i class="fa-solid fa-heart"></i></button>
                  ${cartBtn}
                  ${primaryBtn}
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  getProductStock(productId) {
    if (!this._inventoryByProductId) return { loaded: false, qty: null };
    const row = this._inventoryByProductId[productId] ||
      this._inventoryByProductId[String(productId).toLowerCase()];
    if (!row) return { loaded: false, qty: null };
    return { loaded: true, qty: Number(row.qty || 0) };
  },

  /* ═══════════════════════════════════════════════════════════
     PRODUCT DETAIL MODAL
     ═══════════════════════════════════════════════════════════ */
  async openProductDetail(productId) {
      const p = this.products.find(x => x.id === productId);
    if (!p) { this.toast('Product not found.', 'error'); return; }

    this._reviewDraft = { productId: productId, stars: 0 };

    const isCustom = this.isCustomProduct(p);
    const extras = this.getProductExtras(productId);
    const previewAvailable = p.previewEnabled === true && p.previewGatewayVerified === true && ['isolated-software', 'digital-sample'].includes(p.previewProfile);
    const demoEmbed = null; // External embeds are not trusted as controlled previews.
    const gallery = Array.isArray(extras.gallery) ? extras.gallery.filter(Boolean) : [];
    const productFaqs = Array.isArray(extras.faqs) ? extras.faqs : [];
    const features = (p.features && p.features.length) ? p.features : [];
    const priceKes = usdToKes(p.price || 0);

    const reviews = await this.loadReviews(productId);
    const agg = this.getReviewAggregate(productId);
    this._activeReviewProductId = productId;

  const iconClass = (() => {
  let ic = p.icon || 'fa-solid fa-cube';
  if (!/^fa-(solid|regular|light|thin|brands|duotone)\s/.test(ic)) {
    ic = 'fa-solid ' + ic.replace(/^fa-/, 'fa-');
  }
  return ic;
})();
const heroVisual = (p.image && String(p.image).trim())
  ? `<div class="pdm-visual"><img src="${this.escape(p.image)}" alt="${this.escape(p.name)}"></div>`
  : `<div class="pdm-visual"><i class="${iconClass}"></i></div>`;

    const ctaRow = isCustom
      ? `<div class="pdm-cta-row">
           ${previewAvailable ? `<button class="btn-secondary" onclick="event.stopPropagation(); App.requestPreview('${p.id}')"><i class="fa-solid fa-eye"></i> Request Preview</button>` : ''}
           <a href="/client.html" class="btn-outline"><i class="fa-solid fa-key"></i> Subscribe</a>
           <button class="quote-btn" onclick="App.closeModal('productDetailModal'); App.openQuoteModal('${p.id}')"><i class="fa-solid fa-comments-dollar"></i> Request a Quote</button>
           <button class="btn-outline" onclick="App.closeModal('productDetailModal'); App.openWhatsAppQuote('${p.id}')"><i class="fa-brands fa-whatsapp"></i> Chat on WhatsApp</button>
         </div>`
      : `<div class="pdm-cta-row">
           ${previewAvailable ? `<button type="button" class="btn-secondary" onclick="event.stopPropagation(); App.requestPreview('${p.id}')"><i class="fa-solid fa-eye"></i> Request Preview</button>` : ''}
           <a href="/client.html" class="btn-outline"><i class="fa-solid fa-key"></i> Subscribe</a>
           <button class="btn-outline" onclick="App.closeModal('productDetailModal'); App.addToCart('${p.id}')"><i class="fa-solid fa-cart-plus"></i> Add to Cart</button>
           <button class="btn-primary" onclick="App.closeModal('productDetailModal'); App.openPurchaseModal('${p.id}')"><i class="fa-solid fa-bolt"></i> Buy Now</button>
         </div>`;

    const overviewPanel = `
      <div class="pdm-panel active" data-panel="overview">
        <h4 class="pdm-section-title">About this ${isCustom ? 'Solution' : 'Product'}</h4>
        <p class="pdm-text">${this.escape(p.description || 'No description provided.')}</p>
        ${features.length ? `
          <h4 class="pdm-section-title">What's included</h4>
          <ul class="pdm-features">
            ${features.map(f => `<li><i class="fa-solid fa-circle-check"></i><span>${this.escape(f)}</span></li>`).join('')}
          </ul>` : ''}
        ${demoEmbed ? `
          <h4 class="pdm-section-title">Live Demo</h4>
          <div class="pdm-demo-embed">
            <iframe src="${this.escape(demoEmbed)}" title="Demo" loading="lazy" allow="fullscreen; encrypted-media" referrerpolicy="no-referrer"></iframe>
          </div>` : ''}
        ${gallery.length ? `
          <h4 class="pdm-section-title">Gallery</h4>
          <div class="pdm-gallery">
            ${gallery.map(g => `<a href="${this.escape(g)}" target="_blank" rel="noopener" class="pdm-gallery-item"><img src="${this.escape(g)}" alt="" loading="lazy"></a>`).join('')}
          </div>` : ''}
      </div>`;

    const reviewsPanel = `
      <div class="pdm-panel" data-panel="reviews">
        <div class="rev-summary">
          <div>
            <div class="rev-big">${agg.count ? agg.avg.toFixed(1) : '—'}</div>
            <div class="rev-big-sub">${agg.count} review${agg.count === 1 ? '' : 's'}</div>
          </div>
          <div>
            <div class="rev-stars-big">${this.renderStars(agg.avg || 0)}</div>
            <div class="rev-count">Based on verified purchases</div>
          </div>
        </div>
        <div class="rev-list" id="pdmReviewsList">
          ${reviews.length ? reviews.map(r => this.renderReviewItem(r)).join('') : `<div class="rev-empty">No reviews yet. Be the first!</div>`}
        </div>
        <form class="rev-form" id="reviewForm" onsubmit="event.preventDefault(); App.submitReview();">
          <div class="rev-form-title">Write a Review</div>
          <div class="rev-star-select" id="revStarSelect" role="radiogroup" aria-label="Rating">
            ${[1,2,3,4,5].map(i => `<button type="button" class="rev-star" data-star="${i}" role="radio" aria-checked="false" aria-label="${i} star${i>1?'s':''}" onclick="App.setReviewStar(${i})" onmouseenter="App.hoverReviewStar(${i})" onmouseleave="App.hoverReviewStar(0)">★</button>`).join('')}
          </div>
          <div class="modal-field">
            <label for="revName">Your name *</label>
            <input type="text" id="revName" placeholder="e.g. Jane Wanjiru" required autocomplete="name" />
          </div>
          <div class="modal-field">
            <label for="revEmail">Email *</label>
            <input type="email" id="revEmail" placeholder="you@example.com" required autocomplete="email" />
          </div>
          <div class="modal-field">
            <label for="revPhone">Phone *</label>
            <input type="tel" id="revPhone" placeholder="+254 7XX XXX XXX" required autocomplete="tel" />
          </div>
          <div class="modal-field">
            <label for="revText">Your review *</label>
            <textarea id="revText" rows="3" placeholder="Share your experience with this product…" required></textarea>
          </div>
          <button type="submit" class="btn-primary btn-full" id="revSubmitBtn"><i class="fa-solid fa-paper-plane"></i> Submit Review</button>
          <p class="rev-form-note">Your email &amp; phone are only used to verify your purchase and never shown publicly.</p>
        </form>
      </div>`;

    const faqsPanel = productFaqs.length ? `
      <div class="pdm-panel" data-panel="faqs">
        <h4 class="pdm-section-title">Frequently Asked</h4>
        <div class="pdm-faq-list">
          ${productFaqs.map((f, i) => `
            <div class="pdm-faq-item" data-idx="${i}">
              <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
                <span>${this.escape(f.q || '')}</span>
                <i class="fa-solid fa-chevron-down"></i>
              </div>
              <div class="faq-a">${this.escape(f.a || '')}</div>
            </div>`).join('')}
        </div>
      </div>` : '';

    const tabs = [
      { id: 'overview', label: 'Overview' },
      { id: 'reviews', label: `Reviews (${agg.count})` },
      ...(productFaqs.length ? [{ id: 'faqs', label: 'FAQ' }] : [])
    ];

    document.getElementById('productDetailBody').innerHTML = `
      <div class="pdm-hero">
        ${heroVisual}
        <div class="pdm-headline">
          <div class="pdm-cat">${this.escape(p.category || 'Software')}${isCustom ? ' · Custom Build' : ''}</div>
          <h2 class="pdm-title" id="pdmTitle">${this.escape(p.name)}</h2>
          ${agg.count > 0 ? `<div class="pdm-rating"><span class="rev-stars">${'★'.repeat(Math.round(agg.avg))}${'☆'.repeat(5 - Math.round(agg.avg))}</span> ${agg.avg.toFixed(1)} · ${agg.count} review${agg.count === 1 ? '' : 's'}</div>` : ''}
          <div class="pdm-price">${isCustom ? 'Custom Pricing' : fmtKShFromKes(priceKes)}</div>
          <div class="pdm-price-label">${isCustom ? 'Contact us for a tailored quote' : (p.period || 'One-time payment')}</div>
          ${ctaRow}
        </div>
      </div>
      <div class="pdm-tabs">
        ${tabs.map((t, i) => `<button class="pdm-tab ${i === 0 ? 'active' : ''}" data-tab="${t.id}" onclick="App.switchPdmTab('${t.id}')">${t.label}</button>`).join('')}
      </div>
      <div class="pdm-body">
        ${overviewPanel}
        ${reviewsPanel}
        ${faqsPanel}
      </div>
    `;

    this.openModal('productDetailModal');
  },

  switchPdmTab(tabId) {
    document.querySelectorAll('.pdm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.pdm-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tabId));
  },

  setReviewStar(n) {
    this._reviewDraft.stars = Number(n) || 0;
    this.hoverReviewStar(this._reviewDraft.stars);
    document.querySelectorAll('#revStarSelect .rev-star').forEach(b => {
      const val = Number(b.dataset.star);
      b.setAttribute('aria-checked', val === this._reviewDraft.stars ? 'true' : 'false');
    });
  },

  hoverReviewStar(n) {
    const active = Number(n) || this._reviewDraft.stars || 0;
    document.querySelectorAll('#revStarSelect .rev-star').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.star) <= active);
    });
  },

  renderStars(avg) {
    const v = Math.max(0, Math.min(5, Number(avg) || 0));
    let out = '';
    for (let i = 1; i <= 5; i++) {
      if (v >= i) out += '<i class="fa-solid fa-star"></i>';
      else if (v >= i - 0.5) out += '<i class="fa-solid fa-star-half-stroke"></i>';
      else out += '<i class="fa-regular fa-star"></i>';
    }
    return out;
  },

  renderReviewItem(r) {
    return `
      <div class="rev-item">
        <div class="rev-head">
          <span class="rev-author">${this.escape(r.name || 'Anonymous')}</span>
          ${r.verified ? `<span class="rev-verified"><i class="fa-solid fa-circle-check"></i> Verified Purchase</span>` : ''}
          <span class="rev-date">${new Date(r.ts || 0).toLocaleDateString('en-KE', { year:'numeric', month:'short', day:'numeric' })}</span>
        </div>
        <div class="rev-stars-inline">${this.renderStars(r.rating || 0)}</div>
        <p class="rev-text">${this.escape(r.text || '')}</p>
      </div>`;
  },

  async submitReview() {
    const productId = this._activeReviewProductId;
    if (!productId) return;

    const name  = (document.getElementById('revName')?.value || '').trim();
    const email = (document.getElementById('revEmail')?.value || '').trim();
    const phone = (document.getElementById('revPhone')?.value || '').trim();
    const text  = (document.getElementById('revText')?.value || '').trim();
    const rating = this._reviewDraft.stars;

    if (!name || !email || !phone || !text || !rating) {
      this.toast('Please fill name, email, phone, rating, and review text.', 'warning');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.toast('Please enter a valid email address.', 'warning');
      return;
    }
    if (!firebaseReady || !db) { this.toast('Reviews unavailable right now.', 'error'); return; }

    const btn = document.getElementById('revSubmitBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting…'; }

    try {
      const p = this.products.find(x => x.id === productId);
      const productName = p ? p.name : productId;

      const leadResult = await this.captureLead(
        'review',
        { name, email, phone },
        [{ productId, productName, plan: 'review', amount: 0, qty: 1 }]
      );

      let verified = false;
      try {
        const ordersSnap = await db.ref(P('orders')).once('value');
        const allOrders = ordersSnap.val() || {};
        verified = Object.values(allOrders).some(o => {
          if (!o || o.kind === 'quote') return false;
          const samePerson =
            String(o.customerEmail || '').toLowerCase() === email.toLowerCase() ||
            String(o.customerPhone || '').replace(/\D/g,'') === phone.replace(/\D/g,'');
          const hasProduct = (o.items || []).some(it => it.productId === productId);
          return samePerson && hasProduct;
        });
      } catch (e) { console.warn('[reviews] verify failed:', e); }

      const rid = 'rev-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const reviewRecord = {
        id: rid,
        name, email, phone,
        rating: Number(rating),
        text,
        verified,
        leadId: leadResult.leadKey || null,
        source: 'marketplace',
        ts: new Date().toISOString()
      };
      await db.ref(P('reviews') + '/' + productId + '/' + rid).set(reviewRecord);

      this.toast(
        verified ? 'Verified review submitted. Thank you!' : 'Review submitted. Thank you!',
        'success'
      );

      this._reviewDraft.stars = 0;
      const reviews = await this.loadReviews(productId);
      const newAgg = this.getReviewAggregate(productId);

      const listEl = document.getElementById('pdmReviewsList');
      if (listEl) listEl.innerHTML = reviews.map(r => this.renderReviewItem(r)).join('');

      const sumEl = document.querySelector('.rev-summary .rev-big');
      const sumSub = document.querySelector('.rev-summary .rev-big-sub');
      const sumStars = document.querySelector('.rev-summary .rev-stars-big');
      if (sumEl) sumEl.textContent = newAgg.count ? newAgg.avg.toFixed(1) : '—';
      if (sumSub) sumSub.textContent = `${newAgg.count} review${newAgg.count === 1 ? '' : 's'}`;
      if (sumStars) sumStars.innerHTML = this.renderStars(newAgg.avg || 0);

      const tabBtn = document.querySelector('.pdm-tab[data-tab="reviews"]');
      if (tabBtn) tabBtn.textContent = `Reviews (${newAgg.count})`;

      const form = document.getElementById('reviewForm');
      if (form) {
        form.reset();
        document.querySelectorAll('#revStarSelect .rev-star').forEach(b => b.classList.remove('active'));
      }

      this.renderProducts();
      this.renderCarousel();
    } catch (err) {
      console.error('[reviews] submit failed:', err);
      this.toast('Failed to submit review. Please try again.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Review'; }
    }
  },

  /* ═══════════════════════════════════════════════════════════
     GET QUOTE (custom software)
     ═══════════════════════════════════════════════════════════ */
  openQuoteModal(productId) {
    const p = this.products.find(x => x.id === productId);
    if (!p) { this.toast('Product not found.', 'error'); return; }
    document.getElementById('quoteProductId').value = p.id;
    document.getElementById('quoteProductName').value = p.name;
    document.getElementById('quoteProductDisplay').value = `${p.name} — ${p.description || ''}`;
    this.openModal('quoteModal');
  },

  openWhatsAppQuote(productId) {
    const p = this.products.find(x => x.id === productId);
    const wa = '254713428774'; // Verified VIORA WhatsApp Business line.
    const msg = p ? `Hi Viora, I'm interested in "${p.name}". Can we discuss a custom build for my business?` : `Hi Viora, I'd like to discuss a custom build.`;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  },

  async submitQuote(e) {
    e.preventDefault();
    const btn = document.getElementById('quoteSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…';

    const productId = document.getElementById('quoteProductId').value;
    const productName = document.getElementById('quoteProductName').value;
    const name = document.getElementById('quoteName').value.trim();
    const email = document.getElementById('quoteEmail').value.trim();
    const phone = document.getElementById('quotePhone').value.trim();
    const company = document.getElementById('quoteCompany').value.trim();
    const industry = document.getElementById('quoteIndustry').value;
    const companySize = document.getElementById('quoteCompanySize').value;
    const budget = document.getElementById('quoteBudget').value;
    const timeline = document.getElementById('quoteTimeline').value;
    const needs = document.getElementById('quoteNeeds').value.trim();

    if (!name || !email || !phone || !industry || !budget || !needs) {
      this.toast('Please fill all required fields.', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Quote Request';
      return;
    }

    const quoteId = 'QTE-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

    try {
      const leadResult = await this.captureLead('quote', { name, email, phone }, [{
        productId, productName, plan: 'quote', amount: 0, qty: 1
      }], {
        company, industry, companySize,
        budget, timeline, needs, quoteId
      });

      if (firebaseReady && db) {
        await db.ref(P('orders') + '/' + quoteId).set({
          id: quoteId,
          kind: 'quote',
          items: [{ productId, productName, plan: 'quote' }],
          customerName: name, customerEmail: email, customerPhone: phone,
          company, industry, companySize, budget, timeline, needs,
          status: 'new',
          timestamp: new Date().toISOString(),
          source: 'marketplace',
          leadId: leadResult.leadKey || null
        });
        if (typeof window.vioraNotify === 'function') await window.vioraNotify({ eventId: quoteId, title: 'Marketplace: new quote request', body: 'A new marketplace quote request was received for ' + productName + '.', level: 'warning', icon: 'fa-file-invoice', source: 'marketplace-quote', url: '/main.html#marketplace-orders' });
      }

      document.getElementById('quoteThanksId').textContent = quoteId;
      const wa = '254713428774'; // Verified VIORA WhatsApp Business line.
      const waMsg = encodeURIComponent(`Hi Viora, I just requested a quote (${quoteId}) for "${productName}". Looking forward to your reply!`);
      const qwa = document.getElementById('quoteThanksWhatsApp');
      if (qwa) qwa.href = `https://wa.me/${wa}?text=${waMsg}`;

      this.closeModal('quoteModal');
      this.openModal('quoteThankYouModal');
      this.toast('Quote request sent! We\'ll be in touch shortly.', 'success');
    } catch (err) {
      console.error(err);
      this.toast('Failed to send quote. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Quote Request';
    }
  },

  resetQuoteForm() {
    document.getElementById('quoteForm')?.reset();
    document.getElementById('quoteProductId').value = '';
    document.getElementById('quoteProductName').value = '';
  },

  /* ═══════════════════════════════════════════════════════════
     CAROUSEL
     ═══════════════════════════════════════════════════════════ */
  renderCarousel() {
    const track = document.getElementById('carouselTrack');
    const dotsHost = document.getElementById('carouselDots');
    if (!track) return;

        const list = this._seededShuffle(this.products || []);

    if (!list.length) {
      track.innerHTML = `<div class="carousel-empty"><i class="fa-solid fa-box-open"></i><p>No products to browse yet.</p></div>`;
      if (dotsHost) dotsHost.innerHTML = '';
      this._updateCarouselNav();
      return;
    }

    // Destroy any previous autoplay before re-rendering
    this._stopCarouselAutoplay();

   const cardHtml = (p, isClone) => {
  /* v3.1 — normalize icon class */
  let iconClass = p.icon || 'fa-solid fa-cube';
  if (!/^fa-(solid|regular|light|thin|brands|duotone)\s/.test(iconClass)) {
    iconClass = 'fa-solid ' + iconClass.replace(/^fa-/, 'fa-');
  }
      const priceKes = usdToKes(p.price || 0);
      const inWish = this.wishlist.includes(p.id);
      const stock = this.getProductStock(p.id);
      const soldOut = stock.loaded && stock.qty <= 0;
      const isCustom = this.isCustomProduct(p);

      const previewAvailable = p.status === 'active';
      const previewBtn = previewAvailable
        ? `<button type="button" class="carousel-preview-btn" onclick="event.stopPropagation(); App.requestPreview('${p.id}')" title="Request controlled preview"><i class="fa-solid fa-eye"></i></button>`
        : '';

      const visualHtml = (p.image && String(p.image).trim())
        ? `<div class="carousel-image"><img src="${this.escape(p.image)}" alt="${this.escape(p.name)}" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'carousel-image-fallback\\'><i class=\\'${iconClass}\\'></i></div>';"></div>`
        : `<div class="carousel-image"><div class="carousel-image-fallback"><i class="${iconClass}"></i></div></div>`;

      const actionBtns = isCustom
        ? `<button class="carousel-quote-btn" onclick="event.stopPropagation(); App.openQuoteModal('${p.id}')"><i class="fa-solid fa-comments-dollar"></i> Quote</button>`
        : `<button class="carousel-cart-btn" ${soldOut ? 'disabled' : ''} onclick="event.stopPropagation(); App.addToCart('${p.id}')" title="Add to cart"><i class="fa-solid fa-cart-plus"></i></button>
           <button class="carousel-buy-btn" ${soldOut ? 'disabled' : ''} onclick="event.stopPropagation(); App.openPurchaseModal('${p.id}')"><i class="fa-solid fa-bolt"></i> ${soldOut ? 'Sold' : 'Buy'}</button>`;

      return `
        <div class="carousel-card${soldOut ? ' sold-out' : ''}" data-product-id="${this.escape(p.id)}" data-clone="${isClone ? '1' : '0'}" onclick="App.openProductDetail('${p.id}')">
          <div class="carousel-badges">
            ${isCustom
              ? `<span class="carousel-badge" style="background:rgba(179,102,255,.18);color:var(--purple);border-color:rgba(179,102,255,.4);"><i class="fa-solid fa-wand-magic-sparkles"></i> Custom</span>`
              : (soldOut
                  ? `<span class="carousel-badge out"><i class="fa-solid fa-circle"></i> Sold Out</span>`
                  : (stock.loaded
                      ? `<span class="carousel-badge"><i class="fa-solid fa-circle"></i> ${stock.qty} in stock</span>`
                      : `<span class="carousel-badge"><i class="fa-solid fa-circle"></i> Available</span>`))}
          </div>
          ${visualHtml}
          <div class="carousel-body">
            <div class="carousel-category">${this.escape(p.category || 'Software')}</div>
            <div class="carousel-title">${this.escape(p.name)}</div>
            <div class="carousel-desc">${this.escape((p.description || 'Premium software license.').slice(0, 110))}${(p.description || '').length > 110 ? '…' : ''}</div>
            <div class="carousel-tags">
              ${(p.tags || []).slice(0, 3).map(t => `<span>${this.escape(t)}</span>`).join('')}
            </div>
            <div class="carousel-price-row">
              <div class="carousel-price">${isCustom ? 'Custom' : fmtKShFromKes(priceKes)}</div>
              <div class="carousel-actions">
                ${previewBtn}
                <a class="carousel-subscribe-btn" href="/client.html" onclick="event.stopPropagation();" title="Subscribe through your VIORA Client Portal"><i class="fa-solid fa-key"></i> Subscribe</a>
                <button class="carousel-wish-btn ${inWish ? 'active' : ''}" onclick="event.stopPropagation(); App.toggleWishlist('${p.id}');" title="Wishlist"><i class="fa-solid fa-heart"></i></button>
                ${actionBtns}
              </div>
            </div>
          </div>
        </div>
      `;
    };

    // Render original cards + a full duplicate set for seamless looping
    track.innerHTML =
      list.map(p => cardHtml(p, false)).join('') +
      list.map(p => cardHtml(p, true)).join('');

    // Dots for the ORIGINAL set only
    if (dotsHost) {
      dotsHost.innerHTML = list.map((_, i) =>
        `<button class="carousel-dot${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Go to product ${i + 1}"></button>`
      ).join('');
      dotsHost.querySelectorAll('.carousel-dot').forEach(dot => {
        dot.addEventListener('click', () => {
          const idx = Number(dot.dataset.index);
          const step = this._cardStep();
          if (step) {
            track.scrollTo({ left: idx * step, behavior: 'smooth' });
          }
        });
      });
    }

    // Reset scroll to 0 for a clean start
    track.scrollLeft = 0;
    this._carouselIndex = 0;

    this._bindCarouselControls();
    this._updateCarouselNav();
    this._startCarouselAutoplay();
  },

  /* ── Card measurements ── */
  _cardStep() {
    const track = document.getElementById('carouselTrack');
    if (!track) return 0;
    const card = track.querySelector('.carousel-card');
    if (!card) return 0;
    const style = getComputedStyle(track);
    const gap = parseFloat(style.columnGap || style.gap || 0) || 0;
    return Math.round(card.getBoundingClientRect().width + gap);
  },

  _visibleCount() {
    const track = document.getElementById('carouselTrack');
    const step = this._cardStep();
    if (!track || !step) return 1;
    return Math.max(1, Math.round(track.clientWidth / step));
  },

  _originalCount() {
    const track = document.getElementById('carouselTrack');
    if (!track) return 0;
    return track.querySelectorAll('.carousel-card[data-clone="0"]').length;
  },

  _halfWidth() {
    // Width of one full set of cards (used to wrap the loop)
    const track = document.getElementById('carouselTrack');
    const step = this._cardStep();
    const n = this._originalCount();
    return n * step;
  },

  _scrollCarouselTo(index) {
    const track = document.getElementById('carouselTrack');
    const step = this._cardStep();
    if (!track || !step) return;
    const max = Math.max(0, this._originalCount() - 1);
    const target = Math.max(0, Math.min(index, max));
    this._carouselIndex = target;
    track.scrollTo({ left: target * step, behavior: 'smooth' });
  },

  _scrollCarouselBy(direction) {
    const track = document.getElementById('carouselTrack');
    if (!track) return;
    const step = this._cardStep();
    if (!step) return;
    const current = Math.round(track.scrollLeft / step);
    this._scrollCarouselTo(current + direction);
  },

  _updateCarouselNav() {
    const track = document.getElementById('carouselTrack');
    const prev = document.getElementById('carouselPrev');
    const next = document.getElementById('carouselNext');
    if (!track) return;
    const step = this._cardStep() || 1;
    const idx = Math.round(track.scrollLeft / step);
    this._carouselIndex = idx;
    if (prev) prev.disabled = false; // loop is seamless — never disabled
    if (next) next.disabled = false;
    this._updateCarouselDots();
  },

  _updateCarouselDots() {
    const track = document.getElementById('carouselTrack');
    const dots = document.querySelectorAll('#carouselDots .carousel-dot');
    if (!track || !dots.length) return;
    const step = this._cardStep() || 1;
    const n = this._originalCount() || 1;
    const rawIdx = Math.round(track.scrollLeft / step);
    const idx = ((rawIdx % n) + n) % n; // wrap for clone set
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
  },

  _bindCarouselControls() {
    const track = document.getElementById('carouselTrack');
    const prev = document.getElementById('carouselPrev');
    const next = document.getElementById('carouselNext');
    const wrapper = document.getElementById('carouselWrapper') || document.querySelector('.carousel-wrapper');
    if (!track) return;

    if (prev && !prev._vioraBound) {
      prev._vioraBound = true;
      prev.addEventListener('click', () => this._scrollCarouselBy(-1));
    }
    if (next && !next._vioraBound) {
      next._vioraBound = true;
      next.addEventListener('click', () => this._scrollCarouselBy(1));
    }

    if (!track._vioraScrollBound) {
      track._vioraScrollBound = true;
      let rafId = null;
      track.addEventListener('scroll', () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          rafId = null;
          this._handleSeamlessWrap();
          this._updateCarouselNav();
        });
      }, { passive: true });
    }

    // Pause on hover
    if (wrapper && !wrapper._vioraHoverBound) {
      wrapper._vioraHoverBound = true;
      wrapper.addEventListener('mouseenter', () => { this._carouselPaused = true; });
      wrapper.addEventListener('mouseleave', () => { this._carouselPaused = false; });
    }

    // Pause on touch
    if (!track._vioraTouchBound) {
      track._vioraTouchBound = true;
      track.addEventListener('touchstart', () => { this._carouselPaused = true; }, { passive: true });
      track.addEventListener('touchend', () => {
        setTimeout(() => { this._carouselPaused = false; }, 2500);
      }, { passive: true });
    }

    // Pause when off-screen
    if (typeof IntersectionObserver !== 'undefined' && !track._vioraIOBound) {
      track._vioraIOBound = true;
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { this._carouselVisible = e.isIntersecting && !document.hidden; });
      }, { threshold: 0.1 });
      io.observe(track);
      track._vioraIO = io;
    }

    // Pause when tab hidden
    if (!track._vioraVisibilityBound) {
      track._vioraVisibilityBound = true;
      document.addEventListener('visibilitychange', () => {
        this._carouselVisible = !document.hidden;
      });
    }
  },

  /* If we scrolled into the duplicate set, jump back by one set-width
     (only for the *next* user interaction — the autoplay handles this
     internally in a smoother way). */
  _handleSeamlessWrap() {
    const track = document.getElementById('carouselTrack');
    if (!track) return;
    const half = this._halfWidth();
    if (!half) return;
    // If we've scrolled past the first set, silently jump back
    if (track.scrollLeft >= half) {
      const prevBehavior = track.style.scrollBehavior;
      track.style.scrollBehavior = 'auto';
      track.scrollLeft = track.scrollLeft - half;
      track.style.scrollBehavior = prevBehavior || '';
    } else if (track.scrollLeft < 0) {
      track.scrollLeft += half;
    }
  },

  _startCarouselAutoplay() {
    this._stopCarouselAutoplay();
    this._carouselPaused = false;
    this._carouselVisible = true;

    const advance = () => {
      if (this._carouselPaused || this._carouselVisible === false || document.hidden) return;
      const track = document.getElementById('carouselTrack');
      if (!track) return;
      const step = this._cardStep();
      if (!step) return;
      const half = this._halfWidth();
      if (!half) return;

      // If we're within the last card of the original set, step to first clone.
      const currentIdx = Math.round(track.scrollLeft / step);
      const n = this._originalCount();
      const nextIdx = currentIdx + 1;

      // Smoothly scroll one card forward
      track.scrollTo({ left: nextIdx * step, behavior: 'smooth' });

      // After the smooth scroll settles, if we passed into the clone zone,
      // silently snap back by one full set so the loop is invisible.
      setTimeout(() => {
        if (track.scrollLeft >= half) {
          const saved = track.style.scrollBehavior;
          track.style.scrollBehavior = 'auto';
          track.scrollLeft = track.scrollLeft - half;
          track.style.scrollBehavior = saved || '';
        }
        this._updateCarouselNav();
      }, 550);
    };

    this._carouselInterval = setInterval(advance, 4000);
  },

  _stopCarouselAutoplay() {
    if (this._carouselInterval) {
      clearInterval(this._carouselInterval);
      this._carouselInterval = null;
    }
  },

  /* ═══════════════════════════════════════════════════════════
     CART
     ═══════════════════════════════════════════════════════════ */
  addToCart(productId, silent = false) {
    const p = this.products.find(x => x.id === productId);
    if (!p) { this.toast('Product not found.', 'error'); return; }
    if (this.isCustomProduct(p)) {
      this.openQuoteModal(productId);
      return;
    }
    const existing = this.cart.find(x => x.id === productId);
    if (existing) {
      existing.qty = (existing.qty || 1) + 1;
      if (!silent) this.toast(`${p.name} quantity increased.`, 'success');
    } else {
      this.cart.push({
        id: p.id, name: p.name, price: p.price || 0,
        plan: 'monthly', qty: 1,
        icon: p.icon || 'fa-solid fa-cube',
        image: p.image || null,
        category: p.category
      });
      if (!silent) this.toast(`${p.name} added to cart.`, 'success');
    }
    this.renderCart();
  },
  updateQty(productId, delta) {
    const item = this.cart.find(x => x.id === productId);
    if (!item) return;
    item.qty = Math.max(1, (item.qty || 1) + delta);
    this.renderCart();
  },
  removeFromCart(productId) {
    this.cart = this.cart.filter(x => x.id !== productId);
    this.renderCart();
    this.toast('Item removed.', 'info');
  },
  cartTotalUSD() {
    return this.cart.reduce((s, x) => s + (x.price || 0) * (x.qty || 1), 0);
  },
  cartTotalKes() {
    return usdToKes(this.cartTotalUSD());
  },

  renderCart() {
    const body = document.getElementById('cartBody');
    const badge = document.getElementById('cartBadge');
    const totalEl = document.getElementById('cartTotal');
    const checkoutBtn = document.getElementById('cartCheckoutBtn');
    if (!body) return;
    const count = this.cart.reduce((s, x) => s + (x.qty || 1), 0);
    if (badge) {
      if (count > 0) { badge.textContent = count; badge.style.display = 'flex'; }
      else badge.style.display = 'none';
    }
    if (!this.cart.length) {
      body.innerHTML = `<div class="cart-empty"><i class="fa-solid fa-bag-shopping"></i><p>Your cart is empty.</p><button class="btn-ghost" onclick="App.toggleCart(); App.scrollToSection('products')">Browse Products</button></div>`;
      if (totalEl) totalEl.textContent = fmtKShFromKes(0);
      if (checkoutBtn) checkoutBtn.disabled = true;
      return;
    }
    body.innerHTML = this.cart.map(item => `
      <div class="cart-item">
        <div class="ci-visual">
          ${item.image
            ? `<img src="${this.escape(item.image)}" alt="${this.escape(item.name)}" onerror="this.onerror=null;this.parentElement.innerHTML='<i class=\\'${item.icon}\\'></i>';" />`
            : `<i class="${item.icon}"></i>`}
        </div>
        <div class="ci-info">
          <div class="ci-title">${this.escape(item.name)}</div>
          <div class="ci-sub">${this.escape(item.category || '')}</div>
          <div class="qty-row">
            <button class="qty-btn" onclick="App.updateQty('${item.id}', -1)" aria-label="Decrease quantity"><i class="fa-solid fa-minus"></i></button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" onclick="App.updateQty('${item.id}', 1)" aria-label="Increase quantity"><i class="fa-solid fa-plus"></i></button>
          </div>
        </div>
        <div class="ci-price-col">
          <div class="ci-price">${fmtKSh(item.price * item.qty)}</div>
          <button class="ci-remove" onclick="App.removeFromCart('${item.id}')" aria-label="Remove item"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `).join('');
    if (totalEl) totalEl.textContent = fmtKSh(this.cartTotalUSD());
    if (checkoutBtn) checkoutBtn.disabled = false;
  },

  /* ═══════════════════════════════════════════════════════════
     PROMO ENGINE
     ═══════════════════════════════════════════════════════════ */
  validatePromo(code) {
    const clean = String(code || '').trim().toUpperCase();
    if (!clean) return null;
    const promo = PROMO_CACHE && PROMO_CACHE[clean];
    const builtIns = { 'VIORA10': { percent: 10 }, 'LAUNCH15': { percent: 15 }, 'KES5': { percent: 5 } };
    const p = promo || builtIns[clean];
    if (!p) return null;
    if (p.active === false) return null;
    if (p.expiresAt && new Date(p.expiresAt) < new Date()) return null;
    if (p.maxUses && p.usedCount && p.usedCount >= p.maxUses) return null;
    return { code: clean, ...p };
  },

  applyPromo(code) {
    const promo = this.validatePromo(code);
    if (promo) {
      this.currentPromo = promo;
      this.toast(`Promo ${promo.code} applied${promo.percent ? ': ' + promo.percent + '% off' : ''}.`, 'success');
    } else {
      this.currentPromo = null;
      if (String(code || '').trim()) this.toast('Invalid or expired promo code.', 'warning');
    }
    this.updateSummaryPricing();
  },

  computeDiscountKes(subtotalKes) {
    if (!this.currentPromo) return 0;
    const p = this.currentPromo;
    let disc = 0;
    if (p.percent) disc += Math.round(subtotalKes * (p.percent / 100));
    if (p.flatKes) disc += Number(p.flatKes) || 0;
    if (p.minSpendKes && subtotalKes < p.minSpendKes) return 0;
    return Math.min(disc, subtotalKes);
  },

  /* ═══════════════════════════════════════════════════════════
     CHECKOUT + PURCHASE
     ═══════════════════════════════════════════════════════════ */
  openCheckout() {
    if (!this.cart.length) { this.toast('Your cart is empty.', 'warning'); return; }
    this.toggleCart();
    document.getElementById('purchaseMode').value = 'cart';
    document.getElementById('purchaseProductId').value = 'cart';
    document.getElementById('purchaseProductName').value = 'Cart Purchase';
    document.getElementById('purchaseProductDisplay').value = `${this.cart.length} item(s)`;
    document.getElementById('planField').style.display = 'none';
    document.getElementById('purchaseModalTitle').textContent = 'Complete Your Purchase';
    this.updateSummaryPricing();
    this.openModal('purchaseModal');
  },

  updateSummaryPricing() {
    const box = document.getElementById('orderSummaryBox');
    const items = document.getElementById('orderSummaryItems');
    const total = document.getElementById('orderSummaryTotal');
    const mode = document.getElementById('purchaseMode')?.value || 'single';
    if (!box) return;
    if (mode === 'cart' && !this.cart.length) { box.style.display = 'none'; return; }
    box.style.display = 'block';

    if (mode === 'cart') {
      items.innerHTML = this.cart.map(x => `
        <div class="summary-line"><span>${this.escape(x.name)} × ${x.qty}</span><span class="accent">${fmtKSh(x.price * x.qty)}</span></div>
      `).join('');
      const subtotalKes = this.cartTotalKes();
      const discount = this.computeDiscountKes(subtotalKes);
      const totalKes = subtotalKes - discount;
      total.innerHTML = `
        <div class="summary-line"><span>Subtotal</span><span>${fmtKShFromKes(subtotalKes)}</span></div>
        ${discount > 0 ? `<div class="summary-line success"><span>Discount (${this.currentPromo.code})</span><span>− ${fmtKShFromKes(discount)}</span></div>` : ''}
        <div class="summary-line total"><span>Total</span><span class="accent">${fmtKShFromKes(totalKes)}</span></div>
      `;
    } else {
      const productId = document.getElementById('purchaseProductId').value;
      const plan = document.getElementById('purchasePlan').value;
      const product = this.products.find(x => x.id === productId);
      const baseKes = usdToKes(product?.price || 0);
      const priceMap = { monthly: baseKes, yearly: baseKes * 10.2, lifetime: baseKes * 26.5 };
      const kes = Math.round(priceMap[plan] || baseKes);
      const discount = this.computeDiscountKes(kes);
      const finalKes = kes - discount;
      items.innerHTML = `<div class="summary-line"><span>${this.escape(document.getElementById('purchaseProductName').value || 'Product')}</span><span class="accent">${fmtKShFromKes(kes)}</span></div>`;
      total.innerHTML = `
        <div class="summary-line"><span>Subtotal</span><span>${fmtKShFromKes(kes)}</span></div>
        ${discount > 0 ? `<div class="summary-line success"><span>Discount (${this.currentPromo.code})</span><span>− ${fmtKShFromKes(discount)}</span></div>` : ''}
        <div class="summary-line total"><span>Total</span><span class="accent">${fmtKShFromKes(finalKes)}</span></div>
      `;
    }
  },

   openPurchaseModal(productId) {
    const p = this.products.find(x => x.id === productId);
    if (!p) { this.toast('Product not found.', 'error'); return; }
    if (this.isCustomProduct(p)) { this.openQuoteModal(productId); return; }
    return openOrderModal({ productId, app: this });
  },

  async checkStockForLines(orderLines) {
    if (!firebaseReady || !db) return { ok: true };
    const inventorySnap = await db.ref(P('inventory')).once('value');
    const inventory = inventorySnap.val() || {};
    for (const line of orderLines) {
      if (!line.productId) continue;
      const mirrorId = 'prod-' + line.productId;
      let row = inventory[mirrorId];
      if (!row) {
        const sku = String(line.productId).toUpperCase();
        const match = Object.values(inventory).find(v =>
          String(v.sku || '').toUpperCase() === sku || v._productId === line.productId
        );
        row = match;
      }
      if (!row) continue;
      const have = Number(row.qty || 0);
      const want = Number(line.qty || 1);
      if (have < want) {
        return { ok: false, reason: `"${line.productName}" is out of stock (${have} left).` };
      }
    }
    return { ok: true };
  },

  async submitPurchase(e) {
    e.preventDefault();
    clearTimeout(this._thanksTimer);
    const btn = document.getElementById('purchaseSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing…';

    const mode = document.getElementById('purchaseMode').value;
    const name = document.getElementById('purchaseName').value.trim();
    const email = document.getElementById('purchaseEmail').value.trim();
    const phone = document.getElementById('purchasePhone').value.trim();
    const method = document.getElementById('purchaseMethod').value;

    if (!name || !email || !phone) {
      this.toast('Name, email, and phone are required.', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-lock"></i> Complete Purchase';
      return;
    }

    let orderLines = [];
    let subtotalUSD = 0;

    if (mode === 'cart') {
      orderLines = this.cart.map(x => ({
        productId: x.id, productName: x.name,
        plan: x.plan || 'monthly',
        amount: x.price * x.qty,
        qty: Number(x.qty) || 1,
        licenseKey: this.generateLicenseKey()
      }));
      subtotalUSD = this.cartTotalUSD();
    } else {
      const productId = document.getElementById('purchaseProductId').value;
      const productName = document.getElementById('purchaseProductName').value;
      const plan = document.getElementById('purchasePlan').value;
      const product = this.products.find(x => x.id === productId);
      if (!product) {
        this.toast('Product no longer available. Please refresh.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-lock"></i> Complete Purchase';
        return;
      }
      const baseKes = usdToKes(product.price || 0);
      const priceMapKes = { monthly: baseKes, yearly: baseKes * 10.2, lifetime: baseKes * 26.5 };
      const kes = Math.round(priceMapKes[plan] || baseKes);
      subtotalUSD = kes / CURRENCY.rate;
      orderLines = [{
        productId, productName, plan,
        amount: subtotalUSD, qty: 1,
        licenseKey: this.generateLicenseKey()
      }];
    }

    if (!orderLines.length) {
      this.toast('No products selected.', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-lock"></i> Complete Purchase';
      return;
    }

    try {
      const stock = await this.checkStockForLines(orderLines);
      if (!stock.ok) {
        this.toast(`Sorry — ${stock.reason}`, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-lock"></i> Complete Purchase';
        return;
      }
    } catch (e) {
      console.warn('[Viora Market] stock check failed; allowing order', e);
    }

    const subtotalKes = usdToKes(subtotalUSD);
    const discountKes = this.computeDiscountKes(subtotalKes);
    const totalKES = subtotalKes - discountKes;
    const totalUSD = totalKES / CURRENCY.rate;
    const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
    const allKeys = orderLines.map(l => l.licenseKey).join(', ');
    const paymentAccepted = false;
    const paymentStatus = 'pending';

    let leadResult = { isNew: true };
    try {
      leadResult = await this.captureLead('attempted', { name, email, phone }, orderLines);
    } catch (e) {
      console.warn('Lead capture failed:', e);
    }

    const order = {
      id: orderId, items: orderLines,
      subtotalUSD, subtotalKes,
      discountKes, discountPercent: this.currentPromo?.percent || 0,
      promoCode: this.currentPromo ? this.currentPromo.code : null,
      totalUSD, totalKES,
      currency: 'KES', displayCurrency: 'KES',
      customerName: name, customerEmail: email, customerPhone: phone,
      paymentMethod: method, paymentStatus, paymentAccepted,
      licenseKeys: allKeys,
      timestamp: new Date().toISOString(),
      isNewClient: leadResult.isNew,
      leadId: leadResult.leadKey || null,
      source: 'marketplace',
      status: 'new'
    };

    try {
      if (firebaseReady && db) {
        await db.ref(P('orders') + '/' + orderId).set(order);
        if (typeof window.vioraNotify === 'function') await window.vioraNotify({ eventId: orderId, title: 'Marketplace: new order received', body: 'A new marketplace order was placed. Payment status: ' + (paymentAccepted ? 'accepted' : 'pending review') + '.', level: 'warning', icon: 'fa-cart-shopping', source: 'marketplace-order', url: '/main.html#marketplace-orders' });
      }

      document.getElementById('licenseKeyDisplay').textContent = allKeys || '—';
      document.getElementById('orderDetailGrid').innerHTML = `
        <div class="order-detail-row"><span class="odl">Order ID</span><span class="odv">${orderId}</span></div>
        <div class="order-detail-row"><span class="odl">Items</span><span class="odv">${orderLines.length}</span></div>
        ${discountKes > 0 ? `<div class="order-detail-row"><span class="odl">Discount</span><span class="odv" style="color:var(--success);">− ${fmtKShFromKes(discountKes)} (${this.currentPromo.code})</span></div>` : ''}
        <div class="order-detail-row"><span class="odl">Total</span><span class="odv accent">${fmtKShFromKes(totalKES)}</span></div>
        <div class="order-detail-row"><span class="odl">Payment</span><span class="odv">${method}</span></div>
        <div class="order-detail-row"><span class="odl">Status</span><span class="odv">${paymentAccepted ? '✓ Paid' : '⏳ Pending review'}</span></div>
        <div class="order-detail-row"><span class="odl">Client</span><span class="odv">${leadResult.isNew ? '🆕 New client' : '✅ Existing client'}</span></div>
      `;

      const thanksPhoneEl = document.getElementById('thanksPhone');
      const thanksEmailEl = document.getElementById('thanksEmail');
      const thanksOrderEl = document.getElementById('thanksOrderId');
      const thanksSummary = document.getElementById('thanksSummary');
      const thanksWa = document.getElementById('thanksWhatsApp');

      if (thanksPhoneEl) thanksPhoneEl.textContent = phone;
      if (thanksEmailEl) thanksEmailEl.textContent = email;
      if (thanksOrderEl) thanksOrderEl.textContent = orderId;
      if (thanksSummary) thanksSummary.textContent = `${orderLines.length} item${orderLines.length > 1 ? 's' : ''} · ${fmtKShFromKes(totalKES)}`;

      if (thanksWa) {
        const supportNumber = '254713428774'; // Verified VIORA WhatsApp Business line.
        const waMessage = encodeURIComponent(`Hi Viora, I just placed order ${orderId} (${fmtKShFromKes(totalKES)}). Please help me complete the payment.`);
        thanksWa.href = `https://wa.me/${supportNumber}?text=${waMessage}`;
      }

      this.closeModal('purchaseModal');
      this.openModal('thankYouModal');

      clearTimeout(this._thanksTimer);
      this._thanksTimer = setTimeout(() => {
        const modal = document.getElementById('thankYouModal');
        if (modal && modal.classList.contains('active')) {
          this.closeModal('thankYouModal');
          this.resetPurchaseForm();
        }
      }, 5000);

      this.orders.unshift(order);
      this.saveOrderHistory();
      this.cart = [];
      this.currentPromo = null;
      this.renderCart();

      this.toast(`Thank you, ${name.split(' ')[0]}! Your order is in. Viora support will be in touch shortly.`, 'success');
    } catch (err) {
      console.error('[Viora Market] Purchase error:', err);
      this.toast('Something went wrong: ' + (err.message || 'Network error'), 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-lock"></i> Complete Purchase';
    }
  },

  generateLicenseKey() {
    return 'VIORA-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  },

  resetPurchaseForm() {
    document.getElementById('purchaseForm')?.reset();
    document.getElementById('purchaseProductId').value = '';
    document.getElementById('purchaseProductName').value = '';
    const box = document.getElementById('orderSummaryBox');
    if (box) box.style.display = 'none';
    const pf = document.getElementById('planField');
    if (pf) pf.style.display = 'block';
    this.currentPromo = null;
  },

    _nextLeadStatus(current, intent) {
    const rank = { interested: 1, quote: 2, reviewer: 3, customer: 4 };
    const wanted =
      intent === 'paid'    ? 'customer' :
      intent === 'quote'   ? 'quote'    :
      intent === 'review'  ? 'reviewer' :
                             'interested';
    const a = rank[current] || 0;
    const b = rank[wanted]  || 0;
    return b > a ? wanted : (current || wanted);
  },

  async captureLead(intent, credentials, cartLines, extra) {
    if (!firebaseReady || !db) return { isNew: true };
    const { name, email, phone } = credentials;
    const emailKey = String(email).toLowerCase().replace(/[^a-z0-9]/g, '_');
    const phoneNorm = String(phone).replace(/[^0-9]/g, '');
    try {
      const leadsRef = db.ref(P('marketLeads'));
      const allSnap = await leadsRef.once('value');
      const all = allSnap.val() || {};
      let existingKey = null, existingData = null;
      for (const [key, lead] of Object.entries(all)) {
        const lEmail = String(lead.email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
        const lPhone = String(lead.phone || '').replace(/[^0-9]/g, '');
        if ((lEmail && lEmail === emailKey) || (lPhone && lPhone === phoneNorm)) {
          existingKey = key; existingData = lead; break;
        }
      }
      const isNew = !existingKey;
      const leadKey = existingKey || emailKey + '_' + Date.now().toString(36);
      const now = new Date().toISOString();
      const intentLine = cartLines.map(l => l.productName).join(' + ');
      const totalKes = cartLines.reduce((s, l) => s + usdToKes(l.amount), 0);
      const entry = {
        id: leadKey,
        name: String(name || '').trim(),
        email: String(email || '').trim(),
        phone: String(phone || '').trim(),
        phoneNormalized: phoneNorm,
        lastProductId: cartLines[0]?.productId || null,
        lastProductName: intentLine,
        products: cartLines.map(l => ({ id: l.productId, name: l.productName, plan: l.plan, amount: l.amount })),
        lastAmountKES: totalKes,
        lastAmountUSD: cartLines.reduce((s, l) => s + Number(l.amount || 0), 0),
        intent,
               status: this._nextLeadStatus(existingData?.status, intent),
        totalReviews: (existingData?.totalReviews || 0) + (intent === 'review' ? 1 : 0),
        lastReviewAt: intent === 'review' ? now : (existingData?.lastReviewAt || null),
        isNewClient: isNew,
        firstSeenAt: existingData?.firstSeenAt || now,
        lastSeenAt: now,
        totalAttempts: (existingData?.totalAttempts || 0) + 1,
        totalPurchases: (existingData?.totalPurchases || 0) + (intent === 'paid' ? 1 : 0),
        lifetimeValueKES: (existingData?.lifetimeValueKES || 0) + (intent === 'paid' ? totalKes : 0),
        lifetimeValueUSD: (existingData?.lifetimeValueUSD || 0) + (intent === 'paid' ? cartLines.reduce((s, l) => s + Number(l.amount || 0), 0) : 0),
        ...(extra || {})
      };
      await leadsRef.child(leadKey).set(entry);
      return { isNew, leadKey };
    } catch (e) {
      console.warn('[Market] Lead capture failed:', e);
      return { isNew: true, error: e.message };
    }
  },

  /* ═══════════════════════════════════════════════════════════
     ORDER HISTORY
     ═══════════════════════════════════════════════════════════ */
  saveOrderHistory() {
    try { localStorage.setItem('viora_market_orders', JSON.stringify(this.orders.slice(0, 20))); } catch (e) {}
  },
  loadOrderHistory() {
    try {
      const raw = localStorage.getItem('viora_market_orders');
      if (raw) this.orders = JSON.parse(raw) || [];
    } catch (e) { this.orders = []; }
  },
  openHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    if (!this.orders.length) {
      list.innerHTML = `<div class="cart-empty"><i class="fa-solid fa-clock-rotate-left"></i><p>No purchases yet.</p></div>`;
    } else {
      list.innerHTML = this.orders.map(o => `
        <div class="history-card">
          <div class="history-head">
            <strong>${o.id}</strong>
            <span class="accent">${fmtKShFromKes(o.totalKES || 0)}</span>
          </div>
          <div class="history-meta">${new Date(o.timestamp).toLocaleString()}</div>
          <div class="history-items">${(o.items || []).map(i => i.productName).join(', ')}</div>
          <div class="history-keys">${o.licenseKeys || ''}</div>
          <div class="history-status">Status: ${o.paymentAccepted === false ? '⏳ Pending' : '✓ ' + (o.paymentStatus || 'Paid')}</div>
        </div>
      `).join('');
    }
    this.openModal('historyModal');
  },

  /* ═══════════════════════════════════════════════════════════
     TRACK ORDER / QUOTE
     ═══════════════════════════════════════════════════════════ */
  openTrack() { this.openModal('trackModal'); },

  async lookupTrack(e) {
    if (e) e.preventDefault();
    const q = (document.getElementById('trackQuery')?.value || '').trim();
    const host = document.getElementById('trackResults');
    if (!host) return;
    if (!q) { host.innerHTML = ''; return; }
    host.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Searching…</div>';

    try {
      let found = null, kind = null;

      if (firebaseReady && db) {
        const snap = await db.ref(P('orders') + '/' + q.toUpperCase()).once('value');
        if (snap.exists()) { found = snap.val(); kind = found.kind === 'quote' ? 'quote' : 'order'; }
        if (!found) {
          const allSnap = await db.ref(P('orders')).once('value');
          const all = allSnap.val() || {};
          const matches = Object.values(all).filter(o =>
            String(o.customerEmail || '').toLowerCase() === q.toLowerCase() ||
            String(o.customerPhone || '').replace(/\D/g, '') === q.replace(/\D/g, '')
          );
          if (matches.length) { found = matches.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]; kind = found.kind === 'quote' ? 'quote' : 'order'; }
        }
      }

      if (!found && this.orders.length) {
        const local = this.orders.find(o => o.id === q.toUpperCase()) ||
          this.orders.find(o => String(o.customerEmail || '').toLowerCase() === q.toLowerCase());
        if (local) { found = local; kind = 'order'; }
      }

      if (!found) {
        host.innerHTML = `<div class="cart-empty" style="padding:2rem 1rem;"><i class="fa-solid fa-magnifying-glass"></i><p>No order or quote found for "${this.escape(q)}".</p></div>`;
        return;
      }

      const steps = kind === 'quote'
        ? ['Quote Received', 'Under Review', 'Quoted Sent', 'Approved', 'Build Started']
        : ['Order Placed', 'Payment Confirmed', 'License Issued', 'Delivered'];
      let currentStep = 0;
      if (kind === 'quote') {
        if (found.status === 'reviewing') currentStep = 1;
        else if (found.status === 'quoted') currentStep = 2;
        else if (found.status === 'approved') currentStep = 3;
        else if (found.status === 'building') currentStep = 4;
      } else {
        if (found.paymentAccepted) currentStep = 1;
        if (found.delivered) currentStep = 2;
        if (found.delivered && found.downloadLinks) currentStep = 3;
      }

      host.innerHTML = `
        <div class="history-card">
          <div class="history-head">
            <strong>${this.escape(found.id)}</strong>
            <span class="accent">${kind === 'quote' ? 'Quote Request' : fmtKShFromKes(found.totalKES || 0)}</span>
          </div>
          <div class="history-meta">${new Date(found.timestamp).toLocaleString()}</div>
          <div class="history-items">${(found.items || []).map(i => i.productName).join(', ') || '—'}</div>
        </div>
        <div class="track-timeline">
          ${steps.map((s, i) => `
            <div class="track-step ${i < currentStep ? 'done' : i === currentStep ? 'current' : ''}">
              <div class="track-step-title">${this.escape(s)}</div>
              ${i === 0 ? `<div class="track-step-date">${new Date(found.timestamp).toLocaleString()}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      console.error(e);
      host.innerHTML = `<div class="cart-empty" style="padding:2rem 1rem;"><i class="fa-solid fa-triangle-exclamation"></i><p>Something went wrong. Please try again.</p></div>`;
    }
  },

  /* ═══════════════════════════════════════════════════════════
     WISHLIST
     ═══════════════════════════════════════════════════════════ */
  loadWishlist() {
    try {
      const raw = localStorage.getItem('viora_market_wishlist');
      if (raw) this.wishlist = JSON.parse(raw) || [];
    } catch (e) { this.wishlist = []; }
    this.renderWishlistBadge();
  },
  saveWishlist() {
    try { localStorage.setItem('viora_market_wishlist', JSON.stringify(this.wishlist)); } catch (e) {}
    this.renderWishlistBadge();
  },
  toggleWishlist(productId) {
    const p = this.products.find(x => x.id === productId);
    if (!p) return;
    const idx = this.wishlist.indexOf(productId);
    if (idx > -1) { this.wishlist.splice(idx, 1); this.toast(`${p.name} removed from wishlist.`, 'info'); }
    else { this.wishlist.push(productId); this.toast(`${p.name} added to wishlist.`, 'success'); }
    this.saveWishlist();
    this.renderProducts();
    this.renderCarousel();
  },
  renderWishlistBadge() {
    const b = document.getElementById('wishlistBadge');
    if (!b) return;
    if (this.wishlist.length > 0) { b.textContent = this.wishlist.length; b.style.display = 'flex'; }
    else b.style.display = 'none';
  },
  openWishlist() {
    const list = document.getElementById('wishlistList');
    if (!list) return;
    const items = this.wishlist.map(id => this.products.find(p => p.id === id)).filter(Boolean);
    if (!items.length) {
      list.innerHTML = `<div class="cart-empty"><i class="fa-solid fa-heart"></i><p>Your wishlist is empty.</p></div>`;
    } else {
      list.innerHTML = items.map(p => {
        const isCustom = this.isCustomProduct(p);
        return `
        <div class="cart-item">
          <div class="ci-visual">
            ${p.image ? `<img src="${this.escape(p.image)}" alt="${this.escape(p.name)}" />` : `<i class="${p.icon || 'fa-solid fa-cube'}"></i>`}
          </div>
          <div class="ci-info">
            <div class="ci-title">${this.escape(p.name)}</div>
            <div class="ci-sub">${this.escape(p.category || '')}</div>
          </div>
          <div class="ci-price-col">
            <div class="ci-price">${isCustom ? 'Custom' : fmtKSh(p.price || 0)}</div>
            <div style="display:flex;gap:.4rem;margin-top:.4rem;">
              ${isCustom
                ? `<button class="qty-btn" onclick="App.openQuoteModal('${p.id}')" title="Get quote"><i class="fa-solid fa-comments-dollar"></i></button>`
                : `<button class="qty-btn" onclick="App.addToCart('${p.id}')" title="Add to cart"><i class="fa-solid fa-cart-plus"></i></button>`}
              <button class="qty-btn" onclick="App.toggleWishlist('${p.id}'); App.openWishlist();" title="Remove"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
        </div>
      `;
      }).join('');
    }
    this.openModal('wishlistModal');
  },

  /* ═══════════════════════════════════════════════════════════
     SEARCH + AUTOCOMPLETE
     ═══════════════════════════════════════════════════════════ */
  onSearch(val) {
    this.searchTerm = (val || '').toLowerCase().trim();
    this.renderProducts();
    this.renderSearchSuggestions(val);
    if (this.searchTerm) this.saveRecentSearch(this.searchTerm);
  },
  renderSearchSuggestions(val) {
    const host = document.getElementById('searchSuggestions');
    if (!host) return;
    const q = String(val || '').toLowerCase().trim();
    if (!q) { host.style.display = 'none'; return; }

    const matches = this.products.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.tags || []).some(t => String(t).toLowerCase().includes(q))
    ).slice(0, 6);

    const recents = this._recentSearches.slice(0, 3).filter(r => r !== q);
    let html = '';
    if (matches.length) {
      html += matches.map(p => `
        <div class="ss-item" onclick="App.selectSearchSuggestion('${this.escape(p.name)}')">
          <i class="fa-solid fa-magnifying-glass"></i>
          <span>${this.escape(p.name)}</span>
          <span class="ss-meta">${this.escape(p.category || '')}</span>
        </div>`).join('');
    } else {
      html += `<div class="ss-empty">No matching products</div>`;
    }
    if (recents.length) {
      html += `<div style="padding:.6rem 1.1rem .3rem;font-size:.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;">Recent</div>`;
      html += recents.map(r => `
        <div class="ss-item" onclick="App.selectSearchSuggestion('${this.escape(r)}')">
          <i class="fa-solid fa-clock-rotate-left"></i>
          <span>${this.escape(r)}</span>
        </div>`).join('');
    }
    host.innerHTML = html;
    host.style.display = 'block';
  },
  selectSearchSuggestion(val) {
    const input = document.getElementById('searchInput');
    if (input) input.value = val;
    document.getElementById('searchSuggestions').style.display = 'none';
    this.onSearch(val);
  },
  saveRecentSearch(q) {
    if (!q || q.length < 2) return;
    this._recentSearches = [q, ...this._recentSearches.filter(x => x !== q)].slice(0, 8);
    try { localStorage.setItem('viora_market_recent_searches', JSON.stringify(this._recentSearches)); } catch (e) {}
  },
  loadRecentSearches() {
    try {
      const raw = localStorage.getItem('viora_market_recent_searches');
      if (raw) this._recentSearches = JSON.parse(raw) || [];
    } catch (e) { this._recentSearches = []; }
  },

  onSort(mode) {
    this.sortMode = mode;
    this.renderProducts();
  },
  onPriceFilter(mode) {
    this.priceFilter = mode;
    this.renderProducts();
  },

  subscribeNewsletter(e) {
    e.preventDefault();
    const email = document.getElementById('newsletterEmail').value.trim();
    if (!email) return;
    this.toast(`Subscribed! We'll notify you at ${email}.`, 'success');
    e.target.reset();
  },

  animateCounter(el, target) {
    if (!el) return;
    const duration = 1400;
    const start = performance.now();
    const finalTarget = Number(target) || 0;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(finalTarget * eased).toLocaleString('en-KE');
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  /* ═══════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════ */
  async init() {
    const cy = document.getElementById('currentYear');
    if (cy) cy.textContent = new Date().getFullYear();

    this.loadOrderHistory();
    this.loadWishlist();
    this.loadRecentSearches();

    // Paint the last known public catalogue immediately while Firebase refreshes.
    try {
      const cached = JSON.parse(localStorage.getItem(PRODUCT_CACHE_KEY) || 'null');
      if (cached && Array.isArray(cached.products) &&
          Date.now() - Number(cached.savedAt || 0) < PRODUCT_CACHE_MAX_AGE) {
        this.products = cached.products;
        this.renderCategoryBar();
        this.renderProducts();
        this.renderCarousel();
      }
    } catch (cacheError) {
      try { localStorage.removeItem(PRODUCT_CACHE_KEY); } catch (_) {}
    }

    document.getElementById('cartToggle')?.addEventListener('click', () => this.toggleCart());
    document.getElementById('wishlistToggle')?.addEventListener('click', () => this.openWishlist());
    document.getElementById('mobileToggle')?.addEventListener('click', () => {
      document.getElementById('navLinks')?.classList.toggle('open');
    });

    document.getElementById('purchaseForm')?.addEventListener('submit', e => this.submitPurchase(e));
    document.getElementById('quoteForm')?.addEventListener('submit', e => this.submitQuote(e));
       document.getElementById('purchasePlan')?.addEventListener('change', () => this.updateSummaryPricing());

    const catInput = document.getElementById('catSearchInput');
    if (catInput) {
      catInput._vBound = true;
      let catT;
      catInput.addEventListener('input', (e) => {
        clearTimeout(catT);
        catT = setTimeout(() => {
          this._catSearch = e.target.value;
          this._catExpanded = false;
          this.renderCategoryBar();
        }, 180);
      });
    }

    document.querySelectorAll('.modal-overlay').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) this.closeModal(m.id); });
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => this.closeModal(m.id));
        document.getElementById('cartDrawer')?.classList.remove('open');
        const ss = document.getElementById('searchSuggestions');
        if (ss) ss.style.display = 'none';
      }
    });

    document.addEventListener('click', e => {
      const ss = document.getElementById('searchSuggestions');
      const wrap = e.target.closest('.search-wrap');
      if (ss && !wrap) ss.style.display = 'none';
    });

    window.addEventListener('scroll', () => {
      const nav = document.getElementById('mainNav');
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 30);
      const sections = ['home', 'products', 'carousel-section', 'case-studies', 'how', 'testimonials', 'faq'];
      let current = 'home';
      sections.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < 200) current = id;
      });
      document.querySelectorAll('.mobile-bottom-nav .mn-item').forEach(b => {
        if (b.dataset.target !== 'cart') b.classList.toggle('active', b.dataset.target === current);
      });
    });

    this.renderCart();
    this.renderWishlistBadge();
    this.watchContent();
    this.watchProducts();
    this.watchInventory();
    this.watchProductExtras();
    this.watchPromos();
    this.watchIndustries();

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && firebaseReady && db) {
        db.ref(P('marketContent')).once('value').then(s => {
          const data = s.exists() ? s.val() : {};
          this.content = data;
          this.applyContent({ ...DEFAULTS, ...data });
          this.applyClientsite(this.clientsite || {});
        }).catch(() => {});
      }
    });

    console.log('%c✅ Viora Marketplace ready', 'color:#00e0ff;font-weight:700;font-size:13px;');
  }
};

window.App = App;
function refreshLocalCurrencyLabels(){
  const fx=window.VioraCurrency;if(!fx)return;
  const state=fx.state||{},note=document.getElementById('currencyNote');
  if(note)note.innerHTML='<i class="fa-solid fa-coins"></i> Prices shown in '+String(state.currency||'USD')+' using daily reference rates · Checkout records remain in KES';
  const select=document.getElementById('priceFilter');
  if(select){[['under-2k','Under '+fx.format(2000,'KES')],['2k-5k',fx.format(2000,'KES')+' – '+fx.format(5000,'KES')],['5k-10k',fx.format(5000,'KES')+' – '+fx.format(10000,'KES')],['over-10k','Over '+fx.format(10000,'KES')]].forEach(([value,label])=>{const option=select.querySelector('option[value="'+value+'"]');if(option)option.textContent=label;});}
  const budget=document.getElementById('quoteBudget');
  if(budget){[['under-20k','Under '+fx.format(20000,'KES')],['20k-50k',fx.format(20000,'KES')+' – '+fx.format(50000,'KES')],['50k-150k',fx.format(50000,'KES')+' – '+fx.format(150000,'KES')],['150k-500k',fx.format(150000,'KES')+' – '+fx.format(500000,'KES')],['over-500k','Over '+fx.format(500000,'KES')]].forEach(([value,label])=>{const option=budget.querySelector('option[value="'+value+'"]');if(option)option.textContent=label;});}
  const budgetLabel=document.querySelector('label[for="quoteBudget"]');if(budgetLabel)budgetLabel.textContent='Budget Range ('+(state.currency||'USD')+' estimate) *';
  const heroSub=document.getElementById('heroSub');if(heroSub)heroSub.innerHTML='Instant access to premium software tools — prices displayed in '+String(state.currency||'USD')+' using daily reference rates.';
}
window.addEventListener('viora:currency-ready', () => {
  refreshLocalCurrencyLabels();
  try { App.renderFeatured(); App.renderProducts(); App.renderCarousel(); App.renderCart(); } catch (e) { console.warn('[market] currency refresh render skipped:', e); }
});
if(window.VioraCurrency?.state?.ready)refreshLocalCurrencyLabels();

let _appInitialized = false;
function bootMarket() {
  if (_appInitialized) return;
  _appInitialized = true;
  initOrderModal({
    firebaseConfig,
    P: (path) => `viora_data/orgs/viora/${String(path || '').replace(/^\/+|\/+$/g, '')}`,
    toast: (m, t) => App.toast(m, t),
    logActivity: (a, b, c) => { try { App.logActivity?.(a, b, c); } catch (e) {} },
  });
  App.init();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootMarket, { once: true });
} else {
  bootMarket();
}
