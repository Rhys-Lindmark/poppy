# Poppy on Hermes

Rhys's private Poppy runs on the Docker host described in [hermes-ops](https://github.com/Rhys-Lindmark/hermes-ops). The Mac command `npm run ask -- "Your message"` reaches the loopback bridge over the `hermes` SSH alias. Hermes uses its existing model provider and Docker tool environment. The web Commonplace demo has its own signed-out review flow.

[Private chat and Siri setup](https://ai.rhyslindmark.com/poppy/hermes) use the owner’s access key. Run `npm run ask -- --copy-access-key` on the Mac with the configured SSH connection when you need to paste the key into the chat. It stays in the server’s protected configuration. The chat keeps a copy in memory until disconnect or page reload. Hermes tool approvals are separate from PAP Operations approval. The private browser can stop a task that gets stuck waiting for Hermes tool approval.

The private HTTPS listener serves the browser and a bearer-authenticated `/message` endpoint. It uses Caddy and a renewable Let's Encrypt IP certificate on the existing DigitalOcean host. The native Hermes Runs API stays on loopback. The public visual covers the [observed Commonplace request](https://ai.rhyslindmark.com/poppy/hermes-conformance) and the seeded delivery sandbox.

## PAP 1.0 capabilities

| Part of PAP | Hermes integration |
| --- | --- |
| Discover the Company | The `prepare_commonplace_edition` MCP tool checks the 1.0 manifest and Company hostname, verifies the signed-out issuer case, and looks up the Company’s OpenAPI operation. |
| Identify the Personal Agent | [Client metadata](https://ai.rhyslindmark.com/poppy/hermes-agent.json) names Poppy (Hermes). The [JWKS](https://ai.rhyslindmark.com/poppy/hermes-jwks.json) publishes its root ES256 verification key. |
| Sign a Session | The Commonplace operation carries `Poppy-Version` and a request-bound `Poppy-Session` JWT with a delegated ES256 key. The user identifier is derived separately for each Company. |
| Sign in and use scoped account access | Direct Sign-In, OAuth PKCE, account-scoped access, and an exact-term delivery change are implemented in the local reference sandbox. The Hermes tool currently exercises the signed-out Commonplace workflow. |
| Approve consequential requests | The tool returns a revision-bound review URL. The user confirms the edition in the browser. The Operations 3 signed-update workflow is covered by the sandbox tests. |

An agent can implement a subset of the interaction channels a Company advertises. The Hermes tool supports one Company and its signed-out OpenAPI operation. Poppy’s static Commonplace catalog is an observable guest endpoint. A successful response shows the request reached the Company, while cryptographic verification of the Session is tested separately. [PAP 1.0 specification](https://personalagentprotocol.org/docs/1.0/spec) · [Operations extension](https://personalagentprotocol.org/docs/1.0/extensions/operations)

The Hermes API and Poppy bridge listen on loopback on the Docker host. The service configuration and the PAP signing material are in the host user’s private Poppy configuration directory. The public repository publishes only the agent identity and public verification key.
