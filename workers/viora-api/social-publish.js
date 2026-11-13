async function readCampaignWithEtag(campaignUrl, fetchImpl = fetch) {
  const response = await fetchImpl(campaignUrl, { headers: { 'X-Firebase-ETag': 'true' } });
  if (!response.ok) throw new Error(`Campaign read failed: ${response.status}`);
  const etag = response.headers.get('ETag');
  if (!etag) throw new Error('Firebase did not return an ETag; refusing non-atomic publish claim');
  return { campaign: (await response.json()) || {}, etag };
}

async function conditionalWriteCampaign(campaignUrl, campaign, etag, fetchImpl = fetch) {
  return fetchImpl(campaignUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': etag },
    body: JSON.stringify(campaign),
  });
}

/* Claim one scheduled post using Firebase RTDB conditional PUT.
   Only one concurrent scheduler can win the ETag compare-and-swap. */
export async function claimScheduledCampaignPost(campaignUrl, postId, now, staleTimeoutMs = 5 * 60 * 1000, fetchImpl = fetch, makeId = () => crypto.randomUUID()) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { campaign, etag } = await readCampaignWithEtag(campaignUrl, fetchImpl);
    const post = Array.isArray(campaign.posts) ? campaign.posts.find(item => item && item.id === postId) : null;
    if (!post) return { claimed: false, reason: 'missing' };

    if (post.status === 'publishing') {
      const attempted = Date.parse(post.publishAttemptedAt || post.publishClaimedAt || '');
      if (Number.isFinite(attempted) && now - attempted > staleTimeoutMs) {
        post.status = 'publish_uncertain';
        post.publishOutcome = 'unknown';
        post.publishUncertainAt = new Date(now).toISOString();
        post.reconciliationRequired = true;
        post.lastError = 'Previous publish claim expired. Provider acceptance cannot be ruled out; automatic retry blocked.';
        const staleWrite = await conditionalWriteCampaign(campaignUrl, campaign, etag, fetchImpl);
        if (staleWrite.status === 412) continue;
        if (!staleWrite.ok) throw new Error(`Could not persist stale publish uncertainty: ${staleWrite.status}`);
        return { claimed: false, reason: 'marked_uncertain' };
      }
      return { claimed: false, reason: 'already_claimed' };
    }

    if (post.status !== 'scheduled') return { claimed: false, reason: post.status || 'not_scheduled' };
    const scheduledAt = Date.parse(post.scheduledForUtc || post.scheduledFor || '');
    if (!Number.isFinite(scheduledAt) || scheduledAt > now) return { claimed: false, reason: 'not_due' };

    const claimId = makeId();
    post.status = 'publishing';
    post.publishClaimId = claimId;
    post.publishClaimedAt = new Date(now).toISOString();
    post.publishAttemptedAt = post.publishClaimedAt;
    post.publishAttempts = (Number(post.publishAttempts) || 0) + 1;
    post.publishOutcome = 'in_flight';
    post.reconciliationRequired = false;
    post.updatedAt = post.publishClaimedAt;

    const claimWrite = await conditionalWriteCampaign(campaignUrl, campaign, etag, fetchImpl);
    if (claimWrite.status === 412) continue;
    if (!claimWrite.ok) throw new Error(`Could not persist publish claim: ${claimWrite.status}`);
    return { claimed: true, claimId, post: { ...post } };
  }
  return { claimed: false, reason: 'claim_conflict' };
}

/* Final state writes also use ETags so they cannot overwrite concurrent campaign edits. */
export async function persistCampaignPublishOutcome(campaignUrl, postId, claimId, result, fetchImpl = fetch) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { campaign, etag } = await readCampaignWithEtag(campaignUrl, fetchImpl);
    const post = Array.isArray(campaign.posts) ? campaign.posts.find(item => item && item.id === postId) : null;
    if (!post || post.publishClaimId !== claimId) {
      return { saved: false, reason: 'claim_mismatch' };
    }

    const completedAt = new Date().toISOString();
    if (result && result.ok && result.mode === 'auto') {
      post.status = 'published';
      post.publishedAt = completedAt;
      post.externalId = result.postId || null;
      post.composeUrl = null;
      post.lastError = null;
      post.publishOutcome = 'confirmed';
      post.reconciliationRequired = false;
    } else if (result && result.ok && result.mode === 'compose-link') {
      post.status = 'compose-only';
      post.composeUrl = result.fallbackUrl || null;
      post.lastError = null;
      post.publishOutcome = 'manual_action_required';
      post.reconciliationRequired = false;
    } else if (result && result.uncertain) {
      post.status = 'publish_uncertain';
      post.publishOutcome = 'unknown';
      post.publishUncertainAt = completedAt;
      post.lastError = result.error || 'Provider response was ambiguous; automatic retry blocked.';
      post.reconciliationRequired = true;
    } else {
      post.status = 'failed';
      post.publishOutcome = 'rejected';
      post.lastError = (result && result.error) || 'Provider rejected the publish request';
      post.failedAt = completedAt;
      post.reconciliationRequired = false;
    }
    post.publishCompletedAt = completedAt;
    post.updatedAt = completedAt;

    const write = await conditionalWriteCampaign(campaignUrl, campaign, etag, fetchImpl);
    if (write.status === 412) continue;
    if (!write.ok) throw new Error(`Could not persist publish outcome: ${write.status}`);
    return { saved: true, status: post.status };
  }
  return { saved: false, reason: 'outcome_write_conflict' };
}

