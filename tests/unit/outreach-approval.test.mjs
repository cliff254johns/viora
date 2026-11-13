import test from 'node:test';
import assert from 'node:assert/strict';
import { outreachApprovalDigest } from '../../workers/viora-api/index.js';

const context = {
  leadId: 'lead_123', recipient: 'sales@example.com', organisation: 'Example Ltd',
  countryCode: 'GB', policyVersion: '2026-11-v1'
};

test('approval digest is deterministic for the same exact recipient and message', async () => {
  const a = await outreachApprovalDigest('A subject', 'A message', [], context);
  const b = await outreachApprovalDigest('A subject', 'A message', [], context);
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
});

test('approval digest changes when recipient identity changes', async () => {
  const baseline = await outreachApprovalDigest('A subject', 'A message', [], context);
  for (const changed of [
    { ...context, leadId: 'lead_456' },
    { ...context, recipient: 'other@example.com' },
    { ...context, organisation: 'Other Ltd' },
    { ...context, countryCode: 'US' },
    { ...context, policyVersion: '2026-12-v1' },
  ]) {
    assert.notEqual(await outreachApprovalDigest('A subject', 'A message', [], changed), baseline);
  }
});

test('approval digest changes when any approved message component changes', async () => {
  const baseline = await outreachApprovalDigest('A subject', 'A message', [], context);
  assert.notEqual(await outreachApprovalDigest('Changed subject', 'A message', [], context), baseline);
  assert.notEqual(await outreachApprovalDigest('A subject', 'Changed message', [], context), baseline);
  assert.notEqual(await outreachApprovalDigest('A subject', 'A message', [{ subject: 'Follow up', text: 'Follow-up message' }], context), baseline);
});
