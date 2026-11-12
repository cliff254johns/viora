# VIORA automated testing

- `npm run test`: repository contracts plus business calculation unit tests.
- `npm run test:integration`: Firebase Auth/Realtime Database emulator tests (skipped unless emulator environment variables are supplied).
- Tenant isolation integration requires two distinct emulator-authenticated identities and Firebase rules matching the production schema. Replace the fixture paths with the authoritative tenant paths before treating this as an isolation certification.
- End-to-end, real-browser, mobile-device, screen-reader and WCAG 2.2 AA tests remain separate gates. Do not label them passed until executed against a deployed preview with provisioned test identities.
