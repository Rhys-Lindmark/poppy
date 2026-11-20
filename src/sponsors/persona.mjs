export function createPersona({ key, template, call }) {
  if (!key && !template) return null;
  if (!key?.startsWith('persona_sandbox_') || !/^itmpl_[\w-]+$/.test(template || '')) {
    throw new Error('Persona requires a sandbox API key and an inquiry template ID.');
  }
  const base = 'https://api.withpersona.com/api/v1/inquiries';
  const headers = { Authorization: 'Bearer ' + key, 'Persona-Version': '2026-09-29' };

  return {
    async create(reference) {
      const inquiry = await call('Persona', base, {
        headers: { ...headers, 'Idempotency-Key': reference },
        body: { data: { attributes: { 'inquiry-template-id': template, 'reference-id': reference } } },
      });
      const id = inquiry.data?.id;
      if (typeof id !== 'string' || !/^inq_[\w-]+$/.test(id)) throw new Error('Persona did not return an inquiry ID.');
      const link = await call('Persona', base + '/' + id + '/generate-one-time-link', {
        headers: { ...headers, 'Idempotency-Key': reference + '-link' }, body: {},
      });
      const url = new URL(link.meta?.['one-time-link'] || 'https://invalid.example');
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.withpersona.com') || url.username || url.password || url.port) {
        throw new Error('Persona did not return a valid hosted verification link.');
      }
      return { id, url: url.href, reference };
    },
    async status({ id, reference }) {
      const inquiry = await call('Persona', base + '/' + id, { headers });
      const attributes = inquiry.data?.attributes;
      if (inquiry.data?.id !== id || attributes?.['reference-id'] !== reference) {
        throw new Error('Persona returned a different inquiry.');
      }
      return attributes.status;
    },
  };
}
