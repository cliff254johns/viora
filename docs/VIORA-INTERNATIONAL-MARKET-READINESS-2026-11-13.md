# VIORA International Market Readiness
**Assessment:** 13 November 2026. **Status:** technical/public-source review; not legal or tax advice and not a certification.

## Executive finding
VIORA has international foundations but is not yet a globally compliant multi-currency finance/payments platform. Public pages estimate visitor currency and AI-translate text. Finance remains Kenya-oriented: KES-specific workflows, a 16% VAT reserve default and Kenya statutory payroll calculations. The deployed API has Daraja STK code, but required secrets are absent, the configured callback URL is malformed and callback processing is unsafe to trust as proof of payment.

No country is certified launch-ready for statutory tax invoices or live payments. Harden Kenya first.

## Code and live configuration evidence

### Currency
`web/currency-display.js` uses IP country estimation, Frankfurter reference rates with a fallback provider, local caching and `Intl.NumberFormat`. This is indicative display conversion, not settlement, accounting or tax FX. It does not prove every portal uses it. Never change posted invoice/payment/ledger currency when a visitor changes display currency. Keep display, transaction, tax and settlement currencies separate.

### Language
`web/mainIndex/site-language.js` has 15 language options using AI translation and local caching. Static public pages exist in English, French and Spanish. Full portal/PDF/email/legal coverage, manual terminology review and RTL conformance are not verified. Machine translation is not the final authority for legal, tax, payroll, clinical or safety-critical text.

### Payments
The deployed `viora-api` Worker has Daraja STK, C2B and callback handlers. Client portal STK checks invoice ownership. Cloudflare settings show:
- Missing secret bindings: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`.
- `MPESA_CALLBACK_URL` is `https://viora-api.cliff254johns.workers.dev/mpesa/stk/callbac` (truncated/misspelled).
- Finance frontend sends `accountReference`; Worker reads `accountRef`, so invoice reference can fall back to generic `Viora`.
- STK callback stores submitted JSON without verifying transaction status/authenticity or idempotency, catches DB write errors and still acknowledges. C2B confirm also stores submitted data without validation.
- A Flutterwave checkout script exists in one demo page, but no platform-wide server-side Flutterwave or Stripe adapter was evidenced in the deployed Worker.

**Decision:** M-Pesa is partly implemented, not production-configured or verified. Do not enable live collections until secrets, callback security, independent status verification, amount/currency/invoice validation, idempotency, reconciliation and sandbox tests are complete.

### Tax
Finance VAT reserve defaults to 16%; deployed payroll code hardcodes Kenya NSSF, SHIF, Housing Levy and PAYE. No general jurisdiction-aware tax engine or verified statutory e-invoice adapter was found in inspected paths. eTIMS appears in marketing copy, but successful live KRA submissions were not evidenced. Uganda EFRIS, Rwanda EBM/EIS and India IRP integrations were not evidenced. Do not call ordinary PDFs statutory e-invoices where fiscalisation is required.

### Legal/privacy
Privacy, terms, DPA and cookie pages identify VIORA as Kenya-registered; terms choose Kenyan law. Privacy/DPA mention Kenya DPA and GDPR/UK GDPR concepts, but no local counsel approval, regulator registration or full country-specific transfer evidence was established.

## Public-claim corrections made during this assessment

The public product copy and the alternate product overview were corrected to avoid presenting unconfigured or unverified integrations as live global capabilities:
- M-Pesa is described as configurable, not as a currently verified live payment/reconciliation service.
- eTIMS, statutory payroll and tax compliance are described as jurisdiction-specific integrations requiring configuration and validation.
- Finance copy no longer promises universal multi-currency ledgers or automatic bank/M-Pesa reconciliation.
- Security copy no longer promises automatic key rotation, universal MFA enforcement or verified daily restore drills without deployment evidence.
- Unsupported numerical marketing KPIs and fabricated pilot testimonials/metrics were removed from the alternate product overview. The section now contains clearly labelled illustrative workflow examples; demo counters are labelled as demo placeholders.
- Industry blueprints now carry a notice that tax, payment, payroll and statutory functions are illustrative until market-specific integrations are configured and verified.

These are copy-accuracy changes, not proof that the underlying integrations have been completed.

## Country-by-country launch matrix

| Market | Currency | Payment route to assess | Tax/invoicing work | Privacy/legal work | Current VIORA status |
|---|---|---|---|---|---|
| Kenya | KES | Daraja; cards/provider | KRA VAT, eTIMS, payroll | Kenya DPA, ODPC, transfers | Foundation only; M-Pesa config/callback unsafe; eTIMS unverified |
| Uganda | UGX | Flutterwave MTN/Airtel | URA EFRIS (VAT-registered and designated sectors) | Local registration/transfers | Adapter required |
| Tanzania | TZS | Flutterwave Airtel/Tigo/HaloPesa/Vodacom | TRA VAT, EFD/e-invoice | PDPA 2022, PDPC | Adapter required |
| Rwanda | RWF | Flutterwave MTN/Airtel | RRA VAT, EIS/EBM | Local privacy/transfer review | Adapter required |
| Nigeria | NGN | Flutterwave coverage; eligibility | VAT, tax reforms, digital services | NDPA 2023, section 41 transfers | Adapter required |
| South Africa | ZAR | Flutterwave card/local methods | SARS VAT and tax-invoice rules | POPIA, section 72 transfers | Adapter required |
| UK | GBP | Stripe/Flutterwave eligibility | HMRC digital services/place-of-supply VAT | UK GDPR, ICO and transfer safeguards | Adapter required |
| EU/EEA | EUR + local currencies | Country-specific provider methods | VAT OSS/IOSS and member-state rules | GDPR Chapter V and national DPAs | Adapter required |
| US | USD | Merchant-country dependent | State/local sales tax, nexus, taxability | Federal/state privacy laws | Not approved for tax automation |
| Canada | CAD | Provider eligibility | GST/HST digital economy and provincial tax | PIPEDA/provincial privacy | Adapter required |
| India | INR | Stripe eligibility/preview and local rails | GST, place of supply, IRP/e-invoice applicability | DPDP Act/transfer review | Adapter required |
| UAE | AED | Merchant/local acquiring | FTA VAT, invoice and free-zone considerations | Federal PDPL; DIFC/ADGM where relevant | Adapter required |
| Australia | AUD | Provider eligibility | ATO GST, non-resident digital services | Privacy Act/APP overseas disclosure | Adapter required |
| Ghana | GHS | Flutterwave MTN/Vodafone/AirtelTigo | GRA VAT/e-invoicing | Data Protection Act 2012 | Adapter required |

This is a prioritisation tool, not a legal opinion. Exact treatment depends on entity, product/service, customer type/location, place of supply, registrations, thresholds and contracts.

## Provider coverage is not VIORA integration
Flutterwave publishes mobile-money coverage for Kenya, Uganda, Tanzania, Rwanda, Ghana and XOF/XAF markets. That proves provider coverage only—not VIORA merchant approval, credentials, settlement, refunds, webhooks or live integration. Stripe country availability is merchant-account eligibility; preview/extended-network does not mean ordinary full availability.

## Required architecture
1. Tenant legal identity, country, registrations, branch and invoice identity.
2. Separate immutable transaction currency, display currency and settlement currency.
3. Versioned tax rules with effective dates, B2B/B2C, place-of-supply, exemptions, reverse charge, rounding and immutable tax snapshots.
4. Fiscalisation adapters (KRA eTIMS, URA EFRIS, Rwanda EBM/EIS, India IRP, etc.).
5. Payment adapters with server secrets, verified callbacks, idempotency, amount/currency checks, status queries, refunds and ledger reconciliation.
6. Locale layer: BCP-47, timezone, CLDR/Intl formats, RTL and human-reviewed critical strings.
7. Data-flow/subprocessor map, controller/processor roles, transfer safeguards, retention, deletion/export, breach process and market-specific legal annexes.
8. Country feature flags; no market enabled until tax, payment, privacy, contract, support and operations gates pass.

## Rollout
**Kenya first:** provision Daraja secrets; harden callbacks; verify status independently; validate invoice, amount and KES; make callbacks idempotent; fix `accountReference` mismatch; correct callback URL only after securing handler; sandbox-test success, timeout, cancellation, duplicate, wrong amount/invoice and refund; verify eTIMS; confirm ODPC position.

**Uganda/Tanzania/Rwanda:** confirm provider onboarding/settlement and implement EFRIS/TRA/EBM as applicable; complete privacy review.

**Nigeria/South Africa/UK/EU:** local tax counsel, platform-role analysis, data transfer safeguards, merchant eligibility and settlement.

**US/Canada/India/UAE/Australia/Ghana:** sub-matrices (US by state, Canada by province, India by state/GST registration, UAE federal/free-zone) before launch.

## Market launch acceptance
A market is Ready only after local legal/tax approval; verified registrations; fiscalisation tests; approved merchant and payment/refund/reconciliation tests; separate currency paths; locale/translation/RTL tests; reviewed privacy/DPA/transfer/subprocessor controls; support/complaints/refunds; and recorded production smoke-test evidence.

## Primary sources
- KRA VAT: https://www.kra.go.ke/component/kra_faq/faq/48
- Kenya ODPC: https://www.odpc.go.ke/faqs/
- Uganda URA EFRIS: https://ura.go.ug/en/efris-handbook/
- Rwanda RRA VAT/EBM: https://www.rra.gov.rw/en/domestic-tax-services/value-added-tax/default-title-1
- Tanzania PDPC: https://pdpc.go.tz/about-us/
- Nigeria NDPA 2023: https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf
- SARS invoices: https://www.sars.gov.za/businesses-and-employers/government/tax-invoices/
- HMRC digital services VAT: https://www.gov.uk/guidance/the-vat-rules-if-you-supply-digital-services-to-private-consumers
- ICO transfers: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/a-guide-to-international-transfers/
- EU VAT OSS: https://vat-one-stop-shop.ec.europa.eu/
- EDPB transfers: https://www.edpb.europa.eu/topics/international-transfers-and-international-cooperation_nb
- Canada CRA: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/digital-economy.html
- India GST IRP: https://einvoice6.gst.gov.in/content/einvoice-mandate/
- UAE FTA: https://tax.gov.ae/en/taxes/Vat/guides.references.aspx
- ATO: https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst
- Flutterwave: https://developer.flutterwave.com/docs/coverage

**Limit:** sources establish selected obligations/provider coverage, not VIORA registrations, legal compliance, merchant approval or end-to-end operation.
