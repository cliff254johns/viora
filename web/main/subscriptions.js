/* ═══════════════════════════════════════════════════════════════
   main/subscriptions.js — VIORA Admin Subscriptions Register
   v2.0 — self-contained, no external schema import, fully hardened
   ─────────────────────────────────────────────────────────────
   Public surface (unchanged from v1.x):
     initSubscriptions(deps)
     renderSubscriptions()
     SubscriptionsAdmin = { render, subsForClient, allSubs }
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   INLINE SCHEMA — no external import.
   Kept API-compatible with the old ../subscription-schema.js:
     PLAN, STATUS, DEFAULT_GRACE_HOURS
     SUBSCRIPTION_PATH, LICENSES_PATH
     evaluateSubscription, subscriptionPill, computeEndDate,
     buildSubscription, validateSubscription
   ═══════════════════════════════════════════════════════════════ */
const SUBSCRIPTION_PATH = 'viora_data/orgs/viora/subscriptions';
const LICENSES_PATH     = 'viora_data/orgs/viora/licenses';
const DEFAULT_GRACE_HOURS = 72;

const PLAN = Object.freeze({
  MONTHLY:   'monthly',
  QUARTERLY: 'quarterly',
  YEARLY:    'yearly',
  LIFETIME:  'lifetime'
});

const STATUS = Object.freeze({
  ACTIVE:          'active',
  PENDING_PAYMENT: 'pending_payment',
  SUSPENDED:       'suspended',
  CANCELLED:       'cancelled',
  EXPIRED:         'expired'
});

const PLAN_DAYS = Object.freeze({
  [PLAN.MONTHLY]:   30,
  [PLAN.QUARTERLY]: 90,
  [PLAN.YEARLY]:    365
});

function _isoNow() { return new Date().toISOString(); }

function _newRev() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function _parseDate(v) {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (v == null || v === '') return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

function computeEndDate(plan, startIso) {
  if (plan === PLAN.LIFETIME) return null;
  const days = PLAN_DAYS[plan] || 30;
  const startMs = _parseDate(startIso) ?? Date.now();
  return new Date(startMs + days * 86400000).toISOString();
}

function evaluateSubscription(sub, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const out = {
    allowed: false,
    reason: 'unknown',
    inGrace: false,
    msRemaining: null,
    daysRemaining: null
  };
  if (!sub) { out.reason = 'missing'; return out; }

  if (sub.status === STATUS.CANCELLED) { out.reason = 'cancelled'; return out; }
  if (sub.status === STATUS.SUSPENDED) { out.reason = 'suspended'; return out; }
  if (sub.status === STATUS.PENDING_PAYMENT) { out.reason = 'pending_payment'; return out; }

  if (sub.plan === PLAN.LIFETIME) {
    out.allowed = true;
    out.reason = 'lifetime';
    return out;
  }

  const endMs = _parseDate(sub.endDate);
  if (endMs == null) {
    out.reason = 'no_end_date';
    return out;
  }

  const graceMs = (Number(sub.graceHours) || DEFAULT_GRACE_HOURS) * 3600000;

  if (now <= endMs) {
    out.allowed = true;
    out.reason = 'active';
    out.msRemaining = endMs - now;
    out.daysRemaining = Math.ceil(out.msRemaining / 86400000);
    return out;
  }

  if (now <= endMs + graceMs) {
    out.allowed = true;
    out.reason = 'grace';
    out.inGrace = true;
    out.msRemaining = endMs + graceMs - now;
    out.daysRemaining = 0;
    return out;
  }

  out.reason = 'expired';
  return out;
}

function subscriptionPill(sub, nowMs) {
  const e = evaluateSubscription(sub, nowMs);
  if (sub && sub.plan === PLAN.LIFETIME) return { tone: 'success', label: 'Lifetime' };
  if (!e.allowed) {
    const tone = (sub && sub.status === STATUS.SUSPENDED) ? 'warning'
              : (sub && sub.status === STATUS.CANCELLED) ? 'danger'
              : (sub && sub.status === STATUS.PENDING_PAYMENT) ? 'warning'
              : 'danger';
    const label = (sub && sub.status && sub.status !== 'expired') ? sub.status
                : 'Expired';
    return { tone, label: label.charAt(0).toUpperCase() + label.slice(1) };
  }
  if (e.inGrace) {
    const h = Math.max(1, Math.ceil(e.msRemaining / 3600000));
    return { tone: 'warning', label: `Grace · ${h}h` };
  }
  if (e.daysRemaining != null && e.daysRemaining <= 7) {
    return { tone: 'warning', label: `Expiring · ${e.daysRemaining}d` };
  }
  return { tone: 'success', label: 'Active' };
}

function buildSubscription(input) {
  const now = _isoNow();
  const plan = input.plan || PLAN.MONTHLY;
  const startDate = input.startDate || now;
  const id = input.id || ('sub-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  return {
    id,
    clientId: input.clientId || '',
    clientName: input.clientName || '',
    productId: input.productId || '',
    productName: input.productName || input.productId || '',
    productIcon: input.productIcon || 'fa-solid fa-cube',
    plan,
    status: input.status || STATUS.PENDING_PAYMENT,
    startDate,
    endDate: plan === PLAN.LIFETIME ? null : (input.endDate || computeEndDate(plan, startDate)),
    graceHours: Number(input.graceHours) || DEFAULT_GRACE_HOURS,
    modules: Array.isArray(input.modules) ? input.modules.slice() : [],
    amountKES: Number(input.amountKES) || 0,
    billingCycle: input.billingCycle || plan,
    autoRenew: !!input.autoRenew,
    notes: input.notes || '',
    paymentIds: Array.isArray(input.paymentIds) ? input.paymentIds.slice() : [],
    renewalCount: Number(input.renewalCount) || 0,
    createdAt: now,
    createdBy: input.createdBy || 'admin',
    updatedAt: now,
    _rev: _newRev()
  };
}

function validateSubscription(sub) {
  const errors = [];
  if (!sub || typeof sub !== 'object') { errors.push('record is empty'); return { ok: false, errors }; }
  if (!sub.id) errors.push('missing id');
  if (!sub.clientId) errors.push('missing clientId');
  if (!sub.productId) errors.push('missing productId');
  if (!Object.values(PLAN).includes(sub.plan)) errors.push('invalid plan');
  if (!Object.values(STATUS).includes(sub.status)) errors.push('invalid status');
  if (sub.plan !== PLAN.LIFETIME) {
    if (sub.startDate && _parseDate(sub.startDate) == null) errors.push('invalid startDate');
    if (sub.endDate && _parseDate(sub.endDate) == null) errors.push('invalid endDate');
  }
  return { ok: errors.length === 0, errors };
}

/* ═══════════════════════════════════════════════════════════════
   DEPENDENCY BAG — mutable, always read through getters
   ═══════════════════════════════════════════════════════════════ */
let D = {
  db: null, ref: null, set: null, get: null, update: null, remove: null, push: null,
  state: null,
  $: null, escapeHtml: null, toast: null, logActivity: null,
  upsertDoc: null, deleteDoc: null,
  openModal: null, closeModal: null,
  generateInvoiceNumber: null,
  getClient: null, getClients: null,
  normalizeEmail: null, normalizePhone: null,
  logComm: null,
  renderActiveTab: null, scheduleRender: null,
  EventBus: null,
  vioraConfirm: null, vioraPrompt: null,
  getTextColor: null
};

export function initSubscriptions(deps) {
  if (!deps || typeof deps !== 'object') return;
  for (const k of Object.keys(deps)) {
    if (deps[k] !== undefined) D[k] = deps[k];
  }
  if (!D.db) console.warn('[subscriptions] init called without db');
}

/* ═══════════════════════════════════════════════════════════════
   SAFE HELPERS — never throw, always return a usable value
   ═══════════════════════════════════════════════════════════════ */
const _esc = (s) => {
  if (typeof D.escapeHtml === 'function') {
    try { return D.escapeHtml(s); } catch (_) { /* fall through */ }
  }
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

const _toast = (msg, type) => {
  if (typeof D.toast === 'function') {
    try { D.toast(msg, type || 'info'); } catch (_) {}
  }
};

const _log = async (action, title, detail) => {
  if (typeof D.logActivity === 'function') {
    try { await D.logActivity(action, title, detail); } catch (_) {}
  }
};

const _confirm = (msg, opts) => new Promise((resolve) => {
  const vc = D.vioraConfirm;
  if (typeof vc === 'function') {
    try {
      Promise.resolve(vc(msg, opts || {})).then(v => resolve(!!v), () => resolve(false));
      return;
    } catch (_) { /* fall through */ }
  }
  try { resolve(typeof confirm === 'function' ? !!confirm(msg) : true); }
  catch (_) { resolve(true); }
});

const _data = () => (D.state && D.state.data) || {};
const _allSubs = () => {
  const raw = _data().subscriptions;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'object') return Object.values(raw).filter(Boolean);
  return [];
};

/* Server-anchored now — falls back to local if not wired */
const _now = () => {
  const off = (D.state && D.state._serverTimeOffsetMs) || 0;
  return Date.now() + (Number(off) || 0);
};

/* ═══════════════════════════════════════════════════════════════
   VIEW STATE — persists across re-renders within a session
   ═══════════════════════════════════════════════════════════════ */
const V = {
  filterStatus: 'all',
  filterProduct: 'all',
  search: '',
  expandedId: null,
  sortKey: 'endDate',
  sortDir: 'asc'
};

/* ═══════════════════════════════════════════════════════════════
   KPI COMPUTATION
   ═══════════════════════════════════════════════════════════════ */
function computeKpis(list, now) {
  let active = 0, grace = 0, expired = 0, suspended = 0, cancelled = 0, pendingPayment = 0, lifetime = 0;
  let expiringSoon = 0;
  let mrrKes = 0;

  for (const s of list) {
    if (!s) continue;
    if (s.plan === PLAN.LIFETIME) { lifetime++; continue; }

    const e = evaluateSubscription(s, now);

    if (s.status === STATUS.SUSPENDED)       { suspended++; continue; }
    if (s.status === STATUS.CANCELLED)       { cancelled++; continue; }
    if (s.status === STATUS.PENDING_PAYMENT) { pendingPayment++; continue; }

    if (e.allowed) {
      if (e.inGrace) {
        grace++;
      } else {
        active++;
        if (e.daysRemaining != null && e.daysRemaining <= 7) expiringSoon++;
        const amt = Number(s.amountKES) || 0;
        if (s.plan === PLAN.MONTHLY)        mrrKes += amt;
        else if (s.plan === PLAN.QUARTERLY) mrrKes += amt / 3;
        else if (s.plan === PLAN.YEARLY)    mrrKes += amt / 12;
      }
    } else {
      expired++;
    }
  }

  return {
    total: list.length,
    active, grace, expired, suspended, cancelled, pendingPayment, lifetime,
    expiringSoon,
    mrrKes: Math.round(mrrKes)
  };
}

function kpiHtml(k) {
  const card = (icon, color, num, label, sub = '') => `
    <div class="stat-card">
      <div class="stat-icon" style="background:${color}22;color:${color};">
        <i class="fa-solid ${icon}"></i>
      </div>
      <div class="number">${num}</div>
      <div class="label">${label}</div>
      ${sub ? `<div style="font-size:.68rem;color:var(--text-light);margin-top:2px;">${sub}</div>` : ''}
    </div>
  `;
  return [
    card('fa-key',              '#22e6a0', k.active,        'Active',         k.expiringSoon ? `${k.expiringSoon} expiring soon` : ''),
    card('fa-hourglass-half',   '#ffc857', k.grace,         'In Grace'),
    card('fa-triangle-exclamation', '#ff5c7c', k.expired,   'Expired'),
    card('fa-pause',            '#a855f7', k.suspended,     'Suspended'),
    card('fa-infinity',         '#00d4ff', k.lifetime,      'Lifetime'),
    card('fa-coins',            '#10b981', 'KSh ' + k.mrrKes.toLocaleString(), 'Est. MRR')
  ].join('');
}

/* ═══════════════════════════════════════════════════════════════
   DATE FORMATTERS
   ═══════════════════════════════════════════════════════════════ */
function fmtShort(iso) {
  const t = _parseDate(iso);
  if (t == null) return '—';
  try {
    return new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch (_) { return '—'; }
}
function fmtLong(iso) {
  const t = _parseDate(iso);
  if (t == null) return '—';
  try {
    return new Date(t).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (_) { return '—'; }
}
function timeAgoShort(iso) {
  const t = _parseDate(iso);
  if (t == null) return '';
  const diff = Date.now() - t;
  if (diff < 60000) return 'just now';
  const m = Math.floor(diff / 60000);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDaysIso(iso, days) {
  const base = _parseDate(iso) ?? Date.now();
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN RENDER
   ═══════════════════════════════════════════════════════════════ */
export function renderSubscriptions() {
  const host = document.getElementById('tab-subscriptions');
  if (!host) return;

  const now = _now();
  const list = _allSubs();
  const kpi = computeKpis(list, now);

  const products = Array.from(new Set(list.map(s => s.productId).filter(Boolean))).sort();
  const filtered = applyFilters(list, now);
  sortList(filtered);

  host.innerHTML = `
    <div class="page-header">
      <div>
        <h1>
          <span class="pillar-icon" style="background:linear-gradient(135deg,#22e6a0,#00d4ff);">
            <i class="fa-solid fa-key"></i>
          </span>
          <span class="highlight">Subscriptions</span>
        </h1>
        <p class="page-desc">
          Every client subscription in the system. Extend, suspend, cancel, or upgrade to lifetime.
          Changes reach the client's installed PWA on its next check-in (≤ 15 min online, or immediately on next launch).
        </p>
      </div>
      <div class="actions">
        <button class="btn btn-outline btn-sm" id="subsRefreshBtn">
          <i class="fa-solid fa-rotate"></i> Refresh
        </button>
        <button class="btn btn-outline btn-sm" id="subsExportCsvBtn">
          <i class="fa-solid fa-file-export"></i> CSV
        </button>
        <button class="btn btn-primary" id="subsNewBtn">
          <i class="fa-solid fa-plus"></i> New Subscription
        </button>
      </div>
    </div>

    <div class="kpi-grid" id="subsKpiGrid">${kpiHtml(kpi)}</div>

    <div class="toolbar">
      <div class="search-box">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input id="subsSearch" placeholder="Search by client or product…" value="${_esc(V.search)}" />
      </div>
      <select id="subsFilterStatus">
        <option value="all">All Statuses</option>
        <option value="active">Active</option>
        <option value="grace">Grace</option>
        <option value="expiring_soon">Expiring ≤ 7 days</option>
        <option value="expired">Expired</option>
        <option value="suspended">Suspended</option>
        <option value="cancelled">Cancelled</option>
        <option value="pending_payment">Pending Payment</option>
        <option value="lifetime">Lifetime</option>
      </select>
      <select id="subsFilterProduct">
        <option value="all">All Products</option>
        ${products.map(p => `<option value="${_esc(p)}">${_esc(p)}</option>`).join('')}
      </select>
      <button class="btn btn-outline btn-sm" id="subsClearFilters">Clear</button>
    </div>

    <div class="table-wrapper">
      <table class="subs-table">
        <thead>
          <tr>
            <th style="width:32px;"></th>
            <th data-sort="clientName">Client</th>
            <th data-sort="productName">Product</th>
            <th data-sort="plan">Plan</th>
            <th data-sort="startDate">Started</th>
            <th data-sort="endDate">Ends</th>
            <th>Remaining</th>
            <th data-sort="status">Status</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody id="subsBody">
          ${filtered.length
            ? filtered.map(s => rowHtml(s, now)).join('')
            : `<tr><td colspan="9" class="empty-state">No subscriptions match the current filters.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  /* Restore filter selection AFTER the DOM is built */
  const selStatus  = document.getElementById('subsFilterStatus');
  const selProduct = document.getElementById('subsFilterProduct');
  if (selStatus)  selStatus.value  = V.filterStatus;
  if (selProduct) selProduct.value = V.filterProduct;

  bindEvents(now);
}

function applyFilters(list, now) {
  const q = String(V.search || '').trim().toLowerCase();

  return list.filter(s => {
    if (!s) return false;

    if (V.filterStatus !== 'all') {
      const e = evaluateSubscription(s, now);
      switch (V.filterStatus) {
        case 'lifetime':
          if (s.plan !== PLAN.LIFETIME) return false;
          break;
        case 'active':
          if (!e.allowed || e.inGrace) return false;
          break;
        case 'grace':
          if (!e.allowed || !e.inGrace) return false;
          break;
        case 'expiring_soon':
          if (!e.allowed || e.inGrace) return false;
          if (e.daysRemaining == null || e.daysRemaining > 7) return false;
          break;
        case 'expired':
          if (e.allowed) return false;
          if (s.status === STATUS.SUSPENDED || s.status === STATUS.CANCELLED) return false;
          break;
        default:
          if (s.status !== V.filterStatus) return false;
      }
    }

    if (V.filterProduct !== 'all' && s.productId !== V.filterProduct) return false;

    if (q) {
      const hay = (
        (s.clientName || '') + ' ' +
        (s.productName || '') + ' ' +
        (s.productId || '') + ' ' +
        (s.id || '')
      ).toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

function sortList(list) {
  const k = V.sortKey;
  const dir = V.sortDir === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    const av = a?.[k] ?? '';
    const bv = b?.[k] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

/* ═══════════════════════════════════════════════════════════════
   ROW + DETAIL
   ═══════════════════════════════════════════════════════════════ */
function rowHtml(s, now) {
  const pill = subscriptionPill(s, now);
  const exp = V.expandedId === s.id;
  const planLabel = {
    [PLAN.MONTHLY]:   'Monthly',
    [PLAN.QUARTERLY]: 'Quarterly',
    [PLAN.YEARLY]:    'Yearly',
    [PLAN.LIFETIME]:  'Lifetime'
  }[s.plan] || s.plan || '—';

  const remaining = computeRemainingLabel(s, now);
  const pillCls = {
    success: 'badge-paid',
    warning: 'badge-pending',
    danger:  'badge-overdue'
  }[pill.tone] || 'badge-gray';

  const isLifetime = s.plan === PLAN.LIFETIME;
  const sid = _esc(s.id);

  return `
    <tr class="subs-row ${exp ? 'expanded' : ''}" data-sid="${sid}">
      <td>
        <button class="subs-expand" data-expand="${sid}" title="${exp ? 'Collapse' : 'Expand'}">
          <i class="fa-solid fa-chevron-${exp ? 'down' : 'right'}"></i>
        </button>
      </td>
      <td>
        <strong>${_esc(s.clientName || '—')}</strong>
        <div style="font-size:.68rem;color:var(--text-light);font-family:monospace;">
          ${_esc((s.clientId || '').slice(0, 12))}
        </div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <i class="${_esc(s.productIcon || 'fa-solid fa-cube')}" style="color:var(--accent-blue);"></i>
          <span>${_esc(s.productName || s.productId || '—')}</span>
        </div>
      </td>
      <td><span class="badge badge-purple">${_esc(planLabel)}</span></td>
      <td><small>${fmtShort(s.startDate)}</small></td>
      <td>${isLifetime
        ? '<span style="color:var(--accent-blue);">—</span>'
        : `<small>${fmtShort(s.endDate)}</small>`}
      </td>
      <td>${remaining}</td>
      <td><span class="badge ${pillCls}">${_esc(pill.label)}</span></td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn btn-success btn-xs" data-action="extend"  data-sid="${sid}" title="Extend">
          <i class="fa-solid fa-calendar-plus"></i>
        </button>
        ${!isLifetime ? `
          <button class="btn btn-outline btn-xs" data-action="invoice" data-sid="${sid}" title="Issue Renewal Invoice">
            <i class="fa-solid fa-file-invoice"></i>
          </button>
        ` : ''}
        ${s.status === STATUS.SUSPENDED
          ? `<button class="btn btn-outline btn-xs" data-action="resume"  data-sid="${sid}" title="Resume"><i class="fa-solid fa-play"></i></button>`
          : `<button class="btn btn-gold    btn-xs" data-action="suspend" data-sid="${sid}" title="Suspend"><i class="fa-solid fa-pause"></i></button>`}
        <button class="btn btn-primary btn-xs" data-action="detail" data-sid="${sid}" title="Detail">
          <i class="fa-solid fa-eye"></i>
        </button>
      </td>
    </tr>
    ${exp ? `<tr class="subs-detail-row"><td colspan="9">${detailHtml(s, now)}</td></tr>` : ''}
  `;
}

function computeRemainingLabel(s, now) {
  if (s.plan === PLAN.LIFETIME) {
    return '<span class="badge badge-paid" style="font-size:9px;">∞ Forever</span>';
  }
  const e = evaluateSubscription(s, now);
  if (!e.allowed) {
    return '<span class="badge badge-overdue" style="font-size:9px;">Expired</span>';
  }
  if (e.inGrace) {
    const h = Math.max(1, Math.ceil(e.msRemaining / 3600000));
    return `<span class="badge badge-pending" style="font-size:9px;">Grace · ${h}h left</span>`;
  }
  if (e.daysRemaining != null && e.daysRemaining <= 7) {
    return `<span class="badge badge-pending" style="font-size:9px;">${e.daysRemaining}d left</span>`;
  }
  const d = e.daysRemaining ?? 0;
  return `<span class="badge badge-active" style="font-size:9px;">${d}d left</span>`;
}

function detailHtml(s, now) {
  const e = evaluateSubscription(s, now);
  const modules = Array.isArray(s.modules) ? s.modules : [];
  const modsLabel = modules.length === 0
    ? '<em style="color:var(--text-light);">Whole product unlocked</em>'
    : modules.map(m => `<span class="badge badge-purple" style="margin-right:4px;">${_esc(m)}</span>`).join('');

  const payments = Array.isArray(s.paymentIds) ? s.paymentIds : [];
  const paymentsHtml = payments.length
    ? payments.map(pid => {
        const p = (_data().payments || []).find(x => x && x.id === pid);
        if (!p) return `<div style="font-size:.75rem;color:var(--text-light);font-family:monospace;">${_esc(pid)} — missing</div>`;
        return `<div style="font-size:.78rem;padding:6px 0;border-bottom:1px solid var(--border-color);">
          <strong>${fmtShort(p.date)}</strong> · ${_esc(p.method || '')} · KSh ${(Number(p.amount) || 0).toLocaleString()}
          <span style="color:var(--text-light);font-family:monospace;">${_esc(p.reference || '')}</span>
        </div>`;
      }).join('')
    : '<div style="font-size:.78rem;color:var(--text-light);">No payments linked yet.</div>';

  const licSnap = _data().licenses || {};
  const linkedLicense = Object.values(licSnap).find(l => l && l.subscriptionId === s.id);

  const sid = _esc(s.id);

  return `
    <div class="subs-detail-inner">
      <div class="subs-detail-grid">
        <div class="subs-detail-card">
          <div class="subs-detail-label">Status</div>
          <div class="subs-detail-value">
            <span class="badge badge-${e.allowed ? 'paid' : 'overdue'}">${_esc(e.reason)}</span>
          </div>
        </div>
        <div class="subs-detail-card">
          <div class="subs-detail-label">Start Date</div>
          <div class="subs-detail-value">${fmtLong(s.startDate)}</div>
        </div>
        <div class="subs-detail-card">
          <div class="subs-detail-label">End Date</div>
          <div class="subs-detail-value">
            ${s.plan === PLAN.LIFETIME
              ? '<span style="color:var(--accent-blue);">Never expires</span>'
              : fmtLong(s.endDate)}
          </div>
        </div>
        <div class="subs-detail-card">
          <div class="subs-detail-label">Grace Window</div>
          <div class="subs-detail-value">${Number(s.graceHours) || DEFAULT_GRACE_HOURS} hours</div>
        </div>
        <div class="subs-detail-card">
          <div class="subs-detail-label">Billing</div>
          <div class="subs-detail-value">KSh ${(Number(s.amountKES) || 0).toLocaleString()} · ${_esc(s.billingCycle || s.plan || '')}</div>
        </div>
        <div class="subs-detail-card">
          <div class="subs-detail-label">Auto-Renew</div>
          <div class="subs-detail-value">${s.autoRenew ? 'On' : 'Off'}</div>
        </div>
        <div class="subs-detail-card">
          <div class="subs-detail-label">Renewals</div>
          <div class="subs-detail-value">${Number(s.renewalCount) || 0}</div>
        </div>
        <div class="subs-detail-card">
          <div class="subs-detail-label">Last Verified</div>
          <div class="subs-detail-value">
            ${s.lastVerifiedAt
              ? `${fmtShort(s.lastVerifiedAt)} <span style="font-size:.68rem;color:var(--text-light);">${timeAgoShort(s.lastVerifiedAt)}</span>`
              : '<span style="color:var(--text-light);">Never</span>'}
          </div>
        </div>
      </div>

      <div class="subs-detail-row-2">
        <div>
          <div class="subs-detail-label" style="margin-bottom:6px;">Unlocked Modules</div>
          <div>${modsLabel}</div>
        </div>
        <div>
          <div class="subs-detail-label" style="margin-bottom:6px;">Linked License</div>
          <div style="font-family:monospace;font-size:.78rem;color:${linkedLicense ? 'var(--accent-blue)' : 'var(--text-light)'};">
            ${linkedLicense ? _esc(linkedLicense.id || linkedLicense.licenseKey || '') : 'none'}
          </div>
          ${linkedLicense && linkedLicense.deviceFingerprint
            ? `<div style="font-size:.68rem;color:var(--text-light);margin-top:2px;">Device: ${_esc(linkedLicense.deviceFingerprint)}</div>`
            : ''}
        </div>
      </div>

      <div class="subs-detail-payments">
        <div class="subs-detail-label" style="margin-bottom:6px;">Payment History (${payments.length})</div>
        <div style="max-height:180px;overflow-y:auto;">${paymentsHtml}</div>
      </div>

      <div class="subs-detail-actions">
        <button class="btn btn-success btn-sm" data-action="extend"  data-sid="${sid}"><i class="fa-solid fa-calendar-plus"></i> Extend</button>
        <button class="btn btn-primary btn-sm" data-action="invoice" data-sid="${sid}"><i class="fa-solid fa-file-invoice"></i> Renewal Invoice</button>
        <button class="btn btn-outline btn-sm" data-action="notify"  data-sid="${sid}"><i class="fa-brands fa-whatsapp"></i> Notify Client</button>
        ${s.plan !== PLAN.LIFETIME ? `<button class="btn btn-purple  btn-sm" data-action="upgrade" data-sid="${sid}"><i class="fa-solid fa-infinity"></i> Upgrade to Lifetime</button>` : ''}
        ${s.status === STATUS.SUSPENDED
          ? `<button class="btn btn-success btn-sm" data-action="resume"  data-sid="${sid}"><i class="fa-solid fa-play"></i> Resume</button>`
          : `<button class="btn btn-gold    btn-sm" data-action="suspend" data-sid="${sid}"><i class="fa-solid fa-pause"></i> Suspend</button>`}
        <button class="btn btn-danger btn-sm" data-action="cancel" data-sid="${sid}"><i class="fa-solid fa-xmark"></i> Cancel</button>
        <button class="btn btn-outline btn-sm" data-action="delete" data-sid="${sid}" style="margin-left:auto;color:var(--accent-red);">
          <i class="fa-solid fa-trash"></i> Delete Record
        </button>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   EVENT BINDING — idempotent, no stacking
   ═══════════════════════════════════════════════════════════════ */
function bindEvents(now) {
  const on = (sel, evt, fn) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.addEventListener(evt, fn);
  };

  on('#subsRefreshBtn', 'click', () => {
    renderSubscriptions();
    _toast('Subscriptions refreshed.', 'info');
  });

  on('#subsExportCsvBtn', 'click', () => exportCsv());

   on('#subsNewBtn', 'click', () => openNewSubscriptionModal());

  on('#subsForceRefreshBtn', 'click', async () => {
    try {
      // Bump a "nudge" counter on each subscription. Guard polls this
      // and re-evaluates when it changes, so open client tabs refresh fast.
      const now = new Date().toISOString();
      const subs = _allSubs();
      for (const s of subs) {
        if (!s || !s.id) continue;
        await D.update(D.ref(D.db, `${SUBSCRIPTION_PATH}/${s.id}`), {
          _nudgeAt: now
        });
      }
      toast(`Nudged ${subs.length} subscription${subs.length === 1 ? '' : 's'} — clients will refresh within 5 s.`, 'success');
    } catch (e) {
      toast('Force refresh failed: ' + (e.message || 'unknown'), 'error');
    }
  });

  const searchEl = document.getElementById('subsSearch');
  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      V.search = e.target.value;
      renderSubscriptions();
      const s2 = document.getElementById('subsSearch');
      if (s2) { s2.focus(); s2.setSelectionRange(V.search.length, V.search.length); }
    });
  }

  const statusEl = document.getElementById('subsFilterStatus');
  if (statusEl) statusEl.addEventListener('change', (e) => {
    V.filterStatus = e.target.value;
    renderSubscriptions();
  });

  const productEl = document.getElementById('subsFilterProduct');
  if (productEl) productEl.addEventListener('change', (e) => {
    V.filterProduct = e.target.value;
    renderSubscriptions();
  });

  on('#subsClearFilters', 'click', () => {
    V.filterStatus = 'all';
    V.filterProduct = 'all';
    V.search = '';
    renderSubscriptions();
  });

  document.querySelectorAll('.subs-table th[data-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (V.sortKey === key) V.sortDir = V.sortDir === 'asc' ? 'desc' : 'asc';
      else { V.sortKey = key; V.sortDir = 'asc'; }
      renderSubscriptions();
    });
  });

  document.querySelectorAll('[data-expand]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sid = btn.dataset.expand;
      V.expandedId = V.expandedId === sid ? null : sid;
      renderSubscriptions();
    });
  });

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleAction(btn.dataset.action, btn.dataset.sid);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   ACTION DISPATCH
   ═══════════════════════════════════════════════════════════════ */
async function handleAction(action, sid) {
  const sub = _allSubs().find(s => s.id === sid);
  if (!sub) { _toast('Subscription not found.', 'error'); return; }

  switch (action) {
    case 'extend':  return openExtendModal(sub);
    case 'suspend': return suspendSubscription(sub);
    case 'resume':  return resumeSubscription(sub);
    case 'cancel':  return cancelSubscription(sub);
    case 'upgrade': return upgradeToLifetime(sub);
    case 'delete':  return deleteSubscription(sub);
    case 'invoice': return issueRenewalInvoice(sub);
    case 'notify':  return notifyClient(sub);
    case 'detail':
      V.expandedId = V.expandedId === sid ? null : sid;
      renderSubscriptions();
      return;
    default:
      return;
  }
}

/* ═══════════════════════════════════════════════════════════════
   MODAL HELPERS — shared open/close/escape/focus plumbing
   ═══════════════════════════════════════════════════════════════ */
const _openOverlays = new Set();

function _openOverlay(overlay, onClose) {
  overlay.classList.add('active');
  document.body.appendChild(overlay);
  _openOverlays.add(overlay);

  const prevFocus = document.activeElement;
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const finish = () => {
    if (!_openOverlays.has(overlay)) return;
    _openOverlays.delete(overlay);
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (_openOverlays.size === 0) document.body.style.overflow = prevOverflow;
    try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (_) {}
    if (typeof onClose === 'function') { try { onClose(); } catch (_) {} }
  };

  const onKey = (e) => { if (e.key === 'Escape') finish(); };
  document.addEventListener('keydown', onKey);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) finish();
  });

  /* Focus the first focusable element */
  requestAnimationFrame(() => {
    const f = overlay.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (f && f.focus) { try { f.focus(); } catch (_) {} }
  });

  return finish;
}

function closeAllOverlays() {
  for (const o of Array.from(_openOverlays)) o.remove();
  _openOverlays.clear();
  document.body.style.overflow = '';
}

/* Expose for cascade-abort from other modules */
export function abortSubscriptionsModals() { closeAllOverlays(); }

/* ═══════════════════════════════════════════════════════════════
   ACTION — EXTEND
   ═══════════════════════════════════════════════════════════════ */
function openExtendModal(sub) {
  const endMs = _parseDate(sub.endDate);
  const baseMs = Math.max(Date.now(), endMs ?? 0);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '9999';
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <h2>
        <span class="modal-icon" style="background:linear-gradient(135deg,#22e6a0,#00d4ff);">
          <i class="fa-solid fa-calendar-plus"></i>
        </span>
        Extend Subscription
      </h2>

      <div style="padding:12px;background:var(--bg-input);border-radius:12px;margin-bottom:16px;border:1px solid var(--border-color);">
        <div style="font-weight:700;">${_esc(sub.productName || sub.productId)}</div>
        <div style="font-size:.78rem;color:var(--text-secondary);margin-top:4px;">
          ${_esc(sub.clientName)} · current end: <strong>${fmtLong(sub.endDate)}</strong>
        </div>
      </div>

      <label>Extension duration</label>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px;">
        <button class="btn btn-outline btn-sm" data-days="7">+7 days</button>
        <button class="btn btn-outline btn-sm" data-days="30">+30 days</button>
        <button class="btn btn-outline btn-sm" data-days="90">+90 days</button>
        <button class="btn btn-outline btn-sm" data-days="365">+365 days</button>
      </div>

      <label>Or custom</label>
      <div class="form-row">
        <div><label style="margin-top:0;">Days</label><input type="number" id="extDays" value="30" min="1" max="3650" /></div>
        <div><label style="margin-top:0;">New end date (auto)</label><input id="extEndDate" readonly style="background:var(--bg-card-solid);color:var(--text-secondary);" /></div>
      </div>

      <label>Reason (for audit)</label>
      <input id="extReason" placeholder="e.g. Client paid renewal via M-Pesa" />

      <div id="extPreview" style="margin-top:14px;padding:12px;background:var(--bg-input);border-radius:10px;border:1px solid var(--border-color);font-size:.85rem;"></div>

      <div class="form-actions" style="margin-top:20px;">
        <button type="button" class="btn btn-outline" data-act="cancel">Cancel</button>
        <button type="button" class="btn btn-success" data-act="confirm">
          <i class="fa-solid fa-check"></i> Extend
        </button>
      </div>
    </div>
  `;

  const finish = _openOverlay(overlay);
  const daysInp = overlay.querySelector('#extDays');
  const endInp  = overlay.querySelector('#extEndDate');
  const preview = overlay.querySelector('#extPreview');

  function recalc() {
    const days = Math.max(1, Math.min(3650, parseInt(daysInp.value, 10) || 30));
    const newEnd = new Date(baseMs + days * 86400000);
    endInp.value = newEnd.toISOString().slice(0, 16).replace('T', ' ');
    const diffDays = Math.round((newEnd.getTime() - Date.now()) / 86400000);
    preview.innerHTML = `
      <div style="display:flex;justify-content:space-between;">
        <span>Current end:</span>
        <strong>${fmtLong(sub.endDate)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;">
        <span>New end:</span>
        <strong style="color:var(--accent-green);">${fmtLong(newEnd.toISOString())}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;">
        <span>Days remaining after extension:</span>
        <strong>${diffDays}</strong>
      </div>
    `;
  }

  recalc();
  daysInp.addEventListener('input', recalc);

  overlay.querySelectorAll('.btn[data-days]').forEach(btn => {
    btn.addEventListener('click', () => {
      daysInp.value = btn.dataset.days;
      recalc();
    });
  });

  overlay.querySelector('[data-act="cancel"]').addEventListener('click', finish);

  overlay.querySelector('[data-act="confirm"]').addEventListener('click', async () => {
    const days = Math.max(1, Math.min(3650, parseInt(daysInp.value, 10) || 30));
    const reason = overlay.querySelector('#extReason').value.trim();
    const newEnd = new Date(baseMs + days * 86400000).toISOString();

    const btn = overlay.querySelector('[data-act="confirm"]');
    const prevHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Extending…';

    try {
      if (!D.update || !D.ref || !D.db) throw new Error('Subscriptions service unavailable');
      await D.update(D.ref(D.db, `${SUBSCRIPTION_PATH}/${sub.id}`), {
        endDate: newEnd,
        status: STATUS.ACTIVE,
        updatedAt: _isoNow(),
        updatedBy: (D.state && D.state.operator && D.state.operator.name) || 'admin',
        renewalCount: Number(sub.renewalCount || 0) + 1,
        _rev: _newRev()
      });

      await _log('edit', 'Subscription extended',
        `${sub.clientName} — ${sub.productName} +${days}d${reason ? ' (' + reason + ')' : ''}`);

      _toast(`Extended by ${days} days.`, 'success');
      finish();
    } catch (e) {
      console.error('[subscriptions] extend failed', e);
      _toast('Extend failed: ' + (e.message || 'unknown'), 'error');
      btn.disabled = false;
      btn.innerHTML = prevHtml;
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   ACTION — SUSPEND / RESUME / CANCEL / UPGRADE / DELETE
   ═══════════════════════════════════════════════════════════════ */
async function suspendSubscription(sub) {
  const ok = await _confirm(
    `Suspend "${sub.productName}" for ${sub.clientName}?\n\n` +
    `The installed PWA will lock on its next check-in (≤ 15 min online).`,
    { title: 'Suspend subscription', confirmLabel: 'Suspend', confirmClass: 'btn-gold' }
  );
  if (!ok) return;

  try {
    await D.update(D.ref(D.db, `${SUBSCRIPTION_PATH}/${sub.id}`), {
      status: STATUS.SUSPENDED,
      suspendedAt: _isoNow(),
      suspendedBy: (D.state && D.state.operator && D.state.operator.name) || 'admin',
      updatedAt: _isoNow(),
      _rev: _newRev()
    });
    await _log('edit', 'Subscription suspended', `${sub.clientName} — ${sub.productName}`);
    _toast('Suspended. Client PWA will lock on next check-in.', 'warning');
    renderSubscriptions();
  } catch (e) {
    _toast('Suspend failed: ' + (e.message || 'unknown'), 'error');
  }
}

async function resumeSubscription(sub) {
  try {
    await D.update(D.ref(D.db, `${SUBSCRIPTION_PATH}/${sub.id}`), {
      status: STATUS.ACTIVE,
      suspendedAt: null,
      updatedAt: _isoNow(),
      updatedBy: (D.state && D.state.operator && D.state.operator.name) || 'admin',
      _rev: _newRev()
    });
    await _log('edit', 'Subscription resumed', `${sub.clientName} — ${sub.productName}`);
    _toast('Resumed. Client PWA unlocks on next check-in.', 'success');
    renderSubscriptions();
  } catch (e) {
    _toast('Resume failed: ' + (e.message || 'unknown'), 'error');
  }
}

async function cancelSubscription(sub) {
  const ok = await _confirm(
    `Permanently cancel "${sub.productName}" for ${sub.clientName}?\n\n` +
    `The client loses access. The record is kept for audit but cannot be resumed — ` +
    `you'd issue a fresh subscription instead.`,
    { title: 'Cancel subscription', confirmLabel: 'Cancel Subscription', confirmClass: 'btn-danger' }
  );
  if (!ok) return;

  try {
    await D.update(D.ref(D.db, `${SUBSCRIPTION_PATH}/${sub.id}`), {
      status: STATUS.CANCELLED,
      cancelledAt: _isoNow(),
      cancelledBy: (D.state && D.state.operator && D.state.operator.name) || 'admin',
      updatedAt: _isoNow(),
      _rev: _newRev()
    });
    await _log('delete', 'Subscription cancelled', `${sub.clientName} — ${sub.productName}`);
    _toast('Cancelled.', 'info');
    renderSubscriptions();
  } catch (e) {
    _toast('Cancel failed: ' + (e.message || 'unknown'), 'error');
  }
}

async function upgradeToLifetime(sub) {
  const ok = await _confirm(
    `Upgrade "${sub.productName}" for ${sub.clientName} to LIFETIME?\n\n` +
    `The subscription will never expire. The installed PWA will show "Lifetime" on next check-in.`,
    { title: 'Upgrade to Lifetime', confirmLabel: 'Upgrade', confirmClass: 'btn-purple' }
  );
  if (!ok) return;

  try {
    await D.update(D.ref(D.db, `${SUBSCRIPTION_PATH}/${sub.id}`), {
      plan: PLAN.LIFETIME,
      endDate: null,
      status: STATUS.ACTIVE,
      upgradedToLifetimeAt: _isoNow(),
      updatedAt: _isoNow(),
      updatedBy: (D.state && D.state.operator && D.state.operator.name) || 'admin',
      _rev: _newRev()
    });
    await _log('edit', 'Subscription upgraded to lifetime', `${sub.clientName} — ${sub.productName}`);
    _toast('Upgraded to lifetime.', 'success');
    renderSubscriptions();
  } catch (e) {
    _toast('Upgrade failed: ' + (e.message || 'unknown'), 'error');
  }
}

async function deleteSubscription(sub) {
  const ok = await _confirm(
    `PERMANENTLY DELETE this subscription record?\n\n` +
    `${sub.clientName} — ${sub.productName}\n\n` +
    `⚠ This is not a cancel. It removes the record entirely. ` +
    `Any installed PWA will lock on next check-in. Use only for cleanup of test/wrong data.`,
    { title: 'Delete record', confirmLabel: 'Delete Forever', confirmClass: 'btn-danger' }
  );
  if (!ok) return;

  try {
    await D.remove(D.ref(D.db, `${SUBSCRIPTION_PATH}/${sub.id}`));
    await _log('delete', 'Subscription record deleted', `${sub.clientName} — ${sub.productName}`);
    _toast('Deleted.', 'info');
    renderSubscriptions();
  } catch (e) {
    _toast('Delete failed: ' + (e.message || 'unknown'), 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   ACTION — RENEWAL INVOICE
   ═══════════════════════════════════════════════════════════════ */
async function issueRenewalInvoice(sub) {
  if (sub.plan === PLAN.LIFETIME) {
    _toast("Lifetime subscriptions don't need renewal.", 'info');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '9999';

  const defaultAmount = Number(sub.amountKES) || 0;
  const planDays = PLAN_DAYS[sub.plan] || 30;

  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <h2>
        <span class="modal-icon" style="background:linear-gradient(135deg,#00d4ff,#0091c9);">
          <i class="fa-solid fa-file-invoice"></i>
        </span>
        Renewal Invoice
      </h2>

      <div style="padding:12px;background:var(--bg-input);border-radius:12px;margin-bottom:16px;border:1px solid var(--border-color);">
        <div style="font-weight:700;">${_esc(sub.productName)}</div>
        <div style="font-size:.78rem;color:var(--text-secondary);margin-top:4px;">
          ${_esc(sub.clientName)} · current end: <strong>${fmtLong(sub.endDate)}</strong>
        </div>
      </div>

      <div class="form-row">
        <div><label>Amount (KES)</label><input type="number" id="renAmount" value="${defaultAmount}" min="0" step="1" /></div>
        <div><label>Duration (days)</label><input type="number" id="renDays" value="${planDays}" min="1" max="3650" /></div>
      </div>

      <div class="form-row">
        <div><label>Invoice Date</label><input type="date" id="renDate" value="${todayIso()}" /></div>
        <div><label>Due Date</label><input type="date" id="renDue" value="${addDaysIso(todayIso(), 7)}" /></div>
      </div>

      <label>Notes (visible on the invoice)</label>
      <input id="renNotes" value="Subscription renewal — ${_esc(sub.productName)}" />

      <div id="renSummary" style="margin-top:14px;padding:12px;background:var(--bg-input);border-radius:10px;border:1px solid var(--border-color);font-size:.85rem;"></div>

      <div class="form-actions" style="margin-top:20px;">
        <button type="button" class="btn btn-outline" data-act="cancel">Cancel</button>
        <button type="button" class="btn btn-success" data-act="confirm">
          <i class="fa-solid fa-check"></i> Generate Invoice
        </button>
      </div>
    </div>
  `;

  const finish = _openOverlay(overlay);

  const inpAmt  = overlay.querySelector('#renAmount');
  const inpDays = overlay.querySelector('#renDays');
  const inpDate = overlay.querySelector('#renDate');
  const inpDue  = overlay.querySelector('#renDue');
  const summary = overlay.querySelector('#renSummary');

  function recalc() {
    const amt  = Number(inpAmt.value) || 0;
    const days = Number(inpDays.value) || 0;
    const fromMs = Math.max(Date.now(), _parseDate(sub.endDate) ?? 0);
    const newEnd = new Date(fromMs + days * 86400000);
    summary.innerHTML = `
      <div style="display:flex;justify-content:space-between;"><span>Amount:</span><strong>KSh ${amt.toLocaleString()}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;"><span>Extends subscription by:</span><strong>${days} days</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;">
        <span>New end date (after payment):</span>
        <strong style="color:var(--accent-green);">${fmtLong(newEnd.toISOString())}</strong>
      </div>
    `;
  }
  recalc();
  inpAmt.addEventListener('input', recalc);
  inpDays.addEventListener('input', recalc);

  overlay.querySelector('[data-act="cancel"]').addEventListener('click', finish);

  overlay.querySelector('[data-act="confirm"]').addEventListener('click', async () => {
    const amount  = Number(inpAmt.value) || 0;
    const days    = Number(inpDays.value) || 30;
    const invDate = inpDate.value || todayIso();
    const invDue  = inpDue.value  || addDaysIso(invDate, 7);
    const notes   = overlay.querySelector('#renNotes').value.trim();

    if (amount <= 0) { _toast('Amount must be positive.', 'error'); return; }

    const btn = overlay.querySelector('[data-act="confirm"]');
    const prevHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating…';

    try {
      const invId = 'inv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const invNumber = (typeof D.generateInvoiceNumber === 'function')
        ? D.generateInvoiceNumber()
        : 'INV-' + Date.now().toString(36).toUpperCase();

      const invoice = {
        id: invId,
        number: invNumber,
        clientId: sub.clientId,
        clientName: sub.clientName,
        date: invDate,
        dueDate: invDue,
        currency: 'KES',
        tax: 0,
        notes: notes || 'Subscription renewal',
             items: [{
          description: `Subscription renewal — ${sub.productName} (+${days} days)`,
          amount,
          hours: null, rate: null,
          subscriptionId: sub.id,
          extensionDays: days,
          _planDays: days
        }],
        extraCharges: [],
        status: 'sent',
        subscriptionId: sub.id,
        isRenewal: true,
        createdAt: _isoNow(),
        createdBy: (D.state && D.state.operator && D.state.operator.name) || 'admin'
      };

      if (typeof D.upsertDoc === 'function') {
        await D.upsertDoc('invoices', invoice);
      } else {
        await D.set(D.ref(D.db, `viora_data/orgs/viora/invoices/${invId}`), invoice);
      }

      await D.update(D.ref(D.db, `${SUBSCRIPTION_PATH}/${sub.id}`), {
        pendingInvoiceId: invId,
        pendingExtensionDays: days,
        updatedAt: _isoNow(),
        _rev: _newRev()
      });

      try {
        D.EventBus?.emit?.('invoices.created', invoice, invId, {
          number: invNumber,
          clientId: sub.clientId,
          subscriptionId: sub.id,
          isRenewal: true
        });
      } catch (_) {}

      await _log('add', 'Renewal invoice issued',
        `${invNumber} — ${sub.clientName} — KSh ${amount.toLocaleString()} (+${days}d)`);

      _toast(`Invoice ${invNumber} created for KSh ${amount.toLocaleString()}.`, 'success');
      finish();

      /* Offer to open the invoice view */
      setTimeout(async () => {
        const ok = await _confirm('Invoice created.\n\nOpen it now to send an M-Pesa STK Push?', {
          title: 'View invoice', confirmLabel: 'Open', cancelLabel: 'Later', confirmClass: 'btn-primary'
        });
        if (ok && typeof window.Viora?.viewInvoice === 'function') {
          window.Viora.viewInvoice(invId);
        }
      }, 400);
    } catch (e) {
      console.error('[subscriptions] invoice failed', e);
      _toast('Invoice generation failed: ' + (e.message || 'unknown'), 'error');
      btn.disabled = false;
      btn.innerHTML = prevHtml;
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   ACTION — NOTIFY CLIENT
   ═══════════════════════════════════════════════════════════════ */
async function notifyClient(sub) {
  if (typeof D.getClient !== 'function') { _toast('Client lookup unavailable.', 'error'); return; }
  const client = D.getClient(sub.clientId);
  if (!client) { _toast('Client record not found.', 'error'); return; }
  if (!client.phone) { _toast('Client has no phone number on file.', 'warning'); return; }

  const now = _now();
  const e = evaluateSubscription(sub, now);
  const firstName = String(client.name || 'there').split(' ')[0];

  let message = '';
  if (!e.allowed) {
    message =
      `Hi ${firstName},\n\n` +
      `Your VIORA subscription to *${sub.productName}* has ended.\n\n` +
      `To keep using it, please renew here:\n` +
      `https://viora.co.ke/client.html?renew=${encodeURIComponent(sub.productId)}\n\n` +
      `Or reply to this message and we'll help.\n\n` +
      `— VIORA Support`;
  } else if (e.inGrace) {
    const hours = Math.max(1, Math.ceil(e.msRemaining / 3600000));
    message =
      `Hi ${firstName},\n\n` +
      `Your VIORA subscription to *${sub.productName}* is in its grace window ` +
      `(${hours} hours left).\n\n` +
      `Renew now to avoid interruption:\n` +
      `https://viora.co.ke/client.html?renew=${encodeURIComponent(sub.productId)}\n\n` +
      `— VIORA Support`;
  } else {
    const days = e.daysRemaining ?? 0;
    message =
      `Hi ${firstName},\n\n` +
      `A friendly reminder — your VIORA subscription to *${sub.productName}* ` +
      `expires in *${days} days* (${fmtShort(sub.endDate)}).\n\n` +
      `Renew here:\n` +
      `https://viora.co.ke/client.html?renew=${encodeURIComponent(sub.productId)}\n\n` +
      `— VIORA Support`;
  }

  if (typeof D.logComm === 'function') {
    try {
      await D.logComm('wa', client.id, client.name, client.phone, '', message, {
        reason: 'subscription-notify-' + e.reason,
        dedupeKey: `sub-notify:${sub.id}:${e.reason}:${Math.floor(now / 86400000)}`
      });
    } catch (_) {}
  }

  const phone = typeof D.normalizePhone === 'function'
    ? D.normalizePhone(client.phone)
    : String(client.phone).replace(/\D/g, '');
  try {
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  } catch (_) {}

  _toast('WhatsApp opened with reminder.', 'success');
}

/* ═══════════════════════════════════════════════════════════════
   ACTION — NEW SUBSCRIPTION
   ═══════════════════════════════════════════════════════════════ */
function openNewSubscriptionModal() {
  const clients = (typeof D.getClients === 'function' ? D.getClients() : [])
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const products = (_data().products || [])
    .filter(p => p && p.status !== 'archived')
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (!clients.length)   { _toast('Add a client first.', 'warning'); return; }
  if (!products.length)  { _toast('Add a product first.', 'warning'); return; }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '9999';

  overlay.innerHTML = `
    <div class="modal" style="max-width:600px;">
      <h2>
        <span class="modal-icon" style="background:linear-gradient(135deg,#22e6a0,#00d4ff);">
          <i class="fa-solid fa-key"></i>
        </span>
        New Subscription
      </h2>

      <label>Client *</label>
      <select id="nsClient">
        ${clients.map(c => `<option value="${_esc(c.id)}">${_esc(c.name)} — ${_esc(c.email || '')}</option>`).join('')}
      </select>

      <label>Product *</label>
      <select id="nsProduct">
        ${products.map(p => `<option value="${_esc(p.id)}" data-name="${_esc(p.name)}" data-price="${Number(p.price) || 0}" data-icon="${_esc(p.icon || 'fa-solid fa-cube')}">${_esc(p.name)}</option>`).join('')}
      </select>

      <div class="form-row">
        <div>
          <label>Plan *</label>
          <select id="nsPlan">
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
            <option value="lifetime">Lifetime (one-time)</option>
          </select>
        </div>
        <div>
          <label>Amount (KES)</label>
          <input type="number" id="nsAmount" min="0" step="1" value="0" />
        </div>
      </div>

      <div class="form-row">
        <div><label>Start Date</label><input type="date" id="nsStart" value="${todayIso()}" /></div>
        <div>
          <label>Status</label>
          <select id="nsStatus">
            <option value="active">Active (paid)</option>
            <option value="pending_payment" selected>Pending Payment</option>
          </select>
        </div>
      </div>

      <label>Unlocked Modules (comma-separated; leave blank for whole product)</label>
      <input id="nsModules" placeholder="e.g. pos, inventory, crm" />

      <label>Grace Window (hours)</label>
      <input type="number" id="nsGrace" value="${DEFAULT_GRACE_HOURS}" min="0" max="720" />

      <label>Notes (internal)</label>
      <input id="nsNotes" placeholder="e.g. Trial upgrade from portal" />

      <div id="nsSummary" style="margin-top:14px;padding:12px;background:var(--bg-input);border-radius:10px;border:1px solid var(--border-color);font-size:.85rem;"></div>

      <div class="form-actions" style="margin-top:20px;">
        <button type="button" class="btn btn-outline" data-act="cancel">Cancel</button>
        <button type="button" class="btn btn-success" data-act="confirm">
          <i class="fa-solid fa-check"></i> Create Subscription
        </button>
      </div>
    </div>
  `;

  const finish = _openOverlay(overlay);

  const inpProduct = overlay.querySelector('#nsProduct');
  const inpPlan    = overlay.querySelector('#nsPlan');
  const inpAmt     = overlay.querySelector('#nsAmount');
  const inpStart   = overlay.querySelector('#nsStart');
  const summary    = overlay.querySelector('#nsSummary');

  function recalc() {
    const pOpt = inpProduct.selectedOptions[0];
    const priceUSD = Number(pOpt?.dataset.price || 0);
    const productName = pOpt?.dataset.name || '';
    const plan = inpPlan.value;
    const startIso = inpStart.value || todayIso();
    const amount = Number(inpAmt.value) || 0;

    const endDate = plan === PLAN.LIFETIME ? null : computeEndDate(plan, startIso);

    summary.innerHTML = `
      <div style="display:flex;justify-content:space-between;"><span>Product:</span><strong>${_esc(productName)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;"><span>Plan:</span><strong>${_esc(plan)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;"><span>Start:</span><strong>${fmtShort(startIso)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;">
        <span>End:</span>
        <strong style="color:${plan === 'lifetime' ? 'var(--accent-blue)' : 'var(--accent-green)'};">
          ${plan === 'lifetime' ? 'Never (lifetime)' : fmtLong(endDate)}
        </strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;"><span>Amount:</span><strong>KSh ${amount.toLocaleString()}</strong></div>
    `;
  }

  recalc();
  inpProduct.addEventListener('change', () => {
    const pOpt = inpProduct.selectedOptions[0];
    const usd = Number(pOpt?.dataset.price || 0);
    inpAmt.value = Math.round(usd * 129);
    recalc();
  });
  inpPlan.addEventListener('change', recalc);
  inpAmt.addEventListener('input', recalc);
  inpStart.addEventListener('change', recalc);

  overlay.querySelector('[data-act="cancel"]').addEventListener('click', finish);

  overlay.querySelector('[data-act="confirm"]').addEventListener('click', async () => {
    const clientId = overlay.querySelector('#nsClient').value;
    const productId = inpProduct.value;
    const pOpt = inpProduct.selectedOptions[0];
    const productName = pOpt?.dataset.name || productId;
    const productIcon = pOpt?.dataset.icon || 'fa-solid fa-cube';
    const client = clients.find(c => c.id === clientId);

    const plan = inpPlan.value;
    const amount = Number(inpAmt.value) || 0;
    const start = inpStart.value || todayIso();
    const status = overlay.querySelector('#nsStatus').value;
    const modulesRaw = overlay.querySelector('#nsModules').value.trim();
    const modules = modulesRaw ? modulesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const grace = Number(overlay.querySelector('#nsGrace').value) || DEFAULT_GRACE_HOURS;
    const notes = overlay.querySelector('#nsNotes').value.trim();

    const btn = overlay.querySelector('[data-act="confirm"]');
    const prevHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating…';

    try {
      const record = buildSubscription({
        clientId,
        clientName: client?.name || '',
        productId,
        productName,
        productIcon,
        plan,
        status,
        startDate: new Date(start).toISOString(),
        graceHours: grace,
        modules,
        amountKES: amount,
        billingCycle: plan,
        notes,
        createdBy: (D.state && D.state.operator && D.state.operator.name) || 'admin'
      });

      const v = validateSubscription(record);
      if (!v.ok) {
        _toast('Validation failed: ' + v.errors.join('; '), 'error');
        btn.disabled = false;
        btn.innerHTML = prevHtml;
        return;
      }

      await D.set(D.ref(D.db, `${SUBSCRIPTION_PATH}/${record.id}`), record);

      const licId = 'lic-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await D.set(D.ref(D.db, `${LICENSES_PATH}/${licId}`), {
        licenseKey: licId,
        subscriptionId: record.id,
        productId,
        clientId,
        deviceFingerprint: null,
        installedAt: null,
        lastCheckAt: null,
        status: 'active'
      });

      await _log('add', 'Subscription created',
        `${record.clientName} — ${record.productName} (${record.plan})`);

      try {
        D.EventBus?.emit?.('subscriptions.created', record, record.id, {
          collection: 'subscriptions',
          source: 'admin-manual'
        });
      } catch (_) {}

      _toast(`Subscription created. License: ${licId}`, 'success');
      finish();
      renderSubscriptions();

      setTimeout(async () => {
        const copy = await _confirm(
          `License key generated:\n\n${licId}\n\n` +
          `Give this to the client so they can install the PWA.\n\n` +
          `Copy to clipboard now?`,
          { title: 'License key', confirmLabel: 'Copy', cancelLabel: 'Close', confirmClass: 'btn-success' }
        );
        if (copy) {
          try { await navigator.clipboard.writeText(licId); _toast('Copied.', 'success'); }
          catch (_) { _toast('Copy failed — select manually.', 'warning'); }
        }
      }, 300);
    } catch (e) {
      console.error('[subscriptions] create failed', e);
      _toast('Create failed: ' + (e.message || 'unknown'), 'error');
      btn.disabled = false;
      btn.innerHTML = prevHtml;
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   CSV EXPORT
   ═══════════════════════════════════════════════════════════════ */
function exportCsv() {
  const now = _now();
  const list = applyFilters(_allSubs(), now);
  if (!list.length) { _toast('Nothing to export.', 'warning'); return; }

  const header = [
    'ID', 'Client', 'Client ID', 'Product', 'Plan', 'Status',
    'Start', 'End', 'Grace Hours', 'Amount KES',
    'Modules', 'Renewals', 'Last Verified'
  ];
  const rows = [header];

  for (const s of list) {
    const e = evaluateSubscription(s, now);
    rows.push([
      s.id,
      s.clientName || '',
      s.clientId || '',
      s.productName || s.productId || '',
      s.plan || '',
      s.status || (e.allowed ? 'active' : 'expired'),
      s.startDate || '',
      s.endDate || '',
      s.graceHours ?? DEFAULT_GRACE_HOURS,
      s.amountKES ?? 0,
      (s.modules || []).join('|'),
      s.renewalCount || 0,
      s.lastVerifiedAt || ''
    ]);
  }

  const csv = rows.map(r =>
    r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `subscriptions-${todayIso()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  _toast(`Exported ${list.length} subscriptions.`, 'success');
}

/* ═══════════════════════════════════════════════════════════════
   PUBLIC
   ═══════════════════════════════════════════════════════════════ */
function subsForClient(clientId) {
  return _allSubs().filter(s => s && s.clientId === clientId);
}

export const SubscriptionsAdmin = {
  render: renderSubscriptions,
  subsForClient,
  allSubs: _allSubs,
  abortModals: abortSubscriptionsModals
};
