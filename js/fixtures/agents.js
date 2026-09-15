// iris2_agents(p_hours) — constellation + roster.
//
// THIS FIXTURE DELIBERATELY MIRRORS THE SHAPE OF PRODUCTION, NOT A FLATTERING VERSION OF IT.
//
// The previous version had 14 agents with spend spread evenly across them ($4.90, $4.18, $2.55,
// $1.88…) and 13 edges. The Cortex was tuned against it and looked wonderful. Real data has a
// completely different distribution: one agent carries almost all the spend, most registered seats
// are dormant by design, the busiest worker in the system spends nothing at all, and there is
// exactly ONE edge — so the page that looked alive in preview rendered as a ring of identical dots
// on the owner's own data.
//
// So the numbers below are invented, but the SHAPE is copied from the real payload:
//   · a long tail of registered-but-dormant seats (zero events, zero spend)
//   · a few unregistered workers doing nearly all the observed work
//   · one worker with an order-of-magnitude lead in events and no spend
//   · spend concentrated in a single agent
//   · one edge
// If a change to this page looks good here, it has at least been tested against the hard case.
import { ok } from './_state.js';

// slug, name, kind, state, model, task, elapsed_s, spend_7d, failing, tasks, claims, events_24h, registered
const AGENTS = [
  // the workforce: busy, mostly unregistered, mostly free
  // the four the mission fixture also lists as running — one sample world, not two
  ['universal-crawler', 'Universal Crawler', 'worker', 'working', null, '77 sources · yield 3.1%', 134, 0.00, false, 0, 0, 445, false],
  ['catalyst-feed', 'Catalyst Feed', 'worker', 'working', null, 'earnings sweep', 58, 0.00, false, 0, 0, 20, false],
  ['doc-digest', 'Doc Digest', 'worker', 'working', 'claude-haiku-4-5', 'digesting 3 filings', 41, 0.02, false, 0, 0, 19, false],
  ['price-feed', 'Price Feed', 'worker', 'working', null, 'close prices', 12, 0.00, false, 0, 0, 2, false],
  ['earnings-actuals', 'Earnings Actuals', 'worker', 'idle', 'claude-sonnet-4-6', null, 0, 0.29, false, 0, 0, 1, false],
  ['earnings-estimates', 'Earnings Estimates', 'worker', 'idle', 'claude-sonnet-4-6', null, 0, 0.04, false, 0, 0, 1, false],
  ['prospecting-scout', 'Prospecting Scout', 'worker', 'idle', 'claude-haiku-4-5', null, 0, 0.11, false, 0, 0, 0, false],
  ['harvester', 'Harvester', 'worker', 'idle', null, null, 0, 0.00, false, 0, 0, 0, false],

  // the registry: seats the owner defined. A couple carry the task tree; most are dormant by design.
  // the ONE registered seat with observed events — which is what makes coverage ~1.4%, as in production
  ['chief-of-staff', 'Chief of Staff', 'reviewer', 'active', 'claude', 'Integrity check 03:30 UTC', 0, 0.00, false, 177, 0, 7, true],
  ['scout-work', 'Work Scout', 'scout', 'active', 'claude', 'Gig hunt 04:00', 0, 0.00, false, 41, 0, 0, true],
  ['scout-craft', 'Scout · Craft', 'scout', 'active', 'openai-free', 'Capability watch', 0, 9.04, false, 7, 202, 0, true],
  ['analyst-invest', 'Investing Analyst', 'analyst', 'active', 'claude', 'Nightly market sweep', 0, 0.00, false, 7, 0, 0, true],
  ['ceo', 'CEO', 'reviewer', 'idle', 'claude', 'CEO directive', 0, 0.00, false, 5, 0, 0, true],
  ['claude-code', 'Claude Code', 'worker', 'idle', 'claude', 'Inbox sweep', 0, 0.00, false, 3, 0, 0, true],
  ['cost-analyst', 'Cost Analyst', 'analyst', 'dormant', 'claude', null, 0, 0.00, false, 1, 0, 0, true],
  ['adversary', 'The Adversary', 'reviewer', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
  ['cfo', 'CFO', 'analyst', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
  ['librarian', 'Librarian', 'analyst', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
  ['reviewer', 'Claim Reviewer', 'reviewer', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
  ['ingestor', 'Ingestor', 'ingestor', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
  ['prompt-smith', 'Prompt Smith', 'author', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
  ['rcm-worker', 'RCM Worker', 'worker', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
  ['appeals-writer', 'Appeals Writer', 'worker', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
  ['firm-analyst', 'Firm Analyst', 'analyst', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
  ['n8n-architect', 'n8n Architect', 'worker', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
  ['personal-assistant', 'Personal Assistant', 'worker', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
  ['scout-news', 'Industry Watch', 'scout', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
  ['scout-payer', 'Payer Watch', 'scout', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
  ['ui-engineer', 'UI Engineer', 'analyst', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
  ['revenue-engine', 'Revenue Engine', 'worker', 'dormant', 'claude', null, 0, 0.00, false, 0, 0, 0, true],
];

// ONE edge, as in production: these workers mostly run alone, and the page must be honest about that
// rather than being designed against a densely-connected graph that does not exist.
const EDGES = [['earnings-actuals', 'earnings-estimates', 5, 'session']];

// a 24h pulse whose total matches events_24h — flat for everything that did not run
function pulseFor(total) {
  const p = new Array(24).fill(0);
  if (!total) return p;
  let left = total;
  for (let i = 23; i >= 0 && left > 0; i--) {
    const take = i >= 20 ? Math.ceil(left / 2) : Math.min(left, Math.max(1, Math.round(total / 12)));
    p[i] = take; left -= take;
  }
  return p;
}

export function agents() {
  const rows = AGENTS.map(([slug, name, kind, state, model, task, elapsed_s, spend_7d_usd, failing, tasks, claims, events_24h, registered]) => ({
    slug, name, kind, state, model, task, elapsed_s, spend_7d_usd, failing, tasks, claims, events_24h,
    registered,
    pulse_24h: pulseFor(events_24h),
    purpose: registered ? null : 'Observed in the event stream but not registered in brain.agents — nothing governs, budgets or audits it by name.',
  }));
  const observed = rows.filter((r) => r.events_24h > 0);
  const onRoster = observed.filter((r) => r.registered).reduce((s, r) => s + r.events_24h, 0);
  const total = observed.reduce((s, r) => s + r.events_24h, 0);

  return ok({
    constellation: { agents: rows, edges: EDGES.map(([a, b, w, kind]) => ({ a, b, w, kind })), window_hours: 168 },
    roster: rows.filter((r) => r.events_24h > 0 || r.spend_7d_usd > 0).map((r) => ({
      agent: r.slug, runs_7d: Math.max(1, Math.round(r.events_24h / 5)), events_7d: r.events_24h * 5,
      cost_7d_usd: r.spend_7d_usd, last_at: new Date(Date.now() - (r.state === 'active' ? 6e5 : 8.64e7)).toISOString(),
      idle_s: r.state === 'active' ? 600 : 86400, state: r.state, registered: r.registered,
    })),
    unregistered_workers: rows.filter((r) => !r.registered).length,
    registry_coverage_pct: total ? Math.round((onRoster / total) * 1000) / 10 : null,
    live_now: rows.filter((r) => r.state === 'working').length,   // derived, so it can never drift from the nodes
    calls_today: 55, cost_today_usd: 1.51,
  });
}
