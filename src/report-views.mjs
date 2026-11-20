import market from '../data/retail-2025.json' with { type: 'json' };
import scan from '../data/storefront-results.json' with { type: 'json' };

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const observedStates = {
  published: 'Published',
  absent: '404',
  invalid: 'Invalid document',
  unreachable: 'Unreachable',
  redirect_unverified: 'Unverified redirect',
};

function storeObservation(store) {
  const state = observedStates[store.state];
  return store.version ? state + ' ' + store.version : state;
}

export function coverageMarkup(resultsPath) {
  const escape = escapeHtml;
  const byName = new Map(scan.stores.map((store) => [store.name, store]));
  const directory = scan.directory;
  const number = (value) => value.toLocaleString('en-US');
  const platforms = Object.entries(directory.platformDomains)
    .map(([name, count]) => number(count) + ' on ' + escape(name)).join(' and ');
  const dollars = (amount) => '$' + amount.toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'B';
  const { denominatorBillions, namedMerchantSalesWithPublicDiscovery: covered,
    namedMerchantSalesReturning404: missing, platformProxy, totals } = scan.summary;
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'America/Los_Angeles' })
    .format(new Date(scan.checkedAt));
  const tradeRows = market.retailers.map((retailer) => {
    const share = (retailer.billions / denominatorBillions * 100).toFixed(1);
    const discovery = byName.has(retailer.name) ? storeObservation(byName.get(retailer.name)) : retailer.discovery;
    return '<tr><th scope="row"><a href="' + escape(retailer.source) + '">' + escape(retailer.name) + '</a></th>' +
      '<td><strong>' + escape(retailer.display) + '</strong> (' + share + '%)' +
      '<meter min="0" max="100" value="' + share + '" aria-label="' + escape(retailer.name + ' share') + '"></meter>' +
      '<small>' + escape(retailer.basis) + '</small></td><td>' + escape(discovery) + '</td></tr>';
  }).join('');
  const cohortRows = scan.stores.map((store) => {
    const response = store.discovery.at(-1);
    return '<tr><th scope="row">' + escape(store.name) + '</th><td>' +
      (response ? '<a href="' + escape(response.url) + '">' + escape(storeObservation(store)) + '</a>' :
        escape(storeObservation(store))) + '</td><td>' +
      escape(store.channels?.join(', ') || '—') + '</td></tr>';
  }).join('');

  return '<h1>Ecommerce sales coverage</h1><p>' + escape(market.market) +
    ', approximately $1.25T. <a href="' + escape(market.marketSource) + '">Census data</a></p>' +
    '<section><h2>Observed discovery and sales</h2><dl>' +
    '<dt>Storefronts publishing</dt><dd>' + totals.published.count + ' of ' + scan.stores.length + ' checked</dd>' +
    '<dt>Estimated sales at publishing merchants with a measured weight</dt><dd>' +
    dollars(covered.billions) + ' (' + covered.sharePercent + '%)</dd>' +
    '<dt>Estimated sales at merchants whose discovery URL returned 404</dt><dd>' +
    dollars(missing.billions) + ' (' + missing.sharePercent + '%)</dd>' +
    '<dt>Shopify rollout proxy</dt><dd>About ' + dollars(platformProxy.billions) + ' (' + platformProxy.sharePercent +
    '%), based on reported platform share</dd></dl>' +
    '<p class="muted">The named-store cohort is purposive. Shopify’s estimate uses reported rollout and market share. ' +
    'The figures describe sales at these sites and public discovery. Live sessions and Poppy-initiated purchases have their own evidence requirements.</p>' +
    '<table class="coverage"><caption>Sales weights</caption><thead><tr><th scope="col">Retailer or platform</th>' +
    '<th scope="col">Online sales</th><th scope="col">Public discovery</th></tr></thead><tbody>' + tradeRows +
    '</tbody></table></section><section><h2>Directory count</h2><p><strong>' +
    number(directory.publishingDomains) + ' publishing domains</strong> in PAP Checker’s directory on <time datetime="' +
    escape(directory.observedOn) + '">' + escape(directory.observedOn) + '</time>, including ' + platforms +
    '. The directory includes websites and storefronts. <a href="' + escape(directory.source) +
    '">PAP Checker directory</a></p></section><section><h2>Storefront checks</h2><table class="coverage">' +
    '<caption>Public GET requests on <time datetime="' + escape(scan.checkedAt) + '">' + escape(date) + '</time>.</caption>' +
    '<thead><tr><th scope="col">Store</th><th scope="col">Discovery</th><th scope="col">Advertised channels</th></tr></thead>' +
    '<tbody>' + cohortRows + '</tbody></table><p class="note"><a href="' + escape(resultsPath) +
    '">Download the observations as JSON</a>.</p></section>';
}

const resultLabels = {
  pass: 'Pass', fail: 'Fail', unsupported: 'Version unsupported', unavailable: 'Unavailable',
  untested: 'Untested', vendor_claim: 'Vendor report', metadata_pass: 'Published identity passed',
};

export function poppyvalMarkup(evidence) {
  const escape = escapeHtml;
  const { clients, personalAgents, companies, checkedOn } = evidence.interoperability;
  const productRows = personalAgents.map(({ name, status, evidence, source }) =>
    '<tr><th scope="row">' + escape(name) + '</th><td>' + resultLabels[status] + '</td><td>' +
      escape(evidence) + ' <a href="' + escape(source) + '">Source</a></td></tr>').join('');
  const clientRows = clients.flatMap(({ name, build, supports, source, checks }) =>
    checks.map(({ requirement, version, outcome, evidence, evidenceSource }) =>
      '<tr><th scope="row"><a href="' + escape(source) + '">' + escape(name) + '</a> ' +
        escape([build, supports].filter(Boolean).join(' · ')) + '</th><td>' + escape(requirement) +
        ' · ' + escape(version) + '</td><td>' + resultLabels[outcome] + '</td><td>' + escape(evidence) +
        (evidenceSource ? ' <a href="' + escape(evidenceSource) + '">Specification</a>' : '') + '</td></tr>')).join('');
  const companyResults = companies.map((company) => {
    const passed = company.discoveryAndOpenApi.filter(({ outcome }) => outcome === 'pass').length;
    const skipped = company.discoveryAndOpenApi.filter(({ outcome }) => outcome === 'skip').length;
    const failures = company.discoveryAndOpenApi.filter(({ outcome }) => outcome === 'fail').length;
    return '<li><strong>' + escape(company.name) + ' ' + escape(company.version) + '</strong>. ' +
      passed + ' passed, ' + failures + ' failed, and ' + skipped + ' skipped for discovery and OpenAPI. ' +
      'Signed session ' + resultLabels[company.signedSession].toLowerCase() + '. ' +
      'Direct Sign-In and Operations approval ' + resultLabels[company.directSignIn].toLowerCase() + '. ' +
      '<a href="' + escape(company.manifest) + '">Manifest</a> · <a href="' + escape(company.source) +
      '">Official Company validator</a>' +
      (company.independentValidation ? ' · <a href="' + escape(company.independentValidation.source) +
        '">Poppy Demo Agent validator</a> also passed discovery.' : '') + '</li>';
  }).join('');

  return '<h1>PoppyVal</h1><p>Versioned capability results for Personal Agents and Companies.</p>' +
    '<section><h2>Bundled Poppy 1.0 HTTPS sandbox</h2><ul>' +
    evidence.checks.map(({ check, outcome }) => '<li>' + escape(check) + ' · ' + resultLabels[outcome] + '</li>').join('') +
    '</ul><p><a href="protocol-trace.html">Recorded delivery workflow</a></p></section>' +
    '<section><h2>Independent client checks</h2><p>Observed <time datetime="' + escape(checkedOn) + '">' +
    escape(checkedOn) + '</time>. These runs exercised discovery.</p><table class="coverage">' +
    '<thead><tr><th scope="col">Client and version</th><th scope="col">Check and Company version</th>' +
    '<th scope="col">Result</th><th scope="col">Evidence</th></tr></thead><tbody>' + clientRows +
    '</tbody></table></section><section><h2>Personal Agent products</h2><table class="coverage"><thead><tr>' +
    '<th scope="col">Agent</th><th scope="col">Status</th><th scope="col">Evidence</th></tr></thead><tbody>' +
    productRows + '</tbody></table></section><section><h2>Companies</h2><ul>' + companyResults +
    '</ul><p><a href="coverage.html">All storefront checks and related sales</a></p></section>' +
    '<p><a href="poppyval.json">Download machine-readable results</a></p>';
}
