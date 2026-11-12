/* VIORA shared PWA bootstrap — safe, idempotent, and independent of app auth. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Enforce one VIORA company identity across every page using this shared PWA layer.
  function ensureCompanyIcons() {
    var head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return;
    var specs = [
      ['icon', 'image/png', '/viora-icon-192.png', '192x192'],
      ['icon', 'image/svg+xml', '/viora-app-icon.svg', 'any'],
      ['shortcut icon', 'image/png', '/viora-icon-192.png', ''],
      ['apple-touch-icon', 'image/png', '/viora-icon-192.png', '180x180'],
      ['mask-icon', '', '/viora-app-icon.svg', '']
    ];
    specs.forEach(function (spec) {
      var selector = 'link[rel="' + spec[0] + '"]';
      var link = head.querySelector(selector);
      if (!link) { link = document.createElement('link'); link.rel = spec[0]; head.appendChild(link); }
      if (spec[1]) link.type = spec[1];
      link.href = spec[2];
      if (spec[3]) link.sizes = spec[3];
      if (spec[0] === 'mask-icon') link.setAttribute('color', '#78c8ff');
    });
    var touchTitle = head.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!touchTitle) { touchTitle = document.createElement('meta'); touchTitle.name = 'apple-mobile-web-app-title'; head.appendChild(touchTitle); }
    touchTitle.content = 'VIORA';
  }
  ensureCompanyIcons();

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

  // The install invitation is intentionally reserved for the main VIORA workspace.
  var isMainApp = location.pathname === '/main' || location.pathname === '/main.html';
  if (installed || !isMainApp) return;

  var deferredPrompt = null;
  var dismissed = false;
  try { dismissed = localStorage.getItem('viora-install-dismissed') === '1'; } catch (_) {}

  function createPrompt() {
    if (dismissed || document.getElementById('vioraInstallPrompt')) return;
    var wrap = document.createElement('aside');
    wrap.id = 'vioraInstallPrompt';
    wrap.setAttribute('aria-label', 'Install VIORA');
    wrap.style.cssText = 'position:fixed;z-index:10000;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));max-width:440px;margin:0 auto;padding:14px 16px;border:1px solid rgba(120,160,220,.35);border-radius:16px;background:#0A192F;color:#fff;box-shadow:0 12px 40px rgba(0,0,0,.28);display:flex;align-items:center;gap:12px;font:500 14px/1.4 system-ui,sans-serif;';
    var logo = document.createElement('img');
    logo.src = '/viora-icon-192.png';
    logo.alt = 'VIORA Ecosystems';
    logo.width = 48; logo.height = 48;
    logo.decoding = 'async';
    logo.style.cssText = 'width:48px;height:48px;flex:0 0 48px;object-fit:contain;border-radius:12px;background:#fff;padding:3px';
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
      try { localStorage.setItem('viora-install-dismissed','1'); } catch (_) {}
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
    wrap.appendChild(logo); wrap.appendChild(copy); wrap.appendChild(install); wrap.appendChild(close);
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