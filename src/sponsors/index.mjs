import { randomUUID } from 'node:crypto';
import { sponsorClient } from './http.mjs';
import { createPersona } from './persona.mjs';
import { createAirbyte } from './airbyte.mjs';

const policyQuery = 'What is the Demo Store policy for delivery rescheduling, fees, and customer approval?';
const analyticsEvents = {
  task_started: 'Poppy Task Started',
  store_discovered: 'Poppy Store Discovered',
  access_granted: 'Poppy Store Access Granted',
  change_proposed: 'Poppy Delivery Change Proposed',
  change_approved: 'Poppy Delivery Change Approved',
  change_declined: 'Poppy Delivery Change Declined',
  delivery_changed: 'Poppy Delivery Changed',
};

export function createSponsors(env = {}, fetcher = fetch, report = console.warn) {
  const call = sponsorClient(fetcher);
  const amplitudeKey = env.AMPLITUDE_API_KEY;
  const statsigKey = env.STATSIG_SERVER_SECRET;
  const sensoKey = env.SENSO_API_KEY;
  const cogneeKey = env.COGNEE_API_KEY;
  const arceeKey = env.ARCEE_API_KEY;
  const pending = new Set();
  const airbyte = createAirbyte({
    token: env.AIRBYTE_MCP_TOKEN, source: env.AIRBYTE_SOURCE_ID, stream: env.AIRBYTE_STREAM,
    destination: env.AIRBYTE_DESTINATION_ID, fetcher,
  });
  let database;
  if (env.SINGLESTORE_URL || env.SINGLESTORE_TOKEN || env.SINGLESTORE_DATABASE) {
    const endpoint = new URL(env.SINGLESTORE_URL || 'https://invalid.example');
    if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.svc.singlestore.com') ||
        endpoint.username || endpoint.password || !env.SINGLESTORE_TOKEN || !env.SINGLESTORE_DATABASE) {
      throw new Error('SingleStore requires a Helios endpoint, database name, and Data API token.');
    }
    database = { endpoint: new URL('/api/v2/exec', endpoint).href, name: env.SINGLESTORE_DATABASE, token: env.SINGLESTORE_TOKEN };
  }
  const persona = createPersona({ key: env.PERSONA_API_KEY, template: env.PERSONA_TEMPLATE_ID, call });

  function record(stage, id) {
    if ((!amplitudeKey && !statsigKey && !database) || pending.size >= 64) return;
    const eventName = analyticsEvents[stage];
    if (!eventName) throw new Error('Unknown sponsor event');
    const time = Date.now();
    const eventId = randomUUID();
    const properties = { environment: 'hackathon_sandbox', protocol_version: '1.0' };
    const jobs = [];
    if (amplitudeKey) {
      const endpoint = env.AMPLITUDE_REGION === 'eu' ? 'api.eu.amplitude.com' : 'api2.amplitude.com';
      jobs.push(call('Amplitude', 'https://' + endpoint + '/2/httpapi', { body: {
        api_key: amplitudeKey,
        events: [{ event_type: eventName, device_id: id, time, insert_id: eventId, event_properties: properties }],
      } }));
    }
    if (statsigKey) {
      jobs.push(call('Statsig', 'https://api.statsig.com/v1/log_event', {
        headers: { 'statsig-api-key': statsigKey },
        body: { events: [{ eventName, time, user: { userID: id }, metadata: properties }] },
      }));
    }
    if (database) {
      jobs.push(call('SingleStore', database.endpoint, {
        headers: { Authorization: 'Bearer ' + database.token },
        body: {
          database: database.name,
          sql: 'INSERT INTO poppy_demo_events (event_id, demo_id, event_name, seen_at_ms) VALUES (?, ?, ?, ?)',
          args: [eventId, id, eventName, time],
        },
      }));
    }
    const completion = Promise.allSettled(jobs).then((results) => {
      for (const result of results) if (result.status === 'rejected') report(result.reason.message);
    }).finally(() => pending.delete(completion));
    pending.add(completion);
  }

  async function policyContext(id) {
    if (!sensoKey && !(cogneeKey && env.COGNEE_DATASET) && !airbyte) return [];
    if (statsigKey && env.STATSIG_POLICY_GATE) {
      try {
        const gate = await call('Statsig', 'https://api.statsig.com/v1/check_gate', {
          headers: { 'statsig-api-key': statsigKey },
          body: { gateName: env.STATSIG_POLICY_GATE, user: { userID: id } },
        });
        if (gate.value !== true) return [];
      } catch (error) {
        report(error.message);
        return [];
      }
    }
    const jobs = [];
    if (sensoKey) {
      jobs.push(call('Senso', 'https://apiv2.senso.ai/api/v1/org/search/context', {
        headers: { 'X-API-Key': sensoKey }, body: { query: policyQuery, max_results: 3 },
      }).then((result) => (result.results ?? []).map((item) => ({
        provider: 'Senso', title: item.title, text: item.chunk_text,
      }))));
    }
    if (cogneeKey && env.COGNEE_DATASET) {
      jobs.push(call('Cognee', 'https://api.cognee.ai/api/v1/search', {
        headers: { 'X-Api-Key': cogneeKey },
        body: { query: policyQuery, search_type: 'CHUNKS', datasets: [env.COGNEE_DATASET], top_k: 3 },
      }).then((result) => (Array.isArray(result) ? result : []).map((item) => ({
        provider: 'Cognee', title: env.COGNEE_DATASET,
        text: typeof item === 'string' ? item : item?.text,
      }))));
    }
    if (airbyte) jobs.push(airbyte(policyQuery));
    const evidence = [];
    for (const result of await Promise.allSettled(jobs)) {
      if (result.status === 'rejected') report(result.reason.message);
      else for (const item of result.value) {
        if (typeof item.title === 'string' && typeof item.text === 'string' && item.text.trim()) {
          evidence.push({ ...item, title: item.title.slice(0, 120), text: item.text.trim().slice(0, 400) });
        }
      }
    }
    if (env.SUPERLINKED_API_KEY && evidence.length > 1) {
      try {
        const scored = await call('Superlinked', 'https://api.superlinked.com/v1/score', {
          headers: { Authorization: 'Bearer ' + env.SUPERLINKED_API_KEY },
          body: {
            model: env.SUPERLINKED_MODEL || 'Qwen/Qwen3-Reranker-4B',
            query: { id: 'poppy-policy-query', text: policyQuery },
            items: evidence.map(({ text }, index) => ({ id: String(index), text })),
          },
        });
        const indexes = [...new Set((scored.scores ?? []).map(({ item_id }) => /^\d+$/.test(item_id) ? Number(item_id) : -1))]
          .filter((id) => Number.isSafeInteger(id) && id >= 0 && id < evidence.length);
        if (indexes.length) {
          const ordered = [...indexes, ...evidence.map((_, i) => i).filter((i) => !indexes.includes(i))];
          return ordered.slice(0, 4).map((i) => indexes.includes(i) ? { ...evidence[i], rankedBy: 'Superlinked' } : evidence[i]);
        }
      } catch (error) {
        report(error.message);
      }
    }
    return evidence.slice(0, 4);
  }

  async function interpret(prompt) {
    if (!arceeKey || prompt.length > 400) return undefined;
    const result = await call('Arcee AI', 'https://api.arcee.ai/api/v1/chat/completions', {
      headers: { Authorization: 'Bearer ' + arceeKey },
      body: {
        model: env.ARCEE_MODEL || 'trinity-mini', max_tokens: 20, temperature: 0,
        messages: [
          { role: 'system', content: 'Find the requested new delivery day. Reply with exactly Saturday, Monday, or unknown. Other tasks are unknown.' },
          { role: 'user', content: prompt },
        ],
      },
    });
    const day = result.choices?.[0]?.message?.content?.trim();
    return ['Saturday', 'Monday'].includes(day) ? day : undefined;
  }

  return { persona, record, policyContext, interpret, flush: () => Promise.allSettled([...pending]) };
}
