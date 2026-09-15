# IRIS Investing — implementation checkpoint

Working document for the implementation prompt of 14 Sept 2026. If context resets, start here: it says what exists,
what is live, what is next, and the decisions already made. Branch: `investing-foundation` (repo `iris-command`).

Status legend: **live** = applied to the production Supabase project / deployed site; **local** = in the branch and
verified on a clean local Postgres; **awaiting** = built, blocked on a credential/entitlement/owner decision;
**research-only**; **not started**.

## Phase 1 — audit and containment

| Item | Status | Evidence |
|---|---|---|
| Evidence-based audit (§4 of the prompt, ten questions) | done | `investing/AUDIT.md` |
| Exchange session calendar + freshness states (`market.sessions`, `daily_state`, `intraday_state`) | live | migration `20260915_01`, tests T02 |
| Chain snapshots: `source_as_of`, `received_at`, `oi_business_date`, `greeks_source`; ingest accepts provider time | live | `20260915_02`, tests T03, T12 |
| Decisions: `price_state`, `sessions_behind`, `stop_basis`, evidence families, model version; stale → `stale` and never actionable; fallback stops never "explained" | live | `20260915_03`, tests T10, T11 |
| Append-only `market.decision_history` (trigger) with `is_publication` | live | T08 |
| Append-only `market.signal_publications` (+ `_seen`), 36 h re-publication rule | live | T09 |
| `market.benchmarks` (SPY fixed), `market.outcomes`, `market.grade_outcomes()`, `market.outcome_summary()` | live | T04, T06, T07 |
| Feed RPCs `iris_price_sessions_missing`, `iris_market_refresh`, `iris_feed_state` | live | `20260915_05` |
| `iris2_investing` v2: per-dataset `feeds` block with states and exact times, honest watchlist notes, level provenance | live | |
| Price feed repaired in n8n (previous completed session, after provider EOD, failures reported, key kept out of item data) | see §Feeds | |
| Price history backfill (SPY/QQQ/IWM/DIA + universe) | see §Feeds | |
| Investing tab: state pills with ET as-of, relabelled levels, options ideas moved out of the card | see §UI | |

## Decisions made (reversible; say so if you want them changed)

1. **Freshness vocabulary.** Daily datasets: `LAST_SESSION` (0 behind), `DELAYED` (1 behind — the feed catches up
   before the next open), `STALE` (2+), `UNAVAILABLE`. Intraday chain: `DELAYED` (within provider delay + 20 min grace,
   during a session), `LAST_SESSION`, `STALE`, `UNAVAILABLE`. `LIVE` is reserved for a connected streaming source and
   is never emitted today.
2. **Actionable requires ≤ 1 session behind.** A Friday close stays actionable through Monday's session; after
   Monday's close it is DELAYED until Tuesday's 04:30 ET load.
3. **Evidence families** are trend structure (SMA stack, distance to 200-day), momentum (1m/3m, RSI, %B) and valuation.
   A stricter reading (all price-derived signals = one family) would leave valuation and positioning as the only other
   families, which most names lack; that would make nearly every decision WATCH. The gate stays on the legacy
   factor count until `market.params.decisions.multidim_mode = 'families'` is set — the card already shows the family
   counts either way, so the reader sees the truth now and the owner picks the gate.
4. **Grading uses the first close at or after eligibility** (publication + 5 min, or next open + 5 min), a 10 bp
   round-trip cost, SPY as the fixed benchmark, `ar = direction × (stock − SPY)` over the horizon and
   `car = direction × Σ daily (stock − SPY)`. Stops are not applied (daily closes cannot order intrabar hits;
   `path_ambiguous = true`). A new definition is a new `grader_version`; rows are never overwritten.
5. **Options postures are ideas, not proposals.** `_decision_card.options_checked = false`; the UI shows them only in
   the drill-down under "Expression ideas (no contract checked)".
6. **Production application.** Phase 1 migrations are additive (new tables/columns/functions, replaced function bodies
   with rollback notes) and were applied to production in this session, consistent with how every other IRIS change
   has been applied. The only behaviour switch that changes what is surfaced (`multidim_mode`) defaults to the legacy
   value.

## Feeds (n8n)

- Daily Price Feed (`LI6gTJ6PA2hKWVk5`): rebuilt to ask `iris_price_sessions_missing` for what is missing, request
  each missing session (newest first, at most 4 per run, 13 s apart for the free-plan rate limit), report every run,
  trigger `iris_market_refresh` after a load, and never put the key in item data. Trigger 04:30 America/New_York.
- Backfill: the same workflow with a wider lookback runs every 20 minutes until the 260-session window is complete
  (see STATUS.md for progress).
- CBOE ingest: passes the provider `timestamp` as `p_source_as_of`.

## Phase 2 — data foundation (done; see STATUS.md)

- `md.*` provider-neutral contract live (migration `20260916_01`): instruments (stable id), effective-dated symbols,
  watchlist, quotes_latest with truthful state, feed_state. Tests M01–M06.
- Streaming adapter live in the repo (`sidecar/`): reconnect/backoff, resubscribe, per-symbol coalescing, sequence
  dedupe + gap detection, measured lag percentiles, batched flush, heartbeat. 11 tests pass. Runs in REPLAY with no
  key; a `LIVE`/`DELAYED` badge awaits an entitled Massive key (owner decision — `investing/PROVIDERS.md`).

## Phase 3/4 — research + product (done)

- `iris2_investing_queue` (migration `20260916_02`): deterministic prioritized change queue + upcoming catalysts.
  Deployed as the top of the Investing tab ("What changed", "Upcoming catalysts").
- `market.theses`: versioned, append-only thesis records (schema ready; none authored yet).
- Ticker detail: level provenance, evidence families, comparable outcomes — deployed.

## Phase 5 — validation + docs (done)

- Grader live and scheduled (`market-grade-outcomes`, 05:00 UTC). 0 graded outcomes so far — every publication is
  younger than one horizon; this is honest, not a gap. Fills in as sessions pass.
- Docs: `PROVIDERS.md`, `METHODOLOGY.md`, `DATA_DICTIONARY.md`, `STATUS.md`, this file.
- SQL tests (18) + adapter tests (11) all green. `tests/investing/run.sh` runs the SQL suite against a local DB built
  by `supabase/investing/rebuild_local.sh`.

## Open items / not started

- **Owner decisions** (see STATUS.md §"What is blocked"): buy an entitled quote plan or stay REPLAY; replace the
  Cboe positioning pull (prohibited for automated use) with Massive Options.
- Options flow / aggressor classification — needs a trade-level feed; not built on OI-only chains.
- Regenerate `supabase/investing/seed_investing.sql` after the backfill completes so contributors get benchmark
  history and the `md.*` / new `market.*` tables in the sample data.
