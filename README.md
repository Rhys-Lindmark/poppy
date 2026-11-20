# Personal Agent Protocol demo

[Public Poppy demo with Commonplace](https://ai.rhyslindmark.com/poppy/).

[Message the Poppy agent](https://ai.rhyslindmark.com/poppy/agent) or [set up Ask Poppy in Siri](https://ai.rhyslindmark.com/poppy/siri). Both use the public Commonplace workflow. The chat accepts requests to find an edition or ask about its price, format, and sources. The browser handles approval and download.

A local Poppy 1.0 Personal Agent and store. The sandbox demonstrates discovery and signed delivery requests, scoped Direct Sign-In, and approval of exact terms using Operations 3.

## Run

Requires Node 22.18 or later and OpenSSL 3. There are no package dependencies.

```sh
npm start -- "Move my delivery to Saturday"
```

Open the printed HTTPS URL. The browser may show a certificate warning for the sandbox’s generated localhost certificate. The server listens only on local IPv4 loopback and uses a seeded demo account. Start rescheduling, grant store access, then approve the exact change in the agent. The protocol trace shows the actual request sequence without credentials. **Sales coverage** opens the current retailer estimates and discovery observations. Use Ctrl+C to stop the server. Restart to restore the demo order to Friday.

## Verify

```sh
npm test
node src/poppyval.mjs
```

PoppyVal prints JSON for the local HTTPS scenario, the dated external interoperability checks, and the public storefront cohort. Run `npm run scan:stores --silent` to get a fresh discovery snapshot. [PoppyVal methodology and reproduction](docs/poppyval.md).

Run `node scripts/capture-delivery-trace.mjs` to replay the seeded workflow and export its redacted request trace. The site publishes a [recorded delivery trace](https://ai.rhyslindmark.com/poppy/protocol-trace.html).

## Commonplace coding agent

```sh
node src/commonplace.mjs
node src/commonplace.mjs --approve=REVIEWED_REVISION
```

The first command discovers the live Commonplace catalog and prints the proposed terms and revision as JSON. Review the terms and supply that revision to produce the importable `backup` object. Use Commonplace’s Restore action to import that object as a JSON file. The hosted edition is public and signed out.

To open the review through Siri, create a shortcut named **Find a Commonplace edition** with an **Open URLs** action for `https://ai.rhyslindmark.com/poppy/?intent=edition`. Say “Siri, find a Commonplace edition.” Review and approve the download on the page.

[Browse 50 cookbook proposals and five runnable guides](docs/cookbooks.md).

## Publish and run sponsor integrations

[Configuration and verification for the hackathon sponsors](docs/sponsors.md).

The demo and reports build with `node scripts/build-public.mjs <output-directory>`. The output targets the `/poppy` path on ai.rhyslindmark.com.
