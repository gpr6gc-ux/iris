// Careers — the job-hunt engine. Drop a job (link, screenshot, or paste); IRIS parses the posting,
// tailors your resume to it, and scores the fit against a weighted read of what the role actually wants.
// Reads iris2_careers / iris2_career; intake via iris2_career_intake; status via iris2_career_act.

import { h, fmt } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { pill, emptyState, openPanel, openDialog, toast } from '../ui.js';
import { load, card, kpi } from './_common.js';

export function render(root, _route, ctx) {
  if (ctx && ctx.setSub) ctx.setSub('job intake · JD → tailored resume + weighted fit score · your pipeline');
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_careers', {}, draw);
  return () => {};
}

// ---- tone helpers ----
const band = (n) => (n == null ? 'none' : n >= 75 ? 'good' : n >= 60 ? 'warn' : n >= 45 ? 'info' : 'bad');
const stateTone = (s) => (s === 'met' ? 'good' : s === 'partial' ? 'warn' : 'bad');
const stateIcon = (s) => (s === 'met' ? 'check' : s === 'partial' ? 'activity' : 'close');
const statusTone = (s) => ({ offer: 'good', interviewing: 'info', applied: 'info', tailored: 'warn', parsed: 'neutral', new: 'neutral', rejected: 'bad', archived: 'muted' }[s] || 'neutral');
const pct = (c) => (c == null ? '—' : Math.round(Number(c) * 100) + '%');

function scoreChip(n, verdict) {
  const t = band(n);
  return h('div.cr-scorechip', { class: t, title: verdict || '' },
    h('span.cr-scorenum', n == null ? '—' : Math.round(n)),
    h('span.cr-scoreof', '/100'));
}

function appCard(a, reload) {
  return h('div.cr-card.clickable', { class: band(a.fit_score), tabindex: 0,
    onclick: () => openApp(a.id, reload),
    onkeydown: (e) => { if (e.key === 'Enter') openApp(a.id, reload); } },
    h('div.cr-card-main',
      h('div.cr-id',
        h('b', a.company),
        h('div.cr-role', a.role_title)),
      scoreChip(a.fit_score, a.verdict)),
    h('div.cr-chips',
      a.verdict ? pill(a.verdict, `status ${band(a.fit_score) === 'good' ? 'good' : band(a.fit_score) === 'warn' ? 'warn' : 'neutral'} nodot`) : null,
      pill(a.status, `status ${statusTone(a.status) === 'good' ? 'good' : statusTone(a.status) === 'bad' ? 'bad' : statusTone(a.status) === 'info' ? 'info' : 'neutral'} nodot`),
      a.has_resume ? h('span.cr-mini', iconEl('file', 'ic-12'), 'tailored resume') : null),
    h('div.cr-foot',
      a.location ? h('span.cr-metcell', iconEl('estate', 'ic-12'), a.location) : null,
      a.salary_text ? h('span.cr-metcell', iconEl('money', 'ic-12'), a.salary_text) : null,
      a.source ? h('span.cr-src.muted', a.source) : null));
}

function draw(d, host, reload) {
  const apps = d.applications || [];
  const s = d.stats || {};

  host.append(h('div.kpis',
    kpi('compass', 'Roles tracked', fmt.int(s.tracked || 0), 'in your pipeline', s.tracked ? 'primary' : ''),
    kpi('target', 'Avg fit score', s.avg_fit != null ? Math.round(s.avg_fit) : '—', 'weighted across requirements', s.avg_fit >= 75 ? 'good' : s.avg_fit ? 'warn' : ''),
    kpi('send', 'Applied', fmt.int(s.applied || 0), 'submitted or further', s.applied ? 'info' : '')));

  host.append(h('div.notice', iconEl('info'), h('span', h('b', 'Drop a job, get a tailored resume + a fit score. '),
    'Paste a posting link or the description and IRIS parses what the role actually wants, tailors your resume to it, and scores the match with a prioritized plan to lift it. Reputable sources only — Handshake, LinkedIn, company boards.')));

  const addBtn = h('button.btn.btn-primary', { type: 'button', onclick: () => intake(reload) }, iconEl('plus', 'ic-14'), 'Add a job');

  const grid = apps.length
    ? h('div.cr-grid', apps.map((a) => appCard(a, reload)))
    : emptyState('No roles yet', 'Add a job posting to get your first tailored resume + fit score.');

  host.append(card(
    h('h2', [iconEl('compass', 'ic-16'), ' Application pipeline']),
    h('div.cr-head-actions', h('span.hint-text', `${apps.length} tracked · newest first`), addBtn),
    [grid], { cls: 'f1' }));

  host.append(h('div.foot-note', d.note || 'The fit score is a weighted match of your resume to the role’s stated requirements. The odds estimate factors in program selectivity — a planning aid, not a prediction.'));
}

// ---- intake dialog ----
function intake(reload) {
  const company = h('input.input', { type: 'text', placeholder: 'e.g. Bessemer Venture Partners', 'aria-label': 'Company' });
  const role = h('input.input', { type: 'text', placeholder: 'e.g. Full-Time Analyst', 'aria-label': 'Role title' });
  const url = h('input.input', { type: 'url', placeholder: 'https:// … (Greenhouse, Lever, company board)', 'aria-label': 'Job URL' });
  const jd = h('textarea.input', { rows: 6, placeholder: 'Paste the job description here (or the link above for public boards). For Handshake/LinkedIn, paste the text or drop a screenshot in Discord.', 'aria-label': 'Job description' });
  openDialog({
    title: 'Add a job',
    sub: 'Stored to your pipeline. IRIS parses the posting, tailors your resume, and scores the fit.',
    body: h('div.stack',
      h('div.field', h('label', 'Company'), company),
      h('div.field', h('label', 'Role title'), role),
      h('div.field', h('label', 'Job link'), url),
      h('div.field', h('label', 'Description'), jd),
      h('div.small.muted', 'A link to a public board lets IRIS pull the posting itself. Auth-walled sites (Handshake, LinkedIn) — paste the text or drop a screenshot into your Discord intake channel.')),
    actions: [
      { label: 'Cancel', class: 'btn-ghost' },
      { label: 'Add to pipeline', class: 'btn-primary', icon: 'plus', onClick: async () => {
        if (!company.value.trim()) { toast({ title: 'Company is required', kind: 'warn' }); return false; }
        try {
          const r = await call('iris2_career_intake', {
            p_company: company.value.trim(), p_role: role.value.trim() || null,
            p_url: url.value.trim() || null, p_paste: jd.value.trim() || null,
            p_intake_kind: url.value.trim() ? 'link' : 'paste',
          }, { dedupe: false });
          toast({ title: 'Added to pipeline', message: 'IRIS will parse, tailor, and score it next.', kind: 'success' });
          if (reload) reload();
        } catch (e) { toast({ title: 'Could not add', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 }); return false; }
      } },
    ],
  });
}

// ---- detail panel: the fit report ----
async function act(id, action, payload, reload) {
  try {
    await call('iris2_career_act', { p_id: id, p_action: action, p_payload: payload || {} }, { dedupe: false });
    toast({ title: 'Updated', message: `Marked ${action}`, kind: 'success', duration: 2000 });
    openApp(id, reload);
    if (reload) reload();
  } catch (e) { toast({ title: 'Could not update', message: `${e.code || 'error'}: ${e.message}`, kind: 'error' }); }
}

function gauge(score) {
  const r = 52, c = 2 * Math.PI * r, fill = Math.max(0, Math.min(100, score || 0)) / 100 * c;
  const svg = `<svg width="132" height="132" viewBox="0 0 132 132" class="cr-gauge-svg">
    <circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--muted)" stroke-width="11"/>
    <circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--primary)" stroke-width="11" stroke-linecap="round"
      stroke-dasharray="${fill.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 66 66)"/></svg>`;
  const wrap = h('div.cr-gauge');
  wrap.innerHTML = svg;
  wrap.append(h('div.cr-gauge-center', h('div.cr-gauge-num', score == null ? '—' : Math.round(score)), h('div.cr-gauge-of', '/ 100')));
  return wrap;
}

function reqRow(r) {
  const t = stateTone(r.state);
  return h('div.cr-req',
    h('div.cr-req-top',
      h('span.cr-req-name', r.label),
      h('span.cr-req-w', `w ${Math.round(Number(r.weight) * 100)}%`),
      h('span.cr-state', { class: t }, iconEl(stateIcon(r.state), 'ic-12'), r.state)),
    h('div.cr-req-track', h('i', { class: t, style: `width:${Math.round(Number(r.coverage) * 100)}%` })),
    r.evidence ? h('div.cr-req-ev', r.evidence) : null);
}

function gapRow(g, i) {
  return h('div.cr-gap',
    h('div.cr-gap-rank', String(g.rank || i + 1)),
    h('div.cr-gap-body', h('h4', g.action), g.why ? h('p', g.why) : null),
    h('div.cr-gap-lift', { class: g.lever ? 'lever' : '' }, g.lift || ''));
}

async function openApp(id, reload) {
  let d;
  try { d = await call('iris2_career', { p_id: id }, { dedupe: false }); }
  catch (e) { toast({ title: 'Could not load', message: `${e.code || 'error'}: ${e.message}`, kind: 'error' }); return; }
  const a = (d && d.application) || {};
  const reqs = (d && d.requirements) || [];
  const sc = (d && d.score) || null;
  const odds = (sc && sc.odds) || {};
  const gaps = (sc && sc.gaps) || [];
  const tl = (d && d.tailoring) || null;

  const sub = [a.location, a.onsite, a.salary_text].filter(Boolean).join(' · ');

  openPanel({
    kicker: [
      sc && sc.verdict ? pill(sc.verdict, `status ${band(sc.fit_score) === 'good' ? 'good' : band(sc.fit_score) === 'warn' ? 'warn' : 'neutral'} nodot`) : null,
      pill(a.status, `status ${statusTone(a.status) === 'good' ? 'good' : statusTone(a.status) === 'info' ? 'info' : 'neutral'} nodot`),
      sc && sc.confidence != null ? pill(`confidence ${pct(sc.confidence)}`, 'status neutral nodot') : null,
    ],
    title: `${a.company}`,
    sub: [h('span', a.role_title + (sub ? ' · ' + sub : ''))],
    body: [
      statusLine(a),
      sc ? h('div.cr-topgrid',
        h('div.cr-gaugecard', gauge(sc.fit_score), h('div.cr-gauge-cap', 'Fit score')),
        h('div.cr-oddscard',
          h('div.cr-oddshead', h('b', odds.band || 'Fit'), odds.selectivity ? h('span.cr-pill-warn', odds.selectivity) : null),
          odds.pool_percentile != null ? h('div.cr-pool',
            h('div.cr-pool-track', h('i', { style: `width:${odds.pool_percentile}%` }), h('span.cr-pool-mark', { style: `left:${odds.pool_percentile}%` })),
            h('div.cr-pool-legend', h('span', 'applicant pool'), h('span', `top ~${100 - odds.pool_percentile}% by fit`))) : null,
          odds.note ? h('div.cr-odds-note', odds.note) : null)) : h('div.small.muted', 'Not scored yet — IRIS will parse and score this posting.'),

      reqs.length ? h('div.cr-sec', h('h3.dd-h', 'Requirement coverage'), h('div.cr-reqs', reqs.map(reqRow))) : null,

      gaps.length ? h('div.cr-sec', h('h3.dd-h', 'How to lift the score'), h('div.cr-gaps', gaps.map(gapRow))) : null,

      tailoringSection(id, a, tl),
      prepSection(tl),

      a.jd_raw ? h('details.cr-jd', h('summary', 'Job description (parsed)'), h('p.op-p.muted', a.jd_raw)) : null,

      h('h3.dd-h', 'Actions'),
      h('div.op-actions',
        a.status !== 'applied' && a.status !== 'interviewing' && a.status !== 'offer'
          ? h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: () => act(id, 'apply', {}, reload) }, iconEl('check', 'ic-14'), 'Mark applied') : null,
        a.url ? h('a.btn.btn-sm', { href: a.url, target: '_blank', rel: 'noopener noreferrer' }, iconEl('send', 'ic-14'), 'Open posting ↗') : null,
        a.status !== 'working' ? h('button.btn.btn-sm', { type: 'button', title: 'Queue it for the tailor again (base resume may have changed, or you edited the posting)', onclick: () => act(id, 'retailor', {}, reload) }, iconEl('refresh', 'ic-14'), tl ? 'Re-tailor' : 'Tailor now') : null,
        h('button.btn.btn-sm', { type: 'button', onclick: () => act(id, 'archive', {}, reload) }, iconEl('close', 'ic-14'), 'Archive')),
      h('div.foot-note', sc && sc.rationale ? sc.rationale : 'Weighted match of your resume to the role’s stated requirements.'),
    ],
  });
}


// ---- the tailored resume: download, what changed, keywords ---------------------------------------------
function statusLine(a) {
  const m = a.meta || {};
  if (a.status === 'new') return h('div.cr-status.wait', iconEl('clock', 'ic-14'), h('span', 'Queued — the tailor picks this up within 10 minutes, reads the posting, scores the fit, and rewrites your base resume for it.'));
  if (a.status === 'working') return h('div.cr-status.wait', iconEl('activity', 'ic-14'), h('span', 'Tailoring now — two model passes, about two minutes.'));
  if (a.status === 'failed' || m.error) return h('div.cr-status.bad', iconEl('alert', 'ic-14'), h('span', (a.status === 'failed' ? 'Gave up after 3 tries: ' : 'Last attempt failed, will retry: ') + m.error));
  return null;
}

async function downloadResume(id, name) {
  try {
    const d = await call('iris2_career_file', { p_id: id }, { dedupe: false });
    const bin = atob(d.b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: d.mime }));
    const a = h('a', { href: url, download: d.name || name || 'resume.docx' }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) { toast({ title: 'Could not download', message: `${e.code || 'error'}: ${e.message}`, kind: 'error' }); }
}

function tailoringSection(id, a, tl) {
  if (!tl) return null;
  const kw = tl.keywords || {}; const used = kw.used || []; const unused = kw.unused || [];
  const changes = tl.changes || [];
  const verify = changes.filter((c) => c && c.verify);
  return h('div.cr-sec', h('h3.dd-h', 'Tailored resume'),
    h('div.cr-resume',
      iconEl('file', 'ic-14'),
      h('div.grow', h('b', tl.docx_name || a.tailored_resume_ref || 'resume.docx'),
        h('div.small.muted', `${tl.docx_bytes ? Math.round(tl.docx_bytes / 1024) + ' KB · ' : ''}${tl.model || ''} · ${fmt.ago(tl.updated_at)} · ${fmt.money(tl.cost_usd || 0, 2)}`)),
      tl.has_docx ? h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: () => downloadResume(id, tl.docx_name) }, iconEl('download', 'ic-14'), 'Download .docx') : h('span.small.muted', 'file not stored')),
    verify.length ? h('div.cr-status.warn', iconEl('alert', 'ic-14'), h('span', `${verify.length} rewording${verify.length === 1 ? '' : 's'} stretch past the base wording — read them below before sending.`)) : null,
    used.length || unused.length ? h('div.cr-kw',
      h('div.small.muted', `ATS keywords from the posting: ${used.length} now in the resume, ${unused.length} left out because they are not true of you`),
      h('div.cr-kw-row', used.map((k) => pill(k, 'status good nodot')), unused.map((k) => pill(k, 'status neutral nodot cr-kw-off')))) : null,
    changes.length ? h('details.cr-changes', h('summary', `What changed (${changes.length})`),
      h('div.cr-change-list', changes.map((c) => h('div.cr-change', { class: c.verify ? 'verify' : '' },
        h('div.cr-change-top', pill(c.section || 'change', 'status neutral nodot'), h('b', c.where || ''), c.verify ? pill('verify', 'status warn nodot') : null),
        c.from ? h('div.cr-change-from', c.from) : null,
        h('div.cr-change-to', c.to || ''),
        c.why ? h('div.cr-change-why', c.why) : null)))) : null);
}

// ---- interview prep -----------------------------------------------------------------------------------
function prepSection(tl) {
  const p = tl && tl.prep;
  if (!p || (!p.elevator_pitch && !(p.likely_questions || []).length)) return null;
  const list = (title, items, render) => (items && items.length) ? h('div.cr-prep-block', h('h4', title), h('div.cr-prep-items', items.map(render))) : null;
  return h('div.cr-sec', h('h3.dd-h', 'Interview prep'),
    p.elevator_pitch ? h('div.cr-pitch', h('div.cr-prep-k', 'Tell me about yourself'), h('p', p.elevator_pitch)) : null,
    list('Likely questions', p.likely_questions, (q) => h('details.cr-q', h('summary', q.q), q.why_asked ? h('div.small.muted', q.why_asked) : null, h('p', q.answer_outline || ''))),
    list('Your stories (STAR)', p.stories, (s) => h('details.cr-q', h('summary', s.name || 'story'),
      h('p', h('b', 'Situation: '), s.situation || ''), h('p', h('b', 'Task: '), s.task || ''), h('p', h('b', 'Action: '), s.action || ''), h('p', h('b', 'Result: '), s.result || ''),
      (s.use_for || []).length ? h('div.small.muted', 'use for: ' + s.use_for.join(', ')) : null)),
    list('Handling the gaps', p.gap_handling, (g) => h('div.cr-gaph', h('b', g.gap), h('p', g.how_to_address))),
    list('Questions to ask them', p.questions_to_ask, (q) => h('div.cr-ask', q)),
    p.first_90_days ? h('div.cr-prep-block', h('h4', 'First 90 days'), h('p', p.first_90_days)) : null,
    list('What the posting says about them', p.company_notes, (n) => h('div.cr-ask', n)),
    list('Confirm before you apply', p.red_flags_to_check, (n) => h('div.cr-ask.flag', iconEl('alert', 'ic-12'), h('span', n))));
}
