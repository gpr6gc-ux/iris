// iris2_karta(p_project_id) + iris2_karta_trace(p_line_item_id) — the Karta demo project (Northwind IFP fixture).
import { ago, ok, fail } from './_state.js';

const PROJECT_ID = '4b6d1a8e-2c3f-4e5a-9b7c-1d2e3f4a5b6c';

export const TRACE_040 = {
  line_item: { id: '101000000040', name: 'Margin % (Sum)', module: 'CAL02 Cost & Margin', module_id: '101000000007', format: 'Number', applies_to: 'Product | Region | Customer', time_scale: 'Month', summary: 'Sum', cells: 864000, role: 'calculation', notes: '' },
  formula: "IF 'CAL01 Revenue'.Gross Revenue = 0 THEN 0 ELSE Gross Margin / 'CAL01 Revenue'.Gross Revenue",
  dependencies: {
    in: [
      { id: '101000000039', title: 'CAL02 Cost & Margin › Gross Margin', edge_type: 'reads' },
      { id: '101000000028', title: 'CAL01 Revenue › Gross Revenue', edge_type: 'reads' },
      { id: '101000000014', title: 'INP01 Price Inputs › List Price', edge_type: 'reads (transitive)' },
      { id: '101000000038', title: 'CAL02 Cost & Margin › COGS', edge_type: 'reads (transitive)' },
      { id: '101000000031', title: 'INP02 Volume Inputs › Units', edge_type: 'reads (transitive)' },
      { id: '101000000001', title: 'SYS01 Time Settings › Current Period', edge_type: 'reads (transitive)' },
    ],
    out: [
      { id: '101000000058', title: 'OUT01 Exec Dashboard › Margin % (Display)', edge_type: 'feeds' },
      { id: '101000000041', title: 'CAL02 Cost & Margin › Margin % (Ratio)', edge_type: 'sibling' },
      { id: 'ux:page:margin-review', title: 'UX page · Margin review (declared consumer)', edge_type: 'feeds (declared)' },
    ],
  },
  lineage: [
    { from_type: 'requirement', from_id: 'REQ-004', from_title: 'Margin % must reconcile to the GL at region level', edge_type: 'motivates', to_type: 'decision', to_id: 'DEC-002', to_title: 'Compute margin from CAL01 Gross Revenue, not from OUT01' },
    { from_type: 'decision', from_id: 'DEC-002', from_title: 'Compute margin from CAL01 Gross Revenue, not from OUT01', edge_type: 'implemented_by', to_type: 'line_item', to_id: '101000000040', to_title: 'CAL02 Cost & Margin › Margin % (Sum)' },
    { from_type: 'source', from_id: 'granola:sprint4', from_title: 'Granola · Sprint 4 planning · 2026-08-12', edge_type: 'evidence_for', to_type: 'decision', to_id: 'DEC-002', to_title: 'Compute margin from CAL01 Gross Revenue, not from OUT01' },
    { from_type: 'finding', from_id: 'ML-SUM-002', from_title: 'Sum summary on a ratio or percentage', edge_type: 'flags', to_type: 'line_item', to_id: '101000000040', to_title: 'CAL02 Cost & Margin › Margin % (Sum)' },
  ],
  evidence: [
    { source_type: 'meeting_note', source_id: 'granola:sprint4', quote: 'Finance wants margin % that ties to the GL by region; build it off Gross Revenue in CAL01, not the dashboard number.', at: '2026-08-12T14:20:00Z' },
    { source_type: 'meeting_note', source_id: 'granola:sprint4', quote: 'Keep the Sum version for the UX page until the Ratio version is signed off.', at: '2026-08-12T14:31:00Z' },
  ],
  findings: [
    { rule_id: 'ML-SUM-002', rule: 'Sum summary on a ratio or percentage', severity: 'HIGH', deduction: 2.5, status: 'open', note: 'summary should be Ratio' },
    { rule_id: 'ML-HYG-003', rule: 'Calculation with no captured consumer', severity: 'LOW', deduction: 0.5, status: 'disputed', note: 'consumed by a UX page' },
  ],
  snapshots: [
    { at: '2026-08-12T15:02:00Z', by: 'solution_architect', change: 'created · formula set to Gross Margin / Gross Revenue' },
    { at: '2026-08-19T10:44:00Z', by: 'anaplan_builder', change: 'wrapped in IF … = 0 guard; summary left as Sum' },
  ],
};

export function karta(args = {}) {
  if (args.p_project_id && args.p_project_id !== PROJECT_ID) return fail('not_found', 'project not found');
  return ok({
    projects: [{ id: PROJECT_ID, name: 'Northwind IFP', client: 'Karta Demo Client', workstream_count: 3 }],
    selected_project_id: PROJECT_ID,
    counts: { clients: 1, projects: 1, models: 1, modules: 13, line_items: 51, formulas: 46, dependencies: 79, lineage_edges: 29, requirements: 3, decisions: 3, proposals_pending: 1 },
    members: [
      { user: 'Greyson', role: 'owner', can_write: true },
      { user: 'SA · demo', role: 'solution_architect', can_write: true },
      { user: 'Builder · demo', role: 'anaplan_builder', can_write: false },
      { user: '—', role: 'client_viewer', can_write: false },
    ],
    proposals: [
      { id: 'NWFP-158', title: 'Add Customer to Margin %', submitted_by: 'Builder · demo', role: 'anaplan_builder', status: 'pending', created_at: ago('43m') },
    ],
    change_events: [
      { at: ago('41m'), event_type: 'efficiency_run recorded', entity: 'Northwind IFP · score 47.0', actor: 'modellens', status: 'done' },
      { at: ago('42m'), event_type: 'source persisted', entity: 'Granola · Sprint 4 note', actor: 'solution_architect', status: 'done' },
      { at: ago('43m'), event_type: 'proposal filed', entity: 'NWFP-158', actor: 'anaplan_builder', status: 'pending' },
      { at: ago('2h'), event_type: 'lineage edge added', entity: 'DEC-002 → 101000000040', actor: 'solution_architect', status: 'done' },
      { at: ago('3h'), event_type: 'requirement updated', entity: 'REQ-004', actor: 'solution_architect', status: 'done' },
      { at: ago('1d'), event_type: 'snapshot', entity: '101000000040 · IF guard', actor: 'anaplan_builder', status: 'done' },
    ],
    sample_trace: TRACE_040,
  });
}

export function kartaTrace(args = {}) {
  const id = String(args.p_line_item_id || '');
  if (id === '101000000040' || id === '') return ok(TRACE_040);
  if (id === '101000000041') return ok({ ...TRACE_040, line_item: { ...TRACE_040.line_item, id, name: 'Margin % (Ratio)', summary: 'Ratio', applies_to: 'Product | Region' }, formula: "Gross Margin / 'CAL01 Revenue'.Gross Revenue", findings: [], lineage: TRACE_040.lineage.filter((l) => l.from_type !== 'finding').map((l) => ({ ...l, to_id: l.to_id === '101000000040' ? id : l.to_id, to_title: l.to_title.replace('(Sum)', '(Ratio)') })) });
  return fail('not_found', `line item ${id} is not in the Karta demo project (try 101000000040 or 101000000041)`);
}
