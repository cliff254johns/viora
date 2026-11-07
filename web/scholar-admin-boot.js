// ═══════════════════════════════════════════════════════════════
// scholar-admin-boot.js
// Stand-alone bootstrap for VIORA Scholar admin console.
//
// Uses the DEFAULT Firebase app (same session as main.html), so the
// operator stays signed in when clicking the sidebar link from
// main.html → scholar-admin.html (opens in a new tab).
//
// Imports main/training.js (the same module main.js uses) and
// hands it a D context that satisfies every dependency it expects.
// ═══════════════════════════════════════════════════════════════

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import {
  getDatabase, ref, set, get, update, remove, push,
  onValue, off, query, limitToLast, forceLongPolling
} from "firebase/database";

import {
  initTraining,
  bindTrainingEvents,
  setTrainingContext,
  renderTrainingOverview,
  renderTrainingRequests,
  renderTrainingUsers,
  renderTrainingProgress,
  renderTrainingQuizzes,
  renderTrainingCertificates,
  viewQuizSubmission,
  openCourseEditor,
  openChecklistEditor,
  openResourceEditor,
  renderCeModules,
  toggleCeQuiz,
  addQuizQuestion,
  removeQuizQuestion,
  updateQuizQuestion,
  updateQuizOption,
  setQuizAnswer,
  addQuizOption,
  removeQuizOption,
  updateCeModule,
  addCeModule,
  removeCeModule,
  moveCeModule,
  saveCourse,
  deleteCourse,
  renderCleTasks,
  updateCleTask,
  addCleTask,
  removeCleTask,
  saveChecklist,
  handleReFile,
  saveResource,
  deleteResource,
  openResourceFile,
  awardTrainingCertificate,
  viewTrainingCert,
  revokeTrainingCertImpl,
  renderCertTemplatesGrid,
  openCertTemplateEditor,
  refreshCertTemplateModules,
  showCertTemplatePreview,
  paintCertTemplateStamps,
  saveCertTemplate,
  deleteCertTemplate,
  handleCertTemplateImage,
  openManualAwardModal,
  AutoCertification,
  setupCertStampDragging,
  TrainingVioraAPI,
} from "./main/training.js";

/* ── Firebase: same config as main.js, DEFAULT app ── */
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

/* Same P() as main.js — org-aware path resolver */
const ORG_COLLECTIONS = new Set([
  "entities","leads","campaigns","deals","contracts","projects",
  "tasks","invoices","payments","accounts","ledger","expenses","payroll",
  "assets","compliance","documents","proposals","mpesaTransactions",
  "mpesaSettings","inventory","activityLog","commLog","trash","logoUrl",
  "profile","clientsite","companyProfile","marketContent",
  "products","orders","financials","telemetry","marketplace","marketLeads",
  "marketAnalytics","tickets","clientUploads","supportTickets","training",
  "marketing","portalRequests","portalUsers","appointments","presentations",
  "orchestration","archives","archivedClients","archivedDeals","archivedProjects",
  "subscriptions","licenses","promos","productExtras","reviews","socialAccounts",
  "competitorBenchmarks","homeContent","industries","employeeProfiles",
]);

function P(path) {
  const clean = String(path || "").replace(/^\/+|\/+$/g, "");
  const [head, ...rest] = clean.split("/");
  const tail = rest.length ? "/" + rest.join("/") : "";
  if (ORG_COLLECTIONS.has(head)) return `${ROOT}/${ORG}/${head}${tail}`;
  return `${ROOT}/${clean}`;
}

/* ── Small utilities (self-contained — not imported from main/helpers) ── */
const $ = (id) => document.getElementById(id);
const uid = () => "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowIso = () => new Date().toISOString();

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
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
  if (e.target.classList && e.target.classList.contains("modal-overlay") && e.target.classList.contains("active")) {
    closeModal(e.target.id);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay.active").forEach((m) => closeModal(m.id));
  }
});

/* ── Chart helpers (used by renderTrainingOverview) ── */
const _charts = {};
function destroyChart(id) {
  if (_charts[id]) { try { _charts[id].destroy(); } catch (e) {} delete _charts[id]; }
}
function safeCanvas(c) {
  try { c.getContext("2d"); return c; } catch { return null; }
}
function getTextColor() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "#0a0a0f" : "#94a3b8";
}

/* ── State ── */
const state = {
  data: {},
  operator: null,
  currentTab: "training-overview",
  charts: _charts,
};

/* ── D context that main/training.js expects ── */
const D = {
  $,
  state,
  toast,
  escapeHtml,
  timeAgo,
  fmtDate,
  fmtBytes,
  fmtKES,
  uid,
  todayStr: () => new Date().toISOString().slice(0, 10),
  db, ref, set, update, remove, push, get, onValue,
  P, ROOT,
  logActivity: async (type, title, description) => {
    try {
      const evRef = push(ref(db, P("activityLog")));
      await set(evRef, {
        id: evRef.key, type, title,
        description: description || "",
        by: state.operator?.uid || "system",
        byName: state.operator?.name || "System",
        timestamp: nowIso(),
      });
    } catch (e) { /* non-fatal */ }
  },
  callFn: async (name, payload) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Not signed in");
    const idToken = await user.getIdToken();
    const WORKER_URL = "https://viora-api.cliff254johns.workers.dev";
    const res = await fetch(`${WORKER_URL}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(payload || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
  openModal, closeModal,
  getClient: (id) => (state.data.entities || []).find((e) => e && e.id === id),
  getClientName: (id) => {
    const c = (state.data.entities || []).find((e) => e && e.id === id);
    return c?.name || "—";
  },
  getTextColor, destroyChart, safeCanvas,
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  AutoCertification: null, // assigned below once the module exports are loaded
  setupCertStampDragging,
  renderTrainingCertificates,
  renderTrainingProgress,
  renderTrainingQuizzes,
  updateSidebarCounters: () => {}, // no sidebar here
};

/* ── Splash helpers ── */
function showSplash(kind, title, subtitle) {
  const splash = $("saSplash");
  if (!splash) return;
  splash.classList.remove("hidden");
  if (kind === "ok") {
    splash.innerHTML = `
      <div class="icon ok"><i class="fa-solid fa-check"></i></div>
      <h1>${escapeHtml(title || "Access granted")}</h1>
      <p>${escapeHtml(subtitle || "")}</p>`;
  } else if (kind === "deny") {
    splash.innerHTML = `
      <div class="icon deny"><i class="fa-solid fa-lock"></i></div>
      <h1>${escapeHtml(title || "Access denied")}</h1>
      <p>${escapeHtml(subtitle || "")}</p>
      <button class="btn btn-danger" id="saDenyOut" style="margin-top:8px;">
        <i class="fa-solid fa-right-from-bracket"></i> Sign out
      </button>`;
    $("saDenyOut")?.addEventListener("click", () => signOut(auth).then(() => location.reload()));
  }
}
function hideSplash() {
  $("saSplash")?.classList.add("hidden");
  const shell = $("saShell");
  if (shell) shell.style.display = "flex";
}

/* ── Tabs ── */
function switchTab(name) {
  state.currentTab = "training-" + (name === "overview" ? "overview"
    : name === "requests" ? "requests"
    : name === "users" ? "users"
    : name === "progress" ? "progress"
    : name === "quizzes" ? "quizzes"
    : "certificates");

  document.querySelectorAll(".sa-tab").forEach((b) => b.classList.toggle("active", b.dataset.saTab === name));
  document.querySelectorAll(".sa-pane").forEach((p) => p.classList.toggle("active", p.id === "sa-pane-" + name));

  try {
    switch (name) {
      case "overview":     renderTrainingOverview();     break;
      case "requests":     renderTrainingRequests();     break;
      case "users":        renderTrainingUsers();        break;
      case "progress":     renderTrainingProgress();     break;
      case "quizzes":      renderTrainingQuizzes();      break;
      case "certificates": renderTrainingCertificates(); break;
    }
  } catch (e) { console.error("[sa] render failed for", name, e); toast("Render failed: " + e.message, "error"); }

  updateBadges();
}

function updateBadges() {
  const quizzes = Object.values(state.data.trainingQuizSubmissions || {})
    .flatMap((byCourse) => Object.values(byCourse || {}))
    .filter((q) => q && (q.status || "submitted") === "submitted").length;
  const requests = Object.values(state.data.trainingAccessRequests || {})
    .filter((r) => (r.status || "pending") === "pending").length;

  const qb = $("saQuizBadge");
  if (qb) { qb.textContent = quizzes; qb.style.display = quizzes > 0 ? "inline-block" : "none"; }
  const rb = $("saReqBadge");
  if (rb) { rb.textContent = requests; rb.style.display = requests > 0 ? "inline-block" : "none"; }
}

/* ── Subscriptions ── */
function subscribeTraining() {
  const PATHS = {
    trainingAccessRequests:    "training/accessRequests",
    trainingCourses:           "training/courses",
    trainingChecklists:        "training/checklists",
    trainingResources:         "training/resources",
    trainingEnrollments:       "training/enrollments",
    trainingProgress:          "training/progress",
    trainingCertificates:      "training/certificates",
    trainingQuizSubmissions:   "training/quizSubmissions",
    trainingCertTemplates:     "training/certificateTemplates",
    trainingCourseCompletions: "training/courseCompletions",
    trainingUsers:             "training/users",
  };

  for (const [key, path] of Object.entries(PATHS)) {
    const dbPath = P(path);
    onValue(ref(db, dbPath), (snap) => {
      state.data[key] = snap.exists() ? snap.val() : {};
      // Also flatten users/portalUsers into the shape training.js expects
      if (key === "trainingUsers") {
        state.data.users = [];
        state.data.portalUsers = [];
        for (const [uidKey, u] of Object.entries(state.data.trainingUsers || {})) {
          if (u && u.role === "trainer") state.data.users.push({ uid: uidKey, ...u });
          else state.data.portalUsers.push({ uid: uidKey, ...u });
        }
      }
      updateBadges();
      // Re-render current tab
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

  // Main org users + portalUsers for the client linking
  onValue(ref(db, `${ROOT}/users`), (snap) => {
    state.data.users = snap.exists()
      ? Object.entries(snap.val()).map(([u, v]) => ({ uid: u, ...v }))
      : [];
    try { renderTrainingUsers(); renderTrainingProgress(); } catch (e) {}
  }, () => {});
  onValue(ref(db, P("portalUsers")), (snap) => {
    state.data.portalUsers = snap.exists()
      ? Object.entries(snap.val()).map(([u, v]) => ({ uid: u, ...v }))
      : [];
    try { renderTrainingUsers(); renderTrainingProgress(); } catch (e) {}
  }, () => {});
}

/* ── Auth gate ── */
function bootAdmin() {
  initTraining(D);
  // Wire AutoCertification into D (used by "Re-run Auto-Award")
  try { D.AutoCertification = AutoCertification; } catch (e) {}
  bindTrainingEvents();

  // Wire buttons not auto-bound by bindTrainingEvents (refresh + clear + enroll + manual award)
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
  bind("manualAwardCertBtn",   "click", () => openManualAwardModal());
  bind("rerunAutoAwardBtn",    "click", () => AutoCertification?.backfillAll());
  bind("newCertTemplateBtn",   "click", () => openCertTemplateEditor());

  // Tab switches
  document.querySelectorAll(".sa-tab").forEach((b) => {
    if (b._saBound) return;
    b._saBound = true;
    b.addEventListener("click", () => switchTab(b.dataset.saTab));
  });

  // Sign out
  bind("saSignOutBtn", "click", () => {
    if (!confirm("Sign out of Scholar Admin?")) return;
    signOut(auth).then(() => location.reload());
  });

  // Theme toggle
  bind("saThemeBtn", "click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("viora_theme", next); } catch (e) {}
    const icon = $("saThemeBtn")?.querySelector("i");
    if (icon) icon.className = next === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
  });
  // Restore saved theme
  try {
    const saved = localStorage.getItem("viora_theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
  } catch (e) {}

  subscribeTraining();
  switchTab("overview");
}

/* ── Auth flow ── */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showSplash("deny", "Not signed in", "Scholar Admin requires an active VIORA session. Open main.html, sign in, then return here.");
    return;
  }

  try {
    const snap = await get(ref(db, `${ROOT}/users/${user.uid}`));
    const profile = snap.exists() ? snap.val() : null;
    const role = profile?.role || null;
    const allowed = role === "admin" || role === "exec";

    if (!allowed) {
      showSplash("deny", "Access denied", `Your role (${role || "unknown"}) does not have Scholar admin access. Ask a super-administrator to grant you admin or exec privileges.`);
      return;
    }

    state.operator = { uid: user.uid, ...profile };
    const who = $("saWhoami");
    if (who) who.textContent = profile.name || user.email || "Admin";

    showSplash("ok", "Access granted", `Welcome, ${profile.name || user.email}.`);
    setTimeout(() => {
      hideSplash();
      bootAdmin();
    }, 500);
  } catch (e) {
    console.error("[sa] auth check failed", e);
    showSplash("deny", "Verification failed", e.message || "Could not verify permissions.");
  }
});

/* ── Expose for inline onclick handlers in generated HTML ── */
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
  updateCleTask, addCleTask, removeCleTask,
  handleReFile, openResourceFile,
  TrainingVioraAPI,
  debug: { state, db, auth },
};

console.info("[scholar-admin] booted — default Firebase app, session shared with main.html");