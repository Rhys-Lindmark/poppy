import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createHermesHandler } from '../src/hermes-http.mjs';

const port = 8652;
const handle = createHermesHandler({
  accessToken: process.env.POPPY_ACCESS_TOKEN,
  hermesToken: process.env.API_SERVER_KEY,
  publicPage: process.env.POPPY_OWNER_PAGE,
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
