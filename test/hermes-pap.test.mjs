import assert from 'node:assert/strict';
import test from 'node:test';
import { hermesIdentity, prepareGuestEdition } from '../scripts/hermes-pap.mjs';
import { decodeJwt, keyPair, verifyJwt } from '../src/protocol.mjs';
import edition from '../data/commonplace-edition.json' with { type: 'json' };

test('Hermes signs the advertised guest request with a published identity and delegated key', async () => {
  const identity = hermesIdentity(keyPair().privateKey);
  const origin = 'https://ai.rhyslindmark.com';
  const seen = [];
  const result = await prepareGuestEdition({
    identity, pairwiseKey: 'synthetic-verification-key',
    fetcher: async (url, options) => {
      assert.equal(options.redirect, 'error');
      assert.equal(new URL(url).origin, origin);
      const { pathname } = new URL(url);
      seen.push(pathname);
      if (pathname === '/.well-known/oauth-protected-resource') return new Response(null, { status: 404 });
      if (pathname === '/.well-known/poppy.json') return Response.json({
        protocol_version: '1.0', organization: { domain: new URL(url).host },
        apis: [{ type: 'openapi', url: origin + '/poppy/openapi.json' }],
      });
      if (pathname === '/poppy/openapi.json') return Response.json({
        paths: { '/poppy/api/edition.json': { get: { operationId: 'getCommonplaceEdition' } } },
      });
      assert.equal(pathname, '/poppy/api/edition.json');
      assert.equal(options.headers['Poppy-Version'], '1.0');
      assert.equal(options.headers.Authorization, undefined);
      const token = decodeJwt(options.headers['Poppy-Session']);
      const delegation = verifyJwt(decodeJwt(token.header.poppy_dlg), identity.jwks.keys[0], 'poppy-delegation+jwt', ['ES256']);
      const claims = verifyJwt(token, delegation.cnf.jwk, 'poppy-session+jwt', ['ES256']);
      assert.equal(delegation.iss, identity.metadata.client_id);
      assert.equal(claims.iss, identity.metadata.client_id);
      assert.equal(claims.aud, origin);
      assert.equal(claims.htm, 'GET');
      assert.equal(claims.htu, url);
      assert.match(claims.sid, /^[\w-]+$/);
      assert.match(claims.sub, /^[\w-]+$/);
      return Response.json(edition);
    },
  });
  assert.equal(result.signed_requests[0].status, 200);
  assert.equal(new URL(result.approval_url).searchParams.get('review'), result.revision);
  assert.equal(result.edition.title, 'Learning and Courage');
  assert.equal(seen.length, 4);
});
