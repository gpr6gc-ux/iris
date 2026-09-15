// iris2_traces(p_limit, p_hours, p_actor, p_only_errors) + iris2_trace(p_correlation_id)
//
// Shaped from the real spine, not an idealised one. Production over 24h: 78 distinct sessions,
// 131 terminal events, 10 errors and 1 halt, 8 agents — and 52 recorded starts against 68 dones,
// which means a sixth of all runs only ever report FINISHING. So this sample includes:
//   · short chains (most traces are 2–3 events, not sprawling trees)
//   · single-event chains (a root with nothing following it — the majority in the real log)
//   · an orphan (a done with no recorded start), because that is a real and common state
//   · one cross-table chain (run → spend → approval), which is the whole point of the spine
// A fixture that only showed tidy 6-deep trees would make this page look finished when it isn't.
import { ok } from './_state.js';

const now = Date.now();
const iso = (secAgo) => new Date(now - secAgo * 1000).toISOString();

const TRACES = [
  {
    correlation_id: '3c493ec8-da2c-bd37-b35e-183d203f4f70',
    headline: 'gig hunt 04:00', opened_with: 'agent.run.start', opened_by: 'scout-work',
    ended_with: 'usage.recorded', events: 4, started_at: iso(2400), ended_at: iso(2352),
    duration_s: 48.2, cost_usd: 0.0105, failed: false, entity_type: 'run', entity_id: 'cron-1757390400',
    actors: ['scout-work'],
  },
  {
    correlation_id: '7d5b1a02-1f44-4a7e-9c31-0a2f6b8e4411',
    headline: 'iris_inv_catalyst_upsert: ON CONFLICT no matching constraint',
    opened_with: 'agent.run.start', opened_by: 'catalyst-feed', ended_with: 'agent.run.error',
    events: 2, started_at: iso(5400), ended_at: iso(5391), duration_s: 9.1, cost_usd: 0,
    failed: true, entity_type: 'run', entity_id: 'cron-1757386000', actors: ['catalyst-feed'],
  },
  {
    correlation_id: 'c43b4b69-8748-4ef5-ba1b-d238a1a5ed4c',
    headline: 'Integrity check 04:30 UTC', opened_with: 'task.created', opened_by: 'agent:chief-of-staff',
    ended_with: 'task.done', events: 2, started_at: iso(9000), ended_at: iso(8760), duration_s: 240,
    cost_usd: 0, failed: false, entity_type: 'task', entity_id: 'c43b4b69', actors: ['agent:chief-of-staff'],
  },
  {
    correlation_id: 'a1f0c7de-55b2-4c81-8d0e-6f2a91b30cc7',
    headline: 'fetch community.anaplan.com/kb', opened_with: 'agent.run.end', opened_by: 'universal-crawler',
    ended_with: 'agent.run.end', events: 1, started_at: iso(600), ended_at: iso(600), duration_s: 0,
    cost_usd: 0, failed: false, entity_type: 'run', entity_id: 'crawl-8821', actors: ['universal-crawler'],
  },
  {
    correlation_id: 'b21e93a4-7c10-4d55-9a08-3e5c1d77f902',
    headline: 'Ship EDGAR fundamentals backfill', opened_with: 'approval.requested', opened_by: 'analyst-invest',
    ended_with: 'approval.granted', events: 2, started_at: iso(21600), ended_at: iso(18000), duration_s: 3600,
    cost_usd: 0, failed: false, entity_type: 'proposal', entity_id: 'b21e93a4', actors: ['analyst-invest', 'owner'],
  },
  {
    correlation_id: 'd4c8f01b-3a29-4e6d-b117-88e0a4c25d31',
    headline: 'digesting 3 filings', opened_with: 'agent.run.start', opened_by: 'doc-digest',
    ended_with: 'usage.recorded', events: 3, started_at: iso(1500), ended_at: iso(1459), duration_s: 41,
    cost_usd: 0.0203, failed: false, entity_type: 'run', entity_id: 'digest-441', actors: ['doc-digest'],
  },
];

const EVENTS = {
  '3c493ec8-da2c-bd37-b35e-183d203f4f70': [
    { depth: 1, event_type: 'agent.run.start', actor: 'scout-work', at: 2400, causation_id: null, payload: { event: 'run.start', detail: 'gig hunt 04:00', session_ref: 'cron-1757390400' } },
    { depth: 2, event_type: 'agent.run.end', actor: 'scout-work', at: 2355, causation_id: 'x1', payload: { event: 'run.end', detail: 'filed 3 leads', ms: 45120 } },
    { depth: 3, event_type: 'usage.recorded', actor: 'agent:scout-work', at: 2353, causation_id: 'x2', payload: { model: 'claude-sonnet-4-6', cost_usd: 0.0105, input_tokens: 1000, output_tokens: 500 } },
    { depth: 4, event_type: 'task.done', actor: 'agent:scout-work', at: 2352, causation_id: 'x3', payload: { title: 'Gig hunt 2026-09-09 04:00', status: 'done' } },
  ],
  '7d5b1a02-1f44-4a7e-9c31-0a2f6b8e4411': [
    { depth: 1, event_type: 'agent.run.start', actor: 'catalyst-feed', at: 5400, causation_id: null, payload: { event: 'run.start', detail: 'earnings sweep' } },
    { depth: 2, event_type: 'agent.run.error', actor: 'catalyst-feed', at: 5391, causation_id: 'x1', payload: { event: 'run.error', detail: 'iris_inv_catalyst_upsert: ON CONFLICT no matching constraint', ms: 9100 } },
  ],
  'c43b4b69-8748-4ef5-ba1b-d238a1a5ed4c': [
    { depth: 1, event_type: 'task.created', actor: 'agent:chief-of-staff', at: 9000, causation_id: null, payload: { title: 'Integrity check 04:30 UTC', kind: 'review', status: 'queued' } },
    { depth: 2, event_type: 'task.done', actor: 'agent:chief-of-staff', at: 8760, causation_id: 'x1', payload: { title: 'Integrity check 04:30 UTC', status: 'done' } },
  ],
  // the orphan: a run that only ever reported finishing. 52 starts against 68 dones in a real day.
  'a1f0c7de-55b2-4c81-8d0e-6f2a91b30cc7': [
    { depth: 1, event_type: 'agent.run.end', actor: 'universal-crawler', at: 600, causation_id: null, payload: { event: 'run.end', detail: 'fetch community.anaplan.com/kb · 2 new · 1 dud', session_ref: 'crawl-8821' } },
  ],
  'b21e93a4-7c10-4d55-9a08-3e5c1d77f902': [
    { depth: 1, event_type: 'approval.requested', actor: 'analyst-invest', at: 21600, causation_id: null, payload: { title: 'Ship EDGAR fundamentals backfill', action_kind: 'run_workflow', risk: 'medium', status: 'proposed' } },
    { depth: 2, event_type: 'approval.granted', actor: 'owner', at: 18000, causation_id: 'x1', payload: { title: 'Ship EDGAR fundamentals backfill', status: 'approved' } },
  ],
  'd4c8f01b-3a29-4e6d-b117-88e0a4c25d31': [
    { depth: 1, event_type: 'agent.run.start', actor: 'doc-digest', at: 1500, causation_id: null, payload: { event: 'run.start', detail: 'digesting 3 filings' } },
    { depth: 2, event_type: 'agent.run.end', actor: 'doc-digest', at: 1460, causation_id: 'x1', payload: { event: 'run.end', detail: '3 filings · 14 chunks', ms: 40100 } },
    { depth: 3, event_type: 'usage.recorded', actor: 'agent:doc-digest', at: 1459, causation_id: 'x2', payload: { model: 'claude-haiku-4-5', cost_usd: 0.0203, input_tokens: 18000, output_tokens: 900 } },
  ],
};

export function traces(args) {
  const hours = Number(args?.p_hours) || 168;
  const cutoff = now - hours * 3600 * 1000;
  let rows = TRACES.filter((t) => new Date(t.started_at).getTime() >= cutoff);
  if (args?.p_only_errors) rows = rows.filter((t) => t.failed);
  return ok({
    traces: rows,
    summary: {
      chains: rows.length,
      events: rows.reduce((s, t) => s + t.events, 0),
      failed_chains: rows.filter((t) => t.failed).length,
      multi_event_chains: rows.filter((t) => t.events > 1).length,
      window_hours: hours,
    },
  });
}

export function trace(args) {
  const id = args?.p_correlation_id;
  const raw = EVENTS[id] || [];
  const ids = raw.map((_, i) => `${id}-e${i + 1}`);
  const events = raw.map((e, i) => ({
    event_id: ids[i], seq: i + 1, depth: e.depth, event_type: e.event_type,
    occurred_at: iso(e.at), actor: e.actor, entity_type: 'event', entity_id: ids[i],
    causation_id: e.causation_id ? ids[Number(String(e.causation_id).slice(1)) - 1] : null,
    source: 'db:iris.event_log', payload: e.payload,
  }));
  const cost = events.reduce((s, e) => s + (Number(e.payload.cost_usd) || 0), 0);
  const t0 = events.length ? new Date(events[0].occurred_at).getTime() : 0;
  const t1 = events.length ? new Date(events[events.length - 1].occurred_at).getTime() : 0;
  return ok({
    correlation_id: id,
    events,
    summary: {
      events: events.length,
      started_at: events[0]?.occurred_at || null,
      ended_at: events[events.length - 1]?.occurred_at || null,
      duration_s: Math.abs(t1 - t0) / 1000,
      cost_usd: Math.round(cost * 10000) / 10000,
      failed: events.some((e) => /error|failed|denied/.test(e.event_type)),
      max_depth: Math.max(1, ...events.map((e) => e.depth)),
      orphans: 0,
    },
  });
}
