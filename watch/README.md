# Momentum watch — AI universe

For a swing trader with a day job. The tool watches; you decide. One alert to your phone when a
name in `registry/universe.yaml` has a story, a price response, and options flow that agrees —
with an honest read on whether the entry is any good.

## What the CrowdStrike weekend looks like in this system

```
CRWD · CONFIRMED · up
  narrative     8.0× baseline      (≥ 4)      cyber-threat headlines, 6 sources
  price         +4.1% pre-market   (≥ 1.5%)
  flow          calls 3.1× 20d, IV +12%        agrees
  entry         %B 0.82, RSI 61                room to run
  positioning   dealers short gamma above 340  moves likely amplified
  regime        NORMAL
  invalidation  335 (lower band)
```

Same setup, but the name already blew through its upper band:

```
CRWD · EXTENDED_WAIT · up
  entry         %B 1.22, RSI 81   well above the upper band — pullback more likely than not
```

Everything else identical. The stance changed because the entry did. That is the "combine news,
chart and macro together" you asked for — as a table you can read, not a score you have to trust.

## The rules, and where they live

`score.mjs` is the whole decision. Pure function, no I/O, no model, 10 tests. Every threshold is
in `THRESHOLDS` at the top and every reason is returned with its value and its threshold. Change
a number, run `node --test watch/`, see what changes.

Three rules that will not bend:

1. **Direction comes from price, never from text.** A tweet saying "bullish" sets nothing. The
   model may tag which tweets are about which ticker upstream; it may not score them.
2. **Missing evidence is INSUFFICIENT, never zero.** No options data → `DEVELOPING`, and the
   response says `missing: ['options_flow']`. It cannot reach `CONFIRMED` on narrative alone.
3. **Positioning and regime are context, never triggers.** Short gamma tells you the move will
   be bigger, not that there is a move.

## The evidence families and their feeds

| Family | Input | Source | Status |
|---|---|---|---|
| Narrative | mentions ÷ trailing baseline | Discord `#momentum-feed` (TweetShift relaying `registry/sources.yaml`), EDGAR 8-K, HN | **build** — Cowork |
| Price | session / pre-market move, %B, RSI, bars | `inv.prices`, `market.technicals` | live |
| Flow | call/put vol ÷ 20d, IV change, put-skew change | Massive Options Developer via `sidecar/providers/massive.js` | **awaiting key** |
| Positioning | dealer gamma sign near spot | `market.positioning` (labelled estimate) | live |
| Regime | NORMAL / STRESS / … | `market.regime` | live |

## Build split

**Cowork** (owns n8n, the sidecar and the Discord bot):
- Discord gateway listener in `sidecar/` on `#momentum-feed` — a persistent websocket, **not** the
  60-second poll. This replaces the Capture Door and removes ~60% of n8n executions in the same
  change.
- Tweet → ticker tagging. The model may extract `{symbols[], source, posted_at}` from the text.
  Nothing else. Store to `watch.mentions` with the tweet's own timestamp, not receipt time.
- `narrative_velocity` per name per window vs that name's own trailing baseline — SQL.
- Re-point Scout: Signals keywords at the universe instead of "agent tooling".
- Flow aggregates from the Massive adapter once the key lands.
- Run `score()` in the sidecar on every material input change; alert via Pulse (email) and Discord
  when a name enters `CONFIRMED` or `EXTENDED_WAIT`, with cooldown so one story is one alert.

**Claude Code** (this repo):
- `score.mjs` + tests — done.
- `registry/universe.yaml`, `registry/sources.yaml` — done; edit freely.
- CI running `node --test watch/` on every push.
- A grader entry for every alert, so in 30 alerts you know whether this finds trades or noise.

## What it will not do

It will not tell you what institutions *intend*. Nobody can. It shows their footprints — unusual
volume, IV, skew, dealer positioning — and labels each as the estimate it is. And it will not
produce five alerts a day to feel useful: a quiet day is `QUIET`, and that is a valid answer.
