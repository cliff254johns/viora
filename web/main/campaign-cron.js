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
  setTimeout(_tick, 8000);
  console.info('[campaign-cron] started, interval', INTERVAL_MS / 1000, 's');
}

export function stopCampaignCron() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  _running = false;
}

async function _tick() {
  if (_running) return;
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

  /* Collect every stale published post.
     Accept posts that have EITHER a url OR an externalId — some
     composer posts only carry the externalId after publishing. */
  const stale = [];
  for (const campaign of campaigns) {
    if (!campaign || !Array.isArray(campaign.posts)) continue;
    for (const post of campaign.posts) {
      if (!post || post.status !== 'published') continue;
      if (post.mode === 'compose-link') continue;
      if (!post.url && !post.externalId) continue;
      const last = Date.parse(post.statsUpdatedAt || '') || 0;
      if (now - last < FRESH_MS) continue;
      stale.push({
        id: post.id,
        platform: post.platform,
        url: post.url || null,
        externalId: post.externalId || null,
      });
    }
  }
  if (!stale.length) return;

  let resultsById = {};
  try {
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

  /* Precompute peer pool once — reused across every post */
  const allPublishedWithStats = [];
  for (const cc of campaigns) {
    if (!cc || !Array.isArray(cc.posts)) continue;
    for (const p of cc.posts) {
      if (p && p.status === 'published' && p.stats) allPublishedWithStats.push(p);
    }
  }

  const touchedCampaigns = new Set();

  for (const campaign of campaigns) {
    if (!campaign || !Array.isArray(campaign.posts)) continue;
    let dirty = false;

    for (const post of campaign.posts) {
      if (!post || !post.id) continue;
      const result = resultsById[post.id];
      if (!result) {
        /* No result at all — record a soft error so we retry next tick */
        if (post.status === 'published' && (post.url || post.externalId)) {
          post.statsError = 'No data returned by worker';
          dirty = true;
        }
        continue;
      }
      if (result.ok === false) {
        post.statsError = result.error || 'Worker reported failure';
        post.statsUpdatedAt = new Date().toISOString();
        dirty = true;
        continue;
      }

      const hasValues =
        result.views    != null ||
        result.likes    != null ||
        result.comments != null ||
        result.shares   != null;

      if (hasValues) {
        if (!Array.isArray(post.statsHistory)) post.statsHistory = [];
        post.statsHistory.push({
          ts:       new Date().toISOString(),
          views:    result.views    ?? null,
          likes:    result.likes    ?? null,
          comments: result.comments ?? null,
          shares:   result.shares   ?? null,
        });
        if (post.statsHistory.length > 30) {
          post.statsHistory.splice(0, post.statsHistory.length - 30);
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
      post.statsError = null;

      /* Backfill metadata on first fetch — lets Post Library show a real title */
      if (result.publishedAt && !post.publishedAt) post.publishedAt = result.publishedAt;
      if (result.title && !post.caption) post.caption = result.title;
      if (result.thumbnail) post.thumbnailUrl = result.thumbnail;
      if (result.externalId && !post.externalId) post.externalId = result.externalId;

      const peers = allPublishedWithStats.filter(p => p.id !== post.id);
      const a = detectAnomaly(post, peers);
      if (a.type === 'spike') {
        _notify(
          'Spike detected',
          `${post.caption?.slice(0, 60) || 'Post'} on ${post.platform} — ${a.multiple.toFixed(1)}x median engagement.`,
          'success',
          post.id + '-spike'
        );
      } else if (a.type === 'drop') {
        _notify(
          'Engagement drop',
          `${post.caption?.slice(0, 60) || 'Post'} on ${post.platform} — ${(a.multiple).toFixed(2)}x median engagement.`,
          'warning',
          post.id + '-drop'
        );
      }
      dirty = true;
    }

    if (dirty) touchedCampaigns.add(campaign);
  }

  for (const campaign of touchedCampaigns) {
    try {
      await upsertDoc('campaigns', campaign, campaign._rev);
    } catch (e) {
      console.warn('[campaign-cron] save failed:', e.message);
    }
  }

  if (touchedCampaigns.size > 0) {
    try { ctx().renderCampaigns?.(); } catch (_) {}
    try {
      /* If the user is looking at analytics, re-render so the charts update live */
      const current = window.Orbit?.currentModule?.();
      if (current === 'analytics') window.Orbit.renderActiveOrbitModule?.();
    } catch (_) {}
    console.info(`[campaign-cron] refreshed ${Object.keys(resultsById).length} post stats across ${touchedCampaigns.size} campaign(s)`);
  }
}

function _notify(title, body, level, eventId) {
  try {
    if (typeof window.vioraNotify === 'function') {
      window.vioraNotify({ title, body, level, icon: 'fa-chart-line', source: 'campaign-cron', eventId });
    }
  } catch (_) {}
}
