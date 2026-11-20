# PoppyVal

PoppyVal evaluates both sides of Personal Agent Protocol. It shows which requirements each Personal Agent or storefront meets, the evidence for each result, and which capabilities are missing or untested. Storefront results also show the sales associated with each level of coverage.

## Personal Agents

Use [David Pawlan’s Assistant Benchmark](https://assistantbenchmark.com/) to seed the roster. Start with Muse, Hark, Grok Bot, Town, Instinct, and Dots where access permits. The [a16z interview](https://a16z.com/podcast/the-personal-agent-race-is-here-anish-acharya-david-pawlan/) explains the consumer-agent cohort. Use our Personal Agent as a control and try the [Poppy Demo Agent](https://poppydemoagent.dev/) against the protocol version supported by the tested build.

Give each product the same prompt and sandbox store. Record the build, interface, version, test date, and relevant store-side evidence. Start with discovery, signed requests, signing in and using granted scopes, and applying an approved delivery change where the relevant extension is supported. Treat optional extensions and interaction channels as capabilities. An agent that can change the delivery through the ordinary storefront has completed the task, but the Poppy checks still need protocol evidence. Record native and adapter-assisted runs with their own results.

### Initial agent evidence

| Personal Agent | Evidence | PoppyVal status |
| --- | --- | --- |
| Bundled Personal Agent | Local HTTPS tests cover the Poppy 1.0 sandbox scenario, including Operations 3. Run `node src/poppyval.mjs`. | Tested in the bundled sandbox |
| Meta Muse | Sierra reports that Muse looks for Poppy when visiting a site. [Sierra announcement](https://sierra.ai/uk/blog/releasing-poppy) | Vendor report. Independent run pending. |
| Poppy Demo Agent | The official demos page lists it at 0.4. Its source documents multiple supported snapshots. [Demos](https://personalagentprotocol.org/docs/demos) [Source](https://github.com/adewale/pda) | Published implementation. PoppyVal run pending. |
| Hark, Grok Bot, Town, Instinct, Dots | [Assistant Benchmark roster](https://assistantbenchmark.com/) | Untested in PoppyVal. |

## Storefronts

Seed the sample from [PAP Checker](https://papchecker.com/sites) and a documented commerce cohort so the sample includes storefronts that have yet to publish a discovery document. Verify the well-known path and version, then record the channels, sign-in methods, and extensions the store advertises. Preserve evidence for where discovery or metadata fails. For test deployments and participating stores, reuse the [official Company validator](https://personalagentprotocol.org/kit/company) and exercise the declared features the test environment supports.

## Results and sales coverage

Each check reports pass, fail, unavailable capability, or untested, together with the requirement, the protocol version, the date, and evidence. Vendor claims and discovery declarations can inform what to test. A pass requires evidence at the level of the check.

Show storefront count, associated online sales in dollars, and share of the defined market for each level of evidence we can support:

1. Publishes a version-valid discovery document.
2. Passes a live Poppy session check.
3. Passes a named workflow, such as a scoped order lookup or an approved order change.

Deduplicate transactions by selling channel before rolling up sales. Marketplace GMV includes third-party sales made on the marketplace. Label platform-level estimates and leave unknown sales weights visible. Use U.S. retail ecommerce as the first market, with calendar 2025 as the baseline year and retailer fiscal periods labeled where applicable.

### Initial market evidence

The Census Bureau’s November 2026 time series puts calendar 2025 U.S. retail ecommerce at about $1.25 trillion. This is the sum of its four unadjusted quarterly estimates. Discovery observations are from public HTTPS GET requests on November 20, 2026. Live Poppy sessions and workflows were untested for this sample. [Census time series](https://www.census.gov/retail/mrts/www/data/delimited/tsnadprectbl3.dat)

| Store or platform | Approximate sales represented | Public discovery evidence |
| --- | --- | --- |
| Amazon US | $440B estimated 2025 GMV, about 35% of the Census market total. [Marketplace Pulse estimate](https://www.marketplacepulse.com/articles/amazon-gmv-surpassed-800-billion-in-2025) | `www.amazon.com` returned HTTP 404. `amazon.com` ended at the same URL. |
| Walmart US | $99.6B of ecommerce-related net sales in the fiscal year ending January 31, 2026. [Walmart 10-K](https://stock.walmart.com/sec-filings/all-sec-filings/content/0000104169-26-000055/wmt-20260131.htm) | `www.walmart.com` returned HTTP 404. |
| Target | $21.1B digitally originated merchandise sales in fiscal 2025. [Target 10-K](https://corporate.target.com/investors/annual/2025-annual-report/10-k-report/10-k-part-i/item-1-business) | `www.target.com` returned HTTP 404. |
| Shopify merchants | About $175B as a platform-level proxy using Shopify’s reported U.S. market share of over 14% and the Census denominator. [Shopify investor relations](https://www.shopify.com/investors) | Sierra reports a platform-wide rollout. `www.allbirds.com` served JSON declaring 0.4. Individual domain behavior varies. [Sierra rollout](https://sierra.ai/uk/blog/releasing-poppy) |

### November 20, 2026 results

[Sales coverage](https://ai.rhyslindmark.com/poppy/coverage.html) shows the 16 storefronts in the named cohort. Five published a recognizable Poppy manifest and 11 returned HTTP 404. The count is for this cohort. Etsy’s 0.3 manifest accounts for approximately $7.74B in 2025 U.S. sales, or 0.62% of the Census denominator, among observed publishing merchants with a measured direct weight. This uses Etsy marketplace GMS of $10.46B and a 74% share from U.S. buyers. Amazon, Walmart, and Target together account for approximately $560.7B in the HTTP 404 group. The Shopify rollout proxy stays outside both named-store totals. [Etsy 10-K](https://investors.etsy.com/sec-filings/all-sec-filings/content/0001370637-26-000019/etsy-20251231.htm)

PAP Checker reported 10,814 publishing domains on November 20, including 7,443 Wix and 3,271 Shopify domains. Its directory covers websites and storefronts that it has observed. [PAP Checker directory](https://papchecker.com/sites)

Refresh the named cohort without overwriting the committed snapshot.

```sh
npm run scan:stores --silent > storefront-results.json
```

The official Company validator reported 11 discovery passes, three discovery skips, and two OpenAPI passes for Commonplace. Use the validator from the [Company implementation kit](https://personalagentprotocol.org/kit/company).

```sh
node validate/index.ts check https://ai.rhyslindmark.com --only discovery. --json
node validate/index.ts check https://ai.rhyslindmark.com --only openapi. --json
```

The [Stacktree simulator](https://poppy-simulator.stacktr.ee/) passed the 1.0 document, version, and organization checks. It flagged HTTP 404 at the protected resource metadata endpoint. [Section 3.2](https://personalagentprotocol.org/docs/1.0/spec#32-oauth-server) permits that response for a Company with no issuer and signed-out access. This run exercised discovery only.

On the same date, the Poppy Demo Agent validator accepted Commonplace 1.0. It also accepted the hosted agent’s separately fetched client metadata and JWKS as 1.0 documents when submitted as pasted JSON. The hosted validator’s own fetch of its client URL returned HTTP 522, while independent downloads of both public documents returned 200. The agent’s signed workflow remains untested by PoppyVal. [Hosted validator](https://poppydemoagent.dev/validator?url=ai.rhyslindmark.com)

In a scratch directory, install [Datalayer's TypeScript SDK](https://github.com/datalayer/personal-agent-protocol) at version 0.37.5 and call its published discovery method.

```js
import { discoverCompany } from '@datalayer/personal-agent-protocol';

await discoverCompany('ai.rhyslindmark.com', { protocolVersions: ['1.0'] });
await discoverCompany('www.allbirds.com', { protocolVersions: ['0.4'] });
await discoverCompany('www.etsy.com', { protocolVersions: ['1.0'] });
// The final call returns unsupported_protocol_version.
```

The [PoppyVal report](https://ai.rhyslindmark.com/poppy/poppyval.html) records these client results, the individual Company validator checks, and the consumer product roster. The [recorded sandbox run](https://ai.rhyslindmark.com/poppy/protocol-trace.html) covers the signed workflow with the seeded account.
