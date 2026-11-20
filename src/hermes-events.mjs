export const papTool = 'mcp__poppy_pap__prepare_commonplace_edition';

export async function readHermesEvents(body, run, observe) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += value;
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const packet = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (!packet.startsWith('data: ') || packet.length > 1048576) continue;
        const event = JSON.parse(packet.slice(6));
        if (event.run_id !== run) continue;
        if (event.event === 'approval.request') {
          observe({ type: 'tool.approval' });
        } else if (['tool.started', 'tool.completed'].includes(event.event) &&
            typeof event.tool === 'string' && /^[a-z0-9_.:-]{1,96}$/i.test(event.tool)) {
          observe({ type: event.event, tool: event.tool, ...(event.event === 'tool.completed' && {
            ok: event.error !== true, seconds: Number.isFinite(event.duration) ? event.duration : null,
          }) }, Number.isFinite(event.timestamp) ? event.timestamp : null);
        }
      }
      if (buffer.length > 1048576) throw new Error('Hermes emitted a large event');
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
