# Provider and entitlement matrix

Research-only, from official pricing and documentation pages, verified 2026-09-15. Nothing was purchased, no account
was created. Numbers not on a public page are marked "not verifiable". Re-check before buying: plans change.

| Provider | Responsibility it would own | Entitlement IRIS needs | Streaming? | Delay | History | Rate limit | Price (as published) | Source |
|---|---|---|---|---|---|---|---|---|
| Massive Stocks (ex-Polygon; polygon.io/pricing redirects to massive.com) | Equities EOD, grouped daily, reference data / corporate actions, watchlist quotes | Basic: grouped daily "included in all Stocks plans". Starter: websocket minute/second aggregates. Developer: + websocket trades. Advanced: websocket NBBO quotes | Starter+ aggregates; Developer+ trades; Advanced only quotes | Basic EOD; Starter/Developer 15-min; Advanced real-time | 2y / 5y / 10y / 20y+ | Basic "5 API calls / minute"; paid "unlimited" | $0 / $29 / $79 / $199 per month, "individual use only" | [pricing](https://massive.com/pricing) · [quotes WS](https://massive.com/docs/websocket/stocks/quotes) · [grouped daily](https://massive.com/docs/rest/stocks/aggregates/daily-market-summary) |
| Massive Options | Chains, Greeks/IV, daily OI | Starter (chain snapshot "not included" on Basic). Developer: websocket trades. Advanced: websocket quotes | Starter+ aggregates; Developer+ trades; Advanced quotes | Starter/Developer 15-min; Advanced real-time; "real-time Greeks and IV" from Starter | 2y / 2y / 4y / 5y+ | as Stocks | $0 / $29 / $79 / $199 per month | [pricing](https://massive.com/pricing?product=options) · [chain snapshot](https://massive.com/docs/rest/options/snapshots/option-chain-snapshot) · [OPRA](https://massive.com/options) |
| Unusual Whales API | Options flow/tape, flow alerts, OI change, GEX | API Basic for REST; websocket "only available through the Advanced plan" | Advanced only (`option_trades`, `flow_alerts`, `quotes`, `gex`) | "all API plans include real-time data" | "2-year historical lookback" | Basic 80,000 req/day; Advanced unlimited/day; per-minute cap not published | Basic $150/mo ($125 annual); Advanced $375/mo ($315 annual); data-only, no dashboard; one-week free trial | [pricing](https://unusualwhales.com/pricing?product=api) · [docs](https://api.unusualwhales.com/docs) |
| Databento OPRA.PILLAR | Full OPRA trades/NBBO (expansion only) | Historical usage-based; live requires a subscription ("usage-based pricing for OPRA live data discontinued 3 June 2025") | Yes, paid plans | Real-time; historical T+1 | since 2013 (full resolution from 2023-02-28) | not published | Historical "from $0.04/GB"; Standard $199/mo, up to 2 devices; Plus/Unlimited annual contract; $125 free credits; minimum spend not verifiable | [options](https://databento.com/options) · [pricing](https://databento.com/pricing) · [OPRA plans](https://databento.com/blog/introducing-new-opra-pricing-plans) |
| Benzinga | News, calendars (earnings, guidance, economics, dividends, splits, ratings) | Licensed key; tiers not public | Websocket streams for earnings and ratings exist | not stated | not stated | "depend on the specific API and the subscription tier"; pagination max 10,000 | Not public ("email licensing@benzinga.com") | [intro](https://docs.benzinga.com/introduction/introduction) · [calendar](https://docs.benzinga.com/api-reference/calendar-api/overview) |
| SEC EDGAR | Filings, submissions, XBRL facts, 13F | None; descriptive User-Agent with a contact | No (poll) | submissions < 1 s; XBRL under a minute | full-text search since 2001 | 10 requests/second | Free | [APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) · [access policy](https://www.sec.gov/os/accessing-edgar-data) · [13F FAQ](https://www.sec.gov/rules-regulations/staff-guidance/division-investment-management-frequently-asked-questions/frequently-asked-questions-about-form-13f) |
| FINRA | Short interest (twice monthly) and daily short-sale volume | None | No | Short interest published ~7 business days after settlement | per schedule | not published | Free | [insight](https://www.finra.org/investors/insights/short-interest) · [schedule](https://www.finra.org/filing-reporting/regulatory-filing-systems/short-interest) |
| Cboe cdn delayed quotes (IRIS's current chain source) | — | None — but see Caveats: automated pulls are prohibited by the site's terms | No | 15 min (stated on the site) | n/a | not published | Free | [quote table](https://www.cboe.com/delayed_quotes/spy/quote_table) · [terms](https://www.cboe.com/terms/) |
| FRED / ALFRED | Macro history and point-in-time vintages | Free API key | No | n/a | `realtime_start`/`realtime_end` vintages | 120 requests/minute | Free; attribution line required | [docs](https://fred.stlouisfed.org/docs/api/fred/) · [realtime](https://fred.stlouisfed.org/docs/api/fred/realtime_period.html) · [terms](https://fred.stlouisfed.org/docs/api/terms_of_use.html) |

## Recommended minimal configuration

One primary provider per responsibility; nothing overlapping.

| Responsibility | Primary | Cost | Notes |
|---|---|---|---|
| Equities EOD + reference data | Massive Stocks Basic | $0 | Already in use (grouped daily). Reference tickers (`/v3/reference/tickers`) also on Basic — the security master repair uses it. |
| Live quotes for the 20–50 name watchlist | Massive Stocks Starter | $29/mo | 15-minute-delayed websocket minute/second aggregates. A true NBBO quote stream exists only on Advanced ($199, real-time). The station adapter is written against the websocket contract and reports its entitlement honestly. |
| Options chains / OI / Greeks | Massive Options Starter | $29/mo | Chain snapshot with daily OI and real-time Greeks/IV. **Replaces the Cboe pull** (see Caveats). |
| News / calendar / expectations | Benzinga (quote required) | not public | Free stopgap: 8-K and earnings-release detection from EDGAR (already running). |
| Filings, ownership | SEC EDGAR | free | 13F: long positions only, ≥$100M managers, due 45 days after quarter end; small positions may be omitted. |
| Macro | FRED / ALFRED | free | Use ALFRED vintages for point-in-time backtests. |
| Short data | FINRA | free | Short interest ≠ short-sale volume; the daily file is off-exchange volume only. |

Minimal paid footprint: **$58/month** (Massive Stocks Starter + Options Starter). Expansion path, priced separately:
Unusual Whales API Basic ($150/mo) for flow/GEX REST; Advanced ($375/mo) for streamed option trades; Massive Advanced
($199/mo per asset class) for real-time quotes; Databento Standard ($199/mo + usage) only for full OPRA tick replay.

## Caveats

- **Cboe.** The delayed-quotes page states that downloading delayed quote table data by auto-extraction programs or
  software is strictly prohibited and that Cboe blocks offending IP addresses; the site terms permit personal
  non-commercial use only. The JSON endpoint IRIS pulls (`cdn.cboe.com/api/global/delayed_quotes/options/*.json`)
  is the page's own data source and carries no separate licence. **The current positioning feed is exposed** —
  owner decision: replace it with Massive Options Starter (adapter ready to point at it) or turn the feed off.
- **Massive.** Individual plans are "individual use only"; redistribution and display rights are not on the pricing
  page — a shared Command Center with an invited member is personal research, not redistribution, but confirm before
  showing Massive data to more people.
- **Unusual Whales.** Individual use; all sales final; pricing page is A/B tested — confirm at purchase.
- **Databento.** OPRA-specific Standard price and per-schema $/GB not shown publicly; internal/external redistribution
  after 24 h for most datasets; licence fees pass through.
- **Benzinga.** No public pricing, tiers, limits or delay figures.
- **SEC.** The full-text search API (`efts.sec.gov`) is undocumented on sec.gov; treat it as best-effort.
- **FRED.** Third-party series need the owner's permission for anything beyond personal use.
