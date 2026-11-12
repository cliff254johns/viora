# VIORA SaaS Service Level Agreement — Draft

**Status:** Commercial draft for management and legal review. No uptime or support commitment is made until an executed customer agreement specifies the selected service tier.

## 1. Service scope

The SLA must identify the subscribed VIORA portal/modules, tenant, production environment, support channel, measurement window and exclusions in the order form.

## 2. Proposed availability objectives

| Tier | Proposed monthly availability objective | Status |
|---|---:|---|
| Standard | 99.5% | Proposed target only; not measured or committed |
| Business | 99.7% | Proposed target only; requires capacity and monitoring evidence |
| Enterprise | 99.9% | Do not offer until redundant architecture, on-call coverage and historical evidence support it |

Availability should be measured at the customer-facing service boundary using independent probes. Exclude only agreed maintenance windows, customer/network failures, force majeure and third-party outages outside VIORA's reasonable control, subject to counsel review.

## 3. Proposed support response objectives

| Severity | Example | Proposed initial response |
|---|---|---|
| P1 Critical | Production unavailable, suspected cross-tenant access, material data loss | 1 business hour |
| P2 High | Major workflow impaired, no reasonable workaround | 4 business hours |
| P3 Normal | Limited defect with workaround | 1 business day |
| P4 Request | How-to, cosmetic issue or enhancement | 3 business days |

Response time is not resolution time. Support hours, time zone, holidays, channels and escalation contacts must be stated in the signed order form.

## 4. Incident communications

VIORA will provide status updates at an agreed cadence for material service incidents. Personal-data breach notifications follow applicable law and the DPA; service status communications do not replace regulatory notifications.

## 5. Service credits

Do not promise credits until the commercial model, calculation, cap, claim window and exclusions are approved. Any credits should be the customer's sole and exclusive remedy for availability failure only if permitted by law and agreed in the main contract.

## 6. Customer responsibilities

Customers must maintain authorized users, protect credentials, configure tenant access, maintain compatible devices/network, report incidents promptly and keep their own exports where the contract requires.

## 7. Operational prerequisites before publishing

- Independent uptime probes and availability calculations.
- Documented maintenance process.
- On-call escalation and incident runbook.
- Backup/restore evidence and recovery objectives.
- Published support hours and monitored contact channels.
- Customer-specific service scope and exclusions.
- Legal review and signed commercial approval.
