import assert from 'node:assert/strict';
import test from 'node:test';
import { createPoppyClient } from '../src/poppy-client.mjs';
import { isPublicAddress, publicUrl } from '../src/poppy-https.mjs';
import { decodeJwt, keyPair, verifyJwt } from '../src/protocol.mjs';

const root = keyPair();
const identity = { key: root, metadata: { client_id: 'https://agent.example/agent.json' } };
const response = (data, status = 200, headers = {}) => ({ status, headers, text: JSON.stringify(data) });

test('discovers an independent Company, validates its issuer, and signs its advertised read only', async () => {
  const company = 'https://shop.example';
  const issuer = 'https://accounts.example/tenants/shop';
  const api = 'https://developers.example/openapi.json';
  const method = 'https://api.shop.example/catalog/items/shell?region=US';
  const operations = [];
  let signer;
  const transport = async (url, { headers }) => {
    if (url === 'https://www.shop.example/.well-known/poppy.json') {
      assert.deepEqual(headers, {});
      return response(null, 302, { location: company + '/.well-known/poppy.json' });
    }
    if (url === company + '/.well-known/poppy.json') return response({
      organization: { domain: 'shop.example' }, protocol_version: '2.0',
      supported_versions: { '1.0': company + '/poppy/v1.json' },
    });
    if (url === company + '/poppy/v1.json') return response({
      organization: { domain: 'shop.example' }, protocol_version: '1.0', auth: { issuer },
      apis: [{ type: 'openapi', url: api }],
    });
    if (url === company + '/.well-known/oauth-protected-resource') return response({
      resource: company, authorization_servers: [issuer],
    });
    if (url === 'https://accounts.example/.well-known/oauth-authorization-server/tenants/shop') return response({
      issuer, protected_resources: [company],
    });
    if (url === api) return response({
      openapi: '3.1.0', servers: [{ url: 'https://api.shop.example/catalog' }],
      components: { parameters: { version: { in: 'header', name: 'Poppy-Version', required: true } } },
      paths: { '/items/{sku}': {
        get: { operationId: 'inventory', parameters: [
          { $ref: '#/components/parameters/version' }, { in: 'path', name: 'sku', required: true },
          { in: 'query', name: 'region' },
        ] },
        post: { operationId: 'placeOrder' },
      } },
    });
    assert.equal(url, method);
    assert.equal(headers['Poppy-Version'], '1.0');
    assert.equal(headers.Authorization, undefined);
    signer = headers['Poppy-Session'];
    const token = decodeJwt(signer);
    const delegation = verifyJwt(decodeJwt(token.header.poppy_dlg), root.jwk, 'poppy-delegation+jwt', ['ES256']);
    const claims = verifyJwt(token, delegation.cnf.jwk, 'poppy-session+jwt', ['ES256']);
    assert.equal(claims.aud, issuer);
    assert.equal(claims.iss, identity.metadata.client_id);
    assert.equal(claims.htm, 'GET');
    assert.equal(claims.htu, method.split('?')[0]);
    assert.ok(claims.sub && claims.sid && claims.jti);
    operations.push(claims);
    return operations.length === 1 ? response({ error: 'session_ended' }, 400) :
      response({ available: true, echoed: signer });
  };
  const agent = createPoppyClient({ identity, pairwiseKey: 'fixture', transport });
  const discovered = await agent.discover('https://www.shop.example');
  assert.equal(discovered.company.identifier, issuer);
  assert.deepEqual(discovered.operations.map(({ id }) => id), ['inventory']);
  await assert.rejects(agent.read(company, { id: 'placeOrder' }), /advertised read operation/);
  await assert.rejects(agent.read(company, { id: 'inventory', path: { sku: '..' } }), /Invalid OpenAPI path/);
  const read = await agent.read(company, { id: 'inventory', path: { sku: 'shell' }, query: { region: 'US' } });
  assert.equal(read.status, 200);
  assert.deepEqual(read.data, { available: true, echoed: '[omitted]' });
  assert.equal(read.trace.at(-1).path, '/items/{sku}');
  assert.equal(operations.length, 2);
  assert.equal(operations[0].sub, operations[1].sub);
  assert.notEqual(operations[0].sid, operations[1].sid);
  assert.notEqual(operations[0].jti, operations[1].jti);
});

test('does not establish a Session for invalid discovery or a failed issuer check', async () => {
  const origin = 'https://store.example';
  let wrongRedirect = true;
  const transport = async (url, { headers }) => {
    assert.deepEqual(headers, {});
    if (url === origin + '/.well-known/poppy.json' && wrongRedirect) return response({}, 301, { location: '/uploads/poppy.json' });
    if (url === origin + '/.well-known/oauth-protected-resource') return response({ error: 'offline' }, 503);
    return response({ organization: { domain: 'store.example' }, protocol_version: '1.0' });
  };
  const client = createPoppyClient({ identity, pairwiseKey: 'fixture', transport });
  await assert.rejects(client.discover(origin), /well-known URL/);
  wrongRedirect = false;
  await assert.rejects(client.discover(origin), /HTTP 503/);
});

test('permits public DNS names and addresses only', () => {
  for (const value of ['http://store.example', 'https://127.0.0.1', 'https://[::1]', 'https://store.example:8080', 'https://me@store.example']) {
    assert.throws(() => publicUrl(value), /public HTTPS domain/);
  }
  for (const [address, family] of [['172.17.0.1', 4], ['169.254.169.254', 4], ['100.64.1.2', 4],
    ['::ffff:127.0.0.1', 6], ['fd00::1', 6], ['fe80::1', 6]]) {
    assert.equal(isPublicAddress({ address, family }), false);
  }
  assert.equal(isPublicAddress({ address: '1.1.1.1', family: 4 }), true);
  assert.equal(isPublicAddress({ address: '2606:4700:4700::1111', family: 6 }), true);
});
