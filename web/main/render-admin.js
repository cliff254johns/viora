// main/render-admin.js
// ═══════════════════════════════════════════════════════════════
//  Admin Register Rendering  (v6.8 — debugged + optimized)
//  Employees · Assets · Compliance · Users · Documents ·
//  Activity · Trash · Support Tickets · Portal
// ═══════════════════════════════════════════════════════════════

let _ctx = null;
export function initRenderAdmin(ctx) {
  // Merge instead of replace — partial re-inits preserve earlier deps
  _ctx = Object.assign(_ctx || {}, ctx || {});
}
function ctx() { return _ctx || {}; }

/* ── Small safe-access helpers ── */
const DEFAULT_ESCAPE = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function getEscape() {
  const c = ctx();
  return typeof c.escapeHtml === 'function' ? c.escapeHtml : DEFAULT_ESCAPE;
}

/* Quote-escape for inline JS string literals inside onclick */
function q(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '\\x3c')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* Safe accessors for ctx deps */
function safeCall(name, fallback) {
  const c = ctx();
  const fn = c[name];
  if (typeof fn === 'function') {
    return (...args) => { try { return fn(...args); } catch (e) { console.warn(`[render-admin] ${name} failed:`, e); return fallback; } };
  }
  return () => fallback;
}

const safe$           = (id) => (ctx().$ ? ctx().$(id) : document.getElementById(id));
const safeState       = () => ctx().state || { data: {} };
const safeData        = () => safeState().data || {};

/* ★ v9.3 — Always read employees/clients from state directly.
   The injected _deps.getEmployees may be undefined or stale due to a
   module-instance mismatch. Reading state.data.entities directly
   avoids the entire class of problem. If the injected helper is
   available and returns a non-empty array, use it; otherwise fall
   back to state. This is what makes the HR & Staff table render. */
function safeGetEmployees() {
  const injected = ctx().getEmployees;
  if (typeof injected === 'function') {
    try {
      const out = injected();
      if (Array.isArray(out) && out.length > 0) return out;
    } catch (_) {}
  }
  const s = ctx().state;
  const entities = (s && s.data && s.data.entities) || [];
  return entities.filter(e => e && e.type === 'employee');
}

function safeGetClients() {
  const injected = ctx().getClients;
  if (typeof injected === 'function') {
    try {
      const out = injected();
      if (Array.isArray(out) && out.length > 0) return out;
    } catch (_) {}
  }
  const s = ctx().state;
  const entities = (s && s.data && s.data.entities) || [];
  return entities.filter(e => e && e.type === 'client');
}
const safeContactButtons = (entity, kind) => {
  const c = ctx();
  if (typeof c.contactButtons !== 'function') return '';
  try { return c.contactButtons(entity, kind) || ''; } catch (e) { return ''; }
};
const safeGetClientName = (id) => {
  const c = ctx();
  if (typeof c.getClientName !== 'function') return '—';
  try { return c.getClientName(id) || '—'; } catch (e) { return '—'; }
};
const safeFmtDate = (d) => {
  const c = ctx();
  if (typeof c.fmtDate === 'function') { try { return c.fmtDate(d); } catch (e) {} }
  return d || '—';
};
const safeFmtKES = (n) => {
  const c = ctx();
  if (typeof c.fmtKES === 'function') { try { return c.fmtKES(n); } catch (e) {} }
  return `KES ${num(n).toLocaleString()}`;
};
const safeFmtBytes = (n) => {
  const c = ctx();
  if (typeof c.fmtBytes === 'function') { try { return c.fmtBytes(n); } catch (e) {} }
  const b = num(n);
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
  return (b / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
};
const safeTimeAgo = (t) => {
  const c = ctx();
  if (typeof c.timeAgo === 'function') { try { return c.timeAgo(t); } catch (e) {} }
  return t || '—';
};
const safeToast = (m, t) => {
  const c = ctx();
  if (typeof c.toast === 'function') { try { c.toast(m, t); return; } catch (e) {} }
  console.log(`[toast:${t || 'info'}]`, m);
};

/* Confirm dialog — prefers vioraConfirm, falls back to native */
async function askConfirm(message, opts) {
  if (typeof window !== 'undefined' && typeof window.vioraConfirm === 'function') {
    try { return await window.vioraConfirm(message, opts); } catch (e) {}
  }
  return typeof confirm === 'function' ? confirm(message) : true;
}

/* ═══════════════════════════════════════════════════════════════
   TICKET VIEWER STATE
   ═══════════════════════════════════════════════════════════════ */
let _viewingTicketId   = null;
let _ticketThreadUnsub = null;
let _threadMessageCount = 0;
let _lastMessageTime = '';

/* ═══════════════════════════════════════════════════════════════
   EMPLOYEES
   ═══════════════════════════════════════════════════════════════ */
export function renderEmployees() {
  try {
    const tb = safe$('employeesBody');
    if (!tb) return;
    const emps = safeGetEmployees();
    if (!emps.length) {
      tb.innerHTML = `<tr><td colspan="7" class="empty-state">No employees yet.</td></tr>`;
      return;
    }
    const E = getEscape();
    const sm = { 'Active': 'active', 'Probation': 'pending', 'On Leave': 'sent', 'Terminated': 'overdue' };

    tb.innerHTML = emps.map(e => {
      const statusSafe = q(e.status || '');
      const badgeCls = sm[e.status] || 'gray';
      const idSafe = q(e.id);
      return `<tr>
        <td><strong>${E(e.name || '')}</strong>${safeContactButtons(e, 'employee')}</td>
        <td>${E(e.designation || '—')}</td>
        <td>${E(e.department || '—')}</td>
        <td>${safeFmtKES(e.payRate)}</td>
        <td>${num(e.leaveBalance)} days</td>
        <td><span class="badge badge-${badgeCls}">${E(e.status || '')}</span></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-primary btn-xs" onclick="Viora.editEmployee('${idSafe}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteEmployee('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) { console.warn('renderEmployees failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   ASSETS
   ═══════════════════════════════════════════════════════════════ */
export function renderAssets() {
  try {
    const tb = safe$('assetsBody');
    if (!tb) return;
    const assets = safeData().assets || [];
    if (!assets.length) {
      tb.innerHTML = `<tr><td colspan="7" class="empty-state">No assets yet.</td></tr>`;
      return;
    }
    const E = getEscape();

    // Index employees once
    const empById = new Map();
    for (const emp of safeGetEmployees()) {
      if (emp && emp.id) empById.set(emp.id, emp);
    }

    tb.innerHTML = assets.map(a => {
      const emp = a.assignedTo ? empById.get(a.assignedTo) : null;
      const idSafe = q(a.id);
      const badgeCls = a.status === 'In Use' ? 'active'
                     : a.status === 'Disposed' ? 'overdue'
                     : 'pending';
      return `<tr>
        <td><strong>${E(a.name || '')}</strong></td>
        <td>${E(a.category || '')}</td>
        <td>${safeFmtKES(a.cost)}</td>
        <td>${E(a.assignedName || 'Unassigned')}${emp ? safeContactButtons(emp, 'employee') : ''}</td>
        <td>${num(a.depreciation)}% p.a.</td>
        <td><span class="badge badge-${badgeCls}">${E(a.status || '')}</span></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-primary btn-xs" onclick="Viora.editAsset('${idSafe}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteAsset('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) { console.warn('renderAssets failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   COMPLIANCE
   ═══════════════════════════════════════════════════════════════ */
export function renderCompliance() {
  try {
    const tb = safe$('complianceBody');
    if (!tb) return;
    const list = safeData().compliance || [];
    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="6" class="empty-state">No compliance records yet.</td></tr>`;
      return;
    }
    const E = getEscape();
    const now = Date.now();

    tb.innerHTML = list.map(c => {
      let cls = 'active', lbl = c.status || 'Active';
      if (c.expiryDate) {
        const t = new Date(c.expiryDate).getTime();
        if (Number.isFinite(t)) {
          const d = Math.round((t - now) / 86400000);
          if (d < 0)       { cls = 'overdue'; lbl = 'Expired'; }
          else if (d <= 60){ cls = 'pending'; lbl = `Expires in ${d}d`; }
        }
      }
      const idSafe = q(c.id);
      return `<tr>
        <td><strong>${E(c.title || '')}</strong></td>
        <td style="font-family:monospace;">${E(c.regNo || '—')}</td>
        <td>${safeFmtDate(c.issueDate)}</td>
        <td>${safeFmtDate(c.expiryDate)}</td>
        <td><span class="badge badge-${cls}">${E(lbl)}</span></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-primary btn-xs" onclick="Viora.editCompliance('${idSafe}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteCompliance('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) { console.warn('renderCompliance failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   USERS
   ═══════════════════════════════════════════════════════════════ */
const _USER_ROLES = ['exec', 'admin', 'sales', 'marketing', 'ops', 'finance', 'hr', 'member', 'owner', 'viewer'];

export function renderUsers() {
  try {
    const tb = safe$('usersBody');
    if (!tb) return;
    const users = safeData().users || [];
    if (!users.length) {
      tb.innerHTML = `<tr><td colspan="5" class="empty-state">No users loaded.</td></tr>`;
      return;
    }
    const E = getEscape();

    // Ensure roles from users not in the default list are still shown
    const seenRoles = new Set(_USER_ROLES);
    for (const u of users) if (u.role) seenRoles.add(u.role);
    const roles = Array.from(seenRoles);

    tb.innerHTML = users.map(u => {
      const id = u.uid || u.id || '';
      const idSafe = q(id);
      const roleOptions = roles.map(r =>
        `<option value="${q(r)}" ${r === u.role ? 'selected' : ''}>${E(r.toUpperCase())}</option>`
      ).join('');
      return `<tr>
        <td style="font-family:monospace;font-size:.72rem;">${E(id)}</td>
        <td>${E(u.name || '—')}</td>
        <td>${E(u.email || '')}</td>
        <td>
          <select onchange="Viora.setUserRole('${idSafe}', this.value)" style="padding:4px 8px;border-radius:8px;">
            ${roleOptions}
          </select>
        </td>
        <td style="text-align:right;">
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteUser('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) { console.warn('renderUsers failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   DOCUMENT VAULT
   ═══════════════════════════════════════════════════════════════ */
export function renderDocumentVault() {
  try {
    const tb = safe$('vaultTableBody');
    if (!tb) return;
    const docs = safeData().documents || [];
    if (!docs.length) {
      tb.innerHTML = `<tr><td colspan="6" class="empty-state">No documents yet.</td></tr>`;
      return;
    }
    const E = getEscape();

    tb.innerHTML = docs.map(d => {
      const idSafe = q(d.id);
      const title = d.title || d.fileName || '—';
      return `<tr>
        <td><strong>${E(title)}</strong><br><small style="color:var(--text-secondary);font-size:.7rem;">${E(d.fileName || '')}</small></td>
        <td><span class="badge badge-purple">${E(d.parentName || '—')}</span></td>
        <td>${E(d.category || '—')}</td>
        <td>${safeFmtBytes(d.size)}</td>
        <td><small>${safeTimeAgo(d.uploadedAt)}</small></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-primary btn-xs" onclick="Viora.viewDoc('${idSafe}')"><i class="fa-solid fa-eye"></i></button>
          <button class="btn btn-success btn-xs" onclick="Viora.downloadDoc('${idSafe}')"><i class="fa-solid fa-download"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteDoc('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) { console.warn('renderDocumentVault failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   ACTIVITY
   ═══════════════════════════════════════════════════════════════ */
const ACTIVITY_ICONS = Object.freeze({
  add:    '➕',
  edit:   '✏️',
  delete: '🗑️',
  send:   '📤',
  upload: '📎',
  pay:    '💰',
  login:  '🔑',
  logout: '🚪'
});
const ACTIVITY_LIMIT = 500;

export function renderActivity() {
  try {
    const filter = (safe$('activitySearch')?.value || '').toLowerCase().trim();
    const tf = safe$('activityFilter')?.value || 'all';
    let list = safeData().activityLog || [];

    if (tf !== 'all') list = list.filter(a => a && a.type === tf);
    if (filter) {
      list = list.filter(a => a &&
        ((a.title || '').toLowerCase().includes(filter) ||
         (a.description || '').toLowerCase().includes(filter))
      );
    }

    // Sort newest first, then cap
    list = list.slice().sort((a, b) =>
      (b?.timestamp || '').localeCompare(a?.timestamp || '')
    );
    if (list.length > ACTIVITY_LIMIT) list = list.slice(0, ACTIVITY_LIMIT);

    const c = safe$('activityList');
    if (!c) return;
    if (!list.length) { c.innerHTML = `<div class="empty-state">No activity yet.</div>`; return; }

    const E = getEscape();
    c.innerHTML = list.map(a => {
      const type = a.type || '';
      const icon = Object.prototype.hasOwnProperty.call(ACTIVITY_ICONS, type) ? ACTIVITY_ICONS[type] : '📌';
      const typeSafe = type.replace(/[^a-z0-9_-]/gi, '');
      return `<div class="activity-item ${typeSafe}">
        <span class="act-icon">${icon}</span>
        <div class="act-body">
          <div class="act-title">${E(a.title || '')}</div>
          ${a.description ? `<div class="act-desc">${E(a.description)}</div>` : ''}
        </div>
        <div class="act-time">${safeTimeAgo(a.timestamp)}</div>
      </div>`;
    }).join('');
  } catch (e) { console.warn('renderActivity failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   TRASH
   ═══════════════════════════════════════════════════════════════ */
export function renderTrash() {
  try {
    const tb = safe$('trashBody');
    if (!tb) return;
    const entries = safeData().trash || [];
    if (!entries.length) {
      tb.innerHTML = `<tr><td colspan="5" class="empty-state">Trash is empty.</td></tr>`;
      return;
    }
    const E = getEscape();

    tb.innerHTML = entries
      .slice()
      .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))
      .map(t => {
        const p = t.payload || {};
        const label = p.name || p.fullName || p.title || p.number || t.originalId || '—';
        const idSafe = q(t.id);
        return `<tr>
          <td><span class="badge badge-purple">${E(t.collection || '')}</span></td>
          <td>${E(label)}</td>
          <td>${safeTimeAgo(t.deletedAt)}</td>
          <td>${E(t.deletedByName || '')}</td>
          <td style="text-align:right;white-space:nowrap;">
            <button class="btn btn-success btn-xs" onclick="Viora.restoreFromTrash('${idSafe}')"><i class="fa-solid fa-rotate-left"></i></button>
            <button class="btn btn-danger btn-xs" onclick="Viora.purgeTrashItem('${idSafe}')"><i class="fa-solid fa-xmark"></i></button>
          </td>
        </tr>`;
      }).join('');
  } catch (e) { console.warn('renderTrash failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   SUPPORT TICKETS
   ═══════════════════════════════════════════════════════════════ */
export function renderSupportTickets() {
  try {
    const tb = safe$('ticketsBody');
    const tickets = (safeData().tickets || []).slice();
    const setText = (id, v) => { const e = safe$ (id); if (e) e.textContent = String(v); };

    const openCount = tickets.filter(t => t.status !== 'closed').length;
    setText('tkTotal',  tickets.length);
    setText('tkOpen',   openCount);
    setText('tkClosed', tickets.filter(t => t.status === 'closed').length);
    setText('tkUrgent', tickets.filter(t => t.priority === 'urgent' && t.status !== 'closed').length);

    const nb = safe$('ticketsNavBadge');
    if (nb) {
      if (openCount > 0) { nb.textContent = String(openCount); nb.style.display = 'inline-block'; }
      else nb.style.display = 'none';
    }

    const search    = (safe$('ticketSearch')?.value || '').toLowerCase().trim();
    const fStatus   = safe$('ticketFilterStatus')?.value || 'all';
    const fPriority = safe$('ticketFilterPriority')?.value || 'all';

    let list = tickets;
    if (search) {
      list = list.filter(t =>
        (t.subject || '').toLowerCase().includes(search) ||
        (t.clientName || '').toLowerCase().includes(search) ||
        safeGetClientName(t.clientId).toLowerCase().includes(search)
      );
    }
    if (fStatus   !== 'all') list = list.filter(t => (t.status || 'open') === fStatus);
    if (fPriority !== 'all') list = list.filter(t => (t.priority || 'medium') === fPriority);

    // Sort by most recent activity
    list = list.slice().sort((a, b) => {
      const aT = a.lastMessageAt || a.createdAt || '';
      const bT = b.lastMessageAt || b.createdAt || '';
      return aT < bT ? 1 : aT > bT ? -1 : 0;
    });

    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="7" class="empty-state">${tickets.length ? 'No tickets match.' : 'No tickets yet.'}</td></tr>`;
      return;
    }
    const E = getEscape();
    const PRI_CLS = { urgent: 'overdue', high: 'pending', medium: 'sent', low: 'gray' };

    tb.innerHTML = list.map(t => {
      const pri = PRI_CLS[t.priority] || 'gray';
      const st  = t.status === 'closed' ? 'gray' : 'active';
      const isUnread = num(t.unreadForAdmin) > 0 && t.status !== 'closed';
      const idSafe = q(t.id);
      return `<tr>
        <td>${safeTimeAgo(t.createdAt)}</td>
        <td><strong>${E(t.subject || 'Untitled')}</strong>${isUnread ? ' <span class="badge badge-overdue" style="font-size:9px;">NEW</span>' : ''}</td>
        <td>${E(t.clientName || safeGetClientName(t.clientId))}</td>
        <td><span class="badge badge-${pri}">${E(t.priority || 'medium')}</span></td>
        <td><span class="badge badge-${st}">${E(t.status || 'open')}</span></td>
        <td><small>${safeTimeAgo(t.lastMessageAt || t.createdAt)}</small></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-primary btn-xs" onclick="Viora.viewTicket('${idSafe}')"><i class="fa-solid fa-eye"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteTicket('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) { console.warn('renderSupportTickets failed', e); }
}

export function viewTicket(ticketId) {
  const c = ctx();
  const {
    state, openModal,
    db, ref, onValue, set, P
  } = c;

  const t = (safeData().tickets || []).find(x => x.id === ticketId);
  if (!t) { safeToast('Ticket not found.', 'error'); return; }

  // Unsubscribe previous thread BEFORE switching ids to avoid races
  if (_ticketThreadUnsub) { try { _ticketThreadUnsub(); } catch (e) {} _ticketThreadUnsub = null; }
  _threadMessageCount = 0;
  _lastMessageTime = '';
  _viewingTicketId = ticketId;

  const E = getEscape();

  const subjectEl = safe$('ticketViewSubject');
  if (subjectEl) subjectEl.textContent = t.subject || 'Ticket';

  const PRI_CLS = { urgent: 'overdue', high: 'pending', medium: 'sent', low: 'gray' };
  const pri = PRI_CLS[t.priority] || 'gray';
  const st  = t.status === 'closed' ? 'gray' : 'active';

  const metaEl = safe$('ticketViewMeta');
  if (metaEl) {
    metaEl.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;">
        <div><span style="color:var(--text-secondary);">Client:</span> <strong>${E(t.clientName || safeGetClientName(t.clientId))}</strong></div>
        <div><span style="color:var(--text-secondary);">Priority:</span> <span class="badge badge-${pri}">${E(t.priority || 'medium')}</span></div>
        <div><span style="color:var(--text-secondary);">Status:</span> <span class="badge badge-${st}">${E(t.status || 'open')}</span></div>
        <div><span style="color:var(--text-secondary);">Opened:</span> ${safeTimeAgo(t.createdAt)}</div>
        ${t.resolvedAt ? `<div><span style="color:var(--text-secondary);">Resolved:</span> ${safeTimeAgo(t.resolvedAt)}${t.resolvedBy ? ` by ${E(t.resolvedBy)}` : ''}</div>` : ''}
      </div>`;
  }

  // Clear unread badge
  if (num(t.unreadForAdmin) > 0 && db && ref && set && P) {
    set(ref(db, `${P('tickets')}/${ticketId}/unreadForAdmin`), 0)
      .then(() => { t.unreadForAdmin = 0; renderSupportTickets(); })
      .catch(err => console.warn('[tickets] clear unread failed:', err?.message));
  }

  const thread = safe$('ticketViewThread');
  if (!thread) { safeToast('Ticket viewer missing — reload page.', 'error'); return; }
  if (!db || !ref || !onValue || !P) {
    thread.innerHTML = '<div class="empty-state">Ticket viewer unavailable.</div>';
    return;
  }

  _ticketThreadUnsub = onValue(ref(db, `${P('tickets')}/${ticketId}/messages`), snap => {
    // Guard against late-arriving snapshots after unsubscribe
    if (_viewingTicketId !== ticketId) return;

    const v = snap.exists() ? snap.val() : {};
    const msgs = Object.values(v).sort((a, b) =>
      (a.createdAt || '').localeCompare(b.createdAt || '')
    );

    // Skip re-render if nothing changed
    const lastT = msgs.length ? (msgs[msgs.length - 1].createdAt || '') : '';
    if (msgs.length === _threadMessageCount && lastT === _lastMessageTime) return;
    _threadMessageCount = msgs.length;
    _lastMessageTime = lastT;

    if (!msgs.length) {
      thread.innerHTML = '<div class="empty-state">No messages yet.</div>';
      return;
    }
    thread.innerHTML = msgs.map(m => {
      const isAdmin  = m.senderType === 'admin';
      const isSystem = !!m.system;
      const bubbleStyle = isSystem
        ? 'background:rgba(34,230,160,.1);border:1px solid rgba(34,230,160,.35);color:var(--accent-green);margin:0 auto;font-style:italic;'
        : isAdmin
          ? 'background:var(--gradient-accent);color:#fff;border-radius:14px 14px 4px 14px;'
          : 'background:var(--bg-card-solid);border:1px solid var(--border-color);border-radius:14px 14px 14px 4px;';
      return `<div style="display:flex;flex-direction:column;align-items:${isAdmin ? 'flex-end' : 'flex-start'};margin-bottom:10px;">
        <div style="max-width:78%;padding:11px 15px;border-radius:14px;${bubbleStyle}font-size:.85rem;line-height:1.55;">
          ${!isSystem ? `<div style="font-size:.68rem;opacity:.75;margin-bottom:3px;font-weight:600;">${E(m.senderName || (isAdmin ? 'Viora Support' : 'Client'))}</div>` : ''}
          <div style="word-break:break-word;">${E(m.text || '').replace(/\n/g, '<br>')}</div>
          <div style="font-size:.62rem;opacity:.7;margin-top:5px;text-align:${isSystem ? 'center' : isAdmin ? 'right' : 'left'};">${safeTimeAgo(m.createdAt)}</div>
        </div>
      </div>`;
    }).join('');

    // Auto-scroll only if user is already near the bottom
    const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
    if (nearBottom) thread.scrollTop = thread.scrollHeight;
  });

  const replyWrap = safe$('ticketReplyWrap');
  if (replyWrap) replyWrap.style.display = t.status === 'closed' ? 'none' : 'flex';

  const resolveBtn = safe$('ticketMarkResolvedBtn');
  if (resolveBtn) resolveBtn.style.display = t.status === 'closed' ? 'none' : 'inline-flex';

  if (typeof openModal === 'function') openModal('ticketViewModal');
}

export function closeTicketView() {
  const { closeModal } = ctx();
  if (_ticketThreadUnsub) { try { _ticketThreadUnsub(); } catch (e) {} _ticketThreadUnsub = null; }
  _viewingTicketId = null;
  _threadMessageCount = 0;
  _lastMessageTime = '';
  if (typeof closeModal === 'function') closeModal('ticketViewModal');
}

export async function sendTicketReply() {
  const {
    state, db, ref, set, P, update
  } = ctx();
  const ticketId = _viewingTicketId;
  if (!ticketId) return;

  const input = safe$('ticketReplyInput');
  const text = (input?.value || '').trim();
  if (!text) { safeToast('Please write a message.', 'warning'); return; }
  if (!db || !ref || !set || !P) { safeToast('Ticket service unavailable.', 'error'); return; }

  // Clear input immediately so user typing isn't lost on slow network
  if (input) input.value = '';

  const btn = safe$('ticketSendReplyBtn');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…'; }

  try {
    const msgId = 'msg-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const msg = {
      id: msgId,
      senderId: state?.operator?.uid || 'admin',
      senderType: 'admin',
      senderName: state?.operator?.name || 'Viora Support',
      text,
      createdAt: new Date().toISOString()
    };

    // Prefer atomic multi-path update if available
    if (typeof update === 'function') {
      const basePath = `${P('tickets')}/${ticketId}`;
      await update(ref(db), {
        [`${basePath}/messages/${msgId}`]: msg,
        [`${basePath}/lastMessageAt`]: msg.createdAt,
        [`${basePath}/unreadForClient`]: 1,
        [`${basePath}/unreadForAdmin`]: 0
      });
    } else {
      // Fallback: sequential sets — first one wins on partial failure
      await set(ref(db, `${P('tickets')}/${ticketId}/messages/${msgId}`), msg);
      await Promise.all([
        set(ref(db, `${P('tickets')}/${ticketId}/lastMessageAt`), msg.createdAt),
        set(ref(db, `${P('tickets')}/${ticketId}/unreadForClient`), 1),
        set(ref(db, `${P('tickets')}/${ticketId}/unreadForAdmin`), 0)
      ]);
    }
    safeToast('Reply sent.', 'success');
    if (input) input.focus();
  } catch (e) {
    safeToast('Send failed: ' + (e?.message || e), 'error');
    // Restore the message text so the user doesn't lose it
    if (input && !input.value) input.value = text;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHtml || '<i class="fa-solid fa-paper-plane"></i> Send'; }
  }
}

export async function toggleTicketStatus() {
  const { state, db, ref, set, P, logActivity } = ctx();
  const ticketId = _viewingTicketId;
  if (!ticketId) return;
  const t = (safeData().tickets || []).find(x => x.id === ticketId);
  if (!t) return;
  if (!db || !ref || !set || !P) { safeToast('Ticket service unavailable.', 'error'); return; }

  const newStatus = t.status === 'closed' ? 'open' : 'closed';
  try {
    await set(ref(db, `${P('tickets')}/${ticketId}/status`), newStatus);

    // Update local state
    const arr = safeData().tickets || [];
    const idx = arr.findIndex(x => x.id === ticketId);
    if (idx > -1) arr[idx] = { ...arr[idx], status: newStatus };
    t.status = newStatus;

    const replyWrap = safe$('ticketReplyWrap');
    if (replyWrap) replyWrap.style.display = newStatus === 'closed' ? 'none' : 'flex';

    const resolveBtn = safe$('ticketMarkResolvedBtn');
    if (resolveBtn) resolveBtn.style.display = newStatus === 'closed' ? 'none' : 'inline-flex';

    // Only re-render the meta line, not the whole modal
    const metaEl = safe$('ticketViewMeta');
    if (metaEl) {
      const E = getEscape();
      const PRI_CLS = { urgent: 'overdue', high: 'pending', medium: 'sent', low: 'gray' };
      const pri = PRI_CLS[t.priority] || 'gray';
      const st  = newStatus === 'closed' ? 'gray' : 'active';
      metaEl.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;">
          <div><span style="color:var(--text-secondary);">Client:</span> <strong>${E(t.clientName || safeGetClientName(t.clientId))}</strong></div>
          <div><span style="color:var(--text-secondary);">Priority:</span> <span class="badge badge-${pri}">${E(t.priority || 'medium')}</span></div>
          <div><span style="color:var(--text-secondary);">Status:</span> <span class="badge badge-${st}">${E(newStatus)}</span></div>
          <div><span style="color:var(--text-secondary);">Opened:</span> ${safeTimeAgo(t.createdAt)}</div>
        </div>`;
    }

    if (typeof logActivity === 'function') {
      try { await logActivity('edit', 'Ticket ' + newStatus, `${t.subject || ''}`); } catch (e) {}
    }
    safeToast('Ticket ' + newStatus + '.', 'success');
    renderSupportTickets();
  } catch (e) {
    safeToast('Failed: ' + (e?.message || e), 'error');
  }
}

export async function markTicketResolved() {
  const { state, db, ref, set, update, P, logActivity } = ctx();
  const ticketId = _viewingTicketId;
  if (!ticketId) { safeToast('No ticket selected.', 'warning'); return; }

  const t = (safeData().tickets || []).find(x => x.id === ticketId);
  if (!t) { safeToast('Ticket not found.', 'error'); return; }
  if (t.status === 'closed') { safeToast('Ticket is already resolved.', 'info'); return; }
  if (!db || !ref || !set || !P) { safeToast('Ticket service unavailable.', 'error'); return; }

  const btn = safe$('ticketMarkResolvedBtn');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resolving…'; }

  try {
    const nowIso = new Date().toISOString();
    const msgId = 'msg-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const basePath = `${P('tickets')}/${ticketId}`;

    if (typeof update === 'function') {
      await update(ref(db), {
        [`${basePath}/status`]: 'closed',
        [`${basePath}/resolvedAt`]: nowIso,
        [`${basePath}/resolvedBy`]: state?.operator?.name || 'Viora Support',
        [`${basePath}/messages/${msgId}`]: {
          id: msgId,
          senderId: state?.operator?.uid || 'admin',
          senderType: 'admin',
          senderName: 'Viora Support',
          text: '✅ This ticket has been marked as resolved. If you need further help, please open a new ticket.',
          createdAt: nowIso,
          system: true
        },
        [`${basePath}/lastMessageAt`]: nowIso,
        [`${basePath}/unreadForClient`]: 1,
        [`${basePath}/unreadForAdmin`]: 0
      });
    } else {
      await set(ref(db, `${basePath}/status`), 'closed');
      await set(ref(db, `${basePath}/resolvedAt`), nowIso);
      await set(ref(db, `${basePath}/resolvedBy`), state?.operator?.name || 'Viora Support');
      await set(ref(db, `${basePath}/messages/${msgId}`), {
        id: msgId,
        senderId: state?.operator?.uid || 'admin',
        senderType: 'admin',
        senderName: 'Viora Support',
        text: '✅ This ticket has been marked as resolved. If you need further help, please open a new ticket.',
        createdAt: nowIso,
        system: true
      });
      await Promise.all([
        set(ref(db, `${basePath}/lastMessageAt`), nowIso),
        set(ref(db, `${basePath}/unreadForClient`), 1),
        set(ref(db, `${basePath}/unreadForAdmin`), 0)
      ]);
    }

    const arr = safeData().tickets || [];
    const idx = arr.findIndex(x => x.id === ticketId);
    if (idx > -1) arr[idx] = { ...arr[idx], status: 'closed', resolvedAt: nowIso };
    t.status = 'closed';

    const replyWrap = safe$('ticketReplyWrap');
    if (replyWrap) replyWrap.style.display = 'none';
    const resolveBtn = safe$('ticketMarkResolvedBtn');
    if (resolveBtn) resolveBtn.style.display = 'none';

    if (typeof logActivity === 'function') {
      try { await logActivity('edit', 'Ticket resolved', t.subject || ''); } catch (e) {}
    }
    safeToast('Ticket marked as resolved.', 'success');
    renderSupportTickets();
  } catch (e) {
    safeToast('Failed to resolve ticket: ' + (e?.message || e), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHtml || '<i class="fa-solid fa-circle-check"></i> Mark Resolved'; }
  }
}

export async function deleteTicket(ticketId) {
  const { db, ref, remove, P, logActivity } = ctx();
  const t = (safeData().tickets || []).find(x => x.id === ticketId);
  if (!t) return;
  if (!db || !ref || !remove || !P) { safeToast('Ticket service unavailable.', 'error'); return; }

  const ok = await askConfirm(
    `Delete ticket "${t.subject || 'Untitled'}"? This cannot be undone.`,
    { title: 'Delete ticket', confirmLabel: 'Delete', confirmClass: 'btn-danger' }
  );
  if (!ok) return;

  try {
    await remove(ref(db, `${P('tickets')}/${ticketId}`));
    safeData().tickets = (safeData().tickets || []).filter(x => x.id !== ticketId);
    if (_viewingTicketId === ticketId) closeTicketView();
    if (typeof logActivity === 'function') {
      try { await logActivity('delete', 'Ticket deleted', t.subject || ''); } catch (e) {}
    }
    safeToast('Ticket deleted.', 'info');
    renderSupportTickets();
  } catch (e) {
    safeToast('Delete failed: ' + (e?.message || e), 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   PORTAL REQUESTS + USERS
   ═══════════════════════════════════════════════════════════════ */
export function renderPortalRequests() {
  try {
    const host = safe$('portalReqBody');
    if (!host) return;
    const list = safeData().portalRequests || [];
    const stats = safe$('portalReqStats');
    if (stats) {
      let pending = 0, approved = 0, rejected = 0;
      for (const r of list) {
        if (r.status === 'pending') pending++;
        else if (r.status === 'approved') approved++;
        else if (r.status === 'rejected') rejected++;
      }
      stats.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-list"></i></div><div class="number">${list.length}</div><div class="label">Total Requests</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-hourglass"></i></div><div class="number">${pending}</div><div class="label">Pending</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div><div class="number">${approved}</div><div class="label">Approved</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-xmark"></i></div><div class="number">${rejected}</div><div class="label">Rejected</div></div>
      `;
    }
    if (!list.length) {
      host.innerHTML = `<tr><td colspan="8" class="empty-state">No portal requests yet. Clients who sign up at portal.html will appear here.</td></tr>`;
      return;
    }
    const E = getEscape();
    host.innerHTML = list
      .slice()
      .sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''))
      .map(r => {
        let matchQuality;
        if (r.status === 'pending') {
          if (r.matchType === 'email_auto')       matchQuality = '<span class="badge badge-paid">⚡ Auto-matched</span>';
          else if (r.matchType === 'phone_suggest') matchQuality = '<span class="badge badge-pending">📱 Phone hint</span>';
          else if (r.matchType === 'escalated')    matchQuality = '<span class="badge badge-overdue">🔺 Escalated</span>';
          else                                     matchQuality = '<span class="badge badge-pending">⏳ Needs review</span>';
        } else if (r.status === 'approved') {
          matchQuality = '<span class="badge badge-paid">✓ Linked</span>';
        } else {
          matchQuality = '<span class="badge badge-gray">✗ Rejected</span>';
        }
        const uidSafe = q(r.uid);
        const statusCls = r.status === 'approved' ? 'paid' : r.status === 'rejected' ? 'overdue' : 'pending';
        return `
          <tr>
            <td>${safeTimeAgo(r.requestedAt)}</td>
            <td><strong>${E(r.name || '—')}</strong></td>
            <td>${E(r.email || '—')}</td>
            <td>${E(r.phone || '—')}</td>
            <td><span class="badge badge-${statusCls}">${E(r.status || 'pending')}</span></td>
            <td>${matchQuality}</td>
            <td>${E(safeGetClientName(r.clientId))}</td>
            <td style="text-align:right;white-space:nowrap;">
              ${r.status === 'pending'
                ? `<button class="btn btn-success btn-xs" onclick="Viora.openPortalApprove('${uidSafe}')" title="Approve and link"><i class="fa-solid fa-link"></i></button>
                   <button class="btn btn-danger btn-xs" onclick="Viora.rejectPortalRequest('${uidSafe}')" title="Reject"><i class="fa-solid fa-xmark"></i></button>`
                : '<span style="font-size:.7rem;color:var(--text-light);">—</span>'}
            </td>
          </tr>
        `;
      }).join('');
  } catch (e) { console.warn('renderPortalRequests failed', e); }
}

export function renderPortalUsers() {
  try {
    const host = safe$('portalUsersBody');
    if (!host) return;
    const list = safeData().portalUsers || [];
    const search = (safe$('portalUsersSearch')?.value || '').toLowerCase();
    const filter = safe$('portalUsersFilter')?.value || 'all';

    // Pre-resolve client names to avoid double lookups
    const clientNameCache = new Map();
    const resolveClientName = (id) => {
      if (!id) return '—';
      if (clientNameCache.has(id)) return clientNameCache.get(id);
      const n = safeGetClientName(id);
      clientNameCache.set(id, n);
      return n;
    };

    let filtered = list;
    if (search) {
      filtered = filtered.filter(u =>
        (u.name || '').toLowerCase().includes(search) ||
        (u.email || '').toLowerCase().includes(search) ||
        resolveClientName(u.clientId).toLowerCase().includes(search)
      );
    }
    if (filter === 'active')   filtered = filtered.filter(u => u.active);
    else if (filter === 'inactive') filtered = filtered.filter(u => !u.active);
    else if (filter === 'auto')     filtered = filtered.filter(u => u.linkedBy === 'auto');

    const stats = safe$('portalUsersStats');
    if (stats) {
      let active = 0, inactive = 0, auto = 0;
      for (const u of list) {
        if (u.active) active++; else inactive++;
        if (u.linkedBy === 'auto') auto++;
      }
      stats.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-users"></i></div><div class="number">${list.length}</div><div class="label">Total</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div><div class="number">${active}</div><div class="label">Active</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-pause"></i></div><div class="number">${inactive}</div><div class="label">Inactive</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-robot"></i></div><div class="number">${auto}</div><div class="label">Auto-linked</div></div>
      `;
    }

    if (!filtered.length) {
      host.innerHTML = `<tr><td colspan="7" class="empty-state">No portal users found.</td></tr>`;
      return;
    }
    const E = getEscape();

    host.innerHTML = filtered.map(u => {
      const uidSafe = q(u.uid);
      const emailSafe = q(u.email || '');
      const activeCls = u.active ? 'paid' : 'gray';
      return `<tr>
        <td><strong>${E(u.name || '—')}</strong></td>
        <td>${E(u.email || '')}</td>
        <td>${E(resolveClientName(u.clientId))}</td>
        <td><span class="badge badge-${activeCls}">${u.active ? 'active' : 'inactive'}</span></td>
        <td>${safeTimeAgo(u.linkedAt)}</td>
        <td>${E(u.linkedBy || '—')}</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-primary btn-xs" onclick="Viora.togglePortalUserActive('${uidSafe}', ${u.active ? 'false' : 'true'})" title="${u.active ? 'Deactivate' : 'Activate'}"><i class="fa-solid fa-${u.active ? 'pause' : 'play'}"></i></button>
          <button class="btn btn-gold btn-xs" onclick="Viora.unlinkPortalUser('${uidSafe}')" title="Unlink (keeps auth account)"><i class="fa-solid fa-unlink"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deletePortalUser('${uidSafe}', '${emailSafe}')" title="Delete (removes auth account + all data)"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) { console.warn('renderPortalUsers failed', e); }
}

export function getViewingTicketId() {
  return _viewingTicketId;
}
/* ═══════════════════════════════════════════════════════════════
   COMPANY PROFILE + PUBLIC SITE RENDERERS
   ─────────────────────────────────────────────────────────────
   Exported so main.js can import them. Safe no-ops until the
   real implementations are written (they don't throw, they just
   leave containers empty if the required deps aren't wired).
   ═══════════════════════════════════════════════════════════════ */
export function renderProfile() {
  try {
    const data = safeData();
    const profile = data.companyProfile || data.profile || {};
    const infoEl  = safe$('profileInfo');
    const certsEl = safe$('profileCertificates');
    const statsEl = safe$('profileStats');
    if (!infoEl && !certsEl && !statsEl) return;
    const E = getEscape();

    /* ── Info panel — grouped, rich ── */
    if (infoEl) {
      const row = (label, value) => {
        const safeVal = value == null || value === '' ? '<span style="color:var(--text-light);">—</span>' : E(value);
        return `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border-color);">
          <span style="color:var(--text-secondary);font-size:.82rem;">${label}</span>
          <span style="font-weight:600;text-align:right;word-break:break-word;">${safeVal}</span>
        </div>`;
      };
      const section = (icon, title, rowsHtml) => {
        if (!rowsHtml) return '';
        return `<div style="margin-bottom:18px;">
          <h4 style="font-size:.78rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.6px;margin:0 0 8px;font-weight:700;">
            <i class="fa-solid ${icon}"></i> ${title}
          </h4>
          ${rowsHtml}
        </div>`;
      };

      const social = profile.social || {};
      const bank = profile.bank || {};
      const mpesa = profile.mpesa || {};
      const dpo = profile.dpo || {};
      const langs = Array.isArray(profile.languages) ? profile.languages.join(', ') : (profile.languages || '');
      const socialRow = (name, url) => url ? row(name, `<a href="${E(url)}" target="_blank" rel="noopener">${E(url)}</a>`) : '';
      const hours = profile.hours || {};
      const days = ['mon','tue','wed','thu','fri','sat','sun'];
      const hoursHtml = days.map(d => {
        const r = hours[d];
        if (!r) return '';
        const label = d.charAt(0).toUpperCase() + d.slice(1);
        const val = r.closed ? 'Closed' : (r.open && r.close ? `${r.open} – ${r.close}` : '—');
        return row(label, val);
      }).join('');

      const logoHtml = profile.logoUrl
        ? `<div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
             <img src="${E(profile.logoUrl)}" alt="" style="width:64px;height:64px;object-fit:contain;border-radius:12px;background:var(--bg-elev-2);padding:6px;border:1px solid var(--border-color);" onerror="this.style.display='none';" />
             <div>
               <div style="font-size:1.1rem;font-weight:700;">${E(profile.name || '—')}</div>
               ${profile.tagline ? `<div style="font-size:.8rem;color:var(--text-secondary);">${E(profile.tagline)}</div>` : ''}
             </div>
           </div>`
        : '';

      infoEl.innerHTML = `
        ${logoHtml}
        ${section('fa-fingerprint', 'Identity',
          row('Display Name', profile.name) +
          row('Legal Name', profile.legalName) +
          row('Trading Name', profile.tradingName) +
          row('Industry', profile.industry) +
          row('Founded', profile.foundedDate || profile.founded) +
          row('Employees', profile.employees) +
          row('Languages', langs)
        )}
        ${section('fa-address-book', 'Contact',
          row('Primary Email', profile.email) +
          row('Support Email', profile.supportEmail) +
          row('Billing Email', profile.billingEmail) +
          row('Phone', profile.phone) +
          row('Alt Phone', profile.phoneAlt) +
          row('WhatsApp', profile.whatsapp) +
          row('Website', profile.website)
        )}
        ${section('fa-location-dot', 'Address',
          row('Physical', profile.physicalAddress) +
          row('P.O. Box', profile.poBox) +
          row('Postal Code', profile.postalCode) +
          row('City / HQ', profile.headquarters) +
          row('County / Region', profile.region) +
          row('Country', profile.country) +
          row('Timezone', profile.timezone)
        )}
        ${section('fa-scale-balanced', 'Registration & Tax',
          row('Registration #', profile.registrationNumber) +
          row('Tax ID / PIN', profile.taxId) +
          row('KRA PIN', profile.kraPin) +
          row('VAT', profile.vatRegistered ? `Registered${profile.vatNumber ? ' · ' + profile.vatNumber : ''}` : 'Not registered') +
          row('Business Permit', profile.permitNumber) +
          row('Permit Expiry', profile.permitExpiry)
        )}
        ${(bank.name || bank.accountNumber || mpesa.paybill || mpesa.till) ? section('fa-building-columns', 'Bank & M-Pesa',
          row('Bank', bank.name) +
          row('Branch', bank.branch) +
          row('Account Name', bank.accountName) +
          row('Account Number', bank.accountNumber) +
          row('SWIFT / BIC', bank.swift) +
          row('M-Pesa Paybill', mpesa.paybill) +
          row('M-Pesa Till', mpesa.till)
        ) : ''}
        ${hoursHtml ? section('fa-clock', 'Business Hours', hoursHtml) : ''}
        ${(social.linkedin || social.twitter || social.facebook || social.instagram || social.youtube || social.tiktok) ? section('fa-share-nodes', 'Social',
          socialRow('LinkedIn', social.linkedin) +
          socialRow('Twitter / X', social.twitter) +
          socialRow('Facebook', social.facebook) +
          socialRow('Instagram', social.instagram) +
          socialRow('YouTube', social.youtube) +
          socialRow('TikTok', social.tiktok)
        ) : ''}
        ${(dpo.name || dpo.email) ? section('fa-user-shield', 'Data Protection',
          row('DPO', dpo.name) +
          row('DPO Email', dpo.email)
        ) : ''}
        ${profile.description ? `<div style="margin-top:14px;padding:12px;background:var(--bg-elev-2);border-radius:10px;font-size:.85rem;color:var(--text-secondary);line-height:1.6;">${E(profile.description)}</div>` : ''}
        ${profile.about ? `<div style="margin-top:10px;padding:12px;background:var(--bg-elev-2);border-radius:10px;font-size:.85rem;color:var(--text-secondary);line-height:1.6;">${E(profile.about)}</div>` : ''}
      `;
    }

    /* ── Certifications & Awards ── */
    if (certsEl) {
      const certs = Array.isArray(profile.certificates) ? profile.certificates : [];
      const awards = Array.isArray(profile.awards) ? profile.awards : [];
      const all = [
        ...certs.map((c, i) => ({ ...c, _type: 'cert', _idx: i })),
        ...awards.map((a, i) => ({ ...a, _type: 'award', _idx: i }))
      ];

      if (!all.length) {
        certsEl.innerHTML = '<div class="empty-state">No certificates or awards yet. Use <strong>Upload Certificate / Award</strong> to add one.</div>';
      } else {
        const today = new Date().toISOString().slice(0, 10);
        certsEl.innerHTML = all.map(item => {
          const isCert = item._type === 'cert';
          const expiry = item.expiryDate || '';
          const expired = expiry && expiry < today;
          const expiring = expiry && !expired && expiry <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
          let expiryBadge = '';
          if (expired) expiryBadge = ' <span class="badge badge-overdue">EXPIRED</span>';
          else if (expiring) expiryBadge = ' <span class="badge badge-pending">EXPIRING SOON</span>';
          return `<div class="card-3d">
            <div class="avatar-mini lg" style="border-radius:12px;background:${isCert ? 'rgba(0,212,255,.15)' : 'rgba(255,200,87,.15)'};color:${isCert ? 'var(--accent-blue)' : 'var(--accent-gold)'};">
              <i class="fa-solid ${isCert ? 'fa-certificate' : 'fa-trophy'}"></i>
            </div>
            <div class="card-info">
              <div class="card-title">${E(item.title || '—')}${expiryBadge}</div>
              <div class="card-sub">${E(item.issuer || '')}${item.year ? ' · ' + E(item.year) : ''}${expiry ? ' · Expires ' + E(expiry) : ''}</div>
              ${item.description ? `<div class="card-sub" style="font-size:.72rem;">${E(item.description)}</div>` : ''}
              ${item.credentialId ? `<div class="card-sub" style="font-family:monospace;font-size:.7rem;">${E(item.credentialId)}</div>` : ''}
            </div>
            <div class="card-actions">
              ${item.fileData ? `<button class="btn btn-primary btn-xs" onclick="Viora.viewProfileDoc && Viora.viewProfileDoc(${item._idx})" title="View"><i class="fa-solid fa-eye"></i></button>` : ''}
              <button class="btn btn-danger btn-xs" onclick="Viora.deleteProfileItem && Viora.deleteProfileItem('${item._type}', ${item._idx})" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>`;
        }).join('');
      }
    }

    /* ── Stats ── */
    if (statsEl) {
      const clients   = (data.entities || []).filter(e => e && e.type === 'client').length;
      const projects  = (data.projects || []).length;
      const employees = safeGetEmployees().length;
      statsEl.innerHTML = `
        <div class="stat-card"><div class="number">${clients}</div><div class="label">Clients</div></div>
        <div class="stat-card"><div class="number">${projects}</div><div class="label">Projects</div></div>
        <div class="stat-card"><div class="number">${employees}</div><div class="label">Employees</div></div>
        <div class="stat-card"><div class="number">${(data.products || []).length}</div><div class="label">Products</div></div>
      `;
    }
  } catch (e) { console.warn('renderProfile failed', e); }
}

export function renderClientsite() {
  try {
    const data = safeData();
    const cs = data.clientsite || {};
    const brandingEl = safe$('clientsiteBranding');
    const statsEl    = safe$('clientsiteStats');
    const E = getEscape();

    if (brandingEl) {
      brandingEl.innerHTML = `
        <div><strong>Name:</strong> ${E(cs.name || '—')}</div>
        <div><strong>Company:</strong> ${E(cs.company || '—')}</div>
        <div><strong>Email:</strong> ${E(cs.email || '—')}</div>
        <div><strong>Phone:</strong> ${E(cs.phone || '—')}</div>
      `;
    }

    if (statsEl) {
      const s = cs.stats || {};
      statsEl.innerHTML = `
        <div class="stat-card"><div class="number">${E(s.projects ?? 0)}</div><div class="label">Projects</div></div>
        <div class="stat-card"><div class="number">${E(s.clients ?? 0)}</div><div class="label">Clients</div></div>
        <div class="stat-card"><div class="number">${E(s.experience ?? 0)}</div><div class="label">Years Exp.</div></div>
      `;
    }
  } catch (e) { console.warn('renderClientsite failed', e); }
}
