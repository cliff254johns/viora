// main/dashboard-kpis.js
// ═══════════════════════════════════════════════════════════════
// Dashboard KPI Grid — 12 cards covering every section.
//
// Each card shows:
//   • Headline number (the most important metric for that domain)
//   • Sub-line (delta vs last period, or secondary count)
//   • Optional sparkline (7-day trend, only when real history exists)
//   • Click-through to that module's tab
// ═══════════════════════════════════════════════════════════════

let _ctx = null;

export function initDashboardKpis(deps) {
  _ctx = deps || {};
}

function ctx() { return _ctx || {}; }
const SAFE = {
  get state()    { return ctx().state; },
  get renderTab(){ return ctx().renderActiveTab; },
  get navigate() { return ctx().navigate; },
};

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function dataArr(key) {
  const d = SAFE.state && SAFE.state.data;
  return d && Array.isArray(d[key]) ? d[key] : [];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtKESShort(n) {
  const v = num(n);
  if (v >= 1e6) return 'KSh ' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return 'KSh ' + (v / 1e3).toFixed(0) + 'K';
  return 'KSh ' + v.toLocaleString();
}

function fmtNum(n) {
  const v = num(n);
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

function pct(part, whole) {
  const p = num(part), w = num(whole);
  if (w <= 0) return 0;
  return Math.round((p / w) * 1000) / 10;
}

/* ── Sparkline data builders (7-day) ── */
function sparkFromDates(items, dateField, valueFn) {
  const buckets = new Array(7).fill(0);
  const now = new Date();
  for (const it of items) {
    if (!it) continue;
    const raw = it[dateField];
    if (!raw) continue;
    const d = new Date(String(raw).slice(0, 10) + 'T00:00:00');
    if (isNaN(d)) continue;
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays < 0 || diffDays > 6) continue;
    const idx = 6 - diffDays;
    buckets[idx] += valueFn ? valueFn(it) : 1;
  }
  return buckets;
}

/* ── Sparkline SVG ── */
function sparklineSvg(values, color) {
  if (!values || !values.length) return '';
  const max = Math.max(...values, 1);
  const w = 100;
  const h = 28;
  const step = w / (values.length - 1 || 1);

  const points = values.map((v, i) => {
    const x = i * step;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `0,${h} ${points} ${w},${h}`;

  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="kpi-spark-svg" width="100%" height="${h}">
    <polyline points="${areaPoints}" fill="url(#grad-${color.replace('#','')})" opacity="0.35" stroke="none"/>
    <defs>
      <linearGradient id="grad-${color.replace('#','')}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

/* ═══════════════════════════════════════════════════════════════
   KPI builders — each returns { title, value, sub, delta, spark, tab, icon, color }
   ═══════════════════════════════════════════════════════════════ */

function kpiRevenue() {
  const payments = dataArr('payments');
  const thisMonth = new Date().toISOString().slice(0, 7);
  const lastMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();

  let cur = 0, prev = 0;
  for (const p of payments) {
    if (!p || !p.date) continue;
    const m = String(p.date).slice(0, 7);
    if (m === thisMonth) cur += num(p.amount);
    else if (m === lastMonth) prev += num(p.amount);
  }

  const delta = prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;
  const spark = sparkFromDates(payments, 'date', p => num(p.amount));

  return {
    icon: 'fa-coins',
    color: '#22e6a0',
    title: 'Revenue',
    value: fmtKESShort(cur),
    sub: delta != null ? `${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta)}% vs last month` : 'No prior data',
    delta,
    spark,
    tab: 'fin-payments',
  };
}

function kpiClients() {
  const entities = dataArr('entities').filter(e => e && e.type === 'client');
  const weekAgo = daysAgo(7);
  let newThisWeek = 0;
  for (const c of entities) {
    const created = String((c.createdAt || '')).slice(0, 10);
    if (created && created >= weekAgo) newThisWeek++;
  }
  const spark = sparkFromDates(entities, 'createdAt');

  return {
    icon: 'fa-users',
    color: '#00d4ff',
    title: 'Clients',
    value: fmtNum(entities.length),
    sub: newThisWeek > 0 ? `+${newThisWeek} new this week` : 'No new this week',
    delta: newThisWeek,
    spark,
    tab: 'sales-clients',
  };
}

function kpiTasks() {
  const tasks = dataArr('tasks');
  let pending = 0, overdue = 0;
  const todayStr = today();
  for (const t of tasks) {
    if (!t || t.status !== 'pending') continue;
    pending++;
    if (t.dueDate && String(t.dueDate).slice(0, 10) < todayStr) overdue++;
  }
  const spark = sparkFromDates(tasks, 'createdAt');

  return {
    icon: 'fa-calendar-check',
    color: overdue > 0 ? '#ff5c7c' : '#a855f7',
    title: 'Pending Tasks',
    value: fmtNum(pending),
    sub: overdue > 0 ? `${overdue} overdue` : 'All on track',
    delta: overdue > 0 ? -overdue : 0,
    spark,
    tab: 'ops-tasks',
  };
}

function kpiLeads() {
  const leads = dataArr('leads');
  let active = 0, qualified = 0;
  for (const l of leads) {
    if (!l) continue;
    if (l.status === 'Converted') continue;
    active++;
    if (l.status === 'Qualified') qualified++;
  }
  const spark = sparkFromDates(leads, 'createdAt');

  return {
    icon: 'fa-user-plus',
    color: '#fbbf24',
    title: 'Active Leads',
    value: fmtNum(active),
    sub: `${qualified} qualified`,
    delta: qualified,
    spark,
    tab: 'marketing-leads',
  };
}

function kpiProjects() {
  const projects = dataArr('projects');
  let active = 0;
  for (const p of projects) {
    if (p && p.status === 'active') active++;
  }
  const spark = sparkFromDates(projects, 'createdAt');

  return {
    icon: 'fa-folder',
    color: '#8b5cf6',
    title: 'Projects',
    value: fmtNum(projects.length),
    sub: `${active} active`,
    delta: active,
    spark,
    tab: 'ops-projects',
  };
}

function kpiProducts() {
  const products = dataArr('products');
  const orders = dataArr('orders');
  let sold = 0;
  for (const o of orders) {
    if (!o || o.paymentStatus !== 'paid') continue;
    const items = Array.isArray(o.items) ? o.items : [];
    for (const it of items) sold += num(it.qty) || 1;
  }

  return {
    icon: 'fa-cube',
    color: '#06b6d4',
    title: 'Products',
    value: fmtNum(products.length),
    sub: `${sold} sold`,
    delta: sold,
    spark: null,
    tab: 'marketplace-products',
  };
}

function kpiSubscriptions() {
  const raw = SAFE.state && SAFE.state.data && SAFE.state.data.subscriptions;
  const subs = raw
    ? (Array.isArray(raw) ? raw : Object.values(raw)).filter(Boolean)
    : [];
  const now = Date.now();
  let active = 0, expiring = 0;
  for (const s of subs) {
    if (!s || s.plan === 'lifetime') { if (s) active++; continue; }
    if (s.status === 'suspended' || s.status === 'cancelled' || s.status === 'pending_payment') continue;
    const endMs = Date.parse(s.endDate || '');
    if (!Number.isFinite(endMs)) continue;
    const grace = (num(s.graceHours) || 72) * 3600000;
    if (now <= endMs + grace) {
      active++;
      const daysLeft = (endMs - now) / 86400000;
      if (daysLeft >= 0 && daysLeft <= 7) expiring++;
    }
  }

  return {
    icon: 'fa-key',
    color: '#10b981',
    title: 'Subscriptions',
    value: fmtNum(active),
    sub: expiring > 0 ? `${expiring} expiring soon` : 'All healthy',
    delta: expiring,
    spark: null,
    tab: 'subscriptions',
  };
}

function kpiTickets() {
  const tickets = dataArr('tickets');
  let open = 0, urgent = 0;
  for (const t of tickets) {
    if (!t || t.status === 'closed') continue;
    open++;
    if (t.priority === 'urgent') urgent++;
  }

  return {
    icon: 'fa-headset',
    color: urgent > 0 ? '#ff5c7c' : '#6366f1',
    title: 'Open Tickets',
    value: fmtNum(open),
    sub: urgent > 0 ? `${urgent} urgent` : 'No urgent',
    delta: urgent,
    spark: null,
    tab: 'support-tickets',
  };
}

function kpiAppointments() {
  const appts = dataArr('appointments');
  const todayStr = today();
  let todayCount = 0;
  for (const a of appts) {
    if (!a) continue;
    if (a.date === todayStr && a.status === 'scheduled') todayCount++;
  }
  const spark = sparkFromDates(appts, 'date');

  return {
    icon: 'fa-calendar-day',
    color: '#ec4899',
    title: 'Appointments',
    value: fmtNum(appts.length),
    sub: `${todayCount} today`,
    delta: todayCount,
    spark,
    tab: 'marketing-appointments',
  };
}

function kpiInvoices() {
  const invoices = dataArr('invoices');
  let unpaid = 0, total = 0;
  for (const i of invoices) {
    if (!i) continue;
    total += num(i.total);
    const st = i.status || 'draft';
    if (st !== 'paid' && st !== 'draft' && st !== 'cancelled' && st !== 'void') unpaid++;
  }
  const spark = sparkFromDates(invoices, 'createdAt');

  return {
    icon: 'fa-file-invoice',
    color: '#0ea5e9',
    title: 'Invoices',
    value: fmtNum(invoices.length),
    sub: `${unpaid} unpaid`,
    delta: unpaid,
    spark,
    tab: 'fin-invoices',
  };
}

function kpiOutstanding() {
  const getClientAgreedTotal = ctx().getClientAgreedTotal;
  const getClientPaidTotal = ctx().getClientPaidTotal;
  const entities = dataArr('entities').filter(e => e && e.type === 'client');

   let outstanding = 0;
  for (const c of entities) {
    const agreed = (typeof getClientAgreedTotal === 'function')
      ? num(getClientAgreedTotal(c.id))
      : 0;
    const paid = (typeof getClientPaidTotal === 'function')
      ? num(getClientPaidTotal(c.id))
      : 0;
    outstanding += Math.max(0, agreed - paid);
  }

  return {
    icon: 'fa-hourglass-half',
    color: outstanding > 0 ? '#f59e0b' : '#22e6a0',
    title: 'Outstanding',
    value: fmtKESShort(outstanding),
    sub: outstanding > 0 ? 'Awaiting payment' : 'All settled',
    delta: null,
    spark: null,
    tab: 'fin-invoices',
  };
}

function kpiDeals() {
  const deals = dataArr('deals');
  let open = 0, pipeline = 0;
  for (const d of deals) {
    if (!d) continue;
    if (d.stage === 'Won' || d.stage === 'Lost') continue;
    open++;
    pipeline += num(d.value);
  }
  const spark = sparkFromDates(deals, 'createdAt');

  return {
    icon: 'fa-handshake',
    color: '#14b8a6',
    title: 'Open Deals',
    value: fmtNum(open),
    sub: fmtKESShort(pipeline) + ' pipeline',
    delta: open,
    spark,
    tab: 'sales-deals',
  };
}

/* ═══════════════════════════════════════════════════════════════
   Render the KPI grid
   ═══════════════════════════════════════════════════════════════ */
export function renderDashboardKpis() {
  const host = document.getElementById('dashboardKpiGrid');
  if (!host) return;

  let kpis;
  try {
    kpis = [
      kpiRevenue(),
      kpiClients(),
      kpiTasks(),
      kpiLeads(),
      kpiProjects(),
      kpiProducts(),
      kpiSubscriptions(),
      kpiTickets(),
      kpiAppointments(),
      kpiInvoices(),
      kpiOutstanding(),
      kpiDeals(),
    ];
  } catch (e) {
    console.warn('[dashboard-kpis] compute failed:', e);
    host.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Could not load KPIs.</div>`;
    return;
  }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const cards = kpis.map((k) => {
    const sparkHtml = k.spark
      ? `<div class="kpi-spark">${sparklineSvg(k.spark, k.color)}</div>`
      : `<div class="kpi-spark kpi-spark-empty"></div>`;

    const deltaClass = k.delta == null ? '' : k.delta > 0 ? 'positive' : k.delta < 0 ? 'negative' : '';

    return `
      <div class="kpi-card" data-kpi-tab="${esc(k.tab)}" style="--kpi-accent:${k.color};">
        <div class="kpi-icon"><i class="fa-solid ${k.icon}"></i></div>
        <div class="kpi-body">
          <div class="kpi-title">${esc(k.title)}</div>
          <div class="kpi-value">${esc(k.value)}</div>
          <div class="kpi-sub ${deltaClass}">${esc(k.sub)}</div>
        </div>
        ${sparkHtml}
      </div>
    `;
  }).join('');

  host.innerHTML = cards;

  if (!host._kpiClickBound) {
    host._kpiClickBound = true;
    host.addEventListener('click', (e) => {
      const card = e.target.closest('[data-kpi-tab]');
      if (!card) return;
      const tab = card.getAttribute('data-kpi-tab');
      if (!tab) return;
      if (window.Viora && typeof window.Viora.navigate === 'function') {
        window.Viora.navigate(tab);
      } else if (typeof SAFE.renderTab === 'function') {
        SAFE.renderTab(tab);
      }
    });
  }
}
