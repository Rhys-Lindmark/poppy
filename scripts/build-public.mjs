import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import edition from '../data/commonplace-edition.json' with { type: 'json' };
import storeResults from '../data/storefront-results.json' with { type: 'json' };
import { coverageMarkup, escapeHtml as escape, poppyvalMarkup } from '../src/report-views.mjs';
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
const links = [
  [route + '/', 'Poppy'], [route + '/cookbooks/', 'Cookbooks'],
  [route + '/protocol-trace.html', 'Delivery trace'], [route + '/coverage.html', 'Sales coverage'],
  [route + '/poppyval.html', 'PoppyVal'],
  [route + '/sponsors.html', 'Sponsors'],
];
function page(title, body, head = '', bodyClass = '') {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="description" content="Poppy Personal Agent Protocol demo with Commonplace."><title>' +
    escape(title) + '</title><link rel="stylesheet" href="' + route + '/styles.css">' + head +
    '</head><body' + (bodyClass ? ' class="' + escape(bodyClass) + '"' : '') + '><header><nav aria-label="Main">' +
    links.map(([href, label]) => '<a href="' + href + '">' + label + '</a>').join('') +
    '</nav></header><main>' + body + '</main></body></html>\n';
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

write('index.html', page('Poppy', '<section><h1>Poppy</h1><p>Prepare a reading edition from the ' +
  '<a href="/commonplace/">Commonplace store</a>.</p><button class="primary" id="start">Find an edition</button>' +
  '<p id="status" role="status"></p></section><section id="review" hidden><h2 id="edition-title"></h2><p id="terms"></p>' +
  '<details><summary>Quotation sources</summary><ul id="edition-sources"></ul></details>' +
  '<p><button class="primary" id="approve">Approve and download edition</button></p>' +
  '<p>In <a href="/commonplace/">Commonplace</a>, choose Restore and select the downloaded file. Commonplace downloads a backup of your current collection before replacing it.</p>' +
  '</section><section><h2>Store requests</h2><table><thead><tr><th scope="col">Request</th><th scope="col">HTTP</th></tr></thead>' +
  '<tbody id="trace-body"></tbody></table><p class="note"><a href="/.well-known/poppy.json">Discovery document</a></p></section>' +
  '<section><h2>Run the signed sandbox</h2><p><a href="/poppy/source.tar.gz">Download the source, runnable guides, and sponsor setup</a>.</p>' +
  '<p>The local HTTPS sandbox includes delegated Session signing, Direct Sign-In, and approval of the delivery change. ' +
  '<a href="/poppy/protocol-trace.html">View a recorded run</a>.</p></section>',
  '<script type="module" src="/poppy/commonplace-demo.mjs"></script>'));

buildCookbooks({ repo, route, write, page });

json('storefront-results.json', storeResults);
write('coverage.html', page('Ecommerce sales coverage',
  coverageMarkup('/poppy/storefront-results.json')));

const evidence = JSON.parse(execFileSync(process.execPath, [join(repo, 'src/poppyval.mjs')], { encoding: 'utf8', timeout: 10000 }));
json('poppyval.json', evidence);
write('poppyval.html', page('PoppyVal', poppyvalMarkup(evidence)));

const trace = JSON.parse(execFileSync(process.execPath, [join(repo, 'scripts/capture-delivery-trace.mjs')], {
  encoding: 'utf8', timeout: 10000,
}));
json('delivery-trace.json', trace);
write('protocol-trace.html', page('Delivery rescheduling trace',
  '<h1>Delivery rescheduling trace</h1><p>The seeded Demo Store moved the order from Friday to ' +
  escape(trace.outcome) + ' after scoped sign-in and approval. This redacted trace was captured over local HTTPS.</p>' +
  traceTable(trace.requests) +
  '<p><a href="delivery-trace.json">Download the request trace</a></p>' +
  '<p><a href="/poppy/cookbooks/delivery-approval.html">Replay the scenario</a></p>'));

const sponsors = readFileSync(join(repo, 'docs/sponsors.md'), 'utf8');
const sponsorRows = [...sponsors.matchAll(/^\| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)].slice(2);
if (sponsorRows.length !== 11) throw new Error('Expected 11 sponsor integrations');
write('sponsors.html', page('Hackathon sponsors', '<h1>Hackathon sponsors</h1>' +
  '<p>Starter integrations for the local signed sandbox. Live vendor verification requires authorized projects.</p>' +
  '<table class="coverage"><thead><tr><th scope="col">Sponsor</th><th scope="col">Integration</th></tr></thead><tbody>' +
  sponsorRows.map(([, name, integration]) => '<tr><th scope="row">' + escape(name) + '</th><td>' +
    escape(integration) + '</td></tr>').join('') + '</tbody></table>' +
  '<p class="note"><a href="/poppy/sponsors.md">Setup instructions</a></p>'));
write('sponsors.md', sponsors);

for (const name of ['styles.css', 'tokens.css', 'commonplace-demo.mjs', 'commonplace-client.mjs', 'cookbooks.css', 'cookbooks.mjs']) {
  const path = join(repo, 'public', name);
  if (name === 'styles.css') {
    write(name, readFileSync(path, 'utf8').replace('url("/tokens.css")', 'url("/poppy/tokens.css")') +
      '\n#status { margin-block: 0.7rem; }\n');
  } else copyFileSync(path, join(site, name));
}
execFileSync('tar', ['-czf', join(site, 'source.tar.gz'), '-C', repo,
  'README.md', 'GLOSSARY.md', 'package.json', 'src', 'public', 'data', 'test', 'docs', 'scripts'], { timeout: 10000, env: { ...process.env, COPYFILE_DISABLE: '1' } });
