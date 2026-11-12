import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');
const main = read('web/main.html');
const mainJs = read('web/main.js');
const worker = read('web/worker.js');
const wrangler = read('web/wrangler.toml');
const command = read('web/engineering-command-centre.js');
const chatbot = read('web/mainIndex/chatbot.js');
const dpa = read('web/dpa.html');

for (const path of ['web/manifest.webmanifest','web/main.webmanifest']) {
  const manifest = JSON.parse(read(path));
  assert.ok(manifest.icons.some(i => i.src === '/viora-icon-192.svg' && i.sizes === '192x192'), path+' missing 192 icon');
  assert.ok(manifest.icons.some(i => i.src === '/viora-icon-512.svg' && i.sizes === '512x512'), path+' missing 512 icon');
}
for (const [path, expected] of [
  ['web/viora-icon-192.svg','width="192" height="192"'],
  ['web/viora-icon-512.svg','width="512" height="512"']
]) assert.ok(read(path).includes(expected), path+' dimensions mismatch');

assert.ok(main.includes('data-tab="engineering-command"'), 'main sidebar link missing');
assert.ok(main.includes('id="tab-engineering-command"'), 'main content tab missing');
assert.ok(main.includes('engineering-command-centre.css'), 'command centre stylesheet missing');
assert.ok(main.includes('engineering-command-centre.js'), 'command centre module missing');
assert.ok(mainJs.includes("case 'engineering-command'"), 'main router case missing');
assert.ok(mainJs.includes("'engineering-command':     'renderEngineeringCommandCentre'"), 'force router mapping missing');
assert.ok(mainJs.includes("tab: 'engineering-command'"), 'mobile executive navigation missing');
assert.ok(command.includes('exportCustomerBundle'), 'customer export helper missing');
assert.ok(command.includes('completeness'), 'customer export completeness disclosure missing');
assert.ok(command.includes('not a substitute for Cloudflare-wide telemetry'), 'monitoring scope disclosure missing');

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
for (const p of [
  'docs/VIORA-ENGINEERING-DEEP-AUDIT-2026-11-12.md',
  'docs/compliance/VIORA-DATA-PROTECTION-GOVERNANCE.md',
  'docs/compliance/VIORA-RETENTION-AND-DELETION-POLICY.md',
  'docs/compliance/VIORA-SECURITY-INCIDENT-RESPONSE.md',
  'docs/compliance/VIORA-SUBPROCESSOR-REGISTER.md',
  'docs/compliance/VIORA-SLA-DRAFT.md'
]) assert.ok(fs.existsSync(p), 'missing governance document '+p);

console.log('VIORA engineering static checks passed.');
