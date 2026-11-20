import assert from 'node:assert/strict';
import { startSandbox } from '../src/demo.mjs';
import { browser, field, signIn } from './support/sandbox-client.mjs';

const sandbox = await startSandbox();
try {
  const client = browser(sandbox);
  const callback = await signIn(client, 'Saturday', ['orders:read', 'orders:write']);
  assert.equal(callback.status, 303);
  const review = await client.get(callback.headers.location);
  assert.match(review.text, /Friday → Saturday/);
  const approval = await client.post('/agent/approval', {
    csrf: field(review.text, 'csrf'), revision: field(review.text, 'revision'), decision: 'approve',
  });
  assert.equal(approval.status, 303);
  const result = await client.get(approval.headers.location);
  assert.match(result.text, /scheduled for <strong>Saturday/);
  const trace = await client.get('/agent/trace.json');
  assert.equal(trace.status, 200);
  console.log(JSON.stringify(trace.json(), null, 2));
} finally {
  await sandbox.close();
}
