// Revenue (Revenue.dc.html): KPIs, lanes with readiness, channel switches (confirm when turning ON), content queue with
// approve/reject, the owner-only checklist.

import { h, fmt, clear, truncate, extLink } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { setCount } from '../store.js';
import { toast, confirmDialog, promptDialog, pill, emptyState, switchEl, segmented, steps } from '../ui.js';
import { load, card, kpi, statePill, agentPill } from './_common.js';
import { openDetail } from './decisions.js';

export function render(root) {
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_revenue', {}, draw);
  return () => {};
}

function draw(d, host, reload) {
  const k = d.kpis || {}; const lanes = d.lanes || []; const channels = d.channels || []; const q = d.queue || {};
  setCount('revenue', k.awaiting_approval || 0);
  const anyOn = channels.some((c) => c.auto_publish);
  host.append(h('div.kpis',
    kpi('revenue', 'Revenue · 30 days', fmt.money(k.revenue_30d_usd, 0), k.revenue_30d_usd ? 'ledger · real payments only' : 'ledger empty · first offer pending'),
    kpi('inbox', 'Awaiting approval', fmt.int(k.awaiting_approval), (q.scored || []).length ? `${channelLabelOf(q.scored[0].channel_key, channels)} drafts · quality ${Math.min(...q.scored.map((i) => i.quality_score))}–${Math.max(...q.scored.map((i) => i.quality_score))}` : 'nothing scored yet', k.awaiting_approval ? 'warn' : ''),
    kpi('clock', 'Scheduled · published', `${fmt.int(k.scheduled)} · ${fmt.int(k.published)}`, anyOn ? `${channels.filter((c) => c.auto_publish).length} channel${channels.filter((c) => c.auto_publish).length === 1 ? '' : 's'} ON` : 'all channels OFF (draft mode)'),
    kpi('wallet', 'Cost per draft', fmt.money(k.cost_per_draft_usd, 3), 'generation + critic · governed')));

  // ---- lanes + channels
  const laneRows = lanes.slice().sort((a, b) => (a.priority || 99) - (b.priority || 99)).map((l) => {
    const tone = l.readiness_pct > 15 ? (l.status === 'active' ? 'primary' : 'good') : 'info';
    return h('tr', h('td.wrap', h('div.lane-title', l.title), h('div.lane-offer', l.offer)), h('td.num', fmt.int(l.drafts)), h('td.num.nowrap', l.monthly_target_usd ? `${fmt.money(l.monthly_target_usd, 0)} / mo` : '$0 direct'),
      h('td', { style: { width: '180px' } }, h('div.bar-cell', h('div.bar', h('i', { class: tone === 'primary' ? '' : tone, style: { width: `${l.readiness_pct || 0}%` } })), h('span.val', `${fmt.int(l.readiness_pct)}%`))),
      h('td', pill(l.readiness_pct > 15 ? 'active' : 'needs you', `status ${l.readiness_pct > 15 ? (tone === 'primary' ? 'primary' : 'good') : 'neutral'}`)));
  });
  const lanesCard = card(h('h2', 'Lanes'), 'ranked · monthly target is an estimate, not a promise', lanes.length ? h('div.tbl-wrap', h('table.tbl', h('thead', h('tr', h('th', 'Lane · offer'), h('th.num', 'Drafts'), h('th.num', 'Target'), h('th', 'Readiness'), h('th', 'State'))), h('tbody', laneRows))) : emptyState('No lanes yet', 'Lanes are seeded in rev.lanes.'), { flush: true, cls: 'f17' });
  lanesCard.querySelector('.card-head').style.padding = '14px 16px 6px';

  const chRows = channels.map((c) => channelRow(c, reload));
  const chCard = card(h('h2', 'Channel switches'), 'the only thing that lets an agent post', [h('div.list', chRows.length ? chRows : emptyState('No channels', 'rev.channels is empty.')), h('div.foot-note', 'Approval alone never posts. Flip a switch and approved items publish on their schedule; flip it off and they hold.')], { glow: true });
  host.append(h('div.row.wrap-md', lanesCard, h('div.col.f1', chCard)));

  // ---- queue + owner actions
  const queueList = h('div.list');
  let seg = 'scored';
  const segEl = segmented([['scored', 'Scored'], ['approved', 'Approved'], ['scheduled', 'Scheduled'], ['published', 'Published']].map(([key, label]) => ({ key, label, count: (q[key] || []).length })), seg, (k2) => { seg = k2; paintQueue(); }, { label: 'Queue state' });
  const paintQueue = () => {
    clear(queueList);
    const items = q[seg] || [];
    if (!items.length) { queueList.append(emptyState(seg === 'scored' ? 'Nothing waiting for approval' : `Nothing ${seg}`, seg === 'scored' ? 'The generator runs daily; scored drafts land here.' : seg === 'approved' ? 'Approve a scored draft and it appears here (held until its channel is ON).' : seg === 'scheduled' ? 'Approved items get a slot once their channel switch is ON.' : 'Published items report metrics 24 h after posting.')); return; }
    for (const it of items) queueList.append(queueRow(it, seg, channels, reload));
  };
  paintQueue();
  const queueCard = card(h('h2', 'Content queue'), segEl, queueList, { cls: 'f1' });
  const acts = (d.owner_actions || []).filter((a) => !a.done);
  const doneN = (d.owner_actions || []).filter((a) => a.done).length;
  const actCard = card(h('h2', 'Only you can do these'), `unblock the lanes${doneN ? ` · ${doneN} done` : ''}`, acts.length ? steps(acts.map((a) => a.text)) : emptyState('Nothing blocked on you', 'Every lane has what it needs.'), { cls: 'f08' });
  host.append(h('div.row.wrap-md', queueCard, actCard));

  if ((d.offers || []).length) {
    host.append(card(h('h2', 'Offers'), 'price tags · live only when the payment link exists', h('div.tbl-wrap', h('table.tbl.compact', h('thead', h('tr', h('th', 'Offer'), h('th', 'Lane'), h('th.num', 'Price'), h('th', 'Status'), h('th', 'Link'))), h('tbody', d.offers.map((o) => h('tr', h('td', h('b', o.name)), h('td.muted', o.lane_key), h('td.num', fmt.money(o.price_usd, 0)), h('td', statePill(o.status)), h('td', o.url ? extLink(o.url, iconEl('external', 'ic-14'), ' ', String(o.url).replace(/^https?:\/\//, '')) : h('span.muted', 'payment link needed'))))))), { flush: true }));
    host.lastChild.querySelector('.card-head').style.padding = '14px 16px 6px';
  }
}

function channelRow(c, reload) {
  const sw = switchEl(!!c.auto_publish, async (next) => {
    if (next) {
      const ok = await confirmDialog({ title: `Turn ${c.key} ON?`, message: 'Approved items on this channel will publish on schedule. Items approved while the switch was OFF are released now.', confirmText: 'Turn on auto-publish', glow: true, body: !c.credential_present ? h('div.notice.warn', iconEl('alert'), h('span', `The credential ${c.credential_ref ? `“${c.credential_ref}”` : ''} is not present in n8n yet — the publisher will fail until it exists.`)) : null });
      if (!ok) return false;
    }
    try {
      const d = await call('iris2_rev_channel_set', { p_channel_key: c.key, p_auto_publish: next }, { dedupe: false });
      toast({ title: `${c.key} · auto-publish ${next ? 'ON' : 'OFF'}`, message: next ? `${fmt.int(d?.released || 0)} held item${d?.released === 1 ? '' : 's'} released to the schedule.` : `Queued items on this channel are held.`, kind: 'success' });
      setTimeout(reload, 200);
      return true;
    } catch (e) { toast({ title: 'Switch failed', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); return false; }
  }, { label: `Auto-publish ${c.key}`, disabled: c.enabled === false });
  return h('div.item.channel-row', h('div.txt', h('b', c.key), h('span.sub', `${c.label}${c.note ? ` · ${c.note}` : ''}${c.enabled === false ? ' · disabled' : ''}`)), h('div.sw', { class: c.auto_publish ? 'on' : '' }, sw, h('span', `auto-publish ${c.auto_publish ? 'ON' : 'OFF'}`)));
}

function queueRow(it, seg, channels, reload) {
  const ch = channels.find((c) => c.key === it.channel_key);
  const meta = [it.channel_key, it.chars ? `${fmt.int(it.chars)} chars` : null, it.quality_pass === false ? 'quality fail' : null, it.critic_score != null ? `critic ${fmt.int(it.critic_score)}` : null, seg === 'approved' && it.held ? 'held · channel OFF' : null, it.scheduled_at ? `scheduled ${fmt.date(it.scheduled_at)}` : null, it.published_at ? `published ${fmt.date(it.published_at)}` : null].filter(Boolean).join(' · ');
  const row = h('div.item.queue-row.stripe-LLM', h('div.grow', h('div.title', it.title), h('div.sub', meta)), pill(fmt.int(it.quality_score), `status ${it.quality_pass === false ? 'bad' : it.quality_score >= 90 ? 'good' : 'warn'} nodot score`));
  if (seg === 'scored') {
    row.append(h('div.actions',
      h('button.btn.btn-sm.btn-primary', { type: 'button', 'aria-label': `Approve ${truncate(it.title, 50)}`, onclick: () => decideContent(it, 'approve', '', reload) }, 'Approve'),
      h('button.btn.btn-sm.btn-ghost', { type: 'button', 'aria-label': `Reject ${truncate(it.title, 50)}`, onclick: async () => { const n = await promptDialog({ title: 'Reject draft', message: it.title, label: 'Why (optional)', confirmText: 'Reject', danger: true }); if (n !== null) decideContent(it, 'reject', n, reload); } }, 'Reject')));
    row.classList.add('clickable');
    row.addEventListener('click', (e) => { if (e.target.closest('button')) return; openContent(it, ch, reload); });
  } else if (it.external_url) row.append(extLink(it.external_url, iconEl('external', 'ic-14'), ' open'));
  return row;
}

async function decideContent(it, decision, note, reload) {
  try {
    const d = await call('iris2_decide', { p_kind: 'content', p_id: it.id, p_decision: decision, p_note: note || '' }, { dedupe: false });
    toast({ title: `Draft ${d?.status || decision}`, message: decision === 'approve' ? 'Publishes only when its channel switch is ON.' : truncate(it.title, 80), kind: 'success' });
    reload();
  } catch (e) { toast({ title: `Could not ${decision}`, message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); if (e.code === 'conflict') reload(); }
}

/** Open the full content detail from the Decisions inbox (same drawer as Decisions). */
async function openContent(it, ch, reload) {
  try {
    const d = await call('iris2_decisions', { p_kind: 'content', p_limit: 200 });
    const full = (d.items || []).find((x) => String(x.id) === String(it.id));
    if (full) openDetail(full, reload);
    else toast({ title: 'Draft not in the inbox', message: 'It may have been decided already.', kind: 'warn' });
  } catch (e) { toast({ title: 'Could not open', message: e.message, kind: 'error' }); }
}
const channelLabelOf = (key, channels) => { const c = channels.find((x) => x.key === key); return c ? c.label.split(' · ')[0] : key; };
