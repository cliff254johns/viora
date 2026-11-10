# VIORA non-API core audit — 10 November 2026

## Scope

This note records code changes and observations made on branch `fix/campaigns-calendar-mobile-global-nav`. It is not a production certification. No Firebase data, Cloudflare credentials, payment-provider credentials, or live customer records were accessed.

## Corrections committed

- Campaign calendar: moved the monthly event count calculation until after events are grouped by day, avoiding use before initialization.
- Campaign composer: removed duplicate scheduled-date validation; retained one future-date validation before scheduling.
- Campaign persistence: current composer fetches a missing campaign from Firebase, writes the campaign, and verifies that all new post IDs are present before showing a success message.
- Service worker: version advanced to `viora-v1.4.5`; automatic `skipWaiting()` and `clients.claim()` were removed to avoid forcing a new worker onto active sessions; generic root-level JS/CSS cache matching was narrowed.
- Public mobile navigation: seven public pages now use the same five primary bottom-navigation destinations.
- PWA manifest: removed the inaccurate `1290x1219` icon size declaration for the existing `/viora.png` asset. The correct square app icon assets still need to be supplied and verified.
- Notifications: changed the VIORA browser-notification icon from a path not found in the repository search (`/icons/icon-192.png`) to the existing `/viora.png`.

## Payment workflow — not yet changed

The existing finance module currently records a payment and proceeds with persistence, ledger posting, and invoice reconciliation. It does not yet implement the requested Admin/Exec approval gate. This was deliberately not altered in this pass because the exact Firebase payment record shape, role claims, and backend write paths still need verification. A front-end-only role check would not be sufficient protection for financial approvals.

## Still requiring inspection or external configuration

- Firebase Realtime Database structure and effective security rules, including tenant boundaries and who can approve payments.
- Trusted backend enforcement for payment approval, invoice settlement, subscription activation, and Academy entitlements.
- M-Pesa Daraja sandbox credentials and callback verification.
- Cloudflare Worker source/configuration and server-side authorisation.
- Correct square VIORA PWA icon artwork (192px and 512px), then install tests on Android and iOS.
- End-to-end browser tests for campaign create/edit/schedule/refresh, mobile navigation, offline behaviour, and PWA update lifecycle.

## Verification status

- GitHub source changes committed to the existing PR branch.
- Static source inspection completed for the changed logic and navigation counts.
- No automated test suite or browser/device test was run in this pass.
- PR remains unmerged; production deployment has not been claimed.
