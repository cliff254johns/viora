# VIORA testing, security and recovery plan

## Test pyramid
1. Unit tests: money calculations, invoice allocations, VAT/currency rounding, project balances, permissions helpers and validation.
2. Integration tests: Firebase Auth, Realtime Database, Storage, Cloudflare Worker/DO and external API contracts.
3. Security tests: cross-tenant read/write denial, privileged role escalation denial, expired/revoked token behavior and permission regression.
4. End-to-end: admin sign-in, client onboarding, project → invoice → payment → receipt, outreach bulk email preview/send, client portal access, notification fan-in and chatbot streaming.
5. Regression: learner, trainer, client, partner, admin, finance, marketplace, outreach and public-site journeys.
6. Browser/accessibility: Playwright Chromium desktop/mobile plus axe WCAG 2.2 AA smoke tests; extend to Firefox, WebKit, Android Chrome and iOS Safari; complete keyboard-only and screen-reader checks.

## Firebase integration prerequisites
Run Auth and RTDB emulators in CI with isolated fixture identities and seeded rules. Never use production customer data. Tenant tests must use the actual deployed tenant path schema and two separate authenticated principals. Current CI scaffolding deliberately does not claim isolation passed.

## Backup and recovery target
- Proposed initial RPO: 24 hours; tighten to 4 hours after restore and cost tests.
- Proposed initial RTO: 8 hours; target 4 hours after a successful timed drill.
- These are planning targets, not current guarantees.
- Nightly encrypted export to a private Cloudflare R2 bucket with object versioning, lifecycle retention (daily 35 days, monthly 12 months), and separate immutable audit logs.
- Keep encryption keys and Firebase service credentials in GitHub Actions secrets/Cloudflare secrets; never in Git.
- Alert on missing backup, checksum mismatch, failed upload, retention failure and restore failure.
- Quarterly restore drill into an isolated Firebase project; record data-loss window, restore duration, integrity checks and approver.
- Firebase RTDB export requires a trusted server-side Admin SDK identity. A Cloudflare Worker must not hold an Admin private key in source. Use a protected scheduled runner or Cloudflare Worker calling a narrowly scoped authenticated backup service.

## WCAG and performance release gate
Target WCAG 2.2 AA; automate axe checks and keyboard smoke tests, then complete manual screen-reader verification. Capture Lighthouse mobile/desktop and field Core Web Vitals (LCP, INP, CLS) for representative public and authenticated journeys. No pass claim without dated reports.

## AI engineering assistant
A repository bot may summarize diffs, map affected modules, identify duplicated symbols and propose test cases. It must be read-only by default, redact secrets/PII, cite exact paths/lines, and open a suggested patch/PR for human approval. It must never merge, deploy, alter Firebase rules or change production data autonomously.

## Current evidence status
The first business-calculation unit tests and CI security gates are source additions only until GitHub Actions executes them. Firebase emulator integration tests are opt-in and require configured emulator endpoints and distinct test identities. Backup automation, actual R2 bucket, key provisioning, retention policy enforcement, restore drill, RPO/RTO measurement, E2E browser matrix and WCAG certification are not complete.
