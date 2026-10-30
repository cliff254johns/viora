/* ═══════════════════════════════════════════════════════════════
   VIORA — ORCHESTRATION LAYER  (v7.1 — consolidated + hardened)
   ═══════════════════════════════════════════════════════════════
   Handoff table, handlers, cron, event bus, archiver,
   orchestration panel, archives panel, archive console.

   Public API (window.*):
     Orchester      — dispatchLocal, runHandoff, toggleHandoff,
                      retrigger, retryFailure, runAllCrons,
                      startCron, stopCron
     EventBus       — emit, subscribe, recent, flushQueue
     Archiver       — archive, restore, runAll
     OrchestrationConsole — open, close, list, restore,
                            restoreMany, purge, exportJson, refresh
     renderOrchestrationPanel, renderArchivesPanel
     ORCHESTRATION_HANDOFFS, HANDLERS
   ═══════════════════════════════════════════════════════════════ */

import { uid, normalizePhone, normalizeEmail, todayStr, dateToStr,
         fmtDate, fmtKES, daysBetween, isOverdue, timeAgo,
         escapeHtml } from './helpers.js';

/* ── Injected dependencies ── */
let D = {
  db: null, ref: null, set: null, get: null, update: null, remove: null, push: null,
  P: null,
  state: null,
  toast: null, logActivity: null, logComm: null, setSyncStatus: null, $: null,
  upsertDoc: null, deleteDoc: null, directWrite: null, directDelete: null,
  PushNotifications: null, callFn: null,
  auth: null, WORKER_URL: null,
  eventQueuePush: null, eventQueueDrain: null, eventQueueRemove: null,
  getClient: null, getProject: null, getClients: null,
  getClientProjects: null, getClientInvoices: null, getClientContracts: null,
  getEmployees: null,
  getInvoiceTotals: null, getInvoicePaidAmount: null, getInvoiceStatusDerived: null,
  getProjectAgreedTotal: null, getProjectPaidTotal: null,
  getProjectFinancialProgress: null,
  getOverdueInstallments: null,
  getProductSalesMetrics: null,
  nextProjectInvoiceNumber: null,
  recomputeProjectProgress: null, recomputeClientRollup: null,
  onInvoicePaid: null,
  checkOrderStock: null,
  scheduleMarketSync: null,
  convertLeadToClientDeal: null,
  bulkGenerateTasksForClient: null,
  buildInvoicePdfBase64: null,
  buildClientStatementPdf: null,
  buildInvoiceProgressMessage: null,
  sendInvoiceAuto: null,
  awardTrainingCertificate: null,
  processMpesaQueue: null,
  openModal: null,
  closeModal: null,
  renderActiveTab: null,
  renderAll: null,
  openProposalStudio: null,
  openProjectDeliverables: null,
};

export function initOrchestration(d) {
  D = { ...D, ...d };
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
const DAY_MS = 86400000;
const nowIso = () => new Date().toISOString();

const arr = (key) => {
  const d = D.state && D.state.data;
  const v = d && d[key];
  return Array.isArray(v) ? v : [];
};

const ensureData = () => {
  if (!D.state) return null;
  if (!D.state.data) D.state.data = {};
  return D.state.data;
};

function indexById(list, key = 'id') {
  const m = new Map();
  for (const x of list) if (x && x[key] != null) m.set(x[key], x);
  return m;
}

function fireAndForget(promise, label) {
  try {
    if (promise && typeof promise.then === 'function') {
      promise.catch(e => console.warn(`[orchestration] ${label || 'async'} failed`, e));
    }
  } catch (e) {
    console.warn(`[orchestration] ${label || 'async'} threw synchronously`, e);
  }
}

function makeEvt(type, extra) {
  return Object.assign({
    id: 'evt-' + uid(),
    type,
    entityId: null,
    payload: {},
    meta: {},
    ts: nowIso()
  }, extra || {});
}

function sanitizeFirebaseValue(v, depth) {
  depth = depth || 0;
  if (depth > 20) return null;
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map(x => sanitizeFirebaseValue(x, depth + 1));
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) {
      const sv = sanitizeFirebaseValue(v[k], depth + 1);
      if (sv !== undefined) out[k] = sv;
    }
    return out;
  }
  return String(v);
}

/* ═══════════════════════════════════════════════════════════════
   HANDOFF TABLE
   ═══════════════════════════════════════════════════════════════ */
export const ORCHESTRATION_HANDOFFS = [
  { id: 'payment-reconcile-chain', on: 'payments.created',        when: () => true, run: ['reconcilePaymentAuto'], layer: 'finance', enabled: true, destructive: false },
  { id: 'mpesa-auto-match',        on: 'cron.mpesaAutoMatch',     when: () => true, run: ['mpesaAutoMatch'],        layer: 'finance', enabled: true, destructive: false },
  { id: 'overdue-installment-reminder', on: 'cron.overdueInstallmentReminder', when: () => true, run: ['overdueInstallmentReminder'], layer: 'finance', enabled: true, destructive: true },
  { id: 'invoice-reminder-waves',  on: 'cron.invoiceReminderWaves', when: () => true, run: ['invoiceReminderWaves'], layer: 'finance', enabled: true, destructive: true },
  { id: 'invoice-auto-send-draft', on: 'cron.invoiceAutoSendDraft', when: () => true, run: ['invoiceAutoSendDraft'], layer: 'finance', enabled: true, destructive: true },
  { id: 'monthly-payroll-draft',   on: 'cron.monthlyPayrollDraft', when: () => true, run: ['monthlyPayrollDraft'],  layer: 'finance', enabled: true, destructive: true },
  { id: 'low-stock-alert',         on: 'cron.lowStockAlert',      when: () => true, run: ['lowStockAlert'],         layer: 'finance', enabled: true, destructive: false },
  { id: 'payment-behavior-anomaly', on: 'cron.paymentBehaviorAnomaly', when: () => true, run: ['paymentBehaviorAnomaly'], layer: 'finance', enabled: true, destructive: false },

  { id: 'project-kickoff-chain',   on: 'projects.created',        when: () => true, run: ['projectKickoffChain'],   layer: 'delivery', enabled: true, destructive: false },
  {
    id: 'installment-project-spawn',
    on: 'entities.upsert',
    when: (evt) => {
      const e = evt.payload || {};
      return e.type === 'client'
        && Array.isArray(e.installments)
        && e.installments.length > 0
        && !e._installmentProjectsSpawnedAt;
    },
    run: ['installmentProjectSpawn'],
    layer: 'delivery', enabled: true, destructive: false
  },
  {
    id: 'project-auto-close',
    on: 'projects.upsert',
    when: (evt) =>
      evt.meta?.collection === 'projects' &&
      evt.meta?.source !== 'recomputeProjectProgress' &&
      evt.meta?.source !== 'projectAutoClose' &&
      Number(evt.payload?.progress || 0) >= 100 &&
      evt.payload?.status !== 'closed',
    run: ['projectAutoClose', 'projectCompletionDocs'],
    layer: 'delivery', enabled: true, destructive: false
  },
  { id: 'task-overdue-escalation', on: 'cron.taskOverdueEscalation', when: () => true, run: ['taskOverdueEscalation'], layer: 'delivery', enabled: true, destructive: false },
  { id: 'task-due-today-notify',   on: 'cron.taskDueTodayNotify', when: () => true, run: ['taskDueTodayNotify'],     layer: 'delivery', enabled: true, destructive: false },
  { id: 'task-progress-recalc',    on: 'tasks.upsert',  when: (evt) => evt.meta?.collection === 'tasks' && evt.payload?.projectId, run: ['taskProgressRecalc'], layer: 'delivery', enabled: true, destructive: false },
  { id: 'task-deleted-recalc',     on: 'tasks.deleted', when: (evt) => evt.meta?.collection === 'tasks' && evt.payload?.projectId, run: ['taskDeletedRecalc'],  layer: 'delivery', enabled: true, destructive: false },
  {
    id: 'task-presentation-spawn',
    on: 'tasks.upsert',
    when: (evt) => {
      const t = evt.payload || {};
      return evt.meta?.collection === 'tasks'
        && t.status === 'done'
        && t.projectId
        && !t._presentationSpawnedAt;
    },
    run: ['taskPresentationSpawn'],
    layer: 'delivery', enabled: true, destructive: false
  },

  { id: 'contract-expiry-cascade', on: 'cron.contractExpiryCascade', when: () => true, run: ['contractExpiryCascade'], layer: 'sales', enabled: true, destructive: false },
  { id: 'marketplace-order-enrichment', on: 'orders.upsert',
    when: (evt) => {
      const o = evt.payload || evt.entity || {};
      return !!o.id;
    },
    run: ['marketplaceOrderEnrichment'],
    layer: 'sales', enabled: true, destructive: false },
  { id: 'product-inventory-mirror', on: 'products.upsert',
    when: (evt) => evt.meta?.collection === 'products',
    run: ['productInventoryMirror'],
    layer: 'sales', enabled: true, destructive: false },
  { id: 'order-inventory-decrement', on: 'orders.upsert',
    when: (evt) => {
      const o = evt.payload || evt.entity || {};
      return o.paymentStatus === 'paid' && o.id && Array.isArray(o.items);
    },
    run: ['orderInventoryDecrement'],
    layer: 'sales', enabled: true, destructive: false },
  { id: 'client-inactivity-reengagement', on: 'cron.clientInactivityReengagement', when: () => true, run: ['clientInactivityReengagement'], layer: 'sales', enabled: true, destructive: false },
  {
    id: 'appointment-proposal-spawn',
    on: 'appointments.upsert',
    when: (evt) => {
      const a = evt.payload || {};
      return evt.meta?.collection === 'appointments'
        && !!a.clientId
        && !a._proposalSpawnedAt;
    },
    run: ['proposalAutoSpawn'],
    layer: 'sales', enabled: true, destructive: false
  },

  { id: 'auto-certificate-award', on: 'training.quizSubmitted', when: (evt) => Number(evt.payload?.autoScore || 0) >= 80, run: ['autoCertificateAward'], layer: 'training', enabled: true, destructive: false },

  { id: 'compliance-expiry-cascade', on: 'cron.complianceExpiryCascade', when: () => true, run: ['complianceExpiryCascade'], layer: 'system', enabled: true, destructive: false },
  { id: 'portal-request-auto-match', on: 'portalRequests.upsert', when: (evt) => evt.meta?.collection === 'portalRequests', run: ['portalRequestAutoMatch'], layer: 'system', enabled: true, destructive: false },
  { id: 'daily-anomaly-scan',        on: 'cron.dailyAnomalyScan', when: () => true, run: ['dailyAnomalyScan'], layer: 'system', enabled: true, destructive: false },
  { id: 'auto-archive-workflow',     on: 'cron.autoArchiveWorkflow', when: () => true, run: ['autoArchiveWorkflow'], layer: 'system', enabled: true, destructive: true },
];

const HANDOFFS_BY_EVENT = (() => {
  const m = new Map();
  for (const h of ORCHESTRATION_HANDOFFS) {
    if (!m.has(h.on)) m.set(h.on, []);
    m.get(h.on).push(h);
  }
  return m;
})();

/* ═══════════════════════════════════════════════════════════════
   HANDLERS
   ═══════════════════════════════════════════════════════════════ */
export const HANDLERS = {};

const _productMirrorSeen = new Map();

/* ── Shared WhatsApp helper ── */
let _waFallbackOpened = 0;
const WA_FALLBACK_LIMIT = 3;

async function sendWhatsAppSafe(phone, message, { clientId, clientName, reason, dedupeKey } = {}) {
  const to = normalizePhone(phone);
  let ok = true;
  try {
    await D.callFn('sendWhatsApp', { to, message });
  } catch (e) {
    ok = false;
    if (_waFallbackOpened < WA_FALLBACK_LIMIT) {
      _waFallbackOpened++;
      try { window.open(`https://wa.me/${to}?text=${encodeURIComponent(message)}`, '_blank'); } catch (e2) {}
    } else {
      console.warn('[orchestration] WhatsApp fallback popup limit reached');
    }
  }
  if (clientId) {
    try {
      await D.logComm('wa', clientId, clientName, phone, '', message, {
        automated: true, reason, dedupeKey
      });
    } catch (e) {}
  }
  return ok;
}

HANDLERS['reconcilePaymentAuto'] = async function (evt) {
  const { payload } = evt;
  if (!payload || !payload.id) return { ok: true, skipped: true };
  const live = arr('payments').find(p => p.id === payload.id) || payload;
  if (live._processedAt) return { ok: true, skipped: true, reason: 'already-processed' };

  const allocations = Array.isArray(live.allocations) ? live.allocations : [];
  const invoicesById = indexById(arr('invoices'));

  let reconciled = 0;
  const touchedProjects = new Set();
  if (live.projectId) touchedProjects.add(live.projectId);

  for (const a of allocations) {
    const inv = invoicesById.get(a.invoiceId);
    if (!inv) continue;
    if (inv.projectId) touchedProjects.add(inv.projectId);
    const client = D.getClient ? D.getClient(inv.clientId) : null;
    if (client) {
      await D.logActivity('pay', 'Payment reconciled',
        `${fmtKES(D.getInvoiceTotals(inv).total, inv.currency)} for ${client.name} via invoice ${inv.number}`);
    }
    reconciled++;
    const total = D.getInvoiceTotals(inv).total;
    const paid = D.getInvoicePaidAmount(inv.id);
    if (paid >= total - 0.01) {
      try { EventBus.emit('invoice.reconciled', inv, inv.id, { number: inv.number, paid, total }); } catch (e) {}
    }
  }

  for (const pid of touchedProjects) {
    try { await D.recomputeProjectProgress(pid); } catch (e) {}
  }
  if (live.clientId) {
    try { await D.recomputeClientRollup(live.clientId); } catch (e) {}
  }

  live._processedAt = nowIso();
  try { await D.upsertDoc('payments', live, live._rev); } catch (e) {}

  return { ok: true, reconciled };
};

HANDLERS['mpesaAutoMatch'] = async function () {
  if (typeof D.processMpesaQueue === 'function') {
    try { await D.processMpesaQueue(); } catch (e) { console.warn('[mpesa] queue failed', e); }
  }
  const unmatched = arr('mpesaTransactions').filter(t => !t.matchedInvoiceId).length;
  if (unmatched > 0 && D.PushNotifications) {
    const recipients = arr('users').filter(u => u.role === 'finance' || u.role === 'exec');
    await Promise.allSettled(recipients.map(r =>
      D.PushNotifications.sendToUid(r.uid, 'M-Pesa queue', `${unmatched} unmatched transaction(s) need review`)
        .catch(() => {})
    ));
  }
  return { ok: true, unmatched };
};

HANDLERS['overdueInstallmentReminder'] = async function () {
  const overdue = D.getOverdueInstallments ? (D.getOverdueInstallments() || []) : [];
  if (!overdue.length) return { ok: true, sent: 0 };
  const today = todayStr();
  let sent = 0;

  for (const inst of overdue) {
    const client = D.getClient ? D.getClient(inst.clientId) : null;
    if (!client || !client.phone) continue;
    const lastRem = inst.inst?._lastReminderAt;
    if (lastRem && lastRem.slice(0, 10) === today) continue;

    const m = `Hello ${client.name.split(' ')[0]}, reminder: your installment of ${fmtKES(inst.amount)} was due ${fmtDate(inst.dueDate)} (${Math.abs(daysBetween(inst.dueDate))} day(s) overdue).\n\n— VIORA Intercollective`;
    await sendWhatsAppSafe(client.phone, m, {
      clientId: client.id, clientName: client.name,
      reason: 'overdue-installment',
      dedupeKey: `overdue-inst|${inst.inst.id}|${today}`
    });

    const idx = (client.installments || []).findIndex(i => i.id === inst.inst.id);
    if (idx > -1) {
      client.installments[idx]._lastReminderAt = nowIso();
      try { await D.upsertDoc('entities', client, client._rev); } catch (e) {}
    }
    sent++;
  }

  if (D.PushNotifications) {
    const financeTeam = arr('users').filter(u => u.role === 'finance' || u.role === 'exec');
    const totalVal = overdue.reduce((s, i) => s + Number(i.amount || 0), 0);
    const summary = `📊 Daily overdue installment summary\n\n${overdue.length} installment(s) overdue.\nTotal value: ${fmtKES(totalVal)}`;
    await Promise.allSettled(financeTeam.map(u =>
      D.PushNotifications.sendToUid(u.uid, 'Overdue installments', summary).catch(() => {})
    ));
  }
  return { ok: true, sent, total: overdue.length };
};

HANDLERS['invoiceReminderWaves'] = async function () {
  const now = Date.now();
  let fired = 0;

  for (const inv of arr('invoices')) {
    const st = D.getInvoiceStatusDerived(inv);
    if (st === 'paid' || st === 'draft') continue;
    if (!inv.date) continue;

    const daysSince = Math.floor((now - new Date(inv.date).getTime()) / DAY_MS);
    const sent = Array.isArray(inv.remindersSent) ? inv.remindersSent : [];
    if (sent.length >= 3) continue;

    const sendAt = [3, 7, 14].find(d => daysSince >= d && !sent.includes(d));
    if (!sendAt) continue;

    const client = D.getClient ? D.getClient(inv.clientId) : null;
    if (!client) continue;

    const total = D.getInvoiceTotals(inv).total;
    const paid = D.getInvoicePaidAmount(inv.id);
    const balance = total - paid;
    const msg = `Hello ${client.name.split(' ')[0]}, friendly reminder: invoice ${inv.number} for ${fmtKES(balance, inv.currency)} is still outstanding. Due: ${fmtDate(inv.dueDate)}.\n\n— VIORA Intercollective`;

    if (client.phone) {
      await sendWhatsAppSafe(client.phone, msg, {
        clientId: client.id, clientName: client.name,
        reason: `invoice-reminder-day-${sendAt}`,
        dedupeKey: `invoice-reminder|${inv.id}|day-${sendAt}`
      });
    }
    inv.remindersSent = [...sent, sendAt];
    try { await D.upsertDoc('invoices', inv, inv._rev); } catch (e) {}
    fired++;
  }
  return { ok: true, fired };
};

HANDLERS['invoiceAutoSendDraft'] = async function () {
  const now = Date.now();
  let reminded = 0;
  const financeTeam = arr('users').filter(u => u.role === 'finance' || u.role === 'exec');

  for (const inv of arr('invoices')) {
    if (inv.status !== 'draft') continue;
    if (!inv.date) continue;
    if (inv._draftReminderSentAt) continue;
    const days = Math.floor((now - new Date(inv.date).getTime()) / DAY_MS);
    if (days < 1) continue;

    const clientName = (D.getClient && D.getClient(inv.clientId))?.name || '';
    const total = fmtKES(D.getInvoiceTotals(inv).total);
    if (D.PushNotifications) {
      await Promise.allSettled(financeTeam.map(u =>
        D.PushNotifications.sendToUid(
          u.uid,
          'Draft invoice awaiting your post',
          `${inv.number} — ${clientName} · ${total}`
        ).catch(() => {})
      ));
    }
    inv._draftReminderSentAt = nowIso();
    try { await D.upsertDoc('invoices', inv, inv._rev); } catch (e) {}
    reminded++;
  }
  return { ok: true, reminded };
};

HANDLERS['monthlyPayrollDraft'] = async function () {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastPeriod = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

  const existingPayroll = arr('payroll');
  const byEmpPeriod = new Map();
  for (const p of existingPayroll) byEmpPeriod.set(`${p.employeeId}|${p.period}`, p);

  let drafted = 0, flagged = 0;
  const payrollUpserts = [];

  for (const emp of (D.getEmployees ? D.getEmployees() : [])) {
    if (emp.status !== 'Active' && emp.status !== 'Probation') continue;
    if (byEmpPeriod.has(`${emp.id}|${period}`)) continue;

    const lastPay = byEmpPeriod.get(`${emp.id}|${lastPeriod}`);
    const lastGross = Number(lastPay?.gross || 0);
    const proposedGross = Number(emp.payRate || 0);
    let anomaly = false;
    if (lastGross > 0 && Math.abs(proposedGross - lastGross) / lastGross > 0.15) anomaly = true;

    let calc;
    try { calc = await D.callFn('payroll/calc', { gross: proposedGross, benefits: 0 }); }
    catch (e) { calc = { net: proposedGross, deductions: {} }; }

    const entry = {
      id: uid(), employeeId: emp.id, employeeName: emp.name, period,
      attendance: 22, gross: proposedGross, benefits: 0,
      net: calc?.net ?? proposedGross,
      deductions: calc?.deductions || {},
      status: 'Pending', createdAt: nowIso(),
      autoDraft: true, anomalyFlag: anomaly
    };
    payrollUpserts.push(entry);
    drafted++;
    if (anomaly) flagged++;
  }

  for (const entry of payrollUpserts) {
    try { await D.upsertDoc('payroll', entry); } catch (e) {}
  }

  if (D.PushNotifications) {
    const financeTeam = arr('users').filter(u => u.role === 'finance' || u.role === 'hr' || u.role === 'exec');
    const msg = `Payroll draft for ${period}: ${drafted} entries, ${flagged} flagged for review`;
    await Promise.allSettled(financeTeam.map(u =>
      D.PushNotifications.sendToUid(u.uid, 'Payroll draft ready', msg).catch(() => {})
    ));
  }
  return { ok: true, drafted, flagged };
};

HANDLERS['lowStockAlert'] = async function () {
  const low = arr('inventory').filter(i => Number(i.qty || 0) <= Number(i.reorder || 0));
  if (!low.length) return { ok: true, low: 0 };

  const opsTeam = arr('users').filter(u => u.role === 'ops');
  const summary = low.map(i => `• ${i.sku} — ${i.name}: ${i.qty} (reorder @ ${i.reorder})`).join('\n');
  const today = todayStr();

  await Promise.allSettled(opsTeam.map(async (u) => {
    if (u.phone) {
      const msg = `⚠️ Low stock alert\n\n${summary}\n\n— VIORA`;
      await sendWhatsAppSafe(u.phone, msg, {
        clientId: u.uid, clientName: u.name,
        reason: 'low-stock',
        dedupeKey: `low-stock|${u.uid}|${today}`
      });
    }
    if (D.PushNotifications) {
      try { await D.PushNotifications.sendToUid(u.uid, 'Low stock alert', `${low.length} item(s) below reorder level`); } catch (e) {}
    }
  }));
  return { ok: true, low: low.length };
};

HANDLERS['paymentBehaviorAnomaly'] = async function () {
  let flagged = 0;
  const now = Date.now();

  for (const c of (D.getClients ? D.getClients() : [])) {
    const paidInvoices = (D.getClientInvoices ? D.getClientInvoices(c.id) : [])
      .filter(i => D.getInvoiceStatusDerived(i) === 'paid' && i.paidAt && i.dueDate)
      .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));

    if (paidInvoices.length < 3) continue;

    const last3 = paidInvoices.slice(-3);
    const daysLate = last3.map(inv =>
      Math.max(0, Math.floor((new Date(inv.paidAt).getTime() - new Date(inv.dueDate).getTime()) / DAY_MS))
    );
    const avg = daysLate.reduce((a, b) => a + b, 0) / daysLate.length;
    const baseline = Number(c._paymentBaseline || 0);

    if (baseline > 0 && avg - baseline > 7) {
      const taskTitle = `Payment slowdown: ${c.name}`;
      const exists = arr('tasks').some(t => t.title === taskTitle && t.status === 'pending');
      if (!exists) {
        await D.upsertDoc('tasks', {
          id: uid(), title: taskTitle,
          description: `Avg days-late increased from ${baseline.toFixed(1)} to ${avg.toFixed(1)}`,
          dueDate: dateToStr(new Date(now + 3 * DAY_MS)),
          taskType: 'Client Delivery', priority: 'high',
          status: 'pending', assignedTo: D.state?.operator?.name || 'Finance',
          createdAt: nowIso(), anomalyFlag: true
        });
        flagged++;
      }
    }
    if (c._paymentBaseline !== avg) {
      c._paymentBaseline = avg;
      try { await D.upsertDoc('entities', c, c._rev); } catch (e) {}
    }
  }
  return { ok: true, flagged };
};

HANDLERS['projectKickoffChain'] = async function (evt) {
  const project = evt?.payload;
  if (!project || !project.id) return { ok: true, skipped: true, reason: 'no-project' };

  const live = (D.getProject ? D.getProject(project.id) : null) || project;
  if (live._kickoffSeededAt) return { ok: true, skipped: true, reason: 'already-seeded' };

  const now = Date.now();
  const templates = [
    { title: `Kickoff meeting — ${live.title || 'project'}`, dueDate: dateToStr(new Date(now + 3 * DAY_MS)), taskType: 'Client Delivery', priority: 'high' },
    { title: `Requirements gathering — ${live.projectNumber || live.title || ''}`, dueDate: dateToStr(new Date(now + 7 * DAY_MS)), taskType: 'Client Delivery', priority: 'high' },
    { title: `Draft delivery plan — ${live.projectNumber || ''}`, dueDate: dateToStr(new Date(now + 14 * DAY_MS)), taskType: 'Internal', priority: 'medium' }
  ];

  const existingTitles = new Set(
    arr('tasks').filter(t => t.projectId === live.id).map(t => t.title)
  );

  let created = 0;
  for (const tpl of templates) {
    if (existingTitles.has(tpl.title)) continue;
    try {
      await D.upsertDoc('tasks', {
        id: uid(), title: tpl.title,
        description: `Auto-generated kickoff task for ${live.projectNumber || live.title || ''}`,
        dueDate: tpl.dueDate, taskType: tpl.taskType, priority: tpl.priority,
        status: 'pending',
        assignedTo: live.projectLead || D.state?.operator?.name || 'Ops',
        projectId: live.id, createdAt: nowIso(),
        autoGenerated: true, _kickoffSeed: true
      });
      created++;
    } catch (e) { console.warn('[kickoff] task create failed', e); }
  }

  live._kickoffSeededAt = nowIso();
  try { await D.upsertDoc('projects', live, live._rev); } catch (e) {}

  if (created > 0) {
    await D.logActivity('add', 'Project kickoff tasks created',
      `${created} task(s) seeded for ${live.projectNumber || live.title || live.id}`);
  }
  return { ok: true, created };
};

HANDLERS['taskOverdueEscalation'] = async function () {
  const overdue = arr('tasks').filter(t => t.status === 'pending' && isOverdue(t.dueDate));
  let notified = 0, escalated48 = 0, escalated72 = 0;
  const usersByRole = (role) => arr('users').filter(u => u.role === role);
  const usersByName = indexById(arr('users'), 'name');
  const deptRole = (t) => {
    const d = (t.department || t.taskType || '').toLowerCase();
    if (d.includes('finance')) return 'finance';
    if (d.includes('sales')) return 'sales';
    if (d.includes('marketing')) return 'marketing';
    if (d.includes('hr')) return 'hr';
    return 'ops';
  };

  for (const t of overdue) {
    const daysLate = Math.abs(daysBetween(t.dueDate));
    let dirty = false;

    if (!t.reminderSent && D.PushNotifications) {
      const assigned = usersByName.get(t.assignedTo);
      if (assigned) try { await D.PushNotifications.sendToUid(assigned.uid, 'Overdue task', t.title); } catch (e) {}
      t.reminderSent = true;
      notified++;
      dirty = true;
    }
    if (daysLate >= 2 && !t.escalated48 && D.PushNotifications) {
      const targets = usersByRole(deptRole(t));
      await Promise.allSettled(targets.map(u =>
        D.PushNotifications.sendToUid(u.uid, 'Task >48h overdue', t.title).catch(() => {})
      ));
      t.escalated48 = true;
      escalated48++;
      dirty = true;
    }
    if (daysLate >= 3 && !t.escalated72 && D.PushNotifications) {
      const execs = usersByRole('exec');
      await Promise.allSettled(execs.map(u =>
        D.PushNotifications.sendToUid(u.uid, 'Task >72h overdue', t.title).catch(() => {})
      ));
      t.escalated72 = true;
      escalated72++;
      dirty = true;
    }
    if (dirty) try { await D.upsertDoc('tasks', t, t._rev); } catch (e) {}
  }
  return { ok: true, notified, escalated48, escalated72 };
};

HANDLERS['taskDueTodayNotify'] = async function () {
  const today = todayStr();
  const due = arr('tasks').filter(t => t.status === 'pending' && t.dueDate === today);
  const usersByName = indexById(arr('users'), 'name');

  if (D.PushNotifications) {
    await Promise.allSettled(due.map(t => {
      const assigned = usersByName.get(t.assignedTo);
      if (!assigned) return Promise.resolve();
      return D.PushNotifications.sendToUid(assigned.uid, 'Task due today', t.title).catch(() => {});
    }));
  }
  return { ok: true, count: due.length };
};

HANDLERS['projectAutoClose'] = async function (evt) {
  const p = evt.payload;
  if (!p || !p.id) return { ok: true, skipped: true };

  const live = (D.getProject ? D.getProject(p.id) : null) || p;
  if (live.status === 'closed' || live.status === 'cancelled') {
    return { ok: true, skipped: true, reason: 'already-terminal' };
  }

  const tasks = arr('tasks').filter(t => t.projectId === live.id);
  if (tasks.length === 0) return { ok: true, skipped: true, reason: 'no-tasks' };

  const done = tasks.filter(t => t.status === 'done').length;
  const workPct = (done / tasks.length) * 100;
  if (workPct < 100) return { ok: true, skipped: true, reason: 'tasks-incomplete', workPct };

  const fin = D.getProjectFinancialProgress ? D.getProjectFinancialProgress(live.id) : { agreed: 0, paid: 0, pct: 0, balance: 0 };
  if (fin.agreed <= 0) return { ok: true, skipped: true, reason: 'no-agreed-total' };
  if (fin.pct < 100) return { ok: true, skipped: true, reason: 'unpaid-balance', paidPct: fin.pct, balance: fin.balance };

  live.status = 'closed';
  live._closedAt = nowIso();
  live._closedBy = D.state?.operator?.name || 'auto';
  live._closedWorkPct = workPct;
  live._closedPaidPct = fin.pct;

  await D.upsertDoc('projects', live, live._rev);

  try {
    EventBus.emit('projects.upsert', live, live.id, live,
      { collection: 'projects', source: 'projectAutoClose' });
  } catch (e) {}

  await D.logActivity('edit', 'Project auto-closed (tasks + payment complete)',
    `${live.projectNumber || live.title} · ${done}/${tasks.length} tasks · ${fmtKES(fin.paid)}/${fmtKES(fin.agreed)}`);
  return { ok: true, closed: true };
};

HANDLERS['projectCompletionDocs'] = async function (evt) {
  const p = evt?.payload;
  if (!p || !p.id) return { ok: true, skipped: true, reason: 'no-project' };

  const live = (D.getProject ? D.getProject(p.id) : null) || p;
  if (live.status !== 'closed') return { ok: true, skipped: true, reason: 'not-closed' };
  if (live._completionDocsPromptedAt) return { ok: true, skipped: true, reason: 'already-prompted' };

  live._completionDocsPromptedAt = nowIso();
  try { await D.upsertDoc('projects', live, live._rev); } catch (e) {}

  const client = D.getClient ? D.getClient(live.clientId) : null;

  if (typeof D.openProjectDeliverables === 'function') {
    setTimeout(() => {
      /* Don't stack a modal on top of an in-progress transfer/fees modal. */
      if (document.querySelector('.modal-overlay.active')) return;
      try { D.openProjectDeliverables(live.id); }
      catch (e) { console.warn('[orchestration] deliverables open failed', e); }
    }, 900);
    if (D.toast) D.toast(`Project ${live.projectNumber || live.title} closed — attach handover documents.`, 'info');
    return { ok: true, prompted: true, via: 'deliverables-modal' };
  }

  openBuiltinProjectDocsModal(live, client);
  return { ok: true, prompted: true, via: 'builtin-modal' };
};

function openBuiltinProjectDocsModal(project, client) {
  if (typeof document === 'undefined') return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '2100';
  overlay.innerHTML = `
    <div class="modal">
      <h2><span class="modal-icon"><i class="fa-solid fa-folder-open"></i></span> Project Complete</h2>
      <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:14px;">
        <strong>${escapeHtml(project.projectNumber || project.title || '')}</strong>
        ${client ? ' — ' + escapeHtml(client.name || '') : ''}
        <br>Attach final handover documents (sign-off, UAT, final invoice).
      </p>
      <label>Document title</label>
      <input id="___orchDocTitle" placeholder="e.g. Final handover sheet" />
      <label>Notes (optional)</label>
      <textarea id="___orchDocNotes" rows="2"></textarea>
      <div class="form-actions" style="margin-top:18px;">
        <button type="button" class="btn btn-outline" data-orch-close>Later</button>
        <button type="button" class="btn btn-success" data-orch-save><i class="fa-solid fa-check"></i> Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', async (e) => {
    if (e.target === overlay || e.target.closest('[data-orch-close]')) overlay.remove();
    const saveBtn = e.target.closest('[data-orch-save]');
    if (!saveBtn) return;
    const title = (overlay.querySelector('#___orchDocTitle').value || '').trim();
    const notes = (overlay.querySelector('#___orchDocNotes').value || '').trim();
    if (!title) { D.toast && D.toast('Title is required.', 'error'); return; }
    try {
      const doc = {
        id: uid(),
        title,
        system: 'Operations',
        category: 'Completion Document',
        parentId: project.id,
        parentName: `${project.projectNumber || ''} — ${project.title || ''}`.trim(),
        fileName: title.replace(/[^a-z0-9]/gi, '_') + '.txt',
        mime: 'text/plain',
        size: notes.length,
        data: 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(notes || title))),
        uploadedAt: nowIso(),
        uploadedBy: D.state?.operator?.name || 'system',
        _isCompletionDoc: true
      };
      await D.upsertDoc('documents', doc);
      await D.logActivity('add', 'Completion document added', `${project.projectNumber} — ${title}`);
      D.toast && D.toast('Document saved.', 'success');
      overlay.remove();
    } catch (err) {
      D.toast && D.toast('Save failed: ' + err.message, 'error');
    }
  });
}

HANDLERS['taskProgressRecalc'] = async function (evt) {
  const t = evt.payload;
  if (!t || !t.projectId) return { ok: true, skipped: true };
  await D.recomputeProjectProgress(t.projectId);
  return { ok: true, projectId: t.projectId };
};

HANDLERS['taskDeletedRecalc'] = async function (evt) {
  const t = evt.payload;
  if (!t || !t.projectId) return { ok: true, skipped: true };
  await D.recomputeProjectProgress(t.projectId);
  return { ok: true, projectId: t.projectId };
};

HANDLERS['taskPresentationSpawn'] = async function (evt) {
  const t = evt.payload;
  if (!t || !t.id) return { ok: true, skipped: true, reason: 'no-task' };
  if (!t.projectId) return { ok: true, skipped: true, reason: 'no-project' };
  if (t._presentationSpawnedAt) return { ok: true, skipped: true, reason: 'already-spawned' };

  const project = D.getProject ? D.getProject(t.projectId) : null;
  if (!project) return { ok: true, skipped: true, reason: 'project-not-found' };

  const client = D.getClient ? D.getClient(project.clientId) : null;
  if (!client) return { ok: true, skipped: true, reason: 'client-not-found' };

  const liveTask = arr('tasks').find(x => x.id === t.id) || t;
  liveTask._presentationSpawnedAt = nowIso();
  try { await D.upsertDoc('tasks', liveTask, liveTask._rev); } catch (e) {}

  const addPresentation =
    (typeof D.openPresentation === 'function' && D.openPresentation) ||
    (typeof window !== 'undefined' && window.Viora && typeof window.Viora.addPresentation === 'function' && window.Viora.addPresentation) ||
    null;

  if (addPresentation) {
    setTimeout(() => {
      try {
        addPresentation({
          clientId: project.clientId,
          title: `Delivery — ${t.title || 'Task'}`,
          type: 'Progress Review',
          date: todayStr(),
          summary: `Task completed: ${t.title || ''}\nProject: ${project.projectNumber || project.title || ''}\nClient: ${client.name || ''}`,
          status: 'delivered'
        });
      } catch (e) { console.warn('[orchestration] addPresentation failed', e); }
    }, 400);
    return { ok: true, spawned: true, via: 'addPresentation' };
  }

  if (D.openModal && D.$ && D.$('presentationModal')) {
    setTimeout(() => {
      try {
        const t1 = D.$('prTitle'); if (t1) t1.value = `Delivery — ${t.title || 'Task'}`;
        const t2 = D.$('prClient'); if (t2) t2.value = project.clientId;
        const t3 = D.$('prSummary'); if (t3) t3.value = `Task completed: ${t.title || ''}\nProject: ${project.projectNumber || project.title || ''}`;
        const t4 = D.$('prStatus'); if (t4) t4.value = 'delivered';
        const t5 = D.$('prDate'); if (t5) t5.value = todayStr();
        D.openModal('presentationModal');
      } catch (e) { console.warn('[orchestration] raw presentation spawn failed', e); }
    }, 400);
    return { ok: true, spawned: true, via: 'raw-modal' };
  }

  return { ok: false, error: 'no presentation spawner available' };
};

HANDLERS['contractExpiryCascade'] = async function () {
  const now = Date.now();
  let renewals = 0, expired = 0;
  const dealTitles = new Set(arr('deals').map(d => d.title));

  for (const c of arr('contracts')) {
    if (!c.expiryDate || c.status === 'Terminated' || c.status === 'Draft') continue;
    const daysToExpiry = Math.floor((new Date(c.expiryDate).getTime() - now) / DAY_MS);

    if (daysToExpiry < 0 && c.status !== 'Expired') {
      c.status = 'Expired';
      try { await D.upsertDoc('contracts', c, c._rev); expired++; } catch (e) {}
      const owner = arr('users').find(u => u.role === 'sales');
      if (owner && D.PushNotifications) {
        try { await D.PushNotifications.sendToUid(owner.uid, 'Contract expired', `${c.title} — ${D.getClient(c.clientId)?.name || ''}`); } catch (e) {}
      }
      continue;
    }

    if (daysToExpiry >= 0 && daysToExpiry <= 30 && !c._renewalCreatedAt) {
      const renewalTitle = `Renewal — ${c.title}`;
      if (!dealTitles.has(renewalTitle)) {
        const client = D.getClient ? D.getClient(c.clientId) : null;
        await D.upsertDoc('deals', {
          id: uid(), title: renewalTitle, clientId: c.clientId,
          clientName: client?.name || '', value: Number(c.value || 0),
          stage: 'Quote Sent', terms: 'Net 30',
          owner: D.state?.operator?.name || 'Sales', source: 'Renewal',
          notes: `Auto-generated renewal deal`,
          createdAt: nowIso(), autoGenerated: true
        });
        dealTitles.add(renewalTitle);
      }
      await D.upsertDoc('tasks', {
        id: uid(), title: `Renewal discussion: ${c.title}`,
        description: `Contract expires ${fmtDate(c.expiryDate)}. Discuss renewal.`,
        dueDate: dateToStr(new Date(now + 7 * DAY_MS)),
        taskType: 'Client Delivery', priority: 'high', status: 'pending',
        assignedTo: D.state?.operator?.name || 'Sales',
        createdAt: nowIso(), autoGenerated: true
      });
      c._renewalCreatedAt = nowIso();
      try { await D.upsertDoc('contracts', c, c._rev); renewals++; } catch (e) {}
    }
  }
  return { ok: true, renewals, expired };
};

HANDLERS['marketplaceOrderEnrichment'] = async function (evt) {
  const order = evt.payload;
  if (!order || !order.id) return { ok: true };
  if (typeof D.scheduleMarketSync === 'function') { try { D.scheduleMarketSync(); } catch (e) {} }

  const email = normalizeEmail(order.customerEmail);
  if (!email) return { ok: true, skipped: true };

  const client = arr('entities').find(e => e.type === 'client' && normalizeEmail(e.email) === email);
  if (client) {
    if (!Array.isArray(client.marketplaceHistory)) client.marketplaceHistory = [];
    const already = client.marketplaceHistory.some(h => h.orderId === order.id);
    if (!already) {
      client.marketplaceHistory.push({ orderId: order.id, total: order.totalKES, timestamp: order.timestamp });
      try { await D.upsertDoc('entities', client, client._rev); } catch (e) {}
    }
  } else if (order.paymentStatus === 'paid' && order.customerPhone) {
    const msg = `Thank you for your order! Your purchase is confirmed. Ref: ${order.id}\n\n— VIORA`;
    await sendWhatsAppSafe(order.customerPhone, msg, {
      clientId: order.id, clientName: order.customerName,
      reason: 'order-thanks',
      dedupeKey: `order-thanks|${order.id}`
    });
  }
  return { ok: true };
};

HANDLERS['productInventoryMirror'] = async function (evt) {
  const p = evt.payload;
  if (!p || evt.meta?.collection !== 'products') return { ok: true, skipped: true };

  const now = Date.now();
  const last = _productMirrorSeen.get(p.id) || 0;
  if (now - last < 3000) return { ok: true, skipped: true, reason: 'recently-mirrored' };
  _productMirrorSeen.set(p.id, now);

  if (_productMirrorSeen.size > 500) {
    const cutoff = now - 60000;
    for (const [k, v] of _productMirrorSeen) if (v < cutoff) _productMirrorSeen.delete(k);
  }

  const mirrorId = 'prod-' + p.id;
  let existing = arr('inventory').find(x => x.id === mirrorId);

  try {
    const snap = await D.get(D.ref(D.db, `${D.P('inventory')}/${mirrorId}`));
    if (snap.exists()) {
      const remote = { ...snap.val(), id: mirrorId };
      const localStamp = existing?._updatedAt || '';
      const remoteStamp = remote._updatedAt || '';
      if (!existing || remoteStamp > localStamp) existing = remote;
      const d = ensureData();
      if (d) {
        if (!Array.isArray(d.inventory)) d.inventory = [];
        const idx = d.inventory.findIndex(x => x.id === mirrorId);
        if (idx > -1) d.inventory[idx] = existing; else d.inventory.push(existing);
      }
    }
  } catch (e) {}

  if (existing) {
    if (existing.name !== p.name) {
      existing.name = p.name;
      try { await D.upsertDoc('inventory', existing, existing._rev); } catch (e) {}
    }
    return { ok: true, mirrored: true, id: mirrorId, existed: true };
  }

  const priceKES = Math.round((Number(p.price) || 0) * 129);
  const record = {
    id: mirrorId,
    sku: (p.id || '').toUpperCase(),
    name: p.name,
    qty: 0,
    reorder: 5,
    cost: Math.round(priceKES * 0.6),
    price: priceKES,
    _source: 'product',
    _productId: p.id,
    _mirroredAt: nowIso(),
    _noStockBaseline: true,
    createdAt: nowIso()
  };
  try {
    await D.upsertDoc('inventory', record, null);
    return { ok: true, mirrored: true, id: mirrorId, created: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

HANDLERS['orderInventoryDecrement'] = async function (evt) {
  const o = evt.payload;
  if (!o || !o.id || !Array.isArray(o.items)) return { ok: true, skipped: true };
  if (o.paymentStatus !== 'paid') return { ok: true, skipped: true, reason: 'not-paid' };
  if (o._inventoryDecrementedAt) return { ok: true, skipped: true, reason: 'already-decremented' };

  const d = ensureData();
  if (!d) return { ok: false, error: 'state-not-ready' };
  const inv = d.inventory || (d.inventory = []);
  const byId = indexById(inv);
  const byProduct = new Map();
  for (const row of inv) if (row._productId) byProduct.set(row._productId, row);

  let touched = 0;
  let totalQtyMoved = 0;

  for (const it of o.items) {
    if (!it || !it.productId) continue;
    const qty = Math.max(1, Number(it.qty || 1));
    const mirrorId = 'prod-' + it.productId;

    let row = byProduct.get(it.productId) || byId.get(mirrorId);
    if (!row) {
      try {
        const snap = await D.get(D.ref(D.db, `${D.P('inventory')}/${mirrorId}`));
        if (snap.exists()) {
          row = { ...snap.val(), id: mirrorId };
          inv.push(row);
          byId.set(mirrorId, row);
          if (row._productId) byProduct.set(row._productId, row);
        }
      } catch (e) {}
    }
    if (!row) {
      const product = arr('products').find(p => p.id === it.productId);
      if (!product) continue;
      const priceKES = Math.round((Number(product.price) || 0) * 129);
      row = {
        id: mirrorId,
        sku: (product.id || '').toUpperCase(),
        name: product.name || 'Unnamed product',
        qty: 0, reorder: 5,
        cost: Math.round(priceKES * 0.6),
        price: priceKES,
        _source: 'product',
        _productId: product.id,
        _mirroredAt: nowIso(),
        _selfHealed: true,
        createdAt: product.createdAt || nowIso()
      };
      inv.push(row);
      byId.set(mirrorId, row);
      byProduct.set(product.id, row);
    }

    const before = Number(row.qty || 0);
    const after = Math.max(0, before - qty);
    if (after === before) continue;

    row.qty = after;
    row._lastSoldAt = nowIso();
    row._lastSoldQty = qty;
    row._lastOrderId = o.id;
    row._previousQty = before;
    delete row._noStockBaseline;

    try { await D.upsertDoc('inventory', row, row._rev); touched++; totalQtyMoved += qty; } catch (e) {}
  }

  if (touched > 0) {
    o._inventoryDecrementedAt = nowIso();
    try { await D.upsertDoc('orders', o, o._rev); } catch (e) {}
    await D.logActivity('edit', 'Inventory auto-decremented', `${touched} item(s), ${totalQtyMoved} units from order ${o.id}`);
  }
  return { ok: true, decremented: touched };
};

HANDLERS['clientInactivityReengagement'] = async function () {
  const now = Date.now();
  let tasks = 0;

  for (const c of (D.getClients ? D.getClients() : [])) {
    const lastActive = c._lastActivityAt || c.updatedAt || c.createdAt;
    if (!lastActive) continue;
    const daysSince = Math.floor((now - new Date(lastActive).getTime()) / DAY_MS);

    if (daysSince > 60 && !c._archivedAt && c.status === 'closed') {
      try { await Archiver.archive('entities', c.id, `Inactive ${daysSince} days after close`); } catch (e) {}
      continue;
    }
    if (daysSince > 30 && daysSince <= 60 && !c._reengagementTaskAt && c.status !== 'closed') {
      const taskTitle = `Re-engage: ${c.name}`;
      const exists = arr('tasks').some(t => t.title === taskTitle && t.status === 'pending');
      if (!exists) {
        await D.upsertDoc('tasks', {
          id: uid(), title: taskTitle,
          description: `No activity in ${daysSince} days. Reach out to client.`,
          dueDate: dateToStr(new Date(now + 7 * DAY_MS)),
          taskType: 'Client Delivery', priority: 'medium', status: 'pending',
          assignedTo: D.state?.operator?.name || 'Sales',
          createdAt: nowIso(), autoGenerated: true
        });
        tasks++;
      }
      c._reengagementTaskAt = nowIso();
      try { await D.upsertDoc('entities', c, c._rev); } catch (e) {}
    }
  }
  return { ok: true, tasks };
};

HANDLERS['autoCertificateAward'] = async function (evt) {
  const sub = evt.payload;
  if (!sub || !sub.uid || !sub.courseId) return { ok: true, skipped: true };
  if ((sub.status || 'submitted') !== 'submitted') return { ok: true, skipped: true, reason: 'already processed' };
  if (Number(sub.autoScore || 0) < 80) return { ok: true, skipped: true, reason: 'score below 80' };

  const already = arr('trainingCertificates').find(c => c.uid === sub.uid && c.courseId === sub.courseId);
  if (already) return { ok: true, skipped: true, reason: 'already certified' };

  try {
    await D.awardTrainingCertificate({
      uid: sub.uid, userName: sub.userName, userEmail: sub.userEmail,
      courseId: sub.courseId, courseTitle: sub.courseTitle, moduleId: sub.moduleId,
      score: sub.autoScore, adminNotes: 'Auto-awarded (auto-score ≥ 80%)', sourceSubmission: true
    });
  } catch (e) { return { ok: false, error: e.message }; }

  if (D.PushNotifications) {
    try { await D.PushNotifications.sendToUid(sub.uid, '🎓 Certificate awarded', `${sub.courseTitle} — Score ${sub.autoScore}%`); } catch (e) {}
    const hrUsers = arr('users').filter(u => u.role === 'hr' || u.role === 'exec');
    await Promise.allSettled(hrUsers.map(u =>
      D.PushNotifications.sendToUid(u.uid, 'Training certificate issued', `${sub.userName} — ${sub.courseTitle}`).catch(() => {})
    ));
  }
  try {
    await D.update(D.ref(D.db, D.P(`training/enrollments/${sub.uid}/${sub.courseId}`)),
      { completedAt: nowIso() });
  } catch (e) {}
  return { ok: true, awarded: true };
};

HANDLERS['complianceExpiryCascade'] = async function () {
  const thresholds = [60, 30, 14, 7];
  let alerts = 0;
  const alertUsers = arr('users').filter(u => u.role === 'admin' || u.role === 'hr' || u.role === 'exec');

  for (const c of arr('compliance')) {
    if (!c.expiryDate) continue;
    const d = daysBetween(c.expiryDate);
    if (d < 0) continue;

    const lastThreshold = Number(c.lastAlertThreshold || 999);
    const matched = thresholds.find(t => d <= t && lastThreshold > t);
    if (!matched) continue;

    if (D.PushNotifications) {
      await Promise.allSettled(alertUsers.map(u =>
        D.PushNotifications.sendToUid(u.uid, `Compliance: ${c.title} expires in ${d} days`, `Threshold ${matched}d reached`).catch(() => {})
      ));
    }
    c.lastAlertThreshold = matched;
    alerts++;

    if (!c.renewalTaskId) {
      const taskId = uid();
      try {
        await D.upsertDoc('tasks', {
          id: taskId, title: `Renew compliance: ${c.title}`,
          description: `Expires ${fmtDate(c.expiryDate)} — renewal required`,
          dueDate: c.expiryDate, taskType: 'Internal',
          priority: d <= 7 ? 'high' : 'medium',
          status: 'pending', assignedTo: D.state?.operator?.name || 'Admin',
          createdAt: nowIso(), autoGenerated: true
        });
        c.renewalTaskId = taskId;
      } catch (e) {}
    }
    try { await D.upsertDoc('compliance', c, c._rev); } catch (e) {}
  }
  return { ok: true, alerts };
};

HANDLERS['portalRequestAutoMatch'] = async function (evt) {
  const req = evt.payload;
  if (!req || req.status !== 'pending') return { ok: true, skipped: true };

  const email = normalizeEmail(req.email);
  const phone = normalizePhone(req.phone || '');
  const clients = D.getClients ? D.getClients() : [];

  if (email) {
    const exact = clients.find(c => normalizeEmail(c.email) === email);
    if (exact) {
      try {
        await D.set(D.ref(D.db, D.P('portalUsers/' + req.uid)), {
          uid: req.uid, email: req.email, name: req.name, phone: req.phone,
          clientId: exact.id, active: true,
          linkedAt: nowIso(), linkedBy: 'auto'
        });
        await D.update(D.ref(D.db, D.P('portalRequests/' + req.uid)), {
          status: 'approved', clientId: exact.id,
          approvedAt: nowIso(), matchType: 'email_auto'
        });
        const d = ensureData();
        if (d) {
          const list = d.portalRequests || [];
          const idx = list.findIndex(r => r.uid === req.uid);
          if (idx > -1) {
            list[idx] = { ...list[idx], status: 'approved', clientId: exact.id, matchType: 'email_auto' };
          }
        }
        await D.logActivity('edit', 'Portal request auto-matched', `${req.email} → ${exact.name}`);
        if (D.PushNotifications) {
          try { await D.PushNotifications.sendToUid(req.uid, 'Portal access approved', `Welcome! You are now linked to ${exact.name}`); } catch (e) {}
        }
        return { ok: true, matched: 'email' };
      } catch (e) { return { ok: false, error: e.message }; }
    }
  }
  if (phone) {
    const phMatch = clients.find(c =>
      normalizePhone(c.phone || '') === phone || normalizePhone(c.phoneAlt || '') === phone
    );
    if (phMatch) {
      try { await D.update(D.ref(D.db, D.P('portalRequests/' + req.uid)), { suggestedClientId: phMatch.id, matchType: 'phone_suggest' }); } catch (e) {}
      return { ok: true, matched: 'phone_suggest', suggestedClientId: phMatch.id };
    }
  }
  try {
    await D.update(D.ref(D.db, D.P('portalRequests/' + req.uid)), { matchType: 'escalated' });
    if (D.PushNotifications) {
      const admins = arr('users').filter(u => u.role === 'admin' || u.role === 'exec');
      await Promise.allSettled(admins.map(u =>
        D.PushNotifications.sendToUid(u.uid, 'Portal request needs review', `${req.name || req.email}`).catch(() => {})
      ));
    }
  } catch (e) {}
  return { ok: true, matched: 'escalated' };
};

HANDLERS['dailyAnomalyScan'] = async function () {
  const snapshot = {
    expenses: arr('expenses').slice(0, 200).map(e => ({ id: e.id, amount: e.amount, category: e.category, date: e.date })),
    projects: arr('projects').map(p => ({ id: p.id, title: p.title, status: p.status, progress: p.progress })),
    invoices: arr('invoices').map(i => ({ id: i.id, total: D.getInvoiceTotals(i).total, status: D.getInvoiceStatusDerived(i) })),
    payments: arr('payments').slice(0, 100).map(p => ({ id: p.id, amount: p.amount, date: p.date }))
  };
  const d = ensureData();
  if (!d) return { ok: false, error: 'state-not-ready' };

  try {
    const res = await D.callFn('ai/anomalyScan', { snapshot });
    if (res.anomalies && Array.isArray(res.anomalies)) {
      d._aiAnomalies = res.anomalies.slice(0, 100).map(a => ({ ...a, ts: nowIso() }));
      const high = res.anomalies.filter(a => a.severity === 'high');
      if (high.length && D.PushNotifications) {
        const execs = arr('users').filter(u => u.role === 'exec');
        await Promise.allSettled(execs.map(u =>
          D.PushNotifications.sendToUid(u.uid, `⚠️ ${high.length} high-severity anomalies`, high[0].title || 'Review needed').catch(() => {})
        ));
      }
      return { ok: true, count: res.anomalies.length };
    }
    return { ok: true, count: 0 };
  } catch (e) {
    const anomalies = [];
    const expenses = arr('expenses');
    const byCat = new Map();
    for (const e of expenses) {
      if (!byCat.has(e.category)) byCat.set(e.category, []);
      byCat.get(e.category).push(Number(e.amount || 0));
    }
    for (const e of expenses.slice(0, 50)) {
      const peers = byCat.get(e.category) || [];
      if (peers.length < 3) continue;
      const avg = peers.reduce((a, b) => a + b, 0) / peers.length;
      if (Number(e.amount || 0) > avg * 2) {
        anomalies.push({
          id: 'an-exp-' + e.id, severity: 'medium', category: 'expense-spike',
          title: `Expense spike: ${e.vendor || e.category}`,
          description: `${fmtKES(e.amount)} is ${(Number(e.amount) / avg).toFixed(1)}× the ${e.category} average`,
          ts: nowIso()
        });
      }
    }
    d._aiAnomalies = anomalies.slice(0, 100);
    return { ok: true, count: anomalies.length, fallback: true };
  }
};

HANDLERS['autoArchiveWorkflow'] = async function () {
  await Archiver.runAll();
  return { ok: true };
};

HANDLERS['proposalAutoSpawn'] = async function (evt) {
  const appt = evt.payload;
  if (!appt || !appt.id || !appt.clientId) return { ok: true, skipped: true, reason: 'no-appointment' };
  if (appt._proposalSpawnedAt) return { ok: true, skipped: true, reason: 'already-spawned' };

  const client = D.getClient ? D.getClient(appt.clientId) : null;
  if (!client) return { ok: true, skipped: true, reason: 'client-not-found' };

  const existing = arr('proposals').find(p =>
    p._fromAppointmentId === appt.id ||
    (p.clientId === appt.clientId && !p.sentAt && !p._archivedAt &&
     Math.abs(new Date(p.createdAt || 0) - new Date(appt.updatedAt || appt.createdAt || 0)) < 60000)
  );

  const liveAppt = arr('appointments').find(a => a.id === appt.id) || appt;
  liveAppt._proposalSpawnedAt = nowIso();

  if (existing) {
    try { await D.upsertDoc('appointments', liveAppt, liveAppt._rev); } catch (e) {}
    return { ok: true, skipped: true, reason: 'existing-proposal', proposalId: existing.id };
  }

  const draft = {
    id: uid(),
    title: `Proposal — ${client.name || 'Client'}`,
    clientId: client.id,
    leadId: null,
    dealId: null,
    body: '',
    tone: 'Professional',
    serviceArea: (appt.type && appt.type.includes('Demo')) ? 'Technical Consulting' : 'Web Development',
    generatedBy: D.state?.operator?.name || 'System',
    createdAt: nowIso(),
    _fromAppointmentId: appt.id,
    _autoSpawned: true
  };

  try {
    await D.upsertDoc('proposals', draft);
    await D.upsertDoc('appointments', liveAppt, liveAppt._rev);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const openStudio =
    (typeof D.openProposalStudio === 'function' && D.openProposalStudio) ||
    (typeof window !== 'undefined' && window.Viora && typeof window.Viora.openProposalStudio === 'function' && window.Viora.openProposalStudio) ||
    null;

  setTimeout(() => {
    try {
      if (openStudio) {
        openStudio({ clientId: client.id, appointmentId: appt.id, proposalId: draft.id });
      } else if (D.openModal && D.$ && D.$('proposalModal')) {
        const pEl = D.$('propLead'); if (pEl) pEl.value = '';
        const dEl = D.$('propDeal'); if (dEl) dEl.value = '';
        const nEl = D.$('propNotes');
        if (nEl) nEl.value =
          `Auto-drafted from appointment: ${appt.title || 'Appointment'}\n` +
          `Client: ${client.name || ''}\n` +
          `Date: ${appt.date || ''} ${appt.startTime || ''}\n\n` +
          `Paste your meeting notes here, then click Generate.`;
        D.openModal('proposalModal');
      }
    } catch (e) { console.warn('[orchestration] proposal spawn failed', e); }
  }, 500);

  if (D.toast) D.toast(`Draft proposal created for ${client.name}.`, 'info');
  await D.logActivity('add', 'Proposal auto-spawned from appointment',
    `${client.name} · ${appt.title || ''}`);
  return { ok: true, spawned: true, proposalId: draft.id };
};

HANDLERS['installmentProjectSpawn'] = async function (evt) {
  const client = evt.payload;
  if (!client || !client.id) return { ok: true, skipped: true };
  if (!Array.isArray(client.installments) || !client.installments.length) {
    return { ok: true, skipped: true, reason: 'no-installments' };
  }
  if (client._installmentProjectsSpawnedAt) return { ok: true, skipped: true, reason: 'already-spawned' };

  const live = (D.getClient ? D.getClient(client.id) : null) || client;
  live._installmentProjectsSpawnedAt = nowIso();
  try { await D.upsertDoc('entities', live, live._rev); } catch (e) {}
  return { ok: true, spawned: true };
};

/* ═══════════════════════════════════════════════════════════════
   ORCHESTER
   ═══════════════════════════════════════════════════════════════ */
export const Orchester = (function () {
  let _cronTimer = null;
  let _cronRunning = false;
  let _lastCronMinute = '';
  const _recentRuns = new Map();
  const _RECENT_MAX = 1000;

  function signature(handoffId, evt) {
    const p = evt?.payload || {};
    return `${handoffId}|${evt?.type || ''}|${evt?.entityId || ''}|${p?.id || ''}|${p?.status || ''}|${evt?.id || ''}`;
  }

  async function dispatchLocal(evt) {
    if (!evt || !evt.type) return;
    const bucket = HANDOFFS_BY_EVENT.get(evt.type);
    if (!bucket) return;
    if (!D.state || !D.state.data) return;

    for (const h of bucket) {
      const persisted = D.state.data._handoffState?.[h.id];
      const isEnabled = persisted === undefined ? h.enabled : persisted;
      if (!isEnabled) continue;

      try {
        if (h.when && typeof h.when === 'function' && !h.when(evt, D.state)) continue;
      } catch (e) {
        console.warn('[orchestration] when() threw for', h.id, e);
        continue;
      }

      const sig = signature(h.id, evt);
      const last = _recentRuns.get(sig);
      if (last && Date.now() - last < 5000) continue;
      _recentRuns.set(sig, Date.now());

      if (_recentRuns.size > _RECENT_MAX) {
        const cutoff = Date.now() - 60000;
        for (const [k, v] of _recentRuns) if (v < cutoff) _recentRuns.delete(k);
      }

      runHandoff(h, evt, { evt, state: D.state })
        .catch(e => console.warn('Handoff failed', h.id, e));
    }
  }

  async function runHandoff(handoff, evt, ctx = {}) {
    const runId = 'run-' + uid();
    const startedAt = Date.now();
    const result = { ok: true, handlers: [] };
    const logEntry = {
      id: runId, handoffId: handoff.id, layer: handoff.layer,
      eventType: evt.type, entityId: evt.entityId ?? null,
      startedAt: nowIso(), by: D.state?.operator?.uid || 'system'
    };

    for (const hName of handoff.run) {
      const fn = HANDLERS[hName];
      if (!fn) {
        result.handlers.push({ name: hName, ok: false, error: 'handler not registered' });
        continue;
      }
      try {
        const r = await fn(evt, ctx);
        result.handlers.push({ name: hName, ok: true, result: r });
      } catch (e) {
        result.handlers.push({ name: hName, ok: false, error: e.message });
        result.ok = false;
        const failId = 'fail-' + uid();
        const failEntry = sanitizeFirebaseValue({
          id: failId, handoffId: handoff.id, handlerName: hName,
          eventType: evt.type, error: e.message, ts: nowIso(), retries: 0,
          evt: { type: evt.type, entityId: evt.entityId ?? null, payload: evt.payload }
        });
        const d = ensureData();
        if (d) {
          d._orchestrationFailures = d._orchestrationFailures || [];
          d._orchestrationFailures.unshift(failEntry);
          if (d._orchestrationFailures.length > 200) {
            d._orchestrationFailures.length = 200;
          }
        }
        fireAndForget(
          D.set(D.ref(D.db, D.P(`orchestration/failures/${failId}`)), failEntry),
          'failure-log-write'
        );
      }
    }

    logEntry.duration = Date.now() - startedAt;
    logEntry.ok = result.ok;

    const d = ensureData();
    if (d) {
      d._orchestrationRuns = d._orchestrationRuns || [];
      d._orchestrationRuns.unshift(logEntry);
      if (d._orchestrationRuns.length > 200) {
        d._orchestrationRuns.length = 200;
      }
    }

    if (!ctx.cron) {
      fireAndForget(
        D.set(
          D.ref(D.db, D.P(`orchestration/runs/${runId}`)),
          sanitizeFirebaseValue({
            id: runId, handoffId: handoff.id, layer: handoff.layer,
            eventType: evt.type, entityId: evt.entityId ?? null,
            startedAt: logEntry.startedAt, duration: logEntry.duration,
            ok: logEntry.ok, by: logEntry.by
          })
        ),
        'run-log-write'
      );
    }

    return result;
  }

  async function toggleHandoff(id, el) {
    const def = ORCHESTRATION_HANDOFFS.find(h => h.id === id);
    const current = D.state?.data?._handoffState?.[id];
    const isCurrentlyOn = current === undefined ? !!def?.enabled : current;
    const newVal = !isCurrentlyOn;
    const d = ensureData();
    if (d) {
      d._handoffState = d._handoffState || {};
      d._handoffState[id] = newVal;
    }
    try { await D.set(D.ref(D.db, D.P(`orchestration/handoffs/${id}/enabled`)), newVal); } catch (e) {}
    if (el) el.classList.toggle('on', newVal);
    D.toast && D.toast(`${id} ${newVal ? 'enabled' : 'disabled'}.`, 'success');
  }

  const COLL_MAP = {
    'projects.created': 'projects', 'projects.upsert': 'projects',
    'entities.upsert': 'entities',
    'payments.created': 'payments',
    'appointments.upsert': 'appointments',
    'presentations.upsert': 'presentations',
    'tasks.upsert': 'tasks',
    'invoices.created': 'invoices',
    'products.upsert': 'products',
    'orders.upsert': 'orders',
    'portalRequests.upsert': 'portalRequests',
  };

  async function retrigger(id) {
    const h = ORCHESTRATION_HANDOFFS.find(x => x.id === id);
    if (!h) { D.toast && D.toast('Handoff not found.', 'error'); return; }

    if (!h.on.startsWith('cron.')) {
      const suggested = prompt(`Run "${id}" for which entity ID?\n(e.g. project id, deal id, lead id)`, '');
      if (suggested === null) return;
      const coll = COLL_MAP[h.on];
      const entity = coll ? (arr(coll) || []).find(x => x.id === suggested) : null;
      if (!entity) { D.toast && D.toast('Entity not found.', 'error'); return; }
      const evt = makeEvt(h.on, {
        entityId: entity.id,
        payload: entity,
        meta: { collection: coll }
      });
      await runHandoff(h, evt, { manual: true });
    } else {
      const evt = makeEvt(h.on, {});
      await runHandoff(h, evt, { manual: true });
    }
    renderOrchestrationPanelDebounced();
    D.toast && D.toast(`${id} re-triggered.`, 'success');
  }

  async function retryFailure(failId) {
    const list = D.state?.data?._orchestrationFailures || [];
    const f = list.find(x => x.id === failId);
    if (!f) return;

    const h = ORCHESTRATION_HANDOFFS.find(x => x.id === f.handoffId);
    if (h?.when) {
      try {
        if (!h.when(f.evt, D.state)) {
          D.toast && D.toast('Handoff no longer applies — discarding.', 'info');
          if (D.state?.data) D.state.data._orchestrationFailures = list.filter(x => x.id !== failId);
          try { await D.remove(D.ref(D.db, D.P(`orchestration/failures/${failId}`))); } catch (e) {}
          renderOrchestrationPanelDebounced();
          return;
        }
      } catch (e) {}
    }

    const fn = HANDLERS[f.handlerName];
    if (!fn) { D.toast && D.toast('Handler not registered.', 'error'); return; }
    try {
      await fn(f.evt || {}, { retry: true });
      if (D.state?.data) D.state.data._orchestrationFailures = list.filter(x => x.id !== failId);
      try { await D.remove(D.ref(D.db, D.P(`orchestration/failures/${failId}`))); } catch (e) {}
      D.toast && D.toast('Retry succeeded.', 'success');
    } catch (e) {
      f.retries = (f.retries || 0) + 1;
      f.error = e.message;
      try { await D.set(D.ref(D.db, D.P(`orchestration/failures/${failId}`)), sanitizeFirebaseValue(f)); } catch (e2) {}
      D.toast && D.toast('Retry failed: ' + e.message, 'error');
    }
    renderOrchestrationPanelDebounced();
  }

  async function runAllCrons() {
    if (_cronRunning) { D.toast && D.toast('Cron already running.', 'warning'); return; }
    const cronHandoffs = ORCHESTRATION_HANDOFFS.filter(h => h.on.startsWith('cron.'));
    const destructive = cronHandoffs.filter(h => h.destructive);
    const ok = await window.vioraConfirm(
      `This will run ${cronHandoffs.length} cron handler(s), including ${destructive.length} that create records or send messages:\n\n${destructive.map(h => '• ' + h.id).join('\n')}\n\nProceed?`,
      { title: 'Run all crons', confirmLabel: 'Run all', confirmClass: 'btn-primary' }
    );
    if (!ok) return;
    _cronRunning = true;
    try {
      for (const h of cronHandoffs) {
        const persisted = D.state?.data?._handoffState?.[h.id];
        const isEnabled = persisted === undefined ? h.enabled : persisted;
        if (!isEnabled) continue;
        const evt = makeEvt(h.on, {});
        await runHandoff(h, evt, { cron: true, manual: true });
      }
      renderOrchestrationPanelDebounced();
      D.toast && D.toast(`Ran ${cronHandoffs.length} cron handlers.`, 'success');
    } finally { _cronRunning = false; }
  }

  function startCron() {
    if (_cronTimer) return;
    _cronTimer = setInterval(() => {
      if (!D.state || !D.state.firebaseReady || !D.state.operator) return;

      const now = new Date();
      const hh = now.getHours();
      const mm = now.getMinutes();
      const day = now.getDate();
      const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${day}-${hh}-${mm}`;
      if (minuteKey === _lastCronMinute) return;
      _lastCronMinute = minuteKey;

      const types = new Set();
      if (mm === 0 && hh === 5) types.add('cron.dailyAnomalyScan');
      if (mm === 0 && hh === 6) { types.add('cron.contractExpiryCascade'); types.add('cron.complianceExpiryCascade'); }
      if (mm === 0 && hh === 8) { types.add('cron.overdueInstallmentReminder'); types.add('cron.lowStockAlert'); types.add('cron.taskDueTodayNotify'); }
      if (mm === 0 && hh === 9) { types.add('cron.invoiceReminderWaves'); types.add('cron.clientInactivityReengagement'); }
      if (mm === 0 && hh === 10) types.add('cron.invoiceAutoSendDraft');
      if (mm === 0 && day === 28 && hh === 6) types.add('cron.monthlyPayrollDraft');
      if (mm === 0 && day === 1 && hh === 3) types.add('cron.autoArchiveWorkflow');
      if (mm % 15 === 0) types.add('cron.mpesaAutoMatch');
      if (mm % 30 === 0) { types.add('cron.paymentBehaviorAnomaly'); types.add('cron.taskOverdueEscalation'); }

      for (const type of types) {
        const bucket = HANDOFFS_BY_EVENT.get(type);
        if (!bucket) continue;
        for (const h of bucket) {
          const persisted = D.state.data?._handoffState?.[h.id];
          const isEnabled = persisted === undefined ? h.enabled : persisted;
          if (!isEnabled) continue;
          const evt = makeEvt(type, {});
          runHandoff(h, evt, { cron: true }).catch(e => console.warn('cron', type, e));
        }
      }
    }, 60 * 1000);
  }

  function stopCron() {
    if (_cronTimer) { clearInterval(_cronTimer); _cronTimer = null; }
    _lastCronMinute = '';
    _cronRunning = false;
  }

  return { dispatchLocal, runHandoff, toggleHandoff, retrigger, retryFailure, runAllCrons, startCron, stopCron };
})();

/* ═══════════════════════════════════════════════════════════════
   EVENT BUS
   ═══════════════════════════════════════════════════════════════ */
export const EventBus = (function () {
  const MAX_RING = 500;
  const subscribers = {};
  let _flushing = false;
  let _workerInFlight = 0;
  const _WORKER_CONCURRENCY = 4;

  const WORKER_EVENT_WHITELIST = new Set([
    'payments.created',
    'invoices.created',
    'invoices.reconciled',
    'deal.won',
    'leads.qualified',
    'projects.created',
    'orders.upsert',
    'training.quizSubmitted'
  ]);

  function _ensureQueue() {
    const d = ensureData();
    if (!d) return [];
    if (!Array.isArray(d._eventBusQueue)) d._eventBusQueue = [];
    return d._eventBusQueue;
  }

  async function _postToWorker(evt) {
    if (!WORKER_EVENT_WHITELIST.has(evt.type)) return;
    if (!D.eventQueuePush) return;
    if (_workerInFlight >= _WORKER_CONCURRENCY) {
      try { await D.eventQueuePush(evt); } catch (e) {}
      return;
    }
    _workerInFlight++;
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) { await D.eventQueuePush(evt); return; }
      const user = D.auth && D.auth.currentUser;
      if (!user) { await D.eventQueuePush(evt); return; }
      const token = await user.getIdToken();
      const res = await fetch(`${D.WORKER_URL}/events/emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(evt)
      });
      if (!res.ok) await D.eventQueuePush(evt);
    } catch (e) {
      try { await D.eventQueuePush(evt); } catch (e2) {}
    } finally {
      _workerInFlight--;
    }
  }

  async function emit(type, entity, entityId, payload = {}, meta = {}) {
    try {
      const evt = {
        id: 'evt-' + uid(),
        type: String(type || 'unknown'),
        entityId: entityId || (entity && entity.id) || null,
        payload: payload || {},
        meta: meta || {},
        ts: nowIso(),
        by: D.state?.operator?.uid || 'system',
        byName: D.state?.operator?.name || 'System'
      };

      const d = ensureData();
      if (d) {
        d._eventLog = d._eventLog || [];
        d._eventLog.unshift(evt);
        if (d._eventLog.length > MAX_RING) {
          d._eventLog.length = MAX_RING;
        }
      }

      const subs = subscribers[type];
      if (subs && subs.length) {
        const snapshot = subs.slice();
        for (const fn of snapshot) {
          try { fn(evt); } catch (e) { console.warn('EventBus subscriber error', e); }
        }
      }

      _postToWorker(evt).catch(e => console.warn('[EventBus] worker post failed', e));
      try { Orchester.dispatchLocal(evt); } catch (e) { console.warn('Local dispatch error', e); }

      return evt;
    } catch (e) { console.warn('EventBus.emit failed', e); return null; }
  }

  function subscribe(type, handlerFn) {
    if (!subscribers[type]) subscribers[type] = [];
    if (typeof handlerFn === 'function') subscribers[type].push(handlerFn);
    return () => { subscribers[type] = (subscribers[type] || []).filter(f => f !== handlerFn); };
  }

  function recent(n = 50) {
    return (D.state?.data?._eventLog || []).slice(0, n);
  }

  async function flushQueue() {
    if (_flushing || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    _flushing = true;
    try {
      const user = D.auth && D.auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const persisted = await D.eventQueueDrain();
      const mem = _ensureQueue();
      const toSend = [...persisted, ...mem];
      mem.length = 0;

      for (const evt of toSend) {
        try {
          const res = await fetch(`${D.WORKER_URL}/events/emit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(evt)
          });
          if (res.ok) { await D.eventQueueRemove(evt.id); }
          else { mem.unshift(evt); break; }
        } catch (e) { mem.unshift(evt); break; }
      }
    } finally { _flushing = false; }
  }

  return { emit, subscribe, recent, flushQueue };
})();

/* ═══════════════════════════════════════════════════════════════
   ORCHESTRATION PANEL RENDER
   ═══════════════════════════════════════════════════════════════ */
let _orchRenderTimer = null;
function renderOrchestrationPanelDebounced() {
  if (_orchRenderTimer) return;
  _orchRenderTimer = setTimeout(() => {
    _orchRenderTimer = null;
    renderOrchestrationPanel();
  }, 100);
}

export function renderOrchestrationPanel() {
  try {
    if (!D.$) return;
    const evtHost = D.$('orchEventStream');
    const handoffHost = D.$('orchHandoffTable');
    const failHost = D.$('orchFailureLog');
    const kpiHost = D.$('orchKpi');
    const anomalyHost = D.$('orchAnomalyList');
    if (!evtHost) return;

    const d = ensureData();
    if (!d) return;

    if (kpiHost) {
      const events = (d._eventLog || []).length;
      const runs = (d._orchestrationRuns || []).length;
      const failures = (d._orchestrationFailures || []).length;
      const enabled = ORCHESTRATION_HANDOFFS.reduce((n, h) => {
        const p = d._handoffState?.[h.id];
        return n + ((p === undefined ? h.enabled : p) ? 1 : 0);
      }, 0);
      kpiHost.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-bolt"></i></div><div class="number">${events}</div><div class="label">Events (session)</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-diagram-project"></i></div><div class="number">${ORCHESTRATION_HANDOFFS.length}</div><div class="label">Handoffs</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-toggle-on"></i></div><div class="number">${enabled}</div><div class="label">Enabled</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-play"></i></div><div class="number">${runs}</div><div class="label">Runs</div></div>
        <div class="stat-card" style="${failures > 0 ? 'border-left:4px solid var(--accent-red);' : ''}"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="number" style="${failures > 0 ? 'color:var(--accent-red);' : ''}">${failures}</div><div class="label">Failures</div></div>
      `;
    }

    const events = (d._eventLog || []).slice(0, 50);
    evtHost.innerHTML = events.length === 0
      ? `<div class="orch-empty">No events yet. Every write, payment, and update appears here in real time.</div>`
      : events.map(e => `<div class="orch-event-row">
          <span class="orch-event-type">${escapeHtml(e.type || '')}</span>
          <span class="orch-event-body"><strong>${escapeHtml(String(e.entityId || '').slice(0, 12))}</strong> ${escapeHtml((e.meta?.collection || ''))}</span>
          <span class="orch-event-time">${timeAgo(e.ts)}</span>
        </div>`).join('');

    if (handoffHost) {
      handoffHost.innerHTML = ORCHESTRATION_HANDOFFS.map(h => {
        const persisted = d._handoffState?.[h.id];
        const isOn = persisted === undefined ? h.enabled : persisted;
        const safeId = escapeHtml(h.id).replace(/'/g, '&#39;');
        return `<div class="orch-handoff-row">
          <div>
            <div class="orch-handoff-id">${escapeHtml(h.id)}</div>
            <div class="orch-handoff-sub">on <code>${escapeHtml(h.on)}</code> · runs ${h.run.length} handler(s)</div>
          </div>
          <span class="orch-layer-chip">${escapeHtml(h.layer)}</span>
          <button class="orch-btn-mini" onclick="Orchester.retrigger('${safeId}')"><i class="fa-solid fa-play"></i> Run</button>
          <div class="orch-toggle ${isOn ? 'on' : ''}" onclick="Orchester.toggleHandoff('${safeId}', this)"></div>
        </div>`;
      }).join('');
    }

    if (failHost) {
      const failures = d._orchestrationFailures || [];
      failHost.innerHTML = failures.length === 0
        ? `<div class="orch-empty"><i class="fa-solid fa-circle-check" style="color:var(--accent-green);"></i> No failures — orchestrator healthy.</div>`
        : failures.slice(0, 30).map(f => `<div class="orch-failure-row">
            <div><strong>${escapeHtml(f.handoffId)}</strong> · ${escapeHtml(f.handlerName || '')}<br><small style="color:var(--text-secondary);">${escapeHtml(f.error || '')}</small></div>
            <span class="orch-event-time">${timeAgo(f.ts)}</span>
            <button class="orch-btn-mini" onclick="Orchester.retryFailure('${escapeHtml(f.id)}')"><i class="fa-solid fa-rotate"></i> Retry</button>
          </div>`).join('');
    }

    if (anomalyHost) {
      const anomalies = d._aiAnomalies || [];
      anomalyHost.innerHTML = anomalies.length === 0
        ? `<div class="orch-empty">No anomalies detected. Daily scan runs at 05:00.</div>`
        : anomalies.slice(0, 20).map(a => `<div class="ai-anomaly-card ${a.severity || 'medium'}">
            <div class="aa-title">${escapeHtml(a.title || '')}</div>
            <div class="aa-desc">${escapeHtml(a.description || '')}</div>
            <div class="aa-meta">${escapeHtml(a.category || '')} · ${timeAgo(a.ts)}</div>
          </div>`).join('');
    }
  } catch (e) { console.warn('renderOrchestrationPanel failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   ARCHIVER
   ═══════════════════════════════════════════════════════════════ */
export const Archiver = (function () {
  const BUCKET_BY_COLLECTION = {
    entities: 'archivedClients',
    deals: 'archivedDeals',
    projects: 'archivedProjects'
  };
  const COLLECTION_BY_BUCKET = {
    archivedClients: 'entities',
    archivedDeals: 'deals',
    archivedProjects: 'projects'
  };
  const BUCKET_BY_SHORT = {
    clients: 'archivedClients',
    deals: 'archivedDeals',
    projects: 'archivedProjects'
  };

  async function archive(collection, id, reason = 'Auto-archived') {
    const bucket = BUCKET_BY_COLLECTION[collection];
    if (!bucket) return false;
    const d = ensureData();
    if (!d) return false;
    const list = d[collection] || [];
    const item = list.find(x => x.id === id);
    if (!item) return false;

    const archivedItem = {
      ...item,
      archivedAt: nowIso(),
      archivedBy: D.state?.operator?.name || 'system',
      reason
    };

    const bucketList = d[bucket] || (d[bucket] = []);
    bucketList.push(archivedItem);

    try { await D.set(D.ref(D.db, D.P(`${bucket}/${id}`)), sanitizeFirebaseValue(archivedItem)); } catch (e) {}
    try { await D.remove(D.ref(D.db, `${D.P(collection)}/${id}`)); } catch (e) {}

    d[collection] = list.filter(x => x.id !== id);
    try { await EventBus.emit('entity.archived', archivedItem, id, archivedItem, { collection, bucket }); } catch (e) {}
    await D.logActivity('delete', `Archived ${collection}`, `${item.name || item.title || id} — ${reason}`);
    return true;
  }

  async function restore(shortBucket, id) {
    const bucket = BUCKET_BY_SHORT[shortBucket];
    if (!bucket) return false;
    const targetCollection = COLLECTION_BY_BUCKET[bucket];
    const d = ensureData();
    if (!d) return false;
    const list = d[bucket] || [];
    const item = list.find(x => x.id === id);
    if (!item) { D.toast && D.toast('Archived item not found.', 'error'); return false; }

    const restored = { ...item };
    delete restored.archivedAt;
    delete restored.archivedBy;
    delete restored.reason;

    try { await D.set(D.ref(D.db, `${D.P(targetCollection)}/${id}`), sanitizeFirebaseValue(restored)); }
    catch (e) { D.toast && D.toast('Restore failed: ' + e.message, 'error'); return false; }
    try { await D.remove(D.ref(D.db, D.P(`${bucket}/${id}`))); } catch (e) {}

    d[bucket] = list.filter(x => x.id !== id);
    const coll = d[targetCollection] || (d[targetCollection] = []);
    if (!coll.find(x => x.id === id)) coll.push(restored);

    try { await EventBus.emit('entity.restored', restored, id, restored, { collection: targetCollection, bucket }); } catch (e) {}
    await D.logActivity('add', `Restored ${targetCollection}`, `${item.name || item.title || id}`);
    D.toast && D.toast('Restored.', 'success');
    renderArchivesPanel();
    return true;
  }

  async function runAll() {
    const now = Date.now();
    let archivedClients = 0, archivedDeals = 0, archivedProjects = 0;

    for (const c of (D.getClients ? D.getClients() : [])) {
      const lastActive = c._lastActivityAt || c.updatedAt || c.createdAt;
      if (!lastActive) continue;
      const days = Math.floor((now - new Date(lastActive).getTime()) / DAY_MS);
      if (days >= 60 && c.status === 'closed') {
        if (await archive('entities', c.id, `Closed & inactive ${days} days`)) archivedClients++;
      } else if (days >= 45 && c.status === 'closed' && !c._inactivityWarningAt) {
        const owner = arr('users').find(u => u.role === 'sales');
        if (owner && D.PushNotifications) {
          try { await D.PushNotifications.sendToUid(owner.uid, 'Client will be archived soon', `${c.name} — inactive ${days} days`); } catch (e) {}
        }
        c._inactivityWarningAt = nowIso();
        try { await D.upsertDoc('entities', c, c._rev); } catch (e) {}
      }
    }

    for (const dd of arr('deals')) {
      if (dd.stage !== 'Won') continue;
      const closedAt = dd._updatedAt || dd.createdAt;
      if (!closedAt) continue;
      const days = Math.floor((now - new Date(closedAt).getTime()) / DAY_MS);
      if (days >= 730) {
        if (await archive('deals', dd.id, `Won deal >2 years old`)) archivedDeals++;
      }
    }

    for (const p of arr('projects')) {
      if (p.status !== 'closed') continue;
      const closedAt = p._updatedAt || p.deadline || p.createdAt;
      if (!closedAt) continue;
      const days = Math.floor((now - new Date(closedAt).getTime()) / DAY_MS);
      if (days >= 365) {
        if (await archive('projects', p.id, `Closed project >1 year old`)) archivedProjects++;
      }
    }

    const total = archivedClients + archivedDeals + archivedProjects;
    if (total > 0) {
      await D.logActivity('delete', 'Auto-archive ran', `${archivedClients} clients, ${archivedDeals} deals, ${archivedProjects} projects`);
      D.toast && D.toast(`Archived ${total} record(s).`, 'info');
    } else {
      D.toast && D.toast('No records met archive criteria.', 'info');
    }
    renderArchivesPanel();
    return { archivedClients, archivedDeals, archivedProjects };
  }

  return { archive, restore, runAll };
})();

/* ═══════════════════════════════════════════════════════════════
   ARCHIVES PANEL RENDER
   ═══════════════════════════════════════════════════════════════ */
export function renderArchivesPanel() {
  try {
    if (!D.$) return;
    const kpi = D.$('archKpi');
    const clientsHost = D.$('archClientsList');
    const dealsHost = D.$('archDealsList');
    const projectsHost = D.$('archProjectsList');
    if (!clientsHost) return;

    const d = ensureData();
    if (!d) return;

    const ac = d.archivedClients || [];
    const ad = d.archivedDeals || [];
    const ap = d.archivedProjects || [];

    if (kpi) {
      kpi.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-users"></i></div><div class="number">${ac.length}</div><div class="label">Archived Clients</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-handshake"></i></div><div class="number">${ad.length}</div><div class="label">Archived Deals</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-folder"></i></div><div class="number">${ap.length}</div><div class="label">Archived Projects</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-box-archive"></i></div><div class="number">${ac.length + ad.length + ap.length}</div><div class="label">Total Archived</div></div>
      `;
    }

    const renderArch = (host, items, type) => {
      if (!host) return;
      host.innerHTML = items.length === 0
        ? `<div class="orch-empty">No archived ${type} yet.</div>`
        : items.slice(0, 30).map(x => `<div class="arch-item">
            <div class="arch-icon"><i class="fa-solid ${type === 'clients' ? 'fa-user' : type === 'deals' ? 'fa-handshake' : 'fa-folder'}"></i></div>
            <div class="arch-body">
              <div class="arch-title">${escapeHtml(x.name || x.title || x.id)}</div>
              <div class="arch-sub">${escapeHtml(x.reason || 'Auto-archived')} · ${x.archivedAt ? timeAgo(x.archivedAt) : ''}</div>
            </div>
            <span class="orch-layer-chip">${escapeHtml(x.archivedBy || 'system')}</span>
            <button class="orch-btn-mini" onclick="Archiver.restore('${escapeHtml(type)}', '${escapeHtml(x.id)}')"><i class="fa-solid fa-rotate-left"></i> Restore</button>
          </div>`).join('');
    };

    renderArch(clientsHost, ac, 'clients');
    renderArch(dealsHost, ad, 'deals');
    renderArch(projectsHost, ap, 'projects');
  } catch (e) { console.warn('renderArchivesPanel failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   ORCHESTRATION CONSOLE
   ═══════════════════════════════════════════════════════════════ */
export const OrchestrationConsole = (function () {
  const PANEL_ID = 'vioraArchiveConsole';
  let _bound = false;
  const _selection = new Set();

  const BUCKET_META = {
    archivedClients:  { label: 'Clients',  icon: 'fa-user',       short: 'clients'  },
    archivedDeals:    { label: 'Deals',    icon: 'fa-handshake',  short: 'deals'    },
    archivedProjects: { label: 'Projects', icon: 'fa-folder',     short: 'projects' }
  };

  function allArchived() {
    const d = ensureData();
    if (!d) return [];
    const out = [];
    for (const bucket of Object.keys(BUCKET_META)) {
      const list = d[bucket] || [];
      for (const item of list) {
        out.push({
          bucket,
          short: BUCKET_META[bucket].short,
          id: item.id,
          name: item.name || item.title || item.id,
          reason: item.reason || '—',
          archivedAt: item.archivedAt || null,
          archivedBy: item.archivedBy || '—',
          raw: item
        });
      }
    }
    out.sort((a, b) => String(b.archivedAt || '').localeCompare(String(a.archivedAt || '')));
    return out;
  }

  function list(filter) {
    filter = filter || {};
    let items = allArchived();
    if (filter.bucket && filter.bucket !== 'all') {
      items = items.filter(x => x.bucket === filter.bucket);
    }
    if (filter.q) {
      const q = String(filter.q).toLowerCase();
      items = items.filter(x =>
        (x.name || '').toLowerCase().includes(q) ||
        (x.reason || '').toLowerCase().includes(q) ||
        (x.id || '').toLowerCase().includes(q) ||
        (x.archivedBy || '').toLowerCase().includes(q)
      );
    }
    return items;
  }

  async function restore(bucketShort, id) {
    return Archiver.restore(bucketShort, id);
  }

  async function restoreMany(items) {
    let ok = 0, fail = 0;
    for (const it of items) {
      try {
        const okr = await Archiver.restore(it.short, it.id);
        if (okr) ok++; else fail++;
      } catch (e) { fail++; }
    }
    if (typeof D.toast === 'function') {
      D.toast(`Restored ${ok} record(s)${fail ? ' · ' + fail + ' failed' : ''}.`, ok ? 'success' : 'warning');
    }
    return { ok, fail };
  }

  async function purge(bucket, id) {
    const d = ensureData();
    if (!d) return false;
    const list = d[bucket] || [];
    const item = list.find(x => x.id === id);
    if (!item) return false;
    if (typeof window.vioraConfirm === 'function') {
      const confirmed = await window.vioraConfirm(
        `Permanently delete archived "${item.name || item.title || id}"?\n\nThis cannot be undone.`,
        { title: 'Purge archived record', confirmLabel: 'Delete', confirmClass: 'btn-danger' }
      );
      if (!confirmed) return false;
    }
    try { await D.remove(D.ref(D.db, D.P(`${bucket}/${id}`))); } catch (e) {}
    d[bucket] = list.filter(x => x.id !== id);
    if (typeof D.logActivity === 'function') {
      try { await D.logActivity('delete', 'Archived record purged', `${bucket} · ${item.name || item.title || id}`); } catch (e) {}
    }
    if (typeof D.toast === 'function') D.toast('Record purged.', 'info');
    refresh();
    return true;
  }

  function exportJson() {
    const data = allArchived();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viora-archives-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (typeof D.toast === 'function') D.toast(`Exported ${data.length} archived record(s).`, 'success');
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'viora-archive-console';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2300',
      'background:rgba(3,6,14,0.72)',
      'backdrop-filter:blur(6px)',
      '-webkit-backdrop-filter:blur(6px)',
      'display:none', 'align-items:center', 'justify-content:center', 'padding:24px'
    ].join(';');

    panel.innerHTML = `
      <div style="width:min(1100px,100%);max-height:min(88vh,900px);display:flex;flex-direction:column;background:var(--bg-card,#0c1220);border:1px solid var(--border-color,#2a3550);border-radius:18px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid var(--border-color,#2a3550);">
          <div style="display:flex;align-items:center;gap:10px;">
            <i class="fa-solid fa-box-archive" style="color:var(--accent-gold,#ffc857);"></i>
            <h2 style="margin:0;font-family:'Space Grotesk',sans-serif;font-size:1.05rem;">Archive Console</h2>
            <span class="viora-archive-count" style="font-size:.72rem;color:var(--text-secondary,#94a3b8);"></span>
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" data-ac="export" class="btn btn-outline btn-sm"><i class="fa-solid fa-file-export"></i> Export JSON</button>
            <button type="button" data-ac="restoreAll" class="btn btn-outline btn-sm"><i class="fa-solid fa-rotate-left"></i> Restore selected</button>
            <button type="button" data-ac="close" class="btn btn-outline btn-sm" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
        <div style="padding:12px 22px;border-bottom:1px solid var(--border-color,#2a3550);display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <input type="search" data-ac="search" placeholder="Search name, reason, ID…" style="flex:1;min-width:220px;padding:9px 12px;border-radius:10px;border:1px solid var(--border-color,#2a3550);background:var(--bg-input,#0a0f1c);color:inherit;" />
          <select data-ac="bucket" style="padding:9px 12px;border-radius:10px;border:1px solid var(--border-color,#2a3550);background:var(--bg-input,#0a0f1c);color:inherit;">
            <option value="all">All buckets</option>
            <option value="archivedClients">Clients</option>
            <option value="archivedDeals">Deals</option>
            <option value="archivedProjects">Projects</option>
          </select>
          <span data-ac="selectionInfo" style="font-size:.72rem;color:var(--text-secondary,#94a3b8);"></span>
        </div>
        <div data-ac="list" style="flex:1;overflow-y:auto;padding:12px 22px;"></div>
      </div>`;

    document.body.appendChild(panel);

    panel.addEventListener('click', async (e) => {
      if (e.target === panel) { close(); return; }
      const act = e.target.closest('[data-ac]');
      if (!act) {
        const row = e.target.closest('[data-arch-row]');
        if (row) {
          const key = row.getAttribute('data-arch-row');
          if (_selection.has(key)) _selection.delete(key);
          else _selection.add(key);
          renderList();
        }
        return;
      }
      const a = act.getAttribute('data-ac');
      if (a === 'close') { close(); return; }
      if (a === 'export') { exportJson(); return; }
      if (a === 'restoreAll') {
        const items = [];
        for (const key of _selection) {
          const [bucket, id] = key.split('::');
          const short = BUCKET_META[bucket]?.short;
          if (short && id) items.push({ bucket, short, id });
        }
        if (!items.length) { D.toast && D.toast('Nothing selected.', 'info'); return; }
        await restoreMany(items);
        _selection.clear();
        renderList();
      }
    });

    panel.addEventListener('input', (e) => {
      if (e.target.matches('[data-ac="search"]')) renderList();
    });
    panel.addEventListener('change', (e) => {
      if (e.target.matches('[data-ac="bucket"]')) renderList();
    });

    panel.querySelector('[data-ac="list"]').addEventListener('click', async (e) => {
      const restoreBtn = e.target.closest('[data-ac-restore]');
      if (restoreBtn) {
        e.stopPropagation();
        const key = restoreBtn.getAttribute('data-ac-restore');
        const [bucket, id] = key.split('::');
        const short = BUCKET_META[bucket]?.short;
        if (!short) return;
        const ok = await restore(short, id);
        if (ok) { _selection.delete(key); renderList(); }
        return;
      }
      const purgeBtn = e.target.closest('[data-ac-purge]');
      if (purgeBtn) {
        e.stopPropagation();
        const key = purgeBtn.getAttribute('data-ac-purge');
        const [bucket, id] = key.split('::');
        await purge(bucket, id);
        return;
      }
    });

    _bound = true;
    return panel;
  }

  function renderList() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const search = panel.querySelector('[data-ac="search"]')?.value || '';
    const bucket = panel.querySelector('[data-ac="bucket"]')?.value || 'all';
    const items = list({ q: search, bucket });
    const countEl = panel.querySelector('.viora-archive-count');
    if (countEl) countEl.textContent = `${items.length} record${items.length === 1 ? '' : 's'}`;
    const selInfo = panel.querySelector('[data-ac="selectionInfo"]');
    if (selInfo) selInfo.textContent = _selection.size ? `${_selection.size} selected` : '';

    const host = panel.querySelector('[data-ac="list"]');
    if (!host) return;

    if (!items.length) {
      host.innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;color:var(--text-secondary,#94a3b8);">No archived records match.</div>';
      return;
    }

    host.innerHTML = items.map(it => {
      const key = `${it.bucket}::${it.id}`;
      const isSel = _selection.has(key);
      const icon = BUCKET_META[it.bucket]?.icon || 'fa-box';
      const label = BUCKET_META[it.bucket]?.label || it.bucket;
      const when = it.archivedAt ? timeAgo(it.archivedAt) : '—';
      return `<div data-arch-row="${key}" style="display:flex;align-items:center;gap:14px;padding:12px 14px;border:1px solid ${isSel ? 'var(--accent-blue,#00d4ff)' : 'var(--border-color,#2a3550)'};border-radius:12px;margin-bottom:8px;cursor:pointer;background:${isSel ? 'rgba(0,212,255,.06)' : 'transparent'};">
        <div style="width:38px;height:38px;border-radius:10px;background:var(--bg-input,#0a0f1c);display:flex;align-items:center;justify-content:center;color:var(--accent-blue,#00d4ff);">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(it.name)}</div>
          <div style="font-size:.72rem;color:var(--text-secondary,#94a3b8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(it.reason)} · ${escapeHtml(label)} · ${when} · by ${escapeHtml(it.archivedBy)}</div>
        </div>
        <button type="button" data-ac-restore="${key}" class="btn btn-success btn-xs"><i class="fa-solid fa-rotate-left"></i> Restore</button>
        <button type="button" data-ac-purge="${key}" class="btn btn-danger btn-xs" title="Permanently delete"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    }).join('');
  }

  function open() {
    const panel = ensurePanel();
    panel.style.display = 'flex';
    renderList();
    if (typeof D.logActivity === 'function') {
      try { D.logActivity('add', 'Archive console opened', 'User reviewed archives'); } catch (e) {}
    }
  }

  function close() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.style.display = 'none';
  }

  function refresh() {
    const panel = document.getElementById(PANEL_ID);
    if (panel && panel.style.display !== 'none') renderList();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById(PANEL_ID)?.style.display === 'flex') {
      close();
    }
  });

  return { open, close, list, restore, restoreMany, purge, exportJson, refresh };
})();

/* Expose on window so inline onclick handlers work. */
if (typeof window !== 'undefined') {
  window.VioraOrchestrationConsole = OrchestrationConsole;
  window.Orchester = Orchester;
  window.EventBus = EventBus;
  window.Archiver = Archiver;
  window.ORCHESTRATION_HANDOFFS = ORCHESTRATION_HANDOFFS;
  window.HANDLERS = HANDLERS;
}
