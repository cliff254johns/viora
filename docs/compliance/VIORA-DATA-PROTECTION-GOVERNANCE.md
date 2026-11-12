# VIORA Data Protection Governance Framework

**Status:** Internal implementation framework — legal review and management approval required.  
**Scope:** VIORA's own website, employee/customer operations and SaaS services, including customer tenants.

## 1. Applicable regimes and roles

- Kenya's Data Protection Act, 2019 and applicable 2021 regulations apply to processing within the Act's scope.
- GDPR applies where its territorial scope is met (for example, offering services to people in the EU or monitoring their behaviour); it should not be described as automatically applying to every global visitor.
- Other national laws may apply based on customer, data-subject and service locations.
- VIORA may be a **controller** for its own leads, website, workforce and account administration, and a **processor** when handling a customer's end-user data on that customer's documented instructions. Roles must be determined per processing activity, not by brand-wide assumption.

## 2. Required governance records

Maintain and review:
1. Record of Processing Activities (RoPA), purpose, categories, legal basis, recipients, locations and retention.
2. Data inventory and data-flow map for each portal and tenant.
3. Data subject request register with identity verification, deadline, decision and completion evidence.
4. DPIA register and approved assessments for high-risk processing.
5. Data breach/incident register, including near misses and remediation.
6. Subprocessor register, contracts, locations and transfer safeguards.
7. Access-control and privileged-account review register.
8. Retention schedule, deletion jobs and legal-hold register.
9. Backup/restore evidence and incident exercise reports.
10. Privacy notice, cookie preferences, DPA and customer instructions.

## 3. Data protection principles

Apply lawfulness, fairness, transparency, purpose limitation, data minimisation, accuracy, storage limitation, integrity/confidentiality and accountability. Record the lawful basis for each purpose. Do not rely on a single blanket consent for all processing.

## 4. Data subject rights workflow

Support access, correction, erasure where applicable, restriction/objection where applicable, portability where applicable, and withdrawal of consent where consent is the basis. Verify identity proportionately, record the request, identify every relevant system and processor, assess exemptions/legal holds, respond within applicable statutory deadlines, and retain an auditable completion record.

A browser export of currently loaded application state is not a substitute for a complete server-side export. Production export/deletion must cover Firebase records, object/file storage, logs, analytics, backups and subprocessors, with tenant scoping and authorization enforced by trusted services.

## 5. DPIA and sensitive processing

Before deploying high-risk processing, assess necessity, proportionality, risks to individuals, safeguards and residual risk. Particular scrutiny is required for health data, biometric data, children's data, large-scale monitoring, automated decisions and sensitive education/HR records. Obtain specialist advice and consult the ODPC where legally required.

## 6. Registration and accountability

Determine whether VIORA must register as a controller, processor or both under the Act and registration regulations. Record the ODPC certificate/reference, renewal date and scope if registration is required. Do not claim registration until documentary evidence exists.

Appoint an accountable privacy lead and determine whether a statutory Data Protection Officer is required. Publish a monitored privacy contact channel and a backup owner.

## 7. Security and incident management

Use least privilege, MFA for privileged users, secure secret storage, encryption, logging, vulnerability management, backups and tested recovery. The incident response plan in `VIORA-SECURITY-INCIDENT-RESPONSE.md` must be rehearsed at least annually and after material architecture changes.

Kenya DPA section 43: where the statutory threshold is met, a controller must notify the Data Commissioner without delay and within 72 hours of awareness; a processor must notify its controller without delay and, where reasonably practicable, within 48 hours. GDPR Article 33 has a 72-hour supervisory-authority notification rule where applicable, subject to its risk threshold and exceptions.

## 8. International transfers

Map each recipient and processing location. For Kenya-origin personal data, assess the Act's cross-border transfer requirements and applicable safeguards. For GDPR-covered data, assess Chapter V transfer mechanisms (such as adequacy or appropriate safeguards, as applicable), supplementary measures and transfer impact assessments where needed.

## 9. Tenant ownership and separation

Each customer tenant must have:
- A stable, immutable tenant identifier issued by a trusted service.
- Tenant-scoped records, files, logs, exports, backups and encryption/access boundaries.
- Server-side authorization on every read/write/export/delete operation.
- Negative tests proving Tenant A cannot read or mutate Tenant B data.
- A documented controller/processor relationship and customer data ownership terms.

The current main-system source includes `ROOT = 'viora_data'` and `ORG = 'orgs/viora'`. This is a VIORA workspace namespace; it is not proof that all separate customer-facing systems have complete tenant isolation. Do not migrate production paths or relax rules without a separately reviewed migration plan.

## 10. Approval checklist

- [ ] Legal counsel reviews privacy notice, DPA, retention and SLA.
- [ ] Management approves purposes, lawful bases and retention periods.
- [ ] ODPC registration applicability and status documented.
- [ ] Data inventory/RoPA complete for all portals.
- [ ] DPIAs completed where required.
- [ ] Subprocessor contracts and locations verified.
- [ ] Privileged MFA enforced and recovery tested.
- [ ] Rights requests and export/deletion tested end-to-end.
- [ ] Tenant isolation tests pass.
- [ ] Incident and backup restoration exercises pass.

## Official references

- Kenya Data Protection Act: https://www.odpc.go.ke/wp-content/uploads/2024/02/TheDataProtectionAct__No24of2019.pdf
- ODPC regulatory framework: https://odpc.go.ke/data-protection-laws-kenya/
- ODPC registration guidance: https://www.odpc.go.ke/wp-content/uploads/2024/02/ODPC-Guidance-Note-on-Registration-of-Data-Controllers-and-Data-Processors.pdf
- ODPC DPIA guidance: https://www.odpc.go.ke/wp-content/uploads/2024/02/ODPC-Guidance-Note-on-Data-Protection-Impact-assessment-1.pdf
- GDPR text: https://eur-lex.europa.eu/eli/reg/2016/679/oj
