# VIORA Subprocessor and Third-Party Service Register

**Status:** Source-discovered inventory; vendor contracts, legal entities, regions, retention and transfer terms require confirmation. This is not a representation that every listed vendor currently receives customer content.

| Provider / service | Evidence in repository | Purpose / data potentially exposed | Verification required |
|---|---|---|---|
| Cloudflare, Inc. | `web/wrangler.toml`, `web/worker.js`, Worker URLs and static assets | DNS/CDN, Workers, Workers AI translation, request metadata; translation text is sent to Workers AI | Confirm account entity, plan, data location/jurisdiction options, DPA, subprocessors, logs/retention and AI data terms |
| Google LLC / Firebase | Firebase Auth and Realtime Database imports/config in `web/main.js` and portal modules | Account identifiers, auth metadata, business/customer records and files where Firebase Storage is used | Confirm Firebase project services, database/storage region, DPA, access logs, backup and deletion behaviour |
| Groq (conditional AI provider) | Main application UI describes Groq-powered AI; Worker/API integration is referenced | Prompts and generated responses if the deployed AI backend sends them to Groq | Verify actual deployed Worker route, legal entity, endpoint, data retention/training terms, region and DPA before treating as active subprocessor |
| Google Fonts | External font stylesheet references | Visitor IP/browser request metadata | Confirm whether self-hosting is preferable and update privacy notice |
| jsDelivr / cdnjs / unpkg | External JS/CSS library URLs in main/public pages | Visitor IP/browser request metadata; library delivery | Pin versions, SRI where supported, vendor terms and fallback/self-host strategy |
| Other AI/TTS providers | TTS/AI references in chatbot modules; provider endpoint requires runtime inventory | Text submitted for voice/AI generation if enabled | Identify exact provider, account, location, retention, training terms and contractual safeguards |

## Required fields before approval

For every provider record: full legal entity, service, data categories, processing purpose, controller/processor role, processing country/region, transfer mechanism, retention, security certifications/assurance, DPA link/date, subprocessor chain, incident notice commitment, deletion support, owner and last review date.

## Change control

- Privacy Lead reviews any new SDK, API, AI model, analytics pixel, payment provider or file host before release.
- Update customer DPA notices for material subprocessor changes according to contract and law.
- Keep an archive of prior versions and customer notices.
- Do not send sensitive customer data to a new AI/TTS provider until purpose, lawful basis, minimisation, retention and contractual terms are approved.
