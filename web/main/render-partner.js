// main/render-partner.js
// ═══════════════════════════════════════════════════════════════
// Partner UI Rendering — v2.0 (bug-fixed)
//
// Critical fix vs v6.9:
//   setHtmlIfChanged() previously returned true/false but never
//   assigned el.innerHTML. Every partner tab silently rendered
//   empty because of this. Fixed by delegating to renderIfChanged()
//   which actually writes the HTML.
//
// All deps are read lazily via ctx(); nothing captures a stale
// reference at module load time.
// ═══════════════════════════════════════════════════════════════

let _ctx = null;

export function initRenderPartner(ctx) {
  _ctx = Object.assign(_ctx || {}, ctx || {});
}

function C() { return _ctx || {}; }

/* ── Safe accessors ── */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const _esc = (s) => {
  const c = C();
  if (typeof c.escapeHtml === 'function') {
    try { return c.escapeHtml(s); } catch (_) {}
  }
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

const q = (s) => String(s == null ? '' : s)
  .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;')
  .replace(/</g, '\\x3c');

const safe$ = (id) => {
  const c = C();
  if (typeof c.$ === 'function') { try { return c.$(id); } catch (_) {} }
  return typeof document !== 'undefined' ? document.getElementById(id) : null;
};

const safeState = () => C().state || { data: {} };
const safeData  = () => safeState().data || {};

const safeFn = (name, fallback) => {
  const c = C();
  if (typeof c[name] === 'function') {
    return (...args) => { try { return c[name](...args); } catch (_) { return fallback; } };
  }
  return () => fallback;
};

const fmtKES = (v) => {
  const c = C();
  if (typeof c.fmtKES === 'function') { try { return c.fmtKES(v); } catch (_) {} }
  return 'KES ' + num(v).toLocaleString();
};

const timeAgo = (t) => {
  const c = C();
  if (typeof c.timeAgo === 'function') { try { return c.timeAgo(t); } catch (_) {} }
  return t ? String(t) : '—';
};

const todayStr = () => {
  const c = C();
  if (typeof c.todayStr === 'function') { try { return c.todayStr(); } catch (_) {} }
  return new Date().toISOString().slice(0, 10);
};

/* ═══════════════════════════════════════════════════════════════
   CORE CACHE HELPER — actually writes the HTML
   ═══════════════════════════════════════════════════════════════ */
const _htmlCache = new WeakMap();

/**
 * Replaces el.innerHTML ONLY if the signature changed.
 * Returns true if the DOM was mutated.
 *
 * @param {HTMLElement|null} el
 * @param {string} sig      cheap fingerprint of the data
 * @param {string} html     the HTML to write if sig changed
 */
function renderIfChanged(el, sig, html) {
  if (!el || !el.isConnected) return false;
  if (_htmlCache.get(el) === sig) return false;
  _htmlCache.set(el, sig);
  el.innerHTML = html;
  return true;
}

/* Cheap rolling-hash signature. */
function sigOf(arr, fields) {
  if (!Array.isArray(arr) || arr.length === 0) return '0';
  let h = 5381;
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (!o) continue;
    const id = o.id || '';
    for (let j = 0; j < id.length; j++) h = ((h << 5) + h + id.charCodeAt(j)) | 0;
    if (fields) {
      for (let f = 0; f < fields.length; f++) {
        const v = o[fields[f]];
        if (v == null) continue;
        const s = typeof v === 'string' ? v : String(v);
        for (let j = 0; j < s.length; j++) h = ((h << 5) + h + s.charCodeAt(j)) | 0;
      }
    }
  }
  return arr.length + ':' + (h >>> 0).toString(36);
}

/* Valid Date → ISO string, else null. */
function safeIso(v) {
  if (!v) return null;
  const d = new Date(v);
  const t = d.getTime();
  return Number.isFinite(t) ? d.toISOString() : null;
}

/* Badge class whitelist. */
const BADGE_WHITELIST = new Set([
  'paid', 'pending', 'overdue', 'draft', 'active', 'gray',
  'purple', 'sent', 'high', 'medium', 'low'
]);
const safeBadge = (v) => BADGE_WHITELIST.has(String(v)) ? String(v) : 'gray';

/* ═══════════════════════════════════════════════════════════════
   USER OPTIONS DROPDOWN
   ═══════════════════════════════════════════════════════════════ */
const _userOptionsCache = new WeakMap();
let _usersSortedCache = null;
let _usersSortedStamp = '';

function getSortedUsers() {
  const users = safeData().users || [];
  if (!Array.isArray(users)) return [];
  const stamp = users.length + '|' + users.map(u => `${u?.uid || ''}:${u?.name || ''}`).join(',');
  if (_usersSortedCache && stamp === _usersSortedStamp) return _usersSortedCache;

  const sorted = users.slice().sort((a, b) => {
    const an = (a?.name || a?.email || '').toLowerCase();
    const bn = (b?.name || b?.email || '').toLowerCase();
    return an.localeCompare(bn);
  });

  _usersSortedCache = sorted;
  _usersSortedStamp = stamp;
  return sorted;
}

function partnerUserOptions(selectId) {
  const sel = safe$(selectId);
  if (!sel) return;
  const users = getSortedUsers();
  const sig = _usersSortedStamp;

  if (_userOptionsCache.get(sel) === sig) return;
  _userOptionsCache.set(sel, sig);

  const prev = sel.value;
  sel.innerHTML = users
    .map(u => `<option value="${q(u.uid || '')}">${_esc(u.name || u.email || '—')}</option>`)
    .join('');

  if (prev && users.some(u => u.uid === prev)) sel.value = prev;
}

/* ═══════════════════════════════════════════════════════════════
   TASKS
   ═══════════════════════════════════════════════════════════════ */
export function renderPartnerTasks() {
  try {
    partnerUserOptions('partnerTaskUser');
    const uid = safe$('partnerTaskUser')?.value;
    if (!uid) return;

    const raw = safeData().track_tasks?.[uid] || {};
    const list = Object.values(raw)
      .filter(Boolean)
      .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));

    const host = safe$('partnerTasksList');
    if (!host) return;

    if (!list.length) {
      renderIfChanged(host, 'empty',
        '<div class="empty-state" style="grid-column:1/-1;">No tasks.</div>');
      return;
    }

    const uidSafe = q(uid);
    const sig = uid + '|' + sigOf(list, ['title', 'done', 'priority', 'dueDate']);

    const html = list.map(t => {
      const idSafe = q(t.id);
      const priCls = safeBadge(t.priority || 'medium');
      return `<div class="card-3d ${t.done ? 'done' : ''}">
        <div class="card-info">
          <div class="card-title">${_esc(t.title || '')} <span class="badge badge-${priCls}">${_esc(t.priority || 'medium')}</span>${t.done ? ' <span class="badge badge-paid">Done</span>' : ''}</div>
          <div class="card-sub">${_esc(t.category || '')} · Due ${_esc(t.dueDate || '—')} ${_esc(t.dueTime || '')}</div>
          ${t.notes ? `<div class="card-sub">${_esc(t.notes)}</div>` : ''}
        </div>
        <div class="card-actions">
          <button class="btn btn-outline btn-xs" onclick="Viora.deleteTrackItem('tasks','${uidSafe}','${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');

    renderIfChanged(host, sig, html);
  } catch (e) { console.warn('renderPartnerTasks failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   HOURLY LOG
   ═══════════════════════════════════════════════════════════════ */
export function renderPartnerHourly() {
  try {
    partnerUserOptions('partnerHourlyUser');
    const uid = safe$('partnerHourlyUser')?.value;
    const date = safe$('partnerHourlyDate')?.value || todayStr();
    if (!uid) return;

    const all = Object.values(safeData().track_hourly?.[uid] || {});
    const list = all
      .filter(h => h && String(h.key || '').startsWith(date))
      .sort((a, b) => String(a.key || '').localeCompare(String(b.key || '')));

    const host = safe$('partnerHourlyBody');
    if (!host) return;

    const sig = uid + '|' + date + '|' + sigOf(list, ['text', 'category', 'intensity']);

    const html = list.length
      ? list.map(h => {
          const key = String(h.key || '');
          const time = key.length >= 5 ? key.slice(-5) : '';
          return `<tr>
            <td>${_esc(time)}</td>
            <td>${_esc(h.text || '')}</td>
            <td>${_esc(h.category || '')}</td>
            <td>${_esc(h.intensity != null ? h.intensity : '')}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="4" class="empty-state">No logs for this date.</td></tr>';

    renderIfChanged(host, sig, html);
  } catch (e) { console.warn('renderPartnerHourly failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   SCHEDULE
   ═══════════════════════════════════════════════════════════════ */
export function renderPartnerSchedule() {
  try {
    partnerUserOptions('partnerScheduleUser');
    const uid = safe$('partnerScheduleUser')?.value;
    if (!uid) return;

    const list = Object.values(safeData().track_schedule?.[uid] || {})
      .filter(Boolean)
      .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));

    const host = safe$('partnerScheduleList');
    if (!host) return;

    const sig = uid + '|' + sigOf(list, ['title', 'start', 'end', 'type']);

    const html = list.length
      ? list.map(e => `
          <div class="card-3d">
            <div class="card-info">
              <div class="card-title">${_esc(e.title || '')} <span class="badge badge-purple">${_esc(e.type || '')}</span></div>
              <div class="card-sub">${_esc(e.start || '')}${e.end ? ' → ' + _esc(e.end) : ''}${e.location ? ' · ' + _esc(e.location) : ''}</div>
            </div>
          </div>`).join('')
      : '<div class="empty-state" style="grid-column:1/-1;">Nothing scheduled.</div>';

    renderIfChanged(host, sig, html);
  } catch (e) { console.warn('renderPartnerSchedule failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   HANDOFFS
   ═══════════════════════════════════════════════════════════════ */
export function renderPartnerHandoffs() {
  try {
    const data = safeData();
    const list = Object.values(data.track_handoffs || {})
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const host = safe$('partnerHandoffsList');
    if (!host) return;

    if (!list.length) {
      renderIfChanged(host, 'empty',
        '<div class="empty-state" style="grid-column:1/-1;">No handoffs.</div>');
      return;
    }

    const userById = new Map();
    for (const u of (data.users || [])) if (u && u.uid) userById.set(u.uid, u);

    const sig = sigOf(list, ['status', 'title', 'fromUid', 'toUid']);

    const html = list.map(h => {
      const from = userById.get(h.fromUid);
      const to = userById.get(h.toUid);
      const statusCls = h.status === 'done' ? 'paid' : 'pending';
      return `<div class="card-3d">
        <div class="card-info">
          <div class="card-title">${_esc(h.title || '')} <span class="badge badge-${statusCls}">${_esc(h.status || '')}</span></div>
          <div class="card-sub">${_esc(from?.name || '?')} → ${_esc(to?.name || '?')} · ${timeAgo(h.createdAt)}</div>
        </div>
      </div>`;
    }).join('');

    renderIfChanged(host, sig, html);
  } catch (e) { console.warn('renderPartnerHandoffs failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   FINANCIALS
   ═══════════════════════════════════════════════════════════════ */
export function renderPartnerFinancials() {
  try {
    partnerUserOptions('partnerFinanceUser');
    const uid = safe$('partnerFinanceUser')?.value;
    if (!uid) return;

    const fin = safeData().track_financials || {};
    const expenses = Object.values(fin.expenses?.[uid] || {});
    const savings  = Object.values(fin.savings?.[uid] || {});
    const subs     = Object.values(fin.subscriptions?.[uid] || {});

    const sig = uid + '|' +
      sigOf(expenses, ['amount', 'title']) + '|' +
      sigOf(savings, ['current', 'target', 'title']) + '|' +
      sigOf(subs, ['amount', 'name']);

    const kpiHost = safe$('partnerFinanceKpi');
    if (kpiHost) {
      let totalExp = 0, totalSaved = 0, totalTarget = 0, monthlySubs = 0;
      for (const e of expenses) totalExp += num(e.amount);
      for (const g of savings) { totalSaved += num(g.current); totalTarget += num(g.target); }
      for (const s of subs) monthlySubs += num(s.amount);

      const kpiSig = sig + '|kpi';
      const html = `
        <div class="stat-card"><div class="label">Expenses</div><div class="number">${fmtKES(totalExp)}</div></div>
        <div class="stat-card"><div class="label">Saved</div><div class="number">${fmtKES(totalSaved)}</div></div>
        <div class="stat-card"><div class="label">Target</div><div class="number">${fmtKES(totalTarget)}</div></div>
        <div class="stat-card"><div class="label">Subscriptions/mo</div><div class="number">${fmtKES(monthlySubs)}</div></div>`;
      renderIfChanged(kpiHost, kpiSig, html);
    }

    const expHost = safe$('partnerExpensesBody');
    if (expHost) {
      const html = expenses.length
        ? expenses.map(e => `<tr><td>${_esc(e.title || '')}</td><td>${_esc(e.category || '')}</td><td>${fmtKES(e.amount)}</td><td>${_esc(e.date || '')}</td></tr>`).join('')
        : '<tr><td colspan="4" class="empty-state">No expenses.</td></tr>';
      renderIfChanged(expHost, sig + '|exp', html);
    }

    const savHost = safe$('partnerSavingsBody');
    if (savHost) {
      const html = savings.length
        ? savings.map(g => `<tr><td>${_esc(g.title || '')}</td><td>${fmtKES(g.target)}</td><td>${fmtKES(g.current)}</td><td>${_esc(g.deadline || '')}</td></tr>`).join('')
        : '<tr><td colspan="4" class="empty-state">No savings goals.</td></tr>';
      renderIfChanged(savHost, sig + '|sav', html);
    }

    const subHost = safe$('partnerSubsBody');
    if (subHost) {
      const html = subs.length
        ? subs.map(s => `<tr><td>${_esc(s.name || '')}</td><td>${fmtKES(s.amount)}</td><td>${_esc(s.cycle || '')}</td><td>${_esc(s.nextDate || '')}</td></tr>`).join('')
        : '<tr><td colspan="4" class="empty-state">No subscriptions.</td></tr>';
      renderIfChanged(subHost, sig + '|sub', html);
    }
  } catch (e) { console.warn('renderPartnerFinancials failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   ACTIVITIES
   ═══════════════════════════════════════════════════════════════ */
export function renderPartnerActivities() {
  try {
    partnerUserOptions('partnerActivityUser');
    const uid = safe$('partnerActivityUser')?.value;
    if (!uid) return;

    const a = safeData().track_activities?.[uid] || {};
    const today = todayStr();
    const isToday = a.date === today;
    const items = isToday ? (a.items || []) : [];

    const infoHost = safe$('partnerActivityInfo');
    if (infoHost) {
      const infoSig = uid + '|' + (a.date || '') + '|' + (a.theme || '');
      const infoHtml = isToday
        ? `<h4><i class="fa-solid fa-wand-magic-sparkles"></i> Today's Theme: ${_esc(a.theme || '—')}</h4>
           <p style="font-size:.85rem;color:var(--text-secondary);">Generated ${timeAgo(a.generatedAt)} · ${items.length} activities</p>`
        : '<div class="empty-state">No activity plan for today.</div>';
      renderIfChanged(infoHost, infoSig, infoHtml);
    }

    const host = safe$('partnerActivityList');
    if (!host) return;

    const sig = uid + '|' + (a.date || '') + '|' + sigOf(items, ['title', 'hour', 'minute', 'category']);

    const html = items.length
      ? items.map(x => {
          const h = String(num(x.hour)).padStart(2, '0');
          const m = String(num(x.minute)).padStart(2, '0');
          return `<div class="card-3d">
            <div class="card-info">
              <div class="card-title">${h}:${m} — ${_esc(x.title || '')}</div>
              <div class="card-sub">${_esc(x.category || '')} · ${_esc(x.energy || '')} · ${_esc(x.description || '')}</div>
            </div>
          </div>`;
        }).join('')
      : '<div class="empty-state" style="grid-column:1/-1;">No activities.</div>';

    renderIfChanged(host, sig, html);
  } catch (e) { console.warn('renderPartnerActivities failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   CHAT LOG
   ═══════════════════════════════════════════════════════════════ */
export function renderPartnerChat() {
  try {
    const data = safeData();
    const all = Object.values(data.track_chat || {})
      .filter(Boolean)
      .sort((a, b) => num(b.ts) - num(a.ts))
      .slice(0, 200);

    const host = safe$('partnerChatLog');
    if (!host) return;

    if (!all.length) {
      renderIfChanged(host, 'empty',
        '<div class="empty-state">No chat messages.</div>');
      return;
    }

    const userById = new Map();
    for (const u of (data.users || [])) if (u && u.uid) userById.set(u.uid, u);

    const sig = sigOf(all, ['text', 'ts', 'from', 'to']);

    const html = all.map(m => {
      const fromUser = userById.get(m.from);
      const toUser = userById.get(m.to);
      const fromLabel = fromUser?.name || String(m.from || '?').slice(0, 6);
      const toLabel = toUser?.name || String(m.to || '?').slice(0, 6);
      return `<div class="msg-bubble admin" style="max-width:100%;margin-bottom:6px;">
        <div class="who">${_esc(fromLabel)} → ${_esc(toLabel)} · ${timeAgo(m.ts)}</div>
        <div>${_esc(m.text || '')}</div>
      </div>`;
    }).join('');

    renderIfChanged(host, sig, html);
  } catch (e) { console.warn('renderPartnerChat failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   PRESENCE
   ═══════════════════════════════════════════════════════════════ */
export function renderPartnerPresence() {
  try {
    const data = safeData();
    const list = Array.isArray(data.users) ? data.users : [];

    const host = safe$('partnerPresenceList');
    if (!host) return;

    if (!list.length) {
      renderIfChanged(host, 'empty',
        '<div class="empty-state" style="grid-column:1/-1;">No users.</div>');
      return;
    }

    const presenceMap = data.track_presence || {};
    const sig = sigOf(list, ['name', 'email']) + '|' +
      Object.entries(presenceMap)
        .map(([k, v]) => `${k}:${v?.online ? 1 : 0}:${v?.lastSeen || ''}`)
        .join(',');

    const html = list.map(u => {
      const p = presenceMap[u.uid] || {};
      const on = !!p.online;
      const iso = safeIso(p.lastSeen);
      const lastSeenLabel = iso ? timeAgo(iso) : '—';
      const initial = String(u.name || u.email || '?').charAt(0);
      return `<div class="card-3d">
        <div class="avatar-mini lg">${_esc(initial)}</div>
        <div class="card-info">
          <div class="card-title">${_esc(u.name || u.email || '—')}</div>
          <div class="card-sub">
            <span class="badge badge-${on ? 'paid' : 'gray'}">${on ? 'Online' : 'Offline'}</span>
            · Last seen ${lastSeenLabel}
          </div>
        </div>
      </div>`;
    }).join('');

    renderIfChanged(host, sig, html);
  } catch (e) { console.warn('renderPartnerPresence failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   GAMES
   ═══════════════════════════════════════════════════════════════ */
export function renderPartnerGames() {
  try {
    const games = safeData().track_games || {};
    const entries = Object.entries(games).filter(([, g]) => g && typeof g === 'object');

    const host = safe$('partnerGamesList');
    if (!host) return;

    if (!entries.length) {
      renderIfChanged(host, 'empty',
        '<div class="empty-state" style="grid-column:1/-1;">No active games.</div>');
      return;
    }

    const sig = entries.map(([id, g]) =>
      `${id}:${g?.status || ''}:${g?.winner || ''}:${g?.createdAt || ''}`
    ).join('|');

    const html = entries.map(([id, g]) => {
      const idSafe = q(id);
      const statusCls = g.status === 'playing' ? 'pending' : 'gray';
      const winnerLabel = g.winner ? String(g.winner).slice(0, 6) : '';
      return `<div class="card-3d">
        <div class="card-info">
          <div class="card-title">${_esc(String(id).toUpperCase())} <span class="badge badge-${statusCls}">${_esc(g.status || '')}</span></div>
          <div class="card-sub">Created ${timeAgo(g.createdAt)}${winnerLabel ? ' · Winner: ' + _esc(winnerLabel) : ''}</div>
        </div>
        <div class="card-actions">
          <button class="btn btn-danger btn-xs" onclick="Viora.resetTrackGame('${idSafe}')"><i class="fa-solid fa-rotate-left"></i> Reset</button>
        </div>
      </div>`;
    }).join('');

    renderIfChanged(host, sig, html);
  } catch (e) { console.warn('renderPartnerGames failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   CACHE INVALIDATOR
   ═══════════════════════════════════════════════════════════════ */
export function invalidatePartnerCaches() {
  _usersSortedStamp = '';
  _usersSortedCache = null;
  /* The per-element signature cache is a WeakMap — the DOM nodes
   * will be GC'd naturally, and a fresh render will simply write
   * once more. No manual clear needed. */
}
