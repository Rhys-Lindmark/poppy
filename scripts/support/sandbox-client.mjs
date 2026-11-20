import assert from 'node:assert/strict';

export const field = (html, name) => {
  const match = html.match(new RegExp('name="' + name + '" value="([^"]+)"'));
  assert.ok(match, 'Expected hidden field ' + name);
  return match[1];
};

export function browser(sandbox) {
  let cookie = '';
  const { origin, http } = sandbox;
  return {
    get: (path) => http(new URL(path, origin).href, { headers: { Cookie: cookie } }),
    async post(path, fields, requestOrigin = origin) {
      const body = new URLSearchParams(fields).toString();
      const response = await http(origin + path, {
        method: 'POST',
        headers: { Origin: requestOrigin, Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (response.headers['set-cookie']) cookie = response.headers['set-cookie'][0].split(';')[0];
      return response;
    },
  };
}

export async function signIn(client, day, scopes, task = 'reschedule') {
  const start = await client.post('/agent/start', { day, task });
  assert.equal(start.status, 303, start.text);
  const store = await client.get(start.headers.location);
  assert.equal(store.status, 200, store.text);
  assert.match(store.text, /Sign in at Demo Store/);
  const consent = await client.post('/oauth/authorize', [
    ['ticket', field(store.text, 'ticket')],
    ['decision', 'allow'],
    ...scopes.map((scope) => ['scope', scope]),
  ]);
  assert.equal(consent.status, 303, consent.text);
  return client.get(consent.headers.location);
}
