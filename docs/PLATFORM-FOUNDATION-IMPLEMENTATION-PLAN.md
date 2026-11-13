# VIORA platform foundation implementation plan

**Status:** Proposed implementation baseline on `platform-foundation/architecture-baseline`; not merged or deployed.
**Source baseline:** current `main` at `b03077d7ae6a3077d2f2044cce7db27865bf11c9`.
**Scope:** establish eight shared platform capabilities without changing production behavior until each migration is tested and approved.

## Operating rules

- Preserve existing Firebase Realtime Database and Storage rules. Do not weaken or replace them as part of this work.
- Derive tenant identity from a verified Firebase ID token and server-side role/membership lookup. Never accept a browser-supplied tenant identifier as authority.
- Treat payment-provider callbacks as untrusted until authenticated and independently verified against the provider.
- Never record a payment as settled from a callback payload alone.
- Fail closed when security, governance, tenant membership, audit, or payment verification dependencies are unavailable.
- Do not expose secrets, token values, personal data, or full payment payloads in logs.
- Build behind feature flags and migrate one endpoint family at a time.
- No production deployment until CI, emulator isolation tests, authenticated browser tests, and rollback checks pass.

## Workstreams and acceptance criteria

### 1. Versioned API contract

Deliverables:
- `openapi/v1.yaml` is the initial contract baseline.
- Every route is inventoried with method, owner, auth policy, tenant scope, validation schema, error model, and deprecation status.
- CI validates the OpenAPI document and detects unowned/uncontracted routes.
- Responses converge on a stable envelope: `{ ok, data, error, requestId }`; validation errors identify fields without echoing secrets.

Acceptance:
- Every production route is either contract-covered or explicitly marked legacy with an owner and migration issue.
- Contract tests exercise success, validation, authentication, authorization, not-found, conflict, rate-limit, and server-error behavior.

### 2. Verified tenant context

Deliverables:
- A single middleware/helper resolves Firebase ID token, UID, role, active membership, tenant ID, and allowed capabilities.
- Tenant ID comes from trusted server-side membership records or verified custom claims with a defined revocation strategy.
- Request body, query string, path, and headers cannot override the resolved tenant.
- Every data access helper requires the resolved tenant context for tenant-owned data.

Acceptance:
- Emulator tests prove tenant A cannot read, write, enumerate, export, or mutate tenant B data through every protected route family.
- Missing membership, inactive membership, lookup failure, malformed claims, and stale/revoked identity all fail closed.
- Existing admin/exec cross-tenant support is explicit, role-gated, audited, and not inferred from a browser role string.

### 3. Immutable payment ledger

Deliverables:
- Append-only provider event and ledger-entry model; corrections use compensating entries, never destructive edits.
- Unique provider transaction ID and idempotency key constraints.
- Provider callback authenticity checks, independent status lookup where supported, and validation of merchant, invoice, amount, currency, account reference, and transaction status.
- Pending, succeeded, failed, reversed, refunded, disputed and reconciliation states.
- Daily provider-to-ledger reconciliation and exception queue.

Acceptance:
- Duplicate, replayed, delayed, out-of-order, forged, wrong-amount, wrong-currency, wrong-invoice, timeout, reversal and refund tests pass.
- A callback write failure returns a retryable failure; it must never falsely acknowledge a payment as successfully recorded.
- No production payment is posted until independently verified.

### 4. Integration registry

Deliverables:
- Provider catalog with capability, tenant scope, environment, configured-state metadata, last successful check, token expiry metadata, webhook health, last error category and owner.
- Secret values remain in Cloudflare secrets or approved secret stores; registry stores references and presence/health metadata only.
- Provider health checks use safe non-mutating endpoints and redact responses.
- Tenant-specific connections and platform-owned connections are distinguished.

Acceptance:
- A provider is never labelled connected merely because a secret exists.
- Status distinguishes not configured, configured-unverified, connected, degraded, expired, disabled and action-required.
- Credential rotation and token revocation update status and audit history.

### 5. Append-only audit trail

Deliverables:
- Shared event schema: actor UID, verified role, tenant, action, resource type/ID, timestamp, request/correlation ID, outcome, reason and redacted before/after diff.
- Audit writes are mandatory for privileged, financial, identity, access-control, integration and data-export operations.
- Audit storage is append-only to application roles; retention and export controls are documented.

Acceptance:
- Audit failure blocks high-risk mutations rather than silently continuing.
- Secrets, access tokens, passwords, full card data and unnecessary personal data are never included.
- Audit events can be correlated across API, provider webhook, job and UI request.

### 6. Operational monitoring

Deliverables:
- Structured JSON logs with request ID, route, status, duration, tenant pseudonym and deployment version.
- Exception tracking (Sentry-compatible), distributed trace propagation, synthetic uptime checks and alert routing.
- Dashboards for latency, errors, payment callback health, provider failures, queue age, auth denials and backup status.
- Explicit SLOs and incident severity/ownership.

Acceptance:
- Alerts are tested end-to-end; log redaction is tested with synthetic secrets.
- Monitoring failure cannot expose customer data or break business transactions.
- Service objectives are measured from production telemetry, not assumed.

### 7. Encrypted backup and recovery

Deliverables:
- Enable a private Cloudflare R2 bucket (or approved equivalent) with least-privilege credentials, versioning/retention and encryption.
- Back up Firebase RTDB and Storage metadata/object data according to documented scope.
- Separate backup encryption key from storage credentials; rotate and escrow recovery material securely.
- Isolated restore environment, integrity checks, restore runbook and evidence log.

Acceptance:
- At least one scheduled backup and isolated restore drill succeeds before production sign-off.
- Publish measured RPO/RTO only after drills; objectives are not promises.
- Alert on missing, stale, corrupt or undecryptable backups.
- Never run destructive restore tests against production.

### 8. Release and rollback process

Deliverables:
- Protected main branch; required reviews and required CI checks.
- Feature branches and pull requests; no direct production edits.
- Preview deployment and smoke tests against isolated data.
- Authenticated desktop/mobile E2E, Firebase emulator tenant-isolation tests, API contract tests and security scans.
- Explicit human approval for production promotion, canary, health observation and documented rollback.

Acceptance:
- Skipped tests are visible as skipped and cannot satisfy mandatory checks.
- Deployment records commit SHA, artifact/version, approver, workflow run and post-deploy evidence.
- Rollback is rehearsed and does not require rebuilding from an unknown artifact.

## Phased delivery

| Phase | Scope | Exit gate |
|---|---|---|
| 0 — Baseline | Route inventory, OpenAPI, ownership map, test matrix | All routes classified; spec validates |
| 1 — Safety core | Tenant context, common validation/errors, audit primitives | Tenant isolation and fail-closed tests pass |
| 2 — Money | Payment event model, callback hardening, reconciliation | Provider sandbox replay/forgery tests pass |
| 3 — Operations | Integration registry, monitoring, alerting | Health state and alerts verified |
| 4 — Recovery | R2/equivalent, backup, isolated restore | Backup and restore evidence recorded |
| 5 — Release | Branch protection, previews, approvals, canary/rollback | Release rehearsal passes |

## Current known blockers from the audit

- The deployed API has an unauthenticated `/debugEnv` route that exposes configuration-presence metadata.
- API CORS is currently wildcard in the inspected source.
- M-Pesa callback processing was not shown to authenticate/independently verify provider status or guarantee idempotency.
- Finance and API account-reference property names differ.
- The audit observed AI governance paths that can fail open on some data-store errors and read-then-write rate/budget counters that are not atomic.
- R2 was not enabled in the Cloudflare account at the time of the audit; backup and restore therefore remain unproven.
- Authenticated browser E2E skipped because dedicated test credentials were absent from the workflow environment.
- Existing Firebase emulator probes are conditional and must be made mandatory in the release gate.

These findings must be rechecked against the exact deployed API version before remediation. This branch does not change production configuration.

## Explicitly out of scope for an automatic change

- Changing Firebase RTDB or Storage security rules.
- Adding or rotating live payment credentials.
- Enabling live payments or outreach.
- Deleting production data or changing tenant ownership.
- Enabling R2 billing or other paid services.
- Deploying changes directly to production.
