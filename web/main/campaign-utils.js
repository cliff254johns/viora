// main/campaign-utils.js
// ═══════════════════════════════════════════════════════════════
// Shared helpers for the campaigns subsystem.
// Zero side effects. No Firebase, no DOM.
// ═══════════════════════════════════════════════════════════════

/* ── Content pillars ── */
export const PILLARS = Object.freeze([
  { key: 'educational',         label: 'Educational',         icon: 'fa-graduation-cap',  color: '#00d4ff' },
  { key: 'promotional',         label: 'Promotional',         icon: 'fa-bullhorn',        color: '#ff5c7c' },
  { key: 'behind_the_scenes',   label: 'Behind the Scenes',   icon: 'fa-video',           color: '#a855f7' },
  { key: 'user_generated',      label: 'User Generated',      icon: 'fa-users',           color: '#22e6a0' },
  { key: 'entertainment',       label: 'Entertainment',       icon: 'fa-face-laugh-beam', color: '#ffc857' },
  { key: 'testimonial',         label: 'Testimonial',         icon: 'fa-quote-left',      color: '#10b981' },
  { key: 'announcement',        label: 'Announcement',        icon: 'fa-bullseye',        color: '#7c3aed' },
  { key: 'trending',            label: 'Trending',            icon: 'fa-fire',            color: '#ff9a3c' },
]);

export function pillarByKey(key) {
  return PILLARS.find(p => p.key === key) || PILLARS[0];
}

/* ── Platform metadata ── */
export const PLATFORMS = Object.freeze({
  facebook:  { label: 'Facebook',  icon: 'fa-brands fa-facebook',  color: '#1877f2',
               canPost: true,  supportsImage: true,  imageSize: '1200x630',  imageAR: '1.91:1',  maxChars: 63206 },
  tiktok:    { label: 'TikTok',    icon: 'fa-brands fa-tiktok',    color: '#ff0050',
               canPost: true,  supportsImage: false, imageSize: '1080x1920', imageAR: '9:16',    maxChars: 2200 },
  instagram: { label: 'Instagram', icon: 'fa-brands fa-instagram', color: '#e1306c',
               canPost: false, supportsImage: true,  imageSize: '1080x1080', imageAR: '1:1',     maxChars: 2200 },
  youtube:   { label: 'YouTube',   icon: 'fa-brands fa-youtube',   color: '#ff0033',
               canPost: false, supportsImage: false, imageSize: '1280x720',  imageAR: '16:9',    maxChars: 5000 },
  twitter:   { label: 'X / Twitter', icon: 'fa-brands fa-x-twitter', color: '#000000',
               canPost: false, supportsImage: true,  imageSize: '1600x900',  imageAR: '16:9',    maxChars: 280 },
  linkedin:  { label: 'LinkedIn',  icon: 'fa-brands fa-linkedin',  color: '#0a66c2',
               canPost: false, supportsImage: true,  imageSize: '1200x627',  imageAR: '1.91:1',  maxChars: 3000 },
  threads:   { label: 'Threads',   icon: 'fa-brands fa-threads',   color: '#000000',
               canPost: false, supportsImage: true,  imageSize: '1080x1080', imageAR: '1:1',     maxChars: 500 },
  pinterest: { label: 'Pinterest', icon: 'fa-brands fa-pinterest', color: '#e60023',
               canPost: false, supportsImage: true,  imageSize: '1000x1500', imageAR: '2:3',     maxChars: 500 },
  whatsapp:  { label: 'WhatsApp',  icon: 'fa-brands fa-whatsapp',  color: '#25d366',
               canPost: false, supportsImage: true,  imageSize: '1080x1080', imageAR: '1:1',     maxChars: 1000 },
  gbp:       { label: 'Google Business', icon: 'fa-brands fa-google', color: '#4285f4',
               canPost: false, supportsImage: true,  imageSize: '1200x900',  imageAR: '4:3',     maxChars: 1500 },
});

/* ═══════════════════════════════════════════════════════════════
   PLATFORM METADATA
   ═══════════════════════════════════════════════════════════════ */
export function platformMeta(key) {
  return PLATFORMS[key] || {
    label: key || 'Unknown',
    icon: 'fa-solid fa-globe',
    color: '#94a3b8',
    canPost: false,
    supportsImage: false,
    maxChars: 2200,
  };
}

/* ═══════════════════════════════════════════════════════════════
   CAPTION EXTRACTION
   Handles every worker response shape.
   ═══════════════════════════════════════════════════════════════ */
export function captionForPlatform(workerResponse, platform) {
  if (!workerResponse) return '';

  /* Shape 1: { text, hashtags, variants: { platform: string } } */
  const v = workerResponse.variants && workerResponse.variants[platform];
  if (v && typeof v === 'string' && v.trim()) return v.trim();

  /* Shape 2: { variants: [ { text, variants: {...} } ] } (bulk) */
  if (Array.isArray(workerResponse.variants) && workerResponse.variants[0]) {
    const first = workerResponse.variants[0];
    const fv = first.variants && first.variants[platform];
    if (fv && typeof fv === 'string' && fv.trim()) return fv.trim();
    if (first.text) return String(first.text).trim();
  }

  /* Shape 3: { text } fallback */
  const fallback = String(workerResponse.text || '').trim();
  if (fallback) {
    const keys = workerResponse.variants && !Array.isArray(workerResponse.variants)
      ? Object.keys(workerResponse.variants)
      : [];
    console.warn(
      `[captionForPlatform] No variant for "${platform}" — using base caption. ` +
      `Worker returned: [${keys.join(', ')}]`
    );
  }
  return fallback;
}

/* ═══════════════════════════════════════════════════════════════
   COMPOSE URL BUILDER
   ═══════════════════════════════════════════════════════════════ */
export function composeUrlFor(platform, caption, hashtags) {
  const text = encodeURIComponent(
    [caption || '', (hashtags || []).map(h => h.startsWith('#') ? h : '#' + h).join(' ')]
      .filter(Boolean).join('\n\n')
  );
  switch (platform) {
    case 'twitter':   return `https://twitter.com/intent/tweet?text=${text}`;
    case 'linkedin':  return `https://www.linkedin.com/feed/?shareActive=true`;
    case 'instagram': return `https://www.instagram.com/create/select/`;
    case 'youtube':   return `https://studio.youtube.com/`;
    case 'tiktok':    return `https://www.tiktok.com/tiktokstudio/upload`;
    case 'facebook':  return `https://www.facebook.com/`;
    case 'threads':   return `https://www.threads.net/`;
    case 'pinterest': return `https://www.pinterest.com/pin-builder/`;
    default:          return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   ESCAPING
   ═══════════════════════════════════════════════════════════════ */
export function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function q(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '\\x3c');
}

/* ═══════════════════════════════════════════════════════════════
   FORMATTING
   ═══════════════════════════════════════════════════════════════ */
export function fmtNum(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

export function fmtPercent(n, digits = 1) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(digits) + '%';
}

export function fmtMoney(n) {
  const v = Number(n) || 0;
  return 'KSh ' + v.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

/* ═══════════════════════════════════════════════════════════════
   ENGAGEMENT RATE
   ═══════════════════════════════════════════════════════════════ */
export function engagementRate(stats) {
  if (!stats) return 0;
  const views = Number(stats.views) || 0;
  if (views <= 0) return 0;
  const interactions = (Number(stats.likes) || 0)
                     + (Number(stats.comments) || 0)
                     + (Number(stats.shares) || 0);
  return (interactions / views) * 100;
}

export function engagementRateFor(stats) {
  if (!stats) return 0;
  const views = Number(stats.views) || 0;
  if (views <= 0) return 0;
  const interactions =
    (Number(stats.likes) || 0) +
    (Number(stats.comments) || 0) +
    (Number(stats.shares) || 0);
  return Math.round((interactions / views) * 10000) / 100;
}

/* ═══════════════════════════════════════════════════════════════
   POST + FANOUT FACTORIES
   ═══════════════════════════════════════════════════════════════ */
export function makePost(draft = {}) {
  const now = new Date().toISOString();
  return {
    id: draft.id || ('post-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    fanoutId: draft.fanoutId || null,
    campaignId: draft.campaignId || '',
    platform: draft.platform || 'tiktok',
    pillar: draft.pillar || 'educational',
    caption: String(draft.caption || '').slice(0, (PLATFORMS[draft.platform]?.maxChars) || 2200),
    hashtags: Array.isArray(draft.hashtags) ? draft.hashtags.slice(0, 30) : [],
    imageBase64: draft.imageBase64 || null,
    imageMime: draft.imageMime || 'image/png',
    imageWidth: draft.imageWidth || null,
    imageHeight: draft.imageHeight || null,
    imagePrompt: draft.imagePrompt || null,
    imageModel: draft.imageModel || null,
    imageSeed: draft.imageSeed || null,
    imageSource: draft.imageSource || null,
    imageSourceUrl: draft.imageSourceUrl || null,
    variants: draft.variants || null,
    utm: draft.utm || {},
    url: draft.url || null,
    status: draft.status || 'draft',
    mode: draft.mode || null,
    scheduledFor: draft.scheduledFor || null,
    scheduledForUtc: draft.scheduledForUtc || null,
    publishedAt: draft.publishedAt || null,
    externalId: draft.externalId || null,
    composeUrl: draft.composeUrl || null,
    lastError: draft.lastError || null,
    stats: draft.stats || null,
    statsUpdatedAt: draft.statsUpdatedAt || null,
    statsHistory: Array.isArray(draft.statsHistory) ? draft.statsHistory : [],
    statsSource: draft.statsSource || null,
    accountHandle: draft.accountHandle || null,
    createdAt: draft.createdAt || now,
    updatedAt: now,
    createdBy: draft.createdBy || null,
  };
}

export function makeFanoutItem({ campaignId, pillar, brief, posts, createdBy, fanoutId: existingFanoutId }) {
  const fanoutId = existingFanoutId
    || ('fan-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const stamped = posts.map(p => ({ ...p, fanoutId }));
  return {
    id: fanoutId,
    campaignId,
    pillar,
    brief: brief || '',
    platforms: stamped.map(p => p.platform),
    posts: stamped,
    createdAt: new Date().toISOString(),
    createdBy: createdBy || null,
  };
}

/* ═══════════════════════════════════════════════════════════════
   UTM
   ═══════════════════════════════════════════════════════════════ */
export function buildUtmUrl(baseUrl, utm = {}) {
  if (!baseUrl) return '';
  try {
    const u = new URL(baseUrl);
    for (const k of ['source', 'medium', 'campaign', 'content', 'term']) {
      if (utm[k] && String(utm[k]).trim()) {
        u.searchParams.set('utm_' + k, String(utm[k]).trim());
      }
    }
    return u.toString();
  } catch {
    return baseUrl;
  }
}

export function utmFromPost(post) {
  const u = post && post.utm || {};
  return {
    source:   u.source   || (post && post.platform) || '',
    medium:   u.medium   || 'social',
    campaign: u.campaign || (post && post.campaignId) || '',
    content:  u.content  || (post && post.pillar)   || '',
    term:     u.term     || '',
  };
}

/* ═══════════════════════════════════════════════════════════════
   ANOMALY DETECTION
   ═══════════════════════════════════════════════════════════════ */
export function detectAnomaly(post, allPosts) {
  if (!post || !post.stats || !Array.isArray(allPosts)) return { type: null };
  const mine = engagementRate(post.stats);
  if (mine <= 0) return { type: null };

  const peers = allPosts
    .filter(p => p && p.id !== post.id && p.platform === post.platform && p.stats)
    .map(p => engagementRate(p.stats))
    .filter(v => v > 0)
    .sort((a, b) => a - b);

  if (peers.length < 5) return { type: null, reason: 'not enough peers' };

  const median = peers[Math.floor(peers.length / 2)];
  if (median <= 0) return { type: null };

  const multiple = mine / median;
  if (multiple >= 3)        return { type: 'spike', multiple, median, current: mine };
  if (multiple <= 0.5)      return { type: 'drop',  multiple, median, current: mine };
  return { type: null, multiple, median, current: mine };
}

/* ═══════════════════════════════════════════════════════════════
   BEST-TIME HEATMAP
   ═══════════════════════════════════════════════════════════════ */
export function buildTimeHeatmap(allPosts) {
  const grid = [];
  for (let d = 0; d < 7; d++) {
    grid.push(new Array(8).fill(null).map(() => ({ sum: 0, count: 0, avg: 0 })));
  }
  for (const p of allPosts || []) {
    if (!p || !p.publishedAt || !p.stats) continue;
    const dt = new Date(p.publishedAt);
    if (isNaN(dt)) continue;
    const day = dt.getDay();
    const bucket = Math.floor(dt.getHours() / 3);
    const er = engagementRate(p.stats);
    if (er <= 0) continue;
    grid[day][bucket].sum += er;
    grid[day][bucket].count++;
    grid[day][bucket].avg = grid[day][bucket].sum / grid[day][bucket].count;
  }
  return grid;
}

/* ═══════════════════════════════════════════════════════════════
   AGGREGATION
   ═══════════════════════════════════════════════════════════════ */
export function summarizeCampaign(campaign) {
  const posts = Array.isArray(campaign && campaign.posts) ? campaign.posts : [];
  const published = posts.filter(p => p && p.status === 'published');
  let views = 0, likes = 0, comments = 0, shares = 0;
  let erSum = 0, erCount = 0;

  for (const p of published) {
    if (!p.stats) continue;
    views    += Number(p.stats.views)    || 0;
    likes    += Number(p.stats.likes)    || 0;
    comments += Number(p.stats.comments) || 0;
    shares   += Number(p.stats.shares)   || 0;
    const er = engagementRate(p.stats);
    if (er > 0) { erSum += er; erCount++; }
  }

  return {
    totalPosts: posts.length,
    publishedPosts: published.length,
    draftPosts: posts.filter(p => p.status === 'draft').length,
    views, likes, comments, shares,
    engagementRate: erCount > 0 ? erSum / erCount : 0,
  };
}

export function bestPillar(allPosts) {
  if (!Array.isArray(allPosts) || allPosts.length < 20) return null;
  const byPillar = {};
  for (const p of allPosts) {
    if (!p || p.status !== 'published' || !p.stats) continue;
    const key = p.pillar || 'educational';
    if (!byPillar[key]) byPillar[key] = { sum: 0, count: 0 };
    const er = engagementRate(p.stats);
    if (er > 0) { byPillar[key].sum += er; byPillar[key].count++; }
  }
  let best = null;
  for (const [key, v] of Object.entries(byPillar)) {
    if (v.count < 2) continue;
    const avg = v.sum / v.count;
    if (!best || avg > best.avg) best = { key, avg, count: v.count };
  }
  return best;
}

/* ═══════════════════════════════════════════════════════════════
   POST LIBRARY HELPERS
   ═══════════════════════════════════════════════════════════════ */
export function groupPostsByFanout(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return [];

  const byFanout = new Map();
  const soloGroups = [];

  for (const p of posts) {
    if (!p) continue;
    const fid = p.fanoutId;
    if (fid && typeof fid === 'string') {
      if (!byFanout.has(fid)) byFanout.set(fid, []);
      byFanout.get(fid).push(p);
    } else {
      soloGroups.push([p]);
    }
  }

  const groups = [];
  for (const arr of byFanout.values()) {
    arr.sort((a, b) =>
      String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    );
    groups.push(arr);
  }
  groups.push(...soloGroups);

  groups.sort((a, b) => {
    const aLast = a[a.length - 1]?.updatedAt || a[a.length - 1]?.createdAt || '';
    const bLast = b[b.length - 1]?.updatedAt || b[b.length - 1]?.createdAt || '';
    return String(bLast).localeCompare(String(aLast));
  });

  return groups;
}

export function summarizeFanout(posts) {
  const empty = {
    heroPost: null,
    totalStats: { views: 0, likes: 0, comments: 0, shares: 0, followers: null },
    perPlatform: {},
    statusCounts: { published: 0, scheduled: 0, draft: 0, 'compose-only': 0, failed: 0, other: 0 },
    aggregateStatus: 'draft',
    platforms: [],
    firstCreatedAt: null,
    lastUpdatedAt: null,
    overallEngagementRate: 0,
  };
  if (!Array.isArray(posts) || posts.length === 0) return empty;

  const totalStats = { views: 0, likes: 0, comments: 0, shares: 0, followers: null };
  const perPlatform = {};
  const statusCounts = { published: 0, scheduled: 0, draft: 0, 'compose-only': 0, failed: 0, other: 0 };
  let heroPost = null;
  let firstCreatedAt = null;
  let lastUpdatedAt = null;
  let followerMax = null;

  for (const p of posts) {
    if (!p) continue;

    if (!heroPost && p.imageBase64) heroPost = p;

    const key = p.platform || 'unknown';
    perPlatform[key] = { post: p, stats: p.stats || null };

    if (p.stats) {
      totalStats.views    += Number(p.stats.views)    || 0;
      totalStats.likes    += Number(p.stats.likes)    || 0;
      totalStats.comments += Number(p.stats.comments) || 0;
      totalStats.shares   += Number(p.stats.shares)   || 0;
      if (p.stats.followers != null) {
        const f = Number(p.stats.followers) || 0;
        if (followerMax === null || f > followerMax) followerMax = f;
      }
    }
    totalStats.followers = followerMax;

    const st = p.status || 'draft';
    if (Object.prototype.hasOwnProperty.call(statusCounts, st)) statusCounts[st]++;
    else statusCounts.other++;

    const createdAt = p.createdAt || '';
    if (createdAt && (firstCreatedAt === null || createdAt < firstCreatedAt)) {
      firstCreatedAt = createdAt;
    }
    const updatedAt = p.updatedAt || p.publishedAt || p.createdAt || '';
    if (updatedAt && (lastUpdatedAt === null || updatedAt > lastUpdatedAt)) {
      lastUpdatedAt = updatedAt;
    }
  }

  if (!heroPost) heroPost = posts[0] || null;

  let aggregateStatus = 'published';
  if (statusCounts.failed > 0)               aggregateStatus = 'failed';
  else if (statusCounts['compose-only'] > 0) aggregateStatus = 'compose-only';
  else if (statusCounts.scheduled > 0)       aggregateStatus = 'scheduled';
  else if (statusCounts.draft > 0)           aggregateStatus = 'draft';
  else if (statusCounts.published === 0)     aggregateStatus = 'draft';

  const platformOrder = ['published', 'scheduled', 'draft', 'compose-only', 'failed'];
  const platforms = Object.keys(perPlatform).sort((a, b) => {
    const pa = perPlatform[a].post?.status || 'draft';
    const pb = perPlatform[b].post?.status || 'draft';
    return platformOrder.indexOf(pa) - platformOrder.indexOf(pb);
  });

  const interactions = totalStats.likes + totalStats.comments + totalStats.shares;
  const overallEngagementRate = totalStats.views > 0
    ? Math.round((interactions / totalStats.views) * 10000) / 100
    : 0;

  return {
    heroPost,
    totalStats,
    perPlatform,
    statusCounts,
    aggregateStatus,
    platforms,
    firstCreatedAt,
    lastUpdatedAt,
    overallEngagementRate,
  };
}

export function statsHistoryFor(post, windowMs) {
  if (!post || !Array.isArray(post.statsHistory) || post.statsHistory.length === 0) return [];
  const cutoff = Date.now() - (Number(windowMs) || 0);
  const out = [];
  for (const snap of post.statsHistory) {
    if (!snap || !snap.ts) continue;
    const t = Date.parse(snap.ts);
    if (!Number.isFinite(t)) continue;
    if (t >= cutoff) out.push(snap);
  }
  out.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return out;
}

export function combineStatsHistory(posts, windowMs) {
  if (!Array.isArray(posts) || posts.length === 0) return [];

  const cutoff = Date.now() - (Number(windowMs) || 0);
  const tsSet = new Set();
  const perPostHistories = [];

  for (const p of posts) {
    if (!p || !Array.isArray(p.statsHistory)) continue;
    const filtered = p.statsHistory.filter(s => s && s.ts && Date.parse(s.ts) >= cutoff);
    if (!filtered.length) continue;
    filtered.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    perPostHistories.push(filtered);
    for (const s of filtered) tsSet.add(s.ts);
  }

  if (!tsSet.size) return [];

  const tsList = Array.from(tsSet).sort((a, b) => Date.parse(a) - Date.parse(b));
  const out = [];
  const lastKnown = perPostHistories.map(() => ({ views: 0, likes: 0, comments: 0, shares: 0 }));

  for (const ts of tsList) {
    let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0;

    for (let i = 0; i < perPostHistories.length; i++) {
      const hist = perPostHistories[i];
      const snap = hist.find(s => s.ts === ts);
      if (snap) {
        lastKnown[i] = {
          views:    Number(snap.views)    || 0,
          likes:    Number(snap.likes)    || 0,
          comments: Number(snap.comments) || 0,
          shares:   Number(snap.shares)   || 0,
        };
      }
      totalViews    += lastKnown[i].views;
      totalLikes    += lastKnown[i].likes;
      totalComments += lastKnown[i].comments;
      totalShares   += lastKnown[i].shares;
    }

    out.push({
      ts,
      views: totalViews,
      likes: totalLikes,
      comments: totalComments,
      shares: totalShares,
    });
  }

  return out;
}

/* ═══════════════════════════════════════════════════════════════
   DATE HELPERS
   ═══════════════════════════════════════════════════════════════ */
export function toUtcIso(localDateTimeStr) {
  if (!localDateTimeStr) return null;
  const s = String(localDateTimeStr).trim();
  if (!s) return null;
  try {
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString();
  } catch (_) {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   IMAGE UPLOAD
   ═══════════════════════════════════════════════════════════════ */
export async function readImageFile(file) {
  const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
  const MAX_STORED_B64_BYTES = 1024 * 1024;
  const MAX_DIM = 1600;

  if (!file) throw new Error('No file provided');
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('Not an image file.');
  }
  if (file.type === 'image/svg+xml') {
    throw new Error('SVG uploads are not supported — use PNG or JPG.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Could not read file.'));
    r.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not decode image.'));
    i.src = dataUrl;
  });

  let { width, height } = img;
  const ratio = Math.min(1, MAX_DIM / Math.max(width, height));
  const targetW = Math.round(width * ratio);
  const targetH = Math.round(height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable in this browser.');
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const wantsPng = file.type === 'image/png' || file.type === 'image/webp';
  const outMime = wantsPng ? 'image/png' : 'image/jpeg';
  const quality = wantsPng ? undefined : 0.82;

  const outDataUrl = canvas.toDataURL(outMime, quality);
  if (!outDataUrl || !outDataUrl.includes(',')) throw new Error('Re-encode failed.');

  const b64 = outDataUrl.split(',')[1];
  if (!b64) throw new Error('Re-encode produced empty data.');
  if (b64.length > MAX_STORED_B64_BYTES) {
    throw new Error(`Image too complex to store (${(b64.length / 1024).toFixed(0)} KB encoded). Try a simpler image or fewer colours.`);
  }

  return {
    b64,
    mime: outMime,
    width: targetW,
    height: targetH,
    sizeBytes: Math.round((b64.length * 3) / 4),
  };
}
