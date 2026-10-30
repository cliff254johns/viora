import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, push, remove, update, onDisconnect, goOnline, goOffline } from "firebase/database";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

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
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

/* ------------------------------------------------------------------
   PATH LAYOUT â€” interacts with index.html (Viora Intercollective System)
   ------------------------------------------------------------------
   Users (SHARED with index.html and their role-gating):
       viora_data/users/{uid}
   Public Site mirror (SHARED with cliff.html â†’ index.html):
       viora_data/orgs/viora/clientsite
   Track's private collections (kept in a "track" subfolder so they
   DO NOT collide with index.html's flat collections at viora_data/{col}):
       viora_data/orgs/viora/track/{col}/{...}
------------------------------------------------------------------- */
const ROOT = 'viora_data';
const ORG  = 'orgs/viora';
const TRACK_SEGMENT = 'track';
const ORG_COLLECTIONS = new Set([
  'tasks','todos','projects','worklogs','proposals','payroll','presence','documents',
  'goals','skills','handoffs','activities','hourly','games','chat','typing','history',
  'inventory','schedule','financials','trash'
]);

// P('tasks/abc')   â†’ 'viora_data/orgs/viora/track/tasks/abc'
// P('users/xyz')   â†’ 'viora_data/users/xyz'  (shared with index.html)
// P('clientsite')  â†’ 'viora_data/clientsite'  (not used here)
function P(path) {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  const [col, ...rest] = clean.split('/');
  const tail = rest.length ? '/' + rest.join('/') : '';
  if (ORG_COLLECTIONS.has(col)) return `${ROOT}/${ORG}/${TRACK_SEGMENT}/${col}${tail}`;
  return `${ROOT}/${clean}`;
}

let WORKER_URL = 'https://vioratrack.cliff254johns.workers.dev';

const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fmtDate = s => { if(!s) return 'â€”'; const d = new Date(s + 'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); };
const fmtMoney = n => 'KSh ' + Number(n||0).toLocaleString('en-US',{maximumFractionDigits:0});
const timeAgo = iso => { if(!iso) return ''; const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000); if(m<1) return 'just now'; if(m<60) return m+'m'; const h = Math.floor(m/60); if(h<24) return h+'h'; const d = Math.floor(h/24); if(d<7) return d+'d';
  return new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}); };
const daysUntil = s => { if(!s) return 999; const t = new Date(todayStr()+'T00:00:00'); const x = new Date(s+'T00:00:00'); return Math.round((x-t)/86400000); };
const fmtBytes = b => { if(!b) return '0 B'; if(b<1024) return b+' B'; if(b<1048576) return (b/1024).toFixed(1)+' KB'; return (b/1048576).toFixed(2)+' MB'; };
const initials = n => (String(n||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('') || '?').toUpperCase();
const isMobile = () => window.innerWidth < 768;

function toast(msg, type = 'info') {
  const colors = { success:'#34d399', error:'#fb7185', info:'#38bdf8', warning:'#fbbf24' };
  const icons = { success:'fa-circle-check', error:'fa-circle-exclamation', info:'fa-circle-info', warning:'fa-triangle-exclamation' };
  const el = document.createElement('div');
  el.className = 'toast-item rounded-2xl px-4 py-3.5 flex items-start gap-3 shadow-2xl';
  el.style.cssText = `background:#0b1220;border:1px solid rgba(148,163,184,.18);border-left:4px solid ${colors[type]};z-index:9999`;
  el.innerHTML = `<i class="fa-solid ${icons[type]} mt-0.5" style="color:${colors[type]}"></i>
    <span class="flex-1 text-[13px] text-slate-200 leading-snug">${esc(msg)}</span>
    <button class="text-slate-500 hover:text-white text-lg leading-none">&times;</button>`;
  el.querySelector('button').onclick = () => el.remove();
  const tc = $('toasts'); if (tc) tc.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(24px)'; el.style.transition='all .3s'; setTimeout(()=>el.remove(),300); }, 4600);
}

function dueDateTime(item) {
  if (item.start) return new Date(item.start);
  const d = item.dueDate || item.date || item.targetDate;
  if (!d) return null;
  const t = item.dueTime || item.targetTime || '23:59';
  return new Date(`${d}T${t}:00`);
}
function formatCountdown(ms) {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  const pre = ms < 0 ? 'âš  ' : '';
  if (d > 0) return `${pre}${d}d ${h}h`;
  if (h > 0) return `${pre}${h}h ${m}m`;
  if (m > 0) return `${pre}${m}m ${s}s`;
  return `${pre}${s}s`;
}
function countdownClass(ms) { if (ms < 0) return 'urgent'; if (ms < 3600000) return 'urgent'; if (ms < 6 * 3600000) return 'warn'; return 'ok'; }
function countdownPill(item, done) {
  const due = dueDateTime(item); if (!due) return '';
  if (done) return `<span class="countdown-pill done" data-countdown="${due.getTime()}" data-done="1"><i class="fa-solid fa-check mr-1"></i>Done</span>`;
  return `<span class="countdown-pill ok" data-countdown="${due.getTime()}"><i class="fa-regular fa-hourglass-half"></i> ${formatCountdown(due.getTime() - Date.now())}</span>`;
}
function startCountdownTicker() {
  const tick = () => {
    document.querySelectorAll('[data-countdown]').forEach(el => {
      if (el.dataset.done === '1') return;
      const due = parseInt(el.dataset.countdown, 10);
      const diff = due - Date.now();
      el.className = 'countdown-pill ' + countdownClass(diff);
      el.innerHTML = `<i class="fa-regular fa-hourglass-half"></i> ${formatCountdown(diff)}`;
    });
  };
  tick();
  if (window._cdTicker) clearInterval(window._cdTicker);
  window._cdTicker = setInterval(tick, 1000);
}

const MAX_PHOTO = 3 * 1024 * 1024;
function readAsDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file); }); }
function resizeImage(file, max = 800) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > h) { if (w > max) { h = h * max / w; w = max; } } else { if (h > max) { w = w * max / h; h = max; } }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = rej; img.src = e.target.result;
    };
    r.onerror = rej; r.readAsDataURL(file);
  });
}
async function captureCompletionPhoto(type, id) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Pick an image.', 'error');
    if (f.size > MAX_PHOTO) return toast('Max 3 MB.', 'error');
    try {
      toast('Compressing photoâ€¦', 'info');
      const b64 = await resizeImage(f, 800);
      const meta = { completionPhoto: b64, photoAddedAt: new Date().toISOString() };
      let title = '';
      if (type === 'task') { const t = state.tasks[state.user.uid]?.[id]; title = t?.title || 'Task'; await safeUpdate(`tasks/${state.user.uid}/${id}`, meta); }
      else if (type === 'todo') { const t = state.todos[state.user.uid]?.[id]; title = t?.text || 'To-do'; await safeUpdate(`todos/${state.user.uid}/${id}`, meta); }
      else if (type === 'goal') { const g = state.goals?.[id]; title = g?.title || 'Goal'; await safeUpdate(`goals/${id}`, meta); }
      else if (type === 'event') { const ev = state.schedule[state.user.uid]?.[id]; title = ev?.title || 'Event'; await safeUpdate(`schedule/${state.user.uid}/${id}`, meta); }
      else if (type === 'activity') { title = 'Activity ' + id; await safeUpdate(`activities/${state.user.uid}`, { [`completions/${id}/photo`]: b64, [`completions/${id}/photoAt`]: meta.photoAddedAt }); }
      await logHistory('photo', type, id, 'Completion photo added');
      await mirrorPhotoToVault(type, id, title, b64);
      toast('Photo saved to Vault.', 'success');
    } catch(err) { console.error(err); toast('Upload failed.', 'error'); }
  };
  input.click();
}
function viewCompletionPhoto(b64, name = 'completion.jpg') {
  if (!b64) return toast('No photo attached.', 'warning');
  $('previewTitle').textContent = name;
  $('previewBody').innerHTML = `<div class="text-center">
    <img src="${b64}" class="max-w-full max-h-[70vh] rounded-xl shadow-2xl" />
    <a href="${b64}" download="${name}" class="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl glass text-[12.5px] font-semibold text-slate-300 hover:text-white"><i class="fa-solid fa-download"></i> Download</a></div>`;
  $('previewDownloadBtn').onclick = () => { const a = document.createElement('a'); a.href = b64; a.download = name; a.click(); };
  showModal('previewModal');
}
function photoButton(type, id, hasPhoto) {
  return `<button data-photo="${type}:${id}" class="photo-btn ${hasPhoto ? 'has' : ''}" title="${hasPhoto ? 'View photo' : 'Add completion photo'}"><i class="fa-solid ${hasPhoto ? 'fa-image' : 'fa-camera'}"></i></button>`;
}
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-photo]'); if (!btn) return;
  e.stopPropagation();
  const [type, id] = btn.dataset.photo.split(':');
  let item = null;
  if (type === 'task') item = state.tasks[state.user?.uid]?.[id];
  else if (type === 'todo') item = state.todos[state.user?.uid]?.[id];
  else if (type === 'goal') item = state.goals?.[id];
  else if (type === 'event') item = state.schedule[state.user?.uid]?.[id];
  else if (type === 'activity') {
    const comp = state.activities[state.user?.uid]?.completions?.[id];
    if (comp?.photo) return viewCompletionPhoto(comp.photo, `activity-${id}.jpg`);
    return captureCompletionPhoto(type, id);
  }
  if (!state.user) return;
  if (item?.completionPhoto) viewCompletionPhoto(item.completionPhoto, `${type}-${id}.jpg`);
  else captureCompletionPhoto(type, id);
});

function startNotificationScheduler() {
  const check = () => {
    if (!state.settings.notifEnabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const fired = JSON.parse(localStorage.getItem('dualtrack_notif_fired') || '{}');
    const now = Date.now();
    const checkItem = (item, type, titleField) => {
      const due = dueDateTime(item);
      if (!due || item.done || item.completedAt) return;
      const diff = due.getTime() - now;
      const key = `${type}-${item.id}-${Math.floor(due.getTime() / 1800000)}`;
      if (fired[key]) return;
      if (diff > 0 && diff <= 30 * 60000) { showNotification('â° Due in ' + formatCountdown(diff), item[titleField] || ''); fired[key] = true; }
      else if (diff < 0 && diff > -2 * 3600000) { showNotification('âš ï¸ Overdue: ' + (item[titleField] || ''), 'Was due ' + formatCountdown(diff)); fired[key] = true; }
    };
    myTasks().forEach(t => checkItem(t, 'task', 'title'));
    myTodos().forEach(t => checkItem(t, 'todo', 'text'));
    allGoals().forEach(g => checkItem({ ...g, done: !!g.completedAt }, 'goal', 'title'));
    if (Object.keys(fired).length > 500) { const cut = now - 7 * 86400000;
      Object.keys(fired).forEach(k => { const parts = k.split('-'); if (parseInt(parts[parts.length-1]) * 1800000 < cut) delete fired[k]; }); }
    localStorage.setItem('dualtrack_notif_fired', JSON.stringify(fired));
  };
  check();
  if (window._notifScheduler) clearInterval(window._notifScheduler);
  window._notifScheduler = setInterval(check, 60000);
}
function showNotification(title, body) {
  if (!state.settings.notifEnabled) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: state.profile?.avatar || undefined }); } catch(e){}
}
function buildNotifications() {
  const out = []; const today = todayStr(); const mine = myTasks();
  const overdue = mine.filter(t => !t.done && t.dueDate && t.dueDate < today);
  if (overdue.length) out.push({ type:'error', title:`${overdue.length} overdue task(s)`, sub: overdue.slice(0,2).map(t=>t.title).join(', ') });
  const dueT = mine.filter(t => !t.done && t.dueDate === today);
  if (dueT.length) out.push({ type:'warning', title:`${dueT.length} due today`, sub: dueT.slice(0,2).map(t=>t.title).join(', ') });
  const dueSoon = mine.filter(t => { if (t.done || !t.dueDate) return false; const d = dueDateTime(t); if (!d) return false; const diff = d.getTime() - Date.now(); return diff > 0 && diff < 2*3600000; });
  if (dueSoon.length) out.push({ type:'warning', title:`${dueSoon.length} due in <2h`, sub: dueSoon.slice(0,2).map(t=>t.title).join(', ') });
  const inbox = allHandoffs().filter(h => h.toUid === state.user.uid && h.status === 'pending');
  if (inbox.length) out.push({ type:'info', title:`${inbox.length} pending handoff(s)`, sub:'Review tasks assigned to you' });
  const subs = allSubs().filter(s => s.nextDate && daysUntil(s.nextDate) <= 7 && daysUntil(s.nextDate) >= 0);
  if (subs.length) out.push({ type:'warning', title:`${subs.length} subscription(s) due soon`, sub: subs.map(s=>s.name).join(', ') });
  return out;
}

async function vaultSave({ id, name, mime, size, data, source, sourceLabel, parentId, tags, uploadedBy }) {
  if (!state.user) return;
  const vid = id || uid();
  const entry = {
    id: vid,
    ownerUid: state.user.uid,
    uploadedBy: uploadedBy || state.profile?.name || state.user.email,
    uploadedAt: new Date().toISOString(),
    name: name || 'unnamed',
    mime: mime || 'application/octet-stream',
    size: size || 0,
    data: data || null,
    source: source || 'vault',
    sourceLabel: sourceLabel || '',
    parentId: parentId || null,
    tags: Array.isArray(tags) ? tags : []
  };
  state.documents[vid] = entry;
  renderVault();
  if (isMobile()) renderMobileVault();
  await safeSet(`documents/${vid}`, entry);
  await logHistory('upload', 'document', vid, entry.name, { source: entry.source, sourceLabel: entry.sourceLabel });
  return vid;
}
async function mirrorPhotoToVault(type, id, title, b64) {
  if (!b64) return;
  await vaultSave({
    id: `photo-${type}-${id}`,
    name: `${title || type}-completion.jpg`,
    mime: 'image/jpeg',
    size: Math.round((b64.length * 3) / 4),
    data: b64,
    source: type,
    sourceLabel: title || type,
    parentId: id,
    tags: ['completion-photo', type]
  });
}
async function mirrorAvatarToVault(b64) {
  if (!b64) return;
  await vaultSave({
    id: 'avatar-' + state.user.uid,
    name: `avatar-${(state.profile?.name || 'me').replace(/\s+/g, '_')}.jpg`,
    mime: 'image/jpeg',
    size: Math.round((b64.length * 3) / 4),
    data: b64,
    source: 'avatar',
    sourceLabel: 'Profile photo',
    parentId: state.user.uid,
    tags: ['avatar']
  });
}
async function mirrorChatToVault(msgId, name, mime, size, b64) {
  await vaultSave({
    id: `chat-${msgId}`,
    name: name || `chat-${msgId}.jpg`,
    mime: mime || 'image/jpeg',
    size: size || 0,
    data: b64,
    source: 'chat',
    sourceLabel: 'Chat attachment',
    parentId: msgId,
    tags: ['chat']
  });
}

const IDB_NAME = 'viora_track_db';
const IDB_STORE = 'cache';
let _idb = null;
function idb() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise(res => {
    try {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = e => { if (!e.target.result.objectStoreNames.contains(IDB_STORE)) e.target.result.createObjectStore(IDB_STORE); };
      r.onsuccess = e => { _idb = e.target.result; res(_idb); };
      r.onerror = () => res(null);
    } catch(e) { res(null); }
  });
}
async function idbPut(k, v) { const d = await idb(); if (!d) return; return new Promise(r => { const t = d.transaction(IDB_STORE, 'readwrite'); t.objectStore(IDB_STORE).put(v, k); t.oncomplete = r; t.onerror = r; }); }
async function idbGet(k) { const d = await idb(); if (!d) return null; return new Promise(r => { const t = d.transaction(IDB_STORE, 'readonly'); const rq = t.objectStore(IDB_STORE).get(k); rq.onsuccess = () => r(rq.result); rq.onerror = () => r(null); }); }
async function mirrorState() {
  if (!state.user) return;
  const snap = {};
  ['profiles','tasks','todos','schedule','documents','goals','skills','handoffs','activities','hourly','games','chat','history'].forEach(k => { snap[k] = state[k]; });
  snap.financials = state.financials;
  snap._mirroredAt = Date.now();
  await idbPut('snapshot_' + state.user.uid, snap);
}
async function hydrateFromMirror() {
  if (!state.user) return false;
  const snap = await idbGet('snapshot_' + state.user.uid);
  if (!snap) return false;
  Object.keys(snap).forEach(k => {
    if (k.startsWith('_')) return;
    const localHasData = state[k] && (Array.isArray(state[k]) ? state[k].length : Object.keys(state[k] || {}).length);
    if (!localHasData && snap[k]) state[k] = snap[k];
  });
  return true;
}
const QUEUE_KEY = 'viora_track_queue';
function getQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; } }
function setQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {} updateSyncBanner(); if ($('queueState')) $('queueState').textContent = q.length; updateMobileSyncBanner(); }
function queueWrite(op) { const q = getQueue(); q.push({ ...op, id: uid(), ts: Date.now() }); setQueue(q); toast('Saved offline â€” will sync', 'warning'); }

async function safeSet(path, payload) {
  const fullPath = P(path);
  if (navigator.onLine) { try { await set(ref(db, fullPath), payload); return { ok: true, offline: false }; } catch (e) { queueWrite({ type: 'set', path: fullPath, payload }); return { ok: true, offline: true }; } }
  queueWrite({ type: 'set', path: fullPath, payload }); return { ok: true, offline: true };
}
async function safeUpdate(path, payload) {
  const fullPath = P(path);
  if (navigator.onLine) { try { await update(ref(db, fullPath), payload); return { ok: true, offline: false }; } catch (e) { queueWrite({ type: 'update', path: fullPath, payload }); return { ok: true, offline: true }; } }
  queueWrite({ type: 'update', path: fullPath, payload }); return { ok: true, offline: true };
}
async function safeRemove(path) {
  const fullPath = P(path);
  if (navigator.onLine) { try { await remove(ref(db, fullPath)); return { ok: true, offline: false }; } catch (e) { queueWrite({ type: 'remove', path: fullPath }); return { ok: true, offline: true }; } }
  queueWrite({ type: 'remove', path: fullPath }); return { ok: true, offline: true };
}
async function flushQueue() {
  const q = getQueue(); if (!q.length) return;
  updateSyncBanner('syncing', `Syncing ${q.length} change${q.length>1?'s':''}â€¦`);
  const remaining = []; let synced = 0;
  for (const op of q) {
    try {
      if (op.type === 'set') await set(ref(db, op.path), op.payload);
      else if (op.type === 'update') await update(ref(db, op.path), op.payload);
      else if (op.type === 'remove') await remove(ref(db, op.path));
      synced++;
    } catch (e) { remaining.push(op); }
  }
  setQueue(remaining);
  if (synced > 0 && !remaining.length) toast(`Synced ${synced} offline change${synced>1?'s':''}`, 'success');
  updateSyncBanner();
}
function updateSyncBanner(force, msg) {
  const el = $('syncBanner'); if (!el) return;
  const q = getQueue().length;
  el.className = '';
  if (force === 'syncing') { el.classList.add('syncing'); $('syncBannerText').textContent = msg || 'Syncingâ€¦'; $('syncBannerBtn').style.display = 'none'; }
  else if (!navigator.onLine) { el.classList.add('offline'); $('syncBannerText').textContent = `Offline â€” ${q} change${q===1?'':'s'} queued`; $('syncBannerBtn').style.display = q ? 'inline-block' : 'none'; }
  else if (q > 0) { el.classList.add('syncing'); $('syncBannerText').textContent = `${q} change${q===1?'':'s'} waiting to sync`; $('syncBannerBtn').style.display = 'inline-block'; }
  else { el.classList.add('online'); $('syncBannerText').textContent = 'Online â€” live sync active'; $('syncBannerBtn').style.display = 'none'; }
  if ($('queueState')) $('queueState').textContent = q;
  updateMobileSyncBanner();
}
function updateMobileSyncBanner() {
  const b = $('mSyncBanner'); if (!b) return;
  const q = getQueue().length;
  const offline = !navigator.onLine;
  const txt = $('mSyncText');
  if (offline || q > 0) {
    b.style.display = 'block';
    if (offline) { txt.textContent = `Offline â€” ${q} change${q===1?'':'s'} queued`; b.querySelector('div').style.background = 'rgba(251,191,36,.12)'; b.querySelector('div').style.borderColor = 'rgba(251,191,36,.35)'; b.querySelector('div').style.color = '#fbbf24'; }
    else { txt.textContent = `${q} change${q===1?'':'s'} waiting to sync`; b.querySelector('div').style.background = 'rgba(56,189,248,.12)'; b.querySelector('div').style.borderColor = 'rgba(56,189,248,.35)'; b.querySelector('div').style.color = '#38bdf8'; }
  } else b.style.display = 'none';
}

const HIST_COLORS = { task:'#38bdf8', todo:'#fbbf24', goal:'#fb923c', activity:'#d946ef', expense:'#f59e0b', savings:'#34d399', subscription:'#a855f7', skill:'#818cf8', event:'#fb7185', handoff:'#14b8a6', chat:'#22d3ee', presence:'#64748b', hourly:'#10b981', document:'#22d3ee' };
const HIST_ICONS = { task:'fa-list-check', todo:'fa-circle-check', goal:'fa-bullseye', activity:'fa-wand-magic-sparkles', expense:'fa-receipt', savings:'fa-piggy-bank', subscription:'fa-repeat', skill:'fa-code-branch', event:'fa-calendar', handoff:'fa-arrows-rotate', chat:'fa-comments', presence:'fa-wifi', hourly:'fa-clock', document:'fa-file' };
async function logHistory(action, entity, entityId, title, details = {}) {
  if (!state.user) return;
  const entry = { id: uid(), uid: state.user.uid, action, entity, entityId: String(entityId || ''), title: String(title || '').slice(0, 200), details, ts: Date.now() };
  await safeSet(`history/${entry.id}`, entry);
  state.history = state.history || {};
  state.history[entry.id] = entry;
  const cnt = Object.keys(state.history).length;
  if ($('navHistoryCount')) $('navHistoryCount').textContent = cnt > 99 ? '99+' : cnt;
  return entry;
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const sw = `
    const C = 'viora-track-v73';
    const ASSETS = [
      'https://cdn.tailwindcss.com',
      'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
      'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
      'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js',
      'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js',
      'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'
    ];
    self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => Promise.all(ASSETS.map(u => c.add(u).catch(()=>{})))).then(() => self.skipWaiting())); });
    self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
    self.addEventListener('fetch', e => {
      if (e.request.method !== 'GET') return;
      const url = new URL(e.request.url);
      if (url.origin.includes('firebaseio.com') || url.origin.includes('identitytoolkit') || url.origin.includes('workers.dev')) return;
      e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') { const cl = res.clone(); caches.open(C).then(c => c.put(e.request, cl)); }
        return res;
      }).catch(() => caches.match(location.href))));
    });
  `;
  try { const blob = new Blob([sw], { type: 'application/javascript' }); navigator.serviceWorker.register(URL.createObjectURL(blob)).catch(() => {}); } catch(e) {}
}

function rr(ctx,x,y,w,h,r){ r = Math.min(r,w/2,h/2); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
const bar3DPlugin = { id:'bar3D', beforeDatasetsDraw(chart){
  const ctx = chart.ctx;
  chart.data.datasets.forEach((ds,di) => {
    const meta = chart.getDatasetMeta(di);
    if (meta.type !== 'bar' || meta.hidden) return;
    ctx.save();
    meta.data.forEach(el => {
      const p = el.getProps(['x','y','base','width'], true);
      const w = p.width || 16; const h = Math.abs(p.base - p.y); if (h < 1) return;
      const left = p.x - w/2, top = Math.min(p.y, p.base);
      const g = ctx.createLinearGradient(left,top,left+w,top+h);
      g.addColorStop(0,'rgba(2,6,23,.55)'); g.addColorStop(1,'rgba(2,6,23,.20)');
      ctx.fillStyle = g; rr(ctx,left+5,top+7,w,h,7); ctx.fill();
    });
    ctx.restore();
  });
}};
const doughnut3DPlugin = { id:'doughnut3D', beforeDatasetsDraw(chart){
  const ctx = chart.ctx;
  chart.data.datasets.forEach((ds,di) => {
    const meta = chart.getDatasetMeta(di);
    if (meta.type !== 'doughnut') return;
    ctx.save(); ctx.fillStyle = 'rgba(2,6,23,.45)';
    meta.data.forEach(arc => {
      if (arc.circumference <= 0.001) return;
      const cx = arc.x + 6, cy = arc.y + 9;
      ctx.beginPath(); ctx.arc(cx,cy,arc.outerRadius,arc.startAngle,arc.endAngle);
      ctx.arc(cx,cy,arc.innerRadius,arc.endAngle,arc.startAngle,true); ctx.closePath(); ctx.fill();
    });
    ctx.restore();
  });
}};
Chart.register(bar3DPlugin, doughnut3DPlugin);
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = '#94a3b8';

const state = {
  user: null, profile: null,
  profiles:{}, tasks:{}, todos:{}, schedule:{}, documents:{},
  goals:{}, skills:{}, handoffs:{}, presence:{}, inventory:{},
  financials: { expenses:{}, savings:{}, subscriptions:{} },
  activities:{}, hourly:{}, games:{}, chat:{}, typing:{}, history:{},
  settings:{}, activeTab:'dashboard', charts:{},
  todoDate: todayStr(), lastSync:null, signupMode:false,
  renderTimer:null, lastDayCheck: todayStr(),
  chatHistory: [],
  gameStats: JSON.parse(localStorage.getItem('dualtrack_gamestats') || '{"tttW":0,"tttL":0,"rpsW":0,"rpsL":0,"c4W":0,"memW":0,"diceW":0,"wdW":0,"triviaCorrect":0,"triviaTotal":0}'),
  chatPanelOpen: false, lastChatSeenTs: 0,
  tdCurrent: null, tdKind: 'truth',
  mobileScreen: 'dashboard',
  mobileTaskFilter: 'all',
  mobileGameTab: 'lobby',
  mobileChatOpen: false
};
const ACCENTS = ['#38bdf8','#a855f7','#34d399','#fbbf24','#fb7185','#22d3ee','#f472b6','#818cf8'];

const myTasks = () => Object.values(state.tasks[state.user?.uid] || {});
const myTodos = () => Object.values(state.todos[state.user?.uid] || {});
const mySchedule = () => Object.values(state.schedule[state.user?.uid] || {});
const myDocs = () => Object.values(state.documents || {});
const myHourly = () => Object.values(state.hourly[state.user?.uid] || {});
const tasksOf = u => Object.values(state.tasks[u] || {});
const todosOf = u => Object.values(state.todos[u] || {});
const hourlyOf = u => Object.values(state.hourly[u] || {});
const allGoals = () => Object.values(state.goals || {});
const allSkills = () => Object.values(state.skills || {});
const allExpenses = () => Object.values(state.financials.expenses || {});
const allSavings = () => Object.values(state.financials.savings || {});
const allSubs = () => Object.values(state.financials.subscriptions || {});
const allHandoffs = () => Object.values(state.handoffs || {});
function partnerUid() {
  const sel = state.settings.activePartnerId;
  if (sel && state.profiles[sel]) return sel;
  return Object.keys(state.profiles).find(id => id !== state.user?.uid) || null;
}
function isOnline(u) { return !!(state.presence[u] && state.presence[u].online); }
function profileName(u) { return state.profiles[u]?.name || 'Unknown'; }

async function ai(path, payload) {
  if (!WORKER_URL || WORKER_URL.includes('YOUR-SUBDOMAIN')) { toast('Set Worker URL in Settings.', 'warning'); throw new Error('Worker URL not configured'); }
  const res = await fetch(`${WORKER_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0,120)}`);
  return res.json();
}

$('tabSignIn').onclick = () => setAuthMode(false);
$('tabSignUp').onclick = () => setAuthMode(true);
function setAuthMode(s) {
  state.signupMode = s;
  $('tabSignIn').className = s ? 'flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-slate-400 transition-all hover:text-white' : 'flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all bg-gradient-to-r from-sky-500 to-violet-600 text-white';
  $('tabSignUp').className = s ? 'flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all bg-gradient-to-r from-sky-500 to-violet-600 text-white' : 'flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-slate-400 transition-all hover:text-white';
  $('nameField').classList.toggle('hidden', !s);
  $('authBtnText').textContent = s ? 'Create Account' : 'Sign In';
}
$('authBtn').onclick = async () => {
  const email = $('authEmail').value.trim(), pass = $('authPassword').value, name = $('authName').value.trim();
  if (!email || !pass) return toast('Email + password required.', 'error');
  if (state.signupMode && !name) return toast('Name required.', 'error');
  if (state.signupMode && pass.length < 6) return toast('Min 6 chars.', 'error');
  $('authBtn').disabled = true; $('authBtnText').textContent = state.signupMode ? 'Creatingâ€¦' : 'Signing inâ€¦';
  try {
    if (state.signupMode) {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      // Writes to SHARED users node â€” index.html reads this at viora_data/users/{uid}
      await set(ref(db, `${ROOT}/users/${cred.user.uid}`), {
        uid: cred.user.uid,
        name,
        email,
        tagline: 'Just getting started',
        hobbies: '',
        accent: ACCENTS[Math.floor(Math.random()*ACCENTS.length)],
        avatar: null,
        role: 'member',
        orgId: 'viora',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      toast('Welcome!', 'success');
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch(e) {
    const m = (e.code||'').replace('auth/','').replace(/-/g,' ');
    toast('Failed: ' + (m || e.message), 'error');
    $('authBtn').disabled = false; $('authBtnText').textContent = state.signupMode ? 'Create Account' : 'Sign In';
  }
};
$('authPassword').onkeydown = e => { if (e.key === 'Enter') $('authBtn').click(); };
$('signOutBtn').onclick = async () => { if (!confirm('Sign out?')) return;
  try { await remove(ref(db, P(`presence/${state.user.uid}`))); } catch(e) {}
  await signOut(auth); location.reload(); };

onAuthStateChanged(auth, async user => {
  if (!user) {
    state.user = null;
    $('authScreen').classList.remove('hidden');
    $('desktopShell').classList.add('hidden');
    $('mobileAppShell').style.display = 'none';
    $('loading').classList.add('hidden');
    return;
  }
  state.user = user;
  // Read from SHARED users path â€” same path index.html uses.
  const pRef = ref(db, `${ROOT}/users/${user.uid}`);
  const snap = await new Promise(res => onValue(pRef, s => res(s), { onlyOnce: true }));
  if (!snap.exists()) {
    await set(pRef, {
      uid: user.uid,
      name: user.email.split('@')[0],
      email: user.email,
      tagline: 'Just getting started',
      hobbies: '',
      accent: ACCENTS[0],
      avatar: null,
      role: 'member',
      orgId: 'viora',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  try {
    const s = JSON.parse(localStorage.getItem('dualtrack_settings_' + user.uid) || '{}');
    state.settings = { ...state.settings, ...s };
    if (state.settings.workerUrl) WORKER_URL = state.settings.workerUrl;
    if (state.settings.chatHistory) state.chatHistory = state.settings.chatHistory;
    if (state.settings.lastChatSeenTs) state.lastChatSeenTs = state.settings.lastChatSeenTs;
  } catch(e){}
  $('authScreen').classList.add('hidden');
  if (isMobile()) { $('mobileAppShell').style.display = 'grid'; $('desktopShell').classList.add('hidden'); }
  else { $('desktopShell').classList.remove('hidden'); $('mobileAppShell').style.display = 'none'; }
  $('loading').classList.add('hidden');
  const hydrated = await hydrateFromMirror();
  if (hydrated) { renderChrome(); renderAll(); }
  subscribeAll();
  flushQueue();
  setInterval(mirrorState, 15000);
  initPresenceLog();
  registerSW();
  updateSyncBanner();
  setupPresence(); startClock(); startMidnightReset(); initNotifications(); initChat();
  startCountdownTicker();
  startNotificationScheduler();
  setInterval(() => { if (state.user) startCountdownTicker(); }, 5000);
  loadAiInsight();
  renderMobileDashboard();
  switchMobileScreen('dashboard');
  renderDashboardAlerts();
  checkAIHealth().then(r => { if (r && r.ok) console.log('AI ready:', r.model); });
});

function subscribeAll() {
  // Track collections live under viora_data/orgs/viora/track/{col}/...
  ['tasks','todos','schedule','documents','goals','skills','handoffs',
   'presence','activities','hourly','games','chat','typing','history','inventory']
    .forEach(p => onValue(ref(db, P(p)), snap => {
      state[p] = snap.val() || {};
      state.lastSync = new Date();
      if (p === 'chat') handleChatUpdate();
      scheduleRender();
    }));

  // SHARED with index.html â€” read straight from viora_data/users
  onValue(ref(db, `${ROOT}/users`), snap => {
    state.profiles = snap.val() || {};
    state.profile = state.profiles[state.user?.uid] || state.profile || null;
    state.lastSync = new Date();
    scheduleRender();
  });

  onValue(ref(db, P('financials')), snap => {
    const v = snap.val() || {};
    state.financials = { expenses: v.expenses||{}, savings: v.savings||{}, subscriptions: v.subscriptions||{} };
    state.lastSync = new Date();
    scheduleRender();
  });

  onValue(ref(db, '.info/connected'), s => {
    const on = s.val() === true;
    $('syncDot').className = 'w-1.5 h-1.5 rounded-full ' + (on ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500');
    $('syncLabel').textContent = on ? 'Live Sync' : 'Offline';
    const cs = $('connState');
    if (cs) { cs.textContent = on ? 'Connected' : 'Offline'; cs.className = on ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'; }
    updateMobileSyncBanner();
  });

  window.addEventListener('online', () => { goOnline(); toast('Back online', 'success'); updateSyncBanner(); flushQueue(); });
  window.addEventListener('offline', () => { toast('Offline â€” changes sync later', 'warning'); updateSyncBanner(); });
  setInterval(() => { if (navigator.onLine && getQueue().length) flushQueue(); }, 30000);
}
function scheduleRender() {
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(() => {
    renderChrome(); renderAll(); startCountdownTicker();
    if (isMobile()) { renderMobileDashboard(); renderMobileTasks(); renderMobileTodos(); renderMobileGoals(); renderMobileVault(); }
    renderNotificationsBadge(); renderDashboardAlerts(); renderNotifDropdown();
    clearTimeout(window._mirrorT);
    window._mirrorT = setTimeout(mirrorState, 500);
  }, 70);
}
function setupPresence() {
  const pRef = ref(db, P(`presence/${state.user.uid}`));
  onValue(ref(db, '.info/connected'), snap => {
    if (snap.val() !== true) return;
    onDisconnect(pRef).set({ online: false, lastSeen: Date.now() });
    set(pRef, { online: true, lastSeen: Date.now(), name: state.profile?.name || state.user.email });
  });
}
function initPresenceLog() {
  let wasOnline = null;
  onValue(ref(db, '.info/connected'), snap => {
    const on = snap.val() === true;
    if (wasOnline === null) { wasOnline = on; return; }
    if (on && !wasOnline) { wasOnline = true; logHistory('presence', 'presence', state.user.uid, 'Came online'); flushQueue(); }
    else if (!on && wasOnline) { wasOnline = false; logHistory('presence', 'presence', state.user.uid, 'Went offline'); }
  });
}
function startClock() { const t = () => { const d = new Date(); const el = $('clockText'); if (el) el.textContent = d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}); }; t(); setInterval(t,20000); }
function startMidnightReset() {
  setInterval(() => {
    const t = todayStr();
    if (t !== state.lastDayCheck) {
      state.lastDayCheck = t;
      Object.values(state.todos[state.user?.uid] || {}).forEach(x => {
        if (x.recurring && x.date < t) { const id = uid(); safeSet(`todos/${state.user.uid}/${id}`, { ...x, id, date: t, done: false, completedAt: null, createdAt: new Date().toISOString() }); }
      });
      state.todoDate = t; renderAll();
      if (isMobile()) renderMobileTodos();
    }
  }, 60000);
}
function initNotifications() {
  const bell = $('notifBell'); const dd = $('notifDropdown');
  if (bell && dd) {
    bell.onclick = (e) => { e.stopPropagation(); const show = !dd.classList.contains('show'); dd.classList.toggle('show', show); if (show) renderNotifDropdown(); };
    if ($('notifRefresh')) $('notifRefresh').onclick = (e) => { e.stopPropagation(); renderNotifDropdown(); toast('Refreshed.', 'info'); };
    document.addEventListener('click', (e) => { if (!e.target.closest('#notifDropdown') && !e.target.closest('#notifBell')) dd.classList.remove('show'); });
  }
  if ($('mNotifBtn')) $('mNotifBtn').onclick = () => { const list = buildNotifications(); if (!list.length) return toast('No alerts.', 'info'); toast(`${list.length} alert${list.length>1?'s':''}: ${list[0].title}`, 'info'); };
  if ($('testNotifBtn')) $('testNotifBtn').onclick = () => showNotification('Viora Track Test', 'Notifications working!');
  $('notifEnabled').checked = !!state.settings.notifEnabled;
  $('notifEnabled').onchange = e => { state.settings.notifEnabled = e.target.checked; persistSettings(); };
  $('chatSoundEnabled').checked = state.settings.chatSoundEnabled !== false;
  $('chatSoundEnabled').onchange = e => { state.settings.chatSoundEnabled = e.target.checked; persistSettings(); };
  $('requestPermBtn').onclick = async () => { if (!('Notification' in window)) return toast('Not supported.', 'error'); const p = await Notification.requestPermission(); toast(`Permission: ${p}`, p === 'granted' ? 'success' : 'warning'); };
  $('workerUrlInput').value = state.settings.workerUrl || WORKER_URL;
  $('saveWorkerBtn').onclick = () => { const u = $('workerUrlInput').value.trim(); if (!u.startsWith('http')) return toast('Enter a valid https:// URL', 'error'); WORKER_URL = u; state.settings.workerUrl = u; persistSettings(); toast('Worker URL saved.', 'success'); };
  if ($('aiTestBtn')) $('aiTestBtn').onclick = async () => {
    const out = $('aiTestResult'); if (out) out.textContent = 'Testingâ€¦';
    const r = await checkAIHealth();
    if (r && r.ok) { toast('Worker online Â· ' + (r.model || ''), 'success'); if (out) out.innerHTML = `<span style="color:#34d399">âœ“ Online Â· ${esc(r.model||'ok')}</span>`;
      try { const t = await ai('/ai/chat', { messages: [{ role: 'user', content: 'Reply with one word: ready' }], context: {} }); toast('AI reply: ' + (t.reply || 'ok'), 'success'); if (out) out.innerHTML += ` Â· Reply: ${esc((t.reply||'').slice(0,20))}`; }
      catch(e) { toast('Chat failed: ' + e.message, 'warning'); }
    } else { toast('Worker unreachable', 'error'); if (out) out.innerHTML = '<span style="color:#fb7185">âœ— Unreachable</span>'; }
  };
}
function persistSettings() { try { localStorage.setItem('dualtrack_settings_' + state.user.uid, JSON.stringify(state.settings)); } catch(e){} }
function saveGameStats() { try { localStorage.setItem('dualtrack_gamestats', JSON.stringify(state.gameStats)); } catch(e){} }

function navigateTo(tab, options = {}) {
  if (!tab) return;
  if (!isMobile()) {
    if (tab === 'tasks' && options.filter && $('taskFilter')) $('taskFilter').value = options.filter;
    goTab(tab);
    if (options.highlight) highlightItem(options.highlight);
  } else {
    const mobileMap = { dashboard:'dashboard', tasks:'tasks', today:'today', goals:'goals', games:'games', vault:'vault' };
    if (mobileMap[tab]) { switchMobileScreen(mobileMap[tab]); if (options.highlight) setTimeout(() => highlightItem(options.highlight), 200); }
    else { enterFullscreenTab(tab); }
  }
}
window.navigateTo = navigateTo;
function highlightItem(id) {
  if (!id) return;
  setTimeout(() => {
    const el = document.querySelector(`[data-edit="${id}"], [data-toggle="${id}"], [data-td="${id}"], [data-goalm="${id}"], [data-mtoggle="${id}"], [data-mttoggle="${id}"]`);
    if (!el) return;
    const card = el.closest('.rounded-2xl, .glass, .m-task, .m-todo, .m-goal') || el.parentElement;
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('highlight-pulse');
    setTimeout(() => card.classList.remove('highlight-pulse'), 4500);
  }, 250);
}
async function checkAIHealth() {
  try { const res = await fetch(`${WORKER_URL}/health`); if (!res.ok) throw new Error('HTTP ' + res.status); return await res.json(); }
  catch(e) { console.warn('AI Worker unreachable:', e.message); return null; }
}
window.checkAIHealth = checkAIHealth;

// Mobile-only fullscreen for games. Guarded so it's a no-op on desktop.
function enterFullscreenTab(tab) {
  if (!isMobile()) { goTab(tab); return; }
  document.body.classList.add('mobile-game-open');
  goTab(tab);
  closeSidebar();
  let bar = document.getElementById('mobileReturnBar');
  if (!bar) {
    bar = document.createElement('button');
    bar.id = 'mobileReturnBar';
    bar.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Back to Mobile';
    bar.onclick = () => exitFullscreenTab();
    document.body.appendChild(bar);
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
}
function exitFullscreenTab() {
  document.body.classList.remove('mobile-game-open');
  const bar = document.getElementById('mobileReturnBar');
  if (bar) bar.remove();
  document.getElementById('mobileAppShell').style.display = 'grid';
  switchMobileScreen(state.mobileScreen || 'dashboard');
}

function renderChrome() {
  const p = state.profile; if (!p) return;
  const name = p.name || state.user.email;
  const safe = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  safe('topName', name); safe('profileName', name);
  safe('profileEmail', p.email || state.user.email);
  if ($('profNameInput')) $('profNameInput').value = p.name || '';
  if ($('profTaglineInput')) $('profTaglineInput').value = p.tagline || '';
  if ($('profHobbiesInput')) $('profHobbiesInput').value = p.hobbies || '';
  const paint = el => { if (!el) return;
    if (p.avatar) el.innerHTML = `<img src="${p.avatar}" class="w-full h-full object-cover" alt="" />`;
    else { el.textContent = initials(name); el.style.background = `linear-gradient(135deg, ${p.accent||'#38bdf8'}, #7c3aed)`; } };
  paint($('topAvatar')); paint($('profileAvatar')); paint($('mAvatarBtn'));
  const setTxt = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  setTxt('navTaskCount', myTasks().filter(t => !t.done).length);
  setTxt('navTodoCount', myTodos().filter(t => t.date === todayStr() && !t.done).length);
  setTxt('navDocCount', myDocs().length);
  setTxt('navHandoffCount', allHandoffs().filter(h => h.toUid === state.user.uid && h.status === 'pending').length);
  setTxt('navHistoryCount', Object.keys(state.history || {}).filter(k => state.history[k].uid === state.user.uid).length);
  const pu = partnerUid();
  const strip = $('partnerStrip');
  if (strip) {
    if (pu && state.profiles[pu]) {
      const pp = state.profiles[pu]; const on = isOnline(pu);
      strip.innerHTML = `<div class="flex items-center gap-2.5">
        <span class="avatar-ring"><span class="w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold text-white overflow-hidden" style="background:linear-gradient(135deg,${pp.accent||'#a855f7'},#7c3aed)">
          ${pp.avatar ? `<img src="${pp.avatar}" class="w-full h-full object-cover"/>` : esc(initials(pp.name))}</span></span>
        <span class="flex-1 min-w-0"><span class="block text-[11.5px] font-semibold text-slate-200 truncate">${esc(pp.name)}</span>
          <span class="flex items-center gap-1.5 text-[10px] ${on?'text-emerald-400':'text-slate-500'}"><span class="w-1.5 h-1.5 rounded-full ${on?'bg-emerald-400':'bg-slate-600'}"></span>${on?'Online':'Offline'}</span></span></div>`;
    } else strip.innerHTML = `<div class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-slate-600"></span><span class="text-[10.5px] text-slate-500">Select partner</span></div>`;
  }
  const ps = $('partnerState');
  if (ps) { if (pu) { ps.textContent = isOnline(pu) ? 'Online' : 'Offline'; ps.className = isOnline(pu) ? 'text-emerald-400 font-semibold' : 'text-slate-500 font-semibold'; } else { ps.textContent = 'None'; ps.className = 'text-slate-500 font-semibold'; } }
  const lst = $('lastSyncText'); if (lst && state.lastSync) lst.textContent = state.lastSync.toLocaleTimeString('en-GB');
  const cp = $('colorPicker');
  if (cp) { if (!cp.dataset.built) { cp.dataset.built = '1';
    cp.innerHTML = ACCENTS.map(c => `<button type="button" data-accent="${c}" class="w-8 h-8 rounded-full border-2" style="background:${c};border-color:transparent"></button>`).join('');
    cp.querySelectorAll('[data-accent]').forEach(b => b.onclick = () => { cp.querySelectorAll('[data-accent]').forEach(x => x.style.borderColor = 'transparent'); b.style.borderColor = '#fff'; cp.dataset.selected = b.dataset.accent; }); }
    cp.dataset.selected = p.accent || ACCENTS[0];
    cp.querySelectorAll('[data-accent]').forEach(x => x.style.borderColor = x.dataset.accent === (p.accent||ACCENTS[0]) ? '#fff' : 'transparent'); }
  const psel = $('partnerSelect');
  if (psel) { const cur = state.settings.activePartnerId || '';
    psel.innerHTML = '<option value="">â€” None â€”</option>' + Object.values(state.profiles).filter(x => x.uid !== state.user.uid).map(x => `<option value="${x.uid}" ${x.uid===cur?'selected':''}>${esc(x.name)} Â· ${esc(x.email)}</option>`).join('');
    psel.onchange = () => { state.settings.activePartnerId = psel.value; persistSettings(); renderAll(); updateChatHeader(); }; }
  renderNotificationsBadge();
  if ($('queueState')) $('queueState').textContent = getQueue().length;
  if ($('mGreeting')) { const h = new Date().getHours(); const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; $('mGreeting').textContent = `${greet}, ${name.split(' ')[0]}`; }
}
function renderNotificationsBadge() {
  const list = buildNotifications();
  const badge = $('notifCount');
  if (badge) { if (list.length) { badge.textContent = list.length > 9 ? '9+' : list.length; badge.classList.remove('hidden'); } else badge.classList.add('hidden'); }
  const mbadge = $('mNotifDot');
  if (mbadge) { if (list.length) { mbadge.textContent = list.length > 9 ? '9+' : list.length; mbadge.style.display = 'grid'; } else mbadge.style.display = 'none'; }
}

function renderDashboardAlerts() {
  const host = $('alertBannerContainer'); if (!host) return;
  const today = todayStr();
  const alerts = [];
  const overdue = myTasks().filter(t => !t.done && t.dueDate && t.dueDate < today);
  if (overdue.length) alerts.push({ color:'#fb7185', icon:'fa-triangle-exclamation', title:`${overdue.length} overdue task${overdue.length>1?'s':''}`, sub: overdue.slice(0,2).map(t=>t.title).join(' Â· '), tab:'tasks', filter:'overdue' });
  const overdueTodos = myTodos().filter(t => !t.done && t.date < today);
  if (overdueTodos.length) alerts.push({ color:'#fb7185', icon:'fa-circle-check', title:`${overdueTodos.length} overdue to-do${overdueTodos.length>1?'s':''}`, sub: overdueTodos.slice(0,2).map(t=>t.text).join(' Â· '), tab:'today' });
  const dueToday = myTasks().filter(t => !t.done && t.dueDate === today);
  if (dueToday.length) alerts.push({ color:'#fbbf24', icon:'fa-hourglass-half', title:`${dueToday.length} due today`, sub: dueToday.slice(0,2).map(t=>t.title).join(' Â· '), tab:'tasks', filter:'today' });
  const dueSoon = myTasks().filter(t => { if (t.done || !t.dueDate) return false; const d = dueDateTime(t); if (!d) return false; const diff = d.getTime() - Date.now(); return diff > 0 && diff < 2*3600000; });
  if (dueSoon.length) alerts.push({ color:'#fbbf24', icon:'fa-clock', title:`${dueSoon.length} due in <2h`, sub: dueSoon.slice(0,2).map(t=>t.title).join(' Â· '), tab:'tasks', filter:'open' });
  const pending = allHandoffs().filter(h => h.toUid === state.user.uid && h.status === 'pending');
  if (pending.length) alerts.push({ color:'#22d3ee', icon:'fa-arrows-rotate', title:`${pending.length} handoff${pending.length>1?'s':''} waiting`, sub: pending.slice(0,2).map(h=>h.title).join(' Â· '), tab:'handoffs' });
  const goalSoon = allGoals().filter(g => { if (g.completedAt || !g.targetDate) return false; const d = daysUntil(g.targetDate); return d >= 0 && d <= 7; });
  if (goalSoon.length) alerts.push({ color:'#fb923c', icon:'fa-bullseye', title:`${goalSoon.length} goal${goalSoon.length>1?'s':''} ending soon`, sub: goalSoon.slice(0,2).map(g=>`${g.title} (${daysUntil(g.targetDate)}d)`).join(' Â· '), tab:'goals' });
  const subsDue = allSubs().filter(s => s.nextDate && daysUntil(s.nextDate) <= 7 && daysUntil(s.nextDate) >= 0);
  if (subsDue.length) alerts.push({ color:'#a855f7', icon:'fa-repeat', title:`${subsDue.length} subscription${subsDue.length>1?'s':''} due soon`, sub: subsDue.slice(0,2).map(s=>s.name).join(' Â· '), tab:'financials' });
  if (!alerts.length) {
    host.innerHTML = `<div class="rounded-2xl glass p-4 flex items-center gap-3" style="border-left:3px solid #34d399"><div class="w-8 h-8 rounded-lg grid place-items-center" style="background:#34d39922;color:#34d399"><i class="fa-solid fa-circle-check"></i></div><span class="text-[13px] text-slate-300">You're all caught up. Enjoy your day âœ¨</span></div>`;
    return;
  }
  host.innerHTML = alerts.map(a => `<div class="alert-row" style="--a-color:${a.color}" data-go-tab="${a.tab}" data-go-filter="${a.filter || ''}">
    <div class="alert-icon"><i class="fa-solid ${a.icon}"></i></div>
    <div class="alert-body"><div class="alert-title">${esc(a.title)}</div><div class="alert-sub">${esc(a.sub)}</div></div>
    <i class="fa-solid fa-chevron-right text-slate-600 text-[11px]"></i></div>`).join('');
  host.querySelectorAll('.alert-row').forEach(el => el.onclick = () => navigateTo(el.dataset.goTab, { filter: el.dataset.goFilter }));
}
function renderNotifDropdown() {
  const host = $('notifBody'); if (!host) return;
  const items = [];
  const today = todayStr();
  myTasks().filter(t => !t.done && t.dueDate && t.dueDate < today).slice(0,3).forEach(t => items.push({ icon:'fa-triangle-exclamation', type:'danger', title:'Overdue task: ' + t.title, sub:'Was due ' + fmtDate(t.dueDate), time: fmtDate(t.dueDate), tab:'tasks', filter:'overdue', id: t.id }));
  myTasks().filter(t => !t.done && t.dueDate === today).slice(0,3).forEach(t => items.push({ icon:'fa-hourglass-half', type:'warning', title:'Due today: ' + t.title, sub: t.dueTime ? 'By ' + t.dueTime : 'Today', time: 'Today', tab:'tasks', filter:'today', id: t.id }));
  myTodos().filter(t => t.date === today && !t.done).slice(0,3).forEach(t => items.push({ icon:'fa-circle-check', type:'info', title:'To-do: ' + t.text, sub: t.dueTime ? 'By ' + t.dueTime : 'Today', time: 'Today', tab:'today', id: t.id }));
  allHandoffs().filter(h => h.toUid === state.user.uid && h.status === 'pending').slice(0,2).forEach(h => items.push({ icon:'fa-arrows-rotate', type:'info', title:'Handoff: ' + h.title, sub: 'From ' + (state.profiles[h.fromUid]?.name || 'partner'), time: timeAgo(h.createdAt), tab:'handoffs', id: h.id }));
  allSubs().filter(s => s.nextDate && daysUntil(s.nextDate) <= 7 && daysUntil(s.nextDate) >= 0).slice(0,2).forEach(s => items.push({ icon:'fa-repeat', type:'warning', title:'Subscription: ' + s.name, sub: fmtMoney(s.amount) + ' Â· ' + fmtDate(s.nextDate), time: fmtDate(s.nextDate), tab:'financials' }));
  const pu = partnerUid();
  if (pu) {
    Object.values(state.chat || {}).filter(m => m.from === pu && m.to === state.user.uid && (m.ts||0) > (state.lastChatSeenTs||0)).slice(0,2).forEach(m => items.push({ icon:'fa-comments', type:'info', title:'Message from ' + profileName(pu), sub: m.text.slice(0,60), time: timeAgo(m.ts), tab:'dashboard' }));
  }
  if (!items.length) { host.innerHTML = `<div class="notif-empty"><i class="fa-solid fa-bell-slash"></i>You're all caught up!</div>`; return; }
  host.innerHTML = items.map(n => `<div class="notif-item ${n.type}" data-go-tab="${n.tab}" data-go-filter="${n.filter||''}" data-go-id="${n.id||''}">
    <div class="ni-icon"><i class="fa-solid ${n.icon}"></i></div>
    <div class="ni-body"><div class="ni-title">${esc(n.title)}</div><div class="ni-sub">${esc(n.sub)}</div></div>
    <div class="ni-time">${n.time || ''}</div></div>`).join('');
  host.querySelectorAll('.notif-item').forEach(el => el.onclick = () => {
    const dd = $('notifDropdown'); if (dd) dd.classList.remove('show');
    navigateTo(el.dataset.goTab, { filter: el.dataset.goFilter, highlight: el.dataset.goId });
  });
}

function renderAll() {
  if (!state.user || !state.profile) return;
  renderUpcoming();
  renderDashboard(); renderShared(); renderTasks(); renderToday(); renderSchedule(); renderVault();
  renderFinancials(); renderGoals(); renderSkills(); renderHandoffs(); renderGames();
  renderActivities(); renderHourly(); renderProfileStats(); renderHistory();
}
function renderUpcoming() {
  const host = $('upcomingGrid'); if (!host) return;
  const items = [];
  myTasks().filter(t => !t.done).forEach(t => { const d = dueDateTime(t); if (d) items.push({ ...t, _type:'task', _due: d }); });
  myTodos().filter(t => !t.done).forEach(t => { const d = dueDateTime(t); if (d) items.push({ text: t.text, ...t, _type:'todo', _due: d }); });
  allGoals().forEach(g => { if (g.completedAt) return; const d = dueDateTime(g); if (d) items.push({ ...g, _type:'goal', _due: d }); });
  items.sort((a,b) => a._due - b._due);
  const soon = items.filter(x => x._due.getTime() - Date.now() < 24 * 3600000);
  if (!soon.length) { host.innerHTML = ''; return; }
  host.innerHTML = soon.slice(0,6).map(x => {
    const diff = x._due.getTime() - Date.now();
    const label = x._type === 'task' ? 'Task' : x._type === 'todo' ? 'To-do' : 'Goal';
    const color = x._type === 'task' ? '#38bdf8' : x._type === 'todo' ? '#fbbf24' : '#fb923c';
    const title = x.title || x.text || '(untitled)';
    return `<div class="upcoming-card rounded-2xl glass p-3.5 flex items-center gap-3" style="border-left:3px solid ${color}" data-go-tab="${x._type === 'goal' ? 'goals' : x._type === 'todo' ? 'today' : 'tasks'}" data-go-id="${x.id}">
      <div class="w-9 h-9 rounded-xl grid place-items-center shrink-0" style="background:${color}22;color:${color}"><i class="fa-solid ${x._type === 'goal' ? 'fa-bullseye' : x._type === 'todo' ? 'fa-circle-check' : 'fa-list-check'}"></i></div>
      <div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap mb-1"><span class="text-[10px] font-bold uppercase tracking-wider" style="color:${color}">${label}</span><span class="badge b-${x.priority || 'medium'}">${esc(x.priority || 'medium')}</span></div>
        <div class="font-semibold text-[13px] text-slate-200 truncate">${esc(title)}</div></div>
      <span class="countdown-pill ${countdownClass(diff)}" data-countdown="${x._due.getTime()}"><i class="fa-regular fa-hourglass-half"></i> ${formatCountdown(diff)}</span>
    </div>`;
  }).join('');
  host.querySelectorAll('[data-go-tab]').forEach(el => el.onclick = () => navigateTo(el.dataset.goTab, { highlight: el.dataset.goId }));
}
function metricsFor(u) {
  const tasks = tasksOf(u), todos = todosOf(u), events = Object.values(state.schedule[u]||{}), docs = Object.values(state.documents||{}), hourly = hourlyOf(u);
  const today = todayStr(), nowIso = new Date().toISOString().slice(0,16);
  const total = tasks.length, done = tasks.filter(t => t.done).length;
  const overdue = tasks.filter(t => !t.done && t.dueDate && t.dueDate < today).length;
  const dueToday = tasks.filter(t => !t.done && t.dueDate === today).length;
  const completion = total ? Math.round((done/total)*100) : 0;
  const completedTasks = tasks.filter(t => t.done && t.completedAt);
  const onTime = completedTasks.filter(t => !t.dueDate || t.completedAt.slice(0,10) <= t.dueDate).length;
  const onTimeRate = completedTasks.length ? Math.round((onTime/completedTasks.length)*100) : 100;
  const todayTodos = todos.filter(t => t.date === today), todayDone = todayTodos.filter(t => t.done).length;
  const todoRate = todayTodos.length ? Math.round((todayDone/todayTodos.length)*100) : 0;
  let t7=0,d7=0;
  for (let i=0;i<7;i++){ const d=new Date(); d.setDate(d.getDate()-i); const ds=dateStr(d); const day=todos.filter(t=>t.date===ds); t7+=day.length; d7+=day.filter(t=>t.done).length; }
  const habitRate = t7 ? Math.round((d7/t7)*100) : 0;
  const upcoming = events.filter(e => e.start && e.start >= nowIso).sort((a,b)=> a.start.localeCompare(b.start));
  const next7 = upcoming.filter(e => { const diff = new Date(e.start).getTime() - Date.now(); return diff >= 0 && diff <= 7*86400000; });
  const scheduleScore = Math.min(100, next7.length * 20);
  let streak = 0;
  for (let i=0;i<60;i++){ const d=new Date(); d.setDate(d.getDate()-i); const ds=dateStr(d);
    const hadTodo = todos.some(t=>t.date===ds && t.done); const hadTask = tasks.some(t=>t.done && t.completedAt && t.completedAt.slice(0,10)===ds);
    if (hadTodo || hadTask) streak++; else if (i>0) break; }
  const docsScore = Math.min(100, docs.length * 10);
  const hourlyToday = hourly.filter(h => h.date === today);
  const hourlyScore = Math.min(100, hourlyToday.length * 4);
  const skills = allSkills();
  const skillsScore = skills.length ? Math.round(skills.reduce((sum, s) => sum + Math.min(100, s.target ? (s.hours / s.target) * 100 : 0), 0) / skills.length) : 0;
  const goals = allGoals();
  const goalsScore = goals.length ? Math.round(goals.reduce((sum, g) => {
    const linked = Object.values(state.tasks).flatMap(t => Object.values(t)).filter(t => t.linkedGoalId === g.id);
    const done = linked.filter(t => t.done).length;
    const ms = g.milestones || []; const mDone = ms.filter(m => m.done).length;
    const tot = linked.length + ms.length;
    return sum + (tot ? (done + mDone) / tot * 100 : 0);
  }, 0) / goals.length) : 0;
  const savs = allSavings();
  const totalSaved = savs.reduce((s,g) => s + Number(g.current||0), 0);
  const totalTarget = savs.reduce((s,g) => s + Number(g.target||0), 0);
  const financeScore = totalTarget ? Math.min(100, Math.round((totalSaved/totalTarget)*100)) : (savs.length ? 100 : 0);
  const todayKey = todayStr();
  const actData = state.activities[u] || {};
  const actItems = (actData.date === todayKey ? actData.items || [] : []);
  const completions = actData.completions || {};
  const actDone = actItems.filter(a => completions[`${todayKey}-${String(a.hour).padStart(2,'0')}`]?.done).length;
  const activitiesScore = actItems.length ? Math.round((actDone / actItems.length) * 100) : 0;
  return { uid:u, total, done, open: total-done, overdue, dueToday, completion, onTimeRate, todoRate, habitRate, scheduleScore, docsScore, hourlyScore, skillsScore, goalsScore, financeScore, activitiesScore, todayTodos: todayTodos.length, todayDone, streak, upcomingCount: upcoming.length, docCount: docs.length, hourlyToday: hourlyToday.length, events, tasks, todos, docs, upcoming };
}
function completionSeries(u, days = 14) {
  const out = []; const tasks = tasksOf(u); let cum = 0;
  for (let i = days-1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const ds = dateStr(d);
    cum += tasks.filter(t => t.done && t.completedAt && t.completedAt.slice(0,10) === ds).length;
    out.push({ date: ds, value: cum }); }
  return out;
}
function dailyCompletions(u, days = 7) {
  const out = []; const tasks = tasksOf(u), todos = todosOf(u);
  for (let i = days-1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const ds = dateStr(d);
    const t = tasks.filter(x => x.done && x.completedAt && x.completedAt.slice(0,10) === ds).length;
    const td = todos.filter(x => x.done && x.date === ds).length;
    out.push({ label: d.toLocaleDateString('en-GB',{weekday:'short'}), tasks: t, todos: td }); }
  return out;
}
function getGoalProgress(g) {
  const linked = Object.values(state.tasks).flatMap(t => Object.values(t)).filter(t => t.linkedGoalId === g.id);
  const done = linked.filter(t => t.done).length;
  const ms = g.milestones || []; const mDone = ms.filter(m => m.done).length;
  const tot = linked.length + ms.length;
  return tot ? Math.round(((done + mDone) / tot) * 100) : 0;
}

function renderDashboard() {
  const m = metricsFor(state.user.uid);
  const pu = partnerUid(); const pm = pu ? metricsFor(pu) : null;
  const kpis = [
    { label:'Tasks', value: m.total, icon:'fa-list-check', color:'#38bdf8' },
    { label:'Completed', value: m.done, icon:'fa-circle-check', color:'#34d399' },
    { label:'Completion', value: m.completion + '%', icon:'fa-percent', color:'#a855f7' },
    { label:'Overdue', value: m.overdue, icon:'fa-triangle-exclamation', color:'#fb7185' },
    { label:'Today', value: `${m.todayDone}/${m.todayTodos}`, icon:'fa-circle-dot', color:'#fbbf24' },
    { label:'Streak', value: m.streak + 'ðŸ”¥', icon:'fa-fire', color:'#f97316' }
  ];
  const kpiRoutes = { 'Tasks':'tasks', 'Completed':'tasks', 'Completion':'tasks', 'Overdue':'tasks', 'Today':'today', 'Streak':'today' };
  $('kpiGrid').innerHTML = kpis.map(k => `<div class="kpi-clickable rounded-2xl p-4 glass card-3d" data-go-tab="${kpiRoutes[k.label] || 'dashboard'}" data-go-filter="${k.label === 'Overdue' ? 'overdue' : k.label === 'Completed' ? 'done' : k.label === 'Tasks' ? 'all' : ''}">
    <div class="w-9 h-9 rounded-xl grid place-items-center mb-2.5" style="background:${k.color}22;color:${k.color}"><i class="fa-solid ${k.icon} text-[14px]"></i></div>
    <div class="font-display text-[22px] font-bold text-white leading-none">${k.value}</div>
    <div class="text-[10px] uppercase tracking-[.8px] text-slate-500 mt-1.5 font-semibold">${k.label}</div></div>`).join('');
  $('kpiGrid').querySelectorAll('[data-go-tab]').forEach(el => el.onclick = () => navigateTo(el.dataset.goTab, { filter: el.dataset.goFilter }));
  renderDashboardAlerts();
  const bars = [
    { label:'Task Completion', value: m.completion, cls:'fill-cyan' },
    { label:'On-Time Delivery', value: m.onTimeRate, cls:'fill-emerald' },
    { label:"Today's To-Dos", value: m.todoRate, cls:'fill-amber' },
    { label:'7-Day Habits', value: m.habitRate, cls:'fill-violet' },
    { label:'Schedule Coverage', value: m.scheduleScore, cls:'fill-rose' },
    { label:'Hourly Tracking', value: m.hourlyScore, cls:'fill-cyan' }
  ];
  $('metricBars').innerHTML = bars.map(b => `<div>
    <div class="flex items-center justify-between mb-1.5"><span class="text-[12px] font-medium text-slate-400">${b.label}</span><span class="text-[12.5px] font-display font-bold text-slate-200">${b.value}%</span></div>
    <div class="progress-shell"><div class="progress-fill ${b.cls}" style="width:${b.value}%"></div></div></div>`).join('');
  const todayTodos = myTodos().filter(t => t.date === todayStr());
  const nextEvent = m.upcoming[0];
  const glance = [
    { icon:'fa-circle-check', color:'#34d399', label:'To-dos today', value:`${m.todayDone} / ${todayTodos.length}`, tab:'today' },
    { icon:'fa-hourglass-half', color:'#fbbf24', label:'Due today', value: m.dueToday, tab:'tasks', filter:'today' },
    { icon:'fa-clock-rotate-left', color:'#22d3ee', label:'Hours logged', value: m.hourlyToday, tab:'hourly' },
    { icon:'fa-calendar-day', color:'#fb7185', label:'Next event', value: nextEvent ? nextEvent.title : 'â€”', tab:'schedule' },
    { icon:'fa-users', color:'#a855f7', label:'Partner', value: pm ? pm.completion + '%' : 'â€”', tab:'shared' }
  ];
  $('todayGlance').innerHTML = glance.map(g => `<div class="flex items-center gap-3 p-3 rounded-xl bg-white/[.03] border border-white/5 cursor-pointer hover:border-sky-400/40 transition-colors" data-go-tab="${g.tab}" data-go-filter="${g.filter||''}">
    <span class="w-8 h-8 rounded-lg grid place-items-center shrink-0" style="background:${g.color}1f;color:${g.color}"><i class="fa-solid ${g.icon} text-[12px]"></i></span>
    <span class="text-[12px] text-slate-400 flex-1">${g.label}</span>
    <span class="font-display text-[13px] font-bold text-slate-200 truncate max-w-[130px]">${esc(String(g.value))}</span></div>`).join('');
  $('todayGlance').querySelectorAll('[data-go-tab]').forEach(el => el.onclick = () => navigateTo(el.dataset.goTab, { filter: el.dataset.goFilter }));
  const acts = [];
  myTasks().forEach(t => { acts.push({ ts:t.createdAt, icon:'fa-plus', color:'#38bdf8', text:`Created "${t.title}"` }); if (t.done && t.completedAt) acts.push({ ts:t.completedAt, icon:'fa-check', color:'#34d399', text:`Completed "${t.title}"` }); });
  myTodos().filter(t => t.done).forEach(t => acts.push({ ts:t.completedAt||t.createdAt, icon:'fa-circle-check', color:'#fbbf24', text:`To-do: "${t.text}"` }));
  myDocs().forEach(d => acts.push({ ts:d.uploadedAt, icon:'fa-upload', color:'#22d3ee', text:`Uploaded ${d.name}` }));
  mySchedule().forEach(e => acts.push({ ts:e.createdAt, icon:'fa-calendar-plus', color:'#fb7185', text:`Scheduled "${e.title}"` }));
  myHourly().slice(-10).forEach(h => acts.push({ ts:h.createdAt, icon:'fa-clock', color:'#34d399', text:h.text }));
  acts.sort((a,b) => new Date(b.ts||0) - new Date(a.ts||0));
  $('activityFeed').innerHTML = acts.length ? acts.slice(0,20).map(a => `<div class="flex items-start gap-3 p-3 rounded-xl bg-white/[.03] border-l-[3px]" style="border-left-color:${a.color}">
    <i class="fa-solid ${a.icon} text-[12px] mt-1" style="color:${a.color}"></i>
    <span class="flex-1 text-[12.5px] text-slate-300">${esc(a.text)}</span>
    <span class="text-[10.5px] text-slate-600 whitespace-nowrap">${timeAgo(a.ts)}</span></div>`).join('')
    : `<div class="text-center py-10 text-slate-500 text-[13px]"><i class="fa-solid fa-inbox text-3xl block mb-3 opacity-40"></i>No activity yet.</div>`;
  buildCharts(m, pm, pu);
}
function destroyChart(id) { if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; } }
function grad(ctx, c1, c2, vert = true) { const g = vert ? ctx.createLinearGradient(0,0,0,260) : ctx.createLinearGradient(0,0,300,0); g.addColorStop(0,c1); g.addColorStop(1,c2); return g; }
function buildCharts(m, pm, pu) {
  const isDark = document.documentElement.classList.contains('dark');
  const grid = isDark ? 'rgba(148,163,184,.12)' : 'rgba(15,23,42,.08)';
  const tick = isDark ? '#94a3b8' : '#475569';
  const me = state.profile?.name || 'You';
  const pn = pu && state.profiles[pu] ? state.profiles[pu].name : 'Partner';
  destroyChart('donut'); const dctx = $('chartDonut')?.getContext('2d');
  if (dctx) { const empty = m.total === 0;
    state.charts.donut = new Chart(dctx, { type:'doughnut',
      data:{ labels: empty ? ['No tasks'] : ['Done','In Progress','Overdue'],
        datasets:[{ data: empty ? [1] : [m.done, Math.max(0, m.total-m.done-m.overdue), m.overdue],
          backgroundColor: empty ? ['rgba(100,116,139,.35)'] : [grad(dctx,'#4ade80','#059669',false),grad(dctx,'#38bdf8','#0284c7',false),grad(dctx,'#fb7185','#be123c',false)],
          borderColor: isDark ? '#0b1220' : '#fff', borderWidth: 3, hoverOffset: 14, borderRadius: 6 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'62%',
        plugins:{ legend:{ position:'bottom', labels:{ color:tick, usePointStyle:true, boxWidth:9, padding:14, font:{size:11,weight:'600'} } } } } }); }
  destroyChart('bars'); const bctx = $('chartBars')?.getContext('2d');
  if (bctx) { const mine = dailyCompletions(state.user.uid,7); const theirs = pu ? dailyCompletions(pu,7) : null;
    const ds = [{ label: me, data: mine.map(d=>d.tasks+d.todos), backgroundColor: grad(bctx,'#67e8f9','#0891b2'), borderColor:'#22d3ee', borderWidth:1.5, borderRadius:8, borderSkipped:false, barPercentage:.72, categoryPercentage:.62 }];
    if (pu) ds.push({ label: pn, data: theirs.map(d=>d.tasks+d.todos), backgroundColor: grad(bctx,'#d8b4fe','#7c3aed'), borderColor:'#a855f7', borderWidth:1.5, borderRadius:8, borderSkipped:false, barPercentage:.72, categoryPercentage:.62 });
    state.charts.bars = new Chart(bctx, { type:'bar', data:{ labels: mine.map(d=>d.label), datasets:ds },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{ color:tick, usePointStyle:true, boxWidth:9, padding:14, font:{size:11,weight:'600'} } } },
        scales:{ y:{ beginAtZero:true, ticks:{ color:tick, precision:0 }, grid:{ color:grid, drawBorder:false } }, x:{ ticks:{ color:tick, font:{size:10.5,weight:'600'} }, grid:{ display:false } } } } }); }
  destroyChart('radar'); const rctx = $('chartRadar')?.getContext('2d');
  if (rctx) {
    const axes = ['Tasks', 'To-Dos', 'Goals', 'Skills', 'Finance', 'Schedule', 'Hourly', 'Activities'];
    const myData = [m.completion, m.habitRate, m.goalsScore, m.skillsScore, m.financeScore, m.scheduleScore, m.hourlyScore, m.activitiesScore];
    const ds = [{ label: me, data: myData, borderColor:'#22d3ee', backgroundColor:'rgba(34,211,238,.22)', pointBackgroundColor:'#22d3ee', pointBorderColor: isDark?'#0b1220':'#fff', pointBorderWidth:2, pointRadius:4, pointHoverRadius:6, borderWidth:2.5, fill:true }];
    if (pm) ds.push({ label: pn, data: [pm.completion, pm.habitRate, pm.goalsScore, pm.skillsScore, pm.financeScore, pm.scheduleScore, pm.hourlyScore, pm.activitiesScore], borderColor:'#a855f7', backgroundColor:'rgba(168,85,247,.18)', pointBackgroundColor:'#a855f7', pointBorderColor: isDark?'#0b1220':'#fff', pointBorderWidth:2, pointRadius:4, pointHoverRadius:6, borderWidth:2.5, fill:true });
    state.charts.radar = new Chart(rctx, { type:'radar', data:{ labels: axes, datasets: ds },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'bottom', labels:{ color:tick, usePointStyle:true, boxWidth:9, padding:14, font:{size:11,weight:'600'} } }, tooltip:{ callbacks:{ label: c => ` ${c.dataset.label}: ${c.parsed.r}%` } } },
        scales:{ r:{ beginAtZero:true, max:100, angleLines:{ color:grid }, grid:{ color:grid }, pointLabels:{ color:tick, font:{size:10.5,weight:'600'} }, ticks:{ display:false, stepSize:20 } } } } }); }
  destroyChart('line'); const lctx = $('chartLine')?.getContext('2d');
  if (lctx) { const mine = completionSeries(state.user.uid,14); const theirs = pu ? completionSeries(pu,14) : null;
    const ds = [{ label: me, data: mine.map(d=>d.value), borderColor:'#22d3ee', backgroundColor: grad(lctx,'rgba(34,211,238,.42)','rgba(34,211,238,.02)'), borderWidth:3, fill:true, tension:.42, pointRadius:0, pointHoverRadius:6, pointBackgroundColor:'#22d3ee' }];
    if (theirs) ds.push({ label: pn, data: theirs.map(d=>d.value), borderColor:'#a855f7', backgroundColor: grad(lctx,'rgba(168,85,247,.32)','rgba(168,85,247,.02)'), borderWidth:3, fill:true, tension:.42, pointRadius:0, pointHoverRadius:6, pointBackgroundColor:'#a855f7' });
    state.charts.line = new Chart(lctx, { type:'line',
      data:{ labels: mine.map(d => new Date(d.date+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'})), datasets:ds },
      options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
        plugins:{ legend:{ labels:{ color:tick, usePointStyle:true, boxWidth:9, padding:14, font:{size:11,weight:'600'} } } },
        scales:{ y:{ beginAtZero:true, ticks:{ color:tick, precision:0 }, grid:{ color:grid, drawBorder:false } }, x:{ ticks:{ color:tick, font:{size:10} }, grid:{ display:false } } } } }); }
  destroyChart('goals'); const gctx = $('chartGoals')?.getContext('2d');
  if (gctx) {
    const goals = allGoals();
    const short = goals.filter(g => g.type === 'short_term'); const long = goals.filter(g => g.type === 'long_term');
    const shortProgress = short.length ? Math.round(short.reduce((sum, g) => sum + getGoalProgress(g), 0) / short.length) : 0;
    const longProgress = long.length ? Math.round(long.reduce((sum, g) => sum + getGoalProgress(g), 0) / long.length) : 0;
    state.charts.goals = new Chart(gctx, { type: 'bar',
      data: { labels: ['Short-term', 'Long-term'], datasets: [{ label: 'Progress %', data: [shortProgress, longProgress], backgroundColor: grad(gctx,'#fb923c','#ea580c'), borderRadius: 8, borderSkipped: false, barPercentage: .6 }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.parsed.x}% avg` } } },
        scales: { x: { beginAtZero: true, max: 100, ticks: { color: tick, callback: v => v + '%' }, grid: { color: grid, drawBorder: false } }, y: { ticks: { color: tick, font: { size: 11, weight: '600' } }, grid: { display: false } } } } });
  }
  destroyChart('skills'); const skctx = $('chartSkills')?.getContext('2d');
  if (skctx) {
    const skills = allSkills().slice().sort((a,b) => (b.hours||0) - (a.hours||0)).slice(0,8);
    const labels = skills.map(s => s.name.length > 14 ? s.name.slice(0,14) + 'â€¦' : s.name);
    const data = skills.map(s => s.target ? Math.min(100, Math.round((s.hours/s.target)*100)) : 0);
    const colors = ['#38bdf8','#a855f7','#34d399','#fbbf24','#fb7185','#22d3ee','#f472b6','#818cf8'];
    state.charts.skills = new Chart(skctx, { type: 'bar', data: { labels, datasets: [{ label: 'Progress', data, backgroundColor: data.map((_, i) => colors[i % colors.length]), borderRadius: 8, borderSkipped: false, barPercentage: .7 }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, max: 100, ticks: { color: tick, callback: v => v + '%' }, grid: { color: grid, drawBorder: false } }, y: { ticks: { color: tick, font: { size: 10.5, weight: '600' } }, grid: { display: false } } } } });
  }
  destroyChart('finance'); const fctx = $('chartFinance')?.getContext('2d');
  if (fctx) {
    const exps = allExpenses().reduce((s,e) => s + Number(e.amount||0), 0);
    const saved = allSavings().reduce((s,g) => s + Number(g.current||0), 0);
    const target = allSavings().reduce((s,g) => s + Number(g.target||0), 0);
    const subs = allSubs().reduce((s,x) => { const a = Number(x.amount||0); if (x.cycle === 'yearly') return s + a/12; if (x.cycle === 'weekly') return s + a*4.33; return s + a; }, 0);
    state.charts.finance = new Chart(fctx, { type: 'bar', data: { labels: ['Expenses', 'Saved', 'Target', 'Monthly Subs'], datasets: [{ label: 'Amount', data: [exps, saved, target, subs], backgroundColor: ['#fb7185', '#34d399', '#38bdf8', '#a855f7'], borderRadius: 8, borderSkipped: false, barPercentage: .65 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` KSh ${Number(c.parsed.y).toLocaleString()}` } } },
        scales: { y: { beginAtZero: true, ticks: { color: tick, callback: v => 'KSh ' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) }, grid: { color: grid, drawBorder: false } }, x: { ticks: { color: tick, font: { size: 10.5, weight: '600' } }, grid: { display: false } } } } });
  }
}

function renderShared() {
  const host = $('sharedGrid'); if (!host) return;
  const ids = Object.keys(state.profiles);
  if (!ids.length) { host.innerHTML = `<div class="text-center py-16 text-slate-500">No profiles yet.</div>`; return; }
  host.innerHTML = ids.map(id => {
    const p = state.profiles[id]; const m = metricsFor(id);
    const isMe = id === state.user.uid; const online = isOnline(id);
    const accent = p.accent || '#38bdf8';
    const fc = m.completion >= 70 ? 'fill-emerald' : m.completion >= 40 ? 'fill-cyan' : 'fill-amber';
    return `<div class="rounded-2xl glass card-3d overflow-hidden">
      <div class="h-1.5 w-full" style="background:linear-gradient(90deg,${accent},#7c3aed)"></div>
      <div class="p-6">
        <div class="flex items-center gap-4 mb-5">
          <span class="avatar-ring"><span class="w-16 h-16 rounded-full grid place-items-center text-xl font-bold text-white overflow-hidden" style="background:linear-gradient(135deg,${accent},#7c3aed)">
            ${p.avatar ? `<img src="${p.avatar}" class="w-full h-full object-cover"/>` : esc(initials(p.name))}</span></span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap"><h3 class="font-display text-[17px] font-bold text-white truncate">${esc(p.name)}</h3>${isMe ? `<span class="badge b-low">You</span>` : ''}</div>
            <p class="text-[11.5px] text-slate-500 truncate">${esc(p.tagline || p.email || '')}</p>
            <span class="inline-flex items-center gap-1.5 mt-1 text-[10.5px] font-semibold ${online?'text-emerald-400':'text-slate-500'}"><span class="w-1.5 h-1.5 rounded-full ${online?'bg-emerald-400 animate-pulse':'bg-slate-600'}"></span>${online?'Online':'Offline'}</span></div>
        </div>
        <div class="mb-4"><div class="flex justify-between items-end mb-2"><span class="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Completion</span><span class="font-display text-xl font-bold text-white">${m.completion}%</span></div>
          <div class="progress-shell"><div class="progress-fill ${fc}" style="width:${m.completion}%"></div></div></div>
        <div class="grid grid-cols-4 gap-2 mt-5 pt-5 border-t border-white/5 text-center">
          <div><div class="font-display text-[17px] font-bold text-sky-400">${m.total}</div><div class="text-[9.5px] uppercase tracking-wider text-slate-500 mt-0.5">Tasks</div></div>
          <div><div class="font-display text-[17px] font-bold text-emerald-400">${m.done}</div><div class="text-[9.5px] uppercase tracking-wider text-slate-500 mt-0.5">Done</div></div>
          <div><div class="font-display text-[17px] font-bold text-amber-400">${m.streak}</div><div class="text-[9.5px] uppercase tracking-wider text-slate-500 mt-0.5">Streak</div></div>
          <div><div class="font-display text-[17px] font-bold text-rose-400">${m.hourlyToday}</div><div class="text-[9.5px] uppercase tracking-wider text-slate-500 mt-0.5">Hours</div></div>
        </div>
      </div></div>`;
  }).join('');
}

function renderTasks() {
  const host = $('taskList'); if (!host) return;
  const q = ($('taskSearch')?.value || '').toLowerCase().trim();
  const f = $('taskFilter')?.value || 'all';
  const today = todayStr();
  let list = myTasks();
  if (q) list = list.filter(t => (t.title||'').toLowerCase().includes(q) || (t.notes||'').toLowerCase().includes(q));
  if (f === 'open') list = list.filter(t => !t.done);
  else if (f === 'done') list = list.filter(t => t.done);
  else if (f === 'overdue') list = list.filter(t => !t.done && t.dueDate && t.dueDate < today);
  else if (f === 'today') list = list.filter(t => t.dueDate === today);
  else if (f === 'assigned') list = list.filter(t => t.assignedTo && t.assignedTo !== state.user.uid);
  else if (['high','medium','low'].includes(f)) list = list.filter(t => (t.priority || 'medium') === f);
  list.sort((a,b) => { if (a.done !== b.done) return a.done?1:-1;
    const pa = {high:0,medium:1,low:2}[a.priority] ?? 1; const pb = {high:0,medium:1,low:2}[b.priority] ?? 1;
    if (pa !== pb) return pa - pb; return (a.dueDate||'9999').localeCompare(b.dueDate||'9999'); });
  if (!list.length) { host.innerHTML = `<div class="col-span-full text-center py-16 text-slate-500"><i class="fa-solid fa-clipboard-list text-4xl block mb-3 opacity-35"></i>${myTasks().length ? 'No matches.' : 'No tasks yet.'}</div>`; return; }
  host.innerHTML = list.map(t => {
    const overdue = !t.done && t.dueDate && t.dueDate < today;
    const dueToday = t.dueDate === today;
    const badge = t.done ? '<span class="badge b-done">Done</span>' : overdue ? '<span class="badge b-late">Overdue</span>' : `<span class="badge b-${t.priority||'medium'}">${esc(t.priority||'medium')}</span>`;
    const goal = t.linkedGoalId && state.goals[t.linkedGoalId] ? state.goals[t.linkedGoalId].title : null;
    const isAssigned = t.assignedTo && t.assignedTo !== state.user.uid;
    const assignedName = isAssigned ? (state.profiles[t.assignedTo]?.name || 'Partner') : null;
    return `<div class="rounded-2xl glass card-3d p-4 flex gap-3.5 ${t.done ? 'opacity-60' : ''}">
      <button data-toggle="${t.id}" class="w-6 h-6 mt-0.5 rounded-lg border-2 grid place-items-center shrink-0 transition-all ${t.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600 hover:border-sky-400'}">${t.done ? '<i class="fa-solid fa-check text-[11px] text-white"></i>' : ''}</button>
      <div class="flex-1 min-w-0">
        <div class="flex items-start gap-2 flex-wrap">
          <h4 class="font-semibold text-[14px] text-slate-100 leading-snug ${t.done ? 'line-through text-slate-500' : ''}">${esc(t.title)}</h4>${badge}
          ${isAssigned ? `<span class="badge b-purple"><i class="fa-solid fa-arrow-right-arrow-left mr-1"></i>${esc(assignedName)}</span>` : ''}
          ${t.aiScore ? `<span class="badge b-ai" title="${esc(t.aiReason||'')}"><i class="fa-solid fa-brain mr-1"></i>AI ${t.aiScore}</span>` : ''}
        </div>
        ${t.notes ? `<p class="text-[12px] text-slate-500 mt-1.5 line-clamp-2">${esc(t.notes)}</p>` : ''}
        ${goal ? `<div class="mt-1.5 text-[10.5px] text-orange-400"><i class="fa-solid fa-bullseye mr-1"></i>${esc(goal)}</div>` : ''}
        <div class="flex items-center gap-3 mt-2.5 flex-wrap text-[11px] text-slate-500">
          <span><i class="fa-solid fa-tag mr-1"></i>${esc(t.category||'Other')}</span>
          ${t.dueDate ? `<span class="${overdue ? 'text-rose-400 font-semibold' : dueToday ? 'text-amber-400 font-semibold' : ''}"><i class="fa-regular fa-calendar mr-1"></i>${fmtDate(t.dueDate)}${t.dueTime ? ' Â· ' + t.dueTime : ''}</span>` : ''}
          ${countdownPill(t, t.done)}
        </div>
      </div>
      <div class="flex flex-col gap-1.5 shrink-0">
        ${photoButton('task', t.id, !!t.completionPhoto)}
        <button data-edit="${t.id}" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-sky-500/20 text-slate-400 hover:text-sky-300 grid place-items-center"><i class="fa-solid fa-pen text-[11px]"></i></button>
        <button data-del="${t.id}" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 grid place-items-center"><i class="fa-solid fa-trash text-[11px]"></i></button>
      </div></div>`;
  }).join('');
  host.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => toggleTask(b.dataset.toggle));
  host.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openTaskModal(b.dataset.edit));
  host.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteTask(b.dataset.del));
}

function renderToday() {
  const d = state.todoDate;
  const dt = new Date(d + 'T00:00:00');
  if ($('todayDateLabel')) $('todayDateLabel').textContent = dt.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) + (d === todayStr() ? ' Â· Today' : '');
  if ($('mTodayDate')) $('mTodayDate').textContent = d === todayStr() ? 'Today' : dt.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
  const list = myTodos().filter(t => t.date === d).sort((a,b) => { const ta = a.dueTime || '99:99', tb = b.dueTime || '99:99'; return ta.localeCompare(tb); });
  const host = $('todoList');
  if (host) {
    if (!list.length) host.innerHTML = `<div class="text-center py-14 text-slate-500"><i class="fa-regular fa-circle-check text-4xl block mb-3 opacity-35"></i>No to-dos.</div>`;
    else {
      host.innerHTML = list.map(t => `<div class="flex items-center gap-3 p-3 rounded-xl bg-white/[.03] border border-white/5 hover:border-sky-400/30 transition-colors group">
        <button data-td="${t.id}" class="w-[22px] h-[22px] rounded-md border-2 grid place-items-center shrink-0 transition-all ${t.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600 hover:border-sky-400'}">${t.done ? '<i class="fa-solid fa-check text-[10px] text-white"></i>' : ''}</button>
        <div class="flex-1 min-w-0">
          <span class="block text-[13.5px] ${t.done ? 'line-through text-slate-500' : 'text-slate-200'}">${esc(t.text)}</span>
          <div class="flex items-center gap-2 mt-1 flex-wrap">
            ${t.dueTime ? `<span class="text-[10.5px] text-slate-500"><i class="fa-regular fa-clock mr-1"></i>${t.dueTime}</span>` : ''}
            <span class="badge b-${t.priority || 'medium'}">${esc(t.priority || 'medium')}</span>
            ${countdownPill({ date: t.date, dueTime: t.dueTime }, t.done)}
          </div>
        </div>
        ${t.recurring ? '<span class="text-[10px] text-violet-400"><i class="fa-solid fa-repeat"></i></span>' : ''}
        ${photoButton('todo', t.id, !!t.completionPhoto)}
        <button data-tddel="${t.id}" class="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 grid place-items-center"><i class="fa-solid fa-trash text-[10px]"></i></button>
      </div>`).join('');
      host.querySelectorAll('[data-td]').forEach(b => b.onclick = () => toggleTodo(b.dataset.td));
      host.querySelectorAll('[data-tddel]').forEach(b => b.onclick = () => deleteTodo(b.dataset.tddel));
    }
  }
  const done = list.filter(t => t.done).length;
  const pct = list.length ? Math.round((done/list.length)*100) : 0;
  if ($('todoRing')) { $('todoRing').textContent = pct + '%'; $('todoRing').className = 'font-display text-[34px] font-bold ' + (pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-sky-400' : 'text-amber-400'); }
  if ($('todoProgress')) { $('todoProgress').style.width = pct + '%'; $('todoProgress').className = 'progress-fill ' + (pct >= 70 ? 'fill-emerald' : pct >= 40 ? 'fill-cyan' : 'fill-amber'); }
  if ($('todoSummary')) $('todoSummary').textContent = `${done} of ${list.length} completed`;
  if ($('mTodoPct')) { $('mTodoPct').textContent = pct + '%'; $('mTodoPct').style.color = pct >= 70 ? '#34d399' : pct >= 40 ? '#38bdf8' : '#fbbf24'; }
  if ($('mTodoProgress')) { $('mTodoProgress').style.width = pct + '%'; $('mTodoProgress').className = 'progress-fill ' + (pct >= 70 ? 'fill-emerald' : pct >= 40 ? 'fill-cyan' : 'fill-amber'); }
  if ($('mTodoSummary')) $('mTodoSummary').textContent = `${done} of ${list.length} completed`;
  const strip = $('habitStrip');
  if (strip) {
    let html = ''; let hits = 0;
    for (let i = 6; i >= 0; i--) {
      const dd = new Date(); dd.setDate(dd.getDate()-i); const ds = dateStr(dd);
      const day = myTodos().filter(t => t.date === ds); const dd2 = day.filter(t => t.done).length;
      const r = day.length ? dd2/day.length : 0;
      if (day.length && r >= .6) hits++;
      const c = !day.length ? 'bg-slate-700/50' : r >= 1 ? 'bg-emerald-400' : r >= .6 ? 'bg-sky-400' : r > 0 ? 'bg-amber-400' : 'bg-slate-600';
      html += `<div class="flex-1 text-center"><div class="h-9 rounded-lg ${c}" title="${ds}: ${dd2}/${day.length}"></div>
        <div class="text-[9.5px] text-slate-500 mt-1.5 font-semibold uppercase">${dd.toLocaleDateString('en-GB',{weekday:'narrow'})}</div></div>`;
    }
    strip.innerHTML = html;
    $('streakText').textContent = hits ? `${hits} strong day${hits>1?'s':''} this week` : 'No completed to-dos yet';
  }
}

function renderSchedule() {
  const host = $('scheduleList'); if (!host) return;
  const events = mySchedule().sort((a,b) => (a.start||'').localeCompare(b.start||''));
  const now = new Date().toISOString().slice(0,16);
  const up = events.filter(e => e.start >= now); const past = events.filter(e => e.start < now).reverse();
  if (!events.length) { host.innerHTML = `<div class="text-center py-16 text-slate-500 glass rounded-2xl"><i class="fa-regular fa-calendar text-4xl block mb-3 opacity-35"></i>Nothing scheduled.</div>`; return; }
  const card = (e, faded) => {
    const s = new Date(e.start);
    const cm = { Meeting:'#38bdf8', 'Focus Block':'#a855f7', Personal:'#34d399', Reminder:'#fbbf24', Deadline:'#fb7185', Other:'#94a3b8' };
    const c = cm[e.type] || '#94a3b8';
    return `<div class="rounded-2xl glass card-3d p-4 flex items-center gap-4 ${faded?'opacity-45':''}">
      <div class="w-14 text-center shrink-0"><div class="font-display text-[19px] font-bold text-white leading-none">${pad(s.getDate())}</div>
        <div class="text-[9.5px] uppercase tracking-wider text-slate-500 mt-0.5">${s.toLocaleDateString('en-GB',{month:'short'})}</div></div>
      <div class="w-1 self-stretch rounded-full" style="background:${c}"></div>
      <div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><h4 class="font-semibold text-[14px] text-slate-100 truncate">${esc(e.title)}</h4><span class="badge" style="background:${c}22;color:${c};border-color:${c}55">${esc(e.type)}</span></div>
        <div class="flex items-center gap-3 mt-1.5 text-[11.5px] text-slate-500 flex-wrap"><span><i class="fa-regular fa-clock mr-1"></i>${s.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'})} Â· ${s.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}${e.end ? ' â€“ ' + new Date(e.end).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : ''}</span>${e.location ? `<span><i class="fa-solid fa-location-dot mr-1"></i>${esc(e.location)}</span>` : ''}</div>
        ${e.notes ? `<p class="text-[12px] text-slate-500 mt-1.5">${esc(e.notes)}</p>` : ''}</div>
      <div class="flex gap-1.5 shrink-0">
        <button data-eedit="${e.id}" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-sky-500/20 text-slate-400 hover:text-sky-300 grid place-items-center"><i class="fa-solid fa-pen text-[11px]"></i></button>
        <button data-edel="${e.id}" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 grid place-items-center"><i class="fa-solid fa-trash text-[11px]"></i></button>
      </div></div>`;
  };
  host.innerHTML = (up.length ? `<h3 class="font-display text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-3">Upcoming (${up.length})</h3><div class="space-y-3 mb-6">${up.map(e => card(e,false)).join('')}</div>` : '')
    + (past.length ? `<h3 class="font-display text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-3">Past (${past.length})</h3><div class="space-y-3">${past.slice(0,10).map(e => card(e,true)).join('')}</div>` : '');
  host.querySelectorAll('[data-eedit]').forEach(b => b.onclick = () => openEventModal(b.dataset.eedit));
  host.querySelectorAll('[data-edel]').forEach(b => b.onclick = () => deleteEvent(b.dataset.edel));
}
function fileIcon(name, mime) {
  const e = (name.split('.').pop()||'').toLowerCase();
  if ((mime||'').startsWith('image/')) return { icon:'fa-file-image', color:'#38bdf8' };
  if (e === 'pdf') return { icon:'fa-file-pdf', color:'#fb7185' };
  if (['doc','docx'].includes(e)) return { icon:'fa-file-word', color:'#60a5fa' };
  if (['xls','xlsx','csv'].includes(e)) return { icon:'fa-file-excel', color:'#34d399' };
  if (['zip','rar','7z'].includes(e)) return { icon:'fa-file-zipper', color:'#fbbf24' };
  if (['txt','md'].includes(e)) return { icon:'fa-file-lines', color:'#94a3b8' };
  return { icon:'fa-file', color:'#94a3b8' };
}
function renderVault() {
  const host = $('vaultGrid'); if (!host) return;
  const docs = myDocs().sort((a,b) => (b.uploadedAt||'').localeCompare(a.uploadedAt||''));
  if (!docs.length) { host.innerHTML = `<div class="col-span-full text-center py-14 text-slate-500"><i class="fa-solid fa-folder-open text-4xl block mb-3 opacity-35"></i>Vault is empty.</div>`; return; }
  host.innerHTML = docs.map(d => {
    const fi = fileIcon(d.name, d.mime);
    const isImg = (d.mime||'').startsWith('image/') && d.data;
    return `<div class="rounded-2xl glass card-3d overflow-hidden group">
      <div class="h-28 bg-slate-950/50 grid place-items-center relative overflow-hidden cursor-pointer" data-preview="${d.id}">
        ${isImg ? `<img src="${d.data}" class="w-full h-full object-cover"/>` : `<i class="fa-solid ${fi.icon} text-[34px]" style="color:${fi.color}"></i>`}
        <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 grid place-items-center transition-opacity"><i class="fa-solid fa-eye text-white text-lg"></i></div>
        ${d.sourceLabel ? `<span class="absolute top-2 left-2 badge b-cyan" style="font-size:8px;">${esc(d.sourceLabel.slice(0,20))}</span>` : ''}
      </div>
      <div class="p-3.5"><p class="text-[12.5px] font-semibold text-slate-200 truncate">${esc(d.name)}</p>
        <p class="text-[10.5px] text-slate-500 mt-1">${fmtBytes(d.size)} Â· ${timeAgo(d.uploadedAt)}</p>
        <div class="flex gap-1.5 mt-3">
          <button data-preview="${d.id}" class="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-sky-500/20 text-slate-400 hover:text-sky-300 text-[11px]"><i class="fa-solid fa-eye"></i></button>
          <button data-ddel="${d.id}" class="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 text-[11px]"><i class="fa-solid fa-trash"></i></button>
        </div></div></div>`;
  }).join('');
  host.querySelectorAll('[data-preview]').forEach(b => b.onclick = () => previewDoc(b.dataset.preview));
  host.querySelectorAll('[data-ddel]').forEach(b => b.onclick = () => deleteDoc(b.dataset.ddel));
}
function renderFinancials() {
  const exps = allExpenses(), savs = allSavings(), subs = allSubs();
  const totalExp = exps.reduce((s,e) => s + Number(e.amount||0), 0);
  const totalSaved = savs.reduce((s,g) => s + Number(g.current||0), 0);
  const totalTarget = savs.reduce((s,g) => s + Number(g.target||0), 0);
  const monthlySubs = subs.reduce((s,x) => { const a = Number(x.amount||0); if (x.cycle === 'yearly') return s + a/12; if (x.cycle === 'weekly') return s + a*4.33; return s + a; }, 0);
  const fh = $('finStats');
  if (fh) fh.innerHTML = `
    <div class="rounded-2xl p-4 glass card-3d"><div class="w-9 h-9 rounded-xl grid place-items-center mb-2.5" style="background:#fbbf2422;color:#fbbf24"><i class="fa-solid fa-receipt text-[14px]"></i></div>
      <div class="font-display text-[20px] font-bold text-white leading-none">${fmtMoney(totalExp)}</div><div class="text-[10px] uppercase tracking-wider text-slate-500 mt-1.5 font-semibold">Expenses</div></div>
    <div class="rounded-2xl p-4 glass card-3d"><div class="w-9 h-9 rounded-xl grid place-items-center mb-2.5" style="background:#34d39922;color:#34d399"><i class="fa-solid fa-piggy-bank text-[14px]"></i></div>
      <div class="font-display text-[20px] font-bold text-white leading-none">${fmtMoney(totalSaved)}</div><div class="text-[10px] uppercase tracking-wider text-slate-500 mt-1.5 font-semibold">/ ${fmtMoney(totalTarget)}</div></div>
    <div class="rounded-2xl p-4 glass card-3d"><div class="w-9 h-9 rounded-xl grid place-items-center mb-2.5" style="background:#a855f722;color:#a855f7"><i class="fa-solid fa-repeat text-[14px]"></i></div>
      <div class="font-display text-[20px] font-bold text-white leading-none">${fmtMoney(monthlySubs)}</div><div class="text-[10px] uppercase tracking-wider text-slate-500 mt-1.5 font-semibold">Monthly Subs</div></div>
    <div class="rounded-2xl p-4 glass card-3d"><div class="w-9 h-9 rounded-xl grid place-items-center mb-2.5" style="background:#38bdf822;color:#38bdf8"><i class="fa-solid fa-hand-holding-dollar text-[14px]"></i></div>
      <div class="font-display text-[20px] font-bold text-white leading-none">${fmtMoney(totalExp/2)}</div><div class="text-[10px] uppercase tracking-wider text-slate-500 mt-1.5 font-semibold">50/50 Share</div></div>`;
  const ehost = $('expensesList');
  if (ehost) {
    if (!exps.length) ehost.innerHTML = `<div class="text-center py-14 text-slate-500 glass rounded-2xl"><i class="fa-solid fa-receipt text-3xl block mb-3 opacity-35"></i>No expenses.</div>`;
    else ehost.innerHTML = exps.slice().sort((a,b) => (b.date||'').localeCompare(a.date||'')).map(e => {
      const pb = state.profiles[e.paidBy]?.name || 'Unknown'; const isMe = e.paidBy === state.user.uid;
      return `<div class="rounded-2xl glass card-3d p-4 flex items-center gap-4">
        <div class="w-11 h-11 rounded-xl grid place-items-center text-[16px] shrink-0" style="background:#fbbf2422;color:#fbbf24"><i class="fa-solid fa-receipt"></i></div>
        <div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><h4 class="font-semibold text-[14px] text-slate-100 truncate">${esc(e.title)}</h4>
          <span class="badge b-low">${esc(e.category)}</span><span class="badge ${isMe?'b-done':'b-purple'}">${esc(pb)}</span></div>
          <div class="text-[11.5px] text-slate-500 mt-1">Split ${esc(e.splitRatio)} Â· ${fmtDate(e.date)}</div></div>
        <div class="text-right shrink-0"><div class="font-display text-[16px] font-bold text-white">${fmtMoney(e.amount)}</div>
          <button data-expdel="${e.id}" class="mt-1 text-[11px] text-rose-400"><i class="fa-solid fa-trash"></i></button></div></div>`;
    }).join('');
    ehost.querySelectorAll('[data-expdel]').forEach(b => b.onclick = () => deleteExpense(b.dataset.expdel));
  }
  const shost = $('savingsList');
  if (shost) {
    if (!savs.length) shost.innerHTML = `<div class="col-span-full text-center py-14 text-slate-500 glass rounded-2xl"><i class="fa-solid fa-piggy-bank text-3xl block mb-3 opacity-35"></i>No savings goals.</div>`;
    else shost.innerHTML = savs.map(s => {
      const pct = s.target ? Math.min(100, Math.round((s.current/s.target)*100)) : 0;
      const cls = pct >= 100 ? 'fill-emerald' : pct >= 50 ? 'fill-cyan' : 'fill-amber';
      const dl = s.deadline ? daysUntil(s.deadline) : null;
      return `<div class="rounded-2xl glass card-3d p-5">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex-1 min-w-0"><h4 class="font-semibold text-[14.5px] text-slate-100 truncate">${esc(s.title)}</h4>
            <p class="text-[11px] text-slate-500 mt-0.5">${s.deadline ? `${fmtDate(s.deadline)}${dl !== null ? ' Â· ' + (dl<0 ? Math.abs(dl)+'d over' : dl+'d left') : ''}` : 'No deadline'}</p></div>
          <button data-savdel="${s.id}" class="w-7 h-7 rounded-lg text-slate-500 hover:text-rose-400 grid place-items-center shrink-0"><i class="fa-solid fa-trash text-[10px]"></i></button></div>
        <div class="progress-shell mb-2"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
        <div class="flex justify-between items-end text-[12px] mb-3"><span class="text-slate-400">${fmtMoney(s.current)} / ${fmtMoney(s.target)}</span><span class="font-display font-bold text-slate-200">${pct}%</span></div>
        <button data-savadd="${s.id}" class="w-full py-2 rounded-lg glass text-[12px] font-semibold text-slate-300"><i class="fa-solid fa-plus mr-1.5"></i> Add</button></div>`;
    }).join('');
    shost.querySelectorAll('[data-savdel]').forEach(b => b.onclick = () => deleteSavings(b.dataset.savdel));
    shost.querySelectorAll('[data-savadd]').forEach(b => b.onclick = () => addSavingsContribution(b.dataset.savadd));
  }
  const uhost = $('subscriptionsList');
  if (uhost) {
    if (!subs.length) uhost.innerHTML = `<div class="text-center py-14 text-slate-500 glass rounded-2xl"><i class="fa-solid fa-repeat text-3xl block mb-3 opacity-35"></i>No subscriptions.</div>`;
    else uhost.innerHTML = subs.slice().sort((a,b) => (a.nextDate||'').localeCompare(b.nextDate||'')).map(s => {
      const dl = s.nextDate ? daysUntil(s.nextDate) : null;
      const urgent = dl !== null && dl <= 3 && dl >= 0; const late = dl !== null && dl < 0;
      return `<div class="rounded-2xl glass card-3d p-4 flex items-center gap-4">
        <div class="w-11 h-11 rounded-xl grid place-items-center text-[16px] shrink-0" style="background:#a855f722;color:#a855f7"><i class="fa-solid fa-repeat"></i></div>
        <div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><h4 class="font-semibold text-[14px] text-slate-100 truncate">${esc(s.name)}</h4>
          <span class="badge b-low">${esc(s.cycle)}</span>${late ? '<span class="badge b-late">Overdue</span>' : urgent ? '<span class="badge b-medium">Soon</span>' : ''}</div>
          <div class="text-[11.5px] text-slate-500 mt-1">Next: ${fmtDate(s.nextDate)} Â· ${esc(state.profiles[s.paidBy]?.name || 'â€”')}</div></div>
        <div class="text-right shrink-0"><div class="font-display text-[16px] font-bold text-white">${fmtMoney(s.amount)}</div>
          <button data-subdel="${s.id}" class="mt-1 text-[11px] text-rose-400"><i class="fa-solid fa-trash"></i></button></div></div>`;
    }).join('');
    uhost.querySelectorAll('[data-subdel]').forEach(b => b.onclick = () => deleteSub(b.dataset.subdel));
  }
}
function renderGoals() {
  const host = $('goalsGrid'); if (!host) return;
  const goals = allGoals().sort((a,b) => { const pa = {high:0,medium:1,low:2}[a.priority] ?? 1; const pb = {high:0,medium:1,low:2}[b.priority] ?? 1; if (pa !== pb) return pa - pb; return (a.targetDate||'').localeCompare(b.targetDate||''); });
  if (!goals.length) { host.innerHTML = `<div class="col-span-full text-center py-14 text-slate-500 glass rounded-2xl"><i class="fa-solid fa-bullseye text-3xl block mb-3 opacity-35"></i>No goals yet.</div>`; return; }
  host.innerHTML = goals.map(g => {
    const pct = getGoalProgress(g);
    const cls = pct >= 70 ? 'fill-emerald' : pct >= 40 ? 'fill-cyan' : 'fill-amber';
    const dl = g.targetDate ? daysUntil(g.targetDate) : null;
    const tc = g.type === 'long_term' ? '#a855f7' : '#fb923c';
    const ms = g.milestones || [];
    const msHtml = ms.length ? `<div class="mt-3 space-y-1.5">${ms.map((m, i) => `<div class="flex items-center gap-2 p-2 rounded-lg bg-white/[.03]">
      <button data-goalm="${g.id}" data-mi="${i}" class="w-4 h-4 rounded border-2 grid place-items-center shrink-0 ${m.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}">${m.done ? '<i class="fa-solid fa-check text-[8px] text-white"></i>' : ''}</button>
      <span class="text-[12px] ${m.done ? 'line-through text-slate-500' : 'text-slate-300'}">${esc(m.text)}</span></div>`).join('')}</div>` : '';
    return `<div class="rounded-2xl glass card-3d p-5">
      <div class="flex items-start gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl grid place-items-center shrink-0" style="background:${tc}22;color:${tc}"><i class="fa-solid fa-bullseye"></i></div>
        <div class="flex-1 min-w-0"><h4 class="font-display font-bold text-[15px] text-white truncate">${esc(g.title)}</h4>
          <div class="flex items-center gap-2 flex-wrap mt-1">
            <span class="badge" style="background:${tc}22;color:${tc};border-color:${tc}55">${g.type === 'long_term' ? 'Long-term' : 'Short-term'}</span>
            <span class="badge b-${g.priority || 'medium'}">${esc(g.priority || 'medium')}</span>
            ${g.targetDate ? `<span class="text-[11px] text-slate-500">${fmtDate(g.targetDate)}${g.targetTime ? ' Â· ' + g.targetTime : ''}</span>` : ''}
          </div>
          <div class="mt-2 flex items-center gap-2 flex-wrap">${countdownPill({ targetDate: g.targetDate, targetTime: g.targetTime }, !!g.completedAt)}
            ${g.aiScore ? `<span class="badge b-ai"><i class="fa-solid fa-brain mr-1"></i>AI ${g.aiScore}</span>` : ''}</div>
        </div>
        <div class="flex flex-col gap-1.5 shrink-0">${photoButton('goal', g.id, !!g.completionPhoto)}
          <button data-goaldel="${g.id}" class="w-7 h-7 rounded-lg text-slate-500 hover:text-rose-400 grid place-items-center"><i class="fa-solid fa-trash text-[10px]"></i></button></div>
      </div>
      ${g.description ? `<p class="text-[12px] text-slate-500 mb-3">${esc(g.description)}</p>` : ''}
      <div class="progress-shell mb-2"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
      <div class="flex justify-between items-end text-[12px]"><span class="text-slate-400">${pct}% complete</span><span class="font-display font-bold text-slate-200">${pct}%</span></div>
      ${msHtml}</div>`;
  }).join('');
  host.querySelectorAll('[data-goaldel]').forEach(b => b.onclick = () => deleteGoal(b.dataset.goaldel));
  host.querySelectorAll('[data-goalm]').forEach(b => b.onclick = () => toggleMilestone(b.dataset.goalm, parseInt(b.dataset.mi)));
}
function renderSkills() {
  const host = $('skillsGrid'); if (!host) return;
  const skills = allSkills().sort((a,b) => (b.hours||0) - (a.hours||0));
  if (!skills.length) { host.innerHTML = `<div class="col-span-full text-center py-14 text-slate-500 glass rounded-2xl"><i class="fa-solid fa-code-branch text-3xl block mb-3 opacity-35"></i>No skills tracked.</div>`; return; }
  host.innerHTML = skills.map(s => {
    const pct = s.target ? Math.min(100, Math.round((s.hours/s.target)*100)) : 0;
    const cls = pct >= 75 ? 'fill-emerald' : pct >= 40 ? 'fill-cyan' : 'fill-violet';
    const cc = { Coding:'#38bdf8', Design:'#f472b6', Fitness:'#34d399', Language:'#fbbf24', Music:'#a855f7', Business:'#fb923c', Other:'#94a3b8' }[s.category] || '#94a3b8';
    return `<div class="rounded-2xl glass card-3d p-5">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><h4 class="font-display font-bold text-[15px] text-white truncate">${esc(s.name)}</h4>
          <span class="badge" style="background:${cc}22;color:${cc};border-color:${cc}55">Lv ${s.level}</span></div>
          <p class="text-[11.5px] text-slate-500 mt-1">${esc(s.category)}</p></div>
        <button data-skilldel="${s.id}" class="w-7 h-7 rounded-lg text-slate-500 hover:text-rose-400 grid place-items-center shrink-0"><i class="fa-solid fa-trash text-[10px]"></i></button></div>
      <div class="progress-shell mb-2"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
      <div class="flex justify-between items-end text-[12px] mb-3"><span class="text-slate-400">${s.hours}h / ${s.target}h</span><span class="font-display font-bold text-slate-200">${pct}%</span></div>
      <div class="flex gap-1.5">
        <button data-skillh="${s.id}" data-delta="0.5" class="flex-1 py-1.5 rounded-lg glass text-[11px] font-semibold text-slate-300">+0.5h</button>
        <button data-skillh="${s.id}" data-delta="1" class="flex-1 py-1.5 rounded-lg glass text-[11px] font-semibold text-slate-300">+1h</button>
        <button data-skillh="${s.id}" data-delta="2" class="flex-1 py-1.5 rounded-lg glass text-[11px] font-semibold text-slate-300">+2h</button></div></div>`;
  }).join('');
  host.querySelectorAll('[data-skilldel]').forEach(b => b.onclick = () => deleteSkill(b.dataset.skilldel));
  host.querySelectorAll('[data-skillh]').forEach(b => b.onclick = () => logSkillHours(b.dataset.skillh, parseFloat(b.dataset.delta)));
}
function renderHandoffs() {
  const all = allHandoffs();
  const inbox = all.filter(h => h.toUid === state.user.uid).sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
  const outbox = all.filter(h => h.fromUid === state.user.uid).sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
  if ($('handInCount')) $('handInCount').textContent = inbox.length;
  if ($('handOutCount')) $('handOutCount').textContent = outbox.length;
  const card = (h, side) => {
    const fromP = state.profiles[h.fromUid], toP = state.profiles[h.toUid];
    const pend = h.status === 'pending', dn = h.status === 'done';
    return `<div class="rounded-2xl glass card-3d p-4">
      <div class="flex items-start justify-between gap-3 mb-2">
        <div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><h4 class="font-semibold text-[14px] text-slate-100">${esc(h.title)}</h4><span class="badge ${dn?'b-done':pend?'b-medium':'b-open'}">${h.status}</span></div>
          <p class="text-[11.5px] text-slate-500 mt-1"><i class="fa-solid fa-user mr-1"></i>${esc(fromP?.name||'?')} â†’ ${esc(toP?.name||'?')} Â· ${timeAgo(h.createdAt)}</p>
          ${h.notes ? `<p class="text-[12px] text-slate-400 mt-2">${esc(h.notes)}</p>` : ''}
          ${h.feedback ? `<div class="mt-2 p-2 rounded-lg bg-white/[.03] border-l-2 border-emerald-400 text-[12px] text-slate-300"><strong class="text-emerald-400">Feedback:</strong> ${esc(h.feedback)}</div>` : ''}</div></div>
      <div class="flex gap-1.5 mt-2">
        ${side === 'in' && pend ? `<button data-handdone="${h.id}" class="flex-1 py-1.5 rounded-lg text-[11.5px] font-semibold text-white" style="background:linear-gradient(135deg,#34d399,#059669)">Mark Done</button>
          <button data-handfb="${h.id}" class="flex-1 py-1.5 rounded-lg glass text-[11.5px] font-semibold text-slate-300">Feedback</button>` : ''}
        ${side === 'out' && pend ? `<button data-handcancel="${h.id}" class="flex-1 py-1.5 rounded-lg glass text-[11.5px] font-semibold text-rose-300">Cancel</button>` : ''}
        ${dn ? `<span class="text-[11px] text-emerald-400"><i class="fa-solid fa-circle-check mr-1"></i>Completed</span>` : ''}
        <button data-handdel="${h.id}" class="px-3 py-1.5 rounded-lg text-[11px] text-slate-500 hover:text-rose-400 ml-auto"><i class="fa-solid fa-trash"></i></button></div></div>`;
  };
  const ihost = $('subpanel-hand-inbox'), ohost = $('subpanel-hand-outbox');
  if (ihost) {
    ihost.innerHTML = inbox.length ? inbox.map(h => card(h, 'in')).join('') : `<div class="text-center py-14 text-slate-500 glass rounded-2xl"><i class="fa-solid fa-inbox text-3xl block mb-3 opacity-35"></i>No tasks assigned to you.</div>`;
    ihost.querySelectorAll('[data-handdone]').forEach(b => b.onclick = () => completeHandoff(b.dataset.handdone));
    ihost.querySelectorAll('[data-handfb]').forEach(b => b.onclick = () => addHandoffFeedback(b.dataset.handfb));
    ihost.querySelectorAll('[data-handdel]').forEach(b => b.onclick = () => deleteHandoff(b.dataset.handdel));
  }
  if (ohost) {
    ohost.innerHTML = outbox.length ? outbox.map(h => card(h, 'out')).join('') : `<div class="text-center py-14 text-slate-500 glass rounded-2xl"><i class="fa-solid fa-paper-plane text-3xl block mb-3 opacity-35"></i>No handoffs sent.</div>`;
    ohost.querySelectorAll('[data-handcancel]').forEach(b => b.onclick = () => deleteHandoff(b.dataset.handcancel));
    ohost.querySelectorAll('[data-handdel]').forEach(b => b.onclick = () => deleteHandoff(b.dataset.handdel));
  }
}
function renderProfileStats() {
  const m = metricsFor(state.user.uid);
  if ($('pStatTasks')) $('pStatTasks').textContent = m.total;
  if ($('pStatDone')) $('pStatDone').textContent = m.done;
  if ($('pStatDocs')) $('pStatDocs').textContent = m.docCount;
}
function renderActivities() {
  const today = todayStr();
  const mine = state.activities[state.user.uid];
  const isToday = mine && mine.date === today;
  const items = isToday ? (mine.items || []) : [];
  const theme = isToday ? mine.theme : null;
  const themeEl = $('dailyTheme');
  if (themeEl) { if (theme) { themeEl.classList.remove('hidden'); $('dailyThemeText').textContent = theme; } else themeEl.classList.add('hidden'); }
  const host = $('activitiesList'); if (!host) return;
  if (!items.length) { host.innerHTML = `<div class="text-center py-16 text-slate-500 glass rounded-2xl"><i class="fa-solid fa-wand-magic-sparkles text-4xl block mb-3 opacity-35"></i>Click <strong class="text-slate-300">Generate Plan</strong>.</div>`; return; }
  const cc = { work:'#38bdf8', health:'#34d399', creative:'#a855f7', social:'#fbbf24', learning:'#22d3ee', chore:'#94a3b8', fun:'#f472b6', intimacy:'#fb7185' };
  host.innerHTML = items.map(a => {
    const c = cc[a.category] || '#94a3b8';
    const hh = String(a.hour).padStart(2,'0');
    const key = `${today}-${hh}`;
    const comp = (state.activities[state.user.uid]?.completions || {})[key] || {};
    const isDone = !!comp.done;
    return `<div class="rounded-2xl glass card-3d p-4 flex items-center gap-4">
      <div class="w-14 text-center shrink-0"><div class="font-display text-[19px] font-bold text-white leading-none">${hh}</div>
        <div class="text-[9.5px] uppercase tracking-wider text-slate-500 mt-0.5">:${pad(a.minute || 0)}</div></div>
      <div class="w-1 self-stretch rounded-full" style="background:${c}"></div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap"><h4 class="font-semibold text-[14px] text-slate-100">${esc(a.title)}</h4>
          <span class="badge" style="background:${c}22;color:${c};border-color:${c}55">${esc(a.category)}</span>
          <span class="badge ${a.energy==='high'?'b-high':a.energy==='low'?'b-low':'b-medium'}">${esc(a.energy)}</span>
          ${isDone ? '<span class="badge b-done">Done</span>' : ''}</div>
        <p class="text-[12px] text-slate-400 mt-1">${esc(a.description)}</p></div>
      <div class="flex flex-col gap-1.5 shrink-0">
        <button data-actdone="${a.hour}" class="w-9 h-9 rounded-full ${isDone ? 'bg-emerald-500 text-white' : 'bg-white/5 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300'} grid place-items-center shrink-0"><i class="fa-solid fa-check"></i></button>
        ${photoButton('activity', key, !!comp.photo)}
      </div></div>`;
  }).join('');
  host.querySelectorAll('[data-actdone]').forEach(b => b.onclick = async () => {
    const hour = parseInt(b.dataset.actdone);
    const a = items.find(x => x.hour === hour); if (!a) return;
    const key = `${todayStr()}-${String(hour).padStart(2,'0')}`;
    const comp = (state.activities[state.user.uid]?.completions || {})[key] || {};
    const willBeDone = !comp.done;
    await safeUpdate(`activities/${state.user.uid}`, { [`completions/${key}/done`]: willBeDone, [`completions/${key}/completedAt`]: willBeDone ? new Date().toISOString() : null });
    await logHistory(willBeDone ? 'complete' : 'uncomplete', 'activity', key, a.title, { category: a.category });
    if (willBeDone) openHourlyModal(key, { text: a.title, intensity: a.energy === 'high' ? 3 : a.energy === 'low' ? 1 : 2, category: a.category });
  });
}
function renderHourly() {
  const which = document.querySelector('[data-subgroup="hr"] .subtab.active')?.dataset.subtab || 'hr-me';
  const targetUid = which === 'hr-me' ? state.user.uid : (partnerUid() || state.user.uid);
  const rows = hourlyOf(targetUid);
  const now = new Date(); const dow = (now.getDay() + 6) % 7;
  const ws = new Date(now); ws.setDate(now.getDate() - dow);
  const days = []; for (let i=0;i<7;i++) { const d = new Date(ws); d.setDate(ws.getDate()+i); days.push(d); }
  const wrap = $('hourlyGridWrap'); if (!wrap) return;
  let html = '<table class="w-full text-[10px]" style="min-width:640px"><thead><tr><th class="text-left text-slate-500 font-semibold pb-2 pr-2">Hour</th>';
  days.forEach(d => { html += `<th class="text-center text-slate-500 font-semibold pb-2 px-1">${d.toLocaleDateString('en-GB',{weekday:'short'})}<br><span class="text-[9px] text-slate-600">${pad(d.getDate())}</span></th>`; });
  html += '</tr></thead><tbody>';
  for (let h = 0; h < 24; h++) { html += `<tr><td class="pr-2 text-slate-500 font-semibold whitespace-nowrap">${pad(h)}:00</td>`;
    days.forEach(d => { const key = `${dateStr(d)}-${pad(h)}`; const entry = rows.find(r => r.key === key);
      const lvl = entry ? (entry.intensity || 2) : 0; const cls = entry ? `has lvl-${lvl}` : '';
      const title = entry ? `${entry.text} Â· ${entry.category}` : 'Click to log';
      html += `<td class="px-1 py-0.5"><div class="hour-cell ${cls}" data-hour="${key}" title="${esc(title)}">${entry ? '<i class="fa-solid fa-check"></i>' : ''}</div></td>`; });
    html += '</tr>'; }
  html += '</tbody></table>';
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-hour]').forEach(c => c.onclick = () => openHourlyModal(c.dataset.hour));
  const today = todayStr();
  const tEntries = rows.filter(r => r.key && r.key.startsWith(today)).sort((a,b) => a.key.localeCompare(b.key));
  const tl = $('todayHourlyList');
  if (tl) { if (!tEntries.length) tl.innerHTML = `<div class="text-center py-8 text-slate-500 text-[12.5px]"><i class="fa-regular fa-clock block text-2xl mb-2 opacity-40"></i>Nothing logged today.</div>`;
    else { tl.innerHTML = tEntries.map(e => `<div class="flex items-center gap-3 p-3 rounded-xl bg-white/[.03] border border-white/5">
      <span class="font-display text-[13px] font-bold text-sky-400 whitespace-nowrap">${e.key.slice(-2)}:00</span>
      <span class="flex-1 text-[13px] text-slate-200 truncate">${esc(e.text)}</span>
      <span class="badge b-low">${esc(e.category)}</span>
      <button data-hdel="${e.id}" class="w-7 h-7 rounded-lg text-slate-500 hover:text-rose-400 grid place-items-center"><i class="fa-solid fa-trash text-[10px]"></i></button></div>`).join('');
    tl.querySelectorAll('[data-hdel]').forEach(b => b.onclick = () => deleteHourly(b.dataset.hdel)); } }
}
const HIST_STATE = { entity: 'all', action: 'all', search: '' };
function renderHistory() {
  const host = $('histList'); if (!host) return;
  const all = Object.values(state.history || {}).filter(h => h.uid === state.user.uid).sort((a, b) => b.ts - a.ts);
  if ($('navHistoryCount')) $('navHistoryCount').textContent = all.length > 99 ? '99+' : all.length;
  let items = all;
  if (HIST_STATE.entity !== 'all') items = items.filter(h => h.entity === HIST_STATE.entity);
  if (HIST_STATE.action !== 'all') items = items.filter(h => h.action === HIST_STATE.action);
  if (HIST_STATE.search) items = items.filter(h => (h.title || '').toLowerCase().includes(HIST_STATE.search) || (h.entity || '').toLowerCase().includes(HIST_STATE.search) || (h.action || '').toLowerCase().includes(HIST_STATE.search));
  if (!items.length) { host.innerHTML = `<div class="text-center py-16 text-slate-500 glass rounded-2xl"><i class="fa-solid fa-clock-rotate-left text-4xl block mb-3 opacity-35"></i>${all.length ? 'No matches.' : 'No history yet.'}</div>`; return; }
  const groups = {}; const now = new Date(); const todayKey = dateStr(now); const yKey = dateStr(new Date(now.getTime() - 86400000)); const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
  items.forEach(h => { const d = new Date(h.ts); const key = dateStr(d); let label;
    if (key === todayKey) label = 'Today'; else if (key === yKey) label = 'Yesterday';
    else if (d >= weekStart) label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    else label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    if (!groups[label]) groups[label] = []; groups[label].push(h); });
  const ACTION_LABEL = { create: 'created', complete: 'completed', uncomplete: 'reopened', update: 'updated', delete: 'deleted', log: 'logged', presence: 'presence', photo: 'photo', upload: 'uploaded' };
  host.innerHTML = Object.entries(groups).map(([label, arr]) => `
    <div class="hist-day"><div class="hist-day-label">${label} Â· ${arr.length}</div>
      ${arr.map(h => { const color = HIST_COLORS[h.entity] || '#38bdf8'; const icon = HIST_ICONS[h.entity] || 'fa-circle-dot'; const verb = ACTION_LABEL[h.action] || h.action;
        const time = new Date(h.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return `<div class="hist-item" style="--h-color:${color}"><div class="hist-icon"><i class="fa-solid ${icon}"></i></div>
          <div class="hist-body"><div class="hist-title">${esc(h.title || '(untitled)')}</div>
            <div class="hist-meta"><span class="chip" style="background:${color}22;color:${color}">${h.entity}</span><span>${verb}</span>${h.details?.priority ? `<span>Â· ${h.details.priority}</span>` : ''}${h.details?.dueDate ? `<span>Â· due ${h.details.dueDate}</span>` : ''}</div></div>
          <div class="hist-time">${time}</div></div>`; }).join('')}</div>`).join('');
}
function initHistoryFilters() {
  const entities = [
    { id:'all', label:'All', icon:'fa-layer-group' }, { id:'task', label:'Tasks', icon:'fa-list-check' },
    { id:'todo', label:'To-Dos', icon:'fa-circle-check' }, { id:'goal', label:'Goals', icon:'fa-bullseye' },
    { id:'activity', label:'Activities', icon:'fa-wand-magic-sparkles' }, { id:'hourly', label:'Hourly', icon:'fa-clock' },
    { id:'skill', label:'Skills', icon:'fa-code-branch' }, { id:'expense', label:'Expenses', icon:'fa-receipt' },
    { id:'document', label:'Docs', icon:'fa-file' }, { id:'presence', label:'Presence', icon:'fa-wifi' }
  ];
  const actions = [
    { id:'all', label:'All' }, { id:'create', label:'Created' }, { id:'complete', label:'Completed' },
    { id:'update', label:'Updated' }, { id:'log', label:'Logged' }, { id:'delete', label:'Deleted' }
  ];
  const eh = $('histEntityChips'); if (eh) {
    eh.innerHTML = entities.map(e => `<button class="chip-filter ${e.id === HIST_STATE.entity ? 'active' : ''}" data-hist-entity="${e.id}"><i class="fa-solid ${e.icon}"></i> ${e.label}</button>`).join('');
    eh.querySelectorAll('[data-hist-entity]').forEach(b => b.onclick = () => { HIST_STATE.entity = b.dataset.histEntity; eh.querySelectorAll('.chip-filter').forEach(x => x.classList.toggle('active', x.dataset.histEntity === HIST_STATE.entity)); renderHistory(); });
  }
  const ah = $('histActionChips'); if (ah) {
    ah.innerHTML = actions.map(a => `<button class="chip-filter ${a.id === HIST_STATE.action ? 'active' : ''}" data-hist-action="${a.id}">${a.label}</button>`).join('');
    ah.querySelectorAll('[data-hist-action]').forEach(b => b.onclick = () => { HIST_STATE.action = b.dataset.histAction; ah.querySelectorAll('.chip-filter').forEach(x => x.classList.toggle('active', x.dataset.histAction === HIST_STATE.action)); renderHistory(); });
  }
  const hs = $('histSearch'); if (hs) hs.oninput = e => { HIST_STATE.search = e.target.value.toLowerCase().trim(); renderHistory(); };
  if ($('histExportBtn')) $('histExportBtn').onclick = exportHistory;
  if ($('histClearBtn')) $('histClearBtn').onclick = clearHistory;
  if ($('syncBannerBtn')) $('syncBannerBtn').onclick = () => { updateSyncBanner('syncing'); flushQueue(); };
}
function exportHistory() {
  const items = Object.values(state.history || {}).filter(h => h.uid === state.user.uid).sort((a, b) => b.ts - a.ts);
  if (!items.length) return toast('No history to export.', 'info');
  const rows = [['Timestamp', 'Entity', 'Action', 'Title', 'Priority', 'Category', 'DueDate']];
  items.forEach(h => rows.push([new Date(h.ts).toISOString(), h.entity, h.action, h.title, h.details?.priority || '', h.details?.category || '', h.details?.dueDate || '']));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `viora_track_history_${todayStr()}.csv`; a.click();
  URL.revokeObjectURL(a.href); toast(`Exported ${items.length} entries.`, 'success');
}
async function clearHistory() {
  if (!confirm('Delete your entire history?')) return;
  const items = Object.values(state.history || {}).filter(h => h.uid === state.user.uid);
  for (const h of items) await safeRemove(`history/${h.id}`);
  state.history = Object.fromEntries(Object.entries(state.history || {}).filter(([k, v]) => v.uid !== state.user.uid));
  toast('History cleared.', 'info'); renderHistory();
}

function renderChat() {
  const scroll = $('chatScroll'); if (!scroll) return;
  if (!state.chatHistory.length) scroll.innerHTML = `<div class="chat-bubble them">ðŸ‘‹ Hi ${esc(state.profile?.name || 'there')}! I'm Viora AI. Ask me anything about your day, goals, or plans.</div>`;
  else scroll.innerHTML = state.chatHistory.map(m => `<div class="flex ${m.role==='user'?'justify-end':'justify-start'}"><div class="chat-bubble ${m.role==='user'?'me':'them'}">${esc(m.content)}</div></div>`).join('');
  scroll.scrollTop = scroll.scrollHeight;
  const qp = [
    { t:'â˜€ï¸ Plan my day', p:'Plan my day with a balance of work and rest.' }, { t:'ðŸŽ¯ Goal check', p:'Review my goals and suggest next steps.' },
    { t:'ðŸŽ² Date idea', p:'Suggest a fun date idea we could do this weekend.' }, { t:'ðŸ“š Learning plan', p:'Make me a weekly learning plan.' },
    { t:'ðŸ˜Œ Reduce stress', p:'I feel stressed. Give me 3 quick things.' }, { t:'ðŸ’ª Habit nudge', p:'Nudge me on my habits.' }
  ];
  const qh = $('chatQuick'); if (qh) {
    qh.innerHTML = qp.map(q => `<button class="px-2.5 py-1.5 rounded-full glass text-[11px] font-medium text-slate-300 hover:text-white" data-qp="${esc(q.p)}">${q.t}</button>`).join('');
    qh.querySelectorAll('[data-qp]').forEach(b => b.onclick = () => { $('chatInput').value = b.dataset.qp; $('chatForm').dispatchEvent(new Event('submit')); });
  }
}
if ($('chatForm')) $('chatForm').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('chatInput'); const text = input.value.trim();
  if (!text) return; input.value = '';
  state.chatHistory.push({ role:'user', content: text }); renderChat();
  const tid = 'thinking-' + Date.now(); const sc = $('chatScroll');
  sc.insertAdjacentHTML('beforeend', `<div id="${tid}" class="flex justify-start"><div class="chat-bubble them"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i>Thinkingâ€¦</div></div>`);
  sc.scrollTop = sc.scrollHeight;
  try {
    const m = metricsFor(state.user.uid); const pu = partnerUid();
    const ctx = { myName: state.profile?.name, partnerName: pu ? state.profiles[pu]?.name : null, openTasks: m.open, completedToday: m.todayDone, goals: allGoals().map(g => g.title).slice(0,5), events: m.upcoming.slice(0,3).map(e => e.title) };
    const res = await ai('/ai/chat', { messages: state.chatHistory.slice(-10).map(x => ({ role: x.role, content: x.content })), context: ctx });
    document.getElementById(tid)?.remove();
    state.chatHistory.push({ role:'assistant', content: res.reply || '(no reply)' });
    state.settings.chatHistory = state.chatHistory.slice(-30); persistSettings(); renderChat();
  } catch(e) { document.getElementById(tid)?.remove(); state.chatHistory.push({ role:'assistant', content: `âš ï¸ ${e.message}` }); renderChat(); }
});
async function loadAiInsight() {
  const card = $('aiInsightCard'); if (!card) return; card.classList.remove('hidden');
  $('aiInsightText').textContent = 'Analyzingâ€¦';
  try {
    const m = metricsFor(state.user.uid);
    const res = await ai('/ai/chat', { messages:[{ role:'user', content:`Give me ONE punchy 2-sentence insight about my productivity today. Overdue: ${m.overdue}, Completion: ${m.completion}%, Streak: ${m.streak}.` }], context:{ myName: state.profile?.name, openTasks: m.open, completedToday: m.todayDone } });
    $('aiInsightText').textContent = res.reply || 'â€”';
  } catch(e) { $('aiInsightText').textContent = 'Set Worker URL in Settings â†’ AI.'; }
}
function showAutomationResult(html) { const el = $('automationResult'); if (!el) return; el.innerHTML = html; el.classList.remove('hidden'); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
async function runAutoSchedule() {
  toast('Generating day planâ€¦', 'info');
  try {
    const res = await ai('/ai/schedule', { wake: 6, sleep: 22, mustDos: myTasks().filter(t => !t.done && t.dueDate === todayStr()).map(t => t.title), goals: allGoals().map(g => g.title).slice(0,5), mood: $('actMood')?.value || 'neutral' });
    const blocks = res.blocks || []; if (!blocks.length) return toast('Empty response.', 'warning');
    for (const b of blocks) { const id = uid();
      await safeSet(`schedule/${state.user.uid}/${id}`, { id, title: b.title, start: `${todayStr()}T${b.start}`, end: b.end ? `${todayStr()}T${b.end}` : '', type: b.type === 'focus' ? 'Focus Block' : b.type === 'meal' ? 'Personal' : b.type === 'exercise' ? 'Personal' : b.type === 'social' ? 'Personal' : 'Other', location: '', notes: 'AI generated', createdAt: new Date().toISOString() }); }
    await logHistory('create', 'event', 'ai-schedule', `AI scheduled ${blocks.length} blocks`);
    showAutomationResult(`<div class="flex items-center gap-2 mb-3"><i class="fa-solid fa-circle-check text-emerald-400 text-xl"></i><h3 class="font-display font-bold text-[16px] text-white">Day Scheduled</h3></div>
      <p class="text-[13px] text-slate-300 mb-3">${blocks.length} blocks added.</p>`);
    toast('Day scheduled!', 'success'); renderSchedule();
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}
function openBreakdownModal() {
  const pending = myTasks().filter(t => !t.done);
  $('breakdownBody').innerHTML = `<p class="text-[13px] text-slate-400 mb-3">Choose a task to break into steps:</p>
    <select id="bdSelect" class="field mb-4">${pending.length ? pending.map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join('') : '<option value="">No open tasks</option>'}</select>
    <button id="bdRun" class="w-full py-2.5 rounded-xl font-semibold text-white" style="background:linear-gradient(135deg,#22d3ee,#0e7490)"><i class="fa-solid fa-wand-magic-sparkles mr-1.5"></i> Break It Down</button>
    <div id="bdResult" class="mt-4"></div>`;
  showModal('breakdownModal');
  $('bdRun').onclick = async () => {
    const tid = $('bdSelect').value; const t = state.tasks[state.user.uid]?.[tid]; if (!t) return;
    $('bdResult').innerHTML = `<div class="text-center py-4"><i class="fa-solid fa-circle-notch fa-spin text-cyan-400"></i></div>`;
    try {
      const res = await ai('/ai/breakdown', { title: t.title, notes: t.notes || '' });
      const subs = res.subtasks || [];
      $('bdResult').innerHTML = `<div class="space-y-2">${subs.map(s => `<label class="flex items-center gap-3 p-3 rounded-lg bg-white/[.03] border border-white/5 cursor-pointer">
        <input type="checkbox" class="bdSub w-4 h-4 rounded" data-text="${esc(s.text)}" data-priority="${esc(s.suggestedPriority||'medium')}" checked />
        <span class="flex-1 text-[13px] text-slate-200">${esc(s.text)}</span><span class="text-[10.5px] text-slate-500">${s.estimatedMinutes || 'â€”'}m</span></label>`).join('')}</div>
        <button id="bdCreate" class="w-full mt-3 py-2.5 rounded-xl font-semibold text-white" style="background:linear-gradient(135deg,#34d399,#059669)"><i class="fa-solid fa-plus mr-1.5"></i> Create Sub-Tasks</button>`;
      $('bdCreate').onclick = async () => {
        const picked = [...document.querySelectorAll('.bdSub:checked')];
        for (const c of picked) { const id = uid();
          await safeSet(`todos/${state.user.uid}/${id}`, { id, text: c.dataset.text, date: t.dueDate || todayStr(), dueTime: t.dueTime || '', priority: c.dataset.priority || 'medium', done: false, recurring: false, createdAt: new Date().toISOString() }); }
        await logHistory('create', 'todo', 'breakdown', `AI broke down "${t.title}" into ${picked.length} subtasks`);
        toast(`${picked.length} sub-tasks added.`, 'success'); hideModal('breakdownModal');
      };
    } catch(e) { $('bdResult').innerHTML = `<p class="text-rose-400 text-[13px]">${esc(e.message)}</p>`; }
  };
}
async function runMoodBoost() {
  const mood = $('actMood')?.value || 'meh'; toast('Finding boostersâ€¦', 'info');
  try { const res = await ai('/ai/mood-boost', { mood }); const b = res.boosters || [];
    showAutomationResult(`<div class="flex items-center gap-2 mb-3"><i class="fa-solid fa-sun text-amber-400 text-xl"></i><h3 class="font-display font-bold text-[16px] text-white">Mood Boosters</h3></div>
      <div class="space-y-2">${b.map(x => `<div class="flex items-start gap-3 p-3 rounded-lg bg-white/[.03]"><span class="text-2xl">${x.emoji || 'âœ¨'}</span>
        <div class="flex-1"><div class="font-semibold text-[13.5px] text-white">${esc(x.title)}</div><div class="text-[12px] text-slate-400 mt-0.5">${esc(x.why)}</div></div></div>`).join('')}</div>`);
  } catch(e) { toast('Failed.', 'error'); }
}
async function runJournal() {
  toast('Finding promptâ€¦', 'info');
  try { const res = await ai('/ai/journal', { mood: $('actMood')?.value || 'neutral' });
    showAutomationResult(`<div class="flex items-center gap-2 mb-3"><i class="fa-solid fa-feather text-fuchsia-400 text-xl"></i><h3 class="font-display font-bold text-[16px] text-white">Journal Prompt</h3></div>
      <p class="text-[14px] text-slate-200 italic mb-3">"${esc(res.prompt)}"</p><p class="text-[12px] text-slate-500">${esc(res.hint || '')}</p>`);
    const jc = $('journalCard'); if (jc) { jc.classList.remove('hidden'); $('journalPromptText').textContent = res.prompt; $('journalHintText').textContent = res.hint || ''; }
  } catch(e) { toast('Failed.', 'error'); }
}
async function runWeekReview() {
  toast('Reviewing weekâ€¦', 'info'); const m = metricsFor(state.user.uid);
  const catCounts = {}; myTasks().forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
  const top = Object.entries(catCounts).sort((a,b) => b[1] - a[1]).slice(0,3).map(x => x[0]);
  try {
    const res = await ai('/ai/weekly-review', { name: state.profile?.name, doneTasks: m.done, totalTasks: m.total, doneTodos: m.todayDone, totalTodos: m.todayTodos, hoursLogged: m.hourlyToday, streak: m.streak, categories: top, overdue: m.overdue });
    const card = $('weeklyReviewCard');
    card.innerHTML = `<div class="flex items-start gap-3"><div class="w-10 h-10 rounded-xl grid place-items-center bg-gradient-to-br from-purple-400 to-violet-600 text-white shrink-0"><i class="fa-solid fa-book-open"></i></div>
      <div class="flex-1"><div class="text-[10px] font-bold uppercase tracking-wider text-purple-300 mb-1">AI Week in Review</div>
        <h3 class="font-display text-[18px] font-bold text-white mb-3">${esc(res.headline || 'Weekly Summary')}</h3>
        <p class="text-[13px] text-slate-300 italic">${esc(res.motivationalClose || '')}</p></div>
      <button onclick="document.getElementById('weeklyReviewCard').classList.add('hidden')" class="w-8 h-8 rounded-lg glass grid place-items-center text-slate-400"><i class="fa-solid fa-xmark"></i></button></div>`;
    card.classList.remove('hidden'); card.scrollIntoView({ behavior:'smooth', block:'nearest' });
  } catch(e) { toast('Failed.', 'error'); }
}
async function runWeeklyGoals() {
  toast('Suggesting goalsâ€¦', 'info');
  try { const res = await ai('/ai/chat', { messages:[{ role:'user', content:`Suggest 3-5 weekly goals for me based on: hobbies "${state.profile?.hobbies || 'general'}", completion ${metricsFor(state.user.uid).completion}%. Short bullets.` }], context:{ myName: state.profile?.name } });
    showAutomationResult(`<div class="flex items-center gap-2 mb-3"><i class="fa-solid fa-bullseye text-cyan-400 text-xl"></i><h3 class="font-display font-bold text-[16px] text-white">Suggested Goals</h3></div>
      <div class="text-[13px] text-slate-300 whitespace-pre-wrap">${esc(res.reply)}</div>`);
  } catch(e) { toast('Failed.', 'error'); }
}
async function runPriorityAdvisor(scope = 'all') {
  toast('AI analyzingâ€¦', 'info'); const items = [];
  if (scope === 'tasks' || scope === 'all') {
    myTasks().filter(t => !t.done).forEach(t => items.push({ id: t.id, type: 'task', title: t.title, category: t.category, dueDate: t.dueDate, dueTime: t.dueTime, currentPriority: t.priority }));
    myTodos().filter(t => !t.done).forEach(t => items.push({ id: t.id, type: 'todo', title: t.text, category: 'todo', dueDate: t.date, dueTime: t.dueTime, currentPriority: t.priority }));
  }
  if (scope === 'goals' || scope === 'all') { allGoals().forEach(g => items.push({ id: g.id, type: 'goal', title: g.title, category: g.type, dueDate: g.targetDate, dueTime: g.targetTime, currentPriority: g.priority })); }
  if (!items.length) return toast('Nothing to prioritize.', 'info');
  try {
    const res = await ai('/ai/prioritize', { items: items.slice(0, 40) });
    const recs = res.priorities || [];
    for (const r of recs) { const it = items.find(x => x.id === r.id); if (!it) continue;
      const patch = { priority: r.priority, aiScore: r.score, aiReason: r.reason, aiAnalyzedAt: new Date().toISOString() };
      if (it.type === 'task') await safeUpdate(`tasks/${state.user.uid}/${it.id}`, patch);
      else if (it.type === 'todo') await safeUpdate(`todos/${state.user.uid}/${it.id}`, patch);
      else if (it.type === 'goal') await safeUpdate(`goals/${it.id}`, patch);
    }
    await logHistory('update', 'task', 'ai-priority', `AI re-prioritized ${recs.length} items`);
    const sorted = [...recs].sort((a, b) => (b.score || 0) - (a.score || 0));
    const html = `<h3 class="font-display font-bold text-[16px] text-white mb-3">AI Priority Analysis</h3>
      <div class="space-y-2 max-h-[400px] overflow-y-auto">${sorted.map(r => { const it = items.find(x => x.id === r.id);
        const c = r.priority === 'high' ? '#fb7185' : r.priority === 'medium' ? '#fbbf24' : '#38bdf8';
        return `<div class="priority-rec" style="--p-color:${c}"><div class="p-score">${r.score}</div>
          <div class="flex-1"><div class="flex items-center gap-2 mb-1 flex-wrap"><span class="p-badge">${r.priority}</span><span class="text-[10px] text-slate-500 uppercase">${it?.type || ''}</span></div>
            <div class="p-title">${esc(it?.title || '')}</div><div class="p-reason">${esc(r.reason || '')}</div></div></div>`; }).join('')}</div>`;
    goTab('automations'); setTimeout(() => showAutomationResult(html), 150);
    toast(`AI re-ranked ${recs.length} items.`, 'success');
  } catch(e) { toast('AI failed: ' + e.message, 'error'); }
}
async function generateActivities() {
  const hobbies = $('actHobbies').value.split(',').map(s => s.trim()).filter(Boolean);
  const mood = $('actMood').value, hours = $('actHours').value || '6-22';
  const goals = allGoals().map(g => g.title).slice(0,5); const pu = partnerUid();
  const btn = $('genActivitiesBtn'); btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Generatingâ€¦';
  $('actAiStatus').innerHTML = '<i class="fa-solid fa-spinner fa-spin text-cyan-400 mr-1.5"></i> Asking AIâ€¦';
  try {
    const res = await ai('/ai/activities', { hobbies, mood, availableHours: hours, goals, partnerName: pu ? state.profiles[pu]?.name : null, date: todayStr() });
    if (!res.activities?.length) throw new Error('Invalid response');
    await safeSet(`activities/${state.user.uid}`, { date: todayStr(), theme: res.dailyTheme || 'Balanced', items: res.activities, generatedAt: new Date().toISOString(), completions: state.activities[state.user.uid]?.completions || {} });
    await logHistory('create', 'activity', 'daily', `Daily plan: ${res.dailyTheme || 'Balanced'}`);
    $('actAiStatus').innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400 mr-1.5"></i> Plan Â· ${res.activities.length} activities`;
    toast('Plan generated!', 'success');
  } catch(e) { $('actAiStatus').innerHTML = `<i class="fa-solid fa-circle-exclamation text-rose-400 mr-1.5"></i>${esc(e.message)}`; }
  finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-1.5"></i> Generate Plan'; }
}

function openTaskModal(id = null) {
  $('taskModalTitle').textContent = id ? 'Edit Task' : 'New Task'; $('taskEditId').value = id || '';
  const gsel = $('taskGoal'); gsel.innerHTML = '<option value="">â€” None â€”</option>' + Object.values(state.goals).map(g => `<option value="${g.id}">${esc(g.title)}</option>`).join('');
  const asel = $('taskAssign'); asel.innerHTML = '<option value="">â€” Myself â€”</option>' + Object.values(state.profiles).filter(p => p.uid !== state.user.uid).map(p => `<option value="${p.uid}">${esc(p.name)}</option>`).join('');
  if (id) { const t = state.tasks[state.user.uid]?.[id]; if (!t) return;
    $('taskTitle').value = t.title || ''; $('taskNotes').value = t.notes || ''; $('taskCategory').value = t.category || 'Personal';
    $('taskPriority').value = t.priority || 'medium'; $('taskDue').value = t.dueDate || ''; $('taskDueTime').value = t.dueTime || '';
    gsel.value = t.linkedGoalId || ''; asel.value = t.assignedTo || '';
  } else { $('taskForm').reset(); $('taskPriority').value = 'medium'; $('taskDue').value = todayStr(); $('taskDueTime').value = '17:00'; }
  showModal('taskModal');
}
$('taskForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('taskEditId').value || uid();
  const existing = state.tasks[state.user.uid]?.[id] || {};
  const assignedTo = $('taskAssign').value || '';
  const payload = { id, title: $('taskTitle').value.trim(), notes: $('taskNotes').value.trim(), category: $('taskCategory').value, priority: $('taskPriority').value, dueDate: $('taskDue').value || '', dueTime: $('taskDueTime').value || '', linkedGoalId: $('taskGoal').value || '', assignedTo, ownerUid: state.user.uid, done: existing.done || false, completedAt: existing.completedAt || null, completionPhoto: existing.completionPhoto || null, createdAt: existing.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (!payload.title) return toast('Title required.', 'error');
  state.tasks[state.user.uid] = state.tasks[state.user.uid] || {};
  state.tasks[state.user.uid][id] = payload;
  renderTasks();
  await safeSet(`tasks/${state.user.uid}/${id}`, payload);
  await logHistory(existing.createdAt ? 'update' : 'create', 'task', id, payload.title, { priority: payload.priority, category: payload.category, dueDate: payload.dueDate, dueTime: payload.dueTime });
  if (assignedTo && assignedTo !== state.user.uid) {
    const hid = uid();
    await safeSet(`handoffs/${hid}`, { id: hid, taskId: id, title: payload.title, notes: payload.notes, fromUid: state.user.uid, toUid: assignedTo, status: 'pending', feedback: '', createdAt: new Date().toISOString() });
    toast('Task + handoff saved.', 'success');
  } else toast(existing.createdAt ? 'Updated.' : 'Created.', 'success');
  hideModal('taskModal');
});
async function toggleTask(id) {
  const t = state.tasks[state.user.uid]?.[id]; if (!t) return;
  const d = !t.done;
  t.done = d; t.completedAt = d ? new Date().toISOString() : null;
  renderTasks();
  await safeUpdate(`tasks/${state.user.uid}/${id}`, { done: d, completedAt: t.completedAt, updatedAt: new Date().toISOString() });
  await logHistory(d ? 'complete' : 'uncomplete', 'task', id, t.title, { priority: t.priority, category: t.category });
}
async function deleteTask(id) {
  const t = state.tasks[state.user.uid]?.[id];
  if (!t || !confirm(`Delete "${t.title}"?`)) return;
  if (state.tasks[state.user.uid]) delete state.tasks[state.user.uid][id];
  renderTasks();
  await safeRemove(`tasks/${state.user.uid}/${id}`);
  await logHistory('delete', 'task', id, t.title);
}
async function addTodoOptimistic(text, dueTime, priority, recurring) {
  if (!text || !text.trim()) { toast('Write something first.', 'warning'); return; }
  const id = uid();
  const payload = { id, text: text.trim(), date: state.todoDate, dueTime: dueTime || '', priority: priority || 'medium', done: false, recurring: !!recurring, completionPhoto: null, createdAt: new Date().toISOString() };
  state.todos[state.user.uid] = state.todos[state.user.uid] || {};
  state.todos[state.user.uid][id] = payload;
  renderToday();
  if (isMobile()) renderMobileTodos();
  await safeSet(`todos/${state.user.uid}/${id}`, payload);
  await logHistory('create', 'todo', id, payload.text, { priority: payload.priority, dueDate: payload.date, dueTime: payload.dueTime });
  toast('To-do added.', 'success');
}
if ($('todoForm')) $('todoForm').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('todoInput').value.trim();
  if (!text) { toast('Write something first.', 'warning'); return; }
  const dueTime = $('todoDueTime').value || '';
  const priority = $('todoPriority').value || 'medium';
  const recurring = $('todoRecurring').checked;
  $('todoInput').value = ''; $('todoDueTime').value = ''; $('todoPriority').value = 'medium'; $('todoRecurring').checked = false;
  await addTodoOptimistic(text, dueTime, priority, recurring);
});
async function toggleTodo(id) {
  const t = state.todos[state.user.uid]?.[id]; if (!t) return;
  const d = !t.done; t.done = d; t.completedAt = d ? new Date().toISOString() : null;
  renderToday(); if (isMobile()) renderMobileTodos();
  await safeUpdate(`todos/${state.user.uid}/${id}`, { done: d, completedAt: t.completedAt });
  await logHistory(d ? 'complete' : 'uncomplete', 'todo', id, t.text, { priority: t.priority });
}
async function deleteTodo(id) {
  const t = state.todos[state.user.uid]?.[id]; if (!t) return;
  if (state.todos[state.user.uid]) delete state.todos[state.user.uid][id];
  renderToday(); if (isMobile()) renderMobileTodos();
  await safeRemove(`todos/${state.user.uid}/${id}`);
  await logHistory('delete', 'todo', id, t.text);
}
if ($('prevDayBtn')) $('prevDayBtn').onclick = () => { const d = new Date(state.todoDate + 'T00:00:00'); d.setDate(d.getDate()-1); state.todoDate = dateStr(d); renderToday(); if (isMobile()) renderMobileTodos(); };
if ($('nextDayBtn')) $('nextDayBtn').onclick = () => { const d = new Date(state.todoDate + 'T00:00:00'); d.setDate(d.getDate()+1); state.todoDate = dateStr(d); renderToday(); if (isMobile()) renderMobileTodos(); };
if ($('todayJumpBtn')) $('todayJumpBtn').onclick = () => { state.todoDate = todayStr(); renderToday(); if (isMobile()) renderMobileTodos(); };

function openEventModal(id = null) {
  $('eventEditId').value = id || '';
  if (id) { const e = state.schedule[state.user.uid]?.[id]; if (!e) return;
    $('eventTitle').value = e.title || ''; $('eventStart').value = e.start || ''; $('eventEnd').value = e.end || '';
    $('eventType').value = e.type || 'Meeting'; $('eventLocation').value = e.location || ''; $('eventNotes').value = e.notes || '';
  } else { $('eventForm').reset(); const now = new Date(); now.setMinutes(0,0,0); const end = new Date(now.getTime()+3600000);
    const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    $('eventStart').value = iso(now); $('eventEnd').value = iso(end); }
  showModal('eventModal');
}
$('eventForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('eventEditId').value || uid();
  const existing = state.schedule[state.user.uid]?.[id] || {};
  const p = { id, title: $('eventTitle').value.trim(), start: $('eventStart').value, end: $('eventEnd').value || '', type: $('eventType').value, location: $('eventLocation').value.trim(), notes: $('eventNotes').value.trim(), completionPhoto: existing.completionPhoto || null, createdAt: existing.createdAt || new Date().toISOString() };
  if (!p.title || !p.start) return toast('Title+start required.', 'error');
  await safeSet(`schedule/${state.user.uid}/${id}`, p);
  await logHistory(existing.createdAt ? 'update' : 'create', 'event', id, p.title);
  hideModal('eventModal');
});
async function deleteEvent(id) { const e = state.schedule[state.user.uid]?.[id]; if (!e || !confirm('Delete?')) return; await safeRemove(`schedule/${state.user.uid}/${id}`); await logHistory('delete', 'event', id, e.title); }
function populatePayerSelect(sel) { sel.innerHTML = Object.values(state.profiles).map(p => `<option value="${p.uid}" ${p.uid === state.user.uid ? 'selected' : ''}>${esc(p.name)}</option>`).join(''); }
$('expSplit').onchange = () => $('splitCustomRow').classList.toggle('hidden', $('expSplit').value !== 'custom');
$('addExpenseBtn').onclick = () => { $('expenseForm').reset(); populatePayerSelect($('expPaidBy')); $('expDate').value = todayStr(); $('splitCustomRow').classList.add('hidden'); showModal('expenseModal'); };
$('expenseForm').addEventListener('submit', async e => {
  e.preventDefault(); const id = uid(); const sr = $('expSplit').value;
  let sA = 0, sB = 0;
  if (sr === 'custom') { sA = parseFloat($('expSplitA').value) || 0; sB = parseFloat($('expSplitB').value) || 0; }
  else { const h = (parseFloat($('expAmount').value) || 0)/2; sA = h; sB = h; }
  const p = { id, title: $('expTitle').value.trim(), amount: parseFloat($('expAmount').value) || 0, category: $('expCategory').value, paidBy: $('expPaidBy').value, splitRatio: sr, splitA: sA, splitB: sB, date: $('expDate').value || todayStr(), createdAt: new Date().toISOString() };
  if (!p.title || !p.amount) return toast('Title+amount required.', 'error');
  await safeSet(`financials/expenses/${id}`, p); await logHistory('create', 'expense', id, `${p.title} â€” ${fmtMoney(p.amount)}`); hideModal('expenseModal');
});
async function deleteExpense(id) { if (!confirm('Delete?')) return; await safeRemove(`financials/expenses/${id}`); }
$('addSavingsBtn').onclick = () => { $('savingsForm').reset(); $('savCurrent').value = 0; showModal('savingsModal'); };
$('savingsForm').addEventListener('submit', async e => {
  e.preventDefault(); const id = uid();
  const p = { id, title: $('savTitle').value.trim(), target: parseFloat($('savTarget').value) || 0, current: parseFloat($('savCurrent').value) || 0, deadline: $('savDeadline').value || '', createdAt: new Date().toISOString() };
  if (!p.title || !p.target) return toast('Title+target required.', 'error');
  await safeSet(`financials/savings/${id}`, p); await logHistory('create', 'savings', id, p.title); hideModal('savingsModal');
});
async function deleteSavings(id) { if (!confirm('Delete?')) return; await safeRemove(`financials/savings/${id}`); }
async function addSavingsContribution(id) { const s = state.financials.savings[id]; if (!s) return;
  const i = prompt(`Add to "${s.title}":`, '100'); if (!i) return;
  const a = parseFloat(i); if (isNaN(a)) return toast('Invalid.', 'error');
  await safeUpdate(`financials/savings/${id}`, { current: Math.max(0, Number(s.current||0) + a) });
  await logHistory('update', 'savings', id, `${s.title} +${fmtMoney(a)}`); }
$('addSubscriptionBtn').onclick = () => { $('subForm').reset(); populatePayerSelect($('subPaidBy')); const n = new Date(); n.setMonth(n.getMonth()+1); $('subNextDate').value = dateStr(n); showModal('subModal'); };
$('subForm').addEventListener('submit', async e => {
  e.preventDefault(); const id = uid();
  const p = { id, name: $('subName').value.trim(), amount: parseFloat($('subAmount').value) || 0, cycle: $('subCycle').value, nextDate: $('subNextDate').value || '', paidBy: $('subPaidBy').value, createdAt: new Date().toISOString() };
  if (!p.name || !p.amount) return toast('Name+amount required.', 'error');
  await safeSet(`financials/subscriptions/${id}`, p); await logHistory('create', 'subscription', id, `${p.name} â€” ${fmtMoney(p.amount)}`); hideModal('subModal');
});
async function deleteSub(id) { if (!confirm('Delete?')) return; await safeRemove(`financials/subscriptions/${id}`); }
let milestoneDraft = [];
function renderMilestoneEditor() {
  const h = $('milestoneEditor'); if (!h) return;
  h.innerHTML = milestoneDraft.map((m, i) => `<div class="flex gap-2"><input type="text" class="field flex-1" value="${esc(m.text)}" data-midx="${i}" placeholder="Milestone ${i+1}" />
    <button type="button" class="w-10 rounded-lg bg-rose-500/15 text-rose-300" data-mdel="${i}"><i class="fa-solid fa-xmark"></i></button></div>`).join('');
  h.querySelectorAll('[data-midx]').forEach(inp => inp.oninput = e => { milestoneDraft[+e.target.dataset.midx].text = e.target.value; });
  h.querySelectorAll('[data-mdel]').forEach(b => b.onclick = () => { milestoneDraft.splice(+b.dataset.mdel, 1); renderMilestoneEditor(); });
}
$('addMilestoneBtn').onclick = () => { milestoneDraft.push({ text: '', done: false }); renderMilestoneEditor(); };
$('addGoalBtn').onclick = () => { $('goalEditId').value = ''; $('goalForm').reset(); $('goalPriority').value = 'medium'; $('goalTargetTime').value = '23:59'; milestoneDraft = []; renderMilestoneEditor(); showModal('goalModal'); };
$('goalForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('goalEditId').value || uid(); const existing = state.goals[id] || {};
  const ms = milestoneDraft.filter(m => m.text.trim()).map(m => ({ text: m.text.trim(), done: !!m.done }));
  const p = { id, title: $('goalTitle').value.trim(), type: $('goalType').value, priority: $('goalPriority').value || 'medium', targetDate: $('goalTarget').value || '', targetTime: $('goalTargetTime').value || '', description: $('goalDesc').value.trim(), milestones: ms, completionPhoto: existing.completionPhoto || null, assignedTo: Object.keys(state.profiles), createdAt: existing.createdAt || new Date().toISOString() };
  if (!p.title) return toast('Title required.', 'error');
  await safeSet(`goals/${id}`, p); await logHistory(existing.createdAt ? 'update' : 'create', 'goal', id, p.title, { priority: p.priority, type: p.type }); hideModal('goalModal');
});
async function deleteGoal(id) { const g = state.goals[id]; if (!g || !confirm(`Delete "${g.title}"?`)) return; await safeRemove(`goals/${id}`); await logHistory('delete', 'goal', id, g.title); }
async function toggleMilestone(gid, idx) {
  const g = state.goals[gid]; if (!g?.milestones) return;
  const ms = [...g.milestones]; ms[idx].done = !ms[idx].done;
  await safeUpdate(`goals/${gid}`, { milestones: ms }); await logHistory(ms[idx].done ? 'complete' : 'uncomplete', 'goal', gid, `${g.title} â€” ${ms[idx].text}`);
}
$('addSkillBtn').onclick = () => { $('skillForm').reset(); $('skillHours').value = 0; $('skillLevel').value = 1; $('skillTarget').value = 100; showModal('skillModal'); };
$('skillForm').addEventListener('submit', async e => {
  e.preventDefault(); const id = uid();
  const p = { id, name: $('skillName').value.trim(), hours: parseFloat($('skillHours').value) || 0, level: parseInt($('skillLevel').value) || 1, target: parseFloat($('skillTarget').value) || 100, category: $('skillCategory').value, createdAt: new Date().toISOString() };
  if (!p.name) return toast('Name required.', 'error');
  await safeSet(`skills/${id}`, p); await logHistory('create', 'skill', id, p.name); hideModal('skillModal');
});
async function deleteSkill(id) { const s = state.skills[id]; if (!s || !confirm(`Delete "${s.name}"?`)) return; await safeRemove(`skills/${id}`); }
async function logSkillHours(id, d) { const s = state.skills[id]; if (!s) return;
  const h = Number(s.hours||0) + d; const l = Math.floor(h/20) + 1;
  await safeUpdate(`skills/${id}`, { hours: h, level: l }); await logHistory('log', 'skill', id, `${s.name} +${d}h`); toast(`+${d}h`, 'success'); }
async function completeHandoff(id) {
  const h = state.handoffs[id]; if (!h) return;
  await safeUpdate(`handoffs/${id}`, { status: 'done', completedAt: new Date().toISOString() });
  if (h.taskId && state.tasks[h.fromUid]?.[h.taskId]) await safeUpdate(`tasks/${h.fromUid}/${h.taskId}`, { done: true, completedAt: new Date().toISOString() });
  await logHistory('complete', 'handoff', id, h.title);
}
async function addHandoffFeedback(id) { const f = prompt('Feedback:'); if (!f) return; await safeUpdate(`handoffs/${id}`, { feedback: f }); }
async function deleteHandoff(id) { if (!confirm('Delete?')) return; await safeRemove(`handoffs/${id}`); }
function openHourlyModal(key, prefill = null) {
  const existing = Object.values(state.hourly[state.user.uid] || {}).find(x => x.key === key);
  $('hourlyKey').value = key;
  $('hourlyHourLabel').textContent = `Â· ${fmtDate(key.slice(0,10))} @ ${key.slice(-2)}:00`;
  if (existing) { $('hourlyText').value = existing.text || ''; $('hourlyIntensity').value = existing.intensity || 2; $('hourlyCategory').value = existing.category || 'Work'; }
  else { $('hourlyText').value = prefill?.text || ''; $('hourlyIntensity').value = prefill?.intensity || 2; $('hourlyCategory').value = prefill?.category || 'Work'; }
  showModal('hourlyModal');
}
$('hourlyForm').addEventListener('submit', async e => {
  e.preventDefault(); const key = $('hourlyKey').value; const text = $('hourlyText').value.trim(); if (!text) return;
  const existing = Object.values(state.hourly[state.user.uid] || {}).find(x => x.key === key);
  const id = existing?.id || uid();
  const payload = { id, key, date: key.slice(0,10), hour: parseInt(key.slice(-2)), text, intensity: parseInt($('hourlyIntensity').value), category: $('hourlyCategory').value, createdAt: existing?.createdAt || new Date().toISOString() };
  await safeSet(`hourly/${state.user.uid}/${id}`, payload);
  await logHistory('log', 'hourly', id, text, { hour: payload.hour, date: payload.date, category: payload.category });
  toast('Hour logged.', 'success'); hideModal('hourlyModal');
});
async function deleteHourly(id) { if (!confirm('Delete?')) return; await safeRemove(`hourly/${state.user.uid}/${id}`); }

const MAX_FILE = 400 * 1024;
$('avatarUploadBtn').onclick = () => $('avatarInput').click();
$('avatarInput').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  if (!f.type.startsWith('image/')) return toast('Pick an image.', 'error');
  if (f.size > 4*1024*1024) return toast('Max 4 MB.', 'error');
  try {
    const d = await resizeImage(f, 320);
    // SHARED path with index.html â€” updates the same user record
    await safeUpdate(`users/${state.user.uid}`, { avatar: d });
    await mirrorAvatarToVault(d);
    toast('Photo updated.', 'success');
  } catch(e) { toast('Failed.', 'error'); }
  e.target.value = '';
};
$('dropZone').onclick = () => $('fileInput').click();
$('dropZone').ondragover = e => { e.preventDefault(); $('dropZone').classList.add('border-sky-400/70'); };
$('dropZone').ondragleave = () => $('dropZone').classList.remove('border-sky-400/70');
$('dropZone').ondrop = e => { e.preventDefault(); $('dropZone').classList.remove('border-sky-400/70'); handleFiles(e.dataTransfer.files); };
$('fileInput').onchange = e => { handleFiles(e.target.files); e.target.value = ''; };
async function handleFiles(files) {
  for (const f of Array.from(files)) {
    const id = uid();
    const base = { name: f.name, mime: f.type || 'application/octet-stream', size: f.size };
    if (f.size > MAX_FILE) {
      await vaultSave({ ...base, id, data: null, source: 'vault', sourceLabel: 'Manual upload', tags: ['metadata-only'] });
      toast(`${f.name}: metadata only.`, 'warning');
    } else {
      try {
        const d = await readAsDataURL(f);
        await vaultSave({ ...base, id, data: d, source: 'vault', sourceLabel: 'Manual upload' });
        toast(`${f.name} uploaded.`, 'success');
        setTimeout(() => previewDoc(id), 300);
      } catch(e) { toast(`Failed: ${f.name}`, 'error'); }
    }
  }
}
function previewDoc(id) {
  const d = state.documents?.[id]; if (!d) return;
  $('previewTitle').textContent = d.name;
  let b = '';
  if (!d.data) b = `<div class="text-center py-14"><i class="fa-solid fa-file text-5xl text-slate-600"></i><p class="text-slate-500 text-[13px] mt-4">Metadata only.</p></div>`;
  else if ((d.mime||'').startsWith('image/')) b = `<img src="${d.data}" class="max-w-full max-h-[70vh] rounded-xl" />`;
  else if (d.mime === 'application/pdf') b = `<iframe src="${d.data}" class="w-full h-[70vh] rounded-xl border-0"></iframe>`;
  else if ((d.mime||'').startsWith('text/')) { try { b = `<pre class="w-full text-left text-[12px] text-slate-300 whitespace-pre-wrap p-4 rounded-xl bg-slate-950/60">${esc(atob(d.data.split(',')[1] || ''))}</pre>`; } catch { b = `<div class="text-center py-14"><i class="fa-solid fa-file text-5xl text-slate-600"></i><p class="text-slate-500 text-[13px] mt-4">Preview unsupported.</p></div>`; } }
  else b = `<div class="text-center py-14"><i class="fa-solid fa-file text-5xl text-slate-600"></i><p class="text-slate-500 text-[13px] mt-4">Preview unsupported.</p></div>`;
  $('previewBody').innerHTML = b;
  $('previewDownloadBtn').onclick = () => { if (!d.data) return toast('No payload.', 'warning'); const a = document.createElement('a'); a.href = d.data; a.download = d.name; a.click(); };
  showModal('previewModal');
}
async function deleteDoc(id) { const d = state.documents?.[id]; if (!d || !confirm(`Delete "${d.name}"?`)) return; await safeRemove(`documents/${id}`); }
$('saveProfileBtn').onclick = async () => {
  const name = $('profNameInput').value.trim(); if (!name) return toast('Name required.', 'error');
  const accent = $('colorPicker').dataset.selected || state.profile?.accent || '#38bdf8';
  // SHARED path with index.html
  await safeUpdate(`users/${state.user.uid}`, { name, tagline: $('profTaglineInput').value.trim(), hobbies: $('profHobbiesInput').value.trim(), accent, updatedAt: new Date().toISOString() });
  toast('Profile saved.', 'success');
};

function renderGames() { renderGameStats(); renderTTT(); renderC4(); renderMemory(); renderRPS(); renderDice(); renderWordDuel(); renderQ20(); renderTrivia(); renderTD(); renderPrompts(); }
function renderGameStats() {
  const s = state.gameStats; const el = $('gameStats'); if (!el) return;
  el.innerHTML = `
    <div class="p-3 rounded-xl bg-white/[.03] border border-white/5 text-center"><div class="font-display text-xl font-bold text-sky-400">${s.tttW||0}</div><div class="text-[10px] uppercase tracking-wider text-slate-500 mt-1">TTT</div></div>
    <div class="p-3 rounded-xl bg-white/[.03] border border-white/5 text-center"><div class="font-display text-xl font-bold text-red-400">${s.c4W||0}</div><div class="text-[10px] uppercase tracking-wider text-slate-500 mt-1">C4</div></div>
    <div class="p-3 rounded-xl bg-white/[.03] border border-white/5 text-center"><div class="font-display text-xl font-bold text-purple-400">${s.memW||0}</div><div class="text-[10px] uppercase tracking-wider text-slate-500 mt-1">Memory</div></div>
    <div class="p-3 rounded-xl bg-white/[.03] border border-white/5 text-center"><div class="font-display text-xl font-bold text-amber-400">${s.diceW||0}</div><div class="text-[10px] uppercase tracking-wider text-slate-500 mt-1">Dice</div></div>
    <div class="p-3 rounded-xl bg-white/[.03] border border-white/5 text-center"><div class="font-display text-xl font-bold text-cyan-400">${s.wdW||0}</div><div class="text-[10px] uppercase tracking-wider text-slate-500 mt-1">Word</div></div>
    <div class="p-3 rounded-xl bg-white/[.03] border border-white/5 text-center"><div class="font-display text-xl font-bold text-violet-400">${s.rpsW||0}</div><div class="text-[10px] uppercase tracking-wider text-slate-500 mt-1">RPS</div></div>
    <div class="p-3 rounded-xl bg-white/[.03] border border-white/5 text-center"><div class="font-display text-xl font-bold text-emerald-400">${s.triviaCorrect||0}/${s.triviaTotal||0}</div><div class="text-[10px] uppercase tracking-wider text-slate-500 mt-1">Trivia</div></div>
    <div class="p-3 rounded-xl bg-white/[.03] border border-white/5 text-center"><div class="font-display text-xl font-bold text-pink-400">${(s.tttW||0)+(s.c4W||0)+(s.memW||0)+(s.diceW||0)+(s.wdW||0)+(s.rpsW||0)}</div><div class="text-[10px] uppercase tracking-wider text-slate-500 mt-1">Total</div></div>`;
}
function renderTTT() {
  const g = state.games.ttt || {}; const board = g.board || Array(9).fill(null);
  const meSym = g.players?.X === state.user.uid ? 'X' : g.players?.O === state.user.uid ? 'O' : null;
  const themSym = meSym === 'X' ? 'O' : meSym === 'O' ? 'X' : null;
  if ($('tttMeSymbol')) { $('tttMeSymbol').textContent = meSym || 'â€”'; $('tttPartnerSymbol').textContent = themSym || 'â€”'; }
  let s = 'Start a new match.';
  if (g.status === 'waiting') s = 'Waitingâ€¦'; else if (g.status === 'playing') s = g.turn === state.user.uid ? 'Your turn!' : `${profileName(g.turn)}'s turnâ€¦`;
  else if (g.status === 'won') s = g.winner === state.user.uid ? 'ðŸŽ‰ You won!' : `${profileName(g.winner)} won.`;
  else if (g.status === 'draw') s = "Draw!";
  if ($('tttStatus')) $('tttStatus').textContent = s;
  const sm = (state.user.uid === g.players?.X ? g.scoreX : g.scoreO) || 0; const st = (state.user.uid === g.players?.X ? g.scoreO : g.scoreX) || 0;
  if ($('tttScore')) $('tttScore').textContent = `${sm} â€“ ${st}`;
  const host = $('tttBoard'); if (!host) return;
  host.innerHTML = board.map((v, i) => `<div class="ttt-cell ${v ? 'filled ' + v.toLowerCase() : ''}" data-i="${i}">${v || ''}</div>`).join('');
  const wl = g.winLine || [];
  host.querySelectorAll('.ttt-cell').forEach(c => { const i = parseInt(c.dataset.i); if (wl.includes(i)) c.classList.add('win'); c.onclick = () => makeTTTMove(i); });
}
async function newTTTMatch() {
  const pu = partnerUid(); if (!pu) return toast('Set partner.', 'warning');
  const meSym = Math.random() < .5 ? 'X' : 'O'; const themSym = meSym === 'X' ? 'O' : 'X';
  await safeSet(`games/ttt`, { id:'ttt', board: Array(9).fill(null), players: { [meSym]: state.user.uid, [themSym]: pu }, turn: state.user.uid, status:'playing', winner:null, winLine:[], scoreX: state.games.ttt?.scoreX||0, scoreO: state.games.ttt?.scoreO||0, createdBy: state.user.uid, createdAt: new Date().toISOString() });
  toast('Match started!', 'success');
}
async function makeTTTMove(i) {
  const g = state.games.ttt; if (!g || g.status !== 'playing') return;
  if (g.turn !== state.user.uid) return toast("Not your turn.", 'warning');
  if (g.board[i]) return;
  const meSym = g.players.X === state.user.uid ? 'X' : 'O';
  const nb = [...g.board]; nb[i] = meSym;
  const win = checkTTTWin(nb); const draw = !win && nb.every(c => c);
  let p = { board: nb };
  if (win) { p.winner = state.user.uid; p.status = 'won'; p.winLine = win; p['score'+meSym] = (g['score'+meSym]||0)+1; state.gameStats.tttW = (state.gameStats.tttW||0)+1; saveGameStats(); }
  else if (draw) p.status = 'draw';
  else p.turn = Object.values(g.players).find(u => u !== state.user.uid);
  await safeUpdate(`games/ttt`, p);
}
function checkTTTWin(b) { const L = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; for (const l of L) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return l; return null; }
function renderC4() {
  const g = state.games.c4 || {}; const board = g.board || Array(42).fill(null);
  const meColor = g.players?.p1 === state.user.uid ? 'p1' : g.players?.p2 === state.user.uid ? 'p2' : null;
  const themColor = meColor === 'p1' ? 'p2' : meColor === 'p2' ? 'p1' : null;
  if ($('c4MeColor')) { $('c4MeColor').textContent = meColor === 'p1' ? 'Red' : meColor === 'p2' ? 'Yellow' : 'â€”'; $('c4PartnerColor').textContent = themColor === 'p1' ? 'Red' : themColor === 'p2' ? 'Yellow' : 'â€”'; }
  let s = 'Start a new match.';
  if (g.status === 'waiting') s = 'Waitingâ€¦'; else if (g.status === 'playing') s = g.turn === state.user.uid ? 'Your turn!' : `${profileName(g.turn)}'s turnâ€¦`;
  else if (g.status === 'won') s = g.winner === state.user.uid ? 'ðŸŽ‰ You won!' : `${profileName(g.winner)} won.`;
  else if (g.status === 'draw') s = "Draw!";
  if ($('c4Status')) $('c4Status').textContent = s;
  const sm = (g.scores?.[state.user.uid]) || 0; const st = themColor ? (g.scores?.[Object.keys(g.players).find(k => g.players[k] !== state.user.uid)] || 0) : 0;
  if ($('c4Score')) $('c4Score').textContent = `${sm} â€“ ${st}`;
  const host = $('c4Board'); if (!host) return;
  host.innerHTML = board.map((v, i) => `<div class="c4-cell ${v || ''}" data-i="${i}"></div>`).join('');
  host.querySelectorAll('.c4-cell').forEach(c => c.onclick = () => dropC4(parseInt(c.dataset.i)));
}
async function newC4Match() {
  const pu = partnerUid(); if (!pu) return toast('Set partner.', 'warning');
  const meColor = Math.random() < .5 ? 'p1' : 'p2'; const themColor = meColor === 'p1' ? 'p2' : 'p1';
  const scores = state.games.c4?.scores || {};
  await safeSet(`games/c4`, { id:'c4', board: Array(42).fill(null), players: { [meColor]: state.user.uid, [themColor]: pu }, turn: state.user.uid, status:'playing', winner:null, scores, createdBy: state.user.uid, createdAt: new Date().toISOString() });
  toast('Connect Four started!', 'success');
}
async function dropC4(idx) {
  const g = state.games.c4; if (!g || g.status !== 'playing') return;
  if (g.turn !== state.user.uid) return toast("Not your turn.", 'warning');
  const col = idx % 7; let targetRow = -1;
  for (let r = 5; r >= 0; r--) { const i = r * 7 + col; if (!g.board[i]) { targetRow = r; break; } }
  if (targetRow < 0) return toast('Column full.', 'warning');
  const meColor = g.players.p1 === state.user.uid ? 'p1' : 'p2';
  const nb = [...g.board]; nb[targetRow * 7 + col] = meColor;
  const win = checkC4Win(nb, targetRow, col, meColor); const draw = !win && nb.every(c => c);
  let p = { board: nb };
  if (win) { p.winner = state.user.uid; p.status = 'won'; p.scores = { ...(g.scores||{}), [state.user.uid]: (g.scores?.[state.user.uid] || 0) + 1 }; state.gameStats.c4W = (state.gameStats.c4W||0)+1; saveGameStats(); }
  else if (draw) p.status = 'draw';
  else p.turn = Object.values(g.players).find(u => u !== state.user.uid);
  await safeUpdate(`games/c4`, p);
}
function checkC4Win(b, row, col, color) {
  const at = (r, c) => (r >= 0 && r < 6 && c >= 0 && c < 7) ? b[r*7+c] : null;
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) { let count = 1;
    for (const sign of [1,-1]) { let r = row + dr*sign, c = col + dc*sign; while (at(r,c) === color) { count++; r += dr*sign; c += dc*sign; } }
    if (count >= 4) return true; }
  return false;
}
function renderMemory() {
  const g = state.games.memory || {}; const deck = g.deck || []; const revealed = g.revealed || []; const matched = g.matched || [];
  const host = $('memBoard'); if (!host) return;
  let s = 'Start a new game.';
  if (g.status === 'waiting') s = 'Waitingâ€¦'; else if (g.status === 'playing') s = g.turn === state.user.uid ? 'Your turn â€” flip 2 cards' : `${profileName(g.turn)}'s turn`;
  else if (g.status === 'done') s = g.winner === state.user.uid ? 'ðŸŽ‰ You won!' : `${profileName(g.winner)} won.`;
  if ($('memStatus')) $('memStatus').textContent = s;
  if ($('memPairs')) $('memPairs').textContent = `${matched.length / 2} / 8`;
  if ($('memMeScore')) $('memMeScore').textContent = g.scores?.[state.user.uid] || 0;
  const otherUid = Object.keys(g.scores || {}).find(u => u !== state.user.uid);
  if ($('memPartnerScore')) $('memPartnerScore').textContent = otherUid ? (g.scores[otherUid] || 0) : 0;
  if (!deck.length) { host.innerHTML = `<div class="col-span-4 text-center py-10 text-slate-500 text-[13px]">No game running.</div>`; return; }
  host.innerHTML = deck.map((emoji, i) => { const isFlipped = revealed.includes(i) || matched.includes(i); const isMatched = matched.includes(i);
    return `<div class="mem-card ${isFlipped ? 'flipped' : ''} ${isMatched ? 'matched' : ''}" data-i="${i}"><span>${isFlipped ? emoji : ''}</span></div>`; }).join('');
  host.querySelectorAll('.mem-card').forEach(c => c.onclick = () => flipMemory(parseInt(c.dataset.i)));
}
async function newMemoryGame() {
  const pu = partnerUid(); if (!pu) return toast('Set partner.', 'warning');
  const emojis = ['ðŸŽ','ðŸŒ','ðŸ‡','ðŸ“','ðŸ’','ðŸ¥','ðŸ','ðŸ¥¥'];
  const deck = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
  await safeSet(`games/memory`, { id:'memory', deck, revealed: [], matched: [], locked: false, players: { p1: state.user.uid, p2: pu }, turn: state.user.uid, status:'playing', winner:null, scores: { [state.user.uid]: 0, [pu]: 0 }, createdBy: state.user.uid, createdAt: new Date().toISOString() });
  toast('Memory started!', 'success');
}
async function flipMemory(i) {
  const g = state.games.memory; if (!g || g.status !== 'playing' || g.locked) return;
  if (g.turn !== state.user.uid) return toast("Not your turn.", 'warning');
  if (g.revealed.includes(i) || g.matched.includes(i)) return;
  const rev = [...g.revealed, i];
  if (rev.length === 1) { await safeUpdate(`games/memory`, { revealed: rev }); return; }
  if (rev.length === 2) {
    await safeUpdate(`games/memory`, { revealed: rev, locked: true });
    const [a, b] = rev;
    if (g.deck[a] === g.deck[b]) { const matched = [...g.matched, a, b];
      const scores = { ...g.scores, [state.user.uid]: (g.scores[state.user.uid] || 0) + 1 };
      const done = matched.length === g.deck.length;
      if (done) { const winner = Object.entries(scores).sort((a,b) => b[1] - a[1])[0][0]; state.gameStats.memW = (state.gameStats.memW||0)+1; saveGameStats(); await safeUpdate(`games/memory`, { revealed: [], matched, scores, locked: false, status:'done', winner }); }
      else await safeUpdate(`games/memory`, { revealed: [], matched, scores, locked: false, turn: g.turn });
    } else { setTimeout(async () => { await safeUpdate(`games/memory`, { revealed: [], locked: false, turn: Object.values(g.players).find(u => u !== state.user.uid) }); }, 1400); }
  }
}
function renderRPS() {
  const g = state.games.rps || {}; const choices = g.choices || {}; const rounds = g.rounds || {};
  const me = choices[state.user.uid]; const pu = partnerUid(); const them = pu ? choices[pu] : null;
  if ($('rpsMeScore')) $('rpsMeScore').textContent = rounds[state.user.uid] || 0;
  if ($('rpsPartnerScore')) $('rpsPartnerScore').textContent = pu ? (rounds[pu] || 0) : 0;
  if ($('rpsRound')) $('rpsRound').textContent = g.roundNumber || 1;
  let s = 'Pick your throw.';
  if (me && !them) s = 'Waiting for partnerâ€¦'; else if (!me && them) s = 'Your turn.'; else if (me && them) s = 'Revealed!';
  if ($('rpsStatus')) $('rpsStatus').textContent = s;
  document.querySelectorAll('.rps-btn').forEach(b => { b.classList.toggle('selected', b.dataset.throw === me); b.onclick = () => throwRPS(b.dataset.throw); });
  const icons = { rock:'ðŸª¨', paper:'ðŸ“„', scissors:'âœ‚ï¸' };
  if ($('rpsReveal')) {
    if (me && them) { const w = rpsWinner(me, them);
      if (w === 'tie') $('rpsReveal').textContent = `${icons[me]} vs ${icons[them]} â€” Tie!`;
      else if (w === me) $('rpsReveal').textContent = `${icons[me]} vs ${icons[them]} â€” You win! ðŸŽ‰`;
      else $('rpsReveal').textContent = `${icons[me]} vs ${icons[them]} â€” ${profileName(pu)} wins.`;
    } else $('rpsReveal').textContent = '?';
  }
}
async function throwRPS(choice) {
  const pu = partnerUid(); if (!pu) return toast('Set partner.', 'warning');
  const g = state.games.rps || {}; const rn = g.roundNumber || 1;
  const choices = { ...(g.choices || {}), [state.user.uid]: choice };
  await safeSet(`games/rps`, { ...g, id:'rps', roundNumber: rn, choices, status:'open', updatedAt: new Date().toISOString() });
  const other = choices[pu];
  if (other) {
    const w = rpsWinner(choice, other); const rounds = { ...(g.rounds || {}) };
    if (w !== 'tie') rounds[w] = (rounds[w]||0)+1;
    if (w === state.user.uid) { state.gameStats.rpsW = (state.gameStats.rpsW||0)+1; saveGameStats(); }
    await safeUpdate(`games/rps`, { rounds, status:'resolved' });
    setTimeout(async () => { await safeUpdate(`games/rps`, { choices: {}, roundNumber: rn+1, status:'open' }); }, 3000);
  }
}
function rpsWinner(a, b) { if (a === b) return 'tie'; if ((a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper')) return a; return b; }
async function newRPSRound() { await safeSet(`games/rps`, { id:'rps', roundNumber: (state.games.rps?.roundNumber||1)+1, choices:{}, rounds: state.games.rps?.rounds||{}, status:'open', updatedAt: new Date().toISOString() }); }
function renderDice() {
  const g = state.games.dice || {}; const pu = partnerUid();
  const myRoll = g.rolls?.[state.user.uid]; const theirRoll = pu ? g.rolls?.[pu] : null;
  const faces = ['','âš€','âš','âš‚','âšƒ','âš„','âš…'];
  if ($('dieMe1')) $('dieMe1').textContent = myRoll ? faces[myRoll[0]] : '?';
  if ($('dieMe2')) $('dieMe2').textContent = myRoll ? faces[myRoll[1]] : '?';
  if ($('dieThem1')) $('dieThem1').textContent = theirRoll ? faces[theirRoll[0]] : '?';
  if ($('dieThem2')) $('dieThem2').textContent = theirRoll ? faces[theirRoll[1]] : '?';
  if ($('diceMeTotal')) $('diceMeTotal').textContent = myRoll ? myRoll[0] + myRoll[1] : 'â€”';
  if ($('diceThemTotal')) $('diceThemTotal').textContent = theirRoll ? theirRoll[0] + theirRoll[1] : 'â€”';
  const scores = g.scores || {};
  if ($('diceMeScore')) $('diceMeScore').textContent = scores[state.user.uid] || 0;
  if ($('diceThemScore')) $('diceThemScore').textContent = pu ? (scores[pu] || 0) : 0;
  if ($('diceRound')) $('diceRound').textContent = g.roundNumber || 1;
  let v = 'â€”';
  if (myRoll && theirRoll) { const mt = myRoll[0]+myRoll[1], tt = theirRoll[0]+theirRoll[1];
    if (mt > tt) v = 'ðŸŽ‰ You win!'; else if (mt < tt) v = `${profileName(pu)} wins.`; else v = 'Tie!';
  } else if (myRoll) v = 'Waiting for partnerâ€¦'; else if (theirRoll) v = 'Your turn!';
  if ($('diceVerdict')) $('diceVerdict').textContent = v;
}
async function rollDice() {
  const pu = partnerUid(); if (!pu) return toast('Set partner.', 'warning');
  const g = state.games.dice || {};
  if (g.roundNumber && g.rolls?.[state.user.uid] && g.rolls?.[pu]) { await safeSet(`games/dice`, { ...g, roundNumber: (g.roundNumber||1)+1, rolls:{}, updatedAt: new Date().toISOString() }); return; }
  if ($('dieMe1')) { $('dieMe1').classList.add('rolling'); $('dieMe2').classList.add('rolling'); }
  await new Promise(r => setTimeout(r, 800));
  if ($('dieMe1')) { $('dieMe1').classList.remove('rolling'); $('dieMe2').classList.remove('rolling'); }
  const d1 = Math.ceil(Math.random()*6); const d2 = Math.ceil(Math.random()*6);
  const rolls = { ...(g.rolls || {}), [state.user.uid]: [d1, d2] };
  const scores = { ...(g.scores || {}) };
  const patch = { id:'dice', roundNumber: g.roundNumber || 1, rolls, scores, updatedAt: new Date().toISOString() };
  if (rolls[pu]) { const myTotal = d1 + d2; const theirTotal = rolls[pu][0] + rolls[pu][1];
    if (myTotal > theirTotal) { scores[state.user.uid] = (scores[state.user.uid]||0) + 1; state.gameStats.diceW = (state.gameStats.diceW||0)+1; saveGameStats(); }
    else if (theirTotal > myTotal) { scores[pu] = (scores[pu]||0) + 1; }
    patch.scores = scores;
  }
  await safeSet(`games/dice`, patch);
}
function renderWordDuel() {
  const g = state.games.word || {}; const guesses = g.guesses || [];
  const host = $('wdBoard'); if (!host) return;
  const rows = [];
  for (let r = 0; r < 6; r++) { const guess = guesses[r]; const tiles = [];
    for (let c = 0; c < 5; c++) { const ch = guess ? guess.word[c] : ''; let cls = '';
      if (guess && guess.result) cls = guess.result[c] === 'correct' ? 'correct' : guess.result[c] === 'present' ? 'present' : 'absent';
      tiles.push(`<div class="wd-tile ${cls}">${esc(ch || '')}</div>`); }
    rows.push(`<div class="wd-row">${tiles.join('')}</div>`); }
  host.innerHTML = rows.join('');
  let s = 'Guess the 5-letter word.';
  if (g.status === 'won') s = `ðŸŽ‰ Got it in ${guesses.length}!`; else if (g.status === 'lost') s = `Out. Word was ${g.word || '?'}`; else if (!g.word) s = 'Start a new word.';
  if ($('wdStatus')) $('wdStatus').textContent = s;
  if ($('wdVerdict')) $('wdVerdict').textContent = g.status === 'won' ? 'ðŸŽ‰' : g.status === 'lost' ? 'Try again' : '';
  if ($('wdForm')) { if (g.status === 'won' || g.status === 'lost' || !g.word) $('wdForm').style.pointerEvents = 'none'; else $('wdForm').style.pointerEvents = ''; }
}
async function newWordDuel() {
  const pu = partnerUid(); if (!pu) return toast('Set partner.', 'warning');
  toast('Picking wordâ€¦', 'info');
  try { const res = await ai('/ai/word-duel', {});
    const word = (res.word || 'APPLE').toUpperCase().slice(0,5);
    await safeSet(`games/word`, { id:'word', word, guesses: [], status:'playing', createdBy: state.user.uid, createdAt: new Date().toISOString() });
    if ($('wdForm')) $('wdForm').style.pointerEvents = ''; toast('Ready!', 'success');
  } catch(e) { toast('Failed.', 'error'); }
}
if ($('wdForm')) $('wdForm').addEventListener('submit', async e => {
  e.preventDefault();
  const g = state.games.word; if (!g || g.status !== 'playing' || !g.word) return;
  const w = $('wdInput').value.toUpperCase().trim(); if (w.length !== 5) return toast('5 letters.', 'warning');
  $('wdInput').value = '';
  const result = []; const wArr = g.word.split(''); const used = wArr.slice();
  for (let i = 0; i < 5; i++) { if (w[i] === wArr[i]) { result[i] = 'correct'; used[i] = null; } }
  for (let i = 0; i < 5; i++) { if (result[i]) continue; const idx = used.indexOf(w[i]); if (idx > -1) { result[i] = 'present'; used[idx] = null; } else result[i] = 'absent'; }
  const guesses = [...(g.guesses || []), { word: w, result }];
  let status = g.status;
  if (w === g.word) { status = 'won'; state.gameStats.wdW = (state.gameStats.wdW||0)+1; saveGameStats(); }
  else if (guesses.length >= 6) status = 'lost';
  await safeUpdate(`games/word`, { guesses, status });
});
function renderQ20() {
  const g = state.games.twenty || {};
  let s = 'AI thinks of something. Ask yes/no questions.';
  if (g.status === 'playing') s = `Question ${(g.questions||[]).length + 1} of 20`;
  else if (g.status === 'won') s = `ðŸŽ‰ Guessed! It was "${g.secret}".`;
  else if (g.status === 'lost') s = `Out. It was "${g.secret}".`;
  if ($('q20Status')) $('q20Status').textContent = s;
  if ($('q20Hint')) { $('q20Hint').classList.toggle('hidden', !g.hint || !g.secret); if (g.hint && g.secret) $('q20Hint').innerHTML = `<strong class="text-cyan-400">Hint:</strong> ${esc(g.hint)}`; }
  const log = (g.questions || []).map(q => `<div class="flex items-start gap-2 text-[12.5px]"><span class="text-slate-500 shrink-0">Q:</span>
    <span class="flex-1 text-slate-300">${esc(q.q)}</span><span class="font-bold ${q.a === 'yes' ? 'text-emerald-400' : q.a === 'no' ? 'text-rose-400' : 'text-amber-400'}">${esc(q.a).toUpperCase()}</span></div>`).join('');
  if ($('q20Log')) $('q20Log').innerHTML = log || `<div class="text-center py-6 text-slate-500 text-[12px]">No questions yet.</div>`;
  if ($('q20Count')) $('q20Count').textContent = (g.questions || []).length;
}
async function newQ20() {
  toast('AI is thinkingâ€¦', 'info');
  try { const res = await ai('/ai/20questions', { action: 'start' });
    await safeSet(`games/twenty`, { id:'twenty', secret: res.thing, hint: res.hint, questions: [], status:'playing', createdAt: new Date().toISOString() });
    toast('New game!', 'success');
  } catch(e) { toast('Failed.', 'error'); }
}
if ($('q20Form')) $('q20Form').addEventListener('submit', async e => {
  e.preventDefault();
  const g = state.games.twenty; if (!g || g.status !== 'playing') return toast('Start a new game.', 'warning');
  const q = $('q20Input').value.trim(); if (!q) return;
  $('q20Input').value = '';
  try { const res = await ai('/ai/20questions', { secret: g.secret, question: q });
    const questions = [...(g.questions || []), { q, a: res.answer, explanation: res.explanation }];
    let status = g.status;
    if (q.toLowerCase().includes(g.secret.toLowerCase())) status = 'won';
    else if (questions.length >= 20) status = 'lost';
    await safeUpdate(`games/twenty`, { questions, status });
  } catch(e) { toast('Failed.', 'error'); }
});
async function loadTrivia() {
  const topic = $('triviaTopic').value.trim() || 'general knowledge'; const diff = $('triviaDiff').value;
  if ($('triviaCard')) $('triviaCard').innerHTML = `<div class="text-center py-10"><i class="fa-solid fa-circle-notch fa-spin text-2xl text-emerald-400"></i><p class="text-slate-500 text-[12px] mt-3">Generatingâ€¦</p></div>`;
  try { const res = await ai('/ai/trivia', { topic, difficulty: diff }); if (!res.questions?.length) throw new Error('No questions');
    state.games.trivia = { questions: res.questions, index: 0, correct: 0 }; renderTrivia();
  } catch(e) { if ($('triviaCard')) $('triviaCard').innerHTML = `<div class="text-center py-10 text-rose-400"><i class="fa-solid fa-circle-exclamation text-2xl mb-2"></i><p class="text-[12px]">${esc(e.message)}</p></div>`; }
}
function renderTrivia() {
  const g = state.games.trivia; const card = $('triviaCard'); if (!card) return;
  if (!g || !g.questions?.length) { card.innerHTML = `<div class="text-center py-10 text-slate-500"><i class="fa-solid fa-brain text-3xl block mb-3 opacity-35"></i>Pick topic and click Generate.</div>`; if ($('triviaScore')) $('triviaScore').textContent = `${state.gameStats.triviaCorrect || 0} / ${state.gameStats.triviaTotal || 0}`; return; }
  const q = g.questions[g.index];
  if (!q) { card.innerHTML = `<div class="text-center py-10"><div class="text-3xl mb-3">ðŸ†</div><p class="font-display font-bold text-white mb-1">Round complete!</p><p class="text-[13px] text-slate-400">Got ${g.correct} / ${g.questions.length}.</p></div>`; if ($('triviaScore')) $('triviaScore').textContent = `${state.gameStats.triviaCorrect || 0} / ${state.gameStats.triviaTotal || 0}`; return; }
  card.innerHTML = `<div class="flex items-center justify-between mb-3"><span class="text-[11px] uppercase tracking-wider text-slate-500">Question ${g.index + 1} of ${g.questions.length}</span>
    <span class="text-[11px] text-emerald-400">Score: ${g.correct}</span></div>
    <p class="text-[15px] font-semibold text-white mb-4">${esc(q.q)}</p>
    <div class="grid gap-2">${(q.options || []).map((opt, i) => `<button data-topt="${i}" class="text-left px-4 py-3 rounded-xl bg-white/[.03] border border-white/10 hover:border-emerald-400/60 text-[13.5px] text-slate-200"><span class="font-bold text-slate-500 mr-2">${String.fromCharCode(65+i)}.</span>${esc(opt)}</button>`).join('')}</div>
    <div id="triviaResult" class="mt-4 hidden text-[13px] p-3 rounded-lg bg-white/[.03] border border-white/5"></div>`;
  card.querySelectorAll('[data-topt]').forEach(b => b.onclick = () => answerTrivia(parseInt(b.dataset.topt)));
  if ($('triviaScore')) $('triviaScore').textContent = `${state.gameStats.triviaCorrect || 0} / ${state.gameStats.triviaTotal || 0}`;
}
function answerTrivia(i) {
  const g = state.games.trivia; if (!g) return; const q = g.questions[g.index]; if (!q) return;
  const correct = i === q.answer;
  state.gameStats.triviaTotal = (state.gameStats.triviaTotal||0)+1;
  if (correct) { state.gameStats.triviaCorrect = (state.gameStats.triviaCorrect||0)+1; g.correct++; }
  saveGameStats();
  const result = $('triviaResult');
  if (result) { result.classList.remove('hidden'); result.innerHTML = correct ? `<span class="text-emerald-400 font-bold">âœ“ Correct!</span> ${q.explanation ? esc(q.explanation) : ''}` : `<span class="text-rose-400 font-bold">âœ— Correct: ${esc(q.options[q.answer])}</span> ${q.explanation ? 'Â· ' + esc(q.explanation) : ''}`; }
  document.querySelectorAll('[data-topt]').forEach(b => b.onclick = null);
  setTimeout(() => { g.index++; renderTrivia(); }, 1800);
}
async function loadTD(kind) {
  state.tdKind = kind;
  const card = $('tdCard'); if (!card) return;
  card.innerHTML = `<div class="text-center py-10"><i class="fa-solid fa-circle-notch fa-spin text-2xl text-pink-400"></i><p class="text-slate-500 text-[12px] mt-3">Generatingâ€¦</p></div>`;
  try { const res = await ai('/ai/truth-dare', { kind }); if (!res.items?.length) throw new Error('No items');
    state.tdCurrent = { items: res.items, idx: 0 }; renderTD();
  } catch(e) { card.innerHTML = `<p class="text-rose-400 text-[13px]">${esc(e.message)}</p>`; }
}
function renderTD() {
  const card = $('tdCard'); if (!card) return;
  if (!state.tdCurrent) { card.innerHTML = `<p class="text-slate-500 text-[13px]">Pick truth or dare.</p>`; if ($('tdNextBtn')) $('tdNextBtn').classList.add('hidden'); return; }
  const { items, idx } = state.tdCurrent;
  if (idx >= items.length) { card.innerHTML = `<p class="text-slate-500 text-[13px]">All done!</p>`; if ($('tdNextBtn')) $('tdNextBtn').classList.add('hidden'); return; }
  const color = state.tdKind === 'truth' ? '#38bdf8' : '#fb7185';
  card.innerHTML = `<div class="text-center"><div class="text-[10px] uppercase tracking-wider font-bold mb-2" style="color:${color}">${state.tdKind}</div>
    <p class="text-[16px] text-white font-semibold">${esc(items[idx])}</p>
    <div class="text-[11px] text-slate-500 mt-3">${idx + 1} / ${items.length}</div></div>`;
  if ($('tdNextBtn')) { $('tdNextBtn').classList.remove('hidden'); $('tdNextBtn').onclick = () => { state.tdCurrent.idx++; renderTD(); }; }
}
async function loadPrompts() {
  if ($('promptsCard')) $('promptsCard').innerHTML = `<div class="text-center py-10"><i class="fa-solid fa-circle-notch fa-spin text-2xl text-pink-400"></i></div>`;
  try { const res = await ai('/ai/prompts', { kind: 'would_you_rather' }); if (!res.prompts?.length) throw new Error('No prompts');
    state.games.prompts = res.prompts; renderPrompts();
  } catch(e) { if ($('promptsCard')) $('promptsCard').innerHTML = `<p class="text-rose-400 text-[13px]">${esc(e.message)}</p>`; }
}
function renderPrompts() {
  const card = $('promptsCard'); if (!card) return;
  const prompts = state.games.prompts;
  if (!prompts?.length) { card.innerHTML = `<div class="text-center py-10 text-slate-500"><i class="fa-solid fa-comments text-3xl block mb-3 opacity-35"></i>Click Generate Prompts.</div>`; return; }
  card.innerHTML = `<div class="space-y-3">${prompts.map((p, i) => `<div class="p-4 rounded-xl bg-white/[.03] border border-white/5 hover:border-pink-400/40"><div class="flex items-start gap-3"><span class="text-[10px] font-bold text-pink-400 mt-0.5">${i+1}</span>
    <div class="flex-1"><p class="text-[14px] text-slate-200">${esc(p.text)}</p><span class="badge b-purple mt-2">${esc(p.category || 'fun')}</span></div></div></div>`).join('')}</div>`;
}

function initChat() {
  if ($('chatFab')) $('chatFab').onclick = () => toggleChatPanel();
  if ($('chatCloseBtn')) $('chatCloseBtn').onclick = () => { state.chatPanelOpen = false; $('chatPanel').classList.add('hidden'); };
  if ($('chatFabForm')) $('chatFabForm').onsubmit = sendChatMessage;
  if ($('chatFabInput')) { $('chatFabInput').oninput = () => setTyping(true); $('chatFabInput').onblur = () => setTyping(false); }
  updateChatHeader();
  if ($('mChatCloseBtn')) $('mChatCloseBtn').onclick = () => closeMobileChat();
  if ($('mChatForm')) $('mChatForm').onsubmit = sendMobileChatMessage;
  if ($('mChatInput')) { $('mChatInput').oninput = () => setTyping(true); $('mChatInput').onblur = () => setTyping(false); }
}
function toggleChatPanel() {
  state.chatPanelOpen = !state.chatPanelOpen;
  $('chatPanel').classList.toggle('hidden', !state.chatPanelOpen);
  if (state.chatPanelOpen) { setTimeout(() => { renderChatFab(); $('chatFabMessages').scrollTop = $('chatFabMessages').scrollHeight; $('chatFabInput').focus(); }, 100);
    state.lastChatSeenTs = Date.now(); state.settings.lastChatSeenTs = state.lastChatSeenTs; persistSettings(); updateChatBadge(); }
}
function openMobileChat() {
  const pu = partnerUid(); if (!pu) return toast('Set partner first.', 'warning');
  state.mobileChatOpen = true;
  const modal = $('mobileChatModal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    updateMobileChatHeader();
    renderMobileChatMessages();
    setTimeout(() => { const msgs = $('mChatMessages'); if (msgs) msgs.scrollTop = msgs.scrollHeight; $('mChatInput').focus(); }, 100);
  }
  state.lastChatSeenTs = Date.now(); state.settings.lastChatSeenTs = state.lastChatSeenTs; persistSettings(); updateChatBadge();
}
function closeMobileChat() {
  state.mobileChatOpen = false;
  const modal = $('mobileChatModal');
  if (modal) { modal.classList.remove('open'); document.body.style.overflow = ''; }
}
function updateMobileChatHeader() {
  const pu = partnerUid();
  if (!pu || !state.profiles[pu]) return;
  const p = state.profiles[pu];
  if ($('mChatPartnerName')) $('mChatPartnerName').textContent = p.name;
  const av = $('mChatPartnerAvatar');
  if (av) { if (p.avatar) av.innerHTML = `<img src="${p.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>`; else { av.textContent = initials(p.name); av.style.background = `linear-gradient(135deg,${p.accent||'#a855f7'},#7c3aed)`; } }
  if ($('mChatPartnerStatus')) { const on = isOnline(pu); $('mChatPartnerStatus').innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:${on?'#34d399':'#64748b'};"></span> ${on ? 'Online' : 'Offline'}`; }
}
function renderMobileChatMessages() {
  const pu = partnerUid(); const container = $('mChatMessages'); if (!container) return;
  if (!pu) { container.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;font-size:.82rem;"><i class="fa-solid fa-comments" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.4;"></i>Select partner in Settings.</div>`; return; }
  const msgs = Object.values(state.chat || {}).filter(m => (m.from === state.user.uid && m.to === pu) || (m.from === pu && m.to === state.user.uid)).sort((a,b) => (a.ts||0) - (b.ts||0));
  if (!msgs.length) { container.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;font-size:.82rem;"><i class="fa-regular fa-comments" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.4;"></i>Say hi to ${esc(profileName(pu))} ðŸ‘‹</div>`; return; }
  let lastDate = '', html = '';
  msgs.forEach(m => { const d = new Date(m.ts); const day = d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'});
    if (day !== lastDate) { html += `<div style="text-align:center;margin:12px 0;"><span style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#475569;background:rgba(15,23,42,.7);padding:4px 10px;border-radius:20px;">${day}</span></div>`; lastDate = day; }
    const mine = m.from === state.user.uid;
    html += `<div style="display:flex;${mine ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}"><div class="chat-bubble ${mine ? 'me' : 'them'}">${esc(m.text)}<div style="font-size:9.5px;opacity:.6;margin-top:4px;">${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div></div></div>`; });
  container.innerHTML = html;
  const partnerTyping = state.typing[pu]?.typing && (Date.now() - state.typing[pu].at < 4000);
  if ($('mChatTyping')) $('mChatTyping').style.display = partnerTyping ? 'block' : 'none';
}
async function sendMobileChatMessage(e) {
  e.preventDefault();
  const pu = partnerUid(); if (!pu) return toast('Select a partner first.', 'warning');
  const input = $('mChatInput'); const text = input.value.trim(); if (!text) return;
  input.value = ''; const id = uid();
  await safeSet(`chat/${id}`, { id, from: state.user.uid, to: pu, text, ts: Date.now(), read: false });
  setTyping(false); setTimeout(() => { const msgs = $('mChatMessages'); if (msgs) msgs.scrollTop = msgs.scrollHeight; }, 100);
}
function updateChatHeader() {
  const pu = partnerUid();
  if (!pu || !state.profiles[pu]) { if ($('chatPartnerName')) $('chatPartnerName').textContent = 'No partner'; return; }
  const p = state.profiles[pu];
  if ($('chatPartnerName')) $('chatPartnerName').textContent = p.name;
  const av = $('chatPartnerAvatar');
  if (av) { if (p.avatar) av.innerHTML = `<img src="${p.avatar}" class="w-full h-full object-cover rounded-full"/>`; else { av.textContent = initials(p.name); av.style.background = `linear-gradient(135deg,${p.accent||'#a855f7'},#7c3aed)`; } }
  if ($('chatPartnerStatus')) { const on = isOnline(pu); $('chatPartnerStatus').innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${on?'bg-emerald-400':'bg-slate-500'}"></span> ${on ? 'Online' : 'Offline'}`; }
}
function handleChatUpdate() { renderChatFab(); updateChatBadge(); if (state.chatPanelOpen) setTimeout(() => $('chatFabMessages').scrollTop = $('chatFabMessages').scrollHeight, 100); if (state.mobileChatOpen) setTimeout(() => { const msgs = $('mChatMessages'); if (msgs) msgs.scrollTop = msgs.scrollHeight; }, 100); }
function renderChatFab() {
  const pu = partnerUid(); const container = $('chatFabMessages'); if (!container) return;
  if (!pu) { container.innerHTML = `<div class="text-center py-8 text-slate-500 text-[12.5px]"><i class="fa-solid fa-comments text-3xl block mb-2 opacity-40"></i>Select partner in Settings.</div>`; return; }
  const msgs = Object.values(state.chat || {}).filter(m => (m.from === state.user.uid && m.to === pu) || (m.from === pu && m.to === state.user.uid)).sort((a,b) => (a.ts||0) - (b.ts||0));
  if (!msgs.length) { container.innerHTML = `<div class="text-center py-10 text-slate-500 text-[12.5px]"><i class="fa-regular fa-comments text-3xl block mb-3 opacity-40"></i>Say hi to ${esc(profileName(pu))} ðŸ‘‹</div>`; return; }
  let lastDate = '', html = '';
  msgs.forEach(m => { const d = new Date(m.ts); const day = d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'});
    if (day !== lastDate) { html += `<div class="text-center my-3"><span class="text-[10px] uppercase tracking-wider text-slate-600 bg-slate-900/70 px-2 py-1 rounded-full">${day}</span></div>`; lastDate = day; }
    const mine = m.from === state.user.uid;
    html += `<div class="flex ${mine ? 'justify-end' : 'justify-start'}"><div class="chat-bubble ${mine ? 'me' : 'them'}">${esc(m.text)}<div class="text-[9.5px] opacity-60 mt-1">${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div></div></div>`; });
  container.innerHTML = html;
  const partnerTyping = state.typing[pu]?.typing && (Date.now() - state.typing[pu].at < 4000);
  if ($('chatTyping')) $('chatTyping').classList.toggle('hidden', !partnerTyping);
}
function updateChatBadge() {
  const pu = partnerUid(); if (!pu) { if ($('chatFabBadge')) $('chatFabBadge').classList.add('hidden'); return; }
  const unread = Object.values(state.chat || {}).filter(m => m.from === pu && m.to === state.user.uid && (m.ts||0) > (state.lastChatSeenTs || 0)).length;
  const badge = $('chatFabBadge');
  if (badge) { if (unread > 0) { badge.textContent = unread > 9 ? '9+' : unread; badge.classList.remove('hidden'); $('chatFab').classList.add('pulse'); } else { badge.classList.add('hidden'); $('chatFab').classList.remove('pulse'); } }
}
async function sendChatMessage(e) {
  e.preventDefault();
  const pu = partnerUid(); if (!pu) return toast('Select a partner first.', 'warning');
  const input = $('chatFabInput'); const text = input.value.trim(); if (!text) return;
  input.value = ''; const id = uid();
  await safeSet(`chat/${id}`, { id, from: state.user.uid, to: pu, text, ts: Date.now(), read: false });
  setTyping(false); setTimeout(() => $('chatFabMessages').scrollTop = $('chatFabMessages').scrollHeight, 100);
}
async function setTyping(isTyping) {
  const pu = partnerUid(); if (!pu) return;
  const tRef = ref(db, P(`typing/${state.user.uid}`));
  if (isTyping) await set(tRef, { typing: true, at: Date.now() }); else await remove(tRef);
}

function switchMobileScreen(name) {
  state.mobileScreen = name;
  document.querySelectorAll('.mobile-screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
  document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(n => n.classList.toggle('active', n.dataset.screen === name));
  if (name === 'dashboard') renderMobileDashboard();
  if (name === 'tasks') renderMobileTasks();
  if (name === 'today') renderMobileTodos();
  if (name === 'goals') renderMobileGoals();
  if (name === 'games') renderMobileGame();
  if (name === 'vault') renderMobileVault();
}
document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(item => {
  item.onclick = () => {
    if (item.id === 'mMoreBtn') { openSheet(); return; }
    if (item.dataset.screen === 'games') { enterFullscreenTab('games'); return; }
    switchMobileScreen(item.dataset.screen);
  };
});
function openSheet() { $('mSheetBackdrop').classList.add('open'); $('mSheet').classList.add('open'); }
function closeSheet() { $('mSheetBackdrop').classList.remove('open'); $('mSheet').classList.remove('open'); }
if ($('mSheetBackdrop')) $('mSheetBackdrop').onclick = closeSheet;
if ($('mSheetClose')) $('mSheetClose').onclick = closeSheet;
document.querySelectorAll('[data-mgoto]').forEach(t => t.onclick = () => {
  closeSheet();
  const tab = t.dataset.mgoto;
  if (tab === 'vault') { switchMobileScreen('vault'); setTimeout(() => renderMobileVault(), 100); return; }
  enterFullscreenTab(tab);
});
document.querySelectorAll('[data-mchat]').forEach(t => t.onclick = () => { closeSheet(); openMobileChat(); });
if ($('mFab')) $('mFab').onclick = () => {
  const s = state.mobileScreen;
  if (s === 'tasks') openTaskModal();
  else if (s === 'today') $('mTodoInput').focus();
  else if (s === 'goals') openGoalModal();
  else openTaskModal();
};
function openGoalModal() { if ($('goalForm')) { $('goalEditId').value = ''; $('goalForm').reset(); $('goalPriority').value = 'medium'; $('goalTargetTime').value = '23:59'; milestoneDraft = []; renderMilestoneEditor(); showModal('goalModal'); } }

function renderMobileDashboard() {
  if (!isMobile()) return;
  const m = metricsFor(state.user.uid);
  const pu = partnerUid(); const pm = pu ? metricsFor(pu) : null;
  const kpis = [
    { label:'Tasks', value: m.total, icon:'fa-list-check', color:'#38bdf8', tab:'tasks', filter:'all' },
    { label:'Done', value: m.done, icon:'fa-circle-check', color:'#34d399', tab:'tasks', filter:'done' },
    { label:'Overdue', value: m.overdue, icon:'fa-triangle-exclamation', color:'#fb7185', tab:'tasks', filter:'overdue' },
    { label:'Today', value: `${m.todayDone}/${m.todayTodos}`, icon:'fa-circle-dot', color:'#fbbf24', tab:'today' },
    { label:'Streak', value: m.streak, icon:'fa-fire', color:'#f97316', tab:'today' },
    { label:'Completion', value: m.completion + '%', icon:'fa-percent', color:'#a855f7', tab:'tasks', filter:'all' }
  ];
  const kg = $('mKpiGrid');
  if (kg) kg.innerHTML = kpis.map(k => `<div class="m-kpi" data-m-go-tab="${k.tab}" data-m-go-filter="${k.filter||''}" style="cursor:pointer;">
    <div class="kpi-icon" style="background:${k.color}22;color:${k.color}"><i class="fa-solid ${k.icon}"></i></div>
    <div class="kpi-val" style="color:${k.color}">${k.value}</div>
    <div class="kpi-label">${k.label}</div></div>`).join('');
  kg.querySelectorAll('[data-m-go-tab]').forEach(el => el.onclick = () => {
    const t = el.dataset.mGoTab;
    if (t === 'tasks') { state.mobileTaskFilter = el.dataset.mGoFilter || 'all'; switchMobileScreen('tasks'); }
    else if (t === 'today') switchMobileScreen('today');
  });
  const bars = [
    { label:'Task Completion', value: m.completion, cls:'fill-cyan' },
    { label:'On-Time', value: m.onTimeRate, cls:'fill-emerald' },
    { label:"Today", value: m.todoRate, cls:'fill-amber' },
    { label:'Habits', value: m.habitRate, cls:'fill-violet' },
    { label:'Schedule', value: m.scheduleScore, cls:'fill-rose' },
    { label:'Hourly', value: m.hourlyScore, cls:'fill-cyan' }
  ];
  const mb = $('mMetricBars');
  if (mb) mb.innerHTML = bars.map(b => `<div>
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
      <span style="font-size:.68rem;color:#94a3b8;">${b.label}</span>
      <span style="font-size:.72rem;font-family:'Space Grotesk';font-weight:700;color:#e2e8f0;">${b.value}%</span>
    </div>
    <div class="progress-shell" style="height:8px;"><div class="progress-fill ${b.cls}" style="width:${b.value}%"></div></div>
  </div>`).join('');
  const up = $('mUpcomingList');
  if (up) {
    const items = [];
    myTasks().filter(t => !t.done).forEach(t => { const d = dueDateTime(t); if (d) items.push({ ...t, _type:'task', _due: d }); });
    myTodos().filter(t => !t.done).forEach(t => { const d = dueDateTime(t); if (d) items.push({ text: t.text, ...t, _type:'todo', _due: d }); });
    allGoals().forEach(g => { if (g.completedAt) return; const d = dueDateTime(g); if (d) items.push({ ...g, _type:'goal', _due: d }); });
    items.sort((a,b) => a._due - b._due);
    if (!items.length) { up.innerHTML = `<div style="text-align:center;color:#64748b;font-size:.75rem;padding:14px;">Nothing scheduled.</div>`; }
    else up.innerHTML = items.slice(0,5).map(x => {
      const diff = x._due.getTime() - Date.now();
      const color = x._type === 'task' ? '#38bdf8' : x._type === 'todo' ? '#fbbf24' : '#fb923c';
      const title = x.title || x.text || '(untitled)';
      return `<div style="display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.03);border-left:3px solid ${color};cursor:pointer;" data-m-go="${x._type}">
        <i class="fa-solid ${x._type === 'goal' ? 'fa-bullseye' : x._type === 'todo' ? 'fa-circle-check' : 'fa-list-check'}" style="color:${color};font-size:12px;"></i>
        <span style="flex:1;font-size:.78rem;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(title)}</span>
        <span class="countdown-pill ${countdownClass(diff)}" data-countdown="${x._due.getTime()}" style="font-size:.6rem;"><i class="fa-regular fa-hourglass-half"></i> ${formatCountdown(diff)}</span></div>`;
    }).join('');
    up.querySelectorAll('[data-m-go]').forEach(el => el.onclick = () => {
      const t = el.dataset.mGo;
      if (t === 'task') switchMobileScreen('tasks');
      else if (t === 'todo') switchMobileScreen('today');
      else if (t === 'goal') switchMobileScreen('goals');
    });
  }
  buildMobileCharts(m, pm, pu);
}
function buildMobileCharts(m, pm, pu) {
  const isDark = document.documentElement.classList.contains('dark');
  const grid = isDark ? 'rgba(148,163,184,.12)' : 'rgba(15,23,42,.08)';
  const tick = isDark ? '#94a3b8' : '#475569';
  const me = state.profile?.name || 'You';
  const pn = pu && state.profiles[pu] ? state.profiles[pu].name : 'Partner';
  if (state.charts.mDonut) state.charts.mDonut.destroy();
  const dctx = $('mChartDonut')?.getContext('2d');
  if (dctx) { const empty = m.total === 0;
    state.charts.mDonut = new Chart(dctx, { type:'doughnut',
      data:{ labels: empty ? ['No tasks'] : ['Done','In Progress','Overdue'],
        datasets:[{ data: empty ? [1] : [m.done, Math.max(0, m.total-m.done-m.overdue), m.overdue],
          backgroundColor: empty ? ['rgba(100,116,139,.35)'] : ['#4ade80','#38bdf8','#fb7185'],
          borderColor: isDark ? '#0b1220' : '#fff', borderWidth: 3, hoverOffset: 10 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'60%',
        plugins:{ legend:{ position:'bottom', labels:{ color:tick, usePointStyle:true, boxWidth:8, padding:8, font:{size:10,weight:'600'} } } } } }); }
  if (state.charts.mRadar) state.charts.mRadar.destroy();
  const rctx = $('mChartRadar')?.getContext('2d');
  if (rctx) {
    const axes = ['Tasks', 'To-Dos', 'Goals', 'Skills', 'Finance', 'Schedule', 'Hourly', 'Activities'];
    const myData = [m.completion, m.habitRate, m.goalsScore, m.skillsScore, m.financeScore, m.scheduleScore, m.hourlyScore, m.activitiesScore];
    const ds = [{ label: me, data: myData, borderColor:'#22d3ee', backgroundColor:'rgba(34,211,238,.22)', pointBackgroundColor:'#22d3ee', pointBorderColor:'#0b1220', pointBorderWidth:2, pointRadius:3, borderWidth:2.5, fill:true }];
    if (pm) ds.push({ label: pn, data: [pm.completion, pm.habitRate, pm.goalsScore, pm.skillsScore, pm.financeScore, pm.scheduleScore, pm.hourlyScore, pm.activitiesScore], borderColor:'#a855f7', backgroundColor:'rgba(168,85,247,.18)', pointBackgroundColor:'#a855f7', pointBorderColor:'#0b1220', pointBorderWidth:2, pointRadius:3, borderWidth:2.5, fill:true });
    state.charts.mRadar = new Chart(rctx, { type:'radar', data:{ labels: axes, datasets: ds },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:tick, usePointStyle:true, boxWidth:8, padding:8, font:{size:10,weight:'600'} } } },
        scales:{ r:{ beginAtZero:true, max:100, angleLines:{ color:grid }, grid:{ color:grid }, pointLabels:{ color:tick, font:{size:9,weight:'600'} }, ticks:{ display:false } } } } });
  }
  if (state.charts.mGoals) state.charts.mGoals.destroy();
  const gctx = $('mChartGoals')?.getContext('2d');
  if (gctx) {
    const goals = allGoals(); const short = goals.filter(g => g.type === 'short_term'); const long = goals.filter(g => g.type === 'long_term');
    const sP = short.length ? Math.round(short.reduce((sum, g) => sum + getGoalProgress(g), 0) / short.length) : 0;
    const lP = long.length ? Math.round(long.reduce((sum, g) => sum + getGoalProgress(g), 0) / long.length) : 0;
    state.charts.mGoals = new Chart(gctx, { type: 'bar', data: { labels: ['Short', 'Long'], datasets: [{ data: [sP, lP], backgroundColor: ['#fb923c', '#a855f7'], borderRadius: 8, barPercentage: .6 }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, max: 100, ticks: { color: tick, callback: v => v + '%' }, grid: { color: grid } }, y: { ticks: { color: tick, font: { size: 10 } }, grid: { display: false } } } } });
  }
  if (state.charts.mSkills) state.charts.mSkills.destroy();
  const skctx = $('mChartSkills')?.getContext('2d');
  if (skctx) {
    const skills = allSkills().slice().sort((a,b) => (b.hours||0) - (a.hours||0)).slice(0,6);
    const labels = skills.map(s => s.name.length > 10 ? s.name.slice(0,10) + 'â€¦' : s.name);
    const data = skills.map(s => s.target ? Math.min(100, Math.round((s.hours/s.target)*100)) : 0);
    state.charts.mSkills = new Chart(skctx, { type: 'bar', data: { labels, datasets: [{ data, backgroundColor: ['#38bdf8','#a855f7','#34d399','#fbbf24','#fb7185','#22d3ee'], borderRadius: 8, barPercentage: .7 }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, max: 100, ticks: { color: tick, callback: v => v + '%' }, grid: { color: grid } }, y: { ticks: { color: tick, font: { size: 10 } }, grid: { display: false } } } } });
  }
  if (state.charts.mFinance) state.charts.mFinance.destroy();
  const fctx = $('mChartFinance')?.getContext('2d');
  if (fctx) {
    const exps = allExpenses().reduce((s,e) => s + Number(e.amount||0), 0);
    const saved = allSavings().reduce((s,g) => s + Number(g.current||0), 0);
    const target = allSavings().reduce((s,g) => s + Number(g.target||0), 0);
    const subs = allSubs().reduce((s,x) => { const a = Number(x.amount||0); if (x.cycle === 'yearly') return s + a/12; if (x.cycle === 'weekly') return s + a*4.33; return s + a; }, 0);
    state.charts.mFinance = new Chart(fctx, { type: 'bar', data: { labels: ['Exp', 'Saved', 'Target', 'Subs'], datasets: [{ data: [exps, saved, target, subs], backgroundColor: ['#fb7185','#34d399','#38bdf8','#a855f7'], borderRadius: 6, barPercentage: .65 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { color: tick, callback: v => v >= 1000 ? (v/1000).toFixed(0) + 'k' : v }, grid: { color: grid } }, x: { ticks: { color: tick, font: { size: 10 } }, grid: { display: false } } } } });
  }
  if (state.charts.mLine) state.charts.mLine.destroy();
  const lctx = $('mChartLine')?.getContext('2d');
  if (lctx) {
    const mine = completionSeries(state.user.uid, 14); const theirs = pu ? completionSeries(pu, 14) : null;
    const ds = [{ label: me, data: mine.map(d=>d.value), borderColor:'#22d3ee', backgroundColor: 'rgba(34,211,238,.20)', borderWidth:2.5, fill:true, tension:.42, pointRadius:0 }];
    if (theirs) ds.push({ label: pn, data: theirs.map(d=>d.value), borderColor:'#a855f7', backgroundColor: 'rgba(168,85,247,.15)', borderWidth:2.5, fill:true, tension:.42, pointRadius:0 });
    state.charts.mLine = new Chart(lctx, { type: 'line',
      data: { labels: mine.map(d => new Date(d.date+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'})), datasets: ds },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position:'bottom', labels: { color: tick, usePointStyle:true, boxWidth:8, padding:8, font:{size:10} } } },
        scales: { y: { beginAtZero: true, ticks: { color: tick, precision: 0 }, grid: { color: grid } }, x: { ticks: { color: tick, font: { size: 9 }, maxRotation: 0 }, grid: { display: false } } } } });
  }
}
function renderMobileTasks() {
  if (!isMobile()) return;
  const host = $('mTaskList'); if (!host) return;
  const today = todayStr(); const f = state.mobileTaskFilter || 'all';
  let list = myTasks();
  if (f === 'open') list = list.filter(t => !t.done);
  else if (f === 'done') list = list.filter(t => t.done);
  else if (f === 'overdue') list = list.filter(t => !t.done && t.dueDate && t.dueDate < today);
  else if (f === 'today') list = list.filter(t => t.dueDate === today);
  else if (['high','medium','low'].includes(f)) list = list.filter(t => (t.priority || 'medium') === f);
  list.sort((a,b) => { if (a.done !== b.done) return a.done?1:-1;
    const pa = {high:0,medium:1,low:2}[a.priority] ?? 1; const pb = {high:0,medium:1,low:2}[b.priority] ?? 1;
    if (pa !== pb) return pa - pb; return (a.dueDate||'9999').localeCompare(b.dueDate||'9999'); });
  if (!list.length) { host.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;font-size:.8rem;"><i class="fa-solid fa-clipboard-list" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.4;"></i>No tasks.</div>`; return; }
  host.innerHTML = list.map(t => {
    const overdue = !t.done && t.dueDate && t.dueDate < today;
    const dueToday = t.dueDate === today;
    const isAssigned = t.assignedTo && t.assignedTo !== state.user.uid;
    return `<div class="m-task ${t.done ? 'done' : ''}">
      <button class="m-check ${t.done ? 'checked' : ''}" data-mtoggle="${t.id}">${t.done ? '<i class="fa-solid fa-check" style="font-size:10px;color:#fff;"></i>' : ''}</button>
      <div class="m-body">
        <div class="m-title">${esc(t.title)}</div>
        <div class="m-meta">
          <span class="badge b-${t.priority || 'medium'}">${esc(t.priority || 'medium')}</span>
          ${t.dueDate ? `<span class="${overdue?'text-rose-400':dueToday?'text-amber-400':''}"><i class="fa-regular fa-calendar"></i> ${fmtDate(t.dueDate)}${t.dueTime?' Â· '+t.dueTime:''}</span>` : ''}
          ${countdownPill(t, t.done)}
          ${isAssigned ? `<span class="badge b-purple">${esc(state.profiles[t.assignedTo]?.name || 'Partner')}</span>` : ''}
        </div>
      </div>
      <div class="m-actions">
        ${photoButton('task', t.id, !!t.completionPhoto)}
        <button class="m-icon-btn del" data-mdel="${t.id}"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
  host.querySelectorAll('[data-mtoggle]').forEach(b => b.onclick = () => toggleTask(b.dataset.mtoggle));
  host.querySelectorAll('[data-mdel]').forEach(b => b.onclick = () => deleteTask(b.dataset.mdel));
}
document.querySelectorAll('[data-mfilter="tasks"] .m-pill').forEach(p => p.onclick = () => {
  document.querySelectorAll('[data-mfilter="tasks"] .m-pill').forEach(x => x.classList.remove('active'));
  p.classList.add('active'); state.mobileTaskFilter = p.dataset.filter; renderMobileTasks();
});
function renderMobileTodos() {
  if (!isMobile()) return;
  const list = myTodos().filter(t => t.date === state.todoDate).sort((a,b) => { const ta = a.dueTime || '99:99', tb = b.dueTime || '99:99'; return ta.localeCompare(tb); });
  const host = $('mTodoList'); if (!host) return;
  if (!list.length) { host.innerHTML = `<div style="text-align:center;padding:24px;color:#64748b;font-size:.8rem;"><i class="fa-regular fa-circle-check" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.4;"></i>No to-dos for this day.</div>`; return; }
  host.innerHTML = list.map(t => `<div class="m-todo ${t.done ? 'done' : ''}">
    <button class="m-check ${t.done ? 'checked' : ''}" data-mttoggle="${t.id}">${t.done ? '<i class="fa-solid fa-check" style="font-size:9px;color:#fff;"></i>' : ''}</button>
    <div class="m-todo-text">${esc(t.text)}</div>
    <div style="display:flex;gap:4px;flex-direction:column;align-items:flex-end;">
      <span class="badge b-${t.priority || 'medium'}" style="font-size:.5rem;">${esc(t.priority||'m')}</span>
      ${t.dueTime ? `<span style="font-size:.6rem;color:#64748b;">${t.dueTime}</span>` : ''}
      ${photoButton('todo', t.id, !!t.completionPhoto)}
    </div>
  </div>`).join('');
  host.querySelectorAll('[data-mttoggle]').forEach(b => b.onclick = () => toggleTodo(b.dataset.mttoggle));
}
if ($('mAddTodoBtn')) $('mAddTodoBtn').onclick = async () => {
  const text = ($('mTodoInput').value || '').trim();
  if (!text) { toast('Write something first.', 'warning'); return; }
  const dueTime = $('mTodoDueTime').value || '';
  const priority = $('mTodoPriority').value || 'medium';
  const recurring = $('mTodoRecurring').checked;
  $('mTodoInput').value = ''; $('mTodoDueTime').value = ''; $('mTodoPriority').value = 'medium'; $('mTodoRecurring').checked = false;
  await addTodoOptimistic(text, dueTime, priority, recurring);
};
if ($('mTodoInput')) $('mTodoInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('mAddTodoBtn').click(); } });
if ($('mPrevDay')) $('mPrevDay').onclick = () => { const d = new Date(state.todoDate + 'T00:00:00'); d.setDate(d.getDate()-1); state.todoDate = dateStr(d); renderMobileTodos(); };
if ($('mNextDay')) $('mNextDay').onclick = () => { const d = new Date(state.todoDate + 'T00:00:00'); d.setDate(d.getDate()+1); state.todoDate = dateStr(d); renderMobileTodos(); };
if ($('mTodayJump')) $('mTodayJump').onclick = () => { state.todoDate = todayStr(); renderMobileTodos(); };
function renderMobileGoals() {
  if (!isMobile()) return;
  const host = $('mGoalsGrid'); if (!host) return;
  const goals = allGoals().sort((a,b) => { const pa = {high:0,medium:1,low:2}[a.priority] ?? 1; const pb = {high:0,medium:1,low:2}[b.priority] ?? 1; if (pa !== pb) return pa - pb; return (a.targetDate||'').localeCompare(b.targetDate||''); });
  if (!goals.length) { host.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;font-size:.8rem;"><i class="fa-solid fa-bullseye" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.4;"></i>No goals yet.</div>`; return; }
  host.innerHTML = goals.map(g => {
    const pct = getGoalProgress(g);
    const cls = pct >= 70 ? 'fill-emerald' : pct >= 40 ? 'fill-cyan' : 'fill-amber';
    const tc = g.type === 'long_term' ? '#a855f7' : '#fb923c';
    return `<div class="m-goal">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;">
        <div style="width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:${tc}22;color:${tc};flex-shrink:0;"><i class="fa-solid fa-bullseye"></i></div>
        <div style="flex:1;min-width:0;">
          <div style="font-family:'Space Grotesk';font-weight:700;font-size:.9rem;color:#f0f4ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(g.title)}</div>
          <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
            <span class="badge" style="background:${tc}22;color:${tc};border-color:${tc}55;font-size:.55rem;">${g.type === 'long_term' ? 'Long' : 'Short'}</span>
            <span class="badge b-${g.priority || 'medium'}" style="font-size:.55rem;">${esc(g.priority || 'medium')}</span>
          </div>
        </div>
        ${photoButton('goal', g.id, !!g.completionPhoto)}
      </div>
      <div class="progress-shell" style="height:8px;"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
      <div style="display:flex;justify-content:space-between;margin-top:5px;font-size:.65rem;color:#94a3b8;"><span>${pct}% complete</span>${g.targetDate ? `<span>${fmtDate(g.targetDate)}</span>` : ''}</div>
    </div>`;
  }).join('');
}
function renderMobileGame() {
  if (!isMobile()) return;
  const host = $('mGameArea'); if (!host) return;
  const tab = state.mobileGameTab || 'lobby';
  if (tab === 'lobby') {
    host.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      ${[
        { id:'ttt', name:'Tic-Tac-Toe', icon:'â¨¯', bg:'linear-gradient(135deg,#38bdf8,#0284c7)' },
        { id:'c4', name:'Connect 4', icon:'ðŸ”´', bg:'linear-gradient(135deg,#ef4444,#b91c1c)' },
        { id:'memory', name:'Memory', icon:'ðŸ§ ', bg:'linear-gradient(135deg,#a855f7,#7c3aed)' },
        { id:'rps', name:'RPS', icon:'âœ‚ï¸', bg:'linear-gradient(135deg,#a855f7,#7c3aed)' },
        { id:'dice', name:'Dice', icon:'ðŸŽ²', bg:'linear-gradient(135deg,#fbbf24,#d97706)' },
        { id:'word', name:'Word', icon:'ðŸ”¤', bg:'linear-gradient(135deg,#22d3ee,#0e7490)' },
        { id:'20q', name:'20 Qs', icon:'â“', bg:'linear-gradient(135deg,#fb7185,#e11d48)' },
        { id:'trivia', name:'Trivia', icon:'ðŸ“š', bg:'linear-gradient(135deg,#34d399,#059669)' }
      ].map(g => `<div style="display:flex;flex-direction:column;gap:6px;padding:14px;justify-content:center;align-items:center;border-radius:14px;background:rgba(15,23,42,.55);border:1px solid rgba(148,163,184,.15);font-size:.75rem;font-weight:600;cursor:pointer;color:#cbd5e1;" data-mgame-launch="${g.id}">
        <div style="width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:${g.bg};font-size:20px;">${g.icon}</div>
        <span>${g.name}</span></div>`).join('')}
    </div>
    <div class="m-card" style="margin-top:12px;">
      <h3><i class="fa-solid fa-trophy"></i> Stats</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div class="m-kpi"><div class="kpi-val" style="color:#38bdf8;">${state.gameStats.tttW||0}</div><div class="kpi-label">TTT Wins</div></div>
        <div class="m-kpi"><div class="kpi-val" style="color:#a855f7;">${state.gameStats.c4W||0}</div><div class="kpi-label">C4 Wins</div></div>
        <div class="m-kpi"><div class="kpi-val" style="color:#34d399;">${state.gameStats.triviaCorrect||0}</div><div class="kpi-label">Trivia âœ“</div></div>
        <div class="m-kpi"><div class="kpi-val" style="color:#fbbf24;">${state.gameStats.diceW||0}</div><div class="kpi-label">Dice Wins</div></div>
      </div>
    </div>`;
    host.querySelectorAll('[data-mgame-launch]').forEach(c => c.onclick = () => launchMobileGame(c.dataset.mgameLaunch));
  }
}
function launchMobileGame(gameId) {
  enterFullscreenTab('games');
  const tabs = { ttt:'game-ttt', c4:'game-c4', memory:'game-memory', rps:'game-rps', dice:'game-dice', word:'game-word', '20q':'game-20q', trivia:'game-trivia' };
  const tab = document.querySelector(`[data-subtab="${tabs[gameId]}"]`);
  if (tab) tab.click();
  setTimeout(() => {
    if (gameId === 'ttt') renderTTT();
    if (gameId === 'c4') renderC4();
    if (gameId === 'memory') renderMemory();
    if (gameId === 'rps') renderRPS();
    if (gameId === 'dice') renderDice();
    if (gameId === 'word') renderWordDuel();
    if (gameId === '20q') renderQ20();
    if (gameId === 'trivia') renderTrivia();
  }, 150);
}
function renderMobileVault() {
  if (!isMobile()) return;
  const host = $('mVaultList'); if (!host) return;
  const docs = myDocs().sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
  if (!docs.length) {
    host.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;font-size:.8rem;"><i class="fa-solid fa-folder-open" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.4;"></i>No files yet.</div>`;
    return;
  }
  host.innerHTML = docs.map(d => {
    const isImg = (d.mime || '').startsWith('image/') && d.data;
    const src = d.sourceLabel ? `<span class="badge b-cyan" style="font-size:.5rem;">${esc(d.sourceLabel.slice(0,16))}</span>` : '';
    return `<div class="m-todo" style="padding:12px;cursor:pointer;" data-mdoc-open="${d.id}">
      <div style="width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:${isImg?'#38bdf822':'#38bdf815'};color:#38bdf8;flex-shrink:0;overflow:hidden;">
        ${isImg ? `<img src="${d.data}" style="width:100%;height:100%;object-fit:cover;">` : `<i class="fa-solid fa-file"></i>`}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.82rem;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(d.name)}</div>
        <div style="font-size:.62rem;color:#64748b;margin-top:2px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span>${fmtBytes(d.size)}</span>
          <span>Â·</span>
          <span>${timeAgo(d.uploadedAt)}</span>
          ${src}
        </div>
      </div>
      <i class="fa-solid fa-chevron-right" style="color:#64748b;font-size:12px;"></i>
    </div>`;
  }).join('');
  host.querySelectorAll('[data-mdoc-open]').forEach(el => el.onclick = () => previewDoc(el.dataset.mdocOpen));
}
if ($('mVaultFileInput')) $('mVaultFileInput').onchange = e => { handleFiles(e.target.files); e.target.value = ''; };
if ($('mThemeBtn')) $('mThemeBtn').onclick = () => {
  const isDark = document.documentElement.classList.toggle('dark');
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  $('mThemeBtn').innerHTML = isDark ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
  setTimeout(() => { if (isMobile()) renderMobileDashboard(); }, 80);
};
if ($('mAvatarBtn')) $('mAvatarBtn').onclick = () => { openSheet(); };
if ($('mPrioritizeTasks')) $('mPrioritizeTasks').onclick = () => runPriorityAdvisor('tasks');
if ($('mPrioritizeGoals')) $('mPrioritizeGoals').onclick = () => runPriorityAdvisor('goals');
if ($('mAddTaskBtn')) $('mAddTaskBtn').onclick = () => openTaskModal();
if ($('mAddGoalBtn')) $('mAddGoalBtn').onclick = () => openGoalModal();

function showModal(id) { const el = $(id); if (!el) return; el.classList.remove('hidden'); el.classList.add('flex'); }
function hideModal(id) { const el = $(id); if (!el) return; el.classList.add('hidden'); el.classList.remove('flex'); }
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => hideModal(b.dataset.close));
document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) hideModal(m.id); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => hideModal(m.id)); });

function goTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  $('panel-' + tab)?.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  closeSidebar();
  const renders = { dashboard: renderDashboard, shared: renderShared, assistant: renderChat, automations: () => {}, activities: renderActivities, hourly: renderHourly, tasks: renderTasks, today: renderToday, schedule: renderSchedule, vault: renderVault, financials: renderFinancials, goals: renderGoals, skills: renderSkills, handoffs: renderHandoffs, games: renderGames, history: renderHistory };
  renders[tab]?.();
  setTimeout(startCountdownTicker, 50);
}
document.querySelectorAll('.nav-link').forEach(a => a.onclick = () => goTab(a.dataset.tab));
document.querySelectorAll('.nav-jump').forEach(b => b.onclick = () => goTab(b.dataset.tab));
function initSubtabs() {
  document.querySelectorAll('[data-subgroup]').forEach(g => {
    const subs = g.querySelectorAll('.subtab');
    subs.forEach(st => st.onclick = () => {
      subs.forEach(x => x.classList.remove('active')); st.classList.add('active');
      const gn = g.dataset.subgroup;
      document.querySelectorAll(`[id^="subpanel-${gn}-"]`).forEach(p => p.classList.remove('active'));
      const t = $(`subpanel-${st.dataset.subtab}`); if (t) t.classList.add('active');
      if (gn === 'hr') renderHourly();
    });
  });
}
document.querySelectorAll('[data-goto-game]').forEach(c => c.onclick = () => { const t = document.querySelector(`[data-subtab="game-${c.dataset.gotoGame}"]`); if (t) t.click(); });
document.querySelectorAll('.td-tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.td-tab').forEach(x => { x.className = 'td-tab px-6 py-2.5 rounded-full glass font-semibold text-[12.5px] text-slate-300'; x.style.background = ''; });
  b.className = 'td-tab px-6 py-2.5 rounded-full font-semibold text-[12.5px] text-white';
  b.style.background = b.dataset.kind === 'truth' ? 'linear-gradient(135deg,#38bdf8,#0284c7)' : 'linear-gradient(135deg,#fb7185,#e11d48)';
  loadTD(b.dataset.kind);
});
function openSidebar() { $('sidebar').classList.remove('-translate-x-full'); $('backdrop').classList.remove('hidden'); }
function closeSidebar() { $('sidebar').classList.add('-translate-x-full'); $('backdrop').classList.add('hidden'); }
if ($('menuBtn')) $('menuBtn').onclick = openSidebar;
if ($('backdrop')) $('backdrop').onclick = closeSidebar;
if ($('themeBtn')) $('themeBtn').onclick = () => {
  const isDark = document.documentElement.classList.toggle('dark');
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  $('themeBtn').innerHTML = isDark ? '<i class="fa-solid fa-moon"></i><span class="md:hidden lg:inline"> Theme</span>' : '<i class="fa-solid fa-sun"></i><span class="md:hidden lg:inline"> Theme</span>';
  setTimeout(() => renderDashboard(), 80);
};
if ($('refreshBtn')) $('refreshBtn').onclick = () => { renderAll(); toast('Refreshed.', 'info'); };
if ($('addTaskBtn')) $('addTaskBtn').onclick = () => openTaskModal();
if ($('addEventBtn')) $('addEventBtn').onclick = () => openEventModal();
if ($('taskSearch')) $('taskSearch').oninput = renderTasks;
if ($('taskFilter')) $('taskFilter').onchange = renderTasks;
if ($('genActivitiesBtn')) $('genActivitiesBtn').onclick = generateActivities;
if ($('aiInsightRefresh')) $('aiInsightRefresh').onclick = loadAiInsight;
if ($('weeklyReviewBtn')) $('weeklyReviewBtn').onclick = runWeekReview;
if ($('weekReviewBtn2')) $('weekReviewBtn2').onclick = runWeekReview;
if ($('weeklyGoalsBtn')) $('weeklyGoalsBtn').onclick = runWeeklyGoals;
if ($('autoScheduleBtn')) $('autoScheduleBtn').onclick = runAutoSchedule;
if ($('aiScheduleBtn')) $('aiScheduleBtn').onclick = runAutoSchedule;
if ($('breakdownBtn')) $('breakdownBtn').onclick = openBreakdownModal;
if ($('breakdownBtn2')) $('breakdownBtn2').onclick = () => { const id = $('taskEditId').value; if (id) { hideModal('taskModal'); setTimeout(openBreakdownModal, 200); } else openBreakdownModal(); };
if ($('moodBoostBtn')) $('moodBoostBtn').onclick = runMoodBoost;
if ($('journalBtn')) $('journalBtn').onclick = runJournal;
if ($('prioritizeTasksBtn')) $('prioritizeTasksBtn').onclick = () => runPriorityAdvisor('tasks');
if ($('prioritizeGoalsBtn')) $('prioritizeGoalsBtn').onclick = () => runPriorityAdvisor('goals');
if ($('priorityAdvisorBtn')) $('priorityAdvisorBtn').onclick = () => runPriorityAdvisor('all');
if ($('tttNewBtn')) $('tttNewBtn').onclick = newTTTMatch;
if ($('c4NewBtn')) $('c4NewBtn').onclick = newC4Match;
if ($('memNewBtn')) $('memNewBtn').onclick = newMemoryGame;
if ($('rpsNewBtn')) $('rpsNewBtn').onclick = newRPSRound;
if ($('diceRollBtn')) $('diceRollBtn').onclick = rollDice;
if ($('wdNewBtn')) $('wdNewBtn').onclick = newWordDuel;
if ($('q20NewBtn')) $('q20NewBtn').onclick = newQ20;
if ($('triviaNewBtn')) $('triviaNewBtn').onclick = newTrivia;
if ($('tdNewBtn')) $('tdNewBtn').onclick = () => loadTD(state.tdKind);
if ($('promptsNewBtn')) $('promptsNewBtn').onclick = loadPrompts;

async function newTrivia() { await loadTrivia(); }

document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === 'n' || e.key === 'N') { if (state.user) { e.preventDefault(); openTaskModal(); } }
  if (e.key === 'c' || e.key === 'C') { if (state.user && !state.chatPanelOpen && !isMobile()) toggleChatPanel(); }
});

window.addEventListener('resize', () => {
  if (!state.user) return;
  if (isMobile()) { $('mobileAppShell').style.display = 'grid'; $('desktopShell').classList.add('hidden'); renderMobileDashboard(); renderMobileTasks(); renderMobileTodos(); renderMobileGoals(); renderMobileVault(); }
  else { $('desktopShell').classList.remove('hidden'); $('mobileAppShell').style.display = 'none'; document.body.classList.remove('mobile-game-open'); }
  const bar = document.getElementById('mobileReturnBar');
  if (bar && !document.body.classList.contains('mobile-game-open')) bar.remove();
});

initSubtabs();
initHistoryFilters();
updateSyncBanner();
window.__avState = state;
window.__avDebug = () => ({
  uid: window.__avState.user?.uid,
  todos: window.__avState.todos,
  profile: window.__avState.profile,
});

console.log('âœ… Viora Track v7.3 booted â€” org-scoped track paths, shared /users with index.html');
