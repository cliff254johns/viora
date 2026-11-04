// main/campaign-analytics.js
// ═══════════════════════════════════════════════════════════════
// Campaign performance dashboard.
// Charts: Views over time, Engagement comparison, Followers,
// Top posts, Best-time heatmap, Competitor benchmarks.
// ═══════════════════════════════════════════════════════════════
import {
  engagementRate, fmtNum, fmtPercent, escHtml as esc,
  detectAnomaly, buildTimeHeatmap, PLATFORMS, platformMeta,
} from './campaign-utils.js';

let _ctx = null;

const _charts = {};

export function initCampaignAnalytics(deps) {
  _ctx = deps || {};
  Object.keys(_charts).forEach(k => { try { _charts[k]?.destroy(); } catch (_) {} delete _charts[k]; });
}

function ctx() { return _ctx || {}; }

function _destroy(id) {
  if (_charts[id]) { try { _charts[id].destroy(); } catch (_) {} delete _charts[id]; }
}

function _canvas(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  return el;
}

function _textColor() {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() || '#94a3b8';
  } catch { return '#94a3b8'; }
}

/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD RENDER
   ═══════════════════════════════════════════════════════════════ */
export function renderAnalyticsDashboard() {
  const host = document.getElementById('campaignAnalyticsDashboard');
  if (!host) return;

  const campaigns = (ctx().state?.data?.campaigns) || [];
  const allPosts = [];
  for (const cc of campaigns) {
    for (const p of (cc.posts || [])) {
      if (p) allPosts.push({ ...p, campaignName: cc.name });
    }
  }

  const published = allPosts.filter(p => p.status === 'published' && p.stats);
  const anomalies = [];

  for (const p of published) {
    const a = detectAnomaly(p, published);
    if (a.type === 'spike' || a.type === 'drop') {
      anomalies.push({ post: p, ...a });
    }
  }

  host.innerHTML = `
    ${anomalies.length ? _renderAnomalyPanel(anomalies) : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
      <div class="chart-box"><h4><i class="fa-solid fa-chart-line"></i> Views & Engagement (30d)</h4><div style="height:260px;"><canvas id="caViewsChart"></canvas></div></div>
      <div class="chart-box"><h4><i class="fa-solid fa-heart"></i> Engagement Rate per Platform</h4><div style="height:260px;"><canvas id="caEngagementChart"></canvas></div></div>
      <div class="chart-box"><h4><i class="fa-solid fa-trophy"></i> Top 10 Posts by Engagement</h4><div style="height:260px;"><canvas id="caTopPostsChart"></canvas></div></div>
      <div class="chart-box"><h4><i class="fa-solid fa-users"></i> Followers Over Time</h4><div style="height:260px;"><canvas id="caFollowersChart"></canvas></div></div>
    </div>

    <div class="chart-box" style="margin-top:16px;">
      <h4><i class="fa-solid fa-clock"></i> Best Time to Post (Median Engagement Rate)</h4>
      <div id="caHeatmap"></div>
    </div>

    <div class="chart-box" style="margin-top:16px;">
      <h4>
        <i class="fa-solid fa-users-viewfinder"></i> Competitor Benchmarks
        <button type="button" class="btn btn-outline btn-sm" id="caAddCompetitorBtn" style="float:right;">
          <i class="fa-solid fa-plus"></i> Add Competitor
        </button>
      </h4>
      <div id="caCompetitors"></div>
    </div>
  `;

  _renderCharts(published);
  _renderHeatmap(published);
  _renderCompetitors();

  document.getElementById('caAddCompetitorBtn')?.addEventListener('click', _openAddCompetitor);
}

/* ═══════════════════════════════════════════════════════════════
   ANOMALY PANEL
   ═══════════════════════════════════════════════════════════════ */
function _renderAnomalyPanel(anomalies) {
  const spikes = anomalies.filter(a => a.type === 'spike');
  const drops = anomalies.filter(a => a.type === 'drop');
  return `
    <div class="chart-box" style="border-left:4px solid ${spikes.length ? 'var(--accent-green)' : 'var(--accent-red)'};">
      <h4><i class="fa-solid fa-triangle-exclamation"></i> Performance Anomalies (${anomalies.length})</h4>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">
        ${spikes.map(a => `
          <div style="padding:8px 12px;background:rgba(34,230,160,.1);border-left:3px solid var(--accent-green);border-radius:6px;font-size:.8rem;">
            <strong>🚀 SPIKE</strong> — ${esc(a.post.campaignName || '')}
            <span style="color:var(--text-secondary);">· ${(a.multiple).toFixed(1)}× median ER (${a.current.toFixed(2)}% vs ${a.median.toFixed(2)}%)</span>
          </div>
        `).join('')}
        ${drops.map(a => `
          <div style="padding:8px 12px;background:rgba(255,92,124,.1);border-left:3px solid var(--accent-red);border-radius:6px;font-size:.8rem;">
            <strong>📉 DROP</strong> — ${esc(a.post.campaignName || '')}
            <span style="color:var(--text-secondary);">· ${(a.multiple).toFixed(2)}× median ER (${a.current.toFixed(2)}% vs ${a.median.toFixed(2)}%)</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   CHARTS
   ═══════════════════════════════════════════════════════════════ */
function _renderCharts(published) {
  if (typeof Chart === 'undefined') return;
  const tc = _textColor();

  // Group by month for views
  const byMonth = {};
  const followersByMonth = {};
  for (const p of published) {
    if (!p.publishedAt || !p.stats) continue;
    const k = p.publishedAt.slice(0, 7);
    byMonth[k] = byMonth[k] || { views: 0, likes: 0, comments: 0 };
    byMonth[k].views    += Number(p.stats.views) || 0;
    byMonth[k].likes    += Number(p.stats.likes) || 0;
    byMonth[k].comments += Number(p.stats.comments) || 0;
    if (p.stats.followers != null) {
      followersByMonth[k] = Math.max(followersByMonth[k] || 0, Number(p.stats.followers) || 0);
    }
  }
  const months = Object.keys(byMonth).sort();

  _destroy('caViewsChart');
  const c1 = _canvas('caViewsChart');
  if (c1 && months.length) {
    _charts['caViewsChart'] = new Chart(c1, {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          { label: 'Views', data: months.map(m => byMonth[m].views), borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.15)', borderWidth: 2, tension: 0.3, fill: true },
          { label: 'Likes', data: months.map(m => byMonth[m].likes), borderColor: '#ff5c7c', borderWidth: 2, tension: 0.3 },
          { label: 'Comments', data: months.map(m => byMonth[m].comments), borderColor: '#22e6a0', borderWidth: 2, tension: 0.3 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: tc, font: { size: 10 } } } },
        scales: {
          y: { beginAtZero: true, ticks: { color: tc, callback: v => fmtNum(v) }, grid: { color: 'rgba(148,163,184,0.15)' } },
          x: { ticks: { color: tc }, grid: { display: false } },
        },
      },
    });
  }

  // Engagement rate per platform (bar)
  const byPlatform = {};
  for (const p of published) {
    if (!p.stats) continue;
    const er = engagementRate(p.stats);
    if (er <= 0) continue;
    const k = p.platform || 'unknown';
    byPlatform[k] = byPlatform[k] || { sum: 0, count: 0 };
    byPlatform[k].sum += er;
    byPlatform[k].count++;
  }
  const platKeys = Object.keys(byPlatform);

  _destroy('caEngagementChart');
  const c2 = _canvas('caEngagementChart');
  if (c2 && platKeys.length) {
    _charts['caEngagementChart'] = new Chart(c2, {
      type: 'bar',
      data: {
        labels: platKeys.map(k => platformMeta(k).label),
        datasets: [{
          label: 'Avg engagement rate',
          data: platKeys.map(k => +(byPlatform[k].sum / byPlatform[k].count).toFixed(2)),
          backgroundColor: platKeys.map(k => platformMeta(k).color + 'cc'),
          borderColor: platKeys.map(k => platformMeta(k).color),
          borderWidth: 1, borderRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { color: tc, callback: v => v + '%' }, grid: { color: 'rgba(148,163,184,0.15)' } },
          x: { ticks: { color: tc }, grid: { display: false } },
        },
      },
    });
  }

  // Top 10 posts
  const top10 = published
    .map(p => ({ p, er: engagementRate(p.stats) }))
    .filter(x => x.er > 0)
    .sort((a, b) => b.er - a.er)
    .slice(0, 10);

  _destroy('caTopPostsChart');
  const c3 = _canvas('caTopPostsChart');
  if (c3 && top10.length) {
    _charts['caTopPostsChart'] = new Chart(c3, {
      type: 'bar',
      data: {
        labels: top10.map(x => (x.p.caption || '').slice(0, 30) || 'Untitled'),
        datasets: [{
          label: 'Engagement rate %',
          data: top10.map(x => +x.er.toFixed(2)),
          backgroundColor: top10.map(x => platformMeta(x.p.platform).color + 'cc'),
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { color: tc, callback: v => v + '%' }, grid: { color: 'rgba(148,163,184,0.15)' } },
          y: { ticks: { color: tc, font: { size: 9 } }, grid: { display: false } },
        },
      },
    });
  }

  // Followers over time
  const fMonths = Object.keys(followersByMonth).sort();
  _destroy('caFollowersChart');
  const c4 = _canvas('caFollowersChart');
  if (c4 && fMonths.length) {
    _charts['caFollowersChart'] = new Chart(c4, {
      type: 'line',
      data: {
        labels: fMonths,
        datasets: [{
          label: 'Followers',
          data: fMonths.map(m => followersByMonth[m]),
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168,85,247,0.15)',
          borderWidth: 2, tension: 0.3, fill: true,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: tc, font: { size: 10 } } } },
        scales: {
          y: { beginAtZero: true, ticks: { color: tc, callback: v => fmtNum(v) }, grid: { color: 'rgba(148,163,184,0.15)' } },
          x: { ticks: { color: tc }, grid: { display: false } },
        },
      },
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   HEATMAP
   ═══════════════════════════════════════════════════════════════ */
function _renderHeatmap(published) {
  const host = document.getElementById('caHeatmap');
  if (!host) return;

  const grid = buildTimeHeatmap(published);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const bucketNames = ['0-3', '3-6', '6-9', '9-12', '12-15', '15-18', '18-21', '21-24'];

  let maxAvg = 0;
  for (const row of grid) for (const cell of row) if (cell.avg > maxAvg) maxAvg = cell.avg;

  if (maxAvg === 0) {
    host.innerHTML = '<div class="empty-state" style="padding:20px;">Post stats needed to build the heatmap.</div>';
    return;
  }

  host.innerHTML = `
    <div style="overflow-x:auto;">
      <table style="border-collapse:collapse;font-size:.7rem;width:100%;">
        <thead>
          <tr>
            <th style="padding:4px;color:var(--text-secondary);"></th>
            ${bucketNames.map(b => `<th style="padding:4px;color:var(--text-secondary);font-weight:600;">${b}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${grid.map((row, di) => `
            <tr>
              <td style="padding:4px;color:var(--text-secondary);font-weight:600;">${dayNames[di]}</td>
              ${row.map(cell => {
                const intensity = maxAvg > 0 ? cell.avg / maxAvg : 0;
                const bg = intensity === 0
                  ? 'var(--bg-input)'
                  : `rgba(0,212,255,${(0.15 + intensity * 0.75).toFixed(2)})`;
                const color = intensity > 0.5 ? '#fff' : 'var(--text-primary)';
                return `<td style="padding:6px;text-align:center;background:${bg};color:${color};border-radius:4px;font-size:.68rem;min-width:40px;" title="Avg ER: ${cell.avg.toFixed(2)}%">
                  ${cell.avg ? cell.avg.toFixed(1) : '·'}
                </td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="font-size:.7rem;color:var(--text-secondary);margin-top:6px;">
      Numbers = average engagement rate. Darker blue = better time to post.
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   COMPETITORS
   ═══════════════════════════════════════════════════════════════ */
function _renderCompetitors() {
  const host = document.getElementById('caCompetitors');
  if (!host) return;

  let competitors = (ctx().state?.data?.competitorBenchmarks) || [];

  // Firebase stores this node as an object { id: { ...fields } }, not an array.
  // Normalize so .map / .filter / .length work below.
  if (!Array.isArray(competitors)) {
    competitors = Object.entries(competitors).map(([id, v]) => ({ id, ...(v || {}) }));
  }

  if (!competitors.length) {
    host.innerHTML =
      '<div class="empty-state" style="padding:20px;font-size:.82rem;">' +
      'No competitors tracked yet. Click "Add Competitor" to start benchmarking.' +
      '</div>';
    return;
  }

  host.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:6px;">' +
    competitors.map((c) => {
      const pm = platformMeta(c.platform);
      const followers = fmtNum((c.stats && c.stats.followers) || 0);
      const er = fmtPercent((c.stats && c.stats.engagementRate) || 0, 2);
      return (
        '<div style="display:flex;gap:10px;align-items:center;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;">' +
          '<div style="width:32px;height:32px;border-radius:8px;background:' + pm.color + '22;color:' + pm.color + ';display:flex;align-items:center;justify-content:center;">' +
            '<i class="' + pm.icon + '"></i>' +
          '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:.85rem;font-weight:600;">' + esc(c.handle || '') + '</div>' +
            '<div style="font-size:.7rem;color:var(--text-secondary);">' +
              esc(pm.label) + ' · Followers: ' + followers + ' · ER: ' + er +
            '</div>' +
          '</div>' +
          '<button type="button" class="btn btn-outline btn-xs" data-comp-refresh="' + esc(c.id) + '"><i class="fa-solid fa-rotate"></i></button>' +
          '<button type="button" class="btn btn-danger btn-xs" data-comp-remove="' + esc(c.id) + '"><i class="fa-solid fa-trash"></i></button>' +
        '</div>'
      );
    }).join('') +
    '</div>';

  host.querySelectorAll('[data-comp-refresh]').forEach((b) => {
    b.addEventListener('click', () => _refreshCompetitor(b.getAttribute('data-comp-refresh')));
  });

  host.querySelectorAll('[data-comp-remove]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('Remove this competitor?')) return;
      const id = b.getAttribute('data-comp-remove');
      try {
        await ctx().remove(ctx().ref(ctx().db, ctx().P('competitorBenchmarks/' + id)));
        const list = (ctx().state?.data?.competitorBenchmarks || []).filter((x) => x.id !== id);
        ctx().state.data.competitorBenchmarks = list;
        _renderCompetitors();
      } catch (e) {
        ctx().toast?.('Remove failed: ' + e.message, 'error');
      }
    });
  });
}

function _openAddCompetitor() {
  const platform = prompt('Platform (facebook, tiktok, instagram, youtube)?', 'tiktok');
  if (!platform) return;
  const handle = prompt('Competitor handle (e.g. @viora)', '');
  if (!handle) return;

  const entry = {
    id: 'comp-' + Date.now().toString(36),
    platform: platform.toLowerCase().trim(),
    handle: handle.trim(),
    stats: null,
    updatedAt: null,
  };

  (async () => {
    try {
      const list = (ctx().state?.data?.competitorBenchmarks || []).concat([entry]);
      await ctx().set(ctx().ref(ctx().db, ctx().P('competitorBenchmarks')), list);
      ctx().state.data.competitorBenchmarks = list;
      _renderCompetitors();
      _refreshCompetitor(entry.id);
    } catch (e) { ctx().toast?.('Add failed: ' + e.message, 'error'); }
  })();
}

async function _refreshCompetitor(id) {
  const list = (ctx().state?.data?.competitorBenchmarks || []);
  const entry = list.find(x => x.id === id);
  if (!entry) return;

  try {
    const callFn = ctx().callFn;
    const res = await callFn('competitor/stats', { platform: entry.platform, handle: entry.handle });
    const next = list.map(x => x.id === id
      ? { ...x, stats: res, updatedAt: new Date().toISOString() }
      : x
    );
    await ctx().set(ctx().ref(ctx().db, ctx().P('competitorBenchmarks')), next);
    ctx().state.data.competitorBenchmarks = next;
    _renderCompetitors();
    ctx().toast?.('Competitor stats refreshed.', 'success');
  } catch (e) {
    ctx().toast?.('Refresh failed: ' + (e.message || 'unknown'), 'error');
  }
}
