// Intel: sources (crawls, finds, yield), scout finds (pending / adopted), harvest (repos + artifacts), pattern library.

import { h, fmt, extLink } from '../util.js';
import { iconEl } from '../icons.js';
import { pill, emptyState, segmented, openPanel } from '../ui.js';
import { load, card, kpi, statePill } from './_common.js';

export function render(root) {
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_intel', {}, draw);
  return () => {};
}

function draw(d, host) {
  const sources = d.sources || []; const finds = d.finds || { pending: [], adopted: [] }; const harvest = d.harvest || { repos: [], counts: {} };
  const active = sources.filter((s) => s.status === 'active');
  const totalFinds = sources.reduce((a, s) => a + (Number(s.finds) || 0), 0); const totalCrawls = sources.reduce((a, s) => a + (Number(s.crawls) || 0), 0);
  host.append(h('div.kpis',
    kpi('intel', 'Sources', `${fmt.int(active.length)} active`, `${fmt.int(sources.length)} total · ${fmt.int(d.self_discovered)} self-discovered`),
    kpi('activity', 'Yield', fmt.pct(totalCrawls ? 100 * totalFinds / totalCrawls : 0, 1), `${fmt.int(totalFinds)} finds from ${fmt.int(totalCrawls)} crawls`),
    kpi('sparkles', 'New finds', fmt.int((finds.pending || []).length), `${fmt.int((finds.adopted || []).length)} adopted recently`, (finds.pending || []).length ? 'warn' : ''),
    kpi('book', 'Pattern library', fmt.int(d.pattern_library_size), `${fmt.int(harvest.counts?.repos ?? (harvest.repos || []).length)} repos harvested · ${fmt.int(harvest.counts?.artifacts ?? (harvest.repos || []).reduce((n, r) => n + ((r.artifacts || []).length), 0))} artifacts${harvest.counts?.done != null ? ` · queue ${fmt.int(harvest.counts.done)} done` : ''}`)));

  const tone = (s) => s === 'active' ? 'good' : s === 'candidate' ? 'primary' : s === 'paused' ? 'warn' : s === 'dead' ? 'bad' : 'neutral';
  const srcCard = card(h('h2', 'Sources'), 'priority · crawls · finds · yield', sources.length ? h('div.tbl-wrap', h('table.tbl.compact', h('thead', h('tr', h('th', 'Source'), h('th', 'Status'), h('th.num.hide-sm', 'Pri.'), h('th.num', 'Crawls'), h('th.num', 'Finds'), h('th.num', 'Yield'), h('th.hide-sm', 'Last crawl'))),
    h('tbody', sources.slice().sort((a, b) => (a.priority || 9) - (b.priority || 9) || b.finds - a.finds).map((s) => h('tr', h('td.wrap', h('div', extLink(s.url, h('b', s.name))), h('div.small.muted', `${s.kind || ''}${s.why ? ` · ${s.why}` : ''}${s.discovered_by && s.discovered_by !== 'owner' ? ` · found by ${s.discovered_by}` : ''}`)), h('td', pill(s.status, `status ${tone(s.status)}`)), h('td.num.hide-sm', fmt.int(s.priority)), h('td.num', fmt.int(s.crawls)), h('td.num', fmt.int(s.finds)), h('td.num', s.yield == null ? '—' : fmt.pct(Number(s.yield) <= 1 ? Number(s.yield) * 100 : Number(s.yield), 1)), h('td.muted.nowrap.hide-sm', fmt.ago(s.last_crawled_at))))))) : emptyState('No sources', 'The crawler has nothing to crawl. Add a source via Tell IRIS.'), { flush: true, cls: 'f15' });
  srcCard.querySelector('.card-head').style.padding = '14px 16px 6px';

  let seg = 'pending';
  const list = h('div.list.tight');
  const paint = () => {
    list.replaceChildren();
    const arr = finds[seg] || [];
    if (!arr.length) { list.append(emptyState(seg === 'pending' ? 'No new finds' : 'Nothing adopted yet', seg === 'pending' ? 'Scouts file finds as they read; they show up here first.' : 'Adopted finds become claims and, once accepted, facts.')); return; }
    for (const f of arr) list.append(h('div.item.col', { class: seg === 'pending' ? 'stripe-MEDIUM' : 'stripe-GOOD' }, h('div', { style: { fontWeight: 600, fontSize: '13.5px', lineHeight: '1.4' } }, f.statement), f.detail ? h('div.sub', f.detail) : null, h('div.sub', `${f.by ? `${f.by} · ` : ''}${f.confidence != null ? `conf ${fmt.num(f.confidence, 2)} · ` : ''}${fmt.ago(f.adopted_at || f.at)}`)));
  };
  paint();
  const findsCard = card(h('h2', 'Finds'), segmented([{ key: 'pending', label: 'New', count: (finds.pending || []).length }, { key: 'adopted', label: 'Adopted', count: (finds.adopted || []).length }], seg, (k) => { seg = k; paint(); }, { label: 'Finds' }), [list, h('div.foot-note', 'New finds are reviewed as claims in Brain → Review deck.')], { cls: 'f1' });
  host.append(h('div.row.wrap-md', srcCard, findsCard));

  const repos = harvest.repos || [];
  const hc = harvest.counts || {}; const hCard = card(h('h2', 'Harvest'), `${fmt.int(hc.repos ?? repos.length)} repos${hc.done != null ? ` · queue: ${fmt.int(hc.done)} done · ${fmt.int(hc.duplicate || 0)} duplicate · ${fmt.int(hc.skipped || 0)} skipped` : ''}`, repos.length ? h('div.grid.grid-3.tight', repos.map((r) => h('div.item.col.plain.clickable', { tabindex: 0, role: 'button', onclick: () => openRepo(r), onkeydown: (e) => { if (e.key === 'Enter') openRepo(r); } }, h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', width: '100%' } }, iconEl('db'), h('b.trunc', { style: { flex: 1 } }, r.repo), h('span.small.muted', fmt.ago(r.at))), h('div.sub', `${(r.artifacts || []).length} artifact${(r.artifacts || []).length === 1 ? '' : 's'} · ${(r.artifacts || []).slice(0, 2).map((a) => a.title).join(' · ')}`)))) : emptyState('Nothing harvested', 'The harvester reads public repos for reusable patterns.'));
  host.append(hCard);
}

function openRepo(r) {
  openPanel({ kicker: [pill('harvest', 'kind kind-claim')], title: r.repo, sub: [extLink(r.url, iconEl('external', 'ic-14'), ' ', String(r.url || '').replace(/^https?:\/\//, '')), h('span', `· ${fmt.date(r.at)}`)],
    body: h('div.list.tight', (r.artifacts || []).map((a) => h('div.item.col.plain', pill(a.type, 'status neutral nodot'), h('div', { style: { fontWeight: 600 } }, a.title), a.detail ? h('div.sub', a.detail) : null))) });
}
