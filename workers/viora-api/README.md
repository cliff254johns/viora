# VIORA API Worker

## Source baseline

`index.js` is the recovered active Cloudflare Worker source, maintained in Git at `workers/viora-api/index.js`. The snapshot was initially retrieved from the live `viora-api` Worker and committed so production code is not represented only by an editable Cloudflare dashboard deployment.

## Gmail integration implementation

The Git source now includes:

- Admin/exec-authenticated `POST /gmail/oauth/start` with cryptographically random, ten-minute, one-use OAuth state.
- Public `GET /gmail/oauth/callback` with Firebase ETag-guarded state consumption.
- Exact mailbox identity restriction to `cliff254johns@gmail.com`.
- AES-256-GCM encrypted refresh-token persistence in Firebase Realtime Database using the Worker secret `GOOGLE_TOKEN_ENCRYPTION_KEY`.
- Gmail API token refresh and send support.
- Gmail inbox metadata retrieval through `GET /gmail/replies`.
- Automatic creation/lookup of the `VIORA Outreach` Gmail label and application to each successfully sent Gmail thread.
- Admin/exec-authenticated `POST /gmail/label-thread` to label only reply threads that Outreach has matched to a saved, previously contacted lead.
- Admin/exec-only `GET /gmail/status`.
- Outreach UI controls to connect Gmail, check connection status, and import recent incoming messages into the Outreach email timeline.
- `POST /sendEmail` now sends only through the authenticated `cliff254johns@gmail.com` Gmail mailbox. If Gmail is not connected, sending stops with a clear error; it does not fall back to Resend. This is intentional because a consumer Gmail address is not a verified Resend sending domain. The configured sender identity is `VIORA <cliff254johns@gmail.com>`. A failed Gmail send is never retried through another provider, preventing duplicate sends.

The OAuth flow requests `gmail.send`, `gmail.metadata`, and `gmail.modify`. Reply sync reads sender/recipient/subject/date/thread headers only; it does not download or store message bodies. `gmail.modify` is required to apply the dedicated `VIORA Outreach` label to sent conversations and matched replies. It grants broader mailbox modification capability than metadata-only access, so keep it limited to this dedicated VIORA mailbox and disclose it clearly in the OAuth consent screen. Google classifies Gmail scopes as sensitive/restricted; restricted-scope server use may require OAuth verification and an independent security assessment before general production use. See [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) and [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification). Testing-mode users must be configured in the Google consent screen.

## Current deployment status

**The Gmail implementation is committed to Git but is not yet deployed to the production Worker.** The new GitHub Actions syntax/contract workflow passed for the implementation commit. The active Cloudflare Worker remains on the previously deployed version until a deliberate, reviewed deployment is made. A manual GitHub Actions deployment workflow and Wrangler configuration are now included; they do not deploy automatically on every commit.

Do not describe Gmail as connected or operational until all of the following have passed against the deployed Worker:

1. The OAuth start route returns a Google authorization URL to an authenticated admin/exec user.
2. The Google callback validates the one-time state, exact redirect URI, and verified mailbox identity.
3. The refresh token is persisted only as AES-256-GCM ciphertext.
4. `GET /gmail/status` reports the expected mailbox.
5. A user-approved test email to the owner's own address is accepted by Gmail.
6. A reply to that test email is retrieved, appears in the Outreach timeline, and the Gmail conversation receives the `VIORA Outreach` label.
7. Existing critical Worker routes and Resend fallback remain healthy.

## Google Cloud Console configuration

Expected OAuth redirect URI:

`https://viora-api.cliff254johns.workers.dev/gmail/oauth/callback`

The redirect URI must match exactly in the Google Cloud OAuth Web application and the Worker.

Enable the Gmail API in the Google Cloud project. Configure the OAuth consent screen with the correct app name, support email, authorised domains, privacy policy, terms URL, publishing/testing status, test-user list and both requested scopes. An external OAuth app left in Testing issues seven-day refresh tokens for these non-basic scopes; a long-running production connection therefore needs the appropriate production publishing/verification path. See [Google OAuth refresh-token rules](https://developers.google.com/identity/protocols/oauth2).

## Cloudflare secrets

The following Worker secrets were confirmed present in Cloudflare settings at the time of implementation:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `FIREBASE_DATABASE_SECRET`

Secret values are not readable through settings and must never be committed to Git or pasted into chat.

## Publishing the reviewed Worker

The repository includes `.github/workflows/deploy-viora-api.yml` and `workers/viora-api/wrangler.toml`. The deployment workflow is manual and requires the exact confirmation word `DEPLOY`.

Before running it, add these GitHub repository Actions secrets under Settings → Secrets and variables → Actions:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with Account → Workers Scripts → Edit permission for the VIORA account.
- `CLOUDFLARE_ACCOUNT_ID`: the VIORA Cloudflare account ID.

The Wrangler configuration declares the existing AI binding and the Worker’s plain-text variables. Existing Cloudflare secret values are not stored in Git. After deployment, verify that all expected secrets remain bound before testing the routes.

## Deployment discipline

- Preserve all existing Worker bindings and routes when publishing a new version.
- Review the complete diff and CI results before deployment.
- Deploy a candidate, verify health and existing critical routes, then test Gmail end-to-end.
- Keep Resend secrets available for any separate, domain-authenticated transactional service, but do not use Resend as an Outreach fallback for the Gmail sender identity.
- Do not send prospect campaigns without explicit human review and approval.


## Marketplace controlled preview service (draft)

The Worker source now includes a server-side preview policy module at `marketplace-preview.js` and authenticated routes:

- `GET /marketplace/preview/status?productId=...`
- `POST /marketplace/preview/request`
- `POST /marketplace/preview/start`
- `POST /marketplace/preview/validate`
- `POST /marketplace/preview/end`
- `GET /marketplace/preview/requests` (admin only)
- `POST /marketplace/preview/grant` (admin only)
- `POST /marketplace/preview/revoke` (admin only)

Policy:
- 15 minutes from the user's actual session start, not from the time an administrator approves a request.
- Seven-day cooldown per Firebase account and product. Ending early or revoking does not reset it.
- Session and cooldown transitions use Firebase RTDB ETag conditional writes to prevent concurrent start requests from creating multiple sessions.
- The Worker derives the user ID from the verified Firebase ID token and maps the account to an active VIORA portal client.
- Active/lifetime paid entitlements and the existing grace window take precedence. Preview logic never writes to subscription or license records.
- An administrator grant is an approval record; the user starts the timed preview later.
- A product is eligible only when it is active, has `previewEnabled: true`, uses an approved `previewProfile`, and has `previewGatewayVerified: true`. The verification flag is intentionally not exposed in the ordinary product editor; it must only be set after the product's delivery gateway has passed its own acceptance checks.

Data is kept under `viora_data/orgs/viora/marketplacePreview`, separate from subscription and licence records. The browser cannot choose the authenticated UID, session timestamps, expiry or cooldown values.

### Release gate — not production-ready

This change is still a draft. It adds the session policy/API and Marketplace/admin request UI, and removes the old direct external preview links from the public Marketplace and home showcase. It does **not** yet make arbitrary external product applications secure. Each previewable software product must enforce the session-validation decision at its own protected API/data boundary and serve isolated demo data; digital products must deliver a controlled sample rather than a public unrestricted download. Until that product-specific delivery integration and the full acceptance suite pass, `previewGatewayVerified` must remain false and no product may be activated.

Firebase rules are unchanged. No production Worker deployment or product activation has been performed.
