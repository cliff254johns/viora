// main/dashboard-attention.js
// ═══════════════════════════════════════════════════════════════
// "Needs Attention" panel — aggregates high-priority items
// across every module into a single ranked list.
//
// Reads from:
//   • overdue installments (from main.js)
//   • overdue invoices
//   • unmatched M-Pesa transactions
//   • expiring contracts
//   • urgent tickets
//   • overdue tasks
//   • low stock
// ═══════════════════════════════════════════════════════════════

let _ctx = null;

export function initDashboardAttention(deps) {
  _ctx = deps || {};
}

function ctx() { return _ctx || {}; }
const SAFE = {
  get state() { return ctx().state; },
};

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function dataArr(key) {
  const d = SAFE.state && SAFE.state.data;
  return d && Array.isArray(d[key]) ? d[key] : [];
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtKESShort(n) {
  const v = num(n);
  if (v >= 1e6) return 'KSh ' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return 'KSh ' + (v / 1e3).toFixed(0) + 'K';
  return 'KSh ' + v.toLocaleString();
}

function fmtCount(n, singular, plural) {
  const v = num(n);
  return `${v} ${v === 1 ? singular : (plural || singular + 's')}`;
}

/* ═══════════════════════════════════════════════════════════════
   Aggregators — each returns an item or null
   ═══════════════════════════════════════════════════════════════ */

function findOverdueInstallments() {
  const getOverdue = ctx().getOverdueInstallments;
  if (typeof getOverdue !== 'function') return null;
  try {
    const list = getOverdue() || [];
    if (!list.length) return null;
    let total = 0;
    for (const i of list) total += num(i.amount);
    return {
      severity: 'danger',
      icon: 'fa-coins',
      text: `${fmtCount(list.length, 'overdue installment')} — ${fmtKESShort(total)}`,
      tab: 'sales-clients',
      priority: 100 + list.length,
    };
  } catch (e) { return null; }
}

function findOverdueInvoices() {
  const invoices = dataArr('invoices');
  const today = todayStr();
  let overdue = 0, value = 0;
  for (const i of invoices) {
    if (!i) continue;
    const st = i.status || 'draft';
    if (st === 'paid' || st === 'draft' || st === 'cancelled' || st === 'void') continue;
    if (!i.dueDate) continue;
    if (String(i.dueDate).slice(0, 10) < today) {
      overdue++;
      value += num(i.total);
    }
  }
  if (!overdue) return null;
  return {
    severity: 'danger',
    icon: 'fa-file-invoice',
    text: `${fmtCount(overdue, 'unpaid invoice')} >30 days — ${fmtKESShort(value)}`,
    tab: 'fin-invoices',
    priority: 90 + overdue,
  };
}

function findUnmatchedMpesa() {
  const tx = dataArr('mpesaTransactions');
  let unmatched = 0, value = 0;
  for (const t of tx) {
    if (!t) continue;
    if (t.matchedInvoiceId) continue;
    if (t.status !== 'received' && t.status !== 'completed') continue;
    unmatched++;
    value += num(t.amount);
  }
  if (!unmatched) return null;
  return {
    severity: 'danger',
    icon: 'fa-mobile-screen-button',
    text: `${fmtCount(unmatched, 'M-Pesa transaction')} unmatched — ${fmtKESShort(value)}`,
    tab: 'fin-mpesa',
    priority: 95 + unmatched,
  };
}

function findExpiringContracts() {
  const contracts = dataArr('contracts');
  const now = Date.now();
  const list = [];
  for (const c of contracts) {
    if (!c || c.status !== 'Active' || !c.expiryDate) continue;
    const endMs = Date.parse(c.expiryDate);
    if (!Number.isFinite(endMs)) continue;
    const daysLeft = (endMs - now) / 86400000;
    if (daysLeft >= 0 && daysLeft <= 14) list.push({ c, daysLeft });
  }
  if (!list.length) return null;
  list.sort((a, b) => a.daysLeft - b.daysLeft);
  const first = list[0];
  return {
    severity: first.daysLeft <= 5 ? 'warning' : 'info',
    icon: 'fa-file-signature',
    text: `${fmtCount(list.length, 'contract')} expiring — soonest in ${Math.ceil(first.daysLeft)}d`,
    tab: 'sales-contracts',
    priority: 60 + list.length,
  };
}

function findUrgentTickets() {
  const tickets = dataArr('tickets');
  let urgent = 0;
  for (const t of tickets) {
    if (!t || t.status === 'closed') continue;
    if (t.priority === 'urgent') urgent++;
  }
  if (!urgent) return null;
  return {
    severity: 'danger',
    icon: 'fa-headset',
    text: `${fmtCount(urgent, 'urgent ticket')}`,
    tab: 'support-tickets',
    priority: 85 + urgent,
  };
}

function findOverdueTasks() {
  const tasks = dataArr('tasks');
  const today = todayStr();
  let overdue = 0;
  for (const t of tasks) {
    if (!t || t.status !== 'pending' || !t.dueDate) continue;
    if (String(t.dueDate).slice(0, 10) < today) overdue++;
  }
  if (!overdue) return null;
  return {
    severity: 'warning',
    icon: 'fa-calendar-xmark',
    text: `${fmtCount(overdue, 'overdue task')}`,
    tab: 'ops-tasks',
    priority: 70 + overdue,
  };
}

function findLowStock() {
  const inv = dataArr('inventory');
  let low = 0;
  for (const i of inv) {
    if (!i) continue;
    if (num(i.qty) <= num(i.reorder)) low++;
  }
  if (!low) return null;
  return {
    severity: 'warning',
    icon: 'fa-boxes-stacked',
    text: `${fmtCount(low, 'item')} below reorder level`,
    tab: 'ops-inventory',
    priority: 55 + low,
  };
}

function findStalledProjects() {
  const projects = dataArr('projects');
  const today = todayStr();
  let stalled = 0;
  for (const p of projects) {
    if (!p || p.status !== 'active' || !p.deadline) continue;
    if (String(p.deadline).slice(0, 10) < today && num(p.progress) < 90) stalled++;
  }
  if (!stalled) return null;
  return {
    severity: 'warning',
    icon: 'fa-folder-exclamation',
    text: `${fmtCount(stalled, 'stalled project')}`,
    tab: 'ops-projects',
    priority: 65 + stalled,
  };
}

/* ═══════════════════════════════════════════════════════════════
   Render
   ═══════════════════════════════════════════════════════════════ */
export function renderDashboardAttention() {
  /* DISABLED — replaced by the Notifications tab per product decision.
     Kept as a no-op so any stale import in main.js can't throw. */
  return;
  // eslint-disable-next-line no-unreachable
  const host = document.getElementById('dashboardAttentionList');
  const countEl = document.getElementById('dashboardAttentionCount');
  if (!host) return;

  let items;
  try {
    items = [
      findUnmatchedMpesa(),
      findOverdueInstallments(),
      findOverdueInvoices(),
      findUrgentTickets(),
      findOverdueTasks(),
      findStalledProjects(),
      findExpiringContracts(),
      findLowStock(),
    ].filter(Boolean);
  } catch (e) {
    console.warn('[dashboard-attention] compute failed:', e);
    items = [];
  }

  items.sort((a, b) => b.priority - a.priority);
  const top = items.slice(0, 8);

  if (countEl) countEl.textContent = String(top.length);

  if (!top.length) {
    host.innerHTML = `
      <div class="attention-empty">
        <i class="fa-solid fa-circle-check"></i>
        <div>All clear</div>
        <div class="attention-empty-sub">Nothing needs your attention right now.</div>
      </div>`;
    return;
  }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  host.innerHTML = top.map((it) => `
    <div class="attention-row attention-${it.severity}" data-attention-tab="${esc(it.tab)}">
      <div class="attention-dot"></div>
      <i class="fa-solid ${it.icon} attention-icon"></i>
      <div class="attention-text">${esc(it.text)}</div>
      <i class="fa-solid fa-arrow-right attention-arrow"></i>
    </div>
  `).join('');

  if (!host._attentionClickBound) {
    host._attentionClickBound = true;
    host.addEventListener('click', (e) => {
      const row = e.target.closest('[data-attention-tab]');
      if (!row) return;
      const tab = row.getAttribute('data-attention-tab');
      if (tab && window.Viora && typeof window.Viora.navigate === 'function') {
        window.Viora.navigate(tab);
      }
    });
  }
}
