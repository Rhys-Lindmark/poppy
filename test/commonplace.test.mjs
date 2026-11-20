import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareEdition } from '../src/commonplace.mjs';

const origin = 'https://store.example';

function company(overrides = {}) {
  return async (url) => {
    const location = new URL(url);
    assert.equal(location.origin, origin);
    if (location.pathname === '/.well-known/poppy.json') return Response.json({
      protocol_version: '1.0', organization: { domain: location.host, name: 'Commonplace' },
      apis: [{ type: 'openapi', url: overrides.description ?? origin + '/openapi.json' }],
    });
    if (location.pathname === '/openapi.json') return Response.json({
      paths: { '/edition.json': { get: { operationId: 'getCommonplaceEdition' } } },
    });
    assert.equal(location.pathname, '/edition.json');
    return Response.json({
      id: 'book', title: overrides.title ?? 'Learning and Courage', storefront: origin + '/commonplace/',
      store: 'Commonplace', format: '5x8', price: '0.00', currency: 'USD',
      quotes: [{ id: 'press-1', author: 'Emerson', source: 'Self-Reliance' }],
    });
  };
}

test('agent requests a reviewed revision before producing a Commonplace backup', async () => {
  const proposal = await prepareEdition({ origin, fetcher: company() });
  assert.equal(proposal.status, 'approval_required');
  assert.equal(proposal.backup, undefined);
  assert.equal(proposal.requests.length, 3);
  const approved = await prepareEdition({ approve: proposal.revision, origin, fetcher: company() });
  assert.equal(approved.status, 'approved');
  assert.deepEqual(approved.backup.state.selected, ['press-1']);
  const changed = await prepareEdition({ approve: proposal.revision, origin, fetcher: company({ title: 'Different title' }) });
  assert.equal(changed.status, 'terms_changed');
  assert.equal(changed.backup, undefined);
});

test('agent declines a Company directing catalog requests to a different origin', async () => {
  await assert.rejects(
    prepareEdition({ origin, fetcher: company({ description: 'https://different.example/openapi.json' }) }),
    /outside the configured Company/,
  );
});
