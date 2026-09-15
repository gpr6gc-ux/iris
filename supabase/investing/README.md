# IRIS Investing — database layer

Everything the Investing tab shows is computed inside Postgres from public market data. Nothing in this folder
calls a model. The rule of the house: **arithmetic sets the numbers; a model may only explain or rank what the
arithmetic already produced.**

Four files, loaded in this order, give you the whole investing backend on a laptop:

| File | What it is | Load time |
|---|---|---|
| `schema_investing.sql` | `inv.*` (14 tables: the data lake) and `market.*` (14 tables: the decision engine), with primary keys and column defaults. Indexes, RLS and grants are left out on purpose — they matter in production, not for understanding the model. | instant |
| `local_stubs.sql` | Local stand-ins for the five things the functions call that live outside this repo (the worker-token gate, the owner/member gate, the audit log, feed health, and the `{ok,data,meta}` envelope helpers). The local worker token is `local-dev-token`. | instant |
| `functions_investing.sql` | Every function, verbatim from production: the compute chain (`market.refresh_*`), the worker lane (`iris_inv_*`, `iris_positioning_*`, `iris_price*`) and the owner lane (`iris2_*`). | instant |
| `seed_investing.sql` | Real public data, generated 14 Sept 2026: 12 underlyings, 400 days of prices for the underlyings and 60 surfaced watchlist names (15,214 bars), 3 regime rows, 60 technicals, 652 decisions, 29 signals, the latest options-chain snapshot per symbol with its 5,365-cell gamma grid, and 400 days of macro (2,129 rows). | ~2 s |

```bash
createdb iris_local
psql -d iris_local -v ON_ERROR_STOP=1 -f schema_investing.sql
psql -d iris_local -v ON_ERROR_STOP=1 -f local_stubs.sql
psql -d iris_local -v ON_ERROR_STOP=1 -f functions_investing.sql
psql -d iris_local -v ON_ERROR_STOP=1 -1 -f seed_investing.sql
```

Postgres 15 or 16, nothing else. Then:

```sql
select market.refresh_all();                                  -- technicals → regime → decisions → macro read
select public.iris_positioning_refresh('local-dev-token');    -- options-chain signals (worker lane)
select public.iris2_investing();                              -- what the Investing tab asks for
select public.iris2_investing_security('NVDA');               -- the drill-down card
select public.iris2_positioning(), public.iris2_positioning_signals();
```

All of the above was verified on a clean Postgres 16 the day the export was made: schema, stubs, functions and seed
load with `ON_ERROR_STOP`, `refresh_all()` recomputes 60 decisions, and `iris2_investing()` returns `ok: true` with
277 longs / 359 shorts across a 652-name universe.

## How the pieces fit

```
inv.prices ─┐
inv.macro ──┤   market.refresh_technicals()   → market.technicals        (trend, momentum, vol, levels per symbol)
inv.ppi ────┤   market.refresh_regime()       → market.regime            ("is the market shaky?" — breadth, vol, curve, GEX)
            ├─► market.refresh_decisions()    → market.decisions         (direction, conviction, posture, why[], four gates)
market.gamma_grid (from CBOE chains via market.ingest_chain)
            └─► market.refresh_signals()      → market.signals           (dealer-positioning signals with gates + noise_prob)
                market.refresh_macro_read()   → market.macro_read        (forward regime from yields, oil, PPI)

public.iris2_investing()  = regime + watchlist + strongest longs/shorts, with freshness and counts   (Investing tab)
public.iris2_investing_security(sym) = one symbol's decision card + factors + levels + sparkline
public.iris2_positioning() / iris2_positioning_signals() = the options lattice and its signals
public.iris2_markets() / iris2_markets_screen(...) = macro, input-cost pressure, catalysts, value screen
```

The `inv` schema is the lake: securities (from SEC `company_tickers.json`), prices (one bar per ticker per day),
fundamentals derived from EDGAR XBRL facts, macro (FRED), PPI (BLS), catalysts (8-Ks and filings), earnings
estimates/actuals, M&A signals, theses and screen runs. The `market` schema is the engine: it never reads anything
that is not in `inv` or its own chain snapshots.

## Two lanes, one rule

- **Worker lane** — `public.iris_*` functions take `p_token text` first. The n8n feeds call these to write rows.
  The gate is `brain.check_app_token`; locally it accepts `local-dev-token`, in production it checks a hashed,
  per-role, revocable token that only the owner can mint.
- **Owner lane** — `public.iris2_*` functions take no token; they run under a signed-in user's JWT and are gated by
  `brain.require_scope('investing')` (owners, or invited members carrying the `investing` scope). They return the
  envelope `{ok: true, data, meta}` or `{ok: false, error: {code, message}, meta}` and never raise to the client.

Every function that changes a number is deterministic: same inputs, same outputs, and the `why[]` on each decision
names the factor and the points it contributed. If you add a factor, add it to `why[]`.

## Contributing to this layer

Send a pull request with a `.sql` file that can be applied on top of these four files (that is how production
migrations are written too). Include, in the PR description, the query you ran locally and its result — reviewers
re-run it. Things that make a PR easy to accept:

- New tables get a primary key and a comment.
- New computed columns come with the formula in a comment and a row in `why[]` or `factors` where the UI shows it.
- Nothing invents data. No fallback constants, no "assume 5% if missing" — a missing input produces a null and a
  labelled gap, exactly like `market.decisions.status = 'no_price_data'`.
- Grading is welcome: `market.signal_outcomes` and `market.backtest_runs` exist and are empty. The first person to
  fill them with a signal grader (5/10/20-day forward returns per surfaced signal) changes what the engine can learn.

Read-only access to the live data (the same schemas, current rows) is available on request from the owner; it is a
separate Postgres login that can read `inv.*` and `market.*` and nothing else.
