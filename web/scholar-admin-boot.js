// File: scholar-admin-boot.js
// VIORA Scholar Admin Console bootstrap — DEFINITIVE version.
//
// ROOT CAUSE FIXED:
//   onValue listeners were attaching BEFORE the Firebase Realtime Database
//   transport had propagated the auth token. The stream opened unauthenticated,
//   rules denied the read, onValue fired with null and stayed dead.
//   Fix: warm the DB connection with an authenticated get() BEFORE attaching
//   listeners. Also every render path for requests does its own synchronous
//   get() as a safety net.

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import {
  getDatabase, ref, get, set, update, remove, push, onValue, forceLongPolling
} from "firebase/database";

import {
  initTraining, bindTrainingEvents, renderTrainingOverview,
  renderTrainingUsers, renderTrainingProgress, renderTrainingQuizzes,
  renderTrainingCertificates, viewQuizSubmission,
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
let _dbWarmedUp = false;

const ROOT = "viora_data";
const ORG  = "orgs/viora";
const P = (path) => `${ROOT}/${ORG}/training/${path}`;
const $ = (id) => document.getElementById(id);
const uid = () => "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowIso = () => new Date().toISOString();

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
function eatDayKey(ms) {
  const d = new Date(ms + EAT_OFFSET_MS);
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}
function eatFmtClock() {
  try {
    return new Date().toLocaleString("en-GB", {
      timeZone: "Africa/Nairobi", day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }) + " EAT";
  } catch { return new Date().toISOString(); }
}
function eatFmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: "Africa/Nairobi", day: "2-digit", month: "short", year: "numeric",
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
function fmtBytes(b) { const n = Number(b) || 0; if (n < 1024) return n + " B"; if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB"; return (n / (1024 * 1024)).toFixed(2) + " MB"; }
function fmtKES(n) { return "KES " + (Number(n) || 0).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

function toast(msg, type) {
  const host = $("toastContainer");
  if (!host) { console.log("[toast]", type, msg); return; }
  const el = document.createElement("div");
  el.className = "toast " + (type || "info");
  el.innerHTML = `<span>${escapeHtml(msg)}</span>`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function openModal(id) { const el = $(id); if (el) { el.classList.add("active"); el.style.display = "flex"; document.body.style.overflow = "hidden"; } }
function closeModal(id) { const el = $(id); if (el) { el.classList.remove("active"); el.style.display = "none"; document.body.style.overflow = ""; } }
document.addEventListener("click", (e) => {
  const closer = e.target.closest("[data-close]");
  if (closer) { closeModal(closer.dataset.close); return; }
  if (e.target.classList && e.target.classList.contains("modal-overlay") && e.target.classList.contains("active")) closeModal(e.target.id);
});

const _charts = {};
function destroyChart(id) { if (_charts[id]) { try { _charts[id].destroy(); } catch (e) {} delete _charts[id]; } }
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
    users: [], entities: []
  },
  operator: null, currentTab: "training-command", charts: _charts
};

const D = {
  $, state, toast, escapeHtml, timeAgo, fmtDate, fmtBytes, fmtKES, uid,
  todayStr: () => eatDayKey(Date.now()),
  db, ref, set, update, remove, push, get, onValue, P, ROOT,
  logActivity: async () => {},
  callFn: async () => ({}),
  openModal, closeModal,
  getClient: (id) => (state.data.entities || []).find((e) => e && e.id === id),
  getClientName: (id) => (state.data.entities || []).find((e) => e && e.id === id)?.name || "—",
  getTextColor, destroyChart, safeCanvas: (c) => c,
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  AutoCertification: null,
  setupCertStampDragging,
  renderTrainingCertificates, renderTrainingProgress, renderTrainingQuizzes,
  updateSidebarCounters: () => {}
};

initTraining(D);
try { D.AutoCertification = AutoCertification; } catch (e) {}
try { bindTrainingEvents(); }
catch (e) { console.warn("[sa] initial bindTrainingEvents failed:", e); }

const VioraAPI = {
  openCourseEditor, openChecklistEditor, openResourceEditor, openCertTemplateEditor,
  openManualAwardModal,
  saveCourse, deleteCourse, saveChecklist,
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
  approveTrainingRequest:  (uid) => approveRequest(uid),
  rejectTrainingRequest:   (uid) => rejectRequest(uid),
  reopenTrainingRequest:   (uid) => reopenRequest(uid),
  deleteTrainingRequest:   (uid) => deleteRequest(uid),
  openUserTraining:        (uid) => TrainingVioraAPI.openUserTraining(uid),
  enrollUserInCourse:      (uid, cid) => TrainingVioraAPI.enrollUserInCourse(uid, cid),
  unenrollUser:            (uid, cid) => TrainingVioraAPI.unenrollUser(uid, cid),
  resetUserCourseProgress: (uid, cid) => TrainingVioraAPI.resetUserCourseProgress(uid, cid),
  resetAllUserTraining:    (uid) => TrainingVioraAPI.resetAllUserTraining(uid),
  deleteTrainingUser:      (uid) => TrainingVioraAPI.deleteTrainingUser(uid),
  revokeCertificate:       (cid) => TrainingVioraAPI.revokeCertificate(cid),
  TrainingVioraAPI, openModal, closeModal,
  refreshRequests: () => renderRequestsPane()
};

window.VioraTraining = VioraAPI;
window.Viora = VioraAPI;
window.VioraTrainingAPI = TrainingVioraAPI;
window.VioraTraining.debug = { state, db, auth };

window.openCertTemplateEditor = openCertTemplateEditor;
window.deleteCertTemplate = deleteCertTemplate;
window.saveCertTemplate = saveCertTemplate;
window.refreshCertTemplateModules = refreshCertTemplateModules;
window.showCertTemplatePreview = showCertTemplatePreview;
window.paintCertTemplateStamps = paintCertTemplateStamps;
window.handleCertTemplateImage = handleCertTemplateImage;
window.openManualAwardModal = openManualAwardModal;
window.awardTrainingCertificate = awardTrainingCertificate;
window.viewQuizSubmission = viewQuizSubmission;
window.viewTrainingCert = viewTrainingCert;
window.revokeTrainingCert = revokeTrainingCertImpl;
window.AutoCertification = AutoCertification;
window.openCourseEditor = openCourseEditor;
window.openChecklistEditor = openChecklistEditor;
window.openResourceEditor = openResourceEditor;
window.saveCourse = saveCourse;
window.deleteCourse = deleteCourse;
window.saveChecklist = saveChecklist;
window.saveResource = saveResource;
window.deleteResource = deleteResource;
window.openResourceFile = openResourceFile;

function showSplash(kind, title, subtitle) {
  const splash = $("saSplash");
  if (!splash) return;
  splash.style.display = "flex";
  splash.style.opacity = "1";
  if (kind === "ok") {
    splash.innerHTML = `
      <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#22e6a0,#0d9e6e);display:flex;align-items:center;justify-content:center;font-size:1.7rem;color:#fff;"><i class="fa-solid fa-check"></i></div>
      <h1 style="margin-top:20px;font-family:'Space Grotesk',sans-serif;font-size:1.3rem;">${escapeHtml(title || "Access granted")}</h1>
      <p style="color:#94a3b8;margin-top:6px;">${escapeHtml(subtitle || "")}</p>`;
  } else if (kind === "deny") {
    splash.innerHTML = `
      <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#ff5c7c,#d92b4b);display:flex;align-items:center;justify-content:center;font-size:1.7rem;color:#fff;"><i class="fa-solid fa-lock"></i></div>
      <h1 style="margin-top:20px;font-family:'Space Grotesk',sans-serif;font-size:1.3rem;">${escapeHtml(title || "Access denied")}</h1>
      <p style="color:#94a3b8;margin-top:6px;">${escapeHtml(subtitle || "")}</p>
      <button class="btn btn-danger" id="saDenyOut" style="margin-top:16px;background:#d92b4b;border:none;color:#fff;padding:10px 20px;border-radius:8px;"><i class="fa-solid fa-right-from-bracket"></i> Sign out</button>`;
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

function classifyUserRole(u) {
  const role = (u.role || u.type || "").toLowerCase();
  if (role === "admin" || role === "exec") return "operator";
  if (role === "trainer") return "trainer";
  if (role === "learner" || role === "client") return "learner";
  if (role === "pending") return "pending";
  if (role) return "operator";
  return "learner";
}

function renderCommandCenter() {
  try {
    const data = state.data;
    const operatorArr = Array.isArray(data.users) ? data.users : Object.values(data.users || {});
    const portalArr   = Object.entries(data.portalUsersRaw || {}).map(([id, v]) => ({ id, uid: id, ...(v || {}) }));

    const seen = new Set();
    let total = 0, operators = 0, clients = 0, trainers = 0, learners = 0, pendingApprovalCount = 0;
    for (const u of operatorArr) {
      if (!u || !u.uid || seen.has(u.uid)) continue;
      seen.add(u.uid); total++;
      const cls = classifyUserRole(u);
      if (cls === "operator") operators++;
      else if (cls === "trainer") trainers++;
      else if (cls === "learner") learners++;
      else if (cls === "pending") pendingApprovalCount++;
    }
    for (const p of portalArr) {
      if (!p.uid || seen.has(p.uid)) continue;
      seen.add(p.uid); total++; clients++;
    }

    const usersHost = $("cmdUsersKpi");
    if (usersHost) {
      usersHost.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-users"></i></div><div class="number">${total}</div><div class="label">Total Users</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-user-tie"></i></div><div class="number">${operators}</div><div class="label">Operators</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-building-user"></i></div><div class="number">${clients}</div><div class="label">Portal Clients</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-chalkboard-user"></i></div><div class="number">${trainers}</div><div class="label">Trainers</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-graduation-cap"></i></div><div class="number">${learners}</div><div class="label">Learners</div></div>
        <div class="stat-card" style="${pendingApprovalCount ? 'border-left:4px solid var(--accent-gold);' : ''}"><div class="stat-icon"><i class="fa-solid fa-hourglass-half"></i></div><div class="number">${pendingApprovalCount}</div><div class="label">Pending Approval</div></div>
      `;
    }

    const uCanvas = $("cmdUsersChart");
    if (uCanvas && typeof Chart !== "undefined") {
      destroyChart("cmdUsersChart");
      const tc = getTextColor();
      _charts["cmdUsersChart"] = new Chart(uCanvas.getContext("2d"), {
        type: "bar",
        data: { labels: ["Operators", "Portal Clients", "Trainers", "Learners", "Pending"],
          datasets: [{ label: "Users", data: [operators, clients, trainers, learners, pendingApprovalCount],
            backgroundColor: ["rgba(0,212,255,.75)", "rgba(168,85,247,.75)", "rgba(34,230,160,.75)", "rgba(255,200,87,.75)", "rgba(217,43,75,.75)"],
            borderColor: ["#00d4ff", "#a855f7", "#22e6a0", "#ffc857", "#d92b4b"], borderWidth: 2, borderRadius: 8 }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { color: tc, precision: 0 }, grid: { color: "rgba(148,163,184,.1)" } },
                    x: { ticks: { color: tc }, grid: { display: false } } } }
      });
    }

    const subsArr = Object.entries(data.subscriptionsRaw || {}).map(([id, v]) => ({ id, ...(v || {}) }));
    const nowMs = Date.now(); const thirtyDaysMs = nowMs + 30 * 24 * 60 * 60 * 1000;
    let activeSubs = 0, expiringSubs = 0, pendingSubs = 0, expiredSubs = 0;
    for (const s of subsArr) {
      const status = (s.status || "").toLowerCase();
      const endMs = s.endDate ? Date.parse(s.endDate) : null;
      if (status === "pending") { pendingSubs++; continue; }
      if (status === "expired" || (endMs && endMs < nowMs)) { expiredSubs++; continue; }
      if (status === "active") { activeSubs++; if (endMs && endMs <= thirtyDaysMs) expiringSubs++; }
    }

    const subsHost = $("cmdSubsKpi");
    if (subsHost) {
      subsHost.innerHTML = `
        <div class="stat-card" style="${activeSubs ? 'border-left:4px solid var(--accent-green);' : ''}"><div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div><div class="number">${activeSubs}</div><div class="label">Active</div></div>
        <div class="stat-card" style="${expiringSubs ? 'border-left:4px solid var(--accent-gold);' : ''}"><div class="stat-icon"><i class="fa-solid fa-hourglass-half"></i></div><div class="number">${expiringSubs}</div><div class="label">Expiring (30d)</div></div>
        <div class="stat-card" style="${pendingSubs ? 'border-left:4px solid var(--accent-purple);' : ''}"><div class="stat-icon"><i class="fa-solid fa-clock"></i></div><div class="number">${pendingSubs}</div><div class="label">Pending</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-circle-xmark"></i></div><div class="number">${expiredSubs}</div><div class="label">Expired</div></div>
      `;
    }

    const sCanvas = $("cmdSubsChart");
    if (sCanvas && typeof Chart !== "undefined") {
      destroyChart("cmdSubsChart");
      const tc = getTextColor();
      _charts["cmdSubsChart"] = new Chart(sCanvas.getContext("2d"), {
        type: "bar",
        data: { labels: ["Active", "Expiring 30d", "Pending", "Expired"],
          datasets: [{ label: "Subscriptions", data: [activeSubs, expiringSubs, pendingSubs, expiredSubs],
            backgroundColor: ["rgba(34,230,160,.75)", "rgba(255,200,87,.75)", "rgba(168,85,247,.75)", "rgba(217,43,75,.75)"],
            borderColor: ["#22e6a0", "#ffc857", "#a855f7", "#d92b4b"], borderWidth: 2, borderRadius: 8 }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { color: tc, precision: 0 }, grid: { color: "rgba(148,163,184,.1)" } },
                    x: { ticks: { color: tc }, grid: { display: false } } } }
      });
    }

    const courseCount = (Array.isArray(data.trainingCourses) ? data.trainingCourses : Object.values(data.trainingCourses || {})).length;
    const enrollments = Object.values(data.trainingEnrollments || {}).reduce((sum, u) => sum + Object.keys(u || {}).length, 0);
    const completions = Object.values(data.trainingEnrollments || {}).reduce((sum, u) => sum + Object.values(u || {}).filter(e => e && e.completedAt).length, 0);
    const certsArr = Array.isArray(data.trainingCertificates) ? data.trainingCertificates : Object.values(data.trainingCertificates || {});
    const certCount = certsArr.length;

    const trainHost = $("cmdTrainingKpi");
    if (trainHost) {
      trainHost.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-book-open"></i></div><div class="number">${courseCount}</div><div class="label">Courses</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-graduation-cap"></i></div><div class="number">${enrollments}</div><div class="label">Enrollments</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div><div class="number">${completions}</div><div class="label">Completions</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-certificate"></i></div><div class="number">${certCount}</div><div class="label">Certificates</div></div>
      `;
    }

    const tCanvas = $("cmdTrainingChart");
    if (tCanvas && typeof Chart !== "undefined") {
      destroyChart("cmdTrainingChart");
      const tc = getTextColor();
      _charts["cmdTrainingChart"] = new Chart(tCanvas.getContext("2d"), {
        type: "bar",
        data: { labels: ["Courses", "Enrollments", "Completions", "Certificates"],
          datasets: [{ label: "Training", data: [courseCount, enrollments, completions, certCount],
            backgroundColor: ["rgba(0,212,255,.75)", "rgba(124,58,237,.75)", "rgba(34,230,160,.75)", "rgba(255,200,87,.75)"],
            borderColor: ["#00d4ff", "#7c3aed", "#22e6a0", "#ffc857"], borderWidth: 2, borderRadius: 8 }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { color: tc, precision: 0 }, grid: { color: "rgba(148,163,184,.1)" } },
                    x: { ticks: { color: tc }, grid: { display: false } } } }
      });
    }

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

    const activityCanvas = $("cmdActivityChart");
    if (activityCanvas && typeof Chart !== "undefined") {
      destroyChart("cmdActivityChart");
      const tc = getTextColor();
      const days = []; const dayMap = new Map();
      const todayMs = Date.now();
      for (let i = 29; i >= 0; i--) {
        const ms = todayMs - i * 86400000;
        const key = eatDayKey(ms);
        dayMap.set(key, { enrollments: 0, completions: 0, certificates: 0, requests: 0 });
        days.push(key);
      }
      for (const byCourse of Object.values(data.trainingEnrollments || {})) {
        for (const e of Object.values(byCourse || {})) {
          if (e && e.startedAt) { const k = eatDayKey(Date.parse(e.startedAt)); if (dayMap.has(k)) dayMap.get(k).enrollments++; }
          if (e && e.completedAt) { const k = eatDayKey(Date.parse(e.completedAt)); if (dayMap.has(k)) dayMap.get(k).completions++; }
        }
      }
      for (const c of certsArr) {
        if (c && c.issuedAt) { const k = eatDayKey(Date.parse(c.issuedAt)); if (dayMap.has(k)) dayMap.get(k).certificates++; }
      }
      for (const r of (Array.isArray(data.trainingAccessRequests) ? data.trainingAccessRequests : Object.values(data.trainingAccessRequests || {}))) {
        if (r && r.requestedAt) { const k = eatDayKey(Date.parse(r.requestedAt)); if (dayMap.has(k)) dayMap.get(k).requests++; }
      }
      const labels = days.map(k => k.slice(5));
      _charts["cmdActivityChart"] = new Chart(activityCanvas.getContext("2d"), {
        type: "line",
        data: { labels,
          datasets: [
            { label: "Enrollments", data: days.map(k => dayMap.get(k).enrollments), borderColor: "#00d4ff", backgroundColor: "rgba(0,212,255,.15)", tension: 0.35, fill: true, pointRadius: 2, borderWidth: 2 },
            { label: "Completions", data: days.map(k => dayMap.get(k).completions), borderColor: "#22e6a0", backgroundColor: "rgba(34,230,160,.15)", tension: 0.35, fill: true, pointRadius: 2, borderWidth: 2 },
            { label: "Certificates", data: days.map(k => dayMap.get(k).certificates), borderColor: "#ffc857", backgroundColor: "rgba(255,200,87,.15)", tension: 0.35, fill: true, pointRadius: 2, borderWidth: 2 },
            { label: "Access Requests", data: days.map(k => dayMap.get(k).requests), borderColor: "#ff6ec7", backgroundColor: "rgba(255,110,199,.15)", tension: 0.35, fill: true, pointRadius: 2, borderWidth: 2 }
          ] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: tc, boxWidth: 12, usePointStyle: true, padding: 14 } } },
          scales: { y: { beginAtZero: true, ticks: { color: tc, precision: 0 }, grid: { color: "rgba(148,163,184,.1)" } },
                    x: { ticks: { color: tc, maxRotation: 0 }, grid: { display: false } } } }
      });
    }

    const feed = $("cmdActivityFeed");
    if (feed) {
      const events = [];
      for (const r of (Array.isArray(data.trainingAccessRequests) ? data.trainingAccessRequests : Object.values(data.trainingAccessRequests || {}))) {
        if (r && r.requestedAt) events.push({
          ts: r.requestedAt,
          icon: r.status === "approved" ? "fa-circle-check" : r.status === "rejected" ? "fa-circle-xmark" : "fa-user-clock",
          color: r.status === "approved" ? "var(--accent-green)" : r.status === "rejected" ? "var(--accent-red)" : "var(--accent-gold)",
          title: `${r.name || r.email || "Someone"} — ${r.status || "pending"} access`,
          sub: r.role === "trainer" ? "Trainer request" : "Learner request"
        });
      }
      for (const [uidKey, byCourse] of Object.entries(data.trainingEnrollments || {})) {
        for (const [cid, e] of Object.entries(byCourse || {})) {
          if (e && e.startedAt) events.push({ ts: e.startedAt, icon: "fa-user-plus", color: "var(--accent-blue)", title: "Enrollment started", sub: cid });
        }
      }
      for (const c of certsArr) {
        if (c && c.issuedAt) events.push({ ts: c.issuedAt, icon: "fa-award", color: "var(--accent-gold)", title: "🎓 Certificate: " + (c.userName || "trainee"), sub: c.courseTitle || c.courseId });
      }
      events.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
      const recent = events.slice(0, 20);
      if (!recent.length) feed.innerHTML = '<div class="empty-state" style="padding:20px;">No activity yet.</div>';
      else feed.innerHTML = recent.map(e => `
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

    const stamp = $("cmdLastRefresh");
    if (stamp) stamp.textContent = eatFmtClock();
  } catch (e) {
    console.error("[sa] renderCommandCenter failed:", e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   REQUESTS — every render pulls fresh data
   ═══════════════════════════════════════════════════════════════ */
function getRequestsArray() {
  const raw = state.data.trainingAccessRequests;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return Object.entries(raw || {}).map(([uidKey, v]) => ({ uid: uidKey, ...(v || {}), id: uidKey }));
}

async function _fetchRequestsNow() {
  try {
    const snap = await get(ref(db, P("training/accessRequests")));
    if (snap.exists()) {
      const val = snap.val();
      const arr = Object.entries(val || {}).map(([uidKey, v]) => ({ uid: uidKey, ...(v || {}), id: uidKey }));
      state.data.trainingAccessRequests = arr;
      console.info(`[sa/fetch] loaded ${arr.length} access requests`);
      updateBadges();
      return arr;
    }
    console.info("[sa/fetch] accessRequests path is empty");
    state.data.trainingAccessRequests = [];
    return [];
  } catch (e) {
    console.error("[sa/fetch] accessRequests failed:", e.code, e.message);
    return state.data.trainingAccessRequests || [];
  }
}

function renderRequestsPane() {
  try {
    _fetchRequestsNow().then((fresh) => {
      if (fresh.length !== getRequestsArray().length || fresh.length > 0) {
        setTimeout(() => renderRequestsPane(), 0);
      }
    });

    const all = getRequestsArray();
    const statusFilter = ($("trainingRequestsFilter")?.value || "all").toLowerCase();
    const roleFilter   = ($("trainingRequestsRoleFilter")?.value || "all").toLowerCase();
    const search = ($("trainingRequestsSearch")?.value || "").toLowerCase().trim();

    const pending  = all.filter(r => (r.status || "pending") === "pending").length;
    const approved = all.filter(r => r.status === "approved").length;
    const rejected = all.filter(r => r.status === "rejected").length;
    const trainerCount  = all.filter(r => r.role === "trainer").length;
    const learnerCount  = all.filter(r => r.role !== "trainer").length;

    let list = all;
    if (statusFilter !== "all") list = list.filter(r => (r.status || "pending") === statusFilter);
    if (roleFilter === "trainer") list = list.filter(r => r.role === "trainer");
    if (roleFilter === "learner") list = list.filter(r => r.role !== "trainer");
    if (search) list = list.filter(r => (r.name || "").toLowerCase().includes(search) || (r.email || "").toLowerCase().includes(search));
    list.sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));

    const kpi = $("trainingRequestsKpi");
    if (kpi) {
      kpi.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-list"></i></div><div class="number">${all.length}</div><div class="label">Total</div></div>
        <div class="stat-card" style="${pending ? 'border-left:4px solid var(--accent-gold);' : ''}"><div class="stat-icon"><i class="fa-solid fa-hourglass"></i></div><div class="number">${pending}</div><div class="label">Pending</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-check-circle"></i></div><div class="number">${approved}</div><div class="label">Approved</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-xmark"></i></div><div class="number">${rejected}</div><div class="label">Rejected</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-chalkboard-user"></i></div><div class="number">${trainerCount}</div><div class="label">Trainers</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-graduation-cap"></i></div><div class="number">${learnerCount}</div><div class="label">Learners</div></div>
      `;
    }

    const badge = $("saReqBadge");
    if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? "inline-block" : "none"; }

    const tb = $("trainingRequestsBody");
    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="8" style="padding:32px;text-align:center;color:var(--text-secondary);">Loading requests… if this stays empty, check Console for [sa/fetch] lines.</td></tr>`;
      return;
    }

    tb.innerHTML = list.map(r => {
      const st = (r.status || "pending").toLowerCase();
      const stCls = st === "approved" ? "paid" : st === "rejected" ? "overdue" : "pending";
      const isTrainer = r.role === "trainer";
      const roleLabel = isTrainer ? '<span class="badge badge-purple">Trainer</span>' : '<span class="badge badge-active">Learner</span>';
      const sourceLabel = (r.source || "").replace(/-portal$/, "") || (isTrainer ? "trainer" : "learner");
      const safeUid = escapeHtml(r.uid || r.id || "");
      const actions = st === "pending"
        ? `<button class="btn btn-success btn-xs" onclick="Viora.approveTrainingRequest('${safeUid}')"><i class="fa-solid fa-check"></i> Approve</button>
           <button class="btn btn-danger btn-xs" onclick="Viora.rejectTrainingRequest('${safeUid}')"><i class="fa-solid fa-xmark"></i> Reject</button>`
        : `<button class="btn btn-outline btn-xs" onclick="Viora.reopenTrainingRequest('${safeUid}')"><i class="fa-solid fa-rotate-left"></i> Reopen</button>`;
      return `<tr>
        <td>${timeAgo(r.requestedAt)}</td>
        <td><strong>${escapeHtml(r.name || "—")}</strong></td>
        <td>${escapeHtml(r.email || "—")}</td>
        <td>${escapeHtml(r.phone || "—")}</td>
        <td>${roleLabel}</td>
        <td><small style="color:var(--text-secondary);">${escapeHtml(sourceLabel)}</small></td>
        <td><span class="badge badge-${stCls}">${escapeHtml(st)}</span></td>
        <td style="text-align:right;white-space:nowrap;">
          ${actions}
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteTrainingRequest('${safeUid}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join("");
  } catch (e) {
    console.error("[sa] renderRequestsPane failed:", e);
  }
}

async function approveRequest(uidKey) {
  if (!uidKey) return;
  const req = getRequestsArray().find(r => (r.uid || r.id) === uidKey);
  const role = req?.role || "learner";
  try {
    await update(ref(db, P(`accessRequests/${uidKey}`)), {
      status: "approved", approvedAt: nowIso(), approvedBy: state.operator?.name || "admin"
    });
    try {
      await update(ref(db, `${ROOT}/${ORG}/users/${uidKey}`), {
        role, trainingStatus: "approved", trainingApprovedAt: nowIso(), pendingApproval: false
      });
    } catch (e) {}
    toast(`Approved ${role}.`, "success");
    await _fetchRequestsNow();
    renderRequestsPane();
  } catch (e) { toast("Approve failed: " + e.message, "error"); }
}
async function rejectRequest(uidKey) {
  if (!uidKey) return;
  if (!confirm("Reject this request?")) return;
  try {
    await update(ref(db, P(`accessRequests/${uidKey}`)), { status: "rejected", rejectedAt: nowIso(), rejectedBy: state.operator?.name || "admin" });
    toast("Rejected.", "info");
    await _fetchRequestsNow();
    renderRequestsPane();
  } catch (e) { toast("Reject failed: " + e.message, "error"); }
}
async function reopenRequest(uidKey) {
  if (!uidKey) return;
  try {
    await update(ref(db, P(`accessRequests/${uidKey}`)), { status: "pending", reopenedAt: nowIso(), reopenedBy: state.operator?.name || "admin" });
    toast("Reopened — now pending.", "info");
    await _fetchRequestsNow();
    renderRequestsPane();
  } catch (e) { toast("Reopen failed: " + e.message, "error"); }
}
async function deleteRequest(uidKey) {
  if (!uidKey) return;
  if (!confirm("Delete this request permanently?")) return;
  try {
    await remove(ref(db, P(`accessRequests/${uidKey}`)));
    toast("Request deleted.", "success");
    await _fetchRequestsNow();
    renderRequestsPane();
  } catch (e) { toast("Delete failed: " + e.message, "error"); }
}

/* ═══════════════════════════════════════════════════════════════
   TAB SWITCHING + BADGES
   ═══════════════════════════════════════════════════════════════ */
function switchTab(name) {
  state.currentTab = "training-" + name;
  document.querySelectorAll("[data-sa-tab]").forEach(b => b.classList.toggle("active", b.dataset.saTab === name));
  document.querySelectorAll(".sa-pane").forEach(p => p.classList.toggle("active", p.id === "sa-pane-" + name));
  if (window.innerWidth <= 768) $("saSidebar")?.classList.remove("open");

  try {
    if (name === "command")      renderCommandCenter();
    if (name === "overview")     renderTrainingOverview();
    if (name === "requests")     renderRequestsPane();
    if (name === "users")        renderTrainingUsers();
    if (name === "progress")     renderTrainingProgress();
    if (name === "quizzes")      renderTrainingQuizzes();
    if (name === "certificates") renderTrainingCertificates();
  } catch (e) {
    console.error("[sa] render failed", name, e);
  }
  updateBadges();
}

function updateBadges() {
  const quizzes = Object.values(state.data.trainingQuizSubmissions || {})
    .flatMap((byCourse) => Object.values(byCourse || {}))
    .filter((q) => q && (q.status || "submitted") === "submitted").length;
  const requests = getRequestsArray().filter((r) => (r.status || "pending") === "pending").length;
  if ($("saQuizBadge")) { $("saQuizBadge").textContent = quizzes; $("saQuizBadge").style.display = quizzes > 0 ? "inline-block" : "none"; }
  if ($("saReqBadge"))  { $("saReqBadge").textContent = requests; $("saReqBadge").style.display = requests > 0 ? "inline-block" : "none"; }
}

/* ═══════════════════════════════════════════════════════════════
   SUBSCRIPTIONS — warm up DB, then attach listeners
   ═══════════════════════════════════════════════════════════════ */
async function _warmUpDbAuth() {
  if (_dbWarmedUp) return true;
  try {
    console.info("[sa/warmup] forcing authenticated DB read to warm transport");
    await get(ref(db, `${ROOT}/${ORG}/users`));
    _dbWarmedUp = true;
    console.info("[sa/warmup] ✓ DB transport authenticated");
    return true;
  } catch (e) {
    console.warn("[sa/warmup] warmup read failed:", e.code, e.message);
    return false;
  }
}

async function subscribeTraining() {
  /* CRITICAL: warm up the DB transport with an authenticated read BEFORE
     attaching any onValue listeners. Without this, listeners open an
     unauthenticated stream, receive null, and stay dead. */
  await _warmUpDbAuth();

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
      const incoming = normalize(raw, ARRAY_KEYS.includes(key));

      if (key === "trainingAccessRequests") {
        const arr = Object.entries(raw || {}).map(([uidKey, v]) => ({ uid: uidKey, ...(v || {}), id: uidKey }));
        state.data[key] = arr;
        console.info(`[sa/sub] ${path} → ${arr.length} records`);
        if (arr.length === 0) {
          console.warn("[sa/sub] empty snapshot — running catch-up fetch");
          _fetchRequestsNow().then((fetched) => {
            if (fetched.length > 0 && state.currentTab === "training-requests") renderRequestsPane();
          });
        }
      } else {
        state.data[key] = incoming;
        if (key === "trainingUsers") {
          const arr = Array.isArray(state.data.trainingUsers) ? state.data.trainingUsers : Object.values(state.data.trainingUsers || {});
          state.data.users = arr.filter((u) => u && (u.role === "trainer" || !u.role));
          state.data.portalUsers = arr.filter((u) => u && u.role !== "trainer" && u.role);
        }
      }

      updateBadges();
      const name = state.currentTab.replace(/^training-/, "");
      try {
        if (name === "command")      renderCommandCenter();
        if (name === "overview")     renderTrainingOverview();
        if (name === "requests")     renderRequestsPane();
        if (name === "users")        renderTrainingUsers();
        if (name === "progress")     renderTrainingProgress();
        if (name === "quizzes")      renderTrainingQuizzes();
        if (name === "certificates") renderTrainingCertificates();
      } catch (e) {}
    }, (err) => {
      console.error(`[sa/sub] ${path} failed:`, err.code, err.message);
      if (key === "trainingAccessRequests") {
        _fetchRequestsNow().then((fetched) => {
          if (state.currentTab === "training-requests") renderRequestsPane();
        });
      }
    });
  }

  onValue(ref(db, `${ROOT}/${ORG}/users`), (snap) => {
    state.data.users = normalize(snap.exists() ? snap.val() : {}, true);
    try { renderTrainingUsers(); renderTrainingProgress(); renderCommandCenter(); } catch (e) {}
  }, (err) => console.error(`[sa/sub] ${ROOT}/${ORG}/users failed:`, err.code, err.message));

  onValue(ref(db, `${ROOT}/${ORG}/subscriptions`), (snap) => {
    const val = snap.exists() ? snap.val() : {};
    state.data.subscriptionsRaw = val || {};
    state.data.subscriptions = normalize(val, true);
    if (state.currentTab === "training-command") renderCommandCenter();
  }, (err) => console.error(`[sa/sub] subscriptions failed:`, err.code, err.message));

  onValue(ref(db, `${ROOT}/${ORG}/portalUsers`), (snap) => {
    const val = snap.exists() ? snap.val() : {};
    state.data.portalUsersRaw = val || {};
    state.data.portalUsers = normalize(val, true);
    if (state.currentTab === "training-command") renderCommandCenter();
  }, (err) => console.error(`[sa/sub] portalUsers failed:`, err.code, err.message));

  onValue(ref(db, `${ROOT}/${ORG}/portalRequests`), (snap) => {
    state.data.portalRequests = snap.exists() ? snap.val() : {};
    if (state.currentTab === "training-command") renderCommandCenter();
  }, (err) => console.error(`[sa/sub] portalRequests failed:`, err.code, err.message));

  /* One-shot backfill of accessRequests, on top of everything above */
  _fetchRequestsNow().then((fetched) => {
    if (fetched.length > 0 && state.currentTab === "training-requests") renderRequestsPane();
  });
}

/* ═══════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════ */
async function bootAdmin() {
  if (_adminBooted) return;
  _adminBooted = true;

  const bind = (id, evt, fn) => { const el = $(id); if (el && !el._saBound) { el._saBound = true; el.addEventListener(evt, fn); } };

  bind("cmdRefreshBtn", "click", () => { renderCommandCenter(); toast("Refreshed.", "info"); });
  bind("trainingRequestsRefreshBtn", "click", () => { _fetchRequestsNow().then(() => renderRequestsPane()); toast("Refreshed.", "info"); });
  bind("trainingRequestsFilter", "change", renderRequestsPane);
  bind("trainingRequestsRoleFilter", "change", renderRequestsPane);
  bind("trainingRequestsSearch", "input", renderRequestsPane);
  bind("trainingRequestsClearSearch", "click", () => {
    const s = $("trainingRequestsSearch"); if (s) s.value = "";
    const f = $("trainingRequestsFilter"); if (f) f.value = "all";
    const r = $("trainingRequestsRoleFilter"); if (r) r.value = "all";
    renderRequestsPane();
  });

  bind("trainingUsersRefreshBtn", "click", () => { renderTrainingUsers(); toast("Refreshed.", "info"); });
  bind("trainingRefreshBtn", "click", () => { renderTrainingProgress(); toast("Refreshed.", "info"); });
  bind("quizzesRefreshBtn", "click", () => { renderTrainingQuizzes(); toast("Refreshed.", "info"); });
  bind("certsRefreshBtn", "click", () => { renderTrainingCertificates(); toast("Refreshed.", "info"); });

  bind("trainingEnrollUserBtn", "click", () => TrainingVioraAPI.openEnrollUserModal());
  bind("teuConfirmBtn", "click", async () => {
    const u = $("teuUser")?.value; const c = $("teuCourse")?.value;
    if (u && c) { await TrainingVioraAPI.enrollUserInCourse(u, c); closeModal("trainingEnrollModal"); }
  });
  bind("manualAwardCertBtn", "click", () => openManualAwardModal());
  bind("rerunAutoAwardBtn", "click", () => AutoCertification?.backfillAll());
  bind("newCertTemplateBtn", "click", () => openCertTemplateEditor());

  document.querySelectorAll("[data-sa-tab]").forEach((b) => {
    if (b._saNavBound) return;
    b._saNavBound = true;
    b.addEventListener("click", (e) => { e.preventDefault(); const tab = b.dataset.saTab; if (tab) switchTab(tab); });
  });

  bind("saSignOutBtn", "click", () => { if (confirm("Sign out of Scholar Admin?")) signOut(auth).then(() => location.reload()); });
  bind("saThemeBtn", "click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("viora_theme", next); } catch (e) {}
    const btn = $("saThemeBtn"); if (btn) { const icon = btn.querySelector("i"); if (icon) icon.className = next === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun"; }
  });
  bind("saMobileToggle", "click", () => $("saSidebar")?.classList.toggle("open"));
  bind("saSidebarOverlay", "click", () => $("saSidebar")?.classList.remove("open"));

  try { const saved = localStorage.getItem("viora_theme"); if (saved) document.documentElement.setAttribute("data-theme", saved); } catch (e) {}

  await subscribeTraining();
  switchTab("command");
  setTimeout(() => { try { bindTrainingEvents(); } catch (e) {} }, 300);
}

/* AUTH GATE */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setTimeout(() => { if (!auth.currentUser) showSplash("deny", "Not signed in", "Scholar Admin requires an active VIORA session."); }, 800);
    return;
  }

  const candidatePaths = [
    `${ROOT}/users/${user.uid}`,
    `${ROOT}/${ORG}/users/${user.uid}`,
    `${ROOT}/${ORG}/training/users/${user.uid}`
  ];

  let chosenProfile = null, chosenPath = null;
  for (const path of candidatePaths) {
    try {
      const snap = await get(ref(db, path));
      if (snap.exists()) {
        const val = snap.val();
        const rawRole = val?.role ?? val?.type ?? val?.accessLevel ?? null;
        const normRole = typeof rawRole === "string" ? rawRole.toLowerCase().trim() : null;
        const isElevated = normRole === "admin" || normRole === "exec";
        if (!chosenProfile || isElevated) { chosenProfile = val; chosenPath = path; if (isElevated) break; }
      }
    } catch (e) {}
  }

  if (!chosenProfile) {
    showSplash("deny", "Profile not found", `No record for UID ${user.uid.slice(0,8)}… in any users node.`);
    return;
  }

  const rawRole = chosenProfile.role ?? chosenProfile.type ?? chosenProfile.accessLevel ?? null;
  const role = typeof rawRole === "string" ? rawRole.toLowerCase().trim() : null;
  if (role !== "admin" && role !== "exec") {
    showSplash("deny", "Access denied", `Your role ("${rawRole || "unknown"}") does not have Scholar admin access.`);
    return;
  }

  state.operator = { uid: user.uid, ...chosenProfile };
  if ($("saWhoami")) $("saWhoami").textContent = chosenProfile.name || user.email || "Admin";
  showSplash("ok", "Access granted", `Welcome, ${chosenProfile.name || user.email}.`);
  setTimeout(() => { hideSplash(); bootAdmin(); }, 400);
});
