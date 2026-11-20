# Build a Personal Agent

**Roles** Personal Agent and Company  
**Protocol** Poppy 1.0 with delegated ES256 Session signatures  
**Prerequisites** Node 22.18 or later, OpenSSL 3, and this repository

Start the built-in agent and the test Company:

```sh
npm start -- "Move my delivery to Saturday"
```

Open the URL printed by the command and select **Start rescheduling**. The local HTTPS server generates a sandbox certificate. The agent reads the discovery document, finds the API in OpenAPI, signs a fresh Session JWT with its delegated key, and asks for the delivery options.

The Company serves the user's sign-in screen. For this cookbook, the user can decline or leave the page. If the user continues to the review screen, the trace should show HTTP 200 for `GET /api/delivery-options` and HTTP 401 for the signed-out order lookup. The test runner drives the sandbox without a browser:

```sh
npm test -- --test-name-pattern='discovery, scoped sign-in'
```

The implementation is in [agent.mjs](../../src/agent.mjs) and [protocol.mjs](../../src/protocol.mjs). The Company verifies signatures against [Poppy Sections 4.1 and 5](https://personalagentprotocol.org/docs/1.0/spec).
