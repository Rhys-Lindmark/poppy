import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { papTool } from '../src/hermes-events.mjs';

const company = 'https://ai.rhyslindmark.com';
const route = '/poppy/api/edition.json';

export function readPapReceipt(content) {
  try {
    const wrapped = content.match(/^<untrusted_tool_result[^>]*>\s*([\s\S]+)\s*<\/untrusted_tool_result>\s*$/)?.[1];
    const notice = wrapped && !wrapped.startsWith('{') ? wrapped.indexOf('\n\n') : -1;
    const envelope = notice >= 0 ? wrapped.slice(notice + 2) : wrapped ?? content;
    const result = JSON.parse(envelope).result;
    const proof = typeof result === 'string' ? JSON.parse(result) : result;
    const request = proof?.signed_requests?.[0];
    if (proof?.protocol_version !== '1.0' || proof.client_id !== company + '/poppy/hermes-agent.json' ||
        proof.signed_requests.length !== 1 || request?.method !== 'GET' || request.path !== route || request.status !== 200) return null;
    const checks = proof.trace;
    const observed = [
      ['GET', '/.well-known/oauth-protected-resource', 404],
      ['GET', '/.well-known/poppy.json', 200],
      ['GET', '/poppy/openapi.json', 200],
      ['GET', route, 200],
    ];
    return {
      version: '1.0', company, client_id: proof.client_id, method: 'GET', path: route, http_status: 200,
      ...(Array.isArray(checks) && checks.length === observed.length && checks.every((step, i) =>
        step.method === observed[i][0] && step.path === observed[i][1] && step.status === observed[i][2]) && {
        requests: observed.map(([method, path, status]) => ({ method, path, status })),
      }),
    };
  } catch {
    return null;
  }
}

export function openHermesTraceStore(path) {
  const db = new DatabaseSync(path, { readOnly: true, timeout: 100 });
  const cursor = db.prepare('SELECT coalesce(max(id), 0) AS id FROM messages WHERE session_id = ?');
  const entries = db.prepare(`SELECT id, role, tool_name, timestamp, substr(content, 1, 32769) AS content
    FROM messages WHERE session_id = ? AND id > ? AND (role = 'user' OR (role = 'tool' AND tool_name = ?))
    ORDER BY id LIMIT 25`);
  return {
    cursor: (session) => cursor.get(session).id,
    proof(session, after, fingerprint, completed) {
      const rows = entries.all(session, after, papTool);
      const users = rows.filter(({ role }) => role === 'user');
      if (rows.length === 25 || users.length !== 1 || typeof users[0].content !== 'string' ||
          createHash('sha256').update(users[0].content).digest().join(',') !== fingerprint) return [];
      return completed.flatMap((time) => {
        const matches = rows.filter((row) => row.role === 'tool' && row.id > users[0].id && Math.abs(row.timestamp - time) < 2);
        if (matches.length !== 1 || typeof matches[0].content !== 'string' || matches[0].content.length > 32768) return [];
        const receipt = readPapReceipt(matches[0].content);
        return receipt ? [{ id: matches[0].id, receipt }] : [];
      });
    },
  };
}
