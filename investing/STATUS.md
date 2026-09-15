# IRIS Investing — status matrix (15 Sept 2026)

Where every piece of the overhaul stands, in the categories the implementation prompt asked for. "Live" = applied to
the production Supabase project and, for UI, deployed. "Local" = in the branch and verified on a clean Postgres.
"Awaiting" = built, blocked only on a credential or an owner decision. "Research-only" = documented, not wired.

| Item | Status | Evidence / what remains |
|---|---|---|
| **Audit & containment** | | |
| Evidence-based audit (10 questions) | live | `investing/AUDIT.md` |
| Session calendar + freshness states | live | migration 01; tests T02 |
| Chain snapshot effective times (source/received/OI date) | live | migration 02; tests T03, T12; CBOE feed now sends `source_as_of` |
| Truthful decisions (price_state, stop_basis, families, stale) | live | migration 03; tests T10, T11 |
| Immutable decision & signal publication history | live | tests T08, T09 |
| Fixed SPY benchmark + reproducible grader | live | migration 04; tests T04, T06, T07; grader scheduled 05:00 UTC |
| Honest labels in the UI (2R scenario, stop distance, options ideas) | live | deployed; drill-down shows level provenance |
| Data-status strip with exact ET as-of times and states | live | deployed |
| **Data foundation** | | |
| Price feed repaired (previous session, after EOD, failures reported, key out of item data) | live | n8n `LI6gTJ6PA2hKWVk5`; loaded Sep 8/9/10 on the first repaired run |
| Price history backfill (universe + benchmarks) | live/in-progress | same workflow, every 20 min until the 260-session window fills; SPY/QQQ/IWM/DIA climbing toward 60 bars |
| Bulk loader statement budget | live | migration 06 (first run hit the default timeout; fixed) |
| Async recompute (feed → decisions without gateway timeout) | live | migration 08 |
| `md.*` provider-neutral contract (instruments, symbols, watchlist, quotes, feed_state) | live | migration `20260916_01`; tests M01–M06 |
| Streaming adapter (station) with reconnect/dedupe/gap/coalesce/lag | live (repo) / awaiting key | `sidecar/market-stream.js`; 11 tests pass; REPLAY mode runs with no key |
| Massive websocket client | awaiting key | `sidecar/providers/massive.js`; field mapping unverified until observed against an entitled key |
| Provider / entitlement matrix | research-only | `investing/PROVIDERS.md` |
| **Research layers** | | |
| Prioritized change queue (what materially changed) | live | migration `20260916_02`; `iris2_investing_queue`; deployed |
| Upcoming catalysts (confirmed vs estimated, ET) | live | in the same RPC/UI |
| Versioned thesis records | live | `market.theses` (append-only, versioned) — schema ready; no theses authored yet |
| Options flow classification, dealer-exposure scenario sensitivity | research-only | current GEX is a labelled estimate; sweep/aggressor classification needs a trade-level feed (Massive Options / Unusual Whales) |
| **Product** | | |
| Ticker detail: traceable levels, evidence families, comparable outcomes | live | drill-down; `iris2_investing_outcomes` |
| Coherent empty / stale / partial / disconnected states | live | throughout |
| **Validation** | | |
| Reproducible grading + outcome summary with Wilson intervals | live | `market.grade_outcomes` / `outcome_summary`; 0 graded (all publications < 1 horizon old — honest) |
| SQL acceptance tests | live | `tests/investing/phase1_tests.sql` (12) + `phase2_md_tests.sql` (6); `tests/investing/run.sh` → 18 pass |
| Adapter tests | live | `sidecar/test/*` → 11 pass |
| Historical replay / shadow run | partial | the grader IS the shadow-run scaffold; a recorded quote/trade replay awaits a live feed |

## What is blocked, and on exactly what

1. **Live quotes with a `LIVE`/`DELAYED` badge** — needs an entitled Massive key (Stocks Starter $29/mo for 15-min
   aggregates, Advanced $199/mo for real-time NBBO; `investing/PROVIDERS.md`). Until then the station streams a clearly
   labelled REPLAY and nothing is mislabelled live. Owner decision: buy a plan, or leave REPLAY.
2. **Replacing the CBOE positioning feed** — the current `cdn.cboe.com` delayed-quotes pull is prohibited by Cboe's
   terms for automated use (`PROVIDERS.md`, Caveats). The Massive Options Starter adapter is the drop-in replacement.
   Owner decision required.
3. **Options flow / aggressor classification** — needs a trade-level options feed; not built on the OI-only chain.
4. **A track record** — arrives on its own: the grader fills 5/10/20-session horizons as sessions pass. No action.

## Remaining setup the owner performs (unchanged from before)

- Start `start-iris-station.cmd` and `setx ANTHROPIC_API_KEY` on the PC (for the station).
- To go live on quotes: `npm i ws` in `sidecar/`, set `IRIS_PRICE_API_KEY`, run `node sidecar/run.js` (or wire it into
  the station's process manager).
