import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import edition from '../data/commonplace-edition.json' with { type: 'json' };
import market from '../data/retail-2025.json' with { type: 'json' };

const repo = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] || 'dist');
const site = join(output, 'poppy');
for (const folder of [site, join(site, 'api'), join(site, 'cookbooks'), join(output, '.well-known')]) {
  mkdirSync(folder, { recursive: true });
}
const write = (path, value) => writeFileSync(join(site, path), value);
const json = (path, value) => write(path, JSON.stringify(value, null, 2) + '\n');
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
const siteOrigin = 'https://ai.rhyslindmark.com';
const route = '/poppy';
const links = [
  [route + '/', 'Poppy'], [route + '/cookbooks/', 'Cookbooks'],
  [route + '/coverage.html', 'Sales coverage'], [route + '/poppyval.html', 'PoppyVal'],
  [route + '/sponsors.html', 'Sponsors'],
];
function page(title, body, script = '') {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="description" content="Poppy Personal Agent Protocol demo with Commonplace."><title>' +
    escape(title) + '</title><link rel="stylesheet" href="' + route + '/styles.css">' + script +
    '</head><body><header><nav aria-label="Main">' +
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
  '<p>The local HTTPS sandbox includes delegated Session signing, Direct Sign-In, and approval of the delivery change.</p></section>',
  '<script type="module" src="/poppy/commonplace-demo.mjs"></script>'));

const catalog = readFileSync(join(repo, 'docs/cookbooks.md'), 'utf8');
const entries = [...catalog.matchAll(/^\| (\d+) \| ([^|]+) \| ([^|]+) \|$/gm)];
if (entries.length !== 50) throw new Error('Expected 50 cookbook proposals');
const guides = ['personal-agent', 'store-discovery', 'direct-sign-in', 'delivery-approval', 'interoperability'];
const titles = new Map();
for (const name of guides) {
  const text = readFileSync(join(repo, 'docs/cookbooks', name + '.md'), 'utf8');
  titles.set(name, text.split('\n')[0].slice(2));
  write('cookbooks/' + name + '.html', page(titles.get(name),
    '<h1>' + escape(titles.get(name)) + '</h1><pre class="guide">' + escape(text.split('\n').slice(2).join('\n').replace(/[ \t]+$/gm, '')) + '</pre>'));
}
write('cookbooks/index.html', page('Poppy cookbooks', '<h1>Poppy cookbooks</h1><h2>Runnable guides</h2><ul>' +
  guides.map((name) => '<li><a href="' + name + '.html">' + escape(titles.get(name)) + '</a></li>').join('') +
  '</ul><section><h2>50 proposals</h2><dl>' +
  entries.map(([, , title, result]) => '<dt>' + escape(title) + '</dt><dd>' + escape(result) + '</dd>').join('') +
  '</dl><p><a href="https://personalagentprotocol.org/docs/demos">Community demos</a></p></section>'));

write('coverage.html', page('Ecommerce sales coverage', '<h1>Ecommerce sales coverage</h1><p>' + escape(market.market) +
  ' · about $1.25T. <a href="' + escape(market.marketSource) + '">Census data</a></p>' +
  '<table class="coverage"><caption>Public discovery checked ' + escape(market.checked) + '</caption><thead><tr>' +
  '<th scope="col">Retailer or platform</th><th scope="col">Online sales</th><th scope="col">Public discovery</th></tr></thead><tbody>' +
  market.retailers.map((row) => {
    const share = (row.billions / market.marketBillions * 100).toFixed(1);
    return '<tr><th scope="row"><a href="' + escape(row.source) + '">' + escape(row.name) + '</a></th><td>' +
      escape(row.display) + ' (' + share + '%)<meter min="0" max="100" value="' + share + '" aria-label="' +
      escape(row.name + ' share') + '"></meter><small>' + escape(row.basis) + '</small></td><td>' +
      escape(row.discovery) + '</td></tr>';
  }).join('') + '</tbody></table><p class="note">Live workflows are untested for these retailers.</p>'));

const evidence = JSON.parse(execFileSync(process.execPath, [join(repo, 'src/poppyval.mjs')], { encoding: 'utf8', timeout: 10000 }));
json('poppyval.json', evidence);
write('poppyval.html', page('PoppyVal', '<h1>PoppyVal</h1><p>Results for the bundled Poppy 1.0 HTTPS sandbox.</p><ul>' +
  evidence.checks.map(({ check, outcome }) => '<li>' + escape(check) + ' — ' + escape(outcome) + '</li>').join('') +
  '</ul><p><a href="poppyval.json">Machine-readable results</a></p><p>Independent PoppyVal runs against external agents are pending. ' +
  'Sierra reports that Meta Muse looks for Poppy when visiting sites. <a href="https://sierra.ai/uk/blog/releasing-poppy">Sierra announcement</a></p>'));

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

for (const name of ['styles.css', 'tokens.css', 'commonplace-demo.mjs']) {
  const path = join(repo, 'public', name);
  if (name === 'styles.css') {
    write(name, readFileSync(path, 'utf8').replace('url("/tokens.css")', 'url("/poppy/tokens.css")') +
      '\n#status { margin-block: 0.7rem; }\n.guide { white-space: pre-wrap; overflow-wrap: anywhere; }\n');
  } else copyFileSync(path, join(site, name));
}
execFileSync('tar', ['-czf', join(site, 'source.tar.gz'), '-C', repo,
  'README.md', 'GLOSSARY.md', 'package.json', 'src', 'public', 'data', 'test', 'docs', 'scripts'], { timeout: 10000 });
