# Contributing to IRIS Investing

Welcome. This repository is the source of the IRIS Command Center (the web app), the investing database layer
(`supabase/investing/`) and the investing feeds (`workflows/investing/`). Contributors work on **Investing**; the
rest of the app is here because the Investing tab is one page of it, and you will want to run the whole thing.

The one rule that governs every change: **arithmetic sets the numbers, and a model never invents one.** A decision
card says "long, conviction 62" because deterministic SQL computed 62 from prices and options data, with a `why[]`
that names every factor and its points. If you cannot write the formula, it does not ship.

## What you get, what you don't

You get: this repo (read, branch, pull request), the Investing tab on the live site as an invited member, a
laptop-sized copy of the investing database (`supabase/investing/`, real data as of the export date), readable
exports of every feed, and — on request — a read-only login to the live investing schemas.

You don't get, and don't need: the Supabase service-role key, Netlify, the n8n instance, or any API key. Production
writes happen only through the owner: SQL changes are applied by the owner as migrations after review, and the site
deploys from `main`. This is not distrust; it is how the system stays auditable. Everything you build is testable
locally without any of it.

## Running the app locally

No build step, no framework, no `npm install`. Any static server works:

```bash
python3 -m http.server 8080
# http://localhost:8080/?preview#/markets           the Investing tab on sample data, as the owner sees it
# http://localhost:8080/?preview&as=member#/markets  what an invited member sees (Investing + Settings only)
```

`?preview` routes every RPC to `js/fixtures/*.js` — no network, no sign-in, a persistent "Preview · sample data"
banner. That is where front-end work happens. For real data, use the Investing tab on the live site with your invited
email (magic link), or the read-only database login.

Before you push: `node --check js/pages/markets.js js/fixtures/investing.js js/fixtures/index.js js/app.js`.
There is no test runner in this repo; the verification is opening the page in preview at 1280 and 390 px wide and
checking the populated **and** the empty state.

## Where Investing lives

| Layer | Files | Notes |
|---|---|---|
| Page | `js/pages/markets.js` | Decision-first surface: regime read, watchlist, strongest longs/shorts, positioning lattice, signals, per-symbol drill-down (`openSecurity`). Built with `h()` from `js/util.js`, `load()` from `js/pages/_common.js`, pills/panels from `js/ui.js`, sparklines from `js/charts.js`. |
| Sample data | `js/fixtures/investing.js`, registered in `js/fixtures/index.js` | Must mirror the real RPC response field-for-field. Grab a real response (local Postgres: `select public.iris2_investing();`) and match it. |
| Styles | `styles.css` — the `Investing — decision surface` block (from `.dec-card` on: `.posture-badge`, `.conv`, `.lvl`, `.why-chip`, the lattice and the signals) | Design tokens only: `--card`, `--border`, `--foreground`, `--muted-foreground`, `--primary`, `--good-ink`, `--sev-high-ink`, `--sev-medium-ink`, `--radius`. Digits in columns get `font-variant-numeric: tabular-nums`. |
| Backend | `supabase/investing/` | Schema, functions, seed and a README with the load order and the compute chain. |
| Feeds | `workflows/investing/` | Redacted n8n exports and a README with every schedule and every writer function. |
| Access model | `js/app.js` (`isMember`, `PAGE_SCOPE`), backend `brain.require_scope` | Owners see everything; members carry scopes (today: `investing`) and see the Investing tab and Settings. Owner manages members under Governance › Members. |

## The RPC contract

The page talks to Postgres through PostgREST: `POST /rest/v1/rpc/<function>` with the signed-in user's JWT
(`js/api.js`). Every owner-lane function returns the same envelope, and never throws to the client:

```json
{ "ok": true,  "data": { … }, "meta": { "as_of": "…", "took_ms": 12, "version": "2.0" } }
{ "ok": false, "error": { "code": "forbidden | not_found | invalid | conflict | timeout | internal", "message": "…" }, "meta": { … } }
```

The six functions a member can call:

| Function | Returns |
|---|---|
| `iris2_investing()` | `regime`, `watchlist[]`, `longs[]`, `shorts[]`, `counts`, `freshness`, `as_of`, `scope_note` |
| `iris2_investing_security(p_symbol)` | `decision` (the card), `factors[]`, `technicals`, `fundamentals`, `history` (closes for the sparkline) |
| `iris2_markets()` | `macro[]`, `pressure[]` (PPI → industries), `catalysts[]`, `screen`, `sparks`, `feeds` |
| `iris2_markets_screen(p_max_ps, p_max_pb, p_max_pe, p_limit)` | `rule`, `params`, `results[]`, `n`, `coverage`, `blocked_by`, `screen_run_id` |
| `iris2_positioning()` | `underlyings[]` (net dealer gamma, gamma flip, call/put walls per symbol), `coverage`, `as_of`, `note` |
| `iris2_positioning_signals()` | `signals[]` (conviction, `noise_prob`, four gates, `gate_detail`), `counts`, `as_of`, `note` |

Adding a field is a three-place change: the SQL function, the fixture, the page. Renaming or removing one is a
contract change — say so in the PR title.

## Rules of the road

1. **Honest states.** Every view has a real loading, empty, not-connected and error state. Never render a placeholder
   number as if it were live; the fixtures exist so preview can be honest about being sample data.
2. **No invented numbers.** No fallback constants, no "assume if missing". A missing input yields a null and a labelled
   gap (`status: 'no_price_data'` is the pattern).
3. **Decision-support, not advice.** Copy says what the arithmetic found and what would invalidate it. It never says
   "buy".
4. **Deterministic first.** If a model is involved anywhere, it explains or extracts; it does not set a score. State
   in the PR where the model is and what bounds it.
5. **Tokens, not colours.** No hex values in new CSS; no new external hosts (the CSP in `netlify.toml` allows this
   origin, cdnjs, Google Fonts, Supabase and OpenStreetMap tiles, nothing else).
6. **Sources with terms.** Public data with terms that permit automated access only. If in doubt, ask before building
   the feed.
7. **Secrets never enter the repo.** The publishable Supabase key in `js/config.js` is the only key that belongs here.
   If you find anything that looks like a secret, tell the owner privately and do not open an issue about it.

## Pull requests

Branch from `main`, keep PRs to one change, and describe what you ran and what it returned (a query and its output,
a screenshot of the page in preview at both widths). The owner reviews, applies any SQL to production as a migration,
merges, and the site deploys. If Netlify deploy previews are enabled on the repo, your PR gets a preview URL running
your branch against the live backend — sign in with your invited email to see it on real data.

Good first contributions, in order of how much they would change what the engine can do:

1. **A signal grader.** `market.signal_outcomes` exists and is empty: `(signal_id, horizon)` → spot at signal, spot
   forward, `ret`, market return, abnormal return `ar`, cumulative `car`, `success`. Fill it for every surfaced signal
   at 5-, 10- and 20-day horizons from `inv.prices`, then write a `market.grader_summary()` the Investing tab can
   show. No model anywhere.
2. **Securities refresh.** `inv.securities` comes from SEC `company_tickers.json` and goes stale after listing
   changes. A feed that diffs it weekly and marks delistings with `excluded_reason`.
3. **A regime backtest.** `market.backtest_runs` exists for this: for each historical regime state, what did the
   surfaced decisions do over the following 20 sessions? A table and one chart, deterministic end to end.
