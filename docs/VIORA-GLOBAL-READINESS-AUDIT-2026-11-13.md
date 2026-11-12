# VIORA global-readiness execution audit — 13 November 2026

## Purpose and status

This is an evidence-led baseline for the Phase 1–4 global-readiness programme. It is an engineering audit, not a certification, penetration-test report, legal opinion, uptime SLA, or claim that all customer journeys have been tested.

**Baseline status: IN PROGRESS.** No 100% success claim is made. Items are marked verified only when a current tool result or source artifact supports that status.

## Evidence checked

- GitHub repository: `cliff254johns/viora`; default branch: `main`; repository is public and connected account has admin/push permissions.
- Cloudflare account: account ID `3d4c248743be256656ee3f05f86b9844`.
- Production Worker: `viora-static-git`; Cloudflare lists `viora.co.ke` and `www.viora.co.ke` as attached domains; 100% of traffic is on version `e4a0c6c5-8729-4ab7-9ef4-f770155f29a3`, deployment created 2026-11-12T21:54:41Z.
- Worker observability is enabled; logs persist and traces are enabled. Logpush is off.
- The production browser workflow run `43314807489` completed successfully. Its job log reports four passed tests and two skipped tests. Passed: desktop/mobile homepage serious/critical axe checks and desktop/mobile main-system horizontal-overflow checks. Skipped: authenticated exec/admin journeys because `VIORA_TEST_EMAIL` and `VIORA_TEST_PASSWORD` were empty in that run. Therefore authenticated portal journeys are NOT verified by this run.
- Two open pull requests were present: #45 (107-commit application consolidation) and #48 (assistant pose/PWA branding). Their file lists overlap in manifests and `web/main.html`; neither was merged as part of this audit. They require explicit diff/base/conflict and check review before merge.
- Cloudflare R2 bucket listing returned HTTP 403 with error 10042: **“Please enable R2 through the Cloudflare Dashboard.”** Thus R2 is not enabled for this account at audit time. The Firebase backup workflow cannot be treated as operational.
- Backup runbook says required GitHub variables/secrets must be configured and a successful backup plus isolated restore drill must be completed. No production backup/restore drill is evidenced here.
- `web/currency-display.js` implements IP-based country estimation, Frankfurter daily reference rates, an Open Exchange Rates fallback, and local caching. The source itself describes rates as reference estimates and does not rewrite stored invoice/payment currencies. This is not proof of every-country coverage, real-time exchange rates, or settlement/payment conversion.
- Public website source has English, French and Spanish homepages with hreflang references. This is a foundation, not comprehensive multilingual coverage of every portal, workflow, legal document or support interaction.
- Public homepage source uses third-party hosted fonts and Font Awesome assets. The whole site is therefore not proven to work without external network dependencies.
- Authenticated portal pages use noindex directives in the inspected sources. Robots directives are not access control; Firebase Auth, backend authorization and database rules remain the enforcement boundary.
- The current integration test file contains conditional skips when emulator hosts, test tokens and protected-path identities are not configured. A passing workflow with skipped probes must not be described as complete tenant-isolation verification.

## Phase 1 — inventory and baseline

### Verified
- Repository and production Worker identity identified.
- Production Worker domains and latest 100%-traffic version identified.
- Latest recorded browser workflow job inspected, including the skipped authenticated tests.
- Open pull requests and overlapping changed-file sets identified.
- Backup workflow/runbook and currency display implementation inspected.

### Not yet verified
- Complete inventory of every portal, route, module, API, database path, scheduled task and external integration.
- Authenticated end-to-end journeys for Main, Client, Finance, Scholar, Outreach, Market and other protected portals.
- Current live HTTP status, response headers, cache behavior and browser-console/network behavior for all production routes.
- Current GitHub Actions full check suite and latest CodeQL/dependency-review conclusions.
- Effective Firebase rules in a live/emulated environment and all tenant boundary cases.
- Production error rates, latency, uptime and real-user Core Web Vitals.

## Phase 2 — engineering, security and reliability

### Existing foundations
- Unit, contract, integration, Playwright and Cloudflare test scripts exist.
- Security-quality workflow includes npm audit, CodeQL, secret scanning and a conditional dependency-review job.
- Firebase emulator tests include tenant read/write isolation and privileged authorization probes.
- Encrypted Firebase RTDB backup, isolated-target restore and R2 retention scripts exist.
- Cloudflare Worker observability and Durable Object-based translation rate limiting are configured.

### Required completion work
1. Configure emulator hosts and dedicated test identities so tenant A/B read/write and privileged/non-privileged probes execute rather than skip.
2. Add protected-path authorization coverage for every portal/API family and test both direct database and trusted backend paths.
3. Enable Cloudflare R2 in the dashboard, create a private bucket, create least-privilege credentials, configure GitHub variables/secrets, run backup, and restore to a disposable isolated Firebase project.
4. Add dependency graph / dependency review configuration and resolve all high/critical findings with lockfile evidence.
5. Run independent security assessment and remediate findings; source-level review is not a penetration test.
6. Define and measure service objectives (availability, latency, recovery point and recovery time); current RPO/RTO values in the runbook are objectives, not measured guarantees.
7. Validate logging redaction and retention, incident alert routing, rate limits, abuse controls and secret rotation.

## Phase 3 — public product, performance and accessibility

### Existing foundations
- English, French and Spanish homepage sources and hreflang links exist.
- Sitemap and robots.txt exist.
- Authenticated application entry pages inspected include noindex directives.
- Latest production browser run passed homepage axe serious/critical checks on desktop and mobile, and main-app horizontal overflow checks on desktop and mobile.

### Required completion work
1. Run full Lighthouse/PageSpeed and field Core Web Vitals assessment; no performance score or CWV pass is claimed.
2. Test all public pages, mobile breakpoints, keyboard flows, forms, media, navigation and route redirects.
3. Expand WCAG 2.2 AA testing beyond homepage; automated axe checks alone do not establish conformance.
4. Verify canonical, hreflang, sitemap, structured data, redirects and indexability for every public page.
5. Build a complete locale/currency matrix. Keep display-only reference conversion distinct from quote, invoice, tax, accounting and settlement currency.
6. Add a fallback and stale-rate disclosure for geolocation/FX failures; never silently convert a contractual or financial record.
7. Review third-party script/font dependencies, consent behavior, CSP, SRI where applicable, loading performance and failure modes.

## Phase 4 — global business readiness

### Required completion work
1. Publish accurate product/industry pages that distinguish live capabilities from planned or illustrative scenarios.
2. Build three evidence-backed customer case studies only with customer permission, verified scope, measurable outcomes and references.
3. Publish clear implementation scope, pricing basis, subscription terms, cancellation, support, SLA, privacy, data processing, retention and security documentation; obtain local legal review.
4. Establish support ownership, escalation, incident communication, onboarding, training, service status and customer feedback loops.
5. Validate payments, taxes, invoicing, currencies, data residency and privacy requirements market by market before offering those capabilities there.
6. Establish international partnerships and measurable acquisition/retention reporting.

## Immediate blockers and dependencies

| Blocker | Required action | Status |
|---|---|---|
| R2 disabled | Enable R2 in Cloudflare Dashboard | BLOCKED — account-owner dashboard action |
| Backup credentials absent/unverified | Configure least-privilege GitHub secrets/variables after R2 enablement | NOT VERIFIED |
| Authenticated browser tests skipped | Configure dedicated CI test account secrets and safe test data | NOT VERIFIED |
| Firebase emulator probes conditional | Configure emulator and dedicated tenant/admin/non-admin identities | NOT VERIFIED |
| Open PR overlap | Reconcile #45 and #48 against current main and each other | REVIEW REQUIRED |
| Independent assurance | Engage qualified security and legal reviewers | EXTERNAL |
| Live production route checks | Run browser/network/HTTP checks against production | NOT VERIFIED in this audit |

## Execution rules

- Never merge overlapping application PRs without reviewing exact base/head, changed files, conflicts and required checks.
- Never deploy failing or unreviewed production changes.
- Never mark skipped tests as passed.
- Never use production data for destructive tests or restoration drills.
- Never convert stored invoice/payment amounts merely to local display currency.
- Never publish customer logos, testimonials or quantified outcomes without permission and evidence.
- Record commit SHA, PR, workflow run, Cloudflare deployment version and post-deployment checks for every release.

## Completion definition

Phases 1–4 are complete only when the inventory is exhaustive, critical authenticated journeys and tenant boundaries have executed successfully, backup and isolated restoration are proven, security/performance/accessibility evidence is recorded, international behavior is tested against a defined market matrix, operational ownership and customer processes exist, and all material blockers are closed or explicitly accepted by the business owner.

**Current overall result: baseline established; phases 1–4 are not complete.**
