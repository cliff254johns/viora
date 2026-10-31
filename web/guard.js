/* ═══════════════════════════════════════════════════════════════
   VIORA — Universal subscription guard
   Drop this in every product. It self-boots.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Config ─────────────────────────────────────────────────── */
  const SUB_PATH = 'viora_data/orgs/viora/subscriptions';
  const DB_URL   = 'https://cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app';
  const PORTAL   = 'https://viora.co.ke/client.html';
  const WHATSAPP = '254713428774';
  const EMAIL    = 'cliff254johns@gmail.com';
  const DEFAULT_GRACE_HOURS = 72;

  /* ── Fast path: if product explicitly opted out, do nothing ── */
  if (window.VIORA_GUARD_DISABLED === true) return;

  /* ── Identify the subscription from the URL ─────────────────── */
  const qs = new URLSearchParams(location.search);
  const subId      = qs.get('subscriptionId') || qs.get('sub');
  const licenseKey = qs.get('key') || localStorage.getItem('viora_license_key');
  const clientSlug = qs.get('tenant') || qs.get('slug');

  if (!subId && !licenseKey && !clientSlug) {
    // No identity → show "not activated" overlay
    return showOverlay({
      title: 'Not activated',
      message: 'This installation is missing its activation link. Contact your VIORA project lead.',
      recoverable: true
    });
  }

  /* ── Fetch + subscribe (REST + polling — no Firebase SDK) ───── */
  let currentSub  = null;
  let currentEval = { allowed: false, reason: 'loading' };
  let resolvedId  = subId || null;
  let stopped     = false;

  async function fetchJson(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  async function resolveId() {
    if (resolvedId) return resolvedId;

    // Fetch all subscriptions once, match by key/slug
    const all = await fetchJson(`${DB_URL}/${SUB_PATH}.json?cb=${Date.now()}`);
    if (!all) return null;
    for (const [id, s] of Object.entries(all)) {
      if (!s) continue;
      if (licenseKey && s.licenseKey === licenseKey) return id;
      if (clientSlug && s.clientSlug === clientSlug) return id;
    }
    return null;
  }

  function evaluate(sub, now) {
    if (!sub) return { allowed: false, reason: 'missing' };
    if (sub.status === 'cancelled') return { allowed: false, reason: 'cancelled' };
    if (sub.status === 'suspended') return { allowed: false, reason: 'suspended' };
    if (sub.status === 'pending_payment') return { allowed: false, reason: 'pending_payment' };
    if (sub.plan === 'lifetime') return { allowed: true, reason: 'lifetime' };

    const endMs = Date.parse(sub.endDate || '');
    if (!Number.isFinite(endMs)) return { allowed: false, reason: 'invalid' };

    const graceMs = (Number(sub.graceHours) || DEFAULT_GRACE_HOURS) * 3600000;

    if (now <= endMs) {
      return {
        allowed: true, reason: 'active', inGrace: false,
        msRemaining: endMs - now,
        daysRemaining: Math.ceil((endMs - now) / 86400000)
      };
    }
    if (now <= endMs + graceMs) {
      return {
        allowed: true, reason: 'grace', inGrace: true,
        msRemaining: endMs + graceMs - now,
        daysRemaining: 0
      };
    }
    return { allowed: false, reason: 'expired', daysRemaining: 0 };
  }

  function reasonToMessage(reason, sub) {
    const product = (sub && sub.productName) || 'this software';
    switch (reason) {
      case 'expired':
        return { title: 'Subscription Expired',
                 message: `Your subscription to ${product} has ended. Renew to continue using it.`,
                 showRenew: true };
      case 'suspended':
        return { title: 'Account Suspended',
                 message: 'Your VIORA account has been suspended. Contact your project lead.',
                 recoverable: true };
      case 'cancelled':
        return { title: 'Subscription Cancelled',
                 message: 'This subscription has been cancelled. Contact your project lead to reactivate.',
                 recoverable: true };
      case 'pending_payment':
        return { title: 'Payment Pending',
                 message: 'Your first payment is still processing. This software will unlock automatically once payment is confirmed.' };
      default:
        return { title: 'Access Denied',
                 message: 'No active subscription found for this installation.',
                 recoverable: true };
    }
  }

  async function check() {
    if (stopped) return;
    try {
      const id = await resolveId();
      if (!id) {
        showOverlay({
          title: 'License not found',
          message: 'This license is not active in VIORA. Contact support.',
          recoverable: true
        });
        return;
      }
      resolvedId = id;
      const snap = await fetchJson(`${DB_URL}/${SUB_PATH}/${id}.json?cb=${Date.now()}`);
      currentSub = snap || null;
      currentEval = evaluate(currentSub, Date.now());

      if (currentEval.allowed) {
        hideOverlay();
        /* Grace banner (only shown when inGrace) */
        if (currentEval.inGrace) showGraceBanner(currentSub, currentEval);
        else hideGraceBanner();
        /* Notify app — one-shot */
        if (!window.__vioraGuardReady) {
          window.__vioraGuardReady = true;
          window.dispatchEvent(new CustomEvent('viora:guard-ready', {
            detail: { sub: currentSub, evaluation: currentEval }
          }));
        }
      } else {
        hideGraceBanner();
        showOverlay(reasonToMessage(currentEval.reason, currentSub));
      }
    } catch (e) {
      console.warn('[viora-guard] check failed:', e);
    }
  }

  /* ── Poll: every 60 s. Cheap; single HTTP request. ──────────── */
  check();
  setInterval(check, 60000);

  /* ── Also re-check on tab focus (catches admin flips fast) ──── */
   document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });

  /* Instant re-check when the tab regains focus — makes
     admin approval feel instant instead of 60 s slow. */
  window.addEventListener('focus', () => check());

  /* Also re-check when the user clicks anywhere on the overlay —
     lets them force a refresh without waiting for the timer. */
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#viora-guard-overlay')) check();
  }, true);

  /* ── Expose a tiny API for advanced apps ────────────────────── */
  window.VioraGuard = {
    currentSubscription: () => currentSub,
    currentEvaluation:   () => currentEval,
    checkNow:            check,
    disable:             () => { stopped = true; hideOverlay(); },
    /* Add a small "re-check" link to the overlay for stuck users */
    _showRecheckLink: () => {
      if (!overlay) return;
      if (overlay.querySelector('.sg-recheck')) return;
      const link = document.createElement('button');
      link.className = 'sg-recheck';
      link.textContent = '↻ Re-check now';
      link.style.cssText =
        'margin-top:14px;padding:8px 18px;background:transparent;' +
        'border:1px solid rgba(0,212,255,.4);border-radius:40px;' +
        'color:#7de8ff;font-size:.82rem;cursor:pointer;font-weight:600;';
      link.onclick = check;
      overlay.querySelector('div').appendChild(link);
    }
  };

  /* ═══════════════════════════════════════════════════════════
     Overlay UI
     ═══════════════════════════════════════════════════════════ */
  let overlay = null;
  let graceBanner = null;

  function showOverlay({ title, message, showRenew, recoverable }) {
    if (overlay) {
      overlay.querySelector('.sg-title').textContent = title;
      overlay.querySelector('.sg-message').textContent = message;
      return;
    }
    overlay = document.createElement('div');
    overlay.id = 'viora-guard-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;' +
      'background:radial-gradient(circle at 50% 30%,#10131c 0%,#05060a 100%);' +
      'display:flex;align-items:center;justify-content:center;' +
      'padding:24px;font-family:system-ui,-apple-system,sans-serif;color:#f0f4ff;';

    overlay.innerHTML = `
      <div style="max-width:520px;width:100%;background:rgba(18,18,26,.88);
                  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
                  border:1px solid rgba(0,212,255,.18);border-radius:22px;
                  padding:40px 32px;text-align:center;
                  box-shadow:0 24px 60px rgba(0,0,0,.6);">
        <div style="width:72px;height:72px;border-radius:50%;
                    background:linear-gradient(135deg,#ff5c7c,#a855f7);
                    display:flex;align-items:center;justify-content:center;
                    margin:0 auto 20px;font-size:2rem;color:#fff;">
          <i class="fa-solid fa-lock"></i>
        </div>
        <h2 class="sg-title" style="font-size:1.4rem;font-weight:800;margin-bottom:12px;">
          ${escapeHtml(title)}
        </h2>
        <p class="sg-message" style="font-size:.92rem;line-height:1.6;color:#94a3b8;margin-bottom:24px;">
          ${escapeHtml(message)}
        </p>
        ${showRenew ? `
          <a href="${PORTAL}" target="_blank" rel="noopener"
             style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;
                    background:linear-gradient(135deg,#00d4ff,#7c3aed);color:#fff;
                    border-radius:40px;text-decoration:none;font-weight:700;font-size:.9rem;">
            <i class="fa-solid fa-mobile-screen-button"></i> Renew in Client Portal
          </a>
        ` : ''}
        ${recoverable ? `
          <div style="margin-top:20px;padding:12px;background:rgba(255,200,87,.08);
                      border-left:3px solid #ffc857;border-radius:8px;
                      font-size:.8rem;color:#fcd34d;text-align:left;">
            <strong>Need help?</strong><br>
            WhatsApp: <a href="https://wa.me/${WHATSAPP}" style="color:#7de8ff;">+254 713 428 774</a><br>
            Email: <a href="mailto:${EMAIL}" style="color:#7de8ff;">${EMAIL}</a>
          </div>
        ` : ''}
      </div>`;
     document.body.appendChild(overlay);
    document.documentElement.style.overflow = 'hidden';
    /* Add a manual re-check button so users can force a refresh
       if they think the sub has just been approved. */
    try { window.VioraGuard?._showRecheckLink?.(); } catch (_) {}
  }

  function hideOverlay() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.documentElement.style.overflow = '';
  }

  function showGraceBanner(sub, ev) {
    if (graceBanner) return;
    const h = Math.max(1, Math.ceil(ev.msRemaining / 3600000));
    graceBanner = document.createElement('div');
    graceBanner.id = 'viora-guard-grace';
    graceBanner.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:2147483646;' +
      'background:linear-gradient(90deg,#ff5c7c,#ffc857);color:#fff;' +
      'padding:10px 16px;text-align:center;font-family:system-ui,sans-serif;' +
      'font-size:.85rem;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.4);';
    graceBanner.innerHTML =
      `⚠️ Grace period — ${escapeHtml(sub.productName || 'your subscription')} ` +
      `locks in ${h}h. <a href="${PORTAL}" target="_blank" rel="noopener" ` +
      `style="color:#fff;text-decoration:underline;margin-left:6px;">Renew now</a>`;
    document.body.appendChild(graceBanner);
    document.body.style.paddingTop = '40px';
  }

  function hideGraceBanner() {
    if (!graceBanner) return;
    graceBanner.remove();
    graceBanner = null;
    document.body.style.paddingTop = '';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
})();
