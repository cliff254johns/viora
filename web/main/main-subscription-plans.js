/* ═══════════════════════════════════════════════════════════════
   VIORA — SUBSCRIPTION PLANS (Admin) v4.1
   Path: /main/main-subscription-plans.js

   v4.1 changes:
     • KPI strip (6 cards) at top of tab — pending requests,
       approved 7d, rejected, active plans, active subs, est. MRR.
     • Every listener now writes into `state.data` so the sidebar
       badge (`computeCounterValue('subscriptionRequestsPending')`)
       actually sees the pending count instead of always reading 0.
     • Each listener calls invalidateCountersFor + updateSidebarCounters
       so the badge updates in real time, not on next page reload.
     • New `subscribeToSubscriptions()` listener keeps the Active
       Subs and Est. MRR KPIs live.
     • renderKpis() called after approve/reject so numbers reflect
       the change instantly.

   v4.0 changes (per-client unique URLs):
     • product.liveUrl is now a TEMPLATE. Substitutes {clientId},
       {subscriptionId}, {clientEmail}, {clientSlug}, {licenseKey}
       at approval time so every subscription gets its own URL.
     • approveRequest() fetches the client record + product template,
       resolves them, stamps launchUrl + licenseKey + clientSlug on
       the subscription.
     • submitAssign() does the same for admin-assigned subscriptions.
     • Template changes propagate: launchUrlTemplate is stored so the
       client portal can re-resolve when the admin edits the product.
     • All v3.0 safety retained: safePlanSnapshot(), deepClean(),
       modulesForStorage() sentinel, no undefined-in-write.
   ═══════════════════════════════════════════════════════════════ */

let _ctx = null;
let _plansUnsub = null;
let _requestsUnsub = null;
let _productsUnsub = null;
let _subsUnsub = null;

export function initSubscriptionPlans(deps) {
  _ctx = deps || {};
  return { renderSubscriptionPlans, destroySubscriptionPlans };
}

function ctx() { return _ctx || {}; }

const $ = (id) => {
  if (typeof document === 'undefined') return null;
  return document.getElementById(id);
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const fmtKES = (n) => 'KSh ' + (Number.isFinite(Number(n)) ? Number(n) : 0).toLocaleString();

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00');
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
};

const timeAgo = (iso) => {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
};

const toast = (msg, type) => {
  if (typeof ctx().toast === 'function') ctx().toast(msg, type || 'info');
  else console.log('[toast]', type || 'info', msg);
};

/* ═══════════════════════════════════════════════════════════════
   FIREBASE-SAFE SANITISERS
   ═══════════════════════════════════════════════════════════════ */

/** Recursively strip undefined + NaN. Firebase RTDB rejects undefined. */
function deepClean(value, depth = 0) {
  if (depth > 25) return null;
  if (value === undefined) return undefined;
  if (value === null) return null;
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value) ? value : 0;
  if (t === 'string' || t === 'boolean') return value;
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < value.length; i++) {
      const c = deepClean(value[i], depth + 1);
      if (c !== undefined) out.push(c);
    }
    return out;
  }
  if (t === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const c = deepClean(value[k], depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return String(value);
}

/* RTDB drops empty arrays — store a sentinel so `modules: []` survives. */
const MODULES_NONE_SENTINEL = '__none__';

function modulesForStorage(modules) {
  const arr = Array.isArray(modules) ? modules.filter(Boolean) : [];
  return arr.length ? arr.slice() : [MODULES_NONE_SENTINEL];
}

function modulesFromStorage(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(m => m && m !== MODULES_NONE_SENTINEL);
}

function safePlanSnapshot(plan) {
  const p = (plan && typeof plan === 'object') ? plan : {};
  const priceKES      = Number.isFinite(Number(p.priceKES)) ? Number(p.priceKES) : 0;
  const durationDays  = Number.isFinite(Number(p.durationDays)) && Number(p.durationDays) > 0
    ? Number(p.durationDays) : 30;
  const graceHours    = Number.isFinite(Number(p.graceHours)) && Number(p.graceHours) >= 0
    ? Number(p.graceHours) : 72;
  return {
    name:          String(p.name || 'Subscription'),
    priceKES,
    durationDays,
    graceHours,
    icon:          String(p.icon || 'fa-solid fa-cube'),
    modules:       modulesForStorage(p.modules),
    productId:     p.productId ? String(p.productId) : '',
    billingCycle:  p.billingCycle ? String(p.billingCycle) : 'monthly'
  };
}

/* ═══════════════════════════════════════════════════════════════
   LAUNCH URL TEMPLATE + LICENSE KEY GENERATION
   ═══════════════════════════════════════════════════════════════ */

function clientSlug(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'client';
}

function resolveLaunchUrlTemplate(template, ctxData) {
  if (!template || typeof template !== 'string') return null;
  const c = ctxData || {};
  return template
    .replace(/\{clientId\}/g,       encodeURIComponent(String(c.clientId || '')))
    .replace(/\{subscriptionId\}/g, encodeURIComponent(String(c.subscriptionId || '')))
    .replace(/\{clientEmail\}/g,    encodeURIComponent(String(c.clientEmail || '')))
    .replace(/\{clientSlug\}/g,     encodeURIComponent(String(c.clientSlug || 'client')))
    .replace(/\{licenseKey\}/g,     encodeURIComponent(String(c.licenseKey || '')));
}

function generateLicenseKey() {
  const seg = () => Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
  return 'VIORA-' + seg() + '-' + seg() + '-' + Date.now().toString(36).toUpperCase();
}

/* ═══════════════════════════════════════════════════════════════
   MAIN RENDER
   ═══════════════════════════════════════════════════════════════ */
export async function renderSubscriptionPlans() {
  const host = document.getElementById('tab-subscription-plans');
  if (!host) {
    console.warn('[sub-plans] #tab-subscription-plans not found');
    return;
  }

  host.innerHTML = `
    <div class="page-header">
      <div>
        <h1>
          <span class="pillar-icon" style="background:linear-gradient(135deg,#a855f7,#7c3aed);">
            <i class="fa-solid fa-tags"></i>
          </span>
          <span class="highlight">Subscription Plans</span>
        </h1>
        <p class="page-desc">
          Products need a plan before you can share a subscribe link.
          Each product's <strong>Live App URL Template</strong> determines
          the unique URL every subscribed client is sent to.
        </p>
      </div>
      <div class="actions">
        <button class="btn btn-success" id="spAssignBtn">
          <i class="fa-solid fa-user-plus"></i> Assign to Client
        </button>
        <button class="btn btn-primary" id="spNewPlanBtn">
          <i class="fa-solid fa-plus"></i> New Plan
        </button>
      </div>
    </div>

    <div class="kpi-grid" id="spKpiGrid"></div>

    <div id="spPendingRequests"></div>
    <div id="spNeedsPlan"></div>
    <div id="spPlansGrid"></div>
    <div id="spUpcomingExpirations" style="margin-top:24px;"></div>
  `;

  const assignBtn = $('spAssignBtn');
  if (assignBtn) assignBtn.onclick = () => openAssignModal();

  const newBtn = $('spNewPlanBtn');
  if (newBtn) newBtn.onclick = () => openPlanEditor(null);

  await renderKpis();
  await renderPendingRequests();
  await renderProductsNeedingPlan();
  await renderPlansGrid();
  await renderUpcomingExpirations();

  subscribeToPlans();
  subscribeToRequests();
  subscribeToProducts();
  subscribeToSubscriptions();
}

/* ═══════════════════════════════════════════════════════════════
   KPI STRIP — live counts pulled straight from Firebase
   ═══════════════════════════════════════════════════════════════ */
async function renderKpis() {
  const host = $('spKpiGrid');
  if (!host) return;

  const { db, ref, get, state } = ctx();
  if (!db || !ref || !get) return;

  try {
    const [plansSnap, reqSnap, subsSnap] = await Promise.all([
      get(ref(db, 'viora_data/orgs/viora/subscriptionPlans')),
      get(ref(db, 'viora_data/orgs/viora/subscriptionRequests')),
      get(ref(db, 'viora_data/orgs/viora/subscriptions')),
    ]);

    /* ── Plans ── */
    const plansRaw = plansSnap.exists() ? plansSnap.val() : {};
    const plansArr = Object.entries(plansRaw).map(([id, v]) => ({ id, ...v }));
    const totalPlans    = plansArr.length;
    const activePlans   = plansArr.filter(p => p && p.active !== false).length;
    const archivedPlans = totalPlans - activePlans;

    /* ── Requests ── */
    const reqRaw = reqSnap.exists() ? reqSnap.val() : {};
    const reqArr = Object.entries(reqRaw).map(([id, v]) => ({ id, ...v }));
    const pendingReq   = reqArr.filter(r => r && r.status === 'pending');
    const weekAgo      = Date.now() - 7 * 86400000;
    const approvedWeek = reqArr.filter(r =>
      r && r.status === 'approved' && r.approvedAt &&
      Date.parse(r.approvedAt) >= weekAgo
    ).length;
    const rejectedReq  = reqArr.filter(r => r && r.status === 'rejected').length;

    /* ── Subscriptions ── */
    const subsRaw = subsSnap.exists() ? subsSnap.val() : {};
    const subsArr = Object.entries(subsRaw).map(([id, v]) => ({ id, ...v }));
    const now = Date.now();
    let activeSubs = 0, inGrace = 0;
    let mrr = 0;

    for (const s of subsArr) {
      if (!s) continue;
      if (s.plan === 'lifetime') { activeSubs++; continue; }
      if (s.status === 'suspended' || s.status === 'cancelled' || s.status === 'pending_payment') continue;

      const endMs = Date.parse(s.endDate || '');
      if (!Number.isFinite(endMs)) continue;
      const graceMs = (Number(s.graceHours) || 72) * 3600000;

      if (now <= endMs) {
        activeSubs++;
        const amt = Number(s.amountKES) || 0;
        if (s.plan === 'monthly')        mrr += amt;
        else if (s.plan === 'quarterly') mrr += amt / 3;
        else if (s.plan === 'yearly')    mrr += amt / 12;
      } else if (now <= endMs + graceMs) {
        inGrace++;
      }
    }

    /* ── Sync into state so sidebar counters stay accurate ── */
    if (state) {
      if (!state.data) state.data = {};
      state.data.subscriptionRequests = reqArr.reduce((acc, r) => { acc[r.id] = r; return acc; }, {});
      state.data.subscriptions       = subsRaw;
      state.data.subscriptionPlans   = plansRaw;
      try {
        if (typeof window.invalidateCountersFor === 'function') {
          window.invalidateCountersFor('subscriptionRequests');
          window.invalidateCountersFor('subscriptions');
          window.invalidateCountersFor('subscriptionPlans');
        }
        if (typeof window.updateSidebarCounters === 'function') {
          window.updateSidebarCounters(true);
        }
      } catch (_) {}
    }

    const card = (icon, color, number, label, sub, danger) => `
      <div class="stat-card" style="${danger ? 'border-left:4px solid var(--accent-gold);' : ''}">
        <div class="stat-icon" style="background:${color}22;color:${color};">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div class="number" style="${danger ? 'color:var(--accent-gold);' : ''}">${number}</div>
        <div class="label">${label}</div>
        ${sub ? `<div class="kpi-sub" style="font-size:.68rem;color:var(--text-light);margin-top:2px;">${sub}</div>` : ''}
      </div>
    `;

    host.innerHTML = `
      ${card('fa-bell',         '#ffc857', pendingReq.length, 'Pending Requests',
             pendingReq.length ? 'Needs review' : 'All clear', pendingReq.length > 0)}
      ${card('fa-check-circle', '#22e6a0', approvedWeek,     'Approved (7d)')}
      ${card('fa-xmark-circle', '#ff5c7c', rejectedReq,      'Rejected')}
      ${card('fa-tags',         '#a855f7', activePlans,      'Active Plans',
             archivedPlans ? `${archivedPlans} archived` : '')}
      ${card('fa-key',          '#00d4ff', activeSubs,       'Active Subs',
             inGrace ? `${inGrace} in grace` : '')}
      ${card('fa-coins',        '#10b981', 'KSh ' + Math.round(mrr).toLocaleString(), 'Est. MRR')}
    `;
  } catch (e) {
    console.warn('[sub-plans] renderKpis failed:', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   SUBSCRIPTIONS
   ═══════════════════════════════════════════════════════════════ */
function subscribeToPlans() {
  if (_plansUnsub) return;
  const { db, ref, onValue, state } = ctx();
  if (!db || !ref || !onValue) return;
  const path = `viora_data/orgs/viora/subscriptionPlans`;
  try {
    _plansUnsub = onValue(ref(db, path), (snap) => {
      if (state) {
        if (!state.data) state.data = {};
        state.data.subscriptionPlans = snap.exists() ? snap.val() : {};
        try {
          if (typeof window.invalidateCountersFor === 'function') {
            window.invalidateCountersFor('subscriptionPlans');
          }
          if (typeof window.updateSidebarCounters === 'function') {
            window.updateSidebarCounters(true);
          }
        } catch (_) {}
      }
      renderPlansGrid();
      renderProductsNeedingPlan();
      renderUpcomingExpirations();
      renderKpis();
    });
  } catch (e) {
    console.warn('[sub-plans] plans subscribe failed:', e);
  }
}

function subscribeToSubscriptions() {
  if (_subsUnsub) return;
  const { db, ref, onValue, state } = ctx();
  if (!db || !ref || !onValue) return;
  const path = `viora_data/orgs/viora/subscriptions`;
  try {
    _subsUnsub = onValue(ref(db, path), (snap) => {
      if (state) {
        if (!state.data) state.data = {};
        state.data.subscriptions = snap.exists() ? snap.val() : {};
        try {
          if (typeof window.invalidateCountersFor === 'function') {
            window.invalidateCountersFor('subscriptions');
          }
          if (typeof window.updateSidebarCounters === 'function') {
            window.updateSidebarCounters(true);
          }
        } catch (_) {}
      }
      renderKpis();
    });
  } catch (e) {
    console.warn('[sub-plans] subscriptions subscribe failed:', e);
  }
}

function subscribeToRequests() {
  if (_requestsUnsub) return;
  const { db, ref, onValue, state } = ctx();
  if (!db || !ref || !onValue) return;
  const path = `viora_data/orgs/viora/subscriptionRequests`;
  try {
    _requestsUnsub = onValue(ref(db, path), (snap) => {
      if (state) {
        if (!state.data) state.data = {};
        const raw = snap.exists() ? snap.val() : {};
        state.data.subscriptionRequests = Array.isArray(raw)
          ? raw
          : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
        try {
          if (typeof window.invalidateCountersFor === 'function') {
            window.invalidateCountersFor('subscriptionRequests');
          }
          if (typeof window.updateSidebarCounters === 'function') {
            window.updateSidebarCounters(true);
          }
        } catch (_) {}
      }
      renderPendingRequests();
      renderKpis();
    });
  } catch (e) {
    console.warn('[sub-plans] requests subscribe failed:', e);
  }
}

function subscribeToProducts() {
  if (_productsUnsub) return;
  const { db, ref, onValue } = ctx();
  if (!db || !ref || !onValue) return;
  const path = `viora_data/orgs/viora/products`;
  try {
    _productsUnsub = onValue(ref(db, path), () => {
      renderProductsNeedingPlan();
    });
  } catch (e) {
    console.warn('[sub-plans] products subscribe failed:', e);
  }
}

export function destroySubscriptionPlans() {
  if (_plansUnsub)    { try { _plansUnsub();    } catch (e) {} _plansUnsub = null; }
  if (_requestsUnsub) { try { _requestsUnsub(); } catch (e) {} _requestsUnsub = null; }
  if (_productsUnsub) { try { _productsUnsub(); } catch (e) {} _productsUnsub = null; }
  if (_subsUnsub)     { try { _subsUnsub();     } catch (e) {} _subsUnsub = null; }
}

/* ═══════════════════════════════════════════════════════════════
   PRODUCTS WITHOUT A PLAN
   ═══════════════════════════════════════════════════════════════ */
async function renderProductsNeedingPlan() {
  const host = $('spNeedsPlan');
  if (!host) return;
  const { db, ref, get } = ctx();
  if (!db || !ref || !get) return;

  try {
    const [prodSnap, planSnap] = await Promise.all([
      get(ref(db, 'viora_data/orgs/viora/products')),
      get(ref(db, 'viora_data/orgs/viora/subscriptionPlans'))
    ]);

    const products = prodSnap.exists()
      ? Object.values(prodSnap.val()).filter(p => p && (p.status || 'active') === 'active')
      : [];
    const plans = planSnap.exists() ? Object.values(planSnap.val()) : [];

    const productsWithPlan = new Set();
    plans.forEach(p => {
      if (!p) return;
      if (p.productId) productsWithPlan.add(p.productId);
      if (p.id && String(p.id).startsWith('plan-from-')) {
        productsWithPlan.add(String(p.id).replace('plan-from-', ''));
      }
    });

    const missing = products.filter(p => p.id && !productsWithPlan.has(p.id));

    if (!missing.length) {
      host.innerHTML = '';
      return;
    }

    host.innerHTML = `
      <div class="chart-box" style="border-left:4px solid var(--accent-purple);margin-bottom:20px;">
        <h4>
          <i class="fa-solid fa-circle-exclamation"></i>
          Products without a plan (${missing.length})
        </h4>
        <p style="font-size:.82rem;color:var(--text-secondary);margin:8px 0 14px;line-height:1.55;">
          These products cannot be subscribed to yet. Create a plan for each one, then share its link with the client.
        </p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;">
          ${missing.map(p => {
            const priceKES = Number.isFinite(Number(p.priceKES))
              ? Number(p.priceKES)
              : Math.round((Number(p.price) || 0) * 129);
            const hasLiveUrl = !!(p.liveUrl && String(p.liveUrl).trim());
            return `
              <div style="padding:12px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:10px;">
                <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
                  <div style="width:36px;height:36px;border-radius:9px;background:var(--gradient-soft);display:flex;align-items:center;justify-content:center;color:var(--accent-blue);flex-shrink:0;">
                    <i class="${esc(p.icon || 'fa-solid fa-cube')}"></i>
                  </div>
                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:.88rem;line-height:1.25;">${esc(p.name || p.id)}</div>
                    <div style="font-size:.7rem;color:var(--text-secondary);margin-top:2px;">KSh ${priceKES.toLocaleString()}</div>
                    ${hasLiveUrl
                      ? `<div style="font-size:.65rem;color:var(--accent-green);margin-top:2px;">✓ live URL set</div>`
                      : `<div style="font-size:.65rem;color:var(--accent-gold);margin-top:2px;">⚠ no live URL template yet</div>`}
                  </div>
                </div>
                <button class="btn btn-purple btn-sm" style="width:100%;" data-create-plan-from="${esc(p.id)}">
                  <i class="fa-solid fa-plus"></i> Create plan from this product
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    host.querySelectorAll('[data-create-plan-from]').forEach(b => {
      b.onclick = () => createPlanFromProduct(b.dataset.createPlanFrom);
    });
  } catch (e) {
    console.warn('[sub-plans] renderProductsNeedingPlan failed:', e);
    host.innerHTML = '';
  }
}

async function createPlanFromProduct(productId) {
  const { db, ref, get, set } = ctx();
  if (!db || !ref || !get || !set) {
    toast('Firebase not ready.', 'error');
    return;
  }

  try {
    const prodSnap = await get(ref(db, `viora_data/orgs/viora/products/${productId}`));
    if (!prodSnap.exists()) { toast('Product not found.', 'error'); return; }
    const product = prodSnap.val();

    const planId = 'plan-from-' + productId;
    const existingSnap = await get(ref(db, `viora_data/orgs/viora/subscriptionPlans/${planId}`));
    if (existingSnap.exists()) {
      toast('Plan already exists for this product — opening editor.', 'info');
      openPlanEditor(planId);
      return;
    }

    const priceKES = Number.isFinite(Number(product.priceKES))
      ? Number(product.priceKES)
      : Math.round((Number(product.price) || 0) * 129);

    const modules = Array.isArray(product.tags) ? product.tags.slice() : [];
    const now = new Date().toISOString();

    const plan = {
      id: planId,
      name: String(product.name || 'Product') + ' — Monthly',
      description: String(product.description || ('Subscription for ' + (product.name || 'product'))),
      priceKES,
      durationDays: 30,
      graceHours: 72,
      icon: String(product.icon || 'fa-solid fa-cube'),
      modules: modulesForStorage(modules),
      productId: String(productId),
      billingCycle: 'monthly',
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: ctx().state?.operator?.name || 'admin',
      createdFrom: 'product'
    };

    await set(ref(db, `viora_data/orgs/viora/subscriptionPlans/${planId}`), deepClean(plan));
    toast('Plan created. Opening editor so you can customise it.', 'success');

    openPlanEditor(planId);
  } catch (e) {
    console.error('[sub-plans] createPlanFromProduct failed:', e);
    toast('Failed to create plan: ' + e.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   PENDING REQUESTS
   ═══════════════════════════════════════════════════════════════ */
async function renderPendingRequests() {
  const host = $('spPendingRequests');
  if (!host) return;
  const { db, ref, get } = ctx();
  if (!db || !ref || !get) return;

  try {
    const snap = await get(ref(db, 'viora_data/orgs/viora/subscriptionRequests'));
    const all = snap.exists() ? Object.values(snap.val()) : [];
    const pending = all
      .filter((r) => r && r.status === 'pending')
      .sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));

    if (!pending.length) {
      host.innerHTML = '';
      return;
    }

    host.innerHTML = `
      <div class="chart-box" style="border-left:4px solid var(--accent-gold);margin-bottom:20px;">
        <h4>
          <i class="fa-solid fa-bell"></i>
          Pending Requests
          <span class="badge badge-pending">${pending.length}</span>
        </h4>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;">
          ${pending.map((r) => {
            const isRenewal = r.kind === 'renewal';
            const kindBadge = isRenewal
              ? '<span class="badge badge-pending" style="font-size:.6rem;">RENEWAL</span>'
              : '<span class="badge badge-sent" style="font-size:.6rem;">NEW</span>';
            return `
            <div style="padding:14px;background:var(--bg-input);border-radius:12px;border:1px solid var(--border-color);">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:700;font-size:.95rem;">
                    ${esc(r.clientName || r.clientEmail)}
                    ${kindBadge}
                  </div>
                  <div style="font-size:.75rem;color:var(--text-secondary);margin-top:2px;">
                    ${esc(r.clientEmail || '')} · ${esc(r.clientPhone || 'no phone')} · ${timeAgo(r.requestedAt)}
                  </div>
                  <div style="font-size:.75rem;color:var(--text-secondary);margin-top:4px;">
                    <i class="fa-solid fa-tag"></i> Plan: <strong>${esc(r.planId)}</strong>
                  </div>
                  ${r.notes ? `<div style="font-size:.78rem;color:var(--text-secondary);margin-top:6px;font-style:italic;">"${esc(r.notes)}"</div>` : ''}
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button class="btn btn-success btn-sm" data-approve="${esc(r.id)}">
                    <i class="fa-solid fa-check"></i> Approve
                  </button>
                  <button class="btn btn-danger btn-sm" data-reject="${esc(r.id)}">
                    <i class="fa-solid fa-xmark"></i> Reject
                  </button>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;

    host.querySelectorAll('[data-approve]').forEach((b) => {
      b.onclick = () => approveRequest(b.dataset.approve);
    });
    host.querySelectorAll('[data-reject]').forEach((b) => {
      b.onclick = () => rejectRequest(b.dataset.reject);
    });
  } catch (e) {
    console.warn('[sub-plans] renderPendingRequests failed:', e);
    host.innerHTML = '';
  }
}

async function approveRequest(requestId) {
  const { db, ref, get, set, update } = ctx();
  if (!db || !ref || !get || !set || !update) {
    toast('Firebase not ready.', 'error');
    return;
  }

  try {
    const snap = await get(ref(db, `viora_data/orgs/viora/subscriptionRequests/${requestId}`));
    if (!snap.exists()) { toast('Request not found.', 'error'); return; }
    const req = snap.val();

    /* Fetch the plan — three-layer fallback */
    let plan = null;
    try {
      const planSnap = await get(ref(db, `viora_data/orgs/viora/subscriptionPlans/${req.planId}`));
      if (planSnap.exists()) plan = planSnap.val();
    } catch (e) {
      console.warn('[sub-plans] plan fetch failed, using fallback', e);
    }

    if (!plan && req.planSnapshot && typeof req.planSnapshot === 'object') {
      console.info('[sub-plans] plan missing — using request snapshot for', req.planId);
      plan = req.planSnapshot;
    }

    if (!plan) {
      plan = {
        name: req.planId || 'Subscription',
        priceKES: 0,
        durationDays: 30,
        graceHours: 72,
        icon: 'fa-solid fa-cube',
        modules: [],
        productId: req.productId || req.planId || '',
        billingCycle: 'monthly'
      };
    }

    /* ═══════════════════════════════════════════════════════════
       RENEWAL: extend the existing subscription, don't create a new one
       ═══════════════════════════════════════════════════════════ */
    if (req.kind === 'renewal' && req.subscriptionId) {
      const existingSnap = await get(ref(db, `viora_data/orgs/viora/subscriptions/${req.subscriptionId}`));
      if (!existingSnap.exists()) {
        toast('Subscription not found for renewal.', 'error');
        return;
      }
      const existing = existingSnap.val();

      const dur = Number.isFinite(Number(plan.durationDays)) && Number(plan.durationDays) > 0
        ? Number(plan.durationDays) : 30;

      const currentEnd = Date.parse(existing.endDate || '');
      const baseMs = Math.max(Date.now(), Number.isFinite(currentEnd) ? currentEnd : 0);
      const newEnd = new Date(baseMs + dur * 86400000).toISOString();

      await update(ref(db, `viora_data/orgs/viora/subscriptions/${req.subscriptionId}`), {
        endDate: newEnd,
        status: 'active',
        graceHours: Number.isFinite(Number(plan.graceHours)) ? Number(plan.graceHours) : 72,
        modules: modulesForStorage(modulesFromStorage(plan.modules)),
        amountKES: Number.isFinite(Number(plan.priceKES)) ? Number(plan.priceKES) : (existing.amountKES || 0),
        renewalCount: (Number(existing.renewalCount) || 0) + 1,
        lastRenewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: ctx().state?.operator?.name || 'admin',
        _rev: 'rev-' + Date.now().toString(36)
      });

      await update(ref(db, `viora_data/orgs/viora/subscriptionRequests/${requestId}`), {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: ctx().state?.operator?.name || 'admin'
      });

      try {
        const notifId = 'notif-' + Date.now().toString(36);
        await set(ref(db, `viora_data/orgs/viora/notifications/${notifId}`), {
          id: notifId,
          title: '✅ Renewal approved',
          body: `${plan.name || 'Subscription'} renewed until ${new Date(newEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
          icon: 'fa-rotate',
          level: 'success',
          url: '/client.html',
          source: 'subscription-renewal-approved',
          ts: new Date().toISOString(),
          read: false
        });
      } catch (e) { /* non-fatal */ }

      toast(`Renewal approved — ${req.clientName || req.clientEmail} extended to ${new Date(newEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, 'success');
      await renderPendingRequests();
      await renderUpcomingExpirations();
      await renderProductsNeedingPlan();
      await renderKpis();
      return;
    }

    /* ═══════════════════════════════════════════════════════════
       NEW SUBSCRIPTION — resolve the product template per-client
       ═══════════════════════════════════════════════════════════ */

    /* 1. Fetch the product's liveUrl TEMPLATE */
    let liveUrlTemplate = null;
    const productIdForLookup = plan.productId || req.productId || req.planId || '';
    if (productIdForLookup) {
      try {
        const prodSnap = await get(ref(db, `viora_data/orgs/viora/products/${productIdForLookup}`));
        if (prodSnap.exists()) {
          const prod = prodSnap.val();
          if (prod && typeof prod.liveUrl === 'string' && prod.liveUrl.trim()) {
            liveUrlTemplate = prod.liveUrl.trim();
          }
        }
      } catch (e) {
        console.warn('[sub-plans] liveUrl lookup failed for', productIdForLookup, e);
      }
    }

    /* 2. Fetch the client record so {clientEmail} / {clientSlug} work */
    let clientRecord = null;
    if (req.clientId) {
      try {
        const cSnap = await get(ref(db, `viora_data/orgs/viora/entities/${req.clientId}`));
        if (cSnap.exists()) clientRecord = cSnap.val();
      } catch (e) {
        console.warn('[sub-plans] client lookup failed for', req.clientId, e);
      }
    }

    /* 3. Generate the subId + license key, then resolve the template */
    const subId = 'sub-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const licenseKey = generateLicenseKey();
    const slug = clientSlug(req.clientName || clientRecord?.name || '');

    const launchUrl = liveUrlTemplate
      ? resolveLaunchUrlTemplate(liveUrlTemplate, {
          clientId:       req.clientId || '',
          subscriptionId: subId,
          clientEmail:    req.clientEmail || clientRecord?.email || '',
          clientSlug:     slug,
          licenseKey,
        })
      : null;

    const startDate = new Date().toISOString();
    const durationDays = Number.isFinite(Number(plan.durationDays)) && Number(plan.durationDays) > 0
      ? Number(plan.durationDays) : 30;

    const isLifetime = plan.billingCycle === 'lifetime' || plan.plan === 'lifetime';
    const endDate = isLifetime
      ? null
      : new Date(Date.now() + durationDays * 86400000).toISOString();

     const planModules = modulesFromStorage(plan.modules);

    /* Store extensionDays so finance.js can compute the correct endDate
       regardless of which code path created the invoice. */
    const _invoiceExtensionDays = Number(plan.durationDays) || 30;

    const subscription = {
      id: subId,
      clientId: req.clientId || '',
      clientName: req.clientName || clientRecord?.name || '',
      clientEmail: req.clientEmail || clientRecord?.email || '',
      clientSlug: slug,
      productId: plan.productId || req.planId || req.productId || '',
      productName: plan.name || 'Subscription',
      productIcon: plan.icon || 'fa-solid fa-cube',

      /* ── Unique per-client URL ── */
      launchUrl,
      launchUrlTemplate: liveUrlTemplate,
      licenseKey,

      plan: plan.billingCycle || 'monthly',
      status: 'active',
      startDate,
      endDate,
      graceHours: Number.isFinite(Number(plan.graceHours)) ? Number(plan.graceHours) : 72,
      modules: modulesForStorage(planModules),
      amountKES: Number.isFinite(Number(plan.priceKES)) ? Number(plan.priceKES) : 0,
      billingCycle: plan.billingCycle || 'monthly',
      autoRenew: false,
      notes: 'Auto-created from approved request',
      renewalCount: 0,
      paymentIds: [],
      createdAt: startDate,
      createdBy: ctx().state?.operator?.name || 'admin',
      updatedAt: startDate,
      _rev: 'rev-' + Date.now().toString(36),
      _fromRequestId: requestId,
      _planSnapshot: safePlanSnapshot(plan)
    };

    await set(ref(db, `viora_data/orgs/viora/subscriptions/${subId}`), deepClean(subscription));

    await update(ref(db, `viora_data/orgs/viora/subscriptionRequests/${requestId}`), {
      status: 'approved',
      subscriptionId: subId,
      approvedAt: new Date().toISOString(),
      approvedBy: ctx().state?.operator?.name || 'admin'
    });

    try {
      const notifId = 'notif-' + Date.now().toString(36);
      await set(ref(db, `viora_data/orgs/viora/notifications/${notifId}`), {
        id: notifId,
        title: '🎉 Subscription approved',
        body: String(plan.name || 'Your subscription') + ' is now active on your account',
        icon: 'fa-key',
        level: 'success',
        url: '/client.html',
        source: 'subscription-approved',
        ts: new Date().toISOString(),
        read: false
      });
    } catch (e) {
      console.warn('[sub-plans] notification write failed:', e);
    }

    toast(`Subscription approved for ${req.clientName || req.clientEmail || 'client'}`, 'success');

    await renderPendingRequests();
    await renderUpcomingExpirations();
    await renderProductsNeedingPlan();
    await renderKpis();
  } catch (e) {
    console.error('[sub-plans] approve failed:', e);
    toast('Approve failed: ' + (e.message || 'unknown error'), 'error');
  }
}

async function rejectRequest(requestId) {
  const { db, ref, update } = ctx();
  if (!db || !ref || !update) { toast('Firebase not ready.', 'error'); return; }
  if (!confirm('Reject this subscription request? The client will be notified.')) return;

  try {
    await update(ref(db, `viora_data/orgs/viora/subscriptionRequests/${requestId}`), {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: ctx().state?.operator?.name || 'admin'
    });
    toast('Request rejected.', 'info');
    await renderPendingRequests();
    await renderKpis();
  } catch (e) {
    toast('Reject failed: ' + (e.message || 'unknown'), 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   PLANS GRID
   ═══════════════════════════════════════════════════════════════ */
async function renderPlansGrid() {
  const host = $('spPlansGrid');
  if (!host) return;
  const { db, ref, get } = ctx();
  if (!db || !ref || !get) return;

  try {
    const snap = await get(ref(db, 'viora_data/orgs/viora/subscriptionPlans'));
    const all = snap.exists() ? Object.values(snap.val()).filter(Boolean) : [];
    const active = all.filter((p) => p.active !== false);
    const archived = all.filter((p) => p.active === false);

    if (!active.length && !archived.length) {
      host.innerHTML = `
        <div class="empty-state" style="padding:48px;text-align:center;background:var(--bg-card);border-radius:16px;border:1px solid var(--border-color);">
          <i class="fa-solid fa-tags" style="font-size:2rem;opacity:.4;margin-bottom:10px;display:block;"></i>
          <div style="font-weight:600;margin-bottom:6px;">No plans yet</div>
          <div style="font-size:.85rem;color:var(--text-secondary);margin-bottom:16px;">
            Create a plan from any product above, or add a custom plan with the "New Plan" button.
          </div>
        </div>
      `;
      return;
    }

    host.innerHTML = `
      <h3 style="margin:20px 0 12px;font-family:'Space Grotesk';font-size:1.05rem;">
        Active Plans (${active.length})
      </h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">
        ${active.map((p) => renderPlanCard(p, false)).join('')}
      </div>
      ${archived.length ? `
        <h3 style="margin:24px 0 12px;font-family:'Space Grotesk';font-size:1.05rem;color:var(--text-secondary);">
          Archived (${archived.length})
        </h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">
          ${archived.map((p) => renderPlanCard(p, true)).join('')}
        </div>
      ` : ''}
    `;

    host.querySelectorAll('[data-edit-plan]').forEach((b) => {
      b.onclick = () => openPlanEditor(b.dataset.editPlan);
    });
    host.querySelectorAll('[data-archive-plan]').forEach((b) => {
      b.onclick = () => archivePlan(b.dataset.archivePlan, true);
    });
    host.querySelectorAll('[data-unarchive-plan]').forEach((b) => {
      b.onclick = () => archivePlan(b.dataset.unarchivePlan, false);
    });
    host.querySelectorAll('[data-copy-plan-link]').forEach((b) => {
      b.onclick = () => copyPlanLink(b.dataset.copyPlanLink, b);
    });
    host.querySelectorAll('[data-delete-plan]').forEach((b) => {
      b.onclick = () => deletePlan(b.dataset.deletePlan);
    });
  } catch (e) {
    console.warn('[sub-plans] renderPlansGrid failed:', e);
  }
}

function renderPlanCard(plan, isArchived) {
  if (!plan) return '';
  const modules = modulesFromStorage(plan.modules);
  const price = Number.isFinite(Number(plan.priceKES)) ? Number(plan.priceKES) : 0;
  const duration = Number.isFinite(Number(plan.durationDays)) ? Number(plan.durationDays) : 30;
  const grace = Number.isFinite(Number(plan.graceHours)) ? Number(plan.graceHours) : 72;

  const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : 'https://viora.co.ke';
  const shareLink = `${origin}/client.html?sub=${encodeURIComponent(plan.id || '')}`;

  return `
    <div class="chart-box" style="margin:0;${isArchived ? 'opacity:.65;' : ''}">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;">
        <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,rgba(168,85,247,.18),rgba(124,58,237,.18));display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:var(--accent-purple);flex-shrink:0;">
          <i class="${esc(plan.icon || 'fa-solid fa-cube')}"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:1rem;">${esc(plan.name || 'Untitled')}</div>
          <div style="font-size:.72rem;color:var(--text-secondary);margin-top:2px;font-family:monospace;">${esc(plan.id)}</div>
        </div>
        ${isArchived ? '<span class="badge badge-gray">Archived</span>' : '<span class="badge badge-paid">Active</span>'}
      </div>

      ${plan.description ? `<div style="font-size:.82rem;color:var(--text-secondary);line-height:1.5;margin-bottom:12px;">${esc(plan.description)}</div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;padding:12px;background:var(--bg-input);border-radius:10px;">
        <div>
          <div style="font-size:.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700;">Price</div>
          <div style="font-weight:800;font-size:1rem;">${fmtKES(price)}</div>
        </div>
        <div>
          <div style="font-size:.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700;">Duration</div>
          <div style="font-weight:700;font-size:.92rem;">${duration} days</div>
        </div>
        <div>
          <div style="font-size:.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700;">Grace</div>
          <div style="font-weight:700;font-size:.92rem;">${grace}h</div>
        </div>
        <div>
          <div style="font-size:.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700;">Modules</div>
          <div style="font-weight:700;font-size:.92rem;">${modules.length}</div>
        </div>
      </div>

      ${modules.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:14px;">
          ${modules.slice(0, 6).map((m) => `<span class="badge badge-purple" style="font-size:.55rem;">${esc(m)}</span>`).join('')}
          ${modules.length > 6 ? `<span style="font-size:.7rem;color:var(--text-secondary);">+${modules.length - 6} more</span>` : ''}
        </div>` : ''}

      ${!isArchived ? `
        <div style="margin-bottom:10px;padding:10px 12px;background:rgba(0,212,255,.06);border-radius:8px;border:1px dashed rgba(0,212,255,.3);">
          <div style="font-size:.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700;margin-bottom:4px;">
            <i class="fa-solid fa-link"></i> Share this link with the client
          </div>
          <div style="font-size:.72rem;font-family:monospace;color:var(--accent-blue);word-break:break-all;">${esc(shareLink)}</div>
        </div>
      ` : ''}

      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${!isArchived ? `
          <button class="btn btn-primary btn-sm" data-copy-plan-link="${esc(plan.id)}" title="Copy share link">
            <i class="fa-solid fa-copy"></i> Copy Link
          </button>
          <button class="btn btn-outline btn-sm" data-edit-plan="${esc(plan.id)}">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button class="btn btn-outline btn-sm" data-archive-plan="${esc(plan.id)}" title="Archive">
            <i class="fa-solid fa-box-archive"></i>
          </button>
        ` : `
          <button class="btn btn-success btn-sm" data-unarchive-plan="${esc(plan.id)}">
            <i class="fa-solid fa-rotate-left"></i> Restore
          </button>
          <button class="btn btn-danger btn-sm" data-delete-plan="${esc(plan.id)}">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        `}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   PLAN EDITOR
   ═══════════════════════════════════════════════════════════════ */
function openPlanEditor(planId) {
  let modal = document.getElementById('subscriptionPlanEditorModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'subscriptionPlanEditorModal';
    modal.innerHTML = `
      <div class="modal large">
        <h2>
          <span class="modal-icon"><i class="fa-solid fa-tags"></i></span>
          <span id="spEditorTitle">New Plan</span>
        </h2>
        <input type="hidden" id="spPlanId" />
        <label>Plan Name *</label>
        <input id="spPlanName" placeholder="e.g. Business Suite — Monthly" />
        <label>Description</label>
        <textarea id="spPlanDesc" rows="2" placeholder="What's included, who's it for"></textarea>
        <div class="form-row">
          <div>
            <label>Price (KES) *</label>
            <input id="spPlanPrice" type="number" min="0" value="5000" />
          </div>
          <div>
            <label>Duration (days) *</label>
            <input id="spPlanDuration" type="number" min="1" value="30" />
          </div>
        </div>
        <div class="form-row">
          <div>
            <label>Grace period (hours)</label>
            <input id="spPlanGrace" type="number" min="0" value="72" />
          </div>
          <div>
            <label>Icon (FontAwesome class)</label>
            <input id="spPlanIcon" value="fa-solid fa-cube" />
          </div>
        </div>
        <label>Unlocked Modules (comma-separated)</label>
        <input id="spPlanModules" placeholder="e.g. pos, inventory, crm" />
        <label>Linked Product ID (from marketplace — optional)</label>
        <input id="spPlanProductId" placeholder="e.g. business-suite" />
        <div class="form-actions" style="margin-top:20px;">
          <button type="button" class="btn btn-outline" data-sp-close>Cancel</button>
          <button type="button" class="btn btn-success" id="spPlanSave">
            <i class="fa-solid fa-check"></i> Save Plan
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal || (e.target.closest && e.target.closest('[data-sp-close]'))) {
        modal.classList.remove('active');
      }
    });

    modal.querySelector('#spPlanSave').addEventListener('click', savePlan);
  }

  const nameEl = document.getElementById('spPlanName');
  const titleEl = document.getElementById('spEditorTitle');
  const idEl = document.getElementById('spPlanId');

  if (planId) {
    const { db, ref, get } = ctx();
    get(ref(db, `viora_data/orgs/viora/subscriptionPlans/${planId}`)).then((snap) => {
      if (!snap.exists()) { toast('Plan not found in database.', 'error'); return; }
      const p = snap.val();

      titleEl.textContent = 'Edit Plan';
      idEl.value = planId;
      document.getElementById('spPlanName').value = p.name || '';
      document.getElementById('spPlanDesc').value = p.description || '';
      document.getElementById('spPlanPrice').value = Number.isFinite(Number(p.priceKES)) ? Number(p.priceKES) : 0;
      document.getElementById('spPlanDuration').value = Number.isFinite(Number(p.durationDays)) ? Number(p.durationDays) : 30;
      document.getElementById('spPlanGrace').value = Number.isFinite(Number(p.graceHours)) ? Number(p.graceHours) : 72;
      document.getElementById('spPlanIcon').value = p.icon || 'fa-solid fa-cube';
      document.getElementById('spPlanModules').value = modulesFromStorage(p.modules).join(', ');
      document.getElementById('spPlanProductId').value = p.productId || '';
    }).catch((e) => {
      console.warn('[sub-plans] plan fetch failed:', e);
      toast('Could not load plan: ' + e.message, 'error');
    });
  } else {
    titleEl.textContent = 'New Plan';
    idEl.value = '';
    document.getElementById('spPlanName').value = '';
    document.getElementById('spPlanDesc').value = '';
    document.getElementById('spPlanPrice').value = 5000;
    document.getElementById('spPlanDuration').value = 30;
    document.getElementById('spPlanGrace').value = 72;
    document.getElementById('spPlanIcon').value = 'fa-solid fa-cube';
    document.getElementById('spPlanModules').value = '';
    document.getElementById('spPlanProductId').value = '';
  }

  modal.classList.add('active');
  setTimeout(() => { if (nameEl) nameEl.focus(); }, 100);
}

async function savePlan() {
  const { db, ref, get, set } = ctx();
  if (!db || !ref || !get || !set) { toast('Firebase not ready.', 'error'); return; }

  const name = (document.getElementById('spPlanName').value || '').trim();
  if (!name) { toast('Plan name is required.', 'error'); return; }

  const price = Number(document.getElementById('spPlanPrice').value) || 0;
  const duration = Math.max(1, Number(document.getElementById('spPlanDuration').value) || 30);
  const grace = Math.max(0, Number(document.getElementById('spPlanGrace').value) || 72);

  const modulesRaw = (document.getElementById('spPlanModules').value || '').trim();
  const modulesArr = modulesRaw
    ? modulesRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const existingId = document.getElementById('spPlanId').value;
  const planId = existingId || ('plan-' + Date.now().toString(36));

  const btn = document.getElementById('spPlanSave');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

  try {
    let existing = null;
    if (existingId) {
      try {
        const snap = await get(ref(db, `viora_data/orgs/viora/subscriptionPlans/${planId}`));
        if (snap.exists()) existing = snap.val();
      } catch (_) {}
    }

    const billingCycle = duration <= 31 ? 'monthly'
      : duration <= 92 ? 'quarterly'
      : duration <= 366 ? 'yearly'
      : 'monthly';

    const payload = {
      id: planId,
      name,
      description: (document.getElementById('spPlanDesc').value || '').trim(),
      priceKES: price,
      durationDays: duration,
      graceHours: grace,
      icon: (document.getElementById('spPlanIcon').value || 'fa-solid fa-cube').trim() || 'fa-solid fa-cube',
      modules: modulesForStorage(modulesArr),
      productId: (document.getElementById('spPlanProductId').value || '').trim() || '',
      billingCycle,
      active: existing ? existing.active !== false : true,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: existing?.createdBy || ctx().state?.operator?.name || 'admin',
      createdFrom: existing?.createdFrom || 'admin'
    };

    await set(ref(db, `viora_data/orgs/viora/subscriptionPlans/${planId}`), deepClean(payload));
    toast(existing ? 'Plan updated.' : 'Plan created.', 'success');

    document.getElementById('subscriptionPlanEditorModal').classList.remove('active');
    await renderPlansGrid();
    await renderProductsNeedingPlan();
    await renderKpis();
  } catch (e) {
    console.error('[sub-plans] savePlan failed:', e);
    toast('Save failed: ' + (e.message || 'unknown'), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function archivePlan(planId, archive) {
  const { db, ref, update } = ctx();
  if (!db || !ref || !update) { toast('Firebase not ready.', 'error'); return; }
  try {
    await update(ref(db, `viora_data/orgs/viora/subscriptionPlans/${planId}`), {
      active: !archive,
      updatedAt: new Date().toISOString()
    });
    toast(archive ? 'Plan archived.' : 'Plan restored.', 'success');
    await renderPlansGrid();
    await renderProductsNeedingPlan();
    await renderKpis();
  } catch (e) {
    toast('Failed: ' + (e.message || 'unknown'), 'error');
  }
}

async function deletePlan(planId) {
  const { db, ref, remove } = ctx();
  if (!db || !ref || !remove) { toast('Firebase not ready.', 'error'); return; }
  if (!confirm('Permanently delete this plan? Existing subscriptions are NOT affected.')) return;
  try {
    await remove(ref(db, `viora_data/orgs/viora/subscriptionPlans/${planId}`));
    toast('Plan deleted.', 'info');
    await renderPlansGrid();
    await renderProductsNeedingPlan();
    await renderKpis();
  } catch (e) {
    toast('Delete failed: ' + (e.message || 'unknown'), 'error');
  }
}

function copyPlanLink(planId, btn) {
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : 'https://viora.co.ke';
  const link = `${origin}/client.html?sub=${encodeURIComponent(planId)}`;

  const done = () => {
    const old = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    setTimeout(() => { btn.innerHTML = old; }, 2000);
    toast('Link copied: ' + link, 'success');
  };

  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (ok) done();
      else prompt('Copy this link and share it with your client:', link);
    } catch (_) {
      prompt('Copy this link and share it with your client:', link);
    }
  };

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(link).then(done).catch(fallback);
  } else {
    fallback();
  }
}

/* ═══════════════════════════════════════════════════════════════
   UPCOMING EXPIRATIONS
   ═══════════════════════════════════════════════════════════════ */
async function renderUpcomingExpirations() {
  const host = $('spUpcomingExpirations');
  if (!host) return;
  const { db, ref, get } = ctx();
  if (!db || !ref || !get) return;

  try {
    const snap = await get(ref(db, 'viora_data/orgs/viora/subscriptions'));
    const all = snap.exists() ? Object.values(snap.val()).filter(Boolean) : [];

    const now = Date.now();
    const upcoming = all
      .filter((s) => {
        if (!s || s.plan === 'lifetime') return false;
        if (s.status === 'cancelled' || s.status === 'suspended') return false;
        if (s.status === 'pending_payment') return false;
        const endMs = Date.parse(s.endDate || '');
        if (!Number.isFinite(endMs)) return false;
        const daysLeft = (endMs - now) / 86400000;
        return daysLeft >= 0 && daysLeft <= 14;
      })
      .sort((a, b) => (a.endDate || '').localeCompare(b.endDate || ''));

    if (!upcoming.length) {
      host.innerHTML = '';
      return;
    }

    host.innerHTML = `
      <div class="chart-box" style="border-left:4px solid var(--accent-gold);">
        <h4>
          <i class="fa-solid fa-hourglass-half"></i>
          Expiring in the next 14 days (${upcoming.length})
        </h4>
        <div class="table-wrapper" style="background:transparent;border:none;box-shadow:none;margin:0;">
          <table style="min-width:auto;">
            <thead>
              <tr>
                <th>Client</th>
                <th>Product</th>
                <th>Plan</th>
                <th>Ends</th>
                <th style="text-align:right;">Days left</th>
                <th style="text-align:right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${upcoming.map((s) => {
                const endMs = Date.parse(s.endDate);
                const daysLeft = Math.max(0, Math.ceil((endMs - now) / 86400000));
                return `<tr>
                  <td><strong>${esc(s.clientName || '—')}</strong></td>
                  <td>${esc(s.productName || s.productId || '—')}</td>
                  <td>${esc(s.plan || '—')}</td>
                  <td>${fmtDate(s.endDate)}</td>
                  <td style="text-align:right;"><span class="badge badge-${daysLeft <= 3 ? 'overdue' : daysLeft <= 7 ? 'pending' : 'sent'}">${daysLeft}d</span></td>
                  <td style="text-align:right;">${fmtKES(s.amountKES || 0)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    console.warn('[sub-plans] renderUpcomingExpirations failed:', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN PROVISIONING — assign a subscription directly
   ═══════════════════════════════════════════════════════════════ */
async function openAssignModal() {
  const { db, ref, get } = ctx();
  if (!db || !ref || !get) { toast('Firebase not ready.', 'error'); return; }

  let clientsSnap, plansSnap, productsSnap;
  try {
    [clientsSnap, plansSnap, productsSnap] = await Promise.all([
      get(ref(db, 'viora_data/orgs/viora/entities')),
      get(ref(db, 'viora_data/orgs/viora/subscriptionPlans')),
      get(ref(db, 'viora_data/orgs/viora/products'))
    ]);
  } catch (e) {
    toast('Failed to load data: ' + e.message, 'error');
    return;
  }

  const allEntities = clientsSnap.exists() ? Object.values(clientsSnap.val()) : [];
  const clients = allEntities
    .filter(e => e && e.type === 'client')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const allPlans = plansSnap.exists() ? Object.values(plansSnap.val()) : [];
  const plans = allPlans
    .filter(p => p && p.active !== false)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const products = productsSnap.exists() ? Object.values(productsSnap.val()) : [];
  const productById = new Map(products.map(p => [p.id, p]));

  if (!clients.length) { toast('No clients yet. Add a client first.', 'error'); return; }
  if (!plans.length)   { toast('No plans yet. Create a plan first.', 'error'); return; }

  let modal = document.getElementById('spAssignModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'spAssignModal';
    modal.innerHTML = `
      <div class="modal large">
        <h2>
          <span class="modal-icon" style="background:linear-gradient(135deg,#22e6a0,#00d4ff);">
            <i class="fa-solid fa-user-plus"></i>
          </span>
          Assign Subscription to Client
        </h2>
        <p style="font-size:.82rem;color:var(--text-secondary);margin-bottom:16px;line-height:1.55;">
          The client will see this subscription in their portal instantly.
          Their <strong>Open App</strong> button points to a URL generated
          from the product's template using their own identifiers.
        </p>

        <label>Client *</label>
        <select id="spAssignClient"></select>

        <label>Plan *</label>
        <select id="spAssignPlan"></select>

        <div id="spAssignPlanPreview" style="padding:14px;background:var(--bg-input);border-radius:12px;margin:12px 0;font-size:.85rem;line-height:1.6;"></div>

        <div class="form-row">
          <div>
            <label>Start Date *</label>
            <input id="spAssignStart" type="date" />
          </div>
          <div>
            <label>Duration Override (days)</label>
            <input id="spAssignDuration" type="number" min="1" placeholder="Leave blank to use plan default" />
          </div>
        </div>

        <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;margin-top:12px;">
          <input type="checkbox" id="spAssignAutoRenew" style="width:auto;" />
          <span>Auto-renew when expired (off = auto-lock on expiry)</span>
        </label>

        <label>Notes (visible to admin only)</label>
        <textarea id="spAssignNotes" rows="2" placeholder="e.g. Paid in cash — receipt #1234"></textarea>

        <div id="spAssignResult" style="margin-top:14px;"></div>

        <div class="form-actions" style="margin-top:16px;">
          <button type="button" class="btn btn-outline" data-sp-assign-close>Cancel</button>
          <button type="button" class="btn btn-success" id="spAssignConfirm">
            <i class="fa-solid fa-check"></i> Create Subscription
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal || (e.target.closest && e.target.closest('[data-sp-assign-close]'))) {
        modal.classList.remove('active');
      }
    });

    const planSel = modal.querySelector('#spAssignPlan');
    planSel.addEventListener('change', () => {
      const p = plans.find(x => x.id === planSel.value);
      const previewEl = modal.querySelector('#spAssignPlanPreview');
      if (!p) { previewEl.innerHTML = ''; return; }

      const priceKES = Number.isFinite(Number(p.priceKES)) ? Number(p.priceKES) : 0;
      const dur = Number.isFinite(Number(p.durationDays)) ? Number(p.durationDays) : 30;
      const grace = Number.isFinite(Number(p.graceHours)) ? Number(p.graceHours) : 72;
      const modules = modulesFromStorage(p.modules);
      const product = p.productId ? productById.get(p.productId) : null;
      const liveTemplate = product && product.liveUrl ? String(product.liveUrl) : '';

      previewEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;padding:3px 0;">
          <span style="color:var(--text-secondary);">Product</span>
          <strong>${esc(product?.name || p.name || '—')}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:3px 0;">
          <span style="color:var(--text-secondary);">Price</span>
          <strong style="color:var(--accent-green);">${fmtKES(priceKES)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:3px 0;">
          <span style="color:var(--text-secondary);">Duration</span>
          <strong>${dur} days</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:3px 0;">
          <span style="color:var(--text-secondary);">Grace period</span>
          <strong>${grace} hours</strong>
        </div>
        ${liveTemplate ? `
          <div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--border-color);">
            <div style="font-size:.7rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.4px;font-weight:700;margin-bottom:4px;">Live URL template</div>
            <div style="font-family:monospace;font-size:.72rem;color:var(--accent-blue);word-break:break-all;">${esc(liveTemplate)}</div>
          </div>
        ` : `
          <div style="margin-top:10px;padding:8px;background:rgba(255,200,87,.08);border-left:3px solid var(--accent-gold);border-radius:6px;font-size:.72rem;color:var(--accent-gold);">
            ⚠ This product has no live URL template set. Client will see "Coming Soon" instead of "Open App".
          </div>
        `}
        ${modules.length ? `
          <div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--border-color);">
            <div style="font-size:.7rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.4px;font-weight:700;margin-bottom:6px;">Included modules (${modules.length})</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
              ${modules.slice(0, 8).map(m => `<span class="badge badge-purple" style="font-size:.55rem;">${esc(m)}</span>`).join('')}
              ${modules.length > 8 ? `<span style="font-size:.7rem;color:var(--text-secondary);">+${modules.length - 8} more</span>` : ''}
            </div>
          </div>
        ` : ''}
        <div style="margin-top:10px;font-size:.75rem;color:var(--text-secondary);">
          On expiry (end + ${grace}h), the client's software will lock unless renewed.
        </div>
      `;
    });

    modal.querySelector('#spAssignConfirm').addEventListener('click', () => submitAssign(modal));
  }

  /* Populate dropdowns */
  const clientSel = modal.querySelector('#spAssignClient');
  clientSel.innerHTML = '<option value="">— Select a client —</option>' +
    clients.map(c => `<option value="${esc(c.id)}">${esc(c.name || c.email || c.id)}${c.email ? ' — ' + esc(c.email) : ''}</option>`).join('');

  const planSel = modal.querySelector('#spAssignPlan');
  planSel.innerHTML = '<option value="">— Select a plan —</option>' +
    plans.map(p => {
      const priceKES = Number.isFinite(Number(p.priceKES)) ? Number(p.priceKES) : 0;
      return `<option value="${esc(p.id)}">${esc(p.name || p.id)} — ${fmtKES(priceKES)}</option>`;
    }).join('');

  const today = new Date().toISOString().slice(0, 10);
  modal.querySelector('#spAssignStart').value = today;
  modal.querySelector('#spAssignDuration').value = '';
  modal.querySelector('#spAssignNotes').value = '';
  modal.querySelector('#spAssignAutoRenew').checked = false;
  modal.querySelector('#spAssignResult').innerHTML = '';
  modal.querySelector('#spAssignPlanPreview').innerHTML = '';

  modal.classList.add('active');
}

async function submitAssign(modal) {
  const { db, ref, get, set } = ctx();
  if (!db || !ref || !get || !set) { toast('Firebase not ready.', 'error'); return; }
  if (!modal) return;

  const clientId = modal.querySelector('#spAssignClient').value;
  const planId = modal.querySelector('#spAssignPlan').value;
  const startDateInput = modal.querySelector('#spAssignStart').value;
  const durationOverride = modal.querySelector('#spAssignDuration').value;
  const autoRenew = modal.querySelector('#spAssignAutoRenew').checked;
  const notes = modal.querySelector('#spAssignNotes').value.trim();

  if (!clientId) { toast('Select a client.', 'error'); return; }
  if (!planId)    { toast('Select a plan.', 'error'); return; }
  if (!startDateInput) { toast('Select a start date.', 'error'); return; }

  const btn = modal.querySelector('#spAssignConfirm');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating…';

  const resultEl = modal.querySelector('#spAssignResult');
  resultEl.innerHTML = '';

  try {
    const [clientSnap, planSnap] = await Promise.all([
      get(ref(db, `viora_data/orgs/viora/entities/${clientId}`)),
      get(ref(db, `viora_data/orgs/viora/subscriptionPlans/${planId}`))
    ]);
    if (!clientSnap.exists()) throw new Error('Client not found');
    if (!planSnap.exists()) throw new Error('Plan not found');

    const client = clientSnap.val();
    const plan = planSnap.val();

    const overrideDays = Number(durationOverride);
    const durationDays = Number.isFinite(overrideDays) && overrideDays > 0
      ? overrideDays
      : (Number.isFinite(Number(plan.durationDays)) && Number(plan.durationDays) > 0
          ? Number(plan.durationDays)
          : 30);

    const startDate = new Date(startDateInput + 'T00:00:00');
    if (isNaN(startDate.getTime())) throw new Error('Invalid start date');

    const isLifetime = plan.billingCycle === 'lifetime' || planId.startsWith('plan-lifetime');
    const endDate = isLifetime
      ? null
      : new Date(startDate.getTime() + durationDays * 86400000).toISOString();

    /* ═══════════════════════════════════════════════════════════
       Resolve the product's liveUrl TEMPLATE for THIS client
       ═══════════════════════════════════════════════════════════ */

    /* 1. Fetch the product template */
    let liveUrlTemplate = null;
    const productIdForLookup = plan.productId || plan.id || planId || '';
    if (productIdForLookup) {
      try {
        const prodSnap = await get(ref(db, `viora_data/orgs/viora/products/${productIdForLookup}`));
        if (prodSnap.exists()) {
          const prod = prodSnap.val();
          if (prod && typeof prod.liveUrl === 'string' && prod.liveUrl.trim()) {
            liveUrlTemplate = prod.liveUrl.trim();
          }
        }
      } catch (e) {
        console.warn('[sub-plans] liveUrl lookup failed for', productIdForLookup, e);
      }
    }

    /* 2. Generate subId + license key + slug, then resolve */
    const subId = 'sub-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const licenseKey = generateLicenseKey();
    const slug = clientSlug(client.name || client.email || '');

    const launchUrl = liveUrlTemplate
      ? resolveLaunchUrlTemplate(liveUrlTemplate, {
          clientId,
          subscriptionId: subId,
          clientEmail:    client.email || '',
          clientSlug:     slug,
          licenseKey,
        })
      : null;

    const now = new Date().toISOString();
    const planModules = modulesFromStorage(plan.modules);

    const subscription = {
      id: subId,
      clientId,
      clientName: client.name || client.email || '',
      clientEmail: client.email || '',
      clientSlug: slug,
      productId: plan.productId || plan.id || planId,
      productName: plan.name || 'Subscription',
      productIcon: plan.icon || 'fa-solid fa-cube',

      /* ── Unique per-client URL ── */
      launchUrl,
      launchUrlTemplate: liveUrlTemplate,
      licenseKey,

      plan: plan.billingCycle || 'monthly',
      status: 'active',
      startDate: startDate.toISOString(),
      endDate,
      graceHours: Number.isFinite(Number(plan.graceHours)) ? Number(plan.graceHours) : 72,
      modules: modulesForStorage(planModules),
      amountKES: Number.isFinite(Number(plan.priceKES)) ? Number(plan.priceKES) : 0,
      billingCycle: plan.billingCycle || 'monthly',
      autoRenew: !!autoRenew,
      notes: notes || 'Admin-assigned subscription',
      renewalCount: 0,
      paymentIds: [],
      createdAt: now,
      createdBy: ctx().state?.operator?.name || 'admin',
      createdVia: 'admin-assign',
      updatedAt: now,
      _rev: 'rev-' + Date.now().toString(36),
      _planSnapshot: safePlanSnapshot(plan)
    };

    await set(ref(db, `viora_data/orgs/viora/subscriptions/${subId}`), deepClean(subscription));

    /* Client notification */
    try {
      const notifId = 'notif-' + Date.now().toString(36);
      await set(ref(db, `viora_data/orgs/viora/notifications/${notifId}`), {
        id: notifId,
        title: '🎉 New subscription activated',
        body: String(plan.name || 'Your subscription') + ' — active until ' +
          (endDate ? new Date(endDate).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric'
          }) : 'forever'),
        icon: 'fa-key',
        level: 'success',
        url: '/client.html',
        source: 'subscription-assigned',
        ts: now,
        read: false
      });
    } catch (e) {
      console.warn('[sub-plans] notification write failed:', e);
    }

    resultEl.innerHTML = `
      <div style="padding:14px;background:rgba(34,230,160,.1);border-left:4px solid var(--accent-green);border-radius:8px;">
        <strong>✓ Subscription created</strong><br>
        ${esc(client.name || '')} now has <strong>${esc(plan.name)}</strong> until
        <strong>${endDate ? new Date(endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'forever'}</strong>.
        <div style="margin-top:6px;font-size:.72rem;color:var(--text-secondary);">Sub ID: <code>${esc(subId)}</code></div>
        ${launchUrl ? `<div style="margin-top:4px;font-size:.72rem;color:var(--text-secondary);">Open URL: <code>${esc(launchUrl)}</code></div>` : ''}
      </div>
    `;

    toast('Subscription created for ' + (client.name || client.email), 'success');

    setTimeout(() => {
      modal.classList.remove('active');
      renderSubscriptionPlans();
    }, 3000);
  } catch (e) {
    console.error('[sub-plans] submitAssign failed:', e);
    resultEl.innerHTML = `
      <div style="padding:14px;background:rgba(255,92,124,.1);border-left:4px solid var(--accent-red);border-radius:8px;">
        <strong>Failed</strong><br>${esc(e.message || 'unknown error')}
      </div>
    `;
    toast('Assignment failed: ' + (e.message || 'unknown'), 'error');
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

/* ═══════════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════════ */
export {
  safePlanSnapshot,
  modulesForStorage,
  modulesFromStorage,
  deepClean,
  clientSlug,
  resolveLaunchUrlTemplate,
  generateLicenseKey
};

export default {
  initSubscriptionPlans,
  renderSubscriptionPlans,
  destroySubscriptionPlans,
  safePlanSnapshot,
  clientSlug,
  resolveLaunchUrlTemplate,
  generateLicenseKey
};
