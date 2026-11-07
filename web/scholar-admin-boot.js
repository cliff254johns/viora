// ═══════════════════════════════════════════════════════════════
// scholar-admin-boot.js
// Stand-alone bootstrap for VIORA Scholar admin console.
// ═══════════════════════════════════════════════════════════════

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import {
  getDatabase, ref, set, get, update, remove, push,
  onValue, off, forceLongPolling
} from "firebase/database";

import {
  initTraining, bindTrainingEvents, renderTrainingOverview,
  renderTrainingRequests, renderTrainingUsers, renderTrainingProgress,
  renderTrainingQuizzes, renderTrainingCertificates, viewQuizSubmission,
  openCourseEditor, openChecklistEditor, openResourceEditor,
  renderCeModules, toggleCeQuiz, addQuizQuestion, removeQuizQuestion,
  updateQuizQuestion, updateQuizOption, setQuizAnswer, addQuizOption,
  removeQuizOption, updateCeModule, addCeModule, removeCeModule, moveCeModule,
  saveCourse, deleteCourse, renderCleTasks, updateCleTask, addCleTask,
  removeCleTask, saveChecklist, handleReFile, saveResource, deleteResource,
  openResourceFile, awardTrainingCertificate, viewTrainingCert,
  revokeTrainingCertImpl, renderCertTemplatesGrid, openCertTemplateEditor,
  refreshCertTemplateModules, showCertTemplatePreview, paintCertTemplateStamps,
  saveCertTemplate, deleteCertTemplate, handleCertTemplateImage,
  openManualAwardModal, AutoCertification, setupCertStampDragging,
  TrainingVioraAPI,
} from "./main/training.js";

const firebaseConfig = {
  apiKey: "AIzaSyC9gCBt-xR8t9n6rTGNvDZ5usUGiW-Dqxc",
  authDomain: "cliffclient-35ec5.firebaseapp.com",
  databaseURL: "https://cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cliffclient-35ec5",
  storageBucket: "cliffclient-35ec5.firebasestorage.app",
  messagingSenderId: "519782791696",
  appId: "1:519782791696:web:6e1a654ddeed14b72b2895",
  measurementId: "G-G0NB6JGQVF",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getDatabase(app);
forceLongPolling(db);
const auth = getAuth(app);

const ROOT = "viora_data";
const ORG = "orgs/viora";
const ORG_COLLECTIONS = new Set([
  "entities","leads","campaigns","deals","contracts","projects","tasks","invoices","payments","accounts","ledger","expenses","payroll","assets","compliance","documents","proposals","mpesaTransactions","mpesaSettings","inventory","activityLog","commLog","trash","logoUrl","profile","clientsite","companyProfile","marketContent","products","orders","financials","telemetry","marketplace","marketLeads","marketAnalytics","tickets","clientUploads","supportTickets","training","marketing","portalRequests","portalUsers","appointments","presentations","orchestration","archives","archivedClients","archivedDeals","archivedProjects","subscriptions","licenses","promos","productExtras","reviews","socialAccounts","competitorBenchmarks","homeContent","industries","employeeProfiles"
]);

function P(path) {
  const clean = String(path || "").replace(/^\/+|\/+$/g, "");
  const [head, ...rest] = clean.split("/");
  const tail = rest.length ? "/" + rest.join("/") : "";
  if (ORG_COLLECTIONS.has(head)) return `${ROOT}/${ORG}/${head}${tail}`;
  return `${ROOT}/${clean}`;
}

const $ = (id) => document.getElementById(id);
const uid = () => "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowIso = () => new Date().toISOString();

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function timeAgo(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60000) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  if (d < 30) return d + "d ago";
  return new Date(iso).toLocaleDateString();
}
function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; }
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
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("active");
  el.style.display = "flex";
  document.body.style.overflow = "hidden";
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("active");
  el.style.display = "none";
  if (!document.querySelector(".modal-overlay.active")) document.body.style.overflow = "";
}
document.addEventListener("click", (e) => {
  const closer = e.target.closest("[data-close]");
  if (closer) { e.preventDefault(); closeModal(closer.dataset.close); return; }
  if (e.target.classList && e.target.classList.contains("modal-overlay") && e.target.classList.contains("active")) closeModal(e.target.id);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.querySelectorAll(".modal-overlay.active").forEach((m) => closeModal(m.id));
});

const _charts = {};
function destroyChart(id) {
  if (_charts[id]) { try { _charts[id].destroy(); } catch (e) {} delete _charts[id]; }
}
function safeCanvas(c) { try { c.getContext("2d"); return c; } catch { return null; } }
function getTextColor() { return document.documentElement.getAttribute("data-theme") === "light" ? "#0a0a0f" : "#94a3b8"; }

// ── ROBUST DATA NORMALIZER ──
// Converts Firebase objects {} to Arrays [] safely, avoiding `is not iterable` errors.
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
    trainingCourses: {},
    trainingChecklists: {},
    trainingResources: {},
    trainingEnrollments: {},
    trainingProgress: {},
    trainingCertificates: [], // Force array
    trainingQuizSubmissions: {},
    trainingAccessRequests: {},
    trainingCertTemplates: {},
    trainingCourseCompletions: {},
    users: [], // Force array
    portalUsers: [], // Force array
    entities: []
  },
  operator: null,
  currentTab: "training-overview",
  charts: _charts,
};

const D = {
  $, state, toast, escapeHtml, timeAgo, fmtDate, fmtBytes, fmtKES, uid,
  todayStr: () => new Date().toISOString().slice(0, 10),
  db, ref, set, update, remove, push, get, onValue, P, ROOT,
  logActivity: async (type, title, description) => {
    try {
      const evRef = push(ref(db, P("activityLog")));
      await set(evRef, { id: evRef.key, type, title, description: description || "", by: state.operator?.uid || "system", byName: state.operator?.name || "System", timestamp: nowIso() });
    } catch (e) {}
  },
  callFn: async (name, payload) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Not signed in");
    const idToken = await user.getIdToken();
    const WORKER_URL = "https://viora-api.cliff254johns.workers.dev";
    const res = await fetch(`${WORKER_URL}/${name}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify(payload || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
  openModal, closeModal,
  getClient: (id) => (state.data.entities || []).find((e) => e && e.id === id),
  getClientName: (id) => (state.data.entities || []).find((e) => e && e.id === id)?.name || "—",
  getTextColor, destroyChart, safeCanvas,
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  AutoCertification: null,
  setupCertStampDragging,
  renderTrainingCertificates, renderTrainingProgress, renderTrainingQuizzes,
  updateSidebarCounters: () => {},
};

function showSplash(kind, title, subtitle) {
  const splash = $("saSplash");
  if (!splash) return;
  splash.classList.remove("hidden");
  if (kind === "ok") {
    splash.innerHTML = `<div class="icon ok"><i class="fa-solid fa-check"></i></div><h1>${escapeHtml(title || "Access granted")}</h1><p>${escapeHtml(subtitle || "")}</p>`;
  } else if (kind === "deny") {
    splash.innerHTML = `<div class="icon deny"><i class="fa-solid fa-lock"></i></div><h1>${escapeHtml(title || "Access denied")}</h1><p>${escapeHtml(subtitle || "")}</p><button class="btn btn-danger" id="saDenyOut" style="margin-top:8px;"><i class="fa-solid fa-right-from-bracket"></i> Sign out</button>`;
    $("saDenyOut")?.addEventListener("click", () => signOut(auth).then(() => location.reload()));
  }
}
function hideSplash() {
  $("saSplash")?.classList.add("hidden");
  const shell = $("saShell");
  if (shell) shell.style.display = "flex";
}

function switchTab(name) {
  state.currentTab = "training-" + (name === "overview" ? "overview" : name === "requests" ? "requests" : name === "users" ? "users" : name === "progress" ? "progress" : name === "quizzes" ? "quizzes" : "certificates");

  document.querySelectorAll(".sa-nav-item").forEach((b) => b.classList.toggle("active", b.dataset.saTab === name));
  document.querySelectorAll(".sa-pane").forEach((p) => p.classList.toggle("active", p.id === "sa-pane-" + name));

  try {
    switch (name) {
      case "overview": renderTrainingOverview(); break;
      case "requests": renderTrainingRequests(); break;
      case "users": renderTrainingUsers(); break;
      case "progress": renderTrainingProgress(); break;
      case "quizzes": renderTrainingQuizzes(); break;
      case "certificates": renderTrainingCertificates(); break;
    }
  } catch (e) { console.error("[sa] render failed for", name, e); toast("Render failed: " + e.message, "error"); }

  updateBadges();
}

function updateBadges() {
  const quizzes = normalize(state.data.trainingQuizSubmissions).flatMap ? Object.values(state.data.trainingQuizSubmissions || {}).flatMap((byCourse) => Object.values(byCourse || {})).filter((q) => q && (q.status || "submitted") === "submitted").length : 0;
  const requests = normalize(state.data.trainingAccessRequests) ? Object.values(state.data.trainingAccessRequests || {}).filter((r) => (r.status || "pending") === "pending").length : 0;

  const qb = $("saQuizBadge");
  if (qb) { qb.textContent = quizzes; qb.style.display = quizzes > 0 ? "inline-block" : "none"; }
  const rb = $("saReqBadge");
  if (rb) { rb.textContent = requests; rb.style.display = requests > 0 ? "inline-block" : "none"; }
}

function subscribeTraining() {
  const PATHS = {
    trainingAccessRequests:    "training/accessRequests",
    trainingCourses:           "training/courses",
    trainingChecklists:        "training/checklists",
    trainingResources:         "training/resources",
    trainingEnrollments:       "training/enrollments",
    trainingProgress:          "training/progress",
    trainingCertificates:      "training/certificates", // Now normalized below
    trainingQuizSubmissions:   "training/quizSubmissions",
    trainingCertTemplates:     "training/certificateTemplates",
    trainingCourseCompletions: "training/courseCompletions",
    trainingUsers:             "training/users",
  };

  for (const [key, path] of Object.entries(PATHS)) {
    onValue(ref(db, P(path)), (snap) => {
      const raw = snap.exists() ? snap.val() : {};
      
      // Coerce to Array if the renderer expects it
      if (key === "trainingCertificates" || key === "trainingUsers") {
        state.data[key] = normalize(raw, true); 
      } else {
        state.data[key] = normalize(raw, false);
      }
      
      if (key === "trainingUsers") {
        state.data.users = state.data.trainingUsers.filter(u => u.role === "trainer" || !u.role);
        state.data.portalUsers = state.data.trainingUsers.filter(u => u.role !== "trainer" && u.role);
      }

      updateBadges();
      
      const name = state.currentTab.replace(/^training-/, "");
      switch (name) {
        case "overview":     try { renderTrainingOverview(); }     catch (e) {}
          break;
        case "requests":     try { renderTrainingRequests(); }     catch (e) {}
          break;
        case "users":        try { renderTrainingUsers(); }        catch (e) {}
          break;
        case "progress":     try { renderTrainingProgress(); }     catch (e) {}
          break;
        case "quizzes":      try { renderTrainingQuizzes(); }      catch (e) {}
          break;
        case "certificates": try { renderTrainingCertificates(); } catch (e) {}
          break;
      }
    }, (err) => {
      if (err && err.code !== "PERMISSION_DENIED") console.warn("[sa] sub failed", path, err);
    });
  }

  onValue(ref(db, `${ROOT}/users`), (snap) => {
    const raw = snap.exists() ? snap.val() : {};
    state.data.users = normalize(raw, true);
    try { renderTrainingUsers(); renderTrainingProgress(); } catch (e) {}
  }, () => {});
}

function bootAdmin() {
  initTraining(D);
  try { D.AutoCertification = AutoCertification; } catch (e) {}
  bindTrainingEvents();

  const bind = (id, evt, fn) => { const el = $(id); if (el && !el._saBound) { el._saBound = true; el.addEventListener(evt, fn); } };

  bind("trainingRequestsRefreshBtn", "click", () => { renderTrainingRequests(); toast("Refreshed.", "info"); });
  bind("trainingUsersRefreshBtn",    "click", () => { renderTrainingUsers();    toast("Refreshed.", "info"); });
  bind("trainingRefreshBtn",         "click", () => { renderTrainingProgress(); toast("Refreshed.", "info"); });
  bind("quizzesRefreshBtn",          "click", () => { renderTrainingQuizzes();  toast("Refreshed.", "info"); });
  bind("certsRefreshBtn",            "click", () => { renderTrainingCertificates(); toast("Refreshed.", "info"); });

  bind("trainingEnrollUserBtn", "click", () => TrainingVioraAPI.openEnrollUserModal());
  bind("teuConfirmBtn", "click", async () => {
    const u = $("teuUser")?.value;
    const c = $("teuCourse")?.value;
    if (!u || !c) { toast("Select user and course.", "error"); return; }
    await TrainingVioraAPI.enrollUserInCourse(u, c);
    closeModal("trainingEnrollModal");
  });
  bind("manualAwardCertBtn", "click", () => openManualAwardModal());
  bind("rerunAutoAwardBtn",  "click", () => AutoCertification?.backfillAll());
  bind("newCertTemplateBtn", "click", () => openCertTemplateEditor());

  document.querySelectorAll(".sa-nav-item").forEach((b) => {
    if (b._saBound) return;
    b._saBound = true;
    b.addEventListener("click", () => {
      if (window.innerWidth <= 768) $("saSidebar")?.classList.remove("open");
      switchTab(b.dataset.saTab);
    });
  });

  bind("saSignOutBtn", "click", () => { if (confirm("Sign out of Scholar Admin?")) signOut(auth).then(() => location.reload()); });
  bind("saThemeBtn", "click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("viora_theme", next); } catch (e) {}
    const icon = $("saThemeBtn")?.querySelector("i");
    if (icon) icon.className = next === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
  });

  bind("saMobileToggle", "click", () => { $("saSidebar")?.classList.toggle("open"); });
  bind("saSidebarOverlay", "click", () => { $("saSidebar")?.classList.remove("open"); });

  try {
    const saved = localStorage.getItem("viora_theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
  } catch (e) {}

  subscribeTraining();
  switchTab("overview");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { showSplash("deny", "Not signed in", "Scholar Admin requires an active VIORA session."); return; }
  try {
    const snap = await get(ref(db, `${ROOT}/users/${user.uid}`));
    const profile = snap.exists() ? snap.val() : null;
    const role = profile?.role || null;
    if (role !== "admin" && role !== "exec") {
      showSplash("deny", "Access denied", `Your role (${role || "unknown"}) does not have Scholar admin access.`);
      return;
    }
    state.operator = { uid: user.uid, ...profile };
    const who = $("saWhoami");
    if (who) who.textContent = profile.name || user.email || "Admin";
    showSplash("ok", "Access granted", `Welcome, ${profile.name || user.email}.`);
    setTimeout(() => { hideSplash(); bootAdmin(); }, 500);
  } catch (e) {
    console.error("[sa] auth check failed", e);
    showSplash("deny", "Verification failed", e.message || "Could not verify permissions.");
  }
});

window.VioraTraining = {
  openCourseEditor, openChecklistEditor, openResourceEditor, openCertTemplateEditor,
  deleteCourse, deleteCertTemplate, deleteResource,
  viewQuizSubmission, viewTrainingCert, revokeTrainingCert: revokeTrainingCertImpl,
  saveCourse, saveChecklist, saveResource, saveCertTemplate,
  refreshCertTemplateModules, showCertTemplatePreview, paintCertTemplateStamps,
  handleCertTemplateImage, openManualAwardModal, awardTrainingCertificate,
  toggleCeQuiz, addQuizQuestion, removeQuizQuestion, updateQuizQuestion,
  updateQuizOption, setQuizAnswer, addQuizOption, removeQuizOption,
  updateCeModule, addCeModule, removeCeModule, moveCeModule,
  updateCleTask, addCleTask, removeCleTask, handleReFile, openResourceFile,
  TrainingVioraAPI, debug: { state, db, auth },
};

console.info("[scholar-admin] booted — default Firebase app, session shared with main.html");
