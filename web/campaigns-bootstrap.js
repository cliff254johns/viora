// ═══════════════════════════════════════════════════════════════
// campaigns-bootstrap.js — VIORA Campaigns standalone page
// Boots ONLY the campaign subsystem. No dashboard, no clients,
// no finance, no marketplace, no training, no partner, no PP.
// ═══════════════════════════════════════════════════════════════

import { initializeApp, getApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue, get, set, update, remove, push, query, limitToLast, forceLongPolling } from "firebase/database";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from 'firebase/auth';
import { initOrbitShell } from './main/orbit-shell.js';
/* ── Shared helpers ── */
import * as H from './main/helpers.js';
import { initInbox, subscribeInbox } from './main/inbox.js';
import { initAgentRunner } from './main/agent-runner.js';

import { initIdb, idbOpen, idbSave, idbLoad, idbClear, queueOfflineMutation } from './main/idb.js';

/* ── Modal utilities ── */
import {
  initModalUtils,
  openModal, closeModal, showModal, hideModal,
  toast, setSyncStatus,
  applyLogoEverywhere, getLogoImg
} from './main/modal-utils.js';

/* ── Charts ── */
import {
  initCharts, getTextColor, destroyChart, safeCanvas,
  renderCharts, renderMarketplaceCharts
} from './main/charts.js';

/* ── Write layer ── */
import {
  initWriteLayer, upsertDoc, deleteDoc, directWrite, directDelete
} from './main/write-layer.js';

/* ── AI services (used by campaigns for classification) ── */
import { initAIServices } from './main/ai-services.js';

/* ── Marketplace renderer (owns renderCampaigns + manual sale) ── */
import {
  initRenderMarketplace,
  renderCampaigns,
  applyCampMediaTypeUI,
  renderCampaignStats,
  fetchCampaignStats,
  connectTikTok,
  refreshAllCampaignStats,
  startCampaignStatsAutoRefresh,
} from './main/render-marketplace.js';

/* ── Campaign subsystem ── */
import {
  initCampaignAccounts,
  subscribeToAccounts,
  renderAccountsPanel,
  getAccountForPlatformSync,
} from './main/campaign-accounts.js';

import {
  initCampaignTrends,
  renderTrendRadar,
} from './main/campaign-trends.js';

import {
  initCampaignAI,
  openComposer,
  openComposerWithTrend,
  openComposerForCampaign,
  openComposerForDraft,
  renderDraftLibrary,
  renderPromptLibrary,
} from './main/campaign-ai.js';

import {
  initCampaignAnalytics,
  renderAnalyticsDashboard,
} from './main/campaign-analytics.js';

import {
  initCampaignCron,
  startCampaignCron,
} from './main/campaign-cron.js';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS (mirror from main.js)
   ═══════════════════════════════════════════════════════════════ */
const WORKER_URL = 'https://viora-api.cliff254johns.workers.dev';
const ROOT       = 'viora_data';
const ORG        = 'orgs/viora';
const SENDER_PHONE = '+254713428774';
const SENDER_EMAIL = 'cliff254johns@gmail.com';

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

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db   = getDatabase(app);
forceLongPolling(db);
const auth = getAuth(app);

/* ═══════════════════════════════════════════════════════════════
   PATH HELPERS (mirror from main.js)
   ═══════════════════════════════════════════════════════════════ */
const ORG_COLLECTIONS = new Set([
  'entities','leads','campaigns','deals','contracts','projects',
  'tasks','invoices','payments','accounts','ledger','expenses','payroll',
  'assets','compliance','documents','proposals','mpesaTransactions',
  'mpesaSettings','inventory','activityLog','commLog','trash','logoUrl',
  'profile','clientsite','companyProfile','marketContent',
  'products','orders','financials','telemetry','marketplace','marketLeads',
  'marketAnalytics','tickets','clientUploads',
  'supportTickets','training','marketing',
  'portalRequests','portalUsers',
  'appointments','presentations',
  'orchestration','archives',
  'archivedClients','archivedDeals','archivedProjects',
  'subscriptions','licenses',
  'promos','productExtras','reviews',
  'socialAccounts','competitorBenchmarks'
]);

function P(path) {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  const [head, ...rest] = clean.split('/');
  const tail = rest.length ? '/' + rest.join('/') : '';
  if (ORG_COLLECTIONS.has(head)) return `${ROOT}/${ORG}/${head}${tail}`;
  return `${ROOT}/${clean}`;
}

/* ═══════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════ */
const state = {
  data: {},
  operator: null,
  currentTab: 'marketing-campaigns',
  charts: {},
  firebaseReady: false,
  _counterCache: null,
  _bootDraining: true,
};
window.state = state;

/* ═══════════════════════════════════════════════════════════════
   HELPERS FROM main/helpers.js
   ═══════════════════════════════════════════════════════════════ */
const {
  $, uid, todayStr, dateToStr, fmtDate, fmtDateTime, timeAgo, daysBetween,
  isOverdue, fmtKES, fmtUSD, usdToKes, kpiFormat, escapeHtml, fmtBytes,
  normalizePhone, normalizeEmail, simpleHash, emailToId, generateLicenseKey,
  isMobile, debounce, FX_RATE,
} = H;

window.$ = $;
window.uid = uid;
window.escapeHtml = escapeHtml;
window.fmtKES = fmtKES;
window.fmtUSD = fmtUSD;
window.usdToKes = usdToKes;
window.kpiFormat = kpiFormat;
window.timeAgo = timeAgo;
window.todayStr = todayStr;
window.normalizeEmail = normalizeEmail;
window.generateLicenseKey = generateLicenseKey;

/* ═══════════════════════════════════════════════════════════════
   DATA ACCESSORS REQUIRED BY initRenderMarketplace
   ═══════════════════════════════════════════════════════════════ */
const getProductsList = () => state.data.products || [];
const getOrdersList   = () => state.data.orders   || [];
const getProduct = (id) => (state.data.products || []).find(p => p && p.id === id);
const getOrder   = (id) => (state.data.orders   || []).find(o => o && o.id === id);

/* Placeholder accessors that initRenderMarketplace requires but
   that campaigns never actually exercises. */
const getClient      = () => null;
const getClientName  = () => '—';
const getProject     = () => null;
const getProjectNumber = () => '—';

/* EventBus stub — main.js has a rich one, campaigns only needs emit. */
const EventBus = {
  emit: (name, payload, id) => {
    console.debug('[events]', name, id);
  },
};

/* ═══════════════════════════════════════════════════════════════
   AUTH TOKEN + WORKER CALL
   ═══════════════════════════════════════════════════════════════ */
async function getAuthToken() {
  if (auth.currentUser) {
    try { return await auth.currentUser.getIdToken(); }
    catch (e) { console.warn('[auth] getIdToken failed:', e.message); }
  }
  return new Promise(resolve => {
    let settled = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (settled) return;
      settled = true;
      try { unsub(); } catch (_) {}
      if (!user) { resolve(null); return; }
      try { resolve(await user.getIdToken()); }
      catch (_) { resolve(null); }
    });
    setTimeout(() => { if (!settled) { settled = true; try { unsub(); } catch (_) {} resolve(null); } }, 5000);
  });
}

async function callFn(name, payload = {}) {
  const idToken = await getAuthToken();
  if (!idToken) throw new Error('Not signed in');

  let res;
  try {
    res = await fetch(`${WORKER_URL}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    throw new Error(`Network error contacting ${name}: ${e.message || 'fetch failed'}`);
  }

  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || `HTTP ${res.status}`;
    toast(`${name}: ${msg}`, 'error');
    throw new Error(msg);
  }
  return data;
}

window.callFn = callFn;
window.VioraDb = db;
window.VioraAuth = auth;

/* Expose analytics renderer for inline handlers in campaigns.html
   (campaignAnalyticsRefreshBtn, theme toggle). The orbit module
   imports it directly — this line is only for the standalone buttons. */
import('./main/campaign-analytics.js')
  .then(m => { window.renderAnalyticsDashboard = m.renderAnalyticsDashboard; })
  .catch(e => console.warn('[analytics] window expose failed', e));

/* ═══════════════════════════════════════════════════════════════
   LOGO / SYNC HELPERS
   ═══════════════════════════════════════════════════════════════ */
function applyLogoToHeader() {
  const icon = document.querySelector('header .logo-mark');
  if (icon) {
    const url = state.data.logoUrl;
    if (url) icon.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain;border-radius:10px;" />`;
  }
}

/* ═══════════════════════════════════════════════════════════════
   TAB NAVIGATION
   ═══════════════════════════════════════════════════════════════ */
function setActiveTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  const target = document.getElementById('tab-' + tab);
  if (target) target.classList.add('active');

  document.querySelectorAll('.camp-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  if (tab === 'marketing-campaigns') {
    renderCampaigns();
    renderAccountsPanel();
    renderTrendRadar();
    renderDraftLibrary();
    renderPromptLibrary();
  } else if (tab === 'campaign-analytics') {
    renderAnalyticsDashboard();
  }
}

document.querySelectorAll('.camp-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    setActiveTab(btn.dataset.tab);
    history.replaceState(null, '', '#' + btn.dataset.tab);
  });
});

/* ═══════════════════════════════════════════════════════════════
   THEME TOGGLE
   ═══════════════════════════════════════════════════════════════ */
const savedTheme = localStorage.getItem('viora-theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

document.getElementById('themeBtn')?.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('viora-theme', next);

  // Charts need a nudge to restyle tick/legend colors
  setTimeout(() => {
    try { renderCampaigns(); } catch (_) {}
    try { renderAnalyticsDashboard(); } catch (_) {}
  }, 100);
});

/* ═══════════════════════════════════════════════════════════════
   AUTH FLOW
   ═══════════════════════════════════════════════════════════════ */
let _signingIn = false;

async function doSignIn() {
  if (_signingIn) return;
  const email = document.getElementById('loginEmail')?.value?.trim() || '';
  const password = document.getElementById('loginPassword')?.value || '';
  const btn = document.getElementById('loginBtn');

  if (!email || !password) {
    showLoginError('Email and password are required.');
    return;
  }

  _signingIn = true;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in…';
  hideLoginError();

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    const friendly = {
      'auth/invalid-email':          'That email address is not valid.',
      'auth/user-disabled':          'This account has been disabled.',
      'auth/user-not-found':         'No account found with that email.',
      'auth/wrong-password':         'Incorrect password.',
      'auth/invalid-credential':     'Wrong email or password.',
      'auth/too-many-requests':      'Too many attempts. Try again in a few minutes.',
      'auth/network-request-failed': 'Network error. Check your connection.'
    }[e.code] || (e.message || 'Sign-in failed.');
    showLoginError(friendly);
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    _signingIn = false;
  }
}

function showLoginError(msg) {
  const box = document.getElementById('loginError');
  if (box) box.textContent = msg;
}
function hideLoginError() {
  const box = document.getElementById('loginError');
  if (box) box.textContent = '';
}

document.getElementById('loginBtn')?.addEventListener('click', doSignIn);
document.getElementById('loginPassword')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); doSignIn(); }
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  try { await signOut(auth); } catch (_) {}
  try { await idbClear(); } catch (_) {}
  location.href = '/main.html';
});

/* ═══════════════════════════════════════════════════════════════
   BOOT — init every module, then render
   ═══════════════════════════════════════════════════════════════ */
async function initModules() {
  /* IDB — must come first so write-layer's offline queue works */
  initIdb({
    state, toast, setSyncStatus,
    // Bug fix: wire the real directWrite/directDelete so the queue can flush
    directWrite, directDelete,
  });

  /* Write layer */
  initWriteLayer({
    db, ref, set, get, remove, push, P,
    state, toast, setSyncStatus,
    logActivity: () => Promise.resolve(),
    EventBus,
    // Bug fix: wire the real queueOfflineMutation instead of a no-op
    queueOfflineMutation,
    idbSave,
    vioraConfirm: window.vioraConfirm,
  });

  /* Modal utils */
  initModalUtils({ state });

  /* Charts */
  initCharts({
    $, state,
    getOrdersList, getProductsList,
    getProductSalesMetrics: () => ({}),
    usdToKes, FX_RATE,
  });

  /* AI services — minimal wiring */
  try {
    initAIServices({
      state, callFn, toast, upsertDoc,
      escapeHtml,
      getClient: () => null,
      renderActiveTab: () => {},
      evaluateAllQueues: () => ({ byId: {} }),
      Orchester: null,
      ORCHESTRATION_HANDOFFS: [],
      renderOrchestrationPanel: () => {},
    });
  } catch (e) {
    console.warn('[campaigns] initAIServices failed (non-fatal):', e);
  }

  /* ── Marketplace renderer (owns renderCampaigns + manual sale) ── */
  initRenderMarketplace({
    state, $, escapeHtml, timeAgo, todayStr,
    fmtUSD, fmtKES, kpiFormat, usdToKes,
    normalizeEmail, emailToId,
    getOrdersList, getProductsList, getProduct, getOrder,
    getTextColor, destroyChart, safeCanvas,
    getLogoImg: typeof getLogoImg === 'function' ? getLogoImg : () => '',
    generateLicenseKey,
    upsertDoc, toast,
    logActivity: () => Promise.resolve(),
    openModal, closeModal, EventBus, callFn,
    db, ref, set, P,
    WORKER_URL, SENDER_PHONE, SENDER_EMAIL,
    scheduleMarketSync: () => Promise.resolve(),
    renderCampaigns: () => renderCampaigns(),
    applyCampMediaTypeUI: (t) => applyCampMediaTypeUI(t),
    renderCampaignStats: (id, s) => renderCampaignStats(id, s),
    fetchCampaignStats: (id, t, u) => fetchCampaignStats(id, t, u),
    connectTikTok: () => connectTikTok(),
    refreshAllCampaignStats: () => refreshAllCampaignStats(),
  });

  /* ── Campaign accounts registry ── */
  initCampaignAccounts({
    db, ref, get, set, remove, onValue, P,
    state, toast, callFn,
    openModal, closeModal,
  });
  subscribeToAccounts();

  /* ── Campaign trends ── */
  initCampaignTrends({
    callFn, state,
    openComposerWithTrend: (topic) => openComposerWithTrend(topic),
  });

  /* ── Campaign AI composer ── */
  initCampaignAI({
    state, callFn, toast,
    upsertDoc, deleteDoc,
    openModal, closeModal,
    renderCampaigns: () => renderCampaigns(),
    getAccountForPlatformSync: (key) => getAccountForPlatformSync(key),
  });

  
  /* ── Campaign analytics ── */
  initCampaignAnalytics({
    state, callFn, toast,
    db, ref, set, remove, update, get, onValue, P,
  });

    /* ── Inbox (live listeners from worker-written Firebase nodes) ── */
  initInbox({
    state, callFn, toast,
    db, ref, set, remove, push, onValue, P,
  });
  subscribeInbox();

  /* ── Agent runner ── */
  initAgentRunner({ state, callFn, toast });

  /* ── Campaign cron (background stats refresh) ── */
  initCampaignCron({
    state, callFn, upsertDoc,
    renderCampaigns: () => renderCampaigns(),
  });
  startCampaignCron();
}

/* ═══════════════════════════════════════════════════════════════
   LIVE DATA LISTENERS (only what campaigns needs)
   ═══════════════════════════════════════════════════════════════ */
function attachListeners() {

/* campaigns */
  /* campaigns */
  onValue(ref(db, P('campaigns')), (snap) => {
    const val = snap.exists() ? snap.val() : {};
    state.data.campaigns = Object.entries(val).map(([k, v]) => ({ ...(v || {}), id: v?.id || k }));

    if (!state.firebaseReady) return;

    /* Repaint whatever module is currently visible if it reads campaigns.
       Previously this only refreshed the campaigns table and analytics
       dashboard, so scheduled posts saved from the composer never appeared
       in the calendar until the user navigated to another tab and back. */
    try {
      const current = window.Orbit?.currentModule?.();
      if (current === 'calendar'
          || current === 'campaigns'
          || current === 'publishing'
          || current === 'analytics'
          || current === 'content'
          || current === 'approvals') {
        window.Orbit?.renderActiveOrbitModule?.();
        return;
      }
    } catch (_) {}

    /* Fallback — preserve the original in-tab renders for the legacy tab system */
    if (state.currentTab === 'marketing-campaigns') renderCampaigns();
    if (state.currentTab === 'campaign-analytics') renderAnalyticsDashboard();
  });

  /* leads — needed for the "Leads" column in the campaigns table */
  onValue(ref(db, P('leads')), (snap) => {
    const val = snap.exists() ? snap.val() : {};
    state.data.leads = Object.entries(val).map(([k, v]) => ({ ...(v || {}), id: v?.id || k }));
    if (state.firebaseReady && state.currentTab === 'marketing-campaigns') renderCampaigns();
  });

  /* orders — needed for manual-sale renderers */
  onValue(ref(db, P('orders')), (snap) => {
    const val = snap.exists() ? snap.val() : {};
    state.data.orders = Object.entries(val).map(([k, v]) => ({ ...(v || {}), id: v?.id || k }));
  });

  /* products — needed for manual-sale product list */
  onValue(ref(db, P('products')), (snap) => {
    const val = snap.exists() ? snap.val() : {};
    state.data.products = Object.entries(val).map(([k, v]) => ({ ...(v || {}), id: v?.id || k }));
  });

  /* competitorBenchmarks — analytics page */
  onValue(ref(db, P('competitorBenchmarks')), (snap) => {
    state.data.competitorBenchmarks = snap.exists() ? snap.val() : {};
  });

  /* logo */
  /* logo */
  onValue(ref(db, P('logoUrl')), (snap) => {
    state.data.logoUrl = snap.exists() ? snap.val() : null;
    applyLogoToHeader();
  });

  /* competitorBenchmarks — live sync so analytics and add/refresh never
     stomp on each other with a stale local snapshot */
  onValue(ref(db, P('competitorBenchmarks')), (snap) => {
    state.data.competitorBenchmarks = snap.exists() ? snap.val() : {};
    try {
      const current = window.Orbit?.currentModule?.();
      if (current === 'analytics') window.Orbit.renderActiveOrbitModule?.();
    } catch (_) {}
  });
}

/* ═══════════════════════════════════════════════════════════════
   AUTH STATE
   ═══════════════════════════════════════════════════════════════ */
onAuthStateChanged(auth, async (user) => {
  /* Safe DOM helpers — don't crash if the element is missing */
  const show = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'block'; };
  const hide = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
  const showGrid = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'grid'; };

   if (!user) {
    showGrid('loginGate');
    hide('App');
    state.firebaseReady = false;
    return;
  }

  state.operator = { uid: user.uid, email: user.email, name: user.email };

  /* Hide login, show app */
  hide('loginGate');
  show('App');

  /* Init modules once */
  try {
    await initModules();
  } catch (e) {
    console.error('[campaigns] initModules failed:', e);
    toast('Failed to boot campaign modules: ' + e.message, 'error');
    return;
  }

  /* Attach listeners */
  attachListeners();

  /* Kick off first render */
  state.firebaseReady = true;
  state._bootDraining = false;

  /* Boot the Orbit shell — it renders the sidebar and navigates
     to the first module (Overview by default). */
  try {
    initOrbitShell({
      /* Core */
      state, callFn, toast, upsertDoc, deleteDoc,
      openModal, closeModal,

      /* Firebase SDK — needed by social accounts, competitor stats,
         and any module that writes directly to RTDB */
      db, ref, set, get, remove, update, push, onValue, P,

      /* Renderers exposed to the shell */
      renderCampaigns,
      renderAccountsPanel,
      renderTrendRadar,
      renderDraftLibrary,
      renderPromptLibrary,
    });
    window.__orbitShellReady = true;
  } catch (e) {
    console.error('[orbit-shell] init failed', e);
    toast('Failed to boot workspace shell: ' + e.message, 'error');
  }

  toast('Signed in to Campaigns', 'success');
});

/* ═══════════════════════════════════════════════════════════════
   WINDOW EXPOSURE (inline onclick handlers in render-marketplace.js
   reference window.Viora.*)
   ═══════════════════════════════════════════════════════════════ */
window.Viora = window.Viora || {};

/* Expose campaign renderers so the Orbit campaigns module can delegate */
window.Viora.renderTrendRadar = () => {
  try { renderTrendRadar(); } catch (e) { console.warn('[Viora] renderTrendRadar failed', e); }
};
window.Viora.renderDraftLibrary = () => {
  try { renderDraftLibrary(); } catch (e) { console.warn('[Viora] renderDraftLibrary failed', e); }
};
window.Viora.renderPromptLibrary = () => {
  try { renderPromptLibrary(); } catch (e) { console.warn('[Viora] renderPromptLibrary failed', e); }
};
window.Viora.refreshAllCampaignStats = () => refreshAllCampaignStats();
window.Viora.refreshCampaignStats = async (id) => {
  const c = (state.data.campaigns || []).find(x => x.id === id);
  if (!c || !c.media?.url) { toast('No media URL on this campaign.', 'info'); return; }
  try { await fetchCampaignStats(id, c.media.type, c.media.url); toast('Stats refreshed.', 'success'); }
  catch (e) { toast('Refresh failed: ' + e.message, 'error'); }
};

/* Campaign action handlers used by render-marketplace.js's HTML */
window.Viora.addCampaign = () => {
  // Uses the campaign modal in main.html — not present here.
  // Fall back to a lightweight prompt-based creation.
  const name = prompt('Campaign name:');
  if (!name) return;
  const budget = Number(prompt('Budget (KES):', '0')) || 0;
  const id = uid();
  upsertDoc('campaigns', {
    id, name, budget, spend: 0, status: 'Planned',
    startDate: todayStr(),
    endDate: '',
    createdAt: new Date().toISOString(),
  }).then(() => {
    toast('Campaign created.', 'success');
    renderCampaigns();
  }).catch(e => toast('Create failed: ' + e.message, 'error'));
};

window.Viora.editCampaign = (id) => {
  const c = (state.data.campaigns || []).find(x => x.id === id);
  if (!c) return;
  const name = prompt('Campaign name:', c.name || '');
  if (name === null) return;
  const budget = Number(prompt('Budget (KES):', String(c.budget || 0))) || 0;
  const spend  = Number(prompt('Spent (KES):',  String(c.spend  || 0))) || 0;
  upsertDoc('campaigns', {
    ...c, name, budget, spend,
    updatedAt: new Date().toISOString(),
  }, c._rev).then(() => {
    toast('Campaign updated.', 'success');
    renderCampaigns();
  }).catch(e => toast('Update failed: ' + e.message, 'error'));
};

window.Viora.deleteCampaign = async (id) => {
  if (!confirm('Delete this campaign?')) return;
  try {
    await deleteDoc('campaigns', id);
    toast('Campaign deleted.', 'info');
    renderCampaigns();
  } catch (e) {
    toast('Delete failed: ' + e.message, 'error');
  }
};

window.Viora.refreshCampaignStats = async (id) => {
  const c = (state.data.campaigns || []).find(x => x.id === id);
  if (!c || !c.media?.url) { toast('No media URL on this campaign.', 'info'); return; }
  try {
    await fetchCampaignStats(id, c.media.type, c.media.url);
    toast('Stats refreshed.', 'success');
  } catch (e) {
    toast('Refresh failed: ' + e.message, 'error');
  }
};

/* Composer + draft library + prompt library are already installed on
   window by campaign-ai.js when initCampaignAI runs. */

/* ═══════════════════════════════════════════════════════════════
   WIRE "REFRESH ALL" BUTTON
   ═══════════════════════════════════════════════════════════════ */
document.getElementById('refreshAllCampaignStatsBtn')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const prev = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing…';
  try {
    await refreshAllCampaignStats();
    toast('All campaign stats refreshed.', 'success');
  } catch (err) {
    toast('Refresh failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = prev;
  }
});

document.getElementById('campaignAnalyticsRefreshBtn')?.addEventListener('click', () => {
  renderAnalyticsDashboard();
  toast('Analytics refreshed.', 'info');
});

document.getElementById('campaignNewBtn')?.addEventListener('click', () => {
  window.Viora.addCampaign();
});

const newBtn = document.getElementById('campaignNewBtn');
if (newBtn && !newBtn._vioraCampBound) {
  newBtn._vioraCampBound = true;
  newBtn.addEventListener('click', () => window.Viora.addCampaign());
}
/* ═══════════════════════════════════════════════════════════════
   CAMPAIGN EDITOR (standalone modal controller)
   Replaces the borrowed main.html modal.
   ═══════════════════════════════════════════════════════════════ */

const _campEditor = {
  isOpen: false,
  editingId: null,
  saving: false,
};

function _ceForm() {
  return document.getElementById('campaignEditorForm');
}

function _ceUpdateMediaUI() {
  const typeEl = document.getElementById('campMediaType');
  const urlInp = document.getElementById('campMediaUrl');
  if (!typeEl || !urlInp) return;   // modal not in DOM — safe to bail

  const type = typeEl.value;
  const tiktokWrap = document.getElementById('campTikTokAuthWrap');
  const hint = urlInp;

  /* The URL input lives inside a `.field` (not a `.form-row`) in
     campaigns.html. Use closest('.field') with a fallback to the
     parent element so we never crash on a null reference. */
  const urlWrap = urlInp.closest('.field') || urlInp.parentElement || null;

  const isLive = type === 'youtube' || type === 'tiktok';
  urlInp.disabled = !isLive;

  if (urlWrap) {
    urlWrap.style.opacity = isLive ? '1' : '.45';
    /* Also grey out the label a bit */
    const lbl = urlWrap.querySelector('label');
    if (lbl) lbl.style.opacity = isLive ? '1' : '.6';
  }

  if (tiktokWrap) tiktokWrap.style.display = type === 'tiktok' ? 'block' : 'none';

  /* Placeholder text */
  if (type === 'youtube') {
    hint.placeholder = 'https://www.youtube.com/watch?v=…';
  } else if (type === 'tiktok') {
    hint.placeholder = 'https://www.tiktok.com/@user/video/…';
  } else {
    hint.placeholder = 'https://…';
    urlInp.value = '';
  }

  /* Refresh TikTok auth status when opened */
  if (type === 'tiktok') {
    const status = document.getElementById('campTikTokAuthStatus');
    if (status) {
      const tok = state.data.tiktokToken;
      if (tok && tok.accessToken) {
        status.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--accent-green);"></i> Connected' +
          (tok.openId ? ' · ' + escapeHtml(String(tok.openId).slice(0, 10)) + '…' : '');
      } else {
        status.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:var(--accent-red);"></i> Not connected — stats will be unavailable.';
      }
    }
  }
}
function _ceReset() {
  _campEditor.editingId = null;
  _campEditor.isOpen = true;
  _campEditor.saving = false;

  document.getElementById('campEditorTitle').textContent = 'New Campaign';
  document.getElementById('campSubmitLabel').textContent = 'Create campaign';
  document.getElementById('campDeleteBtn').style.display = 'none';

  _ceForm().reset();

  document.getElementById('campEditId').value = '';
  document.getElementById('campName').value = '';
  document.getElementById('campStatus').value = 'Planned';
  document.getElementById('campChannel').value = 'meta';
  document.getElementById('campBudget').value = 0;
  document.getElementById('campSpend').value = 0;
  document.getElementById('campStart').value = todayStr();
  document.getElementById('campEnd').value = '';
  document.getElementById('campObjective').value = '';
  document.getElementById('campAudience').value = '';
  document.getElementById('campMediaType').value = 'none';
  document.getElementById('campMediaUrl').value = '';
  document.getElementById('campNotes').value = '';

  _ceUpdateMediaUI();
}

function _cePopulate(campaign) {
  _campEditor.editingId = campaign.id;
  _campEditor.isOpen = true;
  _campEditor.saving = false;

  document.getElementById('campEditorTitle').textContent = 'Edit Campaign';
  document.getElementById('campSubmitLabel').textContent = 'Save changes';
  document.getElementById('campDeleteBtn').style.display = 'inline-flex';

  document.getElementById('campEditId').value = campaign.id || '';
  document.getElementById('campName').value = campaign.name || '';
  document.getElementById('campStatus').value = campaign.status || 'Planned';
  document.getElementById('campChannel').value = campaign.channel || campaign.media?.type || 'meta';
  document.getElementById('campBudget').value = Number(campaign.budget) || 0;
  document.getElementById('campSpend').value = Number(campaign.spend) || 0;
  document.getElementById('campStart').value = campaign.startDate || '';
  document.getElementById('campEnd').value = campaign.endDate || '';
  document.getElementById('campObjective').value = campaign.objective || '';
  document.getElementById('campAudience').value = campaign.audience || '';

  // Media
  const media = campaign.media || {};
  document.getElementById('campMediaType').value = media.type || 'none';
  document.getElementById('campMediaUrl').value = media.url || '';

  // Notes
  document.getElementById('campNotes').value = campaign.notes || '';

  _ceUpdateMediaUI();
}

function _ceValidate() {
  const name = document.getElementById('campName').value.trim();
  if (!name) { toast('Campaign name is required.', 'error'); return false; }

  const start = document.getElementById('campStart').value;
  const end = document.getElementById('campEnd').value;
  if (start && end && end < start) {
    toast('End date must be on or after the start date.', 'error');
    return false;
  }

  const mediaType = document.getElementById('campMediaType').value;
  const mediaUrl  = document.getElementById('campMediaUrl').value.trim();
  if (mediaType !== 'none') {
    if (!mediaUrl) { toast('Media URL is required for the selected media type.', 'error'); return false; }
    if (!/^https?:\/\//i.test(mediaUrl)) { toast('Media URL must start with http:// or https://', 'error'); return false; }
    if (mediaType === 'youtube' && !/youtube\.com|youtu\.be/i.test(mediaUrl)) {
      toast('That does not look like a YouTube URL.', 'error'); return false;
    }
    if (mediaType === 'tiktok' && !/tiktok\.com/i.test(mediaUrl)) {
      toast('That does not look like a TikTok URL.', 'error'); return false;
    }
  }
  return true;
}

async function _ceSave(e) {
  if (e) e.preventDefault();
  if (_campEditor.saving) return;
  if (!_ceValidate()) return;

  _campEditor.saving = true;
  const submitBtn = _ceForm().querySelector('button[type="submit"]');
  const originalHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
  }

  try {
    const id = document.getElementById('campEditId').value || uid();
    const existing = (state.data.campaigns || []).find(x => x.id === id);

    const mediaType = document.getElementById('campMediaType').value;
    const mediaUrl  = document.getElementById('campMediaUrl').value.trim();

    const payload = {
      id,
      name: document.getElementById('campName').value.trim(),
      status: document.getElementById('campStatus').value,
      channel: document.getElementById('campChannel').value,
      budget: Number(document.getElementById('campBudget').value) || 0,
      spend:  Number(document.getElementById('campSpend').value) || 0,
      startDate: document.getElementById('campStart').value || '',
      endDate:   document.getElementById('campEnd').value || '',
      objective: document.getElementById('campObjective').value || '',
      audience: document.getElementById('campAudience').value.trim(),
      notes: document.getElementById('campNotes').value.trim(),
      media: {
        type: mediaType,
        url: mediaType === 'none' ? null : mediaUrl,
      },
      // Preserve existing stats unless the media URL changed
      stats: (existing?.media?.url === mediaUrl) ? (existing?.stats || null) : null,
      statsUpdatedAt: (existing?.media?.url === mediaUrl) ? (existing?.statsUpdatedAt || null) : null,
      statsError: null,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: existing?.createdBy || state.operator?.email || 'operator',
    };

    await upsertDoc('campaigns', payload, existing?._rev);

    // Fire-and-forget initial stats fetch
    if (mediaType !== 'none' && mediaUrl) {
      setTimeout(() => {
        fetchCampaignStats(id, mediaType, mediaUrl).catch(err =>
          console.warn('[campaigns] initial stats fetch failed:', err.message));
      }, 400);
    }

    toast(_campEditor.editingId ? 'Campaign updated.' : 'Campaign created.', 'success');
    closeModal('campaignEditorModal');
    _campEditor.isOpen = false;

    renderCampaigns();
    renderAnalyticsDashboard();
  } catch (err) {
    if (err.message === 'CONFLICT_ABORTED') return;
    console.error('[campaign editor] save failed:', err);
    toast('Save failed: ' + (err.message || 'unknown'), 'error');
  } finally {
    _campEditor.saving = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
  }
}

async function _ceDelete() {
  const id = _campEditor.editingId;
  if (!id) return;

  const camp = (state.data.campaigns || []).find(x => x.id === id);
  const name = camp?.name || 'this campaign';

  const ok = confirm(`Delete "${name}"?\n\nThis cannot be undone.`);
  if (!ok) return;

  const btn = document.getElementById('campDeleteBtn');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting…';

  try {
    await deleteDoc('campaigns', id);
    toast('Campaign deleted.', 'info');
    closeModal('campaignEditorModal');
    _campEditor.isOpen = false;
    renderCampaigns();
    renderAnalyticsDashboard();
  } catch (err) {
    toast('Delete failed: ' + (err.message || 'unknown'), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

/* ── Wire the editor once the DOM is ready ── */
function _ceWire() {
  const form = _ceForm();
  if (!form || form._vioraCampWired) return;
  form._vioraCampWired = true;

  form.addEventListener('submit', _ceSave);

  document.getElementById('campDeleteBtn')?.addEventListener('click', _ceDelete);

  document.getElementById('campMediaType')?.addEventListener('change', _ceUpdateMediaUI);

  document.getElementById('campTikTokConnectBtn')?.addEventListener('click', () => {
    connectTikTok();
  });

  // Modal close via data-close
  document.querySelectorAll('[data-close="campaignEditorModal"]').forEach(b => {
    b.addEventListener('click', () => {
      closeModal('campaignEditorModal');
      _campEditor.isOpen = false;
    });
  });

  // Outside click closes
  const overlay = document.getElementById('campaignEditorModal');
  overlay?.addEventListener('click', (e) => {
    if (e.target !== overlay) return;
    closeModal('campaignEditorModal');
    _campEditor.isOpen = false;
  });

  // Escape closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _campEditor.isOpen) {
      closeModal('campaignEditorModal');
      _campEditor.isOpen = false;
    }
  });

  // Warn on unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (!_campEditor.isOpen) return;
    const nameVal = document.getElementById('campName')?.value?.trim();
    if (!nameVal) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

/* ── Public API used by render-marketplace.js inline handlers ── */
window.Viora.addCampaign = function () {
  if (!document.getElementById('campaignEditorModal')) {
    toast('Campaign editor not loaded.', 'error');
    return;
  }
  _ceReset();
  openModal('campaignEditorModal');
  setTimeout(() => document.getElementById('campName')?.focus(), 80);
};

window.Viora.editCampaign = function (id) {
  const camp = (state.data.campaigns || []).find(x => x.id === id);
  if (!camp) { toast('Campaign not found.', 'error'); return; }
  if (!document.getElementById('campaignEditorModal')) {
    toast('Campaign editor not loaded.', 'error');
    return;
  }
  _cePopulate(camp);
  openModal('campaignEditorModal');
  setTimeout(() => document.getElementById('campName')?.focus(), 80);
};

window.Viora.deleteCampaign = async function (id) {
  const camp = (state.data.campaigns || []).find(x => x.id === id);
  if (!camp) return;
  if (!confirm(`Delete "${camp.name || 'this campaign'}"?`)) return;
  try {
    await deleteDoc('campaigns', id);
    toast('Campaign deleted.', 'info');
    renderCampaigns();
    renderAnalyticsDashboard();
  } catch (err) {
    toast('Delete failed: ' + (err.message || 'unknown'), 'error');
  }
};

/* Wire the editor as soon as the module runs */
_ceWire();
