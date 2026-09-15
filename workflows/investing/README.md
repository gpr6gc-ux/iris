# IRIS Investing — the feeds (n8n)

The database never fetches anything itself. Ten n8n workflows pull public data on a schedule and write it through
the worker lane (`public.iris_*`, token-gated). This folder holds a **redacted export** of each one so you can read
exactly how a feed is built, import it into your own n8n to experiment, or propose a change as a pull request.

Redaction: every `credentials` block is removed, the worker token reads `<<IRIS_TOKEN>>`, and the Supabase API key
header reads `<<REDACTED>>`. The Supabase project URL and the publishable key in `js/config.js` are public by design.
To run one of these against your own local stack you need an n8n instance, a `p_token` your database accepts
(locally: `local-dev-token`, see `supabase/investing/local_stubs.sql`) and a PostgREST in front of Postgres — or
simply rewrite the HTTP nodes as `psql` calls; the payload shapes are the interesting part.

| Workflow (file) | Schedule (UTC) | Reads | Writes through | Needs |
|---|---|---|---|---|
| **Daily Price Feed** (`daily-price-feed.json`) | daily 23:15 | Massive grouped-daily aggregates — one request returns every US ticker's OHLCV for the previous session | `iris_inv_prices_bulk` (3,000-row chunks), `iris_feed_report`, `iris_stream_emit` | `PRICE_API_KEY` (vault) |
| **Market: Macro Daily** (`market-macro-daily.json`) | daily 11:15 | FRED `fredgraph.csv`, 10 series: DGS10, DGS2, T10Y2Y, DFF, MORTGAGE30US, DCOILWTICO, DCOILBRENTEU, CPIAUCSL, UNRATE, T10YIE | `iris_inv_series` (kind `macro`), `iris_inv_catalyst` (WTI > 4 % or 10-year > 15 bp in 5 sessions), `iris_feed_report` | keyless |
| **Positioning: CBOE Options Ingest** (`positioning-cboe-options-ingest.json`) | 14:00, 17:00, 20:00 weekdays | CBOE delayed-quotes chains for SPY, QQQ, IWM, DIA, NVDA, TSLA, AAPL, AMD, META, MSFT, AMZN, GOOGL | `iris_positioning_ingest` per symbol, then `iris_positioning_refresh` | keyless |
| **Earnings & 8-K Catalyst Feed** (`earnings-8k-catalyst-feed.json`) | hourly at :07 | SEC EDGAR full-text search (8-K, today + yesterday), SEC submissions API for acceptance times | `iris_inv_catalyst_upsert`, `iris_stream_emit` | keyless |
| **Earnings Estimates & Actuals** (`earnings-estimates-actuals.json`) | daily 11:30 | Alpha Vantage `EARNINGS_CALENDAR`; EDGAR EX-99.1 press releases; Claude extracts GAAP / non-GAAP EPS and revenue from the release text, spend-governed | `iris_inv_estimates`, `iris_inv_earnings_pending`, `iris_inv_earnings_actual`, `iris_spend_check`, `iris_spend_record`, `iris_stream_emit` | `ALPHAVANTAGE_KEY`, Anthropic credential |
| **EDGAR Fundamentals Feed** (`edgar-fundamentals-feed.json`) | daily 04:15 | SEC XBRL `companyfacts` for up to 20 CIKs lacking coverage, 4 per 1.1 s | `iris_inv_ciks_needing_facts`, `iris_inv_facts`, `iris_inv_fundamentals` | keyless |
| **Market: Filings Radar** (`market-filings-radar.json`) | hourly at :20 | SEC EDGAR daily form index (10-K, 10-K/A, 10-Q, 10-Q/A) | `iris_inv_catalyst` (kind `filing`, ≤ 60 per run) | keyless |
| **Market: Input Cost Watch** (`market-input-cost-watch.json`) | monthly, 16th 14:00 | BLS public API v1, 17 PPI series (steel, aluminum, copper, lumber, resins, trucking, rail, power, gas, semiconductors, diesel, crude, food) | `iris_inv_series` (kind `ppi`) | keyless |
| **8-K Healthcare M&A Signal** (`8k-healthcare-ma-signal.json`) | daily 12:05 | SEC EDGAR full-text search, "healthcare acquisition", 8-K, first 50 hits | `iris_mna_upsert` | keyless |
| **Scout: Markets** (`scout-markets.json`) | daily 21:15 | FINRA Reg SHO daily short volume, EDGAR Form 4 feed, CBOE SPY chain → GEX; an analyst model scores the sweep against a fetched doctrine | `iris_task_start/finish/event`, `iris_get_prompt`, `iris_ingest_document`, `iris_file_claim` | Anthropic credential; service-role via n8n variables |

The one model call in the write path (earnings actuals) extracts numbers from a document that already contains them;
it does not estimate anything. The Scout is the exception that proves the rule: it *scores and files claims* — it
never writes to `inv.*` or `market.*`.

## Feed truth

Every feed reports its run with `iris_feed_report(feed, ok, rows, error)`. Zero rows written counts as a failure,
and a feed that stops reporting shows as stale on the Command Center within its expected interval. If you touch a
feed, keep the report call and keep it honest: a caught error must reach `p_error`, not be swallowed into a green run.

## Patterns worth copying

- **Idempotent writers.** Every `iris_inv_*` upsert keys on natural identity (ticker + date, accession number,
  series + period). Re-running a feed never duplicates a row.
- **Chunking.** Large payloads go in 3,000-row chunks; Postgres statement budgets are 90 s on the ingest functions.
- **Contact headers.** SEC, FRED and BLS require a descriptive `User-Agent` with a contact address. Keep it.
- **Keys never in nodes.** Feeds fetch their API key at run time with `iris_secret_get` from the IRIS vault, or from
  n8n variables — never a literal in a node. If a workflow needs a key the owner has not set, it should record a
  failed run saying so (see "Note Price Key Not Set" in the price feed) rather than pretend.

## Proposing a new feed

Open a pull request with the exported workflow JSON (strip credentials the way these are stripped), a paragraph on
the source (URL, terms of use, rate limits), the writer function it calls (new ones go in
`supabase/investing/` as a migration), and one sample payload. Sources with usage terms that forbid automated
collection are declined on principle — the Nasdaq earnings calendar and Yahoo chart endpoints were retired for that
reason in September 2026.
