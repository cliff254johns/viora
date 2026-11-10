# VIORA Global Readiness — Deployment Notes

This change prepares the public website for broader international discovery. It does not claim that every external marketing account or analytics provider is already connected.

## Implemented in this branch

- Global English homepage positioning and a clearer primary conversion path.
- An industry discovery hub plus dedicated retail, healthcare, education, hospitality, logistics, agriculture and professional-services landing pages.
- English, French and Spanish homepage-level landing pages with reciprocal hreflang metadata.
- Canonical, Open Graph, Twitter card, robots and structured-data improvements on key public pages.
- A sitemap covering the new public landing pages.
- Country/region and organisation-size fields in the enquiry form; these are included in the Firebase lead record and WhatsApp handoff.
- Consent UI loader and a consent-aware analytics adapter.
- Cloudflare Static Assets security headers and service-worker shell updates.
- Removal of unsupported homepage defaults that previously displayed assumed client and project totals.

## External account configuration still required

### Google Analytics 4
Edit `web/analytics-config.js` and set `ga4MeasurementId` to the real Measurement ID for the VIORA GA4 property. Leave it blank until the property exists. The analytics adapter does not load GA4 unless the ID is valid and the visitor has granted analytics consent.

### Search engines
1. Verify `viora.co.ke` in Google Search Console using a DNS TXT record in Cloudflare.
2. Verify the site in Bing Webmaster Tools.
3. Submit `https://viora.co.ke/sitemap.xml` in both consoles.
4. Review indexing, country distribution, queries and Core Web Vitals after launch.

No verification tokens or ownership credentials have been fabricated or committed.

### Advertising and social measurement
Meta, LinkedIn and TikTok pixel IDs remain intentionally blank. Add them only after the correct business assets and consent requirements are confirmed. Do not paste secret API tokens into public frontend files.

## Language coverage

English remains the main site language. French and Spanish landing pages provide translated first-contact messaging and language switching. The full market, client portal, Academy, support and enquiry journeys are not yet fully translated; complete professional localization before running paid campaigns specifically targeting French- or Spanish-speaking markets.

## Performance and security validation

- Cloudflare `_headers` adds baseline security headers and revalidation for mutable HTML/CSS/JS.
- Service worker version is bumped and public industry/language routes are added to the reviewed shell.
- Test the homepage and industry pages on mobile and desktop, including keyboard navigation and reduced-motion preferences.
- Run PageSpeed Insights / Lighthouse from multiple network conditions. Do not claim performance scores until measured.

## Pre-deployment checks

- Confirm Cloudflare Pages/Workers Static Assets is deploying the `web/` directory and sees `_headers`, `_redirects` and `wrangler.toml`.
- Confirm all new clean URLs resolve and their canonical tags match the final URL.
- Confirm the cookie banner appears on first visit, preferences persist, and no analytics request is made before opt-in.
- Submit a test enquiry and verify country and business size appear in the Firebase lead record.
- Verify the French and Spanish pages render with the correct language attributes and hreflang links.
- Review Privacy and Cookie Policy wording with a qualified data-protection adviser before campaigns in additional jurisdictions.
