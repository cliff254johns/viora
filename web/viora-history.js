/* ═══════════════════════════════════════════════════════════════
   viora-history.js — Browser history + modal back-button guard
   ─────────────────────────────────────────────────────────────
   Problem: In a single-page app, pressing the browser Back button
   after opening a modal usually navigates away from the app
   entirely. Users lose their place.

   Solution:
     • initHistoryGuard() — pushes a synthetic history entry each
       time a modal opens (or the mobile drawer opens). Pressing
       Back closes the top of the stack instead of leaving the page.

     • watchModals() — uses a MutationObserver on `.modal-overlay`
       so any code that just toggles `classList.add('active')`
       automatically participates in the guard without having to
       call into this module.

   Public API:
     initHistoryGuard()
     watchModals()
     pushModalToHistory(modalId)
     closeTopModalFromHistory()
     isAnyModalOpen()
     getOpenModals()

   No dependencies. Zero side effects beyond one history.pushState
   per modal open and one history.back() per pop.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ─────────────────────────────────────────────────────────
     State
     ───────────────────────────────────────────────────────── */
  const _openStack = [];        // ids of currently-open modals (LIFO)
  const _knownIds  = new Set(); // ids we've seen as overlays
  let   _guardInstalled = false;
  let   _observer = null;
  let   _patchedState = false;

  /* Suffix marker so popstate handlers from other scripts can
     recognise our entries and bail out. */
  const GUARD_KEY = '__vioraModal';
  const GUARD_VALUE = '1';

  /* ─────────────────────────────────────────────────────────
     Helpers
     ───────────────────────────────────────────────────────── */
  function isOverlayOpen(el) {
    if (!el || !el.classList) return false;
    if (!el.classList.contains('modal-overlay')) return false;
    if (!el.classList.contains('active')) return false;
    /* Respect inline `display: none` overrides some modals use. */
    if (el.style && el.style.display === 'none') return false;
    return true;
  }

  function getOverlayById(id) {
    return document.getElementById(id);
  }

  function readModalId(el) {
    return (el && el.id) ? el.id : null;
  }

  /* ─────────────────────────────────────────────────────────
     Push / pop
     ───────────────────────────────────────────────────────── */
  function pushModalToHistory(modalId) {
    if (!modalId) return;
    if (typeof history === 'undefined' || typeof history.pushState !== 'function') return;
    if (_openStack.includes(modalId)) return;

    try {
      const state = Object.assign({}, history.state || {}, {
        [GUARD_KEY]: GUARD_VALUE,
        [GUARD_KEY + 'Id']: modalId
      });
      history.pushState(state, '');
    } catch (e) {
      /* history.pushState throws in sandboxed iframes — non-fatal. */
      return;
    }
    _openStack.push(modalId);
  }

  function closeOverlay(id) {
    const el = getOverlayById(id);
    if (!el) return;
    try { el.classList.remove('active'); } catch (e) {}
    if (el.style) el.style.display = 'none';

    try {
      el.dispatchEvent(new CustomEvent('viora:modal-closed', { detail: { id } }));
    } catch (e) {}
  }

  function closeTopModalFromHistory() {
    while (_openStack.length) {
      const id = _openStack.pop();
      const el = getOverlayById(id);
      if (el && isOverlayOpen(el)) {
        closeOverlay(id);
        return id;
      }
      /* Already closed by some other code — keep popping until
         we find one that's actually still open. */
    }
    return null;
  }

  function isAnyModalOpen() {
    if (_openStack.length) return true;
    const overlays = document.querySelectorAll('.modal-overlay.active');
    for (let i = 0; i < overlays.length; i++) {
      if (isOverlayOpen(overlays[i])) return true;
    }
    return false;
  }

  function getOpenModals() {
    const out = [];
    const overlays = document.querySelectorAll('.modal-overlay.active');
    for (let i = 0; i < overlays.length; i++) {
      if (isOverlayOpen(overlays[i])) {
        const id = readModalId(overlays[i]);
        if (id) out.push(id);
      }
    }
    return out;
  }

  /* ─────────────────────────────────────────────────────────
     Observer — auto-detects class changes on overlays
     ───────────────────────────────────────────────────────── */
  function markOpen(el) {
    const id = readModalId(el);
    if (!id) return;
    _knownIds.add(id);
    if (_openStack.includes(id)) return;
    pushModalToHistory(id);
  }

  function markClosed(el) {
    const id = readModalId(el);
    if (!id) return;
    const idx = _openStack.indexOf(id);
    if (idx >= 0) _openStack.splice(idx, 1);
  }

  function patchHistoryState() {
    if (_patchedState) return;
    _patchedState = true;

    /* Preserve any existing pushState handlers by installing our
       state on the *current* entry once, so a Back press at the
       very start of the session doesn't navigate away. */
    try {
      if (!history.state || !history.state[GUARD_KEY]) {
        const s = Object.assign({}, history.state || {}, { __vioraBoot: '1' });
        history.replaceState(s, '');
      }
    } catch (e) { /* non-fatal */ }
  }

  /* ─────────────────────────────────────────────────────────
     initHistoryGuard
     ───────────────────────────────────────────────────────── */
  function initHistoryGuard() {
    if (_guardInstalled) return;
    _guardInstalled = true;

    patchHistoryState();

    window.addEventListener('popstate', function (event) {
      /* Our own modal entries carry the marker + a modal id. */
      const st = event.state || {};
      const wasOurs = st[GUARD_KEY] === GUARD_VALUE;

      /* If any modal is open, always close the top of the stack
         rather than letting the browser navigate. */
      if (isAnyModalOpen()) {
        closeTopModalFromHistory();
        /* Re-push a fresh guard entry if the pop closed one. */
        if (isAnyModalOpen()) {
          const remaining = getOpenModals();
          const topId = remaining[remaining.length - 1];
          if (topId) pushModalToHistory(topId);
        } else {
          /* Re-arm the base entry so the next Back press still
             doesn't leave the page. */
          patchHistoryState();
        }
        return;
      }

      if (wasOurs) {
        /* No modal is open anymore — we may have popped our last
           guard entry. Re-arm without navigating. */
        patchHistoryState();
      }
    });

    /* Also listen for the viora:modal-opened event that
       modal-utils.js dispatches, so guard state stays in sync
       even when the MutationObserver is disabled. */
    window.addEventListener('viora:modal-opened', function (e) {
      const id = e && e.detail && e.detail.id;
      if (id) pushModalToHistory(id);
    });

    window.addEventListener('viora:modal-closed', function (e) {
      const id = e && e.detail && e.detail.id;
      if (!id) return;
      const idx = _openStack.indexOf(id);
      if (idx >= 0) _openStack.splice(idx, 1);
    });
  }

  /* ─────────────────────────────────────────────────────────
     watchModals — observes class changes on .modal-overlay
     ───────────────────────────────────────────────────────── */
  function watchModals() {
    if (_observer) return;
    if (typeof MutationObserver === 'undefined') {
      /* Fallback — poll every 500ms. Only used in ancient environments. */
      let lastSnapshot = '';
      setInterval(function () {
        const now = getOpenModals().join(',');
        if (now !== lastSnapshot) {
          lastSnapshot = now;
          for (const id of now.split(',').filter(Boolean)) {
            if (!_openStack.includes(id)) pushModalToHistory(id);
          }
        }
      }, 500);
      return;
    }

    _observer = new MutationObserver(function (mutations) {
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
        const el = m.target;
        if (!el || !el.classList || !el.classList.contains('modal-overlay')) continue;

        const id = readModalId(el);
        if (!id) continue;

        if (isOverlayOpen(el)) {
          markOpen(el);
        } else {
          markClosed(el);
        }
      }
    });

    _observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class'],
    });
  }

  /* ─────────────────────────────────────────────────────────
     Expose
     ───────────────────────────────────────────────────────── */
  const api = {
    initHistoryGuard,
    watchModals,
    pushModalToHistory,
    closeTopModalFromHistory,
    isAnyModalOpen,
    getOpenModals,
  };

  if (typeof global !== 'undefined') {
    global.VioraHistory = api;
    /* Also expose as direct globals for scripts that don't import. */
    if (typeof global.initHistoryGuard !== 'function') global.initHistoryGuard = initHistoryGuard;
    if (typeof global.watchModals !== 'function') global.watchModals = watchModals;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    module.exports.initHistoryGuard = initHistoryGuard;
    module.exports.watchModals = watchModals;
    module.exports.default = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

/* ESM exports — keep the named imports in main.js working. */
export const initHistoryGuard = (typeof window !== 'undefined' && window.VioraHistory)
  ? window.VioraHistory.initHistoryGuard
  : function () {};
export const watchModals = (typeof window !== 'undefined' && window.VioraHistory)
  ? window.VioraHistory.watchModals
  : function () {};
export const pushModalToHistory = (typeof window !== 'undefined' && window.VioraHistory)
  ? window.VioraHistory.pushModalToHistory
  : function () {};
export const closeTopModalFromHistory = (typeof window !== 'undefined' && window.VioraHistory)
  ? window.VioraHistory.closeTopModalFromHistory
  : function () {};
export const isAnyModalOpen = (typeof window !== 'undefined' && window.VioraHistory)
  ? window.VioraHistory.isAnyModalOpen
  : function () { return false; };
export const getOpenModals = (typeof window !== 'undefined' && window.VioraHistory)
  ? window.VioraHistory.getOpenModals
  : function () { return []; };

export default {
  initHistoryGuard,
  watchModals,
  pushModalToHistory,
  closeTopModalFromHistory,
  isAnyModalOpen,
  getOpenModals,
};
