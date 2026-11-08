// File: scholar-admin-boot.js
// VIORA Scholar Admin Console — bootstrap with Command Center.
//
// FIXES IN THIS VERSION:
//  - window.Viora alias (inline onclick="Viora.xxx()" resolves).
//  - Import set/update/remove/push from firebase/database.
//  - bootAdmin() idempotent + bails if auth not warm — fixes Requests subscriber
//    firing with null before localStorage rehydration.
//  - onAuthStateChanged delays null-user deny splash by 800ms.
//  - subscribeTraining() logs every callback & error.
//  - NEW: Command Center tab with Users, Subscriptions, Portal KPIs.
//  - All "today / this week / this month" computed in Africa/Nairobi (EAT, +3).

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import {
  getDatabase, ref, get, set, update, remove, push, onValue, forceLongPolling
} from "firebase/database";

import {
  initTraining, bindTrainingEvents, renderTrainingOverview, renderTrainingRequests, renderTrainingUsers,
  renderTrainingProgress, renderTrainingQuizzes, renderTrainingCertificates, viewQuizSubmission,
  openCourseEditor, openChecklistEditor, openResourceEditor, renderCeModules, toggleCeQuiz,
  addQuizQuestion, removeQuizQuestion, updateQuizQuestion, updateQuizOption, setQuizAnswer,
  addQuizOption, removeQuizOption, updateCeModule, addCeModule, removeCeModule, moveCeModule,
  saveCourse, deleteCourse, renderCleTasks, updateCleTask, addCleTask, removeCleTask, saveChecklist,
  handleReFile, saveResource, deleteResource, openResourceFile, awardTrainingCertificate,
  viewTrainingCert, revokeTrainingCertImpl, renderCertTemplatesGrid, openCertTemplateEditor,
  refreshCertTemplateModules, showCertTemplatePreview, paintCertTemplateStamps, saveCertTemplate,
  deleteCertTemplate, handleCertTemplateImage, openManualAwardModal, AutoCertification,
  setupCertStampDragging, TrainingVioraAPI
} from "./main/training.js";

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
const db = getDatabase(app); forceLongPolling(db);
const auth = getAuth(app);

let _adminBooted = false;

const ROOT = "viora_data";
const ORG  = "orgs/viora";
const P = (path) => `${ROOT}/${ORG}/training/${path}`;
const $ = (id) => document.getElementById(id);
const uid = () => "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowIso = () => new Date().toISOString();

/* ═══════════════════════════════════════════════════════════════
   EAT (Africa/Nairobi) timezone helpers.
   EAT is UTC+3 with no DST, so the math is trivial but explicit.
   ═══════════════════════════════════════════════════════════════ */
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000; // +3 hours

function eatNow() {
  return new Date(Date.now() + EAT_OFFSET_MS);
}
function eatTodayKey(/* Date */ d = eatNow()) {
  // "YYYY-MM-DD" in EAT
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function eatMonthKey(/* Date */ d = eatNow()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function eatDayStartMs(/* Date */ d = eatNow()) {
  const copy = new Date(d.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  return copy.getTime() - EAT_OFFSET_MS; // back to UTC ms
}
function eatMonthStartMs(/* Date */ d = eatNow()) {
  const copy = new Date(d.getTime());
  copy.setUTCDate(1);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.getTime() - EAT_OFFSET_MS;
}
function eatFmtClock() {
  try {
    return eatNow().toLocaleString("en-GB", {
      timeZone: "Africa/Nairobi",
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false
    }) + " EAT";
  } catch { return eatNow().toISOString(); }
}
function eatFmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: "Africa/Nairobi",
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch { return "—"; }
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function timeAgo(iso) {
  if (!iso) return "";
  const t = Date.parse(iso); if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60000) return "just now";
  const m = Math.floor(diff / 60000); if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}
function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Nairobi" }); }
  catch { return "—"; }
}
function fmtBytes(b) {
  const n = Number(b) || 0;
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}
function fmtKES(n) {
  return "KES " + (Number(n) || 0).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function toast(msg, type) {
  const host = $("toastContainer");
  if (!host) { console.log("[toast]", type, msg); return; }
  const el = document.createElement("div");
  el.className = "toast " + (type || "info");
  el.innerHTML = `<span>${escapeHtml(msg)}</span>`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function openModal(id) {
  const el = $(id);
  if (el) { el.classList.add("active"); el.style.display = "flex"; document.body.style.overflow = "hidden"; }
}
function closeModal(id) {
  const el = $(id);
  if (el) { el.classList.remove("active"); el.style.display = "none"; document.body.style.overflow = ""; }
}
document.addEventListener("click", (e) => {
  const closer = e.target.closest("[data-close]");
  if (closer) { closeModal(closer.dataset.close); return; }
  if (e.target.classList && e.target.classList.contains("modal-overlay") && e.target.classList.contains("active")) {
    closeModal(e.target.id);
  }
});

const _charts = {};
function destroyChart(id) { if (_charts[id]) { try { _charts[id].destroy(); } catch (e) {} delete _charts[id]; } }
function safeCanvas(c) { try { c.getContext("2d"); return c; } catch { return null; } }
function getTextColor() { return document.documentElement.getAttribute("data-theme") === "light" ? "#0a0a0f" : "#94a3b8"; }

function normalize(val, forceArray = false) {
  if (!val) return forceArray ? [] : {};
  if (forceArray) {
    if (Array.isArray(val)) return val;
    return Object.entries(val).map(([id, v]) => ({ id, ...v }));
  }
  return val;
}

const state = {
  data: {
    trainingCourses: {}, trainingChecklists: {}, trainingResources: {}, trainingEnrollments: {},
    trainingProgress: {}, trainingCertificates: [], trainingQuizSubmissions: {},
    trainingAccessRequests: [], trainingCertTemplates: {}, trainingCourseCompletions: {},
    trainingUsers: [],
    subscriptions: {}, subscriptionsRaw: {},
    portalUsers: {}, portalUsersRaw: {},
    portalRequests: {},
    users: [], entities: [],
    _commandCenterRefresh: 0
  },
  operator: null, currentTab: "training-command", charts: _charts
};

const D = {
  $, state, toast, escapeHtml, timeAgo, fmtDate, fmtBytes, fmtKES, uid,
  todayStr: () => eatTodayKey(),
  db, ref, set, update, remove, push, get, onValue, P, ROOT,
  logActivity: async () => {},
  callFn: async () => ({}),
  openModal, closeModal,
  getClient: (id) => (state.data.entities || []).find((e) => e && e.id === id),
  getClientName: (id) => (state.data.entities || []).find((e) => e && e.id === id)?.name || "—",
  getTextColor, destroyChart, safeCanvas,
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  AutoCertification: null,
  setupCertStampDragging,
  renderTrainingCertificates, renderTrainingProgress, renderTrainingQuizzes,
  updateSidebarCounters: () => {}
};

// Order matters: initTraining first so D is populated before bindTrainingEvents.
initTraining(D);
try { D.AutoCertification = AutoCertification; } catch (e) {}

try { bindTrainingEvents(); }
catch (e) { console.warn("[sa] initial bindTrainingEvents failed:", e); }

/* ═══════════════════════════════════════════════════════════════
   GLOBAL API
   ═══════════════════════════════════════════════════════════════ */
const VioraAPI = {
  openCourseEditor, openChecklistEditor, openResourceEditor, openCertTemplateEditor,
  openManualAwardModal,
  saveCourse, deleteCourse,
  saveChecklist,
  saveResource, deleteResource, openResourceFile, handleReFile,
  saveCertTemplate, deleteCertTemplate, refreshCertTemplateModules,
  showCertTemplatePreview, paintCertTemplateStamps, handleCertTemplateImage,
  viewTrainingCert, revokeTrainingCert: revokeTrainingCertImpl,
  revokeTrainingCertImpl, awardTrainingCertificate,
  viewQuizSubmission,
  toggleCeQuiz, addQuizQuestion, removeQuizQuestion, updateQuizQuestion, updateQuizOption,
  setQuizAnswer, addQuizOption, removeQuizOption, updateCeModule, addCeModule,
  removeCeModule, moveCeModule, renderCeModules,
  renderCleTasks, updateCleTask, addCleTask, removeCleTask,

  editCourse:        (id) => openCourseEditor(id),
  editChecklist:     (id) => openChecklistEditor(id),
  editResource:      (id) => openResourceEditor(id),

  approveTrainingRequest:  (uid) => TrainingVioraAPI.approveTrainingRequest(uid),
  rejectTrainingRequest:   (uid) => TrainingVioraAPI.rejectTrainingRequest(uid),
  reopenTrainingRequest:   (uid) => TrainingVioraAPI.reopenTrainingRequest(uid),
  openUserTraining:        (uid) => TrainingVioraAPI.openUserTraining(uid),
  enrollUserInCourse:      (uid, cid) => TrainingVioraAPI.enrollUserInCourse(uid, cid),
  unenrollUser:            (uid, cid) => TrainingVioraAPI.unenrollUser(uid, cid),
  resetUserCourseProgress: (uid, cid) => TrainingVioraAPI.resetUserCourseProgress(uid, cid),
  resetAllUserTraining:    (uid) => TrainingVioraAPI.resetAllUserTraining(uid),
  deleteTrainingUser:      (uid) => TrainingVioraAPI.deleteTrainingUser(uid),
  revokeCertificate:       (cid) => TrainingVioraAPI.revokeCertificate(cid),

  TrainingVioraAPI,
  openModal, closeModal
};

window.VioraTraining = VioraAPI;
window.Viora = VioraAPI;
window.VioraTrainingAPI = TrainingVioraAPI;
window.VioraTraining.debug = { state, db, auth };

console.info("[sa] window.Viora installed");

window.openCertTemplateEditor     = openCertTemplateEditor;
window.deleteCertTemplate         = deleteCertTemplate;
window.saveCertTemplate           = saveCertTemplate;
window.refreshCertTemplateModules = refreshCertTemplateModules;
window.showCertTemplatePreview    = showCertTemplatePreview;
window.paintCertTemplateStamps    = paintCertTemplateStamps;
window.handleCertTemplateImage    = handleCertTemplateImage;
window.openManualAwardModal       = openManualAwardModal;
window.awardTrainingCertificate   = awardTrainingCertificate;
window.viewQuizSubmission         = viewQuizSubmission;
window.viewTrainingCert           = viewTrainingCert;
window.revokeTrainingCert         = revokeTrainingCertImpl;
window.AutoCertification          = AutoCertification;
window.openCourseEditor           = openCourseEditor;
window.openChecklistEditor        = openChecklistEditor;
window.openResourceEditor         = openResourceEditor;
window.saveCourse                 = saveCourse;
window.deleteCourse               = deleteCourse;
window.saveChecklist              = saveChecklist;
window.saveResource               = saveResource;
window.deleteResource             = deleteResource;
window.openResourceFile           = openResourceFile;

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-viora-action]");
  if (!btn) return;
  const action = btn.dataset.vioraAction;
  let args = [];
  try { args = btn.dataset.vioraArgs ? JSON.parse(btn.dataset.vioraArgs) : []; } catch (err) {}
  const fn = window.Viora?.[action];
  if (typeof fn === "function") {
    e.preventDefault();
    e.stopPropagation();
    try { fn(...args); }
    catch (err) { console.error(`[sa] action ${action} failed:`, err); toast(`${action} failed: ${err.message}`, "error"); }
  } else {
    console.warn(`[sa] no handler for data-viora-action="${action}"`);
  }
});

/* ═══════════════════════════════════════════════════════════════
   SPLASH
   ═══════════════════════════════════════════════════════════════ */
function showSplash(kind, title, subtitle) {
  const splash = $("saSplash");
  if (!splash) return;
  splash.style.display = "flex";
  splash.style.opacity = "1";
  if (kind === "ok") {
    splash.innerHTML = `
      <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#22e6a0,#0d9e6e);display:flex;align-items:center;justify-content:center;font-size:1.7rem;color:#fff;">
        <i class="fa-solid fa-check"></i>
      </div>
      <h1 style="margin-top:20px;font-family:'Space Grotesk',sans-serif;font-size:1.3rem;">${escapeHtml(title || "Access granted")}</h1>
      <p style="color:#94a3b8;margin-top:6px;">${escapeHtml(subtitle || "")}</p>`;
  } else if (kind === "deny") {
    splash.innerHTML = `
      <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#ff5c7c,#d92b4b);display:flex;align-items:center;justify-content:center;font-size:1.7rem;color:#fff;">
        <i class="fa-solid fa-lock"></i>
      </div>
      <h1 style="margin-top:20px;font-family:'Space Grotesk',sans-serif;font-size:1.3rem;">${escapeHtml(title || "Access denied")}</h1>
      <p style="color:#94a3b8;margin-top:6px;">${escapeHtml(subtitle || "")}</p>
      <button class="btn btn-danger" id="saDenyOut" style="margin-top:16px;background:#d92b4b;border:none;color:#fff;padding:10px 20px;border-radius:8px;">
        <i class="fa-solid fa-right-from-bracket"></i> Sign out
      </button>`;
    $("saDenyOut")?.addEventListener("click", () => signOut(auth).then(() => location.reload()));
  }
}

function hideSplash() {
  const s = $("saSplash");
  if (!s) return;
  s.style.opacity = "0";
  setTimeout(() => {
    s.style.display = "none";
    const shell = $("saShell");
    if (shell) shell.style.display = "flex";
  }, 350);
}

/* ═══════════════════════════════════════════════════════════════
   COMMAND CENTER — rendering
   ═══════════════════════════════════════════════════════════════ */
function classifyUserRole(u) {
  const role = (u.role || u.type || "").toLowerCase();
  if (role === "admin" || role === "exec") return "operator";
  if (role === "trainer")                 return "trainer";
  if (role === "learner" || role === "client") return "learner";
  if (role) return "operator"; // any other staff role
  return "learner";
}

function renderCommandCenter() {
  try {
    const data = state.data;
    const operatorArr = Array.isArray(data.users) ? data.users : Object.values(data.users || {});
    const portalArr   = Object.entries(data.portalUsersRaw || {}).map(([id, v]) => ({ id, uid: id, ...(v || {}) }));

    /* ── USERS ──────────────────────────────── */
    const seen = new Set();
    let total = 0, operators = 0, clients = 0, trainers = 0, learners = 0;
    for (const u of operatorArr) {
      if (!u || !u.uid || seen.has(u.uid)) continue;
      seen.add(u.uid);
      total++;
      const cls = classifyUserRole(u);
      if (cls === "operator") operators++;
      else if (cls === "trainer") trainers++;
      else if (cls === "learner") learners++;
    }
    for (const p of portalArr) {
      if (!p.uid || seen.has(p.uid)) continue;
      seen.add(p.uid);
      total++;
      clients++;
    }

    const usersHost = $("cmdUsersKpi");
    if (usersHost) {
      usersHost.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-users"></i></div><div class="number">${total}</div><div class="label">Total Users</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-user-tie"></i></div><div class="number">${operators}</div><div class="label">Operators</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-building-user"></i></div><div class="number">${clients}</div><div class="label">Portal Clients</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-chalkboard-user"></i></div><div class="number">${trainers}</div><div class="label">Trainers</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-graduation-cap"></i></div><div class="number">${learners}</div><div class="label">Learners</div></div>
      `;
    }

    /* ── SUBSCRIPTIONS ──────────────────────── */
    const subsArr = Object.entries(data.subscriptionsRaw || {}).map(([id, v]) => ({ id, ...(v || {}) }));
    const nowMs = Date.now();
    const thirtyDaysMs = nowMs + 30 * 24 * 60 * 60 * 1000;
    let activeSubs = 0, expiringSubs = 0, pendingSubs = 0, expiredSubs = 0;
    for (const s of subsArr) {
      const status = (s.status || "").toLowerCase();
      const endMs = s.endDate ? Date.parse(s.endDate) : null;
      if (status === "pending") { pendingSubs++; continue; }
      if (status === "expired" || (endMs && endMs < nowMs)) { expiredSubs++; continue; }
      if (status === "active") {
        activeSubs++;
        if (endMs && endMs <= thirtyDaysMs) expiringSubs++;
      }
    }

    const subsHost = $("cmdSubsKpi");
    if (subsHost) {
      subsHost.innerHTML = `
        <div class="stat-card" style="${activeSubs ? 'border-left:4px solid var(--accent-green);' : ''}"><div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div><div class="number">${activeSubs}</div><div class="label">Active</div></div>
        <div class="stat-card" style="${expiringSubs ? 'border-left:4px solid var(--accent-gold);' : ''}"><div class="stat-icon"><i class="fa-solid fa-hourglass-half"></i></div><div class="number">${expiringSubs}</div><div class="label">Expiring (30d)</div></div>
        <div class="stat-card" style="${pendingSubs ? 'border-left:4px solid var(--accent-purple);' : ''}"><div class="stat-icon"><i class="fa-solid fa-clock"></i></div><div class="number">${pendingSubs}</div><div class="label">Pending Requests</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-circle-xmark"></i></div><div class="number">${expiredSubs}</div><div class="label">Expired</div></div>
      `;
    }

    /* ── PORTAL ACCESS ──────────────────────── */
    const portalReqArr = Object.entries(data.portalRequests || {}).map(([id, v]) => ({ id, ...(v || {}) }));
    const pendingPortalReqs = portalReqArr.filter(r => (r.status || "pending") === "pending").length;
    const registeredPortalUsers = portalArr.length;
    const pendingApproval = portalArr.filter(p => p.pendingApproval === true || (p.status || "").toLowerCase() === "pending").length;

    const portalHost = $("cmdPortalKpi");
    if (portalHost) {
      portalHost.innerHTML = `
        <div class="stat-card" style="${pendingPortalReqs ? 'border-left:4px solid var(--accent-gold);' : ''}"><div class="stat-icon"><i class="fa-solid fa-envelope-open-text"></i></div><div class="number">${pendingPortalReqs}</div><div class="label">Pending Portal Requests</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-door-open"></i></div><div class="number">${registeredPortalUsers}</div><div class="label">Registered Portal Users</div></div>
        <div class="stat-card" style="${pendingApproval ? 'border-left:4px solid var(--accent-blue);' : ''}"><div class="stat-icon"><i class="fa-solid fa-user-clock"></i></div><div class="number">${pendingApproval}</div><div class="label">Pending Approval</div></div>
      `;
    }

    /* ── ACTIVITY FEED ──────────────────────── */
    const feed = $("cmdActivityFeed");
    if (feed) {
      const events = [];
      // Access requests
      for (const r of (Array.isArray(data.trainingAccessRequests) ? data.trainingAccessRequests : Object.values(data.trainingAccessRequests || {}))) {
        if (r && r.requestedAt) events.push({
          ts: r.requestedAt,
          icon: r.status === "approved" ? "fa-circle-check" : r.status === "rejected" ? "fa-circle-xmark" : "fa-user-clock",
          color: r.status === "approved" ? "var(--accent-green)" : r.status === "rejected" ? "var(--accent-red)" : "var(--accent-gold)",
          title: `${r.name || r.email || "Someone"} — ${r.status || "pending"} access`,
          sub: r.role === "trainer" ? "Trainer request" : "Learner request"
        });
      }
      // Enrollments
      for (const [uid, byCourse] of Object.entries(data.trainingEnrollments || {})) {
        for (const [cid, e] of Object.entries(byCourse || {})) {
          if (e && e.startedAt) events.push({
            ts: e.startedAt, icon: "fa-user-plus", color: "var(--accent-blue)",
            title: "Enrollment started", sub: cid
          });
        }
      }
      // Certificates
      for (const c of (Array.isArray(data.trainingCertificates) ? data.trainingCertificates : Object.values(data.trainingCertificates || {}))) {
        if (c && c.issuedAt) events.push({
          ts: c.issuedAt, icon: "fa-award", color: "var(--accent-gold)",
          title: "🎓 Certificate: " + (c.userName || "trainee"), sub: c.courseTitle || c.courseId
        });
      }
      events.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
      const recent = events.slice(0, 20);

      if (!recent.length) {
        feed.innerHTML = '<div class="empty-state" style="padding:20px;">No activity yet.</div>';
      } else {
        feed.innerHTML = recent.map(e => `
          <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border-color);">
            <i class="fa-solid ${e.icon}" style="color:${e.color};margin-top:2px;"></i>
            <div style="flex:1;min-width:0;">
              <div style="font-size:.84rem;font-weight:600;">${escapeHtml(e.title)}</div>
              <div style="font-size:.72rem;color:var(--text-secondary);">${escapeHtml(e.sub)}</div>
            </div>
            <div style="font-size:.68rem;color:var(--text-light);white-space:nowrap;" title="${escapeHtml(eatFmtDate(e.ts))}">${timeAgo(e.ts)}</div>
          </div>
        `).join("");
      }
    }

    const stamp = $("cmdLastRefresh");
    if (stamp) stamp.textContent = eatFmtClock();
  } catch (e) {
    console.error("[sa] renderCommandCenter failed:", e);
    toast("Command Center render failed: " + e.message, "error");
  }
}

/* ═══════════════════════════════════════════════════════════════
   TAB SWITCHING
   ═══════════════════════════════════════════════════════════════ */
function switchTab(name) {
  const key = "training-" + name;
  state.currentTab = key;
  document.querySelectorAll("[data-sa-tab]").forEach((b) =>
    b.classList.toggle("active", b.dataset.saTab === name)
  );
  document.querySelectorAll(".sa-pane").forEach((p) =>
    p.classList.toggle("active", p.id === "sa-pane-" + name)
  );
  if (window.innerWidth <= 768) $("saSidebar")?.classList.remove("open");

  try {
    if (name === "command")      renderCommandCenter();
    if (name === "overview")     renderTrainingOverview();
    if (name === "requests")     renderTrainingRequests();
    if (name === "users")        renderTrainingUsers();
    if (name === "progress")     renderTrainingProgress();
    if (name === "quizzes")      renderTrainingQuizzes();
    if (name === "certificates") renderTrainingCertificates();
  } catch (e) {
    console.error("[sa] render failed", name, e);
    toast("Render error: " + e.message, "error");
  }
  updateBadges();
}

function updateBadges() {
  const quizzes = Object.values(state.data.trainingQuizSubmissions || {})
    .flatMap((byCourse) => Object.values(byCourse || {}))
    .filter((q) => q && (q.status || "submitted") === "submitted").length;
  const requests = (Array.isArray(state.data.trainingAccessRequests)
    ? state.data.trainingAccessRequests
    : Object.values(state.data.trainingAccessRequests || {})
  ).filter((r) => r && (r.status || "pending") === "pending").length;
  if ($("saQuizBadge")) {
    $("saQuizBadge").textContent = quizzes;
    $("saQuizBadge").style.display = quizzes > 0 ? "inline-block" : "none";
  }
  if ($("saReqBadge")) {
    $("saReqBadge").textContent = requests;
    $("saReqBadge").style.display = requests > 0 ? "inline-block" : "none";
  }
}

/* ═══════════════════════════════════════════════════════════════
   SUBSCRIPTIONS
   ═══════════════════════════════════════════════════════════════ */
function subscribeTraining() {
  const PATHS = {
    trainingAccessRequests:   "training/accessRequests",
    trainingCourses:          "training/courses",
    trainingChecklists:       "training/checklists",
    trainingResources:        "training/resources",
    trainingEnrollments:      "training/enrollments",
    trainingProgress:         "training/progress",
    trainingCertificates:     "training/certificates",
    trainingQuizSubmissions:  "training/quizSubmissions",
    trainingCertTemplates:    "training/certificateTemplates",
    trainingCourseCompletions:"training/courseCompletions",
    trainingUsers:            "training/users"
  };

  const ARRAY_KEYS = ["trainingCertificates", "trainingUsers", "trainingAccessRequests"];

  for (const [key, path] of Object.entries(PATHS)) {
    onValue(ref(db, P(path)), (snap) => {
      const raw = snap.exists() ? snap.val() : {};
      state.data[key] = normalize(raw, ARRAY_KEYS.includes(key));

      if (key === "trainingAccessRequests") {
        state.data[key] = Object.entries(raw || {}).map(([uid, v]) => ({ uid, ...v, id: uid }));
      }

      if (key === "trainingUsers") {
        const arr = Array.isArray(state.data.trainingUsers)
          ? state.data.trainingUsers
          : Object.values(state.data.trainingUsers || {});
        state.data.users = arr.filter((u) => u && (u.role === "trainer" || !u.role));
        state.data.portalUsers = arr.filter((u) => u && u.role !== "trainer" && u.role);
      }

      console.info(`[sa/sub] ${path} →`, state.data[key]);
      updateBadges();

      const name = state.currentTab.replace(/^training-/, "");
      try {
        if (name === "command")      renderCommandCenter();
        if (name === "overview")     renderTrainingOverview();
        if (name === "requests")     renderTrainingRequests();
        if (name === "users")        renderTrainingUsers();
        if (name === "progress")     renderTrainingProgress();
        if (name === "quizzes")      renderTrainingQuizzes();
        if (name === "certificates") renderTrainingCertificates();
      } catch (e) {
        console.warn("[sa] render during subscribe failed:", key, e);
      }
    }, (err) => {
      console.error(`[sa/sub] ${path} failed:`, err.code, err.message);
    });
  }

  /* Org users */
  onValue(ref(db, `${ROOT}/${ORG}/users`), (snap) => {
    state.data.users = normalize(snap.exists() ? snap.val() : {}, true);
    try { renderTrainingUsers(); renderTrainingProgress(); renderCommandCenter(); } catch (e) {}
  }, (err) => {
    console.error(`[sa/sub] ${ROOT}/${ORG}/users failed:`, err.code, err.message);
  });

  /* Subscriptions */
  onValue(ref(db, `${ROOT}/${ORG}/subscriptions`), (snap) => {
    const val = snap.exists() ? snap.val() : {};
    state.data.subscriptionsRaw = val || {};
    state.data.subscriptions = normalize(val, true);
    try { renderCommandCenter(); } catch (e) {}
  }, (err) => {
    console.error(`[sa/sub] subscriptions failed:`, err.code, err.message);
  });

  /* Portal users */
  onValue(ref(db, `${ROOT}/${ORG}/portalUsers`), (snap) => {
    const val = snap.exists() ? snap.val() : {};
    state.data.portalUsersRaw = val || {};
    state.data.portalUsers = normalize(val, true);
    try { renderCommandCenter(); } catch (e) {}
  }, (err) => {
    console.error(`[sa/sub] portalUsers failed:`, err.code, err.message);
  });

  /* Portal requests */
  onValue(ref(db, `${ROOT}/${ORG}/portalRequests`), (snap) => {
    const val = snap.exists() ? snap.val() : {};
    state.data.portalRequests = val || {};
    try { renderCommandCenter(); } catch (e) {}
  }, (err) => {
    console.error(`[sa/sub] portalRequests failed:`, err.code, err.message);
  });
}

/* ═══════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════ */
function bootAdmin() {
  if (_adminBooted) return;
  _adminBooted = true;

  const bind = (id, evt, fn) => {
    const el = $(id);
    if (el && !el._saBound) { el._saBound = true; el.addEventListener(evt, fn); }
  };

  /* Command Center refresh */
  bind("cmdRefreshBtn", "click", () => { renderCommandCenter(); toast("Refreshed.", "info"); });

  /* Training panes */
  bind("trainingRequestsRefreshBtn", "click", () => { renderTrainingRequests(); toast("Refreshed.", "info"); });
  bind("trainingUsersRefreshBtn",    "click", () => { renderTrainingUsers();    toast("Refreshed.", "info"); });
  bind("trainingRefreshBtn",         "click", () => { renderTrainingProgress(); toast("Refreshed.", "info"); });
  bind("quizzesRefreshBtn",          "click", () => { renderTrainingQuizzes();  toast("Refreshed.", "info"); });
  bind("certsRefreshBtn",            "click", () => { renderTrainingCertificates(); toast("Refreshed.", "info"); });

  bind("trainingEnrollUserBtn", "click", () => TrainingVioraAPI.openEnrollUserModal());
  bind("teuConfirmBtn", "click", async () => {
    const u = $("teuUser")?.value;
    const c = $("teuCourse")?.value;
    if (u && c) {
      await TrainingVioraAPI.enrollUserInCourse(u, c);
      closeModal("trainingEnrollModal");
    }
  });
  bind("manualAwardCertBtn", "click", () => openManualAwardModal());
  bind("rerunAutoAwardBtn",  "click", () => AutoCertification?.backfillAll());
  bind("newCertTemplateBtn", "click", () => openCertTemplateEditor());

  document.querySelectorAll("[data-sa-tab]").forEach((b) => {
    if (b._saNavBound) return;
    b._saNavBound = true;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = b.dataset.saTab;
      if (tab) switchTab(tab);
    });
  });

  bind("saSignOutBtn", "click", () => {
    if (confirm("Sign out of Scholar Admin?")) signOut(auth).then(() => location.reload());
  });
  bind("saThemeBtn", "click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("viora_theme", next); } catch (e) {}
    const btn = $("saThemeBtn");
    if (btn) {
      const icon = btn.querySelector("i");
      if (icon) icon.className = next === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
    }
  });
  bind("saMobileToggle", "click", () => $("saSidebar")?.classList.toggle("open"));
  bind("saSidebarOverlay", "click", () => $("saSidebar")?.classList.remove("open"));

  try { const saved = localStorage.getItem("viora_theme"); if (saved) document.documentElement.setAttribute("data-theme", saved); } catch (e) {}

  /* CRITICAL: don't subscribe until auth is warm */
  if (!auth.currentUser) {
    console.warn("[sa] bootAdmin called before auth was ready — waiting for next onAuthStateChanged");
    _adminBooted = false;
    return;
  }

  subscribeTraining();
  switchTab("command");

  setTimeout(() => switchTab("command"), 600);

  setTimeout(() => {
    try { bindTrainingEvents(); console.info("[sa] late bindTrainingEvents succeeded"); }
    catch (e) { console.warn("[sa] late bindTrainingEvents failed:", e); }
  }, 300);
}

/* ═══════════════════════════════════════════════════════════════
   AUTH GATE
   ═══════════════════════════════════════════════════════════════ */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setTimeout(() => {
      if (!auth.currentUser) {
        showSplash("deny", "Not signed in", "Scholar Admin requires an active VIORA session.");
      }
    }, 800);
    return;
  }

  const candidatePaths = [
    `${ROOT}/users/${user.uid}`,
    `${ROOT}/${ORG}/users/${user.uid}`,
    `${ROOT}/${ORG}/training/users/${user.uid}`
  ];

  let chosenProfile = null;
  let chosenPath = null;

  for (const path of candidatePaths) {
    try {
      const snap = await get(ref(db, path));
      if (snap.exists()) {
        const val = snap.val();
        console.info(`[sa/auth] ${path} →`, val);
        const rawRole = val?.role ?? val?.type ?? val?.accessLevel ?? null;
        const normRole = typeof rawRole === "string" ? rawRole.toLowerCase().trim() : null;
        const isElevated = normRole === "admin" || normRole === "exec";
        if (!chosenProfile || isElevated) {
          chosenProfile = val;
          chosenPath = path;
          if (isElevated) break;
        }
      } else {
        console.info(`[sa/auth] ${path} → (missing)`);
      }
    } catch (e) {
      console.warn(`[sa/auth] ${path} read failed:`, e.message);
    }
  }

  if (!chosenProfile) {
    console.error("[sa/auth] No profile found in any of:", candidatePaths);
    showSplash("deny", "Profile not found",
      `No record for UID ${user.uid.slice(0,8)}… in any users node. Create one at viora_data/orgs/viora/users/${user.uid} with role "exec".`);
    return;
  }

  const rawRole = chosenProfile.role ?? chosenProfile.type ?? chosenProfile.accessLevel ?? null;
  const role = typeof rawRole === "string" ? rawRole.toLowerCase().trim() : null;

  if (role !== "admin" && role !== "exec") {
    console.error(`[sa/auth] Role from ${chosenPath} = "${rawRole}" — not admin/exec. Full profile:`, chosenProfile);
    showSplash("deny", "Access denied",
      `Your role ("${rawRole || "unknown"}") at ${chosenPath.replace(ROOT + "/", "")} does not have Scholar admin access.`);
    return;
  }

  console.info(`[sa/auth] ✓ Granted via ${chosenPath} (role="${role}")`);
  state.operator = { uid: user.uid, ...chosenProfile };
  if ($("saWhoami")) $("saWhoami").textContent = chosenProfile.name || user.email || "Admin";
  showSplash("ok", "Access granted", `Welcome, ${chosenProfile.name || user.email}.`);
  setTimeout(() => { hideSplash(); bootAdmin(); }, 400);
});
