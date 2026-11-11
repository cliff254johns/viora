// main/clients.js — v9.5 (verified: no brace imbalance, no syntax errors)

import {
  getProjectAgreedTotal,
  getProjectPaidTotal,
  getProjectBilledTotal,
} from './projects.js';

import { contactButtons } from './contacts.js';

import {
  getInvoiceTotals,
  getInvoicePaidAmount,
  getInvoiceStatusDerived,
} from './finance.js';

let _deps = null;
let _bound = false;

const EMPTY_ARR = Object.freeze([]);
const EMPTY_OBJ = Object.freeze({});
const EMPTY_STATE = Object.freeze({ data: EMPTY_OBJ });

const _haystackCache = new WeakMap();
const _recomputeInflight = new Set();
let _rollupEpoch = 0;
const _rollupCache = new WeakMap();
let _rollupCacheState = null;

export function initClients(deps) {
  _deps = deps || {};
  if (!_bound) {
    Object.assign(window, {
      getEntities, getClients, getEmployees, getClient, getClientName,
      getClientProjects, getClientDocs, getClientInvoices, getClientPayments,
      getClientDeals, getClientContracts, getClientTasks,
      getClientComms, getClientAppointments, getClientPresentations,
      getClientAgreedTotal, getClientBilledTotal, getClientPaidTotal,
      getClientRemainingTotal, getClientCreditTotal,
      getFeeSummary, recomputeClientRollup, recomputeClientInstallments,
      renderClients, renderClientCards, renderClient360Page,
      openClient360, renderClientAvatarPreview,
      generateClientReport, downloadReportPdf, buildClientStatementPdf,
      openWelcomeEmailPreview,
    });
    _bound = true;
  }
  return _deps;
}

const $           = (id) => { const f = _deps && _deps.$; return f ? f(id) : document.getElementById(id); };
const S           = ()   => (_deps && _deps.state) || EMPTY_STATE;
const uid         = ()   => (_deps && _deps.uid)         ? _deps.uid()         : ('id_' + Math.random().toString(36).slice(2, 10));
const todayStr    = ()   => (_deps && _deps.todayStr)    ? _deps.todayStr()    : new Date().toISOString().slice(0, 10);
const dateToStr   = (d)  => (_deps && _deps.dateToStr)   ? _deps.dateToStr(d)  : String(d || '');
const fmtDate     = (d)  => (_deps && _deps.fmtDate)     ? _deps.fmtDate(d)    : String(d || '');
const fmtDateTime = (d, t) => (_deps && _deps.fmtDateTime) ? _deps.fmtDateTime(d, t) : String(d || '');
const fmtKES      = (n, c) => (_deps && _deps.fmtKES)    ? _deps.fmtKES(n, c)  : String(n);
const fmtBytes    = (n)  => (_deps && _deps.fmtBytes)    ? _deps.fmtBytes(n)   : String(n);
const timeAgo     = (t)  => (_deps && _deps.timeAgo)     ? _deps.timeAgo(t)    : '';
const toast       = (m, t) => { const f = _deps && _deps.toast; if (f) f(m, t); };
const _escapeFn   = (s)  => (_deps && _deps.escapeHtml)  ? _deps.escapeHtml(s) : defaultEscape(s);
const escapeHtml  = _escapeFn;

function defaultEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function dataArr(key) {
  const s = _deps && _deps.state;
  const d = s && s.data;
  const v = d && d[key];
  return Array.isArray(v) ? v : EMPTY_ARR;
}

function haystack(c) {
  let s = _haystackCache.get(c);
  if (s !== undefined) return s;
  s = ((c.name || '') + '\u0001' + (c.email || '') + '\u0001' +
       (c.company || '') + '\u0001' + (c.city || '') + '\u0001' +
       (c.clientId || '')).toLowerCase();
  _haystackCache.set(c, s);
  return s;
}

export const getEntities = (t) => {
  const out = [];
  const arr = dataArr('entities');
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (e && e.type === t) out.push(e);
  }
  return out;
};

export const getClients   = () => getEntities('client');
export const getEmployees = () => getEntities('employee');

export const getClient = (id) => {
  if (!id) return undefined;
  const arr = dataArr('entities');
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (e && e.id === id) return e;
  }
  return undefined;
};

export const getClientName = (id) => { const c = getClient(id); return c ? c.name : '—'; };

export const getClientProjects = (cid) => {
  const out = [];
  const arr = dataArr('projects');
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    if (p && p.clientId === cid) out.push(p);
  }
  return out;
};

export const getClientDocs = (c) => (c && Array.isArray(c.documents)) ? c.documents : EMPTY_ARR;

export const getClientInvoices      = (cid) => filterByClient('invoices',      cid);
export const getClientPayments      = (cid) => filterByClient('payments',      cid);
export const getClientDeals         = (cid) => filterByClient('deals',         cid);
export const getClientContracts     = (cid) => filterByClient('contracts',     cid);

function filterByClient(key, cid) {
  const out = [];
  const arr = dataArr(key);
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (x && x.clientId === cid) out.push(x);
  }
  return out;
}

export const getClientTasks = (cid) => {
  const pids = new Set();
  const projs = dataArr('projects');
  for (let i = 0; i < projs.length; i++) {
    const p = projs[i];
    if (p && p.clientId === cid) pids.add(p.id);
  }
  if (!pids.size) return EMPTY_ARR;
  const out = [];
  const tasks = dataArr('tasks');
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (t && t.projectId && pids.has(t.projectId)) out.push(t);
  }
  return out;
};

export const getClientComms = (cid) => {
  const out = [];
  const arr = dataArr('commLog');
  for (let i = 0; i < arr.length; i++) {
    const cm = arr[i];
    if (cm && cm.recipientId === cid) out.push(cm);
  }
  return out;
};

export const getClientAppointments = (cid) => {
  const out = [];
  const arr = dataArr('appointments');
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    if (a && a.clientId === cid) out.push(a);
  }
  out.sort((a, b) => ((a.date || '') + 'T' + (a.startTime || '00:00'))
    .localeCompare((b.date || '') + 'T' + (b.startTime || '00:00')));
  return out;
};

export const getClientPresentations = (cid) => {
  const out = [];
  const arr = dataArr('presentations');
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    if (p && p.clientId === cid) out.push(p);
  }
  out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return out;
};

export function computeClientRollup(clientId) {
  if (!clientId) return emptyRollup();

  const s = _deps && _deps.state;
  const sd = s && s.data;
  if (!sd) return emptyRollup();

  const paymentsCount = Array.isArray(sd.payments) ? sd.payments.length : 0;
  const projectsCount = Array.isArray(sd.projects) ? sd.projects.length : 0;
  const stamp = paymentsCount + ':' + projectsCount + ':' + clientId;

  let perState = _rollupCache.get(sd);
  if (!perState) { perState = new Map(); _rollupCache.set(sd, perState); }
  const hit = perState.get(clientId);
  if (hit && hit.stamp === stamp) return hit;

  const projects = [];
  const allProjects = dataArr('projects');
  for (let i = 0; i < allProjects.length; i++) {
    const p = allProjects[i];
    if (p && p.clientId === clientId) projects.push(p);
  }

  let agreed = 0, paid = 0;
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (p.status === 'cancelled') continue;
    agreed += num(getProjectAgreedTotal(p.id));
    paid   += num(getProjectPaidTotal(p.id));
  }

  const invoices = filterByClient('invoices', clientId);
  let invoiced = 0, invoicedPaid = 0, billedInvoiced = 0;
  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    const t = num(getInvoiceTotals(inv).total);
    invoiced += t;
    invoicedPaid += num(getInvoicePaidAmount(inv.id));
    const st = getInvoiceStatusDerived(inv);
    if (st !== 'draft' && st !== 'cancelled' && st !== 'void') billedInvoiced += t;
  }

  const c = getClient(clientId);
  const credit = num(c && c._creditBalance);

  const rollup = {
    stamp,
    projects,
    invoiceCount: invoices.length,
    agreed,
    paid,
    billed: billedInvoiced,
    balance: Math.max(0, agreed - paid),
    invoiced,
    invoicedPaid,
    outstanding: Math.max(0, invoiced - invoicedPaid),
    credit,
    progress: agreed > 0 ? Math.min(100, (paid / agreed) * 100) : 0,
  };

  if (perState) perState.set(clientId, rollup);
  return rollup;
}

function emptyRollup() {
  return {
    epoch: 0, projects: EMPTY_ARR, invoiceCount: 0,
    agreed: 0, paid: 0, billed: 0, balance: 0,
    invoiced: 0, invoicedPaid: 0, outstanding: 0, credit: 0, progress: 0,
  };
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

export function getClientAgreedTotal(clientId) { return computeClientRollup(clientId).agreed; }
export function getClientPaidTotal(clientId)   { return computeClientRollup(clientId).paid;   }

export function getClientBilledTotal(clientId, excludeInvoiceId = null) {
  const invoices = dataArr('invoices');
  let sum = 0;
  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    if (!inv || inv.clientId !== clientId || inv.id === excludeInvoiceId) continue;
    const st = getInvoiceStatusDerived(inv);
    if (st === 'draft' || st === 'cancelled' || st === 'void') continue;
    sum += num(getInvoiceTotals(inv).total);
  }
  return sum;
}

export function getClientRemainingTotal(clientId) {
  const r = computeClientRollup(clientId);
  return Math.max(0, r.agreed - r.paid);
}

export function getClientCreditTotal(clientId) { return computeClientRollup(clientId).credit; }

export function getFeeSummary(clientId) {
  const r = computeClientRollup(clientId);
  const c = getClient(clientId);
  return {
    totalFees: r.agreed,
    totalPaid: r.paid,
    balance: r.balance,
    installments: Array.isArray(c && c.installments) ? c.installments : EMPTY_ARR,
    progress: r.progress,
  };
}

export async function recomputeClientRollup(_clientId) {
  _rollupEpoch++;
  const s = _deps && _deps.state;
  if (s) {
    s._invoicePaidMemoMap = null;
    s._invoicePaidMemoStamp = 0;
    s._queueCache = null;
  }
}

export function recomputeClientInstallments(clientId) {
  if (_recomputeInflight.has(clientId)) return;
  _recomputeInflight.add(clientId);
  try {
    const client = getClient(clientId);
    if (!client) return;
    if (Array.isArray(client.installments) && client.installments.length) {
      client.installments = [];
      client._lastRecomputedAt = new Date().toISOString();
      const up = _deps && _deps.upsertDoc;
      if (up) up('entities', client, client._rev).catch((e) => console.warn('[clients] installments write failed', e));
    }
    recomputeClientRollup(clientId).catch(() => {});
  } finally {
    _recomputeInflight.delete(clientId);
  }
}

export function renderClients() {
  try {
    const host = $('clientCards');
    if (!host) { renderClientTableLegacy(); return; }

    const filter = ($('clientSearch')?.value || '').toLowerCase().trim();
    const all = getClients();
    const list = filter ? all.filter((c) => haystack(c).includes(filter)) : all;

    if (!list.length) {
      host.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1;padding:40px;text-align:center;">' +
        '<i class="fa-solid fa-users" style="font-size:2rem;opacity:.4;margin-bottom:10px;display:block;"></i>' +
        (filter ? 'No clients match your search.'
                : 'No clients yet. Click <strong>New Client</strong> to add one.') +
        '</div>';
      return;
    }

    let html = '';
    for (let i = 0; i < list.length; i++) html += renderClientTile(list[i]);
    host.innerHTML = html;

    const tb = $('clientTableBody');
    if (tb) {
      const wrapper = tb.closest('.table-wrapper');
      if (wrapper) wrapper.style.display = 'none';
    }

    try {
      let totalClients = 0, activeClients = 0, withProjects = 0;
      let totalAgreed = 0, totalPaid = 0;
      for (let i = 0; i < all.length; i++) {
        const c = all[i];
        if (!c) continue;
        totalClients++;
        if (c.status !== 'closed') activeClients++;
        const r = computeClientRollup(c.id);
        if (r.projects.length > 0) withProjects++;
        totalAgreed += r.agreed;
        totalPaid += r.paid;
      }
      const outstanding = Math.max(0, totalAgreed - totalPaid);

      const fmtK = (typeof fmtKES === 'function')
        ? fmtKES
        : (v) => 'KES ' + Number(v || 0).toLocaleString();

      const setTxt = (id, v) => {
        const el = document.getElementById(id);
        if (el && el.textContent !== String(v)) el.textContent = String(v);
      };
      setTxt('clTotal', totalClients);
      setTxt('clActive', activeClients);
      setTxt('clWithProjects', withProjects);
      setTxt('clAgreed', fmtK(totalAgreed));
      setTxt('clPaid', fmtK(totalPaid));
      setTxt('clOutstanding', fmtK(outstanding));
    } catch (e) { console.warn('[clients] KPI paint failed', e); }
  } catch (e) { console.warn('[clients] renderClients failed', e); }
}

function renderClientTableLegacy() {
  const tb = $('clientTableBody');
  if (!tb) return;
  const wrapper = tb.closest('.table-wrapper');
  if (wrapper) wrapper.style.display = '';

  const filter = ($('clientSearch')?.value || '').toLowerCase().trim();
  const all = getClients();
  const list = filter ? all.filter((c) => haystack(c).includes(filter)) : all;

  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="8" class="empty-state">No clients yet.</td></tr>';
    return;
  }
  let html = '';
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const r = computeClientRollup(c.id);
    html += '<tr>' +
      '<td><span class="badge badge-purple">' + escapeHtml(c.clientId || '') + '</span></td>' +
      '<td><strong>' + escapeHtml(c.name) + '</strong></td>' +
      '<td>' + escapeHtml(c.email || '') + '</td>' +
      '<td>' + escapeHtml(c.phone || '') + '</td>' +
      '<td>' + escapeHtml(c.company || '') + '</td>' +
      '<td>' + fmtKES(r.agreed) + '</td>' +
      '<td>' + fmtKES(r.paid) + '</td>' +
      '<td style="text-align:right;">' + contactButtons(c, 'client') + '</td>' +
    '</tr>';
  }
  tb.innerHTML = html;
}

function renderClientTile(cl) {
  const r = computeClientRollup(cl.id);
  const projects = r.projects;

  let activeProj = 0, closedProj = 0;
  for (let i = 0; i < projects.length; i++) {
    const st = projects[i].status;
    if (st === 'active') activeProj++;
    else if (st === 'closed') closedProj++;
  }
  const projCount = projects.length;
  const projectSummary = projCount === 0
    ? 'No projects yet'
    : `${projCount} project${projCount === 1 ? '' : 's'} · ${activeProj} active · ${closedProj} closed`;

  const progressPct = Math.round(r.progress);
  const progressCls = progressPct >= 100 ? 'green' : progressPct >= 50 ? '' : 'gold';

  const avatarHtml = cl.avatar
    ? '<img src="' + escapeHtml(cl.avatar) + '" alt="' + escapeHtml(cl.name || '') + '" />'
    : escapeHtml((cl.name || '?').charAt(0).toUpperCase());

  const isClosed  = cl.status === 'closed';
  const statusCls = isClosed ? 'closed' : 'active';
  const statusLbl = isClosed ? 'Closed' : 'Active';

  const balance     = r.balance;
  const balanceCls  = balance > 0 ? 'owed' : 'settled';
  const balanceLbl  = balance > 0 ? fmtKES(balance) + ' owed' : '✓ Settled';

  const idPart      = cl.clientId ? escapeHtml(cl.clientId) : '';
  const companyPart = cl.company  ? escapeHtml(cl.company)  : '';
  const metaLine    = [idPart, companyPart].filter(Boolean).join(' · ') || '—';

  const emailLine = cl.email
    ? '<div class="tile-meta" title="' + escapeHtml(cl.email) + '">' + escapeHtml(cl.email) + '</div>'
    : '';

  const idAttr = escapeHtml(cl.id);

  return '' +
    '<div class="card-3d client-tile" data-client-id="' + idAttr + '">' +
      '<div class="tile-header">' +
        '<div class="avatar-mini xl client-avatar" data-act="360" title="Open Client 360">' + avatarHtml + '</div>' +
        '<div class="tile-header-body">' +
          '<div class="tile-title-row">' +
            '<span class="tile-name" data-act="360" title="' + escapeHtml(cl.name) + '">' + escapeHtml(cl.name) + '</span>' +
            '<span class="tile-status ' + statusCls + '">' + statusLbl + '</span>' +
          '</div>' +
          '<div class="tile-meta">' + metaLine + '</div>' +
          emailLine +
          '<div class="tile-meta subtle">' + projectSummary + '</div>' +
          '<div class="contact-actions">' + contactButtons(cl, 'client') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="tile-numbers">' +
        '<div class="tile-numbers-row">' +
          '<span class="tile-numbers-paid">' + fmtKES(r.paid) + ' <span style="opacity:.55;">of</span> ' + fmtKES(r.agreed) + '</span>' +
          '<span class="tile-numbers-balance ' + balanceCls + '">' + balanceLbl + '</span>' +
        '</div>' +
        '<div class="progress-3d"><div class="progress-3d-bar ' + progressCls + '" style="width:' + progressPct + '%;"></div></div>' +
      '</div>' +
      '<div class="tile-actions">' +
        '<div class="tile-actions-primary">' +
          '<button type="button" class="btn btn-success" data-act="pay" title="Record payment"><i class="fa-solid fa-money-bill-wave"></i><span class="btn-label">Pay</span></button>' +
          '<button type="button" class="btn btn-primary" data-act="edit" title="Edit client"><i class="fa-solid fa-pen"></i><span class="btn-label">Edit</span></button>' +
          '<button type="button" class="btn btn-gold" data-act="fees" title="Fees & installments"><i class="fa-solid fa-coins"></i><span class="btn-label">Fees</span></button>' +
          '<button type="button" class="btn btn-outline" data-act="360" title="Open Client 360"><i class="fa-solid fa-id-card-clip"></i><span class="btn-label">360</span></button>' +
        '</div>' +
        '<div class="tile-actions-secondary">' +
          '<button type="button" class="btn btn-outline" data-act="docs" title="Documents"><i class="fa-solid fa-folder"></i></button>' +
          '<button type="button" class="btn btn-outline" data-act="book" title="Book appointment"><i class="fa-solid fa-calendar-plus"></i></button>' +
          '<button type="button" class="btn btn-outline" data-act="statement" title="Send statement"><i class="fa-solid fa-file-invoice-dollar"></i></button>' +
          '<button type="button" class="btn btn-danger" data-act="delete" title="Delete client"><i class="fa-solid fa-trash"></i></button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

(function installClientTileDelegate() {
  if (typeof document === 'undefined') return;
  if (window.__vioraClientTileDelegateInstalled) return;
  window.__vioraClientTileDelegateInstalled = true;

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest && ev.target.closest('[data-act]');
    if (!btn) return;
    const tile = btn.closest('[data-client-id]');
    if (!tile) return;

    const id = tile.getAttribute('data-client-id');
    const act = btn.getAttribute('data-act');
    if (!id || !act) return;

    const actions = {
      '360': 'client360',
      pay: 'openPayChain',
      edit: 'editClient',
      fees: 'openFees',
      docs: 'openClientDocs',
      book: 'bookAppointmentForClient',
      statement: 'sendClientStatement',
      delete: 'deleteClient'
    };
    const method = actions[act];
    const api = window.Viora;
    if (!method || !api || typeof api[method] !== 'function') {
      console.error('[clients] Missing client action handler:', act, method);
      if (api && typeof api.toast === 'function') api.toast('This client action is temporarily unavailable. Please refresh and try again.', 'error');
      return;
    }

    try {
      const result = api[method](id);
      if (result && typeof result.catch === 'function') {
        result.catch((error) => {
          console.error('[clients] Client action failed:', act, error);
          if (typeof api.toast === 'function') api.toast(error?.message || 'Client action failed. Please try again.', 'error');
        });
      }
    } catch (error) {
      console.error('[clients] Client action failed:', act, error);
      if (typeof api.toast === 'function') api.toast(error?.message || 'Client action failed. Please try again.', 'error');
    }
  });
})();

export function renderClientCards(id, clients) {
  const c = $(id);
  if (!c) return;
  if (!clients || !clients.length) {
    c.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No clients yet.</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (let i = 0; i < clients.length; i++) {
    const cl = clients[i];
    const r = computeClientRollup(cl.id);
    const p = r.projects.length;
    const d = getClientDocs(cl).length;
    const cls = r.progress >= 100 ? 'green' : r.progress >= 50 ? '' : 'gold';
    const avatar = cl.avatar
      ? '<img src="' + escapeHtml(cl.avatar) + '" alt="">'
      : escapeHtml((cl.name || '?').charAt(0));

    const el = document.createElement('div');
    el.className = 'card-3d';
    el.innerHTML =
      '<div class="avatar-mini xl" style="cursor:pointer;" data-act="360" data-client-id="' + escapeHtml(cl.id) + '">' + avatar + '</div>' +
      '<div class="card-info">' +
        '<div class="card-title">' + escapeHtml(cl.name) + ' ' + contactButtons(cl, 'client') + '</div>' +
        '<div class="card-sub">' + escapeHtml(cl.clientId || '') + ' · ' + escapeHtml(cl.company || cl.clientType || '') + '</div>' +
        '<div class="progress-3d" style="margin-top:6px;"><div class="progress-3d-bar ' + cls + '" style="width:' + r.progress + '%;"></div></div>' +
        '<div class="progress-3d-label"><span>Fees</span><span>' + fmtKES(r.paid) + ' / ' + fmtKES(r.agreed) + '</span></div>' +
        '<div class="card-stats">' +
          '<div class="stat"><span class="val">' + p + '</span><span class="lbl">Projects</span></div>' +
          '<div class="stat"><span class="val">' + d + '</span><span class="lbl">Docs</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="card-actions"><button class="btn btn-purple btn-xs" data-act="360" data-client-id="' + escapeHtml(cl.id) + '"><i class="fa-solid fa-id-card-clip"></i></button></div>';

    frag.appendChild(el);
  }

  c.replaceChildren(frag);
}

export function renderClient360Page() {
  try {
    const filter = ($('c360Search')?.value || '').toLowerCase().trim();
    const all = getClients();
    const list = filter ? all.filter((c) => haystack(c).includes(filter)) : all;
    const c = $('c360Grid');
    if (!c) return;
    if (!list.length) {
      c.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No clients yet.</div>';
      return;
    }
    let html = '';
    for (let i = 0; i < list.length; i++) {
      const cl = list[i];
      const r = computeClientRollup(cl.id);
      const projects = r.projects.length;
      const invoices = r.invoiceCount;
      const docs = getClientDocs(cl).length;
      const comms = getClientComms(cl.id).length;
      const cls = r.progress >= 100 ? 'green' : r.progress >= 50 ? '' : 'gold';
      const avatar = cl.avatar
        ? '<img src="' + escapeHtml(cl.avatar) + '" alt="">'
        : escapeHtml((cl.name || '?').charAt(0));
      html += '<div class="card-3d">' +
        '<div class="avatar-mini xl" style="cursor:pointer;" data-act="360" data-client-id="' + escapeHtml(cl.id) + '">' + avatar + '</div>' +
        '<div class="card-info">' +
          '<div class="card-title">' + escapeHtml(cl.name) + ' ' + contactButtons(cl, 'client') + '</div>' +
          '<div class="card-sub">' + escapeHtml(cl.clientId || '') + ' · ' + escapeHtml(cl.company || cl.clientType || '') + '</div>' +
          '<div class="progress-3d" style="margin-top:6px;"><div class="progress-3d-bar ' + cls + '" style="width:' + r.progress + '%;"></div></div>' +
          '<div class="progress-3d-label"><span>Fees</span><span>' + fmtKES(r.paid) + ' / ' + fmtKES(r.agreed) + '</span></div>' +
          '<div class="card-stats">' +
            '<div class="stat"><span class="val">' + projects + '</span><span class="lbl">Projects</span></div>' +
            '<div class="stat"><span class="val">' + invoices + '</span><span class="lbl">Invoices</span></div>' +
            '<div class="stat"><span class="val">' + docs + '</span><span class="lbl">Docs</span></div>' +
            '<div class="stat"><span class="val">' + comms + '</span><span class="lbl">Comms</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="card-actions"><button class="btn btn-primary btn-xs" data-act="360" data-client-id="' + escapeHtml(cl.id) + '"><i class="fa-solid fa-id-card-clip"></i> Open</button></div>' +
      '</div>';
    }
    c.innerHTML = html;
  } catch (e) { console.warn('[clients] renderClient360Page failed', e); }
}

export function openClient360(clientId) {
  const c = getClient(clientId);
  if (!c) { toast('Client not found.', 'error'); return; }
  const st = S();
  if (st && st !== EMPTY_STATE) st.viewing360ClientId = clientId;

  const r = computeClientRollup(clientId);
  const projects = r.projects;
  const invoices = getClientInvoices(clientId);
  const deals = getClientDeals(clientId);
  const contracts = getClientContracts(clientId);
  const tasks = getClientTasks(clientId);
  const comms = getClientComms(clientId);
  const docs = getClientDocs(c);
  const appointments = getClientAppointments(clientId);
  const presentations = getClientPresentations(clientId);

  const outstanding = r.outstanding;
  const totalInvoiced = r.invoiced;
  const totalPaid = r.paid;
  const walletBalance = r.credit;

  let grandAgreed = 0, grandPaid = 0;
  let projectBreakdownHtml = '';
  if (!projects.length) {
    projectBreakdownHtml = '<div style="color:var(--text-secondary);font-size:.8rem;">No projects yet.</div>';
  } else {
    const rows = [];
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      const agreed = num(getProjectAgreedTotal(p.id));
      const paid   = num(getProjectPaidTotal(p.id));
      const balance = Math.max(0, agreed - paid);
      const pct = agreed > 0 ? Math.min(100, Math.round((paid / agreed) * 100)) : 0;
      grandAgreed += agreed;
      grandPaid += paid;
      rows.push(
        '<div class="client-360-row" style="align-items:center;">' +
          '<span class="k" style="flex:1;min-width:0;">' +
            '<strong>' + escapeHtml(p.projectNumber || '—') + '</strong>' +
            '<br><small style="color:var(--text-secondary);">' + escapeHtml(p.title || '') + '</small>' +
          '</span>' +
          '<span class="v" style="text-align:right;white-space:nowrap;">' +
            '<div>' + fmtKES(paid) + ' / ' + fmtKES(agreed) + '</div>' +
            '<div style="font-size:.7rem;color:' + (balance > 0 ? 'var(--accent-gold)' : 'var(--accent-green)') + ';">Balance ' + fmtKES(balance) + '</div>' +
            '<div class="progress-3d" style="width:90px;height:4px;margin-top:3px;">' +
              '<div class="progress-3d-bar ' + (pct >= 100 ? 'green' : pct >= 50 ? '' : 'gold') + '" style="width:' + pct + '%;"></div>' +
            '</div>' +
          '</span>' +
        '</div>');
    }
    projectBreakdownHtml = rows.join('');
  }
  const grandBalance = Math.max(0, grandAgreed - grandPaid);

  let activeProjects = 0;
  for (let i = 0; i < projects.length; i++) if (projects[i].status === 'active') activeProjects++;
  let openTasks = 0;
  for (let i = 0; i < tasks.length; i++) if (tasks[i].status === 'pending') openTasks++;

  const invoicesHtml = invoices.length
    ? invoices.map((inv) => {
        const total = num(getInvoiceTotals(inv).total);
        const st2 = getInvoiceStatusDerived(inv);
        return '<div class="client-360-row"><span class="k">' + escapeHtml(inv.number || '—') + ' — ' + fmtDate(inv.date) + '</span><span class="v">' + fmtKES(total, inv.currency) + ' <span class="badge badge-' + st2 + '">' + st2 + '</span></span></div>';
      }).join('')
    : '<div style="color:var(--text-secondary);font-size:.8rem;">No invoices yet.</div>';

  const dealsHtml = deals.length
    ? deals.map((d) => '<div class="client-360-row"><span class="k">' + escapeHtml(d.title || '—') + '</span><span class="v">' + fmtKES(d.value) + ' <span class="badge badge-' + (d.stage === 'Won' ? 'paid' : d.stage === 'Lost' ? 'overdue' : 'sent') + '">' + (d.stage || '—') + '</span></span></div>').join('')
    : '<div style="color:var(--text-secondary);font-size:.8rem;">No deals yet.</div>';

  const contractsHtml = contracts.length
    ? contracts.map((co) => '<div class="client-360-row"><span class="k">' + escapeHtml(co.title || '—') + ' — expires ' + fmtDate(co.expiryDate) + '</span><span class="v">' + fmtKES(co.value) + ' <span class="badge badge-' + (co.status === 'Active' ? 'active' : 'gray') + '">' + (co.status || '—') + '</span></span></div>').join('')
    : '<div style="color:var(--text-secondary);font-size:.8rem;">No contracts yet.</div>';

  const commsHtml = comms.length
    ? comms.slice(0, 8).map((cm) => {
        const icon = cm.channel === 'wa' ? 'brands fa-whatsapp' : 'solid fa-envelope';
        const raw = (cm.subject || (cm.message || '').substring(0, 50));
        const suffix = ((cm.message || '').length > 50 && !cm.subject) ? '…' : '';
        return '<div class="client-360-row"><span class="k"><i class="fa-' + icon + '" style="margin-right:4px;"></i>' + escapeHtml(raw) + suffix + '</span><span class="v" style="font-size:.72rem;color:var(--text-secondary);">' + timeAgo(cm.timestamp) + '</span></div>';
      }).join('')
    : '<div style="color:var(--text-secondary);font-size:.8rem;">No communications logged.</div>';

  const apptsHtml = appointments.length
    ? appointments.slice(0, 8).map((a) => {
        const cls = a.status === 'held' ? 'badge-active' : a.status === 'missed' ? 'badge-overdue' : a.status === 'cancelled' ? 'badge-cancelled' : 'badge-pending';
        return '<div class="client-360-row"><span class="k"><i class="fa-solid fa-calendar-check" style="margin-right:4px;color:var(--accent-blue);"></i>' + escapeHtml(a.title || '—') + ' · ' + escapeHtml(a.type || '') + '</span><span class="v">' + fmtDateTime(a.date, a.startTime) + ' <span class="badge ' + cls + '">' + (a.status || '—') + '</span></span></div>';
      }).join('')
    : '<div style="color:var(--text-secondary);font-size:.8rem;">No appointments booked.</div>';

  const presHtml = presentations.length
    ? presentations.slice(0, 8).map((p) => {
        const cls = p.status === 'accepted' ? 'badge-active' : p.status === 'rejected' ? 'badge-overdue' : p.status === 'delivered' ? 'badge-delivered' : 'badge-draft';
        return '<div class="client-360-row"><span class="k"><i class="fa-solid fa-chalkboard-user" style="margin-right:4px;color:var(--accent-purple);"></i>' + escapeHtml(p.title || '—') + ' · ' + escapeHtml(p.type || '') + '</span><span class="v">' + fmtDate(p.date) + ' <span class="badge ' + cls + '">' + (p.status || '—') + '</span></span></div>';
      }).join('')
    : '<div style="color:var(--text-secondary);font-size:.8rem;">No presentations logged.</div>';

  const target = $('client360Content');
  if (!target) { toast('Client 360 modal missing — reload.', 'error'); return; }

  const avatar = c.avatar
    ? '<img src="' + escapeHtml(c.avatar) + '" alt="">'
    : escapeHtml((c.name || '?').charAt(0));

  const walletStat = walletBalance > 0
    ? '<div class="client-360-stat" style="border-left:3px solid var(--accent-green);"><div class="label">Wallet Credit</div><div class="value" style="color:var(--accent-green);">' + fmtKES(walletBalance) + '</div></div>'
    : '';

  target.innerHTML =
    '<div class="client-360-hero">' +
      '<div class="avatar-mini xl">' + avatar + '</div>' +
      '<div class="hero-info">' +
        '<h3>' + escapeHtml(c.name) + '</h3>' +
        '<div class="subtitle">' + escapeHtml(c.clientId || '') + ' · ' + escapeHtml(c.company || c.clientType || '') +
          (c.city  ? ' · ' + escapeHtml(c.city)  : '') +
          (c.email ? ' · ' + escapeHtml(c.email) : '') +
          (c.phone ? ' · ' + escapeHtml(c.phone) : '') +
        '</div>' +
        '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">' +
          '<span class="badge badge-' + (c.clientType === 'Enterprise' ? 'overdue' : c.clientType === 'SMB' ? 'gray' : 'sent') + '">' + escapeHtml(c.clientType || 'Client') + '</span>' +
          (activeProjects > 0 ? '<span class="badge badge-active">' + activeProjects + ' active</span>' : '') +
          (openTasks > 0 ? '<span class="badge badge-pending">' + openTasks + ' tasks</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="hero-actions">' + contactButtons(c, 'client') + '</div>' +
    '</div>' +
    '<div class="client-360-grid">' +
      '<div class="client-360-stat"><div class="label">Total Fees</div><div class="value">' + fmtKES(r.agreed) + '</div></div>' +
      '<div class="client-360-stat"><div class="label">Paid</div><div class="value">' + fmtKES(r.paid) + '</div></div>' +
      '<div class="client-360-stat"><div class="label">Balance</div><div class="value">' + fmtKES(r.balance) + '</div></div>' +
      '<div class="client-360-stat"><div class="label">Invoiced</div><div class="value">' + fmtKES(totalInvoiced) + '</div></div>' +
      '<div class="client-360-stat"><div class="label">Outstanding</div><div class="value">' + fmtKES(outstanding) + '</div></div>' +
      '<div class="client-360-stat"><div class="label">Appointments</div><div class="value">' + appointments.length + '</div></div>' +
      '<div class="client-360-stat"><div class="label">Presentations</div><div class="value">' + presentations.length + '</div></div>' +
      walletStat +
      '<div class="client-360-stat" style="border-left:3px solid var(--accent-blue);"><div class="label">Projects Agreed (sum)</div><div class="value">' + fmtKES(grandAgreed) + '</div></div>' +
      '<div class="client-360-stat" style="border-left:3px solid var(--accent-gold);"><div class="label">Projects Balance</div><div class="value">' + fmtKES(grandBalance) + '</div></div>' +
    '</div>' +
    '<div class="progress-3d"><div class="progress-3d-bar ' + (r.progress >= 100 ? 'green' : r.progress >= 50 ? '' : 'gold') + '" style="width:' + r.progress + '%;"></div></div>' +
    '<div class="progress-3d-label"><span>Fee Progress</span><span>' + r.progress.toFixed(0) + '%</span></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px;">' +
      '<div class="client-360-section"><h4><i class="fa-solid fa-calendar-check"></i> Appointments (' + appointments.length + ')</h4><div class="section-body">' + apptsHtml + '</div></div>' +
      '<div class="client-360-section"><h4><i class="fa-solid fa-chalkboard-user"></i> Presentations (' + presentations.length + ')</h4><div class="section-body">' + presHtml + '</div></div>' +
      '<div class="client-360-section" style="grid-column:1/-1;"><h4><i class="fa-solid fa-folder"></i> Projects — Per-Project Breakdown (' + projects.length + ')</h4><div class="section-body">' + projectBreakdownHtml + '</div></div>' +
      '<div class="client-360-section"><h4><i class="fa-solid fa-file-invoice"></i> Invoices (' + invoices.length + ')</h4><div class="section-body">' + invoicesHtml + '</div></div>' +
      '<div class="client-360-section"><h4><i class="fa-solid fa-handshake"></i> Deals (' + deals.length + ')</h4><div class="section-body">' + dealsHtml + '</div></div>' +
      '<div class="client-360-section"><h4><i class="fa-solid fa-file-signature"></i> Contracts (' + contracts.length + ')</h4><div class="section-body">' + contractsHtml + '</div></div>' +
      '<div class="client-360-section"><h4><i class="fa-solid fa-comments"></i> Communications (' + comms.length + ')</h4><div class="section-body">' + commsHtml + '</div></div>' +
    '</div>';

  const open = _deps && _deps.openModal;
  if (open) open('client360Modal');
}

export function renderClientAvatarPreview() {
  const host = $('clientAvatarPreview');
  if (!host) return;
  const st = S();
  let src = null;
  if (st.pendingClientAvatar === '__CLEAR__') src = null;
  else if (st.pendingClientAvatar) src = st.pendingClientAvatar;
  else {
    const id = $('editClientId')?.value;
    const c = id ? getClient(id) : null;
    src = (c && c.avatar) || null;
  }
  if (src) {
    host.innerHTML = '<img src="' + escapeHtml(src) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
  } else {
    host.innerHTML = '<i class="fa-solid fa-user" style="font-size:1.5rem;opacity:.6;"></i>';
  }
}

function sliceCanvasToPdf(pdf, canvas, imgW, ph, margin) {
  if (!canvas || canvas.height <= 0 || canvas.width <= 0) return;
  const pageHeightPx = (canvas.width * (ph - margin * 2)) / imgW;
  if (pageHeightPx <= 0) return;
  let y = 0;
  let first = true;
  while (y < canvas.height) {
    const sliceH = Math.min(pageHeightPx, canvas.height - y);
    if (sliceH <= 0) break;
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceH;
    const sctx = slice.getContext('2d');
    sctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    const img = slice.toDataURL('image/png');
    const mmH = (sliceH * imgW) / canvas.width;
    if (!first) pdf.addPage('a4', 'portrait');
    pdf.addImage(img, 'PNG', margin, margin, imgW, mmH);
    first = false;
    y += sliceH;
  }
}

export async function generateClientReport(clientId) {
  const c = getClient(clientId);
  if (!c) return;
  const r = computeClientRollup(clientId);
  const fee = getFeeSummary(clientId);
  const projects = r.projects;
  const invoices = getClientInvoices(clientId);
  const deals = getClientDeals(clientId);
  const contracts = getClientContracts(clientId);
  const docs = getClientDocs(c);

  const totalInvoiced = r.invoiced;
  const totalPaid = r.invoicedPaid;
  const outstanding = r.outstanding;

  const projectsRows = projects.map((p) => '<tr><td>' + escapeHtml(p.projectNumber || '—') + '</td><td>' + escapeHtml(p.title || '—') + '</td><td>' + (p.status || '—') + '</td><td style="text-align:right;">' + (p.progress || 0) + '%</td></tr>').join('');
  const invoicesRows = invoices.map((inv) => {
    const total = num(getInvoiceTotals(inv).total);
    return '<tr><td>' + escapeHtml(inv.number || '—') + '</td><td>' + fmtDate(inv.date) + '</td><td>' + fmtDate(inv.dueDate) + '</td><td style="text-align:right;">' + fmtKES(total, inv.currency) + '</td><td>' + getInvoiceStatusDerived(inv) + '</td></tr>';
  }).join('');
  const dealsRows = deals.map((d) => '<tr><td>' + escapeHtml(d.title || '—') + '</td><td style="text-align:right;">' + fmtKES(d.value) + '</td><td>' + (d.stage || '—') + '</td><td>' + escapeHtml(d.terms || '—') + '</td></tr>').join('');
  const contractsRows = contracts.map((co) => '<tr><td>' + escapeHtml(co.title || '—') + '</td><td>' + fmtDate(co.startDate) + '</td><td>' + fmtDate(co.expiryDate) + '</td><td style="text-align:right;">' + fmtKES(co.value) + '</td><td>' + (co.status || '—') + '</td></tr>').join('');

  const target = $('reportContent');
  if (!target) { toast('Report modal missing — reload.', 'error'); return; }

  const logo = (_deps && _deps.getLogoImg) ? _deps.getLogoImg('max-height:64px;') : '';
  const phone = (_deps && _deps.SENDER_PHONE) || '';
  const email = (_deps && _deps.SENDER_EMAIL) || '';
  const operatorName = (S().operator && S().operator.name) || 'Viora System';

  const createdRaw = typeof c.createdAt === 'string' ? c.createdAt.slice(0, 10) : '';
  const clientSince = createdRaw ? fmtDate(createdRaw) : '—';

  target.innerHTML =
    '<div class="report-head">' +
      '<div class="brand" style="display:flex;align-items:center;gap:14px;">' + logo +
        '<div><div style="font-size:.72rem;color:#64748b;margin-top:4px;">' + escapeHtml(phone) + ' · ' + escapeHtml(email) + '</div></div>' +
      '</div>' +
      '<div class="report-meta">' +
        '<div style="font-size:1.1rem;font-weight:800;color:#0a0a0f;">CLIENT REPORT</div>' +
        '<div>Report Date: ' + fmtDate(todayStr()) + '</div>' +
        '<div>Client ID: ' + escapeHtml(c.clientId || clientId.slice(0, 10)) + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="margin-bottom:16px;">' +
      '<h2 style="font-size:1rem;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e8f0;padding-bottom:6px;">Client Profile</h2>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;font-size:.8rem;">' +
        '<div><strong>Name:</strong> ' + escapeHtml(c.name) + '</div>' +
        '<div><strong>Type:</strong> ' + escapeHtml(c.clientType || '—') + '</div>' +
        '<div><strong>Company:</strong> ' + escapeHtml(c.company || '—') + '</div>' +
        '<div><strong>City:</strong> ' + escapeHtml(c.city || '—') + '</div>' +
        '<div><strong>Email:</strong> ' + escapeHtml(c.email || '—') + '</div>' +
        '<div><strong>Phone:</strong> ' + escapeHtml(c.phone || '—') + '</div>' +
        '<div><strong>Client Since:</strong> ' + clientSince + '</div>' +
        '<div><strong>Documents:</strong> ' + docs.length + ' on file</div>' +
      '</div>' +
    '</div>' +
    '<h2>Financial Summary</h2>' +
    '<div class="report-kpi-grid">' +
      '<div class="report-kpi"><div class="lbl">Total Fees</div><div class="val">' + fmtKES(fee.totalFees) + '</div></div>' +
      '<div class="report-kpi"><div class="lbl">Paid</div><div class="val">' + fmtKES(fee.totalPaid) + '</div></div>' +
      '<div class="report-kpi"><div class="lbl">Balance</div><div class="val">' + fmtKES(fee.balance) + '</div></div>' +
      '<div class="report-kpi"><div class="lbl">Outstanding</div><div class="val">' + fmtKES(outstanding) + '</div></div>' +
    '</div>' +
    '<div style="font-size:.78rem;color:#475569;margin-top:6px;">Total Invoiced: ' + fmtKES(totalInvoiced) + ' · Total Paid: ' + fmtKES(totalPaid) + ' · Outstanding: ' + fmtKES(outstanding) + '</div>' +
    (deals.length     ? '<h2>Deals (' + deals.length + ')</h2><table><thead><tr><th>Title</th><th style="text-align:right;">Value</th><th>Stage</th><th>Terms</th></tr></thead><tbody>' + dealsRows + '</tbody></table>' : '') +
    (contracts.length ? '<h2>Contracts (' + contracts.length + ')</h2><table><thead><tr><th>Title</th><th>Start</th><th>Expiry</th><th style="text-align:right;">Value</th><th>Status</th></tr></thead><tbody>' + contractsRows + '</tbody></table>' : '') +
    (projects.length  ? '<h2>Projects (' + projects.length + ')</h2><table><thead><tr><th>#</th><th>Title</th><th>Status</th><th style="text-align:right;">Progress</th></tr></thead><tbody>' + projectsRows + '</tbody></table>' : '') +
    (invoices.length  ? '<h2>Invoices (' + invoices.length + ')</h2><table><thead><tr><th>Number</th><th>Date</th><th>Due</th><th style="text-align:right;">Total</th><th>Status</th></tr></thead><tbody>' + invoicesRows + '</tbody></table>' : '') +
    '<div class="report-signature">' +
      '<div class="sig-line">Prepared by<br><strong>' + escapeHtml(operatorName) + '</strong></div>' +
      '<div class="sig-line">Authorised Signature<br>&nbsp;</div>' +
    '</div>' +
    '<div class="report-footer">Generated ' + new Date().toLocaleString() + ' · © VIORA — Confidential</div>';

  const open = _deps && _deps.openModal;
  if (open) open('reportModal');
}

export async function downloadReportPdf() {
  const content = $('reportContent');
  if (!content) { toast('Report content missing.', 'error'); return; }
  if (typeof html2canvas !== 'function') { toast('PDF library not loaded.', 'error'); return; }
  if (!window.jspdf || !window.jspdf.jsPDF) { toast('jsPDF library not loaded.', 'error'); return; }
  try {
    const canvas = await html2canvas(content, { scale: 2, backgroundColor: '#ffffff', logging: false });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const imgW = pw - margin * 2;
    sliceCanvasToPdf(pdf, canvas, imgW, ph, margin);
    const cid = S().viewing360ClientId;
    const c = cid ? getClient(cid) : null;
    const name = (c && c.name ? c.name : 'client').replace(/[^a-z0-9]/gi, '_');
    pdf.save(name + '_report.pdf');
    toast('Report PDF downloaded.', 'success');
  } catch (e) {
    console.warn('[report] PDF failed', e);
    toast('PDF failed: ' + (e.message || 'unknown'), 'error');
  }
}

export async function buildClientStatementPdf(clientId) {
  const c = getClient(clientId);
  if (!c) throw new Error('Client not found');
  if (typeof html2canvas !== 'function') throw new Error('html2canvas not loaded — cannot build PDF');
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF not loaded — cannot build PDF');

  const invoices = getClientInvoices(clientId);
  const r = computeClientRollup(clientId);
  const agreed = r.agreed, billed = r.billed, paid = r.paid, balance = r.balance, wallet = r.credit;

  const stage = document.createElement('div');
  stage.style.position   = 'fixed';
  stage.style.left       = '-9999px';
  stage.style.top        = '0';
  stage.style.width      = '794px';
  stage.style.background = '#ffffff';
  stage.style.color      = '#000000';
  stage.style.padding    = '24px';
  stage.style.fontFamily = "'Inter', Arial, sans-serif";
  stage.style.fontSize   = '12px';
  stage.style.lineHeight = '1.5';

  const rows = invoices.map((inv) => {
    const t  = num(getInvoiceTotals(inv).total);
    const pp = num(getInvoicePaidAmount(inv.id));
    const st = getInvoiceStatusDerived(inv);
    return '<tr>' +
      '<td style="padding:6px;border-bottom:1px solid #e2e8f0;">' + escapeHtml(inv.number || '—') + '</td>' +
      '<td style="padding:6px;border-bottom:1px solid #e2e8f0;">' + fmtDate(inv.date) + '</td>' +
      '<td style="padding:6px;border-bottom:1px solid #e2e8f0;">' + fmtDate(inv.dueDate) + '</td>' +
      '<td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;">' + fmtKES(t) + '</td>' +
      '<td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;">' + fmtKES(pp) + '</td>' +
      '<td style="padding:6px;border-bottom:1px solid #e2e8f0;">' + String(st || '').toUpperCase() + '</td>' +
    '</tr>';
  }).join('');

  const phone = (_deps && _deps.SENDER_PHONE) || '';
  const email = (_deps && _deps.SENDER_EMAIL) || '';

  stage.innerHTML =
    '<div style="text-align:center;border-bottom:2px solid #0a0a0f;padding-bottom:12px;margin-bottom:18px;">' +
      '<div style="font-size:1.4rem;font-weight:800;letter-spacing:1px;">VIORA INTERCOLLECTIVE</div>' +
      '<div style="font-size:.72rem;color:#475569;margin-top:4px;">' + escapeHtml(phone) + ' · ' + escapeHtml(email) + '</div>' +
    '</div>' +
    '<h2 style="text-align:center;font-size:1.1rem;letter-spacing:2px;margin:0 0 18px;">STATEMENT OF ACCOUNT</h2>' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:18px;">' +
      '<div>' +
        '<div style="font-size:.7rem;text-transform:uppercase;color:#64748b;">Client</div>' +
        '<div style="font-weight:700;">' + escapeHtml(c.name || '') + '</div>' +
        (c.company ? '<div>' + escapeHtml(c.company) + '</div>' : '') +
        (c.email   ? '<div>' + escapeHtml(c.email)   + '</div>' : '') +
        (c.phone   ? '<div>' + escapeHtml(c.phone)   + '</div>' : '') +
      '</div>' +
      '<div style="text-align:right;">' +
        '<div style="font-size:.7rem;text-transform:uppercase;color:#64748b;">Statement Date</div>' +
        '<div style="font-weight:700;">' + fmtDate(todayStr()) + '</div>' +
        '<div style="font-size:.72rem;color:#64748b;">Client ID: ' + escapeHtml(c.clientId || '—') + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px;">' +
      '<div style="padding:10px;border:1px solid #cbd5e1;border-radius:8px;"><div style="font-size:.65rem;text-transform:uppercase;color:#64748b;">Agreed</div><div style="font-weight:800;">' + fmtKES(agreed) + '</div></div>' +
      '<div style="padding:10px;border:1px solid #cbd5e1;border-radius:8px;"><div style="font-size:.65rem;text-transform:uppercase;color:#64748b;">Billed</div><div style="font-weight:800;">' + fmtKES(billed) + '</div></div>' +
      '<div style="padding:10px;border:1px solid #cbd5e1;border-radius:8px;"><div style="font-size:.65rem;text-transform:uppercase;color:#64748b;">Paid</div><div style="font-weight:800;color:#0f766e;">' + fmtKES(paid) + '</div></div>' +
      '<div style="padding:10px;border:1px solid #cbd5e1;border-radius:8px;"><div style="font-size:.65rem;text-transform:uppercase;color:#64748b;">Balance</div><div style="font-weight:800;color:' + (balance > 0 ? '#b45309' : '#0f766e') + ';">' + fmtKES(balance) + '</div></div>' +
    '</div>' +
    (wallet > 0 ? '<div style="margin-bottom:14px;padding:8px 12px;background:#f0fdf4;border-left:3px solid #22c55e;">Wallet credit available: <strong>' + fmtKES(wallet) + '</strong></div>' : '') +
    '<table style="width:100%;border-collapse:collapse;font-size:.78rem;">' +
      '<thead><tr style="background:#f1f5f9;">' +
        '<th style="text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;">Invoice</th>' +
        '<th style="text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;">Date</th>' +
        '<th style="text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;">Due</th>' +
        '<th style="text-align:right;padding:8px;border-bottom:1px solid #cbd5e1;">Total</th>' +
        '<th style="text-align:right;padding:8px;border-bottom:1px solid #cbd5e1;">Paid</th>' +
        '<th style="text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;">Status</th>' +
      '</tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8;">No invoices yet.</td></tr>') + '</tbody>' +
    '</table>' +
    '<div style="margin-top:24px;font-size:.7rem;color:#64748b;text-align:center;border-top:1px solid #e2e8f0;padding-top:10px;">' +
      'Generated ' + new Date().toLocaleString() + ' · © VIORA — Confidential' +
    '</div>';

  document.body.appendChild(stage);
  try {
    const canvas = await html2canvas(stage, {
      scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
      windowWidth: 794, windowHeight: Math.min(stage.scrollHeight, 12000),
    });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const imgW = pw - margin * 2;
    sliceCanvasToPdf(pdf, canvas, imgW, ph, margin);
    const base64 = pdf.output('datauristring').split(',')[1];
    const safeName = (c.name || 'client').replace(/[^a-z0-9]/gi, '_');
    return { base64, filename: 'Statement_' + safeName + '.pdf' };
  } finally {
    stage.remove();
  }
}

export function openWelcomeEmailPreview(clientId) {
  const client = getClient(clientId);
  if (!client) { toast('Client not found.', 'error'); return; }
  if (!client.email) { toast('No email on file — cannot send welcome.', 'warning'); return; }

  const phone = (_deps && _deps.SENDER_PHONE) || '';
  const defaultSubject = 'Welcome to VIORA Intercollective';
  const defaultBody =
    'Dear ' + (client.name || 'Client') + ',\n' +
    '\n' +
    'Welcome to VIORA Intercollective. Your account is now active.\n' +
    '\n' +
    'Your client ID: ' + (client.clientId || '—') + '\n' +
    'Portal: https://viora.co.ke/portal.html\n' +
    '\n' +
    'If you have any questions, reply to this email or WhatsApp us on ' + phone + '.\n' +
    '\n' +
    '— VIORA Intercollective\n' + phone;

  let modal = document.getElementById('welcomeEmailModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'welcomeEmailModal';
    modal.innerHTML =
      '<div class="modal" style="max-width:640px;">' +
        '<h2><span class="modal-icon" style="background:var(--accent-blue);"><i class="fa-solid fa-envelope-open-text"></i></span> Send welcome email</h2>' +
        '<div id="welcomeMeta" style="padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-input);margin-bottom:14px;font-size:.82rem;"></div>' +
        '<label>To</label>' +
        '<input id="welcomeTo" type="text" readonly style="background:var(--bg-card-solid);color:var(--text-secondary);" />' +
        '<label style="margin-top:12px;">Subject</label>' +
        '<input id="welcomeSubject" type="text" />' +
        '<label style="margin-top:12px;">Message</label>' +
        '<textarea id="welcomeBody" rows="12" style="font-family:inherit;line-height:1.55;"></textarea>' +
        '<div style="margin-top:12px;font-size:.75rem;color:var(--text-secondary);display:flex;align-items:center;gap:8px;">' +
          '<i class="fa-solid fa-circle-info"></i>' +
          'You can edit the subject and body freely. Nothing is sent until you click <strong>Open Gmail &amp; Send</strong> — and even then, you still have to click Send inside Gmail.' +
        '</div>' +
        '<div id="welcomeHistory" style="margin-top:14px;"></div>' +
        '<div class="form-actions" style="margin-top:20px;flex-wrap:wrap;gap:8px;">' +
          '<button type="button" class="btn btn-outline" data-act="cancel">Cancel</button>' +
          '<button type="button" class="btn btn-primary" data-act="copy"><i class="fa-solid fa-copy"></i> Copy to Clipboard</button>' +
          '<button type="button" class="btn btn-success" data-act="gmail"><i class="fa-solid fa-paper-plane"></i> Open Gmail &amp; Send</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    modal.addEventListener('click', async (e) => {
      const btn = e.target.closest && e.target.closest('[data-act]');
      if (!btn) return;
      const id = modal.dataset.clientId;
      if (!id) return;
      const act = btn.dataset.act;
      if (act === 'cancel') {
        modal.classList.remove('active');
        toast('Welcome email cancelled — nothing was sent.', 'info');
        return;
      }
      const liveClient = getClient(id);
      if (!liveClient) return;
      const subjectEl = modal.querySelector('#welcomeSubject');
      const bodyEl = modal.querySelector('#welcomeBody');
      if (act === 'copy') {
        const subject = (subjectEl.value || '').trim();
        const body = bodyEl.value || '';
        const combined = 'Subject: ' + subject + '\n\n' + body;
        try {
          await navigator.clipboard.writeText(combined);
          toast('Welcome message copied to clipboard.', 'success');
        } catch (_) {
          const ta = document.createElement('textarea');
          ta.value = combined;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); toast('Copied.', 'success'); }
          catch (_2) { toast('Copy failed — select manually.', 'warning'); }
          ta.remove();
        }
        await _logWelcome(liveClient, subject, body, 'clipboard', 'welcome-copied', false);
        modal.classList.remove('active');
        return;
      }
      if (act === 'gmail') {
        const subject = (subjectEl.value || '').trim() || defaultSubject;
        const body = bodyEl.value || '';
        if (!subject) { toast('Subject cannot be empty.', 'error'); return; }
        const url =
          'https://mail.google.com/mail/?view=cm&fs=1' +
          '&to=' + encodeURIComponent(liveClient.email) +
          '&su=' + encodeURIComponent(subject) +
          '&body=' + encodeURIComponent(body);
        window.open(url, 'viora_welcome_' + Date.now(),
          'noopener,noreferrer,width=780,height=820,left=600,top=60');
        await _logWelcome(liveClient, subject, body, 'gmail-compose', 'welcome-compose', true);
        modal.classList.remove('active');
        toast('Gmail compose opened. Review and click Send.', 'success');
        const renderComms = (_deps && _deps.renderCommunications) || window.renderCommunications;
        if (S().currentTab === 'communications' && typeof renderComms === 'function') renderComms();
      }
    });
  }

  modal.dataset.clientId = clientId;
  const toEl = modal.querySelector('#welcomeTo');
  const subjectEl = modal.querySelector('#welcomeSubject');
  const bodyEl = modal.querySelector('#welcomeBody');
  const metaEl = modal.querySelector('#welcomeMeta');
  const historyEl = modal.querySelector('#welcomeHistory');

  toEl.value = client.email;
  subjectEl.value = defaultSubject;
  bodyEl.value = defaultBody;

  metaEl.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:4px;">' +
      '<div><span style="color:var(--text-secondary);">Client:</span> <strong>' + escapeHtml(client.name || '—') + '</strong></div>' +
      '<div><span style="color:var(--text-secondary);">Client ID:</span> <code>' + escapeHtml(client.clientId || '—') + '</code></div>' +
      '<div><span style="color:var(--text-secondary);">Email:</span> ' + escapeHtml(client.email) + '</div>' +
    '</div>';

  const commLog = dataArr('commLog');
  const history = [];
  for (let i = 0; i < commLog.length; i++) {
    const cm = commLog[i];
    if (!cm || cm.recipientId !== clientId) continue;
    if (!(cm.reason || '').includes('welcome')) continue;
    history.push(cm);
    if (history.length >= 5) break;
  }
  if (history.length) {
    historyEl.innerHTML =
      '<div style="font-size:.72rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700;letter-spacing:.5px;margin-bottom:6px;">Previous welcome attempts</div>' +
      history.map((h) =>
        '<div style="padding:6px 10px;background:var(--bg-card-solid);border-radius:8px;margin-bottom:4px;font-size:.75rem;">' +
          '<div style="display:flex;justify-content:space-between;">' +
            '<span>' + escapeHtml(h.subject || '(no subject)') + '</span>' +
            '<span style="color:var(--text-light);">' + timeAgo(h.timestamp) + '</span>' +
          '</div>' +
          '<div style="color:var(--text-secondary);font-size:.68rem;margin-top:2px;">via ' + escapeHtml(h.transport || 'unknown') + ' · ' + (h.userMustClickSend ? 'user compose' : 'auto') + '</div>' +
        '</div>'
      ).join('');
  } else {
    historyEl.innerHTML = '';
  }

  modal.classList.add('active');
  setTimeout(() => subjectEl.focus(), 100);
}

async function _logWelcome(client, subject, body, transport, reason, userMustClickSend) {
  const logComm = _deps && _deps.logComm;
  try {
    if (logComm) {
      await logComm('em', client.id, client.name, client.email, subject, body, {
        reason, transport, userMustClickSend,
        dedupeKey: reason + '|' + client.id + '|' + Date.now(),
      });
    }
  } catch (e) {
    console.warn('[clients] welcome log failed', e);
  }
  const live = getClient(client.id);
  if (!live) return;
  live._welcomeSent = new Date().toISOString();
  live._welcomeSentVia = transport;
  const up = _deps && _deps.upsertDoc;
  if (up) up('entities', live, live._rev).catch(() => {});
}
