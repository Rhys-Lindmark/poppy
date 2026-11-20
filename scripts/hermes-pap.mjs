import { createHmac, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { companyOrigin, readProposal } from '../public/commonplace-agent.mjs';
import { thumbprint, version } from '../src/protocol.mjs';
import { checkCompanySites, createPoppyClient, guestSession as createGuestSession } from '../src/poppy-client.mjs';

const publicIdentity = companyOrigin + '/poppy/hermes-agent.json';
const jwksUri = companyOrigin + '/poppy/hermes-jwks.json';
const configuration = join(homedir(), '.config/poppy');

export function hermesIdentity(privateKey) {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  const key = { privateKey, jwk, kid: thumbprint(jwk) };
  return {
    key,
    metadata: { client_id: publicIdentity, client_name: 'Poppy (Hermes)', jwks_uri: jwksUri },
    jwks: { keys: [{ ...jwk, kid: key.kid, alg: 'ES256', use: 'sig' }] },
  };
}

export function guestSession({ root, audience, subject }) {
  return createGuestSession({ root, clientId: publicIdentity, audience, subject });
}

export async function prepareGuestEdition({ identity, pairwiseKey, fetcher = fetch }) {
  const metadataStarted = Date.now() / 1000;
  const metadata = await fetcher(companyOrigin + '/.well-known/oauth-protected-resource', {
    redirect: 'error', signal: AbortSignal.timeout(6000),
  });
  await metadata.body?.cancel().catch(() => {});
  if (metadata.status !== 404) throw new Error('This tool expects the Commonplace Company to offer signed-out access.');
  const subject = createHmac('sha256', pairwiseKey).update(companyOrigin).digest('base64url');
  const headersFor = guestSession({ root: identity.key, audience: companyOrigin, subject });
  const signedRequests = [];
  const trace = [{ method: 'GET', path: '/.well-known/oauth-protected-resource', status: metadata.status,
    started_at: metadataStarted, ended_at: Date.now() / 1000 }];
  const proposal = await readProposal(companyOrigin, async (url, options) => {
    const path = new URL(url).pathname;
    const isEdition = path === '/poppy/api/edition.json';
    const headers = isEdition ? { ...options.headers, ...headersFor('GET', url) } : options.headers;
    const startedAt = Date.now() / 1000;
    const response = await fetcher(url, { ...options, headers, signal: AbortSignal.timeout(6000) });
    const received = { method: 'GET', path, status: response.status };
    trace.push({ ...received, started_at: startedAt, ended_at: Date.now() / 1000 });
    if (isEdition) signedRequests.push(received);
    return response;
  });
  if (signedRequests.length !== 1) throw new Error('The Company no longer advertises the configured edition endpoint.');
  return {
    edition: proposal.terms,
    revision: proposal.revision,
    protocol_version: version,
    client_id: identity.metadata.client_id,
    signed_requests: signedRequests,
    trace,
    approval_url: companyOrigin + '/poppy/agent?review=' + proposal.revision,
  };
}

async function readToolInput() {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 16384) throw new Error('Poppy tool input is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks));
}

async function execute(action) {
  if (action === '--check-sites') {
    const { sites } = await readToolInput();
    return { sites: await checkCompanySites(sites) };
  }
  const identity = hermesIdentity(createPrivateKey(readFileSync(join(configuration, 'pap-root.pem'))));
  if (action === '--identity') return { metadata: identity.metadata, jwks: identity.jwks };
  const pairwiseKey = readFileSync(join(configuration, 'pap-pairwise.secret'));
  if (action !== '--discover' && action !== '--read') return prepareGuestEdition({ identity, pairwiseKey });
  const { company, ...operation } = await readToolInput();
  const client = createPoppyClient({ identity, pairwiseKey });
  const result = action === '--discover' ? await client.discover(company) : await client.read(company, operation);
  return { ...result, client_id: identity.metadata.client_id, protocol_version: version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const action = process.argv[2];
    console.log(JSON.stringify(await execute(action), null, action === '--identity' ? 2 : 0));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
