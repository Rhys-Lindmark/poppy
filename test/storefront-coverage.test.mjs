import assert from 'node:assert/strict';
import test from 'node:test';
import { probeStore, summarizeCoverage } from '../src/storefront-coverage.mjs';

const store = { name: 'Example', host: 'example.com', aliases: ['www.example.com'], group: 'merchant' };

test('public scanner follows approved hosts and records version, channels and binding', async () => {
  const requests = [];
  const found = await probeStore(store, async (url, options) => {
    requests.push(url);
    assert.equal(options.redirect, 'manual');
    if (requests.length === 1) return Response.redirect('https://www.example.com/.well-known/poppy.json', 301);
    return Response.json({
      protocol_version: '1.0', organization: { name: 'Example', domain: 'www.example.com' },
      web: {}, auth: { disabled: true },
      extensions: { operations: [{ version: '3' }] },
    });
  });
  assert.equal(found.state, 'published');
  assert.equal(found.version, '1.0');
  assert.deepEqual(found.channels, ['web']);
  assert.deepEqual(found.extensions, ['operations']);
  assert.equal(found.signIn, 'disabled');
  assert.deepEqual(found.discovery.map(({ status }) => status), [301, 200]);
});

test('404, blocked, malformed, and unapproved redirect have distinct outcomes', async () => {
  assert.equal((await probeStore(store, async () => new Response(null, { status: 404 }))).state, 'absent');
  assert.equal((await probeStore(store, async () => new Response(null, { status: 403 }))).state, 'unreachable');
  assert.equal((await probeStore(store, async () => Response.json({
    protocol_version: '1.0', organization: { name: 'Mismatch', domain: 'other.example' }, web: {},
  }))).state, 'invalid');
  let calls = 0;
  const redirected = await probeStore(store, async () => {
    calls++;
    return Response.redirect('https://other.example/.well-known/poppy.json', 301);
  });
  assert.equal(redirected.state, 'redirect_unverified');
  assert.equal(calls, 1);
});

test('sales rollup excludes the platform proxy and retains unknown discovery evidence', () => {
  const market = { marketBillions: 100, retailers: [
    { name: 'Example', billions: 8 }, { name: 'Other', billions: 4 },
    { name: 'Shopify merchants', billions: 20 },
  ] };
  const report = summarizeCoverage([
    { name: 'Example', state: 'published' }, { name: 'Other', state: 'unreachable' },
    { name: 'Shopify merchants', state: 'published' },
  ], market);
  assert.deepEqual(report.namedMerchantSalesMeasured, { billions: 12, sharePercent: 12 });
  assert.deepEqual(report.namedMerchantSalesWithPublicDiscovery, { billions: 8, sharePercent: 8 });
  assert.deepEqual(report.namedMerchantSalesReturning404, { billions: 0, sharePercent: 0 });
  assert.equal(report.platformProxy.sharePercent, 20);
});
