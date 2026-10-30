/* ═══════════════════════════════════════════════════════════════
   VIORA — COMMAND PALETTE SUBSYSTEM  (hardened + perf-tuned)
   Extracted from main.js
   Handles: the Ctrl+K palette, natural-language search,
            structured filter application, result rendering.
   Depends on injected deps — see initCommandPalette()
   ═══════════════════════════════════════════════════════════════ */

let D = {
  $: null, state: null, escapeHtml: null, callFn: null,
  navigate: null,
  openClient360: null,
};

/* ── Module state (single source of truth) ── */
let _els = null;                // { palette, input, results, spinner }
let _resultNodes = null;        // NodeList of .cmd-result[data-idx]

let cmdPaletteOpen    = false;
let cmdSelectedIdx    = 0;
let cmdCurrentResults = [];
let cmdCurrentEntity  = null;

let _queryToken       = 0;
let _wired            = false;
let _abortController  = null;   // per-query, allows cancel on close
let _debounceTimer    = null;   // module-level so close() can always cancel
let _focusTimer       = null;

/* Host-bound handlers (kept so we can remove on re-init) */
let _onDocumentKeydown = null;
let _onPaletteClick    = null;
let _onResultsClick    = null;
let _onInput           = null;
let _onInputKeydown    = null;

/* ═══════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════ */
export function initCommandPalette(d) {
  D = { ...D, ...d };

  // Tear down any previous wiring before resetting.
  _teardownListeners();

  _els = null;
  _resultNodes = null;
  _queryToken = 0;
  _wired = false;
  _abortController = null;
  _debounceTimer = null;
  _focusTimer = null;
  cmdPaletteOpen = false;
  cmdSelectedIdx = 0;
  cmdCurrentResults = [];
  cmdCurrentEntity = null;
}

/* ═══════════════════════════════════════════════════════════
   SAFE ESCAPE
   ═══════════════════════════════════════════════════════════ */
function _esc(s) {
  try {
    const f = D.escapeHtml;
    if (typeof f === 'function') {
      const out = f(s);
      return typeof out === 'string' ? out : String(out == null ? '' : out);
    }
  } catch (_) { /* fall through to fallback */ }
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ═══════════════════════════════════════════════════════════
   DOM RESOLUTION
   ═══════════════════════════════════════════════════════════ */
function _ensureEls() {
  if (_els && _els.palette && _els.palette.isConnected) return _els;
  const $ = D.$;
  if (typeof $ !== 'function') return null;
  const palette = $('cmdPalette');
  if (!palette) return null;
  _els = {
    palette,
    input:   $('cmdInput'),
    results: $('cmdResults'),
    spinner: $('cmdSpinner'),
  };
  // If the cached nodes were replaced (e.g. re-render), drop stale refs.
  _resultNodes = null;
  return _els;
}

/* ═══════════════════════════════════════════════════════════
   OPEN / CLOSE
   ═══════════════════════════════════════════════════════════ */
export function openCmdPalette() {
  const els = _ensureEls();
  if (!els || !els.palette) return;
  cmdPaletteOpen = true;
  els.palette.classList.add('active');

  if (_focusTimer) clearTimeout(_focusTimer);
  _focusTimer = setTimeout(() => {
    _focusTimer = null;
    if (cmdPaletteOpen && els.input && els.input.isConnected) {
      els.input.focus();
    }
  }, 60);
}

export function closeCmdPalette() {
  const wasOpen = cmdPaletteOpen;
  cmdPaletteOpen = false;

  // Invalidate in-flight queries and cancel the network call.
  _queryToken++;
  if (_abortController) {
    try { _abortController.abort(); } catch (_) {}
    _abortController = null;
  }
  if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
  if (_focusTimer)    { clearTimeout(_focusTimer);    _focusTimer = null; }

  const els = _ensureEls();
  if (els) {
    if (els.palette) els.palette.classList.remove('active');
    if (els.input)   els.input.value = '';
    if (els.results && wasOpen) {
      els.results.innerHTML =
        '<div class="cmd-result">' +
          '<div class="cmd-icon"><i class="fa-solid fa-lightbulb"></i></div>' +
          '<div class="cmd-body">' +
            '<div class="cmd-title">Type a natural language query</div>' +
            '<div class="cmd-sub">e.g. &quot;clients with balance over 100k&quot;</div>' +
          '</div>' +
        '</div>';
    }
  }

  cmdCurrentResults = [];
  cmdCurrentEntity  = null;
  cmdSelectedIdx    = 0;
  _resultNodes      = null;
}

/* ═══════════════════════════════════════════════════════════
   QUERY
   ═══════════════════════════════════════════════════════════ */
async function runCmdQuery() {
  const els = _ensureEls();
  if (!els || !els.input) return;

  const q = els.input.value.trim();
  if (q.length < 3) {
    // Clear stale results when query shrinks below threshold.
    cmdCurrentResults = [];
    cmdCurrentEntity = null;
    cmdSelectedIdx = 0;
    _resultNodes = null;
    if (els.results) {
      els.results.innerHTML =
        '<div class="cmd-result">' +
          '<div class="cmd-icon"><i class="fa-solid fa-lightbulb"></i></div>' +
          '<div class="cmd-body">' +
            '<div class="cmd-title">Keep typing…</div>' +
            '<div class="cmd-sub">Enter at least 3 characters</div>' +
          '</div>' +
        '</div>';
    }
    return;
  }

  const myToken = ++_queryToken;

  // Cancel any previous in-flight request.
  if (_abortController) {
    try { _abortController.abort(); } catch (_) {}
  }
  _abortController = (typeof AbortController === 'function')
    ? new AbortController()
    : null;

  if (els.spinner) els.spinner.style.display = 'inline-block';

  let res = null;
  try {
    const state = D.state;
    const dataKeys = (state && state.data) ? Object.keys(state.data) : [];
    const args = { query: q, entities: dataKeys };
    if (_abortController) args.signal = _abortController.signal;
    res = await D.callFn('searchQuery', args);
  } catch (e) {
    // AbortError is expected on cancel — swallow quietly.
    if (!e || e.name !== 'AbortError') {
      console.warn('[cmd] query failed', e);
    }
  } finally {
    if (els.spinner && els.spinner.isConnected) {
      els.spinner.style.display = 'none';
    }
  }

  // Stale or closed?
  if (myToken !== _queryToken || !cmdPaletteOpen) return;
  if (!res || typeof res !== 'object') return;

  let results;
  try {
    results = applyStructuredFilter(res);
  } catch (e) {
    console.warn('[cmd] filter failed', e);
    results = [];
  }

  // Re-check after synchronous filter work.
  if (myToken !== _queryToken || !cmdPaletteOpen) return;

  cmdCurrentResults = Array.isArray(results) ? results : [];
  cmdCurrentEntity  = (typeof res.entity === 'string') ? res.entity : null;
  cmdSelectedIdx    = 0;
  renderCmdResults(res, cmdCurrentResults);
}

/* ═══════════════════════════════════════════════════════════
   FILTER ENGINE
   ═══════════════════════════════════════════════════════════ */
function makeGetter(path) {
  const parts = String(path).split('.');
  if (parts.length === 1) {
    const k = parts[0];
    return (o) => (o == null ? undefined : o[k]);
  }
  return (o) => {
    let cur = o;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  };
}

function normalizeOp(op) {
  if (op != null && typeof op === 'object' && 'op' in op) return op;
  return { op: '=', value: op };
}

function makeMatcher(op) {
  const v = op.value;
  switch (op.op) {
    case '=':          return (val) => String(val) === String(v);
    case '!=':         return (val) => String(val) !== String(v);
    case '>':          return (val) => { const n = _num(val); return n != null && n >  _num(v); };
    case '<':          return (val) => { const n = _num(val); return n != null && n <  _num(v); };
    case '>=':         return (val) => { const n = _num(val); return n != null && n >= _num(v); };
    case '<=':         return (val) => { const n = _num(val); return n != null && n <= _num(v); };
    case 'contains':   return (val) => String(val == null ? '' : val).toLowerCase().includes(String(v == null ? '' : v).toLowerCase());
    case 'startsWith': return (val) => String(val == null ? '' : val).toLowerCase().startsWith(String(v == null ? '' : v).toLowerCase());
    case 'in':         return (val) => Array.isArray(v) && v.includes(val);
    default:           return () => true;
  }
}

function applyStructuredFilter(spec) {
  if (!spec || typeof spec !== 'object') return [];
  const entity = spec.entity;
  if (typeof entity !== 'string') return [];

  const state = D.state;
  const raw = (state && state.data) ? state.data[entity] : null;
  if (!Array.isArray(raw)) return [];

  const filters = (spec.filters && typeof spec.filters === 'object') ? spec.filters : null;
  const filterKeys = filters ? Object.keys(filters) : null;

  let getters = null, matchers = null;
  if (filterKeys && filterKeys.length) {
    getters  = new Array(filterKeys.length);
    matchers = new Array(filterKeys.length);
    for (let i = 0; i < filterKeys.length; i++) {
      getters[i]  = makeGetter(filterKeys[i]);
      matchers[i] = makeMatcher(normalizeOp(filters[filterKeys[i]]));
    }
  }

  // Single-pass filter.
  let arr = raw;
  if (getters) {
    const n = getters.length;
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      let ok = true;
      for (let j = 0; j < n; j++) {
        if (!matchers[j](getters[j](item))) { ok = false; break; }
      }
      if (ok) out.push(item);
    }
    arr = out;
  }

  // Sort.
  const sort = spec.sort;
  if (sort && typeof sort === 'object' && typeof sort.field === 'string') {
    const get = makeGetter(sort.field);
    const dir = sort.dir === 'desc' ? -1 : 1;
    arr = arr.slice().sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;          // nulls last
      if (bv == null) return -1;
      if (av > bv) return dir;
      if (av < bv) return -dir;
      return 0;
    });
  }

  const limit = (Number.isFinite(spec.limit) && spec.limit > 0) ? spec.limit : 50;
  return arr.length > limit ? arr.slice(0, limit) : arr;
}

/* ═══════════════════════════════════════════════════════════
   RENDER
   ═══════════════════════════════════════════════════════════ */
const ICON_MAP = {
  entities: 'fa-users', leads: 'fa-user-plus', deals: 'fa-handshake',
  invoices: 'fa-file-invoice', projects: 'fa-folder', tasks: 'fa-calendar-check',
  expenses: 'fa-money-bill-transfer', payroll: 'fa-money-check-dollar',
  inventory: 'fa-boxes-stacked', compliance: 'fa-scale-balanced',
  documents: 'fa-file', proposals: 'fa-wand-magic-sparkles',
  campaigns: 'fa-bullhorn', contracts: 'fa-file-signature',
  worklogs: 'fa-clock', payments: 'fa-money-bill-wave', ledger: 'fa-book',
  appointments: 'fa-calendar-check', presentations: 'fa-chalkboard-user',
  products: 'fa-store', orders: 'fa-receipt',
};

const ROUTE_MAP = {
  entities: 'sales-clients', leads: 'marketing-leads', deals: 'sales-deals',
  invoices: 'fin-invoices', projects: 'ops-projects', tasks: 'ops-tasks',
  expenses: 'fin-expenses', payroll: 'fin-payroll', inventory: 'ops-inventory',
  compliance: 'admin-compliance', documents: 'documents', proposals: 'sales-proposals',
  campaigns: 'marketing-campaigns', contracts: 'sales-contracts',
  worklogs: 'ops-worklogs', payments: 'fin-payments', ledger: 'ledger',
  appointments: 'marketing-appointments', presentations: 'marketing-presentations',
  products: 'marketplace-products', orders: 'marketplace-orders',
};

function iconForEntity(e) { return ICON_MAP[e] || 'fa-circle'; }

function titleFor(item) {
  if (item == null) return 'Record';
  if (typeof item !== 'object') return String(item);
  return item.name || item.fullName || item.title || item.number
      || item.vendor || item.sku || item.id || 'Record';
}

function subFor(item) {
  if (item == null || typeof item !== 'object') return '';
  const parts = [];
  if (item.email)  parts.push(item.email);
  if (item.phone)  parts.push(item.phone);
  const amt = _num(item.amount);
  if (amt != null) parts.push('KSh ' + amt.toLocaleString());
  const val = _num(item.value);
  if (val != null) parts.push('KSh ' + val.toLocaleString());
  if (item.status) parts.push(item.status);
  if (item.stage)  parts.push(item.stage);
  if (parts.length) return parts.join(' · ');
  return (item.id && String(item.id).slice(0, 10)) || '';
}

function renderCmdResults(spec, results) {
  const els = _ensureEls();
  if (!els || !els.results || !els.results.isConnected) return;
  const host = els.results;

  const rawEntity = spec && spec.entity;
  const entity = (typeof rawEntity === 'string' && /^[a-zA-Z0-9_]+$/.test(rawEntity))
    ? rawEntity
    : '';
  const explanation = (spec && typeof spec.explanation === 'string')
    ? spec.explanation
    : `${results.length} result(s) from ${entity || 'search'}`;

  if (!results.length) {
    host.innerHTML =
      '<div class="cmd-result">' +
        '<div class="cmd-icon" style="background:rgba(148,163,184,.15);color:var(--text-light);">' +
          '<i class="fa-solid fa-inbox"></i>' +
        '</div>' +
        '<div class="cmd-body">' +
          '<div class="cmd-title">No matches</div>' +
          '<div class="cmd-sub">' + _esc(explanation) + '</div>' +
        '</div>' +
      '</div>';
    _resultNodes = null;
    return;
  }

  const icon = iconForEntity(entity);
  const safeEntity = _esc(entity);
  const safeExpl   = _esc(explanation);

  let html =
    '<div class="cmd-result" style="background:var(--bg-table-alt);cursor:default;">' +
      '<div class="cmd-icon" style="background:rgba(0,212,255,.15);color:var(--accent-blue);">' +
        '<i class="fa-solid fa-wand-magic-sparkles"></i>' +
      '</div>' +
      '<div class="cmd-body">' +
        '<div class="cmd-title">' + safeExpl + '</div>' +
        '<div class="cmd-sub">Entity: ' + safeEntity + ' · ' + results.length + ' result(s)</div>' +
      '</div>' +
    '</div>';

  for (let i = 0; i < results.length; i++) {
    const t = String(titleFor(results[i]));
    const title = _esc(t.length > 60 ? t.slice(0, 59) + '…' : t);
    const sub = _esc(subFor(results[i]));
    html +=
      '<div class="cmd-result' + (i === 0 ? ' selected' : '') + '"' +
        ' data-idx="' + i + '"' +
        ' data-entity="' + safeEntity + '">' +
        '<div class="cmd-icon"><i class="fa-solid ' + icon + '"></i></div>' +
        '<div class="cmd-body">' +
          '<div class="cmd-title">' + title + '</div>' +
          '<div class="cmd-sub">' + sub + '</div>' +
        '</div>' +
      '</div>';
  }
  host.innerHTML = html;
  _resultNodes = host.querySelectorAll('.cmd-result[data-idx]');
}

/* ═══════════════════════════════════════════════════════════
   OPEN RESULT
   ═══════════════════════════════════════════════════════════ */
function openCmdResult(entity, item) {
  if (item == null) return;
  const safeEntity = (typeof entity === 'string') ? entity : null;

  closeCmdPalette();

  if (!safeEntity) return;
  const route = ROUTE_MAP[safeEntity];
  if (route && typeof D.navigate === 'function') {
    try { D.navigate(route); } catch (e) { console.warn('[cmd] navigate failed', e); }
  }
  if (safeEntity === 'entities'
      && item.type === 'client'
      && typeof D.openClient360 === 'function'
      && item.id != null) {
    setTimeout(() => {
      try { D.openClient360(item.id); } catch (e) { console.warn('[cmd] openClient360 failed', e); }
    }, 200);
  }
}

/* ═══════════════════════════════════════════════════════════
   HIGHLIGHT
   ═══════════════════════════════════════════════════════════ */
function highlightCmd() {
  const nodes = _resultNodes;
  if (!nodes || !nodes.length) return;
  if (cmdSelectedIdx < 0) cmdSelectedIdx = 0;
  if (cmdSelectedIdx >= nodes.length) cmdSelectedIdx = nodes.length - 1;
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].classList.toggle('selected', i === cmdSelectedIdx);
  }
  const sel = nodes[cmdSelectedIdx];
  if (sel && typeof sel.scrollIntoView === 'function') {
    sel.scrollIntoView({ block: 'nearest' });
  }
}

/* ═══════════════════════════════════════════════════════════
   LISTENER MANAGEMENT (idempotent setup)
   ═══════════════════════════════════════════════════════════ */
function _teardownListeners() {
  if (typeof document !== 'undefined' && _onDocumentKeydown) {
    document.removeEventListener('keydown', _onDocumentKeydown);
  }
  if (_els) {
    if (_els.palette && _onPaletteClick) _els.palette.removeEventListener('click', _onPaletteClick);
    if (_els.results && _onResultsClick) _els.results.removeEventListener('click', _onResultsClick);
    if (_els.input) {
      if (_onInput)        _els.input.removeEventListener('input', _onInput);
      if (_onInputKeydown) _els.input.removeEventListener('keydown', _onInputKeydown);
    }
  }
  _onDocumentKeydown = _onPaletteClick = _onResultsClick = _onInput = _onInputKeydown = null;
}

/* ═══════════════════════════════════════════════════════════
   SETUP
   ═══════════════════════════════════════════════════════════ */
export function setupCommandPalette() {
  if (_wired) return;
  const els = _ensureEls();
  if (!els || !els.palette || !els.input || !els.results) return;

  /* Click-outside to close */
  _onPaletteClick = (e) => {
    if (e.target === els.palette) closeCmdPalette();
  };
  els.palette.addEventListener('click', _onPaletteClick);

  /* Result clicks — delegated. */
  _onResultsClick = (e) => {
    const el = e.target && e.target.closest && e.target.closest('.cmd-result[data-idx]');
    if (!el) return;
    const idx = +el.getAttribute('data-idx');
    if (!Number.isFinite(idx)) return;
    const item = cmdCurrentResults[idx];
    if (!item) return;
    openCmdResult(cmdCurrentEntity, item);
  };
  els.results.addEventListener('click', _onResultsClick);

  /* Typing → debounced query. */
  _onInput = () => {
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
    _debounceTimer = setTimeout(() => {
      _debounceTimer = null;
      if (!cmdPaletteOpen) return;
      const v = els.input ? els.input.value.trim() : '';
      if (v.length >= 3) runCmdQuery();
      else if (v.length === 0) {
        // Reset to hint state.
        cmdCurrentResults = [];
        cmdCurrentEntity = null;
        cmdSelectedIdx = 0;
        _resultNodes = null;
      }
    }, 350);
  };
  els.input.addEventListener('input', _onInput);

  /* Keyboard nav within the input. */
  _onInputKeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
      if (cmdCurrentResults.length && cmdCurrentEntity) {
        const item = cmdCurrentResults[cmdSelectedIdx] || cmdCurrentResults[0];
        if (item) openCmdResult(cmdCurrentEntity, item);
      } else {
        runCmdQuery();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!cmdCurrentResults.length) return;
      cmdSelectedIdx = Math.min(cmdSelectedIdx + 1, cmdCurrentResults.length - 1);
      highlightCmd();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!cmdCurrentResults.length) return;
      cmdSelectedIdx = Math.max(cmdSelectedIdx - 1, 0);
      highlightCmd();
      return;
    }
  };
  els.input.addEventListener('keydown', _onInputKeydown);

  /* Global hotkey. */
  _onDocumentKeydown = (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      // Don't hijack Ctrl+K inside inputs/textareas/contenteditable.
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      const isEditable = tag === 'input' || tag === 'textarea' || (t && t.isContentEditable);
      if (isEditable && !cmdPaletteOpen) return;

      e.preventDefault();
      if (cmdPaletteOpen) closeCmdPalette(); else openCmdPalette();
    } else if (e.key === 'Escape' && cmdPaletteOpen) {
      e.preventDefault();
      closeCmdPalette();
    }
  };
  document.addEventListener('keydown', _onDocumentKeydown);

  _wired = true;
}
