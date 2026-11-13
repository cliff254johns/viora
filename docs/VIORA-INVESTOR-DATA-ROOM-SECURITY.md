# VIORA Investor Data Room — deployment and security checklist

The Investor Data Room is mounted under the Engineering Command sidebar group. Its profile and document metadata are stored at the main application's resolved Realtime Database path for `investorDataRoom` (currently `viora_data/investorDataRoom`); uploaded files are stored below `investor-data-room/{uid}/` in Firebase Storage.

## Required before production use

The UI checks the main application's loaded operator role (`state.operator.role`) and only renders for `admin` and `exec`. This is a user-experience gate, **not an authorization boundary**. Firebase Security Rules must independently enforce the same access.

1. Confirm that the Firebase ID tokens for every authorised admin and exec contain a trusted server-issued custom claim, preferably `role: "admin"` or `role: "exec"` (or equivalent boolean claims). Do not let a user set their own claims or role.
2. Add a narrow Realtime Database rule for `viora_data/investorDataRoom` that allows read/write only when `auth != null` and the trusted token claim is admin or exec. Do not broaden permissions on `viora_data` or any parent node.
3. Add a Firebase Storage rule for `investor-data-room/{uid}/{fileName}` that allows read/write only to authenticated users with the trusted admin/exec custom claim. Validate content type and the 5 MB upload ceiling in rules as well as the client.
4. Test with an admin, an exec, a normal member, a signed-out browser and a second unrelated account. Only admin/exec should read, save, upload, download, share or delete. Verify direct REST/SDK access is denied to other roles.
5. Confirm Storage is enabled for the configured Firebase project and that the Storage bucket and retention policy are correct. Test upload, download, deletion and restore.
6. Test the live site on desktop and mobile after the Cloudflare deployment and clear/refresh the PWA cache.

## Data handling

- This is an internal diligence workspace, not a public investor portal. The share action hands a downloaded file to the device's native share sheet; it does not create a public room URL.
- Review and redact each file before sharing. Do not upload passwords, API keys, bank login credentials, customer personal data, or unnecessary identity documents.
- Mark only evidence that has actually been checked as `Verified`. Draft status is not legal, financial, security or audit assurance.
- Keep investor copies separate from internal source documents where redaction is required. Maintain an approved recipient list and record what was shared and when.

## Current limitation

The repository's main app exposes the authenticated Firebase database and operator profile, but the deployed Firebase Realtime Database and Storage Security Rules are not stored in this repository. Therefore, this feature must not be described as production-secure or fully operational until the live rules have been inspected and the role-isolation tests above pass. The app will surface Firebase permission errors rather than weakening rules automatically.
