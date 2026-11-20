import assert from 'node:assert/strict';
import test from 'node:test';
import { companyOrigin, handleAgentMessage } from '../src/chat-http.mjs';
import edition from '../data/commonplace-edition.json' with { type: 'json' };

const endpoint = companyOrigin + '/poppy/api/message';
function post(input) {
  return new Request(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
}

test('agent retrieves verified edition terms and answers a follow-up without approving a download', async () => {
  const seen = [];
  const fetcher = async (url, options) => {
    assert.equal(options.redirect, 'error');
    const path = new URL(url).pathname;
    seen.push(path);
    if (path === '/.well-known/poppy.json') return Response.json({
      protocol_version: '1.0', organization: { domain: new URL(companyOrigin).host },
      apis: [{ type: 'openapi', url: companyOrigin + '/poppy/openapi.json' }],
    });
    if (path === '/poppy/openapi.json') return Response.json({
      paths: { '/poppy/api/edition.json': { get: { operationId: 'getCommonplaceEdition' } } },
    });
    assert.equal(path, '/poppy/api/edition.json');
    return Response.json(edition);
  };
  const result = await handleAgentMessage(post({ message: 'Find me a reading edition' }), fetcher);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  const { kind, reply, proposal, review_url: reviewUrl } = await result.json();
  assert.equal(kind, 'edition');
  assert.match(reply, /Learning and Courage/);
  assert.deepEqual(seen, ['/.well-known/poppy.json', '/poppy/openapi.json', '/poppy/api/edition.json']);
  assert.equal(new URL(reviewUrl).searchParams.get('review'), proposal.revision);
  assert.equal(new URL(reviewUrl).origin, companyOrigin);
  const price = await handleAgentMessage(post({ message: 'How much does it cost?', revision: proposal.revision }), fetcher);
  assert.match((await price.json()).reply, /is free/);
  const approval = await handleAgentMessage(post({ message: 'I approve', revision: 'A'.repeat(43) }), fetcher);
  const approvalBody = await approval.json();
  assert.match(approvalBody.reply, /details changed.*Open the review/);
  assert.equal('backup' in approvalBody || 'backup' in approvalBody.proposal, false);
});

test('unsupported or invalid messages do not contact the Company', async () => {
  const unexpected = () => { throw new Error('Should not contact the Company'); };
  const unsupported = await handleAgentMessage(post({ message: 'Tell me about tomorrow’s weather.' }), unexpected);
  assert.equal((await unsupported.json()).kind, 'help');
  assert.equal((await handleAgentMessage(post({ message: ' ' }), unexpected)).status, 400);
  assert.equal((await handleAgentMessage(post({ message: 'x'.repeat(4000) }), unexpected)).status, 413);
  assert.equal((await handleAgentMessage(new Request(endpoint), unexpected)).status, 405);
});
