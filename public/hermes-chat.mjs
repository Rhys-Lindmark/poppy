const connect = document.querySelector('#connect');
const conversation = document.querySelector('#conversation');
const status = document.querySelector('#status');
const keyField = document.querySelector('#key');
const messageField = document.querySelector('#message');
const submit = document.querySelector('#submit');
const stop = document.querySelector('#stop');
const messages = document.querySelector('#messages');
let key = '';
let running;
let timer;
let generation = 0;
let busy = false;
let pending;

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
  if (run) url.searchParams.set('run', run);
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
  stop.hidden = !run;
}

async function track(run, currentGeneration = generation) {
  setRun(run);
  try {
    const payload = await call({ run });
    if (currentGeneration !== generation || run !== running) return;
    if (payload.done) {
      showMessage('Poppy', payload.reply);
      status.textContent = '';
      setRun();
      return;
    }
    status.textContent = payload.reply;
    timer = setTimeout(() => track(run, currentGeneration), payload.status === 'awaiting_approval' ? 5000 : 2500);
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
  if (pending?.message !== message) pending = { message, request_id: crypto.randomUUID() };
  submit.disabled = true;
  status.textContent = 'Sending to Hermes…';
  try {
    const payload = await call({ method: 'POST', body: pending });
    if (currentGeneration !== generation) return;
    showMessage('You', message);
    pending = undefined;
    if (messageField.value.trim() === message) messageField.value = '';
    const view = new URL(location.href);
    view.searchParams.set('run', payload.run_id);
    history.replaceState(null, '', view);
    track(payload.run_id);
  } catch (error) {
    if (currentGeneration === generation) status.textContent = error.message;
  } finally {
    if (currentGeneration === generation) {
      busy = false;
      submit.disabled = Boolean(running);
    }
  }
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
  status.textContent = '';
  conversation.hidden = true;
  connect.hidden = false;
  keyField.focus();
});
