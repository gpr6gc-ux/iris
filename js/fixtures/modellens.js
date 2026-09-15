// iris2_modellens(), iris2_modellens_run(p_run_id), iris2_modellens_import_bundle(p_bundle) — numbers from web/data/index.json.
import { ago, ok, fail, STATE } from './_state.js';

const RUNS = [
  { run_id: 'a1d4f0c2-6b1e-4c6a-9e51-2f3a9c8b7d01', model_name: 'Northwind Group — Integrated Financial Plan', modules: 184, line_items: 2019, score: 29.0, rating: 'High Review Priority', deducting: 68, reviewed: true, agreement_rate: 0.80, at: ago('5h') },
  { run_id: 'b2e5a1d3-7c2f-4d7b-8f62-3a4b0d9c8e02', model_name: 'Meridian Health — Workforce Planning', modules: 188, line_items: 1968, score: 36.5, rating: 'High Review Priority', deducting: 47, reviewed: false, agreement_rate: null, at: ago('9h') },
  { run_id: 'c3f6b2e4-8d30-4e8c-9073-4b5c1e0d9f03', model_name: 'Atlas Consumer Goods — Supply Chain Planning', modules: 189, line_items: 1963, score: 34.5, rating: 'High Review Priority', deducting: 48, reviewed: false, agreement_rate: null, at: ago('1d') },
  { run_id: 'd4a7c3f5-9e41-4f9d-a184-5c6d2f1e0a04', model_name: 'FP&A — small planted fixture', modules: 13, line_items: 51, score: 47.0, rating: 'High Review Priority', deducting: 39, reviewed: true, agreement_rate: 0.80, at: ago('4.7h') },
];

export function modellens() {
  const runs = [...STATE.imports, ...RUNS];
  return ok({
    latest: {
      run_id: RUNS[0].run_id, model_name: RUNS[0].model_name, score: 29.0, rating: 'High Review Priority', coverage: 100, confidence: 81, deducting: 68, high: 9, context_rows: 1344,
      planted: { true_caught: 48, true_total: 48, trap_clean: 39, trap_total: 39 },
      category_deductions: [
        { category: 'Formula Quality', applied: 27.5, cap: 30 }, { category: 'Potentially Unused', applied: 20.0, cap: 20 }, { category: 'Architecture', applied: 8.0, cap: 20 },
        { category: 'Model Size', applied: 11.5, cap: 15 }, { category: 'Maintainability', applied: 4.0, cap: 15 },
      ],
      at: RUNS[0].at,
    },
    runs,
    disputed: [
      { run_id: RUNS[0].run_id, rule_id: 'ML-DIM-001', rule: 'Subsidiary view', module: 'CAL01 Revenue', line_item: 'Gross Revenue', deduction: 0.5, reason: 'Reviewer: core calculation with 14 consumers; the Customer dimension is intentional and documented in REQ-004.' },
      { run_id: RUNS[0].run_id, rule_id: 'ML-HYG-003', rule: 'Calculation with no captured consumer', module: 'CAL02 Cost & Margin', line_item: 'Margin % (Sum)', deduction: 0.5, reason: 'Reviewer: consumed by a UX page; model metadata cannot see UX consumers, so the finding is a false positive.' },
    ],
    llm_layer: { calls_7d: 41, cost_7d_usd: 2.31, dropped_claims_7d: 2, daily_cost: [0.18, 0.31, 0.22, 0.48, 0.36, 0.55, 0.21], endpoint: 'https://gragone.app.n8n.cloud/webhook/modellens-llm-layer-9f3c1a7e52bd' },
    web_url: 'https://modellens.netlify.app',
  });
}

const FINDINGS_SMALL = [
  { severity: 'HIGH', category: 'Potentially Unused', rule_id: 'ML-HYG-001', rule: 'Probable dead calculated line item', module: 'OLD01 Archive', line_item: 'Old Margin Bridge', deduction: 4.0, confidence: 85, band: 'CRITICAL', evidence: "Module role 'archive'; formula present; 0 downstream references; no operational-metadata match." },
  { severity: 'HIGH', category: 'Formula Quality', rule_id: 'ML-SUM-002', rule: 'Sum summary on a ratio or percentage', module: 'CAL02 Cost & Margin', line_item: 'Margin % (Sum)', deduction: 2.5, confidence: 90, band: 'HIGH', evidence: 'Ratio-shaped formula with summary method Sum; aggregates will be wrong.' },
  { severity: 'HIGH', category: 'Architecture', rule_id: 'ML-DIM-001', rule: 'Subsidiary view', module: 'CAL02 Cost & Margin', line_item: 'COGS', deduction: 3.0, confidence: 78, band: 'HIGH', evidence: 'Applies to Product | Region | Customer while the module is Product | Region.' },
  { severity: 'MEDIUM', category: 'Formula Quality', rule_id: 'ML-RED-001', rule: 'Duplicate exact formula (same context)', module: 'CAL03 Allocation', line_item: 'Allocated Overhead (copy)', deduction: 2.0, confidence: 88, band: 'MEDIUM', evidence: 'Identical formula text and dimensions to CAL03 Allocation › Allocated Overhead.' },
  { severity: 'MEDIUM', category: 'Maintainability', rule_id: 'ML-NAM-001', rule: 'Default or unnamed module', module: 'Module 1', line_item: null, deduction: 1.0, confidence: 95, band: 'MEDIUM', evidence: 'Module keeps the default name.' },
  { severity: 'MEDIUM', category: 'Formula Quality', rule_id: 'ML-TYP-001', rule: 'Text used as Boolean flag', module: 'INP02 Volume Inputs', line_item: 'Is Active', deduction: 1.5, confidence: 82, band: 'MEDIUM', evidence: "Format Text; values are 'Yes'/'No'; compared in 3 formulas." },
  { severity: 'LOW', category: 'Potentially Unused', rule_id: 'ML-HYG-003', rule: 'Calculation with no captured consumer', module: 'CAL02 Cost & Margin', line_item: 'Margin % (Sum)', deduction: 0.5, confidence: 60, band: 'LOW', evidence: '0 downstream references; may be consumed by a UX page.' },
  { severity: 'LOW', category: 'Model Size', rule_id: 'ML-SIZ-002', rule: 'Large line item with time summary', module: 'CAL01 Revenue', line_item: 'FY25 Baseline Revenue', deduction: 0.5, confidence: 70, band: 'LOW', evidence: '288,000 cells with summary on Time.' },
];

export function modellensRun(args = {}) {
  const run = [...STATE.imports, ...RUNS].find((r) => r.run_id === args.p_run_id);
  if (!run) return fail('not_found', `run ${args.p_run_id} not found`);
  const small = run.modules <= 20;
  const scale = small ? 1 : Math.round(run.line_items / 51);
  return ok({
    run,
    findings: FINDINGS_SMALL.map((f, i) => ({ ...f, id: `${run.run_id.slice(0, 8)}-${i + 1}`, module: small ? f.module : f.module.replace(/^(\w+)/, (m) => m), deduction: small ? f.deduction : Math.min(f.deduction * 1.5, 6) })),
    module_health: [
      { module: 'CAL02 Cost & Margin', role: 'calculation', line_items: 4 * scale, findings: 15 * (small ? 1 : 3), high: 1, status: 'Large Module' },
      { module: 'CAL03 Allocation', role: 'calculation', line_items: 13 * scale, findings: 25 * (small ? 1 : 2), high: 2, status: 'Review' },
      { module: 'CAL01 Revenue', role: 'calculation', line_items: 10 * scale, findings: 23 * (small ? 1 : 2), high: 1, status: 'Review' },
      { module: 'OLD01 Archive', role: 'archive', line_items: 2 * scale, findings: 4, high: 1, status: 'Archive candidate' },
      { module: 'OUT01 Exec Dashboard', role: 'output', line_items: 4 * scale, findings: 1, high: 0, status: 'Healthy' },
    ],
    review: run.reviewed ? { model: 'claude-sonnet-4-5', prompt_version: 'r7', packets: small ? 4 : 13, verdicts: small ? 61 : 284, agree: small ? 49 : 227, disputed: small ? 2 : 2, unverified: small ? 10 : 55, cost_usd: small ? 0.31 : 0.94, finished_at: run.at } : null,
    comparison: run.reviewed ? { agreement_rate: run.agreement_rate, buckets: { AGREE: small ? 49 : 227, DISPUTED: 2, UNVERIFIED: small ? 10 : 55, 'LLM-ONLY': small ? 3 : 11 } } : null,
  });
}

export function modellensImportBundle(args = {}) {
  const b = args.p_bundle;
  if (!b || typeof b !== 'object') return fail('invalid', 'p_bundle must be a ModelLens web bundle object');
  if (!String(b.bundle_version || '').startsWith('1')) return fail('invalid', `unsupported bundle_version ${b.bundle_version || '(missing)'} — this importer reads 1.x`);
  const run_id = `imp-${Math.random().toString(16).slice(2, 10)}-${Date.now().toString(16)}`;
  const modules = Array.isArray(b.modules) ? b.modules.length : 0; const line_items = Array.isArray(b.items) ? b.items.length : 0; const findings = Array.isArray(b.findings) ? b.findings.length : 0;
  STATE.imports.unshift({ run_id, model_name: b.model?.name || 'Imported bundle', modules, line_items, score: Number(b.score?.score) || 0, rating: b.score?.rating || '—', deducting: findings, reviewed: !!b.review, agreement_rate: null, at: new Date().toISOString() });
  return ok({ run_id, counts: { models: 1, modules, line_items, efficiency_runs: 1, efficiency_findings: findings, llm_reviews: b.review ? 1 : 0, verdicts: b.review?.verdicts?.length || 0 } });
}
