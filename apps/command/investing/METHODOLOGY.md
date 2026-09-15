# IRIS Investing — methodology

What every surfaced number is, how it is computed, and what it is not. The rule underneath all of it: **arithmetic
sets the numbers; a model may explain or extract, never invent a score, level, probability or return.** Every function
named here is deterministic — same inputs, same output.

## Freshness and time

Time is kept in UTC and shown in America/New_York. Freshness is defined against the **exchange session calendar**
(`market.sessions`, XNYS holidays and early closes hand-entered for 2025–2027), never calendar days:

- **Daily datasets** (`market.daily_state`): `LAST_SESSION` (newest observation is the last completed session),
  `DELAYED` (one session behind — the feed normally catches up before the next open), `STALE` (two or more behind),
  `UNAVAILABLE` (nothing observed).
- **Intraday, provider-delayed datasets** (`market.intraday_state`): the CBOE chain is 15 minutes delayed by contract;
  a snapshot reads `DELAYED` within the delay + 20-minute grace during a session, `LAST_SESSION` outside hours,
  `STALE` beyond that. When the provider's own timestamp was not recorded, the state is computed from receipt time and
  the response says so (`basis: "received_at …"`) rather than pretend receipt time is event time.
- **Live quotes** (`md.quotes_latest`): `LIVE` only from a connected, entitled real-time stream; `DELAYED` from an
  entitled delayed stream; `DISCONNECTED` when no adapter is writing; `HALTED` when the provider says so. The read side
  recomputes this at query time, so a badge can never outlive its feed.

Event occurrence, publication, ingestion and calculation are separate fields everywhere they exist
(`event_time`/`source_as_of`, `published_at`, `received_at`, `computed_at`). A September 10 bar ingested on September 14
stays dated September 10.

## The decision engine (`market.refresh_decisions`)

Six factors are scored on the newest daily bar of each name with ≥ 60 bars: trend structure (SMA20/50/200 stack and
golden/death cross), distance to the 200-day, 1m/3m momentum, RSI(14), Bollinger %B, and a valuation overlay from
EDGAR fundamentals (P/S, P/E, profitability, leverage). The weighted sum is scaled by a regime multiplier
(`market.regime`) into a −100…+100 direction score; a dead-zone sets neutral. Conviction is `|score|`.

- **Levels.** Entry is the last close. The invalidation (`stop_ref`) is the nearest of the 20-day, 50-day or the
  Bollinger band on the correct side; `stop_basis` names which one, or `fallback_5pct` when none is on the right side —
  and a fallback level can never make a decision "explained" or actionable. The **2R level is a scenario reference**
  (`entry + 2 × (entry − stop)`), not a forecast. "Stop distance" is `(entry − stop) / entry` — not portfolio risk,
  not a maximum loss.
- **Gates.** A decision surfaces only if it passes four gates: fresh (≤ 1 session behind), verified (≥ 60 bars),
  explained (a real, non-fallback level), and multi-dimensional. The multi-dim gate counts, by default, the legacy
  factor agreement; a stricter reading counts **independent evidence families** (trend, momentum, valuation), and both
  counts are shown on every card. The owner flips `market.params.decisions.multidim_mode` from `factors` to `families`
  when ready; the correlated-indicator caveat (five of six factors are functions of the same close series) is why the
  family count exists.
- **Price state.** A name two or more sessions behind is `stale`, is never actionable, and says "stale" — not "watch".

## Options positioning (`market._ingest_chain`, `market.refresh_signals`)

Dealer gamma exposure per strike is `(γ_call·OI_call − γ_put·OI_put) × 100 × spot² × 1%` — the dollar hedge change for
a 1% underlying move, under the stated convention that dealers are long calls and short puts. It is an **estimate**
from the CBOE 15-minute-delayed chain with vendor Greeks and prior-session open interest, and every snapshot records
those three effective times separately (`source_as_of`, `oi_business_date`, `greeks_source`). Walls and positive/
negative-gamma regimes are conditional context, not guaranteed support, resistance or price behaviour. The gamma flip
(`zero_gamma`) is the nearest cumulative-GEX sign change and is null when none exists — absence is returned, not forced.

## Regime (`market.refresh_regime`) and macro read (`market.refresh_macro_read`)

Breadth (fraction above the 50/200-day), a market-proxy realized-vol percentile, the 2s10s curve and dealer GEX
combine, with published weights, into a 0–100 stability score and a state (calm/normal/elevated/shaky). The macro read
turns yields, oil and PPI into a forward posture. Both carry an `explain` string listing their inputs.

## Evaluation (`market.grade_outcomes`, `market.outcome_summary`)

Nothing is graded from the overwritten `market.decisions` row. The unit of evaluation is a **publication** — the first
surfacing of a direction, captured immutably in `market.decision_history` (decisions) and `market.signal_publications`
(signals). For each publication and each 5/10/20-session horizon:

- **Execution** is the first close at or after `first_eligible_execution_at` = publication + 5 minutes, or the next
  open + 5 minutes if published after hours. An after-close call is never filled at that same close.
- A **10 bp round-trip cost** is deducted (`ret_net`). The benchmark is **SPY, fixed**; if its bars are missing the
  outcome is `benchmark_unavailable` and gets no success verdict — nothing is substituted.
- `ar` = direction × (stock − SPY) over the horizon; `car` = direction × Σ daily (stock − SPY), null if any bar is
  missing. Stops are **not applied**: daily closes cannot order an intrabar stop/target hit, so `path_ambiguous` is
  true and only horizon returns are measured.
- Outcomes are immutable per (publication, horizon, grader_version); a new definition adds rows, never overwrites, and
  re-running the grader creates no duplicates.

`outcome_summary` reports hit rate with a Wilson 95% interval, mean net and abnormal return, and a `validation_status`
that stays "insufficient" below 30 graded outcomes per horizon. Heuristic scores are labelled heuristic, never
probabilities. As of the first grading run (15 Sept 2026) every publication is younger than one horizon, so there are
zero graded outcomes — there is no track record yet, and the UI says so rather than imply one.

## What this system does not claim

No institutional access, no predictive superiority, no guaranteed profit, no knowledge of anyone's portfolio. It
connects observed market data to a documented, deterministic read and is decision-support, not advice.
