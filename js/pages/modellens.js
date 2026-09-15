// Projects › ModelLens (ModelLens.dc.html): score ring, deductions vs caps, runs, disputed findings, LLM layer, import bundle.

import { h, fmt, clear, extLink, safeHref, scoreTone } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { S } from '../store.js';
import { CONFIG } from '../config.js';
import { toast, pill, emptyState, openPanel, sevPill, skeleton, confirmDialog } from '../ui.js';
import { ringGauge, sparkline } from '../charts.js';
import { load, card, agentPill, statePill, skelRows } from './_common.js';

export function render(root, route) {
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_modellens', {}, (d, el, reload) => draw(d, el, reload, route));
  return () => {};
}

function draw(d, host, reload, route) {
  const L = d.latest || {}; const webUrl = safeHref(d.web_url || (S.config && S.config.modellens_web_url) || CONFIG.MODELLENS_WEB_URL);
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': 'ModelLens bundle file', onchange: (e) => { const f = e.target.files?.[0]; if (f) importBundle(f, reload); e.target.value = ''; } });
  const importBtn = h('button.btn.btn-sm', { type: 'button', onclick: () => fileInput.click() }, iconEl('upload'), 'Import bundle');
  const planted = L.planted;
  const hero = h('div.card.glow.hero-row.f13',
    ringGauge(L.score ?? 0, { size: 132, stroke: 10, tone: scoreTone(L.score ?? 0), label: `Latest score ${fmt.num(L.score, 1)} of 100` }),
    h('div.body',
      h('div', h('div.muted.small', `Latest run · ${L.model_name || '—'}${L.at ? ` · ${fmt.date(L.at)}` : ''}`), h('h2', `${L.rating || '—'} · ${fmt.int(L.coverage)}% metadata coverage`)),
      h('div.grid.grid-4.tight',
        h('div.mini-stat', h('div.k', 'Deducting'), h('div.v', fmt.int(L.deducting), h('small', `${fmt.int(L.high)} high`))),
        h('div.mini-stat', h('div.k', 'Context rows'), h('div.v', fmt.int(L.context_rows))),
        h('div.mini-stat', h('div.k', 'Planted defects'), h('div.v', { class: planted && planted.true_caught === planted.true_total ? 'tone-good' : '' }, planted ? `${fmt.int(planted.true_caught)} / ${fmt.int(planted.true_total)}` : '—')),
        h('div.mini-stat', h('div.k', 'Traps left alone'), h('div.v', { class: planted && planted.trap_clean === planted.trap_total ? 'tone-good' : '' }, planted ? `${fmt.int(planted.trap_clean)} / ${fmt.int(planted.trap_total)}` : '—'))),
      h('div.pills',
        webUrl ? h('a.btn.btn-primary.btn-sm', { href: webUrl, target: '_blank', rel: 'noopener noreferrer' }, iconEl('external', 'ic-14'), 'Open in ModelLens Web') : null,
        L.run_id ? h('button.btn.btn-sm', { type: 'button', onclick: () => openRun(L.run_id, L.model_name) }, iconEl('findings'), 'Open latest run') : null,
        importBtn, fileInput)));
  const caps = (L.category_deductions || []);
  const capsCard = card(h('h2', 'Deductions by category'), 'applied / cap', [h('div.capbars', caps.length ? caps.map((c) => h('div.capbar', { class: c.applied >= c.cap ? 'at-cap' : '' }, h('span.name', c.category), h('div.bar.thick', h('i', { style: { width: `${c.cap ? Math.min(100, 100 * c.applied / c.cap) : 0}%` } })), h('span.vals', h('b', fmt.num(c.applied, 1)), ` / ${fmt.num(c.cap, 0)}`))) : emptyState('No run yet', 'Import a bundle or run the desktop app to persist a run.')), h('div.foot-note', 'Score = 100 − Σ min(cap, Σ deductions). Deterministic; the LLM layer never moves it.')], { cls: 'f1' });
  host.append(h('div.row.wrap-md', hero, capsCard));

  const runs = d.runs || [];
  const runsCard = card(h('h2', 'Runs'), 'karta.efficiency_runs · persisted from the desktop app and the web', runs.length ? h('div.tbl-wrap', h('table.tbl', h('thead', h('tr', h('th', 'Model'), h('th.hide-sm', 'Modules / items'), h('th.num', 'Score'), h('th', 'Rating'), h('th.num.hide-sm', 'Deducting'), h('th.hide-sm', 'Reviewer'), h('th', h('span.sr-only', 'Open')))),
    h('tbody', runs.map((r) => h('tr', h('td.wrap', h('b', r.model_name)), h('td.mono-cell.hide-sm', `${fmt.int(r.modules)} / ${fmt.int(r.line_items)}`), h('td.num', h('b', fmt.num(r.score, 1))), h('td', pill(r.rating, `status ${scoreTone(r.score) === 'good' ? 'good' : scoreTone(r.score) === 'warn' ? 'warn' : 'warn'}`)), h('td.num.hide-sm', fmt.int(r.deducting)), h('td.muted.small.hide-sm', r.reviewed ? `reviewed${r.agreement_rate != null ? ` · agree ${fmt.int(r.agreement_rate * 100)}%` : ''}` : 'not reviewed'), h('td.actions', h('button.btn.btn-sm', { type: 'button', onclick: () => openRun(r.run_id, r.model_name) }, 'Open'))))))) : emptyState('No runs persisted', 'Runs appear here once the desktop app or an import writes to karta.efficiency_runs.'), { flush: true });
  runsCard.querySelector('.card-head').style.padding = '14px 16px 6px';
  host.append(runsCard);

  const disputed = d.disputed || [];
  const dispCard = card(h('h2', 'Where the rules were confidently wrong'), pill(`${fmt.int(disputed.length)} disputed`, `status ${disputed.length ? 'bad' : 'good'}`), disputed.length ? h('div.list', disputed.map((x) => h('div.item.stripe-HIGH', h('div.grow', h('div', h('b', x.rule_id), ` ${x.rule} · ${x.module} › ${x.line_item}`), h('div.sub', /^reviewer:/i.test(x.reason || '') ? x.reason : `Reviewer: ${x.reason}`)), pill(`−${fmt.num(x.deduction, 1)}`, 'status neutral nodot mono')))) : emptyState('No disputes', 'The reviewer agreed with every deterministic finding it checked.'), { cls: 'f1' });
  const ll = d.llm_layer || {};
  const llmCard = card(h('h2', 'LLM layer · 7 days'), 'governed · every ID validated', [
    h('div.grid.grid-3.tight', h('div.mini-stat', h('div.k', 'Calls'), h('div.v.lg', fmt.int(ll.calls_7d))), h('div.mini-stat', h('div.k', 'Cost'), h('div.v.lg', fmt.money(ll.cost_7d_usd))), h('div.mini-stat', h('div.k', 'Dropped claims'), h('div.v.lg', fmt.int(ll.dropped_claims_7d)))),
    sparkline(ll.daily_cost || [], { w: 420, h: 44, color: 'var(--bucket-llm)', label: 'Daily LLM-layer cost, 7 days' }),
    ll.endpoint ? h('div.foot-note.trunc', { title: ll.endpoint }, 'endpoint · ', h('span.mono', String(ll.endpoint).replace(/^https?:\/\//, '').replace(/\/webhook\/.*$/, '/webhook/…'))) : null,
  ], { cls: 'f1' });
  host.append(h('div.row.wrap-md', dispCard, llmCard));
  if (route && route.params.get('import')) setTimeout(() => fileInput.click(), 300);
}

async function importBundle(file, reload) {
  if (file.size > 60 * 1024 * 1024) { toast({ title: 'Bundle too large', message: 'Bundles over 60 MB are not supported in the browser.', kind: 'error' }); return; }
  const t = toast({ title: `Reading ${file.name}…`, message: `${fmt.compact(file.size)}B`, duration: 0 });
  try {
    const text = await file.text();
    let json; try { json = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
    if (!json || typeof json !== 'object' || !json.bundle_version) throw new Error('Not a ModelLens bundle: bundle_version is missing.');
    if (!String(json.bundle_version).startsWith('1')) throw new Error(`Unsupported bundle_version ${json.bundle_version} (the importer reads 1.x).`);
    for (const k of ['model', 'score', 'findings', 'items', 'modules']) if (!(k in json)) throw new Error(`Bundle is missing "${k}".`);
    t.update('Importing…', `${json.model?.name || file.name} · ${fmt.int(json.modules.length)} modules · ${fmt.int(json.items.length)} line items · ${fmt.int(json.findings.length)} findings`, 'info');
    const d = await call('iris2_modellens_import_bundle', { p_bundle: json }, { dedupe: false, timeoutMs: 60000 });
    const c = d?.counts || {};
    t.update('Bundle imported', `run ${String(d?.run_id || '').slice(0, 8)} · ${Object.entries(c).map(([k, v]) => `${fmt.int(v)} ${k}`).join(' · ')}`, 'success');
    setTimeout(() => t.remove(), 8000);
    reload();
  } catch (e) { t.update('Import failed', `${e.code ? e.code + ': ' : ''}${e.message || e}`, 'error'); setTimeout(() => t.remove(), 9000); }
}

async function openRun(runId, name) {
  const body = h('div.stack', skelRows(6));
  const panel = openPanel({ kicker: [pill('run', 'kind kind-proposal'), h('span.mono.muted', String(runId).slice(0, 8))], title: name || 'Run', sub: [h('span', 'iris2_modellens_run')], body });
  try {
    const d = await call('iris2_modellens_run', { p_run_id: runId });
    clear(body);
    const r = d.run || {}; const findings = d.findings || []; const mh = d.module_health || []; const rv = d.review; const cmp = d.comparison;
    body.append(h('div.detail-grid', kv('Score', fmt.num(r.score, 1)), kv('Rating', r.rating), kv('Modules / items', `${fmt.int(r.modules)} / ${fmt.int(r.line_items)}`), kv('Deducting', fmt.int(r.deducting)), kv('Reviewed', r.reviewed ? 'yes' : 'no'), kv('At', fmt.date(r.at))));
    if (rv) body.append(h('div.detail-section', h('h3', 'Review (advisory)'), h('div.detail-grid', kv('Model', rv.model), kv('Packets', fmt.int(rv.packets)), kv('Verdicts', fmt.int(rv.verdicts)), kv('Cost', fmt.money(rv.cost_usd)))));
    if (cmp && cmp.buckets) body.append(h('div.detail-section', h('h3', `Comparison · agreement ${fmt.int((cmp.agreement_rate || 0) * 100)}%`), h('div.pills', Object.entries(cmp.buckets).map(([k, v]) => pill(`${k} ${fmt.int(v)}`, `status ${k === 'AGREE' ? 'good' : k === 'DISPUTED' ? 'bad' : k === 'UNVERIFIED' ? 'warn' : 'llm'} nodot`)))));
    body.append(h('div.detail-section', h('h3', `Findings · ${fmt.int(findings.length)}`), findings.length ? h('div.list.tight', findings.slice(0, 40).map((f) => h('div.item', { class: `stripe-${String(f.severity || 'INFO').toUpperCase()}` }, h('div.grow', h('div', h('b', f.rule_id), ` ${f.rule}`), h('div.sub', `${f.module}${f.line_item ? ` › ${f.line_item}` : ''}${f.evidence ? ` · ${f.evidence}` : ''}`)), h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' } }, sevPill(f.severity), h('span.mono.small.muted', f.deduction ? `−${fmt.num(f.deduction, 1)}` : '0'))))) : emptyState('No findings returned', 'The run payload had no findings array.')));
    if (mh.length) body.append(h('div.detail-section', h('h3', 'Module health'), h('div.tbl-wrap', h('table.tbl.compact', h('thead', h('tr', h('th', 'Module'), h('th.num', 'Items'), h('th.num', 'Findings'), h('th', 'Status'))), h('tbody', mh.map((m) => h('tr', h('td', m.module), h('td.num', fmt.int(m.line_items)), h('td.num', fmt.int(m.findings)), h('td', statePill(m.status)))))))));
  } catch (e) { clear(body); body.append(h('div.error-box', `${e.code || 'error'}: ${e.message}`)); }
}
const kv = (k, v) => h('div.kv', h('div.k', k), h('div.v', v == null ? '—' : v));
