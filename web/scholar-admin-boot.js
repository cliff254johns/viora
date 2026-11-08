// File: scholar-admin-boot.js
// VIORA Scholar Admin Console bootstrap.
// Adds: Finance tab (payments + unlock requests), unlock actions,
// approve/reject/delete per row.

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

const ROOT = "viora_data";
const ORG  = "orgs/viora";
const P = (path) => `${ROOT}/${ORG}/${path}`;
const $ = (id) => document.getElementById(id);
const uid = () => "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowIso = () => new Date().toISOString();

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
function eatFmtClock() {
  try {
    return new Date().toLocaleString("en-GB", {
      timeZone: "Africa/Nairobi", day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }) + " EAT";
  } catch { return new Date().toISOString(); }
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
function fmtKES(n) { return "KES " + (Number(n) || 0).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Nairobi" }); }
  catch { return "—"; }
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
    trainingUsers: [], trainingPayments: {}, trainingUnlockRequests: {},
    users: [], portalUsers: [], entities: []
  },
  operator: null, currentTab: "training-command", charts: _charts
};

const D = {
  $, state, toast, escapeHtml, timeAgo, fmtDate, fmtKES, uid,
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

/* ═══════════════════════════════════════════════════════════════
   FINANCE HANDLERS
   ═══════════════════════════════════════════════════════════════ */
async function unlockCourseForLearner(uidKey, courseId, requestId) {
  try {
    /* 1. Add courseId to learner's individualCourses[] */
    const userSnap = await get(ref(db, `${ROOT}/${ORG}/training/users/${uidKey}`));
    const existing = userSnap.exists() ? userSnap.val() : {};
    const list = Array.isArray(existing.individualCourses) ? existing.individualCourses : [];
    if (!list.includes(courseId)) list.push(courseId);
    await update(ref(db, `${ROOT}/${ORG}/training/users/${uidKey}`), {
      uid: uidKey,
      individualCourses: list,
      updatedAt: nowIso()
    });

    /* 2. Mark the unlock request approved */
    if (requestId) {
      await update(ref(db, `${ROOT}/${ORG}/training/unlockRequests/${requestId}`), {
        status: "approved",
        approvedAt: nowIso(),
        approvedBy: state.operator?.name || "admin"
      });
    }

    toast("Course unlocked for learner.", "success");
    renderFinancePane();
  } catch (e) {
    console.error("[sa/unlock] failed:", e);
    toast("Unlock failed: " + e.message, "error");
  }
}

async function revokeCourseForLearner(uidKey, courseId) {
  if (!confirm("Revoke access to this course for the learner?")) return;
  try {
    const userSnap = await get(ref(db, `${ROOT}/${ORG}/training/users/${uidKey}`));
    const existing = userSnap.exists() ? userSnap.val() : {};
    const list = (existing.individualCourses || []).filter(id => id !== courseId);
    await update(ref(db, `${ROOT}/${ORG}/training/users/${uidKey}`), {
      individualCourses: list,
      updatedAt: nowIso()
    });
    toast("Access revoked.", "info");
    renderFinancePane();
  } catch (e) {
    toast("Revoke failed: " + e.message, "error");
  }
}

async function rejectUnlockRequest(requestId) {
  if (!confirm("Reject this unlock request?")) return;
  try {
    await update(ref(db, `${ROOT}/${ORG}/training/unlockRequests/${requestId}`), {
      status: "rejected",
      rejectedAt: nowIso(),
      rejectedBy: state.operator?.name || "admin"
    });
    toast("Request rejected.", "info");
    renderFinancePane();
  } catch (e) { toast("Reject failed: " + e.message, "error"); }
}

async function deleteUnlockRequest(requestId) {
  if (!confirm("Delete this request permanently?")) return;
  try {
    await remove(ref(db, `${ROOT}/${ORG}/training/unlockRequests/${requestId}`));
    toast("Request deleted.", "success");
    renderFinancePane();
  } catch (e) { toast("Delete failed: " + e.message, "error"); }
}

async function deletePayment(paymentId) {
  if (!confirm("Delete this payment record?")) return;
  try {
    await remove(ref(db, `${ROOT}/${ORG}/training/payments/${paymentId}`));
    toast("Payment deleted.", "success");
    renderFinancePane();
  } catch (e) { toast("Delete failed: " + e.message, "error"); }
}

async function recordManualPayment(uidKey, courseId, amount, method) {
  const paymentId = "pay-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const payment = {
    id: paymentId,
    uid: uidKey,
    courseId,
    amountKES: amount,
    method: method || "manual",
    status: "paid",
    recordedAt: nowIso(),
    recordedBy: state.operator?.name || "admin"
  };
  try {
    await set(ref(db, `${ROOT}/${ORG}/training/payments/${paymentId}`), payment);
    toast("Payment recorded.", "success");
    renderFinancePane();
  } catch (e) { toast("Record failed: " + e.message, "error"); }
}

/* ═══════════════════════════════════════════════════════════════
   DELEGATED CLICK HANDLER (finance actions)
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fin-action]");
  if (!btn) return;
  const action = btn.dataset.finAction;
  const uidKey = btn.dataset.uid;
  const courseId = btn.dataset.courseId;
  const requestId = btn.dataset.requestId;
  const paymentId = btn.dataset.paymentId;

  e.preventDefault(); e.stopPropagation();
  if (action === "unlock")      unlockCourseForLearner(uidKey, courseId, requestId);
  else if (action === "revoke") revokeCourseForLearner(uidKey, courseId);
  else if (action === "reject") rejectUnlockRequest(requestId);
  else if (action === "delete-request") deleteUnlockRequest(requestId);
  else if (action === "delete-payment") deletePayment(paymentId);
});

/* ═══════════════════════════════════════════════════════════════
   RENDER: FINANCE PANE
   ═══════════════════════════════════════════════════════════════ */
function renderFinancePane() {
  try {
    const payments = Object.values(state.data.trainingPayments || {});
    const requests = Object.entries(state.data.trainingUnlockRequests || {})
      .map(([id, r]) => ({ id, ...(r || {}) }))
      .sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));

    const pendingReqs = requests.filter(r => (r.status || "pending") === "pending").length;
    const paidTotal = payments.reduce((s, p) => s + (Number(p.amountKES) || 0), 0);
    const uniqueLearners = new Set(payments.map(p => p.uid)).size;

    const kpi = $("finKpi");
    if (kpi) {
      kpi.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-coins"></i></div><div class="number">${fmtKES(paidTotal)}</div><div class="label">Total Revenue</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-receipt"></i></div><div class="number">${payments.length}</div><div class="label">Paid Courses</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-users"></i></div><div class="number">${uniqueLearners}</div><div class="label">Paying Learners</div></div>
        <div class="stat-card" style="${pendingReqs ? 'border-left:4px solid var(--accent-gold);' : ''}"><div class="stat-icon"><i class="fa-solid fa-lock-open"></i></div><div class="number">${pendingReqs}</div><div class="label">Pending Unlock Requests</div></div>
      `;
    }

    const badge = $("saFinBadge");
    if (badge) { badge.textContent = pendingReqs; badge.style.display = pendingReqs > 0 ? "inline-block" : "none"; }

    const urTb = $("finUnlockRequestsBody");
    if (urTb) {
      if (!requests.length) {
        urTb.innerHTML = `<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--text-secondary);">No unlock requests yet. Learners who click Contact Support on locked courses appear here.</td></tr>`;
      } else {
        urTb.innerHTML = requests.map(r => {
          const st = (r.status || "pending").toLowerCase();
          const stCls = st === "approved" ? "paid" : st === "rejected" ? "overdue" : "pending";
          const actions = st === "pending"
            ? `<button class="btn btn-success btn-xs" data-fin-action="unlock" data-uid="${escapeHtml(r.uid)}" data-course-id="${escapeHtml(r.courseId)}" data-request-id="${escapeHtml(r.id)}"><i class="fa-solid fa-lock-open"></i> Unlock</button>
               <button class="btn btn-danger btn-xs" data-fin-action="reject" data-request-id="${escapeHtml(r.id)}"><i class="fa-solid fa-xmark"></i> Reject</button>`
            : `<button class="btn btn-danger btn-xs" data-fin-action="delete-request" data-request-id="${escapeHtml(r.id)}" title="Delete"><i class="fa-solid fa-trash"></i></button>`;
          return `<tr>
            <td>${timeAgo(r.requestedAt)}</td>
            <td><strong>${escapeHtml(r.userName || "—")}</strong><br><small style="color:var(--text-secondary);">${escapeHtml(r.userEmail || "")}</small></td>
            <td>${escapeHtml(r.courseTitle || "—")}<br><small style="color:var(--text-secondary);">${escapeHtml(r.courseId || "")}</small></td>
            <td><span class="badge badge-active">${escapeHtml(r.courseTier || "—")}</span></td>
            <td>${r.coursePrice > 0 ? fmtKES(r.coursePrice) : 'Free'}</td>
            <td><span class="badge badge-${stCls}">${escapeHtml(st)}</span></td>
            <td style="text-align:right;white-space:nowrap;">${actions}</td>
          </tr>`;
        }).join("");
      }
    }

    const pTb = $("finPaymentsBody");
    if (pTb) {
      const sorted = payments.sort((a, b) => (b.recordedAt || "").localeCompare(a.recordedAt || ""));
      if (!sorted.length) {
        pTb.innerHTML = `<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--text-secondary);">No payments recorded yet.</td></tr>`;
      } else {
        pTb.innerHTML = sorted.map(p => `
          <tr>
            <td>${p.recordedAt ? timeAgo(p.recordedAt) : "—"}</td>
            <td><strong>${escapeHtml(p.userName || p.uid || "—")}</strong><br><small style="color:var(--text-secondary);">${escapeHtml(p.userEmail || "")}</small></td>
            <td>${escapeHtml(p.courseTitle || p.courseId || "—")}</td>
            <td><strong style="color:var(--accent-green);">${fmtKES(p.amountKES)}</strong></td>
            <td><span class="badge badge-active">${escapeHtml(p.method || "manual")}</span></td>
            <td><span class="badge badge-paid">paid</span></td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn btn-outline btn-xs" data-fin-action="revoke" data-uid="${escapeHtml(p.uid)}" data-course-id="${escapeHtml(p.courseId)}" title="Revoke course access"><i class="fa-solid fa-lock"></i></button>
              <button class="btn btn-danger btn-xs" data-fin-action="delete-payment" data-payment-id="${escapeHtml(p.id)}" title="Delete payment"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>
        `).join("");
      }
    }
  } catch (e) {
    console.error("[sa] renderFinancePane failed:", e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   APPROVE / REJECT TRAINING ACCESS REQUESTS (existing)
   ═══════════════════════════════════════════════════════════════ */
async function approveRequest(uidKey) {
  if (!uidKey) return;
  const req = getRequestsArray().find(r => (r.uid || r.id) === uidKey);
  const role = req?.role || "learner";
  try {
    await update(ref(db, P(`training/accessRequests/${uidKey}`)), {
      status: "approved", approvedAt: nowIso(), approvedBy: state.operator?.name || "admin"
    });
    try {
      await update(ref(db, `${ROOT}/${ORG}/users/${uidKey}`), {
        role, trainingStatus: "approved", trainingApprovedAt: nowIso(), pendingApproval: false
      });
    } catch (e) {}
    /* Also ensure training/users record with free tier */
    try {
      const us = await get(ref(db, `${ROOT}/${ORG}/training/users/${uidKey}`));
      if (!us.exists()) {
        await set(ref(db, `${ROOT}/${ORG}/training/users/${uidKey}`), {
          uid: uidKey,
          name: req?.name || "",
          email: req?.email || "",
          role,
          tiers: ["free"],
          individualCourses: [],
          createdAt: nowIso()
        });
      }
    } catch (e) {}
    toast(`Approved ${role}.`, "success");
    await _fetchRequestsNow();
    renderRequestsPane();
    renderCommandCenter();
  } catch (e) { toast("Approve failed: " + e.message, "error"); }
}
async function rejectRequest(uidKey) {
  if (!uidKey) return;
  if (!confirm("Reject this request?")) return;
  try {
    await update(ref(db, P(`training/accessRequests/${uidKey}`)), { status: "rejected", rejectedAt: nowIso(), rejectedBy: state.operator?.name || "admin" });
    toast("Rejected.", "info");
    await _fetchRequestsNow(); renderRequestsPane(); renderCommandCenter();
  } catch (e) { toast("Reject failed: " + e.message, "error"); }
}
async function reopenRequest(uidKey) {
  if (!uidKey) return;
  try {
    await update(ref(db, P(`training/accessRequests/${uidKey}`)), { status: "pending", reopenedAt: nowIso(), reopenedBy: state.operator?.name || "admin" });
    toast("Reopened — now pending.", "info");
    await _fetchRequestsNow(); renderRequestsPane(); renderCommandCenter();
  } catch (e) { toast("Reopen failed: " + e.message, "error"); }
}
async function deleteRequest(uidKey) {
  if (!uidKey) return;
  if (!confirm("Delete this request permanently?")) return;
  try {
    await remove(ref(db, P(`training/accessRequests/${uidKey}`)));
    toast("Request deleted.", "success");
    await _fetchRequestsNow(); renderRequestsPane(); renderCommandCenter();
  } catch (e) { toast("Delete failed: " + e.message, "error"); }
}

/* ═══════════════════════════════════════════════════════════════
   DELEGATED CLICK (access request actions)
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action][data-uid]");
  if (!btn) return;
  const action = btn.getAttribute("data-action");
  const uidKey = btn.getAttribute("data-uid");
  if (!uidKey) return;
  e.preventDefault(); e.stopPropagation();
  if (action === "approve") approveRequest(uidKey);
  else if (action === "reject") rejectRequest(uidKey);
  else if (action === "reopen") reopenRequest(uidKey);
  else if (action === "delete") deleteRequest(uidKey);
  else if (action === "goto-requests") switchTab("requests");
});

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
  unlockCourseForLearner, revokeCourseForLearner,
  rejectUnlockRequest, deleteUnlockRequest, deletePayment, recordManualPayment,
  openUserTraining:        (uid) => TrainingVioraAPI.openUserTraining(uid),
  enrollUserInCourse:      (uid, cid) => TrainingVioraAPI.enrollUserInCourse(uid, cid),
  unenrollUser:            (uid, cid) => TrainingVioraAPI.unenrollUser(uid, cid),
  resetUserCourseProgress: (uid, cid) => TrainingVioraAPI.resetUserCourseProgress(uid, cid),
  resetAllUserTraining:    (uid) => TrainingVioraAPI.resetAllUserTraining(uid),
  deleteTrainingUser:      (uid) => TrainingVioraAPI.deleteTrainingUser(uid),
  revokeCertificate:       (cid) => TrainingVioraAPI.revokeCertificate(cid),
  TrainingVioraAPI, openModal, closeModal,
  refreshRequests: () => { _fetchRequestsNow().then(() => renderRequestsPane()); },
  renderFinancePane
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
    const portalArr = Object.entries(data.portalUsersRaw || {}).map(([id, v]) => ({ id, uid: id, ...(v || {}) }));

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

    /* Pending requests notification */
    const pendingReqs = getRequestsArray().filter(r => (r.status || "pending") === "pending");
    const notifHost = $("cmdRequestsNotif");
    if (notifHost) {
      if (pendingReqs.length === 0) notifHost.innerHTML = "";
      else {
        const items = pendingReqs.slice(0, 5).map(r => {
          const isTrainer = r.role === "trainer";
          const badge = isTrainer ? '<span class="badge badge-purple" style="font-size:.6rem;">Trainer</span>' : '<span class="badge badge-active" style="font-size:.6rem;">Learner</span>';
          return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,200,87,.06);border-left:3px solid var(--accent-gold);border-radius:8px;margin-bottom:8px;">
            <i class="fa-solid fa-user-clock" style="color:var(--accent-gold);"></i>
            <div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:.85rem;">${escapeHtml(r.name || r.email || "—")}</div><div style="font-size:.7rem;color:var(--text-secondary);">${badge} · ${timeAgo(r.requestedAt)}</div></div>
            <button class="btn btn-success btn-xs" data-action="approve" data-uid="${escapeHtml(r.uid || r.id)}"><i class="fa-solid fa-check"></i></button>
            <button class="btn btn-danger btn-xs" data-action="reject" data-uid="${escapeHtml(r.uid || r.id)}"><i class="fa-solid fa-xmark"></i></button>
          </div>`;
        }).join("");
        notifHost.innerHTML = `<div style="padding:16px;background:rgba(255,200,87,.08);border:1px solid rgba(255,200,87,.35);border-radius:16px;margin-bottom:20px;"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;"><h4 style="font-size:.85rem;font-weight:700;color:var(--accent-gold);margin:0;"><i class="fa-solid fa-bell"></i> ${pendingReqs.length} Pending Request${pendingReqs.length === 1 ? "" : "s"}</h4><button class="btn btn-outline btn-xs" data-action="goto-requests"><i class="fa-solid fa-arrow-right"></i> View All</button></div>${items}</div>`;
      }
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

    const stamp = $("cmdLastRefresh");
    if (stamp) stamp.textContent = eatFmtClock();
  } catch (e) {
    console.error("[sa] renderCommandCenter failed:", e);
  }
}

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
      updateBadges();
      return arr;
    }
    state.data.trainingAccessRequests = [];
    return [];
  } catch (e) {
    console.error("[sa/fetch] accessRequests failed:", e.code, e.message);
    return [];
  }
}

function renderRequestsPane() {
  try {
    const prevLen = getRequestsArray().length;
    _fetchRequestsNow().then((fresh) => {
      if (fresh.length > prevLen) setTimeout(() => renderRequestsPane(), 0);
    });

    const all = getRequestsArray();
    const statusFilter = ($("trainingRequestsFilter")?.value || "all").toLowerCase();
    const roleFilter = ($("trainingRequestsRoleFilter")?.value || "all").toLowerCase();
    const search = ($("trainingRequestsSearch")?.value || "").toLowerCase().trim();

    const pending = all.filter(r => (r.status || "pending") === "pending").length;
    const approved = all.filter(r => r.status === "approved").length;
    const rejected = all.filter(r => r.status === "rejected").length;

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
      `;
    }

    const badge = $("saReqBadge");
    if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? "inline-block" : "none"; }

    const tb = $("trainingRequestsBody");
    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="8" style="padding:32px;text-align:center;color:var(--text-secondary);">No requests yet.</td></tr>`;
      return;
    }

    tb.innerHTML = list.map(r => {
      const st = (r.status || "pending").toLowerCase();
      const stCls = st === "approved" ? "paid" : st === "rejected" ? "overdue" : "pending";
      const isTrainer = r.role === "trainer";
      const roleLabel = isTrainer ? '<span class="badge badge-purple">Trainer</span>' : '<span class="badge badge-active">Learner</span>';
      const safeUid = escapeHtml(r.uid || r.id || "");
      const actions = st === "pending"
        ? `<button class="btn btn-success btn-xs" data-action="approve" data-uid="${safeUid}"><i class="fa-solid fa-check"></i> Approve</button>
           <button class="btn btn-danger btn-xs" data-action="reject" data-uid="${safeUid}"><i class="fa-solid fa-xmark"></i> Reject</button>`
        : `<button class="btn btn-outline btn-xs" data-action="reopen" data-uid="${safeUid}"><i class="fa-solid fa-rotate-left"></i> Reopen</button>`;
      return `<tr>
        <td>${timeAgo(r.requestedAt)}</td>
        <td><strong>${escapeHtml(r.name || "—")}</strong></td>
        <td>${escapeHtml(r.email || "—")}</td>
        <td>${escapeHtml(r.phone || "—")}</td>
        <td>${roleLabel}</td>
        <td><span class="badge badge-${stCls}">${escapeHtml(st)}</span></td>
        <td style="text-align:right;white-space:nowrap;">
          ${actions}
          <button class="btn btn-danger btn-xs" data-action="delete" data-uid="${safeUid}" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join("");
  } catch (e) { console.error("[sa] renderRequestsPane failed:", e); }
}

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
    if (name === "finance")      renderFinancePane();
  } catch (e) { console.error("[sa] render failed", name, e); }
  updateBadges();
}

function updateBadges() {
  const quizzes = Object.values(state.data.trainingQuizSubmissions || {})
    .flatMap((byCourse) => Object.values(byCourse || {}))
    .filter((q) => q && (q.status || "submitted") === "submitted").length;
  const requests = getRequestsArray().filter((r) => (r.status || "pending") === "pending").length;
  const unlocks = Object.values(state.data.trainingUnlockRequests || {}).filter(r => (r.status || "pending") === "pending").length;
  if ($("saQuizBadge")) { $("saQuizBadge").textContent = quizzes; $("saQuizBadge").style.display = quizzes > 0 ? "inline-block" : "none"; }
  if ($("saReqBadge")) { $("saReqBadge").textContent = requests; $("saReqBadge").style.display = requests > 0 ? "inline-block" : "none"; }
  if ($("saFinBadge")) { $("saFinBadge").textContent = unlocks; $("saFinBadge").style.display = unlocks > 0 ? "inline-block" : "none"; }
}

async function subscribeTraining() {
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
    trainingUsers:            "training/users",
    trainingPayments:         "training/payments",
    trainingUnlockRequests:   "training/unlockRequests"
  };
  const ARRAY_KEYS = ["trainingCertificates", "trainingUsers", "trainingAccessRequests"];

  for (const [key, path] of Object.entries(PATHS)) {
    onValue(ref(db, P(path)), (snap) => {
      const raw = snap.exists() ? snap.val() : {};
      const incoming = normalize(raw, ARRAY_KEYS.includes(key));

      if (key === "trainingAccessRequests") {
        state.data[key] = Object.entries(raw || {}).map(([uidKey, v]) => ({ uid: uidKey, ...(v || {}), id: uidKey }));
      } else if (key === "trainingUnlockRequests") {
        state.data[key] = raw || {};
      } else if (key === "trainingPayments") {
        state.data[key] = raw || {};
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
        if (name === "finance")      renderFinancePane();
      } catch (e) {}
    }, (err) => {
      if (err.code !== "PERMISSION_DENIED") console.error(`[sa/sub] ${path} failed:`, err.code, err.message);
    });
  }

  _fetchRequestsNow();
}

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

  bind("finRefreshBtn", "click", () => { renderFinancePane(); toast("Refreshed.", "info"); });

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
  let chosenProfile = null;
  for (const path of candidatePaths) {
    try {
      const snap = await get(ref(db, path));
      if (snap.exists()) {
        const val = snap.val();
        const rawRole = val?.role ?? val?.type ?? val?.accessLevel ?? null;
        const normRole = typeof rawRole === "string" ? rawRole.toLowerCase().trim() : null;
        if (normRole === "admin" || normRole === "exec") { chosenProfile = val; break; }
        if (!chosenProfile) chosenProfile = val;
      }
    } catch (e) {}
  }
  if (!chosenProfile) {
    showSplash("deny", "Profile not found", `No record for UID ${user.uid.slice(0,8)}…`);
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
