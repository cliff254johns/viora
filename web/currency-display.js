/* VIORA global display currency.
   Detects the visitor's country from IP metadata (no device-location permission).
   Uses daily reference FX rates for public catalogue estimates only.
   Stored product prices, invoices and payment settlement currencies are never rewritten. */
(function () {
  'use strict';
  if (window.VioraCurrency) return;

  const FRANKFURTER_URL = 'https://api.frankfurter.dev/v2/rates?base=USD';
  const FALLBACK_FX_URL = 'https://open.er-api.com/v6/latest/USD';
  const GEO_URLS = ['https://ipapi.co/json/', 'https://ipwho.is/'];
  const FX_CACHE_KEY = 'viora_fx_usd_v4';
  const GEO_CACHE_KEY = 'viora_geo_currency_v1';
  const DAY = 86400000;
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const state = {
    countryCode: '',
    currency: 'USD',
    rates: { USD: 1 },
    lastUpdated: '',
    nextUpdate: 0,
    ready: false,
    source: 'USD fallback'
  };

  function readCache(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch (_) { return null; }
  }
  function writeCache(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (_) {}
  }
  async function fetchJson(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 8000);
    try {
      const response = await fetch(url, {
        method: 'GET', mode: 'cors', cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function normalizeGeo(data, provider) {
    if (!data) return null;
    if (provider === 'ipapi') {
      if (data.error || !data.currency) return null;
      return {
        countryCode: String(data.country_code || '').toUpperCase(),
        currency: String(data.currency || '').toUpperCase()
      };
    }
    if (data.success === false || !data.currency || !data.currency.code) return null;
    return {
      countryCode: String(data.country_code || '').toUpperCase(),
      currency: String(data.currency.code || '').toUpperCase()
    };
  }
  async function loadGeo() {
    const cached = readCache(GEO_CACHE_KEY);
    if (cached && cached.savedAt && Date.now() - cached.savedAt < DAY && cached.currency) {
      state.countryCode = cached.countryCode || '';
      state.currency = String(cached.currency).toUpperCase();
      state.source = 'IP country estimate';
      return;
    }
    for (const url of GEO_URLS) {
      try {
        const data = await fetchJson(url, 6500);
        const geo = normalizeGeo(data, url.indexOf('ipapi.co') >= 0 ? 'ipapi' : 'ipwho');
        if (geo && /^[A-Z]{3}$/.test(geo.currency)) {
          state.countryCode = geo.countryCode;
          state.currency = geo.currency;
          state.source = 'IP country estimate';
          writeCache(GEO_CACHE_KEY, Object.assign({ savedAt: Date.now() }, geo));
          return;
        }
      } catch (error) {
        console.debug('[VIORA currency] Country lookup unavailable:', error && error.message);
      }
    }
  }
  function saveRateCache() {
    writeCache(FX_CACHE_KEY, {
      rates: state.rates,
      lastUpdated: state.lastUpdated,
      nextUpdate: state.nextUpdate || Date.now() + CACHE_TTL,
      savedAt: Date.now(),
      source: state.source
    });
  }
  async function loadRates() {
    const cached = readCache(FX_CACHE_KEY);
    if (cached && cached.rates && Number(cached.rates.USD) === 1) {
      state.rates = cached.rates;
      state.lastUpdated = cached.lastUpdated || '';
      state.nextUpdate = Number(cached.nextUpdate) || 0;
      if (cached.source) state.source = cached.source;
      if (state.nextUpdate > Date.now() && Number(state.rates[state.currency]) > 0) return;
    }

    let primaryLoaded = false;
    try {
      const rows = await fetchJson(FRANKFURTER_URL, 10000);
      if (Array.isArray(rows) && rows.length) {
        const rates = { USD: 1 };
        let latestDate = '';
        rows.forEach(row => {
          const code = String(row.quote || '').toUpperCase();
          const rate = Number(row.rate);
          if (/^[A-Z]{3}$/.test(code) && Number.isFinite(rate) && rate > 0) rates[code] = rate;
          if (row.date && String(row.date) > latestDate) latestDate = String(row.date);
        });
        if (Object.keys(rates).length > 20) {
          state.rates = rates;
          state.lastUpdated = latestDate;
          state.nextUpdate = Date.now() + CACHE_TTL;
          state.source = 'Frankfurter daily reference rates';
          primaryLoaded = true;
        }
      }
    } catch (error) {
      console.warn('[VIORA currency] Frankfurter FX feed unavailable; trying backup.', error);
    }

    // Broader fallback for a currency not quoted by the primary reference feed,
    // or when the primary feed is temporarily unavailable.
    if (!primaryLoaded || !(Number(state.rates[state.currency]) > 0)) {
      try {
        const data = await fetchJson(FALLBACK_FX_URL, 10000);
        const sourceRates = data && data.result === 'success' && data.base_code === 'USD' ? data.rates : null;
        if (sourceRates && Number(sourceRates.USD) === 1) {
          const fallback = { USD: 1 };
          Object.keys(sourceRates).forEach(code => {
            const rate = Number(sourceRates[code]);
            if (/^[A-Z]{3}$/.test(code) && Number.isFinite(rate) && rate > 0) fallback[code] = rate;
          });
          Object.keys(fallback).forEach(code => {
            if (!(Number(state.rates[code]) > 0)) state.rates[code] = fallback[code];
          });
          if (!primaryLoaded) {
            state.lastUpdated = data.time_last_update_utc || state.lastUpdated;
            state.source = 'Open Exchange Rate fallback';
            state.nextUpdate = Number(data.time_next_update_unix || 0) * 1000 || Date.now() + DAY;
          }
        }
      } catch (error) {
        console.warn('[VIORA currency] Backup FX feed unavailable; retaining cached reference rates.', error);
      }
    }
    if (Number(state.rates[state.currency]) > 0 || primaryLoaded) saveRateCache();
  }
  function formatterLocale() {
    return state.countryCode ? 'en-' + state.countryCode : (navigator.language || 'en-US');
  }
  function formatAmount(amount, currency) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return '—';
    try {
      return new Intl.NumberFormat(formatterLocale(), {
        style: 'currency',
        currency: currency,
        currencyDisplay: 'symbol'
      }).format(value);
    } catch (_) {
      return currency + ' ' + value.toLocaleString();
    }
  }
  function convert(amount, from, to) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return 0;
    const fromRate = Number(state.rates[String(from || '').toUpperCase()]);
    const toRate = Number(state.rates[String(to || '').toUpperCase()]);
    if (!(fromRate > 0) || !(toRate > 0)) return null;
    return (value / fromRate) * toRate;
  }
  function formatUSD(amount) {
    const converted = convert(amount, 'USD', state.currency);
    return converted == null ? formatAmount(amount, 'USD') : formatAmount(converted, state.currency);
  }
  function formatKES(amount) {
    const converted = convert(amount, 'KES', state.currency);
    return converted == null ? formatAmount(amount, 'KES') : formatAmount(converted, state.currency);
  }
  function announce() {
    if (!(Number(state.rates[state.currency]) > 0)) {
      state.currency = 'USD';
      state.source = 'USD fallback (local FX rate unavailable)';
    }
    state.ready = true;
    const detail = {
      countryCode: state.countryCode,
      currency: state.currency,
      lastUpdated: state.lastUpdated,
      nextUpdate: state.nextUpdate,
      source: state.source,
      rateAvailable: Number(state.rates[state.currency]) > 0
    };
    window.dispatchEvent(new CustomEvent('viora:currency-ready', { detail }));
    const badge = document.getElementById('vioraCurrencyBadge');
    if (badge) {
      const name = (() => {
        try { return new Intl.DisplayNames([formatterLocale()], { type: 'currency' }).of(state.currency); }
        catch (_) { return state.currency; }
      })();
      badge.innerHTML = '<span class="viora-currency-dot"></span><span>Prices in ' + state.currency + '</span><small>Indicative daily rates · <a href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">Frankfurter</a> · <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">backup rates</a></small>';
      badge.title = 'Estimated country: ' + (state.countryCode || 'not detected') + '. Currency: ' + name + '. Rate date: ' + (state.lastUpdated || 'not available') + '. Display estimates only; payment providers may apply different rates and fees.';
      badge.hidden = false;
    }
  }
  function installBadge() {
    if (document.getElementById('vioraCurrencyBadge')) return;
    const badge = document.createElement('div');
    badge.id = 'vioraCurrencyBadge';
    badge.hidden = true;
    badge.setAttribute('aria-live', 'polite');
    badge.innerHTML = '<span class="viora-currency-dot"></span><span>Detecting local currency…</span>';
    const style = document.createElement('style');
    style.textContent = '#vioraCurrencyBadge{position:fixed;right:12px;bottom:12px;z-index:9990;display:flex;align-items:center;gap:7px;flex-wrap:wrap;max-width:min(330px,calc(100vw - 24px));padding:8px 11px;border:1px solid rgba(120,140,170,.25);border-radius:13px;background:rgba(12,20,34,.88);color:#f8fafc;box-shadow:0 8px 28px rgba(0,0,0,.2);backdrop-filter:blur(14px);font:600 11px/1.35 Inter,system-ui,sans-serif}#vioraCurrencyBadge small{display:block;flex-basis:100%;padding-left:13px;color:#cbd5e1;font-size:9px;font-weight:500}#vioraCurrencyBadge a{color:#93c5fd;text-decoration:underline}.viora-currency-dot{width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.13)}@media print{#vioraCurrencyBadge{display:none!important}}';
    document.head.appendChild(style);
    (document.body || document.documentElement).appendChild(badge);
  }
  const api = {
    get state() { return Object.assign({}, state); },
    getState() { return Object.assign({}, state); },
    formatUSD,
    formatKES,
    convert,
    format(amount, fromCurrency) {
      const source = String(fromCurrency || 'USD').toUpperCase();
      const result = convert(amount, source, state.currency);
      return result == null ? formatAmount(amount, source) : formatAmount(result, state.currency);
    }
  };
  window.VioraCurrency = api;
  async function start() {
    installBadge();
    // Resolve country first so the FX loader knows which national currency
    // must be present before the currency-ready event triggers page rendering.
    await loadGeo();
    await loadRates();
    announce();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
