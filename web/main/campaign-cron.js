// main/campaign-cron.js
// ═══════════════════════════════════════════════════════════════
// Background cron: refresh published-post stats every N minutes,
// cache in post.stats, detect anomalies, fire notifications.
// ═══════════════════════════════════════════════════════════════
import { engagementRate, detectAnomaly } from './campaign-utils.js';

let _ctx = null;
let _timer = null;
let _running = false;
const INTERVAL_MS = 3 * 60 * 1000;   // 3 min
const FRESH_MS    = 5 * 60 * 1000;   // skip if refreshed <5min ago

export function initCampaignCron(deps) {
  _ctx = deps || {};
}

function ctx() { return _ctx || {}; }

export function startCampaignCron() {
  if (_timer) return;
  _timer = setInterval(_tick, INTERVAL_MS);
  // First pass after a short delay
  setTimeout(_tick, 8000);
  console.info('[campaign-cron] started, interval', INTERVAL_MS / 1000, 's');
}

export function stopCampaignCron() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  _running = false;
}

async function _tick() {
  if (_running) return;
  /* REMOVED document.hidden check — stats should refresh even
     when the tab is backgrounded (browsers throttle RAF but not
     setInterval). We already have in-flight guards. */
  _running = true;
  try {
    await _refreshAllStats();
  } catch (e) {
    console.warn('[campaign-cron] tick failed:', e.message);
  } finally {
    _running = false;
  }
}

async function _refreshAllStats() {
  const state = ctx().state;
  const callFn = ctx().callFn;
  const upsertDoc = ctx().upsertDoc;
  if (!state?.data?.campaigns || typeof callFn !== 'function' || typeof upsertDoc !== 'function') return;

  const now = Date.now();
  const campaigns = state.data.campaigns;

  /* Collect every stale published post across all campaigns into one batch */
  const stale = [];
  for (const campaign of campaigns) {
    if (!campaign || !Array.isArray(campaign.posts)) continue;
    for (const post of campaign.posts) {
      if (!post || post.status !== 'published' || !post.url) continue;
      if (post.mode === 'compose-link') continue;  /* no stats available */
      const last = Date.parse(post.statsUpdatedAt || '') || 0;
      if (now - last < FRESH_MS) continue;
      stale.push({
        id: post.id,
        platform: post.platform,
        url: post.url,
        externalId: post.externalId || null,
      });
    }
  }
  if (!stale.length) return;

  let resultsById = {};
  try {
    /* Worker accepts up to 40 posts per batch — chunk if more */
    const CHUNK = 40;
    for (let i = 0; i < stale.length; i += CHUNK) {
      const chunk = stale.slice(i, i + CHUNK);
      const res = await callFn('social/stats/batch', { posts: chunk });
      if (res && res.ok && res.results) {
        Object.assign(resultsById, res.results);
      }
    }
  } catch (e) {
    console.warn('[campaign-cron] batch stats failed:', e.message);
    return;
  }

  const touchedCampaigns = new Set();

  for (const campaign of campaigns) {
    if (!campaign || !Array.isArray(campaign.posts)) continue;
    let dirty = false;

    for (const post of campaign.posts) {
      if (!post || !post.id) continue;
      const result = resultsById[post.id];
      if (!result || result.ok === false) continue;

      /* Precompute peer pool once — avoid O(n²) rebuild per stale post */
  const allPublishedWithStats = [];
  for (const cc of campaigns) {
    if (!cc || !Array.isArray(cc.posts)) continue;
    for (const p of cc.posts) {
      if (p && p.status === 'published' && p.stats) allPublishedWithStats.push(p);
    }
  }

      post.stats = {
        views:     result.views     ?? null,
        likes:     result.likes     ?? null,
        comments:  result.comments  ?? null,
        shares:    result.shares    ?? null,
        followers: result.followers ?? null,
      };
      post.statsUpdatedAt = new Date().toISOString();
      post.statsSource = result.source || null;

           const peers = allPublishedWithStats.filter(p => p.id !== post.id);
      const a = detectAnomaly(post, peers);
      if (a.type === 'spike') {
        _notify(
          '📈 Spike detected',
          `${post.caption?.slice(0, 60) || 'Post'} on ${post.platform} — ${a.multiple.toFixed(1)}× median engagement.`,
          'success'
        );
      } else if (a.type === 'drop') {
        _notify(
          '📉 Engagement drop',
          `${post.caption?.slice(0, 60) || 'Post'} on ${post.platform} — ${(a.multiple).toFixed(2)}× median engagement.`,
          'warning'
        );
      }
      dirty = true;
    }

    if (dirty) touchedCampaigns.add(campaign);
  }

  /* Save each touched campaign once */
  for (const campaign of touchedCampaigns) {
    try {
      await upsertDoc('campaigns', campaign, campaign._rev);
    } catch (e) {
      console.warn('[campaign-cron] save failed:', e.message);
    }
  }

  if (touchedCampaigns.size > 0) {
    try { ctx().renderCampaigns?.(); } catch (_) {}
    console.info(`[campaign-cron] refreshed ${Object.keys(resultsById).length} post stats across ${touchedCampaigns.size} campaign(s)`);
  }
}

function _notify(title, body, level) {
  try {
    if (typeof window.vioraNotify === 'function') {
      window.vioraNotify({ title, body, level, icon: 'fa-chart-line', source: 'campaign-cron' });
    }
  } catch (_) {}
}
