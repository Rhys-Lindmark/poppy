import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHermesHandler } from '../src/hermes-http.mjs';
import { openHermesTraceStore } from './hermes-trace-store.mjs';

const port = 8652;
let telegramOwner;
try { telegramOwner = readFileSync(join(homedir(), '.config/poppy/telegram-owner'), 'utf8').trim(); } catch { /* Optional owner view. */ }
let traceStore;
try {
  traceStore = openHermesTraceStore(join(process.env.HERMES_HOME ?? join(homedir(), '.hermes'), 'state.db'), telegramOwner);
} catch {
  // Keep event tracing and chat available if the local history is unavailable.
  traceStore = {};
}
const handle = createHermesHandler({
  accessToken: process.env.POPPY_ACCESS_TOKEN,
  hermesToken: process.env.API_SERVER_KEY,
  publicPage: process.env.POPPY_OWNER_PAGE,
  traceStore,
  tracePassphraseFile: join(homedir(), '.config/poppy/telegram-trace.verifier'),
});

createServer({ requestTimeout: 15000, headersTimeout: 10000 }, async (req, res) => {
  try {
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) {
      res.writeHead(400).end();
      return;
    }
    const options = { method: req.method, headers: req.headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      options.body = Readable.toWeb(req);
      options.duplex = 'half';
    }
    const result = await handle(new Request('http://127.0.0.1:' + port + req.url, options));
    res.writeHead(result.status, Object.fromEntries(result.headers));
    if (result.body) Readable.fromWeb(result.body).pipe(res);
    else res.end();
  } catch {
    res.writeHead(500).end();
  }
}).listen(port, '127.0.0.1');
