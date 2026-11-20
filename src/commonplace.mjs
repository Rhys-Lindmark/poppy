import { pathToFileURL } from 'node:url';
import { editionBackup } from '../public/commonplace-client.mjs';
import { companyOrigin, readProposal } from '../public/commonplace-agent.mjs';

export async function prepareEdition({ approve, origin = companyOrigin, fetcher } = {}) {
  const { revision, terms, requests } = await readProposal(origin, fetcher);
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
