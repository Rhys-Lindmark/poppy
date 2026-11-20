import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const cookieName = '__Host-poppy-telegram';
const sessionSeconds = 43200;
const digest = promisify(scrypt);
const keyPattern = /^([a-f0-9]{32}):([a-f0-9]{64})\n?$/;
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function readVerifier(path) {
  if (!path) return undefined;
  try {
    const match = readFileSync(path, 'utf8').match(keyPattern);
    if (!match) return undefined;
    return { salt: match[1], hash: Buffer.from(match[2], 'hex') };
  } catch {
    // The SSH pairing route remains available if the stored verifier cannot be read.
    return undefined;
  }
}

export function createTelegramAccess(origin, { passphraseFile, readBody } = {}) {
  const pairs = new Map();
  const sessions = new Map();
  const owners = new Set();
  let verifier = readVerifier(passphraseFile);
  let nextAttempt = 0;
  let calculating = false;
  const cookie = (request) => request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-poppy-telegram=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
  const header = (value, seconds) => ({ 'Set-Cookie': `${cookieName}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}` });
  const fresh = (map, token) => {
    const expiry = map.get(token);
    if (expiry > Date.now()) return true;
    if (expiry) map.delete(token);
    return false;
  };
  const issue = (map, seconds, max) => {
    for (const [token, expiry] of map) if (expiry <= Date.now()) map.delete(token);
    if (map.size >= max) map.delete(map.keys().next().value);
    const token = randomBytes(32).toString('base64url');
    map.set(token, Date.now() + seconds * 1000);
    return token;
  };
  const canSetKey = (request) => Boolean(passphraseFile && fresh(sessions, cookie(request)) && owners.has(cookie(request)));
  function signIn(request, owner, respond) {
    sessions.delete(cookie(request));
    const token = issue(sessions, sessionSeconds, 24);
    for (const prior of owners) if (!sessions.has(prior)) owners.delete(prior);
    if (owner) owners.add(token);
    return respond({ ready: true }, 200, header(token, sessionSeconds));
  }
  async function suppliedKey(request) {
    try {
      const body = await readBody(request.body, 768);
      return typeof body?.passphrase === 'string' ? body.passphrase.trim() : '';
    } catch {
      return '';
    }
  }
  return {
    allows: (request) => fresh(sessions, cookie(request)),
    canSetKey,
    async change(request, action, hasKey, respond) {
      if (action === 'pair') {
        return hasKey ? respond({ ticket: issue(pairs, 60, 16) }) : respond({ reply: 'Enter your Poppy access key.' }, 401);
      }
      if (request.headers.get('origin') !== origin) return respond({ reply: 'Open the private Telegram trace to sign in.' }, 403);
      if (action === 'logout') {
        sessions.delete(cookie(request));
        owners.delete(cookie(request));
        return respond({ ready: false }, 200, header('', 0));
      }
      if (action === 'key') {
        if (!hasKey && !canSetKey(request)) return respond({ reply: 'Open the trace from your Mac to set its key.' }, 403);
        if (!passphraseFile) return respond({ reply: 'Trace key setup is unavailable.' }, 503);
        const phrase = await suppliedKey(request);
        if (phrase.length < 14 || phrase.length > 128) return respond({ reply: 'Use 14 to 128 characters for your trace key.' }, 400);
        if (calculating) return respond({ reply: 'Try again in a moment.' }, 429);
        calculating = true;
        const salt = randomBytes(16).toString('hex');
        const pending = passphraseFile + '.' + salt + '.tmp';
        try {
          const hash = await digest(phrase, salt, 32, options);
          await writeFile(pending, salt + ':' + hash.toString('hex') + '\n', { mode: 0o600, flag: 'wx' });
          await rename(pending, passphraseFile);
          verifier = { salt, hash };
          for (const token of sessions.keys()) if (!owners.has(token)) sessions.delete(token);
          return respond({ saved: true });
        } catch {
          await unlink(pending).catch(() => {});
          return respond({ reply: 'Could not save the trace key.' }, 503);
        } finally {
          calculating = false;
        }
      }
      if (action !== 'session') return respond({ reply: 'Unknown sign-in action.' }, 400);
      const ticket = request.headers.get('x-poppy-pairing-ticket');
      if (hasKey || fresh(pairs, ticket)) {
        pairs.delete(ticket);
        return signIn(request, true, respond);
      }
      if (ticket) return respond({ reply: 'This sign-in link has expired. Enter your trace key or open a fresh link from your Mac.' }, 401);
      const invalid = () => respond({ reply: 'Trace key incorrect or not set. You can open the trace from your Mac to set it.' }, 401);
      const phrase = await suppliedKey(request);
      if (!verifier || phrase.length < 14 || phrase.length > 128) return invalid();
      if (calculating || Date.now() < nextAttempt) return respond({ reply: 'Wait a few seconds and try again.' }, 429, { 'Retry-After': '5' });
      calculating = true;
      nextAttempt = Date.now() + 5000;
      try {
        const hash = await digest(phrase, verifier.salt, 32, options);
        return timingSafeEqual(hash, verifier.hash) ? signIn(request, false, respond) : invalid();
      } finally {
        calculating = false;
      }
    },
  };
}
