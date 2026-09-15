// iris2_events — the unified event spine reader. Preview payload: a realistic recent trace so the
// Cortex ticker (and any future Activity view) renders without a network. Shape mirrors the RPC:
// { events:[{event_id,event_type,schema_version,occurred_at,actor,entity_type,entity_id,
//            correlation_id,causation_id,source,payload}], summary:{total,oldest,newest} }.
import { ok } from './_state.js';

const now = Date.now();
const iso = (secondsAgo) => new Date(now - secondsAgo * 1000).toISOString();
let seq = 0;
const uid = () => `ev_${(seq++).toString(16).padStart(4, '0')}${Math.random().toString(16).slice(2, 8)}`;

const SAMPLE = [
  { event_type: 'signal.feed_ok', actor: 'price-feed', entity_type: 'signal', source: 'db:iris.events', payload: { domain: 'markets', kind: 'feed_ok', severity: 'info', title: 'grouped daily · 11,214 tickers' }, occurred_at: iso(12) },
  { event_type: 'usage.recorded', actor: 'agent:scout-markets', entity_type: 'spend', source: 'db:ops.spend_ledger', payload: { model: 'claude-sonnet-4-6', cost_usd: 0.021, input_tokens: 4200, output_tokens: 610 }, occurred_at: iso(38) },
  { event_type: 'task.completed', actor: 'agent:harvester', entity_type: 'task', source: 'db:brain.tasks', payload: { kind: 'harvest', title: 'extract reusable artifacts', status: 'completed' }, occurred_at: iso(64) },
  { event_type: 'approval.requested', actor: 'agent:leads', entity_type: 'proposal', source: 'db:brain.proposals', payload: { title: 'qualify 5 RCM candidate leads', action_kind: 'accept_claim', risk: 'low', status: 'open' }, occurred_at: iso(96) },
  { event_type: 'task.created', actor: 'agent:crawler', entity_type: 'task', source: 'db:brain.tasks', payload: { kind: 'crawl', title: 'source: EDGAR 8-K', status: 'queued' }, occurred_at: iso(120) },
  { event_type: 'signal.feed_fail', actor: 'fin-sync', entity_type: 'signal', source: 'db:iris.events', payload: { domain: 'finance', kind: 'feed_fail', severity: 'warn', title: 'SimpleFIN not configured' }, occurred_at: iso(150) },
  { event_type: 'usage.recorded', actor: 'agent:doc-digest', entity_type: 'spend', source: 'db:ops.spend_ledger', payload: { model: 'claude-haiku-4-5', cost_usd: 0.004, input_tokens: 1800, output_tokens: 240 }, occurred_at: iso(180) },
  { event_type: 'approval.granted', actor: 'owner', entity_type: 'proposal', source: 'db:brain.proposals', payload: { title: 'promote pricing prompt v4', status: 'approved' }, occurred_at: iso(240) },
];

export function events(a = {}) {
  const limit = Math.max(1, Math.min(Number(a.p_limit) || 200, 1000));
  const list = SAMPLE.slice(0, limit).map((e) => ({
    event_id: uid(), schema_version: 1, entity_id: e.entity_id || 'sample',
    correlation_id: uid(), causation_id: null, ...e,
  }));
  return ok({
    events: list,
    summary: { total: SAMPLE.length, oldest: SAMPLE[SAMPLE.length - 1].occurred_at, newest: SAMPLE[0].occurred_at },
  });
}
