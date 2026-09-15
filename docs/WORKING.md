# Working agreement

Three agents work on IRIS Investing and they do not see each other. This file is where they
agree. Read it before you touch anything; update it when what it says stops being true.

It is versioned in git, so the history of this file *is* the log of how the system changed.
Do not append a running diary here — keep it describing the present, and let `git log
WORKING.md` be the past.

---

## Who owns what

The collisions that matter are not merge conflicts. They are two agents writing to the same
live system, or one agent assuming another has already done something. This table is the rule.

| | Cowork | Codex (GPT) | Claude Code |
|---|---|---|---|
| Live Supabase project `ssuikijiaulfhfxzwrgu` | **owns** — reads and writes | no access | **read-only, and only on request** |
| Applying a migration to production | **only Cowork** | never | never |
| n8n tenant (61 workflows) | **owns** | no access | no writes |
| `iris-command` monolith + `iris-command-5` site | **owns** | proposes patches | re-syncs *from* it, never edits it here |
| This repository (`iris-investing`) | may push | no direct access | **owns** — pushes, PRs, CI |
| `iris-investing.netlify.app` | — | — | deploys by pushing to `main` |

**The one rule that overrides everything:** *every schema change reaches production as a
migration file committed to this repository before it is applied.* No ad-hoc DDL in a console,
by anyone, ever — the thing being prevented is a change to production that exists nowhere
reviewable and cannot be reproduced or rolled back.

**Who may apply one is a separate question, and the table above answers it.** Cowork operates the
live project as the owner's hands and applies migrations directly. Claude Code and Codex do not,
and decline when an MCP tool offers to.

An earlier draft of this file said "no agent applies one," which contradicted the table and was
wrong: it generalised a rule written from the Claude Code lane onto an agent that legitimately
holds the owner's seat. Corrected 15 Sep 2026 after Cowork flagged the conflict.

**Review timing is the owner's setting**, not a property of the rule. Today it is apply-then-
review, which works only while every migration is additive and has a rollback. The proportionate
version, and the recommendation: apply-then-review for additive changes; **review-before-apply
for anything that changes permissions** — grants, RLS, role changes, or what a published artifact
exposes. Those are the changes where the damage is done before anyone can read the diff.

## What each agent can actually run

Capabilities differ, which is why "I verified it" means different things depending on who said
it. Run `./tools/whereami.sh` — it prints which gates this machine can run.

| Gate | Command | Needs |
|---|---|---|
| Static + slice boundary + secret scan | `./tools/verify.sh` | Node only — everyone can run this |
| SQL, from an empty database | `./tools/local-db.sh --migrations` | PostgreSQL 15/16 |
| Real browser, both widths | `node tools/preview-check.mjs` | Playwright + Chromium |

CI runs the first two on every push, so a claim about them is checkable by anyone. The browser
gate is not in CI; if you ran it, say so and say what the screenshots looked like.

**Say what you could not run.** The reliability package arrived with "PostgreSQL is not
installed here" and "the browser rejected the local preview" written plainly in
`reviews/IMPLEMENTATION_STATUS.md`, which is exactly why those gaps got closed instead of
quietly shipping. That is the standard.

## Handing work over

**Cowork → here.** Change `js/pages/markets.js` and the other upstream-owned files in the
monolith, not here. Then someone runs `./tools/sync-from-iris-command.sh <checkout>`, which
re-copies them and rewrites the checksum manifest. `tools/check-upstream-drift.sh` fails CI if
anyone edits one of those files in this repo instead — that failure is the signal that the two
copies are about to diverge, not a nuisance to silence.

**Codex → here.** Codex has no repo access, so work arrives as a bundle or a `git am` patch
against a stated baseline commit. Whoever lands it puts it on its own branch, runs every gate
the patch's own rollout notes said were unrun, and records the result in `reviews/`. Do not
merge a package on the strength of its own summary.

**Here → Cowork.** Anything in this repo that belongs upstream (a fix to `markets.js`, a new
RPC) goes to Cowork as a description of the change plus the migration file, never as a write.

**Anyone → production.** The owner, and only the owner.

## Facts worth not rediscovering

Each of these cost someone real time.

- **`.netlifyignore` is CLI-only — and this already happened.** Netlify's build system ignores
  it. On 15 Sep 2026 `iris-command-5` was found serving its entire repository root publicly:
  every SQL function definition, the 4.6 MB seed, the streaming adapter source, and the internal
  `docs/` tree that this repo's own `.gitignore` says must "never enter a shared repository"
  because it covers personal finances and security posture. Cowork fixed it by publishing an
  assembled `dist/` instead of the root. **`publish` must never point at a repository root.**
  Verified after the fact: the investing SQL and the workflow exports carried no credentials —
  the exports were properly redacted. `docs/` was the real exposure.
- **Migration filenames must sort into apply order.** Every runner, the Supabase CLI included,
  applies `*.sql` lexically. Two files sharing a date prefix will be applied alphabetically;
  that is how `20260915_research_outcomes.sql` ran before the migration that creates the table
  it references.
- **`timestamptz + interval` is not immutable**, so it cannot appear in a `generated always as
  (…) stored` column. Use a `before insert or update` trigger.
- **`local_stubs.sql` must never be deployed.** It fakes Supabase's `auth` schema and roles so
  the export loads on a bare PostgreSQL.
- **`js/pages/markets.js` is upstream-owned.** It is the entire dashboard. Wanting to edit it
  here means wanting to edit it in `iris-command`.
- **The contributor database role is `SELECT`-only** on `inv.*` and `market.*`, capped at 5
  connections with a 60-second statement timeout. It cannot create schemas and must not be used
  for anything that tries.
- **Credentials never enter this repository.** The publishable Supabase key in `js/config.js` is
  the only key that belongs here. `tools/verify.sh` scans for credential-shaped strings as a
  backstop, not as permission.

## Where things stand

*Last updated: 15 September 2026.*

- `main` deploys to `iris-investing.netlify.app` through `tools/build-site.sh`. The contributor
  setup, verification harness and publish allowlist are merged.
- `investing/reliable-research` (PR #2) is open: the Codex reliability package, with both
  migrations applying cleanly from empty and 20/20 JS tests passing. **Not applied to
  production.** It changes what the dashboard claims — without a verified exchange-session
  calendar loaded, the daily queue reads INCOMPLETE rather than showing a ranked list.
- The exchange-session calendar, a licensed quote/options source, and the grants on the new
  research tables are the next real gates. None of them are started.
- `iris-command-5` deploys by manual upload, not from git, and has no visitor password. Whether
  it serves `supabase/investing/seed_investing.sql` from its web root is unconfirmed.
- The contributor database password travelled as a chat attachment and should be rotated:
  `alter role contrib_ro password '<new one>';`

## Keeping this file honest

Update the section you just made wrong, in the same change that made it wrong. If two agents
edit this file at once, git will say so — resolve it by keeping both facts, not by picking a
side. If you find a statement here that is no longer true and you are not the one who broke it,
fix it anyway and say so in the commit.
