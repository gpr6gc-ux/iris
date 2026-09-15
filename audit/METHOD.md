# How the audit was done, and what it cannot tell you

Run 15 September 2026 against the live n8n tenant and the `iris` Supabase project, read-only.
No workflow was archived, deactivated or edited; no row was written.

## Sources

| Claim | Where it came from |
|---|---|
| 111 workflows, active flag, created/updated dates | n8n API workflow list |
| 17,021 executions in 7 days; 87 errors | n8n API execution search, 2026-09-08 → 2026-09-15 |
| Per-workflow execution behaviour | n8n API execution search, filtered by workflow id |
| 30-day LLM spend per agent | `ops.spend_ledger` joined to `brain.agents` |
| 242 tables across 20 schemas | `information_schema.tables` |

## The limit that matters

**n8n retains roughly 14 days of execution history.** A query for anything started before
2026-09-01 returns nothing at all. So for any workflow:

- "zero executions" means **it has not run in the last ~14 days**.
- It does **not** mean it has never run, and it does not mean it is safe to delete.

Every verdict in `RETIREMENT.md` is labelled with which of these it rests on. A workflow whose
only evidence is "silent for 14 days" is a *candidate*, not a conclusion — especially a
webhook-triggered one, where silence means nobody called it, and archiving it breaks whatever
URL is still pointed at it.

## What was not measured

- n8n Cloud billing. Execution counts are a proxy for cost, not the invoice.
- Whether a workflow's output is *useful*. Execution counts say a thing runs, not that anyone
  reads it. `scout-craft` is the clearest case: it is 67% of LLM spend and runs successfully.
  Whether it has ever changed a decision is a question only the owner can answer.
- Webhook callers. Nothing here inspects who holds a webhook URL.
