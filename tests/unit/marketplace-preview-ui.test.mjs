import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('public Marketplace does not render legacy direct preview destinations', async () => {
  const source = await read('../../web/mainMarket/market.js');
  assert.equal(source.includes('previewUrl'), false);
  assert.equal(source.includes('demoEmbedUrl'), false);
  assert.match(source, /App\.requestPreview/);
  assert.match(source, /firebase\.auth\(\)/);
});

test('homepage product showcase does not expose legacy preview URLs', async () => {
  const source = await read('../../web/index-home.js');
  assert.equal(source.includes('previewUrl'), false);
  assert.equal(source.includes('demoUrl:'), false);
});

test('actual admin product form and preview request queue are wired', async () => {
  const html = await read('../../web/main.html');
  const wiring = await read('../../web/main/viora-main-wiring.js');
  const handlers = await read('../../web/main/viora-main-handlers.js');
  const router = await read('../../workers/viora-api/index.js');
  assert.match(html, /id="prodPreviewEnabled"/);
  assert.match(html, /id="prodPreviewProfile"/);
  assert.match(html, /id="marketplacePreviewRequestsBody"/);
  assert.match(wiring, /marketplace\/preview\/\' \+ endpoint/);
  assert.match(wiring, /action === \'grant\' \? \'grant\' : \'revoke\'/);
  assert.match(router, /handleMarketplacePreview\(request, env, user, previewRoutes\[path\], body\)/);
  assert.match(handlers, /previewEnabled/);
  assert.equal(handlers.includes('previewGatewayVerified'), false, 'the product editor must not self-certify a delivery gateway');
  assert.equal(handlers.includes('previewUrl'), false);
});

test('server refuses preview sessions unless product gateway verification is set', async () => {
  const source = await read('../../workers/viora-api/marketplace-preview.js');
  assert.match(source, /product\.previewGatewayVerified === true/);
  assert.match(source, /If-Match/);
  assert.match(source, /marketplacePreview/);
});
