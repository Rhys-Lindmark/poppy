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
