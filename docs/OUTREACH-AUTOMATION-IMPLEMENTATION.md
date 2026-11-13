# VIORA Outreach automation — implementation map

Status: **partial implementation merged to `main` and deployed to Cloudflare on 13 November 2026; live authenticated Gmail end-to-end verification remains outstanding**.

## Existing application and data model

The Outreach frontend is `web/outreach.html`, `web/outreach.css`, and `web/outreach.js`. It authenticates with Firebase Email/Password and restricts entry to `admin` and `exec` roles, resolving role from the organisation-scoped profile first and the legacy global profile second.

Firebase Realtime Database paths used by the existing application:

| Path | Purpose |
|---|---|
| `viora_data/orgs/viora/leads/{leadId}` | Canonical shared VIORA CRM lead |
| `viora_data/orgs/viora/outreach/leads/{leadId}` | Outreach-linked copy / relationship context |
| `viora_data/orgs/viora/outreach/emails/{emailId}` | Outbound and inbound email ledger |
| `viora_data/orgs/viora/outreach/aiSuggestions/{suggestionId}` | AI-generated draft suggestions |
| `viora_data/orgs/viora/commLog/{communicationId}` | Shared main-system communications history |
| `viora_data/orgs/viora/notifications/{notificationId}` | Main dashboard notification centre |
| `viora_data/orgs/viora/integrations/google/mailbox` | AES-256-GCM encrypted Gmail OAuth token record |
| `viora_data/orgs/viora/outreach/settings/autoReplyEnabled` | Explicit autonomous-reply feature flag |
| `viora_data/orgs/viora/outreach/autoReplies/{gmailMessageId}` | Idempotency and processing outcome per inbound message |
| `viora_data/orgs/viora/outreach/suppressions/{encodedEmail}` | Persistent opt-out / do-not-contact suppression |

The main app's shared notification publisher is `web/shared/notification-bus.js`; the Outreach Worker writes escalation records into its existing organisation notification path using the Firebase service secret. Notification records contain a source, category, priority, title, concise body, timestamp and link to Outreach. They do not contain the full email body.

## Existing integrations

- Gmail OAuth is handled by `workers/viora-api/index.js`; refresh tokens are encrypted before Firebase persistence.
- The connected sender identity is restricted in code to `cliff254johns@gmail.com`.
- Existing scopes include `gmail.send`, `gmail.metadata` and `gmail.modify`. Google OAuth verification / production publishing requirements still apply.
- `GET /gmail/replies` retrieves recent inbox message metadata.
- `POST /sendEmail` sends only through the authenticated `cliff254johns@gmail.com` Gmail mailbox. It does not fall back to Resend.
- `POST /outreach/draft` uses the existing AI provider orchestration to create factual drafts.
- Existing global prospect discovery searches public web sources, normalises results and constrains AI enrichment to the returned source evidence. It does not prove a contact's lawful eligibility for marketing.

## Changes in this branch

1. Replaced the two standalone engineering navigation links before Overview with two expandable sidebar groups using the same group-toggle and submenu classes as the rest of the main sidebar.
2. Added an admin/exec-only autonomous reply setting endpoint:
   - `GET /outreach/automation-settings`
   - `POST /outreach/automation-settings`
3. Added `POST /outreach/auto-reply`:
   - Requires an existing CRM lead and exact sender match.
   - Requires a VIORA Outreach-labelled Gmail thread with a prior outbound message to the sender.
   - Processes only the latest message in that thread.
   - Checks persistent suppression records and recognises opt-out language.
   - Uses AI only to classify intent; it does not ask the model to invent or author business commitments.
   - Sends deterministic, approved factual responses only for safe intent categories with confidence >= 85 and only when the explicit feature flag is enabled.
   - Suppresses opt-outs and marks the CRM lead `Do not contact`.
   - Escalates urgent, legal, complaint, low-confidence and unsupported messages to the main notification centre.
   - Uses the Gmail thread ID and original Message-ID headers to keep replies in the existing conversation.
   - Stores an idempotency outcome keyed by Gmail message ID.
4. Connected Outreach's Gmail sync to the new processor and stores the inbound message content and automation outcome in the email timeline.
5. Added the one-time autonomous reply control to the Outreach AI studio.
6. Extended the Outreach workflow with Worker module syntax and integration checks.

## Important rollout gates

- Autonomous replies default to **OFF**. An administrator can enable them only after Gmail is connected and its access token can be refreshed.
- Live OAuth, real message retrieval, real threaded reply, suppression behaviour and main-dashboard notification delivery must be tested before enabling the feature.
- The code in this branch does **not** yet implement an autonomous outbound campaign queue or a 200-distinct-recipient/day scheduler.
- The 200/day target must not be implemented by bypassing Gmail limits or emailing every discovered address. Before outbound automation is activated, each lead needs a recorded, reviewable contact-eligibility basis, a verified contact address, source evidence, suppression checks, sender-domain authentication, rate limits, unsubscribe processing and bounce/complaint handling.
- Current Resend sender configuration is `Viora <viora@elma.co.ke>`; verify that domain's alignment and authentication before scaling. The sender identity should be deliberately chosen and authenticated for VIORA.
- A daily target is a capacity objective, not a guarantee. The scheduler should slow or stop automatically on provider throttling, bounce/complaint thresholds, missing authentication or configuration errors.

## Deployment status

This implementation map describes the pre-existing Outreach reply automation; its historical PR/deployment statement is not evidence that the global sales engine in PR #67 is deployed. The global sales engine remains a separate proposal and must not be enabled until its server-side checks are deployed and verified.
