# VIORA Security and Personal Data Incident Response Plan

**Status:** Internal runbook draft — assign named owners and test before relying on it.

## Roles

- Incident Commander: accountable for severity, decisions and coordination.
- Security/Engineering Lead: containment, evidence, logs, recovery and technical remediation.
- Privacy Lead: personal-data risk assessment, regulator/data-subject notification and processor/controller coordination.
- Customer Lead: customer communication and service status.
- Legal Adviser: privilege, regulatory interpretation, law enforcement and contractual advice.

One person may cover more than one role in a small team, but the responsibilities must be assigned before an incident.

## Severity

- **SEV-1:** confirmed/likely exposure of sensitive personal data, cross-tenant access, privileged account compromise, destructive data loss or critical service outage.
- **SEV-2:** material service degradation, suspected unauthorized access, failed security control or data integrity issue with limited scope.
- **SEV-3:** isolated non-sensitive defect or low-impact service issue.

## Response steps

1. **Detect and record:** create an incident ID; record detection time, reporter, affected service, initial symptoms and evidence. Do not place credentials or unnecessary personal data in the ticket.
2. **Triage:** assign severity and commander; determine whether personal data, special-category/sensitive data, children or multiple tenants are involved.
3. **Contain:** revoke compromised sessions/keys, disable affected integration, isolate affected workload, apply temporary access controls. Preserve evidence; do not destroy logs.
4. **Investigate:** establish timeline, attack vector, data categories, subjects/records, tenant scope, access/exfiltration evidence and likely consequences.
5. **Assess notification:** document the legal threshold and clock. Under Kenya DPA section 43, controller notification to the Data Commissioner is required without delay and within 72 hours where unauthorized access/acquisition creates a real risk of harm; processors notify controllers without delay and, where reasonably practicable, within 48 hours. GDPR Article 33 applies where the GDPR is in scope, generally within 72 hours where the breach is likely to risk rights/freedoms. Communicate to affected individuals where required.
6. **Remediate:** close the vulnerability, rotate secrets, patch, restore from verified backups and run regression/tenant-isolation tests.
7. **Communicate:** provide accurate, staged updates to customers, regulators and affected people as required. Do not speculate or understate impact.
8. **Close and learn:** record root cause, impact, actions, notifications, evidence retention, owners and deadlines. Complete a post-incident review within 5 business days of containment.

## Required incident record

- Incident ID, opened/closed timestamps and timezone.
- Reporter, commander and assigned roles.
- Services, tenants and regions affected.
- Personal data categories and approximate data-subject/record counts.
- Whether sensitive data or children are involved.
- Discovery, access and containment timeline.
- Likely consequences and risk assessment.
- Notification decision, statutory clock, recipient and proof.
- Customer communications and advice to individuals.
- Evidence references, remediation, recovery and lessons learned.

## Readiness checklist

- [ ] On-call and escalation contacts are current.
- [ ] Cloudflare, Firebase and relevant vendor incident contacts are recorded.
- [ ] Logs are accessible to authorized responders and retained appropriately.
- [ ] Secrets/session revocation procedure has been tested.
- [ ] Customer notification templates are approved.
- [ ] Tabletop exercise completed at least annually.
- [ ] Backup restore and tenant isolation checks completed after a material incident.
