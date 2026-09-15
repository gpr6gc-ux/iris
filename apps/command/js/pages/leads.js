// Leads — the outreach engine. Prospects found by the IRIS scout, each with a deterministically
// drafted one-pager + outreach email. The engine drafts; the owner reviews and sends himself
// (nothing is ever sent from here). Reads iris2_leads / iris2_lead; acts via iris2_lead_act.

import { h, fmt } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { pill, emptyState, openPanel, toast } from '../ui.js';
import { load, card, kpi } from './_common.js';

export function render(root, _route, ctx) {
  if (ctx && ctx.setSub) ctx.setSub('prospects · drafted one-pagers + outreach · you review and send');
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_leads', {}, draw);
  return () => {};
}

const stageTone = (s) => (s === 'won' || s === 'qualified' ? 'good' : s === 'contacted' || s === 'meeting' ? 'primary' : s === 'lost' ? 'bad' : 'neutral');
const outreachTone = (s) => (s === 'sent' ? 'good' : s === 'ready' ? 'warn' : s === 'skipped' ? 'muted' : 'neutral');
const conf = (c) => (c == null ? '—' : Math.round(Number(c) * 100) + '%');

function stagePill(s) { return pill(s || '—', `status ${stageTone(s) === 'good' ? 'good' : stageTone(s) === 'bad' ? 'bad' : stageTone(s) === 'primary' ? 'info' : 'neutral'} nodot`); }
function outreachChip(s) {
  const t = outreachTone(s);
  const label = s === 'none' ? 'no draft' : s;
  return h('span.lead-oc', { class: t }, iconEl(s === 'sent' ? 'check' : s === 'ready' ? 'send' : 'file', 'ic-12'), label);
}

function leadCard(l, reload) {
  return h('div.lead-card.clickable', { class: stageTone(l.stage), tabindex: 0,
    onclick: () => openLead(l.id, reload),
    onkeydown: (e) => { if (e.key === 'Enter') openLead(l.id, reload); } },
    h('div.lead-top',
      h('div.lead-id', h('b', l.org_name), stagePill(l.stage)),
      outreachChip(l.outreach_status)),
    h('div.lead-sub', [l.industry, l.locality].filter(Boolean).join(' · ') || '—'),
    l.angle ? h('div.lead-angle', iconEl('target', 'ic-12'), h('span', l.angle)) : null,
    h('div.lead-foot',
      h('span.lead-conf', { title: 'scout confidence' }, 'conf ' + conf(l.confidence)),
      l.value_estimate != null ? h('span.lead-val.num', fmt.money(l.value_estimate)) : null,
      l.employee_band ? h('span.lead-emp.muted.small', l.employee_band) : null));
}

function draw(d, host, reload) {
  const leads = d.leads || [];
  const c = d.counts || {};
  const o = d.outreach || {};

  host.append(h('div.kpis',
    kpi('inbox', 'Active leads', fmt.int(c.total), `${fmt.int(c.qualified)} qualified · ${fmt.int(c.candidate)} candidate`, c.total ? 'primary' : ''),
    kpi('revenue', 'Pipeline value', '$' + fmt.compact(c.pipeline_value || 0), 'sum of scout estimates', c.pipeline_value ? 'good' : ''),
    kpi('file', 'Drafts ready', fmt.int((o.ready || 0)), `${fmt.int(o.draft || 0)} in draft · you review & send`, o.ready ? 'warn' : ''),
    kpi('check', 'Sent', fmt.int(o.sent || 0), `${fmt.int(c.contacted)} moved to contacted`, o.sent ? 'good' : '')));

  host.append(h('div.notice', iconEl('info'), h('span', h('b', 'The engine drafts; you send. '),
    'Every prospect below was found by the scout with evidence from its own site. Open any lead for its one-pager and a ready-to-send email — nothing leaves here until you send it yourself.')));

  const grid = leads.length
    ? h('div.lead-grid', leads.map((l) => leadCard(l, reload)))
    : emptyState('No active leads', 'The prospecting scout has not filed any leads yet.');
  host.append(card(
    h('h2', [iconEl('send', 'ic-16'), ' Prospect pipeline']),
    h('span.hint-text', `${leads.length} active · ranked by confidence × value`),
    [grid], { cls: 'f1' }));

  host.append(h('div.foot-note', d.note || ''));
}

async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); toast({ title: 'Copied', message: label || 'Copied to clipboard', kind: 'success', duration: 2200 }); }
  catch (e) { toast({ title: 'Copy failed', message: 'Select and copy manually.', kind: 'warn' }); }
}

async function act(id, action, value, reload) {
  try {
    await call('iris2_lead_act', { p_id: id, p_action: action, p_value: value || null }, { dedupe: false });
    toast({ title: 'Updated', message: `Lead ${action}`, kind: 'success', duration: 2000 });
    openLead(id, reload); // re-open with fresh data
    if (reload) reload();  // refresh the list underneath
  } catch (e) { toast({ title: 'Could not update', message: `${e.code || 'error'}: ${e.message}`, kind: 'error' }); }
}

async function openLead(id, reload) {
  let d;
  try { d = (await call('iris2_lead', { p_id: id }, { dedupe: false })); }
  catch (e) { toast({ title: 'Could not load', message: `${e.code || 'error'}: ${e.message}`, kind: 'error' }); return; }
  const l = d || {};
  const o = l.outreach || null;
  const op = (o && o.one_pager) || {};
  const meta = op.meta || {};
  const status = o ? o.status : 'none';

  const kv = (k, v) => (v == null || v === '' ? null : h('div.kv', h('div.k', k), h('div.v', v)));
  const section = (title, node) => h('div.op-sec', h('h3.dd-h', title), node);

  // the drafted email — the core deliverable
  const emailBlock = o && o.email_body
    ? h('div.email-draft',
        h('div.email-head',
          h('div.email-subj', h('span.k', 'Subject'), h('span.v', o.email_subject || '—')),
          h('button.btn.btn-sm', { type: 'button', onclick: () => copyText(`Subject: ${o.email_subject}\n\n${o.email_body}`, 'Email copied') }, iconEl('copy', 'ic-14'), 'Copy email')),
        h('pre.email-body', o.email_body))
    : h('div.small.muted', 'No draft yet — use Regenerate.');

  const talk = (op.talk_track || []);

  openPanel({
    kicker: [
      stagePill(l.stage),
      pill(`${status}`, `status ${outreachTone(status) === 'good' ? 'good' : outreachTone(status) === 'warn' ? 'warn' : 'neutral'} nodot`),
      l.confidence != null ? pill(`conf ${conf(l.confidence)}`, 'status neutral nodot') : null,
    ],
    title: `${l.org_name}`,
    sub: [h('span', [l.industry, l.locality].filter(Boolean).join(' · ') || '—')],
    body: [
      op.headline ? h('div.op-headline', op.headline) : null,
      // ---- the email draft ----
      section('Outreach email — you send it', emailBlock),
      // ---- the one-pager ----
      op.opportunity ? section('Opportunity', h('p.op-p', op.opportunity)) : null,
      op.situation ? section('Situation (their own words)', h('p.op-p.muted', op.situation)) : null,
      op.build ? section('What we’d build', h('p.op-p', op.build)) : null,
      op.outcome ? section('Outcome', h('p.op-p', op.outcome)) : null,
      talk.length ? section('Talk track', h('ul.op-talk', talk.map((t) => h('li', t)))) : null,
      h('div.detail-grid',
        kv('Est. value', meta.est_value || (l.value_estimate != null ? fmt.money(l.value_estimate) : '—')),
        kv('Size', l.employee_band),
        kv('Stage', l.stage),
        kv('Found by', l.found_by),
        kv('Source', (op.source_url || l.source_url || l.website) ? h('a.op-link', { href: op.source_url || l.source_url || l.website, target: '_blank', rel: 'noopener noreferrer' }, 'open ↗') : '—')),
      // ---- owner actions ----
      h('h3.dd-h', 'Actions'),
      h('div.op-actions',
        status !== 'ready' ? h('button.btn.btn-sm', { type: 'button', onclick: () => act(id, 'ready', null, reload) }, iconEl('check', 'ic-14'), 'Mark ready') : null,
        status !== 'sent' ? h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: () => act(id, 'sent', null, reload) }, iconEl('send', 'ic-14'), 'I sent it') : null,
        h('button.btn.btn-sm', { type: 'button', onclick: () => act(id, 'regenerate', null, reload) }, iconEl('refresh', 'ic-14'), 'Regenerate'),
        status === 'sent' || status === 'skipped' ? h('button.btn.btn-sm', { type: 'button', onclick: () => act(id, 'reopen', null, reload) }, 'Reopen') : h('button.btn.btn-sm', { type: 'button', onclick: () => act(id, 'skip', null, reload) }, 'Skip'),
        h('button.btn.btn-sm', { type: 'button', onclick: () => act(id, 'stage', l.stage === 'qualified' ? 'meeting' : 'qualified', reload) }, iconEl('arrow', 'ic-14'), l.stage === 'qualified' ? 'Move to meeting' : 'Mark qualified')),
      h('div.foot-note', 'Drafted deterministically from the scout’s evidence — no model writes copy at runtime. Nothing is sent from IRIS; “I sent it” just records that you did and moves the lead to contacted.'),
    ],
  });
}
