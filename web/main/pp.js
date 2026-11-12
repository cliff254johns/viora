/* ═══════════════════════════════════════════════════════════════
   VIORA — PRODUCT PRESENTATION (PP) EDITOR  (v7.1 — consolidated)
   Hero · Core · Banner cards · Capabilities · Comparison ·
   Steps · CTA · FAQ · Footer · Categories · Industries · Order
   ═══════════════════════════════════════════════════════════════ */

let D = {
  db: null, ref: null, set: null, onValue: null, get: null,
  P: null,
  state: null,
  toast: null, logActivity: null, escapeHtml: null, $: null,
};

export function initPP(d) {
  D = { ...D, ...d };
  PP.draft = null;
  PP.original = null;
  PP.saving = false;
  PP.panelState = {};
  PP._editingIndustryKey = null;
  PP._indSolutions = null;
  PP._indChanges = null;
  PP._indModules = null;
  PP._unsubscribe = null;
  PP._loading = false;
  PP._loadedOnce = false;
  PP._dirty = false;
  PP._renderScheduled = null;
  PP._filterScheduled = null;
  _htmlCache = new WeakMap();
  _sigCache  = new WeakMap();
  _escFn = null;
}

const ECOSYSTEM_MAP_PATH = 'marketing/ecosystemMap';

const clone = (o) => (typeof structuredClone === 'function'
  ? structuredClone(o)
  : JSON.parse(JSON.stringify(o)));
const nowIso = () => new Date().toISOString();
const uidShort = () => 'pp-' + Math.random().toString(36).slice(2, 8);

let _escFn = null;
function esc(s) {
  if (_escFn) return _escFn(s);
  const f = D.escapeHtml;
  if (typeof f === 'function') {
    _escFn = f;
    return _escFn(s);
  }
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function debounce(fn, wait) {
  let t = null;
  const wrapped = (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn.apply(null, args); }, wait);
  };
  wrapped.cancel = () => { if (t) { clearTimeout(t); t = null; } };
  return wrapped;
}

function ppWired() {
  return !!(D.db && D.ref && D.P && D.set && D.onValue);
}

let _htmlCache = new WeakMap();
function setHtmlIfChanged(el, html) {
  if (!el) return false;
  if (_htmlCache.get(el) === html) return false;
  _htmlCache.set(el, html);
  el.innerHTML = html;
  return true;
}

let _sigCache = new WeakMap();
function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function setHtmlIfSigChanged(el, sig, html) {
  if (!el) return false;
  if (_sigCache.get(el) === sig) return false;
  _sigCache.set(el, sig);
  return setHtmlIfChanged(el, html);
}

/* ═══════════════════════════════════════════════════════════════
   DEFAULTS
   ═══════════════════════════════════════════════════════════════ */
export const PP_DEFAULTS = {
  hero: { pageTitle: "VIORA Ecosystem - Integrated Enterprise Operating System", brand: "VIORA", tagline: "Explore. Discover. Belong.", heading: "VIORA Ecosystem", subheading: "The Integrated Enterprise Operating System", small: "One Platform • Multiple Portals • Infinite Possibilities", rightTagline: "Connect People,\nEmpower Businesses,\nBuild Communities." },
  core: { icon: "fa-solid fa-database", title: "REAL-TIME<br>DATABASE CORE", tags: "Secure • Scalable • Always On" },
  bannerCards: [
    { id: "business", title: "Business Portal", subtext: "List • Market • Grow", icon: "fa-solid fa-store", color: "#ff3b5c", position: "pos-top-center", features: ["Business listings","Online ads & marketing","POS system","E-commerce & delivery"] },
    { id: "public",   title: "Public Portal",   subtext: "Discover • Engage • Access", icon: "fa-solid fa-users", color: "#10b981", position: "pos-top-right", features: ["Search & discover businesses","Explore artists & creators","Access services & resources","Community engagement"] },
    { id: "partner",  title: "Partner Portal",  subtext: "Collaborate • Expand • Succeed", icon: "fa-solid fa-handshake", color: "#3b82f6", position: "pos-top-left", features: ["Partner management","Commission tracking","Joint campaigns","Resource sharing"] },
    { id: "training", title: "Training Portal", subtext: "Learn • Build • Advance", icon: "fa-solid fa-graduation-cap", color: "#8b5cf6", position: "pos-mid-left", features: ["Courses & tutorials","Webinars & workshops","Skill development","Certification"] },
    { id: "client",   title: "Client Portal",   subtext: "Manage • Track • Achieve", icon: "fa-solid fa-user-gear", color: "#f59e0b", position: "pos-mid-right", features: ["Service requests","Project tracking","Case updates","Secure communication"] },
    { id: "product",  title: "Product Portal",  subtext: "Build • Sell • Innovate", icon: "fa-solid fa-cube", color: "#06b6d4", position: "pos-bot-left", features: ["Digital products","Software solutions","Creative services","Marketplace"] },
    { id: "youtube",  title: "YouTube Hub",     subtext: "Watch • Learn • Be Inspired", icon: "fa-brands fa-youtube", color: "#ef4444", position: "pos-bot-right", features: ["Artist playlists","Educational content","Brand stories","Community videos"] }
  ],
  capabilities: { eyebrow: "Inside every portal", title: "Built-in superpowers", subtitle: "Whatever you pick, these ship with it. No plugins to buy, no consultants to call.", items: [
    { icon: "📶", title: "Offline-first", body: "Keep working through blackouts. Everything syncs the moment you're back online." },
    { icon: "📱", title: "Installable PWA", body: "Add to home screen on any Android or iPhone. Native-feel, no app store needed." },
    { icon: "💚", title: "M-Pesa Daraja integration", body: "Configurable integration; live collections require provider credentials, verified callbacks and end-to-end reconciliation tests." },
    { icon: "🧾", title: "Tax & e-invoicing integrations", body: "Tax rules and fiscalisation depend on jurisdiction; authority integrations must be configured and verified before compliance claims." },
    { icon: "🤖", title: "Groq AI engine", body: "Recommendations on pricing, stock, collections and staffing — on your live data." },
    { icon: "🔐", title: "Roles & audit logs", body: "Granular permissions, 2FA, encrypted at rest, and a full who-did-what trail." },
    { icon: "🔔", title: "SMS + WhatsApp alerts", body: "Payment reminders, approvals, low stock, renewals — pushed where people look." },
    { icon: "🗂️", title: "Document vault", body: "Versioned contracts, IDs and certificates with expiry reminders." },
    { icon: "📊", title: "Live dashboards", body: "Owner view on any phone: cash, pipeline, attendance, margin — right now." },
    { icon: "🔌", title: "API & webhooks", body: "Connect anything else you run. Zapier, Make, custom scripts — all welcome." },
    { icon: "🏢", title: "Multi-branch", body: "Consolidated reporting with branch-level P&L, stock and staff control." },
    { icon: "💾", title: "Your data, exportable", body: "One-click CSV/PDF export and daily encrypted backups. You own it, always." }
  ]},
  comparison: { eyebrow: "Why one ecosystem", title: "Ecosystem vs Standalone tools", subtitle: "Most businesses stitch together 6–10 disconnected tools. Here's what actually changes when every portal reads and writes to the same live backbone.",
    without: { badge: "Without VIORA", heading: "🧩 Standalone Tools", lead: "Each tool lives alone. Data is re-typed, re-exported, re-imported — and always out of date.", points: [
      { title: "6–10 separate subscriptions", body: "POS, accounting, payroll, CRM, inventory, website, payments, WhatsApp — each billed separately." },
      { title: "Zero shared data", body: "A sale at the till doesn't update inventory, and doesn't post to the ledger." },
      { title: "Manual month-end reconciliation", body: "M-Pesa, bank, cash, and card all reconciled by hand — hours per week lost." },
      { title: "Leads die in DMs", body: "Website enquiries and WhatsApp chats never become Clients, Deals, or Tasks." },
      { title: "Reports take days", body: "Export CSV → clean in Excel → email → re-check. By the time you see it, it's stale." },
      { title: "No single client view", body: "The sales team, the accountant, and the ops manager each see a different version." },
      { title: "Compliance is a scramble", body: "KRA, NSSF, SHIF, Housing Levy — each filed separately, from separate tools." },
      { title: "Scaling means new tools", body: "Each new branch, product line or service = more subscriptions and more re-training." }
    ]},
    with: { badge: "With VIORA", heading: "⚡ One Ecosystem", lead: "Every portal shares one real-time data backbone. Enter once, use everywhere — from till to ledger to AI.", points: [
      { title: "One system, seven portals", body: "Business, Public, Partner, Product, YouTube, Client Portal, Training — all included under one subscription." },
      { title: "Real-time shared data", body: "A sale updates stock, posts the journal entry, feeds the AI — instantly and everywhere." },
      { title: "Auto-reconciled payments", body: "M-Pesa, bank, cash, and card land in the ledger and match themselves to invoices." },
      { title: "Leads auto-convert", body: "Any enquiry → Client + Deal + Task in one step, with full audit trail." },
      { title: "Live dashboards", body: "Owner view on any phone: cash, pipeline, margin — right now, from live data." },
      { title: "Single client view", body: "Every department sees the same 360° client profile: deals, invoices, comms, docs." },
      { title: "Compliance on autopilot", body: "eTIMS-ready invoicing and Kenya payroll (PAYE, NSSF, SHIF, Housing) calculated automatically." },
      { title: "Scales without re-tooling", body: "New branch, product, or service = a few clicks — never a new subscription." }
    ]},
    kpis: [
      { val: "−6 hrs", lbl: "Weekly admin time saved" },
      { val: "+18%", lbl: "Typical margin uplift" },
      { val: "0", lbl: "Double entries needed" },
      { val: "1", lbl: "System to train on" }
    ]
  },
  steps: { eyebrow: "How it goes", title: "From conversation to living system", items: [
    { title: "Discover", body: "A 30-minute call. We map what you actually do today — tools, leaks, workarounds." },
    { title: "Blueprint", body: "You get a written plan: which portals first, what changes, what it costs, what it saves." },
    { title: "Build", body: "We configure your portals, migrate your data and integrate M-Pesa, SMS and eTIMS." },
    { title: "Launch & train", body: "Your team is trained on their own data. We stay on for support and tuning." }
  ]},
  cta: { title: "Ready to see your blueprint?", body: "Send us your details and we'll come back on WhatsApp with a plan built around your industry — usually within a few hours.", actions: [
    { type: "button", label: "Send my details →", href: "" },
    { type: "link", label: "Visit Control Panel", href: "https://www.elma.co.ke/v.html" },
    { type: "link", label: "Call 0713 428 774", href: "tel:+254713428774" }
  ]},
  faq: { eyebrow: "Questions", title: "The things people actually ask", items: [
    { q: "Do I have to buy all seven portals?", a: "No. Start with the one that hurts most — usually Business UI. Every portal shares one data core, so adding Public, Partner, Product, YouTube, Client Portal or Training later takes days, not months." },
    { q: "Will it work on my phone?", a: "Yes. Every portal is mobile-first and installable as a PWA on Android and iPhone. Your team can check in, log work, invoice and approve from the field — no laptop required." },
    { q: "What about M-Pesa and KRA?", a: "M-Pesa Daraja integration handles STK push, paybill and till collections, then auto-reconciles each payment against the right invoice. Invoicing is eTIMS-ready, and payroll handles PAYE, NSSF, SHIF and the Housing Levy." },
    { q: "Is my data safe?", a: "Encrypted in transit and at rest, role-based access, two-factor authentication, daily backups and a complete audit trail. Your data is yours — export it any time in CSV or PDF." },
    { q: "How long does setup take?", a: "Business UI typically goes live in 2–4 weeks depending on how much data we migrate. Each additional portal is usually 1–2 weeks after that." },
    { q: "Do you train my team?", a: "Always. Training happens on your own live data, in your own language and workflow — not on a demo account nobody recognises. And with the Training UI, every certificate and completion is tracked automatically." },
    { q: "What if I'm not in Kenya?", a: "The core system is country-agnostic. We already localise tax, payroll and payment rails per country — tell us where you operate and we'll confirm the fit on the call." }
  ]},
  footer: { motto: "VIORA: MORE THAN A PLATFORM", sub: "It's a complete ecosystem.", left: "Visit us: www.viora.co.ke", right: "Together We Build A Smarter Tomorrow", services: [
    { icon: "fa-solid fa-code", label: "Web Development" },
    { icon: "fa-solid fa-mobile-button", label: "Mobile Apps" },
    { icon: "fa-solid fa-server", label: "System Solutions" },
    { icon: "fa-solid fa-bullhorn", label: "Digital Marketing" },
    { icon: "fa-solid fa-pen-nib", label: "Creative Design" },
    { icon: "fa-solid fa-user-graduate", label: "Training & Support" }
  ]},
  categories: [],
  industries: {},
  sectionOrder: [
    { id: "hero", visible: true },
    { id: "banner", visible: true },
    { id: "capabilities", visible: true },
    { id: "comparison", visible: true },
    { id: "steps", visible: true },
    { id: "cta", visible: true },
    { id: "faq", visible: true },
    { id: "footer", visible: true }
  ]
};

export function ppSeedCategoriesAndIndustriesFromV0() {
  return [
    { key: "retail_trade", em: "🛒", name: "Retail & Trade" },
    { key: "food_bev", em: "🍽️", name: "Food & Beverage" },
    { key: "health_wellness", em: "🏥", name: "Health & Wellness" },
    { key: "beauty_personal", em: "💇", name: "Beauty & Personal Care" },
    { key: "prof_services", em: "💼", name: "Professional Services" },
    { key: "creative_media", em: "🎬", name: "Creative & Media" },
    { key: "construction", em: "🏗️", name: "Construction & Trades" },
    { key: "transport_logi", em: "🚚", name: "Transport & Logistics" },
    { key: "agri_farming", em: "🌾", name: "Agriculture & Farming" },
    { key: "education", em: "🎓", name: "Education & Training" },
    { key: "finance_ins", em: "🏦", name: "Finance & Insurance" },
    { key: "real_estate", em: "🏘️", name: "Real Estate & Property" },
    { key: "hospitality", em: "🏨", name: "Hospitality & Tourism" },
    { key: "manufacturing", em: "🏭", name: "Manufacturing & Industry" },
    { key: "tech_digital", em: "💻", name: "Tech & Digital" },
    { key: "community_faith", em: "🤝", name: "Community & Faith" },
    { key: "informal_msme", em: "🛵", name: "Informal & MSME" },
    { key: "energy_env", em: "⚡", name: "Energy & Environment" },
    { key: "mining_extract", em: "⛏️", name: "Mining & Extractives" },
    { key: "events_ent", em: "🎉", name: "Events & Entertainment" },
    { key: "gov_ngo", em: "🏛️", name: "Government & NGO" },
    { key: "automotive", em: "🚗", name: "Automotive & Repair" },
    { key: "sports_rec", em: "⚽", name: "Sports & Recreation" },
    { key: "security_safety", em: "🛡️", name: "Security & Safety" },
    { key: "legal_compliance", em: "⚖️", name: "Legal & Compliance" },
    { key: "warehouse", em: "📦", name: "Warehousing & Fulfilment" },
    { key: "fashion_apparel", em: "👗", name: "Fashion & Apparel" },
    { key: "cleaning_facility", em: "🧹", name: "Cleaning & Facility" },
    { key: "rental_leasing", em: "🔑", name: "Rental & Leasing" },
    { key: "misc_other", em: "🌟", name: "Other Industries" }
  ];
}

/* ═══════════════════════════════════════════════════════════════
   PP OBJECT
   ═══════════════════════════════════════════════════════════════ */
export const PP = {
  draft: null,
  original: null,
  saving: false,
  panelState: {},
  _editingIndustryKey: null,
  _indSolutions: null,
  _indChanges: null,
  _indModules: null,
  _unsubscribe: null,
  _loading: false,
  _loadedOnce: false,
  _dirty: false,
  _renderScheduled: null,
  _filterScheduled: null,

  $: (id) => {
    const f = D.$;
    if (typeof f === 'function') { try { return f(id); } catch (e) {} }
    return document.getElementById(id);
  },
  escHtml: esc,
  clone,
  uid: uidShort,

  mergeWithDefaults(saved) {
    const out = clone(PP_DEFAULTS);
    if (!saved || typeof saved !== 'object') return out;

    const walk = (target, source) => {
      for (const k of Object.keys(source)) {
        const sv = source[k];
        if (sv === null || sv === undefined) continue;
        if (Array.isArray(sv)) { target[k] = sv; }
        else if (sv && typeof sv === 'object' && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
          walk(target[k], sv);
        } else {
          target[k] = sv;
        }
      }
    };
    walk(out, saved);

    if (Array.isArray(saved.sectionOrder)) {
      const savedById = new Map(saved.sectionOrder.map(s => [s.id, s]));
      const merged = [];
      for (const def of PP_DEFAULTS.sectionOrder) {
        const s = savedById.get(def.id);
        merged.push(s ? { id: def.id, visible: !!s.visible } : { id: def.id, visible: def.visible });
        savedById.delete(def.id);
      }
      for (const [id, s] of savedById) merged.push({ id, visible: !!s.visible });
      out.sectionOrder = merged;
    }

    return out;
  },

  _ensureDraft() {
    if (PP.draft) return;
    PP.draft = PP.mergeWithDefaults(null);
    PP.draft.categories = ppSeedCategoriesAndIndustriesFromV0();
    PP.original = clone(PP.draft);
    PP._loadedOnce = true;
  },

  subscribe() {
    if (PP._unsubscribe) return;

    PP._ensureDraft();

    if (!ppWired()) {
      console.warn('[PP] subscribe skipped: Firebase deps not injected');
      PP.setSync('dirty', 'Offline — deps not ready');
      PP.renderAll();
      return;
    }

    PP.setSync('loading', 'Subscribing…');
    try {
      PP._unsubscribe = D.onValue(D.ref(D.db, D.P(ECOSYSTEM_MAP_PATH)), (snap) => {
        try {
          const saved = snap.exists() ? snap.val() : null;
          PP.applyIncoming(saved);
        } catch (e) {
          console.warn('[PP] snapshot handler failed', e);
        }
      }, (err) => {
        console.warn('[PP] subscribe error:', err);
        PP.setSync('dirty', 'Subscribe failed — using defaults');
        PP.renderAll();
      });
    } catch (e) {
      console.error('[PP] subscribe exception:', e);
      PP._unsubscribe = null;
      PP.setSync('dirty', 'Subscribe failed');
      PP.renderAll();
    }
  },

  applyIncoming(saved) {
    if (PP._dirty && PP._loadedOnce) {
      PP.setSync('dirty', 'Remote changed — local edits preserved');
      return;
    }

    const wasLoaded = !!PP.draft;
    const next = PP.mergeWithDefaults(saved);
    if (!saved || !Array.isArray(saved.categories) || !saved.categories.length) {
      next.categories = ppSeedCategoriesAndIndustriesFromV0();
    }
    if (!next.industries || typeof next.industries !== 'object') next.industries = {};

    PP.draft = next;
    PP.original = clone(next);
    PP._loadedOnce = true;
    PP._dirty = false;
    PP.setSync('ok', `Live · ${new Date().toLocaleTimeString()}`);

    const tab = document.getElementById('tab-product-presentation');
    const tabVisible = tab && tab.classList.contains('active');
    if (!wasLoaded || tabVisible) {
      PP.renderAll();
      for (const [key, isOpen] of Object.entries(PP.panelState)) {
        if (!isOpen) continue;
        const panel = document.querySelector(`[data-pp-panel="${key}"]`);
        if (panel && !panel.classList.contains('open')) {
          panel.classList.add('open');
          const head = panel.querySelector('.pp-panel-head');
          if (head) head.setAttribute('aria-expanded', 'true');
        }
      }
    }
  },

  async load() {
    if (PP._loadedOnce) return;
    PP.subscribe();
  },

  unsubscribe() {
    if (PP._unsubscribe) { try { PP._unsubscribe(); } catch (e) {} PP._unsubscribe = null; }
  },

  async save() {
    if (PP.saving) return false;
    if (!PP.draft) { D.toast('Nothing to save yet.', 'error'); return false; }

    if (!ppWired()) {
      D.toast('Cannot save: Firebase deps not injected.', 'error');
      PP.setSync('dirty', 'Save blocked — deps missing');
      return false;
    }

    PP.saving = true;
    PP.setSync('saving', 'Saving…');
    const btn = PP.$('ppSaveBtn');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }
    try {
      const payload = clone(PP.draft);
      payload._meta = {
        updatedAt: nowIso(),
        updatedBy: D.state?.operator?.name || D.state?.operator?.email || 'admin'
      };
      await D.set(D.ref(D.db, D.P(ECOSYSTEM_MAP_PATH)), payload);
      PP.original = clone(PP.draft);
      PP._dirty = false;
      PP.setSync('ok', `Saved ${new Date().toLocaleTimeString()}`);
      D.toast('Product Presentation saved.', 'success');
      try { await D.logActivity('edit', 'Product Presentation updated', 'ecosystemMap'); } catch (e) {}
      return true;
    } catch (e) {
      console.error('[PP] save failed', e);
      PP.setSync('dirty', 'Save failed');
      D.toast('Save failed: ' + (e.message || 'unknown error'), 'error');
      return false;
    } finally {
      PP.saving = false;
      if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    }
  },

  setSync(mode, label) {
    const dot = PP.$('ppSyncDot');
    const lbl = PP.$('ppSyncLabel');
    if (dot) dot.classList.toggle('dirty', mode !== 'ok');
    if (lbl) lbl.textContent = label;
  },

  reset() {
    const doReset = () => {
      PP.draft = PP.mergeWithDefaults(null);
      PP.draft.categories = ppSeedCategoriesAndIndustriesFromV0();
      PP._dirty = true;
      PP.renderAll();
      PP.setSync('dirty', 'Reset — click Save to apply');
      D.toast('Reset to defaults. Click Save to push to Firebase.', 'info');
    };
    const msg = 'Reset EVERYTHING to the original defaults?\n\nThis does not save until you click Save.';
    if (typeof window.vioraConfirm === 'function') {
      window.vioraConfirm(msg, { title: 'Reset presentation', confirmLabel: 'Reset', confirmClass: 'btn-danger' })
        .then(ok => { if (ok) doReset(); });
    } else if (confirm(msg)) {
      doReset();
    }
  },

  exportJson() {
    if (!PP.draft) return;
    const blob = new Blob([JSON.stringify(PP.draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viora-ecosystem-map-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    D.toast('Exported JSON.', 'success');
  },

  importJson(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Not a JSON object');
        }
        PP.draft = PP.mergeWithDefaults(parsed);
        PP._dirty = true;
        PP.renderAll();
        PP.setSync('dirty', 'Imported — click Save to apply');
        D.toast('Imported. Click Save to push to Firebase.', 'success');
      } catch (e) {
        D.toast('Invalid JSON file: ' + e.message, 'error');
      }
    };
    r.onerror = () => D.toast('Could not read file.', 'error');
    r.readAsText(file);
  },

  togglePanel(key) {
    const panel = document.querySelector(`[data-pp-panel="${key}"]`);
    if (!panel) return;
    const head = panel.querySelector('.pp-panel-head');
    const isOpen = panel.classList.toggle('open');
    if (head) head.setAttribute('aria-expanded', String(isOpen));
    PP.panelState[key] = isOpen;
  },

  scheduleRender() {
    if (PP._renderScheduled) return;
    PP._renderScheduled = setTimeout(() => {
      PP._renderScheduled = null;
      PP.renderAll();
    }, 30);
  },

  renderAll() {
    if (!PP.draft) return;
    const safe = (fn, label) => {
      try { fn(); } catch (e) { console.warn('[PP] render ' + label + ' failed', e); }
    };
    safe(PP.renderHero, 'hero');
    safe(PP.renderCore, 'core');
    safe(PP.renderBannerList, 'bannerList');
    safe(PP.renderCapabilities, 'capabilities');
    safe(PP.renderComparison, 'comparison');
    safe(PP.renderSteps, 'steps');
    safe(PP.renderCta, 'cta');
    safe(PP.renderFaq, 'faq');
    safe(PP.renderFooter, 'footer');
    safe(PP.renderCategories, 'categories');
    safe(PP.renderIndustries, 'industries');
    safe(PP.renderOrderList, 'orderList');
  },

  renderHero() {
    const h = PP.draft.hero || {};
    const set = (id, val) => { const el = PP.$(id); if (el && el.value !== val) el.value = val; };
    set('ppHeroBrand', h.brand || '');
    set('ppHeroTagline', h.tagline || '');
    set('ppHeroTitle', h.pageTitle || '');
    set('ppHeroHeading', h.heading || '');
    set('ppHeroSubheading', h.subheading || '');
    set('ppHeroSmall', h.small || '');
    set('ppHeroRightTagline', h.rightTagline || '');
  },
  readHero() {
    if (!PP.draft) return;
    const g = (id) => PP.$(id)?.value ?? '';
    PP.draft.hero = {
      brand: g('ppHeroBrand').trim(),
      tagline: g('ppHeroTagline').trim(),
      pageTitle: g('ppHeroTitle').trim(),
      heading: g('ppHeroHeading').trim(),
      subheading: g('ppHeroSubheading').trim(),
      small: g('ppHeroSmall').trim(),
      rightTagline: g('ppHeroRightTagline')
    };
  },

  renderCore() {
    const c = PP.draft.core || {};
    const set = (id, val) => { const el = PP.$(id); if (el && el.value !== val) el.value = val; };
    set('ppCoreIcon', c.icon || '');
    set('ppCoreTitle', c.title || '');
    set('ppCoreTags', c.tags || '');
  },
  readCore() {
    if (!PP.draft) return;
    const g = (id) => PP.$(id)?.value ?? '';
    PP.draft.core = { icon: g('ppCoreIcon').trim(), title: g('ppCoreTitle'), tags: g('ppCoreTags').trim() };
  },

  renderBannerList() {
    if (!PP.draft) return;
    const host = PP.$('ppBannerList');
    if (!host) return;
    const list = PP.draft.bannerCards || [];
    if (PP.$('ppBannerCount')) PP.$('ppBannerCount').textContent = list.length;
    if (!list.length) { setHtmlIfChanged(host, `<div class="pp-empty">No banner cards yet.</div>`); return; }

    let sig = list.length + ':';
    for (const b of list) {
      sig += (b.id||'') + '|' + (b.title||'') + '|' + (b.subtext||'') + '|' +
             (b.icon||'') + '|' + (b.color||'') + '|' + (b.position||'') + '|' +
             (b.emoji||'') + '|' + ((b.features||[]).join(',')) + ';';
    }
    sig = hashString(sig);

    const POSITIONS = ['pos-top-left','pos-top-center','pos-top-right','pos-mid-left','pos-mid-right','pos-bot-left','pos-bot-right'];
    const html = list.map((b, i) => `
      <div class="pp-item" data-pp-banner="${i}">
        <div class="pp-item-head">
          <span style="font-size:1.2rem;">${esc(b.emoji || '')}</span>
          <strong>Card ${i + 1} — ${esc(b.title || 'Untitled')}</strong>
          <div class="pp-reorder">
            <button type="button" onclick="PP.moveItem('bannerCards', ${i}, -1)" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
            <button type="button" onclick="PP.moveItem('bannerCards', ${i}, 1)" ${i === list.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          </div>
          <button type="button" class="pp-delete" onclick="PP.deleteItem('bannerCards', ${i})"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="pp-grid">
          <div class="pp-field"><label>Key / ID *</label><input value="${esc(b.id || '')}" oninput="PP.setField('bannerCards', ${i}, 'id', this.value)" /></div>
          <div class="pp-field"><label>Emoji / Emblem</label><input value="${esc(b.emoji || '')}" maxlength="4" oninput="PP.setField('bannerCards', ${i}, 'emoji', this.value)" /></div>
          <div class="pp-field"><label>Title</label><input value="${esc(b.title || '')}" oninput="PP.setField('bannerCards', ${i}, 'title', this.value)" /></div>
          <div class="pp-field"><label>Sub-text</label><input value="${esc(b.subtext || '')}" oninput="PP.setField('bannerCards', ${i}, 'subtext', this.value)" /></div>
          <div class="pp-field"><label>FontAwesome Icon</label><input value="${esc(b.icon || '')}" oninput="PP.setField('bannerCards', ${i}, 'icon', this.value)" /></div>
          <div class="pp-field"><label>Accent Color</label><input type="color" value="${esc(b.color || '#00d4ff')}" oninput="PP.setField('bannerCards', ${i}, 'color', this.value)" /></div>
          <div class="pp-field"><label>Grid Position</label>
            <select onchange="PP.setField('bannerCards', ${i}, 'position', this.value)">
              ${POSITIONS.map(p => `<option value="${p}" ${p === b.position ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="pp-field full" style="margin-top:10px;">
          <label>Feature List</label>
          <div class="pp-chips" style="margin-bottom:8px;">
            ${(b.features || []).map((f, fi) => `<span class="pp-chip">${esc(f)}<button type="button" onclick="PP.removeArrayItem('bannerCards', ${i}, 'features', ${fi})">×</button></span>`).join('')}
          </div>
          <div class="pp-chip-input">
            <input placeholder="Add feature…" data-pp-feature-input="${i}"
              onkeydown="if(event.key==='Enter'){event.preventDefault(); PP.addBannerFeature(${i}, this);}" />
            <button type="button" onclick="PP.addBannerFeature(${i}, this.previousElementSibling)">Add</button>
          </div>
        </div>
      </div>
    `).join('');

    setHtmlIfSigChanged(host, sig, html);
  },

  addBannerFeature(index, inputEl) {
    const val = (inputEl?.value || '').trim();
    if (!val) return;
    if (!PP.draft) return;
    const card = PP.draft.bannerCards?.[index];
    if (!card) return;
    if (!Array.isArray(card.features)) card.features = [];
    card.features.push(val);
    PP.markDirty();

    const row = document.querySelector(`[data-pp-banner="${index}"]`);
    if (row) {
      const chips = row.querySelector('.pp-chips');
      if (chips) {
        chips.innerHTML = card.features.map((f, fi) =>
          `<span class="pp-chip">${esc(f)}<button type="button" onclick="PP.removeArrayItem('bannerCards', ${index}, 'features', ${fi})">×</button></span>`
        ).join('');
      }
    }
    if (inputEl) { inputEl.value = ''; inputEl.focus(); }
  },

  renderCapabilities() {
    if (!PP.draft) return;
    const cap = PP.draft.capabilities || {};
    const set = (id, val) => { const el = PP.$(id); if (el && el.value !== val) el.value = val; };
    set('ppCapEyebrow', cap.eyebrow || '');
    set('ppCapTitle', cap.title || '');
    set('ppCapSubtitle', cap.subtitle || '');

    const host = PP.$('ppCapList');
    if (!host) return;
    const list = cap.items || [];
    if (PP.$('ppCapCount')) PP.$('ppCapCount').textContent = list.length;
    if (!list.length) { setHtmlIfChanged(host, `<div class="pp-empty">No capabilities yet.</div>`); return; }

    let sig = list.length + ':';
    for (const c of list) sig += (c.icon||'') + '|' + (c.title||'') + '|' + (c.body||'') + ';';
    sig = hashString(sig);

    const html = list.map((c, i) => `
      <div class="pp-item" data-pp-cap="${i}">
        <div class="pp-item-head">
          <strong>Capability ${i + 1} — ${esc(c.title || 'Untitled')}</strong>
          <div class="pp-reorder">
            <button type="button" onclick="PP.moveItem('capabilities.items', ${i}, -1)" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
            <button type="button" onclick="PP.moveItem('capabilities.items', ${i}, 1)" ${i === list.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          </div>
          <button type="button" class="pp-delete" onclick="PP.deleteItem('capabilities.items', ${i})"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="pp-grid">
          <div class="pp-field"><label>Icon (emoji)</label><input value="${esc(c.icon || '')}" maxlength="4" oninput="PP.setField('capabilities.items', ${i}, 'icon', this.value)" /></div>
          <div class="pp-field"><label>Title</label><input value="${esc(c.title || '')}" oninput="PP.setField('capabilities.items', ${i}, 'title', this.value)" /></div>
          <div class="pp-field full"><label>Body</label><textarea rows="2" oninput="PP.setField('capabilities.items', ${i}, 'body', this.value)">${esc(c.body || '')}</textarea></div>
        </div>
      </div>
    `).join('');

    setHtmlIfSigChanged(host, sig, html);
  },

  renderComparison() {
    if (!PP.draft) return;
    const c = PP.draft.comparison || {};
    const set = (id, val) => { const el = PP.$(id); if (el && el.value !== val) el.value = val; };
    set('ppCmpEyebrow', c.eyebrow || '');
    set('ppCmpTitle', c.title || '');
    set('ppCmpSubtitle', c.subtitle || '');
    set('ppCmpWithoutBadge', c.without?.badge || '');
    set('ppCmpWithoutHeading', c.without?.heading || '');
    set('ppCmpWithoutLead', c.without?.lead || '');
    set('ppCmpWithBadge', c.with?.badge || '');
    set('ppCmpWithHeading', c.with?.heading || '');
    set('ppCmpWithLead', c.with?.lead || '');

    const renderPoints = (side, list) => list.map((p, i) => `
      <div class="pp-item">
        <div class="pp-item-head"><strong>Point ${i + 1}</strong><button type="button" class="pp-delete" onclick="PP.deleteItem('comparison.${side}.points', ${i})"><i class="fa-solid fa-trash"></i></button></div>
        <div class="pp-field full"><label>Title</label><input value="${esc(p.title || '')}" oninput="PP.setField('comparison.${side}.points', ${i}, 'title', this.value)" /></div>
        <div class="pp-field full" style="margin-top:8px;"><label>Body</label><textarea rows="2" oninput="PP.setField('comparison.${side}.points', ${i}, 'body', this.value)">${esc(p.body || '')}</textarea></div>
      </div>
    `).join('');

    const wh = PP.$('ppCmpWithoutList');
    if (wh) wh.innerHTML = renderPoints('without', c.without?.points || []);
    const wi = PP.$('ppCmpWithList');
    if (wi) wi.innerHTML = renderPoints('with', c.with?.points || []);

    const kpiHost = PP.$('ppCmpKpiList');
    if (!kpiHost) return;
    const kpis = c.kpis || [];
    kpiHost.innerHTML = kpis.length ? kpis.map((k, i) => `
      <div class="pp-item">
        <div class="pp-item-head"><strong>KPI ${i + 1}</strong><button type="button" class="pp-delete" onclick="PP.deleteItem('comparison.kpis', ${i})"><i class="fa-solid fa-trash"></i></button></div>
        <div class="pp-grid">
          <div class="pp-field"><label>Value</label><input value="${esc(k.val || '')}" oninput="PP.setField('comparison.kpis', ${i}, 'val', this.value)" /></div>
          <div class="pp-field"><label>Label</label><input value="${esc(k.lbl || '')}" oninput="PP.setField('comparison.kpis', ${i}, 'lbl', this.value)" /></div>
        </div>
      </div>
    `).join('') : '<div class="pp-empty">No KPI cards yet.</div>';
  },

  renderSteps() {
    if (!PP.draft) return;
    const st = PP.draft.steps || {};
    const set = (id, val) => { const el = PP.$(id); if (el && el.value !== val) el.value = val; };
    set('ppStepEyebrow', st.eyebrow || '');
    set('ppStepTitle', st.title || '');

    const host = PP.$('ppStepList');
    if (!host) return;
    const items = st.items || [];
    if (PP.$('ppStepCount')) PP.$('ppStepCount').textContent = items.length;
    if (!items.length) { setHtmlIfChanged(host, `<div class="pp-empty">No steps yet.</div>`); return; }

    let sig = items.length + ':';
    for (const s of items) sig += (s.title||'') + '|' + (s.body||'') + ';';
    sig = hashString(sig);

    const html = items.map((s, i) => `
      <div class="pp-item" data-pp-step="${i}">
        <div class="pp-item-head">
          <strong>Step ${i + 1} — ${esc(s.title || 'Untitled')}</strong>
          <div class="pp-reorder">
            <button type="button" onclick="PP.moveItem('steps.items', ${i}, -1)" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
            <button type="button" onclick="PP.moveItem('steps.items', ${i}, 1)" ${i === items.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          </div>
          <button type="button" class="pp-delete" onclick="PP.deleteItem('steps.items', ${i})"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="pp-field full"><label>Title</label><input value="${esc(s.title || '')}" oninput="PP.setField('steps.items', ${i}, 'title', this.value)" /></div>
        <div class="pp-field full" style="margin-top:8px;"><label>Body</label><textarea rows="2" oninput="PP.setField('steps.items', ${i}, 'body', this.value)">${esc(s.body || '')}</textarea></div>
      </div>
    `).join('');

    setHtmlIfSigChanged(host, sig, html);
  },

  renderCta() {
    if (!PP.draft) return;
    const cta = PP.draft.cta || {};
    const set = (id, val) => { const el = PP.$(id); if (el && el.value !== val) el.value = val; };
    set('ppCtaTitle', cta.title || '');
    set('ppCtaBody', cta.body || '');

    const host = PP.$('ppCtaActionsList');
    if (!host) return;
    const actions = cta.actions || [];
    host.innerHTML = actions.length ? actions.map((a, i) => `
      <div class="pp-item">
        <div class="pp-item-head"><strong>Action ${i + 1}</strong><button type="button" class="pp-delete" onclick="PP.deleteItem('cta.actions', ${i})"><i class="fa-solid fa-trash"></i></button></div>
        <div class="pp-grid">
          <div class="pp-field"><label>Type</label>
            <select onchange="PP.setField('cta.actions', ${i}, 'type', this.value)">
              <option value="button" ${a.type === 'button' ? 'selected' : ''}>Button (opens lead modal)</option>
              <option value="link" ${a.type === 'link' ? 'selected' : ''}>Link</option>
            </select>
          </div>
          <div class="pp-field"><label>Label</label><input value="${esc(a.label || '')}" oninput="PP.setField('cta.actions', ${i}, 'label', this.value)" /></div>
          <div class="pp-field full"><label>URL (only for links)</label><input value="${esc(a.href || '')}" oninput="PP.setField('cta.actions', ${i}, 'href', this.value)" /></div>
        </div>
      </div>
    `).join('') : '<div class="pp-empty">No CTA actions yet.</div>';
  },

  renderFaq() {
    if (!PP.draft) return;
    const f = PP.draft.faq || {};
    const set = (id, val) => { const el = PP.$(id); if (el && el.value !== val) el.value = val; };
    set('ppFaqEyebrow', f.eyebrow || '');
    set('ppFaqTitle', f.title || '');

    const host = PP.$('ppFaqList');
    if (!host) return;
    const items = f.items || [];
    if (PP.$('ppFaqCount')) PP.$('ppFaqCount').textContent = items.length;
    if (!items.length) { setHtmlIfChanged(host, `<div class="pp-empty">No FAQ items yet.</div>`); return; }

    let sig = items.length + ':';
    for (const x of items) sig += (x.q||'') + '|' + (x.a||'') + ';';
    sig = hashString(sig);

    const html = items.map((faq, i) => `
      <div class="pp-item">
        <div class="pp-item-head">
          <strong>Q${i + 1}</strong>
          <div class="pp-reorder">
            <button type="button" onclick="PP.moveItem('faq.items', ${i}, -1)" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
            <button type="button" onclick="PP.moveItem('faq.items', ${i}, 1)" ${i === items.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          </div>
          <button type="button" class="pp-delete" onclick="PP.deleteItem('faq.items', ${i})"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="pp-field full"><label>Question</label><input value="${esc(faq.q || '')}" oninput="PP.setField('faq.items', ${i}, 'q', this.value)" /></div>
        <div class="pp-field full" style="margin-top:8px;"><label>Answer</label><textarea rows="3" oninput="PP.setField('faq.items', ${i}, 'a', this.value)">${esc(faq.a || '')}</textarea></div>
      </div>
    `).join('');

    setHtmlIfSigChanged(host, sig, html);
  },

  renderFooter() {
    if (!PP.draft) return;
    const f = PP.draft.footer || {};
    const set = (id, val) => { const el = PP.$(id); if (el && el.value !== val) el.value = val; };
    set('ppFooterMotto', f.motto || '');
    set('ppFooterSub', f.sub || '');
    set('ppFooterLeft', f.left || '');
    set('ppFooterRight', f.right || '');

    const host = PP.$('ppFooterServicesList');
    if (!host) return;
    const svcs = f.services || [];
    host.innerHTML = svcs.length ? svcs.map((s, i) => `
      <div class="pp-item">
        <div class="pp-item-head"><strong>Service ${i + 1}</strong><button type="button" class="pp-delete" onclick="PP.deleteItem('footer.services', ${i})"><i class="fa-solid fa-trash"></i></button></div>
        <div class="pp-grid">
          <div class="pp-field"><label>Icon (FontAwesome)</label><input value="${esc(s.icon || '')}" oninput="PP.setField('footer.services', ${i}, 'icon', this.value)" /></div>
          <div class="pp-field"><label>Label</label><input value="${esc(s.label || '')}" oninput="PP.setField('footer.services', ${i}, 'label', this.value)" /></div>
        </div>
      </div>
    `).join('') : '<div class="pp-empty">No service items yet.</div>';
  },

  renderCategories() {
    if (!PP.draft) return;
    const host = PP.$('ppCatList');
    if (!host) return;
    const list = PP.draft.categories || [];
    if (PP.$('ppCatCount')) PP.$('ppCatCount').textContent = list.length;
    if (!list.length) { setHtmlIfChanged(host, `<div class="pp-empty">No categories yet.</div>`); return; }

    let sig = list.length + ':';
    for (const c of list) sig += (c.key||'') + '|' + (c.em||'') + '|' + (c.name||'') + ';';
    sig = hashString(sig);

    const html = list.map((c, i) => `
      <div class="pp-item" data-pp-cat="${i}">
        <div class="pp-item-head">
          <strong>Category ${i + 1}</strong>
          <div class="pp-reorder">
            <button type="button" onclick="PP.moveItem('categories', ${i}, -1)" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
            <button type="button" onclick="PP.moveItem('categories', ${i}, 1)" ${i === list.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          </div>
          <button type="button" class="pp-delete" onclick="PP.deleteItem('categories', ${i})"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="pp-grid">
          <div class="pp-field"><label>Key *</label><input value="${esc(c.key || '')}" oninput="PP.setField('categories', ${i}, 'key', this.value)" /></div>
          <div class="pp-field"><label>Emoji</label><input value="${esc(c.em || '')}" maxlength="4" oninput="PP.setField('categories', ${i}, 'em', this.value)" /></div>
          <div class="pp-field full"><label>Name</label><input value="${esc(c.name || '')}" oninput="PP.setField('categories', ${i}, 'name', this.value)" /></div>
        </div>
      </div>
    `).join('');

    setHtmlIfSigChanged(host, sig, html);
  },

  renderIndustries() {
    if (!PP.draft) return;

    const sel = PP.$('ppIndFilterCat');
    const currentFilter = sel?.value || 'all';
    if (sel) {
      sel.innerHTML = '<option value="all">All Categories</option>' +
        (PP.draft.categories || []).map(c => `<option value="${esc(c.key)}">${esc(c.name)}</option>`).join('');
      sel.value = Array.from(sel.options).some(o => o.value === currentFilter) ? currentFilter : 'all';
    }

    const indCat = PP.$('ppIndCat');
    if (indCat) {
      const currentIndCat = indCat.value;
      indCat.innerHTML = (PP.draft.categories || [])
        .map(c => `<option value="${esc(c.key)}">${esc(c.name)}</option>`).join('');
      if (currentIndCat && Array.from(indCat.options).some(o => o.value === currentIndCat)) {
        indCat.value = currentIndCat;
      }
    }

    PP.filterIndustries();
  },

  filterIndustries: debounce(function () {
    if (!PP.draft) return;

    const host = PP.$('ppIndList');
    if (!host) return;

    const q = (PP.$('ppIndSearch')?.value || '').toLowerCase().trim();
    const cat = PP.$('ppIndFilterCat')?.value || 'all';
    const industries = PP.draft.industries || {};
    const entries = Object.entries(industries);
    if (PP.$('ppIndCount')) PP.$('ppIndCount').textContent = entries.length;

    const catNameByKey = new Map();
    for (const c of (PP.draft.categories || [])) catNameByKey.set(c.key, c.name);

    const matched = [];
    for (let i = 0; i < entries.length; i++) {
      const [k, v] = entries[i];
      if (cat !== 'all' && v.cat !== cat) continue;
      if (q) {
        const hay = ((v.name || '') + ' ' + (v.problem || '') + ' ' + k).toLowerCase();
        if (hay.indexOf(q) === -1) continue;
      }
      matched.push([k, v]);
    }
    matched.sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));

    const displayed = matched.length > 200 ? matched.slice(0, 200) : matched;
    if (!displayed.length) {
      setHtmlIfChanged(host, `<div class="pp-empty">No sub-industries match. Click Add Sub-Industry to create one.</div>`);
      return;
    }

    let sig = displayed.length + ':';
    for (const [k, v] of displayed) sig += k + '|' + (v.name||'') + '|' + (v.cat||'') + '|' + (v.em||'') + ';';
    sig = hashString(sig);

    const html = displayed.map(([k, v]) => {
      const safeKey = esc(k).replace(/'/g, "\\'");
      const catName = catNameByKey.get(v.cat) || v.cat;
      return `
      <div class="pp-industry-row" onclick="PP.openIndustryEditor('${safeKey}')">
        <div class="pp-ind-em">${esc(v.em || '')}</div>
        <div class="pp-ind-body">
          <div class="pp-ind-name">${esc(v.name || k)}</div>
          <div class="pp-ind-cat">${esc(catName)} · ${esc(k)}</div>
        </div>
        <div class="pp-ind-actions">
          <button type="button" class="btn btn-primary btn-xs" onclick="event.stopPropagation(); PP.openIndustryEditor('${safeKey}')"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="btn btn-danger btn-xs" onclick="event.stopPropagation(); PP.deleteIndustry('${safeKey}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `;
    }).join('') + (matched.length > 200
      ? `<div class="pp-empty" style="padding:12px;">Showing first 200 of ${matched.length} matches. Narrow your search to see more.</div>`
      : '');

    setHtmlIfSigChanged(host, sig, html);
  }, 120),

  renderOrderList() {
    if (!PP.draft) return;
    const host = PP.$('ppOrderList');
    if (!host) return;
    const list = PP.draft.sectionOrder || [];
    if (!list.length) { setHtmlIfChanged(host, `<div class="pp-empty">No sections configured.</div>`); return; }

    const LABELS = {
      hero: '🖼️ Hero Section',
      banner: '🎴 Banner / Ecosystem Diagram',
      capabilities: '✨ Capabilities Grid',
      comparison: '⚖️ Comparison Section',
      steps: '🪜 Steps Section',
      cta: '🎯 CTA Band',
      faq: '❓ FAQ',
      footer: '🦶 Footer'
    };
    host.innerHTML = list.map((s, i) => `
      <div class="pp-item" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;min-width:200px;margin:0;">
          <input type="checkbox" ${s.visible ? 'checked' : ''} onchange="PP.setField('sectionOrder', ${i}, 'visible', this.checked)" style="width:auto;" />
          <span style="font-weight:600;font-size:.85rem;">${LABELS[s.id] || esc(s.id)}</span>
        </label>
        <div class="pp-reorder">
          <button type="button" onclick="PP.moveItem('sectionOrder', ${i}, -1)" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
          <button type="button" onclick="PP.moveItem('sectionOrder', ${i}, 1)" ${i === list.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
        </div>
      </div>
    `).join('');
  },

  resolvePath(path) {
    if (!PP.draft) return undefined;
    const parts = path.split('.');
    let cur = PP.draft;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  },

  setField(path, index, key, value) {
    const target = PP.resolvePath(path);
    if (Array.isArray(target)) { if (target[index]) target[index][key] = value; }
    else if (target && typeof target === 'object') { target[key] = value; }
    PP.markDirty();

    if (key === 'title') {
      let header = null;
      if (path === 'bannerCards') header = document.querySelector(`[data-pp-banner="${index}"] .pp-item-head strong`);
      else if (path === 'capabilities.items') header = document.querySelector(`[data-pp-cap="${index}"] .pp-item-head strong`);
      else if (path === 'steps.items') header = document.querySelector(`[data-pp-step="${index}"] .pp-item-head strong`);
      if (header) {
        const prefix = path === 'bannerCards' ? `Card ${index + 1}`
                     : path === 'capabilities.items' ? `Capability ${index + 1}`
                     : `Step ${index + 1}`;
        header.textContent = `${prefix} — ${value || 'Untitled'}`;
      }
    }
  },

  addArrayItem(path, index, key, value) {
    value = (value || '').trim();
    if (!value) return;
    const target = PP.resolvePath(path);
    if (Array.isArray(target) && target[index]) {
      if (!Array.isArray(target[index][key])) target[index][key] = [];
      target[index][key].push(value);
      PP.markDirty();
      if (path === 'bannerCards') PP.renderBannerList();
    }
  },

  removeArrayItem(path, index, key, subIdx) {
    const target = PP.resolvePath(path);
    if (Array.isArray(target) && target[index] && Array.isArray(target[index][key])) {
      target[index][key].splice(subIdx, 1);
      PP.markDirty();
      if (path === 'bannerCards' && key === 'features') {
        const row = document.querySelector(`[data-pp-banner="${index}"]`);
        const chips = row?.querySelector('.pp-chips');
        if (chips) {
          const feats = target[index][key];
          chips.innerHTML = feats.map((f, fi) =>
            `<span class="pp-chip">${esc(f)}<button type="button" onclick="PP.removeArrayItem('bannerCards', ${index}, 'features', ${fi})">×</button></span>`
          ).join('');
          return;
        }
      }
      if (path === 'bannerCards') PP.renderBannerList();
    }
  },

  moveItem(path, index, dir) {
    const list = PP.resolvePath(path);
    if (!Array.isArray(list)) return;
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const tmp = list[index]; list[index] = list[j]; list[j] = tmp;
    PP.markDirty();
    PP.scheduleRender();
  },

  deleteItem(path, index) {
    const list = PP.resolvePath(path);
    if (!Array.isArray(list)) return;
    const doDelete = () => {
      list.splice(index, 1);
      PP.markDirty();
      PP.scheduleRender();
    };
    if (typeof window.vioraConfirm === 'function') {
      window.vioraConfirm('Delete this item?', { title: 'Delete', confirmLabel: 'Delete', confirmClass: 'btn-danger' })
        .then(ok => { if (ok) doDelete(); });
    } else if (confirm('Delete this item?')) {
      doDelete();
    }
  },

  addNew(path, template) {
    const list = PP.resolvePath(path);
    if (!Array.isArray(list)) return;
    list.push(clone(template));
    PP.markDirty();
    PP.scheduleRender();
  },

  openIndustryEditor(key) {
    if (!PP.draft) return;
    const isNew = !key;
    PP._editingIndustryKey = isNew ? null : key;

    const categories = PP.draft.categories || [];
    const defaultCat = categories[0]?.key || '';
    const ind = isNew
      ? { em: '🏭', name: '', cat: defaultCat, problem: '', solutions: [], changes: [], modules: [] }
      : clone(PP.draft.industries[key] || { em: '🏭', name: '', cat: defaultCat, problem: '', solutions: [], changes: [], modules: [] });

    const title = PP.$('ppIndModalTitle');
    if (title) title.textContent = isNew ? 'New Sub-Industry' : `Edit: ${ind.name || key}`;

    const keyEl = PP.$('ppIndKey');
    if (keyEl) { keyEl.value = key || ''; keyEl.disabled = !isNew; }

    const set = (id, val) => { const el = PP.$(id); if (el && el.value !== val) el.value = val; };
    set('ppIndEmoji', ind.em || '');
    set('ppIndName', ind.name || '');
    set('ppIndProblem', ind.problem || '');

    const catEl = PP.$('ppIndCat');
    if (catEl) {
      catEl.innerHTML = categories.map(c => `<option value="${esc(c.key)}">${esc(c.name)}</option>`).join('');
      catEl.value = ind.cat || defaultCat;
      if (!catEl.value && categories[0]) catEl.value = categories[0].key;
    }

    const delBtn = PP.$('ppIndDeleteBtn');
    if (delBtn) delBtn.style.display = isNew ? 'none' : 'inline-flex';

    PP._indSolutions = Array.isArray(ind.solutions) ? ind.solutions.slice() : [];
    PP._indChanges = Array.isArray(ind.changes) ? ind.changes.slice() : [];
    PP._indModules = Array.isArray(ind.modules) ? ind.modules.slice() : [];

    PP.renderIndModalLists();
    PP.$('ppIndModal')?.classList.add('active');
  },

  closeIndustryEditor() {
    PP.$('ppIndModal')?.classList.remove('active');
    PP._editingIndustryKey = null;
    PP._indSolutions = null;
    PP._indChanges = null;
    PP._indModules = null;
  },

  renderIndModalLists() {
    const renderList = (hostId, list, arrName) => {
      const host = PP.$(hostId);
      if (!host) return;
      if (!list.length) {
        setHtmlIfChanged(host, '<div class="pp-empty" style="padding:10px;">None yet.</div>');
        return;
      }
      host.innerHTML = list.map((v, i) => `
        <div class="pp-chip-input" style="margin-bottom:6px;">
          <input value="${esc(v)}" data-ind-list="${arrName}" data-ind-idx="${i}" />
          <button type="button" onclick="PP._${arrName}.splice(${i},1); PP.renderIndModalLists();" style="background:linear-gradient(135deg,#ff5c7c,#d92b4b);">×</button>
        </div>
      `).join('');
    };
    renderList('ppIndSolutions', PP._indSolutions || [], 'indSolutions');
    renderList('ppIndChanges', PP._indChanges || [], 'indChanges');

    const modHost = PP.$('ppIndModules');
    if (!modHost) return;
    const MOD_LABELS = { business: '🏪 Business', public: '🌐 Public', client: '👤 Client', partner: '🤝 Partner', product: '📦 Product', training: '🎓 Training', youtube: '📺 YouTube' };
    modHost.innerHTML = (PP._indModules || []).length
      ? PP._indModules.map((m, i) =>
          `<span class="pp-chip">${esc(MOD_LABELS[m] || m)}<button type="button" onclick="PP._indModules.splice(${i},1); PP.renderIndModalLists();">×</button></span>`
        ).join('')
      : '<span style="font-size:.75rem;color:var(--text-light);">No modules added.</span>';
  },

  addIndModule() {
    const v = PP.$('ppIndModuleSelect')?.value;
    if (!v) return;
    if (!PP._indModules) PP._indModules = [];
    if (!PP._indModules.includes(v)) { PP._indModules.push(v); PP.renderIndModalLists(); }
  },

  _syncIndListInputs() {
    const modal = document.getElementById('ppIndModal');
    if (!modal) return;
    const inputs = modal.querySelectorAll('input[data-ind-list]');
    for (let i = 0; i < inputs.length; i++) {
      const el = inputs[i];
      const name = el.dataset.indList;
      const idx = Number(el.dataset.indIdx);
      const arr = PP['_' + name];
      if (arr) arr[idx] = el.value;
    }
  },

  saveIndustry() {
    if (!PP.draft) return;
    PP._syncIndListInputs();
    const isNew = !PP._editingIndustryKey;
    const rawKey = (PP.$('ppIndKey')?.value || '').trim().toLowerCase();
    const key = isNew
      ? rawKey.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || ''
      : PP._editingIndustryKey;

    if (!key) { D.toast('Key is required.', 'error'); return; }
    if (isNew && PP.draft.industries[key]) { D.toast('That key already exists.', 'error'); return; }

    const name = PP.$('ppIndName')?.value.trim();
    if (!name) { D.toast('Name is required.', 'error'); return; }

    const payload = {
      em: PP.$('ppIndEmoji')?.value.trim() || '🏭',
      name,
      cat: PP.$('ppIndCat')?.value || '',
      problem: PP.$('ppIndProblem')?.value.trim() || '',
      solutions: (PP._indSolutions || []).map(s => (s || '').trim()).filter(Boolean),
      changes: (PP._indChanges || []).map(s => (s || '').trim()).filter(Boolean),
      modules: (PP._indModules || []).slice()
    };

    if (!PP.draft.industries) PP.draft.industries = {};
    PP.draft.industries[key] = payload;
    PP.markDirty();
    PP.closeIndustryEditor();
    PP.filterIndustries();
    D.toast(isNew ? 'Sub-industry created.' : 'Sub-industry updated.', 'success');
  },

  deleteIndustry(key) {
    if (!PP.draft) return;
    const doDelete = () => {
      delete PP.draft.industries[key];
      PP.markDirty();
      if (PP._editingIndustryKey === key) PP.closeIndustryEditor();
      PP.filterIndustries();
      D.toast('Deleted.', 'info');
    };
    if (typeof window.vioraConfirm === 'function') {
      window.vioraConfirm(`Delete sub-industry "${key}"?`, { title: 'Delete', confirmLabel: 'Delete', confirmClass: 'btn-danger' })
        .then(ok => { if (ok) doDelete(); });
    } else if (confirm(`Delete sub-industry "${key}"?`)) {
      doDelete();
    }
  },

  deleteIndFromModal() {
    if (!PP._editingIndustryKey) return;
    const k = PP._editingIndustryKey;
    const doDelete = () => {
      delete PP.draft.industries[k];
      PP.markDirty();
      PP.closeIndustryEditor();
      PP.filterIndustries();
      D.toast('Deleted.', 'info');
    };
    if (typeof window.vioraConfirm === 'function') {
      window.vioraConfirm(`Delete sub-industry "${k}"?`, { title: 'Delete', confirmLabel: 'Delete', confirmClass: 'btn-danger' })
        .then(ok => { if (ok) doDelete(); });
    } else if (confirm(`Delete sub-industry "${k}"?`)) {
      doDelete();
    }
  },

  markDirty() {
    PP._dirty = true;
    PP.setSync('dirty', 'Unsaved changes');
  },

  hasUnsavedChanges() { return !!PP._dirty; }
};

/* ═══════════════════════════════════════════════════════════════
   EVENT BINDING
   ═══════════════════════════════════════════════════════════════ */
export function bindPPEvents() {
  const bind = (id, evt, fn) => {
    const el = PP.$(id);
    if (!el || el.dataset.ppBound === '1') return;
    el.addEventListener(evt, fn);
    el.dataset.ppBound = '1';
  };
  const bindDebounced = (id, evt, fn, wait) => {
    const el = PP.$(id);
    if (!el || el.dataset.ppBound === '1') return;
    el.addEventListener(evt, debounce(fn, wait || 120));
    el.dataset.ppBound = '1';
  };
  const bindAll = (selector, evt, fn) => {
    document.querySelectorAll(selector).forEach(el => {
      if (el.dataset.ppBound === '1') return;
      el.addEventListener(evt, fn);
      el.dataset.ppBound = '1';
    });
  };

  bindAll('[data-pp-toggle]', 'click', (e) => PP.togglePanel(e.currentTarget.dataset.ppToggle));
  bind('ppSaveBtn', 'click', () => PP.save());
  bind('ppPreviewBtn', 'click', async () => {
    if (PP.saving || !PP.draft) { D.toast('Nothing to preview yet.', 'error'); return; }
    const ok = await PP.save();
    if (ok) window.open('/v0.html', '_blank');
  });
  bind('ppResetBtn', 'click', () => PP.reset());
  bind('ppExportBtn', 'click', () => PP.exportJson());
  bind('ppImportBtn', 'click', () => PP.$('ppImportFile')?.click());
  bind('ppImportFile', 'change', (e) => {
    const f = e.target.files?.[0];
    if (f) PP.importJson(f);
    e.target.value = '';
  });

  const heroDebounce = debounce(() => { PP.readHero(); PP.markDirty(); }, 120);
  ['HeroBrand','HeroTagline','HeroTitle','HeroHeading','HeroSubheading','HeroSmall','HeroRightTagline'].forEach(id => {
    bind('pp' + id, 'input', heroDebounce);
  });

  const coreDebounce = debounce(() => { PP.readCore(); PP.markDirty(); }, 120);
  ['CoreIcon','CoreTitle','CoreTags'].forEach(id => {
    bind('pp' + id, 'input', coreDebounce);
  });

  const capHeadDebounce = debounce(() => {
    if (!PP.draft) return;
    PP.draft.capabilities = PP.draft.capabilities || {};
    PP.draft.capabilities.eyebrow = PP.$('ppCapEyebrow')?.value || '';
    PP.draft.capabilities.title = PP.$('ppCapTitle')?.value || '';
    PP.draft.capabilities.subtitle = PP.$('ppCapSubtitle')?.value || '';
    PP.markDirty();
  }, 120);
  ['CapEyebrow','CapTitle','CapSubtitle'].forEach(id => bind('pp' + id, 'input', capHeadDebounce));

  const cmpFields = [
    ['ppCmpEyebrow', 'comparison.eyebrow'],
    ['ppCmpTitle', 'comparison.title'],
    ['ppCmpSubtitle', 'comparison.subtitle'],
    ['ppCmpWithoutBadge', 'comparison.without.badge'],
    ['ppCmpWithoutHeading', 'comparison.without.heading'],
    ['ppCmpWithoutLead', 'comparison.without.lead'],
    ['ppCmpWithBadge', 'comparison.with.badge'],
    ['ppCmpWithHeading', 'comparison.with.heading'],
    ['ppCmpWithLead', 'comparison.with.lead']
  ];
  cmpFields.forEach(([id, path]) => {
    const keys = path.split('.');
    const d = debounce((value) => {
      if (!PP.draft) return;
      let t = PP.draft;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!t[keys[i]] || typeof t[keys[i]] !== 'object') t[keys[i]] = {};
        t = t[keys[i]];
      }
      t[keys[keys.length - 1]] = value;
      PP.markDirty();
    }, 120);
    bind(id, 'input', (e) => d(e.target.value));
  });

  bindDebounced('ppStepEyebrow', 'input', (e) => { if (!PP.draft) return; PP.draft.steps = PP.draft.steps || {}; PP.draft.steps.eyebrow = e.target.value; PP.markDirty(); });
  bindDebounced('ppStepTitle',   'input', (e) => { if (!PP.draft) return; PP.draft.steps = PP.draft.steps || {}; PP.draft.steps.title = e.target.value; PP.markDirty(); });
  bindDebounced('ppCtaTitle',    'input', (e) => { if (!PP.draft) return; PP.draft.cta = PP.draft.cta || {}; PP.draft.cta.title = e.target.value; PP.markDirty(); });
  bindDebounced('ppCtaBody',     'input', (e) => { if (!PP.draft) return; PP.draft.cta = PP.draft.cta || {}; PP.draft.cta.body = e.target.value; PP.markDirty(); });
  bindDebounced('ppFaqEyebrow',  'input', (e) => { if (!PP.draft) return; PP.draft.faq = PP.draft.faq || {}; PP.draft.faq.eyebrow = e.target.value; PP.markDirty(); });
  bindDebounced('ppFaqTitle',    'input', (e) => { if (!PP.draft) return; PP.draft.faq = PP.draft.faq || {}; PP.draft.faq.title = e.target.value; PP.markDirty(); });
  bindDebounced('ppFooterMotto', 'input', (e) => { if (!PP.draft) return; PP.draft.footer = PP.draft.footer || {}; PP.draft.footer.motto = e.target.value; PP.markDirty(); });
  bindDebounced('ppFooterSub',   'input', (e) => { if (!PP.draft) return; PP.draft.footer = PP.draft.footer || {}; PP.draft.footer.sub = e.target.value; PP.markDirty(); });
  bindDebounced('ppFooterLeft',  'input', (e) => { if (!PP.draft) return; PP.draft.footer = PP.draft.footer || {}; PP.draft.footer.left = e.target.value; PP.markDirty(); });
  bindDebounced('ppFooterRight', 'input', (e) => { if (!PP.draft) return; PP.draft.footer = PP.draft.footer || {}; PP.draft.footer.right = e.target.value; PP.markDirty(); });

  bind('ppAddBannerBtn', 'click', () => PP.addNew('bannerCards', { id: 'card-' + uidShort(), title: 'New Card', subtext: '', emoji: '', icon: 'fa-solid fa-cube', color: '#00d4ff', position: 'pos-mid-left', features: [] }));
  bind('ppAddCapBtn', 'click', () => PP.addNew('capabilities.items', { icon: '⭐', title: 'New Capability', body: '' }));
  bind('ppAddCmpWithoutBtn', 'click', () => PP.addNew('comparison.without.points', { title: 'New Point', body: '' }));
  bind('ppAddCmpWithBtn', 'click', () => PP.addNew('comparison.with.points', { title: 'New Point', body: '' }));
  bind('ppAddCmpKpiBtn', 'click', () => PP.addNew('comparison.kpis', { val: '—', lbl: 'New KPI' }));
  bind('ppAddStepBtn', 'click', () => PP.addNew('steps.items', { title: 'New Step', body: '' }));
  bind('ppAddCtaActionBtn', 'click', () => PP.addNew('cta.actions', { type: 'link', label: 'New Action', href: '' }));
  bind('ppAddFaqBtn', 'click', () => PP.addNew('faq.items', { q: 'New Question?', a: '' }));
  bind('ppAddFooterServiceBtn', 'click', () => PP.addNew('footer.services', { icon: 'fa-solid fa-star', label: 'New Service' }));
  bind('ppAddCatBtn', 'click', () => PP.addNew('categories', { key: 'cat-' + uidShort(), em: '📁', name: 'New Category' }));
  bind('ppAddIndBtn', 'click', () => PP.openIndustryEditor(null));

  bind('ppIndSearch', 'input', () => PP.filterIndustries());
  bind('ppIndFilterCat', 'change', () => PP.filterIndustries());
  bind('ppIndClear', 'click', () => {
    const s = PP.$('ppIndSearch'); if (s) s.value = '';
    const f = PP.$('ppIndFilterCat'); if (f) f.value = 'all';
    PP.filterIndustries();
  });

  bind('ppIndModal', 'click', (e) => { if (e.target === PP.$('ppIndModal')) PP.closeIndustryEditor(); });
  bind('ppIndCancelBtn', 'click', () => PP.closeIndustryEditor());
  bind('ppIndSaveBtn', 'click', () => PP.saveIndustry());
  bind('ppIndDeleteBtn', 'click', () => PP.deleteIndFromModal());
  bind('ppIndAddModuleBtn', 'click', () => PP.addIndModule());
  bind('ppAddIndSolutionBtn', 'click', () => {
    PP._syncIndListInputs();
    PP._indSolutions = PP._indSolutions || [];
    PP._indSolutions.push('');
    PP.renderIndModalLists();
  });
  bind('ppAddIndChangeBtn', 'click', () => {
    PP._syncIndListInputs();
    PP._indChanges = PP._indChanges || [];
    PP._indChanges.push('');
    PP.renderIndModalLists();
  });

  if (!window._ppBeforeUnloadBound) {
    window._ppBeforeUnloadBound = true;
    window.addEventListener('beforeunload', (e) => {
      if (PP.hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }
}

export default PP;

if (typeof window !== 'undefined') {
  window.PP = PP;
}
