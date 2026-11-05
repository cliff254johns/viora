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

  /* ═══════════════════════════════════════════════════════════════
     Followers Over Time — CORRECTED
     ─────────────────────────────────────────────────────────────
     Reads followersHistory[] from each social account, merges
     all account histories into a single timeline, sums followers
     per timestamp.

     Falls back to plotting the current `followers` value as a
     single-point line if no history exists yet (so the chart
     shows SOMETHING instead of being empty).
     ═══════════════════════════════════════════════════════════════ */

  const accounts = (ctx().state?.data?.socialAccounts) || [];

  /* Build a merged timeline of {ts, followers} across all accounts */
  const allSnapshots = [];
  for (const acc of accounts) {
    if (!acc || !Array.isArray(acc.followersHistory)) continue;
    for (const snap of acc.followersHistory) {
      if (!snap || !snap.ts) continue;
      allSnapshots.push({
        ts: snap.ts,
        followers: Number(snap.followers) || 0,
        platform: acc.platform,
        handle: acc.handle,
      });
    }
  }

  /* Group by day (YYYY-MM-DD) to build a smooth daily line.
     Sum followers across platforms for each day. */
  const byDay = {};
  for (const s of allSnapshots) {
    const day = s.ts.slice(0, 10);  // "2026-11-04"
    if (!byDay[day]) byDay[day] = {};
    /* Same platform: last value wins (most recent snapshot of the day) */
    byDay[day][s.platform] = s.followers;
  }

  const days = Object.keys(byDay).sort();
  const platforms = Array.from(new Set(allSnapshots.map(s => s.platform)));

  /* Forward-fill each platform's last known value across missing days */
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

  if (c4 && days.length >= 2) {
    /* We have history — plot the timeline */
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
  } else if (c4) {
    /* No history — show current total as a single point with a label */
    const totalNow = accounts.reduce((sum, a) => {
      const fc =
        a.followers        != null ? Number(a.followers) :
        a.stats?.followers != null ? Number(a.stats.followers) :
        a.followersCache   != null ? Number(a.followersCache) :
        0;
      return sum + fc;
    }, 0);

    if (totalNow > 0) {
      /* Show a single-point line so the axis renders properly */
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
            tooltip: {
              callbacks: {
                label: (ctx2) => `Total: ${Number(ctx2.raw).toLocaleString()}`,
              },
            },
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
    } else {
      /* Truly empty — draw an empty chart with a helpful message */
      c4.parentElement.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--muted);text-align:center;padding:16px;">
          <i class="fa-solid fa-chart-line" style="font-size:2rem;opacity:.35;margin-bottom:10px;"></i>
          <div style="font-weight:800;margin-bottom:4px;">No follower history yet</div>
          <div style="font-size:.8rem;">Verify a social account to start tracking follower growth</div>
          <button class="btn soft btn-sm" style="margin-top:12px;" onclick="window.Orbit && window.Orbit.navigate && window.Orbit.navigate('accounts')">
            Go to Social accounts →
          </button>
    </div>`;
    }
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

      /* Determine what we actually know about this competitor.
         Three possible states:
           1. Real stats → show followers, views, ER
           2. Fetch error → show the error, don't show zeros
           3. Never fetched → prompt to click Refresh */
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
      } else if (c.lastError) {
        /* Recent fetch attempt failed — show why */
        statsLine =
          '<em style="color:var(--accent-gold);">⚠ ' +
          esc(String(c.lastError).slice(0, 100)) +
          '</em>';
      } else {
        /* Never tried, or platform doesn't support auto-fetch */
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

    /* The worker returns { ok: false, error } for platforms it can't
       auto-fetch (TikTok, Facebook, Instagram) and for YouTube handles
       that don't resolve. Do NOT save that as stats — it would paint
       "0 followers · 0.00% ER" in the UI for every failed competitor. */
    if (!res || res.ok === false) {
      ctx().toast?.(
        (res?.error || 'Competitor stats unavailable for this platform.'),
        'warning'
      );
      /* Save only the error string, never touch existing good stats */
      const next = list.map(x => x.id === id
        ? { ...x, lastError: res?.error || 'unknown', lastAttemptAt: new Date().toISOString() }
        : x
      );
      await ctx().set(ctx().ref(ctx().db, ctx().P('competitorBenchmarks')), next);
      ctx().state.data.competitorBenchmarks = next;
      _renderCompetitors();
      return;
    }

    /* Strip the `ok` flag — the UI only wants the actual metrics */
    const { ok, ...cleanStats } = res;

    /* If the worker didn't return engagementRate but we have enough
       metrics to compute it, do that here. */
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

    const next = list.map(x => x.id === id
      ? {
          ...x,
          stats: cleanStats,
          updatedAt: new Date().toISOString(),
          lastError: null,
          lastAttemptAt: new Date().toISOString(),
        }
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
