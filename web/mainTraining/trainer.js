// File: mainTraining/trainer.js
// Trainer portal. Uses named Firebase app "trainer" (isolated auth session).
// Signup writes accessRequests/{uid} with role:"trainer". Approved → shell
// appears via onValue live swap. No signOut() on accessRequest write failure.

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getDatabase, ref, get, set, update, onValue, off, forceLongPolling } from "firebase/database";
import { publishVioraEvent } from "../shared/notification-bus.js";

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

const APP_NAME = "trainer";
const existingApp = getApps().find(a => a.name === APP_NAME);
const app = existingApp ? existingApp : initializeApp(firebaseConfig, APP_NAME);
const db = getDatabase(app); forceLongPolling(db);
const auth = getAuth(app);

const ROOT = "viora_data";
const ORG  = "orgs/viora";
const P = (path) => `${ROOT}/${ORG}/training/${path}`;
const USERS_ROOT = `${ROOT}/${ORG}/users`;

const $ = (id) => document.getElementById(id);
const uid = () => "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowIso = () => new Date().toISOString();

function escapeHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function timeAgo(iso) { if (!iso) return ""; const t = Date.parse(iso); if (!Number.isFinite(t)) return ""; const diff = Date.now() - t; if (diff < 60000) return "just now"; const m = Math.floor(diff / 60000); if (m < 60) return m + "m ago"; const h = Math.floor(m / 60); if (h < 24) return h + "h ago"; return Math.floor(h / 24) + "d ago"; }
function toast(msg, type) { const host = $("toastContainer"); if (!host) return; const el = document.createElement("div"); el.className = "toast " + (type || "info"); el.innerHTML = `<span>${escapeHtml(msg)}</span>`; host.appendChild(el); setTimeout(() => el.remove(), 4500); }

function openModal(id) { const el = $(id); if (el) { el.classList.add("active"); el.style.display = "flex"; document.body.style.overflow = "hidden"; } }
function closeModal(id) { const el = $(id); if (el) { el.classList.remove("active"); el.style.display = "none"; document.body.style.overflow = ""; } }
document.addEventListener("click", (e) => { const closer = e.target.closest("[data-close]"); if (closer) closeModal(closer.dataset.close); });

const state = { operator: null, courses: {}, enrollments: {}, progress: {}, quizSubmissions: {}, currentTab: "overview" };

function showScreen(name) {
  const login = $("trLoginScreen"); const pending = $("trPendingScreen"); const shell = $("trShell");
  if (login)   login.style.display   = name === "login"   ? "flex" : "none";
  if (pending) pending.style.display = name === "pending" ? "flex" : "none";
  if (shell)   shell.style.display   = name === "app"     ? "flex" : "none";
}

function setLoginMode(mode) {
  const isIn = mode === "signin";
  $("trTabSignIn")?.classList.toggle("active", isIn);
  $("trTabRequest")?.classList.toggle("active", !isIn);
  if ($("trSignInFields"))  $("trSignInFields").style.display  = isIn ? "block" : "none";
  if ($("trRequestFields")) $("trRequestFields").style.display = isIn ? "none"  : "block";
  if ($("trModeIndicator")) { $("trModeIndicator").textContent = isIn ? "Signing in" : "Requesting access"; $("trModeIndicator").classList.toggle("signup", !isIn); }
  if ($("trLoginHeading")) $("trLoginHeading").innerHTML = isIn ? 'Trainer <span>sign in</span>' : 'Request <span>access</span>';
  if ($("trLoginSubheading")) $("trLoginSubheading").textContent = isIn ? "Sign in to your trainer workspace" : "Apply for a trainer account";
  clearLoginMessage();
}

function showLoginMessage(msg, kind = "error") { const el = $("trLoginMessage"); if (!el) return; el.textContent = msg; el.className = "login-message " + kind; el.style.display = msg ? "block" : "none"; }
function clearLoginMessage() { const el = $("trLoginMessage"); if (el) { el.textContent = ""; el.style.display = "none"; } }

async function doTrainerSignIn() {
  const email = ($("trLoginEmail")?.value || "").trim();
  const password = $("trLoginPassword")?.value || "";
  const btn = $("trLoginBtn");
  if (!email || !password) { showLoginMessage("Enter your email and password."); return; }
  const orig = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in…'; }
  clearLoginMessage();
  try { await signInWithEmailAndPassword(auth, email, password); }
  catch (e) {
    const friendly = { "auth/invalid-email": "That email address is not valid.", "auth/user-not-found": "No account found with that email.", "auth/wrong-password": "Incorrect password.", "auth/invalid-credential": "Wrong email or password.", "auth/too-many-requests": "Too many attempts. Try again later.", "auth/network-request-failed": "Network error. Check your connection." }[e.code] || (e.message || "Sign-in failed.");
    showLoginMessage(friendly);
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

async function doTrainerRequest() {
  const name = ($("trReqName")?.value || "").trim();
  const email = ($("trReqEmail")?.value || "").trim().toLowerCase();
  const phone = ($("trReqPhone")?.value || "").trim();
  const expertise = ($("trReqExpertise")?.value || "").trim();
  const password = $("trReqPassword")?.value || "";
  const password2 = $("trReqPassword2")?.value || "";
  const btn = $("trRequestBtn");
  if (!name || !email || !password) { showLoginMessage("Name, email and password are required."); return; }
  if (password.length < 6) { showLoginMessage("Password must be at least 6 characters."); return; }
  if (password !== password2) { showLoginMessage("Passwords do not match."); return; }
  const orig = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting…'; }
  clearLoginMessage();

  let cred;
  try { cred = await createUserWithEmailAndPassword(auth, email, password); }
  catch (e) {
    const friendly = { "auth/email-already-in-use": "That email is already registered. Try signing in instead.", "auth/weak-password": "Password must be at least 6 characters.", "auth/invalid-email": "That email address is not valid." }[e.code] || (e.message || "Sign-up failed.");
    showLoginMessage(friendly, "error");
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    return;
  }

  try {
    const uidKey = cred.user.uid;
    const requestedAt = nowIso();
    await set(ref(db, P(`accessRequests/${uidKey}`)), { uid: uidKey, name, email, phone, expertise, role: "trainer", status: "pending", requestedAt, source: "trainer-portal" });
    await publishVioraEvent({ db, ref, set, get, eventId: uidKey, source: "scholar-trainer", category: "scholar", title: "Scholar: trainer application", body: `${name} submitted a trainer access application.`, url: "/scholar-admin.html", level: "warning", icon: "fa-chalkboard-user", actorUid: uidKey });
    try {
      const userSnap = await get(ref(db, `${USERS_ROOT}/${uidKey}`));
      if (!userSnap.exists()) await set(ref(db, `${USERS_ROOT}/${uidKey}`), { uid: uidKey, name, email, phone, role: "trainer", pendingApproval: true, source: "trainer-portal", createdAt: requestedAt });
    } catch (e) { console.warn("[trainer] profile seed failed:", e?.message); }
    toast("Request submitted. An admin will review it shortly.", "success");
  } catch (e) {
    console.error("[trainer] accessRequest write failed:", e);
    const friendly = e.code === "PERMISSION_DENIED" ? "Your request could not be saved (permission denied). Contact support@viora.co.ke." : (e.message || "Request failed.");
    showLoginMessage(friendly, "error");
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

async function doTrainerSignOut() { if (!confirm("Sign out of the trainer portal?")) return; try { await signOut(auth); } catch (e) {} }

let _ceModulesDraft = []; let _ceEditingId = null;
function renderCeModules() {
  const host = $("ceModulesList"); if (!host) return;
  if ($("ceModuleCount")) $("ceModuleCount").textContent = _ceModulesDraft.length;
  if (!_ceModulesDraft.length) { host.innerHTML = `<div class="empty-state" style="padding:24px;text-align:center;color:var(--text-secondary);font-size:.85rem;">No modules yet. Click <strong>Add Module</strong> to start.</div>`; return; }
  host.innerHTML = _ceModulesDraft.map((m, i) => `
    <div style="margin-bottom:10px;padding:14px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-input);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><strong style="font-size:.85rem;color:var(--accent-blue);">Module ${i + 1}</strong><button type="button" class="btn btn-danger btn-xs" onclick="window.removeCeModule(${i})"><i class="fa-solid fa-trash"></i></button></div>
      <label style="font-size:.72rem;">Title *</label>
      <input type="text" value="${escapeHtml(m.title)}" oninput="window.updateCeModule(${i}, 'title', this.value)" placeholder="e.g. Welcome" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color);background:#0a0a0f;color:#fff;margin-bottom:8px;" />
      <label style="font-size:.72rem;">Content</label>
      <textarea rows="3" oninput="window.updateCeModule(${i}, 'content', this.value)" placeholder="What this module covers" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color);background:#0a0a0f;color:#fff;">${escapeHtml(m.content)}</textarea>
    </div>
  `).join("");
}

window.updateCeModule = (i, field, value) => { if (_ceModulesDraft[i]) _ceModulesDraft[i][field] = value; };
window.addCeModule = () => { _ceModulesDraft.push({ id: "mod-" + uid().slice(0, 6), title: "", content: "", videoUrl: "", order: _ceModulesDraft.length }); renderCeModules(); };
window.removeCeModule = (i) => { if (confirm("Remove this module?")) { _ceModulesDraft.splice(i, 1); _ceModulesDraft.forEach((m, idx) => m.order = idx); renderCeModules(); } };

window.openCourseEditor = (courseId = null) => {
  _ceEditingId = courseId; _ceModulesDraft = [];
  if (courseId) {
    const c = state.courses[courseId]; if (!c) { toast("Course not found.", "error"); return; }
    if ($("courseEditorTitle")) $("courseEditorTitle").textContent = "Edit Course Draft";
    $("ceId").value = c.id || ""; $("ceId").disabled = true;
    $("ceTitle").value = c.title || ""; $("ceDescription").value = c.description || "";
    $("ceCategory").value = c.category || "Onboarding"; $("ceLevel").value = c.level || "Beginner"; $("ceRequiredFor").value = c.requiredFor || "";
    _ceModulesDraft = Object.entries(c.modules || {}).map(([id, m]) => ({ id, title: m.title || "", content: m.content || "", order: m.order || 0 })).sort((a, b) => a.order - b.order);
  } else {
    if ($("courseEditorTitle")) $("courseEditorTitle").textContent = "New Course Draft";
    $("ceId").disabled = false; $("ceId").value = ""; $("ceTitle").value = ""; $("ceDescription").value = "";
    $("ceCategory").value = "Onboarding"; $("ceLevel").value = "Beginner"; $("ceRequiredFor").value = "";
  }
  renderCeModules(); openModal("courseEditorModal");
};

window.saveCourse = async () => {
  const rawId = _ceEditingId || $("ceId").value;
  const id = _ceEditingId ? rawId : (rawId || "course-" + uid().slice(0, 6)).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const title = ($("ceTitle").value || "").trim();
  if (!title) { toast("Course title required.", "error"); return; }
  if (!_ceModulesDraft.length) { toast("Add at least one module.", "error"); return; }
  if (_ceModulesDraft.some(m => !m.title.trim())) { toast("Every module needs a title.", "error"); return; }
  const existing = state.courses[id];
  const modulesObj = {};
  _ceModulesDraft.forEach((m, idx) => { modulesObj[m.id] = { ...m, order: idx }; });
  const payload = { id, title, description: ($("ceDescription").value || "").trim(), category: $("ceCategory").value, level: $("ceLevel").value, requiredFor: ($("ceRequiredFor").value || "").trim(), modules: modulesObj, status: existing?.status || "draft", trainerId: state.operator?.uid || null, trainerName: state.operator?.name || "", createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso() };
  const btn = $("ceSaveBtn");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }
  try { await set(ref(db, P(`courses/${id}`)), payload); toast("Draft saved.", "success"); closeModal("courseEditorModal"); }
  catch (e) { toast("Save failed: " + e.message, "error"); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Draft'; } }
};

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll(".sch-nav-item").forEach(b => b.classList.toggle("active", b.dataset.trTab === tab));
  document.querySelectorAll(".sch-bnav-item").forEach(b => b.classList.toggle("active", b.dataset.trTab === tab));
  document.querySelectorAll(".sa-pane").forEach(p => p.classList.toggle("active", p.id === `tr-pane-${tab}`));
  if (window.innerWidth <= 768) $("trSidebar")?.classList.remove("open");
  if (tab === "overview") renderOverview();
  if (tab === "courses")  renderTrainerCourses();
  if (tab === "learners") renderLearners();
  if (tab === "grading")  renderGrading();
}

function renderOverview() {
  const myCourses = Object.values(state.courses || {}).filter(c => c.trainerId === state.operator?.uid);
  if ($("trOverviewKpi")) {
    $("trOverviewKpi").innerHTML = `
      <div class="stat-card" style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:16px;"><div style="color:var(--accent-blue);font-size:1.5rem;margin-bottom:8px;"><i class="fa-solid fa-book-open"></i></div><div style="font-size:1.5rem;font-weight:800;">${myCourses.length}</div><div style="font-size:.75rem;color:var(--text-secondary);text-transform:uppercase;">My Courses</div></div>
      <div class="stat-card" style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:16px;"><div style="color:var(--accent-green);font-size:1.5rem;margin-bottom:8px;"><i class="fa-solid fa-users"></i></div><div style="font-size:1.5rem;font-weight:800;">0</div><div style="font-size:.75rem;color:var(--text-secondary);text-transform:uppercase;">Students</div></div>
      <div class="stat-card" style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:16px;"><div style="color:var(--accent-gold);font-size:1.5rem;margin-bottom:8px;"><i class="fa-solid fa-file-signature"></i></div><div style="font-size:1.5rem;font-weight:800;">0</div><div style="font-size:.75rem;color:var(--text-secondary);text-transform:uppercase;">Pending Grades</div></div>
    `;
  }
  if ($("trRecentActivity")) $("trRecentActivity").innerHTML = `<div style="color:var(--text-secondary);font-size:.85rem;">No recent activity from your students.</div>`;
}

function renderTrainerCourses() {
  const myCourses = Object.values(state.courses || {}).filter(c => c.trainerId === state.operator?.uid);
  const grid = $("trCoursesGrid"); if (!grid) return;
  if (!myCourses.length) { grid.innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text-secondary);">You have not been assigned any courses yet. Click "Create Draft" to start one.</div>`; return; }
  grid.innerHTML = myCourses.map(c => {
    const statusMap = { draft: "status-draft", review: "status-review", published: "status-published" };
    const statusClass = statusMap[c.status] || "status-draft";
    return `<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:12px;"><div style="display:flex;justify-content:space-between;align-items:flex-start;"><div style="font-weight:700;font-size:1rem;">${escapeHtml(c.title)}</div><span class="badge ${statusClass}">${c.status || "Draft"}</span></div><div style="font-size:.8rem;color:var(--text-secondary);flex:1;">${escapeHtml(c.description || "No description")}</div><div style="display:flex;gap:8px;margin-top:8px;"><button class="btn btn-primary btn-sm" onclick="window.openCourseEditor('${c.id}')" style="background:linear-gradient(135deg,#00d4ff,#7c3aed);border:none;color:#fff;padding:8px 16px;border-radius:8px;"><i class="fa-solid fa-pen"></i> Edit</button>${c.status === "draft" ? `<button class="btn btn-success btn-sm" onclick="window.submitForReview('${c.id}')" style="background:linear-gradient(135deg,#22e6a0,#0d9e6e);border:none;color:#fff;padding:8px 16px;border-radius:8px;"><i class="fa-solid fa-paper-plane"></i> Submit</button>` : ""}</div></div>`;
  }).join("");
}

function renderLearners() { if ($("trLearnersBody")) $("trLearnersBody").innerHTML = `<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--text-secondary);">Learner tracking will populate once you have active enrollments.</td></tr>`; }
function renderGrading() { if ($("trGradingBody")) $("trGradingBody").innerHTML = `<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--text-secondary);">No quiz submissions awaiting grading.</td></tr>`; }

window.submitForReview = async (id) => {
  if (!confirm("Submit this course to the Admin for review and publication?")) return;
  try { await update(ref(db, P(`courses/${id}`)), { status: "review", updatedAt: nowIso() }); await publishVioraEvent({ db, ref, set, get, eventId: id, source: "scholar-course-review", category: "scholar", title: "Scholar: course submitted for review", body: `${state.operator?.name || "A trainer"} submitted ${state.courses[id]?.title || id} for admin review.`, url: "/scholar-admin.html", level: "warning", icon: "fa-clipboard-check", actorUid: state.operator?.uid || "" }); toast("Course submitted for review.", "success"); }
  catch (e) { toast("Failed: " + e.message, "error"); }
};

let _pendingRef = null; let _pendingUnsub = null;

function handleAuth(user) {
  if (_pendingUnsub) { try { _pendingUnsub(); } catch (e) {} _pendingUnsub = null; }
  if (_pendingRef) { try { off(_pendingRef, "value"); } catch (e) {} _pendingRef = null; }
  if (!user) { showScreen("login"); return; }
  const reqRef = ref(db, P(`accessRequests/${user.uid}`));
  const cb = (snap) => {
    const req = snap.exists() ? snap.val() : null;
    if (!req) { showScreen("login"); showLoginMessage("No trainer access request found for this account. Use the 'Request Access' tab to apply.", "info"); return; }
    if (req.status === "rejected") { showScreen("login"); showLoginMessage("Your trainer access request was declined. Contact the administrator.", "error"); return; }
    if (req.status === "pending") { const nm = $("trPendingName"); if (nm) nm.textContent = req.name || user.email || "Trainer"; showScreen("pending"); return; }
    if (req.status === "approved") {
      get(ref(db, `${USERS_ROOT}/${user.uid}`)).then((us) => {
        const profile = us.exists() ? us.val() : null;
        if (!profile) { showScreen("login"); showLoginMessage("Your request was approved but your profile is missing. Contact support.", "error"); return; }
        state.operator = { uid: user.uid, ...profile };
        const who = $("trWhoami"); if (who) who.textContent = profile.name || user.email || "Trainer";
        showScreen("app"); bootTrainerApp();
      }).catch((e) => { showScreen("login"); showLoginMessage("Could not load your profile: " + e.message, "error"); });
    }
  };
  onValue(reqRef, cb, (err) => { if (err && err.code !== "PERMISSION_DENIED") console.warn("[trainer] access sub failed", err); });
  _pendingRef = reqRef;
  _pendingUnsub = () => off(reqRef, "value", cb);
}

let _trainerBooted = false;
function bootTrainerApp() {
  if (_trainerBooted) return; _trainerBooted = true;
  onValue(ref(db, P("courses")), (s) => { state.courses = s.val() || {}; if (state.currentTab === "courses") renderTrainerCourses(); if (state.currentTab === "overview") renderOverview(); });
  onValue(ref(db, P("enrollments")), (s) => { state.enrollments = s.val() || {}; });
  document.querySelectorAll(".sch-nav-item").forEach((b) => { if (b._trBound) return; b._trBound = true; b.addEventListener("click", () => switchTab(b.dataset.trTab)); });
  document.querySelectorAll(".sch-bnav-item").forEach((b) => { if (b._trBound) return; b._trBound = true; b.addEventListener("click", () => switchTab(b.dataset.trTab)); });
  const newBtn = $("trNewCourseBtn"); if (newBtn && !newBtn._trBound) { newBtn._trBound = true; newBtn.addEventListener("click", () => window.openCourseEditor()); }
  const saveBtn = $("ceSaveBtn"); if (saveBtn && !saveBtn._trBound) { saveBtn._trBound = true; saveBtn.addEventListener("click", window.saveCourse); }
  const addBtn = $("ceAddModuleBtn"); if (addBtn && !addBtn._trBound) { addBtn._trBound = true; addBtn.addEventListener("click", window.addCeModule); }
  $("trMobileToggle")?.addEventListener("click", () => $("trSidebar").classList.add("open"));
  $("trSidebarOverlay")?.addEventListener("click", () => $("trSidebar").classList.remove("open"));
  $("trSignOutBtn")?.addEventListener("click", doTrainerSignOut);
  $("trPendingLogout")?.addEventListener("click", doTrainerSignOut);
  switchTab("overview");
}

function initLogin() {
  const params = new URLSearchParams(window.location.search);
  const requestMode = params.get("mode") === "request" || window.location.hash === "#request";
  setLoginMode(requestMode ? "request" : "signin");
  $("trTabSignIn")?.addEventListener("click", () => setLoginMode("signin"));
  $("trTabRequest")?.addEventListener("click", () => setLoginMode("request"));
  $("trLoginBtn")?.addEventListener("click", doTrainerSignIn);
  $("trRequestBtn")?.addEventListener("click", doTrainerRequest);
  $("trLoginPassword")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doTrainerSignIn(); } });
  $("trReqPassword2")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doTrainerRequest(); } });
  document.querySelectorAll(".pw-toggle").forEach((btn) => { if (btn._trBound) return; btn._trBound = true; btn.addEventListener("click", (e) => { e.preventDefault(); const id = btn.dataset.pwTarget; const input = document.getElementById(id); if (!input) return; const isPw = input.type === "password"; input.type = isPw ? "text" : "password"; btn.innerHTML = isPw ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>'; }); });
}

function boot() {
  initLogin();
  onAuthStateChanged(auth, (user) => { try { handleAuth(user); } catch (e) { console.error("[trainer] auth handler failed", e); showScreen("login"); } });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
