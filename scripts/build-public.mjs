import { mkdirSync, readFileSync, writeFileSync, copyFileSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import edition from '../data/commonplace-edition.json' with { type: 'json' };
import storeResults from '../data/storefront-results.json' with { type: 'json' };
import { coverageMarkup, escapeHtml as escape, poppyvalMarkup, reportHeading } from '../src/report-views.mjs';
import { traceTable } from '../src/views.mjs';
import { buildCookbooks } from './build-cookbooks.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] || 'dist');
const site = join(output, 'poppy');
for (const folder of [site, join(site, 'api'), join(site, 'cookbooks'), join(output, '.well-known')]) {
  mkdirSync(folder, { recursive: true });
}
const write = (path, value) => writeFileSync(join(site, path), value);
const json = (path, value) => write(path, JSON.stringify(value, null, 2) + '\n');
const siteOrigin = 'https://ai.rhyslindmark.com';
const route = '/poppy';
const protocolDocs = 'https://personalagentprotocol.org/docs/introduction';
const links = [
  ['/cookbooks/', 'Cookbooks'],
  ['/protocol-trace', 'Delivery trace'], ['/coverage', 'Sales coverage'],
  ['/poppyval', 'PoppyVal'], ['/sponsors', 'Sponsors'],
];
const currentPage = (isCurrent) => isCurrent ? ' aria-current="page"' : '';
function page(title, body, { head = '', bodyClass = 'site-report', active } = {}) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="description" content="Poppy Personal Agent Protocol demo with Commonplace."><title>' +
    escape(title) + '</title><link rel="stylesheet" href="' + route + '/styles.css">' +
    '<link rel="stylesheet" href="' + route + '/branding.css">' + head +
    '</head><body class="poppy-site ' + escape(bodyClass) + '">' +
    '<a class="site-skip" href="#main">Skip to content</a><header class="site-masthead"><div class="site-wrap">' +
    '<a class="site-brand" href="' + route + '/"' + currentPage(active === '/') + '>Personal Agent Protocol</a>' +
    '<nav class="site-navigation" aria-label="Main">' +
    links.map(([href, label]) => '<a href="' + route + href + '"' + currentPage(href === active) + '>' + label + '</a>').join('') +
    '</nav><a class="site-docs site-button" href="' + protocolDocs + '">Read the docs</a></div></header>' +
    '<main id="main" tabindex="-1">' + body + '</main><footer class="site-footer"><div class="site-wrap">' +
    '<span>Poppy hackathon demo</span><div><a href="https://personalagentprotocol.org/">Official protocol site</a>' +
    '<a href="https://github.com/Rhys-Lindmark/poppy">GitHub</a></div></div></footer></body></html>\n';
}

const discovery = {
  protocol_version: '1.0',
  organization: { name: 'Commonplace', domain: 'ai.rhyslindmark.com' },
  auth: { disabled: true },
  apis: [{ type: 'openapi', url: siteOrigin + route + '/openapi.json', description: 'Discover a sample Commonplace reading edition' }],
  web: {},
};
writeFileSync(join(output, '.well-known/poppy.json'), JSON.stringify(discovery, null, 2) + '\n');
json('openapi.json', {
  openapi: '3.1.0', info: { title: 'Commonplace edition catalog', version: '1.0.0' },
  servers: [{ url: siteOrigin }],
  paths: { [route + '/api/edition.json']: { get: { operationId: 'getCommonplaceEdition',
    summary: 'Read the public terms and source selections for a Commonplace edition',
    responses: { 200: { description: 'Commonplace reading edition' } },
  } } },
});
json('api/edition.json', edition);

write('index.html', page('Personal Agent Protocol demo',
  '<section class="brand-hero" aria-labelledby="protocol"><div class="site-wrap"><h1 id="protocol">Personal Agent Protocol</h1>' +
  '<p class="brand-intro">An open protocol for every company and every personal agent.</p>' +
  '<div class="site-links"><a class="site-button" href="#commonplace-demo">Try the Commonplace demo</a>' +
  '<a href="/poppy/cookbooks/">Browse the cookbooks</a></div></div></section>' +
  '<section class="site-band" id="commonplace-demo" aria-labelledby="commonplace-title"><div class="site-wrap site-demo-layout">' +
  '<div><h2 id="commonplace-title">Commonplace store demo</h2><p>Prepare a reading edition from the ' +
  '<a href="/commonplace/">Commonplace store</a>.</p><button class="primary" id="start">Find an edition</button>' +
  '<p id="status" role="status"></p><section id="review" hidden><h3 id="edition-title"></h3><p id="terms"></p>' +
  '<details><summary>Quotation sources</summary><ul id="edition-sources"></ul></details>' +
  '<p><button class="primary" id="approve">Approve and download edition</button></p>' +
  '<p>In <a href="/commonplace/">Commonplace</a>, choose Restore and select the downloaded file. Commonplace downloads a backup of your current collection before replacing it.</p>' +
  '</section></div><div class="site-demo-requests"><h3>Store requests</h3>' +
  '<table><thead><tr><th scope="col">Request</th><th scope="col">HTTP</th></tr></thead>' +
  '<tbody id="trace-body"><tr><td colspan="2">Find an edition to see the requests.</td></tr></tbody></table>' +
  '<p class="note"><a href="/.well-known/poppy.json">Discovery document</a></p></div></div></section>' +
  '<section class="site-band site-band-soft"><div class="site-wrap"><h2>Run the signed sandbox</h2>' +
  '<p>The local HTTPS sandbox includes delegated Session signing, Direct Sign-In, and approval of the delivery change.</p>' +
  '<div class="site-links"><a class="site-button" href="/poppy/protocol-trace#replay">Replay a recorded run</a>' +
  '<a href="/poppy/source.tar.gz">Download the source</a></div></div></section>',
  { head: '<script type="module" src="/poppy/commonplace-demo.mjs"></script>', bodyClass: 'poppy-home', active: '/' }));

buildCookbooks({ repo, route, write, page });

json('storefront-results.json', storeResults);
write('coverage.html', page('Ecommerce sales coverage',
  coverageMarkup('/poppy/storefront-results.json'), { active: '/coverage' }));

const evidence = JSON.parse(execFileSync(process.execPath, [join(repo, 'src/poppyval.mjs')], { encoding: 'utf8', timeout: 10000 }));
json('poppyval.json', evidence);
write('poppyval.html', page('PoppyVal', poppyvalMarkup(evidence), { active: '/poppyval' }));

const trace = JSON.parse(execFileSync(process.execPath, [join(repo, 'scripts/capture-delivery-trace.mjs')], {
  encoding: 'utf8', timeout: 10000,
}));
json('delivery-trace.json', trace);
write('protocol-trace.html', page('Delivery rescheduling trace',
  reportHeading('Delivery rescheduling trace', 'The seeded Demo Store moved the order from Friday to ' +
    escape(trace.outcome) + ' after scoped sign-in and approval. This redacted trace was captured over local HTTPS.') +
  '<section id="replay" data-delivery-replay aria-labelledby="replay-title"><h2 id="replay-title">Replay the delivery change</h2>' +
  '<div data-replay-controls hidden><button type="button" class="primary" data-replay-start>Start replay</button>' +
  '<div class="actions" data-replay-navigation hidden>' +
  '<button type="button" data-replay-previous>Previous request</button>' +
  '<button type="button" class="primary" data-replay-next>Next request</button>' +
  '<button type="button" data-replay-restart>Start over</button>' +
  '<button type="button" data-replay-all>Show all requests</button></div>' +
  '<p role="status"></p></div>' +
  traceTable(trace.requests) + '</section>' +
  '<p><a href="delivery-trace.json">Download the request trace</a></p>' +
  '<p><a href="/poppy/cookbooks/delivery-approval.html">Run the scenario locally</a></p>',
  { head: '<script type="module" src="/poppy/trace-replay.mjs"></script>', active: '/protocol-trace' }));

const sponsors = readFileSync(join(repo, 'docs/sponsors.md'), 'utf8');
const sponsorRows = [...sponsors.matchAll(/^\| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)].slice(2);
if (sponsorRows.length !== 11) throw new Error('Expected 11 sponsor integrations');
write('sponsors.html', page('Hackathon sponsors',
  reportHeading('Hackathon sponsors', 'Starter integrations for the local signed sandbox. Live vendor verification requires authorized projects.') +
  '<table class="coverage"><thead><tr><th scope="col">Sponsor</th><th scope="col">Integration</th></tr></thead><tbody>' +
  sponsorRows.map(([, name, integration]) => '<tr><th scope="row">' + escape(name) + '</th><td>' +
    escape(integration) + '</td></tr>').join('') + '</tbody></table>' +
  '<p class="note"><a href="/poppy/sponsors.md">Setup instructions</a></p>', { active: '/sponsors' }));
write('sponsors.md', sponsors);

for (const name of ['styles.css', 'tokens.css', 'branding.css', 'commonplace-demo.mjs', 'commonplace-client.mjs',
  'cookbooks.css', 'cookbooks.mjs', 'trace-replay.mjs']) {
  const path = join(repo, 'public', name);
  if (name === 'styles.css') {
    write(name, readFileSync(path, 'utf8').replace('url("/tokens.css")', 'url("/poppy/tokens.css")') +
      '\n#status { margin-block: 0.7rem; }\n');
  } else copyFileSync(path, join(site, name));
}
cpSync(join(repo, 'public/fonts'), join(site, 'fonts'), { recursive: true });
execFileSync('tar', ['-czf', join(site, 'source.tar.gz'), '-C', repo,
  'README.md', 'GLOSSARY.md', 'package.json', 'src', 'public', 'data', 'test', 'docs', 'scripts'], { timeout: 10000, env: { ...process.env, COPYFILE_DISABLE: '1' } });
