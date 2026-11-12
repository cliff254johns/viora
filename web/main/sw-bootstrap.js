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
let _controllerWasPresent = false;

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
  _controllerWasPresent = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!_controllerWasPresent) { _controllerWasPresent = true; return; }
    const hasUnsavedForm = [...document.forms].some(form => [...form.elements].some(el => {
      if (!el || el.disabled || ['button','submit','reset','hidden'].includes(el.type)) return false;
      if (el.type === 'checkbox' || el.type === 'radio') return el.checked !== el.defaultChecked;
      if (el.tagName === 'SELECT') return [...el.options].some((option, i) => option.selected !== option.defaultSelected);
      return typeof el.value === 'string' && el.value !== (el.defaultValue || '');
    }));
    if (hasUnsavedForm) {
      if (document.getElementById('vioraUpdateReady')) return;
      const notice = document.createElement('div'); notice.id = 'vioraUpdateReady';
      notice.style.cssText = 'position:fixed;z-index:2147483647;left:16px;right:16px;bottom:16px;padding:14px 16px;border-radius:14px;background:#10243a;color:#fff;box-shadow:0 12px 40px #0008;display:flex;align-items:center;justify-content:space-between;gap:12px;font:600 14px system-ui';
      notice.innerHTML = '<span>VIORA has an update ready. Save your changes, then refresh.</span><button type="button" style="border:0;border-radius:9px;padding:9px 13px;background:#38bdf8;color:#071827;font-weight:800">Refresh</button>';
      notice.querySelector('button').addEventListener('click', () => location.reload()); document.body.appendChild(notice);
      return;
    }
    scheduleReload('service worker update');
  });
  if (IS_DEV) { _log('dev mode — skipping SW to avoid stale cache'); return; }

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

    // Leave an update waiting until the user is ready; never force a
    // mid-session takeover or reload while forms/data are in use.
    if (reg.waiting) _log('service worker update waiting for a safe refresh');

    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          _log('service worker update installed; current session will continue');
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
        reg.update().catch(() => {});
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

  /* Do not clear caches or reload on controller changes. */
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
