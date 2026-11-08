// File: main/training.js
// VIORA — TRAINING SUBSYSTEM (v8.1 — full, hardened)
// All 12 fixes from the patch list applied inline:
//  - indexBy null-safe
//  - buildUserStats coerces with toArr
//  - renderTrainingOverview coerces certs
//  - renderTrainingCertificates uses `all` not undeclared `certs`
//  - Modal setters null-guarded
//  - Save buttons null-guarded
//  - viewQuizSubmission null-guarded
//  - D.P() paths no longer double-prefix training/
//  - openUserTraining null-guarded
//  - renderCertTemplatesGrid confirmed safe
//  - trainingUsersBodyProgress id used in Progress tab
//  - awardTrainingCertificate writes to training/certificates/ (correct)

let D = {
  $: null,
  state: null,
  toast: null,
  escapeHtml: null,
  timeAgo: null,
  fmtDate: null,
  fmtBytes: null,
  fmtKES: null,
  uid: null,
  todayStr: null,
  db: null, ref: null, set: null, update: null, remove: null, push: null,
  get: null, onValue: null,
  P: null, ROOT: null,
  logActivity: null, callFn: null,
  openModal: null, closeModal: null,
  getClient: null, getClientName: null,
  getTextColor: null, destroyChart: null, safeCanvas: null,
  MAX_FILE_SIZE: null,
  AutoCertification: null,
  setupCertStampDragging: null,
  renderTrainingCertificates: null,
  renderTrainingProgress: null,
  renderTrainingQuizzes: null,
  updateSidebarCounters: null,
};

export function initTraining(d) {
  D = { ...D, ...d };
  _ceModulesDraft = [];
  _ceEditingId = null;
  _cleTasksDraft = [];
  _cleEditingId = null;
  _rePendingFileData = null;
  _reEditingId = null;
  _ptEditorBound = false;
}

export function setTrainingContext(ctx) {
  if (ctx && typeof ctx === 'object') D = { ...D, ...ctx };
}

/* ═══════════════════════════════════════════════════════════════
   SMALL UTILITIES
   ═══════════════════════════════════════════════════════════════ */
function debounce(fn, wait = 150) {
  let t = 0;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

function safePromise(v) {
  return v && typeof v.then === 'function' ? v : Promise.resolve(v);
}

function pickRefs(ids) {
  const out = {};
  for (const id of ids) out[id] = D.$(id);
  return out;
}

function slugId(raw, fallbackPrefix) {
  const v = (raw || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  return v || (fallbackPrefix + '-' + D.uid().slice(0, 6));
}

/* FIX 1: indexBy is null-safe and coerces objects to iterable arrays */
function indexBy(arr, keyFn) {
  const m = new Map();
  if (!arr) return m;
  const list = Array.isArray(arr) ? arr : Object.values(arr);
  for (const item of list) {
    if (item && typeof item === 'object') m.set(keyFn(item), item);
  }
  return m;
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const item of arr || []) {
    const k = keyFn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

/* Coerce any value into an array — safe for null/undefined/object/array */
function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return Object.values(v);
}

/* ═══════════════════════════════════════════════════════════════
   MODULE DRAFT STATE
   ═══════════════════════════════════════════════════════════════ */
let _ceModulesDraft = [];
let _ceEditingId = null;
let _cleTasksDraft = [];
let _cleEditingId = null;
let _rePendingFileData = null;
let _reEditingId = null;
let _ptEditorBound = false;

/* ═══════════════════════════════════════════════════════════════
   SHARED USER STATS
   FIX 2: coerces users, portalUsers, courses, certs with toArr
   ═══════════════════════════════════════════════════════════════ */
function buildUserStats(state) {
  const users       = toArr(state.data.users);
  const portalUsers = toArr(state.data.portalUsers);
  const courses     = toArr(state.data.trainingCourses);
  const enrollments = state.data.trainingEnrollments || {};
  const progress    = state.data.trainingProgress || {};
  const certs       = toArr(state.data.trainingCertificates);

  const allUsers = [];
  const seen = new Set();
  for (const u of users) {
    if (!u || !u.uid || seen.has(u.uid)) continue;
    seen.add(u.uid);
    allUsers.push({ uid: u.uid, name: u.name || '—', email: u.email || '—', role: u.role || 'member', type: 'operator' });
  }
  for (const p of portalUsers) {
    if (!p || !p.uid || seen.has(p.uid)) continue;
    seen.add(p.uid);
    allUsers.push({ uid: p.uid, name: p.name || '—', email: p.email || '—', role: 'client', type: 'client', clientId: p.clientId });
  }

  const coursesById = indexBy(courses, c => c.id);
  const certsByUid  = groupBy(certs, c => c.uid);

  const moduleTotals = new Map();
  for (const c of courses) moduleTotals.set(c.id, Object.keys(c.modules || {}).length);

  const stats = new Map();
  for (const u of allUsers) {
    stats.set(u.uid, {
      uid: u.uid, user: u,
      enrolled: 0, completed: 0,
      modulesDone: 0, modulesTotal: 0,
      scores: [], certificates: 0,
      avgScore: 0, progressPct: 0,
      courseDetails: []
    });
  }

  for (const [uid, byCourse] of Object.entries(enrollments)) {
    const s = stats.get(uid);
    if (!s) continue;
    for (const [cid, e] of Object.entries(byCourse || {})) {
      const total = moduleTotals.get(cid) || 0;
      const uProg = (progress[uid] || {})[cid] || {};
      let done = 0;
      for (const m of Object.values(uProg)) {
        if (m && m.completedAt) done++;
        if (m && typeof m.score === 'number') s.scores.push(m.score);
        else if (m && typeof m.autoScore === 'number') s.scores.push(m.autoScore);
      }
      s.enrolled++;
      if (e && e.completedAt) s.completed++;
      s.modulesDone  += done;
      s.modulesTotal += total;
      s.courseDetails.push({
        courseId: cid,
        courseTitle: coursesById.get(cid)?.title || cid,
        totalModules: total,
        doneModules: done,
        completedAt: (e && e.completedAt) || null,
        startedAt: (e && e.startedAt) || null,
        progressPct: total ? Math.round((done / total) * 100) : 0
      });
    }
  }

  for (const s of stats.values()) {
    s.certificates = (certsByUid.get(s.uid) || []).length;
    s.avgScore = s.scores.length
      ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length)
      : 0;
    s.progressPct = s.modulesTotal
      ? Math.round((s.modulesDone / s.modulesTotal) * 100)
      : 0;
  }

  return { allUsers, stats, courses, coursesById, enrollments, certs, certsByUid };
}

/* ═══════════════════════════════════════════════════════════════
   TAB 1 — OVERVIEW
   FIX 3: coerces certs before use
   ═══════════════════════════════════════════════════════════════ */
export function renderTrainingOverview() {
  try {
    const state = D.state;
    const courses     = toArr(state.data.trainingCourses);
    const checklists  = toArr(state.data.trainingChecklists);
    const resources   = toArr(state.data.trainingResources);
    const certs       = toArr(state.data.trainingCertificates);
    const enrollments = state.data.trainingEnrollments || {};
    const quizSubs    = state.data.trainingQuizSubmissions || {};
    const accessReqs  = state.data.trainingAccessRequests || {};

    const totalEnrollments = Object.values(enrollments).reduce((sum, u) => sum + Object.keys(u || {}).length, 0);
    const completedCount   = Object.values(enrollments).reduce((sum, u) => sum + Object.values(u || {}).filter(e => e && e.completedAt).length, 0);
    const pendingQuizzes   = Object.values(quizSubs).flatMap(byC => Object.values(byC || {})).filter(q => q && (q.status || 'submitted') === 'submitted').length;
    const pendingRequests  = Object.values(accessReqs).filter(r => r && (r.status || 'pending') === 'pending').length;

    const kpiHost = D.$('trainingOverviewKpi');
    if (kpiHost) {
      kpiHost.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-book-open"></i></div><div class="number">${courses.length}</div><div class="label">Courses</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-list-check"></i></div><div class="number">${checklists.length}</div><div class="label">Checklists</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-folder-tree"></i></div><div class="number">${resources.length}</div><div class="label">Resources</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-graduation-cap"></i></div><div class="number">${totalEnrollments}</div><div class="label">Enrollments</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div><div class="number">${completedCount}</div><div class="label">Completions</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-certificate"></i></div><div class="number">${certs.length}</div><div class="label">Certificates Issued</div></div>
      `;
    }

    const snap = D.$('trainingPendingSnapshot');
    if (snap) {
      const certKey = new Set(certs.map(c => c.uid + '|' + c.courseId));
      let awaitingCert = 0;
      for (const [uidKey, byCourse] of Object.entries(enrollments)) {
        for (const [cid, e] of Object.entries(byCourse || {})) {
          if (e && e.completedAt && !certKey.has(uidKey + '|' + cid)) awaitingCert++;
        }
      }
      snap.innerHTML = `
        <div class="stat-card" style="${pendingRequests ? 'border-left:4px solid var(--accent-gold);' : ''}">
          <div class="stat-icon"><i class="fa-solid fa-user-clock"></i></div>
          <div class="number">${pendingRequests}</div>
          <div class="label">Pending Requests</div>
        </div>
        <div class="stat-card" style="${pendingQuizzes ? 'border-left:4px solid var(--accent-purple);' : ''}">
          <div class="stat-icon"><i class="fa-solid fa-file-circle-question"></i></div>
          <div class="number">${pendingQuizzes}</div>
          <div class="label">Quizzes To Grade</div>
        </div>
        <div class="stat-card" style="${awaitingCert ? 'border-left:4px solid var(--accent-green);' : ''}">
          <div class="stat-icon"><i class="fa-solid fa-hourglass-half"></i></div>
          <div class="number">${awaitingCert}</div>
          <div class="label">Awaiting Certificate</div>
        </div>
      `;
    }

    const recent = D.$('trainingRecentActivity');
    if (recent) {
      const coursesById = indexBy(courses, c => c.id);
      const usersById = new Map();
      for (const u of toArr(state.data.users))       usersById.set(u.uid, u);
      for (const u of toArr(state.data.portalUsers)) if (!usersById.has(u.uid)) usersById.set(u.uid, u);

      const events = [];
      for (const [uidKey, byCourse] of Object.entries(enrollments)) {
        for (const [cid, e] of Object.entries(byCourse || {})) {
          if (!e) continue;
          const title = coursesById.get(cid)?.title || cid;
          if (e.startedAt)   events.push({ ts: e.startedAt,   kind: 'enroll',   uid: uidKey, label: `Enrolled in ${title}` });
          if (e.completedAt) events.push({ ts: e.completedAt, kind: 'complete', uid: uidKey, label: `Completed ${title}` });
        }
      }
      for (const c of certs) {
        events.push({ ts: c.issuedAt, kind: 'cert', uid: c.uid, label: `🎓 Certificate: ${c.courseTitle || c.courseId}` });
      }
      events.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));

      if (!events.length) recent.innerHTML = '<div class="empty-state">No training activity yet.</div>';
      else {
        recent.innerHTML = events.slice(0, 20).map(e => {
          const who = usersById.get(e.uid);
          const name = who?.name || who?.email || e.uid?.slice(0, 8) || '—';
          const icon  = { enroll: 'fa-user-plus', complete: 'fa-circle-check', cert: 'fa-award' }[e.kind] || 'fa-circle';
          const color = { enroll: 'var(--accent-blue)', complete: 'var(--accent-green)', cert: 'var(--accent-gold)' }[e.kind] || 'var(--text-secondary)';
          return `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border-color);">
            <i class="fa-solid ${icon}" style="color:${color};margin-top:2px;"></i>
            <div style="flex:1;min-width:0;">
              <div style="font-size:.82rem;font-weight:600;">${D.escapeHtml(name)}</div>
              <div style="font-size:.72rem;color:var(--text-secondary);">${D.escapeHtml(e.label)}</div>
            </div>
            <div style="font-size:.68rem;color:var(--text-light);white-space:nowrap;">${D.timeAgo(e.ts)}</div>
          </div>`;
        }).join('');
      }
    }

    if (D.destroyChart) D.destroyChart('trainingEnrollmentChart');
    const canvas = D.$('trainingEnrollmentChart');
    if (canvas && typeof Chart !== 'undefined' && D.getTextColor && D.safeCanvas) {
      const counts = new Map();
      for (const byCourse of Object.values(enrollments)) {
        for (const cid of Object.keys(byCourse || {})) {
          counts.set(cid, (counts.get(cid) || 0) + 1);
        }
      }
      const coursesById = indexBy(courses, c => c.id);
      const labels = Array.from(counts.keys()).map(cid => coursesById.get(cid)?.title || cid);
      const values = Array.from(counts.values());
      const tc = D.getTextColor();
      if (values.length) {
        state.charts = state.charts || {};
        state.charts['trainingEnrollmentChart'] = new Chart(canvas.getContext('2d'), {
          type: 'doughnut',
          data: { labels, datasets: [{ data: values, backgroundColor: ['#00d4ff','#7c3aed','#ff6ec7','#22e6a0','#ffc857','#a855f7','#ff5c7c','#10a37f'], borderColor: '#0a0a0f', borderWidth: 2 }] },
          options: { responsive: true, maintainAspectRatio: false, animation: { duration: 200 }, cutout: '58%', plugins: { legend: { position: 'bottom', labels: { color: tc, font: { size: 10 }, boxWidth: 12, usePointStyle: true } } } }
        });
      }
    }

    const cb = D.$('trainingCoursesBody');
    if (cb) {
      if (!courses.length) cb.innerHTML = `<tr><td colspan="6" class="empty-state">No courses yet. Click <strong>New Course</strong> to create one.</td></tr>`;
      else cb.innerHTML = courses.map(c => {
        const moduleCount = Object.keys(c.modules || {}).length;
        const reqBadges = c.requiredFor
          ? c.requiredFor.split(',').map(r => `<span class="badge badge-purple" style="font-size:.6rem;margin:1px;">${D.escapeHtml(r.trim())}</span>`).join('')
          : '<span style="color:var(--text-light);">—</span>';
        return `<tr>
          <td><strong>${D.escapeHtml(c.title || '—')}</strong>${c.description ? `<br><small style="color:var(--text-secondary);">${D.escapeHtml(c.description.substring(0, 70))}${c.description.length > 70 ? '…' : ''}</small>` : ''}</td>
          <td>${D.escapeHtml(c.category || '—')}</td>
          <td>${D.escapeHtml(c.level || '—')}</td>
          <td>${moduleCount}</td>
          <td>${reqBadges}</td>
          <td style="text-align:right;white-space:nowrap;">
            <button class="btn btn-primary btn-xs" onclick="Viora.editCourse('${c.id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-danger btn-xs" onclick="Viora.deleteCourse('${c.id}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>`;
      }).join('');
    }

    const clb = D.$('trainingChecklistsBody');
    if (clb) {
      if (!checklists.length) clb.innerHTML = `<tr><td colspan="3" class="empty-state">No checklists yet. Click <strong>New Checklist</strong>.</td></tr>`;
      else clb.innerHTML = checklists.map(cl => `<tr><td><strong>${D.escapeHtml(cl.title || '—')}</strong></td><td>${D.escapeHtml(cl.targetRole || 'All')}</td><td>${(cl.tasks || []).length}</td></tr>`).join('');
    }

    const rb = D.$('trainingResourcesBody');
    if (rb) {
      if (!resources.length) rb.innerHTML = `<tr><td colspan="5" class="empty-state">No resources yet. Click <strong>New Resource</strong>.</td></tr>`;
      else rb.innerHTML = resources.map(r => `
        <tr>
          <td><strong>${D.escapeHtml(r.title || '—')}</strong></td>
          <td>${D.escapeHtml(r.category || '—')}</td>
          <td>${D.escapeHtml(r.type || '—')}</td>
          <td>${r.uploadedAt ? D.timeAgo(r.uploadedAt) : '—'}</td>
          <td style="text-align:right;white-space:nowrap;">
            ${r.url ? `<a href="${D.escapeHtml(r.url)}" target="_blank" rel="noopener" class="btn btn-primary btn-xs"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
            ${r.data ? `<button class="btn btn-primary btn-xs" onclick="Viora.openResourceFile('${r.id}')"><i class="fa-solid fa-eye"></i></button>` : ''}
            <button class="btn btn-primary btn-xs" onclick="Viora.editResource('${r.id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-danger btn-xs" onclick="Viora.deleteResource('${r.id}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>`).join('');
    }
  } catch (e) {
    console.error('renderTrainingOverview failed', e);
    D.toast?.('Failed to render training overview: ' + e.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   TAB 2 — REQUESTS
   ═══════════════════════════════════════════════════════════════ */
export function renderTrainingRequests() {
  try {
    const state = D.state;
    const allRaw = state.data.trainingAccessRequests || {};
    const all = Array.isArray(allRaw)
      ? allRaw.map(r => ({ uid: r.uid, ...r }))
      : Object.entries(allRaw).map(([uid, r]) => ({ uid, ...r }));

    const status = D.$('trainingRequestsFilter')?.value || 'pending';
    const search = (D.$('trainingRequestsSearch')?.value || '').toLowerCase().trim();

    const pending  = all.filter(r => (r.status || 'pending') === 'pending').length;
    const approved = all.filter(r => r.status === 'approved').length;
    const rejected = all.filter(r => r.status === 'rejected').length;

    let list = all;
    if (status !== 'all') list = list.filter(r => (r.status || 'pending') === status);
    if (search) list = list.filter(r =>
      (r.name  || '').toLowerCase().includes(search) ||
      (r.email || '').toLowerCase().includes(search)
    );
    list = list.slice().sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));

    const kpi = D.$('trainingRequestsKpi');
    if (kpi) {
      kpi.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-list"></i></div><div class="number">${all.length}</div><div class="label">Total Requests</div></div>
        <div class="stat-card" style="${pending ? 'border-left:4px solid var(--accent-gold);' : ''}"><div class="stat-icon"><i class="fa-solid fa-hourglass"></i></div><div class="number">${pending}</div><div class="label">Pending</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-check-circle"></i></div><div class="number">${approved}</div><div class="label">Approved</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-xmark"></i></div><div class="number">${rejected}</div><div class="label">Rejected</div></div>
      `;
    }

    const badge = D.$('trainingRequestsNavBadge');
    if (badge) {
      if (pending > 0) { badge.textContent = pending > 99 ? '99+' : pending; badge.style.display = 'inline-block'; }
      else badge.style.display = 'none';
    }

    const tb = D.$('trainingRequestsBody');
    if (!tb) return;
    if (!list.length) { tb.innerHTML = `<tr><td colspan="7" class="empty-state">No requests match the current filter.</td></tr>`; return; }
    tb.innerHTML = list.map(r => {
      const st = r.status || 'pending';
      const stCls = st === 'approved' ? 'paid' : st === 'rejected' ? 'overdue' : 'pending';
      const linkedClient = r.clientId ? (D.getClient(r.clientId)?.name || r.clientId) : '—';
      return `<tr>
        <td>${D.timeAgo(r.requestedAt)}</td>
        <td><strong>${D.escapeHtml(r.name || '—')}</strong></td>
        <td>${D.escapeHtml(r.email || '—')}</td>
        <td>${D.escapeHtml(r.phone || '—')}</td>
        <td><span class="badge badge-${stCls}">${D.escapeHtml(st)}</span></td>
        <td>${D.escapeHtml(linkedClient)}</td>
        <td style="text-align:right;white-space:nowrap;">
          ${st === 'pending' ? `
            <button class="btn btn-success btn-xs" onclick="Viora.approveTrainingRequest('${r.uid}')"><i class="fa-solid fa-check"></i> Approve</button>
            <button class="btn btn-danger btn-xs" onclick="Viora.rejectTrainingRequest('${r.uid}')"><i class="fa-solid fa-xmark"></i> Reject</button>
          ` : `<button class="btn btn-outline btn-xs" onclick="Viora.reopenTrainingRequest('${r.uid}')"><i class="fa-solid fa-rotate-left"></i></button>`}
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('renderTrainingRequests failed', e);
    D.toast?.('Failed to render training requests: ' + e.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   TAB 3 — USERS
   ═══════════════════════════════════════════════════════════════ */
export function renderTrainingUsers() {
  try {
    const state = D.state;
    const { allUsers, stats, courses, enrollments } = buildUserStats(state);

    const search       = (D.$('trainingUserSearch')?.value || '').toLowerCase().trim();
    const roleFilter   = D.$('trainingUserRoleFilter')?.value || 'all';
    const courseFilter = D.$('trainingUserCourseFilter')?.value || 'all';

    const courseFilterEl = D.$('trainingUserCourseFilter');
    if (courseFilterEl) {
      const preserved = courseFilterEl.value;
      courseFilterEl.innerHTML = '<option value="all">Any Course</option><option value="__none__">Not Enrolled</option><option value="__inprog__">In Progress</option><option value="__complete__">Completed</option>';
      for (const c of courses) {
        const o = document.createElement('option');
        o.value = c.id; o.textContent = c.title;
        courseFilterEl.appendChild(o);
      }
      if (Array.from(courseFilterEl.options).some(o => o.value === preserved)) courseFilterEl.value = preserved;
    }

    let filtered = Array.from(stats.values());
    if (search) filtered = filtered.filter(s =>
      (s.user.name  || '').toLowerCase().includes(search) ||
      (s.user.email || '').toLowerCase().includes(search)
    );
    if (roleFilter !== 'all') filtered = filtered.filter(s => s.user.role === roleFilter);
    if      (courseFilter === '__none__')     filtered = filtered.filter(s => s.enrolled === 0);
    else if (courseFilter === '__inprog__')   filtered = filtered.filter(s => s.enrolled > 0 && s.completed < s.enrolled);
    else if (courseFilter === '__complete__') filtered = filtered.filter(s => s.enrolled > 0 && s.completed === s.enrolled);
    else if (courseFilter !== 'all')          filtered = filtered.filter(s => s.courseDetails.some(c => c.courseId === courseFilter));

    filtered.sort((a, b) => {
      if (b.completed !== a.completed) return b.completed - a.completed;
      if (b.enrolled  !== a.enrolled)  return b.enrolled  - a.enrolled;
      return (a.user.name || '').localeCompare(b.user.name || '');
    });

    const kpi = D.$('trainingUsersKpi');
    if (kpi) {
      const operators = allUsers.filter(u => u.type === 'operator').length;
      const clients   = allUsers.filter(u => u.type === 'client').length;
      let enrolled = 0;
      for (const u of allUsers) {
        const e = enrollments[u.uid];
        if (e && Object.keys(e).length > 0) enrolled++;
      }
      kpi.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-users"></i></div><div class="number">${allUsers.length}</div><div class="label">Total Users</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-user-tie"></i></div><div class="number">${operators}</div><div class="label">Operators</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-user"></i></div><div class="number">${clients}</div><div class="label">Portal Clients</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-graduation-cap"></i></div><div class="number">${enrolled}</div><div class="label">Enrolled Users</div></div>
      `;
    }

    const tb = D.$('trainingUsersBody');
    if (!tb) return;
    if (!filtered.length) { tb.innerHTML = `<tr><td colspan="8" class="empty-state">No users match the current filters.</td></tr>`; return; }

    const rows = filtered.map(s => {
      const u = s.user;
      const roleBadge = u.role === 'client'
        ? '<span class="badge badge-purple">Client</span>'
        : `<span class="badge badge-${u.role === 'exec' || u.role === 'admin' ? 'paid' : 'pending'}">${D.escapeHtml(u.role)}</span>`;
      const typeBadge = u.type === 'client'
        ? '<span class="badge badge-active">Portal Client</span>'
        : '<span class="badge badge-gray">Operator</span>';
      const pct = s.progressPct;
      const cls = pct >= 100 ? 'green' : pct >= 50 ? '' : 'gold';
      return `<tr style="cursor:pointer;" onclick="Viora.openUserTraining('${u.uid}')">
        <td><div style="display:flex;align-items:center;gap:8px;"><div class="avatar-mini">${D.escapeHtml((u.name || '?').charAt(0).toUpperCase())}</div><div><strong>${D.escapeHtml(u.name)}</strong><br><small style="color:var(--text-secondary);font-size:.7rem;">${D.escapeHtml(u.email)}</small></div></div></td>
        <td>${roleBadge}</td>
        <td>${typeBadge}</td>
        <td>${s.enrolled}</td>
        <td><div class="progress-3d" style="margin:4px 0;"><div class="progress-3d-bar ${cls}" style="width:${pct}%"></div></div><small>${pct}%</small></td>
        <td>${s.avgScore ? s.avgScore + '%' : '—'}</td>
        <td>${s.certificates}</td>
        <td style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation()"><button class="btn btn-primary btn-xs" onclick="Viora.openUserTraining('${u.uid}')"><i class="fa-solid fa-eye"></i> Manage</button></td>
      </tr>`;
    }).join('');
    tb.innerHTML = rows;
  } catch (e) {
    console.error('renderTrainingUsers failed', e);
    D.toast?.('Failed to render training users: ' + e.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   TAB 4 — PROGRESS
   FIX 11: target id is trainingUsersBodyProgress, not trainingUsersBody
   ═══════════════════════════════════════════════════════════════ */
export function renderTrainingProgress() {
  try {
    const state = D.state;
    const { allUsers, stats, courses, certs } = buildUserStats(state);

    const search       = (D.$('trainingUserSearch')?.value || '').toLowerCase().trim();
    const roleFilter   = D.$('trainingUserRoleFilter')?.value || 'all';
    const courseFilter = D.$('trainingUserCourseFilter')?.value || 'all';

    const courseFilterEl = D.$('trainingUserCourseFilter');
    if (courseFilterEl) {
      const preserved = courseFilterEl.value;
      courseFilterEl.innerHTML = '<option value="all">Any Course</option><option value="__none__">Not Enrolled</option><option value="__inprog__">In Progress</option><option value="__complete__">Completed</option>';
      for (const c of courses) {
        const o = document.createElement('option');
        o.value = c.id; o.textContent = c.title;
        courseFilterEl.appendChild(o);
      }
      if (Array.from(courseFilterEl.options).some(o => o.value === preserved)) courseFilterEl.value = preserved;
    }

    let filtered = Array.from(stats.values());
    if (search) filtered = filtered.filter(s =>
      (s.user.name  || '').toLowerCase().includes(search) ||
      (s.user.email || '').toLowerCase().includes(search)
    );
    if (roleFilter !== 'all') filtered = filtered.filter(s => s.user.role === roleFilter);
    if      (courseFilter === '__none__')     filtered = filtered.filter(s => s.enrolled === 0);
    else if (courseFilter === '__inprog__')   filtered = filtered.filter(s => s.enrolled > 0 && s.completed < s.enrolled);
    else if (courseFilter === '__complete__') filtered = filtered.filter(s => s.enrolled > 0 && s.completed === s.enrolled);
    else if (courseFilter !== 'all')          filtered = filtered.filter(s => s.courseDetails.some(c => c.courseId === courseFilter));

    filtered.sort((a, b) => {
      if (b.completed !== a.completed) return b.completed - a.completed;
      if (b.enrolled  !== a.enrolled)  return b.enrolled  - a.enrolled;
      return (a.user.name || '').localeCompare(b.user.name || '');
    });

    const kpi = D.$('trainingProgressKpi');
    if (kpi) {
      const totalEnrolled = Object.keys(state.data.trainingEnrollments || {}).length;
      let totalCompletions = 0;
      const allScores = [];
      for (const s of stats.values()) {
        totalCompletions += s.completed;
        for (const sc of s.scores) allScores.push(sc);
      }
      const avgScore = allScores.length
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : 0;
      kpi.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-users"></i></div><div class="number">${allUsers.length}</div><div class="label">Registered Users</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-graduation-cap"></i></div><div class="number">${totalEnrolled}</div><div class="label">Users Enrolled</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div><div class="number">${totalCompletions}</div><div class="label">Total Completions</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-star"></i></div><div class="number">${avgScore}%</div><div class="label">Avg Quiz Score</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-certificate"></i></div><div class="number">${certs.length}</div><div class="label">Certificates</div></div>
      `;
    }

    /* FIX 11: target the Progress-tab-specific tbody */
    const ub = D.$('trainingUsersBodyProgress');
    if (ub) {
      if (!filtered.length) {
        ub.innerHTML = `<tr><td colspan="7" class="empty-state">No users match the current filters.</td></tr>`;
      } else {
        ub.innerHTML = filtered.map(s => {
          const u = s.user;
          const roleBadge = u.role === 'client'
            ? '<span class="badge badge-purple">Client</span>'
            : `<span class="badge badge-${u.role === 'exec' || u.role === 'admin' ? 'paid' : 'pending'}">${D.escapeHtml(u.role)}</span>`;
          const pct = s.progressPct;
          const cls = pct >= 100 ? 'green' : pct >= 50 ? '' : 'gold';
          return `<tr style="cursor:pointer;" onclick="Viora.openUserTraining('${u.uid}')">
            <td><div style="display:flex;align-items:center;gap:8px;"><div class="avatar-mini">${D.escapeHtml((u.name || '?').charAt(0).toUpperCase())}</div><div><strong>${D.escapeHtml(u.name)}</strong><br><small style="color:var(--text-secondary);font-size:.7rem;">${D.escapeHtml(u.email)}</small></div></div></td>
            <td>${roleBadge}</td>
            <td>${s.enrolled}</td>
            <td><div class="progress-3d" style="margin:4px 0;"><div class="progress-3d-bar ${cls}" style="width:${pct}%"></div></div><small>${pct}%</small></td>
            <td>${s.avgScore ? s.avgScore + '%' : '—'}</td>
            <td>${s.certificates}</td>
            <td style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation()"><button class="btn btn-primary btn-xs" onclick="Viora.openUserTraining('${u.uid}')"><i class="fa-solid fa-eye"></i> Manage</button></td>
          </tr>`;
        }).join('');
      }
    }

    const cb = D.$('trainingCertsBody');
    if (cb) {
      const sorted = certs.slice().sort((a, b) => (b.issuedAt || '').localeCompare(a.issuedAt || ''));
      if (!sorted.length) { cb.innerHTML = `<tr><td colspan="6" class="empty-state">No certificates issued yet.</td></tr>`; }
      else {
        cb.innerHTML = sorted.map(c => `
          <tr>
            <td><strong>${D.escapeHtml(c.userName || '—')}</strong></td>
            <td>${D.escapeHtml(c.courseTitle || '—')}</td>
            <td>${c.score ? c.score + '%' : '—'}</td>
            <td>${c.issuedAt ? D.timeAgo(c.issuedAt) : '—'}</td>
            <td style="font-family:monospace;font-size:.72rem;">${D.escapeHtml(c.code || c.id || '—')}</td>
            <td style="text-align:right;white-space:nowrap;"><button class="btn btn-danger btn-xs" onclick="Viora.revokeCertificate('${c.id}')"><i class="fa-solid fa-trash"></i></button></td>
          </tr>`).join('');
      }
    }
  } catch (e) {
    console.error('renderTrainingProgress failed', e);
    D.toast?.('Failed to render training progress: ' + e.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   TAB 5 — QUIZ SUBMISSIONS
   ═══════════════════════════════════════════════════════════════ */
export function renderTrainingQuizzes() {
  try {
    const state = D.state;
    const all = Object.values(state.data.trainingQuizSubmissions || {})
      .flatMap(byCourse => Object.values(byCourse || {}));
    const filterStatus = D.$('quizFilterStatus')?.value || 'all';
    const search = (D.$('quizzesSearch')?.value || '').toLowerCase().trim();

    let list = all;
    if (filterStatus !== 'all') list = list.filter(q => (q.status || 'submitted') === filterStatus);
    if (search) list = list.filter(q =>
      (q.userName   || '').toLowerCase().includes(search) ||
      (q.userEmail  || '').toLowerCase().includes(search) ||
      (q.courseTitle || '').toLowerCase().includes(search)
    );
    list = list.slice().sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));

    let pending = 0, graded = 0, awarded = 0, scoreSum = 0;
    for (const q of all) {
      const st = q.status || 'submitted';
      if (st === 'submitted') pending++;
      else if (st === 'graded') graded++;
      else if (st === 'awarded') awarded++;
      scoreSum += q.autoScore || 0;
    }
    const avgScore = all.length ? Math.round(scoreSum / all.length) : 0;

    const kpi = D.$('quizzesKpi');
    if (kpi) {
      kpi.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-file-circle-question"></i></div><div class="number">${all.length}</div><div class="label">Total Submissions</div></div>
        <div class="stat-card" style="${pending > 0 ? 'border-left:4px solid var(--accent-gold);' : ''}"><div class="stat-icon"><i class="fa-solid fa-hourglass"></i></div><div class="number">${pending}</div><div class="label">Pending Review</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-check-circle"></i></div><div class="number">${graded}</div><div class="label">Graded</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-award"></i></div><div class="number">${awarded}</div><div class="label">Certified</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-star"></i></div><div class="number">${avgScore}%</div><div class="label">Avg Auto-Score</div></div>
      `;
    }
    const badge = D.$('quizzesNavBadge');
    if (badge) {
      if (pending > 0) { badge.textContent = pending; badge.style.display = 'inline-block'; }
      else badge.style.display = 'none';
    }

    const tb = D.$('quizzesBody');
    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="6" class="empty-state">${all.length ? 'No submissions match your filters.' : 'No quiz submissions yet.'}</td></tr>`;
      return;
    }
    tb.innerHTML = list.map(q => {
      const status = q.status || 'submitted';
      const statusBadge = status === 'awarded'
        ? '<span class="badge badge-paid">🎓 Awarded</span>'
        : status === 'graded'
          ? '<span class="badge badge-pending">Graded</span>'
          : '<span class="badge badge-overdue">Pending</span>';
      const scoreDisplay = typeof q.autoScore === 'number' ? `${q.autoScore}%` : '—';
      return `<tr>
        <td>${D.timeAgo(q.submittedAt)}</td>
        <td><strong>${D.escapeHtml(q.userName || '—')}</strong><br><small style="color:var(--text-secondary);">${D.escapeHtml(q.userEmail || '')}</small></td>
        <td>${D.escapeHtml(q.courseTitle || '—')}<br><small style="color:var(--text-secondary);">${D.escapeHtml(q.moduleTitle || '')}</small></td>
        <td><strong>${scoreDisplay}</strong></td>
        <td>${statusBadge}</td>
        <td style="text-align:right;white-space:nowrap;"><button class="btn btn-primary btn-xs" onclick="Viora.viewQuizSubmission('${q.uid}', '${q.courseId}')"><i class="fa-solid fa-eye"></i> Review</button></td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('renderTrainingQuizzes failed', e);
    D.toast?.('Failed to render quiz submissions: ' + e.message, 'error');
  }
}

/* FIX 7 + FIX 8: null-guard modal buttons; D.P without training/ prefix */
export function viewQuizSubmission(uidKey, courseId) {
  const state = D.state;
  const sub = state.data.trainingQuizSubmissions?.[uidKey]?.[courseId];
  if (!sub) { D.toast('Submission not found.', 'error'); return; }
  const questions = sub.questions || [];
  const answers = sub.answers || {};

  const answersHtml = questions.map((q, qi) => {
    const userAns = answers[qi];
    const correct = q.answer;
    const isCorrect = userAns === correct;
    const optionsHtml = (q.options || []).map((opt, oi) => {
      const isUser = userAns === oi;
      const isAns  = correct === oi;
      let bg = 'transparent', mark = '';
      if (isAns) { bg = 'rgba(34,230,160,.12)'; mark = ' ✓'; }
      else if (isUser && !isAns) { bg = 'rgba(255,92,124,.12)'; mark = ' ✗'; }
      return `<div style="padding:6px 10px;border-radius:8px;background:${bg};font-size:.8rem;margin-bottom:3px;">${isUser ? '<strong>▸ ' : '&nbsp;&nbsp;'}${D.escapeHtml(opt)}${mark}${isUser ? '</strong>' : ''}</div>`;
    }).join('');
    return `<div class="ai-rec-panel" style="margin-bottom:10px;padding:14px;border-left:4px solid ${isCorrect ? 'var(--accent-green)' : 'var(--accent-red)'};">
      <div style="font-weight:700;font-size:.85rem;margin-bottom:8px;">${qi + 1}. ${D.escapeHtml(q.q)}</div>
      ${optionsHtml}
    </div>`;
  }).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.style.zIndex = '2000';
  modal.innerHTML = `
    <div class="modal xl">
      <h2><span class="modal-icon"><i class="fa-solid fa-file-circle-question"></i></span> Quiz Review — ${D.escapeHtml(sub.courseTitle || '')}</h2>
      <div style="padding:14px;background:var(--bg-input);border-radius:12px;margin-bottom:14px;border:1px solid var(--border-color);">
        <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:.82rem;">
          <div><span style="color:var(--text-secondary);">Trainee:</span> <strong>${D.escapeHtml(sub.userName || '—')}</strong></div>
          <div><span style="color:var(--text-secondary);">Email:</span> ${D.escapeHtml(sub.userEmail || '—')}</div>
          <div><span style="color:var(--text-secondary);">Submitted:</span> ${D.timeAgo(sub.submittedAt)}</div>
          <div><span style="color:var(--text-secondary);">Auto-score:</span> <strong>${sub.autoScore || 0}%</strong></div>
          <div><span style="color:var(--text-secondary);">Status:</span> <span class="badge ${sub.status === 'awarded' ? 'badge-paid' : sub.status === 'graded' ? 'badge-pending' : 'badge-overdue'}">${sub.status || 'submitted'}</span></div>
        </div>
      </div>
      <label style="margin-bottom:6px;display:block;">Manual Score Override (0–100)</label>
      <input type="number" id="qsOverride" min="0" max="100" value="${sub.finalScore ?? sub.autoScore ?? 0}" style="width:120px;padding:8px 12px;border-radius:10px;border:1.5px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);" />
      <label style="margin-top:14px;display:block;">Admin Notes (optional)</label>
      <textarea id="qsNotes" rows="2" placeholder="e.g. Excellent work — certificate approved." style="width:100%;padding:10px 12px;border-radius:10px;border:1.5px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-family:inherit;">${D.escapeHtml(sub.adminNotes || '')}</textarea>
      <h4 style="margin:18px 0 10px;font-size:.82rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.6px;">Answers (${questions.length})</h4>
      <div style="max-height:400px;overflow-y:auto;">${answersHtml}</div>
      <div class="form-actions" style="margin-top:20px;flex-wrap:wrap;">
        <button type="button" class="btn btn-outline" id="qsClose">Close</button>
        <button type="button" class="btn btn-primary" id="qsSaveGrade"><i class="fa-solid fa-check"></i> Save Grade Only</button>
        <button type="button" class="btn btn-gold" id="qsAwardCert"><i class="fa-solid fa-award"></i> Grade &amp; Award Certificate</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  const closeBtn = modal.querySelector('#qsClose');
  if (closeBtn) closeBtn.onclick = () => modal.remove();

  const saveGradeBtn = modal.querySelector('#qsSaveGrade');
  if (saveGradeBtn) saveGradeBtn.onclick = async () => {
    const finalScore = parseInt(modal.querySelector('#qsOverride').value, 10) || 0;
    const adminNotes = modal.querySelector('#qsNotes').value.trim();
    try {
      /* FIX 8: strip training/ prefix — D.P already prepends it */
      const path = D.P(`quizSubmissions/${uidKey}/${courseId}`);
      await safePromise(D.update(D.ref(D.db, path), {
        finalScore, adminNotes, status: 'graded',
        gradedAt: new Date().toISOString(),
        gradedBy: state.operator?.name || 'admin'
      }));
      await safePromise(D.logActivity('edit', 'Quiz graded', `${sub.userName} · ${sub.courseTitle} · ${finalScore}%`));
      D.toast('Grade saved.', 'success');
      modal.remove();
    } catch (e) { D.toast('Save failed: ' + e.message, 'error'); }
  };

  const awardBtn = modal.querySelector('#qsAwardCert');
  if (awardBtn) awardBtn.onclick = async () => {
    const finalScore = parseInt(modal.querySelector('#qsOverride').value, 10) || 0;
    const adminNotes = modal.querySelector('#qsNotes').value.trim();
    await awardTrainingCertificate({
      uid: uidKey, userName: sub.userName, userEmail: sub.userEmail,
      courseId, courseTitle: sub.courseTitle, moduleId: sub.moduleId,
      score: finalScore, adminNotes, sourceSubmission: true
    });
    modal.remove();
  };
}

/* ═══════════════════════════════════════════════════════════════
   TAB 6 — CERTIFICATES
   FIX 4: use `all` (not undeclared `certs`) in the score/thisMonth loop
   ═══════════════════════════════════════════════════════════════ */
export function renderTrainingCertificates() {
  try {
    const state = D.state;
    const all = toArr(state.data.trainingCertificates)
      .slice()
      .sort((a, b) => (b.issuedAt || '').localeCompare(a.issuedAt || ''));
    const search = (D.$('certsSearch')?.value || '').toLowerCase().trim();
    const list = search
      ? all.filter(c =>
          (c.userName    || '').toLowerCase().includes(search) ||
          (c.code        || '').toLowerCase().includes(search) ||
          (c.courseTitle || '').toLowerCase().includes(search))
      : all;

    const total = all.length;
    const nowMonth = new Date().getMonth();
    let thisMonth = 0, scoreSum = 0;
    const uniqueUids = new Set();
    for (const c of all) {
      if (!c) continue;
      if (c.issuedAt && new Date(c.issuedAt).getMonth() === nowMonth) thisMonth++;
      scoreSum += c.score || 0;
      if (c.uid) uniqueUids.add(c.uid);
    }
    const avgScore = total ? Math.round(scoreSum / total) : 0;

    const kpi = D.$('certsKpi');
    if (kpi) {
      kpi.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-award"></i></div><div class="number">${total}</div><div class="label">Total Certificates</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-calendar"></i></div><div class="number">${thisMonth}</div><div class="label">This Month</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-users"></i></div><div class="number">${uniqueUids.size}</div><div class="label">Certified Users</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-star"></i></div><div class="number">${avgScore}%</div><div class="label">Avg Score</div></div>
      `;
    }

    renderCertTemplatesGrid();

    const badge = D.$('certsNavBadge');
    if (badge) {
      if (thisMonth > 0) { badge.textContent = thisMonth; badge.style.display = 'inline-block'; }
      else badge.style.display = 'none';
    }

    const tb = D.$('certsBody');
    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="7" class="empty-state">${all.length ? 'No certificates match.' : 'No certificates awarded yet.'}</td></tr>`;
      return;
    }
    tb.innerHTML = list.map(c => `
      <tr>
        <td style="width:80px;">${c.renderedImage
          ? `<img src="${c.renderedImage}" style="width:70px;height:auto;border-radius:6px;border:1px solid var(--border-color);cursor:pointer;" onclick="Viora.viewTrainingCert('${c.id}')" title="Click to view" />`
          : `<div style="width:70px;height:44px;border-radius:6px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;color:var(--text-light);"><i class="fa-solid fa-award"></i></div>`}</td>
        <td>${D.timeAgo(c.issuedAt)}</td>
        <td><strong>${D.escapeHtml(c.userName || '—')}</strong><br><small style="color:var(--text-secondary);">${D.escapeHtml(c.userEmail || '')}</small></td>
        <td>${D.escapeHtml(c.courseTitle || '—')}${c.moduleTitle ? '<br><small style="color:var(--text-secondary);">' + D.escapeHtml(c.moduleTitle) + '</small>' : ''}</td>
        <td><strong>${c.score || 0}%</strong></td>
        <td style="font-family:monospace;font-size:.72rem;">${D.escapeHtml(c.code || c.id)}</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-primary btn-xs" onclick="Viora.viewTrainingCert('${c.id}')"><i class="fa-solid fa-eye"></i></button>
          ${c.renderedImage ? `<button class="btn btn-success btn-xs" onclick="(function(){const a=document.createElement('a');a.href='${c.renderedImage}';a.download='certificate_${(c.userName || 'trainee').replace(/[^a-z0-9]/gi, '_')}_${c.code || c.id}.png';a.click();})()"><i class="fa-solid fa-download"></i></button>` : ''}
          <button class="btn btn-danger btn-xs" onclick="Viora.revokeTrainingCert('${c.id}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`).join('');
  } catch (e) {
    console.error('renderTrainingCertificates failed', e);
    D.toast?.('Failed to render certificates: ' + e.message, 'error');
  }
}

/* FIX 10: already safe via Object.values + || {} */
export function renderCertTemplatesGrid() {
  const state = D.state;
  const host = D.$('certTemplateGrid');
  if (!host) return;
  const templates = Object.values(state.data.trainingCertTemplates || {});
  if (!templates.length) {
    host.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:24px;">No certificate templates yet. Click <strong>New Template</strong> to upload one for a course or module.</div>`;
    return;
  }
  const coursesById = indexBy(toArr(state.data.trainingCourses), c => c.id);
  templates.sort((a, b) => (a.courseId || '').localeCompare(b.courseId || '') || (a.moduleId || '').localeCompare(b.moduleId || ''));
  host.innerHTML = templates.map(t => {
    const course = coursesById.get(t.courseId);
    const mod = t.moduleId ? course?.modules?.[t.moduleId] : null;
    return `
      <div class="card-3d">
        <div style="width:100%;height:120px;border-radius:10px;overflow:hidden;background:var(--bg-input);display:flex;align-items:center;justify-content:center;">
          ${t.imageData ? `<img src="${t.imageData}" style="max-width:100%;max-height:100%;object-fit:contain;" />` : `<i class="fa-solid fa-image" style="font-size:2rem;color:var(--text-light);"></i>`}
        </div>
        <div class="card-info">
          <div class="card-title">${D.escapeHtml(t.title)}</div>
          <div class="card-sub">${D.escapeHtml(course?.title || t.courseId)}${mod ? ' → ' + D.escapeHtml(mod.title) : ' (Whole Course)'}</div>
          <div class="card-stats">
            <div class="stat"><span class="val">${t.awardedCount || 0}</span><span class="lbl">Awarded</span></div>
            <div class="stat"><span class="val">${t.uploadedAt ? D.timeAgo(t.uploadedAt) : '—'}</span><span class="lbl">Uploaded</span></div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-primary btn-xs" onclick="openCertTemplateEditor('${t.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="deleteCertTemplate('${t.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════════
   COURSE EDITOR
   FIX 5: null-guard title setters
   ═══════════════════════════════════════════════════════════════ */
let _ceRefs = null;
function ceRefs() {
  if (_ceRefs) return _ceRefs;
  _ceRefs = pickRefs([
    'courseEditorTitle','ceId','ceTitle','ceDescription','ceCategory','ceLevel',
    'ceRequiredFor','ceModulesList','ceModuleCount','ceSaveBtn','ceAddModuleBtn'
  ]);
  return _ceRefs;
}

export function openCourseEditor(courseId = null) {
  _ceEditingId = courseId;
  _ceModulesDraft = [];
  const R = ceRefs();
  if (courseId) {
    const c = toArr(D.state.data.trainingCourses).find(x => x.id === courseId);
    if (!c) { D.toast('Course not found.', 'error'); return; }
    if (R.courseEditorTitle) R.courseEditorTitle.textContent = 'Edit Course';
    R.ceId.value = c.id || '';
    R.ceId.disabled = true;
    R.ceTitle.value = c.title || '';
    R.ceDescription.value = c.description || '';
    R.ceCategory.value = c.category || 'Onboarding';
    R.ceLevel.value = c.level || 'Beginner';
    R.ceRequiredFor.value = c.requiredFor || '';
    _ceModulesDraft = Object.entries(c.modules || {})
      .map(([id, m]) => ({
        id,
        title: m.title || '',
        content: m.content || '',
        videoUrl: m.videoUrl || '',
        order: m.order || 0,
        quiz: m.quiz ? m.quiz.map(q => ({ ...q, options: [...(q.options || [])] })) : null
      }))
      .sort((a, b) => a.order - b.order);
  } else {
    if (R.courseEditorTitle) R.courseEditorTitle.textContent = 'New Course';
    R.ceId.disabled = false;
    R.ceId.value = '';
    R.ceTitle.value = '';
    R.ceDescription.value = '';
    R.ceCategory.value = 'Onboarding';
    R.ceLevel.value = 'Beginner';
    R.ceRequiredFor.value = '';
  }
  renderCeModules();
  D.openModal('courseEditorModal');
}

export function renderCeModules() {
  const host = D.$('ceModulesList');
  if (!host) return;
  if (D.$('ceModuleCount')) D.$('ceModuleCount').textContent = _ceModulesDraft.length;
  if (!_ceModulesDraft.length) {
    host.innerHTML = `<div class="empty-state" style="padding:24px;text-align:center;color:var(--text-secondary);font-size:.85rem;">No modules yet. Click <strong>Add Module</strong> to start.</div>`;
    return;
  }
  host.innerHTML = _ceModulesDraft.map((m, i) => {
    const isLast = i === _ceModulesDraft.length - 1;
    const quizBlock = (m.quiz && m.quiz.length)
      ? `<div style="margin-top:10px;padding:12px;background:var(--bg-card-solid);border-radius:10px;border:1px solid var(--accent-purple);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong style="font-size:.78rem;color:var(--accent-purple);">Quiz Questions (${m.quiz.length})</strong>
            <button type="button" class="btn btn-outline btn-xs" onclick="Viora.addQuizQuestion(${i})"><i class="fa-solid fa-plus"></i> Add Question</button>
          </div>
          ${m.quiz.map((q, qi) => {
            const opts = (q.options || []);
            return `<div style="padding:10px;background:var(--bg-input);border-radius:8px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:.7rem;color:var(--text-secondary);font-weight:700;">Question ${qi + 1}</span>
                <button type="button" class="btn btn-danger btn-xs" onclick="Viora.removeQuizQuestion(${i}, ${qi})"><i class="fa-solid fa-xmark"></i></button>
              </div>
              <input type="text" value="${D.escapeHtml(q.q || '')}" placeholder="Question text" oninput="Viora.updateQuizQuestion(${i}, ${qi}, 'q', this.value)" style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-card-solid);color:var(--text-primary);font-size:.8rem;margin-bottom:6px;" />
              ${opts.map((opt, oi) => `
                <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
                  <input type="radio" name="q-${i}-${qi}" ${q.answer === oi ? 'checked' : ''} onchange="Viora.setQuizAnswer(${i}, ${qi}, ${oi})" style="width:auto;" title="Mark as correct answer" />
                  <input type="text" value="${D.escapeHtml(opt)}" placeholder="Option ${oi + 1}" oninput="Viora.updateQuizOption(${i}, ${qi}, ${oi}, this.value)" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-card-solid);color:var(--text-primary);font-size:.78rem;" />
                  ${opts.length > 2 ? `<button type="button" class="btn btn-danger btn-xs" onclick="Viora.removeQuizOption(${i}, ${qi}, ${oi})"><i class="fa-solid fa-xmark"></i></button>` : ''}
                </div>
              `).join('')}
              ${opts.length < 6 ? `<button type="button" class="btn btn-outline btn-xs" onclick="Viora.addQuizOption(${i}, ${qi})" style="margin-top:4px;"><i class="fa-solid fa-plus"></i> Option</button>` : ''}
              <div style="font-size:.65rem;color:var(--text-light);margin-top:6px;">◉ = the correct answer.</div>
            </div>`;
          }).join('')}
        </div>`
      : '';
    return `
    <div class="ai-rec-panel" style="margin-bottom:10px;padding:14px;border:1px solid ${isLast ? 'var(--accent-purple)' : 'var(--border-color)'};">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong style="font-size:.85rem;color:var(--accent-blue);">${isLast ? '🏁 ' : ''}Module ${i + 1} ${isLast ? '<span class="badge badge-purple" style="font-size:.55rem;margin-left:6px;">FINAL</span>' : ''}</strong>
        <div style="display:flex;gap:4px;">
          <button type="button" class="btn btn-outline btn-xs" onclick="Viora.moveCeModule(${i}, -1)" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
          <button type="button" class="btn btn-outline btn-xs" onclick="Viora.moveCeModule(${i}, 1)" ${i === _ceModulesDraft.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          <button type="button" class="btn btn-danger btn-xs" onclick="Viora.removeCeModule(${i})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <label style="font-size:.72rem;">Module Title *</label>
      <input type="text" value="${D.escapeHtml(m.title)}" oninput="Viora.updateCeModule(${i}, 'title', this.value)" placeholder="e.g. Welcome to Viora" />
      <label style="font-size:.72rem;margin-top:8px;">Content / Notes</label>
      <textarea rows="3" oninput="Viora.updateCeModule(${i}, 'content', this.value)" placeholder="What this module covers">${D.escapeHtml(m.content)}</textarea>
      <label style="font-size:.72rem;margin-top:8px;">Video URL (optional)</label>
      <input type="text" value="${D.escapeHtml(m.videoUrl || '')}" oninput="Viora.updateCeModule(${i}, 'videoUrl', this.value)" placeholder="https://youtube.com/..." />
      <label style="display:flex;align-items:center;gap:8px;font-size:.78rem;margin-top:12px;font-weight:600;cursor:pointer;padding:10px;background:rgba(168,85,247,.06);border-radius:8px;border:1px solid var(--border-color);">
        <input type="checkbox" ${m.quiz && m.quiz.length ? 'checked' : ''} onchange="Viora.toggleCeQuiz(${i}, this.checked)" style="width:auto;" />
        <span>📝 Attach quiz to this module ${isLast ? '<span style="color:var(--accent-purple);">(recommended for the final module)</span>' : ''}</span>
      </label>
      ${quizBlock}
    </div>`;
  }).join('');
}

export function toggleCeQuiz(idx, on) {
  if (!_ceModulesDraft[idx]) return;
  if (on) { _ceModulesDraft[idx].quiz = [{ q: '', options: ['', '', ''], answer: 0 }]; }
  else {
    if (!confirm('Remove the quiz from this module?')) { renderCeModules(); return; }
    _ceModulesDraft[idx].quiz = null;
  }
  renderCeModules();
}
export function addQuizQuestion(modIdx) {
  const m = _ceModulesDraft[modIdx]; if (!m) return;
  if (!Array.isArray(m.quiz)) m.quiz = [];
  if (m.quiz.length >= 20) { D.toast('Max 20 questions per quiz.', 'warning'); return; }
  m.quiz.push({ q: '', options: ['', '', ''], answer: 0 });
  renderCeModules();
}
export function removeQuizQuestion(modIdx, qIdx) {
  const m = _ceModulesDraft[modIdx]; if (!m || !m.quiz) return;
  m.quiz.splice(qIdx, 1);
  if (!m.quiz.length) m.quiz = null;
  renderCeModules();
}
export function updateQuizQuestion(modIdx, qIdx, field, value) {
  const m = _ceModulesDraft[modIdx]; if (!m || !m.quiz || !m.quiz[qIdx]) return;
  m.quiz[qIdx][field] = value;
}
export function updateQuizOption(modIdx, qIdx, optIdx, value) {
  const m = _ceModulesDraft[modIdx]; if (!m || !m.quiz || !m.quiz[qIdx]) return;
  m.quiz[qIdx].options[optIdx] = value;
}
export function setQuizAnswer(modIdx, qIdx, optIdx) {
  const m = _ceModulesDraft[modIdx]; if (!m || !m.quiz || !m.quiz[qIdx]) return;
  m.quiz[qIdx].answer = optIdx;
}
export function addQuizOption(modIdx, qIdx) {
  const m = _ceModulesDraft[modIdx]; if (!m || !m.quiz || !m.quiz[qIdx]) return;
  m.quiz[qIdx].options.push('');
  renderCeModules();
}
export function removeQuizOption(modIdx, qIdx, optIdx) {
  const m = _ceModulesDraft[modIdx]; if (!m || !m.quiz || !m.quiz[qIdx]) return;
  if (m.quiz[qIdx].options.length <= 2) return;
  m.quiz[qIdx].options.splice(optIdx, 1);
  if (m.quiz[qIdx].answer === optIdx) m.quiz[qIdx].answer = 0;
  else if (m.quiz[qIdx].answer > optIdx) m.quiz[qIdx].answer -= 1;
  renderCeModules();
}
export function updateCeModule(i, field, value) {
  if (!_ceModulesDraft[i]) return;
  _ceModulesDraft[i][field] = value;
}
export function addCeModule() {
  _ceModulesDraft.push({ id: 'mod-' + D.uid().slice(0, 6), title: '', content: '', videoUrl: '', order: _ceModulesDraft.length });
  renderCeModules();
}
export function removeCeModule(i) {
  if (!confirm('Remove this module?')) return;
  _ceModulesDraft.splice(i, 1);
  _ceModulesDraft.forEach((m, idx) => m.order = idx);
  renderCeModules();
}
export function moveCeModule(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= _ceModulesDraft.length) return;
  [_ceModulesDraft[i], _ceModulesDraft[j]] = [_ceModulesDraft[j], _ceModulesDraft[i]];
  _ceModulesDraft.forEach((m, idx) => m.order = idx);
  renderCeModules();
}

function cleanModuleDraft(m, idx) {
  const rawQuiz = Array.isArray(m.quiz) ? m.quiz : [];
  const cleanQuiz = [];
  for (const q of rawQuiz) {
    const qText = (q.q || '').trim();
    if (!qText) continue;
    const opts = (q.options || []).map(o => (o || '').trim()).filter(Boolean);
    if (opts.length < 2) continue;
    const origOpts = (q.options || []);
    const remap = [];
    for (let oi = 0; oi < origOpts.length; oi++) {
      if ((origOpts[oi] || '').trim()) remap.push(oi);
    }
    const newAnswer = remap.indexOf(q.answer);
    cleanQuiz.push({
      q: qText,
      options: opts,
      answer: newAnswer >= 0 ? newAnswer : 0
    });
  }
  return {
    id: m.id,
    title: (m.title || '').trim(),
    content: (m.content || '').trim(),
    videoUrl: (m.videoUrl || '').trim(),
    order: idx,
    quiz: cleanQuiz.length ? cleanQuiz : null
  };
}

/* FIX 6 + FIX 8: guard save button; strip training/ prefix */
export async function saveCourse() {
  const state = D.state;
  const R = ceRefs();
  const rawId = _ceEditingId || R.ceId.value;
  const id = _ceEditingId ? rawId : slugId(rawId, 'course');
  const title = (R.ceTitle.value || '').trim();

  if (!title) { D.toast('Course title required.', 'error'); return; }
  if (!_ceModulesDraft.length) { D.toast('Add at least one module.', 'error'); return; }
  if (_ceModulesDraft.some(m => !m.title.trim())) { D.toast('Every module needs a title.', 'error'); return; }

  for (let mi = 0; mi < _ceModulesDraft.length; mi++) {
    const m = _ceModulesDraft[mi];
    if (!m.quiz || !m.quiz.length) continue;
    for (let qi = 0; qi < m.quiz.length; qi++) {
      const q = m.quiz[qi];
      if (!q.q || !q.q.trim()) { D.toast(`Module ${mi + 1}, question ${qi + 1}: question text is empty.`, 'error'); return; }
      const opts = q.options || [];
      const nonEmpty = opts.filter(o => o && o.trim()).length;
      if (nonEmpty < 2) { D.toast(`Module ${mi + 1}, question ${qi + 1}: need at least 2 non-empty options.`, 'error'); return; }
      if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= opts.length || !opts[q.answer] || !opts[q.answer].trim()) {
        D.toast(`Module ${mi + 1}, question ${qi + 1}: mark a non-empty option as the correct answer.`, 'error');
        return;
      }
    }
  }

  const existing = toArr(state.data.trainingCourses).find(x => x.id === id);
  const modulesObj = {};
  _ceModulesDraft.forEach((m, idx) => { modulesObj[m.id] = cleanModuleDraft(m, idx); });

  const payload = {
    id, title,
    description: (R.ceDescription.value || '').trim(),
    category: R.ceCategory.value,
    level: R.ceLevel.value,
    requiredFor: (R.ceRequiredFor.value || '').trim(),
    modules: modulesObj,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: existing?.createdBy || state.operator?.name || 'admin'
  };

  const btn = R.ceSaveBtn;
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }
  try {
    /* FIX 8: D.P('courses/...') — no training/ prefix */
    await safePromise(D.set(D.ref(D.db, D.P(`courses/${id}`)), payload));
    await safePromise(D.logActivity(_ceEditingId ? 'edit' : 'add', _ceEditingId ? 'Course updated' : 'Course created', `${title} (${Object.keys(modulesObj).length} modules)`));
    D.toast(_ceEditingId ? 'Course updated.' : 'Course created.', 'success');
    D.closeModal('courseEditorModal');
    renderTrainingOverview();
  } catch (e) {
    D.toast('Save failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
  }
}

/* FIX 8: strip training/ prefix in all remove calls */
export async function deleteCourse(id) {
  const state = D.state;
  const c = toArr(state.data.trainingCourses).find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Delete course "${c.title}"?`)) return;
  try {
    await safePromise(D.remove(D.ref(D.db, D.P(`courses/${id}`))));
    const enrolls = state.data.trainingEnrollments || {};
    const jobs = [];
    for (const uidKey of Object.keys(enrolls)) {
      if (enrolls[uidKey]?.[id]) {
        jobs.push(safePromise(D.remove(D.ref(D.db, D.P(`enrollments/${uidKey}/${id}`)))));
        jobs.push(safePromise(D.remove(D.ref(D.db, D.P(`progress/${uidKey}/${id}`)))));
      }
    }
    await Promise.all(jobs);
    await safePromise(D.logActivity('delete', 'Course deleted', c.title));
    D.toast('Course deleted.', 'info');
    renderTrainingOverview();
  } catch (e) { D.toast('Delete failed: ' + e.message, 'error'); }
}

/* ═══════════════════════════════════════════════════════════════
   CHECKLIST EDITOR
   FIX 5 + FIX 6 + FIX 8
   ═══════════════════════════════════════════════════════════════ */
export function openChecklistEditor(checklistId = null) {
  _cleEditingId = checklistId;
  _cleTasksDraft = [];
  if (checklistId) {
    const c = toArr(D.state.data.trainingChecklists).find(x => x.id === checklistId);
    if (!c) { D.toast('Checklist not found.', 'error'); return; }
    if (D.$('checklistEditorTitle')) D.$('checklistEditorTitle').textContent = 'Edit Checklist';
    D.$('cleId').value = c.id || '';
    D.$('cleId').disabled = true;
    D.$('cleTitle').value = c.title || '';
    D.$('cleDescription').value = c.description || '';
    D.$('cleTargetRole').value = c.targetRole || '';
    _cleTasksDraft = (c.tasks || []).map(t => ({ text: t.text || '', done: false }));
  } else {
    if (D.$('checklistEditorTitle')) D.$('checklistEditorTitle').textContent = 'New Checklist';
    D.$('cleId').disabled = false;
    D.$('cleId').value = '';
    D.$('cleTitle').value = '';
    D.$('cleDescription').value = '';
    D.$('cleTargetRole').value = '';
  }
  renderCleTasks();
  D.openModal('checklistEditorModal');
}

export function renderCleTasks() {
  const host = D.$('cleTasksList'); if (!host) return;
  if (D.$('cleTaskCount')) D.$('cleTaskCount').textContent = _cleTasksDraft.length;
  if (!_cleTasksDraft.length) {
    host.innerHTML = `<div style="font-size:.8rem;color:var(--text-light);text-align:center;padding:12px;">No tasks yet.</div>`;
    return;
  }
  host.innerHTML = _cleTasksDraft.map((t, i) => `
    <div style="display:flex;gap:8px;align-items:center;padding:6px 0;">
      <span style="font-family:monospace;font-size:.7rem;color:var(--text-secondary);width:24px;">${i + 1}.</span>
      <input type="text" value="${D.escapeHtml(t.text)}" placeholder="Task description" oninput="Viora.updateCleTask(${i}, this.value)" style="flex:1;padding:8px 10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-input);color:var(--text-primary);" />
      <button type="button" class="btn btn-danger btn-xs" onclick="Viora.removeCleTask(${i})"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `).join('');
}
export function updateCleTask(i, v) { if (_cleTasksDraft[i]) _cleTasksDraft[i].text = v; }
export function addCleTask() { _cleTasksDraft.push({ text: '', done: false }); renderCleTasks(); }
export function removeCleTask(i) { _cleTasksDraft.splice(i, 1); renderCleTasks(); }

export async function saveChecklist() {
  const state = D.state;
  const rawId = _cleEditingId || D.$('cleId').value;
  const id = _cleEditingId ? rawId : slugId(rawId, 'checklist');
  const title = (D.$('cleTitle').value || '').trim();
  if (!title) { D.toast('Checklist title required.', 'error'); return; }
  if (!_cleTasksDraft.length || _cleTasksDraft.some(t => !t.text.trim())) {
    D.toast('Add at least one non-empty task.', 'error'); return;
  }
  const existing = toArr(state.data.trainingChecklists).find(x => x.id === id);
  const tasks = _cleTasksDraft.map((t, i) => ({ id: 'task-' + i, text: t.text.trim(), order: i }));
  const payload = {
    id, title,
    description: (D.$('cleDescription').value || '').trim(),
    targetRole: D.$('cleTargetRole').value || '',
    tasks,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: existing?.createdBy || state.operator?.name || 'admin'
  };
  const btn = D.$('cleSaveBtn');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }
  try {
    await safePromise(D.set(D.ref(D.db, D.P(`checklists/${id}`)), payload));
    await safePromise(D.logActivity(_cleEditingId ? 'edit' : 'add', _cleEditingId ? 'Checklist updated' : 'Checklist created', title));
    D.toast('Checklist saved.', 'success');
    D.closeModal('checklistEditorModal');
    renderTrainingOverview();
  } catch (e) { D.toast('Save failed: ' + e.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; } }
}

/* ═══════════════════════════════════════════════════════════════
   RESOURCE EDITOR
   FIX 5 + FIX 6 + FIX 8
   ═══════════════════════════════════════════════════════════════ */
export function openResourceEditor(resourceId = null) {
  _reEditingId = resourceId;
  _rePendingFileData = null;
  if (D.$('reUploadPreview')) D.$('reUploadPreview').innerHTML = '';
  if (D.$('reFileInput')) D.$('reFileInput').value = '';
  if (resourceId) {
    const r = toArr(D.state.data.trainingResources).find(x => x.id === resourceId);
    if (!r) { D.toast('Resource not found.', 'error'); return; }
    if (D.$('resourceEditorTitle')) D.$('resourceEditorTitle').textContent = 'Edit Resource';
    D.$('reId').value = r.id || '';
    D.$('reId').disabled = true;
    D.$('reTitle').value = r.title || '';
    D.$('reDescription').value = r.description || '';
    D.$('reCategory').value = r.category || 'Reference';
    D.$('reType').value = r.type || 'Link';
    D.$('reUrl').value = r.url || '';
    if (r.data && D.$('reUploadPreview')) D.$('reUploadPreview').innerHTML = `<em>Existing file: ${D.escapeHtml(r.fileName || 'attached')}</em>`;
  } else {
    if (D.$('resourceEditorTitle')) D.$('resourceEditorTitle').textContent = 'New Resource';
    D.$('reId').disabled = false;
    D.$('reId').value = '';
    D.$('reTitle').value = '';
    D.$('reDescription').value = '';
    D.$('reCategory').value = 'Reference';
    D.$('reType').value = 'Link';
    D.$('reUrl').value = '';
  }
  D.openModal('resourceEditorModal');
}

export function handleReFile(file) {
  if (!file) return;
  const maxSize = Number(D.MAX_FILE_SIZE) > 0 ? Number(D.MAX_FILE_SIZE) : 5 * 1024 * 1024;
  if (file.size > maxSize) { D.toast('File too large.', 'error'); return; }
  const r = new FileReader();
  r.onload = ev => {
    _rePendingFileData = { data: ev.target.result, fileName: file.name, mime: file.type, size: file.size };
    if (D.$('reUploadPreview')) D.$('reUploadPreview').innerHTML = `📎 ${D.escapeHtml(file.name)} (${D.fmtBytes(file.size)})`;
  };
  r.readAsDataURL(file);
}

export async function saveResource() {
  const state = D.state;
  const rawId = _reEditingId || D.$('reId').value;
  const id = _reEditingId ? rawId : slugId(rawId, 'resource');
  const title = (D.$('reTitle').value || '').trim();
  const url = (D.$('reUrl').value || '').trim();
  if (!title) { D.toast('Resource title required.', 'error'); return; }
  if (!url && !_rePendingFileData) { D.toast('Provide a URL or upload a file.', 'error'); return; }

  const existing = toArr(state.data.trainingResources).find(x => x.id === id);
  const payload = {
    id, title,
    description: (D.$('reDescription').value || '').trim(),
    category: D.$('reCategory').value,
    type: D.$('reType').value,
    url: url || existing?.url || '',
    uploadedAt: existing?.uploadedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: existing?.createdBy || state.operator?.name || 'admin'
  };
  if (_rePendingFileData) {
    payload.data = _rePendingFileData.data;
    payload.fileName = _rePendingFileData.fileName;
    payload.mime = _rePendingFileData.mime;
    payload.size = _rePendingFileData.size;
  } else if (existing?.data) {
    payload.data = existing.data;
    payload.fileName = existing.fileName;
    payload.mime = existing.mime;
    payload.size = existing.size;
  }
  const btn = D.$('reSaveBtn');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }
  try {
    await safePromise(D.set(D.ref(D.db, D.P(`resources/${id}`)), payload));
    await safePromise(D.logActivity(_reEditingId ? 'edit' : 'add', _reEditingId ? 'Resource updated' : 'Resource added', title));
    D.toast('Resource saved.', 'success');
    D.closeModal('resourceEditorModal');
    renderTrainingOverview();
  } catch (e) { D.toast('Save failed: ' + e.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; } }
}

export async function deleteResource(id) {
  const state = D.state;
  const r = toArr(state.data.trainingResources).find(x => x.id === id);
  if (!r || !confirm(`Delete resource "${r.title}"?`)) return;
  try {
    await safePromise(D.remove(D.ref(D.db, D.P(`resources/${id}`))));
    await safePromise(D.logActivity('delete', 'Resource deleted', r.title));
    D.toast('Resource deleted.', 'info');
    renderTrainingOverview();
  } catch (e) { D.toast('Delete failed: ' + e.message, 'error'); }
}

export function openResourceFile(id) {
  const r = toArr(D.state.data.trainingResources).find(x => x.id === id);
  if (!r || !r.data) return;
  const w = window.open();
  if (!w) { D.toast('Pop-up blocked.', 'warning'); return; }
  if ((r.mime || '').startsWith('image/')) {
    w.document.write(`<title>${D.escapeHtml(r.title)}</title><img src="${r.data}" style="max-width:100%;" />`);
  } else {
    w.document.write(`<title>${D.escapeHtml(r.title)}</title><iframe src="${r.data}" style="border:0;position:fixed;inset:0;width:100%;height:100%;"></iframe>`);
  }
}

/* ═══════════════════════════════════════════════════════════════
   CERTIFICATE — award + view + render + templates
   FIX 8 + FIX 12: all writes use D.P('certificates/...') which expands to
   viora_data/orgs/viora/training/certificates/...
   ═══════════════════════════════════════════════════════════════ */
export async function awardTrainingCertificate({
  uid: uidKey, userName, userEmail, courseId, courseTitle,
  moduleId, score, adminNotes, sourceSubmission, forcedTemplateId
}) {
  const state = D.state;
  if (!uidKey || !courseId) { D.toast('Missing user or course.', 'error'); return; }
  const code = 'VIORA-' + (courseId || '').slice(0, 6).toUpperCase() + '-' + (uidKey || '').slice(0, 6).toUpperCase() + '-' + Date.now().toString(36).toUpperCase().slice(-4);
  const certId = D.uid();
  const issuedAt = new Date().toISOString();

  const templates = state.data.trainingCertTemplates || {};
  let template = null;
  if (forcedTemplateId) {
    template = templates[forcedTemplateId] || null;
  } else {
    if (moduleId) template = Object.values(templates).find(t => t.courseId === courseId && t.moduleId === moduleId);
    if (!template) template = Object.values(templates).find(t => t.courseId === courseId && !t.moduleId);
  }

  let renderedImage = null;
  if (template) {
    try {
      renderedImage = await renderCertificateImage(template, { name: userName, email: userEmail }, { code, issuedAt });
    } catch (e) { console.warn('[cert] render failed:', e); }
  }

  const course = toArr(state.data.trainingCourses).find(c => c.id === courseId);
  const cert = {
    id: certId, uid: uidKey,
    userName: userName || 'Trainee',
    userEmail: userEmail || '',
    courseId,
    courseTitle: courseTitle || course?.title || 'Course',
    moduleId: moduleId || null,
    moduleTitle: moduleId ? course?.modules?.[moduleId]?.title || null : null,
    score: typeof score === 'number' ? score : 100,
    code, issuedAt,
    issuedBy: state.operator?.name || 'admin',
    adminNotes: adminNotes || '',
    templateId: template?.id || null,
    renderedImage
  };

  try {
    /* FIX 12: D.P('certificates/x') → viora_data/orgs/viora/training/certificates/x */
    await safePromise(D.set(D.ref(D.db, D.P(`certificates/${certId}`)), cert));

    if (template?.id) {
      try {
        await safePromise(D.update(D.ref(D.db, D.P(`certificateTemplates/${template.id}`)), {
          awardedCount: (template.awardedCount || 0) + 1
        }));
      } catch (e) { /* non-fatal */ }
    }

    if (sourceSubmission) {
      await safePromise(D.update(D.ref(D.db, D.P(`quizSubmissions/${uidKey}/${courseId}`)), {
        status: 'awarded', finalScore: score, adminNotes: adminNotes || '',
        certificateId: certId, awardedAt: new Date().toISOString(),
        awardedBy: state.operator?.name || 'admin'
      }));
    }
    await safePromise(D.update(D.ref(D.db, D.P(`courseCompletions/${uidKey}/${courseId}`)), {
      status: 'certificate-awarded', certificateId: certId,
      awardedAt: new Date().toISOString(), requiresAdminAction: false
    })).catch(() => {});

    await safePromise(D.logActivity('add', 'Training certificate awarded',
      `${userName} · ${courseTitle} · ${score}%${template ? ' · template: ' + template.title : ' · no template (HTML)'}`));
    D.toast(`🎓 Certificate awarded to ${userName || 'trainee'}${renderedImage ? ' (with image)' : ''}`, 'success');
  } catch (e) {
    D.toast('Award failed: ' + e.message, 'error');
  }
}

export function viewTrainingCert(certId) {
  const cert = toArr(D.state.data.trainingCertificates).find(c => c.id === certId);
  if (!cert) { D.toast('Certificate not found.', 'error'); return; }

  if (cert.renderedImage && D.$('certPreviewImg')) {
    D.$('certPreviewImg').src = cert.renderedImage;
    if (D.$('certPreviewDownloadBtn')) {
      D.$('certPreviewDownloadBtn').onclick = () => {
        const a = document.createElement('a');
        a.href = cert.renderedImage;
        a.download = `${(cert.userName || 'certificate').replace(/[^a-z0-9]/gi, '_')}_${cert.code || cert.id}.png`;
        a.click();
      };
    }
    D.openModal('certPreviewModal');
    return;
  }

  const course = toArr(D.state.data.trainingCourses).find(c => c.id === cert.courseId);
  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.style.zIndex = '2000';
  modal.innerHTML = `
    <div class="modal">
      <h2><span class="modal-icon"><i class="fa-solid fa-award"></i></span> Certificate Preview</h2>
      <div style="background:linear-gradient(135deg,rgba(255,200,87,.12),rgba(0,212,255,.12));border:2px solid var(--accent-gold);border-radius:16px;padding:32px;text-align:center;">
        <div style="font-size:3rem;color:var(--accent-gold);margin-bottom:8px;">🏆</div>
        <div style="font-size:1.4rem;font-weight:800;margin-bottom:6px;">Certificate of Completion</div>
        <div style="font-size:.85rem;color:var(--text-secondary);margin:18px 0 6px;">This certifies that</div>
        <div style="font-size:1.6rem;font-weight:800;margin:6px 0;">${D.escapeHtml(cert.userName)}</div>
        <div style="font-size:.85rem;color:var(--text-secondary);margin:14px 0 6px;">has successfully completed</div>
        <div style="font-size:1.15rem;font-weight:700;margin:6px 0;color:var(--accent-blue);">${D.escapeHtml(course?.title || cert.courseTitle || 'Course')}</div>
        <div style="margin-top:22px;font-size:.75rem;color:var(--text-secondary);">
          Score: <strong>${cert.score || 100}%</strong> · Issued ${D.fmtDate(cert.issuedAt)}<br>
          <span style="font-family:monospace;margin-top:8px;display:inline-block;background:rgba(0,0,0,.25);padding:4px 10px;border-radius:6px;">${D.escapeHtml(cert.code || cert.id)}</span>
        </div>
        <div style="margin-top:10px;font-size:.7rem;color:var(--text-light);">Issued by ${D.escapeHtml(cert.issuedBy || 'admin')}</div>
      </div>
      <div class="form-actions" style="margin-top:20px;"><button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Close</button></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

export async function revokeTrainingCertImpl(certId) {
  const state = D.state;
  const cert = toArr(state.data.trainingCertificates).find(c => c.id === certId);
  if (!cert) return;
  if (!confirm(`Revoke certificate for "${cert.userName}" — "${cert.courseTitle}"?\n\nThis cannot be undone.`)) return;
  try {
    await safePromise(D.remove(D.ref(D.db, D.P(`certificates/${certId}`))));
    await safePromise(D.logActivity('delete', 'Certificate revoked', `${cert.userName} · ${cert.courseTitle}`));
    D.toast('Certificate revoked.', 'info');
    if (state.currentTab === 'training-certificates') renderTrainingCertificates();
    if (state.currentTab === 'training-progress')    renderTrainingProgress();
  } catch (e) {
    D.toast('Revoke failed: ' + e.message, 'error');
  }
}

/* ── Certificate template editor ── */
export function openCertTemplateEditor(templateId = null) {
  const state = D.state;
  const editing = templateId ? (state.data.trainingCertTemplates || {})[templateId] : null;
  if (D.$('certTemplateEditorTitle')) D.$('certTemplateEditorTitle').textContent = templateId ? 'Edit Certificate Template' : 'New Certificate Template';
  D.$('cteTemplateId').value = templateId || '';

  const courseSel = D.$('cteCourseId');
  if (courseSel) {
    courseSel.innerHTML = '<option value="">— Select a course —</option>' +
      toArr(state.data.trainingCourses).map(c => `<option value="${c.id}">${D.escapeHtml(c.title)}</option>`).join('');
    courseSel.value = editing?.courseId || '';
  }

  refreshCertTemplateModules(editing?.moduleId || '');

  D.$('cteTitle').value = editing?.title || '';
  D.$('cteDescription').value = editing?.description || '';
  if (D.$('cteDeleteBtn')) D.$('cteDeleteBtn').style.display = templateId ? 'inline-flex' : 'none';

  if (D.$('ctePreviewWrap')) D.$('ctePreviewWrap').style.display = 'none';
  if (D.$('cteLayoutControls')) D.$('cteLayoutControls').style.display = 'none';
  state._cteImageData = null;
  state._cteImageMime = 'image/png';
  state._cteLayout = editing?.layout || {
    nameX: 0.5, nameY: 0.42, nameSize: 0.055, nameColor: '#0a0a0f', nameAlign: 'center',
    dateX: 0.5, dateY: 0.72, dateSize: 0.022, dateColor: '#4a5568',
    codeX: 0.5, codeY: 0.86, codeSize: 0.014, codeColor: '#94a3b8'
  };

  if (editing?.imageData) {
    state._cteImageData = editing.imageData;
    state._cteImageMime = editing.imageMime || 'image/png';
    showCertTemplatePreview(editing.imageData);
  }

  D.openModal('certTemplateEditorModal');
  setTimeout(() => {
    if (typeof setupCertStampDragging === 'function') setupCertStampDragging();
    else if (D.setupCertStampDragging) D.setupCertStampDragging();
  }, 60);
}

export function refreshCertTemplateModules(preselect) {
  const courseId = D.$('cteCourseId')?.value;
  const modSel = D.$('cteModuleId');
  if (!modSel) return;
  const course = toArr(D.state.data.trainingCourses).find(c => c.id === courseId);
  const mods = course ? Object.values(course.modules || {}).sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
  modSel.innerHTML = '<option value="">— Whole Course —</option>' +
    mods.map(m => `<option value="${m.id}">${D.escapeHtml(m.title)}</option>`).join('');
  if (preselect) modSel.value = preselect;
}

export function showCertTemplatePreview(imageData) {
  const wrap = D.$('ctePreviewWrap');
  const img = D.$('ctePreviewImage');
  const controls = D.$('cteLayoutControls');
  if (!wrap || !img) return;
  img.src = imageData;
  wrap.style.display = 'block';
  if (controls) controls.style.display = 'block';
  setTimeout(() => paintCertTemplateStamps(), 50);
}

export function paintCertTemplateStamps() {
  const stage = D.$('ctePreviewStage');
  if (!stage) return;
  const L = D.state._cteLayout || {};
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  if (!W || !H) return;

  const setStamp = (name, text, x, y, size, color, font) => {
    const el = stage.querySelector(`[data-stamp="${name}"]`);
    if (!el) return;
    el.textContent = text;
    el.style.left = (W * (x || 0.5)) + 'px';
    el.style.top  = (H * (y || 0.5)) + 'px';
    el.style.fontSize = Math.max(8, Math.round(W * (size || 0.03))) + 'px';
    el.style.color = color || '#000';
    el.style.fontFamily = font || 'inherit';
  };

  setStamp('name', 'Jane Doe', L.nameX, L.nameY, L.nameSize, L.nameColor, "'Space Grotesk', sans-serif");
  setStamp('date', new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), L.dateX, L.dateY, L.dateSize, L.dateColor, 'Inter, sans-serif');
  setStamp('code', 'VIORA-ABC123', L.codeX, L.codeY, L.codeSize, L.codeColor, 'monospace');
}

export async function saveCertTemplate() {
  const state = D.state;
  const courseId = D.$('cteCourseId')?.value;
  const moduleId = D.$('cteModuleId')?.value || null;
  const title = D.$('cteTitle')?.value.trim();
  if (!courseId) { D.toast('Pick a course.', 'error'); return; }
  if (!title) { D.toast('Title is required.', 'error'); return; }
  if (!state._cteImageData) { D.toast('Upload a certificate image.', 'error'); return; }

  const editingId = D.$('cteTemplateId').value;
  const id = editingId || ('tpl-' + D.uid());

  const payload = {
    id, courseId, moduleId, title,
    description: (D.$('cteDescription')?.value || '').trim(),
    imageData: state._cteImageData,
    imageMime: state._cteImageMime || 'image/png',
    layout: state._cteLayout,
    uploadedAt: editingId
      ? ((state.data.trainingCertTemplates || {})[editingId]?.uploadedAt || new Date().toISOString())
      : new Date().toISOString(),
    uploadedBy: state.operator?.name || 'admin',
    awardedCount: (state.data.trainingCertTemplates || {})[editingId]?.awardedCount || 0
  };

  try {
    await safePromise(D.set(D.ref(D.db, D.P(`certificateTemplates/${id}`)), payload));
    await safePromise(D.logActivity(editingId ? 'edit' : 'add', editingId ? 'Certificate template updated' : 'Certificate template created', title));
    D.toast('Template saved.', 'success');
    D.closeModal('certTemplateEditorModal');
    renderTrainingCertificates();
  } catch (e) { D.toast('Save failed: ' + e.message, 'error'); }
}

export async function deleteCertTemplate(templateId) {
  const state = D.state;
  const tpl = (state.data.trainingCertTemplates || {})[templateId];
  if (!tpl) return;
  if (!confirm(`Delete template "${tpl.title}"? Certificates already issued with it are unaffected.`)) return;
  try {
    await safePromise(D.remove(D.ref(D.db, D.P(`certificateTemplates/${templateId}`))));
    await safePromise(D.logActivity('delete', 'Certificate template deleted', tpl.title));
    D.toast('Template deleted.', 'info');
    renderTrainingCertificates();
  } catch (e) { D.toast('Delete failed: ' + e.message, 'error'); }
}

export function handleCertTemplateImage(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    D.toast('Please select an image file (PNG or JPG).', 'error');
    return;
  }
  if (file.size > 500 * 1024) {
    D.toast('Image too large (max 500 KB). Compress it first.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const state = D.state;
    state._cteImageData = ev.target.result;
    state._cteImageMime = file.type;
    showCertTemplatePreview(ev.target.result);
    D.toast('Image loaded — position the stamps.', 'success');
  };
  reader.onerror = () => D.toast('Could not read image.', 'error');
  reader.readAsDataURL(file);
}

export async function renderCertificateImage(template, user, cert) {
  const src = template.imageData;
  if (!src) return null;

  let bitmap = null;
  let img = null;
  try {
    if (typeof createImageBitmap === 'function' && typeof fetch === 'function' && src.startsWith('data:')) {
      const res = await fetch(src);
      const blob = await res.blob();
      bitmap = await createImageBitmap(blob);
    }
  } catch (e) { /* fall through */ }

  return new Promise((resolve) => {
    const paint = (image, w, h) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);

        const L = template.layout || {};
        const W = canvas.width, H = canvas.height;

        ctx.font = `700 ${Math.round(W * (L.nameSize || 0.055))}px "Space Grotesk", sans-serif`;
        ctx.fillStyle = L.nameColor || '#0a0a0f';
        ctx.textAlign = L.nameAlign || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(user.name || 'Trainee', W * (L.nameX || 0.5), H * (L.nameY || 0.42));

        const dateStr = new Date(cert.issuedAt || Date.now())
          .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        ctx.font = `500 ${Math.round(W * (L.dateSize || 0.022))}px Inter, sans-serif`;
        ctx.fillStyle = L.dateColor || '#4a5568';
        ctx.textAlign = 'center';
        ctx.fillText(dateStr, W * (L.dateX || 0.5), H * (L.dateY || 0.72));

        ctx.font = `400 ${Math.round(W * (L.codeSize || 0.014))}px monospace`;
        ctx.fillStyle = L.codeColor || '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText(cert.code || cert.id || '', W * (L.codeX || 0.5), H * (L.codeY || 0.86));

        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        console.warn('[cert render] failed:', e);
        resolve(null);
      } finally {
        if (bitmap && bitmap.close) bitmap.close();
      }
    };

    if (bitmap) { paint(bitmap, bitmap.width, bitmap.height); return; }

    img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => paint(img, img.naturalWidth, img.naturalHeight);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function openManualAwardModal() {
  const state = D.state;
  const userMap = new Map();
  for (const u of toArr(state.data.users))       if (u && u.uid) userMap.set(u.uid, { uid: u.uid, name: u.name || u.email, email: u.email });
  for (const u of toArr(state.data.portalUsers)) if (u && u.uid) userMap.set(u.uid, { uid: u.uid, name: u.name || u.email, email: u.email });
  const users = Array.from(userMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const courses = toArr(state.data.trainingCourses);
  const templates = Object.values(state.data.trainingCertTemplates || {});
  if (!users.length)   { D.toast('No users available.',   'error'); return; }
  if (!courses.length) { D.toast('No courses available.', 'error'); return; }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.style.zIndex = '2000';
  modal.innerHTML = `
    <div class="modal">
      <h2><span class="modal-icon"><i class="fa-solid fa-award"></i></span> Manually Award Certificate</h2>
      <p style="font-size:.82rem;color:var(--text-secondary);margin-bottom:14px;">Issue a certificate outside the normal quiz flow.</p>

      <label>User *</label>
      <select id="maUser">${users.map(u => `<option value="${u.uid}">${D.escapeHtml(u.name || '—')} — ${D.escapeHtml(u.email || '')}</option>`).join('')}</select>

      <label>Course *</label>
      <select id="maCourse">${courses.map(c => `<option value="${c.id}">${D.escapeHtml(c.title)}</option>`).join('')}</select>

      <label>Module (optional)</label>
      <select id="maModule"><option value="">— Whole Course —</option></select>

      <label>Certificate template *</label>
      <select id="maTemplate">
        <option value="__auto__">🪄 Auto-select (best match for course/module)</option>
        <option value="__none__">❌ No template (generate HTML certificate)</option>
        ${templates.map(t => {
          const course = courses.find(c => c.id === t.courseId);
          const mod = t.moduleId ? course?.modules?.[t.moduleId] : null;
          return `<option value="${t.id}">${D.escapeHtml(t.title)} — ${D.escapeHtml(course?.title || '')}${mod ? ' → ' + D.escapeHtml(mod.title) : ''}</option>`;
        }).join('')}
      </select>

      <label>Score (0–100)</label>
      <input type="number" id="maScore" value="100" min="0" max="100" />

      <label>Admin Notes (optional)</label>
      <textarea id="maNotes" rows="2" placeholder="e.g. Awarded for participation in Q1 workshop."></textarea>

      <div class="form-actions">
        <button type="button" class="btn btn-outline" id="maCancel">Cancel</button>
        <button type="button" class="btn btn-gold" id="maConfirm"><i class="fa-solid fa-award"></i> Award Certificate</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#maCancel').onclick = () => modal.remove();

  const courseSel = modal.querySelector('#maCourse');
  const moduleSel = modal.querySelector('#maModule');
  const refreshModules = () => {
    const course = courses.find(c => c.id === courseSel.value);
    const mods = course ? Object.values(course.modules || {}).sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
    moduleSel.innerHTML = '<option value="">— Whole Course —</option>' + mods.map(m => `<option value="${m.id}">${D.escapeHtml(m.title)}</option>`).join('');
  };
  courseSel.addEventListener('change', refreshModules);
  refreshModules();

  modal.querySelector('#maConfirm').onclick = async () => {
    const userUid = modal.querySelector('#maUser').value;
    const courseId = modal.querySelector('#maCourse').value;
    const moduleId = moduleSel.value || null;
    const templateChoice = modal.querySelector('#maTemplate').value;
    const score = parseInt(modal.querySelector('#maScore').value, 10) || 100;
    const notes = modal.querySelector('#maNotes').value.trim();
    const user = userMap.get(userUid);
    const course = courses.find(c => c.id === courseId);
    const moduleTitle = moduleId ? course?.modules?.[moduleId]?.title : null;

    const forcedTemplateId = templateChoice === '__auto__' ? undefined
                          : templateChoice === '__none__' ? null
                          : templateChoice;

    await awardTrainingCertificate({
      uid: userUid,
      userName: user?.name || 'Trainee',
      userEmail: user?.email || '',
      courseId,
      courseTitle: course?.title || 'Course',
      moduleId, moduleTitle,
      score, adminNotes: notes,
      sourceSubmission: false,
      forcedTemplateId
    });
    modal.remove();
  };
}

/* ═══════════════════════════════════════════════════════════════
   NAMESPACED EXPORT
   ═══════════════════════════════════════════════════════════════ */
export const T = {
  renderTrainingOverview,
  renderTrainingRequests,
  renderTrainingUsers,
  renderTrainingProgress,
  renderTrainingQuizzes,
  renderTrainingCertificates,
  viewQuizSubmission,
  openCourseEditor,
  renderCeModules,
  toggleCeQuiz,
  addQuizQuestion,
  removeQuizQuestion,
  updateQuizQuestion,
  updateQuizOption,
  setQuizAnswer,
  addQuizOption,
  removeQuizOption,
  updateCeModule,
  addCeModule,
  removeCeModule,
  moveCeModule,
  saveCourse,
  deleteCourse,
  openChecklistEditor,
  renderCleTasks,
  updateCleTask,
  addCleTask,
  removeCleTask,
  saveChecklist,
  openResourceEditor,
  handleReFile,
  saveResource,
  deleteResource,
  openResourceFile,
  awardTrainingCertificate,
  viewTrainingCert,
  revokeTrainingCertImpl,
  renderCertTemplatesGrid,
  openCertTemplateEditor,
  refreshCertTemplateModules,
  showCertTemplatePreview,
  paintCertTemplateStamps,
  saveCertTemplate,
  deleteCertTemplate,
  handleCertTemplateImage,
  renderCertificateImage,
  openManualAwardModal,
};

export default T;

/* ═══════════════════════════════════════════════════════════════
   AUTO CERTIFICATION
   ═══════════════════════════════════════════════════════════════ */
export const AutoCertification = (function () {
  async function backfillAll() {
    const state = D.state;
    const all = Object.values(state.data.trainingQuizSubmissions || {})
      .flatMap(byCourse => Object.values(byCourse || {}));
    const eligible = all.filter(s =>
      ((s.status || 'submitted') === 'submitted') && Number(s.autoScore || 0) >= 80
    );
    if (!eligible.length) {
      D.toast('No eligible submissions for auto-award.', 'info');
      return;
    }
    if (!confirm(`Auto-award certificates to ${eligible.length} eligible submission(s)?`)) return;

    const existingKeys = new Set(
      toArr(state.data.trainingCertificates).map(x => x.uid + '|' + x.courseId)
    );

    let awarded = 0;
    for (const s of eligible) {
      const key = s.uid + '|' + s.courseId;
      if (existingKeys.has(key)) continue;
      try {
        await awardTrainingCertificate({
          uid: s.uid, userName: s.userName, userEmail: s.userEmail,
          courseId: s.courseId, courseTitle: s.courseTitle,
          moduleId: s.moduleId, score: s.autoScore,
          adminNotes: 'Backfilled auto-award (score ≥ 80%)',
          sourceSubmission: true
        });
        existingKeys.add(key);
        awarded++;
      } catch (e) {
        console.warn('[AutoCertification] backfill failed', e);
      }
    }
    D.toast(`Awarded ${awarded} certificate(s).`, 'success');
    try { renderTrainingCertificates(); } catch (e) {}
  }
  return { backfillAll };
})();

/* ═══════════════════════════════════════════════════════════════
   CERT TEMPLATE STAMP DRAGGING
   ═══════════════════════════════════════════════════════════════ */
export function setupCertStampDragging() {
  const stage = D.$('ctePreviewStage');
  if (!stage) return;

  if (stage._dragAbort) {
    try { stage._dragAbort.abort(); } catch (e) {}
    stage._dragAbort = null;
  }
  const ac = new AbortController();
  stage._dragAbort = ac;
  const signal = ac.signal;

  let dragging = null;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  const beginDrag = (clientX, clientY, stamp) => {
    const r = stamp.getBoundingClientRect();
    dragging = stamp.dataset.stamp;
    startX = clientX;
    startY = clientY;
    startLeft = r.left;
    startTop = r.top;
    document.body.style.cursor = 'grabbing';
  };

  const moveDrag = (clientX, clientY) => {
    if (!dragging) return;
    const stageRect = stage.getBoundingClientRect();
    const W = stage.clientWidth, H = stage.clientHeight;
    const x = Math.max(0, Math.min(1, (startLeft + clientX - startX - stageRect.left) / W));
    const y = Math.max(0, Math.min(1, (startTop  + clientY - startY - stageRect.top)  / H));
    const L = D.state._cteLayout || (D.state._cteLayout = {});
    L[dragging + 'X'] = x;
    L[dragging + 'Y'] = y;
    const el = stage.querySelector(`[data-stamp="${dragging}"]`);
    if (el) {
      el.style.left = (W * x) + 'px';
      el.style.top  = (H * y) + 'px';
    }
  };

  const endDrag = () => {
    if (dragging) { dragging = null; document.body.style.cursor = ''; }
  };

  stage.querySelectorAll('.cte-stamp').forEach(stamp => {
    stamp.addEventListener('mousedown', e => { e.preventDefault(); beginDrag(e.clientX, e.clientY, stamp); }, { signal });
    stamp.addEventListener('touchstart', e => {
      if (e.touches[0]) { e.preventDefault(); beginDrag(e.touches[0].clientX, e.touches[0].clientY, stamp); }
    }, { passive: false, signal });
  });

  document.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY), { signal });
  document.addEventListener('touchmove', e => {
    if (e.touches[0]) moveDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false, signal });
  document.addEventListener('mouseup', endDrag, { signal });
  document.addEventListener('touchend', endDrag, { signal });
}

/* ═══════════════════════════════════════════════════════════════
   TRAINING VIORA API
   FIX 8 + FIX 9: all D.P calls strip training/; openUserTraining null-guards
   ═══════════════════════════════════════════════════════════════ */
export const TrainingVioraAPI = {
  async approveTrainingRequest(uid) {
    const state = D.state;
    const req = (state.data.trainingAccessRequests || {})[uid];
    if (!req) { D.toast('Request not found.', 'error'); return; }
    try {
      await safePromise(D.update(D.ref(D.db, D.P(`accessRequests/${uid}`)), {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: state.operator?.name || 'admin'
      }));
      try {
        await safePromise(D.update(D.ref(D.db, `${D.ROOT}/orgs/viora/users/${uid}`), {
          trainingStatus: 'approved',
          trainingApprovedAt: new Date().toISOString()
        }));
      } catch (e) { /* non-fatal */ }
      await safePromise(D.logActivity('add', 'Training request approved', `${req.name || req.email || uid}`));
      D.toast('User approved for training.', 'success');
      renderTrainingRequests();
    } catch (e) { D.toast('Approve failed: ' + e.message, 'error'); }
  },

  async rejectTrainingRequest(uid) {
    const state = D.state;
    const req = (state.data.trainingAccessRequests || {})[uid];
    if (!req) return;
    if (!confirm(`Reject training request from "${req.name || req.email}"?`)) return;
    try {
      await safePromise(D.update(D.ref(D.db, D.P(`accessRequests/${uid}`)), {
        status: 'rejected',
        rejectedAt: new Date().toISOString(),
        rejectedBy: state.operator?.name || 'admin'
      }));
      try { await safePromise(D.update(D.ref(D.db, `${D.ROOT}/orgs/viora/users/${uid}`), { trainingStatus: 'rejected' })); } catch (e) {}
      await safePromise(D.logActivity('delete', 'Training request rejected', `${req.name || req.email || uid}`));
      D.toast('Request rejected.', 'info');
      renderTrainingRequests();
    } catch (e) { D.toast('Reject failed: ' + e.message, 'error'); }
  },

  async reopenTrainingRequest(uid) {
    const state = D.state;
    try {
      await safePromise(D.update(D.ref(D.db, D.P(`accessRequests/${uid}`)), {
        status: 'pending',
        reopenedAt: new Date().toISOString(),
        reopenedBy: state.operator?.name || 'admin'
      }));
      D.toast('Request reopened — now pending.', 'info');
      renderTrainingRequests();
    } catch (e) { D.toast('Failed: ' + e.message, 'error'); }
  },

  editCourse(id)    { openCourseEditor(id); },
  editChecklist(id) { openChecklistEditor(id); },
  editResource(id)  { openResourceEditor(id); },

  openUserTraining(userUid) {
    const state = D.state;
    const $ = D.$;
    const users = toArr(state.data.users);
    const portalUsers = toArr(state.data.portalUsers);
    const u = users.find(x => x.uid === userUid) || portalUsers.find(x => x.uid === userUid);
    if (!u) { D.toast('User not found.', 'error'); return; }

    const isClient = portalUsers.some(x => x.uid === userUid);
    const courses = toArr(state.data.trainingCourses);
    const enrollments = state.data.trainingEnrollments?.[userUid] || {};
    const progress = state.data.trainingProgress?.[userUid] || {};
    const certs = toArr(state.data.trainingCertificates).filter(cert => cert.uid === userUid);
    const coursesById = indexBy(courses, c => c.id);

    if ($('tumUserName')) $('tumUserName').textContent = u.name || u.email || 'User';
    if ($('tumUserHeader')) $('tumUserHeader').innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;">
        <div><span style="color:var(--text-secondary);">Name:</span> <strong>${D.escapeHtml(u.name || '—')}</strong></div>
        <div><span style="color:var(--text-secondary);">Email:</span> ${D.escapeHtml(u.email || '—')}</div>
        <div><span style="color:var(--text-secondary);">Role:</span> ${isClient ? '<span class="badge badge-purple">Client</span>' : `<span class="badge badge-pending">${D.escapeHtml(u.role || 'member')}</span>`}</div>
      </div>`;

    const enrolledRows = Object.entries(enrollments).map(([cid, e]) => {
      const course = coursesById.get(cid);
      const uProg = progress[cid] || {};
      const totalModules = Object.keys(course?.modules || {}).length;
      const doneModules = Object.values(uProg).filter(m => m && m.completedAt).length;
      const pct = totalModules ? Math.round((doneModules / totalModules) * 100) : 0;
      return `<div class="card-3d" style="margin-bottom:10px;">
        <div class="card-info" style="flex:1;min-width:0;">
          <div class="card-title">${D.escapeHtml(course?.title || cid)} ${e && e.completedAt ? '<span class="badge badge-completed">Completed</span>' : '<span class="badge badge-inprogress">In Progress</span>'}</div>
          <div class="card-sub">${doneModules}/${totalModules} modules · ${pct}%</div>
        </div>
        <div class="card-actions">
          <button class="btn btn-gold btn-xs" onclick="Viora.resetUserCourseProgress('${userUid}', '${cid}')"><i class="fa-solid fa-rotate-left"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.unenrollUser('${userUid}', '${cid}')"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>`;
    }).join('');

    const enrolledIds = new Set(Object.keys(enrollments));
    const available = courses.filter(c => !enrolledIds.has(c.id));
    const availableRows = available.length
      ? available.map(c => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg-input);border-radius:10px;margin-bottom:6px;border:1px solid var(--border-color);">
          <div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:.85rem;">${D.escapeHtml(c.title)}</div><div style="font-size:.7rem;color:var(--text-secondary);">${Object.keys(c.modules || {}).length} modules</div></div>
          <button class="btn btn-success btn-sm" onclick="Viora.enrollUserInCourse('${userUid}', '${c.id}')"><i class="fa-solid fa-plus"></i> Enroll</button>
        </div>`).join('')
      : '<div style="font-size:.8rem;color:var(--text-secondary);text-align:center;padding:12px;">User is enrolled in all available courses.</div>';

    const certsList = certs.length
      ? certs.map(cert => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(255,200,87,.08);border:1px solid var(--accent-gold);border-radius:10px;margin-bottom:6px;">
          <div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:.85rem;">🎓 ${D.escapeHtml(cert.courseTitle || '')}</div><div style="font-size:.7rem;color:var(--text-secondary);font-family:monospace;">${D.escapeHtml(cert.code || cert.id)}</div></div>
          <button class="btn btn-danger btn-xs" onclick="Viora.revokeCertificate('${cert.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>`).join('')
      : '<div style="font-size:.8rem;color:var(--text-secondary);text-align:center;padding:12px;">No certificates yet.</div>';

    if ($('tumUserBody')) $('tumUserBody').innerHTML = `
      <div style="margin-bottom:24px;">
        <h4 style="font-size:.82rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.6px;margin-bottom:12px;">Enrolled Courses (${Object.keys(enrollments).length})</h4>
        ${enrolledRows || '<div class="empty-state" style="padding:20px;">Not enrolled in any courses yet.</div>'}
      </div>
      <div style="margin-bottom:24px;">
        <h4 style="font-size:.82rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.6px;margin-bottom:12px;">Available Courses (${available.length})</h4>
        ${availableRows}
      </div>
      <div style="margin-bottom:24px;">
        <h4 style="font-size:.82rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.6px;margin-bottom:12px;">Certificates (${certs.length})</h4>
        ${certsList}
      </div>
      <div style="padding:14px;background:rgba(255,92,124,.05);border-left:4px solid var(--accent-red);border-radius:10px;">
        <h4 style="font-size:.82rem;color:var(--accent-red);margin-bottom:8px;font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> Danger Zone</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-danger btn-sm" onclick="Viora.resetAllUserTraining('${userUid}')"><i class="fa-solid fa-eraser"></i> Reset All</button>
          <button class="btn btn-danger btn-sm" onclick="Viora.deleteTrainingUser('${userUid}'); Viora.closeModal('trainingUserModal');"><i class="fa-solid fa-user-xmark"></i> Delete User</button>
        </div>
      </div>`;

    if (typeof D.openModal === 'function') D.openModal('trainingUserModal');
  },

  async deleteTrainingUser(userUid) {
    const state = D.state;
    if (!userUid) { D.toast('No user selected.', 'error'); return; }
    const operatorUser = toArr(state.data.users).find(u => u.uid === userUid);
    const portalUser   = toArr(state.data.portalUsers).find(u => u.uid === userUid);
    const user = operatorUser || portalUser;
    if (!user) { D.toast('User not found.', 'error'); return; }

    const isPortalClient = !!portalUser && !operatorUser;
    const displayName = user.name || user.email || userUid;
    const confirmMsg =
      `⚠️ DELETE ${isPortalClient ? 'PORTAL CLIENT' : 'OPERATOR'} PERMANENTLY?\n\n` +
      `Name:  ${user.name || '—'}\nEmail: ${user.email || '—'}\nUID:   ${userUid}\n\n` +
      `This removes enrollments, progress, certs, and quiz submissions.\n\nContinue?`;
    if (!confirm(confirmMsg)) return;

    const jobs = [
      safePromise(D.remove(D.ref(D.db, D.P(`enrollments/${userUid}`)))).catch(() => {}),
      safePromise(D.remove(D.ref(D.db, D.P(`progress/${userUid}`)))).catch(() => {}),
      safePromise(D.remove(D.ref(D.db, D.P(`quizSubmissions/${userUid}`)))).catch(() => {}),
      safePromise(D.remove(D.ref(D.db, D.P(`courseCompletions/${userUid}`)))).catch(() => {})
    ];
    const userCerts = toArr(state.data.trainingCertificates).filter(cert => cert.uid === userUid);
    for (const cert of userCerts) {
      jobs.push(safePromise(D.remove(D.ref(D.db, D.P(`certificates/${cert.id}`)))).catch(() => {}));
    }
    await Promise.all(jobs);

    if (isPortalClient) {
      try { await safePromise(D.callFn('portal/deleteUser', { uid: userUid })); } catch (e) {}
      try { await safePromise(D.remove(D.ref(D.db, `${D.ROOT}/orgs/viora/portalUsers/${userUid}`))); } catch (e) {}
      try { await safePromise(D.remove(D.ref(D.db, `${D.ROOT}/orgs/viora/portalRequests/${userUid}`))); } catch (e) {}
      state.data.portalUsers = toArr(state.data.portalUsers).filter(u => u.uid !== userUid);
    } else {
      try { await safePromise(D.remove(D.ref(D.db, `${D.ROOT}/orgs/viora/users/${userUid}`))); } catch (e) {}
      try { await safePromise(D.remove(D.ref(D.db, `${D.ROOT}/users/${userUid}`))); } catch (e) {}
    }
    state.data.users = toArr(state.data.users).filter(u => u.uid !== userUid);
    state.data.trainingCertificates = toArr(state.data.trainingCertificates).filter(c => c.uid !== userUid);
    await safePromise(D.logActivity('delete', 'Training user deleted', displayName));
    D.toast('User deleted.', 'success');
    try { renderTrainingProgress(); } catch (e) {}
  },

  async enrollUserInCourse(userUid, courseId) {
    const state = D.state;
    const course = toArr(state.data.trainingCourses).find(x => x.id === courseId);
    if (!course) { D.toast('Course not found.', 'error'); return; }
    try {
      const existing = state.data.trainingEnrollments?.[userUid]?.[courseId];
      if (existing) { D.toast('Already enrolled.', 'info'); return; }
      await safePromise(D.set(D.ref(D.db, D.P(`enrollments/${userUid}/${courseId}`)), {
        courseId,
        startedAt: new Date().toISOString(),
        progress: 0,
        completedAt: null,
        enrolledBy: state.operator?.uid || 'admin',
        enrolledByName: state.operator?.name || 'admin',
        enrolledAt: new Date().toISOString()
      }));
      await safePromise(D.logActivity('add', 'User enrolled', `${userUid.slice(0, 8)} → ${course.title}`));
      D.toast(`Enrolled in "${course.title}"`, 'success');
      setTimeout(() => TrainingVioraAPI.openUserTraining(userUid), 300);
    } catch (e) { D.toast('Enroll failed: ' + e.message, 'error'); }
  },

  async unenrollUser(userUid, courseId) {
    const state = D.state;
    const course = toArr(state.data.trainingCourses).find(x => x.id === courseId);
    if (!course) return;
    if (!confirm(`Unenroll from "${course.title}"?`)) return;
    try {
      await safePromise(D.remove(D.ref(D.db, D.P(`enrollments/${userUid}/${courseId}`))));
      await safePromise(D.remove(D.ref(D.db, D.P(`progress/${userUid}/${courseId}`))));
      await safePromise(D.logActivity('delete', 'User unenrolled', `${userUid.slice(0, 8)} × ${course.title}`));
      D.toast('Unenrolled.', 'info');
      setTimeout(() => TrainingVioraAPI.openUserTraining(userUid), 300);
    } catch (e) { D.toast('Unenroll failed: ' + e.message, 'error'); }
  },

  async resetUserCourseProgress(userUid, courseId) {
    const state = D.state;
    if (!confirm('Reset all module progress for this course?')) return;
    try {
      await safePromise(D.remove(D.ref(D.db, D.P(`progress/${userUid}/${courseId}`))));
      await safePromise(D.update(D.ref(D.db, D.P(`enrollments/${userUid}/${courseId}`)), {
        progress: 0, completedAt: null,
        resetAt: new Date().toISOString(),
        resetBy: state.operator?.uid || 'admin'
      }));
      D.toast('Progress reset.', 'info');
      setTimeout(() => TrainingVioraAPI.openUserTraining(userUid), 300);
    } catch (e) { D.toast('Reset failed: ' + e.message, 'error'); }
  },

  async resetAllUserTraining(userUid) {
    const state = D.state;
    if (!confirm('Reset ALL training data for this user? Cannot be undone.')) return;
    try {
      await safePromise(D.remove(D.ref(D.db, D.P(`enrollments/${userUid}`))));
      await safePromise(D.remove(D.ref(D.db, D.P(`progress/${userUid}`))));
      const certs = toArr(state.data.trainingCertificates).filter(cert => cert.uid === userUid);
      for (const cert of certs) await safePromise(D.remove(D.ref(D.db, D.P(`certificates/${cert.id}`))));
      D.toast('All training data reset.', 'info');
      if (typeof D.closeModal === 'function') D.closeModal('trainingUserModal');
    } catch (e) { D.toast('Reset failed: ' + e.message, 'error'); }
  },

  async revokeCertificate(certId) {
    const state = D.state;
    const cert = toArr(state.data.trainingCertificates).find(c => c.id === certId);
    if (!cert) return;
    if (!confirm(`Revoke certificate for "${cert.userName}"?`)) return;
    try {
      await safePromise(D.remove(D.ref(D.db, D.P(`certificates/${certId}`))));
      await safePromise(D.logActivity('delete', 'Certificate revoked', `${cert.userName} · ${cert.courseTitle}`));
      D.toast('Certificate revoked.', 'info');
      try { renderTrainingProgress(); } catch (e) {}
    } catch (e) { D.toast('Revoke failed: ' + e.message, 'error'); }
  },

  viewQuizSubmission,
  viewTrainingCert,
  revokeTrainingCert(certId) { return revokeTrainingCertImpl(certId); },

  openEnrollUserModal() {
    const state = D.state;
    const $ = D.$;
    const users = toArr(state.data.users).concat(
      toArr(state.data.portalUsers).filter(p => !toArr(state.data.users).find(u => u.uid === p.uid))
    );
    const courses = toArr(state.data.trainingCourses);
    if (!users.length)   { D.toast('No registered users yet.', 'warning'); return; }
    if (!courses.length) { D.toast('No courses yet. Create one first.', 'warning'); return; }
    if ($('teuUser')) $('teuUser').innerHTML = users.map(u =>
      `<option value="${u.uid}">${D.escapeHtml(u.name || u.email || u.uid)} — ${D.escapeHtml(u.email || '')}</option>`
    ).join('');
    if ($('teuCourse')) $('teuCourse').innerHTML = courses.map(c =>
      `<option value="${c.id}">${D.escapeHtml(c.title)} (${Object.keys(c.modules || {}).length} modules)</option>`
    ).join('');
    if ($('teuMarkRequired')) $('teuMarkRequired').checked = false;
    if (typeof D.openModal === 'function') D.openModal('trainingEnrollModal');
  }
};

/* ═══════════════════════════════════════════════════════════════
   BIND TRAINING EVENTS
   ═══════════════════════════════════════════════════════════════ */
export function bindTrainingEvents() {
  const $ = D.$;
  const toast = D.toast;
  if (typeof $ !== 'function') {
    console.error('[training] bindTrainingEvents: D.$ not injected');
    return;
  }

  const bind = (id, evt, fn) => {
    const el = $(id);
    if (!el || el._vioraBound) return;
    el._vioraBound = true;
    el.addEventListener(evt, fn);
  };

  bind('addCourseBtn',       'click', () => openCourseEditor());
  bind('addChecklistBtn',    'click', () => openChecklistEditor());
  bind('addResourceBtn',     'click', () => openResourceEditor());
  bind('newCertTemplateBtn', 'click', () => openCertTemplateEditor());

  bind('ceAddModuleBtn', 'click', addCeModule);
  bind('ceSaveBtn',      'click', saveCourse);

  bind('cleAddTaskBtn', 'click', addCleTask);
  bind('cleSaveBtn',    'click', saveChecklist);

  bind('reSaveBtn', 'click', saveResource);

  const reFileInput  = $('reFileInput');
  const reUploadZone = $('reUploadZone');
  if (reUploadZone && !reUploadZone._vioraBound) {
    reUploadZone._vioraBound = true;
    reUploadZone.addEventListener('click', () => reFileInput && reFileInput.click());
    reUploadZone.addEventListener('dragover', e => {
      e.preventDefault();
      e.currentTarget.style.borderColor = 'var(--accent-blue)';
    });
    reUploadZone.addEventListener('dragleave', e => {
      e.currentTarget.style.borderColor = '';
    });
    reUploadZone.addEventListener('drop', e => {
      e.preventDefault();
      e.currentTarget.style.borderColor = '';
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleReFile(e.dataTransfer.files[0]);
      }
    });
  }
  if (reFileInput && !reFileInput._vioraBound) {
    reFileInput._vioraBound = true;
    reFileInput.addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) handleReFile(e.target.files[0]);
      e.target.value = '';
    });
  }

  bind('cteSaveBtn',   'click', saveCertTemplate);
  bind('cteDeleteBtn', 'click', () => {
    const id = $('cteTemplateId') && $('cteTemplateId').value;
    if (id) deleteCertTemplate(id);
  });

  const cteUploadZone = $('cteUploadZone');
  const cteImageInput = $('cteImageInput');
  if (cteUploadZone && !cteUploadZone._vioraBound) {
    cteUploadZone._vioraBound = true;
    cteUploadZone.addEventListener('click', () => cteImageInput && cteImageInput.click());
    cteUploadZone.addEventListener('dragover', e => {
      e.preventDefault();
      e.currentTarget.style.borderColor = 'var(--accent-blue)';
    });
    cteUploadZone.addEventListener('dragleave', e => {
      e.currentTarget.style.borderColor = '';
    });
    cteUploadZone.addEventListener('drop', e => {
      e.preventDefault();
      e.currentTarget.style.borderColor = '';
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleCertTemplateImage(e.dataTransfer.files[0]);
      }
    });
  }
  if (cteImageInput && !cteImageInput._vioraBound) {
    cteImageInput._vioraBound = true;
    cteImageInput.addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) handleCertTemplateImage(e.target.files[0]);
      e.target.value = '';
    });
  }

  bind('cteCourseId', 'change', () => refreshCertTemplateModules());

  const sliders = [
    ['cteNameSize', 'nameSize'],
    ['cteNameColor', 'nameColor'],
    ['cteDateSize', 'dateSize'],
    ['cteDateColor', 'dateColor'],
    ['cteCodeSize', 'codeSize'],
    ['cteCodeColor', 'codeColor']
  ];
  for (const pair of sliders) {
    const elId = pair[0];
    const key  = pair[1];
    const el = $(elId);
    if (!el || el._vioraBound) continue;
    el._vioraBound = true;
    el.addEventListener('input', () => {
      const state = D.state;
      state._cteLayout = state._cteLayout || {};
      const v = el.type === 'range' ? parseFloat(el.value) : el.value;
      state._cteLayout[key] = v;
      paintCertTemplateStamps();
    });
  }

  bind('quizzesRefreshBtn', 'click', () => {
    renderTrainingQuizzes();
    toast('Refreshed.', 'info');
  });
  bind('quizFilterStatus', 'change', renderTrainingQuizzes);

  const quizzesSearch = $('quizzesSearch');
  if (quizzesSearch && !quizzesSearch._vioraBound) {
    quizzesSearch._vioraBound = true;
    const debounced = debounce(renderTrainingQuizzes, 150);
    quizzesSearch.addEventListener('input', debounced);
    quizzesSearch._debounced = debounced;
  }
  bind('quizzesClearSearch', 'click', () => {
    if (quizzesSearch) {
      quizzesSearch.value = '';
      if (quizzesSearch._debounced && quizzesSearch._debounced.cancel) quizzesSearch._debounced.cancel();
    }
    const f = $('quizFilterStatus');
    if (f) f.value = 'all';
    renderTrainingQuizzes();
  });

  bind('certsRefreshBtn', 'click', () => {
    renderTrainingCertificates();
    toast('Refreshed.', 'info');
  });

  const certsSearch = $('certsSearch');
  if (certsSearch && !certsSearch._vioraBound) {
    certsSearch._vioraBound = true;
    const debounced = debounce(renderTrainingCertificates, 150);
    certsSearch.addEventListener('input', debounced);
    certsSearch._debounced = debounced;
  }
  bind('certsClearSearch', 'click', () => {
    if (certsSearch) {
      certsSearch.value = '';
      if (certsSearch._debounced && certsSearch._debounced.cancel) certsSearch._debounced.cancel();
    }
    renderTrainingCertificates();
  });
  bind('manualAwardCertBtn', 'click', openManualAwardModal);
  bind('rerunAutoAwardBtn', 'click', async () => {
    await AutoCertification.backfillAll();
  });

  bind('trainingEnrollUserBtn', 'click', () => TrainingVioraAPI.openEnrollUserModal());
  bind('teuConfirmBtn', 'click', async () => {
    const userUid = $('teuUser') && $('teuUser').value;
    const courseId = $('teuCourse') && $('teuCourse').value;
    if (!userUid || !courseId) { toast('Select user and course.', 'error'); return; }
    await TrainingVioraAPI.enrollUserInCourse(userUid, courseId);
    if (typeof D.closeModal === 'function') D.closeModal('trainingEnrollModal');
  });

  bind('trainingRefreshBtn', 'click', () => {
    renderTrainingProgress();
    toast('Refreshed.', 'info');
  });

  const progressSearch = $('trainingUserSearch');
  if (progressSearch && !progressSearch._vioraBound) {
    progressSearch._vioraBound = true;
    const debounced = debounce(() => {
      renderTrainingUsers();
      renderTrainingProgress();
    }, 150);
    progressSearch.addEventListener('input', debounced);
    progressSearch._debounced = debounced;
  }

  bind('trainingUserRoleFilter', 'change', () => {
    renderTrainingUsers();
    renderTrainingProgress();
  });
  bind('trainingUserCourseFilter', 'change', () => {
    renderTrainingUsers();
    renderTrainingProgress();
  });
  bind('trainingClearFilters', 'click', () => {
    if (progressSearch) {
      progressSearch.value = '';
      if (progressSearch._debounced && progressSearch._debounced.cancel) progressSearch._debounced.cancel();
    }
    const r = $('trainingUserRoleFilter');
    if (r) r.value = 'all';
    const cEl = $('trainingUserCourseFilter');
    if (cEl) cEl.value = 'all';
    renderTrainingUsers();
    renderTrainingProgress();
  });

  bind('trainingRequestsRefreshBtn', 'click', () => {
    renderTrainingRequests();
    toast('Refreshed.', 'info');
  });
  bind('trainingRequestsFilter', 'change', renderTrainingRequests);

  const reqSearch = $('trainingRequestsSearch');
  if (reqSearch && !reqSearch._vioraBound) {
    reqSearch._vioraBound = true;
    const debounced = debounce(renderTrainingRequests, 150);
    reqSearch.addEventListener('input', debounced);
    reqSearch._debounced = debounced;
  }
  bind('trainingRequestsClearSearch', 'click', () => {
    if (reqSearch) {
      reqSearch.value = '';
      if (reqSearch._debounced && reqSearch._debounced.cancel) reqSearch._debounced.cancel();
    }
    const f = $('trainingRequestsFilter');
    if (f) f.value = 'pending';
    renderTrainingRequests();
  });

  bind('trainingUsersRefreshBtn', 'click', () => {
    renderTrainingUsers();
    toast('Refreshed.', 'info');
  });

  console.info('[training] events bound (v8.1)');
}

/* ═══════════════════════════════════════════════════════════════
   EXPOSE ON WINDOW
   ═══════════════════════════════════════════════════════════════ */
if (typeof window !== 'undefined') {
  window.T = T;
  window.VioraTraining = T;
  window.VioraTrainingAPI = TrainingVioraAPI;

  window.openCertTemplateEditor     = openCertTemplateEditor;
  window.deleteCertTemplate         = deleteCertTemplate;
  window.saveCertTemplate           = saveCertTemplate;
  window.refreshCertTemplateModules = refreshCertTemplateModules;
  window.showCertTemplatePreview    = showCertTemplatePreview;
  window.paintCertTemplateStamps    = paintCertTemplateStamps;
  window.handleCertTemplateImage    = handleCertTemplateImage;

  window.openManualAwardModal     = openManualAwardModal;
  window.awardTrainingCertificate = awardTrainingCertificate;

  window.viewQuizSubmission = viewQuizSubmission;
  window.viewTrainingCert   = viewTrainingCert;
  window.revokeTrainingCert = revokeTrainingCertImpl;

  window.AutoCertification = AutoCertification;

  window.openCourseEditor    = openCourseEditor;
  window.openChecklistEditor = openChecklistEditor;
  window.openResourceEditor  = openResourceEditor;
  window.saveCourse          = saveCourse;
  window.deleteCourse        = deleteCourse;
  window.saveChecklist       = saveChecklist;
  window.saveResource        = saveResource;
  window.deleteResource      = deleteResource;
  window.openResourceFile    = openResourceFile;
}
