import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../web/currency-display.js', import.meta.url), 'utf8');

function makeRates() {
  const rates = { USD: 1, KES: 130, EUR: 0.92, GBP: 0.78, NGN: 1500, ZAR: 18, INR: 83.5, AUD: 1.5 };
  for (let i = 1; i <= 20; i++) rates['X' + String(i).padStart(2, '0') + 'X'] = 1 + i / 100;
  return Object.entries(rates).map(([quote, rate]) => ({ quote, rate, date: '2026-11-12' }));
}

async function bootCurrency(seed = {}) {
  const values = new Map(Object.entries(seed));
  const listeners = new Map();
  const events = [];
  const localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
  const window = {
    VioraCurrency: null,
    addEventListener: (name, fn) => listeners.set(name, fn),
    dispatchEvent: event => { events.push(event); listeners.get(event.type)?.(event); }
  };
  const document = {
    readyState: 'complete',
    head: { appendChild() {} },
    body: { appendChild() {} },
    documentElement: { appendChild() {} },
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} })
  };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  const fetch = async url => {
    if (String(url).includes('ipapi.co')) return { ok: true, json: async () => ({ country_code: 'KE', currency: 'KES' }) };
    if (String(url).includes('frankfurter.dev')) return { ok: true, json: async () => makeRates() };
    if (String(url).includes('open.er-api.com')) return { ok: true, json: async () => ({ result: 'success', base_code: 'USD', rates: { USD: 1, KES: 130, EUR: 0.92, GBP: 0.78 } }) };
    throw new Error('Unexpected URL: ' + url);
  };
  const context = {
    window, document, navigator: { language: 'en-KE' }, localStorage, fetch,
    CustomEvent, AbortController, Intl, Date, Number, Object, String, Array, Math, JSON,
    Promise, Error, RegExp, console,
    setTimeout: () => 1, clearTimeout: () => {}
  };
  vm.runInNewContext(source, context, { filename: 'currency-display.js' });
  await new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if (window.VioraCurrency?.getState().ready) return resolve();
      if (Date.now() - started > 1500) return reject(new Error('Currency loader did not become ready'));
      setTimeout(poll, 0);
    };
    poll();
  });
  return { api: window.VioraCurrency, values, events };
}

test('detects local currency and formats the KES catalogue price', async () => {
  const { api } = await bootCurrency();
  assert.equal(api.getState().currency, 'KES');
  assert.ok(api.formatKES(1300).includes('1,300') || api.formatKES(1300).includes('1300'));
});

test('allows a visitor to override currency and persists the preference', async () => {
  const { api, values } = await bootCurrency();
  assert.equal(api.setCurrency('EUR'), true);
  assert.equal(api.getState().currency, 'EUR');
  assert.equal(values.get('viora_currency_override_v1'), 'EUR');
  assert.ok(api.formatKES(1300).includes('€'));
});

test('restores the automatic country currency when the visitor resets the preference', async () => {
  const { api, values } = await bootCurrency({ viora_currency_override_v1: 'GBP' });
  assert.equal(api.getState().currency, 'GBP');
  assert.equal(api.getState().manualCurrency, true);
  assert.equal(api.resetCurrency(), 'KES');
  assert.equal(api.getState().manualCurrency, false);
  assert.equal(values.has('viora_currency_override_v1'), false);
});

test('rejects invalid or unavailable currency overrides', async () => {
  const { api } = await bootCurrency();
  assert.equal(api.setCurrency('not-a-code'), false);
  assert.equal(api.setCurrency('JPY'), false);
  assert.equal(api.getState().currency, 'KES');
});
