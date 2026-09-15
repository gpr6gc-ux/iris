// Projects (Projects.dc.html): the library of published work. Cards; "Open view" for ModelLens / Karta; detail drawer for the rest.

import { h, fmt, extLink, safeHref } from '../util.js';
import { iconEl, irisGlyphEl } from '../icons.js';
import { setCount } from '../store.js';
import { navigate } from '../router.js';
import { pill, emptyState, openPanel, segmented } from '../ui.js';
import { load, card, statePill } from './_common.js';

export function render(root, route) {
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_projects', {}, (d, el) => {
    const all = d.projects || [];
    setCount('projects', all.length);
    let filter = 'all';
    const counts = { all: all.length, live: all.filter((p) => p.status === 'live').length, skeleton: all.filter((p) => p.status === 'skeleton').length, view: all.filter((p) => p.status === 'view').length, paused: all.filter((p) => p.status === 'paused').length };
    const grid = h('div.grid.grid-3');
    const paint = () => {
      grid.replaceChildren();
      const list = all.filter((p) => filter === 'all' || p.status === filter);
      if (!list.length) { grid.append(emptyState('No projects', 'Nothing matches this filter.')); return; }
      for (const p of list) grid.append(projectCard(p));
    };
    const seg = segmented([{ key: 'all', label: 'All', count: counts.all }, { key: 'live', label: 'Live', count: counts.live }, { key: 'skeleton', label: 'Skeleton', count: counts.skeleton }, { key: 'view', label: 'Views', count: counts.view }, { key: 'paused', label: 'Paused', count: counts.paused }], filter, (k) => { filter = k; paint(); }, { label: 'Status' });
    el.append(h('div.inbox-toolbar', seg, h('span.small.muted', `${all.length} projects · iris2_projects`)), grid);
    paint();
  });
  return () => {};
}

function projectCard(p) {
  const hot = !!p.view;
  const tone = p.status === 'live' ? 'primary' : p.status === 'skeleton' ? 'good' : 'info';
  const metric = (p.metrics || []).map((m) => (/^[\d.,]+$/.test(String(m.value)) && m.label ? `${m.value} ${m.label}` : String(m.value))).join(' · ');
  const site = safeHref(p.live_url);
  const el = h('div.card.project-card.card-hover', { class: hot && p.view === 'modellens' ? 'glow' : '' },
    h('div.card-head', h('div.ph', h('span.mark', { class: hot ? 'hot' : '' }, hot ? irisGlyphEl(20) : iconEl('projects')), h('div', { style: { minWidth: 0 } }, h('div.nm', p.name), h('div.tg', p.tagline))), pill(p.status, `status ${tone}`)),
    h('div.small.muted.trunc', { title: [p.live_url ? String(p.live_url).replace(/^https?:\/\//, '') : null, ...(p.stack || [])].filter(Boolean).join(' · ') }, [p.live_url ? String(p.live_url).replace(/^https?:\/\//, '') : null, ...(p.stack || []).slice(0, 3)].filter(Boolean).join(' · ') || '—'),
    h('div.small', metric || p.what_it_does || ''),
    h('div.foot',
      h('button.btn.btn-sm', { type: 'button', onclick: () => (p.view ? navigate(`/projects/${p.view}`) : openProject(p)) }, p.view ? iconEl('arrow-right') : iconEl('eye'), p.view ? 'Open view' : 'Details'),
      site ? h('a.btn.btn-sm.btn-ghost', { href: site, target: '_blank', rel: 'noopener noreferrer' }, iconEl('external', 'ic-14'), 'Site') : null));
  return el;
}

function openProject(p) {
  const body = [
    h('div.pills', statePill(p.status), p.kind ? pill(p.kind, 'status neutral nodot') : null, ...(p.stack || []).map((s) => h('span.tag', s))),
    p.problem ? sec('Problem', h('p', p.problem)) : null,
    p.what_it_does ? sec('What it does', h('p', p.what_it_does)) : null,
    (p.use_cases || []).length ? sec('Use cases', h('ul', { style: { margin: 0, paddingLeft: '18px', fontSize: '13px', lineHeight: '1.6' } }, p.use_cases.map((u) => h('li', u)))) : null,
    (p.components || []).length ? sec('Components', h('div.pills', p.components.map((c) => h('span.tag', typeof c === 'string' ? c : c.name)))) : null,
    (p.metrics || []).length ? sec('Metrics', h('div.detail-grid', p.metrics.map((m) => h('div.kv', h('div.k', m.label), h('div.v', m.value))))) : null,
    p.repo_url ? sec('Repository', extLink(p.repo_url, iconEl('external', 'ic-14'), ' ', p.repo_url)) : null,
  ];
  openPanel({ kicker: [pill('project', 'kind kind-proposal')], title: p.name, sub: [h('span', p.tagline)], body, foot: p.live_url && safeHref(p.live_url) ? [h('a.btn.btn-primary', { href: p.live_url, target: '_blank', rel: 'noopener noreferrer' }, iconEl('external'), 'Open site')] : null });
}
const sec = (t, ...c) => h('div.detail-section', h('h3', t), ...c);
