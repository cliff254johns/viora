// main/misc-helpers.js
// ═══════════════════════════════════════════════════════════════
//  Misc helpers — Journal entry UI · Proposal studio · CSV export
//  Extracted from main.js. No Firebase writes, no state coupling.
// ═══════════════════════════════════════════════════════════════

let _ctx = null;
export function initMiscHelpers(ctx) { _ctx = ctx || {}; }
function ctx() { return _ctx || {}; }

/* ═══════════════════════════════════════════════════════════════
   SHARED MICRO-HELPERS
   ═══════════════════════════════════════════════════════════════ */
function newId(prefix) {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function utf8Bytes(s) {
  return new TextEncoder().encode(s);
}

// Fixes Bug 1 — proper UTF-8 → base64 (surrogate-pair safe).
function utf8ToBase64(s) {
  const bytes = utf8Bytes(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/* ═══════════════════════════════════════════════════════════════
   CSV EXPORT
   Fixes Bug 2 (newline + formula injection) and Bug 3 (revoke race).
   ═══════════════════════════════════════════════════════════════ */
export function exportCsv(rows, headers, fields, filename) {
  const { toast } = ctx();

  if (!Array.isArray(rows) || rows.length === 0) {
    if (toast) toast('Nothing to export.', 'error');
    return;
  }

  // Hoist accessors once (Issue 3).
  const getters = new Array(fields.length);
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    getters[i] = typeof f === 'function' ? f : ((r) => r?.[f]);
  }

  const esc = (raw) => {
    let v = raw == null ? '' : String(raw);
    // Neutralize formula injection (CWE-1236).
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    // Quote if contains delimiter, quote, or newline.
    if (/[",\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  };

  const lines = new Array(rows.length + 1);

  // Header row.
  {
    let h = '';
    for (let j = 0; j < headers.length; j++) {
      h += (j ? ',' : '') + esc(headers[j]);
    }
    lines[0] = h;
  }

  // Data rows.
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let row = '';
    for (let j = 0; j < getters.length; j++) {
      row += (j ? ',' : '') + esc(getters[j](r));
    }
    lines[i + 1] = row;
  }

  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);

  try {
    a.click();
  } finally {
    a.remove();
    // Deferred revoke — Safari races the download otherwise.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (toast) toast(`Exported ${rows.length} rows.`, 'success');
}

/* ═══════════════════════════════════════════════════════════════
   JOURNAL ENTRY (ledger posting)
   ═══════════════════════════════════════════════════════════════ */
const JE_ACCOUNTS = [
  '1010 Cash', '1020 Bank', '1100 Accounts Receivable',
  '2000 Accounts Payable', '2100 VAT Payable', '2200 PAYE Payable',
  '2210 NSSF Payable', '2220 SHIF Payable', '2230 Housing Levy Payable',
  '3000 Owner Equity', '4000 Service Revenue',
  '5000 Salaries & Wages', '5100 Rent', '5200 Utilities',
  '5300 Software Subscriptions', '5400 Travel', '5900 Miscellaneous'
];

const JE_ACCOUNT_SET = new Set(JE_ACCOUNTS);

function jeLineHtml(l, i) {
  const optionsHtml = JE_ACCOUNTS.map((a) =>
    `<option value="${a}"${a === l.account ? ' selected' : ''}>${a}</option>`
  ).join('');

  return (
    `<div class="je-row">` +
      `<select class="jeAccount" data-idx="${i}">` +
        `<option value="">— Account —</option>` +
        optionsHtml +
      `</select>` +
      `<input type="number" class="jeDebit" data-idx="${i}" value="${l.debit || ''}" step="0.01" placeholder="Debit" inputmode="decimal">` +
      `<input type="number" class="jeCredit" data-idx="${i}" value="${l.credit || ''}" step="0.01" placeholder="Credit" inputmode="decimal">` +
      `<button type="button" class="btn btn-danger btn-xs" data-remove-je="${i}" aria-label="Remove line">` +
        `<i class="fa-solid fa-xmark"></i>` +
      `</button>` +
    `</div>`
  );
}

export function openJournalModal() {
  const { state, $, todayStr, openModal } = ctx();
  state.pendingJeLines = [
    { account: '', debit: 0, credit: 0 },
    { account: '', debit: 0, credit: 0 }
  ];
  $('jeDate').value = todayStr();
  $('jeRef').value = '';
  $('jeMemo').value = '';
  renderJeLines();
  openModal('journalModal');
}

export function renderJeLines() {
  const { state, $ } = ctx();
  const host = $('jeLines');
  if (!host) return;

  const lines = state.pendingJeLines;
  let html = '';
  for (let i = 0; i < lines.length; i++) {
    html += jeLineHtml(lines[i], i);
  }
  host.innerHTML = html;

  // One delegated listener set — survives innerHTML swaps (fixes Bug 4, 5, 6).
  if (!host.__jeBound) {
    host.__jeBound = true;

    host.addEventListener('input', (e) => {
      const t = e.target;
      const idx = t.dataset?.idx;
      if (idx == null) return;
      const line = state.pendingJeLines[+idx];
      if (!line) return;
      if (t.classList.contains('jeDebit')) {
        line.debit = toNumber(t.value);
      } else if (t.classList.contains('jeCredit')) {
        line.credit = toNumber(t.value);
      } else {
        return;
      }
      updateJeBalance();
    });

    host.addEventListener('change', (e) => {
      const t = e.target;
      if (!t.classList.contains('jeAccount')) return;
      const line = state.pendingJeLines[+t.dataset.idx];
      if (line) line.account = t.value;
    });

    host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-je]');
      if (!btn) return;
      state.pendingJeLines.splice(+btn.dataset.removeJe, 1);
      renderJeLines();
    });
  }

  updateJeBalance();
}

export function updateJeBalance() {
  const { state, $, fmtKES } = ctx();
  const el = $('jeBalanceStatus');
  if (!el) return;

  const lines = state.pendingJeLines;
  let d = 0;
  let c = 0;
  for (let i = 0; i < lines.length; i++) {
    d += Number(lines[i].debit) || 0;
    c += Number(lines[i].credit) || 0;
  }
  const diff = d - c;
  const balanced = Math.abs(diff) < 0.01 && d > 0;

  // Fixes Bug 7 — textContent + class toggle instead of innerHTML + style writes.
  el.classList.toggle('is-balanced', balanced);
  el.textContent =
    `Debits: ${fmtKES(d)} · Credits: ${fmtKES(c)} · ` +
    (balanced ? '✓ Balanced' : 'Difference: ' + fmtKES(diff));
}

export async function postJournalEntry() {
  const { state, $, toast, logActivity, callFn, closeModal, renderLedger, fmtKES } = ctx();

  const pending = state.pendingJeLines;
  const lines = [];
  for (let i = 0; i < pending.length; i++) {
    const l = pending[i];
    if (!l.account) continue;
    if (!JE_ACCOUNT_SET.has(l.account)) continue; // Fixes Bug 9 — whitelist.
    if (!Number(l.debit) && !Number(l.credit)) continue;
    lines.push(l);
  }

  if (lines.length < 2) {
    toast('At least 2 valid lines required.', 'error');
    return;
  }

  let d = 0;
  let c = 0;
  for (let i = 0; i < lines.length; i++) {
    d += Number(lines[i].debit) || 0;
    c += Number(lines[i].credit) || 0;
  }
  if (Math.abs(d - c) > 0.01) {
    toast('Journal does not balance.', 'error');
    return;
  }

  try {
    await callFn('ledger/post', {
      date: $('jeDate').value,
      memo: $('jeMemo').value,
      refType: 'manual',
      refId: $('jeRef').value,
      lines
    });
    await logActivity('add', 'Journal entry posted', `${lines.length} lines · ${fmtKES(d)}`);
    closeModal('journalModal');
    toast('Journal entry posted.', 'success');
    renderLedger();
  } catch (e) {
    toast('Post failed: ' + e.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   PROPOSAL STUDIO
   ═══════════════════════════════════════════════════════════════ */
function resolveProposalLinks(state, $) {
  const leadId = $('propLead').value;
  const dealId = $('propDeal').value;
  const lead = leadId ? (state.data.leads || []).find((l) => l.id === leadId) : null;
  const deal = dealId ? (state.data.deals || []).find((d) => d.id === dealId) : null;
  return { leadId, dealId, lead, deal };
}

function proposalTitle(lead, deal) {
  if (lead) return `Proposal — ${lead.fullName}`;
  if (deal) return `Proposal — ${deal.title}`;
  return `Proposal — ${new Date().toLocaleDateString()}`;
}

export function openProposalStudio(preset = {}) {
  const { state, $, escapeHtml, openModal } = ctx();

  $('propLead').innerHTML =
    '<option value="">— None —</option>' +
    (state.data.leads || []).map((l) =>
      `<option value="${escapeHtml(l.id)}">${escapeHtml(l.fullName)}</option>`
    ).join('');

  $('propDeal').innerHTML =
    '<option value="">— None —</option>' +
    (state.data.deals || []).map((d) =>
      `<option value="${escapeHtml(d.id)}">${escapeHtml(d.title)}</option>`
    ).join('');

  // Fixes Bug 10 — reset all fields regardless of preset.
  $('propLead').value = preset.leadId || '';
  $('propDeal').value = preset.dealId || '';
  $('propNotes').value = preset.notes || '';

  $('proposalResultWrap').style.display = 'none';
  $('proposalResult').value = '';
  $('proposalMeta').textContent = '';

  openModal('proposalModal');
}

export async function generateProposalDraft() {
  const { state, $, toast, callFn, logActivity, getClient } = ctx();

  const notes = $('propNotes').value.trim();
  if (notes.length < 20) {
    toast('Paste at least a few lines of meeting notes.', 'error');
    return;
  }

  const { lead, deal } = resolveProposalLinks(state, $);
  const client = deal?.clientId ? getClient(deal.clientId) : null;

  const btn = $('generateProposalBtn');

  // Fixes Bug 12 — guard double-click.
  if (btn.disabled) return;

  btn.disabled = true;
  const prevHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating…';

  try {
    const res = await callFn('generateProposal', {
      meetingNotes: notes,
      tone:         $('propTone').value,
      serviceArea:  $('propService').value,
      leadName:     lead?.fullName || null,
      companyName:  client?.company || lead?.company || null,
      dealTitle:    deal?.title || null,
      dealValue:    deal ? toNumber(deal.value) : null
    });

    if (!res || !res.proposal) throw new Error('Empty response.');

    $('proposalResult').value = res.proposal;
    $('proposalResultWrap').style.display = 'block';
    $('proposalMeta').textContent =
      `Model: ${res.model || 'gpt-oss-120b'} · ${new Date().toLocaleTimeString()}`;

    await logActivity('add', 'AI proposal generated',
      `Groq · ${lead?.fullName || deal?.title || 'unlinked'}`);

    toast('Draft generated.', 'success');
  } catch (e) {
    console.error(e);
    toast('Proposal generation failed.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = prevHtml;
  }
}

export async function saveProposalDraft() {
  const { state, $, toast, upsertDoc, closeModal, renderProposals } = ctx();

  const body = $('proposalResult').value.trim();
  if (!body) {
    toast('Nothing to save.', 'error');
    return;
  }

  const { leadId, dealId, lead, deal } = resolveProposalLinks(state, $);

  const p = {
    id: newId('p'),
    title: proposalTitle(lead, deal),
    leadId: leadId || null,
    dealId: dealId || null,
    body,
    tone: $('propTone').value,
    serviceArea: $('propService').value,
    generatedBy: state.operator?.name || 'System',
    createdAt: new Date().toISOString()
  };

  await upsertDoc('proposals', p);
  renderProposals();
  toast('Proposal saved.', 'success');
  closeModal('proposalModal');
}

export async function proposalToVault() {
  const { state, $, toast, upsertDoc, renderDocumentVault } = ctx();

  const body = $('proposalResult').value.trim();
  if (!body) {
    toast('Nothing to save.', 'error');
    return;
  }

  const { leadId, dealId, lead, deal } = resolveProposalLinks(state, $);
  const title = proposalTitle(lead, deal);

  // Fixes Bug 1 — proper UTF-8 → base64.
  const dataUri = 'data:text/markdown;base64,' + utf8ToBase64(body);
  const sizeBytes = utf8Bytes(body).length;

  // Guard against Firestore's 1 MiB doc limit.
  if (sizeBytes > 800000) {
    toast('Proposal too large for the vault (>800 KB). Save as a file instead.', 'error');
    return;
  }

  const doc = {
    id: newId('doc'),
    title,
    system: 'Sales',
    category: 'AI Proposal',
    parentId: dealId || leadId || null,
    parentName: title,
    fileName: `${title.replace(/[^a-z0-9]/gi, '_')}.md`,
    mime: 'text/markdown',
    size: sizeBytes,
    data: dataUri,
    uploadedAt: new Date().toISOString()
  };

  await upsertDoc('documents', doc);
  renderDocumentVault();
  toast('Saved to Vault.', 'success');
}

export async function proposalToInvoice() {
  const {
    state, $, toast, upsertDoc, todayStr,
    generateInvoiceNumber, renderInvoices
  } = ctx();

  const dealId = $('propDeal').value;
  const deal = dealId ? (state.data.deals || []).find((d) => d.id === dealId) : null;

  if (!deal?.clientId) {
    toast('Link a deal first.', 'error');
    return;
  }

  // Fixes Bug 14 — sanitize deal value.
  const sub = toNumber(deal.value);

  // Fixes Bug 13 — due date was today → always overdue. Default to +30 days.
  const due = new Date();
  due.setDate(due.getDate() + 30);
  const dueStr = due.toISOString().slice(0, 10);

  const inv = {
    id: newId('inv'),
    number: generateInvoiceNumber(),
    clientId: deal.clientId,
    date: todayStr(),
    dueDate: dueStr,
    status: 'draft',
    currency: 'KES',
    tax: 0,
    notes: 'Generated from AI proposal',
    items: [{
      description: deal.title || 'Proposal deliverable',
      hours: 0,
      rate: 0,
      amount: sub,
      worklogId: null
    }],
    extraCharges: [],
    createdAt: new Date().toISOString()
  };

  await upsertDoc('invoices', inv);
  toast('Draft invoice created.', 'success');
  renderInvoices();
}
