const endpoint = 'https://mcp.airbyte.com/mcp';

function parseFrame(frame) {
  const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart()).join('\n');
  return data ? parseJson(data) : null;
}

function parseJson(value) {
  try { return JSON.parse(value); }
  catch { throw new Error('Airbyte returned invalid JSON.'); }
}

async function resultBody(response) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const streaming = response.headers.get('content-type')?.includes('text/event-stream');
  let bytes = 0;
  let content = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) throw new Error('Airbyte response exceeded the demo limit.');
      content += decoder.decode(value, { stream: true });
      if (!streaming) continue;
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(content))) {
        const message = parseFrame(content.slice(0, boundary.index));
        if (message && (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'))) return message;
        content = content.slice(boundary.index + boundary[0].length);
      }
    }
    content += decoder.decode();
    if (!content.trim()) return null;
    return streaming ? parseFrame(content) : parseJson(content);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function createAirbyte({ token, source, stream, destination, fetcher }) {
  if (!token && !source && !stream && !destination) return null;
  if (!token || !source || !stream) throw new Error('Airbyte requires an MCP access token, source ID, and stream name.');

  return async (prompt) => {
    let session;
    let protocol = '2025-06-18';
    async function send(id, method, params = {}) {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token, Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json', 'MCP-Protocol-Version': protocol,
          ...(session ? { 'Mcp-Session-Id': session } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, params }),
        redirect: 'error', signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new Error('Airbyte MCP returned HTTP ' + response.status + '.');
      }
      session = response.headers.get('mcp-session-id') || session;
      if (id === null) return;
      const message = await resultBody(response);
      if (message?.id !== id || message.error || !message.result) throw new Error('Airbyte MCP search failed.');
      return message.result;
    }

    const ready = await send(1, 'initialize', { protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'Poppy demo', version: '1.0.0' } });
    if (typeof ready.protocolVersion !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ready.protocolVersion)) {
      throw new Error('Airbyte returned an invalid MCP version.');
    }
    protocol = ready.protocolVersion;
    await send(null, 'notifications/initialized');
    const search = await send(2, 'tools/call', {
      name: 'execute_external_search_query',
      arguments: {
        source_id: source, ...(destination ? { destination_id: destination } : {}), prompt,
        search_type: 'hybrid', limit: 3, max_context_chars: 400,
        streams: [{ stream_name: stream, source_id: source, fields: ['title', 'text'] }],
      },
    });
    if (search.isError) throw new Error('Airbyte could not query the demo search index.');
    const data = search.structuredContent ?? parseJson(search.content?.find((item) => item.type === 'text')?.text || '{}');
    const rows = Array.isArray(data) ? data : (data.results ?? data.data?.results ?? []);
    return rows.map((row) => ({
      provider: 'Airbyte', title: row.entity_data?.title ?? stream,
      text: row.entity_data?.text ?? row.context,
    }));
  };
}
