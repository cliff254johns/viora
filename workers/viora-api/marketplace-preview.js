const POLICY = Object.freeze({
  version: 1,
  durationMs: 15 * 60 * 1000,
  cooldownMs: 7 * 24 * 60 * 60 * 1000,
  maxEtagRetries: 5
});

const ROOT = 'viora_data/orgs/viora/marketplacePreview';

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
  });
}

function cleanId(value, label = 'id') {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    throw Object.assign(new Error('Invalid ' + label), { status: 400 });
  }
  return id;
}

function databaseUrl(env, path) {
  if (!env.FIREBASE_DATABASE_SECRET) {
    throw Object.assign(new Error('Preview service is not configured'), { status: 503 });
  }
  const base = String(env.FIREBASE_DATABASE_URL || 'https://cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app').replace(/\/$/, '');
  const url = new URL(base + '/' + path.replace(/^\/+/, '') + '.json');
  url.searchParams.set('auth', env.FIREBASE_DATABASE_SECRET);
  return url;
}

async function readRecord(env, path, withEtag = false) {
  const headers = withEtag ? { 'X-Firebase-ETag': 'true' } : {};
  const res = await fetch(databaseUrl(env, path), { headers });
  if (!res.ok) throw Object.assign(new Error('Preview data unavailable'), { status: 502 });
  const etag = res.headers.get('ETag');
  if (withEtag && !etag) throw Object.assign(new Error('Atomic preview storage is unavailable'), { status: 503 });
  return { value: await res.json(), etag };
}

async function writeRecord(env, path, value, etag) {
  if (!etag) throw Object.assign(new Error('Atomic preview storage is unavailable'), { status: 503 });
  const headers = { 'Content-Type': 'application/json', 'If-Match': etag };
  const res = await fetch(databaseUrl(env, path), {
    method: 'PUT',
    headers,
    body: JSON.stringify(value)
  });
  if (res.status === 412) return false;
  if (!res.ok) throw Object.assign(new Error('Preview data write failed'), { status: 502 });
  return true;
}

async function appendEvent(env, uid, productId, record, event) {
  const events = Array.isArray(record.events) ? record.events.slice() : [];
  events.push({ ...event, at: new Date().toISOString() });
  record.events = events;
  return record;
}

function isPaidSubscription(sub, now) {
  if (!sub || ['cancelled', 'suspended', 'pending_payment'].includes(String(sub.status || '').toLowerCase())) return false;
  if (sub.plan === 'lifetime') return true;
  const end = Date.parse(sub.endDate || '');
  if (!Number.isFinite(end)) return false;
  const grace = Math.max(0, Number(sub.graceHours) || 72) * 3600000;
  return now <= end + grace;
}

export function hasPaidEntitlement(subscriptions, clientId, productId, now = Date.now()) {
  if (!clientId || !subscriptions || typeof subscriptions !== 'object') return false;
  return Object.values(subscriptions).some(sub =>
    sub && String(sub.clientId || '') === String(clientId) &&
    String(sub.productId || '') === String(productId) &&
    isPaidSubscription(sub, now)
  );
}

export function productAllowsPreview(product) {
  return !!product &&
    product.status !== 'archived' &&
    product.status !== 'draft' &&
    product.previewEnabled === true &&
    product.previewGatewayVerified === true &&
    ['isolated-software', 'digital-sample'].includes(product.previewProfile);
}

async function getProduct(env, productId) {
  const { value } = await readRecord(env, 'viora_data/orgs/viora/products/' + productId);
  if (!value) throw Object.assign(new Error('Product not found'), { status: 404 });
  return value;
}

async function getClientContext(env, uid) {
  const { value } = await readRecord(env, 'viora_data/orgs/viora/portalUsers/' + uid);
  return value && value.active ? value : null;
}

async function getPaidAccess(env, clientId, productId, now) {
  if (!clientId) return false;
  const { value } = await readRecord(env, 'viora_data/orgs/viora/subscriptions');
  return hasPaidEntitlement(value, clientId, productId, now);
}

function paths(uid, productId) {
  return {
    eligibility: ROOT + '/eligibility/' + uid + '/' + productId,
    request: ROOT + '/requests/' + uid + '/' + productId
  };
}

async function mutateEligibility(env, uid, productId, mutator) {
  const path = paths(uid, productId).eligibility;
  for (let attempt = 0; attempt < POLICY.maxEtagRetries; attempt++) {
    const current = await readRecord(env, path, true);
    const record = current.value && typeof current.value === 'object' ? current.value : {};
    const next = await mutator({ ...record });
    if (next === null) return record;
    if (await writeRecord(env, path, next, current.etag)) return next;
  }
  throw Object.assign(new Error('Preview state changed concurrently; retry'), { status: 409 });
}

async function issueSession(env, uid, productId, actor, source = 'self') {
  const now = Date.now();
  const client = await getClientContext(env, uid);
  if (!client) throw Object.assign(new Error('An active VIORA account is required'), { status: 403 });
  if (await getPaidAccess(env, client.clientId, productId, now)) {
    return { paidAccess: true, productId, access: 'paid' };
  }

  const product = await getProduct(env, productId);
  if (!productAllowsPreview(product)) {
    throw Object.assign(new Error('This product is not enabled for controlled previews'), { status: 403 });
  }

  const next = await mutateEligibility(env, uid, productId, async record => {
    const active = record.session;
    if (active && active.status === 'active' && Number(active.expiresAt) > now) {
      return null;
    }
    if (Number(record.nextEligibleAt) > now) {
      throw Object.assign(new Error('Preview cooldown is active'), {
        status: 429,
        nextEligibleAt: Number(record.nextEligibleAt)
      });
    }
    const approvedGrant = record.grant && record.grant.status === 'approved' ? record.grant : null;
    const sessionSource = approvedGrant ? 'admin' : 'self';
    const session = {
      id: crypto.randomUUID(),
      uid,
      productId,
      status: 'active',
      source: sessionSource,
      startedAt: now,
      expiresAt: now + POLICY.durationMs,
      policyVersion: POLICY.version,
      grantedBy: approvedGrant ? approvedGrant.grantedBy : null
    };
    return await appendEvent(env, uid, productId, {
      ...record,
      session,
      ...(approvedGrant ? { grant: { ...approvedGrant, status: 'consumed', consumedAt: now, sessionId: session.id } } : {}),
      nextEligibleAt: now + POLICY.cooldownMs
    }, { type: sessionSource === 'admin' ? 'admin_preview_started' : 'preview_started', sessionId: session.id, actor: session.grantedBy || uid });
  });

  return {
    paidAccess: false,
    productId,
    access: 'preview',
    session: next.session,
    serverTime: Date.now(),
    policy: { durationMs: POLICY.durationMs, cooldownMs: POLICY.cooldownMs, version: POLICY.version }
  };
}

export async function handleMarketplacePreview(request, env, user, route) {
  try {
    const uid = cleanId(user && user.localId, 'authenticated user');
    const method = request.method;
    const url = new URL(request.url);

    if (route === 'status' && method === 'GET') {
      const productId = cleanId(url.searchParams.get('productId'), 'productId');
      const client = await getClientContext(env, uid);
      if (!client) return response({ ok: false, error: 'Active VIORA account required' }, 403);
      if (await getPaidAccess(env, client.clientId, productId, Date.now())) {
        return response({ ok: true, access: 'paid', productId });
      }
      const product = await getProduct(env, productId);
      const { value } = await readRecord(env, paths(uid, productId).eligibility);
      const record = value || {};
      const now = Date.now();
      return response({
        ok: true,
        productId,
        enabled: productAllowsPreview(product),
        activeSession: record.session && record.session.status === 'active' && Number(record.session.expiresAt) > now ? record.session : null,
        approvedGrant: record.grant && record.grant.status === 'approved' ? { grantedAt: record.grant.grantedAt, grantedBy: record.grant.grantedBy } : null,
        eligibleAt: Number(record.nextEligibleAt) || null,
        eligible: !(Number(record.nextEligibleAt) > now),
        policy: { durationMs: POLICY.durationMs, cooldownMs: POLICY.cooldownMs, version: POLICY.version }
      });
    }

    if (route === 'start' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const productId = cleanId(body.productId, 'productId');
      const result = await issueSession(env, uid, productId, uid, 'self');
      return response({ ok: true, ...result });
    }

    if (route === 'request' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const productId = cleanId(body.productId, 'productId');
      const product = await getProduct(env, productId);
      if (!product || product.status === 'archived' || product.status === 'draft') return response({ ok: false, error: 'This product is not currently available' }, 403);
      const client = await getClientContext(env, uid);
      if (!client) return response({ ok: false, error: 'Active VIORA account required' }, 403);
      const path = paths(uid, productId).request;
      const { value, etag } = await readRecord(env, path, true);
      if (value && ['pending', 'approved'].includes(value.status)) return response({ ok: true, request: value, existing: true });
      const record = {
        uid,
        email: user.email || null,
        clientId: client.clientId,
        productId,
        productName: product.name || productId,
        gatewayReady: productAllowsPreview(product),
        status: 'pending',
        requestedAt: new Date().toISOString()
      };
      if (!(await writeRecord(env, path, record, etag))) return response({ ok: false, error: 'Request changed concurrently; retry' }, 409);
      return response({ ok: true, request: record }, 201);
    }

    if (route === 'admin-requests' && method === 'GET') {
      if (String(user.role || '').toLowerCase() !== 'admin') return response({ ok: false, error: 'Admin only' }, 403);
      const { value } = await readRecord(env, ROOT + '/requests');
      const requests = value || {};
      for (const [targetUid, products] of Object.entries(requests)) {
        for (const [productId, requestRecord] of Object.entries(products || {})) {
          if (!requestRecord) continue;
          try {
            const product = await getProduct(env, cleanId(productId, 'productId'));
            requestRecord.gatewayReady = productAllowsPreview(product);
            requestRecord.previewProfile = product.previewProfile || '';
          } catch (_) {
            requestRecord.gatewayReady = false;
            requestRecord.previewProfile = '';
          }
        }
      }
      return response({ ok: true, requests });
    }

    if (route === 'admin-grant' && method === 'POST') {
      if (String(user.role || '').toLowerCase() !== 'admin') return response({ ok: false, error: 'Admin only' }, 403);
      const body = await request.json().catch(() => ({}));
      const targetUid = cleanId(body.uid, 'uid');
      const productId = cleanId(body.productId, 'productId');
      const reqPath = paths(targetUid, productId).request;
      const req = await readRecord(env, reqPath, true);
      if (!req.value || req.value.status !== 'pending') return response({ ok: false, error: 'No pending request for this user and product' }, 404);
      const client = await getClientContext(env, targetUid);
      if (!client) return response({ ok: false, error: 'Target account is not an active VIORA portal user' }, 403);
      if (await getPaidAccess(env, client.clientId, productId, Date.now())) {
        return response({ ok: false, error: 'User already has paid access; no preview grant needed' }, 409);
      }
      const product = await getProduct(env, productId);
      if (!productAllowsPreview(product)) return response({ ok: false, error: 'Product gateway is not verified for previews' }, 403);
      const grant = await mutateEligibility(env, targetUid, productId, async record => {
        if (record.session && record.session.status === 'active' && Number(record.session.expiresAt) > Date.now()) {
          throw Object.assign(new Error('User already has an active preview'), { status: 409 });
        }
        if (Number(record.nextEligibleAt) > Date.now()) {
          throw Object.assign(new Error('User is still within the seven-day cooldown'), { status: 429, nextEligibleAt: Number(record.nextEligibleAt) });
        }
        const approved = { id: crypto.randomUUID(), status: 'approved', grantedAt: Date.now(), grantedBy: uid, productId };
        return await appendEvent(env, targetUid, productId, { ...record, grant: approved }, { type: 'preview_granted', grantId: approved.id, actor: uid });
      });
      const updatedRequest = { ...req.value, status: 'approved', reviewedAt: new Date().toISOString(), reviewedBy: uid, grantId: grant.grant.id };
      if (!(await writeRecord(env, reqPath, updatedRequest, req.etag))) {
        return response({ ok: false, error: 'Request changed concurrently; approved grant is recorded and can be used by the account' }, 409);
      }
      return response({ ok: true, grant: grant.grant, policy: { durationMs: POLICY.durationMs, cooldownMs: POLICY.cooldownMs, version: POLICY.version } });
    }

    if (route === 'admin-revoke' && method === 'POST') {
      if (String(user.role || '').toLowerCase() !== 'admin') return response({ ok: false, error: 'Admin only' }, 403);
      const body = await request.json().catch(() => ({}));
      const targetUid = cleanId(body.uid, 'uid');
      const productId = cleanId(body.productId, 'productId');
      const result = await mutateEligibility(env, targetUid, productId, async record => {
        const now = Date.now();
        let changed = false;
        const next = { ...record };
        if (next.session && next.session.status === 'active') {
          next.session = { ...next.session, status: 'revoked', revokedAt: now, revokedBy: uid };
          changed = true;
        }
        if (next.grant && next.grant.status === 'approved') {
          next.grant = { ...next.grant, status: 'revoked', revokedAt: now, revokedBy: uid };
          changed = true;
        }
        if (!changed) return null;
        return await appendEvent(env, targetUid, productId, next, { type: 'preview_access_revoked', actor: uid });
      });
      return response({ ok: true, session: result.session || null });
    }

    if (route === 'validate' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const productId = cleanId(body.productId, 'productId');
      const sessionId = cleanId(body.sessionId, 'sessionId');
      const client = await getClientContext(env, uid);
      if (!client) return response({ ok: false, allowed: false }, 403);
      if (await getPaidAccess(env, client.clientId, productId, Date.now())) {
        return response({ ok: true, allowed: true, access: 'paid' });
      }
      const { value } = await readRecord(env, paths(uid, productId).eligibility);
      const session = value && value.session;
      const allowed = !!session && session.id === sessionId && session.status === 'active' && Number(session.expiresAt) > Date.now();
      return response({ ok: true, allowed, access: allowed ? 'preview' : 'none', expiresAt: allowed ? session.expiresAt : null }, allowed ? 200 : 403);
    }

    if (route === 'end' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const productId = cleanId(body.productId, 'productId');
      const sessionId = cleanId(body.sessionId, 'sessionId');
      const result = await mutateEligibility(env, uid, productId, async record => {
        if (!record.session || record.session.id !== sessionId || record.session.status !== 'active') return null;
        return await appendEvent(env, uid, productId, {
          ...record,
          session: { ...record.session, status: 'ended', endedAt: Date.now() }
        }, { type: 'preview_ended', sessionId });
      });
      return response({ ok: true, session: result.session || null, cooldownUntil: result.nextEligibleAt || null });
    }

    return response({ ok: false, error: 'Method not allowed' }, 405);
  } catch (error) {
    const status = Number(error && error.status) || 500;
    return response({
      ok: false,
      error: status >= 500 ? 'Preview service unavailable' : error.message,
      ...(error && error.nextEligibleAt ? { nextEligibleAt: error.nextEligibleAt } : {})
    }, status);
  }
}

export const previewPolicy = POLICY;
