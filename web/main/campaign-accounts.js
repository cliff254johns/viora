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
// ═══════════════════════════════════════════════════════════════

let _ctx = null;
let _accountsCache = null;
let _accountsCacheTs = 0;
const CACHE_TTL_MS = 60 * 1000;

export function initCampaignAccounts(deps) {
  _ctx = deps || {};
  _accountsCache = null;
  _accountsCacheTs = 0;
}

function ctx() { return _ctx || {}; }

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
  { key: 'facebook',  label: 'Facebook',  icon: 'fa-brands fa-facebook',  color: '#1877f2',
    handlePlaceholder: '@viora', urlPlaceholder: 'https://facebook.com/viora',
    idLabel: 'Page ID (required for API posting)', idPlaceholder: '1234567890',
    canPost: true },
  { key: 'tiktok',    label: 'TikTok',    icon: 'fa-brands fa-tiktok',    color: '#ff0050',
    handlePlaceholder: '@viora', urlPlaceholder: 'https://tiktok.com/@viora',
    idLabel: 'Open ID (from TikTok Developer Portal)', idPlaceholder: 'open-id-abc123',
    canPost: true },
  { key: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram', color: '#e1306c',
    handlePlaceholder: '@viora', urlPlaceholder: 'https://instagram.com/viora',
    idLabel: 'Business Account ID', idPlaceholder: '17841400...',
    canPost: false },
  { key: 'youtube',   label: 'YouTube',   icon: 'fa-brands fa-youtube',   color: '#ff0033',
    handlePlaceholder: '@viora', urlPlaceholder: 'https://youtube.com/@viora',
    idLabel: 'Channel ID (UCxxxxxxxx)', idPlaceholder: 'UCxxxxxxxxxxxxxxxxxxxxxx',
    canPost: false },
  { key: 'twitter',   label: 'X / Twitter', icon: 'fa-brands fa-x-twitter', color: '#000000',
    handlePlaceholder: '@viora', urlPlaceholder: 'https://x.com/viora',
    idLabel: 'Twitter User ID', idPlaceholder: '',
    canPost: false },
  { key: 'linkedin',  label: 'LinkedIn',  icon: 'fa-brands fa-linkedin',  color: '#0a66c2',
    handlePlaceholder: 'viora', urlPlaceholder: 'https://linkedin.com/company/viora',
    idLabel: 'Company Page ID', idPlaceholder: '',
    canPost: false },
];

export function platformMeta(key) {
  return PLATFORMS.find(p => p.key === key) || PLATFORMS[0];
}

export function allPlatforms() { return PLATFORMS.slice(); }

/* ═══════════════════════════════════════════════════════════════
   DATA LAYER
   ═══════════════════════════════════════════════════════════════ */

/** Fetch all accounts from Firebase (with in-memory cache). */
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

/** Find the account object for a specific platform. */
export async function getAccountForPlatform(platformKey) {
  const list = await loadAccounts();
  return list.find(a => a.platform === platformKey) || null;
}

/** Sync — reads whatever is in state (populated by the live listener below). */
export function getAccountForPlatformSync(platformKey) {
  const raw = SAFE.state?.data?.socialAccounts;
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
  return list.find(a => a.platform === platformKey) || null;
}

/* ═══════════════════════════════════════════════════════════════
   LIVE LISTENER — populates state.data.socialAccounts
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
      if (state) {
        if (!state.data) state.data = {};
        state.data.socialAccounts = list;
      }
      _accountsCache = list;
      _accountsCacheTs = Date.now();
      // Re-render any panel that's currently open
      try { renderAccountsPanel(); } catch (_) {}
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
   RENDER — the Social Accounts panel
   ═══════════════════════════════════════════════════════════════ */
export async function renderAccountsPanel() {
  const host = $('campaignSocialAccounts');
  if (!host) return;

  const list = await loadAccounts();
  const byPlatform = {};
  for (const a of list) byPlatform[a.platform] = a;

  host.innerHTML = `
    <div class="chart-box" style="border-left:4px solid var(--accent-blue);">
      <h4 style="margin:0 0 12px;display:flex;align-items:center;gap:10px;">
        <i class="fa-solid fa-share-nodes"></i>
        <span>Your Social Media Accounts</span>
        <span style="font-size:.72rem;color:var(--text-secondary);font-weight:400;">
          — register each channel once. Every campaign and post uses these.
        </span>
        <button type="button" class="btn btn-outline btn-sm" id="saRefreshBtn" style="margin-left:auto;">
          <i class="fa-solid fa-rotate"></i> Refresh
        </button>
      </h4>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:14px;">
        ${PLATFORMS.map(p => renderAccountCard(p, byPlatform[p.key])).join('')}
      </div>

      <div style="margin-top:16px;padding:12px;background:var(--bg-input);border-radius:10px;border:1px dashed var(--border-color);font-size:.78rem;color:var(--text-secondary);">
        <i class="fa-solid fa-circle-info" style="color:var(--accent-blue);"></i>
        <strong>Why register here?</strong>
        The composer uses these handles to prefill the caption with @mentions. The analytics dashboard uses the platform IDs to fetch live stats. Facebook and TikTok post directly through your Cloudflare worker — the other platforms open a compose window with everything prefilled.
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
      try {
        const { db, ref, remove, P } = SAFE;
        await remove(ref(db, P(`socialAccounts/${id}`)));
        SAFE.toast('Account removed.', 'info');
        renderAccountsPanel();
      } catch (e) {
        SAFE.toast('Remove failed: ' + (e.message || 'unknown'), 'error');
      }
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
      SAFE.toast('Refreshed.', 'info');
    });
  }
}

function renderAccountCard(platform, account) {
  const isRegistered = !!account;
  const connected = account && account.connectedVia === 'api';
  const followersText = account && account.followers != null
    ? Number(account.followers).toLocaleString()
    : null;
  const verified = account && account.verified;

  return `
    <div style="padding:14px;background:var(--bg-card-solid);border:1.5px solid ${isRegistered ? platform.color + '55' : 'var(--border-color)'};border-radius:12px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:38px;height:38px;border-radius:10px;background:${platform.color}22;color:${platform.color};display:flex;align-items:center;justify-content:center;font-size:1.15rem;flex-shrink:0;">
          <i class="${platform.icon}"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:.9rem;display:flex;align-items:center;gap:6px;">
            ${esc(platform.label)}
            ${verified ? '<i class="fa-solid fa-circle-check" style="color:var(--accent-blue);font-size:.75rem;" title="Verified"></i>' : ''}
          </div>
          ${account
            ? `<div style="font-size:.75rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                 ${esc(account.handle || '—')}${account.displayName ? ' · ' + esc(account.displayName) : ''}
               </div>`
            : `<div style="font-size:.75rem;color:var(--text-light);">Not registered</div>`}
        </div>
      </div>

      ${isRegistered ? `
        <div style="display:flex;flex-direction:column;gap:4px;font-size:.75rem;margin-bottom:10px;padding:8px;background:var(--bg-input);border-radius:8px;">
          ${account.profileUrl ? `
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:var(--text-secondary);">Profile</span>
              <a href="${esc(account.profileUrl)}" target="_blank" rel="noopener noreferrer"
                 style="color:var(--accent-blue);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">
                Open <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:.65rem;"></i>
              </a>
            </div>
          ` : ''}
          ${account.platformId ? `
            <div style="display:flex;justify-content:space-between;gap:8px;">
              <span style="color:var(--text-secondary);">ID</span>
              <code style="font-size:.7rem;color:var(--accent-purple);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(account.platformId.slice(0, 20))}${account.platformId.length > 20 ? '…' : ''}</code>
            </div>
          ` : ''}
          ${followersText ? `
            <div style="display:flex;justify-content:space-between;">
              <span style="color:var(--text-secondary);">Followers</span>
              <strong style="color:var(--accent-green);">${followersText}</strong>
            </div>
          ` : ''}
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--text-secondary);">API posting</span>
            <span class="badge ${connected ? 'badge-paid' : 'badge-gray'}" style="font-size:.6rem;">
              ${connected ? 'Enabled' : 'Compose-link'}
            </span>
          </div>
        </div>
      ` : ''}

      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="btn btn-${isRegistered ? 'primary' : 'success'} btn-sm"
                data-sa-edit="${esc(platform.key)}" style="flex:1;">
          <i class="fa-solid fa-${isRegistered ? 'pen' : 'plus'}"></i>
          ${isRegistered ? 'Edit' : 'Add Account'}
        </button>
        ${isRegistered ? `
          <button type="button" class="btn btn-outline btn-sm" data-sa-verify="${esc(account.id)}" title="Verify by calling the worker">
            <i class="fa-solid fa-satellite-dish"></i>
          </button>
          <button type="button" class="btn btn-danger btn-sm" data-sa-remove="${esc(account.id)}" title="Remove">
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
    } catch (e) {
      SAFE.toast('Save failed: ' + (e.message || 'unknown'), 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   VERIFY ACCOUNT — calls the worker to fetch live follower count
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

    SAFE.toast('Checking ' + account.handle + '…', 'info');

    // Call the worker's competitor/stats or socialStats endpoint with the profile URL
    const res = await callFn('socialStats', {
      platform: account.platform,
      url: account.profileUrl,
      videoId: null,
    });

    if (res && res.ok !== false) {
      const updated = {
        ...account,
        followers: res.followers ?? account.followers ?? null,
        followersUpdatedAt: new Date().toISOString(),
        verified: true,
      };
      await set(ref(db, P(`socialAccounts/${id}`)), updated);
      SAFE.toast(`Verified — ${Number(res.followers || 0).toLocaleString()} followers.`, 'success');
      renderAccountsPanel();
    } else {
      SAFE.toast('Verification returned no data. Check the profile URL.', 'warning');
    }
  } catch (e) {
    SAFE.toast('Verify failed: ' + (e.message || 'unknown'), 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS FOR OTHER MODULES
   ═══════════════════════════════════════════════════════════════ */

/**
 * Enrich a caption with the handle mention for a given platform.
 * e.g. for TikTok, prepend "@viora " if not already there.
 */
export function mentionForPlatform(platformKey, caption) {
  const account = getAccountForPlatformSync(platformKey);
  if (!account || !account.handle) return caption;
  const handle = account.handle.startsWith('@') ? account.handle : '@' + account.handle;
  if (String(caption || '').includes(handle)) return caption;
  return handle + ' ' + (caption || '');
}

/**
 * Return a small "post as @handle" badge for the composer preview.
 */
export function postingAsLabel(platformKey) {
  const account = getAccountForPlatformSync(platformKey);
  if (!account) return null;
  return account.handle;
}
