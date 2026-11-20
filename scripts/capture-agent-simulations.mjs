import assert from 'node:assert/strict';
import { startSandbox } from '../src/demo.mjs';
import { browser, field, signIn } from './support/sandbox-client.mjs';

const scenarios = [
  { id: 'read', title: 'Read a delivery', prompt: 'Tell me which day my order will arrive.',
    scopes: ['orders:read'], reply: 'Your order is scheduled for Friday.' },
  { id: 'approve', title: 'Approve a delivery change', prompt: 'Move my Friday delivery to Saturday.',
    scopes: ['orders:read', 'orders:write'], reply: 'Your delivery is now scheduled for Saturday.' },
  { id: 'decline', title: 'Decline a delivery change', prompt: 'Check if my Friday delivery can move to Saturday.',
    scopes: ['orders:read', 'orders:write'], reply: 'The change was declined. Your delivery is still scheduled for Friday.' },
];

function step({ actor, method, path, status, details }, scenario) {
  const headers = {};
  if (details.version) headers['Poppy-Version'] = details.version;
  if (details.session) headers['Poppy-Session'] = 'Delegated ES256 signature [redacted]';
  if (details.extension) headers['Poppy-Extensions'] = details.extension;
  if (details.account) headers.Authorization = 'Bearer [redacted]';
  if (details.approval) headers['Poppy-Approval'] = 'The approved operation and revision [redacted]';
  let body;
  if (path === '/api/delivery' && method === 'POST') body = { delivery_day: 'Saturday' };
  if (path === '/agent/approval') body = { decision: scenario.id, revision: '[redacted]' };
  if (path === '/oauth/authorize' && method === 'POST') body = { decision: 'allow', scope: scenario.scopes, ticket: '[redacted]' };
  if (path === '/oauth/token') body = { grant_type: 'authorization_code', code: '[redacted]', code_verifier: '[redacted]' };
  const response = { status, ...details };
  if (path === '/oauth/token' && status === 200) response.scopes = scenario.scopes;
  const query = path === '/agent/oauth/callback' ? { code: '[redacted]', state: '[redacted]' } : null;
  return { actor, title: `${method} ${path} · HTTP ${status}`,
    request: { method, path, headers, ...(query && { query }), ...(body && { body }) }, response };
}

const traces = [];
for (const scenario of scenarios) {
  const observed = [];
  const sandbox = await startSandbox({ observeTrace: (entry) => observed.push(entry) });
  try {
    const client = browser(sandbox);
    const readOnly = scenario.id === 'read';
    const callback = await signIn(client, 'Saturday', scenario.scopes, readOnly ? 'read' : 'reschedule');
    if (readOnly) {
      assert.equal(callback.status, 200);
      assert.match(callback.text, /scheduled for <strong>Friday/);
    } else {
      assert.equal(callback.status, 303);
      const review = await client.get(callback.headers.location);
      assert.match(review.text, /Friday → Saturday/);
      const decision = await client.post('/agent/approval', {
        csrf: field(review.text, 'csrf'), revision: field(review.text, 'revision'), decision: scenario.id,
      });
      assert.equal(decision.status, scenario.id === 'approve' ? 303 : 200);
      if (scenario.id === 'approve') assert.match((await client.get(decision.headers.location)).text, /scheduled for <strong>Saturday/);
      else {
        assert.match(decision.text, /Delivery change declined/);
        const after = await signIn(browser(sandbox), 'Saturday', ['orders:read'], 'read');
        assert.match(after.text, /scheduled for <strong>Friday/);
      }
    }
    const flow = observed[0].flowId;
    const requests = observed.filter((entry) => entry.flowId === flow).map((entry) => step(entry, scenario));
    assert.ok(requests.every(({ response }) => Number.isInteger(response.status)));
    traces.push({ id: scenario.id, title: scenario.title, prompt: scenario.prompt, reply: scenario.reply, steps: [
      { actor: 'Training agent → Poppy', title: 'Send scripted task', request: { input: scenario.prompt },
        response: { task: readOnly ? 'read' : 'reschedule', ...(readOnly ? {} : { delivery_day: 'Saturday' }) } },
      ...requests,
      { actor: 'Poppy → Simulated user', title: 'Format the reply', response: { format: 'Plain text', reply: scenario.reply } },
    ] });
  } finally {
    await sandbox.close();
  }
}
console.log(JSON.stringify({ version: '1.0', source: 'Seeded HTTPS sandbox', scenarios: traces }, null, 2));
