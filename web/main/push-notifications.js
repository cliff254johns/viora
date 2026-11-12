/* ═══════════════════════════════════════════════════════════════
   VIORA — PUSH NOTIFICATIONS SUBSYSTEM  (v6.8 — debugged + optimized)
   Handles: FCM token registration, permission prompts, OS push.
   ═══════════════════════════════════════════════════════════════ */
import {
  getMessaging, getToken, onMessage, isSupported as fcmIsSupported
} from "firebase/messaging";

/* Default VAPID key — public by design; can be overridden via initPushNotifications */
const DEFAULT_FCM_VAPID_KEY =
  "BM-vdeZy-VRipULdhQlRn9VjejLHQoTUtTNU0P2Lqm7q3UcgbZ53p7jVP9z2XoISAq5Iyt18SvumTWA2VhmAs5M";

let D = {
  app: null, db: null, ref: null, set: null,
  ROOT: null, state: null, toast: null, callFn: null, $: null,
  VAPID_KEY: DEFAULT_FCM_VAPID_KEY,
  pushPathPrefix: null, // optional override for token storage path
};

export function initPushNotifications(d) {
  // Only overwrite keys actually provided
  if (d && typeof d === 'object') {
    for (const k of Object.keys(d)) {
      if (d[k] !== undefined) D[k] = d[k];
    }
  }
  if (!D.VAPID_KEY) D.VAPID_KEY = DEFAULT_FCM_VAPID_KEY;
  return D;
}

/* ── Module state ── */
let _initDone = false;
let _initPromise = null;
let _fcmUnsubscribe = null;
let _permissionBadgeHandler = null;
const _pushFallbackThrottle = new Map(); // key → timestamp
const _TOKEN_REG_CONCURRENCY = 1;
let _tokenInFlight = null;

/* ── Helpers ── */
const nowIso = () => new Date().toISOString();
const safeState = () => (D.state && (D.state.data = D.state.data || {}, D.state)) || { data: {} };
const safeData = () => safeState().data;

function log(...args) {
  if (typeof console !== 'undefined' && console.info) console.info('[push]', ...args);
}
function warn(...args) {
  if (typeof console !== 'undefined' && console.warn) console.warn('[push]', ...args);
}

/* Timeout wrapper for promises that may hang (e.g. serviceWorker.ready) */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label || 'promise'} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

/* Prune the fallback throttle map to keep memory bounded */
function pruneThrottle(now) {
  if (_pushFallbackThrottle.size <= 500) return;
  const cutoff = now - 5 * 60 * 1000;
  for (const [k, ts] of _pushFallbackThrottle) {
    if (ts < cutoff) _pushFallbackThrottle.delete(k);
  }
}

/* SHA-256 hex — falls back to FNV-1a if crypto.subtle unavailable */
async function hashToken(token) {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
      const bytes = new TextEncoder().encode(token);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hex = Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      return 'sha256-' + hex.slice(0, 32);
    }
  } catch (e) { warn('crypto.subtle unavailable, falling back', e?.message); }

  // FNV-1a 32-bit over UTF-8 bytes — deterministic across engines
  let h = 0x811c9dc5;
  const s = String(token || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return 'fnv-' + h.toString(16).padStart(8, '0');
}

function platformName() {
  try {
    if (navigator.userAgentData?.platform) return navigator.userAgentData.platform;
  } catch (e) {}
  if (typeof navigator !== 'undefined' && navigator.platform) return navigator.platform;
  return 'web';
}

function shortUA() {
  try { return (navigator.userAgent || '').slice(0, 200); } catch (e) { return ''; }
}

/* Extract a display message from an FCM payload (handles data-only + notification) */
function extractMessage(payload) {
  const n = payload?.notification || {};
  const d = payload?.data || {};
  const title = n.title || d.title || 'VIORA';
  const body = n.body || d.body || '';
  const url = d.url || n.click_action || '';
  const image = n.image || d.image || '';
  const tag = d.tag || '';
  return { title, body, url, image, tag };
}

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
async function init() {
  if (_initDone) return _initPromise;
  _initPromise = (async () => {
    try {
      if (!D.app) { warn('no Firebase app injected; skipping init'); updatePermissionBadge(); return; }

      const supported = await fcmIsSupported().catch(() => false);
      if (!supported) { updatePermissionBadge(); return; }

      const state = safeState();
      state._messaging = getMessaging(D.app);

      // Clean up any prior onMessage subscription
      if (typeof _fcmUnsubscribe === 'function') {
        try { _fcmUnsubscribe(); } catch (e) {}
        _fcmUnsubscribe = null;
      }
      _fcmUnsubscribe = onMessage(state._messaging, (payload) => {
        // onMessage only fires when tab is focused — safe to toast
        const { title, body, url } = extractMessage(payload);
        if (D.toast) D.toast(`${title}${body ? ': ' + body : ''}`, 'info');
        // Optional click-through: if url, open it on notification body click (host decides)
        try {
          if (url && typeof D.onNotificationClick === 'function') {
            D.onNotificationClick({ url, title, body, payload });
          }
        } catch (e) {}
      });

      // If permission already granted, fetch/refresh token in background
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        _tokenInFlight = _fetchAndStoreToken().finally(() => { _tokenInFlight = null; });
        await _tokenInFlight.catch(() => null);
      }

      updatePermissionBadge();
    } catch (e) {
      warn('init failed', e);
      updatePermissionBadge();
    } finally {
      _initDone = true;
    }
  })();
  return _initPromise;
}

/* ═══════════════════════════════════════════════════════════════
   PERMISSION
   ═══════════════════════════════════════════════════════════════ */
async function requestPermission() {
  try {
    if (typeof Notification === 'undefined') {
      D.toast?.('Push not supported in this browser.', 'warning');
      return { ok: false, reason: 'unsupported' };
    }

    const perm = await Notification.requestPermission();
    safeData().fcmPermission = perm;
    updatePermissionBadge();

    if (perm !== 'granted') {
      D.toast?.('Push notifications declined.', 'warning');
      return { ok: false, reason: perm };
    }

    // Ensure messaging instance is ready
    if (!safeState()._messaging && D.app) {
      const supported = await fcmIsSupported().catch(() => false);
      if (supported) safeState()._messaging = getMessaging(D.app);
    }

    const token = await _fetchAndStoreToken();
    if (!token) {
      D.toast?.('Push granted, but token registration failed. Try again later.', 'warning');
      return { ok: false, reason: 'token-failed' };
    }

    D.toast?.('Push notifications enabled.', 'success');
    return { ok: true, token };
  } catch (e) {
    D.toast?.('Permission request failed: ' + (e?.message || e), 'error');
    return { ok: false, reason: 'exception', error: e };
  }
}

/* ═══════════════════════════════════════════════════════════════
   TOKEN REGISTRATION
   ═══════════════════════════════════════════════════════════════ */
async function _getServiceWorkerRegistration() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    // Don't hang forever — the SW may never be registered
    const reg = await withTimeout(navigator.serviceWorker.ready, 5000, 'serviceWorker.ready');
    return reg || null;
  } catch (e) {
    warn('no service worker ready:', e?.message);
    return null;
  }
}

async function _fetchAndStoreToken() {
  try {
    const state = safeState();

    // Ensure messaging instance
    if (!state._messaging) {
      const supported = await fcmIsSupported().catch(() => false);
      if (!supported) { warn('FCM not supported'); return null; }
      if (!D.app) { warn('no Firebase app'); return null; }
      state._messaging = getMessaging(D.app);
    }

    const swReg = await _getServiceWorkerRegistration();

    // Try with the SW registration; if Chrome complains about scope, retry without
    let token = null;
    try {
      token = await getToken(state._messaging, {
        vapidKey: D.VAPID_KEY,
        serviceWorkerRegistration: swReg || undefined
      });
    } catch (err1) {
      warn('getToken with SW failed, retrying without:', err1?.message);
      try {
        token = await getToken(state._messaging, { vapidKey: D.VAPID_KEY });
      } catch (err2) {
        warn('getToken failed completely:', err2?.message);
        return null;
      }
    }

    if (!token) { warn('getToken returned null'); return null; }

    // Skip redundant registration if token unchanged
    if (state.data.fcmToken === token && state.data.fcmTokenHash) {
      // Refresh lastSeen occasionally
      const lastSeen = state.data.fcmTokenLastSeen ? new Date(state.data.fcmTokenLastSeen).getTime() : 0;
      if (Date.now() - lastSeen < 24 * 60 * 60 * 1000) {
        return token;
      }
    }

    const hash = await hashToken(token);
    const uid = state.operator?.uid;
    if (!uid) {
      // No user yet — store locally only; caller can re-register on login
      state.data.fcmToken = token;
      state.data.fcmTokenHash = hash;
      state.data.fcmTokenLastSeen = nowIso();
      log('token acquired but no operator uid; will register on login');
      return token;
    }

    const payload = {
      token,
      platform: platformName(),
      ua: shortUA(),
      createdAt: state.data.fcmTokenCreatedAt || nowIso(),
      lastSeen: nowIso(),
      hash
    };

    let registered = false;

    // Preferred path: worker endpoint
    if (typeof D.callFn === 'function') {
      try {
        const res = await withTimeout(
          D.callFn('push/register', { token, platform: payload.platform, ua: payload.ua }),
          10000, 'push/register'
        );
        registered = true;
        if (res?.hash) payload.hash = res.hash;
        log('token registered with worker:', payload.hash);
      } catch (workerErr) {
        warn('worker register failed, using Firebase fallback:', workerErr?.message);
      }
    }

    // Fallback: direct Firebase write
    if (!registered) {
      try {
        if (!D.db || !D.ref || !D.set || !D.ROOT) throw new Error('Firebase deps missing');
        const path = `${D.ROOT}/orgs/viora/users/${uid}/fcmTokens/${hash}`;
        await D.set(D.ref(D.db, path), payload);
        log('token saved via Firebase fallback:', hash);
      } catch (fbErr) {
        warn('Firebase fallback failed too:', fbErr?.message);
        return null;
      }
    }

    // Only update local state after a successful write
    state.data.fcmToken = token;
    state.data.fcmTokenHash = payload.hash;
    state.data.fcmTokenLastSeen = payload.lastSeen;
    state.data.fcmTokenCreatedAt = state.data.fcmTokenCreatedAt || payload.createdAt;

    return token;
  } catch (e) {
    warn('_fetchAndStoreToken failed:', e?.message);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   BADGE
   ═══════════════════════════════════════════════════════════════ */
function updatePermissionBadge() {
  const badge = D.$?.('pushPermissionBadge');
  const perm = (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');

  // Keep state in sync (harmless if called before state exists)
  try { safeData().fcmPermission = perm; } catch (e) {}

  if (!badge) return;

  // Preserve any unrelated classes; only toggle our 3 modifiers
  badge.classList.remove('granted', 'denied');

  if (perm === 'granted') {
    badge.textContent = '✓ Enabled';
    badge.classList.add('granted');
  } else if (perm === 'denied') {
    badge.textContent = '✗ Blocked';
    badge.classList.add('denied');
  } else if (perm === 'default') {
    badge.textContent = 'Not enabled';
  } else {
    badge.textContent = 'N/A';
  }
}

/* ═══════════════════════════════════════════════════════════════
   SEND
   ═══════════════════════════════════════════════════════════════ */
async function sendToUid(uidKey, title, body, data = {}) {
  if (!uidKey) return { ok: false, reason: 'no-uid' };
  if (!D.callFn) return { ok: false, reason: 'no-callFn' };

  try {
    await withTimeout(
      D.callFn('push/send', { toUid: uidKey, title, body, data }),
      10000, 'push/send'
    );
    return { ok: true };
  } catch (e) {
    // Fallback: in-app notification via global helper
    let notified = false;
    if (typeof window !== 'undefined' && typeof window.vioraNotify === 'function') {
      try {
        const r = window.vioraNotify({
          title, body,
          level: 'info',
          url: data?.url || '/main.html',
          source: 'push-fallback',
          eventId: data?.eventId || data?.id || (uidKey + '-' + title)
        });
        if (r && typeof r.then === 'function') await r;
        notified = true;
      } catch (e2) { /* ignore */ }
    }

    // Throttled toast for the current user only, and only if vioraNotify didn't fire
    const selfUid = safeState().operator?.uid;
    if (!notified && selfUid === uidKey && D.toast) {
      const key = `push|${uidKey}|${title}`;
      const now = Date.now();
      const last = _pushFallbackThrottle.get(key) || 0;
      if (now - last > 60000) {
        _pushFallbackThrottle.set(key, now);
        D.toast(`${title}${body ? ': ' + body : ''}`, 'info');
      }
      pruneThrottle(now);
    }

    return { ok: false, reason: 'worker-failed', error: e?.message };
  }
}

async function sendToRole(role, title, body, data = {}) {
  if (!role) return { ok: false, reason: 'no-role' };
  if (!D.callFn) return { ok: false, reason: 'no-callFn' };
  try {
    await withTimeout(
      D.callFn('push/send', { toRole: role, title, body, data }),
      10000, 'push/send'
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'worker-failed', error: e?.message };
  }
}

/* ═══════════════════════════════════════════════════════════════
   TEST
   ═══════════════════════════════════════════════════════════════ */
async function sendTest() {
  const uid = safeState().operator?.uid;
  if (!uid) { D.toast?.('Sign in first.', 'warning'); return; }

  try {
    await withTimeout(
      D.callFn('push/send', {
        toUid: uid,
        title: 'Test notification',
        body: `Sent ${new Date().toLocaleTimeString()}`,
        data: { test: true }
      }),
      10000, 'push/send'
    );
    D.toast?.('Test push sent.', 'success');
  } catch (e) {
    D.toast?.('Test push failed (endpoint may not be deployed). In-app fallback active.', 'warning');

    const list = D.$?.('notifBody');
    if (list) {
      const row = document.createElement('div');
      row.className = 'notif-item info';
      row.style.cursor = 'default';
      row.innerHTML =
        `<div class="ni-icon"><i class="fas fa-bell"></i></div>` +
        `<div class="ni-body">` +
          `<div class="ni-title">Test notification</div>` +
          `<div class="ni-sub">Sent ${new Date().toLocaleTimeString()}</div>` +
        `</div>` +
        `<div class="ni-time">now</div>`;
      list.insertBefore(row, list.firstChild);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   LIFECYCLE HELPERS
   ═══════════════════════════════════════════════════════════════ */
async function unregister() {
  try { if (typeof _fcmUnsubscribe === 'function') _fcmUnsubscribe(); } catch (e) {}
  _fcmUnsubscribe = null;
  _initDone = false;
  _initPromise = null;

  const state = safeState();
  const uid = state.operator?.uid;
  const hash = state.data.fcmTokenHash;

  // Best-effort server-side cleanup
  if (uid && hash && typeof D.callFn === 'function') {
    try { await D.callFn('push/unregister', { hash }); } catch (e) {}
  }
  if (uid && hash && D.db && D.ref && D.set && D.ROOT) {
    // Mirror the fallback path — leave actual deletion to the worker
    // (marking as revoked is safer than deleting here)
    try {
      const path = `${D.ROOT}/orgs/viora/users/${uid}/fcmTokens/${hash}`;
      await D.set(D.ref(D.db, path), {
        token: state.data.fcmToken || '',
        revokedAt: nowIso(),
        revoked: true
      });
    } catch (e) {}
  }

  delete state.data.fcmToken;
  delete state.data.fcmTokenHash;
}

/* ═══════════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════════ */
export const PushNotifications = {
  init,
  requestPermission,
  updatePermissionBadge,
  sendToUid,
  sendToRole,
  sendTest,
  saveTokenToServer: _fetchAndStoreToken,
  unregister,
  // For tests / advanced use
  _extractMessage: extractMessage,
  _hashToken: hashToken,
};

/* Expose on window for inline handlers */
if (typeof window !== 'undefined') {
  window.PushNotifications = PushNotifications;
}
