// main/boot.js
/* ═══════════════════════════════════════════════════════════
   VIORA — BOOT ORCHESTRATOR  (v7.6)
   ─────────────────────────────────────────────────────────────
   v7.6 changes over v7.5:
     • REMOVED the preloader gate (was causing the login/shell
       to stay hidden while boot ran, which in turn made the
       first users/{uid} read time out and dropped the operator
       into a "member" fallback). The video already sits at
       z-index 99999 and fades itself out — that's enough.
   ═══════════════════════════════════════════════════════════ */

import { ref, get, set, remove, onValue, onChildAdded,
         onChildChanged, onChildRemoved, query, limitToLast,
         goOnline, goOffline } from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";

import {
  idbLoad, idbSave, flushOfflineQueue, updatePendingCount
} from './idb.js';

import { Orchester } from './orchestration.js';

/* ═══════════════════════════════════════════════════════════
   Module-level dependency bag.
   ═══════════════════════════════════════════════════════════ */
let _ctx = null;

/* Listener unsubscribe registry (populated by every wire* fn).
   Flushed on sign-out so listeners don't accumulate across
   auth changes in the same session. */
const _unsubs = [];
function _track(unsub) {
  if (typeof unsub === 'function') _unsubs.push(unsub);
}
function _flushListeners() {
  while (_unsubs.length) {
    const u = _unsubs.pop();
    try { u(); } catch (e) { /* ignore */ }
  }
}

/* ── Central modal/editor open detector ── */
function _isModalOrEditorOpen() {
  try {
    if (document.querySelector('.modal-overlay.active')) return true;
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return true;
    const panel = document.getElementById('hc-industry-panel');
    if (panel && panel.style.display === 'flex') return true;
    const backdrop = document.getElementById('hc-industry-backdrop');
    if (backdrop && backdrop.style.display === 'block') return true;
    const host = document.getElementById('hc-modal-host');
    if (host && host.children.length > 0) return true;
  } catch (_) {}
  return false;
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC ENTRY POINT
   ═══════════════════════════════════════════════════════════ */
export function boot(deps) {
  if (boot._done) {
    console.info('[boot] already ran this session — skipping');
    return;
  }
  boot._done = true;

  _ctx = deps;
  handleAuthChange._deps = deps;

  const { state, auth, toast } = deps;

  /* ── Block renders triggered by Firebase listener replays ── */
  state._bootDraining = true;

  /* ── Ensure the dirty-collection set exists before any
        listener / flusher can touch it ── */
  if (!(state._dirtyCollections instanceof Set)) {
    state._dirtyCollections = new Set();
  }

  /* ── Derived helpers sanity check ── */
  const DERIVED_HELPERS = deps.DERIVED_HELPERS || {};
  const missing = Object.entries(DERIVED_HELPERS)
    .filter(([, fn]) => typeof fn !== 'function')
    .map(([name]) => name);
  if (missing.length) {
    console.error('[viora] MISSING DERIVED HELPERS:', missing);
    setTimeout(() => toast('Missing helpers: ' + missing.join(', '), 'error'), 500);
  }

  /* ── Service Worker ── */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.info('[viora] SW registered:', reg.scope))
      .catch(err => console.warn('[viora] SW failed:', err));
  }

  /* ── Login screen wiring ── */
  if (typeof deps.wireLoginScreenExternal === 'function') {
    if (!deps.wireLoginScreenExternal()) {
      let tries = 0;
      const t = setInterval(() => {
        tries++;
        if (deps.wireLoginScreenExternal() || tries > 100) clearInterval(t);
      }, 100);
    }
  }

  /* ── Partner-track listeners (idle-drained) ── */
  drainTrackListeners();

  /* ── Auth observer ── */
  onAuthStateChanged(auth, user => {
    handleAuthChange(user).catch(e =>
      console.error('[viora] auth handler threw:', e)
    );
  });
}

/* ═══════════════════════════════════════════════════════════
   AUTH STATE HANDLER
   ═══════════════════════════════════════════════════════════ */
async function handleAuthChange(user) {
  const {
    auth, db, P, ROOT, state, toast, setSyncStatus,
    applyRoleGating, scheduleRender, renderAll,
    attachVioraNotificationListener,
    scheduleFlush, startHeartbeat, updateMobileSubChips,
    initMobileShell, initHistoryGuard, watchModals,
    refreshRecommendations, renderDashboard,
    PushNotifications, PP, global,
  } = _ctx;

  try {
    /* ═══════════════════════════════════════════════════════
       SIGNED OUT
       ═══════════════════════════════════════════════════════ */
    if (!user) {
      document.getElementById('loginScreen')?.classList.remove('hidden');
      document.getElementById('appShell')?.classList.add('hidden');
      setSyncStatus('auth', 'Signed out');

      /* ★ STOP THE ORCHESTRATION CRON */
      try {
        Orchester.stopCron();
        console.info('[boot] orchestration cron stopped');
      } catch (e) {
        console.warn('[boot] stopCron failed', e);
      }

      /* ★ FLUSH FIREBASE LISTENERS so they don't accumulate */
      _flushListeners();

      /* ★ RESET CROSS-USER STATE that shouldn't leak */
      state._lastMarketLeadIds = null;
      state._counterCache = null;
      state.firebaseReady = false;

      if (typeof window.vioraBootComplete === 'function') {
        try { window.vioraBootComplete(); } catch (e) {}
      }
      return;
    }

    /* ═══════════════════════════════════════════════════════
       SIGNED IN
       ═══════════════════════════════════════════════════════ */
    setSyncStatus('syncing', 'Connecting…');

    /* ── Paint shell immediately with a placeholder operator ── */
    state.operator = {
      uid: user.uid,
      name: user.email,
      role: 'member',
      email: user.email,
      avatar: null, accent: '#00d4ff', tagline: '', orgId: 'viora'
    };
    document.getElementById('loginScreen')?.classList.add('hidden');
    document.getElementById('appShell')?.classList.remove('hidden');
    applyRoleGating();
    if (typeof window.vioraBootComplete === 'function') {
      try { window.vioraBootComplete(); } catch (e) {}
    }
    scheduleRender();

    /* ── Notifications listener (cheap, fire-and-forget) ── */
    try { attachVioraNotificationListener(); }
    catch (e) { console.warn('[notif] attach failed', e); }

    /* ── Fetch the operator profile ── */
    let role = 'member', name = user.email, avatar = null;
    let accent = '#00d4ff', tagline = '', orgId = 'viora';
    let operatorLoaded = false;
    try {
      let snap;
      try {
        snap = await Promise.race([
          get(ref(db, `${ROOT}/users/${user.uid}`)),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
        ]);
      } catch (firstErr) {
        console.warn('[boot] users read timed out once — retrying');
        snap = await Promise.race([
          get(ref(db, `${ROOT}/users/${user.uid}`)),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout-retry')), 8000))
        ]);
      }

      if (snap.exists()) {
        const u = snap.val();
        role    = u.role    || 'member';
        name    = u.name    || user.email;
        avatar  = u.avatar  || null;
        accent  = u.accent  || '#00d4ff';
        tagline = u.tagline || '';
        orgId   = u.orgId   || 'viora';
        operatorLoaded = true;
      } else {
        await set(ref(db, `${ROOT}/users/${user.uid}`), {
          name: user.email.split('@')[0],
          email: user.email,
          role: null,
          orgId: 'viora',
          createdAt: new Date().toISOString()
        });
        operatorLoaded = true;
      }
    } catch (e) {
      console.warn('role fetch failed or timed out, continuing as member:', e);
    }

    state.operator = {
      uid: user.uid, name, role, email: user.email,
      avatar, accent, tagline, orgId
    };
    /* Only mark operator-loaded if the fetch actually succeeded,
       so roleAllows() doesn't lock the UI down on a transient
       network failure. */
    state._operatorLoaded = operatorLoaded;
    applyRoleGating();

    const avatarEl = document.getElementById('operatorAvatar');
    if (avatarEl) {
      if (avatar) avatarEl.innerHTML = `<img src="${avatar}">`;
      else avatarEl.textContent = (name || '?').charAt(0).toUpperCase();
    }

    /* ── Hero refresh ── */
    try {
      if (global.VioraHero && typeof global.VioraHero.renderStats === 'function') {
        global.VioraHero.renderStats();
      }
    } catch (e) {}

    /* ── IDB warm-start (idle) ── */
    warmStartFromIdb();

    /* ── Firebase listener wiring (all tracked for cleanup) ── */
    wireCoreAndDeferredListeners();
    wireSecondaryListeners(user);
    wireOrchestrationListeners();
    wireArchiveListeners();
    wireWishlistListener(user);
    wireDeletedEmailsListener();
    wireMarketLeadsListener();
    wireIdbSnapshotFlusher();

    /* ── Startup timers ── */
    setTimeout(() => { try { _ctx.processMpesaQueue?.(); } catch (e) {} }, 3000);
    setTimeout(scheduleFlush, 2000);
    startHeartbeat();
    global.__vioraLastFocusFlush = Date.now();
    global.__vioraLastFcmRegister = Date.now();

    /* ── Orchestration cron ── */
    try {
      Orchester.startCron();
      console.info('[boot] orchestration cron started');
    } catch (e) {
      console.warn('[boot] Orchester.startCron failed', e);
    }

    /* ── Ready ── */
    setSyncStatus('online', 'Synced');
    state.firebaseReady = true;

    if (typeof _ctx.updateSidebarCounters === 'function') {
      try {
        state._counterCache = null;
        _ctx.updateSidebarCounters(true);
      } catch (e) {}

      /* ★ v9.4 — Re-run after data listeners have had a chance to
         populate state.data.entities. Without this, the first paint
         runs against an empty array and pins every counter at 0. */
      setTimeout(() => {
        try { _ctx.updateSidebarCounters(true); } catch (_) {}
      }, 1500);
      setTimeout(() => {
        try { _ctx.updateSidebarCounters(true); } catch (_) {}
      }, 4000);
    }

    if (typeof _ctx.applyLogoEverywhere === 'function') {
      _ctx.applyLogoEverywhere(state.data.logoUrl);
    }

    renderAll();
    updatePendingCount();

    if (typeof window.vioraBootComplete === 'function') {
      try { window.vioraBootComplete(); } catch (e) {}
    }

    toast(`Signed in as ${name}`, 'success');

    try { initHistoryGuard(); watchModals(); }
    catch (e) { console.warn('[boot] history guard failed', e); }

    /* ── Deferred UI wiring, chunked ── */
    scheduleUiWiring();

    /* ── Recommendations one-shot ── */
    if (!renderDashboard._recLoaded) {
      renderDashboard._recLoaded = true;
      setTimeout(() => refreshRecommendations(), 1500);
    }

    updateMobileSubChips();

    try { initMobileShell(); }
    catch (e) { console.warn('initMobileShell failed', e); }

    idleRun(() => {
      try { PushNotifications.init(); }
      catch (e) { console.warn('PushNotifications.init failed', e); }
    }, 4000);

    setTimeout(() => {
      try {
        if (typeof Notification !== 'undefined' &&
            Notification.permission === 'granted') {
          PushNotifications.saveTokenToServer();
        }
      } catch (e) { console.warn('[push] auto-register failed:', e); }
    }, 2500);

    idleRun(() => {
      try { PP.subscribe(); } catch (e) { console.warn('PP subscribe failed', e); }
    }, 5000);

    /* ── Boot-drain release (first delivery or 900ms fallback) ── */
    releaseBootDrainWithFallback();

    /* ── Hero refresh on data-ready ── */
    try {
      if (global.VioraHero && typeof global.VioraHero.renderStats === 'function') {
        global.VioraHero.renderStats();
      } else {
        window.dispatchEvent(new CustomEvent('viora:data-ready'));
      }
    } catch (e) {}

  } catch (e) {
    console.error('[viora] auth bootstrap failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════
   IDB WARM-START
   ═══════════════════════════════════════════════════════════ */
function warmStartFromIdb() {
  const { state, scheduleRender } = _ctx;

  const run = async () => {
    try {
      const cached = await idbLoad();
      if (!cached) return;
      const ALLOWED = new Set(Object.keys(state.data));
      let restored = 0;
      Object.keys(cached).forEach(k => {
        if (ALLOWED.has(k)) {
          state.data[k] = cached[k];
          restored++;
        }
      });
      delete state.data.worklogs;   // legacy cleanup
      state.cacheUsed = true;
      console.info(`[v8.0] IDB warm-start restored ${restored} key(s); skipped ${Object.keys(cached).length - restored}`);
      state._forceRepaint = true;
      scheduleRender(true);
    } catch (e) {
      console.warn('[v8.0] IDB warm-start failed:', e);
    }
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 2500 });
  } else {
    setTimeout(run, 400);
  }
}

/* ═══════════════════════════════════════════════════════════
   TRACK LISTENERS (idle-drained)
   ═══════════════════════════════════════════════════════════ */
function drainTrackListeners() {
  const { db, P, state, scheduleRender } = _ctx;
  const queue = ['tasks','hourly','schedule','handoffs','financials',
                 'presence','activities','chat','games'];

  const drain = () => {
    if (!queue.length) return;
    const col = queue.shift();
    try {
      const unsub = onValue(ref(db, P(`track/${col}`)), snap => {
        state.data['track_' + col] = snap.exists() ? (snap.val() || {}) : {};
        const tab = state.currentTab;
        if (typeof tab === 'string' && tab.startsWith('partner-')) scheduleRender();
      });
      _track(unsub);
    } catch (e) { console.warn('[track listener]', col, e); }

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(drain, { timeout: 1000 });
    } else {
      setTimeout(drain, 80);
    }
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(drain, { timeout: 1000 });
  } else {
    setTimeout(drain, 80);
  }
}

/* ═══════════════════════════════════════════════════════════
   CORE + DEFERRED FIREBASE LISTENERS
   ═══════════════════════════════════════════════════════════ */
function wireCoreAndDeferredListeners() {
  const { db, P, state, updateSidebarCounters,
          invalidateCountersFor, scheduleRender,
          BUSINESS_COLLECTIONS } = _ctx;

  const CORE_COLLECTIONS = ['entities','tasks','invoices','projects','payments'];
  const DEFERRED = (BUSINESS_COLLECTIONS || []).filter(
    c => !CORE_COLLECTIONS.includes(c) && c !== 'orders'
  );

  const wireOne = (col) => {
    const colRef = ref(db, P(col));
    let _lastFingerprint = '';

    const unsub = onValue(colRef, snap => {
      if (state.localMutationLock) return;
      const val = snap.val() || {};
      const arr = Object.entries(val)
        .map(([k, v]) => ({ ...(v || {}), id: (v && v.id) || k }));

      const fp = col + ':' + arr.length;
      if (fp === _lastFingerprint) return;
      _lastFingerprint = fp;

        /* ★ v9.3 — Merge into the existing array instead of replacing
         the reference. Every module that captured `state.data[col]`
         before this listener fired was left holding a detached array.
         This was causing the HR table to render empty while the
         counter (which reads the state proxy fresh each call) showed
         the correct count. */
      if (col === 'tasks') {
        const existing = new Map((state.data.tasks || []).map(t => [t.id, t]));
        arr.forEach(t => existing.set(t.id, t));
        state.data.tasks = Array.from(existing.values());
      } else {
        const existing = Array.isArray(state.data[col]) ? state.data[col] : [];
        const byId = new Map();
        for (let i = 0; i < existing.length; i++) {
          if (existing[i] && existing[i].id) byId.set(existing[i].id, existing[i]);
        }
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] && arr[i].id) byId.set(arr[i].id, arr[i]);
        }
        state.data[col] = Array.from(byId.values());
      }

      state._counterClean = false;
      state._dirtyCollections?.add(col);

         /* ★ v9.3 — Always clear the counter cache for this collection,
         even if invalidateCountersFor is wired. The extra null-out
         guarantees the next render pass recomputes from fresh data
         instead of trusting a stale cached zero. */
      if (typeof invalidateCountersFor === 'function') {
        invalidateCountersFor(col);
      }
      if (col === 'entities') {
        /* Client/employee counts live here — clear the whole value
           cache so nothing stale survives the first snapshot. */
        state._counterCache = null;
        state._counterClean = false;
      }

           /* Always refresh counters immediately — even during boot-drain.
         The counters are what drive notifications; if we defer them
         to the render loop, we lose real-time behaviour. */
      try { updateSidebarCounters(true); } catch (e) {}
      if (!state._bootDraining) {
        scheduleRender();
      }
    });
    _track(unsub);
  };

  /* Phase 1: core immediately */
  CORE_COLLECTIONS.forEach(wireOne);

  /* Phase 2: deferred, one per idle tick */
  const rest = DEFERRED.slice();
  const drain = () => {
    if (!rest.length) return;
    const col = rest.shift();
    try { wireOne(col); }
    catch (e) { console.warn('[listener]', col, e); }

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(drain, { timeout: 600 });
    } else {
      setTimeout(drain, 60);
    }
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(drain, { timeout: 600 });
  } else {
    setTimeout(drain, 60);
  }

  /* Orders special case */
  wireOrdersListener();
}

/* ═══════════════════════════════════════════════════════════
   ORDERS
   ═══════════════════════════════════════════════════════════ */
function wireOrdersListener() {
  const { db, P, state, updateSidebarCounters,
          scheduleRender, scheduleMarketSync, EventBus } = _ctx;

  const ordersRef = ref(db, P('orders'));

  const emitOrderPaid = (o) => {
    if (!o || !o.id) return;
    if (o.paymentStatus !== 'paid') return;
    const live = (state.data.orders || []).find(x => x.id === o.id);
    if (live?._inventoryDecrementedAt) return;
    if (o._inventoryDecrementedAt) return;
    try {
      EventBus.emit('orders.upsert', o, o.id, o, { collection: 'orders' });
    } catch (e) {}
  };

  _track(onChildAdded(ordersRef, snap => {
    const item = snap.val();
    if (!item) return;
    const arr = state.data.orders || (state.data.orders = []);
    const idx = arr.findIndex(x => x.id === (item.id || snap.key));
    if (idx > -1) arr[idx] = item; else arr.push(item);
    state._counterCache = null;
    state._counterClean = false;

    /* Skip counter churn during boot-drain to avoid O(N) recomputes */
       /* Always refresh — real-time counters are the priority */
    try { updateSidebarCounters(true); } catch (e) {}
    if (!state._bootDraining) scheduleRender();
    try { scheduleMarketSync?.({ immediate: true }); } catch (e) {}
    if (!state.localMutationLock) emitOrderPaid(item);
  }));

  _track(onChildChanged(ordersRef, snap => {
    const item = snap.val();
    if (!item) return;
    const arr = state.data.orders || (state.data.orders = []);
    const idx = arr.findIndex(x => x.id === (item.id || snap.key));
    if (idx > -1) arr[idx] = item; else arr.push(item);
    state._counterClean = false;
    if (state._bootDraining) return;
    scheduleRender();
    if (!state.localMutationLock) emitOrderPaid(item);
  }));

  _track(onChildRemoved(ordersRef, snap => {
    const old = snap.val();
    const arr = state.data.orders || (state.data.orders = []);
    const idx = arr.findIndex(x => x.id === (old?.id || snap.key));
    if (idx > -1) arr.splice(idx, 1);
    state._counterCache = null;
      state._counterCache = null;
    state._counterClean = false;
    try { updateSidebarCounters(true); } catch (e) {}
    if (!state._bootDraining) scheduleRender();
  }));
}

/* ═══════════════════════════════════════════════════════════
   SECONDARY LISTENERS (training, portal, misc)
   ═══════════════════════════════════════════════════════════ */
function wireSecondaryListeners(user) {
  const {
    db, P, ROOT, state, updateSidebarCounters,
    renderActiveTab,
    renderTrainingOverview, renderTrainingRequests,
    renderTrainingProgress, renderTrainingCertificates,
    renderTrainingQuizzes,
    renderPortalRequests, renderPortalUsers,
    renderClientsite, renderProfile, renderTrash,
    applyLogoEverywhere, EventBus,
  } = _ctx;

  const wire = () => {
    /* ── Training ── */
    _track(onValue(ref(db, P('training/courses')), s => {
      state.data.trainingCourses = s.exists() ? Object.values(s.val()) : [];
      if (state.currentTab === 'training-overview' && renderTrainingOverview) renderTrainingOverview();
    }));
    _track(onValue(ref(db, P('training/checklists')), s => {
      state.data.trainingChecklists = s.exists() ? Object.values(s.val()) : [];
      if (state.currentTab === 'training-overview' && renderTrainingOverview) renderTrainingOverview();
    }));
    _track(onValue(ref(db, P('training/resources')), s => {
      state.data.trainingResources = s.exists() ? Object.values(s.val()) : [];
      if (state.currentTab === 'training-overview' && renderTrainingOverview) renderTrainingOverview();
    }));
    _track(onValue(ref(db, P('training/enrollments')), s => {
      state.data.trainingEnrollments = s.exists() ? s.val() : {};
      if (state.currentTab === 'training-progress' && renderTrainingProgress) renderTrainingProgress();
    }));
    _track(onValue(ref(db, P('training/progress')), s => {
      state.data.trainingProgress = s.exists() ? s.val() : {};
      if (state.currentTab === 'training-progress' && renderTrainingProgress) renderTrainingProgress();
    }));
    _track(onValue(ref(db, P('training/accessRequests')), s => {
      state.data.trainingAccessRequests = s.exists() ? s.val() : {};
      state._counterCache = null;
      try { updateSidebarCounters(true); } catch (e) {}
      if (state.currentTab === 'training-requests' && renderTrainingRequests) renderTrainingRequests();
      if (state.currentTab === 'training-overview' && renderTrainingOverview) renderTrainingOverview();
    }));
    _track(onValue(ref(db, P('training/certificateTemplates')), s => {
      state.data.trainingCertTemplates = s.exists() ? s.val() : {};
      if (state.currentTab === 'training-certificates' && renderTrainingCertificates) renderTrainingCertificates();
    }));
        _track(onValue(ref(db, P('training/certificates')), s => {
      state.data.trainingCertificates = s.exists() ? Object.values(s.val()) : [];
      state._counterCache = null;
      try { updateSidebarCounters(true); } catch (e) {}
      if (state.currentTab === 'training-progress' && renderTrainingProgress) renderTrainingProgress();
      if (state.currentTab === 'training-overview' && renderTrainingOverview) renderTrainingOverview();
      if (state.currentTab === 'training-certificates' && renderTrainingCertificates) renderTrainingCertificates();
    }));
    _track(onValue(ref(db, P('training/quizSubmissions')), s => {
      const before = state.data.trainingQuizSubmissions || {};
      state.data.trainingQuizSubmissions = s.exists() ? s.val() : {};
      try {
        Object.entries(state.data.trainingQuizSubmissions).forEach(([uidKey, byCourse]) => {
          Object.entries(byCourse || {}).forEach(([cid, sub]) => {
            const prior = before?.[uidKey]?.[cid];
            if (!prior && sub && (sub.status || 'submitted') === 'submitted') {
              EventBus?.emit?.('training.quizSubmitted', sub,
                sub.id || `${uidKey}-${cid}`,
                { uid: uidKey, courseId: cid, autoScore: sub.autoScore });
            }
          });
        });
      } catch (e) {}
      state._counterCache = null;
      try { updateSidebarCounters(true); } catch (e) {}
      if (state.currentTab === 'training-quizzes' && renderTrainingQuizzes) renderTrainingQuizzes();
    }));
    _track(onValue(ref(db, P('training/courseCompletions')), s => {
      state.data.trainingCompletions = s.exists() ? s.val() : {};
      state._counterCache = null;
      try { updateSidebarCounters(true); } catch (e) {}
    }));

    /* ── Portal ── */
    _track(onValue(ref(db, P('portalRequests')), s => {
      state.data.portalRequests = s.exists()
        ? Object.entries(s.val()).map(([k, v]) => ({ ...v, uid: v.uid || k }))
        : [];
      state._counterCache = null;
      try { updateSidebarCounters(true); } catch (e) {}
      if (state.currentTab === 'portal-requests' && renderPortalRequests) renderPortalRequests();
    }));
    _track(onValue(ref(db, P('portalUsers')), s => {
      state.data.portalUsers = s.exists()
        ? Object.entries(s.val()).map(([k, v]) => ({ ...v, uid: v.uid || k }))
        : [];
      state._counterCache = null;
      try { updateSidebarCounters(true); } catch (e) {}
      if (state.currentTab === 'portal-users' && renderPortalUsers) renderPortalUsers();
    }));

    /* ── Misc single nodes ── */
    _track(onValue(ref(db, P('mpesaSettings')), s => {
      if (s.exists()) state.data.mpesaSettings = s.val();
    }));

    _track(onValue(ref(db, `${ROOT}/users/${user.uid}/tiktok`), s => {
      state.data.tiktokToken = s.exists() ? s.val() : null;
    }));

    _track(onValue(ref(db, P('logoUrl')), s => {
      state.data.logoUrl = s.exists() ? s.val() : null;
      if (applyLogoEverywhere) applyLogoEverywhere(state.data.logoUrl);
    }));
    _track(onValue(ref(db, P('profile')), s => {
      state.data.profile = s.exists() ? s.val() : {};
      if (state.currentTab === 'clientsite' && renderClientsite) renderClientsite();
    }));
    _track(onValue(ref(db, P('clientsite')), s => {
      state.data.clientsite = s.exists() ? s.val() : {};
      if (state.currentTab === 'clientsite' && renderClientsite) renderClientsite();
    }));
    _track(onValue(ref(db, P('trash')), s => {
      state.data.trash = s.exists() ? Object.values(s.val()) : [];
      if (renderTrash) renderTrash();
    }));
    _track(onValue(ref(db, P('financials')), s => {
      state.data.financials = s.exists() ? s.val() : {};
    }));
    _track(onValue(ref(db, P('telemetry')), s => {
      state.data.telemetry = s.exists() ? s.val() : {};
    }));
    _track(onValue(ref(db, P('companyProfile')), s => {
      state.data.companyProfile = s.exists() ? s.val() : {};
      if (state.currentTab === 'profile' && renderProfile) renderProfile();
    }));

    /* ── Users list ── */
    _track(onValue(ref(db, `${ROOT}/users`), s => {
      const users = s.exists()
        ? Object.entries(s.val()).map(([k, v]) => ({ uid: k, ...v }))
        : [];
      state.data.users = users;
      if (state.currentTab === 'admin-users' && _ctx.renderUsers) {
        try { _ctx.renderUsers(); } catch (e) {}
      }
      if (!state._bootDraining && renderActiveTab) renderActiveTab();
    }));

    /* ── Activity + Comm logs ── */
    wireActivityLog();
    wireCommLog();

    /* ── Products special case ── */
    wireProductsListener();

    /* ── Track collections ── */
    wireTrackCollections();

    /* ── Market content ── */
    _track(onValue(ref(db, P('marketContent')), s => {
      state.data.marketContent = s.exists() ? s.val() : {};
      if (state.currentTab === 'market-content' && _ctx.renderMarketContent) {
        try { _ctx.renderMarketContent(); } catch (e) {}
      }
    }));

    /* ── Promo codes (marketplace promo engine) ── */
    _track(onValue(ref(db, P('promos')), s => {
      state.data.promos = s.exists() ? s.val() : {};
      if (state.currentTab === 'market-content' && _ctx.renderMarketContent) {
        try { _ctx.renderMarketContent(); } catch (e) {}
      }
    }));

    /* ── Product extras (per-product marketplace config) ── */
    _track(onValue(ref(db, P('productExtras')), s => {
      state.data.productExtras = s.exists() ? s.val() : {};
      if (state.currentTab === 'market-content' && _ctx.renderMarketContent) {
        try { _ctx.renderMarketContent(); } catch (e) {}
      }
    }));

    /* ── Home Content (landing-page CMS) ── */
    _track(onValue(ref(db, P('homeContent')), s => {
      state.data.homeContent = s.exists() ? s.val() : {};
      if (state.currentTab === 'home-content' && _ctx.renderHomeContent) {
        /* ★ v9.5 — Skip re-render if an editor is open.
           The next save/close will trigger the natural repaint. */
        if (_isModalOrEditorOpen()) return;
        try { _ctx.renderHomeContent(); } catch (e) {}
      }
    }));

    /* ── Industries (tour + marketplace source of truth) ── */
    _track(onValue(ref(db, P('industries')), s => {
      state.data.industries = s.exists() ? s.val() : {};
      if (state.currentTab === 'home-content' && _ctx.renderHomeContent) {
        if (_isModalOrEditorOpen()) return;
        try { _ctx.renderHomeContent(); } catch (e) {}
      }
    }));

    /* ── Employee profiles (public team directory) ── */
    _track(onValue(ref(db, P('employeeProfiles')), s => {
      state.data.employeeProfiles = s.exists() ? s.val() : {};
      if (state.currentTab === 'employee-profiles' && _ctx.renderEmployeeProfiles) {
        try { _ctx.renderEmployeeProfiles(); } catch (e) {}
      }
    }));
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(wire, { timeout: 1500 });
  } else {
    setTimeout(wire, 400);
  }
}

/* ═══════════════════════════════════════════════════════════
   ACTIVITY + COMM LOG
   ═══════════════════════════════════════════════════════════ */
function wireActivityLog() {
  const { db, P, state, updateSidebarCounters, renderActivity } = _ctx;
  const actRef = query(ref(db, P('activityLog')), limitToLast(500));

  _track(onChildAdded(actRef, snap => {
    const item = snap.val();
    if (!item) return;
    const arr = state.data.activityLog = state.data.activityLog || [];
    if (!arr.find(x => x.id === item.id)) arr.unshift(item);
    if (arr.length > 500) state.data.activityLog = arr.slice(0, 500);
    if (state.currentTab === 'activity' && renderActivity) renderActivity();
  }));
  _track(onChildChanged(actRef, snap => {
    const item = snap.val();
    if (!item) return;
    const arr = state.data.activityLog = state.data.activityLog || [];
    const idx = arr.findIndex(x => x.id === item.id);
    if (idx > -1) arr[idx] = item; else arr.unshift(item);
    if (state.currentTab === 'activity' && renderActivity) renderActivity();
  }));
  _track(onChildRemoved(actRef, snap => {
    const item = snap.val();
    const id = item?.id || snap.key;
    state.data.activityLog = (state.data.activityLog || []).filter(x => x.id !== id);
    state._counterCache = null;
    try { updateSidebarCounters(true); } catch (e) {}
    if (state.currentTab === 'activity' && renderActivity) renderActivity();
  }));
}

function wireCommLog() {
  const { db, P, state, updateSidebarCounters, renderCommunications } = _ctx;
  const commRef = query(ref(db, P('commLog')), limitToLast(500));

  _track(onChildAdded(commRef, snap => {
    const item = snap.val();
    if (!item) return;
    const arr = state.data.commLog = state.data.commLog || [];
    if (!arr.find(x => x.id === item.id)) arr.unshift(item);
    if (arr.length > 500) state.data.commLog = arr.slice(0, 500);
    if (state.currentTab === 'communications' && renderCommunications) renderCommunications();
  }));
  _track(onChildChanged(commRef, snap => {
    const item = snap.val();
    if (!item) return;
    const arr = state.data.commLog = state.data.commLog || [];
    const idx = arr.findIndex(x => x.id === item.id);
    if (idx > -1) arr[idx] = item; else arr.unshift(item);
    if (state.currentTab === 'communications' && renderCommunications) renderCommunications();
  }));
  _track(onChildRemoved(commRef, snap => {
    const item = snap.val();
    const id = item?.id || snap.key;
    state.data.commLog = (state.data.commLog || []).filter(x => x.id !== id);
    state._counterCache = null;
    try { updateSidebarCounters(true); } catch (e) {}
    if (state.currentTab === 'communications' && renderCommunications) renderCommunications();
  }));
}

/* ═══════════════════════════════════════════════════════════
   PRODUCTS
   ═══════════════════════════════════════════════════════════ */
function wireProductsListener() {
  const { db, P, state, EventBus, upsertDoc, backfillMirror } = _ctx;
  const productsRef = ref(db, P('products'));
  const seen = new Set();
  let batch = [];
  let batchTimer = null;

  _track(onChildAdded(productsRef, snap => {
    const p = snap.val();
    if (!p || !p.id) return;
    if (seen.has(p.id)) return;
    seen.add(p.id);
    batch.push(p);

    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(() => {
      batchTimer = null;
      const b = batch.splice(0);
      if (state.localMutationLock) return;
      for (const prod of b) {
        try {
          EventBus?.emit?.('products.upsert', prod, prod.id,
            { collection: 'products', source: 'listener-initial' });
        } catch (e) {}
      }
    }, 500);
  }));

  _track(onChildChanged(productsRef, snap => {
    const p = snap.val();
    if (!p || !p.id) return;
    const mirror = (state.data.inventory || []).find(
      x => x._productId === p.id || x.id === 'prod-' + p.id
    );
    if (!mirror) return;
    const priceKES = _ctx.usdToKes ? _ctx.usdToKes(p.price || 0) : (p.price || 0);
    let changed = false;
    if (mirror.name !== p.name) { mirror.name = p.name; changed = true; }
    if (Number(mirror.price) !== priceKES) { mirror.price = priceKES; changed = true; }
    if (changed && typeof upsertDoc === 'function') {
      upsertDoc('inventory', mirror, mirror._rev).catch(() => {});
    }
  }));

  /* backfillMirror: run ONCE per session (not on every products change) */
  let backfillDone = false;
  _track(onValue(productsRef, () => {
    if (backfillDone) return;
    if (typeof backfillMirror !== 'function') return;
    backfillDone = true;
    setTimeout(() => {
      backfillMirror().catch(e => console.warn('[viora] backfill failed', e));
    }, 1500);
  }));
}

/* ═══════════════════════════════════════════════════════════
   TRACK COLLECTIONS (nested + flat)
   ═══════════════════════════════════════════════════════════ */
function wireTrackCollections() {
  const { db, P, state, renderActiveTab } = _ctx;

  /* Nested (todos under ownerUid) */
  ['todos'].forEach(col => {
    _track(onValue(ref(db, P(col)), snap => {
      const val = snap.val() || {};
      const flat = [];
      Object.entries(val).forEach(([ownerUid, items]) => {
        if (!items || typeof items !== 'object') return;
        Object.entries(items).forEach(([id, rec]) => {
          if (!rec || typeof rec !== 'object') return;
          flat.push({ ...rec, id: rec.id || id, ownerUid: rec.ownerUid || ownerUid });
        });
      });
      state.data[col] = flat;
      if (!state._bootDraining && renderActiveTab) renderActiveTab();
    }));
  });

  /* Flat (goals, skills) */
  ['goals', 'skills'].forEach(col => {
    const colRef = ref(db, P(col));
    _track(onChildAdded(colRef, snap => {
      const item = snap.val();
      if (!item) return;
      const arr = state.data[col] || (state.data[col] = []);
      const idx = arr.findIndex(x => x.id === (item.id || snap.key));
      if (idx > -1) arr[idx] = { ...item, id: item.id || snap.key };
      else arr.push({ ...item, id: item.id || snap.key });
      if (!state._bootDraining && renderActiveTab) renderActiveTab();
    }));
    _track(onChildChanged(colRef, snap => {
      const item = snap.val();
      if (!item) return;
      const arr = state.data[col] || (state.data[col] = []);
      const idx = arr.findIndex(x => x.id === (item.id || snap.key));
      if (idx > -1) arr[idx] = { ...item, id: item.id || snap.key };
      else arr.push({ ...item, id: item.id || snap.key });
      if (!state._bootDraining && renderActiveTab) renderActiveTab();
    }));
    _track(onChildRemoved(colRef, snap => {
      const arr = state.data[col] || (state.data[col] = []);
      const old = snap.val();
      const idx = arr.findIndex(x => x.id === (old?.id || snap.key));
      if (idx > -1) arr.splice(idx, 1);
      if (renderActiveTab) renderActiveTab();
    }));
  });
}

/* ═══════════════════════════════════════════════════════════
   ORCHESTRATION + ARCHIVES
   ═══════════════════════════════════════════════════════════ */
function wireOrchestrationListeners() {
  const { db, P, state, renderOrchestrationPanel } = _ctx;

  _track(onValue(ref(db, P('orchestration/handoffs')), s => {
    const val = s.exists() ? s.val() : {};
    state.data._handoffState = {};
    Object.entries(val).forEach(([id, v]) => {
      state.data._handoffState[id] = v.enabled !== false;
    });
    if (state.currentTab === 'orchestration' && renderOrchestrationPanel) {
      renderOrchestrationPanel();
    }
  }));
  _track(onValue(ref(db, P('orchestration/failures')), s => {
    if (!s.exists()) { state.data._orchestrationFailures = []; return; }
    const persisted = Object.values(s.val() || {})
      .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    state.data._orchestrationFailures = persisted.slice(0, 200);
    if (state.currentTab === 'orchestration' && renderOrchestrationPanel) {
      renderOrchestrationPanel();
    }
  }));
  _track(onValue(ref(db, P('orchestration/runs')), s => {
    if (!s.exists()) { state.data._orchestrationRuns = []; return; }
    const persisted = Object.values(s.val() || {})
      .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
    state.data._orchestrationRuns = persisted.slice(0, 200);
    if (state.currentTab === 'orchestration' && renderOrchestrationPanel) {
      renderOrchestrationPanel();
    }
  }));
}

function wireArchiveListeners() {
  const { db, P, state, renderArchivesPanel } = _ctx;
  ['archivedClients', 'archivedDeals', 'archivedProjects'].forEach(key => {
    _track(onValue(ref(db, P(key)), s => {
      state.data[key] = s.exists() ? Object.values(s.val()) : [];

      /* Refresh the sidebar counter for Archives */
      try {
        if (typeof _ctx.updateSidebarCounters === 'function') {
          _ctx.updateSidebarCounters(true);
        }
      } catch (e) { /* non-fatal */ }

      if (state.currentTab === 'archives' && renderArchivesPanel) renderArchivesPanel();
    }));
  });
}

/* ═══════════════════════════════════════════════════════════
   WISHLIST + MARKET LEADS
   ═══════════════════════════════════════════════════════════ */
function wireWishlistListener(user) {
  const { db, P, state, updateSidebarCounters, renderMyWishlist } = _ctx;
  _track(onValue(ref(db, P('marketplace/wishlist/' + user.uid)), s => {
    state.data.marketplaceWishlist = s.exists() ? (s.val() || []) : [];
    state._counterCache = null;
    try { updateSidebarCounters(true); } catch (e) {}
    if (state.currentTab === 'personal-wishlist' && renderMyWishlist) renderMyWishlist();
  }));
}

function wireDeletedEmailsListener() {
  const { db, P, state, renderActiveTab } = _ctx;
  _track(onValue(ref(db, P('marketplace/deletedEmails')), s => {
    state.data.deletedMarketEmails = s.exists() ? (s.val() || []) : [];
    if (state.currentTab === 'marketplace-analytics' ||
        state.currentTab === 'marketing-leads' ||
        state.currentTab === 'sales-clients') {
      if (renderActiveTab) renderActiveTab();
    }
  }));
}

function wireMarketLeadsListener() {
  const { db, P, state, updateSidebarCounters,
          scheduleRender, scheduleMarketSync, normalizeEmail } = _ctx;
  const norm = normalizeEmail || (s => (s || '').toLowerCase());

  _track(onValue(ref(db, P('marketLeads')), s => {
    const raw = s.exists()
      ? Object.entries(s.val()).map(([k, v]) => ({ ...v, id: v.id || k }))
      : [];

    const byKey = new Map();
    raw.forEach(m => {
      const email = norm(m.email);
      const type  = m.type || 'unknown';
      const key   = email ? `${email}|${type}` : `id|${m.id}`;
      const prior = byKey.get(key);
      const mSeen = m.lastSeenAt || m.createdAt || '';
      const pSeen = prior?.lastSeenAt || prior?.createdAt || '';
      if (!prior || mSeen > pSeen) {
        byKey.set(key, prior ? { ...m, id: prior.id } : m);
      }
    });

    state.data.marketLeads = [...byKey.values()];

    const prevIds = new Set(state._lastMarketLeadIds || []);
    const nextIds = new Set(state.data.marketLeads.map(m => m.id));
    const hasNew  = [...nextIds].some(id => !prevIds.has(id));
    state._lastMarketLeadIds = [...nextIds];

    try { scheduleMarketSync?.({ immediate: hasNew }); } catch (e) {}

    state._counterCache = null;
    try { updateSidebarCounters(true); } catch (e) {}

    if (!state._bootDraining &&
      (state.currentTab === 'marketplace-analytics'
        || state.currentTab === 'marketplace-orders'
        || state.currentTab === 'marketing-leads')) {
      scheduleRender();
    }
  }));
}

/* ═══════════════════════════════════════════════════════════
   IDB SNAPSHOT FLUSHER
   ═══════════════════════════════════════════════════════════ */
function wireIdbSnapshotFlusher() {
  const { state } = _ctx;
  const _dirty = state._dirtyCollections || (state._dirtyCollections = new Set());
  const MAX_SNAPSHOT_ROWS = 500;

  window.__vioraFlushIdbSnapshot = function () {
    if (!_dirty.size) return;
    if (window.__vioraIdbFlushPending) return;
    window.__vioraIdbFlushPending = true;

    const run = () => {
      window.__vioraIdbFlushPending = false;
      if (!_dirty.size) return;
      const snap = {};
      for (const k of _dirty) {
        if (snap[k] !== undefined) continue;
        const v = state.data[k];
        if (v === undefined) continue;
        snap[k] = Array.isArray(v) && v.length > MAX_SNAPSHOT_ROWS
          ? v.slice(-MAX_SNAPSHOT_ROWS)
          : v;
      }
      _dirty.clear();
      if (Object.keys(snap).length) idbSave(snap).catch(() => {});
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 2000 });
    } else {
      setTimeout(run, 400);
    }
  };
}

/* ═══════════════════════════════════════════════════════════
   BOOT-DRAIN RELEASE
   ═══════════════════════════════════════════════════════════ */
function releaseBootDrainWithFallback() {
  const { db, P, state, scheduleRender,
          dedupeAllCollections, recomputeProjectProgress,
          upsertDoc } = _ctx;

  let released = false;
  const release = () => {
    if (released) return;
    released = true;

    /* Always force the flags down, even if _firstLoadComplete
       was already set by an external trigger. */
    const wasComplete = !!state._firstLoadComplete;
    state._firstLoadComplete = true;
    state._bootDraining = false;
    state._forceRepaint = true;

    /* v8.2 — nuke the counter cache and force a full recompute. */
    if (typeof _ctx.updateSidebarCounters === 'function') {
      try {
        state._counterCache = null;
        state._counterEls = null;
        _ctx.updateSidebarCounters(true);
      } catch (e) { console.warn('[boot] counter refresh failed', e); }
    }

    if (!wasComplete) {
      try { scheduleRender(true); } catch (e) {}
      console.info('[viora] first load complete');
    }

    const idle = typeof requestIdleCallback === 'function'
      ? (fn, t) => requestIdleCallback(fn, { timeout: t || 6000 })
      : (fn, t) => setTimeout(fn, t || 3000);

    idle(() => {
      if (typeof dedupeAllCollections === 'function') {
        dedupeAllCollections().catch(e => console.warn('dedupe failed', e));
      }
    }, 8000);

    setTimeout(() => {
      const run = () => runTaskRestoreAndBackfill({
        db, P, state, upsertDoc, recomputeProjectProgress,
      });
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 12000 });
      } else {
        run();
      }
    }, 1500);
  };

  /* Use get() once instead of non-standard onValue({onlyOnce}). */
  const probe = (path) => {
    get(ref(db, path))
      .then(() => release())
      .catch(() => {});
  };
  probe(P('entities'));
  probe(P('tasks'));
  probe(P('invoices'));

  setTimeout(release, 900);
}

/* ═══════════════════════════════════════════════════════════
   TASK RESTORE + PROJECT BACKFILL (one-shot)
   ═══════════════════════════════════════════════════════════ */
async function runTaskRestoreAndBackfill(ctx) {
  const { db, P, state, upsertDoc, recomputeProjectProgress } = ctx;

  /* Task restore */
  try {
    const snap = await get(ref(db, P('tasks')));
    if (snap.exists()) {
      const remote = snap.val() || {};
      const knownIds = new Set((state.data.tasks || []).map(t => t.id));
      let restored = 0;
      Object.entries(remote).forEach(([id, t]) => {
        if (!t || !t.id) return;
        if (knownIds.has(t.id)) return;
        if (t.status !== 'done') return;
        state.data.tasks = state.data.tasks || [];
        state.data.tasks.push(t);
        restored++;
      });
      if (restored) {
        console.info(`[viora] restored ${restored} completed task(s) from Firebase`);
        if (state.currentTab === 'ops-tasks' && _ctx.renderTasks) {
          try { _ctx.renderTasks(); } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.warn('[viora] task-restore pass failed', e);
  }

  /* Progress backfill — guarded against missing recompute fn */
  try {
    if (typeof recomputeProjectProgress !== 'function') return;
    const projects = state.data.projects || [];
    if (!projects.length) return;
    const pending = projects.filter(p => !p._progressBackfilledAt);
    if (!pending.length) return;

    console.info(`[viora] backfilling progress for ${pending.length} project(s)`);
    for (const p of pending) {
      try {
        await recomputeProjectProgress(p.id);
        const live = (state.data.projects || []).find(x => x.id === p.id);
        if (live) {
          live._progressBackfilledAt = new Date().toISOString();
          if (typeof upsertDoc === 'function') {
            try { await upsertDoc('projects', live, live._rev); } catch (e) {}
          }
        }
      } catch (e) {}
    }
    if (state.currentTab === 'ops-projects' && _ctx.renderProjects) {
      try { _ctx.renderProjects(); } catch (e) {}
    }
    if (state.currentTab === 'dashboard' && _ctx.renderDashboard) {
      try { _ctx.renderDashboard(); } catch (e) {}
    }
  } catch (e) {
    console.warn('[viora] progress backfill failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════
   UI WIRING (chunked, deferred)
   ═══════════════════════════════════════════════════════════ */
function scheduleUiWiring() {
  const { attachEvents, attachForms, setupImportDropzone, setupCommandPalette } = _ctx;
  if (scheduleUiWiring._attached) return;
  scheduleUiWiring._attached = true;

  const TASKS = [
    { name: 'attachEvents',        fn: () => attachEvents?.(),        retries: 0 },
    { name: 'attachForms',         fn: () => attachForms?.(),         retries: 0 },
    { name: 'setupImportDropzone', fn: () => setupImportDropzone?.(), retries: 0 },
    { name: 'setupCommandPalette', fn: () => setupCommandPalette?.(), retries: 0 },
  ];
  const MAX_RETRIES = 5;

  const runNext = () => {
    const t = TASKS.shift();
    if (!t) return;
    try {
      t.fn();
      console.info('[boot] ' + t.name + ' wired OK');
    } catch (e) {
      console.error('[boot] ' + t.name + ' threw on attempt ' + (t.retries + 1) + ':', e);
      if (t.retries < MAX_RETRIES) {
        t.retries++;
        TASKS.unshift(t);
        setTimeout(() => runNext(), 250);
        return;
      }
      console.warn('[boot] giving up on ' + t.name + ' after ' + MAX_RETRIES + ' attempts');
    }
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(runNext, { timeout: 500 });
    } else {
      setTimeout(runNext, 30);
    }
  };
  setTimeout(runNext, 200);
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */
function idleRun(fn, timeout) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: timeout || 4000 });
  } else {
    setTimeout(fn, timeout || 2000);
  }
}

/* ═══════════════════════════════════════════════════════════
   NETWORK EVENTS
   ═══════════════════════════════════════════════════════════ */
export function registerNetworkEvents(deps) {
  if (registerNetworkEvents._done) return;
  registerNetworkEvents._done = true;

  const { state, setSyncStatus, toast, scheduleFlush, PushNotifications } = deps;

  window.addEventListener('online', () => {
    try { goOnline(); } catch (e) {}
    state._connected = true;
    setSyncStatus('syncing', 'Back online…');
    toast('Back online — flushing queue…', 'success');
    setTimeout(scheduleFlush, 1500);
  });

  window.addEventListener('offline', () => {
    try { goOffline(); } catch (e) {}
    state._connected = false;
    setSyncStatus('offline', 'Offline — queued');
    toast('Offline — changes will queue', 'warning');
    updatePendingCount();
  });

  window.__vioraLastFocusFlush = 0;
  window.__vioraLastFcmRegister = 0;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !navigator.onLine) return;

    /* ★ v9.5 — Never run background work while a modal is open.
       Users switching tabs mid-modal (to grab an image, paste a
       link, etc.) must not have their work destroyed by a re-render. */
    if (_isModalOrEditorOpen()) return;

    const now = Date.now();

    if (now - window.__vioraLastFocusFlush >= 60000) {
      window.__vioraLastFocusFlush = now;
      const _sched = () => scheduleFlush();
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(_sched, { timeout: 3000 });
      } else {
        setTimeout(_sched, 1200);
      }
    }

    if (now - window.__vioraLastFcmRegister >= 24 * 3600 * 1000) {
      window.__vioraLastFcmRegister = now;
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          PushNotifications?.saveTokenToServer?.().catch(() => {});
        }
      } catch (e) {}
    }
  });

  /* ★ v9.5 — The click-triggered AIRank.rerankByAI() block that used
     to live here has been REMOVED. It fired 5 seconds after every
     click, which called renderActiveTab() and destroyed any open
     modal/editor mid-form. AI ranking now runs only when the user
     explicitly visits the dashboard tab (respecting the 15-minute
     cooldown built into AIRank itself). */
}
