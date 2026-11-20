import { createHmac, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { companyOrigin, readProposal } from '../public/commonplace-agent.mjs';
import { keyPair, now, randomId, requestUrl, signJwt, thumbprint, version } from '../src/protocol.mjs';

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
  const iat = now();
  const delegated = keyPair();
  const sid = randomId();
  const delegation = signJwt(root, 'poppy-delegation+jwt', {
    iss: publicIdentity, cnf: { jwk: delegated.jwk }, iat, exp: iat + 600, jti: randomId(),
  });
  return (method, url) => ({
    'Poppy-Session': signJwt(delegated, 'poppy-session+jwt', {
      iss: publicIdentity, aud: audience, sub: subject, sid,
      htm: method, htu: requestUrl(url), iat: now(), jti: randomId(),
    }, { poppy_dlg: delegation }),
    'Poppy-Version': version,
  });
}

export async function prepareGuestEdition({ identity, pairwiseKey, fetcher = fetch }) {
  const metadata = await fetcher(companyOrigin + '/.well-known/oauth-protected-resource', {
    redirect: 'error', signal: AbortSignal.timeout(6000),
  });
  await metadata.body?.cancel().catch(() => {});
  if (metadata.status !== 404) throw new Error('This tool expects the Commonplace Company to offer signed-out access.');
  const subject = createHmac('sha256', pairwiseKey).update(companyOrigin).digest('base64url');
  const headersFor = guestSession({ root: identity.key, audience: companyOrigin, subject });
  const signedRequests = [];
  const proposal = await readProposal(companyOrigin, async (url, options) => {
    const path = new URL(url).pathname;
    const isEdition = path === '/poppy/api/edition.json';
    const headers = isEdition ? { ...options.headers, ...headersFor('GET', url) } : options.headers;
    const response = await fetcher(url, { ...options, headers, signal: AbortSignal.timeout(6000) });
    if (isEdition) signedRequests.push({ method: 'GET', path, status: response.status });
    return response;
  });
  if (signedRequests.length !== 1) throw new Error('The Company no longer advertises the configured edition endpoint.');
  return {
    edition: proposal.terms,
    revision: proposal.revision,
    protocol_version: version,
    client_id: identity.metadata.client_id,
    signed_requests: signedRequests,
    approval_url: companyOrigin + '/poppy/agent?review=' + proposal.revision,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const identity = hermesIdentity(createPrivateKey(readFileSync(join(configuration, 'pap-root.pem'))));
    if (process.argv[2] === '--identity') {
      console.log(JSON.stringify({ metadata: identity.metadata, jwks: identity.jwks }, null, 2));
    } else {
      const result = await prepareGuestEdition({
        identity, pairwiseKey: readFileSync(join(configuration, 'pap-pairwise.secret')),
      });
      console.log(JSON.stringify(result));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
