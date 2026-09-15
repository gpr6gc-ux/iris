// iris2_mission() — sample payload shaped exactly like docs/IRIS5_RPC_CONTRACTS.md.
import { ago, day, isDecided, ok } from './_state.js';
import { PROPOSALS } from './decisions.js';

export function mission() {
  const open = PROPOSALS.filter((p) => !isDecided(p.id));
  const openContent = 3 - ['cnt_01', 'cnt_02', 'cnt_03'].filter(isDecided).length;
  const openClaims = isDecided('clm_8f2a') ? 0 : 1;
  const openBuilds = isDecided('bld_edgar8k') ? 0 : 1;
  return ok({
    kpis: {
      // claims are the judge's queue, not the owner's (2026-09-13): they no longer count toward total
      needs_you: { total: open.length + openContent + openBuilds, proposals: open.length, content: openContent, claims: openClaims, builds: openBuilds },
      claims_triage: { pending: 41, kept_today: 1, discarded_today: 37, last_run: ago('52m') },
      spend_today_usd: 1.84, spend_cap_usd: 10, revenue_30d_usd: 0,
      gates: { green: 17, total: 17 }, feeds_stale: 3,
    },
    proposals: open.map((p) => ({ id: p.id, kind: p.detail.kind, title: p.title, by: p.by, at: p.at, risk: p.detail.risk, cost_usd: p.detail.cost_usd, steps: p.detail.steps, source_url: p.detail.source_url, hot: p.hot })),
    /* live_count is DERIVED from the list, never a separate literal. It used to read 14 beside a
       list of 4, and the sidebar rendered "14 agents live" while the Cortex said 0 — a preview that
       contradicts itself teaches nobody anything about the real thing. The agents here are the same
       workers fixtures/agents.js shows as active, so the sample world is internally consistent. */
    machine: {
      get live_count() { return this.running.length; },
      running: [
        { agent: 'universal-crawler', title: '77 sources · yield 3.1%', started_at: ago('134s'), elapsed_s: 134, cost_usd: 0, state: 'running' },
        { agent: 'doc-digest', title: 'digesting 3 filings', started_at: ago('41s'), elapsed_s: 41, cost_usd: 0.02, state: 'running' },
        { agent: 'catalyst-feed', title: 'earnings sweep', started_at: ago('58s'), elapsed_s: 58, cost_usd: 0, state: 'running' },
        { agent: 'price-feed', title: 'close prices', started_at: ago('12s'), elapsed_s: 12, cost_usd: 0, state: 'running' },
      ],
    },
    digest_24h: {
      approved: 6, executed: 6, tasks_done: 212, tasks_failed: 3, claims_found: 41, claims_accepted: 12, model_calls: 212, cost_usd: 3.90,
      hourly_cost: [0.04, 0.02, 0.01, 0.01, 0.03, 0.06, 0.12, 0.21, 0.34, 0.28, 0.19, 0.22, 0.31, 0.26, 0.18, 0.24, 0.29, 0.33, 0.21, 0.14, 0.11, 0.09, 0.07, 0.14],
    },
    pipeline: [
      { org: 'Capital Region Health', stage: 'qualified', value_usd: 18000, next_action: 'Send ModelLens audit proposal', due: day(5) },
      { org: 'Meridian Foods', stage: 'qualified', value_usd: 6500, next_action: 'Discovery call prep', due: day(7) },
      { org: 'Northwind Group', stage: 'candidate', value_usd: null, next_action: 'Draft outreach (approval)', due: day(8) },
    ],
    feed_health: [
      { feed: 'ops.agent_stream · brain.claims', expected: 'continuous', last_at: ago('11m'), age_s: 660, state: 'live' },
      { feed: 're.listings · listing_scores', expected: 'every 2 h', last_at: ago('71m'), age_s: 4260, state: 'ok' },
      { feed: 'inv.prices (nightly)', expected: 'nightly', last_at: ago('6h'), age_s: 21600, state: 'live' },
      { feed: 'inv.macro (daily)', expected: 'daily', last_at: ago('14h'), age_s: 50400, state: 'live' },
      { feed: 'fin.transactions (on sync)', expected: 'on sync', last_at: ago('5d'), age_s: 432000, state: 'failing' },
      { feed: 'inv.catalysts (hourly)', expected: 'hourly', last_at: ago('13h'), age_s: 46800, state: 'stale' },
    ],
  });
}

// iris2_mission_tower() — the Mission control tower (Phase 3): ranked attention items + a deterministic
// health roll-up. Shaped exactly like the live RPC so the tower renders identically in preview.
export function missionTower() {
  return ok({
    items: [
      { id: 'ti_01', kind: 'feed.failing', severity: 'warn', score: 78.0, age_h: 6, status: 'open', domain: 'system',
        title: 'Feed failing: fin_sync', entity_ref: 'iris.feed_health:fin_sync', created_at: ago('6h'),
        why: 'warn severity (60 pts) + 5 age pts, ×0.90 system weight, +15 dependency = 78.0',
        detail: { feed: 'fin_sync', domain: 'finance', reason: 'no automated writer — connect SimpleFIN on the Keys page' } },
      { id: 'ti_02', kind: 'proposal.failed', severity: 'warn', score: 64.0, age_h: 3, status: 'open', domain: 'governance',
        title: 'Proposal failed: nightly sector-rotation refresh', entity_ref: 'brain.proposals:sample', created_at: ago('3h'),
        why: 'warn severity (60 pts) + 0 age pts, ×1.15 governance weight = 64.0',
        detail: { reason: 'PRICE_API_KEY missing — set it on the Keys page' } },
      { id: 'ti_03', kind: 'feed.stale', severity: 'watch', score: 30.0, age_h: 2, status: 'open', domain: 'system',
        title: 'Feed stale: catalysts', entity_ref: 'iris.feed_health:catalysts', created_at: ago('2h'),
        why: 'watch severity (30 pts) + 0 age pts, ×0.90 system weight = 30.0',
        detail: { feed: 'catalysts', domain: 'markets', reason: 'newest 8-K is 13h old — normal on a quiet weekend' } },
    ],
    counts: { ack: 0, open: 3, snoozed: 0, by_domain: { system: 2, governance: 1 }, by_severity: { warn: 2, watch: 1 } },
    health: {
      feeds: { ok: 10, live: 4, stale: 1, failing: 1 },
      secrets: { present: 3, missing_optional: 6, missing_required: 1, detail: [] },
      entities: 8115,
    },
  });
}

// iris2_mission_act(p_id, p_action, p_snooze_hours) — ack / snooze / dismiss a tower item. The page reloads the tower after.
export function missionAct(args = {}) {
  return ok({ id: args.p_id, action: args.p_action, status: 'updated' });
}
