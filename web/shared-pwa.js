/* VIORA shared PWA bootstrap — safe, idempotent, and independent of app auth. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var installed = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  installed = installed || window.navigator.standalone === true;

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(function (registration) {
          // Check for updates quietly; never force activation or reload.
          if (registration && typeof registration.update === 'function') {
            registration.update().catch(function () {});
          }
        })
        .catch(function (error) {
          console.warn('[VIORA PWA] Service worker registration failed:', error);
        });
    }, { once: true });
  }

  if (installed) return;

  var deferredPrompt = null;
  var dismissed = false;
  try { dismissed = sessionStorage.getItem('viora-install-dismissed') === '1'; } catch (_) {}

  function createPrompt() {
    if (dismissed || document.getElementById('vioraInstallPrompt')) return;
    var wrap = document.createElement('aside');
    wrap.id = 'vioraInstallPrompt';
    wrap.setAttribute('aria-label', 'Install VIORA');
    wrap.style.cssText = 'position:fixed;z-index:10000;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));max-width:440px;margin:0 auto;padding:14px 16px;border:1px solid rgba(120,160,220,.35);border-radius:16px;background:#0A192F;color:#fff;box-shadow:0 12px 40px rgba(0,0,0,.28);display:flex;align-items:center;gap:12px;font:500 14px/1.4 system-ui,sans-serif;';
    var copy = document.createElement('div');
    copy.style.cssText = 'flex:1;min-width:0';
    var title = document.createElement('strong');
    title.textContent = 'Install VIORA';
    title.style.cssText = 'display:block;font-size:14px;margin-bottom:2px';
    var desc = document.createElement('span');
    desc.textContent = 'Add the VIORA app for quick access.';
    desc.style.cssText = 'display:block;color:#cbd5e1;font-size:12px';
    copy.appendChild(title); copy.appendChild(desc);
    var install = document.createElement('button');
    install.type = 'button'; install.textContent = 'Install';
    install.style.cssText = 'border:0;border-radius:10px;padding:10px 14px;background:#2267ee;color:#fff;font-weight:700;cursor:pointer';
    var close = document.createElement('button');
    close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label','Dismiss install prompt');
    close.style.cssText = 'border:0;background:transparent;color:#cbd5e1;font-size:22px;padding:2px 4px;cursor:pointer';
    close.addEventListener('click', function () {
      dismissed = true;
      try { sessionStorage.setItem('viora-install-dismissed','1'); } catch (_) {}
      wrap.remove();
    });
    install.addEventListener('click', async function () {
      if (!deferredPrompt) {
        desc.textContent = 'On iPhone/iPad: use Share, then Add to Home Screen.';
        install.hidden = true;
        return;
      }
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (_) {}
      deferredPrompt = null;
      wrap.remove();
    });
    wrap.appendChild(copy); wrap.appendChild(install); wrap.appendChild(close);
    document.body.appendChild(wrap);
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    createPrompt();
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    var prompt = document.getElementById('vioraInstallPrompt');
    if (prompt) prompt.remove();
  });
  // iOS has no beforeinstallprompt event; provide concise manual guidance.
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && !dismissed) {
    window.addEventListener('load', function () {
      if (!installed) {
        createPrompt();
        var p = document.getElementById('vioraInstallPrompt');
        if (p) {
          var btn = p.querySelector('button');
          if (btn) btn.textContent = 'How';
        }
      }
    }, { once: true });
  }
})();