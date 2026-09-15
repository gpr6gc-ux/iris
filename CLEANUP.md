# The cleanup

Not a plan — a ledger. This file is the one place that knows what is left, and it is meant to be
edited in place as things get done. `audit/RETIREMENT.md` holds the evidence behind the n8n and
agent rows; this holds everything, in the order that makes each step safe.

**Owner column:** who does it. `CW` Cowork (holds the live systems) · `CC` Claude Code (repos, CI,
local verification) · `G` Greyson (the calls only he can make).

**Status:** `[ ]` not started · `[~]` in progress · `[x]` done, with the date · `[-]` decided against.

---

## Phase 0 — stop the bleeding

Nothing here needs a judgement call about whether something is useful.

| | Owner | Item | Why now |
|---|---|---|---|
| `[ ]` | CW | Replace **Discord Capture Door** 60s poll with a webhook | ~10,000 of 17,021 weekly executions. Same behaviour, better latency, near-zero idle cost. |
| `[ ]` | CW | Stop the **Harvester** error loop (`pD5LAyVVvEkZ5sLv`) | Marked `active: false` and still firing every 10 min, failing each time. 34 of 87 weekly errors. |
| `[ ]` | CW | Fix **Gatekeeper** (`3qK2w8ubMVvqQIwU`) | The alarm is down. Everything below is harder to trust while it is. |
| `[ ]` | CW | Add a Gatekeeper probe: *does the public site serve anything that is not a web asset?* | The generalisation of the 15 Sep exposure. Right now that class of bug is caught by a human noticing. |
| `[x]` | CW | Fix `iris-command-5` publish — serve `dist/`, not the repo root | Done 15 Sep. Was serving all SQL, the 4.6 MB seed, the adapter source and internal `docs/`. |

## Phase 1 — close out the exposure

The publish is fixed. Knowing what got out is not.

| | Owner | Item | Notes |
|---|---|---|---|
| `[x]` | CC | Scan the served investing SQL + workflow exports for credentials | Clean. Only hits were XBRL tag names. Exports properly redacted. |
| `[ ]` | CW | Scan **`docs/`** for credential-shaped strings | The part neither of us has checked. The repo's own `.gitignore` says it covers "personal finances and security posture". |
| `[ ]` | G | Rotate anything that scan finds | Treat as disclosed regardless of whether it looks used. |
| `[ ]` | CW | Pull Netlify access logs for the exposure window | The difference between *exposed* and *leaked*. Nobody currently knows which word applies. |
| `[ ]` | CW | Remove `docs/` from the deployed repo entirely | The allowlist is the second line. Not being in the tree is the first. |
| `[ ]` | G | Rotate `contrib_ro` | Not found in anything public, but it travelled as a chat attachment. One line. |

## Phase 2 — make the roster true

Governance currently reads a list that does not match reality, so spend caps and kill switches
are governing a fiction. This outranks any deletion.

| | Owner | Item | Notes |
|---|---|---|---|
| `[ ]` | CW | Register the 9 agents that spend but are absent from `brain.agents` | `modellens-review`, `harvester`, `earnings-actuals`, `careers-tailor`, `doc-digest`, `studio-writer`, `agent-runner`, `researcher-prospecting`, `prospecting-scout` |
| `[ ]` | CW | Remove the 21 registered agents with zero calls in 30 days | Listed in `registry/agents.yaml` under `dormant_90d_candidates` |
| `[ ]` | G | Decide `researcher-prospecting` vs `prospecting-scout` | Near-duplicates. Keep one. One of them cost $3.10 for a single call — worth seeing what it was. |
| `[ ]` | CC | Build the `scout-craft` prefilter | Owner confirmed keep. Deterministic prefilter before scoring: ~5 candidates instead of ~29, roughly ⅕ the cost, no capability lost. |

## Phase 3 — archive the dead

| | Owner | Item | Confidence |
|---|---|---|---|
| `[ ]` | CW | Archive the **14 conclusive** workflows | Conclusive — self-described drafts and already-retired feeds. `RETIREMENT.md` §4. |
| `[ ]` | G | Decide the **Agency / client-portal cluster** (31) | Needs a human. Webhook endpoints; silence ≠ nobody holds the URL. |
| `[ ]` | G | Decide the **RCM demo cluster** (9) | Needs a human. Sales assets; several still scheduled. |
| `[ ]` | CW | Fix the remaining 7 erroring workflows | `RETIREMENT.md` §1 |
| `[ ]` | G | Delete the **15 unnamed Netlify sites** | `tourmaline-marigold`, `frolicking-youtiao`, `merry-brigadeiros`, … Half the site list is one-off deploys nobody named. |

## Phase 4 — get it into git

The skeletons exist because nothing can see them all at once.

| | Owner | Item | Notes |
|---|---|---|---|
| `[x]` | G | Create `gpr6gc-ux/iris`, push this hub | Done 15 Sep 04:29. 16 commits, CI green. |
| `[x]` | CC | Push the command center — was 80 of 124 files in no repository | Done 15 Sep. `apps/command/` as a subtree, all 9 of Cowork's commits preserved. **Cowork pushes here from now on — no more bundles.** |
| `[ ]` | CW | Version the database — 20 schemas, 242 tables, **251 functions with no history anywhere** | `pg_dump --schema-only` per schema into `db/`, on a schedule. |
| `[ ]` | CW | Version the n8n workflows | `workflow-backups` PR #1 does this and has been open since 5 Sep. The n8n-side job has been dead since 13 May. |
| `[ ]` | G | Link `iris-command-5` to `gpr6gc-ux/iris`, base directory `apps/command`, publish `dist` | Then the live site always corresponds to a commit, and rollback exists. Netlify UI. |

## Phase 4b — the momentum watch

Added 15 Sep after the owner named the trade that actually works: narrative momentum on AI names.

| | Owner | Item | Notes |
|---|---|---|---|
| `[x]` | CC | `watch/score.mjs` — deterministic stance, 10 tests | Direction from price never text; missing → INSUFFICIENT; Bollinger extension → EXTENDED_WAIT |
| `[x]` | CC | `watch/flow.mjs` — tape → scorer inputs, 11 tests | Unknown is a valid side; dupes/corrections reconciled; GEX labelled an estimate |
| `[x]` | G | Massive Options Advanced key in n8n as `IRIS_PRICE_API_KEY` | Done 15 Sep |
| `[ ]` | CW | Capture 10 min of real options trades + quotes (CRWD, NVDA, PANW) → `apps/command/sidecar/fixtures/` | First thing to do with the key. Verifies the mapping; gives `flow.mjs` real-shaped data. |
| `[ ]` | CW | Options provider mapping in `sidecar/providers/` — the existing `massive.js` is the stocks socket | Against the observed payloads, not the docs |
| `[ ]` | G | Own Discord server + TweetShift following `registry/sources.yaml` | Narrative family. Cannot read a community you are only a member of. |
| `[ ]` | CW | Discord gateway listener in `sidecar/` on `#momentum-feed` | Replaces the 60-second Capture Door poll — same change removes ~60% of executions |
| `[ ]` | CW | Tweet → ticker tagging (model may extract symbols; never score), `watch.mentions` with the tweet's own timestamp | |
| `[ ]` | CW | `narrative_velocity` per name vs its own baseline — SQL | |
| `[-]` | G | Stocks Starter ($29) | **Decided against, 15 Sep.** Stocks stay EOD on free Basic. In-session price comes from the underlying price on Options Advanced chain snapshots; pre-market and weekends have no price. Scorer adapted: a firing narrative with no price is `WATCH` ("confirm at 09:30 ET"), never `INSUFFICIENT_DATA`. |
| `[ ]` | CC | A grader entry per alert | So 30 alerts in, the system says whether this finds trades or noise |

## Phase 5 — the front door

Only worth doing once the above is true, because a dashboard over a wrong registry is a
prettier version of the same problem.

| | Owner | Item | Notes |
|---|---|---|---|
| `[ ]` | CC | CI job running `tools/sync-registry.sh` on merge | Git is the source of truth; `iris.projects` is a cache of it. |
| `[ ]` | CC | Command center reads `iris.projects`, renders one tile per project | Adding a project to the UI becomes four lines of YAML in a PR. |
| `[ ]` | G | Decide **Karta** | 45 tables — the largest schema in the database — and all 9 of its workflows are draft skeletons. The biggest thing built that has never run. |
| `[ ]` | G | Decide **Revenue Engine**, **Keplr**, **Sightline** | Dormant in `registry/projects.yaml`. Each is a tile or a deletion. |

---

## The numbers this started from

Recorded so progress is measurable rather than felt. Snapshot 15 September 2026, 01:00–02:40 UTC.

| | Then | Now |
|---|---|---|
| n8n workflows | 111 | — |
| Executions / week | 17,021 | — |
| Errors / week | 87 | — |
| Registered agents | 36 (21 idle) | — |
| Agents spending but unregistered | 9 | — |
| LLM spend / 30d | $37.38 (67% one agent) | — |
| Netlify sites | 31 (15 unnamed) | — |
| Command-center files in no repo | 49 (80 by 03:00) | **0** |
| DB functions with version history | 0 of 251 | — |

Update the right-hand column as phases land. The audit is a snapshot, not a live view — one row
in `RETIREMENT.md` was already stale within the hour, because Cowork fixed the Daily Price Feed
while it was being written. Re-run the audit before acting on anything more than a few days old.
