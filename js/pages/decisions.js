// Decisions (Decisions.dc.html): one inbox for proposals, content, claims and builds. Row → 480px drawer with the
// kind-specific detail; inline quick actions; bulk actions for claims.

import { h, fmt, clear, extLink, truncate } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { setKpis } from '../store.js';
import { parseHash, setParams, href } from '../router.js';
import { toast, openPanel, closePanel, promptDialog, confirmDialog, pill, sevPill, steps, emptyState, skeleton } from '../ui.js';
import { load, card, agentPill, kindPill, riskPill, srcLink, skelRows } from './_common.js';

const KINDS = [['all', 'All'], ['proposal', 'Proposals'], ['content', 'Content'], ['claim', 'Claims'], ['build', 'Builds']];
const ACTIONS = {
  proposal: { yes: ['approve', 'Approve'], no: ['decline', 'Decline'], extra: null },
  content: { yes: ['approve', 'Approve'], no: ['reject', 'Reject'], extra: ['hold', 'Hold'] },
  claim: { yes: ['accept', 'Accept'], no: ['dismiss', 'Dismiss'], extra: ['keep', 'Keep'] },
  build: { yes: ['approve', 'Approve to build'], no: ['decline', 'Not now'], extra: null },
};

export function render(root, route) {
  const host = h('div.stack');
  root.append(host);
  const kind = KINDS.some(([k]) => k === route.params.get('kind')) ? route.params.get('kind') : 'all';
  const selected = new Set();
  draw(host, kind, selected, route.params.get('open'));
  return () => {};
}

async function draw(host, kind, selected, openId) {
  await load(host, 'iris2_decisions', { p_kind: kind, p_limit: 200 }, (d, el, reload) => {
    const counts = d.counts || {}; const items = d.items || [];
    const seg = h('div.seg', { role: 'tablist', 'aria-label': 'Kind' }, KINDS.map(([k, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': k === kind ? 'true' : 'false', 'aria-pressed': k === kind ? 'true' : 'false', onclick: () => { setParams((p) => { if (k === 'all') p.delete('kind'); else p.set('kind', k); p.delete('open'); }); selected.clear(); draw(host, k, selected); } }, label, h('span.cnt', `· ${fmt.int(counts[k] ?? 0)}`))));
    const right = h('div.right');
    // Bulk decisions act on what you selected, never on "everything shown" (P0-03): on 2026-09-05 one click promoted 187 unread claims to facts.
    if ((kind === 'claim' || kind === 'all') && items.some((i) => i.kind === 'claim')) right.append(h('span.small.muted', { title: 'Tick the claims you have read; the bulk bar appears below. At most 25 per batch.' }, 'select claims to decide in bulk'));
    const failedN = Number(d.failed_executions || 0);
    right.append(h('button.btn.btn-sm.btn-ghost', { type: 'button', class: failedN ? 'btn-danger' : '', onclick: () => openRecent(d.recent || [], failedN) }, iconEl('clock'), `Recent decisions${failedN ? ` · ${failedN} failed` : ''}`));
    el.append(h('div.inbox-toolbar', seg, right));

    // Claims are judged by the reviewer agent, not by the owner (2026-09-13: "if a claim is good, we add it.
    // if not we discard it automatically"). The tab stays for a deliberate look; the note says what is happening.
    const ct = counts.claims_triage;
    if (kind === 'claim' && ct) {
      el.append(h('div.triage-note', iconEl('sparkles', 'ic-14'),
        h('div.grow', h('b', 'These are judged for you. '),
          h('span', `Every 4 hours the reviewer keeps only what changes what IRIS does or knows and discards the rest, with the reason on record. `
            + `Last 7 days: ${fmt.int(ct.kept_7d || 0)} kept, ${fmt.int(ct.discarded_7d || 0)} discarded`
            + (ct.last_run ? ` · last judged ${fmt.ago(ct.last_run)}` : '') + `. Deciding one here is an override, not a duty.`)),
        h('a.btn.btn-sm', { href: href('/mission') }, 'How IRIS got better')));
    }

    const bulkBar = h('div.bulk-bar', { hidden: true });
    el.append(bulkBar);
    const titleOf = new Map(items.map((i) => [i.id, i.title]));
    const selTitles = () => [...selected].map((id) => titleOf.get(id) || id);
    const paintBulk = () => {
      const n = selected.size; bulkBar.hidden = n === 0; clear(bulkBar);
      if (!n) return;
      bulkBar.append(h('span.grow', h('b', `${n} claim${n === 1 ? '' : 's'} selected`), n > BULK_MAX ? h('span.small.muted', ` · max ${BULK_MAX} per batch`) : null),
        h('button.btn.btn-sm.btn-primary', { type: 'button', disabled: n > BULK_MAX, onclick: () => bulk('claim', [...selected], 'accept', reload, selTitles()) }, iconEl('check'), 'Accept selected'),
        h('button.btn.btn-sm', { type: 'button', disabled: n > BULK_MAX, onclick: () => bulk('claim', [...selected], 'keep', reload, selTitles()) }, 'Keep'),
        h('button.btn.btn-sm.btn-ghost', { type: 'button', disabled: n > BULK_MAX, onclick: () => bulk('claim', [...selected], 'dismiss', reload, selTitles()) }, 'Dismiss'),
        h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => { selected.clear(); paintBulk(); el.querySelectorAll('input.check').forEach((c) => { c.checked = false; }); } }, 'Clear'));
    };

    if (!items.length) {
      el.append(card(null, null, kind === 'claim'
        ? emptyState('No claims waiting for the judge', 'The queue is empty. New claims are judged within four hours of being filed; what was kept, and why, is on Mission under “How IRIS got better”.')
        : emptyState(kind === 'all' ? 'Inbox clear' : `No ${KINDS.find(([k]) => k === kind)[1].toLowerCase()} waiting`, 'New items appear the moment an agent files them. Nothing is executed without a decision here.')));
      return;
    }

    const hasClaims = items.some((i) => i.kind === 'claim');
    const tbody = h('tbody');
    for (const it of items) {
      const a = ACTIONS[it.kind] || ACTIONS.proposal;
      const tr = h('tr.clickable', { tabindex: 0, dataset: { id: it.id }, 'aria-label': `${it.kind}: ${it.title}` });
      const open = () => { tbody.querySelectorAll('tr').forEach((r) => r.classList.toggle('selected', r === tr)); setParams((p) => p.set('open', it.id)); openDetail(it, reload, () => { tr.classList.remove('selected'); setParams((p) => p.delete('open')); }); };
      tr.addEventListener('click', (e) => { if (e.target.closest('button, input, a')) return; open(); });
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      const check = it.kind === 'claim' ? h('input.check', { type: 'checkbox', 'aria-label': `Select claim ${truncate(it.title, 40)}`, onchange: (e) => { if (e.target.checked) selected.add(it.id); else selected.delete(it.id); paintBulk(); } }) : null;
      if (check && selected.has(it.id)) check.checked = true;
      tr.append(
        hasClaims ? h('td', { style: { width: '32px', paddingRight: 0 } }, check) : null,
        h('td', kindPill(it.kind)),
        h('td.fill', h('span.title-cell', { title: it.title }, it.title)),
        h('td.muted.nowrap.hide-sm', it.by),
        h('td.mono-cell.hide-sm', it.signal || '—'),
        h('td.hide-sm', sevPill(it.severity)),
        h('td.muted.nowrap.hide-sm', fmt.time(it.at)),
        h('td.actions.hide-sm',
          h('button.btn.btn-sm.btn-primary', { type: 'button', 'aria-label': `${a.yes[1]}: ${it.title}`, title: a.yes[1], onclick: () => act(it, a.yes[0], reload, tr) }, iconEl('check')),
          ' ',
          h('button.btn.btn-sm', { type: 'button', 'aria-label': `${a.no[1]}: ${it.title}`, title: a.no[1], onclick: () => act(it, a.no[0], reload, tr, true) }, iconEl('close'))));
      tbody.append(tr);
    }
    const table = h('table.tbl', h('thead', h('tr', hasClaims ? h('th', { style: { width: '32px' } }, h('span.sr-only', 'Select')) : null, h('th', 'Kind'), h('th.fill', 'Item'), h('th.hide-sm', 'By'), h('th.hide-sm', 'Signal'), h('th.hide-sm', 'Severity'), h('th.hide-sm', 'At'), h('th.hide-sm', h('span.sr-only', 'Actions')))), tbody);
    el.append(h('div.card.flush', h('div.tbl-wrap', table)));
    paintBulk();
    if (openId) { const it = items.find((i) => String(i.id) === String(openId)); if (it) { const tr = tbody.querySelector(`tr[data-id="${CSS.escape(String(it.id))}"]`); if (tr) tr.classList.add('selected'); openDetail(it, reload, () => setParams((p) => p.delete('open'))); } }
  });
}

async function act(it, decision, reload, tr, ask = false) {
  let note = '';
  if (ask) { const n = await promptDialog({ title: `${ACTIONS[it.kind].no[1]} · ${it.kind}`, message: it.title, label: 'Note (optional)', confirmText: ACTIONS[it.kind].no[1], danger: true }); if (n === null) return; note = n; }
  if (tr) tr.classList.add('decided');
  try {
    const d = await call('iris2_decide', { p_kind: it.kind, p_id: it.id, p_decision: decision, p_note: note }, { dedupe: false });
    toast({ title: `${it.kind} · ${d?.status || decision}`, message: it.kind === 'content' && decision === 'approve' ? `${truncate(it.title, 70)} · approved — publishes only when its channel switch is ON.` : truncate(it.title, 90), kind: 'success' });
    closePanel();
    refreshKpis();
    setTimeout(reload, 250);
  } catch (e) {
    if (tr) tr.classList.remove('decided');
    toast({ title: `Could not ${decision}`, message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 });
    if (e.code === 'conflict' || e.code === 'not_found') setTimeout(reload, 600);
  }
}
const BULK_MAX = 25;
async function bulk(kind, ids, decision, reload, titles = null) {
  if (!ids.length) return;
  if (ids.length > BULK_MAX) { toast({ title: `At most ${BULK_MAX} claims per bulk decision`, message: `${ids.length} selected. Decide in batches — every accepted claim becomes a fact agents will cite.`, kind: 'warn', duration: 7000 }); return; }
  const verb = decision === 'accept' ? 'Accept' : decision === 'keep' ? 'Keep' : 'Dismiss';
  const listEl = titles && titles.length ? h('ul', { style: { margin: '8px 0 0', paddingLeft: '18px', maxHeight: '220px', overflow: 'auto' } }, titles.map((t) => h('li', { style: { fontSize: '12px', margin: '2px 0' } }, truncate(t, 110)))) : null;
  const ok = await confirmDialog({ title: `${verb} ${ids.length} claim${ids.length === 1 ? '' : 's'}`, message: h('div', h('div', decision === 'accept' ? 'Accepted claims become facts in the brain and are cited by agents from now on. Each keeps its own kind (signal, capability, lesson…).' : decision === 'dismiss' ? 'Dismissed claims are kept for audit but never surfaced again.' : 'Kept claims stay in the review deck for later.'), listEl), confirmText: `${verb} ${ids.length}`, danger: decision === 'dismiss' });
  if (!ok) return;
  try {
    const d = await call('iris2_decide_bulk', { p_kind: kind, p_ids: ids, p_decision: decision, p_note: '' }, { dedupe: false });
    toast({ title: `${fmt.int(d?.count ?? ids.length)} claims · ${d?.status || decision}`, message: 'Written to the audit log as one bulk decision.', kind: 'success' });
    refreshKpis(); reload();
  } catch (e) { toast({ title: 'Bulk decision failed', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); }
}
async function refreshKpis() { try { const d = await call('iris2_mission', {}, { dedupe: false }); setKpis(d.kpis); } catch { /* ignore */ } }

// ---------------------------------------------------------------- drawer
export function openDetail(it, reload, onClose) {
  const det = it.detail || {}; const a = ACTIONS[it.kind] || ACTIONS.proposal;
  const body = [];
  const kicker = [kindPill(it.kind), it.kind === 'content' ? h('span.muted', `· ${channelLabel(det.channel_key)}`) : null];
  if (it.kind === 'proposal') {
    body.push(h('div.pills', agentPill(it.by), riskPill(det.risk), pill(det.cost_usd == null ? 'cost n/a' : fmt.money(det.cost_usd), 'status primary nodot'), det.kind ? pill(det.kind, 'status neutral nodot mono') : null));
    body.push(section('Steps the executor will take', steps(det.steps || [])));
    if (det.source_url) body.push(section('Source', h('div.source-list', srcLink(det.source_url, det.source_url))));
    body.push(h('div.notice', iconEl('info'), h('span', 'Approving writes the decision and an ', h('b', 'ops.outbox'), ' row {execute_proposal}. The n8n Executor consumes it — the browser never calls n8n.')));
  } else if (it.kind === 'content') {
    const q = det.quality || {}; const c = det.critic || {};
    body.push(h('div.pills', pill(`quality ${fmt.int(q.score)} / ${q.pass ? 'pass' : 'fail'}`, `status ${q.pass ? 'good' : 'bad'}`), pill(`critic ${fmt.int(c.score)} · ${c.verdict || '—'}`, `status ${c.verdict === 'approve' ? 'good' : 'neutral'} nodot`), c.brand_safety != null ? pill(`brand safety ${c.brand_safety}/10`, 'status neutral nodot') : null, pill(`${fmt.int(String(det.body || '').length)} chars`, 'status neutral nodot')));
    body.push(h('div.prose', det.body || '—'));
    body.push(h('div.kv-rows',
      h('div.kv-row', h('span.k', 'Channel'), h('span.v', h('b', det.channel_key || '—'), pill(`auto-publish ${det.channel_auto_publish ? 'ON' : 'OFF'}`, `status ${det.channel_auto_publish ? 'good' : 'warn'}`))),
      det.hook ? h('div.kv-row', h('span.k', 'Hook'), h('span.v', h('span', det.hook))) : null,
      det.cta ? h('div.kv-row', h('span.k', 'CTA'), h('span.v', h('span', det.cta))) : null,
      h('div.kv-row', h('span.k', 'Sources'), h('span.v', h('div.source-list', (det.sources || []).map((s) => srcLink(s.uri, s.title))), !(det.sources || []).length ? h('span.muted', '—') : null))));
    body.push(section('Quality checks', h('div.checks', (q.checks || []).map((k) => h('div.check-row', { class: k.pass ? '' : 'fail' }, iconEl(k.pass ? 'check-circle' : 'alert'), h('span.nm', k.name), h('span.note', k.note || (k.pass ? 'pass' : 'fail')))))));
    body.push(section('Critic (advisory)', h('div.critic', h('div.mini-stat', h('div.k', 'Score'), h('div.v', fmt.int(c.score))), h('div.mini-stat', h('div.k', 'Verdict'), h('div.v', { style: { fontSize: '14px' } }, c.verdict || '—')), h('div.mini-stat', h('div.k', 'Brand safety'), h('div.v', c.brand_safety != null ? `${c.brand_safety}/10` : '—')))));
    body.push(h('div.foot-note', 'Approving moves the item to ', h('b', 'approved'), '. It is published only when the channel switch is ON (Revenue → Channels). Nothing here changes a score.'));
  } else if (it.kind === 'claim') {
    body.push(h('div.pills', pill(det.kind || 'claim', 'status info nodot'), agentPill(it.by), pill(`conf ${fmt.num(det.confidence, 2)}`, 'status neutral nodot mono')));
    body.push(section('Statement', h('p', det.statement || it.title)));
    if (det.detail) body.push(section('Detail', h('div.text-block', det.detail)));
    body.push(section(`Sources · ${(det.sources || []).length}`, h('div.source-list', (det.sources || []).map((s) => srcLink(s.uri, s.title)))));
    body.push(h('div.foot-note', h('b', 'Accept'), ' makes it a fact agents can cite · ', h('b', 'Keep'), ' leaves it in the deck · ', h('b', 'Dismiss'), ' hides it (kept for audit).'));
  } else if (it.kind === 'build') {
    body.push(h('div.pills', agentPill(it.by), det.effort ? pill(`effort ${det.effort}`, 'status neutral nodot') : null, det.impact ? pill(String(det.impact).split(' ')[0] + ' impact', 'status primary nodot') : null));
    body.push(h('div.detail-grid', kvEl('Source repo', det.source_repo), kvEl('For', det.who_for), kvEl('Impact', det.impact), kvEl('Effort', det.effort)));
    body.push(section('What it builds', h('div.text-block', det.what_it_builds || '—')));
    if (det.source_url) body.push(section('Source', h('div.source-list', srcLink(det.source_url, det.source_url))));
    body.push(h('div.foot-note', 'Approving queues the build for the Factory. Nothing deploys without a second decision.'));
  }
  const yes = h('button.btn.btn-primary', { type: 'button', style: { flex: 1 }, onclick: () => act(it, a.yes[0], reload) }, iconEl('check'), a.yes[1]);
  const extra = a.extra ? h('button.btn', { type: 'button', onclick: () => act(it, a.extra[0], reload) }, a.extra[1]) : null;
  const no = h('button.btn.btn-danger', { type: 'button', onclick: () => act(it, a.no[0], reload, null, true) }, a.no[1]);
  openPanel({ kicker, title: it.kind === 'content' ? String(it.title).replace(/^LinkedIn · /, '') : it.title, sub: [agentPill(it.by), h('span', `· ${fmt.date(it.at)}`), it.signal ? h('span.mono', `· ${it.signal}`) : null], body, foot: [yes, extra, no], onClose });
}
const section = (title, ...content) => h('div.detail-section', h('h3', title), ...content);

// Recent decisions with their execution outcome (iris2_decisions.recent ← brain.proposals.status/result, claims, content, builds)
function openRecent(recent, failedN) {
  const outcomeTone = (r) => r.outcome === 'failed' ? 'bad' : r.outcome === 'awaiting executor' ? 'warn' : r.decision === 'decline' || r.decision === 'dismiss' || r.decision === 'reject' ? 'neutral' : 'good';
  const rows = recent.map((r) => h('div.item.plain', { class: `stripe-${outcomeTone(r) === 'bad' ? 'HIGH' : outcomeTone(r) === 'warn' ? 'MEDIUM' : outcomeTone(r) === 'good' ? 'GOOD' : 'LOW'}` },
    h('div.grow', h('div', kindPill(r.kind), ' ', h('b', truncate(r.title || r.id, 90))),
      h('div.sub', `${r.decision || '—'} → `, pill(r.outcome || r.status || '—', `status ${outcomeTone(r)} nodot`), ` · ${fmt.time(r.at)}${r.executed_at && r.executed_at !== r.at ? ` · executed ${fmt.time(r.executed_at)}` : ''}${r.note && r.note !== 'board' ? ` · ${truncate(r.note, 80)}` : ''}`),
      r.error ? h('div.small.bad', { style: { marginTop: '4px' } }, `error: ${truncate(r.error, 160)}`) : null,
      r.result && r.result.superseded_by ? h('div.small.muted', 'closed automatically: the same claim was decided directly') : null)));
  openPanel({ kicker: [pill('recent decisions', 'kind kind-proposal')], title: `Last ${recent.length} decisions · 72 h`, sub: [h('span', failedN ? `${failedN} execution${failedN === 1 ? '' : 's'} failed in the last 7 days — each is listed with its error.` : 'Every approval shows what the executor actually did.')], body: rows.length ? [h('div.list.tight', rows)] : [emptyState('No decisions yet', 'Approve, decline, accept or dismiss something and it appears here with its outcome.')], foot: [] });
}
const kvEl = (k, v) => h('div.kv', h('div.k', k), h('div.v', { title: v || '' }, v || '—'));
const channelLabel = (k) => ({ linkedin_greyson: 'LinkedIn', x_karta: 'X', newsletter: 'Newsletter', youtube_iris: 'YouTube', gumroad: 'Gumroad', upwork: 'Upwork', landing_modellens: 'Landing' }[k] || k || 'channel');
