// iris2_brain(p_kind, p_limit) + iris2_brain_ask(p_query, p_limit)
import { ago, ok, isDecided } from './_state.js';

const C = (id, kind, agent, confidence, statement, detail, sources, secAgo) => ({ id, kind, agent, confidence, statement, detail, sources, at: ago(secAgo) });
export const CLAIMS = [
  C('clm_8f2a', 'lesson', 'scout-craft', 0.86, 'Planual 2.02-02: avoid SUM over LOOKUP in one formula; stage the LOOKUP first.', 'Materialising the lookup for every summed cell is 3–10× slower on large modules.', [{ uri: 'https://community.anaplan.com/kb/planual-2-02-02', title: 'community.anaplan.com/kb' }, { uri: 'https://community.anaplan.com/discussion/sum-lookup-performance', title: 'forum thread' }], 5520),
  C('clm_1b7e', 'capability', 'scout-work', 0.74, 'n8n 1.108 adds Data Tables — replace the Airtable sink in Harvester.', 'Native tables remove the Airtable credential and the 5 req/s limit from the harvest path.', [{ uri: 'https://docs.n8n.io/release-notes/', title: 'docs.n8n.io' }], 9000),
  C('clm_4c02', 'lead', 'scout-markets', 0.61, 'Capital Region Health posted an FP&A Anaplan architect role — model-health audit fit.', 'Job post lists 180+ module IFP and a "model performance" mandate.', [{ uri: 'https://www.linkedin.com/jobs/', title: 'job board' }], 12600),
  C('clm_9d13', 'capability', 'scout-signals', 0.78, 'Supabase Realtime broadcast from database triggers is GA (realtime.send).', 'Replaces the 8 s polling loop on the board; private channels need an RLS policy on realtime.messages.', [{ uri: 'https://supabase.com/docs/guides/realtime/broadcast', title: 'supabase.com/docs' }], 20000),
  C('clm_2e44', 'lesson', 'modellens-review', 0.82, 'Sum summaries on ratio line items are the most common HIGH finding across all four sample models.', '9 of 34 HIGH findings in Northwind; 100% agreement with the reviewer.', [{ uri: 'karta.efficiency_findings', title: 'karta.efficiency_findings' }], 26000),
  C('clm_7a91', 'fact', 'gmail-sentinel', 0.9, 'Meridian Foods confirmed the discovery call for Sep 11, 10:00 ET.', 'Thread: "Re: Anaplan model review — availability".', [{ uri: 'gmail:thread/18f2…', title: 'Gmail thread' }], 30000),
  C('clm_5f60', 'risk', 'spend-governor', 0.7, 'Nightly price backfill hits the 8 s authenticated statement_timeout on 3 of 7 nights.', '660 × 57014 in the last 24 h; the backfill needs paging or a longer per-function timeout.', [{ uri: 'postgres_logs', title: 'postgres logs' }], 34000),
  C('clm_3c77', 'capability', 'scout-work', 0.66, 'Netlify Blobs can hold the deal-sheet issue archive without a database round-trip.', 'Free tier covers 1 GB; fits the issue PDFs.', [{ uri: 'https://docs.netlify.com/blobs/overview/', title: 'docs.netlify.com' }], 40000),
  C('clm_6e18', 'lead', 'scout-markets', 0.55, 'Atlas Consumer Goods is hiring an Anaplan CoE lead (supply chain).', 'Second Anaplan role in 30 days; model consolidation mentioned.', [{ uri: 'https://www.linkedin.com/jobs/', title: 'job board' }], 46000),
  C('clm_0a25', 'lesson', 'scout-craft', 0.8, 'Text-as-Boolean flags cost 8 bytes and a comparison per cell; ML-TYP-001 is the cheapest fix in the rule set.', '31 flags in Atlas; ~15 MB working memory.', [{ uri: 'karta.efficiency_findings/ML-TYP-001', title: 'karta.efficiency_findings' }], 52000),
  C('clm_b4d9', 'capability', 'scout-signals', 0.72, 'Claude Haiku 4.5 handles the content critic at ~$0.004 per draft with no quality loss vs Sonnet on the 30-draft sample.', 'Brand-safety and specificity scores within 2 points.', [{ uri: 'ops.llm_ledger', title: 'ops.llm_ledger' }], 58000),
  C('clm_c1f3', 'fact', 'deal-sheet-agent', 0.88, 'Issue #2 of the RVA Deal Sheet has 6 deals, 3 clearing the buy box.', 'Generated from iris_re_deal_sheet (Richmond, 14 days).', [{ uri: 'rva-deal-sheet:issue-2', title: 'issue draft' }], 64000),
  C('clm_d7e5', 'lead', 'scout-markets', 0.5, 'Northwind Group finance is evaluating a model rebuild (LinkedIn post by the FP&A director).', 'Public post; no contact yet.', [{ uri: 'https://www.linkedin.com/', title: 'LinkedIn post' }], 70000),
  C('clm_e809', 'risk', 'scout-signals', 0.68, 'The legacy board token is referenced in 69 n8n nodes; rotating it is a 2-hour job with a dry run.', 'List generated from the workflow export.', [{ uri: 'n8n:workflows', title: 'workflow export' }], 76000),
];

export function brain(args = {}) {
  const kind = args.p_kind || 'all';
  const open = CLAIMS.filter((c) => !isDecided(c.id));
  const by_kind = {}; for (const c of open) by_kind[c.kind] = (by_kind[c.kind] || 0) + 1;
  const claims = (kind === 'all' ? open : open.filter((c) => c.kind === kind)).slice(0, Math.min(Number(args.p_limit) || 100, 400));
  return ok({
    claims, by_kind, total: open.length,
    goals: [
      { id: 'goal_01', title: 'First $5k/month from Karta & ModelLens', org: 'Karta', horizon: 'Q4 2026', status: 'active', progress_pct: 18, why: 'Proves the audit offer sells before building more product.', next_milestone: 'First paid single-model audit', updates: [{ note: 'Offer copy drafted; Stripe link pending.', by: 'revenue-engine', at: ago('1d') }] },
      { id: 'goal_02', title: 'Ship IRIS 5.0 with real auth', org: 'IRIS', horizon: 'Sep 2026', status: 'active', progress_pct: 62, why: 'Removes the shared token from the public page.', next_milestone: 'Cutover iris-command → iris-command-5', updates: [{ note: 'RPC v2 contract frozen.', by: 'owner', at: ago('6h') }] },
      { id: 'goal_03', title: 'Acquire the first duplex under $350k', org: 'Estate', horizon: '2027', status: 'active', progress_pct: 9, why: 'House-hack the first unit; cash flow the second.', next_milestone: 'Underwrite 3 clearing deals', updates: [{ note: '1418 Chamberlayne clears at opening bid.', by: 'deal-sheet-agent', at: ago('1d') }] },
    ],
    recent_facts: [
      { statement: 'Meridian Foods discovery call confirmed for Sep 11, 10:00 ET.', at: ago('8h'), by: 'gmail-sentinel' },
      { statement: 'Northwind run scored 29.0 with 100% metadata coverage.', at: ago('5h'), by: 'modellens-review' },
      { statement: 'Catalyst feed has failed hourly since Sep 2 (constraint mismatch).', at: ago('2d'), by: 'spend-governor' },
    ],
    agents: [{ agent: 'scout-craft', claims_7d: 41, accepted_7d: 12 }, { agent: 'scout-signals', claims_7d: 22, accepted_7d: 9 }, { agent: 'scout-markets', claims_7d: 9, accepted_7d: 2 }, { agent: 'scout-work', claims_7d: 14, accepted_7d: 5 }],
  });
}

export function brainAsk(args = {}) {
  const q = String(args.p_query || '').toLowerCase();
  const all = [
    { statement: 'Deal Sheet pricing: $29/month or $199/year; first issue free on the sales page.', detail: 'Decided 2026-08-30 after the council review; subscription links still need to be created (owner action).', score: 0.91, sources: [{ uri: 'memory.facts/dec-2026-08-30-dealsheet', title: 'memory.facts · deal sheet pricing' }, { uri: 'rev.offers/off_03', title: 'rev.offers · RVA Deal Sheet monthly' }], tags: ['deal sheet', 'pricing', 'price', 'subscription'] },
    { statement: 'ModelLens audit is priced at $1,500 for a single model, $5,000 for a portfolio of up to four.', detail: 'Read-only, no cell values leave the client; engagement letter + NDA drafts exist.', score: 0.84, sources: [{ uri: 'rev.offers/off_01', title: 'rev.offers · single-model audit' }], tags: ['modellens', 'audit', 'price', 'pricing'] },
    { statement: 'Approval never posts; only a channel switch ON releases approved items to the publisher.', detail: 'Owner rule recorded in REVENUE_ENGINE.md §1 and enforced by iris_rev_queue_next.', score: 0.8, sources: [{ uri: 'docs/REVENUE_ENGINE.md', title: 'REVENUE_ENGINE.md' }], tags: ['publish', 'channel', 'switch', 'linkedin', 'approve'] },
    { statement: 'Public assets never show personal financials; Money is owner-only and blurred in previews.', detail: 'Standing rule; the 5.0 front end hides the Money page in preview mode.', score: 0.77, sources: [{ uri: 'memory.facts/rule-money-private', title: 'memory.facts · money rule' }], tags: ['money', 'financial', 'public', 'privacy'] },
    { statement: 'Buy box: price ≤ $350k, ≤ 2 units, DSCR ≥ 1.2, cash flow ≥ $150/unit/month, believable rent $1,450/unit.', detail: 'Rescreens run against re.listing_scores; 61,835 rows pass.', score: 0.74, sources: [{ uri: 're.buy_boxes/1', title: 're.buy_boxes' }], tags: ['buy box', 'duplex', 'estate', 'dscr', 'rent'] },
  ];
  const hits = all.map((h) => ({ ...h, score: q ? (h.tags.some((t) => q.includes(t)) ? h.score : h.score * 0.45) : h.score })).sort((a, b) => b.score - a.score).slice(0, Math.min(Number(args.p_limit) || 8, 20)).map(({ tags, ...h }) => ({ ...h, score: +h.score.toFixed(2) }));
  return ok({ hits, query: args.p_query || '' });
}
