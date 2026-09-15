// Evolution (V5): the governed prompt lifecycle. Each agent prompt is versioned in brain.prompts;
// exactly one version per slug is active (the brain.active_prompts view). Promote a candidate to
// active (retiring the incumbent) or roll back to what it superseded — every change is audited and,
// where the eval judge has scored a candidate, measured. The agent fetch path is untouched.

import { h, fmt, clear, truncate } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { toast, openPanel, confirmDialog, promptDialog, pill, emptyState } from '../ui.js';
import { load, card, kpi, statePill } from './_common.js';

export function render(root) {
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_evolution', {}, draw);
  return () => {};
}

function draw(d, host, reload) {
  const prompts = d.prompts || [];
  const evals = d.evals || {};
  const rollouts = d.rollouts || [];
  const byAgent = evals.by_agent || [];
  const passAvg = byAgent.length ? Math.round(byAgent.reduce((s, a) => s + (a.pass_rate || 0), 0) / byAgent.length) : null;
  const badTotal = prompts.reduce((s, p) => s + (p.versions || []).reduce((t, v) => t + (v.bad_reports || 0), 0), 0);

  host.append(h('div.kpis',
    kpi('brain', 'Prompt slugs', fmt.int(prompts.length), `${prompts.filter((p) => p.can_rollback).length} with rollback history`),
    kpi('review', 'Eval pass rate', passAvg == null ? '—' : `${passAvg}%`, `${fmt.int(evals.cases)} cases · ${fmt.int(evals.rubrics)} rubrics`, passAvg == null ? '' : passAvg >= 80 ? 'good' : 'warn'),
    kpi('flag', 'Bad reports', fmt.int(badTotal), 'agent-flagged wrong/unusable', badTotal ? 'warn' : 'good'),
    kpi('route', 'Rollouts', fmt.int(rollouts.length), 'promotions + rollbacks logged')));

  // ---- prompt library
  const rows = prompts.map((p) => {
    const bad = (p.versions || []).reduce((t, v) => t + (v.bad_reports || 0), 0);
    const tr = h('tr.clickable', { tabindex: 0, 'aria-label': `Prompt ${p.slug}` });
    const open = () => openSlug(p, reload);
    tr.addEventListener('click', (e) => { if (e.target.closest('button,a')) return; open(); });
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    tr.append(
      h('td', h('b', p.slug)),
      h('td.num', `v${fmt.int(p.active_version)}`),
      h('td.num.muted', `${(p.versions || []).length} version${(p.versions || []).length === 1 ? '' : 's'}`),
      h('td', bad ? pill(`${bad} bad`, 'status warn nodot') : h('span.muted', '—')),
      h('td', p.can_rollback ? pill('rollback ready', 'status neutral nodot') : h('span.muted', '—')));
    return tr;
  });
  const libCard = card(h('h2', 'Prompt library'), 'one active version per slug · click to see history, promote or roll back',
    prompts.length ? h('div.tbl-wrap', h('table.tbl', h('thead', h('tr', h('th', 'Slug'), h('th.num', 'Active'), h('th.num', 'Versions'), h('th', 'Bad reports'), h('th', 'Rollback'))), h('tbody', rows))) : emptyState('No prompts', 'brain.prompts is empty.'),
    { flush: true });
  libCard.querySelector('.card-head').style.padding = '14px 16px 6px';
  host.append(libCard);

  // ---- evals + rollouts
  const evalCard = card(h('h2', 'Eval scores'), 'LLM-judge pass rate by agent — the promotion gate',
    byAgent.length ? h('div.list.tight', byAgent.map((a) => h('div.item.plain',
      h('div.grow', h('div', h('b', a.agent)), h('div.sub', `${fmt.int(a.runs)} run${a.runs === 1 ? '' : 's'} · avg ${fmt.num(a.avg_score, 1)}${a.last_run ? ` · ${fmt.day(a.last_run)}` : ''}`)),
      pill(`${fmt.int(a.pass_rate)}%`, `status ${a.pass_rate >= 80 ? 'good' : a.pass_rate >= 50 ? 'warn' : 'bad'} nodot`)))) : emptyState('No eval scores yet', 'The judge writes scores through iris_eval_record; they gate promotions.'),
    { cls: 'f1' });
  const rollCard = card(h('h2', 'Rollouts'), 'every promote + rollback, newest first',
    rollouts.length ? h('div.list.tight', rollouts.map((r) => h('div.item.plain',
      h('div.grow', h('div', h('b', r.slug), ' ', pill(r.action, `status ${r.action === 'rollback' ? 'warn' : 'good'} nodot`)),
        h('div.sub', `v${r.from == null ? '—' : r.from} → v${r.to} · ${r.actor || 'owner'} · ${fmt.time(r.at)}${r.reason ? ` · ${truncate(r.reason, 50)}` : ''}`))))) : emptyState('No rollouts yet', 'Promote or roll back a prompt and it is logged here.'),
    { cls: 'f1' });
  host.append(h('div.row.wrap-md', h('div.f1', evalCard), h('div.f1', rollCard)));
}

// ---------------------------------------------------------------- slug drawer
function openSlug(p, reload) {
  const versions = (p.versions || []).slice();
  const body = [];
  body.push(h('div.pills', pill(`active v${fmt.int(p.active_version)}`, 'status good'), pill(`${versions.length} versions`, 'status neutral nodot')));
  body.push(h('div.foot-note', 'Promoting a version makes it the single active one and retires the incumbent. Rollback restores the version the current active one superseded. Both are audited.'));

  const list = h('div.list.tight');
  for (const v of versions) {
    const isActive = v.status === 'active';
    const promote = h('button.btn.btn-sm.btn-primary', { type: 'button', disabled: isActive, onclick: () => doPromote(v, p, reload) }, iconEl('check'), isActive ? 'Active' : 'Promote');
    list.append(h('div.item.plain', { class: isActive ? 'stripe-GOOD' : '' },
      h('div.grow', h('div', h('b', `v${fmt.int(v.version)}`), ' ', statePill(v.status), v.bad_reports ? pill(`${v.bad_reports} bad`, 'status warn nodot') : null),
        h('div.sub', `${v.name || p.slug}${v.activated_at ? ` · activated ${fmt.day(v.activated_at)}` : v.created_at ? ` · created ${fmt.day(v.created_at)}` : ''}`)),
      h('div.actions', promote)));
  }
  body.push(list);

  const foot = [];
  if (p.can_rollback) foot.push(h('button.btn.btn-danger.btn-ghost', { type: 'button', onclick: () => doRollback(p, reload) }, iconEl('route'), 'Roll back to previous'));

  openPanel({ kicker: [pill('prompt', 'kind kind-proposal')], title: p.slug, sub: [h('span', `active v${p.active_version}`)], body, foot });
}

async function doPromote(v, p, reload) {
  const reason = await promptDialog({ title: `Promote ${p.slug} v${v.version}?`, message: `Makes v${v.version} the active prompt for “${p.slug}” and retires v${p.active_version}. Agents pick it up on their next fetch.`, label: 'Reason (optional)', placeholder: 'why you’re promoting', confirmText: 'Promote to active' });
  if (reason === null) return;
  try {
    await call('iris2_prompt_promote', { p_prompt_id: v.id, p_reason: reason || null }, { dedupe: false });
    toast({ title: 'Promoted', message: `${p.slug} → v${v.version} is now active.`, kind: 'success' });
    reload(); setTimeout(() => { const np = { ...p, active_version: v.version }; openSlugRefetch(p.slug, reload); }, 150);
  } catch (e) { toast({ title: 'Could not promote', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 8000 }); }
}

async function doRollback(p, reload) {
  const ok = await confirmDialog({ title: `Roll back ${p.slug}?`, message: `Restores the version that v${p.active_version} superseded and retires v${p.active_version}. Use this when a promoted prompt is misbehaving.`, confirmText: 'Roll back', danger: true });
  if (!ok) return;
  try {
    const d = await call('iris2_prompt_rollback', { p_slug: p.slug, p_reason: 'rolled back from Evolution' }, { dedupe: false });
    toast({ title: 'Rolled back', message: `${p.slug} → v${d?.to ?? ''} restored.`, kind: 'success' });
    reload(); setTimeout(() => openSlugRefetch(p.slug, reload), 150);
  } catch (e) { toast({ title: 'Could not roll back', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 8000 }); }
}

// re-fetch the dashboard and re-open the drawer for a slug so it shows the new state
async function openSlugRefetch(slug, reload) {
  try {
    const d = await call('iris2_evolution', {}, { dedupe: false });
    const p = (d.prompts || []).find((x) => x.slug === slug);
    if (p) openSlug(p, reload);
  } catch { /* ignore */ }
}
