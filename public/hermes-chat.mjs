const connect = document.querySelector('#connect');
const conversation = document.querySelector('#live-layout');
const status = document.querySelector('#status');
const keyField = document.querySelector('#key');
const messageField = document.querySelector('#message');
const submit = document.querySelector('#submit');
const stop = document.querySelector('#stop');
const messages = document.querySelector('#messages');
const traceEvents = document.querySelector('#trace-events');
const papEvidence = document.querySelector('#pap-evidence');
const traceStatus = document.querySelector('#trace-status');
const papStatus = document.querySelector('#pap-status');
const example = document.querySelector('#example');
let key = '';
let running;
let timer;
let generation = 0;
let busy = false;
let pending;
let traceKey;
let displayedRun;

function item(target, title, data) {
  const li = document.createElement('li');
  const disclosure = document.createElement('details');
  const label = document.createElement('summary');
  const code = document.createElement('pre');
  label.textContent = title;
  code.textContent = JSON.stringify(data, null, 2);
  disclosure.append(label, code);
  li.append(disclosure);
  target.append(li);
}

function showTrace(trace, state, reply) {
  const key = JSON.stringify([trace, state, reply?.length]);
  if (key === traceKey) return;
  traceKey = key;
  const opened = new Set([...traceEvents.querySelectorAll('details[open]'), ...papEvidence.querySelectorAll('details[open]')]
    .map((detail) => detail.firstChild.textContent));
  traceEvents.replaceChildren();
  papEvidence.replaceChildren();
  traceStatus.textContent = state === 'idle' ? 'Send a message to see how Hermes handles it.'
    : trace?.stream === 'unavailable' ? 'Run status is available. Tool event capture is unavailable for this run.'
      : 'Hermes status · ' + state.replaceAll('_', ' ');
  if (trace?.browser) item(traceEvents, 'You → Poppy · POST /message', trace.browser);
  if (trace?.request) item(traceEvents, 'Poppy → Hermes · POST /v1/runs', trace.request);
  for (const event of trace?.tools ?? []) {
    const name = event.tool === 'mcp__poppy_pap__prepare_commonplace_edition' ? 'Prepare Commonplace edition' : event.tool;
    const label = event.type === 'tool.started' ? 'Called' : event.type === 'tool.approval' ? 'Approval requested' : event.ok ? 'Returned' : 'Failed';
    item(traceEvents, name ? `${label} · ${name}` : label, event);
  }
  if (reply !== undefined) item(traceEvents, 'Poppy → You · Chat reply', { format: 'Plain text', characters: reply.length, status: state });
  const proofs = trace?.pap ?? [];
  papStatus.textContent = proofs.length ? 'Hermes sent a delegated, signed PAP 1.0 guest request. The Commonplace endpoint returned HTTP 200.'
    : reply !== undefined ? 'No signed PAP request was verified for this run.' : 'PAP evidence appears when Hermes calls the Commonplace tool.';
  for (const proof of proofs) {
    for (const request of proof.requests ?? []) item(papEvidence, `${request.method} ${request.path} · HTTP ${request.status}`, request);
    item(papEvidence, 'Signed guest Session', { 'Poppy-Version': proof.version, 'Poppy-Session': 'Signed · redacted',
      client_id: proof.client_id, audience: proof.company, method: proof.method, path: proof.path, http_status: proof.http_status });
  }
  for (const detail of [...traceEvents.querySelectorAll('details'), ...papEvidence.querySelectorAll('details')]) {
    detail.open = opened.has(detail.firstChild.textContent);
  }
}

function showMessage(speaker, text) {
  const item = document.createElement('li');
  const label = document.createElement('strong');
  const content = document.createElement('p');
  label.textContent = speaker;
  content.textContent = text;
  item.append(label, content);
  messages.append(item);
}

async function call({ method = 'GET', run, body } = {}) {
  const url = new URL('/message', location.origin);
  if (run) {
    url.searchParams.set('run', run);
    if (method === 'GET') url.searchParams.set('trace', '1');
  }
  const res = await fetch(url, {
    method, redirect: 'error', signal: AbortSignal.timeout(12000),
    headers: { Authorization: 'Bearer ' + key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.reply);
  return payload;
}

function setRun(run) {
  running = run;
  submit.disabled = Boolean(run);
  example.disabled = Boolean(run);
  stop.hidden = !run;
}

async function track(run, currentGeneration = generation, browserRequest) {
  displayedRun = run;
  setRun(run);
  try {
    const payload = await call({ run });
    if (currentGeneration !== generation || run !== running) return;
    showTrace({ ...payload.trace, browser: browserRequest }, payload.status, payload.done ? payload.reply : undefined);
    if (payload.done) {
      showMessage('Poppy', payload.reply);
      status.textContent = '';
      setRun();
      if (payload.trace?.stream === 'connected' || payload.trace?.stream === 'connecting' ||
          (!payload.trace?.pap?.length && payload.trace?.tools?.some((event) => event.ok && event.tool === 'mcp__poppy_pap__prepare_commonplace_edition'))) {
        timer = setTimeout(async () => {
          try {
            const last = await call({ run });
            if (currentGeneration === generation && displayedRun === run && !running && !busy) {
              showTrace({ ...last.trace, browser: browserRequest }, last.status, last.reply);
            }
          } catch { /* Preserve the on-screen trace if the last poll fails. */ }
        }, 1400);
      }
      return;
    }
    status.textContent = payload.reply;
    timer = setTimeout(() => track(run, currentGeneration, browserRequest), payload.status === 'awaiting_approval' ? 4000 : 1250);
  } catch (error) {
    if (currentGeneration !== generation || run !== running) return;
    setRun();
    status.textContent = error.message + ' Refresh to check the task again.';
  }
}

connect.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = connect.querySelector('button');
  button.disabled = true;
  key = keyField.value.trim();
  try {
    await call();
    keyField.value = '';
    connect.hidden = true;
    conversation.hidden = false;
    status.textContent = '';
    const run = new URL(location.href).searchParams.get('run');
    if (run) track(run);
    messageField.focus();
  } catch (error) {
    key = '';
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#send').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = messageField.value.trim();
  if (!message || busy || running) return;
  const currentGeneration = generation;
  busy = true;
  clearTimeout(timer);
  if (pending?.message !== message) pending = { message, request_id: crypto.randomUUID() };
  submit.disabled = true;
  example.disabled = true;
  status.textContent = 'Sending to Hermes…';
  const browserRequest = { message: 'string', characters: message.length, request_id: 'UUID', authorization: 'Bearer · redacted' };
  showTrace({ browser: browserRequest }, 'submitting');
  try {
    const payload = await call({ method: 'POST', body: pending });
    if (currentGeneration !== generation) return;
    showMessage('You', message);
    pending = undefined;
    if (messageField.value.trim() === message) messageField.value = '';
    const view = new URL(location.href);
    view.searchParams.set('run', payload.run_id);
    history.replaceState(null, '', view);
    track(payload.run_id, currentGeneration, browserRequest);
  } catch (error) {
    if (currentGeneration === generation) status.textContent = error.message;
  } finally {
    if (currentGeneration === generation) {
      busy = false;
      submit.disabled = Boolean(running);
      example.disabled = Boolean(running);
    }
  }
});

example.addEventListener('click', () => {
  messageField.value = 'Use your Poppy PAP tool to find a Commonplace reading edition. Give me the title and review link.';
  messageField.form.requestSubmit();
});

stop.addEventListener('click', async () => {
  const currentGeneration = generation;
  try {
    const payload = await call({ method: 'DELETE', run: running });
    if (currentGeneration === generation) status.textContent = payload.reply;
  } catch (error) {
    if (currentGeneration === generation) status.textContent = error.message;
  }
});

document.querySelector('#disconnect').addEventListener('click', () => {
  generation += 1;
  clearTimeout(timer);
  setRun();
  busy = false;
  pending = undefined;
  key = '';
  messageField.value = '';
  messages.replaceChildren();
  displayedRun = undefined;
  showTrace(null, 'idle');
  status.textContent = '';
  conversation.hidden = true;
  connect.hidden = false;
  keyField.focus();
});
