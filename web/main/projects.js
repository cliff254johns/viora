// main/projects.js
// ═══════════════════════════════════════════════════════════════
// VIORA — Project & Task domain module  (v6.8 — debugged + optimized)
// ═══════════════════════════════════════════════════════════════

let _deps = null;

/* ── Safe dep accessors (never throw if _deps is null) ── */
const S          = () => (_deps && _deps.state) || { data: {}, operator: null };
const DATA       = () => S().data || {};
const getProject = (id) => (_deps && _deps.getProject) ? _deps.getProject(id) : null;
const uid        = () => _deps && _deps.uid ? _deps.uid() : 'x-' + Math.random().toString(36).slice(2, 8);
const todayStr   = () => _deps && _deps.todayStr ? _deps.todayStr() : new Date().toISOString().slice(0, 10);
const dateToStr  = (d) => _deps && _deps.dateToStr ? _deps.dateToStr(d) : new Date(d).toISOString().slice(0, 10);
const fmtDate    = (d) => _deps && _deps.fmtDate ? _deps.fmtDate(d) : (d || '—');
const fmtKES     = (n) => _deps && _deps.fmtKES ? _deps.fmtKES(n) : `KES ${Number(n || 0).toLocaleString()}`;
const escapeHtml = (s) => _deps && _deps.escapeHtml ? _deps.escapeHtml(s) : String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const toast      = (m, t) => (_deps && _deps.toast) ? _deps.toast(m, t) : console.log('[toast]', m);
const $          = (id) => (_deps && _deps.$) ? _deps.$(id) : document.getElementById(id);
const logActivity = (...args) => (_deps && _deps.logActivity) ? _deps.logActivity(...args) : Promise.resolve();
const upsertDoc  = (...args) => (_deps && _deps.upsertDoc) ? _deps.upsertDoc(...args) : Promise.reject(new Error('upsertDoc not injected'));
const emitEvent  = (...args) => { try { (_deps && _deps.EventBus && _deps.EventBus.emit) && _deps.EventBus.emit(...args); } catch (e) {} };

/* ── Small utilities ── */
const DAY_MS = 86400000;
const nowIso = () => new Date().toISOString();
const isArr  = Array.isArray;
const num    = (v) => Number(v) || 0;

/* Quote-escape for inline onclick handlers */
function q(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

/* Fallback implementations for optional deps */
const getInvoiceStatusDerived = (inv) =>
  (_deps && _deps.getInvoiceStatusDerived) ? _deps.getInvoiceStatusDerived(inv) : (inv?.status || 'draft');
const getInvoiceTotals = (inv) =>
  (_deps && _deps.getInvoiceTotals) ? _deps.getInvoiceTotals(inv) : { total: num(inv?.total) };
const getClientName = (id) =>
  (_deps && _deps.getClientName) ? _deps.getClientName(id) : (getProject(id)?.clientName || '—');
const contactButtons = (client, kind) =>
  (_deps && _deps.contactButtons) ? _deps.contactButtons(client, kind) : '';
const isOverdue = (d) => (_deps && _deps.isOverdue) ? _deps.isOverdue(d) : (!!d && d < todayStr());
const daysBetween = (d) => {
  if (!d) return 0;
  if (_deps && _deps.daysBetween) return _deps.daysBetween(d);
  return Math.ceil((new Date(d).getTime() - Date.now()) / DAY_MS);
};

/* ═══════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════ */
export function initProjects(deps) {
  _deps = deps;
  const api = {
    getProjectAgreedTotal,
    getProjectBilledTotal,
    getProjectPaidTotal,
    getProjectRemainingTotal,
    getProjectFinancialProgress,
    recomputeProjectProgress,
    bulkGenerateTasksForClient,
    renderProjects,
    renderTasks,
    renderProjectTasksEditor,
    renderProjectInstallmentEditor,
    removeProjectInstallment,
    renderClientProjectsFeeEditor,
    bindProjectAddTaskButton,
    createAutoWorklog,
     openProjectDeliverables, 
  };
  // Namespace instead of clobbering window
  window.Viora = window.Viora || {};
  Object.assign(window.Viora, api);
  // Also expose top-level for backwards compat only if not already defined
  for (const [k, v] of Object.entries(api)) {
    if (!(k in window)) window[k] = v;
  }
  return _deps;
}

/* ═══════════════════════════════════════════════════════════
   DERIVED MONEY HELPERS
   ═══════════════════════════════════════════════════════════ */
export function getProjectAgreedTotal(projectId) {
  if (!projectId) return 0;
  const p = getProject(projectId);
  if (!p) return 0;
  const explicit = num(p.agreedTotal);
  if (explicit > 0) return explicit;
  const insts = isArr(p.installments) ? p.installments : [];
  return insts.reduce((s, i) => s + num(i && i.amount), 0);
}

export function getProjectBilledTotal(projectId, excludeInvoiceId = null) {
  if (!projectId) return 0;
  const invoices = isArr(DATA().invoices) ? DATA().invoices : [];
  let total = 0;
  for (const inv of invoices) {
    if (!inv || inv.projectId !== projectId) continue;
    if (excludeInvoiceId && inv.id === excludeInvoiceId) continue;
    if (getInvoiceStatusDerived(inv) === 'draft') continue;
    total += num(getInvoiceTotals(inv).total);
  }
  return total;
}

export function getProjectPaidTotal(projectId) {
  if (!projectId) return 0;
  const payments = isArr(DATA().payments) ? DATA().payments : [];
  let total = 0;
  for (const p of payments) {
    if (!p || p.projectId !== projectId) continue;
    if (p.voided || p.reversed) continue;
    total += num(p.amount);
  }
  return total;
}

export function getProjectRemainingTotal(projectId) {
  return Math.max(0, getProjectAgreedTotal(projectId) - getProjectBilledTotal(projectId));
}

export function getProjectFinancialProgress(projectId) {
  const agreed = getProjectAgreedTotal(projectId);
  const paid   = getProjectPaidTotal(projectId);
  if (agreed <= 0) {
    return { pct: paid > 0 ? 100 : 0, agreed, paid, balance: 0 };
  }
  const pct = Math.min(100, Math.round((paid / agreed) * 10000) / 100);
  return { pct, agreed, paid, balance: Math.max(0, agreed - paid) };
}

/* ═══════════════════════════════════════════════════════════
   WORK PROGRESS
   ═══════════════════════════════════════════════════════════ */
const _lastProgressSig = new Map();

export async function recomputeProjectProgress(projectId) {
  if (!projectId) return null;
  const project = getProject(projectId);
  if (!project) return null;

  const tasks = (isArr(DATA().tasks) ? DATA().tasks : []).filter(t => t && t.projectId === projectId);
  const total = tasks.length;
  const done  = tasks.filter(t => t.status === 'done').length;

  // Compute even when total === 0 (progress → 0)
  const workPct = total === 0 ? 0 : Math.round((done / total) * 10000) / 100;

  let dirty = false;
  if (num(project.progress) !== workPct) {
    project.progress = workPct;
    project._progressUpdatedAt = nowIso();
    dirty = true;
  }

  // Auto-close check
  if (workPct >= 100 && total > 0) {
    const fin = getProjectFinancialProgress(projectId);
    if (fin.agreed > 0 && fin.pct >= 100 && project.status !== 'closed') {
      project.status = 'closed';
      project._closedAt = nowIso();
      project._closedBy = S().operator?.name || 'auto';
      project._closedWorkPct = workPct;
      project._closedPaidPct = fin.pct;
      dirty = true;
    }
  }

  // Single upsert
  if (dirty) {
    try {
      await upsertDoc('projects', project, project._rev);
    } catch (e) {
      console.warn('[viora] recomputeProjectProgress: save failed', e);
    }
  }

   /* Only fire the orchestration handoff if progress/status actually changed.
     Without this, every credit transfer re-triggers project-auto-close
     and related handlers, adding serialized round-trips for no reason. */
  const _sig = `${projectId}|${project.progress}|${project.status}`;
  if (_lastProgressSig.get(projectId) !== _sig) {
    _lastProgressSig.set(projectId, _sig);
    emitEvent('projects.upsert', project, project.id, project,
      { collection: 'projects', source: 'recomputeProjectProgress' });
  }

  return project;
}

/* ═══════════════════════════════════════════════════════════
   BULK TASK GENERATOR
   ═══════════════════════════════════════════════════════════ */
export async function bulkGenerateTasksForClient(opts) {
  const { clientId, fromDate, toDate, taskType, description } = opts || {};
  if (!clientId) throw new Error('Client is required');
  if (!fromDate || !toDate) throw new Error('Date range is required');

  const projects = (isArr(DATA().projects) ? DATA().projects : []).filter(p =>
    p && p.clientId === clientId &&
    (p.status === 'active' || p.status === 'pending')
  );
  if (!projects.length) throw new Error('No active projects for this client');

  const from = new Date(fromDate + 'T00:00:00');
  const to   = new Date(toDate   + 'T00:00:00');
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) {
    throw new Error('Invalid date range');
  }

  const dayCount = Math.floor((to - from) / DAY_MS) + 1;
  const days = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    days.push(dateToStr(d));
  }
  if (!days.length) throw new Error('No working days in that range');

  // Build dedupe index once: (projectId|dueDate)
  const existingKey = new Set();
  for (const t of (isArr(DATA().tasks) ? DATA().tasks : [])) {
    if (!t || t.status !== 'pending') continue;
    if (!t.projectId || !t.dueDate) continue;
    if (!t.autoGenerated) continue;
    existingKey.add(`${t.projectId}|${t.dueDate}`);
  }

  const toCreate = [];
  for (const proj of projects) {
    for (const day of days) {
      const key = `${proj.id}|${day}`;
      if (existingKey.has(key)) continue;
      existingKey.add(key); // prevent dupes within this same run
      const title = `${description || 'Scheduled work'} — ${proj.projectNumber || proj.title} — ${fmtDate(day)}`;
      toCreate.push({
        id: uid(),
        title,
        description: `Bulk-generated task`,
        dueDate: day,
        taskType: taskType || 'Client Delivery',
        priority: 'medium',
        status: 'pending',
        assignedTo: proj.projectLead || S().operator?.name || 'Ops',
        projectId: proj.id,
        createdAt: nowIso(),
        autoGenerated: true
      });
    }
  }

  // Parallel writes with concurrency cap
  let created = 0;
  const CONCURRENCY = 8;
  for (let i = 0; i < toCreate.length; i += CONCURRENCY) {
    const batch = toCreate.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(t => upsertDoc('tasks', t)));
    for (const r of results) if (r.status === 'fulfilled') created++;
  }

  await logActivity('add', 'Bulk tasks generated',
    `${created} tasks · ${projects.length} project(s) · ${days.length} working day(s)`);
  return { created, projects: projects.length, days: days.length };
}

export async function createAutoWorklog(payload) {
  // Worklogs were removed from the app — this is intentionally a no-op.
  return null;
}

/* ═══════════════════════════════════════════════════════════
   RENDER — PROJECTS TABLE
   ═══════════════════════════════════════════════════════════ */
export function renderProjects() {
  try {
    const filter = ($('projectSearch')?.value || '').toLowerCase().trim();
    const sf = $('projectFilterStatus')?.value || 'all';
    let list = isArr(DATA().projects) ? DATA().projects : [];

    if (filter) {
      list = list.filter(p =>
        (p.projectNumber || '').toLowerCase().includes(filter) ||
        (p.title || '').toLowerCase().includes(filter) ||
        getClientName(p.clientId).toLowerCase().includes(filter)
      );
    }
    if (sf !== 'all') list = list.filter(p => p.status === sf);

    const tb = $('projectsBody');
    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="7" class="empty-state">No projects yet.</td></tr>`;
      return;
    }

    // Build task index once: projectId → { total, done }
    const taskStats = new Map();
    for (const t of (isArr(DATA().tasks) ? DATA().tasks : [])) {
      if (!t || !t.projectId) continue;
      let s = taskStats.get(t.projectId);
      if (!s) { s = { total: 0, done: 0 }; taskStats.set(t.projectId, s); }
      s.total++;
      if (t.status === 'done') s.done++;
    }

    // Build financial index once
    const projects = list;
    const rows = projects.map(p => {
      const client = _deps?.getClient ? _deps.getClient(p.clientId) : null;
      const stats = taskStats.get(p.id) || { total: 0, done: 0 };
      const workPct = stats.total > 0 ? Math.round((stats.done / stats.total) * 10000) / 100 : 0;
      const fin = getProjectFinancialProgress(p.id);
      const paidPct = fin.pct;

      const workCls = workPct >= 100 ? 'green' : workPct >= 50 ? '' : 'gold';
      const paidCls = paidPct >= 100 ? 'green' : paidPct >= 50 ? '' : 'gold';
      const statusSafe = q(p.status || '');
      const idSafe = q(p.id);

      return `<tr>
        <td><strong>${escapeHtml(p.projectNumber || '')}</strong></td>
        <td>${escapeHtml(p.title || '')}</td>
        <td>${escapeHtml(getClientName(p.clientId))}${client ? contactButtons(client, 'client') : ''}</td>
        <td style="min-width:220px;">
          <div class="progress-3d" style="height:6px;">
            <div class="progress-3d-bar ${workCls}" style="width:${workPct}%;"></div>
          </div>
          <div class="progress-3d-label" style="margin-bottom:6px;">
            <span style="font-size:.68rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;font-weight:700;">Work</span>
            <span style="font-size:.7rem;">${stats.done}/${stats.total} tasks · ${workPct}%</span>
          </div>
          <div class="progress-3d" style="height:6px;">
            <div class="progress-3d-bar ${paidCls}" style="width:${paidPct}%;"></div>
          </div>
          <div class="progress-3d-label">
            <span style="font-size:.68rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;font-weight:700;">Paid</span>
            <span style="font-size:.7rem;">${fmtKES(fin.paid)} / ${fmtKES(fin.agreed)} · ${paidPct}%</span>
          </div>
        </td>
        <td>${p.nextMilestone ? fmtDate(p.nextMilestone) : '—'}</td>
        <td><span class="badge badge-${statusSafe}">${escapeHtml(p.status || '')}</span></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-success btn-xs" onclick="Viora.openProjectDeliverables('${idSafe}')" title="Deliverables / Presentation"><i class="fa-solid fa-file-arrow-up"></i></button>
          <button class="btn btn-gold btn-xs" onclick="Viora.openServiceAgreement('${idSafe}')" title="Service Agreement"><i class="fa-solid fa-file-contract"></i></button>
          <button class="btn btn-primary btn-xs" onclick="Viora.editProject('${idSafe}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteProject('${idSafe}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    });

    tb.innerHTML = rows.join('');
  } catch (e) { console.warn('renderProjects failed', e); }
}

/* ═══════════════════════════════════════════════════════════
   RENDER — TASKS  (pending first, done last)
   ═══════════════════════════════════════════════════════════ */
export function renderTasks() {
  try {
    const filter = ($('taskSearch')?.value || '').toLowerCase().trim();
    const sf = $('taskFilterStatus')?.value || 'all';
    let list = isArr(DATA().tasks) ? DATA().tasks : [];

    if (filter) {
      list = list.filter(t =>
        (t.title || '').toLowerCase().includes(filter) ||
        (t.description || '').toLowerCase().includes(filter));
    }
    if (sf === 'pending') list = list.filter(t => t.status === 'pending');
    else if (sf === 'done') list = list.filter(t => t.status === 'done');
    else if (sf === 'overdue') list = list.filter(t => t.status === 'pending' && isOverdue(t.dueDate));

    // Pending first (soonest due first); done last (most recently completed first)
    list = list.slice().sort((a, b) => {
      const aDone = a.status === 'done' ? 1 : 0;
      const bDone = b.status === 'done' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      if (aDone === 0) {
        const aD = a.dueDate || '9999-12-31';
        const bD = b.dueDate || '9999-12-31';
        if (aD < bD) return -1;
        if (aD > bD) return 1;
        const aC = a.createdAt || '';
        const bC = b.createdAt || '';
        return aC < bC ? -1 : aC > bC ? 1 : 0;
      }

      const aC = a._completedAt || a.updatedAt || a.createdAt || '';
      const bC = b._completedAt || b.updatedAt || b.createdAt || '';
      return bC < aC ? -1 : bC > aC ? 1 : 0;
    });

    const c = $('taskCards');
    if (!c) return;
    if (!list.length) {
      c.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No tasks yet.</div>`;
      return;
    }

    // Project number index once
    const projNum = new Map();
    for (const p of (isArr(DATA().projects) ? DATA().projects : [])) {
      if (p && p.id) projNum.set(p.id, p.projectNumber || '—');
    }

    c.innerHTML = list.map(t => {
      const isDone = t.status === 'done';
      let ov = false, days = 0;
      if (!isDone) {
        ov = isOverdue(t.dueDate);
        days = daysBetween(t.dueDate);
      }

      let cdCls = 'ok', cdText = '';
      if (isDone) {
        cdCls = 'done';
        cdText = 'COMPLETED';
      } else {
        if (ov)              { cdCls = 'urgent'; cdText = Math.abs(days) + 'd overdue'; }
        else if (days === 0) { cdCls = 'urgent'; cdText = 'DUE TODAY'; }
        else if (days <= 3)  { cdCls = 'urgent'; cdText = days + 'd left'; }
        else if (days <= 7)  { cdCls = 'warn';   cdText = days + 'd left'; }
        else                 { cdText = days + 'd left'; }
      }

      const linked = t.projectId ? (projNum.get(t.projectId) || '—') : 'None';
      const cls = isDone ? 'done' : ov ? 'overdue' : '';
      const idSafe = q(t.id);
      const priority = t.priority || 'medium';

      return `<div class="card-3d ${cls}">
        <div class="card-info">
          <div class="card-title">${escapeHtml(t.title || '')}
            <span class="badge badge-${q(priority)}">${escapeHtml(priority)}</span>
            ${isDone ? '<span class="badge badge-paid">Done</span>' : ''}
          </div>
          ${t.description ? `<div class="card-sub">${escapeHtml(t.description)}</div>` : ''}
        </div>
        <div class="card-stats">
          <div class="stat"><span class="val">${fmtDate(t.dueDate)}</span><span class="lbl">Due</span></div>
          <div class="stat"><span class="val">${escapeHtml(linked)}</span><span class="lbl">Project</span></div>
          <div class="stat"><span class="val">${fmtKES(t.price || t.estimatedAmount || 0)}</span><span class="lbl">Price</span></div>
          <div class="stat"><span class="countdown-timer ${cdCls}">${cdText}</span></div>
        </div>
        <div class="card-actions">
          <button class="btn btn-success btn-xs" onclick="Viora.toggleTask('${idSafe}')" title="${isDone ? 'Reopen' : 'Mark done'}">
            <i class="fa-solid fa-${isDone ? 'rotate-left' : 'check'}"></i>
          </button>
          <button class="btn btn-primary btn-xs" onclick="Viora.editTask('${idSafe}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteTask('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    console.warn('renderTasks failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════
   PROJECT MODAL — TASK EDITOR
   ═══════════════════════════════════════════════════════════ */
let _ptEditorBound = false;

export function renderProjectTasksEditor() {
  const host  = $('projectTasksEditor');
  const empty = $('projectTasksEmpty');
  if (!host) return;

  const draft = S()._projectTasksDraft || [];

  if (!draft.length) {
    host.innerHTML = '';
    if (empty) empty.style.display = 'block';
    bindProjectAddTaskButton();
    return;
  }
  if (empty) empty.style.display = 'none';

  host.innerHTML = draft.map((t, i) => `
    <div style="display:grid;grid-template-columns:1fr 130px 110px 38px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-color);">
      <input type="text"
             class="pt-title"
             data-idx="${i}"
             value="${escapeHtml(t.title || '')}"
             placeholder="Task title (e.g. Kickoff meeting)"
             style="padding:8px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-card-solid);color:var(--text-primary);font-size:.82rem;" />
      <input type="date"
             class="pt-due"
             data-idx="${i}"
             value="${escapeHtml(t.dueDate || '')}"
             style="padding:8px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-card-solid);color:var(--text-primary);font-size:.82rem;" />
      <select class="pt-priority"
              data-idx="${i}"
              style="padding:8px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-card-solid);color:var(--text-primary);font-size:.82rem;">
        <option value="high"   ${t.priority === 'high'   ? 'selected' : ''}>High</option>
        <option value="medium" ${t.priority === 'medium' ? 'selected' : ''}>Medium</option>
        <option value="low"    ${t.priority === 'low'    ? 'selected' : ''}>Low</option>
      </select>
      <button type="button" class="btn btn-danger btn-xs pt-remove" data-idx="${i}" title="Remove">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `).join('');

  if (!_ptEditorBound) {
    _ptEditorBound = true;
    host.addEventListener('input', (e) => {
      const tgt = e.target;
      const idx = Number(tgt.dataset?.idx);
      const draftNow = S()._projectTasksDraft;
      if (isNaN(idx) || !draftNow || !draftNow[idx]) return;
      if (tgt.classList.contains('pt-title'))    draftNow[idx].title    = tgt.value;
      else if (tgt.classList.contains('pt-due'))      draftNow[idx].dueDate  = tgt.value;
      else if (tgt.classList.contains('pt-priority')) draftNow[idx].priority = tgt.value;
    });
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('.pt-remove');
      if (!btn) return;
      const draftNow = S()._projectTasksDraft;
      if (!draftNow) return;
      draftNow.splice(Number(btn.dataset.idx), 1);
      renderProjectTasksEditor();
    });
  }

  bindProjectAddTaskButton();
}

export function bindProjectAddTaskButton() {
  const btn = document.getElementById('projectAddTaskBtn');
  if (!btn || !btn.parentNode) return;
  if (btn._vioraTaskBtnBound) return;

  const fresh = btn.cloneNode(true);
  fresh._vioraTaskBtnBound = true;
  btn.parentNode.replaceChild(fresh, btn);

  fresh.addEventListener('click', () => {
    const s = S();
    s._projectTasksDraft = s._projectTasksDraft || [];
    s._projectTasksDraft.push({
      id: null,
      title: '',
      dueDate: dateToStr(new Date(Date.now() + 14 * DAY_MS)),
      priority: 'medium',
      status: 'pending'
    });
    renderProjectTasksEditor();
  });
}

/* Deferred initial bind — only if deps already injected */
if (typeof document !== 'undefined') {
  const doBind = () => { try { bindProjectAddTaskButton(); } catch (e) {} };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', doBind);
  } else if (_deps) {
    doBind();
  }
}

/* ═══════════════════════════════════════════════════════════
   PROJECT MODAL — INSTALLMENT EDITOR
   ═══════════════════════════════════════════════════════════ */
function getInstallmentTarget() {
  const s = S();
  if (isArr(s.pendingProjectInstallments)) return s.pendingProjectInstallments;
  const editId = $('editProjectId')?.value;
  if (editId) {
    const p = getProject(editId);
    if (p && isArr(p.installments)) return p.installments;
  }
  return null;
}

export function renderProjectInstallmentEditor(insts) {
  const host = $('projectInstallmentEditor');
  if (!host) return;
  if (!insts || !insts.length) {
    host.style.display = 'none';
    host.innerHTML = '';
    return;
  }
  host.style.display = 'block';
  const today = todayStr();

  host.innerHTML = insts.map((inst, i) => {
    const ov = !inst.paid && inst.dueDate && inst.dueDate < today;
    const cls = inst.paid ? 'paid' : ov ? 'overdue' : '';
    const partial = num(inst.partialPaid);
    const remaining = Math.max(0, num(inst.amount) - partial);
    const shortfallLine = partial > 0 && !inst.paid
      ? `<div style="font-size:.68rem;color:var(--accent-gold);margin-top:2px;">
           Received ${fmtKES(partial)} · Balance ${fmtKES(remaining)}
         </div>`
      : '';
    return `
      <div class="installment-row ${cls}">
        <div class="inst-info">
          <strong>${escapeHtml(inst.label || ('Installment ' + (i + 1)))}</strong>
          <div style="font-size:.7rem;color:var(--text-secondary);margin-top:4px;">
            Due:
            <input type="date" class="projInstDate" data-idx="${i}" value="${escapeHtml(inst.dueDate || '')}"
                   style="padding:2px 6px;font-size:.7rem;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);" />
          </div>
          ${shortfallLine}
        </div>
        <input type="number" class="projInstAmount" data-idx="${i}" value="${num(inst.amount)}"
               step="0.01" min="0"
               style="width:120px;padding:4px 8px;border-radius:8px;border:1.5px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-weight:700;font-size:.85rem;" />
        <label style="display:flex;align-items:center;gap:4px;font-size:.72rem;">
          <input type="checkbox" class="projInstPaid" data-idx="${i}" ${inst.paid ? 'checked' : ''} /> Paid
        </label>
        <button type="button" class="btn btn-danger btn-xs" data-inst-remove="${i}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>`;
  }).join('');

  // Delegated handlers — bind once per render
  host.querySelectorAll('.projInstDate').forEach(inp => {
    inp.onchange = (e) => {
      const i = Number(e.target.dataset.idx);
      const arr = getInstallmentTarget();
      if (arr && arr[i]) arr[i].dueDate = e.target.value;
    };
  });
  host.querySelectorAll('.projInstAmount').forEach(inp => {
    inp.onchange = (e) => {
      const i = Number(e.target.dataset.idx);
      const v = Math.max(0, parseFloat(e.target.value) || 0);
      e.target.value = v;
      const arr = getInstallmentTarget();
      if (arr && arr[i]) arr[i].amount = v;
    };
  });
  host.querySelectorAll('.projInstPaid').forEach(inp => {
    inp.onchange = (e) => {
      const i = Number(e.target.dataset.idx);
      const arr = getInstallmentTarget();
      if (arr && arr[i]) {
        arr[i].paid = e.target.checked;
        arr[i].paidDate = e.target.checked ? todayStr() : null;
      }
    };
  });
  host.querySelectorAll('[data-inst-remove]').forEach(btn => {
    btn.onclick = () => removeProjectInstallment(Number(btn.dataset.instRemove));
  });
}

export function removeProjectInstallment(i) {
  const arr = getInstallmentTarget();
  if (!arr) { toast('No installment list to modify.', 'error'); return; }
  if (!confirm('Remove this installment?')) return;
  arr.splice(i, 1);
  renderProjectInstallmentEditor(arr);
}

/* ═══════════════════════════════════════════════════════════
   CLIENT MODAL — PER-PROJECT FEE EDITOR
   ═══════════════════════════════════════════════════════════ */
export function renderClientProjectsFeeEditor(clientId) {
  const host = $('clientProjectsFeeEditor');
  if (!host) return;
  const projects = (_deps && _deps.getClientProjects) ? _deps.getClientProjects(clientId) : [];
  const clientIdSafe = q(clientId);

  const addBtn = `
    <div style="margin-top:12px;display:flex;justify-content:flex-end;">
      <button type="button" class="btn btn-primary btn-sm" onclick="Viora.addProjectFromClientEditor('${clientIdSafe}')">
        <i class="fa-solid fa-plus"></i> Add Another Project
      </button>
    </div>`;

  if (!projects.length) {
    host.innerHTML = `
      <div style="padding:14px;background:var(--bg-input);border-radius:12px;border:1px dashed var(--border-color);text-align:center;">
        <div style="font-size:.82rem;color:var(--text-secondary);margin-bottom:10px;">
          This client has <strong>no projects yet</strong>. Add one to start tracking its agreed amount and installments.
        </div>
        <button type="button" class="btn btn-primary btn-sm" onclick="Viora.addProjectFromClientEditor('${clientIdSafe}')">
          <i class="fa-solid fa-plus"></i> Add a project
        </button>
      </div>`;
    return;
  }

  // Pre-index payments & invoices by projectId for O(1) lookups
  const paymentsByProject = new Map();
  for (const p of (isArr(DATA().payments) ? DATA().payments : [])) {
    if (!p || !p.projectId || p.voided || p.reversed) continue;
    paymentsByProject.set(p.projectId, (paymentsByProject.get(p.projectId) || 0) + num(p.amount));
  }

  const today = todayStr();
  let grandAgreed = 0, grandPaid = 0;

  const projectCards = projects.map(p => {
    const agreed = getProjectAgreedTotal(p.id);
    const paid = paymentsByProject.get(p.id) || getProjectPaidTotal(p.id);
    grandAgreed += agreed;
    grandPaid += paid;
    const balance = Math.max(0, agreed - paid);
    const pct = agreed > 0 ? Math.min(100, Math.round((paid / agreed) * 100)) : 0;

    const insts = isArr(p.installments) ? p.installments : [];
    const instRows = insts.length
      ? insts.map((inst, i) => {
          const ov = !inst.paid && inst.dueDate && inst.dueDate < today;
          const mark = inst.paid ? '✓' : ov ? '⚠' : '○';
          const markColor = inst.paid ? 'var(--accent-green)' : ov ? 'var(--accent-red)' : 'var(--text-secondary)';
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:8px;background:var(--bg-card-solid);margin-bottom:4px;font-size:.78rem;">
              <span style="flex:1;min-width:0;">
                <span style="color:${markColor};font-weight:600;">${mark}</span>
                ${escapeHtml(inst.label || ('Installment ' + (i + 1)))}
              </span>
              <span style="color:var(--text-secondary);white-space:nowrap;">${fmtDate(inst.dueDate)}</span>
              <strong style="white-space:nowrap;">${fmtKES(inst.amount)}</strong>
            </div>`;
        }).join('')
      : `<div style="padding:8px 10px;font-size:.75rem;color:var(--text-light);font-style:italic;">No installments generated yet. Open the project to add them.</div>`;

    const pidSafe = q(p.id);
    return `
      <div class="client-project-card" style="padding:12px;background:var(--bg-input);border-radius:10px;border:1px solid var(--border-color);margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;">
          <div style="min-width:0;flex:1;">
            <strong style="font-size:.9rem;">${escapeHtml(p.projectNumber || '—')}</strong>
            <div style="font-size:.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.title || '')}</div>
          </div>
          <button type="button" class="btn btn-outline btn-xs" onclick="Viora.editProject('${pidSafe}')" title="Open project">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </button>
        </div>

        <div class="progress-3d" style="margin-bottom:6px;height:5px;">
          <div class="progress-3d-bar ${pct >= 100 ? 'green' : pct >= 50 ? '' : 'gold'}" style="width:${pct}%;"></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;font-size:.75rem;">
          <div>
            <div style="color:var(--text-secondary);font-size:.65rem;text-transform:uppercase;letter-spacing:.5px;">Agreed</div>
            <strong style="color:var(--text-primary);">${fmtKES(agreed)}</strong>
          </div>
          <div>
            <div style="color:var(--text-secondary);font-size:.65rem;text-transform:uppercase;letter-spacing:.5px;">Paid</div>
            <strong style="color:var(--accent-green);">${fmtKES(paid)}</strong>
          </div>
          <div>
            <div style="color:var(--text-secondary);font-size:.65rem;text-transform:uppercase;letter-spacing:.5px;">Balance</div>
            <strong style="color:${balance > 0 ? 'var(--accent-gold)' : 'var(--accent-green)'};">${fmtKES(balance)}</strong>
          </div>
        </div>

        <div style="font-size:.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700;letter-spacing:.5px;margin-bottom:6px;">
          Installments (${insts.length})
        </div>
        ${instRows}
      </div>`;
  }).join('');

  const grandBalance = Math.max(0, grandAgreed - grandPaid);

  host.innerHTML = `
    <h4 class="form-section" style="margin-top:0;">
      <i class="fa-solid fa-folder"></i> Projects (${projects.length})
    </h4>
    <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:10px;">
      Each project carries its own agreed amount and its own installment schedule.
      The client's total is the sum below.
    </div>
    ${projectCards}

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:12px;background:var(--bg-elev-2);border-radius:10px;margin-top:10px;border:1px solid var(--border-color);">
      <div>
        <div style="font-size:.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700;letter-spacing:.5px;">Client Total (all projects)</div>
        <div style="font-size:1rem;font-weight:800;color:var(--accent-blue);">${fmtKES(grandAgreed)}</div>
      </div>
      <div>
        <div style="font-size:.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700;letter-spacing:.5px;">Paid</div>
        <div style="font-size:1rem;font-weight:800;color:var(--accent-green);">${fmtKES(grandPaid)}</div>
      </div>
      <div>
        <div style="font-size:.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700;letter-spacing:.5px;">Balance</div>
        <div style="font-size:1rem;font-weight:800;color:${grandBalance > 0 ? 'var(--accent-gold)' : 'var(--accent-green)'};">${fmtKES(grandBalance)}</div>
      </div>
    </div>
    <div style="font-size:.7rem;color:var(--text-light);text-align:center;margin-top:6px;">
      Client total = sum of every project below. Clients do not own their own installment schedule.
    </div>
    ${addBtn}
  `;
}
/* ═══════════════════════════════════════════════════════════
   PROJECT DELIVERABLES MODAL
   ─────────────────────────────────────────────────────────────
   Opened by the "Deliverables" button in renderProjects().
   Shows everything a client would consider a deliverable:
     • Completed tasks (work delivered)
     • Documents in the vault linked to this project
     • Invoices issued against this project
     • Service agreement status
   Plus a quick form to record a new deliverable as a document.
   ═══════════════════════════════════════════════════════════ */
export function openProjectDeliverables(projectId) {
  const project = getProject(projectId);
  if (!project) {
    toast('Project not found.', 'error');
    return;
  }

  const tasks = (isArr(DATA().tasks) ? DATA().tasks : [])
    .filter(t => t && t.projectId === projectId)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

  const documents = (isArr(DATA().documents) ? DATA().documents : [])
    .filter(d => d && d.parentId === projectId);

  const invoices = (isArr(DATA().invoices) ? DATA().invoices : [])
    .filter(inv => inv && inv.projectId === projectId);

  const done = tasks.filter(t => t.status === 'done').length;
  const total = tasks.length;
  const workPct = total > 0 ? Math.round((done / total) * 10000) / 100 : 0;

  const fin = getProjectFinancialProgress(projectId);

  // ── Build modal (once, then reuse) ──
  let modal = document.getElementById('projectDeliverablesModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'projectDeliverablesModal';
    modal.innerHTML = `
      <div class="modal xl">
        <button type="button" class="close-modal" id="pdCloseX" aria-label="Close">&times;</button>
        <h2>
          <span class="modal-icon"><i class="fa-solid fa-file-arrow-up"></i></span>
          Deliverables — <span id="pdProjectTitle">Project</span>
        </h2>
        <div id="pdSummary" class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:18px;"></div>
        <div id="pdWorkProgress" style="margin-bottom:18px;"></div>

        <div class="chart-grid">
          <div class="chart-box">
            <h4><i class="fa-solid fa-list-check"></i> Tasks (<span id="pdTaskCount">0</span>)</h4>
            <div id="pdTaskList" style="max-height:320px;overflow-y:auto;"></div>
          </div>
          <div class="chart-box">
            <h4><i class="fa-solid fa-folder"></i> Documents (<span id="pdDocCount">0</span>)</h4>
            <div id="pdDocList" style="max-height:320px;overflow-y:auto;"></div>
          </div>
          <div class="chart-box chart-full">
            <h4><i class="fa-solid fa-file-invoice"></i> Invoices (<span id="pdInvCount">0</span>)</h4>
            <div id="pdInvList"></div>
          </div>
        </div>

        <div style="margin-top:20px;padding:16px;background:var(--bg-input);border-radius:12px;border:1px solid var(--border-color);">
          <h4 style="margin:0 0 12px 0;font-size:.85rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;">
            <i class="fa-solid fa-plus"></i> Record a new deliverable
          </h4>
          <div class="form-row">
            <div><label>Title *</label><input id="pdNewTitle" placeholder="e.g. Final UAT sign-off" /></div>
            <div><label>Category</label>
              <select id="pdNewCategory">
                <option>Deliverable</option>
                <option>Sign-off</option>
                <option>Report</option>
                <option>Presentation</option>
                <option>Handover</option>
                <option>Other</option>
              </select>
            </div>
          </div>
          <label>Notes</label>
          <textarea id="pdNewNotes" rows="2" placeholder="Optional description of what was delivered"></textarea>
          <div class="form-actions" style="justify-content:flex-end;margin-top:12px;">
            <button type="button" class="btn btn-success" id="pdNewSubmit">
              <i class="fa-solid fa-check"></i> Save deliverable
            </button>
          </div>
        </div>

        <div class="form-actions" style="margin-top:16px;">
          <button type="button" class="btn btn-outline" id="pdCloseBtn">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // ── CLOSE HANDLERS (attached once, work forever) ──
    const doClose = () => {
      if (typeof closeModal === 'function') {
        closeModal('projectDeliverablesModal');
      } else {
        // Fallback if closeModal isn't wired
        modal.classList.remove('active');
        modal.style.display = '';
        document.body.style.overflow = '';
      }
    };

    modal.querySelector('#pdCloseX').addEventListener('click', doClose);
    modal.querySelector('#pdCloseBtn').addEventListener('click', doClose);

    // Outside-click closes
    modal.addEventListener('click', (e) => {
      if (e.target === modal) doClose();
    });

    // Escape closes (scoped to when this modal is active)
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); doClose(); }
    });

    // Save deliverable (attached ONCE — no recursion)
    modal.querySelector('#pdNewSubmit').addEventListener('click', async () => {
      const pid = modal.dataset.projectId;
      if (!pid) return;
      const title = (modal.querySelector('#pdNewTitle').value || '').trim();
      const category = modal.querySelector('#pdNewCategory').value;
      const notes = (modal.querySelector('#pdNewNotes').value || '').trim();
      if (!title) { toast('Title is required.', 'error'); return; }

      const proj = getProject(pid);
      if (!proj) { toast('Project not found.', 'error'); return; }

      const doc = {
        id: uid(),
        title,
        system: 'Operations',
        category,
        parentId: pid,
        parentName: `${proj.projectNumber || ''} — ${proj.title || ''}`.trim(),
        fileName: `${title.replace(/[^a-z0-9]/gi, '_')}.txt`,
        mime: 'text/plain',
        size: notes.length,
        data: 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(notes || title))),
        uploadedAt: nowIso(),
        uploadedBy: S().operator?.name || 'system',
        _isDeliverable: true
      };

      try {
        await upsertDoc('documents', doc);
        await logActivity('add', 'Deliverable recorded', `${proj.projectNumber || proj.title} — ${title}`);
        toast('Deliverable saved.', 'success');
        modal.querySelector('#pdNewTitle').value = '';
        modal.querySelector('#pdNewNotes').value = '';
        // Refresh the modal contents in-place without re-creating it
        refreshDeliverablesModalBody(pid);
      } catch (err) {
        toast('Save failed: ' + err.message, 'error');
      }
    });
  }

  // ── Populate ──
  modal.dataset.projectId = projectId;
  refreshDeliverablesModalBody(projectId);

  // ── Open with proper helper ──
  if (typeof openModal === 'function') {
    openModal('projectDeliverablesModal');
  } else {
    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

/* ── Helper: refresh modal contents without re-creating the modal ── */
function refreshDeliverablesModalBody(projectId) {
  const modal = document.getElementById('projectDeliverablesModal');
  if (!modal) return;

  const project = getProject(projectId);
  if (!project) return;

  const tasks = (isArr(DATA().tasks) ? DATA().tasks : [])
    .filter(t => t && t.projectId === projectId)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

  const documents = (isArr(DATA().documents) ? DATA().documents : [])
    .filter(d => d && d.parentId === projectId);

  const invoices = (isArr(DATA().invoices) ? DATA().invoices : [])
    .filter(inv => inv && inv.projectId === projectId);

  const done = tasks.filter(t => t.status === 'done').length;
  const total = tasks.length;
  const workPct = total > 0 ? Math.round((done / total) * 10000) / 100 : 0;
  const fin = getProjectFinancialProgress(projectId);

  modal.querySelector('#pdProjectTitle').textContent =
    `${project.projectNumber || ''} — ${project.title || ''}`.trim() || projectId;

  // Summary tiles
  const summary = modal.querySelector('#pdSummary');
  summary.innerHTML = `
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-list-check"></i></div><div class="label">Tasks</div><div class="number">${done}/${total}</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-folder"></i></div><div class="label">Documents</div><div class="number">${documents.length}</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-file-invoice"></i></div><div class="label">Invoices</div><div class="number">${invoices.length}</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-coins"></i></div><div class="label">Paid</div><div class="number">${fmtKES(fin.paid)}</div></div>
  `;

  // Progress bars
  const wp = modal.querySelector('#pdWorkProgress');
  const wCls = workPct >= 100 ? 'green' : workPct >= 50 ? '' : 'gold';
  const pCls = fin.pct >= 100 ? 'green' : fin.pct >= 50 ? '' : 'gold';
  wp.innerHTML = `
    <div class="progress-3d" style="height:8px;">
      <div class="progress-3d-bar ${wCls}" style="width:${workPct}%;"></div>
    </div>
    <div class="progress-3d-label" style="margin-bottom:10px;">
      <span style="font-size:.72rem;color:var(--text-secondary);text-transform:uppercase;font-weight:700;">Work delivered</span>
      <span style="font-size:.75rem;">${workPct}% (${done}/${total})</span>
    </div>
    <div class="progress-3d" style="height:8px;">
      <div class="progress-3d-bar ${pCls}" style="width:${fin.pct}%;"></div>
    </div>
    <div class="progress-3d-label">
      <span style="font-size:.72rem;color:var(--text-secondary);text-transform:uppercase;font-weight:700;">Payment received</span>
      <span style="font-size:.75rem;">${fin.pct}% (${fmtKES(fin.paid)} of ${fmtKES(fin.agreed)})</span>
    </div>
  `;

  // Task list
  modal.querySelector('#pdTaskCount').textContent = String(tasks.length);
  const taskList = modal.querySelector('#pdTaskList');
  if (!tasks.length) {
    taskList.innerHTML = `<div class="empty-state">No tasks attached to this project.</div>`;
  } else {
    taskList.innerHTML = tasks.map(t => {
      const isDone = t.status === 'done';
      const icon = isDone ? 'fa-circle-check' : 'fa-circle';
      const color = isDone ? 'var(--accent-green)' : 'var(--text-light)';
      const doneAt = t._completedAt ? ` · done ${fmtDate(String(t._completedAt).slice(0, 10))}` : '';
      return `<div style="display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border-color);">
        <i class="fa-solid ${icon}" style="color:${color};margin-top:3px;"></i>
        <div style="flex:1;min-width:0;">
          <div style="font-size:.82rem;font-weight:600;">${escapeHtml(t.title || '')}</div>
          <div style="font-size:.7rem;color:var(--text-secondary);">${fmtDate(t.dueDate)}${doneAt}</div>
        </div>
      </div>`;
    }).join('');
  }

  // Document list
  modal.querySelector('#pdDocCount').textContent = String(documents.length);
  const docList = modal.querySelector('#pdDocList');
  if (!documents.length) {
    docList.innerHTML = `<div class="empty-state">No documents linked to this project yet.</div>`;
  } else {
    docList.innerHTML = documents.map(d => `
      <div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-color);">
        <i class="fa-solid fa-file" style="color:var(--accent-blue);"></i>
        <div style="flex:1;min-width:0;">
          <div style="font-size:.82rem;font-weight:600;">${escapeHtml(d.title || d.fileName || '')}</div>
          <div style="font-size:.7rem;color:var(--text-secondary);">${escapeHtml(d.category || '')} · ${fmtDate(String(d.uploadedAt || '').slice(0, 10))}</div>
        </div>
        ${d.data ? `<button class="btn btn-primary btn-xs" onclick="Viora.viewDoc('${q(d.id)}')"><i class="fa-solid fa-eye"></i></button>` : ''}
      </div>
    `).join('');
  }

  // Invoice list
  modal.querySelector('#pdInvCount').textContent = String(invoices.length);
  const invList = modal.querySelector('#pdInvList');
  if (!invoices.length) {
    invList.innerHTML = `<div class="empty-state">No invoices raised against this project.</div>`;
  } else {
    invList.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:.82rem;">
      <thead><tr>
        <th style="text-align:left;padding:6px;">Invoice</th>
        <th style="text-align:left;padding:6px;">Date</th>
        <th style="text-align:left;padding:6px;">Status</th>
        <th style="text-align:right;padding:6px;">Total</th>
      </tr></thead>
      <tbody>${invoices.map(inv => {
        const tot = num(getInvoiceTotals(inv).total);
        const st = getInvoiceStatusDerived(inv);
        const cls = st === 'paid' ? 'paid' : st === 'overdue' ? 'overdue' : 'pending';
        return `<tr>
          <td style="padding:6px;">${escapeHtml(inv.number || '')}</td>
          <td style="padding:6px;">${fmtDate(inv.date)}</td>
          <td style="padding:6px;"><span class="badge badge-${cls}">${escapeHtml(st)}</span></td>
          <td style="padding:6px;text-align:right;font-weight:600;">${fmtKES(tot)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }
}
