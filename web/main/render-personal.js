// main/render-personal.js
// ═══════════════════════════════════════════════════════════════
// Personal Track Rendering — To-Dos · Goals · Skills
// v2.0 — bug-fixed (setHtmlIfChanged now actually writes)
// ═══════════════════════════════════════════════════════════════

let _ctx = null;

export function initRenderPersonal(ctx) {
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

const safeState = () => C().state || { data: {}, operator: null };
const safeData  = () => safeState().data || {};

const fmtDate = (d) => {
  const c = C();
  if (typeof c.fmtDate === 'function') { try { return c.fmtDate(d); } catch (_) {} }
  return d || '—';
};

const todayStr = () => {
  const c = C();
  if (typeof c.todayStr === 'function') { try { return c.todayStr(); } catch (_) {} }
  return new Date().toISOString().slice(0, 10);
};

/* ═══════════════════════════════════════════════════════════════
   CORE CACHE HELPER — writes ONLY if the signature changed
   ═══════════════════════════════════════════════════════════════ */
const _htmlCache = new WeakMap();

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

/* Badge class whitelist. */
const BADGE_WHITELIST = new Set([
  'paid', 'pending', 'overdue', 'draft', 'active', 'gray',
  'purple', 'sent', 'high', 'medium', 'low', 'gold'
]);
const safeBadge = (v) => BADGE_WHITELIST.has(String(v)) ? String(v) : 'gray';

/* ═══════════════════════════════════════════════════════════════
   USER INDEX CACHE
   ═══════════════════════════════════════════════════════════════ */
let _userIndexCache = null;
let _userIndexStamp = '';

function getUserIndex() {
  const users = safeData().users || [];
  const stamp = users.length + '|' +
    (users.length ? (users[0]?.uid || '') + (users[users.length - 1]?.uid || '') : '');
  if (_userIndexCache && stamp === _userIndexStamp) return _userIndexCache;
  const map = new Map();
  for (const u of users) if (u && u.uid) map.set(u.uid, u);
  _userIndexCache = map;
  _userIndexStamp = stamp;
  return map;
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
export function computeGoalProgress(g) {
  if (!g) return 0;
  if (g.completedAt) return 100;

  const ms = Array.isArray(g.milestones) ? g.milestones : [];
  if (ms.length) {
    let done = 0;
    for (const m of ms) if (m && m.done) done++;
    return Math.round((done / ms.length) * 100);
  }

  if (g.progress != null) {
    const p = Number(g.progress);
    if (Number.isFinite(p)) return Math.min(100, Math.max(0, Math.round(p)));
  }
  return 0;
}

export function personalOwnerFilter(selectId) {
  const sel = safe$(selectId);
  const mode = sel ? sel.value : 'me';
  if (mode === 'all') return null;
  return safeState().operator?.uid || null;
}

/* ═══════════════════════════════════════════════════════════════
   TO-DOS
   ═══════════════════════════════════════════════════════════════ */
export function renderPersonalTodos() {
  try {
    const state = safeState();
    const $ = safe$;
    const tb = $('todosBody');
    if (!tb) return;

    const filterOwner = personalOwnerFilter('todoOwnerFilter');
    const search = ($('todoSearch')?.value || '').toLowerCase().trim();
    const dateFilter = $('todoDateFilter')?.value || '';
    const statusFilter = $('todoStatusFilter')?.value || 'all';
    const today = todayStr();

    const allTodos = Array.isArray(state.data.todos) ? state.data.todos : [];

    /* Stats (scoped to owner) */
    let statTotal = 0, statDone = 0, statOpen = 0, statOverdue = 0;
    for (const t of allTodos) {
      if (!t) continue;
      if (filterOwner && t.ownerUid !== filterOwner) continue;
      statTotal++;
      if (t.done) statDone++;
      else {
        statOpen++;
        if (t.date && t.date < today) statOverdue++;
      }
    }
    const setText = (id, v) => { const e = $(id); if (e) e.textContent = String(v); };
    setText('tdTotal', statTotal);
    setText('tdDone', statDone);
    setText('tdOpen', statOpen);
    setText('tdOverdue', statOverdue);

    /* Filter */
    const matchesStatus = (t) => {
      if (statusFilter === 'open')    return !t.done;
      if (statusFilter === 'done')    return !!t.done;
      if (statusFilter === 'overdue') return !t.done && t.date && t.date < today;
      return true;
    };
    const list = [];
    for (const t of allTodos) {
      if (!t) continue;
      if (filterOwner && t.ownerUid !== filterOwner) continue;
      if (search && !String(t.text || '').toLowerCase().includes(search)) continue;
      if (dateFilter && t.date !== dateFilter) continue;
      if (!matchesStatus(t)) continue;
      list.push(t);
    }

    /* Precompute sort keys */
    const keyed = list.map(t => ({
      t,
      done: t.done ? 1 : 0,
      key: (t.date || '') + 'T' + (t.dueTime || '99:99')
    }));
    keyed.sort((a, b) => {
      if (a.done !== b.done) return a.done - b.done;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });

    const sig = sigOf(keyed.map(k => k.t), ['text', 'done', 'priority', 'date', 'dueTime', 'ownerUid']) +
      '|' + (filterOwner || 'all') + '|' + search + '|' + dateFilter + '|' + statusFilter;

    if (!keyed.length) {
      renderIfChanged(tb, 'empty',
        '<tr><td colspan="7" class="empty-state">No to-dos yet. Click "New To-Do" to add one — it will sync to the Viora Track mobile app.</td></tr>');
      return;
    }

    const userIndex = getUserIndex();
    const meUid = state.operator?.uid;
    const meName = state.operator?.name;

    const rows = keyed.map(({ t }) => {
      const owner = userIndex.get(t.ownerUid);
      const ownerName = owner
        ? (owner.name || owner.email || '—')
        : (t.ownerUid === meUid ? (meName || 'Me') : (t.ownerUid ? String(t.ownerUid).slice(0, 8) : '—'));
      const overdue = !t.done && t.date && t.date < today;
      const status = t.done
        ? '<span class="badge badge-paid">Done</span>'
        : overdue
          ? '<span class="badge badge-overdue">Overdue</span>'
          : '<span class="badge badge-pending">Open</span>';
      const priCls = safeBadge(t.priority || 'medium');
      const idSafe = q(t.id);
      return `<tr>
        <td>${fmtDate(t.date)}</td>
        <td><strong>${_esc(t.text || '')}</strong>${t.recurring ? ' <span class="badge badge-purple" style="font-size:9px;">REPEAT</span>' : ''}</td>
        <td><span class="badge badge-purple">${_esc(ownerName)}</span></td>
        <td><span class="badge badge-${priCls}">${_esc(t.priority || 'medium')}</span></td>
        <td>${_esc(t.dueTime || '—')}</td>
        <td>${status}</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-success btn-xs" onclick="Viora.togglePersonalTodo('${idSafe}')"><i class="fa-solid fa-${t.done ? 'rotate-left' : 'check'}"></i></button>
          <button class="btn btn-primary btn-xs" onclick="Viora.editPersonalTodo('${idSafe}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deletePersonalTodo('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');

    renderIfChanged(tb, sig, rows);
  } catch (e) { console.warn('renderPersonalTodos failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   GOALS
   ═══════════════════════════════════════════════════════════════ */
const MAX_MILESTONES_RENDERED = 20;

export function renderPersonalGoals() {
  try {
    const state = safeState();
    const $ = safe$;
    const host = $('goalsCardGrid');
    if (!host) return;

    const filterOwner = personalOwnerFilter('goalOwnerFilter');
    const allGoals = Array.isArray(state.data.goals) ? state.data.goals : [];

    const list = [];
    for (const g of allGoals) {
      if (!g) continue;
      if (filterOwner) {
        const mine = g.ownerUid === filterOwner;
        const assigned = Array.isArray(g.assignedTo) && g.assignedTo.includes(filterOwner);
        const orphan = !g.ownerUid && (!g.assignedTo || g.assignedTo.length === 0);
        if (!mine && !assigned && !orphan) continue;
      }
      list.push(g);
    }

    const sig = sigOf(list, ['title', 'priority', 'type', 'progress', 'completedAt', 'targetDate']) +
      '|' + (filterOwner || 'all');

    if (!list.length) {
      renderIfChanged(host, 'empty',
        '<div class="empty-state" style="grid-column:1/-1;">No goals yet. Click "New Goal" to add one — it will sync to the Viora Track mobile app.</div>');
      return;
    }

    const userIndex = getUserIndex();

    const html = list.map(g => {
      const ms = Array.isArray(g.milestones) ? g.milestones : [];
      let msDone = 0;
      for (const m of ms) if (m && m.done) msDone++;
      const pct = computeGoalProgress(g);
      const cls = pct >= 70 ? 'green' : pct >= 40 ? '' : 'gold';
      const owner = userIndex.get(g.ownerUid);
      const target = g.targetDate
        ? `${fmtDate(g.targetDate)}${g.targetTime ? ' ' + _esc(g.targetTime) : ''}`
        : '—';
      const priCls = safeBadge(g.priority || 'medium');
      const typeCls = g.type === 'long_term' ? 'purple' : 'sent';
      const idSafe = q(g.id);

      const shownMs = ms.length > MAX_MILESTONES_RENDERED ? ms.slice(0, MAX_MILESTONES_RENDERED) : ms;
      const msHtml = shownMs.map((m, i) => `
        <div style="display:flex;gap:6px;align-items:center;padding:4px 0;font-size:.78rem;">
          <button class="btn btn-xs ${m.done ? 'btn-success' : 'btn-outline'}" onclick="Viora.toggleGoalMilestone('${idSafe}', ${i})" style="padding:2px 8px;font-size:.65rem;">
            <i class="fa-solid fa-${m.done ? 'check' : 'circle'}"></i>
          </button>
          <span style="${m.done ? 'text-decoration:line-through;color:var(--text-light);' : 'color:var(--text-secondary);'}">${_esc(m.text || '')}</span>
        </div>`).join('');
      const msExtra = ms.length > MAX_MILESTONES_RENDERED
        ? `<div style="font-size:.7rem;color:var(--text-light);padding:4px 0;">+ ${ms.length - MAX_MILESTONES_RENDERED} more…</div>`
        : '';

      return `<div class="card-3d">
        <div class="card-info">
          <div class="card-title">
            ${_esc(g.title || 'Untitled goal')}
            <span class="badge badge-${priCls}">${_esc(g.priority || 'medium')}</span>
            <span class="badge badge-${typeCls}">${g.type === 'long_term' ? 'Long-term' : 'Short-term'}</span>
          </div>
          ${g.description ? `<div class="card-sub">${_esc(g.description)}</div>` : ''}
          <div class="card-stats">
            <div class="stat"><span class="val">${pct}%</span><span class="lbl">Progress</span></div>
            <div class="stat"><span class="val">${msDone}/${ms.length}</span><span class="lbl">Milestones</span></div>
            <div class="stat"><span class="val">${target}</span><span class="lbl">Target</span></div>
            ${owner ? `<div class="stat"><span class="val">${_esc(owner.name || '')}</span><span class="lbl">Owner</span></div>` : ''}
          </div>
          <div class="progress-3d" style="margin-top:8px;">
            <div class="progress-3d-bar ${cls}" style="width:${pct}%;"></div>
          </div>
          ${ms.length ? `<div style="margin-top:8px;">${msHtml}${msExtra}</div>` : ''}
        </div>
        <div class="card-actions">
          <button class="btn btn-primary btn-xs" onclick="Viora.editPersonalGoal('${idSafe}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deletePersonalGoal('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');

    renderIfChanged(host, sig, html);
  } catch (e) { console.warn('renderPersonalGoals failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   SKILLS
   ═══════════════════════════════════════════════════════════════ */
export function renderPersonalSkills() {
  try {
    const state = safeState();
    const $ = safe$;
    const host = $('skillsCardGrid');
    if (!host) return;

    const filterOwner = personalOwnerFilter('skillOwnerFilter');
    const allSkills = Array.isArray(state.data.skills) ? state.data.skills : [];

    const list = [];
    for (const s of allSkills) {
      if (!s) continue;
      if (filterOwner && s.ownerUid && s.ownerUid !== filterOwner) continue;
      list.push(s);
    }
    list.sort((a, b) => num(b.hours) - num(a.hours));

    const sig = sigOf(list, ['name', 'level', 'hours', 'target', 'category', 'ownerUid']) +
      '|' + (filterOwner || 'all');

    if (!list.length) {
      renderIfChanged(host, 'empty',
        '<div class="empty-state" style="grid-column:1/-1;">No skills tracked yet. Click "New Skill" to add one — it will sync to the Viora Track mobile app.</div>');
      return;
    }

    const userIndex = getUserIndex();

    const html = list.map(s => {
      const hours = num(s.hours);
      const target = num(s.target);
      const pct = target > 0 ? Math.min(100, Math.round((hours / target) * 100)) : 0;
      const cls = pct >= 75 ? 'green' : pct >= 40 ? '' : 'gold';
      const owner = userIndex.get(s.ownerUid);
      const idSafe = q(s.id);
      const level = num(s.level) || 1;
      return `<div class="card-3d">
        <div class="card-info">
          <div class="card-title">
            ${_esc(s.name || 'Unnamed skill')}
            <span class="badge badge-purple">Level ${level}</span>
          </div>
          <div class="card-sub">${_esc(s.category || 'Other')}${owner ? ' · ' + _esc(owner.name || '') : ''}</div>
          <div class="progress-3d" style="margin-top:8px;">
            <div class="progress-3d-bar ${cls}" style="width:${pct}%;"></div>
          </div>
          <div class="progress-3d-label">
            <span>${hours}h / ${target}h</span>
            <span>${pct}%</span>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-success btn-xs" onclick="Viora.logPersonalSkillHours('${idSafe}', 0.5)">+0.5h</button>
          <button class="btn btn-success btn-xs" onclick="Viora.logPersonalSkillHours('${idSafe}', 1)">+1h</button>
          <button class="btn btn-success btn-xs" onclick="Viora.logPersonalSkillHours('${idSafe}', 2)">+2h</button>
          <button class="btn btn-primary btn-xs" onclick="Viora.editPersonalSkill('${idSafe}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deletePersonalSkill('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');

    renderIfChanged(host, sig, html);
  } catch (e) { console.warn('renderPersonalSkills failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   GOAL MILESTONE EDITOR (modal body)
   ═══════════════════════════════════════════════════════════════ */
export function renderGoalMilestoneEditor() {
  try {
    const state = safeState();
    const host = safe$('pgMilestonesList');
    if (!host) return;

    const ms = Array.isArray(state.editingPersonalGoal?.milestones)
      ? state.editingPersonalGoal.milestones
      : [];

    if (!ms.length) {
      renderIfChanged(host, 'empty',
        '<div style="font-size:.75rem;color:var(--text-light);padding:6px 0;">No milestones yet.</div>');
      return;
    }

    const sig = sigOf(ms.map((m, i) => ({ id: 'm' + i, text: m?.text || '', done: !!m?.done })), ['text', 'done']);

    const html = ms.map((m, i) => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;">
      <input type="checkbox" ${m.done ? 'checked' : ''} onchange="Viora.toggleMilestoneDraft(${i}, this.checked)" style="width:auto;" />
      <input type="text" value="${_esc(m.text || '')}" placeholder="Milestone ${i + 1}" oninput="Viora.updateMilestoneDraft(${i}, this.value)" style="flex:1;padding:8px 10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-input);color:var(--text-primary);" />
      <button type="button" class="btn btn-danger btn-xs" onclick="Viora.removeMilestoneDraft(${i})"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join('');

    renderIfChanged(host, sig, html);
  } catch (e) { console.warn('renderGoalMilestoneEditor failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   CACHE INVALIDATOR
   ═══════════════════════════════════════════════════════════════ */
export function invalidatePersonalCaches() {
  _userIndexStamp = '';
  _userIndexCache = null;
  /* Per-element signature cache is a WeakMap — DOM GC handles it. */
}
