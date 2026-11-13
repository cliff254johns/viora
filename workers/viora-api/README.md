# VIORA API Worker

## Source baseline

`index.js` is a source snapshot retrieved from the active Cloudflare Worker `viora-api` on 2026-11-13. It was committed to Git so production Worker code is no longer represented only by an editable Cloudflare dashboard deployment.

This snapshot is **not a new deployment**. The active Worker remains the existing Cloudflare deployment until a reviewed, tested release is deliberately published.

## Current email transport

The deployed `POST /sendEmail` route uses Resend and requires `RESEND_API_KEY` and `RESEND_FROM`. Keep this transport available as a fallback until Gmail OAuth sending and reply retrieval have passed end-to-end tests.

## Gmail integration status

Google OAuth credentials are configured as Cloudflare Worker secrets according to the current account settings:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

The current deployed Worker snapshot does not implement Gmail OAuth start/callback routes, Gmail API send, Gmail inbox/thread retrieval, or encrypted Google refresh-token storage. The missing `GOOGLE_TOKEN_ENCRYPTION_KEY` must be provisioned before encrypted token persistence is enabled.

Expected Google OAuth redirect URI:

`https://viora-api.cliff254johns.workers.dev/gmail/oauth/callback`

The redirect URI must match exactly in Google Cloud Console and in the Worker.

## Required implementation before enabling Gmail

1. Add an authenticated, admin/exec-only OAuth start route.
2. Generate and validate a cryptographically random, one-time OAuth `state` value; reject missing, expired, replayed, or mismatched state.
3. Add a public callback route that exchanges the authorization code server-side.
4. Verify the returned Google identity is `cliff254johns@gmail.com` before accepting mailbox tokens.
5. Request offline access and persist the refresh token encrypted with AES-GCM using a dedicated 256-bit Cloudflare secret named `GOOGLE_TOKEN_ENCRYPTION_KEY`.
6. Never log authorization codes, access tokens, refresh tokens, or full message bodies.
7. Add token refresh and Gmail API send using the minimum `gmail.send` scope.
8. Add incoming reply/thread retrieval only if the required additional Gmail read scope has been approved and verified. Do not request broad mailbox access by default.
9. Record message IDs, thread IDs, timestamps, recipients, transport, and delivery outcome in the existing VIORA communication log without copying sensitive message content.
10. Keep Resend fallback until a test message to the owner's mailbox and a reply/thread retrieval test both pass.
11. Test authorization denial, expired state, replayed state, wrong Google account, token refresh failure, Gmail send failure, and role restrictions before production rollout.

## Google Cloud Console actions

- Configure the exact redirect URI above for the OAuth Web application client.
- Configure the OAuth consent screen with the correct app name, support email, authorised domains, privacy policy, and terms URL.
- Confirm the app's publishing/testing status and the current test-user list. Google OAuth testing-mode refresh tokens can expire; verify the current Google policy and consent-screen status before relying on a long-lived connection.
- Start with `gmail.send`. Add a read scope only after confirming the reply-monitoring requirement and the scope's current verification requirements.

## Deployment discipline

- Do not deploy this snapshot solely because it has been committed.
- Preserve the full Worker source and all current bindings when uploading a new version.
- Review the diff, run syntax and route tests, deploy a candidate, verify health and existing critical routes, then test Gmail end-to-end.
- Do not remove Resend secrets or fallback code until Gmail is stable.
