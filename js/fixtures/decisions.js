// iris2_decisions(p_kind, p_limit) + iris2_decide / iris2_decide_bulk — the unified inbox and its writes.
import { ago, isDecided, decide, ok, fail, STATE } from './_state.js';

const LI_BODY_1 = `I audited an FP&A model last week with 184 modules. The same margin formula lived in eleven staging line items — identical text, identical dimensions.

Every one of them recalculates on every change. Every one is a place the logic can drift. When the FP&A lead changed the allocation basis in March, nine of the eleven copies were updated. Two were not. Nobody noticed until the board pack disagreed with the GL by 0.4 points.

The Planual rule is boring and correct: calculate once, reference many. In this model that was 6 of the 53 points the deterministic engine deducted — and the fix is a Tuesday afternoon, not a re-platform.

Three questions I ask before touching a duplicate:
1. Which copy do downstream modules actually read?
2. Does the summary method match on every copy?
3. Who owns the one that stays?

The engine finds the groups mechanically (same formula text, same applies-to, same time scale). The judgement about which one survives is still a human call — that is the part worth an hour of your architect's time.

If you run Anaplan at scale and want the list of duplicates in your model, the audit is read-only and takes a day.`;

const LI_BODY_2 = `Subsidiary views feel free. They are not.

Every subsidiary view is a second copy of the module's dimensionality, kept in sync by the engine on every recalculation. In the Northwind plan we found 14 of them on a module with 2.6 billion cells. That is a dimensionality tax you pay on every keystroke, every import, every scenario copy.

Here is what the 14 looked like once we listed them:
- 4 were intentional: regional roll-ups the sales team reads every Monday.
- 3 were leftovers from a 2023 restructure nobody dared to delete.
- 5 duplicated a calculation that already existed one module upstream.
- 2 existed only because a dashboard once needed a different time summary.

The pattern that removes most of them: build the calculation once at the lowest common dimensionality, then expose it with a single output module per audience. The output module is cheap — it holds references, not calculations — and it gives the dashboard team something stable to point at.

ML-DIM-001 flags the candidates; the reviewer decides which ones are intentional. Two were. Twelve were not. The recalculation time on the Northwind model dropped by roughly a third once the twelve went, and the model size fell under the workspace ceiling for the first time in a year.

None of this needs a rebuild. It needs a list, an owner per line, and a quiet afternoon.

A model-health audit lists them for you, with the cell counts, so the conversation with the model owner starts from numbers instead of opinions.`;

const LI_BODY_3 = `A Boolean line item costs 1 bit per cell. A text line item holding "Yes" costs 8 bytes and a comparison on every read.

In the Atlas supply-chain model, 31 flags were stored as text. Across 1.9 million cells that is roughly 15 MB of working memory spent on the word "Yes" — and a formula like IF Flag = "Yes" THEN … evaluated everywhere the flag is read.

Why does this happen? Usually an import. The source system exported "Yes"/"No", the import mapped it to a text line item, and the first formula that consumed it compared strings. Every formula after that copied the pattern.

ML-TYP-001 is one of the cheapest fixes in the whole rule set: change the format to Boolean, replace the comparison with the item itself, recalc. Ten minutes per flag, no data migration, and the engine can now use the flag in a filter without a text scan.

Small rules add up. Six of them accounted for a third of the deductions in that model — and none of the six needed an architect to fix.`;

const QUALITY_CHECKS = (chars, extra = []) => [
  { name: 'length', pass: chars >= 900 && chars <= 1600, note: `${chars.toLocaleString('en-US')} chars · ${chars < 900 ? 'under the ideal band 900–1,600 (−10, soft)' : chars > 1600 ? 'over the ideal band 900–1,600 (−10, soft)' : 'within the ideal band 900–1,600'}` },
  { name: 'hook', pass: true, note: 'first line under 120 chars, no question mark' },
  { name: 'cta', pass: true, note: 'one call to action, last paragraph' },
  { name: 'banned phrases', pass: true, note: '0 found' },
  { name: 'hashtags', pass: true, note: '3 · #Anaplan #FPandA #ModelHealth' },
  { name: 'duplicates', pass: true, note: 'no near-duplicate in the last 30 days' },
  ...extra,
];

export const CONTENT = [
  { id: 'cnt_01', title: 'ML-RED-001: Calculate once, reference many times — duplicate formulas cost you', chars: LI_BODY_1.length, quality: 100, critic: 76, verdict: 'revise', brand_safety: 9, body: LI_BODY_1, hook: 'I audited an FP&A model last week with 184 modules. The same margin formula lived in eleven staging line items.', cta: 'If you run Anaplan at scale and want the list of duplicates in your model, the audit is read-only and takes a day.', at: ago('14m'), sources: [{ uri: 'claim:8f2a6c31', title: 'brain.claims 8f2a… · duplicate formula groups' }, { uri: 'karta.efficiency_findings/ML-RED-001', title: 'karta.efficiency_findings ML-RED-001' }] },
  { id: 'cnt_02', title: 'ML-DIM-001: Subsidiary views are a dimensionality tax', chars: LI_BODY_2.length, quality: 90, critic: 81, verdict: 'approve', brand_safety: 10, body: LI_BODY_2, hook: 'Subsidiary views feel free. They are not.', cta: 'A model-health audit lists them for you, with the cell counts.', at: ago('14m'), sources: [{ uri: 'karta.efficiency_findings/ML-DIM-001', title: 'karta.efficiency_findings ML-DIM-001' }, { uri: 'karta.efficiency_runs/run_nw_0904', title: 'Northwind run 2026-09-04' }], over: [{ name: 'hashtags', pass: false, note: '5 · over the recommended 3–4 (−10, soft)' }] },
  { id: 'cnt_03', title: 'ML-TYP-001: Text as Boolean flag costs 8 bytes where 1 bit would do', chars: LI_BODY_3.length, quality: 100, critic: 72, verdict: 'revise', brand_safety: 10, body: LI_BODY_3, hook: 'A Boolean line item costs 1 bit per cell. A text line item holding "Yes" costs 8 bytes.', cta: 'Small rules add up. Six of them accounted for a third of the deductions in that model.', at: ago('14m'), sources: [{ uri: 'karta.efficiency_findings/ML-TYP-001', title: 'karta.efficiency_findings ML-TYP-001' }] },
];

export const PROPOSALS = [
  { kind: 'proposal', id: 'prop_6f1c2a9e', title: 'Publish RVA Deal Sheet issue #2 to the sales page', by: 'deal-sheet-agent', at: ago('8m'), signal: '$0.42', severity: 'high', hot: true,
    detail: { kind: 'publish_static', risk: 'low', cost_usd: 0.42, source_url: 'https://rva-deal-sheet.netlify.app/issues/2026-09-05', steps: ['Render the issue from iris_re_deal_sheet (Richmond, 14 days)', 'Upload to Netlify site rva-deal-sheet as /issues/2026-09-05', 'Record decision → executor → report here'] } },
  { kind: 'proposal', id: 'prop_a31d77c0', title: 'Run the ModelLens LLM review for Meridian Health — Workforce Planning', by: 'modellens-review', at: ago('41m'), signal: '$0.90', severity: 'medium', hot: false,
    detail: { kind: 'llm_review', risk: 'low', cost_usd: 0.90, source_url: null, steps: ['Queue 13 review packets through the governed LLM layer', 'Spend counts against today’s $10 cap (currently $1.84)', 'Verdicts land in Projects → ModelLens → disputed'] } },
  { kind: 'proposal', id: 'prop_c9e04b12', title: 'Raise Anthropic daily cap $10 → $15 for the review sprint', by: 'spend-governor', at: ago('3.3h'), signal: 'policy', severity: 'high', hot: true,
    detail: { kind: 'spend_cap', risk: 'high', cost_usd: null, source_url: null, steps: ['Update ops.spend_caps (24h window, hard)', 'Effective immediately for all agents', 'Audit row + revert card created'] } },
];

const CLAIMS = [
  { kind: 'claim', id: 'clm_8f2a', title: 'Anaplan Planual 2.02-02: avoid SUM over LOOKUP in one formula', by: 'scout-craft', at: ago('92m'), signal: 'conf 0.86', severity: 'low',
    detail: { kind: 'lesson', statement: 'Planual 2.02-02: avoid SUM over LOOKUP in one formula; stage the LOOKUP in its own line item first.', detail: 'Combining SUM and LOOKUP forces the engine to materialise the lookup for every summed cell. Staging the LOOKUP once and summing the staged item is 3–10× cheaper on large modules. Seen in CAL03 Allocation (Northwind) and in two community threads.', confidence: 0.86, sources: [{ uri: 'https://community.anaplan.com/kb/planual-2-02-02', title: 'community.anaplan.com/kb · Planual 2.02-02' }, { uri: 'https://community.anaplan.com/discussion/sum-lookup-performance', title: 'Forum thread · SUM over LOOKUP performance' }] } },
];
const BUILDS = [
  { kind: 'build', id: 'bld_edgar8k', title: 'Factory · EDGAR 8-K healthcare M&A signal', by: 'factory', at: ago('3h'), signal: 'effort M', severity: 'low',
    detail: { source_repo: 'sec-edgar/edgar-crawler', source_url: 'https://github.com/nlpaueb/edgar-crawler', what_it_builds: 'An n8n workflow that watches 8-K item 1.01/2.01 filings for SIC 80xx issuers and files a catalyst row with the counterparties and deal size.', who_for: 'Markets · pressure map', impact: 'medium · fills the catalyst gap while the feed is down', effort: 'M · ~6 hours, one governed LLM step for entity extraction' } },
];

const contentItem = (c) => ({
  kind: 'content', id: c.id, title: `LinkedIn · ${c.title.split(' — ')[0]}`, by: 'revenue-engine', at: c.at, signal: `quality ${c.quality}`, severity: 'medium',
  detail: {
    channel_key: 'linkedin_greyson', channel_auto_publish: !!STATE.channels.linkedin_greyson, body: c.body, hook: c.hook, cta: c.cta,
    quality: { score: c.quality, pass: true, checks: QUALITY_CHECKS(c.body.length).map((k) => (c.over || []).find((x) => x.name === k.name) || k) },
    critic: { score: c.critic, verdict: c.verdict, brand_safety: c.brand_safety },
    sources: c.sources,
  },
});

export function allItems() {
  return [...PROPOSALS, ...CONTENT.map(contentItem), ...CLAIMS, ...BUILDS].filter((i) => !isDecided(i.id)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export function decisions(args = {}) {
  const kind = args.p_kind || 'all';
  const items = allItems();
  const counts = { proposal: 0, content: 0, claim: 0, build: 0 };
  for (const i of items) counts[i.kind] = (counts[i.kind] || 0) + 1;
  // claims are auto-triaged (2026-09-13) and no longer count toward the owner's inbox; the Claims tab remains for a deliberate look
  counts.all = counts.proposal + counts.content + counts.build;
  counts.claims_triage = { pending: counts.claim, kept_7d: 8, discarded_7d: 203, last_run: ago('52m') };
  const limit = Math.min(Number(args.p_limit) || 50, 200);
  const shown = kind === 'all' ? items.filter((i) => i.kind !== 'claim') : items.filter((i) => i.kind === kind);
  return ok({ counts, items: shown.slice(0, limit) });
}

const VALID = { proposal: ['approve', 'decline'], content: ['approve', 'reject', 'hold'], claim: ['accept', 'keep', 'dismiss'], build: ['approve', 'decline'] };
export function decideFx(args = {}) {
  const { p_kind: kind, p_id: id, p_decision: decision, p_note: note = '' } = args;
  if (!VALID[kind]) return fail('invalid', `unknown kind ${kind}`);
  if (!VALID[kind].includes(decision)) return fail('invalid', `${decision} is not valid for ${kind}`);
  const exists = allItems().some((i) => i.id === id) || (kind === 'claim' && /^clm_/.test(String(id)));
  if (!exists) return fail(isDecided(id) ? 'conflict' : 'not_found', isDecided(id) ? 'already decided' : `no open ${kind} with id ${id}`);
  return ok(decide(kind, id, decision, note));
}
export function decideBulkFx(args = {}) {
  const { p_kind: kind, p_ids: ids = [], p_decision: decision, p_note: note = '' } = args;
  if (!VALID[kind] || !VALID[kind].includes(decision)) return fail('invalid', 'bad kind or decision');
  const results = (ids || []).map((id) => decide(kind, id, decision, note));
  return ok({ kind, decision, count: results.length, ids: results.map((r) => r.id), status: results[0]?.status || null });
}
