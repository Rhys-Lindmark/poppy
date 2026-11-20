import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const args = process.argv.slice(2);
if (args[0] === '--telegram-pair') {
  const result = await fetch('http://127.0.0.1:8652/message?view=telegram&action=pair', {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.POPPY_ACCESS_TOKEN },
    signal: AbortSignal.timeout(6000),
  });
  if (!result.ok) throw new Error('Poppy could not create a one-time sign-in.');
  const { ticket } = await result.json();
  const url = new URL('/?view=telegram', process.env.POPPY_OWNER_PAGE);
  console.log(JSON.stringify({ url: url.href, ticket }));
} else if (args[0] === '--open-telegram-trace' && process.platform === 'darwin') {
  try {
    const remote = 'set -a; . "$HOME/.config/poppy/hermes.env"; set +a; ' +
      'exec "$HOME/.config/poppy/node" "$HOME/.local/share/poppy/scripts/poppy-ask.mjs" --telegram-pair';
    const ssh = spawn('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', 'hermes', remote],
      { stdio: ['ignore', 'pipe', 'ignore'] });
    const wait = (child) => new Promise((resolve) => {
      child.on('error', () => resolve(1));
      child.on('close', (code) => resolve(code ?? 1));
    });
    const sshExit = wait(ssh);
    const chunks = [];
    for await (const chunk of ssh.stdout) chunks.push(chunk);
    if (await sshExit) throw new Error('Unable to obtain a sign-in ticket.');
    const { url, ticket } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/' ||
        target.search !== '?view=telegram' || target.hash || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
      throw new Error('Unexpected one-time sign-in result.');
    }
    target.hash = new URLSearchParams({ pair: ticket }).toString();
    // Pass the single-use ticket to the system browser launcher over stdin.
    const browser = spawn('/usr/bin/osascript', [], { stdio: ['pipe', 'ignore', 'ignore'] });
    const browserExit = wait(browser);
    browser.stdin.on('error', () => {});
    browser.stdin.end('open location ' + JSON.stringify(target.href) + '\n');
    if (await browserExit) throw new Error('The Mac could not open the browser.');
    console.log('Opened the private Telegram trace in your browser.');
  } catch {
    console.error('Could not open the trace. Open the Poppy Telegram trace and sign in with your access key.');
    process.exitCode = 1;
  }
} else if (args[0] === '--server') {
  const { POPPY_ACCESS_TOKEN } = process.env;
  if (!POPPY_ACCESS_TOKEN) throw new Error('Poppy access is not configured on the server.');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const { message, run } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const endpoint = new URL('http://127.0.0.1:8652/message');
  const headers = { Authorization: 'Bearer ' + POPPY_ACCESS_TOKEN, 'Content-Type': 'application/json' };
  let id = run;
  if (!id) {
    const admitted = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ message }) });
    const payload = await admitted.json();
    if (!admitted.ok) throw new Error(payload.reply || 'Hermes could not start the task.');
    id = payload.run_id;
    process.stderr.write('Hermes task: ' + id + '\n');
  }
  endpoint.searchParams.set('run', id);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await fetch(endpoint, { headers });
    const payload = await status.json();
    if (!status.ok) throw new Error(payload.reply || 'Hermes could not report progress.');
    if (payload.done || payload.status === 'awaiting_approval') {
      console.log(payload.reply);
      if (payload.status !== 'completed') process.exitCode = 1;
      break;
    }
    if (attempt === 59) console.log('Still working. Poll it again with npm run ask -- --run ' + id);
    else await delay(2000);
  }
} else if (args[0] === '--copy-access-key' && process.platform === 'darwin') {
  const remote = '. "$HOME/.config/poppy/hermes.env"; printf %s "$POPPY_ACCESS_TOKEN"';
  const ssh = spawn('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', 'hermes', remote],
    { stdio: ['ignore', 'pipe', 'inherit'] });
  const copy = spawn('/usr/bin/pbcopy', [], { stdio: ['pipe', 'ignore', 'inherit'] });
  ssh.stdout.pipe(copy.stdin);
  const exitCode = (child) => new Promise((resolve) => {
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
  copy.stdin.on('error', () => {});
  const states = await Promise.all([exitCode(ssh), exitCode(copy)]);
  if (states.every((code) => code === 0)) console.log('Copied your Poppy access key.');
  else {
    console.error('Could not copy your Poppy access key.');
    process.exitCode = 1;
  }
} else {
  const payload = args[0] === '--run' && args[1] ? { run: args[1] } : { message: args.join(' ').trim() };
  if (!payload.run && !payload.message) {
    console.error('Usage: npm run ask -- "Ask Poppy a question"');
    process.exitCode = 1;
  } else {
    const remote = 'set -a; . "$HOME/.config/poppy/hermes.env"; set +a; ' +
      'exec "$HOME/.config/poppy/node" "$HOME/.local/share/poppy/scripts/poppy-ask.mjs" --server';
    const ssh = spawn('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', 'hermes', remote],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    ssh.stdin.on('error', () => {});
    ssh.stdin.end(JSON.stringify(payload));
    ssh.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
    ssh.on('exit', (code) => { process.exitCode = code ?? 1; });
  }
}
