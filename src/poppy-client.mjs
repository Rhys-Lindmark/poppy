import { createHmac } from 'node:crypto';
import { keyPair, now, randomId, requestUrl, signJwt, version, wellKnown } from './protocol.mjs';
import { poppyHttps, publicUrl } from './poppy-https.mjs';

const resourceMetadata = '/.well-known/oauth-protected-resource';
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const protocolVersion = /^\d{1,5}\.\d{1,5}$/;
const fields = (obj) => Object.entries(obj ?? {});

export function guestSession({ root, clientId, audience, subject }) {
  const iat = now();
  const delegated = keyPair();
  const sid = randomId();
  const delegation = signJwt(root, 'poppy-delegation+jwt', {
    iss: clientId, cnf: { jwk: delegated.jwk }, iat, exp: iat + 600, jti: randomId(),
  });
  return (method, url) => ({
    'Poppy-Session': signJwt(delegated, 'poppy-session+jwt', {
      iss: clientId, aud: audience, sub: subject, sid,
      htm: method, htu: requestUrl(url), iat: now(), jti: randomId(),
    }, { poppy_dlg: delegation }),
    'Poppy-Version': version,
  });
}

function json(result, description) {
  if (result.status !== 200) throw new Error(description + ' returned HTTP ' + result.status + '.');
  try {
    const value = JSON.parse(result.text);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* Report a fixed error without reflecting Company text. */ }
  throw new Error(description + ' did not return a JSON object.');
}

async function discoverManifest(company, get) {
  let url = new URL(wellKnown, company);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const result = await get(url.href);
    if (redirectStatuses.has(result.status) && redirects < 5) {
      url = publicUrl(result.headers.location, url);
      continue;
    }
    if (url.pathname !== wellKnown || url.search) throw new Error('Discovery must end at the Company’s well-known URL.');
    const manifest = json(result, 'Poppy discovery');
    if (manifest.organization?.domain !== url.hostname || !protocolVersion.test(manifest.protocol_version ?? '')) {
      throw new Error('The discovery document does not match the serving domain or declare a valid version.');
    }
    return { origin: url.origin, manifest };
  }
  throw new Error('Too many discovery redirects.');
}

function issuerUrl(value) {
  const url = publicUrl(value);
  if (url.search) throw new Error('Invalid OAuth issuer.');
  return url;
}

async function companyIdentifier(origin, manifest, get) {
  const result = await get(origin + resourceMetadata);
  let servers = [];
  if (result.status !== 404) {
    const metadata = json(result, 'Protected resource metadata');
    servers = metadata.authorization_servers ?? [];
    if (metadata.resource !== origin || !Array.isArray(servers)) throw new Error('Invalid protected resource metadata.');
    servers.forEach(issuerUrl);
  }
  const hint = manifest.auth?.issuer;
  if (!servers.length) {
    if (hint !== undefined || (manifest.auth?.disabled !== true && Object.keys(manifest.auth?.scopes ?? {}).length)) {
      throw new Error('The Company advertises account access without a verified issuer.');
    }
    return null;
  }
  const issuer = servers.length === 1 ? servers[0] : hint;
  if (!servers.includes(issuer) || (hint !== undefined && hint !== issuer)) throw new Error('The Company issuer does not match its metadata.');
  const url = issuerUrl(issuer);
  const path = url.pathname === '/' ? '' : url.pathname;
  const metadata = json(await get(url.origin + '/.well-known/oauth-authorization-server' + path), 'Authorization server metadata');
  if (metadata.issuer !== issuer || !Array.isArray(metadata.protected_resources) ||
      !metadata.protected_resources.some((resource) => typeof resource === 'string' &&
        resource.toLowerCase() === origin)) {
    throw new Error('The authorization server did not confirm the Company domain.');
  }
  return issuer;
}

async function discoverCompany(company, get) {
  const { origin, manifest } = await discoverManifest(company, get);
  const major = version.split('.')[0];
  const offered = [manifest.protocol_version, ...Object.keys(manifest.supported_versions ?? {})]
    .filter((value) => protocolVersion.test(value) && value.split('.')[0] === major)
    .sort((a, b) => Number(b.split('.')[1]) - Number(a.split('.')[1]))[0];
  if (!offered) throw new Error('The Company does not advertise a compatible Poppy version.');
  let selected = manifest;
  if (offered !== manifest.protocol_version) {
    const url = publicUrl(manifest.supported_versions[offered]);
    if (url.origin !== origin) throw new Error('An alternate discovery document must use the same Company host.');
    selected = json(await get(url.href), 'Alternate Poppy discovery');
    if (selected.protocol_version !== offered || selected.organization?.domain !== manifest.organization.domain ||
        selected.supported_versions !== undefined) {
      throw new Error('The alternate discovery document does not match the Company or its advertised version.');
    }
  }
  const issuer = await companyIdentifier(origin, selected, get);
  if (manifest.auth?.issuer !== undefined && manifest.auth.issuer !== issuer) {
    throw new Error('Poppy discovery documents disagree on the Company issuer.');
  }
  return { origin, issuer, identifier: issuer ?? origin, manifest: selected };
}

function parameter(document, definition) {
  if (!definition?.$ref) return definition;
  const match = /^#\/components\/parameters\/([^/]+)$/.exec(definition.$ref);
  return match ? document.components?.parameters?.[match[1].replaceAll('~1', '/').replaceAll('~0', '~')] : null;
}

function operationServer(document, pathItem, operation, api) {
  const choices = operation.servers ?? pathItem.servers ?? document.servers;
  const server = choices?.[0];
  if (!server) return publicUrl('/', api);
  if (typeof server.url !== 'string') throw new Error('The OpenAPI server has no URL.');
  const url = server.url.replace(/\{([^{}]+)\}/g, (_match, key) => {
    const value = server.variables?.[key]?.default;
    if (typeof value !== 'string') throw new Error('The OpenAPI server variable has no default.');
    return value;
  });
  const base = publicUrl(url, api);
  if (base.search) throw new Error('The OpenAPI server URL contains a query.');
  return base;
}

function openApiOperations(document, api) {
  if (!/^3\.\d+\.\d+/.test(document.openapi ?? '')) throw new Error('The Company did not serve a supported OpenAPI 3 JSON description.');
  const result = [];
  for (const [path, pathItem] of fields(document.paths)) {
    const operation = pathItem?.get;
    if (!operation || !path.startsWith('/') || path.startsWith('//') || /[?#\\]/.test(path)) continue;
    const declarations = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]
      .map((item) => parameter(document, item))
      .filter((item) => !(item?.in === 'header' &&
        (/^poppy-(?:version|session)$/i.test(item.name) || !item.required)));
    if (declarations.some((item) => !item || item.$ref || !['path', 'query'].includes(item.in) ||
        typeof item.name !== 'string' || item.content || (item.style && !['simple', 'form'].includes(item.style)))) continue;
    const parameters = new Map(declarations.map((item) => [item.in + ':' + item.name, item]));
    const id = typeof operation.operationId === 'string' && operation.operationId.length <= 160
      ? operation.operationId : 'GET ' + path;
    result.push({
      id, api, path, operation, parameters: [...parameters.values()],
      base: () => operationServer(document, pathItem, operation, api),
    });
  }
  return result;
}

function buildOperationUrl(operation, pathValues, queryValues) {
  const base = operation.base();
  const declared = new Set(operation.parameters.map(({ in: loc, name }) => loc + ':' + name));
  const values = { path: pathValues, query: queryValues };
  for (const [loc, supplied] of fields(values)) {
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied) ||
        Object.keys(supplied).some((name) => !declared.has(loc + ':' + name))) {
      throw new Error('Supply only path and query parameters advertised for this operation.');
    }
  }
  let path = operation.path;
  for (const { name, in: loc, required } of operation.parameters) {
    const supplied = values[loc];
    const value = Object.hasOwn(supplied, name) ? supplied[name] : undefined;
    if (value === undefined && loc === 'query' && !required) continue;
    if (!['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 1000) {
      throw new Error('Supply the operation’s required parameters as simple values.');
    }
    if (loc === 'path') {
      if (!String(value) || /^(?:\.|\.\.)$|[/\\%]/.test(String(value))) throw new Error('Invalid OpenAPI path parameter.');
      path = path.replaceAll('{' + name + '}', encodeURIComponent(String(value)));
    } else {
      base.searchParams.append(name, String(value));
    }
  }
  if (/[{}]/.test(path) || path.split('/').some((part) => /^(?:\.|%2e){1,2}$/i.test(part))) {
    throw new Error('The OpenAPI path could not be resolved safely.');
  }
  base.pathname = base.pathname.replace(/\/$/, '') + path;
  return publicUrl(base.href);
}

function describe({ origin, issuer, identifier, manifest }) {
  return {
    origin, identifier, version: manifest.protocol_version,
    api_types: [...new Set((manifest.apis ?? []).map(({ type }) => type).filter((type) => typeof type === 'string'))],
    company_agent: Boolean(manifest.agent?.protocols?.length),
    browser_session: Boolean(manifest.web?.browser_session_endpoint),
    sign_in: Boolean(issuer && manifest.auth?.disabled !== true),
  };
}

export function createPoppyClient({ identity, pairwiseKey, transport = poppyHttps }) {
  function task() {
    const trace = [];
    const signal = AbortSignal.timeout(22000);
    const get = async (href, headers = {}, tracePath) => {
      const url = publicUrl(href);
      const started_at = Date.now() / 1000;
      const result = await transport(url.href, { headers, signal });
      trace.push({ method: 'GET', host: url.host, path: tracePath ?? url.pathname, status: result.status,
        started_at, ended_at: Date.now() / 1000, signed: Boolean(headers['Poppy-Session']) });
      return result;
    };
    return { get, trace };
  }

  async function resolve(company, get, selectedApi) {
    const info = await discoverCompany(publicUrl(company).origin, get);
    const operations = [];
    const unavailable = [];
    for (const api of (info.manifest.apis ?? []).filter(({ type, url }) => type === 'openapi' && (!selectedApi || selectedApi === url)).slice(0, 6)) {
      try {
        const url = publicUrl(api.url).href;
        operations.push(...openApiOperations(json(await get(url), 'OpenAPI description'), url));
      } catch { unavailable.push('An advertised OpenAPI description could not be used.'); }
    }
    return { info, operations, unavailable };
  }

  return {
    async discover(company) {
      const { get, trace } = task();
      const { info, operations, unavailable } = await resolve(company, get);
      return {
        company: describe(info), trace, unavailable,
        operations: operations.slice(0, 120).map(({ id, operation, api, parameters }) => ({
          id, api, method: 'GET', summary: typeof operation.summary === 'string' ? operation.summary.slice(0, 240) : undefined,
          parameters: parameters.map(({ name, in: location, required, schema, example }) => ({
            name, location, required: location === 'path' || required === true, type: schema?.type,
            ...(typeof example === 'string' && example.length <= 100 && { example }),
          })),
        })),
        more_operations: operations.length > 120,
      };
    },
    async read(company, { id, api, path = {}, query = {} }) {
      const { get, trace } = task();
      let resolved = await resolve(company, get, api);
      const send = async ({ info, operations }) => {
        const matching = operations.filter((operation) => operation.id === id);
        if (matching.length !== 1) throw new Error('Choose one advertised read operation. Specify its OpenAPI URL if the operation ID is ambiguous.');
        const url = buildOperationUrl(matching[0], path, query);
        const subject = createHmac('sha256', pairwiseKey).update(info.identifier).digest('base64url');
        const headers = guestSession({ root: identity.key, clientId: identity.metadata.client_id, audience: info.identifier, subject })('GET', url.href);
        const result = await get(url.href, headers, matching[0].path);
        let data;
        try { data = JSON.parse(result.text.replaceAll(headers['Poppy-Session'], '[omitted]')); } catch { /* Keep non-JSON responses out of the tool output. */ }
        const authRequired = result.status === 401 ||
          (result.status === 403 && /\binsufficient_scope\b/.test(result.headers['www-authenticate'] ?? ''));
        return { status: result.status, data, authRequired };
      };
      let result = await send(resolved);
      if (result.status === 400 && result.data?.error === 'session_ended') result = await send(resolved);
      else if (result.status === 400 && result.data?.error === 'version_unsupported') {
        const previous = resolved.info;
        const current = await resolve(company, get, api);
        if (previous.identifier === current.info.identifier &&
            previous.manifest.protocol_version !== current.info.manifest.protocol_version) {
          resolved = current;
          result = await send(resolved);
        }
      }
      return {
        company: describe(resolved.info),
        operation: id, status: result.status, trace,
        ...(result.authRequired ? { requires_sign_in: true } : {}),
        ...((result.data === undefined || JSON.stringify(result.data).length > 32000)
          ? { response_omitted: 'The response was not a small JSON document.' } : { data: result.data }),
      };
    },
  };
}
