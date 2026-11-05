// main/orbit-modules.js — v3.0 (full CRUD, no stubs, working delete + followers)
// ═══════════════════════════════════════════════════════════════
// Every module is fully wired to real Firebase + worker routes.
// Inbox delegates to ./inbox.js.
// Agents use ./agent-runner.js with graceful worker fallback.
//
// v3.0 changes:
//   • renderOverview pulls followers from followers/stats.followers/followersCache
//   • renderOverview renders per-platform stats from published posts
//   • renderAccountsModule delegates deletes to deleteAccount() from campaign-accounts.js
//   • Post Library filter state persists between renders
// ═══════════════════════════════════════════════════════════════
import {
  renderDraftLibrary,
  renderPromptLibrary,
  openComposer,
  openComposerForDraft,
} from './campaign-ai.js';
import { renderAnalyticsDashboard } from './campaign-analytics.js';
import {
  groupPostsByFanout,
  summarizeFanout,
  statsHistoryFor,
  combineStatsHistory,
  engagementRateFor,
  toUtcIso,
  readImageFile,
  platformMeta as _platformMeta,
} from './campaign-utils.js';
import { deleteAccount as _deleteAccountHelper } from './campaign-accounts.js';
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

/* ── Local numeric helpers ── */
function sumBy(arr, fn) {
  let total = 0;
  for (const x of arr) total += Number(fn(x)) || 0;
  return total;
}
function fmtNumShort(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}
function platformMetaSafe(key) {
  const map = {
    facebook:  { label: 'Facebook',       icon: 'fa-brands fa-facebook',  color: '#1877f2' },
    instagram: { label: 'Instagram',      icon: 'fa-brands fa-instagram', color: '#e1306c' },
    tiktok:    { label: 'TikTok',         icon: 'fa-brands fa-tiktok',    color: '#ff0050' },
    youtube:   { label: 'YouTube',        icon: 'fa-brands fa-youtube',   color: '#ff0033' },
    linkedin:  { label: 'LinkedIn',       icon: 'fa-brands fa-linkedin',  color: '#0a66c2' },
    x:         { label: 'X / Twitter',    icon: 'fa-brands fa-x-twitter', color: '#000000' },
    twitter:   { label: 'X / Twitter',    icon: 'fa-brands fa-x-twitter', color: '#000000' },
    threads:   { label: 'Threads',        icon: 'fa-brands fa-threads',   color: '#000000' },
    pinterest: { label: 'Pinterest',      icon: 'fa-brands fa-pinterest', color: '#e60023' },
    whatsapp:  { label: 'WhatsApp',       icon: 'fa-brands fa-whatsapp',  color: '#25d366' },
    gbp:       { label: 'Google Business', icon: 'fa-brands fa-google',   color: '#4285f4' },
  };
  return map[key] || { label: key || 'Unknown', icon: 'fa-solid fa-globe', color: '#94a3b8' };
}

/* ═══════════════════════════════════════════════════════════════
   OVERVIEW
   ═══════════════════════════════════════════════════════════════ */
export async function renderOverview(ctx) {
  const d = data(ctx);
  const campaigns = Array.isArray(d.campaigns) ? d.campaigns : [];
  const leads     = Array.isArray(d.leads)     ? d.leads     : [];
  const orders    = Array.isArray(d.orders)    ? d.orders    : [];
  const accounts  = Array.isArray(d.socialAccounts) ? d.socialAccounts : [];

  /* Campaign aggregates */
  let totalBudget = 0, totalSpend = 0, activeCount = 0, totalLeads = 0;
  for (const c of campaigns) {
    if (!c) continue;
    totalBudget += Number(c.budget) || 0;
    totalSpend  += Number(c.spend)  || 0;
    if (c.status === 'Active') activeCount++;
    totalLeads += leads.filter(l => l && l.campaignId === c.id).length;
  }

  const paidOrders = orders.filter(o => o && o.paymentStatus === 'paid').length;
  const revenue = orders
    .filter(o => o && o.paymentStatus === 'paid')
    .reduce((s, o) => s + (Number(o.totalKES) || 0), 0);

  /* ── Social analytics aggregate ──
     Flatten every published post with stats, then total up. */
  const allPublished = [];
  for (const c of campaigns) {
    for (const p of (c.posts || [])) {
      if (p && p.status === 'published' && p.stats) {
        allPublished.push({ ...p, _campaignName: c.name });
      }
    }
  }

  const social = {
    totalPosts: allPublished.length,
    views:      sumBy(allPublished, p => Number(p.stats.views)    || 0),
    likes:      sumBy(allPublished, p => Number(p.stats.likes)    || 0),
    comments:   sumBy(allPublished, p => Number(p.stats.comments) || 0),
    shares:     sumBy(allPublished, p => Number(p.stats.shares)   || 0),
  };
  social.interactions = social.likes + social.comments + social.shares;
  social.engagementRate = social.views > 0
    ? Math.round((social.interactions / social.views) * 10000) / 100
    : 0;

  /* Followers can live in 3 places — pick the freshest source per account */
  const followerFor = (a) =>
    a.followers        != null ? Number(a.followers) :
    a.stats?.followers != null ? Number(a.stats.followers) :
    a.followersCache   != null ? Number(a.followersCache) :
    0;

  const totalFollowers = accounts.reduce((s, a) => s + followerFor(a), 0);

  /* Per-platform breakdown */
  const byPlatform = {};
  for (const p of allPublished) {
    const k = p.platform || 'unknown';
    if (!byPlatform[k]) byPlatform[k] = { views: 0, likes: 0, comments: 0, shares: 0, posts: 0 };
    byPlatform[k].views    += Number(p.stats.views)    || 0;
    byPlatform[k].likes    += Number(p.stats.likes)    || 0;
    byPlatform[k].comments += Number(p.stats.comments) || 0;
    byPlatform[k].shares   += Number(p.stats.shares)   || 0;
    byPlatform[k].posts++;
  }

  /* Accounts grid */
  const accountsGrid = accounts.length === 0
    ? `<div class="empty" style="padding:16px;">No social accounts connected. <button class="btn soft btn-sm" data-orbit-goto="accounts">Connect →</button></div>`
    : accounts.map(a => {
        const meta = platformMetaSafe(a.platform);
        const fc = followerFor(a);
        const followerLabel = fc > 0
          ? fc.toLocaleString() + ' followers'
          : (a.connectedVia === 'api' ? 'Not fetched yet' : '— followers');
        return `
          <div class="account-card" style="--platform-color:${meta.color};">
            <div class="account-head">
              <div class="account-ico"><i class="${meta.icon}"></i></div>
              <div class="account-body">
                <div class="account-name">${esc(meta.label)}</div>
                <div class="account-handle">${esc(a.handle || '—')}</div>
              </div>
            </div>
            <div class="account-meta">
              <span>${followerLabel}</span>
              <span>${a.connectedVia === 'api' ? '⚡ API' : '🔗 Manual'}</span>
            </div>
          </div>`;
      }).join('');

  /* Platform rows */
  const platformRows = Object.entries(byPlatform)
    .sort((a, b) => b[1].views - a[1].views)
    .map(([k, s]) => {
      const meta = platformMetaSafe(k);
      const er = s.views > 0 ? ((s.likes + s.comments + s.shares) / s.views) * 100 : 0;
      return `
        <tr>
          <td><i class="${meta.icon}" style="color:${meta.color};margin-right:6px;"></i>${esc(meta.label)}</td>
          <td>${s.posts}</td>
          <td>${fmtNumShort(s.views)}</td>
          <td>${fmtNumShort(s.likes)}</td>
          <td>${fmtNumShort(s.comments)}</td>
          <td>${fmtNumShort(s.shares)}</td>
          <td><strong>${er.toFixed(1)}%</strong></td>
        </tr>`;
    }).join('');

  const recentCampaigns = campaigns
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 5);

  return head('Overview', 'Live snapshot of your marketing command centre.', '') +
    `<div class="grid kpis">
      ${kpi('Total Reach', fmtNumShort(social.views), social.totalPosts + ' published posts', '<i class="fa-solid fa-eye"></i>')}
      ${kpi('Engagement', fmtNumShort(social.interactions), social.engagementRate.toFixed(2) + '% ER', '<i class="fa-solid fa-heart"></i>')}
      ${kpi('Followers', fmtNumShort(totalFollowers), accounts.length + ' connected accounts', '<i class="fa-solid fa-users"></i>')}
      ${kpi('Campaigns', campaigns.length, activeCount + ' active · KSh ' + totalBudget.toLocaleString() + ' budget', '<i class="fa-solid fa-bullhorn"></i>')}
    </div>

    <div class="grid two" style="margin-top:15px;">
      <div class="card">
        <div class="cardhead">
          <h3><i class="fa-solid fa-chart-simple"></i> Social performance</h3>
          <button class="btn soft btn-sm" data-orbit-goto="analytics">Details →</button>
        </div>
        ${platformRows.length === 0
          ? '<div class="empty">No published posts yet — their stats appear here after the first refresh cycle.</div>'
          : `<div class="tablewrap"><table>
              <thead><tr>
                <th>Platform</th><th>Posts</th><th>Views</th><th>Likes</th>
                <th>Comments</th><th>Shares</th><th>ER</th>
              </tr></thead>
              <tbody>${platformRows}</tbody>
            </table></div>`}
      </div>
      <div class="card">
        <div class="cardhead">
          <h3><i class="fa-solid fa-share-nodes"></i> Connected channels</h3>
          <button class="btn soft btn-sm" data-orbit-goto="accounts">Manage →</button>
        </div>
        <div class="accounts-grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));">
          ${accountsGrid}
        </div>
      </div>
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
        <div class="cardhead"><h3>Revenue & leads</h3></div>
        <div style="padding:14px 0;">
          <div class="kpi-value">KSh ${revenue.toLocaleString()}</div>
          <div class="small muted">${paidOrders} paid orders</div>
        </div>
        <div style="padding:14px 0;border-top:1px solid var(--line);">
          <div class="kpi-value">${totalLeads}</div>
          <div class="small muted">Leads attributed to campaigns</div>
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   ACCOUNTS MODULE
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

  const followerFor = (a) =>
    a.followers        != null ? Number(a.followers) :
    a.stats?.followers != null ? Number(a.stats.followers) :
    a.followersCache   != null ? Number(a.followersCache) :
    null;

  const html = head('Social accounts', 'Register each platform once. The composer and stats pull from here.',
    '<button class="btn primary" id="orbitAddAccount"><i class="fa-solid fa-plus"></i> Add account</button>') +
    `<div class="accounts-grid" style="margin-top:15px;">
      ${PLATFORMS.map(p => {
        const a = byPlatform[p.key];
        const isRegistered = !!a;
        const fc = a ? followerFor(a) : null;
        const followers = fc != null ? Number(fc).toLocaleString() : null;
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
                   <span>${followers || (a.connectedVia === 'api' ? 'Not fetched yet' : '—')}${followers ? ' followers' : ''}</span>`
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
          const id = btn.getAttribute('data-acc-remove');
          if (!id) return;
          if (!confirm('Remove this account?')) return;
          await _deleteAccountHelper(id);
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
      /* subscriber will re-render */
    } catch (e) { toast(ctx, 'Save failed: ' + e.message, 'error'); }
  });
}

async function _verifyAccount(ctx, id) {
  const db = C(ctx).db, ref = C(ctx).ref, get = C(ctx).get, set = C(ctx).set, P = C(ctx).P;
  const callFn = C(ctx).callFn;
  const state = C(ctx).state;

  if (typeof callFn !== 'function') { toast(ctx, 'Worker not available.', 'warning'); return; }

  const path = P('socialAccounts/' + id);
  console.log('[verify] path:', path);
  console.log('[verify] db ready:', !!db, 'ref ready:', !!ref, 'set ready:', !!set);

  try {
    const snap = await get(ref(db, path));
    if (!snap.exists()) { toast(ctx, 'Account not found.', 'error'); return; }
    const account = snap.val();
    console.log('[verify] account loaded:', { platform: account.platform, handle: account.handle, followers: account.followers });

    const res = await callFn('socialStats', { platform: account.platform, url: account.profileUrl });
    console.log('[verify] worker response:', res);

    if (!res || res.ok === false) {
      toast(ctx, res?.error || 'Worker returned no data.', 'warning');
      return;
    }

    if (res.followers == null) {
      toast(ctx, 'Worker returned no follower count.', 'warning');
      return;
    }

    const updated = {
      ...account,
      followers: res.followers,
      followersUpdatedAt: new Date().toISOString(),
      verified: true,
    };

    /* ── Write to Firebase ── */
    try {
      await set(ref(db, path), updated);
            try {
        const historyPath = path + '/followersHistory';
        const historySnap = await get(ref(db, historyPath));
        const history = historySnap.exists() ? (historySnap.val() || []) : [];
        history.push({
          ts: new Date().toISOString(),
          followers: Number(res.followers) || 0,
          source: res.source || 'verify',
        });
        if (history.length > 90) history.splice(0, history.length - 90);
        await set(ref(db, historyPath), history);
      } catch (histErr) {
        console.warn('[verify] history append failed:', histErr.message);
      }
      console.log('[verify] WRITE SUCCESS:', { followers: res.followers });

      /* Verify the write by reading back */
      const verify = await get(ref(db, path));
      const readBack = verify.val();
      console.log('[verify] read-back:', { followers: readBack?.followers, verified: readBack?.verified });

      if (readBack?.followers !== res.followers) {
        console.warn('[verify] READ-BACK MISMATCH — write may have been rejected by Firebase rules');
        toast(ctx, 'Saved locally but Firebase rejected the write. Check rules.', 'warning');
      }
    } catch (writeErr) {
      console.error('[verify] WRITE FAILED:', writeErr);
      console.error('[verify] writeErr.code:', writeErr?.code);
      console.error('[verify] writeErr.message:', writeErr?.message);
      toast(ctx, 'Save to Firebase failed: ' + (writeErr.message || 'unknown'), 'error');
      return;
    }

    /* ── Update local state so the render picks it up immediately ── */
    if (state?.data?.socialAccounts) {
      state.data.socialAccounts = state.data.socialAccounts.map(a =>
        a && a.id === id ? { ...a, ...updated } : a
      );
      console.log('[verify] state updated:', state.data.socialAccounts.find(a => a.id === id));
    }

    /* ── Force re-render ── */
    try {
      if (window.Orbit?.renderActiveOrbitModule) {
        window.Orbit.renderActiveOrbitModule();
        console.log('[verify] re-render triggered');
      }
    } catch (e) { console.warn('[verify] re-render failed:', e); }

    toast(ctx, `Verified — ${Number(res.followers).toLocaleString()} followers.`, 'success');
  } catch (e) {
    console.error('[verify] FATAL:', e);
    toast(ctx, 'Verify failed: ' + (e.message || 'unknown'), 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   CAMPAIGNS MODULE
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

    <div id="campaignPostLibrary" style="margin-top:15px;"></div>
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
          try {
            await C(ctx).deleteDoc('campaigns', b.getAttribute('data-camp-del'));
            toast(ctx, 'Deleted.', 'info');
            window.Orbit?.renderActiveOrbitModule?.();
          } catch (e) {
            toast(ctx, 'Delete failed: ' + e.message, 'error');
          }
        }));
      document.querySelectorAll('[data-camp-refresh]').forEach(b =>
        b.addEventListener('click', () => window.Viora?.refreshCampaignStats?.(b.getAttribute('data-camp-refresh'))));

      try { renderPostLibrary(ctx); } catch (e) { console.warn('[post-library] mount failed', e); }
      try { window.Viora?.renderTrendRadar?.(); } catch (_) {}
      try { window.Viora?.renderDraftLibrary?.(); } catch (_) {}
      try { window.Viora?.renderPromptLibrary?.(); } catch (_) {}
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   POST LIBRARY
   ═══════════════════════════════════════════════════════════════ */
const _postLibState = {
  filterStatus: 'all',
  filterPlatform: 'all',
  filterCampaign: 'all',
  search: '',
  grouped: [],
};

export function renderPostLibrary(ctx) {
  const host = document.getElementById('campaignPostLibrary');
  if (!host) return;

  const c = C(ctx);
  const state = c.state || { data: {} };
  const campaigns = Array.isArray(state.data?.campaigns) ? state.data.campaigns : [];

  const allPosts = [];
  for (const camp of campaigns) {
    if (!camp || !Array.isArray(camp.posts)) continue;
    for (const p of camp.posts) {
      if (!p) continue;
      allPosts.push({ ...p, _campaignId: camp.id, _campaignName: camp.name });
    }
  }

  const groups = groupPostsByFanout(allPosts);

  const filtered = groups.filter(group => {
    if (!group.length) return false;
    const summary = summarizeFanout(group);

    if (_postLibState.filterStatus !== 'all') {
      const agg = summary.aggregateStatus;
      if (_postLibState.filterStatus === 'scheduled' && agg !== 'scheduled') return false;
      if (_postLibState.filterStatus === 'draft' && agg !== 'draft') return false;
      if (_postLibState.filterStatus === 'published' && agg !== 'published') return false;
      if (_postLibState.filterStatus === 'compose-only' && agg !== 'compose-only') return false;
      if (_postLibState.filterStatus === 'failed' && agg !== 'failed') return false;
    }

    if (_postLibState.filterPlatform !== 'all') {
      if (!summary.platforms.includes(_postLibState.filterPlatform)) return false;
    }

    if (_postLibState.filterCampaign !== 'all') {
      if (!group.some(p => p._campaignId === _postLibState.filterCampaign)) return false;
    }

    if (_postLibState.search) {
      const q = _postLibState.search.toLowerCase();
      const hits = group.some(p =>
        (p.caption || '').toLowerCase().includes(q) ||
        (p.platform || '').toLowerCase().includes(q) ||
        (p._campaignName || '').toLowerCase().includes(q)
      );
      if (!hits) return false;
    }

    return true;
  });

  _postLibState.grouped = filtered;

  let totalPosts = 0, totalFanouts = filtered.length;
  for (const g of filtered) totalPosts += g.length;

  const campaignOptions = campaigns
    .filter(cc => cc && cc.id)
    .map(cc => `<option value="${esc(cc.id)}" ${_postLibState.filterCampaign === cc.id ? 'selected' : ''}>${esc(cc.name || 'Untitled')}</option>`)
    .join('');

  const allPlatforms = new Set();
  for (const p of allPosts) if (p.platform) allPlatforms.add(p.platform);
  const platformOptions = Array.from(allPlatforms).sort()
    .map(k => {
      const m = _platformMeta(k);
      return `<option value="${esc(k)}" ${_postLibState.filterPlatform === k ? 'selected' : ''}>${esc(m.label || k)}</option>`;
    }).join('');

  host.innerHTML = `
    <div class="card">
      <div class="cardhead">
        <h3><i class="fa-solid fa-layer-group"></i> Post Library
          <span class="pill" style="margin-left:6px;">${totalFanouts} fanout${totalFanouts === 1 ? '' : 's'} · ${totalPosts} post${totalPosts === 1 ? '' : 's'}</span>
        </h3>
      </div>

      <div class="plib-toolbar">
        <div class="plib-filters" role="tablist">
          ${['all','published','scheduled','draft','compose-only','failed'].map(st => `
            <button type="button" class="plib-filter-btn ${_postLibState.filterStatus === st ? 'active' : ''}"
                    data-plib-status="${st}" role="tab">
              ${st === 'all' ? 'All' : st.charAt(0).toUpperCase() + st.slice(1).replace('-', ' ')}
            </button>
          `).join('')}
        </div>
        <div class="plib-search-row">
          <input id="plibSearch" type="search" placeholder="Search caption, platform, campaign…" value="${esc(_postLibState.search)}" />
          <select id="plibFilterPlatform">
            <option value="all">All platforms</option>
            ${platformOptions}
          </select>
          <select id="plibFilterCampaign">
            <option value="all">All campaigns</option>
            ${campaignOptions}
          </select>
          ${(_postLibState.filterStatus !== 'all' || _postLibState.filterPlatform !== 'all' || _postLibState.filterCampaign !== 'all' || _postLibState.search)
            ? `<button type="button" class="btn soft btn-sm" id="plibClear">Clear</button>`
            : ''}
          <button type="button" class="btn primary btn-sm" id="plibImportBtn" title="Import an existing post by URL">
            <i class="fa-solid fa-file-import"></i> Import post
          </button>
        </div>
      </div>

      <div class="plib-grid">
        ${filtered.length === 0
          ? (allPosts.length === 0
              ? `<div class="plib-empty">
                   <i class="fa-solid fa-inbox" style="font-size:2rem;opacity:.35;display:block;margin-bottom:10px;"></i>
                   <div class="plib-empty-title">No posts yet</div>
                   <div class="plib-empty-sub">Content you generate in Creative Studio or the AI composer appears here once saved.</div>
                   <button type="button" class="btn primary btn-sm" style="margin-top:12px;"
                     onclick="window.Orbit && window.Orbit.navigate && window.Orbit.navigate('creative')">
                     Open Creative Studio →
                   </button>
                 </div>`
              : `<div class="plib-empty">
                   <i class="fa-solid fa-filter-circle-xmark" style="font-size:2rem;opacity:.35;display:block;margin-bottom:10px;"></i>
                   <div class="plib-empty-title">No posts match your filters</div>
                   <div class="plib-empty-sub">${allPosts.length} total post${allPosts.length === 1 ? '' : 's'} exist.</div>
                   <button type="button" class="btn soft btn-sm" style="margin-top:12px;" id="plibClearEmpty">Clear filters</button>
                 </div>`)
          : filtered.map((group, idx) => renderFanoutCard(group, idx)).join('')
        }
      </div>
    </div>
  `;

  host.querySelectorAll('[data-plib-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      _postLibState.filterStatus = btn.getAttribute('data-plib-status');
      renderPostLibrary(ctx);
    });
  });

  const searchEl = host.querySelector('#plibSearch');
  if (searchEl) {
    let t = null;
    searchEl.addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => {
        _postLibState.search = e.target.value || '';
        renderPostLibrary(ctx);
      }, 250);
    });
  }

  const pfEl = host.querySelector('#plibFilterPlatform');
  if (pfEl) pfEl.addEventListener('change', (e) => {
    _postLibState.filterPlatform = e.target.value || 'all';
    renderPostLibrary(ctx);
  });

  const cfEl = host.querySelector('#plibFilterCampaign');
  if (cfEl) cfEl.addEventListener('change', (e) => {
    _postLibState.filterCampaign = e.target.value || 'all';
    renderPostLibrary(ctx);
  });

  const clearBtn = host.querySelector('#plibClear');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    _postLibState.filterStatus = 'all';
    _postLibState.filterPlatform = 'all';
    _postLibState.filterCampaign = 'all';
    _postLibState.search = '';
    renderPostLibrary(ctx);
  });

  const clearEmpty = host.querySelector('#plibClearEmpty');
  if (clearEmpty) clearEmpty.addEventListener('click', () => {
    _postLibState.filterStatus = 'all';
    _postLibState.filterPlatform = 'all';
    _postLibState.filterCampaign = 'all';
    _postLibState.search = '';
    renderPostLibrary(ctx);
  });

  const importBtn = host.querySelector('#plibImportBtn');
  if (importBtn) importBtn.addEventListener('click', () => openImportModal(ctx));

  host.querySelectorAll('[data-plib-card-idx]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-plib-action]')) return;
      const i = Number(card.getAttribute('data-plib-card-idx'));
      const group = filtered[i];
      if (group) openFanoutDetail(ctx, group);
    });
  });

   host.querySelectorAll('[data-plib-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-plib-action');
      const i = Number(btn.getAttribute('data-plib-card-idx'));
      const group = filtered[i];
      if (!group) return;

      if (action === 'view') {
        openFanoutDetail(ctx, group);
      } else if (action === 'refresh') {
        refreshFanoutStats(ctx, group);
      } else if (action === 'post-now') {
        postFanoutNow(ctx, group);
        } else if (action === 'delete') {
        const summary = summarizeFanout(group);
        const count = group.length;
        const label = count === 1 ? 'this post' : `all ${count} posts in this fanout`;
        if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
        try {
          const result = await deleteFanoutPosts(ctx, group);
          if (result.ok) {
            toast(ctx, `Deleted ${result.deleted} post${result.deleted === 1 ? '' : 's'}.`, 'success');
            window.Orbit?.renderActiveOrbitModule?.();
          } else {
            toast(ctx, 'Delete failed: ' + (result.error || 'unknown'), 'error');
          }
        } catch (err) {
          toast(ctx, 'Delete failed: ' + (err.message || 'unknown'), 'error');
        }
      }
    });
  });
}

function renderFanoutCard(group, idx) {
  const summary = summarizeFanout(group);
  const hero = summary.heroPost || group[0];

  const thumb = hero?.imageBase64
    ? `<img src="data:${esc(hero.imageMime || 'image/png')};base64,${esc(hero.imageBase64)}" alt="" />`
    : `<div class="plib-thumb-empty"><i class="fa-solid fa-image"></i></div>`;

  const statusBadge = (() => {
    const st = summary.aggregateStatus;
    const map = {
      published:     ['plib-badge-good',  '🟢 Published'],
      scheduled:     ['plib-badge-warn',  '🟡 Scheduled'],
      draft:         ['plib-badge-gray',  '⚪ Draft'],
      'compose-only':['plib-badge-info',  '🔵 Compose-only'],
      failed:        ['plib-badge-bad',   '🔴 Failed'],
    };
    const [cls, label] = map[st] || map.draft;
    return `<span class="plib-badge ${cls}">${label}</span>`;
  })();

  const chips = group.map(p => {
    const m = _platformMeta(p.platform);
    const st = p.status || 'draft';
    const dot = { published: '🟢', scheduled: '🟡', draft: '⚪', 'compose-only': '🔵', failed: '🔴' }[st] || '⚪';
    return `<span class="plib-chip" title="${esc(p.status || '')}">
      <i class="${m.icon || 'fa-solid fa-globe'}" style="color:${m.color || 'var(--muted)'};"></i>
      ${esc(m.label || p.platform)}
      <span style="margin-left:2px;">${dot}</span>
    </span>`;
  }).join('');

  const previewPost = group.reduce((best, p) =>
    (p.caption || '').length > (best.caption || '').length ? p : best, group[0]);
  const captionPreview = (previewPost?.caption || '').slice(0, 120);

  const total = summary.totalStats;
  const hasAnyStats = group.some(p => p.stats && (p.stats.views != null || p.stats.likes != null));
  const statsHtml = hasAnyStats
    ? `<div class="plib-stats">
         <span title="Total views"><i class="fa-solid fa-eye"></i> ${fmtNumShort(total.views)}</span>
         <span title="Total likes"><i class="fa-solid fa-heart" style="color:#ff5c7c;"></i> ${fmtNumShort(total.likes)}</span>
         <span title="Total comments"><i class="fa-solid fa-comment"></i> ${fmtNumShort(total.comments)}</span>
         <span title="Total shares"><i class="fa-solid fa-retweet"></i> ${fmtNumShort(total.shares)}</span>
         <span title="Engagement rate" class="plib-er">${summary.overallEngagementRate.toFixed(1)}% ER</span>
       </div>`
    : `<div class="plib-stats plib-stats-empty">
         ${summary.aggregateStatus === 'scheduled'
           ? `⏰ Scheduled — stats appear after publish`
           : summary.aggregateStatus === 'draft'
             ? `📝 Draft — not published yet`
             : `— no stats yet`}
       </div>`;

  const campaignName = hero?._campaignName || '—';

   const actionsHtml = (() => {
    const buttons = [
      `<button type="button" class="btn soft btn-sm" data-plib-action="view" data-plib-card-idx="${idx}">View</button>`,
    ];
    if (summary.aggregateStatus === 'published') {
      buttons.push(`<button type="button" class="btn soft btn-sm" data-plib-action="refresh" data-plib-card-idx="${idx}" title="Refresh stats"><i class="fa-solid fa-rotate"></i></button>`);
    }
    if (summary.aggregateStatus === 'draft' || summary.aggregateStatus === 'scheduled') {
      buttons.push(`<button type="button" class="btn primary btn-sm" data-plib-action="post-now" data-plib-card-idx="${idx}">Post now →</button>`);
    }
    /* Delete is always available — user can remove drafts, failed posts,
       or even published posts (they just won't be deleted from the
       external platform). */
    buttons.push(
      `<button type="button" class="btn danger btn-sm" data-plib-action="delete" data-plib-card-idx="${idx}" title="Delete"><i class="fa-solid fa-trash"></i></button>`
    );
    return buttons.join('');
  })();

  const schedPost = group.find(p => p.status === 'scheduled');
  const scheduledHtml = schedPost?.scheduledFor
    ? `<div class="plib-scheduled">
         <i class="fa-solid fa-clock"></i>
         Scheduled for ${esc(fmtSchedDate(schedPost.scheduledFor))}
       </div>`
    : '';

  return `
    <div class="plib-card" data-plib-card-idx="${idx}" role="button" tabindex="0">
      <div class="plib-thumb">${thumb}</div>
      <div class="plib-body">
        <div class="plib-head">
          ${statusBadge}
          <span class="plib-campaign">${esc(campaignName)}</span>
        </div>
        <div class="plib-caption">${esc(captionPreview || '(no caption)')}${(previewPost?.caption || '').length > 120 ? '…' : ''}</div>
        <div class="plib-chips">${chips}</div>
        ${scheduledHtml}
        ${statsHtml}
        <div class="plib-actions">${actionsHtml}</div>
      </div>
    </div>
  `;
}

function fmtSchedDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return String(iso);
  }
}

async function refreshFanoutStats(ctx, group) {
  const c = C(ctx);
  const published = group.filter(p => p.status === 'published' && (p.media?.url || p.url));
  if (!published.length) { toast(ctx, 'No published posts to refresh.', 'info'); return; }

  toast(ctx, `Refreshing ${published.length} post${published.length === 1 ? '' : 's'}…`, 'info');
  let ok = 0, fail = 0;
  for (const p of published) {
    try {
      const url = p.url || p.media?.url;
      const type = p.platform || p.media?.type;
      if (!url || !type) continue;
      await c.fetchCampaignStats?.(p.campaignId || p._campaignId, type, url);
      ok++;
    } catch (_) { fail++; }
  }
  if (ok > 0) toast(ctx, `Refreshed ${ok} post${ok === 1 ? '' : 's'}${fail ? ` · ${fail} failed` : ''}.`, 'success');
  else toast(ctx, 'Refresh failed for all posts.', 'error');
  try { renderPostLibrary(ctx); } catch (_) {}
}

async function postFanoutNow(ctx, group) {
  const c = C(ctx);
  const toPost = group.filter(p => (p.status === 'draft' || p.status === 'scheduled'));
  if (!toPost.length) { toast(ctx, 'Nothing in this group to post.', 'info'); return; }

  if (!confirm(`Post ${toPost.length} platform${toPost.length === 1 ? '' : 's'} now?`)) return;

  const targets = toPost.map(p => ({
    platform: p.platform,
    caption: p.caption || '',
    hashtags: p.hashtags || [],
    imageBase64: p.imageBase64 || null,
    imageMime: p.imageMime || 'image/png',
    utmUrl: p.url || '',
  }));

  try {
    const res = await c.callFn('social/post/fanout', { targets });
    if (res && Array.isArray(res.results)) {
      const ok = res.results.filter(r => r.ok).length;
      toast(ctx, `Posted ${ok} of ${res.results.length} platform${res.results.length === 1 ? '' : 's'}.`, ok === res.results.length ? 'success' : 'warning');
      try { renderPostLibrary(ctx); } catch (_) {}
    }
  } catch (e) {
    toast(ctx, 'Post failed: ' + (e.message || 'unknown'), 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   FANOUT DETAIL MODAL
   ═══════════════════════════════════════════════════════════════ */
export function openFanoutDetail(ctx, group) {
  if (!Array.isArray(group) || group.length === 0) return;

  const c = C(ctx);
  const summary = summarizeFanout(group);

  let modal = document.getElementById('plibDetailModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'plibDetailModal';
    modal.innerHTML = `
      <div class="modal xl" style="max-width:1100px;max-height:94vh;overflow-y:auto;">
        <div class="plib-modal-head">
          <h3 id="plibModalTitle">Post detail</h3>
          <button type="button" class="close" data-plib-close>×</button>
        </div>
        <div id="plibModalBody"></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-plib-close]')) {
        closeFanoutDetail(ctx);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) closeFanoutDetail(ctx);
    });
  }

  modal._currentGroup = group;
  modal._currentTab = summary.platforms[0] || group[0]?.platform || null;

  const campaignName = group[0]?._campaignName || '';
  const titleEl = document.getElementById('plibModalTitle');
  if (titleEl) {
    titleEl.innerHTML = `Post detail <span class="small muted" style="font-weight:400;margin-left:8px;">${esc(campaignName)} · ${group.length} platform${group.length === 1 ? '' : 's'}</span>`;
  }

  const bodyEl = document.getElementById('plibModalBody');
  if (!bodyEl) return;

  renderFanoutModalBody(ctx, bodyEl, group, summary, modal._currentTab);

  if (typeof c.openModal === 'function') c.openModal('plibDetailModal');
  else modal.classList.add('active');
}

export function closeFanoutDetail(ctx) {
  const c = C(ctx);
  if (typeof c.closeModal === 'function') c.closeModal('plibDetailModal');
  else {
    const modal = document.getElementById('plibDetailModal');
    if (modal) modal.classList.remove('active');
  }
}

function renderFanoutModalBody(ctx, bodyEl, group, summary, activeTab) {
  const activePost = group.find(p => p.platform === activeTab) || group[0];

  const tabsHtml = group.map(p => {
    const m = _platformMeta(p.platform);
    const isActive = p.platform === activeTab;
    const stDot = { published: '🟢', scheduled: '🟡', draft: '⚪', 'compose-only': '🔵', failed: '🔴' }[p.status || 'draft'] || '⚪';
    return `<button type="button" class="plib-tab ${isActive ? 'active' : ''}" data-plib-tab="${esc(p.platform)}">
      <i class="${m.icon || 'fa-solid fa-globe'}" style="color:${m.color || 'var(--muted)'};"></i>
      <span>${esc(m.label || p.platform)}</span>
      <span style="font-size:10px;">${stDot}</span>
    </button>`;
  }).join('');

  const isUploaded = activePost?.imageSource === 'upload' || activePost?.imageModel === 'upload';
  const sourceLabel = isUploaded
    ? 'UPLOADED'
    : (activePost?.imageModel || '—').toUpperCase();

  const img = activePost?.imageBase64
    ? `<div class="plib-detail-img">
         <img src="data:${esc(activePost.imageMime || 'image/png')};base64,${esc(activePost.imageBase64)}" alt="" />
       </div>
       <div class="plib-detail-img-meta">
         ${activePost.imageWidth && activePost.imageHeight ? `<span>${activePost.imageWidth}×${activePost.imageHeight}</span>` : ''}
         <span>${esc(sourceLabel)}</span>
       </div>
       <div class="plib-detail-img-actions">
         <button type="button" class="btn soft btn-sm" data-plib-dl>Download</button>
       </div>`
    : `<div class="plib-detail-img-empty"><i class="fa-solid fa-image" style="font-size:2rem;opacity:.35;display:block;margin-bottom:8px;"></i>No image</div>`;

  const contentHtml = `
    <div class="plib-detail-section">
      <h4>Content</h4>
      <div class="plib-detail-row"><span class="plib-detail-label">Campaign:</span><strong>${esc(activePost?._campaignName || '—')}</strong></div>
      <div class="plib-detail-row"><span class="plib-detail-label">Pillar:</span><span>${esc(activePost?.pillar || '—')}</span></div>
      <div class="plib-detail-row"><span class="plib-detail-label">Platform:</span><span>${esc(activePost?.platform || '—')}</span></div>
      <div class="plib-detail-row"><span class="plib-detail-label">Status:</span><span>${esc(activePost?.status || '—')}</span></div>
      ${activePost?.publishedAt ? `<div class="plib-detail-row"><span class="plib-detail-label">Published:</span><span>${esc(fmtSchedDate(activePost.publishedAt))}</span></div>` : ''}
      ${activePost?.scheduledFor ? `<div class="plib-detail-row"><span class="plib-detail-label">Scheduled:</span><span>${esc(fmtSchedDate(activePost.scheduledFor))}</span></div>` : ''}
      ${activePost?.externalId ? `<div class="plib-detail-row"><span class="plib-detail-label">External:</span><a href="${esc(activePost.url || '#')}" target="_blank" rel="noopener">${esc(activePost.externalId)}</a></div>` : ''}
    </div>
    <div class="plib-detail-section">
      <h4>Caption</h4>
      <div class="plib-detail-caption">${esc(activePost?.caption || '(no caption)')}</div>
      ${(activePost?.hashtags && activePost.hashtags.length)
        ? `<div class="plib-detail-hashtags">${activePost.hashtags.map(h => `<span class="badge">#${esc(String(h).replace(/^#+/, ''))}</span>`).join(' ')}</div>`
        : ''}
    </div>
    ${activePost?.url ? `
      <div class="plib-detail-section">
        <h4>UTM link</h4>
        <div class="plib-detail-utm"><code>${esc(activePost.url)}</code></div>
      </div>
    ` : ''}
  `;

  const st = activePost?.stats;
  const er = engagementRateFor(st);
  const hasStats = st && (st.views != null || st.likes != null || st.comments != null || st.shares != null);
  const statsHtml = hasStats
    ? `<div class="plib-stat-grid">
         <div class="plib-stat"><div class="plib-stat-num">${fmtNumShort(st.views)}</div><div class="plib-stat-lbl">Views</div></div>
         <div class="plib-stat"><div class="plib-stat-num">${fmtNumShort(st.likes)}</div><div class="plib-stat-lbl">Likes</div></div>
         <div class="plib-stat"><div class="plib-stat-num">${fmtNumShort(st.comments)}</div><div class="plib-stat-lbl">Comments</div></div>
         <div class="plib-stat"><div class="plib-stat-num">${fmtNumShort(st.shares)}</div><div class="plib-stat-lbl">Shares</div></div>
         <div class="plib-stat"><div class="plib-stat-num">${er.toFixed(1)}%</div><div class="plib-stat-lbl">Engagement</div></div>
       </div>
       <div class="plib-stat-updated">Updated ${activePost.statsUpdatedAt ? fmtSchedDate(activePost.statsUpdatedAt) : '—'}</div>`
    : `<div class="plib-detail-empty">${activePost?.status === 'scheduled'
        ? '⏰ Stats will appear after this post publishes.'
        : activePost?.status === 'draft'
          ? '📝 Draft — no stats yet.'
          : activePost?.status === 'compose-only'
            ? '🔵 Awaiting manual paste — no stats.'
            : activePost?.status === 'failed'
              ? '🔴 Last attempt failed: ' + esc(activePost.lastError || 'unknown')
              : '— No stats yet.'}</div>`;

  const historyHtml = `<div class="plib-history" id="plibHistory"></div>`;

  const compareHtml = group.length > 1
    ? `<div class="plib-compare">
         <div class="plib-compare-head">
           <h4>Compare across platforms</h4>
           <div class="plib-compare-toggle">
             <button type="button" class="plib-cmp-btn active" data-plib-cmp="per">Per platform</button>
             <button type="button" class="plib-cmp-btn" data-plib-cmp="combined">Combined</button>
           </div>
         </div>
         <div id="plibCompareChart" class="plib-compare-chart"></div>
       </div>`
    : '';

  const scheduledPost = group.find(p => p.status === 'scheduled');
  const schedBanner = scheduledPost
    ? `<div class="plib-sched-banner">
         <i class="fa-solid fa-clock"></i>
         <div>
           <strong>Scheduled for ${esc(fmtSchedDate(scheduledPost.scheduledFor))}</strong>
           <div class="small muted">This post will publish automatically once the worker scheduler is deployed. Until then, click "Post now" to publish immediately.</div>
         </div>
       </div>`
    : '';

  bodyEl.innerHTML = `
    ${schedBanner}

    <div class="plib-tabs">${tabsHtml}</div>

    <div class="plib-detail-grid">
      <div class="plib-detail-left">${img}</div>
      <div class="plib-detail-right">${contentHtml}</div>
    </div>

    <div class="plib-stats-section">
      <div class="plib-stats-head">
        <h4>Live stats · ${esc(_platformMeta(activePost?.platform || 'unknown').label || activePost?.platform)}</h4>
        ${hasStats && activePost?.url
          ? `<button type="button" class="btn soft btn-sm" data-plib-refresh>Refresh</button>`
          : ''}
      </div>
      ${statsHtml}
    </div>

    ${historyHtml}
    ${compareHtml}

    <div class="plib-modal-actions">
      <button type="button" class="btn soft btn-sm" data-plib-add-platform>
        <i class="fa-solid fa-plus"></i> Add another platform
      </button>
      ${summary.aggregateStatus === 'scheduled'
        ? `<button type="button" class="btn soft btn-sm" data-plib-edit-schedule><i class="fa-solid fa-clock"></i> Edit schedule</button>`
        : ''}
      ${summary.aggregateStatus === 'scheduled'
        ? `<button type="button" class="btn danger btn-sm" data-plib-cancel-schedule><i class="fa-solid fa-xmark"></i> Cancel scheduling</button>`
        : ''}
      ${activePost?.status === 'published' && activePost?.caption
        ? `<button type="button" class="btn soft btn-sm" data-plib-edit><i class="fa-solid fa-pen"></i> Duplicate in composer</button>`
        : ''}
      ${(activePost?.status === 'draft' || activePost?.status === 'scheduled')
        ? `<button type="button" class="btn primary btn-sm" data-plib-post-now><i class="fa-solid fa-paper-plane"></i> Post now</button>`
        : ''}
      ${activePost?.status === 'failed' && activePost?.composeUrl
        ? `<a href="${esc(activePost.composeUrl)}" target="_blank" rel="noopener" class="btn primary btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open & paste</a>`
        : ''}
      <button type="button" class="btn danger btn-sm" data-plib-delete><i class="fa-solid fa-trash"></i> Delete ${group.length > 1 ? 'entire fanout' : 'post'}</button>
    </div>
  `;

  bodyEl.querySelectorAll('[data-plib-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-plib-tab');
      const modal = document.getElementById('plibDetailModal');
      if (modal) modal._currentTab = tab;
      renderFanoutModalBody(ctx, bodyEl, group, summary, tab);
    });
  });

  bodyEl.querySelector('[data-plib-close]')?.addEventListener('click', () => closeFanoutDetail(ctx));

  bodyEl.querySelector('[data-plib-dl]')?.addEventListener('click', () => {
    if (!activePost?.imageBase64) return;
    const a = document.createElement('a');
    a.href = `data:${activePost.imageMime || 'image/png'};base64,${activePost.imageBase64}`;
    a.download = `viora-${activePost.id || Date.now()}.png`;
    a.click();
  });

  bodyEl.querySelector('[data-plib-refresh]')?.addEventListener('click', async () => {
    try {
      const c = C(ctx);
      if (activePost?.url) {
        await c.fetchCampaignStats?.(activePost.campaignId || activePost._campaignId, activePost.platform, activePost.url);
        toast(ctx, 'Refreshed.', 'success');
      }
    } catch (e) {
      toast(ctx, 'Refresh failed: ' + (e.message || 'unknown'), 'error');
    }
  });

  bodyEl.querySelector('[data-plib-edit]')?.addEventListener('click', () => {
    closeFanoutDetail(ctx);
    openComposerForDraft(activePost);
  });

  bodyEl.querySelector('[data-plib-post-now]')?.addEventListener('click', async () => {
    closeFanoutDetail(ctx);
    await postFanoutNow(ctx, group);
  });

   bodyEl.querySelector('[data-plib-delete]')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${group.length > 1 ? 'all posts in this fanout' : 'this post'}? This cannot be undone.`)) return;
    try {
      const result = await deleteFanoutPosts(ctx, group);
      if (result.ok) {
        closeFanoutDetail(ctx);
        toast(ctx, `Deleted ${result.deleted} post${result.deleted === 1 ? '' : 's'}.`, 'success');
        window.Orbit?.renderActiveOrbitModule?.();
      } else {
        toast(ctx, 'Delete failed: ' + (result.error || 'unknown'), 'error');
      }
    } catch (e) {
      toast(ctx, 'Delete failed: ' + (e.message || 'unknown'), 'error');
    }
  });

  bodyEl.querySelector('[data-plib-add-platform]')?.addEventListener('click', () => {
    openAddPlatformDialog(ctx, group);
  });

  bodyEl.querySelector('[data-plib-edit-schedule]')?.addEventListener('click', () => {
    openEditScheduleDialog(ctx, group);
  });

  bodyEl.querySelector('[data-plib-cancel-schedule]')?.addEventListener('click', async () => {
    await cancelFanoutSchedule(ctx, group);
  });

  drawHistoryChart(ctx, bodyEl, activePost);

  const compareToggle = bodyEl.querySelectorAll('[data-plib-cmp]');
  if (compareToggle.length) {
    compareToggle.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-plib-cmp');
        bodyEl.querySelectorAll('[data-plib-cmp]').forEach(b =>
          b.classList.toggle('active', b === btn)
        );
        drawCompareChart(ctx, bodyEl, group, mode);
      });
    });
    drawCompareChart(ctx, bodyEl, group, 'per');
  }
}

function drawHistoryChart(ctx, bodyEl, post) {
  const host = bodyEl.querySelector('#plibHistory');
  if (!host) return;

  if (typeof Chart === 'undefined') {
    host.innerHTML = '<div class="small muted">Chart.js not loaded — chart unavailable.</div>';
    return;
  }

  const c = C(ctx);
  const state = c.state || {};
  if (!state.charts) state.charts = {};
  if (state.charts['plibHistoryChart']) {
    try { state.charts['plibHistoryChart'].destroy(); } catch (_) {}
    delete state.charts['plibHistoryChart'];
  }

  const history = statsHistoryFor(post, 24 * 60 * 60 * 1000);
  if (history.length < 2) {
    host.innerHTML = `<div class="small muted" style="padding:16px;text-align:center;">Not enough history yet — chart appears after 2+ cron cycles (~6 min).</div>`;
    return;
  }

  host.innerHTML = `
    <div class="plib-history-head"><h4>Stats over time (last 24h)</h4></div>
    <div style="height:220px;"><canvas id="plibHistoryCanvas"></canvas></div>
  `;
  const canvas = host.querySelector('#plibHistoryCanvas');
  if (!canvas) return;

  const tc = (() => { try { return getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() || '#94a3b8'; } catch (_) { return '#94a3b8'; } })();

  state.charts['plibHistoryChart'] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: history.map(s => {
        const d = new Date(s.ts);
        return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      }),
      datasets: [
        { label: 'Views',    data: history.map(s => s.views ?? null),    borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.12)', fill: true, tension: 0.4, borderWidth: 2 },
        { label: 'Likes',    data: history.map(s => s.likes ?? null),    borderColor: '#ff5c7c', tension: 0.4, borderWidth: 2 },
        { label: 'Comments', data: history.map(s => s.comments ?? null), borderColor: '#22e6a0', tension: 0.4, borderWidth: 2 },
        { label: 'Shares',   data: history.map(s => s.shares ?? null),   borderColor: '#ffc857', tension: 0.4, borderWidth: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: tc, font: { size: 11 } } } },
      scales: {
        y: { beginAtZero: true, ticks: { color: tc }, grid: { color: 'rgba(148,163,184,0.15)' } },
        x: { ticks: { color: tc, font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
}

function drawCompareChart(ctx, bodyEl, group, mode) {
  const host = bodyEl.querySelector('#plibCompareChart');
  if (!host) return;

  if (typeof Chart === 'undefined') {
    host.innerHTML = '<div class="small muted">Chart.js not loaded.</div>';
    return;
  }

  const c = C(ctx);
  const state = c.state || {};
  if (!state.charts) state.charts = {};
  if (state.charts['plibCompareChart']) {
    try { state.charts['plibCompareChart'].destroy(); } catch (_) {}
    delete state.charts['plibCompareChart'];
  }

  const tc = (() => { try { return getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() || '#94a3b8'; } catch (_) { return '#94a3b8'; } })();

  host.innerHTML = `<div style="height:220px;"><canvas id="plibCompareCanvas"></canvas></div>`;
  const canvas = host.querySelector('#plibCompareCanvas');
  if (!canvas) return;

  if (mode === 'per') {
    const platforms = group.map(p => ({
      label: _platformMeta(p.platform).label || p.platform,
      views: Number(p.stats?.views) || 0,
      likes: Number(p.stats?.likes) || 0,
      comments: Number(p.stats?.comments) || 0,
      shares: Number(p.stats?.shares) || 0,
    }));

    state.charts['plibCompareChart'] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: platforms.map(p => p.label),
        datasets: [
          { label: 'Views',    data: platforms.map(p => p.views),    backgroundColor: 'rgba(0,212,255,0.75)',  borderRadius: 6 },
          { label: 'Likes',    data: platforms.map(p => p.likes),    backgroundColor: 'rgba(255,92,124,0.75)', borderRadius: 6 },
          { label: 'Comments', data: platforms.map(p => p.comments), backgroundColor: 'rgba(34,230,160,0.75)', borderRadius: 6 },
          { label: 'Shares',   data: platforms.map(p => p.shares),   backgroundColor: 'rgba(255,200,87,0.75)', borderRadius: 6 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: tc, font: { size: 11 } } } },
        scales: {
          y: { beginAtZero: true, ticks: { color: tc }, grid: { color: 'rgba(148,163,184,0.15)' } },
          x: { ticks: { color: tc }, grid: { display: false } },
        },
      },
    });
  } else {
    const combined = combineStatsHistory(group, 24 * 60 * 60 * 1000);
    if (combined.length < 2) {
      host.innerHTML = `<div class="small muted" style="padding:16px;text-align:center;">Not enough combined history yet.</div>`;
      return;
    }
    state.charts['plibCompareChart'] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: combined.map(s => new Date(s.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })),
        datasets: [
          { label: 'Total views',    data: combined.map(s => s.views),    borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.15)', fill: true, tension: 0.4, borderWidth: 2 },
          { label: 'Total likes',    data: combined.map(s => s.likes),    borderColor: '#ff5c7c', tension: 0.4, borderWidth: 2 },
          { label: 'Total comments', data: combined.map(s => s.comments), borderColor: '#22e6a0', tension: 0.4, borderWidth: 2 },
          { label: 'Total shares',   data: combined.map(s => s.shares),   borderColor: '#ffc857', tension: 0.4, borderWidth: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: tc, font: { size: 11 } } } },
        scales: {
          y: { beginAtZero: true, ticks: { color: tc }, grid: { color: 'rgba(148,163,184,0.15)' } },
          x: { ticks: { color: tc, font: { size: 10 } }, display: false },
        },
      },
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   ADD PLATFORM DIALOG
   ═══════════════════════════════════════════════════════════════ */
export function openAddPlatformDialog(ctx, group) {
  if (!Array.isArray(group) || group.length === 0) return;

  const c = C(ctx);

  const source = group.reduce((best, p) => {
    const score = (p.caption || '').length + (p.imageBase64 ? 1000 : 0);
    const bestScore = (best.caption || '').length + (best.imageBase64 ? 1000 : 0);
    return score > bestScore ? p : best;
  }, group[0]);

  const taken = new Set(group.map(p => p.platform));
  const allPlatforms = ['facebook', 'instagram', 'tiktok', 'youtube', 'linkedin', 'twitter', 'threads', 'pinterest', 'whatsapp'];
  const available = allPlatforms.filter(p => !taken.has(p));

  if (!available.length) {
    toast(ctx, 'This post is already on every supported platform.', 'info');
    return;
  }

  let dlg = document.getElementById('plibAddPlatformDialog');
  if (!dlg) {
    dlg = document.createElement('div');
    dlg.className = 'modal-overlay';
    dlg.id = 'plibAddPlatformDialog';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.classList.remove('active');
    });
  }

  dlg.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <h2 style="margin-bottom:14px;">
        <span class="modal-icon" style="background:linear-gradient(135deg,#6558f5,#a34ce8);">
          <i class="fa-solid fa-plus"></i>
        </span>
        Add platform to this post
      </h2>

      <div class="notice" style="margin-bottom:14px;">
        This will create a new post on the selected platform. It will share the same fanout group as the existing posts so you can track them together.
      </div>

      <div class="field">
        <label>Platform *</label>
        <select id="plibAddPlatformSel">
          ${available.map(k => {
            const m = _platformMeta(k);
            return `<option value="${esc(k)}">${esc(m.label || k)}</option>`;
          }).join('')}
        </select>
      </div>

      <div class="field">
        <label>Caption</label>
        <div class="plib-caption-choice">
          <label class="plib-choice">
            <input type="radio" name="plibCaptMode" value="reuse" checked />
            <div>
              <strong>Reuse existing caption</strong>
              <div class="small muted">Prefills the composer with "${esc((source.caption || '').slice(0, 60))}${(source.caption || '').length > 60 ? '…' : ''}" — you can edit it before posting.</div>
            </div>
          </label>
          <label class="plib-choice">
            <input type="radio" name="plibCaptMode" value="fresh" />
            <div>
              <strong>Generate a fresh caption</strong>
              <div class="small muted">The composer will generate a new caption tuned for the selected platform, using the same brief.</div>
            </div>
          </label>
        </div>
      </div>

      <div class="form-actions" style="margin-top:18px;">
        <button type="button" class="btn soft" id="plibAddCancel">Cancel</button>
        <button type="button" class="btn primary" id="plibAddConfirm">
          <i class="fa-solid fa-paper-plane"></i> Continue to composer
        </button>
      </div>
    </div>
  `;

  dlg.classList.add('active');

  dlg.querySelector('#plibAddCancel').addEventListener('click', () => {
    dlg.classList.remove('active');
  });

  dlg.querySelector('#plibAddConfirm').addEventListener('click', () => {
    const targetPlatform = dlg.querySelector('#plibAddPlatformSel').value;
    const captMode = dlg.querySelector('input[name="plibCaptMode"]:checked').value;
    dlg.classList.remove('active');

    try { closeFanoutDetail(ctx); } catch (_) {}

    const campaignId = source._campaignId || source.campaignId || '';

    const composerOpts = {
      campaignId,
      platforms: [targetPlatform],
      pillar: source.pillar || 'educational',
      fanoutId: source.fanoutId || undefined,
    };

    if (captMode === 'reuse') {
      composerOpts.brief = source.caption || '';
    } else {
      composerOpts.brief = source.brief || source.caption || '';
    }

    try {
      openComposer(composerOpts);

      if (source.imageBase64) {
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent('viora:composer-prefill-image', {
            detail: {
              b64: source.imageBase64,
              mime: source.imageMime || 'image/png',
              model: source.imageModel || null,
              width: source.imageWidth || null,
              height: source.imageHeight || null,
              prompt: source.imagePrompt || '',
            }
          }));
        });
      }

      if (source.fanoutId) {
        toast(ctx, `New post will join fanout ${source.fanoutId.slice(0, 8)}…`, 'info');
      }
    } catch (e) {
      toast(ctx, 'Could not open composer: ' + (e.message || 'unknown'), 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   EDIT SCHEDULE
   ═══════════════════════════════════════════════════════════════ */
export function openEditScheduleDialog(ctx, group) {
  if (!Array.isArray(group) || group.length === 0) return;

  const c = C(ctx);
  const scheduled = group.filter(p => p.status === 'scheduled');
  if (!scheduled.length) {
    toast(ctx, 'No scheduled posts in this group.', 'info');
    return;
  }

  const defaultIso = scheduled
    .map(p => p.scheduledFor)
    .filter(Boolean)
    .sort()[0] || '';

  const defaultLocal = (() => {
    if (!defaultIso) return '';
    try {
      const d = new Date(defaultIso);
      if (isNaN(d)) return '';
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (_) { return ''; }
  })();

  let dlg = document.getElementById('plibEditScheduleDialog');
  if (!dlg) {
    dlg = document.createElement('div');
    dlg.className = 'modal-overlay';
    dlg.id = 'plibEditScheduleDialog';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.classList.remove('active');
    });
  }

  dlg.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <h2 style="margin-bottom:14px;">
        <span class="modal-icon" style="background:linear-gradient(135deg,#d68b22,#f0b35c);">
          <i class="fa-solid fa-clock"></i>
        </span>
        Edit schedule
      </h2>

      <div class="notice" style="margin-bottom:14px;">
        This updates the scheduled time for ${scheduled.length} post${scheduled.length === 1 ? '' : 's'} on ${scheduled.map(p => _platformMeta(p.platform).label || p.platform).join(', ')}.
      </div>

      <div class="field">
        <label>New date &amp; time *</label>
        <input type="datetime-local" id="plibSchedNew" value="${esc(defaultLocal)}" />
      </div>

      <div class="form-actions" style="margin-top:18px;">
        <button type="button" class="btn soft" id="plibSchedCancel">Cancel</button>
        <button type="button" class="btn primary" id="plibSchedSave">
          <i class="fa-solid fa-check"></i> Save
        </button>
      </div>
    </div>
  `;

  dlg.classList.add('active');

  dlg.querySelector('#plibSchedCancel').addEventListener('click', () => {
    dlg.classList.remove('active');
  });

  dlg.querySelector('#plibSchedSave').addEventListener('click', async () => {
    const newLocal = dlg.querySelector('#plibSchedNew').value;
    if (!newLocal) {
      toast(ctx, 'Pick a date and time.', 'warning');
      return;
    }

    const newIso = new Date(newLocal).toISOString();
    const newUtc = toUtcIso(newLocal);

    const btn = dlg.querySelector('#plibSchedSave');
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

    try {
      for (const p of scheduled) {
        const camp = (c.state?.data?.campaigns || []).find(x => x.id === (p._campaignId || p.campaignId));
        if (!camp || !Array.isArray(camp.posts)) continue;

        const live = camp.posts.find(x => x.id === p.id);
        if (!live) continue;

        live.scheduledFor = newLocal;
        live.scheduledForUtc = newUtc;
        live.updatedAt = new Date().toISOString();

        try {
          await c.upsertDoc('campaigns', camp, camp._rev);
        } catch (e) {
          console.warn('[edit-schedule] save failed for', p.id, e);
        }
      }

      toast(ctx, 'Schedule updated.', 'success');
      dlg.classList.remove('active');

      try {
        const detail = document.getElementById('plibDetailModal');
        if (detail && detail.classList.contains('active')) {
          const updatedGroup = group.map(p => {
            const camp = (c.state?.data?.campaigns || []).find(x => x.id === (p._campaignId || p.campaignId));
            return camp?.posts?.find(x => x.id === p.id) || p;
          });
          openFanoutDetail(ctx, updatedGroup);
        }
      } catch (_) {}

      try { renderPostLibrary(ctx); } catch (_) {}
    } catch (e) {
      toast(ctx, 'Save failed: ' + (e.message || 'unknown'), 'error');
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   CANCEL SCHEDULE
   ═══════════════════════════════════════════════════════════════ */
export async function cancelFanoutSchedule(ctx, group) {
  if (!Array.isArray(group) || group.length === 0) return;

  const c = C(ctx);
  const scheduled = group.filter(p => p.status === 'scheduled');
  if (!scheduled.length) {
    toast(ctx, 'No scheduled posts in this group.', 'info');
    return;
  }

  if (!confirm(`Cancel the schedule for ${scheduled.length} post${scheduled.length === 1 ? '' : 's'}? They'll revert to draft and won't publish until you click "Post now".`)) {
    return;
  }

  try {
    for (const p of scheduled) {
      const camp = (c.state?.data?.campaigns || []).find(x => x.id === (p._campaignId || p.campaignId));
      if (!camp || !Array.isArray(camp.posts)) continue;

      const live = camp.posts.find(x => x.id === p.id);
      if (!live) continue;

      live.status = 'draft';
      live.scheduledFor = null;
      live.scheduledForUtc = null;
      live.updatedAt = new Date().toISOString();

      try {
        await c.upsertDoc('campaigns', camp, camp._rev);
      } catch (e) {
        console.warn('[cancel-schedule] save failed for', p.id, e);
      }
    }

    toast(ctx, 'Scheduling cancelled. Posts reverted to draft.', 'info');
    try { closeFanoutDetail(ctx); } catch (_) {}
    try { renderPostLibrary(ctx); } catch (_) {}
  } catch (e) {
    toast(ctx, 'Cancel failed: ' + (e.message || 'unknown'), 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   IMPORT POSTS
   ═══════════════════════════════════════════════════════════════ */
const _IMPORT_PLATFORM_PATTERNS = [
  { key: 'youtube',   label: 'YouTube',   icon: 'fa-brands fa-youtube',
    test: /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)/i,
    color: '#ff0033' },
  { key: 'tiktok',    label: 'TikTok',    icon: 'fa-brands fa-tiktok',
    test: /tiktok\.com\/(?:@[^/]+\/video\/|video\/|t\/)/i,
    color: '#ff0050' },
  { key: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram',
    test: /instagram\.com\/(?:p|reel|tv)\//i,
    color: '#e1306c' },
  { key: 'facebook',  label: 'Facebook',  icon: 'fa-brands fa-facebook',
    test: /facebook\.com\/.+\/(?:posts|videos)\/|fb\.watch\//i,
    color: '#1877f2' },
  { key: 'twitter',   label: 'X / Twitter', icon: 'fa-brands fa-x-twitter',
    test: /(?:twitter\.com|x\.com)\/.+\/status\//i,
    color: '#000000' },
  { key: 'linkedin',  label: 'LinkedIn',  icon: 'fa-brands fa-linkedin',
    test: /linkedin\.com\/(?:posts|feed\/update)\//i,
    color: '#0a66c2' },
  { key: 'threads',   label: 'Threads',   icon: 'fa-brands fa-threads',
    test: /threads\.(?:net|com)\/@[^/]+\/post\//i,
    color: '#000000' },
  { key: 'pinterest', label: 'Pinterest', icon: 'fa-brands fa-pinterest',
    test: /pinterest\.com\/pin\//i,
    color: '#e60023' },
];

function _detectPlatformFromUrl(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  for (const p of _IMPORT_PLATFORM_PATTERNS) {
    if (p.test.test(s)) return p;
  }
  return null;
}

export function openImportModal(ctx) {
  const c = C(ctx);
  const campaigns = Array.isArray(c.state?.data?.campaigns) ? c.state.data.campaigns : [];

  if (!campaigns.length) {
    toast(ctx, 'Create a campaign first — imported posts need a home.', 'warning');
    try { window.Orbit?.navigate?.('campaigns'); } catch (_) {}
    return;
  }

  let modal = document.getElementById('plibImportModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'plibImportModal';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-plib-import-close]')) {
        modal.classList.remove('active');
      }
    });
  }

  const campaignOptions = campaigns
    .filter(cc => cc && cc.id)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .map(cc => `<option value="${esc(cc.id)}">${esc(cc.name || 'Untitled')}</option>`)
    .join('');

  modal.innerHTML = `
    <div class="modal large" style="max-width:620px;">
      <div class="modalhead">
        <h3><i class="fa-solid fa-file-import"></i> Import existing posts</h3>
        <button type="button" class="close" data-plib-import-close>×</button>
      </div>

      <div class="notice" style="margin-bottom:14px;">
        <strong>Import live posts by URL.</strong> Once imported, live stats
        for <strong>YouTube</strong> and <strong>TikTok</strong> posts refresh every 3 minutes.
        Other platforms import fine but won't get stats until their worker
        endpoints are added.
      </div>

      <div class="field">
        <label>Post URLs * <span class="muted" style="font-weight:400;">(one per line)</span></label>
        <textarea id="plibImportUrls" rows="6" placeholder="https://www.youtube.com/watch?v=abc123&#10;https://www.tiktok.com/@viora/video/7234567890123"></textarea>
        <div class="small muted" style="margin-top:4px;">
          Supported: YouTube, TikTok, Instagram, Facebook, X, LinkedIn, Threads, Pinterest
        </div>
      </div>

      <div class="formgrid">
        <div class="field">
          <label>Assign to campaign *</label>
          <select id="plibImportCampaign">${campaignOptions}</select>
        </div>
        <div class="field">
          <label>Post date <span class="muted" style="font-weight:400;">(optional)</span></label>
          <input type="date" id="plibImportDate" />
          <div class="small muted" style="margin-top:4px;">
            Leave blank to use today. YouTube/TikTok will auto-correct this on the first stats fetch.
          </div>
        </div>
      </div>

      <div id="plibImportPreview" style="margin-top:14px;"></div>

      <div class="form-actions" style="margin-top:18px;">
        <button type="button" class="btn soft" data-plib-import-close>Cancel</button>
        <button type="button" class="btn primary" id="plibImportConfirm">
          <i class="fa-solid fa-check"></i> Import
        </button>
      </div>
    </div>
  `;

  const urlsEl = modal.querySelector('#plibImportUrls');
  const preview = modal.querySelector('#plibImportPreview');
  const confirmBtn = modal.querySelector('#plibImportConfirm');

  const refreshPreview = () => {
    const raw = String(urlsEl.value || '').trim();
    if (!raw) {
      preview.innerHTML = '';
      confirmBtn.disabled = false;
      return;
    }
    const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
    let validCount = 0;
    let unknownCount = 0;
    const rows = lines.map((url) => {
      const p = _detectPlatformFromUrl(url);
      if (!p) {
        unknownCount++;
        return `<div class="plib-import-row plib-import-row-bad">
          <i class="fa-solid fa-circle-question" style="color:var(--warn);"></i>
          <span style="font-family:monospace;font-size:10.5px;word-break:break-all;">${esc(url.slice(0, 80))}${url.length > 80 ? '…' : ''}</span>
          <span class="badge badge-warn" style="margin-left:auto;font-size:9px;">Unknown</span>
        </div>`;
      }
      validCount++;
      return `<div class="plib-import-row">
        <i class="${p.icon}" style="color:${p.color};"></i>
        <span style="font-family:monospace;font-size:10.5px;word-break:break-all;">${esc(url.slice(0, 80))}${url.length > 80 ? '…' : ''}</span>
        <span class="badge badge-purple" style="margin-left:auto;font-size:9px;">${esc(p.label)}</span>
      </div>`;
    }).join('');

    preview.innerHTML = `
      <div class="plib-import-summary">
        <strong>${validCount}</strong> valid · <strong>${unknownCount}</strong> unrecognized
      </div>
      <div style="max-height:200px;overflow-y:auto;margin-top:6px;">${rows}</div>
    `;

    confirmBtn.disabled = validCount === 0;
  };

  urlsEl.addEventListener('input', refreshPreview);
  refreshPreview();

  confirmBtn.addEventListener('click', async () => {
    const raw = String(urlsEl.value || '').trim();
    if (!raw) { toast(ctx, 'Paste at least one URL.', 'warning'); return; }

    const campaignId = modal.querySelector('#plibImportCampaign').value;
    const dateValue = modal.querySelector('#plibImportDate').value;

    const camp = campaigns.find(x => x.id === campaignId);
    if (!camp) { toast(ctx, 'Campaign not found.', 'error'); return; }

    const urls = raw.split('\n').map(s => s.trim()).filter(Boolean);
    const imported = [];
    const skipped = [];

    for (const url of urls) {
      const platform = _detectPlatformFromUrl(url);
      if (!platform) { skipped.push({ url, reason: 'Unrecognized URL' }); continue; }
      imported.push({ url, platform: platform.key });
    }

    if (!imported.length) {
      toast(ctx, 'No valid URLs to import.', 'error');
      return;
    }

    const prevBtn = confirmBtn.innerHTML;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing…';

    try {
      const existingPosts = Array.isArray(camp.posts) ? camp.posts.slice() : [];
      const nowIso = new Date().toISOString();
      const publishedAt = dateValue
        ? new Date(dateValue + 'T00:00:00').toISOString()
        : nowIso;

      const newPosts = imported.map(({ url, platform }) => ({
        id: 'imported-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
        fanoutId: null,
        campaignId: camp.id,
        platform,
        pillar: 'educational',
        caption: '',
        hashtags: [],
        imageBase64: null,
        imageMime: 'image/png',
        imageWidth: null,
        imageHeight: null,
        imagePrompt: null,
        imageModel: null,
        imageSource: null,
        imageSeed: null,
        utm: {},
        url,
        status: 'published',
        mode: 'auto',
        scheduledFor: null,
        scheduledForUtc: null,
        publishedAt,
        externalId: null,
        composeUrl: null,
        lastError: null,
        stats: null,
        statsUpdatedAt: null,
        statsHistory: [],
        accountHandle: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: c.state?.operator?.email || 'imported',
        source: 'imported',
      }));

      camp.posts = [...existingPosts, ...newPosts];
      camp.updatedAt = nowIso;

      await c.upsertDoc('campaigns', camp, camp._rev);

      modal.classList.remove('active');
      urlsEl.value = '';
      preview.innerHTML = '';

      toast(
        `Imported ${newPosts.length} post${newPosts.length === 1 ? '' : 's'}.${skipped.length ? ` ${skipped.length} skipped.` : ''}`,
        'success'
      );

      try { renderPostLibrary(ctx); } catch (e) { console.warn('[import] render failed', e); }

      setTimeout(async () => {
        try {
          const callFn = c.callFn;
          if (typeof callFn !== 'function') return;

          const importable = newPosts
            .filter(p => p.platform === 'youtube' || p.platform === 'tiktok')
            .map(p => ({ id: p.id, platform: p.platform, url: p.url, externalId: null }));

          if (!importable.length) return;

          const res = await callFn('social/stats/batch', { posts: importable });
          if (!res || !res.ok || !res.results) return;

          const freshCamp = (c.state?.data?.campaigns || []).find(x => x.id === camp.id);
          if (!freshCamp) return;

          let touched = false;
          for (const p of freshCamp.posts || []) {
            const r = res.results[p.id];
            if (!r || r.ok === false) continue;
            if (r.views == null && r.likes == null && r.comments == null) continue;
            p.stats = {
              views: r.views ?? null,
              likes: r.likes ?? null,
              comments: r.comments ?? null,
              shares: r.shares ?? null,
              followers: r.followers ?? null,
            };
            p.statsUpdatedAt = new Date().toISOString();
            p.statsSource = r.source || null;
            if (r.publishedAt && !p.publishedAt) p.publishedAt = r.publishedAt;
            if (r.title && !p.caption) p.caption = r.title;
            if (r.thumbnail) p.thumbnailUrl = r.thumbnail;
            touched = true;
          }

          if (touched) {
            freshCamp.updatedAt = new Date().toISOString();
            await c.upsertDoc('campaigns', freshCamp, freshCamp._rev);
            try { renderPostLibrary(ctx); } catch (_) {}
            toast(ctx, 'Stats loaded for imported posts.', 'success');
          }
        } catch (e) {
          console.warn('[import] initial stats fetch failed:', e);
        }
      }, 800);

    } catch (e) {
      console.error('[import] save failed', e);
      toast(ctx, 'Import failed: ' + (e.message || 'unknown'), 'error');
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = prevBtn;
    }
  });

  modal.classList.add('active');

  setTimeout(() => {
    try { urlsEl.focus(); } catch (_) {}
  }, 100);
}

/* ═══════════════════════════════════════════════════════════════
   CONTENT STUDIO, CALENDAR, PUBLISHING, CREATIVE, INBOX, CRM,
   LISTENING, AGENTS, AUTOMATION, ANALYTICS, COMPETITORS,
   REPORTS, CLIENTS, APPROVALS, MEDIA, KNOWLEDGE, TEAM,
   INTEGRATIONS, SETTINGS, ADMIN
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
              if (post) openComposerForDraft(post);
              else toast(ctx, 'Post not found.', 'warning');
            });
          });
        }
      }
    }
  };
}

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

export async function renderCreativeStudio(ctx) {
  const c = C(ctx);
  const state = c.state || { data: {} };
  const campaigns = Array.isArray(state.data?.campaigns) ? state.data.campaigns : [];
  const hasCampaigns = campaigns.length > 0;

  const html = head(
    'Creative studio',
    'Generate a visual, then draft the post — all in one place.',
    ''
  ) + `
    <div class="cs-wrap">
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

      <div class="cs-grid">
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
            <button type="button" class="btn soft" id="csUploadImage" ${hasCampaigns ? '' : 'disabled'}>
              <i class="fa-solid fa-upload"></i> Upload image
            </button>
            <button type="button" class="btn soft" id="csGeneratePost" ${hasCampaigns ? '' : 'disabled'}>
              <i class="fa-solid fa-layer-group"></i> Generate caption + image
            </button>
            <input type="file" id="csUploadImageInput" accept="image/jpeg,image/png,image/webp" style="display:none;" />
          </div>
        </div>

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
      const promptEl   = view.querySelector('#csPrompt');
      const pillarEl   = view.querySelector('#csPillar');
      const platformEl = view.querySelector('#csPlatform');
      const campaignEl = view.querySelector('#csCampaign');
      const genImgBtn  = view.querySelector('#csGenerateImage');
      const genPostBtn = view.querySelector('#csGeneratePost');
      const resultEl   = view.querySelector('#csResult');
      const platformField = view.querySelector('.cs-platform-field');
      const multiHint     = view.querySelector('.cs-multi-hint');

      let mode = 'quick';
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

      let currentImage = null;

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
          try {
            openComposer({
              campaignId: campaignEl?.value || '',
              brief: img.prompt || '',
            });
          } catch (e) {
            toast(ctx, 'Could not open composer: ' + (e.message || 'unknown'), 'error');
          }
        });
      }

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

          renderResultImage(currentImage);
          toast(ctx, 'Image generated.', 'success');
        } catch (e) {
          console.warn('[creative] image gen failed', e);
          const msg = String(e.message || 'unknown');
          const isConfig = msg.toLowerCase().includes('not configured') ||
                           msg.toLowerCase().includes('unavailable') ||
                           msg.includes('503');
          if (resultEl) {
            resultEl.innerHTML = `
              <div class="cs-error">
                <div class="cs-error-head">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                  ${isConfig ? 'AI service unavailable' : 'Generation failed'}
                </div>
                <div class="cs-error-body">
                  ${isConfig
                    ? 'The AI service is temporarily unavailable. You can still upload your own image or write the caption manually.'
                    : esc(msg)}
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button type="button" class="btn soft btn-sm" id="csRetryImg">Try again</button>
                  ${isConfig
                    ? '<button type="button" class="btn soft btn-sm" id="csUploadInstead"><i class="fa-solid fa-upload"></i> Upload own image</button>'
                    : ''}
                </div>
              </div>`;
            resultEl.querySelector('#csRetryImg')?.addEventListener('click', () => genImgBtn.click());
            resultEl.querySelector('#csUploadInstead')?.addEventListener('click', () => {
              view.querySelector('#csUploadImage')?.click();
            });
          }
          toast(
            isConfig ? 'AI service unavailable — try uploading your own image.' : 'Generation failed: ' + msg,
            isConfig ? 'warning' : 'error'
          );
        } finally {
          btn.disabled = false;
          btn.innerHTML = prev;
        }
      });

      genPostBtn?.addEventListener('click', () => {
        const prompt = (promptEl?.value || '').trim();
        if (!prompt) { toast(ctx, 'Enter a brief first.', 'warning'); promptEl?.focus(); return; }
        const campaignId = campaignEl?.value || '';
        if (!campaignId) { toast(ctx, 'Pick a campaign first.', 'warning'); campaignEl?.focus(); return; }

        try {
          openComposer({
            campaignId,
            brief: prompt,
            pillar: pillarEl?.value || 'educational',
          });
        } catch (e) {
          console.error('[creative] openComposer failed', e);
          toast(ctx, 'Composer failed to open: ' + (e.message || 'unknown'), 'error');
        }
      });

      const uploadBtn = view.querySelector('#csUploadImage');
      const uploadInput = view.querySelector('#csUploadImageInput');
      uploadBtn?.addEventListener('click', () => uploadInput?.click());
      uploadInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!campaignEl?.value) { toast(ctx, 'Pick a campaign first.', 'warning'); return; }

        try {
          const img = await readImageFile(file);
          currentImage = {
            b64: img.b64,
            mime: img.mime,
            model: 'upload',
            width: img.width,
            height: img.height,
            prompt: (promptEl?.value || '').trim(),
            imageSource: 'upload',
          };

          renderResultImage(currentImage);
          toast(ctx, 'Image uploaded.', 'success');
        } catch (err) {
          toast(ctx, 'Upload failed: ' + (err.message || 'unknown'), 'error');
        }
      });
    }
  };
}

export async function renderInbox(ctx) {
  try {
    await _renderInboxImpl();
  } catch (e) {
    console.warn('[orbit] inbox render failed:', e);
  }
  const view = document.getElementById('view');
  return {
    html: view ? view.innerHTML : '',
    mount: () => {},
  };
}

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
        <textarea id="agentTestInput" rows="4" placeholder="e.g. Draft a 2-line Facebook post for a Kenyan coffee shop launch"></textarea></div>
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

export async function renderAnalyticsModule(ctx) {
  return {
    html: head('Analytics & business intelligence',
      'Performance across campaigns, channels and revenue.',
      '<button class="btn" id="orbitAnalyticsRefresh"><i class="fa-solid fa-rotate"></i> Refresh</button>') +
      '<div id="campaignAnalyticsDashboard"></div>',
    mount() {
      try {
        renderAnalyticsDashboard();
      } catch (e) {
        console.warn('[analytics] render failed', e);
        const host = document.getElementById('campaignAnalyticsDashboard');
        if (host) {
          host.innerHTML =
            '<div class="card" style="padding:24px;text-align:center;">' +
              '<i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;color:var(--bad);opacity:.6;margin-bottom:12px;display:block;"></i>' +
              '<div style="font-weight:800;margin-bottom:6px;">Analytics failed to render</div>' +
              '<div class="small muted" style="font-family:monospace;word-break:break-word;">' + String(e.message || e) + '</div>' +
            '</div>';
        }
      }
      document.getElementById('orbitAnalyticsRefresh')?.addEventListener('click', () => {
        try { renderAnalyticsDashboard(); } catch (e) { console.warn('[analytics] refresh failed', e); }
        toast(ctx, 'Refreshed.', 'info');
      });
    }
  };
}

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
   DELETE FANOUT — correctly removes a group of posts from a campaign
   ─────────────────────────────────────────────────────────────
   Removes every post in the group from its parent campaign's
   posts[] array, saves the campaign, and re-renders the library.

   Handles both cases:
     • Whole fanout (all posts share the same fanoutId)
     • Single post (has its own fanoutId, or no fanoutId)
   ═══════════════════════════════════════════════════════════════ */
async function deleteFanoutPosts(ctx, group) {
  if (!Array.isArray(group) || group.length === 0) return { ok: false, error: 'empty group' };

  const c = C(ctx);
  const state = c.state || { data: {} };
  const campaigns = state.data?.campaigns || [];

  /* Group posts by their parent campaign so we only save each
     campaign once. */
  const byCampaign = new Map();
  for (const post of group) {
    const campaignId = post._campaignId || post.campaignId;
    if (!campaignId) continue;
    if (!byCampaign.has(campaignId)) byCampaign.set(campaignId, new Set());
    byCampaign.get(campaignId).add(post.id);
  }

  let deleted = 0;
  const errors = [];

  for (const [campaignId, postIds] of byCampaign) {
    const campaign = campaigns.find(x => x.id === campaignId);
    if (!campaign) { errors.push('campaign not found: ' + campaignId); continue; }

    const before = Array.isArray(campaign.posts) ? campaign.posts.length : 0;
    campaign.posts = (campaign.posts || []).filter(p => p && !postIds.has(p.id));
    const after = campaign.posts.length;
    deleted += (before - after);

    campaign.updatedAt = new Date().toISOString();

    try {
      await c.upsertDoc('campaigns', campaign, campaign._rev);
    } catch (e) {
      errors.push('save failed for ' + campaignId + ': ' + e.message);
    }
  }

  /* Refresh the Post Library */
  try { renderPostLibrary(ctx); } catch (_) {}
  try { renderDraftLibrary(); } catch (_) {}

  if (errors.length) {
    return { ok: false, deleted, error: errors.join(' | ') };
  }
  return { ok: true, deleted };
}
