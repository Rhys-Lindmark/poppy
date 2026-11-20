import assert from 'node:assert/strict';
import test from 'node:test';
import { startSandbox } from '../src/demo.mjs';

import { browser, field, signIn } from '../scripts/support/sandbox-client.mjs';

const scopes = ['orders:read', 'orders:write'];

test('discovery, scoped sign-in, exact approval, and a verified delivery change', async (t) => {
  const demo = await startSandbox();
  t.after(() => demo.close());
  const publicDiscovery = await demo.http(demo.origin + '/.well-known/poppy.json');
  assert.equal(publicDiscovery.status, 200);
  assert.equal(publicDiscovery.json().protocol_version, '1.0');
  assert.equal(publicDiscovery.json().organization.domain, new URL(demo.origin).host);
  assert.deepEqual(publicDiscovery.json().extensions.operations, [{ version: '3' }]);
  const unsigned = await demo.http(demo.origin + '/api/delivery-options', { headers: { 'Poppy-Version': '1.0' } });
  assert.equal(unsigned.status, 400);
  assert.deepEqual(unsigned.json(), { error: 'invalid_session' });

  const client = browser(demo);
  const callback = await signIn(client, 'Saturday', scopes);
  assert.equal(callback.status, 303, callback.text);
  const review = await client.get(callback.headers.location);
  assert.match(review.text, /Friday → Saturday/);
  assert.match(review.text, /USD 0\.00/);
  assert.match(review.text, /approval_required/);
  assert.match(review.text, /Signed, delegated ES256 key/);

  const observer = browser(demo);
  const before = await signIn(observer, 'Saturday', ['orders:read'], 'read');
  assert.match(before.text, /scheduled for <strong>Friday/);
  const fields = { csrf: field(review.text, 'csrf'), revision: field(review.text, 'revision'), decision: 'approve' };
  assert.equal((await client.post('/agent/approval', { ...fields, revision: 'wrong' })).status, 400);
  assert.equal((await client.post('/agent/approval', fields, 'https://other.example')).status, 403);
  const approval = await client.post('/agent/approval', fields);
  assert.equal(approval.status, 303, approval.text);
  const result = await client.get(approval.headers.location);
  assert.equal(result.status, 200);
  assert.match(result.text, /scheduled for <strong>Saturday/);
  assert.match(result.text, /User approved the proposed revision/);
  assert.doesNotMatch(result.text, /access_token|code_verifier|client_assertion|poppy_flow/);
  const trace = await client.get('/agent/trace.json');
  assert.equal(trace.status, 200);
  assert.equal(trace.json().outcome, 'Saturday');
  assert.equal(trace.json().requests[0].path, '/.well-known/poppy.json');
  assert.equal(trace.json().requests.at(-1).details.approval, 'User approved the proposed revision');
  assert.doesNotMatch(trace.text, /flowId|access_token|code_verifier|client_assertion|poppy_flow/);
  assert.equal((await observer.get('/agent/trace.json')).status, 404);
  const replay = await client.post('/agent/approval', fields);
  assert.equal(replay.status, 303);

  const after = await signIn(browser(demo), 'Saturday', ['orders:read'], 'read');
  assert.match(after.text, /scheduled for <strong>Saturday/);
});

test('read-only consent and declining the exact change leave the order unchanged', async (t) => {
  const demo = await startSandbox();
  t.after(() => demo.close());
  const partial = await signIn(browser(demo), 'Saturday', ['orders:read']);
  assert.equal(partial.status, 403);
  assert.match(partial.text, /granted too little access/);

  const client = browser(demo);
  const callback = await signIn(client, 'Saturday', scopes);
  assert.equal(callback.status, 303, callback.text);
  const review = await client.get(callback.headers.location);
  const declined = await client.post('/agent/approval', {
    csrf: field(review.text, 'csrf'), revision: field(review.text, 'revision'), decision: 'decline',
  });
  assert.equal(declined.status, 200);
  assert.match(declined.text, /Delivery change declined/);

  const final = await signIn(browser(demo), 'Saturday', ['orders:read'], 'read');
  assert.match(final.text, /scheduled for <strong>Friday/);
});

test('Persona gates write consent and Amplitude records the approved demo funnel', async (t) => {
  const { createSponsors } = await import('../src/sponsors/index.mjs');
  const funnel = [];
  let reference;
  let approved = false;
  const remote = async (url, options) => {
    const path = new URL(url).pathname;
    const payload = options.body ? JSON.parse(options.body) : {};
    if (path === '/2/httpapi') {
      funnel.push(...payload.events);
      return Response.json({ code: 200 });
    }
    if (path === '/api/v1/inquiries') {
      reference = payload.data.attributes['reference-id'];
      return Response.json({ data: { id: 'inq_synthetic' } });
    }
    if (path.endsWith('/generate-one-time-link')) {
      return Response.json({ meta: { 'one-time-link': 'https://inquiry.withpersona.com/verify?code=fixture' } });
    }
    if (path === '/api/v1/inquiries/inq_synthetic') {
      return Response.json({ data: { id: 'inq_synthetic', attributes: {
        status: approved ? 'approved' : 'completed', 'reference-id': reference,
      } } });
    }
    throw new Error('Unexpected sponsor request');
  };
  const sponsors = createSponsors({
    AMPLITUDE_API_KEY: 'test-project',
    PERSONA_API_KEY: 'persona_sandbox_fixture', PERSONA_TEMPLATE_ID: 'itmpl_fixture',
  }, remote);
  const demo = await startSandbox({ sponsors });
  t.after(() => demo.close());
  const client = browser(demo);

  const start = await client.post('/agent/start', { day: 'Saturday' });
  const store = await client.get(start.headers.location);
  const identity = await client.post('/oauth/authorize', [
    ['ticket', field(store.text, 'ticket')], ['decision', 'allow'],
    ...scopes.map((scope) => ['scope', scope]),
  ]);
  assert.equal(identity.status, 200);
  assert.match(identity.text, /Open Persona Sandbox/);
  const ticket = field(identity.text, 'ticket');
  assert.equal((await browser(demo).post('/oauth/persona/check', { ticket })).status, 400);
  const stillWaiting = await client.post('/oauth/persona/check', { ticket });
  assert.equal(stillWaiting.status, 200);
  assert.match(stillWaiting.text, /still awaiting approval/);
  approved = true;
  const result = await client.post('/oauth/persona/check', { ticket });
  assert.equal(result.status, 303);
  assert.equal((await client.get(result.headers.location)).status, 303);

  const review = await client.get('/agent/review');
  const change = await client.post('/agent/approval', {
    csrf: field(review.text, 'csrf'), revision: field(review.text, 'revision'), decision: 'approve',
  });
  assert.equal(change.status, 303);
  assert.match((await client.get(change.headers.location)).text, /scheduled for <strong>Saturday/);
  await sponsors.flush();
  assert.deepEqual(funnel.map(({ event_type }) => event_type), [
    'Poppy Task Started', 'Poppy Store Discovered', 'Poppy Store Access Granted',
    'Poppy Delivery Change Proposed', 'Poppy Delivery Change Approved', 'Poppy Delivery Changed',
  ]);
  assert.equal(new Set(funnel.map(({ device_id }) => device_id)).size, 1);
  assert.ok(!JSON.stringify(funnel).includes(reference));
});
