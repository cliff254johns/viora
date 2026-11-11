# VIORA public website — 10/10 readiness audit

Date: 11 November 2026
Repository: `cliff254johns/viora`
Audit base: `main` at `9b6f945a7e92ab861e522a18fb8f7677c941abc3`
Implementation: merged to `main` through PR #27

## Scope and evidence

- Reviewed 26 top-level HTML files for metadata, canonical URLs, viewport, H1 count, inline CSS/JS and linked assets.
- Validated the 22 URLs currently listed in `sitemap.xml`: each has a title, description, canonical URL and one H1; each loads the shared language/assistant bootstrap and cookie-consent controller.
- Inspected `robots.txt`, Cloudflare redirects, both root PWA manifests, shared PWA registration, cookie consent, analytics configuration, contact forms, the chatbot loader and authenticated portal entry points.
- This remains a static source audit. It is not a Lighthouse run, live-browser test, screen-reader test, real form submission, or physical-device certification.

## Executive assessment

Provisional source-readiness judgement (not an automated score):
- Professional public website: **8/10**
- Working multi-portal platform: **5/10 baseline**; the platform is intentionally the next phase, not certified by this public-site audit.

The public-site foundation is now materially more consistent. The remaining path to 10/10 is real-browser/device validation, correct square PWA artwork, accessibility/performance evidence, and careful refactoring of legacy inline code without regressions.

## Completed and merged

### Search identity, canonical URLs and indexability

- The root homepage is canonical at `https://viora.co.ke/`.
- The legacy `inde.html` chatbot source template is `noindex,follow` and uses the non-www canonical/Open Graph URL. It must remain available because the assistant loader extracts its chatbot markup.
- `/3d` has description, canonical, robots and social metadata.
- Authenticated entry points (`campaigns`, `clientportal`, `scholar-admin`, `trainer`, `trainingportal`, `patner`, `client`, `main`, and `finance`) carry noindex directives. The duplicate employee-profile source template `/public` is also noindex.
- `robots.txt` no longer blocks the main login route before its noindex directive can be read. `/main/` remains disallowed for internal module paths. Robots rules are not access control; Firebase Auth and database rules remain the security boundary.
- Legal page canonicals now match the extensionless routes served by Cloudflare redirects. The sitemap has 22 unique public URLs, including Privacy, Terms, Cookies, DPA, Accessibility and the published `/cliff` team profile.
- The published `/cliff` page has a canonical; the shared profile renderer sets canonical and Open Graph URL dynamically for future employee profile pages.

### Shared public experience

- All 22 public sitemap pages load `global-brand.js`, which injects the language selector, site assistant loader, mobile polish stylesheet and shared PWA registration.
- All 22 public sitemap pages load `cookie-consent.js`. The consent preferences dialog now traps Tab/Shift+Tab and restores focus when dismissed. The floating settings shortcut remains hidden after accept, reject or save.
- The home-page contact form writes leads to Firebase and attempts a VIORA notification. The Contact page writes the lead to Firebase and provides WhatsApp follow-up/fallback. These paths have only been inspected in source; no live submission was made.
- Analytics is consent-aware. GA4, GTM, Meta and TikTok IDs are blank in `analytics-config.js`, so third-party tracking remains disabled until the IDs are configured and consent is given.

### Performance, browser policy and PWA metadata

- The homepage's duplicate Google Fonts requests and repeated preconnect hints were consolidated into one font stylesheet request and one preconnect pair.
- The global Permissions-Policy now allows same-origin geolocation (`geolocation=(self)`) so the dashboard's user-triggered GPS action can work. Browser permission is still required; the header itself does not request location.
- The unused Market notification audio element and its missing fallback paths were removed. Notifications are recorded, but audible alerts are not implemented.
- The legacy manifest's nonexistent `/dash.html` launch route and unsupported AI shortcut were corrected. Both root manifests now declare the real `/viora.png` dimensions rather than falsely claiming square icon sizes or maskable support.

## Remaining blockers before 10/10

1. **VIORA app icons:** `/viora.png` is 1290×1219, not square. Supply or approve creation of VIORA-branded square 192×192 and 512×512 PNGs (including a maskable-safe variant if desired). Do not reuse the BodaBiz icons under `web/assets/r/icons/`.
2. **Live browser QA:** test the 22 public routes on desktop Chrome and Android Chrome; include iOS Safari if available. Verify layout, image loading, navigation, language switching, cookie consent, assistant mounting, and PWA install/update.
3. **Mobile hero:** visually verify globe framing, sun/cloud visibility, safe-area spacing, bottom navigation and floating controls at narrow widths and landscape. Source changes alone cannot certify appearance.
4. **Dialogs and accessibility:** test keyboard order, visible focus, Escape, focus return, screen-reader labels/live regions, text scaling, contrast and reduced motion. The cookie preferences dialog has a source-level focus trap; other dialogs still need review.
5. **Forms and assistant:** submit test leads in a safe test environment, confirm Firebase persistence and admin notification, verify WhatsApp fallback, and test chatbot responses/language switching against the live Worker. Check console and network errors.
6. **Performance:** run Lighthouse and an accessibility audit; capture LCP, INP, CLS, image weight, unused JavaScript and third-party requests. No performance score is claimed yet.
7. **Maintainability:** `index.html` still has 4 inline script blocks, 4 inline style blocks and 61 inline style attributes. `main.html` and `finance.html` are large application surfaces with substantial inline code. Refactor only in small batches after mapping globals, inline configuration and script order.
8. **Deployment confirmation:** merge commits are on GitHub `main`, but no deployment was triggered or verified in this work. The owner will deploy and confirm the Cloudflare build.

## Current route and repository checks

- `sitemap.xml`: 22 unique public URLs.
- Public routes: title, description, canonical and one H1 checked in source; shared language/assistant and cookie-consent scripts present.
- Authenticated route policy: noindex directives checked on the main app, Finance, Client, Campaigns, Client Portal, Scholar Admin, Trainer, Learner Portal and Partner Performance entry pages.
- PWA manifests: JSON parses; launch paths now point to existing routes; square branded icon assets remain outstanding.
- GitHub: PRs #18–#27 are merged; no open pull requests were returned at the final check.
- No production deployment, Lighthouse report, automated browser test or device test is claimed.

## Definition of done

- Every public route has one correct canonical URL and intentional indexability.
- No broken primary navigation, CTAs, forms, chatbot mount or cookie-consent flow.
- No critical mobile/tablet/desktop layout defects or console/network errors.
- Correct VIORA square PWA icons and verified Android/iOS install/update behaviour.
- Keyboard and screen-reader essentials pass; dialogs work with touch and keyboard.
- Core Web Vitals and accessibility audit results are recorded.
- No unverified customer counts, certifications or performance claims.
- Material CSS/JS is separated from HTML in safe increments, with documented exceptions for essential inline configuration.
- Deployment and post-deploy smoke-test evidence are recorded.

