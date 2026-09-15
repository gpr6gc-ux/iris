// Projects › Karta Memory (Karta.dc.html): counts, trace (requirement → decision → line item), write gate, proposal queue,
// change events. "Trace another line item" calls iris2_karta_trace.

import { h, fmt, clear } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { toast, pill, emptyState, sevPill, skeleton, openPanel } from '../ui.js';
import { load, card, kpi, statePill, skelRows } from './_common.js';

export function render(root) {
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_karta', {}, draw);
  return () => {};
}

function draw(d, host) {
  const c = d.counts || {}; const proj = (d.projects || []).find((p) => p.id === d.selected_project_id) || (d.projects || [])[0] || {};
  host.append(h('div.kpis',
    kpi('layers', 'Clients · projects', `${fmt.int(c.clients)} · ${fmt.int(c.projects)}`, `${proj.client || '—'} · ${proj.name || '—'}`),
    kpi('db', 'Model objects', `${fmt.int(c.modules)} · ${fmt.int(c.line_items)}`, `modules · line items · ${fmt.int(c.formulas)} formulas`),
    kpi('link', 'Lineage edges', fmt.int(c.lineage_edges), 'requirement → decision → line item'),
    kpi('inbox', 'Proposals waiting', fmt.int(c.proposals_pending), 'from an Anaplan builder · needs an SA', c.proposals_pending ? 'warn' : '')));

  // ---- trace
  const traceBody = h('div.stack', { style: { gap: '12px' } });
  const traceTitle = h('h2', { style: { whiteSpace: 'normal' } }, 'Trace');
  const input = h('input.input', { type: 'text', placeholder: 'line item id · e.g. 101000000040', 'aria-label': 'Line item id to trace', style: { width: '150px' } });
  const go = h('button.btn.btn-sm', { type: 'button', onclick: () => trace(input.value.trim()) }, iconEl('route'), 'Trace');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') trace(input.value.trim()); });
  const traceCard = card(traceTitle, h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, input, go), traceBody, { cls: 'f14' });
  const paintTrace = (t) => {
    clear(traceBody);
    if (!t || !t.line_item) { traceBody.append(emptyState('No trace', 'Enter a line item id from the Karta demo project.')); return; }
    const li = t.line_item;
    traceTitle.textContent = `Trace · ${li.module} › ${li.name}`;
    const lineage = t.lineage || [];
    const req = lineage.find((l) => l.from_type === 'requirement'); const dec = lineage.find((l) => l.from_type === 'decision') || (req ? { from_id: req.to_id, from_title: req.to_title } : null);
    const ev = (t.evidence || [])[0];
    const finding = (t.findings || [])[0];
    traceBody.append(h('div.trace-chain',
      h('div.item.col.stripe-GOOD', pill(req ? `Requirement ${req.from_id}` : 'Requirement', 'status good nodot'), h('div.title', req ? req.from_title : 'No requirement linked'), h('div.sub', ev ? `${ev.source_id} · ${fmt.day(ev.at)}` : 'no evidence')),
      h('div.arrow', iconEl('arrow', 'ic-14')),
      h('div.item.col.stripe-LLM', pill(dec ? `Decision ${dec.from_id}` : 'Decision', 'status llm nodot'), h('div.title', dec ? dec.from_title : 'No decision linked'), h('div.sub', ev ? `decided by Solution Architect · evidence: ${ev.source_type.replace('_', ' ')}` : '—')),
      h('div.arrow', iconEl('arrow', 'ic-14')),
      h('div.item.col', { class: finding ? `stripe-${String(finding.severity || 'INFO').toUpperCase()}` : 'stripe-PRIMARY' }, pill('Line item', 'status primary nodot'), h('div.title', `${li.module} › ${li.name}`), h('div.sub', `id ${li.id}${finding ? ` · finding ${finding.rule_id} · ${finding.note || finding.rule}` : ` · ${li.applies_to || ''} · summary ${li.summary || '—'}`}`))));
    traceBody.append(h('div.code', t.formula || '(no formula)', h('span.muted', `   — applies to ${li.applies_to || '—'} · ${li.time_scale || '—'} · summary ${li.summary || '—'}`)));
    const deps = t.dependencies || { in: [], out: [] };
    traceBody.append(h('div.pills',
      h('button.btn.btn-sm', { type: 'button', onclick: () => openList(`Dependencies · ${li.module} › ${li.name}`, [...(deps.in || []).map((x) => ({ ...x, dir: 'in' })), ...(deps.out || []).map((x) => ({ ...x, dir: 'out' }))].map((x) => h('div.item.plain', pill(x.dir, `status ${x.dir === 'in' ? 'good' : 'primary'} nodot`), h('div.grow', h('div', x.title || x.id), h('div.sub', `${x.edge_type || ''} · ${x.id}`))))) }, `Dependencies · ${(deps.in || []).length} in · ${(deps.out || []).length} out`),
      h('button.btn.btn-sm', { type: 'button', onclick: () => openList('Meeting evidence', (t.evidence || []).map((e) => h('div.item.plain.col', h('div', `“${e.quote}”`), h('div.sub', `${e.source_type.replace('_', ' ')} · ${e.source_id} · ${fmt.date(e.at)}`)))) }, `Meeting evidence · ${(t.evidence || []).length}`),
      h('button.btn.btn-sm', { type: 'button', onclick: () => openList('Change history', (t.snapshots || []).map((s) => h('div.item.plain', h('span.mono.muted.small', fmt.date(s.at)), h('div.grow', h('div', s.change), h('div.sub', `by ${s.by}`))))) }, `Change history · ${(t.snapshots || []).length} snapshot${(t.snapshots || []).length === 1 ? '' : 's'}`),
      (t.findings || []).length ? h('button.btn.btn-sm', { type: 'button', onclick: () => openList('Findings on this line item', t.findings.map((f) => h('div.item', { class: `stripe-${String(f.severity || 'INFO').toUpperCase()}` }, h('div.grow', h('div', h('b', f.rule_id), ` ${f.rule}`), h('div.sub', `${f.status}${f.note ? ` · ${f.note}` : ''}`)), sevPill(f.severity), h('span.mono.small.muted', `−${fmt.num(f.deduction, 1)}`)))) }, `Findings · ${t.findings.length}`) : null));
  };
  async function trace(id) {
    if (!id) return;
    clear(traceBody); traceBody.append(skelRows(3, 'h-80'));
    try { paintTrace(await call('iris2_karta_trace', { p_line_item_id: id })); }
    catch (e) { clear(traceBody); traceBody.append(h('div.error-box', `${e.code || 'error'}: ${e.message}`)); }
  }
  paintTrace(d.sample_trace);
  if (d.sample_trace && d.sample_trace.line_item) input.value = d.sample_trace.line_item.id;

  // ---- write gate + proposals
  const members = d.members || [];
  const gate = card(h('h2', 'Write gate'), pill('RLS enforced', 'status primary nodot'), h('div.list.tight', members.length ? members.map((m) => h('div.item.gate-row', pill(m.role, `status ${m.can_write ? 'good' : 'info'}`), h('span.who', m.user), h('span.perm', m.can_write ? 'write' : m.role === 'anaplan_builder' ? 'propose only' : 'read'))) : emptyState('No members', 'karta.project_members is empty.')), { glow: true });
  const props = d.proposals || [];
  const propCard = card(h('h2', 'Proposal queue'), 'builders propose, SAs approve', props.length ? h('div.list', props.map((p) => h('div.item.stripe-MEDIUM', h('div.grow', h('div.title', `${p.id} · ${p.title}`), h('div.sub', `by ${p.submitted_by} (${p.role}) · ${fmt.date(p.created_at)}`)), statePill(p.status), h('button.btn.btn-sm.btn-ghost', { type: 'button', title: 'Karta proposals are approved by a Solution Architect inside Karta; the 5.0 RPC contract has no write for them yet.', onclick: () => toast({ title: 'Approve in Karta', message: 'Karta proposals are decided by a Solution Architect in Karta. A karta_proposal_decide RPC is not in the 5.0 contract.', kind: 'info' }) }, iconEl('info'))))) : emptyState('Queue empty', 'Builder proposals appear here for an SA decision.'));
  host.append(h('div.row.wrap-md', traceCard, h('div.col.f1', gate, propCard)));

  // ---- change events
  const evs = d.change_events || [];
  const evCard = card(h('h2', 'Change events'), `karta.change_events · ${fmt.int(evs.length)} · newest first`, evs.length ? h('div.tbl-wrap', h('table.tbl', h('thead', h('tr', h('th', 'At'), h('th', 'Event'), h('th', 'Entity'), h('th.hide-sm', 'Actor'), h('th', 'Status'))), h('tbody', evs.map((e) => h('tr', h('td.mono-cell', fmt.time(e.at)), h('td', e.event_type), h('td.wrap', e.entity), h('td.muted.hide-sm', e.actor), h('td', statePill(e.status))))))) : emptyState('No change events', 'Every write to the Karta project records one.'), { flush: true });
  evCard.querySelector('.card-head').style.padding = '14px 16px 6px';
  host.append(evCard);
}

function openList(title, rows) {
  openPanel({ title, body: rows.length ? h('div.list.tight', rows) : emptyState('Nothing here', '—') });
}
