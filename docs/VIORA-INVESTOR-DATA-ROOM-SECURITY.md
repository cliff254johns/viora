# VIORA Investor Data Room — deployment and security checklist

The Investor Data Room is mounted under the Engineering Command sidebar group. Its profile and document metadata are stored at the Realtime Database path `viora_data/investorDataRoom`; uploaded files are stored below `investor-data-room/{uid}/` in Firebase Storage.

## Required before production use

The UI checks the main application's loaded operator role (`state.operator.role`) and only renders for `admin` and `exec`. This is a user-experience gate, **not an authorization boundary**. Firebase Security Rules must independently enforce the same access.

1. Confirm that the Firebase ID tokens for every authorised admin and exec contain a trusted server-issued custom claim, preferably `role: "admin"` or `role: "exec"` (or equivalent boolean claims). Do not let a user set their own claims or role.
2. The owner confirms the existing Realtime Database rules already grant admin and exec full read/write access to `viora_data/investorDataRoom`; preserve those rules without modification.
3. The owner confirms Firebase Storage rules already grant admin and exec full read/write access for the Investor Data Room uploads. Preserve those rules without modification. Verify the live rules and role claims during the deployment audit; do not add public access or broaden parent permissions.
4. Test with an admin, an exec, a normal member, a signed-out browser and a second unrelated account. Only admin/exec should read, save, upload, download, share or delete. Verify direct REST/SDK access is denied to other roles.
5. Confirm Storage is enabled for the configured Firebase project and that the Storage bucket and retention policy are correct. Test upload, download, deletion and restore.
6. Test the live site on desktop and mobile after the Cloudflare deployment and clear/refresh the PWA cache.

## Data handling

- This is an internal diligence workspace, not a public investor portal. The share action hands a downloaded file to the device's native share sheet; it does not create a public room URL.
- Review and redact each file before sharing. Do not upload passwords, API keys, bank login credentials, customer personal data, or unnecessary identity documents.
- Mark only evidence that has actually been checked as `Verified`. Draft status is not legal, financial, security or audit assurance.
- Keep investor copies separate from internal source documents where redaction is required. Maintain an approved recipient list and record what was shared and when.

## Current limitation

The repository does not contain the deployed Firebase rules. The owner has confirmed that the existing rules already grant admin and exec full read/write access to the Investor Data Room path and Storage uploads. This code change does not alter Firebase rules. Production verification should still include live admin/exec and non-privileged account tests. The app will surface Firebase permission errors rather than weakening rules automatically.
