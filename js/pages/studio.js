// Studio — the autonomous AI video pipeline. Lane (niche) → script → storyboard → render
// (AI video + voiceover + captions) → assemble → you approve → publish. Provider-agnostic
// skeleton: the base AI video software plugs into the provider slots. Reads iris2_studio /
// iris2_studio_production; acts via iris2_studio_act.

import { h, fmt } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { pill, emptyState, openPanel, toast } from '../ui.js';
import { load, card, kpi } from './_common.js';

// pipeline columns: several fine-grained statuses fold into one board column
const COLUMNS = [
  { key: 'idea', label: 'Idea', icon: 'sparkles', statuses: ['draft'] },
  { key: 'script', label: 'Script', icon: 'file', statuses: ['scripted'] },
  { key: 'storyboard', label: 'Storyboard', icon: 'columns', statuses: ['storyboarded'] },
  { key: 'render', label: 'Render', icon: 'play', statuses: ['queued', 'rendering', 'assembling', 'failed'] },
  { key: 'ready', label: 'Ready', icon: 'check', statuses: ['ready', 'approved'] },
  { key: 'published', label: 'Published', icon: 'send', statuses: ['published'] },
];
const STATUS_TONE = { draft: 'neutral', scripted: 'neutral', storyboarded: 'primary', queued: 'primary', rendering: 'warn', assembling: 'warn', ready: 'good', approved: 'good', published: 'good', failed: 'bad' };
const colFor = (st) => (COLUMNS.find((c) => c.statuses.includes(st)) || COLUMNS[0]).key;

export function render(root, _route, ctx) {
  if (ctx && ctx.setSub) ctx.setSub('AI video pipeline · script → voiceover + captions + cinematic → you approve');
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_studio', {}, draw);
  return () => {};
}

function draw(d, host, reload) {
  const prods = d.productions || [];
  const stages = d.stages || {};
  const r = d.provider_readiness || {};
  const providers = d.providers || [];
  const lanes = d.lanes || [];
  // the renderer is ready when voice + captions + assembly are wired; AI footage (video_gen) is optional
  const need = ['tts', 'captions', 'assembly'];
  const wired = need.filter((c) => providers.some((x) => x.capability === c && x.enabled));
  const ready = wired.length === need.length;
  const footage = providers.some((x) => x.capability === 'video_gen' && x.enabled);
  const posting = d.posting || {};

  host.append(h('div.kpis',
    kpi('play', 'In production', fmt.int(prods.length), `${fmt.int(stages.draft || 0)} idea · ${fmt.int((stages.rendering || 0) + (stages.queued || 0) + (stages.assembling || 0))} rendering`, prods.length ? 'primary' : ''),
    kpi('check', 'Ready to publish', fmt.int((stages.ready || 0) + (stages.approved || 0)), 'you approve & publish', (stages.ready || stages.approved) ? 'good' : ''),
    kpi('key', 'Renderer', ready ? 'ready' : `${wired.length}/${need.length}`, ready ? (footage ? 'voice · captions · assembly · AI footage' : 'voice · captions · assembly · generated backgrounds') : 'connect voice, captions, assembly', ready ? 'good' : 'warn'),
    kpi('layers', 'Niches (lanes)', fmt.int(lanes.length), 'pick where each piece belongs', '')));

  // provider readiness — the "connect the base AI video software" gate
  if (!ready) {
    host.append(h('div.notice.warn', iconEl('alert'), h('span',
      h('b', 'Renderer not fully wired. '),
      'Voice, captions and assembly must be enabled for productions to render. Nothing renders (and no spend happens) until they are.')));
  } else if (!posting.tiktok_connected) {
    host.append(h('div.notice', iconEl('info'), h('span',
      h('b', 'Posting is your tap. '),
      'Scripts are written every morning and rendered within the day. No TikTok posting credential is connected, so a READY video waits here: open it, download the mp4, copy the caption, post, then mark it posted.')));
  }
  host.append(card(
    h('h2', [iconEl('key', 'ic-16'), ' Provider slots']),
    h('span.hint-text', 'the base AI video software plugs in here'),
    [h('div.prov-grid', providers.map(providerChip))], { cls: 'f1' }));

  // niches
  if (lanes.length) {
    host.append(h('div.niche-row',
      h('span.niche-label', 'Niches:'),
      ...lanes.map((l) => h('span.niche-chip', { title: l.title }, l.title))));
  }

  // the pipeline board (kanban)
  const board = h('div.studio-board');
  for (const col of COLUMNS) {
    const items = prods.filter((p) => colFor(p.status) === col.key);
    board.append(h('div.studio-col',
      h('div.studio-col-head', iconEl(col.icon, 'ic-14'), h('span.scol-l', col.label), h('span.scol-n', String(items.length))),
      h('div.studio-col-body', items.length ? items.map((p) => prodCard(p, reload)) : h('div.studio-empty', '—'))));
  }
  host.append(card(
    h('h2', [iconEl('play', 'ic-16'), ' Production pipeline']),
    h('span.hint-text', 'each piece flows left → right; you approve before it publishes'),
    [h('div.studio-board-wrap', board)], { flush: false, cls: 'f1' }));

  host.append(h('div.foot-note', d.note || ''));
}

function providerChip(p) {
  const tone = p.enabled ? 'good' : p.required ? 'warn' : 'muted';
  return h('div.prov-chip', { class: tone, title: p.enabled ? `${p.vendor || 'connected'}` : `Set a vendor + drop ${p.credential_ref || 'a key'} in Keys` },
    iconEl(p.enabled ? 'check' : p.required ? 'alert' : 'dot', 'ic-12'),
    h('div.prov-t', h('span.prov-l', p.label), h('span.prov-s', p.enabled ? (p.vendor || 'connected') : p.required ? 'needs key' : 'optional')));
}

function prodCard(p, reload) {
  const tone = STATUS_TONE[p.status] || 'neutral';
  return h('div.prod-card.clickable', { class: tone, tabindex: 0,
    onclick: () => openProduction(p.id, reload),
    onkeydown: (e) => { if (e.key === 'Enter') openProduction(p.id, reload); } },
    h('div.prod-title', p.title),
    p.hook ? h('div.prod-hook.small.muted', p.hook) : null,
    p.lane_title ? h('div.prod-lane', p.lane_title) : null,
    p.status === 'failed' && p.error ? h('div.prod-err.small', p.error) : null,
    h('div.prod-foot',
      pill(p.status, `status ${tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'primary' ? 'info' : 'neutral'} nodot`),
      h('span.prod-meta.small.muted', `${p.format} · ${p.aspect}${p.scene_count ? ' · ' + p.scene_count + ' scenes' : ''}`)),
    Number(p.cost_usd) > 0 ? h('div.prod-cost.small.muted', '$' + Number(p.cost_usd).toFixed(2) + ' spent') : null);
}

async function act(id, action, value, reload) {
  try {
    await call('iris2_studio_act', { p_id: id, p_action: action, p_value: value || null }, { dedupe: false });
    toast({ title: 'Updated', message: `Production ${action}`, kind: 'success', duration: 1800 });
    openProduction(id, reload);
    if (reload) reload();
  } catch (e) { toast({ title: 'Could not update', message: `${e.code || 'error'}: ${e.message}`, kind: 'error' }); }
}

async function openProduction(id, reload) {
  let d;
  try { d = await call('iris2_studio_production', { p_id: id }, { dedupe: false }); }
  catch (e) { toast({ title: 'Could not load', message: `${e.code || 'error'}: ${e.message}`, kind: 'error' }); return; }
  const p = (d && d.production) || d || {};
  const tone = STATUS_TONE[p.status] || 'neutral';
  const scenes = p.scenes || [];
  const jobs = (d && d.jobs) || p.render_jobs || [];
  const post = p.post || {};
  const postText = [post.caption, (post.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
  const copyPost = async () => {
    try { await navigator.clipboard.writeText(postText); toast({ title: 'Caption copied', message: 'Paste it into the TikTok post.', kind: 'success', duration: 2500 }); }
    catch { toast({ title: 'Could not copy', message: postText, kind: 'warn', duration: 9000 }); }
  };
  const section = (title, node) => (node ? h('div.op-sec', h('h3.dd-h', title), node) : null);

  const storyboard = scenes.length
    ? h('div.sb-list', scenes.map((s) => h('div.sb-scene',
        h('div.sb-top', h('span.sb-seq', String(s.seq)), h('span.sb-dur.small.muted', (s.duration_s || '—') + 's'),
          s.status ? pill(s.status, `status ${s.status === 'done' ? 'good' : s.status === 'rendering' ? 'warn' : 'neutral'} nodot`) : null),
        s.vo_text ? h('div.sb-vo', h('span.sb-k', 'VO'), h('span', s.vo_text)) : null,
        s.on_screen_text ? h('div.sb-cap', h('span.sb-k', 'caption'), h('span', s.on_screen_text)) : null,
        s.scene_prompt ? h('div.sb-prompt', h('span.sb-k', 'shot'), h('span', s.scene_prompt)) : null)))
    : null;

  const jobList = jobs.length
    ? h('div.job-list', jobs.map((j) => h('div.job-row',
        h('span.job-kind', j.kind), pill(j.state, `status ${j.state === 'done' ? 'good' : j.state === 'error' ? 'bad' : j.state === 'running' || j.state === 'claimed' ? 'warn' : 'neutral'} nodot`),
        h('span.job-prov.small.muted', j.provider_key || ''),
        j.output_url ? h('span.job-out.small', 'asset ✓') : null)))
    : null;

  openPanel({
    kicker: [
      pill(p.status, `status ${tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : 'neutral'} nodot`),
      p.lane ? pill(p.lane.title, 'status neutral nodot') : null,
      pill(`${p.format} · ${p.aspect}`, 'status neutral nodot'),
    ],
    title: p.title,
    sub: [h('span', `${p.created_by === 'scaffold' ? 'scaffold example · ' : ''}${p.duration_target_s ? p.duration_target_s + 's target · ' : ''}${p.style_notes || ''}`)],
    body: [
      p.concept ? h('p.op-p.muted', p.concept) : null,
      p.final_url ? h('div.op-sec', h('h3.dd-h', 'The video'),
        h('div.st-video-wrap', h('video.st-video', { src: p.final_url, controls: true, playsinline: true, preload: 'metadata' })),
        h('div.op-actions',
          h('a.btn.btn-sm.btn-primary', { href: p.final_url, download: '', target: '_blank', rel: 'noopener noreferrer' }, iconEl('download', 'ic-14'), 'Download mp4'),
          postText ? h('button.btn.btn-sm', { type: 'button', onclick: copyPost }, iconEl('copy', 'ic-14'), 'Copy caption + tags') : null)) : null,
      p.status === 'failed' && p.error ? h('div.notice.warn', iconEl('alert'), h('span', h('b', 'Render failed: '), p.error)) : null,
      postText ? h('div.op-sec', h('h3.dd-h', 'Post text'), h('pre.script-body', postText)) : null,
      post.phrases && post.phrases.length ? h('div.op-sec', h('h3.dd-h', 'On-screen phrases'), h('div.pills', post.phrases.map((x) => pill(x, 'status neutral nodot')))) : null,
      section('Script (voiceover)', p.script ? h('pre.script-body', p.script) : h('div.small.muted', 'Not written yet — the script step fills this from the niche.')),
      storyboard ? section('Storyboard', storyboard) : null,
      section('Render jobs', jobList || h('div.small.muted', 'No render job yet — the writer queues one the moment a script is stored.')),
      h('h3.dd-h', 'Actions'),
      h('div.op-actions',
        (p.status === 'ready' || p.status === 'approved') ? h('button.btn.btn-sm.btn-primary', { type: 'button', title: 'You posted it yourself — mark it done here', onclick: () => act(id, 'posted', null, reload) }, iconEl('check', 'ic-14'), 'Mark posted') : null,
        p.script && p.status !== 'rendering' && p.status !== 'queued' ? h('button.btn.btn-sm', { type: 'button', title: 'Queue it for the render worker again', onclick: () => act(id, 'rerender', null, reload) }, iconEl('refresh', 'ic-14'), 'Re-render') : null,
        h('button.btn.btn-sm', { type: 'button', onclick: () => act(id, 'archive', null, reload) }, iconEl('trash', 'ic-14'), 'Archive')),
      h('div.foot-note', 'Written by the studio writer from the lane’s own topics, rendered by the IRIS render worker (neural voice, word-timed captions, generated background). Posting is your tap — nothing is published without you.'),
    ],
  });
}
