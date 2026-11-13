import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleMarketplacePreview } from '../../workers/viora-api/marketplace-preview.js';

const ENV = {
  FIREBASE_DATABASE_URL: 'https://mock-firebase.invalid',
  FIREBASE_DATABASE_SECRET: 'test-only-secret'
};
const USER = { localId: 'user-1', email: 'user@example.test', role: 'client' };
const ADMIN = { localId: 'admin-1', email: 'admin@example.test', role: 'admin' };
let records;
let versions;
let originalFetch;
let originalNow;
let clock;

function pathKey(url) {
  return decodeURIComponent(url.pathname.replace(/^\//, '').replace(/\.json$/, ''));
}

function seed() {
  records.set('viora_data/orgs/viora/portalUsers/user-1', {
    active: true, clientId: 'client-1', email: USER.email
  });
  records.set('viora_data/orgs/viora/products/demo-app', {
    id: 'demo-app', name: 'Demo App', status: 'active',
    previewEnabled: true, previewGatewayVerified: true,
    previewProfile: 'isolated-software'
  });
  records.set('viora_data/orgs/viora/subscriptions', {});
}

function makeRequest(route, method = 'POST', body = {}, query = '') {
  const hasBody = method !== 'GET';
  return new Request('https://api.example.test/marketplace/preview/' + route + query, {
    method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : {},
    ...(hasBody ? { body: JSON.stringify(body) } : {})
  });
}

async function call(route, user = USER, method = 'POST', body = {}, query = '') {
  if (['start', 'request'].includes(route) && !body.productId) body = { ...body, productId: 'demo-app' };
  return handleMarketplacePreview(makeRequest(route, method, body, query), ENV, user, route, body);
}

beforeEach(() => {
  records = new Map();
  versions = new Map();
  clock = 1_795_000_000_000;
  originalNow = Date.now;
  Date.now = () => clock;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const key = pathKey(url);
    const method = init.method || 'GET';
    const currentVersion = versions.get(key) || 0;
    const etag = '"v' + currentVersion + '"';
    if (method === 'GET') {
      const headers = init.headers || {};
      const wantsEtag = headers['X-Firebase-ETag'] === 'true' || headers['x-firebase-etag'] === 'true';
      return new Response(JSON.stringify(records.has(key) ? records.get(key) : null), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...(wantsEtag ? { ETag: etag } : {}) }
      });
    }
    if (method === 'PUT') {
      const headers = init.headers || {};
      const match = headers['If-Match'] || headers['if-match'];
      if (match && match !== etag) return new Response('', { status: 412 });
      records.set(key, JSON.parse(init.body));
      versions.set(key, currentVersion + 1);
      return new Response(JSON.stringify(records.get(key)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('Unsupported mock method', { status: 405 });
  };
  seed();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
});

test('first eligible request creates exactly a 15-minute server session', async () => {
  const response = await call('start', USER, 'POST', { productId: 'demo-app', uid: 'attacker-controlled-uid' });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.session.uid, USER.localId);
  assert.equal(data.session.productId, 'demo-app');
  assert.equal(data.session.expiresAt - data.session.startedAt, 15 * 60 * 1000);
  assert.ok(records.has('viora_data/orgs/viora/marketplacePreview/eligibility/user-1/demo-app'));
  assert.equal(records.has('viora_data/orgs/viora/marketplacePreview/eligibility/attacker-controlled-uid/demo-app'), false);
});

test('repeated start during an active preview returns the same session without extending expiry', async () => {
  const first = await (await call('start')).json();
  clock += 60_000;
  const second = await (await call('start')).json();
  assert.equal(second.session.id, first.session.id);
  assert.equal(second.session.expiresAt, first.session.expiresAt);
});

test('concurrent start requests cannot create parallel sessions or bypass cooldown', async () => {
  const [a, b] = await Promise.all([call('start'), call('start')]);
  const first = await a.json();
  const second = await b.json();
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(first.session.id, second.session.id);
  assert.equal(first.session.expiresAt, second.session.expiresAt);
});

test('cooldown remains in force after early end and blocks a second preview', async () => {
  const started = await (await call('start')).json();
  const endedResponse = await call('end', USER, 'POST', {
    productId: 'demo-app', sessionId: started.session.id
  });
  const ended = await endedResponse.json();
  assert.equal(ended.session.status, 'ended');
  const blocked = await call('start');
  assert.equal(blocked.status, 429);
});

test('server time expires the preview regardless of a client-supplied clock', async () => {
  const started = await (await call('start')).json();
  clock += 16 * 60 * 1000;
  const validation = await call('validate', USER, 'POST', {
    productId: 'demo-app', sessionId: started.session.id, now: started.session.startedAt
  });
  assert.equal(validation.status, 403);
  const result = await validation.json();
  assert.equal(result.allowed, false);
});

test('missing Firebase ETag support fails closed instead of using a non-atomic write', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    if ((init.headers || {})['X-Firebase-ETag'] === 'true') {
      const key = pathKey(url);
      return new Response(JSON.stringify(records.has(key) ? records.get(key) : null), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return original(input, init);
  };
  try {
    const response = await call('start');
    assert.equal(response.status, 503);
    assert.equal(records.has('viora_data/orgs/viora/marketplacePreview/eligibility/user-1/demo-app'), false);
  } finally {
    globalThis.fetch = original;
  }
});

test('paid subscriptions take precedence over preview sessions', async () => {
  records.set('viora_data/orgs/viora/subscriptions', {
    sub1: {
      clientId: 'client-1', productId: 'demo-app', status: 'active',
      plan: 'monthly', endDate: new Date(clock + 30 * 86400000).toISOString()
    }
  });
  const response = await call('start');
  const data = await response.json();
  assert.equal(data.access, 'paid');
  assert.equal(data.paidAccess, true);
  assert.equal(records.has('viora_data/orgs/viora/marketplacePreview/eligibility/user-1/demo-app'), false);
});

test('unverified delivery gateways fail closed even when an admin toggles previewEnabled', async () => {
  records.set('viora_data/orgs/viora/products/demo-app', {
    id: 'demo-app', status: 'active', previewEnabled: true,
    previewProfile: 'isolated-software', previewGatewayVerified: false
  });
  const response = await call('start');
  assert.equal(response.status, 403);
});

test('non-admin users cannot list requests, grant or revoke previews', async () => {
  assert.equal((await call('admin-requests', USER, 'GET')).status, 403);
  assert.equal((await call('admin-grant', USER, 'POST', { uid: 'user-1', productId: 'demo-app' })).status, 403);
  assert.equal((await call('admin-revoke', USER, 'POST', { uid: 'user-1', productId: 'demo-app' })).status, 403);
});

test('admin grants require a pending request and preserve the same session policy', async () => {
  const requestResponse = await call('request', USER, 'POST', { productId: 'demo-app' });
  assert.equal(requestResponse.status, 201);
  const grantResponse = await call('admin-grant', ADMIN, 'POST', { uid: 'user-1', productId: 'demo-app' });
  const grant = await grantResponse.json();
  assert.equal(grantResponse.status, 200);
  assert.equal(grant.grant.status, 'approved');
  assert.equal(grant.session, undefined, 'grant approval must not start the 15-minute clock');
  const request = records.get('viora_data/orgs/viora/marketplacePreview/requests/user-1/demo-app');
  assert.equal(request.status, 'approved');
  const started = await (await call('start', USER, 'POST', { productId: 'demo-app' })).json();
  assert.equal(started.session.source, 'admin');
  assert.equal(started.session.grantedBy, ADMIN.localId);
  assert.equal(started.session.expiresAt - started.session.startedAt, 15 * 60 * 1000);
});

test('admin revocation invalidates an active session immediately', async () => {
  const started = await (await call('start')).json();
  const revoked = await call('admin-revoke', ADMIN, 'POST', { uid: 'user-1', productId: 'demo-app' });
  assert.equal(revoked.status, 200);
  const validation = await call('validate', USER, 'POST', {
    productId: 'demo-app', sessionId: started.session.id
  });
  assert.equal(validation.status, 403);
});
