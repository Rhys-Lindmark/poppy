# Add Poppy discovery to a store

**Roles** Company and an independent client  
**Protocol** Poppy 1.0 Discovery  
**Prerequisites** Node 22.18 or later, OpenSSL 3, and this repository

Run this from the repository. The sandbox client trusts just the generated local certificate for the life of the process.

```sh
node --input-type=module <<'NODE'
import { startSandbox } from './src/demo.mjs';
const { origin, http, close } = await startSandbox();
try {
  const result = await http(origin + '/.well-known/poppy.json');
  const discovery = result.json();
  if (result.status !== 200 || discovery.protocol_version !== '1.0' ||
      discovery.organization.domain !== new URL(origin).host ||
      discovery.apis[0]?.type !== 'openapi') {
    throw new Error('Discovery did not match the advertised storefront');
  }
  console.log(JSON.stringify(discovery, null, 2));
} finally {
  await close();
}
NODE
```

Expect the store’s host, a Poppy 1.0 version, its OpenAPI description, OAuth scopes, and Operations 3. In [store.mjs](../../src/store.mjs), use the discovery handler as a model for exposing your own API description. The [discovery rules](https://personalagentprotocol.org/docs/1.0/spec) cover redirects and domain binding.
