# IRIS Investing — evidence-based audit

Audit date: 15 September 2026, 00:00–01:00 UTC, against the live Supabase project, the n8n execution log and the
repository at commit `e1896e2`. Every finding is tagged **verified** (observed directly: SQL result, function text,
execution record), **inferred** (follows from verified facts but not observed end-to-end) or **unresolved**.

## 0. The path every surfaced number takes

```
Massive grouped-daily (close, volume; one request per session)          n8n "Daily Price Feed" 23:15 America/New_York
  → public.iris_inv_prices_bulk(p_token, rows)  → inv.prices (ticker, d, close, volume, source)   PK (ticker, d)
  → market.refresh_technicals()  (row-window SMA20/50/200, RSI14, %B, rvol20, vol z, 52w, returns; needs ≥60 bars)
  → market.refresh_regime()      (breadth, proxy vol, curve, dealer GEX → state/stability)    one row per as_of
  → market.refresh_decisions()   (six scored factors → dir_score → posture, levels, four gates, surfaced) PK symbol
  → public.iris2_investing()     (regime, counts, watchlist, longs, shorts, freshness)          Investing tab
CBOE delayed quotes JSON (15-min delayed chain, vendor Greeks, prior-close OI)   n8n "CBOE Options Ingest" 14/17/20 ET
  → public.iris_positioning_ingest → market._ingest_chain → market.chain_snapshots + market.gamma_grid
  → public.iris_positioning_refresh → market.refresh_signals()  → market.signals
  → public.iris2_positioning() / iris2_positioning_signals()    Positioning + Signals panels
FRED (10 series)  → inv.macro    (11:15 UTC)     BLS PPI (17 series) → inv.ppi (monthly)
SEC EDGAR         → inv.catalysts, inv.facts → inv.fundamentals (valuation overlay factor)
```

`market.decisions` and `market.technicals` are keyed by symbol and overwritten on every refresh. There is no history
of what was surfaced on a given day (verified: PK `symbol`, `on conflict (symbol) do update`).

## 1. Freshness: what "fresh" actually means

| Claim on screen | Where it comes from | Finding |
|---|---|---|
| "Prices · Sep 11 · fresh" | `iris2_investing.freshness.prices_as_of = max(d) from inv.prices`; `prices_stale = (current_date - max(d)) > 4` | **verified.** The label is a calendar-day heuristic on the newest bar of *any* ticker. One ticker with a new bar makes the whole board "fresh". No session calendar; a Friday close shows "fresh" through Tuesday and "stale" on Wednesday regardless of holidays. |
| Decision `as_of` | `market.technicals.as_of` = date of the ticker's newest bar (`row_number() … order by d desc = 1`) | **verified.** This *is* event time (the bar's session date), correctly preserved. A September 10 bar ingested on September 14 stays dated September 10 (test `T01`). |
| Decision "fresh" gate | `g_fresh = (as_of >= max(as_of over all technicals) - 3)` calendar days | **verified.** Relative to the newest bar in the universe, not to the last completed session. A stale ticker fails the gate and is written with `status = 'watch'` — the same word used for a genuinely fresh non-actionable decision. 19 decisions are in that state today. |
| Signal "fresh" gate | `age_s <= 12600` from `chain_snapshots.as_of` | **verified.** But `as_of` is set in the n8n Code node as `new Date().toISOString()` — **receipt time**, not the CBOE `timestamp` in the payload. Event time is discarded. |
| Positioning "as of" | `max(as_of) from market.chain_snapshots` | **verified** — receipt time of the last ingest (see above). |
| Screenshot (Sep 10 prices "fresh") vs brief (Sep 11 prices) | | **inferred:** the screenshot was taken before the 13 Sep 03:15 UTC run that loaded the Sep 11 session (execution 99751, 12,480 rows). Between 5 Sep 19:18 UTC and 13 Sep 03:15 UTC the newest Massive bar was Sep 4 and the newest Yahoo bar Sep 2; the board would have read "Sep 4 · fresh" until Sep 9 and "feed stale" after. Nothing in the code can produce a "Sep 10" label — the only sessions loaded in September are Sep 1, 2, 4 and 11 — so the screenshot either predates this database state or is of the preview fixture (whose fixture date is Sep 2). **unresolved** without the screenshot's capture time. |

## 2. Stale fallbacks, zeros, and old badges

- **verified.** `refresh_technicals` processes every ticker with ≥60 bars regardless of how old its newest bar is; the
  windows are *row* windows, so a gap in sessions silently shortens the lookback in time (ret_1w = 5 rows back, not 5
  sessions back). Today 10 technicals rows are dated Sep 2, 8 Sep 1, 1 Aug 27.
- **verified.** Missing factor inputs are coerced to zero contribution (`coalesce(trend_stack,0)`, `coalesce(ret_1m,0)`,
  `rsi14 is null then 0`): a missing input does not suppress the score, it quietly scores as neutral. A name with
  no fundamentals gets `s_val = 0` and is still eligible to surface.
- **verified.** `stop_ref` falls back to `close*0.95` / `close*1.05` when no moving average or band is on the correct
  side — a constructed level with no market basis, presented identically to an SMA-based one.
- **verified.** A decision whose price stopped updating keeps its last levels and the word "watch"; nothing says
  "stale".

## 3. Benchmark ETFs and the 12,479 vs 8,002 counts

- **verified.** `inv.prices` holds SPY, QQQ, IWM, DIA with exactly **2 bars each** (2026-09-04 and 2026-09-11).
  The Massive grouped-daily feed does deliver them; the one-year backfill (`source = 'yahoo-1y'`, 324,882 rows) only
  covered the ~1,296 EDGAR-listed common stocks. With <60 bars they never reach `market.technicals`, so
  `iris2_investing` emits `status: 'no_price_data'` with the note **"ETF price feed not connected"** — wrong: the feed
  is connected; the *history* is missing. The scope note "Index ETFs need a price source" is wrong for the same reason.
- **verified.** SPY, QQQ and DIA exist in `inv.securities` with `kind = 'common'` (from SEC `company_tickers.json`,
  which lists the ETF trusts as filers); IWM is absent. The security master cannot tell an ETF from a stock.
- **verified.** 12,479 = tickers with a bar on 2026-09-11 (the whole Massive universe: common, ETFs, ADRs, warrants,
  units); 8,002 = rows in `inv.securities` (EDGAR filers with a ticker); 1,297 = tickers with ≥60 bars (the Yahoo
  backfill set). The counts are not contradictory — they measure three different universes, and the UI presents the
  smallest one as "the universe".

## 4. The price feed is broken on weekdays (root cause of everything in §1–3)

- **verified** (n8n executions 80697…102185, `iris.feed_runs`): the "Daily Price Feed" trigger is labelled "Nightly
  23:15 UTC" but the instance timezone is **America/New_York** — it fires at 03:15 UTC. It requests the bars of the
  *current* ET date (`d = 2026-09-09` at 23:15 ET on Sep 9). Massive's free Stocks Basic plan answers
  `NOT_AUTHORIZED: Attempted to request today's data before end of day`. Only the Friday/Saturday runs, which ask for
  the previous weekday, succeed — hence bars for Sep 4 and Sep 11 only, and no Sep 3, 8, 9, 10.
- **verified.** On 10 Sep the failure was invisible: `Report Feed Run` hit a statement timeout (57014) so no
  `feed_runs` row was written, the run status is `success`, and `Stream Prices Loaded` still emitted an event.
- **verified.** The `Plan Price Date` Code node emits the Massive API key as an item field, so the key is persisted in
  n8n execution data (visible in the execution viewer). It must not travel through item JSON.
- **inferred.** Because the regime is recomputed only when new bars arrive, `market.regime` has 3 rows for the whole
  month (Sep 2, 4, 11): there is no regime history to backtest.

## 5. Options chain: three different effective times in one row

- **verified.** `chain_snapshots.as_of` = ingest wall-clock; `spot` = CBOE `current_price` (15-minute delayed);
  `open_interest` = CBOE's prior-session OI; `gamma` = CBOE's vendor Greek (model unspecified). None of these
  timestamps is stored separately. A 14:00 ET snapshot therefore mixes a 13:45 spot, yesterday's OI and a vendor
  Greek of unknown vintage, and the row says "as of 14:00:07".
- **verified.** `dealer_gex` per cell = (γ_call·OI_call − γ_put·OI_put) × 100 × spot² × 1% — dollar hedge change for
  a 1% move under the convention "dealers long calls, short puts". The note on the Positioning panel says so; the
  card labels ("Call wall — resistance / upside pin") do not. `zero_gamma` is the cumulative-GEX sign change nearest
  spot and is null when none exists — correct behaviour, already implemented.
- **unresolved.** CBOE's delayed-quotes endpoint terms of use for automated collection were not verified in this pass;
  the endpoint (`cdn.cboe.com/api/global/delayed_quotes/options/{SYM}.json`) is a public, undocumented JSON used by
  the CBOE website.

## 6. "Multidimensional" and "verified"

- **verified.** `g_multidim` counts how many of six factors agree in sign with the total: trend stack, distance to
  the 200-day, 1m/3m momentum, RSI(14), Bollinger %B, valuation. Five of the six are functions of the same close
  series; RSI, %B and momentum are strongly correlated by construction. "≥2 of 6 agree" is almost always true for any
  trending name. It is one family (price trend/momentum) plus an optional second (valuation), not two independent
  families.
- **verified.** `g_verified = n_obs ≥ 60 and close > 0 and sma50 is not null` — "verified" means "has 60 bars". It
  verifies nothing about the data (no split check, no duplicate check, no adjusted/unadjusted check). For signals,
  `g_verified` means contracts ≥150, expiries ≥2, OI ≥20,000 — a liquidity floor, again not verification.

## 7–9. Levels, "risk", and options postures

- **verified.** `target_ref = entry + 2 × (entry − stop)`: a constructed scenario level. The UI labels it "2R target".
- **verified.** `risk_pct = (entry − stop) / entry`: the stop distance as a fraction of price. The UI labels it "Risk".
  It is not portfolio risk and not a maximum loss.
- **verified.** `options_posture` is one of eight fixed strings chosen by direction, conviction and regime
  ("Call debit spread or a starter long", …). No contract, quote, IV, expiry or liquidity is consulted.

## 10. Timezones, caches, and the cron

- **verified.** n8n instance timezone is America/New_York (execution timestamps at 03:15 UTC for a "23:15" trigger).
  Four trigger labels in the investing workflows say "UTC" and are wrong by 4–5 hours.
- **verified.** `pg_cron` job `market-decisions-refresh` runs `market.refresh_all()` at 04:15 UTC as `postgres`,
  i.e. one hour after the price feed's slot — correct ordering today, but it must move if the feed moves.
- **verified.** The static site is served with `Cache-Control: public, max-age=300` for `js/*`; a deploy is visible
  within five minutes. RPC responses are not cached. Frontend state is re-fetched on every route render.

## Adjusted prices, splits, duplicates (question 4)

- **verified.** `inv.prices` has close and volume only — no open/high/low, no separate adjusted close. Massive
  grouped-daily is requested with `adjusted=true` (split-adjusted at the provider, as of the request date). The
  Yahoo one-year history (`yahoo-1y`, retired) is stored in the same column; whether it was `close` or `adjclose` is
  **unresolved** (the scraper is gone). The two sources are mixed in one series per ticker, so a split between the
  Yahoo era and the Massive era would produce a false jump. Corporate actions are not tracked anywhere. Duplicates:
  none (PK). Ticker changes: not tracked (symbol is the key). The API key also rides on the request as a query
  parameter (`apiKey=`), which is the provider's documented form but ends up in n8n execution data and any proxy log.
- **verified.** Lookback guards exist (`c200 >= 200` → SMA200 else null; `c252 >= 100` for 52-week), so insufficient
  history yields null, not a short-window number (test `T05`). The 52-week guard at 100 rows is generous.

## What this audit changes (implemented in this branch — see CHECKPOINT.md for status)

1. A session calendar and per-dataset freshness *states* replace the calendar-day heuristic.
2. Event time and receipt time are stored separately for chains; OI carries its business date.
3. Stale prices suppress actionable labels and are named "stale", not "watch".
4. Labels: "2R scenario level", "Stop distance", options postures moved out of the card as unchecked ideas.
5. Append-only publication history for decisions and signals; a grader that never assumes a same-close fill.
6. The price feed asks for the previous completed session, runs after the provider's end-of-day, reports every
   failure, and stops passing the key through item data. A backfill fills SPY/QQQ/IWM/DIA and the rest of the universe.
