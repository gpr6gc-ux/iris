# IRIS Investing — data dictionary

The tables and functions a contributor touches, and what each field means. Schemas: `inv.*` (the data lake), `market.*`
(the decision engine), `md.*` (the provider-neutral live layer). Full DDL is in `supabase/investing/schema_investing.sql`
and the dated migrations; this is the map.

## inv.* — the lake

| Table | Key | What it holds |
|---|---|---|
| `prices` | (ticker, d) | one daily bar per ticker: close, volume, source. Split-adjusted from Massive; the retired Yahoo backfill is mixed in the same column (see AUDIT §"Adjusted prices"). |
| `securities` | ticker | security master from SEC `company_tickers.json`: cik, name, exchange, sic, kind, is_active, excluded_reason. Stale after listing changes — superseded by `md.instruments` for identity. |
| `fundamentals` | cik | derived from EDGAR XBRL: revenue_ttm, net_income_ttm, equity, shares, assets, liabilities, cash, debt, as-of dates, currency. |
| `facts` | (cik, concept, …) | raw XBRL facts since 2022. |
| `macro` | (series_id, d) | FRED series (yields, curve, oil, CPI, unemployment). |
| `ppi` | (series_id, period) | BLS producer price indices; `ppi_map` links a series to beneficiary/victim SIC codes. |
| `catalysts` | id | 8-Ks, filings, scored events: kind, headline, ticker/cik, event_type, item_code, at, accepted_at, url, source. |
| `earnings_estimates` / `earnings_actuals` | ticker+period | consensus and reported EPS/revenue. |
| `mna_signals` | accession | healthcare M&A 8-Ks. |
| `theses` (inv) | id | the older flat thesis table; superseded by versioned `market.theses`. |
| `screen_runs` | id | saved value-screen parameters and results. |

## market.* — the engine

| Table / view | Key | What it holds |
|---|---|---|
| `sessions` | session_date | XNYS trading sessions with open/close in UTC, early-close flag. The basis for every freshness state. |
| `technicals` | symbol | SMA20/50/200, RSI14, Bollinger (mid/upper/lower/%B/bw), returns (1w/1m/3m/6m), 52w hi/lo/position, realized vol, volume z, trend stack, cross state, n_obs, as_of, computed_at. Overwritten each refresh. |
| `regime` | as_of | market regime: state, stability, breadth, proxy vol + percentile, curve, GEX regime, factors (weights/subscores/explain). |
| `decisions` | symbol | the current decision per name (overwritten): direction, posture, conviction, dir_score, entry/stop/target_ref, **stop_basis**, risk_pct, rr, four gates, surfaced, status, **price_state**, **sessions_behind**, **evidence_families**, **families_agree**, why[], factors[], model_version, has_fundamentals. |
| `decision_history` | id (append-only) | every material change to a decision. change_kind (new/direction/surfaced/unsurfaced/update), **is_publication**, all decision fields frozen at that moment, model_version, params_version. Immutable (trigger-enforced). |
| `chain_snapshots` | id | one options snapshot per (symbol, as_of): spot, net_gex, zero_gamma, call/put_wall, regime, OI totals, contracts, expiries, **source_as_of**, **received_at**, **oi_business_date**, **spot_as_of**, **greeks_source**, meta.gex_units. |
| `gamma_grid` | (snapshot_id, expiry, strike) | per-strike call/put OI, gamma, volume, dealer_gex. |
| `signals` | id | dealer-positioning signals (overwritten each refresh): kind, behavior, direction, conviction, noise_prob, four gates, gate_detail, evidence, factors, invalidation, headline, status, dedupe_key. |
| `signal_publications` | id (append-only) | first surfacing of a (symbol, kind, direction) signal, inputs frozen; `signal_publication_seen` tracks last-seen for the 36 h re-publication rule. |
| `publications` (view) | — | decision publications + signal publications: the units the grader evaluates. |
| `outcomes` | (pub_kind, pub_id, horizon, grader_version) | graded horizon returns: exec/exit session+price, ret_gross, cost_bp, **ret_net**, bench_symbol, bench_ret, **ar**, **car**, success, **path_ambiguous**, state (graded/benchmark_unavailable). Immutable per key. |
| `benchmarks` | role | the fixed benchmark per asset class (us_equity → SPY). |
| `theses` (market) | id (append-only) | versioned thesis: thesis_key, version, claim, mechanism, supporting[], contradicting[], next_test, invalidation, horizon, owner, status, review_date, linked_catalysts[], superseded_by. `theses_current` = latest non-superseded per key. |
| `params` | key | tuning: `decisions.multidim_mode` (factors|families), `decisions.model_version`, `grader.cost_bp_round_trip`. |

## md.* — the provider-neutral live layer

| Table | Key | What it holds |
|---|---|---|
| `instruments` | md_id | stable security identity; figi/cik/name/listing_state; a ticker vanishing from one source never deactivates it. |
| `symbols` | (md_id, symbol, valid_from) | effective-dated ticker history; a ticker change adds a row and closes the old one. |
| `watchlist` | symbol | the 20–50 liquid names the streaming layer covers, benchmarks flagged. |
| `quotes_latest` | symbol | coalesced latest quote: last/bid/ask/session_volume, provider, dataset, **event_time**, **received_at**, **entitlement_delay_s**, **state** (LIVE/DELAYED/LAST_SESSION/STALE/HALTED/DISCONNECTED/UNAVAILABLE), quality_flags, source_seq. |
| `feed_state` | feed | live health per dataset: connected, entitlement, transport, symbols_subscribed, messages_1m, gaps_detected, p50/p95/p99 lag, state. |

## The functions the app calls (owner + member, `{ok,data,meta}` envelope)

| Function | Returns |
|---|---|
| `iris2_investing()` | regime, counts (by_status/by_price_state), watchlist, longs, shorts, **feeds** (per-dataset state + exact times), scope_note |
| `iris2_investing_security(sym)` | decision card (with levels provenance, price_state, families), technicals, fundamentals, history |
| `iris2_investing_queue(since_sessions)` | ranked **items** (material changes), **upcoming** catalysts, theses_open |
| `iris2_investing_outcomes(sym)` | grader summary (per horizon, Wilson CI, validation_status), pending, this symbol's graded outcomes |
| `iris2_positioning()` / `iris2_positioning_signals()` | the lattice and signals (labelled estimates) |
| `iris2_markets()` / `iris2_markets_screen(...)` | macro, PPI pressure, catalysts, the value screen |
| `iris2_md_quotes()` | live watchlist quotes with a state recomputed at read time, and the feed's health |

Worker-lane writers (token-gated, n8n / the station): `iris_inv_prices_bulk`, `iris_positioning_ingest`,
`iris_positioning_refresh`, `iris_price_sessions_missing`, `iris_market_refresh`, `iris_feed_state`,
`iris_md_quotes_upsert`, `iris_md_feed_state`, plus the `inv_*` feed writers.
