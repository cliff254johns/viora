/* VIORA global display currency — public-facing catalogue estimates only.
   Product prices remain stored in their original USD/KES source values.
   IP geolocation selects the visitor's local currency; no device location permission is requested.
   Reference FX rates refresh daily and are not payment-settlement quotes. */
(function () {
  'use strict';
  if (window.VioraCurrency) return;

  const FX_URL = 'https://open.er-api.com/v6/latest/USD';
  const GEO_URLS = ['https://ipapi.co/json/', 'https://ipwho.is/'];
  const FX_CACHE_KEY = 'viora_fx_usd_v2';
  const GEO_CACHE_KEY = 'viora_geo_currency_v1';
  const DAY = 86400000;
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
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function writeCache(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }
  async function fetchJson(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 7000);
    try {
      const response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function normalizeGeo(data, provider) {
    if (!data) return null;
    if (provider === 'ipapi') {
      if (data.error || !data.currency) return null;
      return { countryCode: String(data.country_code || '').toUpperCase(), currency: String(data.currency || '').toUpperCase() };
    }
    if (data.success === false || !data.currency || !data.currency.code) return null;
    return { countryCode: String(data.country_code || '').toUpperCase(), currency: String(data.currency.code || '').toUpperCase() };
  }
  async function loadGeo() {
    const cached = readCache(GEO_CACHE_KEY);
    if (cached && cached.savedAt && Date.now() - cached.savedAt < 7 * DAY && cached.currency) {
      state.countryCode = cached.countryCode || '';
      state.currency = cached.currency;
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
      } catch (error) { console.debug('[VIORA currency] country lookup unavailable:', error && error.message); }
    }
  }
  async function loadRates() {
    const cached = readCache(FX_CACHE_KEY);
    if (cached && cached.rates && cached.rates.USD === 1) {
      state.rates = cached.rates;
      state.lastUpdated = cached.lastUpdated || '';
      state.nextUpdate = Number(cached.nextUpdate) || 0;
      if (state.nextUpdate > Date.now()) return;
    }
    try {
      const data = await fetchJson(FX_URL, 9000);
      if (data && data.result === 'success' && data.base_code === 'USD' && data.rates && Number(data.rates.USD) === 1) {
        state.rates = data.rates;
        state.lastUpdated = data.time_last_update_utc || '';
        state.nextUpdate = Number(data.time_next_update_unix || 0) * 1000 || Date.now() + DAY;
        writeCache(FX_CACHE_KEY, { rates: data.rates, lastUpdated: state.lastUpdated, nextUpdate: state.nextUpdate, savedAt: Date.now() });
      }
    } catch (error) {
      console.warn('[VIORA currency] FX refresh unavailable; using cached reference rates when available.', error);
    }
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
        currencyDisplay: 'symbol',
        maximumFractionDigits: ['JPY','KRW','VND','CLP','XAF','XOF','UGX','RWF','BIF','DJF','GNF','KMF','PYG'].includes(currency) ? 0 : 2
      }).format(value);
    } catch (_) {
      return currency + ' ' + value.toLocaleString();
    }
  }
  function convert(amount, from, to) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return 0;
    const fromRate = Number(state.rates[from]);
    const toRate = Number(state.rates[to]);
    if (!(fromRate > 0) || !(toRate > 0)) return null;
    return (n / fromRate) * toRate;
  }
  function formatUSD(amount) {
    const converted = convert(amount, 'USD', state.currency);
    return converted == null ? formatAmount(amount, 'USD') : formatAmount(converted, state.currency);
  }
  function formatKES(amount) {
    const converted = convert(amount, 'KES', state.currency);
    return converted == null ? formatAmount(Number(amount) / 129, 'USD') : formatAmount(converted, state.currency);
  }
  function announce() {
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
      const name = (() => { try { return new Intl.DisplayNames([formatterLocale()], { type: 'currency' }).of(state.currency); } catch (_) { return state.currency; } })();
      badge.innerHTML = '<span class="viora-currency-dot"></span><span>Prices in ' + state.currency + '</span><small>Approximate local display · <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates by ExchangeRate-API</a></small>';
      badge.title = 'Estimated country from internet connection. Currency: ' + name + '. Rates last updated: ' + (state.lastUpdated || 'not available') + '. Payment providers may apply different rates and fees.';
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
    formatUSD,
    formatKES,
    convert,
    format(amount, fromCurrency) {
      const result = convert(amount, String(fromCurrency || 'USD').toUpperCase(), state.currency);
      return result == null ? formatAmount(amount, String(fromCurrency || 'USD').toUpperCase()) : formatAmount(result, state.currency);
    }
  };
  window.VioraCurrency = api;
  function start() {
    installBadge();
    Promise.allSettled([loadGeo(), loadRates()]).then(announce);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();