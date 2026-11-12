# VIORA pull-request reconciliation — #45 and #48
**Date:** 13 November 2026. **Decision:** close both without merging; preserve current `main`.

## PR #45 — Consolidate outstanding VIORA updates
- Head `4f032c58eabf4202164923ba4e26e5a27795c287`; 107 commits, 29 files, +866/-458.
- GitHub base SHA `4d7f2bb2a6809e3fa7c4914360d82cc3c549f717`; current main at review `944d980bea6fd821d2a927303799975df2b2fdba`.
- Comparison: 107 ahead, 690 behind; GitHub reported not mergeable.

### What is already present in current main
- `web/main/campaign-ai.js`: required scheduled time and future-date validation are present.
- `web/main/orbit-modules.js` and `web/main/write-layer.js`: current main blobs are identical to the PR branch; calendar and campaign-write fixes are already present.
- `web/hero-orb.js`: responsive resize observer handling is present.
- `web/mainIndex/chatbot.js`: assistant namespace separation is present; current main is materially newer.
- `web/sw.js`: current main is v1.5.1 vs PR branch v1.4.5/v1.4.6; network-first/no-store behavior is already present.
- `web/llms.txt`: identical between current main and PR branch.

### Why the rest was not merged
Current `sitemap.xml`, `_redirects`, `global-brand.css`, `global-brand.js`, `index.html`, `market.html`, `client.html`, `about.html`, `support.html` and `training.html` differ and are newer/more complete in current main. PR manifest changes replace explicit 192px/512px/SVG icon declarations with `/viora.png`; these were not accepted. Merging this old 29-file snapshot risks rolling back newer public pages and app behavior.

**Outcome:** PR #45 closed without merging. Core fixes checked above are already in main. Any missing item must be ported as a narrow new PR based on current main.

## PR #48 — Update VIORA assistant poses and PWA branding
- Head `4fc9cfc53cc7273fb8d165d204e99c9f40c0d061`; 6 commits, 6 files, +52/-29.
- GitHub base SHA `4d7f2bb2a6809e3fa7c4914360d82cc3c549f717`; current main `944d980bea6fd821d2a927303799975df2b2fdba`.
- Comparison: 6 ahead, 620 behind; GitHub reported not mergeable. Recorded Cloudflare preview build for this head failed.

### What is already present / why it was rejected
- Three-pose animation CSS is already present in current `web/mainIndex/chatbot.css`.
- Current `web/mainIndex/chatbot.js` is materially newer.
- PR manifests replace current 192x192, 512x512 and SVG icons with one `/viora.png` icon declared `1024x1024`; actual dimensions were not verified and the maskable 512px entry is removed. This is an unverified PWA regression risk.
- The PR's `main.html`, `main.webmanifest` and `manifest.json` changes were not copied.

**Outcome:** PR #48 closed without merging. Current assistant and manifest assets are retained. A future icon change must verify actual image dimensions, maskable safe zone, PWA install/update and browser checks in a fresh PR.

## Closure and production impact
- Both PRs were closed with explanatory comments.
- Neither was merged.
- No production application files changed as a result of this reconciliation.
- No Cloudflare production deployment was triggered by closing the PRs.
- Current main was preserved.

Do not reopen these old heads for merge. Reintroduce any still-needed feature on a fresh branch from current main and require isolated preview and passing checks.
