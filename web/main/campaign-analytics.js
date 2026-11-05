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

  /* Each block runs independently so one failure can't hide the rest */
  try { _renderCharts(published); } catch (e) { console.error('[analytics] _renderCharts failed:', e); }
  try { _renderHeatmap(published); } catch (e) { console.error('[analytics] _renderHeatmap failed:', e); }
  try { _renderCompetitors(); } catch (e) { console.error('[analytics] _renderCompetitors failed:', e); }

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
            <strong>SPIKE</strong> — ${esc(a.post.campaignName || '')}
            <span style="color:var(--text-secondary);">· ${(a.multiple).toFixed(1)}× median ER (${a.current.toFixed(2)}% vs ${a.median.toFixed(2)}%)</span>
          </div>
        `).join('')}
        ${drops.map(a => `
          <div style="padding:8px 12px;background:rgba(255,92,124,.1);border-left:3px solid var(--accent-red);border-radius:6px;font-size:.8rem;">
            <strong>DROP</strong> — ${esc(a.post.campaignName || '')}
            <span style="color:var(--text-secondary);">· ${(a.multiple).toFixed(2)}× median ER (${a.current.toFixed(2)}% vs ${a.median.toFixed(2)}%)</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   CHARTS
   Each chart wrapped individually so one bad chart cannot block
   the others. If a chart has no data, show a message instead of
   an empty white canvas.
   ═══════════════════════════════════════════════════════════════ */
function _renderCharts(published) {
  if (typeof Chart === 'undefined') {
    console.warn('[analytics] Chart.js not loaded');
    return;
  }
  const tc = _textColor();

  _renderViewsChart(published, tc);
  _renderEngagementChart(published, tc);
  _renderTopPostsChart(published, tc);
  _renderFollowersChart(tc);
}

/* ── Chart 1: Views & Engagement over time ── */
function _renderViewsChart(published, tc) {
  const byMonth = {};
  for (const p of published) {
    if (!p.publishedAt || !p.stats) continue;
    const k = p.publishedAt.slice(0, 7);
    if (!byMonth[k]) byMonth[k] = { views: 0, likes: 0, comments: 0 };
    byMonth[k].views    += Number(p.stats.views)    || 0;
    byMonth[k].likes    += Number(p.stats.likes)    || 0;
    byMonth[k].comments += Number(p.stats.comments) || 0;
  }
  const months = Object.keys(byMonth).sort();

  _destroy('caViewsChart');
  const c1 = _canvas('caViewsChart');
  if (!c1) return;

  if (!months.length) {
    _emptyChart(c1, 'fa-chart-line', 'No views data yet',
      'Publish a post and let the stats cron run — this chart fills in within minutes.');
    return;
  }

  _charts['caViewsChart'] = new Chart(c1, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label: 'Views',    data: months.map(m => byMonth[m].views),    borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.15)', borderWidth: 2, tension: 0.3, fill: true },
        { label: 'Likes',    data: months.map(m => byMonth[m].likes),    borderColor: '#ff5c7c', borderWidth: 2, tension: 0.3 },
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

/* ── Chart 2: Engagement rate per platform ── */
function _renderEngagementChart(published, tc) {
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
  if (!c2) return;

  if (!platKeys.length) {
    _emptyChart(c2, 'fa-heart', 'No engagement data yet',
      'Engagement rate appears once you have published posts with views + likes.');
    return;
  }

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

/* ── Chart 3: Top 10 posts by engagement ── */
function _renderTopPostsChart(published, tc) {
  const top10 = published
    .map(p => ({ p, er: engagementRate(p.stats) }))
    .filter(x => x.er > 0)
    .sort((a, b) => b.er - a.er)
    .slice(0, 10);

  _destroy('caTopPostsChart');
  const c3 = _canvas('caTopPostsChart');
  if (!c3) return;

  if (!top10.length) {
    _emptyChart(c3, 'fa-trophy', 'No ranked posts yet',
      'Top posts appear here once you have multiple published posts with stats.');
    return;
  }

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

/* ── Chart 4: Followers over time ── */
function _renderFollowersChart(tc) {
  const accounts = (ctx().state?.data?.socialAccounts) || [];

  const allSnapshots = [];
  for (const acc of accounts) {
    if (!acc || !Array.isArray(acc.followersHistory)) continue;
    for (const snap of acc.followersHistory) {
      if (!snap || !snap.ts) continue;
      allSnapshots.push({
        ts: snap.ts,
        followers: Number(snap.followers) || 0,
        platform: acc.platform,
      });
    }
  }

  const byDay = {};
  for (const s of allSnapshots) {
    const day = s.ts.slice(0, 10);
    if (!byDay[day]) byDay[day] = {};
    byDay[day][s.platform] = s.followers;
  }

  const days = Object.keys(byDay).sort();
  const platforms = Array.from(new Set(allSnapshots.map(s => s.platform)));

  const lastKnown = {};
  const totalsByDay = days.map(day => {
    let total = 0;
    for (const p of platforms) {
      if (byDay[day][p] != null) lastKnown[p] = byDay[day][p];
      total += lastKnown[p] || 0;
    }
    return total;
  });

  _destroy('caFollowersChart');
  const c4 = _canvas('caFollowersChart');
  if (!c4) return;

  if (days.length >= 2) {
    _charts['caFollowersChart'] = new Chart(c4, {
      type: 'line',
      data: {
        labels: days,
        datasets: [{
          label: 'Total followers',
          data: totalsByDay,
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168,85,247,0.15)',
          borderWidth: 2, tension: 0.3, fill: true,
          pointRadius: 3, pointHoverRadius: 5,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: tc, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              title: (items) => items[0]?.label || '',
              label: (ctx2) => `Followers: ${Number(ctx2.raw).toLocaleString()}`,
            },
          },
        },
        scales: {
          y: { beginAtZero: false, ticks: { color: tc, callback: v => fmtNum(v) }, grid: { color: 'rgba(148,163,184,0.15)' } },
          x: { ticks: { color: tc, maxRotation: 45 }, grid: { display: false } },
        },
      },
    });
    return;
  }

  /* No history — show current total as a single point, or a friendly empty */
  const totalNow = accounts.reduce((sum, a) => {
    const fc =
      a.followers        != null ? Number(a.followers) :
      a.stats?.followers != null ? Number(a.stats.followers) :
      a.followersCache   != null ? Number(a.followersCache) :
      0;
    return sum + fc;
  }, 0);

  if (totalNow > 0) {
    _charts['caFollowersChart'] = new Chart(c4, {
      type: 'line',
      data: {
        labels: [new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })],
        datasets: [{
          label: 'Current followers',
          data: [totalNow],
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168,85,247,0.3)',
          borderWidth: 2,
          pointRadius: 8, pointHoverRadius: 10,
          showLine: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: tc, font: { size: 10 } } },
          tooltip: { callbacks: { label: (ctx2) => `Total: ${Number(ctx2.raw).toLocaleString()}` } },
        },
        scales: {
          y: {
            beginAtZero: false,
            suggestedMin: Math.max(0, totalNow - Math.max(10, totalNow * 0.2)),
            suggestedMax: totalNow + Math.max(10, totalNow * 0.2),
            ticks: { color: tc, callback: v => fmtNum(v) },
            grid: { color: 'rgba(148,163,184,0.15)' },
          },
          x: { ticks: { color: tc }, grid: { display: false } },
        },
      },
    });
    return;
  }

  _emptyChart(c4, 'fa-users', 'No follower history yet',
    'Verify a social account from Social accounts to start tracking follower growth.');
}

/* ── Shared empty-chart helper ── */
function _emptyChart(canvas, icon, title, body) {
  const parent = canvas.parentElement;
  if (!parent) return;
  parent.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--muted);text-align:center;padding:16px;">
      <i class="fa-solid ${icon}" style="font-size:2rem;opacity:.35;margin-bottom:10px;"></i>
      <div style="font-weight:800;margin-bottom:4px;color:var(--text-primary);">${title}</div>
      <div style="font-size:.8rem;">${body}</div>
      <button type="button" class="btn soft btn-sm" style="margin-top:12px;"
              onclick="window.Orbit && window.Orbit.navigate && window.Orbit.navigate('accounts')">
        Go to Social accounts →
      </button>
    </div>
  `;
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
    host.innerHTML = '<div class="empty-state" style="padding:20px;">Publish posts with stats to see the best-time heatmap.</div>';
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
function _competitorsAsArray() {
  const raw = ctx().state?.data?.competitorBenchmarks;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return Object.entries(raw).map(([id, v]) => ({ id, ...(v || {}) }));
}

function _renderCompetitors() {
  const host = document.getElementById('caCompetitors');
  if (!host) return;

  const competitors = _competitorsAsArray();

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

      const hasStats = c.stats && typeof c.stats === 'object' && (
        c.stats.followers != null ||
        c.stats.views != null ||
        c.stats.engagementRate != null
      );

      let statsLine;
      if (hasStats) {
        const parts = [];
        if (c.stats.followers != null) parts.push(fmtNum(c.stats.followers) + ' followers');
        if (c.stats.views != null) parts.push(fmtNum(c.stats.views) + ' views');
        if (c.stats.engagementRate != null) parts.push(fmtPercent(c.stats.engagementRate, 2) + ' ER');
        statsLine = parts.join(' · ');
      } else if (c.stats && c.stats.error) {
        statsLine = '<em style="color:var(--accent-gold);">⚠ ' + esc(String(c.stats.error).slice(0, 100)) + '</em>';
      } else if (c.lastError) {
        statsLine = '<em style="color:var(--accent-gold);">⚠ ' + esc(String(c.lastError).slice(0, 100)) + '</em>';
      } else {
        const unsupported = ['tiktok', 'facebook', 'instagram'].includes(c.platform);
        statsLine = unsupported
          ? '<em style="color:var(--text-light);">Auto-fetch not supported for ' + esc(pm.label) + '</em>'
          : '<em style="color:var(--text-light);">Not fetched yet — click Refresh</em>';
      }

      return (
        '<div style="display:flex;gap:10px;align-items:center;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;">' +
          '<div style="width:32px;height:32px;border-radius:8px;background:' + pm.color + '22;color:' + pm.color + ';display:flex;align-items:center;justify-content:center;">' +
            '<i class="' + pm.icon + '"></i>' +
          '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:.85rem;font-weight:600;">' + esc(c.handle || '') + '</div>' +
            '<div style="font-size:.7rem;color:var(--text-secondary);">' +
              esc(pm.label) + ' · ' + statsLine +
            '</div>' +
          '</div>' +
          '<button type="button" class="btn btn-outline btn-xs" data-comp-refresh="' + esc(c.id) + '" title="Refresh"><i class="fa-solid fa-rotate"></i></button>' +
          '<button type="button" class="btn btn-danger btn-xs" data-comp-remove="' + esc(c.id) + '" title="Remove"><i class="fa-solid fa-trash"></i></button>' +
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
        const db = ctx().db, ref = ctx().ref, remove = ctx().remove, P = ctx().P;
        if (!db || !ref || !remove || !P) throw new Error('Firebase not wired');
        await remove(ref(db, P('competitorBenchmarks/' + id)));

        /* Update local state — drop just this one */
        const raw = ctx().state?.data?.competitorBenchmarks;
        if (Array.isArray(raw)) {
          ctx().state.data.competitorBenchmarks = raw.filter(x => x.id !== id);
        } else if (raw && typeof raw === 'object') {
          const next = { ...raw };
          delete next[id];
          ctx().state.data.competitorBenchmarks = next;
        }
        _renderCompetitors();
        ctx().toast?.('Competitor removed.', 'success');
      } catch (e) {
        console.error('[analytics] competitor remove failed:', e);
        ctx().toast?.('Remove failed: ' + (e.message || 'unknown'), 'error');
      }
    });
  });
}

function _openAddCompetitor() {
  const platform = prompt('Platform (facebook, tiktok, instagram, youtube)?', 'youtube');
  if (!platform) return;
  const handle = prompt('Competitor handle (e.g. @viora)', '');
  if (!handle) return;

  const id = 'comp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const entry = {
    id,
    platform: platform.toLowerCase().trim(),
    handle: handle.trim().replace(/^@/, ''),
    stats: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  (async () => {
    try {
      const db = ctx().db, ref = ctx().ref, update = ctx().update, P = ctx().P;
      if (!db || !ref || !update || !P) throw new Error('Firebase update not wired');

      /* update() adds ONE key and leaves all others intact */
      await update(ref(db, P('competitorBenchmarks')), { [id]: entry });

      /* Merge into local state */
      const raw = ctx().state?.data?.competitorBenchmarks;
      if (Array.isArray(raw)) {
        ctx().state.data.competitorBenchmarks = [...raw, entry];
      } else {
        ctx().state.data.competitorBenchmarks = { ...(raw || {}), [id]: entry };
      }

      _renderCompetitors();
      _refreshCompetitor(id);
      ctx().toast?.('Competitor added.', 'success');
    } catch (e) {
      console.error('[analytics] competitor add failed:', e);
      ctx().toast?.('Add failed: ' + (e.message || 'unknown'), 'error');
    }
  })();
}

async function _refreshCompetitor(id) {
  const list = _competitorsAsArray();
  const entry = list.find(x => x.id === id);
  if (!entry) return;

  try {
    const callFn = ctx().callFn;
    if (typeof callFn !== 'function') throw new Error('callFn not wired');

    const res = await callFn('competitor/stats', {
      platform: entry.platform,
      handle: entry.handle,
    });

    let nextEntry;

    if (!res || res.ok === false) {
      ctx().toast?.(
        (res?.error || 'Competitor stats unavailable for this platform.'),
        'warning'
      );
      nextEntry = {
        ...entry,
        stats: res || { error: 'unknown' },
        lastAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } else {
      const { ok, ...cleanStats } = res;
      if (cleanStats.engagementRate == null &&
          Number(cleanStats.views) > 0 &&
          (cleanStats.likes != null || cleanStats.comments != null || cleanStats.shares != null)) {
        const interactions =
          (Number(cleanStats.likes) || 0) +
          (Number(cleanStats.comments) || 0) +
          (Number(cleanStats.shares) || 0);
        cleanStats.engagementRate =
          Math.round((interactions / Number(cleanStats.views)) * 10000) / 100;
      }
      nextEntry = {
        ...entry,
        stats: cleanStats,
        updatedAt: new Date().toISOString(),
        lastError: null,
        lastAttemptAt: new Date().toISOString(),
      };
    }

    /* update() writes only this one key — never touches others */
    const db = ctx().db, ref = ctx().ref, update = ctx().update, P = ctx().P;
    if (!db || !ref || !update || !P) throw new Error('Firebase update not wired');
    await update(ref(db, P('competitorBenchmarks')), { [id]: nextEntry });

    /* Merge into local state */
    const raw = ctx().state?.data?.competitorBenchmarks;
    if (Array.isArray(raw)) {
      ctx().state.data.competitorBenchmarks = raw.map(x => x.id === id ? nextEntry : x);
    } else {
      ctx().state.data.competitorBenchmarks = { ...(raw || {}), [id]: nextEntry };
    }

    _renderCompetitors();
    if (res && res.ok !== false) {
      ctx().toast?.('Competitor stats refreshed.', 'success');
    }
  } catch (e) {
    console.error('[analytics] competitor refresh failed:', e);
    ctx().toast?.('Refresh failed: ' + (e.message || 'unknown'), 'error');
  }
}
