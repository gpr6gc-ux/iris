# Market-data streaming adapter (`sidecar/market-stream.js`)

Runs in the IRIS Station on your PC, not the cloud. It keeps a websocket open to a market-data provider, coalesces
quotes per symbol, and flushes small batches to Supabase through the token-gated worker lane — one round trip per
second, never an n8n run or a model call per tick. It is the only thing that ever writes a `LIVE`/`DELAYED` state,
and it only does so from a connected, entitled socket; the read side (`iris2_md_quotes`) downgrades anything stale or
disconnected, so the Command Center can never show a live badge over a dead feed.

## Status

Built and unit-tested against replay fixtures. **No live connection yet** — it needs an entitled Massive key
(see `investing/PROVIDERS.md`: Stocks Starter for 15-minute aggregates, Advanced for real-time NBBO quotes). Until
one is configured, `run.js` streams `fixtures/watchlist-replay.ndjson` in a clearly-labelled REPLAY mode: every row
is flagged `replay`, the feed note says "REPLAY — not a live market feed", and nothing is ever labelled `LIVE`.

## Run it

```bash
cd sidecar
node --test test/*.test.js          # 11 unit + integration tests, no dependencies
node run.js                          # REPLAY mode (no key): writes delayed sample quotes to md.quotes_latest
```

Environment:

| Var | Meaning |
|---|---|
| `IRIS_URL` | Supabase URL (default the IRIS project) |
| `IRIS_ANON` | publishable key (`sb_publishable_…`) |
| `IRIS_TOKEN` | worker token (the low-privilege one the other feeds use) |
| `IRIS_PRICE_API_KEY` | Massive key. When set, `run.js` verifies its entitlement with one REST call and only then goes live at the tier the key actually has. Absent or unverified → REPLAY. |
| `IRIS_STREAM_SYMBOLS` | optional CSV to override the watchlist |

To go live: install `ws` (`npm i ws`) in the station, set `IRIS_PRICE_API_KEY`, and restart. The adapter prints the
verified entitlement and streams at that tier. If the key does not verify it stays in REPLAY rather than mislabel
anything — that is deliberate.

## What each piece guarantees (all unit-tested)

- **Coalescing** — only the newest quote per symbol survives between flushes; a trade-only and a quote-only message
  merge into one row.
- **Dedupe + gap detection** — a provider sequence that repeats or goes backwards is dropped; a jump is counted as a
  gap and reported in `md.feed_state.gaps_detected`.
- **Truthful state** — `LIVE` only on a real-time entitlement with the socket open; `DELAYED` on a delayed
  entitlement; `HALTED` when the provider says so; `DISCONNECTED` the moment the socket closes.
- **Reconnect** — exponential backoff with jitter, resubscribe on reconnect, capped at 30 s.
- **No loss on failure** — a failed flush returns the batch to the buffer and retries; the buffer never grows
  unbounded (newest-per-symbol only).
- **Measured lag** — p50/p95/p99 of event-time → receive-time, reported on the heartbeat, not guessed.

## Wiring the field mapping (before trusting a live run)

`providers/massive.js` maps Massive's `A` (second aggregate) and `Q` (quote) websocket events to the normalized
shape. Those field names follow the documented Polygon/Massive cluster but have **not** been observed against an
entitled key in this environment. Before relying on a live run, capture one real message of each type and confirm the
mapping; until then the REPLAY path is the safe default.
