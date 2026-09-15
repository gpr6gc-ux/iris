// Today — the phone command view. A glanceable, thumb-first column: what needs you, one-tap
// approve/snooze, spend + gates, and a Tell-IRIS bar. Reuses iris2_mission + iris2_mission_tower.

import { h, fmt, clear } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { href } from '../router.js';
import { toast } from '../ui.js';
import { load } from './_common.js';
import { setCount } from '../store.js';
import { mountBetterNote } from './_better.js';

const TOWER_TONE = { critical: 'bad', warn: 'bad', watch: 'warn', info: 'neutral' };

export function render(root, route) {
  const bannerHost = h('div', { dataset: { role: 'autonomy-banner' } });
  const host = h('div.today');
  root.append(bannerHost, host);
  loadPausedBanner(bannerHost);
  load(host, 'iris2_mission', {}, draw);
  return () => {};
}

// V4 kill-switch banner on the phone command view. Best-effort + isolated.
async function loadPausedBanner(host) {
  try {
    const d = await call('iris2_autonomy', {}, { dedupe: true });
    const p = d && d.paused;
    if (p && p.global) {
      clear(host);
      host.append(h('div.paused-banner', iconEl('stop'),
        h('div.grow', h('b', 'Autonomy paused'), h('span', ' · agents halted')),
        h('a.btn.btn-sm', { href: href('/autonomy') }, 'Autonomy')));
    }
  } catch { /* best-effort */ }
}

function draw(data, host) {
  const k = (data && data.kpis) || {};
  const ny = k.needs_you || {};
  const gates = k.gates || {};
  const now = new Date();
  const hr = now.getHours();
  const greeting = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const total = ny.total || 0;
  try { setCount('needsYou', total || null); } catch { /* ignore */ }
  const spend = k.spend_today_usd || 0; const cap = k.spend_cap_usd || 10;

  host.append(
    h('div.today-head', h('div.tg', greeting), h('div.td', dateStr)),
    h('div.today-hero', { class: total ? 'has' : 'clear' },
      h('div.n', fmt.int(total)),
      h('div.l', total === 1 ? 'thing needs your decision' : 'things need your decision')),
    h('div.today-stats',
      stat('Spend today', fmt.money(spend, 2), `of ${fmt.money(cap, 0)} · ${fmt.int(Math.round((spend / cap) * 100))}%`, spend > cap * 0.8 ? 'warn' : 'good'),
      stat('Gates', `${gates.green != null ? gates.green : '—'}/${gates.total != null ? gates.total : '—'}`,
        (gates.green === gates.total && gates.total) ? 'all green' : 'check', (gates.green === gates.total && gates.total) ? 'good' : 'warn')));

  // How IRIS got better — the owner's one requested read, compact for the thumb.
  const betterHost = h('div');
  host.append(betterHost);
  mountBetterNote(betterHost, { compact: true });

  const towerHost = h('div.today-tower');
  host.append(towerHost);
  loadTower(towerHost);

  host.append(tellBar());
}

function stat(label, value, sub, tone) {
  return h('div.today-stat', { class: `tone-${tone || 'neutral'}` },
    h('div.sv', value), h('div.sl', label), sub ? h('div.ss', sub) : null);
}

async function loadTower(host) {
  clear(host);
  host.append(h('div.today-sec', 'Needs your attention'));
  const list = h('div.today-list');
  host.append(list, h('div.today-note', 'Ranked by urgency — severity × how long it has waited. No model sets these numbers.'));
  try {
    const d = await call('iris2_mission_tower', {}, { dedupe: false });
    const items = (d && d.items) || [];
    clear(list);
    if (!items.length) { list.append(h('div.today-allclear', iconEl('check'), h('span', 'All clear — nothing needs you right now.'))); return; }
    for (const it of items) list.append(towerCard(it, host));
  } catch (e) {
    // A10: an error is NOT the same as "none open". Say so, and offer a retry.
    clear(list);
    list.append(h('div.today-allclear.tone-bad', iconEl('info'),
      h('span', `Couldn’t load attention items — ${e && e.message ? String(e.message).slice(0, 80) : 'try again'}. `),
      h('button.tbtn', { type: 'button', onclick: () => loadTower(host) }, 'Retry')));
  }
}

function towerCard(it, host) {
  const tone = TOWER_TONE[it.severity] || 'neutral';
  const reason = it.detail && (it.detail.reason || it.detail.error);
  const box = h('div.today-item', { class: `tone-${tone}` });
  const ack = h('button.tbtn', { type: 'button' }, 'Ack');
  const snooze = h('button.tbtn', { type: 'button' }, 'Snooze');
  const dismiss = h('button.tbtn.ghost', { type: 'button' }, 'Dismiss');
  box.append(
    h('div.ti-top',
      h('span.ti-score', { class: tone, title: it.why || 'deterministic urgency score' }, fmt.int(Math.round(it.score || 0))),
      h('div.ti-title', it.title || '—')),
    reason ? h('div.ti-reason', String(reason).slice(0, 150)) : null,
    h('div.ti-actions', ack, snooze, dismiss));
  const act = async (action, hours) => {
    ack.disabled = snooze.disabled = dismiss.disabled = true;
    try {
      await call('iris2_mission_act', { p_id: it.id, p_action: action, p_snooze_hours: hours || 24 }, { dedupe: false });
      box.classList.add('leaving');
      setTimeout(() => loadTower(host), 220);
    } catch (e) {
      ack.disabled = snooze.disabled = dismiss.disabled = false;
      toast({ title: 'Could not update', message: e.message || 'error', kind: 'warn' });
    }
  };
  ack.addEventListener('click', () => act('ack'));
  snooze.addEventListener('click', () => act('snooze', 24));
  dismiss.addEventListener('click', () => act('dismiss'));
  return box;
}

function tellBar() {
  const input = h('input.today-tell-input', { type: 'text', placeholder: 'Tell IRIS anything…', 'aria-label': 'Tell IRIS', autocomplete: 'off' });
  const send = h('button.today-tell-send', { type: 'button', 'aria-label': 'Send' }, iconEl('send'));
  const submit = async () => {
    const note = input.value.trim();
    if (!note) return;
    input.value = ''; input.disabled = send.disabled = true;
    try {
      await call('iris2_tell', { p_note: note }, { dedupe: false });
      toast({ title: 'Sent to IRIS', message: 'It lands in your queue for IRIS to pick up — track it in Decisions.', kind: 'success' });
    } catch (e) {
      toast({ title: 'Could not send', message: e.message || 'error', kind: 'warn' });
      input.value = note;
    } finally { input.disabled = send.disabled = false; }
  };
  send.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  return h('div.today-tell', input, send);
}
