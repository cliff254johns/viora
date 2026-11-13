# Marketplace preview gateway integration contract

This contract is the server-side boundary for every VIORA Marketplace product that offers a controlled preview.

## Mandatory authorization

The request must first pass the existing VIORA API Worker Firebase ID-token middleware. Use the authenticated UID from that middleware; never accept a UID or role supplied by the browser.

A product API handler must call the shared authorizer before returning any product data or accepting any mutation:

```js
import { authorizeMarketplacePreview } from './marketplace-preview.js';

const access = await authorizeMarketplacePreview(
  env,
  authenticatedUser.localId,
  PRODUCT_ID,
  requestBody.sessionId
);

if (!access.allowed) {
  return Response.json({ ok: false, error: 'Preview access denied' }, { status: 403 });
}
```

The example is a contract, not a complete product handler. `authenticatedUser` must be the identity already verified by the Worker router. Never trust a browser-provided UID.

The authorizer checks:
- active VIORA portal-user mapping;
- a matching paid subscription (paid access takes precedence); or
- an active, unexpired preview session for the same authenticated UID and product;
- product status, preview enablement, trusted gateway-verification flag and allowed delivery profile.

It fails closed if Firebase state cannot be read.

## Controlled API candidate environment

The Worker supports a read-only candidate mode through `VIORA_STAGING_READ_ONLY=true`. In this mode, only `GET /health` and the authenticated `GET /marketplace/preview/gateways` route are allowed; all mutation and unrelated routes are denied before their handlers run.

The candidate must be configured with a dedicated staging Firebase RTDB URL and a staging-only database credential. If the staging URL is missing or points at the production RTDB default, the preview data adapter fails closed with HTTP 503 rather than falling back to production. Do not copy production database secrets or point a staging Worker at production customer, subscription, or licence records.

## Admin product gateway inventory

An admin-only inventory is available at `GET /marketplace/preview/gateways`. It reads the live Marketplace product catalogue from the Worker's configured Firebase RTDB and returns only safe metadata: product ID, name, category, status, preview profile, preview flags and machine-readable blocking reasons. It deliberately omits delivery URLs and storage locations. The endpoint is an audit aid, not proof that a product gateway is implemented; `previewGatewayVerified` remains a trusted release flag that must only be set after the per-product acceptance evidence below is reviewed.

## Software products — `isolated-software`

Before enabling a software product:
1. Provision a dedicated preview tenant/database namespace, separate from every customer's production tenant.
2. Seed synthetic demo records only. Never copy live customer data into the preview tenant.
3. Resolve every read and write to that preview tenant while preview access is active.
4. Deny cross-tenant identifiers, production exports, payment settlement, external notifications and integrations that could affect real customers.
5. Ensure every API endpoint that reads or mutates product data calls the authorizer (or a wrapper around it).
6. End or revoke access immediately when the session is invalid; clean/reset demo state independently of production data.

A front-end route guard alone is not a security boundary.

## Digital products — `digital-sample`

Before enabling a digital product:
1. Store a separate, explicitly approved sample rendition.
2. Serve only that sample through a protected endpoint after authorization.
3. Keep original downloads, source files, full-resolution assets and paid deliverables outside the preview route.
4. Do not return public storage URLs or long-lived signed URLs that outlive the preview session.
5. Re-check access on each protected download/read, and log access without logging file contents or credentials.

## Release evidence required per product

The product must have a named gateway owner and automated tests for:
- unauthenticated and wrong-user denial;
- wrong-product and expired-session denial;
- immediate revocation;
- paid entitlement still working;
- isolated demo data (including attempted cross-tenant reads/writes);
- prohibited external side effects;
- only sample assets exposed for digital products;
- direct asset/API URL access without a valid session.

Only after the evidence is reviewed may the trusted `previewGatewayVerified` flag be set. Selecting a profile or enabling the UI checkbox is not verification.

## Operational rule

A request or admin grant does not make an unprotected product safe. The preview request queue may accept requests while a gateway is being built, but grants and session starts must remain blocked until the product's real delivery gateway has passed its acceptance tests. Never fall back to `liveUrl`, `previewUrl`, arbitrary external embeds or public file links.
