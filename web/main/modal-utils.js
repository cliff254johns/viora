// main/modal-utils.js
// ═══════════════════════════════════════════════════════════════
//  Modal + Toast + UI primitives
//  Extracted from main.js — zero dependencies on app state.
// ═══════════════════════════════════════════════════════════════

let _ctx = null;

export function initModalUtils(ctx) {
  _ctx = ctx || {};
}

/* ── HTML/attribute escaper ── */
const _ESC_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};
function _esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => _ESC_MAP[c]);
}

/* ── Safe URL check for img src ── */
function _safeImgUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(trimmed)) return trimmed;
  if (/^blob:/i.test(trimmed)) return trimmed;
  return '';
}

/* ═══════════════════════════════════════════════════════════
   LOGO ARGUMENT RESOLVER
   ─────────────────────────────────────────────────────────────
   v8.5 — Callers pass three shapes:
     • getLogoImg(state.data.logoUrl, 'max-height:64px;')   → (url, style)
     • getLogoImg('max-height:64px;')                        → style only
     • getLogoImg()                                          → nothing
   This resolves all three and falls back to state.data.logoUrl.
   ═══════════════════════════════════════════════════════════ */
function _resolveLogoArgs(a, b) {
  let url = '';
  let style = '';

  if (typeof a === 'string' && typeof b === 'string') {
    // (url, style)
    url = a;
    style = b;
  } else if (typeof a === 'string' && (b === undefined || b === null)) {
    // Single argument — decide whether it's a style or a URL.
    const looksLikeStyle = /[;:]/.test(a) && !/^(https?|data|blob|\/|\.|#)/i.test(a);
    if (looksLikeStyle) {
      style = a;
    } else {
      url = a;
    }
  } else if (typeof a === 'string') {
    url = a;
    if (typeof b === 'string') style = b;
  }

  // Fall back to state for the URL when none was given.
  if (!url) {
    const s = (typeof window !== 'undefined' && window.state) || null;
    url = (s && s.data && s.data.logoUrl) || '';
  }

  return { url, style };
}

/* ── Modal stack: tracks body scroll lock + focus restoration ── */
const _modalStack = [];
let _bodyOverflowBefore = '';

function _lockBodyScroll() {
  if (_modalStack.length === 0) {
    _bodyOverflowBefore = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
  }
}
function _unlockBodyScroll() {
  if (_modalStack.length === 0) {
    document.body.style.overflow = _bodyOverflowBefore;
  }
}

/* ═══════════════════════════════════════════════════════════════
   MODAL OPEN / CLOSE
   ═══════════════════════════════════════════════════════════════ */
export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn('[viora] openModal: element not found:', id);
    return;
  }
  el.classList.add('active');
  el.style.display = '';
  el.removeAttribute('aria-hidden');

  if (!_modalStack.some((m) => m.id === id)) {
    _modalStack.push({ id, opener: document.activeElement });
    _lockBodyScroll();
  }

  try {
    window.dispatchEvent(new CustomEvent('viora:modal-opened', { detail: { id } }));
  } catch (e) { /* ignore */ }
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;

  el.classList.remove('active');
  el.style.display = '';
  el.setAttribute('aria-hidden', 'true');

  const inner = el.querySelector(':scope > .modal');
  if (inner) {
    inner.style.transform = '';
    inner.style.opacity = '';
  }

  const idx = _modalStack.findIndex((m) => m.id === id);
  if (idx !== -1) {
    const { opener } = _modalStack[idx];
    _modalStack.splice(idx, 1);
    _unlockBodyScroll();
    if (opener && typeof opener.focus === 'function' && opener.isConnected) {
      try { opener.focus(); } catch (e) { /* ignore */ }
    }
  }

  try {
    window.dispatchEvent(new CustomEvent('viora:modal-closed', { detail: { id } }));
  } catch (e) { /* ignore */ }
}

/* Legacy aliases */
export const showModal = openModal;
export const hideModal = closeModal;

/* ═══════════════════════════════════════════════════════════════
   TOAST + SYNC STATUS
   ═══════════════════════════════════════════════════════════════ */
const TOAST_MAX = 5;

export function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  if (!c) return;

  while (c.children.length >= TOAST_MAX) {
    c.removeChild(c.firstElementChild);
  }

  const el = document.createElement('div');
  el.className = 'toast ' + type;

  const span = document.createElement('span');
  span.textContent = String(msg ?? '');

  const btn = document.createElement('button');
  btn.className = 'toast-close';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Close');
  btn.textContent = '\u00D7';

  el.appendChild(span);
  el.appendChild(btn);

  let timer = null;
  const dismiss = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (el.isConnected) el.remove();
  };
  btn.addEventListener('click', dismiss, { once: true });

  c.appendChild(el);
  timer = setTimeout(dismiss, 5000);
}

/* Cached sync-status refs */
let _syncDotDesktop, _syncDotMobile, _syncLabelDesktop, _syncLabelMobile;
function _ensureSyncRefs() {
  if (_syncDotDesktop === undefined) {
    _syncDotDesktop  = document.getElementById('syncDot');
    _syncDotMobile   = document.getElementById('syncDotMobile');
    _syncLabelDesktop = document.getElementById('syncLabel');
    _syncLabelMobile  = document.getElementById('syncLabelMobile');
  }
}

export function setSyncStatus(status, label) {
  _ensureSyncRefs();
  const cls = 'sync-dot ' + (status || '');
  if (_syncDotDesktop) _syncDotDesktop.className = cls;
  if (_syncDotMobile)  _syncDotMobile.className  = cls;

  const text = label == null ? '' : String(label);
  if (_syncLabelDesktop) _syncLabelDesktop.textContent = text;
  if (_syncLabelMobile)  _syncLabelMobile.textContent  = text;
}

/* ═══════════════════════════════════════════════════════════════
   DIALOG PLUMBING (shared by confirm + prompt)
   ═══════════════════════════════════════════════════════════════ */
function _buildDialog({ icon, title, bodyHtml, footerHtml }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active viora-dialog';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const modal = document.createElement('div');
  modal.className = 'modal viora-dialog__modal';

  const h2 = document.createElement('h2');
  h2.className = 'viora-dialog__title';
  if (icon) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'modal-icon';
    const i = document.createElement('i');
    i.className = 'fa-solid ' + icon;
    iconSpan.appendChild(i);
    h2.appendChild(iconSpan);
  }
  h2.appendChild(document.createTextNode(' ' + (title || '')));

  const p = document.createElement('p');
  p.className = 'viora-dialog__body';
  p.innerHTML = bodyHtml;

  const actions = document.createElement('div');
  actions.className = 'form-actions viora-dialog__actions';
  actions.innerHTML = footerHtml;

  modal.appendChild(h2);
  modal.appendChild(p);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  return { overlay, modal, actions };
}

function _trapFocus(overlay) {
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const focusables = overlay.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  overlay.addEventListener('keydown', onKey);
  return () => overlay.removeEventListener('keydown', onKey);
}

/* ═══════════════════════════════════════════════════════════════
   CONFIRM + PROMPT
   ═══════════════════════════════════════════════════════════════ */
export function vioraConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const { overlay, modal, actions } = _buildDialog({
      icon: options.icon || 'fa-triangle-exclamation',
      title: options.title || 'Confirm',
      bodyHtml: _esc(message),
      footerHtml:
        `<button type="button" class="btn btn-outline" data-act="cancel">${_esc(options.cancelLabel || 'Cancel')}</button>` +
        `<button type="button" class="btn ${options.confirmClass || 'btn-danger'}" data-act="confirm">${_esc(options.confirmLabel || 'Confirm')}</button>`
    });

    requestAnimationFrame(() => {
      const btn = modal.querySelector('[data-act="confirm"]');
      if (btn) btn.focus();
    });

    const untrap = _trapFocus(overlay);

    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      untrap();
      document.removeEventListener('keydown', onDocKey, true);
      overlay.remove();
      resolve(v);
    };

    const onDocKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    };
    document.addEventListener('keydown', onDocKey, true);

    overlay.addEventListener('click', (e) => {
      if (!e.target.closest('.viora-dialog__modal')) { finish(false); return; }
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'cancel')  { finish(false); return; }
      if (a === 'confirm') { finish(true);  return; }
    });
  });
}

export function vioraPrompt(message, expected, options = {}) {
  return new Promise((resolve) => {
    const { overlay, modal, actions } = _buildDialog({
      icon: options.icon || 'fa-keyboard',
      title: options.title || 'Type to confirm',
      bodyHtml: _esc(message),
      footerHtml:
        `<button type="button" class="btn btn-outline" data-act="cancel">Cancel</button>` +
        `<button type="button" class="btn btn-danger" data-act="confirm">Confirm</button>`
    });

    const input = document.createElement('input');
    input.className = 'viora-dialog__input';
    input.type = 'text';
    input.placeholder = 'Type: ' + (expected ?? '');
    input.autocomplete = 'off';
    input.spellcheck = false;
    modal.insertBefore(input, actions);

    const untrap = _trapFocus(overlay);

    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      untrap();
      document.removeEventListener('keydown', onDocKey, true);
      overlay.remove();
      resolve(v);
    };

    const onDocKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(null); }
    };
    document.addEventListener('keydown', onDocKey, true);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(input.value); }
    });

    overlay.addEventListener('click', (e) => {
      if (!e.target.closest('.viora-dialog__modal')) { finish(null); return; }
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'cancel')  { finish(null); return; }
      if (a === 'confirm') { finish(input.value); return; }
    });

    requestAnimationFrame(() => input.focus());
  });
}

/* ═══════════════════════════════════════════════════════════════
   LOGO HELPERS
   ═══════════════════════════════════════════════════════════════ */
function _makeBrandImg(url, height, extraClass = '') {
  const img = document.createElement('img');
  img.src = _safeImgUrl(url);
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.className = ('brand-logo ' + extraClass).trim();
  img.style.height = height + 'px';
  img.style.width = 'auto';
  img.style.objectFit = 'contain';
  return img;
}

/* ═══════════════════════════════════════════════════════════════
   applyLogoEverywhere
   ─────────────────────────────────────────────────────────────
   Repaints every top-level brand surface:
     • #sidebarBrandMain
     • #mabBrand
     • #loginLogoMark

   Callers pass (url), (url, version), or nothing. The resolver
   falls back to state.data.logoUrl.
   ═══════════════════════════════════════════════════════════ */
export function applyLogoEverywhere(a, b) {
  let url = '';
  let appVersion = '';

  if (typeof a === 'string') {
    if (/^[\d.]+$/.test(a)) appVersion = a;   // looks like "3.7.1"
    else url = a;
  }
  if (typeof b === 'string' && /^[\d.]+$/.test(b)) appVersion = b;
   if (!appVersion) appVersion = _ctx?.state?.appVersion || '';

  if (!url) {
    const s = (typeof window !== 'undefined' && window.state) || null;
    url = (s && s.data && s.data.logoUrl) || '';
  }
  const safeUrl = _safeImgUrl(url);

  /* ── Sidebar ── */
  const sb = document.getElementById('sidebarBrandMain');
  if (sb) {
    sb.replaceChildren();
    if (safeUrl) {
      sb.appendChild(_makeBrandImg(safeUrl, 32));
    } else {
      const icon = document.createElement('span');
      icon.className = 'brand-icon';
      icon.textContent = '⚡';
      sb.appendChild(icon);
    }
    sb.appendChild(document.createTextNode(' VIORA '));
       if (appVersion) {
      const ver = document.createElement('span');
      ver.className = 'brand-version';
      ver.textContent = 'v' + appVersion;
      sb.appendChild(ver);
    }
  }

  /* ── Mobile app bar ── */
  const mb = document.getElementById('mabBrand');
  if (mb) {
    mb.replaceChildren();
    if (safeUrl) {
      mb.appendChild(_makeBrandImg(safeUrl, 26));
    } else {
      const i = document.createElement('i');
      i.className = 'fa-solid fa-bolt brand-icon';
      mb.appendChild(i);
    }
    const label = document.createElement('span');
    label.textContent = 'VIORA';
    mb.appendChild(label);
  }

  /* ── Login mark ── */
  const lm = document.getElementById('loginLogoMark');
  if (lm) {
    lm.replaceChildren();
    if (safeUrl) {
      const img = document.createElement('img');
      img.src = safeUrl;
      img.alt = '';
      img.decoding = 'async';
      img.className = 'login-logo';
      lm.appendChild(img);
    } else {
      lm.textContent = 'VI';
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   getLogoImg
   ─────────────────────────────────────────────────────────────
   Returns an HTML string <img> (or the "VI" fallback span) for
   embedding inside innerHTML templates.

   Accepts:
     getLogoImg()                                  → uses state
     getLogoImg('max-height:64px;')                → uses state + style
     getLogoImg(state.data.logoUrl)                → uses arg as URL
     getLogoImg(state.data.logoUrl, 'max-height:64px;')  → both
   ═══════════════════════════════════════════════════════════ */
export function getLogoImg(a, b) {
  const { url: rawUrl, style } = _resolveLogoArgs(a, b);
  const url = _safeImgUrl(rawUrl);

  if (!url) {
    return '<span class="logo-fallback" style="' + _esc(style) + '">VI</span>';
  }

  return (
    '<img src="' + _esc(url) + '" alt="" ' +
    'style="max-height:48px;width:auto;object-fit:contain;' + _esc(style) + '" />'
  );
}
