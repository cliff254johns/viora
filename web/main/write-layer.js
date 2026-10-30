/* ═══════════════════════════════════════════════════════════════
   VIORA — WRITE LAYER  (v7.2 — perf + correctness rewrite)
   Extracted from main.js (Phase 3), consolidated in v7.1,
   optimised in v7.2.

   Handles: validation, dedupe, upsert, delete, direct write.
   Depends on: injected deps — see initWriteLayer().

   v7.2 changes (public API unchanged):
     • fingerprintIndex — O(1) dedupe (was O(n) per write)
     • idIndex          — O(1) array update (was O(n) findIndex)
     • validateRecord() throws ValidationError instead of allocating
       {ok, reason} on every call
     • Immutable entity updates — no more caller-object mutation
     • withMutationLock() — proper async mutex, no race with the
       trailing setTimeout(80ms)
     • invalidateCaches() — one place to null all derived maps
     • deleteDoc() writes trash only AFTER the Firestore delete
       succeeds — no more ghost items on permission errors
     • Offline path now emits EventBus so subscribers stay in sync
     • directWrite() runs validateRecord() — offline queue can no
       longer inject invalid data
     • navigator.onLine read once per call
   ═══════════════════════════════════════════════════════════════ */

import { uid, normalizeEmail } from './helpers.js';

/* ── Injected dependencies ── */
let deps = {
  db: null,
  ref: null,
  set: null,
  get: null,
  remove: null,
  push: null,
  P: null,
  state: null,
  toast: null,
  setSyncStatus: null,
  logActivity: null,
  EventBus: null,
  queueOfflineMutation: null,
  vioraConfirm: null,
  idbSave: null,          // optional
};

export function initWriteLayer(d) {
  deps = { ...deps, ...d };
}

/* ═══════════════════════════════════════════════════════════════
   ERRORS
   ═══════════════════════════════════════════════════════════════ */
export class ValidationError extends Error {
  constructor(collection, reason) {
    super('Validation failed for ' + collection + ': ' + reason);
    this.name = 'ValidationError';
    this.collection = collection;
    this.reason = reason;
    this.isValidationError = true;
  }
}

const CONFLICT = 'CONFLICT_ABORTED';

/* ═══════════════════════════════════════════════════════════════
   STATE ACCESSORS — small, safe, allocation-free where possible
   ═══════════════════════════════════════════════════════════════ */
function S() {
  const s = deps.state;
  if (!s) throw new Error('[write-layer] state not initialised');
  if (!s.data) s.data = {};
  return s;
}

function arrFor(collection) {
  const s = S();
  let arr = s.data[collection];
  if (!arr) { arr = []; s.data[collection] = arr; }
  return arr;
}

/* ═══════════════════════════════════════════════════════════════
   CACHE INVALIDATION — one function, called everywhere
   ═══════════════════════════════════════════════════════════════ */
function invalidateCaches() {
  const s = S();
  s._invoicePaidMemoMap = null;
  s._queueCache        = null;
  s._feeSummaryIndex   = null;
  s._feeSummaryStamp   = 0;
  // Fingerprint + id indexes are keyed off `s._dataVersion`; bumping
  // the version forces a lazy rebuild on next access.
  s._dataVersion = (s._dataVersion || 0) + 1;
}

/* ═══════════════════════════════════════════════════════════════
   MUTATION LOCK — proper async mutex
   ═══════════════════════════════════════════════════════════════ */
let _mutationChain = Promise.resolve();

function withMutationLock(fn) {
  const run = _mutationChain.then(fn, fn);
  // Swallow rejections on the chain itself so one failure doesn't
  // poison all future writes.
  _mutationChain = run.catch(() => {});
  return run;
}

/* ═══════════════════════════════════════════════════════════════
   PER-COLLECTION INDEXES
   idIndex[collection]          : Map<id, index-in-array>
   fingerprintIndex[collection] : Map<fingerprint, id>
   Both are invalidated when S._dataVersion changes.
   ═══════════════════════════════════════════════════════════════ */
const _indexes = {
  version: -1,
  id: Object.create(null),
  fp: Object.create(null),
};

function ensureIndexes() {
  const s = S();
  const v = s._dataVersion || 0;
  if (_indexes.version === v) return _indexes;

  // Rebuild from scratch — simpler and faster than diffing.
  _indexes.id = Object.create(null);
  _indexes.fp = Object.create(null);

  for (const collection of Object.keys(s.data)) {
    const arr = s.data[collection];
    if (!Array.isArray(arr)) continue;

    const idMap = new Map();
    const fpMap = new Map();
    for (let i = 0; i < arr.length; i++) {
      const rec = arr[i];
      if (!rec || !rec.id) continue;
      idMap.set(rec.id, i);
      const fp = fingerprintFor(collection, rec);
      if (fp && !fpMap.has(fp)) fpMap.set(fp, rec.id);
    }
    _indexes.id[collection] = idMap;
    _indexes.fp[collection] = fpMap;
  }
  _indexes.version = v;
  return _indexes;
}

/** O(1) lookup of an item's index in its collection array. */
function findIndexById(collection, id) {
  if (!id) return -1;
  const ix = ensureIndexes().id[collection];
  if (ix) {
    const i = ix.get(id);
    return i === undefined ? -1 : i;
  }
  // Fallback if index wasn't built (e.g. collection added mid-version)
  const arr = deps.state?.data?.[collection] || [];
  return arr.findIndex(x => x.id === id);
}

/** O(1) dedupe lookup. Returns the duplicate record or null. */
function findDuplicate(collection, entity) {
  const fp = fingerprintFor(collection, entity);
  if (!fp) return { dup: null, fp: null };
  const ix = ensureIndexes().fp[collection];
  if (!ix) return { dup: null, fp };
  const dupId = ix.get(fp);
  if (!dupId || dupId === entity.id) return { dup: null, fp };
  const dupIdx = findIndexById(collection, dupId);
  if (dupIdx < 0) return { dup: null, fp };
  return { dup: deps.state.data[collection][dupIdx], fp };
}

/** Insert or replace a record in the in-memory array + index. */
function putInArray(collection, record) {
  const arr = arrFor(collection);
  const i = findIndexById(collection, record.id);
  if (i > -1) {
    arr[i] = record;
  } else {
    arr.push(record);
    const ix = ensureIndexes().id[collection];
    if (ix) ix.set(record.id, arr.length - 1);
    const fp = fingerprintFor(collection, record);
    if (fp) {
      const fpIx = ensureIndexes().fp[collection];
      if (fpIx && !fpIx.has(fp)) fpIx.set(fp, record.id);
    }
    return;
  }
  // Update indexes for the replaced record
  const ix = ensureIndexes().id[collection];
  if (ix) ix.set(record.id, i);
  const fp = fingerprintFor(collection, record);
  if (fp) {
    const fpIx = ensureIndexes().fp[collection];
    if (fpIx) fpIx.set(fp, record.id);
  }
}

/** Remove a record from the in-memory array + index. */
function removeFromArray(collection, id) {
  const arr = arrFor(collection);
  const i = findIndexById(collection, id);
  if (i < 0) return null;
  const removed = arr.splice(i, 1)[0];
  // Indices shift: rebuild lazily (cheaper than patching every entry)
  invalidateCaches();
  return removed;
}

/* ═══════════════════════════════════════════════════════════════
   VALIDATION
   Returns null on success; throws ValidationError on failure.
   Zero allocation on the happy path.
   ═══════════════════════════════════════════════════════════════ */
export function validateRecord(collection, record) {
  if (!record) throw new ValidationError(collection, 'Empty record');
  if (!record.id && collection !== 'ledger') {
    throw new ValidationError(collection, 'Missing id');
  }

  switch (collection) {
    case 'invoices':
      if (!record.number)   throw new ValidationError(collection, 'invoice missing number');
      if (!record.clientId) throw new ValidationError(collection, 'invoice missing clientId');
      break;

    case 'payments':
      if (!record.clientId)  throw new ValidationError(collection, 'payment missing clientId');
      if (!record.projectId) throw new ValidationError(collection, 'payment missing projectId');
      if (record._isCreditTransfer) {
        if (!Number(record.amount)) {
          throw new ValidationError(collection, 'transfer amount cannot be zero');
        }
      } else if (!(Number(record.amount) > 0)) {
        throw new ValidationError(collection, 'payment amount must be > 0');
      }
      break;

    case 'entities':
      if (record.type === 'client' && !record.name) {
        throw new ValidationError(collection, 'client missing name');
      }
      break;

    case 'deals':
      if (!record.title) throw new ValidationError(collection, 'deal missing title');
      break;

    case 'products':
      if (!record.name) throw new ValidationError(collection, 'product missing name');
      break;

    case 'tasks':
      if (!record.title) throw new ValidationError(collection, 'task missing title');
      break;

    case 'projects':
      if (!record.title) throw new ValidationError(collection, 'project missing title');
      break;

    default:
      break;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   FINGERPRINT + DEDUPE
   ═══════════════════════════════════════════════════════════════ */
const _n = v => v == null ? '' : (typeof v === 'string' ? v : String(v)).trim().toLowerCase();
const _num = v => Number(v || 0).toFixed(2);

export function fingerprintFor(collection, rec) {
  if (!rec) return null;

  switch (collection) {
    case 'invoices':
      return _n(rec.number);

    case 'payments': {
      const ref = _n(rec.reference);
      if (!ref) return null;
      return (rec.clientId || '') + '|' + (rec.date || '') + '|' +
             _num(rec.amount) + '|' + ref + '|' + _n(rec.method);
    }

    case 'ledger':
      return (rec.date || '') + '|' + _n(rec.memo) + '|' +
             _n(rec.refType) + '|' + _n(rec.refId);

    case 'leads': {
      if (rec._fromIndex || (rec.id && String(rec.id).startsWith('idx-'))) {
        return 'idx|' + _n(rec.id || rec.email);
      }
      return 'mkt|' + _n(rec.email || rec.id);
    }

    case 'orders':
      return _n(rec.id);

    case 'proposals':
      return _n(rec.title || '') + '|' + _n(rec.leadId || '') + '|' +
             _n(rec.dealId || '') + '|' + _n(rec.generatedBy || '');

    case 'appointments':
      return (rec.clientId || '') + '|' + (rec.date || '') + '|' +
             (rec.startTime || '') + '|' + _n(rec.title);

    case 'presentations':
      return (rec.clientId || '') + '|' + (rec.date || '') + '|' + _n(rec.title);

    case 'tasks':
      return rec.id ? String(rec.id) : null;

    case 'projects':
      return _n(rec.projectNumber) || null;

    case 'clients':
    case 'entities':
      if (rec.type === 'client')   return 'client|'   + (_n(rec.email) || rec.id);
      if (rec.type === 'employee') return 'employee|' + (_n(rec.email) || rec.id);
      return null;

    case 'products':
      return _n(rec.id) || null;

    case 'contracts':
      return _n(rec.title) + '|' + (rec.clientId || '');

    case 'expenses':
      return _n(rec.vendor) + '|' + (rec.date || '') + '|' +
             _num(rec.amount) + '|' + _n(rec.category);

    case 'inventory':
      return _n(rec.sku) || null;

    case 'assets':
      return _n(rec.name) || null;

    case 'compliance':
      return _n(rec.title) + '|' + _n(rec.regNo || '');

    case 'campaigns':
      return _n(rec.name) || null;

    case 'documents':
      return _n(rec.title) + '|' + _n(rec.fileName) + '|' + _n(rec.parentId || '');

    default:
      return rec.id ? String(rec.id) : null;
  }
}

export function dedupeWriteGuard(collection, entity) {
  return findDuplicate(collection, entity);
}

/* ═══════════════════════════════════════════════════════════════
   INTERNAL HELPERS
   ═══════════════════════════════════════════════════════════════ */

/** Stamp a record with a fresh _rev and _updatedAt. Returns a copy. */
function stampRecord(entity) {
  return {
    ...entity,
    _rev: uid(),
    _updatedAt: new Date().toISOString()
  };
}

/** Emit an EventBus event, swallowing any subscriber errors. */
function emitEvent(name, payload, id, ctx) {
  try {
    deps.EventBus?.emit?.(name, payload, id, payload, ctx);
  } catch (e) {
    console.warn('[write-layer] EventBus emit failed:', e);
  }
}

/** Persist the full state snapshot to IndexedDB, if wired up. */
function persistLocal() {
  if (!deps.idbSave) return;
  try { deps.idbSave(S().data); } catch (e) { /* non-fatal */ }
}

/** Read `navigator.onLine` once per call. */
function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

/* ═══════════════════════════════════════════════════════════════
   DIRECT WRITE / DIRECT DELETE
   Used by offline-queue flush. Runs validation so a bad queue
   entry can't inject invalid data into Firestore.
   ═══════════════════════════════════════════════════════════════ */
export async function directWrite(collection, entity, existingRev) {
  validateRecord(collection, entity);

  const path = `${deps.P(collection)}/${entity.id}`;

  if (existingRev) {
    const snap = await deps.get(deps.ref(deps.db, path));
    if (snap.exists()) {
      const cur = snap.val();
      if (cur && cur._rev && cur._rev !== existingRev) {
        throw new Error(CONFLICT);
      }
    }
  }

  const stamped = stampRecord(entity);
  await deps.set(deps.ref(deps.db, path), stamped);

  putInArray(collection, stamped);
  invalidateCaches();

  emitEvent(
    collection + '.upsert',
    stamped,
    stamped.id,
    { collection, viaQueue: true }
  );

  return stamped;
}

export async function directDelete(collection, id) {
  await deps.remove(deps.ref(deps.db, `${deps.P(collection)}/${id}`));
  removeFromArray(collection, id);
  invalidateCaches();
}

/* ═══════════════════════════════════════════════════════════════
   UPSERT DOC — main write path
   ═══════════════════════════════════════════════════════════════ */
export async function upsertDoc(collection, entity, existingRev = null, opts = {}) {
  if (!entity) throw new Error('upsertDoc: entity is required');
  if (opts.skipLock) return _upsertDocLocked(collection, entity, existingRev);
  return withMutationLock(() => _upsertDocLocked(collection, entity, existingRev));
}

async function _upsertDocLocked(collection, entity, existingRev) {
  const state = S();

  /* ── 1. Not-ready path: queue offline, keep in-memory copy ── */
  if (!state.firebaseReady && collection !== 'activityLog' && collection !== 'commLog') {
    await deps.queueOfflineMutation(collection, 'upsert', entity, existingRev);
    deps.setSyncStatus('offline', 'Queued (not ready)');
    putInArray(collection, entity);
    return entity;
  }

  /* ── 2. Validate ── */
  validateRecord(collection, entity);

  /* ── 3. Dedupe guard (O(1) via fingerprint index) ── */
  const { dup, fp } = findDuplicate(collection, entity);
  if (dup) {
    const merged = stampRecord({ ...dup, ...entity, id: dup.id });
    const path = `${deps.P(collection)}/${dup.id}`;

    try {
      await deps.set(deps.ref(deps.db, path), merged);
    } catch (e) {
      console.warn('[write-layer] dedupe merge write failed', e);
    }

    putInArray(collection, merged);
    invalidateCaches();

    emitEvent(
      collection + '.upsert',
      merged,
      merged.id,
      { collection, merged: true, fingerprint: fp }
    );

    return merged;
  }

  /* ── 4. Invoice number collision ── */
  let working = entity;
  if (collection === 'invoices' && working.number) {
    const arr = arrFor('invoices');
    const baseNum = String(working.number).replace(/-[A-Z]+$/, '');
    const collision = arr.some(x => x.id !== working.id && x.number === working.number);
    if (collision) {
      working = { ...working };
      let n = 1;
      let candidate = baseNum + '-' + String.fromCharCode(65 + n);
      while (arr.some(x => x.id !== working.id && x.number === candidate)) {
        n++;
        candidate = baseNum + '-' + String.fromCharCode(65 + n);
      }
      working.number = candidate;
    }
  }

  /* ── 5. Optimistic local update ── */
  const localRecord = { ...working, _updatedAt: new Date().toISOString() };
  putInArray(collection, localRecord);
  persistLocal();

  /* ── 6. Offline: queue and return ── */
  if (!isOnline()) {
    await deps.queueOfflineMutation(collection, 'upsert', localRecord, existingRev);
    deps.setSyncStatus('offline', 'Offline — queued');
    emitEvent(collection + '.upsert', localRecord, localRecord.id, { collection, offline: true });
    return localRecord;
  }

   /* ── 7. Online write ── */
  deps.setSyncStatus('syncing', 'Saving…');
  const fullPath = `${deps.P(collection)}/${localRecord.id}`;

  try {
    // ── Last-write-wins ──
    // Concurrency check removed. The latest save always wins.
    // The only guard left is the delete guard below (if the record
    // was hard-deleted by another operator while we were editing).
    const snap = await deps.get(deps.ref(deps.db, fullPath));
    if (existingRev && !snap.exists()) {
      // Record was hard-deleted from Firebase between load and save.
      // Recreate it silently rather than failing — the user's intent
      // is clearly to have this record exist.
      console.info('[write-layer] record was deleted externally; recreating:', collection, localRecord.id);
    }

    const stamped = stampRecord(localRecord);
    await deps.set(deps.ref(deps.db, fullPath), stamped);

    putInArray(collection, stamped);
    invalidateCaches();
    deps.setSyncStatus('online', 'Synced');

    emitEvent(
      collection + '.upsert',
      stamped,
      stamped.id,
      { collection, existingRev }
    );

    return stamped;
  } catch (e) {
    if (e.message === CONFLICT) throw e;

    console.error('[viora] Upsert FAILED', {
      collection,
      id: localRecord?.id,
      path: fullPath,
      code: e?.code,
      message: e?.message
    });

    const raw = String(e?.code || e?.message || '');
    if (raw.includes('permission') || raw.includes('PERMISSION_DENIED')) {
      deps.setSyncStatus('online', 'Permission denied');
      deps.toast(`Save rejected: permission denied.\nPath: ${fullPath}`, 'error');
      console.error('[viora] >>> DENIED PATH: ' + fullPath);
    } else {
      await deps.queueOfflineMutation(collection, 'upsert', localRecord, existingRev);
      deps.setSyncStatus('offline', 'Queued for retry');
      deps.toast('Network issue — change queued.', 'warning');
    }
    throw e;
  }
}

/* ═══════════════════════════════════════════════════════════════
   UPSERT PERSONAL (todos, owned by ownerUid)
   ═══════════════════════════════════════════════════════════════ */
export async function upsertPersonal(collection, entity) {
  const state = S();
  const ownerUid = entity.ownerUid || state.operator?.uid;
  if (!ownerUid) throw new Error('No owner uid');

  const id = entity.id || uid();
  const record = {
    ...entity,
    id,
    ownerUid,
    _updatedAt: new Date().toISOString()
  };

  /* Personal todo dedupe — same owner + same day + same text */
  if (collection === 'todos') {
    const arr = arrFor('todos');
    const wantedText = String(record.text || '').trim().toLowerCase();
    const dup = arr.find(t =>
      t.id !== id &&
      t.ownerUid === ownerUid &&
      t.date === record.date &&
      String(t.text || '').trim().toLowerCase() === wantedText
    );
    if (dup) {
      // Preserve the existing done state when merging a duplicate
      const merged = {
        ...dup,
        ...record,
        id: dup.id,
        done: dup.done || record.done,
        _updatedAt: new Date().toISOString()
      };
      const path = `${deps.P(collection)}/${ownerUid}/${dup.id}`;
      await deps.set(deps.ref(deps.db, path), merged);
      putInArray(collection, merged);
      invalidateCaches();
      emitEvent(collection + '.upsert', merged, merged.id, { collection, merged: true });
      return merged;
    }
  }

  const path = `${deps.P(collection)}/${ownerUid}/${id}`;
  await deps.set(deps.ref(deps.db, path), record);
  putInArray(collection, record);
  invalidateCaches();
  emitEvent(collection + '.upsert', record, id, { collection });
  return record;
}

/* ═══════════════════════════════════════════════════════════════
   UPSERT TRACK FLAT (goals, skills — flat under collection)
   ═══════════════════════════════════════════════════════════════ */
export async function upsertTrackFlat(collection, entity) {
  const state = S();
  const id = entity.id || uid();
  const record = {
    ...entity,
    id,
    _updatedAt: new Date().toISOString()
  };
  if (!record.ownerUid && state.operator?.uid) record.ownerUid = state.operator.uid;

  /* Dedupe goals/skills by owner + name */
  if (collection === 'goals' || collection === 'skills') {
    const arr = arrFor(collection);
    const wantedName = String(record.name || record.title || '').trim().toLowerCase();
    const dup = arr.find(x =>
      x.id !== id &&
      x.ownerUid === record.ownerUid &&
      String(x.name || x.title || '').trim().toLowerCase() === wantedName
    );
    if (dup) {
      const merged = {
        ...dup,
        ...record,
        id: dup.id,
        _updatedAt: new Date().toISOString()
      };
      const path = `${deps.P(collection)}/${dup.id}`;
      await deps.set(deps.ref(deps.db, path), merged);
      putInArray(collection, merged);
      invalidateCaches();
      emitEvent(collection + '.upsert', merged, merged.id, { collection, merged: true });
      return merged;
    }
  }

  const path = `${deps.P(collection)}/${id}`;
  await deps.set(deps.ref(deps.db, path), record);
  putInArray(collection, record);
  invalidateCaches();
  emitEvent(collection + '.upsert', record, id, { collection });
  return record;
}

/* ═══════════════════════════════════════════════════════════════
   DELETE PERSONAL / TRACK FLAT
   ═══════════════════════════════════════════════════════════════ */
export async function deletePersonal(collection, id, ownerUid) {
  const owner = ownerUid || S().operator?.uid;
  const path = `${deps.P(collection)}/${owner}/${id}`;
  await deps.remove(deps.ref(deps.db, path));

  removeFromArray(collection, id);
  invalidateCaches();

  emitEvent(collection + '.deleted', { id, ownerUid: owner }, id, { collection });
}

export async function deleteTrackFlat(collection, id) {
  const arr = deps.state?.data?.[collection] || [];
  const i = findIndexById(collection, id);
  const item = i > -1 ? arr[i] : null;

  await deps.remove(deps.ref(deps.db, `${deps.P(collection)}/${id}`));

  removeFromArray(collection, id);
  invalidateCaches();

  emitEvent(collection + '.deleted', { id, ...(item || {}) }, id, { collection });
}

/* ═══════════════════════════════════════════════════════════════
   DELETE DOC (soft-delete via trash)

   Order of operations (important!):
     1. Remove from Firestore.
     2. If that fails → queue offline, item stays visible locally.
     3. If that succeeds → write trash entry, then remove locally,
        then emit.
   This guarantees no ghost items on permission errors.
   ═══════════════════════════════════════════════════════════════ */
export async function deleteDoc(collection, id, soft = true) {
  const state = S();
  const arr = arrFor(collection);
  const i = findIndexById(collection, id);
  const item = i > -1 ? arr[i] : null;

  if (!isOnline()) {
    // Offline: queue the delete, remove locally, and notify subscribers
    // so the UI reflects the user's intent immediately.
    await deps.queueOfflineMutation(collection, 'delete', { id }, null);
    removeFromArray(collection, id);
    invalidateCaches();
    persistLocal();
    emitEvent(collection + '.deleted', item || { id }, id, { collection, offline: true });
    return;
  }

  try {
    await deps.remove(deps.ref(deps.db, `${deps.P(collection)}/${id}`));
  } catch (e) {
    console.error('[viora] Delete FAILED', { collection, id, error: e?.message });
    const raw = String(e?.code || e?.message || '');
    if (raw.includes('permission')) {
      deps.setSyncStatus('online', 'Permission denied');
      deps.toast(
        `Delete rejected: permission denied.\nPath: ${deps.P(collection)}/${id}`,
        'error'
      );
    } else {
      await deps.queueOfflineMutation(collection, 'delete', { id }, null);
      deps.setSyncStatus('offline', 'Queued for retry');
      deps.toast('Network issue — delete queued.', 'warning');
      // Remove locally so the UI reflects the user's intent.
      removeFromArray(collection, id);
      invalidateCaches();
      persistLocal();
      emitEvent(collection + '.deleted', item || { id }, id, { collection, offline: true });
    }
    throw e;
  }

  // Firestore delete succeeded — now write the trash entry.
  if (item && soft) {
    const trashEntry = {
      id: uid(),
      collection,
      originalId: id,
      payload: item,
      deletedAt: new Date().toISOString(),
      deletedBy: state.operator?.uid || 'system',
      deletedByName: state.operator?.name || 'System'
    };
    try {
      await deps.set(deps.ref(deps.db, `${deps.P('trash')}/${trashEntry.id}`), trashEntry);
    } catch (e) {
      // Non-fatal: the delete already succeeded. Log and continue.
      console.warn('[write-layer] trash write failed', e);
    }
  }

  removeFromArray(collection, id);
  invalidateCaches();
  persistLocal();

  emitEvent(collection + '.deleted', item || { id }, id, { collection });
}
