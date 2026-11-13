import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPaidEntitlement, productAllowsPreview, previewPolicy } from '../../workers/viora-api/marketplace-preview.js';

test('preview policy is fixed at 15 minutes with a seven-day cooldown', () => {
  assert.equal(previewPolicy.durationMs, 15 * 60 * 1000);
  assert.equal(previewPolicy.cooldownMs, 7 * 24 * 60 * 60 * 1000);
});

test('only active, explicitly configured product previews are eligible', () => {
  assert.equal(productAllowsPreview({ status: 'active', previewEnabled: true, previewProfile: 'isolated-software' }), true);
  assert.equal(productAllowsPreview({ status: 'active', previewEnabled: true, previewProfile: 'digital-sample' }), true);
  assert.equal(productAllowsPreview({ status: 'active', previewEnabled: true, previewProfile: 'external-url' }), false);
  assert.equal(productAllowsPreview({ status: 'active', previewEnabled: false, previewProfile: 'digital-sample' }), false);
  assert.equal(productAllowsPreview({ status: 'draft', previewEnabled: true, previewProfile: 'digital-sample' }), false);
  assert.equal(productAllowsPreview({ status: 'archived', previewEnabled: true, previewProfile: 'isolated-software' }), false);
});

test('paid entitlement is scoped to matching client and product', () => {
  const now = Date.parse('2026-11-13T12:00:00Z');
  const rows = {
    active: { clientId: 'client-a', productId: 'app-a', status: 'active', endDate: '2026-11-20T12:00:00Z' },
    otherProduct: { clientId: 'client-a', productId: 'app-b', status: 'active', endDate: '2026-11-20T12:00:00Z' },
    otherClient: { clientId: 'client-b', productId: 'app-a', status: 'active', endDate: '2026-11-20T12:00:00Z' }
  };
  assert.equal(hasPaidEntitlement(rows, 'client-a', 'app-a', now), true);
  assert.equal(hasPaidEntitlement(rows, 'client-a', 'app-b', now), true);
  assert.equal(hasPaidEntitlement(rows, 'client-b', 'app-a', now), true);
  assert.equal(hasPaidEntitlement(rows, 'client-a', 'missing', now), false);
});

test('cancelled, suspended and pending subscriptions never grant paid access', () => {
  const now = Date.parse('2026-11-13T12:00:00Z');
  for (const status of ['cancelled', 'suspended', 'pending_payment']) {
    assert.equal(hasPaidEntitlement({ x: { clientId: 'c', productId: 'p', status, plan: 'lifetime' } }, 'c', 'p', now), false);
  }
});

test('paid subscription grace period is preserved', () => {
  const now = Date.parse('2026-11-13T12:00:00Z');
  const sub = { clientId: 'c', productId: 'p', status: 'active', endDate: '2026-11-12T12:00:00Z', graceHours: 72 };
  assert.equal(hasPaidEntitlement({ x: sub }, 'c', 'p', now), true);
  assert.equal(hasPaidEntitlement({ x: { ...sub, graceHours: 1 } }, 'c', 'p', now), false);
});

test('lifetime subscription remains valid without an end date', () => {
  assert.equal(hasPaidEntitlement({ x: { clientId: 'c', productId: 'p', status: 'active', plan: 'lifetime' } }, 'c', 'p'), true);
});
