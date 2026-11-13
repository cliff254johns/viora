# VIORA Outreach controlled release

## Scope
This release branch is based directly on `main` and deliberately excludes the divergent global-sales-engine feature branch. It contains only:
- structured per-recipient Outreach activity written to the linked CRM lead during queue, send, success, and failure states;
- independent scheduled-job execution so a failed reminder/social task does not prevent other scheduled work;
- an explicit `ENABLE_OUTREACH_EMAIL_AUTOMATION=true` Worker environment opt-in for email inbox sync and campaign scheduling. If unset or any value other than `true`, those email scheduled jobs do not run;
- CI checks for the above behaviour plus repository contract, unit, and available integration tests.

## CRM capture model
Each send attempt receives a unique email activity ID and batch/campaign ID. The lead stores a compact `lastOutreach` snapshot and an `outreachHistory/{emailActivityId}` record containing the recipient, organisation, contact, category, country, website, lead source, subject, sender, communication-log reference, and status timestamps. Successful sends also store provider message and thread identifiers, update `lastContactedAt`, and move a New lead to Contacted. Failed sends remain visible as failed activity and do not mark the lead as contacted. The full message body remains in the email ledger and Communications log, not duplicated into the lead record.

## Release safety
- Keep `keep_vars = true` in Wrangler configuration so a code upload does not overwrite dashboard-managed production variables; secrets are preserved by Cloudflare deployments when omitted from the upload.
- Keep `ENABLE_OUTREACH_EMAIL_AUTOMATION` unset/false and `ENABLE_OUTREACH_EMAIL_SENDING` unset/false in production during the controlled API release. The first flag gates scheduled email jobs; the second separately gates the authenticated direct Gmail send route.
- Do not change the existing cron schedule.
- Verify the social queue preparation and social publishing jobs independently.
- Run authenticated health, social queue, and publishing checks using a non-customer test post/account where supported.
- Confirm the live Worker version and rollback version before promoting traffic.
- Do not enable campaign sending or auto-replies as part of this release.
- Keep the separate global-sales-engine PR draft and its legal/compliance gates out of this release until separately reviewed.

## Promotion gates
1. PR CI green, including `npm test` and `npm run test:integration`.
2. Review the diff and confirm the branch is based on the current `main`.
3. Deploy to a non-production Worker environment first, or use a Worker version preview if available.
4. Verify health and social publishing without enabling email automation.
5. Verify email campaign settings remain outbound-off and the email cron opt-in remains absent/false.
6. Promote only after the checks are recorded; retain the previous Worker version for rollback.

A passing static or emulator test is not proof of live provider delivery. Production social publishing must be explicitly tested against a controlled test destination.

## Social publishing idempotency and connection verification
- Scheduled campaign posts are claimed at the individual campaign node using Firebase Realtime Database ETags (X-Firebase-ETag + conditional If-Match PUT). Concurrent scheduler invocations cannot both claim the same scheduled post.
- A claim is durably written before any provider call and includes a unique claim ID, attempt count, and timestamp. Final status writes are also conditional and verify the same claim ID.
- An expired publishing claim is changed to publish_uncertain; it is never automatically retried. Network/ambiguous provider results also become publish_uncertain and require human reconciliation. Confirmed provider acceptance becomes published; explicit rejection becomes failed.
- The authenticated POST /social/config/status endpoint tests configured provider credentials without returning secret values. Campaigns account cards now display live Worker API verification, not a manually checked API-connected flag. Editing an account resets its API verification until rechecked.
- Meta Graph API requests use v27.0. As of 13 November 2026, Meta's developer documentation identifies v27.0 as the latest Graph API version. The Worker currently supports Facebook Page auto-publishing only; Instagram and TikTok are not direct publishers in this implementation. TikTok OAuth is currently used for account/statistics access only.
- Current Cloudflare binding inventory: YouTube Data API key is present; a generic TIKTOK_API_KEY is present but the Worker requires TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET for TikTok OAuth; Facebook Page token/ID and Instagram Business user ID/access token bindings are absent. A configured secret binding is not proof that a provider accepts it; the new endpoint performs runtime verification after it is deployed.
- No provider publish test is run as part of CI. A real test must use an isolated, non-customer test Page and a pre-approved test message after the candidate version is deployed and credentials pass the status endpoint.