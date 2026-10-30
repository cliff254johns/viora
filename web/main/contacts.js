// main/contacts.js
// ═══════════════════════════════════════════════════════════════
// VIORA — Contact & Communication domain module  (hardened + perf-tuned)
//
// Owns:
//   • The universal contactButtons() renderer
//   • getEntityById() — polymorphic contact lookup
//   • The comm modal (WhatsApp / Email compose)
//   • The comm log renderer + full-preview modal
//   • The outbound send path (sendComm)
//
// Contract: main.js calls initContacts({...}) once, before
// initClients({...}) and before any other module that renders
// contact buttons.
// ═══════════════════════════════════════════════════════════════

let _deps = null;
let _bound = false;

/* Module-level flags (never stored on state — must not persist). */
let _commSendInFlight = false;

const EMPTY_ARR = Object.freeze([]);

export function initContacts(deps) {
  _deps = deps || {};
  if (!_bound) {
    Object.assign(window, {
      contactButtons,
      getEntityById,
      openCommModal,
      switchCommChannel,
      buildTemplates,
      updateCommPreview,
      sendComm,
      renderCommunications,
      openCommFullPreview,
    });
    _bound = true;
  }
  return _deps;
}

/* ── Null-safe shortcut accessors ── */
const $          = (id) => { const f = _deps && _deps.$; return f ? f(id) : document.getElementById(id); };
const S          = ()   => (_deps && _deps.state) || null;
const toast      = (m, t) => { const f = _deps && _deps.toast; if (f) f(m, t); };
const timeAgo    = (t)  => (_deps && _deps.timeAgo) ? _deps.timeAgo(t) : '';
const normalizePhone = (p) => (_deps && _deps.normalizePhone) ? _deps.normalizePhone(p) : String(p || '').replace(/[^\d+]/g, '');
const escapeHtml = (s) => (_deps && _deps.escapeHtml) ? _deps.escapeHtml(s) : defaultEscape(s);

function defaultEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function dataArr(key) {
  const s = _deps && _deps.state;
  const d = s && s.data;
  const v = d && d[key];
  return Array.isArray(v) ? v : EMPTY_ARR;
}

/* ═══════════════════════════════════════════════════════════
   CONTACT BUTTONS
   ═══════════════════════════════════════════════════════════ */
export function contactButtons(entity, entityType = 'client') {
  if (!entity) return '';
  const phone = entity.phone || entity.phoneAlt || '';
  const email = entity.email || '';
  const id    = escapeHtml(entity.id || '');
  const eType = escapeHtml(entityType);
  const waDisabled = phone ? '' : ' disabled';
  const emDisabled = email ? '' : ' disabled';
  return (
    '<span class="contact-actions">' +
      '<button class="wa-btn" data-action="wa" data-entity-type="' + eType + '" data-entity-id="' + id + '"' + waDisabled + '><i class="fa-brands fa-whatsapp"></i></button>' +
      '<button class="em-btn" data-action="em" data-entity-type="' + eType + '" data-entity-id="' + id + '"' + emDisabled + '><i class="fa-solid fa-envelope"></i></button>' +
    '</span>'
  );
}

export function getEntityById(type, id) {
  if (!type || !id) return null;

  if (type === 'client' || type === 'employee') {
    const arr = dataArr('entities');
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e && e.id === id) return e;
    }
    return null;
  }
  if (type === 'lead') {
    const arr = dataArr('leads');
    for (let i = 0; i < arr.length; i++) {
      const l = arr[i];
      if (l && l.id === id) return l;
    }
    return null;
  }
  if (type === 'vendor') {
    /* Vendors are historically stored inside the expenses list; fall back
       to a dedicated `vendors` list if one exists. */
    const exp = dataArr('expenses');
    for (let i = 0; i < exp.length; i++) {
      const e = exp[i];
      if (e && e.id === id) return e;
    }
    const vend = dataArr('vendors');
    for (let i = 0; i < vend.length; i++) {
      const v = vend[i];
      if (v && v.id === id) return v;
    }
    return null;
  }
  return null;
}

/* Delegated contact-button clicks — installed once. */
(function installContactButtonDelegate() {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest && ev.target.closest('.contact-actions [data-action]');
    if (!btn || btn.disabled) return;
    const act = btn.getAttribute('data-action');
    const id  = btn.getAttribute('data-entity-id');
    const et  = btn.getAttribute('data-entity-type');
    if (!act || !id || !et) return;
    if (act === 'wa' || act === 'em') {
      // Open directly in the requested channel — avoid the double
      // switchCommChannel call that used to flash the WA panel first.
      openCommModal(et, id, act === 'wa' ? 'wa' : 'em');
    }
  }, { passive: true });
})();

/* ═══════════════════════════════════════════════════════════
   COMM MODAL — compose WhatsApp / Email
   ═══════════════════════════════════════════════════════════ */
export function openCommModal(entityType, entityId, preferredChannel) {
  const entity = getEntityById(entityType, entityId);
  if (!entity) { toast('Contact not found.', 'error'); return; }

  const name = entity.name || entity.fullName || entity.vendor || 'Contact';
  const phone = entity.phone || entity.phoneAlt || entity.vendorPhone || '';
  const email = entity.email || entity.vendorEmail || '';
  const subtitle = entity.company || entity.clientType || entity.designation || entity.category || '';

  const st = S();
  if (st) st.commTarget = { entityType, entityId, name, phone, email, subtitle };

  const recHost = $('commRecipient');
  if (recHost) {
    const avatar = entity.avatar
      ? '<img src="' + escapeHtml(entity.avatar) + '">'
      : escapeHtml(name.charAt(0));
    // Build the meta line without a leading " · " when subtitle is empty.
    const metaBits = [];
    if (subtitle) metaBits.push(escapeHtml(subtitle));
    if (phone)    metaBits.push(escapeHtml(phone));
    if (email)    metaBits.push(escapeHtml(email));
    recHost.innerHTML =
      '<div class="avatar-mini lg">' + avatar + '</div>' +
      '<div class="info">' +
        '<div class="name">' + escapeHtml(name) + '</div>' +
        '<div class="meta">' + metaBits.join(' · ') + '</div>' +
      '</div>';
  }

  const waPhoneEl = $('commWaPhone');     if (waPhoneEl)   waPhoneEl.value = phone || '';
  const emToEl    = $('commEmTo');        if (emToEl)      emToEl.value = email || '';
  const emSubEl   = $('commEmSubject');   if (emSubEl)     emSubEl.value = '';
  const waMsgEl   = $('commWaMessage');   if (waMsgEl)     waMsgEl.value = '';
  const emMsgEl   = $('commEmMessage');   if (emMsgEl)     emMsgEl.value = '';

  buildTemplates(entityType, name);
  switchCommChannel(preferredChannel === 'em' ? 'em' : 'wa');
  updateCommPreview();
  const open = _deps && _deps.openModal;
  if (open) open('commModal');
}

export function switchCommChannel(ch) {
  const st = S();
  if (st) st.commChannel = ch;
  const tabWa = $('commTabWa'); if (tabWa) tabWa.classList.toggle('active', ch === 'wa');
  const tabEm = $('commTabEm'); if (tabEm) tabEm.classList.toggle('active', ch === 'em');
  const panelWa = $('commWaPanel'); if (panelWa) panelWa.style.display = ch === 'wa' ? 'block' : 'none';
  const panelEm = $('commEmPanel'); if (panelEm) panelEm.style.display = ch === 'em' ? 'block' : 'none';
  updateCommPreview();
}

export function buildTemplates(entityType, name) {
  const firstName = (name || 'there').split(' ')[0];
  const phone = (_deps && _deps.SENDER_PHONE) || '';

  const waTemplates = [
    { label: '👋 Greeting',        text: 'Hello ' + firstName + ", this is VIORA Intercollective. Hope you're doing well." },
    { label: '💰 Fee reminder',    text: 'Hello ' + firstName + ', this is a friendly reminder that your outstanding balance with VIORA is due.' },
    { label: '📄 Invoice sent',    text: 'Hello ' + firstName + ', please find your latest invoice from VIORA.' },
    { label: '✅ Payment received', text: 'Hello ' + firstName + ', we confirm receipt of your payment. Thank you!' },
    { label: '📅 Meeting reminder', text: 'Hello ' + firstName + ', this is a reminder of our appointment with VIORA. Please let us know if you need to reschedule.' },
  ];
  const emTemplates = [
    { label: '👋 Greeting',        subject: 'Hello from VIORA',              text: 'Dear ' + firstName + ',\n\nHope this message finds you well.\n\n— VIORA Intercollective\n' + phone },
    { label: '💰 Fee reminder',    subject: 'Reminder: Outstanding Balance', text: 'Dear ' + firstName + ',\n\nThis is a friendly reminder regarding your outstanding balance.\n\n— VIORA Intercollective' },
    { label: '📄 Invoice',         subject: 'Invoice from VIORA',            text: 'Dear ' + firstName + ',\n\nPlease find your latest invoice from VIORA Intercollective.\n\n— VIORA Intercollective' },
  ];

  const waHost = $('commWaTemplates');
  if (waHost) {
    let html = '';
    for (let i = 0; i < waTemplates.length; i++) {
      const t = waTemplates[i];
      html += '<span class="chip" data-tpl="wa" data-idx="' + i + '" data-text="' + escapeHtml(t.text) + '">' + t.label + '</span>';
    }
    waHost.innerHTML = html;
  }

  const emHost = $('commEmTemplates');
  if (emHost) {
    let html = '';
    for (let i = 0; i < emTemplates.length; i++) {
      const t = emTemplates[i];
      html += '<span class="chip" data-tpl="em" data-idx="' + i + '" data-subject="' + escapeHtml(t.subject) + '" data-text="' + escapeHtml(t.text) + '">' + t.label + '</span>';
    }
    emHost.innerHTML = html;
  }
}

/* Delegated chip clicks — installed once. */
(function installTemplateChipDelegate() {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (ev) => {
    const chip = ev.target.closest && ev.target.closest('.chip[data-tpl]');
    if (!chip) return;
    const kind = chip.getAttribute('data-tpl');
    const text = chip.getAttribute('data-text') || '';
    if (kind === 'wa') {
      const el = $('commWaMessage');
      if (el) { el.value = text; updateCommPreview(); }
    } else if (kind === 'em') {
      const subj = chip.getAttribute('data-subject') || '';
      const sEl = $('commEmSubject'); if (sEl) sEl.value = subj;
      const mEl = $('commEmMessage'); if (mEl) mEl.value = text;
      updateCommPreview();
    }
  }, { passive: true });
})();

export function updateCommPreview() {
  const host = $('commPreview');
  if (!host) return;
  const st = S();
  const ch = (st && st.commChannel) || 'wa';
  if (ch === 'wa') {
    const phoneEl = $('commWaPhone');
    const msgEl   = $('commWaMessage');
    const phone = (phoneEl && phoneEl.value) || '—';
    const msg   = (msgEl && msgEl.value) || '(empty message)';
    host.innerHTML = '<strong>WhatsApp to ' + escapeHtml(phone) + '</strong>\n\n' + escapeHtml(msg);
  } else {
    const toEl  = $('commEmTo');
    const subEl = $('commEmSubject');
    const msgEl = $('commEmMessage');
    const to   = (toEl && toEl.value) || '—';
    const subj = (subEl && subEl.value) || '(no subject)';
    const msg  = (msgEl && msgEl.value) || '(empty message)';
    host.innerHTML = '<strong>Email to ' + escapeHtml(to) + '</strong>\n<strong>Subject:</strong> ' + escapeHtml(subj) + '\n\n' + escapeHtml(msg);
  }
}

export async function sendComm() {
  const st = S();
  const target = st && st.commTarget;
  if (!target) return;
  if (_commSendInFlight) { toast('Message already sending…', 'warning'); return; }
  _commSendInFlight = true;

  const channel = (st && st.commChannel) || 'wa';
  const logComm = _deps && _deps.logComm;
  const logActivity = _deps && _deps.logActivity;
  const callFn = _deps && _deps.callFn;
  const closeModal = _deps && _deps.closeModal;
  const dedupe = 'manual|' + target.entityId + '|' + Date.now();

  try {
    if (channel === 'wa') {
      const phoneEl = $('commWaPhone');
      const msgEl   = $('commWaMessage');
      // Trust the field if it exists (even if empty — user may want to clear it).
      const rawPhone = phoneEl ? phoneEl.value.trim() : (target.phone || '');
      const msg = (msgEl && msgEl.value.trim()) || '';
      const phone = normalizePhone(rawPhone);
      if (!phone) { toast('No valid phone number.', 'error'); return; }
      if (!msg)   { toast('Please write a message.', 'error'); return; }

      let sent = false;
      if (callFn) {
        try {
          const res = await callFn('sendWhatsApp', {
            to: phone, message: msg,
            recipientId: target.entityId, recipientName: target.name,
          });
          if (logComm) {
            try {
              await logComm('wa', target.entityId, target.name, rawPhone, '', msg, {
                transport: (res && res.transport) || 'whatsapp-business-api',
                waMessageId: (res && res.waMessageId) || null,
                status: 'sent',
                dedupeKey: dedupe,
              });
            } catch (e) { console.warn('[contacts] wa log failed', e); }
          }
          toast('WhatsApp sent.', 'success');
          sent = true;
        } catch (e) {
          console.warn('[contacts] WhatsApp API failed, falling back to wa.me', e);
        }
      }

      if (!sent) {
        // NOTE: this runs after an await, so popup blockers may swallow it.
        const win = window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank', 'noopener,noreferrer');
        if (logComm) {
          try {
            await logComm('wa', target.entityId, target.name, rawPhone, '', msg, {
              transport: 'wa.me-fallback',
              dedupeKey: dedupe,
            });
          } catch (e) { console.warn('[contacts] wa fallback log failed', e); }
        }
        if (win) toast('WhatsApp opened.', 'success');
        else     toast('Popup blocked — allow popups for this site and try again.', 'warning');
      }

      if (logActivity) try { await logActivity('send', 'WhatsApp sent', target.name); } catch (e) {}
    } else {
      const toEl  = $('commEmTo');
      const subEl = $('commEmSubject');
      const msgEl = $('commEmMessage');
      const email = toEl ? toEl.value.trim() : (target.email || '');
      const subject = (subEl && subEl.value.trim()) || 'Message from VIORA';
      const msg = (msgEl && msgEl.value.trim()) || '';
      if (!email) { toast('No email on file.', 'error'); return; }
      if (!msg)   { toast('Please write a message.', 'error'); return; }

      let sent = false;
      if (callFn) {
        try {
          // Normalize CRLF before splitting into paragraphs.
          const normalized = msg.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          const html = normalized.split('\n').map((l) => '<p>' + escapeHtml(l) + '</p>').join('');
          const res = await callFn('sendEmail', { to: email, subject, html });
          if (logComm) {
            try {
              await logComm('em', target.entityId, target.name, email, subject, msg, {
                transport: (res && res.transport) || 'resend',
                emailId: (res && res.emailId) || null,
                status: 'sent',
                dedupeKey: dedupe,
              });
            } catch (e) { console.warn('[contacts] email log failed', e); }
          }
          toast('Email sent.', 'success');
          sent = true;
        } catch (e) {
          console.warn('[contacts] Email API failed, falling back to mailto', e);
        }
      }

      if (!sent) {
        // Use an anchor click rather than window.location.href so the SPA doesn't navigate away.
        const a = document.createElement('a');
        a.href = 'mailto:' + encodeURIComponent(email) +
          '?subject=' + encodeURIComponent(subject) +
          '&body=' + encodeURIComponent(msg);
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (logComm) {
          try {
            await logComm('em', target.entityId, target.name, email, subject, msg, { transport: 'mailto-fallback' });
          } catch (e) { console.warn('[contacts] mailto log failed', e); }
        }
        toast('Email opened.', 'success');
      }

      if (logActivity) try { await logActivity('send', 'Email sent', target.name); } catch (e) {}
    }

    if (st && st.currentTab === 'communications') renderCommunications();
    if (closeModal) closeModal('commModal');
  } finally {
    _commSendInFlight = false;
  }
}

/* ═══════════════════════════════════════════════════════════
   COMM LOG RENDERER
   ═══════════════════════════════════════════════════════════ */
export function renderCommunications() {
  try {
    const list = dataArr('commLog');
    const now = Date.now();
    const WEEK = 7 * 86400000;

    /* Single pass for stats. */
    let total = 0, wa = 0, em = 0, week = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c) continue;
      total++;
      if (c.channel === 'wa') wa++;
      else if (c.channel === 'em') em++;
      if (c.timestamp) {
        const t = Date.parse(c.timestamp);
        if (Number.isFinite(t) && now - t < WEEK) week++;
      }
    }

    const el = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    el('commTotal', total);
    el('commWa', wa);
    el('commEm', em);
    el('commWeek', week);

    const navBadge = $('commNavBadge');
    if (navBadge) {
      if (week > 0) { navBadge.textContent = week; navBadge.style.display = 'inline-block'; }
      else navBadge.style.display = 'none';
    }

    const searchEl = $('commSearch');
    const searchTerm = searchEl ? searchEl.value.toLowerCase().trim() : '';
    const filterEl = $('commFilter');
    const channelFilter = (filterEl && filterEl.value) || 'all';

    /* Single-pass filter with dedupe. */
    const seenKeys = new Set();
    const filtered = [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c) continue;
      if (channelFilter !== 'all' && c.channel !== channelFilter) continue;
      if (searchTerm) {
        const rn  = (c.recipientName    || '').toLowerCase();
        const msg = (c.message          || '').toLowerCase();
        const sub = (c.subject          || '').toLowerCase();
        if (!rn.includes(searchTerm) && !msg.includes(searchTerm) && !sub.includes(searchTerm)) {
          continue;
        }
      }
      if (c._dedupeKey) {
        if (seenKeys.has(c._dedupeKey)) continue;
        seenKeys.add(c._dedupeKey);
      }
      filtered.push(c);
    }

    const host = $('commLogList');
    if (!host) return;
    if (!filtered.length) {
      host.innerHTML = '<div class="empty-state">No messages yet.</div>';
      return;
    }

    const limit = filtered.length > 100 ? 100 : filtered.length;
    let html = '';
    for (let i = 0; i < limit; i++) {
      const cm = filtered[i];
      const message = cm.message || '';
      const dupCount = (cm._duplicateCount || 1) - 1;
      const dupBadge = dupCount > 0
        ? ' <span class="badge badge-gray" style="font-size:.6rem;opacity:.7;" title="Suppressed ' + dupCount + ' duplicate log(s)">×' + cm._duplicateCount + '</span>'
        : '';
      const iconClass = cm.channel === 'wa' ? 'fa-brands fa-whatsapp' : 'fa-solid fa-envelope';
      const inBadge = cm.direction === 'inbound'
        ? ' <span class="badge badge-active" style="font-size:9px;">IN</span>'
        : '';
      const subjectLine = cm.subject
        ? '<div style="font-size:.75rem;font-weight:600;color:var(--accent-blue);margin-top:2px;">' + escapeHtml(cm.subject) + '</div>'
        : '';
      const truncated = message.length > 120 ? message.slice(0, 120) : message;
      const preview = escapeHtml(truncated) + (message.length > 120 ? '…' : '');
      const idEsc = escapeHtml(cm.id || '');

      html +=
        '<div class="comm-log-item ' + cm.channel + '" data-comm-id="' + idEsc + '" style="cursor:pointer;" title="Click to view full message">' +
          '<div class="comm-icon"><i class="' + iconClass + '"></i></div>' +
          '<div class="comm-info">' +
            '<div class="to">' + escapeHtml(cm.recipientName || '') +
              ' <span style="font-weight:400;color:var(--text-secondary);font-size:.75rem;">· ' + escapeHtml(cm.recipientContact || '') + '</span>' +
              inBadge + dupBadge +
            '</div>' +
            subjectLine +
            '<div class="preview">' + preview + '</div>' +
          '</div>' +
          '<div class="comm-time">' + timeAgo(cm.timestamp) + '</div>' +
        '</div>';
    }
    host.innerHTML = html;
  } catch (e) {
    console.warn('[contacts] renderCommunications failed', e);
  }
}

/* Delegated comm-list clicks — installed once. */
(function installCommListDelegate() {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (ev) => {
    const row = ev.target.closest && ev.target.closest('.comm-log-item[data-comm-id]');
    if (!row) return;
    const id = row.getAttribute('data-comm-id');
    if (id) openCommFullPreview(id);
  }, { passive: true });
})();

/* ═══════════════════════════════════════════════════════════
   Full communications preview modal
   ═══════════════════════════════════════════════════════════ */
export function openCommFullPreview(commId) {
  let entry = null;
  const list = dataArr('commLog');
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].id === commId) { entry = list[i]; break; }
  }
  if (!entry) { toast('Communication not found.', 'error'); return; }

  let modal = document.getElementById('commPreviewModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'commPreviewModal';
    modal.innerHTML =
      '<div class="modal" style="max-width:640px;">' +
        '<h2>' +
          '<span class="modal-icon" style="background:var(--accent-purple);">' +
            '<i class="fa-solid fa-comment-dots"></i>' +
          '</span>' +
          '<span id="commPreviewTitle">Message</span>' +
        '</h2>' +
        '<div id="commPreviewMeta" style="padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-input);margin-bottom:14px;font-size:.82rem;"></div>' +
        '<div id="commPreviewSubjectWrap" style="display:none;margin-bottom:10px;">' +
          '<div style="font-size:.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700;letter-spacing:.5px;margin-bottom:4px;">Subject</div>' +
          '<div id="commPreviewSubject" style="padding:10px 12px;background:var(--bg-card-solid);border-radius:8px;font-weight:600;color:var(--accent-blue);"></div>' +
        '</div>' +
        '<div style="font-size:.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700;letter-spacing:.5px;margin-bottom:4px;">Body</div>' +
        '<div id="commPreviewBody" style="padding:14px;background:var(--bg-card-solid);border:1px solid var(--border-color);border-radius:10px;white-space:pre-wrap;font-size:.85rem;line-height:1.6;max-height:340px;overflow-y:auto;"></div>' +
        '<div id="commPreviewFooter" style="margin-top:14px;"></div>' +
        '<div class="form-actions" style="margin-top:20px;flex-wrap:wrap;gap:8px;">' +
          '<button type="button" class="btn btn-outline" data-comm-act="close">Close</button>' +
          '<button type="button" class="btn btn-primary" data-comm-act="copy"><i class="fa-solid fa-copy"></i> Copy body</button>' +
          '<button type="button" class="btn btn-success" data-comm-act="resend"><i class="fa-solid fa-rotate-right"></i> Resend</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) { modal.classList.remove('active'); return; }
      const btn = e.target.closest && e.target.closest('[data-comm-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-comm-act');
      const id = modal.dataset.commId;
      if (act === 'close') { modal.classList.remove('active'); return; }
      if (!id) return;
      if (act === 'copy')   _copyCommBody(id);
      if (act === 'resend') _resendComm(id, modal);
    });
  }

  /* Populate modal */
  modal.dataset.commId = commId;
  modal.querySelector('#commPreviewTitle').textContent =
    entry.channel === 'wa' ? 'WhatsApp message' : 'Email message';

  const recipientName    = escapeHtml(entry.recipientName || '—');
  const recipientContact = escapeHtml(entry.recipientContact || '—');
  const channel   = entry.channel === 'wa' ? 'WhatsApp' : 'Email';
  const direction = entry.direction === 'inbound' ? 'Inbound' : 'Outbound';
  const when      = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—';
  const transport = escapeHtml(entry.transport || '—');
  const status    = escapeHtml(entry.status || 'local');
  const sentBy    = escapeHtml(entry.sentBy || 'System');
  const dupCount  = (entry._duplicateCount || 1) - 1;

  modal.querySelector('#commPreviewMeta').innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
      '<div><span style="color:var(--text-secondary);">To:</span> <strong>' + recipientName + '</strong></div>' +
      '<div><span style="color:var(--text-secondary);">Contact:</span> ' + recipientContact + '</div>' +
      '<div><span style="color:var(--text-secondary);">Channel:</span> <strong>' + channel + '</strong></div>' +
      '<div><span style="color:var(--text-secondary);">Direction:</span> ' + direction + '</div>' +
      '<div><span style="color:var(--text-secondary);">Sent:</span> ' + escapeHtml(when) + '</div>' +
      '<div><span style="color:var(--text-secondary);">By:</span> ' + sentBy + '</div>' +
      '<div><span style="color:var(--text-secondary);">Transport:</span> ' + transport + '</div>' +
      '<div><span style="color:var(--text-secondary);">Status:</span> ' + status + '</div>' +
    '</div>';

  const subjWrap = modal.querySelector('#commPreviewSubjectWrap');
  if (entry.subject) {
    subjWrap.style.display = 'block';
    modal.querySelector('#commPreviewSubject').textContent = entry.subject;
  } else {
    subjWrap.style.display = 'none';
  }

  const bodyEl = modal.querySelector('#commPreviewBody');
  bodyEl.textContent = entry.message || '(no body)';
  bodyEl.scrollTop = 0;  // reset scroll when switching messages

  const footer = modal.querySelector('#commPreviewFooter');
  const bits = [];
  if (dupCount > 0) {
    bits.push('<span style="color:var(--accent-gold);"><i class="fa-solid fa-clone"></i> ' + dupCount + ' duplicate send(s) suppressed</span>');
  }
  if (entry.reason) {
    bits.push('<span style="color:var(--text-secondary);">Reason: <code>' + escapeHtml(entry.reason) + '</code></span>');
  }
  if (entry.userMustClickSend) {
    bits.push('<span style="color:var(--accent-blue);"><i class="fa-solid fa-hand-pointer"></i> Composed in Gmail — you clicked Send manually</span>');
  }
  if (entry.automated) {
    bits.push('<span style="color:var(--accent-purple);"><i class="fa-solid fa-robot"></i> Automated message</span>');
  }
  footer.innerHTML = bits.length
    ? '<div style="display:flex;flex-direction:column;gap:6px;font-size:.75rem;">' + bits.join('') + '</div>'
    : '';

  modal.classList.add('active');
}

async function _copyCommBody(commId) {
  const entry = findComm(commId);
  if (!entry) { toast('Communication not found.', 'error'); return; }
  const text = entry.subject
    ? 'Subject: ' + entry.subject + '\n\n' + (entry.message || '')
    : (entry.message || '');
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard.', 'success');
  } catch (e) {
    toast('Copy failed.', 'error');
  }
}

async function _resendComm(commId, modal) {
  const entry = findComm(commId);
  if (!entry) { toast('Communication not found.', 'error'); return; }

  if (entry.channel === 'wa' && entry.recipientContact) {
    const url = 'https://wa.me/' + normalizePhone(entry.recipientContact) + '?text=' + encodeURIComponent(entry.message || '');
    window.open(url, '_blank', 'noopener,noreferrer');
  } else if (entry.channel === 'em' && entry.recipientContact) {
    const url =
      'https://mail.google.com/mail/?view=cm&fs=1' +
      '&to=' + encodeURIComponent(entry.recipientContact) +
      '&su=' + encodeURIComponent(entry.subject || '') +
      '&body=' + encodeURIComponent(entry.message || '');
    window.open(url, 'viora_resend_' + Date.now(),
      'noopener,noreferrer,width=780,height=820,left=600,top=60');
  } else {
    toast('No contact info for resend.', 'warning');
    return;
  }

  const logComm = _deps && _deps.logComm;
  if (logComm) {
    try {
      await logComm(
        entry.channel,
        entry.recipientId || null,
        entry.recipientName || '',
        entry.recipientContact,
        entry.subject || '',
        entry.message || '',
        {
          reason: (entry.reason || 'resend') + '-resend',
          transport: entry.channel === 'wa' ? 'wa.me-manual' : 'gmail-compose-manual',
          userMustClickSend: true,
          dedupeKey: 'resend|' + entry.id + '|' + Date.now(),
        }
      );
    } catch (e) { console.warn('[contacts] resend log failed', e); }
  }

  modal.classList.remove('active');
  toast('Compose window opened. Review and click Send.', 'success');
  const st = S();
  if (st && st.currentTab === 'communications') renderCommunications();
}

function findComm(id) {
  const list = dataArr('commLog');
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].id === id) return list[i];
  }
  return null;
}
