// main/campaign-accounts.js
// ═══════════════════════════════════════════════════════════════
// Global social account registry for the Campaigns subsystem.
//
// What it does:
//   • Lets the admin register each platform once (handle + URL + IDs)
//   • Stores everything in one Firebase node: socialAccounts/     
//   • Every campaign, composer post, and analytics query reads from here
//   • Per-platform extras: page IDs, verification status, follower cache
//
// Storage shape:
//   socialAccounts/{accountId} = {
//     id, platform, handle, displayName, profileUrl,
//     platformId (page_id / video channel id / etc.),
//     verified, followers, followersUpdatedAt,
//     connectedVia (api | manual), notes,
//     createdAt, updatedAt
//   }
//
// v1.1 changes:
//   • subscribeToAccounts() triggers a full module re-render when the
//     current module reads socialAccounts (accounts/overview/analytics)
//   • deleteAccount() helper does optimistic removal + rollback
//   • Followers auto-fetch on save for YouTube/TikTok
// ═══════════════════════════════════════════════════════════════

let _ctx = null;
let _accountsCache = null;
let _accountsCacheTs = 0;
let _apiStatusCache = null;
let _apiStatusCacheTs = 0;
const CACHE_TTL_MS = 60 * 1000;
const API_STATUS_TTL_MS = 30 * 1000;

export function initCampaignAccounts(deps) {
  _ctx = deps || {};
  _accountsCache = null;
  _accountsCacheTs = 0;
}

function ctx() { return _ctx || {}; }

async function loadApiStatus(force = false) {
  if (!force && _apiStatusCache && Date.now() - _apiStatusCacheTs < API_STATUS_TTL_MS) {
    return _apiStatusCache;
  }
  if (typeof SAFE.callFn !== 'function') return null;
  try {
    const result = await SAFE.callFn('social/config/status', {});
    _apiStatusCache = result && result.integrations ? result.integrations : null;
    _apiStatusCacheTs = Date.now();
    return _apiStatusCache;
  } catch (error) {
    console.warn('[accounts] API connection status unavailable:', error.message);
    return null;
  }
}

const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const q = (s) => String(s == null ? '' : s)
  .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

const SAFE = {
  get state()    { return ctx().state || null; },
  get db()       { return ctx().db; },
  get ref()      { return ctx().ref; },
  get get()      { return ctx().get; },
  get set()      { return ctx().set; },
  get remove()   { return ctx().remove; },
  get P()        { return ctx().P; },
  get onValue()  { return ctx().onValue; },
  get toast()    { return (msg, type) => { try { ctx().toast?.(msg, type); } catch (_) {} }; },
  get openModal(){ return ctx().openModal; },
  get closeModal(){ return ctx().closeModal; },
  get callFn()   { return ctx().callFn; },
};

/* ── Platform metadata ── */
const PLATFORMS = [
  { key: 'facebook', label: 'Facebook', icon: 'fa-brands fa-facebook', color: '#1877f2',
    handlePlaceholder: '@viora', urlPlaceholder: 'https://facebook.com/viora',
    idLabel: 'Page ID (required for API posting)', idPlaceholder: '1234567890',
    canPost: true },
  { key: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram', color: '#e1306c',
    handlePlaceholder: '@viora', urlPlaceholder: 'https://instagram.com/viora',
    idLabel: 'Business Account ID', idPlaceholder: '17841400...',
    canPost: false },
  { key: 'tiktok', label: 'TikTok', icon: 'fa-brands fa-tiktok', color: '#ff0050',
    handlePlaceholder: '@viora', urlPlaceholder: 'https://tiktok.com/@viora',
    idLabel: 'Open ID (from TikTok Developer Portal)', idPlaceholder: 'open-id-abc123',
    canPost: true },
  { key: 'x', label: 'X / Twitter', icon: 'fa-brands fa-x-twitter', color: '#000000',
    handlePlaceholder: '@viora', urlPlaceholder: 'https://x.com/viora',
    idLabel: 'Twitter User ID', idPlaceholder: '',
    canPost: false },
  { key: 'linkedin', label: 'LinkedIn', icon: 'fa-brands fa-linkedin', color: '#0a66c2',
    handlePlaceholder: 'viora', urlPlaceholder: 'https://linkedin.com/company/viora',
    idLabel: 'Company Page ID', idPlaceholder: '',
    canPost: false },
  { key: 'youtube', label: 'YouTube', icon: 'fa-brands fa-youtube', color: '#ff0033',
    handlePlaceholder: '@viora', urlPlaceholder: 'https://youtube.com/@viora',
    idLabel: 'Channel ID (UCxxxxxxxx)', idPlaceholder: 'UCxxxxxxxxxxxxxxxxxxxxxx',
    canPost: false },
  { key: 'threads', label: 'Threads', icon: 'fa-brands fa-threads', color: '#000000',
    handlePlaceholder: '@viora', urlPlaceholder: 'https://threads.net/@viora',
    idLabel: 'Threads User ID', idPlaceholder: '',
    canPost: false },
  { key: 'pinterest', label: 'Pinterest', icon: 'fa-brands fa-pinterest', color: '#e60023',
    handlePlaceholder: '@viora', urlPlaceholder: 'https://pinterest.com/viora',
    idLabel: 'Pinterest Business Account ID', idPlaceholder: '',
    canPost: false },
  { key: 'whatsapp', label: 'WhatsApp Business', icon: 'fa-brands fa-whatsapp', color: '#25d366',
    handlePlaceholder: '+254 7XX XXX XXX', urlPlaceholder: 'https://wa.me/254713428774',
    idLabel: 'WhatsApp Business Account ID', idPlaceholder: 'WABA ID',
    canPost: false },
  { key: 'gbp', label: 'Google Business Profile', icon: 'fa-brands fa-google', color: '#4285f4',
    handlePlaceholder: 'Viora Intercollective', urlPlaceholder: 'https://g.page/viora',
    idLabel: 'Google Business Profile ID', idPlaceholder: 'accounts/1234/locations/5678',
    canPost: false },
];

export function platformMeta(key) {
  return PLATFORMS.find(p => p.key === key) || PLATFORMS[0];
}

export function allPlatforms() { return PLATFORMS.slice(); }

/* ═══════════════════════════════════════════════════════════════
   DATA LAYER
   ═══════════════════════════════════════════════════════════════ */

export async function loadAccounts(force = false) {
  const now = Date.now();
  if (!force && _accountsCache && (now - _accountsCacheTs) < CACHE_TTL_MS) {
    return _accountsCache;
  }
  const { db, ref, get, P } = SAFE;
  if (!db || !ref || !get || !P) return [];

  try {
    const snap = await get(ref(db, P('socialAccounts')));
    const raw = snap.exists() ? snap.val() : {};
    const list = Object.entries(raw).map(([id, v]) => ({ id, ...v }));
    list.sort((a, b) => {
      const pa = PLATFORMS.findIndex(p => p.key === a.platform);
      const pb = PLATFORMS.findIndex(p => p.key === b.platform);
      return pa - pb;
    });
    _accountsCache = list;
    _accountsCacheTs = now;
    return list;
  } catch (e) {
    console.warn('[accounts] load failed', e.message);
    return _accountsCache || [];
  }
}

export async function getAccountForPlatform(platformKey) {
  const list = await loadAccounts();
  return list.find(a => a.platform === platformKey) || null;
}

export function getAccountForPlatformSync(platformKey) {
  const raw = SAFE.state?.data?.socialAccounts;
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
  return list.find(a => a.platform === platformKey) || null;
}

/* ═══════════════════════════════════════════════════════════════
   LIVE LISTENER
   ═══════════════════════════════════════════════════════════════ */
let _unsub = null;

export function subscribeToAccounts() {
  if (_unsub) return;
  const { db, ref, onValue, P, state } = SAFE;
  if (!db || !ref || !onValue || !P) return;

  try {
    _unsub = onValue(ref(db, P('socialAccounts')), (snap) => {
      const raw = snap.exists() ? snap.val() : {};
      const list = Object.entries(raw).map(([id, v]) => ({ id, ...v }));

      /* Only act if the data actually changed — Firebase sometimes fires
         duplicate events for the same snapshot. */
      const prevJson = JSON.stringify(state?.data?.socialAccounts || []);
      const nextJson = JSON.stringify(list);
      const changed = prevJson !== nextJson;

      if (state) {
        if (!state.data) state.data = {};
        state.data.socialAccounts = list;
      }
      _accountsCache = list;
      _accountsCacheTs = Date.now();

      /* Repaint the embedded accounts panel (on the Campaigns page) */
      try { renderAccountsPanel(); } catch (_) {}

      /* Repaint the current orbit module if it reads socialAccounts */
      if (changed) {
        try {
          const current = window.Orbit?.currentModule?.();
          if (current === 'accounts' || current === 'overview' || current === 'analytics') {
            window.Orbit.renderActiveOrbitModule?.();
          }
        } catch (_) {}
      }
    }, (err) => {
      if (err && err.code !== 'PERMISSION_DENIED') {
        console.warn('[accounts] subscribe failed', err);
      }
    });
  } catch (e) {
    console.warn('[accounts] subscribe threw', e);
  }
}

export function unsubscribeAccounts() {
  if (_unsub) { try { _unsub(); } catch (_) {} _unsub = null; }
}

/* ═══════════════════════════════════════════════════════════════
   DELETE ACCOUNT — single source of truth
   ═══════════════════════════════════════════════════════════════ */
export async function deleteAccount(accountId) {
  const { db, ref, remove, P, state } = SAFE;
  if (!db || !ref || !remove || !P) {
    SAFE.toast('Firebase not ready.', 'error');
    return false;
  }
  if (!accountId) {
    SAFE.toast('Account id missing.', 'error');
    return false;
  }

  const current = Array.isArray(state?.data?.socialAccounts) ? state.data.socialAccounts : [];
  const removed = current.find(a => a && a.id === accountId);
  if (!removed) {
    SAFE.toast('Account not found.', 'warning');
    return false;
  }

  /* Optimistic: remove from state.data.socialAccounts immediately */
  state.data.socialAccounts = current.filter(a => !a || a.id !== accountId);
  _repaintAccountViews();

  try {
    await remove(ref(db, P(`socialAccounts/${accountId}`)));
    SAFE.toast(`Removed ${removed.handle || removed.platform}.`, 'success');
    return true;
  } catch (e) {
    /* Rollback */
    state.data.socialAccounts = current;
    _repaintAccountViews();
    SAFE.toast('Delete failed: ' + (e.message || 'unknown'), 'error');
    return false;
  }
}

function _repaintAccountViews() {
  try { renderAccountsPanel(); } catch (_) {}
  try {
    const current = window.Orbit?.currentModule?.();
    if (current === 'accounts' || current === 'overview' || current === 'analytics') {
      window.Orbit.renderActiveOrbitModule?.();
    }
  } catch (_) {}
}

/* ═══════════════════════════════════════════════════════════════
   RENDER — the Social Accounts panel
   ═══════════════════════════════════════════════════════════════ */
export async function renderAccountsPanel() {
  const host = $('campaignSocialAccounts');
  if (!host) return;

  const [list, apiStatus] = await Promise.all([loadAccounts(), loadApiStatus()]);
  const byPlatform = {};
  for (const a of list) byPlatform[a.platform] = a;

  host.innerHTML = `
    <div class="card">
      <div class="cardhead">
        <h3><i class="fa-solid fa-share-nodes"></i> Your social media accounts</h3>
        <span class="pill">${Object.keys(byPlatform).length} of ${PLATFORMS.length} connected</span>
      </div>

      <div class="accounts-grid">
        ${PLATFORMS.map(p => renderAccountCard(p, byPlatform[p.key], apiStatus && apiStatus[p.key])).join('')}
      </div>

      <div class="notice" style="margin-top:14px;margin-bottom:0">
        <b>Why register here?</b>
        The composer uses these handles to prefill captions with @mentions.
        Facebook and TikTok post directly through the VIORA Cloudflare worker —
        the other platforms open a compose window with everything prefilled.
      </div>
    </div>
  `;

  host.querySelectorAll('[data-sa-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const platform = btn.getAttribute('data-sa-edit');
      openAccountEditor(platform, byPlatform[platform] || null);
    });
  });

  host.querySelectorAll('[data-sa-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-sa-remove');
      if (!id) return;
      if (!confirm('Remove this account? Campaigns that reference it will fall back to raw handle text.')) return;
      await deleteAccount(id);
    });
  });

  host.querySelectorAll('[data-sa-verify]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-sa-verify');
      if (!id) return;
      await verifyAccount(id);
    });
  });

  const refreshBtn = $('saRefreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      _accountsCache = null;
      _accountsCacheTs = 0;
      renderAccountsPanel();
      _apiStatusCache = null;
      _apiStatusCacheTs = 0;
      SAFE.toast('Refreshed account and API connection status.', 'info');
    });
  }
}

function renderAccountCard(platform, account, serviceStatus = null) {
  const isRegistered = !!account;
  const connected = !!serviceStatus?.verified;
  const serviceLabel = serviceStatus?.verified
    ? (platform.key === 'youtube' ? 'YouTube API verified' : 'Account API verified')
    : serviceStatus?.configured ? 'API configured · not verified' : 'API credentials missing';

  /* Followers can live in followers, stats.followers, or followersCache */
  const followerCount =
    account && account.followers       != null ? Number(account.followers) :
    account && account.stats?.followers != null ? Number(account.stats.followers) :
    account && account.followersCache  != null ? Number(account.followersCache) :
    null;

  const followersText = followerCount != null ? followerCount.toLocaleString() : null;
  const verified = account && account.verified;

  return `
    <div class="account-card" style="--platform-color:${platform.color};">
      <div class="account-head">
        <div class="account-ico">
          <i class="${platform.icon}"></i>
        </div>
        <div class="account-body">
          <div class="account-name">
            ${esc(platform.label)}
            ${verified ? '<i class="fa-solid fa-circle-check" style="color:var(--accent);font-size:11px" title="Verified"></i>' : ''}
          </div>
          <div class="account-handle">
            ${account
              ? esc(account.handle || '—') + (account.displayName ? ' · ' + esc(account.displayName) : '')
              : '<em>Not registered</em>'}
          </div>
        </div>
      </div>

      ${isRegistered ? `
        <div class="account-meta">
          <span>${connected ? '<i class="fa-solid fa-circle-check" style="color:var(--good)"></i> ' + esc(serviceLabel) : '<i class="fa-solid fa-triangle-exclamation" style="color:var(--warn)"></i> ' + esc(serviceLabel)}</span>
          ${followersText ? `<span>${followersText} followers</span>` : '<span>—</span>'}
        </div>
      ` : `
        <div class="account-meta">
          <span style="color:var(--muted)">${esc(serviceLabel)}</span>
        </div>
      `}

      <div class="account-actions">
        <button type="button" class="btn ${isRegistered ? 'primary' : ''}"
                data-sa-edit="${esc(platform.key)}">
          <i class="fa-solid fa-${isRegistered ? 'pen' : 'plus'}"></i>
          ${isRegistered ? 'Edit' : 'Connect'}
        </button>
        ${isRegistered ? `
          <button type="button" class="btn" data-sa-verify="${esc(account.id)}" title="Verify by calling the worker">
            <i class="fa-solid fa-satellite-dish"></i>
          </button>
          <button type="button" class="btn danger" data-sa-remove="${esc(account.id)}" title="Remove">
            <i class="fa-solid fa-trash"></i>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   EDIT MODAL
   ═══════════════════════════════════════════════════════════════ */
export function openAccountEditor(platformKey, existingAccount) {
  const platform = platformMeta(platformKey);
  let modal = document.getElementById('saEditorModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'saEditorModal';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }

  const a = existingAccount || {};

  modal.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <h2 style="margin-bottom:16px;">
        <span class="modal-icon" style="background:${platform.color}22;color:${platform.color};">
          <i class="${platform.icon}"></i>
        </span>
        ${esc(platform.label)} — ${a.id ? 'Edit Account' : 'Register Account'}
      </h2>

      <label>Handle *</label>
      <input id="saHandle" placeholder="${esc(platform.handlePlaceholder)}" value="${esc(a.handle || '')}" />
      <div style="font-size:.72rem;color:var(--text-secondary);margin-top:-4px;margin-bottom:10px;">
        Include the @ if your platform uses one (e.g. <code>@viora</code> for TikTok, <code>viora</code> for LinkedIn).
      </div>

      <label>Display Name</label>
      <input id="saDisplayName" placeholder="Viora Intercollective" value="${esc(a.displayName || '')}" />

      <label>Profile URL *</label>
      <input id="saProfileUrl" type="url" placeholder="${esc(platform.urlPlaceholder)}" value="${esc(a.profileUrl || '')}" />
      <div style="font-size:.72rem;color:var(--text-secondary);margin-top:-4px;margin-bottom:10px;">
        The full link to your page — this becomes the "Open" button on the account card and is used by analytics.
      </div>

      <label>${esc(platform.idLabel)}</label>
      <input id="saPlatformId" placeholder="${esc(platform.idPlaceholder)}" value="${esc(a.platformId || '')}" />
      <div style="font-size:.72rem;color:var(--text-secondary);margin-top:-4px;margin-bottom:10px;">
        ${platform.canPost
          ? '<strong style="color:var(--accent-green);">Required</strong> for direct posting via your Cloudflare worker.'
          : 'Optional — used for reference and analytics matching.'}
      </div>

      <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;margin:12px 0;">
        <input type="checkbox" id="saConnectedVia" ${a.connectedVia === 'api' ? 'checked' : ''} style="width:auto;" />
        <span>
          API-connected (post directly via worker)
          ${platform.canPost ? '' : '<span style="color:var(--accent-gold);">— your worker only supports Facebook & TikTok for direct posting</span>'}
        </span>
      </label>

      <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;margin:12px 0;">
        <input type="checkbox" id="saVerified" ${a.verified ? 'checked' : ''} style="width:auto;" />
        <span>Mark as verified / official account</span>
      </label>

      <label>Internal notes</label>
      <textarea id="saNotes" rows="2" placeholder="e.g. paid-ads account, do not post here">${esc(a.notes || '')}</textarea>

      <div class="form-actions" style="margin-top:18px;">
        <button type="button" class="btn btn-outline" id="saCancelBtn">Cancel</button>
        <button type="button" class="btn btn-success" id="saSaveBtn">
          <i class="fa-solid fa-check"></i> ${a.id ? 'Update' : 'Save Account'}
        </button>
      </div>
    </div>
  `;

  modal.classList.add('active');

  modal.querySelector('#saCancelBtn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal.querySelector('#saSaveBtn').addEventListener('click', async () => {
    const handle = (modal.querySelector('#saHandle').value || '').trim();
    const displayName = (modal.querySelector('#saDisplayName').value || '').trim();
    const profileUrl = (modal.querySelector('#saProfileUrl').value || '').trim();
    const platformId = (modal.querySelector('#saPlatformId').value || '').trim();
    const connectedVia = modal.querySelector('#saConnectedVia').checked ? 'api' : 'manual';
    const verified = modal.querySelector('#saVerified').checked;
    const notes = (modal.querySelector('#saNotes').value || '').trim();

    if (!handle) { SAFE.toast('Handle is required.', 'error'); return; }
    if (!profileUrl) { SAFE.toast('Profile URL is required.', 'error'); return; }
    if (platform.canPost && connectedVia === 'api' && !platformId) {
      SAFE.toast(`${platform.label} requires a ${platform.idLabel} for API posting.`, 'error');
      return;
    }

    const payload = {
      id: a.id || ('sa-' + platformKey + '-' + Date.now().toString(36)),
      platform: platformKey,
      handle,
      displayName,
      profileUrl,
      platformId,
      connectedVia,
      verified,
      notes,
      followers: a.followers ?? null,
      followersUpdatedAt: a.followersUpdatedAt || null,
      createdAt: a.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const { db, ref, set, P } = SAFE;
      await set(ref(db, P(`socialAccounts/${payload.id}`)), payload);
      SAFE.toast(a.id ? 'Account updated.' : 'Account registered.', 'success');
      modal.classList.remove('active');
      _accountsCache = null;
      _accountsCacheTs = 0;
      renderAccountsPanel();

      /* Auto-fetch followers for platforms the worker supports */
      if (payload.connectedVia === 'api'
          && ['youtube', 'tiktok'].includes(payload.platform)) {
        setTimeout(() => verifyAccount(payload.id).catch(() => {}), 400);
      }
    } catch (e) {
      SAFE.toast('Save failed: ' + (e.message || 'unknown'), 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   VERIFY — fetch live follower count via worker
   ═══════════════════════════════════════════════════════════════ */
async function verifyAccount(id) {
  const { db, ref, get, set, P, callFn } = SAFE;
  if (!db || !ref || !get || !set || !P) return;
  if (typeof callFn !== 'function') {
    SAFE.toast('Worker not available.', 'warning');
    return;
  }

  try {
    const snap = await get(ref(db, P(`socialAccounts/${id}`)));
    if (!snap.exists()) { SAFE.toast('Account not found.', 'error'); return; }
    const account = snap.val();
    SAFE.toast('Checking Cloudflare API connection for ' + account.handle + '…', 'info');

    const statusResult = await callFn('social/config/status', {});
    const service = statusResult?.integrations?.[account.platform];
    if (!service?.verified) {
      SAFE.toast(service?.message || 'The Worker could not verify this platform API.', 'warning');
      _apiStatusCache = statusResult?.integrations || null;
      _apiStatusCacheTs = Date.now();
      renderAccountsPanel();
      return;
    }

    let stats = null;
    if (['youtube', 'tiktok'].includes(account.platform)) {
      stats = await callFn('socialStats', {
        platform: account.platform,
        url: account.profileUrl,
        videoId: null,
      });
      if (!stats || stats.ok === false || stats.followers == null) {
        SAFE.toast(stats?.error || 'API key/token works, but this registered profile could not be verified.', 'warning');
        return;
      }
    } else if (account.platform === 'facebook' || account.platform === 'instagram') {
      const verifiedId = account.platform === 'facebook' ? service.pageId : service.accountId;
      if (account.platformId && verifiedId && String(account.platformId) !== String(verifiedId)) {
        SAFE.toast('The verified API account ID does not match the ID saved for this Campaigns account.', 'error');
        return;
      }
    }

    const updated = {
      ...account,
      connectedVia: 'api',
      verified: true,
      apiConnectionStatus: 'verified',
      apiVerifiedAt: new Date().toISOString(),
      apiVerificationMessage: service.message || 'Provider API verification passed.',
      ...(stats ? {
        followers: Number(stats.followers) || 0,
        followersUpdatedAt: new Date().toISOString(),
      } : {}),
      ...(account.platform === 'facebook' && service.pageId && !account.platformId ? { platformId: service.pageId } : {}),
      ...(account.platform === 'instagram' && service.accountId && !account.platformId ? { platformId: service.accountId } : {}),
      ...(account.platform === 'tiktok' && service.openId && !account.platformId ? { platformId: service.openId } : {}),
    };
    await set(ref(db, P(`socialAccounts/${id}`)), updated);

    if (stats?.followers != null) {
      try {
        const historyPath = P(`socialAccounts/${id}/followersHistory`);
        const historySnap = await get(ref(db, historyPath));
        const history = historySnap.exists() ? (historySnap.val() || []) : [];
        history.push({
          ts: new Date().toISOString(),
          followers: Number(stats.followers) || 0,
          source: stats.source || 'verified-api',
        });
        if (history.length > 90) history.splice(0, history.length - 90);
        await set(ref(db, historyPath), history);
      } catch (historyError) {
        console.warn('[verify] follower history append failed:', historyError.message);
      }
    }

    _apiStatusCache = statusResult.integrations;
    _apiStatusCacheTs = Date.now();
    SAFE.toast('API connection verified and saved to this Campaigns account.', 'success');
    renderAccountsPanel();
  } catch (error) {
    SAFE.toast('API verification failed: ' + (error.message || 'unknown'), 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS FOR OTHER MODULES
   ═══════════════════════════════════════════════════════════════ */
export function mentionForPlatform(platformKey, caption) {
  const account = getAccountForPlatformSync(platformKey);
  if (!account || !account.handle) return caption;
  const handle = account.handle.startsWith('@') ? account.handle : '@' + account.handle;
  if (String(caption || '').includes(handle)) return caption;
  return handle + ' ' + (caption || '');
}

export function postingAsLabel(platformKey) {
  const account = getAccountForPlatformSync(platformKey);
  if (!account) return null;
  return account.handle;
}
