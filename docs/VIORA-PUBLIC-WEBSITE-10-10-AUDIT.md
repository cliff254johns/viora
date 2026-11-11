# VIORA public website — 10/10 readiness audit
Date: 11 November 2026
Repository: `cliff254johns/viora`
Audit base: `main` at `a2d7424aa63810fcff5b15b9cb41d4b6781aef38`
Working branch: `audit/public-website-10-of-10-20261111`

## Scope and evidence

- Inspected all 26 top-level HTML files under `web/` for page size, title, description, canonical URL, viewport, H1 count, inline scripts/styles, style attributes, and linked stylesheets.
- Inspected the root landing page, legacy assistant template, sitemap, robots.txt, PWA manifest, Cloudflare redirects, and public navigation references.
- This is a static source audit. It is not a Lighthouse report, live-browser test, screen-reader test, or physical-device certification. No claim of production runtime verification is made.

## Executive assessment

Provisional readiness scores (engineering judgement, not an automated grade):
- Professional public website: **7/10**
- Working multi-portal platform: **5/10** (out of scope for this phase; retained only as a baseline)

The public site has a good foundation: 26 top-level HTML pages, shared branding styles, a sitemap, robots.txt, canonical redirects, multilingual landing pages, a manifest, and shared PWA registration. The remaining gap is consistency, maintainability, accessibility/performance validation, and real-device/browser testing.

## Findings

### P0 — Search identity and page ownership

1. `web/index.html` is the root landing page and correctly declares `https://viora.co.ke/` as canonical.
2. `web/inde.html` is also a complete legacy landing page, is used by `mainIndex/site-assistant-loader.js` as the source template for mounting the chatbot, but declared itself indexable and canonicalized to the competing `https://www.viora.co.ke/` root.
3. This creates conflicting canonical signals and exposes an assistant-template/legacy page to search indexing.

**Correction started on this branch:** set `inde.html` to `noindex,follow`, normalize its canonical and Open Graph URL to the non-www root. This preserves the page and its chatbot-template markers while avoiding a second competing search landing page.

### P1 — Main public landing page architecture

`web/index.html` is 37.7 KB and contains:
- 4 inline script blocks
- 4 inline style blocks
- 61 inline style attributes
- multiple font-family loads and repeated font preconnect declarations

The page already has external stylesheets, shared PWA registration, title/description, canonical, Open Graph/Twitter metadata, and Organization JSON-LD. The next refactor should move non-critical inline styles/scripts into dedicated files in small batches, preserving script order and checking for inline configuration dependencies.

### P1 — Main application shell and finance page

These are application surfaces, not ordinary marketing pages, but they are part of the visitor journey and require a separate quality gate:
- `web/main.html`: 249,975 bytes; 4 inline script blocks; 3 style blocks; 481 inline style attributes.
- `web/finance.html`: 245,199 bytes; 3 inline script blocks; 2 style blocks; 151 inline style attributes.

Do not bulk-extract their inline code. First map dependencies, inline configuration, global functions, and load order. Refactor one feature at a time with regression checks.

### P1 — PWA readiness

`web/manifest.webmanifest` declares only one icon, `/viora.png`, with no explicit 192x192 or 512x512 variants. The repository has 192/512 icon files under the BodaBiz-specific `web/assets/r/icons/` path, but those must not be reused as VIORA branding.

Required: create or supply VIORA-branded square icons, declare exact dimensions and purpose, verify the image dimensions, and test install/update behaviour on Android and iOS.

### P2 — Metadata consistency

The main sitemap routes inspected have titles, descriptions, canonical URLs, viewport declarations and one H1. Some secondary/demo or portal pages do not:
- `3d.html`: no description or canonical.
- `campaigns.html`, `clientportal.html`, `cliff.html`, `patner.html`, `public.html`, `scholar-admin.html`, `trainer.html`, `trainingportal.html`: missing canonical and/or description.
- Several portal pages are intentionally excluded from crawling in robots.txt, but access control and index directives must be reviewed together; robots.txt alone is not a privacy or access-control mechanism.

Next: classify every route as public/indexable, public/noindex, or authenticated/private. Apply metadata and crawl policy consistently; do not accidentally expose portal content in search.

### P2 — Static asset references

The Market page references three fallback notification audio paths:
- `/sounds/viora-notification.mp3`
- `/viora-notification.mp3`
- `/notification.mp3`

No matching audio files were found in the repository tree. The notification bridge may still function without sound, but these fallbacks cannot play from the current repository assets. Decide whether to add a properly licensed VIORA sound or remove the unused audio element and provide silent notification behaviour.

### P2 — Accessibility, performance and responsive validation

Source presence alone cannot certify:
- keyboard navigation and visible focus,
- modal focus trapping and Escape handling,
- screen-reader labels and live-region announcements,
- colour contrast and text scaling,
- reduced-motion behaviour,
- layout at narrow widths and landscape,
- image dimensions/lazy loading,
- Core Web Vitals and JavaScript console cleanliness.

These need automated checks plus real browser/device walkthroughs.

## Public route inventory

26 top-level HTML files were inspected. Main public sitemap routes include:
- `/`, `/industries`, `/market`, `/training`, `/about`, `/support`, `/contact_us`, `/fr/`, and `/es/`.
- Legal pages include privacy, cookies, terms, DPA and accessibility.
- Product demos, staff pages, and portal/application routes need explicit indexability classification.

## Implementation order

1. Resolve duplicate/legacy search identity (started in this branch).
2. Confirm public route ownership and canonical redirects against sitemap.
3. Fix definite missing assets and page metadata where appropriate.
4. Establish VIORA PWA icon set and verify manifest.
5. Audit public navigation, CTA forms, chatbot mount and cookie consent behaviour.
6. Refactor root landing page CSS/JS into external files in safe, testable increments.
7. Audit and refactor remaining public pages.
8. Test responsive layouts, dialogs, accessibility, performance and SEO.
9. Run final browser/device acceptance checks and verify automatic Cloudflare deployment after merge.

## Definition of done

- Every public route has one canonical URL and correct indexability.
- No broken primary navigation, CTAs, forms, chatbot mount, or cookie consent.
- No critical mobile/tablet/desktop layout defects.
- No critical console/network errors.
- Correct VIORA PWA icons and verified install/update flow.
- Keyboard and screen-reader essentials pass.
- No unverified customer counts, certifications, or performance claims.
- All material CSS/JS separated from HTML without regressions, except documented minimal critical inline configuration.
- Automated and manual acceptance evidence recorded.
