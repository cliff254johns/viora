# VIORA Data Protection Implementation Pack (Draft)

**Status:** implementation draft — not a legal opinion, signed DPA, regulator registration, or certification.  
**Applies to:** VIORA Ecosystems platform and customer deployments, subject to each customer's configuration and actual processing instructions.  
**Owner:** VIORA management / designated privacy lead (to be assigned).  
**Review cadence:** quarterly and after any material product, vendor, hosting-region, or processing change.

## 1. Role allocation

VIORA's role must be determined per processing purpose, not assigned once for the whole platform.

| Processing purpose | Provisional role | Required control |
|---|---|---|
| Customer business records, staff, clients, orders, finance, inventory and learner records processed on customer instructions | Customer normally controller; VIORA normally processor | Written customer DPA and documented instructions |
| VIORA's own sales leads, website enquiries, account administration, billing contacts and marketing | VIORA normally controller | VIORA privacy notice, lawful-basis assessment, opt-out and retention rules |
| Jointly designed analytics or shared product improvement using identifiable customer data | Undetermined until purpose and decision-making are documented | Purpose-specific role assessment, notice, lawful basis and agreement |
| Vendor telemetry, security and service operations | Depends on provider contract and independent purposes | Vendor DPA, transfer review and subprocessor mapping |

Do not describe VIORA as only a processor or only a controller for every dataset. Each deployment must record the controller, processor, purpose, data categories, data subjects, lawful basis, locations and recipients.

## 2. Preliminary processing inventory

This inventory is a starting point inferred from the product architecture and must be reconciled against production Firebase paths, Storage buckets, Worker routes, logs, backups and each customer tenant.

| Data domain | Examples | Purpose | Access boundary / review |
|---|---|---|---|
| Identity and access | Account identifiers, email, roles, authentication metadata, push tokens | Authentication, authorization, account security | Tenant and role scope; minimize token and device metadata |
| Customer/CRM | Contact names, email, telephone, enquiries, deals and communications | Customer relationship and service delivery | Customer tenant; customer controller instructions |
| Finance and commerce | Invoices, payments, M-Pesa references, orders, balances, expenses | Transaction processing and accounting | Strict role permissions; financial audit trail |
| Workforce and education | Employee, learner, trainer, attendance, assessments and certificates | HR and education workflows | Sensitive/high-impact records require separate access and DPIA review |
| Support and operations | Tickets, activity logs, telemetry and error events | Support, reliability and security | Limit log contents; do not log secrets or message bodies unnecessarily |
| Files and media | Uploaded documents, profile images, certificates and attachments | Customer-requested storage and delivery | Tenant-scoped object paths, access checks, retention and deletion |
| Website and marketing | Enquiries, analytics, campaign and outreach records | VIORA's own marketing and business development | Notice, lawful basis, consent where required, opt-out |
| AI requests | Prompts, text submitted for translation/chat/AI assistance and generated output | User-requested AI feature | Minimize personal data, disclose vendor processing, avoid sensitive data unless approved |
| Push notifications | Device token, notification metadata and delivery status | User-requested device alerts | User opt-in, revocation, token deletion and payload minimization |

## 3. Preliminary vendor / subprocessor register

This is a technical discovery list, not proof that every vendor receives every category of personal data. Confirm actual use, contract entity, region, transfer mechanism, retention, support access and current DPA terms before publishing it as final.

| Provider / service | Observed platform purpose | Potential data exposed | Required verification |
|---|---|---|---|
| Google Firebase (Authentication, Realtime Database, Storage, Cloud Messaging) | Identity, application data, uploaded files and push messaging | Account identifiers, customer records, files, device tokens | Firebase project region, service terms, DPA, support access, subprocessors, transfer terms |
| Cloudflare Workers, Workers AI, R2, CDN and observability | Edge APIs, static assets, AI translation, backups, logs and traces | Request metadata, uploaded backup ciphertext, AI input where used, operational logs | Account location, AI data handling, R2 region, log retention, DPA and transfer terms |
| Groq | AI/chat inference where enabled | User prompts and context submitted to the model | Confirm active endpoints, retention/training terms, region, DPA and data minimization |
| Meta / WhatsApp Business Platform | WhatsApp messaging and inbound/outbound communication | Phone numbers, message content and delivery metadata | Confirm API route/provider, message template/consent controls, DPA and international transfer terms |
| External CDN/font/library providers | Delivery of fonts, scripts, styles and maps | Visitor IP, user agent, requested asset metadata | Inventory actual hosts, self-host where appropriate, privacy notice and minimization |

Only retain providers actually used in production. Add each new vendor before enabling it in production. Record contracting legal entity, service, data categories, processing region, transfer mechanism, DPA URL/version, subprocessor list URL, review date and owner.

## 4. Customer Data Processing Agreement (DPA) — clause checklist

A customer DPA must be executed before VIORA processes personal data on that customer's behalf. Populate the schedules for each customer; do not use this draft as a signed agreement.

1. **Parties and roles:** identify customer controller and VIORA processor, including contact details and any joint-controller exception.
2. **Subject matter and duration:** describe subscribed VIORA services and the agreement term plus controlled return/deletion period.
3. **Nature and purpose:** process only to host, secure, support and operate customer-configured services under documented instructions.
4. **Data and data subjects:** specify customer, staff, supplier, client, learner, patient or other data categories actually used.
5. **Documented instructions:** include service configuration, support requests, exports, deletion and lawful transfer instructions.
6. **Confidentiality:** bind authorized personnel to confidentiality and least-privilege access.
7. **Security:** describe access controls, MFA, encryption, tenant isolation, backup, logging, vulnerability management and incident response accurately; mark controls not yet verified as pending.
8. **Subprocessors:** identify approved subprocessors, provide change notice and a reasonable objection mechanism; flow down equivalent obligations.
9. **Assistance:** help the controller respond to data-subject requests, security incidents, DPIAs and regulator enquiries.
10. **Breach notification:** notify the controller without undue delay under the agreed service-level deadline; provide available facts and updates.
11. **International transfers:** identify countries, recipients and valid safeguards before transfers.
12. **Return and deletion:** at termination, return data or securely delete it as instructed, subject to documented legal retention and backup expiry.
13. **Audit and evidence:** provide reasonable audit evidence and a controlled inspection process.
14. **Liability and precedence:** align with the master services agreement and applicable law.

### DPA schedule — complete per customer

- Customer legal name / registration number:
- Customer controller contact / DPO:
- VIORA contracting entity / address:
- Services and tenant IDs:
- Processing start and end dates:
- Data categories:
- Data-subject categories:
- Processing locations and transfer destinations:
- Approved subprocessors:
- Security measures and evidence:
- Support access model:
- Retention and backup expiry:
- Return/deletion instructions:
- Incident contact and notification SLA:
- Audit evidence and review date:

## 5. Retention and deletion schedule — proposed control framework

Do not apply one universal retention period to all records. The data owner must document purpose, legal obligation, limitation period, customer instruction and deletion trigger for each record class.

| Record class | Retention rule to implement | Current evidence |
|---|---|---|
| Active tenant operational data | Keep while contract is active and necessary for documented service purpose | Per-tenant lifecycle and deletion automation not yet verified |
| Customer data after termination | Export/return window followed by deletion on controller instruction; document any legal hold | Not yet verified end-to-end |
| Financial, tax and statutory records | Retain only for applicable statutory period and legal claims; customer/controller sets jurisdiction-specific schedule | Requires legal/tax review per customer jurisdiction |
| Authentication and security logs | Retain only for a defined security purpose and approved period; exclude credentials, tokens and message content | Cloudflare observability is enabled; retention policy still needs confirmation |
| Support and communications records | Retain only while needed for support, disputes, legal obligations or customer instructions | No verified automated lifecycle |
| Uploaded files and generated exports | Follow parent record retention; expire temporary exports promptly | Not yet verified |
| Backups | Encrypted daily recovery points for 35 days and monthly recovery points for 12 months are the intended design; preserve legal-hold snapshots separately | R2 is not enabled on the account; backup lifecycle is not operational |
| Marketing leads | Retain while purpose remains valid; suppress or delete after opt-out/expiry according to approved policy | Needs CRM enforcement |

Required engineering controls:
- Record creation/update timestamps, retention class, retention deadline, legal-hold flag, tenant ID and deletion status where appropriate.
- A scheduled deletion worker must process only expired records and re-check legal holds, ownership and customer instructions.
- Delete or anonymize related indexes, search documents, cached copies, file objects, derived exports and notification tokens.
- Record deletion evidence without retaining the deleted personal data.
- Backups expire under a documented lifecycle; explain that deletion from live systems may not immediately erase immutable recovery points, and ensure restored backups reapply deletion tombstones before customer access.
- Retention periods require legal approval before being activated as production defaults.

## 6. Data-subject request workflow

Provide a public privacy contact and a verified request channel. Do not disclose data based only on an email address or an unverified support ticket.

1. Register request ID, received date, requester, tenant/customer, right requested and deadline.
2. Verify identity proportionately; for customer tenant data, route the request to the controller unless VIORA has delegated authority.
3. Determine whether request is access, correction, objection, erasure, restriction, portability or consent withdrawal.
4. Identify records across Realtime Database, Authentication, Storage, Worker logs, communication providers, AI vendors, analytics and backups.
5. Apply legal exemptions, statutory retention and third-party rights; document the reason for any refusal or partial response.
6. Export in a structured, commonly used machine-readable format where portability applies; include metadata and file references where appropriate.
7. Correct or delete records and derived copies under the controller's instructions; revoke sessions and push tokens where required.
8. Confirm completion to requester/controller and record systems, date, operator and evidence.
9. Track unresolved vendor/backup deletion separately and close only when the stated process is complete.

### Export and deletion implementation requirements

- Admin-only and tenant-scoped endpoints; never accept a client-supplied tenant ID as authority.
- Derive tenant and user identity from verified authentication claims and server-side membership.
- Export JSON/CSV plus a manifest of included datasets, date range, schema version and omitted categories.
- Package files in short-lived encrypted archives; issue one-time download URLs and expire them.
- Deletion must be a server-side workflow with preview, approval, idempotency key, legal-hold check, related-object cleanup, retry queue and immutable audit event.
- Do not hard-delete accounting records where law requires retention; restrict access and minimize instead.
- Test cross-tenant denial for every export and deletion route.

## 7. Security incident response

**Initial operating target:** immediately triage and contain; processor-to-controller notification target no later than 24 hours internally (stricter than the Kenyan 48-hour processor notification requirement where applicable); controller/regulator timelines are assessed by the responsible controller/privacy lead. Kenyan law requires regulator notification within 72 hours in the circumstances set out in section 43. GDPR Article 33 has a 72-hour supervisory-authority deadline where applicable.

1. Detect and record incident, time discovered, affected service, tenant and reporter.
2. Assign incident commander and privacy lead; preserve logs and evidence.
3. Classify confidentiality, integrity and availability impact; identify personal data and affected individuals.
4. Contain compromised credentials, tokens, deployments, routes or accounts; preserve evidence before destructive remediation.
5. Notify affected customer controllers promptly under the DPA and contract; provide known facts, scope, mitigations and next update time.
6. Assess regulator and data-subject notification duties with counsel; document rationale and deadlines.
7. Recover from known-good backups only after integrity and isolation checks.
8. Conduct root-cause analysis, corrective actions and post-incident review.
9. Maintain a breach register, including incidents not ultimately reportable.

## 8. Privacy by design, DPIA and international transfers

- Complete a DPIA before high-risk processing, including large-scale sensitive data, children, health/education records, profiling or AI-supported decisions.
- Document lawful basis and purpose for each processing activity; do not treat consent as the default for every business workflow.
- Provide clear notices at collection, including recipient categories, purposes, rights, retention and transfers.
- Review whether customer data is sent to AI services; disable or redact sensitive inputs by default unless a documented customer instruction and lawful basis permit it.
- Map data locations and transfers across Kenya, the EU/EEA and other regions. Obtain the applicable adequacy, safeguards or consent basis before enabling transfers.
- Apply data minimization, role-based access, MFA, encryption in transit/at rest, tenant isolation, secure development, vulnerability management and supplier reviews.
- Verify ODPC registration obligations and exemptions for VIORA and each customer category with Kenyan counsel.

## 9. Evidence and release gates

Do not mark this pack complete until the following evidence is attached:

- [ ] Signed VIORA privacy policy and customer-facing notices, reviewed by counsel.
- [ ] ODPC registration applicability assessment and any required registration certificate.
- [ ] DPO/privacy lead appointment and published contact details, if required.
- [ ] Executed customer DPAs and approved subprocessor list.
- [ ] Vendor DPAs, transfer safeguards and regional data-location record.
- [ ] Approved retention schedule and working deletion jobs, including backup expiry.
- [ ] Working export and deletion workflows with tenant-isolation tests.
- [ ] DPIA for high-risk processing and AI use cases.
- [ ] Incident-response contacts, tabletop exercise and breach register.
- [ ] MFA enforcement evidence for privileged users.
- [ ] Independent security, accessibility and privacy review.

## 10. Primary legal references

- Kenya Data Protection Act, 2019 (Cap. 411C): https://new.kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31
- Data Protection (General) Regulations, 2021: https://new.kenyalaw.org/akn/ke/act/ln/2021/263/eng@2022-12-31
- Office of the Data Protection Commissioner legal framework: https://www.odpc.go.ke/data-protection-laws-kenya/
- GDPR (EU) 2016/679: https://eur-lex.europa.eu/eli/reg/2016/679/oj

**Legal review required:** confirm current consolidated law, sector-specific retention, registration, cross-border transfer safeguards, controller/processor allocation, customer contracts and any exemptions with qualified Kenyan and (where relevant) EU counsel.
