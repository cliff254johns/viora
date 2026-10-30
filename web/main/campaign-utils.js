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
});

/* Extract the platform-tailored caption from a worker response.
   Falls back to the base text if the variant is missing.
   Worker returns: { text, hashtags, variants: { tiktok, facebook, ... } } */
export function captionForPlatform(workerResponse, platform) {
  if (!workerResponse) return '';
  const v = workerResponse.variants && workerResponse.variants[platform];
  if (v && typeof v === 'string' && v.trim()) return v.trim();
  return String(workerResponse.text || '').trim();
}

export function platformMeta(key) {
  return PLATFORMS[key] || { label: key, icon: 'fa-solid fa-globe', color: '#94a3b8', canPost: false, supportsImage: false };
}

/* ── Compose-URL builders (fallback for non-API platforms) ── */
export function composeUrlFor(platform, caption, hashtags) {
  const text = encodeURIComponent(
    [caption || '', (hashtags || []).map(h => h.startsWith('#') ? h : '#' + h).join(' ')].filter(Boolean).join('\n\n')
  );
  switch (platform) {
    case 'twitter':   return `https://twitter.com/intent/tweet?text=${text}`;
    case 'linkedin':  return `https://www.linkedin.com/feed/?shareActive=true`;
    case 'instagram': return `https://www.instagram.com/create/style/`;
    case 'youtube':   return `https://studio.youtube.com/`;
    default:          return null;
  }
}

/* ── Safe escape (HTML) ── */
export function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── Quote escape for inline onclick="fn('...')" ── */
export function q(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '\\x3c');
}

/* ── Formatting ── */
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

/* ── Engagement rate: (likes + comments + shares) / views ── */
export function engagementRate(stats) {
  if (!stats) return 0;
  const views = Number(stats.views) || 0;
  if (views <= 0) return 0;
  const interactions = (Number(stats.likes) || 0)
                     + (Number(stats.comments) || 0)
                     + (Number(stats.shares) || 0);
  return (interactions / views) * 100;
}

/* ── Post schema factory ──
   A "post" now represents a single platform execution.
   Multi-platform fanouts should use makeFanoutItem() which wraps
   N platform-posts under one creative group. */
export function makePost(draft = {}) {
  const now = new Date().toISOString();
  return {
    id: 'post-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    fanoutId: draft.fanoutId || null,
    campaignId: draft.campaignId || '',
    platform: draft.platform || 'tiktok',
    pillar: draft.pillar || 'educational',
    caption: String(draft.caption || '').slice(0, 2200),
    hashtags: Array.isArray(draft.hashtags) ? draft.hashtags.slice(0, 30) : [],
    imageBase64: draft.imageBase64 || null,
    imageMime: draft.imageMime || 'image/png',
    imageWidth: draft.imageWidth || null,
    imageHeight: draft.imageHeight || null,
    imagePrompt: draft.imagePrompt || null,
    imageModel: draft.imageModel || null,
    imageSeed: draft.imageSeed || null,
    imageSourceUrl: draft.imageSourceUrl || null,
    variants: draft.variants || null,
    utm: draft.utm || {},
    url: draft.url || null,
    status: draft.status || 'draft',      // draft | scheduled | published | failed | compose-only
    mode: draft.mode || null,             // 'auto' | 'compose-link'
    scheduledFor: draft.scheduledFor || null,
    publishedAt: draft.publishedAt || null,
    externalId: draft.externalId || null,
    composeUrl: draft.composeUrl || null,
    lastError: draft.lastError || null,
    stats: draft.stats || null,
    statsUpdatedAt: draft.statsUpdatedAt || null,
    accountHandle: draft.accountHandle || null,
    createdAt: now,
    updatedAt: now,
    createdBy: draft.createdBy || null,
  };
}

/* Wrap N platform-posts under one creative group */
export function makeFanoutItem({ campaignId, pillar, brief, posts, createdBy }) {
  const fanoutId = 'fan-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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

/* ── UTM builder ── */
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

/* ── Anomaly detection ──
   Compares a post's engagement rate against the median of all
   recent posts for the SAME platform.
   Returns:
     { type: 'spike' | 'drop' | null, multiple: number, median: number, current: number }
*/
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

/* ── Best-time-to-post heatmap ──
   Aggregates engagement by (day-of-week × 3-hour-bucket).
   Returns a 7×8 array of {sum, count, avg} cells.
*/
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
    const bucket = Math.floor(dt.getHours() / 3);   // 0..7
    const er = engagementRate(p.stats);
    if (er <= 0) continue;
    grid[day][bucket].sum += er;
    grid[day][bucket].count++;
    grid[day][bucket].avg = grid[day][bucket].sum / grid[day][bucket].count;
  }
  return grid;
}

/* ── Aggregate stats for a campaign (used by KPI strip) ── */
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

/* ── Best pillar (needs ≥20 published posts to be meaningful) ── */
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
