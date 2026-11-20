# Poppy cookbooks

Propose roughly 50 cookbooks. Shortlist ten, including the three community examples listed in the Poppy docs. Start by writing five original cookbooks with runnable examples.

Use [CookbookVal](https://cookbookval.rhyslindmark.chatgpt.site/) as a reference for browsing and filtering a catalog and opening its source references. The Poppy catalog can be browsed by role, protocol capability, and readiness.

## Agent-native format

A full cookbook is a Markdown guide an agent can read and execute. Include the task, roles, protocol version, prerequisites, exact commands or requests, expected results, and what the agent can verify. Mark steps where the User needs to sign in or approve the terms. Use a sandbox or fixtures for examples that change state. A proposal records the goal, roles, capabilities, and success condition.

## Shortlist

| Cookbook | Who it helps | What it demonstrates | Plan |
| --- | --- | --- | --- |
| [Cliffside Retail](https://www.cliffside-retail.com/) | Agent and store builders | Use Atlas to interact with a fictional store and inspect the messages. | Community demo |
| [Poppy Demo Agent](https://poppydemoagent.dev/) | Agent builders | Use an existing Personal Agent to discover a Company, sign in and interact. | Community demo |
| [Print with Poppy](https://sandbox.printwithpoppy.com/) | Store builders | Turn a photo-print request into exact terms and complete simulated checkout. | Community demo using the sandbox |
| Build a Personal Agent | Agent builders | Given a Company domain, read discovery and make a signed request the Company accepts. | First five |
| Add Poppy discovery to a store | Store builders | Publish `/.well-known/poppy.json` for an existing guest API and verify both from an independent client. | First five |
| Let a User sign in to read an order | Agent and store builders | Use Direct Sign-In to read a seeded order with `orders:read` and verify that the same grant cannot change it. | First five |
| Reschedule a delivery with exact-term approval | Agent and store builders | Propose a Saturday window, approve that revision, and verify the stored delivery changes once. | First five |
| Run a Poppy interoperability check | Agent and evaluation builders | Run a candidate agent against a sandbox Company and report observed checks with the spec version and request evidence. | First five |
| Expose a store catalog through MCP | Store builders | Advertise an MCP endpoint and let a Personal Agent find products using the advertised tools. | Proposed |
| Hand a support conversation to a person | Company Agent builders | Pass a support request from the Company Agent to a human while preserving conversation context. | Proposed |

Check versions against the [Poppy specification](https://personalagentprotocol.org/docs/1.0/spec) and the [community demos page](https://personalagentprotocol.org/docs/demos) when writing each guide.

## 50 proposals

### Personal Agent

| # | Cookbook | Success condition |
| --- | --- | --- |
| 1 | Build a Personal Agent | Discover a Company and send a verified signed guest request. |
| 2 | Resume a task after Direct Sign-In | Continue an existing task after validating the OAuth callback. |
| 3 | Pick the right Company channel | Choose an advertised OpenAPI, MCP, website, or conversation channel for the task. |
| 4 | Request the smallest scope | Complete a read task with a read grant and handle a write challenge. |
| 5 | Rotate a delegated Session key | Continue with a fresh delegated key while holding the same user and Company association. |
| 6 | Isolate Personal Agent identities by Company | Verify that two Companies receive different opaque User IDs for the same person. |
| 7 | Sign out and keep shopping as a guest | Revoke account access while preserving guest interaction. |
| 8 | Reconnect after Session expiry | Start a fresh Session and recover a task whose account authorization is still valid. |
| 9 | Choose a compatible Poppy document | Select a mutually supported protocol version from discovery. |
| 10 | Give a coding agent a Poppy tool | Pass a structured delivery request to a Poppy client and surface user approval. |
| 11 | Start a Poppy task from Siri | Dictate the request through a Shortcut and open the sign-in or approval screen. |
| 12 | Join an agent-controlled browser to a Session | Verify that the storefront and API see the same Session after the browser join. |

### Store and Company Agent

| # | Cookbook | Success condition |
| --- | --- | --- |
| 13 | Add Poppy discovery to a store | Publish a valid document and let an independent client discover the guest API. |
| 14 | Verify signed Poppy Sessions in an API | Accept a valid signed request and give callers a protocol error when the Session is unavailable. |
| 15 | Let a User sign in to read an order | Read a seeded order with an account grant limited to reads. |
| 16 | Expose a store catalog through MCP | Discover MCP catalog tools and retrieve the requested product. |
| 17 | Describe delivery endpoints with OpenAPI | Let a Personal Agent find the right endpoint and required scopes from the description. |
| 18 | Advertise a website-first implementation | Publish a domain-bound description advertising the website as the supported channel. |
| 19 | Publish supported scope hints | Show whether each scope exposes personal data or can change an account. |
| 20 | Add account-level sign-out | Revoke the Personal Agent grant and observe the next account check require sign-in. |
| 21 | Offer a Company Agent conversation | Send a message and consume the Company Agent’s response with its actor identified. |
| 22 | Stream a Company Agent response | Assemble partial events into a final response without duplicating a streamed message. |
| 23 | Hand a support conversation to a person | Preserve case context and identify the human responder after handoff. |
| 24 | Let the User speak directly to support | Open a linked Direct Conversation and distinguish the User’s messages. |
| 25 | Publish excluded tasks and alternatives | Return a supported alternative when the Personal Agent asks for an excluded task. |
| 26 | Guide agents with a Company skill | Discover the Company’s task guidance and use it to complete a supported request. |

### Interoperability and operations

| # | Cookbook | Success condition |
| --- | --- | --- |
| 27 | Run a Poppy interoperability check | Produce evidence for known-version requirements across both participants. |
| 28 | Verify Company discovery at scale | Record the tested domain, final response, declared version, and observation date. |
| 29 | Verify live capability beyond discovery | Report which declared endpoints worked in an authorized sandbox. |
| 30 | Estimate ecommerce sales coverage | Match storefront observations to comparable merchant or platform sales. |
| 31 | Compare approved and declined outcomes | Verify that only the approved proposal changes the sandbox state. |
| 32 | Reapprove a changed quote | Receive a new revision and show the user the updated terms before applying it. |
| 33 | Retry the same approved operation | Recover from an ambiguous response using the same approval and observe at most one change. |
| 34 | Debug a Poppy exchange with a trace | Identify the failed step using method, endpoint, status, and sanitized evidence. |

### End-to-end workflows

| # | Cookbook | Success condition |
| --- | --- | --- |
| 35 | Reschedule a delivery with exact-term approval | Verify the order moved to the approved delivery day exactly once. |
| 36 | Track a package after account consent | Return the current carrier status for the chosen order. |
| 37 | Compare products as a guest | Return current prices and stock across two stores that expose catalog interfaces. |
| 38 | Exchange a jacket | Verify the approved replacement SKU, price difference, and resulting order. |
| 39 | Change a pickup location | Confirm the new pickup address and deadline before updating the order. |
| 40 | Request a return label | Create a return for the selected item and surface the label or next step. |
| 41 | Replace an out-of-stock grocery item | Obtain approval for the substitution and record the final basket. |
| 42 | Reserve a room with cancellation terms | Confirm the date, rate, and policy and verify a sandbox reservation. |
| 43 | Rebook a disrupted flight | Show the alternate itinerary and fare change before applying it in a sandbox. |
| 44 | Pause a subscription | Show the pause period and next billing date and verify the resulting subscription status. |
| 45 | Review a service quote | Show the exact price and scope and route the approval back to the provider. |
| 46 | Start a UCP checkout from Poppy discovery | Discover the commerce channel and complete an authorized sandbox checkout. |
| 47 | Ask a Company Agent for a store credit | Verify the case outcome, including any handoff and applicable credit terms. |

### Community references

| # | Cookbook | Success condition |
| --- | --- | --- |
| 48 | Cliffside Retail | Complete a store interaction with Atlas and inspect the real request sequence. |
| 49 | Poppy Demo Agent | Connect the demo Agent to a Company supporting its protocol version and inspect the result. |
| 50 | Print with Poppy | Approve an exact print order in the sandbox and observe simulated checkout. |

## Runnable guides

- [Build a Personal Agent](cookbooks/personal-agent.md)
- [Add Poppy discovery to a store](cookbooks/store-discovery.md)
- [Sign in to read an order](cookbooks/direct-sign-in.md)
- [Approve a delivery change](cookbooks/delivery-approval.md)
- [Run a Poppy interoperability check](cookbooks/interoperability.md)
