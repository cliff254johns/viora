/* ═══════════════════════════════════════════════════════════════
   VIORA CLIENT PORTAL — client-app.js v5.0
   Self-contained module. Zero external dependencies except Firebase.

   v5.0 changes:
     • Open App button — launches the subscribed software via
       LAUNCH_URLS[productId] (or sub.launchUrl if set by admin).
     • Renewal now sends a request to the admin via
       subscriptionRequests/{id} with kind:'renewal'. Approval
       extends the subscription and flips the button back to
       Open App automatically.
     • Renew button appears only ≤7 days before expiry or during
       grace (was ≤30 days — too early, was ignored by clients).
     • Button states: Open App · Awaiting Approval · Renew ·
       Renew on Marketplace (expired / no launch URL).
     • Old _pRenewSub (which opened the marketplace) removed.
   ═══════════════════════════════════════════════════════════════ */

import { initializeApp } from "firebase/app";
import {
  getDatabase, ref, onValue, set, get, update, remove
} from "firebase/database";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut, setPersistence,
  browserSessionPersistence, inMemoryPersistence
} from "firebase/auth";

/* ─── Firebase config ─── */
const firebaseConfig = {
  apiKey: "AIzaSyC9gCBt-xR8t9n6rTGNvDZ5usUGiW-Dqxc",
  authDomain: "cliffclient-35ec5.firebaseapp.com",
  databaseURL: "https://cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cliffclient-35ec5",
  storageBucket: "cliffclient-35ec5.firebasestorage.app",
  messagingSenderId: "519782791696",
  appId: "1:519782791696:web:6e1a654ddeed14b72b2895",
  measurementId: "G-G0NB6JGQVF"
};

const app  = initializeApp(firebaseConfig, "viora-portal-v4");
const db   = getDatabase(app);
const auth = getAuth(app);

const WORKER_URL = "https://viora-api.cliff254johns.workers.dev";
const ROOT = 'viora_data';
const ORG  = 'orgs/viora';
const P = (path) => `${ROOT}/${ORG}/${String(path).replace(/^\/+|\/+$/g, '')}`;

/* ─── State ─── */
const S = {
  uid: null,
  email: null,
  clientId: null,
  client: null,

  projects: [],
  invoices: [],
  payments: [],
  appointments: [],
  presentations: [],
  tickets: [],
  subscriptions: [],
  subscriptionRequests: [],
  trainingEnrollments: {},
  trainingProgress: {},
  trainingCourses: [],
  trainingCertificates: [],
    products: [],
  orders: [],
  _marketFilter: 'all',
  _marketSearch: '',
  _viewingMarketItem: null,

  documents: [],
  _rawDocuments: [],
  _rawPresentations: [],
  clientUploads: {},

  activeTicketId: null,
  activeTicketUnsub: null,
  uploading: false,
  pendingWatch: null,
  _pendingPoll: null,
  pendingPollCount: 0,

  charts: {},
  aiHistory: [],
  filePreview: null,
  unsubs: [],
  liveSync: true,

  _docFilter: 'all',
  _presFilter: 'all',
  _firstRenderDone: false,
  _pendingStkInvoiceId: null,
  _viewingInvoiceId: null,
  _lockActive: false,
};

/* ─── Utilities ─── */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtKES = (n) => 'KSh ' + Number(n || 0).toLocaleString('en-US',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00');
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-GB',
    { day: '2-digit', month: 'short', year: 'numeric' });
};

const timeAgo = (iso) => {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
};

const fmtBytes = (b) => {
  if (!b) return '0 B';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
};

const fileIcon = (name, mime) => {
  const n = String(name || '').toLowerCase();
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(n)) return 'fa-file-image';
  if (m === 'application/pdf' || /\.pdf$/.test(n)) return 'fa-file-pdf';
  if (m.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/.test(n)) return 'fa-file-video';
  if (m.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/.test(n)) return 'fa-file-audio';
  if (/\.(xls|xlsx|csv|ods)$/.test(n)) return 'fa-file-excel';
  if (/\.(doc|docx|odt|rtf)$/.test(n)) return 'fa-file-word';
  if (/\.(ppt|pptx|odp|key)$/.test(n)) return 'fa-file-powerpoint';
  if (m.startsWith('text/') || /\.(txt|md|log)$/.test(n)) return 'fa-file-lines';
  if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return 'fa-file-zipper';
  return 'fa-file';
};

const fileIconEmoji = (name, mime) => {
  const map = {
    'fa-file-image': '🖼️', 'fa-file-pdf': '📕', 'fa-file-video': '🎬',
    'fa-file-audio': '🎵', 'fa-file-excel': '📊', 'fa-file-word': '📄',
    'fa-file-powerpoint': '📑', 'fa-file-lines': '📝', 'fa-file-zipper': '🗜️'
  };
  return map[fileIcon(name, mime)] || '📎';
};

const isMobile = () => window.matchMedia('(max-width: 899px)').matches;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const getTextColor = () => getComputedStyle(document.documentElement)
  .getPropertyValue('--text-primary').trim() || '#f0f4ff';

function toast(msg, type = 'info') {
  const c = $('pToastContainer');
  if (!c) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span>${esc(msg)}</span><button class="toast-close">&times;</button>`;
  el.querySelector('.toast-close').onclick = () => el.remove();
  c.appendChild(el);
  setTimeout(() => el.remove(), 5200);
}

function showLoginMessage(msg, type = 'info') {
  const el = $('loginMessage');
  if (!el) return;
  el.className = 'login-message ' + type;
  el.textContent = msg;
}
function clearLoginMessage() {
  const el = $('loginMessage');
  if (!el) return;
  el.className = 'login-message';
  el.textContent = '';
}

function openPModal(id) { $(id)?.classList.add('active'); }
function closePModal(id) { $(id)?.classList.remove('active'); }

document.querySelectorAll('[data-pclose]').forEach(b =>
  b.addEventListener('click', () => closePModal(b.dataset.pclose)));
document.querySelectorAll('.modal-overlay').forEach(m =>
  m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('active'); }));

/* ─── Money helpers ─── */
function invoiceTotal(inv) {
  const sub = (inv.items || []).reduce((s, i) => s + Number(i.amount || 0), 0)
    + (inv.extraCharges || []).reduce((s, c) => s + Number(c.amount || 0), 0);
  return sub + sub * (Number(inv.tax || 0) / 100);
}
function invoicePaid(invId) {
  return S.payments.reduce((sum, p) =>
    sum + (p.allocations || [])
      .filter((a) => a.invoiceId === invId)
      .reduce((s, a) => s + Number(a.amount || 0), 0), 0);
}
function projectAgreedTotal(projectId) {
  const p = S.projects.find((x) => x.id === projectId);
  if (!p) return 0;
  const explicit = Number(p.agreedTotal || 0);
  if (explicit > 0) return explicit;
  return (p.installments || []).reduce((s, i) => s + Number(i.amount || 0), 0);
}
function projectPaidTotal(projectId) {
  return S.payments
    .filter((p) => p.projectId === projectId)
    .reduce((s, p) => s + Number(p.amount || 0), 0);
}
function clientAgreedTotal() {
  return S.projects
    .filter((p) => p.status !== 'cancelled')
    .reduce((s, p) => s + projectAgreedTotal(p.id), 0);
}
function clientPaidTotal() {
  return S.projects
    .filter((p) => p.status !== 'cancelled')
    .reduce((s, p) => s + projectPaidTotal(p.id), 0);
}

/* ═══════════════════════════════════════════════════════════════
   SUBSCRIPTION HELPERS
   ═══════════════════════════════════════════════════════════════ */
const PLAN_LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', lifetime: 'Lifetime' };

/* ─── Subscription launch URLs ─── */
const LAUNCH_URLS = {
  'pos':                'https://viora.co.ke/pos.html',
  'viora-pos':          'https://viora.co.ke/pos.html',
  'viora-crm':          'https://viora.co.ke/crm.html',
  'viora-erp':          'https://viora.co.ke/erp.html',
  'viora-inventory':    'https://viora.co.ke/inventory.html',
  'viora-invoicing':    'https://viora.co.ke/invoicing.html',
  'viora-payroll':      'https://viora.co.ke/payroll.html',
  'viora-booking':      'https://viora.co.ke/booking.html',
  'viora-education':    'https://viora.co.ke/education.html',
  'viora-marketplace':  'https://viora.co.ke/market.html',
  'viora-track':        'https://viora.co.ke/track.html',
  'viora-training':     'https://viora.co.ke/training.html'
};

/**
 * Resolve the launch URL for a subscription.
 *
 * Priority:
 *   1. If product.liveUrl template changed since the sub was created,
 *      re-resolve it with the sub's stored identifiers. This means
 *      admin template updates propagate to all clients automatically.
 *   2. Otherwise, use sub.launchUrl (already resolved at approval time).
 *   3. Fallback: resolve from product.liveUrl live (for old subs that
 *      never had launchUrl stamped).
 *
 * Returns null if no template exists → "Coming Soon" shown.
 */
function subscriptionLaunchUrl(sub) {
  if (!sub) return null;

  /* Look up the current product to see if its template changed */
  const pid = String(sub.productId || sub._planSnapshot?.productId || '').trim();
  const product = pid ? (S.products || []).find(p => p && p.id === pid) : null;
  const currentTemplate = product && typeof product.liveUrl === 'string'
    ? product.liveUrl.trim()
    : '';

  /* If the template changed since this sub was created, re-resolve */
  if (currentTemplate && currentTemplate !== (sub.launchUrlTemplate || '')) {
    const resolved = resolveLaunchUrlTemplate(currentTemplate, {
      clientId:       sub.clientId || '',
      subscriptionId: sub.id || '',
      clientEmail:    sub.clientEmail || '',
      clientSlug:     sub.clientSlug || clientSlugFromName(sub.clientName || ''),
      licenseKey:     sub.licenseKey || '',
    });
    if (resolved) return resolved;
  }

  /* No template change → use the stored URL */
  if (typeof sub.launchUrl === 'string' && sub.launchUrl.trim()) {
    return sub.launchUrl.trim();
  }

  /* Legacy fallback for subs created before this feature shipped */
  if (typeof sub.productUrl === 'string' && sub.productUrl.trim()) {
    return sub.productUrl.trim();
  }

  /* Last resort: resolve the current template live */
  if (currentTemplate) {
    return resolveLaunchUrlTemplate(currentTemplate, {
      clientId:       sub.clientId || '',
      subscriptionId: sub.id || '',
      clientEmail:    sub.clientEmail || '',
      clientSlug:     sub.clientSlug || clientSlugFromName(sub.clientName || ''),
      licenseKey:     sub.licenseKey || '',
    });
  }

  return null;
}

/* Same slug function as the admin side so URLs match */
function clientSlugFromName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'client';
}

function resolveLaunchUrlTemplate(template, ctxData) {
  if (!template || typeof template !== 'string') return null;
  const c = ctxData || {};
  return template
    .replace(/\{clientId\}/g,       encodeURIComponent(String(c.clientId || '')))
    .replace(/\{subscriptionId\}/g, encodeURIComponent(String(c.subscriptionId || '')))
    .replace(/\{clientEmail\}/g,    encodeURIComponent(String(c.clientEmail || '')))
    .replace(/\{clientSlug\}/g,     encodeURIComponent(String(c.clientSlug || 'client')))
    .replace(/\{licenseKey\}/g,     encodeURIComponent(String(c.licenseKey || '')));
}
function openSubscriptionSoftware(sub) {
  const url = subscriptionLaunchUrl(sub);
  if (!url) {
    toast('This product is not live yet. Please contact your project lead to get started.', 'info');
    return;
  }
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) toast('Pop-up blocked — allow pop-ups to open your software.', 'warning');
}

window._pOpenSub = (productId) => {
  const sub = S.subscriptions.find((s) => s.productId === productId);
  if (sub) openSubscriptionSoftware(sub);
};

/* ─── Renewal request helpers ─── */
function hasPendingRenewal(sub) {
  if (!sub) return false;
  return (S.subscriptionRequests || []).some(r =>
    r &&
    r.status === 'pending' &&
    r.kind === 'renewal' &&
    r.subscriptionId === sub.id
  );
}

window._pRequestRenewal = async (subscriptionId) => {
  const sub = S.subscriptions.find(s => s.id === subscriptionId);
  if (!sub) { toast('Subscription not found.', 'error'); return; }

  if (hasPendingRenewal(sub)) {
    toast('You already have a pending renewal request. Please wait for admin approval.', 'warning');
    return;
  }

  const requestId = 'req-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const request = {
    id: requestId,
    kind: 'renewal',
    subscriptionId: sub.id,
    productId: sub.productId || '',
    productName: sub.productName || sub.productId || '',
    planId: sub._planSnapshot?.productId || sub.productId || '',
    planSnapshot: sub._planSnapshot || null,
    clientId: S.clientId || '',
    clientName: S.client?.name || '',
    clientEmail: S.email || '',
    clientPhone: S.client?.phone || '',
    notes: `Renewal request for ${sub.productName || sub.productId}`,
    status: 'pending',
    requestedAt: new Date().toISOString(),
    requestedBy: S.uid
  };

  try {
    await set(ref(db, P(`subscriptionRequests/${requestId}`)), request);

    try {
      const notifId = 'notif-' + Date.now().toString(36);
      await set(ref(db, `viora_data/orgs/viora/notifications/${notifId}`), {
        id: notifId,
        title: '🔁 Renewal request',
        body: `${S.client?.name || S.email} wants to renew ${sub.productName || sub.productId}`,
        icon: 'fa-rotate',
        level: 'warning',
        url: '/main.html#subscription-plans',
        source: 'subscription-renewal-request',
        ts: new Date().toISOString(),
        read: false
      });
    } catch (e) { /* non-fatal */ }

    toast('Renewal request sent. Admin will approve it shortly.', 'success');

    /* Optimistic local update so the button flips to "Awaiting Approval"
       immediately without waiting for the realtime round-trip. */
    if (!Array.isArray(S.subscriptionRequests)) S.subscriptionRequests = [];
    S.subscriptionRequests.push(request);
    renderOverview();
    renderMarketplace();
  } catch (e) {
    toast('Could not send renewal request: ' + (e.message || 'unknown'), 'error');
  }
};

function evaluateSub(sub, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  if (!sub) return { allowed: false, reason: 'missing', inGrace: false, msRemaining: null, daysRemaining: null };
  if (sub.status === 'cancelled') return { allowed: false, reason: 'cancelled', inGrace: false, msRemaining: null, daysRemaining: null };
  if (sub.status === 'suspended') return { allowed: false, reason: 'suspended', inGrace: false, msRemaining: null, daysRemaining: null };
  if (sub.status === 'pending_payment') return { allowed: false, reason: 'pending_payment', inGrace: false, msRemaining: null, daysRemaining: null };
  if (sub.plan === 'lifetime') return { allowed: true, reason: 'lifetime', inGrace: false, msRemaining: null, daysRemaining: null };
  const endMs = Date.parse(sub.endDate || '');
  if (!Number.isFinite(endMs)) return { allowed: false, reason: 'invalid', inGrace: false, msRemaining: null, daysRemaining: null };
  const graceHours = Number(sub.graceHours) || 72;
  const graceMs = graceHours * 3600000;
  if (now <= endMs) {
    const ms = endMs - now;
    return { allowed: true, reason: 'active', inGrace: false, msRemaining: ms, daysRemaining: Math.ceil(ms / 86400000) };
  }
  if (now <= endMs + graceMs) {
    const ms = endMs + graceMs - now;
    return { allowed: true, reason: 'grace', inGrace: true, msRemaining: ms, daysRemaining: 0 };
  }
  return { allowed: false, reason: 'expired', inGrace: false, msRemaining: 0, daysRemaining: 0 };
}

function subPill(sub, ev) {
  if (sub.plan === 'lifetime') return { cls: 'paid', label: 'Lifetime' };
  if (!ev.allowed) {
    if (sub.status === 'suspended') return { cls: 'pending', label: 'Suspended' };
    if (sub.status === 'cancelled') return { cls: 'gray', label: 'Cancelled' };
    if (sub.status === 'pending_payment') return { cls: 'pending', label: 'Awaiting Payment' };
    return { cls: 'overdue', label: 'Expired' };
  }
  if (ev.inGrace) {
    const h = Math.max(1, Math.ceil(ev.msRemaining / 3600000));
    return { cls: 'overdue', label: `Grace · ${h}h left` };
  }
  if (ev.daysRemaining != null && ev.daysRemaining <= 7) {
    return { cls: 'pending', label: `Expires in ${ev.daysRemaining}d` };
  }
  return { cls: 'paid', label: 'Active' };
}

function subAlertLines(subs, now) {
  const lines = [];
  for (const s of subs) {
    const ev = evaluateSub(s, now);
    if (s.plan === 'lifetime') continue;
    if (!ev.allowed) {
      if (s.status === 'suspended') continue;
      lines.push({
        kind: 'danger',
        icon: 'fa-triangle-exclamation',
        text: `Subscription <strong>${esc(s.productName || s.productId)}</strong> has <strong>expired</strong>. Request a renewal to keep using it.`,
      });
    } else if (ev.inGrace) {
      const h = Math.max(1, Math.ceil(ev.msRemaining / 3600000));
      lines.push({
        kind: 'danger',
        icon: 'fa-hourglass-half',
        text: `Subscription <strong>${esc(s.productName || s.productId)}</strong> is in its <strong>grace period</strong> — ${h}h left.`,
      });
    } else if (ev.daysRemaining != null && ev.daysRemaining <= 7) {
      lines.push({
        kind: 'warning',
        icon: 'fa-bell',
        text: `Subscription <strong>${esc(s.productName || s.productId)}</strong> renews in <strong>${ev.daysRemaining} day${ev.daysRemaining === 1 ? '' : 's'}</strong> (${fmtDate(s.endDate)}).`,
      });
    }
  }
  return lines;
}

/* ═══════════════════════════════════════════════════════════════
   AUTH
   ═══════════════════════════════════════════════════════════════ */
(async () => {
  try {
    await setPersistence(auth, browserSessionPersistence);
  } catch (e) {
    try { await setPersistence(auth, inMemoryPersistence); } catch (_) {}
  }
  onAuthStateChanged(auth, (user) => {
    handleAuthState(user).catch((err) => {
      console.error('[viora] auth handler failed:', err);
      $('portalLogin')?.classList.remove('hidden');
      window.vioraHidePreloader?.();
    });
  });
})();

async function handleAuthState(user) {
  if (S.pendingWatch) { try { S.pendingWatch(); } catch (e) {} S.pendingWatch = null; }
  if (S._pendingPoll) { try { clearInterval(S._pendingPoll); } catch (e) {} S._pendingPoll = null; }

  if (!user) {
    $('portalLogin').classList.remove('hidden');
    $('portalShell').classList.remove('visible');
    $('pendingScreen').classList.remove('active');
    window.vioraHidePreloader?.();
    return;
  }

  S.uid = user.uid;
  S.email = user.email;

  let bridge = null;
  try {
    const snap = await get(ref(db, P(`portalUsers/${user.uid}`)));
    bridge = snap.exists() ? snap.val() : null;
  } catch (e) {}

  if (!bridge || bridge.active !== true) {
    $('portalLogin').classList.add('hidden');
    $('portalShell').classList.remove('visible');

    try {
      const reqSnap = await get(ref(db, P(`portalRequests/${user.uid}`)));
      const req = reqSnap.exists() ? reqSnap.val() : null;
      $('pendingName').textContent = (req && req.name) || user.email || 'there';
    } catch (e) {
      $('pendingName').textContent = user.email || 'there';
    }
    $('pendingScreen').classList.add('active');

    const acceptBridge = (v) => {
      if (!v) return null;
      if (v.active === true && v.clientId) return v;
      if (v.status === 'approved' && v.clientId) return { ...v, active: true };
      return null;
    };

    const tryStart = (v) => {
      const ok = acceptBridge(v);
      if (!ok) return false;
      if (S.pendingWatch) { try { S.pendingWatch(); } catch (e) {} S.pendingWatch = null; }
      if (S._pendingPoll) { try { clearInterval(S._pendingPoll); } catch (e) {} S._pendingPoll = null; }
      S.clientId = ok.clientId;
      $('pendingScreen').classList.remove('active');
      startPortalSession(ok);
      return true;
    };

    S.pendingWatch = onValue(ref(db, P(`portalUsers/${user.uid}`)), (snap) => {
      tryStart(snap.exists() ? snap.val() : null);
    });

    S.pendingPollCount = 0;
    S._pendingPoll = setInterval(async () => {
      S.pendingPollCount++;
      try {
        const [u, r] = await Promise.all([
          get(ref(db, P(`portalUsers/${user.uid}`))),
          get(ref(db, P(`portalRequests/${user.uid}`)))
        ]);
        if (tryStart(u.exists() ? u.val() : null)) return;
        if (tryStart(r.exists() ? r.val() : null)) return;
      } catch (e) {}
      if (S.pendingPollCount >= 90) {
        clearInterval(S._pendingPoll);
        S._pendingPoll = null;
      }
    }, 1000);

    return;
  }

  S.clientId = bridge.clientId;
  startPortalSession(bridge);
}

/* ─── Sign in ─── */
$('pLoginBtn').onclick = async () => {
  const email = $('pEmail').value.trim();
  const password = $('pPassword').value;
  if (!email || !password) { showLoginMessage('Email and password required.', 'error'); return; }

  const btn = $('pLoginBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Signing in…';
  clearLoginMessage();

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    const code = e.code || '';
    let msg = e.message || 'Sign-in failed';
    if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(code))
      msg = 'Incorrect email or password. If this is your first time, use the "First Time" tab.';
    else if (code === 'auth/too-many-requests')
      msg = 'Too many attempts. Please wait a minute.';
    showLoginMessage(msg, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i>&nbsp; Sign In';
  }
};
$('pPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('pLoginBtn').click();
});

/* ─── Register ─── */
$('pRegisterBtn').onclick = async () => {
  const name = $('pRegName').value.trim();
  const email = $('pRegEmail').value.trim().toLowerCase();
  const phone = $('pRegPhone').value.trim();
  const password = $('pRegPassword').value;

  if (!name || name.length < 2) { showLoginMessage('Please enter your full name.', 'error'); return; }
  if (!email || !email.includes('@')) { showLoginMessage('Please enter a valid email.', 'error'); return; }
  if (!password || password.length < 6) { showLoginMessage('Password must be at least 6 characters.', 'error'); return; }

  const btn = $('pRegisterBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Creating account…';
  clearLoginMessage();

  let cred = null;
  try {
    cred = await createUserWithEmailAndPassword(auth, email, password);
  } catch (e) {
    const code = e.code || '';
    let msg = e.message || 'Registration failed';
    if (code === 'auth/email-already-in-use')
      msg = 'This email already has an account. Switch to the Sign In tab.';
    else if (code === 'auth/weak-password')
      msg = 'Password too weak. Use 6 or more characters.';
    else if (code === 'auth/invalid-email')
      msg = 'That email address is not valid.';
    showLoginMessage(msg, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-user-plus"></i>&nbsp; Request Portal Access';
    return;
  }

  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Matching your account…';
  let matchedClientId = null;
  try { matchedClientId = await autoMatchClient(name, email, phone); } catch (e) {}

  if (matchedClientId) {
    const bridge = {
      uid: cred.user.uid, email, name, phone,
      clientId: matchedClientId, active: true,
      linkedAt: new Date().toISOString(), linkedBy: 'auto-match'
    };
    try {
      await set(ref(db, P(`portalUsers/${cred.user.uid}`)), bridge);
      await update(ref(db, P(`portalRequests/${cred.user.uid}`)), {
        status: 'approved', clientId: matchedClientId,
        approvedAt: bridge.linkedAt, matchType: 'auto-match'
      }).catch(() => {});
      showLoginMessage(`Welcome, ${name}! Loading your portal…`, 'success');
      S.clientId = matchedClientId;
      startPortalSession(bridge);
      return;
    } catch (e) {
      console.warn('[register] bridge write failed:', e);
    }
  }

  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Sending request…';
  try {
    const token = await cred.user.getIdToken();
    await fetch(`${WORKER_URL}/portal/registerClient`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name, phone })
    });
  } catch (e) {
    console.warn('[register] worker call failed:', e);
  }

  const waitedBridge = await waitForBridge(cred.user.uid, 3000);
  if (waitedBridge && waitedBridge.clientId && waitedBridge.active) {
    showLoginMessage(`Welcome, ${name}! Loading your portal…`, 'success');
    S.clientId = waitedBridge.clientId;
    startPortalSession(waitedBridge);
    return;
  }

  showLoginMessage('Account created. An admin will link you shortly.', 'success');
  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-user-plus"></i>&nbsp; Request Portal Access';
  await handleAuthState(cred.user);
};

async function autoMatchClient(name, email, phone) {
  const normEmail = (s) => String(s || '').toLowerCase().trim();
  const normPhone = (s) => {
    let c = String(s || '').replace(/[^0-9]/g, '');
    if (c.startsWith('0')) c = '254' + c.slice(1);
    if (c && !c.startsWith('254') && c.length === 9) c = '254' + c;
    return c;
  };
  const normName = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');

  try {
    const snap = await get(ref(db, P('entities')));
    if (!snap.exists()) return null;
    const list = Object.values(snap.val() || {}).filter((e) => e && e.type === 'client');
    if (email) {
      const hit = list.find((c) => normEmail(c.email) === normEmail(email));
      if (hit) return hit.id;
    }
    if (phone) {
      const hit = list.find((c) => normPhone(c.phone) === normPhone(phone) || normPhone(c.phoneAlt) === normPhone(phone));
      if (hit) return hit.id;
    }
    if (name) {
      const hits = list.filter((c) => normName(c.name) === normName(name));
      if (hits.length === 1) return hits[0].id;
    }
  } catch (e) {}
  return null;
}

async function waitForBridge(uid, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const snap = await get(ref(db, P(`portalUsers/${uid}`)));
      if (snap.exists()) {
        const v = snap.val();
        if (v && v.clientId) return { ...v, active: true };
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

/* ─── Sign out ─── */
const doSignOut = async () => {
  if (!confirm('Sign out?')) return;
  try { await signOut(auth); } catch (e) {}
  location.reload();
};
$('pendingLogout').onclick = doSignOut;
$('pLogout').onclick = doSignOut;
$('mobileLogoutBtn').onclick = doSignOut;

/* ═══════════════════════════════════════════════════════════════
   PORTAL SESSION
   ═══════════════════════════════════════════════════════════════ */
async function startPortalSession(bridge) {
  $('pWho').textContent = bridge.name || bridge.email || S.email;
  $('portalLogin').classList.add('hidden');
  $('pendingScreen').classList.remove('active');
  $('portalShell').classList.add('visible');

  window.vioraHidePreloader?.();

  await loadEverything();
  attachTabEvents();
  attachActionEvents();
  attachLockEvents();
  initMobileNav();
  startRealtimeSubscriptions();

  requestAnimationFrame(() => {
    S._firstRenderDone = true;
    renderOverview();
    renderPresentations();
    renderDocuments();
  });

  setTimeout(evaluateSoftwareLock, 2000);
  setTimeout(checkSubPurchaseIntent, 800);
  setTimeout(checkRenewIntent, 900);
}

async function loadEverything() {
  try {
    const token = await auth.currentUser.getIdToken();
    const r = await fetch(`${WORKER_URL}/portal/myData`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({})
    });
    if (!r.ok) throw new Error(`Worker ${r.status}`);
    const data = await r.json();
    S.client = data.entity || {};
    S.projects = data.projects || [];
    S.invoices = data.invoices || [];
    S.payments = data.payments || [];
    S.appointments = data.appointments || [];
    S.presentations = data.presentations || [];
    S._rawDocuments = data.documents || [];
    S._rawPresentations = data.presentations || [];
  } catch (e) {
    try {
      const s = await get(ref(db, P(`entities/${S.clientId}`)));
      S.client = s.exists() ? s.val() : {};
    } catch (e2) {
      S.client = {};
    }
  }
  refilterDocuments();
  renderAll();
}

function renderAll() {
  renderOverview();
  renderProjects();
  renderAnalytics();
  renderDocuments();
  renderPresentations();
  renderBilling();
  renderAI();
  renderAppointments();
  renderMessages();
  renderMarketplace();
}

function refilterDocuments() {
  const myProjectIds = new Set(S.projects.map((p) => p.id).filter(Boolean));
  const myPresIds = new Set(S._rawPresentations.map((p) => p.id).filter(Boolean));
  const myEmail = String(S.email || '').toLowerCase();
  const clientEmail = String(S.client?.email || '').toLowerCase();
  const byId = new Map();

  const add = (d, source) => {
    if (!d) return;
    const key = d.id || (d.fileName || '') + '|' + (d.uploadedAt || '');
    if (!key) return;
    const existing = byId.get(key);
    const score = (x) => (x.data ? 2 : 0) + (x.category ? 1 : 0);
    if (!existing) { byId.set(key, { ...d, _source: source }); return; }
    if (score(d) > score(existing)) byId.set(key, { ...existing, ...d, _source: source });
  };

  const entityDocs = Array.isArray(S.client?.documents) ? S.client.documents : [];
  entityDocs.forEach((d) => add(d, 'client'));

  S._rawDocuments.forEach((d) => {
    if (!d) return;
    const shared = String(d.sharedWithEmail || '').toLowerCase();
    const matches =
      (d.clientId && d.clientId === S.clientId) ||
      (d.projectId && myProjectIds.has(d.projectId)) ||
      (d.parentId && myPresIds.has(d.parentId)) ||
      (shared && (shared === myEmail || shared === clientEmail));
    if (matches) add(d, 'vault');
  });

  S._rawPresentations.forEach((p) => {
    if (!p || !Array.isArray(p.attachments)) return;
    p.attachments.forEach((att) => {
      if (!att) return;
      add({
        id: att.id || ('pres-att-' + p.id + '-' + (att.name || '')),
        title: att.name || att.title || 'Attachment',
        fileName: att.name || att.fileName || '',
        mime: att.mime || '',
        size: att.size || 0,
        data: att.data,
        category: 'Presentation',
        uploadedAt: p.updatedAt || p.createdAt || p.date,
        _presentation: { id: p.id, title: p.title, date: p.date }
      }, 'presentation');
    });
  });

  S.documents = [...byId.values()].sort((a, b) =>
    String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''))
  );
}

function startRealtimeSubscriptions() {
  S.unsubs.forEach((u) => { try { u(); } catch (e) {} });
  S.unsubs = [];

  S.unsubs.push(onValue(ref(db, P(`entities/${S.clientId}`)), (snap) => {
    if (!snap.exists()) return;
    S.client = snap.val();
    refilterDocuments();
    renderOverview();
    renderBilling();
    renderDocuments();
    updateLivePulse();
  }));

  S.unsubs.push(onValue(ref(db, P('projects')), (snap) => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.projects = all.filter((p) => p.clientId === S.clientId);
    refilterDocuments();
    renderProjects();
    renderOverview();
    renderAnalytics();
    renderBilling();
    renderDocuments();
    updateLivePulse();
  }));

  S.unsubs.push(onValue(ref(db, P('invoices')), (snap) => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.invoices = all.filter((i) => i.clientId === S.clientId);
    renderBilling();
    renderOverview();
    updateLivePulse();
  }));

  S.unsubs.push(onValue(ref(db, P('payments')), (snap) => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.payments = all.filter((p) => p.clientId === S.clientId);
    renderBilling();
    renderOverview();
    updateLivePulse();
  }));

  S.unsubs.push(onValue(ref(db, P('appointments')), (snap) => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.appointments = all.filter((a) => a.clientId === S.clientId);
    renderAppointments();
    renderOverview();
    updateLivePulse();
  }));

  S.unsubs.push(onValue(ref(db, P('presentations')), (snap) => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    const mine = all.filter((p) => p.clientId === S.clientId);
    S.presentations = mine;
    S._rawPresentations = mine;
    refilterDocuments();
    renderPresentations();
    renderProjects();
    renderDocuments();
    updateLivePulse();
  }));

  S.unsubs.push(onValue(ref(db, P('documents')), (snap) => {
    S._rawDocuments = snap.exists() ? Object.values(snap.val()) : [];
    refilterDocuments();
    renderDocuments();
  }));

  S.unsubs.push(onValue(ref(db, P('tickets')), (snap) => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.tickets = all.filter((t) => t && t.clientId === S.clientId)
      .sort((a, b) => (b.lastMessageAt || b.createdAt || '')
        .localeCompare(a.lastMessageAt || a.createdAt || ''));
    renderMessages();
    updateUnreadBadge();
  }));

  S.unsubs.push(onValue(ref(db, P(`clientUploads/${S.clientId}`)), (snap) => {
    S.clientUploads = snap.exists() ? snap.val() : {};
    renderUploads();
  }));
  
    /* Marketplace products */
  S.unsubs.push(onValue(ref(db, P('products')), (snap) => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.products = all.filter((p) => p && (p.status || 'active') === 'active');
    renderMarketplace();
  }));

  /* Marketplace orders */
  S.unsubs.push(onValue(ref(db, P('orders')), (snap) => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    const email = (S.email || '').toLowerCase();
    S.orders = all.filter((o) => (o.customerEmail || '').toLowerCase() === email);
    renderMarketplace();
  }));

  /* Subscriptions */
  S.unsubs.push(onValue(ref(db, P('subscriptions')), (snap) => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.subscriptions = all.filter((s) => s && s.clientId === S.clientId);
    renderOverview();
    updateLivePulse();
    evaluateSoftwareLock();
  }));

  /* My subscription requests (so we can show pending state) */
  S.unsubs.push(onValue(ref(db, P('subscriptionRequests')), (snap) => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.subscriptionRequests = all.filter((r) => r && r.clientId === S.clientId);
    renderOverview();
    renderMarketplace();
  }));

  /* Training */
  S.unsubs.push(onValue(ref(db, P(`training/enrollments/${S.uid}`)), (snap) => {
    S.trainingEnrollments = snap.exists() ? snap.val() : {};
    renderOverview();
  }));

  S.unsubs.push(onValue(ref(db, P(`training/progress/${S.uid}`)), (snap) => {
    S.trainingProgress = snap.exists() ? snap.val() : {};
    renderOverview();
  }));

  S.unsubs.push(onValue(ref(db, P('training/courses')), (snap) => {
    S.trainingCourses = snap.exists() ? Object.values(snap.val()) : [];
    renderOverview();
  }));

  S.unsubs.push(onValue(ref(db, P('training/certificates')), (snap) => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.trainingCertificates = all.filter((c) => c && c.uid === S.uid);
    renderOverview();
  }));

  S.unsubs.push(onValue(ref(db, '.info/connected'), (snap) => {
    S.liveSync = snap.val() === true;
    updateLivePulse();
  }));
}

function updateLivePulse() {
  const pulse = document.querySelector('.live-sync .pulse-dot');
  if (pulse) pulse.style.background = S.liveSync ? 'var(--accent-green)' : 'var(--accent-red)';
}

/* ═══════════════════════════════════════════════════════════════
   TABS + NAV
   ═══════════════════════════════════════════════════════════════ */
function attachTabEvents() {
  document.querySelectorAll('.ptab-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.ptab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.ptab').forEach((t) => t.classList.remove('active'));
      btn.classList.add('active');
      $('ptab-' + btn.dataset.ptab)?.classList.add('active');

      const ma = document.querySelector(`#portalBottomNav .mnav-item[data-mnav="${btn.dataset.ptab}"]`);
      document.querySelectorAll('#portalBottomNav .mnav-item').forEach((x) => x.classList.remove('active'));
      if (ma) ma.classList.add('active');

      if (isMobile()) document.querySelector('.portal-main')?.scrollTo({ top: 0, behavior: 'instant' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });

      updateMobileSubChips();
      if (btn.dataset.ptab === 'analytics') setTimeout(renderAnalyticsCharts, 50);
      if (btn.dataset.ptab === 'presentations') renderPresentations();
      if (btn.dataset.ptab === 'documents') renderDocuments();
    };
  });
}

function attachActionEvents() {
  $('pStkSend').onclick = sendStkPush;
    /* Marketplace modal actions */
  $('pMarketItemPreviewBtn').onclick = () => previewMarketItem();
  $('pMarketItemBuyBtn').onclick = () => openMarketBuy(S._viewingMarketItem);
  $('pMarketItemSubscribeBtn').onclick = () => subscribeMarketItem(S._viewingMarketItem);
  $('pMarketBuyConfirm').onclick = () => confirmMarketBuy();
  $('pTkCreate').onclick = createTicket;
  $('pInvPrint').onclick = printInvoice;
  $('pInvDownload').onclick = printInvoice;
  $('pFileDownload').onclick = downloadPreviewedFile;
  $('pReportPrintBtn').onclick = () => window.print();
  $('pThemeToggle').onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    $('pThemeToggle').innerHTML = next === 'dark'
      ? '<i class="fa-solid fa-moon"></i>'
      : '<i class="fa-solid fa-sun"></i>';
    setTimeout(() => { try { renderOverviewCharts(); } catch (e) {} }, 100);
  };
  $('pSubRequestSubmit').onclick = submitSubRequest;
}

function attachLockEvents() {
  const renewBtn = $('pLockRenewBtn');
  if (renewBtn) {
    renewBtn.onclick = () => {
      closePModal('pLockModal');
      navigateTo('billing');
    };
  }
}

/* ═══════════════════════════════════════════════════════════════
   MOBILE NAV
   ═══════════════════════════════════════════════════════════════ */
const MOBILE_SUB_MAP = {
  overview: [
    { tab: 'overview', icon: 'fa-house', label: 'Overview' },
    { tab: 'analytics', icon: 'fa-chart-line', label: 'Analytics' },
    { tab: 'presentations', icon: 'fa-chalkboard-user', label: 'Presentations' },
    { tab: 'messages', icon: 'fa-comments', label: 'Messages' },
    { tab: 'appointments', icon: 'fa-calendar-check', label: 'Appointments' }
  ],
  projects: [
    { tab: 'projects', icon: 'fa-folder', label: 'Projects' },
    { tab: 'analytics', icon: 'fa-chart-line', label: 'Analytics' },
    { tab: 'documents', icon: 'fa-file', label: 'Documents' },
    { tab: 'presentations', icon: 'fa-chalkboard-user', label: 'Presentations' }
  ],
    analytics: [
    { tab: 'analytics', icon: 'fa-chart-line', label: 'Analytics' },
    { tab: 'projects', icon: 'fa-folder', label: 'Projects' },
    { tab: 'marketplace', icon: 'fa-store', label: 'Marketplace' }
  ],
  ai: [{ tab: 'ai', icon: 'fa-wand-magic-sparkles', label: 'AI Assistant' }],
  billing: [
    { tab: 'billing', icon: 'fa-coins', label: 'Billing' },
    { tab: 'documents', icon: 'fa-file', label: 'Documents' }
  ],
  documents: [
    { tab: 'documents', icon: 'fa-file', label: 'Documents' },
    { tab: 'presentations', icon: 'fa-chalkboard-user', label: 'Presentations' }
  ],
  messages: [
    { tab: 'messages', icon: 'fa-comments', label: 'Messages' },
    { tab: 'appointments', icon: 'fa-calendar-check', label: 'Appointments' }
  ],
  more: [
    { tab: 'overview', icon: 'fa-house', label: 'Overview' },
    { tab: 'projects', icon: 'fa-folder', label: 'Projects' },
    { tab: 'analytics', icon: 'fa-chart-line', label: 'Analytics' },
    { tab: 'documents', icon: 'fa-file', label: 'Documents' },
    { tab: 'presentations', icon: 'fa-chalkboard-user', label: 'Presentations' },
    { tab: 'billing', icon: 'fa-coins', label: 'Billing' },
    { tab: 'marketplace', icon: 'fa-store', label: 'Marketplace' },
    { tab: 'ai', icon: 'fa-wand-magic-sparkles', label: 'AI' },
    { tab: 'messages', icon: 'fa-comments', label: 'Messages' },
    { tab: 'appointments', icon: 'fa-calendar-check', label: 'Appointments' }
  ]
};

let _mobileCategory = 'overview';

function initMobileNav() {
  document.querySelectorAll('#portalBottomNav .mnav-item').forEach((it) => {
    it.onclick = () => {
      const cat = it.dataset.mnav;
      if (cat === 'more') {
        _mobileCategory = 'more';
        document.querySelectorAll('#portalBottomNav .mnav-item').forEach((x) => x.classList.remove('active'));
        it.classList.add('active');
        updateMobileSubChips();
        return;
      }
      setMobileCategory(cat);
    };
  });
  document.querySelectorAll('.ptab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      for (const cat in MOBILE_SUB_MAP) {
        if (MOBILE_SUB_MAP[cat].some((t) => t.tab === btn.dataset.ptab)) {
          _mobileCategory = cat;
          document.querySelectorAll('#portalBottomNav .mnav-item').forEach((x) =>
            x.classList.toggle('active', x.dataset.mnav === cat));
          break;
        }
      }
      updateMobileSubChips();
    });
  });
  $('mobileAiBtn')?.addEventListener('click', () => setMobileCategory('ai'));
  $('mobileMsgBtn')?.addEventListener('click', () => setMobileCategory('messages'));
  updateMobileSubChips();
}

function setMobileCategory(cat) {
  _mobileCategory = cat;
  document.querySelectorAll('#portalBottomNav .mnav-item').forEach((x) =>
    x.classList.toggle('active', x.dataset.mnav === cat));
  const cfg = MOBILE_SUB_MAP[cat];
  if (cfg && cfg.length) navigateTo(cfg[0].tab);
  updateMobileSubChips();
}

function navigateTo(tab) {
  document.querySelector(`.ptab-btn[data-ptab="${tab}"]`)?.click();
}

function updateMobileSubChips() {
  const host = $('mobileSubChips');
  if (!host) return;
  const cat = _mobileCategory || 'overview';
  const tabs = MOBILE_SUB_MAP[cat] || [];
  host.innerHTML = tabs.map((t) => {
    const active = document.querySelector(`.ptab-btn[data-ptab="${t.tab}"]`)?.classList.contains('active');
    return `<button type="button" class="chip ${active ? 'active' : ''}" data-mchip="${t.tab}"><i class="fa-solid ${t.icon}"></i><span>${t.label}</span></button>`;
  }).join('');
  host.querySelectorAll('.chip').forEach((c) =>
    c.addEventListener('click', () => navigateTo(c.dataset.mchip)));
}

/* ═══════════════════════════════════════════════════════════════
   OVERVIEW
   ═══════════════════════════════════════════════════════════════ */
let _overviewSig = '';

function overviewSignature() {
  return [
    S.projects.length, S.invoices.length, S.payments.length,
    S.appointments.length, S.presentations.length,
    S.tickets.filter((t) => t.status !== 'closed').length,
    S.documents.length,
    S.projects.map((p) => p.progress || 0).join(','),
    S.client?._rev || '', S.client?.name || '',
    S.subscriptions.map((s) => `${s.id}:${s.status}:${s.endDate}`).join(','),
    S.subscriptionRequests.map((r) => `${r.id}:${r.status}:${r.kind || ''}`).join(','),
    Object.keys(S.trainingEnrollments).length,
    S.trainingCertificates.length
  ].join('|');
}

function renderOverview() {
  const host = $('ptab-overview');
  if (!host) return;
  if (!S._firstRenderDone) return;

  const sig = overviewSignature();
  if (sig === _overviewSig && host.querySelector('.client-360-hero')) return;
  _overviewSig = sig;

  const c = S.client || {};
  const activeProjects = S.projects.filter((p) => p.status === 'active').length;
  const totalInvoiced = S.invoices.reduce((s, i) => s + invoiceTotal(i), 0);
  const totalPaid = S.invoices.reduce((s, i) => s + invoicePaid(i.id), 0);
  const outstanding = Math.max(0, totalInvoiced - totalPaid);
  const openTickets = S.tickets.filter((t) => t.status !== 'closed').length;
  const upcomingAppts = S.appointments.filter((a) => a.date >= todayStr() && a.status === 'scheduled');
  const totalAgreed = clientAgreedTotal();
  const cTotalPaid = clientPaidTotal();
  const balance = Math.max(0, totalAgreed - cTotalPaid);
  const avgProgress = S.projects.length
    ? Math.round(S.projects.reduce((s, p) => s + Number(p.progress || 0), 0) / S.projects.length)
    : 0;

  host.innerHTML = `
    <div class="client-360-hero">
      <div class="hero-info">
        <h3>Welcome back, ${esc((c.name || 'Client').split(' ')[0])}</h3>
        <div class="subtitle">${esc(c.clientId || '')}${c.company ? ' · ' + esc(c.company) : ''}${c.city ? ' · ' + esc(c.city) : ''}</div>
      </div>
      <button class="btn btn-primary" onclick="window._pReport && window._pReport()">
        <i class="fa-solid fa-file-lines"></i> Generate Report
      </button>
    </div>

    ${balance > 0 ? `
    <div style="padding:16px 20px;background:linear-gradient(135deg, rgba(255,200,87,.12), rgba(255,92,124,.06));border-left:4px solid var(--accent-gold);border-radius:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
      <div>
        <strong style="color:var(--accent-gold);font-size:1.05rem;">Outstanding: ${fmtKES(balance)}</strong>
        <div style="font-size:.76rem;color:var(--text-secondary);margin-top:3px;">Agreed ${fmtKES(totalAgreed)} · Paid ${fmtKES(cTotalPaid)}</div>
      </div>
      <button class="btn btn-mpesa btn-sm" onclick="window._pPayBalance && window._pPayBalance()">
        <i class="fa-solid fa-mobile-screen-button"></i> Pay Now
      </button>
    </div>` : ''}

    <div class="kpi-grid">
      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid fa-folder"></i></div>
        <div class="number">${activeProjects}</div>
        <div class="label">Active Projects</div>
        <div class="kpi-sub">${S.projects.length} total</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid fa-coins"></i></div>
        <div class="number" style="font-size:1.15rem;">${fmtKES(outstanding)}</div>
        <div class="label">Outstanding</div>
        <div class="kpi-sub">of ${fmtKES(totalInvoiced)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid fa-file-invoice"></i></div>
        <div class="number">${S.invoices.length}</div>
        <div class="label">Invoices</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid fa-file"></i></div>
        <div class="number">${S.documents.length}</div>
        <div class="label">Documents</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid fa-chalkboard-user"></i></div>
        <div class="number">${S.presentations.length}</div>
        <div class="label">Presentations</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid fa-chart-line"></i></div>
        <div class="number">${avgProgress}%</div>
        <div class="label">Avg. Progress</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid fa-comments"></i></div>
        <div class="number">${openTickets}</div>
        <div class="label">Open Tickets</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid fa-calendar-check"></i></div>
        <div class="number">${upcomingAppts.length}</div>
        <div class="label">Upcoming Meetings</div>
      </div>
    </div>

    <div class="chart-grid" style="margin-bottom:22px;">
      <div class="chart-box"><h4><i class="fa-solid fa-chart-line"></i> Project Progress</h4><div class="chart-container"><canvas id="pProgChart"></canvas></div></div>
      <div class="chart-box"><h4><i class="fa-solid fa-chart-pie"></i> Invoice Status</h4><div class="chart-container"><canvas id="pInvChart"></canvas></div></div>
    </div>

    <div class="chart-grid" style="margin-bottom:22px;">
      <div class="chart-box">
        <h4><i class="fa-solid fa-chalkboard-user"></i> Latest Presentations</h4>
        <div class="p-timeline">
          ${S.presentations.length
            ? S.presentations.slice(0, 5).map((p) => `
              <div class="p-tl-item ${p.status === 'accepted' ? 'success' : p.status === 'rejected' ? 'danger' : 'purple'}">
                <div class="p-tl-title">${esc(p.title || '')}</div>
                <div class="p-tl-desc">${esc(p.type || '')} · ${esc(p.presenterName || '')}</div>
                <div class="p-tl-time">${fmtDate(p.date)} · ${timeAgo(p.updatedAt || p.createdAt)}</div>
              </div>`).join('')
            : '<div class="empty-state">No presentations yet.</div>'}
        </div>
      </div>
      <div class="chart-box">
        <h4><i class="fa-solid fa-bolt"></i> Recent Activity</h4>
        <div class="p-timeline">
          ${buildActivityFeed().length
            ? buildActivityFeed().map((e) => `
              <div class="p-tl-item ${e.kind}">
                <div class="p-tl-title">${esc(e.title)}</div>
                <div class="p-tl-desc">${esc(e.desc || '')}</div>
                <div class="p-tl-time">${timeAgo(e.at)}</div>
              </div>`).join('')
            : '<div class="empty-state">No activity yet.</div>'}
        </div>
      </div>
    </div>

    ${upcomingAppts.length ? `
    <div class="chart-box">
      <h4><i class="fa-solid fa-calendar-check"></i> Upcoming Appointments</h4>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;">
        ${upcomingAppts.slice(0, 4).map((a) => {
          const d = new Date((a.date || todayStr()) + 'T00:00:00');
          return `<div class="appt-card">
            <div class="appt-date-box">
              <span class="day">${d.getDate()}</span>
              <span class="mon">${d.toLocaleDateString('en-US', { month: 'short' })}</span>
            </div>
            <div class="appt-info">
              <div class="title">${esc(a.title || 'Appointment')}</div>
              <div class="meta"><i class="fa-solid fa-clock"></i> ${esc(a.startTime || '')}${a.endTime ? ' – ' + esc(a.endTime) : ''}</div>
              ${a.location ? `<div class="meta"><i class="fa-solid fa-location-dot"></i> ${esc(a.location)}</div>` : ''}
            </div>
            <span class="badge badge-pending">${esc(a.status || 'scheduled')}</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    ${renderSubscriptionBlock(S.subscriptions, Date.now())}
    ${renderPendingRequestsBlock()}
    ${renderTrainingBlock()}
  `;

  setTimeout(renderOverviewCharts, 40);
}

function renderPendingRequestsBlock() {
  const pending = (S.subscriptionRequests || []).filter((r) => r.status === 'pending');
  if (!pending.length) return '';
  return `
    <div class="chart-box" style="border-left:4px solid var(--accent-gold);">
      <h4><i class="fa-solid fa-hourglass-half"></i> Pending Subscription Requests (${pending.length})</h4>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${pending.map((r) => `
          <div style="padding:12px 14px;background:var(--bg-input);border-radius:10px;border:1px solid var(--border-color);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
              <div>
                <div style="font-weight:700;font-size:.9rem;">${esc(r.kind === 'renewal' ? (r.productName || r.planId || 'Renewal') : (r.planId || 'Plan'))}</div>
                <div style="font-size:.72rem;color:var(--text-secondary);margin-top:2px;">Requested ${timeAgo(r.requestedAt)}</div>
              </div>
              <span class="badge badge-pending">${r.kind === 'renewal' ? 'Renewal · Awaiting Approval' : 'Awaiting Admin Approval'}</span>
            </div>
            ${r.notes ? `<div style="margin-top:8px;font-size:.78rem;color:var(--text-secondary);font-style:italic;">"${esc(r.notes)}"</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>`;
}

function buildActivityFeed() {
  const out = [];
  S.payments.forEach((p) => out.push({
    at: p.createdAt || p.date,
    title: `Payment received — ${fmtKES(p.amount)}`,
    desc: p.method ? `Via ${p.method}` : '',
    kind: 'success'
  }));
  S.invoices.forEach((i) => {
    const st = invoicePaid(i.id) >= invoiceTotal(i) - 0.01 ? 'paid' : 'pending';
    out.push({
      at: i.createdAt || i.date,
      title: `Invoice ${i.number || ''} ${st}`,
      desc: fmtKES(invoiceTotal(i)),
      kind: st === 'paid' ? 'success' : 'warning'
    });
  });
  S.presentations.forEach((p) => out.push({
    at: p.updatedAt || p.createdAt || p.date,
    title: `Presentation — ${p.title || ''}`,
    desc: `${p.status || ''} · ${p.presenterName || ''}`,
    kind: p.status === 'accepted' ? 'success' : p.status === 'rejected' ? 'danger' : 'purple'
  }));
  S.appointments.forEach((a) => {
    if (a.heldAt) out.push({
      at: a.heldAt,
      title: `Appointment held — ${a.title || ''}`,
      desc: a.type || '',
      kind: 'success'
    });
  });
  return out.filter((e) => e.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 10);
}

/* ═══════════════════════════════════════════════════════════════
   OVERVIEW CHARTS
   ═══════════════════════════════════════════════════════════════ */
function renderOverviewCharts() {
  if (typeof Chart === 'undefined') return;
  const tc = getTextColor();

  if (S.charts.pProg) { try { S.charts.pProg.destroy(); } catch (e) {} S.charts.pProg = null; }
  const c1 = $('pProgChart');
  if (c1) {
    const projects = S.projects.slice(0, 8);
    S.charts.pProg = new Chart(c1.getContext('2d'), {
      type: 'bar',
      data: {
        labels: projects.map((p) => (p.projectNumber || p.title || '').slice(0, 12)),
        datasets: [{
          label: 'Progress %',
          data: projects.map((p) => p.progress || 0),
          backgroundColor: projects.map((p) =>
            (p.progress || 0) >= 100 ? 'rgba(34,230,160,.75)'
            : (p.progress || 0) >= 50 ? 'rgba(0,212,255,.75)'
            : 'rgba(255,200,87,.75)'),
          borderRadius: 8
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { color: tc, callback: (v) => v + '%' }, grid: { color: 'rgba(148,163,184,0.15)' } },
          x: { ticks: { color: tc, font: { size: 9 } }, grid: { display: false } }
        }
      }
    });
  }

  if (S.charts.pInv) { try { S.charts.pInv.destroy(); } catch (e) {} S.charts.pInv = null; }
  const c2 = $('pInvChart');
  if (c2) {
    const paid = S.invoices.filter((i) => invoicePaid(i.id) >= invoiceTotal(i) - 0.01).length;
    const partial = S.invoices.filter((i) => invoicePaid(i.id) > 0.01 && invoicePaid(i.id) < invoiceTotal(i) - 0.01).length;
    const unpaid = S.invoices.length - paid - partial;
    const labels = [], values = [], colors = [];
    if (paid)    { labels.push('Paid');    values.push(paid);    colors.push('rgba(34,230,160,.85)'); }
    if (partial) { labels.push('Partial'); values.push(partial); colors.push('rgba(255,200,87,.85)'); }
    if (unpaid)  { labels.push('Unpaid');  values.push(unpaid);  colors.push('rgba(255,92,124,.85)'); }
    if (!labels.length) { labels.push('No invoices'); values.push(1); colors.push('rgba(148,163,184,.4)'); }
    S.charts.pInv = new Chart(c2.getContext('2d'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#0a0a0f', borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { position: 'bottom', labels: { color: tc, font: { size: 11 }, boxWidth: 12, usePointStyle: true } } }
      }
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   SUBSCRIPTION + TRAINING BLOCKS
   ═══════════════════════════════════════════════════════════════ */
function renderSubscriptionBlock(subs, now) {
  if (!subs || !subs.length) {
    return `
      <div class="chart-box">
        <h4><i class="fa-solid fa-key"></i> My Subscriptions</h4>
        <div class="empty-state" style="padding:24px 12px;">
          <i class="fa-solid fa-box-open" style="font-size:1.6rem;opacity:.4;display:block;margin-bottom:8px;"></i>
          No subscriptions yet.
          <div style="margin-top:12px;">
            <a href="https://viora.co.ke/market.html" target="_blank" rel="noopener" class="btn btn-purple btn-sm">
              <i class="fa-solid fa-store"></i> Browse Marketplace
            </a>
          </div>
        </div>
      </div>`;
  }

  let mrr = 0, activeCount = 0, lifetimeCount = 0;
  for (const s of subs) {
    const ev = evaluateSub(s, now);
    if (s.plan === 'lifetime') { lifetimeCount++; activeCount++; continue; }
    if (ev.allowed) activeCount++;
    const amt = Number(s.amountKES) || 0;
    if (s.plan === 'monthly') mrr += amt;
    else if (s.plan === 'quarterly') mrr += amt / 3;
    else if (s.plan === 'yearly') mrr += amt / 12;
  }

  const alerts = subAlertLines(subs, now);
  const alertsHtml = alerts.length ? `
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
      ${alerts.map((a) => `
        <div class="alert-banner ${a.kind}">
          <i class="fa-solid ${a.icon}"></i>
          <div>${a.text}</div>
        </div>`).join('')}
    </div>` : '';

  const cards = subs.slice()
    .sort((a, b) => String(a.endDate || '').localeCompare(String(b.endDate || '')))
    .map((s) => {
      const ev = evaluateSub(s, now);
      const pill = subPill(s, ev);
      const isLifetime = s.plan === 'lifetime';
      const planLbl = PLAN_LABELS[s.plan] || s.plan || '—';
      const endLine = isLifetime ? 'Never expires' : `Renews ${fmtDate(s.endDate)}`;
      const modules = Array.isArray(s.modules) ? s.modules : [];
      const cardCls = pill.cls === 'paid' ? 'success' : pill.cls === 'overdue' ? 'danger' : 'warning';

      const launchUrl   = subscriptionLaunchUrl(s);
      const canOpen     = !!launchUrl && (ev.allowed || isLifetime);
      const daysLeft    = ev.daysRemaining;
      const inGrace     = ev.inGrace;
      const pending     = hasPendingRenewal(s);
      const showRenew   = !isLifetime && !pending && (inGrace || (daysLeft != null && daysLeft <= 7 && daysLeft >= 0));
      const showExpired = !isLifetime && !pending && !ev.allowed && s.status !== 'suspended' && s.status !== 'cancelled';
      const sidSafe     = esc(s.id);
      const pidSafe     = esc(s.productId || '');

      const actionsHtml = [
        canOpen
          ? `<button class="btn btn-success btn-sm" onclick="window._pOpenSub && window._pOpenSub('${pidSafe}')"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open App</button>`
          : '',
        pending
          ? `<button class="btn btn-outline btn-sm" disabled><i class="fa-solid fa-hourglass-half"></i> Awaiting Approval</button>`
          : '',
        showRenew || showExpired
          ? `<button class="btn btn-mpesa btn-sm" onclick="window._pRequestRenewal && window._pRequestRenewal('${sidSafe}')"><i class="fa-solid fa-rotate"></i> Renew</button>`
          : ''
      ].filter(Boolean).join('');

      return `
        <div class="subs-card subs-card-${cardCls}">
          <div class="subs-card-head">
            <div class="subs-card-icon"><i class="fa-solid fa-cube"></i></div>
            <div class="subs-card-title-block">
              <div class="subs-card-title">${esc(s.productName || s.productId || 'Subscription')}</div>
              <div class="subs-card-sub">${esc(planLbl)} · KSh ${(Number(s.amountKES) || 0).toLocaleString()}</div>
            </div>
            <span class="badge badge-${pill.cls}">${esc(pill.label)}</span>
          </div>
          <div class="subs-card-meta">
            <div class="subs-card-meta-row"><span>Started</span><strong>${fmtDate(s.startDate)}</strong></div>
            <div class="subs-card-meta-row"><span>${isLifetime ? 'Lifetime' : 'Renews'}</span><strong>${endLine}</strong></div>
            ${modules.length ? `<div class="subs-card-meta-row"><span>Modules</span><strong>${modules.length}</strong></div>` : ''}
          </div>
          ${actionsHtml ? `<div class="subs-card-actions">${actionsHtml}</div>` : ''}
        </div>`;
    }).join('');

  return `
    <div class="chart-box">
      <h4>
        <i class="fa-solid fa-key"></i> My Subscriptions
        <span style="font-weight:400;color:var(--text-light);font-size:.75rem;">(${subs.length})</span>
      </h4>
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:14px;">
        <div class="stat-card" style="padding:12px;">
          <div class="label">Active</div>
          <div class="number" style="font-size:1.3rem;">${activeCount}</div>
        </div>
        <div class="stat-card" style="padding:12px;">
          <div class="label">Lifetime</div>
          <div class="number" style="font-size:1.3rem;">${lifetimeCount}</div>
        </div>
        <div class="stat-card" style="padding:12px;">
          <div class="label">Monthly Run-rate</div>
          <div class="number" style="font-size:1.05rem;">${fmtKES(mrr)}</div>
        </div>
      </div>
      ${alertsHtml}
      <div class="subs-grid">${cards}</div>
    </div>`;
}

function renderTrainingBlock() {
  const enrollments = S.trainingEnrollments || {};
  const progress = S.trainingProgress || {};
  const courses = Array.isArray(S.trainingCourses) ? S.trainingCourses : [];
  const certs = Array.isArray(S.trainingCertificates) ? S.trainingCertificates : [];

  const enrolledIds = Object.keys(enrollments);
  if (!enrolledIds.length && !certs.length) return '';

  const coursesById = new Map(courses.map((c) => [c.id, c]));
  let totalModules = 0, totalDone = 0;

  const rows = enrolledIds.map((cid) => {
    const course = coursesById.get(cid);
    const enroll = enrollments[cid] || {};
    const prog = progress[cid] || {};
    const moduleIds = course ? Object.keys(course.modules || {}) : [];
    const modulesDone = moduleIds.filter((mid) => prog[mid] && prog[mid].completedAt).length;
    const pct = moduleIds.length ? Math.round((modulesDone / moduleIds.length) * 100) : 0;
    const isComplete = pct >= 100 || !!enroll.completedAt;
    totalModules += moduleIds.length;
    totalDone += modulesDone;

    const cls = isComplete ? 'paid' : pct > 0 ? 'pending' : 'gray';
    const label = isComplete ? 'Completed' : pct > 0 ? `In Progress · ${pct}%` : 'Not started';
    const cert = certs.find((c) => c.courseId === cid);

    return `
      <div class="training-row">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:700;font-size:.88rem;line-height:1.3;">
              ${cert ? '<i class="fa-solid fa-award" style="color:var(--accent-gold);"></i> ' : ''}${esc(course ? course.title : cid)}
            </div>
            <div style="font-size:.72rem;color:var(--text-secondary);margin-top:2px;">
              ${modulesDone} of ${moduleIds.length} modules · ${pct}%
            </div>
          </div>
          <span class="badge badge-${cls}">${esc(label)}</span>
        </div>
        <div class="progress-3d" style="height:6px;">
          <div class="progress-3d-bar ${isComplete ? 'green' : pct >= 50 ? '' : 'gold'}" style="width:${pct}%;"></div>
        </div>
      </div>`;
  }).join('');

  const certsHtml = certs.length ? `
    <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border-color);">
      <div style="font-size:.72rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;font-weight:700;margin-bottom:6px;">
        <i class="fa-solid fa-award"></i> Certificates (${certs.length})
      </div>
      ${certs.slice(0, 4).map((c) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,200,87,.08);border:1px solid var(--accent-gold);border-radius:8px;font-size:.78rem;margin-bottom:4px;">
          <span>🎓 ${esc(c.courseTitle || c.courseId)}</span>
          <span style="font-family:monospace;font-size:.68rem;color:var(--text-secondary);">${esc(c.code || c.id)}</span>
        </div>`).join('')}
    </div>` : '';

  const overallPct = totalModules ? Math.round((totalDone / totalModules) * 100) : 0;

  return `
    <div class="chart-box">
      <h4>
        <i class="fa-solid fa-graduation-cap"></i> My Training
        <span style="font-weight:400;color:var(--text-light);font-size:.75rem;">(${enrolledIds.length} course${enrolledIds.length === 1 ? '' : 's'})</span>
      </h4>
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:14px;">
        <div class="stat-card" style="padding:12px;">
          <div class="label">Enrolled</div>
          <div class="number" style="font-size:1.2rem;">${enrolledIds.length}</div>
        </div>
        <div class="stat-card" style="padding:12px;">
          <div class="label">Progress</div>
          <div class="number" style="font-size:1.2rem;">${overallPct}%</div>
        </div>
        <div class="stat-card" style="padding:12px;">
          <div class="label">Certificates</div>
          <div class="number" style="font-size:1.2rem;">${certs.length}</div>
        </div>
      </div>
      ${rows}
      ${certsHtml}
      <div style="margin-top:12px;text-align:right;">
        <a href="https://viora.co.ke/training.html" target="_blank" rel="noopener" class="btn btn-primary btn-sm">
          <i class="fa-solid fa-graduation-cap"></i> Continue Learning
        </a>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   PROJECTS
   ═══════════════════════════════════════════════════════════════ */
function renderProjects() {
  const host = $('ptab-projects');
  if (!host) return;

  if (!S.projects.length) {
    host.innerHTML = `
      <div class="page-header"><div><h1><span class="highlight">My Projects</span></h1></div></div>
      <div class="empty-state">You have no projects yet.</div>`;
    return;
  }

  host.innerHTML = `
    <div class="page-header">
      <div>
        <h1><span class="highlight">My Projects</span></h1>
        <p class="page-desc">Real-time progress on everything we're building for you.</p>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr;gap:14px;">
      ${S.projects.map((p) => {
        const prog = Number(p.progress || 0);
        const cls = prog >= 100 ? 'green' : prog >= 50 ? '' : 'gold';
        const milestones = Array.isArray(p.milestones) ? p.milestones : [];
        return `
          <div class="chart-box">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
              <div>
                <div style="font-weight:800;font-size:1.05rem;">${esc(p.title || 'Untitled')}</div>
                <div style="font-size:.78rem;color:var(--text-secondary);margin-top:2px;">
                  ${esc(p.projectNumber || '')}${p.serviceArea ? ' · ' + esc(p.serviceArea) : ''}
                </div>
              </div>
              <span class="badge badge-${esc(p.status || 'active')}">${esc(p.status || '')}</span>
            </div>
            <div class="progress-3d" style="margin-top:12px;">
              <div class="progress-3d-bar ${cls}" style="width:${prog}%"></div>
            </div>
            <div class="progress-3d-label">
              <span>Progress</span><span>${prog}%</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-top:12px;">
              ${p.startDate ? `<div><div style="font-size:.68rem;color:var(--text-secondary);text-transform:uppercase;">Started</div><div style="font-weight:600;">${fmtDate(p.startDate)}</div></div>` : ''}
              ${p.deadline ? `<div><div style="font-size:.68rem;color:var(--text-secondary);text-transform:uppercase;">Deadline</div><div style="font-weight:600;">${fmtDate(p.deadline)}</div></div>` : ''}
              ${p.nextMilestone ? `<div><div style="font-size:.68rem;color:var(--text-secondary);text-transform:uppercase;">Next Milestone</div><div style="font-weight:600;">${fmtDate(p.nextMilestone)}</div></div>` : ''}
            </div>
            ${milestones.length ? `
              <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px;">
                ${milestones.map((m) => `
                  <div style="padding:10px 14px;background:var(--bg-input);border-radius:10px;border-left:3px solid ${m.done ? 'var(--accent-green)' : 'var(--accent-blue)'};">
                    <div style="font-weight:600;font-size:.85rem;">${esc(m.title || '')}</div>
                    <div style="font-size:.7rem;color:var(--text-secondary);margin-top:2px;">${fmtDate(m.date)}</div>
                  </div>`).join('')}
              </div>` : ''}
            ${p.description ? `<div style="margin-top:12px;font-size:.8rem;color:var(--text-secondary);">${esc(p.description)}</div>` : ''}
          </div>`;
      }).join('')}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   ANALYTICS
   ═══════════════════════════════════════════════════════════════ */
function renderAnalytics() {
  $('ptab-analytics').innerHTML = `
    <div class="page-header">
      <div><h1><span class="highlight">Project Analytics</span></h1><p class="page-desc">Deep insights across your projects and payments.</p></div>
    </div>
    <div class="chart-grid">
      <div class="chart-box"><h4><i class="fa-solid fa-chart-line"></i> Progress per Project</h4><div class="chart-container"><canvas id="pAna1"></canvas></div></div>
      <div class="chart-box"><h4><i class="fa-solid fa-chart-pie"></i> Service Area Split</h4><div class="chart-container"><canvas id="pAna2"></canvas></div></div>
      <div class="chart-box chart-full"><h4><i class="fa-solid fa-coins"></i> Invoiced vs Paid per Invoice</h4><div class="chart-container" style="height:280px;"><canvas id="pAna3"></canvas></div></div>
    </div>
  `;
}

function renderAnalyticsCharts() {
  if (typeof Chart === 'undefined') return;
  const tc = getTextColor();

  if (S.charts.pAna1) { try { S.charts.pAna1.destroy(); } catch (e) {} }
  const c1 = $('pAna1');
  if (c1) {
    S.charts.pAna1 = new Chart(c1.getContext('2d'), {
      type: 'line',
      data: {
        labels: S.projects.map((p) => (p.projectNumber || '').slice(0, 10)),
        datasets: [{
          label: 'Progress %',
          data: S.projects.map((p) => p.progress || 0),
          borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.15)',
          borderWidth: 3, tension: .4, fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { color: tc, callback: (v) => v + '%' }, grid: { color: 'rgba(148,163,184,0.15)' } },
          x: { ticks: { color: tc, font: { size: 9 } }, grid: { display: false } }
        }
      }
    });
  }

  if (S.charts.pAna2) { try { S.charts.pAna2.destroy(); } catch (e) {} }
  const c2 = $('pAna2');
  if (c2) {
    const counts = {};
    S.projects.forEach((p) => {
      const a = p.serviceArea || 'Other';
      counts[a] = (counts[a] || 0) + 1;
    });
    const palette = ['#00d4ff', '#7c3aed', '#ff6ec7', '#22e6a0', '#ffc857', '#a855f7', '#ff5c7c'];
    S.charts.pAna2 = new Chart(c2.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(counts),
        datasets: [{
          data: Object.values(counts),
          backgroundColor: Object.keys(counts).map((_, i) => palette[i % palette.length]),
          borderColor: '#0a0a0f', borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { position: 'bottom', labels: { color: tc, font: { size: 11 }, boxWidth: 12, usePointStyle: true } } }
      }
    });
  }

  if (S.charts.pAna3) { try { S.charts.pAna3.destroy(); } catch (e) {} }
  const c3 = $('pAna3');
  if (c3) {
    const invData = S.invoices.map((i) => ({
      label: i.number || '',
      invoiced: invoiceTotal(i),
      paid: invoicePaid(i.id)
    }));
    S.charts.pAna3 = new Chart(c3.getContext('2d'), {
      type: 'bar',
      data: {
        labels: invData.map((i) => i.label),
        datasets: [
          { label: 'Invoiced', data: invData.map((i) => i.invoiced), backgroundColor: 'rgba(0,212,255,0.75)', borderRadius: 8 },
          { label: 'Paid', data: invData.map((i) => i.paid), backgroundColor: 'rgba(34,230,160,0.75)', borderRadius: 8 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: tc, font: { size: 11 } } } },
        scales: {
          y: { beginAtZero: true, ticks: { color: tc, callback: (v) => 'KSh ' + Number(v).toLocaleString() }, grid: { color: 'rgba(148,163,184,0.15)' } },
          x: { ticks: { color: tc, font: { size: 10 } }, grid: { display: false } }
        }
      }
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   DOCUMENTS
   ═══════════════════════════════════════════════════════════════ */
function docCategories() {
  const cats = new Set();
  S.documents.forEach((d) => {
    if (d && d.category) cats.add(d.category);
    else if (d && d._source === 'presentation') cats.add('Presentation');
    else if (d && d._source === 'client') cats.add('Client Document');
    else cats.add('Other');
  });
  return ['all', ...[...cats].sort()];
}

function renderDocuments() {
  const host = $('ptab-documents');
  if (!host) return;

  const cats = docCategories();
  const list = S._docFilter === 'all'
    ? S.documents
    : S.documents.filter((d) =>
        (d.category || (d._source === 'presentation' ? 'Presentation'
          : d._source === 'client' ? 'Client Document' : 'Other')) === S._docFilter);

  const chipsHtml = cats.map((c) => `
    <button type="button" class="${c === S._docFilter ? 'active' : ''}" data-doc-filter="${esc(c)}">
      ${c === 'all' ? 'All (' + S.documents.length + ')' : esc(c)}
    </button>`).join('');

  host.innerHTML = `
    <div class="page-header">
      <div>
        <h1><span class="highlight">Documents</span></h1>
        <p class="page-desc">Every file shared with you.</p>
      </div>
    </div>
    <div class="p-chips">${chipsHtml}</div>
    <div class="chart-box">
      <h4>
        <i class="fa-solid fa-paperclip"></i> Files for you
        <span style="color:var(--text-light);font-weight:400;">(${list.length})</span>
      </h4>
      ${list.length ? `
        <div class="p-doc-grid">
          ${list.map((d, i) => renderDocCard(d, i)).join('')}
        </div>
      ` : `<div class="empty-state">${S.documents.length ? 'No documents match this filter.' : 'No documents yet.'}</div>`}
    </div>
    <div class="chart-box">
      <h4><i class="fa-solid fa-cloud-arrow-up"></i> Upload to VIORA</h4>
      <div class="doc-upload-zone" id="pUploadZone">
        <i class="fa-solid fa-cloud-arrow-up" style="font-size:2rem;color:var(--accent-blue);"></i>
        <div style="font-weight:700;margin-top:10px;">Click to choose a file</div>
        <div style="font-size:.72rem;color:var(--text-secondary);margin-top:4px;">Max 5 MB</div>
        <input type="file" id="pUploadInput" style="display:none;" />
      </div>
      <div id="pUploadList" style="margin-top:16px;"></div>
    </div>
  `;

  host.querySelectorAll('[data-doc-filter]').forEach((btn) => {
    btn.onclick = () => {
      S._docFilter = btn.dataset.docFilter;
      renderDocuments();
    };
  });

  list.forEach((d, i) => {
    const view = host.querySelector(`[data-doc-view="${i}"]`);
    const dl = host.querySelector(`[data-doc-download="${i}"]`);
    if (view) view.onclick = () => previewDoc(d);
    if (dl) dl.onclick = () => downloadDoc(d);
  });

  const zone = $('pUploadZone');
  const input = $('pUploadInput');
  if (zone && input) {
    zone.onclick = () => input.click();
    input.onchange = (e) => {
      const f = e.target.files[0];
      if (f) handleClientUpload(f);
      input.value = '';
    };
  }
  renderUploads();
}

function renderDocCard(d, i) {
  const iconCls = fileIcon(d.fileName || d.name || d.title, d.mime);
  const isPres = d._source === 'presentation';
  const tagLabel = isPres ? 'Presentation' : (d.category || 'Document');
  const tagClass = isPres ? 'pres' : '';

  return `
    <div class="p-doc-card">
      <div class="dc-head">
        <div class="dc-icon"><i class="fa-solid ${iconCls}"></i></div>
        <div class="dc-title-block">
          <div class="dc-title" title="${esc(d.title || d.fileName || 'Document')}">
            ${esc(d.title || d.fileName || 'Document')}
          </div>
          <div class="dc-meta">${fmtBytes(d.size)}${d.uploadedAt ? ' · ' + timeAgo(d.uploadedAt) : ''}</div>
          <span class="dc-tag ${tagClass}">${esc(tagLabel)}</span>
        </div>
      </div>
      <div class="dc-actions">
        ${d.data ? `
          <button class="btn btn-primary btn-xs" data-doc-view="${i}"><i class="fa-solid fa-eye"></i> View</button>
          <button class="btn btn-success btn-xs" data-doc-download="${i}"><i class="fa-solid fa-download"></i></button>
        ` : `<span style="font-size:.7rem;color:var(--text-light);">No file data</span>`}
      </div>
    </div>
  `;
}

function previewDoc(d) {
  if (!d || !d.data) return toast('File data unavailable.', 'warning');
  S.filePreview = d;
  $('pFileTitle').textContent = d.title || d.name || d.fileName || 'Preview';
  const mime = String(d.mime || '');
  const body = $('pFileBody');
  if (mime.startsWith('image/')) {
    body.innerHTML = `<img src="${d.data}" style="max-width:100%;border-radius:12px;" />`;
  } else if (mime === 'application/pdf') {
    body.innerHTML = `<iframe src="${d.data}" style="width:100%;height:70vh;border:none;border-radius:12px;"></iframe>`;
  } else if (mime.startsWith('video/')) {
    body.innerHTML = `<video src="${d.data}" controls autoplay style="max-width:100%;border-radius:12px;"></video>`;
  } else if (mime.startsWith('audio/')) {
    body.innerHTML = `<audio src="${d.data}" controls autoplay style="width:100%;"></audio>`;
  } else {
    body.innerHTML = `<div style="padding:40px;"><i class="fa-solid fa-file" style="font-size:60px;color:var(--text-light);"></i><p style="margin-top:16px;">Preview not available.</p></div>`;
  }
  openPModal('pFilePreviewModal');
}

function downloadDoc(d) {
  if (!d || !d.data) return toast('File data unavailable.', 'warning');
  const a = document.createElement('a');
  a.href = d.data;
  a.download = d.fileName || d.name || d.title || 'document';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadPreviewedFile() {
  if (S.filePreview) downloadDoc(S.filePreview);
}

function renderUploads() {
  const host = $('pUploadList');
  if (!host) return;
  const list = Object.values(S.clientUploads || {})
    .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
  if (!list.length) { host.innerHTML = ''; return; }
  host.innerHTML = `
    <div style="font-size:.75rem;color:var(--text-secondary);font-weight:600;margin-bottom:8px;">Your uploads</div>
    <div class="p-doc-grid">
      ${list.map((u) => `
        <div class="p-doc-card">
          <div class="dc-head">
            <div class="dc-icon"><i class="fa-solid ${fileIcon(u.name, u.mime)}"></i></div>
            <div class="dc-title-block">
              <div class="dc-title">${esc(u.name)}</div>
              <div class="dc-meta">${fmtBytes(u.size)} · ${timeAgo(u.uploadedAt)}</div>
              <span class="dc-tag">${esc(u.status || 'pending')}</span>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function handleClientUpload(file) {
  if (S.uploading) return toast('Upload in progress…', 'warning');
  if (file.size > 5 * 1024 * 1024) return toast('File must be under 5 MB.', 'error');
  S.uploading = true;
  toast('Uploading…', 'info');
  try {
    const data = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = (e) => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const id = 'up-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await set(ref(db, P(`clientUploads/${S.clientId}/${id}`)), {
      id, name: file.name, size: file.size,
      mime: file.type || 'application/octet-stream',
      data, category: 'Client upload',
      uploadedAt: new Date().toISOString(),
      uploadedBy: S.uid,
      uploaderName: S.client?.name || S.email,
      status: 'pending'
    });
    toast('Uploaded ✓', 'success');
  } catch (e) {
    toast('Upload failed: ' + e.message, 'error');
  } finally {
    S.uploading = false;
  }
}

/* ═══════════════════════════════════════════════════════════════
   PRESENTATIONS
   ═══════════════════════════════════════════════════════════════ */
function presCategories() {
  const set = new Set();
  S.presentations.forEach((p) => { if (p.status) set.add(p.status); });
  return ['all', ...[...set].sort()];
}

function renderPresentations() {
  const host = $('ptab-presentations');
  if (!host) return;

  const cats = presCategories();
  const list = S._presFilter === 'all'
    ? S.presentations
    : S.presentations.filter((p) => p.status === S._presFilter);

  const chipsHtml = cats.map((c) => `
    <button type="button" class="${c === S._presFilter ? 'active' : ''}" data-pres-filter="${esc(c)}">
      ${c === 'all' ? 'All (' + S.presentations.length + ')' : esc(c)}
    </button>`).join('');

  host.innerHTML = `
    <div class="page-header">
      <div>
        <h1><span class="highlight">Presentations</span></h1>
        <p class="page-desc">Every deck, demo, and walkthrough we've delivered.</p>
      </div>
    </div>
    <div class="p-chips">${chipsHtml}</div>
    ${list.length ? `
      <div class="p-pres-grid">
        ${list.map((p, i) => renderPresCard(p, i)).join('')}
      </div>
    ` : `<div class="chart-box"><div class="empty-state">
      ${S.presentations.length ? 'No presentations match this filter.' : 'No presentations yet.'}
    </div></div>`}
  `;

  host.querySelectorAll('[data-pres-filter]').forEach((btn) => {
    btn.onclick = () => { S._presFilter = btn.dataset.presFilter; renderPresentations(); };
  });

  list.forEach((p, pi) => {
    (p.attachments || []).forEach((att, ai) => {
      const view = host.querySelector(`[data-pres-view="${pi}-${ai}"]`);
      const dl = host.querySelector(`[data-pres-download="${pi}-${ai}"]`);
      const merged = {
        title: att.name || att.title || 'Attachment',
        fileName: att.name || '',
        mime: att.mime || '',
        size: att.size || 0,
        data: att.data,
        uploadedAt: p.updatedAt || p.createdAt || p.date
      };
      if (view) view.onclick = () => previewDoc(merged);
      if (dl) dl.onclick = () => downloadDoc(merged);
    });
  });
}

function renderPresCard(p, i) {
  const statusCls = p.status === 'accepted' ? 'accepted'
    : p.status === 'rejected' ? 'rejected'
    : p.status === 'delivered' ? 'delivered' : '';
  const attachments = Array.isArray(p.attachments) ? p.attachments : [];
  const attHtml = attachments.length ? `
    <div class="pc-att-list">
      ${attachments.map((att, ai) => `
        <div class="pc-att">
          <span class="pa-icon">${fileIconEmoji(att.name, att.mime)}</span>
          <span class="pa-name" title="${esc(att.name || '')}">${esc(att.name || att.title || 'Attachment')}</span>
          <span class="pa-size">${fmtBytes(att.size)}</span>
          <span class="pa-btns">
            ${att.data ? `
              <button data-pres-view="${i}-${ai}" title="Preview">View</button>
              <button data-pres-download="${i}-${ai}" title="Download">↓</button>
            ` : ''}
          </span>
        </div>`).join('')}
    </div>` : '';

  return `
    <div class="p-pres-card ${statusCls}">
      <div class="pc-head">
        <div class="pc-icon"><i class="fa-solid fa-chalkboard-user"></i></div>
        <div class="pc-title-block">
          <div class="pc-title">${esc(p.title || 'Presentation')}</div>
          <div class="pc-sub">${esc(p.type || '')}${p.channel ? ' · ' + esc(p.channel) : ''}</div>
        </div>
        <span class="badge badge-${p.status === 'accepted' ? 'paid' : p.status === 'rejected' ? 'overdue' : 'sent'}">${esc(p.status || '')}</span>
      </div>
      <div class="pc-meta">
        <span><i class="fa-solid fa-calendar"></i> ${fmtDate(p.date)}</span>
        ${p.presenterName ? `<span><i class="fa-solid fa-user"></i> ${esc(p.presenterName)}</span>` : ''}
      </div>
      ${p.summary ? `<div class="pc-summary">${esc(p.summary)}</div>` : ''}
      ${attachments.length ? `
        <div style="font-size:.68rem;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:.4px;">
          <i class="fa-solid fa-paperclip"></i> Attachments (${attachments.length})
        </div>
        ${attHtml}
      ` : ''}
      ${p.outcome ? `<div style="padding:8px 10px;background:rgba(34,230,160,.08);border-left:3px solid var(--accent-green);border-radius:6px;font-size:.76rem;"><strong>Outcome:</strong> ${esc(p.outcome)}</div>` : ''}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   BILLING
   ═══════════════════════════════════════════════════════════════ */
function renderBilling() {
  const open = S.invoices.filter((i) => invoicePaid(i.id) < invoiceTotal(i) - 0.01);
  const closed = S.invoices.filter((i) => invoicePaid(i.id) >= invoiceTotal(i) - 0.01);
  const totalAgreed = clientAgreedTotal();
  const clientPaid = clientPaidTotal();
  const clientBalance = Math.max(0, totalAgreed - clientPaid);
  const myProjects = S.projects.filter((p) => p.status !== 'cancelled');

  $('ptab-billing').innerHTML = `
    <div class="page-header">
      <div>
        <h1><span class="highlight">Billing & Payments</span></h1>
        <p class="page-desc">Pay outstanding invoices directly via M-Pesa.</p>
      </div>
      <div class="actions">
        <button class="btn btn-outline btn-sm" onclick="window._pReport && window._pReport()">
          <i class="fa-solid fa-file-lines"></i> Report
        </button>
      </div>
    </div>
    <div class="kpi-grid">
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-file-invoice-dollar"></i></div><div class="number" style="font-size:1.15rem;">${fmtKES(totalAgreed)}</div><div class="label">Total Agreed</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-coins"></i></div><div class="number" style="font-size:1.15rem;color:var(--accent-green);">${fmtKES(clientPaid)}</div><div class="label">Total Paid</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-hourglass"></i></div><div class="number" style="font-size:1.15rem;color:${clientBalance > 0 ? 'var(--accent-red)' : 'var(--accent-green)'};">${fmtKES(clientBalance)}</div><div class="label">Balance Due</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-file-invoice"></i></div><div class="number">${open.length}</div><div class="label">Open Invoices</div></div>
    </div>

    ${myProjects.length ? `
    <div class="chart-box">
      <h4><i class="fa-solid fa-folder"></i> Project breakdown</h4>
      <div class="table-wrapper" style="background:transparent;border:none;box-shadow:none;margin:0;">
        <table style="min-width:auto;">
          <thead><tr><th>Project</th><th>Status</th><th style="text-align:right;">Agreed</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Balance</th></tr></thead>
          <tbody>
            ${myProjects.map((p) => {
              const agreed = projectAgreedTotal(p.id);
              const paid = projectPaidTotal(p.id);
              const bal = Math.max(0, agreed - paid);
              return `<tr>
                <td><strong>${esc(p.projectNumber || '—')}</strong><br><small style="color:var(--text-secondary);">${esc(p.title || '')}</small></td>
                <td><span class="badge badge-${esc(p.status || 'active')}">${esc(p.status || 'active')}</span></td>
                <td style="text-align:right;">${fmtKES(agreed)}</td>
                <td style="text-align:right;color:var(--accent-green);">${fmtKES(paid)}</td>
                <td style="text-align:right;color:${bal > 0 ? 'var(--accent-gold)' : 'var(--accent-green)'};">${fmtKES(bal)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <h3 style="margin:20px 0 12px;font-family:'Space Grotesk';font-size:1.05rem;">Open Invoices</h3>
    ${open.length ? `
      <div style="display:grid;grid-template-columns:1fr;gap:14px;">
        ${open.map((inv) => {
          const total = invoiceTotal(inv);
          const paid = invoicePaid(inv.id);
          const bal = total - paid;
          return `<div class="chart-box">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
              <div>
                <div style="font-weight:800;font-size:1.05rem;">${esc(inv.number || 'Invoice')}</div>
                <div style="font-size:.78rem;color:var(--text-secondary);margin-top:2px;">Due ${fmtDate(inv.dueDate)}</div>
              </div>
              <span class="badge badge-overdue">${fmtKES(bal)} due</span>
            </div>
            <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-mpesa btn-sm" data-payinv="${esc(inv.id)}"><i class="fa-solid fa-mobile-screen-button"></i> Pay</button>
              <button class="btn btn-outline btn-sm" data-vievinv="${esc(inv.id)}"><i class="fa-solid fa-eye"></i> View</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    ` : '<div class="empty-state">🌟 No open invoices.</div>'}

    ${closed.length ? `
    <h3 style="margin:28px 0 12px;font-family:'Space Grotesk';font-size:1.05rem;">Paid Invoices</h3>
    <div class="table-wrapper">
      <table><thead><tr><th>Number</th><th>Date</th><th style="text-align:right;">Total</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${closed.map((inv) => `<tr>
          <td><strong>${esc(inv.number)}</strong></td>
          <td>${fmtDate(inv.date)}</td>
          <td style="text-align:right;">${fmtKES(invoiceTotal(inv))}</td>
          <td><span class="badge badge-paid">paid</span></td>
          <td style="text-align:right;"><button class="btn btn-primary btn-xs" data-vievinv="${esc(inv.id)}"><i class="fa-solid fa-eye"></i></button></td>
        </tr>`).join('')}
      </tbody></table>
    </div>` : ''}

    <h3 style="margin:28px 0 12px;font-family:'Space Grotesk';font-size:1.05rem;">Payment History</h3>
    <div class="table-wrapper">
      <table><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>
        ${S.payments.length ? S.payments.map((p) => `<tr>
          <td>${fmtDate(p.date)}</td>
          <td>${esc(p.method || '')}</td>
          <td style="font-family:monospace;font-size:.78rem;">${esc(p.reference || '—')}</td>
          <td style="text-align:right;"><strong>${fmtKES(p.amount)}</strong></td>
        </tr>`).join('') : '<tr><td colspan="4" class="empty-state">No payments yet.</td></tr>'}
      </tbody></table>
    </div>
  `;

  document.querySelectorAll('[data-payinv]').forEach((b) => b.onclick = () => openStkModal(b.dataset.payinv));
  document.querySelectorAll('[data-vievinv]').forEach((b) => b.onclick = () => viewInvoice(b.dataset.vievinv));
}

/* ═══════════════════════════════════════════════════════════════
   STK + INVOICE
   ═══════════════════════════════════════════════════════════════ */
function openStkModal(invoiceId) {
  const inv = S.invoices.find((i) => i.id === invoiceId);
  if (!inv) return toast('Invoice not found.', 'error');
  S._pendingStkInvoiceId = invoiceId;
  const total = invoiceTotal(inv);
  const paid = invoicePaid(inv.id);
  const bal = Math.max(0, total - paid);
  $('pStkInfo').innerHTML = `<strong>${esc(inv.number || '')}</strong><br>Balance: <strong>${fmtKES(bal)}</strong>${inv.dueDate ? `<br>Due ${fmtDate(inv.dueDate)}` : ''}`;
  $('pStkPhone').value = S.client?.phone || '';
  $('pStkAmount').value = Math.round(bal);
  $('pStkResult').innerHTML = '';
  openPModal('pStkModal');
}

async function sendStkPush() {
  const invId = S._pendingStkInvoiceId;
  const phone = ($('pStkPhone').value || '').replace(/[^0-9]/g, '');
  const amount = parseFloat($('pStkAmount').value) || 0;
  if (!invId) return toast('No invoice selected.', 'error');
  if (!phone || phone.length < 10) return toast('Enter a valid phone.', 'error');
  if (amount <= 0) return toast('Amount must be positive.', 'error');

  const btn = $('pStkSend');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…';
  $('pStkResult').innerHTML = '';

  try {
    const token = await auth.currentUser.getIdToken();
    const r = await fetch(`${WORKER_URL}/portal/stkpush`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ phone, amount, invoiceId: invId })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    $('pStkResult').innerHTML = `<div style="padding:14px;background:rgba(34,230,160,.1);border-left:4px solid var(--accent-green);border-radius:8px;">
      <strong>✓ Payment request sent</strong><br>Check your phone for the M-Pesa prompt.
    </div>`;
    toast('M-Pesa request sent.', 'success');
    setTimeout(() => closePModal('pStkModal'), 3500);
  } catch (e) {
    $('pStkResult').innerHTML = `<div style="padding:14px;background:rgba(255,92,124,.1);border-left:4px solid var(--accent-red);border-radius:8px;">
      <strong>Failed</strong><br>${esc(e.message)}
    </div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Request';
  }
}

function viewInvoice(invoiceId) {
  const inv = S.invoices.find((i) => i.id === invoiceId);
  if (!inv) return toast('Invoice not found.', 'error');
  S._viewingInvoiceId = invoiceId;
  $('pInvNum').textContent = inv.number || '';

  const total = invoiceTotal(inv);
  const paid = invoicePaid(inv.id);
  const bal = Math.max(0, total - paid);

  const itemsRows = (inv.items || []).map((it) =>
    `<tr><td>${esc(it.description || '')}</td><td>${it.hours ? Number(it.hours).toFixed(1) + 'h' : '—'}</td><td>${it.rate ? fmtKES(it.rate) : '—'}</td><td style="text-align:right;">${fmtKES(it.amount)}</td></tr>`
  ).join('');

  $('pInvBody').innerHTML = `
    <div style="background:#fff;color:#000;border-radius:12px;padding:20px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #0a2540;">
        <div style="font-size:1.3rem;font-weight:800;color:#0a2540;">⚡ VIORA</div>
        <div style="text-align:right;">
          <div style="font-size:1.05rem;font-weight:800;color:#0a2540;">${esc(inv.number || '')}</div>
          <div style="font-size:.72rem;color:#64748b;">Date: ${fmtDate(inv.date)} · Due: ${fmtDate(inv.dueDate)}</div>
        </div>
      </div>
      <div style="margin-bottom:14px;color:#0a2540;">
        <strong>${esc(S.client?.name || '')}</strong><br>
        ${S.client?.company ? esc(S.client.company) + '<br>' : ''}
        ${S.client?.email ? esc(S.client.email) : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:.82rem;">
        <thead><tr style="background:#f1f5f9;"><th style="text-align:left;padding:8px;border:1px solid #cbd5e1;">Description</th><th style="padding:8px;border:1px solid #cbd5e1;">Hours</th><th style="padding:8px;border:1px solid #cbd5e1;">Rate</th><th style="text-align:right;padding:8px;border:1px solid #cbd5e1;">Amount</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>
      <div style="text-align:right;margin-top:14px;color:#000;">
        <div style="padding:3px 0;"><span>Total: </span><strong>${fmtKES(total)}</strong></div>
        <div style="padding:3px 0;color:#0a7f3f;"><span>Paid: </span><strong>${fmtKES(paid)}</strong></div>
        <div style="padding:3px 0;color:${bal > 0 ? '#c1121f' : '#0a7f3f'};"><span>Balance: </span><strong>${fmtKES(bal)}</strong></div>
      </div>
    </div>
  `;
  openPModal('pInvoiceModal');
}

function printInvoice() {
  window.print();
}

/* ═══════════════════════════════════════════════════════════════
   REPORT
   ═══════════════════════════════════════════════════════════════ */
function generateClientReport() {
  const c = S.client || {};
  const totalAgreed = clientAgreedTotal();
  const cPaid = clientPaidTotal();
  const balance = Math.max(0, totalAgreed - cPaid);

  $('pReportBody').innerHTML = `
    <div style="background:#fff;color:#000;border-radius:12px;padding:24px;">
      <div style="text-align:center;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #0a2540;">
        <div style="font-size:1.4rem;font-weight:800;color:#0a2540;">⚡ VIORA</div>
        <div style="font-size:.72rem;color:#64748b;">ACCOUNT REPORT · ${new Date().toLocaleString('en-GB')}</div>
      </div>
      <h2 style="color:#0a2540;font-size:1rem;text-transform:uppercase;border-bottom:1.5px solid #0a2540;padding-bottom:6px;margin:16px 0 10px;">Client</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:.85rem;color:#000;">
        <div><strong>Name:</strong> ${esc(c.name || '')}</div>
        <div><strong>Client ID:</strong> ${esc(c.clientId || '—')}</div>
        <div><strong>Email:</strong> ${esc(c.email || '—')}</div>
        <div><strong>Phone:</strong> ${esc(c.phone || '—')}</div>
      </div>
      <h2 style="color:#0a2540;font-size:1rem;text-transform:uppercase;border-bottom:1.5px solid #0a2540;padding-bottom:6px;margin:16px 0 10px;">Financial Summary</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:12px 0;color:#000;">
        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#0a2540;">Total Agreed</div>
          <div style="font-size:15px;font-weight:800;">${fmtKES(totalAgreed)}</div>
        </div>
        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#0a2540;">Paid</div>
          <div style="font-size:15px;font-weight:800;color:#0a7f3f;">${fmtKES(cPaid)}</div>
        </div>
        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#0a2540;">Balance</div>
          <div style="font-size:15px;font-weight:800;color:${balance > 0 ? '#c1121f' : '#0a7f3f'};">${fmtKES(balance)}</div>
        </div>
      </div>
      ${S.projects.length ? `
      <h2 style="color:#0a2540;font-size:1rem;text-transform:uppercase;border-bottom:1.5px solid #0a2540;padding-bottom:6px;margin:16px 0 10px;">Projects</h2>
      <table style="width:100%;border-collapse:collapse;font-size:.82rem;margin:10px 0;">
        <thead><tr><th style="background:#f1f5f9;text-align:left;padding:8px;border:1px solid #cbd5e1;color:#0a2540;">Number</th><th style="background:#f1f5f9;text-align:left;padding:8px;border:1px solid #cbd5e1;color:#0a2540;">Title</th><th style="background:#f1f5f9;text-align:left;padding:8px;border:1px solid #cbd5e1;color:#0a2540;">Status</th><th style="background:#f1f5f9;text-align:right;padding:8px;border:1px solid #cbd5e1;color:#0a2540;">Progress</th></tr></thead>
        <tbody>${S.projects.map((p) => `<tr><td style="padding:6px;border:1px solid #e2e8f0;color:#000;">${esc(p.projectNumber || '')}</td><td style="padding:6px;border:1px solid #e2e8f0;color:#000;">${esc(p.title || '')}</td><td style="padding:6px;border:1px solid #e2e8f0;color:#000;">${esc(p.status || '')}</td><td style="padding:6px;border:1px solid #e2e8f0;color:#000;text-align:right;">${p.progress || 0}%</td></tr>`).join('')}</tbody>
      </table>` : ''}
      ${S.invoices.length ? `
      <h2 style="color:#0a2540;font-size:1rem;text-transform:uppercase;border-bottom:1.5px solid #0a2540;padding-bottom:6px;margin:16px 0 10px;">Invoices</h2>
      <table style="width:100%;border-collapse:collapse;font-size:.82rem;margin:10px 0;">
        <thead><tr><th style="background:#f1f5f9;text-align:left;padding:8px;border:1px solid #cbd5e1;color:#0a2540;">Number</th><th style="background:#f1f5f9;text-align:left;padding:8px;border:1px solid #cbd5e1;color:#0a2540;">Date</th><th style="background:#f1f5f9;text-align:right;padding:8px;border:1px solid #cbd5e1;color:#0a2540;">Total</th><th style="background:#f1f5f9;text-align:right;padding:8px;border:1px solid #cbd5e1;color:#0a2540;">Paid</th></tr></thead>
        <tbody>${S.invoices.map((i) => `<tr><td style="padding:6px;border:1px solid #e2e8f0;color:#000;">${esc(i.number || '')}</td><td style="padding:6px;border:1px solid #e2e8f0;color:#000;">${fmtDate(i.date)}</td><td style="padding:6px;border:1px solid #e2e8f0;color:#000;text-align:right;">${fmtKES(invoiceTotal(i))}</td><td style="padding:6px;border:1px solid #e2e8f0;color:#000;text-align:right;">${fmtKES(invoicePaid(i.id))}</td></tr>`).join('')}</tbody>
      </table>` : ''}
      ${S.subscriptions.length ? `
      <h2 style="color:#0a2540;font-size:1rem;text-transform:uppercase;border-bottom:1.5px solid #0a2540;padding-bottom:6px;margin:16px 0 10px;">Subscriptions</h2>
      <table style="width:100%;border-collapse:collapse;font-size:.82rem;margin:10px 0;">
        <thead><tr><th style="background:#f1f5f9;text-align:left;padding:8px;border:1px solid #cbd5e1;color:#0a2540;">Product</th><th style="background:#f1f5f9;text-align:left;padding:8px;border:1px solid #cbd5e1;color:#0a2540;">Plan</th><th style="background:#f1f5f9;text-align:left;padding:8px;border:1px solid #cbd5e1;color:#0a2540;">Ends</th><th style="background:#f1f5f9;text-align:right;padding:8px;border:1px solid #cbd5e1;color:#0a2540;">KES</th></tr></thead>
        <tbody>${S.subscriptions.map((s) => `<tr><td style="padding:6px;border:1px solid #e2e8f0;color:#000;">${esc(s.productName || s.productId || '')}</td><td style="padding:6px;border:1px solid #e2e8f0;color:#000;">${esc(PLAN_LABELS[s.plan] || '')}</td><td style="padding:6px;border:1px solid #e2e8f0;color:#000;">${s.plan === 'lifetime' ? 'Never' : fmtDate(s.endDate)}</td><td style="padding:6px;border:1px solid #e2e8f0;color:#000;text-align:right;">${(Number(s.amountKES) || 0).toLocaleString()}</td></tr>`).join('')}</tbody>
      </table>` : ''}
    </div>
  `;
  openPModal('pReportModal');
}

window._pReport = generateClientReport;
window._pPayBalance = () => {
  const balance = Math.max(0, clientAgreedTotal() - clientPaidTotal());
  if (balance <= 0) return toast('No balance due.', 'info');
  const openInv = S.invoices.find((i) => invoicePaid(i.id) < invoiceTotal(i) - 0.01);
  if (openInv) openStkModal(openInv.id);
  else toast('Contact your project lead.', 'info');
};

/* ═══════════════════════════════════════════════════════════════
   AI
   ═══════════════════════════════════════════════════════════════ */
function renderAI() {
  $('ptab-ai').innerHTML = `
    <div class="page-header">
      <div>
        <h1><span class="highlight">AI Assistant</span></h1>
        <p class="page-desc">Ask anything about your account.</p>
      </div>
    </div>
    <div class="chart-box">
      <div class="ai-quick-prompts" id="pAiQuick">
        <button data-p="Summarize my projects">📊 Projects</button>
        <button data-p="What is my outstanding balance?">💰 Balance</button>
        <button data-p="What subscriptions do I have and when do they renew?">🔑 Subscriptions</button>
        <button data-p="How is my training progress?">🎓 Training</button>
        <button data-p="When is my next appointment?">📅 Appointments</button>
      </div>
      <div class="ai-chat-wrap">
        <div class="ai-chat-history" id="pAiHistory">
          <div class="ai-msg assistant">👋 Hi! I can see your projects, invoices, subscriptions, and training. Ask me anything.</div>
        </div>
        <div class="ai-chat-input">
          <input id="pAiInput" placeholder="Ask anything…" />
          <button class="btn btn-purple" id="pAiSend"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
    </div>
  `;
  $('pAiSend').onclick = sendAiMessage;
  $('pAiInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
  });
  document.querySelectorAll('#pAiQuick button').forEach((b) => {
    b.onclick = () => { $('pAiInput').value = b.dataset.p; sendAiMessage(); };
  });
}

function buildClientContext() {
  return {
    client: {
      name: S.client?.name,
      company: S.client?.company,
      totalAgreed: clientAgreedTotal(),
      totalPaid: clientPaidTotal()
    },
    projects: S.projects.map((p) => ({
      number: p.projectNumber, title: p.title, status: p.status, progress: p.progress
    })),
    invoices: S.invoices.map((i) => ({
      number: i.number, total: invoiceTotal(i), paid: invoicePaid(i.id), dueDate: i.dueDate
    })),
    subscriptions: S.subscriptions.map((s) => {
      const ev = evaluateSub(s, Date.now());
      const pill = subPill(s, ev);
      return {
        product: s.productName || s.productId,
        plan: s.plan,
        status: pill.label,
        endDate: s.endDate,
        amountKES: s.amountKES
      };
    }),
    training: Object.keys(S.trainingEnrollments).map((cid) => {
      const course = S.trainingCourses.find((c) => c.id === cid);
      const prog = S.trainingProgress[cid] || {};
      const moduleIds = course ? Object.keys(course.modules || {}) : [];
      const done = moduleIds.filter((mid) => prog[mid] && prog[mid].completedAt).length;
      return {
        course: course ? course.title : cid,
        modulesDone: done,
        modulesTotal: moduleIds.length
      };
    })
  };
}

async function sendAiMessage() {
  const input = $('pAiInput');
  const msg = (input?.value || '').trim();
  if (!msg) return;

  const history = $('pAiHistory');
  history.innerHTML += `<div class="ai-msg user">${esc(msg)}</div>`;
  input.value = '';
  const spinId = 'aiSpin' + Date.now();
  history.innerHTML += `<div id="${spinId}" class="ai-msg assistant"><div class="ai-thinking"><span></span><span></span><span></span></div></div>`;
  history.scrollTop = history.scrollHeight;

  try {
    const token = await auth.currentUser.getIdToken();
    const r = await fetch(`${WORKER_URL}/portal/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        message: msg,
        context: buildClientContext(),
        history: S.aiHistory.slice(-10)
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    const reply = data.reply || '(no response)';
    document.getElementById(spinId).outerHTML =
      `<div class="ai-msg assistant">${esc(reply).replace(/\n/g, '<br>')}</div>`;
    S.aiHistory.push({ role: 'user', content: msg });
    S.aiHistory.push({ role: 'assistant', content: reply });
    if (S.aiHistory.length > 20) S.aiHistory = S.aiHistory.slice(-20);
  } catch (e) {
    document.getElementById(spinId).outerHTML =
      `<div class="ai-msg assistant" style="border-left:3px solid var(--accent-red);color:var(--accent-red);">⚠️ ${esc(e.message)}</div>`;
  }
  history.scrollTop = history.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════════
   MESSAGES
   ═══════════════════════════════════════════════════════════════ */
function renderMessages() {
  const host = $('ptab-messages');
  if (!host) return;

  host.innerHTML = `
    <div class="page-header">
      <div>
        <h1><span class="highlight">Messages</span></h1>
        <p class="page-desc">Talk with your project lead.</p>
      </div>
      <div class="actions"><button class="btn btn-primary" id="pNewTkBtn"><i class="fa-solid fa-plus"></i> New Ticket</button></div>
    </div>
    <div style="display:grid;grid-template-columns:minmax(260px,320px) 1fr;gap:16px;">
      <div class="chart-box" style="max-height:600px;overflow-y:auto;">
        <h4><i class="fa-solid fa-ticket"></i> Tickets</h4>
        ${S.tickets.length ? S.tickets.map((t) => `
          <div class="ticket-row ${t.unreadForClient ? 'unread' : ''} ${t.status === 'closed' ? 'closed' : ''}" data-tk="${esc(t.id)}">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(t.subject || 'Untitled')}</div>
              <div style="font-size:.7rem;color:var(--text-secondary);margin-top:2px;">
                <span class="tk-status ${esc(t.status || 'open')}">${esc(t.status || 'open')}</span> · ${timeAgo(t.lastMessageAt || t.createdAt)}
              </div>
            </div>
          </div>`).join('') : '<div class="empty-state">No tickets yet.</div>'}
      </div>
      <div class="chart-box" id="pTicketThread" style="min-height:400px;display:flex;flex-direction:column;">
        <div class="empty-state" style="margin:auto;">Select a ticket.</div>
      </div>
    </div>
  `;
  document.querySelectorAll('[data-tk]').forEach((el) => {
    el.onclick = () => openTicket(el.dataset.tk);
  });
  const btn = $('pNewTkBtn');
  if (btn) btn.onclick = () => openPModal('pNewTicketModal');

  if (!S.activeTicketId && S.tickets.length) openTicket(S.tickets[0].id);
  else if (S.activeTicketId && S.tickets.find((t) => t.id === S.activeTicketId)) openTicket(S.activeTicketId);
}

function openTicket(ticketId) {
  const t = S.tickets.find((x) => x.id === ticketId);
  if (!t) return;
  S.activeTicketId = ticketId;

  document.querySelectorAll('.ticket-row').forEach((el) => {
    el.style.background = el.dataset.tk === ticketId ? 'var(--bg-table-alt)' : '';
  });

  const host = $('pTicketThread');
  host.innerHTML = `
    <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border-color);">
      <div style="font-weight:700;font-size:1rem;">${esc(t.subject || '')}</div>
      <div style="font-size:.72rem;color:var(--text-secondary);margin-top:3px;">
        <span class="tk-status ${esc(t.status || 'open')}">${esc(t.status || 'open')}</span> · ${timeAgo(t.createdAt)}
      </div>
    </div>
    <div id="pMsgThread" style="flex:1;overflow-y:auto;padding:4px;max-height:400px;min-height:200px;"></div>
    ${t.status !== 'closed' ? `
      <div style="display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color);">
        <input id="pReplyInput" placeholder="Type your reply…" style="flex:1;padding:11px 14px;border-radius:12px;border:1.5px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-family:inherit;font-size:.9rem;" />
        <button class="btn btn-primary" id="pSendReply"><i class="fa-solid fa-paper-plane"></i></button>
      </div>
    ` : '<div style="padding:12px;text-align:center;color:var(--text-secondary);font-size:.8rem;">Closed.</div>'}
  `;

  if (S.activeTicketUnsub) { try { S.activeTicketUnsub(); } catch (e) {} S.activeTicketUnsub = null; }

  const thread = $('pMsgThread');
  const unsub = onValue(ref(db, P(`tickets/${ticketId}/messages`)), (snap) => {
    const v = snap.exists() ? snap.val() : {};
    const msgs = Object.values(v).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    thread.innerHTML = msgs.length ? msgs.map((m) => {
      const isMe = m.senderType === 'client';
      return `<div class="msg-bubble ${isMe ? 'client' : 'admin'}">
        <div class="who">${esc(m.senderName || (isMe ? 'You' : 'Viora'))}</div>
        <div>${esc(m.text || '')}</div>
        <div style="font-size:.62rem;opacity:.7;margin-top:4px;text-align:${isMe ? 'right' : 'left'};">${timeAgo(m.createdAt)}</div>
      </div>`;
    }).join('') : '<div class="empty-state">No messages yet.</div>';
    thread.scrollTop = thread.scrollHeight;
  });
  S.activeTicketUnsub = unsub;

  const sendBtn = $('pSendReply');
  if (sendBtn) {
    const send = async () => {
      const text = $('pReplyInput').value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      try {
        const msgId = 'msg-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const msg = {
          id: msgId, senderId: S.uid, senderType: 'client',
          senderName: S.client?.name || S.email || 'Client',
          text, createdAt: new Date().toISOString()
        };
        await set(ref(db, P(`tickets/${ticketId}/messages/${msgId}`)), msg);
        await update(ref(db, P(`tickets/${ticketId}`)), {
          lastMessageAt: msg.createdAt,
          unreadForClient: 0
        });
        $('pReplyInput').value = '';
      } catch (e) {
        toast('Send failed: ' + e.message, 'error');
      } finally {
        sendBtn.disabled = false;
      }
    };
    sendBtn.onclick = send;
    $('pReplyInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
  }
}

async function createTicket() {
  const subject = $('pTkSubject').value.trim();
  const priority = $('pTkPriority').value;
  const body = $('pTkBody').value.trim();
  if (!subject || body.length < 3) return toast('Subject and description required.', 'error');

  const btn = $('pTkCreate');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating…';
  try {
    const id = 'TKT-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
    const now = new Date().toISOString();
    await set(ref(db, P(`tickets/${id}`)), {
      id, clientId: S.clientId, clientName: S.client?.name || '',
      subject, priority, status: 'open',
      createdAt: now, createdBy: S.uid,
      lastMessageAt: now, unreadForAdmin: 1, unreadForClient: 0
    });
    await set(ref(db, P(`tickets/${id}/messages/msg-${Date.now().toString(36)}`)), {
      senderId: S.uid, senderType: 'client',
      senderName: S.client?.name || 'Client',
      text: body, createdAt: now
    });
    toast('Ticket created ✓', 'success');
    closePModal('pNewTicketModal');
    $('pTkSubject').value = '';
    $('pTkBody').value = '';
    $('pTkPriority').value = 'medium';
    S.activeTicketId = id;
  } catch (e) {
    toast('Failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Create';
  }
}

function updateUnreadBadge() {
  const unread = S.tickets.reduce((s, t) => s + Number(t.unreadForClient || 0), 0);
  const b = $('pUnreadBadge');
  if (b) {
    if (unread > 0) { b.textContent = unread; b.style.display = 'inline-block'; }
    else b.style.display = 'none';
  }
  const mb = $('mobileMsgBadge');
  if (mb) {
    if (unread > 0) { mb.textContent = unread; mb.style.display = 'inline-block'; }
    else mb.style.display = 'none';
  }
}

/* ═══════════════════════════════════════════════════════════════
   APPOINTMENTS
   ═══════════════════════════════════════════════════════════════ */
function renderAppointments() {
  const today = todayStr();
  const upcoming = S.appointments
    .filter((a) => a.date >= today && a.status !== 'cancelled' && a.status !== 'missed')
    .sort((a, b) => (a.date + 'T' + (a.startTime || '00:00')).localeCompare(b.date + 'T' + (b.startTime || '00:00')));
  const past = S.appointments.filter((a) => a.date < today).sort((a, b) => b.date.localeCompare(a.date));

  $('ptab-appointments').innerHTML = `
    <div class="page-header">
      <div><h1><span class="highlight">Appointments</span></h1><p class="page-desc">Your meetings with VIORA.</p></div>
    </div>
    <h3 style="margin:0 0 14px;font-family:'Space Grotesk';font-size:1rem;">Upcoming (${upcoming.length})</h3>
    ${upcoming.length ? `
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:22px;">
        ${upcoming.map((a) => {
          const d = new Date((a.date || today) + 'T00:00:00');
          return `<div class="appt-card ${a.status || ''}">
            <div class="appt-date-box">
              <span class="day">${d.getDate()}</span>
              <span class="mon">${d.toLocaleDateString('en-US', { month: 'short' })}</span>
            </div>
            <div class="appt-info">
              <div class="title">${esc(a.title || 'Meeting')}</div>
              <div class="meta"><i class="fa-solid fa-clock"></i> ${esc(a.startTime || '')}${a.endTime ? ' – ' + esc(a.endTime) : ''}</div>
              ${a.location ? `<div class="meta"><i class="fa-solid fa-location-dot"></i> ${esc(a.location)}</div>` : ''}
            </div>
            <span class="badge badge-pending">${esc(a.status || 'scheduled')}</span>
          </div>`;
        }).join('')}
      </div>
    ` : '<div class="empty-state">No upcoming appointments.</div>'}
    ${past.length ? `
      <h3 style="margin:28px 0 12px;font-family:'Space Grotesk';font-size:1rem;">Past (${past.length})</h3>
      <div class="table-wrapper">
        <table><thead><tr><th>Date</th><th>Title</th><th>Status</th></tr></thead>
        <tbody>${past.slice(0, 20).map((a) => `<tr>
          <td>${fmtDate(a.date)}</td>
          <td>${esc(a.title || '')}</td>
          <td><span class="badge badge-${a.status === 'held' ? 'paid' : a.status === 'missed' ? 'overdue' : 'gray'}">${esc(a.status || '')}</span></td>
        </tr>`).join('')}</tbody></table>
      </div>
    ` : ''}
  `;
}

/* ═══════════════════════════════════════════════════════════════
   SUBSCRIPTION PURCHASE FLOW
   ═══════════════════════════════════════════════════════════════ */
function checkSubPurchaseIntent() {
  const params = new URLSearchParams(window.location.search);
  const planId = params.get('sub');
  if (!planId) return;
  loadPlanAndShowRequest(planId);
}

function checkRenewIntent() {
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('renew');
  if (!productId) return;
  const existing = S.subscriptions.find((s) => s.productId === productId);
  if (existing) {
    window._pRequestRenewal(existing.id);
  }
}

async function loadPlanAndShowRequest(planId) {
  try {
    const snap = await get(ref(db, P(`subscriptionPlans/${planId}`)));
    if (!snap.exists()) {
      toast('Plan not found. It may have been archived.', 'error');
      return;
    }
    const plan = snap.val();
    if (plan.active === false) {
      toast('This plan is no longer available.', 'warning');
      return;
    }

    $('pSubRequestName').textContent = plan.name || 'Plan';
    $('pSubRequestPhone').value = S.client?.phone || '';
    $('pSubRequestNotes').value = '';
    $('pSubRequestResult').innerHTML = '';

    const priceKES = Number(plan.priceKES) || 0;
    const durationDays = Number(plan.durationDays) || 30;
    const graceHours = Number(plan.graceHours) || 72;

    $('pSubRequestInfo').innerHTML = `
      <div style="display:flex;justify-content:space-between;padding:4px 0;">
        <span style="color:var(--text-secondary);">Price</span>
        <strong>KSh ${priceKES.toLocaleString()}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;">
        <span style="color:var(--text-secondary);">Billing cycle</span>
        <strong>${durationDays} days</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;">
        <span style="color:var(--text-secondary);">Grace period</span>
        <strong>${graceHours} hours</strong>
      </div>
      ${plan.description ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border-color);color:var(--text-secondary);">${esc(plan.description)}</div>` : ''}
    `;

    const modules = Array.isArray(plan.modules) ? plan.modules : [];
    $('pSubRequestFeatures').innerHTML = modules.length ? `
      <div style="font-size:.72rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;font-weight:700;margin-bottom:8px;">Included modules (${modules.length})</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${modules.map((m) => `<span class="badge badge-purple">${esc(m)}</span>`).join('')}
      </div>
    ` : '';

    $('pSubRequestModal').dataset.planId = planId;
    $('pSubRequestModal').dataset.productId = plan.productId || plan.id || planId;

    openPModal('pSubRequestModal');
  } catch (e) {
    console.error('[sub] load plan failed:', e);
    toast('Could not load plan: ' + e.message, 'error');
  }
}

async function submitSubRequest() {
  const modal = $('pSubRequestModal');
  const planId = modal.dataset.planId;
  const productId = modal.dataset.productId;
  const phone = ($('pSubRequestPhone').value || '').trim();
  const notes = ($('pSubRequestNotes').value || '').trim();

  if (!planId) return toast('No plan selected.', 'error');

  const dupe = (S.subscriptionRequests || []).find((r) =>
    r.planId === planId && r.status === 'pending' && r.kind !== 'renewal'
  );
  if (dupe) {
    toast('You already have a pending request for this plan. Please wait for admin review.', 'warning');
    return;
  }

  const btn = $('pSubRequestSubmit');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting…';

  try {
    const requestId = 'req-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await set(ref(db, P(`subscriptionRequests/${requestId}`)), {
      id: requestId,
      clientId: S.clientId,
      clientName: S.client?.name || '',
      clientEmail: S.email || '',
      clientPhone: phone,
      planId,
      productId,
      notes,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      requestedBy: S.uid
    });

    try {
      const notifId = 'notif-' + Date.now().toString(36);
      await set(ref(db, `viora_data/orgs/viora/notifications/${notifId}`), {
        id: notifId,
        title: '🔔 New subscription request',
        body: `${S.client?.name || S.email} requested a subscription`,
        icon: 'fa-key',
        level: 'warning',
        url: '/main.html#subscription-requests',
        source: 'subscription-request',
        ts: new Date().toISOString(),
        read: false
      });
    } catch (e) {
      console.warn('[sub] notification write failed:', e);
    }

    $('pSubRequestResult').innerHTML = `<div style="padding:14px;background:rgba(34,230,160,.1);border-left:4px solid var(--accent-green);border-radius:8px;">
      <strong>✓ Request submitted</strong><br>
      An admin will review your request within a few hours. You'll see a notification once it's approved.
    </div>`;
    toast('Subscription request sent.', 'success');

    setTimeout(() => {
      closePModal('pSubRequestModal');
      window.history.replaceState({}, '', window.location.pathname);
    }, 3000);

  } catch (e) {
    $('pSubRequestResult').innerHTML = `<div style="padding:14px;background:rgba(255,92,124,.1);border-left:4px solid var(--accent-red);border-radius:8px;">
      <strong>Failed</strong><br>${esc(e.message)}
    </div>`;
    toast('Request failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Request Subscription';
  }
}

/* ═══════════════════════════════════════════════════════════════
   SOFTWARE LOCK
   ═══════════════════════════════════════════════════════════════ */
function evaluateSoftwareLock() {
  if (!S.subscriptions || !S.subscriptions.length) {
    hideLockModal();
    removeLockBanner();
    S._lockActive = false;
    return;
  }

  const now = Date.now();
  const results = S.subscriptions.map((s) => ({ sub: s, ev: evaluateSub(s, now) }));

  const anyAllowed = results.some((r) => r.ev.allowed);
  const anyGrace = results.some((r) => r.ev.allowed && r.ev.inGrace);
  const allExpired = results.every((r) => !r.ev.allowed);

  if (anyAllowed && !anyGrace) {
    hideLockModal();
    removeLockBanner();
    S._lockActive = false;
    return;
  }

  if (anyGrace) {
    hideLockModal();
    showGraceBanner(results.filter((r) => r.ev.inGrace));
    S._lockActive = false;
    return;
  }

  if (allExpired) {
    showLockModal(results);
    S._lockActive = true;
  }
}

function showLockModal(results) {
  const expiredNames = results
    .filter((r) => !r.ev.allowed)
    .map((r) => r.sub.productName || r.sub.productId)
    .join(', ');

  $('pLockBody').innerHTML = `
    <p>Your subscription to <strong>${esc(expiredNames)}</strong> has expired.</p>
    <p style="margin-top:10px;color:var(--text-secondary);font-size:.82rem;">
      Your projects, invoices, and documents are still visible, but new work won't be processed until you renew.
    </p>
    <div style="margin-top:14px;padding:12px;background:rgba(255,200,87,.08);border-left:3px solid var(--accent-gold);border-radius:8px;font-size:.82rem;">
      <i class="fa-solid fa-circle-info"></i> Renewing is instant — request a renewal and your account manager will approve it.
    </div>
  `;
  openPModal('pLockModal');
}

function hideLockModal() {
  closePModal('pLockModal');
}

function showGraceBanner(graceSubs) {
  removeLockBanner();
  const banner = document.createElement('div');
  banner.id = 'pGraceBanner';
  banner.className = 'alert-banner danger';
  banner.style.cssText = 'position:sticky;top:60px;z-index:48;margin:0 24px 16px;padding:12px 16px;';
  banner.innerHTML = `
    <i class="fa-solid fa-hourglass-half"></i>
    <div>
      <strong>Grace period active</strong> —
      ${graceSubs.map((r) => {
        const h = Math.max(1, Math.ceil(r.ev.msRemaining / 3600000));
        return `${esc(r.sub.productName || r.sub.productId)} locks in ${h}h`;
      }).join(', ')}.
      <button class="btn btn-mpesa btn-xs" style="margin-left:8px;" onclick="window._pRequestRenewal && window._pRequestRenewal('${graceSubs[0].sub.id}')">
        Renew now
      </button>
    </div>
  `;
  const main = document.querySelector('.portal-main');
  if (main && main.parentNode) main.parentNode.insertBefore(banner, main);
}

function removeLockBanner() {
  const b = $('pGraceBanner');
  if (b) b.remove();
}

/* ═══════════════════════════════════════════════════════════════
   BACKDROP ANIMATION
   ═══════════════════════════════════════════════════════════════ */
(function initBgCanvas() {
  const canvas = $('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let W = 0, H = 0;
  const dots = [];
  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    dots.length = 0;
    const count = Math.min(70, Math.floor((W * H) / 25000));
    for (let i = 0; i < count; i++) {
      dots.push({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 2 + 0.4,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        hue: ['0,212,255', '124,58,237', '34,230,160', '168,85,247'][Math.floor(Math.random() * 4)],
        pulse: Math.random() * Math.PI * 2
      });
    }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      d.x += d.vx; d.y += d.vy; d.pulse += 0.02;
      if (d.x < 0 || d.x > W) d.vx *= -1;
      if (d.y < 0 || d.y > H) d.vy *= -1;
      const size = d.r * (1 + Math.sin(d.pulse) * 0.3);
      ctx.beginPath();
      ctx.arc(d.x, d.y, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${d.hue},${0.5 + Math.sin(d.pulse) * 0.3})`;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
})();

/* ═══════════════════════════════════════════════════════════════
   CLEANUP
   ═══════════════════════════════════════════════════════════════ */
window.addEventListener('beforeunload', () => {
  if (S.activeTicketUnsub) { try { S.activeTicketUnsub(); } catch (e) {} }
  if (S.pendingWatch) { try { S.pendingWatch(); } catch (e) {} }
  if (S._pendingPoll) { try { clearInterval(S._pendingPoll); } catch (e) {} }
  S.unsubs.forEach((u) => { try { u(); } catch (e) {} });
});


/* ═══════════════════════════════════════════════════════════════
   MARKETPLACE — appended module (self-contained)
   ═══════════════════════════════════════════════════════════════ */

let _marketTab = 'all';
let _marketSearchTimer = null;

function renderMarketplace() {
  const host = document.getElementById('ptab-marketplace');
  if (!host) return;

  const products = S.products || [];
  const orders = S.orders || [];
  const subs = S.subscriptions || [];
  const search = (S._marketSearch || '').toLowerCase().trim();

  const filtered = search
    ? products.filter((p) =>
        (p.name || '').toLowerCase().includes(search) ||
        (p.description || '').toLowerCase().includes(search) ||
        (p.category || '').toLowerCase().includes(search)
      )
    : products;

  host.innerHTML = `
    <div class="page-header">
      <div>
        <h1><span class="highlight">Marketplace</span></h1>
        <p class="page-desc">Buy or subscribe to any product. Subscribe sends a request to your VIORA account manager for approval.</p>
      </div>
    </div>

    <div class="market-tabs">
      <button class="market-tab ${_marketTab === 'all' ? 'active' : ''}" data-mtab="all" type="button">
        <i class="fa-solid fa-cubes"></i> All Items
        <span class="count">${products.length}</span>
      </button>
      <button class="market-tab ${_marketTab === 'orders' ? 'active' : ''}" data-mtab="orders" type="button">
        <i class="fa-solid fa-receipt"></i> My Orders
        <span class="count">${orders.length}</span>
      </button>
      <button class="market-tab ${_marketTab === 'subs' ? 'active' : ''}" data-mtab="subs" type="button">
        <i class="fa-solid fa-key"></i> My Subscriptions
        <span class="count">${subs.length}</span>
      </button>
    </div>

    ${_marketTab === 'all' ? `
      <div class="market-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input id="pMarketSearch" placeholder="Search products…" value="${esc(S._marketSearch)}" />
      </div>
      ${filtered.length ? `
        <div class="market-grid">
          ${filtered.map((p, i) => renderMarketCard(p, i)).join('')}
        </div>
      ` : `
        <div class="empty-state" style="padding:60px 20px;text-align:center;">
          <i class="fa-solid fa-store" style="font-size:2.4rem;opacity:.4;display:block;margin-bottom:12px;"></i>
          ${products.length ? 'No products match your search.' : 'No products available yet.'}
        </div>
      `}
    ` : ''}

    ${_marketTab === 'orders' ? renderMyOrdersSection(orders) : ''}
    ${_marketTab === 'subs' ? renderMySubsSection(subs) : ''}
  `;

  host.querySelectorAll('[data-mtab]').forEach((btn) => {
    btn.onclick = () => { _marketTab = btn.dataset.mtab; renderMarketplace(); };
  });

  const searchInput = document.getElementById('pMarketSearch');
  if (searchInput) {
    searchInput.oninput = (e) => {
      S._marketSearch = e.target.value;
      clearTimeout(_marketSearchTimer);
      _marketSearchTimer = setTimeout(() => {
        renderMarketplace();
        const si = document.getElementById('pMarketSearch');
        if (si) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
      }, 200);
    };
  }

  host.querySelectorAll('[data-market-open]').forEach((btn) => {
    btn.onclick = () => openMarketItem(btn.dataset.marketOpen);
  });
  host.querySelectorAll('[data-market-preview]').forEach((btn) => {
    btn.onclick = (e) => { e.stopPropagation(); previewMarketItem(btn.dataset.marketPreview); };
  });
  host.querySelectorAll('[data-market-buy]').forEach((btn) => {
    btn.onclick = (e) => { e.stopPropagation(); openMarketBuyById(btn.dataset.marketBuy); };
  });
  host.querySelectorAll('[data-market-sub]').forEach((btn) => {
    btn.onclick = (e) => { e.stopPropagation(); subscribeMarketById(btn.dataset.marketSub); };
  });
  host.querySelectorAll('[data-market-pay-order]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      toast('Payment for order ' + btn.dataset.marketPayOrder + ' — admin will follow up.', 'info');
    };
  });
}

function renderMarketCard(p, i) {
  const priceKES = Number(p.priceKES || (Number(p.price || 0) * 129)) || 0;
  const icon = p.icon || 'fa-solid fa-cube';
  const image = p.image || '';
  const tags = Array.isArray(p.tags) ? p.tags.slice(0, 3) : [];
  const hasPlan = !!p.planId;
  const idSafe = esc(p.id);

  return `
    <div class="market-card" data-market-open="${idSafe}">
      <div class="market-card-preview" style="${image ? `background-image:url('${esc(image)}');background-size:cover;background-position:center;` : ''}">
        ${!image ? `<i class="${esc(icon)}" style="font-size:2.2rem;color:var(--accent-purple);"></i>` : ''}
      </div>
      <div class="market-card-body">
        <div class="market-card-title">${esc(p.name || 'Untitled')}</div>
        <div class="market-card-desc">${esc((p.description || '').slice(0, 90))}${(p.description || '').length > 90 ? '…' : ''}</div>
        ${tags.length ? `
          <div class="market-card-tags">
            ${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
          </div>
        ` : ''}
        <div class="market-card-price">
          <span class="price">KSh ${priceKES.toLocaleString()}</span>
          ${p.period ? `<span class="period">${esc(p.period)}</span>` : ''}
        </div>
      </div>
      <div class="market-card-actions">
        <button class="btn btn-outline btn-xs" data-market-preview="${idSafe}" title="Preview" type="button">
          <i class="fa-solid fa-eye"></i> Preview
        </button>
        <button class="btn btn-mpesa btn-xs" data-market-buy="${idSafe}" title="Buy now" type="button">
          <i class="fa-solid fa-bolt"></i> Buy
        </button>
        <button class="btn btn-purple btn-xs" data-market-sub="${idSafe}" title="Request subscription" type="button">
          <i class="fa-solid fa-key"></i> Subscribe
        </button>
      </div>
      ${hasPlan ? '<span class="market-card-badge">Subscription</span>' : ''}
    </div>
  `;
}

function renderMyOrdersSection(orders) {
  if (!orders.length) {
    return `
      <div class="empty-state" style="padding:60px 20px;text-align:center;">
        <i class="fa-solid fa-receipt" style="font-size:2.4rem;opacity:.4;display:block;margin-bottom:12px;"></i>
        No orders yet. Browse products and click <strong>Buy</strong> to make a purchase.
      </div>
    `;
  }
  const sorted = orders.slice().sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return `
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${sorted.map((o) => {
        const items = Array.isArray(o.items) ? o.items : [];
        const paid = o.paymentStatus === 'paid';
        const cls = paid ? 'paid' : o.paymentStatus === 'pending' ? 'pending' : 'overdue';
        return `
          <div class="chart-box">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
              <div>
                <div style="font-weight:800;font-size:.95rem;">Order ${esc(o.id)}</div>
                <div style="font-size:.72rem;color:var(--text-secondary);margin-top:2px;">
                  ${timeAgo(o.timestamp)} · ${esc(o.paymentMethod || '')}
                </div>
              </div>
              <span class="badge badge-${cls}">${esc(o.paymentStatus || 'pending')}</span>
            </div>
            <div style="margin-top:10px;font-size:.8rem;">
              ${items.map((it) => `
                <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--border-color);">
                  <span>${esc(it.productName || '')}</span>
                  <span>KSh ${(Number(it.priceKES || it.amount) || 0).toLocaleString()}</span>
                </div>
              `).join('')}
            </div>
            <div style="margin-top:10px;display:flex;justify-content:space-between;font-weight:700;">
              <span>Total</span>
              <span>KSh ${(Number(o.totalKES) || 0).toLocaleString()}</span>
            </div>
            ${!paid ? `
              <div style="margin-top:12px;">
                <button class="btn btn-mpesa btn-sm" data-market-pay-order="${esc(o.id)}" type="button">
                  <i class="fa-solid fa-mobile-screen-button"></i> Pay Now
                </button>
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderMySubsSection(subs) {
  if (!subs.length) {
    return `
      <div class="empty-state" style="padding:60px 20px;text-align:center;">
        <i class="fa-solid fa-key" style="font-size:2.4rem;opacity:.4;display:block;margin-bottom:12px;"></i>
        No subscriptions yet. Browse products and click <strong>Subscribe</strong> to request one.
      </div>
    `;
  }
  const now = Date.now();
  return `
    <div class="subs-grid">
      ${subs.map((s) => {
        const ev = evaluateSub(s, now);
        const pill = subPill(s, ev);
        const isLifetime = s.plan === 'lifetime';
        const cardCls = pill.cls === 'paid' ? 'success' : pill.cls === 'overdue' ? 'danger' : 'warning';

        const launchUrl   = subscriptionLaunchUrl(s);
        const canOpen     = !!launchUrl && (ev.allowed || isLifetime);
        const daysLeft    = ev.daysRemaining;
        const inGrace     = ev.inGrace;
        const pending     = hasPendingRenewal(s);
        const showRenew   = !isLifetime && !pending && (inGrace || (daysLeft != null && daysLeft <= 7 && daysLeft >= 0));
        const showExpired = !isLifetime && !pending && !ev.allowed && s.status !== 'suspended' && s.status !== 'cancelled';
        const sidSafe     = esc(s.id);
        const pidSafe     = esc(s.productId || '');

        const actionsHtml = [
          canOpen
            ? `<button class="btn btn-success btn-sm" onclick="window._pOpenSub && window._pOpenSub('${pidSafe}')" type="button"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open App</button>`
            : '',
          pending
            ? `<button class="btn btn-outline btn-sm" disabled type="button"><i class="fa-solid fa-hourglass-half"></i> Awaiting Approval</button>`
            : '',
          showRenew || showExpired
            ? `<button class="btn btn-mpesa btn-sm" onclick="window._pRequestRenewal && window._pRequestRenewal('${sidSafe}')" type="button"><i class="fa-solid fa-rotate"></i> Renew</button>`
            : ''
        ].filter(Boolean).join('');

        return `
          <div class="subs-card subs-card-${cardCls}">
            <div class="subs-card-head">
              <div class="subs-card-icon"><i class="fa-solid fa-cube"></i></div>
              <div class="subs-card-title-block">
                <div class="subs-card-title">${esc(s.productName || s.productId || 'Subscription')}</div>
                <div class="subs-card-sub">${esc(PLAN_LABELS[s.plan] || s.plan || '')} · KSh ${(Number(s.amountKES) || 0).toLocaleString()}</div>
              </div>
              <span class="badge badge-${pill.cls}">${esc(pill.label)}</span>
            </div>
            <div class="subs-card-meta">
              <div class="subs-card-meta-row"><span>Started</span><strong>${fmtDate(s.startDate)}</strong></div>
              <div class="subs-card-meta-row"><span>${isLifetime ? 'Lifetime' : 'Renews'}</span><strong>${isLifetime ? 'Never' : fmtDate(s.endDate)}</strong></div>
            </div>
            ${actionsHtml ? `<div class="subs-card-actions">${actionsHtml}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function openMarketItem(productId) {
  const p = (S.products || []).find((x) => x.id === productId);
  if (!p) return toast('Product not found.', 'error');
  S._viewingMarketItem = p;

  document.getElementById('pMarketItemName').textContent = p.name || 'Item';

  const preview = document.getElementById('pMarketItemPreview');
  if (p.image) {
    preview.innerHTML = `<img src="${esc(p.image)}" alt="${esc(p.name || '')}" style="width:100%;max-height:280px;object-fit:cover;border-radius:12px;" />`;
  } else if (p.previewUrl) {
    preview.innerHTML = `<iframe src="${esc(p.previewUrl)}" style="width:100%;height:320px;border:none;border-radius:12px;background:var(--bg-input);"></iframe>`;
  } else {
    preview.innerHTML = `
      <div style="padding:40px 20px;text-align:center;background:var(--bg-input);border-radius:12px;">
        <i class="${esc(p.icon || 'fa-solid fa-cube')}" style="font-size:3rem;color:var(--accent-purple);opacity:.6;"></i>
        <div style="margin-top:12px;color:var(--text-secondary);font-size:.85rem;">No preview image available</div>
      </div>
    `;
  }

  const priceKES = Number(p.priceKES || (Number(p.price || 0) * 129)) || 0;
  document.getElementById('pMarketItemInfo').innerHTML = `
    ${p.category ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--text-secondary);">Category</span><strong>${esc(p.category)}</strong></div>` : ''}
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--text-secondary);">Price</span><strong style="color:var(--accent-green);">KSh ${priceKES.toLocaleString()}</strong></div>
    ${p.period ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--text-secondary);">Billing</span><strong>${esc(p.period)}</strong></div>` : ''}
    ${p.planId ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--text-secondary);">Subscription</span><strong style="color:var(--accent-purple);">Available</strong></div>` : ''}
    ${p.description ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border-color);color:var(--text-secondary);line-height:1.6;">${esc(p.description)}</div>` : ''}
  `;

  const tags = Array.isArray(p.tags) ? p.tags : [];
  document.getElementById('pMarketItemFeatures').innerHTML = tags.length ? `
    <div style="font-size:.72rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;font-weight:700;margin-bottom:8px;">Included</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;">
      ${tags.map((t) => `<span class="badge badge-purple">${esc(t)}</span>`).join('')}
    </div>
  ` : '';

  const previewBtn = document.getElementById('pMarketItemPreviewBtn');
  if (previewBtn) previewBtn.style.display = p.previewUrl ? 'inline-flex' : 'none';

  openPModal('pMarketItemModal');
}

function previewMarketItem(productId) {
  const p = productId
    ? (S.products || []).find((x) => x.id === productId)
    : S._viewingMarketItem;
  if (!p) return toast('Product not found.', 'error');
  if (!p.previewUrl) return toast('No preview link available for this product.', 'info');
  window.open(p.previewUrl, '_blank', 'noopener');
}

function openMarketBuyById(productId) {
  const p = (S.products || []).find((x) => x.id === productId);
  if (!p) return toast('Product not found.', 'error');
  openMarketBuy(p);
}

function openMarketBuy(p) {
  if (!p) return toast('No item selected.', 'error');
  S._viewingMarketItem = p;

  const priceKES = Number(p.priceKES || (Number(p.price || 0) * 129)) || 0;
  document.getElementById('pMarketBuyName').textContent = p.name || 'Item';
  document.getElementById('pMarketBuyInfo').innerHTML = `
    <div style="display:flex;justify-content:space-between;padding:4px 0;">
      <span style="color:var(--text-secondary);">Product</span>
      <strong>${esc(p.name || '')}</strong>
    </div>
    <div style="display:flex;justify-content:space-between;padding:4px 0;">
      <span style="color:var(--text-secondary);">Amount</span>
      <strong style="color:var(--accent-green);">KSh ${priceKES.toLocaleString()}</strong>
    </div>
    <div style="display:flex;justify-content:space-between;padding:4px 0;">
      <span style="color:var(--text-secondary);">Payment</span>
      <strong>M-Pesa</strong>
    </div>
  `;
  document.getElementById('pMarketBuyPhone').value = S.client?.phone || '';
  document.getElementById('pMarketBuyResult').innerHTML = '';

  closePModal('pMarketItemModal');
  openPModal('pMarketBuyModal');
}

async function confirmMarketBuy() {
  const p = S._viewingMarketItem;
  if (!p) return toast('No item selected.', 'error');

  const phone = (document.getElementById('pMarketBuyPhone').value || '').replace(/[^0-9]/g, '');
  if (!phone || phone.length < 10) return toast('Enter a valid M-Pesa phone.', 'error');

  const priceKES = Number(p.priceKES || (Number(p.price || 0) * 129)) || 0;
  if (priceKES <= 0) return toast('Invalid product price.', 'error');

  const btn = document.getElementById('pMarketBuyConfirm');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing…';
  document.getElementById('pMarketBuyResult').innerHTML = '';

  try {
    const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
    const order = {
      id: orderId,
      items: [{ productId: p.id, productName: p.name, amount: Number(p.price) || 0, priceKES, qty: 1, plan: 'one-time' }],
      customerName: S.client?.name || S.email || 'Client',
      customerEmail: S.email || '',
      customerPhone: phone,
      totalUSD: Number(p.price) || 0,
      totalKES: priceKES,
      currency: 'KES',
      paymentMethod: 'mpesa',
      paymentStatus: 'pending',
      source: 'client-portal',
      recordedBy: S.client?.name || S.email || 'Client',
      timestamp: new Date().toISOString()
    };

    await set(ref(db, P(`orders/${orderId}`)), order);      /* ── Create the linked subscription invoice ──        This is what activates the subscription after payment. */     try {       const planSnap = await get(ref(db, P(`subscriptionPlans/plan-from-${p.id}`)));       const plan = planSnap.exists() ? planSnap.val() : null;       if (plan) {         const linkedSub = (S.subscriptions || []).find((s) => s.productId === p.id);         if (linkedSub) {           const invoiceId = 'inv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);           const durationDays = Number(plan.durationDays) || 30;           await set(ref(db, P(`invoices/${invoiceId}`)), {             id: invoiceId,             number: 'INV-' + Date.now().toString(36).toUpperCase(),             clientId: S.clientId,             subscriptionId: linkedSub.id,             isSubscriptionCheckout: linkedSub.status === 'pending_payment' || linkedSub.status === 'expired',             isRenewal: linkedSub.status === 'active' || linkedSub.status === 'grace',             projectId: null,             date: new Date().toISOString().slice(0, 10),             dueDate: new Date().toISOString().slice(0, 10),             status: 'draft',             currency: 'KES',             tax: 0,             notes: `Subscription purchase — ${p.name}`,             items: [{               description: `${p.name} — ${PLAN_LABELS[plan.billingCycle] || 'Monthly'}`,               amount: priceKES,               hours: null, rate: null,               subscriptionId: linkedSub.id,               extensionDays: durationDays             }],             extraCharges: [],             createdAt: new Date().toISOString(),             createdBy: S.client?.name || S.email || 'Client'           });           console.log('[marketplace] subscription invoice created:', invoiceId, '→', linkedSub.id);         }       }     } catch (e) {       console.warn('[marketplace] linked invoice creation failed:', e);     }

    try {
      const token = await auth.currentUser.getIdToken();
      const r = await fetch(`${WORKER_URL}/portal/stkpush`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ phone, amount: priceKES, invoiceId: orderId, reference: orderId })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);

      document.getElementById('pMarketBuyResult').innerHTML = `
        <div style="padding:14px;background:rgba(34,230,160,.1);border-left:4px solid var(--accent-green);border-radius:8px;">
          <strong>✓ Order created · ${orderId}</strong><br>
          M-Pesa prompt sent to your phone. Enter your PIN to complete the purchase.
        </div>
      `;
      toast('M-Pesa prompt sent. Check your phone.', 'success');

      try {
        await set(ref(db, `viora_data/orgs/viora/notifications/notif-${Date.now()}`), {
          id: 'notif-' + Date.now(),
          title: '💰 New purchase from ' + (S.client?.name || S.email),
          body: `${p.name} · KSh ${priceKES.toLocaleString()} · ${orderId}`,
          icon: 'fa-shopping-cart',
          level: 'success',
          url: '/main.html#marketplace-orders',
          source: 'client-purchase',
          ts: new Date().toISOString(),
          read: false
        });
      } catch (e) {}

      setTimeout(() => {
        closePModal('pMarketBuyModal');
        _marketTab = 'orders';
        renderMarketplace();
      }, 3000);
    } catch (e) {
      document.getElementById('pMarketBuyResult').innerHTML = `
        <div style="padding:14px;background:rgba(255,200,87,.1);border-left:4px solid var(--accent-gold);border-radius:8px;">
          <strong>Order created · ${orderId}</strong><br>
          M-Pesa prompt could not be sent automatically.<br>
          <small>An admin will contact you to arrange payment.</small>
        </div>
      `;
      toast('Order recorded. Admin will follow up.', 'warning');
    }
  } catch (e) {
    document.getElementById('pMarketBuyResult').innerHTML = `
      <div style="padding:14px;background:rgba(255,92,124,.1);border-left:4px solid var(--accent-red);border-radius:8px;">
        <strong>Purchase failed</strong><br>${esc(e.message)}
      </div>
    `;
    toast('Purchase failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i> Pay with M-Pesa';
  }
}

function subscribeMarketById(productId) {
  const p = (S.products || []).find((x) => x.id === productId);
  if (!p) return toast('Product not found.', 'error');
  subscribeMarketItem(p);
}

async function subscribeMarketItem(p) {
  if (!p) return toast('No item selected.', 'error');

  let planId = p.planId;
  let plan = null;

  if (planId) {
    try {
      const snap = await get(ref(db, P(`subscriptionPlans/${planId}`)));
      if (snap.exists()) plan = snap.val();
    } catch (e) {
      console.warn('[market] plan fetch failed:', e);
    }
  }

  if (!plan) {
    const autoPlanId = 'plan-from-' + p.id;
    try {
      const snap = await get(ref(db, P(`subscriptionPlans/${autoPlanId}`)));
      if (snap.exists()) { plan = snap.val(); planId = autoPlanId; }
    } catch (e) {}
  }

  if (!plan) {
    toast('Subscriptions are not available for this product yet. Please contact your project lead.', 'warning');
    return;
  }

  const dupe = (S.subscriptionRequests || []).find((r) =>
    r.planId === planId && r.status === 'pending' && r.kind !== 'renewal'
  );
  if (dupe) {
    toast('You already have a pending request for this plan. Please wait for admin review.', 'warning');
    return;
  }

  closePModal('pMarketItemModal');

  const requestId = 'req-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const request = {
    id: requestId,
    clientId: S.clientId,
    clientName: S.client?.name || '',
    clientEmail: S.email || '',
    clientPhone: S.client?.phone || '',
    planId,
    productId: p.id,
    planSnapshot: {
      name: plan.name,
      priceKES: plan.priceKES,
      durationDays: plan.durationDays,
      graceHours: plan.graceHours,
      icon: plan.icon,
      modules: plan.modules,
      productId: plan.productId,
      billingCycle: plan.billingCycle
    },
    notes: `Requested from marketplace: ${p.name}`,
    status: 'pending',
    requestedAt: new Date().toISOString(),
    requestedBy: S.uid
  };

  try {
    await set(ref(db, P(`subscriptionRequests/${requestId}`)), request);

    try {
      await set(ref(db, `viora_data/orgs/viora/notifications/notif-${Date.now()}`), {
        id: 'notif-' + Date.now(),
        title: '🔔 New subscription request',
        body: `${S.client?.name || S.email} requested: ${plan.name}`,
        icon: 'fa-key',
        level: 'warning',
        url: '/main.html#subscription-plans',
        source: 'subscription-request',
        ts: new Date().toISOString(),
        read: false
      });
    } catch (e) {}

    toast('Subscription request sent. Admin will review shortly.', 'success');

    const host = document.getElementById('ptab-marketplace');
    if (host) {
      const banner = document.createElement('div');
      banner.className = 'alert-banner success';
      banner.style.cssText = 'margin:16px 0;';
      banner.innerHTML = `
        <i class="fa-solid fa-check-circle"></i>
        <div>
          <strong>Request submitted</strong> for <strong>${esc(plan.name)}</strong>.
          You'll receive a notification once an admin approves it.
        </div>
      `;
      host.insertBefore(banner, host.firstChild.nextSibling);
      setTimeout(() => banner.remove(), 8000);
    }
  } catch (e) {
    console.error('[market] subscribe failed:', e);
    toast('Request failed: ' + e.message, 'error');
  }
}
