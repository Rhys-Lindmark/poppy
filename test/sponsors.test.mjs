import assert from 'node:assert/strict';
import test from 'node:test';
import { createSponsors } from '../src/sponsors/index.mjs';

test('sponsor lookups, ranking, analytics SQL, and intent parsing use bounded demo payloads', async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    const { hostname, pathname } = new URL(url);
    const body = JSON.parse(options.body);
    requests.push([hostname, body]);
    assert.equal(options.redirect, 'error');
    if (pathname === '/v1/check_gate') return Response.json({ value: true });
    if (pathname === '/v1/log_event') return Response.json({ success: true });
    if (hostname === 'apiv2.senso.ai') return Response.json({ results: [{ title: 'Delivery policy', chunk_text: 'Saturday moves cost nothing.' }] });
    if (hostname === 'api.cognee.ai') return Response.json(['Show exact terms before applying an order change.']);
    if (hostname === 'api.superlinked.com') {
      assert.deepEqual(body.items.map(({ id }) => id), ['0', '1', '2']);
      return Response.json({ scores: [{ item_id: '2', rank: 0 }, { item_id: '0', rank: 1 }] });
    }
    if (hostname === 'mcp.airbyte.com') {
      if (body.method === 'initialize') return Response.json({ id: 1, result: { protocolVersion: '2025-06-18' } }, {
        headers: { 'mcp-session-id': 'fixture-mcp' },
      });
      assert.equal(options.headers['Mcp-Session-Id'], 'fixture-mcp');
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      assert.equal(body.params.name, 'execute_external_search_query');
      assert.equal(body.params.arguments.source_id, 'seed-source');
      const event = { id: 2, result: { structuredContent: { results: [
        { entity_data: { title: 'Seeded store guide', text: 'The user must approve the exact terms.' } },
      ] } } };
      const stream = new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n'));
      } });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (hostname === 'fixture.svc.singlestore.com') {
      assert.equal(body.database, 'audit');
      assert.equal(body.args[2], 'Poppy Task Started');
      assert.match(body.sql, /VALUES \(\?, \?, \?, \?\)/);
      return Response.json({ rowsAffected: 1 });
    }
    if (hostname === 'api.arcee.ai') return Response.json({ choices: [{ message: { content: 'Monday' } }] });
    throw new Error('Unexpected sponsor test endpoint.');
  };
  const warnings = [];
  const sponsors = createSponsors({
    STATSIG_SERVER_SECRET: 'fixture', STATSIG_POLICY_GATE: 'show_policy',
    SENSO_API_KEY: 'fixture', COGNEE_API_KEY: 'fixture', COGNEE_DATASET: 'demo-policy',
    AIRBYTE_MCP_TOKEN: 'fixture', AIRBYTE_SOURCE_ID: 'seed-source', AIRBYTE_STREAM: 'policy',
    SUPERLINKED_API_KEY: 'fixture', ARCEE_API_KEY: 'fixture',
    SINGLESTORE_URL: 'https://fixture.svc.singlestore.com', SINGLESTORE_DATABASE: 'audit', SINGLESTORE_TOKEN: 'fixture',
  }, fetcher, (warning) => warnings.push(warning));
  const context = await sponsors.policyContext('synthetic-demo-id');
  assert.deepEqual(context.map(({ provider }) => provider), ['Airbyte', 'Senso', 'Cognee']);
  assert.equal(context[0].rankedBy, 'Superlinked');
  assert.equal(context[2].rankedBy, undefined);
  assert.equal(await sponsors.interpret('Move it to the first weekday'), 'Monday');
  sponsors.record('task_started', 'synthetic-demo-id');
  await sponsors.flush();
  assert.ok(requests.some(([host]) => host === 'fixture.svc.singlestore.com'));
  assert.deepEqual(warnings, []);
});
