# BodaBiz Community Platform

BodaBiz is an offline-first rider business manager with optional cloud community features: a stage noticeboard, public rider directory, badge-only weekly challenges, opt-in approximate rider density, profile privacy controls and a manually operated moderation panel. Core personal ledger records remain in browser storage; only community/profile data is synchronized.

## Files
- `bodabiz.html` — rider ledger and community workspace.
- `riders.html` — public rider directory and profiles.
- `admin.html` — unlinked moderation console.
- `shared/firebase.js` — shared Firebase modular SDK initialization.
- `database.rules.json` — Realtime Database rules.
- `sw.js` and `manifest.json` — installable offline shell.

## Deploy
1. Place the files at the repository root, retaining the `shared/` folder.
2. Enable GitHub Pages for the repository and configure the desired custom domain in GitHub Pages and Cloudflare DNS.
3. Serve over HTTPS. Browser camera/location and PWA capabilities require a secure context.
4. In Firebase Console, enable Email/Password and Anonymous sign-in providers under Authentication.
5. Publish `database.rules.json` in Realtime Database → Rules.
6. Create an owner account using Firebase Authentication. Copy its UID into the `ADMIN_UIDS` array in `admin.html` and create `admins/{uid}: true` in Realtime Database.
7. Test: create a rider cloud account, save a public profile, open the public directory, create a second rider, test challenge progress and tied leaders, opt in/out of approximate area sharing, submit a report, and process it in the moderation panel.

## Notes and limitations
- Old community posts are filtered client-side after their 14-day expiry; no scheduled server cleanup is configured.
- Challenges are badge-only. Progress is client-asserted, so a malicious client may inflate its own progress. The owner can inspect and manually zero progress rows.
- Without server functions, density aggregation is client-run. Authenticated clients can read approximate geohash-6 presence values to compute aggregate cells; a malicious client could enumerate neighbourhood-level cells. Raw coordinates are never written to the database.
- The moderation interface is UID-gated in the UI and rules-gated for administrative writes. Replace the owner UID placeholder before deployment.
- Public directory pages are client-rendered; search engines may index them less reliably than pre-rendered pages.
- The local name/password gate is a device-local convenience, not a substitute for production identity security. Cloud account sign-in is a separate optional step.
- For public contact links, riders must explicitly enable phone publishing. Public phone numbers can be copied by visitors.
- Browser storage can be cleared by the device owner or browser; export backups regularly.

## UI, service receipts and offline updates
- `riders.html` now includes a locally embedded Kenya county locator with all 47 county names and selected major towns. It remains visible when the directory has no rider profiles or no internet connection. Its vector map is a schematic locator, not a legally authoritative county-boundary map; town lists highlight major urban centres and are not every settlement.
- Rider service forms are in-app modal forms with validation, service category, guide rate, description, photo preview and resized local photo storage. Bookings can record customer details, agreed fare and payment method, create a receipt, reopen recent receipts, print them or prepare a WhatsApp message for the customer.
- The reports page can print/save a report as PDF and export CSV/JSON. The admin panel has refreshed mobile styling, summary counters, CSV export and print support.
- The service worker caches the main app pages, public directory, admin shell and commonly used external modules after a successful online visit. Local ledger records and the embedded county guide work offline. Firebase authentication, cloud synchronisation, live directory refresh, WhatsApp sending and live map tiles/features require connectivity. Do not treat a cached screen as proof that a cloud write succeeded.
- Service photos are resized before being saved with the local rider service record. Browser storage is finite; export backups regularly, especially after adding many photos.

## Pre-upload validation
- JavaScript syntax checked for `bodabiz.html`, `riders.html`, `admin.html` and `sw.js`.
- Confirmed 47 county entries and no duplicate HTML IDs in the three pages.
- Firebase behaviour still needs a live deployment test using your actual Firebase Authentication settings and Realtime Database rules. Test both online and airplane-mode behaviour on the target phone/browser before relying on it operationally.
