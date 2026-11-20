# Personal Agent Protocol demo

[Public Poppy demo with Commonplace](https://ai.rhyslindmark.com/poppy/).

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

PoppyVal prints JSON for the local agent and store scenario. The fixture currently accepts the bundled agent and uses live HTTPS requests inside the process. [PoppyVal design and market evidence](docs/poppyval.md) describes the planned external-agent cohort and checks.

[Browse 50 cookbook proposals and five runnable guides](docs/cookbooks.md).

## Publish and run sponsor integrations

[Configuration and verification for the hackathon sponsors](docs/sponsors.md).

The public Commonplace edition demo, cookbook catalog, PoppyVal report, and sales coverage page build with `node scripts/build-public.mjs <output-directory>`. The output targets the `/poppy` path on ai.rhyslindmark.com.
