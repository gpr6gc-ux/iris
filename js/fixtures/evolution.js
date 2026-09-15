// iris2_evolution() + prompt promote/rollback — preview data for the Evolution (prompt lifecycle) tab.
import { ok } from './_state.js';

export const evolution = () => ok({
  prompts: [
    { slug: 'analyst-invest.score', active_version: 2, can_rollback: true, versions: [
      { id: 'p-ais-2', version: 2, status: 'active', name: 'Investment scorer', created_at: '2026-09-01', activated_at: '2026-09-03', bad_reports: 0 },
      { id: 'p-ais-1', version: 1, status: 'retired', name: 'Investment scorer', created_at: '2026-08-20', activated_at: '2026-08-20', bad_reports: 2 },
    ] },
    { slug: 'cfo.pricing', active_version: 2, can_rollback: true, versions: [
      { id: 'p-cfo-2', version: 2, status: 'active', name: 'Pricing CFO', created_at: '2026-09-04', activated_at: '2026-09-04', bad_reports: 0 },
      { id: 'p-cfo-1', version: 1, status: 'retired', name: 'Pricing CFO', created_at: '2026-08-15', activated_at: '2026-08-15', bad_reports: 1 },
    ] },
    { slug: 'revenue-engine.writer', active_version: 3, can_rollback: true, versions: [
      { id: 'p-rew-4', version: 4, status: 'draft', name: 'Lane writer', created_at: '2026-09-08', activated_at: null, bad_reports: 0 },
      { id: 'p-rew-3', version: 3, status: 'active', name: 'Lane writer', created_at: '2026-09-05', activated_at: '2026-09-06', bad_reports: 1 },
      { id: 'p-rew-2', version: 2, status: 'retired', name: 'Lane writer', created_at: '2026-08-28', activated_at: '2026-08-28', bad_reports: 4 },
    ] },
    { slug: 'agent-kernel', active_version: 1, can_rollback: false, versions: [
      { id: 'p-ak-1', version: 1, status: 'active', name: 'Agent kernel', created_at: '2026-08-01', activated_at: '2026-08-01', bad_reports: 0 },
    ] },
  ],
  evals: { cases: 8, rubrics: 5, by_agent: [
    { agent: 'analyst-invest', runs: 12, pass_rate: 92, avg_score: 8.6, last_run: '2026-09-07' },
    { agent: 'revenue-engine', runs: 9, pass_rate: 67, avg_score: 7.1, last_run: '2026-09-08' },
    { agent: 'cfo', runs: 5, pass_rate: 80, avg_score: 8.0, last_run: '2026-09-06' },
  ] },
  rollouts: [
    { slug: 'revenue-engine.writer', action: 'promote', from: 2, to: 3, actor: 'owner', reason: 'better hooks', at: '2026-09-06T14:00:00Z' },
    { slug: 'cfo.pricing', action: 'promote', from: 1, to: 2, actor: 'owner', reason: 'tighter margins', at: '2026-09-04T10:00:00Z' },
    { slug: 'analyst-invest.score', action: 'rollback', from: 3, to: 2, actor: 'owner', reason: 'v3 hallucinated tickers', at: '2026-09-03T09:00:00Z' },
  ],
});

export const promptPromote = (a) => ok({ slug: 'demo', from: 2, to: 3, action: 'promote', noop: false });
export const promptRollback = (a) => ok({ slug: a && a.p_slug, from: 3, to: 2, action: 'rollback', noop: false });
