/* ═══════════════════════════════════════════════════════════════
   VIORA — GLOBAL MARKET DASHBOARD  (hardened + perf-tuned)
   Extracted from main.js (Phase C-1)

   Handles: economic indicators, tech penetration, exchange rates,
            country comparison, and the Global Market AI chat.

   Depends on: injected deps — see initGlobalMarket()
   ═══════════════════════════════════════════════════════════════ */

import { getTextColor, destroyChart } from './charts.js';
import { timeAgo } from './helpers.js';

/* ── Injected dependencies ── */
let D = {
  $: null,
  toast: null,
  escapeHtml: null,
  callFn: null,
};

export function initGlobalMarket(d) {
  D = { ...D, ...d };
  _loadToken = 0;
  _chatInFlight = false;
  _fetchCache = new Map();
}

/* ── Null-safe wrappers ── */
const $ = (id) => { const f = D.$; if (typeof f === 'function') return f(id); return document.getElementById(id); };
const toast = (m, t) => { if (typeof D.toast === 'function') D.toast(m, t); };
const escapeHtml = (s) => {
  if (typeof D.escapeHtml === 'function') return D.escapeHtml(s);
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const COMPARE_COUNTRIES = ['CHN','JPN','USA','DEU','KOR','GBR','SGP','ARE','NGA','KEN','EGY','ZAF','TUN','GHA','MAR','RWA'];
const GRID_COLOR = 'rgba(148,163,184,0.15)';
const FETCH_TTL_MS = 5 * 60 * 1000;      // 5 min
const MAX_CHAT_MESSAGES = 200;
const BATCH_CHUNK = 4;

/* ═══════════════════════════════════════════════════════════════
   CHART REGISTRY (module-private)
   ═══════════════════════════════════════════════════════════════ */
const gCharts = {};

export function destroyGChart(id) {
  const c = gCharts[id];
  if (!c) return;
  try { c.destroy(); } catch (e) {}
  delete gCharts[id];
  /* Clear the canvas so stale pixels don't bleed through. */
  const canvas = c.canvas;
  if (canvas && canvas.getContext) {
    try {
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } catch (e) {}
  }
}

/* ═══════════════════════════════════════════════════════════════
   FETCH CACHE + LOW-LEVEL FETCH
   ═══════════════════════════════════════════════════════════════ */
let _fetchCache = new Map();

function cacheKey(metric, country) {
  return metric + ':' + country;
}

function getCached(metric, country) {
  const k = cacheKey(metric, country);
  const hit = _fetchCache.get(k);
  if (!hit) return null;
  if (Date.now() - hit.ts > FETCH_TTL_MS) {
    _fetchCache.delete(k);
    return null;
  }
  return hit.value;
}

function setCached(metric, country, value) {
  _fetchCache.set(cacheKey(metric, country), { ts: Date.now(), value });
  /* Cap the cache — simple FIFO eviction. */
  if (_fetchCache.size > 200) {
    const firstKey = _fetchCache.keys().next().value;
    _fetchCache.delete(firstKey);
  }
}

export async function gFetch(metric, params = {}) {
  if (typeof D.callFn !== 'function') throw new Error('callFn not injected');
  const country = params.country || ($('gCountrySelect') && $('gCountrySelect').value) || 'KEN';
  const cached = getCached(metric, country);
  if (cached) return cached;
  const body = { metric, country, ...params };
  const res = await D.callFn('globalData', body);
  setCached(metric, country, res);
  return res;
}

/* ═══════════════════════════════════════════════════════════════
   BATCHED FETCH
   ═══════════════════════════════════════════════════════════════ */
export async function gFetchBatch(items, fetchFn) {
  if (!Array.isArray(items) || !items.length || typeof fetchFn !== 'function') return [];
  const results = new Array(items.length);
  for (let i = 0; i < items.length; i += BATCH_CHUNK) {
    const end = Math.min(i + BATCH_CHUNK, items.length);
    const chunkPromises = [];
    for (let j = i; j < end; j++) {
      chunkPromises.push(
        Promise.resolve()
          .then(() => fetchFn(items[j]))
          .catch(() => null)
      );
    }
    const chunkResults = await Promise.all(chunkPromises);
    for (let j = 0; j < chunkResults.length; j++) results[i + j] = chunkResults[j];
  }
  return results;
}

/* ═══════════════════════════════════════════════════════════════
   LOAD TOKEN — discards stale responses
   ═══════════════════════════════════════════════════════════════ */
let _loadToken = 0;

function currentCountryName() {
  const sel = $('gCountrySelect');
  if (!sel) return '';
  const opts = sel.selectedOptions;
  return (opts && opts[0] && opts[0].textContent) || sel.value || '';
}

/* ═══════════════════════════════════════════════════════════════
   TOP-LEVEL LOADER
   ═══════════════════════════════════════════════════════════════ */
export async function loadGlobalDashboard() {
  const token = ++_loadToken;
  const sel = $('gCountrySelect');
  const country = (sel && sel.value) || 'KEN';
  const countryName = currentCountryName();
  const econCountryEl = $('gEconCountry');
  if (econCountryEl) econCountryEl.textContent = countryName;

  /* Prefetch shared payloads once — every loader below reads from the cache. */
  const prefetch = [];
  prefetch.push(gFetch('economic_indicators', { country }).catch(() => null));
  prefetch.push(gFetch('tech_indicators',     { country }).catch(() => null));
  prefetch.push(gFetch('exchange_rates',      { base: 'USD' }).catch(() => null));

  await Promise.all(prefetch);

  if (token !== _loadToken) return;    // superseded by a newer load

  /* Now all loaders can run in parallel without re-fetching shared data. */
  await Promise.all([
    loadEconomicIndicators(country, token),
    loadInflationTrend(country, token),
    loadExchangeRates(token),
    loadPopulationTrend(country, token),
    loadCountryComparison(country, token),
    loadTechPenetration(country, token),
    loadTechBroadband(country, token),
    loadTechServers(country, token),
    loadTechExports(country, token),
    loadTechRd(country, token),
  ]).catch(e => console.warn('[global-market] partial failure', e));
}

/* ═══════════════════════════════════════════════════════════════
   SHARED HELPERS
   ═══════════════════════════════════════════════════════════════ */

/* Merge series into a sorted, deduped label axis + aligned values. */
function mergeByYear(primarySeries, secondarySeries) {
  const yearSet = new Set();
  for (const p of (primarySeries || [])) if (p && p.year != null) yearSet.add(p.year);
  for (const p of (secondarySeries || [])) if (p && p.year != null) yearSet.add(p.year);
  const years = Array.from(yearSet).sort();
  const pMap = new Map((primarySeries   || []).map(p => [p.year, p.value]));
  const sMap = new Map((secondarySeries || []).map(p => [p.year, p.value]));
  return {
    labels: years,
    primary:   years.map(y => (pMap.has(y) ? pMap.get(y) : null)),
    secondary: years.map(y => (sMap.has(y) ? sMap.get(y) : null)),
  };
}

function lastValue(series) {
  if (!Array.isArray(series) || !series.length) return null;
  for (let i = series.length - 1; i >= 0; i--) {
    const p = series[i];
    if (p && p.value != null) return p.value;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   INDICATOR LOADERS
   ═══════════════════════════════════════════════════════════════ */

export async function loadTechPenetration(country, token = _loadToken) {
  try {
    const res = await gFetch('tech_indicators', { country });
    if (token !== _loadToken) return;
    if (!res || !res.ok || !res.series) throw new Error((res && res.error) || 'No data');

    const { labels, primary: internetVals, secondary: mobileVals } =
      mergeByYear(res.series.internet_users, res.series.mobile_per100);

    const tc = getTextColor();
    const label = currentCountryName() || 'Country';
    const lbl1 = $('gTechCountry');
    if (lbl1) lbl1.textContent = label;

    destroyGChart('gTechPenetrationChart');
    const canvas = $('gTechPenetrationChart');
    if (!canvas) return;

    gCharts['gTechPenetrationChart'] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Internet users (% population)',
            data: internetVals,
            borderColor: '#00d4ff',
            backgroundColor: 'rgba(0,212,255,0.12)',
            borderWidth: 3, tension: 0.4, yAxisID: 'y',
            fill: true, pointRadius: 3, spanGaps: true,
          },
          {
            label: 'Mobile subs (per 100 people)',
            data: mobileVals,
            borderColor: '#a855f7',
            backgroundColor: 'transparent',
            borderWidth: 2, tension: 0.4, yAxisID: 'y1',
            borderDash: [5, 4], pointRadius: 3, spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: tc, font: { size: 10 } } } },
        scales: {
          y:  { position: 'left',  beginAtZero: true, ticks: { color: tc, callback: v => v + '%' },    grid: { color: GRID_COLOR } },
          y1: { position: 'right', beginAtZero: true, ticks: { color: tc, callback: v => v + '/100' }, grid: { display: false } },
          x:  { ticks: { color: tc }, grid: { display: false } },
        },
      },
    });

    const src = $('gTechPenetrationSource');
    if (src) src.textContent = `Source: World Bank · fetched ${timeAgo(res.fetchedAt)}`;
  } catch (e) { console.warn('[global-market] tech penetration failed', e); }
}

export async function loadTechBroadband(primaryCountry, token = _loadToken) {
  try {
    const results = await gFetchBatch(COMPARE_COUNTRIES, c =>
      gFetch('tech_indicators', { country: c })
        .then(r => ({ c, bbnd: lastValue((r && r.series && r.series.broadband_per100) || []) }))
        .catch(() => ({ c, bbnd: null }))
    );
    if (token !== _loadToken) return;

    const labels = results.map(r => r.c);
    const values = results.map(r => r.bbnd);
    const tc = getTextColor();

    destroyGChart('gTechBroadbandChart');
    const canvas = $('gTechBroadbandChart');
    if (!canvas) return;

    gCharts['gTechBroadbandChart'] = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Fixed broadband subs / 100',
          data: values,
          backgroundColor: labels.map(l => l === primaryCountry ? 'rgba(0,212,255,0.85)' : 'rgba(124,58,237,0.55)'),
          borderColor:     labels.map(l => l === primaryCountry ? '#00d4ff' : '#7c3aed'),
          borderWidth: 1, borderRadius: 8,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { color: tc }, grid: { color: GRID_COLOR } },
          x: { ticks: { color: tc, font: { size: 10 } }, grid: { display: false } },
        },
      },
    });

    const src = $('gTechBroadbandSource');
    if (src) src.textContent = 'Source: World Bank (IT.NET.BBND.P2)';
  } catch (e) { console.warn('[global-market] tech broadband failed', e); }
}

export async function loadTechServers(country, token = _loadToken) {
  try {
    const res = await gFetch('tech_indicators', { country });
    if (token !== _loadToken) return;
    if (!res || !res.ok || !res.series) throw new Error((res && res.error) || 'No data');

    const servers = res.series.secure_servers || [];
    const labels = servers.map(p => p.year);
    const values = servers.map(p => p.value);

    const tc = getTextColor();
    const lbl = $('gTechServersCountry');
    if (lbl) lbl.textContent = currentCountryName() || 'Country';

    destroyGChart('gTechServersChart');
    const canvas = $('gTechServersChart');
    if (!canvas) return;

    gCharts['gTechServersChart'] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Secure Internet servers (per 1M people)',
          data: values,
          borderColor: '#22e6a0',
          backgroundColor: 'rgba(34,230,160,0.15)',
          borderWidth: 3, tension: 0.4, fill: true, pointRadius: 3, spanGaps: true,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: tc, font: { size: 10 } } } },
        scales: {
          y: { beginAtZero: true, ticks: { color: tc, callback: v => Number(v).toLocaleString() }, grid: { color: GRID_COLOR } },
          x: { ticks: { color: tc }, grid: { display: false } },
        },
      },
    });

    const src = $('gTechServersSource');
    if (src) src.textContent = 'Source: World Bank (IT.NET.SECR.P6)';
  } catch (e) { console.warn('[global-market] tech servers failed', e); }
}

export async function loadTechExports(primaryCountry, token = _loadToken) {
  try {
    const results = await gFetchBatch(COMPARE_COUNTRIES, c =>
      gFetch('tech_indicators', { country: c })
        .then(r => ({
          c,
          ict:  lastValue((r && r.series && r.series.ict_exports)    || []),
          tech: lastValue((r && r.series && r.series.hitech_exports) || []),
        }))
        .catch(() => ({ c, ict: null, tech: null }))
    );
    if (token !== _loadToken) return;

    const labels = results.map(r => r.c);
    const ictVals  = results.map(r => r.ict);
    const techVals = results.map(r => r.tech);
    const tc = getTextColor();

    destroyGChart('gTechExportsChart');
    const canvas = $('gTechExportsChart');
    if (!canvas) return;

    gCharts['gTechExportsChart'] = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'ICT goods exports (% total)',       data: ictVals,  backgroundColor: 'rgba(0,212,255,0.75)',  borderColor: '#00d4ff', borderWidth: 1, borderRadius: 6 },
          { label: 'High-tech exports (% manufactured)', data: techVals, backgroundColor: 'rgba(168,85,247,0.65)', borderColor: '#a855f7', borderWidth: 1, borderRadius: 6 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: tc, font: { size: 11 } } } },
        scales: {
          y: { beginAtZero: true, ticks: { color: tc, callback: v => v + '%' }, grid: { color: GRID_COLOR } },
          x: { ticks: { color: tc, font: { size: 10 } }, grid: { display: false } },
        },
      },
    });

    const src = $('gTechExportsSource');
    if (src) src.textContent = 'Source: World Bank · latest year per country';
  } catch (e) { console.warn('[global-market] tech exports failed', e); }
}

export async function loadTechRd(primaryCountry, token = _loadToken) {
  try {
    const results = await gFetchBatch(COMPARE_COUNTRIES, c =>
      gFetch('tech_indicators', { country: c })
        .then(r => ({ c, rd: lastValue((r && r.series && r.series.rd_gdp_pct) || []) }))
        .catch(() => ({ c, rd: null }))
    );
    if (token !== _loadToken) return;

    const labels = results.map(r => r.c);
    const values = results.map(r => r.rd);
    const tc = getTextColor();

    destroyGChart('gTechRdChart');
    const canvas = $('gTechRdChart');
    if (!canvas) return;

    gCharts['gTechRdChart'] = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'R&D expenditure (% GDP)',
          data: values,
          backgroundColor: labels.map(l => l === primaryCountry ? 'rgba(255,200,87,0.85)' : 'rgba(124,58,237,0.55)'),
          borderColor:     labels.map(l => l === primaryCountry ? '#ffc857' : '#7c3aed'),
          borderWidth: 1, borderRadius: 8,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { color: tc, callback: v => v + '%' }, grid: { color: GRID_COLOR } },
          x: { ticks: { color: tc, font: { size: 10 } }, grid: { display: false } },
        },
      },
    });

    const src = $('gTechRdSource');
    if (src) src.textContent = 'Source: World Bank (GB.XPD.RSDV.GD.ZS)';
  } catch (e) { console.warn('[global-market] tech R&D failed', e); }
}

export async function loadEconomicIndicators(country, token = _loadToken) {
  try {
    const res = await gFetch('economic_indicators', { country });
    if (token !== _loadToken) return;
    if (!res || !res.ok || !res.series) throw new Error((res && res.error) || 'No data returned');

    const s = res.series || {};
    const { labels, primary: gdpVals, secondary: gdpPcVals } =
      mergeByYear(s.gdp_growth, s.gdp_per_capita);

    const tc = getTextColor();

    destroyGChart('gEconChart');
    const canvas = $('gEconChart');
    if (!canvas) return;

    gCharts['gEconChart'] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'GDP growth %',
            data: gdpVals,
            borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.08)',
            borderWidth: 3, tension: 0.4, yAxisID: 'y', fill: true, spanGaps: true,
          },
          {
            label: 'GDP per capita (USD)',
            data: gdpPcVals,
            borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.05)',
            borderWidth: 2, tension: 0.4, yAxisID: 'y1', borderDash: [5, 4], spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: tc, font: { size: 10 } } } },
        scales: {
          y:  { position: 'left',  ticks: { color: tc, callback: v => v + '%' }, grid: { color: GRID_COLOR } },
          y1: { position: 'right', ticks: { color: tc, callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { display: false } },
          x:  { ticks: { color: tc }, grid: { display: false } },
        },
      },
    });

    const src = $('gEconSource');
    if (src) src.textContent = `Source: ${(res.sources || []).join(' · ') || 'World Bank'} · fetched ${timeAgo(res.fetchedAt)}`;
  } catch (e) {
    console.error('[global-market] economic indicators failed', e);
    toast('Economic indicators failed: ' + (e.message || 'unknown'), 'warning');
  }
}

export async function loadInflationTrend(country, token = _loadToken) {
  try {
    const res = await gFetch('economic_indicators', { country });
    if (token !== _loadToken) return;
    if (!res || !res.ok || !res.series) throw new Error((res && res.error) || 'No data');

    const inflation = res.series.inflation || [];
    const labels = inflation.map(p => p.year);
    const vals = inflation.map(p => p.value);
    const tc = getTextColor();

    destroyGChart('gInflationChart');
    const canvas = $('gInflationChart');
    if (!canvas) return;

    gCharts['gInflationChart'] = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Inflation %',
          data: vals,
          backgroundColor: vals.map(v => v > 10 ? 'rgba(255,92,124,0.75)' : v > 5 ? 'rgba(255,200,87,0.75)' : 'rgba(34,230,160,0.75)'),
          borderColor:     vals.map(v => v > 10 ? '#ff5c7c' : v > 5 ? '#ffc857' : '#22e6a0'),
          borderWidth: 1, borderRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { color: tc, callback: v => v + '%' }, grid: { color: GRID_COLOR } },
          x: { ticks: { color: tc }, grid: { display: false } },
        },
      },
    });

    const src = $('gInflationSource');
    if (src) src.textContent = `Source: World Bank · fetched ${timeAgo(res.fetchedAt)}`;
  } catch (e) { console.warn('[global-market] inflation failed', e); }
}

export async function loadExchangeRates(token = _loadToken) {
  try {
    const res = await gFetch('exchange_rates', { base: 'USD' });
    if (token !== _loadToken) return;
    if (!res || !res.ok || !res.rates) throw new Error((res && res.error) || 'No rates');

    const targets = ['KES','UGX','TZS','RWF','NGN','ZAR','EUR','GBP','CNY','INR','AED','JPY'];
    const labels = [];
    const values = [];
    for (const c of targets) {
      if (res.rates[c] != null) { labels.push(c); values.push(res.rates[c]); }
    }
    const tc = getTextColor();

    destroyGChart('gFxChart');
    const canvas = $('gFxChart');
    if (!canvas) return;

    gCharts['gFxChart'] = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '1 USD =',
          data: values,
          backgroundColor: 'rgba(0,212,255,0.55)',
          borderColor: '#00d4ff', borderWidth: 1, borderRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: tc }, grid: { color: GRID_COLOR } },
          y: { ticks: { color: tc }, grid: { display: false } },
        },
      },
    });

    const src = $('gFxSource');
    if (src) src.textContent = `Source: ${res.source || '—'} · ${res.date || ''}`;
  } catch (e) { console.warn('[global-market] fx failed', e); }
}

export async function loadPopulationTrend(country, token = _loadToken) {
  try {
    const res = await gFetch('economic_indicators', { country });
    if (token !== _loadToken) return;
    if (!res || !res.ok || !res.series) throw new Error((res && res.error) || 'No data');

    const pop = res.series.population || [];
    const labels = pop.map(p => p.year);
    const vals = pop.map(p => p.value);
    const tc = getTextColor();

    destroyGChart('gPopChart');
    const canvas = $('gPopChart');
    if (!canvas) return;

    gCharts['gPopChart'] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Population',
          data: vals,
          borderColor: '#22e6a0', backgroundColor: 'rgba(34,230,160,0.15)',
          borderWidth: 3, tension: 0.4, fill: true, spanGaps: true,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { color: tc, callback: v => (v == null ? '' : (v / 1e6).toFixed(0) + 'M') }, grid: { color: GRID_COLOR } },
          x: { ticks: { color: tc }, grid: { display: false } },
        },
      },
    });
  } catch (e) { console.warn('[global-market] pop failed', e); }
}

export async function loadCountryComparison(primaryCountry, token = _loadToken) {
  try {
    const results = await gFetchBatch(COMPARE_COUNTRIES, c =>
      gFetch('economic_indicators', { country: c })
        .then(r => ({ c, gdp: lastValue((r && r.series && r.series.gdp_growth) || []) }))
        .catch(() => ({ c, gdp: null }))
    );
    if (token !== _loadToken) return;

    const labels = results.map(r => r.c);
    const values = results.map(r => r.gdp);
    const tc = getTextColor();

    destroyGChart('gCompareChart');
    const canvas = $('gCompareChart');
    if (!canvas) return;

    gCharts['gCompareChart'] = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Latest GDP growth %',
          data: values,
          backgroundColor: labels.map(l => l === primaryCountry ? 'rgba(0,212,255,0.85)' : 'rgba(124,58,237,0.55)'),
          borderColor:     labels.map(l => l === primaryCountry ? '#00d4ff' : '#7c3aed'),
          borderWidth: 1, borderRadius: 8,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { color: tc, callback: v => v + '%' }, grid: { color: GRID_COLOR } },
          x: { ticks: { color: tc, font: { size: 10 } }, grid: { display: false } },
        },
      },
    });
  } catch (e) { console.warn('[global-market] compare failed', e); }
}

/* ═══════════════════════════════════════════════════════════════
   AI CHAT
   ═══════════════════════════════════════════════════════════════ */
let _chatInFlight = false;

export async function gChatSend() {
  if (_chatInFlight) return;
  const input = $('gChatInput');
  const history = $('gChatHistory');
  if (!input || !history) return;

  const msg = input.value.trim();
  if (!msg) return;

  _chatInFlight = true;
  const sendBtn = $('gChatSendBtn');
  if (sendBtn) sendBtn.disabled = true;

  /* Append user bubble — preserves prior DOM. */
  history.insertAdjacentHTML('beforeend',
    '<div class="copilot-msg user" style="align-self:flex-end;background:var(--gradient-accent);color:#fff;padding:10px 14px;border-radius:14px 14px 4px 14px;max-width:80%;font-size:.85rem;">' +
      escapeHtml(msg) +
    '</div>');

  input.value = '';

  /* Append spinner — keep a live reference. */
  const spinnerWrap = document.createElement('div');
  spinnerWrap.className = 'copilot-msg assistant';
  spinnerWrap.style.cssText = 'background:var(--bg-input);padding:10px 14px;border-radius:14px 14px 14px 4px;max-width:90%;font-size:.85rem;border:1px solid var(--border-color);';
  spinnerWrap.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Querying live data sources…';
  history.appendChild(spinnerWrap);

  /* Cap chat history to a bounded DOM. */
  trimChatHistory(history);

  history.scrollTop = history.scrollHeight;

  try {
    const sel = $('gCountrySelect');
    const res = await D.callFn('globalChat', {
      message: msg,
      country: (sel && sel.value) || 'KEN',
    });

    const replyText = String((res && res.reply) != null ? res.reply : '(no response)');
    const replyHtml = escapeHtml(replyText).replace(/\n/g, '<br>');
    const tools = Array.isArray(res && res.toolsUsed) ? res.toolsUsed : [];
    const toolsHtml = tools.length
      ? '<div style="font-size:.66rem;color:var(--text-light);margin-top:6px;font-style:italic;">🔧 Used: ' + tools.map(escapeHtml).join(', ') + '</div>'
      : '';

    const replyEl = document.createElement('div');
    replyEl.className = 'copilot-msg assistant';
    replyEl.style.cssText = 'background:var(--bg-input);padding:10px 14px;border-radius:14px 14px 14px 4px;max-width:90%;font-size:.85rem;border:1px solid var(--border-color);line-height:1.6;';
    replyEl.innerHTML = replyHtml + toolsHtml;
    spinnerWrap.replaceWith(replyEl);

    const sourcesEl = $('gChatSources');
    if (sourcesEl) {
      const sources = Array.isArray(res && res.sources) ? res.sources : [];
      sourcesEl.innerHTML = sources.length
        ? '<i class="fa-solid fa-database"></i> Sources: ' + sources.map(s => escapeHtml(s)).join(' · ')
        : '';
    }
  } catch (e) {
    const errEl = document.createElement('div');
    errEl.className = 'copilot-msg assistant';
    errEl.style.cssText = 'background:var(--bg-input);padding:10px 14px;border-radius:14px 14px 14px 4px;max-width:90%;font-size:.85rem;border-left:4px solid var(--accent-red);color:var(--accent-red);';
    errEl.textContent = 'Error: ' + (e && e.message ? e.message : 'unknown');
    spinnerWrap.replaceWith(errEl);
  } finally {
    _chatInFlight = false;
    if (sendBtn) sendBtn.disabled = false;
    history.scrollTop = history.scrollHeight;
    trimChatHistory(history);
  }
}

function trimChatHistory(history) {
  const children = history.children;
  const over = children.length - MAX_CHAT_MESSAGES;
  for (let i = 0; i < over; i++) history.removeChild(children[0]);
}

/* ═══════════════════════════════════════════════════════════════
   SETUP
   ═══════════════════════════════════════════════════════════════ */
let _setupDone = false;

export function setupGlobalMarket() {
  if (_setupDone) return;
  _setupDone = true;

  const sel = $('gCountrySelect');
  if (sel) sel.addEventListener('change', () => loadGlobalDashboard());

  const refresh = $('gRefreshBtn');
  if (refresh) refresh.addEventListener('click', () => {
    /* Force fresh data on explicit refresh. */
    _fetchCache.clear();
    toast('Refreshing global data…', 'info');
    loadGlobalDashboard();
  });

  const send = $('gChatSendBtn');
  if (send) send.addEventListener('click', gChatSend);

  const input = $('gChatInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        gChatSend();
      }
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   NAMESPACED EXPORT
   ═══════════════════════════════════════════════════════════════ */
export const G = {
  destroyGChart,
  gFetchBatch,
  gFetch,
  loadGlobalDashboard,
  loadTechPenetration,
  loadTechBroadband,
  loadTechServers,
  loadTechExports,
  loadTechRd,
  loadEconomicIndicators,
  loadInflationTrend,
  loadExchangeRates,
  loadPopulationTrend,
  loadCountryComparison,
  gChatSend,
  setupGlobalMarket,
};

export default G;
