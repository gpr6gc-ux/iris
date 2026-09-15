// "How IRIS got better" — the one thing the owner asked to read.
//
// On 2026-09-13 the owner said: "if a claim is good, we add it. if not we discard it automatically.
// i cant look at 180 claims. all i want is in simple natural language, how it improved iris. thats it."
// This is that. Claims are judged by the reviewer agent every 4h against one rule (keep only what
// changes what IRIS does or knows); at 06:10 ET one note is written about yesterday from what was
// actually kept and what actually ran. The note is the content. The receipts sit under it, folded.
//
// Mounted at the top of Mission (desktop home) and Today (phone). Isolated: a failure here never
// touches the rest of the page. Reads iris2_daily_notes.
//
// HONEST STATES, all real:
//   · no note yet          → says when the first one is written, shows what the judge has done so far
//   · note for yesterday   → the prose, dated
//   · latest note is older → the prose, plus a plain warning that yesterday's note is missing
//   · nothing kept, nothing pending → "quiet" is a fine answer and is said as such
//   · error                → the error, with the code

import { h, fmt, clear } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { pill } from '../ui.js';
import { skeleton } from '../ui.js';

const NY = 'America/New_York';

// the day the note is about, as the owner would say it: "yesterday", "Saturday", or the date when older
function dayLabel(dayIso) {
  if (!dayIso) return '';
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: NY }));
  const d = new Date(dayIso + 'T12:00:00');
  const diff = Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diff === 1) return 'yesterday';
  if (diff === 0) return 'today';
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
const daysAgo = (dayIso) => {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: NY }));
  const d = new Date(dayIso + 'T12:00:00');
  return Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
};

export function mountBetterNote(host, { compact = false } = {}) {
  clear(host);
  const box = h('section.better', { class: compact ? 'compact' : '', 'aria-label': 'How IRIS got better' });
  host.append(box);
  box.append(h('div.better-head', h('span.better-eyebrow', iconEl('sparkles', 'ic-14'), 'How IRIS got better')),
    h('div.better-skel', { 'aria-hidden': 'true' }, skeleton('h-16'), skeleton('h-16'), skeleton('h-16 w-70')));
  call('iris2_daily_notes', { p_days: 7 }, { dedupe: true })
    .then((d) => { if (host.isConnected) draw(box, d || {}, compact); })
    .catch((e) => {
      if (!host.isConnected) return;
      clear(box);
      box.append(h('div.better-head', h('span.better-eyebrow', iconEl('sparkles', 'ic-14'), 'How IRIS got better')),
        h('div.better-body.muted', `Couldn’t load the note — ${e && e.code ? e.code : 'error'}: ${e && e.message ? e.message : e}`));
    });
}

function draw(box, d, compact) {
  clear(box);
  const notes = Array.isArray(d.notes) ? d.notes : [];
  const kept = Array.isArray(d.recent_kept) ? d.recent_kept : [];
  const t = d.triage || {};
  const latest = notes[0] || null;
  const age = latest ? daysAgo(latest.day) : null;

  // ---- head: eyebrow + when
  const when = latest
    ? h('span.better-when', `${dayLabel(latest.day)} · written ${fmt.ago(latest.generated_at)}`)
    : h('span.better-when', t.last_run ? `last judged ${fmt.ago(t.last_run)} · first note at 06:10 ET` : 'not started yet');
  box.append(h('div.better-head', h('span.better-eyebrow', iconEl('sparkles', 'ic-14'), 'How IRIS got better'), when));

  // ---- body: the note, or the honest reason there isn't one
  if (latest) {
    box.append(h('p.better-body', latest.body));
    if (age > 1) {
      box.append(h('div.better-warn', iconEl('alert', 'ic-14'),
        h('span', `No note for yesterday — the last one is from ${dayLabel(latest.day)}. The writer runs at 06:10 ET; if this persists, the daily-note chain in n8n is not running.`)));
    }
  } else {
    const n = Number(t.kept_today || 0); const m = Number(t.discarded_today || 0); const p = Number(t.pending || 0);
    const lead = t.last_run
      ? (n || m
        ? `No note yet — the first is written at 06:10 ET. So far today the reviewer kept ${fmt.int(n)} claim${n === 1 ? '' : 's'} and discarded ${fmt.int(m)}${p ? `, with ${fmt.int(p)} still waiting to be judged` : ''}.`
        : `No note yet — the first is written at 06:10 ET. Nothing has been kept or discarded today${p ? `; ${fmt.int(p)} claims are waiting to be judged` : ''}.`)
      : 'Nothing to report yet. Claims are judged every four hours and the first note is written the morning after.';
    box.append(h('p.better-body', lead));
  }

  // ---- receipts: counts + what was kept, folded by default when there is prose
  const receipts = h('div.better-receipts');
  const counts = h('div.better-counts',
    stat(fmt.int(t.kept_7d || 0), 'kept · 7d', 'good'),
    stat(fmt.int(t.discarded_7d || 0), 'discarded · 7d', ''),
    stat(fmt.int(t.pending || 0), 'waiting', Number(t.pending || 0) > 200 ? 'warn' : ''),
    h('span.better-rule', `rule: ${t.rule || 'keep only what changes what IRIS does or knows'}`));
  receipts.append(counts);

  if (kept.length) {
    const list = h('ul.better-kept');
    for (const k of kept.slice(0, compact ? 4 : 8)) {
      list.append(h('li',
        h('div.bk-top', pill(k.kind || 'claim', 'status neutral nodot'), h('b.bk-title', k.statement || '—'), h('span.bk-when', fmt.ago(k.kept_at))),
        k.change ? h('div.bk-change', k.change) : (k.why ? h('div.bk-change', k.why) : null)));
    }
    receipts.append(h('div.better-sub', `Kept recently — now in memory, with the change each one calls for${kept.length > (compact ? 4 : 8) ? ` (${kept.length - (compact ? 4 : 8)} more in Brain)` : ''}`), list);
  } else if (t.last_run) {
    receipts.append(h('div.better-sub.muted', 'Nothing kept in the last 7 days. Everything the scouts filed was news that left IRIS doing exactly what it did before — that is the rule working, not a fault.'));
  }

  // with a note present the receipts fold; without one they are the content
  if (latest) {
    const btn = h('button.better-toggle', { type: 'button', 'aria-expanded': 'false' }, iconEl('chevron-down', 'ic-14'), h('span', 'what was kept, and the numbers'));
    receipts.hidden = true;
    btn.addEventListener('click', () => {
      const open = receipts.hidden; receipts.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.replaceChildren(iconEl(open ? 'chevron-up' : 'chevron-down', 'ic-14'), h('span', open ? 'hide the receipts' : 'what was kept, and the numbers'));
    });
    box.append(btn);
  }
  box.append(receipts);
  box.append(h('div.better-foot', `${latest && latest.model ? `note by ${latest.model} · ` : ''}judge: reviewer agent · every 4h · a change “called for” is not made until a proposal runs · nothing here needs a decision from you`));
}

function stat(value, label, tone) {
  return h('span.better-stat', { class: tone ? `tone-${tone}` : '' }, h('b', value), h('span', label));
}
