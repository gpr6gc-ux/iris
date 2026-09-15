// iris2_stream(p_after, p_limit, p_agent) — live thinking events, plus a tick generator for the preview "realtime" feed.
import { ago, ok } from './_state.js';

let seq = 1000;
const ev = (secAgo, agent, kind, event, detail, extra = {}) => ({
  id: String(seq++), at: ago(secAgo), agent, session_ref: extra.session_ref || `${agent.slice(0, 3)}-${(secAgo % 97).toString(16).padStart(2, '0')}a4`, phase: extra.phase || (kind === 'llm' ? 'reason' : kind === 'tool' ? 'act' : kind === 'claim' ? 'file' : kind === 'error' ? 'fail' : 'observe'),
  event, detail, tool: extra.tool || (kind === 'tool' ? event.split(' ')[0] : ''), tokens_in: extra.tokens_in ?? (kind === 'llm' ? 1800 + (secAgo % 900) : null), tokens_out: extra.tokens_out ?? (kind === 'llm' ? 240 + (secAgo % 300) : null),
  cost_usd: extra.cost_usd ?? (kind === 'llm' ? 0.004 + (secAgo % 7) / 1000 : kind === 'tool' && agent === 'modellens-review' ? 0.071 : null), model: extra.model || (kind === 'llm' ? 'claude-haiku-4-5' : ''), ms: extra.ms ?? (kind === 'tool' ? 640 + (secAgo % 1200) : kind === 'llm' ? 2100 + (secAgo % 2500) : null), kind,
});

const BASE = [
  ev(58, 'modellens-review', 'tool', 'review packet CAL07 Allocation → 23 verdicts, 4 findings', 'packet 7/13 · 23 verdicts · 4 new findings · 0 dropped', { tool: 'modellens_llm_layer', cost_usd: 0.071, ms: 9800, model: 'claude-sonnet-4-5' }),
  ev(72, 'universal-crawler', 'tool', 'fetch community.anaplan.com/kb', '2 new · 1 dud · yield 3.1%', { tool: 'http_fetch', ms: 812 }),
  ev(89, 'revenue-engine', 'llm', 'critic: ML-TYP-001 draft → 72 revise (specificity)', 'critic verdict: revise · add a number to the hook · brand safety 10/10', { cost_usd: 0.004 }),
  ev(120, 'catalyst-feed', 'error', 'iris_inv_catalyst_upsert: ON CONFLICT no matching constraint', 'HTTP 409 · 24 rows dropped · failing every hour since 09-02', { tool: 'supabase_rpc', ms: 210 }),
  ev(140, 'scout-craft', 'claim', 'filed: Planual 2.02-02 SUM over LOOKUP (conf .86)', 'kind lesson · 2 sources · queued for your review', { cost_usd: 0.012 }),
  ev(201, 'spend-governor', 'info', 'cap.evaluate anthropic/24h', '$1.84 of $10 · 18% · no denials', { tool: 'iris_spend_status', ms: 95 }),
  ev(260, 'gmail-sentinel', 'llm', 'triage 4 threads → 1 needs you', 'Capital Region Health · reply drafted, waiting for approval', { cost_usd: 0.006 }),
  ev(318, 'revenue-engine', 'llm', 'draft: ML-DIM-001 subsidiary views → 1,982 chars', 'quality 90 · over ideal band · hook ✓ · CTA ✓', { cost_usd: 0.009, tokens_out: 610 }),
  ev(402, 'modellens-review', 'tool', 'review packet CAL06 Workforce → 19 verdicts, 1 finding', 'packet 6/13 · 19 verdicts · 1 new finding · 1 dropped (bad id)', { tool: 'modellens_llm_layer', cost_usd: 0.068, ms: 9100, model: 'claude-sonnet-4-5' }),
  ev(455, 'universal-crawler', 'tool', 'fetch docs.n8n.io/release-notes', '1 new · 0 dud', { tool: 'http_fetch', ms: 640 }),
  ev(530, 'scout-signals', 'claim', 'filed: n8n 1.108 adds Data Tables (conf .74)', 'kind capability · 1 source', { cost_usd: 0.011 }),
  ev(610, 'harvester', 'tool', 'harvest github.com/n8n-io/n8n-workflows', '12 workflows · 3 patterns new', { tool: 'gh_api', ms: 1480 }),
  ev(690, 'deal-sheet-agent', 'info', 'proposal filed: publish issue #2', 'waiting for owner · hot · $0.42', { tool: 'iris_propose' }),
  ev(760, 'revenue-engine', 'llm', 'draft: ML-RED-001 duplicate formulas → 1,412 chars', 'quality 100 · pass · critic 76 revise', { cost_usd: 0.008, tokens_out: 540 }),
  ev(830, 'spend-governor', 'info', 'cap.evaluate anthropic/1h', '$0.31 of $3 · 10%', { tool: 'iris_spend_status', ms: 88 }),
  ev(905, 'universal-crawler', 'tool', 'fetch sec.gov/cgi-bin/browse-edgar', '0 new · rate-limited, backoff 8m', { tool: 'http_fetch', ms: 2200 }),
  ev(1010, 'scout-markets', 'claim', 'filed: Capital Region Health FP&A architect role (conf .61)', 'kind lead · 1 source', { cost_usd: 0.010 }),
  ev(1100, 'modellens-review', 'tool', 'review packet CAL05 Capex → 21 verdicts, 2 findings', 'packet 5/13', { tool: 'modellens_llm_layer', cost_usd: 0.07, ms: 8700, model: 'claude-sonnet-4-5' }),
  ev(1240, 'gmail-sentinel', 'tool', 'label 3 newsletters → archive', 'rule: newsletters · no LLM', { tool: 'gmail_api', ms: 410 }),
  ev(1400, 'executor', 'info', 'outbox drained', '0 queued · last execute_proposal 09-04 09:14', { tool: 'iris_outbox_next' }),
  ev(1520, 'revenue-engine', 'llm', 'plan: today 3 LinkedIn drafts (karta_authority)', 'topics rotated · 12 titles excluded', { cost_usd: 0.003 }),
  ev(1660, 'catalyst-feed', 'error', 'iris_inv_catalyst_upsert: ON CONFLICT no matching constraint', 'HTTP 409 · 24 rows dropped', { tool: 'supabase_rpc', ms: 190 }),
  ev(1800, 'scout-craft', 'llm', 'read 6 forum threads → 2 candidate lessons', 'staged for scoring', { cost_usd: 0.014 }),
  ev(1990, 'universal-crawler', 'tool', 'fetch anaplan.com/blog', '1 new · 0 dud', { tool: 'http_fetch', ms: 720 }),
];

export function stream(args = {}) {
  let evs = BASE.slice();
  if (args.p_agent) evs = evs.filter((e) => e.agent === args.p_agent);
  if (args.p_after) evs = evs.filter((e) => e.at > args.p_after);
  evs = evs.sort((a, b) => a.at.localeCompare(b.at)).slice(-Math.min(Number(args.p_limit) || 60, 200));
  return ok({ events: evs, next_after: evs.length ? evs[evs.length - 1].at : (args.p_after || null), realtime_channel: 'iris:stream' });
}

const TICKS = [
  ['universal-crawler', 'tool', 'fetch community.anaplan.com/discussion', '1 new · 0 dud', { tool: 'http_fetch', ms: 690 }],
  ['modellens-review', 'tool', 'review packet CAL08 Revenue Bridge → 25 verdicts, 3 findings', 'packet 8/13 · 25 verdicts', { tool: 'modellens_llm_layer', cost_usd: 0.073, ms: 10200, model: 'claude-sonnet-4-5' }],
  ['revenue-engine', 'llm', 'critic: ML-DIM-001 draft → 81 approve', 'critic verdict: approve · brand safety 10/10', { cost_usd: 0.004 }],
  ['spend-governor', 'info', 'cap.evaluate anthropic/24h', '$1.91 of $10 · 19% · no denials', { tool: 'iris_spend_status', ms: 90 }],
  ['gmail-sentinel', 'llm', 'triage 2 threads → 0 need you', 'both archived by rule', { cost_usd: 0.003 }],
];
let tick = 0;
export function previewStreamTick() { const t = TICKS[tick++ % TICKS.length]; return ev(0, t[0], t[1], t[2], t[3], t[4]); }
