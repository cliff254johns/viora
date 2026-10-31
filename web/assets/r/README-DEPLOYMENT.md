# BodaBiz rebuilt app bundle

## Files
- `ride.html` (primary) and `riders.html` (compatibility alias) — public rider and service directory (live Firebase listener).
- `bodabiz.html` — rider workspace, service editor, analytics and receipts.
- `admin.html` — admin command centre.
- `manifest-*.json`, `icons/icon.svg`, `sw.js` — installable PWA shell.
- `shared/firebase.js` — configured Firebase client bootstrap for project `cliff-f4dd9`.
- `database.rules.json` — the Realtime Database rules supplied for this project.

## Required setup before deployment
1. Create/use a Firebase project with Authentication (Email/Password) and Realtime Database enabled.
2. The supplied Firebase web app configuration is already installed in `shared/firebase.js` for project `cliff-f4dd9`. It uses Firebase JS SDK 10.12.0 and exports the Auth and Realtime Database functions used by the app.
3. In Firebase Console → Realtime Database → Rules, paste the contents of `database.rules.json` and publish them. These are the rules supplied for this project; review the public-read implications below before production use.
4. Keep the existing administrator UID allow-list in `admin.html` restricted to the real owner UID. The rules and app currently use the administrator UID `2fOfd59RZBXf6uipvlAzoxdw1yp1`. Do not publish an admin account password in source code.
5. The intended data paths are:
   - `riders/{uid}/profile` — private rider profile; owner can read/write own profile.
   - `publicProfiles/{uid}` — publicly readable published profile and service catalogue; only that UID and authorized admins may write.
   - `posts`, `reports`, `challenges`, `challengeProgress`, `presence`, `heatmapCells`, `riderBadges`, `adminAudit`, `broadcast` — restrict writes to authenticated users and admin roles as appropriate.
6. Deploy all files to the same HTTPS origin, preserving the `shared/` and `icons/` folders. PWA installation and service workers require HTTPS (or localhost).
7. The supplied rules allow public reads of all data under `publicProfiles`. Only put information there that is intended to be visible to every visitor (for example, public rider name, service descriptions, service photos and business contact details). Keep private rider/customer/financial data under owner-protected paths; never place it in `publicProfiles`.

## Important behavior / limitations
- Service photos are compressed to small JPEG data URLs and stored in the rider's `publicProfiles/{uid}/serviceCatalog` record. This avoids a missing Firebase Storage dependency. For larger catalogues, move images to Firebase Storage and store download URLs instead.
- The rider's income ledger, savings, expenses and customer records remain device-local (localStorage/IndexedDB), matching the original app's privacy model. They do not automatically sync to other devices. Rider service catalogue and public profile do sync through Firebase once the rider signs in and publishes a complete profile.
- A receipt is a locally generated record of a payment entered by the rider. It is not proof of an M-Pesa/bank transaction.
- Charts reflect the ledger records available on the current device. The rider challenge panel calculates personal progress locally and does not attempt to read the shared leaderboard, because the supplied rules intentionally grant no rider read access to `challengeProgress`.
- Public directory live updates require Firebase Realtime Database and the published rules. The supplied rules make `publicProfiles` publicly readable and permit a signed-in rider to write only their own `publicProfiles/{uid}` node (the admin can write any rider node). If the Firebase listener cannot connect, the portal shows its last cached listing snapshot.
- The admin dashboard still requires the UID in its `ADMIN_UIDS` allow-list and matching Firebase security rules.

## Firebase security notes
- Firebase web API keys are client identifiers, not service-account credentials. Do not add a service-account JSON key to this website.
- The root-level read/write grants are limited to the specified admin UID. More specific child rules separately grant the public-profile and owner-scoped access described above.
- The supplied `posts` rule allows authenticated users to create or update their own posts based on `authorId`; the admin UID check is exactly as supplied. `challengeProgress` and `presence` define owner-scoped writes but no rider read grant. The rider app was adjusted to write its own challenge progress and presence record without trying to read other riders’ records. The admin heatmap uses `heatmapCells`, whose writes are explicitly disabled in the supplied rules; populate that node only through a trusted backend (for example, a secured Cloud Function) if you want density aggregation. Do not weaken `heatmapCells` to public writes.
- I have not connected to your live Firebase project or published the rules. You must publish them in the Firebase Console and test with real rider/admin accounts.

## Suggested validation
- Test rider signup/sign-in, publish profile, add/edit/delete service with an image, and open `riders.html` in a second browser/device.
- Confirm the public portal updates without reload after service changes.
- Record a fare with a customer name, open its receipt, share/copy it and print to PDF.
- Test install prompt on Chrome/Android and Add to Home Screen on Safari/iOS.
- Test admin login with the authorized UID and exercise each admin tab against a staging Firebase database before production.
