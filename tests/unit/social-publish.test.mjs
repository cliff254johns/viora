import test from 'node:test';
import assert from 'node:assert/strict';
import { claimScheduledCampaignPost, persistCampaignPublishOutcome } from '../../workers/viora-api/social-publish.js';

function makeRtdb(initialCampaign, { barrierReads = 0 } = {}) {
  let campaign = structuredClone(initialCampaign);
  let etagNumber = 1;
  let initialReadCount = 0;
  let releaseBarrier;
  const barrier = new Promise(resolve => { releaseBarrier = resolve; });
  const fetchImpl = async (_url, options = {}) => {
    if (!options.method || options.method === 'GET') {
      const snapshot = structuredClone(campaign);
      const readEtag = '"v' + etagNumber + '"';
      if (initialReadCount < barrierReads) {
        initialReadCount++;
        if (initialReadCount === barrierReads) releaseBarrier();
        await barrier;
      }
      return {
        ok: true,
        status: 200,
        headers: { get: name => name === 'ETag' ? readEtag : null },
        json: async () => snapshot,
      };
    }
    if (options.method === 'PUT') {
      if (options.headers?.['If-Match'] !== '"v' + etagNumber + '"') {
        return { ok: false, status: 412 };
      }
      campaign = JSON.parse(options.body);
      etagNumber++;
      return { ok: true, status: 200 };
    }
    throw new Error('Unexpected mock method: ' + options.method);
  };
  return { fetchImpl, getCampaign: () => structuredClone(campaign) };
}

const now = Date.now();
const scheduledCampaign = () => ({
  posts: [{ id: 'post-1', status: 'scheduled', scheduledForUtc: new Date(now - 1000).toISOString() }],
});

test('concurrent cron claims use ETags so only one worker claims a scheduled post', async () => {
  const db = makeRtdb(scheduledCampaign(), { barrierReads: 2 });
  let id = 0;
  const makeId = () => 'claim-' + (++id);
  const results = await Promise.all([
    claimScheduledCampaignPost('https://db.test/campaign.json', 'post-1', now, 300000, db.fetchImpl, makeId),
    claimScheduledCampaignPost('https://db.test/campaign.json', 'post-1', now, 300000, db.fetchImpl, makeId),
  ]);
  assert.equal(results.filter(result => result.claimed).length, 1);
  assert.equal(results.filter(result => result.reason === 'already_claimed').length, 1);
  assert.equal(db.getCampaign().posts[0].status, 'publishing');
  assert.equal(db.getCampaign().posts[0].publishOutcome, 'in_flight');
});

test('a stale in-flight publish becomes uncertain and is never auto-retried', async () => {
  const campaign = { posts: [{
    id: 'post-1', status: 'publishing',
    publishAttemptedAt: new Date(now - 6 * 60 * 1000).toISOString(),
    publishClaimId: 'old-claim',
  }] };
  const db = makeRtdb(campaign);
  const result = await claimScheduledCampaignPost('https://db.test/campaign.json', 'post-1', now, 300000, db.fetchImpl, () => 'new-claim');
  assert.deepEqual(result, { claimed: false, reason: 'marked_uncertain' });
  const post = db.getCampaign().posts[0];
  assert.equal(post.status, 'publish_uncertain');
  assert.equal(post.publishOutcome, 'unknown');
  assert.equal(post.reconciliationRequired, true);
  assert.match(post.lastError, /automatic retry blocked/);
});

test('confirmed provider response persists the published ID and timestamp', async () => {
  const campaign = { posts: [{ id: 'post-1', status: 'publishing', publishClaimId: 'claim-1' }] };
  const db = makeRtdb(campaign);
  const result = await persistCampaignPublishOutcome('https://db.test/campaign.json', 'post-1', 'claim-1', { ok: true, mode: 'auto', postId: 'fb-post-9' }, db.fetchImpl);
  const post = db.getCampaign().posts[0];
  assert.equal(result.status, 'published');
  assert.equal(post.status, 'published');
  assert.equal(post.externalId, 'fb-post-9');
  assert.equal(post.publishOutcome, 'confirmed');
  assert.equal(post.reconciliationRequired, false);
});

test('ambiguous provider response is persisted as uncertain without retry', async () => {
  const campaign = { posts: [{ id: 'post-1', status: 'publishing', publishClaimId: 'claim-1' }] };
  const db = makeRtdb(campaign);
  const result = await persistCampaignPublishOutcome('https://db.test/campaign.json', 'post-1', 'claim-1', { ok: false, uncertain: true, error: 'timeout after request' }, db.fetchImpl);
  const post = db.getCampaign().posts[0];
  assert.equal(result.status, 'publish_uncertain');
  assert.equal(post.status, 'publish_uncertain');
  assert.equal(post.publishOutcome, 'unknown');
  assert.equal(post.reconciliationRequired, true);
});

test('compose-link outcomes remain manual rather than falsely marked published', async () => {
  const campaign = { posts: [{ id: 'post-1', status: 'publishing', publishClaimId: 'claim-1' }] };
  const db = makeRtdb(campaign);
  const result = await persistCampaignPublishOutcome('https://db.test/campaign.json', 'post-1', 'claim-1', { ok: true, mode: 'compose-link', fallbackUrl: 'https://www.facebook.com/' }, db.fetchImpl);
  const post = db.getCampaign().posts[0];
  assert.equal(result.status, 'compose-only');
  assert.equal(post.status, 'compose-only');
  assert.equal(post.publishOutcome, 'manual_action_required');
  assert.equal(post.reconciliationRequired, false);
});
