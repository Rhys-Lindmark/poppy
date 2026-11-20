import { randomBytes } from 'node:crypto';

const cookieName = '__Host-poppy-telegram';
const sessionSeconds = 43200;

export function createTelegramAccess(origin) {
  const pairs = new Map();
  const sessions = new Map();
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
  return {
    allows: (request) => fresh(sessions, cookie(request)),
    change(request, action, hasKey, respond) {
      if (action === 'pair') {
        return hasKey ? respond({ ticket: issue(pairs, 60, 16) }) : respond({ reply: 'Enter your Poppy access key.' }, 401);
      }
      if (request.headers.get('origin') !== origin) return respond({ reply: 'Open the private Telegram trace to sign in.' }, 403);
      if (action === 'logout') {
        sessions.delete(cookie(request));
        return respond({ ready: false }, 200, header('', 0));
      }
      if (action !== 'session') return respond({ reply: 'Unknown sign-in action.' }, 400);
      const ticket = request.headers.get('x-poppy-pairing-ticket');
      if (!hasKey && !fresh(pairs, ticket)) return respond({ reply: 'Sign-in expired or the access key was incorrect.' }, 401);
      pairs.delete(ticket);
      sessions.delete(cookie(request));
      return respond({ ready: true }, 200, header(issue(sessions, sessionSeconds, 24), sessionSeconds));
    },
  };
}
