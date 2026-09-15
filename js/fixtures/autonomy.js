// iris2_autonomy() + set_pause / agent_set — preview data for the Autonomy (kill switch) tab.
import { ok } from './_state.js';

const AGENTS = [
  { slug: 'work-scout', name: 'Work Scout', purpose: 'Finds and qualifies inbound opportunities', kind: 'worker', model: 'claude-haiku-4-5', active: true, can_write: true, needs_approval: true, forbidden: null, paused: false },
  { slug: 'revenue-engine', name: 'Revenue Engine', purpose: 'Drafts and scores content across lanes', kind: 'worker', model: 'claude-sonnet-4-5', active: true, can_write: true, needs_approval: true, forbidden: null, paused: false },
  { slug: 'modellens-review', name: 'ModelLens Review', purpose: 'Runs governed LLM model-health reviews', kind: 'worker', model: 'claude-sonnet-4-5', active: true, can_write: false, needs_approval: false, forbidden: null, paused: false },
  { slug: 'universal-crawler', name: 'Universal Crawler', purpose: 'Ingests sources into the brain', kind: 'feed', model: 'claude-haiku-4-5', active: true, can_write: false, needs_approval: false, forbidden: null, paused: false },
  { slug: 'industry-watch', name: 'Industry Watch', purpose: 'Tracks catalysts and filings', kind: 'feed', model: 'claude-haiku-4-5', active: false, can_write: false, needs_approval: false, forbidden: null, paused: false },
];

export const autonomy = () => ok({
  paused: { global: false, state: { reason: null, since: null, actor: null }, agents: [] },
  agents: AGENTS,
  schedules: [
    { jobid: 15, name: 'disc_poll', schedule: '* * * * *', active: true },
    { jobid: 13, name: 'iris-mission-reconcile', schedule: '*/15 * * * *', active: true },
    { jobid: 7, name: 'iris-outbox-reconcile', schedule: '*/5 * * * *', active: true },
    { jobid: 16, name: 'spend_reservation_reap', schedule: '*/5 * * * *', active: true },
    { jobid: 11, name: 'iris-feed-status', schedule: '*/5 * * * *', active: true },
    { jobid: 1, name: 'iris-anthropic-spend-estimate', schedule: '10 4 * * *', active: true },
  ],
  spend_caps: [
    { scope: 'global', key: null, cap_usd: 3, window_hours: 1, hard: true, active: true },
    { scope: 'global', key: null, cap_usd: 10, window_hours: 24, hard: true, active: true },
    { scope: 'agent', key: 'revenue-engine', cap_usd: 2, window_hours: 24, hard: false, active: true },
  ],
  health: { failed_active: 2, retrying: 1, dead_letter: 1, recent_failures: [
    { id: 'ob-1', kind: 'execute_proposal', attempts: 3, max_attempts: 5, dead: false, next_retry_at: '2026-09-08T05:12:00Z', error: 'delivery: error · http_status 502', at: '2026-09-08T04:20:00Z' },
    { id: 'ob-2', kind: 'pulse', attempts: 5, max_attempts: 5, dead: true, next_retry_at: null, error: 'no response recorded within 1h', at: '2026-09-07T22:00:00Z' },
  ] },
  log: [
    { scope: 'agent:industry-watch', paused: false, reason: null, actor: 'owner', at: '2026-09-07T22:00:00Z' },
  ],
});

export const autonomySetPause = (a) => ok({ scope: a && a.p_scope, paused: a && a.p_paused, global_paused: a && a.p_scope === 'global' ? a.p_paused : false });
export const autonomyAgentSet = (a) => ok({ slug: a && a.p_slug, active: a && a.p_active, needs_approval: a && a.p_needs_approval });
export const outboxRetry = (a) => ok({ id: a && a.p_id, status: 'queued' });
export const outboxDeadletter = (a) => ok({ id: a && a.p_id, dead: true });
