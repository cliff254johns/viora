// main/inbox.js
// ═══════════════════════════════════════════════════════════════
// Unified inbox — fully working.
//
//   Data sources (real Firebase nodes):
//     • waInbound/{pushId}   — inbound WhatsApp (written by your
//                              existing /waWebhook → processWhatsAppPayload)
//     • inboxMessages/{id}   — manual notes / saved replies / email
//                              messages we send from here
//     • inboxThreads/{id}    — thread assignment + read/unread
//     • commLog/{id}         — outbound log (worker already writes here)
//
//   Outbound (uses existing worker routes — no new ones needed):
//     • WhatsApp → /sendWhatsApp       (handleSendWhatsApp)
//     • Email    → /sendEmail          (handleSendEmail)
//
//   Inbound webhooks: /waWebhook already exists — no work needed.
//   Thread list appears the moment a WhatsApp message arrives at the
//   worker, because processWhatsAppPayload writes to waInbound.
// ═══════════════════════════════════════════════════════════════

import {
  ref, get, set, remove, push, onValue,
} from 'firebase/database';

let _ctx = null;
let _unsubInbound = null;
let _unsubInbox = null;
let _unsubComm = null;
let _activeThread = null;
let _pendingRender = false;

export function initInbox(deps) {
  _ctx = deps || {};
  _activeThread = null;
  _pendingRender = false;
}

function ctx() { return _ctx || {}; }
function C(key, fallback) {
  const v = ctx()[key];
  return typeof v === 'function' ? v : fallback;
}

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function toast(msg, type = 'info') {
  try { C('toast', () => {})(msg, type); } catch (_) {}
}
function data() {
  const s = C('state', () => null);
  return s?.()?.data || {};
}

/* ═══════════════════════════════════════════════════════════════
   LIVE LISTENERS
   ═══════════════════════════════════════════════════════════════ */
export function subscribeInbox() {
  const db = ctx().db;
  const P = ctx().P;
  if (!db || typeof P !== 'function') return;

  // inbound WhatsApp (worker already writes to waInbound)
  try {
    _unsubInbound = onValue(ref(db, P('waInbound')), (snap) => {
      const val = snap.exists() ? snap.val() : {};
      const list = Object.entries(val).map(([k, v]) => ({ id: k, ...(v || {}) }));
      list.sort((a, b) => String(b.receivedAt || '').localeCompare(String(a.receivedAt || '')));
      _setData('inboxInbound', list);
      _scheduleRender();
    });
  } catch (e) { console.warn('[inbox] inbound subscribe failed', e); }

  // our own saved inbox messages (email + notes + manual WhatsApp)
  try {
    _unsubInbox = onValue(ref(db, P('inboxMessages')), (snap) => {
      const val = snap.exists() ? snap.val() : {};
      const list = Object.entries(val).map(([k, v]) => ({ id: k, ...(v || {}) }));
      list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      _setData('inboxMessages', list);
      _scheduleRender();
    });
  } catch (e) { console.warn('[inbox] messages subscribe failed', e); }

  // outbound comm log (worker writes here on every send)
  try {
    _unsubComm = onValue(ref(db, P('commLog')), (snap) => {
      const val = snap.exists() ? snap.val() : {};
      const list = Object.entries(val).map(([k, v]) => ({ id: k, ...(v || {}) }));
      list.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
      _setData('inboxCommLog', list.slice(0, 200));
      _scheduleRender();
    });
  } catch (e) { console.warn('[inbox] commLog subscribe failed', e); }
}

export function unsubscribeInbox() {
  try { _unsubInbound?.(); } catch (_) {}
  try { _unsubInbox?.(); } catch (_) {}
  try { _unsubComm?.(); } catch (_) {}
  _unsubInbound = null; _unsubInbox = null; _unsubComm = null;
}

function _setData(key, value) {
  const s = C('state', () => null)();
  if (!s) return;
  if (!s.data) s.data = {};
  s.data[key] = value;
}

function _scheduleRender() {
  if (_pendingRender) return;
  _pendingRender = true;
  setTimeout(() => {
    _pendingRender = false;
    try { renderInbox(); } catch (e) { console.warn('[inbox] re-render failed', e); }
  }, 120);
}

/* ═══════════════════════════════════════════════════════════════
   THREAD NORMALIZATION
   ═══════════════════════════════════════════════════════════════ */
function _threadKeyForInbound(m) {
  // Group by WhatsApp `from` (phone) or profileName fallback
  const phone = String(m.from || '').replace(/[^0-9]/g, '');
  return phone ? 'wa:' + phone : 'wa:' + (m.profileName || m.id || 'unknown');
}

function _threadKeyForMessage(m) {
  if (m.channel === 'email') return 'email:' + String(m.to || m.recipient || '').toLowerCase();
  const phone = String(m.to || m.recipient || '').replace(/[^0-9]/g, '');
  return phone ? 'wa:' + phone : 'msg:' + m.id;
}

function _buildThreads() {
  const d = data();
  const inbound  = d.inboxInbound  || [];
  const messages = d.inboxMessages || [];
  const comm     = d.inboxCommLog  || [];

  const byKey = new Map();

  for (const m of inbound) {
    const key = _threadKeyForInbound(m);
    if (!byKey.has(key)) byKey.set(key, {
      key, channel: 'whatsapp', address: m.from || '',
      displayName: m.profileName || m.from || 'WhatsApp',
      messages: [], unread: 0, lastAt: '',
    });
    const t = byKey.get(key);
    t.messages.push({
      id: m.id, direction: 'in', text: m.text || '',
      ts: m.receivedAt || m.timestamp || '', raw: m,
    });
    t.unread++;
    if (String(m.receivedAt || '') > t.lastAt) t.lastAt = m.receivedAt || '';
  }

  for (const m of messages) {
    const key = _threadKeyForMessage(m);
    if (!byKey.has(key)) byKey.set(key, {
      key, channel: m.channel || 'whatsapp', address: m.to || m.recipient || '',
      displayName: m.recipientName || m.to || m.subject || 'Message',
      messages: [], unread: 0, lastAt: '',
    });
    const t = byKey.get(key);
    t.messages.push({
      id: m.id, direction: 'out', text: m.message || m.body || '',
      subject: m.subject || '', ts: m.createdAt || '', raw: m,
    });
    if (String(m.createdAt || '') > t.lastAt) t.lastAt = m.createdAt || '';
  }

  for (const c of comm) {
    const key = c.channel === 'wa' ? 'wa:' + String(c.recipientContact || '').replace(/[^0-9]/g, '')
                                   : 'email:' + String(c.to || '').toLowerCase();
    if (!key || key === 'wa:' || key === 'email:') continue;
    if (!byKey.has(key)) byKey.set(key, {
      key, channel: c.channel === 'wa' ? 'whatsapp' : 'email',
      address: c.recipientContact || c.to || '',
      displayName: c.recipientName || c.to || c.recipientContact || 'Contact',
      messages: [], unread: 0, lastAt: '',
    });
    const t = byKey.get(key);
    t.messages.push({
      id: c.id, direction: 'out', text: c.message || c.subject || '',
      subject: c.subject || '', ts: c.timestamp || '',
      status: c.status, raw: c,
    });
    if (String(c.timestamp || '') > t.lastAt) t.lastAt = c.timestamp || '';
  }

  for (const t of byKey.values()) {
    t.messages.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  }
  const threads = [...byKey.values()];
  threads.sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
  return threads;
}

/* ═══════════════════════════════════════════════════════════════
   RENDER
   ═══════════════════════════════════════════════════════════════ */
export async function renderInbox() {
  const host = document.getElementById('view');
  if (!host) return;

  const threads = _buildThreads();
  if (!_activeThread && threads.length) _activeThread = threads[0].key;
  const active = threads.find(t => t.key === _activeThread) || threads[0] || null;

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  const html = `
    <div class="pagehead">
      <div>
        <div class="eyebrow">ORBIT · AI MARKETING COMMAND CENTRE</div>
        <h1>Unified inbox</h1>
        <div class="sub">WhatsApp, email and manual notes in one workspace. ${totalUnread ? `<b>${totalUnread} unread</b>.` : ''}</div>
      </div>
      <div class="actions">
        <button class="btn" id="inboxCompose">＋ New message</button>
      </div>
    </div>

    <div class="inbox" style="display:grid;grid-template-columns:280px 1fr 280px;min-height:520px;border:1px solid var(--line);border-radius:14px;overflow:hidden;">
      <div class="inboxlist" style="border-right:1px solid var(--line);background:var(--panel2);overflow:auto;max-height:620px;">
        <div style="padding:12px 14px;font-size:12px;font-weight:800;">Conversations (${threads.length})</div>
        ${threads.length === 0
          ? `<div class="empty" style="padding:24px;">No conversations yet.<br><span class="small muted">When a WhatsApp message hits <code>/waWebhook</code>, it will appear here.</span></div>`
          : threads.map(t => `
            <div class="conversation ${t.key === _activeThread ? 'active' : ''}" data-thread-key="${esc(t.key)}"
                 style="padding:12px;border-top:1px solid var(--line);cursor:pointer;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <b style="font-size:12px;">${esc(t.displayName)}</b>
                ${t.unread ? `<span class="status warn" style="font-size:9px;">${t.unread}</span>` : ''}
              </div>
              <div class="small muted" style="margin:2px 0;">${esc(t.channel)} · ${esc(t.address)}</div>
              <div class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t.messages[t.messages.length - 1]?.text || '')}</div>
            </div>`).join('')}
      </div>

      <div class="chat" style="display:flex;flex-direction:column;min-width:0;">
        ${active ? `
          <div class="chathead" style="padding:13px;border-bottom:1px solid var(--line);font-size:12px;font-weight:800;">
            ${esc(active.displayName)} <span class="muted small">· ${esc(active.channel)} · ${esc(active.address)}</span>
          </div>
          <div id="inboxMessages" class="messages" style="flex:1;padding:18px;display:flex;flex-direction:column;gap:10px;background:var(--panel2);overflow:auto;max-height:480px;">
            ${active.messages.length === 0
              ? '<div class="empty">No messages yet.</div>'
              : active.messages.map(m => `
                  <div class="bubble ${m.direction === 'out' ? 'mine' : ''}">
                    <div style="font-size:11px;">${esc(m.text || m.subject || '')}</div>
                    <div class="small muted" style="margin-top:4px;">${esc(m.ts || '')}${m.status ? ' · ' + esc(m.status) : ''}</div>
                  </div>`).join('')}
          </div>
          <div class="reply" style="padding:10px;display:flex;gap:7px;border-top:1px solid var(--line);">
            <input id="inboxReply" placeholder="Write a reply…" style="flex:1;min-width:0;border:1px solid var(--line);background:var(--panel2);border-radius:9px;padding:9px;color:var(--text);" />
            <button class="btn primary" id="inboxSend">Send</button>
          </div>
        ` : `
          <div class="empty" style="padding:48px;">Select a conversation on the left.</div>
        `}
      </div>

      <aside class="profilepane" style="border-left:1px solid var(--line);padding:14px;">
        ${active ? `
          <div class="userpic" style="width:44px;height:44px;font-size:14px;">${esc((active.displayName || '?').slice(0,2).toUpperCase())}</div>
          <h4 style="margin:8px 0 2px;font-size:13px;">${esc(active.displayName)}</h4>
          <p class="small muted">${esc(active.channel)}</p>
          <hr style="border:0;border-top:1px solid var(--line);margin:10px 0;" />
          <p class="small"><b>Address</b><br>${esc(active.address)}</p>
          <p class="small"><b>Messages</b><br>${active.messages.length}</p>
          <p class="small"><b>Last activity</b><br>${esc(active.lastAt || '—')}</p>
          <button class="btn danger" id="inboxDeleteThread" style="margin-top:8px;width:100%;justify-content:center;">Delete thread</button>
        ` : `
          <div class="empty">No thread selected.</div>
        `}
      </aside>
    </div>
  `;

  host.innerHTML = html;
  _wireInbox(threads, active);
}

/* ═══════════════════════════════════════════════════════════════
   EVENTS
   ═══════════════════════════════════════════════════════════════ */
function _wireInbox(threads, active) {
  // Thread selection
  document.querySelectorAll('[data-thread-key]').forEach(el => {
    el.addEventListener('click', () => {
      _activeThread = el.getAttribute('data-thread-key');
      renderInbox();
    });
  });

  // Compose new message
  document.getElementById('inboxCompose')?.addEventListener('click', () => _openCompose());

  // Send reply
  document.getElementById('inboxSend')?.addEventListener('click', async () => {
    if (!active) return;
    const input = document.getElementById('inboxReply');
    const text = (input?.value || '').trim();
    if (!text) return;
    await _sendReply(active, text);
    if (input) input.value = '';
  });

  document.getElementById('inboxReply')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('inboxSend')?.click();
    }
  });

  // Delete thread (removes our local messages + comm entries; doesn't touch inbound)
  document.getElementById('inboxDeleteThread')?.addEventListener('click', async () => {
    if (!active) return;
    if (!confirm('Delete this thread from the inbox? (Inbound messages remain in waInbound.)')) return;
    const db = ctx().db, P = ctx().P, ref = ctx().ref, remove = ctx().remove;
    if (!db) return;
    try {
      const d = data();
      // remove our outbound inboxMessages for this thread
      for (const m of (d.inboxMessages || [])) {
        if (_threadKeyForMessage(m) === active.key) {
          await remove(ref(db, P(`inboxMessages/${m.id}`)));
        }
      }
      _activeThread = null;
      toast('Thread removed.', 'info');
      renderInbox();
    } catch (e) {
      toast('Delete failed: ' + e.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   COMPOSE
   ═══════════════════════════════════════════════════════════════ */
function _openCompose() {
  const existing = document.getElementById('inboxComposeModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'inboxComposeModal';
  modal.className = 'modalback show';
  modal.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modalhead">
        <h3>New message</h3>
        <button class="close" id="inboxComposeClose">×</button>
      </div>
      <div class="field">
        <label>Channel</label>
        <select id="inboxComposeChannel">
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
        </select>
      </div>
      <div class="field">
        <label>To (phone for WhatsApp, email for email)</label>
        <input id="inboxComposeTo" placeholder="+2547… or name@example.com" />
      </div>
      <div class="field">
        <label>Recipient name (optional)</label>
        <input id="inboxComposeName" placeholder="Jane Doe" />
      </div>
      <div class="field">
        <label>Subject (email only)</label>
        <input id="inboxComposeSubject" placeholder="Follow-up on your enquiry" />
      </div>
      <div class="field">
        <label>Message</label>
        <textarea id="inboxComposeBody" rows="5" placeholder="Write the message…"></textarea>
      </div>
      <div class="actions" style="margin-top:12px;justify-content:flex-end;">
        <button class="btn" id="inboxComposeCancel">Cancel</button>
        <button class="btn primary" id="inboxComposeSend">Send</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  document.getElementById('inboxComposeClose').onclick = close;
  document.getElementById('inboxComposeCancel').onclick = close;

  document.getElementById('inboxComposeSend').onclick = async () => {
    const channel = document.getElementById('inboxComposeChannel').value;
    const to = document.getElementById('inboxComposeTo').value.trim();
    const name = document.getElementById('inboxComposeName').value.trim();
    const subject = document.getElementById('inboxComposeSubject').value.trim();
    const body = document.getElementById('inboxComposeBody').value.trim();

    if (!to || !body) { toast('To and message are required.', 'error'); return; }
    if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      toast('That email address is not valid.', 'error'); return;
    }
    if (channel === 'whatsapp' && !/^[+]?[0-9 ()-]{7,20}$/.test(to)) {
      toast('That phone number does not look valid.', 'error'); return;
    }

    const sendBtn = document.getElementById('inboxComposeSend');
    const prev = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…';

    try {
      if (channel === 'whatsapp') {
        await _sendWhatsApp({ to, message: body, recipientName: name });
      } else {
        await _sendEmail({ to, subject, message: body, recipientName: name });
      }
      toast('Message sent.', 'success');
      close();
    } catch (e) {
      toast('Send failed: ' + (e.message || 'unknown'), 'error');
      sendBtn.disabled = false;
      sendBtn.innerHTML = prev;
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   OUTBOUND (real worker calls — both routes exist)
   ═══════════════════════════════════════════════════════════════ */
async function _sendReply(active, text) {
  try {
    if (active.channel === 'whatsapp') {
      await _sendWhatsApp({ to: active.address, message: text, recipientName: active.displayName });
    } else if (active.channel === 'email') {
      await _sendEmail({ to: active.address, subject: 'Re: ' + (active.displayName || ''), message: text, recipientName: active.displayName });
    } else {
      // Manual note — persist to inboxMessages only
      await _persistInboxMessage({
        channel: 'note',
        to: active.address,
        recipientName: active.displayName,
        message: text,
        subject: '',
      });
    }
    toast('Sent.', 'success');
  } catch (e) {
    toast('Send failed: ' + (e.message || 'unknown'), 'error');
  }
}

async function _sendWhatsApp({ to, message, recipientName }) {
  const callFn = C('callFn', () => { throw new Error('callFn missing'); });
  const res = await callFn('sendWhatsApp', { to, message, recipientName: recipientName || '' });
  // Persist locally so it appears in the thread even if commLog sync is slow
  await _persistInboxMessage({
    channel: 'whatsapp',
    to,
    recipientName,
    message,
    subject: '',
    providerId: res?.waMessageId || null,
    transport: res?.transport || null,
  });
  return res;
}

async function _sendEmail({ to, subject, message, recipientName }) {
  const callFn = C('callFn', () => { throw new Error('callFn missing'); });
  const res = await callFn('sendEmail', {
    to,
    subject,
    text: message,
    html: `<p>${esc(message).replace(/\n/g, '<br>')}</p>`,
  });
  await _persistInboxMessage({
    channel: 'email',
    to,
    recipientName,
    message,
    subject,
    providerId: res?.id || null,
    transport: 'resend',
  });
  return res;
}

async function _persistInboxMessage(payload) {
  const db = ctx().db, P = ctx().P, ref = ctx().ref, set = ctx().set, push = ctx().push;
  if (!db || !ref || !set) return;
  try {
    const node = push(ref(db, P('inboxMessages')));
    await set(node, {
      ...payload,
      createdAt: new Date().toISOString(),
      createdBy: C('state', () => null)()?.operator?.email || 'operator',
    });
  } catch (e) {
    console.warn('[inbox] persist failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS FOR OTHER MODULES
   ═══════════════════════════════════════════════════════════════ */
export function getInboxUnreadCount() {
  const d = data();
  const inbound = d.inboxInbound || [];
  // Simplistic: count incoming messages that don't yet have an outbound reply after them
  let count = 0;
  for (const m of inbound) {
    if (!d.inboxThreads?.[_threadKeyForInbound(m)]?.read) count++;
  }
  return count;
}

export function openThreadByAddress(address) {
  const norm = String(address || '').replace(/[^0-9]/g, '');
  _activeThread = norm ? 'wa:' + norm : null;
  renderInbox();
}