# VIORA Engineering Deep Audit

**Assessment date:** 12 November 2026  
**Repository:** `cliff254johns/viora`  
**Reviewed base:** `af1d3d6f8d049e9f6d534920673cfa4052986cb0` (main)  
**Scope:** Source/configuration review of public site, main system, Firebase integration boundaries, Cloudflare Worker, PWA, chatbot, legal pages and GitHub automation.

## Executive score

**5.5/10 — substantial product breadth; production engineering evidence remains incomplete.**

This is a source-level engineering judgement. It is not a penetration test, independent legal opinion, Lighthouse measurement, complete runtime test, or certification.

| Area | Score | Evidence-based assessment |
|---|---:|---|
| Product and ecosystem breadth | 9/10 | Multiple portals and industry applications exist; shared platform vision is clear. |
| Frontend architecture | 5/10 | Modular ES modules exist, but large legacy HTML/CSS surfaces and inline code remain. |
| Backend/integration maturity | 5/10 | Firebase and Workers are integrated; server-side operational controls and tenant boundaries need proof. |
| Security engineering | 5.5/10 | Firebase rules are asserted by owner to be strong; this audit did not retest them. Other layers need verification. |
| Privacy governance | 4/10 | Privacy, cookie and DPA pages exist; operational records, retention execution, rights workflows and vendor evidence are incomplete. |
| Automated testing / CI | 3/10 | One narrow Outreach workflow was found; no broad end-to-end or Firebase emulator suite was evidenced. |
| Observability | 3/10 | Local error handlers exist; centralized service-level telemetry and alerting were not evidenced. |
| Accessibility | 4/10 | Some accessible patterns exist; no complete WCAG 2.2 AA audit evidence. |
| Performance | 4/10 | No Lighthouse/Core Web Vitals run was included in the repository audit. |
| Operations / recovery | 3.5/10 | Backup, restore, incident and SLA procedures need operational proof. |

## Findings and evidence

### P0 — production blockers

1. **No comprehensive CI test gate.** `.github/workflows/viora-outreach-check.yml` is scoped to Outreach-related files and checks syntax/markup conventions. It is not a system-wide build, unit, integration, browser, tenant-isolation or accessibility suite. No Playwright/Vitest/Jest configuration or broad test suite was found in the inspected repository searches.
2. **Worker rate limit was isolate-local.** `web/worker.js` used a module-level `Map` keyed by client IP. That state is not a dependable distributed quota. The translation path also cached user-provided text-derived translations in a shared public edge cache for 24 hours. User text can contain personal data; shared caching is not appropriate without content classification and a defined retention basis.
3. **No centralized alerting evidence.** `web/sw.js` and application modules contain local error handling, but no end-to-end error aggregation, alert routing, SLO dashboard or verified on-call process was evidenced.
4. **Tenant isolation is not demonstrated across the product family.** `web/main.js` declares `ROOT = 'viora_data'` and `ORG = 'orgs/viora'`. That establishes a VIORA workspace namespace, not proof that every customer-facing system isolates every tenant and every backend operation.
5. **Privileged MFA enforcement is unverified.** No repository evidence established that every privileged Firebase account is enrolled in MFA and that privileged operations reject sessions without the required assurance.
6. **Production data export/deletion needs trusted workflows.** Browser-side export can package currently loaded data, but it cannot prove completeness across all backend collections, backups, files, logs and external processors. Deletion must be authorized, audited, propagated and subject to legal holds.
7. **No restore evidence.** A backup schedule and a successful restore drill, RPO and RTO were not found in the reviewed materials.

### P1 — significant reliability and compliance gaps

- **PWA artwork:** the existing `/viora.png` is documented in the public-site audit as 1290×1219, not square. Both manifests must reference real square icon assets; do not claim square dimensions for a rectangular image.
- **Live QA:** the existing `docs/VIORA-PUBLIC-WEBSITE-10-10-AUDIT.md` explicitly says its review was static source inspection, not live browser/device, form, screen-reader or Lighthouse testing.
- **Accessibility:** review all dialogs for focus management, Escape behavior, labels, live regions, contrast, keyboard operation, zoom/text scaling and reduced motion. Target WCAG 2.2 AA.
- **Performance:** collect mobile/desktop Lighthouse reports and field Core Web Vitals before making performance claims.
- **Supply chain:** `web/main.html` loads key libraries from external CDNs. Pin versions, use integrity metadata where supported, review transitive dependencies and add automated dependency/secret scans.
- **Large legacy surfaces:** `web/main.html`, `web/main.css`, `web/main.js` and selected standalone apps remain large. Refactor in small, tested increments; do not undertake a broad rewrite.
- **Privacy claims:** public privacy copy describes encryption at rest/in transit. Obtain provider configuration/contract evidence and map what VIORA itself controls before representing this as a verified control.
- **Subprocessor inventory:** the public DPA names Cloudflare and Google/Firebase; source code also references additional AI and CDN services. The complete legal entity, role, location, data categories, contract and transfer basis must be reconciled.
- **SLA:** no measured service availability or approved customer-facing SLA was evidenced.

### P2 — maintainability and customer experience

- Consolidate repeated auth, permissions, notification, validation, error, audit and file-handling logic into a shared VIORA Core.
- Introduce API contracts and versioning for integrations.
- Generate module inventory, API docs, release notes and deployment manifests.
- Add a customer support escalation path and status communication.
- Test keyboard-only, screen reader and narrow mobile layouts on representative workflows.

## Changes prepared in this engineering branch

- Replaced the translation Worker in-memory rate map with one SQLite-backed Durable Object per hashed client IP.
- Removed shared public edge caching of user-supplied translation content.
- Added request IDs and structured success/failure/rate-limit logs.
- Enabled Workers Logs and Traces in Wrangler configuration.
- Added the Engineering Command Centre to the main system for session-level diagnostics and governance links.
- Added a customer data export helper for records currently loaded into the signed-in main workspace. This is a convenience export, not yet a certified complete data-subject export.
- Added progressive speech queueing so browser voice can begin as the chatbot's response streams, rather than waiting for the full response.
- Added draft internal data-governance, retention, incident, subprocessor and SLA documents.

## Verification status

| Check | Status |
|---|---|
| Source/configuration review | Completed for the files listed above and targeted repository searches. |
| Firebase rules | Not retested; owner states rules are verified and strong. No rules were modified. |
| Live executive login | Not performed. The previously confirmed test account identity was available, but no reusable password was available in the retrieved test context. |
| Cloudflare deployment | Pending successful merge/build/deployment evidence. |
| Worker Durable Object runtime | Requires deployment and live quota test. |
| Main system browser workflow | Requires authenticated browser session; no credential was entered or password reset. |
| Chatbot streaming speech | Source change prepared; browser/audio test pending. |
| Lighthouse / Core Web Vitals | Not measured. |
| Screen reader / keyboard / mobile | Not certified. |
| Legal compliance | Policies and controls are drafts; organizational and counsel actions remain. |

## Prioritized implementation backlog

### P0 — first
1. Run full CI on every PR: syntax, lint, unit, Firebase Emulator integration, Playwright critical journeys, accessibility smoke tests.
2. Deploy Worker Durable Object migration; verify rate-limit persistence across requests and multiple isolates; alert on 429/5xx.
3. Implement centralized error capture and alert routing for main app, public site and Workers.
4. Map every data store and tenant key; prove read/write isolation with negative cross-tenant tests.
5. Enforce MFA for privileged identities and sensitive operations; verify recovery and session revocation.
6. Build server-authoritative data export/deletion jobs with audit trail, file handling, backup expiry and legal-hold controls.
7. Run and record a backup restore drill.

### P1 — next
8. Complete ODPC registration applicability check and registration status evidence.
9. Approve and operationalize DPA, retention, incident and subprocessor policies.
10. Complete DPIAs for high-risk/sensitive processing (including any health, biometric or children's data).
11. Reconcile all third-party services, locations, contracts and international transfer safeguards.
12. Run WCAG 2.2 AA audit and fix critical blockers.
13. Generate real square PWA artwork and verify install/update on Android and iOS.
14. Run Lighthouse on representative routes and record mobile/desktop LCP, INP and CLS.
15. Pin and scan dependencies; add secret scanning and security advisories.

### P2 — scale
16. Establish approved SLA tiers from measured service history.
17. Publish a status page and incident communication process.
18. Refactor large legacy modules incrementally.
19. Add API schemas, compatibility tests and versioning.
20. Establish quarterly access reviews, vendor reviews, incident exercises and restore exercises.

## Definition of production-ready

Do not call VIORA globally production-ready until critical workflows pass automated and manual tests, tenant isolation is proven, MFA and backup restoration are evidenced, monitoring and alerting are active, privacy requests can be completed end-to-end, DPIAs and vendor transfers are reviewed, and accessibility/performance measurements are recorded.
