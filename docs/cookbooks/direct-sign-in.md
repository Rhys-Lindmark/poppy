# Sign in to read an order

**Roles** User, Personal Agent, and Company  
**Protocol** Poppy 1.0 Direct Sign-In with OAuth code, PKCE, and private-key JWT  
**Prerequisites** Node 22.18 or later, OpenSSL 3, and this repository

```sh
npm start
```

Open the printed URL and choose **Look up delivery**. The User grants `orders:read` on the Demo Store consent screen. The callback checks its state and issuer, exchanges the code using PKCE and a client assertion, and sends a fresh signed Session with the access token.

The seeded order should say Friday on a fresh server. In the trace, the first order lookup should have HTTP 401 and the signed-in order lookup HTTP 200.

Verify insufficient consent and the unchanged order in the sandbox:

```sh
npm test -- --test-name-pattern='read-only consent'
```

See [Poppy’s OAuth and session rules](https://personalagentprotocol.org/docs/1.0/spec) for the requested and granted scope semantics.
