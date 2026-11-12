/* ═══════════════════════════════════════════════════════════════
   VIORA — FINANCE SUBSYSTEM  (v4 — hardened + perf-tuned)
   Handles: invoices, payments, M-Pesa reconciliation, STK push,
            credit transfers, statements, service agreements,
            invoice-paid lifecycle, subscription activation.
   ═══════════════════════════════════════════════════════════════ */

import {
  uid,
  todayStr,
  dateToStr,
  fmtDate,
  fmtKES,
  normalizePhone,
  escapeHtml as _escapeHtml,
} from './helpers.js';

/* ── Subscription paths (mirror subscription-schema.js) ── */
const SUBSCRIPTION_PATH = 'viora_data/orgs/viora/subscriptions';
const LICENSES_PATH     = 'viora_data/orgs/viora/licenses';

/* ── Injected dependencies ── */
let D = {
  db: null, ref: null, set: null, get: null, remove: null, push: null, update: null,
  P: null, ROOT: null,
  state: null,
  $: null, toast: null, logActivity: null, logComm: null, setSyncStatus: null,
  upsertDoc: null, deleteDoc: null, queueOfflineMutation: null,
  EventBus: null,
  callFn: null,
  getClient: null, getClientName: null, getProject: null, getProjectNumber: null,
  getClientInvoices: null, getClientProjects: null, getClientContracts: null,
  getProjectAgreedTotal: null, getProjectPaidTotal: null, getProjectBilledTotal: null,
  getProjectFinancialProgress: null, getProjectOverpayment: null,
  getClientAgreedTotal: null, getClientBilledTotal: null, getClientPaidTotal: null,
  getClientCreditTotal: null, getOverdueInstallments: null,
  recomputeProjectProgress: null, recomputeClientRollup: null,
  SENDER_PHONE: null, SENDER_EMAIL: null,
  buildClientStatementPdf: null, buildInvoicePdfBase64: null, PushNotifications: null,
  getLogoImg: null,
  openModal: null, closeModal: null,
  renderActiveTab: null,
};

export function initFinance(d) {
  D = { ...D, ...d };
  _paidMemo = new WeakMap();
  _paymentSaveInFlight = false;
  _bulkRemindInFlight = false;
}

/* ── Module-level state ── */
let _paymentSaveInFlight = false;
let _bulkRemindInFlight = false;

const EMPTY_ARR = Object.freeze([]);

/* ── Safe accessors ── */
const $ = (id) => {
  const f = D.$;
  if (typeof f === 'function') return f(id);
  return document.getElementById(id);
};
const S = () => D.state || null;
const toast = (m, t) => { if (typeof D.toast === 'function') D.toast(m, t); };
const logActivity = (k, s, d) => (typeof D.logActivity === 'function') ? D.logActivity(k, s, d) : Promise.resolve();
const logComm = (...args) => (typeof D.logComm === 'function') ? D.logComm(...args) : Promise.resolve();
const escapeHtml = (s) => (typeof _escapeHtml === 'function') ? _escapeHtml(s) : String(s == null ? '' : s);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function dataArr(key) {
  const s = D.state;
  const d = s && s.data;
  const v = d && d[key];
  return Array.isArray(v) ? v : EMPTY_ARR;
}

function liveInvoices()  { return dataArr('invoices'); }
function livePayments()  { return dataArr('payments'); }

/* ═══════════════════════════════════════════════════════════════
   INVOICE DERIVED HELPERS
   ═══════════════════════════════════════════════════════════════ */
let _paidMemo = new WeakMap();

function _buildPaidMemo(payments) {
  const map = new Map();
  for (let i = 0; i < payments.length; i++) {
    const p = payments[i];
    if (!p || !p.allocations) continue;
    const allocs = p.allocations;
    for (let j = 0; j < allocs.length; j++) {
      const a = allocs[j];
      if (!a || !a.invoiceId) continue;
      map.set(a.invoiceId, (map.get(a.invoiceId) || 0) + num(a.amount));
    }
  }
  return map;
}

function _currentPaidMemo() {
  const s = D.state;
  const payments = s && s.data && s.data.payments;
  if (!Array.isArray(payments)) return null;
  let map = _paidMemo.get(payments);
  if (map) return map;
  map = _buildPaidMemo(payments);
  _paidMemo.set(payments, map);
  return map;
}

export function invalidateInvoicePaidMemo() {
  _paidMemo = new WeakMap();
}

export function getInvoicePaidAmount(invoiceId) {
  if (!invoiceId) return 0;
  const map = _currentPaidMemo();
  if (!map) return 0;
  return map.get(invoiceId) || 0;
}

export function getInvoiceTotals(inv) {
  if (!inv) return { subtotal: 0, tax: 0, taxAmt: 0, total: 0 };
  let sub = 0;
  const items = inv.items;
  if (Array.isArray(items)) for (let i = 0; i < items.length; i++) sub += num(items[i] && items[i].amount);
  const extras = inv.extraCharges;
  if (Array.isArray(extras)) for (let i = 0; i < extras.length; i++) sub += num(extras[i] && extras[i].amount);
  return { subtotal: sub, tax: 0, taxAmt: 0, total: sub };
}

export function getInvoiceStatusDerived(inv) {
  if (!inv) return 'draft';
  const total = getInvoiceTotals(inv).total;
  const paid = getInvoicePaidAmount(inv.id);
  const status = inv.status || 'draft';
  if (status === 'draft') return 'draft';
  if (status === 'paid' || (total > 0 && paid >= total - 0.01)) return 'paid';
  if (paid > 0.01) return 'partial';
  if (inv.dueDate) {
    const due = Date.parse(inv.dueDate);
    if (Number.isFinite(due) && due < Date.now()) return 'overdue';
  }
  return status || 'sent';
}

export function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const invoices = liveInvoices();
  let count = 0;
  for (let i = 0; i < invoices.length; i++) {
    const n = invoices[i] && invoices[i].number;
    if (typeof n === 'string' && n.startsWith(prefix)) count++;
  }
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}

export function nextProjectInvoiceNumber(projectId) {
  const project = D.getProject ? D.getProject(projectId) : null;
  const base = (project && project.projectNumber) || 'INV';
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-${base}-`;
  const invoices = liveInvoices();
  let max = 0;
  for (let i = 0; i < invoices.length; i++) {
    const n = invoices[i] && invoices[i].number;
    if (typeof n !== 'string' || !n.startsWith(prefix)) continue;
    const tail = n.slice(prefix.length);
    const v = parseInt(tail, 10);
    if (Number.isFinite(v) && v > max) max = v;
  }
  const next = max > 0 ? max + 1 : 1;
  return `${prefix}${String(next).padStart(2, '0')}`;
}

export function buildInvoiceProgressMessage(invoice) {
  const client = D.getClient ? D.getClient(invoice.clientId) : null;
  const { total } = getInvoiceTotals(invoice);
  const paid = getInvoicePaidAmount(invoice.id);
  const balance = Math.max(0, total - paid);
  return [
    `Invoice ${invoice.number}`,
    `Client: ${client && client.name ? client.name : '—'}`,
    `Total: ${fmtKES(total, invoice.currency)}`,
    `Paid: ${fmtKES(paid, invoice.currency)}`,
    `Balance: ${fmtKES(balance, invoice.currency)}`,
    `Due: ${fmtDate(invoice.dueDate)}`,
    ``,
    `— VIORA Intercollective`,
    D.SENDER_PHONE || '',
  ].join('\n');
}

/* ═══════════════════════════════════════════════════════════════
   PAYMENT → INVOICE RECONCILIATION
   ═══════════════════════════════════════════════════════════════ */
export async function reconcilePayment(invoice) {
  const client = D.getClient ? D.getClient(invoice.clientId) : null;
  if (!client) return;
  const invTotal = getInvoiceTotals(invoice).total;
  if (invoice.projectId && typeof D.recomputeProjectProgress === 'function') {
    try { await D.recomputeProjectProgress(invoice.projectId); } catch (e) {}
  }
  if (typeof D.recomputeClientRollup === 'function') {
    try { await D.recomputeClientRollup(client.id); } catch (e) {}
  }
  await logActivity('pay', 'Payment reconciled',
    `${fmtKES(invTotal, invoice.currency)} for ${client.name} via invoice ${invoice.number}`);
}

/* ═══════════════════════════════════════════════════════════════
   SUBSCRIPTION ACTIVATION / RENEWAL
   ═══════════════════════════════════════════════════════════════ */
function _planDays(plan) {
  switch (plan) {
    case 'monthly':   return 30;
    case 'quarterly': return 90;
    case 'yearly':    return 365;
    default:          return 30;
  }
}

function _extendEndDate(currentEndIso, days) {
  const currentEnd = currentEndIso ? Date.parse(currentEndIso) : 0;
  const baseMs = Math.max(Date.now(), Number.isFinite(currentEnd) ? currentEnd : 0);
  return new Date(baseMs + days * 86400000).toISOString();
}

export async function handleSubscriptionInvoicePaid(invoice) {
  const subId = invoice && invoice.subscriptionId;
  if (!subId) return;

  if (!D.db || !D.ref || !D.get || !D.update) {
    console.warn('[finance] subscription post-payment skipped — Firebase deps missing');
    return;
  }

  let sub = null;
  try {
    const snap = await D.get(D.ref(D.db, `${SUBSCRIPTION_PATH}/${subId}`));
    if (snap.exists()) sub = snap.val();
  } catch (e) {
    console.warn('[finance] subscription fetch failed', e);
  }

  /* ── If the sub record doesn't exist (client-paid-first flow),
     create it from the invoice data so activation can proceed. ── */
  if (!sub) {
    console.warn('[finance] subscription not found — creating from invoice', invoice.number, subId);

    const firstItem = Array.isArray(invoice.items) ? invoice.items[0] : null;
    const durationDays = Number(firstItem && firstItem.extensionDays) || 30;

    const planType =
      (firstItem && firstItem.billingCycle === 'quarterly') ? 'quarterly'
      : (firstItem && firstItem.billingCycle === 'yearly')  ? 'yearly'
      : (firstItem && firstItem.billingCycle === 'lifetime') ? 'lifetime'
      : 'monthly';

    const endDate = planType === 'lifetime'
      ? null
      : new Date(Date.now() + durationDays * 86400000).toISOString();

    const client = D.getClient ? D.getClient(invoice.clientId) : null;

    const newSub = {
      id: subId,
      clientId: invoice.clientId,
      clientName: (client && client.name) || invoice.clientName || '',
      clientEmail: (client && client.email) || invoice.clientEmail || '',
      clientSlug: (client && client.name ? String(client.name).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') : 'client'),
      productId: invoice.productId || (firstItem && firstItem.productId) || '',
      productName: invoice.productName || (firstItem && firstItem.productName) || '',
      plan: planType,
      status: 'active',
      startDate: new Date().toISOString(),
      endDate,
      graceHours: 72,
      amountKES: Number(firstItem && firstItem.amount) || 0,
      modules: (firstItem && firstItem.modules) || [],
      renewalCount: 0,
      _createdByInvoiceId: invoice.id,
      _activatedByInvoiceId: invoice.id,
      activatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await D.set(D.ref(D.db, `${SUBSCRIPTION_PATH}/${subId}`), newSub);
      sub = newSub;

      /* Create the matching license record */
      const licId = 'lic-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await D.set(D.ref(D.db, `${LICENSES_PATH}/${licId}`), {
        licenseKey: licId,
        subscriptionId: subId,
        productId: newSub.productId,
        clientId: newSub.clientId,
        deviceFingerprint: null,
        installedAt: null,
        lastCheckAt: null,
        status: 'active',
        issuedAt: new Date().toISOString(),
        issuedByInvoiceId: invoice.id
      });
      await D.update(D.ref(D.db, `${SUBSCRIPTION_PATH}/${subId}`), {
        licenseId: licId,
        updatedAt: new Date().toISOString()
      });
      sub = { ...newSub, licenseId: licId };

      await logActivity('edit', 'Subscription created from paid invoice',
        `${newSub.clientName} — ${newSub.productName} (${invoice.number})`);

      console.log('[finance] ✓ Sub + license created from invoice', invoice.id);
    } catch (e) {
      console.error('[finance] sub creation from invoice failed', e);
      toast('Invoice paid, but subscription creation failed: ' + (e.message || e), 'error');
      return;
    }

    /* Fall through to normal activation logic below */
  }

  const nowIso = new Date().toISOString();

  if (invoice.isSubscriptionCheckout) {
    if (sub._activatedByInvoiceId === invoice.id) return;

    let existingLicense = null;
    try {
      const licSnap = await D.get(D.ref(D.db, LICENSES_PATH));
      if (licSnap.exists()) {
        const all = licSnap.val();
        for (const [k, v] of Object.entries(all)) {
          if (v && v.subscriptionId === subId && v.status !== 'revoked') {
            existingLicense = { id: k, ...v };
            break;
          }
        }
      }
    } catch (e) {}

    if (existingLicense) {
      await D.update(D.ref(D.db, `${SUBSCRIPTION_PATH}/${subId}`), {
        status: 'active',
        licenseId: existingLicense.id,
        pendingInvoiceId: null,
        pendingExtensionDays: null,
        _activatedByInvoiceId: invoice.id,
        activatedAt: nowIso,
        updatedAt: nowIso
      });
      await logActivity('edit', 'Subscription activated (existing license)',
        `${sub.clientName || ''} — ${sub.productName || ''} (license ${existingLicense.id})`);
      _notifySubscriptionActivated(sub, existingLicense.id);
      return;
    }

    const endDate = sub.plan === 'lifetime'
      ? null
      : new Date(Date.now() + _planDays(sub.plan) * 86400000).toISOString();

    const licId = 'lic-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    const license = {
      licenseKey: licId,
      subscriptionId: subId,
      productId: sub.productId,
      clientId: sub.clientId,
      deviceFingerprint: null,
      installedAt: null,
      lastCheckAt: null,
      status: 'active',
      issuedAt: nowIso,
      issuedByInvoiceId: invoice.id
    };

    try {
      await D.set(D.ref(D.db, `${LICENSES_PATH}/${licId}`), license);
    } catch (e) {
      console.error('[finance] license write failed', e);
      toast('Invoice paid, but license creation failed: ' + (e.message || e), 'error');
      return;
    }

    try {
      await D.update(D.ref(D.db, `${SUBSCRIPTION_PATH}/${subId}`), {
        status: 'active',
        startDate: sub.startDate || nowIso,
        endDate,
        licenseId: licId,
        pendingInvoiceId: null,
        pendingExtensionDays: null,
        _activatedByInvoiceId: invoice.id,
        activatedAt: nowIso,
        updatedAt: nowIso
      });
    } catch (e) {
      console.error('[finance] subscription patch failed', e);
      try { await D.remove(D.ref(D.db, `${LICENSES_PATH}/${licId}`)); } catch (_) {}
      toast('Invoice paid, but subscription activation failed: ' + (e.message || e), 'error');
      return;
    }

    await logActivity('edit', 'Subscription activated',
      `${sub.clientName || ''} — ${sub.productName || ''} (license ${licId})`);
    _notifySubscriptionActivated(sub, licId);

    try {
      if (D.EventBus && typeof D.EventBus.emit === 'function') {
        D.EventBus.emit('subscriptions.activated', {
          subscriptionId: subId,
          licenseId: licId,
          clientId: sub.clientId,
          productId: sub.productId
        }, subId, { collection: 'subscriptions' });
      }
    } catch (e) {}
    return;
  }

  if (invoice.isRenewal) {
    if (sub._lastRenewalByInvoiceId === invoice.id) return;

    const firstItem = Array.isArray(invoice.items) ? invoice.items[0] : null;
    const days = num(firstItem && firstItem.extensionDays) ||
                 num(sub.pendingExtensionDays) ||
                 0;

    if (days <= 0) {
      console.warn('[finance] renewal invoice has no extensionDays', invoice.id);
      toast('Invoice paid, but renewal duration is missing.', 'warning');
      return;
    }

    const newEnd = _extendEndDate(sub.endDate, days);

    try {
      await D.update(D.ref(D.db, `${SUBSCRIPTION_PATH}/${subId}`), {
        status: 'active',
        endDate: newEnd,
        renewalCount: num(sub.renewalCount) + 1,
        pendingInvoiceId: null,
        pendingExtensionDays: null,
        _lastRenewalByInvoiceId: invoice.id,
        lastRenewedAt: nowIso,
        updatedAt: nowIso
      });
    } catch (e) {
      console.error('[finance] subscription renewal patch failed', e);
      toast('Invoice paid, but renewal failed: ' + (e.message || e), 'error');
      return;
    }

    await logActivity('edit', 'Subscription renewed',
      `${sub.clientName || ''} — ${sub.productName || ''} (+${days} days)`);

    try {
      if (typeof window !== 'undefined' && typeof window.vioraNotify === 'function') {
        await window.vioraNotify({
          title: '🔁 Subscription renewed',
          body: `${sub.productName || sub.productId} — +${days} days`,
          icon: 'fa-rotate',
          level: 'success',
          url: '/main.html?tab=subscriptions',
          source: 'subscription-renewal',
          eventId: 'invoice-' + invoice.id
        });
      }
    } catch (e) {}
    return;
  }

  console.warn(
    '[finance] subscription invoice has neither isSubscriptionCheckout nor isRenewal',
    invoice.id, invoice.number
  );
}

function _notifySubscriptionActivated(sub, licId) {
  try {
    if (typeof window !== 'undefined' && typeof window.vioraNotify === 'function') {
      window.vioraNotify({
        title: '🎉 Subscription activated',
        body: `${sub.productName || sub.productId} — ${sub.clientName || ''}`,
        icon: 'fa-key',
        level: 'success',
        url: '/main.html?tab=subscriptions',
        source: 'subscription-activation',
        eventId: 'license-' + licId
      }).catch(() => {});
    }
  } catch (e) {}
}

/* ═══════════════════════════════════════════════════════════════
   INVOICE PAID LIFECYCLE
   ═══════════════════════════════════════════════════════════════ */
export async function onInvoicePaid(invoice) {
  if (!invoice) return invoice;

  /* ── Safety net: if this is a subscription invoice and the sub is
     still pending_payment / expired / grace, force-activate it.
     This catches ANY payment path that forgot to call us directly. ── */
  if (invoice.subscriptionId) {
    try {
      const subSnap = await D.get(D.ref(D.db, `${SUBSCRIPTION_PATH}/${invoice.subscriptionId}`));

      /* ── If the sub is missing entirely, delegate to
         handleSubscriptionInvoicePaid — it will create it. ── */
      if (!subSnap.exists()) {
        console.warn('[finance] safety net: sub missing — delegating to handler', invoice.subscriptionId);
        await handleSubscriptionInvoicePaid(invoice);
      } else {
        const sub = subSnap.val();
        const needsActivation =
          sub.status === 'pending_payment' ||
          sub.status === 'expired' ||
          (sub.status === 'active' && sub.endDate && Date.parse(sub.endDate) < Date.now());

        if (needsActivation) {
          const durationDays = Number(
            (invoice.items || [])[0]?.extensionDays
          ) || _planDays(sub.plan) || 30;

          const newEnd = _extendEndDate(sub.endDate, durationDays);
          await D.update(D.ref(D.db, `${SUBSCRIPTION_PATH}/${invoice.subscriptionId}`), {
            status: 'active',
            endDate: newEnd,
            pendingInvoiceId: null,
            pendingExtensionDays: null,
            _activatedByInvoiceId: invoice.id,
            _safetyNetActivatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            renewalCount: invoice.isRenewal
              ? (Number(sub.renewalCount) || 0) + 1
              : (Number(sub.renewalCount) || 0)
          });
          console.log('[finance] ✓ Safety-net activated sub', invoice.subscriptionId, '→ endDate:', newEnd);
          toast('✅ Subscription activated.', 'success');
        }
      }
    } catch (e) {
      console.warn('[finance] safety-net activation failed:', e);
    }
  }
  const invoices = liveInvoices();
  const liveInvoice = invoices.find(i => i && i.id === invoice.id) || null;
  if (invoice._paidProcessedAt || (liveInvoice && liveInvoice._paidProcessedAt)) {
    return liveInvoice || invoice;
  }

  const stamp = new Date().toISOString();
  const prevStatus = invoice.status;
  const prevReminders = invoice.remindersSent;

  invoice._paidProcessedAt = stamp;
  if (liveInvoice && liveInvoice !== invoice) liveInvoice._paidProcessedAt = stamp;

  const client = D.getClient ? D.getClient(invoice.clientId) : null;
  const total = getInvoiceTotals(invoice).total;

  invoice.remindersSent = [];
  invoice.status = 'paid';

  let wroteInvoice = false;
  try {
    if (typeof D.upsertDoc === 'function') {
      await D.upsertDoc('invoices', invoice, invoice._rev);
      wroteInvoice = true;
    }
  } catch (e) {
    delete invoice._paidProcessedAt;
    if (liveInvoice && liveInvoice !== invoice) delete liveInvoice._paidProcessedAt;
    invoice.status = prevStatus;
    invoice.remindersSent = prevReminders;
    console.warn('[finance] invoice paid write failed', e);
    return invoice;
  }
  if (!wroteInvoice) return invoice;

  await logActivity('pay', 'Invoice paid', invoice.number || '');

  if (invoice.subscriptionId) {
    try {
      await handleSubscriptionInvoicePaid(invoice);
    } catch (e) {
      console.error('[finance] subscription post-payment failed', e);
      toast('Invoice paid, but subscription activation failed: ' + (e.message || e), 'warning');
    }
  }

  if (D.PushNotifications && D.PushNotifications.sendToUid) {
    try {
      const team = dataArr('users').filter(u => u && (u.role === 'finance' || u.role === 'exec'));
      Promise.allSettled(
        team.map(u => D.PushNotifications.sendToUid(
          u.uid, 'Invoice paid',
          `${invoice.number} — ${(client && client.name) || ''}`
        ).catch(() => {}))
      );
    } catch (e) {}
  }

  if (!client) {
    _deferReceiptPrompt(invoice);
    return invoice;
  }

  client._lastActivityAt = new Date().toISOString();

  if (typeof D.recomputeClientRollup === 'function') {
    try { await D.recomputeClientRollup(client.id); } catch (e) {}
  }

  try {
    const refreshed = (D.getClient && D.getClient(client.id)) || client;
    if (num(refreshed._creditBalance) > 0) {
      const open = (D.getClientInvoices ? D.getClientInvoices(refreshed.id) : [])
        .filter(i => {
          const st = getInvoiceStatusDerived(i);
          return st !== 'paid' && st !== 'draft';
        })
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      if (open[0]) await applyClientCreditToInvoice(refreshed.id, open[0].id);
    }
  } catch (e) {
    console.warn('[finance] credit application failed', e);
  }

  try {
    const allInvoices = D.getClientInvoices ? D.getClientInvoices(client.id) : [];
    const allPaid = allInvoices.length > 0 &&
      allInvoices.every(i => getInvoiceStatusDerived(i) === 'paid');
    const refreshed = (D.getClient && D.getClient(client.id)) || client;

    if (allPaid && refreshed.installments && refreshed.installments.length &&
        refreshed.installments.every(i => i.paid)) {
      refreshed.status = 'closed';
      refreshed._closedAt = new Date().toISOString();

      const projects = (D.getClientProjects ? D.getClientProjects(refreshed.id) : [])
        .filter(p => p.status === 'active');
      for (const p of projects) {
        p.status = 'closed';
        p.progress = 100;
        p._closedAt = new Date().toISOString();
        try { await D.upsertDoc('projects', p, p._rev); } catch (e) {}
        try { D.EventBus && D.EventBus.emit('projects.upsert', p, p.id, p, { collection: 'projects' }); } catch (e) {}
      }

      const task = {
        id: uid(),
        title: `Client satisfaction survey — ${refreshed.name}`,
        description: 'All invoices paid. Client closed. Send satisfaction survey.',
        dueDate: dateToStr(new Date(Date.now() + 7 * 86400000)),
        taskType: 'Client Delivery',
        priority: 'medium',
        status: 'pending',
        assignedTo: (S() && S().operator && S().operator.name) || 'Sales',
        createdAt: new Date().toISOString(),
        autoGenerated: true,
      };
      try { await D.upsertDoc('tasks', task); } catch (e) {}

      const contracts = D.getClientContracts ? D.getClientContracts(refreshed.id) : [];
      for (const c of contracts) {
        if (c.status === 'Active') {
          c.status = 'Completed';
          c._completedAt = new Date().toISOString();
          try { await D.upsertDoc('contracts', c, c._rev); } catch (e) {}
        }
      }

      try { await D.upsertDoc('entities', refreshed, refreshed._rev); } catch (e) {}
    } else {
      try { await D.upsertDoc('entities', refreshed, refreshed._rev); } catch (e) {}
    }
  } catch (e) {
    console.warn('[finance] auto-close failed', e);
  }

  _deferReceiptPrompt(invoice);
  return invoice;
}

function _deferReceiptPrompt(invoice) {
  if (typeof window.vioraConfirm !== 'function') return;
  Promise.resolve().then(async () => {
    try {
      const send = await window.vioraConfirm(
        `Invoice ${invoice.number} is fully paid.\n\nSend the receipt to the client now?`,
        { title: 'Send receipt', confirmLabel: 'Send', cancelLabel: 'Not now',
          icon: 'fa-paper-plane', confirmClass: 'btn-primary' }
      );
      if (send) await sendInvoiceReceipt(invoice);
    } catch (e) {
      console.warn('[finance] receipt prompt failed', e);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   RECEIPT SENDER
   ═══════════════════════════════════════════════════════════════ */
export async function sendInvoiceReceipt(invoice) {
  const client = D.getClient ? D.getClient(invoice.clientId) : null;
  if (!client) { toast('Client not found.', 'error'); return; }

  if (invoice._receiptPreparedAt) {
    const age = Date.now() - Date.parse(invoice._receiptPreparedAt);
    if (Number.isFinite(age) && age > 10 * 60 * 1000) {
      toast('Receipt already prepared for this invoice.', 'info');
      return;
    }
  }

  const total = getInvoiceTotals(invoice).total;
  const paid = getInvoicePaidAmount(invoice.id);
  const balance = Math.max(0, total - paid);

  const body = [
    `🧾 INVOICE ${invoice.number} — PAID`,
    ``,
    `Client: ${client.name || ''}`,
    `Total: ${fmtKES(total, invoice.currency)}`,
    `Paid: ${fmtKES(paid, invoice.currency)}`,
    `Balance: ${fmtKES(balance, invoice.currency)}`,
    `Date: ${fmtDate(todayStr())}`,
    ``,
    `Thank you.`,
    `— VIORA Intercollective`,
    D.SENDER_PHONE || '',
  ].join('\n');

  const subject = `Receipt — ${invoice.number}`;
  const hasPhone = !!client.phone;
  const hasEmail = !!client.email;
  if (!hasPhone && !hasEmail) {
    toast('No phone or email on file for this client.', 'warning');
    return;
  }

  const vc = typeof window.vioraConfirm === 'function' ? window.vioraConfirm : async () => true;

  let channels = [];
  if (hasPhone && hasEmail) {
    const both = await vc(
      `Send receipt for ${invoice.number} to ${client.name}.\n\n` +
        `Phone: ${client.phone}\nEmail: ${client.email}\n\n` +
        `Open BOTH WhatsApp and Gmail compose tabs?`,
      { title: 'Receipt — choose channels', confirmLabel: 'Open both',
        cancelLabel: 'Pick one', icon: 'fa-paper-plane', confirmClass: 'btn-primary' }
    );
    if (both) channels = ['wa', 'em'];
    else {
      const waOnly = await vc('Open WhatsApp only?\n\n(Click Cancel for Gmail only.)',
        { title: 'Choose channel', confirmLabel: 'WhatsApp', cancelLabel: 'Gmail',
          icon: 'fa-comment', confirmClass: 'btn-success' });
      channels = waOnly ? ['wa'] : ['em'];
    }
  } else if (hasPhone) channels = ['wa'];
  else channels = ['em'];

  let pdf = null;
  if (typeof D.buildInvoicePdfBase64 === 'function') {
    try { pdf = await D.buildInvoicePdfBase64(invoice.id); }
    catch (e) { console.warn('[finance] receipt PDF build failed', e); }
  }

  const opened = [];

  if (channels.includes('wa')) {
    const waText = body + (pdf ? `\n\n(PDF receipt "${pdf.filename}" attached separately.)` : '');
    window.open('https://wa.me/' + normalizePhone(client.phone) + '?text=' + encodeURIComponent(waText),
      'viora_receipt_wa_' + Date.now(), 'noopener,noreferrer');
    opened.push('WhatsApp');
    try {
      await logComm('wa', client.id, client.name, client.phone, '', waText, {
        reason: 'invoice-paid-receipt', transport: 'wa.me-compose',
        userMustClickSend: true, dedupeKey: `receipt|${invoice.id}|wa`,
      });
    } catch (e) {}
  }

  if (channels.includes('em')) {
    const emBody = body + (pdf ? `\n\n(PDF receipt "${pdf.filename}" attached separately.)` : '');
    const gmailUrl = 'https://mail.google.com/mail/?view=cm&fs=1' +
      '&to=' + encodeURIComponent(client.email) +
      '&su=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(emBody);
    window.open(gmailUrl, 'viora_receipt_em_' + Date.now(),
      'noopener,noreferrer,width=780,height=820,left=600,top=60');
    opened.push('Gmail');
    try {
      await logComm('em', client.id, client.name, client.email, subject, emBody, {
        reason: 'invoice-paid-receipt', transport: 'gmail-compose',
        userMustClickSend: true, dedupeKey: `receipt|${invoice.id}|email`,
      });
    } catch (e) {}
  }

  const nowIso = new Date().toISOString();
  const prevPrepared = invoice._receiptPreparedAt ? Date.parse(invoice._receiptPreparedAt) : 0;
  const recentlyPrepared = prevPrepared && Date.now() - prevPrepared < 10 * 60 * 1000;

  if (!recentlyPrepared) {
    invoice._receiptPreparedAt = nowIso;
    invoice._receiptChannels = opened;
  } else {
    invoice._receiptChannels = Array.from(new Set([...(invoice._receiptChannels || []), ...opened]));
  }
  try { await D.upsertDoc('invoices', invoice, invoice._rev); } catch (e) {}

  if (pdf) {
    const download = await vc(
      `Receipt compose tab${opened.length > 1 ? 's' : ''} opened (${opened.join(' + ')}).\n\n` +
        `Download the PDF receipt now so you can attach it in the compose window?`,
      { title: 'Attach the PDF?', confirmLabel: 'Download PDF',
        cancelLabel: 'Skip', icon: 'fa-file-pdf', confirmClass: 'btn-gold' }
    );
    if (download) {
      const a = document.createElement('a');
      a.href = 'data:application/pdf;base64,' + pdf.base64;
      a.download = pdf.filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  toast(`Receipt ready in ${opened.join(' + ')}. Review and click Send.`, 'success');
}

/* ═══════════════════════════════════════════════════════════════
   CLIENT WALLET CREDIT APPLICATION
   ═══════════════════════════════════════════════════════════════ */
export async function applyClientCreditToInvoice(clientId, invoiceId) {
  const client = D.getClient ? D.getClient(clientId) : null;
  const invoice = liveInvoices().find(i => i && i.id === invoiceId);
  if (!client || !invoice) return;

  const credit = num(client._creditBalance);
  if (credit <= 0) return;

  const total = getInvoiceTotals(invoice).total;
  const paid = getInvoicePaidAmount(invoice.id);
  const outstanding = total - paid;
  const toApply = Math.min(credit, outstanding);
  if (toApply <= 0) return;

  const payment = {
    id: uid(),
    clientId,
    projectId: invoice.projectId || null,
    date: todayStr(),
    amount: toApply,
    currency: invoice.currency || 'KES',
    method: 'Credit',
    reference: `Wallet credit → ${invoice.number}`,
    notes: 'Auto-applied from client wallet',
    allocations: [{ invoiceId: invoice.id, amount: toApply }],
    createdAt: new Date().toISOString(),
    createdBy: 'system-credit',
  };

  await D.upsertDoc('payments', payment);
  invalidateInvoicePaidMemo();

  const live = (D.getClient && D.getClient(clientId)) || client;
  live._creditBalance = Math.max(0, num(live._creditBalance) - toApply);
  await D.upsertDoc('entities', live, live._rev);

  if (typeof D.recomputeClientRollup === 'function') {
    try { await D.recomputeClientRollup(clientId); } catch (e) {}
  }

  const newPaid = getInvoicePaidAmount(invoice.id);
  if (newPaid >= total - 0.01) {
    try { await onInvoicePaid(invoice); } catch (e) {}
  }
}

/* ═══════════════════════════════════════════════════════════════
   PAY CHAIN
   ═══════════════════════════════════════════════════════════════ */
export function openPayChain(clientId) {
  const c = D.getClient ? D.getClient(clientId) : null;
  if (!c) { toast('Client not found.', 'error'); return; }

  const projects = (D.getClientProjects ? D.getClientProjects(clientId) : [])
    .filter(p => p.status !== 'cancelled');
  if (!projects.length) {
    toast('This client has no projects yet. Create a project first.', 'warning');
    return;
  }

  const agreedTotal = num(D.getClientAgreedTotal ? D.getClientAgreedTotal(clientId) : 0);
  const paidTotal   = num(D.getClientPaidTotal ? D.getClientPaidTotal(clientId) : 0);
  const balance     = Math.max(0, agreedTotal - paidTotal);

  const s = S();
  if (s) s._payChain = { clientId, projects };

  const host = $('payChainBody');
  if (!host) { toast('Pay modal missing — reload.', 'error'); return; }

  let optsHtml = '';
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const pa = num(D.getProjectAgreedTotal ? D.getProjectAgreedTotal(p.id) : 0);
    const pp = num(D.getProjectPaidTotal ? D.getProjectPaidTotal(p.id) : 0);
    const pbal = Math.max(0, pa - pp);
    optsHtml += `<option value="${escapeHtml(p.id)}">${escapeHtml(p.projectNumber || p.title)} — Agreed ${fmtKES(pa)} · Paid ${fmtKES(pp)} · Balance ${fmtKES(pbal)}</option>`;
  }

  host.innerHTML =
    '<div style="padding:14px;background:var(--bg-input);border-radius:12px;margin-bottom:16px;border:1px solid var(--border-color);">' +
      '<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--text-secondary);">Client:</span><strong>' + escapeHtml(c.name) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--text-secondary);">Agreed across all projects:</span><strong>' + fmtKES(agreedTotal) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--text-secondary);">Paid so far:</span><strong style="color:var(--accent-green);">' + fmtKES(paidTotal) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid var(--border-color);margin-top:6px;padding-top:8px;"><span style="color:var(--text-secondary);">Remaining:</span><strong style="color:' + (balance > 0 ? 'var(--accent-gold)' : 'var(--accent-green)') + ';">' + fmtKES(balance) + '</strong></div>' +
    '</div>' +
    '<label>Which project is this payment for? *</label>' +
    '<select id="payChainProject">' + optsHtml + '</select>' +
    '<label style="margin-top:14px;">Payment amount (KES) *</label>' +
    '<input type="number" id="payChainAmount" min="1" step="1" placeholder="e.g. 50000" />' +
    '<label>Payment method</label>' +
    '<select id="payChainMethod"><option value="M-PESA">M-PESA</option><option value="Bank Transfer">Bank Transfer</option><option value="Cash">Cash</option><option value="Cheque">Cheque</option><option value="Card">Card</option></select>' +
    '<label>Reference (optional)</label>' +
    '<input id="payChainRef" placeholder="e.g. QJK4X1234" />' +
    '<div id="payChainPreview" style="margin-top:16px;padding:12px;background:var(--bg-input);border-radius:12px;font-size:.82rem;border:1px solid var(--border-color);">Pick a project and enter an amount.</div>';

  const updatePreview = () => {
    const projIdEl = $('payChainProject');
    const amountEl = $('payChainAmount');
    const amount = amountEl ? num(amountEl.value) : 0;
    const preview = $('payChainPreview');
    if (!preview) return;

    const p = projIdEl && D.getProject ? D.getProject(projIdEl.value) : null;
    if (!p) { preview.innerHTML = '<em>Pick a project.</em>'; return; }

    const agreed = num(D.getProjectAgreedTotal ? D.getProjectAgreedTotal(p.id) : 0);
    const paid   = num(D.getProjectPaidTotal ? D.getProjectPaidTotal(p.id) : 0);
    const bal    = Math.max(0, agreed - paid);
    const after  = Math.max(0, bal - amount);
    const pct    = agreed > 0 ? Math.min(100, Math.round(((paid + amount) / agreed) * 100)) : 0;

    preview.innerHTML =
      '<div style="font-weight:700;margin-bottom:6px;">' + escapeHtml(p.projectNumber || p.title) + '</div>' +
      '<div>Agreed: <strong>' + fmtKES(agreed) + '</strong></div>' +
      '<div>Paid so far: <strong>' + fmtKES(paid) + '</strong></div>' +
      '<div>This project\'s remaining balance: <strong>' + fmtKES(bal) + '</strong></div>' +
      (amount > 0
        ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-color);">' +
            '<div>After this payment: <strong>' + fmtKES(paid + amount) + '</strong> of ' + fmtKES(agreed) + ' · ' + pct + '%</div>' +
            '<div>New project balance: <strong style="color:' + (after > 0 ? 'var(--accent-gold)' : 'var(--accent-green)') + ';">' + fmtKES(after) + '</strong></div>' +
            '<div style="margin-top:6px;color:var(--text-secondary);font-size:.75rem;">A draft invoice will be created for this project.</div>' +
          '</div>'
        : '');
  };

  const projSel = $('payChainProject');
  const amtInput = $('payChainAmount');
  if (projSel) projSel.addEventListener('change', updatePreview);
  if (amtInput) amtInput.addEventListener('input', updatePreview);
  updatePreview();

  if (typeof D.openModal === 'function') D.openModal('payChainModal');
}

export async function confirmPayChain() {
  const s = S();
  const ctx = s && s._payChain;
  if (!ctx) { toast('Session expired — reopen the modal.', 'error'); return; }

  const projectIdEl = $('payChainProject');
  const amountEl = $('payChainAmount');
  const methodEl = $('payChainMethod');
  const refEl = $('payChainRef');

  const projectId = projectIdEl ? projectIdEl.value : '';
  const amount = amountEl ? num(amountEl.value) : 0;
  const method = methodEl ? methodEl.value : 'M-PESA';
  const reference = refEl ? refEl.value.trim() : '';

  if (!projectId) { toast('Pick a project.', 'error'); return; }
  if (amount <= 0) { toast('Enter a payment amount.', 'error'); return; }

  const project = D.getProject ? D.getProject(projectId) : null;
  if (!project) { toast('Project not found.', 'error'); return; }

  const now = new Date().toISOString();
  const payment = {
    id: uid(),
    clientId: project.clientId,
    projectId,
    date: todayStr(),
    amount,
    currency: 'KES',
    method,
    reference,
    notes: `Payment for ${project.projectNumber || project.title}`,
    allocations: [],
    createdAt: now,
    createdBy: (s && s.operator && s.operator.uid) || 'system',
  };

  const invoice = {
    id: uid(),
    number: nextProjectInvoiceNumber(projectId),
    clientId: project.clientId,
    projectId,
    date: todayStr(),
    dueDate: todayStr(),
    status: 'paid',
    currency: 'KES',
    tax: 0,
    items: [{
      description: `Payment — ${project.projectNumber || project.title}` + (reference ? ` · Ref ${reference}` : ''),
      hours: null, rate: null, amount, projectId,
    }],
    extraCharges: [],
    notes: `Receipt for payment recorded via ${method}`,
    createdAt: now,
    autoGenerated: true,
    paidAt: now,
    _paidProcessedAt: now,
  };

  payment.allocations = [{ invoiceId: invoice.id, amount }];

  const data = s && s.data;
  if (data) {
    if (!Array.isArray(data.payments)) data.payments = [];
    if (!Array.isArray(data.invoices)) data.invoices = [];
    data.payments.push(payment);
    data.invoices.push(invoice);
  }
  invalidateInvoicePaidMemo();

  if (typeof D.closeModal === 'function') D.closeModal('payChainModal');
  if (s) s._payChain = null;
  if (typeof D.renderActiveTab === 'function') D.renderActiveTab();
  toast(`✅ ${fmtKES(amount)} recorded on ${project.projectNumber || project.title}.`, 'success');

  try {
    await _persistPayChain(payment, invoice, project);
  } catch (e) {
    console.warn('[finance] pay-chain persist failed', e);
    if (data) {
      const pi = data.payments.indexOf(payment);
      if (pi >= 0) data.payments.splice(pi, 1);
      const ii = data.invoices.indexOf(invoice);
      if (ii >= 0) data.invoices.splice(ii, 1);
    }
    invalidateInvoicePaidMemo();
    if (typeof D.renderActiveTab === 'function') D.renderActiveTab();
    toast('Payment could not be saved — please retry.', 'error');
  }
}

async function _persistPayChain(payment, invoice, project) {
  let paymentSaved = false;
  try {
    await D.upsertDoc('payments', payment);
    paymentSaved = true;
    invalidateInvoicePaidMemo();
    await D.upsertDoc('invoices', invoice);
  } catch (e) {
    if (!paymentSaved) {
      try { await D.queueOfflineMutation('payments', 'upsert', payment, null); } catch (e2) {}
      try { await D.queueOfflineMutation('invoices', 'upsert', invoice, null); } catch (e2) {}
      return;
    }
    // Invoice write failed after payment was saved — best-effort rollback to avoid orphan.
    try {
      if (typeof D.deleteDoc === 'function') await D.deleteDoc('payments', payment.id);
      else if (D.remove && D.ref && D.db && D.P) await D.remove(D.ref(D.db, `${D.P('payments')}/${payment.id}`));
    } catch (e2) {
      console.warn('[finance] pay-chain orphan payment rollback failed', e2);
    }
    throw e;
  }

  const tasks = [];
  if (D.EventBus) {
    tasks.push(Promise.resolve().then(() => {
      try { D.EventBus.emit('payments.created', payment, payment.id, {
        clientId: project.clientId, projectId: project.id,
        amount: payment.amount, method: payment.method,
      }); } catch (e) {}
    }));
    tasks.push(Promise.resolve().then(() => {
      try { D.EventBus.emit('invoices.created', invoice, invoice.id, {
        number: invoice.number, clientId: project.clientId, projectId: project.id,
      }); } catch (e) {}
    }));
  }
  if (typeof D.recomputeProjectProgress === 'function') {
    tasks.push(D.recomputeProjectProgress(project.id).catch(() => {}));
  }
  if (typeof D.recomputeClientRollup === 'function') {
    tasks.push(D.recomputeClientRollup(project.clientId).catch(() => {}));
  }
  tasks.push(logActivity('pay', 'Payment recorded',
    `${fmtKES(payment.amount)} → ${project.projectNumber || project.title} via ${payment.method}`).catch(() => {}));

  await Promise.allSettled(tasks);
}

/* ═══════════════════════════════════════════════════════════════
   PAYMENT MODAL
   ═══════════════════════════════════════════════════════════════ */
export function openPaymentModal(preset = {}) {
  const clients = dataArr('entities').filter(e => e && e.type === 'client');
  if (!clients.length) { toast('Add a client first.', 'error'); return; }

  const el = (id) => $(id);
  const payClient = el('payClient');
  if (!payClient) { toast('Payment modal missing — reload.', 'error'); return; }

  let opts = '';
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    opts += `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`;
  }
  payClient.innerHTML = opts;

  if (preset.clientId) payClient.value = preset.clientId;
  if (preset.amount) {
    const el2 = el('payAmount'); if (el2) el2.value = preset.amount;
  }

  const dateEl = el('payDate');     if (dateEl) dateEl.value = todayStr();
  const refEl = el('payRef');       if (refEl) refEl.value = '';
  const currEl = el('payCurrency'); if (currEl) currEl.value = 'KES';
  const methEl = el('payMethod');   if (methEl) methEl.value = 'M-PESA';

  const s = S();
  if (s) {
    s.pendingPaymentInvoice = preset.invoiceId || null;
    s._paymentInstallment = null;
    s._paymentProjectId = null;
  }

  const inv = preset.invoiceId ? liveInvoices().find(i => i.id === preset.invoiceId) : null;
  const notesEl = el('payNotes');
  if (notesEl) {
    if (inv) {
      notesEl.value = `Paid against ${inv.number} · ${(D.getProjectNumber && D.getProjectNumber(inv.projectId)) || ''}`;
    } else {
      notesEl.value = '';
    }
  }
  if (s && inv) s._paymentProjectId = inv.projectId || null;

  renderPaymentProjectPicker();
  renderPaymentAllocation();
  if (typeof D.openModal === 'function') D.openModal('paymentModal');
}

export function renderPaymentProjectPicker() {
  const host = $('paymentProjectPicker');
  if (!host) return;

  const cidEl = $('payClient');
  const cid = cidEl ? cidEl.value : '';
  if (!cid) { host.innerHTML = ''; return; }

  const projects = (D.getClientProjects ? D.getClientProjects(cid) : [])
    .filter(p => p.status !== 'cancelled');
  const s = S();

  if (!projects.length) {
    host.innerHTML =
      '<div class="form-note warning" style="margin-top:12px;">' +
        '<i class="fa-solid fa-triangle-exclamation"></i>' +
        '<div>This client has no projects yet. Create a project first, or use the client card <strong>Pay</strong> button which spawns one.</div>' +
      '</div>';
    if (s) s._paymentProjectId = null;
    return;
  }

  let opts = '';
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const agreed = num(D.getProjectAgreedTotal ? D.getProjectAgreedTotal(p.id) : 0);
    const paid   = num(D.getProjectPaidTotal ? D.getProjectPaidTotal(p.id) : 0);
    const bal    = Math.max(0, agreed - paid);
    const sel    = s && s._paymentProjectId === p.id ? ' selected' : '';
    opts += `<option value="${escapeHtml(p.id)}"${sel}>${escapeHtml(p.projectNumber || p.title)} — Agreed ${fmtKES(agreed)} · Paid ${fmtKES(paid)} · Balance ${fmtKES(bal)}</option>`;
  }

  host.innerHTML =
    '<label style="margin-top:12px;">Which project is this payment for? *</label>' +
    '<select id="payProject">' + opts + '</select>' +
    '<div style="font-size:.7rem;color:var(--text-light);margin-top:-4px;">The payment is scoped to the chosen project. Only that project\'s paid bar moves.</div>';

  const sel = $('payProject');
  if (sel) {
    if (s && !s._paymentProjectId) s._paymentProjectId = sel.value;
    sel.addEventListener('change', () => { if (s) s._paymentProjectId = sel.value; });
  }
}

export function renderPaymentAllocation() {
  const cidEl = $('payClient');
  const amtEl = $('payAmount');
  const host = $('paymentAllocation');
  if (!cidEl || !host) return;

  const cid = cidEl.value;
  const amount = amtEl ? num(amtEl.value) : 0;
  const invoices = (D.getClientInvoices ? D.getClientInvoices(cid) : [])
    .filter(i => getInvoiceStatusDerived(i) !== 'paid');

  const s = S();
  const presetInvId = s && s.pendingPaymentInvoice;
  const presetInv = presetInvId ? invoices.find(i => i.id === presetInvId) : null;

  let html = '';

  if (presetInv && presetInv.projectId) {
    const proj = D.getProject ? D.getProject(presetInv.projectId) : null;
    const insts = (proj && proj.installments ? proj.installments : []).filter(i => !i.paid);
    const invTot = getInvoiceTotals(presetInv).total;
    const invPaid = getInvoicePaidAmount(presetInv.id);
    const invOut = invTot - invPaid;

    html +=
      '<div style="padding:10px 12px;background:var(--bg-elev-2);border-radius:10px;margin-bottom:10px;border:1px solid var(--border-color);font-size:.82rem;">' +
        '<div style="font-weight:700;margin-bottom:4px;">Settling: ' + escapeHtml(presetInv.number) + '</div>' +
        '<div style="color:var(--text-secondary);">Project: <strong>' +
          escapeHtml((proj && proj.projectNumber) || '—') + '</strong> · Outstanding: <strong>' +
          fmtKES(invOut, presetInv.currency) + '</strong></div>' +
      '</div>';

    if (insts.length) {
      html += '<h4 style="font-size:.78rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;margin-bottom:6px;">Which installment does this payment settle?</h4>';
      const today = todayStr();
      for (let i = 0; i < insts.length; i++) {
        const inst = insts[i];
        const ov = inst.dueDate && inst.dueDate < today;
        const selected = s && s._paymentInstallment === inst.id;
        html +=
          '<label class="installment-row" style="display:flex;gap:10px;align-items:center;padding:10px 12px;border:1.5px solid ' +
            (selected ? 'var(--accent-blue)' : 'var(--border-color)') +
            ';border-radius:10px;margin-bottom:6px;cursor:pointer;background:' +
            (selected ? 'rgba(10,132,255,.06)' : 'var(--bg-input)') + ';">' +
            '<input type="radio" name="payInstPick" value="' + escapeHtml(inst.id) + '"' + (selected ? ' checked' : '') + ' data-inst-id="' + escapeHtml(inst.id) + '" data-proj-id="' + escapeHtml(proj.id) + '" data-inst-amount="' + num(inst.amount) + '" />' +
            '<div style="flex:1;min-width:0;">' +
              '<strong style="font-size:.85rem;">' + escapeHtml(inst.label || 'Installment') + '</strong>' +
              '<div style="font-size:.72rem;color:' + (ov ? 'var(--accent-red)' : 'var(--text-secondary)') + ';">Due ' + fmtDate(inst.dueDate) + (ov ? ' · OVERDUE' : '') + '</div>' +
            '</div>' +
            '<strong style="white-space:nowrap;">' + fmtKES(inst.amount) + '</strong>' +
          '</label>';
      }

      if (!host._instWired) {
        host._instWired = true;
        host.addEventListener('change', (ev) => {
          const radio = ev.target.closest && ev.target.closest('input[type="radio"][data-inst-id]');
          if (!radio) return;
          const s2 = S();
          if (s2) {
            s2._paymentInstallment = radio.getAttribute('data-inst-id');
            s2._paymentProjectId = radio.getAttribute('data-proj-id');
          }
          const amt = num(radio.getAttribute('data-inst-amount'));
          const amtEl2 = $('payAmount');
          if (amtEl2 && num(amtEl2.value) < amt) amtEl2.value = amt;
          updatePaymentSummary();
        });
      }
    } else {
      html += '<div class="form-note warning"><i class="fa-solid fa-triangle-exclamation"></i><div>This project has no unpaid installments yet. Open the project and click <strong>Generate Installments</strong> first.</div></div>';
    }

    html +=
      '<div style="margin-top:12px;">' +
        '<h4 style="font-size:.78rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;margin-bottom:6px;">Invoice allocation</h4>' +
        '<div class="installment-row" style="display:flex;gap:8px;align-items:center;padding:8px 12px;border:1px solid var(--border-color);border-radius:8px;">' +
          '<div style="flex:1;"><strong>' + escapeHtml(presetInv.number) + '</strong> <span style="font-size:.72rem;color:var(--text-secondary);">Out: ' + fmtKES(invOut, presetInv.currency) + '</span></div>' +
          '<input type="number" class="allocInput" data-inv-id="' + escapeHtml(presetInv.id) + '" value="' + Math.min(amount, invOut).toFixed(2) + '" step="0.01" min="0" style="width:120px;padding:4px 8px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);" />' +
        '</div>' +
      '</div>';
  } else {
    if (!invoices.length) {
      host.innerHTML = '<div class="empty-state" style="padding:14px;">No open invoices for this client.</div>';
      const sum = $('paymentSummary');
      if (sum) sum.innerHTML = '';
      return;
    }

    let remaining = amount;
    html = '<h4 style="font-size:.78rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;margin-bottom:6px;">Allocate to invoices (oldest first)</h4>';
    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      const total = getInvoiceTotals(inv).total;
      const paidAlready = getInvoicePaidAmount(inv.id);
      const outstanding = total - paidAlready;
      const autoAlloc = Math.min(remaining, outstanding);
      remaining -= autoAlloc;
      const projNum = inv.projectId && D.getProjectNumber ? D.getProjectNumber(inv.projectId) : '';
      html +=
        '<div class="installment-row" style="display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border-color);">' +
          '<div style="flex:1;min-width:0;">' +
            '<strong>' + escapeHtml(inv.number) + '</strong>' +
            (projNum ? ' <span class="badge badge-purple" style="font-size:.6rem;margin-left:4px;">' + escapeHtml(projNum) + '</span>' : '') +
            '<div style="font-size:.72rem;color:var(--text-secondary);">' + fmtDate(inv.dueDate) + ' · Out: ' + fmtKES(outstanding, inv.currency) + '</div>' +
          '</div>' +
          '<input type="number" class="allocInput" data-inv-id="' + escapeHtml(inv.id) + '" value="' + autoAlloc.toFixed(2) + '" step="0.01" min="0" style="width:120px;padding:4px 8px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);" />' +
        '</div>';
    }
  }

  host.innerHTML = html;
  updatePaymentSummary();

  if (!host._allocWired) {
    host._allocWired = true;
    host.addEventListener('input', (ev) => {
      if (ev.target.classList && ev.target.classList.contains('allocInput')) updatePaymentSummary();
    });
  }
}

export function updatePaymentSummary() {
  const amtEl = $('payAmount');
  const sum = $('paymentSummary');
  if (!amtEl || !sum) return;

  const amount = num(amtEl.value);
  let allocated = 0;
  const modal = sum.closest('.modal-overlay') || document;
  modal.querySelectorAll('.allocInput').forEach(inp => { allocated += num(inp.value); });
  const unallocated = amount - allocated;

  const s = S();
  let chosenInst = null;
  if (s && s._paymentInstallment && s._paymentProjectId && D.getProject) {
    const p = D.getProject(s._paymentProjectId);
    if (p && Array.isArray(p.installments)) {
      chosenInst = p.installments.find(i => i.id === s._paymentInstallment) || null;
    }
  }

  const currEl = $('payCurrency');
  const currency = currEl ? currEl.value : 'KES';

  sum.innerHTML =
    (chosenInst
      ? '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Settling installment</span><strong>' + escapeHtml(chosenInst.label || '') + '</strong></div>'
      : '') +
    '<div style="display:flex;justify-content:space-between;"><span>Payment Amount</span><strong>' + fmtKES(amount, currency) + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;"><span>Allocated</span><strong>' + fmtKES(allocated, currency) + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;color:' +
      (unallocated > 0.01 ? 'var(--accent-gold)' : unallocated < -0.01 ? 'var(--accent-red)' : 'var(--accent-green)') +
      ';"><span>Unallocated</span><strong>' + fmtKES(unallocated, currency) + '</strong></div>' +
    (unallocated < -0.01
      ? '<div style="color:var(--accent-red);font-size:.72rem;margin-top:4px;">⚠️ Allocated more than the payment amount.</div>'
      : '');
}

export async function savePayment() {
  const cidEl = $('payClient');
  const amtEl = $('payAmount');
  const cid = cidEl ? cidEl.value : '';
  const amount = amtEl ? num(amtEl.value) : 0;

  if (amount <= 0) { toast('Amount must be positive.', 'error'); return; }
  if (_paymentSaveInFlight) { toast('Payment already saving…', 'warning'); return; }
  _paymentSaveInFlight = true;

  try {
    const allocations = [];
    const modal = (amtEl && amtEl.closest('.modal-overlay')) || document;
    modal.querySelectorAll('.allocInput').forEach(inp => {
      const amt = num(inp.value);
      if (amt > 0) allocations.push({ invoiceId: inp.dataset.invId, amount: amt });
    });
    const allocated = allocations.reduce((s, a) => s + a.amount, 0);
    if (allocated > amount + 0.01) { toast('Allocated more than payment.', 'error'); return; }

    const s = S();
    const pickedProjId = s && s._paymentProjectId ? s._paymentProjectId : null;
    const pickedInstId = s && s._paymentInstallment ? s._paymentInstallment : null;

    const methodEl = $('payMethod');
    const dateEl = $('payDate');
    const currEl = $('payCurrency');
    const refEl = $('payRef');
    const notesEl = $('payNotes');

    const payment = {
      id: uid(),
      clientId: cid,
      projectId: pickedProjId,
      date: (dateEl && dateEl.value) || todayStr(),
      amount,
      currency: (currEl && currEl.value) || 'KES',
      method: methodEl ? methodEl.value : 'M-PESA',
      reference: refEl ? refEl.value.trim() : '',
      notes: notesEl ? notesEl.value.trim() : '',
      allocations,
      createdAt: new Date().toISOString(),
      createdBy: (s && s.operator && s.operator.uid) || 'system',
    };

    const data = s && s.data;
    if (data) {
      if (!Array.isArray(data.payments)) data.payments = [];
      data.payments.push(payment);
    }
    if (allocations.length) invalidateInvoicePaidMemo();

    /* ★ v9.4 — Force the client card + sidebar to recompute */
    try {
      if (typeof D.recomputeClientRollup === 'function') await D.recomputeClientRollup(cid);
    } catch (_) {}
    try {
      if (typeof D.updateSidebarCounters === 'function') D.updateSidebarCounters(true);
    } catch (_) {}

    if (typeof D.closeModal === 'function') D.closeModal('paymentModal');
    if (s) {
      s._paymentInstallment = null;
      s._paymentProjectId = null;
    }
    if (typeof D.renderActiveTab === 'function') D.renderActiveTab();
    toast('Payment recorded.', 'success');

    _persistPayment(payment, allocations, cid, pickedProjId, pickedInstId).catch(e => {
      console.warn('[finance] payment persist failed', e);
    });
  } finally {
    _paymentSaveInFlight = false;
  }
}

async function _persistPayment(payment, allocations, cid, pickedProjId, pickedInstId) {
  try {
    await D.upsertDoc('payments', payment);
    invalidateInvoicePaidMemo();
  } catch (e) {
    try { await D.queueOfflineMutation('payments', 'upsert', payment, null); } catch (e2) {}
    return;
  }

  const method = payment.method;
  const debitAccount =
    (method === 'Cash' || method === 'M-PESA') ? '1010 Cash' :
    (method === 'Bank Transfer' || method === 'Card' || method === 'Cheque') ? '1020 Bank' :
    '1010 Cash';
  const jLines = [
    { account: debitAccount, debit: payment.amount, credit: 0 },
    { account: '1100 Accounts Receivable', debit: 0, credit: payment.amount },
  ];

  const clientName = (D.getClientName && D.getClientName(cid)) || '';

  const tasks = [];

  tasks.push((async () => {
    try {
      await D.callFn('ledger/post', {
        date: payment.date,
        memo: `Payment ${payment.reference || ''} from ${clientName}`,
        refType: 'payment',
        refId: payment.id,
        lines: jLines,
      });
    } catch (e) {
      try {
        await D.queueOfflineMutation('ledger', 'upsert', {
          id: uid(), date: payment.date,
          memo: `[PENDING] Payment ${payment.reference || ''} from ${clientName}`,
          refType: 'payment', refId: payment.id, lines: jLines,
        }, null);
      } catch (e2) { console.warn('[finance] ledger queue failed', e2); }
    }
  })());

  tasks.push((async () => {
    for (const a of allocations) {
      const inv = liveInvoices().find(i => i && i.id === a.invoiceId);
      if (!inv) continue;
      const total = getInvoiceTotals(inv).total;
      const paid = getInvoicePaidAmount(inv.id);
      if (paid >= total - 0.01) {
        try { await onInvoicePaid(inv); } catch (e) { console.warn('[finance] onInvoicePaid failed', e); }
      }
    }
  })());

  if (typeof D.recomputeClientRollup === 'function') {
    tasks.push(D.recomputeClientRollup(cid).catch(() => {}));
  }
  if (pickedProjId && typeof D.recomputeProjectProgress === 'function') {
    tasks.push(D.recomputeProjectProgress(pickedProjId).catch(() => {}));
  }
  tasks.push(logActivity('pay', 'Payment recorded', `${fmtKES(payment.amount)} from ${clientName}`).catch(() => {}));

  if (D.EventBus) {
    tasks.push(Promise.resolve().then(() => {
      try {
        D.EventBus.emit('payments.created', payment, payment.id, {
          clientId: cid, amount: payment.amount, allocations,
          installmentId: pickedInstId, projectId: pickedProjId,
        });
      } catch (e) {}
    }));
  }

  await Promise.allSettled(tasks);
}

export async function deletePayment(id) {
  const p = livePayments().find(x => x && x.id === id);
  if (!p) return;
  if (typeof window.vioraConfirm === 'function') {
    const ok = await window.vioraConfirm('Delete this payment?', {
      title: 'Delete payment', confirmLabel: 'Delete', cancelLabel: 'Cancel',
      icon: 'fa-trash', confirmClass: 'btn-danger',
    });
    if (!ok) return;
  } else if (!confirm('Delete this payment?')) {
    return;
  }

  const clientId = p.clientId;
  const projectId = p.projectId;

  if (typeof D.deleteDoc === 'function') await D.deleteDoc('payments', id);
  else if (D.remove && D.ref && D.db && D.P) await D.remove(D.ref(D.db, `${D.P('payments')}/${id}`));

  invalidateInvoicePaidMemo();
  if (clientId && typeof D.recomputeClientRollup === 'function') {
    try { await D.recomputeClientRollup(clientId); } catch (e) {}
  }
  if (projectId && typeof D.recomputeProjectProgress === 'function') {
    try { await D.recomputeProjectProgress(projectId); } catch (e) {}
  }

  toast('Payment deleted.', 'info');
  if (typeof D.renderActiveTab === 'function') D.renderActiveTab();
}

/* ═══════════════════════════════════════════════════════════════
   INVOICE VIEWER + GENERATOR
   ═══════════════════════════════════════════════════════════════ */
export function openInvoiceGenModal() {
  toast('Invoices are created automatically when a payment is recorded. Use the Pay button on a client or project.', 'info');
}

export function refreshInvoiceProjects() {
  const cidEl = $('invGenClient');
  const cid = cidEl ? cidEl.value : '';
  const projects = dataArr('projects').filter(p => p && p.clientId === cid && (p.status === 'active' || p.status === 'pending'));

  const host = $('invoiceGenWorklogList');
  if (!host) return;

  if (!projects.length) {
    host.innerHTML = '<div class="empty-state" style="padding:16px;">No active projects. Add charges manually below, or create a project first.</div>';
    return;
  }

  const rows = [];
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const agreed = num(D.getProjectAgreedTotal ? D.getProjectAgreedTotal(p.id) : 0);
    const paid   = num(D.getProjectPaidTotal ? D.getProjectPaidTotal(p.id) : 0);
    const balance = Math.max(0, agreed - paid);
    const insts = (p.installments || []).filter(x => !x.paid);
    if (insts.length) {
      for (const inst of insts) {
        const remaining = Math.max(0, num(inst.amount) - num(inst.partialPaid));
        if (remaining <= 0) continue;
        rows.push({
          desc: `${p.projectNumber || p.title} — ${inst.label || 'Installment'}`,
          amount: remaining, projectId: p.id, installmentId: inst.id,
        });
      }
    } else if (balance > 0) {
      rows.push({
        desc: `${p.projectNumber || p.title} — Balance`,
        amount: balance, projectId: p.id, installmentId: null,
      });
    }
  }

  if (!rows.length) {
    host.innerHTML = '<div class="empty-state" style="padding:16px;">All project balances are settled. Add charges manually below.</div>';
    return;
  }

  let html = '';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    html +=
      '<label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border-color);cursor:pointer;">' +
        '<input type="checkbox" class="invGenCheck"' +
          ' data-project-id="' + escapeHtml(r.projectId) + '"' +
          ' data-installment-id="' + escapeHtml(r.installmentId || '') + '"' +
          ' data-amount="' + r.amount + '"' +
          ' data-desc="' + escapeHtml(r.desc) + '" checked />' +
        '<span style="flex:1;font-size:.8rem;">' + escapeHtml(r.desc) + ' = <strong>' + fmtKES(r.amount) + '</strong></span>' +
      '</label>';
  }
  host.innerHTML = html;
}

export function renderExtraCharges() {
  const s = S();
  const host = $('extraChargesList');
  if (!host || !s) return;

  const draft = s.extraChargesDraft || [];
  if (!draft.length) {
    host.innerHTML = '<div style="font-size:.75rem;color:var(--text-secondary);padding:6px 0;">No extra charges yet.</div>';
    return;
  }

  let html = '';
  for (let i = 0; i < draft.length; i++) {
    const ch = draft[i];
    html +=
      '<div style="display:flex;gap:8px;align-items:center;padding:8px 10px;background:var(--bg-input);border-radius:10px;margin-bottom:6px;border:1px solid var(--border-color);">' +
        '<input type="text" class="chargeLabel" data-idx="' + i + '" value="' + escapeHtml(ch.label || '') + '" placeholder="Label" style="flex:1;border:none;background:transparent;color:var(--text-primary);padding:4px;" />' +
        '<input type="number" class="chargeAmount" data-idx="' + i + '" value="' + num(ch.amount) + '" step="0.01" style="width:100px;text-align:right;border:none;background:transparent;color:var(--text-primary);padding:4px;" />' +
        '<button class="btn btn-danger btn-xs" data-remove-charge="' + i + '"><i class="fa-solid fa-xmark"></i></button>' +
      '</div>';
  }
  host.innerHTML = html;

  if (!host._wired) {
    host._wired = true;
    host.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.classList.contains('chargeLabel')) {
        const s2 = S(); if (!s2) return;
        const i = +t.dataset.idx;
        if (s2.extraChargesDraft[i]) s2.extraChargesDraft[i].label = t.value;
        updateInvoicePreview();
      } else if (t.classList.contains('chargeAmount')) {
        const s2 = S(); if (!s2) return;
        const i = +t.dataset.idx;
        if (s2.extraChargesDraft[i]) s2.extraChargesDraft[i].amount = num(t.value);
        updateInvoicePreview();
      }
    });
    host.addEventListener('click', (ev) => {
      const btn = ev.target.closest && ev.target.closest('[data-remove-charge]');
      if (!btn) return;
      removeCharge(+btn.getAttribute('data-remove-charge'));
    });
  }
}

export function removeCharge(i) {
  const s = S();
  if (!s || !Array.isArray(s.extraChargesDraft)) return;
  s.extraChargesDraft.splice(i, 1);
  renderExtraCharges();
  updateInvoicePreview();
}

export function updateInvoicePreview() {
  const s = S();
  const preview = $('invoiceGenPreview');
  if (!s || !preview) return;

  const items = [];
  document.querySelectorAll('.invGenCheck:checked').forEach(cb => {
    items.push({
      description: cb.dataset.desc,
      hours: null, rate: null,
      amount: num(cb.dataset.amount),
      worklogId: null,
      projectId: cb.dataset.projectId || null,
      installmentId: cb.dataset.installmentId || null,
    });
  });

  const charges = (s.extraChargesDraft || []).filter(c => c.label && num(c.amount) > 0);
  const currEl = $('invGenCurrency');
  const currency = currEl ? currEl.value : 'KES';

  if (!items.length && !charges.length) {
    preview.innerHTML = '<div class="empty-state" style="padding:14px;">Select work logs or add charges.</div>';
    return;
  }

  let sub = 0;
  for (const i of items) sub += num(i.amount);
  for (const c of charges) sub += num(c.amount);
  const total = sub;

  preview.innerHTML =
    '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;border-bottom:1px solid var(--border-color);padding-bottom:10px;margin-bottom:10px;">' +
      '<div><strong>Preview</strong><br><small style="color:var(--text-secondary);">' + items.length + ' items · ' + charges.length + ' charges</small></div>' +
      '<div style="text-align:right;"><strong>' + escapeHtml(currency) + '</strong></div>' +
    '</div>' +
    '<div style="font-size:.85rem;">' +
      '<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Subtotal</span><span>' + fmtKES(sub, currency) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;padding:4px 0;color:var(--text-secondary);"><span>Tax (0%)</span><span>' + fmtKES(0, currency) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid var(--border-color);margin-top:6px;font-weight:700;font-size:1rem;"><span>TOTAL</span><span>' + fmtKES(total, currency) + '</span></div>' +
    '</div>';
}

export function openInvoiceViewModal(id) {
  const inv = liveInvoices().find(x => x && x.id === id);
  if (!inv) return;

  const numEl = $('invoiceViewNumber');
  if (numEl) numEl.textContent = inv.number;

  const client = D.getClient ? D.getClient(inv.clientId) : null;
  const cn = (client && client.name) || '—';

  const seen = new Set();
  const cleanItems = [];
  const items = inv.items || [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const k = (it.worklogId || '') + '|' + num(it.amount).toFixed(2) + '|' + (it.description || '');
    if (seen.has(k)) continue;
    seen.add(k);
    cleanItems.push(it);
  }

  const invClean = { ...inv, items: cleanItems };
  const { subtotal, total } = getInvoiceTotals(invClean);
  const paidAmt = getInvoicePaidAmount(inv.id);
  const balance = total - paidAmt;
  const st = getInvoiceStatusDerived(inv);

  let itemsRows = '';
  for (let i = 0; i < cleanItems.length; i++) {
    const it = cleanItems[i];
    itemsRows +=
      '<tr><td>' + escapeHtml(it.description) + '</td>' +
      '<td>' + (it.hours ? Number(it.hours).toFixed(1) + 'h' : '—') + '</td>' +
      '<td>' + (it.rate ? fmtKES(it.rate, inv.currency) : '—') + '</td>' +
      '<td style="text-align:right;">' + fmtKES(it.amount, inv.currency) + '</td></tr>';
  }

  let chargeRows = '';
  const charges = inv.extraCharges || [];
  for (let i = 0; i < charges.length; i++) {
    const ch = charges[i];
    chargeRows += '<tr><td>' + escapeHtml(ch.label) + '</td><td>—</td><td>—</td>' +
      '<td style="text-align:right;">' + fmtKES(ch.amount, inv.currency) + '</td></tr>';
  }

  let paymentRows = '';
  const payments = livePayments();
  for (let i = 0; i < payments.length; i++) {
    const p = payments[i];
    if (!p || !p.allocations) continue;
    let matched = 0;
    for (let j = 0; j < p.allocations.length; j++) {
      if (p.allocations[j] && p.allocations[j].invoiceId === inv.id) matched += num(p.allocations[j].amount);
    }
    if (matched <= 0) continue;
    paymentRows += '<tr><td>' + fmtDate(p.date) + '</td>' +
      '<td>' + escapeHtml(p.method) + ' ' + escapeHtml(p.reference || '') + '</td>' +
      '<td style="text-align:right;">' + fmtKES(matched, p.currency) + '</td></tr>';
  }

  const logo = (D.getLogoImg && D.getLogoImg('max-height:64px;')) || '';

  const content = $('invoiceViewContent');
  if (!content) return;

  content.innerHTML =
    '<div class="report-canvas">' +

      '<div style="text-align:center;margin-bottom:20px;">' +
        logo +
        '<div style="font-size:1.1rem;font-weight:800;letter-spacing:1px;color:#0a0a0f;margin-top:8px;">VIORA INTERCOLLECTIVE</div>' +
        '<div style="font-size:.72rem;color:#64748b;margin-top:2px;">' +
          escapeHtml(D.SENDER_PHONE || '') + ' · ' + escapeHtml(D.SENDER_EMAIL || '') +
        '</div>' +
      '</div>' +

      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap;border-bottom:2px solid #0a0a0f;padding-bottom:16px;margin-bottom:18px;">' +

        '<div style="flex:1 1 260px;min-width:0;font-size:.85rem;line-height:1.55;">' +
          '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:700;margin-bottom:4px;">Bill To</div>' +
          '<div style="font-size:1rem;font-weight:700;color:#0a0a0f;">' + escapeHtml(cn) + '</div>' +
          (client && client.company ? '<div>' + escapeHtml(client.company) + '</div>' : '') +
          (client && client.address ? '<div>' + escapeHtml(client.address) + '</div>' : '') +
          (client && client.city    ? '<div>' + escapeHtml(client.city) + '</div>' : '') +
          (client && client.phone   ? '<div>' + escapeHtml(client.phone) + '</div>' : '') +
          (client && client.email   ? '<div>' + escapeHtml(client.email) + '</div>' : '') +
        '</div>' +

        '<div style="flex:0 0 auto;text-align:right;">' +
          '<div style="font-size:1.25rem;font-weight:800;letter-spacing:.5px;color:#0a0a0f;">INVOICE</div>' +
          '<div style="font-size:.85rem;color:#475569;margin-top:2px;">' + escapeHtml(inv.number) + '</div>' +
          '<div style="font-size:.72rem;color:#64748b;margin-top:6px;line-height:1.55;">' +
            'Date: <strong style="color:#0a0a0f;">' + fmtDate(inv.date) + '</strong><br>' +
            'Due: <strong style="color:#0a0a0f;">' + fmtDate(inv.dueDate) + '</strong>' +
          '</div>' +
          '<div style="margin-top:8px;">' +
            '<span class="badge badge-' + st + '">' + st.toUpperCase() + '</span>' +
            (inv.mpesaRef ? ' <span class="mpesa-tag">M-Pesa ' + escapeHtml(inv.mpesaRef) + '</span>' : '') +
          '</div>' +
        '</div>' +

      '</div>' +

      '<table style="width:100%;border-collapse:collapse;font-size:.85rem;">' +
        '<thead><tr style="background:var(--bg-table-alt);">' +
          '<th style="text-align:left;padding:8px;">Description</th>' +
          '<th style="text-align:left;padding:8px;">Hours</th>' +
          '<th style="text-align:left;padding:8px;">Rate</th>' +
          '<th style="text-align:right;padding:8px;">Amount</th>' +
        '</tr></thead>' +
        '<tbody>' + itemsRows + chargeRows + '</tbody>' +
      '</table>' +
      '<div style="margin-top:12px;text-align:right;font-size:.85rem;border-top:2px solid var(--border-color);padding-top:10px;">' +
        '<div style="display:flex;justify-content:flex-end;gap:30px;padding:3px 0;"><span>Subtotal</span><span>' + fmtKES(subtotal, inv.currency) + '</span></div>' +
        '<div style="display:flex;justify-content:flex-end;gap:30px;padding:6px 0;font-weight:700;font-size:1.05rem;"><span>Total</span><span class="total-amount">' + fmtKES(total, inv.currency) + '</span></div>' +
        '<div style="display:flex;justify-content:flex-end;gap:30px;padding:3px 0;"><span>Paid</span><span class="paid-amount">' + fmtKES(paidAmt, inv.currency) + '</span></div>' +
        '<div style="display:flex;justify-content:flex-end;gap:30px;padding:3px 0;font-weight:700;"><span>Balance</span><span class="' + (balance > 0 ? 'balance-due' : 'paid-amount') + '">' + fmtKES(balance, inv.currency) + '</span></div>' +
      '</div>' +
      (paymentRows
        ? '<h4 style="margin-top:16px;font-size:.78rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;">Payment History</h4>' +
          '<table style="width:100%;border-collapse:collapse;font-size:.82rem;margin-top:6px;">' +
            '<thead><tr><th style="text-align:left;padding:6px;">Date</th><th style="text-align:left;padding:6px;">Method</th><th style="text-align:right;padding:6px;">Amount</th></tr></thead>' +
            '<tbody>' + paymentRows + '</tbody>' +
          '</table>'
        : '') +
      (inv.notes
        ? '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-color);font-size:.8rem;color:var(--text-secondary);">📝 ' + escapeHtml(inv.notes) + '</div>'
        : '') +
      '<div style="margin-top:12px;text-align:center;font-size:.7rem;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px;">' +
        '📞 ' + escapeHtml(D.SENDER_PHONE || '') + ' &nbsp;·&nbsp; 📧 ' + escapeHtml(D.SENDER_EMAIL || '') + '<br>' +
        'Thank you for choosing VIORA.' +
      '</div>' +
    '</div>';

  if (typeof D.openModal === 'function') D.openModal('invoiceViewModal');
}

export async function deleteInvoice(id) {
  const i = liveInvoices().find(x => x && x.id === id);
  if (!i) return;

  const msg =
    `Permanently delete invoice ${i.number}?\n\n` +
    `This will:\n• Remove the invoice record\n• Remove any payment allocations that referenced it\n` +
    `• NOT delete payments themselves (use Payments tab for that)\n\nThis cannot be undone.`;

  if (typeof window.vioraConfirm === 'function') {
    const ok = await window.vioraConfirm(msg, {
      title: 'Delete invoice', confirmLabel: 'Delete', cancelLabel: 'Cancel',
      icon: 'fa-trash', confirmClass: 'btn-danger',
    });
    if (!ok) return;
  } else if (!confirm(msg)) {
    return;
  }

  try {
    if (typeof D.deleteDoc === 'function') {
      await D.deleteDoc('invoices', id);
    } else if (D.remove && D.ref && D.db && D.P) {
      await D.remove(D.ref(D.db, `${D.P('invoices')}/${id}`));
    }

    const data = S() && S().data;
    if (data && Array.isArray(data.invoices)) {
      data.invoices = data.invoices.filter(x => x.id !== id);
    }

    const affectedPayments = livePayments().filter(p =>
      p && p.allocations && p.allocations.some(a => a.invoiceId === id)
    );

    for (const p of affectedPayments) {
      p.allocations = p.allocations.filter(a => a.invoiceId !== id);
      try { await D.upsertDoc('payments', p, p._rev); } catch (e) {}
    }

    const affectedTx = dataArr('mpesaTransactions').filter(t => t && t.matchedInvoiceId === id);
    for (const t of affectedTx) {
      t.matchedInvoiceId = null;
      t.matchedAt = null;
      delete t.matchMode;
      try { await D.upsertDoc('mpesaTransactions', t, t._rev); } catch (e) {}
    }

    const affectedClientIds = new Set();
    for (const p of affectedPayments) if (p.clientId) affectedClientIds.add(p.clientId);
    if (i.clientId) affectedClientIds.add(i.clientId);

    if (typeof D.recomputeClientRollup === 'function') {
      for (const cid of affectedClientIds) {
        try { await D.recomputeClientRollup(cid); } catch (e) {}
      }
    }

    invalidateInvoicePaidMemo();
    await logActivity('delete', 'Invoice permanently deleted', i.number);
    toast(`Invoice ${i.number} permanently deleted.`, 'success');
    if (typeof D.renderActiveTab === 'function') D.renderActiveTab();
  } catch (e) {
    console.error('[finance] hard delete failed:', e);
    toast('Delete failed: ' + (e.message || 'unknown error'), 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   STK PUSH
   ═══════════════════════════════════════════════════════════════ */
export function openStkModal(invoiceId) {
  const inv = liveInvoices().find(x => x && x.id === invoiceId);
  if (!inv) return;

  const client = D.getClient ? D.getClient(inv.clientId) : null;
  const total = getInvoiceTotals(inv).total;
  const paid = getInvoicePaidAmount(inv.id);
  const balance = total - paid;

  const infoEl = $('stkInfo');
  if (infoEl) {
    infoEl.innerHTML =
      '<strong>' + escapeHtml(inv.number) + '</strong><br>' +
      escapeHtml((client && client.name) || '') + '<br>' +
      'Balance: <strong>' + fmtKES(balance, inv.currency) + '</strong>';
  }
  const phoneEl = $('stkPhone');
  if (phoneEl) phoneEl.value = (client && client.phone) || '';
  const amtEl = $('stkAmount');
  if (amtEl) amtEl.value = Math.round(balance);
  const resEl = $('stkResult');
  if (resEl) resEl.innerHTML = '';

  const s = S();
  if (s) s.pendingStkInvoiceId = invoiceId;
  if (typeof D.openModal === 'function') D.openModal('stkPushModal');
}

export async function sendStkPush() {
  const s = S();
  const invoiceId = s && s.pendingStkInvoiceId;
  const inv = liveInvoices().find(x => x && x.id === invoiceId);
  if (!inv) { toast('Invoice not found.', 'error'); return; }

  const phoneEl = $('stkPhone');
  const amtEl = $('stkAmount');
  const btn = $('sendStkBtn');

  const rawPhone = phoneEl ? phoneEl.value : '';
  const phone = normalizePhone(rawPhone);
  const amount = amtEl ? num(amtEl.value) : 0;
  if (!phone || phone.length < 9) { toast('Enter a valid phone number.', 'error'); return; }
  if (amount <= 0) { toast('Enter a valid amount.', 'error'); return; }

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…'; }

  try {
    const res = await D.callFn('mpesa/stkpush', {
      phone, amount, invoiceId,
      accountReference: inv.number,
      description: `Payment for ${inv.number}`,
    });
    const resEl = $('stkResult');
    if (resEl) {
      resEl.innerHTML =
        '<div style="padding:12px;background:rgba(34,230,160,.1);border-left:4px solid var(--accent-green);border-radius:8px;">' +
          '<strong>✓ Sent</strong><br>' +
          escapeHtml((res && res.customerMessage) || 'Check phone to complete.') + '<br>' +
          '<small>Ref: ' + escapeHtml((res && res.checkoutRequestId) || '') + '</small>' +
        '</div>';
    }
    await logActivity('send', 'STK Push sent', `${fmtKES(amount)} to ${phone} for ${inv.number}`);
    toast('STK Push sent.', 'success');
  } catch (e) {
    const resEl = $('stkResult');
    if (resEl) {
      resEl.innerHTML =
        '<div style="padding:12px;background:rgba(255,92,124,.1);border-left:4px solid var(--accent-red);border-radius:8px;">' +
          '<strong>Failed</strong><br>' + escapeHtml(e.message) +
        '</div>';
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Push'; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   M-PESA — MATCHING + RECONCILIATION
   ═══════════════════════════════════════════════════════════════ */
export function openMpesaModal() {
  processMpesaQueue().catch(e => console.warn('[finance] mpesa queue failed', e));
  renderMpesaModal();
  if (typeof D.openModal === 'function') D.openModal('mpesaModal');
}

export function findInvoiceCandidates(tx) {
  if (!tx) return [];
  const amt = num(tx.amount);
  const s = S();
  const windowDays = num(s && s.data && s.data.mpesaSettings && s.data.mpesaSettings.autoMatchWindowDays) || 14;
  const cutoff = Date.now() - windowDays * 86400000;
  const phone = normalizePhone(tx.phone || '');
  const invoices = liveInvoices();

  const out = [];
  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    if (!inv) continue;
    if (getInvoiceStatusDerived(inv) === 'paid') continue;
    const total = getInvoiceTotals(inv).total;
    const outstanding = total - getInvoicePaidAmount(inv.id);
    const client = D.getClient ? D.getClient(inv.clientId) : null;
    const clientPhone = normalizePhone((client && client.phone) || '');
    const phoneMatch = clientPhone && clientPhone === phone;
    const amountMatch = Math.abs(outstanding - amt) < 1;
    let score = 0;
    if (phoneMatch) score += 50;
    if (amountMatch) score += 40;
    if (inv.dueDate) {
      const dueTs = Date.parse(inv.dueDate);
      if (Number.isFinite(dueTs) && dueTs >= cutoff) score += 10;
    }
    if (score >= 40) out.push({ invoice: inv, score, total, outstanding });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

export async function autoMatchMpesa(tx) {
  if (!tx || tx.matchedInvoiceId) return;
  const candidates = findInvoiceCandidates(tx);
  if (!candidates.length) return;
  if (candidates[0].score >= 90) {
    await applyMpesaMatch(tx, candidates[0].invoice, true);
  }
}

export async function applyMpesaMatch(tx, invoice, auto = false) {
  if (!tx || !invoice) return;

  tx.matchedInvoiceId = invoice.id;
  tx.matchedAt = new Date().toISOString();
  tx.matchMode = auto ? 'auto' : 'manual';
  await D.upsertDoc('mpesaTransactions', tx, tx._rev);

  const txAmount = num(tx.amount);
  const total = getInvoiceTotals(invoice).total;
  const paidAlready = getInvoicePaidAmount(invoice.id);
  const outstanding = Math.max(0, total - paidAlready);
  const appliedAmount = Math.min(txAmount, outstanding);

  const payment = {
    id: uid(),
    clientId: invoice.clientId,
    projectId: invoice.projectId || null,
    date: todayStr(),
    amount: appliedAmount,
    currency: 'KES',
    method: 'M-PESA',
    reference: tx.receipt || tx.transactionId || '',
    notes: `Auto-reconciled from M-Pesa ${tx.receipt || ''}`,
    allocations: [{ invoiceId: invoice.id, amount: appliedAmount }],
    createdAt: new Date().toISOString(),
    createdBy: 'mpesa-auto',
  };

  await D.upsertDoc('payments', payment);
  invalidateInvoicePaidMemo();

  const surplus = txAmount - appliedAmount;
  if (surplus > 0.01) {
    const client = D.getClient ? D.getClient(invoice.clientId) : null;
    if (client) {
      client._creditBalance = num(client._creditBalance) + surplus;
      try { await D.upsertDoc('entities', client, client._rev); } catch (e) {}
    }
  }

  try { await reconcilePayment(invoice); } catch (e) {
    console.warn('[finance] reconcilePayment failed', e);
  }

  if (invoice.projectId && typeof D.recomputeProjectProgress === 'function') {
    try { await D.recomputeProjectProgress(invoice.projectId); } catch (e) {}
  }

  const ledgerLines = [
    { account: '1010 Cash', debit: appliedAmount, credit: 0 },
    { account: '1100 Accounts Receivable', debit: 0, credit: appliedAmount },
  ];
  try {
    await D.callFn('ledger/post', {
      date: todayStr(),
      memo: `M-Pesa ${tx.receipt || ''} → ${invoice.number}`,
      refType: 'mpesa', refId: tx.id,
      lines: ledgerLines,
    });
  } catch (e) {
    try {
      await D.queueOfflineMutation('ledger', 'upsert', {
        id: uid(), date: todayStr(),
        memo: `[PENDING] M-Pesa ${tx.receipt || ''} → ${invoice.number}`,
        refType: 'mpesa', refId: tx.id, lines: ledgerLines,
      }, null);
    } catch (e2) {}
  }

  const paidNow = getInvoicePaidAmount(invoice.id);
  if (paidNow >= total - 0.01) {
    try { await onInvoicePaid(invoice); } catch (e) {}
  }

  const mpesaClient = D.getClient ? D.getClient(invoice.clientId) : null;
  if (mpesaClient) {
    mpesaClient._lastActivityAt = new Date().toISOString();
    try { await D.upsertDoc('entities', mpesaClient, mpesaClient._rev); } catch (e) {}
    if (typeof D.recomputeClientRollup === 'function') {
      try { await D.recomputeClientRollup(mpesaClient.id); } catch (e) {}
    }
  }

  await logActivity('pay', 'M-Pesa reconciled', `Ref ${tx.receipt || tx.transactionId} → ${invoice.number}`);
}

export async function processMpesaQueue() {
  const list = dataArr('mpesaTransactions');
  for (let i = 0; i < list.length; i++) {
    const tx = list[i];
    if (tx && !tx.matchedInvoiceId && (tx.status === 'received' || tx.status === 'completed')) {
      await autoMatchMpesa(tx);
    }
  }
}

export function renderMpesaModal() {
  const list = dataArr('mpesaTransactions');
  const invoices = liveInvoices();

  let matchedCount = 0;
  let matchedValue = 0;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t && t.matchedInvoiceId) {
      matchedCount++;
      matchedValue += num(t.amount);
    }
  }

  const el = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  el('mpesaTotal', list.length);
  el('mpesaMatched', matchedCount);
  el('mpesaUnmatched', list.length - matchedCount);
  el('mpesaValue', fmtKES(matchedValue));

  const searchEl = $('mpesaSearch');
  const q = searchEl ? searchEl.value.toLowerCase().trim() : '';
  const filtered = [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (!t) continue;
    if (q) {
      const inRef = (t.receipt || '').toLowerCase().includes(q);
      const inPhone = (t.phone || '').includes(q);
      const inName = (t.clientName || '').toLowerCase().includes(q);
      if (!inRef && !inPhone && !inName) continue;
    }
    filtered.push(t);
  }

  const host = $('mpesaList');
  if (!host) return;
  if (!filtered.length) {
    host.innerHTML = '<div class="empty-state">No M-Pesa transactions.</div>';
    return;
  }

  let html = '';
  for (let i = 0; i < filtered.length; i++) {
    const t = filtered[i];
    const inv = t.matchedInvoiceId ? invoices.find(x => x.id === t.matchedInvoiceId) : null;
    const cls = inv ? 'matched' : 'unmatched';
    html +=
      '<div class="tx-row ' + cls + '">' +
        '<span class="tx-ref">' + escapeHtml(t.receipt || t.transactionId || t.id || '—') + '</span>' +
        '<span>' + escapeHtml(t.clientName || t.phone || '—') + '</span>' +
        '<span><strong>' + fmtKES(t.amount) + '</strong></span>' +
        '<span>' + (t.transactionTime ? new Date(t.transactionTime).toLocaleString() : '—') + '</span>' +
        '<span style="text-align:right;">' +
          (inv
            ? '<span class="badge badge-paid">' + escapeHtml(inv.number) + '</span>'
            : '<button class="btn btn-success btn-xs" data-match-tx="' + escapeHtml(t.id) + '"><i class="fa-solid fa-link"></i> Match</button>') +
        '</span>' +
      '</div>';
  }
  host.innerHTML = html;

  if (!host._wired) {
    host._wired = true;
    host.addEventListener('click', (ev) => {
      const btn = ev.target.closest && ev.target.closest('[data-match-tx]');
      if (!btn) return;
      openManualMpesaMatch(btn.getAttribute('data-match-tx'));
    });
  }
}

export function openManualMpesaMatch(txId) {
  const tx = dataArr('mpesaTransactions').find(t => t && t.id === txId);
  if (!tx) return;

  const candidates = findInvoiceCandidates(tx);
  const infoEl = $('mpesaMatchTxInfo');
  if (infoEl) {
    infoEl.innerHTML = '<strong>' + escapeHtml(tx.receipt || tx.transactionId || '') + '</strong> · ' +
      fmtKES(tx.amount) + ' · ' + escapeHtml(tx.phone || '');
  }

  const sel = $('mpesaMatchInvoice');
  if (sel) {
    let opts = '';
    if (!candidates.length) {
      const allOpen = liveInvoices().filter(inv => getInvoiceStatusDerived(inv) !== 'paid');
      if (allOpen.length) {
        for (const inv of allOpen) {
          opts += '<option value="' + escapeHtml(inv.id) + '">' + escapeHtml(inv.number) + ' · ' +
            escapeHtml((D.getClientName && D.getClientName(inv.clientId)) || '') + ' · ' +
            fmtKES(getInvoiceTotals(inv).total) + '</option>';
        }
      } else {
        opts = '<option value="">— No open invoices —</option>';
      }
    } else {
      for (const c of candidates) {
        opts += '<option value="' + escapeHtml(c.invoice.id) + '">' + escapeHtml(c.invoice.number) + ' · ' +
          escapeHtml((D.getClientName && D.getClientName(c.invoice.clientId)) || '') + ' · ' +
          fmtKES(c.total) + ' (score ' + c.score + ')</option>';
      }
    }
    sel.innerHTML = opts;
  }

  const s = S();
  if (s) s.pendingMpesaTx = txId;
  if (typeof D.openModal === 'function') D.openModal('mpesaMatchModal');
}

export async function confirmMpesaMatch() {
  const s = S();
  const txId = s && s.pendingMpesaTx;
  const sel = $('mpesaMatchInvoice');
  const invId = sel ? sel.value : '';
  if (!txId || !invId) { toast('Select an invoice.', 'error'); return; }

  const tx = dataArr('mpesaTransactions').find(t => t && t.id === txId);
  const inv = liveInvoices().find(i => i && i.id === invId);
  if (!tx || !inv) return;

  try {
    await applyMpesaMatch(tx, inv, false);
    renderMpesaModal();
    renderMpesaInline();
    if (typeof D.renderActiveTab === 'function') D.renderActiveTab();
    toast('Matched.', 'success');
    if (typeof D.closeModal === 'function') D.closeModal('mpesaMatchModal');
  } catch (e) {
    console.warn('[finance] match failed', e);
    toast('Match failed: ' + (e.message || 'unknown'), 'error');
  }
}

export function renderMpesaInline() {
  try {
    const list = dataArr('mpesaTransactions');
    const invoices = liveInvoices();

    const decorated = new Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const ts = t && t.transactionTime ? Date.parse(t.transactionTime) : 0;
      decorated[i] = { t, ts: Number.isFinite(ts) ? ts : 0 };
    }
    decorated.sort((a, b) => b.ts - a.ts);
    const top = decorated.slice(0, 8);

    const host = $('mpesaInlineList');
    const stats = $('mpesaInlineStats');
    if (!host || !stats) return;

    let matched = 0;
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].matchedInvoiceId) matched++;

    stats.innerHTML =
      '<div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));">' +
        '<div class="stat-card"><div class="label">Queue</div><div class="number">' + list.length + '</div></div>' +
        '<div class="stat-card"><div class="label">Matched</div><div class="number">' + matched + '</div></div>' +
        '<div class="stat-card"><div class="label">Unmatched</div><div class="number">' + (list.length - matched) + '</div></div>' +
      '</div>';

    if (!top.length) {
      host.innerHTML = '<div class="empty-state">No transactions yet.</div>';
      return;
    }

    let html = '';
    for (let i = 0; i < top.length; i++) {
      const t = top[i].t;
      const inv = t.matchedInvoiceId ? invoices.find(x => x.id === t.matchedInvoiceId) : null;
      const st = t.status || (inv ? 'matched' : 'unmatched');
      html +=
        '<div class="tx-row ' + (inv ? 'matched' : 'unmatched') + '">' +
          '<span class="tx-ref">' + escapeHtml(t.receipt || t.transactionId || t.id || '') + '</span>' +
          '<span>' + escapeHtml(t.clientName || t.phone || '') + '</span>' +
          '<span><strong>' + fmtKES(t.amount) + '</strong></span>' +
          '<span>' + (t.transactionTime ? new Date(t.transactionTime).toLocaleString() : '') + '</span>' +
          '<span style="text-align:right;">' +
            (inv
              ? '<span class="badge badge-paid">' + escapeHtml(inv.number) + '</span>'
              : '<span class="badge badge-pending">' + escapeHtml(st) + '</span>') +
          '</span>' +
        '</div>';
    }
    host.innerHTML = html;
  } catch (e) {
    console.warn('[finance] renderMpesaInline failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   SERVICE AGREEMENT
   ═══════════════════════════════════════════════════════════════ */
export function openServiceAgreementModal(projectId) {
  const p = D.getProject ? D.getProject(projectId) : null;
  if (!p) { toast('Project not found.', 'error'); return; }

  const c = D.getClient ? D.getClient(p.clientId) : null;
  const cn = $('saClientName');
  if (cn) cn.value = c ? `${c.name} (${c.clientId || ''})` : '—';
  const pn = $('saProjectName');
  if (pn) pn.value = `${p.projectNumber} — ${p.title}`;
  const prev = $('saPreview'); if (prev) prev.innerHTML = '';
  const file = $('saFileInput'); if (file) file.value = '';

  const s = S();
  if (s) s.pendingSA = { projectId };
  if (typeof D.openModal === 'function') D.openModal('serviceAgreementModal');
}

export async function attachServiceAgreement(file, projectId) {
  const p = D.getProject ? D.getProject(projectId) : null;
  if (!p) return;

  const MAX_BYTES = 700 * 1024;
  if (file.size > MAX_BYTES) {
    toast('File too large for inline storage (max ~700KB). Use Documents vault instead.', 'error');
    return;
  }

  const r = new FileReader();
  r.onerror = () => toast('Could not read file.', 'error');
  r.onload = async ev => {
    try {
      const doc = {
        id: uid(),
        title: `Service Agreement — ${p.projectNumber}`,
        system: 'Operations',
        category: 'Service Agreement',
        parentId: p.id,
        parentName: `${p.projectNumber} — ${p.title}`,
        fileName: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        data: ev.target.result,
        uploadedAt: new Date().toISOString(),
      };

        await D.upsertDoc('documents', doc);

      p.serviceAgreementDocId = doc.id;
      await D.upsertDoc('projects', p, p._rev);

      try {
        if (window.Viora && typeof window.Viora.mirrorDocToClient === 'function') {
          await window.Viora.mirrorDocToClient(doc, p.clientId);
        }
      } catch (_) {}

      await logActivity('upload', 'Service Agreement attached', `${p.projectNumber}`);
      toast('Stored in Vault.', 'success');

      if (typeof D.closeModal === 'function') D.closeModal('serviceAgreementModal');
      if (typeof D.renderActiveTab === 'function') D.renderActiveTab();
    } catch (e) {
      console.warn('[finance] service agreement upload failed', e);
      toast('Upload failed: ' + (e.message || 'unknown'), 'error');
    }
  };
  r.readAsDataURL(file);
}

/* ═══════════════════════════════════════════════════════════════
   CLIENT STATEMENT
   ═══════════════════════════════════════════════════════════════ */
export async function sendClientStatement(clientId) {
  const c = D.getClient ? D.getClient(clientId) : null;
  if (!c) { toast('Client not found.', 'error'); return; }

  const invs = D.getClientInvoices ? D.getClientInvoices(clientId) : [];
  const wallet = num(c._creditBalance);

  const lines = [
    '📄 *STATEMENT OF ACCOUNT*',
    '',
    'Client: ' + (c.name || ''),
    'Date: ' + fmtDate(todayStr()),
    '',
    'Agreed total: ' + fmtKES(D.getClientAgreedTotal ? D.getClientAgreedTotal(clientId) : 0),
    'Billed to date: ' + fmtKES(D.getClientBilledTotal ? D.getClientBilledTotal(clientId) : 0),
    'Paid to date: ' + fmtKES(D.getClientPaidTotal ? D.getClientPaidTotal(clientId) : 0),
  ];
  if (wallet > 0) lines.push('Wallet credit: ' + fmtKES(wallet));
  lines.push('', '— INVOICES —');

  if (!invs.length) {
    lines.push('No invoices yet.');
  } else {
    for (const inv of invs) {
      const total = getInvoiceTotals(inv).total;
      const paid = getInvoicePaidAmount(inv.id);
      const st = getInvoiceStatusDerived(inv);
      lines.push(`• ${inv.number} · ${fmtDate(inv.date)} · ${fmtKES(total)} · Paid ${fmtKES(paid)} · ${st.toUpperCase()}`);
    }
  }

  const activeInst = (c.installments || []).find(i => !i.paid && num(i.partialPaid) > 0);
  if (activeInst) {
    const remaining = Math.max(0, num(activeInst.amount) - num(activeInst.partialPaid));
    lines.push('', `⚠️ Current installment shortfall: ${fmtKES(remaining)} on "${activeInst.label || 'installment'}"`);
  }

  lines.push('', '— VIORA Intercollective', D.SENDER_PHONE || '');
  const body = lines.join('\n');

  let pdf = null;
  if (typeof D.buildClientStatementPdf === 'function') {
    try { pdf = await D.buildClientStatementPdf(clientId); }
    catch (e) { console.warn('[finance] statement PDF failed', e); }
  }

  const phone = c.phone || c.phoneAlt || '';
  const email = c.email || '';
  let waSent = false;
  let emSent = false;

  if (phone) {
    if (pdf) {
      try {
        await D.callFn('invoice/sendWhatsApp', {
          to: normalizePhone(phone), pdfBase64: pdf.base64, filename: pdf.filename,
          caption: `Statement of Account — ${c.name}`,
        });
        waSent = true;
        await logComm('wa', c.id, c.name, phone, '', body, { transport: 'worker-attachment', reason: 'client-statement' });
      } catch (e) {}
    }
    if (!waSent) {
      try {
        window.open('https://wa.me/' + normalizePhone(phone) + '?text=' + encodeURIComponent(body), '_blank', 'noopener,noreferrer');
      } catch (e) {}
      try {
        await logComm('wa', c.id, c.name, phone, '', body, { transport: 'wa.me-fallback', reason: 'client-statement' });
      } catch (e) {}
      waSent = true;
    }
  }

  if (email) {
    const subject = `Statement of Account — ${c.name}`;
    if (pdf) {
      try {
        await D.callFn('invoice/sendEmail', {
          to: email, subject,
          html: body.split('\n').map(l => `<p>${escapeHtml(l)}</p>`).join(''),
          pdfBase64: pdf.base64, filename: pdf.filename,
        });
        emSent = true;
        await logComm('em', c.id, c.name, email, subject, body, { transport: 'worker-attachment', reason: 'client-statement' });
      } catch (e) {}
    }
    if (!emSent) {
      const gmailUrl = 'https://mail.google.com/mail/?view=cm&fs=1' +
        '&to=' + encodeURIComponent(email) +
        '&su=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
      try {
        window.open(gmailUrl, 'viora_stmt_' + Date.now(),
          'noopener,noreferrer,width=760,height=800,left=620,top=60');
      } catch (e) {}
      try {
        await logComm('em', c.id, c.name, email, subject, body, { transport: 'gmail-compose-fallback', reason: 'client-statement' });
      } catch (e) {}
      emSent = true;
    }
  }

  if (!waSent && !emSent) {
    toast('No phone or email on file.', 'warning');
    return;
  }

  try {
    const live = D.getClient ? D.getClient(clientId) : null;
    if (live) {
      const hist = Array.isArray(live.statementHistory) ? live.statementHistory : [];
      hist.unshift({
        id: uid(),
        sentAt: new Date().toISOString(),
        channels: [waSent && 'wa', emSent && 'email'].filter(Boolean),
      });
      live.statementHistory = hist.slice(0, 20);
      await D.upsertDoc('entities', live, live._rev);
    }
  } catch (e) {}

  await logActivity('send', 'Statement of account sent',
    `${c.name}${waSent ? ' · WhatsApp' : ''}${emSent ? ' · Email' : ''}`);
  toast('Statement sent.', 'success');
}

/* ═══════════════════════════════════════════════════════════════
   PROJECT CREDIT TRANSFER
   ═══════════════════════════════════════════════════════════════ */
export async function transferProjectCredit({ fromProjectId, toProjectId, amount, note }) {
  if (!fromProjectId || !toProjectId) throw new Error('Both projects required');
  if (fromProjectId === toProjectId) throw new Error('Cannot transfer to the same project');

  const amt = num(amount);
  if (amt <= 0) throw new Error('Amount must be positive');

  const fromP = D.getProject ? D.getProject(fromProjectId) : null;
  const toP = D.getProject ? D.getProject(toProjectId) : null;
  if (!fromP || !toP) throw new Error('Project not found');
  if (fromP.clientId !== toP.clientId) throw new Error('Projects must belong to the same client');

  const available = num(D.getProjectOverpayment ? D.getProjectOverpayment(fromProjectId) : 0);
  if (amt > available + 0.01) {
    throw new Error(`Only ${fmtKES(available)} available on ${fromP.projectNumber}`);
  }

  const s = S();
  const operatorUid = (s && s.operator && s.operator.uid) || 'system';
  const now = new Date().toISOString();

  const fromPayment = {
    id: uid(), clientId: fromP.clientId, projectId: fromProjectId,
    date: todayStr(), amount: -amt, currency: 'KES',
    method: 'Credit Transfer',
    reference: `Transfer to ${toP.projectNumber || toP.title}`,
    notes: note || `Overpayment moved to ${toP.projectNumber || toP.title}`,
    allocations: [], createdAt: now, createdBy: operatorUid,
    _isCreditTransfer: true, _transferToProjectId: toProjectId,
  };

  const toPayment = {
    id: uid(), clientId: toP.clientId, projectId: toProjectId,
    date: todayStr(), amount: amt, currency: 'KES',
    method: 'Credit Transfer',
    reference: `From ${fromP.projectNumber || fromP.title}`,
    notes: note || `Overpayment received from ${fromP.projectNumber || fromP.title}`,
    allocations: [], createdAt: now, createdBy: operatorUid,
    _isCreditTransfer: true, _transferFromProjectId: fromProjectId,
  };

   await Promise.all([
    D.upsertDoc('payments', fromPayment, null, { skipLock: true }),
    D.upsertDoc('payments', toPayment,   null, { skipLock: true }),
  ]);
  invalidateInvoicePaidMemo();

    /* Fire-and-forget downstream work — do NOT block the UI.
     The caller's toast fires as soon as the two payments land. */
  (async () => {
    try {
      await logActivity('edit', 'Project credit transferred',
        `${fmtKES(amt)} from ${fromP.projectNumber || fromP.title} → ${toP.projectNumber || toP.title}`);
    } catch (_) {}
    if (typeof D.recomputeProjectProgress === 'function') {
      try { await D.recomputeProjectProgress(fromProjectId); } catch (_) {}
      try { await D.recomputeProjectProgress(toProjectId); } catch (_) {}
    }
    if (typeof D.recomputeClientRollup === 'function') {
      try { await D.recomputeClientRollup(fromP.clientId); } catch (_) {}
    }
  })();

  return { fromPayment, toPayment };
}

/* ═══════════════════════════════════════════════════════════════
   FEES MODAL + CREDIT TRANSFER MODAL
   ═══════════════════════════════════════════════════════════════ */
export function openFeesModal(cid) {
  const client = D.getClient ? D.getClient(cid) : null;
  if (!client) return;

  const projects = (D.getClientProjects ? D.getClientProjects(cid) : [])
    .filter(p => p.status !== 'cancelled');
  const agreedTotal = num(D.getClientAgreedTotal ? D.getClientAgreedTotal(cid) : 0);
  const paidTotal   = num(D.getClientPaidTotal ? D.getClientPaidTotal(cid) : 0);
  const balance     = Math.max(0, agreedTotal - paidTotal);
  const pct         = agreedTotal > 0 ? Math.min(100, Math.round((paidTotal / agreedTotal) * 100)) : 0;

  let totalCredit = 0;
  for (const p of projects) totalCredit += num(D.getProjectOverpayment ? D.getProjectOverpayment(p.id) : 0);

  const titleEl = $('feesModalTitle');
  if (titleEl) titleEl.textContent = `${client.name} — Fees`;

  let projectRows = '';
  if (!projects.length) {
    projectRows = '<div class="empty-state" style="padding:20px;">No projects yet. Add a project to track fees.</div>';
  } else {
    for (const p of projects) {
      const pa = num(D.getProjectAgreedTotal ? D.getProjectAgreedTotal(p.id) : 0);
      const pp = num(D.getProjectPaidTotal ? D.getProjectPaidTotal(p.id) : 0);
      const pbal = Math.max(0, pa - pp);
      const ppct = pa > 0 ? Math.min(100, Math.round((pp / pa) * 100)) : 0;
      const over = num(D.getProjectOverpayment ? D.getProjectOverpayment(p.id) : 0);
      const cls = ppct >= 100 ? 'green' : ppct >= 50 ? '' : 'gold';
      const balanceLine = over > 0
        ? '<div style="font-size:.72rem;color:var(--accent-green);font-weight:700;">+ ' + fmtKES(over) + ' credit</div>'
        : '<div style="font-size:.72rem;color:' + (pbal > 0 ? 'var(--accent-gold)' : 'var(--accent-green)') + ';">Balance ' + fmtKES(pbal) + '</div>';
      const transferBtn = over > 0
        ? '<button class="btn btn-gold btn-xs" data-open-credit-transfer="' + escapeHtml(cid) + '" data-from-project="' + escapeHtml(p.id) + '" style="margin-left:6px;" title="Move overpayment to another project"><i class="fa-solid fa-right-left"></i> Transfer credit</button>'
        : '';
      projectRows +=
        '<div class="installment-row" style="align-items:center;">' +
          '<div class="inst-info" style="flex:1;min-width:0;">' +
            '<strong>' + escapeHtml(p.projectNumber || '—') + '</strong>' +
            '<div style="font-size:.72rem;color:var(--text-secondary);">' + escapeHtml(p.title || '') + '</div>' +
            '<div class="progress-3d" style="margin-top:6px;height:5px;"><div class="progress-3d-bar ' + cls + '" style="width:' + ppct + '%;"></div></div>' +
          '</div>' +
          '<div style="text-align:right;white-space:nowrap;">' +
            '<div>' + fmtKES(pp) + ' / ' + fmtKES(pa) + '</div>' + balanceLine +
          '</div>' +
          '<button class="btn btn-success btn-xs" data-open-pay-chain="' + escapeHtml(cid) + '" style="margin-left:8px;"><i class="fa-solid fa-money-bill-wave"></i> Pay</button>' +
          transferBtn +
        '</div>';
    }
  }

  const creditBanner = totalCredit > 0
    ? '<div style="padding:12px;border:1px solid var(--accent-green);border-radius:12px;background:rgba(34,230,160,.08);margin-top:12px;">' +
        '<div style="font-weight:700;color:var(--accent-green);font-size:.85rem;"><i class="fa-solid fa-coins"></i> Total credit available: ' + fmtKES(totalCredit) + '</div>' +
        '<div style="font-size:.72rem;color:var(--text-secondary);margin-top:4px;">This client has overpaid ' + fmtKES(totalCredit) + ' across their projects. Use <strong>Transfer credit</strong> on any overpaid project to move it to another project.</div>' +
      '</div>'
    : '';

  const content = $('feesModalContent');
  if (!content) return;

  content.innerHTML =
    '<div style="padding:14px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-input);margin-bottom:12px;">' +
      '<div class="progress-3d"><div class="progress-3d-bar" style="width:' + pct + '%;"></div></div>' +
      '<div class="progress-3d-label"><span>Paid: ' + fmtKES(paidTotal) + ' of ' + fmtKES(agreedTotal) + '</span><span>Balance: ' + fmtKES(balance) + '</span></div>' +
    '</div>' +
    '<h4 style="font-size:.82rem;text-transform:uppercase;color:var(--text-secondary);margin:12px 0 8px;">📁 Project breakdown (' + projects.length + ')</h4>' +
    '<div class="installment-list">' + projectRows + '</div>' +
    creditBanner;

  if (!content._wired) {
    content._wired = true;
    content.addEventListener('click', (ev) => {
      const t = ev.target.closest && ev.target.closest('[data-open-pay-chain], [data-open-credit-transfer]');
      if (!t) return;
      if (t.hasAttribute('data-open-pay-chain')) {
        const cid2 = t.getAttribute('data-open-pay-chain');
        if (typeof D.closeModal === 'function') D.closeModal('feesModal');
        openPayChain(cid2);
      } else {
        openCreditTransfer(t.getAttribute('data-open-credit-transfer'), t.getAttribute('data-from-project'));
      }
    });
  }

  if (typeof D.openModal === 'function') D.openModal('feesModal');
}

export function openCreditTransfer(clientId, fromProjectId) {
  const client = D.getClient ? D.getClient(clientId) : null;
  const fromP = D.getProject ? D.getProject(fromProjectId) : null;
  if (!client || !fromP) { toast('Project not found.', 'error'); return; }

  const available = num(D.getProjectOverpayment ? D.getProjectOverpayment(fromProjectId) : 0);
  if (available <= 0) { toast('This project has no overpayment to transfer.', 'info'); return; }

  const targets = dataArr('projects')
    .filter(p => p && p.clientId === clientId && p.id !== fromProjectId && p.status !== 'cancelled');
  if (!targets.length) { toast('No other projects to transfer to.', 'warning'); return; }

  let modal = document.getElementById('creditTransferModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'creditTransferModal';
    modal.innerHTML =
      '<div class="modal" style="max-width:520px;">' +
        '<h2><span class="modal-icon" style="background:var(--accent-gold);"><i class="fa-solid fa-right-left"></i></span> Transfer credit</h2>' +
        '<div id="ctBody"></div>' +
        '<div class="form-actions" style="margin-top:18px;">' +
          '<button type="button" class="btn btn-outline" data-ct="cancel">Cancel</button>' +
          '<button type="button" class="btn btn-gold" data-ct="confirm"><i class="fa-solid fa-right-left"></i> Transfer</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', async (ev) => {
      if (ev.target === modal) { modal.classList.remove('active'); return; }
      const btn = ev.target.closest && ev.target.closest('[data-ct]');
      if (!btn) return;
      const act = btn.getAttribute('data-ct');
      if (act === 'cancel') { modal.classList.remove('active'); return; }
      if (act !== 'confirm') return;
      await _doCreditTransfer(modal, clientId);
    });
  }

  let opts = '';
  for (const p of targets) {
    const agreed = num(D.getProjectAgreedTotal ? D.getProjectAgreedTotal(p.id) : 0);
    const paid = num(D.getProjectPaidTotal ? D.getProjectPaidTotal(p.id) : 0);
    const bal = Math.max(0, agreed - paid);
    opts += '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.projectNumber || p.title) + ' — Balance ' + fmtKES(bal) + '</option>';
  }

  modal.dataset.clientId = clientId;
  modal.dataset.fromProjectId = fromProjectId;
  modal.querySelector('#ctBody').innerHTML =
    '<div style="padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-input);margin-bottom:14px;">' +
      '<div style="font-size:.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">From</div>' +
      '<strong>' + escapeHtml(fromP.projectNumber || '—') + '</strong>' +
      '<div style="font-size:.78rem;color:var(--text-secondary);">' + escapeHtml(fromP.title || '') + '</div>' +
      '<div style="margin-top:6px;color:var(--accent-green);font-weight:700;">Overpayment available: ' + fmtKES(available) + '</div>' +
    '</div>' +
    '<label>Move credit to *</label>' +
    '<select id="ctTargetProject">' + opts + '</select>' +
    '<label style="margin-top:12px;">Amount (KES) *</label>' +
    '<input type="number" id="ctAmount" min="1" max="' + available + '" step="1" value="' + available + '" />' +
    '<label style="margin-top:12px;">Note (optional)</label>' +
    '<input id="ctNote" placeholder="e.g. Applied to next phase" />';

  modal.classList.add('active');
}

async function _doCreditTransfer(modal, clientId) {
  const fromProjectId = modal.dataset.fromProjectId;
  const targetEl = modal.querySelector('#ctTargetProject');
  const amountEl = modal.querySelector('#ctAmount');
  const noteEl = modal.querySelector('#ctNote');
  const toProjectId = targetEl ? targetEl.value : '';
  const amount = amountEl ? num(amountEl.value) : 0;
  const note = noteEl ? noteEl.value.trim() : '';
  const available = num(D.getProjectOverpayment ? D.getProjectOverpayment(fromProjectId) : 0);

  if (!toProjectId) { toast('Pick a target project.', 'error'); return; }
  if (amount <= 0) { toast('Amount must be positive.', 'error'); return; }
  if (amount > available + 0.01) { toast('Only ' + fmtKES(available) + ' available.', 'error'); return; }

  const confirmBtn = modal.querySelector('[data-ct="confirm"]');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Transferring…'; }

  /* Watchdog: tell the user what's happening if it takes >8s */
  const slowTimer = setTimeout(() => {
    if (confirmBtn && confirmBtn.disabled) {
      confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Still working (slow network)…';
    }
  }, 8000);

  try {
    await transferProjectCredit({ fromProjectId, toProjectId, amount, note });
    clearTimeout(slowTimer);
    toast('Transferred ' + fmtKES(amount) + '.', 'success');
    modal.classList.remove('active');
    if (typeof D.closeModal === 'function') D.closeModal('feesModal');
    if (typeof D.renderActiveTab === 'function') D.renderActiveTab();
    setTimeout(() => openFeesModal(clientId), 300);
  } catch (e) {
    clearTimeout(slowTimer);
    toast('Transfer failed: ' + e.message, 'error');
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = '<i class="fa-solid fa-right-left"></i> Transfer'; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   BULK REMINDERS
   ═══════════════════════════════════════════════════════════════ */
export async function bulkRemind() {
  if (_bulkRemindInFlight) { toast('Reminders already sending…', 'warning'); return; }
  _bulkRemindInFlight = true;

  try {
    const overdueInst = (typeof D.getOverdueInstallments === 'function')
      ? (D.getOverdueInstallments() || [])
      : [];
    if (!overdueInst.length) { toast('No overdue installments.', 'info'); return; }

    const ok = (typeof window.vioraConfirm === 'function')
      ? await window.vioraConfirm(`Send WhatsApp reminders to ${overdueInst.length} client(s)?`, {
          title: 'Send reminders', confirmLabel: 'Send', cancelLabel: 'Cancel',
          icon: 'fa-paper-plane', confirmClass: 'btn-primary',
        })
      : confirm(`Send WhatsApp reminders to ${overdueInst.length} client(s)?`);
    if (!ok) return;

    let count = 0;
    let fallbackOpened = 0;

    for (const i of overdueInst) {
      const c = D.getClient ? D.getClient(i.clientId) : null;
      if (!c || !c.phone) continue;

      const msg =
        `Hello ${String(c.name || '').split(' ')[0]}, friendly reminder that your installment of ` +
        `${fmtKES(i.amount)} (${i.inst.label}) was due on ${fmtDate(i.dueDate)} and is now overdue.\n\n` +
        `— VIORA Intercollective\n${D.SENDER_PHONE || ''}`;

      try {
        await D.callFn('invoice/sendWhatsApp', { to: normalizePhone(c.phone), message: msg });
      } catch (e) {
        if (fallbackOpened === 0) {
          try {
            window.open('https://wa.me/' + normalizePhone(c.phone) + '?text=' + encodeURIComponent(msg), '_blank', 'noopener,noreferrer');
          } catch (e2) {}
        }
        fallbackOpened++;
      }

      try { await logComm('wa', c.id, c.name, c.phone, '', msg); } catch (e) {}
      count++;
    }

    await logActivity('send', 'Bulk WhatsApp reminders sent', `${count} recipient(s)`);
    if (typeof D.renderActiveTab === 'function') D.renderActiveTab();
    toast(`${count} reminder(s) sent.`, 'success');
  } finally {
    _bulkRemindInFlight = false;
  }
}

/* ═══════════════════════════════════════════════════════════════
   NAMESPACED EXPORT
   ═══════════════════════════════════════════════════════════════ */
export const F = {
  getInvoicePaidAmount, getInvoiceTotals, getInvoiceStatusDerived,
  invalidateInvoicePaidMemo,
  generateInvoiceNumber, nextProjectInvoiceNumber, buildInvoiceProgressMessage,
  reconcilePayment, onInvoicePaid, handleSubscriptionInvoicePaid,
  sendInvoiceReceipt, applyClientCreditToInvoice,
  openPayChain, confirmPayChain,
  openPaymentModal, renderPaymentProjectPicker, renderPaymentAllocation, updatePaymentSummary, savePayment, deletePayment,
  openInvoiceGenModal, refreshInvoiceProjects, renderExtraCharges, removeCharge, updateInvoicePreview,
  openInvoiceViewModal, deleteInvoice,
  openStkModal, sendStkPush,
  openMpesaModal, findInvoiceCandidates, autoMatchMpesa, applyMpesaMatch,
  processMpesaQueue, renderMpesaModal, openManualMpesaMatch, confirmMpesaMatch, renderMpesaInline,
  openServiceAgreementModal, attachServiceAgreement,
  sendClientStatement, transferProjectCredit,
  openFeesModal, openCreditTransfer,
  bulkRemind,
};

export default F;
