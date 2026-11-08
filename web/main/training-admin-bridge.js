// File: main/training-admin-bridge.js
// Thin bridge that lets main.html read + approve Scholar training access
// requests without loading the entire main/training.js module.
//
// Writes to the SAME paths scholar-admin.html uses:
//   viora_data/orgs/viora/training/accessRequests/{uid}
//   viora_data/orgs/viora/users/{uid}
// So approved requests propagate identically to learners/trainers either way.

const ROOT = 'viora_data';
const ORG  = 'orgs/viora';
const TP   = (path) => `${ROOT}/${ORG}/training/${path}`;

let _state, _db, _ref, _get, _update, _remove, _onValue;
let _escapeHtml, _timeAgo, _toast, _logActivity;

export function initTrainingAdminBridge(deps) {
  _state        = deps.state;
  _db           = deps.db;
  _ref          = deps.ref;
  _get          = deps.get;
  _update       = deps.update;
  _remove       = deps.remove;
  _onValue      = deps.onValue;
  _escapeHtml   = deps.escapeHtml || (s => String(s ?? ''));
  _timeAgo      = deps.timeAgo || (() => '');
  _toast        = deps.toast || (() => {});
  _logActivity  = deps.logActivity || (async () => {});
}

/* Subscribe to the training accessRequests node.
   Calls onChange(arrayOfRequests) whenever the data changes. */
export function subscribeTrainingRequests(onChange) {
  if (!_onValue || !_ref || !_db) {
    console.warn('[training-bridge] initTrainingAdminBridge must be called first');
    return () => {};
  }
  const r = _ref(_db, TP('accessRequests'));
  const cb = (snap) => {
    const raw = snap.exists() ? snap.val() : {};
    const arr = Array.isArray(raw)
      ? raw
      : Object.entries(raw).map(([uid, v]) => ({ uid, ...(v || {}), id: uid }));
    _state.data.trainingAccessRequests = arr;
    if (typeof onChange === 'function') onChange(arr);
  };
  _onValue(r, cb, (err) => {
    if (err && err.code !== 'PERMISSION_DENIED') {
      console.warn('[training-bridge] accessRequests listener failed:', err.code, err.message);
    }
  });
  return () => {
    try { _ref && _db && require; } catch (_) {}
  };
}

/* ───────────────────────────────────────────────────────────────
   APPROVE / REJECT / REOPEN / DELETE
   Same writes as scholar-admin.html — learner and trainer handled
   identically, side-effects preserved.
   ─────────────────────────────────────────────────────────────── */

export async function approveTrainingRequest(uidKey) {
  if (!uidKey) return;
  const req = (_state?.data?.trainingAccessRequests || []).find(r => (r.uid || r.id) === uidKey);
  const role = req?.role || 'learner';
  try {
    await _update(_ref(_db, TP(`accessRequests/${uidKey}`)), {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: _state?.operator?.name || 'admin',
    });
    try {
      await _update(_ref(_db, `${ROOT}/${ORG}/users/${uidKey}`), {
        role,
        trainingStatus: 'approved',
        trainingApprovedAt: new Date().toISOString(),
        pendingApproval: false,
      });
    } catch (e) {
      console.warn('[training-bridge] user profile update failed (non-fatal):', e.code, e.message);
    }
    await _logActivity?.('add', 'Training request approved', `${req?.name || req?.email || uidKey} → ${role}`);
    _toast(`Approved ${role}.`, 'success');
  } catch (e) {
    console.error('[training-bridge] approve failed:', e.code, e.message);
    _toast('Approve failed: ' + (e.message || e.code || 'unknown'), 'error');
  }
}

export async function rejectTrainingRequest(uidKey) {
  if (!uidKey) return;
  const req = (_state?.data?.trainingAccessRequests || []).find(r => (r.uid || r.id) === uidKey);
  if (!confirm(`Reject training request from "${req?.name || req?.email || 'unknown'}"?`)) return;
  try {
    await _update(_ref(_db, TP(`accessRequests/${uidKey}`)), {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: _state?.operator?.name || 'admin',
    });
    await _logActivity?.('delete', 'Training request rejected', req?.name || req?.email || uidKey);
    _toast('Request rejected.', 'info');
  } catch (e) {
    console.error('[training-bridge] reject failed:', e.code, e.message);
    _toast('Reject failed: ' + (e.message || e.code || 'unknown'), 'error');
  }
}

export async function reopenTrainingRequest(uidKey) {
  if (!uidKey) return;
  try {
    await _update(_ref(_db, TP(`accessRequests/${uidKey}`)), {
      status: 'pending',
      reopenedAt: new Date().toISOString(),
      reopenedBy: _state?.operator?.name || 'admin',
    });
    _toast('Reopened — now pending.', 'info');
  } catch (e) {
    console.error('[training-bridge] reopen failed:', e.code, e.message);
    _toast('Reopen failed: ' + (e.message || e.code || 'unknown'), 'error');
  }
}

export async function deleteTrainingRequest(uidKey) {
  if (!uidKey) return;
  const req = (_state?.data?.trainingAccessRequests || []).find(r => (r.uid || r.id) === uidKey);
  if (!confirm(`Delete request from "${req?.name || req?.email || 'unknown'}" permanently?`)) return;
  try {
    await _remove(_ref(_db, TP(`accessRequests/${uidKey}`)));
    _toast('Request deleted.', 'success');
  } catch (e) {
    console.error('[training-bridge] delete failed:', e.code, e.message);
    _toast('Delete failed: ' + (e.message || e.code || 'unknown'), 'error');
  }
}

/* ───────────────────────────────────────────────────────────────
   RENDER
   Draws the access-requests table into #trainingRequestsBody and
   the KPI strip into #trainingRequestsKpi.
   ─────────────────────────────────────────────────────────────── */

export function renderTrainingRequests() {
  const tb = document.getElementById('trainingRequestsBody');
  const kpi = document.getElementById('trainingRequestsKpi');
  if (!tb) return;

  const all = (_state?.data?.trainingAccessRequests || []).slice();

  /* KPI strip */
  if (kpi) {
    const pending  = all.filter(r => (r.status || 'pending') === 'pending').length;
    const approved = all.filter(r => r.status === 'approved').length;
    const rejected = all.filter(r => r.status === 'rejected').length;
    const trainerCount = all.filter(r => r.role === 'trainer').length;
    const learnerCount = all.filter(r => r.role !== 'trainer').length;
    kpi.innerHTML = `
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-list"></i></div><div class="number">${all.length}</div><div class="label">Total</div></div>
      <div class="stat-card" style="${pending ? 'border-left:4px solid var(--accent-gold);' : ''}"><div class="stat-icon"><i class="fa-solid fa-hourglass"></i></div><div class="number">${pending}</div><div class="label">Pending</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-check-circle"></i></div><div class="number">${approved}</div><div class="label">Approved</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-xmark"></i></div><div class="number">${rejected}</div><div class="label">Rejected</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-chalkboard-user"></i></div><div class="number">${trainerCount}</div><div class="label">Trainers</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-graduation-cap"></i></div><div class="number">${learnerCount}</div><div class="label">Learners</div></div>
    `;
  }

  /* Table */
  if (!all.length) {
    tb.innerHTML = `<tr><td colspan="7" class="empty-state" style="padding:32px;text-align:center;color:var(--text-secondary);">No training requests yet. Learners and trainers who sign up on the Scholar portals will appear here.</td></tr>`;
    return;
  }

  all.sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));

  tb.innerHTML = all.map(r => {
    const st = (r.status || 'pending').toLowerCase();
    const stCls = st === 'approved' ? 'paid' : st === 'rejected' ? 'overdue' : 'pending';
    const isTrainer = r.role === 'trainer';
    const roleBadge = isTrainer
      ? '<span class="badge badge-purple">Trainer</span>'
      : '<span class="badge badge-active">Learner</span>';
    const sourceLabel = (r.source || '').replace(/-portal$/, '') || (isTrainer ? 'trainer' : 'learner');
    const safeUid = String(r.uid || r.id || '').replace(/'/g, "\\'");
    const actions = st === 'pending'
      ? `<button class="btn btn-success btn-xs" onclick="Viora.approveTrainingRequest('${safeUid}')"><i class="fa-solid fa-check"></i> Approve</button>
         <button class="btn btn-danger btn-xs" onclick="Viora.rejectTrainingRequest('${safeUid}')"><i class="fa-solid fa-xmark"></i> Reject</button>`
      : `<button class="btn btn-outline btn-xs" onclick="Viora.reopenTrainingRequest('${safeUid}')"><i class="fa-solid fa-rotate-left"></i> Reopen</button>`;
    return `<tr>
      <td>${_timeAgo(r.requestedAt)}</td>
      <td><strong>${_escapeHtml(r.name || '—')}</strong></td>
      <td>${_escapeHtml(r.email || '—')}</td>
      <td>${_escapeHtml(r.phone || '—')}</td>
      <td>${roleBadge}</td>
      <td><span class="badge badge-${stCls}">${_escapeHtml(st)}</span></td>
      <td style="text-align:right;white-space:nowrap;">
        ${actions}
        <button class="btn btn-danger btn-xs" onclick="Viora.deleteTrainingRequest('${safeUid}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}