import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAgent } from './agent.mjs';
import { confinedHttp, json } from './protocol.mjs';
import { createStore } from './store.mjs';
import { createViews } from './views.mjs';
import storefrontResults from '../data/storefront-results.json' with { type: 'json' };
import { createSponsors } from './sponsors/index.mjs';

function localCertificate() {
  const dir = mkdtempSync(join(tmpdir(), 'poppy-tls-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
      '-noenc', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-days', '1',
      '-keyout', keyPath, '-out', certPath], { stdio: 'ignore', timeout: 5000 });
    return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const styles = new Map(['/styles.css', '/tokens.css'].map((path) =>
  [path, readFileSync(new URL('../public' + path, import.meta.url))]));
const userPosts = new Set(['/agent/start', '/oauth/authorize', '/oauth/persona/check', '/agent/approval']);

export async function startSandbox({ port = 0, sponsors = createSponsors() } = {}) {
  const tls = localCertificate();
  let handle = (_req, res) => json(res, 503, { error: 'starting' });
  const server = createServer(tls, (req, res) => {
    Promise.resolve(handle(req, res)).catch(() => {
      if (!res.headersSent) json(res, 500, { error: 'sandbox_request_failed' });
      else res.destroy();
    });
  });
  server.requestTimeout = 10_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const origin = 'https://localhost:' + server.address().port;
  const http = confinedHttp(origin, tls.cert);
  const events = [];
  const trace = (actor, method, path, status, details, flowId) => {
    if (!flowId) return;
    const entry = { actor, method, path, status, details, flowId };
    events.push(entry);
    if (events.length > 300) events.shift();
    return entry;
  };
  const entriesFor = (flowId) => flowId ? events.filter((entry) => entry.flowId === flowId) : [];
  const render = createViews(entriesFor);
  const agent = createAgent({ origin, http, render, trace, entriesFor, sponsors });
  const store = createStore({ origin, http, clientId: agent.clientId, render, trace, persona: sponsors.persona });
  handle = async (req, res) => {
    if (req.headers.host !== new URL(origin).host || !req.url?.startsWith('/') || req.url.startsWith('//')) {
      return json(res, 400, { error: 'invalid_host_or_path' });
    }
    const url = new URL(req.url, origin);
    if (url.origin !== origin) return json(res, 400, { error: 'invalid_path' });
    if (req.method === 'POST' && userPosts.has(url.pathname) && req.headers.origin !== origin) {
      return json(res, 403, { error: 'unexpected_request_origin' });
    }
    if (req.method === 'GET' && url.pathname === '/') return render.home(res, url.searchParams.get('day'));
    if (req.method === 'GET' && url.pathname === '/coverage') return render.coverage(res);
    if (req.method === 'GET' && url.pathname === '/storefront-results.json') return json(res, 200, storefrontResults);
    if (req.method === 'GET' && styles.has(url.pathname)) {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
      return res.end(styles.get(url.pathname));
    }
    if (await store(req, res, url)) return;
    if (await agent.handle(req, res, url)) return;
    return json(res, 404, { error: 'not_found' });
  };
  return { origin, http, close: async () => { await new Promise((resolve) => server.close(resolve)); await sponsors.flush(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prompt = process.argv.slice(2).join(' ');
  const sponsors = createSponsors(process.env);
  const days = [...new Set([...prompt.matchAll(/\b(Saturday|Monday)\b/gi)].map((match) => match[1].toLowerCase()))];
  let day = days.length === 1 ? days[0] : undefined;
  if (prompt && !day) {
    try { day = await sponsors.interpret(prompt); } catch (error) { console.warn(error.message); }
  }
  if (prompt && !day) {
    console.error('Choose Saturday or Monday for the delivery change.');
    process.exitCode = 1;
  } else {
    const sandbox = await startSandbox({ port: Number(process.env.POPPY_PORT || 8443), sponsors });
    const url = new URL('/', sandbox.origin);
    if (day) url.searchParams.set('day', day[0].toUpperCase() + day.slice(1).toLowerCase());
    console.log(url.href);
  }
}
