// Shape adapters between the live `iris2_*` payloads and what the pages read.
// Applied to every response (live and preview) so both paths render identically. Idempotent: every
// adapter only fills fields that are missing and never removes what the backend sent.

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const secondsToCadence = (s) => {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return String(s ?? '');
  if (n < 3600) return `every ${Math.round(n / 60)} min`;
  if (n < 86400) return `every ${Math.round(n / 3600)} h`;
  return `every ${Math.round(n / 86400)} d`;
};

function trace(t) {
  if (!isObj(t)) return t;
  if (isObj(t.formula)) { t.formula_meta = t.formula; t.formula = t.formula.text || ''; }
  const li = t.line_item;
  if (isObj(li)) {
    if (li.cells == null && li.cell_count != null) li.cells = li.cell_count;
    if (li.module_id == null && li.module_anaplan_id != null) li.module_id = li.module_anaplan_id;
    if (li.role == null) li.role = '';
    if (li.notes == null) li.notes = '';
  }
  const deps = t.dependencies;
  if (isObj(deps)) {
    for (const dir of ['in', 'out']) {
      deps[dir] = (deps[dir] || []).map((x) => ({
        ...x,
        title: x.title ?? (x.module ? `${x.module} › ${x.name ?? x.anaplan_id ?? x.id}` : (x.name ?? x.id)),
        edge_type: x.edge_type ?? (x.depth != null ? `depth ${x.depth}` : 'reference'),
      }));
    }
  }
  t.snapshots = (t.snapshots || []).map((s) => ({
    ...s,
    at: s.at ?? s.captured_at,
    by: s.by ?? 'ModelLens extractor',
    change: s.change ?? `snapshot ${s.run_id ?? String(s.id || '').slice(0, 8)} · ${s.module_count ?? '—'} modules · ${s.line_item_count ?? '—'} line items · ${s.dependency_count ?? '—'} dependencies`,
  }));
  t.findings = (t.findings || []).map((f) => ({ ...f, note: f.note ?? f.evidence ?? '', status: f.status ?? (f.band ? String(f.band).toLowerCase() : 'open') }));
  t.lineage = (t.lineage || []).map((e) => ({ ...e, from_title: e.from_title ?? e.from_id, to_title: e.to_title ?? e.to_id }));
  t.evidence = (t.evidence || []).map((e) => ({ ...e, source_type: e.source_type ?? 'source', at: e.at ?? null }));
  return t;
}

const NORMALIZERS = {
  iris2_mission(d) {
    if (!isObj(d)) return d;
    d.feed_health = (d.feed_health || []).map((f) => ({ ...f, expected: typeof f.expected === 'number' ? secondsToCadence(f.expected) : f.expected }));
    d.proposals = (d.proposals || []).map((p) => ({ ...p, steps: Array.isArray(p.steps) ? p.steps : [], cost_usd: p.cost_usd == null ? null : Number(p.cost_usd), hot: p.hot ?? (p.risk === 'high' || (Number(p.cost_usd) || 0) >= 1) }));
    if (isObj(d.digest_24h) && !Array.isArray(d.digest_24h.hourly_cost)) d.digest_24h.hourly_cost = [];
    return d;
  },
  iris2_decisions(d) {
    if (!isObj(d)) return d;
    d.items = (d.items || []).map((it) => {
      const det = isObj(it.detail) ? it.detail : {};
      const hot = it.hot ?? (it.kind === 'proposal' && (det.risk === 'high' || (Number(det.cost_usd) || 0) >= 1 || it.severity === 'high'));
      return { ...it, detail: det, hot, severity: it.severity || (hot ? 'high' : 'medium') };
    });
    return d;
  },
  iris2_stream(d) {
    if (!isObj(d)) return d;
    d.events = (d.events || []).map((e) => ({ ...e, id: e.id == null ? `${e.at}-${e.agent}` : String(e.id), kind: e.kind || (e.phase === 'error' ? 'error' : 'info') }));
    return d;
  },
  iris2_projects(d) {
    if (!isObj(d)) return d;
    d.projects = (d.projects || []).map((p) => ({ ...p, stack: p.stack || [], use_cases: p.use_cases || [], components: p.components || [], metrics: p.metrics || [] }));
    return d;
  },
  iris2_modellens(d) {
    if (!isObj(d)) return d;
    if (isObj(d.latest) && !Array.isArray(d.latest.category_deductions) && isObj(d.latest.category_deductions)) {
      d.latest.category_deductions = Object.entries(d.latest.category_deductions).map(([category, applied]) => ({ category, applied, cap: null }));
    }
    if (isObj(d.llm_layer) && !Array.isArray(d.llm_layer.daily_cost)) d.llm_layer.daily_cost = [];
    return d;
  },
  iris2_modellens_run(d) {
    if (!isObj(d)) return d;
    const r = d.run || {};
    // the page reads modules / line_items / deducting / reviewed / at on the run row
    if (r.modules == null && d.snapshot) r.modules = d.snapshot.module_count;
    if (r.line_items == null && d.snapshot) r.line_items = d.snapshot.line_item_count;
    if (r.deducting == null && Array.isArray(d.findings)) r.deducting = d.findings.filter((f) => Number(f.deduction) > 0).length;
    if (r.at == null) r.at = r.run_at || r.created_at;
    if (r.reviewed == null) r.reviewed = !!d.review;
    d.run = r;
    // review comes nested: {review:{...meta}, verdicts[], llm_findings[], bucket_counts, verdict_counts}
    if (isObj(d.review) && isObj(d.review.review)) {
      const meta = d.review.review;
      const verdicts = d.review.verdicts || [];
      const total = Object.values(d.review.bucket_counts || {}).reduce((a, b) => a + Number(b || 0), 0);
      const agree = Number((d.review.bucket_counts || {}).AGREE || 0);
      const disputed = Number((d.review.bucket_counts || {}).DISPUTED || 0);
      d.review_detail = d.review;
      d.review = { ...meta, verdicts: verdicts.length || meta.verdicts, llm_findings: d.review.llm_findings || [] };
      if (!d.comparison) d.comparison = { buckets: d.review.bucket_counts || d.review_detail.bucket_counts || {}, agreement_rate: meta.agreement_pct != null ? meta.agreement_pct / 100 : (agree + disputed ? agree / (agree + disputed) : null), total };
    }
    d.module_health = (d.module_health || []).map((m) => ({ ...m, module: m.module ?? m.name, findings: m.findings ?? ((m.dead || 0) + (m.unconsumed || 0) + (m.unreferenced || 0)) }));
    return d;
  },
  iris2_karta(d) {
    if (!isObj(d)) return d;
    if (d.sample_trace) trace(d.sample_trace);
    d.members = (d.members || []).map((m) => ({ ...m, user: m.user ?? m.email ?? '—' }));
    d.proposals = (d.proposals || []).map((p) => ({ ...p, submitted_by: p.submitted_by ?? '—', role: p.role ?? '' }));
    return d;
  },
  iris2_karta_trace: trace,
  iris2_estate(d) {
    if (!isObj(d)) return d;
    if (isObj(d.radar)) d.radar.events = (d.radar.events || []).map((e) => ({ ...e, fail_reasons: e.fail_reasons || [], property_type: e.property_type || 'unknown type', event_date: e.event_date || e.filed_date || null }));
    if (isObj(d.pipeline)) d.pipeline.listings = (d.pipeline.listings || []).map((l) => ({ ...l, fail_reasons: l.fail_reasons || [] }));
    if (isObj(d.deals) && Array.isArray(d.deals.deals)) d.deals.deals = d.deals.deals.map((x) => ({ ...x, units: x.units ?? 0 }));
    return d;
  },
  iris2_estate_deal(d) {
    if (!isObj(d)) return d;
    const r = d.result;
    if (!isObj(r)) return d;
    for (const key of ['stabilized', 'current']) {
      const s = r[key];
      if (!isObj(s)) continue;
      if (s.cash_flow_monthly == null) s.cash_flow_monthly = s.monthly_cash_flow;
      if (s.cap == null) s.cap = s.cap_rate;
      if (s.coc == null) s.coc = s.cash_on_cash;
      if (s.gross_rent_monthly == null && s.gross_potential_rent != null) s.gross_rent_monthly = s.gross_potential_rent / 12;
    }
    const fin = r.financing;
    if (isObj(fin)) {
      if (fin.pitia_monthly == null) fin.pitia_monthly = fin.monthly_pitia;
      if (fin.rate == null) fin.rate = fin.interest_rate;
      if (fin.term_years == null) fin.term_years = fin.amortization_years;
    }
    const cash = r.cash;
    if (isObj(cash)) {
      if (cash.total == null) cash.total = cash.cash_required;
      if (cash.down == null) cash.down = cash.down_payment;
      if (cash.closing == null) cash.closing = cash.closing_costs;
    }
    if (isObj(r.max_offer)) { r.max_offer_detail = r.max_offer; r.max_offer = r.max_offer.recommended ?? r.max_offer.by_target_dscr ?? null; }
    r.stress = (r.stress || []).map((s) => ({ ...s, scenario: s.scenario ?? s.label, cash_flow_monthly: s.cash_flow_monthly ?? s.monthly_cash_flow }));
    if (isObj(r.fha_prescreen) && r.fha_prescreen.eligible == null) r.fha_prescreen.eligible = !!r.fha_prescreen.applies;
    d.evidence = (d.evidence || []).map((e) => ({ ...e, value: typeof e.value === 'string' && e.value.trim() !== '' && !Number.isNaN(Number(e.value)) ? Number(e.value) : e.value }));
    d.diligence = (d.diligence || []).map((x) => ({ ...x, status: x.status || 'open' }));
    return d;
  },
  iris2_brain(d) {
    if (!isObj(d)) return d;
    d.claims = (d.claims || []).map((c) => ({ ...c, at: c.at ?? c.created_at, agent: c.agent ?? c.agent_slug, sources: c.sources || [] }));
    d.recent_facts = (d.recent_facts || []).map((f) => ({ ...f, by: f.by ?? f.org ?? '' }));
    d.goals = (d.goals || []).map((g) => ({ ...g, updates: g.updates || [] }));
    return d;
  },
  iris2_governance(d) {
    if (!isObj(d)) return d;
    d.tokens = (d.tokens || []).map((t) => ({ ...t, scopes: t.scopes || [] }));
    d.security = (d.security || []).map((s) => ({ ...s, status: s.status || 'open' }));
    if (isObj(d.n8n)) d.n8n.failing = d.n8n.failing || [];
    return d;
  },
  iris2_money(d) {
    if (!isObj(d)) return d;
    if (!d.summary && d.fin_summary) d.summary = d.fin_summary;
    if (!d.insights && d.money_insights) d.insights = d.money_insights;
    return d;
  },
};

export function normalize(fn, data) {
  const f = NORMALIZERS[fn];
  if (!f) return data;
  try { return f(data) ?? data; } catch (e) { console.warn(`[normalize] ${fn}:`, e); return data; }
}
