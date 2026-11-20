const runPattern = /^run_[A-Za-z0-9_-]{3,100}$/;
const keyPattern = /^[A-Za-z0-9_-]{32,128}$/;
const session = 'poppy-personal-v1';
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'unknown']);
const active = new Set(['started', 'queued', 'running', 'awaiting_approval', 'stopping']);
const encoder = new TextEncoder();
const comparison = encoder.encode('Poppy bearer access');

function response(payload, status = 200, headers = {}) {
  return Response.json(payload, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers,
  } });
}

async function matchesToken(request, expected) {
  const supplied = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/i)?.[1];
  if (!supplied || !keyPattern.test(expected)) return false;
  const importKey = (token) => crypto.subtle.importKey(
    'raw', encoder.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );
  const [left, right] = await Promise.all([importKey(expected), importKey(supplied)]);
  return crypto.subtle.verify('HMAC', right, await crypto.subtle.sign('HMAC', left, comparison), comparison);
}

async function boundedJson(body, limit) {
  if (!body) throw new Error('Body required');
  const reader = body.getReader();
  const buffer = new Uint8Array(limit);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)));
      if (length + value.byteLength > limit) {
        await reader.cancel().catch(() => {});
        throw new Error('Body too large');
      }
      buffer.set(value, length);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

export function createHermesHandler({ accessToken, hermesToken, origin = 'http://127.0.0.1:8642',
  publicPage = 'https://ai.rhyslindmark.com/poppy/agent', fetcher = fetch }) {
  if (!keyPattern.test(accessToken || '') || typeof hermesToken !== 'string' || hermesToken.length < 24) {
    throw new Error('Poppy and Hermes access tokens are required.');
  }
  const admissions = new Map();
  async function call(path, options = {}) {
    const result = await fetcher(new URL(path, origin), {
      ...options, redirect: 'error', signal: AbortSignal.timeout(8000), headers: {
        Authorization: 'Bearer ' + hermesToken, Accept: 'application/json', ...options.headers,
      },
    });
    if (!result.ok) {
      await result.body?.cancel().catch(() => {});
      return { error: result.status };
    }
    return { body: await boundedJson(result.body, 262144) };
  }

  function receipt(run, status, reply) {
    const reviewUrl = new URL(publicPage);
    reviewUrl.searchParams.set('run', run);
    return { run_id: run, status, reply, run_url: reviewUrl.href, done: terminal.has(status) };
  }

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return response({ status: 'ok' });
    if (url.pathname !== '/message') return response({ reply: 'Not found.' }, 404);
    if (!(await matchesToken(request, accessToken))) {
      return response({ reply: 'Enter your Poppy access key.' }, 401, { 'WWW-Authenticate': 'Bearer' });
    }
    if (!['POST', 'GET', 'DELETE'].includes(request.method)) {
      return response({ reply: 'Method is unavailable.' }, 405, { Allow: 'POST, GET, DELETE' });
    }
    const run = url.searchParams.get('run');
    if (request.method === 'GET' && !run) return response({ ready: true });
    if (request.method !== 'POST' && !runPattern.test(run || '')) {
      return response({ reply: 'Invalid task link.' }, 400);
    }
    try {
      if (request.method === 'POST') {
        if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
          return response({ reply: 'Send the message as JSON.' }, 415);
        }
        const payload = await boundedJson(request.body, 24576).catch(() => null);
        const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
        const id = payload?.request_id ?? crypto.randomUUID();
        if (!message || message.length > 6000 || typeof id !== 'string' || !/^[\w-]{16,80}$/.test(id)) {
          return response({ reply: 'Enter a message of 1 to 6,000 characters.' }, 400);
        }
        const fingerprint = crypto.subtle.digest('SHA-256', encoder.encode(message));
        const signature = new Uint8Array(await fingerprint).join(',');
        const timestamp = Date.now();
        for (const [key, record] of admissions) {
          if (record.expires <= timestamp) admissions.delete(key);
        }
        let record = admissions.get(id);
        if (record && record.signature !== signature) {
          return response({ reply: 'This request ID is already tied to another message.' }, 409);
        }
        if (!record) {
          if (admissions.size >= 256) return response({ reply: 'Too many recent tasks. Try again in a moment.' }, 429);
          record = { signature, expires: timestamp + 600000, result: call('/v1/runs', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: message, session_id: session }),
          }) };
          admissions.set(id, record);
        }
        const admitted = await record.result;
        const runId = admitted.body?.run_id;
        if (!runPattern.test(runId || '')) {
          return response({ reply: 'Hermes could not start this task.' }, admitted.error === 409 ? 409 : 502);
        }
        return response(receipt(runId, 'started', 'I started your task. You can open its progress in Poppy.'), 202);
      }

      const path = '/v1/runs/' + run;
      const result = await call(path);
      if (result.error === 404 || (result.body && result.body.session_id !== session)) {
        return response({ reply: 'This task is no longer available.' }, 404);
      }
      if (!result.body) return response({ reply: 'Hermes could not report task progress.' }, 502);
      if (request.method === 'DELETE') {
        const stopped = await call(path + '/stop', { method: 'POST' });
        return stopped.error ? response({ reply: 'Hermes could not stop this task.' }, 502)
          : response(receipt(run, 'stopping', 'I asked Hermes to stop this task.'), 202);
      }
      const status = result.body.status === 'waiting_for_approval' ? 'awaiting_approval' : result.body.status;
      if (!terminal.has(status) && !active.has(status)) return response({ reply: 'Hermes could not report task progress.' }, 502);
      const messages = {
        failed: 'Hermes could not finish this task.',
        cancelled: 'This task was stopped.',
        interrupted: 'The Hermes service interrupted this task.',
        unknown: 'Hermes could not recover the task after a restart.',
        awaiting_approval: 'Hermes is waiting for a tool approval. You can stop the task from this page.',
      };
      const output = status === 'completed' && typeof result.body.output === 'string'
        ? result.body.output.trim().slice(0, 24000) : '';
      return response(receipt(run, status, output || messages[status] || (status === 'completed' ? 'Task completed.' : 'Hermes is working on it.')));
    } catch {
      return response({ reply: 'I couldn’t reach Hermes. Try again in a moment.' }, 502);
    }
  };
}
