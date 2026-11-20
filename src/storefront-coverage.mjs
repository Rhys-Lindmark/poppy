import { pathToFileURL } from 'node:url';
import defaultCohort from '../data/storefront-cohort.json' with { type: 'json' };
import defaultMarket from '../data/retail-2025.json' with { type: 'json' };

const discoveryPath = '/.well-known/poppy.json';
const redirects = new Set([301, 302, 303, 307, 308]);
const maxBytes = 65536;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function isHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function readDocument(response) {
  if (!response.body) throw new Error('empty response');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw new Error('document exceeds 64 KiB');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function describe(document, host) {
  if (!isObject(document) || typeof document.protocol_version !== 'string' ||
      !/^\d+\.\d+$/.test(document.protocol_version) ||
      typeof document.organization?.name !== 'string' || !document.organization.name.trim() ||
      typeof document.organization?.domain !== 'string' || document.organization.domain.toLowerCase() !== host) {
    throw new Error('expected a version and organization bound to the responding hostname');
  }
  const version = document.protocol_version;
  const channels = [];
  if (isObject(document.web) && document.web.disabled !== true) channels.push('web');
  if (Array.isArray(document.apis)) {
    for (const api of document.apis) {
      if (typeof api?.type === 'string' && isHttps(api.url)) channels.push(api.type);
    }
  }
  if (Array.isArray(document.agent?.protocols) &&
      document.agent.protocols.some((item) => typeof item?.type === 'string' && isHttps(item.endpoint))) {
    channels.push('company-agent');
  }
  if (!channels.length && version.startsWith('1.')) throw new Error('v1 discovery requires at least one usable channel');
  return {
    version, organization: document.organization.name.trim().slice(0, 100),
    channels: [...new Set(channels)].sort(),
    extensions: isObject(document.extensions) ? Object.keys(document.extensions).slice(0, 30).sort() : [],
    signIn: document.auth?.disabled === true ? 'disabled' : 'untested',
  };
}

export async function probeStore(store, fetcher = fetch) {
  let url = new URL('https://' + store.host + discoveryPath);
  const allowedHosts = new Set([store.host, ...store.aliases]);
  const evidence = [];
  const outcome = (state, details = {}) => ({
    name: store.name, host: store.host, group: store.group, state,
    discovery: evidence, ...details,
  });

  for (let visit = 0; visit < 5; visit += 1) {
    let response;
    try {
      response = await fetcher(url.href, {
        redirect: 'manual', headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      return outcome('unreachable');
    }
    evidence.push({ url: url.href, status: response.status });
    if (redirects.has(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      let destination;
      try { destination = new URL(location || 'invalid', url); } catch { return outcome('redirect_unverified'); }
      if (destination.protocol !== 'https:' || destination.port || destination.username || destination.password ||
          !allowedHosts.has(destination.hostname) || destination.pathname !== discoveryPath || destination.search || destination.hash) {
        return outcome('redirect_unverified');
      }
      url = destination;
      continue;
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 404) return outcome('absent');
      return outcome('unreachable');
    }
    if (!/^application\/(?:json|[\w.+-]+\+json)(?:;|$)/i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel().catch(() => {});
      return outcome('invalid', { reason: 'HTTP 200 response was not JSON' });
    }
    try {
      const document = await readDocument(response);
      return outcome('published', describe(document, url.host));
    } catch (error) {
      return outcome('invalid', { reason: error instanceof SyntaxError ? 'response was not valid JSON' : error.message });
    }
  }
  return outcome('redirect_unverified', { reason: 'redirect limit' });
}

export function summarizeCoverage(results, market = defaultMarket) {
  const share = (billions) => Number((100 * billions / market.marketBillions).toFixed(2));
  const direct = market.retailers.filter(({ name }) => name !== 'Shopify merchants');
  const weighted = new Map(direct.map((item) => [item.name, item]));
  const counted = results.filter(({ name }) => weighted.has(name));
  const sum = (items) => Number(items.reduce((total, { name }) => total + weighted.get(name).billions, 0).toFixed(3));
  const totals = {};
  for (const state of ['published', 'absent', 'invalid', 'unreachable', 'redirect_unverified']) {
    const found = results.filter((result) => result.state === state);
    totals[state] = { count: found.length, weightedStores: found.filter(({ name }) => weighted.has(name)).length };
  }
  const observed = sum(counted);
  const missing = sum(counted.filter(({ state }) => state === 'absent'));
  const published = sum(counted.filter(({ state }) => state === 'published'));
  const platform = market.retailers.find(({ name }) => name === 'Shopify merchants');
  return {
    totals, denominatorBillions: market.marketBillions,
    namedMerchantSalesMeasured: { billions: observed, sharePercent: share(observed) },
    namedMerchantSalesWithPublicDiscovery: { billions: published, sharePercent: share(published) },
    namedMerchantSalesReturning404: { billions: missing, sharePercent: share(missing) },
    platformProxy: platform ? { ...platform, sharePercent: share(platform.billions) } : null,
  };
}

export async function scanCohort({ cohort = defaultCohort, market = defaultMarket, fetcher = fetch, date = new Date() } = {}) {
  const results = Array(cohort.stores.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, results.length) }, async () => {
    while (next < results.length) {
      const index = next++;
      results[index] = await probeStore(cohort.stores[index], fetcher);
    }
  }));
  return {
    checkedAt: date.toISOString(), market: market.market, marketSource: market.marketSource,
    cohortSource: cohort.source, directory: cohort.directory, groups: cohort.groups,
    summary: summarizeCoverage(results, market), stores: results,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await scanCohort(), null, 2));
}
