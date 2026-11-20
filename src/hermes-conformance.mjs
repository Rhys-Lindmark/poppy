import { escapeHtml as escape, reportHeading } from './report-views.mjs';

const spec = 'https://personalagentprotocol.org/docs/1.0/spec';

export function hermesConformanceMarkup(evidence) {
  const request = evidence?.request;
  const live = Boolean(request);
  const interop = evidence?.interoperability;
  const steps = [
    ['Publish the agent identity', 'Public documents',
      'The Personal Agent publishes an HTTPS client ID and a root public key. A Company uses that key to verify the agent’s delegation.',
      [['Client metadata', '/poppy/hermes-agent.json'], ['Verification keys', '/poppy/hermes-jwks.json']]],
    ['Discover the Company', live ? 'Observed on Hermes' : 'Integration test',
      'Hermes discovers a Company by URL, verifies the serving domain and OAuth issuer when present, and lists the advertised OpenAPI read operations.',
      [['Discovery document', '/.well-known/poppy.json'], ['Commonplace OpenAPI', '/poppy/openapi.json']]],
    ['Send a signed Session', live ? 'Observed on Hermes' : 'Integration test',
      'Hermes uses a short-lived delegated key to sign a guest Session bound to the Company, request method, and URL. The integration tests verify both signatures.',
      live ? [['Read the request receipt', '/poppy/hermes-pap-evidence.json']] : [],
      live ? `${request.method} ${request.path} · HTTP ${request.status}` : null],
    ...(interop ? [['Read inventory at Cliffside Retail', 'Observed on Hermes',
      'A second Company accepted a signed-out inventory request from the same published Hermes identity. The Company advertised the endpoint in its own OpenAPI description.',
      [['Cliffside Retail discovery', interop.origin + '/.well-known/poppy.json']],
      `${interop.request.method} ${interop.request.path} · HTTP ${interop.request.status}`]] : []),
    ['Sign in for account access', 'Demonstrated in the sandbox',
      'The Demo Store challenges the agent to sign in. The user completes Direct Sign-In and grants the scope needed to read an order. Commonplace’s public catalog works as a guest.',
      [['Follow the sign-in cookbook', '/poppy/cookbooks/direct-sign-in.html']]],
    ['Approve the exact terms', 'Demonstrated in the sandbox',
      'The Demo Store shows the delivery change and applies it after checking the user’s approval of those terms. For Commonplace, the user reviews the exact edition before downloading it.',
      [['Replay the delivery change', '/poppy/protocol-trace#replay'], ['Review a Commonplace edition', '/poppy/agent']]],
  ];
  return reportHeading('How Hermes uses PAP',
    'Hermes discovers participating Companies and calls advertised read operations with signed guest Sessions. The delivery sandbox demonstrates scoped sign-in and signed Operations.') +
    '<ol class="pap-flow" aria-label="PAP conformance steps">' +
    steps.map(([title, status, detail, links, receipt]) => '<li><div class="pap-flow-heading"><h2>' + escape(title) +
      '</h2><p>' + escape(status) + '</p></div><p>' + escape(detail) + '</p>' +
      (receipt ? '<p class="pap-flow-receipt"><code>' + escape(receipt) + '</code></p>' : '') +
      (links.length ? '<div class="site-links">' + links.map(([label, href]) => '<a href="' + escape(href) + '">' + escape(label) + '</a>').join('') + '</div>' : '') +
      '</li>').join('') + '</ol>' +
    (live ? '<p class="note">The catalog returned HTTP ' + escape(String(request.status)) +
      '. Signature verification was exercised separately in the integration test. Recorded <time datetime="' +
      escape(evidence.observed_at) + '">' + escape(evidence.observed_at.slice(0, 10)) + ' UTC</time>.</p>' : '') +
    '<p class="site-links"><a href="' + spec + '">PAP 1.0 specification</a>' +
    '<a href="https://github.com/Rhys-Lindmark/poppy/blob/main/test/poppy-client.test.mjs">Discovery and signature tests</a></p>';
}
