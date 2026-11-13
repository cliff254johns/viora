import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(p, 'utf8');
const main = read('web/main.html');
const sharedPwa = read('web/shared-pwa.js');
const mainJs = read('web/main.js');
const worker = read('web/worker.js');
const wrangler = read('web/wrangler.toml');
const command = read('web/engineering-command-centre.js');
const investorRoom = read('web/investor-data-room.js');
const sw = read('web/sw.js');
const chatbot = read('web/mainIndex/chatbot.js');
const dpa = read('web/dpa.html');
const staticWorker = read('workers/viora-static-next/worker.js');
const staticConfig = read('workers/viora-static-next/wrangler.toml');
const embeddedAssets = read('workers/viora-static-next/assets.generated.js');

const taxonomy = read('web/viora-taxonomy.js');
const publicMarket = read('web/market.html');
const publicHome = read('web/index.html');
const publicMarketJs = read('web/mainMarket/market.js');
const publicIndustryDirectory = read('web/industries.html');
const homeScript = read('web/script.js');
const adminMarket = read('web/main/render-marketplace.js');
const homepage = read('web/index-home.js');
const blueprintAdmin = read('web/main/pp.js');
const industryDirectory = read('web/mainIndex/industries.js');
const adminHandlers = read('web/main/viora-main-handlers.js');
const homeAdmin = read('web/main/home-content.js');
const industryMatcher = read('web/industry-marketplace.js');
const blueprintPage = read('web/mainIndex/blueprint.js');
const industryPage = read('web/inde.html');
const supportPage = read('web/support.html');
assert.equal((taxonomy.match(/id:'(?:enterprise|institutional|hospitality|property|industry|business)'/g) || []).length, 6, 'shared taxonomy must define exactly six official VIORA categories');
for (const label of ['VIORA Enterprise Solutions','VIORA Institutional Solutions','VIORA Hospitality Solutions','VIORA Property & Infrastructure Solutions','VIORA Industry & Operations Solutions','VIORA Business & Lifestyle Solutions']) {
  assert.ok(taxonomy.includes(label), 'shared taxonomy missing '+label);
}
assert.ok(publicMarket.includes('id="mainCategoryFilter"'), 'public Marketplace must expose the six-category dropdown');
assert.ok(publicMarket.includes('id="categoryBar"'), 'public Marketplace must retain its horizontal category scroller');
assert.ok(!publicMarket.includes('id="priceFilter"') && !publicMarket.includes('id="catSearchInput"'), 'public Marketplace must not show legacy secondary category/price filters');
assert.ok(publicMarketJs.includes("import '../viora-taxonomy.js'"), 'public Marketplace must load shared taxonomy');
assert.ok(publicMarketJs.includes('classifyProduct(p)'), 'public Marketplace must classify products through shared taxonomy');
assert.ok(publicMarketJs.includes('this.renderCategoryBar();'), 'public Marketplace must render category controls before Firebase/cache data arrives');
assert.ok(publicMarketJs.includes('new URLSearchParams(window.location.search).get(\'category\')'), 'public Marketplace must accept direct links to a solution family');
assert.ok((publicHome.match(/href="\/market\?category=(?:enterprise|institutional|hospitality|property|industry|business)"/g) || []).length === 6, 'homepage solution family cards must deep-link to all six Marketplace filters');
assert.ok(adminMarket.includes('classifyProduct(p)'), 'admin Marketplace must classify products through shared taxonomy');
assert.ok(adminHandlers.includes('vioraCategoryId: categoryId'), 'admin product saves must persist canonical category ID');
assert.ok(adminHandlers.includes('Viora.migrateMarketplaceCategories') && adminHandlers.includes('Only category fields and updatedAt will change'), 'admin must provide a confirmed idempotent migration for existing product records');
assert.ok(read('web/main.html').includes('onclick="Viora.migrateMarketplaceCategories()"'), 'admin Products & Pricing must expose the controlled category migration action');
assert.ok(read('web/main.html').includes('<option value="all">All VIORA Solutions</option>'), 'admin Marketplace must use the official VIORA category label');
assert.ok(homepage.includes("import './viora-taxonomy.js'"), 'homepage must load shared taxonomy');
assert.ok(homepage.includes('taxonomy.categories.map'), 'homepage tour must use official solution categories');
assert.ok(blueprintAdmin.includes('classifyIndustry'), 'admin industry blueprints must normalize legacy categories');
assert.ok(homeAdmin.includes('normalizedFamilies') && homeAdmin.includes('renderBucketCard(b, normalizedFamilies)'), 'home content editor must display legacy families under canonical categories');
assert.ok(homeAdmin.includes('classifyIndustry(ind, ind.bucket)'), 'home content industry editor must normalize legacy categories');
assert.ok(industryMatcher.includes('classifyProduct(product)') && industryMatcher.includes('classifyIndustry'), 'standalone industry product matching must use the shared taxonomy');
assert.ok(industryMatcher.includes('heroEyebrow.textContent=solutionCategoryName'), 'standalone industry pages must visibly identify their VIORA solution family');
assert.ok(blueprintPage.includes('classifyProduct(p)'), 'industry blueprint product matching must use the shared taxonomy');
assert.ok(industryPage.includes('/viora-taxonomy.js'), 'industry blueprint page must load taxonomy before its industry data');
assert.ok(supportPage.includes('classifyProduct(p)') && supportPage.includes('categories = window.VIORATaxonomy.categories'), 'support product catalogue must use the six official categories');
const supportModuleMatch = supportPage.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(supportModuleMatch, 'support page must retain its module script');
const supportModuleSource = supportModuleMatch[1].replace(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"][^'"]+['"]\s*;?\s*$/gm, '');
new vm.Script(supportModuleSource, { filename:'support-inline-module.js' });
assert.ok(supportPage.indexOf('Show the canonical six solution filters immediately') < supportPage.indexOf('onValue(ref(db, `${ROOT}/products`)'), 'support filters must render before Firebase responds');
assert.ok(industryDirectory.includes('VIORA Property & Infrastructure Solutions'), 'industry directory must expose official solution groups');
assert.ok(publicIndustryDirectory.includes('VIORA Enterprise Solutions') && publicIndustryDirectory.includes('VIORA Business & Lifestyle Solutions'), 'public industry directory must use official VIORA category names');
assert.ok((homeScript.match(/name: 'VIORA (?:Enterprise|Institutional|Hospitality|Property & Infrastructure|Industry & Operations|Business & Lifestyle) Solutions'/g) || []).length === 6, 'homepage industry carousel must contain exactly six VIORA solution families');
assert.ok((homeScript.match(/label: 'VIORA (?:Enterprise|Institutional|Hospitality|Property & Infrastructure|Industry & Operations|Business & Lifestyle) Solutions'/g) || []).length === 6, 'homepage solution wizard must offer exactly six VIORA solution families');
assert.ok(publicMarket.includes('type="image/png" href="/viora.png"'), 'Marketplace favicon must declare the canonical PNG correctly');

const taxonomyWindow = {};
vm.runInNewContext(taxonomy, { window: taxonomyWindow });
for (const category of taxonomyWindow.VIORATaxonomy.categories) {
  assert.ok(publicHome.includes(category.name.replace(/&/g, '&amp;')), 'homepage missing solution family '+category.name);
}
const classify = taxonomyWindow.VIORATaxonomy.classifyProduct;
const expectedLegacyProducts = [
  ['Retail & Wholesale Systems','enterprise'],
  ['Hardware Systems','enterprise'],
  ['Clinic Systems','institutional'],
  ['Hospital Systems','institutional'],
  ['School Systems','institutional'],
  ['Hotel & Guest House Systems','hospitality'],
  ['Restaurant & Catering Systems','hospitality'],
  ['Clubs & Entertainment Systems','hospitality'],
  ['Construction Project Systems','property'],
  ['Real Estate Agency Systems','property'],
  ['Security Company Systems','property'],
  ['Farm Systems','industry'],
  ['Greenhouse Systems','industry'],
  ['Cleaning Operations Systems','industry'],
  ['Laundry & Dry Cleaning Systems','industry'],
  ['Garage & Automotive Service Systems','industry'],
  ['Transport & Fleet Systems','industry'],
  ['Printing & Graphics Production Systems','industry'],
  ['Salon, Spa & Beauty Systems','business'],
  ['Fashion & Apparel Systems','business'],
  ['Recruitment Agency Systems','business'],
  ['Funeral Home Systems','business'],
  ['Legal Practice Systems','business'],
  ['3D Websites','business'],
  ['General Websites','business'],
  ['AI & Automation','enterprise'],
  ['Industry Specific Production Systems','industry'],
  ['Food & Beverage','hospitality'],
  ['Health & Wellness','institutional'],
  ['Beauty & Personal Care','business'],
  ['Professional Services','business'],
  ['Creative & Media','business'],
  ['Construction & Trades','property'],
  ['Transport & Logistics','industry'],
  ['Agriculture & Farming','industry'],
  ['Education & Training','institutional'],
  ['Finance & Insurance','enterprise'],
  ['Real Estate & Property','property'],
  ['Community & Faith','institutional'],
  ['Informal & MSME','business'],
  ['Energy & Environment','industry'],
  ['Mining & Extractives','industry'],
  ['Events & Entertainment','hospitality'],
  ['Government & NGO','institutional'],
  ['Automotive & Repair','industry'],
  ['Sports & Recreation','business'],
  ['Security & Safety','property'],
  ['Legal & Compliance','business'],
  ['Warehousing & Fulfilment','industry'],
  ['Cleaning & Facility','industry'],
  ['Rental & Leasing','property']
];
for (const [label, expected] of expectedLegacyProducts) {
  assert.equal(classify({ category: label }), expected, 'legacy product category '+label);
}
assert.equal(taxonomyWindow.VIORATaxonomy.categories.length, 6, 'taxonomy must expose exactly six categories');
for (const [legacyKey, expected] of Object.entries(taxonomyWindow.VIORATaxonomy.legacy)) {
  assert.equal(taxonomyWindow.VIORATaxonomy.classifyIndustry({ name:legacyKey.replace(/_/g, ' '), cat:legacyKey }), expected, 'legacy industry key '+legacyKey);
}

const handlerContext = {
  window: { VIORATaxonomy: taxonomyWindow.VIORATaxonomy },
  console,
  Date,
  setTimeout,
  clearTimeout
};
const handlerSource = read('web/main/viora-main-handlers.js').replace('export function buildVioraHandlers', 'function buildVioraHandlers');
new vm.Script(handlerSource + '\nthis.__buildVioraHandlers = buildVioraHandlers;').runInNewContext(handlerContext);
const migrationProducts = [
  { id:'legacy-retail', name:'Retail POS', category:'Retail & Wholesale Systems', price:49, stock:20, description:'Sales and inventory' },
  { id:'legacy-hotel', name:'Hotel Manager', category:'Hotel & Guest House Systems', price:99, deliveryUrl:'/downloads/hotel', image:'/hotel.png' }
];
const migrationWrites = [];
const migrationApi = handlerContext.__buildVioraHandlers({
  state: { data: { products:migrationProducts } },
  upsertDoc: async (collection, payload, revision) => migrationWrites.push({ collection, payload, revision }),
  vioraConfirm: async () => true,
  EventBus: { emit() {} },
  toast() {},
  logActivity: async () => {}
});
const migrationResult = await migrationApi.migrateMarketplaceCategories();
assert.equal(migrationResult.updated, 2, 'category migration must update both legacy products');
assert.equal(migrationResult.failed, 0, 'category migration must not fail for valid products');
assert.equal(migrationWrites[0].payload.vioraCategoryId, 'enterprise', 'retail product must migrate to enterprise');
assert.equal(migrationWrites[1].payload.vioraCategoryId, 'hospitality', 'hotel product must migrate to hospitality');
assert.equal(migrationWrites[0].payload.price, 49, 'category migration must preserve prices');
assert.equal(migrationWrites[0].payload.stock, 20, 'category migration must preserve stock');
assert.equal(migrationWrites[1].payload.deliveryUrl, '/downloads/hotel', 'category migration must preserve delivery settings');

for (const path of ['web/manifest.webmanifest','web/main.webmanifest','web/manifest.json','web/campaigns.webmanifest','web/assets/r/manifest-public.json','web/assets/r/manifest-rider.json','web/assets/r/manifest-admin.json','web/assets/mamamboga/manifest.json']) {
  const manifest = JSON.parse(read(path));
  assert.ok(manifest.icons.some(i => i.src === '/viora.png' && i.type === 'image/png'), path+' missing canonical /viora.png app icon');
  assert.equal(manifest.icons.length, 1, path+' must use only the canonical VIORA logo');
  assert.equal(manifest.icons[0].src, '/viora.png', path+' icon must be exactly /viora.png');
}

// Every embedded/constructed product PWA manifest and browser shortcut must use the canonical VIORA logo.
const pwaBrandFiles = [
  'web/assets/bops.html','web/assets/rtex.html','web/assets/boutique.html',
  'web/assets/guesthouse.html','web/assets/butchery.html','web/assets/construction.html'
];
assert.ok(fs.existsSync('web/viora.png'), 'canonical /viora.png asset is missing');
for (const path of pwaBrandFiles) {
  const source = read(path);
  const appleIcons = source.match(/<link\\b[^>]*\\brel=["']apple-touch-icon["'][^>]*>/gi) || [];
  assert.equal(appleIcons.length, 1, path+' must declare exactly one Apple touch icon');
  assert.ok(appleIcons[0].includes('href="/viora.png"'), path+' Apple touch icon must use canonical /viora.png');
  const favicons = source.match(/<link\\b[^>]*\\brel=["'](?:icon|shortcut icon)["'][^>]*>/gi) || [];
  assert.ok(favicons.length > 0 && favicons.every(tag => tag.includes('href="/viora.png"')), path+' favicons must use canonical /viora.png');
  if (path === 'web/assets/construction.html') {
    assert.match(source, /icons:\s*\[\{\s*src:\s*'\/viora\.png'/, path+' generated manifest must use /viora.png');
  } else {
    const match = source.match(/<link rel="manifest" href='data:application\/manifest\+json,([^']*)'>/);
    assert.ok(match, path+' embedded PWA manifest missing');
    const manifest = JSON.parse(match[1].replace(/%23/g, '#'));
    assert.ok(manifest.icons?.length === 1 && manifest.icons[0].src === '/viora.png', path+' embedded manifest must use only /viora.png');
  }
}
const primaryManifest = JSON.parse(read('web/manifest.json'));
for (const shortcut of primaryManifest.shortcuts || []) {
  assert.ok(shortcut.icons?.length && shortcut.icons.every(icon => icon.src === '/viora.png'), 'PWA shortcut '+shortcut.name+' must use /viora.png');
}
for (const path of ['web/assets/mamamboga/manifest.json','web/assets/r/manifest-public.json','web/assets/r/manifest-rider.json','web/assets/r/manifest-admin.json']) {
  const manifest = JSON.parse(read(path));
  assert.ok(manifest.icons.length === 1 && manifest.icons[0].src === '/viora.png', path+' must use only /viora.png');
}

assert.ok(sw.includes("n.icon  || '/viora.png'"), 'push notification icon must use canonical VIORA logo');
assert.ok(sw.includes("const badge = '/viora.png'"), 'push notification badge must use canonical VIORA logo');
const bodaSw = read('web/assets/r/sw.js');
assert.ok(bodaSw.includes("'/viora.png'"), 'BodaBiz shell must cache canonical VIORA logo');
assert.ok(!bodaSw.includes('viora-icon-192.png') && !bodaSw.includes('viora-icon-512.png') && !bodaSw.includes('viora-app-icon.svg'), 'BodaBiz shell must not cache alternate app icons');

assert.ok(main.includes('data-tab="engineering-command"'), 'main sidebar link missing');
assert.ok(main.includes('data-tab="engineering-visuals"'), 'Engineering Visuals sidebar link missing');
assert.ok(main.includes('id="tab-engineering-visuals"'), 'Engineering Visuals tab missing');
assert.ok(mainJs.includes("case 'engineering-visuals'"), 'Engineering Visuals router case missing');
assert.ok(main.includes('id="tab-engineering-command"'), 'main content tab missing');
assert.ok(main.includes('engineering-command-centre.css'), 'command centre stylesheet missing');
assert.ok(main.includes('engineering-command-centre.js'), 'command centre module missing');
assert.ok(mainJs.includes("case 'engineering-command'"), 'main router case missing');
assert.ok(mainJs.includes("'engineering-command':     'renderEngineeringCommandCentre'"), 'force router mapping missing');
assert.ok(mainJs.includes("tab: 'engineering-command'"), 'mobile executive navigation missing');
assert.ok(command.includes('exportCustomerBundle'), 'customer export helper missing');
assert.ok(command.includes('completeness'), 'customer export completeness disclosure missing');
assert.ok(command.includes('not a substitute for Cloudflare-wide telemetry'), 'monitoring scope disclosure missing');
assert.ok(main.includes('20261113-investor-room-2'), 'main page asset cache version not refreshed');
assert.ok(command.includes('window.__vioraInvestorRoomMode'), 'Engineering Command router does not support Investor Data Room');
assert.ok(investorRoom.includes('data-investor-room-link'), 'Investor Data Room sidebar link injection missing');
assert.ok(investorRoom.includes('s.operator?.role'), 'Investor Data Room does not use the main app operator role');
assert.ok(investorRoom.includes('firebase/storage'), 'Investor Data Room Firebase Storage integration missing');
assert.ok(investorRoom.includes("'viora_data/investorDataRoom'"), 'Investor Data Room must use the canonical viora_data/investorDataRoom path');
assert.ok(investorRoom.includes('navigator.share'), 'Investor Data Room native sharing support missing');
assert.ok(investorRoom.includes('Private by default'), 'Investor Data Room privacy warning missing');
assert.ok(sw.includes('/investor-data-room.js'), 'Investor Data Room module missing from app shell cache');

assert.ok(worker.includes('export class TranslationRateLimiter'), 'Durable Object class missing');
assert.ok(worker.includes('TRANSLATION_RATE_LIMITER.getByName'), 'Durable Object binding not used');
assert.ok(!worker.includes('const rate = new Map()'), 'isolate-local rate limiter remains');
assert.ok(!worker.includes('caches.default'), 'shared public translation cache remains');
assert.ok(wrangler.includes('class_name = "TranslationRateLimiter"'), 'Durable Object binding missing from wrangler');
assert.ok(wrangler.includes('new_sqlite_classes = ["TranslationRateLimiter"]'), 'Durable Object migration missing');
assert.ok(wrangler.includes('[observability.traces]') && wrangler.includes('enabled = true'), 'Worker traces not enabled');

assert.ok(chatbot.includes('createStreamingSpeechQueue(++state.currentSpeakId)'), 'progressive voice queue not wired');
assert.ok(chatbot.includes('progressiveSpeech?.push(acc)'), 'stream tokens not connected to voice queue');
assert.ok(chatbot.includes('await progressiveSpeech.finish(full)'), 'progressive voice queue not flushed');

assert.ok(dpa.includes('forty-eight (48) hours'), 'Kenya processor 48-hour notice not present');
assert.ok(staticWorker.includes('env.ASSETS.fetch(request)'), 'new static Worker does not serve repository assets');
assert.ok(staticWorker.includes('env.LEGACY.fetch(request)'), 'new static Worker does not preserve legacy fallback');
assert.ok(embeddedAssets.startsWith('export const EMBEDDED_ASSETS_GZIP_BASE64'), 'missing embedded static asset bundle');
assert.ok(staticConfig.includes('../../web'), 'static Worker is not configured to deploy the complete web directory');
assert.ok(fs.existsSync('docs/VIORA-CLOUDFLARE-DEPLOYMENT.md'), 'missing Cloudflare deployment runbook');
for (const p of [
  'docs/VIORA-ENGINEERING-DEEP-AUDIT-2026-11-12.md',
  'docs/VIORA-TESTING-AND-RECOVERY-PLAN.md',
  'docs/VIORA-BACKUP-RESTORE-RUNBOOK.md',
  'tests/unit/business-calculations.test.mjs',
  'tests/integration/firebase-emulator.test.mjs',
  'scripts/backup-firebase-rtdb.mjs',
  'scripts/restore-firebase-rtdb.mjs',
  'scripts/retain-r2-backups.mjs',
  'scripts/generate-engineering-docs.mjs',
  'scripts/review-changes.mjs',
  'docs/compliance/VIORA-DATA-PROTECTION-GOVERNANCE.md',
  'docs/compliance/VIORA-RETENTION-AND-DELETION-POLICY.md',
  'docs/compliance/VIORA-SECURITY-INCIDENT-RESPONSE.md',
  'docs/compliance/VIORA-SUBPROCESSOR-REGISTER.md',
  'docs/compliance/VIORA-SLA-DRAFT.md',
  'docs/VIORA-INVESTOR-DATA-ROOM-SECURITY.md'
]) assert.ok(fs.existsSync(p), 'missing governance document '+p);

console.log('VIORA engineering static checks passed.');
