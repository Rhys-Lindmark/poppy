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

function openTelegramTrace(db, owner) {
  if (!/^\d{5,20}$/.test(owner ?? '')) return undefined;
  const turns = db.prepare(`SELECT m.id, m.session_id, m.timestamp, length(m.content) AS characters
    FROM messages m JOIN sessions s ON s.id = m.session_id
    WHERE s.source = 'telegram' AND s.chat_type = 'dm' AND s.user_id = ? AND s.chat_id = ?
      AND m.role = 'user' AND coalesce(m.active, 1) = 1
    ORDER BY m.id DESC LIMIT 5`);
  const events = db.prepare(`SELECT id, timestamp, role, tool_call_id, tool_name, length(content) AS characters,
    finish_reason, substr(tool_calls, 1, 32769) AS calls, CASE WHEN tool_name = ? THEN substr(content, 1, 32769) END AS pap
    FROM messages WHERE session_id = ? AND id > ? AND coalesce(active, 1) = 1
      AND id < coalesce((SELECT min(id) FROM messages WHERE session_id = ? AND id > ? AND role = 'user' AND coalesce(active, 1) = 1), 9223372036854775807)
      AND role IN ('assistant', 'tool') ORDER BY id LIMIT 120`);
  const toolName = (name) => typeof name === 'string' && /^[a-z0-9_.:-]{1,96}$/i.test(name) ? name : null;

  return () => turns.all(owner, owner).map(({ id, session_id, timestamp, characters }) => {
    const tools = new Map();
    let reply = null;
    for (const event of events.all(papTool, session_id, id, session_id, id)) {
      if (event.role === 'assistant') {
        if (event.calls) {
          let calls;
          try { calls = JSON.parse(event.calls); } catch { continue; }
          if (!Array.isArray(calls) || !calls.length) {
            if (event.characters > 0 && event.finish_reason === 'stop') reply = { characters: event.characters };
            continue;
          }
          reply = null;
          for (const call of calls.slice(0, 32)) {
            const name = toolName(call?.function?.name);
            if (name && typeof call.id === 'string' && call.id.length <= 250) {
              tools.set(call.id, { name, state: 'Called', timestamp: event.timestamp });
            }
          }
        } else if (event.characters > 0 && event.finish_reason === 'stop') reply = { characters: event.characters };
      } else {
        const name = toolName(event.tool_name);
        if (!name) continue;
        const key = event.tool_call_id || 'row-' + event.id;
        const receipt = event.pap?.length <= 32768 ? readPapReceipt(event.pap) : null;
        tools.set(key, { name, state: 'Result recorded', timestamp: tools.get(key)?.timestamp ?? event.timestamp,
          ...(receipt && { pap: receipt }) });
      }
    }
    return { id, timestamp, characters, tools: [...tools.values()].slice(0, 60), reply };
  });
}

export function openHermesTraceStore(path, telegramOwner) {
  const db = new DatabaseSync(path, { readOnly: true, timeout: 100 });
  const cursor = db.prepare('SELECT coalesce(max(id), 0) AS id FROM messages WHERE session_id = ?');
  const entries = db.prepare(`SELECT id, role, tool_name, timestamp, substr(content, 1, 32769) AS content
    FROM messages WHERE session_id = ? AND id > ? AND (role = 'user' OR (role = 'tool' AND tool_name = ?))
    ORDER BY id LIMIT 25`);
  return {
    telegram: openTelegramTrace(db, telegramOwner),
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
