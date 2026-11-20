import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { discoverEdition, editionBackup } from '../public/commonplace-client.mjs';

const publicOrigin = 'https://ai.rhyslindmark.com';

export async function prepareEdition({ approve, origin = publicOrigin, fetcher = fetch } = {}) {
  const requests = [];
  const terms = await discoverEdition(origin, async (url) => {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json' }, redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
    requests.push({ method: 'GET', url, status: response.status });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error('Commonplace returned HTTP ' + response.status + '.');
    }
    return response.json();
  });
  const revision = createHash('sha256').update(JSON.stringify(terms)).digest('base64url');
  if (approve !== undefined && approve !== revision) {
    return { status: 'terms_changed', revision, terms, requests };
  }
  if (approve === revision) {
    return { status: 'approved', revision, terms, requests, backup: editionBackup(terms) };
  }
  return { status: 'approval_required', revision, terms, requests };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !/^--approve=[\w-]{43}$/.test(args[0]))) {
    console.error('Usage: node src/commonplace.mjs [--approve=REVISION]');
    process.exitCode = 1;
  } else {
    try {
      const result = await prepareEdition({ approve: args[0]?.slice('--approve='.length) });
      console.log(JSON.stringify(result, null, 2));
      if (result.status === 'terms_changed') process.exitCode = 2;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
