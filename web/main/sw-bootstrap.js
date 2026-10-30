/* ═══════════════════════════════════════════════════════════════
   SERVICE WORKER BOOTSTRAP  (v6.9 — hardened)
   Runs on every page load. No app dependencies.
   ═══════════════════════════════════════════════════════════════ */

/* ── Configuration ── */
const SW_PATH = '/sw.js';
const SW_SCOPE = '/';
const RELOAD_THROTTLE_MS = 30 * 1000;     // min interval between auto-reloads
const REGISTRATION_TIMEOUT_MS = 15 * 1000;
const RETRY_DELAY_MS = 2000;
const MAX_REGISTRATION_RETRIES = 1;
const SOUND_ELEMENT_ID = 'vioraNotifSound';
const SOUND_SOURCES = [
  '/sounds/viora-notification.mp3',
  '/viora-notification.mp3',
  '/notification.mp3'
];

/* ── Dev detection ── */
const IS_DEV = (() => {
  try {
    const h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.local');
  } catch (e) { return false; }
})();

/* ── Logging (quiet in prod, verbose in dev) ── */
const _log = (...args) => { if (IS_DEV) console.info('[viora/sw]', ...args); };
const _warn = (...args) => { if (IS_DEV) console.warn('[viora/sw]', ...args); };

/* ── Module-level idempotency ── */
const _bootKey = '__vioraSwBootstrap__';
let _swBooted = false;
let _soundInjected = false;
let _reloadScheduled = false;
let _lastReloadAt = 0;

/* ═══════════════════════════════════════════════════════════════
   SERVICE WORKER
   ═══════════════════════════════════════════════════════════════ */
export function bootServiceWorker() {
  if (_swBooted) return;
  _swBooted = true;

  // Persist across HMR reloads so we don't stack listeners
  if (typeof window !== 'undefined') {
    if (window[_bootKey]) return;
    window[_bootKey] = true;
  }

  if (!('serviceWorker' in navigator)) { _log('SW not supported'); return; }
  if (IS_DEV) { _log('dev mode — skipping SW to avoid stale cache'); return; }

  /* ── Notify controller of a pending cache clear, safely ── */
  function clearActiveCache() {
    try {
      const ctrl = navigator.serviceWorker.controller;
      if (ctrl) ctrl.postMessage({ type: 'CLEAR_CACHE' });
    } catch (e) { _warn('postMessage failed', e); }
  }

  /* ── Throttled reload ── */
  function scheduleReload(reason) {
    if (_reloadScheduled) return;
    const now = Date.now();
    if (now - _lastReloadAt < RELOAD_THROTTLE_MS) {
      _warn('reload throttled — last reload was', (now - _lastReloadAt) / 1000, 's ago');
      return;
    }
    _reloadScheduled = true;
    _lastReloadAt = now;
    _log('reloading for', reason);
    // Use replace so back button isn't polluted; use location.href to force fresh nav
    try { location.reload(); }
    catch (e) { location.href = location.href; }
  }

  /* ── Wire an SW registration for updates ── */
  function wireRegistration(reg) {
    if (!reg) return;

    // Handle SW waiting from a previous session
    if (reg.waiting && navigator.serviceWorker.controller) {
      _log('update already waiting — activating');
      try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
    }

    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'activated') {
          // Only reload if there was a controller (i.e., this is an update, not first install)
          if (navigator.serviceWorker.controller) {
            scheduleReload('new SW activated');
          } else {
            _log('first SW activation — no reload needed');
          }
        }
      });
    });
  }

  /* ── Register (with timeout + one retry) ── */
  function registerWithRetry(attempt = 0) {
    let timedOut = false;
    const timeoutId = setTimeout(() => { timedOut = true; }, REGISTRATION_TIMEOUT_MS);

    navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE })
      .then(reg => {
        clearTimeout(timeoutId);
        if (timedOut) return;   // ignore late success
        _log('SW registered, scope:', reg.scope);
        wireRegistration(reg);
        // Ask an existing controller to clear its cache
        clearActiveCache();
      })
      .catch(err => {
        clearTimeout(timeoutId);
        _warn('SW registration failed (attempt ' + (attempt + 1) + '):', err && err.message);
        if (attempt < MAX_REGISTRATION_RETRIES) {
          setTimeout(() => registerWithRetry(attempt + 1), RETRY_DELAY_MS);
        }
      });
  }

  /* ── Boot once DOM + load events permit ── */
  const run = () => { try { registerWithRetry(0); } catch (e) { _warn('register threw', e); } };

  if (document.readyState === 'complete') {
    // Already loaded — register on next tick
    setTimeout(run, 0);
  } else {
    window.addEventListener('load', run, { once: true });
  }

  /* ── When a new SW takes control mid-session, notify it of cache policy ── */
  try {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      _log('controller changed');
      clearActiveCache();
    });
  } catch (e) { _warn('controllerchange listener failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION SOUND
   ─────────────────────────────────────────────────────────────
   Inject <audio> with metadata-only preload and Web Audio fallback.
   ═══════════════════════════════════════════════════════════════ */
export function injectNotificationSound() {
  if (_soundInjected) return;
  _soundInjected = true;

  if (typeof document === 'undefined') return;
  if (document.getElementById(SOUND_ELEMENT_ID)) return;

  const mount = () => {
    if (document.getElementById(SOUND_ELEMENT_ID)) return;

    const audio = document.createElement('audio');
    audio.id = SOUND_ELEMENT_ID;
    // preload="none" avoids blocking page load; browser fetches on first play()
    audio.preload = 'none';
    audio.setAttribute('playsinline', '');
    audio.setAttribute('aria-hidden', 'true');
    audio.style.display = 'none';

    // Append <source> tags before attaching to DOM
    for (const src of SOUND_SOURCES) {
      const s = document.createElement('source');
      s.src = src;
      s.type = 'audio/mpeg';
      audio.appendChild(s);
    }

    // Track which source actually loaded (helps debugging)
    audio.addEventListener('loadeddata', () => {
      _log('notification sound ready:', audio.currentSrc || 'unknown');
    });

    // If all sources fail, mark it and use Web Audio fallback at play time
    audio.addEventListener('error', () => {
      _warn('notification sound failed to load; Web Audio fallback will be used');
      audio.dataset.fallback = '1';
    }, true);

    // Some browsers fire error on individual <source> — not the audio element itself.
    // We listen for a final failure by checking networkState after readyState settles.
    audio.addEventListener('canplaythrough', () => {
      delete audio.dataset.fallback;
    });

    document.body.appendChild(audio);
    _log('notification sound injected');
  };

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}

/* ═══════════════════════════════════════════════════════════════
   PUBLIC: play a notification sound (uses <audio> then Web Audio)
   ═══════════════════════════════════════════════════════════════ */
export function playNotificationSound() {
  const audio = document.getElementById(SOUND_ELEMENT_ID);
  if (audio && !audio.dataset.fallback) {
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => { tryWebAudioBeep(); });
        return;
      }
      return;
    } catch (e) {
      // fall through to Web Audio
    }
  }
  tryWebAudioBeep();
}

/* ── Web Audio fallback: a short, quiet two-tone beep ── */
let _audioCtx = null;
function tryWebAudioBeep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!_audioCtx) _audioCtx = new AC();
    const ctx = _audioCtx;
    if (ctx.state === 'suspended') {
      // Resume is async and requires a user gesture; fire and forget
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(660, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch (e) { /* silent */ }
}

/* ═══════════════════════════════════════════════════════════════
   AUTO-BOOT (safe: idempotent, dev-aware, DOM-aware)
   ═══════════════════════════════════════════════════════════════ */
if (typeof window !== 'undefined') {
  // Defer to next tick so we never block import
  const kick = () => {
    try { bootServiceWorker(); } catch (e) { _warn('bootServiceWorker failed', e); }
    try { injectNotificationSound(); } catch (e) { _warn('injectNotificationSound failed', e); }
  };
  if (typeof queueMicrotask === 'function') queueMicrotask(kick);
  else setTimeout(kick, 0);
}

/* ═══════════════════════════════════════════════════════════════
   HMR cleanup (Vite / webpack)
   ═══════════════════════════════════════════════════════════════ */
if (typeof import.meta !== 'undefined' && import.meta.hot) {
  import.meta.hot.dispose(() => {
    // Reset in-memory flags so a new import can re-boot
    _swBooted = false;
    _soundInjected = false;
    _reloadScheduled = false;
    if (typeof window !== 'undefined') delete window[_bootKey];
  });
}
