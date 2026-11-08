// mainTraining/training.js — LEARNER portal
// Isolated auth session: named app "training".
// Admin (default app) and trainer ("trainer" app) sessions are untouched by
// anything this file does. Sign-in/sign-up here does NOT log out anyone else.

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut, sendPasswordResetEmail
} from "firebase/auth";
import {
  getDatabase, ref, set, get, update, remove, onValue, off, forceLongPolling
} from "firebase/database";

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

/* ═══════════════════════════════════════════════════════════════
   ISOLATED AUTH SESSION
   The learner portal uses its own named Firebase app so that signing
   in or enrolling here never touches the admin or trainer sessions.
   localStorage key: firebase:authUser:<apiKey>:training
   (admin uses :[DEFAULT], trainer uses :trainer)
   ═══════════════════════════════════════════════════════════════ */
const APP_NAME = "training";

let app;
const existing = getApps().find(a => a.name === APP_NAME);
if (existing) {
  app = existing;
} else {
  app = initializeApp(firebaseConfig, APP_NAME);
}

const auth = getAuth(app);
const db = getDatabase(app);
forceLongPolling(db);

/* Base paths */
const SCHOLAR      = "viora_data/orgs/viora/training";
const USERS        = "viora_data/orgs/viora/users";
const PORTAL_USERS = "viora_data/orgs/viora/portalUsers";

const S = {
  user: null, access: null,
  courses: {}, checklists: {}, resources: {},
  enrollments: {}, progress: {}, checklistProgress: {},
  quizSubmissions: {}, certificates: {},
  currentTab: "overview",
  activeCourseId: null, activeModuleId: null, activeQuizCourseId: null,
  pendingQuizAnswers: {},
  subscriptions: [],
  bootDone: false
};

const $ = (id) => document.getElementById(id);
const nowIso = () => new Date().toISOString();

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
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}
function toast(msg, type = "info") {
  const host = $("toastContainer");
  if (!host) { console.log("[toast]", type, msg); return; }
  while (host.children.length >= 5) host.removeChild(host.firstElementChild);
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.innerHTML = `<span>${escapeHtml(msg)}</span>`;
  const btn = document.createElement("button");
  btn.className = "toast-close"; btn.type = "button"; btn.textContent = "×";
  el.appendChild(btn);
  let timer = null;
  const dismiss = () => { if (timer) { clearTimeout(timer); timer = null; } if (el.isConnected) el.remove(); };
  btn.addEventListener("click", dismiss, { once: true });
  host.appendChild(el);
  timer = setTimeout(dismiss, 5000);
}

function showLoginMessage(msg, kind = "error") {
  const el = $("loginMessage");
  if (!el) return;
  el.textContent = msg;
  el.className = "login-message " + kind;
  el.style.display = msg ? "block" : "none";
}
function clearLoginMessage() {
  const el = $("loginMessage");
  if (el) { el.textContent = ""; el.style.display = "none"; }
}

function youtubeId(url) {
  if (!url) return null;
  const m = String(url).trim().match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
function renderVideoEmbed(url) {
  if (!url) return "";
  const yt = youtubeId(url);
  const src = yt ? `https://www.youtube.com/embed/${yt}` : url;
  return `<div class="lesson-video"><iframe src="${escapeHtml(src)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="no-referrer"></iframe></div>`;
}
function notify(opts) {
  try {
    if (typeof window.vioraNotify === "function") window.vioraNotify(opts).catch?.(() => {});
  } catch (_) {}
}

function showScreen(name) {
  const login = $("loginScreen");
  const pending = $("pendingScreen");
  const shell = $("appShell");
  if (login) login.style.display = name === "login" ? "flex" : "none";
  if (pending) pending.style.display = name === "pending" ? "flex" : "none";
  if (shell) shell.style.display = name === "app" ? "block" : "none";
  document.body.classList.toggle("is-app-view", name === "app");
}

function initLoginTabs() {
  const tabIn = $("tabSignIn");
  const tabReg = $("tabRegister");
  const inFields = $("signInFields");
  const regFields = $("registerFields");
  if (!tabIn || !tabReg) return;
  const setMode = (mode) => {
    tabIn.classList.toggle("active", mode === "in");
    tabReg.classList.toggle("active", mode === "reg");
    if (inFields) inFields.style.display = mode === "in" ? "block" : "none";
    if (regFields) regFields.style.display = mode === "reg" ? "block" : "none";
    clearLoginMessage();
  };
  tabIn.addEventListener("click", () => setMode("in"));
  tabReg.addEventListener("click", () => setMode("reg"));
}

async function doSignIn() {
  const email = ($("loginEmail")?.value || "").trim();
  const password = $("loginPassword")?.value || "";
  const btn = $("loginBtn");
  if (!email || !password) { showLoginMessage("Enter your email and password."); return; }
  const orig = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Signing in…'; }
  clearLoginMessage();
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    const friendly = {
      "auth/invalid-email": "That email address isn't valid.",
      "auth/user-not-found": "No account found with that email.",
      "auth/wrong-password": "Incorrect password.",
      "auth/invalid-credential": "Wrong email or password.",
      "auth/too-many-requests": "Too many attempts. Try again later.",
      "auth/network-request-failed": "Network error. Check your connection."
    }[e.code] || (e.message || "Sign-in failed.");
    showLoginMessage(friendly);
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

async function doRegister() {
  const name = ($("regName")?.value || "").trim();
  const email = ($("regEmail")?.value || "").trim().toLowerCase();
  const phone = ($("regPhone")?.value || "").trim();
  const password = $("regPassword")?.value || "";
  const btn = $("registerBtn");

  if (!name || !email || !password) { showLoginMessage("Name, email, and password are required."); return; }
  if (password.length < 6) { showLoginMessage("Password must be at least 6 characters."); return; }

  const orig = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Creating…'; }
  clearLoginMessage();

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    const requestedAt = nowIso();

    await set(ref(db, `${SCHOLAR}/accessRequests/${uid}`), {
      uid, name, email, phone,
      status: "pending", requestedAt, source: "training-portal"
    });

    try {
      const snap = await get(ref(db, `${USERS}/${uid}`));
      if (!snap.exists()) {
        await set(ref(db, `${USERS}/${uid}`), {
          uid, name, email, role: "learner", createdAt: requestedAt
        });
      }
    } catch (_) {}

  } catch (e) {
    const friendly = {
      "auth/email-already-in-use": "That email is already registered. Try signing in instead.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/invalid-email": "That email address isn't valid."
    }[e.code] || (e.message || "Sign-up failed.");
    showLoginMessage(friendly);
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

async function doSignOut() {
  try { await signOut(auth); } catch (e) { console.warn("[training] sign-out failed", e); }
  location.reload();
}

function trackSub(unsub) { if (typeof unsub === "function") S.subscriptions.push(unsub); }
function teardownSubs() {
  for (const u of S.subscriptions) { try { u(); } catch (_) {} }
  S.subscriptions = [];
}
function subNode(path, handler) {
  const r = ref(db, path);
  const cb = (snap) => handler(snap.exists() ? snap.val() : null);
  onValue(r, cb, (err) => console.warn("[training] sub error", path, err));
  trackSub(() => off(r, "value", cb));
}

function handleAuth(user) {
  teardownSubs();
  S.user = user || null;
  S.access = null;
  if (!user) { showScreen("login"); return; }

  const accessRef = ref(db, `${SCHOLAR}/accessRequests/${user.uid}`);
  const accessCb = (snap) => {
    const val = snap.exists() ? snap.val() : null;
    S.access = val;
    if (!val) {
      showScreen("login");
      showLoginMessage("No training access request found for this account. Click the 'First Time' tab to request access.");
      return;
    }
    if (val.status === "rejected") {
      showScreen("login");
      showLoginMessage("Your training access request was declined. Contact the admin.");
      return;
    }
    if (val.status === "pending") {
      const pName = $("pendingName");
      if (pName) pName.textContent = val.name || user.email || "there";
      showScreen("pending");
      return;
    }
    if (val.status === "approved") {
      if (!S.bootDone) { S.bootDone = true; bootLearnerApp(); }
      showScreen("app");
      return;
    }
  };
  onValue(accessRef, accessCb, (err) => {
    console.warn("[training] access sub failed", err);
    showScreen("login");
    showLoginMessage("Could not verify access. Please refresh.");
  });
  trackSub(() => off(accessRef, "value", accessCb));
}

function bootLearnerApp() {
  if (!S.user) return;
  const uid = S.user.uid;
  const who = $("whoami");
  if (who) who.textContent = S.access?.name || S.user.email || "Learner";

  subNode(`${SCHOLAR}/courses`, (v) => { S.courses = v || {}; renderActiveTab(); });
  subNode(`${SCHOLAR}/checklists`, (v) => { S.checklists = v || {}; if (S.currentTab === "checklists") renderChecklists(); });
  subNode(`${SCHOLAR}/resources`, (v) => { S.resources = v || {}; if (S.currentTab === "resources") renderResources(); });

  subNode(`${SCHOLAR}/enrollments/${uid}`, (v) => { S.enrollments = v || {}; renderActiveTab(); });
  subNode(`${SCHOLAR}/progress/${uid}`, (v) => { S.progress = v || {}; renderActiveTab(); });
  subNode(`${SCHOLAR}/checklistProgress/${uid}`, (v) => { S.checklistProgress = v || {}; if (S.currentTab === "checklists") renderChecklists(); });
  subNode(`${SCHOLAR}/quizSubmissions/${uid}`, (v) => { S.quizSubmissions = v || {}; renderActiveTab(); });

  subNode(`${SCHOLAR}/certificates`, (all) => {
    const filtered = {};
    for (const [id, c] of Object.entries(all || {})) if (c && c.uid === uid) filtered[id] = c;
    S.certificates = filtered;
    if (S.currentTab === "certificates") renderCertificates();
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    if (btn._tnBound) return; btn._tnBound = true;
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  document.querySelectorAll("#mobileBottomNav .mnav-item").forEach((btn) => {
    if (btn._tnBound) return; btn._tnBound = true;
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mobileBottomNav .mnav-item").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      switchTab(btn.dataset.mtab);
    });
  });

  $("logoutBtn")?.addEventListener("click", doSignOut);
  $("mobileLogoutBtn")?.addEventListener("click", doSignOut);
  $("themeToggle")?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
  });

  document.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => closeModal(el.dataset.close));
  });
  document.querySelectorAll(".modal-overlay").forEach((ov) => {
    ov.addEventListener("click", (e) => { if (e.target === ov) closeModal(ov.id); });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".modal-overlay.active").forEach((m) => closeModal(m.id));
  });

  $("lessonCompleteBtn")?.addEventListener("click", onLessonCompleteClick);
  $("quizSubmitBtn")?.addEventListener("click", submitQuiz);
  $("certPrintBtn")?.addEventListener("click", printCertificate);

  switchTab("overview");
}

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("active"); el.style.display = "flex";
  document.body.style.overflow = "hidden";
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("active"); el.style.display = "none";
  if (!document.querySelector(".modal-overlay.active")) document.body.style.overflow = "";
}

function switchTab(tab) {
  S.currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".ptab").forEach(p => p.classList.toggle("active", p.id === "tab-" + tab));
  document.querySelectorAll("#mobileBottomNav .mnav-item").forEach(b => b.classList.toggle("active", b.dataset.mtab === tab));
  renderActiveTab();
}
function renderActiveTab() {
  switch (S.currentTab) {
    case "overview":     renderOverview();     break;
    case "courses":      renderCourses();      break;
    case "checklists":   renderChecklists();   break;
    case "progress":     renderProgress();     break;
    case "certificates": renderCertificates(); break;
    case "resources":    renderResources();    break;
  }
}

function courseList() {
  return Object.values(S.courses || {}).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
}
function modulesOf(course) {
  if (!course || !course.modules) return [];
  return Object.values(course.modules).sort((a, b) => (a.order || 0) - (b.order || 0));
}
function isEnrolled(courseId) { return !!S.enrollments?.[courseId]; }
function moduleDone(courseId, moduleId) {
  const p = S.progress?.[courseId]?.[moduleId];
  return !!(p && p.completedAt);
}
function coursePct(course) {
  const mods = modulesOf(course);
  if (!mods.length) return 0;
  let done = 0;
  for (const m of mods) if (moduleDone(course.id, m.id)) done++;
  return Math.round((done / mods.length) * 100);
}
function courseDone(course) {
  const mods = modulesOf(course);
  if (!mods.length) return false;
  return mods.every((m) => moduleDone(course.id, m.id));
}
function courseAvgScore(courseId) {
  const sub = S.quizSubmissions?.[courseId];
  if (!sub) return null;
  return (typeof sub.finalScore === "number") ? sub.finalScore :
         (typeof sub.autoScore === "number") ? sub.autoScore : null;
}
function firstIncompleteModule(course) {
  const mods = modulesOf(course);
  for (const m of mods) if (!moduleDone(course.id, m.id)) return m;
  return mods[mods.length - 1] || null;
}
function hasCertificateFor(courseId) {
  return Object.values(S.certificates || {}).some((c) => c && c.courseId === courseId);
}

function renderOverview() {
  const host = $("tab-overview");
  if (!host) return;
  const enrolledIds = Object.keys(S.enrollments || {});
  const allCourses = courseList();
  const enrolledCourses = allCourses.filter((c) => enrolledIds.includes(c.id));
  const inProgress = enrolledCourses.filter((c) => !courseDone(c) && coursePct(c) > 0).length;
  const completed = enrolledCourses.filter((c) => courseDone(c)).length;
  const certCount = Object.keys(S.certificates || {}).length;

  const kpiHtml = `
    <div class="kpi-grid">
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-book-open"></i></div><div class="number">${enrolledCourses.length}</div><div class="label">Enrolled</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-spinner"></i></div><div class="number">${inProgress}</div><div class="label">In Progress</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div><div class="number">${completed}</div><div class="label">Completed</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-certificate"></i></div><div class="number">${certCount}</div><div class="label">Certificates</div></div>
    </div>
  `;
  let continueHtml = "";
  const continueCourse = enrolledCourses.find((c) => !courseDone(c));
  if (continueCourse) {
    const pct = coursePct(continueCourse);
    const nextMod = firstIncompleteModule(continueCourse);
    continueHtml = `
      <div class="chart-box" style="border-left:4px solid var(--accent-blue);margin-top:20px;">
        <h4><i class="fa-solid fa-play"></i> Continue learning</h4>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <div style="font-weight:700;font-size:1rem;">${escapeHtml(continueCourse.title)}</div>
            <div style="font-size:.8rem;color:var(--text-secondary);margin-top:4px;">Next: ${escapeHtml(nextMod ? nextMod.title : "—")}</div>
            <div class="progress-3d" style="margin-top:10px;"><div class="progress-3d-bar ${pct >= 100 ? "green" : pct >= 50 ? "" : "gold"}" style="width:${pct}%;"></div></div>
            <div class="progress-3d-label"><span>Progress</span><span>${pct}%</span></div>
          </div>
          <button class="btn btn-primary" onclick="VioraTraining.openCourse('${continueCourse.id}')"><i class="fa-solid fa-play"></i> Resume</button>
        </div>
      </div>
    `;
  }

  const recommended = allCourses.filter((c) => !isEnrolled(c.id)).slice(0, 4);
  let recHtml = "";
  if (recommended.length) {
    recHtml = `
      <div style="margin-top:24px;">
        <h2 style="font-size:1rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;margin-bottom:12px;"><i class="fa-solid fa-star" style="color:var(--accent-gold);"></i> Recommended for you</h2>
        <div class="card-3d-grid">${recommended.map(courseCardHtml).join("")}</div>
      </div>
    `;
  }

  const activity = buildActivityFeed().slice(0, 6);
  const activityHtml = activity.length
    ? activity.map(a => `
        <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border-color);">
          <i class="fa-solid ${a.icon}" style="color:${a.color};margin-top:2px;"></i>
          <div style="flex:1;min-width:0;">
            <div style="font-size:.84rem;font-weight:600;">${escapeHtml(a.title)}</div>
            <div style="font-size:.72rem;color:var(--text-secondary);">${escapeHtml(a.sub)}</div>
          </div>
          <div style="font-size:.68rem;color:var(--text-light);white-space:nowrap;">${timeAgo(a.ts)}</div>
        </div>
      `).join("")
    : `<div style="color:var(--text-secondary);font-size:.82rem;padding:12px;">No activity yet. Enroll in a course to get started.</div>`;

  host.innerHTML = `
    <div class="page-header">
      <div>
        <h1><span class="highlight">Welcome back, ${escapeHtml(S.access?.name || "Learner")}</span></h1>
        <p class="page-desc">Your personal learning dashboard. Everything here is just for you.</p>
      </div>
    </div>
    ${kpiHtml}
    ${continueHtml}
    <div class="chart-grid" style="margin-top:24px;">
      <div class="chart-box"><h4><i class="fa-solid fa-bolt"></i> Recent Activity</h4><div style="max-height:340px;overflow-y:auto;">${activityHtml}</div></div>
      <div class="chart-box"><h4><i class="fa-solid fa-chart-pie"></i> My Progress</h4>
        <div style="padding:14px 4px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:.82rem;"><span>Courses completed</span><strong>${completed} / ${enrolledCourses.length}</strong></div>
          <div class="progress-3d"><div class="progress-3d-bar green" style="width:${enrolledCourses.length ? Math.round(completed / enrolledCourses.length * 100) : 0}%;"></div></div>
          <div style="display:flex;justify-content:space-between;margin:14px 0 6px;font-size:.82rem;"><span>Certificates earned</span><strong>${certCount}</strong></div>
        </div>
      </div>
    </div>
    ${recHtml}
  `;
}

function buildActivityFeed() {
  const events = [];
  const allCourses = courseList();
  const byId = Object.fromEntries(allCourses.map(c => [c.id, c]));

  for (const [cid, e] of Object.entries(S.enrollments || {})) {
    if (e.startedAt) {
      events.push({ ts: e.startedAt, icon: "fa-user-plus", color: "var(--accent-blue)", title: "Enrolled in " + (byId[cid]?.title || cid), sub: "Started learning" });
    }
    if (e.completedAt) {
      events.push({ ts: e.completedAt, icon: "fa-circle-check", color: "var(--accent-green)", title: "Completed " + (byId[cid]?.title || cid), sub: "All modules done" });
    }
  }
  for (const [cid, mods] of Object.entries(S.progress || {})) {
    for (const [mid, m] of Object.entries(mods || {})) {
      if (m.completedAt) {
        const modTitle = byId[cid]?.modules?.[mid]?.title || mid;
        events.push({ ts: m.completedAt, icon: "fa-check", color: "var(--text-secondary)", title: "Module complete", sub: modTitle });
      }
    }
  }
  for (const [cid, sub] of Object.entries(S.quizSubmissions || {})) {
    if (sub.submittedAt) {
      events.push({ ts: sub.submittedAt, icon: "fa-file-circle-question", color: "var(--accent-purple)", title: "Quiz submitted", sub: (byId[cid]?.title || cid) + " · score " + (sub.autoScore ?? "—") + "%" });
    }
  }
  for (const c of Object.values(S.certificates || {})) {
    if (c.issuedAt) {
      events.push({ ts: c.issuedAt, icon: "fa-award", color: "var(--accent-gold)", title: "Certificate awarded", sub: c.courseTitle || c.courseId });
    }
  }
  events.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
  return events;
}

function renderCourses() {
  const host = $("tab-courses");
  if (!host) return;
  const all = courseList();
  const enrolled = all.filter(c => isEnrolled(c.id));
  const available = all.filter(c => !isEnrolled(c.id));
  const myHtml = enrolled.length
    ? `<div class="card-3d-grid">${enrolled.map(courseCardHtml).join("")}</div>`
    : `<div class="empty-state" style="padding:24px;text-align:center;color:var(--text-secondary);">You haven't enrolled in any courses yet. Pick one from Available below.</div>`;
  const availHtml = available.length
    ? `<div class="card-3d-grid">${available.map(courseCardHtml).join("")}</div>`
    : `<div class="empty-state" style="padding:24px;text-align:center;color:var(--text-secondary);">You're enrolled in every course. 🎉</div>`;
  host.innerHTML = `
    <div class="page-header"><div><h1><span class="highlight">Courses</span></h1><p class="page-desc">Browse, enroll, and take your training courses. Your progress is saved per course.</p></div></div>
    <h2 style="font-size:1rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;margin-bottom:12px;"><i class="fa-solid fa-book-open"></i> My Courses (${enrolled.length})</h2>
    ${myHtml}
    <h2 style="font-size:1rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;margin:32px 0 12px;"><i class="fa-solid fa-store"></i> Available Courses (${available.length})</h2>
    ${availHtml}
  `;
}

function courseCardHtml(course) {
  const mods = modulesOf(course);
  const modCount = mods.length;
  const enrolled = isEnrolled(course.id);
  const pct = enrolled ? coursePct(course) : 0;
  const done = enrolled && courseDone(course);
  const cert = hasCertificateFor(course.id);
  const sub = S.quizSubmissions?.[course.id];
  const awaitingGrade = enrolled && done && !cert && sub;
  const level = course.level || "Beginner";
  const cat = course.category || "General";
  const cidSafe = escapeHtml(course.id);

  let statusChip;
  if (cert)             statusChip = `<span class="badge badge-paid">🎓 Certified</span>`;
  else if (awaitingGrade) statusChip = `<span class="badge badge-pending">Awaiting cert</span>`;
  else if (done)        statusChip = `<span class="badge badge-pending">Completed</span>`;
  else if (enrolled)    statusChip = `<span class="badge badge-active">In progress</span>`;
  else                  statusChip = `<span class="badge badge-gray">Not started</span>`;

  const actionBtn = enrolled
    ? `<button class="btn btn-primary btn-sm" onclick="VioraTraining.openCourse('${cidSafe}')"><i class="fa-solid fa-play"></i> ${done ? "Review" : "Continue"}</button>`
    : `<button class="btn btn-success btn-sm" onclick="VioraTraining.enrollAndOpen('${cidSafe}')"><i class="fa-solid fa-plus"></i> Enroll</button>`;

  return `
    <div class="card-3d">
      <div class="card-info" style="min-width:0;">
        <div class="card-title">${escapeHtml(course.title || "Untitled")} ${statusChip}</div>
        <div class="card-sub"><i class="fa-solid fa-layer-group" style="opacity:.6;"></i> ${cat} · <i class="fa-solid fa-signal" style="opacity:.6;"></i> ${escapeHtml(level)} · ${modCount} module${modCount === 1 ? "" : "s"}</div>
        ${course.description ? `<div style="font-size:.78rem;color:var(--text-secondary);margin-top:6px;">${escapeHtml(course.description.slice(0, 140))}${course.description.length > 140 ? "…" : ""}</div>` : ""}
        ${enrolled ? `<div class="progress-3d" style="margin-top:10px;"><div class="progress-3d-bar ${pct >= 100 ? "green" : pct >= 50 ? "" : "gold"}" style="width:${pct}%;"></div></div><div class="progress-3d-label"><span>Progress</span><span>${pct}%</span></div>` : ""}
      </div>
      <div class="card-actions">${actionBtn}</div>
    </div>
  `;
}

function renderChecklists() {
  const host = $("tab-checklists");
  if (!host) return;
  const lists = Object.values(S.checklists || {});
  if (!lists.length) {
    host.innerHTML = `<div class="page-header"><div><h1><span class="highlight">Onboarding</span></h1></div></div><div class="empty-state" style="padding:40px;text-align:center;color:var(--text-secondary);">No onboarding checklists have been assigned yet.</div>`;
    return;
  }
  host.innerHTML = `
    <div class="page-header"><div><h1><span class="highlight">Onboarding</span></h1><p class="page-desc">Tick each item as you complete it. Your progress is saved automatically.</p></div></div>
    <div class="card-3d-grid">${lists.map(checklistCardHtml).join("")}</div>
  `;
}
function checklistCardHtml(cl) {
  const tasks = (cl.tasks || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const prog = S.checklistProgress?.[cl.id] || {};
  const doneCount = tasks.filter(t => prog[t.id]?.done).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const rows = tasks.map(t => {
    const done = !!(prog[t.id]?.done);
    return `
      <label style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border-color);cursor:pointer;">
        <input type="checkbox" ${done ? "checked" : ""} data-cl="${escapeHtml(cl.id)}" data-task="${escapeHtml(t.id)}" class="cl-task-checkbox" style="width:auto;margin-top:3px;" />
        <span style="flex:1;font-size:.85rem;${done ? "text-decoration:line-through;color:var(--text-light);" : ""}">${escapeHtml(t.text || "")}</span>
      </label>`;
  }).join("");
  return `
    <div class="card-3d" style="grid-column:1/-1;display:block;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
        <div>
          <div style="font-weight:700;font-size:1rem;">${escapeHtml(cl.title || "Checklist")}</div>
          ${cl.description ? `<div style="font-size:.78rem;color:var(--text-secondary);margin-top:2px;">${escapeHtml(cl.description)}</div>` : ""}
        </div>
        <div style="font-size:.82rem;font-weight:600;color:${pct >= 100 ? "var(--accent-green)" : "var(--text-secondary)"};">${doneCount} / ${tasks.length} done</div>
      </div>
      <div class="progress-3d" style="margin-bottom:12px;"><div class="progress-3d-bar ${pct >= 100 ? "green" : pct >= 50 ? "" : "gold"}" style="width:${pct}%;"></div></div>
      <div>${rows}</div>
    </div>`;
}

document.addEventListener("change", async (e) => {
  const cb = e.target.closest(".cl-task-checkbox");
  if (!cb || !S.user) return;
  const clId = cb.dataset.cl;
  const taskId = cb.dataset.task;
  if (!clId || !taskId) return;
  const path = `${SCHOLAR}/checklistProgress/${S.user.uid}/${clId}/${taskId}`;
  try {
    if (cb.checked) {
      await set(ref(db, path), { done: true, doneAt: nowIso() });
    } else {
      await remove(ref(db, path));
    }
    S.checklistProgress[clId] = S.checklistProgress[clId] || {};
    if (cb.checked) S.checklistProgress[clId][taskId] = { done: true, doneAt: nowIso() };
    else delete S.checklistProgress[clId][taskId];
    renderChecklists();
  } catch (err) {
    console.warn("[training] checklist write failed", err);
    toast("Could not save that. Retry.", "error");
    cb.checked = !cb.checked;
  }
});

function renderProgress() {
  const host = $("tab-progress");
  if (!host) return;
  const enrolledIds = Object.keys(S.enrollments || {});
  const allCourses = courseList().filter(c => enrolledIds.includes(c.id));
  if (!allCourses.length) {
    host.innerHTML = `<div class="page-header"><div><h1><span class="highlight">My Progress</span></h1></div></div><div class="empty-state" style="padding:40px;text-align:center;color:var(--text-secondary);">Enroll in a course to start tracking your progress.</div>`;
    return;
  }
  const rows = allCourses.map(c => {
    const mods = modulesOf(c);
    const doneCount = mods.filter(m => moduleDone(c.id, m.id)).length;
    const pct = mods.length ? Math.round((doneCount / mods.length) * 100) : 0;
    const avg = courseAvgScore(c.id);
    const cert = hasCertificateFor(c.id);
    const done = courseDone(c);
    const sub = S.quizSubmissions?.[c.id];
    const awaiting = done && !cert && sub;
    let status;
    if (cert) status = `<span class="badge badge-paid">🎓 Certified</span>`;
    else if (awaiting) status = `<span class="badge badge-pending">Awaiting certificate</span>`;
    else if (done) status = `<span class="badge badge-active">Completed</span>`;
    else if (pct > 0) status = `<span class="badge badge-active">In progress</span>`;
    else status = `<span class="badge badge-gray">Not started</span>`;
    const e = S.enrollments?.[c.id] || {};
    return `<tr>
      <td><strong>${escapeHtml(c.title || "")}</strong></td>
      <td>${doneCount} / ${mods.length}</td>
      <td><div class="progress-3d" style="margin:4px 0;"><div class="progress-3d-bar ${pct >= 100 ? "green" : pct >= 50 ? "" : "gold"}" style="width:${pct}%;"></div></div><small>${pct}%</small></td>
      <td>${avg != null ? avg + "%" : "—"}</td>
      <td><small>${e.startedAt ? fmtDate(e.startedAt) : "—"}</small></td>
      <td>${status}</td>
      <td style="text-align:right;"><button class="btn btn-primary btn-xs" onclick="VioraTraining.openCourse('${escapeHtml(c.id)}')"><i class="fa-solid fa-eye"></i> Open</button></td>
    </tr>`;
  }).join("");
  host.innerHTML = `
    <div class="page-header"><div><h1><span class="highlight">My Progress</span></h1><p class="page-desc">Module-by-module completion across every course you're enrolled in.</p></div></div>
    <div class="table-wrapper"><table><thead><tr><th>Course</th><th>Modules</th><th>Progress</th><th>Avg Score</th><th>Started</th><th>Status</th><th style="text-align:right;">Action</th></tr></thead><tbody>${rows}</tbody></table></div>
  `;
}

function renderCertificates() {
  const host = $("tab-certificates");
  if (!host) return;
  const certs = Object.values(S.certificates || {}).sort((a, b) => (b.issuedAt || "").localeCompare(a.issuedAt || ""));
  if (!certs.length) {
    host.innerHTML = `<div class="page-header"><div><h1><span class="highlight">Certificates</span></h1><p class="page-desc">Finish a course to earn your certificate. The admin will award it once your final quiz is reviewed.</p></div></div><div class="empty-state" style="padding:40px;text-align:center;color:var(--text-secondary);"><i class="fa-solid fa-award" style="font-size:2.4rem;opacity:.4;margin-bottom:12px;display:block;"></i>No certificates yet. Complete a course to get started.</div>`;
    return;
  }
  host.innerHTML = `
    <div class="page-header"><div><h1><span class="highlight">Certificates</span></h1><p class="page-desc">Awarded by the VIORA admin after your final quiz is reviewed.</p></div></div>
    <div class="card-3d-grid">${certs.map(certCardHtml).join("")}</div>
  `;
}
function certCardHtml(cert) {
  const idSafe = escapeHtml(cert.id);
  const hasImage = !!cert.renderedImage;
  return `
    <div class="card-3d">
      <div style="width:100%;height:150px;border-radius:10px;overflow:hidden;background:var(--bg-input);display:flex;align-items:center;justify-content:center;">
        ${hasImage ? `<img src="${cert.renderedImage}" style="max-width:100%;max-height:100%;object-fit:contain;" alt="Certificate" />` : `<i class="fa-solid fa-award" style="font-size:2.4rem;color:var(--accent-gold);"></i>`}
      </div>
      <div class="card-info">
        <div class="card-title">${escapeHtml(cert.courseTitle || "Course")}</div>
        <div class="card-sub">${escapeHtml(cert.moduleTitle || "Whole course")} · Score ${cert.score ?? "—"}%</div>
        <div class="card-sub" style="font-family:monospace;font-size:.72rem;">${escapeHtml(cert.code || cert.id)}</div>
        <div class="card-sub" style="font-size:.7rem;">Issued ${fmtDate(cert.issuedAt)}</div>
      </div>
      <div class="card-actions">
        <button class="btn btn-primary btn-sm" onclick="VioraTraining.viewCertificate('${idSafe}')"><i class="fa-solid fa-eye"></i> View</button>
      </div>
    </div>`;
}

function renderResources() {
  const host = $("tab-resources");
  if (!host) return;
  const list = Object.values(S.resources || {}).sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.title || "").localeCompare(b.title || ""));
  if (!list.length) {
    host.innerHTML = `<div class="page-header"><div><h1><span class="highlight">Resources</span></h1></div></div><div class="empty-state" style="padding:40px;text-align:center;color:var(--text-secondary);">No resources have been shared yet.</div>`;
    return;
  }
  const byCat = {};
  for (const r of list) {
    const k = r.category || "General";
    (byCat[k] = byCat[k] || []).push(r);
  }
  host.innerHTML = `
    <div class="page-header"><div><h1><span class="highlight">Resources</span></h1><p class="page-desc">Documents, videos, links, and reference material.</p></div></div>
    ${Object.entries(byCat).map(([cat, items]) => `
      <h2 style="font-size:.9rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;margin:20px 0 10px;"><i class="fa-solid fa-folder"></i> ${escapeHtml(cat)} (${items.length})</h2>
      <div class="card-3d-grid">${items.map(resourceCardHtml).join("")}</div>
    `).join("")}
  `;
}
function resourceCardHtml(r) {
  const iconMap = { PDF: "fa-file-pdf", Document: "fa-file-lines", Video: "fa-file-video", Link: "fa-link", Spreadsheet: "fa-file-excel", Slides: "fa-file-powerpoint", Other: "fa-file" };
  const icon = iconMap[r.type] || "fa-file";
  const idSafe = escapeHtml(r.id);
  return `
    <div class="card-3d" style="cursor:pointer;" onclick="VioraTraining.openResource('${idSafe}')">
      <div class="avatar-mini lg" style="border-radius:10px;"><i class="fa-solid ${icon}"></i></div>
      <div class="card-info">
        <div class="card-title">${escapeHtml(r.title || "Untitled")}</div>
        <div class="card-sub">${escapeHtml(r.type || "")}${r.fileName ? " · " + escapeHtml(r.fileName) : ""}</div>
        ${r.description ? `<div class="card-sub" style="margin-top:4px;">${escapeHtml(r.description.slice(0, 120))}${r.description.length > 120 ? "…" : ""}</div>` : ""}
      </div>
      <div class="card-actions"><button class="btn btn-primary btn-xs"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open</button></div>
    </div>`;
}

function openCourse(courseId) {
  const course = S.courses[courseId];
  if (!course) { toast("Course not found.", "error"); return; }
  if (!isEnrolled(courseId)) { enrollAndOpen(courseId); return; }
  const mod = firstIncompleteModule(course);
  if (!mod) { toast("This course has no modules yet.", "info"); return; }
  openLesson(courseId, mod.id);
}
function enrollAndOpen(courseId) {
  if (!S.user) return;
  const course = S.courses[courseId];
  if (!course) { toast("Course not found.", "error"); return; }
  const existing = S.enrollments?.[courseId];
  if (existing) { openCourse(courseId); return; }
  const payload = {
    courseId, startedAt: nowIso(), progress: 0, completedAt: null,
    enrolledBy: S.user.uid,
    enrolledByName: S.access?.name || S.user.email || "Learner",
    enrolledAt: nowIso()
  };
  set(ref(db, `${SCHOLAR}/enrollments/${S.user.uid}/${courseId}`), payload)
    .then(() => {
      S.enrollments[courseId] = payload;
      notify({ title: "Enrolled in course", body: course.title || courseId, level: "success", source: "training-enroll" });
      toast("Enrolled. Let's get started!", "success");
      const mod = firstIncompleteModule(course);
      if (mod) openLesson(courseId, mod.id);
      else toast("This course has no modules yet.", "info");
    })
    .catch((e) => {
      console.error("[training] enroll failed", e);
      toast("Could not enroll. Retry.", "error");
    });
}

function openLesson(courseId, moduleId) {
  const course = S.courses[courseId];
  if (!course) return;
  const modules = modulesOf(course);
  const idx = modules.findIndex(m => m.id === moduleId);
  if (idx < 0) return;
  const mod = modules[idx];

  S.activeCourseId = courseId;
  S.activeModuleId = moduleId;

  const titleEl = $("lessonTitle");
  if (titleEl) titleEl.textContent = `${course.title} — ${mod.title || "Module " + (idx + 1)}`;

  const bodyEl = $("lessonBody");
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:12px;">Module ${idx + 1} of ${modules.length}${moduleDone(courseId, moduleId) ? ' · <span style="color:var(--accent-green);">✓ Completed</span>' : ""}</div>
      ${mod.videoUrl ? renderVideoEmbed(mod.videoUrl) : ""}
      <div class="lesson-content" style="font-size:.9rem;line-height:1.7;color:var(--text-primary);white-space:pre-wrap;margin-top:14px;">${escapeHtml(mod.content || "(No written content for this module.)")}</div>
      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:20px;">
        ${idx > 0
          ? `<button type="button" class="btn btn-outline btn-sm" onclick="VioraTraining.openLesson('${escapeHtml(courseId)}', '${escapeHtml(modules[idx - 1].id)}')"><i class="fa-solid fa-chevron-left"></i> Previous</button>`
          : `<button type="button" class="btn btn-outline btn-sm" disabled><i class="fa-solid fa-chevron-left"></i> Previous</button>`}
        ${idx < modules.length - 1
          ? `<button type="button" class="btn btn-outline btn-sm" onclick="VioraTraining.openLesson('${escapeHtml(courseId)}', '${escapeHtml(modules[idx + 1].id)}')">Next <i class="fa-solid fa-chevron-right"></i></button>`
          : ""}
      </div>
    `;
  }

  const btn = $("lessonCompleteBtn");
  if (btn) {
    const isLast = idx === modules.length - 1;
    const hasQuiz = isLast && Array.isArray(mod.quiz) && mod.quiz.length > 0;
    const done = moduleDone(courseId, moduleId);
    if (hasQuiz && !done) {
      btn.innerHTML = '<i class="fa-solid fa-file-circle-question"></i> Take Final Quiz';
      btn.disabled = false; btn.dataset.mode = "quiz";
    } else if (done) {
      btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Completed';
      btn.disabled = true; btn.dataset.mode = "done";
    } else {
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Mark Module Complete';
      btn.disabled = false; btn.dataset.mode = "complete";
    }
  }
  openModal("lessonModal");
}

async function onLessonCompleteClick() {
  const btn = $("lessonCompleteBtn");
  if (!btn || btn.disabled) return;
  const courseId = S.activeCourseId;
  const moduleId = S.activeModuleId;
  if (!courseId || !moduleId || !S.user) return;
  const course = S.courses[courseId];
  if (!course) return;
  const mod = course.modules?.[moduleId];
  if (!mod) return;
  if (btn.dataset.mode === "quiz") { openQuiz(courseId, moduleId); return; }
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
  try {
    await set(ref(db, `${SCHOLAR}/progress/${S.user.uid}/${courseId}/${moduleId}`), { moduleId, completedAt: nowIso() });
    S.progress[courseId] = S.progress[courseId] || {};
    S.progress[courseId][moduleId] = { moduleId, completedAt: nowIso() };
    if (courseDone(course)) {
      await update(ref(db, `${SCHOLAR}/enrollments/${S.user.uid}/${courseId}`), { completedAt: nowIso(), progress: 100 });
      S.enrollments[courseId] = { ...(S.enrollments[courseId] || {}), completedAt: nowIso(), progress: 100 };
      notify({ title: "Course completed", body: course.title || courseId, level: "success", source: "training-complete" });
      toast("Course complete! The admin will review your final quiz.", "success");
    } else {
      toast("Module complete.", "success");
    }
    const modules = modulesOf(course);
    const idx = modules.findIndex(m => m.id === moduleId);
    const next = modules[idx + 1];
    if (next) openLesson(courseId, next.id);
    else { closeModal("lessonModal"); renderActiveTab(); }
  } catch (e) {
    console.error("[training] complete failed", e);
    toast("Could not save. Retry.", "error");
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Mark Module Complete';
  }
}

function openQuiz(courseId, moduleId) {
  const course = S.courses[courseId];
  if (!course) return;
  const mod = course.modules?.[moduleId];
  if (!mod || !Array.isArray(mod.quiz) || !mod.quiz.length) { toast("No quiz attached to this module.", "info"); return; }
  const existing = S.quizSubmissions?.[courseId];
  if (existing && existing.moduleId === moduleId) {
    toast("You already submitted this quiz. Awaiting admin review.", "info");
    return;
  }
  S.activeQuizCourseId = courseId;
  S.pendingQuizAnswers = {};

  const titleEl = $("quizTitle");
  if (titleEl) titleEl.textContent = course.title;
  const bodyEl = $("quizBody");
  if (bodyEl) {
    bodyEl.innerHTML = mod.quiz.map((q, qi) => `
      <div class="quiz-question" style="margin-bottom:20px;padding:14px;background:var(--bg-input);border-radius:12px;border:1px solid var(--border-color);">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:10px;">${qi + 1}. ${escapeHtml(q.q || "")}</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${(q.options || []).map((opt, oi) => `
            <label style="display:flex;gap:10px;align-items:center;padding:9px 12px;background:var(--bg-card-solid);border:1.5px solid var(--border-color);border-radius:9px;cursor:pointer;font-size:.85rem;">
              <input type="radio" name="quiz-q-${qi}" value="${oi}" data-q="${qi}" class="quiz-radio" style="width:auto;" />
              <span>${escapeHtml(opt)}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `).join("");
  }
  bodyEl?.querySelectorAll(".quiz-radio").forEach(radio => {
    radio.addEventListener("change", (e) => {
      const qi = Number(e.target.dataset.q);
      S.pendingQuizAnswers[qi] = Number(e.target.value);
    });
  });
  closeModal("lessonModal");
  openModal("quizModal");
}

async function submitQuiz() {
  const courseId = S.activeQuizCourseId;
  if (!courseId || !S.user) return;
  const course = S.courses[courseId];
  if (!course) return;
  const modules = modulesOf(course);
  const mod = modules[modules.length - 1];
  if (!mod || !Array.isArray(mod.quiz) || !mod.quiz.length) return;
  const total = mod.quiz.length;
  const answers = S.pendingQuizAnswers || {};
  if (Object.keys(answers).length === 0) { toast("Please answer at least one question.", "warning"); return; }

  let correct = 0;
  for (let qi = 0; qi < total; qi++) {
    if (typeof answers[qi] === "number" && answers[qi] === mod.quiz[qi].answer) correct++;
  }
  const autoScore = Math.round((correct / total) * 100);

  const btn = $("quizSubmitBtn");
  const orig = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting…'; }

  try {
    const submission = {
      uid: S.user.uid,
      userName: S.access?.name || S.user.email || "Learner",
      userEmail: S.user.email || "",
      courseId, courseTitle: course.title || courseId,
      moduleId: mod.id, moduleTitle: mod.title || "",
      questions: mod.quiz.map(q => ({ q: q.q, options: q.options, answer: q.answer })),
      answers, autoScore,
      status: "submitted", submittedAt: nowIso()
    };
    await set(ref(db, `${SCHOLAR}/quizSubmissions/${S.user.uid}/${courseId}`), submission);
    await set(ref(db, `${SCHOLAR}/progress/${S.user.uid}/${courseId}/${mod.id}`), { moduleId: mod.id, completedAt: nowIso(), score: autoScore });
    await update(ref(db, `${SCHOLAR}/enrollments/${S.user.uid}/${courseId}`), { completedAt: nowIso(), progress: 100 });

    S.quizSubmissions[courseId] = submission;
    S.progress[courseId] = S.progress[courseId] || {};
    S.progress[courseId][mod.id] = { moduleId: mod.id, completedAt: nowIso(), score: autoScore };
    S.enrollments[courseId] = { ...(S.enrollments[courseId] || {}), completedAt: nowIso(), progress: 100 };

    notify({ title: "Quiz submitted", body: `${course.title} — auto-score ${autoScore}%`, level: autoScore >= 80 ? "success" : "info", source: "training-quiz" });
    closeModal("quizModal");
    toast(`Submitted! Auto-score ${autoScore}%. The admin will review.`, "success");
    renderActiveTab();
  } catch (e) {
    console.error("[training] submit failed", e);
    toast("Could not submit. Retry.", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

function viewCertificate(certId) {
  const cert = S.certificates[certId];
  if (!cert) { toast("Certificate not found.", "error"); return; }
  const body = $("certBody");
  if (!body) return;

  if (cert.renderedImage) {
    body.innerHTML = `
      <div style="background:var(--bg-input);border-radius:12px;padding:14px;text-align:center;">
        <img id="certImageEl" src="${cert.renderedImage}" style="max-width:100%;border-radius:8px;" alt="Certificate" />
      </div>
      <div style="margin-top:12px;font-size:.78rem;color:var(--text-secondary);text-align:center;">
        ${escapeHtml(cert.courseTitle || "")}${cert.moduleTitle ? " — " + escapeHtml(cert.moduleTitle) : ""} · Score ${cert.score ?? "—"}% · <span style="font-family:monospace;">${escapeHtml(cert.code || cert.id)}</span> · Issued ${fmtDate(cert.issuedAt)}
      </div>`;
  } else {
    body.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(255,200,87,.12),rgba(0,212,255,.12));border:2px solid var(--accent-gold);border-radius:16px;padding:32px;text-align:center;">
        <div style="font-size:3rem;color:var(--accent-gold);margin-bottom:8px;">🏆</div>
        <div style="font-size:1.4rem;font-weight:800;margin-bottom:6px;">Certificate of Completion</div>
        <div style="font-size:.85rem;color:var(--text-secondary);margin:18px 0 6px;">This certifies that</div>
        <div style="font-size:1.6rem;font-weight:800;margin:6px 0;">${escapeHtml(cert.userName || "")}</div>
        <div style="font-size:.85rem;color:var(--text-secondary);margin:14px 0 6px;">has successfully completed</div>
        <div style="font-size:1.15rem;font-weight:700;margin:6px 0;color:var(--accent-blue);">${escapeHtml(cert.courseTitle || "")}</div>
        <div style="margin-top:22px;font-size:.75rem;color:var(--text-secondary);">
          Score: <strong>${cert.score ?? 100}%</strong> · Issued ${fmtDate(cert.issuedAt)}<br>
          <span style="font-family:monospace;margin-top:8px;display:inline-block;background:rgba(0,0,0,.25);padding:4px 10px;border-radius:6px;">${escapeHtml(cert.code || cert.id)}</span>
        </div>
      </div>`;
  }
  openModal("certModal");
}

function printCertificate() {
  const img = $("certImageEl");
  const body = $("certBody");
  let html;
  if (img && img.src) {
    html = `<!DOCTYPE html><html><head><title>Certificate</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;}img{max-width:100%;max-height:100vh;}@media print{@page{size:landscape;margin:0;}}</style></head><body><img src="${img.src}" onload="setTimeout(()=>window.print(),300)" /></body></html>`;
  } else if (body) {
    html = `<!DOCTYPE html><html><head><title>Certificate</title><style>body{font-family:Arial,sans-serif;padding:40px;}</style></head><body onload="setTimeout(()=>window.print(),300)">${body.innerHTML}</body></html>`;
  } else {
    toast("Nothing to print.", "error"); return;
  }
  const w = window.open("", "_blank", "width=1000,height=700");
  if (!w) { toast("Pop-up blocked — allow pop-ups to print.", "warning"); return; }
  w.document.write(html); w.document.close();
}

function openResource(id) {
  const r = S.resources[id];
  if (!r) { toast("Resource not found.", "error"); return; }
  if (r.data) {
    const w = window.open();
    if (!w) { toast("Pop-up blocked.", "warning"); return; }
    if ((r.mime || "").startsWith("image/")) w.document.write(`<title>${escapeHtml(r.title)}</title><img src="${r.data}" style="max-width:100%;" />`);
    else if (r.mime === "application/pdf") w.document.write(`<title>${escapeHtml(r.title)}</title><iframe src="${r.data}" style="border:0;position:fixed;inset:0;width:100%;height:100%;"></iframe>`);
    else w.document.write(`<title>${escapeHtml(r.title)}</title><div style="font-family:sans-serif;padding:40px;text-align:center;"><p>Preview not available.</p><a href="${r.data}" download="${escapeHtml(r.fileName || r.title)}">Download</a></div>`);
    return;
  }
  if (r.url) { window.open(r.url, "_blank", "noopener,noreferrer"); return; }
  toast("This resource has no file or link.", "info");
}

window.VioraTraining = {
  openCourse, enrollAndOpen, openLesson, openQuiz, submitQuiz,
  viewCertificate, printCertificate, openResource, switchTab,
  debug: { S, db, auth, SCHOLAR, signOut: doSignOut }
};

function boot() {
  initLoginTabs();
  $("loginBtn")?.addEventListener("click", doSignIn);
  $("registerBtn")?.addEventListener("click", doRegister);
  $("pendingLogout")?.addEventListener("click", doSignOut);
  $("loginPassword")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSignIn(); } });
  $("regPassword")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doRegister(); } });
  const adminTab = $("adminTabBtn");
  if (adminTab) adminTab.style.display = "none";

  onAuthStateChanged(auth, (user) => {
    try { handleAuth(user); }
    catch (e) { console.error("[training] auth handler failed", e); }
  });

  console.info("[Viora Training] portal ready (isolated auth session: '" + APP_NAME + "')");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

window.vioraSendPasswordReset = async function (email) {
  if (!email || typeof email !== "string") return { ok: false, error: "missing-email" };
  try { await sendPasswordResetEmail(auth, email.trim()); return { ok: true }; }
  catch (e) { return { ok: false, error: (e && e.code) || (e && e.message) || "unknown" }; }
};

(function () {
  try {
    const params = new URLSearchParams(location.search);
    if (params.get("welcome") === "1") {
      setTimeout(function () { if (typeof toast === "function") toast("Welcome to VIORA Academy!", "success"); }, 800);
    }
  } catch (e) {}
})();

window.vioraGetRegistrationRole = function () {
  const el = document.getElementById("pRegRole");
  return el && el.value ? el.value : "";
};
