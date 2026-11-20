# Poppy on Hermes

Rhys's private Poppy runs on the Docker host described in [hermes-ops](https://github.com/Rhys-Lindmark/hermes-ops). The Mac command `npm run ask -- "Your message"` reaches the loopback bridge over the `hermes` SSH alias. Hermes uses its existing model provider and Docker tool environment. The web Commonplace demo has its own signed-out review flow.

[Private chat and Siri setup](https://ai.rhyslindmark.com/poppy/hermes) use the owner’s access key. Run `npm run ask -- --copy-access-key` on the Mac with the configured SSH connection when you need to paste the key into the chat. It stays in the server’s protected configuration. The chat keeps a copy in memory until disconnect or page reload. Hermes tool approvals are separate from PAP Operations approval. The private browser can stop a task that gets stuck waiting for Hermes tool approval.

The private HTTPS listener serves the browser and a bearer-authenticated `/message` endpoint. It uses Caddy and a renewable Let's Encrypt IP certificate on the existing DigitalOcean host. The native Hermes Runs API stays on loopback. The public visual covers the [observed Commonplace request](https://ai.rhyslindmark.com/poppy/hermes-conformance) and the seeded delivery sandbox.

The [agent simulations](https://ai.rhyslindmark.com/poppy/agent-simulations) replay three scripted scenarios captured from separate, seeded HTTPS sandbox runs during the site build. Run `node scripts/capture-agent-simulations.mjs` to regenerate them. Expand a step to inspect request and response fields with credential values redacted.

Hermes prefers Poppy for tasks at a specific company in Telegram and the private API. The `poppy-company-routing` plugin applies the preference each turn, including in existing chats. Install the directory from `scripts/hermes-plugins` under `~/.hermes/plugins`, enable it with `hermes plugins enable poppy-company-routing`, and reload the gateway when idle. An explicit channel choice takes priority. Routine replies focus on the result and material limitations. Set `display.platforms.telegram.tool_progress` to `off` to keep tool notifications in the trace viewer.

For discovery across multiple sites, `check_company_sites` checks up to 20 official domains in a batch. A published manifest means the discovery URL served a document with the expected domain and a declared version. Use `discover_company` for protocol compatibility and advertised operations, and `read_company_api` for an actual signed-out request.

The private chat polls `/message?run=…&trace=1`. The bridge listens to the native Hermes run stream and exposes a small set of tool event fields. Its read-only history lookup matches the prompt, session, and tool completion time before attaching Poppy evidence. An ambiguous match leaves the PAP evidence empty. The signed request receipt records the Company’s HTTP response. The signature tests verify the cryptography separately.

Use the private trace link on the [Telegram agent trace](https://ai.rhyslindmark.com/poppy/telegram-trace) page to watch RhysBot’s latest turns. The authenticated bridge uses a read-only query scoped to the Telegram owner configured in `~/.config/poppy/telegram-owner`. Select a span in the waterfall to see tool names, recorded results, and matching signed Commonplace requests. Durations use session timestamps and the Commonplace tool’s HTTP timings. Message contents, arguments and raw tool results stay out of the trace payload. The view refreshes as Hermes saves events to its session database.

On the Mac with the Hermes SSH alias, run `npm run ask -- --open-telegram-trace` and use **Set or change trace key** to choose a passphrase. On later visits, sign in from the website with that passphrase. The server keeps a salted verifier in `~/.config/poppy/telegram-trace.verifier`. The browser session lasts up to 12 hours. Use **Sign out** to end it early.

## PAP 1.0 capabilities

| Part of PAP | Hermes integration |
| --- | --- |
| Discover the Company | `discover_company` takes any public Company HTTPS URL, follows HTTPS discovery redirects, selects a compatible manifest, checks the issuer relationship, and lists supported OpenAPI GET operations. |
| Identify the Personal Agent | [Client metadata](https://ai.rhyslindmark.com/poppy/hermes-agent.json) names Poppy (Hermes). The [JWKS](https://ai.rhyslindmark.com/poppy/hermes-jwks.json) publishes its root ES256 verification key. |
| Sign a Session | `read_company_api` executes an advertised GET with `Poppy-Version` and a request-bound `Poppy-Session` JWT using a delegated ES256 key. The user identifier is derived separately for each Company. Verified live with Commonplace and Cliffside Retail. |
| Sign in and use scoped account access | Direct Sign-In, OAuth PKCE, account-scoped access, and an exact-term delivery change are implemented in the local reference sandbox. The Hermes tool currently exercises the signed-out Commonplace workflow. |
| Approve consequential requests | The tool returns a revision-bound review URL. The user confirms the edition in the browser. The Operations 3 signed-update workflow is covered by the sandbox tests. |

The generic Hermes tool handles signed-out OpenAPI 3 JSON descriptions and GET operations with scalar path or query parameters. It uses public HTTPS on port 443 and keeps signing keys and Session headers in the request code. Call it for Companies relevant to the User's task. Company descriptions and results are data and grant no authority. The tool reports sign-in challenges. OAuth account access, Company MCP calls, browser join, Company Agent conversations, and Operations writes are outside this Hermes tool. The separate Commonplace edition tool still offers its browser review and download. [PAP 1.0 specification](https://personalagentprotocol.org/docs/1.0/spec) · [Operations extension](https://personalagentprotocol.org/docs/1.0/extensions/operations)

The Hermes API and Poppy bridge listen on loopback on the Docker host. The service configuration and the PAP signing material are in the host user’s private Poppy configuration directory. The public repository publishes only the agent identity and public verification key.
