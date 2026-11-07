// ═══════════════════════════════════════════════════════════════
// main.js — VIORA Intercollective System v3.7.6
// Bug-fixed rewrite.
//
// v3.7.6 changes:
//   • FIXED: applyLogoEverything → applyLogoEverywhere in
//     buildVioraHandlers AND initMainWiring deps. This was the
//     boot-killer ReferenceError that silently prevented
//     Object.assign(Viora, handlers), killing sidebar navigation.
//   • FIXED: window.deleteTrackItem / resetTrackGame — use
//     getters so they always reflect the live Viora methods.
//   • FIXED: Two-phase initIdb — first without directWrite/
//     directDelete (unavailable until initWriteLayer runs), then
//     re-init with them so offline queue actually flushes.
//   • FIXED: _bootAppDone only set on boot() success.
//   • FIXED: getOverdueInstallments / getUpcomingInstallments
//     now include PROJECT-level installments (was dead code).
//   • FIXED: updateSidebarCounters retries up to 60 frames and
//     resets on success (was permanently stuck after one miss).
//   • FIXED: scheduleMarketSync queue capped at 50.
//   • FIXED: logActivity guards against undefined
//     queueOfflineMutation.
//   • REMOVED: Dead EARLY LAZY ACCESSORS block that shadowed the
//     real imports.
// ═══════════════════════════════════════════════════════════════
import './main/sw-bootstrap.js';

import { initializeApp, getApp, getApps } from "firebase/app";
import { boot, registerNetworkEvents } from './main/boot.js';
import {
  getDatabase, ref, onValue, onChildAdded, onChildChanged, onChildRemoved,
  set, push, remove, get, update, goOnline, goOffline, query, limitToLast,
  increment, off, forceLongPolling
} from "firebase/database";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "firebase/auth";

/* ── History guard ── */
import { initHistoryGuard, watchModals } from './viora-history.js';

/* ── Helpers ── */
import * as H from './main/helpers.js';

/* ── IDB ── */
import {
  IDB_NAME, IDB_STORE, IDB_QUEUE_STORE, IDB_EVENT_QUEUE_STORE, IDB_VERSION,
  initIdb, idbOpen, idbSave, idbLoad, idbClear,
  queueOfflineMutation, removeFromQueue, updateQueueEntry,
  updatePendingCount, flushOfflineQueue,
  eventQueuePush, eventQueueDrain, eventQueueRemove, eventQueueClear,
  idbGetDedupeStamp, idbSetDedupeStamp
} from './main/idb.js';

/* ── Dashboard ── */
import {
  initRenderDashboard,
  renderDashboard, renderAdminAnalytics,
  buildNotifications, renderNotifications,
  surfaceVioraNotification, attachVioraNotificationListener,
  buildLocalRecommendations, renderRecommendations, refreshRecommendations,
  initDashboardNotifications,
  renderDashboardNotifications,
} from './main/render-dashboard.js';

// ★ dashboard-hero.js removed from the pipeline.
// The hero layers are now:
//   hero-sky.js        → stars + moon (canvas z0)
//   hero-terminator.js → Preetham sky gradient (canvas z1)
//   hero-orb.js        → sun disc (DOM #vioraHeroOrb, z11)
//   hero-banner.js     → clouds + particles (canvas z3)
//   hero-globe.js      → globe (canvas z4)
//   hero-tooltip.js    → click-to-open panel
//
// Dashboard-hero.js painted a SECOND full-screen gradient on a
// canvas at z0 that competed with hero-sky.js. That canvas
// (#vioraHeroWeatherCanvas) is what made the sky look wrong
// and hid the sun behind a duplicate warm gradient.
import {
  initDashboardWeather,
  bootDashboardWeather, stopDashboardWeather, refreshWeather,
  openLocationPicker, loadWeatherLocation, saveWeatherLocation,
} from './main/dashboard-weather.js';
import { initDashboardKpis, renderDashboardKpis } from './main/dashboard-kpis.js';
import { initDashboardAttention, renderDashboardAttention } from './main/dashboard-attention.js';

/* ── Write layer ── */
import {
  initWriteLayer, validateRecord, fingerprintFor, dedupeWriteGuard,
  directWrite, directDelete, upsertDoc, upsertPersonal, upsertTrackFlat,
  deletePersonal, deleteTrackFlat, deleteDoc
} from './main/write-layer.js';

/* ── Orchestration ── */
import {
  initOrchestration, ORCHESTRATION_HANDOFFS, HANDLERS,
  Orchester, EventBus, Archiver,
  renderOrchestrationPanel, renderArchivesPanel
} from './main/orchestration.js';

/* ── AI ── */
import {
  initAIServices,
  AIFiling, AIRank, AIAnomaly
} from './main/ai-services.js';

/* ── Finance ── */
import {
  initFinance,
  getInvoicePaidAmount,
  getInvoiceTotals,
  getInvoiceStatusDerived,
  generateInvoiceNumber,
  nextProjectInvoiceNumber,
  buildInvoiceProgressMessage,
  reconcilePayment,
  onInvoicePaid,
  sendInvoiceReceipt,
  applyClientCreditToInvoice,
  openPayChain,
  confirmPayChain,
  openPaymentModal,
  renderPaymentProjectPicker,
  renderPaymentAllocation,
  updatePaymentSummary,
  savePayment,
  deletePayment,
  openInvoiceGenModal,
  refreshInvoiceProjects,
  renderExtraCharges,
  removeCharge,
  updateInvoicePreview,
  openInvoiceViewModal,
  deleteInvoice,
  openStkModal,
  sendStkPush,
  openMpesaModal,
  findInvoiceCandidates,
  autoMatchMpesa,
  applyMpesaMatch,
  processMpesaQueue,
  renderMpesaModal,
  openManualMpesaMatch,
  confirmMpesaMatch,
  renderMpesaInline,
  openServiceAgreementModal,
  attachServiceAgreement,
  sendClientStatement,
  transferProjectCredit,
  openFeesModal,
  openCreditTransfer,
  bulkRemind,
} from './main/finance.js';

/* ── Push ── */
import {
  initPushNotifications,
  PushNotifications
} from './main/push-notifications.js';

/* ── Smart Import ── */
import {
  initSmartImport,
  setupImportDropzone
} from './main/smart-import.js';

/* ── Command Palette ── */
import {
  initCommandPalette,
  openCmdPalette,
  setupCommandPalette
} from './main/command-palette.js';

/* ── Admin ── */
import {
  initRenderAdmin,
  renderEmployees, renderAssets, renderCompliance, renderUsers,
  renderDocumentVault, renderActivity, renderTrash,
  renderSupportTickets, viewTicket, closeTicketView,
  sendTicketReply, toggleTicketStatus, markTicketResolved, deleteTicket,
  renderPortalRequests, renderPortalUsers,
  getViewingTicketId,
  renderProfile, renderClientsite,
} from './main/render-admin.js';

/* ── Subscriptions ── */
import {
  initSubscriptions,
  renderSubscriptions,
  SubscriptionsAdmin
} from './main/subscriptions.js';

/* ── Partner + Personal ── */
import {
  initRenderPartner,
  renderPartnerTasks, renderPartnerHourly, renderPartnerSchedule,
  renderPartnerHandoffs, renderPartnerFinancials, renderPartnerActivities,
  renderPartnerChat, renderPartnerPresence, renderPartnerGames
} from './main/render-partner.js';

import {
  initRenderPersonal,
  renderPersonalTodos, renderPersonalGoals, renderPersonalSkills,
  renderGoalMilestoneEditor,
  computeGoalProgress, personalOwnerFilter,
} from './main/render-personal.js';

import {
  initSubscriptionPlans,
  renderSubscriptionPlans
} from './main/main-subscription-plans.js';

/* ── Training ── */
import {
  initTraining, renderTrainingOverview, renderTrainingRequests,
  renderTrainingUsers, renderTrainingProgress, renderTrainingQuizzes,
  renderTrainingCertificates, viewQuizSubmission, openCourseEditor,
  renderCeModules, toggleCeQuiz, addQuizQuestion, removeQuizQuestion,
  updateQuizQuestion, updateQuizOption, setQuizAnswer, addQuizOption,
  removeQuizOption, updateCeModule, addCeModule, removeCeModule, moveCeModule,
  saveCourse, deleteCourse, openChecklistEditor, renderCleTasks, updateCleTask,
  addCleTask, removeCleTask, saveChecklist, openResourceEditor, handleReFile,
  saveResource, deleteResource, openResourceFile, awardTrainingCertificate,
  viewTrainingCert, revokeTrainingCertImpl, renderCertTemplatesGrid,
  openCertTemplateEditor, refreshCertTemplateModules, showCertTemplatePreview,
  paintCertTemplateStamps, saveCertTemplate, deleteCertTemplate,
  renderCertificateImage, openManualAwardModal,
  AutoCertification,
  setupCertStampDragging,
  TrainingVioraAPI,
  setTrainingContext,
  bindTrainingEvents
} from './main/training.js';

/* ── PP + Market Content ── */
import { initPP, PP, bindPPEvents } from './main/pp.js';

import {
  initMarketContent, renderMarketContent, saveMarketContent, bindMarketContentEvents,
  savePromos, saveProductExtras        // ➕ NEW — for direct invocation if needed
} from './main/market-content.js';

/* ── Charts ── */
import {
  initCharts,
  getTextColor, destroyChart, safeCanvas,
  renderCharts, renderMarketplaceCharts
} from './main/charts.js';

/* ── Global Market ── */
import {
  initGlobalMarket,
  setupGlobalMarket, loadGlobalDashboard
} from './main/global-market.js';

/* ── Modal utils ── */
import {
  initModalUtils,
  openModal, closeModal, showModal, hideModal,
  toast, setSyncStatus,
  vioraConfirm, vioraPrompt,
  applyLogoEverywhere, getLogoImg
} from './main/modal-utils.js';

/* ── Projects ── */
import {
  initProjects,
  getProjectAgreedTotal,
  getProjectBilledTotal,
  getProjectPaidTotal,
  getProjectRemainingTotal,
  getProjectFinancialProgress,
  recomputeProjectProgress,
  bulkGenerateTasksForClient,
  renderProjects,
  renderTasks,
  renderProjectTasksEditor,
  renderProjectInstallmentEditor,
  removeProjectInstallment,
  renderClientProjectsFeeEditor,
  openProjectDeliverables,
} from './main/projects.js';

/* ── Contacts ── */
import {
  initContacts,
  contactButtons,
  getEntityById,
  openCommModal,
  switchCommChannel,
  buildTemplates,
  updateCommPreview,
  sendComm,
  renderCommunications,
  openCommFullPreview,
} from './main/contacts.js';

/* ── Clients ── */
import {
  initClients,
  getEntities,
  getClients,
  getEmployees,
  getClient,
  getClientName,
  getClientProjects,
  getClientDocs,
  getClientInvoices,
  getClientPayments,
  getClientDeals,
  getClientContracts,
  getClientTasks,
  getClientComms,
  getClientAppointments,
  getClientPresentations,
  getClientAgreedTotal,
  getClientBilledTotal,
  getClientPaidTotal,
  getClientRemainingTotal,
  getClientCreditTotal,
  recomputeClientRollup,
  recomputeClientInstallments,
  renderClients,
  renderClientCards,
  renderClient360Page,
  openClient360,
  renderClientAvatarPreview,
  generateClientReport,
  downloadReportPdf,
  buildClientStatementPdf,
  openWelcomeEmailPreview,
} from './main/clients.js';



import {
  initRenderMarketplace,
  getMarketplaceMetrics, getProductSalesMetrics,
  renderMarketplaceProducts, renderPublicUiProducts, renderMarketplaceOrders,
  renderMarketplaceAnalytics, computeMarketAnalytics, invalidateMarketAnalytics,
  materializeMarketplaceLeads,
  openOrderDetail,
  renderMyOrders, renderMyWishlist,
  renderCampaigns, applyCampMediaTypeUI, renderCampaignStats,
  fetchCampaignStats, connectTikTok,
  startCampaignStatsAutoRefresh, refreshAllCampaignStats,
  openManualSale, renderMsProductsList, renderMsSummary,
  updateManualSaleItem, removeManualSaleItem, submitManualSale,
  addToWishlist, removeFromWishlist, buyFromWishlist,
} from './main/render-marketplace.js';

/* ── Misc helpers ── */
import {
  initMiscHelpers,
  exportCsv,
  openJournalModal, renderJeLines, updateJeBalance, postJournalEntry,
  openProposalStudio, generateProposalDraft, saveProposalDraft,
  proposalToVault, proposalToInvoice,
} from './main/misc-helpers.js';

/* ── Main renderers / handlers / wiring ── */
import {
  initMainRenderers,
  renderLeads, renderDeals, renderPipelineKanban,
  renderContracts, renderProposals,
  renderAppointments, renderPresentations,
  renderInventory, renderInvoices, renderPayments,
  renderLedger, renderExpenses, renderPayroll,
  dedupeLeads,                 // ★ v9.2 — marketplace→leads pipeline
  syncMarketToLeads,           // ★ v9.2
  syncOrderLeads,              // ★ v9.2
  syncBlueprintLeads,          // ★ v9.2 (exposed but not auto-run)
} from './main/viora-main-renderers.js';

import { buildVioraHandlers } from './main/viora-main-handlers.js';
import { initMainWiring } from './main/viora-main-wiring.js';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const WORKER_URL = "https://viora-api.cliff254johns.workers.dev";
const ROOT       = 'viora_data';
const ORG        = 'orgs/viora';
const TRACK_SEGMENT = 'track';

const SENDER_PHONE  = "+254713428774";
const SENDER_EMAIL  = "cliff254johns@gmail.com";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const APP_VERSION   = "3.7.6";

/* ═══════════════════════════════════════════════════════════════
   FIREBASE INIT
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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db   = getDatabase(app);
forceLongPolling(db);
const auth = getAuth(app);

/* ═══════════════════════════════════════════════════════════════
   COLLECTIONS + PATH HELPERS
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
  'promos',
  'productExtras',
  'reviews',
  'socialAccounts',
  'competitorBenchmarks',
  'homeContent',
  'industries',              // ★ NEW — v2.0
  'employeeProfiles'
]);

const TRACK_COLLECTIONS = new Set([
  'todos','goals','skills','activities','hourly','chat','games',
  'presence','typing','history','handoffs','schedule'
]);

const TRACK_P = (path) => `viora_data/orgs/viora/track/${String(path || '').replace(/^\/+|\/+$/g, '')}`;

function P(path) {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  const [head, ...rest] = clean.split('/');
  const tail = rest.length ? '/' + rest.join('/') : '';
  if (TRACK_COLLECTIONS.has(head)) return `${ROOT}/${ORG}/${TRACK_SEGMENT}/${head}${tail}`;
  if (ORG_COLLECTIONS.has(head))   return `${ROOT}/${ORG}/${head}${tail}`;
  return `${ROOT}/${clean}`;
}

const BUSINESS_COLLECTIONS = [
  'entities','leads','campaigns','deals','contracts','projects',
  'inventory','invoices','payments','accounts','ledger','expenses','payroll',
  'assets','compliance','documents','proposals','mpesaTransactions',
  'appointments','presentations',
  'products','orders','tickets',
  'archivedClients','archivedDeals','archivedProjects',
];

/* ═══════════════════════════════════════════════════════════════
   GLOBAL APP STATE
   ═══════════════════════════════════════════════════════════════ */
const state = {
  data: {},
  operator: null,
  _operatorLoaded: false,
  currentTab: 'dashboard',
  navMode: 'queues',
  mobileCategory: 'exec',
  charts: {},
  notifOpen: false,
  _counterCache: null,
  _counterEls: null,
  _counterClean: false,
  _counterRetried: 0,
  _dirtyCollections: new Set(),
  _firstLoadComplete: false,
  _bootDraining: false,
  _forceRepaint: false,
  _lastPaintedTab: null,
  _lastPaintAt: 0,
  _queueCache: null,
  _queueCacheTime: 0,
  _activeQueueId: null,
  _aiRankInFlight: false,
  _aiRankStart: 0,
  _aiRankLastRun: 0,
  _lastBootDedupeDone: false,
  marketSyncInFlight: false,
  marketSyncScheduled: false,
  _marketSyncLastRun: 0,
  _convLeadLock: new Set(),
  firebaseReady: false,
  cacheUsed: false,
  pendingCount: 0,
  _eventBusQueue: [],
  _eventLog: [],
  _lastMarketLeadIds: [],
  viewingOrderId: null,
  viewing360ClientId: null,
  viewingInvoiceId: null,
  pendingPaymentInvoice: null,
  pendingSA: null,
  pendingMpesaTx: null,
  pendingStkInvoiceId: null,
  pendingJeLines: [],
  pendingProjectInstallments: null,
  pendingClientAvatar: null,
  pendingPresence: null,
  pendingDoc: null,
  editingPersonalGoal: null,
  extraChargesDraft: [],
  pendingPresAttachments: [],
  manualSaleDraft: [],
  _payChain: null,
  _portalApproveUid: null,
  _editingIndustryKey: null,
  _heroLocation: null,
  _heroWeatherCache: {},
};
window.state = state;

/* ═══════════════════════════════════════════════════════════════
   LAZY DELEGATES — scheduleMarketSync / renderActiveTab / renderAll
   ═══════════════════════════════════════════════════════════════ */
let _scheduleMarketSyncImpl = null;
const _scheduleMarketSyncQueue = [];
const _SCHEDULE_QUEUE_CAP = 50;

function scheduleMarketSync(opts = {}) {
  if (typeof _scheduleMarketSyncImpl === 'function') {
    try { return _scheduleMarketSyncImpl(opts); }
    catch (e) { console.warn('[scheduleMarketSync] impl failed', e); return Promise.resolve(); }
  }
  if (_scheduleMarketSyncQueue.length < _SCHEDULE_QUEUE_CAP) {
    _scheduleMarketSyncQueue.push(opts);
  } else {
    console.warn('[scheduleMarketSync] queue full — dropping request');
  }
  return Promise.resolve();
}

function setScheduleMarketSyncImpl(fn) {
  _scheduleMarketSyncImpl = fn;
  if (_scheduleMarketSyncQueue.length && typeof fn === 'function') {
    const queued = _scheduleMarketSyncQueue.splice(0);
    for (const opts of queued) {
      try { fn(opts); } catch (e) { console.warn('[scheduleMarketSync] flush failed', e); }
    }
  }
}
window.scheduleMarketSync = scheduleMarketSync;

let _renderActiveTabImpl = null;

function setRenderActiveTabImpl(fn) {
  _renderActiveTabImpl = fn;
}

function renderActiveTab() {
  if (typeof _renderActiveTabImpl === 'function') {
    try { return _renderActiveTabImpl(); }
    catch (e) { console.error('[renderActiveTab] impl threw:', e); }
  }
  return undefined;
}

function renderAll() {
  if (typeof _renderActiveTabImpl === 'function') {
    try { return _renderActiveTabImpl(); }
    catch (e) { console.error('[renderAll] impl threw:', e); }
  }
  scheduleRender(true);
}

window.renderActiveTab = renderActiveTab;
window.renderAll = renderAll;

/* ═══════════════════════════════════════════════════════════════
   H SHORTCUTS
   ═══════════════════════════════════════════════════════════════ */
const $                   = H.$;
const uid                 = H.uid;
const todayStr            = H.todayStr;
const dateToStr           = H.dateToStr;
const fmtDate             = H.fmtDate;
const fmtDateTime         = H.fmtDateTime;
const timeAgo             = H.timeAgo;
const daysBetween         = H.daysBetween;
const isOverdue           = H.isOverdue;
const FX_RATE             = H.FX_RATE;
const fmtKES              = H.fmtKES;
const fmtUSD              = H.fmtUSD;
const usdToKes            = H.usdToKes;
const kpiFormat           = H.kpiFormat;
const escapeHtml          = H.escapeHtml;
const fmtBytes            = H.fmtBytes;
const normalizePhone      = H.normalizePhone;
const normalizeEmail      = H.normalizeEmail;
const simpleHash          = H.simpleHash;
const emailToId           = H.emailToId;
const generateLicenseKey  = H.generateLicenseKey;
const isMobile            = H.isMobile;
const debounce            = H.debounce;
const pickFile            = H.pickFile;
const pickFileMobileSplit = H.pickFileMobileSplit;

Object.assign(window, {
  $, uid, todayStr, dateToStr, fmtDate, fmtDateTime, timeAgo, daysBetween,
  isOverdue, fmtKES, fmtUSD, usdToKes, kpiFormat, escapeHtml, fmtBytes,
  normalizePhone, normalizeEmail, generateLicenseKey, isMobile, debounce,
  pickFile, pickFileMobileSplit, P, TRACK_P,
  VioraDb: db, VioraAuth: auth, VioraApp: app
});

var Viora = window.Viora || {};
window.Viora = Viora;

/* ═══════════════════════════════════════════════════════════════
   LOCAL INSTALLMENT HELPERS
   Reads from CLIENT-level and PROJECT-level installments.
   ═══════════════════════════════════════════════════════════════ */
function _allUnpaidInstallments() {
  const out = [];
  const entities = Array.isArray(state.data.entities) ? state.data.entities : [];
  const projects = Array.isArray(state.data.projects) ? state.data.projects : [];
  const sideStore = state.data.installments && typeof state.data.installments === 'object'
    ? state.data.installments : null;

  const clientById = new Map();
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e && e.type === 'client' && e.id) clientById.set(e.id, e);
  }

  /* 1. Client-level installments (legacy + side-store) */
  for (let i = 0; i < entities.length; i++) {
    const c = entities[i];
    if (!c || c.type !== 'client') continue;

    const direct = Array.isArray(c.installments) ? c.installments : [];
    for (let j = 0; j < direct.length; j++) {
      const inst = direct[j];
      if (!inst || inst.paid) continue;
      out.push({
        clientId: c.id,
        clientName: c.name || '—',
        projectId: inst.projectId || null,
        amount: Number(inst.amount) || 0,
        dueDate: inst.dueDate || '',
        inst,
        source: 'client'
      });
    }

    if (sideStore && sideStore[c.id]) {
      const side = sideStore[c.id];
      const sideArr = Array.isArray(side) ? side : Object.values(side || {});
      for (let j = 0; j < sideArr.length; j++) {
        const inst = sideArr[j];
        if (!inst || inst.paid) continue;
        out.push({
          clientId: c.id,
          clientName: c.name || '—',
          projectId: inst.projectId || null,
          amount: Number(inst.amount) || 0,
          dueDate: inst.dueDate || '',
          inst,
          source: 'side'
        });
      }
    }
  }

  /* 2. Project-level installments (current shape) */
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (!p || p.status === 'cancelled') continue;
    const arr = Array.isArray(p.installments) ? p.installments : [];
    const client = clientById.get(p.clientId);
    for (let j = 0; j < arr.length; j++) {
      const inst = arr[j];
      if (!inst || inst.paid) continue;
      const remaining = Math.max(0, (Number(inst.amount) || 0) - (Number(inst.partialPaid) || 0));
      if (remaining <= 0) continue;
      out.push({
        clientId: p.clientId,
        clientName: client ? (client.name || '—') : '—',
        projectId: p.id,
        projectNumber: p.projectNumber || '',
        amount: remaining,
        dueDate: inst.dueDate || '',
        inst,
        source: 'project'
      });
    }
  }

  return out;
}

function getOverdueInstallments() {
  const today = todayStr();
  return _allUnpaidInstallments().filter(x => x.dueDate && x.dueDate < today);
}

function getUpcomingInstallments(days = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const cs = dateToStr(cutoff);
  const today = todayStr();
  return _allUnpaidInstallments()
    .filter(x => x.dueDate && x.dueDate >= today && x.dueDate <= cs)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
}

/* Expose for dashboard-attention.js which needs these */
window.getOverdueInstallments = getOverdueInstallments;
window.getUpcomingInstallments = getUpcomingInstallments;
window.buildNotificationsRef = () => {
  try { return (typeof buildNotifications === 'function') ? buildNotifications() : []; }
  catch (_) { return []; }
};

/* ═══════════════════════════════════════════════════════════════
   COMM-DEDUPE REGISTRY
   ═══════════════════════════════════════════════════════════════ */
if (!window.__vioraCommSentKeys || !(window.__vioraCommSentKeys instanceof Set)) {
  window.__vioraCommSentKeys = new Set();
}
window.__vioraCommSentKeys._lastGc = window.__vioraCommSentKeys._lastGc || Date.now();

window.__vioraGcCommDedupe = function () {
  if (Date.now() - window.__vioraCommSentKeys._lastGc < 30 * 60 * 1000) return;
  window.__vioraCommSentKeys.clear();
  window.__vioraCommSentKeys._lastGc = Date.now();
  console.info('[viora] comm dedupe registry cleared');
};

/* ═══════════════════════════════════════════════════════════════
   ACTIVITY + COMM LOG
   ═══════════════════════════════════════════════════════════════ */
async function logActivity(type, title, description = '', entity = null) {
  try {
    if (!navigator.onLine) {
      if (typeof queueOfflineMutation === 'function') {
        try {
          await queueOfflineMutation('activityLog', 'upsert', {
            id: uid(), type, title, description, entity,
            by: state.operator?.uid || 'system',
            byName: state.operator?.name || 'System',
            timestamp: new Date().toISOString()
          });
        } catch (e) {
          console.warn('[logActivity] queue failed:', e);
        }
      }
      return;
    }
    const evRef = push(ref(db, P('activityLog')));
    const entry = {
      id: evRef.key, type, title, description, entity,
      by: state.operator?.uid || 'system',
      byName: state.operator?.name || 'System',
      timestamp: new Date().toISOString()
    };
    await set(evRef, entry);
    state.data.activityLog = state.data.activityLog || [];
    state.data.activityLog.unshift(entry);
    if (state.data.activityLog.length > 500) state.data.activityLog = state.data.activityLog.slice(0, 500);
  } catch (e) { /* non-fatal */ }
}

async function logComm(channel, recipientId, recipientName, recipientContact, subject, message, extra = {}) {
  try {
    const callerKey  = extra.dedupeKey ? String(extra.dedupeKey) : null;
    const reasonKey  = extra.reason ? `${channel}|${recipientId}|${extra.reason}` : null;
    const bodyHash   = simpleHash(`${channel}|${recipientId}|${subject || ''}|${message || ''}`);
    const fallbackKey = `${channel}|${recipientId}|${bodyHash}`;
    const dedupeKey = callerKey || reasonKey || fallbackKey;

    if (window.__vioraCommSentKeys.has(dedupeKey)) {
      console.info('[logComm] suppressed duplicate (memory):', dedupeKey);
      const orig = (state.data.commLog || []).find(c => c._dedupeKey === dedupeKey);
      if (orig) {
        orig._duplicateCount = (orig._duplicateCount || 1) + 1;
        orig._lastDuplicateAt = new Date().toISOString();
        try { await set(ref(db, `${P('commLog')}/${orig.id}`), orig); } catch (e) {}
      }
      return orig?.id || null;
    }

    const recent = (state.data.commLog || []).slice(0, 200);
    const existing = recent.find(c => c._dedupeKey === dedupeKey);
    if (existing) {
      console.info('[logComm] suppressed duplicate (db):', dedupeKey);
      window.__vioraCommSentKeys.add(dedupeKey);
      existing._duplicateCount = (existing._duplicateCount || 1) + 1;
      existing._lastDuplicateAt = new Date().toISOString();
      try { await set(ref(db, `${P('commLog')}/${existing.id}`), existing); } catch (e) {}
      return existing.id;
    }

    const evRef = push(ref(db, P('commLog')));
    const entry = {
      id: evRef.key, channel, recipientId, recipientName, recipientContact,
      subject: subject || '', message: message || '',
      sentBy: state.operator?.name || 'System', status: 'local',
      timestamp: new Date().toISOString(),
      _dedupeKey: dedupeKey, _duplicateCount: 1,
      ...extra
    };
    delete entry._dedupeKeyFromExtra;
    await set(evRef, entry);
    state.data.commLog = state.data.commLog || [];
    state.data.commLog.unshift(entry);
    if (state.data.commLog.length > 500) {
      state.data.commLog = state.data.commLog.slice(0, 500);
    }
    window.__vioraCommSentKeys.add(dedupeKey);
    return evRef.key;
  } catch (e) {
    console.warn('[logComm] failed:', e);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   WINDOW EXPOSURE FOR IDB + WRITE-LAYER PRIMITIVES
   ═══════════════════════════════════════════════════════════════ */
Object.assign(window, {
  IDB_NAME, IDB_STORE, IDB_QUEUE_STORE, IDB_EVENT_QUEUE_STORE, IDB_VERSION,
  idbOpen, idbSave, idbLoad, idbClear,
  queueOfflineMutation, removeFromQueue, updateQueueEntry,
  updatePendingCount, flushOfflineQueue,
  eventQueuePush, eventQueueDrain, eventQueueRemove, eventQueueClear,

  validateRecord, fingerprintFor, dedupeWriteGuard,
  directWrite, directDelete,
  upsertDoc, upsertPersonal, upsertTrackFlat,
  deletePersonal, deleteTrackFlat, deleteDoc,

  ref, set, update, remove, get, push, off,
  onValue, onChildAdded, onChildChanged, onChildRemoved,
  query, limitToLast, goOnline, goOffline,

  logActivity, logComm,
  toast, setSyncStatus,
  openModal, closeModal, showModal, hideModal,
  vioraConfirm, vioraPrompt,
  applyLogoEverywhere, getLogoImg,

  VioraDb: db, VioraAuth: auth, VioraApp: app
});

/* ═══════════════════════════════════════════════════════════════
   AUTH TOKEN HELPER + callFn
   ═══════════════════════════════════════════════════════════════ */
async function _getAuthToken() {
  if (auth.currentUser) {
    try { return await auth.currentUser.getIdToken(); }
    catch (e) { console.warn('[auth] getIdToken failed:', e.message); }
  }

  return new Promise(resolve => {
    let settled = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (settled) return;
      settled = true;
      try { unsub(); } catch (e) {}
      if (!user) { resolve(null); return; }
      try { resolve(await user.getIdToken()); }
      catch (e) { resolve(null); }
    });
    setTimeout(() => {
      if (settled) return;
      settled = true;
      try { unsub(); } catch (e) {}
      resolve(null);
    }, 5000);
  });
}

async function callFn(name, payload = {}) {
  let idToken;
  try { idToken = await _getAuthToken(); }
  catch (e) { throw new Error('Auth token unavailable: ' + (e.message || 'unknown')); }
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

window._getAuthToken = _getAuthToken;
window.callFn = callFn;

/* ═══════════════════════════════════════════════════════════════
   FLUSH COALESCER
   ═══════════════════════════════════════════════════════════════ */
let _flushScheduled = null;
let _flushRunning = false;

function scheduleFlush() {
  if (_flushRunning || _flushScheduled) return;
  _flushScheduled = setTimeout(async () => {
    _flushScheduled = null;
    _flushRunning = true;
    try { await flushOfflineQueue(); }
    catch (e) { console.warn('[flush] offline queue:', e); }
    try { await EventBus.flushQueue(); }
    catch (e) { console.warn('[flush] event bus:', e); }
    _flushRunning = false;
  }, 600);
}
window.scheduleFlush = scheduleFlush;


/* ═══════════════════════════════════════════════════════════════
   MARKET HELPERS
   ═══════════════════════════════════════════════════════════════ */
const getProduct = id => (state.data.products || []).find(p => p.id === id);
const getOrder   = id => (state.data.orders   || []).find(o => o.id === id);
const getLead    = id => (state.data.leads    || []).find(l => l.id === id);
const getProject = id => (state.data.projects || []).find(p => p.id === id);
const getProductsList = () => state.data.products || [];
const getOrdersList = () => state.data.orders || [];

async function checkOrderStock(order) {
  if (!order || !Array.isArray(order.items)) return { ok: true, summary: '' };

  const shortages = (await Promise.all(order.items.map(async it => {
    if (!it || !it.productId || it.productId.startsWith('public-ui-')) return null;
    const qty = Number(it.qty || 1);
    if (qty <= 0) return null;

    let row = (state.data.inventory || []).find(x => x._productId === it.productId)
           || (state.data.inventory || []).find(x => x.id === 'prod-' + it.productId);
    if (!row) {
      const sku = String(it.productId).toUpperCase();
      row = (state.data.inventory || []).find(x => String(x.sku || '').toUpperCase() === sku);
    }
    if (!row) {
      try {
        const snap = await get(ref(db, `${P('inventory')}/prod-${it.productId}`));
        if (snap.exists()) {
          row = { ...snap.val(), id: 'prod-' + it.productId };
          state.data.inventory = state.data.inventory || [];
          if (!state.data.inventory.find(x => x.id === row.id)) {
            state.data.inventory.push(row);
          }
        }
      } catch (e) {}
    }
    if (!row) return null;

    const have = Number(row.qty || 0);
    if (have < qty) return `${it.productName || it.productId}: need ${qty}, have ${have}`;
    return null;
  }))).filter(Boolean);

  if (!shortages.length) return { ok: true, summary: '' };
  return {
    ok: false,
    summary: `Insufficient stock:\n${shortages.map(s => '• ' + s).join('\n')}`
  };
}

/* ═══════════════════════════════════════════════════════════════
   RBAC
   ═══════════════════════════════════════════════════════════════ */
function roleAllows(tabRoles) {
  if (!tabRoles || tabRoles === 'all') return true;
  if (!state.operator) return true;
  const role = state.operator.role;
  if (!role) return true;
  // Placeholder role during profile fetch — do not gate
  if (role === 'member' && !state._operatorLoaded) return true;
  if (role === 'exec' || role === 'admin') return true;
  const list = tabRoles.split(',').map(s => s.trim());
  return list.includes(role);
}

/* ═══════════════════════════════════════════════════════════════
   SIDEBAR COUNTERS
   ═══════════════════════════════════════════════════════════════ */
function computeCounterValue(key) {
  if (!key || key === 'none') return null;
  const d = state.data;
  switch (key) {
    case 'dashboard': return (d.projects || []).filter(p => p.status === 'active').length;
        // ── Pending-only overrides for the 8 Client Requests sources ──
    // (sidebar badges must agree with the queues panel)
    case 'portalRequests': return (d.portalRequests || []).filter(r => r && r.status === 'pending').length;
    case 'portalUsers':    return (d.portalUsers || []).filter(u => u && (u.status === 'pending' || u.approved === false)).length;
    case 'subscriptions': {
      const raw = d.subscriptions || {};
      const arr = Array.isArray(raw) ? raw : Object.values(raw);
      return arr.filter(s => s && (s.status === 'pending' || s.status === 'awaiting_approval')).length;
    }
    case 'subscriptionRequestsPending': {
      const raw = d.subscriptionRequests || {};
      const arr = Array.isArray(raw) ? raw : Object.values(raw);
      return arr.filter(r => r && r.status === 'pending').length;
    }
    case 'trainingQuizzesPending':
      return Object.values(d.trainingQuizSubmissions || {})
        .flatMap(byCourse => Object.values(byCourse || {}))
        .filter(q => q && (q.status || 'submitted') === 'submitted').length;
    case 'trainingCertsPending':
      return Object.values(d.trainingCertificates || {})
        .filter(c => c && (c.status === 'requested' || c.status === 'pending_approval')).length;
    case 'ticketsOpen': {
      const a = d.supportTickets || [];
      const b = d.tickets || [];
      const seen = new Set();
      const all = [...a, ...b].filter(t => { if (!t) return false; const k = t.id || t._id; if (k && seen.has(k)) return false; if (k) seen.add(k); return t.status !== 'closed' && t.status !== 'resolved'; });
      return all.length;
    }
    case 'orders': {
      const arr = d.orders || [];
      return arr.filter(o => o && (o.status === 'submitted' || o.status === 'awaiting_acceptance' || o.status === 'refund_requested')).length;
    }
   case 'portalRequests': return (d.portalRequests || []).filter(r => r.status === 'pending').length;
case 'portalUsers': return (d.portalUsers || []).length;
        case 'clients': {
      const clientsList = typeof getClients === 'function' ? getClients() : (d.entities || []).filter(e => e && e.type === 'client');
      return clientsList.length;
    }
    case 'subscriptions': {
      const now = Date.now();
      const subsRaw = d.subscriptions || {};
      const subs = Array.isArray(subsRaw) ? subsRaw : Object.values(subsRaw);
      const expiringSoon = subs.filter(s => {
        if (!s || s.plan === 'lifetime') return false;
        const endMs = Date.parse(s.endDate || '');
        if (!Number.isFinite(endMs)) return false;
        const days = (endMs - now) / 86400000;
        return days >= 0 && days <= 7;
      }).length;
      return expiringSoon > 0 ? { value: expiringSoon, danger: true } : subs.length;
    }
         case 'subscriptionRequestsPending': {
      const reqsRaw = d.subscriptionRequests || {};
      const reqsArr = Array.isArray(reqsRaw) ? reqsRaw : Object.values(reqsRaw);
      return reqsArr.filter(r => r && r.status === 'pending').length;
    }
    case 'subscriptionPlans': {
      const plansRaw = d.subscriptionPlans || {};
      const plansArr = Array.isArray(plansRaw) ? plansRaw : Object.values(plansRaw);
      return plansArr.filter(p => p && p.active !== false).length;
    }
    case 'employees': return getEmployees().length;
    case 'leads': {
      const clientEmails = new Set((d.entities || []).filter(e => e.type === 'client').map(c => normalizeEmail(c.email)).filter(Boolean));
      const clientLeadIds = new Set((d.entities || []).filter(e => e.type === 'client' && e.sourceLeadId).map(c => c.sourceLeadId));
      return (d.leads || []).filter(l => {
        if (l.status === 'Converted') return false;
        if (clientLeadIds.has(l.id)) return false;
        const em = normalizeEmail(l.email);
        if (em && clientEmails.has(em)) return false;
        return true;
      }).length;
    }
    case 'campaigns': return (d.campaigns || []).length;
    case 'deals': return (d.deals || []).length;
    case 'dealsOpen': return (d.deals || []).filter(x => x.stage !== 'Won' && x.stage !== 'Lost').length;
    case 'contracts': return (d.contracts || []).length;
    case 'proposals': return (d.proposals || []).length;
    case 'appointments': return (d.appointments || []).filter(a => a.status === 'scheduled' && a.date >= todayStr()).length;
    case 'presentations': return (d.presentations || []).length;
    case 'projects': return (d.projects || []).length;
    case 'worklogs': return (d.worklogs || []).length;
    case 'tasks': return (d.tasks || []).length;
    case 'tasksOpen': {
      const open = (d.tasks || []).filter(t => t.status === 'pending');
      return { value: open.length, danger: open.some(t => isOverdue(t.dueDate)) };
    }
    case 'inventory': return (d.inventory || []).length;
    case 'invoices': return (d.invoices || []).length;
    case 'invoicesOpen': {
      const open = (d.invoices || []).filter(i => getInvoiceStatusDerived(i) !== 'paid' && getInvoiceStatusDerived(i) !== 'draft');
      return { value: open.length, danger: open.some(i => i.dueDate && new Date(i.dueDate) < new Date()) };
    }
    case 'payments': return (d.payments || []).length;
    case 'mpesaUnmatched': return (d.mpesaTransactions || []).filter(t => !t.matchedInvoiceId).length;
    case 'expenses': return (d.expenses || []).length;
    case 'payroll': return (d.payroll || []).length;
    case 'todos': return (d.todos || []).length;
    case 'todosOpen': {
      const open = (d.todos || []).filter(t => !t.done);
      return { value: open.length, danger: open.some(t => t.date && t.date < todayStr()) };
    }
    case 'goals': return (d.goals || []).length;
    case 'skills': return (d.skills || []).length;
    case 'products': return (d.products || []).length;
    case 'orders': return (d.orders || []).length;
    case 'myOrders': return (d.orders || []).filter(o => normalizeEmail(o.customerEmail) === normalizeEmail(state.operator?.email)).length;
    case 'myWishlist': return (d.marketplaceWishlist || []).length;
    case 'assets': return (d.assets || []).length;
    case 'compliance': return (d.compliance || []).length;
    case 'users': return (d.users || []).length;
    case 'activityLog': return (d.activityLog || []).length;
    case 'documents': return (d.documents || []).length;
    case 'commLog': return (d.commLog || []).length;
    case 'trash': return (d.trash || []).length;
    case 'ticketsOpen': {
      const open = (d.tickets || []).filter(t => t.status !== 'closed');
      return { value: open.length, danger: open.some(t => t.priority === 'urgent') };
    }
    case 'trainingRequestsPending': {
      const reqs = state.data.trainingAccessRequests || {};
      return Object.values(reqs).filter(r => (r.status || 'pending') === 'pending').length;
    }
    case 'trainingUsers': {
      const seen = new Set();
      let total = 0;
      (state.data.users || []).forEach(u => { if (u.uid && !seen.has(u.uid)) { seen.add(u.uid); total++; } });
      (state.data.portalUsers || []).forEach(u => { if (u.uid && !seen.has(u.uid)) { seen.add(u.uid); total++; } });
      return total;
    }
    case 'trainingQuizzesPending':
      return Object.values(d.trainingQuizSubmissions || {})
        .flatMap(byCourse => Object.values(byCourse || {}))
        .filter(q => (q.status || 'submitted') === 'submitted').length;
    case 'trainingCertsPending': {
      const awarded = new Set(Object.values(d.trainingCertificates || {}).map(c => `${c.uid}__${c.courseId}`));
      return Object.values(d.trainingQuizSubmissions || {}).flatMap(byCourse => Object.values(byCourse || {})).filter(q => q.status === 'graded' && !awarded.has(`${q.uid}__${q.courseId}`)).length;
    }
    case 'ledger': return (d.ledger || []).length;
    default: return null;
  }
}
window.computeCounterValue = computeCounterValue;

/* ═══════════════════════════════════════════════════════════════
   COALESCED RENDER SCHEDULER
   ═══════════════════════════════════════════════════════════════ */
let _scheduledRAF = null;

/* ★ v9.5 — Central modal-open detector.
   Covers every kind of overlay the app uses:
     • .modal-overlay.active       (main.html modals)
     • #hc-industry-panel visible  (home-content editor)
     • #hc-modal-host > div        (home-content bucket/family/confirm modals)
     • #hc-industry-backdrop       (editor backdrop)
     • [role="dialog"][aria-modal="true"]  (vioraConfirm / vioraPrompt)
   Returns true if ANY overlay is on screen. */
function _isAnyOverlayOpen() {
  try {
    if (document.querySelector('.modal-overlay.active')) return true;
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return true;
    const panel = document.getElementById('hc-industry-panel');
    if (panel && panel.style.display === 'flex') return true;
    const backdrop = document.getElementById('hc-industry-backdrop');
    if (backdrop && backdrop.style.display === 'block') return true;
    const host = document.getElementById('hc-modal-host');
    if (host && host.children.length > 0) return true;
  } catch (_) {}
  return false;
}

function scheduleRender(force = false) {
  /* ★ v9.4 — Only bail during the initial boot drain. After the
     watchdog releases the drain (6s max), force === true must
     always work. */
  if (state._bootDraining && !force) return;

  /* ★ v9.5 — NEVER re-render while any modal/editor is open.
     A re-render destroys the modal DOM (innerHTML = ''), which
     closes the editor and loses the user's work. We defer instead
     and retry after the modal closes.
     `force === true` from a boot-drain release still bypasses this
     guard so counters recover if a modal somehow got stuck open. */
  if (!force && _isAnyOverlayOpen()) {
    if (!window.__vioraDeferredRender) {
      window.__vioraDeferredRender = setTimeout(() => {
        window.__vioraDeferredRender = null;
        if (!_isAnyOverlayOpen()) {
          scheduleRender(true);
        } else {
          /* Still open — try again in 2 s. */
          scheduleRender(true);
        }
      }, 2000);
    }
    return;
  }

  if (force) state._forceRepaint = true;
  if (_scheduledRAF) return;
  _scheduledRAF = requestAnimationFrame(() => {
    _scheduledRAF = null;
    try { renderActiveTab(); }
    catch (e) { console.warn('[scheduleRender]', e); }
  });
}
window.scheduleRender = scheduleRender;
window._isAnyOverlayOpen = _isAnyOverlayOpen;

/* ═══════════════════════════════════════════════════════════════
   PER-COLLECTION COUNTER INVALIDATION
   ═══════════════════════════════════════════════════════════════ */
const COLLECTION_COUNTER_MAP = {
  entities:    ['clients', 'employees'],
  leads:       ['leads'],
  campaigns:   ['campaigns'],
  deals:       ['deals', 'dealsOpen'],
  contracts:   ['contracts'],
  proposals:   ['proposals'],
  projects:    ['projects', 'dashboard'],
  tasks:       ['tasks', 'tasksOpen'],
  inventory:   ['inventory'],
  invoices:    ['invoices', 'invoicesOpen'],
  payments:    ['payments'],
  expenses:    ['expenses'],
  payroll:     ['payroll'],
  assets:      ['assets'],
  compliance:  ['compliance'],
  documents:   ['documents'],
  tickets:     ['ticketsOpen'],
  supportTickets: ['ticketsOpen'],
  portalRequests: ['portalRequests'],
  portalUsers: ['portalUsers'],
  products:    ['products'],
  orders:      ['orders', 'myOrders'],
  activityLog: ['activityLog'],
  commLog:     ['commLog'],
  trash:       ['trash'],
  appointments:['appointments'],
    subscriptionRequests: ['subscriptionRequestsPending'],
      
    subscriptionPlans:    ['subscriptionPlans'],
    subscriptions:        ['subscriptions'],
  presentations:['presentations'],
  mpesaTransactions: ['mpesaUnmatched'],
  marketLeads: ['marketNew'],
};

function invalidateCountersFor(collection) {
  const keys = COLLECTION_COUNTER_MAP[collection];
  if (!keys) { state._counterCache = null; state._queueCache = null; return; }
  if (!state._counterCache) { state._queueCache = null; return; }
  const v = state._counterCache.v;
  if (v) for (const k of keys) delete v[k];
  state._counterCache.t = 0;
  state._queueCache = null;
  state._queueCacheTime = 0;
}

/* ═══════════════════════════════════════════════════════════════
   SIDEBAR COUNTER REFRESH
   ═══════════════════════════════════════════════════════════════ */
function updateSidebarCounters(force = false) {
  /* ★ v9.4 — Always re-scan the DOM. No more retry loop, no more
     permanent bail-out, no more phantom "empty" state. */
  const now = Date.now();

  /* Rebuild the element map from scratch every call. */
  state._counterEls = {};

  document.querySelectorAll('.sidebar nav a[data-counter]').forEach(a => {
    const k = a.dataset.counter;
    if (!k || k === 'none') return;
    let badge = a.querySelector('.nav-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nav-badge';
      const staticBadge = a.querySelector('.badge');
      if (staticBadge) a.insertBefore(badge, staticBadge);
      else a.appendChild(badge);
    }
    state._counterEls[k] = { link: a, badge };
  });

  const found = Object.keys(state._counterEls).length;
  if (found === 0) {
    console.warn('[viora] no sidebar counter elements found in the DOM — aborting');
    return;
  }

  state._counterClean = true;

  /* Recompute every value from scratch (no caching). Caching was the
     source of every stale-counter bug we've chased. */
  for (const k of Object.keys(state._counterEls)) {
    const entry = state._counterEls[k];
    if (!entry.link || entry.link.classList.contains('rbac-hidden')) continue;

    let raw;
    try { raw = computeCounterValue(k); }
    catch (e) { console.warn('[counter] computeCounterValue failed for', k, e); raw = null; }

    let value = 0, danger = false;
    if (raw == null)          { value = 0; }
    else if (typeof raw === 'object') { value = raw.value || 0; danger = !!raw.danger; }
    else                      { value = Number(raw) || 0; }

    const badge = entry.badge;
    if (!badge) continue;

    /* ★ Always show the value — including 0. The user explicitly
       asked for the clients counter to be visible even when 0. */
    badge.textContent = value > 999 ? '999+' : String(value);
    if (badge.style.display !== 'inline-block') badge.style.display = 'inline-block';

    if (danger) {
      badge.classList.remove('muted');
      badge.style.background = 'var(--accent-red)';
      badge.style.color = '#fff';
    } else if (value === 0) {
      badge.classList.add('muted');
      badge.style.background = '';
      badge.style.color = '';
    } else {
      badge.classList.add('muted');
      badge.style.background = '';
      badge.style.color = '';
    }
  }

  /* Cache is kept only for the cross-device broadcast, not for
     deciding whether to repaint. */
  state._counterCache = { t: now, v: {} };
  for (const k of Object.keys(state._counterEls)) {
    try { state._counterCache.v[k] = computeCounterValue(k); } catch (_) {}
  }

  try { maybeBroadcastCounterChanges(); }
  catch (e) { console.warn('[counter-broadcast] failed', e); }
}
window.updateSidebarCounters = updateSidebarCounters;
window.invalidateCountersFor = invalidateCountersFor;

/* ═══════════════════════════════════════════════════════════════
   CROSS-DEVICE COUNTER BROADCAST
   ═══════════════════════════════════════════════════════════════ */
window.__vioraCounterSnapshot = window.__vioraCounterSnapshot || null;
window.__vioraCounterBroadcastQueue = window.__vioraCounterBroadcastQueue || [];
window.__vioraCounterBroadcastTimer = window.__vioraCounterBroadcastTimer || null;
window.__vioraCounterLastFire = window.__vioraCounterLastFire || 0;

function snapshotAllCounters() {
  const snap = {};
  const cached = state._counterCache?.v || {};
  const els = state._counterEls || {};
  for (const key of Object.keys(els)) {
    const entry = els[key];
    if (!entry || !entry.link) continue;
    if (entry.link.classList.contains('rbac-hidden')) continue;

    let raw = cached[key];
    if (raw === undefined) {
      raw = computeCounterValue(key);
      if (!state._counterCache) state._counterCache = { t: Date.now(), v: {} };
      if (raw != null) state._counterCache.v[key] = raw;
    }
    if (raw == null) continue;

    if (typeof raw === 'object') {
      snap[key] = { value: raw.value || 0, danger: !!raw.danger };
    } else {
      snap[key] = { value: raw, danger: false };
    }
  }
  return snap;
}

function labelForCounter(key) {
  const navEl = document.querySelector(`.sidebar nav a[data-counter="${key}"]`);
  if (!navEl) return { title: 'VIORA update', label: key };
  const text = navEl.textContent.trim().replace(/\s+/g, ' ').replace(/\d+$/, '').trim();
  return { title: text || key, label: text || key };
}

function iconForCounter(key) {
  const navEl = document.querySelector(`.sidebar nav a[data-counter="${key}"]`);
  const icon = navEl?.querySelector('i')?.className || '';
  if (icon.includes('invoices') || icon.includes('file-invoice')) return 'fa-file-invoice';
  if (icon.includes('mpesa') || icon.includes('mobile-screen')) return 'fa-mobile-screen-button';
  if (icon.includes('ticket') || icon.includes('headset')) return 'fa-headset';
  if (icon.includes('lead') || icon.includes('user-plus')) return 'fa-user-plus';
  if (icon.includes('task') || icon.includes('calendar')) return 'fa-calendar-check';
  if (icon.includes('box') || icon.includes('stacked')) return 'fa-boxes-stacked';
  if (icon.includes('portal') || icon.includes('user-clock')) return 'fa-user-clock';
  if (icon.includes('order') || icon.includes('receipt')) return 'fa-receipt';
  if (icon.includes('deal') || icon.includes('handshake')) return 'fa-handshake';
  if (icon.includes('contract') || icon.includes('signature')) return 'fa-file-signature';
  if (icon.includes('project') || icon.includes('folder')) return 'fa-folder';
  if (icon.includes('compliance') || icon.includes('scale')) return 'fa-scale-balanced';
  if (icon.includes('user')) return 'fa-user';
  return 'fa-bell';
}

function queueCounterBroadcast(payload) {
  window.__vioraCounterBroadcastQueue.push(payload);
  if (window.__vioraCounterBroadcastTimer) return;
  window.__vioraCounterBroadcastTimer = setTimeout(flushCounterBroadcasts, 1200);
}

async function flushCounterBroadcasts() {
  window.__vioraCounterBroadcastTimer = null;
  const queue = window.__vioraCounterBroadcastQueue.splice(0);
  if (!queue.length) return;
  if (typeof window.vioraNotify !== 'function') return;

  if (queue.length > 1) {
    const lines = queue.map(q => `• ${q.label}: ${q.value > 0 ? q.value : 'updated'}`).join('\n');
    const total = queue.reduce((s, q) => s + Math.max(1, q.delta || 1), 0);
    try {
      await window.vioraNotify({
        title: `${total} update${total === 1 ? '' : 's'} in VIORA`,
        body: lines,
        level: queue.some(q => q.danger) ? 'warning' : 'info',
        url: '/main.html',
        source: 'sidebar-counters',
        icon: 'fa-bell'
      });
    } catch (e) { console.warn('[counter-broadcast] summary failed', e); }
    return;
  }

  const q = queue[0];
  try {
    await window.vioraNotify({
      title: q.title, body: q.body,
      level: q.danger ? 'warning' : 'info',
      url: '/main.html',
      source: 'sidebar-counter:' + q.key,
      icon: q.icon
    });
  } catch (e) { console.warn('[counter-broadcast] failed', e); }
}

function maybeBroadcastCounterChanges() {
  const next = snapshotAllCounters();

  if (!window.__vioraCounterSnapshot) {
    window.__vioraCounterSnapshot = next;
    return;
  }
  const prev = window.__vioraCounterSnapshot;

  for (const key of Object.keys(next)) {
    const p = prev[key] || { value: 0, danger: false };
    const n = next[key];
    const delta = n.value - p.value;
    const dangerFlip = !p.danger && n.danger;

    if (delta <= 0 && !dangerFlip) continue;
    if (Date.now() - (window.__vioraSessionStart || 0) < 4000) continue;

    const { title } = labelForCounter(key);
    const icon = iconForCounter(key);

    let body;
    if (dangerFlip && delta <= 0) body = `${title} now needs attention`;
    else if (dangerFlip) body = `${delta} new item${delta === 1 ? '' : 's'} — ${title} needs attention`;
    else body = `${delta} new item${delta === 1 ? '' : 's'} — ${title}`;

    queueCounterBroadcast({
      key, title, body, icon,
      value: n.value, delta,
      danger: !!n.danger, label: title
    });
  }

  window.__vioraCounterSnapshot = next;
}

window.__vioraSessionStart = Date.now();
window.snapshotAllCounters = snapshotAllCounters;
window.maybeBroadcastCounterChanges = maybeBroadcastCounterChanges;

/* ═══════════════════════════════════════════════════════════════
   ROLE GATING
   ═══════════════════════════════════════════════════════════════ */
function applyRoleGating() {
  document.querySelectorAll('.sidebar nav a[data-roles]').forEach(a => {
    a.classList.toggle('rbac-hidden', !roleAllows(a.dataset.roles || 'all'));
  });
  if (typeof invalidateSidebarIndex === 'function') invalidateSidebarIndex();
  const rb = $('roleBadge');
  if (rb) rb.textContent = (state.operator?.role || 'exec').toUpperCase();
  const rbm = $('roleBadgeMobile');
  if (rbm) rbm.textContent = (state.operator?.role || 'exec').toUpperCase();

  /* ★ v9.3 — Do NOT null out _counterEls here. That forces the
     counter refresh to re-scan the DOM, and if applyRoleGating is
     called while the nav is mid-repaint (e.g. right after auth),
     the scan finds zero links and the retry loop exhausts itself.
     Clearing only the value cache is enough to force recompute. */
  state._counterCache = null;
  // state._counterEls = null;  ← REMOVE THIS LINE

  updateMobileSubChips();
  updateSidebarCounters(true);
  updateGroupVisibility();
}

/* ═══════════════════════════════════════════════════════════════
   SIDEBAR GROUPS
   ═══════════════════════════════════════════════════════════════ */
const SIDEBAR_GROUPS_STORAGE_KEY = 'viora_open_groups_v5';
const SIDEBAR_DEFAULT_OPEN = 'client';

function initSidebarGroups() {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return;
  let savedMode = 'queues';
  try {
    const m = localStorage.getItem('viora_nav_mode');
    if (['queues', 'registers', 'timeline'].includes(m)) savedMode = m;
  } catch (e) {}
  state._activeQueueId = state._activeQueueId || null;
  document.querySelectorAll('#navModeSwitcher .nav-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setNavMode(btn.dataset.mode));
  });
  setNavMode(savedMode, { silent: true });
  // All groups start collapsed on load. Per-tab opening still works.
  let openGroups = [];
  try {
    const saved = localStorage.getItem(SIDEBAR_GROUPS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) openGroups = parsed;
    }
  } catch (e) {}
  document.querySelectorAll('.sb-group-wrap').forEach(wrap => {
    const key = wrap.dataset.group;
    const toggle = wrap.querySelector('.sb-group-toggle');
    const isOpen = openGroups.includes(key);
    wrap.classList.toggle('open', isOpen);
    if (toggle) toggle.setAttribute('aria-expanded', String(isOpen));
  });
  // ── Group toggle: exclusive accordion (opening one closes the rest) ──
  document.querySelectorAll('.sb-group-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrap = btn.closest('.sb-group-wrap');
      const willOpen = !wrap.classList.contains('open');

      // Close every other group first
      document.querySelectorAll('.sb-group-wrap').forEach(other => {
        if (other !== wrap) {
          other.classList.remove('open');
          const otherBtn = other.querySelector('.sb-group-toggle');
          if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
        }
      });

      // Toggle the clicked one
      wrap.classList.toggle('open', willOpen);
      btn.setAttribute('aria-expanded', String(willOpen));
      persistOpenGroups();
    });
  });

  // ── Expand all / collapse all button ──
  const expandAllBtn = document.getElementById('navExpandAll');
  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', () => {
      const allOpen = document.querySelectorAll('.sb-group-wrap.open').length;
      const totalGroups = document.querySelectorAll('.sb-group-wrap:not(.rbac-hidden)').length;
      const shouldExpand = allOpen < totalGroups;

      document.querySelectorAll('.sb-group-wrap:not(.rbac-hidden)').forEach(wrap => {
        wrap.classList.toggle('open', shouldExpand);
        const btn = wrap.querySelector('.sb-group-toggle');
        if (btn) btn.setAttribute('aria-expanded', String(shouldExpand));
      });

      expandAllBtn.classList.toggle('active', shouldExpand);
      expandAllBtn.title = shouldExpand ? 'Collapse all groups' : 'Expand all groups';
      persistOpenGroups();
    });
  }
}
window.initSidebarGroups = initSidebarGroups;

function persistOpenGroups() {
  try {
    const open = Array.from(document.querySelectorAll('.sb-group-wrap.open')).map(w => w.dataset.group);
    localStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY, JSON.stringify(open));
  } catch (e) {}
}

function openGroupForTab(tab) {
  const link = document.querySelector(`.sb-group-items a[data-tab="${tab}"]`);
  if (!link) return;
  const wrap = link.closest('.sb-group-wrap');
  if (!wrap || wrap.classList.contains('open')) return;
  wrap.classList.add('open');
  const btn = wrap.querySelector('.sb-group-toggle');
  if (btn) btn.setAttribute('aria-expanded', 'true');
  persistOpenGroups();

  /* Prevent group-open from scrolling the nav off-screen */
  if (typeof window.__vioraResetSidebarScroll === 'function') {
    requestAnimationFrame(window.__vioraResetSidebarScroll);
    setTimeout(window.__vioraResetSidebarScroll, 0);
  } else {
    const navEl = document.querySelector('.sidebar nav');
    if (navEl) navEl.scrollTo({ top: 0, behavior: 'instant' });
  }
}
window.openGroupForTab = openGroupForTab;

function updateGroupVisibility() {
  document.querySelectorAll('.sb-group-wrap').forEach(wrap => {
    const items = wrap.querySelectorAll('.sb-group-items a');
    const anyVisible = Array.from(items).some(a => !a.classList.contains('rbac-hidden'));
    wrap.classList.toggle('rbac-hidden', !anyVisible);
  });
}

/* ═══════════════════════════════════════════════════════════════
   NAVIGATION MODES
   ═══════════════════════════════════════════════════════════════ */
const NAV_MODES = ['queues', 'registers', 'timeline'];
const NAV_MODE_STORAGE_KEY = 'viora_nav_mode';

const NAV_QUEUES = [
  /* ── Client Requests (external party → we act) ── */
  { id: 'q-portal-requests-pending', label: 'Portal Requests',      icon: 'fa-user-clock',           group: 'clientRequests', tab: 'portal-requests',         roles: ['exec','admin'], filter: () => (state.data.portalRequests || []).filter(r => r && r.status === 'pending'), severity: 'warn' },
  { id: 'q-portal-users-pending',    label: 'Portal Users',         icon: 'fa-user-check',           group: 'clientRequests', tab: 'portal-users',            roles: ['exec','admin'], filter: () => (state.data.portalUsers || []).filter(u => u && (u.status === 'pending' || u.approved === false)), severity: 'warn' },
  { id: 'q-subscriptions-pending',   label: 'Subscriptions',        icon: 'fa-crown',                group: 'clientRequests', tab: 'subscriptions',           roles: ['exec','admin'], filter: () => { const raw = state.data.subscriptions || {}; const arr = Array.isArray(raw) ? raw : Object.values(raw); return arr.filter(s => s && (s.status === 'pending' || s.status === 'awaiting_approval')); }, severity: 'warn' },
  { id: 'q-plan-changes-pending',    label: 'Plan Changes',         icon: 'fa-arrows-rotate',        group: 'clientRequests', tab: 'subscription-plans',      roles: ['exec','admin'], filter: () => { const raw = state.data.subscriptionRequests || {}; const arr = Array.isArray(raw) ? raw : Object.values(raw); return arr.filter(r => r && r.status === 'pending'); }, severity: 'warn' },
  { id: 'q-quiz-pending',            label: 'Quiz Submissions',     icon: 'fa-file-circle-question', group: 'clientRequests', tab: 'training-quizzes',        roles: ['exec','admin'], filter: () => Object.values(state.data.trainingQuizSubmissions || {}).flatMap(byCourse => Object.values(byCourse || {})).filter(q => q && (q.status || 'submitted') === 'submitted'), severity: 'warn' },
  { id: 'q-certificates-pending',    label: 'Certificate Requests', icon: 'fa-award',                group: 'clientRequests', tab: 'training-certificates',   roles: ['exec','admin'], filter: () => Object.values(state.data.trainingCertificates || {}).filter(c => c && (c.status === 'requested' || c.status === 'pending_approval')), severity: 'warn' },
  { id: 'q-support-tickets-pending', label: 'Support Tickets',      icon: 'fa-headset',              group: 'clientRequests', tab: 'support-tickets',         roles: ['exec','admin'], filter: () => { const a = state.data.supportTickets || []; const b = state.data.tickets || []; const seen = new Set(); return [...a, ...b].filter(t => { if (!t) return false; const k = t.id || t._id; if (k && seen.has(k)) return false; if (k) seen.add(k); return t.status !== 'closed' && t.status !== 'resolved'; }); }, severity: 'warn' },
  { id: 'q-orders-awaiting',         label: 'Awaiting Orders',      icon: 'fa-receipt',              group: 'clientRequests', tab: 'marketplace-orders',      roles: ['exec','admin'], filter: () => (state.data.orders || []).filter(o => o && (o.status === 'submitted' || o.status === 'awaiting_acceptance' || o.status === 'refund_requested')), severity: 'warn' },

  /* ── Revenue ── */
  { id: 'q-invoices-unpaid',         label: 'Unpaid Invoices',      icon: 'fa-file-invoice',         group: 'revenue',        tab: 'fin-invoices',            roles: ['exec','admin'], filter: () => (state.data.invoices || []).filter(i => getInvoiceStatusDerived(i) !== 'paid'), severity: 'auto' },
  { id: 'q-mpesa-unmatched',         label: 'M-Pesa Unmatched',     icon: 'fa-mobile-screen-button', group: 'revenue',        tab: 'fin-mpesa',               roles: ['exec','admin'], filter: () => (state.data.mpesaTransactions || []).filter(t => !t.matchedInvoiceId), severity: 'auto' },
  { id: 'q-installments-overdue',    label: 'Overdue Installments', icon: 'fa-coins',                group: 'revenue',        tab: 'sales-clients',           roles: ['exec','admin'], filter: () => getOverdueInstallments(), severity: 'danger' },

  /* ── Delivery ── */
  { id: 'q-tasks-overdue',           label: 'Overdue Tasks',        icon: 'fa-calendar-xmark',       group: 'delivery',       tab: 'ops-tasks',               roles: ['exec','admin'], filter: () => (state.data.tasks || []).filter(t => t.status === 'pending' && isOverdue(t.dueDate)), severity: 'danger' },
  { id: 'q-projects-stalled',        label: 'Stalled Projects',     icon: 'fa-folder-exclamation',   group: 'delivery',       tab: 'ops-projects',            roles: ['exec','admin'], filter: () => (state.data.projects || []).filter(p => p.status === 'active' && p.deadline && p.deadline < todayStr() && (p.progress || 0) < 90), severity: 'danger' },
  { id: 'q-worklogs-unbilled',       label: 'Unbilled Work Logs',   icon: 'fa-clock',                group: 'delivery',       tab: 'ops-worklogs',            roles: ['exec','admin'], filter: () => (state.data.worklogs || []).filter(w => { if (!w.isBilled) return false; const used = new Set(); (state.data.invoices || []).forEach(inv => (inv.items || []).forEach(it => { if (it.worklogId) used.add(it.worklogId); })); return !used.has(w.id); }), severity: 'warn' },

  /* ── Pipeline ── */
  { id: 'q-leads-qualified',         label: 'Qualified Leads',      icon: 'fa-user-check',           group: 'pipeline',       tab: 'marketing-leads',         roles: ['exec','admin'], filter: () => (state.data.leads || []).filter(l => l.status === 'Qualified' && !l._fromMarket), severity: 'warn' },
  { id: 'q-deals-stale',             label: 'Deals Stale >14d',     icon: 'fa-handshake-slash',      group: 'pipeline',       tab: 'sales-deals',             roles: ['exec','admin'], filter: () => (state.data.deals || []).filter(d => { if (d.stage === 'Won' || d.stage === 'Lost') return false; const last = d._updatedAt || d.createdAt; if (!last) return false; return (Date.now() - new Date(last).getTime()) > 14 * 86400000; }), severity: 'auto' },
  { id: 'q-contracts-expiring',      label: 'Contracts Expiring ≤30d', icon: 'fa-file-signature',    group: 'pipeline',       tab: 'sales-contracts',         roles: ['exec','admin'], filter: () => (state.data.contracts || []).filter(c => { if (!c.expiryDate || c.status === 'Terminated') return false; const d = daysBetween(c.expiryDate); return d >= 0 && d <= 30; }), severity: 'warn' },
  { id: 'q-proposals-draft',         label: 'Unsent Proposals',     icon: 'fa-wand-magic-sparkles',  group: 'pipeline',       tab: 'sales-proposals',         roles: ['exec','admin'], filter: () => (state.data.proposals || []).filter(p => !p.sentAt), severity: null },

  /* ── Compliance ── */
  { id: 'q-compliance-expiring',     label: 'Compliance Expiring ≤60d', icon: 'fa-scale-balanced',  group: 'compliance',     tab: 'admin-compliance',        roles: ['exec','admin'], filter: () => (state.data.compliance || []).filter(c => { if (!c.expiryDate) return false; const d = daysBetween(c.expiryDate); return d >= 0 && d <= 60; }), severity: 'warn' },
  { id: 'q-inventory-low',           label: 'Low Stock',            icon: 'fa-boxes-stacked',        group: 'compliance',     tab: 'ops-inventory',           roles: ['exec','admin'], filter: () => (state.data.inventory || []).filter(i => i.qty <= i.reorder), severity: 'warn' },

  /* ── Growth ── */
  { id: 'q-market-new',              label: 'New Market Signups',   icon: 'fa-store',                group: 'growth',         tab: 'marketplace-analytics',   roles: ['exec','admin'], filter: () => (state.data.marketLeads || []).filter(m => m.isNewClient), severity: 'warn' },
  { id: 'q-orders-pending',          label: 'Pending Payments',     icon: 'fa-shopping-cart',        group: 'growth',         tab: 'marketplace-orders',      roles: ['exec','admin'], filter: () => (state.data.orders || []).filter(o => o.paymentStatus === 'pending'), severity: 'warn' },
];

const NAV_QUEUE_GROUPS = {
  clientRequests: { label: 'Client Requests', icon: 'fa-inbox' },
  revenue:        { label: 'Revenue',        icon: 'fa-coins' },
  delivery:       { label: 'Delivery',       icon: 'fa-truck-fast' },
  pipeline:       { label: 'Pipeline',       icon: 'fa-diagram-project' },
  compliance:     { label: 'Compliance',     icon: 'fa-shield-halved' },
  growth:         { label: 'Growth',         icon: 'fa-arrow-trend-up' },
};

function evaluateQueue(q) {
  let records = [];
  try { records = q.filter() || []; }
  catch (e) { console.warn('Queue filter failed:', q.id, e); }
  const count = records.length;
  let severity = q.severity || null;
  if (severity === 'auto') severity = count > 0 ? 'warn' : null;
  if (count === 0) severity = null;
  return { count, severity, records };
}

function evaluateAllQueues() {
  const now = Date.now();
  const role = state.operator?.role || 'exec';
  // Invalidate cache if role changed
  if (state._queueCacheRole !== role) {
    state._queueCache = null;
    state._queueCacheRole = role;
  }
  if (state._queueCache && (now - state._queueCacheTime) < 5000) {
    return state._queueCache;
  }
  const out = {};
  let total = 0;
  NAV_QUEUES.forEach(q => {
    // Role filter: skip queues this role can't see
    if (Array.isArray(q.roles) && q.roles.length) {
      const allowed = q.roles.includes(role) || role === 'exec' || role === 'admin';
      if (!allowed) return;
    }
    const r = evaluateQueue(q);
    out[q.id] = r;
    total += r.count;
  });
  const result = { byId: out, total };
  state._queueCache = result;
  state._queueCacheTime = now;
  return result;
}

function renderNavQueues() {
  const host = $('navQueuesMode');
  if (!host) return;
  const { byId, total } = evaluateAllQueues();
  const badge = $('queueModeBadge');
  if (badge) {
    if (total > 0) { badge.textContent = total > 99 ? '99+' : String(total); badge.style.display = 'inline-block'; }
    else badge.style.display = 'none';
  }
  const buckets = {};
  NAV_QUEUES.forEach(q => { (buckets[q.group] = buckets[q.group] || []).push(q); });

  const html = Object.entries(NAV_QUEUE_GROUPS).map(([key, meta]) => {
    const items = buckets[key] || [];
    if (!items.length) return '';
    const groupTotal = items.reduce((s, q) => s + (byId[q.id]?.count || 0), 0);
    const itemsHtml = items.map(q => {
      const { count, severity } = byId[q.id] || { count: 0, severity: null };
      const isActive = state.currentTab === q.tab && state._activeQueueId === q.id;
      const cls = ['nav-queue-item', severity || '', count === 0 ? 'zero' : '', isActive ? 'active' : ''].filter(Boolean).join(' ');
      const countLabel = count > 99 ? '99+' : String(count);
      return `<a class="${cls}" data-queue-id="${q.id}" data-tab="${q.tab}"><i class="fa-solid ${q.icon}"></i><span class="nav-queue-item-label">${q.label}</span><span class="nav-queue-item-count">${countLabel}</span></a>`;
    }).join('');
    return `<div class="nav-queue-group"><div class="nav-queue-group-header"><i class="fa-solid ${meta.icon}"></i><span>${meta.label}</span><span class="nav-queue-group-count">${groupTotal}</span></div>${itemsHtml}</div>`;
  }).join('');
  host.innerHTML = html || `<div style="padding:24px 18px;text-align:center;color:var(--text-secondary);font-size:.8rem;">No queues defined.</div>`;

  if (!host._vioraQueueBound) {
    host._vioraQueueBound = true;
       host.addEventListener('click', (e) => {
      const el = e.target.closest('.nav-queue-item');
      if (!el) return;
      state._activeQueueId = el.dataset.queueId;

      // Highlight the destination sidebar link
      document.querySelectorAll('.sidebar nav a[data-tab]').forEach(a => a.classList.remove('from-queue'));
      const destTab = el.dataset.tab;
      const destLink = document.querySelector(`.sidebar nav a[data-tab="${destTab}"]`);
      if (destLink) {
        destLink.classList.add('from-queue');
        // Auto-clear after 6s so it doesn't linger
        setTimeout(() => destLink.classList.remove('from-queue'), 6000);
      }

      if (window.Viora && typeof Viora.navigate === 'function') {
        Viora.navigate(destTab, { fromQueue: true });
      }
    });
  }
}
window.renderNavQueues = renderNavQueues;

function setNavMode(mode, opts = {}) {
  opts = opts || {};
  if (!NAV_MODES.includes(mode)) mode = 'queues';
  state.navMode = mode;
  document.querySelectorAll('#navModeSwitcher .nav-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  document.querySelectorAll('.nav-mode-panel').forEach(p => {
    p.style.display = p.dataset.modePanel === mode ? 'block' : 'none';
  });
  document.querySelectorAll('#sidebarNav .sb-group-wrap').forEach(wrap => {
    wrap.style.display = (mode === 'registers') ? '' : 'none';
  });
  const hint = $('navRegistersHint');
  if (hint) {
    hint.style.display = (mode === 'registers') ? 'block' : 'none';
    if (mode === 'registers' && !hint._hintSet) {
      hint.innerHTML = 'Open a group to see its pages.';
      hint._hintSet = true;
    }
  }
  try { localStorage.setItem(NAV_MODE_STORAGE_KEY, mode); } catch (e) {}
  if (mode === 'queues') renderNavQueues();
  if (!opts.silent) { if (mode === 'registers') openGroupForTab(state.currentTab); }
}
window.setNavMode = setNavMode;

/* ═══════════════════════════════════════════════════════════════
   MOBILE NAV
   ═══════════════════════════════════════════════════════════════ */
const MOBILE_NAV_MAP = {
  exec: { icon: 'fa-crown', label: 'Exec', tabs: [
    { tab: 'dashboard', icon: 'fa-chart-pie', label: 'Dashboard' },
    { tab: 'profile', icon: 'fa-building', label: 'Profile' },
    { tab: 'global-market', icon: 'fa-earth-africa', label: 'Global' },
    { tab: 'activity', icon: 'fa-scroll', label: 'Activity' },
    { tab: 'admin-compliance', icon: 'fa-scale-balanced', label: 'Compliance' },
    { tab: 'marketplace-analytics', icon: 'fa-chart-line', label: 'Analytics' },
    { tab: 'orchestration', icon: 'fa-diagram-project', label: 'Orchestration' },
  ]},
  clientportal: { icon: 'fa-id-card-clip', label: 'Clients', tabs: [
    { tab: 'sales-clients', icon: 'fa-users', label: 'Clients' },
    { tab: 'client360', icon: 'fa-id-card-clip', label: 'Client 360' },
    { tab: 'marketing-leads', icon: 'fa-user-plus', label: 'Leads' },
    { tab: 'portal-requests', icon: 'fa-user-clock', label: 'Requests' },
    { tab: 'portal-users', icon: 'fa-user-check', label: 'Portal Users' },
    { tab: 'support-tickets', icon: 'fa-headset', label: 'Tickets' },
    { tab: 'communications', icon: 'fa-comments', label: 'Comms' },
  ]},
  sales: { icon: 'fa-handshake', label: 'Sales', tabs: [
    { tab: 'sales-deals', icon: 'fa-handshake', label: 'Deals' },
    { tab: 'sales-pipeline', icon: 'fa-diagram-project', label: 'Pipeline' },
    { tab: 'sales-proposals', icon: 'fa-wand-magic-sparkles', label: 'Proposals' },
    { tab: 'sales-contracts', icon: 'fa-file-signature', label: 'Contracts' },
    { tab: 'marketplace-orders', icon: 'fa-receipt', label: 'Orders' },
  ]},
  ops: { icon: 'fa-folder', label: 'Ops', tabs: [
    { tab: 'ops-projects', icon: 'fa-folder', label: 'Projects' },
    { tab: 'ops-tasks', icon: 'fa-calendar-check', label: 'Tasks' },
    { tab: 'ops-inventory', icon: 'fa-boxes-stacked', label: 'Inventory' },
    { tab: 'marketing-appointments', icon: 'fa-calendar-check', label: 'Appointments' },
    { tab: 'marketing-presentations', icon: 'fa-chalkboard-user', label: 'Presentations' },
  ]},
  finance: { icon: 'fa-coins', label: 'Money', tabs: [
    { tab: 'fin-invoices', icon: 'fa-file-invoice', label: 'Invoices' },
    { tab: 'fin-payments', icon: 'fa-money-bill-wave', label: 'Payments' },
    { tab: 'fin-mpesa', icon: 'fa-mobile-screen-button', label: 'M-Pesa' },
    { tab: 'fin-expenses', icon: 'fa-money-bill-transfer', label: 'Expenses' },
    { tab: 'fin-payroll', icon: 'fa-money-check-dollar', label: 'Payroll' },
  ]},
  more: { icon: 'fa-bars', label: 'More', tabs: [
    { tab: 'admin-employees', icon: 'fa-users-gear', label: 'HR & Staff' },
    { tab: 'admin-assets', icon: 'fa-toolbox', label: 'Assets' },
    { tab: 'admin-users', icon: 'fa-user-shield', label: 'Users' },
    { tab: 'documents', icon: 'fa-folder-tree', label: 'Vault' },
    { tab: 'smart-import', icon: 'fa-file-import', label: 'Import' },
    { tab: 'orchestration', icon: 'fa-diagram-project', label: 'Orchestration' },
    { tab: 'archives', icon: 'fa-box-archive', label: 'Archives' },
    { tab: 'trash', icon: 'fa-trash-can', label: 'Trash' },
    { tab: 'marketplace-products', icon: 'fa-store', label: 'Products' },
    { tab: 'personal-wishlist', icon: 'fa-heart', label: 'Wishlist' },
    { tab: 'clientsite', icon: 'fa-globe', label: 'Public Site' },
    { tab: 'product-presentation', icon: 'fa-window-restore', label: 'Brand Content' },
    { tab: 'personal-todos', icon: 'fa-circle-check', label: 'To-Dos' },
    { tab: 'personal-goals', icon: 'fa-bullseye', label: 'Goals' },
    { tab: 'personal-skills', icon: 'fa-code-branch', label: 'Skills' },
    { tab: 'training-overview', icon: 'fa-graduation-cap', label: 'Training' },
    { tab: 'training-quizzes', icon: 'fa-file-circle-question', label: 'Quizzes' },
    { tab: 'training-certificates', icon: 'fa-award', label: 'Certs' },
  ]},
};
window.MOBILE_NAV_MAP = MOBILE_NAV_MAP;

const _chipCache = { signature: '', els: {} };

const updateMobileSubChips = debounce(function updateMobileSubChipsImpl() {
  try {
    const host = $('mobileSubChips');
    if (!host) return;
    const cat = state.mobileCategory || 'dashboard';
    const cfg = MOBILE_NAV_MAP[cat] || MOBILE_NAV_MAP.exec;
    if (!cfg || !Array.isArray(cfg.tabs)) return;

    const visibleTabs = [];
    const sidebarIndex = window.__vioraSidebarIndex || (() => {
      const idx = {};
      document.querySelectorAll('.sidebar nav a[data-tab]').forEach(a => {
        idx[a.dataset.tab] = {
          hidden: a.classList.contains('rbac-hidden'),
          counter: a.dataset.counter,
          label: a.textContent.trim().replace(/\s+/g, ' ').replace(/\d+$/, '').trim()
        };
      });
      window.__vioraSidebarIndex = idx;
      return idx;
    })();

    for (const t of cfg.tabs) {
      const nav = sidebarIndex[t.tab];
      if (!nav || nav.hidden) continue;
      visibleTabs.push(t);
    }

    const signature = cat + '|' + visibleTabs.map(t => t.tab).join(',');
    if (signature !== _chipCache.signature) {
      _chipCache.signature = signature;
      _chipCache.els = {};

      host.innerHTML = visibleTabs.map(t => {
        return `<button type="button" class="chip" data-mchip="${t.tab}"><i class="fa-solid ${t.icon}"></i><span>${t.label}</span><span class="nav-badge muted" style="margin-left:2px;font-size:.55rem;padding:1px 5px;display:none;"></span></button>`;
      }).join('');

      host.querySelectorAll('.chip').forEach(btn => {
        const tab = btn.dataset.mchip;
        _chipCache.els[tab] = {
          btn,
          badge: btn.querySelector('.nav-badge'),
          lastActive: null,
          lastCount: -1
        };
        btn.addEventListener('click', () => {
          if (window.Viora && typeof Viora.navigate === 'function') Viora.navigate(tab);
        });
      });

      if (visibleTabs.length === 0) document.body.classList.add('no-chips');
      else document.body.classList.remove('no-chips');
    }

    for (const t of visibleTabs) {
      const entry = _chipCache.els[t.tab];
      if (!entry) continue;
      const active = state.currentTab === t.tab;
      if (entry.lastActive !== active) {
        entry.lastActive = active;
        entry.btn.classList.toggle('active', active);
      }
      const counterKey = sidebarIndex[t.tab]?.counter;
      let value = 0, danger = false;
      if (counterKey && counterKey !== 'none') {
        const cached = state._counterCache?.v?.[counterKey];
        if (cached != null) {
          if (typeof cached === 'object') { value = cached.value || 0; danger = !!cached.danger; }
          else value = cached;
        }
      }
      if (entry.lastCount !== value || entry.badge.classList.contains('muted') === danger) {
        entry.lastCount = value;
        if (value > 0) {
          entry.badge.textContent = value > 99 ? '99+' : String(value);
          entry.badge.style.display = 'inline-block';
          entry.badge.classList.toggle('muted', !danger);
        } else {
          entry.badge.style.display = 'none';
        }
      }
    }

    const title = $('mobTitleBar');
    if (title) {
      const label = sidebarIndex[state.currentTab]?.label || 'VIORA';
      if (title.textContent !== label) title.textContent = label;
    }
  } catch (e) {
    console.warn('[viora] updateMobileSubChips failed', e);
  }
}, 120);
window.updateMobileSubChips = updateMobileSubChips;

function invalidateSidebarIndex() {
  window.__vioraSidebarIndex = null;
  _chipCache.signature = '';
}

function setMobileCategory(cat) {
  state.mobileCategory = cat;
  document.querySelectorAll('#mobileBottomNav .mnav-item').forEach(it => it.classList.toggle('active', it.dataset.mnav === cat));
  if (cat === 'more') { updateMobileSubChips(); return; }
  const cfg = MOBILE_NAV_MAP[cat];
  if (cfg && cfg.tabs.length) {
    const firstAllowed = cfg.tabs.find(t => {
      const navEl = document.querySelector(`.sidebar nav a[data-tab="${t.tab}"]`);
      return !navEl || !navEl.classList.contains('rbac-hidden');
    });
    if (firstAllowed && window.Viora && typeof Viora.navigate === 'function') {
      Viora.navigate(firstAllowed.tab);
    }
  }
  updateMobileSubChips();
}
window.setMobileCategory = setMobileCategory;

/* ═══════════════════════════════════════════════════════════════
   AUTH FLOW
   ═══════════════════════════════════════════════════════════════ */
let _signingIn = false;

async function doSignIn() {
  if (_signingIn) return;
  const email = $('loginEmail')?.value?.trim() || '';
  const password = $('loginPassword')?.value || '';
  const btn = $('loginBtn');

  if (!email || !password) {
    showLoginError('Email and password are required.');
    return;
  }

  _signingIn = true;
  const originalBtnHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in…';
  }
  hideLoginError();

  try {
    console.info('[login] attempting sign-in for', email);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    console.info('[login] success:', cred.user.uid);
    _signingIn = false;
  } catch (e) {
    console.error('[login] failed:', e.code, e.message);
    const friendly = {
      'auth/invalid-email':        'That email address is not valid.',
      'auth/user-disabled':        'This account has been disabled.',
      'auth/user-not-found':       'No account found with that email.',
      'auth/wrong-password':       'Incorrect password.',
      'auth/invalid-credential':   'Wrong email or password.',
      'auth/too-many-requests':    'Too many attempts. Try again in a few minutes.',
      'auth/network-request-failed': 'Network error. Check your connection.'
    }[e.code] || (e.message || 'Sign-in failed.');
    showLoginError(friendly);
    if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
    _signingIn = false;
  }
}

async function doSignUp() {
  if (_signingIn) return;
  const email = $('loginEmail')?.value?.trim() || '';
  const password = $('loginPassword')?.value || '';
  const name = $('loginName')?.value?.trim() || '';
  const btn = $('loginBtn');

  if (!email || !password || !name) {
    showLoginError('All fields are required.');
    return;
  }

  _signingIn = true;
  const originalBtnHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating…';
  }
  hideLoginError();

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await set(ref(db, P('users') + '/' + cred.user.uid), {
      name, email, role: null, orgId: 'viora',
      createdAt: new Date().toISOString()
    });
    console.info('[signup] account created:', cred.user.uid);
    _signingIn = false;
  } catch (e) {
    console.error('[signup] failed:', e.code, e.message);
    const friendly = {
      'auth/email-already-in-use': 'That email is already registered.',
      'auth/weak-password':        'Password must be at least 6 characters.',
      'auth/invalid-email':        'That email address is not valid.'
    }[e.code] || (e.message || 'Sign-up failed.');
    showLoginError(friendly);
    if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
    _signingIn = false;
  }
}

function showLoginError(msg) {
  let box = document.getElementById('loginError');
  if (!box) {
    box = document.createElement('div');
    box.id = 'loginError';
    box.style.cssText = 'margin-top:12px;padding:10px 14px;border-radius:8px;' +
      'background:rgba(255,92,124,.12);border-left:3px solid #ff5c7c;' +
      'color:#ff8ba0;font-size:.85rem;line-height:1.4;';
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn && loginBtn.parentNode) {
      loginBtn.parentNode.insertBefore(box, loginBtn.nextSibling);
    } else {
      document.body.appendChild(box);
    }
  }
  box.textContent = msg;
  box.style.display = 'block';
}

function hideLoginError() {
  const box = document.getElementById('loginError');
  if (box) box.style.display = 'none';
}

async function doSignOut() {
  let ok = true;
  try { ok = confirm('Sign out?'); } catch (e) { ok = true; }
  if (!ok) return;
  try { await idbClear(); } catch (e) {}
  try { if (PP && typeof PP.unsubscribe === 'function') PP.unsubscribe(); } catch (e) {}
  try { await signOut(auth); }
  catch (e) { console.warn('signOut failed', e); }
  location.reload();
}

/* ═══════════════════════════════════════════════════════════════
   PRODUCT → INVENTORY MIRROR BACKFILL
   ═══════════════════════════════════════════════════════════════ */
async function backfillProductInventoryMirror(opts = {}) {
  const products = state.data.products || [];

  if (!products.length) {
    return { deferred: true, created: 0, updated: 0, total: 0 };
  }

  const inventory = state.data.inventory || (state.data.inventory = []);
  let created = 0;
  let updated = 0;

  for (const p of products) {
    if (!p || !p.id) continue;
    if ((p._kind || 'product') === 'publicUI') continue;

    const mirrorId = 'prod-' + p.id;
    let row = inventory.find(x => x.id === mirrorId)
           || inventory.find(x => x._productId === p.id);

    const priceKES = usdToKes(p.price || 0);

    if (!row) {
      const mirror = {
        id: mirrorId,
        sku: String(p.id).toUpperCase(),
        name: p.name || 'Untitled product',
        qty: 100, reorder: 5,
        cost: Math.round(priceKES * 0.6),
        price: priceKES,
        _source: 'product',
        _productId: p.id,
        _mirroredAt: new Date().toISOString(),
        _stockSeededAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      try {
        await upsertDoc('inventory', mirror);
        inventory.push(mirror);
        created++;
      } catch (e) {
        console.warn('[viora] mirror create failed for', p.id, e);
      }
      continue;
    }

    let changed = false;
    if (row.name !== p.name && p.name) { row.name = p.name; changed = true; }
    if (Number(row.price) !== priceKES) { row.price = priceKES; changed = true; }
    if (!row._productId) { row._productId = p.id; changed = true; }
    if (!row._source) { row._source = 'product'; changed = true; }

    if (changed) {
      try {
        await upsertDoc('inventory', row, row._rev);
        updated++;
      } catch (e) {
        console.warn('[viora] mirror update failed for', p.id, e);
      }
    }
  }

  if (created || updated) {
    console.info(`[viora] mirror backfill: created ${created}, updated ${updated}`);
  }
  return { deferred: false, created, updated, total: products.length };
}

window.rebuildInventoryMirrors = async function () {
  try {
    toast('Rebuilding inventory mirrors…', 'info');
    const r = await backfillProductInventoryMirror();
    if (r.deferred) toast('Products not loaded yet — try again in a moment.', 'warning');
    else toast(`Mirrors rebuilt: ${r.created} created, ${r.updated} updated.`, 'success');
  } catch (e) {
    console.error('[viora] rebuild mirrors failed', e);
    toast('Rebuild failed: ' + (e.message || 'unknown error'), 'error');
  }
};

/* ═══════════════════════════════════════════════════════════════
   DEDUPE ALL COLLECTIONS
   ═══════════════════════════════════════════════════════════════ */
async function dedupeAllCollections() {
  if (state._lastBootDedupeDone) {
    console.info('[dedupe] already run this session');
    return;
  }

  try {
    const lastAt = await idbGetDedupeStamp();
    if (lastAt && Date.now() - lastAt < 24 * 60 * 60 * 1000) {
      console.info('[dedupe] skipped — last run', new Date(lastAt).toLocaleString());
      state._lastBootDedupeDone = true;
      return;
    }
  } catch (e) {}

  let _inMemoryDupes = 0;
  for (const col of ['payments', 'tasks', 'projects']) {
    const arr = state.data[col] || [];
    const seen = new Set();
    for (const r of arr) {
      const fp = fingerprintFor(col, r);
      if (!fp) continue;
      if (seen.has(fp)) { _inMemoryDupes++; break; }
      seen.add(fp);
    }
  }
  if (_inMemoryDupes === 0) {
    console.info('[dedupe] no in-memory duplicates — skipping network pass');
    state._lastBootDedupeDone = true;
    try { await idbSetDedupeStamp(Date.now()); } catch (e) {}
    return;
  }

  const report = { payments: 0, invoiceItems: 0, leads: 0, orders: 0, tasks: 0, projects: 0 };
  try {
    {
      const py = state.data.payments || [];
      const seen = new Map();
      const keep = [];
      py.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      for (const p of py) {
        const fp = fingerprintFor('payments', p);
        if (fp && seen.has(fp)) {
          report.payments++;
          try { await remove(ref(db, `${P('payments')}/${p.id}`)); } catch (e) {}
          continue;
        }
        if (fp) seen.set(fp, p.id);
        keep.push(p);
      }
      state.data.payments = keep;
    }

    for (const inv of (state.data.invoices || [])) {
      let changed = false;
      const seen = new Set();
      const newItems = [];
      for (const it of (inv.items || [])) {
        const k = (it.worklogId || '') + '|' + Number(it.amount || 0).toFixed(2) + '|' + (it.description || '');
        if (seen.has(k)) { changed = true; report.invoiceItems++; continue; }
        seen.add(k);
        newItems.push(it);
      }
      if (changed) {
        inv.items = newItems;
        try { await upsertDoc('invoices', inv, inv._rev); } catch (e) {}
      }
    }

    {
      const leads = state.data.leads || [];
      const seen = new Map();
      const keep = [];
      leads.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      for (const l of leads) {
        const key = normalizeEmail(l.email) || l.id;
        if (key && seen.has(key)) {
          const prior = seen.get(key);
          if (l.status === 'Converted' && prior.status !== 'Converted') {
            const i = keep.findIndex(x => x.id === prior.id);
            if (i > -1) keep[i] = l;
            seen.set(key, l);
            report.leads++;
            try { await remove(ref(db, `${P('leads')}/${prior.id}`)); } catch (e) {}
          } else {
            report.leads++;
            try { await remove(ref(db, `${P('leads')}/${l.id}`)); } catch (e) {}
          }
          continue;
        }
        if (key) seen.set(key, l);
        keep.push(l);
      }
      state.data.leads = keep;
    }

    {
      const ord = state.data.orders || [];
      const seen = new Set();
      const keep = [];
      for (const o of ord) {
        if (o.id && seen.has(o.id)) { report.orders++; continue; }
        if (o.id) seen.add(o.id);
        keep.push(o);
      }
      state.data.orders = keep;
    }

    {
      const ts = state.data.tasks || [];
      const seen = new Map();
      const keep = [];
      ts.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      for (const t of ts) {
        const fp = fingerprintFor('tasks', t);
        if (fp && seen.has(fp)) {
          report.tasks++;
          try { await remove(ref(db, `${P('tasks')}/${t.id}`)); } catch (e) {}
          continue;
        }
        if (fp) seen.set(fp, t.id);
        keep.push(t);
      }
      state.data.tasks = keep;
    }

    {
      const ps = state.data.projects || [];
      const seen = new Map();
      const keep = [];
      ps.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      for (const p of ps) {
        const fp = fingerprintFor('projects', p);
        if (fp && seen.has(fp)) {
          report.projects++;
          try { await remove(ref(db, `${P('projects')}/${p.id}`)); } catch (e) {}
          continue;
        }
        if (fp) seen.set(fp, p.id);
        keep.push(p);
      }
      state.data.projects = keep;
    }

    const total = Object.values(report).reduce((s, n) => s + n, 0);
    if (total > 0) {
      await logActivity('delete', 'Deduplication pass',
        `payments: ${report.payments} · invoice-items: ${report.invoiceItems} · leads: ${report.leads} · tasks: ${report.tasks} · projects: ${report.projects}`);
      console.info('[dedupe] removed duplicates:', report);
    } else {
      console.info('[dedupe] no duplicates found');
    }

    try { await idbSetDedupeStamp(Date.now()); } catch (e) {}
  } catch (e) {
    console.warn('[dedupe] failed:', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════ */
let _bootAppRunning = false;
let _bootAppDone = false;

/* ═══════════════════════════════════════════════════════════════
   LEAD → CLIENT + DEAL CONVERSION
   Called by Viora.saveLead() when a lead's status becomes 'Qualified'.
   Creates the client, the deal, emits the events that trigger
   orchestration handoffs, and updates the lead record.
   ═══════════════════════════════════════════════════════════════ */
async function convertLeadToClientDeal(lead) {
  if (!lead || !lead.id) return null;

  /* 1. Prevent duplicate conversion */
  const alreadyConverted = (state.data.entities || []).some(
    e => e && e.type === 'client' && e.sourceLeadId === lead.id
  );
  if (alreadyConverted) return null;

  const normEmail = normalizeEmail(lead.email);
  if (normEmail) {
    const emailExists = (state.data.entities || []).some(
      e => e && e.type === 'client' && normalizeEmail(e.email) === normEmail
    );
    if (emailExists) return null;
  }

  const now = new Date().toISOString();
  const clientId = uid();

  /* 2. Create the client */
  const client = {
    id: clientId,
    type: 'client',
    name: lead.fullName || lead.email || 'Unnamed Lead',
    email: lead.email || '',
    phone: lead.phone || '',
    company: '',
    address: '',
    city: '',
    clientType: 'SMB',
    documents: [],
    avatar: null,
    clientId: 'CL-' + clientId.slice(-6).toUpperCase(),
    sourceLeadId: lead.id,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await upsertDoc('entities', client);
  } catch (e) {
    console.error('[convertLead] failed to create client:', e);
    return null;
  }

  /* 3. Create the deal */
  const dealId = uid();
  const deal = {
    id: dealId,
    title: `Opportunity — ${client.name}`,
    clientId: clientId,
    clientName: client.name,
    value: 0,
    stage: 'Quote Sent',
    terms: 'Net 30',
    owner: state.operator?.name || 'Sales',
    source: lead.source || 'Lead',
    notes: lead.notes || `Converted from lead ${lead.id}`,
    autoGenerated: true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await upsertDoc('deals', deal);
  } catch (e) {
    console.warn('[convertLead] failed to create deal:', e);
  }

  /* 4. Update the lead */
  try {
    const liveLead = getLead(lead.id) || lead;
    await upsertDoc('leads', {
      ...liveLead,
      status: 'Converted',
      convertedAt: now,
      convertedClientId: clientId,
    }, liveLead._rev);
  } catch (e) {
    console.warn('[convertLead] failed to update lead:', e);
  }

  /* 5. Emit events so orchestration fires */
  try {
    EventBus.emit('entities.upsert', client, clientId, client, { collection: 'entities' });
    EventBus.emit('deals.upsert', deal, dealId, deal, { collection: 'deals' });
  } catch (e) {
    console.warn('[convertLead] event emit failed:', e);
  }

  /* 6. Log activity */
  try {
    await logActivity('add', 'Lead converted', `${client.name} → Client + Deal`);
  } catch (e) {}

  return client;
}

async function bootApp() {
  if (_bootAppRunning || _bootAppDone) return;
  _bootAppRunning = true;

  const deps = {
    auth, db, P, ROOT,
    state,

    renderAll,
    renderActiveTab,
    scheduleRender,
    updateSidebarCounters, invalidateCountersFor,
    applyRoleGating, applyLogoEverywhere,
    renderDashboard, renderTrainingOverview, renderTrainingRequests,
    renderTrainingProgress, renderTrainingCertificates, renderTrainingQuizzes,
    renderPortalRequests, renderPortalUsers, renderClientsite,
    renderProfile, renderTrash, renderCommunications,
    renderActivity, renderTasks, renderProjects, renderMyWishlist,
    renderUsers, renderMarketContent, renderArchivesPanel,
    renderOrchestrationPanel,

    toast, setSyncStatus,

    scheduleMarketSync, processMpesaQueue, scheduleFlush,
       dedupeAllCollections, recomputeProjectProgress,
    backfillMirror: () => backfillProductInventoryMirror(),

    upsertDoc,
    convertLeadToClientDeal,

    startHeartbeat: () => {
      setInterval(() => {
        try { updatePendingCount(); } catch (e) {}
        try { window.__vioraGcCommDedupe?.(); } catch (e) {}
      }, 15000);
    },

    attachVioraNotificationListener,
    PushNotifications,

    attachEvents: (...a) => _attachEventsImpl?.(...a),
    attachForms: (...a) => _attachFormsImpl?.(...a),
    setupImportDropzone, setupCommandPalette,
    updateMobileSubChips, initMobileShell: () => {},
    initHistoryGuard, watchModals,
    refreshRecommendations,

    PP, AIRank,

    doSignIn,
    wireLoginScreenExternal: () => {
      const loginBtn = document.getElementById('loginBtn');
      if (!loginBtn) return false;
      if (loginBtn._vioraLoginBound) return true;
      loginBtn._vioraLoginBound = true;

      const signInTab = document.getElementById('loginTabSignIn');
      const signUpTab = document.getElementById('loginTabSignUp');
      if (signInTab && signUpTab) {
        signInTab.onclick = () => {
          signInTab.classList.add('active');
          signUpTab.classList.remove('active');
          const sf = document.getElementById('signUpFields');
          if (sf) sf.style.display = 'none';
          const lt = document.getElementById('loginBtnText');
          if (lt) lt.textContent = 'Sign In';
          loginBtn.onclick = doSignIn;
        };
        signUpTab.onclick = () => {
          signUpTab.classList.add('active');
          signInTab.classList.remove('active');
          const sf = document.getElementById('signUpFields');
          if (sf) sf.style.display = 'block';
          const lt = document.getElementById('loginBtnText');
          if (lt) lt.textContent = 'Create Account';
          loginBtn.onclick = doSignUp;
        };
      }
      loginBtn.onclick = doSignIn;
      document.getElementById('loginPassword')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); loginBtn.click(); }
      });
      document.getElementById('loginEmail')?.addEventListener('keydown', e => {
        const sf = document.getElementById('signUpFields');
        if (e.key === 'Enter' && (!sf || sf.style.display === 'none')) {
          e.preventDefault();
          loginBtn.click();
        }
      });
      const lo = document.getElementById('logoutBtn');
      if (lo) lo.onclick = doSignOut;
      return true;
    },

    BUSINESS_COLLECTIONS,

    DERIVED_HELPERS: {
      getClientAgreedTotal, getClientBilledTotal, getClientPaidTotal,
      getClientRemainingTotal, getClientCreditTotal,
      nextProjectInvoiceNumber, recomputeClientInstallments,
      applyClientCreditToInvoice, buildInvoiceProgressMessage,
      recomputeProjectProgress,
    },

    normalizeEmail,
    usdToKes,
    global: window,

       renderDocuments:     renderDocumentVault,
    renderTrainingUsers: renderTrainingUsers,
    renderMyWishlist:    renderMyWishlist,
    renderUsers:         renderUsers,
    renderMarketContent: renderMarketContent,
    renderHomeContent:   window.__vioraRenderHomeContent || null,
    renderEmployeeProfiles: window.__vioraRenderEmployeeProfiles || null,
    EventBus,
  };

  try {
    await boot(deps);
    _bootAppDone = true;
  } catch (e) {
    console.error('[viora] boot() threw:', e);
    const btn = document.getElementById('loginBtn');
    if (btn && !btn._vioraLoginBound) {
      btn._vioraLoginBound = true;
      btn.onclick = doSignIn;
    }
  } finally {
    _bootAppRunning = false;
  }

  try {
    if (typeof initDashboardNotifications === 'function') initDashboardNotifications();
  } catch (e) { console.warn('[dn] init failed', e); }

  try {
    registerNetworkEvents(deps);
  } catch (e) { console.warn('[viora] registerNetworkEvents failed', e); }
}

let _attachEventsImpl = null;
let _attachFormsImpl  = null;

/* ═══════════════════════════════════════════════════════════════
   GLOBAL ERROR HANDLERS
   ═══════════════════════════════════════════════════════════════ */
window.__vioraErrCount = window.__vioraErrCount || 0;
window.__vioraLastErr  = window.__vioraLastErr  || 0;
window.__vioraLastRej  = window.__vioraLastRej  || 0;

function _persistClientError(kind, message, stack) {
  try {
    if (window.__vioraErrCount >= 20) return;
    window.__vioraErrCount++;

    const s = (typeof state !== 'undefined' && state) || window.state || {};
    const errId = 'err-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    set(ref(db, `viora_data/orgs/viora/clientErrors/${errId}`), {
      kind,
      message: String(message || '').slice(0, 500),
      stack:   String(stack   || '').slice(0, 2000),
      url:     location.href.slice(0, 300),
      ua:      navigator.userAgent.slice(0, 200),
      by:      s.operator?.uid || 'anon',
      ts:      new Date().toISOString()
    }).catch(() => {});
  } catch (e) {}
}

window.addEventListener('error', function (event) {
  const msg = event.message || (event.error && event.error.message) || 'unknown';
  const stack = event.error && event.error.stack;
  try {
    console.error('[viora] global error:', event.error || event.message);
    if (Date.now() - window.__vioraLastErr > 3000) {
      window.__vioraLastErr = Date.now();
      toast('Unexpected error: ' + msg, 'error');
    }
    _persistClientError('error', msg, stack);
  } catch (e) {}
});

window.addEventListener('unhandledrejection', function (event) {
  const reason = event.reason;
  const msg = (reason && reason.message) || String(reason || 'unknown');
  const stack = reason && reason.stack;
  try {
    console.error('[viora] unhandled rejection:', reason);
    if (Date.now() - window.__vioraLastRej > 3000) {
      window.__vioraLastRej = Date.now();
      toast('Async error: ' + msg, 'error');
    }
    _persistClientError('rejection', msg, stack);
  } catch (e) {}
});

/* ═══════════════════════════════════════════════════════════════
   START
   ═══════════════════════════════════════════════════════════════ */
function startApp() {
  console.log('[viora] startApp fired. readyState =', document.readyState);
  console.log('[viora] loginBtn present?', !!document.getElementById('loginBtn'));

  /* ═══════════════════════════════════════════════════════════
     ★★★ FIX #2 — BOOT-DRAIN WATCHDOG ★★★
     If boot() ever fails to release _bootDraining (auth never
     fires, network stalls, an init throws), every renderAll()
     becomes a silent no-op and sidebar clicks appear dead.
     Force-release after 6 seconds and repaint.
     ═══════════════════════════════════════════════════════════ */
  setTimeout(() => {
    if (state._bootDraining) {
      console.warn(
        '%c[viora] ⚠️ boot-drain watchdog fired — forcing release after 6s',
        'color:#ffc857;font-weight:700'
      );
      state._bootDraining = false;
      state._forceRepaint = true;
      try { renderAll(); }
      catch (e) { console.warn('[viora] watchdog renderAll failed:', e); }
      try { updateSidebarCounters(true); } catch (e) {}
    }
  }, 6000);

  // Debounce the dashboard render so snapshots from the ~30
  // collections being watched can't destroy + recreate every chart
  // dozens of times per minute.
  let _renderDashboardDebounceTimer = null;
  window.__vioraRenderDashboardDebounced = function () {
    if (_renderDashboardDebounceTimer) return;
    _renderDashboardDebounceTimer = setTimeout(() => {
      _renderDashboardDebounceTimer = null;
      try { renderDashboard(); }
      catch (e) { console.warn('[dashboard] debounced render failed', e); }
    }, 500);
  };

  async function runBoot() {
    /* ═══════════════════════════════════════════════════════════
       PHASE 1 — All module initialisers (order matters)
       ═══════════════════════════════════════════════════════════ */

    // 1a. IDB — FIRST PASS: no directWrite/directDelete yet
    // (they live in write-layer.js and aren't available until step 1b)
    try {
      initIdb({ state, toast, setSyncStatus });
    } catch (e) { console.error('[viora] initIdb:', e); }

    // 1b. Write layer
    try {
      initWriteLayer({
        db, ref, set, get, remove, push, P,
        state, toast, setSyncStatus, logActivity,
        EventBus,
        queueOfflineMutation,
        idbSave,
        vioraConfirm: window.vioraConfirm
      });
    } catch (e) { console.error('[viora] initWriteLayer:', e); }

    // 1c. IDB — SECOND PASS: now wire directWrite/directDelete
    try {
      initIdb({
        state, toast, setSyncStatus,
        directWrite,
        directDelete
      });
    } catch (e) { console.error('[viora] initIdb (2nd pass):', e); }

    // 2. Modal utils
    try { initModalUtils({ state }); }
    catch (e) { console.error('[viora] initModalUtils:', e); }

    // 3. Charts
    try {
      initCharts({
        $, state,
        getOrdersList, getProductsList, getProductSalesMetrics,
        usdToKes, FX_RATE,
      });
    } catch (e) { console.error('[viora] initCharts:', e); }

    // 4. Contacts
    try {
      initContacts({
        $, state, toast, logActivity, logComm,
        escapeHtml, timeAgo, normalizePhone,
        callFn, openModal, closeModal, SENDER_PHONE,
      });
    } catch (e) { console.error('[viora] initContacts:', e); }

    // 5. Projects
    try {
      initProjects({
        $, state, uid, todayStr, dateToStr, fmtDate, fmtKES,
        escapeHtml, isOverdue, daysBetween, toast, logActivity,
        upsertDoc, deleteDoc, EventBus,
        getClient, getClientName, getClientProjects, getProject,
        getInvoiceTotals, getInvoiceStatusDerived, contactButtons,
      });
    } catch (e) { console.error('[viora] initProjects:', e); }

    // 6. Finance
    try {
      initFinance({
        db, ref, set, get, remove, push, P, ROOT,
        state, $, toast, logActivity, logComm, setSyncStatus,
        upsertDoc, deleteDoc, queueOfflineMutation,
        EventBus, callFn, PushNotifications,
        dateToStr, openModal, closeModal,
        renderActiveTab,
        getOverdueInstallments,
        buildInvoicePdfBase64: window.buildInvoicePdfBase64 || null,
        getClient, getClientName,
        getProject: (id) => window.getProject?.(id),
        getProjectNumber: (id) => window.getProjectNumber?.(id) || '—',
        getClientInvoices, getClientProjects, getClientContracts,
        getProjectAgreedTotal: (id) => window.getProjectAgreedTotal?.(id) || 0,
        getProjectPaidTotal: (id) => window.getProjectPaidTotal?.(id) || 0,
        getProjectBilledTotal: (id) => window.getProjectBilledTotal?.(id) || 0,
        getProjectFinancialProgress: (id) => window.getProjectFinancialProgress?.(id) || { pct: 0, agreed: 0, paid: 0, balance: 0 },
        getProjectOverpayment: (projectId) => {
          const agreed = window.getProjectAgreedTotal?.(projectId) || 0;
          const paid   = window.getProjectPaidTotal?.(projectId)   || 0;
          if (agreed <= 0) return 0;
          return Math.max(0, paid - agreed);
        },
        getClientAgreedTotal, getClientBilledTotal, getClientPaidTotal, getClientCreditTotal,
        recomputeProjectProgress: (pid) => window.recomputeProjectProgress?.(pid),
        recomputeClientRollup,
        SENDER_PHONE, SENDER_EMAIL,
        buildClientStatementPdf,
        getLogoImg,
      });
    } catch (e) { console.error('[viora] initFinance:', e); }

    // 7. Clients
    try {
      initClients({
        $, state, uid, todayStr, dateToStr,
        fmtDate, fmtDateTime, fmtKES, fmtBytes,
        escapeHtml, timeAgo, toast, logActivity, logComm,
        upsertDoc, deleteDoc, EventBus,
        openModal, closeModal, renderActiveTab,
        getLogoImg, SENDER_PHONE, SENDER_EMAIL, MAX_FILE_SIZE,
      });
    } catch (e) { console.error('[viora] initClients:', e); }

    // 8. Admin
    try {
      initRenderAdmin({
        state, $, escapeHtml, timeAgo, todayStr, fmtDate, fmtKES, fmtBytes,
        getEmployees, getClientName, contactButtons,
        db, ref, set, remove, onValue, P,
        toast, logActivity, openModal, closeModal,
        renderSupportTickets: () => renderSupportTickets(),
      });
    } catch (e) { console.error('[viora] initRenderAdmin:', e); }

    // 9. Partner + Personal
    try {
      initRenderPartner({ state, $, escapeHtml, timeAgo, todayStr, fmtKES });
      initRenderPersonal({ state, $, escapeHtml, fmtDate, todayStr });
    } catch (e) { console.error('[viora] partner/personal inits:', e); }

    // 10. Marketplace
    try {
      initRenderMarketplace({
        state, $, escapeHtml, timeAgo, todayStr,
        fmtUSD, fmtKES, kpiFormat, usdToKes,
        normalizeEmail, emailToId,
        getOrdersList, getProductsList, getProduct, getOrder,
        getTextColor, destroyChart, safeCanvas,
        getLogoImg, generateLicenseKey,
        upsertDoc, toast, logActivity,
        openModal, closeModal, EventBus, callFn,
        db, ref, set, P,
        WORKER_URL, SENDER_PHONE, SENDER_EMAIL,
        scheduleMarketSync: () => scheduleMarketSync(),
      });
    } catch (e) { console.error('[viora] initRenderMarketplace:', e); }
    

    // 11. Misc helpers
    try {
      initMiscHelpers({
        state, $, toast, openModal, closeModal,
        todayStr, fmtKES, callFn, upsertDoc, logActivity,
        getClient, generateInvoiceNumber,
        renderLedger, renderProposals, renderDocumentVault, renderInvoices,
      });
    } catch (e) { console.error('[viora] initMiscHelpers:', e); }

    // 12. Dashboard renderers
    try {
      initRenderDashboard({
        state, $,
        escapeHtml, timeAgo, todayStr,
        fmtKES, fmtDate, kpiFormat, isOverdue, daysBetween,
        getClients, getClientName,
        computeCounterValue,
        computeCounterValueSafe: (key) => {
          const v = computeCounterValue(key);
          if (v && typeof v === 'object') return v.value || 0;
          return v || 0;
        },
        getMarketplaceMetrics, getProductsList,
        getOverdueInstallments,
        getUpcomingInstallments,
        getInvoiceTotals, getInvoicePaidAmount, getInvoiceStatusDerived,
        renderClientCards, renderCharts, renderMarketplaceCharts,
        getTextColor, destroyChart, safeCanvas,
        db, ref, update, onChildAdded,
        callFn,
      });
    } catch (e) { console.error('[viora] initRenderDashboard:', e); }
    
           // 12b. Dashboard hero + weather (real-time sky)
  try {
  initDashboardWeather({
    state,
    callFn,
    db, ref, get, set,
    toast,
  });
  /* ★ Removed: initDashboardHero, startHeroWeather, updateHeroWeather.
     dashboard-hero.js is gone. hero-orb.js handles the sun,
     hero-sky.js handles the moon + stars, hero-terminator.js
     handles the sky gradient, hero-banner.js handles particles. */
  console.info('[viora] dashboard weather initialized');
} catch (e) { console.error('[viora] dashboard weather init:', e); }

    // 12c. Dashboard KPI grid + Needs-Attention panel
    try {
      initDashboardKpis({
        state,
        renderActiveTab: () => renderActiveTab(),
        navigate: (tab) => { if (window.Viora?.navigate) window.Viora.navigate(tab); },
        getClientAgreedTotal, getClientPaidTotal,
      });
      initDashboardAttention({
        state,
        getOverdueInstallments,
        navigate: (tab) => { if (window.Viora?.navigate) window.Viora.navigate(tab); },
      });
      console.info('[viora] dashboard KPI + attention initialized');
    } catch (e) { console.error('[viora] dashboard kpi/attention init:', e); }
    
        // 12c. Dashboard KPIs + attention panel
    try {
      initDashboardKpis({
        state,
        getClientAgreedTotal: (id) => window.getClientAgreedTotal?.(id) || 0,
        getClientPaidTotal: (id) => window.getClientPaidTotal?.(id) || 0,
      });
      initDashboardAttention({
        state,
        getOverdueInstallments: () => window.getOverdueInstallments?.() || [],
      });
      console.info('[viora] dashboard KPIs + attention initialized');
    } catch (e) { console.error('[viora] dashboard KPIs/attention init:', e); }

    // 13. Orchestration — CRITICAL: must run BEFORE bootApp()
    try {
      initOrchestration({
        db, ref, set, get, update, remove, push,
        P, state,
        toast, logActivity, logComm, setSyncStatus, $,
        upsertDoc, deleteDoc, directWrite, directDelete,
        PushNotifications, callFn,
        auth, WORKER_URL,
        eventQueuePush, eventQueueDrain, eventQueueRemove,
        getClient, getClients,
        getClientProjects, getClientInvoices, getClientContracts,
        getEmployees,
        getInvoiceTotals, getInvoicePaidAmount, getInvoiceStatusDerived,
        getOverdueInstallments,
        getUpcomingInstallments,
        getProductSalesMetrics,
        getProject,
        getProjectNumber:             (id)  => window.getProjectNumber?.(id) || '—',
        getProjectAgreedTotal:        (id)  => window.getProjectAgreedTotal?.(id)  || 0,
        getProjectPaidTotal:          (id)  => window.getProjectPaidTotal?.(id)    || 0,
        getProjectBilledTotal:        (id)  => window.getProjectBilledTotal?.(id)  || 0,
        getProjectFinancialProgress:  (id)  => window.getProjectFinancialProgress?.(id) || { pct: 0, agreed: 0, paid: 0, balance: 0 },
        nextProjectInvoiceNumber:     (pid) => window.nextProjectInvoiceNumber?.(pid) || 'INV',
        recomputeProjectProgress:     (pid) => window.recomputeProjectProgress?.(pid),
        bulkGenerateTasksForClient:   (o)   => window.bulkGenerateTasksForClient?.(o),
        recomputeClientRollup,
        onInvoicePaid,
        checkOrderStock,
        scheduleMarketSync,
        buildInvoiceProgressMessage,
        awardTrainingCertificate,
        processMpesaQueue,
        openModal, closeModal,
        renderActiveTab,
        renderAll,
        openProposalStudio:      window.Viora?.openProposalStudio || null,
        openProjectDeliverables: window.openProjectDeliverables || window.Viora?.openProjectDeliverables || null,
      });
    } catch (e) { console.error('[viora] initOrchestration:', e); }

    // 14. AI services
    try {
      initAIServices({
        state, callFn, toast, upsertDoc, getClient, escapeHtml,
        renderActiveTab,
        evaluateAllQueues,
        Orchester, ORCHESTRATION_HANDOFFS, renderOrchestrationPanel,
      });
    } catch (e) { console.error('[viora] initAIServices:', e); }

    // 15. Training
    try {
      initTraining({
        $, state, toast,
        escapeHtml, timeAgo, fmtDate, fmtBytes, fmtKES, uid, todayStr,
        db, ref, set, update, remove, push, get, onValue,
        P, ROOT,
        logActivity, callFn,
        openModal, closeModal,
        getClient, getClientName,
        getTextColor, destroyChart, safeCanvas,
        MAX_FILE_SIZE,
        AutoCertification,
        setupCertStampDragging,
        renderTrainingCertificates,
        renderTrainingProgress,
        renderTrainingQuizzes,
        updateSidebarCounters,
      });
    } catch (e) { console.error('[viora] initTraining:', e); }

    // 16. PP editor
    try {
      initPP({
        db, ref, set, onValue, get, P,
        state, toast, logActivity, escapeHtml, $,
      });
    } catch (e) { console.error('[viora] initPP:', e); }

      // 17. Market content
    try {
      initMarketContent({
        db, ref, set, P,
        state, toast, logActivity, escapeHtml, $,
      });
    } catch (e) { console.error('[viora] initMarketContent:', e); }

    // 17b. Home content (landing page CMS)
    try {
      const { initHomeContent, renderHomeContent } = await import('./main/home-content.js');
      initHomeContent({
        db, ref, set, get, P,
        state, toast, logActivity, escapeHtml, $,
        uploadToStorage: window.uploadToStorage || null,
      });
      window.__vioraRenderHomeContent = renderHomeContent;
    } catch (e) { console.error('[viora] initHomeContent:', e); }

    // 17c. Employee profiles (public team directory)
    try {
      const { initEmployeeProfiles, renderEmployeeProfiles } = await import('./main/employee-profiles.js');
      initEmployeeProfiles({
        db, ref, set, get, P,
        state, toast, logActivity, escapeHtml, $,
      });
      window.__vioraRenderEmployeeProfiles = renderEmployeeProfiles;
    } catch (e) { console.error('[viora] initEmployeeProfiles:', e); }

    // 18. Global market
    try {
      initGlobalMarket({ $, toast, escapeHtml, callFn });
    } catch (e) { console.error('[viora] initGlobalMarket:', e); }

    // 19. Push notifications
    try {
      initPushNotifications({
        app, db, ref, set, ROOT,
        state, toast, callFn, $,
      });
    } catch (e) { console.error('[viora] initPushNotifications:', e); }

    // 20. Smart import
    try {
      initSmartImport({
        $, toast, uid, callFn, state,
        upsertDoc, logActivity,
        todayStr, MAX_FILE_SIZE, renderAll,
        escapeHtml,
      });
    } catch (e) { console.error('[viora] initSmartImport:', e); }

    // 21. Command palette
    try {
      initCommandPalette({
        $, state, escapeHtml, callFn,
        navigate: (tab, opts) => Viora.navigate(tab, opts),
        openClient360: (id) => openClient360(id),
      });
    } catch (e) { console.error('[viora] initCommandPalette:', e); }

    // 22. Subscriptions
    try {
      initSubscriptions({
        db, ref, set, get, update, remove, push,
        state,
        $, escapeHtml, toast, logActivity,
        upsertDoc, deleteDoc,
        openModal, closeModal,
        generateInvoiceNumber,
        getClient,
        getClients: () => getClients(),
        normalizeEmail,
        normalizePhone,
        logComm,
        renderActiveTab,
        scheduleRender,
        EventBus,
        vioraConfirm: window.vioraConfirm,
        vioraPrompt: window.vioraPrompt,
        getTextColor,
      });
    } catch (e) { console.error('[viora] initSubscriptions:', e); }
    
    try {
  initSubscriptionPlans({
    db, ref, get, set, update, remove, onValue,
    state,
    toast
  });
  console.log('[viora] ✅ subscription plans module initialized');
} catch (e) {
  console.error('[viora] initSubscriptionPlans failed:', e);
}

    // 23. Main renderers
    let _renderers = null;
    try {
      _renderers = initMainRenderers({
        db, auth, ref, set, get, remove, push, update,
        P, ROOT,
        state,
        uid, todayStr, dateToStr, fmtDate, fmtDateTime, fmtKES, fmtUSD,
        usdToKes, kpiFormat, timeAgo, daysBetween, isOverdue, fmtBytes,
        escapeHtml, normalizePhone, normalizeEmail, simpleHash, emailToId,
        generateLicenseKey, isMobile, debounce,
        upsertDoc, deleteDoc, queueOfflineMutation,
        upsertPersonal, upsertTrackFlat, deletePersonal, deleteTrackFlat,
        toast, logActivity, logComm, callFn, setSyncStatus,
        openModal, closeModal, showModal, hideModal,
        vioraConfirm, vioraPrompt,
        getLogoImg,
        getClients, getClient, getClientName, getEmployees,
      getProject, getProjectNumber: (id) => window.getProjectNumber?.(id) || '—', getProduct, getOrder, getLead,
        getClientProjects, getClientInvoices, getClientPayments,
        getClientDeals, getClientContracts, getClientTasks, getClientComms,
        getClientAppointments, getClientPresentations,
        getClientAgreedTotal, getClientBilledTotal, getClientPaidTotal,
        getClientRemainingTotal, getClientCreditTotal,
        getProjectAgreedTotal, getProjectBilledTotal, getProjectPaidTotal,
        getProjectFinancialProgress,
        recomputeProjectProgress, recomputeClientRollup,
        getInvoicePaidAmount, getInvoiceTotals, getInvoiceStatusDerived,
        generateInvoiceNumber, nextProjectInvoiceNumber,
        buildInvoiceProgressMessage,
        reconcilePayment, onInvoicePaid, sendInvoiceReceipt,
        applyClientCreditToInvoice,
        getProductSalesMetrics, getMarketplaceMetrics,
        renderClientCards, renderClientAvatarPreview,
        renderGoalMilestoneEditor, computeGoalProgress,
        renderProjectTasksEditor, renderProjectInstallmentEditor,
        removeProjectInstallment, renderClientProjectsFeeEditor,
        openProjectDeliverables, buildClientStatementPdf,
        contactButtons, getEntityById,
        openInvoiceViewModal, openPaymentModal, openStkModal,
        savePayment, deletePayment, deleteInvoice,
        findInvoiceCandidates, openManualMpesaMatch,
        openServiceAgreementModal, transferProjectCredit,
        openFeesModal, openCreditTransfer, openPayChain, confirmPayChain,
        sendClientStatement, bulkRemind,
        openWelcomeEmailPreview, openClient360,
        getClientDocs,
        AIRank, AIFiling, AIAnomaly,
        EventBus, Orchester, PushNotifications,
        openInvoiceGenModal, refreshInvoiceProjects,
        renderExtraCharges, removeCharge, updateInvoicePreview,
        renderPaymentProjectPicker, renderPaymentAllocation,
        updatePaymentSummary,
        openProposalStudio, generateProposalDraft, saveProposalDraft,
        proposalToVault, proposalToInvoice,
        openMpesaModal, processMpesaQueue, renderMpesaModal,
        openOrderDetail,
        addToWishlist, removeFromWishlist, buyFromWishlist,
        openManualSale, submitManualSale,
        updateManualSaleItem, removeManualSaleItem,
        renderMyOrders, renderMyWishlist,
              renderCampaigns: () => {}, applyCampMediaTypeUI: () => {},
        renderCampaignStats: () => {}, fetchCampaignStats: () => {},
        connectTikTok: () => {}, refreshAllCampaignStats: () => {},
        renderMarketplaceProducts, renderPublicUiProducts,
        renderMarketplaceOrders, renderMarketplaceAnalytics,
        renderPartnerTasks, renderPartnerHourly, renderPartnerSchedule,
        renderPartnerHandoffs, renderPartnerFinancials, renderPartnerActivities,
        renderPartnerChat, renderPartnerPresence, renderPartnerGames,
        renderPersonalTodos, renderPersonalGoals, renderPersonalSkills,
        renderCharts, renderMarketplaceCharts, renderAdminAnalytics,
        renderEmployees, renderAssets, renderCompliance, renderUsers,
        renderDocumentVault, renderActivity, renderTrash,
        renderSupportTickets, viewTicket, closeTicketView, sendTicketReply,
        toggleTicketStatus, markTicketResolved, deleteTicket, getViewingTicketId,
        renderPortalRequests, renderPortalUsers,
        renderClientsite, renderDashboard,
        renderProjects, renderTasks, renderInventory,
        renderInvoices, renderPayments, renderLedger,
        renderExpenses, renderPayroll,
        renderLeads, renderDeals, renderPipelineKanban, renderContracts,
        renderProposals, renderAppointments, renderPresentations,
        renderClients, renderClient360Page,
        renderCommunications, renderMpesaInline,
        renderSubscriptions,
        renderTrainingOverview, renderTrainingRequests, renderTrainingUsers,
        renderTrainingProgress, renderTrainingQuizzes, renderTrainingCertificates,
        renderOrchestrationPanel, renderArchivesPanel,
        renderNotifications, refreshRecommendations,
        renderDashboardNotifications: window.renderDashboardNotifications,
        initDashboardNotifications: window.initDashboardNotifications,
        renderClientDocsGrid: renderDocumentVault,
        updateSidebarCounters,
        invalidateCountersFor,
        syncMarketToLeads:        (...a) => window.__vioraSyncMarketToLeads?.(...a),
        syncBlueprintLeads:       (...a) => window.__vioraSyncBlueprintLeads?.(...a),
        syncOrderLeads:           (...a) => window.__vioraSyncOrderLeads?.(...a),
        dedupeLeads:              (...a) => window.__vioraDedupeLeads?.(...a),
        getOverdueInstallments,
        getUpcomingInstallments,
        renderNavQueues,
      });
    } catch (e) {
      console.error('[viora] initMainRenderers:', e);
    }

     window.__vioraRenderers = _renderers;

    /* ═══════════════════════════════════════════════════════════
       renderActiveTab — routes the current tab to its renderer.
       The main-renderers module doesn't export a router, so we
       install one here using main.js's own imports.
       ═══════════════════════════════════════════════════════════ */
    function _renderActiveTabRouter() {
      const tab = state.currentTab;
      if (!tab) return;
       try {
        switch (tab) {
                 case 'dashboard':
            window.__vioraRenderDashboardDebounced();
            try { renderDashboardKpis(); } catch (e) { console.warn('[dashboard] kpis', e); }
            try { renderDashboardAttention(); } catch (e) { console.warn('[dashboard] attention', e); }
            try {
              if (typeof window.renderDashboardNotifications === 'function') {
                window.renderDashboardNotifications();
              }
            } catch (e) { console.warn('[dashboard] notifs', e); }
        try { bootDashboardWeather(); } catch (e) { console.warn('[dashboard] weather boot', e); }
try {
  if (typeof window.__vioraForceWeatherRefresh === 'function') {
    window.__vioraForceWeatherRefresh();
  }
} catch (e) { console.warn('[dashboard] weather refresh', e); }
            break;
          case 'profile':                 renderProfile(); break;
          case 'global-market':           try { setupGlobalMarket?.(); loadGlobalDashboard?.(); } catch (e) { console.warn('[tab render] global-market', e); } break;

          // ── Client ──
          case 'sales-clients':           renderClients(); break;
          case 'client360':               renderClient360Page(); break;
          case 'marketing-leads':         renderLeads(); break;
          case 'marketing-appointments':  renderAppointments(); break;
          case 'portal-requests':         renderPortalRequests(); break;
          case 'portal-users':            renderPortalUsers(); break;
          case 'subscriptions':           renderSubscriptions(); break;
          case 'support-tickets':         renderSupportTickets(); break;
          case 'communications':          renderCommunications(); break;

          // ── Marketing ──
          case 'marketplace-analytics':   renderMarketplaceAnalytics(); break;
                case 'personal-wishlist':       renderMyWishlist(); break;
          case 'product-presentation':    try { PP?.subscribe?.(); } catch (e) {} break;
          case 'clientsite':              renderClientsite(); break;
            case 'market-content':          renderMarketContent(); break;
          case 'home-content':            window.__vioraRenderHomeContent?.(); break;
          case 'employee-profiles':       window.__vioraRenderEmployeeProfiles?.(); break;

          // ── Sales ──
          case 'sales-deals':             renderDeals(); break;
          case 'sales-pipeline':          renderPipelineKanban(); break;
          case 'sales-proposals':         renderProposals(); break;
          case 'sales-contracts':         renderContracts(); break;
          case 'personal-orders':         renderMyOrders(); break;
          case 'marketplace-products':    renderMarketplaceProducts(); renderPublicUiProducts(); break;
          case 'marketplace-orders':      renderMarketplaceOrders(); break;
          case 'ops-inventory':           renderInventory(); break;

          // ── Delivery ──
          case 'ops-projects':            renderProjects(); break;
          case 'ops-tasks':               renderTasks(); break;
          case 'marketing-presentations': renderPresentations(); break;
          case 'documents':               renderDocumentVault(); break;

          // ── Finance ──
          case 'fin-invoices':            renderInvoices(); break;
          case 'fin-payments':            renderPayments(); break;
          case 'fin-mpesa':               renderMpesaInline(); break;
          case 'fin-expenses':            renderExpenses(); break;
          case 'fin-payroll':             renderPayroll(); break;
          case 'ledger':                  renderLedger(); break;

          // ── Training ──
          case 'training-overview':       renderTrainingOverview(); break;
          case 'training-quizzes':        renderTrainingQuizzes(); break;
          case 'training-certificates':   renderTrainingCertificates(); break;
          case 'training-progress':       renderTrainingProgress(); break;

          // ── Partner / Personal ──
          case 'personal-todos':          renderPersonalTodos(); break;
          case 'personal-goals':          renderPersonalGoals(); break;
          case 'personal-skills':         renderPersonalSkills(); break;
          case 'partner-tasks':           renderPartnerTasks(); break;
          case 'partner-hourly':          renderPartnerHourly(); break;
          case 'partner-schedule':        renderPartnerSchedule(); break;
          case 'partner-handoffs':        renderPartnerHandoffs(); break;
          case 'partner-financials':      renderPartnerFinancials(); break;
          case 'partner-activities':      renderPartnerActivities(); break;
          case 'partner-chat':            renderPartnerChat(); break;
          case 'partner-presence':        renderPartnerPresence(); break;
          case 'partner-games':           renderPartnerGames(); break;
          
          case 'subscription-plans':
  renderSubscriptionPlans();
  break;

          // ── System ──
          case 'admin-employees':         renderEmployees(); break;
          case 'admin-assets':            renderAssets(); break;
          case 'admin-compliance':        renderCompliance(); break;
          case 'admin-users':             renderUsers(); break;
          case 'activity':                renderActivity(); break;
          case 'trash':                   renderTrash(); break;
          case 'orchestration':           renderOrchestrationPanel(); break;
          case 'archives':                renderArchivesPanel(); break;

          default:
            console.info('[renderActiveTab] no route for tab:', tab);
        }
      } catch (e) {
        console.error('[renderActiveTab]', tab, 'threw', e);
      }
      try { updateSidebarCounters(false); } catch (e) {}
    }

    setRenderActiveTabImpl(_renderActiveTabRouter);

    if (_renderers && typeof _renderers.scheduleMarketSync === 'function') {
      setScheduleMarketSyncImpl(_renderers.scheduleMarketSync);
    }

    /* ═══════════════════════════════════════════════════════════
       PHASE 2 — Boot the app
       ═══════════════════════════════════════════════════════════ */
    await bootApp();

    /* ═══════════════════════════════════════════════════════════
       PHASE 3 — Wire training subscriptions
       ═══════════════════════════════════════════════════════════ */
    function wireTrainingSubscriptions() {
      if (window.__vioraTrainingWired) return;
      window.__vioraTrainingWired = true;

      const TRAINING_PATHS = {
        trainingAccessRequests:   'training/accessRequests',
        trainingCourses:          'training/courses',
        trainingChecklists:       'training/checklists',
        trainingResources:        'training/resources',
        trainingEnrollments:      'training/enrollments',
        trainingProgress:         'training/progress',
        trainingCertificates:     'training/certificates',
        trainingQuizSubmissions:  'training/quizSubmissions',
        trainingCertTemplates:    'training/certificateTemplates',
        trainingCourseCompletions:'training/courseCompletions',
        trainingUsers:            'training/users',
      };

      for (const [key, path] of Object.entries(TRAINING_PATHS)) {
        const dbPath = P(path);
        onValue(ref(db, dbPath), snap => {
          state.data[key] = snap.exists() ? snap.val() : {};
          invalidateCountersFor(key);
          scheduleRender(true);
          if (state.notifOpen && typeof renderNotifications === 'function') {
            try { renderNotifications(); } catch (e) {}
          }
        }, err => {
          if (err && err.code !== 'PERMISSION_DENIED') {
            console.warn('[training-bridge] subscription failed for', path, err);
          }
        });
      }

      onValue(ref(db, P('subscriptions')), snap => {
        state.data.subscriptions = snap.exists() ? snap.val() : {};
        if (state.currentTab === 'subscriptions' && typeof renderSubscriptions === 'function') renderSubscriptions();
        invalidateCountersFor('subscriptions');
        scheduleRender(true);
      }, err => {
        if (err && err.code !== 'PERMISSION_DENIED') console.warn('[subs] listener failed', err);
      });
      
            onValue(ref(db, P('subscriptionRequests')), snap => {
        const raw = snap.exists() ? snap.val() : {};
        state.data.subscriptionRequests = Array.isArray(raw)
          ? raw
          : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
        invalidateCountersFor('subscriptionRequests');
        if (state.currentTab === 'subscription-plans' && typeof renderSubscriptionPlans === 'function') {
          renderSubscriptionPlans();
        }
        scheduleRender(true);
      }, err => {
        if (err && err.code !== 'PERMISSION_DENIED') console.warn('[subs-req] listener failed', err);
      });

      onValue(ref(db, P('licenses')), snap => {
        state.data.licenses = snap.exists() ? snap.val() : {};
        if (state.currentTab === 'subscriptions' && typeof renderSubscriptions === 'function') renderSubscriptions();
      }, err => {
        if (err && err.code !== 'PERMISSION_DENIED') console.warn('[lic] listener failed', err);
      });

      onValue(ref(db, `${ROOT}/users`), snap => {
        state.data.users = snap.exists()
          ? Object.entries(snap.val()).map(([uidKey, v]) => ({ uid: uidKey, ...v }))
          : [];
        scheduleRender(true);
      }, err => {
        if (err && err.code !== 'PERMISSION_DENIED') console.warn('[users] listener failed', err);
      });
      onValue(ref(db, P('portalUsers')), snap => {
        state.data.portalUsers = snap.exists()
          ? Object.entries(snap.val()).map(([uidKey, v]) => ({ uid: uidKey, ...v }))
          : [];
        scheduleRender(true);
      }, err => {
        if (err && err.code !== 'PERMISSION_DENIED') console.warn('[portalUsers] listener failed', err);
      });

         console.info('[training-bridge] subscribed to training/* paths');
    }

    /* ★ v9.2 — Marketplace → Leads pipeline bridge
       ─────────────────────────────────────────────────────
       The marketplace (market.html) writes `orders` and
       `marketLeads`. The admin listeners populate state.data,
       but nothing converted those records into `leads`.
       This bridge keeps that conversion running:
         • On every new marketLeads snapshot
         • On every new orders snapshot
         • On a 60s timer as a safety net
         • As the impl for scheduleMarketSync()
    */
    function wireMarketplaceLeadsPipeline() {
      if (window.__vioraMarketplaceLeadsWired) return;
      window.__vioraMarketplaceLeadsWired = true;

      let _syncing = false;
      const runSync = async () => {
        if (_syncing) return;
        if (!state.firebaseReady || !state.operator) return;
        _syncing = true;
        try {
          try { await syncMarketToLeads(); } catch (e) { console.warn('[market-sync] syncMarketToLeads', e); }
          try { await syncOrderLeads(); }    catch (e) { console.warn('[market-sync] syncOrderLeads', e); }
          try { await dedupeLeads(); }       catch (e) { console.warn('[market-sync] dedupeLeads', e); }
        } finally {
          _syncing = false;
        }
      };

      // 1. Wire scheduleMarketSync to actually do the work.
      setScheduleMarketSyncImpl(runSync);

      // 2. React to new marketplace records.
      try {
        onValue(ref(db, P('marketLeads')), () => {
          setTimeout(runSync, 600);
        }, () => {});
      } catch (e) { console.warn('[market-sync] marketLeads listener', e); }

      try {
        onValue(ref(db, P('orders')), () => {
          setTimeout(runSync, 900);
        }, () => {});
      } catch (e) { console.warn('[market-sync] orders listener', e); }

      // 3. Periodic safety net — once per minute while signed in.
      setInterval(() => {
        if (!document.hidden) runSync();
      }, 60_000);

      // 4. First run after boot drain releases.
      setTimeout(runSync, 4000);

      console.info('[market-sync] marketplace → leads pipeline wired');
    }

    try { wireTrainingSubscriptions(); }
    catch (e) { console.error('[viora] training bridge wiring failed:', e); }

    try { wireMarketplaceLeadsPipeline(); }
    catch (e) { console.error('[viora] marketplace leads pipeline wiring failed:', e); }
    /* ═══════════════════════════════════════════════════════════
       PHASE 4 — buildVioraHandlers
       ═══════════════════════════════════════════════════════════ */
      let _handlers = null;
    try {
      _handlers = buildVioraHandlers({
        db, auth, ref, set, get, remove, push, update, query, limitToLast,
        onValue, onChildAdded, onChildChanged, onChildRemoved,
        goOnline, goOffline,
        P, ROOT, WORKER_URL,
        state,
        $, toast, logActivity, logComm, callFn, setSyncStatus,
        openModal, closeModal, showModal, hideModal, openCmdPalette,
        vioraConfirm, vioraPrompt,
        applyLogoEverywhere,  // ← FIXED: was applyLogoEverything
        getLogoImg,
        addNotification: typeof surfaceVioraNotification === 'function' ? surfaceVioraNotification : null,
        surfaceVioraNotification,
        uid, todayStr, dateToStr, fmtDate, fmtDateTime, fmtKES, fmtUSD,
        usdToKes, kpiFormat, timeAgo, daysBetween, isOverdue, fmtBytes,
        escapeHtml, normalizePhone, normalizeEmail, simpleHash, emailToId,
        generateLicenseKey, isMobile, debounce, pickFile, pickFileMobileSplit,
        upsertDoc, deleteDoc, queueOfflineMutation,
        convertLeadToClientDeal,                    // ← ADD THIS LINE
        upsertPersonal, upsertTrackFlat, deletePersonal, deleteTrackFlat,
        EventBus, Orchester, Archiver, PushNotifications,
        AIRank, AIFiling, AIAnomaly,
        ORCHESTRATION_HANDOFFS, HANDLERS,
        getClients, getClient, getClientName, getEmployees,
       getProject, getProjectNumber: (id) => window.getProjectNumber?.(id) || '—', getProduct, getOrder, getLead,
        getClientProjects, getClientInvoices, getClientPayments,
        getClientDeals, getClientContracts, getClientTasks, getClientComms,
        getClientAppointments, getClientPresentations,
        getClientAgreedTotal, getClientBilledTotal, getClientPaidTotal,
        getClientRemainingTotal, getClientCreditTotal,
        getFeeSummary: _renderers?.getFeeSummary,
        getProjectAgreedTotal, getProjectBilledTotal, getProjectPaidTotal,
        getProjectRemainingTotal, getProjectFinancialProgress,
        getProjectOverpayment: (projectId) => {
          const agreed = getProjectAgreedTotal(projectId);
          const paid = getProjectPaidTotal(projectId);
          return agreed > 0 ? Math.max(0, paid - agreed) : 0;
        },
        recomputeProjectProgress, recomputeClientRollup,
        recomputeClientInstallments,
        getInvoicePaidAmount, getInvoiceTotals, getInvoiceStatusDerived,
        generateInvoiceNumber, nextProjectInvoiceNumber, buildInvoiceProgressMessage,
        reconcilePayment, onInvoicePaid, sendInvoiceReceipt,
        applyClientCreditToInvoice,
        getOverdueInstallments,
        getUpcomingInstallments,
        getProductSalesMetrics, getMarketplaceMetrics,
        renderActiveTab,
        renderAll,
        renderMarketplaceProducts, renderPublicUiProducts, renderMarketplaceOrders,
        renderMarketplaceAnalytics, renderMyOrders, renderMyWishlist,
        renderClients, renderClientCards, renderClient360Page,
        renderProjects, renderTasks, renderInventory,
        renderInvoices, renderPayments, renderLedger, renderExpenses, renderPayroll,
        renderLeads, renderDeals, renderPipelineKanban, renderContracts, renderProposals,
        renderAppointments, renderPresentations,
        renderEmployees, renderAssets, renderCompliance, renderUsers,
        renderDocumentVault, renderActivity, renderTrash,
        renderSupportTickets, renderPortalRequests, renderPortalUsers,
        renderClientsite, renderCommunications, renderMpesaInline,
        renderCampaigns,
        renderPartnerTasks, renderPartnerHourly, renderPartnerSchedule,
        renderPartnerHandoffs, renderPartnerFinancials, renderPartnerActivities,
        renderPartnerChat, renderPartnerPresence, renderPartnerGames,
        renderPersonalTodos, renderPersonalGoals, renderPersonalSkills,
        renderGoalMilestoneEditor,
        renderCharts, renderMarketplaceCharts, renderAdminAnalytics,
        renderClientAvatarPreview,
        renderProjectTasksEditor, renderProjectInstallmentEditor,
        renderClientProjectsFeeEditor,
        renderPresAttachments: _renderers?.renderPresAttachments,
        contactButtons, getEntityById, openCommModal, switchCommChannel,
        buildTemplates, updateCommPreview, sendComm, openCommFullPreview,
        openInvoiceViewModal, openPaymentModal, openStkModal,
        savePayment, deletePayment, deleteInvoice,
        findInvoiceCandidates, openManualMpesaMatch, confirmMpesaMatch,
        openServiceAgreementModal, attachServiceAgreement, transferProjectCredit,
        openFeesModal, openCreditTransfer, openPayChain, confirmPayChain,
        sendClientStatement, bulkRemind, openWelcomeEmailPreview, openClient360,
        openClientDocsModal: (...a) => Viora.openClientDocsModal?.(...a),
        viewClientDoc: (...a) => Viora.viewClientDoc?.(...a),
        downloadClientDoc: (...a) => Viora.downloadClientDoc?.(...a),
        deleteClientDoc: (...a) => Viora.deleteClientDoc?.(...a),
        openProjectDeliverables,
        openInvoiceGenModal, refreshInvoiceProjects, renderExtraCharges,
        removeCharge, updateInvoicePreview,
        renderPaymentProjectPicker, renderPaymentAllocation,
        updatePaymentSummary,
        openProposalStudio, generateProposalDraft, saveProposalDraft,
        proposalToVault, proposalToInvoice,
        openMpesaModal, processMpesaQueue, renderMpesaModal,
        renderOrchestrationPanel, renderArchivesPanel,
        attachVioraNotificationListener,
        renderNotifications, refreshRecommendations,
        addToWishlist, removeFromWishlist, buyFromWishlist,
        openManualSale, submitManualSale,
        updateManualSaleItem, removeManualSaleItem,
        openOrderDetail,
        viewTicket, closeTicketView, sendTicketReply, toggleTicketStatus,
        markTicketResolved, deleteTicket, getViewingTicketId,
        TrainingVioraAPI,
        openUserTraining:       (...a) => Viora.openUserTraining?.(...a),
        revokeTrainingCertImpl,
        approveTrainingRequest: (id) => Viora.approveTrainingRequest?.(id),
        rejectTrainingRequest:  (id) => Viora.rejectTrainingRequest?.(id),
        reopenTrainingRequest:  (id) => Viora.reopenTrainingRequest?.(id),
        SENDER_PHONE, SENDER_EMAIL, MAX_FILE_SIZE, APP_VERSION,
        BUSINESS_COLLECTIONS,
        PP, SubscriptionsAdmin, AutoCertification,
        T: (window.VioraTraining || window.T || null),
        MOBILE_NAV_MAP,
        setNavMode,
        openGroupForTab,
        closeSidebar: () => {
          const sb = document.getElementById('sidebar');
          const so = document.getElementById('sidebarOverlay');
          if (sb) sb.classList.remove('open');
          if (so) so.classList.remove('active');
          document.body.classList.remove('mob-drawer-open');
        },
        updateMobileSubChips,
        setupGlobalMarket,
        loadGlobalDashboard,
        handleClientDocUpload: (f) => {
          if (typeof window.handleClientDocUpload === 'function') return window.handleClientDocUpload(f);
        },
      });
        } catch (e) {
      console.error('[viora] buildVioraHandlers:', e);
    }

    /* ═══════════════════════════════════════════════════════════
       ★★★ FIX #1 — APPLY _handlers TO Viora ★★★
       Without this, Viora.navigate is never installed and every
       sidebar click silently does nothing.
       ═══════════════════════════════════════════════════════════ */
    if (_handlers) {
      try {
        Object.assign(Viora, _handlers);
        window.Viora = Viora;
        console.info(
          '%c[viora] ✅ Viora handlers installed — ' + Object.keys(Viora).length + ' methods',
          'color:#22e6a0;font-weight:700'
        );
      } catch (e) {
        console.error('[viora] Object.assign(Viora, _handlers) failed:', e);
      }
    } else {
      console.error('[viora] ⚠️ buildVioraHandlers returned null — sidebar will not work');
    }

     /* ═══════════════════════════════════════════════════════════
       FORCE-ROUTER FALLBACK
       Wraps Viora.navigate so every click renders its tab.
       Installed AFTER buildVioraHandlers has populated Viora.*,
       so Viora.navigate exists and we can wrap it.
       ═══════════════════════════════════════════════════════════ */
     (function _installForceRouterFallback() {
      if (window.__vioraForceRouterInstalled) return;
      window.__vioraForceRouterInstalled = true;

      const ROUTES = {
        'dashboard':               'renderDashboard',
        'profile':                 'renderProfile',
        'sales-clients':           'renderClients',
        'client360':               'renderClient360Page',
        'sales-deals':             'renderDeals',
        'sales-pipeline':          'renderPipelineKanban',
        'sales-proposals':         'renderProposals',
        'sales-contracts':         'renderContracts',
        'marketing-leads':         'renderLeads',
        'marketing-appointments':  'renderAppointments',
        'marketing-presentations': 'renderPresentations',
    
        'ops-projects':            'renderProjects',
        'ops-tasks':               'renderTasks',
        'ops-inventory':           'renderInventory',
        'fin-invoices':            'renderInvoices',
        'fin-payments':            'renderPayments',
        'fin-expenses':            'renderExpenses',
        'fin-payroll':             'renderPayroll',
        'fin-mpesa':               'renderMpesaInline',
        'ledger':                  'renderLedger',
        'admin-employees':         'renderEmployees',
        'admin-assets':            'renderAssets',
        'admin-compliance':        'renderCompliance',
        'admin-users':             'renderUsers',
        'activity':                'renderActivity',
        'trash':                   'renderTrash',
        'documents':               'renderDocumentVault',
        'support-tickets':         'renderSupportTickets',
        'portal-requests':         'renderPortalRequests',
        'portal-users':            'renderPortalUsers',
        'marketplace-products':    'renderMarketplaceProducts',
        'marketplace-orders':      'renderMarketplaceOrders',
        'marketplace-analytics':   'renderMarketplaceAnalytics',
        'personal-wishlist':       'renderMyWishlist',
        'personal-orders':         'renderMyOrders',
        'subscriptions':           'renderSubscriptions',
        'market-content':          'renderMarketContent',
        'clientsite':              'renderClientsite',
        'training-overview':       'renderTrainingOverview',
        'training-quizzes':        'renderTrainingQuizzes',
        'training-certificates':   'renderTrainingCertificates',
        'training-progress':       'renderTrainingProgress',
        'orchestration':           'renderOrchestrationPanel',
        'archives':                'renderArchivesPanel',
        'personal-todos':          'renderPersonalTodos',
        'personal-goals':          'renderPersonalGoals',
        'personal-skills':         'renderPersonalSkills',
        'partner-tasks':           'renderPartnerTasks',
        'partner-hourly':          'renderPartnerHourly',
        'partner-schedule':        'renderPartnerSchedule',
        'partner-handoffs':        'renderPartnerHandoffs',
        'partner-financials':      'renderPartnerFinancials',
        'partner-activities':      'renderPartnerActivities',
        'partner-chat':            'renderPartnerChat',
        'partner-presence':        'renderPartnerPresence',
        'partner-games':           'renderPartnerGames',
      };

      /* CENTRAL SCROLL RESET — used by every navigation path */
      function _resetSidebarScroll() {
        const navEl = document.querySelector('.sidebar nav');
        if (navEl && navEl.scrollTop !== 0) {
          navEl.scrollTo({ top: 0, behavior: 'instant' });
        }
        const sbEl = document.querySelector('.sidebar');
        if (sbEl && sbEl.scrollTop !== 0) {
          sbEl.scrollTo({ top: 0, behavior: 'instant' });
        }
        const mcEl = document.querySelector('.main-content');
        if (mcEl && mcEl.scrollTop !== 0) {
          mcEl.scrollTo({ top: 0, behavior: 'instant' });
        }
        if (window.scrollY !== 0) window.scrollTo(0, 0);
      }

      const origNavigate = Viora.navigate;
      if (typeof origNavigate !== 'function') {
        console.warn('[viora] force-router: Viora.navigate not yet defined — cannot wrap');
        return;
      }

      Viora.navigate = function (tab, opts) {
        const result = origNavigate.call(this, tab, opts);
        requestAnimationFrame(() => {
          // Special cases
          if (tab === 'marketplace-products') {
            try { window.renderMarketplaceProducts?.(); } catch (e) { console.warn(e); }
            try { window.renderPublicUiProducts?.(); } catch (e) { console.warn(e); }
          } else if (tab === 'global-market') {
            try { window.setupGlobalMarket?.(); window.loadGlobalDashboard?.(); } catch (e) { console.warn(e); }
          } else if (tab === 'product-presentation') {
            try { window.PP?.subscribe?.(); } catch (e) { console.warn(e); }
          } else {
            const fnName = ROUTES[tab];
            if (fnName && typeof window[fnName] === 'function') {
              try { window[fnName](); } catch (e) { console.warn('[force-render]', fnName, e); }
            }
          }

          /* FIX: reset nav scroll after every navigation */
          _resetSidebarScroll();

          try { window.updateSidebarCounters?.(); } catch (e) {}
        });

        /* Double reset — some focus() calls happen a tick late */
        setTimeout(_resetSidebarScroll, 0);
        setTimeout(_resetSidebarScroll, 50);

        return result;
      };

      /* Expose for group-toggle handler to use */
      window.__vioraResetSidebarScroll = _resetSidebarScroll;

      console.log(
        '%c[viora] ✅ Force-router + scroll-reset installed — %d routes',
        'color:#22e6a0;font-weight:700',
        Object.keys(ROUTES).length
      );
    })();

    /* ═══════════════════════════════════════════════════════════
       PHASE 5 — initMainWiring
       ═══════════════════════════════════════════════════════════ */
    let _wiring = null;
    try {
      _wiring = initMainWiring({
        db, auth, ref, set, get, remove, push, update, query, limitToLast,
        onValue, onChildAdded, onChildChanged, onChildRemoved,
        goOnline, goOffline,
        P, ROOT, WORKER_URL,
        state,
        $, toast, logActivity, logComm, callFn, setSyncStatus,
        openModal, closeModal, showModal, hideModal, openCmdPalette,
        vioraConfirm, vioraPrompt,
        applyLogoEverywhere,  // ← FIXED: was applyLogoEverything
        getLogoImg,
        surfaceVioraNotification,
        uid, todayStr, dateToStr, fmtDate, fmtDateTime, fmtKES, fmtUSD,
        usdToKes, kpiFormat, timeAgo, daysBetween, isOverdue, fmtBytes,
        escapeHtml, normalizePhone, normalizeEmail, simpleHash, emailToId,
        generateLicenseKey, isMobile, debounce, pickFile, pickFileMobileSplit,
        upsertDoc, deleteDoc, queueOfflineMutation,
        upsertPersonal, upsertTrackFlat, deletePersonal, deleteTrackFlat,
        EventBus, Orchester, Archiver, PushNotifications, PP,
        AIRank, AIFiling, AIAnomaly,
        getClients, getClient, getClientName, getEmployees,
   getProject, getProjectNumber: (id) => window.getProjectNumber?.(id) || '—', getProduct, getOrder, getLead,
        getClientProjects, getClientInvoices, getClientPayments,
        getClientDeals, getClientContracts, getClientTasks, getClientComms,
        getClientAppointments, getClientPresentations,
        getClientAgreedTotal, getClientBilledTotal, getClientPaidTotal,
        getClientRemainingTotal, getClientCreditTotal,
        getProjectAgreedTotal, getProjectBilledTotal, getProjectPaidTotal,
        getProjectFinancialProgress,
        recomputeProjectProgress, recomputeClientRollup,
        getInvoicePaidAmount, getInvoiceTotals, getInvoiceStatusDerived,
        generateInvoiceNumber, nextProjectInvoiceNumber, buildInvoiceProgressMessage,
        reconcilePayment, onInvoicePaid, sendInvoiceReceipt,
        applyClientCreditToInvoice,
        getFeeSummary: _renderers?.getFeeSummary,
        getOverdueInstallments,
        getUpcomingInstallments,
        getProductSalesMetrics, getMarketplaceMetrics,
        renderActiveTab,
        renderAll,
        renderMarketplaceProducts, renderPublicUiProducts, renderMarketplaceOrders,
        renderMarketplaceAnalytics, renderMyOrders, renderMyWishlist,
        renderClients, renderClientCards, renderClient360Page,
        renderProjects, renderTasks, renderInventory,
        renderInvoices, renderPayments, renderLedger, renderExpenses, renderPayroll,
        renderLeads, renderDeals, renderPipelineKanban, renderContracts, renderProposals,
        renderAppointments, renderPresentations,
        renderEmployees, renderAssets, renderCompliance, renderUsers,
        renderDocumentVault, renderActivity, renderTrash,
        renderSupportTickets, renderPortalRequests, renderPortalUsers,
        renderClientsite, renderDashboard, renderCommunications, renderMpesaInline,
        renderCampaigns,
        renderPartnerTasks, renderPartnerHourly, renderPartnerSchedule,
        renderPartnerHandoffs, renderPartnerFinancials, renderPartnerActivities,
        renderPartnerChat, renderPartnerPresence, renderPartnerGames,
        renderPersonalTodos, renderPersonalGoals, renderPersonalSkills,
        renderGoalMilestoneEditor,
        renderCharts, renderMarketplaceCharts, renderAdminAnalytics,
        renderClientAvatarPreview,
        renderProjectTasksEditor, renderProjectInstallmentEditor,
        renderClientProjectsFeeEditor,
        renderPresAttachments: _renderers?.renderPresAttachments,
        contactButtons, getEntityById, openCommModal, switchCommChannel,
        buildTemplates, updateCommPreview, sendComm, openCommFullPreview,
        openInvoiceViewModal, openPaymentModal, openStkModal,
        savePayment, deletePayment, deleteInvoice,
        findInvoiceCandidates, openManualMpesaMatch, confirmMpesaMatch,
        openServiceAgreementModal, attachServiceAgreement, transferProjectCredit,
        openFeesModal, openCreditTransfer, openPayChain, confirmPayChain,
        sendClientStatement, bulkRemind, openWelcomeEmailPreview, openClient360,
        openProjectDeliverables,
        openInvoiceGenModal, refreshInvoiceProjects, renderExtraCharges,
        removeCharge, updateInvoicePreview,
        renderPaymentProjectPicker, renderPaymentAllocation,
        updatePaymentSummary,
        openProposalStudio, generateProposalDraft, saveProposalDraft,
        proposalToVault, proposalToInvoice,
        openMpesaModal, processMpesaQueue, renderMpesaModal,
        renderOrchestrationPanel, renderArchivesPanel,
        attachVioraNotificationListener,
        renderNotifications, refreshRecommendations,
        addToWishlist, removeFromWishlist, buyFromWishlist,
        openManualSale, submitManualSale,
        updateManualSaleItem, removeManualSaleItem,
        openOrderDetail,
        viewTicket, closeTicketView, sendTicketReply, toggleTicketStatus,
        markTicketResolved, deleteTicket, getViewingTicketId,
        TrainingVioraAPI,
        openUserTraining:       (...a) => Viora.openUserTraining?.(...a),
        revokeTrainingCertImpl,
        approveTrainingRequest: (id) => Viora.approveTrainingRequest?.(id),
        rejectTrainingRequest:  (id) => Viora.rejectTrainingRequest?.(id),
        reopenTrainingRequest:  (id) => Viora.reopenTrainingRequest?.(id),
        SENDER_PHONE, SENDER_EMAIL, MAX_FILE_SIZE, APP_VERSION,
        BUSINESS_COLLECTIONS,
        PP, SubscriptionsAdmin, AutoCertification,
        T: (window.VioraTraining || window.T || null),
        Viora,
        MOBILE_NAV_MAP,
        setNavMode,
        openGroupForTab,
        updateMobileSubChips,
        exportCsv,
        openJournalModal,
        renderJeLines,
        updateJeBalance,
        postJournalEntry,
        doSignOut,
        setMobileCategory,
        initSidebarGroups,
        renderNavQueues,
        renderDashboardNotifications: window.renderDashboardNotifications,
        initDashboardNotifications:   window.initDashboardNotifications,
        renderMarketContent,
        bindPPEvents,
        bindMarketContentEvents,
              startCampaignStatsAutoRefresh: () => {},
        renderMsProductsList,
        renderMsSummary,
        applyCampMediaTypeUI: () => {},
        fetchCampaignStats: () => {},
        renderCampaignStats: () => {},
        connectTikTok: () => {},
        refreshAllCampaignStats: () => {},
      });
    } catch (e) {
      console.error('[viora] initMainWiring:', e);
    }

    if (_wiring) {
      _attachEventsImpl = _wiring.attachEvents;
      _attachFormsImpl  = _wiring.attachForms;
    }

    /* ═══════════════════════════════════════════════════════════
       PHASE 6 — Bind sub-modules + wiring
       ═══════════════════════════════════════════════════════════ */
    requestAnimationFrame(() => {
      try {
        if (typeof window.__vioraWireSubModules === 'function') {
          window.__vioraWireSubModules();
        }
      } catch (e) {
        console.error('[viora] sub-module wiring failed (continuing):', e);
      }

      setTimeout(() => {
        try { bindTrainingEvents(); console.info('[viora] training events bound'); }
        catch (e) { console.warn('[viora] bindTrainingEvents failed:', e); }
      }, 100);

       try {
        if (_wiring) {
          _wiring.attachEvents();
          _wiring.attachForms();
          _wiring.bindSafetyNets();
          console.info('[viora] main wiring bound');
        }
      } catch (e) {
        console.error('[viora] main wiring failed:', e);
      }
    });

    /* ═══════════════════════════════════════════════════════════
       PHASE 7 — Explicit sidebar + notifications init
       Guarantees initSidebarGroups() and renderNavQueues() run,
       so nav-mode buttons and queue items always have handlers.
       ═══════════════════════════════════════════════════════════ */
    try {
      if (typeof initSidebarGroups === 'function') {
        initSidebarGroups();
        console.info('[viora] ✅ sidebar groups initialized');
      }
    } catch (e) { console.error('[viora] initSidebarGroups failed:', e); }

    try {
      if (typeof renderNavQueues === 'function') {
        renderNavQueues();
        console.info('[viora] ✅ nav queues rendered');
      }
    } catch (e) { console.error('[viora] renderNavQueues failed:', e); }

    try {
      if (typeof initDashboardNotifications === 'function') {
        initDashboardNotifications();
        console.info('[viora] ✅ dashboard notifications initialized');
      } else if (typeof window.initDashboardNotifications === 'function') {
        window.initDashboardNotifications();
        console.info('[viora] ✅ dashboard notifications initialized (fallback)');
      }
    } catch (e) { console.error('[viora] initDashboardNotifications failed:', e); }

    try {
      if (typeof updateSidebarCounters === 'function') {
        updateSidebarCounters(true);
      }
    } catch (e) { console.warn('[viora] updateSidebarCounters failed:', e); }

    /* ═══════════════════════════════════════════════════════════
       PHASE 8 — Self-healing direct binders
       Guarantees every nav control responds even if the primary
       wiring chain failed. Runs on next tick, after DOM settles.
       ═══════════════════════════════════════════════════════════ */
    setTimeout(() => {
      document.querySelectorAll('.modal-overlay.active').forEach(m => {
        if (m.id && !m.id.startsWith('___')) {
          console.log('[viora-cleanup] removing stuck overlay:', m.id || '(unnamed)');
          m.classList.remove('active');
        }
      });
      document.body.classList.remove('mob-drawer-open');

      let bound = 0;

      // 1. Nav-mode switcher
      document.querySelectorAll('#navModeSwitcher .nav-mode-btn').forEach(btn => {
        if (btn._vioraNavModeBound) return;
        btn._vioraNavModeBound = true;
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const mode = btn.dataset.mode;
          console.log('[viora-mode-click] →', mode);
          try {
            if (typeof setNavMode === 'function') setNavMode(mode);
          } catch (err) { console.error('[viora-mode-click] failed:', err); }
        }, true);
        bound++;
      });

         // 2. Sidebar nav links
      document.querySelectorAll('.sidebar nav a[data-tab]').forEach(a => {
        if (a._vioraNavDirectBound) return;
        a._vioraNavDirectBound = true;
        a.style.pointerEvents = 'auto';
        a.addEventListener('click', (e) => {
          if (a.dataset.external === 'true') return;   // ← let the browser navigate
          e.preventDefault();
          e.stopPropagation();
          const tab = a.dataset.tab;
          console.log('[viora-link-click] →', tab);
          try {
            if (window.Viora && typeof Viora.navigate === 'function') {
              Viora.navigate(tab);
            }
          } catch (err) { console.error('[viora-link-click] failed:', err); }
        }, true);
        bound++;
      });

      // 3. Group toggles
      document.querySelectorAll('.sb-group-toggle').forEach(btn => {
        if (btn._vioraGroupBound) return;
        btn._vioraGroupBound = true;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const wrap = btn.closest('.sb-group-wrap');
          if (!wrap) return;
          const isOpen = wrap.classList.toggle('open');
          btn.setAttribute('aria-expanded', String(isOpen));
          console.log('[viora-group-click]', wrap.dataset.group, isOpen);
          if (typeof window.__vioraResetSidebarScroll === 'function') {
            requestAnimationFrame(window.__vioraResetSidebarScroll);
          }
        }, true);
        bound++;
      });

      // 4. Queue items
      document.querySelectorAll('.nav-queue-item').forEach(el => {
        if (el._vioraQueueBound2) return;
        el._vioraQueueBound2 = true;
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const tab = el.dataset.tab;
          if (!tab) return;
          console.log('[viora-queue-click] →', tab);
          if (window.state) window.state._activeQueueId = el.dataset.queueId;
          if (window.Viora && typeof Viora.navigate === 'function') {
            Viora.navigate(tab, { fromQueue: true });
          }
        }, true);
        bound++;
      });

          // 5. Mobile bottom nav
      document.querySelectorAll('#mobileBottomNav .mnav-item').forEach(el => {
        if (el._vioraMnavBound) return;
        el._vioraMnavBound = true;
        el.addEventListener('click', (e) => {
          const cat = el.dataset.mnav;
          if (cat === 'more') {
            document.getElementById('sidebar')?.classList.add('open');
            document.getElementById('sidebarOverlay')?.classList.add('active');
            document.body.classList.add('mob-drawer-open');
          } else if (typeof setMobileCategory === 'function') {
            setMobileCategory(cat);
          }
        }, true);
        bound++;
      });

      // 6. FIX: #addClientBtn ("New" button) — was never bound
      (function bindAddClientBtn() {
        const btn = document.getElementById('addClientBtn');
        if (!btn || btn._vioraAddClientBound) return;
        btn._vioraAddClientBound = true;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('[viora] addClientBtn clicked');
          try {
            if (window.Viora && typeof Viora.addClient === 'function') {
              Viora.addClient();
            } else {
              console.warn('[viora] Viora.addClient is not available');
            }
          } catch (err) {
            console.error('[viora] addClientBtn handler threw:', err);
          }
        }, true);
        bound++;
        console.log('[viora] ✅ addClientBtn bound');
      })();

      // 7. Belt-and-suspenders: MutationObserver for late-rendered
      //    elements that also might be missing handlers
      if (!window.__vioraAddClientObserver) {
        window.__vioraAddClientObserver = new MutationObserver(() => {
          const btn = document.getElementById('addClientBtn');
          if (btn && !btn._vioraAddClientBound) {
            btn._vioraAddClientBound = true;
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[viora] addClientBtn clicked (late-bind)');
              try {
                if (window.Viora && typeof Viora.addClient === 'function') {
                  Viora.addClient();
                }
              } catch (err) {
                console.error('[viora] addClientBtn (late) threw:', err);
              }
            }, true);
            console.log('[viora] ✅ addClientBtn bound (late)');
          }
        });
        window.__vioraAddClientObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
      }

      console.info(`[viora] ✅ Phase 8 direct binders: ${bound} handlers installed`);
    }, 800);
  }

  requestAnimationFrame(runBoot);
}

/* ═══════════════════════════════════════════════════════════════
   SUB-MODULE WIRING
   ═══════════════════════════════════════════════════════════════ */
window.__vioraWireSubModules = function () {
  // Campaign auto-refresh moved to campaigns.html
};


/* ═══════════════════════════════════════════════════════════
   WINDOW EXPOSURE (hardened — one bad key cannot kill the rest)
   ═══════════════════════════════════════════════════════════ */
(function exposeWindow() {
  const EXPORTS = {
      // ── renderAll / tab plumbing ──
    renderAll, renderActiveTab,
    buildNotifications, renderNotifications, surfaceVioraNotification,
    attachVioraNotificationListener,
    buildLocalRecommendations, renderRecommendations, refreshRecommendations,
    renderDashboard, renderAdminAnalytics, renderProfile, renderClientsite,
    bootDashboardWeather, stopDashboardWeather, refreshWeather,
    openLocationPicker, loadWeatherLocation, saveWeatherLocation,
    renderDashboardKpis, renderDashboardAttention,

    // ── admin registers ──
    renderEmployees, renderAssets, renderCompliance, renderUsers,
    renderDocumentVault, renderActivity, renderTrash,
    renderSupportTickets, viewTicket, closeTicketView, sendTicketReply,
    toggleTicketStatus, markTicketResolved, deleteTicket,
    renderPortalRequests, renderPortalUsers, getViewingTicketId,

    // ── pipeline ──
    renderLeads, renderDeals, renderPipelineKanban, renderProposals,
    renderContracts, renderAppointments, renderPresentations,

    // ── delivery ──
    renderProjects, renderTasks, renderInventory,
    renderProjectTasksEditor, renderProjectInstallmentEditor,
    removeProjectInstallment, renderClientProjectsFeeEditor,

    // ── clients ──
    renderClients, renderClientCards, renderClient360Page,
    renderClientAvatarPreview,
    generateClientReport, downloadReportPdf, buildClientStatementPdf,
    getProjectAgreedTotal, getProjectBilledTotal, getProjectPaidTotal,
    getProjectRemainingTotal, getProjectFinancialProgress,
    recomputeProjectProgress, bulkGenerateTasksForClient,

    // ── finance ──
    renderInvoices, renderPayments, renderLedger, renderExpenses, renderPayroll,
    getInvoicePaidAmount, getInvoiceTotals, getInvoiceStatusDerived,
    generateInvoiceNumber, nextProjectInvoiceNumber, buildInvoiceProgressMessage,
    reconcilePayment, onInvoicePaid, sendInvoiceReceipt,
    applyClientCreditToInvoice,
    openPayChain, confirmPayChain,
    openPaymentModal, renderPaymentProjectPicker, renderPaymentAllocation,
    updatePaymentSummary, savePayment, deletePayment,
    openInvoiceGenModal, refreshInvoiceProjects, renderExtraCharges,
    removeCharge, updateInvoicePreview,
    openInvoiceViewModal, deleteInvoice,
    openStkModal, sendStkPush,
    openMpesaModal, findInvoiceCandidates, autoMatchMpesa, applyMpesaMatch,
    processMpesaQueue, renderMpesaModal, openManualMpesaMatch, confirmMpesaMatch,
    renderMpesaInline,
    openServiceAgreementModal, attachServiceAgreement, sendClientStatement,
    transferProjectCredit, openFeesModal, openCreditTransfer, bulkRemind,

       // ── marketplace ──
    getMarketplaceMetrics, getProductSalesMetrics,
    invalidateMarketAnalytics, computeMarketAnalytics, materializeMarketplaceLeads,
    dedupeLeads, syncMarketToLeads, syncOrderLeads,   // ★ NEW
    renderMarketplaceProducts, renderPublicUiProducts, renderMarketplaceOrders,
    renderMarketplaceAnalytics, renderMyOrders, renderMyWishlist, openOrderDetail,
      
    openManualSale, renderMsProductsList, renderMsSummary,
    updateManualSaleItem, removeManualSaleItem, submitManualSale,
    addToWishlist, removeFromWishlist, buyFromWishlist,

    // ── charts ──
    getTextColor, destroyChart, safeCanvas, renderCharts, renderMarketplaceCharts,

    // ── global market ──
    setupGlobalMarket, loadGlobalDashboard,

    // ── misc / journal / proposals ──
    exportCsv, openJournalModal, renderJeLines, updateJeBalance, postJournalEntry,
    openProposalStudio, generateProposalDraft, saveProposalDraft,
    proposalToVault, proposalToInvoice,

    // ── partner ──
    renderPartnerTasks, renderPartnerHourly, renderPartnerSchedule,
    renderPartnerHandoffs, renderPartnerFinancials, renderPartnerActivities,
    renderPartnerChat, renderPartnerPresence, renderPartnerGames,

    // ── personal ──
    renderPersonalTodos, renderPersonalGoals, renderPersonalSkills,
    renderGoalMilestoneEditor, computeGoalProgress, personalOwnerFilter,

    // ── training ──
    renderTrainingOverview, renderTrainingRequests, renderTrainingUsers,
    renderTrainingProgress, renderTrainingQuizzes, renderTrainingCertificates,
    viewQuizSubmission, openCourseEditor, renderCeModules, toggleCeQuiz,
    addQuizQuestion, removeQuizQuestion, updateQuizQuestion, updateQuizOption,
    setQuizAnswer, addQuizOption, removeQuizOption,
    updateCeModule, addCeModule, removeCeModule, moveCeModule,
    saveCourse, deleteCourse, openChecklistEditor, renderCleTasks,
    updateCleTask, addCleTask, removeCleTask, saveChecklist,
    openResourceEditor, handleReFile, saveResource, deleteResource,
    openResourceFile, awardTrainingCertificate, viewTrainingCert,
    renderCertTemplatesGrid, openCertTemplateEditor, refreshCertTemplateModules,
    showCertTemplatePreview, paintCertTemplateStamps, saveCertTemplate,
    deleteCertTemplate, renderCertificateImage, openManualAwardModal,
    setupCertStampDragging, bindTrainingEvents, setTrainingContext,

    // ── command palette ──
    openCmdPalette, setupCommandPalette,

    // ── comms ──
    renderCommunications, openCommModal, switchCommChannel,
    buildTemplates, updateCommPreview, sendComm, openCommFullPreview,
    contactButtons, getEntityById, openWelcomeEmailPreview, openClient360,

        // ── misc plumbing ──
    updateSidebarCounters, invalidateCountersFor, scheduleMarketSync,
    dedupeAllCollections, applyLogoEverywhere,
    scheduleRender,
    SubscriptionsAdmin,

    // ➕ NEW — marketplace admin helpers
    savePromos,
    saveProductExtras,

    // ── installments ──
    getOverdueInstallments,
    getUpcomingInstallments,

    // ── CRITICAL: main.js-local (were never exposed when block threw) ──
    getProject, getProduct, getOrder, getLead,
        applyRoleGating,
    setNavMode, openGroupForTab,
    setMobileCategory, updateMobileSubChips,
    renderSubscriptions,
    renderMarketContent,
    renderOrchestrationPanel,
    renderArchivesPanel,
    renderNavQueues,
    initSidebarGroups,
    initDashboardNotifications,
    renderDashboardNotifications,
    doSignOut,
  };

  /* Expose every value INDEPENDENTLY — one bad value cannot
     prevent the rest from being installed. */
  let installed = 0;
  let skipped = 0;
  for (const [name, value] of Object.entries(EXPORTS)) {
    try {
      if (typeof value === 'function') {
        window[name] = value;
        installed++;
      } else {
        skipped++;
      }
    } catch (e) {
      console.warn(`[viora/expose] could not expose window.${name}:`, e.message);
    }
  }
  console.info(`[viora/expose] exposed ${installed} functions (${skipped} non-functions skipped)`);

  /* Hard fallbacks — guarantee these are NEVER missing */
  if (typeof window.getProject !== 'function') {
    window.getProject = id => (state.data.projects || []).find(p => p && p.id === id);
  }
  if (typeof window.getProduct !== 'function') {
    window.getProduct = id => (state.data.products || []).find(p => p && p.id === id);
  }
  if (typeof window.getOrder !== 'function') {
    window.getOrder = id => (state.data.orders || []).find(o => o && o.id === id);
  }
  if (typeof window.getLead !== 'function') {
    window.getLead = id => (state.data.leads || []).find(l => l && l.id === id);
  }
  if (typeof window.getProjectNumber !== 'function') {
    window.getProjectNumber = id => {
      const p = window.getProject ? window.getProject(id) : null;
      return (p && p.projectNumber) || '—';
    };
  }
  if (typeof window.applyRoleGating !== 'function') {
    window.applyRoleGating = function () {
      document.querySelectorAll('.sidebar nav a[data-roles]').forEach(a => {
        try {
          const roles = (a.dataset.roles || 'all');
          if (roles === 'all') return;
          const role = (window.state && window.state.operator && window.state.operator.role) || 'exec';
          const allowed = role === 'exec' || role === 'admin' ||
            roles.split(',').map(s => s.trim()).includes(role);
          a.classList.toggle('rbac-hidden', !allowed);
        } catch (_) {}
      });
      const rb = document.getElementById('roleBadge');
      if (rb) rb.textContent = ((window.state?.operator?.role) || 'exec').toUpperCase();
      const rbm = document.getElementById('roleBadgeMobile');
      if (rbm) rbm.textContent = ((window.state?.operator?.role) || 'exec').toUpperCase();
    };
  }
})();

try {
  Object.assign(Viora, {
    updateCeModule:      (...a) => updateCeModule(...a),
    addCeModule:         (...a) => addCeModule(...a),
    removeCeModule:      (...a) => removeCeModule(...a),
    moveCeModule:        (...a) => moveCeModule(...a),
    toggleCeQuiz:        (...a) => toggleCeQuiz(...a),
    addQuizQuestion:     (...a) => addQuizQuestion(...a),
    removeQuizQuestion:  (...a) => removeQuizQuestion(...a),
    updateQuizQuestion:  (...a) => updateQuizQuestion(...a),
    updateQuizOption:    (...a) => updateQuizOption(...a),
    setQuizAnswer:       (...a) => setQuizAnswer(...a),
    addQuizOption:       (...a) => addQuizOption(...a),
    removeQuizOption:    (...a) => removeQuizOption(...a),
    updateCleTask:       (...a) => updateCleTask(...a),
    addCleTask:          (...a) => addCleTask(...a),
    removeCleTask:       (...a) => removeCleTask(...a),
    editCourse:          (id) => openCourseEditor(id),
    editChecklist:       (id) => openChecklistEditor(id),
    editResource:        (id) => openResourceEditor(id),
    saveCourse:          (...a) => saveCourse(...a),
    deleteCourse:        (...a) => deleteCourse(...a),
    saveChecklist:       (...a) => saveChecklist(...a),
    saveResource:        (...a) => saveResource(...a),
    deleteResource:      (...a) => deleteResource(...a),
    openResourceFile:    (...a) => openResourceFile(...a),
    handleReFile:        (...a) => handleReFile(...a),
    viewQuizSubmission:  (...a) => viewQuizSubmission(...a),
    openCertTemplateEditor:     (...a) => openCertTemplateEditor(...a),
    saveCertTemplate:           (...a) => saveCertTemplate(...a),
    deleteCertTemplate:         (...a) => deleteCertTemplate(...a),
    refreshCertTemplateModules: (...a) => refreshCertTemplateModules(...a),
    showCertTemplatePreview:    (...a) => showCertTemplatePreview(...a),
    paintCertTemplateStamps:    (...a) => paintCertTemplateStamps(...a),
    openManualAwardModal:       (...a) => openManualAwardModal(...a),
    awardTrainingCertificate:   (...a) => awardTrainingCertificate(...a),
    viewTrainingCert:           (...a) => viewTrainingCert(...a),
    revokeTrainingCert:         (id) => revokeTrainingCertImpl(id),
  });
} catch (e) {
  console.error('[viora] Viora exposure failed:', e);
}

/* ═══════════════════════════════════════════════════════════════
   NAMESPACE UNIFICATION — expose utility functions on Viora.*
   so that inline onclick handlers, the audit contract, and the
   architecture flowchart all agree on a single namespace.

   Everything below already exists somewhere:
     - on window.*          (utilities + some renderers)
     - on window._renderers (renderer registry)
     - on window.TrainingVioraAPI (training mutators)
   We are simply aliasing them under Viora.*.
   ═══════════════════════════════════════════════════════════════ */
try {
  const _renderers = window.__vioraRenderers || {};
  const _training  = window.VioraTrainingAPI || {};

  Object.assign(Viora, {
    // ── Finance utilities (were on window.*) ──
    getInvoiceTotals:        window.getInvoiceTotals        || Viora.getInvoiceTotals,
    getInvoiceStatusDerived: window.getInvoiceStatusDerived || Viora.getInvoiceStatusDerived,
    generateInvoiceNumber:   window.generateInvoiceNumber   || Viora.generateInvoiceNumber,
    onInvoicePaid:           window.onInvoicePaid           || Viora.onInvoicePaid,
    getInvoicePaidAmount:    window.getInvoicePaidAmount    || Viora.getInvoicePaidAmount,
    addInvoice:              window.openInvoiceGenModal     || Viora.openInvoiceGenModal,

    // ── Confirmation dialogs (were on window.*) ──
    vioraConfirm:            window.vioraConfirm            || Viora.vioraConfirm,
    vioraPrompt:             window.vioraPrompt             || Viora.vioraPrompt,
    callFn:                  window.callFn                  || Viora.callFn,
    vioraNotify:             window.vioraNotify             || Viora.vioraNotify,

    // ── Renderers that lived only on window.* or _renderers ──
    renderMarketContent:        window.renderMarketContent        || Viora.renderMarketContent,
    renderOrchestrationPanel:   window.renderOrchestrationPanel   || Viora.renderOrchestrationPanel,
    renderArchivesPanel:        window.renderArchivesPanel        || Viora.renderArchivesPanel,
    renderSubscriptions:        window.renderSubscriptions        || Viora.renderSubscriptions,
    renderPresAttachments:      _renderers.renderPresAttachments  || Viora.renderPresAttachments,

    // ── Misc renderers/handlers that were on window.* ──
    openJournal:                window.openJournalModal     || Viora.openJournalModal,
    postJournalEntry:           window.postJournalEntry     || Viora.postJournalEntry,
    refreshAllCampaignStats:    window.refreshAllCampaignStats || Viora.refreshAllCampaignStats,
    renderDashboardNotifications: window.renderDashboardNotifications || Viora.renderDashboardNotifications,
    clearTextColorCache:        window.clearTextColorCache  || Viora.clearTextColorCache,

    // ── Trash handlers (present on Viora but not on window.*) ──
    restoreFromTrash: window.restoreFromTrash || Viora.restoreFromTrash,
    purgeTrashItem:   window.purgeTrashItem   || Viora.purgeTrashItem,

    // ── Training mutators (live on TrainingVioraAPI) ──
    deleteTrainingUser:       _training.deleteTrainingUser       || Viora.deleteTrainingUser,
    enrollUserInCourse:       _training.enrollUserInCourse       || Viora.enrollUserInCourse,
    unenrollUser:             _training.unenrollUser             || Viora.unenrollUser,
    resetUserCourseProgress:  _training.resetUserCourseProgress  || Viora.resetUserCourseProgress,
    resetAllUserTraining:     _training.resetAllUserTraining     || Viora.resetAllUserTraining,
    handleCertTemplateImage:  window.handleCertTemplateImage     || Viora.handleCertTemplateImage,
  });

  // ── Drop any own property that resolved to undefined ──
  // (prevents the audit from flagging inherited-empty slots)
  for (const k of Object.keys(Viora)) {
    if (Viora[k] === undefined) {
      try { delete Viora[k]; } catch (_) {}
    }
  }

  console.info('[viora] Viora namespace unified:', Object.keys(Viora).length, 'methods');
} catch (e) {
  console.error('[viora] namespace unification failed:', e);
}

/* ═══════════════════════════════════════════════════════════════
   ★ v9.2 — INLINE PROJECT REPEATER (client modal)
   ─────────────────────────────────────────────────────────────
   Lets the operator add multiple project records while creating
   or editing a client. State lives on `state._clientProjectDraft`
   as an array. On Save Client, saveClient() iterates this array
   and upserts each project after the client is persisted.
   ═══════════════════════════════════════════════════════════════ */
window.__vioraClientProjects = (function () {
  const DRAFT_KEY = '_clientProjectDraft';
  const SERVICES = [
    'Web Development','Mobile App Development','Enterprise IT Solutions',
    'Cloud Infrastructure','DevOps & CI/CD','Data & Analytics',
    'AI & Machine Learning','Cybersecurity','UI/UX Design',
    'Technical Consulting','Support & Maintenance','Other'
  ];
  const STATUSES = ['active','pending','closed'];

  function getDraft() {
    if (!Array.isArray(state[DRAFT_KEY])) state[DRAFT_KEY] = [];
    return state[DRAFT_KEY];
  }
  function setDraft(arr) { state[DRAFT_KEY] = Array.isArray(arr) ? arr : []; }

  function blankProject(defaultNumber) {
    const today = dateToStr(new Date());
    const deadline = dateToStr(new Date(Date.now() + 90 * 86400000));
    return {
      _draftId: uid(),
      id: null,                       // null means "new — assign on save"
      projectNumber: defaultNumber || '',
      title: '',
      serviceArea: 'Other',
      platform: 'AWS',
      startDate: today,
      deadline,
      status: 'active',
      progress: 0,
      agreedTotal: 0,
      installments: [],
      _isNew: true
    };
  }

  function nextProjectNumber() {
    const year = new Date().getFullYear();
    const prefix = String(year) + '/';
    let max = 0;
    const all = [
      ...(state.data.projects || []),
      ...getDraft()
    ];
    for (const p of all) {
      const n = String(p && p.projectNumber || '');
      if (!n.startsWith(prefix)) continue;
      const tail = n.slice(prefix.length);
      const v = parseInt(tail, 10);
      if (Number.isFinite(v) && v > max) max = v;
    }
    return prefix + String(max + 1).padStart(3, '0');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderOne(p, idx) {
    const installments = Array.isArray(p.installments) ? p.installments : [];
    const totalAgreed = Number(p.agreedTotal) || 0;
    const totalInst = installments.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const mismatch = installments.length && Math.abs(totalInst - totalAgreed) > 0.01;

    const instList = installments.length
      ? installments.map((inst, i) => `
          <div style="display:flex;gap:6px;align-items:center;font-size:.72rem;padding:3px 0;">
            <span style="flex:1;">${esc(inst.label || ('Inst ' + (i + 1)))}</span>
            <input type="date" value="${esc(inst.dueDate || '')}" data-cp-inst-date="${idx}:${i}"
              style="padding:2px 6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-card-solid);color:var(--text-primary);font-size:.7rem;" />
            <input type="number" value="${Number(inst.amount) || 0}" step="0.01" data-cp-inst-amt="${idx}:${i}"
              style="width:100px;padding:2px 6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-card-solid);color:var(--text-primary);font-size:.7rem;text-align:right;" />
          </div>
        `).join('')
      : '<div style="font-size:.7rem;color:var(--text-light);font-style:italic;">No installments.</div>';

    return `
      <div data-cp-index="${idx}" style="padding:12px;background:var(--bg-card-solid);border:1px solid var(--border-color);border-radius:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <strong style="font-size:.8rem;color:var(--accent-blue);">Project ${idx + 1}${p._isNew ? ' (new)' : ''}</strong>
          <button type="button" class="btn btn-danger btn-xs" data-cp-remove="${idx}" title="Remove">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="form-row" style="gap:8px;">
          <div>
            <label style="font-size:.7rem;margin-top:0;">Project #</label>
            <input type="text" value="${esc(p.projectNumber || '')}" data-cp-field="projectNumber" data-cp-idx="${idx}"
              style="padding:6px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-size:.8rem;width:100%;" />
          </div>
          <div>
            <label style="font-size:.7rem;margin-top:0;">Status</label>
            <select data-cp-field="status" data-cp-idx="${idx}"
              style="padding:6px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-size:.8rem;width:100%;">
              ${STATUSES.map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>

        <label style="font-size:.7rem;margin-top:8px;">Title *</label>
        <input type="text" value="${esc(p.title || '')}" placeholder="e.g. Kipimo POS rollout" data-cp-field="title" data-cp-idx="${idx}"
          style="padding:6px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-size:.8rem;width:100%;" />

        <div class="form-row" style="gap:8px;margin-top:8px;">
          <div>
            <label style="font-size:.7rem;margin-top:0;">Service Area</label>
            <select data-cp-field="serviceArea" data-cp-idx="${idx}"
              style="padding:6px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-size:.8rem;width:100%;">
              ${SERVICES.map(s => `<option value="${esc(s)}" ${p.serviceArea === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:.7rem;margin-top:0;">Agreed Total (KES)</label>
            <input type="number" value="${totalAgreed}" step="0.01" min="0" data-cp-field="agreedTotal" data-cp-idx="${idx}"
              style="padding:6px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-size:.8rem;width:100%;text-align:right;" />
          </div>
        </div>

        <div class="form-row" style="gap:8px;margin-top:8px;">
          <div>
            <label style="font-size:.7rem;margin-top:0;">Start Date</label>
            <input type="date" value="${esc(p.startDate || '')}" data-cp-field="startDate" data-cp-idx="${idx}"
              style="padding:6px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-size:.8rem;width:100%;" />
          </div>
          <div>
            <label style="font-size:.7rem;margin-top:0;">Deadline</label>
            <input type="date" value="${esc(p.deadline || '')}" data-cp-field="deadline" data-cp-idx="${idx}"
              style="padding:6px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-size:.8rem;width:100%;" />
          </div>
        </div>

        <div style="margin-top:10px;padding:10px;background:var(--bg-input);border-radius:8px;border:1px solid var(--border-color);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <strong style="font-size:.72rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.4px;">Installments (${installments.length})</strong>
            <div style="display:flex;gap:4px;">
              <input type="number" min="1" max="24" placeholder="3" data-cp-inst-count="${idx}"
                style="width:50px;padding:2px 6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-card-solid);color:var(--text-primary);font-size:.72rem;text-align:center;" />
              <button type="button" class="btn btn-outline btn-xs" data-cp-gen-inst="${idx}" title="Generate N installments">
                <i class="fa-solid fa-calendar-plus"></i>
              </button>
            </div>
          </div>
          ${instList}
          ${mismatch ? `<div style="font-size:.68rem;color:var(--accent-gold);margin-top:4px;">⚠ Installments sum (${fmtKES(totalInst)}) ≠ agreed total (${fmtKES(totalAgreed)})</div>` : ''}
        </div>
      </div>
    `;
  }

  function render() {
    const host = document.getElementById('clientProjectsRepeater');
    if (!host) return;
    const list = getDraft();

    const countEl = document.getElementById('clientProjectsCount');
    if (countEl) countEl.textContent = `— ${list.length}`;

    if (!list.length) {
      host.innerHTML = `<div style="padding:12px;text-align:center;color:var(--text-light);font-size:.78rem;font-style:italic;">No projects yet. Click <strong>Add Project</strong> to attach one.</div>`;
    } else {
      host.innerHTML = list.map((p, i) => renderOne(p, i)).join('');
    }

    const totalEl = document.getElementById('clientProjectsTotal');
    if (totalEl) {
      if (list.length) {
        const grand = list.reduce((s, p) => s + (Number(p.agreedTotal) || 0), 0);
        const paid = list.reduce((s, p) => {
          if (!p.id) return s;
          try {
            const d = window.__vioraRenderers;
            return s + (typeof getProjectPaidTotal === 'function' ? getProjectPaidTotal(p.id) : 0);
          } catch (_) { return s; }
        }, 0);
        totalEl.style.display = 'block';
        totalEl.innerHTML =
          `<strong>${list.length} project${list.length === 1 ? '' : 's'}</strong> · ` +
          `Agreed: <strong>${fmtKES(grand)}</strong>` +
          (paid > 0 ? ` · Paid: <strong style="color:var(--accent-green);">${fmtKES(paid)}</strong> · Balance: <strong style="color:var(--accent-gold);">${fmtKES(Math.max(0, grand - paid))}</strong>` : '');
      } else {
        totalEl.style.display = 'none';
      }
    }
  }

  // ── Event delegation (installed once) ──
  function bindRepeater() {
    const host = document.getElementById('clientProjectsRepeater');
    if (!host || host._vioraBound) return;
    host._vioraBound = true;

    host.addEventListener('input', (e) => {
      const t = e.target;
      const list = getDraft();

      // Simple fields
      if (t.dataset.cpField) {
        const idx = Number(t.dataset.cpIdx);
        const p = list[idx];
        if (!p) return;
        const field = t.dataset.cpField;
        p[field] = field === 'agreedTotal' ? (parseFloat(t.value) || 0) : t.value;
        // Redraw summary only (avoid full re-render which loses focus)
        updateTotals();
        return;
      }

      // Installment amount
      if (t.dataset.cpInstAmt) {
        const [idx, iIdx] = t.dataset.cpInstAmt.split(':').map(Number);
        const p = list[idx];
        if (p && p.installments && p.installments[iIdx]) {
          p.installments[iIdx].amount = parseFloat(t.value) || 0;
          updateTotals();
        }
        return;
      }
    });

    host.addEventListener('change', (e) => {
      const t = e.target;
      const list = getDraft();

      if (t.dataset.cpInstDate) {
        const [idx, iIdx] = t.dataset.cpInstDate.split(':').map(Number);
        const p = list[idx];
        if (p && p.installments && p.installments[iIdx]) {
          p.installments[iIdx].dueDate = t.value;
        }
        return;
      }
    });

    host.addEventListener('click', (e) => {
      // Remove project
      const rm = e.target.closest('[data-cp-remove]');
      if (rm) {
        const idx = Number(rm.dataset.cpRemove);
        const list = getDraft();
        if (!confirm('Remove this project from the draft?')) return;
        const removed = list.splice(idx, 1)[0];
        setDraft(list);
        // If it was already persisted, delete it in the background
        if (removed && removed.id) {
          try { deleteDoc('projects', removed.id); } catch (_) {}
        }
        render();
        return;
      }

      // Generate installments
      const gen = e.target.closest('[data-cp-gen-inst]');
      if (gen) {
        const idx = Number(gen.dataset.cpGenInst);
        const list = getDraft();
        const p = list[idx];
        if (!p) return;
        const countInput = host.querySelector(`[data-cp-inst-count="${idx}"]`);
        const count = Math.max(1, Math.min(24, parseInt(countInput?.value, 10) || 0));
        const total = Number(p.agreedTotal) || 0;
        if (total <= 0) { toast('Set agreed total first.', 'warning'); return; }
        if (count <= 0) { toast('Enter 1–24 installments.', 'warning'); return; }

        const per = Math.round((total / count) * 100) / 100;
        const start = p.startDate ? new Date(p.startDate) : new Date();
        start.setDate(start.getDate() + 30);
        const insts = [];
        for (let i = 0; i < count; i++) {
          const due = new Date(start);
          due.setMonth(due.getMonth() + i);
          insts.push({
            id: uid(),
            label: `Installment ${i + 1} of ${count}`,
            amount: per,
            dueDate: dateToStr(due),
            paid: false,
            paidDate: null,
            partialPaid: 0
          });
        }
        p.installments = insts;
        render();
        return;
      }
    });
  }

  function updateTotals() {
    const totalEl = document.getElementById('clientProjectsTotal');
    const list = getDraft();
    if (!totalEl || !list.length) { if (totalEl) totalEl.style.display = 'none'; return; }
    const grand = list.reduce((s, p) => s + (Number(p.agreedTotal) || 0), 0);
    totalEl.style.display = 'block';
    totalEl.innerHTML = `<strong>${list.length} project${list.length === 1 ? '' : 's'}</strong> · Agreed: <strong>${fmtKES(grand)}</strong>`;
  }

  // ── Public API ──
  return {
    /** Called when opening the client modal for a NEW client. */
    resetForNew() {
      setDraft([]);
      render();
      bindRepeater();
    },

    /** Called when opening the client modal to EDIT an existing client.
     *  Seeds the draft from that client's current projects. */
    loadForClient(clientId) {
      const existing = (state.data.projects || [])
        .filter(p => p && p.clientId === clientId && p.status !== 'cancelled')
        .map(p => ({
          _draftId: p.id,
          id: p.id,
          projectNumber: p.projectNumber || '',
          title: p.title || '',
          serviceArea: p.serviceArea || 'Other',
          platform: p.platform || 'AWS',
          startDate: p.startDate || '',
          deadline: p.deadline || '',
          status: p.status || 'active',
          progress: Number(p.progress) || 0,
          agreedTotal: Number(p.agreedTotal) || 0,
          installments: Array.isArray(p.installments) ? p.installments.map(i => ({ ...i })) : [],
          _isNew: false
        }));
      setDraft(existing);
      render();
      bindRepeater();
    },

    /** Called when clicking "+ Add Project". */
    addBlank() {
      const list = getDraft();
      list.push(blankProject(nextProjectNumber()));
      setDraft(list);
      render();
    },

    /** Read the draft array (used by saveClient). */
    getDraft() { return getDraft().slice(); },

    /** Force a re-render (e.g. after the client is saved). */
    render
  };
})();

/* ═══════════════════════════════════════════════════════════════
   DEFERRED WINDOW GETTERS — resolve AFTER buildVioraHandlers
   populates Viora.* — was previously captured as `undefined`.
   ═══════════════════════════════════════════════════════════════ */
try {
  Object.defineProperty(window, 'deleteTrackItem', {
    configurable: true,
    get() { return Viora.deleteTrackItem; }
  });
  Object.defineProperty(window, 'resetTrackGame', {
    configurable: true,
    get() { return Viora.resetTrackGame; }
  });
} catch (e) {
  console.warn('[viora] window getter install failed:', e);
}

if (typeof revokeTrainingCertImpl === 'function') {
  window.revokeTrainingCert = (id) => revokeTrainingCertImpl(id);
}

/* ── openProjectDeliverables bridge ──
   projects.js exports it; main.js imports it via initProjects deps,
   so we expose the renderer-side helper through _renderers or the
   Viora namespace after buildVioraHandlers runs. This is a no-op
   safety net that will succeed once `_renderers` is populated. */
try {
  if (typeof window.openProjectDeliverables !== 'function' &&
      window.__vioraRenderers &&
      typeof window.__vioraRenderers.openProjectDeliverables === 'function') {
    window.openProjectDeliverables = window.__vioraRenderers.openProjectDeliverables;
  }
} catch (_) {}
console.info('%c[viora] Debug surface ready on window.', 'color:#22e6a0;font-weight:700');
console.info('Available: ref, set, update, remove, get, VioraDb, P, idbOpen, ' +
  'flushOfflineQueue, upsertDoc, deleteDoc, logActivity, toast, state, …');

/* ═══════════════════════════════════════════════════════════════
   INTERNALS BAG
   ═══════════════════════════════════════════════════════════════ */
window._internals = (function () {
  const bag = {};

  const SAFE = {
    upsertDoc, deleteDoc, directWrite, directDelete,
    P, ref, db, remove, get, update, push, set,
    callFn, logActivity, logComm, toast, setSyncStatus,
    fingerprintFor, dedupeWriteGuard, validateRecord,
    reconcilePayment, scheduleMarketSync,
  };
  Object.keys(SAFE).forEach(k => {
    try { if (SAFE[k] != null) bag[k] = SAFE[k]; }
    catch (e) { console.warn('[internals]', k, e); }
  });

  return bag;
})();

/* ═══════════════════════════════════════════════════════════════
   VIORANOTIFY
   ═══════════════════════════════════════════════════════════════ */
window.vioraNotify = async function (opts) {
  opts = opts || {};
  const id = 'notif-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const payload = {
    id,
    title: opts.title || 'VIORA',
    body: opts.body || '',
    icon: opts.icon || 'fa-bell',
    level: opts.level || 'info',
    url: opts.url || '/main.html',
    source: opts.source || 'unknown',
    ts: new Date().toISOString(),
    read: false
  };
  try {
    await set(ref(db, 'viora_data/orgs/viora/notifications/' + id), payload);
    return id;
  } catch (e) {
    console.warn('[vioraNotify] write failed:', e.message);
    try { surfaceVioraNotification(payload); } catch (_) {}
    return id;
  }
};

/* ═══════════════════════════════════════════════════════════════
   KICK OFF
   ═══════════════════════════════════════════════════════════════ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

/* ═══════════════════════════════════════════════════════════════
   LOGO FALLBACK
   ═══════════════════════════════════════════════════════════════ */
if (typeof window.getLogoImg !== 'function') {
  window.getLogoImg = function (url, style) {
    const u = url || (window.state?.data?.logoUrl) || '';
    if (!u) return '<span class="logo-fallback" style="' + (style || '') + '">VI</span>';
    return '<img src="' + u + '" alt="" onerror="this.onerror=null;this.src=\'\';this.style.display=\'none\';" style="max-height:48px;width:auto;object-fit:contain;' + (style || '') + '" />';
  };
}

/* ═══════════════════════════════════════════════════════════════
   END OF FILE — VIORA v3.7.6
   ═══════════════════════════════════════════════════════════════ */
