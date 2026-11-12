# VIORA international market readiness matrix and PR reconciliation

**Assessment date:** 13 November 2026  
**Status:** Engineering readiness assessment; not legal, tax, accounting or payment-provider approval.  
**Decision:** No market outside Kenya is marked production-ready from this repository review alone.

## Executive conclusion

VIORA has a useful internationalisation foundation: country estimation, ISO currency codes, daily reference FX feeds, a public language/translation control, and some English/French/Spanish public content. That is not the same as international commerce readiness. Current currency conversion is display-only and limited by third-party feed coverage; transactional prices, invoices, ledgers, tax and payment settlement must remain in the transaction currency and must not be silently rewritten.

The global launch design must be **jurisdiction-aware, configuration-driven and fail-closed for unverified tax/payment rules**. A country IP lookup may suggest display currency, but must never decide tax liability, customer residence, merchant establishment, legal basis or payment eligibility.

## 1. Pull-request reconciliation

### PR #45 — `reconcile/viora-unmerged-fixes`

- Head: `4f032c58eabf4202164923ba4e26e5a27795c287`
- Current main at review: `944d980bea6fd821d2a927303799975df2b2fdba`
- GitHub compare: **diverged**, 107 commits ahead and 690 behind; GitHub reports not mergeable.
- 29 changed files. Its base is old. The public page source, `web/main.html`, `web/main.css`, `web/sw.js`, `web/hero-orb.js`, sitemap and redirects are materially behind current main. Applying the branch wholesale would replace newer live work.

The useful changes were checked against current main and are already present in newer form:
- Campaign future-date validation is present in `web/main/campaign-ai.js`.
- Assistant namespace separation is present in `web/mainIndex/chatbot.js`.
- Notification icon uses the current verified app icon path in `web/main/render-dashboard.js`.
- Orb resize handling is present in `web/hero-orb.js`.
- Campaign mobile calendar layout is present in `web/campaigns.html`.
- Global brand assets, `llms.txt`, product asset README and the non-API audit already exist.
- Current `_redirects` and sitemap are newer than the PR version.

**Disposition:** superseded; do not merge the stale 107-commit branch. Close it with this reconciliation recorded. No unique PR #45 patch should be blindly replayed.

### PR #48 — `fix/viora-avatar-continuous-poses-official-pwa-logo-20261111`

- Head: `4fc9cfc53cc7273fb8d165d204e99c9f40c0d061`
- Current main at review: `944d980bea6fd821d2a927303799975df2b2fdba`
- GitHub compare: **diverged**, 6 commits ahead and 620 behind; GitHub reports not mergeable.
- Three shared files overlap PR #45: `web/campaigns.webmanifest`, `web/main.html`, `web/manifest.webmanifest`.

The assistant pose animation and reduced-motion CSS are already present in current `web/mainIndex/chatbot.css`. Current PWA manifests retain dedicated 192px and 512px icon assets plus SVG artwork. PR #48 replaces that set with `/viora.png` and declares it as 1024x1024 without verified image dimensions, and replaces the current main-app icon link. That is not a safe improvement.

**Disposition:** superseded; do not merge. Close with the reconciliation recorded. Preserve current multi-size icons and already-integrated assistant pose code.

### Merge policy

These PRs are closed as superseded, not merged. Their useful changes are already on main in later versions. If a future review discovers a genuinely missing behavior, port only that behavior onto a fresh branch from current main, test it, and submit a new PR.

## 2. Current platform evidence

### Currency and pricing

- `web/currency-display.js` estimates country/currency from IP metadata using ipapi.co and ipwho.is.
- It uses Frankfurter daily reference rates and Open Exchange Rates API as fallback, with local caching.
- `formatKES`, `formatUSD` and `format` provide presentation conversion.
- Public homepage/market/brand-presentation code uses this for display estimates.
- The code comment correctly says product prices, invoices and settlement currencies are not rewritten.
- Coverage depends on country-lookup provider and rate-provider coverage. No exhaustive ISO 4217/territory test is evidenced.
- IP-based country inference can be wrong (VPN, roaming, corporate gateways, shared networks). A visitor needs a visible manual override.
- Exchange reference rates are not payment processor rates, bank rates, guaranteed execution prices or accounting rates.

**Change in this branch:** add a persistent manual display-currency selector, an Auto reset, and Node unit tests for country detection, manual override, reset and unsupported currencies. This only affects public display formatting; it does not mutate product, invoice, payment or ledger records.

### Language and locale

- Public English, French and Spanish routes/content exist.
- Shared public language/translation tooling exists.
- This does not prove full translation coverage, reviewed legal translations, locale-aware forms, accessible language switching, or translated authenticated portals.
- Dates, number formats, timezone, address, phone, postal code, name, sorting and pluralization need per-locale testing.
- Legal/privacy/terms translations must be reviewed by qualified humans, not accepted solely from machine translation.

### Payments

No universal provider should be assumed to work for every merchant country. Provider eligibility depends on the merchant's legal entity, country, underwriting, currency, product category, settlement bank and requested payment methods.

Paystack's current documentation lists merchant availability in Kenya, Ghana, Nigeria and South Africa, with country-specific local channels and international card acceptance subject to activation/eligibility. Its Kenya guidance lists KES and USD acceptance conditions and requires USD settlement setup for USD payouts. This is a provider option, not evidence that VIORA has an approved live merchant account.

**Required engineering controls before any payment method is advertised as live:**
- Separate provider adapters from business logic.
- Keep provider secrets server-side only.
- Verify callback/webhook authenticity using the provider's documented method; reject unsigned/invalid events.
- Idempotently process provider event IDs and transaction references.
- Validate amount, currency, merchant/account, status and order/invoice association server-side.
- Never trust browser redirect/success pages as proof of payment.
- Reconcile provider settlement, fees, refunds, reversals, disputes and chargebacks.
- Test duplicate, delayed, out-of-order, replayed and forged callbacks in sandbox.
- Record original transaction currency and settlement currency separately.
- Obtain provider production approval and run controlled live transactions before launch.

## 3. Priority market matrix

### Kenya — initial home market

| Dimension | Market requirement | VIORA status |
|---|---|---|
| Display / transaction currency | KES as default; retain per-transaction ISO currency | Display support exists; ledger-wide currency invariant needs end-to-end tests |
| Tax | KRA VAT standard rate 16%; zero-rated and exempt supplies differ; registration, invoicing, returns and eTIMS applicability require accountant/KRA review | No complete country tax engine or eTIMS certification evidenced |
| Payments | M-Pesa, cards and bank rails according to merchant/provider eligibility | Integration setup exists in parts of the product; production callback and settlement tests not verified |
| Privacy | Data Protection Act 2019 and 2021 regulations; ODPC registration applicability, controller/processor roles and cross-border transfer safeguards | Draft governance documents exist; registration, DPO, vendor transfer review and live request workflows not evidenced |
| Locale | en-KE, Africa/Nairobi, KES formats, Kenyan phone/address fields | Some en-KE/Africa-Nairobi assumptions remain hard-coded in industry apps; needs global refactor |
| Launch gate | KRA/tax counsel review, invoice rules, M-Pesa/provider live test, ODPC assessment and customer DPA | **Not yet market-certified** |

### Nigeria

| Dimension | Market requirement | VIORA status |
|---|---|---|
| Currency | NGN; never assume a KES/USD base price is the transaction price | Display FX may support NGN if feed supplies it; verify at runtime |
| Tax | Nigeria Tax Act 2025 states VAT at 7.5%; taxable classification, exemptions, registration and effective provisions need local advice | No Nigerian tax configuration or invoice compliance evidence |
| Payments | Local rails and cards through a provider eligible for the merchant entity; Paystack lists Nigeria merchant availability | Provider account, local collection and NGN settlement not verified |
| Privacy | Nigeria Data Protection Act 2023 and NDPC GAID 2025; territorial scope can include foreign processors targeting/processing Nigerian data subjects | No Nigeria-specific DPA/notice or NDPC compliance evidence |
| Launch gate | Tax counsel, NDPC applicability, local data transfer review, provider onboarding and NGN end-to-end payment tests | **Not ready** |

### South Africa

| Dimension | Market requirement | VIORA status |
|---|---|---|
| Currency | ZAR and local locale formats | FX display may support ZAR; end-to-end transaction currency not verified |
| Tax | SARS standard VAT rate 15%; zero-rated/exempt supplies and vendor registration thresholds apply | No SARS-compliant tax invoice/return workflow evidenced |
| Payments | Local provider rails/cards; Paystack lists South Africa merchant availability and EFT options | No approved live merchant integration evidence |
| Privacy | POPIA, responsible-party/operator roles and cross-border transfer rules | No POPIA-specific legal review or transfer assessment evidenced |
| Launch gate | SARS/accountant review, POPIA assessment, payment-provider settlement tests | **Not ready** |

### United Kingdom

| Dimension | Market requirement | VIORA status |
|---|---|---|
| Currency | GBP | Display FX may support GBP; settlement/accounting support not verified |
| Tax | HMRC standard VAT 20%, with 5%, zero-rated and exempt categories; VAT registration and place-of-supply rules matter | No UK VAT classification/registration engine evidenced |
| Payments | UK merchant acquiring and local bank/card methods depend on entity and provider | No UK merchant/provider approval evidenced |
| Privacy | UK GDPR and Data Protection Act 2018; international restricted transfers require adequacy, safeguards or a valid exception | No UK-specific notices, contracts or transfer assessment |
| Launch gate | UK tax/legal review, UK GDPR transfer assessment, merchant onboarding | **Not ready** |

### European Union / EEA

| Dimension | Market requirement | VIORA status |
|---|---|---|
| Currency | EUR in euro-area markets; other EU/EEA markets may use their own currency | No per-country currency/locale matrix |
| Tax | VAT rates and reduced/exempt categories are set by each Member State within EU rules; OSS/IOSS and digital-services rules may apply | One generic VAT rate is not acceptable; no member-state tax engine |
| Payments | Provider methods and settlement vary by country; cards, SEPA and local payment methods may be expected | No country-specific provider matrix or live test evidence |
| Privacy | GDPR territorial scope, controller/processor obligations, DPA, subprocessors, data-subject rights and international transfer mechanisms | Draft GDPR references exist; actual records, contracts, transfer safeguards and DPIAs incomplete |
| Launch gate | Choose each member state individually; validate VAT/OSS, consumer law, GDPR and payment methods | **Not ready in any member state until separately assessed** |

### United States

| Dimension | Market requirement | VIORA status |
|---|---|---|
| Currency | USD; preserve transaction currency | Display support exists; financial record invariants need tests |
| Tax | State and local sales-tax regimes, product/service taxability, economic nexus and destination sourcing; no single nationwide sales-tax rate | No state/local tax engine or nexus controls |
| Payments | Card acquiring, ACH and wallets depend on merchant entity/provider underwriting | No US merchant settlement evidence |
| Privacy | Federal sectoral rules plus state privacy and breach-notification laws; assess state-by-state scope | No state-by-state privacy matrix or US-specific notices |
| Launch gate | Tax nexus adviser, state-by-state privacy review, consumer terms and payment-provider onboarding | **Not ready** |

### Australia

| Dimension | Market requirement | VIORA status |
|---|---|---|
| Currency | AUD | FX display may support AUD; accounting and settlement not verified |
| Tax | GST registration and supply rules; ATO states registration is generally required at AUD 75,000 GST turnover for most businesses, with exceptions | No Australian GST rules/threshold monitor evidenced |
| Payments | Cards, bank transfer and local methods through an eligible Australian merchant provider | No Australian merchant/provider test evidence |
| Privacy | Privacy Act and Australian Privacy Principles; APP 8 governs cross-border disclosure and accountability | No Australian privacy notice/APP 8 transfer review |
| Launch gate | ATO/accountant review, APP assessment, provider onboarding and AUD reconciliation | **Not ready** |

### India

| Dimension | Market requirement | VIORA status |
|---|---|---|
| Currency | INR | FX display may support INR; financial record support not verified |
| Tax | GST is multi-rate and classification-dependent; GST Council notifications and effective dates must be applied | No HSN/SAC classification, registration or Indian invoice engine |
| Payments | UPI and domestic payment providers subject to merchant eligibility | No UPI/provider integration evidence |
| Privacy | Digital Personal Data Protection Act 2023 and 2025 Rules have phased commencement dates; map the effective provisions by date | No India-specific implementation or commencement tracker |
| Launch gate | Indian tax/legal advice, GST rules, DPDP phased obligations, UPI onboarding | **Not ready** |

### All other countries

**Not assessed / not launchable by assumption.** Do not infer support from an FX API returning a currency code. Before enabling another country, create its own tax, privacy, payments, consumer-law, language, support and data-transfer assessment.

## 4. Global technical architecture required

### Money and FX
1. Store monetary amounts as integer minor units plus explicit ISO 4217 currency code; never store a naked number as money.
2. Store original transaction currency, settlement currency, exchange rate, provider fee, rate timestamp/source and rounding policy separately.
3. Keep display-only conversion clearly labelled as an estimate with provider and last-updated date.
4. Do not convert historical invoices, ledgers, tax records, customer balances or settled transactions when a visitor changes display currency.
5. Provide a manual display-currency override for IP/VPN errors; the current branch adds this to the public currency display control.
6. Build an ISO currency precision table (0, 2 or 3 minor digits as applicable) and test rounding, negative values, large values, zero and unsupported currencies.
7. Never use an indicative FX feed as an executable checkout quote. Checkout must use the payment provider's confirmed currency/amount.

### Tax
1. Make tax configuration tenant-specific and jurisdiction-specific, with effective-from/effective-to dates and a named approver.
2. Model tax registrations separately from customer country and tenant default country.
3. Model product/service tax category, taxable/zero-rated/exempt/out-of-scope/reverse-charge treatment, inclusive/exclusive pricing and rounding.
4. Calculate tax using place-of-supply, customer type, product/service category, exemptions and applicable registration/nexus; IP geolocation is not enough.
5. Keep immutable invoice snapshots of the tax rule and rate applied at issue time.
6. Provide jurisdiction-specific invoice numbering, tax IDs, required fields and credit-note handling.
7. Block tax automation when the rule set is missing, expired or unapproved; request accountant review instead of silently applying Kenya's 16% everywhere.

### Payments
1. Use a provider adapter interface and a country/payment-method capability registry.
2. Store allowed currencies, supported payment methods, settlement currencies, merchant legal entity and approval status per provider account.
3. Verify webhooks, use idempotency and reconcile to settlement statements.
4. Do not show a payment method as active until credentials, callback, refunds and settlement have passed sandbox and controlled live tests.
5. Do not store card data; use hosted/tokenized provider flows and follow PCI scope guidance.

### Language, locale and user experience
1. Keep language, region, currency and timezone as separate preferences.
2. Store timestamps in UTC; display in selected IANA timezone.
3. Use Intl APIs for dates, numbers, currency, pluralization and collation, with locale-specific QA.
4. Translate all user-facing content, validation messages, emails, receipts, notifications, accessibility labels and help content.
5. Keep signed legal terms and tax notices human-reviewed in every published language.
6. Support keyboard navigation, screen readers, RTL where needed, local phone/postal/address forms and low-bandwidth/mobile layouts.

### Privacy and operations
1. Map each data flow, controller/processor role, subprocessor, processing region and onward transfer.
2. Execute DPAs and transfer safeguards before customer data is exposed to a subprocessor or region.
3. Implement data-subject request, export, correction, deletion, retention and breach workflows with tenant isolation.
4. Perform DPIAs for health, education/children, biometrics, large-scale profiling and AI use cases.
5. Keep per-country consumer terms, cancellation/refund rules, support contact, complaint escalation and required disclosures.
6. Maintain a market change log and quarterly legal/tax review; rates and rules are versioned, not hard-coded forever.

## 5. Market launch gates

A market may be enabled only when all checks below have named owners and evidence:
- [ ] Local legal entity/merchant eligibility and provider approval confirmed.
- [ ] Tax registration and product/service tax treatment approved by a qualified local adviser.
- [ ] Tax engine rules, invoice/credit-note format and effective dates tested.
- [ ] Payment methods, webhook signatures, idempotency, refunds and settlement reconciliation pass.
- [ ] Transaction currency, display currency and settlement currency tested independently.
- [ ] Privacy notice, DPA, subprocessor register and international transfer assessment approved.
- [ ] Data-subject rights, retention and incident workflows tested.
- [ ] All critical user journeys localized and accessibility-tested.
- [ ] Support hours, language, SLA and customer complaint process staffed.
- [ ] Production monitoring and country-specific incident response active.

**Release rule:** country selection or geolocation must not activate tax collection or a payment method by itself. Market enablement is an explicit reviewed configuration.

## 6. Implementation status of this branch

- [x] Add manual currency override and Auto reset to public display currency.
- [x] Persist visitor display-currency preference.
- [x] Keep transaction/ledger values untouched by display preference.
- [x] Add unit tests for local detection, manual override, reset and unsupported currency.
- [x] Document PR #45/#48 overlap and safe disposition.
- [x] Record priority-market tax, payments, privacy and locale gaps with official references.
- [ ] Execute CI unit tests and browser checks.
- [ ] Merge only after checks pass.
- [ ] Deploy to Cloudflare and run live post-deploy checks.
- [ ] Obtain local legal/accounting/provider approvals before enabling markets.

## 7. Official references reviewed

### Kenya
- KRA VAT rates and treatment: https://www.kra.go.ke/individual/filing-paying/types-of-taxes/value-added-tax
- ODPC laws and regulations: https://odpc.go.ke/data-protection-laws-kenya/
- Kenya Data Protection Act: https://new.kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31

### Nigeria
- Nigeria Tax Act 2025 (VAT provisions): https://www.nipc.gov.ng/wp-content/uploads/2025/08/Nigeria-Tax-Act-2025-Gazette.pdf
- Nigeria Data Protection Act 2023: https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf
- NDPC GAID 2025: https://ndpc.gov.ng/wp-content/uploads/2025/03/NDP-ACT-GAID-2025-MARCH-20TH.pdf

### South Africa
- SARS VAT: https://www.sars.gov.za/types-of-tax/value-added-tax/
- Information Regulator: https://inforegulator.org.za/ (confirm current POPIA guidance and transfer requirements with counsel)

### United Kingdom
- HMRC VAT rates: https://www.gov.uk/vat-rates
- ICO international transfer guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/a-guide-to-international-transfers/

### European Union
- European Commission VAT rates: https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en
- Your Europe VAT rules/rates: https://europa.eu/youreurope/business/finance-and-tax/vat/vat-rules-rates/index_en.htm
- GDPR: https://eur-lex.europa.eu/eli/reg/2016/679/oj

### United States
- IRS material on state/local general sales taxes: https://www.irs.gov/instructions/i1040sca
- State and local tax obligations require state-by-state review; consult each state's tax authority and qualified US tax counsel.

### Australia
- ATO GST registration: https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst
- OAIC Australian Privacy Principles: https://www.oaic.gov.au/privacy/australian-privacy-principles/read-the-australian-privacy-principles
- OAIC APP 8 cross-border disclosure guidance: https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information

### India
- GST Council rate notifications: https://www.gstcouncil.gov.in/cgst-rate-notification
- Digital Personal Data Protection Act 2023: https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf
- Digital Personal Data Protection Rules 2025: https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf

### Payments
- Paystack countries served: https://support.paystack.com/en/articles/2130562
- Paystack international payments/currency eligibility: https://support.paystack.com/en/articles/2130690
- Paystack local payment methods: https://support.paystack.com/en/articles/2132354

**Caveat:** Official references are a starting point. Rates, thresholds, exemptions, registration rules and commencement dates can change. The tax matrix must be refreshed by local advisers before a market is enabled. This document is not a legal opinion or proof of VIORA compliance.
