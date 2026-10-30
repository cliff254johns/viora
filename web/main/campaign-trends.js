// main/campaign-trends.js
// ═══════════════════════════════════════════════════════════════
// Trend Radar — pulls Google Trends RSS via the worker.
// Renders a small card of trending searches with one-click
// "Use in AI brief" buttons.
// ═══════════════════════════════════════════════════════════════

let _ctx = null;
let _cache = { items: [], fetchedAt: 0, geo: '' };
const CACHE_TTL_MS = 15 * 60 * 1000;   // 15 min

export function initCampaignTrends(deps) {
  _ctx = deps || {};
}

function ctx() { return _ctx || {}; }

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Fetches the Google Trends RSS via the worker's /trends/rss endpoint.
 * The worker is expected to return the raw XML or a JSON array.
 * If neither is available, the whole card hides itself.
 */
async function fetchTrends(geo = 'KE') {
  const now = Date.now();
  if (_cache.items.length && _cache.geo === geo && (now - _cache.fetchedAt) < CACHE_TTL_MS) {
    return _cache.items;
  }

  const callFn = ctx().callFn;
  if (typeof callFn !== 'function') return [];

  try {
    // The worker can expose either:
    //   (a) GET /trends/rss?geo=KE  → raw XML
    //   (b) POST /trends/rss        → { items: [...] } JSON
    // We try POST first (matches the rest of the API surface).
    const res = await callFn('trends/rss', { geo });

    let items = [];
    if (Array.isArray(res?.items)) {
      items = res.items;
    } else if (typeof res?.xml === 'string') {
      items = parseTrendsXml(res.xml);
    } else if (typeof res === 'string') {
      items = parseTrendsXml(res);
    }

    items = items.slice(0, 12).map((it, i) => ({
      rank: i + 1,
      title: String(it.title || '').slice(0, 120),
      traffic: it.traffic || it.volume || '',
      link: it.link || '',
      pubDate: it.pubDate || '',
    }));

    _cache = { items, fetchedAt: now, geo };
    return items;
  } catch (e) {
    console.warn('[trends] fetch failed:', e.message);
    return [];
  }
}

/** Minimal RSS parser — Google Trends items have <title>, <ht:approx_traffic>, <link>. */
function parseTrendsXml(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const pick = (tag) => {
      const t = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      if (!t) return '';
      return t[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .trim();
    };
    items.push({
      title: pick('title'),
      traffic: pick('ht:approx_traffic'),
      link: pick('link'),
      pubDate: pick('pubDate'),
    });
  }
  return items;
}

export async function renderTrendRadar() {
  const host = document.getElementById('campaignTrendRadar');
  if (!host) return;

  const geo = (ctx().state?.data?.marketContent?.trendsGeo) || 'KE';

  host.innerHTML = `
    <div class="chart-box" style="border-left:4px solid var(--accent-orange, #ff9a3c);">
      <h4 style="margin:0 0 12px;">
        <i class="fa-solid fa-fire"></i> Trend Radar
        <span style="font-size:.7rem;color:var(--text-secondary);font-weight:400;margin-left:6px;">
          Google Trends · ${esc(geo)}
        </span>
      </h4>
      <div id="trendRadarBody" style="font-size:.82rem;color:var(--text-secondary);">
        <i class="fa-solid fa-spinner fa-spin"></i> Loading trending topics…
      </div>
    </div>
  `;

  const body = document.getElementById('trendRadarBody');
  if (!body) return;

  const items = await fetchTrends(geo);

  if (!items.length) {
    body.innerHTML = `
      <div style="padding:10px;font-size:.8rem;">
        Trends unavailable. Ensure <code>/trends/rss</code> is deployed on the worker.
      </div>
    `;
    return;
  }

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${items.map(t => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-input);border-radius:8px;border:1px solid var(--border-color);">
          <span style="font-family:monospace;font-size:.7rem;color:var(--accent-orange, #ff9a3c);font-weight:700;min-width:20px;">${t.rank}.</span>
          <span style="flex:1;font-size:.82rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                title="${esc(t.title)}">${esc(t.title)}</span>
          ${t.traffic ? `<span class="badge badge-purple" style="font-size:.6rem;">${esc(t.traffic)}</span>` : ''}
          <button type="button" class="btn btn-outline btn-xs"
                  data-trend-use="${esc(t.title)}"
                  title="Use in AI brief">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
          </button>
        </div>
      `).join('')}
    </div>
    <div style="text-align:right;margin-top:8px;">
      <button type="button" class="btn btn-outline btn-xs" id="trendRefreshBtn">
        <i class="fa-solid fa-rotate"></i> Refresh
      </button>
    </div>
  `;

  body.querySelectorAll('[data-trend-use]').forEach(b => {
    b.onclick = () => {
      const topic = b.getAttribute('data-trend-use');
      if (typeof ctx().openComposerWithTrend === 'function') {
        ctx().openComposerWithTrend(topic);
      } else {
        // fallback: store on state so composer picks it up on next open
        if (ctx().state) {
          ctx().state._pendingTrendTopic = topic;
        }
      }
    };
  });

  const refreshBtn = document.getElementById('trendRefreshBtn');
  if (refreshBtn) {
    refreshBtn.onclick = () => {
      _cache = { items: [], fetchedAt: 0, geo: '' };
      renderTrendRadar();
    };
  }
}
