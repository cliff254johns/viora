# VIORA Global Sales Engine

Status: implementation on `feature/global-sales-engine`; outbound sending remains disabled by default and must not be enabled until the configuration and live Gmail checks below are completed.

## Design

- Public business research remains evidence-based. Discovery results are candidates, not permission to email.
- CRM records remain canonical at `viora_data/orgs/viora/leads/{leadId}`.
- The global campaign queue is stored at `viora_data/orgs/viora/outreach/campaignQueue/{queueId}`.
- Campaign controls and the one-time outbound switch are at `viora_data/orgs/viora/outreach/campaignSettings`.
- Per-day reservation counters are at `viora_data/orgs/viora/outreach/campaignMetrics/daily/{YYYY-MM-DD}/reserved` and successful sends at `.../sent`.
- One-click unsubscribe tokens are stored at `viora_data/orgs/viora/outreach/unsubscribeTokens/{64-hex-token}`.
- Suppressions use the existing `viora_data/orgs/viora/outreach/suppressions/{encodedEmail}` path and are checked immediately before sending.
- The existing Cloudflare Worker cron trigger also checks the Gmail inbox for recent messages from CRM leads and passes eligible VIORA-labelled threads through the autonomous reply classifier. Safe high-confidence replies are sent only when the reply switch is enabled; urgent, complaint, legal, low-confidence and unsupported messages are escalated even when automatic replies are disabled.
- The campaign scheduler runs from the same cron trigger. It processes at most one outbound recipient per five-minute invocation and atomically reserves a maximum of 200 send attempts per UTC day using Firebase Realtime Database ETags.
- Every recipient receives an individual Gmail message, not a multi-recipient To/CC/BCC batch.
- Each queue item can contain up to two personalised follow-ups. A follow-up is sent only if Gmail confirms the latest thread message is still from VIORA. If the thread cannot be checked, the follow-up is blocked rather than guessed.
- An uncertain Gmail send result is never automatically retried; the item becomes `send_uncertain` and an urgent main-dashboard notification is published.

## Endpoints

- `GET /outreach/campaign/status` — admin/exec status, daily capacity and queue counts.
- Scheduled inbox sync — checks up to ten recent inbox messages per five-minute tick; no manual dashboard click is required for reply classification and escalation.
- `POST /outreach/campaign/settings` — admin/exec one-time outbound enable/pause.
- `POST /outreach/campaign/queue` — admin/exec enqueue prepared, personalised CRM prospect messages.
- `GET /outreach/unsubscribe?token=...` — public confirmation page; GET does not unsubscribe.
- `POST /outreach/unsubscribe?token=...` — one-click or confirmation unsubscribe; creates a persistent suppression.

## Contact eligibility and country policy register

A CRM lead can only be queued when all are true:

1. `emailVerified === true`.
2. `countryCode` is a valid ISO-style two-letter code.
3. `contactEligibility.status === "eligible"`.
4. `contactEligibility.basis`, `sourceUrl`, `reviewedAt` and `policyVersion` are present.
5. The country policy record exists and is approved at the exact same version.
6. The recipient is not suppressed or marked `Do not contact`.
7. The subject and body are personalised and the body explicitly references the CRM organisation.

The country-policy record is:

```json
{
  "status": "approved",
  "version": "2026-11-v1",
  "reviewedAt": "2026-11-13T12:00:00.000Z",
  "reviewedBy": "authorised-reviewer",
  "jurisdiction": "GB",
  "contactRulesSummary": "Summary of the reviewed rules and scope",
  "sourceUrls": ["https://official-regulator.example/guidance"]
}
```

Path: `viora_data/orgs/viora/outreach/compliance/jurisdictions/{CC}`.

The global sender policy record is:

```json
{
  "status": "approved",
  "version": "2026-11-v1",
  "reviewedAt": "2026-11-13T12:00:00.000Z",
  "reviewedBy": "authorised-reviewer",
  "senderPostalAddress": "VIORA's real postal address",
  "privacyNoticeUrl": "https://www.viora.co.ke/privacy"
}
```

Path: `viora_data/orgs/viora/outreach/compliance/globalSendingPolicy`.

Do not mark a jurisdiction or global policy approved merely to unlock sending. A qualified person must review applicable local rules, the contact basis, transparency/disclosure requirements and unsubscribe obligations. Do not infer that a public email address automatically permits marketing. This register is an operational control, not legal advice or a substitute for local review.

## Queue payload

`POST /outreach/campaign/queue` accepts up to 50 items:

```json
{
  "items": [{
    "leadId": "existing-shared-crm-lead-id",
    "subject": "Specific subject for this organisation",
    "text": "Individually researched message naming the organisation and its verified business context.",
    "followups": [{
      "subject": "A distinct follow-up subject",
      "text": "A separate, personalised follow-up naming the organisation.",
      "delayDays": 5
    }]
  }]
}
```

The Worker reads the CRM record and compliance registers itself; client-supplied email addresses, country policy claims or eligibility assertions are not trusted.

## Activation checklist

- Connect and verify `cliff254johns@gmail.com` in Gmail OAuth.
- Verify the sender identity and Google OAuth app status / production publishing requirements.
- Have jurisdiction-specific contact rules and VIORA's global sender disclosures reviewed by a qualified legal professional and populate the policy register with real reviewer identity, date and official sources.
- Confirm that the sender postal address meets the US CAN-SPAM definition of a valid physical postal address; do not assume a non-US PO Box qualifies.
- Verify the actual privacy notice has been published and is accurate before setting the global policy to approved.
- Review each prospect's exact message and recipient before using the explicit Approve & queue action.
- Populate each CRM record with verified email, country code, eligibility basis, evidence URL, review timestamp and matching policy version.
- Prepare and queue individually personalised messages.
- Enable outbound campaigns once, using the Outreach campaign controls.
- Monitor delivery, bounces, complaints, replies and suppression; pause immediately if provider health or compliance is uncertain.

## Limits and non-goals

- The 200/day figure is a hard maximum reservation target, not a guarantee or a reason to send to unsuitable contacts. Google currently documents a 500-message/day threshold for personal Gmail accounts; Gmail API sends share the account's standard daily sending limits across clients. A 200/day app cap is below that published threshold, but does not guarantee Gmail acceptance or inbox placement. See https://support.google.com/mail/answer/22839 and https://developers.google.com/workspace/gmail/api/guides/handle-errors.
- Google recommends increasing sending volume gradually, sending consistently, and monitoring bounces, deferrals and spam feedback. See https://support.google.com/mail/answer/81126. The scheduler spreads delivery at one message per five-minute tick, but operators should still monitor account health.
- One message per five-minute tick spreads delivery and stays below the target cap; the system may send fewer due to queue volume, provider errors or eligibility.
- The Worker does not bypass Google sending limits. Provider throttling, mailbox restrictions or deliverability warnings must pause sending.
- The current implementation does not include a verified-email discovery provider or universal legal determination. Email verification and policy approval are explicit CRM/configuration requirements.
- Campaign analytics are based on provider-accepted sends and observed replies, not assumed opens or guaranteed delivery.
- No production campaign was sent as part of this implementation. Outbound must remain OFF until legal review, verified sender address, Gmail OAuth and recipient-level human approval are complete.
- The current legal changes are implementation controls and a proposed privacy-notice revision, not legal advice or evidence that any jurisdiction policy has passed independent legal review.
- The initial live volume should be ramped gradually from a very small number and monitored; 200/day remains a hard ceiling, not a launch target.
