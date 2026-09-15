// Command › Traces — what actually happened, in causal order.
//
// ops.agent_stream tells you an agent did things. It does not tell you WHY one thing followed
// another, and it cannot join a run to the cost it incurred or the approval it waited on. The event
// spine (iris.event_log) does: every event carries a correlation_id (which trace it belongs to) and
// a causation_id (which event it followed). This page is the reader for that.
//
// A trace here is one causal chain. Pick one on the left, read it as an indented tree on the right.
// Cross-table by design — a run's start, the ledger row it produced and the approval it waited on
// share a trace, so a single chain answers "what did this cost" and "what was it waiting for".
//
// HONEST ABOUT ITS OWN GAPS. Two are real and visible rather than smoothed over:
//   · an ORPHAN is an event whose parent is not in the window (or whose producer never emitted a
//     start). 52 starts against 68 dones in a recent day means some workers only report finishing.
//     The chain shows those at depth 1 and says how many there are.
//   · only run start/end/error, spend, tasks, claims and approvals reach the spine. Per-tool
//     progress stays in ops.agent_stream on purpose — mirroring ~500 rows a day into a durable log
//     would cost more than it explains. The empty state says so rather than implying total coverage.

import { h, fmt, clear } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { pill, emptyState, toast } from '../ui.js';
import { load, card, kpi, skelRows } from './_common.js';
import { setParams } from '../router.js';

const WINDOWS = [[24, '24 h'], [168, '7 d'], [720, '30 d']];

// event family → tone. Kept deliberately small: colour carries meaning only where it is earned.
function toneOf(type) {
  const t = String(type || '');
  if (/\.(error|failed)$|denied$/.test(t)) return 'bad';
  if (/^approval\.|^proposal\./.test(t)) return 'warn';
  if (/^usage\.|cost/.test(t)) return 'primary';
  if (/^agent\.run\.(end)$|\.(done|accepted|granted)$/.test(t)) return 'good';
  return 'neutral';
}
const iconFor = (type) => /^approval\.|^proposal\./.test(type) ? 'inbox'
  : /^usage\./.test(type) ? 'dollar'
  : /^task\./.test(type) ? 'check-circle'
  : /^claim\./.test(type) ? 'brain'
  : /error|failed|denied/.test(type) ? 'alert'
  : 'activity';

export function render(root, route) {
  const host = h('div.stack');
  root.append(host);

  const hours = Number(route?.params?.get('h')) || 168;
  const onlyErrors = route?.params?.get('errors') === '1';
  const open = route?.params?.get('trace') || null;

  draw(host, { hours, onlyErrors, open });
  return () => {};
}

function draw(host, state) {
  load(host, 'iris2_traces', { p_limit: 60, p_hours: state.hours, p_only_errors: state.onlyErrors }, (d, el, reload) => {
    const traces = (d && d.traces) || [];
    const sum = (d && d.summary) || {};

    el.append(h('div.kpis',
      kpi('activity', 'traces', fmt.int(sum.chains || 0), `${fmt.int(sum.events || 0)} events`),
      kpi('alert', 'failed', fmt.int(sum.failed_chains || 0), 'chains containing an error', (sum.failed_chains || 0) > 0 ? 'bad' : ''),
      // a chain of one is a root with nothing following it — a real measure of how much of the log
      // is actually traceable, so it is shown rather than folded into the total
      kpi('graph', 'multi-event', fmt.int(sum.multi_event_chains || 0), `of ${fmt.int(sum.chains || 0)} — the rest are single events`),
      kpi('clock', 'window', WINDOWS.find(([w]) => w === state.hours)?.[1] || `${state.hours} h`, 'change below')));

    const controls = h('div.tr-controls',
      h('div.seg', { role: 'tablist', 'aria-label': 'Window' }, WINDOWS.map(([w, label]) =>
        h('button', {
          type: 'button', role: 'tab', 'aria-selected': w === state.hours ? 'true' : 'false',
          onclick: () => { setParams((p) => { p.set('h', String(w)); p.delete('trace'); }); draw(host, { ...state, hours: w, open: null }); },
        }, label))),
      h('button.btn.ghost', {
        type: 'button', 'aria-pressed': state.onlyErrors ? 'true' : 'false',
        class: state.onlyErrors ? 'is-on' : '',
        onclick: () => { setParams((p) => { if (state.onlyErrors) p.delete('errors'); else p.set('errors', '1'); p.delete('trace'); }); draw(host, { ...state, onlyErrors: !state.onlyErrors, open: null }); },
      }, iconEl('alert', 'ic-14'), 'failed only'));

    if (!traces.length) {
      el.append(card('Traces', controls, emptyState(
        state.onlyErrors ? 'No failed traces in this window' : 'No traces in this window',
        'A trace appears when an agent run starts, a proposal is decided, a task changes state, a claim is filed or spend is recorded. Per-tool progress stays in the live stream on purpose — it is too high-volume for a durable causal log.')));
      return;
    }

    const listHost = h('div.tr-list');
    const detailHost = h('div.tr-detail');
    el.append(card('Traces', controls, h('div.tr-split', listHost, detailHost), { flush: true, cls: 'tr-card' }));

    let selected = state.open && traces.some((t) => t.correlation_id === state.open) ? state.open : traces[0].correlation_id;

    const paint = () => {
      clear(listHost);
      for (const t of traces) {
        const on = t.correlation_id === selected;
        listHost.append(h('button.tr-row', {
          type: 'button', class: `${on ? 'is-on' : ''} ${t.failed ? 'is-failed' : ''}`,
          'aria-current': on ? 'true' : 'false',
          onclick: () => { selected = t.correlation_id; setParams((p) => p.set('trace', t.correlation_id)); paint(); },
        },
          h('div.tr-row-top',
            h('span.tr-dot', { class: `t-${t.failed ? 'bad' : toneOf(t.ended_with)}` }),
            h('b.tr-row-title', t.headline || t.opened_with || 'trace'),
            h('span.tr-row-n', `${fmt.int(t.events)}`)),
          h('div.tr-row-meta',
            h('span', t.opened_by || '—'),
            h('span.sep', '·'),
            h('span', fmt.ago(t.started_at)),
            Number(t.duration_s) > 0 ? h('span.sep', '·') : null,
            Number(t.duration_s) > 0 ? h('span', fmt.dur(t.duration_s)) : null,
            Number(t.cost_usd) > 0 ? h('span.sep', '·') : null,
            Number(t.cost_usd) > 0 ? h('span.tr-cost', fmt.money(t.cost_usd)) : null)));
      }
      paintDetail(detailHost, selected);
    };
    paint();
  }, { skel: h('div.stack.tight', skelRows(1, 'h-80'), skelRows(6, 'h-56')) });
}

function paintDetail(host, correlationId) {
  clear(host);
  host.append(skelRows(5, 'h-40'));
  call('iris2_trace', { p_correlation_id: correlationId }, { dedupe: false }).then((d) => {
    if (!host.isConnected) return;
    clear(host);
    const events = (d && d.events) || [];
    const s = (d && d.summary) || {};
    if (!events.length) { host.append(emptyState('Nothing in this trace', 'It may have aged out of the window.')); return; }

    /* A chain that does not OPEN with a start is a run that only ever reported finishing. That is not
       an edge case here: a recent day held 52 recorded starts against 68 dones, so roughly one run in
       six is missing its beginning. Naming it on the trace is the difference between the page saying
       "here is what happened" and "here is what happens to have been recorded". */
    const noStart = !/\.(start|created|requested|filed)$/.test(events[0].event_type);

    host.append(h('div.tr-detail-head',
      h('div.tr-detail-title', h('b', events[0].event_type),
        h('span.muted', ` · ${fmt.int(s.events)} ${s.events === 1 ? 'event' : 'events'}`)),
      h('div.tr-detail-meta',
        pill(fmt.dur(s.duration_s), 'status neutral nodot'),
        Number(s.cost_usd) > 0 ? pill(fmt.money(s.cost_usd), 'status info nodot') : null,
        s.failed ? pill('failed', 'status bad') : null,
        // an orphan means the chain is PARTIAL — its parent never reached the log. Saying so is the
        // difference between "here is what happened" and "here is what we happen to have".
        Number(s.orphans) > 0 ? pill(`${fmt.int(s.orphans)} orphaned`, 'status warn') : null,
        noStart ? pill('no recorded start', 'status warn') : null),
      h('button.btn.ghost.sm', {
        type: 'button', title: 'Copy the correlation id',
        onclick: async () => {
          try { await navigator.clipboard.writeText(correlationId); toast({ title: 'Correlation id copied', kind: 'success' }); }
          catch { toast({ title: 'Could not copy', message: correlationId, kind: 'warn', duration: 8000 }); }
        },
      }, iconEl('copy', 'ic-14'), 'id')));

    const list = h('div.tr-events');
    for (const e of events) {
      const tone = toneOf(e.event_type);
      const p = e.payload || {};
      const detail = p.title || p.detail || p.statement || p.event || p.tool || '';
      const bits = [];
      if (p.model) bits.push(p.model);
      if (p.cost_usd != null && Number(p.cost_usd) > 0) bits.push(fmt.money(p.cost_usd));
      if (p.ms != null) bits.push(`${fmt.int(p.ms)} ms`);
      if (p.status) bits.push(p.status);
      list.append(h('div.tr-ev', { class: `t-${tone}`, style: { '--d': String(Math.min(6, (e.depth || 1) - 1)) } },
        h('span.tr-ev-rail'),
        h('span.tr-ev-ic', iconEl(iconFor(e.event_type), 'ic-14')),
        h('div.tr-ev-body',
          h('div.tr-ev-top', h('b', e.event_type), h('span.tr-ev-actor', e.actor || '—'), h('span.tr-ev-t', fmt.timeS(e.occurred_at))),
          detail ? h('div.tr-ev-detail', String(detail).slice(0, 220)) : null,
          bits.length ? h('div.tr-ev-bits', bits.join(' · ')) : null,
          // the honest marker for a chain we only have part of
          e.causation_id == null && e.depth === 1 && events.indexOf(e) > 0
            ? h('div.tr-ev-orphan', 'no recorded cause — its parent never reached the log') : null)));
    }
    host.append(list);
    if (noStart) {
      host.append(h('div.tr-note',
        h('b', 'This trace has no recorded start. '),
        'Its producer emits a finish but not a beginning, so the work before this point was never written to the spine. ',
        'The live stream may still hold it — this is a gap in what is durably recorded, not proof that nothing happened.'));
    }
    host.append(h('div.tr-foot', `source: iris.event_log · ${events[0].source || 'db'}`));
  }).catch((e) => {
    if (!host.isConnected) return;
    clear(host);
    host.append(emptyState('Could not load this trace', `${e.code || 'error'}: ${e.message}`));
  });
}
