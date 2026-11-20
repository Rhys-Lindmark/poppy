import assert from 'node:assert/strict';
import test from 'node:test';
import { createHermesHandler } from '../src/hermes-http.mjs';

test('Hermes bridge requires a key, scopes task access, and deduplicates repeated submissions', async () => {
  const token = 'a'.repeat(48);
  const activeRun = 'run_poppy';
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const calls = [];
  const handle = createHermesHandler({ accessToken: token, hermesToken: 'b'.repeat(48),
    publicPage: 'https://poppy.example/', fetcher: (url, options) => {
      calls.push([url.pathname, options.method]);
      if (url.pathname === '/v1/runs') {
        assert.deepEqual(JSON.parse(options.body), { input: 'hello', session_id: 'poppy-personal-v1' });
        return Response.json({ run_id: activeRun });
      }
      if (url.pathname.endsWith('/stop')) return Response.json({ ok: true });
      return Response.json({ status: 'completed', output: 'hello back',
        session_id: url.pathname.endsWith(activeRun) ? 'poppy-personal-v1' : 'elsewhere' });
    } });
  function request(path, options) {
    return handle(new Request('https://poppy.example/message' + path, options));
  }
  function post(message) {
    return request('', { headers, method: 'POST', body: JSON.stringify({ message, request_id: 'retry-same-request' }) });
  }
  assert.equal((await request('?run=' + activeRun)).status, 401);
  assert.deepEqual(calls, []);
  const starts = await Promise.all([post('hello'), post('hello')]);
  assert.deepEqual(starts.map((response) => response.status), [202, 202]);
  assert.deepEqual(calls, [['/v1/runs', 'POST']]);
  assert.equal((await starts[0].json()).run_url, 'https://poppy.example/?run=run_poppy');
  assert.equal((await post('new message')).status, 409);
  assert.equal((await (await request('?run=' + activeRun, { headers })).json()).reply, 'hello back');
  assert.equal((await request('?run=run_other', { headers })).status, 404);
  assert.equal((await request('?run=run_other', { headers, method: 'DELETE' })).status, 404);
  assert.equal((await request('?run=' + activeRun, { headers, method: 'DELETE' })).status, 202);
  assert.deepEqual(calls.filter(([path]) => path.endsWith('/stop')), [['/v1/runs/run_poppy/stop', 'POST']]);
});
