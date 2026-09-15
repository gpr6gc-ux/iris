// Mission (Main.dc.html / MissionLight / Phone): KPIs, structured proposals with arm-to-approve, the machine now, 24h digest,
// pipeline, feed health. Approvals-first on the phone.

import { h, fmt, clear, extLink, sleep, modKey } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { href } from '../router.js';
import { S, setKpis, setCount, emit } from '../store.js';
import { toast, promptDialog, pill, steps, emptyState, skeleton } from '../ui.js';
import { columns } from '../charts.js';
import { load, kpi, card, agentPill, riskPill, statePill, skelRows } from './_common.js';
import { openTell } from '../app.js';
import { mountBetterNote } from './_better.js';

const ARM_SECONDS = 6;

export function render(root) {
  const host = h('div.stack');
  root.append(host);
  // Kill-switch banner (V4): if autonomy is paused it must be impossible to miss from the home view.
  // Best-effort + isolated — a failure here never touches the rest of the page.
  const bannerHost = h('div', { dataset: { role: 'autonomy-banner' } });
  // How IRIS got better — the owner's one requested read (2026-09-13): plain language, no claim review.
  // Isolated like everything else on this page: a failure here never touches the rest of Mission.
  const betterHost = h('div', { dataset: { role: 'better-note' } });
  // Today's Intelligence — an executive read of the situation, computed deterministically from the
  // mission data (no fabricated text). Isolated: a failure here never touches the rest of the page.
  const summaryHost = h('div', { dataset: { role: 'mission-summary' } });
  // Mission control tower (Phase 3) — its own isolated section + RPC. If it ever errors it stays empty;
  // the rest of the Mission page below is never affected.
  const towerHost = h('div', { dataset: { role: 'mission-tower' } });
  const bodyHost = h('div.stack');
  host.append(bannerHost, betterHost, summaryHost, towerHost, bodyHost);
  loadPausedBanner(bannerHost);
  mountBetterNote(betterHost);
  loadSummary(summaryHost);
  loadTower(towerHost);
  load(bodyHost, 'iris2_mission', {}, draw);
  return () => { for (const t of timers) clearTimeout(t); timers.length = 0; };
}
const timers = [];

// V4: surface a global kill-switch pause + the commerce fulfillment backlog right on the home view.
// Both are best-effort and isolated — neither can break Mission.
async function loadPausedBanner(host) {
  try {
    const d = await call('iris2_autonomy', {}, { dedupe: true });
    const p = d && d.paused;
    if (!p) return;
    if (p.global) {
      const reason = p.state && p.state.reason;
      clear(host);
      host.append(h('div.paused-banner', iconEl('stop'),
        h('div.grow', h('b', 'Autonomy is paused'), h('span', reason ? ` · ${reason}` : ' · agents are halted — no work dispatched, no model spend')),
        h('a.btn.btn-sm', { href: href('/autonomy') }, 'Open Autonomy')));
    } else if ((p.agents || []).length) {
      clear(host);
      host.append(h('div.paused-banner.partial', iconEl('pause'),
        h('div.grow', h('b', `${p.agents.length} agent${p.agents.length === 1 ? '' : 's'} paused`), h('span', ` · ${p.agents.slice(0, 3).join(', ')}${p.agents.length > 3 ? '…' : ''}`)),
        h('a.btn.btn-sm', { href: href('/autonomy') }, 'Open Autonomy')));
    }
  } catch { /* best-effort: pause banner must never break Mission */ }
}

async function loadSummary(host) {
  try { const d = await call('iris2_mission', {}, { dedupe: true }); drawSummary(d, host); }
  catch (e) { /* additive: a summary failure must never break the Mission page */ }
}
function drawSummary(d, host) {
  // Executive read only — a single deterministic sentence. The numbers themselves live in the one
  // authoritative KPI band below (A21: no duplicate KPI bands); this strip narrates, it doesn't re-tally.
  const k = d.kpis || {}; const ny = k.needs_you || {};
  const feeds = d.feed_health || [];
  const failing = feeds.filter((f) => f.state === 'failing').length;
  const staleN = feeds.filter((f) => f.state === 'stale').length;
  const needs = ny.total || 0;
  const clauses = [];
  if (failing) clauses.push(`${failing} feed${failing === 1 ? ' is' : 's are'} failing`);
  if (needs) clauses.push(`${needs} item${needs === 1 ? '' : 's'} need${needs === 1 ? 's' : ''} your decision`);
  if (staleN) clauses.push(`${staleN} feed${staleN === 1 ? '' : 's'} stale`);
  const lead = clauses.length ? clauses.join(' · ') + '.' : 'No material changes — the factory is running clean.';
  const strip = h('div.today-intel',
    h('div.ti-head', h('span.ti-eyebrow', iconEl('sparkles', 'ic-14'), 'Today’s intelligence'),
      h('span.ti-time', new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))),
    h('div.ti-lead', lead));
  clear(host); host.append(strip);
}

async function loadTower(host) {
  try {
    const d = await call('iris2_mission_tower', {}, { dedupe: false });
    drawTower(d, host);
  } catch (e) { /* additive: a tower failure must never break the Mission page */ }
}

function drawTower(d, host) {
  const items = d.items || []; const health = d.health || {}; const feeds = health.feeds || {}; const secrets = health.secrets || {};
  const bits = [];
  if (feeds.failing) bits.push(`${feeds.failing} feed${feeds.failing === 1 ? '' : 's'} failing`);
  if (feeds.stale) bits.push(`${feeds.stale} stale`);
  const healthy = (feeds.ok || 0) + (feeds.live || 0); if (healthy) bits.push(`${healthy} healthy`);
  if (secrets.missing_required) bits.push(`${secrets.missing_required} required key missing`);
  const sub = items.length ? `${items.length} open · ${bits.join(' · ')}` : (bits.join(' · ') || 'all clear');
  const towerCard = card(h('h2', 'Mission control'), sub, [
    items.length ? h('div.list', items.map((it) => towerRow(it, host)))
      : emptyState('All clear', 'No open attention items. New signals land here, ranked by urgency, the moment an agent or feed files one.'),
    h('div.foot-note', 'Ranked by a deterministic score — severity plus how long it has gone unresolved, weighted by domain. Hover a score to see the math; no model sets these numbers.'),
  ], { glow: true, cls: 'mission-tower-card' });
  clear(host); host.append(towerCard);
}

const TOWER_STRIPE = { critical: 'HIGH', warn: 'HIGH', watch: 'MEDIUM', info: 'LOW' };

function towerRow(it, host) {
  const stripe = TOWER_STRIPE[it.severity] || 'LOW';
  const score = h('span.tower-score', { class: stripe.toLowerCase(), title: it.why || 'deterministic urgency score' }, fmt.int(Math.round(it.score || 0)));
  const reason = it.detail && (it.detail.reason || it.detail.error);
  const meta = [pill(it.domain, 'status neutral nodot'), it.age_h ? h('span.muted.small', `${fmt.int(it.age_h)}h open`) : null, reason ? h('span.muted.small', `· ${String(reason).slice(0, 110)}`) : null].filter(Boolean);
  const ack = h('button.btn.btn-sm', { type: 'button', title: 'Acknowledge — keep it, mark seen' }, 'Ack');
  const snooze = h('button.btn.btn-sm', { type: 'button', title: 'Snooze 24 hours' }, 'Snooze');
  const dismiss = h('button.btn.btn-sm', { type: 'button', title: 'Dismiss — remove from the tower' }, 'Dismiss');
  const row = h('div.item.tower-row', { class: `stripe-${stripe}` },
    score,
    h('div.grow', h('div', h('b', it.title)), h('div.sub', ...meta)),
    h('div.actions', ack, snooze, dismiss));
  const act = async (action, hours) => {
    ack.disabled = snooze.disabled = dismiss.disabled = true;
    try {
      await call('iris2_mission_act', { p_id: it.id, p_action: action, p_snooze_hours: hours || 24 }, { dedupe: false });
      row.classList.add('leaving'); setTimeout(() => loadTower(host), 240);
    } catch (e) { ack.disabled = snooze.disabled = dismiss.disabled = false; toast({ title: 'Could not update', message: e.message || 'error', kind: 'warn' }); }
  };
  ack.addEventListener('click', () => act('ack'));
  snooze.addEventListener('click', () => act('snooze', 24));
  dismiss.addEventListener('click', () => act('dismiss'));
  return row;
}

function draw(d, host, reload) {
  const k = d.kpis || {}; const ny = k.needs_you || {};
  setKpis(k); if (d.machine) setCount('agents', d.machine.live_count);
  const stale = (d.feed_health || []).filter((f) => f.state === 'stale'); const failing = (d.feed_health || []).filter((f) => f.state === 'failing');
  const nyParts = [ny.proposals ? `${ny.proposals} proposal${ny.proposals === 1 ? '' : 's'}` : null, ny.content ? `${ny.content} draft${ny.content === 1 ? '' : 's'}` : null, ny.claims ? `${ny.claims} claim${ny.claims === 1 ? '' : 's'}` : null, ny.builds ? `${ny.builds} build${ny.builds === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || 'inbox clear';
  const pct = k.spend_cap_usd ? Math.round(100 * k.spend_today_usd / k.spend_cap_usd) : 0;
  const gates = k.gates || {};
  // The ONE authoritative KPI band. Each tile is a link — clicking a number opens its supporting
  // records (A21: numbers are navigable, not decorative). Needs-you keeps its data-role for live refresh.
  const kpisEl = h('div.kpis',
    linkKpi('/decisions', 'inbox', 'Needs you', fmt.int(ny.total || 0), nyParts, { valueTone: (ny.total || 0) > 0 ? 'tone-bad' : 'tone-good', to: 'the approvals queue' }),
    linkKpi('/governance', 'wallet', 'Spend today', fmt.money(k.spend_today_usd), `of ${fmt.money(k.spend_cap_usd, 0)} daily cap · ${pct}%`, { cls: 'hide-phone', valueTone: pct >= 80 ? 'tone-warn' : '', to: 'spend & caps' }),
    linkKpi('/revenue', 'revenue', 'Revenue · 30 days', fmt.money(k.revenue_30d_usd, 0), k.revenue_30d_usd ? 'ledger · real payments only' : 'ModelLens audit offer not live yet', { cls: 'hide-phone', to: 'the revenue ledger' }),
    linkKpi('/governance', 'shield', 'Gates & feeds', `${fmt.int(gates.green)} / ${fmt.int(gates.total)}`, feedSub(stale, failing), { cls: 'hide-phone', valueTone: gates.green === gates.total ? 'tone-good' : 'tone-warn', to: 'gates & audit' }),
    linkKpi('/agents', 'agents', 'Live', fmt.int(d.machine?.live_count || 0), 'agents running', { cls: 'phone-only', valueTone: 'tone-good', to: 'the agent constellation' }),
  );
  kpisEl.dataset.role = 'mission-kpis';
  host.append(kpisEl);

  // ---- needs your decision + machine + digest
  const list = h('div.list');
  const props = d.proposals || [];
  if (!props.length) list.append(emptyState('Nothing needs you', 'Every structured proposal has been decided. New ones appear here the moment an agent files them.'));
  for (const p of props) list.append(proposalCard(p, list, reload));
  const structuredN = props.filter((p) => p.structured).length;
  const decisionCard = card(h('h2', 'Needs your decision'), props.length ? `${structuredN} of ${props.length} structured · rest parsed from prose` : 'proposals from agents', [list, h('div.foot-note', 'Approve carries the proposal id to the executor and reports what it actually did. Hot cards require arming first.')], { glow: true, cls: 'f16 mission-phone-first' });

  const tellCard = h('div.card.phone-only', h('div.card-head', h('h2', 'Tell IRIS')), h('button.input.lg', { type: 'button', style: { textAlign: 'left', color: 'var(--subtle)', height: '44px', cursor: 'text' }, onclick: () => openTell() }, 'Note for Claude…'));

  const m = d.machine || {}; const running = m.running || [];
  const machine = card(h('h2', 'The machine · now'), pill(`${fmt.int(m.live_count || 0)} live`, 'status good'), [
    running.length ? h('div.list', running.map((r) => h('div.item.machine-row.plain', h('span.live-dot', { class: r.state === 'failing' ? 'warn' : 'ok' }), h('span.t', h('b', r.agent), ' ', h('span.muted', `· ${r.title}`)), r.state === 'failing' ? pill('fix queued', 'status warn') : h('span.cost', r.cost_usd ? fmt.money(r.cost_usd) : fmt.dur(r.elapsed_s))))) : emptyState('Nothing running', 'Agents are idle. The stream on the Agents page shows the last things they did.'),
  ]);
  const dg = d.digest_24h || {};
  const failures = d.execution_failures || [];
  const digest = card(h('h2', 'Last 24 hours'), 'from the ledger, not estimates', [
    h('div.digest',
      h('div.mini-stat', h('div.k', 'Approved · done · failed'), h('div.v', `${fmt.int(dg.approved)} · ${fmt.int(dg.executed)} · `, h('span', { class: dg.failed ? 'bad' : '' }, fmt.int(dg.failed)))),
      h('div.mini-stat', h('div.k', 'Claims · accepted'), h('div.v', `${fmt.int(dg.claims_found)} · ${fmt.int(dg.claims_accepted)}`)),
      h('div.mini-stat', h('div.k', 'Calls · cost'), h('div.v', `${fmt.int(dg.model_calls)} · ${fmt.money(dg.cost_usd)}`))),
    dg.awaiting_executor ? h('div.notice.warn', iconEl('alert'), h('span', `${fmt.int(dg.awaiting_executor)} approved proposal${dg.awaiting_executor === 1 ? '' : 's'} still waiting for the executor`)) : null,
    columns(dg.hourly_cost || [], { label: 'Hourly LLM cost, last 24 hours' }),
    h('div.foot-note', `${fmt.int(dg.tasks_done)} tasks done · `, dg.tasks_failed ? h('b', `${fmt.int(dg.tasks_failed)} failed (timed out or errored)`) : '0 failed'),
  ]);
  // execution failures are decisions whose outcome the owner has not seen — they belong on Mission, not in a log
  const failCard = failures.length ? card(h('h2', `Execution failed · ${failures.length}`), 'approved by you, not carried out — last 7 days', [h('div.list.tight', failures.map((f) => h('div.item.plain.stripe-HIGH', h('div.grow', h('div', h('b', f.title)), h('div.sub', `${f.action_kind || 'proposal'} · ${fmt.time(f.at)} · `, h('span.bad', f.error || 'no error recorded')))))), h('div.foot-note', 'Decisions › Recent decisions has the full list. Re-file the proposal once the cause is fixed.')], { cls: 'glow-bad' }) : null;
  host.append(h('div.row.wrap-md', decisionCard, tellCard, h('div.col.f1', failCard, machine, digest)));

  // ---- pipeline + feed health
  const pipe = d.pipeline || [];
  const byStage = pipe.reduce((m, r) => { m[r.stage] = (m[r.stage] || 0) + 1; return m; }, {});
  const overdue = pipe.filter((r) => r.overdue_days > 0).length;
  const stageLine = Object.entries(byStage).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(' · ');
  const pipeCard = card(h('h2', 'Pipeline'), `${stageLine || 'no open leads'}${overdue ? ` · ${overdue} overdue` : ''}${d.pipeline_parked ? ` · ${d.pipeline_parked} parked (hidden)` : ''} · values are model estimates`, pipe.length ? h('div.tbl-wrap', h('table.tbl', h('thead', h('tr', h('th', 'Company'), h('th', 'Stage'), h('th.num', { title: 'model estimate, not a quote' }, 'Value (est.)'), h('th', 'Next action'), h('th', 'Due'))),
    h('tbody', pipe.map((r) => h('tr', h('td', h('b', r.org)), h('td', pill(r.stage, `status ${r.stage === 'qualified' ? 'primary' : 'neutral'} nodot`)), h('td.num.muted', r.value_usd != null ? `~${fmt.money(r.value_usd, 0)}` : '—'), h('td.wrap', { style: { maxWidth: '240px' } }, r.next_action), h('td', { class: r.overdue_days > 0 ? 'bad' : 'muted', style: { whiteSpace: 'normal', minWidth: '84px' } }, r.overdue_days > 0 ? `${fmt.day(r.due)} · ${r.overdue_days} d overdue` : fmt.day(r.due))))))) : emptyState('No pipeline rows', 'Leads that clear the bar land here with their next action.'), { flush: true });
  pipeCard.querySelector('.card-head').style.padding = '14px 16px 6px';
  const feeds = d.feed_health || [];
  const feedTone = (s) => s === 'live' || s === 'ok' ? 'good' : s === 'failing' ? 'bad' : 'warn';
  const feedCard = card(h('h2', 'Feed health'), 'expected cadence vs last row', feeds.length ? h('div.list.tight', feeds.map((f) => h('div.item.feed-row.plain', pill(f.state === 'stale' ? `stale ${fmt.age(f.age_s)}` : f.state, `status ${feedTone(f.state)}`), h('span.name', { title: `expected ${f.expected}` }, f.feed), h('span.when', f.age_s < 86400 ? fmt.time(f.last_at) : fmt.day(f.last_at))))) : emptyState('No feeds registered', 'Feed cadence rows come from ops.feed_health.'));
  host.append(h('div.row.wrap-md', h('div.f1', pipeCard), h('div.f1', feedCard)));
}

function feedSub(stale, failing) {
  const names = [...failing, ...stale].map((f) => String(f.feed).split(' ')[0]);
  const shown = names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');
  if (!names.length) return 'all feeds on cadence';
  return `${stale.length} stale${failing.length ? ` · ${failing.length} failing` : ''}: ${shown}`;
}

// A KPI tile that navigates to its supporting records. Rendered as a real hash anchor so it works
// with keyboard, middle-click and the router alike; the arrow appears on hover/focus.
function linkKpi(path, icon, label, value, sub, { tone = '', cls = '', valueTone = '', to = 'its records' } = {}) {
  return h('a.kpi.kpi-link', { href: href(path), class: cls, title: `Open ${to}`, 'aria-label': `${label} — open ${to}` },
    h('div.k', iconEl(icon), h('span', label), iconEl('arrow-right', 'ic-14 kpi-go')),
    h('div.v.ml-pop', { class: valueTone }, value),
    sub ? h('div.s', sub) : null);
}

function proposalCard(p, list, reload) {
  const sev = p.hot || p.risk === 'high' ? 'HIGH' : p.risk === 'medium' ? 'MEDIUM' : 'MEDIUM';
  const cost = p.cost_usd == null ? 'cost n/a' : fmt.money(p.cost_usd);
  const head = h('div.head', h('span.title', p.title), agentPill(p.by), riskPill(p.risk), pill(cost, 'status primary nodot'));
  const approveBtn = h('button.btn.btn-primary.btn-sm', { type: 'button', 'aria-label': `${p.hot ? 'Arm and approve' : 'Approve'}: ${p.title}` }, iconEl('check'), p.hot ? 'Arm & approve' : 'Approve');
  const declineBtn = h('button.btn.btn-sm', { type: 'button', 'aria-label': `Decline: ${p.title}` }, 'Decline');
  const outcome = h('div.outcome', { hidden: true });
  const el = h('div.item.proposal', { class: `stripe-${sev}`, dataset: { id: p.id } },
    h('div.grow', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, head, steps(p.steps || []), p.source_url ? h('div.small', extLink(p.source_url, iconEl('external', 'ic-14'), ' ', String(p.source_url).replace(/^https?:\/\//, ''))) : null, outcome),
    h('div.actions', approveBtn, declineBtn));

  let armed = false; let armTimer = null; let tick = null;
  const disarm = () => { armed = false; clearTimeout(armTimer); clearInterval(tick); approveBtn.classList.remove('armed'); clear(approveBtn); approveBtn.append(iconEl('check'), 'Arm & approve'); approveBtn.setAttribute('aria-label', `Arm and approve: ${p.title}`); };
  const arm = () => {
    armed = true; let left = ARM_SECONDS;
    const paint = () => { clear(approveBtn); approveBtn.append(iconEl('alert'), 'Confirm approve', h('span.countdown', ` · ${left}s`)); };
    approveBtn.classList.add('armed'); approveBtn.setAttribute('aria-label', `Confirm approve (${left} seconds): ${p.title}`); paint();
    tick = setInterval(() => { left -= 1; if (left <= 0) { disarm(); } else paint(); }, 1000);
    armTimer = setTimeout(disarm, ARM_SECONDS * 1000 + 50);
    timers.push(armTimer);
  };
  approveBtn.addEventListener('click', async () => {
    if (p.hot && !armed) { arm(); return; }
    clearTimeout(armTimer); clearInterval(tick);
    await decide(p, 'approve', '', el, approveBtn, declineBtn, outcome, reload);
  });
  declineBtn.addEventListener('click', async () => {
    if (armed) disarm();
    const note = await promptDialog({ title: 'Decline proposal', message: p.title, label: 'Why (optional)', placeholder: 'Goes into the audit row and back to the agent.', confirmText: 'Decline', danger: true });
    if (note === null) return;
    await decide(p, 'decline', note, el, approveBtn, declineBtn, outcome, reload);
  });
  return el;
}

async function decide(p, decision, note, el, approveBtn, declineBtn, outcome, reload) {
  approveBtn.disabled = true; declineBtn.disabled = true; approveBtn.classList.add('busy');
  outcome.hidden = false; clear(outcome); outcome.append(h('span.live-dot.checking'), decision === 'approve' ? 'Recording approval…' : 'Recording decline…');
  try {
    const d = await call('iris2_decide', { p_kind: 'proposal', p_id: p.id, p_decision: decision, p_note: note || '' }, { dedupe: false });
    el.classList.add('leaving');
    setTimeout(() => { el.remove(); if (!el.parentNode) { /* removed */ } }, 260);
    const t = toast({ title: decision === 'approve' ? 'Approved · sent to the executor' : 'Declined', message: `${p.title} · status ${d?.status || decision}`, kind: 'success', duration: decision === 'approve' ? 12000 : 4200 });
    emit('mission:decided', { id: p.id, decision });
    refreshCounts();
    if (decision === 'approve') pollExecutor(p, t);
    // if the list is now empty, redraw to show the empty state
    setTimeout(() => { const list = document.querySelector('.proposal') ? null : document.querySelector('.card.glow .list'); if (list && !list.children.length) list.append(emptyState('Nothing needs you', 'Every structured proposal has been decided.')); }, 300);
  } catch (e) {
    approveBtn.disabled = false; declineBtn.disabled = false; approveBtn.classList.remove('busy');
    clear(outcome); outcome.append(iconEl('alert'), h('span', { style: { color: 'var(--sev-high-ink)' } }, `${e.code || 'error'}: ${e.message}`));
    if (e.code === 'conflict') { toast({ title: 'Already decided', message: 'This proposal was decided elsewhere (another tab?). Refreshing.', kind: 'warn' }); setTimeout(reload, 800); }
  }
}

async function refreshCounts() {
  try {
    const d = await call('iris2_mission', {}, { dedupe: false }); setKpis(d.kpis);
    const ny = d.kpis?.needs_you || {}; const tile = document.querySelector('[data-role="mission-kpis"] .kpi');
    if (tile) {
      const v = tile.querySelector('.v'); const sub = tile.querySelector('.s');
      if (v) { v.textContent = fmt.int(ny.total || 0); v.classList.toggle('tone-bad', (ny.total || 0) > 0); v.classList.toggle('tone-good', !(ny.total || 0)); }
      if (sub) sub.textContent = [ny.proposals ? `${ny.proposals} proposal${ny.proposals === 1 ? '' : 's'}` : null, ny.content ? `${ny.content} draft${ny.content === 1 ? '' : 's'}` : null, ny.claims ? `${ny.claims} claim${ny.claims === 1 ? '' : 's'}` : null, ny.builds ? `${ny.builds} build${ny.builds === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || 'inbox clear';
    }
  } catch { /* ignore */ }
}

/** After an approval, read the proposal's real outcome (brain.proposals.status/result via iris2_decisions.recent) into the toast. */
async function pollExecutor(p, t) {
  const check = async () => {
    const d = await call('iris2_decisions', { p_kind: 'proposal', p_limit: 5 }, { dedupe: false });
    return (d.recent || []).find((r) => r.kind === 'proposal' && String(r.id) === String(p.id)) || null;
  };
  try {
    let r = null;
    for (const wait of [2500, 4500, 8000]) {
      await sleep(wait);
      r = await check();
      if (r && r.outcome !== 'awaiting executor') break;
      t.update('Approved · executor working', `${p.title} · ${r ? r.outcome : 'decision recorded'}…`, 'info');
    }
    if (!r) t.update('Approved', `${p.title} · the decision is recorded; the executor has not reported yet.`, 'warn');
    else if (r.outcome === 'executed') t.update('Executed', `${p.title} · ${r.result && r.result.already ? `nothing to do (${r.result.note || 'already ' + r.result.already})` : 'carried out by the executor'}.`, 'success');
    else if (r.outcome === 'failed') t.update('Execution FAILED', `${p.title} · ${r.error || 'no error recorded'}. It is listed under "Execution failed" on Mission.`, 'error', 15000);
    else t.update('Approved · awaiting executor', `${p.title} · the executor sweeps hourly if the webhook did not fire.`, 'warn');
  } catch (e) { t.update('Approved', `Could not confirm the executor outcome (${e.code || 'error'}). The decision itself is recorded.`, 'warn'); }
}
