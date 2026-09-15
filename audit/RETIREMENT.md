# Retirement plan — n8n workflows and agents

Evidence in `METHOD.md`. **Nothing here has been executed.** This is a list for Cowork, which
owns the n8n tenant, to work through. Read the confidence column before acting on a row.

Confidence means:

- **Conclusive** — the workflow says what it is, or its own description retires it. No judgement.
- **Strong** — a *scheduled* workflow that has not fired in the 14-day retention window. A cron
  that does not fire is not running. Safe to deactivate.
- **Needs a human** — a *webhook* workflow that nothing has called in 14 days. Silence here means
  nobody used it, not that nobody holds the URL. Archiving breaks any caller still out there.

---

## 1. Fix now — these are failing today

87 errors in 7 days out of 17,021 executions — 0.5%, concentrated in a handful of workflows.

**Correction, 15 Sep:** an earlier draft of this file said the nightly offsite brain backup was
failing. It is not. **IRIS — Vault** `Pdrqau7Csp0XSTWe` runs daily at 06:30 and its last ten
executions all succeeded. The ~34 errors belong to a different workflow, below. The n8n-side
*workflow* backup is still dead (since 13 May, see `workflow-backups` PR #1) and the database
is still unversioned, but the brain's offsite copy is intact.

| Workflow | Errors/7d | Why it matters |
|---|---|---|
| **IRIS — Harvester (continuous)** `pD5LAyVVvEkZ5sLv` | ~34 | The largest single error source. It is marked **`active: false`**, yet it fires on a clean 10-minute cadence and fails each time. It has both a schedule trigger and a webhook (`/webhook/iris-harvest-run`) and its own description says it "immediately re-triggers itself while work remains" — so the most likely reading is a self-retrigger loop that a disabled workflow cannot complete. **Verify before assuming:** a disabled workflow firing every 10 minutes is either a bug or something else is POSTing to that webhook. |
| **IRIS — Gatekeeper** `3qK2w8ubMVvqQIwU` | ~6 | The hourly 17-probe suite whose entire job is to tell you when something breaks. It is itself breaking, so the alarm cannot be trusted right now. |
| IRIS — Universal Crawler `cKtKbzqyRgCu1SgL` | ~12 | Source registry crawler |
| IRIS — Earnings & 8-K Catalyst Feed `WGqH0xLUGDq2ZCkP` | ~12 | Investing feed |
| IRIS — Careers Tailor `okDZrlCDGLwY1GK8` | ~6 | Also runs every 10 min — see §3 |
| IRIS — Real Estate: Parcel Enrichment `J9VcTKzfGwQx4R5Q` | ~6 | |
| IRIS — Executor `Lrx5BEUYpqeKg2i6` | ~4 | Executes owner-approved proposals — failures here mean approvals silently do nothing |
| IRIS — Daily Price Feed `LI6gTJ6PA2hKWVk5` | 2 | Errored again at 01:40 today |
| IRIS — Scout: Signals `Y9E3hBRETkUav0BQ` | 1 | |
| IRIS — 8-K Healthcare M&A `wHaQRYANxixuww7j` | 1 | |

---

## 2. Replace — one workflow is ~60% of all executions

**IRIS — Discord Capture Door** `bBjQP3CVj60zNq3S` polls a Discord channel **every 60 seconds**:
~1,440 runs/day, **~10,000 of the 17,021 weekly executions**, almost all finding nothing.

It is a cron job impersonating an event listener. A Discord webhook (or the Gateway) posting into
the same capture endpoint does the identical job at zero idle cost. This is not a feature cut —
the behaviour is unchanged and latency improves.

**Do this one first.** It is the largest saving available and the least risky change on this page.

---

## 3. Reconsider — cost without a demonstrated result

| What | 30d | Note |
|---|---|---|
| **`scout-craft`** | **$25.07 / 860 calls** | **67% of all LLM spend.** Scores GitHub + HN items for adoptability. It runs fine. The question is not technical: has anything it surfaced changed a decision? If not, drop the cadence hard or retire it. |
| `researcher-prospecting` | $3.10 / **1 call** | One call, $3.10. Worth seeing what that call was. |
| `prospecting-scout` | $2.19 / 3 calls | Near-duplicate of the above. Two agents doing prospecting is one too many. |
| IRIS — Careers Tailor `okDZrlCDGLwY1GK8` | 144 runs/day | Every 10 minutes to claim jobs *the owner filed manually*. Event-driven, or every 30–60 min, does the same work. |

---

### Careful: "the scouts" are four different workflows

The owner values macro news **and** GitHub project discovery. Those come from different places,
and retiring the wrong one loses the thing that was meant to be kept:

| Want | Comes from | LLM cost |
|---|---|---|
| GitHub projects worth adopting | **IRIS — Scout: Craft** `EFNKWw9PMsKt2UZG` (agent `scout-craft`) | high — §3 above |
| Macro series (FRED, 10 series) | **IRIS — Market: Macro Daily** `x67We2CrO8FYwJuL` | **none** — deterministic |
| HN + Anthropic news, 3-hourly | **IRIS — Scout: Signals** `Y9E3hBRETkUav0BQ` | low |
| FINRA / EDGAR / CBOE sweep | **IRIS — Scout: Markets** `vKyqBywMGJglieGX` | low |

Macro Daily costs nothing in model spend — it is a plain FRED fetch. Keep all four; only
`scout-craft` needs the prefilter.

## 4. Archive — conclusive

Self-described drafts and retirements. `active: false`, `triggerCount: 0`. No caller can exist.

**Karta draft skeletons (9)** — `iFQlG4dvZU7xQ84d` 5 MCP Tool Layer · `Lt7odmdvXRdISjJ9` 4.4
Traceability · `aX8T65IhQU2zHmRi` 4.3 Historical Change · `PQ31716sFUtMoZ4X` 4.2 Model Efficiency ·
`4vgmA4QOvNu2JoMV` 4.1 SQL Project Intelligence · `XeIaG0Z56l6xYMFN` 2.1 Connectors ·
`uqFN0Q9yxfqCp3F0` 2.2–2.8 Ingestion · `t7xJOh6aysl9kCNq` Ingestion Error Handler ·
`ViHtIAD8Ud7P2P0Z` Karta Memory Demo

**Already retired in their own titles (2)** — `WnWRX5TdCZOvm7o5` Price History Backfill (Yahoo
ToS) · `W5NIqHuupN8LOLsp` Investing Price Feed (Yahoo ToS)

**One-offs and prototypes (3)** — `S3buFEmQpsKuWkNG` Market: Price Probe ("throwaway
diagnostic") · `SkaoZa6O5sumz2o0` GitHub Repo Census · `8T7tvLp78PZSC3lY` Agent Runtime
("INACTIVE prototype")

**14 workflows. Archive without further checks.**

---

## 5. Archive — needs a human first

### The Agency / client-portal cluster — 31 workflows

Everything prefixed `Agency —` or `Client —`, in folders `XT06ceqRAxiJutQ9` and
`mWCwYHzyAyPINJxy`. Nothing in this cluster has been touched since **29 April 2026**.

Two entry points checked directly, both returning zero executions in the retention window:

- `Fe6ifp282o3r6Rt1` **Agency — Client Intake API** — the front door of the whole cluster
- `XWjVQPJf5lWHbgag` **Client — RIA Lead Enrichment v1** — *daily scheduled*, and silent. **Strong:**
  a daily cron that has not fired in 14 days is not running.
- `YUbcyeHAFEdo2oqn` **Agency — Nightly Workflow Backup** — silent, and its repo has been frozen
  since 13 May. This is the one already documented as dead in `workflow-backups` PR #1.

Most of the other 28 are **webhook** endpoints — portal pages, OAuth callbacks, credential
injection, token validation. **Needs a human:** if any client still holds a portal link or an
OAuth redirect points here, archiving breaks it. Confirm no live client before proceeding.

### The healthcare / RCM demo cluster — 9 workflows

Built July 2026, described as pitch demos on synthetic data, zero PHI. Several are **active and
scheduled** and therefore still consuming executions: D4 Recall Engine (daily scan), Eligibility
Verifier (daily 06:40 sweep), FHIR Connector.

`RCM Demo — EOB Extraction (D1)` · `IRIS — Statement Ingestor (D2)` · `IRIS — Appeals Writer (D3)` ·
`IRIS — Recall Engine (D4)` · `IRIS — Eligibility Verifier (270/271)` · `IRIS — FHIR Connector` ·
`IRIS — ICD Coding Assist` · `IRIS — EOB and Claims OCR` · `IRIS — RCM Appeals Writer`

**Needs a human:** these are sales assets. If a pitch is live, keep them and just deactivate the
schedules. If not, archive all nine.

---

## 6. Agents — the registry does not match reality

**21 of 36 registered agents made zero calls in 30 days:** `analyst-invest`, `appeals-writer`,
`ceo`, `chief-of-staff`, `claude-code`, `cost-analyst`, `extractor-doc`, `firm-analyst`,
`ingestor`, `n8n-architect`, `owner`, `personal-assistant`, `prompt-smith`, `rcm-worker`,
`researcher-outbound`, `revenue-engine`, `scout-news`, `scout-payer`, `scout-work`,
`solutions-architect`, `station-overseer`.

They cost nothing. They are still worth removing, because a roster where 58% of the entries do
nothing is why the system feels unknowable.

**9 agents are spending money while absent from `brain.agents`:** `modellens-review` ($2.83),
`harvester` ($1.60), `earnings-actuals` ($1.23), `careers-tailor` ($0.40), `doc-digest` ($0.08),
`studio-writer` ($0.03), `agent-runner` ($0.01), `researcher-prospecting` ($3.10),
`prospecting-scout` ($2.19).

That is the real finding: **the registry is wrong in both directions.** It lists agents that do
not run and omits agents that do. Governance built on it — spend caps, kill switches, policy —
is therefore governing a fiction. Fixing this is worth more than any single deletion here.

---

## Order of work

1. **Stop the Harvester loop and fix IRIS — Gatekeeper.** A disabled workflow erroring every 10 minutes, and the alarm that is supposed to report breakage.
2. **Replace the Discord poll with a webhook.** ~60% of executions, no behaviour change.
3. **Archive §4** — 14 workflows, no checks needed.
4. **Reconcile the agent registry** (§6) so spend caps mean something.
5. **Decide `scout-craft`** (§3) — two-thirds of the AI budget.
6. **Walk §5 with the owner** — 40 workflows, but each needs a yes.
7. Fix the remaining §1 errors.

Steps 1–4 remove roughly 60% of execution volume and 14 workflows without a single judgement
call about whether something is useful.

Every workflow ID in this file was cross-checked against the tenant listing on 15 Sep after one
was found transcribed wrongly. If you find another mismatch, trust the tenant, not this file.
