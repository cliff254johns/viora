# VIORA Ecosystems — Outreach Privacy & Direct-Marketing Legal Review Package

**Status:** Draft for qualified legal review — NOT approved, NOT a legal opinion, and NOT authorization to send marketing.
**Prepared:** 13 November 2026
**Owner:** VIORA Ecosystems
**Website:** https://viora.co.ke
**Privacy notice currently in repository:** `web/privacy.html`
**Release candidate:** `release/outreach-controlled-rollout` / PR #69
**Decision:** HOLD outbound prospect marketing until every applicable legal, evidence, technical and human-approval gate is satisfied.

> This package is an engineering and issue-spotting brief for an independent qualified privacy/legal professional. It does not replace advice from Kenyan counsel, UK counsel where UK law applies, or US counsel where US law applies. No reviewer identity, qualification, approval, signature or address verification is represented as having occurred.

---

## 1. Executive decision requested from counsel

VIORA is a Kenya-based provider of bespoke digital ecosystems and related services. It proposes to conduct targeted business-to-business prospect outreach, initially using email, to businesses in selected jurisdictions. The proposed operating model is:

- Kenya: consent-first. Do not send prospect marketing email unless VIORA can evidence the data subject supplied the personal data for the marketing purpose, was informed, gave valid consent, and has not opted out. Do not treat a public business email address as consent.
- United Kingdom: consider email only where the recipient is demonstrably a corporate subscriber for PECR purposes, and only after UK GDPR lawful-basis, transparency, relevance, balancing, objection and suppression checks. Sole traders and certain partnerships must be treated as individual subscribers; absent a valid exception, do not email them without consent.
- United States: commercial email must comply with CAN-SPAM regardless of B2B status, including accurate headers, non-deceptive subject, clear ad identification, valid physical postal address, functioning opt-out, and timely suppression.
- Other jurisdictions: out of scope for approval by this package. Default deny until a country-specific review and gate are documented.
- Human approval: every prospect/message release must have an authorized human approval tied to the exact recipient, message content, jurisdiction, evidence snapshot and policy version.
- Technical control: default-deny. Missing, stale, conflicting or unverifiable evidence must block release. Uncertain provider outcomes must not be blindly retried.

**Counsel is asked to confirm or correct** the legal analysis, country classification, lawful bases, notice content/timing, consent evidence standard, retention, international transfers, and the precise conditions under which the described workflow may be used.

## 2. Business and processing description — confirm with owner

### 2.1 Controller and contact details

Current website notice identifies “VIORA Ecosystems” as the business and lists:

- Privacy contact: support@viora.co.ke
- Telephone: +254 713 428 774
- Website: https://viora.co.ke
- Business location previously supplied by owner: Nairobi, Kenya
- Postal information previously supplied by owner: “60200-45 Meru, Kenya”

**Verification required:** legal entity/registered business name, registration number and registered address; whether the postal information is a valid deliverable postal address; and whether the correct controller identity differs by VIORA entity or territory. Do not publish an unverified physical/postal address as satisfying US law.

### 2.2 Purpose and data categories

Proposed purpose: identify relevant businesses, assess fit for VIORA services, prepare and (only when authorized) send targeted business marketing, manage objections and suppress future marketing.

Potential personal data:
- Business contact name, job title, work email, business phone and employer.
- Business name, website, sector, country and publicly stated business needs.
- Source URL/name, collection date, source category and whether information was supplied by the individual.
- Consent wording/version, affirmative action, timestamp, channel, purpose and withdrawal.
- UK corporate-subscriber classification, corporate status evidence, LIA and balancing outcome.
- Privacy notice version, delivery date/time, method and delivery evidence.
- Message content/version, sender identity, approval identity/time and provider result.
- Objection/unsubscribe event, timestamp, channel and suppression status.
- Technical metadata needed for security, audit and delivery.

Do not collect sensitive personal data, personal email addresses, personal phone numbers, inferred private attributes or unrelated profile information for this workflow. Do not scrape or enrich beyond a documented lawful and proportionate source.

### 2.3 Roles and providers

Confirm whether VIORA is controller for its own prospecting and whether any third-party research, CRM, hosting, email, analytics or AI provider acts as processor, independent controller or subprocessor. Confirm current contracts, locations, subprocessors, security settings, retention and international transfer safeguards for Cloudflare, Google/Firebase, Gmail/Google Workspace and any other actual provider. The privacy notice must not state a transfer mechanism or storage location that has not been verified.

### 2.4 Retention proposal for counsel

The live privacy notice currently says enquiry/demo data may be retained up to 24 months after last contact, marketing consent records for as long as active plus a reasonable period, and access logs typically 90 days. These are policy statements, not proof of technical deletion or actual retention settings.

Counsel and the owner must approve a schedule by data class. Proposed engineering rule:
- Prospect data: shortest documented period needed for qualification and follow-up; delete or anonymize when expired.
- Consent/LIA/notice/message/approval evidence: retain only for a counsel-approved limitation/compliance period.
- Suppression data: retain a minimal normalized identifier and suppression reason for as long as necessary to prevent re-contact, with restricted access.
- Provider logs: follow documented provider and VIORA retention settings.
- Legal hold: preserve only when a documented legal requirement applies.

Do not claim retention enforcement until scheduled deletion and audit evidence are tested.

---

## 3. Kenya legal review — consent-first and indirect collection

### 3.1 Primary provisions for counsel

Official source: Kenya Data Protection (General) Regulations, 2021, published by the Office of the Data Protection Commissioner (ODPC):
https://www.odpc.go.ke/wp-content/uploads/2024/03/THE-DATA-PROTECTION-GENERAL-REGULATIONS-2021-1.pdf

Relevant provisions to verify against the current consolidated law:
- Regulation 4: where consent is used, inform the person of controller/processor identity, each purpose, data types, relevant automated decision-making, transfer risks where applicable, sharing, withdrawal and consequences; consent must be voluntary, specific and purpose-specific. Silence or failure to object is not consent.
- Regulation 5: a non-consent lawful basis must be established before processing and demonstrable; distinguish bases where multiple purposes are processed.
- Regulation 6(1)–(3): indirect collection can occur from third parties, publications/databases and other listed sources; collection must be limited to data permitted, accurate, secured and lawfully processed; where data is collected indirectly, the data subject must be informed within fourteen days.
- Regulation 6(4)–(5): new purposes must be compatible with the original purpose; where incompatible, fresh consent is required.
- Regulation 8(4)–(5): objection to direct marketing is an absolute right; once objected, the data must not be processed for direct marketing.
- Regulation 15(1): permitted direct marketing use is framed cumulatively: data collected from the data subject; direct marketing identified as a collection purpose; consent to use/disclosure for direct marketing; simplified opt-out; and no prior opt-out request.
- Regulation 15(2)–(3): provide a free address/channel for restriction requests and do not disguise identity or omit a valid cessation-request address from electronic direct marketing.
- Regulations 16–18: opt-out must be clear, easy, accessible and implemented; no further direct marketing after opt-out.

**Critical interpretation for counsel:** the 14-day indirect-collection notice is a transparency duty; it is not itself consent and does not appear to cure Regulation 15(1)(a)'s requirement that data used for direct marketing be collected from the data subject. VIORA's conservative control is therefore to block Kenyan prospect marketing based solely on third-party/publicly sourced personal contact data, even if a notice is sent within fourteen days. Counsel must confirm the correct application to the exact data and message model.

### 3.2 Required Kenya release evidence

For every Kenyan individual contact, require:
1. Source classification and evidence that the individual supplied the data directly to VIORA.
2. The exact consent notice shown at collection, version/hash, date/time, channel and affirmative action.
3. Clear separation of marketing consent from service/account terms; no pre-ticked box or silence-as-consent.
4. Evidence that marketing was named as a purpose and that the person consented to that purpose.
5. Current status showing consent has not been withdrawn and no objection/suppression exists.
6. Exact message and sender identity, with visible, no-cost opt-out method.
7. Human approval bound to recipient + message hash + jurisdiction + evidence version.
8. If the data was indirectly obtained, collection source/date and a notice delivery record within fourteen days; however, do not release marketing unless counsel confirms the data also satisfies Regulation 15.

### 3.3 Required Kenya engineering controls

- Default deny for Kenya if consent record is absent, invalid, purpose-mismatched, withdrawn or not directly attributable to the data subject.
- Default deny for third-party/public-source personal data for marketing unless counsel-approved exception is explicitly modeled.
- Notice deadline calculated from actual collection timestamp, not import or review timestamp.
- Store notice version, channel, attempted/sent/delivered status, timestamp and provider message ID; distinguish sent from delivered.
- Absolute suppression on objection, including profiling used for direct marketing.
- Suppression check immediately before provider call, not only when campaign is drafted.
- Audit trail must be append-only or tamper-evident; corrections must not erase the original evidence.
- No use of sensitive personal data for this workflow.

### 3.4 Counsel questions — Kenya

- Confirm interpretation and interaction of DPA sections 28, 30, 32, 36 and 37 with Regulations 4–8 and 14–18 for targeted B2B email.
- Does Regulation 15(1)(a) prohibit marketing to an employee contact whose details were sourced from a public company website, even after a 14-day notice and valid consent subsequently obtained? What is the correct compliant acquisition path?
- Does the direct-collection condition apply differently to generic corporate inboxes that do not identify an individual?
- What evidence is sufficient to establish “collected from the data subject” and valid consent?
- Are any registration, DPO, DPIA, cross-border transfer or sector-specific obligations triggered by VIORA's actual scale, providers or data flows?
- Confirm the applicable ODPC registration status and any required updates.

---

## 4. United Kingdom legal review — corporate B2B and legitimate interests

### 4.1 Primary official guidance

ICO, Business-to-business marketing:
https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/

ICO guidance currently states:
- PECR's email-consent rule does not apply to corporate subscribers (for example, companies and LLPs with separate legal personality), but sender identity must not be concealed and a valid opt-out address must be provided.
- Sole traders and certain partnerships are individual subscribers and receive the individual-subscriber protections; absent a valid exception, consent is required for electronic mail marketing.
- UK GDPR still applies where a named business contact or other personal data is processed.
- When data is collected directly, privacy information must be provided at collection; where collected indirectly, privacy information must be provided within a reasonable period and no later than one month, subject to the applicable exceptions and earlier communication triggers.
- Individuals may object to direct marketing; the objection right is absolute for direct marketing.

The ICO page states its B2B guidance is under review following changes made by the Data (Use and Access) Act. Counsel must check commencement, transitional provisions and updated guidance at the date of sign-off. Do not rely on an outdated saved summary.

### 4.2 Recipient classification

Before any UK release, classify and evidence:
- Corporate subscriber: separate legal personality (e.g. limited company or LLP); record source/evidence and date checked.
- Individual subscriber: sole trader, ordinary partnership or uncertain/unincorporated recipient; do not send marketing email without valid consent or a counsel-confirmed exception.
- Generic corporate inbox: may be a corporate subscriber, but still verify sender identity, opt-out, relevance and lawful data processing if any personal data is involved.
- Named employee: personal data even when used in a business capacity; UK GDPR transparency, lawful basis, minimisation, accuracy and objection controls apply.

If status cannot be confidently established, default to individual-subscriber treatment and block unless consent/exception is evidenced.

### 4.3 Legitimate-interest assessment (LIA) template — complete per campaign/recipient cohort

**A. Purpose test**
- What specific legitimate interest is pursued?
- Is it a real, present and lawful business interest?
- How is the proposed VIORA service relevant to this recipient's actual business role/sector?
- Is the interest VIORA's, a third party's, or both?

**B. Necessity test**
- Why is processing this named person's work contact data necessary?
- Could a less intrusive method achieve the same result (generic business inbox, inbound enquiry, contextual advertising, partnership introduction)?
- Is the data limited to role-relevant business contact information?
- What source and collection method were used? Was the source's use consistent with its terms and reasonable expectations?

**C. Balancing test**
- Would the individual reasonably expect this processing?
- What is the relationship between the person and VIORA?
- Is the message proportionate, relevant, low frequency and clearly identified as marketing?
- Could the processing cause harm, distress, embarrassment or loss of control?
- What safeguards apply: first-contact transparency, simple opt-out, no sensitive data, frequency cap, suppression, human review, limited retention?
- Does the individual's right to object or any prior objection defeat the proposed contact?

**Decision:** pass / fail / further legal review required.
**Approver:** name, role, qualification/authority, date, version and signature.
**Review trigger:** change of purpose, data source, message category, target role, jurisdiction, law/guidance or material complaint.

A generic LIA template is not sufficient by itself. Complete and approve the actual balancing analysis for the defined processing and audience. A legitimate interest under UK GDPR does not override a PECR consent requirement for an individual subscriber.

### 4.4 Article 14 privacy information evidence

For indirectly sourced personal data, record:
- data subject identity/contact record and source category/source URL;
- collection date/time;
- privacy notice version and exact content;
- delivery date/time and channel;
- delivery status/provider ID where available;
- whether first communication or disclosure to another recipient occurred earlier than the one-month outer limit;
- applicable exception and documented legal rationale, if relied upon.

Do not treat a policy being available on the website as proof that the individual was informed. Do not claim delivery solely because an email API accepted a message.

### 4.5 UK technical release gates

- Corporate-subscriber classification required and source evidenced.
- Sole traders/ordinary partnerships/unknown status blocked unless valid consent or counsel-approved exception.
- UK GDPR lawful basis selected and documented before processing; LIA complete where legitimate interests is relied upon.
- Data source and reasonable-expectations assessment recorded.
- Article 14 notice timing and evidence complete.
- Sender identity and valid opt-out route included.
- Absolute direct-marketing objection/suppression enforced before each send.
- Frequency, relevance and minimisation checks.
- Human approval for exact message/recipient snapshot.

### 4.6 Counsel questions — UK

- Confirm corporate-subscriber definitions for each target legal form and how VIORA should handle generic mailboxes, franchises and subsidiaries.
- Confirm current PECR/UK GDPR position after Data (Use and Access) Act commencement and current ICO guidance.
- Confirm whether the proposed recipient-specific LIA is sufficiently granular or whether a campaign/cohort LIA plus recipient-level relevance assessment is acceptable.
- Confirm Article 14 notice content and timing, including the first-communication rule and exceptions.
- Confirm applicable UK representative, international transfer and processor-contract obligations for VIORA's actual operations.

---

## 5. United States legal review — CAN-SPAM

### 5.1 Primary official source

Federal Trade Commission, CAN-SPAM Act: A Compliance Guide for Business:
https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business

The FTC guidance confirms CAN-SPAM applies to commercial email, including B2B messages. Requirements include:
- accurate From/To/Reply-To and routing information;
- non-deceptive subject lines;
- clear and conspicuous identification that the message is an advertisement, where required;
- a valid physical postal address;
- a clear, functioning opt-out mechanism;
- honoring opt-outs within ten business days and ensuring the mechanism remains available for at least thirty days after sending;
- no transfer/sale of opted-out email addresses except for compliance purposes;
- responsibility cannot simply be outsourced to an email provider or agency.

### 5.2 Address evidence — mandatory hold point

The FTC says the address may be a current street address, a PO Box registered with the US Postal Service, or a private mailbox registered with a qualifying commercial mail receiving agency under USPS rules.

VIORA's owner previously supplied:
- Business location: Nairobi, Kenya.
- Postal information: “60200-45 Meru, Kenya”.

This information is **not yet verified** as a valid physical postal address under CAN-SPAM. A Kenyan postal address may not fit the US statutory categories without legal analysis and documentary evidence. Do not label it “verified” or use it to release US marketing until counsel confirms suitability.

Evidence to obtain:
- official postal provider documentation identifying the address and addressee;
- proof that the address is current and can receive mail;
- if relying on a PO Box, evidence of registration with the relevant postal authority;
- if relying on a private mailbox, evidence of registration with a qualifying commercial mail receiving agency;
- counsel's written confirmation that the address satisfies the statutory definition for VIORA as sender;
- date checked, reviewer and evidence file reference.

### 5.3 US message controls

- Clearly identify commercial advertising in a clear and conspicuous way.
- Accurate From identity, domain and reply route; no misleading sender or subject.
- Valid, counsel-verified physical postal address in every commercial message.
- Working opt-out link or reply method, no account login or fee.
- Opt-out requests processed within ten business days; operational target should be immediate suppression.
- Opt-out mechanism remains operational for at least thirty days after each message.
- No commercial sends after opt-out; suppress at address and appropriate person/account level.
- Maintain suppression list and evidence; never repurpose the list for marketing.
- Human approval of the exact commercial message.

### 5.4 Counsel questions — US

- Confirm application of CAN-SPAM to VIORA's commercial B2B messages and whether any additional state privacy laws, state mini-TCPA or sector-specific requirements apply to the intended channels.
- Confirm whether the supplied Kenyan postal details satisfy the valid physical postal address requirement; if not, specify acceptable alternative.
- Confirm the advertisement-identification language and placement in the actual HTML/plain-text templates.
- Confirm opt-out implementation, 10-business-day deadline, 30-day mechanism availability and responsibility for provider/agency conduct.

---

## 6. Cross-jurisdiction controls and evidence model

### 6.1 Minimum evidence record per contact

Required fields (exact storage schema may differ, but semantics must be preserved):
- stable contact ID; tenant/controller ID;
- jurisdiction and evidence for location determination;
- business name, legal form, sector, role and relevance rationale;
- contact channel and whether it identifies a natural person;
- source category, source URL/reference, collection timestamp and direct/indirect flag;
- source permission/terms review where applicable;
- consent status, timestamp, wording/version, purpose, affirmative action, channel and withdrawal history;
- UK subscriber type, evidence and date verified;
- LIA ID/version, purpose/necessity/balancing findings, decision, approver and review date;
- notice version, notice content hash, sent/attempted/delivered timestamps, channel and provider reference;
- suppression/objection state and event history;
- campaign ID, exact message hash, sender profile, approval identity/time;
- send decision, gate outcomes, provider acceptance/delivery/bounce/uncertain state;
- retention class, expiry date and deletion evidence.

Never store secrets, full authentication tokens or unnecessary sensitive data in the evidence record.

### 6.2 Pre-send decision sequence

1. Resolve jurisdiction; unknown/unsupported jurisdiction = block.
2. Validate source, data minimisation, accuracy and lawful acquisition.
3. Apply jurisdiction-specific recipient classification.
4. Validate consent or lawful basis and, for UK, subscriber rules.
5. Validate required notice and timing evidence.
6. Check current suppression/objection state immediately before send.
7. Validate exact message template, sender identity, address and opt-out controls.
8. Validate frequency/relevance and campaign purpose.
9. Require human approval bound to exact recipient + message hash + evidence snapshot.
10. Re-check mutable gates and suppression immediately before provider invocation.
11. Persist attempt before provider call; on uncertain result mark uncertain and prohibit blind retry.
12. Preserve provider result and audit evidence; distinguish accepted, delivered, bounced and uncertain.

### 6.3 Fail-closed conditions

Block if any required item is missing, ambiguous, expired, inconsistent or cannot be verified. Block if legal basis/consent does not match purpose, source or jurisdiction. Block if a person objects, unsubscribes or is on a suppression list. Block if human approval is missing or the message changes after approval. Do not downgrade a blocked record to an allowed status through a UI-only field.

### 6.4 Human approval evidence

Approval record must include:
- approver's verified identity and role/authority;
- timestamp and timezone;
- campaign and recipient IDs;
- exact subject/body or immutable message hash;
- jurisdiction and eligibility evidence snapshot;
- legal control version;
- approval decision and any conditions;
- revocation/change history.

A generic campaign approval is not approval of a changed recipient list or changed message.

---

## 7. Existing privacy notice — issue register; do not publish changes yet

File reviewed: `web/privacy.html` on the release candidate. The page currently states last updated/effective 12 November 2026 and includes claims about VIORA's legal identity, founding date, data storage, encryption, international transfers, SCCs, retention and service providers.

Counsel/owner must validate or revise at least these points:

| Topic | Current notice statement / gap | Evidence needed before final text |
|---|---|---|
| Controller identity | “VIORA Ecosystems”, Kenya registration, founded 2022 | Legal entity name, registration and registered/contact address |
| Online-only status | Says VIORA is online-only | Confirm whether physical operations/locations contradict this |
| Data sources | Lists user-provided, automated and limited third-party data; does not describe prospect enrichment/research adequately | Actual source inventory and collection methods |
| Marketing | Table says consent (or soft opt-in for existing customers); does not explain Kenya direct-source restrictions or UK corporate B2B distinctions | Approved jurisdictional policy and exact channel practices |
| Indirect notices | No clear operational description of source categories and notice timing | Kenya 14-day and UK Article 14 workflows/evidence |
| Legitimate interests | General references only; no marketing LIA explanation or rights balancing | Counsel-approved purposes, LIA and objection route |
| Providers | Names Cloudflare, Google/Firebase, payment processors and email providers generically | Current provider/subprocessor inventory and contracts |
| International transfers | Names EEA, UK, US and SCCs in general terms | Actual data locations, transfer routes, applicable safeguards and transfer assessments |
| Retention | States 24 months, 12 months, 90 days and “reasonable period” | Approved schedule plus evidence of deletion/retention enforcement |
| Security | Broad encryption/logging/backup claims | Configuration and operational evidence; qualify unsupported claims |
| Rights | Summarizes rights and response periods generally | Jurisdiction-specific rights and operational response process |
| Children | States services not directed to under-18s | Confirm actual products and any education/learner services where minors may be involved |
| Contact details | support@viora.co.ke and Kenyan phone | Verify mailbox, operational response route and controller contact |

The current notice must not be altered/published as an approved notice until counsel signs the final text and the owner confirms operational facts. A website notice alone does not create missing consent or retroactively cure missing notices.

---

## 8. Firebase emulator and authorization test plan

### 8.1 Required separate identities

Create emulator-only test users, never production users:
- Admin identity: dedicated synthetic account with the intended admin custom claim/role.
- Non-admin identity: separate synthetic account with ordinary user claims and no admin privilege.
- Unauthenticated identity: no ID token.
- Optional tenant-A and tenant-B ordinary users for isolation tests.

Use emulator-issued tokens only. Do not copy production tokens, passwords, service account keys or private customer data into CI.

### 8.2 Required test cases

| Test | Admin expected | Non-admin expected | Unauthenticated expected |
|---|---|---|---|
| Read protected admin configuration | Allow only if rules authorize | Deny | Deny |
| Write protected admin configuration | Allow only if rules authorize | Deny | Deny |
| Change own non-privileged profile | Per rules | Per rules | Deny |
| Grant self admin/custom claims | Deny client-side | Deny | Deny |
| Write consent evidence | Only through authorized workflow | Only own/authorized workflow | Deny |
| Change another person's consent | Deny unless explicit privileged workflow | Deny | Deny |
| Add/remove suppression | Authorized service/admin workflow only | No unauthorized removal | Deny |
| Read another tenant's leads | Deny unless explicit platform-admin scope | Deny | Deny |
| Write another tenant's leads/history | Deny unless explicit platform-admin scope | Deny | Deny |
| Modify immutable audit history | Deny or append-only service operation | Deny | Deny |

Tests must assert both allowed and denied cases. “Admin can do everything” is not the acceptance criterion; least privilege and explicit role scope are.

### 8.3 Current repository test status

The current `tests/integration/firebase-emulator.test.mjs` is opt-in:
- Auth test requires `FIREBASE_AUTH_EMULATOR_HOST` and `FIREBASE_DATABASE_EMULATOR_HOST`.
- Tenant isolation test requires `FIREBASE_TEST_ID_TOKEN` and optionally a second token.
- Admin/non-admin protected-path test requires `FIREBASE_AUTHZ_PROBE_PATH`, `FIREBASE_ADMIN_ID_TOKEN` and `FIREBASE_NONADMIN_ID_TOKEN`.

When those environment variables are absent, tests are skipped. A green CI job with skipped tests is not proof that emulator authorization was tested.

Acceptance evidence required:
- emulator config and exact rules file loaded;
- emulator startup logs and version;
- separate admin/non-admin/unauthenticated identities created in emulator;
- custom claims assigned only via emulator Admin SDK;
- test output with zero skipped required authorization tests;
- negative assertions for unauthorized writes and cross-tenant reads/writes;
- CI artifact with sanitized results and commit SHA;
- no production Firebase write or token use.

---

## 9. Legal review sign-off — intentionally blank

No approval is claimed. The independent reviewer must complete every field.

**Reviewer full name:** ____________________________________

**Professional qualification / regulator / jurisdiction:** ____________________________________

**Firm / organization:** ____________________________________

**Engagement reference and conflict check:** ____________________________________

**Jurisdictions reviewed:** Kenya / United Kingdom / United States / Other: __________

**Materials and versions reviewed (including commit SHA):** ____________________________________

**Legal sources checked and date checked:** ____________________________________

**Findings / required amendments:** ____________________________________

**Kenya approval or conditions:** ____________________________________

**UK approval or conditions:** ____________________________________

**US approval or conditions:** ____________________________________

**Postal-address suitability opinion and evidence reference:** ____________________________________

**Privacy notice final version/hash:** ____________________________________

**Technical controls reviewed and limitations:** ____________________________________

**Decision:** APPROVED / APPROVED SUBJECT TO CONDITIONS / NOT APPROVED

**Conditions and owner:** ____________________________________

**Reviewer signature:** ____________________________________

**Date and timezone:** ____________________________________

**Next review trigger/date:** ____________________________________

A reviewer must not sign unless they have actually reviewed the underlying system, source records, data flows, actual message templates and final privacy notice.

---

## 10. Release checklist and evidence ledger

| Gate | Required evidence | Current status |
|---|---|---|
| Kenya consent-first | Direct-source proof + exact affirmative consent + purpose + timestamp + withdrawal/suppression check | NOT VERIFIED |
| Kenya indirect notice | Collection timestamp + notice version + delivery attempt/result within 14 days; counsel interpretation of Regulation 15 condition | NOT VERIFIED |
| UK subscriber classification | Legal form/source evidence and classification per recipient | NOT VERIFIED |
| UK LIA | Completed, balanced, approved assessment tied to processing/campaign | NOT VERIFIED |
| UK Article 14 | Notice version and timestamp/channel evidence within applicable period | NOT VERIFIED |
| US ad identification | Exact HTML/plain-text message test and rendered evidence | NOT VERIFIED |
| US postal address | Official documentation and qualified legal confirmation | NOT VERIFIED |
| Unsubscribe/suppression | End-to-end test; immediate operational suppression; US statutory timing | ENGINEERING REVIEW REQUIRED |
| Human release approval | Immutable approval for exact recipient and message | NOT VERIFIED |
| Legal review | Qualified reviewer identity, credentials, signed dated outcome | NOT OBTAINED |
| Privacy notice | Final legal-approved text, publication commit and live verification | NOT PUBLISHED |
| Firebase emulator | Separate admin/non-admin/unauthenticated identities; no required skips; artifacts | NOT RUN WITH IDENTITIES |
| Production controls | Live guard verified on every active Worker version and all send paths | NOT VERIFIED |
| Global release | All applicable gates passed and owner release decision | HOLD |

### Evidence ledger fields

For each item, record: ID, requirement, evidence file/URL, owner, reviewer, source version/hash, collected timestamp, verification result, expiry/review date, unresolved issue and release impact. Evidence must be reproducible and must not contain credentials or unnecessary personal data.

---

## 11. Official sources for reviewer

1. Kenya ODPC, Data Protection (General) Regulations, 2021 (official PDF): https://www.odpc.go.ke/wp-content/uploads/2024/03/THE-DATA-PROTECTION-GENERAL-REGULATIONS-2021-1.pdf
2. Kenya ODPC, Data Protection Laws Kenya (Act and regulations index): https://www.odpc.go.ke/data-protection-laws-kenya/index.html
3. UK ICO, Business-to-business marketing: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/
4. UK ICO, Marketing and data protection in detail: https://ico.org.uk/for-organisations/advice-for-small-organisations/direct-marketing-and-data-protection/marketing-and-data-protection-in-detail/
5. US FTC, CAN-SPAM Act: A Compliance Guide for Business: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business

Counsel should check current amendments, commencement dates, regulator updates and jurisdictional scope on the date of advice. The sources above are starting points, not an exhaustive legal research memorandum.

---

## 12. Immediate operational instruction

Until the release checklist is complete:
- Do not send prospect marketing emails in Kenya, the UK, the US or any other jurisdiction.
- Do not use a generic “B2B” flag as a substitute for subscriber classification or consent.
- Do not treat a website privacy notice as proof of notice delivery or consent.
- Do not use the supplied Kenyan postal details as a verified CAN-SPAM address.
- Do not publish the revised privacy notice as approved.
- Do not mark legal review complete without a real qualified reviewer and signed evidence.
- Keep live production sending disabled by verified server-side controls; if live manual paths cannot be proven disabled, treat the system as unsafe for marketing and apply a production kill switch through the authorized deployment process.
- Keep the PR draft and deployment hold until tests and review gates are independently satisfied.

**End of package.**
