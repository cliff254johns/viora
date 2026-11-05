// main/campaign-ai.js — v2.1 (dedupe-safe composer)
// ═══════════════════════════════════════════════════════════════
// AI Composer — generate text/images across N platforms at once,
// preview each platform's tailored variant, and fan out posting
// via /social/post/fanout. Falls back to compose-link per platform
// when the worker says manual upload is required.
// ═══════════════════════════════════════════════════════════════
import {
  PILLARS, pillarByKey, PLATFORMS, platformMeta,
  composeUrlFor, escHtml as esc, q,
  makePost, makeFanoutItem, buildUtmUrl, utmFromPost,
  captionForPlatform,
  toUtcIso,
  readImageFile,
} from './campaign-utils.js';

let _ctx = null;

const ENDPOINTS = {
  generatePost:     'ai/generatePost',
  generateImage:    'ai/generateImage',
  suggestHashtags:  'ai/suggestHashtags',
  postFanout:       'social/post/fanout',
  queueEnqueue:     'queue/enqueue',
};

export function initCampaignAI(deps) {
  _ctx = deps || {};
  _state.composer = null;
  _state.bulkResults = null;
  _state.draftsFilter = '';
  _state.draftsPillar = 'all';
  _state.fanoutLog = _state.fanoutLog || [];
}

function ctx() { return _ctx || {}; }

const _state = {
  composer: null,
  bulkResults: null,
  draftsFilter: '',
  draftsPillar: 'all',
  generating: false,
  generatingImage: false,
  posting: false,
  fanoutLog: [],
};

const SAFE = {
  get $()       { return id => (typeof document !== 'undefined' ? document.getElementById(id) : null); },
  get toast()   { return (msg, type) => { try { ctx().toast?.(msg, type); } catch (_) {} }; },
  get state()   { return ctx().state || null; },
  get callFn()  { return ctx().callFn; },
  get upsertDoc(){ return ctx().upsertDoc; },
  get deleteDoc(){ return ctx().deleteDoc; },
  get openModal(){ return ctx().openModal; },
  get closeModal(){ return ctx().closeModal; },
  get renderCampaigns() { return ctx().renderCampaigns; },
  get getAccountForPlatformSync() { return ctx().getAccountForPlatformSync; },
};

/* ═══════════════════════════════════════════════════════════════
   OPEN COMPOSER
   ═══════════════════════════════════════════════════════════════ */
export function openComposer(opts = {}) {
  const campaigns = (SAFE.state?.data?.campaigns) || [];
  const campaignId = opts.campaignId || (campaigns[0] && campaigns[0].id) || '';

  let brief = opts.brief || '';
  if (!brief && SAFE.state && SAFE.state._pendingTrendTopic) {
    brief = SAFE.state._pendingTrendTopic;
    SAFE.state._pendingTrendTopic = null;
  }

  const connectedPlatforms = [];
  const getAcct = SAFE.getAccountForPlatformSync;
  if (typeof getAcct === 'function') {
    for (const key of Object.keys(PLATFORMS)) {
      if (getAcct(key)) connectedPlatforms.push(key);
    }
  }
  const initialPlatforms = opts.platforms && opts.platforms.length
    ? opts.platforms
    : connectedPlatforms.length ? connectedPlatforms : ['facebook'];

  _state.composer = {
    campaignId,
    fanoutId: opts.fanoutId || null,
    _existingPostIds: {},
    platforms: initialPlatforms,
    pillar: opts.pillar || 'educational',
    brief,
    tone: 'conversational',
    audience: 'Kenyan SMEs and tech buyers',
    cta: 'Try it free',
    language: 'en',
    useTrends: true,
    trendGeo: 'KE',
    count: 1,

    perPlatform: {},

    heroImageBase64: null,
    heroImageMime: 'image/png',
    heroImageWidth: null,
    heroImageHeight: null,
    heroImagePrompt: '',
    heroImageModel: '',
    heroImageSeed: null,
    heroImageSource: null,

    perPlatformImage: {},

    utm: { source: '', medium: 'social', campaign: '', content: '', term: '' },
    baseUrl: (ctx().state?.data?.companyProfile?.website) || 'https://viora.co.ke',
    status: 'draft',
    scheduledFor: '',
  };

  _state.bulkResults = null;

  if (!document.getElementById('campaignComposerModal')) {
    _buildComposerModal();
  }

  _renderComposer();
  if (SAFE.openModal) SAFE.openModal('campaignComposerModal');
}

export function openComposerWithTrend(topic) {
  openComposer({ brief: String(topic || '') });
}

export function openComposerForCampaign(campaignId) {
  openComposer({ campaignId });
}

export function openComposerForDraft(post) {
  if (!post) return;
  openComposer({ campaignId: post.campaignId });

  const campaigns = (SAFE.state?.data?.campaigns) || [];
  const camp = campaigns.find(c => c.id === post.campaignId);
  let siblingPlatforms = [post.platform];
  if (post.fanoutId && camp) {
    siblingPlatforms = (camp.posts || [])
      .filter(p => p.fanoutId === post.fanoutId)
      .map(p => p.platform);
    if (!siblingPlatforms.length) siblingPlatforms = [post.platform];
  }

  _state.composer.platforms = siblingPlatforms;
  _state.composer.pillar = post.pillar || 'educational';
  _state.composer.status = post.status || 'draft';
  _state.composer.scheduledFor = post.scheduledFor || '';

  const perPlatform = {};
  if (camp && post.fanoutId) {
    for (const p of camp.posts || []) {
      if (p.fanoutId !== post.fanoutId) continue;
      perPlatform[p.platform] = {
        caption: p.caption || '',
        hashtags: Array.isArray(p.hashtags) ? p.hashtags.slice() : [],
        imageBase64: p.imageBase64 || null,
        imageMime: p.imageMime || 'image/png',
        imageWidth: p.imageWidth || null,
        imageHeight: p.imageHeight || null,
      };
    }
  } else {
    perPlatform[post.platform] = {
      caption: post.caption || '',
      hashtags: Array.isArray(post.hashtags) ? post.hashtags.slice() : [],
      imageBase64: post.imageBase64 || null,
      imageMime: post.imageMime || 'image/png',
    };
  }
  _state.composer.perPlatform = perPlatform;
  _state.composer.heroImageBase64 = post.imageBase64 || null;
  _state.composer.heroImageMime = post.imageMime || 'image/png';
  _state.composer.heroImagePrompt = post.imagePrompt || '';
  _state.composer.utm = post.utm || { source: '', medium: 'social', campaign: '', content: '', term: '' };

  /* Preserve IDs so re-saving updates in place instead of duplicating */
  _state.composer._existingPostIds = {};
  if (camp && post.fanoutId) {
    for (const p of camp.posts || []) {
      if (p && p.fanoutId === post.fanoutId && p.platform) {
        _state.composer._existingPostIds[p.platform] = p.id;
      }
    }
    _state.composer.fanoutId = post.fanoutId;
  } else if (post.id) {
    _state.composer._existingPostIds[post.platform] = post.id;
  }

  _renderComposer();
}

/* ═══════════════════════════════════════════════════════════════
   MODAL BUILD
   ═══════════════════════════════════════════════════════════════ */
function _buildComposerModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'campaignComposerModal';
  overlay.innerHTML = `
    <div class="modal xl" style="max-width:1280px;max-height:94vh;overflow-y:auto;">
      <h2 style="margin-bottom:16px;">
        <span class="modal-icon" style="background:linear-gradient(135deg,#00d4ff,#7c3aed);">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
        </span>
        AI Multi-Platform Composer
        <span style="font-size:.75rem;color:var(--text-secondary);font-weight:400;margin-left:8px;">
          Generate once → post to N platforms
        </span>
      </h2>
      <div id="ccBody"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) _closeComposer();
  });
}

function _closeComposer() {
  if (SAFE.closeModal) SAFE.closeModal('campaignComposerModal');
}

/* ═══════════════════════════════════════════════════════════════
   RENDER COMPOSER
   ═══════════════════════════════════════════════════════════════ */
function _renderComposer() {
  const host = document.getElementById('ccBody');
  if (!host || !_state.composer) return;

  const c = _state.composer;
  const campaigns = (SAFE.state?.data?.campaigns) || [];
  const getAcct = SAFE.getAccountForPlatformSync;
  const platformKeys = Object.keys(PLATFORMS);

  const platformChips = platformKeys.map(key => {
    const meta = PLATFORMS[key];
    const checked = c.platforms.includes(key);
    const acct = typeof getAcct === 'function' ? getAcct(key) : null;
    const handle = acct && acct.handle ? acct.handle : '';
    const connected = !!acct;
    const modeLabel = meta.canPost ? 'auto-post' : 'compose-link';
    return `
      <label class="cc-platform-chip ${checked ? 'selected' : ''}" data-cc-platform="${esc(key)}">
        <input type="checkbox" ${checked ? 'checked' : ''} data-cc-platform-input="${esc(key)}" />
        <span class="cc-platform-icon" style="color:${meta.color};"><i class="${meta.icon}"></i></span>
        <span class="cc-platform-body">
          <span class="cc-platform-name">${esc(meta.label)}</span>
          <span class="cc-platform-handle">${handle ? esc(handle) : '<em>not registered</em>'}</span>
          <span class="cc-platform-mode">${connected ? modeLabel : 'open editor'}</span>
        </span>
      </label>
    `;
  }).join('');

  host.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:20px;">

      <div>
        <h4 class="form-section" style="margin-top:0;">Brief</h4>

        <label>Campaign *</label>
        <select id="ccCampaign">
          ${campaigns.length
            ? campaigns.map(cc => `<option value="${esc(cc.id)}" ${cc.id === c.campaignId ? 'selected' : ''}>${esc(cc.name)}</option>`).join('')
            : '<option value="">— Create a campaign first —</option>'}
        </select>

        <label>Platforms <span style="font-weight:400;color:var(--text-secondary);font-size:.75rem;">(select multiple)</span></label>
        <div class="cc-platform-grid">
          ${platformChips}
        </div>

        <div class="form-row">
          <div>
            <label>Pillar</label>
            <select id="ccPillar">
              ${PILLARS.map(p => `<option value="${p.key}" ${p.key === c.pillar ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Tone</label>
            <select id="ccTone">
              ${['conversational','professional','playful','inspiring','urgent','educational'].map(t =>
                `<option value="${t}" ${t === c.tone ? 'selected' : ''}>${t}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <label>Brief / Topic *</label>
        <textarea id="ccBrief" rows="3" placeholder="e.g. How Kenyan restaurants save 6 hours/week with our POS">${esc(c.brief)}</textarea>

        <div class="form-row">
          <div>
            <label>Audience</label>
            <input id="ccAudience" value="${esc(c.audience)}" />
          </div>
          <div>
            <label>CTA</label>
            <input id="ccCta" value="${esc(c.cta)}" />
          </div>
        </div>

        <label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-top:8px;cursor:pointer;">
          <input type="checkbox" id="ccUseTrends" ${c.useTrends ? 'checked' : ''} style="width:auto;" />
          <span>Use current Google Trends for context</span>
        </label>

        <div class="form-row">
          <div>
            <label>Trend Geo</label>
            <input id="ccTrendGeo" value="${esc(c.trendGeo)}" maxlength="2" placeholder="KE" />
          </div>
          <div>
            <label>Variants (bulk)</label>
            <select id="ccCount">
              <option value="1" ${c.count === 1 ? 'selected' : ''}>1 (single)</option>
              <option value="3" ${c.count === 3 ? 'selected' : ''}>3 (bulk)</option>
              <option value="5" ${c.count === 5 ? 'selected' : ''}>5 (bulk)</option>
            </select>
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-top:12px;">
          <button type="button" class="btn btn-primary" id="ccGenerateBtn" style="flex:1;">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Generate for ${c.platforms.length} platform${c.platforms.length === 1 ? '' : 's'}
          </button>
        </div>

        <div style="display:flex;gap:8px;margin-top:8px;">
          <button type="button" class="btn btn-outline btn-sm" id="ccGenerateImageBtn" style="flex:1;">
            <i class="fa-solid fa-image"></i> Generate Hero Image
          </button>
        </div>

        <h4 class="form-section">UTM / Link Tracking</h4>
        <label>Base URL</label>
        <input id="ccBaseUrl" value="${esc(c.baseUrl)}" />
        <div class="form-row">
          <div><label>utm_source</label><input id="ccUtmSource" value="${esc(c.utm.source)}" placeholder="auto from platform" /></div>
          <div><label>utm_medium</label><input id="ccUtmMedium" value="${esc(c.utm.medium)}" placeholder="social" /></div>
        </div>
        <div class="form-row">
          <div><label>utm_campaign</label><input id="ccUtmCampaign" value="${esc(c.utm.campaign)}" /></div>
          <div><label>utm_content</label><input id="ccUtmContent" value="${esc(c.utm.content)}" /></div>
        </div>
      </div>

      <div>
        <h4 class="form-section" style="margin-top:0;">
          Preview per Platform
          ${c.platforms.length ? `<span style="font-weight:400;color:var(--text-secondary);font-size:.72rem;margin-left:6px;">(${c.platforms.length} selected)</span>` : ''}
        </h4>

        <div id="ccPlatformPreviews">
          ${_renderPlatformPreviews(c)}
        </div>

        ${c.heroImageBase64 ? `
          <div style="margin-top:14px;">
            <label style="margin-top:0;">Hero Image</label>
            <div style="padding:12px;background:var(--bg-input);border-radius:12px;border:1px solid var(--border-color);text-align:center;">
              <img src="data:${esc(c.heroImageMime)};base64,${esc(c.heroImageBase64)}" style="max-width:100%;max-height:340px;border-radius:8px;" />
              <div style="font-size:.7rem;color:var(--text-secondary);margin-top:6px;">
                ${c.heroImageWidth && c.heroImageHeight ? esc(c.heroImageWidth + '×' + c.heroImageHeight) : ''}
                ${c.heroImageModel ? ' · ' + esc(c.heroImageModel) : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button type="button" class="btn btn-outline btn-sm" id="ccDownloadImageBtn"><i class="fa-solid fa-download"></i> Download</button>
              <button type="button" class="btn btn-outline btn-sm" id="ccCopyImageBtn"><i class="fa-solid fa-copy"></i> Copy</button>
            </div>
          </div>
        ` : ''}

        <label style="margin-top:16px;">Status</label>
        <select id="ccStatus">
          <option value="draft" ${c.status === 'draft' ? 'selected' : ''}>Save as Draft</option>
          <option value="published" ${c.status === 'published' ? 'selected' : ''}>Post Now</option>
          <option value="scheduled" ${c.status === 'scheduled' ? 'selected' : ''}>Schedule</option>
        </select>

        <div id="ccScheduleRow" style="display:${c.status === 'scheduled' ? 'block' : 'none'};margin-top:8px;">
          <label>Schedule for</label>
          <input type="datetime-local" id="ccScheduledFor" value="${esc(c.scheduledFor)}" />
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">
          <input type="file" id="ccUploadImageInput" accept="image/jpeg,image/png,image/webp" style="display:none;" />
          <button type="button" class="btn btn-outline" id="ccCancelBtn">Cancel</button>
          <button type="button" class="btn btn-outline" id="ccUploadImageBtn" title="Replace with your own image">
            <i class="fa-solid fa-upload"></i> Upload own
          </button>
          <button type="button" class="btn btn-outline" id="ccSaveDraftBtn">
            <i class="fa-solid fa-floppy-disk"></i> Save Draft
          </button>
          <button type="button" class="btn btn-success" id="ccPublishBtn" style="flex:1;">
            <i class="fa-solid fa-paper-plane"></i>
            <span id="ccPublishLabel">Post to ${c.platforms.length} Platform${c.platforms.length === 1 ? '' : 's'}</span>
          </button>
        </div>

        <div id="ccFanoutLog" style="margin-top:12px;"></div>
      </div>
    </div>
  `;

  _bindComposerEvents();
  _renderFanoutLog();
}

function _renderPlatformPreviews(c) {
  if (!c.platforms.length) {
    return `<div class="empty-state" style="padding:24px;text-align:center;color:var(--text-secondary);">
      <i class="fa-solid fa-layer-group" style="font-size:2rem;opacity:.4;margin-bottom:8px;display:block;"></i>
      Select at least one platform above.
    </div>`;
  }
  return c.platforms.map(key => {
    const meta = PLATFORMS[key];
    const variant = c.perPlatform[key] || {};
    const caption = variant.caption || '';
    const hashtags = Array.isArray(variant.hashtags) ? variant.hashtags : [];
    const charCount = caption.length;
    const charLimit = meta.maxChars || 2200;
    const overLimit = charCount > charLimit;
    const getAcct = SAFE.getAccountForPlatformSync;
    const acct = typeof getAcct === 'function' ? getAcct(key) : null;
    const handle = acct && acct.handle ? acct.handle : '';

    return `
      <div class="cc-platform-preview" data-cc-preview="${esc(key)}">
        <div class="cc-pp-head">
          <span class="cc-pp-icon" style="color:${meta.color};"><i class="${meta.icon}"></i></span>
          <span class="cc-pp-name">${esc(meta.label)}</span>
          ${handle ? `<span class="cc-pp-handle">${esc(handle)}</span>` : '<span class="cc-pp-handle cc-pp-warn">no account</span>'}
          <span class="cc-pp-mode">${meta.canPost ? 'auto-post' : 'compose-link'}</span>
        </div>
        <textarea class="cc-pp-textarea" data-cc-caption="${esc(key)}" rows="4"
          placeholder="Click Generate above, or type ${esc(meta.label)} caption manually">${esc(caption)}</textarea>
        <div class="cc-pp-meta">
          <span class="cc-pp-chars ${overLimit ? 'cc-pp-over' : ''}">${charCount} / ${charLimit}</span>
          <span class="cc-pp-image-size">Image: ${esc(meta.imageSize || '—')}</span>
        </div>
        <div class="cc-pp-hashtags">
          ${hashtags.map(tag => {
            const clean = String(tag).replace(/^#+/, '');
            return `<span class="badge badge-purple cc-pp-tag" data-cc-tag="${esc(key)}:${esc(clean)}">#${esc(clean)} ×</span>`;
          }).join('')}
        </div>
        <div class="cc-pp-image-wrap">
          ${variant.imageBase64
            ? `<img src="data:${esc(variant.imageMime || 'image/png')};base64,${esc(variant.imageBase64)}" class="cc-pp-image" />`
            : c.heroImageBase64
              ? `<img src="data:${esc(c.heroImageMime)};base64,${esc(c.heroImageBase64)}" class="cc-pp-image" />`
              : `<span class="cc-pp-image-empty">No image</span>`}
        </div>
      </div>
    `;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════════
   BIND EVENTS
   ═══════════════════════════════════════════════════════════════ */
function _bindComposerEvents() {
  const g = (id) => document.getElementById(id);
  const c = _state.composer;
  if (!c) return;

  document.querySelectorAll('[data-cc-platform-input]').forEach(inp => {
    inp.addEventListener('change', () => {
      document.querySelectorAll('[data-cc-caption]').forEach(ta => {
        const k = ta.getAttribute('data-cc-caption');
        if (!c.perPlatform[k]) c.perPlatform[k] = { caption: '', hashtags: [] };
        c.perPlatform[k].caption = ta.value;
      });
      const key = inp.getAttribute('data-cc-platform-input');
      const idx = c.platforms.indexOf(key);
      if (inp.checked && idx < 0) c.platforms.push(key);
      else if (!inp.checked && idx >= 0) c.platforms.splice(idx, 1);
      _renderComposer();
    });
  });

  document.querySelectorAll('[data-cc-caption]').forEach(ta => {
    ta.addEventListener('input', () => {
      const key = ta.getAttribute('data-cc-caption');
      if (!c.perPlatform[key]) c.perPlatform[key] = { caption: '', hashtags: [] };
      c.perPlatform[key].caption = ta.value;
      const counter = ta.parentElement.querySelector('.cc-pp-chars');
      const meta = PLATFORMS[key];
      if (counter && meta) {
        const len = ta.value.length;
        const limit = meta.maxChars || 2200;
        counter.textContent = `${len} / ${limit}`;
        counter.classList.toggle('cc-pp-over', len > limit);
      }
      const label = document.getElementById('ccPublishLabel');
      if (label) label.textContent = `Post to ${c.platforms.length} Platform${c.platforms.length === 1 ? '' : 's'}`;
    });
  });

  document.querySelectorAll('[data-cc-tag]').forEach(chip => {
    chip.addEventListener('click', () => {
      const [key, tag] = chip.getAttribute('data-cc-tag').split(':');
      if (c.perPlatform[key] && Array.isArray(c.perPlatform[key].hashtags)) {
        c.perPlatform[key].hashtags = c.perPlatform[key].hashtags.filter(t =>
          String(t).replace(/^#+/, '') !== tag
        );
      }
      _renderComposer();
    });
  });

  const bind = (id, key, transform = v => v) => {
    const el = g(id);
    if (!el) return;
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (!_state.composer) return;
      _state.composer[key] = transform(el.value);
      if (id === 'ccStatus') {
        const row = g('ccScheduleRow');
        if (row) row.style.display = el.value === 'scheduled' ? 'block' : 'none';
      }
    });
  };
  bind('ccCampaign', 'campaignId');
  bind('ccPillar', 'pillar');
  bind('ccTone', 'tone');
  bind('ccAudience', 'audience');
  bind('ccCta', 'cta');
  bind('ccBrief', 'brief');
  bind('ccCount', 'count', v => parseInt(v, 10) || 1);
  bind('ccStatus', 'status');
  bind('ccScheduledFor', 'scheduledFor');
  bind('ccBaseUrl', 'baseUrl');
  bind('ccTrendGeo', 'trendGeo');

  const useTrendsEl = g('ccUseTrends');
  if (useTrendsEl) useTrendsEl.addEventListener('change', () => { c.useTrends = useTrendsEl.checked; });

  ['ccUtmSource','ccUtmMedium','ccUtmCampaign','ccUtmContent'].forEach((id, i) => {
    const key = ['source','medium','campaign','content'][i];
    const el = g(id);
    if (!el) return;
    el.addEventListener('input', () => {
      c.utm[key] = el.value;
    });
  });

  g('ccGenerateBtn')?.addEventListener('click', _generateText);
  g('ccGenerateImageBtn')?.addEventListener('click', _generateImage);
  g('ccCancelBtn')?.addEventListener('click', _closeComposer);
  g('ccSaveDraftBtn')?.addEventListener('click', () => _savePost('draft'));
  g('ccPublishBtn')?.addEventListener('click', () => {
    /* The Publish button ALWAYS publishes — ignore the dropdown.
       The dropdown only applies to Save Draft / scheduling behaviour. */
    _savePost('published');
  });
  g('ccDownloadImageBtn')?.addEventListener('click', _downloadImage);
  g('ccCopyImageBtn')?.addEventListener('click', _copyImage);

  const uploadBtn = g('ccUploadImageBtn');
  const uploadInput = g('ccUploadImageInput');
  uploadBtn?.addEventListener('click', () => uploadInput?.click());
  uploadInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const img = await readImageFile(file);
      const c = _state.composer;
      if (!c) return;
      c.heroImageBase64 = img.b64;
      c.heroImageMime = img.mime;
      c.heroImageWidth = img.width;
      c.heroImageHeight = img.height;
      c.heroImagePrompt = '';
      c.heroImageModel = 'upload';
      c.heroImageSeed = null;
      c.heroImageSource = 'upload';
      _renderComposer();
      SAFE.toast('Image uploaded.', 'success');
    } catch (err) {
      SAFE.toast('Upload failed: ' + (err.message || 'unknown'), 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   GENERATE TEXT
   ═══════════════════════════════════════════════════════════════ */
async function _generateText(evt) {
  if (evt && typeof evt === 'object' && evt.isTrusted === false) {
    console.warn('[composer] _generateText ignored synthetic event');
    return;
  }
  const c = _state.composer;
  if (!c || _state.generating) return;

  if (!c.platforms.length) {
    SAFE.toast('Select at least one platform.', 'warning');
    return;
  }
  if (!c.brief || c.brief.trim().length < 5) {
    SAFE.toast('Write a brief first.', 'warning');
    return;
  }

  _state.generating = true;
  const btn = document.getElementById('ccGenerateBtn');
  const prev = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating…'; }

  try {
    const callFn = SAFE.callFn;
    if (typeof callFn !== 'function') throw new Error('callFn unavailable');

    const callWithRetry = async (fn, args, attempts = 2) => {
      let lastErr = null;
      for (let i = 0; i < attempts; i++) {
        try {
          return await fn(...args);
        } catch (err) {
          lastErr = err;
          const msg = String(err.message || '');
          const isTransient =
            msg.includes('503') ||
            msg.toLowerCase().includes('unavailable') ||
            msg.toLowerCase().includes('rate limit');
          if (!isTransient || i === attempts - 1) throw err;
          await new Promise(r => setTimeout(r, 1500));
        }
      }
      throw lastErr;
    };

    const res = await callWithRetry(callFn, [ENDPOINTS.generatePost, {
      brief: c.brief,
      platform: c.platforms[0],
      platforms: c.platforms.slice(),
      pillar: c.pillar,
      tone: c.tone,
      audience: c.audience,
      cta: c.cta,
      count: 1,
      useTrends: c.useTrends,
      trendGeo: c.trendGeo,
    }]);

    if (!res || (!res.ok && !res.text && !res.variants)) {
      throw new Error(res?.error || 'Worker returned no content');
    }

    for (const key of c.platforms) {
      const caption = captionForPlatform(res, key);
      const hashtags = Array.isArray(res.hashtags) ? res.hashtags.slice(0, 15) : [];
      c.perPlatform[key] = {
        ...(c.perPlatform[key] || {}),
        caption: caption || '',
        hashtags,
      };
    }

    _renderComposer();
    SAFE.toast(
      `Generated for ${c.platforms.length} platform${c.platforms.length === 1 ? '' : 's'}${res.usedTrends ? ' · used current trends' : ''}.`,
      'success'
    );
  } catch (e) {
    console.error('[composer] generate failed', e);

    const msg = String(e.message || 'unknown');
    const is503 = msg.includes('503') ||
                  msg.toLowerCase().includes('not configured') ||
                  msg.toLowerCase().includes('unavailable');

    if (is503) {
      SAFE.toast(
        'AI is temporarily unavailable. You can still write the caption manually, or try again in a minute.',
        'warning'
      );
      const firstPreview = document.querySelector('.cc-pp-textarea');
      if (firstPreview) firstPreview.focus();
    } else {
      SAFE.toast('Generation failed: ' + msg, 'error');
    }
  } finally {
    _state.generating = false;
    if (btn) { btn.disabled = false; btn.innerHTML = prev; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   GENERATE IMAGE
   ═══════════════════════════════════════════════════════════════ */
async function _generateImage(evt) {
  if (evt && typeof evt === 'object' && evt.isTrusted === false) {
    console.warn('[composer] _generateImage ignored synthetic event');
    return;
  }
  const c = _state.composer;
  if (!c || _state.generatingImage) return;

  const primary = c.platforms[0] || 'facebook';

  const prompt = [
    c.brief,
    c.pillar,
    'brand-consistent, high quality, vibrant',
    'clean composition, no text overlays',
  ].filter(Boolean).join(' — ');

  if (prompt.length < 10) {
    SAFE.toast('Write a brief first — it drives the image prompt.', 'warning');
    return;
  }

  _state.generatingImage = true;
  const btn = document.getElementById('ccGenerateImageBtn');
  const prev = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating…'; }

  try {
    const callFn = SAFE.callFn;
    const res = await callFn(ENDPOINTS.generateImage, {
      prompt,
      platform: primary,
      pillar: c.pillar,
      quality: 'production',
    });

    const b64 = res?.imageBase64 || res?.base64 || '';
    if (!b64) throw new Error('Worker returned no image');

    c.heroImageBase64 = b64.replace(/^data:[^;]+;base64,/, '');
    c.heroImageMime = res?.mime || 'image/png';
    c.heroImagePrompt = res?.prompt || prompt;
    c.heroImageModel = res?.model || null;
    c.heroImageWidth = res?.width || null;
    c.heroImageHeight = res?.height || null;
    c.heroImageSeed = res?.seed || null;
    c.heroImageSource = 'generated';

    _renderComposer();
    SAFE.toast(
      `Image generated${c.heroImageWidth ? ' · ' + c.heroImageWidth + '×' + c.heroImageHeight : ''}.`,
      'success'
    );
  } catch (e) {
    console.error('[composer] image failed', e);
    SAFE.toast('Image failed: ' + (e.message || 'unknown'), 'error');
  } finally {
    _state.generatingImage = false;
    if (btn) { btn.disabled = false; btn.innerHTML = prev; }
  }
}

function _downloadImage() {
  const c = _state.composer;
  if (!c || !c.heroImageBase64) return;
  const a = document.createElement('a');
  a.href = `data:${c.heroImageMime || 'image/png'};base64,${c.heroImageBase64}`;
  a.download = `viora-post-${Date.now()}.png`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function _copyImage() {
  const c = _state.composer;
  if (!c || !c.heroImageBase64) return;
  try {
    const res = await fetch(`data:${c.heroImageMime};base64,${c.heroImageBase64}`);
    const blob = await res.blob();
    if (blob.type !== 'image/png') throw new Error('Only PNG clipboard supported');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    SAFE.toast('Image copied.', 'success');
  } catch (e) {
    SAFE.toast('Copy failed — use Download.', 'warning');
  }
}

/* ═══════════════════════════════════════════════════════════════
   SAVE / POST
   ═══════════════════════════════════════════════════════════════ */
async function _savePost(status = 'draft') {
  const c = _state.composer;
  if (!c) return;
  if (!c.campaignId) { SAFE.toast('Pick a campaign first.', 'error'); return; }

  const emptyCaptions = c.platforms.filter(k =>
    !c.perPlatform[k] || !String(c.perPlatform[k].caption || '').trim()
  );
  if (emptyCaptions.length) {
    SAFE.toast(
      `Fill captions for: ${emptyCaptions.map(k => PLATFORMS[k].label).join(', ')}`,
      'warning'
    );
    return;
  }

  if (status === 'published') await _postNow();
  else await _persistPosts(status);
}

async function _persistPosts(status) {
  const c = _state.composer;
  if (!c) return;

  const campaign = (SAFE.state?.data?.campaigns || []).find(x => x.id === c.campaignId);
  if (!campaign) { SAFE.toast('Campaign not found.', 'error'); return; }

  const existingIds = c._existingPostIds || {};

  const posts = c.platforms.map(key => {
    const variant = c.perPlatform[key] || {};
    return makePost({
      id: existingIds[key] || undefined,
      campaignId: c.campaignId,
      fanoutId: c.fanoutId || undefined,
      platform: key,
      pillar: c.pillar,
      caption: variant.caption || '',
      hashtags: variant.hashtags || [],
      imageBase64: variant.imageBase64 || c.heroImageBase64,
      imageMime: variant.imageMime || c.heroImageMime,
      imageWidth: variant.imageWidth || c.heroImageWidth,
      imageHeight: variant.imageHeight || c.heroImageHeight,
      imagePrompt: c.heroImagePrompt,
      imageModel: c.heroImageModel,
      imageSource: c.heroImageSource || null,
      imageSeed: c.heroImageSeed,
      utm: { ...c.utm, source: c.utm.source || key },
      url: buildUtmUrl(c.baseUrl, { ...c.utm, source: c.utm.source || key }),
      status,
      mode: PLATFORMS[key].canPost ? 'auto' : 'compose-link',
      scheduledFor: status === 'scheduled' ? c.scheduledFor : null,
      scheduledForUtc: status === 'scheduled' && c.scheduledFor ? toUtcIso(c.scheduledFor) : null,
      createdBy: SAFE.state?.operator?.name || null,
    });
  });

  const fanout = makeFanoutItem({
    campaignId: c.campaignId,
    pillar: c.pillar,
    brief: c.brief,
    posts,
    createdBy: SAFE.state?.operator?.name || null,
    fanoutId: c.fanoutId || undefined,
  });

  const existingPosts = Array.isArray(campaign.posts) ? campaign.posts.slice() : [];
  const filtered = c.fanoutId
    ? existingPosts.filter(p => !p || p.fanoutId !== c.fanoutId)
    : existingPosts;

  campaign.posts = [...filtered, ...fanout.posts];
  campaign.updatedAt = new Date().toISOString();

  try {
    if (typeof SAFE.upsertDoc !== 'function') throw new Error('upsertDoc unavailable');
    await SAFE.upsertDoc('campaigns', campaign, campaign._rev);
    SAFE.toast(
      status === 'draft'
        ? `Saved ${fanout.posts.length} draft${fanout.posts.length === 1 ? '' : 's'}.`
        : `Scheduled ${fanout.posts.length} post${fanout.posts.length === 1 ? '' : 's'}.`,
      'success'
    );
    _closeComposer();
    try { SAFE.renderCampaigns?.(); } catch (_) {}
    try { window.Orbit?.renderActiveOrbitModule?.(); } catch (_) {}
  } catch (e) {
    console.error('[composer] save failed', e);
    SAFE.toast('Save failed: ' + (e.message || 'unknown'), 'error');
  }
}

async function _postNow() {
  const c = _state.composer;
  if (!c || _state.posting) return;

  /* ═══════════════════════════════════════════════════════════════
     STEP 1 — Pre-open compose windows SYNCHRONOUSLY
     ─────────────────────────────────────────────────────────────
     Browsers block window.open() from async callbacks. We must
     open all windows inside the click handler, before any await.
     Strategy: pre-open a window for every platform we expect to be
     compose-link (based on account.connectedVia), then close any
     we don't actually need after the API responds.

     For the platforms we expect to post via API (facebook/tiktok
     with connectedVia='api'), no pre-open is needed — they'll
     post silently.

     For non-API platforms (instagram, x, linkedin, threads,
     youtube, pinterest, whatsapp, gbp), pre-open the composer. ═════ */

  const preOpenedWindows = {};   // platform → window object

  for (const key of c.platforms) {
    const meta = PLATFORMS[key];
    if (!meta) continue;

    /* Only pre-open if we expect a compose fallback */
    const variant = c.perPlatform[key] || {};
    const caption = variant.caption || '';
    const hashtags = Array.isArray(variant.hashtags) ? variant.hashtags : [];
    const utmUrl = buildUtmUrl(c.baseUrl, { ...c.utm, source: c.utm.source || key });

    const tagString = hashtags
      .map(h => String(h || '').trim())
      .filter(Boolean)
      .map(h => h.startsWith('#') ? h : '#' + h)
      .join(' ');

    const fullCaption = [caption, tagString, utmUrl].filter(Boolean).join('\n\n');

    /* Determine the URL */
    let url = null;
    switch (key) {
      case 'twitter':
      case 'x':
        url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(fullCaption)}`;
        break;
      case 'linkedin':
        url = 'https://www.linkedin.com/feed/?shareActive=true';
        break;
      case 'threads':
        url = 'https://www.threads.net/';
        break;
      case 'youtube':
        url = 'https://studio.youtube.com/';
        break;
      case 'pinterest':
        url = 'https://www.pinterest.com/pin-builder/';
        break;
      case 'whatsapp':
        url = `https://wa.me/?text=${encodeURIComponent(fullCaption)}`;
        break;
      case 'gbp':
        url = 'https://business.google.com/posts';
        break;
      case 'instagram':
        url = 'https://www.instagram.com/create/select/';
        break;
      case 'facebook':
        url = 'https://www.facebook.com/';
        break;
      case 'tiktok':
        url = 'https://www.tiktok.com/tiktokstudio/upload';
        break;
    }

    if (!url) continue;

    /* Synchronously open the window. `noopener` blocks us from
       inspecting it, so we deliberately DON'T pass it — we need
       the handle to close unused windows later. */
    try {
      const w = window.open(url, '_blank');
      if (w) preOpenedWindows[key] = w;
    } catch (_) {}
  }

  /* ═══════════════════════════════════════════════════════════════
     STEP 2 — Copy caption to clipboard + build target payloads
     ═══════════════════════════════════════════════════════════════ */

  /* Copy each platform's caption to the clipboard (last one wins
     when user opens each tab — that's the practical limit). We
     also stash them on window so a "paste helper" banner can show
     the correct text per tab. */
  try {
    const firstPlatform = c.platforms[0];
    const firstVariant = c.perPlatform[firstPlatform] || {};
    const firstCaption = [
      firstVariant.caption || '',
      (firstVariant.hashtags || []).map(h => h.startsWith('#') ? h : '#' + h).join(' '),
    ].filter(Boolean).join('\n\n');
    if (firstCaption) await navigator.clipboard.writeText(firstCaption);
  } catch (_) {}

  /* Store all captions on window for the paste-helper UI */
  window._vioraComposeCaptions = {};
  for (const key of c.platforms) {
    const v = c.perPlatform[key] || {};
    window._vioraComposeCaptions[key] = [
      v.caption || '',
      (v.hashtags || []).map(h => h.startsWith('#') ? h : '#' + h).join(' '),
    ].filter(Boolean).join('\n\n');
  }

  _state.posting = true;
  const btn = document.getElementById('ccPublishBtn');
  const prev = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Posting…'; }

  try {
    const callFn = SAFE.callFn;
    if (typeof callFn !== 'function') throw new Error('callFn unavailable');

    const targets = c.platforms.map(key => {
      const variant = c.perPlatform[key] || {};
      return {
        platform: key,
        caption: variant.caption || '',
        hashtags: variant.hashtags || [],
        imageBase64: variant.imageBase64 || c.heroImageBase64 || null,
        imageMime: variant.imageMime || c.heroImageMime || 'image/png',
        utmUrl: buildUtmUrl(c.baseUrl, { ...c.utm, source: c.utm.source || key }),
      };
    });

    const res = await callFn(ENDPOINTS.postFanout, { targets });

    if (!res || !Array.isArray(res.results)) {
      throw new Error('Worker returned no results');
    }

    /* ═══════════════════════════════════════════════════════════════
       STEP 3 — Close unused windows, keep compose-link ones open
       ═══════════════════════════════════════════════════════════════ */

    _state.fanoutLog = res.results.map(r => {
      const isComposeOnly = r.fallback === 'compose-link';
      const trulyPosted   = !!r.ok && (!!r.postId || !!r.post_id) && !isComposeOnly;

      /* If this platform posted via API, close its pre-opened window */
      if (trulyPosted && preOpenedWindows[r.platform]) {
        try { preOpenedWindows[r.platform].close(); } catch (_) {}
      }

      /* If the worker returned a different composeUrl than the one we
         pre-opened, navigate the pre-opened window to the worker's URL */
      if (isComposeOnly && r.fallbackUrl && preOpenedWindows[r.platform]) {
        try {
          preOpenedWindows[r.platform].location.href = r.fallbackUrl;
        } catch (_) {
          /* If navigation blocked, leave the original URL — it still works */
        }
      }

      return {
        platform:   r.platform,
        ok:         trulyPosted,
        mode:       trulyPosted ? 'auto' : (isComposeOnly ? 'compose-link' : 'failed'),
        postId:     r.postId || r.post_id || null,
        composeUrl: r.fallbackUrl || r.composeUrl || null,
        error:      r.error || null,
        message:    r.message || null,
        ts:         new Date().toISOString(),
      };
    });

    /* Persist each platform's post with its real status */
    const campaign = (SAFE.state?.data?.campaigns || []).find(x => x.id === c.campaignId);
    if (campaign) {
      const existingIds = c._existingPostIds || {};
      const newPosts = _state.fanoutLog.map(r => {
        const variant = c.perPlatform[r.platform] || {};
        return makePost({
          id: existingIds[r.platform] || undefined,
          campaignId: c.campaignId,
          fanoutId: c.fanoutId || undefined,
          platform: r.platform,
          pillar: c.pillar,
          caption: variant.caption || '',
          hashtags: variant.hashtags || [],
          imageBase64: variant.imageBase64 || c.heroImageBase64,
          imageMime: variant.imageMime || c.heroImageMime,
          imageWidth: variant.imageWidth || c.heroImageWidth,
          imageHeight: variant.imageHeight || c.heroImageHeight,
          imagePrompt: c.heroImagePrompt,
          imageModel: c.heroImageModel,
          imageSeed: c.heroImageSeed,
          utm: { ...c.utm, source: c.utm.source || r.platform },
          url: buildUtmUrl(c.baseUrl, { ...c.utm, source: c.utm.source || r.platform }),
          status: r.mode === 'auto' ? 'published'
                : r.mode === 'compose-link' ? 'compose-only'
                : 'failed',
          mode: r.mode,
          publishedAt: r.mode === 'auto' ? new Date().toISOString() : null,
          externalId: r.postId,
          composeUrl: r.composeUrl,
          lastError: r.error,
          createdBy: SAFE.state?.operator?.name || null,
        });
      });

      const existingPosts = Array.isArray(campaign.posts) ? campaign.posts.slice() : [];
      const filtered = c.fanoutId
        ? existingPosts.filter(p => !p || p.fanoutId !== c.fanoutId)
        : existingPosts;

      campaign.posts = [...filtered, ...newPosts];
      campaign.updatedAt = new Date().toISOString();
      try { await SAFE.upsertDoc('campaigns', campaign, campaign._rev); } catch (_) {}
    }

    _renderFanoutLog();

    const succeeded   = _state.fanoutLog.filter(r => r.mode === 'auto').length;
    const composeOnly = _state.fanoutLog.filter(r => r.mode === 'compose-link').length;
    const failed      = _state.fanoutLog.filter(r => r.mode === 'failed').length;

    const parts = [];
    if (succeeded) parts.push(`${succeeded} posted automatically`);
    if (composeOnly) parts.push(`${composeOnly} composer${composeOnly === 1 ? '' : 's'} opened — press Ctrl+V to paste caption`);
    if (failed) parts.push(`${failed} failed`);

    SAFE.toast(parts.join(' · ') || 'Done.', failed ? 'warning' : 'success');

     /* If only silent posts succeeded, close the composer immediately.
       If any compose tabs are open, DON'T close the composer — the user
       needs to see the fanoutLog to know which platforms to paste on. */
    try { window.Orbit?.renderActiveOrbitModule?.(); } catch (_) {}
    if (!composeOnly && !failed) {
      setTimeout(_closeComposer, 600);
    }
  } catch (e) {
    console.error('[composer] post failed', e);
    SAFE.toast('Post failed: ' + (e.message || 'unknown'), 'error');

    /* Clean up pre-opened windows on error */
    for (const [key, w] of Object.entries(preOpenedWindows)) {
      try { if (w && !w.closed) w.close(); } catch (_) {}
    }
  } finally {
    _state.posting = false;
    if (btn) { btn.disabled = false; btn.innerHTML = prev; }
  }
}

function _renderFanoutLog() {
  const host = document.getElementById('ccFanoutLog');
  if (!host || !_state.fanoutLog.length) {
    if (host) host.innerHTML = '';
    return;
  }
  host.innerHTML = _state.fanoutLog.map(r => {
    const meta = PLATFORMS[r.platform] || { label: r.platform, icon: 'fa-solid fa-globe' };
    let badge = '';
    if (r.mode === 'auto') badge = '<span class="badge badge-paid">✓ posted</span>';
    else if (r.mode === 'compose-link') badge = '<span class="badge badge-pending">📋 paste & upload</span>';
    else badge = '<span class="badge badge-overdue">✗ failed</span>';

    return `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-input);border-radius:8px;margin-bottom:4px;border:1px solid var(--border-color);">
        <i class="${meta.icon}" style="color:${meta.color};"></i>
        <span style="flex:1;font-size:.82rem;font-weight:600;">${esc(meta.label)}</span>
        ${badge}
        ${r.mode === 'compose-link' && r.composeUrl
          ? `<a href="${esc(r.composeUrl)}" target="_blank" rel="noopener" class="btn btn-primary btn-xs"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>`
          : ''}
        ${r.error
          ? `<span style="font-size:.68rem;color:var(--accent-red);">${esc(r.error)}</span>`
          : ''}
      </div>
    `;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════════
   DRAFT LIBRARY
   ═══════════════════════════════════════════════════════════════ */
export function renderDraftLibrary() {
  const host = document.getElementById('campaignDraftLibrary');
  if (!host) return;

  const campaigns = (SAFE.state?.data?.campaigns) || [];
  const all = [];
  for (const cc of campaigns) {
    for (const p of (cc.posts || [])) {
      if (p && (p.status === 'draft' || p.status === 'scheduled')) {
        all.push({ ...p, campaignName: cc.name });
      }
    }
  }
  all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const filter = (_state.draftsFilter || '').toLowerCase();
  const pillarFilter = _state.draftsPillar || 'all';
  const filtered = all.filter(p => {
    if (pillarFilter !== 'all' && p.pillar !== pillarFilter) return false;
    if (filter && !((p.caption || '') + ' ' + (p.campaignName || '')).toLowerCase().includes(filter)) return false;
    return true;
  });

  host.innerHTML = `
    <div class="chart-box">
      <h4 style="margin:0 0 10px;">
        <i class="fa-solid fa-folder-open"></i> Draft Library (${filtered.length})
      </h4>
      ${filtered.length === 0
        ? '<div class="empty-state" style="padding:24px;">No drafts yet.</div>'
        : `<div style="display:flex;flex-direction:column;gap:6px;max-height:400px;overflow-y:auto;">
            ${filtered.slice(0, 50).map(p => {
              const pm = platformMeta(p.platform);
              const pl = pillarByKey(p.pillar);
              return `
                <div style="padding:10px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;display:flex;gap:10px;">
                  <div style="width:32px;height:32px;border-radius:8px;background:${pm.color}22;color:${pm.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="${pm.icon}"></i>
                  </div>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:.72rem;color:var(--text-secondary);margin-bottom:2px;">
                      ${esc(p.campaignName || '')} · <span class="badge badge-purple" style="font-size:.55rem;">${esc(pl.label)}</span>
                    </div>
                    <div style="font-size:.82rem;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">
                      ${esc(p.caption || '')}
                    </div>
                  </div>
                               <button type="button" class="btn btn-primary btn-xs" data-draft-open="${esc(p.id)}" data-draft-camp="${esc(p.campaignId)}" title="Edit">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                  <button type="button" class="btn danger btn-xs" data-draft-delete="${esc(p.id)}" data-draft-delete-camp="${esc(p.campaignId)}" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              `;
            }).join('')}
          </div>`}
    </div>
  `;

  host.querySelectorAll('[data-draft-open]').forEach(b => {
    b.addEventListener('click', () => {
      const postId = b.getAttribute('data-draft-open');
      const campId = b.getAttribute('data-draft-camp');
      const camp = campaigns.find(c => c.id === campId);
      const post = camp && (camp.posts || []).find(p => p.id === postId);
      if (post) openComposerForDraft(post);
    });
  });

  host.querySelectorAll('[data-draft-delete]').forEach(b => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const postId = b.getAttribute('data-draft-delete');
      const campId = b.getAttribute('data-draft-delete-camp');
      if (!confirm('Delete this draft? This cannot be undone.')) return;

      const camp = campaigns.find(c => c.id === campId);
      if (!camp) { SAFE.toast('Campaign not found.', 'error'); return; }

      const before = Array.isArray(camp.posts) ? camp.posts.length : 0;
      camp.posts = (camp.posts || []).filter(p => p && p.id !== postId);
      const after = camp.posts.length;
      camp.updatedAt = new Date().toISOString();

      try {
        if (typeof SAFE.upsertDoc !== 'function') throw new Error('upsertDoc unavailable');
        await SAFE.upsertDoc('campaigns', camp, camp._rev);
        SAFE.toast(`Deleted. ${before - after} post removed.`, 'success');
        renderDraftLibrary();
        try { ctx().renderCampaigns?.(); } catch (_) {}
        try { window.Orbit?.renderActiveOrbitModule?.(); } catch (_) {}
      } catch (err) {
        SAFE.toast('Delete failed: ' + (err.message || 'unknown'), 'error');
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   PROMPT LIBRARY
   ═══════════════════════════════════════════════════════════════ */
export function renderPromptLibrary() {
  const host = document.getElementById('campaignPromptLibrary');
  if (!host) return;

  const campaigns = (SAFE.state?.data?.campaigns) || [];
  const byPrompt = {};
  for (const cc of campaigns) {
    for (const p of (cc.posts || [])) {
      if (!p || !p.imagePrompt) continue;
      const key = p.imagePrompt;
      if (!byPrompt[key]) byPrompt[key] = { prompt: p.imagePrompt, posts: [], bestER: 0 };
      byPrompt[key].posts.push(p);
    }
  }

  const items = Object.values(byPrompt).sort((a, b) => b.bestER - a.bestER);

  host.innerHTML = `
    <div class="chart-box">
      <h4 style="margin:0 0 10px;"><i class="fa-solid fa-images"></i> Winning Image Prompts (${items.length})</h4>
      ${items.length === 0
        ? '<div class="empty-state" style="padding:24px;">Prompts appear here after generating images.</div>'
        : `<div style="display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto;">
            ${items.slice(0, 30).map(it => `
              <div style="padding:8px 10px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;">
                <div style="font-size:.78rem;line-height:1.4;margin-bottom:4px;">${esc(it.prompt || '')}</div>
                <div style="font-size:.68rem;color:var(--text-secondary);">Used ${it.posts.length}×</div>
              </div>
            `).join('')}
          </div>`}
    </div>
  `;
}
