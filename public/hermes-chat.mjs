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
const telegramMode = new URL(location.href).searchParams.get('view') === 'telegram';
const telegram = document.querySelector('#telegram-trace');
const telegramStatus = document.querySelector('#telegram-status');
const telegramTurns = document.querySelector('#telegram-turns');
const telegramSelect = document.querySelector('#telegram-turn');
const telegramWorkspace = document.querySelector('#telegram-workspace');
const telegramTicks = document.querySelector('#telegram-ticks');
const telegramOverview = document.querySelector('#telegram-overview');
const spanName = document.querySelector('#telegram-span-name');
const spanDetails = document.querySelector('#telegram-span-details');
if (telegramMode) {
  document.body.classList.add('telegram-view');
  document.querySelector('h1').textContent = 'RhysBot trace explorer';
  document.title = 'RhysBot trace explorer';
  document.querySelector('a[href="/?view=telegram"]').setAttribute('aria-current', 'page');
  document.querySelector('#telegram-sign-in-help').hidden = false;
  connect.querySelector('button').textContent = 'Sign in to the trace';
}
let key = '';
let running;
let timer;
let generation = 0;
let busy = false;
let pending;
let traceKey;
let displayedRun;
let telegramKey;
let telegramHistory = [];
let selectedSpan;

const clock = (timestamp) => new Date(timestamp * 1000).toLocaleTimeString([], {
  hour: 'numeric', minute: '2-digit', second: '2-digit',
});

function duration(seconds) {
  if (!Number.isFinite(seconds)) return 'Event';
  return seconds < 1 ? Math.round(seconds * 1000) + ' ms' : seconds.toFixed(2) + ' s';
}

function inspectSpan(span, origin) {
  selectedSpan = span.id;
  spanName.textContent = span.title;
  spanDetails.replaceChildren();
  const fields = {
    Status: span.state, Source: span.source,
    'Start offset': Number.isFinite(span.start) ? duration(Math.max(0, span.start - origin)) : 'Unrecorded',
    Duration: span.end > span.start ? duration(span.end - span.start) : 'Unrecorded',
    ...span.fields,
  };
  for (const [label, value] of Object.entries(fields)) {
    const term = document.createElement('dt');
    const valueEl = document.createElement('dd');
    term.textContent = label;
    valueEl.textContent = value;
    spanDetails.append(term, valueEl);
  }
  for (const row of telegramTurns.querySelectorAll('button')) row.setAttribute('aria-pressed', String(row.dataset.span === span.id));
}

function drawTiming(rail, span, origin, scale) {
  if (!Number.isFinite(span.start)) return;
  const marker = document.createElement('span');
  const interval = span.end > span.start;
  marker.className = 'telegram-bar ' + span.kind + (interval ? '' : ' event');
  marker.style.left = `${Math.min(100, Math.max(0, (span.start - origin) / scale * 100))}%`;
  if (interval) marker.style.width = `${(span.end - span.start) / scale * 100}%`;
  rail.append(marker);
}

function paintTelegram() {
  const turn = telegramHistory.find(({ id }) => String(id) === telegramSelect.value) ?? telegramHistory[0];
  telegramWorkspace.hidden = !turn;
  if (!turn) return;
  const turnPrefix = String(turn.id) + ':';
  const spans = [{ id: turnPrefix + 'turn', title: 'Telegram → Hermes', depth: 0, kind: 'turn', start: turn.timestamp,
    end: turn.reply?.timestamp, state: turn.reply ? 'Reply recorded' : 'Turn observed', source: 'Hermes session history',
    fields: { 'Input format': 'Text', 'Input characters': turn.characters ?? 0, 'Tool calls': turn.tools.length } }];
  for (const [index, tool] of turn.tools.entries()) {
    const name = tool.name === 'mcp__poppy_pap__prepare_commonplace_edition' ? 'prepare_commonplace_edition' : tool.name;
    const prefix = turnPrefix + index;
    spans.push({ id: prefix, title: name, kind: tool.pap ? 'pap' : 'tool', depth: 1,
      start: tool.timestamp, end: tool.ended_at, state: tool.state, source: 'Hermes tool history',
      fields: tool.pap ? { Protocol: 'PAP 1.0', Company: tool.pap.company, Identity: tool.pap.client_id,
        Session: 'Delegated ES256 · signed guest request', 'Catalog response': 'HTTP 200' } : {} });
    if (!tool.pap) continue;
    for (const [j, req] of (tool.pap.requests ?? [tool.pap]).entries()) {
      const status = req.status ?? req.http_status;
      const signed = req.path === tool.pap.path;
      spans.push({ id: prefix + ':' + j, title: `${req.method} ${req.path}`, depth: 2, kind: 'pap',
        start: req.started_at, end: req.ended_at, state: `HTTP ${status}`, source: 'Commonplace tool receipt',
        fields: { Company: tool.pap.company, Protocol: 'PAP 1.0', ...(signed && { Session: 'Delegated ES256 · signed guest' }) } });
    }
  }
  if (turn.reply) spans.push({ id: turnPrefix + 'reply', title: 'Hermes → Telegram', kind: 'turn', depth: 1,
    start: turn.reply.timestamp, state: 'Reply recorded', source: 'Hermes session history',
    fields: { 'Reply format': 'Text', Characters: turn.reply.characters } });

  const origin = turn.timestamp;
  const spanScale = Math.max(0.2, ...spans.flatMap((span) => [span.start, span.end]).filter(Number.isFinite).map((t) => t - origin));
  telegramOverview.replaceChildren();
  for (const [depth, title] of ['Turn', 'Tools', 'PAP'].entries()) {
    const lane = document.createElement('div');
    const label = document.createElement('span');
    const rail = document.createElement('span');
    lane.className = 'telegram-lane';
    label.textContent = title;
    rail.className = 'telegram-span-rail';
    for (const span of spans) if (span.depth === depth) drawTiming(rail, span, origin, spanScale);
    lane.append(label, rail);
    telegramOverview.append(lane);
  }
  telegramTicks.replaceChildren();
  for (let mark = 0; mark <= 4; mark++) {
    const tick = document.createElement('span');
    tick.textContent = mark ? duration(mark * spanScale / 4) : '0';
    telegramTicks.append(tick);
  }
  telegramTurns.replaceChildren();
  for (const span of spans) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const label = document.createElement('span');
    const rail = document.createElement('span');
    const elapsed = document.createElement('span');
    const timed = Number.isFinite(span.start);
    const interval = timed && span.end > span.start;
    button.type = 'button';
    button.dataset.span = span.id;
    button.className = 'telegram-span';
    label.className = 'telegram-span-label depth-' + span.depth;
    label.textContent = span.title;
    label.title = span.title;
    if (span.kind === 'pap') {
      const tag = document.createElement('small');
      tag.textContent = 'PAP';
      label.append(tag);
    }
    rail.className = 'telegram-span-rail';
    rail.setAttribute('aria-hidden', 'true');
    drawTiming(rail, span, origin, spanScale);
    elapsed.className = 'telegram-span-time';
    elapsed.textContent = interval ? duration(span.end - span.start) : timed ? 'Event' : '—';
    button.append(label, rail, elapsed);
    button.addEventListener('click', () => inspectSpan(span, origin));
    item.append(button);
    telegramTurns.append(item);
  }
  inspectSpan(spans.find(({ id }) => id === selectedSpan) ?? spans[0], origin);
}

function renderTelegram(turns) {
  const version = JSON.stringify(turns);
  if (version === telegramKey) return;
  telegramKey = version;
  telegramHistory = turns;
  const selection = telegramSelect.value;
  const latest = new Option('Latest turn', '');
  const recent = turns.map((turn) => new Option(clock(turn.timestamp) + ` · ${turn.tools.length} tools`, String(turn.id)));
  telegramSelect.replaceChildren(latest, ...recent);
  telegramSelect.value = turns.some(({ id }) => String(id) === selection) ? selection : '';
  paintTelegram();
}

telegramSelect.addEventListener('change', paintTelegram);

async function trackTelegram(currentGeneration = generation) {
  if (currentGeneration !== generation) return;
  if (!document.hidden) {
    try {
      const result = await call({ view: 'telegram' });
      if (currentGeneration !== generation) return;
      showTelegram(result.turns);
    } catch (error) {
      if (currentGeneration !== generation) return;
      if (error.status === 401) {
        closeTelegram('Your trace session expired. Sign in to reconnect.');
        return;
      }
      telegramStatus.textContent = error.message + ' Retrying…';
    }
  }
  timer = setTimeout(() => trackTelegram(currentGeneration), 1500);
}

function showTelegram(turns) {
  renderTelegram(turns);
  const latest = turns[0];
  const count = latest?.tools.length ?? 0;
  const label = latest ? `Live · latest turn ${clock(latest.timestamp)} · ${count} tool ${count === 1 ? 'call' : 'calls'}`
    : 'Live · waiting for a RhysBot Telegram message.';
  if (telegramStatus.textContent !== label) telegramStatus.textContent = label;
}

function openTelegram(turns) {
  connect.hidden = true;
  telegram.hidden = false;
  status.textContent = '';
  showTelegram(turns);
  const current = generation;
  timer = setTimeout(() => trackTelegram(current), 1500);
}

function closeTelegram(message = '') {
  generation += 1;
  clearTimeout(timer);
  key = '';
  telegramKey = undefined;
  telegramHistory = [];
  selectedSpan = undefined;
  telegramTurns.replaceChildren();
  telegramStatus.textContent = '';
  telegram.hidden = true;
  connect.hidden = false;
  status.textContent = message;
  keyField.focus();
}

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

async function call({ method = 'GET', run, body, view, action, ticket } = {}) {
  const url = new URL('/message', location.origin);
  if (view) url.searchParams.set('view', view);
  if (action) url.searchParams.set('action', action);
  if (run) {
    url.searchParams.set('run', run);
    if (method === 'GET') url.searchParams.set('trace', '1');
  }
  const res = await fetch(url, {
    method, redirect: 'error', signal: AbortSignal.timeout(12000),
    headers: { ...(key && { Authorization: 'Bearer ' + key }), ...(ticket && { 'X-Poppy-Pairing-Ticket': ticket }),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json();
  if (!res.ok) throw Object.assign(new Error(payload.reply), { status: res.status });
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
    if (telegramMode) {
      await call({ method: 'POST', view: 'telegram', action: 'session' });
      key = '';
      keyField.value = '';
      openTelegram((await call({ view: 'telegram' })).turns);
      return;
    }
    await call();
    keyField.value = '';
    connect.hidden = true;
    status.textContent = '';
    conversation.hidden = false;
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

document.querySelector('#telegram-disconnect').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await call({ method: 'POST', view: 'telegram', action: 'logout' });
    closeTelegram();
  } catch (error) {
    telegramStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

async function resumeTelegram() {
  const link = new URL(location.href);
  const ticket = new URLSearchParams(link.hash.slice(1)).get('pair');
  if (ticket) {
    link.hash = '';
    history.replaceState(null, '', link);
  }
  connect.hidden = true;
  status.textContent = 'Opening RhysBot’s trace…';
  try {
    if (ticket) await call({ method: 'POST', view: 'telegram', action: 'session', ticket });
    openTelegram((await call({ view: 'telegram' })).turns);
  } catch (error) {
    closeTelegram(!ticket && error.status === 401 ? '' : error.message);
  }
}

if (telegramMode) void resumeTelegram();
