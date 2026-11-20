import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import edition from '../data/commonplace-edition.json' with { type: 'json' };
import hermesIdentity from '../data/hermes-agent-identity.json' with { type: 'json' };
import storeResults from '../data/storefront-results.json' with { type: 'json' };
import { coverageMarkup, escapeHtml as escape, poppyvalMarkup, reportHeading } from '../src/report-views.mjs';
import { traceTable } from '../src/views.mjs';
import { hermesConformanceMarkup } from '../src/hermes-conformance.mjs';
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
const ownerOrigin = process.env.POPPY_OWNER_ORIGIN ? new URL(process.env.POPPY_OWNER_ORIGIN) : null;
if (ownerOrigin && (ownerOrigin.protocol !== 'https:' || ownerOrigin.href !== ownerOrigin.origin + '/')) {
  throw new Error('POPPY_OWNER_ORIGIN must be an HTTPS origin.');
}
const protocolDocs = 'https://personalagentprotocol.org/docs/introduction';
const links = [
  ['/agent', 'Message the agent'],
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
const openAPI = {
  openapi: '3.1.0', info: { title: 'Commonplace edition catalog', version: '1.0.0' },
  servers: [{ url: siteOrigin }],
  paths: { [route + '/api/edition.json']: { get: { operationId: 'getCommonplaceEdition',
    summary: 'Read the public terms and source selections for a Commonplace edition',
    responses: { 200: { description: 'Commonplace reading edition' } },
  } } },
};
json('openapi.json', openAPI);
json('api/edition.json', edition);
json('hermes-agent.json', hermesIdentity.metadata);
json('hermes-jwks.json', hermesIdentity.jwks);
const hermesEvidencePath = join(repo, 'data/hermes-pap-evidence.json');
const hermesEvidence = existsSync(hermesEvidencePath) ? JSON.parse(readFileSync(hermesEvidencePath, 'utf8')) : null;
if (hermesEvidence) json('hermes-pap-evidence.json', hermesEvidence);
write('hermes-conformance.html', page('How Hermes uses PAP', hermesConformanceMarkup(hermesEvidence), {
  head: '<link rel="stylesheet" href="/poppy/hermes-conformance.css">',
}));

write('index.html', page('Personal Agent Protocol demo',
  '<section class="brand-hero" aria-labelledby="protocol"><div class="site-wrap"><h1 id="protocol">Personal Agent Protocol</h1>' +
  '<p class="brand-intro">An open protocol for every company and every personal agent.</p>' +
  '<div class="site-links"><a class="site-button" href="' + (ownerOrigin ? '/poppy/hermes">Message Hermes' : '/poppy/agent">Message the agent') + '</a>' +
  '<a href="#commonplace-demo">Try the Commonplace demo</a>' +
  '<a href="/poppy/agent-simulations">Run agent simulations</a>' +
  '<a href="/poppy/hermes-conformance">See how Hermes uses PAP</a>' +
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

const agentStyle = '<link rel="stylesheet" href="/poppy/agent-chat.css">';
if (ownerOrigin) {
  const telegramView = new URL(ownerOrigin);
  telegramView.searchParams.set('view', 'telegram');
  write('telegram-trace.html', page('RhysBot Telegram stack trace',
    reportHeading('RhysBot Telegram stack trace', 'Keep this tab open while you chat with RhysBot in Telegram. Browse each turn as a waterfall and select a span to inspect tool calls, timing, and PAP evidence.') +
    '<p><a class="site-button" href="' + escape(telegramView.href) + '" rel="noreferrer">Open Telegram stack trace</a></p>' +
    '<p>Sign in with your Poppy access key. From the Poppy checkout on your Mac, run <code>npm run ask -- --copy-access-key</code> to copy it.</p>' +
    '<p><a href="/poppy/hermes">Hermes web chat</a></p>'));
  write('hermes.html', page('Message Hermes',
    reportHeading('Message Hermes', 'Rhys’s private Poppy agent runs on DigitalOcean. The live chat shows calls, tool activity, and PAP evidence as Hermes works.') +
    '<p><a class="site-button" href="' + escape(ownerOrigin.href) + '" rel="noreferrer">Open private Hermes chat</a></p>' +
    '<p><a href="/poppy/telegram-trace">Watch RhysBot’s Telegram stack trace</a></p>' +
    '<p>On the Mac with the configured Hermes SSH connection, run <code>npm run ask -- --copy-access-key</code> ' +
    'from the Poppy source directory. Paste the key into the private chat to connect.</p>' +
    '<section class="agent-siri"><h2>Use Hermes with Siri</h2><ol>' +
    '<li>Create a shortcut named <strong>Ask Hermes</strong>. Add <strong>Dictate Text</strong>.</li>' +
    '<li>Add <strong>Get Contents of URL</strong> for <code>' + escape(ownerOrigin.origin + '/message') + '</code>. ' +
    'Choose <strong>POST</strong> and set the JSON field <code>message</code> to <strong>Dictated Text</strong>.</li>' +
    '<li>Set the <code>Authorization</code> header to <code>Bearer YOUR_ACCESS_KEY</code>. Keep this shortcut private.</li>' +
    '<li>Get <code>run_url</code> from the response with <strong>Get Dictionary Value</strong> and pass it to <strong>Open URLs</strong>. ' +
    'Sign in to see the reply as Hermes works.</li></ol>' +
    '<p><a href="https://support.apple.com/guide/shortcuts/apd07c25bb38/ios">Apple’s Siri Shortcuts guide</a></p></section>' +
    '<p><a href="/poppy/agent-simulations">Run agent simulations</a> · <a href="/poppy/hermes-conformance">See how Hermes uses PAP</a> · <a href="/poppy/agent">Try the public Commonplace demo</a></p>',
    { head: agentStyle, bodyClass: 'site-report poppy-agent' }));
}
write('agent.html', page('Message the Poppy agent',
  reportHeading('Message the Poppy agent', 'Ask Poppy to find a free reading edition from Commonplace or explain what’s in it.') +
  '<div class="agent-links">' + (ownerOrigin ? '<a href="/poppy/hermes">Open private Hermes</a> · ' : '') +
  '<a href="/poppy/siri">Use the Commonplace demo with Siri</a> · ' +
  '<a href="/poppy/agent-simulations">Run agent simulations</a> · ' +
  '<a href="/poppy/hermes-conformance">See how Hermes uses PAP</a></div>' +
  '<ol id="agent-messages" class="agent-messages" role="log" aria-label="Conversation" tabindex="0">' +
  '<li><strong>Poppy</strong><p>What would you like to read? Try “Find me a reading edition.”</p></li></ol>' +
  '<form class="agent-form" id="agent-form" method="post" action="/poppy/api/message"><label for="agent-message">Message Poppy</label>' +
  '<input id="agent-message" name="message" maxlength="400" placeholder="Find me a reading edition" required autocomplete="off">' +
  '<button type="submit" class="primary">Send</button></form><p id="agent-status" class="agent-status" role="status"></p>' +
  '<section class="agent-review" id="agent-review" aria-labelledby="agent-edition-title" hidden>' +
  '<h2 id="agent-edition-title"></h2><p id="agent-terms"></p>' +
  '<details><summary>Quotation sources</summary><ul id="agent-sources"></ul></details>' +
  '<details><summary>Store requests</summary><ul id="agent-requests"></ul></details>' +
  '<p><button type="button" id="agent-approve" class="primary">Approve and download</button></p>' +
  '<p>Use <a href="/commonplace/">Commonplace</a>’s Restore action to import your download.</p></section>',
  { head: agentStyle + '<script type="module" src="/poppy/agent-chat.mjs"></script>',
    bodyClass: 'site-report poppy-agent', active: '/agent' }));

write('siri.html', page('Ask Poppy with Siri',
  reportHeading('Ask Poppy with Siri', 'Set up a shortcut once, then say “Siri, Ask Poppy” and dictate your message.') +
  '<section class="agent-siri"><h2>Create the shortcut</h2><ol>' +
  '<li>In Shortcuts on your iPhone, create a shortcut named <strong>Ask Poppy</strong>.</li>' +
  '<li>Add <strong>Dictate Text</strong>.</li>' +
  '<li>Add <strong>Get Contents of URL</strong> for <code>https://ai.rhyslindmark.com/poppy/api/message</code>. ' +
  'Choose <strong>POST</strong> and set the request body to <strong>JSON</strong>. ' +
  'Add a text field named <code>message</code> and set its value to <strong>Dictated Text</strong>.</li>' +
  '<li>Add <strong>Get Dictionary Value</strong> to get <code>reply</code> from <strong>Contents of URL</strong>.</li>' +
  '<li>Add <strong>Speak Text</strong> and use the dictionary value as its input.</li></ol>' +
  '<p>Try “Find me a reading edition” or “How much does it cost?”</p>' +
  '<h2>Open an edition for approval</h2><p>To continue in Safari, get <code>review_url</code> from ' +
  '<strong>Contents of URL</strong> and pass it to <strong>Open URLs</strong> when the value exists. ' +
  'The browser asks you to approve the download.</p>' +
  '<p><a href="/poppy/agent">Back to web chat</a> · ' +
  '<a href="https://support.apple.com/guide/shortcuts/apd07c25bb38/ios">Apple’s Siri Shortcuts guide</a></p></section>',
  { head: agentStyle, bodyClass: 'site-report poppy-agent', active: '/agent' }));

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
const simulations = JSON.parse(execFileSync(process.execPath, [join(repo, 'scripts/capture-agent-simulations.mjs')], {
  encoding: 'utf8', timeout: 10000,
}));
json('agent-simulations.json', simulations);
write('agent-simulations.html', page('Agent simulations',
  reportHeading('Agent simulations', 'Follow a training agent’s scripted prompt through recordings from the seeded PAP 1.0 sandbox.') +
  '<section id="simulation" aria-label="Training-agent simulator"><div class="simulation-controls">' +
  '<div><label for="scenario">Scenario</label><select id="scenario">' +
  simulations.scenarios.map(({ id, title }) => '<option value="' + escape(id) + '">' + escape(title) + '</option>').join('') +
  '</select></div><button type="button" class="primary" data-run disabled>Run simulation</button>' +
  '<button type="button" data-pause disabled>Pause</button><button type="button" data-next disabled>Next step</button></div>' +
  '<p role="status">Loading simulations…</p><div class="simulation-layout">' +
  '<section aria-labelledby="sim-chat"><h2 id="sim-chat">Conversation</h2><ol data-chat></ol></section>' +
  '<section aria-labelledby="sim-wire"><h2 id="sim-wire">Calls and data</h2><ol data-events></ol></section></div></section>' +
  '<p class="site-links"><a href="/poppy/agent-simulations.json">Download scenario data</a>' +
  (ownerOrigin ? '<a href="/poppy/hermes">Open live Hermes</a>' : '') + '</p>',
  { head: '<link rel="stylesheet" href="/poppy/agent-simulations.css"><script type="module" src="/poppy/agent-simulations.mjs"></script>',
    bodyClass: 'site-report simulation-page' }));
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

for (const name of ['styles.css', 'tokens.css', 'branding.css', 'hermes-conformance.css', 'commonplace-demo.mjs', 'commonplace-client.mjs',
  'agent-simulations.css', 'agent-simulations.mjs',
  'cookbook-cover.jpg', 'cookbooks.css', 'cookbooks.mjs', 'trace-replay.mjs', 'agent-chat.css', 'agent-chat.mjs']) {
  const path = join(repo, 'public', name);
  if (name === 'styles.css') {
    write(name, readFileSync(path, 'utf8').replace('url("/tokens.css")', 'url("/poppy/tokens.css")') +
      '\n#status { margin-block: 0.7rem; }\n');
  } else copyFileSync(path, join(site, name));
}
cpSync(join(repo, 'public/fonts'), join(site, 'fonts'), { recursive: true });
const functions = join(output, 'functions');
for (const filename of ['src/chat-http.mjs', 'public/commonplace-agent.mjs', 'public/commonplace-client.mjs']) {
  const target = join(functions, '_poppy', filename);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(repo, filename), target);
}
writeFileSync(join(functions, '_poppy/company-documents.mjs'), 'export const companyDocuments = ' +
  JSON.stringify({ '/poppy/openapi.json': openAPI, '/poppy/api/edition.json': edition }, null, 2) + ';\n');
const agentRoute = join(functions, 'poppy/api');
mkdirSync(agentRoute, { recursive: true });
writeFileSync(join(agentRoute, 'message.js'), `import { companyOrigin, handleAgentMessage } from '../../_poppy/src/chat-http.mjs';
import { companyDocuments } from '../../_poppy/company-documents.mjs';
import { poppyDiscovery } from '../../_lib/poppy-discovery.js';

export function onRequest(context) {
  if (new URL(context.request.url).origin !== companyOrigin) {
    return new Response(null, { status: 404 });
  }
  return handleAgentMessage(context.request, (url) => {
    if (url === companyOrigin + '/.well-known/poppy.json') return Response.json(poppyDiscovery);
    const path = new URL(url).pathname;
    return Object.hasOwn(companyDocuments, path)
      ? Response.json(companyDocuments[path])
      : new Response(null, { status: 404 });
  });
}
`);
execFileSync('tar', ['-czf', join(site, 'source.tar.gz'), '-C', repo,
  'README.md', 'GLOSSARY.md', 'package.json', 'src', 'public', 'data', 'test', 'docs', 'scripts'], { timeout: 10000, env: { ...process.env, COPYFILE_DISABLE: '1' } });
