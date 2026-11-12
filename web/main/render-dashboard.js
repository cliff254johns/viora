// main/render-dashboard.js
// ═══════════════════════════════════════════════════════════════
//  Dashboard + Admin Analytics + Notifications + Recommendations
//  v8.1 — bug-fixed rewrite
//
//  Fixes vs v8.0:
//    • bindDashboardNotificationControls moved inside initDashboardNotifications
//      so filter buttons bind after the DOM exists.
//    • renderNotifications properly clears #notifDropdown on first call.
//    • renderProfile now renders a logo if getLogoImg is wired.
//    • renderAdminAnalytics guards against stale destroyed Chart refs.
//    • buildNotifications handles missing getOverdueInstallments gracefully.
//    • _signalDashboardPainted dispatches AFTER dashboard content paints
//      (via rAF after the write queue flushes).
//    • _dnState + notification functions are self-contained here — main.js
//      no longer needs its own copy.
//    • Chart.js missing logs once and returns early.
//    • All getters have safe fallbacks; no `undefined` crashes.
//    • Removed unused `renderClientCards` path that crashed on undefined.
// ═══════════════════════════════════════════════════════════════

let _ctx = null;

export function initRenderDashboard(ctx) {
  _ctx = Object.assign(_ctx || {}, ctx || {});

  // Reset per-init caches so a fresh ctx rebuilds cleanly.
  _refs = null;
  _dashSig.stats = '';
  _dashSig.reminders = '';
  _dashSig.alerts = '';
  _dashSig.activity = '';
  _notifSig.list = '';
  _analyticsSig.data = '';
  _dashComputed = null;
  _vioraNotifUnsub = null;
  _vioraNotifSeen.clear();
  _refreshRecTimer = null;
  _refreshRecInFlight = false;

  return _ctx;
}

function ctx() { return _ctx || {}; }

/* ── Micro-helpers ── */
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const DEFAULT_ESCAPE = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const E = (s) => {
  const c = ctx();
  return typeof c.escapeHtml === 'function' ? c.escapeHtml(s) : DEFAULT_ESCAPE(s);
};

const q = (s) => String(s == null ? '' : s)
  .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

const safe$ = (id) => {
  const c = ctx();
  if (typeof c.$ === 'function') {
    try { return c.$(id); } catch (_) {}
  }
  return typeof document !== 'undefined' ? document.getElementById(id) : null;
};

const safeState = () => ctx().state || { data: {}, operator: null };
const safeData  = () => {
  const s = safeState();
  return (s && s.data && typeof s.data === 'object') ? s.data : {};
};

/* callOr — returns a VALUE (never a function); never throws. */
function callOr(name, fallback, ...args) {
  const fn = ctx()[name];
  if (typeof fn !== 'function') return fallback;
  try {
    const out = fn.apply(null, args);
    return out === undefined || out === null ? fallback : out;
  } catch (e) {
    console.warn('[dash] ' + name + ' threw', e);
    return fallback;
  }
}

/* ═══════════════════════════════════════════════════════════════
   MEMOIZATION LAYER
   ═══════════════════════════════════════════════════════════════ */

function sigOf(arr, fields) {
  if (!Array.isArray(arr) || !arr.length) return '0';
  let h = 5381;
  const n = arr.length;
  const fieldCount = fields ? fields.length : 0;
  for (let i = 0; i < n; i++) {
    const o = arr[i];
    if (!o) continue;
    const id = o.id || o.uid || '';
    for (let j = 0; j < id.length; j++) h = ((h << 5) + h + id.charCodeAt(j)) | 0;
    for (let f = 0; f < fieldCount; f++) {
      const v = o[fields[f]];
      if (v == null) continue;
      const s = typeof v === 'string' ? v : String(v);
      for (let j = 0; j < s.length; j++) h = ((h << 5) + h + s.charCodeAt(j)) | 0;
    }
  }
  return n + ':' + (h >>> 0).toString(36);
}

/* HTML cache — skip rewrite when the string hasn't changed. */
const _htmlCache = new WeakMap();
function setHtmlIfChanged(el, html) {
  if (!el) return false;
  if (_htmlCache.get(el) === html) return false;
  _htmlCache.set(el, html);
  el.innerHTML = html;
  return true;
}

/* Batched DOM writer — dedupes by key, coalesces into one rAF. */
const _pendingWrites = new Map();
let _rafScheduled = false;
function scheduleWrite(fn, key) {
  const k = key || fn;
  _pendingWrites.set(k, fn);
  if (_rafScheduled) return;
  _rafScheduled = true;
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => setTimeout(cb, 16);
  raf(() => {
    _rafScheduled = false;
    const batch = Array.from(_pendingWrites.values());
    _pendingWrites.clear();
    for (const f of batch) {
      try { f(); } catch (e) { console.warn('[dash] write failed', e); }
    }
  });
}

/* Idle scheduler — defer heavy work off the critical path. */
const _idle = (fn, timeout = 1200) => {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout });
  } else {
    setTimeout(fn, 0);
  }
};

/* Dashboard visibility check. */
function _dashboardVisible() {
  const s = safeState();
  if (s.currentTab !== 'dashboard') return false;
  const el = document.getElementById('tab-dashboard');
  // Treat "exists but class not yet applied" as visible — the class
  // is applied in the same frame by the router.
  return !!el;
}

/* ═══════════════════════════════════════════════════════════════
   CACHED DOM REFS
   ═══════════════════════════════════════════════════════════════ */
let _refs = null;
function refs() {
  if (_refs && _refs.dashboardStats && _refs.dashboardStats.isConnected) return _refs;
  _refs = {
    dashboardStats:          document.getElementById('dashboardStats'),
    reminderBannerContainer: document.getElementById('reminderBannerContainer'),
    alertBannerContainer:    document.getElementById('alertBannerContainer'),
    dashboardActivity:       document.getElementById('dashboardActivity'),
    notifBody:               document.getElementById('notifBody'),
    notifDropdown:           document.getElementById('notifDropdown'),
    notifCount:              document.getElementById('notifCount'),
    notifCountMobile:        document.getElementById('notifCountMobile'),
    aiRecPanelBody:          document.getElementById('aiRecPanelBody'),
    adminAnalyticsBlock:     document.getElementById('adminAnalyticsBlock'),
    standardTimelineBlock:   document.getElementById('standardTimelineBlock'),
    ledgerBody:              document.getElementById('ledgerBody'),
  };
  return _refs;
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════════ */
const _dashSig = {
  reminders: '',
  alerts: '',
  activity: ''
};

let _dashComputed = null;

function buildStatsHtml(m) {
  return `
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-users"></i></div><div class="number">${m.clients}</div><div class="label">Clients</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-user-plus"></i></div><div class="number">${m.leadCount}</div><div class="label">Leads</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-headset"></i></div><div class="number">${m.openTickets}</div><div class="label">Open Tickets</div></div>
    <div class="stat-card" style="${m.urgentTickets > 0 ? 'border-left:4px solid var(--accent-red);' : ''}"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="number" style="${m.urgentTickets > 0 ? 'color:var(--accent-red);' : ''}">${m.urgentTickets}</div><div class="label">Urgent</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-store"></i></div><div class="number">${m.productCount}</div><div class="label">Products</div><div class="kpi-sub">${m.mp.paidOrders} sold</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-receipt"></i></div><div class="number">${m.mp.totalOrders}</div><div class="label">Market Orders</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-coins"></i></div><div class="number">${m.mpRev}</div><div class="label">Market Revenue</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-calendar-check"></i></div><div class="number">${m.appointments}</div><div class="label">Appointments</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-chalkboard-user"></i></div><div class="number">${m.presentations}</div><div class="label">Presentations</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-handshake"></i></div><div class="number">${m.openDeals}</div><div class="label">Open Deals</div><div class="kpi-sub">${m.pipelineFmt}</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-folder"></i></div><div class="number">${m.activeProjects}</div><div class="label">Active Projects</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-coins"></i></div><div class="number">${m.revenueFmt}</div><div class="label">Payments Received</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-calendar-check"></i></div><div class="number">${m.pendingTasks}</div><div class="label">Pending Tasks</div></div>
    <div class="stat-card" style="${m.overdueTasks > 0 ? 'border-left:4px solid var(--accent-red);' : ''}"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="number" style="${m.overdueTasks > 0 ? 'color:var(--accent-red);' : ''}">${m.overdueTasks}</div><div class="label">Overdue</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-file-invoice"></i></div><div class="number">${m.invoiceCount}</div><div class="label">Invoices</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-hourglass-half"></i></div><div class="number" style="${m.unpaidInvoices > 0 ? 'color:var(--accent-gold)' : ''}">${m.unpaidInvoices}</div><div class="label">Unpaid</div></div>
  `;
}

export function renderDashboard() {
  try {
    const c = ctx();
    const state = safeState();
    const data = state.data || {};
    const R = refs();

       /* ── Stats — no longer paint a 16-card grid here.
       KPI grid is owned by renderDashboardKpis(). We only compute
       the small summary values that later blocks need. ── */
    const tasksArr    = Array.isArray(data.tasks) ? data.tasks : [];
    const projectsArr = Array.isArray(data.projects) ? data.projects : [];
    const invoicesArr = Array.isArray(data.invoices) ? data.invoices : [];
    const dealsArr    = Array.isArray(data.deals) ? data.deals : [];

    const isOverdueFn = c.isOverdue;
    let pendingTasks = 0, overdueTasks = 0;
    for (let i = 0; i < tasksArr.length; i++) {
      const t = tasksArr[i];
      if (!t || t.status !== 'pending') continue;
      pendingTasks++;
      if (typeof isOverdueFn === 'function' ? isOverdueFn(t.dueDate) : false) overdueTasks++;
    }
    void pendingTasks;

     const mp = callOr('getMarketplaceMetrics', { paidOrders: 0, totalOrders: 0, totalRevenueKES: 0 });
    // v8.2 — hoisted to function scope: do NOT redeclare `mp` below.
    // That was the SyntaxError "redeclaration of const mp".

    _dashComputed = {
      overdueTasks,
      mp,
      todayStr: callOr('todayStr', new Date().toISOString().slice(0, 10))
    };

    /* ── Reminders + Alerts ── */
    const overdueInst  = callOr('getOverdueInstallments', []);
    const upcomingInst = callOr('getUpcomingInstallments', [], 7);
    const todayStr     = (_dashComputed && _dashComputed.todayStr)
                       || callOr('todayStr', new Date().toISOString().slice(0, 10));
    const apptArr      = Array.isArray(data.appointments) ? data.appointments : [];

    let todayApptsCount = 0;
    let todayApptsSample = null;
    for (let i = 0; i < apptArr.length; i++) {
      const a = apptArr[i];
      if (!a || a.date !== todayStr || a.status !== 'scheduled') continue;
      todayApptsCount++;
      if (!todayApptsSample) todayApptsSample = a;
    }

      const remSig = `${overdueInst.length}|${upcomingInst.length}|${todayApptsCount}|${mp.pendingOrders || 0}|` +
      (overdueInst[0] ? (overdueInst[0].clientId || overdueInst[0].clientName || '') : '') +
      (todayApptsSample ? (todayApptsSample.id || todayApptsSample.title || '') : '');

    if (remSig !== _dashSig.reminders) {
      _dashSig.reminders = remSig;
      let remHtml = '';
      if (overdueInst.length) {
        const names = overdueInst.slice(0, 2).map(i => E(i.clientName || '')).join(' · ');
        remHtml += `<div class="alert-banner danger"><i class="fa-solid fa-triangle-exclamation"></i> <strong>${overdueInst.length} overdue installment${overdueInst.length > 1 ? 's' : ''}</strong> · ${names} <button class="btn btn-whatsapp btn-sm" onclick="Viora.bulkRemind()">Remind</button></div>`;
      }
      if (upcomingInst.length) {
        remHtml += `<div class="alert-banner warning"><i class="fa-solid fa-calendar"></i> <strong>${upcomingInst.length} upcoming installment${upcomingInst.length > 1 ? 's' : ''}</strong> (7 days)</div>`;
      }
      if (todayApptsCount) {
        const title = todayApptsSample ? E(todayApptsSample.title || '') : '';
        remHtml += `<div class="alert-banner info"><i class="fa-solid fa-calendar-check"></i> <strong>${todayApptsCount} appointment${todayApptsCount > 1 ? 's' : ''} today</strong> · ${title} <button class="btn btn-primary btn-sm" onclick="Viora.navigate('marketing-appointments')">View</button></div>`;
      }
      if ((mp.pendingOrders || 0) > 0) {
        remHtml += `<div class="alert-banner warning"><i class="fa-solid fa-shopping-cart"></i> <strong>${mp.pendingOrders} pending marketplace order${mp.pendingOrders > 1 ? 's' : ''}</strong> awaiting payment <button class="btn btn-primary btn-sm" onclick="Viora.navigate('marketplace-orders')">View</button></div>`;
      }
      scheduleWrite(() => {
        setHtmlIfChanged(R.reminderBannerContainer, remHtml);
      }, 'reminderBanner');
    }

    const abSig = String(overdueTasks);
    if (abSig !== _dashSig.alerts) {
      _dashSig.alerts = abSig;
      const abHtml = overdueTasks > 0
        ? `<div class="alert-banner danger"><i class="fa-solid fa-triangle-exclamation"></i> <strong>${overdueTasks} overdue task${overdueTasks > 1 ? 's' : ''}</strong></div>`
        : `<div class="alert-banner success"><i class="fa-solid fa-check-circle"></i> All caught up</div>`;
      scheduleWrite(() => {
        setHtmlIfChanged(R.alertBannerContainer, abHtml);
      }, 'alertBanner');
    }

 
    /* ── Activity feed ── */
    const daHost = R.dashboardActivity;
    if (daHost) {
      const log = Array.isArray(data.activityLog) ? data.activityLog : [];
      const actSig = log.length + ':' + (log[0] ? (log[0].id || log[0].timestamp || '') : '');
      if (actSig !== _dashSig.activity) {
        _dashSig.activity = actSig;
           const recent = log.slice(0, 3);
        const iconMap = { add: '➕', edit: '✏️', delete: '🗑️', send: '📤', upload: '📎', pay: '💰' };
        const moreHtml = log.length > 3
          ? `<div style="text-align:right;margin-top:8px;">
               <button type="button" class="btn btn-outline btn-xs"
                 onclick="window.Viora && window.Viora.navigate && window.Viora.navigate('admin-activity')">
                 View all activity <i class="fa-solid fa-arrow-right"></i>
               </button>
             </div>`
          : '';
        const html = recent.length === 0
          ? `<div class="empty-state">No activity yet.</div>`
          : recent.map(a => {
              const t = a.type || '';
              const icon = Object.prototype.hasOwnProperty.call(iconMap, t) ? iconMap[t] : '📌';
              const typeSafe = t.replace(/[^a-z0-9_-]/gi, '');
              const when = callOr('timeAgo', a.timestamp || '', a.timestamp);
              return `<div class="activity-item ${typeSafe}">
                <span class="act-icon">${icon}</span>
                <div class="act-body">
                  <div class="act-title">${E(a.title || '')}</div>
                  ${a.description ? `<div class="act-desc">${E(a.description)}</div>` : ''}
                </div>
                <div class="act-time">${when}</div>
              </div>`;
            }).join('') + moreHtml;
        setHtmlIfChanged(daHost, html);
      }
    }

    /* ── Signal paint AFTER the write queue flushes ── */
    scheduleWrite(() => _signalDashboardPainted(), 'dashboardPainted');

     /* ── Deferred heavy work ── */
    _idle(() => {
      try { renderNotifications(); } catch (e) { /* silent */ }
      try { refreshRecommendations(); } catch (e) { /* silent */ }
      try { renderDashboardCharts(); } catch (e) { /* silent */ }
    }, 800);

   
  } catch (e) {
    console.warn('renderDashboard failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD PAINT SIGNAL
   ═══════════════════════════════════════════════════════════════ */
function _signalDashboardPainted() {
  if (typeof window === 'undefined') return;
  if (window.__vioraDashboardPainted) return;
  window.__vioraDashboardPainted = true;
  try {
    window.dispatchEvent(new CustomEvent('viora:dashboard-painted'));
  } catch (e) { /* ignore */ }
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD CHARTS  (exec + admin only)
   Paints 4 charts into #dashboardChartsGrid:
     • Revenue trend (line)  — last 6 months from payments
     • Task status (doughnut) — pending / done / overdue
     • Invoice aging (bar)   — current / 1-30 / 31-60 / 60+
     • Project ROI (bar)     — from renderAdminAnalytics' roiData
   ═══════════════════════════════════════════════════════════════ */
export function renderDashboardCharts() {
  try {
    const state = safeState();
    const role = state && state.operator && state.operator.role;
    if (role !== 'exec' && role !== 'admin') return;

    if (typeof Chart === 'undefined') {
      if (!window.__vioraChartMissingWarned) {
        window.__vioraChartMissingWarned = true;
        console.warn('[dash] Chart.js not loaded — dashboard charts disabled');
      }
      return;
    }

    const data = safeData();
    const tc = callOr('getTextColor', '#94a3b8');
    const gc = 'rgba(148,163,184,0.15)';
    const safeCanvas = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        el.style.width = '100%';
        el.style.height = '220px';
      }
      return { canvas: el, ctx: el.getContext('2d') };
    };
    const destroyChart = (id) => {
      if (state.charts && state.charts[id]) {
        try { state.charts[id].destroy(); } catch (_) {}
        delete state.charts[id];
      }
    };

    state.charts = state.charts || {};

    /* ── 1. Revenue trend — last 6 months ── */
    try {
      const payments = Array.isArray(data.payments) ? data.payments : [];
      const buckets = new Map();
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toISOString().slice(0, 7);
        buckets.set(key, 0);
      }
      for (let i = 0; i < payments.length; i++) {
        const p = payments[i];
        if (!p || !p.date) continue;
        const k = String(p.date).slice(0, 7);
        if (buckets.has(k)) buckets.set(k, buckets.get(k) + num(p.amount));
      }
      const labels = Array.from(buckets.keys()).map(k => {
        const d = new Date(k + '-01');
        return d.toLocaleDateString('en-US', { month: 'short' });
      });
      const values = Array.from(buckets.values());

      destroyChart('dashRevTrend');
      const c = safeCanvas('dashRevTrend');
      if (c && c.ctx) {
        const grad = c.ctx.createLinearGradient(0, 0, 0, 220);
        grad.addColorStop(0, 'rgba(34,230,160,0.55)');
        grad.addColorStop(1, 'rgba(34,230,160,0.02)');
        state.charts['dashRevTrend'] = new Chart(c.ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Revenue',
              data: values,
              borderColor: '#22e6a0',
              backgroundColor: grad,
              fill: true,
              tension: 0.4,
              borderWidth: 2,
              pointRadius: 3,
              pointBackgroundColor: '#22e6a0'
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, ticks: { color: tc, callback: v => 'KSh ' + Number(v).toLocaleString() }, grid: { color: gc } },
              x: { ticks: { color: tc }, grid: { display: false } }
            }
          }
        });
      }
    } catch (e) { console.warn('[dash charts] revenue trend failed', e); }

    /* ── 2. Task status ── */
    try {
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      let pending = 0, done = 0, overdue = 0;
      const today = callOr('todayStr', new Date().toISOString().slice(0, 10));
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        if (!t) continue;
        if (t.status === 'done' || t.status === 'completed') done++;
        else if (t.status === 'pending') {
          if (t.dueDate && String(t.dueDate).slice(0, 10) < today) overdue++;
          else pending++;
        }
      }
      destroyChart('dashTaskStatus');
      const c = safeCanvas('dashTaskStatus');
      if (c && c.ctx) {
        state.charts['dashTaskStatus'] = new Chart(c.ctx, {
          type: 'doughnut',
          data: {
            labels: ['Pending', 'Done', 'Overdue'],
            datasets: [{
              data: [pending, done, overdue],
              backgroundColor: ['#00d4ff', '#22e6a0', '#ff5c7c'],
              borderColor: '#0a0a0f',
              borderWidth: 2
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '58%',
            animation: { duration: 250 },
            plugins: { legend: { position: 'bottom', labels: { color: tc, font: { size: 11 }, boxWidth: 12, usePointStyle: true } } }
          }
        });
      }
    } catch (e) { console.warn('[dash charts] task status failed', e); }

    /* ── 3. Invoice aging ── */
    try {
      const invoices = Array.isArray(data.invoices) ? data.invoices : [];
      const getStatus = (inv) => callOr('getInvoiceStatusDerived', inv?.status || 'draft', inv);
      const getTotals = (inv) => callOr('getInvoiceTotals', { total: 0 }, inv);
      const getPaid = (id) => callOr('getInvoicePaidAmount', 0, id);

      let current = 0, d30 = 0, d60 = 0, d90 = 0;
      const todayMs = Date.now();
      for (let i = 0; i < invoices.length; i++) {
        const inv = invoices[i];
        if (!inv) continue;
        const st = getStatus(inv);
        if (st === 'paid' || st === 'draft') continue;
        const balance = Math.max(0, num(getTotals(inv).total) - num(getPaid(inv.id)));
        if (balance <= 0) continue;
        const due = inv.dueDate ? Date.parse(inv.dueDate) : todayMs;
        const ageDays = Number.isFinite(due) ? Math.max(0, Math.floor((todayMs - due) / 86400000)) : 0;
        if (ageDays <= 0) current += balance;
        else if (ageDays <= 30) d30 += balance;
        else if (ageDays <= 60) d60 += balance;
        else d90 += balance;
      }
      destroyChart('dashInvAging');
      const c = safeCanvas('dashInvAging');
      if (c && c.ctx) {
        state.charts['dashInvAging'] = new Chart(c.ctx, {
          type: 'bar',
          data: {
            labels: ['Current', '1–30d', '31–60d', '60+d'],
            datasets: [{
              label: 'Outstanding (KES)',
              data: [current, d30, d60, d90],
              backgroundColor: ['#22e6a0', '#00d4ff', '#ffc857', '#ff5c7c'],
              borderRadius: 6,
              borderWidth: 0
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, ticks: { color: tc, callback: v => 'KSh ' + Number(v).toLocaleString() }, grid: { color: gc } },
              x: { ticks: { color: tc }, grid: { display: false } }
            }
          }
        });
      }
    } catch (e) { console.warn('[dash charts] invoice aging failed', e); }

    /* ── 4. Project ROI ── */
    try {
      const projects = Array.isArray(data.projects) ? data.projects : [];
      const expenses = Array.isArray(data.expenses) ? data.expenses : [];
      const payroll  = Array.isArray(data.payroll)  ? data.payroll  : [];
      const invoices = Array.isArray(data.invoices) ? data.invoices : [];

      const invoicedByProject = new Map();
      for (let i = 0; i < invoices.length; i++) {
        const inv = invoices[i];
        if (!inv) continue;
        const items = inv.items;
        if (Array.isArray(items) && items.length) {
          for (let j = 0; j < items.length; j++) {
            const it = items[j];
            const pid = it.projectId || inv.projectId;
            if (pid) invoicedByProject.set(pid, (invoicedByProject.get(pid) || 0) + num(it.amount));
          }
        } else if (inv.projectId) {
          invoicedByProject.set(inv.projectId, (invoicedByProject.get(inv.projectId) || 0) + num(inv.total));
        }
      }
      const expByProj = new Map();
      for (let i = 0; i < expenses.length; i++) {
        const e = expenses[i];
        if (!e || !e.projectId) continue;
        expByProj.set(e.projectId, (expByProj.get(e.projectId) || 0) + num(e.amount));
      }
      const payByProj = new Map();
      for (let i = 0; i < payroll.length; i++) {
        const p = payroll[i];
        if (!p || !p.projectId) continue;
        payByProj.set(p.projectId, (payByProj.get(p.projectId) || 0) + num(p.net));
      }

      const roiRows = [];
      for (let i = 0; i < projects.length; i++) {
        const p = projects[i];
        if (!p) continue;
        const inv = invoicedByProject.get(p.id) || 0;
        const cost = (expByProj.get(p.id) || 0) + (payByProj.get(p.id) || 0);
        if (!inv && !cost) continue;
        const roi = cost > 0 ? ((inv - cost) / cost) * 100 : (inv > 0 ? 100 : 0);
        roiRows.push({ label: p.projectNumber || p.title || '—', roi });
      }
      roiRows.sort((a, b) => b.roi - a.roi);
      const top = roiRows.slice(0, 8);

      destroyChart('dashProjRoi');
      const c = safeCanvas('dashProjRoi');
      if (c && c.ctx && top.length) {
        state.charts['dashProjRoi'] = new Chart(c.ctx, {
          type: 'bar',
          data: {
            labels: top.map(r => r.label),
            datasets: [{
              label: 'ROI %',
              data: top.map(r => Number(r.roi.toFixed(1))),
              backgroundColor: top.map(r => r.roi >= 0 ? 'rgba(34,230,160,0.75)' : 'rgba(255,92,124,0.75)'),
              borderColor:     top.map(r => r.roi >= 0 ? '#22e6a0' : '#ff5c7c'),
              borderWidth: 1,
              borderRadius: 6
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
            plugins: { legend: { display: false } },
            scales: {
              y: { ticks: { color: tc, callback: v => v + '%' }, grid: { color: gc } },
              x: { ticks: { color: tc, font: { size: 9 } }, grid: { display: false } }
            }
          }
        });
      }
    } catch (e) { console.warn('[dash charts] project ROI failed', e); }
  } catch (e) {
    console.warn('renderDashboardCharts failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN ANALYTICS
   ═══════════════════════════════════════════════════════════════ */
const _analyticsSig = { data: '' };

export function renderAdminAnalytics() {
  try {
    const c = ctx();
    const state = safeState();
    const data = state.data || {};
    const R = refs();

    const isAdmin = state.operator?.role === 'exec' || state.operator?.role === 'admin';
    const adminBlock = R.adminAnalyticsBlock;
    const stdBlock   = R.standardTimelineBlock;
    if (!adminBlock || !stdBlock) return;

    adminBlock.style.display = isAdmin ? 'block' : 'none';
    stdBlock.style.display   = isAdmin ? 'none' : 'block';
    if (!isAdmin) return;

    /* Bail early if Chart.js isn't loaded */
    if (typeof Chart === 'undefined') {
      if (!window.__vioraChartMissingWarned) {
        window.__vioraChartMissingWarned = true;
        console.warn('[dash] Chart.js not loaded — analytics charts disabled');
      }
      return;
    }

    const projects = Array.isArray(data.projects) ? data.projects : [];
    const invoices = Array.isArray(data.invoices) ? data.invoices : [];
    const expenses = Array.isArray(data.expenses) ? data.expenses : [];
    const payroll  = Array.isArray(data.payroll)  ? data.payroll  : [];

    const sig = sigOf(projects, ['progress', 'status']) +
      '|' + sigOf(invoices, ['total']) +
      '|' + sigOf(expenses, ['amount', 'projectId']) +
      '|' + sigOf(payroll, ['net', 'projectId']);

    if (sig === _analyticsSig.data) return;
    _analyticsSig.data = sig;

    const tc = callOr('getTextColor', '#94a3b8');
    const gc = 'rgba(148,163,184,0.15)';
    const destroyChart  = (id) => callOr('destroyChart', null, id);
    const safeCanvas    = (id) => callOr('safeCanvas', null, id);
    const getClientName = (cid) => callOr('getClientName', '—', cid);
    const fmtKES        = (v) => callOr('fmtKES', String(v), v);

    /* Destroy any prior chart instances first */
    try { destroyChart('servicePieChart'); } catch (_) {}
    try { destroyChart('roiChart'); } catch (_) {}

    /* Clear state.charts entries that pointed to destroyed instances */
    if (state.charts) {
      delete state.charts['servicePieChart'];
      delete state.charts['roiChart'];
    }

    /* ── Service-area pie ── */
    const counts = Object.create(null);
    for (let i = 0; i < projects.length; i++) {
      const a = projects[i].serviceArea || 'Other';
      counts[a] = (counts[a] || 0) + 1;
    }
    const pieKeys = Object.keys(counts);
    if (pieKeys.length) {
      const c1 = safeCanvas('servicePieChart');
      if (c1 && c1.ctx) {
        const palette = ['#00d4ff', '#7c3aed', '#ff6ec7', '#22e6a0', '#ffc857', '#a855f7'];
        try {
          if (!state.charts) state.charts = {};
          state.charts['servicePieChart'] = new Chart(c1.ctx, {
            type: 'pie',
            data: {
              labels: pieKeys,
              datasets: [{
                data: pieKeys.map(k => counts[k]),
                backgroundColor: pieKeys.map((_, i) => palette[i % palette.length]),
                borderColor: '#0a0a0f',
                borderWidth: 2
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 200 },
              plugins: { legend: { position: 'right', labels: { color: tc, font: { size: 10 }, boxWidth: 12, usePointStyle: true } } }
            }
          });
        } catch (e) { console.warn('[analytics] pie chart failed', e); }
      }
    }

    /* ── ROI — pre-indexed by projectId ── */
    const invoicedByProject = new Map();
    const expensesByProject = new Map();
    const payrollByProject  = new Map();

    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      if (!inv) continue;
      const items = inv.items;
      if (Array.isArray(items) && items.length) {
        for (let j = 0; j < items.length; j++) {
          const it = items[j];
          const pid = it.projectId || inv.projectId;
          if (pid) invoicedByProject.set(pid, (invoicedByProject.get(pid) || 0) + num(it.amount));
        }
      } else if (inv.projectId) {
        invoicedByProject.set(inv.projectId, (invoicedByProject.get(inv.projectId) || 0) + num(inv.total));
      }
    }

    const clientOnlyInvoiced = new Map();
    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      if (!inv) continue;
      const items = inv.items;
      const hasProject = inv.projectId || (Array.isArray(items) && items.some(it => it.projectId));
      if (hasProject) continue;
      const total = Array.isArray(items) && items.length
        ? items.reduce((s, it) => s + num(it.amount), 0)
        : num(inv.total);
      clientOnlyInvoiced.set(inv.clientId, (clientOnlyInvoiced.get(inv.clientId) || 0) + total);
    }

    for (let i = 0; i < expenses.length; i++) {
      const e = expenses[i];
      if (!e || !e.projectId) continue;
      expensesByProject.set(e.projectId, (expensesByProject.get(e.projectId) || 0) + num(e.amount));
    }
    for (let i = 0; i < payroll.length; i++) {
      const p = payroll[i];
      if (!p || !p.projectId) continue;
      payrollByProject.set(p.projectId, (payrollByProject.get(p.projectId) || 0) + num(p.net));
    }

    const roiData = projects.map(p => {
      const exp = expensesByProject.get(p.id) || 0;
      const pr  = payrollByProject.get(p.id)  || 0;
      const cost = exp + pr;
      let invoiced = invoicedByProject.get(p.id) || 0;
      if (!invoiced && p.clientId) {
        invoiced = clientOnlyInvoiced.get(p.clientId) || 0;
      }
      return {
        projectId: p.id,
        projectNumber: p.projectNumber,
        title: p.title,
        clientName: getClientName(p.clientId),
        invoiced, expenses: exp, payroll: pr, cost,
        profit: invoiced - cost,
        margin: invoiced > 0 ? ((invoiced - cost) / invoiced) * 100 : 0,
        roi:    cost > 0 ? ((invoiced - cost) / cost) * 100 : 0
      };
    });

    /* ── ROI bar chart ── */
    const c2 = safeCanvas('roiChart');
    if (c2 && c2.ctx && roiData.length) {
      try {
        if (!state.charts) state.charts = {};
        state.charts['roiChart'] = new Chart(c2.ctx, {
          type: 'bar',
          data: {
            labels: roiData.map(r => r.projectNumber || '—'),
            datasets: [{
              label: 'ROI %',
              data: roiData.map(r => Number(r.roi.toFixed(1))),
              backgroundColor: roiData.map(r => r.roi >= 0 ? 'rgba(34,230,160,0.75)' : 'rgba(255,92,124,0.75)'),
              borderColor:     roiData.map(r => r.roi >= 0 ? '#22e6a0' : '#ff5c7c'),
              borderWidth: 1,
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 200 },
            plugins: { legend: { display: false } },
            scales: {
              y: { ticks: { color: tc, callback: v => v + '%' }, grid: { color: gc } },
              x: { ticks: { color: tc, font: { size: 9 } }, grid: { display: false } }
            }
          }
        });
      } catch (e) { console.warn('[analytics] roi chart failed', e); }
    }

    /* ── Ledger table ── */
    const lb = R.ledgerBody;
    if (lb) {
      const ledgerHtml = !roiData.length
        ? `<tr><td colspan="7" class="empty-state">No projects yet.</td></tr>`
        : roiData.map(r => `<tr>
            <td><strong>${E(r.projectNumber || '—')}</strong><br><small style="color:var(--text-secondary);">${E(r.title || '')}</small></td>
            <td>${E(r.clientName || '')}</td>
            <td style="text-align:right;" class="ledger-pos">${fmtKES(r.invoiced)}</td>
            <td style="text-align:right;" class="ledger-neg">${fmtKES(r.expenses)}</td>
            <td style="text-align:right;" class="ledger-neg">${fmtKES(r.payroll)}</td>
            <td style="text-align:right;color:${r.profit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};font-weight:800;">${fmtKES(r.profit)}</td>
            <td style="text-align:right;">${r.margin.toFixed(1)}%</td>
          </tr>`).join('');
      setHtmlIfChanged(lb, ledgerHtml);
    }
  } catch (e) {
    console.warn('renderAdminAnalytics failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATIONS — memoized + delegated click
   ═══════════════════════════════════════════════════════════════ */
const _notifSig = { list: '' };
let _notifDelegationBound = false;

export function buildNotifications() {
  const data = safeData();
  const todayStr = callOr('todayStr', new Date().toISOString().slice(0, 10));
  const fmtDate  = (d) => callOr('fmtDate', d || '', d);
  const fmtKES   = (v) => callOr('fmtKES', String(v), v);
  const getClientName = (cid) => callOr('getClientName', '—', cid);
  const getInvoiceStatusDerived = (i) => callOr('getInvoiceStatusDerived', i?.status || 'draft', i);
  const getOverdueInstallments  = () => callOr('getOverdueInstallments', []);
  const daysBetween = (d) => callOr('daysBetween', 0, d);

  const list = [];

  // Overdue tasks
  {
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    let n = 0;
    for (const t of tasks) {
      if (n >= 5) break;
      if (!t || t.status !== 'pending' || !t.dueDate || t.dueDate >= todayStr) continue;
      list.push({
        id: 'task-' + t.id,
        type: 'danger',
        icon: 'fa-triangle-exclamation',
        title: 'Overdue task: ' + (t.title || ''),
        sub: 'due ' + fmtDate(t.dueDate),
        time: t.dueDate,
        page: 'ops-tasks'
      });
      n++;
    }
  }

  // Overdue installments
  try {
    const inst = getOverdueInstallments();
    if (Array.isArray(inst)) {
      let n = 0;
      for (const i of inst) {
        if (n >= 5) break;
        if (!i) continue;
        const instId = i.inst?.id || i.id || (i.clientId + '-' + n);
        list.push({
          id: 'inst-' + instId,
          type: 'danger',
          icon: 'fa-coins',
          title: 'Overdue installment — ' + (i.clientName || ''),
          sub: fmtKES(i.amount),
          time: i.dueDate,
          page: 'sales-clients'
        });
        n++;
      }
    }
  } catch (e) { /* silent */ }

  // Overdue invoices
  {
    const invoices = Array.isArray(data.invoices) ? data.invoices : [];
    let n = 0;
    for (const inv of invoices) {
      if (n >= 5) break;
      if (!inv) continue;
      const st = getInvoiceStatusDerived(inv);
      if (st === 'paid' || st === 'draft') continue;
      if (!inv.dueDate || inv.dueDate >= todayStr) continue;
      list.push({
        id: 'inv-' + inv.id,
        type: 'warning',
        icon: 'fa-file-invoice',
        title: 'Overdue invoice ' + (inv.number || ''),
        sub: getClientName(inv.clientId),
        time: inv.dueDate,
        page: 'fin-invoices'
      });
      n++;
    }
  }

  // Low stock
  {
    const inv = Array.isArray(data.inventory) ? data.inventory : [];
    let n = 0;
    for (const i of inv) {
      if (n >= 3) break;
      if (!i) continue;
      if (num(i.qty) > num(i.reorder)) continue;
      list.push({
        id: 'inv-item-' + i.id,
        type: 'warning',
        icon: 'fa-boxes-stacked',
        title: 'Low stock: ' + (i.name || ''),
        sub: num(i.qty) + ' on hand',
        time: todayStr,
        page: 'ops-inventory'
      });
      n++;
    }
  }

  // Compliance expiring
  {
    const comp = Array.isArray(data.compliance) ? data.compliance : [];
    let n = 0;
    for (const cc of comp) {
      if (n >= 3) break;
      if (!cc || !cc.expiryDate) continue;
      const d = daysBetween(cc.expiryDate);
      if (d < 0 || d > 30) continue;
      list.push({
        id: 'comp-' + cc.id,
        type: 'warning',
        icon: 'fa-scale-balanced',
        title: 'Compliance expiring: ' + (cc.title || ''),
        sub: 'Expires ' + fmtDate(cc.expiryDate),
        time: cc.expiryDate,
        page: 'admin-compliance'
      });
      n++;
    }
  }

  // Appointments today
  {
    const appts = Array.isArray(data.appointments) ? data.appointments : [];
    let n = 0;
    for (const a of appts) {
      if (n >= 3) break;
      if (!a || a.date !== todayStr || a.status !== 'scheduled') continue;
      list.push({
        id: 'appt-' + a.id,
        type: 'info',
        icon: 'fa-calendar-check',
        title: 'Appointment today: ' + (a.title || ''),
        sub: (a.startTime || '') + ' · ' + (a.clientName || ''),
        time: a.startTime || '',
        page: 'marketing-appointments'
      });
      n++;
    }
  }

  // Pending marketplace orders
  {
    const orders = Array.isArray(data.orders) ? data.orders : [];
    let n = 0;
    for (const o of orders) {
      if (n >= 3) break;
      if (!o || o.paymentStatus !== 'pending') continue;
      list.push({
        id: 'order-' + o.id,
        type: 'warning',
        icon: 'fa-shopping-cart',
        title: 'Pending market order: ' + o.id,
        sub: (o.customerName || '') + ' · ' + fmtKES(o.totalKES),
        time: o.timestamp,
        page: 'marketplace-orders'
      });
      n++;
    }
  }

  // Pending portal requests
  {
    const reqs = Array.isArray(data.portalRequests) ? data.portalRequests : [];
    let n = 0;
    for (const r of reqs) {
      if (n >= 3) break;
      if (!r || r.status !== 'pending') continue;
      list.push({
        id: 'portal-' + r.uid,
        type: 'info',
        icon: 'fa-user-clock',
        title: 'New portal request: ' + (r.name || r.email),
        sub: 'Awaiting approval',
        time: r.requestedAt,
        page: 'portal-requests'
      });
      n++;
    }
  }

  return list;
}

function _notifSignature(list) {
  if (!list.length) return '0';
  let h = 5381;
  for (const n of list) {
    const k = (n.id || '') + '\u0001' + (n.title || '') + '\u0001' + (n.sub || '');
    for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0;
  }
  return list.length + ':' + (h >>> 0).toString(36);
}

export function renderNotifications() {
  try {
    const list = buildNotifications();
    const sig = _notifSignature(list);
    if (sig === _notifSig.list) return;
    _notifSig.list = sig;

    const R = refs();
    let body = R.notifBody;

    if (!body) {
      const dropdown = R.notifDropdown;
      if (dropdown) {
        // Clear the placeholder text on first setup
        if (!dropdown._vioraCleared) {
          dropdown._vioraCleared = true;
          dropdown.innerHTML = '';
        }
        body = document.createElement('div');
        body.className = 'notif-body';
        body.id = 'notifBody';
        dropdown.appendChild(body);
        R.notifBody = body;
      }
    }

    const countText = list.length > 9 ? '9+' : String(list.length);
    if (R.notifCount) {
      if (list.length) { R.notifCount.textContent = countText; R.notifCount.style.display = 'inline-block'; }
      else R.notifCount.style.display = 'none';
    }
    if (R.notifCountMobile) {
      if (list.length) { R.notifCountMobile.textContent = countText; R.notifCountMobile.style.display = 'inline-block'; }
      else R.notifCountMobile.style.display = 'none';
    }
    if (!body) return;

    const html = !list.length
      ? `<div class="no-notifs"><i class="fa-solid fa-bell-slash"></i>All caught up!</div>`
      : list.map(n => {
          const t = n.time;
          const isIsoDate = typeof t === 'string' && t.length >= 10 && t.charCodeAt(4) === 45;
          const timeHtml = isIsoDate ? callOr('timeAgo', t, t) : (t || '');
          return `<div class="notif-item ${n.type}" data-page="${q(n.page)}">
            <div class="ni-icon"><i class="fas ${n.icon}"></i></div>
            <div class="ni-body">
              <div class="ni-title">${E(n.title)}</div>
              <div class="ni-sub">${E(n.sub)}</div>
            </div>
            <div class="ni-time">${timeHtml}</div>
          </div>`;
        }).join('');

    scheduleWrite(() => {
      setHtmlIfChanged(body, html);
      if (!_notifDelegationBound) {
        _notifDelegationBound = true;
        body.addEventListener('click', (e) => {
          const item = e.target.closest('.notif-item');
          if (!item) return;
          const page = item.dataset.page;
          if (page && window.Viora?.navigate) window.Viora.navigate(page);
          const dd = refs().notifDropdown;
          if (dd) dd.classList.remove('show');
        });
      }
    }, 'notifBody');
  } catch (e) {
    console.warn('renderNotifications failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD NOTIFICATIONS PANEL — panel + filters + persisted merge
   ═══════════════════════════════════════════════════════════════ */
const _dnState = {
  filter: 'all',
  derived: [],
  persisted: [],
  unsubscribe: null,
  readFilter: 'all',
};

function _dnCollectDerived() {
  try {
    const list = buildNotifications() || [];
    return list.map(n => ({
      id: 'derived-' + (n.id || ''),
      source: 'derived',
      sourceEventId: n.sourceEventId || n.eventId || '',
      type: n.type || 'info',
      icon: n.icon || 'fa-bell',
      title: n.title || '',
      sub: n.sub || '',
      time: n.time || '',
      page: n.page || '',
      read: true,
    }));
  } catch (e) {
    console.warn('[dn] collectDerived failed', e);
  }
  return [];
}

function _dnDedupe(merged) {
  const seenEvents = new Set();
  const persistedSemantics = new Set();
  const derivedSemantics = new Set();
  const out = [];
  // Persisted events are authoritative; derived reminders only fill gaps.
  const ordered = [...merged].sort((a, b) =>
    (a.source === 'persisted' ? 0 : 1) - (b.source === 'persisted' ? 0 : 1)
  );
  for (const n of ordered) {
    const explicit = n.sourceEventId || n.eventId || n.notificationKey || '';
    const semantic = [
      String(n.title || '').toLowerCase().replace(/\s+/g, ' ').trim(),
      String(n.sub || '').toLowerCase().replace(/\s+/g, ' ').trim(),
      String(n.page || '').trim()
    ].join('|');
    if (explicit && seenEvents.has(String(explicit))) continue;
    if (explicit) seenEvents.add(String(explicit));

    if (n.source === 'persisted') {
      // Do not merge two different persisted events merely because their text matches.
      persistedSemantics.add(semantic);
    } else {
      if (persistedSemantics.has(semantic) || derivedSemantics.has(semantic)) continue;
      derivedSemantics.add(semantic);
    }
    out.push(n);
  }
  return out;
}

export function renderDashboardNotifications() {
  const grid = safe$('dnGrid');
  const countEl = safe$('dnCount');
  if (!grid) return;

  _dnState.derived = _dnCollectDerived();
  const merged = _dnDedupe([..._dnState.persisted, ..._dnState.derived]);

  let list = merged;
  if (_dnState.readFilter === 'unread') list = list.filter(n => !n.read);
  if (_dnState.filter !== 'all') list = list.filter(n => (n.type || 'info') === _dnState.filter);

  if (countEl) countEl.textContent = String(list.length);

  if (!list.length) {
    grid.innerHTML = `
      <div class="dn-empty" style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text-secondary);">
        <i class="fa-solid fa-bell-slash" style="font-size:2rem;opacity:.4;margin-bottom:10px;display:block;"></i>
        ${merged.length ? 'No notifications match this filter.' : 'All caught up — no notifications.'}
      </div>`;
    return;
  }

  grid.innerHTML = list.map(n => {
    const sev = n.type || 'info';
    const timeStr = (() => {
      const t = n.time;
      if (!t) return '';
      if (typeof t === 'string' && t.length >= 10 && t.charCodeAt(4) === 45) {
        return callOr('timeAgo', t, t);
      }
      return String(t);
    })();
    const unreadBadge = (n.source === 'persisted' && !n.read)
      ? '<span class="dn-unread-dot" title="Unread"></span>'
      : '';
    return `
      <div class="dn-card dn-${sev}${n.read === false ? ' dn-is-unread' : ''}"
           data-dn-id="${E(n.id)}"
           data-dn-source="${n.source}"
           data-dn-page="${E(n.page || '')}"
           role="button" tabindex="0">
        <div class="dn-icon"><i class="fas ${E(n.icon || 'fa-bell')}"></i></div>
        <div class="dn-body">
          <div class="dn-title">${unreadBadge}${E(n.title || '')}</div>
          <div class="dn-sub">${E(n.sub || '')}</div>
        </div>
        ${timeStr ? `<div class="dn-time">${E(timeStr)}</div>` : ''}
      </div>`;
  }).join('');

  if (!grid._dnClickBound) {
    grid._dnClickBound = true;
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-dn-page]');
      if (!card) return;
      const id = card.getAttribute('data-dn-id');
      const source = card.getAttribute('data-dn-source');
      const page = card.getAttribute('data-dn-page');
      if (source === 'persisted' && id) {
        _dnMarkRead(id).catch(() => {});
      }
      if (page && window.Viora?.navigate) {
        window.Viora.navigate(page);
      } else if (page && /^https?:\/\//i.test(page)) {
        window.open(page, '_blank', 'noopener');
      }
    });
    grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('[data-dn-page]');
      if (!card) return;
      e.preventDefault();
      card.click();
    });
  }
}

async function _dnMarkRead(id) {
  if (!id) return;
  const c = ctx();
  if (typeof c.set !== 'function' || typeof c.ref !== 'function' || !c.db) return;
  try {
    const path = 'viora_data/orgs/viora/notifications/' + id;
    await c.set(c.ref(c.db, path + '/read'), true);
    await c.set(c.ref(c.db, path + '/readAt'), new Date().toISOString());
    const item = _dnState.persisted.find(n => n.id === id);
    if (item) item.read = true;
    renderDashboardNotifications();
  } catch (e) {
    if (e && e.code !== 'PERMISSION_DENIED') console.warn('[dn] mark read failed', e);
  }
}

function _dnSubscribe() {
  if (_dnState.unsubscribe) return;
  const c = ctx();
  if (typeof c.ref !== 'function' || typeof c.onValue !== 'function' || !c.db) return;

  const notifPath = 'viora_data/orgs/viora/notifications';
  const notifRef = c.ref(c.db, notifPath);

  const cb = (snap) => {
    const val = snap && snap.exists() ? snap.val() : {};
    const list = [];
    for (const [id, n] of Object.entries(val || {})) {
      if (!n) continue;
      list.push({
        id,
        source: 'persisted',
        sourceEventId: n.sourceEventId || n.eventId || n.notificationKey || id,
        category: n.category || n.source || 'system',
        type: n.level || 'info',
        icon: n.icon || 'fa-bell',
        title: n.title || 'Notification',
        sub: n.body || '',
        time: n.ts || '',
        page: n.url
          ? (n.url.startsWith('#') ? n.url.slice(1) : n.url)
          : (n.page || ''),
        read: !!n.read,
      });
    }
    list.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));
    _dnState.persisted = list.slice(0, 200);
    renderDashboardNotifications();
  };

  try {
    c.onValue(notifRef, cb, (err) => {
      if (err && err.code !== 'PERMISSION_DENIED') {
        console.warn('[dn] notifications sub failed', err);
      }
    });
    _dnState.unsubscribe = () => {
      try {
        if (typeof c.off === 'function') c.off(notifRef, 'value', cb);
      } catch (_) {}
    };
  } catch (e) {
    console.warn('[dn] subscribe failed', e);
  }
}

function _dnBindControls() {
  const wrap = safe$('dashboardNotifications');
  if (!wrap || wrap._dnBound) return;
  wrap._dnBound = true;

  wrap.addEventListener('click', (e) => {
    const filterBtn = e.target.closest('.dn-filter[data-dn-filter]');
    if (filterBtn) {
      _dnState.filter = filterBtn.getAttribute('data-dn-filter') || 'all';
      wrap.querySelectorAll('.dn-filter[data-dn-filter]').forEach(b =>
        b.classList.toggle('active', b === filterBtn)
      );
      renderDashboardNotifications();
      return;
    }
    const readBtn = e.target.closest('.dn-filter[data-dn-read]');
    if (readBtn) {
      _dnState.readFilter = readBtn.getAttribute('data-dn-read') || 'all';
      wrap.querySelectorAll('.dn-filter[data-dn-read]').forEach(b =>
        b.classList.toggle('active', b === readBtn)
      );
      renderDashboardNotifications();
      return;
    }
    if (e.target.closest('#dnRefreshBtn')) {
      renderDashboardNotifications();
      if (typeof ctx().toast === 'function') ctx().toast('Notifications refreshed.', 'info');
    }
  });
}

export function initDashboardNotifications() {
  _dnBindControls();
  _dnSubscribe();
  renderDashboardNotifications();
}

/* ═══════════════════════════════════════════════════════════════
   CROSS-MODULE NOTIFICATION LISTENER
   ═══════════════════════════════════════════════════════════════ */
let _vioraNotifUnsub = null;
const _vioraNotifSeen = new Set();
const _vioraNotifSeenMax = 500;

function _tsMs(t) {
  if (t == null) return 0;
  if (typeof t === 'number') return t < 1e12 ? t * 1000 : t;
  if (typeof t === 'string') {
    const n = Date.parse(t);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof t === 'object' && typeof t.seconds === 'number') {
    return t.seconds * 1000 + (t.nanoseconds || 0) / 1e6;
  }
  return 0;
}

export function surfaceVioraNotification(payload, isFresh = true) {
  if (!payload) return;
  const eventKey = String(payload.id || payload.sourceEventId || payload.eventId || '');
  if (eventKey && _vioraNotifSeen.has(eventKey)) return;
  if (eventKey) {
    _vioraNotifSeen.add(eventKey);
    if (_vioraNotifSeen.size > _vioraNotifSeenMax) {
      const first = _vioraNotifSeen.values().next().value;
      _vioraNotifSeen.delete(first);
    }
  }

  try {
    const level = payload.level === 'error'   ? 'error'
                : payload.level === 'warning' ? 'warning'
                : payload.level === 'success' ? 'success'
                : 'info';
    const t = ctx().toast;
    if (typeof t === 'function') {
      t(`${payload.title || 'VIORA'}${payload.body ? ' — ' + payload.body : ''}`, level);
    }
  } catch (e) {}

  if (isFresh) {
    try {
      const audio = document.getElementById('vioraNotifSound');
      if (audio) {
        audio.currentTime = 0;
        const p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (e) {}
  }

  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(payload.title || 'VIORA', {
        body: payload.body || '',
        icon: '/viora.png',
        tag: payload.id || payload.source || 'viora',
        data: { url: payload.url || '/main.html' }
      });
      n.onclick = () => {
        try { window.focus(); } catch (e) {}
        if (payload.url) {
          if (window.Viora?.navigate && payload.url.startsWith('#')) window.Viora.navigate(payload.url.slice(1));
          else window.location.href = payload.url;
        }
        n.close();
      };
      setTimeout(() => { try { n.close(); } catch (e) {} }, 12000);
    }
  } catch (e) {}

  renderNotifications();
}

export function attachVioraNotificationListener() {
  if (_vioraNotifUnsub) return;
  const c = ctx();
  const { db, ref, onChildAdded, update } = c;
  if (!db || typeof ref !== 'function' || typeof onChildAdded !== 'function') {
    console.warn('[viora] notification listener skipped — missing deps');
    return;
  }
  const state = safeState();

  const path = c.notifPath || 'viora_data/orgs/viora/notifications';
  const notifRef = ref(db, path);
  const attachTime = Date.now();

  _vioraNotifUnsub = onChildAdded(notifRef, snap => {
    const n = snap.val();
    if (!n || !n.id) return;
    if (n.read === true) return;

    const tsMs = _tsMs(n.ts);
    if (tsMs && attachTime - tsMs > 7 * 86400000) return;
    const eventKey = String(n.id || snap.key || n.sourceEventId || '');
    if (eventKey && _vioraNotifSeen.has(eventKey)) return;

    if (n.by && state?.operator?.uid && n.by === state.operator.uid) return;

    const isFresh = !!tsMs && (Date.now() - tsMs) < 5000;
    // Only genuinely new events create a toast/sound; historical unread items
    // are loaded quietly into the notification centre.
    if (isFresh) surfaceVioraNotification({ ...n, id: eventKey }, true);
    else if (eventKey) _vioraNotifSeen.add(eventKey);

    /* Keep unread state until the user opens the notification. */
    try { renderDashboardNotifications(); } catch (_) {}
  });

  console.info('[viora] notification listener attached');
}

export function detachVioraNotificationListener() {
  if (_vioraNotifUnsub) {
    try { _vioraNotifUnsub(); } catch (e) {}
    _vioraNotifUnsub = null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   AI RECOMMENDATIONS
   ═══════════════════════════════════════════════════════════════ */
const REC_ICONS = Object.freeze({
  sales: 'fa-handshake',
  marketing: 'fa-bullhorn',
  operations: 'fa-folder',
  finance: 'fa-coins',
  admin: 'fa-scale-balanced',
  marketplace: 'fa-store'
});

export function buildLocalRecommendations() {
  const data = safeData();
  const today = callOr('todayStr', new Date().toISOString().slice(0, 10));
  const fmtKES = (v) => callOr('fmtKES', String(v), v);
  const fmtDate = (d) => callOr('fmtDate', d || '', d);
  const daysBetween = (d) => callOr('daysBetween', 0, d);
  const getClientName = (cid) => callOr('getClientName', '—', cid);
  const getInvoiceTotals = (i) => callOr('getInvoiceTotals', { total: 0 }, i);
  const getInvoicePaidAmount = (id) => callOr('getInvoicePaidAmount', 0, id);
  const getInvoiceStatusDerived = (i) => callOr('getInvoiceStatusDerived', i?.status || 'draft', i);
  const recs = [];

  // 1. Overdue invoices
  {
    const invoices = Array.isArray(data.invoices) ? data.invoices : [];
    const overdue = [];
    for (const inv of invoices) {
      if (!inv) continue;
      const st = getInvoiceStatusDerived(inv);
      if (st === 'paid' || st === 'draft') continue;
      if (!inv.dueDate || inv.dueDate >= today) continue;
      overdue.push(inv);
    }
    overdue.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    for (const inv of overdue.slice(0, 3)) {
      const daysLate = Math.abs(daysBetween(inv.dueDate));
      const bal = num(getInvoiceTotals(inv).total) - num(getInvoicePaidAmount(inv.id));
      recs.push({
        priority: daysLate >= 30 ? 'high' : 'medium',
        category: 'finance',
        title: `Chase ${inv.number || ''} — ${fmtKES(bal)} overdue ${daysLate}d`,
        why: `${getClientName(inv.clientId)} owes ${fmtKES(bal)} past due ${fmtDate(inv.dueDate)}.`,
        action: 'Send a WhatsApp reminder from the invoice view.',
        link: 'fin-invoices'
      });
    }
  }

  // 2. Overdue tasks
  {
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    const overdue = [];
    for (const t of tasks) {
      if (!t || t.status !== 'pending' || !t.dueDate || t.dueDate >= today) continue;
      overdue.push(t);
    }
    overdue.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    for (const t of overdue.slice(0, 2)) {
      const daysLate = Math.abs(daysBetween(t.dueDate));
      recs.push({
        priority: daysLate >= 3 ? 'high' : 'medium',
        category: 'operations',
        title: `Task overdue: ${t.title || ''}`,
        why: `Due ${fmtDate(t.dueDate)} (${daysLate}d late). Assigned to ${t.assignedTo || 'unassigned'}.`,
        action: 'Follow up or reassign in the Tasks tab.',
        link: 'ops-tasks'
      });
    }
  }

  // 3. Stalled projects
  {
    const projects = Array.isArray(data.projects) ? data.projects : [];
    let n = 0;
    for (const p of projects) {
      if (n >= 2) break;
      if (!p || p.status !== 'active' || !p.deadline || p.deadline >= today) continue;
      if (num(p.progress) >= 90) continue;
      recs.push({
        priority: 'medium',
        category: 'operations',
        title: `Stalled project: ${p.projectNumber || p.title || ''}`,
        why: `Deadline was ${fmtDate(p.deadline)} but progress is only ${p.progress || 0}%.`,
        action: 'Review the project timeline and blockers.',
        link: 'ops-projects'
      });
      n++;
    }
  }

  // 4. Hot leads
  {
    const leads = Array.isArray(data.leads) ? data.leads : [];
    let n = 0;
    for (const l of leads) {
      if (n >= 2) break;
      if (!l || l.status !== 'Qualified' || l._fromMarket) continue;
      recs.push({
        priority: 'medium',
        category: 'sales',
        title: `Follow up with ${l.fullName || ''}`,
        why: `Qualified lead from ${l.source || 'unknown source'} waiting on a response.`,
        action: 'Convert to a client and book a kickoff.',
        link: 'marketing-leads'
      });
      n++;
    }
  }

  // 5. Low stock
  {
    const inv = Array.isArray(data.inventory) ? data.inventory : [];
    const low = [];
    for (const i of inv) {
      if (!i) continue;
      if (num(i.qty) <= num(i.reorder)) low.push(i);
    }
    if (low.length) {
      recs.push({
        priority: low.length >= 3 ? 'high' : 'medium',
        category: 'operations',
        title: `${low.length} item(s) at or below reorder level`,
        why: low.slice(0, 3).map(i => `${i.name} (${i.qty})`).join(', '),
        action: 'Restock before you run out.',
        link: 'ops-inventory'
      });
    }
  }

  // 6. Unmatched M-Pesa
  {
    const mpesa = Array.isArray(data.mpesaTransactions) ? data.mpesaTransactions : [];
    const unmatched = mpesa.filter(t => t && !t.matchedInvoiceId);
    if (unmatched.length) {
      recs.push({
        priority: 'high',
        category: 'finance',
        title: `${unmatched.length} unmatched M-Pesa transaction(s)`,
        why: 'Payments received without an invoice match.',
        action: 'Reconcile in the M-Pesa tab.',
        link: 'fin-mpesa'
      });
    }
  }

  // 7. Portal requests
  {
    const reqs = Array.isArray(data.portalRequests) ? data.portalRequests : [];
    const pending = reqs.filter(r => r && r.status === 'pending');
    if (pending.length) {
      recs.push({
        priority: 'medium',
        category: 'admin',
        title: `${pending.length} portal request(s) pending`,
        why: 'New signups awaiting approval and client linking.',
        action: 'Approve or reject from Portal Requests.',
        link: 'portal-requests'
      });
    }
  }

  // 8. Expiring contracts
  {
    const contracts = Array.isArray(data.contracts) ? data.contracts : [];
    let n = 0;
    for (const cc of contracts) {
      if (n >= 2) break;
      if (!cc || !cc.expiryDate || cc.status !== 'Active') continue;
      const d = daysBetween(cc.expiryDate);
      if (d < 0 || d > 30) continue;
      recs.push({
        priority: d <= 7 ? 'high' : 'medium',
        category: 'sales',
        title: `Contract expires in ${d}d: ${cc.title || ''}`,
        why: `${getClientName(cc.clientId)} — ${fmtKES(cc.value)} contract.`,
        action: 'Start the renewal conversation.',
        link: 'sales-contracts'
      });
      n++;
    }
  }

  if (!recs.length) {
    return { summary: 'All clear — no outstanding issues in the workspace.', recommendations: [] };
  }

  // Stable sort
  recs.forEach((r, i) => { r.__i = i; });
  recs.sort((a, b) => {
    const ah = a.priority === 'high' ? 0 : 1;
    const bh = b.priority === 'high' ? 0 : 1;
    if (ah !== bh) return ah - bh;
    return a.__i - b.__i;
  });
  const capped = recs.slice(0, 12).map(r => { delete r.__i; return r; });

  const high = capped.reduce((n, r) => n + (r.priority === 'high' ? 1 : 0), 0);
  const summary = high > 0
    ? `${high} high-priority item${high === 1 ? '' : 's'} need attention today.`
    : `${capped.length} item${capped.length === 1 ? '' : 's'} worth your attention this week.`;

  return { summary, recommendations: capped };
}

let _refreshRecTimer = null;
let _refreshRecInFlight = false;

export function refreshRecommendations() {
  if (_refreshRecInFlight) return;
  if (_refreshRecTimer) return;
  _refreshRecTimer = setTimeout(() => {
    _refreshRecTimer = null;
    _doRefreshRecommendations().catch(e => console.warn('[recs] refresh failed', e));
  }, 50);
}

async function _doRefreshRecommendations() {
  if (_refreshRecInFlight) return;
  _refreshRecInFlight = true;
  try {
    const c = ctx();
    const data = safeData();
    const R = refs();
    const panel = R.aiRecPanelBody;
    if (!panel) return;

    setHtmlIfChanged(panel, `<div class="ai-rec-loading"><i class="fa-solid fa-spinner fa-spin"></i> Analyzing workspace…</div>`);

        const mpPanel = callOr('getMarketplaceMetrics', {});
    const getInvoiceTotals = (i) => callOr('getInvoiceTotals', { total: 0 }, i);
    const getClientName = (cid) => callOr('getClientName', '—', cid);
    const todayStr = callOr('todayStr', new Date().toISOString().slice(0, 10));

    const invoices = Array.isArray(data.invoices) ? data.invoices : [];
    let overdueInvoiceCount = 0, unpaidTotal = 0;
    for (const i of invoices) {
      if (!i || i.status === 'paid') continue;
      unpaidTotal += num(getInvoiceTotals(i).total);
      if (i.dueDate && i.dueDate < todayStr) overdueInvoiceCount++;
    }

    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    let overdueTaskCount = 0;
    for (const t of tasks) {
      if (t && t.status === 'pending' && callOr('isOverdue', false, t.dueDate)) overdueTaskCount++;
    }

    const inventory = Array.isArray(data.inventory) ? data.inventory : [];
    let lowStockCount = 0;
    for (const i of inventory) {
      if (i && num(i.qty) <= num(i.reorder)) lowStockCount++;
    }

    const projects = Array.isArray(data.projects) ? data.projects : [];
    let activeProjectCount = 0;
    for (const p of projects) {
      if (p && p.status === 'active') activeProjectCount++;
    }

    const snap = {
      counts: {
        clients: callOr('getClients', []).length,
        leads: (Array.isArray(data.leads) ? data.leads : []).length,
        deals: (Array.isArray(data.deals) ? data.deals : []).length,
        projects: projects.length,
        appointments: (Array.isArray(data.appointments) ? data.appointments : []).length,
        presentations: (Array.isArray(data.presentations) ? data.presentations : []).length,
        invoices: invoices.length,
        overdueInvoices: overdueInvoiceCount,
        unpaidTotal,
        overdueTasks: overdueTaskCount,
        activeProjects: activeProjectCount,
        lowStockItems: lowStockCount,
        products: callOr('getProductsList', []).length,
              marketOrders: mpPanel.totalOrders || 0,
        marketRevenue: mpPanel.totalRevenueKES || 0,
        pendingMarketOrders: mpPanel.pendingOrders || 0
      },
      topOverdueInvoices: invoices.filter(i => i && i.status !== 'paid' && i.dueDate && i.dueDate < todayStr).slice(0, 5)
        .map(i => ({ number: i.number, client: getClientName(i.clientId), amount: num(getInvoiceTotals(i).total), dueDate: i.dueDate })),
      hotLeads: (Array.isArray(data.leads) ? data.leads : []).filter(l => l && l.status === 'Qualified').slice(0, 5)
        .map(l => ({ name: l.fullName, source: l.source })),
      stalledProjects: projects.filter(p => p && p.status === 'active' && p.deadline && p.deadline < todayStr && num(p.progress) < 90).slice(0, 5)
        .map(p => ({ number: p.projectNumber, title: p.title, client: getClientName(p.clientId), progress: p.progress }))
    };

    let ai = null;
    const callFn = c.callFn;
    if (typeof callFn === 'function') {
      let timer = null;
      try {
        ai = await Promise.race([
          callFn('recommend', { context: snap }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('timeout')), 8000);
          })
        ]);
      } catch (e) {
        console.info('[viora] AI recommendations unavailable, using local fallback:', e.message);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    const result = (ai && Array.isArray(ai.recommendations) && ai.recommendations.length)
      ? ai
      : buildLocalRecommendations();

    renderRecommendations(result);
  } finally {
    _refreshRecInFlight = false;
  }
}

export function renderRecommendations(res) {
  const R = refs();
  const panel = R.aiRecPanelBody;
  if (!panel) return;
  const recs = (res && res.recommendations) || [];

  if (!recs.length) {
    setHtmlIfChanged(panel, `<div class="ai-rec-loading">Workspace looks healthy. 🎉</div>`);
    return;
  }

  const iconFor = (cat) => Object.prototype.hasOwnProperty.call(REC_ICONS, cat) ? REC_ICONS[cat] : 'fa-lightbulb';

  const html = `${res.summary ? `<div class="ai-rec-summary">"${E(res.summary)}"</div>` : ''}${recs.map(r => `<div class="ai-rec-item ${q(r.priority || 'medium')}">
    <div class="rec-icon"><i class="fa-solid ${iconFor(r.category)}"></i></div>
    <div class="rec-body">
      <div class="rec-title">${E(r.title)}</div>
      ${r.why ? `<div class="rec-why">${E(r.why)}</div>` : ''}
      ${r.action ? `<div class="rec-action">→ ${E(r.action)}</div>` : ''}
    </div>
    ${r.link ? `<button class="rec-link" data-rec-link="${q(r.link)}">Open</button>` : ''}
  </div>`).join('')}<div style="text-align:right;margin-top:10px;"><button class="btn btn-outline btn-sm" onclick="refreshRecommendations()"><i class="fa-solid fa-rotate"></i> Refresh</button></div>`;

  setHtmlIfChanged(panel, html);

  if (!panel._recLinkBound) {
    panel._recLinkBound = true;
    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-rec-link]');
      if (!btn) return;
      const link = btn.dataset.recLink;
      if (link && window.Viora?.navigate) window.Viora.navigate(link);
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   IDLE PREFETCH
   ═══════════════════════════════════════════════════════════════ */
export function scheduleIdleRefresh() {
  const ric = typeof window !== 'undefined' && window.requestIdleCallback;
  const run = () => {
    try { refreshRecommendations(); } catch (e) {}
    try { renderNotifications(); } catch (e) {}
    try { renderDashboardNotifications(); } catch (e) {}
  };
  if (ric) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1200);
}

/* ═══════════════════════════════════════════════════════════════
   EXPOSE FOR INLINE HANDLERS
   ═══════════════════════════════════════════════════════════════ */
if (typeof window !== 'undefined') {
  window.refreshRecommendations = refreshRecommendations;
  window.surfaceVioraNotification = surfaceVioraNotification;
  window.renderNotifications = renderNotifications;
  window.renderDashboard = renderDashboard;
  window.renderAdminAnalytics = renderAdminAnalytics;
  window.buildNotifications = buildNotifications;
    window.renderRecommendations = renderRecommendationsV2;
  window.buildLocalRecommendations = buildLocalRecommendations;
  window.renderDashboardNotifications = renderDashboardNotifications;
  window.initDashboardNotifications = initDashboardNotifications;
  window.scheduleIdleRefresh = scheduleIdleRefresh;
  window.detachVioraNotificationListener = detachVioraNotificationListener;
  window.renderDashboardCharts = renderDashboardCharts;
}

/* ═══════════════════════════════════════════════════════════════
   COLLAPSIBLE AI RECOMMENDATIONS
   ═══════════════════════════════════════════════════════════════ */
function _initAiRecCollapse() {
  const panel  = document.getElementById('aiRecPanel');
  const toggle = document.getElementById('aiRecPanelToggle');
  if (!panel || !toggle || toggle._bound) return;
  toggle._bound = true;
  let collapsed = false;
  try { collapsed = localStorage.getItem('viora.aiRecCollapsed') === '1'; } catch (_) {}
  panel.classList.toggle('collapsed', collapsed);
  toggle.addEventListener('click', () => {
    const now = !panel.classList.contains('collapsed');
    panel.classList.toggle('collapsed', now);
    try { localStorage.setItem('viora.aiRecCollapsed', now ? '1' : '0'); } catch (_) {}
  });
}

/* Patch renderRecommendations to update the unread badge */
const _origRenderRecommendations = renderRecommendations;
export function renderRecommendationsV2(res) {
  _origRenderRecommendations(res);
  try {
    const badge = document.getElementById('aiRecCount');
    if (badge) {
      const n = ((res && res.recommendations) || []).length;
      if (n > 0) { badge.textContent = String(n); badge.style.display = 'inline-flex'; }
      else badge.style.display = 'none';
    }
    _initAiRecCollapse();
  } catch (_) {}
}
