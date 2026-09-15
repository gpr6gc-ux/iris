// Autonomy (V4 bounded autonomy): the kill switch + per-agent guardrails. The global switch and each
// agent's pause are honored immediately by the outbox dispatcher and the spend governor — a paused
// agent cannot dispatch work or call a model. Schedules + spend ceilings + failures + a change log.

import { h, fmt, clear } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { toast, confirmDialog, promptDialog, switchEl, pill, emptyState } from '../ui.js';
import { load, card, statePill } from './_common.js';

export function render(root) {
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_autonomy', {}, draw);
  return () => {};
}

function draw(d, host, reload) {
  const paused = (d.paused || {});
  const globalPaused = !!paused.global;
  const agents = d.agents || [];
  const schedules = d.schedules || [];
  const caps = d.spend_caps || [];
  const health = d.health || {};
  const log = d.log || [];

  // ---- KILL SWITCH hero
  const st = paused.state || {};
  const hero = h('div.card.au-kill', { class: globalPaused ? 'paused' : 'running' },
    h('div.au-kill-main',
      h('div.au-kill-state',
        h('span.au-dot', { class: globalPaused ? 'bad' : 'good' }),
        h('div', h('div.au-kill-title', globalPaused ? 'Autonomy paused' : 'Autonomy running'),
          h('div.au-kill-sub', globalPaused
            ? `All agents halted${st.since ? ` · since ${fmt.time(st.since)}` : ''}${st.reason ? ` · ${st.reason}` : ''}`
            : 'Agents dispatch work and spend within their caps. The kill switch stops everything instantly.'))),
      h('button.btn.au-kill-btn', { class: globalPaused ? 'btn-primary' : 'btn-danger', type: 'button',
        onclick: () => toggleGlobal(globalPaused, reload) },
        iconEl(globalPaused ? 'play' : 'stop'), globalPaused ? 'Resume all autonomy' : 'Pause all autonomy')),
    h('div.foot-note', 'The switch is enforced at the two chokepoints: the outbox dispatcher (no new work) and the spend governor (no model calls). In-flight leased work drains; nothing new starts.'));
  host.append(hero);

  // ---- agents + right column
  const agentRows = agents.map((a) => agentRow(a, globalPaused, reload));
  const agentsCard = card(h('h2', 'Agents'), `${agents.filter((a) => a.active).length} active · pause, deactivate, or require approval per agent`,
    agents.length ? h('div.tbl-wrap', h('table.tbl',
      h('thead', h('tr', h('th', 'Agent'), h('th.hide-sm', 'Model'), h('th', 'State'), h('th', 'Approval'), h('th', 'Active'), h('th', 'Paused'))),
      h('tbody', agentRows))) : emptyState('No agents registered', 'brain.agents is empty.'), { flush: true, cls: 'f2' });
  agentsCard.querySelector('.card-head').style.padding = '14px 16px 6px';

  const schedCard = card(h('h2', 'Schedules'), `${schedules.filter((s) => s.active).length} of ${schedules.length} cron jobs active`,
    schedules.length ? h('div.list.tight', schedules.map((s) => h('div.item.plain',
      h('div.grow', h('div', h('b', s.name)), h('div.sub', h('span.mono', s.schedule))),
      pill(s.active ? 'active' : 'off', `status ${s.active ? 'good' : 'neutral'}`)))) : emptyState('No jobs', 'pg_cron has no jobs.'),
    { cls: 'f1' });

  const capsCard = card(h('h2', 'Spend ceilings'), 'hard caps deny; soft caps warn',
    caps.length ? h('div.list.tight', caps.map((c) => h('div.item.plain',
      h('div.grow', h('div', h('b', `${c.scope}${c.key ? ` · ${c.key}` : ''}`)), h('div.sub', `${fmt.money(c.cap_usd, 0)} / ${c.window_hours}h`)),
      pill(c.hard ? 'hard' : 'soft', `status ${c.hard ? 'bad' : 'warn'} nodot`)))) : emptyState('No caps', 'ops.spend_caps is empty.'),
    { cls: 'f1' });

  host.append(h('div.row.wrap-md', agentsCard, h('div.col.f1', schedCard, capsCard)));

  // ---- failures + log (recovery lane: retrying with backoff, dead-lettered past the ceiling)
  const fails = health.recent_failures || [];
  const failSub = `${fmt.int(health.retrying || 0)} retrying · ${fmt.int(health.dead_letter || 0)} dead-lettered · failed jobs self-heal with backoff`;
  const failCard = card(h('h2', `Recent failures${health.failed_active ? ` · ${fmt.int(health.failed_active)} open` : ''}`), failSub,
    fails.length ? h('div.list.tight', fails.map((f) => failRow(f, reload))) : emptyState('No recent failures', 'The outbox is clean — nothing to recover.'),
    { cls: 'f1' });
  const logCard = card(h('h2', 'Kill-switch log'), 'who paused or resumed what',
    log.length ? h('div.list.tight', log.map((l) => h('div.item.plain',
      h('div.grow', h('div', h('b', l.scope), ' ', pill(l.paused ? 'paused' : 'resumed', `status ${l.paused ? 'warn' : 'good'} nodot`)), h('div.sub', `${l.actor || 'owner'} · ${fmt.time(l.at)}${l.reason ? ` · ${l.reason}` : ''}`))))) : emptyState('No changes yet', 'Kill-switch actions are recorded here.'),
    { cls: 'f1' });
  host.append(h('div.row.wrap-md', h('div.f1', failCard), h('div.f1', logCard)));
}

function agentRow(a, globalPaused, reload) {
  const activeSw = switchEl(!!a.active, async (next) => {
    try { await call('iris2_autonomy_agent_set', { p_slug: a.slug, p_active: next }, { dedupe: false });
      toast({ title: `${a.name} ${next ? 'activated' : 'deactivated'}`, kind: 'success' }); return true; }
    catch (e) { toast({ title: 'Could not update', message: e.message, kind: 'error' }); return false; }
  }, { label: `Active ${a.slug}` });
  const apprSw = switchEl(!!a.needs_approval, async (next) => {
    try { await call('iris2_autonomy_agent_set', { p_slug: a.slug, p_needs_approval: next }, { dedupe: false });
      toast({ title: `${a.name} · ${next ? 'now requires' : 'no longer requires'} approval`, kind: 'success' }); return true; }
    catch (e) { toast({ title: 'Could not update', message: e.message, kind: 'error' }); return false; }
  }, { label: `Needs approval ${a.slug}` });
  const pauseSw = switchEl(!!a.paused, async (next) => {
    try { await call('iris2_autonomy_set_pause', { p_scope: 'agent:' + a.slug, p_paused: next, p_reason: next ? 'paused from Autonomy' : null }, { dedupe: false });
      toast({ title: `${a.name} ${next ? 'paused' : 'resumed'}`, message: next ? 'This agent cannot spend or dispatch until resumed.' : '', kind: 'success' });
      setTimeout(reload, 150); return true; }
    catch (e) { toast({ title: 'Could not update', message: e.message, kind: 'error' }); return false; }
  }, { label: `Pause ${a.slug}` });

  const state = a.paused ? 'paused' : globalPaused ? 'halted (global)' : a.active ? 'running' : 'inactive';
  return h('tr',
    h('td', h('div', h('b', a.name)), h('div.sub.muted', a.purpose ? String(a.purpose).slice(0, 60) : a.slug)),
    h('td.muted.mono.hide-sm', a.model || '—'),
    h('td', statePill(state)),
    h('td', apprSw),
    h('td', activeSw),
    h('td', pauseSw));
}

function failRow(f, reload) {
  const dead = !!f.dead;
  const retryLabel = dead ? 'gave up' : f.next_retry_at ? `retry ${fmt.time(f.next_retry_at)}` : 'awaiting recovery';
  const meta = `${fmt.int(f.attempts)}/${fmt.int(f.max_attempts)} attempts · ${retryLabel}${f.at ? ` · ${fmt.time(f.at)}` : ''}`;
  const retry = h('button.btn.btn-sm.btn-primary', { type: 'button', title: 'Re-queue this job now', onclick: () => retryJob(f.id, reload) }, iconEl('refresh'), 'Retry now');
  const giveUp = dead ? null : h('button.btn.btn-sm.btn-ghost', { type: 'button', title: 'Stop retrying (dead-letter)', onclick: () => deadLetter(f.id, reload) }, 'Give up');
  return h('div.item.plain', { class: dead ? 'stripe-HIGH' : 'stripe-MEDIUM' },
    h('div.grow', h('div', h('b', f.kind || 'job'), ' ', dead ? pill('dead-letter', 'status bad nodot') : pill('retrying', 'status warn nodot')),
      h('div.sub', meta), f.error ? h('div.small.muted', String(f.error).slice(0, 90)) : null),
    h('div.actions', retry, giveUp));
}

async function retryJob(id, reload) {
  try {
    await call('iris2_outbox_retry', { p_id: id }, { dedupe: false });
    toast({ title: 'Re-queued', message: 'The job is back in the queue for the next dispatch.', kind: 'success' });
    setTimeout(reload, 150);
  } catch (e) { toast({ title: 'Could not retry', message: `${e.code || 'error'}: ${e.message}`, kind: 'error' }); }
}
async function deadLetter(id, reload) {
  const ok = await confirmDialog({ title: 'Stop retrying this job?', message: 'Dead-letters the job — it will not be retried automatically. You can still retry it by hand later.', confirmText: 'Give up', danger: true });
  if (!ok) return;
  try {
    await call('iris2_outbox_deadletter', { p_id: id, p_reason: 'dead-lettered from Autonomy' }, { dedupe: false });
    toast({ title: 'Dead-lettered', message: 'Automatic retries stopped for this job.', kind: 'warn' });
    setTimeout(reload, 150);
  } catch (e) { toast({ title: 'Could not dead-letter', message: `${e.code || 'error'}: ${e.message}`, kind: 'error' }); }
}

async function toggleGlobal(currentlyPaused, reload) {
  if (!currentlyPaused) {
    const reason = await promptDialog({
      title: 'Pause all autonomy?',
      message: 'Every agent stops immediately: no new work is dispatched from the outbox and the spend governor denies all model calls. In-flight leased work finishes; nothing new starts. Data feeds keep running.',
      label: 'Reason (optional)', placeholder: 'why you’re pausing', confirmText: 'Pause everything', danger: true,
    });
    if (reason === null) return;
    await setGlobal(true, reason, reload);
  } else {
    const ok = await confirmDialog({ title: 'Resume autonomy?', message: 'Agents resume dispatching work and spending within their caps.', confirmText: 'Resume all', glow: true });
    if (!ok) return;
    await setGlobal(false, null, reload);
  }
}

async function setGlobal(paused, reason, reload) {
  try {
    await call('iris2_autonomy_set_pause', { p_scope: 'global', p_paused: paused, p_reason: reason }, { dedupe: false });
    toast({ title: paused ? 'Autonomy paused' : 'Autonomy resumed', message: paused ? 'All agents halted.' : 'Agents are running again.', kind: paused ? 'warn' : 'success', duration: 6000 });
    reload();
  } catch (e) { toast({ title: 'Could not change the kill switch', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 8000 }); }
}
