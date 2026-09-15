# IRIS

The hub. One repo for the command center, the database, the automation, and the registry of
everything else.

## Why this exists

Before this repo: the command center lived on one laptop and deployed by zip upload, 242 tables
and 251 database functions had no version history anywhere, 111 n8n workflows existed with no
inventory, and 36 registered agents bore no relation to the 15 that actually ran. Nothing was
wrong exactly — it just could not be seen all at once, and what cannot be seen cannot be cleaned.

## Layout

| Path | What |
|---|---|
| `apps/command/` | The command center UI — the front door |
| `db/` | Every schema, function and migration. The database, in git. |
| `workflows/` | n8n exports, one file per workflow |
| `registry/projects.yaml` | Every project: repo, site, schemas, agents |
| `registry/agents.yaml` | Every agent: purpose, spend, budget, status |
| `audit/` | The 15 Sep 2026 inventory and the retirement plan built from it |
| `docs/` | `WORKING.md` — the agreement between Cowork, Codex and Claude Code |

## The idea in one paragraph

**The registry is the product.** `registry/projects.yaml` is the single list of what exists;
CI syncs it into `iris.projects`, and the command center renders one tile per entry with live
health. Adding a project to the UI means adding four lines of YAML in a pull request — there is
no second place to update and no way for the UI to drift from reality.

Projects with real code keep their own repositories (`iris-investing`, `modellens`, `mccourtai`)
and are *registered* here. This repo holds what is genuinely shared: the front door, the
database, the automation, and the list.

Branches do what branches are for — one per change, merged, deleted. A branch is a version of
this repo, never a home for a separate project.

## Start here

- `audit/RETIREMENT.md` — what to switch off, in order, with the evidence for each
- `audit/METHOD.md` — how that evidence was gathered and what it cannot prove
- `docs/WORKING.md` — who owns which live system, and the rule that no agent writes to production
