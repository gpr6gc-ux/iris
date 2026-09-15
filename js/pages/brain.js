// Brain (Brain.dc.html): review deck (accept / keep / dismiss, selection + bulk), ask the brain, mission goals, recent facts.

import { h, fmt, clear, modKey, truncate } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { setParams } from '../router.js';
import { toast, pill, emptyState, confirmDialog, promptDialog, segmented, skeleton } from '../ui.js';
import { load, card, agentPill, srcLink, skelRows } from './_common.js';

export function render(root, route) {
  const host = h('div.stack');
  root.append(host);
  const state = { kind: route.params.get('kind') || 'all', selected: new Set() };
  draw(host, state);
  return () => {};
}

function draw(host, state) {
  load(host, 'iris2_brain', { p_kind: state.kind, p_limit: 200 }, (d, el, reload) => {
    const claims = d.claims || []; const byKind = d.by_kind || {}; const total = d.total ?? claims.length;
    const kinds = [{ key: 'all', label: 'All', count: total }, ...Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), count: v }))];
    const seg = segmented(kinds, state.kind, (k) => { state.kind = k; state.selected.clear(); setParams((p) => { if (k === 'all') p.delete('kind'); else p.set('kind', k); }); draw(host, state); }, { label: 'Claim kind' });
    const bulkBtn = h('button.btn.btn-sm', { type: 'button' });
    // selection only — "accept everything shown" turned 187 unread scout claims into facts on 2026-09-05 (P0-03)
    const paintBulk = () => { const n = state.selected.size; clear(bulkBtn); bulkBtn.append(iconEl('check'), n ? `Accept ${n} selected${n > BULK_MAX ? ` (max ${BULK_MAX})` : ''}` : 'Select claims to accept'); bulkBtn.disabled = !n || n > BULK_MAX; bulkBtn.title = n ? '' : 'Tick the claims you have read; each accepted claim becomes a fact agents will cite.'; };
    bulkBtn.addEventListener('click', () => bulk([...state.selected], 'accept', reload, [...state.selected].map((id) => (claims.find((c) => c.id === id) || {}).statement || id)));
    paintBulk();
    const list = h('div.list');
    if (!claims.length) list.append(emptyState('Deck is clear', 'Scouts file claims continuously; new ones appear here for accept / keep / dismiss.'));
    for (const c of claims) list.append(claimRow(c, state, paintBulk, reload));
    const deck = card(h('h2', 'Review deck'), bulkBtn, [h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, seg, h('span.small.muted', `${fmt.int(total)} open claim${total === 1 ? '' : 's'} · accept → fact · keep → later · dismiss → hidden`)), list], { cls: 'f14' });

    // ask
    const q = h('input.input.lg', { type: 'text', placeholder: 'What did we decide about the Deal Sheet pricing?', 'aria-label': 'Ask the brain' });
    const askBtn = h('button.btn.btn-primary', { type: 'button' }, iconEl('search'), 'Ask');
    const hits = h('div.list.tight');
    const ask = async () => {
      const query = q.value.trim(); if (!query) { q.focus(); return; }
      clear(hits); hits.append(skelRows(3, 'h-40')); askBtn.disabled = true;
      try {
        const r = await call('iris2_brain_ask', { p_query: query, p_limit: 8 }, { dedupe: false });
        const hs = r.hits || r.results || [];
        clear(hits);
        if (!hs.length) hits.append(emptyState('No matching memory', 'Try different words — retrieval is hybrid (lexical + vector) over memory.facts and sources.'));
        for (const x of hs) hits.append(h('div.item.hit.plain', h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', width: '100%' } }, h('b', { style: { flex: 1 } }, x.statement), h('span.score', `score ${fmt.num(x.score, 2)}`)), x.detail ? h('div.sub', x.detail) : null, (x.sources || []).length ? h('div.source-list', x.sources.map((s) => srcLink(s.uri, s.title))) : null));
      } catch (e) { clear(hits); hits.append(h('div.error-box', `${e.code || 'error'}: ${e.message}`)); }
      finally { askBtn.disabled = false; }
    };
    askBtn.addEventListener('click', ask);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) { e.preventDefault(); ask(); } });
    const askCard = card(h('h2', 'Ask the brain'), 'hybrid retrieval · citations', [h('div.ask-box', h('div.row', { style: { alignItems: 'center' } }, q, askBtn), hits), h('div.foot-note', 'Answers cite memory.facts and sources; nothing is written back without your decision.')]);

    // goals
    const goals = d.goals || [];
    const goalsCard = card(h('h2', 'Mission goals'), `${fmt.int(goals.filter((g) => g.status === 'active').length)} active`, goals.length ? h('div.list.tight', goals.map((g) => h('div.item.goal', h('div.top', h('b', g.title), h('span.when', g.horizon || '')), h('div.bar', h('i', { style: { width: `${g.progress_pct ?? 0}%` } })), g.next_milestone ? h('div.sub', `next: ${g.next_milestone}`) : null))) : emptyState('No goals', 'Goals live in brain.goals.'));
    const facts = d.recent_facts || [];
    const factsCard = facts.length ? card(h('h2', 'Latest facts'), 'accepted into memory', h('div.list.tight', facts.map((f) => h('div.item.plain', h('div.grow', h('div', f.statement), h('div.sub', `${f.by || ''} · ${fmt.date(f.at)}`)))))) : null;
    el.append(h('div.row.wrap-md', deck, h('div.col.f1', askCard, goalsCard, factsCard)));
  });
}

function claimRow(c, state, paintBulk, reload) {
  const check = h('input.check', { type: 'checkbox', 'aria-label': `Select claim ${truncate(c.statement, 40)}`, onchange: (e) => { if (e.target.checked) state.selected.add(c.id); else state.selected.delete(c.id); paintBulk(); } });
  if (state.selected.has(c.id)) check.checked = true;
  const row = h('div.item.claim.stripe-GOOD', check,
    h('div.grow', h('div.meta', pill(c.kind, 'status info nodot'), h('span', `${c.agent} · conf ${fmt.num(c.confidence, 2)}`), c.at ? h('span', `· ${fmt.ago(c.at)}`) : null), h('div.stmt', c.statement), c.detail ? h('div.sub', c.detail) : null, h('div.src', (c.sources || []).length ? [`source: ${truncate((c.sources[0].title || c.sources[0].uri || ''), 48)} · ${c.sources.length} source${c.sources.length === 1 ? '' : 's'}`] : 'no sources')),
    h('div.actions',
      h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: () => decide(c, 'accept', reload, row) }, 'Accept'),
      h('button.btn.btn-sm', { type: 'button', onclick: () => decide(c, 'keep', reload, row) }, 'Keep'),
      h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: async () => { const n = await promptDialog({ title: 'Dismiss claim', message: c.statement, label: 'Why (optional)', confirmText: 'Dismiss', danger: true }); if (n !== null) decide(c, 'dismiss', reload, row, n); } }, 'Dismiss')));
  return row;
}
async function decide(c, decision, reload, row, note = '') {
  row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    const d = await call('iris2_decide', { p_kind: 'claim', p_id: c.id, p_decision: decision, p_note: note }, { dedupe: false });
    row.classList.add('leaving'); setTimeout(() => row.remove(), 260);
    toast({ title: `Claim ${d?.status || decision}`, message: truncate(c.statement, 90), kind: 'success' });
    setTimeout(reload, 400);
  } catch (e) { row.querySelectorAll('button').forEach((b) => { b.disabled = false; }); toast({ title: `Could not ${decision}`, message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); if (e.code === 'conflict' || e.code === 'not_found') reload(); }
}
const BULK_MAX = 25;
async function bulk(ids, decision, reload, titles = []) {
  if (!ids.length) return;
  if (ids.length > BULK_MAX) { toast({ title: `At most ${BULK_MAX} claims per bulk decision`, message: 'Decide in batches you have actually read.', kind: 'warn' }); return; }
  const listEl = titles.length ? h('ul', { style: { margin: '8px 0 0', paddingLeft: '18px', maxHeight: '220px', overflow: 'auto' } }, titles.map((t) => h('li', { style: { fontSize: '12px', margin: '2px 0' } }, truncate(String(t), 110)))) : null;
  const ok = await confirmDialog({ title: `Accept ${ids.length} claim${ids.length === 1 ? '' : 's'}?`, message: h('div', h('div', 'Accepted claims become facts agents cite from now on, each keeping its own kind. One audited bulk decision.'), listEl), confirmText: `Accept ${ids.length}` });
  if (!ok) return;
  try { const d = await call('iris2_decide_bulk', { p_kind: 'claim', p_ids: ids, p_decision: decision, p_note: '' }, { dedupe: false }); toast({ title: `${fmt.int(d?.count ?? ids.length)} claims accepted`, kind: 'success' }); reload(); }
  catch (e) { toast({ title: 'Bulk accept failed', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); }
}
