# VIORA Firebase backup and restore runbook

## Backup pipeline
The scheduled GitHub Actions workflow exports the Firebase Realtime Database with a dedicated Admin SDK service identity, encrypts the snapshot using AES-256-GCM before upload, and stores it in a private Cloudflare R2 bucket. The encryption key is independent of R2 credentials.

## Required GitHub configuration
Repository variables: `FIREBASE_DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_BACKUP_BUCKET`.
Repository secrets: `FIREBASE_SERVICE_ACCOUNT_JSON`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BACKUP_ENCRYPTION_KEY` (32 random bytes, base64 encoded).
Use a dedicated Firebase service account with read-only database access where Firebase supports the required scope. Limit the R2 key to the backup bucket only. Enable bucket versioning/object lock if available in the account plan and configure lifecycle expiration separately.

## Retention policy to configure on the R2 bucket
- Daily recovery points: retain 35 days.
- Monthly recovery points: retain 12 months.
- Never expire the newest known-good recovery point.
- Retain incident/legal-hold snapshots until the privacy/legal owner releases the hold.
- Keep the encryption key in an independently protected secrets vault and maintain a documented break-glass recovery process.

## Proposed objectives
Initial RPO: 24 hours (daily schedule); initial RTO: 8 hours. These are objectives only, not guarantees. Reduce RPO only after increasing backup cadence and proving restore capacity.

## Restore procedure
1. Declare an incident and obtain two-person approval.
2. Create an isolated recovery Firebase project; never overwrite production during a drill.
3. Download the selected R2 object and verify its SHA-256 against the workflow log.
4. Decrypt using the separately escrowed AES-256 key; validate the GCM authentication tag.
5. Inspect the JSON schema and record counts before import.
6. Restore using Firebase Admin SDK into the isolated project.
7. Run authentication, representative tenant data, file-reference, financial totals and portal smoke tests.
8. Record elapsed recovery time, last included write, data loss window, integrity results and approvers.
9. Production restore requires incident commander + data owner approval and a customer communications plan.

## Honest status
Workflow and encrypted export script are committed as code only. It is not operational until all required GitHub secrets/variables exist and the scheduled run succeeds. The script currently uploads timestamped daily snapshots; monthly tiering, lifecycle expiry, automated restore validation and restore alerts need operational configuration and a tested drill. Do not report backups as active before evidence exists.
