import {
  initializeApp
} from "firebase/app";
import {
  getDatabase, ref, onValue, off, set, get, remove, push, update
} from "firebase/database";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut, setPersistence,
  browserSessionPersistence, inMemoryPersistence
} from "firebase/auth";
import {
  initClientSubscriptions,
  renderMarketplaceTab,
  renderHeaderChip
} from "./client-subscriptions.js";

/* ═══════════════════════════════════════════════════════════════
   FIREBASE
   ═══════════════════════════════════════════════════════════════ */
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
const app  = initializeApp(firebaseConfig, "viora-portal");
const db   = getDatabase(app);
const auth = getAuth(app);

const WORKER_URL = "https://viora-api.cliff254johns.workers.dev";
const ROOT = 'viora_data';
const ORG  = 'orgs/viora';
const P    = (path) => `${ROOT}/${ORG}/${String(path).replace(/^\/+|\/+$/g, '')}`;

/* ═══════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════ */
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
  trainingEnrollments: {},
  trainingProgress: {},
  trainingCourses: [],
  trainingCertificates: [],

  documents: [],
  clientUploads: {},

  products: [],
  orders: [],

  activeTicketId: null,
  activeTicketUnsub: null,
  uploading: false,
  pendingWatch: null,
  _pendingPoll: null,
  pendingPollCount: 0,

  charts: {},
  mobileCategory: 'overview',
  aiHistory: [],
  filePreview: null,
  unsubs: [],
  liveSync: true,

  _serverTimeOffsetMs: 0,

  _docFilter: 'all',
  _presFilter: 'all',
  _dashPainted: false,
  _firstRenderDone: false,

  _rawDocuments: [],
  _rawPresentations: [],
};

/* ═══════════════════════════════════════════════════════════════
   MONEY HELPERS
   ═══════════════════════════════════════════════════════════════ */
function getProjectAgreedTotal(projectId) {
  const p = (S.projects || []).find(x => x.id === projectId);
  if (!p) return 0;
  const explicit = Number(p.agreedTotal || 0);
  if (explicit > 0) return explicit;
  return (p.installments || []).reduce((s, i) => s + Number(i.amount || 0), 0);
}
function getProjectPaidTotal(projectId) {
  if (!projectId) return 0;
  let t = 0;
  for (const p of (S.payments || [])) {
    if (p && p.projectId === projectId) t += Number(p.amount || 0);
  }
  return t;
}
function getClientAgreedTotalFromProjects(clientId) {
  return (S.projects || [])
    .filter(p => p.clientId === clientId && p.status !== 'cancelled')
    .reduce((s, p) => s + getProjectAgreedTotal(p.id), 0);
}
function getClientPaidTotalFromProjects(clientId) {
  return (S.projects || [])
    .filter(p => p.clientId === clientId && p.status !== 'cancelled')
    .reduce((s, p) => s + getProjectPaidTotal(p.id), 0);
}
function getTotalAgreed(client) {
  const c = client || {};
  const cid = S.clientId || c.id || c.clientId;
  if (!cid) return 0;
  const fromProjects = getClientAgreedTotalFromProjects(cid);
  if (fromProjects > 0) return fromProjects;
  for (const v of [c.totalAgreed, c.caseFees, c.agreedAmount, c.contractValue]) {
    const n = Number(v);
    if (isFinite(n) && n > 0) return n;
  }
  return 0;
}
function getTotalPaid(client) {
  const c = client || {};
  const cid = S.clientId || c.id || c.clientId;
  if (!cid) return 0;
  const fromProjects = getClientPaidTotalFromProjects(cid);
  if (fromProjects > 0) return fromProjects;
  for (const v of [c.totalPaid, c.amountPaid]) {
    const n = Number(v);
    if (isFinite(n) && n > 0) return n;
  }
  return (S.payments || [])
    .filter(p => !p.clientId || p.clientId === cid)
    .reduce((s, p) => s + Number(p.amount || 0), 0);
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════ */
const $   = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtKES = n => 'KSh ' + Number(n || 0).toLocaleString('en-US',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = d => {
  if (!d) return '—';
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00');
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-GB',
    { day: '2-digit', month: 'short', year: 'numeric' });
};

const timeAgo = iso => {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24)  return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
};

const fmtBytes = b => {
  if (!b) return '0 B';
  if (b < 1024)    return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
};

function fileIcon(name, mime) {
  const n = String(name || '').toLowerCase();
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(n)) return 'fa-file-image';
  if (m === 'application/pdf' || /\.pdf$/.test(n))                         return 'fa-file-pdf';
  if (m.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/.test(n))       return 'fa-file-video';
  if (m.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/.test(n))            return 'fa-file-audio';
  if (/\.(xls|xlsx|csv|ods)$/.test(n))                                     return 'fa-file-excel';
  if (/\.(doc|docx|odt|rtf)$/.test(n))                                     return 'fa-file-word';
  if (/\.(ppt|pptx|odp|key)$/.test(n))                                     return 'fa-file-powerpoint';
  if (m.startsWith('text/') || /\.(txt|md|log)$/.test(n))                  return 'fa-file-lines';
  if (/\.(zip|rar|7z|tar|gz)$/.test(n))                                    return 'fa-file-zipper';
  return 'fa-file';
}
function fileIconEmoji(name, mime) {
  const map = {
    'fa-file-image': '🖼️', 'fa-file-pdf': '📕', 'fa-file-video': '🎬',
    'fa-file-audio': '🎵', 'fa-file-excel': '📊', 'fa-file-word': '📄',
    'fa-file-powerpoint': '📑', 'fa-file-lines': '📝', 'fa-file-zipper': '🗜️'
  };
  return map[fileIcon(name, mime)] || '📎';
}

const isMobile  = () => window.matchMedia('(max-width: 899px)').matches;
const todayStr  = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
function getTextColor() {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--text-primary').trim() || '#f0f4ff';
}

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

function openPModal(id)  { $(id)?.classList.add('active'); }
function closePModal(id) { $(id)?.classList.remove('active'); }

document.querySelectorAll('[data-pclose]').forEach(b =>
  b.addEventListener('click', () => closePModal(b.dataset.pclose)));
document.querySelectorAll('.modal-overlay').forEach(m =>
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('active'); }));

/* ═══════════════════════════════════════════════════════════════
   SERVER TIME OFFSET
   ═══════════════════════════════════════════════════════════════ */
onValue(ref(db, '.info/serverTimeOffset'), snap => {
  const v = snap.val();
  S._serverTimeOffsetMs = Number.isFinite(v) ? Number(v) : 0;
}, () => {});

/* ═══════════════════════════════════════════════════════════════
   ANIMATED BACKGROUND
   ═══════════════════════════════════════════════════════════════ */
(function initBgCanvas() {
  const canvas = $('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let W = 0, H = 0;
  const dots = [], waves = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    dots.length = 0; waves.length = 0;
    const count = Math.min(90, Math.floor((W * H) / 20000));
    for (let i = 0; i < count; i++) {
      dots.push({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 2 + 0.4,
        vx: (Math.random() - 0.5) * 0.32,
        vy: (Math.random() - 0.5) * 0.32,
        hue: ['0,212,255','124,58,237','34,230,160','168,85,247'][Math.floor(Math.random()*4)],
        pulse: Math.random() * Math.PI * 2
      });
    }
    for (let i = 0; i < 3; i++) {
      waves.push({
        y: Math.random() * H,
        amp: 30 + Math.random() * 40,
        freq: 0.008 + Math.random() * 0.01,
        speed: 0.0004 + Math.random() * 0.0006,
        phase: Math.random() * Math.PI * 2,
        hue: i === 0 ? '0,212,255' : i === 1 ? '124,58,237' : '34,230,160'
      });
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    waves.forEach(w => {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 20) {
        const y = w.y + Math.sin(x * w.freq + t * w.speed + w.phase) * w.amp;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${w.hue}, 0.10)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
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
      for (let j = i + 1; j < dots.length; j++) {
        const o = dots[j];
        const dx = d.x - o.x, dy = d.y - o.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < 18000) {
          ctx.beginPath();
          ctx.moveTo(d.x, d.y); ctx.lineTo(o.x, o.y);
          ctx.strokeStyle = `rgba(${d.hue},${0.12 * (1 - d2/18000)})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
})();

/* ═══════════════════════════════════════════════════════════════
   PWA INSTALL
   ═══════════════════════════════════════════════════════════════ */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  $('installPrompt')?.classList.add('show');
});
window.addEventListener('appinstalled', () => {
  $('installPrompt')?.classList.remove('show');
  deferredInstallPrompt = null;
  toast('VIORA installed ✓', 'success');
});
$('installBtn')?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) {
    toast('Use browser menu → Add to Home Screen', 'info');
    $('installPrompt').classList.remove('show');
    return;
  }
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') toast('Installing…', 'success');
  deferredInstallPrompt = null;
  $('installPrompt').classList.remove('show');
});
$('installDismiss')?.addEventListener('click', () => $('installPrompt').classList.remove('show'));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

/* ═══════════════════════════════════════════════════════════════
   LOGIN TABS — defensive binding (v3.3 fix)
   ═══════════════════════════════════════════════════════════════ */
function bindLoginTabs() {
  const tabSignIn    = $('tabSignIn');
  const tabFirstTime = $('tabFirstTime');
  const signInFields    = $('signInFields');
  const firstTimeFields = $('firstTimeFields');

  if (!tabSignIn || !tabFirstTime || !signInFields || !firstTimeFields) return false;
  if (tabSignIn._vioraBound) return true;

  tabSignIn._vioraBound = true;
  tabFirstTime._vioraBound = true;

  tabSignIn.onclick = () => {
    tabSignIn.classList.add('active');
    tabFirstTime.classList.remove('active');
    tabSignIn.setAttribute('aria-selected', 'true');
    tabFirstTime.setAttribute('aria-selected', 'false');
    signInFields.style.display = '';
    firstTimeFields.style.display = 'none';
    clearLoginMessage();
  };
  tabFirstTime.onclick = () => {
    tabFirstTime.classList.add('active');
    tabSignIn.classList.remove('active');
    tabFirstTime.setAttribute('aria-selected', 'true');
    tabSignIn.setAttribute('aria-selected', 'false');
    signInFields.style.display = 'none';
    firstTimeFields.style.display = '';
    clearLoginMessage();
  };
  return true;
}
bindLoginTabs();
document.addEventListener('DOMContentLoaded', bindLoginTabs);
setTimeout(bindLoginTabs, 100);
setTimeout(bindLoginTabs, 500);

/* ═══════════════════════════════════════════════════════════════
   SIGN IN
   ═══════════════════════════════════════════════════════════════ */
$('pLoginBtn').onclick = async () => {
  const email    = $('pEmail').value.trim();
  const password = $('pPassword').value;
  if (!email || !password) { showLoginMessage('Email and password required.', 'error'); return; }

  const btn = $('pLoginBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Signing in…';
  clearLoginMessage();

  try {
    await signInWithEmailAndPassword(auth, email, password);
    sessionStorage.setItem('viora_portal_authed', '1');
  } catch (e) {
    const code = e.code || '';
    let msg = e.message || 'Sign-in failed';
    if (['auth/invalid-credential','auth/wrong-password','auth/user-not-found'].includes(code))
      msg = 'Incorrect email or password. If this is your first time, use the "First Time" tab.';
    else if (code === 'auth/too-many-requests')
      msg = 'Too many attempts. Please wait a minute.';
    showLoginMessage(msg, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i>&nbsp; Sign In';
  }
};
$('pPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('pLoginBtn').click();
});

/* ═══════════════════════════════════════════════════════════════
   FIRST TIME — auto-match, else request approval
   ═══════════════════════════════════════════════════════════════ */
$('pRegisterBtn').onclick = async () => {
  const name     = $('pRegName').value.trim();
  const email    = $('pRegEmail').value.trim().toLowerCase();
  const phone    = $('pRegPhone').value.trim();
  const password = $('pRegPassword').value;

  if (!name || name.length < 2)         { showLoginMessage('Please enter your full name.', 'error'); return; }
  if (!email || !email.includes('@'))   { showLoginMessage('Please enter a valid email.', 'error'); return; }
  if (!password || password.length < 6) { showLoginMessage('Password must be at least 6 characters.', 'error'); return; }

  const btn = $('pRegisterBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Checking your details…';
  clearLoginMessage();

  let cred = null;

  try {
    cred = await createUserWithEmailAndPassword(auth, email, password);
    sessionStorage.setItem('viora_portal_authed', '1');
  } catch (e) {
    const code = e.code || '';
    let msg = e.message || 'Registration failed';
    if (code === 'auth/email-already-in-use')
      msg = 'This email already has an account. Switch to the Sign In tab to log in.';
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
  try { matchedClientId = await _autoMatchClient(name, email, phone); }
  catch (e) { console.warn('[register] auto-match failed:', e); }

  if (matchedClientId) {
    const bridge = {
      uid: cred.user.uid,
      email,
      name,
      phone,
      clientId: matchedClientId,
      active: true,
      linkedAt: new Date().toISOString(),
      linkedBy: 'auto-match'
    };
    try {
      await set(ref(db, `${ROOT}/${ORG}/portalUsers/${cred.user.uid}`), bridge);
      await update(ref(db, `${ROOT}/${ORG}/portalRequests/${cred.user.uid}`), {
        status: 'approved',
        clientId: matchedClientId,
        approvedAt: bridge.linkedAt,
        matchType: 'auto-match'
      }).catch(() => {});
      showLoginMessage(`Welcome, ${name}! Loading your portal…`, 'success');
      S.clientId = matchedClientId;
      startPortalSession(bridge);
      return;
    } catch (e) {
      console.warn('[register] auto-match bridge write failed, falling back:', e);
    }
  }

  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Sending request…';
  let workerStatus = null;
  try {
    const token = await cred.user.getIdToken();
    const r = await fetch(`${WORKER_URL}/portal/registerClient`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name, phone })
    });
    const data = await r.json().catch(() => ({}));
    workerStatus = data.status || null;
  } catch (e) {
    console.warn('[register] worker call failed:', e);
  }

  const waitedBridge = await _waitForBridge(cred.user.uid, 3000);
  if (waitedBridge && waitedBridge.clientId && waitedBridge.active) {
    showLoginMessage(`Welcome, ${name}! Loading your portal…`, 'success');
    S.clientId = waitedBridge.clientId;
    startPortalSession(waitedBridge);
    return;
  }

  if (workerStatus === 'linked') {
    showLoginMessage('Account created — finalising access…', 'info');
  } else {
    showLoginMessage('Account created. An admin will link you to your client profile shortly.', 'success');
  }
  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-user-plus"></i>&nbsp; Request Portal Access';

  await handleAuthState(cred.user);
};

/* ═══════════════════════════════════════════════════════════════
   AUTO-MATCH — find a matching client record
   ═══════════════════════════════════════════════════════════════ */
async function _autoMatchClient(name, email, phone) {
  const normEmail = (s) => String(s || '').toLowerCase().trim();
  const normPhone = (s) => {
    let c = String(s || '').replace(/[^0-9]/g, '');
    if (c.startsWith('0')) c = '254' + c.slice(1);
    if (c && !c.startsWith('254') && c.length === 9) c = '254' + c;
    return c;
  };
  const normName = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');

  const wanted = {
    email: normEmail(email),
    phone: normPhone(phone),
    name:  normName(name)
  };

  try {
    const snap = await get(ref(db, `${ROOT}/${ORG}/entities`));
    if (!snap.exists()) return null;
    const all = snap.val();
    const list = Object.values(all || {}).filter(e => e && e.type === 'client');

    if (wanted.email) {
      const hit = list.find(c => normEmail(c.email) === wanted.email);
      if (hit) return hit.id;
    }
    if (wanted.phone) {
      const hit = list.find(c =>
        normPhone(c.phone) === wanted.phone ||
        normPhone(c.phoneAlt) === wanted.phone
      );
      if (hit) return hit.id;
    }
    if (wanted.name) {
      const hits = list.filter(c => normName(c.name) === wanted.name);
      if (hits.length === 1) return hits[0].id;
    }

    return null;
  } catch (e) {
    console.warn('[auto-match] failed:', e);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   WAIT FOR BRIDGE
   ═══════════════════════════════════════════════════════════════ */
async function _waitForBridge(uid, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const snap = await get(ref(db, `${ROOT}/${ORG}/portalUsers/${uid}`));
      if (snap.exists()) {
        const v = snap.val();
        if (v && v.clientId) {
          if (v.active === true) return v;
          return { ...v, active: true };
        }
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   AUTH BOOT
   ═══════════════════════════════════════════════════════════════ */
(async () => {
  try {
    await setPersistence(auth, browserSessionPersistence);
  } catch (e) {
    try { await setPersistence(auth, inMemoryPersistence); } catch (_) {}
  }
  onAuthStateChanged(auth, user => {
    handleAuthState(user).catch(err => {
      console.error('[client] auth handler failed:', err);
      document.getElementById('portalLogin')?.classList.remove('hidden');
      if (typeof window.vioraHidePreloader === 'function') window.vioraHidePreloader();
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
    if (typeof window.vioraHidePreloader === 'function') window.vioraHidePreloader();
    return;
  }

  S.uid   = user.uid;
  S.email = user.email;

  let bridge = null;
  try {
    const snap = await get(ref(db, `${ROOT}/${ORG}/portalUsers/${user.uid}`));
    bridge = snap.exists() ? snap.val() : null;
  } catch (e) {}

  if (!bridge || bridge.active !== true) {
    $('portalLogin').classList.add('hidden');
    $('portalShell').classList.remove('visible');

    try {
      const reqSnap = await get(ref(db, `${ROOT}/${ORG}/portalRequests/${user.uid}`));
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

    S.pendingWatch = onValue(ref(db, `${ROOT}/${ORG}/portalUsers/${user.uid}`), snap => {
      tryStart(snap.exists() ? snap.val() : null);
    });

    S.pendingPollCount = 0;
    S._pendingPoll = setInterval(async () => {
      S.pendingPollCount++;
      try {
        const [u, r] = await Promise.all([
          get(ref(db, `${ROOT}/${ORG}/portalUsers/${user.uid}`)),
          get(ref(db, `${ROOT}/${ORG}/portalRequests/${user.uid}`))
        ]);
        if (tryStart(u.exists() ? u.val() : null))   return;
        if (tryStart(r.exists() ? r.val() : null))   return;
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

/* ═══════════════════════════════════════════════════════════════
   SIGN OUT
   ═══════════════════════════════════════════════════════════════ */
const doPortalSignOut = async () => {
  if (!confirm('Sign out?')) return;
  sessionStorage.removeItem('viora_portal_authed');
  try { await signOut(auth); } catch (e) {}
  location.reload();
};
$('pendingLogout').onclick    = doPortalSignOut;
$('pLogout').onclick          = doPortalSignOut;
$('mobileLogoutBtn').onclick  = doPortalSignOut;

/* ═══════════════════════════════════════════════════════════════
   PORTAL SESSION
   ═══════════════════════════════════════════════════════════════ */
async function startPortalSession(bridge) {
  $('pWho').textContent = bridge.name || bridge.email || S.email;
  $('portalLogin').classList.add('hidden');
  $('pendingScreen').classList.remove('active');
  $('portalShell').classList.add('visible');

  if (typeof window.vioraHidePreloader === 'function') window.vioraHidePreloader();

  await loadEverything();
  attachTabEvents();
  attachActionEvents();
  initMobileNav();
  startRealtimeSubscriptions();

  try {
    initClientSubscriptions({
      db, ref, set, get, update, remove, push, onValue, off,
      state: S, $, esc, toast,
      openModal: openPModal, closeModal: closePModal,
      openStkModal, sendStkPush,
      fmtKES, fmtDate, timeAgo,
      ROOT, ORG,
      logActivity: null,
      openProduct: null
    });
    renderHeaderChip();
  } catch (e) {
    console.warn('[client] subscription module init failed:', e);
  }

  requestAnimationFrame(() => {
    S._firstRenderDone = true;
    renderOverview();
    renderPresentations();
    renderDocuments();
  });
}

/* ═══════════════════════════════════════════════════════════════
   DATA LOADING
   ═══════════════════════════════════════════════════════════════ */
async function loadEverything() {
  try {
    const token = await auth.currentUser.getIdToken();
    const r = await fetch(`${WORKER_URL}/portal/myData`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    if (!r.ok) throw new Error(`Worker ${r.status}`);
    const data = await r.json();
    S.client        = data.entity || {};
    S.projects      = data.projects || [];
    S.invoices      = data.invoices || [];
    S.payments      = data.payments || [];
    S.appointments  = data.appointments || [];
    S.presentations = data.presentations || [];
    S._rawDocuments = data.documents || [];
    S._rawPresentations = data.presentations || [];
  } catch (e) {
    try {
      const s = await get(ref(db, `${ROOT}/${ORG}/entities/${S.clientId}`));
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

/* ═══════════════════════════════════════════════════════════════
   DOCUMENT MERGE
   ═══════════════════════════════════════════════════════════════ */
function refilterDocuments() {
  const myProjectIds = new Set((S.projects || []).map(p => p.id).filter(Boolean));
  const myPresIds    = new Set((S._rawPresentations || []).map(p => p.id).filter(Boolean));
  const myEmail      = String(S.email || '').toLowerCase();
  const clientEmail  = String(S.client?.email || '').toLowerCase();
  const byId = new Map();

  const add = (d, source) => {
    if (!d) return;
    const key = d.id || (d.fileName || '') + '|' + (d.uploadedAt || '');
    if (!key) return;
    const existing = byId.get(key);
    const score = (x) => (x.data ? 2 : 0) + (x.category ? 1 : 0);
    if (!existing) {
      byId.set(key, { ...d, _source: source });
      return;
    }
    if (score(d) > score(existing)) {
      byId.set(key, { ...existing, ...d, _source: source });
    }
  };

  const entityDocs = (S.client && Array.isArray(S.client.documents)) ? S.client.documents : [];
  entityDocs.forEach(d => add(d, 'client'));

  (S._rawDocuments || []).forEach(d => {
    if (!d) return;
    const shared = String(d.sharedWithEmail || '').toLowerCase();
    const matches =
      (d.clientId && d.clientId === S.clientId) ||
      (d.projectId && myProjectIds.has(d.projectId)) ||
      (d.parentId && myPresIds.has(d.parentId)) ||
      (shared && (shared === myEmail || shared === clientEmail));
    if (matches) add(d, 'vault');
  });

  (S._rawPresentations || []).forEach(p => {
    if (!p || !Array.isArray(p.attachments)) return;
    p.attachments.forEach(att => {
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

/* ═══════════════════════════════════════════════════════════════
   REALTIME SUBSCRIPTIONS
   ═══════════════════════════════════════════════════════════════ */
function startRealtimeSubscriptions() {
  S.unsubs.forEach(u => { try { u(); } catch (e) {} });
  S.unsubs = [];

  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/entities/${S.clientId}`), snap => {
    if (!snap.exists()) return;
    S.client = snap.val();
    refilterDocuments();
    renderOverview();
    renderBilling();
    renderDocuments();
    refreshReportIfOpen();
    updateLivePulse();
  }));

  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/projects`), snap => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.projects = all.filter(p => p.clientId === S.clientId);
    refilterDocuments();
    renderProjects();
    renderOverview();
    renderAnalytics();
    renderBilling();
    renderDocuments();
    refreshReportIfOpen();
    updateLivePulse();
  }));

  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/invoices`), snap => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.invoices = all.filter(i => i.clientId === S.clientId);
    renderBilling();
    renderOverview();
    refreshReportIfOpen();
    updateLivePulse();
  }));

  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/payments`), snap => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.payments = all.filter(p => p.clientId === S.clientId);
    renderBilling();
    renderOverview();
    refreshReportIfOpen();
    updateLivePulse();
  }));

  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/appointments`), snap => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.appointments = all.filter(a => a.clientId === S.clientId);
    renderAppointments();
    renderOverview();
    updateLivePulse();
  }));

  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/presentations`), snap => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    const mine = all.filter(p => p.clientId === S.clientId);
    S.presentations = mine;
    S._rawPresentations = mine;
    refilterDocuments();
    renderPresentations();
    renderProjects();
    renderDocuments();
    updateLivePulse();
  }));

  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/documents`), snap => {
    S._rawDocuments = snap.exists() ? Object.values(snap.val()) : [];
    refilterDocuments();
    renderDocuments();
  }));

  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/tickets`), snap => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.tickets = all.filter(t => t && t.clientId === S.clientId)
      .sort((a, b) => (b.lastMessageAt || b.createdAt || '')
        .localeCompare(a.lastMessageAt || a.createdAt || ''));
    renderMessages();
    updateUnreadBadge();
  }));

  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/clientUploads/${S.clientId}`), snap => {
    S.clientUploads = snap.exists() ? snap.val() : {};
    renderUploads();
  }));

  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/products`), snap => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.products = all.filter(p => (p.status || 'active') === 'active');
    renderMarketplace();
  }));

  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/orders`), snap => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    const email = (S.email || '').toLowerCase();
    S.orders = all.filter(o => (o.customerEmail || '').toLowerCase() === email);
    renderMarketplace();
  }));

  /* ── Subscriptions ── */
  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/subscriptions`), snap => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.subscriptions = all.filter(s => s && s.clientId === S.clientId);
    renderOverview();
    updateLivePulse();
  }));

  /* ── Training ── */
  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/training/enrollments/${S.uid}`), snap => {
    S.trainingEnrollments = snap.exists() ? snap.val() : {};
    renderOverview();
  }));

  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/training/progress/${S.uid}`), snap => {
    S.trainingProgress = snap.exists() ? snap.val() : {};
    renderOverview();
  }));

  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/training/courses`), snap => {
    S.trainingCourses = snap.exists() ? Object.values(snap.val()) : [];
    renderOverview();
  }));

  S.unsubs.push(onValue(ref(db, `${ROOT}/${ORG}/training/certificates`), snap => {
    const all = snap.exists() ? Object.values(snap.val()) : [];
    S.trainingCertificates = all.filter(c => c && c.uid === S.uid);
    renderOverview();
  }));

  S.unsubs.push(onValue(ref(db, '.info/connected'), snap => {
    S.liveSync = snap.val() === true;
    updateLivePulse();
  }));
}

function updateLivePulse() {
  const pulse = document.querySelector('.live-sync .pulse-dot');
  if (pulse) pulse.style.background = S.liveSync ? 'var(--accent-green)' : 'var(--accent-red)';
}

/* ═══════════════════════════════════════════════════════════════
   TABS
   ═══════════════════════════════════════════════════════════════ */
function attachTabEvents() {
  document.querySelectorAll('.ptab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.ptab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      $('ptab-' + btn.dataset.ptab).classList.add('active');

      const ma = document.querySelector(`#portalBottomNav .mnav-item[data-mnav="${btn.dataset.ptab}"]`);
      document.querySelectorAll('#portalBottomNav .mnav-item').forEach(x => x.classList.remove('active'));
      if (ma) ma.classList.add('active');

      if (isMobile()) document.querySelector('.portal-main')?.scrollTo({ top: 0, behavior: 'instant' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });

      updateMobileSubChips();
      if (btn.dataset.ptab === 'analytics')     setTimeout(renderAnalyticsCharts, 50);
      if (btn.dataset.ptab === 'marketplace')   renderMarketplace();
      if (btn.dataset.ptab === 'presentations') renderPresentations();
      if (btn.dataset.ptab === 'documents')     renderDocuments();
    };
  });
}

function attachActionEvents() {
  $('pStkSend').onclick      = sendStkPush;
  $('pTkCreate').onclick     = createTicket;
  $('pInvDownload').onclick  = downloadInvoicePdf;
  $('pInvPrint').onclick     = printInvoice;
  $('pFileDownload').onclick = downloadPreviewedFile;
  $('pReportPrintBtn').onclick = () => {
    const m = $('pReportModal');
    m?.classList.add('printing');
    setTimeout(() => {
      window.print();
      setTimeout(() => m?.classList.remove('printing'), 500);
    }, 100);
  };
  $('pReportPdfBtn').onclick = downloadReportPdf;
  $('pThemeToggle').onclick = () => {
    const cur  = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    $('pThemeToggle').innerHTML = next === 'dark'
      ? '<i class="fa-solid fa-moon"></i>'
      : '<i class="fa-solid fa-sun"></i>';
    setTimeout(() => { try { renderOverviewCharts(); } catch (e) {} }, 100);
  };
}

/* ═══════════════════════════════════════════════════════════════
   MOBILE NAV
   ═══════════════════════════════════════════════════════════════ */
const MOBILE_SUB_MAP = {
  overview: [
    { tab: 'overview',      icon: 'fa-house',              label: 'Overview' },
    { tab: 'analytics',     icon: 'fa-chart-line',         label: 'Analytics' },
    { tab: 'presentations', icon: 'fa-chalkboard-user',    label: 'Presentations' },
    { tab: 'messages',      icon: 'fa-comments',           label: 'Messages' },
    { tab: 'appointments',  icon: 'fa-calendar-check',     label: 'Appointments' },
    { tab: 'marketplace',   icon: 'fa-store',              label: 'Marketplace' },
  ],
  projects: [
    { tab: 'projects',      icon: 'fa-folder',             label: 'Projects' },
    { tab: 'analytics',     icon: 'fa-chart-line',         label: 'Analytics' },
    { tab: 'documents',     icon: 'fa-file',               label: 'Documents' },
    { tab: 'presentations', icon: 'fa-chalkboard-user',    label: 'Presentations' },
  ],
  analytics: [
    { tab: 'analytics',     icon: 'fa-chart-line',         label: 'Analytics' },
    { tab: 'projects',      icon: 'fa-folder',             label: 'Projects' },
  ],
  ai:       [{ tab: 'ai', icon: 'fa-wand-magic-sparkles', label: 'AI Assistant' }],
  billing:  [
    { tab: 'billing',   icon: 'fa-coins', label: 'Billing' },
    { tab: 'documents', icon: 'fa-file',  label: 'Documents' },
  ],
  documents: [
    { tab: 'documents',     icon: 'fa-file',            label: 'Documents' },
    { tab: 'presentations', icon: 'fa-chalkboard-user', label: 'Presentations' },
  ],
  messages: [
    { tab: 'messages',     icon: 'fa-comments',        label: 'Messages' },
    { tab: 'appointments', icon: 'fa-calendar-check',  label: 'Appointments' },
  ],
  more: [
    { tab: 'overview',      icon: 'fa-house',              label: 'Overview' },
    { tab: 'projects',      icon: 'fa-folder',             label: 'Projects' },
    { tab: 'analytics',     icon: 'fa-chart-line',         label: 'Analytics' },
    { tab: 'documents',     icon: 'fa-file',               label: 'Documents' },
    { tab: 'presentations', icon: 'fa-chalkboard-user',    label: 'Presentations' },
    { tab: 'billing',       icon: 'fa-coins',              label: 'Billing' },
    { tab: 'ai',            icon: 'fa-wand-magic-sparkles',label: 'AI' },
    { tab: 'messages',      icon: 'fa-comments',           label: 'Messages' },
    { tab: 'appointments',  icon: 'fa-calendar-check',     label: 'Appointments' },
    { tab: 'marketplace',   icon: 'fa-store',              label: 'Marketplace' },
  ],
};

function initMobileNav() {
  document.querySelectorAll('#portalBottomNav .mnav-item').forEach(it => {
    it.onclick = () => setMobileCategory(it.dataset.mnav);
  });
  document.querySelectorAll('.ptab-btn').forEach(btn => {
    btn.addEventListener('click', () => stateSyncMobileCategoryFromTab(btn.dataset.ptab));
  });
  updateMobileSubChips();
}

function stateSyncMobileCategoryFromTab(tab) {
  for (const cat in MOBILE_SUB_MAP) {
    if (MOBILE_SUB_MAP[cat].some(t => t.tab === tab)) {
      S.mobileCategory = cat;
      document.querySelectorAll('#portalBottomNav .mnav-item').forEach(x =>
        x.classList.toggle('active', x.dataset.mnav === cat));
      break;
    }
  }
  updateMobileSubChips();
}

function setMobileCategory(cat) {
  S.mobileCategory = cat;
  document.querySelectorAll('#portalBottomNav .mnav-item').forEach(x =>
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
  const cat = S.mobileCategory || 'overview';
  const tabs = MOBILE_SUB_MAP[cat] || [];
  host.innerHTML = tabs.map(t => {
    const active = document.querySelector(`.ptab-btn[data-ptab="${t.tab}"]`)?.classList.contains('active');
    return `<button type="button" class="chip ${active ? 'active' : ''}" data-mchip="${t.tab}"><i class="fa-solid ${t.icon}"></i><span>${t.label}</span></button>`;
  }).join('');
  host.querySelectorAll('.chip').forEach(c =>
    c.addEventListener('click', () => navigateTo(c.dataset.mchip)));
}
$('mobileAiBtn')?.addEventListener('click',  () => setMobileCategory('ai'));
$('mobileMsgBtn')?.addEventListener('click', () => setMobileCategory('messages'));

/* ═══════════════════════════════════════════════════════════════
   INVOICE MATH
   ═══════════════════════════════════════════════════════════════ */
function invoiceTotal(inv) {
  let sub = (inv.items || []).reduce((s, i) => s + Number(i.amount || 0), 0);
  sub += (inv.extraCharges || []).reduce((s, c) => s + Number(c.amount || 0), 0);
  return sub + sub * (Number(inv.tax || 0) / 100);
}
function invoicePaid(invId) {
  return S.payments.reduce((sum, p) =>
    sum + (p.allocations || [])
      .filter(a => a.invoiceId === invId)
      .reduce((s, a) => s + Number(a.amount || 0), 0), 0);
}

/* ═══════════════════════════════════════════════════════════════
   ANIMATION HELPERS
   ═══════════════════════════════════════════════════════════════ */
function countUp(el, target, duration = 700, formatter) {
  if (!el) return;
  const start = 0;
  const t0 = performance.now();
  const isNum = typeof target === 'number' && isFinite(target);
  if (!isNum) { el.textContent = formatter ? formatter(target) : target; return; }
  function step(t) {
    const k = Math.min(1, (t - t0) / duration);
    const eased = 1 - Math.pow(1 - k, 3);
    const v = start + (target - start) * eased;
    el.textContent = formatter ? formatter(v) : Math.round(v).toLocaleString();
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function skeletonDashboard() {
  return `
    <div class="p-skel p-skel-hero"></div>
    <div class="kpi-grid">
      ${Array.from({length: 6}).map(() => `
        <div class="stat-card" style="height:120px;background:transparent;border:none;box-shadow:none;padding:0;">
          <div class="p-skel p-skel-card"></div>
        </div>`).join('')}
    </div>
    <div class="chart-grid">
      <div class="p-skel p-skel-chart"></div>
      <div class="p-skel p-skel-chart"></div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   SUBSCRIPTION HELPERS
   ═══════════════════════════════════════════════════════════════ */
const _PLAN_LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', lifetime: 'Lifetime' };

function _evaluateSub(sub, nowMs) {
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

function _subPill(sub, ev) {
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

function _subAlertLines(subs, now) {
  const lines = [];
  for (const s of subs) {
    const ev = _evaluateSub(s, now);
    if (s.plan === 'lifetime') continue;
    if (!ev.allowed) {
      if (s.status === 'suspended') continue;
      lines.push({
        kind: 'danger',
        icon: 'fa-triangle-exclamation',
        text: `Subscription <strong>${esc(s.productName || s.productId)}</strong> has <strong>expired</strong>. Renew to keep using it.`,
      });
    } else if (ev.inGrace) {
      const h = Math.max(1, Math.ceil(ev.msRemaining / 3600000));
      lines.push({
        kind: 'danger',
        icon: 'fa-hourglass-half',
        text: `Subscription <strong>${esc(s.productName || s.productId)}</strong> is in its <strong>grace period</strong> — ${h}h left before it locks.`,
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

function _renderSubscriptionBlock(subs, now) {
  if (!subs || !subs.length) {
    return `
      <div class="chart-box" style="margin-bottom:22px;">
        <h4><i class="fa-solid fa-key"></i> My Subscriptions</h4>
        <div class="empty-state" style="padding:24px 12px;text-align:center;">
          <i class="fa-solid fa-box-open" style="font-size:1.6rem;opacity:.4;display:block;margin-bottom:8px;"></i>
          You don't have any active subscriptions yet.
          <div style="margin-top:10px;">
            <a href="https://viora.co.ke/market.html" target="_blank" rel="noopener" class="btn btn-purple btn-sm">
              <i class="fa-solid fa-store"></i> Browse Marketplace
            </a>
          </div>
        </div>
      </div>`;
  }

  let mrr = 0;
  let activeCount = 0;
  let lifetimeCount = 0;
  for (const s of subs) {
    const ev = _evaluateSub(s, now);
    if (s.plan === 'lifetime') { lifetimeCount++; activeCount++; continue; }
    if (ev.allowed) activeCount++;
    const amt = Number(s.amountKES) || 0;
    if (s.plan === 'monthly') mrr += amt;
    else if (s.plan === 'quarterly') mrr += amt / 3;
    else if (s.plan === 'yearly') mrr += amt / 12;
  }

  const alerts = _subAlertLines(subs, now);
  const alertsHtml = alerts.length ? `
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
      ${alerts.map(a => `
        <div class="alert-banner ${a.kind}" style="margin:0;">
          <i class="fa-solid ${a.icon}" style="font-size:1rem;"></i>
          <div>${a.text}</div>
        </div>`).join('')}
    </div>` : '';

  const cards = subs
    .slice()
    .sort((a, b) => String(a.endDate || '').localeCompare(String(b.endDate || '')))
    .map(s => {
      const ev = _evaluateSub(s, now);
      const pill = _subPill(s, ev);
      const isLifetime = s.plan === 'lifetime';
      const planLbl = _PLAN_LABELS[s.plan] || s.plan || '—';
      const endLine = isLifetime ? 'Never expires' : `Renews ${fmtDate(s.endDate)}`;
      const modules = Array.isArray(s.modules) ? s.modules : [];
      const cardCls = pill.cls === 'paid' ? 'success' : pill.cls === 'overdue' ? 'danger' : 'warning';
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
          <div class="subs-card-actions">
            ${!isLifetime && ev.daysRemaining != null && ev.daysRemaining <= 30
              ? `<button class="btn btn-mpesa btn-sm" onclick="window._pRenewSub && window._pRenewSub('${esc(s.productId)}')"><i class="fa-solid fa-mobile-screen-button"></i> Renew</button>`
              : ''}
            <a href="https://viora.co.ke/client.html?renew=${encodeURIComponent(s.productId)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">
              <i class="fa-solid fa-eye"></i> Details
            </a>
          </div>
        </div>`;
    }).join('');

  return `
    <div class="chart-box" style="margin-bottom:22px;">
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

/* ═══════════════════════════════════════════════════════════════
   TRAINING HELPERS
   ═══════════════════════════════════════════════════════════════ */
function _renderTrainingBlock() {
  const enrollments = S.trainingEnrollments || {};
  const progress = S.trainingProgress || {};
  const courses = Array.isArray(S.trainingCourses) ? S.trainingCourses : [];
  const certs = Array.isArray(S.trainingCertificates) ? S.trainingCertificates : [];

  const enrolledIds = Object.keys(enrollments);
  if (!enrolledIds.length && !certs.length) return '';

  const coursesById = new Map(courses.map(c => [c.id, c]));

  let totalModules = 0;
  let totalDone = 0;

  const rows = enrolledIds.map(cid => {
    const course = coursesById.get(cid);
    const enroll = enrollments[cid] || {};
    const prog = progress[cid] || {};
    const moduleIds = course ? Object.keys(course.modules || {}) : [];
    const modulesDone = moduleIds.filter(mid => prog[mid] && prog[mid].completedAt).length;
    const pct = moduleIds.length ? Math.round((modulesDone / moduleIds.length) * 100) : 0;
    const isComplete = pct >= 100 || !!enroll.completedAt;
    totalModules += moduleIds.length;
    totalDone += modulesDone;

    const cls = isComplete ? 'paid' : pct > 0 ? 'pending' : 'gray';
    const label = isComplete ? 'Completed' : pct > 0 ? `In Progress · ${pct}%` : 'Not started';
    const cert = certs.find(c => c.courseId === cid);

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
      ${certs.slice(0, 4).map(c => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,200,87,.08);border:1px solid var(--accent-gold);border-radius:8px;font-size:.78rem;margin-bottom:4px;">
          <span>🎓 ${esc(c.courseTitle || c.courseId)}</span>
          <span style="font-family:monospace;font-size:.68rem;color:var(--text-secondary);">${esc(c.code || c.id)}</span>
        </div>`).join('')}
    </div>` : '';

  const overallPct = totalModules ? Math.round((totalDone / totalModules) * 100) : 0;

  return `
    <div class="chart-box" style="margin-bottom:22px;">
      <h4>
        <i class="fa-solid fa-graduation-cap"></i> My Training
        <span style="font-weight:400;color:var(--text-light);font-size:.75rem;">(${enrolledIds.length} course${enrolledIds.length === 1 ? '' : 's'})</span>
      </h4>
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:14px;">
        <div class="stat-card" style="padding:12px;">
          <div class="label">Enrolled Courses</div>
          <div class="number" style="font-size:1.2rem;">${enrolledIds.length}</div>
        </div>
        <div class="stat-card" style="padding:12px;">
          <div class="label">Overall Progress</div>
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
   OVERVIEW
   ═══════════════════════════════════════════════════════════════ */
let _overviewSig = '';

function _overviewSignature() {
  return [
    S.projects.length,
    S.invoices.length,
    S.payments.length,
    S.appointments.length,
    S.presentations.length,
    S.tickets.filter(t => t.status !== 'closed').length,
    S.documents.length,
    S.projects.map(p => p.progress || 0).join(','),
    S.client?._rev || '',
    S.client?.name || '',
    (S.subscriptions || []).map(s => `${s.id}:${s.status}:${s.endDate}`).join(','),
    Object.keys(S.trainingEnrollments || {}).length,
    Object.keys(S.trainingProgress || {}).map(cid =>
      Object.keys(S.trainingProgress[cid] || {}).length
    ).join(','),
    (S.trainingCertificates || []).length,
  ].join('|');
}

function renderOverview() {
  const host = $('ptab-overview');
  if (!host) return;

  if (!S._firstRenderDone) {
    host.innerHTML = skeletonDashboard();
    return;
  }

  const sig = _overviewSignature();
  if (sig === _overviewSig && host.querySelector('.client-360-hero')) {
    return;
  }
  _overviewSig = sig;

  const c = S.client || {};
  const activeProjects  = S.projects.filter(p => p.status === 'active').length;
  const totalInvoiced   = S.invoices.reduce((s, i) => s + invoiceTotal(i), 0);
  const totalPaid       = S.invoices.reduce((s, i) => s + invoicePaid(i.id), 0);
  const outstanding     = Math.max(0, totalInvoiced - totalPaid);
  const openTickets     = S.tickets.filter(t => t.status !== 'closed').length;
  const upcomingAppts   = S.appointments.filter(a => a.date >= todayStr() && a.status === 'scheduled');
  const totalAgreed     = getTotalAgreed(c);
  const cTotalPaid      = getTotalPaid(c);
  const balance         = Math.max(0, totalAgreed - cTotalPaid);
  const totalDocs       = S.documents.length;
  const presCount       = S.presentations.length;
  const avgProgress     = S.projects.length
    ? Math.round(S.projects.reduce((s, p) => s + Number(p.progress || 0), 0) / S.projects.length)
    : 0;

  host.innerHTML = `
    <div class="client-360-hero">
      <div class="hero-info">
        <h3>Welcome back, ${esc((c.name || 'Client').split(' ')[0])}</h3>
        <div class="subtitle">${esc(c.clientId || '')}${c.company ? ' · ' + esc(c.company) : ''}${c.city ? ' · ' + esc(c.city) : ''}</div>
      </div>
      <button class="btn btn-primary" onclick="window._pReport()">
        <i class="fa-solid fa-file-lines"></i> Generate Report
      </button>
    </div>

    ${balance > 0 ? `
    <div style="padding:16px 20px;background:linear-gradient(135deg, rgba(255,200,87,.12), rgba(255,92,124,.06));border-left:4px solid var(--accent-gold);border-radius:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;animation:fadeInUp .4s ease both;">
      <div>
        <strong style="color:var(--accent-gold);font-size:1.05rem;">Outstanding Balance: ${fmtKES(balance)}</strong>
        <div style="font-size:.76rem;color:var(--text-secondary);margin-top:3px;">Agreed ${fmtKES(totalAgreed)} · Paid ${fmtKES(cTotalPaid)}</div>
      </div>
      <button class="btn btn-mpesa btn-sm" onclick="window._pPayBalance()">
        <i class="fa-solid fa-mobile-screen-button"></i> Pay Now
      </button>
    </div>` : ''}

    <div class="kpi-grid p-stagger">
      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid fa-folder"></i></div>
        <div class="number"><span class="p-count-up" data-count="${activeProjects}">0</span></div>
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
        <div class="number"><span class="p-count-up" data-count="${S.invoices.length}">0</span></div>
        <div class="label">Invoices</div>
      </div>

      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid fa-file"></i></div>
        <div class="number"><span class="p-count-up" data-count="${totalDocs}">0</span></div>
        <div class="label">Documents</div>
      </div>

      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid fa-chalkboard-user"></i></div>
        <div class="number"><span class="p-count-up" data-count="${presCount}">0</span></div>
        <div class="label">Presentations</div>
      </div>

      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid fa-chart-line"></i></div>
        <div class="number"><span class="p-count-up" data-count="${avgProgress}">0</span>%</div>
        <div class="label">Avg. Progress</div>
      </div>

      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid fa-comments"></i></div>
        <div class="number"><span class="p-count-up" data-count="${openTickets}">0</span></div>
        <div class="label">Open Tickets</div>
      </div>

      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid fa-calendar-check"></i></div>
        <div class="number"><span class="p-count-up" data-count="${upcomingAppts.length}">0</span></div>
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
            ? S.presentations.slice(0, 5).map(p => `
              <div class="p-tl-item ${p.status === 'accepted' ? 'success' : p.status === 'rejected' ? 'danger' : 'purple'}">
                <div class="p-tl-title">${esc(p.title || '')}</div>
                <div class="p-tl-desc">${esc(p.type || '')} · ${esc(p.presenterName || '')}</div>
                <div class="p-tl-time">${fmtDate(p.date)} · ${timeAgo(p.updatedAt || p.createdAt)}</div>
              </div>`).join('')
            : '<div class="empty-state" style="padding:20px;">No presentations yet.</div>'}
        </div>
      </div>

      <div class="chart-box">
        <h4><i class="fa-solid fa-bolt"></i> Recent Activity</h4>
        <div class="p-timeline">
          ${_buildActivityFeed().length
            ? _buildActivityFeed().map(e => `
              <div class="p-tl-item ${e.kind}">
                <div class="p-tl-title">${esc(e.title)}</div>
                <div class="p-tl-desc">${esc(e.desc || '')}</div>
                <div class="p-tl-time">${timeAgo(e.at)}</div>
              </div>`).join('')
            : '<div class="empty-state" style="padding:20px;">No activity yet.</div>'}
        </div>
      </div>
    </div>

    ${upcomingAppts.length ? `
    <div class="chart-box" style="margin-bottom:20px;">
      <h4><i class="fa-solid fa-calendar-check"></i> Upcoming Appointments</h4>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;">
        ${upcomingAppts.slice(0, 4).map(a => {
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

    ${_renderSubscriptionBlock(S.subscriptions || [], Date.now())}

    ${_renderTrainingBlock()}
  `;

  requestAnimationFrame(() => {
    document.querySelectorAll('.p-count-up').forEach(el => {
      const target = Number(el.dataset.count || 0);
      countUp(el, target, 700);
    });
  });

  setTimeout(renderOverviewCharts, 40);
}

function _buildActivityFeed() {
  const out = [];
  S.payments.forEach(p => out.push({
    at: p.createdAt || p.date,
    title: `Payment received — ${fmtKES(p.amount)}`,
    desc: p.method ? `Via ${p.method}` : '',
    kind: 'success'
  }));
  S.invoices.forEach(i => {
    const st = invoicePaid(i.id) >= invoiceTotal(i) - 0.01 ? 'paid' : 'pending';
    out.push({
      at: i.createdAt || i.date,
      title: `Invoice ${i.number || ''} ${st}`,
      desc: fmtKES(invoiceTotal(i)),
      kind: st === 'paid' ? 'success' : 'warning'
    });
  });
  S.projects.forEach(p => {
    if (p._progressUpdatedAt) out.push({
      at: p._progressUpdatedAt,
      title: `${p.title || p.projectNumber} progress updated`,
      desc: `${p.progress || 0}% complete`,
      kind: 'info'
    });
  });
  S.presentations.forEach(p => out.push({
    at: p.updatedAt || p.createdAt || p.date,
    title: `Presentation — ${p.title || ''}`,
    desc: `${p.status || ''} · ${p.presenterName || ''}`,
    kind: p.status === 'accepted' ? 'success' : p.status === 'rejected' ? 'danger' : 'purple'
  }));
  S.appointments.forEach(a => {
    if (a.heldAt) out.push({
      at: a.heldAt,
      title: `Appointment held — ${a.title || ''}`,
      desc: a.type || '',
      kind: 'success'
    });
  });

  return out
    .filter(e => e.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 10);
}

/* ═══════════════════════════════════════════════════════════════
   OVERVIEW CHARTS
   ═══════════════════════════════════════════════════════════════ */
function renderOverviewCharts() {
  const tc = getTextColor();

  if (S.charts.pProg) { try { S.charts.pProg.destroy(); } catch (e) {} S.charts.pProg = null; }
  const canvas1 = $('pProgChart');
  if (canvas1 && typeof Chart !== 'undefined') {
    const projects = S.projects.slice(0, 8);
    S.charts.pProg = new Chart(canvas1.getContext('2d'), {
      type: 'bar',
      data: {
        labels: projects.map(p => (p.projectNumber || p.title || '').slice(0, 12)),
        datasets: [{
          label: 'Progress %',
          data: projects.map(p => p.progress || 0),
          backgroundColor: projects.map(p =>
            (p.progress || 0) >= 100 ? 'rgba(34,230,160,.75)'
            : (p.progress || 0) >= 50 ? 'rgba(0,212,255,.75)'
            : 'rgba(255,200,87,.75)'),
          borderColor: '#00d4ff',
          borderWidth: 1,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 100,
              ticks: { color: tc, callback: v => v + '%' },
              grid: { color: 'rgba(148,163,184,0.15)' } },
          x: { ticks: { color: tc, font: { size: 9 } }, grid: { display: false } }
        }
      }
    });
  }

  if (S.charts.pInv) { try { S.charts.pInv.destroy(); } catch (e) {} S.charts.pInv = null; }
  const canvas2 = $('pInvChart');
  if (canvas2 && typeof Chart !== 'undefined') {
    const paid    = S.invoices.filter(i => invoicePaid(i.id) >= invoiceTotal(i) - 0.01).length;
    const partial = S.invoices.filter(i => invoicePaid(i.id) > 0.01 && invoicePaid(i.id) < invoiceTotal(i) - 0.01).length;
    const unpaid  = S.invoices.length - paid - partial;
    const labels = [], values = [], colors = [];
    if (paid)    { labels.push('Paid');    values.push(paid);    colors.push('rgba(34,230,160,.85)'); }
    if (partial) { labels.push('Partial'); values.push(partial); colors.push('rgba(255,200,87,.85)'); }
    if (unpaid)  { labels.push('Unpaid');  values.push(unpaid);  colors.push('rgba(255,92,124,.85)'); }
    if (!labels.length) { labels.push('No invoices'); values.push(1); colors.push('rgba(148,163,184,.4)'); }

    S.charts.pInv = new Chart(canvas2.getContext('2d'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#0a0a0f', borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: tc, font: { size: 11 }, boxWidth: 12, usePointStyle: true }
          }
        }
      }
    });
  }
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
    <div class="card-3d-grid p-stagger">
      ${S.projects.map(p => {
        const prog = Number(p.progress || 0);
        const cls  = prog >= 100 ? 'green' : prog >= 50 ? '' : 'gold';
        const milestones = Array.isArray(p.milestones) ? p.milestones : [];
        const presForThis = S.presentations.filter(pr => pr.clientId === p.clientId);
        return `
          <div class="card-3d">
            <div class="card-info">
              <div class="card-title">${esc(p.title || 'Untitled')} <span class="badge badge-${esc(p.status || 'active')}">${esc(p.status || '')}</span></div>
              <div class="card-sub">${esc(p.projectNumber || '')}${p.serviceArea ? ' · ' + esc(p.serviceArea) : ''}${p.platform ? ' · ' + esc(p.platform) : ''}</div>
              <div class="progress-3d" style="margin-top:10px;"><div class="progress-3d-bar ${cls}" style="width:${prog}%"></div></div>
              <div class="progress-3d-label"><span>Progress</span><span>${prog}%</span></div>
              <div class="card-stats" style="margin-top:10px;">
                ${p.nextMilestone ? `<div class="stat"><span class="val">${fmtDate(p.nextMilestone)}</span><span class="lbl">Next</span></div>` : ''}
                ${p.deadline      ? `<div class="stat"><span class="val">${fmtDate(p.deadline)}</span><span class="lbl">Deadline</span></div>` : ''}
                ${p.startDate     ? `<div class="stat"><span class="val">${fmtDate(p.startDate)}</span><span class="lbl">Started</span></div>` : ''}
              </div>
              ${milestones.length ? `
                <div class="milestone-timeline">
                  ${milestones.map(m => `
                    <div class="milestone-item ${m.done ? 'done' : ''}">
                      <div class="ms-dot"></div>
                      <div class="ms-body">
                        <div class="ms-title">${esc(m.title || '')}</div>
                        <div class="ms-date">${fmtDate(m.date)}</div>
                      </div>
                    </div>`).join('')}
                </div>` : ''}
              ${p.description ? `<div class="card-sub" style="margin-top:8px;">${esc(p.description)}</div>` : ''}
              ${presForThis.length ? `
                <div style="margin-top:12px;">
                  <div style="font-size:.7rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">Presentations</div>
                  ${presForThis.slice(0, 3).map(pr => `
                    <div style="padding:8px 10px;background:var(--bg-input);border-radius:8px;font-size:.78rem;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;gap:6px;">
                      <span><i class="fa-solid fa-chalkboard-user" style="color:var(--accent-blue);margin-right:6px;"></i>${esc(pr.title || '')}</span>
                      <span class="badge badge-${pr.status === 'accepted' ? 'paid' : pr.status === 'rejected' ? 'overdue' : 'pending'}" style="font-size:.55rem;">${esc(pr.status || '')}</span>
                    </div>`).join('')}
                </div>` : ''}
            </div>
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
    <div class="chart-grid p-stagger">
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
        labels: S.projects.map(p => (p.projectNumber || '').slice(0, 10)),
        datasets: [{
          label: 'Progress %',
          data: S.projects.map(p => p.progress || 0),
          borderColor: '#00d4ff',
          backgroundColor: 'rgba(0,212,255,0.15)',
          borderWidth: 3, tension: .4, fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 100,
              ticks: { color: tc, callback: v => v + '%' },
              grid: { color: 'rgba(148,163,184,0.15)' } },
          x: { ticks: { color: tc, font: { size: 9 } }, grid: { display: false } }
        }
      }
    });
  }

  if (S.charts.pAna2) { try { S.charts.pAna2.destroy(); } catch (e) {} }
  const c2 = $('pAna2');
  if (c2) {
    const counts = {};
    S.projects.forEach(p => {
      const a = p.serviceArea || 'Other';
      counts[a] = (counts[a] || 0) + 1;
    });
    const palette = ['#00d4ff','#7c3aed','#ff6ec7','#22e6a0','#ffc857','#a855f7','#ff5c7c'];
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
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: tc, font: { size: 11 }, boxWidth: 12, usePointStyle: true }
          }
        }
      }
    });
  }

  if (S.charts.pAna3) { try { S.charts.pAna3.destroy(); } catch (e) {} }
  const c3 = $('pAna3');
  if (c3) {
    const invData = S.invoices.map(i => ({
      label: i.number || '',
      invoiced: invoiceTotal(i),
      paid: invoicePaid(i.id)
    }));
    S.charts.pAna3 = new Chart(c3.getContext('2d'), {
      type: 'bar',
      data: {
        labels: invData.map(i => i.label),
        datasets: [
          { label: 'Invoiced', data: invData.map(i => i.invoiced),
            backgroundColor: 'rgba(0,212,255,0.75)', borderRadius: 8 },
          { label: 'Paid',     data: invData.map(i => i.paid),
            backgroundColor: 'rgba(34,230,160,0.75)', borderRadius: 8 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: tc, font: { size: 11 } } } },
        scales: {
          y: { beginAtZero: true,
              ticks: { color: tc, callback: v => 'KSh ' + Number(v).toLocaleString() },
              grid: { color: 'rgba(148,163,184,0.15)' } },
          x: { ticks: { color: tc, font: { size: 10 } }, grid: { display: false } }
        }
      }
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   DOCUMENTS
   ═══════════════════════════════════════════════════════════════ */
function _docCategories() {
  const cats = new Set();
  S.documents.forEach(d => {
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

  const cats = _docCategories();
  const list = S._docFilter === 'all'
    ? S.documents
    : S.documents.filter(d =>
        (d.category || (d._source === 'presentation' ? 'Presentation'
          : d._source === 'client' ? 'Client Document' : 'Other')) === S._docFilter
      );

  const chipsHtml = cats.map(c => `
    <button type="button" class="${c === S._docFilter ? 'active' : ''}" data-doc-filter="${esc(c)}">
      ${c === 'all' ? 'All (' + S.documents.length + ')' : esc(c)}
    </button>`).join('');

  host.innerHTML = `
    <div class="page-header">
      <div>
        <h1><span class="highlight">Documents</span></h1>
        <p class="page-desc">Every contract, invoice, deliverable, and file shared with you — live from VIORA.</p>
      </div>
    </div>

    <div class="p-chips">${chipsHtml}</div>

    <div class="chart-box" style="margin-bottom:20px;">
      <h4>
        <i class="fa-solid fa-paperclip"></i> Files for you
        <span style="color:var(--text-light);font-weight:400;">(${list.length})</span>
      </h4>
      ${list.length ? `
        <div class="p-doc-grid p-stagger">
          ${list.map((d, i) => _renderDocCard(d, i)).join('')}
        </div>
      ` : `
        <div class="empty-state" style="padding:40px 20px;">
          <i class="fa-solid fa-folder-open" style="font-size:2rem;opacity:.35;display:block;margin-bottom:10px;"></i>
          ${S.documents.length ? 'No documents match this filter.' : 'No documents yet.'}
        </div>
      `}
    </div>

    <div class="chart-box">
      <h4><i class="fa-solid fa-cloud-arrow-up"></i> Upload to VIORA</h4>
      <p style="font-size:.8rem;color:var(--text-secondary);margin-bottom:12px;">
        Send us your KYC documents, IDs, signed contracts, survey maps, or anything else we need.
      </p>
      <div class="doc-upload-zone" id="pUploadZone">
        <i class="fa-solid fa-cloud-arrow-up" style="font-size:2rem;color:var(--accent-blue);"></i>
        <div style="font-weight:700;margin-top:10px;">Click to choose a file</div>
        <div style="font-size:.72rem;color:var(--text-secondary);margin-top:4px;">Max 5 MB · PDFs, images, spreadsheets</div>
        <input type="file" id="pUploadInput" style="display:none;" />
      </div>
      <div id="pUploadList" style="margin-top:16px;"></div>
    </div>
  `;

  host.querySelectorAll('[data-doc-filter]').forEach(btn => {
    btn.onclick = () => {
      S._docFilter = btn.dataset.docFilter;
      renderDocuments();
    };
  });

  list.forEach((d, i) => {
    const view = host.querySelector(`[data-doc-view="${i}"]`);
    const dl   = host.querySelector(`[data-doc-download="${i}"]`);
    if (view) view.onclick = () => _previewDoc(d);
    if (dl)   dl.onclick   = () => _downloadDoc(d);
  });

  const zone  = $('pUploadZone');
  const input = $('pUploadInput');
  if (zone && input) {
    zone.onclick = () => input.click();
    input.onchange = e => {
      const f = e.target.files[0];
      if (f) handleClientUpload(f);
      input.value = '';
    };
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.style.borderColor = 'var(--accent-blue)';
    });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.style.borderColor = '';
      if (e.dataTransfer.files[0]) handleClientUpload(e.dataTransfer.files[0]);
    });
  }
  renderUploads();
}

function _renderDocCard(d, i) {
  const iconCls  = fileIcon(d.fileName || d.name || d.title, d.mime);
  const thumbImg = (String(d.mime || '').startsWith('image/') && d.data)
    ? `<div class="dc-thumb"><img src="${d.data}" alt="" loading="lazy" onerror="this.style.display='none';" /></div>`
    : '';
  const isPres    = d._source === 'presentation';
  const isProject = d._source === 'vault' && d.projectId;
  const tagClass  = isPres ? 'pres' : isProject ? 'project' : '';
  const tagLabel  = isPres ? 'Presentation' : isProject ? 'Project' : (d.category || 'Document');
  const sourceLine = d._presentation
    ? `<div class="dc-meta"><i class="fa-solid fa-chalkboard-user"></i> ${esc(d._presentation.title || '')}</div>`
    : d.projectId
      ? `<div class="dc-meta"><i class="fa-solid fa-folder"></i> Project file</div>`
      : '';

  return `
    <div class="p-doc-card">
      ${thumbImg}
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
      ${sourceLine}
      <div class="dc-actions">
        ${d.data ? `
          <button class="btn btn-primary btn-xs" data-doc-view="${i}"><i class="fa-solid fa-eye"></i> View</button>
          <button class="btn btn-success btn-xs" data-doc-download="${i}"><i class="fa-solid fa-download"></i></button>
        ` : `
          <span style="font-size:.7rem;color:var(--text-light);">File metadata only</span>
        `}
      </div>
    </div>
  `;
}

function _previewDoc(d) {
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
  } else if (mime.startsWith('text/') || /\.(txt|md|log|csv)$/i.test(d.fileName || '')) {
    try {
      const b64 = d.data.split(',')[1] || '';
      const text = atob(b64);
      body.innerHTML = `<pre style="white-space:pre-wrap;text-align:left;padding:14px;background:var(--bg-card-solid);border-radius:12px;font-family:ui-monospace,Menlo,monospace;font-size:.78rem;">${esc(text)}</pre>`;
    } catch (e) {
      body.innerHTML = `<div style="padding:40px 20px;"><i class="fa-solid fa-file" style="font-size:60px;color:var(--text-light);"></i><p style="margin-top:16px;">Preview not available.</p></div>`;
    }
  } else {
    body.innerHTML = `<div style="padding:40px 20px;"><i class="fa-solid fa-file" style="font-size:60px;color:var(--text-light);"></i><p style="margin-top:16px;">Preview not available — click Download.</p></div>`;
  }
  openPModal('pFilePreviewModal');
}

function _downloadDoc(d) {
  if (!d || !d.data) return toast('File data unavailable.', 'warning');
  const a = document.createElement('a');
  a.href = d.data;
  a.download = d.fileName || d.name || d.title || 'document';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
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
      ${list.map(u => `
        <div class="p-doc-card">
          <div class="dc-head">
            <div class="dc-icon"><i class="fa-solid ${fileIcon(u.name, u.mime)}"></i></div>
            <div class="dc-title-block">
              <div class="dc-title">${esc(u.name)}</div>
              <div class="dc-meta">${fmtBytes(u.size)} · ${timeAgo(u.uploadedAt)}</div>
              <span class="dc-tag ${u.status === 'approved' ? 'project' : ''}">${esc(u.status || 'pending')}</span>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function handleClientUpload(file) {
  if (S.uploading) return toast('Upload in progress, please wait.', 'warning');
  if (file.size > 5 * 1024 * 1024) return toast('File must be under 5 MB.', 'error');

  S.uploading = true;
  toast('Uploading…', 'info');
  try {
    const data = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const id = 'up-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const record = {
      id, name: file.name, size: file.size,
      mime: file.type || 'application/octet-stream',
      data, category: 'Client upload',
      uploadedAt: new Date().toISOString(),
      uploadedBy: S.uid,
      uploaderName: S.client?.name || S.email,
      status: 'pending'
    };
    await set(ref(db, `${ROOT}/${ORG}/clientUploads/${S.clientId}/${id}`), record);
    toast('Uploaded ✓', 'success');
  } catch (e) {
    toast('Upload failed: ' + e.message, 'error');
  } finally {
    S.uploading = false;
  }
}

function downloadPreviewedFile() {
  if (!S.filePreview || !S.filePreview.data) return;
  const a = document.createElement('a');
  a.href = S.filePreview.data;
  a.download = S.filePreview.fileName || S.filePreview.name || 'document';
  a.click();
}

/* ═══════════════════════════════════════════════════════════════
   PRESENTATIONS
   ═══════════════════════════════════════════════════════════════ */
function _presCategories() {
  const set = new Set();
  S.presentations.forEach(p => { if (p.status) set.add(p.status); });
  return ['all', ...[...set].sort()];
}

function renderPresentations() {
  const host = $('ptab-presentations');
  if (!host) return;

  const cats = _presCategories();
  const list = S._presFilter === 'all'
    ? S.presentations
    : S.presentations.filter(p => p.status === S._presFilter);

  const chipsHtml = cats.map(c => `
    <button type="button" class="${c === S._presFilter ? 'active' : ''}" data-pres-filter="${esc(c)}">
      ${c === 'all' ? 'All (' + S.presentations.length + ')' : esc(c)}
    </button>`).join('');

  host.innerHTML = `
    <div class="page-header">
      <div>
        <h1><span class="highlight">Presentations</span></h1>
        <p class="page-desc">Every deck, demo, and walkthrough we've delivered to you — plus all attachments.</p>
      </div>
    </div>

    <div class="p-chips">${chipsHtml}</div>

    ${list.length ? `
      <div class="p-pres-grid p-stagger">
        ${list.map((p, i) => _renderPresCard(p, i)).join('')}
      </div>
    ` : `
      <div class="chart-box">
        <div class="empty-state" style="padding:50px 20px;">
          <i class="fa-solid fa-chalkboard-user" style="font-size:2.4rem;opacity:.35;display:block;margin-bottom:12px;"></i>
          ${S.presentations.length ? 'No presentations match this filter.' : 'No presentations yet. Your project lead will share walkthroughs here.'}
        </div>
      </div>
    `}
  `;

  host.querySelectorAll('[data-pres-filter]').forEach(btn => {
    btn.onclick = () => { S._presFilter = btn.dataset.presFilter; renderPresentations(); };
  });

  list.forEach((p, pi) => {
    (p.attachments || []).forEach((att, ai) => {
      const view = host.querySelector(`[data-pres-view="${pi}-${ai}"]`);
      const dl   = host.querySelector(`[data-pres-download="${pi}-${ai}"]`);
      const merged = {
        title: att.name || att.title || 'Attachment',
        fileName: att.name || '',
        mime: att.mime || '',
        size: att.size || 0,
        data: att.data,
        uploadedAt: p.updatedAt || p.createdAt || p.date
      };
      if (view) view.onclick = () => _previewDoc(merged);
      if (dl)   dl.onclick   = () => _downloadDoc(merged);
    });
  });
}

function _renderPresCard(p, i) {
  const statusCls = p.status === 'accepted' ? 'accepted'
                  : p.status === 'rejected' ? 'rejected'
                  : p.status === 'delivered' ? 'delivered' : '';
  const attachments = Array.isArray(p.attachments) ? p.attachments : [];
  const attHtml = attachments.length ? `
    <div class="pc-att-list">
      ${attachments.map((att, ai) => {
        return `
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
          </div>`;
      }).join('')}
    </div>
  ` : '';

  return `
    <div class="p-pres-card ${statusCls}">
      <div class="pc-head">
        <div class="pc-icon"><i class="fa-solid fa-chalkboard-user"></i></div>
        <div class="pc-title-block">
          <div class="pc-title">${esc(p.title || 'Presentation')}</div>
          <div class="pc-sub">${esc(p.type || '')}${p.channel ? ' · ' + esc(p.channel) : ''}</div>
        </div>
        <span class="badge badge-${p.status === 'accepted' ? 'paid' : p.status === 'rejected' ? 'overdue' : p.status === 'delivered' ? 'sent' : 'pending'}">${esc(p.status || '')}</span>
      </div>

      <div class="pc-meta">
        <span><i class="fa-solid fa-calendar"></i> ${fmtDate(p.date)}</span>
        ${p.presenterName ? `<span><i class="fa-solid fa-user"></i> ${esc(p.presenterName)}</span>` : ''}
        ${p.duration ? `<span><i class="fa-regular fa-clock"></i> ${p.duration} min</span>` : ''}
      </div>

      ${p.summary ? `<div class="pc-summary">${esc(p.summary)}</div>` : ''}

      ${attachments.length ? `
        <div style="font-size:.68rem;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:.4px;">
          <i class="fa-solid fa-paperclip"></i> Attachments (${attachments.length})
        </div>
        ${attHtml}
      ` : ''}

      ${p.outcome ? `
        <div style="padding:8px 10px;background:rgba(34,230,160,.08);border-left:3px solid var(--accent-green);border-radius:6px;font-size:.76rem;">
          <strong>Outcome:</strong> ${esc(p.outcome)}
        </div>
      ` : ''}

      ${p.nextSteps ? `
        <div style="padding:8px 10px;background:rgba(0,212,255,.06);border-left:3px solid var(--accent-blue);border-radius:6px;font-size:.76rem;">
          <strong>Next:</strong> ${esc(p.nextSteps)}
        </div>
      ` : ''}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   BILLING
   ═══════════════════════════════════════════════════════════════ */
function renderBilling() {
  const c = S.client || {};
  const open   = S.invoices.filter(i => invoicePaid(i.id) < invoiceTotal(i) - 0.01);
  const closed = S.invoices.filter(i => invoicePaid(i.id) >= invoiceTotal(i) - 0.01);
  const totalAgreed = getClientAgreedTotalFromProjects(S.clientId);
  const clientPaid  = getClientPaidTotalFromProjects(S.clientId);
  const clientBalance = Math.max(0, totalAgreed - clientPaid);
  const myProjects = (S.projects || []).filter(p => p.clientId === S.clientId && p.status !== 'cancelled');

  $('ptab-billing').innerHTML = `
    <div class="page-header">
      <div>
        <h1><span class="highlight">Billing & Payments</span></h1>
        <p class="page-desc">Pay outstanding invoices directly via M-Pesa. Download receipts anytime.</p>
      </div>
      <div class="actions">
        <button class="btn btn-outline btn-sm" onclick="window._pReport()"><i class="fa-solid fa-file-lines"></i> Full Report</button>
      </div>
    </div>

    <div class="kpi-grid p-stagger" style="margin-bottom:20px;">
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-file-invoice-dollar"></i></div><div class="number" style="font-size:1.15rem;">${fmtKES(totalAgreed)}</div><div class="label">Total Agreed</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-coins"></i></div><div class="number" style="font-size:1.15rem;color:var(--accent-green);">${fmtKES(clientPaid)}</div><div class="label">Total Paid</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-hourglass"></i></div><div class="number" style="font-size:1.15rem;color:${clientBalance > 0 ? 'var(--accent-red)' : 'var(--accent-green)'};">${fmtKES(clientBalance)}</div><div class="label">Balance Due</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-file-invoice"></i></div><div class="number"><span class="p-count-up" data-count="${open.length}">0</span></div><div class="label">Open Invoices</div></div>
    </div>

    ${myProjects.length ? `
    <div class="chart-box" style="margin-bottom:20px;">
      <h4><i class="fa-solid fa-folder"></i> Project breakdown (${myProjects.length})</h4>
      <div class="table-wrapper" style="background:transparent;border:none;box-shadow:none;margin:0;">
        <table style="min-width:auto;">
          <thead><tr>
            <th>Project</th>
            <th>Status</th>
            <th style="text-align:right;">Agreed</th>
            <th style="text-align:right;">Paid</th>
            <th style="text-align:right;">Balance</th>
            <th>Progress</th>
          </tr></thead>
          <tbody>
            ${myProjects.map(p => {
              const agreed = getProjectAgreedTotal(p.id);
              const paid   = getProjectPaidTotal(p.id);
              const bal    = Math.max(0, agreed - paid);
              const ppct   = agreed > 0 ? Math.min(100, Math.round((paid / agreed) * 100)) : 0;
              const cls    = ppct >= 100 ? 'green' : ppct >= 50 ? '' : 'gold';
              return `<tr>
                <td><strong>${esc(p.projectNumber || '—')}</strong><br>
                    <small style="color:var(--text-secondary);">${esc(p.title || '')}</small></td>
                <td><span class="badge badge-${esc(p.status || 'active')}">${esc(p.status || 'active')}</span></td>
                <td style="text-align:right;">${fmtKES(agreed)}</td>
                <td style="text-align:right;color:var(--accent-green);">${fmtKES(paid)}</td>
                <td style="text-align:right;color:${bal > 0 ? 'var(--accent-gold)' : 'var(--accent-green)'};">${fmtKES(bal)}</td>
                <td style="min-width:100px;">
                  <div class="progress-3d" style="height:5px;"><div class="progress-3d-bar ${cls}" style="width:${ppct}%;"></div></div>
                  <div style="font-size:.65rem;color:var(--text-secondary);text-align:center;">${ppct}%</div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <h3 style="margin:20px 0 12px;font-family:'Space Grotesk';font-size:1.05rem;">Open Invoices</h3>
    ${open.length ? `
      <div class="card-3d-grid p-stagger">
        ${open.map(inv => {
          const total = invoiceTotal(inv);
          const paid  = invoicePaid(inv.id);
          const bal   = total - paid;
          return `<div class="card-3d overdue">
            <div class="card-info">
              <div class="card-title">${esc(inv.number || 'Invoice')} <span class="badge badge-overdue">Due ${fmtDate(inv.dueDate)}</span></div>
              <div class="card-sub">Balance: <strong>${fmtKES(bal)}</strong> of ${fmtKES(total)}</div>
              ${inv.notes ? `<div class="card-sub" style="margin-top:4px;">${esc(inv.notes)}</div>` : ''}
              <div class="card-actions" style="margin-top:12px;">
                <button class="btn btn-mpesa btn-sm" data-payinv="${esc(inv.id)}"><i class="fa-solid fa-mobile-screen-button"></i> Pay</button>
                <button class="btn btn-outline btn-sm" data-vievinv="${esc(inv.id)}"><i class="fa-solid fa-eye"></i> View</button>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    ` : '<div class="empty-state">🌟 No open invoices. You\'re all caught up.</div>'}

    ${closed.length ? `
    <h3 style="margin:28px 0 12px;font-family:'Space Grotesk';font-size:1.05rem;">Paid Invoices</h3>
    <div class="table-wrapper">
      <table><thead><tr><th>Number</th><th>Date</th><th>Due</th><th style="text-align:right;">Total</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${closed.map(inv => `<tr>
          <td><strong>${esc(inv.number)}</strong></td>
          <td>${fmtDate(inv.date)}</td>
          <td>${fmtDate(inv.dueDate)}</td>
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
        ${S.payments.length ? S.payments.map(p => `<tr>
          <td>${fmtDate(p.date)}</td>
          <td>${esc(p.method || '')}</td>
          <td style="font-family:monospace;font-size:.78rem;">${esc(p.reference || '—')}</td>
          <td style="text-align:right;"><strong>${fmtKES(p.amount)}</strong></td>
        </tr>`).join('') : '<tr><td colspan="4" class="empty-state">No payments yet.</td></tr>'}
      </tbody></table>
    </div>
  `;

  document.querySelectorAll('[data-payinv]').forEach(b => b.onclick = () => openStkModal(b.dataset.payinv));
  document.querySelectorAll('[data-vievinv]').forEach(b => b.onclick = () => viewInvoice(b.dataset.vievinv));

  requestAnimationFrame(() => {
    document.querySelectorAll('.p-count-up').forEach(el => {
      const target = Number(el.dataset.count || 0);
      countUp(el, target, 600);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   STK PUSH
   ═══════════════════════════════════════════════════════════════ */
let _pendingStkInvoiceId = null;

function openStkModal(invoiceId) {
  const inv = S.invoices.find(i => i.id === invoiceId);
  if (!inv) return toast('Invoice not found.', 'error');
  _pendingStkInvoiceId = invoiceId;
  const total = invoiceTotal(inv);
  const paid  = invoicePaid(inv.id);
  const bal   = Math.max(0, total - paid);
  $('pStkInfo').innerHTML =
    `<strong>${esc(inv.number || '')}</strong><br>Balance: <strong>${fmtKES(bal)}</strong>${inv.dueDate ? `<br>Due ${fmtDate(inv.dueDate)}` : ''}`;
  $('pStkPhone').value  = S.client?.phone || '';
  $('pStkAmount').value = Math.round(bal);
  $('pStkResult').innerHTML = '';
  openPModal('pStkModal');
}

async function sendStkPush() {
  const invId = _pendingStkInvoiceId;
  const phone = ($('pStkPhone').value || '').replace(/[^0-9]/g, '');
  const amount = parseFloat($('pStkAmount').value) || 0;
  if (!invId) return toast('No invoice selected.', 'error');
  if (!phone || phone.length < 10) return toast('Enter a valid phone (2547XXXXXXXX).', 'error');
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
      body: JSON.stringify({ phone, amount, invoiceId: invId }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    $('pStkResult').innerHTML = `<div style="padding:14px;background:rgba(34,230,160,.1);border-left:4px solid var(--accent-green);border-radius:8px;">
      <strong>✓ Payment request sent</strong><br>Check your phone for the M-Pesa prompt and enter your PIN.
      <div style="font-size:.72rem;margin-top:6px;color:var(--text-secondary);">Ref: ${esc(data.CheckoutRequestID || data.checkoutRequestId || '—')}</div>
    </div>`;
    toast('M-Pesa request sent.', 'success');
    setTimeout(() => closePModal('pStkModal'), 3500);
  } catch (e) {
    $('pStkResult').innerHTML = `<div style="padding:14px;background:rgba(255,92,124,.1);border-left:4px solid var(--accent-red);border-radius:8px;">
      <strong>Failed</strong><br>${esc(e.message)}</div>`;
    toast('Payment request failed.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Request';
  }
}

/* ═══════════════════════════════════════════════════════════════
   INVOICE VIEW
   ═══════════════════════════════════════════════════════════════ */
let _viewingInvoiceId = null;

function viewInvoice(invoiceId) {
  const inv = S.invoices.find(i => i.id === invoiceId);
  if (!inv) return toast('Invoice not found.', 'error');
  _viewingInvoiceId = invoiceId;
  $('pInvNum').textContent = inv.number || '';

  const total = invoiceTotal(inv);
  const paid  = invoicePaid(inv.id);
  const bal   = Math.max(0, total - paid);

  const itemsRows = (inv.items || []).map(it =>
    `<tr><td>${esc(it.description || '')}</td><td>${it.hours ? Number(it.hours).toFixed(1) + 'h' : '—'}</td><td>${it.rate ? fmtKES(it.rate) : '—'}</td><td style="text-align:right;">${fmtKES(it.amount)}</td></tr>`
  ).join('');
  const chargeRows = (inv.extraCharges || []).map(ch =>
    `<tr><td>${esc(ch.label || '')}</td><td>—</td><td>—</td><td style="text-align:right;">${fmtKES(ch.amount)}</td></tr>`
  ).join('');
  const sub = (inv.items || []).reduce((s, i) => s + Number(i.amount || 0), 0)
            + (inv.extraCharges || []).reduce((s, c) => s + Number(c.amount || 0), 0);
  const taxAmt = sub * (Number(inv.tax || 0) / 100);

  $('pInvBody').innerHTML = `<div class="report-canvas" id="pInvReportCanvas">
    <div class="report-head">
      <div style="font-size:1.4rem;font-weight:800;color:#0a2540;">⚡ VIORA</div>
      <div style="text-align:right;">
        <div style="font-size:1.1rem;font-weight:800;color:#0a2540;">${esc(inv.number || '')}</div>
        <div style="font-size:.75rem;color:#64748b;">Date: ${fmtDate(inv.date)} · Due: ${fmtDate(inv.dueDate)}</div>
      </div>
    </div>
    <div style="margin-bottom:14px;">
      <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;color:#0a2540;margin-bottom:4px;">Bill To</div>
      <strong style="color:#0a2540;">${esc(S.client?.name || '')}</strong>
      ${S.client?.company ? `<br>${esc(S.client.company)}` : ''}
      ${S.client?.email ? `<br>${esc(S.client.email)}` : ''}
    </div>
    <table>
      <thead><tr><th>Description</th><th>Hours</th><th>Rate</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${itemsRows}${chargeRows}</tbody>
    </table>
    <div style="margin-top:14px;text-align:right;">
      <div style="display:flex;justify-content:flex-end;gap:30px;padding:3px 0;"><span>Subtotal</span><span>${fmtKES(sub)}</span></div>
      <div style="display:flex;justify-content:flex-end;gap:30px;padding:3px 0;"><span>Tax (${inv.tax || 0}%)</span><span>${fmtKES(taxAmt)}</span></div>
      <div style="display:flex;justify-content:flex-end;gap:30px;padding:6px 0;font-weight:800;font-size:1.05rem;"><span>Total</span><span>${fmtKES(total)}</span></div>
      <div style="display:flex;justify-content:flex-end;gap:30px;padding:3px 0;" class="paid-amount"><span>Paid</span><span>${fmtKES(paid)}</span></div>
      <div style="display:flex;justify-content:flex-end;gap:30px;padding:3px 0;" class="${bal > 0 ? 'overdue' : 'paid-amount'}"><span>Balance</span><span>${fmtKES(bal)}</span></div>
    </div>
    <div class="report-footer">Thank you for your business · VIORA Intercollective · +254 713 428 774 · cliff254johns@gmail.com</div>
  </div>`;
  openPModal('pInvoiceModal');
}

function printInvoice() {
  const canvas = $('pInvReportCanvas');
  if (!canvas) return;
  const w = window.open('', '_blank');
  if (!w) return toast('Pop-up blocked.', 'warning');
  w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${esc($('pInvNum').textContent)}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;600;700;800&display=swap">
    <style>
      body{font-family:'Inter',sans-serif;padding:30px;color:#000;background:#fff;max-width:800px;margin:auto}
      h1,h2,h3{font-family:'Space Grotesk',sans-serif;color:#0a2540;text-transform:uppercase;border-bottom:1.5px solid #0a2540;padding-bottom:6px}
      table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px}
      th{background:#f1f5f9;color:#0a2540;font-weight:700;font-size:11px;text-transform:uppercase;text-align:left;padding:8px 10px;border:1px solid #cbd5e1}
      td{padding:8px 10px;border:1px solid #e2e8f0;color:#000;vertical-align:top}
      tr:nth-child(even) td{background:#fafbfc}
      .overdue{color:#c1121f!important;font-weight:800}
      .paid-amount{color:#0a7f3f!important;font-weight:700}
      .report-head{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;margin-bottom:16px;border-bottom:2px solid #0a2540;flex-wrap:wrap;gap:16px}
      .report-footer{margin-top:22px;padding-top:10px;border-top:1px solid #cbd5e1;text-align:center;font-size:11px;color:#475569}
      @media print{@page{size:A4;margin:12mm}body{padding:0}}
    </style></head><body>${canvas.outerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}
function downloadInvoicePdf() { printInvoice(); }

/* ═══════════════════════════════════════════════════════════════
   CLIENT REPORT
   ═══════════════════════════════════════════════════════════════ */
function generateClientReport() {
  const c = S.client || {};
  const totalInvoiced = S.invoices.reduce((s, i) => s + invoiceTotal(i), 0);
  const totalAgreed   = getClientAgreedTotalFromProjects(S.clientId);
  const cPaid         = getClientPaidTotalFromProjects(S.clientId);
  const balance       = Math.max(0, totalAgreed - cPaid);
  const myProjects    = (S.projects || []).filter(p => p.clientId === S.clientId && p.status !== 'cancelled');

  $('pReportBody').innerHTML = `
    <div class="report-head">
      <div>
        <div style="font-size:1.5rem;font-weight:800;color:#0a2540;">⚡ VIORA</div>
        <div style="font-size:.75rem;color:#64748b;">Intercollective · +254 713 428 774 · cliff254johns@gmail.com</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:1.2rem;font-weight:800;color:#0a2540;">ACCOUNT REPORT</div>
        <div style="font-size:.75rem;color:#64748b;">Generated: ${new Date().toLocaleString('en-GB')}</div>
      </div>
    </div>

    <h2>Client Information</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:.85rem;">
      <div><strong>Name:</strong> ${esc(c.name || '')}</div>
      <div><strong>Client ID:</strong> ${esc(c.clientId || '—')}</div>
      <div><strong>Email:</strong> ${esc(c.email || '—')}</div>
      <div><strong>Phone:</strong> ${esc(c.phone || '—')}</div>
      <div><strong>Company:</strong> ${esc(c.company || '—')}</div>
      <div><strong>City:</strong> ${esc(c.city || '—')}</div>
    </div>

    <h2>Financial Summary</h2>
    <div class="report-kpi-grid">
      <div class="report-kpi"><div class="lbl">Total Agreed</div><div class="val">${fmtKES(totalAgreed)}</div></div>
      <div class="report-kpi"><div class="lbl">Total Paid</div><div class="val paid-amount">${fmtKES(cPaid)}</div></div>
      <div class="report-kpi"><div class="lbl">Balance Due</div><div class="val ${balance > 0 ? 'overdue' : 'paid-amount'}">${fmtKES(balance)}</div></div>
      <div class="report-kpi"><div class="lbl">Total Invoiced</div><div class="val">${fmtKES(totalInvoiced)}</div></div>
    </div>

    ${myProjects.length ? `
    <h2>Project Breakdown (${myProjects.length})</h2>
    <table>
      <thead><tr>
        <th>Project</th><th>Status</th>
        <th style="text-align:right;">Agreed</th>
        <th style="text-align:right;">Paid</th>
        <th style="text-align:right;">Balance</th>
      </tr></thead>
      <tbody>
        ${myProjects.map(p => {
          const agreed = getProjectAgreedTotal(p.id);
          const paid   = getProjectPaidTotal(p.id);
          const bal    = Math.max(0, agreed - paid);
          return `<tr>
            <td>${esc(p.projectNumber || '—')} — ${esc(p.title || '')}</td>
            <td>${esc(p.status || 'active')}</td>
            <td style="text-align:right;">${fmtKES(agreed)}</td>
            <td style="text-align:right;" class="paid-amount">${fmtKES(paid)}</td>
            <td style="text-align:right;" class="${bal > 0 ? 'overdue' : ''}">${fmtKES(bal)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : ''}

    <h2>Projects (${S.projects.length})</h2>
    ${S.projects.length ? `
    <table>
      <thead><tr><th>Number</th><th>Title</th><th>Service</th><th>Progress</th><th>Status</th><th>Deadline</th></tr></thead>
      <tbody>
        ${S.projects.map(p => `<tr>
          <td>${esc(p.projectNumber || '')}</td>
          <td>${esc(p.title || '')}</td>
          <td>${esc(p.serviceArea || '')}</td>
          <td>${p.progress || 0}%</td>
          <td>${esc(p.status || '')}</td>
          <td>${fmtDate(p.deadline)}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<p style="color:#64748b;font-size:.85rem;">No projects.</p>'}

    <h2>Invoices (${S.invoices.length})</h2>
    ${S.invoices.length ? `
    <table>
      <thead><tr><th>Number</th><th>Date</th><th>Due Date</th><th style="text-align:right;">Total</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Balance</th><th>Status</th></tr></thead>
      <tbody>
        ${S.invoices.map(inv => {
          const t = invoiceTotal(inv);
          const pd = invoicePaid(inv.id);
          const b  = t - pd;
          const st = pd >= t - 0.01 ? 'Paid' : pd > 0 ? 'Partial'
                    : (inv.dueDate && new Date(inv.dueDate) < new Date()) ? 'Overdue' : 'Sent';
          return `<tr>
            <td>${esc(inv.number || '')}</td>
            <td>${fmtDate(inv.date)}</td>
            <td>${fmtDate(inv.dueDate)}</td>
            <td style="text-align:right;">${fmtKES(t)}</td>
            <td style="text-align:right;" class="paid-amount">${fmtKES(pd)}</td>
            <td style="text-align:right;" class="${b > 0 ? 'overdue' : ''}">${fmtKES(b)}</td>
            <td>${st}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '<p style="color:#64748b;font-size:.85rem;">No invoices.</p>'}

    <h2>Payments (${S.payments.length})</h2>
    ${S.payments.length ? `
    <table>
      <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>
        ${S.payments.map(p => `<tr>
          <td>${fmtDate(p.date)}</td>
          <td>${esc(p.method || '')}</td>
          <td>${esc(p.reference || '—')}</td>
          <td style="text-align:right;">${fmtKES(p.amount)}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<p style="color:#64748b;font-size:.85rem;">No payments.</p>'}

    ${S.presentations.length ? `
    <h2>Presentations (${S.presentations.length})</h2>
    <table>
      <thead><tr><th>Date</th><th>Title</th><th>Type</th><th>Status</th><th>Presenter</th></tr></thead>
      <tbody>
        ${S.presentations.map(p => `<tr>
          <td>${fmtDate(p.date)}</td>
          <td>${esc(p.title || '')}</td>
          <td>${esc(p.type || '')}</td>
          <td>${esc(p.status || '')}</td>
          <td>${esc(p.presenterName || '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : ''}

    ${S.appointments.length ? `
    <h2>Appointments (${S.appointments.length})</h2>
    <table>
      <thead><tr><th>Date</th><th>Time</th><th>Title</th><th>Type</th><th>Status</th></tr></thead>
      <tbody>
        ${S.appointments.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(a => `<tr>
          <td>${fmtDate(a.date)}</td>
          <td>${esc(a.startTime || '')}</td>
          <td>${esc(a.title || '')}</td>
          <td>${esc(a.type || '')}</td>
          <td>${esc(a.status || '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : ''}

    ${(S.subscriptions || []).length ? `
    <h2>Subscriptions (${S.subscriptions.length})</h2>
    <table>
      <thead><tr><th>Product</th><th>Plan</th><th>Status</th><th>Started</th><th>Renews</th><th style="text-align:right;">Amount KES</th></tr></thead>
      <tbody>
        ${S.subscriptions.map(s => {
          const ev = _evaluateSub(s, Date.now());
          const pill = _subPill(s, ev);
          return `<tr>
            <td>${esc(s.productName || s.productId || '')}</td>
            <td>${esc(_PLAN_LABELS[s.plan] || s.plan || '')}</td>
            <td>${esc(pill.label)}</td>
            <td>${fmtDate(s.startDate)}</td>
            <td>${s.plan === 'lifetime' ? 'Never' : fmtDate(s.endDate)}</td>
            <td style="text-align:right;">${(Number(s.amountKES) || 0).toLocaleString()}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : ''}

    ${Object.keys(S.trainingEnrollments || {}).length ? `
    <h2>Training Progress</h2>
    <table>
      <thead><tr><th>Course</th><th>Modules</th><th>Progress</th><th>Status</th></tr></thead>
      <tbody>
        ${Object.keys(S.trainingEnrollments).map(cid => {
          const course = (S.trainingCourses || []).find(c => c.id === cid);
          const prog = (S.trainingProgress || {})[cid] || {};
          const moduleIds = course ? Object.keys(course.modules || {}) : [];
          const done = moduleIds.filter(mid => prog[mid] && prog[mid].completedAt).length;
          const pct = moduleIds.length ? Math.round((done / moduleIds.length) * 100) : 0;
          return `<tr>
            <td>${esc(course ? course.title : cid)}</td>
            <td>${done} / ${moduleIds.length}</td>
            <td>${pct}%</td>
            <td>${pct >= 100 ? 'Completed' : pct > 0 ? 'In Progress' : 'Not Started'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : ''}

    <div class="report-signature">
      <div class="sig-line">Client Signature / Date</div>
      <div class="sig-line">VIORA Authorized Signatory / Date</div>
    </div>

    <div class="report-footer">
      This report is generated automatically from live data · VIORA Intercollective · www.viora.co.ke
    </div>
  `;
  openPModal('pReportModal');
}

function refreshReportIfOpen() {
  if ($('pReportModal')?.classList.contains('active')) generateClientReport();
}

function downloadReportPdf() {
  const content = $('pReportBody');
  if (!content) return;
  const w = window.open('', '_blank');
  if (!w) return toast('Pop-up blocked.', 'warning');
  w.document.write(`<!DOCTYPE html><html><head><title>VIORA Report</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;600;700;800&display=swap">
    <style>
      body{font-family:'Inter',sans-serif;padding:30px;color:#000;background:#fff;max-width:800px;margin:auto}
      h2{font-family:'Space Grotesk',sans-serif;color:#0a2540;text-transform:uppercase;border-bottom:1.5px solid #0a2540;padding-bottom:6px;font-size:14px;letter-spacing:.5px;margin-top:22px}
      table{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px}
      th{background:#f1f5f9;color:#0a2540;font-weight:700;font-size:11px;text-transform:uppercase;text-align:left;padding:8px 10px;border:1px solid #cbd5e1}
      td{padding:8px 10px;border:1px solid #e2e8f0;color:#000;vertical-align:top}
      tr:nth-child(even) td{background:#fafbfc}
      .overdue{color:#c1121f!important;font-weight:800}
      .paid-amount{color:#0a7f3f!important;font-weight:700}
      .report-head{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;margin-bottom:16px;border-bottom:2px solid #0a2540;flex-wrap:wrap;gap:16px}
      .report-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:12px 0}
      .report-kpi{background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px}
      .report-kpi .lbl{font-size:10px;font-weight:700;text-transform:uppercase;color:#0a2540;margin-bottom:4px}
      .report-kpi .val{font-size:15px;font-weight:800;color:#000}
      .report-signature{display:flex;gap:40px;margin-top:30px}
      .report-signature .sig-line{flex:1;border-top:1px solid #94a3b8;padding-top:6px;font-size:11px;color:#000}
      .report-footer{margin-top:22px;padding-top:10px;border-top:1px solid #cbd5e1;text-align:center;font-size:11px;color:#475569}
      @media print{@page{size:A4;margin:12mm}body{padding:0}}
    </style></head><body>${content.outerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}

window._pReport = generateClientReport;
window._pPayBalance = () => {
  const balance = Math.max(0,
    getClientAgreedTotalFromProjects(S.clientId) -
    getClientPaidTotalFromProjects(S.clientId));
  if (balance <= 0) return toast('No balance due.', 'info');
  const openInv = S.invoices.find(i => invoicePaid(i.id) < invoiceTotal(i) - 0.01);
  if (openInv) openStkModal(openInv.id);
  else toast('No invoice for balance. Contact your project lead.', 'info');
};
window._pRenewSub = (productId) => {
  const sub = (S.subscriptions || []).find(s => s.productId === productId);
  if (!sub) return toast('Subscription not found.', 'error');
  const pending = (S.invoices || []).find(inv =>
    inv.subscriptionId === sub.id && inv.isRenewal && invoicePaid(inv.id) < invoiceTotal(inv) - 0.01
  );
  if (pending) return openStkModal(pending.id);
  window.open(`https://viora.co.ke/market.html?renew=${encodeURIComponent(productId)}`, '_blank', 'noopener');
  toast('Open the marketplace to renew this subscription.', 'info');
};

/* ═══════════════════════════════════════════════════════════════
   AI ASSISTANT
   ═══════════════════════════════════════════════════════════════ */
function renderAI() {
  $('ptab-ai').innerHTML = `
    <div class="page-header">
      <div>
        <h1><span class="highlight">AI Assistant</span> <span class="badge badge-purple" style="font-size:10px;">Groq</span></h1>
        <p class="page-desc">Ask anything about your projects, invoices, presentations, or the technology we're using.</p>
      </div>
    </div>
    <div class="chart-box">
      <div class="ai-quick-prompts" id="pAiQuick">
        <button data-p="Summarize the current status of my projects">📊 Project status</button>
        <button data-p="What is my outstanding balance and what invoices are unpaid?">💰 Outstanding balance</button>
        <button data-p="Explain what milestones are coming up next">🎯 Upcoming milestones</button>
        <button data-p="What presentations have I received and what were the outcomes?">📽️ Presentations summary</button>
        <button data-p="Give me a timeline overview of all my projects">📅 Timeline</button>
        <button data-p="Are there any risks or delays I should know about?">⚠️ Risks & delays</button>
        <button data-p="When is my next appointment?">📅 Next appointment</button>
        <button data-p="What documents have I received from you?">📎 Documents list</button>
        <button data-p="What subscriptions do I have and when do they renew?">🔑 Subscriptions</button>
        <button data-p="How is my training progress?">🎓 Training progress</button>
      </div>
      <div class="ai-chat-wrap">
        <div class="ai-chat-history" id="pAiHistory">
          <div class="ai-msg assistant">👋 Hi! I'm your VIORA assistant. I can see your projects, invoices, documents, presentations, appointments, subscriptions, training progress, and timeline. Ask me anything!</div>
        </div>
        <div class="ai-chat-input">
          <input id="pAiInput" placeholder="Ask anything about your projects…" />
          <button class="btn btn-purple" id="pAiSend"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
    </div>
  `;
  $('pAiSend').onclick = sendAiMessage;
  $('pAiInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
  });
  document.querySelectorAll('#pAiQuick button').forEach(b => {
    b.onclick = () => { $('pAiInput').value = b.dataset.p; sendAiMessage(); };
  });
  const h = $('pAiHistory');
  if (h) h.scrollTop = h.scrollHeight;
}

function buildClientContext() {
  const c = S.client || {};
  const totalInvoiced = S.invoices.reduce((s, i) => s + invoiceTotal(i), 0);
  const totalPaid     = S.invoices.reduce((s, i) => s + invoicePaid(i.id), 0);
  return {
    client: (function () {
      const ta = getClientAgreedTotalFromProjects(S.clientId);
      const tp = getClientPaidTotalFromProjects(S.clientId);
      return {
        name: c.name, company: c.company, clientType: c.clientType, city: c.city,
        totalAgreed: ta, totalPaid: tp, balance: Math.max(0, ta - tp)
      };
    })(),
    projects: S.projects.map(p => ({
      number: p.projectNumber, title: p.title, status: p.status,
      progress: p.progress, serviceArea: p.serviceArea, platform: p.platform,
      startDate: p.startDate, deadline: p.deadline,
      nextMilestone: p.nextMilestone, milestones: p.milestones || []
    })),
    invoices: S.invoices.map(i => ({
      number: i.number, date: i.date, dueDate: i.dueDate,
      total: invoiceTotal(i), paid: invoicePaid(i.id),
      status: invoicePaid(i.id) >= invoiceTotal(i) - 0.01 ? 'paid'
            : invoicePaid(i.id) > 0 ? 'partial' : 'unpaid'
    })),
    financials: { totalInvoiced, totalPaid, outstanding: Math.max(0, totalInvoiced - totalPaid) },
    presentations: S.presentations.map(p => ({
      title: p.title, date: p.date, type: p.type, status: p.status,
      outcome: p.outcome, nextSteps: p.nextSteps,
      attachmentCount: (p.attachments || []).length
    })),
    documents: S.documents.map(d => ({
      title: d.title || d.fileName, category: d.category, size: d.size
    })),
    appointments: S.appointments.slice(0, 10).map(a => ({
      title: a.title, date: a.date, startTime: a.startTime,
      status: a.status, type: a.type, location: a.location
    })),
    subscriptions: (S.subscriptions || []).map(s => {
      const ev = _evaluateSub(s, Date.now());
      const pill = _subPill(s, ev);
      return {
        productName: s.productName || s.productId,
        plan: s.plan,
        status: pill.label,
        startDate: s.startDate,
        endDate: s.endDate,
        amountKES: s.amountKES,
        modules: Array.isArray(s.modules) ? s.modules : []
      };
    }),
    training: Object.keys(S.trainingEnrollments || {}).map(cid => {
      const course = (S.trainingCourses || []).find(c => c.id === cid);
      const prog = (S.trainingProgress || {})[cid] || {};
      const moduleIds = course ? Object.keys(course.modules || {}) : [];
      const done = moduleIds.filter(mid => prog[mid] && prog[mid].completedAt).length;
      return {
        course: course ? course.title : cid,
        modulesDone: done,
        modulesTotal: moduleIds.length,
        pct: moduleIds.length ? Math.round((done / moduleIds.length) * 100) : 0
      };
    }),
    installments: (c.installments || []).map(inst => ({
      label: inst.label, amount: inst.amount,
      dueDate: inst.dueDate, paid: inst.paid
    })),
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
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    const reply = data.reply || '(no response)';
    const sourcesHtml = (data.sources || []).length
      ? `<div class="ai-src">📚 Based on: ${data.sources.map(esc).join(' · ')}</div>` : '';
    document.getElementById(spinId).outerHTML =
      `<div class="ai-msg assistant">${esc(reply).replace(/\n/g, '<br>')}${sourcesHtml}</div>`;
    S.aiHistory.push({ role: 'user', content: msg });
    S.aiHistory.push({ role: 'assistant', content: reply });
    if (S.aiHistory.length > 20) S.aiHistory = S.aiHistory.slice(-20);
  } catch (e) {
    document.getElementById(spinId).outerHTML =
      `<div class="ai-msg assistant" style="border-left:3px solid var(--accent-red);color:var(--accent-red);">⚠️ Error: ${esc(e.message)}</div>`;
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
        <p class="page-desc">Talk directly with your project lead. Everything is on record.</p>
      </div>
      <div class="actions"><button class="btn btn-primary" id="pNewTkBtn"><i class="fa-solid fa-plus"></i> New Ticket</button></div>
    </div>
    <div style="display:grid;grid-template-columns:minmax(260px,320px) 1fr;gap:16px;">
      <div class="chart-box" style="max-height:600px;overflow-y:auto;">
        <h4><i class="fa-solid fa-ticket"></i> Your Tickets</h4>
        ${S.tickets.length ? S.tickets.map(t => `
          <div class="ticket-row ${t.unreadForClient ? 'unread' : ''} ${t.status === 'closed' ? 'closed' : ''}" data-tk="${esc(t.id)}">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(t.subject || 'Untitled')}</div>
              <div style="font-size:.7rem;color:var(--text-secondary);margin-top:2px;">
                <span class="tk-status ${esc(t.status || 'open')}">${esc(t.status || 'open')}</span> · ${timeAgo(t.lastMessageAt || t.createdAt)}
              </div>
            </div>
          </div>`).join('') : '<div class="empty-state" style="padding:20px;">No tickets yet. Click "New Ticket" to start a conversation.</div>'}
      </div>
      <div class="chart-box" id="pTicketThread" style="min-height:400px;display:flex;flex-direction:column;">
        <div class="empty-state" style="margin:auto;">Select a ticket to view the conversation.</div>
      </div>
    </div>
  `;
  document.querySelectorAll('[data-tk]').forEach(el => {
    el.onclick = () => openTicket(el.dataset.tk);
  });
  const btn = $('pNewTkBtn');
  if (btn) btn.onclick = () => openPModal('pNewTicketModal');

  if (!S.activeTicketId && S.tickets.length) openTicket(S.tickets[0].id);
  else if (S.activeTicketId && S.tickets.find(t => t.id === S.activeTicketId)) openTicket(S.activeTicketId);
}

function openTicket(ticketId) {
  const t = S.tickets.find(x => x.id === ticketId);
  if (!t) return;
  S.activeTicketId = ticketId;

  document.querySelectorAll('.ticket-row').forEach(el => {
    el.style.background = el.dataset.tk === ticketId ? 'var(--bg-table-alt)' : '';
  });

  const host = $('pTicketThread');
  host.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border-color);">
      <div>
        <div style="font-weight:700;font-size:1rem;">${esc(t.subject || '')}</div>
        <div style="font-size:.72rem;color:var(--text-secondary);margin-top:3px;">
          <span class="tk-status ${esc(t.status || 'open')}">${esc(t.status || 'open')}</span> · Priority ${esc(t.priority || 'medium')} · Opened ${timeAgo(t.createdAt)}
        </div>
      </div>
    </div>
    <div id="pMsgThread" style="flex:1;overflow-y:auto;padding:4px;max-height:400px;min-height:200px;"></div>
    ${t.status !== 'closed' ? `
      <div style="display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color);">
        <input id="pReplyInput" placeholder="Type your reply…" style="flex:1;padding:11px 14px;border-radius:12px;border:1.5px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-family:inherit;font-size:.9rem;" />
        <button class="btn btn-primary" id="pSendReply"><i class="fa-solid fa-paper-plane"></i></button>
      </div>
    ` : '<div style="padding:12px;text-align:center;color:var(--text-secondary);font-size:.8rem;">This ticket is closed.</div>'}
  `;

  if (S.activeTicketUnsub) { try { S.activeTicketUnsub(); } catch (e) {} S.activeTicketUnsub = null; }

  const thread = $('pMsgThread');
  const unsub = onValue(ref(db, `${ROOT}/${ORG}/tickets/${ticketId}/messages`), snap => {
    const v = snap.exists() ? snap.val() : {};
    const msgs = Object.values(v).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    thread.innerHTML = msgs.length ? msgs.map(m => {
      const isMe = m.senderType === 'client';
      return `<div class="msg-bubble ${isMe ? 'client' : 'admin'}">
        <div class="who">${esc(m.senderName || (isMe ? 'You' : 'Viora'))}</div>
        <div>${esc(m.text || '')}</div>
        <div style="font-size:.62rem;opacity:.7;margin-top:4px;text-align:${isMe ? 'right' : 'left'};">${timeAgo(m.createdAt)}</div>
      </div>`;
    }).join('') : '<div class="empty-state" style="padding:20px;">No messages yet.</div>';
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
        await set(ref(db, `${ROOT}/${ORG}/tickets/${ticketId}/messages/${msgId}`), msg);
        await set(ref(db, `${ROOT}/${ORG}/tickets/${ticketId}/lastMessageAt`), msg.createdAt);
        await set(ref(db, `${ROOT}/${ORG}/tickets/${ticketId}/unreadForClient`), 0);
        $('pReplyInput').value = '';
      } catch (e) {
        toast('Send failed: ' + e.message, 'error');
      } finally {
        sendBtn.disabled = false;
      }
    };
    sendBtn.onclick = send;
    $('pReplyInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
  }
}

async function createTicket() {
  const subject  = $('pTkSubject').value.trim();
  const priority = $('pTkPriority').value;
  const body     = $('pTkBody').value.trim();
  if (!subject || body.length < 3) return toast('Subject and description are required.', 'error');

  const btn = $('pTkCreate');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating…';
  try {
    const id  = 'TKT-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
    const now = new Date().toISOString();
    const ticket = {
      id, clientId: S.clientId, clientName: S.client?.name || '',
      subject, priority, status: 'open',
      createdAt: now, createdBy: S.uid,
      lastMessageAt: now, unreadForAdmin: 1, unreadForClient: 0
    };
    await set(ref(db, `${ROOT}/${ORG}/tickets/${id}`), ticket);
    const msgId = 'msg-' + Date.now().toString(36);
    await set(ref(db, `${ROOT}/${ORG}/tickets/${id}/messages/${msgId}`), {
      id: msgId, senderId: S.uid, senderType: 'client',
      senderName: S.client?.name || 'Client', text: body, createdAt: now
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
    .filter(a => a.date >= today && a.status !== 'cancelled' && a.status !== 'missed')
    .sort((a, b) => (a.date + 'T' + (a.startTime || '00:00')).localeCompare(b.date + 'T' + (b.startTime || '00:00')));
  const past = S.appointments.filter(a => a.date < today).sort((a, b) => b.date.localeCompare(a.date));

  $('ptab-appointments').innerHTML = `
    <div class="page-header">
      <div><h1><span class="highlight">Appointments</span></h1><p class="page-desc">Your meetings with the VIORA team — instantly synced.</p></div>
    </div>
    <h3 style="margin:0 0 14px;font-family:'Space Grotesk';font-size:1rem;">Upcoming (${upcoming.length})</h3>
    ${upcoming.length ? `
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:22px;" class="p-stagger">
        ${upcoming.map(a => {
          const d = new Date((a.date || today) + 'T00:00:00');
          return `<div class="appt-card ${a.status || ''}">
            <div class="appt-date-box">
              <span class="day">${d.getDate()}</span>
              <span class="mon">${d.toLocaleDateString('en-US', { month: 'short' })}</span>
            </div>
            <div class="appt-info">
              <div class="title">${esc(a.title || 'Meeting')}</div>
              <div class="meta"><i class="fa-solid fa-clock"></i> ${esc(a.startTime || '')}${a.endTime ? ' – ' + esc(a.endTime) : ''} · ${esc(a.type || '')}</div>
              ${a.mode     ? `<div class="meta"><i class="fa-solid fa-video"></i> ${esc(a.mode)}</div>` : ''}
              ${a.location ? `<div class="meta"><i class="fa-solid fa-location-dot"></i> ${esc(a.location)}</div>` : ''}
              ${a.agenda   ? `<div class="meta" style="font-style:italic;margin-top:4px;">"${esc(a.agenda)}"</div>` : ''}
            </div>
            <span class="badge badge-${a.status === 'held' ? 'paid' : 'pending'}">${esc(a.status || 'scheduled')}</span>
          </div>`;
        }).join('')}
      </div>
    ` : '<div class="empty-state">No upcoming appointments.</div>'}
    ${past.length ? `
      <h3 style="margin:28px 0 12px;font-family:'Space Grotesk';font-size:1rem;">Past (${past.length})</h3>
      <div class="table-wrapper">
        <table><thead><tr><th>Date</th><th>Title</th><th>Type</th><th>Status</th></tr></thead>
        <tbody>${past.slice(0, 20).map(a => `<tr>
          <td>${fmtDate(a.date)}</td>
          <td>${esc(a.title || '')}</td>
          <td>${esc(a.type || '')}</td>
          <td><span class="badge badge-${a.status === 'held' ? 'paid' : a.status === 'missed' ? 'overdue' : 'gray'}">${esc(a.status || '')}</span></td>
        </tr>`).join('')}</tbody></table>
      </div>
    ` : ''}
  `;
}

/* ═══════════════════════════════════════════════════════════════
   MARKETPLACE
   ═══════════════════════════════════════════════════════════════ */
function renderMarketplace() {
  try { renderMarketplaceTab(); } catch (e) { console.warn('[marketplace]', e); }
}

/* ═══════════════════════════════════════════════════════════════
   CLEANUP
   ═══════════════════════════════════════════════════════════════ */
window.addEventListener('beforeunload', () => {
  if (S.activeTicketUnsub) { try { S.activeTicketUnsub(); } catch (e) {} }
  if (S.pendingWatch)      { try { S.pendingWatch(); }      catch (e) {} }
  if (S._pendingPoll)      { try { clearInterval(S._pendingPoll); } catch (e) {} }
  S.unsubs.forEach(u => { try { u(); } catch (e) {} });
});
