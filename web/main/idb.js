/* ═══════════════════════════════════════════════════════════════
   VIORA — INDEXEDDB LAYER  (hardened + perf-tuned)
   Extracted from main.js (Phase 2)
   Handles: kv_cache, offline_queue, event_queue
   Depends on: injected deps (state, toast, setSyncStatus,
               directWrite, directDelete) — see initIdb()
   ═══════════════════════════════════════════════════════════════ */

import { uid } from './helpers.js';

/* ── Config (exported so callers can introspect) ── */
export const IDB_NAME                = 'viora_idb_v37';
export const IDB_STORE               = 'kv_cache';
export const IDB_QUEUE_STORE         = 'offline_queue';
export const IDB_EVENT_QUEUE_STORE   = 'event_queue';
export const IDB_VERSION             = 2;

const SNAPSHOT_KEY       = 'viora_snapshot_v37';
const DEDUPE_STAMP_KEY   = 'viora_last_dedupe_at';
const MAX_RETRIES        = 10;
const OPEN_TIMEOUT_MS    = 5000;

/* ── Injected deps ── */
let deps = {
  state: null,
  toast: null,
  setSyncStatus: null,
  directWrite: null,
  directDelete: null,
  onError: null,          /* optional: (scope, err) => void */
};

export function initIdb(d) {
  deps = { ...deps, ...d };
}

/* Throttled error reporter — never spams. */
const _errSeen = new Map();
function reportErr(scope, err) {
  const msg = String((err && err.message) || err || 'unknown');
  const now = Date.now();
  const last = _errSeen.get(scope) || 0;
  if (now - last < 60000) return;   /* 1 per scope per minute */
  _errSeen.set(scope, now);
  console.warn('[idb]', scope, msg);
  try { if (typeof deps.onError === 'function') deps.onError(scope, err); } catch (_) {}
}

/* ═══════════════════════════════════════════════════════════════
   INSTANCE — cached, self-healing
   ═══════════════════════════════════════════════════════════════ */
let idbInstance   = null;
let idbPromise    = null;
let idbOpenFailed = false;

function _clearInstance() {
  idbInstance = null;
  idbPromise = null;
}

export function idbOpen() {
  if (idbInstance) return Promise.resolve(idbInstance);
  if (idbPromise) return idbPromise;
  /* If the last attempt failed terminally (private mode), don't retry
     every call — the caller can reset via idbReset(). */
  if (idbOpenFailed) return Promise.resolve(null);

  idbPromise = new Promise(resolve => {
    let resolved = false;
    const finish = (val) => {
      if (resolved) return;
      resolved = true;
      resolve(val);
    };

    /* Timeout — never hang forever. */
    const timer = setTimeout(() => {
      reportErr('open.timeout', 'IndexedDB open timed out');
      finish(null);
    }, OPEN_TIMEOUT_MS);

    try {
      if (typeof indexedDB === 'undefined') {
        clearTimeout(timer);
        idbOpenFailed = true;
        return finish(null);
      }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);

      req.onupgradeneeded = e => {
        try {
          const dbi = e.target.result;
          if (!dbi.objectStoreNames.contains(IDB_STORE))
            dbi.createObjectStore(IDB_STORE);
          if (!dbi.objectStoreNames.contains(IDB_QUEUE_STORE))
            dbi.createObjectStore(IDB_QUEUE_STORE);
          if (!dbi.objectStoreNames.contains(IDB_EVENT_QUEUE_STORE))
            dbi.createObjectStore(IDB_EVENT_QUEUE_STORE);
        } catch (err) { reportErr('open.upgrade', err); }
      };

      req.onblocked = () => {
        reportErr('open.blocked', 'IndexedDB open blocked by another tab');
      };

      req.onsuccess = e => {
        clearTimeout(timer);
        const dbi = e.target.result;

        /* Self-heal on external version upgrade. */
        dbi.onversionchange = () => {
          try { dbi.close(); } catch (_) {}
          _clearInstance();
        };
        dbi.onclose = () => { _clearInstance(); };

        idbInstance = dbi;
        idbPromise = null;
        finish(dbi);
      };

      req.onerror = e => {
        clearTimeout(timer);
        reportErr('open.error', e.target && e.target.error);
        idbOpenFailed = true;
        finish(null);
      };
    } catch (e) {
      clearTimeout(timer);
      reportErr('open.throw', e);
      idbOpenFailed = true;
      finish(null);
    }
  });

  return idbPromise;
}

/* Public reset for the caller to force a fresh open. */
export function idbReset() {
  try { if (idbInstance) idbInstance.close(); } catch (_) {}
  _clearInstance();
  idbOpenFailed = false;
}

/* ── Transaction helpers ── */
function txDone(tx) {
  return new Promise(resolve => {
    tx.oncomplete = () => resolve(true);
    tx.onerror    = () => resolve(false);
    tx.onabort    = () => resolve(false);
  });
}
function reqDone(req) {
  return new Promise(resolve => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => resolve(undefined);
  });
}

/* ═══════════════════════════════════════════════════════════════
   KV CACHE — app snapshot
   ═══════════════════════════════════════════════════════════════ */
export async function idbSave(obj) {
  try {
    const dbi = await idbOpen(); if (!dbi) return;
    const tx = dbi.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(obj, SNAPSHOT_KEY);
    await txDone(tx);
  } catch (e) { reportErr('save', e); }
}

export async function idbLoad() {
  try {
    const dbi = await idbOpen(); if (!dbi) return null;
    const tx = dbi.transaction(IDB_STORE, 'readonly');
    const val = await reqDone(tx.objectStore(IDB_STORE).get(SNAPSHOT_KEY));
    return val || null;
  } catch (e) { reportErr('load', e); return null; }
}

export async function idbClear() {
  try {
    const dbi = await idbOpen(); if (!dbi) return;
    /* Single transaction across all three stores. */
    const tx = dbi.transaction([IDB_STORE, IDB_QUEUE_STORE, IDB_EVENT_QUEUE_STORE], 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.objectStore(IDB_QUEUE_STORE).clear();
    tx.objectStore(IDB_EVENT_QUEUE_STORE).clear();
    await txDone(tx);
  } catch (e) { reportErr('clear', e); }
}

/* ═══════════════════════════════════════════════════════════════
   OFFLINE MUTATION QUEUE
   ═══════════════════════════════════════════════════════════════ */
export async function queueOfflineMutation(collection, action, payload, existingRev) {
  try {
    const dbi = await idbOpen(); if (!dbi) return;
    const entry = {
      id: uid(),
      collection,
      action,
      payload,
      existingRev: existingRev || null,
      timestamp: Date.now(),
      retries: 0
    };
    const tx = dbi.transaction(IDB_QUEUE_STORE, 'readwrite');
    tx.objectStore(IDB_QUEUE_STORE).put(entry, entry.id);
    await txDone(tx);
    schedulePendingCountUpdate();
  } catch (e) { reportErr('queue.push', e); }
}

export async function removeFromQueue(id) {
  try {
    const dbi = await idbOpen(); if (!dbi) return;
    const tx = dbi.transaction(IDB_QUEUE_STORE, 'readwrite');
    tx.objectStore(IDB_QUEUE_STORE).delete(id);
    await txDone(tx);
    schedulePendingCountUpdate();
  } catch (e) { reportErr('queue.remove', e); }
}

export async function updateQueueEntry(entry) {
  try {
    const dbi = await idbOpen(); if (!dbi) return;
    const tx = dbi.transaction(IDB_QUEUE_STORE, 'readwrite');
    tx.objectStore(IDB_QUEUE_STORE).put(entry, entry.id);
    await txDone(tx);
  } catch (e) { reportErr('queue.update', e); }
}

/* ── Debounced pending-count refresh ── */
let _pendingCountTimer = null;
function schedulePendingCountUpdate() {
  if (_pendingCountTimer) return;
  _pendingCountTimer = setTimeout(() => {
    _pendingCountTimer = null;
    updatePendingCount();
  }, 120);
}

export async function updatePendingCount() {
  try {
    const dbi = await idbOpen(); if (!dbi) return;
    const tx = dbi.transaction(IDB_QUEUE_STORE, 'readonly');
    const count = (await reqDone(tx.objectStore(IDB_QUEUE_STORE).count())) || 0;
    if (deps.state) deps.state.pendingCount = count;
    if (typeof deps.setSyncStatus === 'function') {
      const online = (typeof navigator !== 'undefined') ? navigator.onLine !== false : true;
      if (count > 0) deps.setSyncStatus('syncing', count + ' pending');
      else if (online) deps.setSyncStatus('online', 'Synced');
      else deps.setSyncStatus('offline', 'Offline');
    }
  } catch (e) { reportErr('queue.count', e); }
}

/* ── Flush ── */
let _flushInFlight = null;

export function flushOfflineQueue() {
  if (_flushInFlight) return _flushInFlight;
  _flushInFlight = _flushOfflineQueueInner().finally(() => { _flushInFlight = null; });
  return _flushInFlight;
}

async function _flushOfflineQueueInner() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    const dbi = await idbOpen(); if (!dbi) return;
    const tx = dbi.transaction(IDB_QUEUE_STORE, 'readonly');
    const all = (await reqDone(tx.objectStore(IDB_QUEUE_STORE).getAll())) || [];
    if (!all.length) return;

    if (typeof deps.toast === 'function') {
      deps.toast('Flushing ' + all.length + ' queued change(s)…', 'info');
    }

    all.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    for (const entry of all) {
      /* Skip if the required writer isn't wired up — don't lose data. */
      if (entry.action === 'upsert' && typeof deps.directWrite !== 'function') continue;
      if (entry.action === 'delete' && typeof deps.directDelete !== 'function') continue;

      try {
        if (entry.action === 'upsert') {
          await deps.directWrite(entry.collection, entry.payload, entry.existingRev);
        } else if (entry.action === 'delete') {
          const id = entry.payload && entry.payload.id;
          await deps.directDelete(entry.collection, id);
        } else {
          /* Unknown action — drop it. */
          await removeFromQueue(entry.id);
          continue;
        }
        await removeFromQueue(entry.id);
      } catch (err) {
        entry.retries = (entry.retries || 0) + 1;
        if (entry.retries > MAX_RETRIES) {
          reportErr('queue.drop', 'Dropping entry after ' + MAX_RETRIES + ' retries');
          await removeFromQueue(entry.id);
          continue;
        }
        await updateQueueEntry(entry);
        /* If the error looks like a network failure, abort the loop
           — the rest will likely fail too. Otherwise, continue. */
        if (isNetworkError(err)) break;
      }
    }
    schedulePendingCountUpdate();
  } catch (e) { reportErr('queue.flush', e); }
}

function isNetworkError(err) {
  if (!err) return false;
  const code = err.code || err.name || '';
  const msg  = String(err.message || '');
  return code === 'unavailable' ||
         code === 'ETIMEDOUT' ||
         /network|offline|fetch|failed to fetch|unavailable/i.test(msg);
}

/* ═══════════════════════════════════════════════════════════════
   EVENT QUEUE — persisted across reloads
   ═══════════════════════════════════════════════════════════════ */
export async function eventQueuePush(evt) {
  /* In-memory mirror. */
  if (deps.state && deps.state._eventBusQueue) {
    deps.state._eventBusQueue.push(evt);
  }
  try {
    const dbi = await idbOpen(); if (!dbi) return;
    const tx = dbi.transaction(IDB_EVENT_QUEUE_STORE, 'readwrite');
    tx.objectStore(IDB_EVENT_QUEUE_STORE).put(evt, evt.id);
    await txDone(tx);
  } catch (e) { reportErr('event.push', e); }
}

export async function eventQueuePushBatch(events) {
  if (!Array.isArray(events) || !events.length) return;
  if (deps.state && deps.state._eventBusQueue) {
    for (let i = 0; i < events.length; i++) deps.state._eventBusQueue.push(events[i]);
  }
  try {
    const dbi = await idbOpen(); if (!dbi) return;
    const tx = dbi.transaction(IDB_EVENT_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(IDB_EVENT_QUEUE_STORE);
    for (let i = 0; i < events.length; i++) store.put(events[i], events[i].id);
    await txDone(tx);
  } catch (e) { reportErr('event.pushBatch', e); }
}

export async function eventQueueDrain() {
  try {
    const dbi = await idbOpen(); if (!dbi) return [];
    const tx = dbi.transaction(IDB_EVENT_QUEUE_STORE, 'readonly');
    const all = (await reqDone(tx.objectStore(IDB_EVENT_QUEUE_STORE).getAll())) || [];
    /* ISO-8601 strings sort lexicographically. */
    all.sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')));
    return all;
  } catch (e) { reportErr('event.drain', e); return []; }
}

export async function eventQueueRemove(id) {
  try {
    const dbi = await idbOpen(); if (!dbi) return;
    const tx = dbi.transaction(IDB_EVENT_QUEUE_STORE, 'readwrite');
    tx.objectStore(IDB_EVENT_QUEUE_STORE).delete(id);
    await txDone(tx);
  } catch (e) { reportErr('event.remove', e); }
}

export async function eventQueueRemoveBatch(ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  try {
    const dbi = await idbOpen(); if (!dbi) return;
    const tx = dbi.transaction(IDB_EVENT_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(IDB_EVENT_QUEUE_STORE);
    for (let i = 0; i < ids.length; i++) store.delete(ids[i]);
    await txDone(tx);
  } catch (e) { reportErr('event.removeBatch', e); }
}

export async function eventQueueClear() {
  try {
    const dbi = await idbOpen(); if (!dbi) return;
    const tx = dbi.transaction(IDB_EVENT_QUEUE_STORE, 'readwrite');
    tx.objectStore(IDB_EVENT_QUEUE_STORE).clear();
    await txDone(tx);
  } catch (e) { reportErr('event.clear', e); }
}

/* ═══════════════════════════════════════════════════════════════
   DEDUPE STAMP — persist "when did we last run the boot dedupe"
   ═══════════════════════════════════════════════════════════════ */
export async function idbGetDedupeStamp() {
  try {
    const dbi = await idbOpen(); if (!dbi) return null;
    const tx = dbi.transaction(IDB_STORE, 'readonly');
    const val = await reqDone(tx.objectStore(IDB_STORE).get(DEDUPE_STAMP_KEY));
    return val || null;
  } catch (e) { reportErr('dedupe.get', e); return null; }
}

export async function idbSetDedupeStamp(ts) {
  try {
    const dbi = await idbOpen(); if (!dbi) return;
    const tx = dbi.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(ts, DEDUPE_STAMP_KEY);
    await txDone(tx);
  } catch (e) { reportErr('dedupe.set', e); }
}

/* ═══════════════════════════════════════════════════════════════
   Lifecycle hooks — flush + close cleanly
   ═══════════════════════════════════════════════════════════════ */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    /* Fire-and-forget; IDB will queue the transaction. */
    try { if (idbInstance) idbInstance.close(); } catch (_) {}
    _clearInstance();
  });
}
