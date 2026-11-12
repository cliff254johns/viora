# VIORA Data Retention and Deletion Policy

**Status:** Proposed internal policy. Management and Kenyan legal/tax review required before automated enforcement.  
**Principle:** Keep personal data only for a documented purpose and period; do not delete records subject to a lawful retention duty, dispute, investigation or legal hold.

## Proposed schedule

These are operational defaults for approval, not a statement that every record currently follows them.

| Data class | Proposed retention | Deletion / review trigger |
|---|---|---|
| Website enquiries and marketing leads | 24 months after last meaningful interaction, unless consent withdrawn or another lawful basis requires retention | Monthly review; delete or anonymise after period |
| User account/profile data | Active service term plus 90 days after closure, unless needed for security, billing or legal claims | Verified closure and export request |
| Customer tenant content | Active contract; 30-day export window after termination; remove from primary systems within 90 days after confirmed termination/request, subject to legal hold | Customer instruction and contract exit |
| Support tickets | 24 months after closure, then anonymise or delete | Quarterly review |
| Security and access logs | 12 months proposed; extend only for a documented security/legal need | Automated expiry after approval |
| Incident and breach records | 6 years proposed as an internal governance record; validate against limitation and regulatory requirements | Annual review and legal hold check |
| Financial, invoicing and tax records | Applicable statutory accounting/tax retention period; confirm exact period with Kenyan tax adviser before automation | Finance/legal approval |
| Backups | 35-day rolling retention proposed; ensure deletion requests age out of backups and are not restored into live systems without reapplying tombstones | Scheduled expiry and restore reconciliation |
| Temporary uploads and exports | 7 days proposed for generated export files; shorter where practical | Automatic expiry |
| Consent records | Retain enough evidence to demonstrate the choice for as long as the related processing/claim requires | Legal/privacy review |

## Deletion procedure

1. Authenticate and verify the requester and tenant authority.
2. Record the request, scope, date, legal basis and deadline.
3. Identify data across Realtime Database, Firebase Storage, Cloudflare services, app logs, analytics, exports and subprocessors.
4. Check statutory retention, dispute, fraud, security and legal-hold requirements.
5. Export/return data where requested and legally permitted.
6. Delete or irreversibly anonymise eligible records using trusted server-side jobs; do not rely on hiding UI rows.
7. Propagate deletion instructions to processors/subprocessors where required.
8. Ensure backups expire under the approved schedule; maintain deletion tombstones so a restore does not silently reintroduce erased data.
9. Record completion, exceptions, systems affected and reviewer.
10. Notify the requester within the applicable legal/contractual timeframe.

## Current implementation status

- A browser-side export helper can package selected records already loaded in the signed-in main workspace.
- It does not establish a complete data-subject export across every backend store.
- No automated tenant-wide deletion job or backup tombstone workflow is claimed by this policy.
- No production records are deleted by the Engineering Command Centre.
- Do not turn on automated deletion until retention periods, legal holds, tenant mapping and restore behaviour are approved and tested.

## Required controls

- Central retention registry with owner and legal basis per data class.
- Scheduled review and deletion queues.
- Approval for irreversible deletion.
- Audit event for each request and each system action.
- Backup expiry and restore reconciliation.
- Tenant-specific scoping and negative authorization tests.
