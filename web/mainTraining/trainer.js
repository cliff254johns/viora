// mainTraining/trainer.js
// Standalone Trainer Workspace (no cross-folder imports)

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { getDatabase, ref, get, set, update, onValue, forceLongPolling } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyC9gCBt-xR8t9n6rTGNvDZ5usUGiW-Dqxc", authDomain: "cliffclient-35ec5.firebaseapp.com",
  databaseURL: "https://cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app", projectId: "cliffclient-35ec5",
  storageBucket: "cliffclient-35ec5.firebasestorage.app", messagingSenderId: "519782791696", appId: "1:519782791696:web:6e1a654ddeed14b72b2895", measurementId: "G-G0NB6JGQVF"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getDatabase(app);
forceLongPolling(db);
const auth = getAuth(app);

const ROOT = "viora_data";
const ORG = "orgs/viora";
const P = (path) => `${ROOT}/${ORG}/training/${path}`;

const $ = (id) => document.getElementById(id);
const uid = () => "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowIso = () => new Date().toISOString();

function escapeHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function timeAgo(iso) { if (!iso) return ""; const t = Date.parse(iso); if (!Number.isFinite(t)) return ""; const diff = Date.now() - t; if (diff < 60000) return "just now"; const m = Math.floor(diff / 60000); if (m < 60) return m + "m ago"; const h = Math.floor(m / 60); if (h < 24) return h + "h ago"; return Math.floor(h / 24) + "d ago"; }

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
document.addEventListener("click", (e) => { const closer = e.target.closest("[data-close]"); if (closer) { closeModal(closer.dataset.close); } });

const state = {
  operator: null,
  courses: {},
  enrollments: {},
  progress: {},
  quizSubmissions: {},
  currentTab: "overview"
};

// ── COURSE BUILDER (copied from main/training.js, minus admin-only features) ──
let _ceModulesDraft = [];
let _ceEditingId = null;

function renderCeModules() {
  const host = $("ceModulesList");
  if (!host) return;
  $("ceModuleCount").textContent = _ceModulesDraft.length;
  if (!_ceModulesDraft.length) {
    host.innerHTML = `<div class="empty-state" style="padding:24px;text-align:center;color:var(--text-secondary);font-size:.85rem;">No modules yet. Click <strong>Add Module</strong> to start.</div>`;
    return;
  }
  host.innerHTML = _ceModulesDraft.map((m, i) => {
    return `
    <div style="margin-bottom:10px;padding:14px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-input);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong style="font-size:.85rem;color:var(--accent-blue);">Module ${i + 1}</strong>
        <button type="button" class="btn btn-danger btn-xs" onclick="window.removeCeModule(${i})"><i class="fa-solid fa-trash"></i></button>
      </div>
      <label style="font-size:.72rem;">Title *</label>
      <input type="text" value="${escapeHtml(m.title)}" oninput="window.updateCeModule(${i}, 'title', this.value)" placeholder="e.g. Welcome to Viora" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color);background:#0a0a0f;color:#fff;margin-bottom:8px;" />
      <label style="font-size:.72rem;">Content</label>
      <textarea rows="3" oninput="window.updateCeModule(${i}, 'content', this.value)" placeholder="What this module covers" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color);background:#0a0a0f;color:#fff;">${escapeHtml(m.content)}</textarea>
    </div>`;
  }).join('');
}

window.updateCeModule = (i, field, value) => { if (_ceModulesDraft[i]) _ceModulesDraft[i][field] = value; };
window.addCeModule = () => { _ceModulesDraft.push({ id: 'mod-' + uid().slice(0, 6), title: '', content: '', videoUrl: '', order: _ceModulesDraft.length }); renderCeModules(); };
window.removeCeModule = (i) => { if (confirm('Remove this module?')) { _ceModulesDraft.splice(i, 1); _ceModulesDraft.forEach((m, idx) => m.order = idx); renderCeModules(); } };

window.openCourseEditor = (courseId = null) => {
  _ceEditingId = courseId;
  _ceModulesDraft = [];
  
  if (courseId) {
    const c = state.courses[courseId];
    if (!c) { toast('Course not found.', 'error'); return; }
    $("courseEditorTitle").textContent = 'Edit Course Draft';
    $("ceId").value = c.id || '';
    $("ceId").disabled = true;
    $("ceTitle").value = c.title || '';
    $("ceDescription").value = c.description || '';
    $("ceCategory").value = c.category || 'Onboarding';
    $("ceLevel").value = c.level || 'Beginner';
    $("ceRequiredFor").value = c.requiredFor || '';
    _ceModulesDraft = Object.entries(c.modules || {}).map(([id, m]) => ({ id, title: m.title || '', content: m.content || '', order: m.order || 0 })).sort((a, b) => a.order - b.order);
  } else {
    $("courseEditorTitle").textContent = 'New Course Draft';
    $("ceId").disabled = false;
    $("ceId").value = '';
    $("ceTitle").value = '';
    $("ceDescription").value = '';
    $("ceCategory").value = 'Onboarding';
    $("ceLevel").value = 'Beginner';
    $("ceRequiredFor").value = '';
  }
  renderCeModules();
  openModal('courseEditorModal');
};

window.saveCourse = async () => {
  const rawId = _ceEditingId || $("ceId").value;
  const id = _ceEditingId ? rawId : (rawId || "course-" + uid().slice(0,6)).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const title = ($("ceTitle").value || '').trim();

  if (!title) { toast('Course title required.', 'error'); return; }
  if (!_ceModulesDraft.length) { toast('Add at least one module.', 'error'); return; }
  if (_ceModulesDraft.some(m => !m.title.trim())) { toast('Every module needs a title.', 'error'); return; }

  const existing = state.courses[id];
  const modulesObj = {};
  _ceModulesDraft.forEach((m, idx) => { modulesObj[m.id] = { ...m, order: idx }; });

  const payload = {
    id, title,
    description: ($("ceDescription").value || '').trim(),
    category: $("ceCategory").value,
    level: $("ceLevel").value,
    requiredFor: ($("ceRequiredFor").value || '').trim(),
    modules: modulesObj,
    status: existing?.status || 'draft', // Keep status, default to draft
    trainerId: state.operator?.uid || null,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  const btn = $("ceSaveBtn");
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
  try {
    await set(ref(db, P(`courses/${id}`)), payload);
    toast('Draft saved successfully.', 'success');
    closeModal('courseEditorModal');
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Draft';
  }
};

// ── UI RENDERING ──
function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll(".sa-nav-item").forEach(b => b.classList.toggle("active", b.dataset.trTab === tab));
  document.querySelectorAll(".sa-pane").forEach(p => p.classList.toggle("active", p.id === `tr-pane-${tab}`));
  
  if (window.innerWidth <= 768) $("trSidebar")?.classList.remove("open");

  if (tab === "overview") renderOverview();
  if (tab === "courses") renderTrainerCourses();
  if (tab === "learners") renderLearners();
  if (tab === "grading") renderGrading();
}

function renderOverview() {
  // Filter courses assigned to this trainer
  const myCourses = Object.values(state.courses || {}).filter(c => c.trainerId === state.operator.uid);
  
  $("trOverviewKpi").innerHTML = `
    <div class="stat-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:16px;"><div style="color:var(--accent-blue);font-size:1.5rem;margin-bottom:8px;"><i class="fa-solid fa-book-open"></i></div><div style="font-size:1.5rem;font-weight:800;">${myCourses.length}</div><div style="font-size:.75rem;color:var(--text-secondary);text-transform:uppercase;">My Courses</div></div>
    <div class="stat-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:16px;"><div style="color:var(--accent-green);font-size:1.5rem;margin-bottom:8px;"><i class="fa-solid fa-users"></i></div><div style="font-size:1.5rem;font-weight:800;">0</div><div style="font-size:.75rem;color:var(--text-secondary);text-transform:uppercase;">Students</div></div>
    <div class="stat-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:16px;"><div style="color:var(--accent-gold);font-size:1.5rem;margin-bottom:8px;"><i class="fa-solid fa-file-signature"></i></div><div style="font-size:1.5rem;font-weight:800;">0</div><div style="font-size:.75rem;color:var(--text-secondary);text-transform:uppercase;">Pending Grades</div></div>
  `;
  $("trRecentActivity").innerHTML = `<div style="color:var(--text-secondary);font-size:.85rem;">No recent activity from your students.</div>`;
}

function renderTrainerCourses() {
  const myCourses = Object.values(state.courses || {}).filter(c => c.trainerId === state.operator.uid);
  const grid = $("trCoursesGrid");
  
  if (!myCourses.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text-secondary);">You have not been assigned any courses yet. Click "Create Draft" to start one.</div>`;
    return;
  }

  grid.innerHTML = myCourses.map(c => {
    const statusMap = { draft: 'status-draft', review: 'status-review', published: 'status-published' };
    const statusClass = statusMap[c.status] || 'status-draft';
    return `
      <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:16px; padding:20px; display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="font-weight:700;font-size:1rem;">${escapeHtml(c.title)}</div>
          <span class="badge ${statusClass}">${c.status || 'Draft'}</span>
        </div>
        <div style="font-size:.8rem;color:var(--text-secondary);flex:1;">${escapeHtml(c.description || 'No description')}</div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="btn btn-primary btn-sm" onclick="window.openCourseEditor('${c.id}')" style="background:linear-gradient(135deg,#00d4ff,#7c3aed); border:none; color:#fff; padding:8px 16px; border-radius:8px;"><i class="fa-solid fa-pen"></i> Edit</button>
          ${c.status === 'draft' ? `<button class="btn btn-success btn-sm" onclick="window.submitForReview('${c.id}')" style="background:linear-gradient(135deg,#22e6a0,#0d9e6e); border:none; color:#fff; padding:8px 16px; border-radius:8px;"><i class="fa-solid fa-paper-plane"></i> Submit</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderLearners() {
  $("trLearnersBody").innerHTML = `<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--text-secondary);">Learner tracking will populate once you have active enrollments.</td></tr>`;
}

function renderGrading() {
  $("trGradingBody").innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--text-secondary);">No quiz submissions awaiting grading.</td></tr>`;
}

window.submitForReview = async (id) => {
  if (!confirm("Submit this course to the Admin for review and publication?")) return;
  try {
    await update(ref(db, P(`courses/${id}`)), { status: "review", updatedAt: nowIso() });
    toast("Course submitted for review.", "success");
  } catch (e) { toast("Failed: " + e.message, "error"); }
};

// ── AUTHENTICATION & BOOT ──
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "trainingportal.html"; return; }
  
  const snap = await get(ref(db, `${ROOT}/${ORG}/users/${user.uid}`));
  const profile = snap.exists() ? snap.val() : null;
  
  if (!profile || (profile.role !== "trainer" && profile.role !== "admin" && profile.role !== "exec")) {
    alert("Access Denied: This portal is for Trainers only.");
    window.location.href = "trainingportal.html";
    return;
  }
  
  state.operator = { uid: user.uid, ...profile };
  $("trWhoami").textContent = profile.name || user.email;
  
  onValue(ref(db, P("courses")), s => { state.courses = s.val() || {}; if (state.currentTab === 'courses') renderTrainerCourses(); if (state.currentTab === 'overview') renderOverview(); });
  
  $("trSplash").style.display = "none";
  $("trShell").style.display = "flex";
  
  document.querySelectorAll(".sa-nav-item").forEach(b => {
    if (b._bound) return;
    b._bound = true;
    b.addEventListener("click", () => switchTab(b.dataset.trTab));
  });
  
  $("trNewCourseBtn").addEventListener("click", () => window.openCourseEditor());
  $("ceSaveBtn").addEventListener("click", window.saveCourse);
  $("ceAddModuleBtn").addEventListener("click", window.addCeModule);
  
  $("trMobileToggle").addEventListener("click", () => $("trSidebar").classList.add("open"));
  $("trSidebarOverlay").addEventListener("click", () => $("trSidebar").classList.remove("open"));
  $("trSignOutBtn").addEventListener("click", () => signOut(auth).then(() => window.location.href = "trainingportal.html"));
  
  switchTab("overview");
});
