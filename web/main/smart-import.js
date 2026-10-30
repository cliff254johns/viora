/* ═══════════════════════════════════════════════════════════════
   VIORA — SMART IMPORT SUBSYSTEM  (v6.9 — debugged + hardened)
   Handles: CSV/XLSX upload, AI entity detection, mapping,
            preview, and bulk row insertion.
   ═══════════════════════════════════════════════════════════════ */

let D = {
  $: null, toast: null, uid: null, callFn: null, state: null,
  upsertDoc: null, logActivity: null,
  todayStr: null, MAX_FILE_SIZE: null, renderAll: null,
  escapeHtml: null,
};

export function initSmartImport(d) {
  // Only overwrite with defined values — never blow away defaults with undefined
  if (d && typeof d === 'object') {
    for (const k of Object.keys(d)) {
      if (d[k] !== undefined) D[k] = d[k];
    }
  }
}

/* ── Safe ctx accessors ── */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const DEFAULT_ESCAPE = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const E = (s) => (typeof D.escapeHtml === 'function' ? D.escapeHtml(s) : DEFAULT_ESCAPE(s));
const q = (s) => String(s == null ? '' : s)
  .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

const safe$ = (id) => (typeof D.$ === 'function' ? D.$(id) : (typeof document !== 'undefined' ? document.getElementById(id) : null));
const safeToast = (m, t) => { try { if (typeof D.toast === 'function') D.toast(m, t); } catch (e) {} };
const safeUid = () => (typeof D.uid === 'function' ? D.uid() : 'imp-' + Math.random().toString(36).slice(2, 10));
const safeToday = () => (typeof D.todayStr === 'function' ? D.todayStr() : new Date().toISOString().slice(0, 10));

/* ── Constants ── */
const MAX_FILE_SIZE_DEFAULT = 15 * 1024 * 1024;   // 15 MB
const MAX_ROWS_DEFAULT = 5000;
const MAX_CELL_LEN = 2000;                        // hard cap on any single cell
const MAX_BASE64_STORE = 900 * 1024;              // don't store source docs > ~900 KB
const IMPORT_CONCURRENCY = 8;
const ALLOWED_EXT = new Set(['csv', 'xlsx', 'xls']);

const REQUIRED_FIELDS = Object.freeze({
  clients:   ['name'],
  employees: ['name'],
  leads:     ['fullName'],
  deals:     ['title'],
  projects:  ['title'],
  invoices:  ['clientName'],
  expenses:  ['vendor', 'amount'],
  inventory: ['sku', 'name'],
  products:  ['id', 'name']
});

const FIELD_OPTIONS = Object.freeze({
  clients:   ['name', 'email', 'phone', 'phoneAlt', 'company', 'address', 'city', 'clientType', 'caseFees'],
  leads:     ['fullName', 'email', 'phone', 'source', 'status', 'notes'],
  inventory: ['sku', 'name', 'qty', 'reorder', 'cost', 'price'],
  deals:     ['title', 'clientName', 'value', 'stage', 'terms', 'owner', 'source', 'notes'],
  expenses:  ['vendor', 'category', 'amount', 'method', 'status', 'date', 'description'],
  employees: ['name', 'designation', 'department', 'payRate', 'email', 'phone', 'status'],
  projects:  ['projectNumber', 'title', 'clientName', 'serviceArea', 'platform', 'startDate', 'deadline', 'status'],
  invoices:  ['number', 'clientName', 'date', 'dueDate', 'status', 'currency'],
  products:  ['id', 'name', 'description', 'category', 'price', 'period', 'icon', 'tags', 'status']
});

const COLLECTION_MAP = Object.freeze({
  clients: 'entities', employees: 'entities',
  leads: 'leads', deals: 'deals', projects: 'projects',
  invoices: 'invoices', expenses: 'expenses',
  inventory: 'inventory', products: 'products'
});

/* ── Module state ── */
let importState = createEmptyImportState();
let _abortRequested = false;
let _dzBound = false;

function createEmptyImportState() {
  return {
    rows: [], headers: [], fileName: '',
    mapping: {}, transforms: {}, entity: '',
    raw: null
  };
}

/* ═══════════════════════════════════════════════════════════════
   DROPZONE SETUP
   ═══════════════════════════════════════════════════════════════ */
export function setupImportDropzone() {
  const dz    = safe$('importDropzone');
  const input = safe$('importFileInput');
  if (!dz || !input) return;

  // Idempotent — don't stack listeners on re-open
  if (_dzBound) return;
  _dzBound = true;

  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = 'var(--accent-blue)'; });
  dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; });
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.style.borderColor = '';
    const f = e.dataTransfer?.files?.[0];
    if (f) handleImportFile(f);
  });
  input.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) handleImportFile(f);
    e.target.value = '';
  });

  safe$('importCancelBtn')?.addEventListener('click', () => {
    _abortRequested = true;
    const wiz = safe$('importWizard');
    if (wiz) wiz.style.display = 'none';
    importState = createEmptyImportState();
  });
  safe$('importReanalyzeBtn')?.addEventListener('click', () => {
    if (importState.raw) analyzeImport(importState.raw).catch(e => safeToast('Re-analyze failed: ' + e.message, 'error'));
  });
  safe$('importConfirmBtn')?.addEventListener('click', () => {
    confirmImport().catch(e => safeToast('Import failed: ' + (e?.message || e), 'error'));
  });
}

/* ═══════════════════════════════════════════════════════════════
   FILE HANDLING
   ═══════════════════════════════════════════════════════════════ */
async function handleImportFile(file) {
  try {
    const maxSize = Number(D.MAX_FILE_SIZE) > 0 ? Number(D.MAX_FILE_SIZE) : MAX_FILE_SIZE_DEFAULT;
    if (!file || typeof file.size !== 'number') { safeToast('Invalid file.', 'error'); return; }
    if (file.size > maxSize) { safeToast(`File too large (max ${(maxSize / 1024 / 1024).toFixed(1)} MB).`, 'error'); return; }

    const ext = (String(file.name).split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) { safeToast('Only CSV, XLSX, or XLS files are supported.', 'error'); return; }

    // Reset any prior state
    importState = createEmptyImportState();
    _abortRequested = false;

    if (typeof XLSX === 'undefined' || !XLSX?.read || !XLSX?.utils?.sheet_to_json) {
      safeToast('Spreadsheet reader not loaded. Refresh the page.', 'error');
      return;
    }

    let buf;
    try { buf = await file.arrayBuffer(); }
    catch (e) { safeToast('Could not read file: ' + (e?.message || e), 'error'); return; }

    let workbook;
    try { workbook = XLSX.read(buf, { type: 'array', cellDates: true }); }
    catch (e) { safeToast('Cannot parse file. Is it a valid spreadsheet?', 'error'); return; }

    const sheetName = workbook.SheetNames?.[0];
    if (!sheetName) { safeToast('No sheets in file.', 'error'); return; }
    const firstSheet = workbook.Sheets[sheetName];
    if (!firstSheet) { safeToast('Empty sheet.', 'error'); return; }

    let rows;
    try {
      rows = XLSX.utils.sheet_to_json(firstSheet, {
        defval: '',
        raw: false,
        blankrows: false
      });
    } catch (e) { safeToast('Could not extract rows.', 'error'); return; }

    // Normalise headers: trim, dedupe
    rows = normaliseRows(rows);

    const maxRows = Number(D.MAX_FILE_SIZE) > 0 ? MAX_ROWS_DEFAULT : MAX_ROWS_DEFAULT;
    if (rows.length > maxRows) { safeToast(`Max ${maxRows.toLocaleString()} rows per import.`, 'error'); return; }
    if (!rows.length) { safeToast('No data found in file.', 'error'); return; }

    // Read base64 in parallel — but cap it if too big
    const raw = { file, rows, fileName: file.name, rawBase64: null };
    if (file.size <= MAX_BASE64_STORE) {
      try {
        raw.rawBase64 = await readFileAsDataURL(file);
      } catch (e) {
        console.warn('[import] base64 read failed', e);
      }
    } else {
      console.info('[import] file too large to archive; skipping base64 capture', file.size);
    }

    importState.raw = raw;
    await analyzeImport(raw);
  } catch (e) {
    console.warn('[import] handleImportFile failed', e);
    safeToast('Import failed: ' + (e?.message || e), 'error');
  }
}

/* Read file as DataURL (Promise-based, no callbacks) */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('FileReader failed'));
    fr.readAsDataURL(file);
  });
}

/* Normalise header names + dedupe + cap cell length */
function normaliseRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const out = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const clean = {};
    for (const k of Object.keys(r)) {
      const key = String(k).trim();
      if (!key) continue;
      // Dedupe: if header already used, suffix with _2, _3, ...
      let finalKey = key;
      let n = 2;
      while (finalKey in clean) { finalKey = `${key}_${n++}`; }
      let v = r[k];
      if (typeof v === 'string' && v.length > MAX_CELL_LEN) v = v.slice(0, MAX_CELL_LEN);
      clean[finalKey] = v;
    }
    out.push(clean);
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════
   ANALYZE
   ═══════════════════════════════════════════════════════════════ */
async function analyzeImport(raw) {
  const rows = Array.isArray(raw?.rows) ? raw.rows : [];
  const fileName = String(raw?.fileName || 'file');
  const headers = Object.keys(rows[0] || {});
  if (!headers.length) { safeToast('No columns detected.', 'error'); return; }

  // Truncate sample values for the AI call
  const sampleRows = rows.slice(0, 3).map(r => {
    const o = {};
    for (const h of headers) o[h] = String(r[h] ?? '').slice(0, 100);
    return o;
  });

  const wizard = safe$('importWizard');
  if (wizard) wizard.style.display = 'block';

  setText('importFileMeta', `${fileName} · ${rows.length.toLocaleString()} rows · ${headers.length} cols`);

  const badge = safe$('importEntityBadge');
  if (badge) badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing…';

  const reasoning = safe$('importReasoning');
  if (reasoning) { reasoning.style.display = 'none'; reasoning.textContent = ''; }

  const mappingList = safe$('importMappingList');
  if (mappingList) mappingList.innerHTML = '<div class="ai-rec-loading">Reading columns…</div>';

  setText('importPreviewTable', '');
  setText('importSummary', '');
  setText('importWarnings', '');

  let res;
  try {
    if (typeof D.callFn !== 'function') throw new Error('callFn not available');
    res = await D.callFn('importFile', { headers, sampleRows, targetEntity: 'auto' });
  } catch (e) {
    if (badge) badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Analysis failed';
    if (mappingList) {
      mappingList.innerHTML = `<div class="ai-rec-loading" style="color:var(--accent-red);">${E(e?.message || 'Unknown error')}</div>`;
    }
    return;
  }

  // Sanitise AI response
  const detectedEntity = typeof res?.detectedEntity === 'string' ? res.detectedEntity : 'unknown';
  const confidence = Number.isFinite(Number(res?.confidence)) ? Number(res.confidence) : 0;
  const mapping = (res?.mapping && typeof res.mapping === 'object' && !Array.isArray(res.mapping)) ? { ...res.mapping } : {};
  const transforms = (res?.transforms && typeof res.transforms === 'object' && !Array.isArray(res.transforms)) ? { ...res.transforms } : {};
  const reasoningText = typeof res?.reasoning === 'string' ? res.reasoning : '';
  const warnings = Array.isArray(res?.warnings) ? res.warnings : [];

  // Only keep mappings that reference valid fields for the detected entity
  const validFields = new Set(FIELD_OPTIONS[detectedEntity] || []);
  for (const k of Object.keys(mapping)) {
    const v = mapping[k];
    if (!v || (validFields.size && !validFields.has(v))) {
      delete mapping[k];
    }
  }

  importState.headers = headers;
  importState.rows = rows;
  importState.fileName = fileName;
  importState.mapping = mapping;
  importState.transforms = transforms;
  importState.entity = detectedEntity;

  if (badge) {
    if (detectedEntity && detectedEntity !== 'unknown') {
      badge.innerHTML = `<i class="fa-solid fa-check-circle"></i> ${E(detectedEntity)} · ${(confidence * 100).toFixed(0)}%`;
    } else {
      badge.innerHTML = '<i class="fa-solid fa-question-circle"></i> Unknown entity';
    }
  }

  if (reasoningText && reasoning) {
    reasoning.style.display = 'block';
    reasoning.textContent = reasoningText;
  }

  if (warnings.length) {
    const wh = safe$('importWarnings');
    if (wh) {
      wh.innerHTML = warnings.map(w =>
        `<div class="import-warning"><i class="fa-solid fa-triangle-exclamation"></i> ${E(w)}</div>`
      ).join('');
    }
  }

  renderImportMapping();
  renderImportPreview();
  renderImportSummary();
}

function setText(id, txt) {
  const el = safe$ (id);
  if (el) el.textContent = txt;
}

/* ═══════════════════════════════════════════════════════════════
   MAPPING UI
   ═══════════════════════════════════════════════════════════════ */
let _mappingBound = false;

function renderImportMapping() {
  const host = safe$('importMappingList');
  if (!host) return;
  const { headers, mapping, entity } = importState;
  const options = FIELD_OPTIONS[entity] || [];

  host.innerHTML = headers.map(h => {
    const current = mapping[h] || '';
    const opts = ['<option value="">— Skip —</option>']
      .concat(options.map(f => `<option value="${q(f)}" ${f === current ? 'selected' : ''}>${E(f)}</option>`))
      .join('');
    const cls = current ? '' : 'unmapped';
    return `<div class="import-mapping-row">
      <span class="csv-col">${E(h)}</span>
      <span class="arrow"><i class="fa-solid fa-arrow-right"></i></span>
      <select data-header="${E(h)}" class="${cls}">${opts}</select>
    </div>`;
  }).join('');

  if (!_mappingBound) {
    _mappingBound = true;
    host.addEventListener('change', (e) => {
      const sel = e.target;
      if (!sel || sel.tagName !== 'SELECT') return;
      const header = sel.dataset.header;
      const val = sel.value;
      if (!header) return;
      if (val) {
        importState.mapping[header] = val;
        sel.classList.remove('unmapped');
      } else {
        delete importState.mapping[header];
        sel.classList.add('unmapped');
      }
      renderImportPreview();
      renderImportSummary();
    });
  }
}

function renderImportPreview() {
  const host = safe$('importPreviewTable');
  if (!host) return;
  const { headers, rows, mapping } = importState;
  if (!rows.length) { host.innerHTML = ''; return; }

  const preview = rows.slice(0, 10);
  const truncated = rows.length > preview.length;

  host.innerHTML = `<table>
    <thead><tr>${headers.map(h => `<th>${E(h)}${mapping[h] ? ` <span style="color:var(--accent-blue);font-weight:400;">→ ${E(mapping[h])}</span>` : ''}</th>`).join('')}</tr></thead>
    <tbody>${preview.map(r => `<tr>${headers.map(h => `<td>${E(String(r[h] ?? '').slice(0, 40))}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>${truncated ? `<div style="font-size:.72rem;color:var(--text-light);padding:6px 0;">Showing first ${preview.length} of ${rows.length.toLocaleString()} rows.</div>` : ''}`;
}

function renderImportSummary() {
  const host = safe$('importSummary');
  if (!host) return;
  const { rows, mapping, entity } = importState;

  const mappedCols = Object.keys(mapping).length;
  const totalCols = Object.keys(mapping).length + Math.max(0, importState.headers.length - Object.keys(mapping).length);
  const skippedCols = Math.max(0, importState.headers.length - mappedCols);

  const required = REQUIRED_FIELDS[entity] || [];
  // Reverse mapping: field -> header
  const fieldToHeader = {};
  for (const [h, f] of Object.entries(mapping)) {
    if (f && !fieldToHeader[f]) fieldToHeader[f] = h;
  }
  const missingRequired = required.filter(f => !fieldToHeader[f]);
  const mappedRequiredHeaders = required.map(f => fieldToHeader[f]).filter(Boolean);

  let validRows = 0;
  if (!missingRequired.length) {
    for (const r of rows) {
      let ok = true;
      for (const h of mappedRequiredHeaders) {
        if (String(r[h] ?? '').trim().length === 0) { ok = false; break; }
      }
      if (ok) validRows++;
    }
  }
  const invalidRows = missingRequired.length ? rows.length : (rows.length - validRows);

  const missingHtml = missingRequired.length
    ? `<div class="import-warning" style="margin-top:8px;"><i class="fa-solid fa-triangle-exclamation"></i> Required field${missingRequired.length > 1 ? 's' : ''} not mapped: <strong>${missingRequired.map(E).join(', ')}</strong></div>`
    : '';

  host.innerHTML = `
    <div class="cell"><div class="lbl">Entity</div><div class="val" style="font-size:.85rem;">${E(entity || 'unknown')}</div></div>
    <div class="cell"><div class="lbl">Total</div><div class="val">${rows.length.toLocaleString()}</div></div>
    <div class="cell"><div class="lbl">Mapped</div><div class="val">${mappedCols}</div></div>
    <div class="cell"><div class="lbl">Skipped</div><div class="val">${skippedCols}</div></div>
    <div class="cell"><div class="lbl">Ready</div><div class="val" style="color:var(--accent-green);">${validRows.toLocaleString()}</div></div>
    <div class="cell"><div class="lbl">Invalid</div><div class="val" style="color:${invalidRows > 0 ? 'var(--accent-gold)' : 'var(--text-light)'};">${invalidRows.toLocaleString()}</div></div>
    ${missingHtml}`;

  const btn = safe$('importConfirmBtn');
  if (btn) btn.disabled = mappedCols === 0 || validRows === 0 || missingRequired.length > 0;
}

/* ═══════════════════════════════════════════════════════════════
   TRANSFORMS
   ═══════════════════════════════════════════════════════════════ */
function applyTransform(value, transform) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  switch (transform) {
    case 'normalize_phone': {
      // Strip non-digits, keep leading +
      const hasPlus = /^\+/.test(v);
      let c = v.replace(/[^0-9]/g, '');
      // Kenyan local format: 07XX or 01XX -> 2547XX or 2541XX
      if (c.startsWith('0') && (c.length === 10)) c = '254' + c.slice(1);
      else if (c.length === 9) c = '254' + c;
      return (hasPlus ? '+' : '') + c;
    }
    case 'parse_number': {
      // Handle $, commas, spaces; reject letter suffixes (M, K, B) to avoid silent data loss
      const cleaned = v.replace(/[,\s$€£]/g, '');
      const n = parseFloat(cleaned);
      if (!Number.isFinite(n)) return '';
      return String(n);
    }
    case 'parse_date': {
      // Try ISO first, then common formats
      let d = null;
      const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
      if (!d || isNaN(d.getTime())) {
        const dmy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
        if (dmy) {
          const day = +dmy[1], mon = +dmy[2], yr = +dmy[3] < 100 ? 2000 + +dmy[3] : +dmy[3];
          d = new Date(Date.UTC(yr, mon - 1, day));
        }
      }
      if (!d || isNaN(d.getTime())) {
        const parsed = new Date(v);
        if (!isNaN(parsed.getTime())) d = parsed;
      }
      return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
    }
    case 'titlecase': return v.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
    case 'lowercase': return v.toLowerCase();
    case 'uppercase': return v.toUpperCase();
    case 'trim':      return v;
    default: return v;
  }
}

function looksLikeEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
}

/* ═══════════════════════════════════════════════════════════════
   RECORD BUILDER
   ═══════════════════════════════════════════════════════════════ */
function buildImportRecord(row) {
  const { mapping, transforms, entity } = importState;
  const rec = {};
  for (const csvCol in mapping) {
    const targetField = mapping[csvCol];
    if (!targetField) continue;
    const raw = row[csvCol];
    const transform = transforms[targetField];
    const value = transform ? applyTransform(raw, transform) : String(raw ?? '').trim();
    rec[targetField] = value;
  }

  // Entity-specific finalisation
  if (entity === 'clients') {
    rec.type = 'client';
    rec.clientType = rec.clientType || 'Enterprise';
    rec.caseFees = num(rec.caseFees);
    rec.installments = [];
    rec.documents = [];
    rec.avatar = null;
    rec.clientId = 'CL-' + safeUid().slice(-8).toUpperCase();
    if (rec.email && !looksLikeEmail(rec.email)) delete rec.email;
    if (rec.phone) rec.phone = String(rec.phone).replace(/\s+/g, '');
  } else if (entity === 'employees') {
    rec.type = 'employee';
    rec.payRate = num(rec.payRate);
    rec.leaveBalance = 21;
    if (rec.email && !looksLikeEmail(rec.email)) delete rec.email;
  } else if (entity === 'inventory') {
    rec.qty = parseInt(rec.qty, 10) || 0;
    rec.reorder = parseInt(rec.reorder, 10) || 0;
    rec.cost = num(rec.cost);
    rec.price = num(rec.price);
  } else if (entity === 'expenses') {
    rec.amount = num(rec.amount);
    rec.date = rec.date || safeToday();
    rec.status = rec.status || 'Pending';
  } else if (entity === 'deals') {
    rec.value = num(rec.value);
    rec.stage = rec.stage || 'Quote Sent';
    rec.terms = rec.terms || 'Net 30';
  } else if (entity === 'products') {
    rec.price = num(rec.price);
    rec.tags = typeof rec.tags === 'string'
      ? rec.tags.split(',').map(s => s.trim()).filter(Boolean)
      : (Array.isArray(rec.tags) ? rec.tags : []);
    rec.status = rec.status || 'active';
    // Products use their own id from the file, sanitised
    const slug = String(rec.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    rec.id = slug || 'prod-' + safeUid().slice(-8);
  } else {
    // leads, projects, invoices — keep the generated id
    rec.id = safeUid();
  }
  // Ensure every entity has an id
  if (!rec.id) rec.id = safeUid();

  rec.createdAt = new Date().toISOString();
  rec._imported = true;
  rec._importedBy = D.state?.operator?.email || 'unknown';
  rec._importSource = importState.fileName;
  return rec;
}

/* ═══════════════════════════════════════════════════════════════
   CONFIRM IMPORT
   ═══════════════════════════════════════════════════════════════ */
async function confirmImport() {
  const btn = safe$('importConfirmBtn');
  const origBtnHtml = btn ? btn.innerHTML : '';
  const setBtnState = (disabled, html) => {
    if (!btn) return;
    btn.disabled = disabled;
    if (html != null) btn.innerHTML = html;
  };

  setBtnState(true, '<i class="fa-solid fa-spinner fa-spin"></i> Importing…');

  try {
    const { entity, rows, fileName, raw } = importState;
    if (!entity || entity === 'unknown') {
      safeToast('Cannot import without detected entity', 'error');
      return;
    }
    const collection = COLLECTION_MAP[entity];
    if (!collection) {
      safeToast('Unsupported entity', 'error');
      return;
    }

    // Build all records up-front so we can dedupe and validate in one pass
    const records = [];
    const required = REQUIRED_FIELDS[entity] || [];
    let skipped = 0;

    for (const row of rows) {
      if (_abortRequested) break;
      const rec = buildImportRecord(row);
      let ok = true;
      for (const f of required) {
        if (rec[f] == null || String(rec[f]).trim() === '') { ok = false; break; }
      }
      if (!ok) { skipped++; continue; }
      records.push(rec);
    }

    // Deduplicate within this batch by the entity's natural key
    const dedupedRecords = dedupeRecords(entity, records);
    const dupesInFile = records.length - dedupedRecords.length;

    // Batch write with concurrency cap
    let imported = 0;
    let failed = 0;
    for (let i = 0; i < dedupedRecords.length; i += IMPORT_CONCURRENCY) {
      if (_abortRequested) break;
      const batch = dedupedRecords.slice(i, i + IMPORT_CONCURRENCY);
      const results = await Promise.allSettled(batch.map(rec =>
        Promise.resolve(D.upsertDoc(collection, rec))
      ));
      for (const r of results) {
        if (r.status === 'fulfilled') imported++;
        else { failed++; console.warn('import row failed', r.reason); }
      }
      // Progress feedback for large imports
      if (dedupedRecords.length > 100 && imported % 100 === 0) {
        const pct = Math.round((imported / dedupedRecords.length) * 100);
        setBtnState(true, `<i class="fa-solid fa-spinner fa-spin"></i> Importing… ${pct}%`);
      }
    }

    skipped += failed;
    skipped += dupesInFile;

    // Archive the source document — only if we have base64 and file wasn't too big
    if (raw && raw.rawBase64 && imported > 0) {
      try {
        await D.upsertDoc('documents', {
          id: safeUid(),
          title: `Smart Import — ${String(fileName).slice(0, 200)}`,
          system: 'Admin',
          category: 'Import Source',
          parentId: null,
          parentName: `Imported ${imported} ${entity}`,
          fileName: String(fileName).slice(0, 200),
          mime: raw.file?.type || 'application/octet-stream',
          size: raw.file?.size || 0,
          data: raw.rawBase64,
          uploadedAt: new Date().toISOString(),
          importedEntity: entity,
          importedCount: imported
        });
      } catch (e) {
        console.warn('[import] source archive failed', e);
      }
    }

    // Log + notify
    try {
      if (typeof D.logActivity === 'function') {
        await D.logActivity('upload', 'Smart Import completed',
          `${imported} ${entity} imported from ${fileName}, ${skipped} skipped`);
      }
    } catch (e) {}

    const parts = [`✅ Imported ${imported} ${entity}.`];
    if (skipped > 0) parts.push(`${skipped} skipped.`);
    if (dupesInFile > 0) parts.push(`${dupesInFile} duplicate${dupesInFile > 1 ? 's' : ''} in file.`);
    safeToast(parts.join(' '), 'success');

    // Refresh UI
    try { if (typeof D.renderAll === 'function') D.renderAll(); } catch (e) {}

    // Reset state
    importState = createEmptyImportState();
    const wiz = safe$('importWizard');
    if (wiz) wiz.style.display = 'none';
  } catch (e) {
    console.warn('[import] confirmImport failed', e);
    safeToast('Import failed: ' + (e?.message || e), 'error');
  } finally {
    _abortRequested = false;
    setBtnState(false, origBtnHtml || '<i class="fa-solid fa-check"></i> Confirm');
  }
}

/* Deduplicate records within an import batch */
function dedupeRecords(entity, records) {
  const seen = new Set();
  const out = [];
  for (const rec of records) {
    let key;
    if (entity === 'clients')  key = (rec.email || '').toLowerCase() || (rec.phone || '') || rec.name.toLowerCase();
    else if (entity === 'employees') key = (rec.email || '').toLowerCase() || rec.name.toLowerCase();
    else if (entity === 'leads') key = (rec.email || '').toLowerCase() || (rec.phone || '') || rec.fullName.toLowerCase();
    else if (entity === 'inventory') key = String(rec.sku || '').toLowerCase() || rec.name.toLowerCase();
    else if (entity === 'products') key = String(rec.id || '').toLowerCase();
    else if (entity === 'deals') key = String(rec.title || '').toLowerCase();
    else if (entity === 'projects') key = String(rec.projectNumber || rec.title || '').toLowerCase();
    else if (entity === 'invoices') key = String(rec.number || '').toLowerCase();
    else if (entity === 'expenses') key = `${rec.vendor}|${rec.amount}|${rec.date}`;
    else key = rec.id;

    if (!key) { out.push(rec); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rec);
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════
   ABORT CONTROL (public)
   ═══════════════════════════════════════════════════════════════ */
export function abortImport() {
  _abortRequested = true;
}

export function getImportState() {
  // Return a shallow copy so callers can inspect but not mutate
  return { ...importState, rows: importState.rows.slice(), headers: importState.headers.slice() };
}
