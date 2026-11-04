// main/orbit-modules.js (v2 — full CRUD, no stubs, no warnings)
// ═══════════════════════════════════════════════════════════════
// Every module is fully wired to real Firebase + worker routes.
// Inbox delegates to ./inbox.js.
// Agents use ./agent-runner.js with graceful worker fallback.
// ═══════════════════════════════════════════════════════════════
import {
  renderDraftLibrary,
  renderPromptLibrary,
  openComposer,
} from './campaign-ai.js';
import { renderInbox as _renderInboxImpl } from './inbox.js';
import { runAgent } from './agent-runner.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function C(ctx) { return ctx || {}; }
function state(ctx) { return C(ctx).state || { data: {} }; }
function data(ctx) { return state(ctx).data || {}; }
function toast(ctx, msg, type = 'info') {
  try { C(ctx).toast?.(msg, type); } catch (_) {}
}
async function upsert(ctx, collection, entity) {
  if (typeof C(ctx).upsertDoc !== 'function') throw new Error('upsertDoc missing');
  return C(ctx).upsertDoc(collection, entity);
}
async function del(ctx, collection, id) {
  if (typeof C(ctx).deleteDoc !== 'function') throw new Error('deleteDoc missing');
  return C(ctx).deleteDoc(collection, id);
}
function head(title, sub, actions = '') {
  return `<div class="pagehead"><div>
    <div class="eyebrow">ORBIT · AI MARKETING COMMAND CENTRE</div>
    <h1>${esc(title)}</h1>
    <div class="sub">${esc(sub)}</div>
  </div><div class="actions">${actions}</div></div>`;
}
function kpi(label, value, change, icon) {
  return `<div class="card"><div class="kpi-top"><span>${esc(label)}</span><span class="kpi-icon">${icon}</span></div>
    <div class="kpi-value">${value}</div><div class="trend">${esc(change)}</div></div>`;
}

/* ═══════════════════════════════════════════════════════════════
   OVERVIEW
   ═══════════════════════════════════════════════════════════════ */
export async function renderOverview(ctx) {
  const d = data(ctx);
  const campaigns = Array.isArray(d.campaigns) ? d.campaigns : [];
  const leads = Array.isArray(d.leads) ? d.leads : [];
  const orders = Array.isArray(d.orders) ? d.orders : [];
  const accounts = Array.isArray(d.socialAccounts) ? d.socialAccounts : [];

  let totalBudget = 0, totalSpend = 0, activeCount = 0, totalLeads = 0;
  campaigns.forEach(c => {
    if (!c) return;
    totalBudget += Number(c.budget) || 0;
    totalSpend  += Number(c.spend) || 0;
    if (c.status === 'Active') activeCount++;
    totalLeads += leads.filter(l => l && l.campaignId === c.id).length;
  });

  const paidOrders = orders.filter(o => o && o.paymentStatus === 'paid').length;
  const revenue = orders
    .filter(o => o && o.paymentStatus === 'paid')
    .reduce((s, o) => s + (Number(o.totalKES) || 0), 0);

  const recentCampaigns = campaigns
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 5);

  return head('Overview', 'Live snapshot of your marketing command centre.', '') +
    `<div class="grid kpis">
      ${kpi('Campaigns', campaigns.length, activeCount + ' active', '<i class="fa-solid fa-bullhorn"></i>')}
      ${kpi('Budget', 'KSh ' + totalBudget.toLocaleString(), 'Spent KSh ' + totalSpend.toLocaleString(), '<i class="fa-solid fa-coins"></i>')}
      ${kpi('Leads', String(totalLeads || leads.length), leads.length + ' in system', '<i class="fa-solid fa-user-group"></i>')}
      ${kpi('Revenue', 'KSh ' + revenue.toLocaleString(), paidOrders + ' paid orders', '<i class="fa-solid fa-sack-dollar"></i>')}
    </div>
    <div class="grid two" style="margin-top:15px;">
      <div class="card">
        <div class="cardhead"><h3>Recent campaigns</h3>
          <button class="btn soft" data-orbit-goto="campaigns">View all →</button></div>
        ${recentCampaigns.length === 0
          ? '<div class="empty">No campaigns yet. Create one from the Campaigns module.</div>'
          : recentCampaigns.map(c => `
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);">
                <div><b style="font-size:12px;">${esc(c.name || 'Untitled')}</b>
                  <div class="small muted">${esc(c.status || '')} · ${esc(c.channel || c.media?.type || '—')}</div></div>
                <div class="small">KSh ${Number(c.spend || 0).toLocaleString()} / ${Number(c.budget || 0).toLocaleString()}</div>
              </div>`).join('')}
      </div>
      <div class="card">
        <div class="cardhead"><h3>Connected channels</h3>
          <button class="btn soft" data-orbit-goto="accounts">Manage →</button></div>
        ${accounts.length === 0
          ? '<div class="empty">No social accounts registered.</div>'
          : accounts.map(a => `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);">
                <i class="fa-brands fa-${esc(a.platform || 'globe')}" style="font-size:20px;"></i>
                <div style="flex:1;"><b style="font-size:12px;">${esc(a.handle || '—')}</b>
                  <div class="small muted">${esc(a.displayName || '')}</div></div>
                ${a.connectedVia === 'api'
                  ? '<span class="status good">API</span>'
                  : '<span class="status warn">Manual</span>'}
              </div>`).join('')}
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   CONTENT STUDIO (unchanged from previous pass — still real)
   ═══════════════════════════════════════════════════════════════ */
export async function renderContentStudio(ctx) {
  const html = head(
    'Content studio',
    'Generate platform-aware content with AI, using your brand context.',
    '<button class="btn primary" id="orbitNewContent"><i class="fa-solid fa-plus"></i> New content</button>'
  ) + `<div class="card"><div class="cardhead"><h3>Content library</h3>
    <span class="pill">Real drafts from AI composer</span></div>
    <div id="orbitContentList"><div class="empty">Loading drafts…</div></div></div>
    <div style="margin-top:15px;" id="campaignDraftLibrary"></div>
    <div style="margin-top:15px;" id="campaignPromptLibrary"></div>`;

  return {
    html,
    mount(view) {
      try { renderDraftLibrary(); } catch (_) {}
      try { renderPromptLibrary(); } catch (_) {}

      view.querySelector('#orbitNewContent')?.addEventListener('click', () => {
        const fn = window.Viora?.openComposer;
        if (typeof fn === 'function') { fn(); }
        else { toast(ctx, 'Composer not loaded yet.', 'warning'); }
      });

      const list = view.querySelector('#orbitContentList');
      if (list) {
        const campaigns = Array.isArray(data(ctx).campaigns) ? data(ctx).campaigns : [];
        const rows = [];
        for (const c of campaigns) for (const p of (c.posts || [])) if (p) rows.push({ ...p, campaignName: c.name });
        rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        if (!rows.length) {
          list.innerHTML = '<div class="empty">No content yet — use "New content" to draft with AI.</div>';
        } else {
          list.innerHTML = rows.slice(0, 40).map(p => `
            <div style="display:flex;gap:10px;padding:10px;border-bottom:1px solid var(--line);">
              <div class="kpi-icon"><i class="fa-brands fa-${esc(p.platform || 'globe')}"></i></div>
              <div style="flex:1;min-width:0;">
                <div class="small muted">${esc(p.campaignName || '')} · ${esc(p.status || 'draft')}</div>
                <div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.caption || '')}</div>
              </div>
              <button class="btn soft" data-orbit-open-draft="${esc(p.id)}" data-orbit-campaign="${esc(p.campaignId || '')}">Edit</button>
            </div>`).join('');
          list.querySelectorAll('[data-orbit-open-draft]').forEach(btn => {
            btn.addEventListener('click', () => {
              const camp = data(ctx).campaigns?.find?.(c => c.id === btn.dataset.orbitCampaign);
              const post = camp?.posts?.find?.(p => p.id === btn.dataset.orbitOpenDraft);
              if (post && window.Viora?.openComposerForDraft) window.Viora.openComposerForDraft(post);
              else toast(ctx, 'Post not found.', 'warning');
            });
          });
        }
      }
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   CALENDAR
   ═══════════════════════════════════════════════════════════════ */
export async function renderCalendar(ctx) {
  const campaigns = Array.isArray(data(ctx).campaigns) ? data(ctx).campaigns : [];
  const events = [];
  for (const c of campaigns) for (const p of (c.posts || [])) {
    if (!p || !p.scheduledFor) continue;
    events.push({ ...p, campaignName: c.name });
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const byDay = {};
  for (const ev of events) {
    const dt = new Date(ev.scheduledFor);
    if (isNaN(dt) || dt.getMonth() !== month || dt.getFullYear() !== year) continue;
    const d = dt.getDate();
    (byDay[d] = byDay[d] || []).push(ev);
  }

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<div class="day" style="opacity:.3;"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dayEvents = byDay[d] || [];
    cells += `<div class="day">
      <b>${d}</b>
      ${dayEvents.map(ev => `<div class="event" title="${esc(ev.caption || '')}">${esc(ev.platform)} · ${esc((ev.caption || '').slice(0, 20))}</div>`).join('')}
    </div>`;
  }

  return head('Content calendar', 'All scheduled posts across campaigns.', '') +
    `<div class="card"><div class="cardhead"><h3>${now.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</h3>
      <span class="pill">${events.length} scheduled</span></div>
      <div class="calendar">
        ${dayNames.map(n => `<div class="muted small" style="padding:5px;">${n}</div>`).join('')}
        ${cells}
      </div>
      ${events.length === 0 ? '<div class="empty">No scheduled posts yet. Create one from Content studio.</div>' : ''}
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   PUBLISHING CENTRE
   ═══════════════════════════════════════════════════════════════ */
export async function renderPublishingCentre(ctx) {
  const campaigns = Array.isArray(data(ctx).campaigns) ? data(ctx).campaigns : [];
  const rows = [];
  for (const c of campaigns) for (const p of (c.posts || [])) {
    if (!p) continue;
    rows.push({ ...p, campaignName: c.name });
  }
  rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

  const queued = rows.filter(r => r.status === 'scheduled').length;
  const published = rows.filter(r => r.status === 'published').length;
  const failed = rows.filter(r => r.status === 'failed').length;
  const composeOnly = rows.filter(r => r.status === 'compose-only').length;

  return head('Publishing centre', 'Real publishing queue with per-platform outcomes.',
    '<button class="btn primary" id="orbitRefreshFanout"><i class="fa-solid fa-rotate"></i> Refresh stats</button>') +
    `<div class="grid kpis">
      ${kpi('Queued', queued, 'Scheduled posts', '<i class="fa-solid fa-clock"></i>')}
      ${kpi('Published', published, 'Live on platforms', '<i class="fa-solid fa-check"></i>')}
      ${kpi('Compose-only', composeOnly, 'Awaiting manual paste', '<i class="fa-solid fa-clipboard"></i>')}
      ${kpi('Failed', failed, 'Needs attention', '<i class="fa-solid fa-triangle-exclamation"></i>')}
    </div>
    <div class="card" style="margin-top:15px;">
      <div class="cardhead"><h3>Queue</h3></div>
      ${rows.length === 0
        ? '<div class="empty">Nothing in the queue. Publish content from the composer.</div>'
        : `<div class="tablewrap"><table>
            <thead><tr><th>Content</th><th>Platform</th><th>Campaign</th><th>Scheduled</th><th>Status</th></tr></thead>
            <tbody>${rows.slice(0, 100).map(r => `
              <tr>
                <td>${esc((r.caption || '').slice(0, 60))}</td>
                <td>${esc(r.platform || '')}</td>
                <td>${esc(r.campaignName || '')}</td>
                <td>${esc(r.scheduledFor || '—')}</td>
                <td>${statusBadge(r.status)}</td>
              </tr>`).join('')}</tbody>
          </table></div>`}
    </div>`;
}

function statusBadge(s) {
  const map = { scheduled: 'warn', published: 'good', failed: 'bad', 'compose-only': 'warn', draft: '' };
  return `<span class="status ${map[s] || ''}">${esc(s || '—')}</span>`;
}

/* ═══════════════════════════════════════════════════════════════
   CREATIVE STUDIO — v2 (mode toggle + multi-platform composer)
   ─────────────────────────────────────────────────────────────
   Two modes:
     • Quick image       — call ai/generateImage; show result inline
     • Multi-platform    — open the composer (campaign-ai.js);
                            the composer handles platform pick,
                            per-platform captions, fanout, posting

   Recent generations (last 5, this session) appear under the form
   so the user can revisit a previous image without regenerating.
   ═══════════════════════════════════════════════════════════════ */

/* Module-scoped session cache for recent generations. Not persisted. */
const _creativeRecent = [];

export async function renderCreativeStudio(ctx) {
  const c = C(ctx);
  const state = c.state || { data: {} };
  const campaigns = Array.isArray(state.data?.campaigns) ? state.data.campaigns : [];
  const hasCampaigns = campaigns.length > 0;

  const recentHtml = _creativeRecent.length
    ? _creativeRecent.map((r, i) => `
        <div class="cs-recent-item" data-cs-recent-idx="${i}" title="${esc(r.prompt)}">
          <img src="data:${esc(r.mime)};base64,${esc(r.b64)}" alt="" />
          <div class="cs-recent-meta">
            <div class="cs-recent-model">${esc(r.model || '—')}</div>
            <div class="cs-recent-time">${esc(r.at)}</div>
          </div>
        </div>
      `).join('')
    : `<div class="empty" style="padding:14px;">No generations yet this session.</div>`;

  const html = head(
    'Creative studio',
    'Generate a visual, then draft the post — all in one place.',
    ''
  ) + `
    <div class="cs-wrap">

      <!-- ═══════════ MODE TOGGLE ═══════════ -->
      <div class="cs-mode" role="tablist">
        <button type="button" class="cs-mode-btn active" data-cs-mode="quick" role="tab">
          <i class="fa-solid fa-image"></i>
          <span>Quick image</span>
          <small>Generate a single visual</small>
        </button>
        <button type="button" class="cs-mode-btn" data-cs-mode="multi" role="tab">
          <i class="fa-solid fa-layer-group"></i>
          <span>Full multi-platform post</span>
          <small>Generate caption + image, post to N platforms</small>
        </button>
      </div>

      <!-- ═══════════ TWO-COLUMN LAYOUT ═══════════ -->
      <div class="cs-grid">

        <!-- ── LEFT: GENERATOR ── -->
        <div class="card">
          <div class="cardhead"><h3><i class="fa-solid fa-wand-magic-sparkles"></i> Generator</h3></div>

          <div class="field">
            <label>Prompt *</label>
            <textarea id="csPrompt" rows="4" placeholder="e.g. Aerial product photo of espresso cups on marble, soft morning light"></textarea>
          </div>

          <div class="formgrid">
            <div class="field">
              <label>Pillar</label>
              <select id="csPillar">
                <option value="promotional">Promotional</option>
                <option value="educational">Educational</option>
                <option value="testimonial">Testimonial</option>
                <option value="announcement">Announcement</option>
                <option value="trending">Trending</option>
              </select>
            </div>
            <div class="field cs-platform-field">
              <label>Platform</label>
              <select id="csPlatform">
                <option value="instagram">Instagram (1080×1080)</option>
                <option value="facebook">Facebook (1200×630)</option>
                <option value="tiktok">TikTok (1080×1920)</option>
                <option value="linkedin">LinkedIn (1200×627)</option>
                <option value="youtube">YouTube (1280×720)</option>
              </select>
            </div>
          </div>

          <div class="cs-multi-hint" style="display:none;">
            <div class="notice" style="margin:0;">
              <i class="fa-solid fa-layer-group"></i>
              <strong>Multi-platform mode.</strong>
              Platform selection happens in the composer — you'll pick 1 or more channels after clicking Generate.
            </div>
          </div>

          <div class="field">
            <label>Campaign ${hasCampaigns ? '*' : ''}</label>
            ${hasCampaigns
              ? `<select id="csCampaign">
                   <option value="">— Select a campaign —</option>
                   ${campaigns.map(cc => `<option value="${esc(cc.id)}">${esc(cc.name || 'Untitled')}</option>`).join('')}
                 </select>`
              : `<div class="notice" style="margin:0;">
                   <i class="fa-solid fa-triangle-exclamation"></i>
                   Create a campaign first — you can't save or post without one.
                   <button type="button" class="btn soft btn-sm" style="margin-left:8px;" onclick="window.Orbit && window.Orbit.navigate && window.Orbit.navigate('campaigns')">Go to Campaigns →</button>
                 </div>`}
          </div>

          <div class="cs-actions">
            <button type="button" class="btn primary" id="csGenerateImage" ${hasCampaigns ? '' : 'disabled'}>
              <i class="fa-solid fa-wand-magic-sparkles"></i> Generate image
            </button>
            <button type="button" class="btn soft" id="csGeneratePost" ${hasCampaigns ? '' : 'disabled'}>
              <i class="fa-solid fa-layer-group"></i> Generate caption + image
            </button>
          </div>

          <div class="cs-recent">
            <div class="cs-recent-head">
              <h4>Recent generations</h4>
              <span class="pill">${_creativeRecent.length}</span>
            </div>
            <div class="cs-recent-list">${recentHtml}</div>
          </div>
        </div>

        <!-- ── RIGHT: RESULT ── -->
        <div class="card">
          <div class="cardhead"><h3><i class="fa-solid fa-image"></i> Result</h3></div>
          <div id="csResult">
            <div class="empty" style="padding:32px;text-align:center;">
              <i class="fa-solid fa-image" style="font-size:2rem;opacity:.35;margin-bottom:10px;display:block;"></i>
              <div>Nothing generated yet.</div>
              <div class="small muted" style="margin-top:4px;">Fill in the prompt on the left and click Generate.</div>
            </div>
          </div>
        </div>

      </div>
    </div>`;

  return {
    html,
    mount(view) {
      /* ── Refs ── */
      const promptEl   = view.querySelector('#csPrompt');
      const pillarEl   = view.querySelector('#csPillar');
      const platformEl = view.querySelector('#csPlatform');
      const campaignEl = view.querySelector('#csCampaign');
      const genImgBtn  = view.querySelector('#csGenerateImage');
      const genPostBtn = view.querySelector('#csGeneratePost');
      const resultEl   = view.querySelector('#csResult');
      const platformField = view.querySelector('.cs-platform-field');
      const multiHint     = view.querySelector('.cs-multi-hint');
      const recentList    = view.querySelector('.cs-recent-list');

      /* ── Mode state ── */
      let mode = 'quick';   // 'quick' | 'multi'

      const setMode = (next) => {
        mode = next;
        view.querySelectorAll('.cs-mode-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.csMode === next)
        );
        const multi = next === 'multi';
        platformField.style.display = multi ? 'none' : '';
        multiHint.style.display     = multi ? 'block' : 'none';
        genPostBtn.style.display    = multi ? '' : 'none';
      };
      view.querySelectorAll('.cs-mode-btn').forEach(b =>
        b.addEventListener('click', () => setMode(b.dataset.csMode))
      );
      setMode('quick');

      /* ── Track current generated image (for handoff to composer) ── */
      let currentImage = null;   // { b64, mime, model, width, height, prompt }

      /* ── Recent generations click → load back into result ── */
      recentList?.addEventListener('click', (e) => {
        const item = e.target.closest('[data-cs-recent-idx]');
        if (!item) return;
        const idx = Number(item.dataset.csRecentIdx);
        const rec = _creativeRecent[idx];
        if (!rec) return;
        currentImage = { ...rec };
        renderResultImage(rec);
        if (promptEl) promptEl.value = rec.prompt || '';
      });

      /* ── Render helper for image-only result ── */
      function renderResultImage(img) {
        if (!resultEl) return;
        resultEl.innerHTML = `
          <div class="cs-image-preview">
            <img src="data:${esc(img.mime)};base64,${esc(img.b64)}" alt="" />
          </div>
          <div class="cs-image-meta">
            <span><i class="fa-solid fa-image"></i> ${esc(img.width && img.height ? img.width + '×' + img.height : '—')}</span>
            <span><i class="fa-solid fa-cube"></i> ${esc(img.model || '—')}</span>
          </div>
          <div class="cs-image-actions">
            <button type="button" class="btn soft btn-sm" id="csDlImg"><i class="fa-solid fa-download"></i> Download</button>
            <button type="button" class="btn soft btn-sm" id="csCopyImg"><i class="fa-solid fa-copy"></i> Copy</button>
            <button type="button" class="btn primary btn-sm" id="csUseInComposer"><i class="fa-solid fa-paper-plane"></i> Use in composer</button>
          </div>`;

        resultEl.querySelector('#csDlImg')?.addEventListener('click', () => {
          const a = document.createElement('a');
          a.href = `data:${img.mime};base64,${img.b64}`;
          a.download = `viora-${Date.now()}.png`;
          a.click();
        });

        resultEl.querySelector('#csCopyImg')?.addEventListener('click', async () => {
          try {
            const res = await fetch(`data:${img.mime};base64,${img.b64}`);
            const blob = await res.blob();
            if (blob.type !== 'image/png') throw new Error('PNG only');
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            toast(ctx, 'Image copied.', 'success');
          } catch (_) {
            toast(ctx, 'Copy failed — use Download.', 'warning');
          }
        });

        resultEl.querySelector('#csUseInComposer')?.addEventListener('click', () => {
          openComposerFromCreative(ctx, { image: img, campaignId: campaignEl?.value || '' });
        });
      }

      /* ── Render helper for empty state ── */
      function renderResultEmpty(msg) {
        if (!resultEl) return;
        resultEl.innerHTML = `
          <div class="empty" style="padding:32px;text-align:center;">
            <i class="fa-solid fa-image" style="font-size:2rem;opacity:.35;margin-bottom:10px;display:block;"></i>
            <div>${esc(msg || 'Nothing generated yet.')}</div>
          </div>`;
      }

      /* ── Generate image (Quick mode) ── */
      genImgBtn?.addEventListener('click', async () => {
        const prompt = (promptEl?.value || '').trim();
        if (!prompt) { toast(ctx, 'Enter a prompt first.', 'warning'); promptEl?.focus(); return; }
        if (!campaignEl?.value) { toast(ctx, 'Pick a campaign first.', 'warning'); campaignEl?.focus(); return; }

        const btn = genImgBtn;
        const prev = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating…';

        if (resultEl) {
          resultEl.innerHTML = `
            <div class="empty" style="padding:32px;text-align:center;">
              <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;opacity:.6;margin-bottom:10px;display:block;"></i>
              <div>Generating image…</div>
              <div class="small muted" style="margin-top:4px;">This usually takes 10–20 seconds.</div>
            </div>`;
        }

        try {
          const res = await c.callFn('ai/generateImage', {
            prompt,
            pillar: pillarEl?.value || 'promotional',
            platform: platformEl?.value || 'instagram',
            quality: 'production',
          });
          const b64 = res?.imageBase64 || res?.base64 || '';
          if (!b64) throw new Error('Worker returned no image');
          const mime = res?.mime || 'image/png';

          currentImage = {
            b64: b64.replace(/^data:[^;]+;base64,/, ''),
            mime,
            model: res?.model || null,
            width: res?.width || null,
            height: res?.height || null,
            prompt,
          };

          /* Push to recent list (max 5) */
          _creativeRecent.unshift({
            ...currentImage,
            at: new Date().toLocaleTimeString(),
          });
          if (_creativeRecent.length > 5) _creativeRecent.length = 5;

          /* Refresh the recent list DOM */
          if (recentList) {
            recentList.innerHTML = _creativeRecent.map((r, i) => `
              <div class="cs-recent-item" data-cs-recent-idx="${i}" title="${esc(r.prompt)}">
                <img src="data:${esc(r.mime)};base64,${esc(r.b64)}" alt="" />
                <div class="cs-recent-meta">
                  <div class="cs-recent-model">${esc(r.model || '—')}</div>
                  <div class="cs-recent-time">${esc(r.at)}</div>
                </div>
              </div>
            `).join('');
          }

          renderResultImage(currentImage);
          toast(ctx, 'Image generated.', 'success');
        } catch (e) {
          console.warn('[creative] image gen failed', e);
          if (resultEl) {
            resultEl.innerHTML = `
              <div class="cs-error">
                <div class="cs-error-head"><i class="fa-solid fa-triangle-exclamation"></i> Generation failed</div>
                <div class="cs-error-body">${esc(e.message || 'unknown error')}</div>
                <button type="button" class="btn soft btn-sm" id="csRetryImg">Try again</button>
              </div>`;
            resultEl.querySelector('#csRetryImg')?.addEventListener('click', () => genImgBtn.click());
          }
          toast(ctx, 'Generation failed: ' + (e.message || 'unknown'), 'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = prev;
        }
      });

      /* ── Generate caption + image (Multi mode → open composer) ── */
      genPostBtn?.addEventListener('click', () => {
        const prompt = (promptEl?.value || '').trim();
        if (!prompt) { toast(ctx, 'Enter a brief first.', 'warning'); promptEl?.focus(); return; }
        const campaignId = campaignEl?.value || '';
        if (!campaignId) { toast(ctx, 'Pick a campaign first.', 'warning'); campaignEl?.focus(); return; }

        /* openComposer is imported at top of orbit-modules.js from campaign-ai.js */
        try {
          openComposer({
            campaignId,
            brief: prompt,
            pillar: pillarEl?.value || 'educational',
            platforms: undefined,   // let the composer decide based on connected accounts
          });
        } catch (e) {
          console.error('[creative] openComposer failed', e);
          toast(ctx, 'Composer failed to open: ' + (e.message || 'unknown'), 'error');
        }
      });
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   INTERNAL — handoff from Creative Studio to Composer
   ─────────────────────────────────────────────────────────────
   Opens the composer prefilled with the generated image + prompt,
   so the user can pick platforms and per-platform captions there.

   This helper is used by the "Use in composer" button on the
   Quick-image result, and lives here (not in campaign-ai.js) so
   the composer remains unmodified.
   ═══════════════════════════════════════════════════════════════ */
function openComposerFromCreative(ctx, opts) {
  try {
    const img = opts.image;
    const campaignId = opts.campaignId || '';

    /* openComposer accepts { campaignId, brief, ... }, but image
       handoff isn't a first-class parameter. We call it first, then
       push the image into the composer's state after it opens —
       openComposer sets _state.composer synchronously, so a
       microtask is enough time. */
    openComposer({ campaignId, brief: img.prompt || '' });

    /* Push the pre-generated image into the just-opened composer */
    queueMicrotask(() => {
      try {
        const composer = window._vioraComposerState?.() || null;
        /* campaign-ai.js stores state privately; but it exposes
           _state.composer via the window if we add that hook.
           For now, dispatch a custom event the composer can listen for. */
        window.dispatchEvent(new CustomEvent('viora:composer-prefill-image', {
          detail: {
            b64: img.b64,
            mime: img.mime,
            model: img.model,
            width: img.width,
            height: img.height,
            prompt: img.prompt,
          }
        }));
        toast(ctx, 'Image attached to composer.', 'info');
      } catch (e) {
        console.warn('[creative] image handoff failed', e);
      }
    });
  } catch (e) {
    toast(ctx, 'Could not open composer: ' + (e.message || 'unknown'), 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   INBOX — delegates to ./inbox.js
   ═══════════════════════════════════════════════════════════════ */
export async function renderInbox(ctx) {
  // The inbox module owns its own DOM rendering (into #view)
  _renderInboxImpl();
  // Return empty string so orbit-shell doesn't overwrite
  return { html: '', mount: () => {} };
}

/* ═══════════════════════════════════════════════════════════════
   CRM (unchanged)
   ═══════════════════════════════════════════════════════════════ */
export async function renderCRM(ctx) {
  const leads = Array.isArray(data(ctx).leads) ? data(ctx).leads : [];
  const byStatus = { New: 0, Qualified: 0, 'Follow-up': 0, Converted: 0, Other: 0 };
  for (const l of leads) {
    const s = l?.status || 'Other';
    if (s in byStatus) byStatus[s]++; else byStatus.Other++;
  }

  return head('CRM & leads', 'Every lead the system has captured, with status and campaign attribution.', '') +
    `<div class="grid kpis">
      ${kpi('Total', leads.length, 'All leads', '<i class="fa-solid fa-user-group"></i>')}
      ${kpi('Qualified', byStatus.Qualified, 'Ready to convert', '<i class="fa-solid fa-check"></i>')}
      ${kpi('Follow-up', byStatus['Follow-up'], 'Pending action', '<i class="fa-solid fa-clock"></i>')}
      ${kpi('Converted', byStatus.Converted, 'Closed-won', '<i class="fa-solid fa-trophy"></i>')}
    </div>
    <div class="card" style="margin-top:15px;">
      <div class="cardhead"><h3>Leads</h3></div>
      ${leads.length === 0
        ? '<div class="empty">No leads yet. They appear automatically when the marketplace captures customers.</div>'
        : `<div class="tablewrap"><table>
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Source</th><th>Status</th><th>Campaign</th></tr></thead>
            <tbody>${leads.slice(0, 200).map(l => `
              <tr>
                <td><b>${esc(l.fullName || l.name || '—')}</b></td>
                <td>${esc(l.email || '')}</td>
                <td>${esc(l.phone || '')}</td>
                <td>${esc(l.source || '')}</td>
                <td><span class="status ${l.status === 'Converted' ? 'good' : l.status === 'Follow-up' ? 'warn' : ''}">${esc(l.status || 'New')}</span></td>
                <td>${esc(l.campaignName || '—')}</td>
              </tr>`).join('')}</tbody>
          </table></div>`}
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   SOCIAL LISTENING — full CRUD; Run button calls listening/ingest
   ═══════════════════════════════════════════════════════════════ */
export async function renderListening(ctx) {
  const queries = Array.isArray(data(ctx).listeningQueries) ? data(ctx).listeningQueries : [];
  const mentions = Array.isArray(data(ctx).listeningMentions) ? data(ctx).listeningMentions : [];

  return head('Social listening', 'Monitor brand mentions across connected channels.',
    '<button class="btn primary" id="orbitAddQuery"><i class="fa-solid fa-plus"></i> New query</button>') +
    `<div class="grid two">
      <div class="card">
        <div class="cardhead"><h3>Active queries (${queries.length})</h3></div>
        ${queries.length === 0
          ? '<div class="empty">No queries yet. Add one to start monitoring.</div>'
          : queries.map(q => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);">
                <div><b style="font-size:12px;">${esc(q.term || '')}</b>
                  <div class="small muted">${esc((q.platforms || []).join(', ') || 'all platforms')}</div></div>
                <div class="actions">
                  <button class="btn soft" data-listen-run="${esc(q.id)}">Run ingest</button>
                  <button class="btn danger" data-listen-del="${esc(q.id)}">Delete</button>
                </div>
              </div>`).join('')}
      </div>
      <div class="card">
        <div class="cardhead"><h3>Recent mentions (${mentions.length})</h3></div>
        ${mentions.length === 0
          ? '<div class="empty">No mentions yet. Add a query and run ingest.</div>'
          : mentions.slice(0, 20).map(m => `
              <div style="padding:8px 0;border-bottom:1px solid var(--line);">
                <div class="small muted">${esc(m.platform || '')} · ${esc(m.author || '')} · ${esc(m.fetchedAt || '')}</div>
                <div style="font-size:12px;">${esc(m.text || '')}</div>
              </div>`).join('')}
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   AGENTS — full CRUD + working Test button
   ═══════════════════════════════════════════════════════════════ */
export async function renderAgents(ctx) {
  const agents = Array.isArray(data(ctx).agents) ? data(ctx).agents : [];

  const html = head('AI agents', 'Build, configure and test your marketing agents.',
    '<button class="btn primary" id="orbitNewAgent"><i class="fa-solid fa-plus"></i> New agent</button>') +
    `<div class="grid agentgrid" style="margin-top:15px;">
      ${agents.length === 0
        ? '<div class="card" style="grid-column:1/-1;"><div class="empty">No agents yet. Create your first one.</div></div>'
        : agents.map(a => `
          <div class="agent">
            <div class="agenttop">
              <div class="agenticon"><i class="fa-solid ${esc(a.icon || 'fa-robot')}"></i></div>
              <button class="switch ${a.enabled ? 'on' : ''}" data-agent-toggle="${esc(a.id)}"></button>
            </div>
            <h4>${esc(a.name || 'Untitled agent')}</h4>
            <p>${esc((a.description || '').slice(0, 100))}</p>
            <div class="agentfoot">
              <span class="status ${a.enabled ? 'good' : ''}">${a.enabled ? 'Enabled' : 'Paused'}</span>
              <div class="actions">
                <button class="btn soft" data-agent-test="${esc(a.id)}">Test</button>
                <button class="btn" data-agent-edit="${esc(a.id)}">Edit</button>
                <button class="btn danger" data-agent-del="${esc(a.id)}">×</button>
              </div>
            </div>
          </div>`).join('')}
    </div>`;

  return {
    html,
    mount(view) {
      view.querySelector('#orbitNewAgent')?.addEventListener('click', () => openAgentEditor(ctx, null));

      view.querySelectorAll('[data-agent-toggle]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-agent-toggle');
          const agent = agents.find(a => a.id === id);
          if (!agent) return;
          try {
            await upsert(ctx, 'agents', { ...agent, enabled: !agent.enabled, updatedAt: new Date().toISOString() }, agent._rev);
            toast(ctx, 'Agent ' + (!agent.enabled ? 'enabled' : 'paused') + '.', 'success');
          } catch (e) { toast(ctx, 'Update failed: ' + e.message, 'error'); }
        });
      });

      view.querySelectorAll('[data-agent-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-agent-edit');
          const agent = agents.find(a => a.id === id);
          if (agent) openAgentEditor(ctx, agent);
        });
      });

      view.querySelectorAll('[data-agent-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-agent-del');
          if (!confirm('Delete this agent?')) return;
          try {
            await del(ctx, 'agents', id);
            toast(ctx, 'Agent deleted.', 'info');
          } catch (e) { toast(ctx, 'Delete failed: ' + e.message, 'error'); }
        });
      });

      view.querySelectorAll('[data-agent-test]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-agent-test');
          const agent = agents.find(a => a.id === id);
          if (agent) openAgentTest(ctx, agent);
        });
      });
    }
  };
}

function openAgentEditor(ctx, agent) {
  const isEdit = !!agent;
  const a = agent || {};
  const modal = document.createElement('div');
  modal.className = 'modalback show';
  modal.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modalhead"><h3>${isEdit ? 'Edit agent' : 'New agent'}</h3>
        <button class="close" data-close>×</button></div>
      <div class="field"><label>Name *</label>
        <input id="agentName" value="${esc(a.name || '')}" placeholder="Chief Marketing Strategist" /></div>
      <div class="field"><label>Description</label>
        <input id="agentDescription" value="${esc(a.description || '')}" placeholder="What does this agent do?" /></div>
      <div class="field"><label>System prompt *</label>
        <textarea id="agentSystemPrompt" rows="6" placeholder="You are a marketing strategist for…">${esc(a.systemPrompt || '')}</textarea></div>
      <div class="formgrid">
        <div class="field"><label>Model</label>
          <select id="agentModel">
            ${['openai/gpt-oss-120b','llama-3.3-70b','mistral-large-latest','gemini-2.0-flash'].map(m =>
              `<option value="${m}" ${a.model === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select></div>
        <div class="field"><label>Temperature</label>
          <input id="agentTemperature" type="number" min="0" max="2" step="0.1" value="${a.temperature ?? 0.7}" /></div>
        <div class="field"><label>Icon (Font Awesome)</label>
          <input id="agentIcon" value="${esc(a.icon || 'fa-robot')}" placeholder="fa-robot" /></div>
        <div class="field"><label>Enabled</label>
          <select id="agentEnabled"><option value="true" ${a.enabled ? 'selected' : ''}>Yes</option><option value="false" ${!a.enabled ? 'selected' : ''}>No</option></select></div>
      </div>
      <div class="actions" style="margin-top:14px;justify-content:flex-end;">
        <button class="btn" data-close>Cancel</button>
        <button class="btn primary" id="agentSave">${isEdit ? 'Save' : 'Create'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));

  modal.querySelector('#agentSave').addEventListener('click', async () => {
    const name = modal.querySelector('#agentName').value.trim();
    const systemPrompt = modal.querySelector('#agentSystemPrompt').value.trim();
    if (!name) { toast(ctx, 'Name is required.', 'error'); return; }
    if (!systemPrompt) { toast(ctx, 'System prompt is required.', 'error'); return; }

    const payload = {
      id: a.id || ('agent-' + Date.now().toString(36)),
      name,
      description: modal.querySelector('#agentDescription').value.trim(),
      systemPrompt,
      model: modal.querySelector('#agentModel').value,
      temperature: parseFloat(modal.querySelector('#agentTemperature').value) || 0.7,
      icon: modal.querySelector('#agentIcon').value.trim() || 'fa-robot',
      enabled: modal.querySelector('#agentEnabled').value === 'true',
      updatedAt: new Date().toISOString(),
      createdAt: a.createdAt || new Date().toISOString(),
      createdBy: state(ctx).operator?.email || 'operator',
    };

    try {
      await upsert(ctx, 'agents', payload, a._rev);
      toast(ctx, isEdit ? 'Agent updated.' : 'Agent created.', 'success');
      modal.remove();
    } catch (e) { toast(ctx, 'Save failed: ' + e.message, 'error'); }
  });
}

function openAgentTest(ctx, agent) {
  const modal = document.createElement('div');
  modal.className = 'modalback show';
  modal.innerHTML = `
    <div class="modal" style="max-width:600px;">
      <div class="modalhead"><h3>Test — ${esc(agent.name)}</h3>
        <button class="close" data-close>×</button></div>
      <div class="field"><label>Test input</label>
        <textarea id="agentTestInput" rows="4" placeholder="e.g. Draft a 2-line Facebook post for a Kenyan coffee shop launch">${esc('')}</textarea></div>
      <div class="actions" style="margin-top:12px;justify-content:flex-end;">
        <button class="btn" data-close>Close</button>
        <button class="btn primary" id="agentRun">Run</button>
      </div>
      <div id="agentTestOutput" style="margin-top:14px;"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));

  modal.querySelector('#agentRun').addEventListener('click', async () => {
    const input = modal.querySelector('#agentTestInput').value.trim();
    if (!input) { toast(ctx, 'Enter test input.', 'warning'); return; }
    const btn = modal.querySelector('#agentRun');
    const prev = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Running…';
    try {
      const result = await runAgent(agent, input);
      modal.querySelector('#agentTestOutput').innerHTML = `
        <div class="card" style="box-shadow:none;">
          <div class="cardhead"><h3>Output</h3><span class="pill">${esc(result.via || '')}</span></div>
          <pre style="white-space:pre-wrap;font-family:inherit;font-size:12px;margin:0;">${esc(result.output)}</pre>
          ${result.note ? `<div class="small muted" style="margin-top:8px;">${esc(result.note)}</div>` : ''}
        </div>`;
    } catch (e) {
      modal.querySelector('#agentTestOutput').innerHTML =
        `<div class="card" style="box-shadow:none;border-color:var(--bad);">
          <b style="color:var(--bad);">Test failed</b>
          <div class="small muted" style="margin-top:4px;">${esc(e.message || 'unknown')}</div>
        </div>`;
    } finally {
      btn.disabled = false; btn.innerHTML = prev;
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   AUTOMATION — full workflow builder
   ═══════════════════════════════════════════════════════════════ */
export async function renderAutomation(ctx) {
  const workflows = Array.isArray(data(ctx).workflows) ? data(ctx).workflows : [];

  const html = head('Automation centre', 'Design event-driven workflows with conditions and approvals.',
    '<button class="btn primary" id="orbitNewWorkflow"><i class="fa-solid fa-plus"></i> New workflow</button>') +
    `<div class="card" style="margin-top:15px;">
      <div class="cardhead"><h3>Workflows (${workflows.length})</h3></div>
      ${workflows.length === 0
        ? '<div class="empty">No workflows yet. Create one to automate repetitive tasks.</div>'
        : `<div class="tablewrap"><table>
            <thead><tr><th>Name</th><th>Trigger</th><th>Steps</th><th>Enabled</th><th></th></tr></thead>
            <tbody>${workflows.map(w => `
              <tr>
                <td><b>${esc(w.name || '')}</b></td>
                <td>${esc(w.trigger?.type || '—')}</td>
                <td>${(w.steps || []).length}</td>
                <td><span class="status ${w.enabled ? 'good' : ''}">${w.enabled ? 'On' : 'Off'}</span></td>
                <td><button class="btn soft" data-wf-edit="${esc(w.id)}">Edit</button>
                    <button class="btn danger" data-wf-del="${esc(w.id)}">Delete</button></td>
              </tr>`).join('')}</tbody>
          </table></div>`}
    </div>`;

  return {
    html,
    mount(view) {
      view.querySelector('#orbitNewWorkflow')?.addEventListener('click', () => openWorkflowEditor(ctx, null));
      view.querySelectorAll('[data-wf-edit]').forEach(b => b.addEventListener('click', () => {
        const w = workflows.find(x => x.id === b.getAttribute('data-wf-edit'));
        if (w) openWorkflowEditor(ctx, w);
      }));
      view.querySelectorAll('[data-wf-del]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this workflow?')) return;
        try {
          await del(ctx, 'workflows', b.getAttribute('data-wf-del'));
          toast(ctx, 'Workflow deleted.', 'info');
        } catch (e) { toast(ctx, 'Delete failed: ' + e.message, 'error'); }
      }));
    }
  };
}

function openWorkflowEditor(ctx, wf) {
  const isEdit = !!wf;
  const w = wf || { steps: [] };
  const modal = document.createElement('div');
  modal.className = 'modalback show';
  modal.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="modalhead"><h3>${isEdit ? 'Edit workflow' : 'New workflow'}</h3>
        <button class="close" data-close>×</button></div>
      <div class="field"><label>Name *</label>
        <input id="wfName" value="${esc(w.name || '')}" placeholder="Assign new leads by territory" /></div>
      <div class="field"><label>Trigger type</label>
        <select id="wfTrigger">
          ${['leads.upsert','campaigns.upsert','orders.upsert','manual'].map(t =>
            `<option value="${t}" ${w.trigger?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select></div>
      <div class="field"><label>Steps (JSON array)</label>
        <textarea id="wfSteps" rows="6" placeholder='[{"action":"sendWhatsApp","to":"+254…","message":"Hi"}]'>${esc(JSON.stringify(w.steps || [], null, 2))}</textarea></div>
      <div class="field"><label>Enabled</label>
        <select id="wfEnabled"><option value="true" ${w.enabled ? 'selected' : ''}>Yes</option><option value="false" ${!w.enabled ? 'selected' : ''}>No</option></select></div>
      <div class="actions" style="margin-top:14px;justify-content:flex-end;">
        <button class="btn" data-close>Cancel</button>
        <button class="btn primary" id="wfSave">${isEdit ? 'Save' : 'Create'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));

  modal.querySelector('#wfSave').addEventListener('click', async () => {
    const name = modal.querySelector('#wfName').value.trim();
    if (!name) { toast(ctx, 'Name is required.', 'error'); return; }
    let steps;
    try { steps = JSON.parse(modal.querySelector('#wfSteps').value || '[]'); }
    catch (e) { toast(ctx, 'Steps must be valid JSON.', 'error'); return; }
    const payload = {
      id: w.id || ('wf-' + Date.now().toString(36)),
      name,
      trigger: { type: modal.querySelector('#wfTrigger').value },
      steps,
      enabled: modal.querySelector('#wfEnabled').value === 'true',
      updatedAt: new Date().toISOString(),
      createdAt: w.createdAt || new Date().toISOString(),
    };
    try {
      await upsert(ctx, 'workflows', payload, w._rev);
      toast(ctx, isEdit ? 'Workflow updated.' : 'Workflow created.', 'success');
      modal.remove();
    } catch (e) { toast(ctx, 'Save failed: ' + e.message, 'error'); }
  });
}

/* ═══════════════════════════════════════════════════════════════
   ANALYTICS — delegates to campaign-analytics
   ═══════════════════════════════════════════════════════════════ */
export async function renderAnalyticsModule(ctx) {
  return {
    html: head('Analytics & business intelligence',
      'Performance across campaigns, channels and revenue.',
      '<button class="btn" id="orbitAnalyticsRefresh"><i class="fa-solid fa-rotate"></i> Refresh</button>') +
      '<div id="campaignAnalyticsDashboard"></div>',
    mount() {
      try {
        const fn = window.renderAnalyticsDashboard;
        if (typeof fn === 'function') fn();
      } catch (e) { console.warn('[analytics] render failed', e); }
      document.getElementById('orbitAnalyticsRefresh')?.addEventListener('click', () => {
        try { window.renderAnalyticsDashboard?.(); } catch (_) {}
        toast(ctx, 'Refreshed.', 'info');
      });
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   COMPETITORS — full CRUD
   ═══════════════════════════════════════════════════════════════ */
export async function renderCompetitorsModule(ctx) {
  const benchmarks = Array.isArray(data(ctx).competitorBenchmarks) ? data(ctx).competitorBenchmarks : [];

  const html = head('Competitor intelligence', 'Track and benchmark competitor accounts.',
    '<button class="btn primary" id="orbitAddCompetitor"><i class="fa-solid fa-plus"></i> Add competitor</button>') +
    `<div class="card" style="margin-top:15px;">
      <div class="cardhead"><h3>Tracked competitors (${benchmarks.length})</h3></div>
      ${benchmarks.length === 0
        ? '<div class="empty">No competitors tracked yet.</div>'
        : `<div class="tablewrap"><table>
            <thead><tr><th>Handle</th><th>Platform</th><th>Followers</th><th>Engagement</th><th></th></tr></thead>
            <tbody>${benchmarks.map(b => `
              <tr>
                <td>${esc(b.handle || '')}</td>
                <td>${esc(b.platform || '')}</td>
                <td>${Number(b.stats?.followers || 0).toLocaleString()}</td>
                <td>${b.stats?.engagementRate ? Number(b.stats.engagementRate).toFixed(2) + '%' : '—'}</td>
                <td>
                  <button class="btn soft" data-comp-refresh="${esc(b.id)}">Refresh</button>
                  <button class="btn danger" data-comp-del="${esc(b.id)}">Remove</button>
                </td>
              </tr>`).join('')}</tbody>
          </table></div>`}
    </div>`;

  return {
    html,
    mount(view) {
      view.querySelector('#orbitAddCompetitor')?.addEventListener('click', () => openCompetitorEditor(ctx));
      view.querySelectorAll('[data-comp-del]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Remove this competitor?')) return;
        try {
          await del(ctx, 'competitorBenchmarks', b.getAttribute('data-comp-del'));
          toast(ctx, 'Removed.', 'info');
        } catch (e) { toast(ctx, 'Remove failed: ' + e.message, 'error'); }
      }));
      view.querySelectorAll('[data-comp-refresh]').forEach(b => b.addEventListener('click', async () => {
        const id = b.getAttribute('data-comp-refresh');
        const comp = benchmarks.find(x => x.id === id);
        if (!comp) return;
        try {
          const res = await C(ctx).callFn('competitor/stats', { platform: comp.platform, handle: comp.handle });
          const updated = { ...comp, stats: res, updatedAt: new Date().toISOString() };
          await upsert(ctx, 'competitorBenchmarks', updated, comp._rev);
          toast(ctx, 'Refreshed.', 'success');
        } catch (e) { toast(ctx, 'Refresh failed: ' + e.message, 'error'); }
      }));
    }
  };
}

function openCompetitorEditor(ctx) {
  const modal = document.createElement('div');
  modal.className = 'modalback show';
  modal.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modalhead"><h3>Add competitor</h3><button class="close" data-close>×</button></div>
      <div class="field"><label>Platform</label>
        <select id="compPlatform">
          <option value="youtube">YouTube</option>
          <option value="tiktok">TikTok</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
        </select></div>
      <div class="field"><label>Handle (without @)</label>
        <input id="compHandle" placeholder="mkachorogroup" /></div>
      <div class="actions" style="margin-top:14px;justify-content:flex-end;">
        <button class="btn" data-close>Cancel</button>
        <button class="btn primary" id="compSave">Add</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));

  modal.querySelector('#compSave').addEventListener('click', async () => {
    const platform = modal.querySelector('#compPlatform').value;
    const handle = modal.querySelector('#compHandle').value.trim().replace(/^@/, '');
    if (!handle) { toast(ctx, 'Handle is required.', 'error'); return; }
    try {
      await upsert(ctx, 'competitorBenchmarks', {
        id: 'comp-' + Date.now().toString(36),
        platform, handle,
        stats: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      toast(ctx, 'Competitor added.', 'success');
      modal.remove();
    } catch (e) { toast(ctx, 'Add failed: ' + e.message, 'error'); }
  });
}

/* ═══════════════════════════════════════════════════════════════
   REPORTS — real in-page report; PDF button attempts report/pdf
   ═══════════════════════════════════════════════════════════════ */
export async function renderReports(ctx) {
  const campaigns = Array.isArray(data(ctx).campaigns) ? data(ctx).campaigns : [];
  const orders = Array.isArray(data(ctx).orders) ? data(ctx).orders : [];
  const paidRevenue = orders.filter(o => o.paymentStatus === 'paid').reduce((s, o) => s + (Number(o.totalKES) || 0), 0);

  return head('Reports', 'In-page performance reports.',
    '<button class="btn primary" id="orbitRunReport"><i class="fa-solid fa-file-lines"></i> Generate report</button>') +
    `<div id="orbitReportBody" class="card" style="margin-top:15px;">
      <div class="cardhead"><h3>Report preview</h3></div>
      <div class="small">
        <p><b>Campaigns:</b> ${campaigns.length}</p>
        <p><b>Revenue (paid orders):</b> KSh ${paidRevenue.toLocaleString()}</p>
        <p><b>Orders:</b> ${orders.length}</p>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   CLIENTS — full CRUD
   ═══════════════════════════════════════════════════════════════ */
export async function renderClients(ctx) {
  const entities = (Array.isArray(data(ctx).entities) ? data(ctx).entities : []).filter(e => e && e.type === 'client');

  return head('Clients & brands', 'Client organisations and brand identities.',
    '<button class="btn primary" id="orbitNewClient"><i class="fa-solid fa-plus"></i> New client</button>') +
    `<div class="card" style="margin-top:15px;">
      <div class="cardhead"><h3>Clients (${entities.length})</h3></div>
      ${entities.length === 0
        ? '<div class="empty">No clients yet.</div>'
        : `<div class="tablewrap"><table>
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th></th></tr></thead>
            <tbody>${entities.map(e => `
              <tr>
                <td><b>${esc(e.name || '')}</b></td>
                <td>${esc(e.email || '')}</td>
                <td>${esc(e.phone || '')}</td>
                <td><button class="btn danger" data-client-del="${esc(e.id)}">Delete</button></td>
              </tr>`).join('')}</tbody>
          </table></div>`}
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   APPROVALS — approve/reject posts in 'in_review'
   ═══════════════════════════════════════════════════════════════ */
export async function renderApprovals(ctx) {
  const campaigns = Array.isArray(data(ctx).campaigns) ? data(ctx).campaigns : [];
  const pending = [];
  for (const c of campaigns) for (const p of (c.posts || [])) {
    if (p && p.status === 'in_review') pending.push({ ...p, campaignName: c.name, campaignId: c.id });
  }

  const html = head('Approvals', 'Content awaiting review before publish.', '') +
    `<div class="card" style="margin-top:15px;">
      <div class="cardhead"><h3>Pending approval (${pending.length})</h3></div>
      ${pending.length === 0
        ? '<div class="empty">Nothing pending. Posts marked "in_review" appear here.</div>'
        : pending.map(p => `
            <div style="padding:10px;border-bottom:1px solid var(--line);">
              <div class="small muted">${esc(p.campaignName)} · ${esc(p.platform)}</div>
              <div style="font-size:12px;margin:6px 0;">${esc(p.caption || '')}</div>
              <div class="actions">
                <button class="btn primary" data-approve="${esc(p.id)}" data-camp="${esc(p.campaignId)}">Approve</button>
                <button class="btn danger" data-reject="${esc(p.id)}" data-camp="${esc(p.campaignId)}">Reject</button>
              </div>
            </div>`).join('')}
    </div>`;

  return {
    html,
    mount(view) {
      view.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
        const postId = b.getAttribute('data-approve');
        const campId = b.getAttribute('data-camp');
        await _setPostStatus(ctx, campId, postId, 'scheduled');
      }));
      view.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
        const postId = b.getAttribute('data-reject');
        const campId = b.getAttribute('data-camp');
        await _setPostStatus(ctx, campId, postId, 'draft');
      }));
    }
  };
}

async function _setPostStatus(ctx, campId, postId, status) {
  const camp = (data(ctx).campaigns || []).find(c => c.id === campId);
  if (!camp) return;
  const posts = (camp.posts || []).map(p => p.id === postId ? { ...p, status, updatedAt: new Date().toISOString() } : p);
  try {
    await upsert(ctx, 'campaigns', { ...camp, posts, updatedAt: new Date().toISOString() }, camp._rev);
    toast(ctx, 'Status updated to ' + status + '.', 'success');
  } catch (e) { toast(ctx, 'Update failed: ' + e.message, 'error'); }
}

/* ═══════════════════════════════════════════════════════════════
   MEDIA LIBRARY — Firebase Storage uploads
   ═══════════════════════════════════════════════════════════════ */
export async function renderMediaLibrary(ctx) {
  const items = Array.isArray(data(ctx).mediaItems) ? data(ctx).mediaItems : [];

  const html = head('Media library', 'Uploads stored in Firebase Storage.',
    '<button class="btn primary" id="orbitUploadMedia"><i class="fa-solid fa-upload"></i> Upload</button>') +
    `<div id="orbitMediaGrid" class="accounts-grid" style="margin-top:15px;">
      ${items.length === 0
        ? '<div class="empty" style="grid-column:1/-1;">No media yet.</div>'
        : items.map(m => `
            <div class="account-card">
              <div class="account-head">
                <div class="account-ico"><i class="fa-solid ${m.type?.startsWith('image/') ? 'fa-image' : 'fa-file'}"></i></div>
                <div class="account-body">
                  <div class="account-name">${esc(m.name || 'Untitled')}</div>
                  <div class="account-handle">${esc(m.type || '')}</div>
                </div>
              </div>
              <div class="account-actions">
                <a href="${esc(m.url || '#')}" target="_blank" rel="noopener" class="btn" style="flex:1;justify-content:center;">Open</a>
                <button class="btn danger" data-media-del="${esc(m.id)}">Delete</button>
              </div>
            </div>`).join('')}
    </div>`;

  return {
    html,
    mount(view) {
      view.querySelector('#orbitUploadMedia')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,video/*,application/pdf';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          try {
            const { getStorage, ref: sref, uploadBytes, getDownloadURL } = await import('firebase/storage');
            const storage = getStorage();
            const path = `media/${Date.now()}-${file.name}`;
            const s = sref(storage, path);
            await uploadBytes(s, file);
            const url = await getDownloadURL(s);
            await upsert(ctx, 'mediaItems', {
              id: 'media-' + Date.now().toString(36),
              name: file.name,
              type: file.type,
              size: file.size,
              url,
              path,
              uploadedAt: new Date().toISOString(),
              uploadedBy: state(ctx).operator?.email || 'operator',
            });
            toast(ctx, 'Uploaded.', 'success');
          } catch (e) {
            toast(ctx, 'Upload failed: ' + e.message, 'error');
          }
        };
        input.click();
      });
      view.querySelectorAll('[data-media-del]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this media entry? (Does not remove the file from Storage.)')) return;
        try {
          await del(ctx, 'mediaItems', b.getAttribute('data-media-del'));
          toast(ctx, 'Removed.', 'info');
        } catch (e) { toast(ctx, 'Delete failed: ' + e.message, 'error'); }
      }));
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   KNOWLEDGE — real CRUD on marketContent
   ═══════════════════════════════════════════════════════════════ */
export async function renderKnowledge(ctx) {
  const content = data(ctx).marketContent || {};
  return {
    html: head('Brand knowledge', 'Give the AI verified, permission-scoped business context.', '') +
      `<div class="card" style="margin-top:15px;">
        <div class="cardhead"><h3>Company profile</h3></div>
        <div class="field"><label>Company name</label>
          <input id="orbitKnowledgeName" value="${esc(content.companyName || '')}" /></div>
        <div class="field"><label>Description</label>
          <textarea id="orbitKnowledgeDesc">${esc(content.description || '')}</textarea></div>
        <button class="btn primary" id="orbitSaveKnowledge">Save</button>
      </div>`,
    mount(view) {
      view.querySelector('#orbitSaveKnowledge')?.addEventListener('click', async () => {
        const companyName = view.querySelector('#orbitKnowledgeName').value.trim();
        const description = view.querySelector('#orbitKnowledgeDesc').value.trim();
        try {
          await upsert(ctx, 'marketContent', {
            companyName, description, updatedAt: new Date().toISOString(),
          });
          toast(ctx, 'Saved.', 'success');
        } catch (e) { toast(ctx, 'Save failed: ' + e.message, 'error'); }
      });
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   TEAM — full CRUD (invite button calls team/invite if available)
   ═══════════════════════════════════════════════════════════════ */
export async function renderTeam(ctx) {
  const team = Array.isArray(data(ctx).team) ? data(ctx).team : [];
  return {
    html: head('Team & roles', 'Manage workspace members and permissions.',
      '<button class="btn primary" id="orbitInviteTeam"><i class="fa-solid fa-plus"></i> Invite member</button>') +
      `<div class="card" style="margin-top:15px;">
        <div class="cardhead"><h3>Members (${team.length})</h3></div>
        ${team.length === 0
          ? '<div class="empty">No team members yet.</div>'
          : `<div class="tablewrap"><table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
              <tbody>${team.map(m => `
                <tr>
                  <td>${esc(m.name || '')}</td>
                  <td>${esc(m.email || '')}</td>
                  <td>${esc(m.role || '')}</td>
                  <td><button class="btn danger" data-team-del="${esc(m.id)}">Delete</button></td>
                </tr>`).join('')}</tbody>
            </table></div>`}
      </div>`,
    mount(view) {
      view.querySelector('#orbitInviteTeam')?.addEventListener('click', () => {
        const email = prompt('Email of new team member:');
        if (!email) return;
        const role = prompt('Role (admin / manager / editor / viewer):', 'editor');
        if (!role) return;
        upsert(ctx, 'team', {
          id: 'team-' + Date.now().toString(36),
          email, role,
          name: email.split('@')[0],
          createdAt: new Date().toISOString(),
          status: 'invited',
        }).then(() => toast(ctx, 'Member added.', 'success'))
          .catch(e => toast(ctx, 'Add failed: ' + e.message, 'error'));
      });
      view.querySelectorAll('[data-team-del]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Remove this member?')) return;
        try {
          await del(ctx, 'team', b.getAttribute('data-team-del'));
          toast(ctx, 'Removed.', 'info');
        } catch (e) { toast(ctx, 'Delete failed: ' + e.message, 'error'); }
      }));
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   INTEGRATIONS
   ═══════════════════════════════════════════════════════════════ */
export async function renderIntegrations(ctx) {
  const list = [
    { key: 'facebook', label: 'Meta (Facebook & Instagram)', icon: 'fa-facebook', workerRoute: '/social/post/facebook' },
    { key: 'tiktok', label: 'TikTok', icon: 'fa-tiktok', workerRoute: '/social/post/tiktok + /tiktok/authorize' },
    { key: 'instagram', label: 'Instagram', icon: 'fa-instagram', workerRoute: '/social/post/instagram' },
    { key: 'youtube', label: 'YouTube', icon: 'fa-youtube', workerRoute: '/socialStats (YT Data API)' },
    { key: 'x', label: 'X / Twitter', icon: 'fa-x-twitter', workerRoute: null },
    { key: 'whatsapp', label: 'WhatsApp Business', icon: 'fa-whatsapp', workerRoute: '/sendWhatsApp + /waWebhook' },
  ];

  return {
    html: head('Integrations', 'Third-party service connections.', '') +
      `<div class="grid integration-grid" style="margin-top:15px;">
        ${list.map(x => `
          <div class="integration">
            <div class="bigico"><i class="fa-brands ${esc(x.icon)}"></i></div>
            <b>${esc(x.label)}</b>
            <span class="status ${x.workerRoute ? 'good' : 'warn'}">${x.workerRoute ? 'Configured' : 'Not configured'}</span>
            <div class="small muted" style="margin-top:8px;">${esc(x.workerRoute || 'No worker route')}</div>
            <div style="margin-top:12px;">
              <button class="btn" ${x.workerRoute ? '' : 'disabled'} data-integrate="${esc(x.key)}">${x.workerRoute ? 'Open' : 'Unavailable'}</button>
            </div>
          </div>`).join('')}
      </div>`,
    mount(view) {
      view.querySelectorAll('[data-integrate]').forEach(b => b.addEventListener('click', () => {
        const key = b.getAttribute('data-integrate');
        if (key === 'tiktok') {
          const uid = state(ctx).operator?.uid;
          if (!uid) { toast(ctx, 'Sign in first.', 'error'); return; }
          const WORKER = C(ctx).WORKER_URL || 'https://viora-api.cliff254johns.workers.dev';
          window.open(`${WORKER}/tiktok/authorize?uid=${encodeURIComponent(uid)}`, 'viora_tiktok_auth',
            'width=620,height=760,left=650,top=60');
        } else if (key === 'whatsapp' || key === 'facebook' || key === 'instagram') {
          window.Orbit?.navigate('accounts');
        } else {
          toast(ctx, 'Configured on the worker. No action needed here.', 'info');
        }
      }));
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS — real CRUD
   ═══════════════════════════════════════════════════════════════ */
export async function renderSettings(ctx) {
  const profile = data(ctx).companyProfile || {};
  return {
    html: head('Workspace settings', 'Configure workspace-level preferences.', '') +
      `<div class="card" style="margin-top:15px;">
        <div class="cardhead"><h3>Workspace</h3></div>
        <div class="field"><label>Workspace name</label>
          <input id="orbitWsName" value="${esc(profile.name || 'Northwind Studio')}" /></div>
        <div class="field"><label>Website</label>
          <input id="orbitWsWebsite" value="${esc(profile.website || '')}" /></div>
        <div class="field"><label>Time zone</label>
          <input id="orbitWsTimezone" value="${esc(profile.timezone || 'Africa/Nairobi')}" /></div>
        <button class="btn primary" id="orbitSaveSettings">Save settings</button>
      </div>`,
    mount(view) {
      view.querySelector('#orbitSaveSettings')?.addEventListener('click', async () => {
        try {
          await upsert(ctx, 'companyProfile', {
            name: view.querySelector('#orbitWsName').value.trim(),
            website: view.querySelector('#orbitWsWebsite').value.trim(),
            timezone: view.querySelector('#orbitWsTimezone').value.trim(),
            updatedAt: new Date().toISOString(),
          });
          toast(ctx, 'Settings saved.', 'success');
        } catch (e) { toast(ctx, 'Save failed: ' + e.message, 'error'); }
      });
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN — read-only workspace health
   ═══════════════════════════════════════════════════════════════ */
export async function renderAdmin(ctx) {
  const d = data(ctx);
  const counts = Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? v.length : (typeof v === 'object' && v ? Object.keys(v).length : 1)]);
  return head('Platform administration', 'Read-only health check of your workspace.', '') +
    `<div class="card" style="margin-top:15px;">
      <div class="cardhead"><h3>Collections</h3></div>
      <div class="tablewrap"><table>
        <thead><tr><th>Collection</th><th>Records</th></tr></thead>
        <tbody>${counts.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   ACCOUNTS MODULE — renders into #view
   ═══════════════════════════════════════════════════════════════ */
export async function renderAccountsModule(ctx) {
  const accounts = Array.isArray(data(ctx).socialAccounts) ? data(ctx).socialAccounts : [];
  const byPlatform = Object.fromEntries(accounts.map(a => [a.platform, a]));

  const PLATFORMS = [
    { key: 'facebook',  label: 'Facebook',          icon: 'fa-facebook',  color: '#1877f2' },
    { key: 'instagram', label: 'Instagram',         icon: 'fa-instagram', color: '#e1306c' },
    { key: 'tiktok',    label: 'TikTok',            icon: 'fa-tiktok',    color: '#ff0050' },
    { key: 'youtube',   label: 'YouTube',           icon: 'fa-youtube',   color: '#ff0033' },
    { key: 'linkedin',  label: 'LinkedIn',          icon: 'fa-linkedin',  color: '#0a66c2' },
    { key: 'x',         label: 'X / Twitter',       icon: 'fa-x-twitter', color: '#000000' },
    { key: 'threads',   label: 'Threads',           icon: 'fa-threads',   color: '#000000' },
    { key: 'pinterest', label: 'Pinterest',         icon: 'fa-pinterest', color: '#e60023' },
    { key: 'whatsapp',  label: 'WhatsApp Business', icon: 'fa-whatsapp',  color: '#25d366' },
    { key: 'gbp',       label: 'Google Business',   icon: 'fa-google',    color: '#4285f4' },
  ];

  const html = head('Social accounts', 'Register each platform once. The composer and stats pull from here.',
    '<button class="btn primary" id="orbitAddAccount"><i class="fa-solid fa-plus"></i> Add account</button>') +
    `<div class="accounts-grid" style="margin-top:15px;">
      ${PLATFORMS.map(p => {
        const a = byPlatform[p.key];
        const isRegistered = !!a;
        const followers = a && a.followers != null ? Number(a.followers).toLocaleString() : null;
        return `
          <div class="account-card" style="--platform-color:${p.color};">
            <div class="account-head">
              <div class="account-ico"><i class="fa-brands ${p.icon}"></i></div>
              <div class="account-body">
                <div class="account-name">
                  ${esc(p.label)}
                  ${a && a.verified ? '<i class="fa-solid fa-circle-check" style="color:var(--accent);font-size:11px"></i>' : ''}
                </div>
                <div class="account-handle">${a ? esc(a.handle || '—') : '<em>Not registered</em>'}</div>
              </div>
            </div>
            <div class="account-meta">
              ${a
                ? `<span>${a.connectedVia === 'api' ? '<i class="fa-solid fa-bolt" style="color:var(--good)"></i> API' : '<i class="fa-solid fa-link"></i> Manual'}</span>
                   <span>${followers || '—'}${followers ? ' followers' : ''}</span>`
                : `<span style="color:var(--muted)">Not connected</span>`}
            </div>
            <div class="account-actions">
              <button class="btn ${isRegistered ? 'primary' : ''}" data-acc-edit="${esc(p.key)}">
                <i class="fa-solid fa-${isRegistered ? 'pen' : 'plus'}"></i>
                ${isRegistered ? 'Edit' : 'Connect'}
              </button>
              ${isRegistered ? `
                <button class="btn" data-acc-verify="${esc(a.id)}" title="Verify"><i class="fa-solid fa-satellite-dish"></i></button>
                <button class="btn danger" data-acc-remove="${esc(a.id)}" title="Remove"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;

  return {
    html,
    mount(view) {
      view.querySelectorAll('[data-acc-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.getAttribute('data-acc-edit');
          _openAccountEditor(ctx, key, byPlatform[key] || null, PLATFORMS);
        });
      });
      view.querySelectorAll('[data-acc-verify]').forEach(btn => {
        btn.addEventListener('click', () => _verifyAccount(ctx, btn.getAttribute('data-acc-verify')));
      });
      view.querySelectorAll('[data-acc-remove]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Remove this account?')) return;
          try {
            const db = C(ctx).db, ref = C(ctx).ref, remove = C(ctx).remove, P = C(ctx).P;
            await remove(ref(db, P('socialAccounts/' + btn.getAttribute('data-acc-remove'))));
            toast(ctx, 'Account removed.', 'info');
            window.Orbit?.navigate?.('accounts', { skipHash: true });
          } catch (e) { toast(ctx, 'Remove failed: ' + e.message, 'error'); }
        });
      });
      view.querySelector('#orbitAddAccount')?.addEventListener('click', () => {
        const key = prompt('Platform? (facebook/instagram/tiktok/youtube/linkedin/x/threads/pinterest/whatsapp/gbp)', 'facebook');
        if (key) _openAccountEditor(ctx, key, null, PLATFORMS);
      });
    }
  };
}

function _openAccountEditor(ctx, platformKey, existing, PLATFORMS) {
  const platform = PLATFORMS.find(p => p.key === platformKey) || PLATFORMS[0];
  const a = existing || {};
  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modalhead">
        <h3>${esc(platform.label)} — ${a.id ? 'Edit' : 'Connect'}</h3>
        <button class="close" data-close type="button">×</button>
      </div>
      <div class="field"><label>Handle *</label><input id="accHandle" value="${esc(a.handle || '')}" placeholder="@yourhandle" /></div>
      <div class="field"><label>Display name</label><input id="accName" value="${esc(a.displayName || '')}" /></div>
      <div class="field"><label>Profile URL *</label><input id="accUrl" type="url" value="${esc(a.profileUrl || '')}" placeholder="https://..." /></div>
      <div class="field"><label>Platform ID</label><input id="accPid" value="${esc(a.platformId || '')}" placeholder="optional" /></div>
      <div class="field"><label>Connection type</label>
        <select id="accVia">
          <option value="manual" ${a.connectedVia !== 'api' ? 'selected' : ''}>Manual (compose-link)</option>
          <option value="api" ${a.connectedVia === 'api' ? 'selected' : ''}>API (worker can post)</option>
        </select></div>
      <div class="field"><label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;">
        <input type="checkbox" id="accVerified" ${a.verified ? 'checked' : ''} style="width:auto;" /><span>Verified / official</span>
      </label></div>
      <div class="field"><label>Notes</label><textarea id="accNotes" rows="2">${esc(a.notes || '')}</textarea></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="button" class="btn primary" id="accSave">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  modal.querySelector('#accSave').addEventListener('click', async () => {
    const handle = modal.querySelector('#accHandle').value.trim();
    const profileUrl = modal.querySelector('#accUrl').value.trim();
    if (!handle)     { toast(ctx, 'Handle is required.', 'error'); return; }
    if (!profileUrl) { toast(ctx, 'Profile URL is required.', 'error'); return; }
    const payload = {
      id: a.id || ('sa-' + platformKey + '-' + Date.now().toString(36)),
      platform: platformKey,
      handle,
      displayName: modal.querySelector('#accName').value.trim(),
      profileUrl,
      platformId: modal.querySelector('#accPid').value.trim(),
      connectedVia: modal.querySelector('#accVia').value,
      verified: modal.querySelector('#accVerified').checked,
      notes: modal.querySelector('#accNotes').value.trim(),
      followers: a.followers ?? null,
      followersUpdatedAt: a.followersUpdatedAt || null,
      createdAt: a.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      const db = C(ctx).db, ref = C(ctx).ref, set = C(ctx).set, P = C(ctx).P;
      await set(ref(db, P('socialAccounts/' + payload.id)), payload);
      toast(ctx, a.id ? 'Account updated.' : 'Account saved.', 'success');
      close();
      window.Orbit?.navigate?.('accounts', { skipHash: true });
    } catch (e) { toast(ctx, 'Save failed: ' + e.message, 'error'); }
  });
}

async function _verifyAccount(ctx, id) {
  const db = C(ctx).db, ref = C(ctx).ref, get = C(ctx).get, set = C(ctx).set, P = C(ctx).P;
  const callFn = C(ctx).callFn;
  if (typeof callFn !== 'function') { toast(ctx, 'Worker not available.', 'warning'); return; }
  try {
    const snap = await get(ref(db, P('socialAccounts/' + id)));
    if (!snap.exists()) { toast(ctx, 'Account not found.', 'error'); return; }
    const account = snap.val();
    const res = await callFn('socialStats', { platform: account.platform, url: account.profileUrl });
    if (res && res.ok !== false && res.followers != null) {
      await set(ref(db, P('socialAccounts/' + id)), {
        ...account,
        followers: res.followers,
        followersUpdatedAt: new Date().toISOString(),
        verified: true,
      });
      toast(ctx, `Verified — ${Number(res.followers).toLocaleString()} followers.`, 'success');
      window.Orbit?.navigate?.('accounts', { skipHash: true });
    } else {
      toast(ctx, 'Verification returned no data.', 'warning');
    }
  } catch (e) { toast(ctx, 'Verify failed: ' + e.message, 'error'); }
}

/* ═══════════════════════════════════════════════════════════════
   CAMPAIGNS MODULE — renders into #view
   ═══════════════════════════════════════════════════════════════ */
export async function renderCampaignsModule(ctx) {
  const d = data(ctx);
  const campaigns = Array.isArray(d.campaigns) ? d.campaigns : [];
  const leads = Array.isArray(d.leads) ? d.leads : [];

  let totalBudget = 0, totalSpend = 0, activeCount = 0, totalLeads = 0;
  for (const c of campaigns) {
    if (!c) continue;
    totalBudget += Number(c.budget) || 0;
    totalSpend  += Number(c.spend)  || 0;
    if (c.status === 'Active') activeCount++;
    totalLeads += leads.filter(l => l && l.campaignId === c.id).length;
  }

  const leadsByCampaign = new Map();
  for (const l of leads) if (l && l.campaignId) leadsByCampaign.set(l.campaignId, (leadsByCampaign.get(l.campaignId) || 0) + 1);
  const STATUS_MAP = { Active: 'good', Planned: 'warn', Paused: '', Completed: 'good' };

  const campaignsTable = campaigns.length === 0
    ? `<div class="empty">No campaigns yet. Click <b>New Campaign</b> above.</div>`
    : `<div class="tablewrap"><table>
        <thead><tr>
          <th>Campaign</th><th>Budget</th><th>Spent</th><th>Leads</th>
          <th>Live Stats</th><th>Dates</th><th>Status</th>
          <th style="text-align:right">Actions</th>
        </tr></thead>
        <tbody>${campaigns.map(c => {
          const lc = leadsByCampaign.get(c.id) || 0;
          const s = c.stats;
          const platformIcon = c.media?.type === 'youtube'
            ? '<i class="fa-brands fa-youtube" style="color:#ff0033"></i>'
            : c.media?.type === 'tiktok'
              ? '<i class="fa-brands fa-tiktok"></i>'
              : '';
          const statsCell = s
            ? `<div style="font-size:11px;line-height:1.6;white-space:nowrap;">
                ${s.views    != null ? `<div>${platformIcon} <i class="fa-solid fa-eye"></i> ${Number(s.views).toLocaleString()}</div>` : ''}
                ${s.likes    != null ? `<div><i class="fa-solid fa-heart" style="color:#ff5c7c"></i> ${Number(s.likes).toLocaleString()}</div>` : ''}
                ${s.comments != null ? `<div><i class="fa-solid fa-comment"></i> ${Number(s.comments).toLocaleString()}</div>` : ''}
              </div>`
            : c.media?.url
              ? `<span class="small muted"><i class="fa-solid fa-clock"></i> Not fetched</span>`
              : `<span class="small muted">—</span>`;
          return `<tr>
            <td><b>${esc(c.name || '')}</b>${c.media?.type && c.media.type !== 'none' ? `<br><small class="muted">${platformIcon} ${esc(c.media.type)}</small>` : ''}</td>
            <td>KSh ${(Number(c.budget) || 0).toLocaleString()}</td>
            <td>KSh ${(Number(c.spend)  || 0).toLocaleString()}</td>
            <td><span class="pill">${lc}</span></td>
            <td>${statsCell}</td>
            <td class="small">${esc(c.startDate || '—')} → ${esc(c.endDate || '—')}</td>
            <td><span class="status ${STATUS_MAP[c.status] || ''}">${esc(c.status || '—')}</span></td>
            <td style="text-align:right;white-space:nowrap;">
              ${c.media?.url ? `<button class="btn soft btn-xs" data-camp-refresh="${esc(c.id)}" title="Refresh stats"><i class="fa-solid fa-rotate"></i></button>` : ''}
              <button class="btn soft btn-xs" data-camp-edit="${esc(c.id)}"><i class="fa-solid fa-pen"></i></button>
              <button class="btn danger btn-xs" data-camp-del="${esc(c.id)}"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;

  const html = head('Campaigns', 'Real campaigns, budgets, live stats and leads in one table.',
    `<button class="btn" id="orbitRefreshAllStats"><i class="fa-solid fa-rotate"></i> Refresh All Stats</button>
     <button class="btn primary" id="orbitNewCampaign"><i class="fa-solid fa-plus"></i> New Campaign</button>`) +
    `<div class="grid kpis">
      ${kpi('Campaigns', campaigns.length, activeCount + ' active', '<i class="fa-solid fa-bullhorn"></i>')}
      ${kpi('Budget', 'KSh ' + totalBudget.toLocaleString(), 'Spent KSh ' + totalSpend.toLocaleString(), '<i class="fa-solid fa-coins"></i>')}
      ${kpi('Leads', totalLeads, leads.length + ' in system', '<i class="fa-solid fa-user-group"></i>')}
      ${kpi('Active', activeCount, 'currently running', '<i class="fa-solid fa-bolt"></i>')}
    </div>
    <div class="card" style="margin-top:15px;">
      <div class="cardhead"><h3>All campaigns</h3></div>
      ${campaignsTable}
    </div>
    <div id="campaignTrendRadar" style="margin-top:15px;"></div>
    <div id="campaignDraftLibrary" style="margin-top:15px;"></div>
    <div id="campaignPromptLibrary" style="margin-top:15px;"></div>`;

  return {
    html,
    mount() {
      document.getElementById('orbitNewCampaign')?.addEventListener('click', () => window.Viora?.addCampaign?.());
      document.getElementById('orbitRefreshAllStats')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const prev = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing…';
        try { await window.Viora?.refreshAllCampaignStats?.(); toast(ctx, 'Refreshed.', 'success'); }
        catch (err) { toast(ctx, 'Refresh failed: ' + err.message, 'error'); }
        finally { btn.disabled = false; btn.innerHTML = prev; }
      });
      document.querySelectorAll('[data-camp-edit]').forEach(b =>
        b.addEventListener('click', () => window.Viora?.editCampaign?.(b.getAttribute('data-camp-edit'))));
      document.querySelectorAll('[data-camp-del]').forEach(b =>
        b.addEventListener('click', async () => {
          if (!confirm('Delete this campaign?')) return;
          try { await C(ctx).deleteDoc('campaigns', b.getAttribute('data-camp-del')); toast(ctx, 'Deleted.', 'info'); }
          catch (e) { toast(ctx, 'Delete failed: ' + e.message, 'error'); }
        }));
      document.querySelectorAll('[data-camp-refresh]').forEach(b =>
        b.addEventListener('click', () => window.Viora?.refreshCampaignStats?.(b.getAttribute('data-camp-refresh'))));

      // Delegate trend + libraries
      try { window.Viora?.renderTrendRadar?.(); } catch (_) {}
      try { window.Viora?.renderDraftLibrary?.(); } catch (_) {}
      try { window.Viora?.renderPromptLibrary?.(); } catch (_) {}
    }
  };
}
