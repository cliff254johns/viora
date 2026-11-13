import fs from 'node:fs';
import assert from 'node:assert/strict';

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

for (const path of ['web/manifest.webmanifest','web/main.webmanifest','web/manifest.json','web/campaigns.webmanifest','web/assets/r/manifest-public.json','web/assets/r/manifest-rider.json','web/assets/r/manifest-admin.json']) {
  const manifest = JSON.parse(read(path));
  assert.ok(manifest.icons.some(i => i.src === '/viora.png' && i.type === 'image/png'), path+' missing canonical /viora.png app icon');
  assert.equal(manifest.icons.length, 1, path+' must use only the canonical VIORA logo');
}

assert.ok(main.includes('data-tab="engineering-command"'), 'main sidebar link missing');
assert.ok(main.includes('data-tab="engineering-visuals"'), 'Engineering Visuals sidebar link missing');
assert.ok(main.includes('data-tab="investor-data-room" data-roles="admin,exec"'), 'Investor Data Room must be a dedicated admin/exec Engineering Command submenu');
assert.ok(main.includes('id="tab-investor-data-room"') && main.includes('id="investorDataRoomRoot"'), 'Investor Data Room must have its own tab content root');
assert.ok(main.includes('id="tab-engineering-visuals"'), 'Engineering Visuals tab missing');
assert.ok(mainJs.includes("case 'engineering-visuals'"), 'Engineering Visuals router case missing');
assert.ok(main.includes('id="tab-engineering-command"'), 'main content tab missing');
assert.ok(main.includes('engineering-command-centre.css'), 'command centre stylesheet missing');
assert.ok(main.includes('engineering-command-centre.js'), 'command centre module missing');
assert.ok(mainJs.includes("case 'engineering-command'"), 'main router case missing');
assert.ok(mainJs.includes("case 'investor-data-room'"), 'Investor Data Room dedicated route missing');
assert.ok(mainJs.includes("'investor-data-room':       'renderInvestorDataRoom'"), 'Investor Data Room force-router mapping missing');
assert.ok(mainJs.includes("'engineering-command':     'renderEngineeringCommandCentre'"), 'force router mapping missing');
assert.ok(mainJs.includes("tab: 'engineering-command'"), 'mobile executive navigation missing');
assert.ok(command.includes('exportCustomerBundle'), 'customer export helper missing');
assert.ok(command.includes('completeness'), 'customer export completeness disclosure missing');
assert.ok(command.includes('not a substitute for Cloudflare-wide telemetry'), 'monitoring scope disclosure missing');
assert.ok(main.includes('20261113-investor-room-submenu-1'), 'main page asset cache version not refreshed');
assert.ok(!command.includes('window.__vioraInvestorRoomMode'), 'Investor Data Room must not hijack the Engineering Command Centre route');
assert.ok(investorRoom.includes("getElementById('investorDataRoomRoot')"), 'Investor Data Room must render in its dedicated tab root');
assert.ok(investorRoom.includes('s.operator?.role'), 'Investor Data Room does not use the main app operator role');
assert.ok(investorRoom.includes('firebase/storage'), 'Investor Data Room Firebase Storage integration missing');
assert.ok(investorRoom.includes("'viora_data/investorDataRoom'"), 'Investor Data Room must use the canonical viora_data/investorDataRoom path');
assert.ok(investorRoom.includes('navigator.share'), 'Investor Data Room native sharing support missing');
assert.ok(investorRoom.includes('Private by default'), 'Investor Data Room privacy warning missing');
assert.ok(sw.includes('/investor-data-room.js?v=20261113-investor-room-submenu-1'), 'Investor Data Room module missing from app shell cache');
assert.ok(sw.includes('viora-v1.6.31'), 'service worker cache version not refreshed');

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
