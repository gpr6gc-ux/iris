// Command › Station — the owner's local hands, inside the one Command Center.
//
// The station is the StarNet-derived sidecar on the owner's PC (terminal, files, local MCP, consent prompts,
// overnight loops). Its own window is retired; this page is where it lives now. Two lanes of truth:
//   · THROUGH IRIS (works from any device): the station heartbeats every 60 s (iris.stations) and its runs
//     reach the event spine, so this page knows if it is up, what it is, and what it has done.
//   · DIRECT (works only in a browser on the same machine): the page probes http://127.0.0.1:<port> with
//     the pairing token the heartbeat published. Browsers allow a public HTTPS page to reach loopback; the
//     sidecar answers Chrome's private-network preflight and accepts the pairing token from this origin only.
//     When it answers, the live panels unlock: runs, pending consent prompts, projects, budget, E-STOP.
//
// HONEST STATES: no station ever registered · registered but offline (last heartbeat > 3 min) · online through
// IRIS but not reachable from THIS browser (a phone, another PC) · linked. Each is said in words, never implied.
// The visual language is StarNet's HUD — mono readouts, a LINK lamp — because the owner asked to keep it.

import { h, fmt, clear } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { pill, emptyState, toast, confirmDialog } from '../ui.js';
import { load, card, kpi, skelRows } from './_common.js';
import { S } from '../store.js';

const ONLINE_MS = 3 * 60 * 1000;

export function render(root) {
  const host = h('div.stack');
  root.append(host);
  let stop = null;
  load(host, 'iris2_station', {}, (d, el, reload) => { stop = draw(d, el, reload); },
    { skel: h('div.stack.tight', skelRows(1, 'h-80'), skelRows(4, 'h-56')) });
  return () => { try { if (stop) stop(); } catch { /* ignore */ } };
}

function draw(d, el, reload) {
  const stations = (d && d.stations) || [];
  const runs = (d && d.recent_runs) || [];
  const consent = (d && d.consent_pending) || [];
  const st = stations[0] || null;
  const online = !!(st && st.online);
  const status = (st && st.status) || {};

  if (!st) {
    el.append(card('Station', 'the local hands of IRIS — not registered yet', [
      emptyState('No station has checked in', 'Start it on your PC: double-click start-iris-station.cmd in Desktop\\IRIS-Station. It runs headless, sends a heartbeat here every minute, and this page fills in. Nothing to install beyond Node.'),
      howTo(),
    ]));
    return null;
  }

  // ---- HUD header
  const lamp = h('span.st-lamp', { class: online ? 'on' : 'off' });
  const linkPill = h('span.st-link', { class: online ? 'via-iris' : 'offline' }, lamp, h('span.st-link-t', online ? 'ONLINE · via IRIS' : 'OFFLINE'));
  const hud = h('div.st-hud',
    h('div.st-hud-l',
      h('div.st-kicker', 'IRIS STATION'),
      h('div.st-name', st.name || st.id, st.headless ? pill('headless', 'status neutral nodot') : null),
      h('div.st-meta', [
        st.platform, st.version && st.version.harness ? 'v' + String(st.version.harness).replace(/^v/, '') : null,
        st.version && st.version.node ? 'node ' + st.version.node : null, '127.0.0.1:' + st.port,
      ].filter(Boolean).join(' · '))),
    h('div.st-hud-r', linkPill,
      h('div.st-seen', online ? `heartbeat ${fmt.ago(st.last_seen_at)}` : `last seen ${fmt.ago(st.last_seen_at)}`)));
  el.append(hud);

  el.append(h('div.kpis',
    kpi('activity', 'live runs', fmt.int(status.runs_live || 0), online ? 'on the station now' : 'as of last heartbeat', (status.runs_live || 0) > 0 ? 'good' : ''),
    kpi('dollar', 'station spend today', fmt.money(status.spent_today || 0, 2), 'its own ledger, not IRIS', ''),
    kpi(status.halted ? 'stop' : 'check', 'E-STOP', status.halted ? 'engaged' : 'clear', status.halted ? 'cron · loops · night shift stood down' : 'autonomy armed', status.halted ? 'bad' : 'good'),
    kpi('clock', 'uptime', status.uptime_s ? fmt.dur(status.uptime_s) : '—', status.started_at ? 'since ' + fmt.date(status.started_at) : '', '')));

  if (!online) {
    el.append(h('div.notice.warn', iconEl('alert'), h('span', h('b', 'The station is not running. '),
      `Its last heartbeat was ${fmt.ago(st.last_seen_at)}. Start it on your PC (start-iris-station.cmd) and this page comes alive within a minute.`)));
  }

  // ---- DIRECT link panel: probe 127.0.0.1 from this browser
  const liveHost = h('div', { dataset: { role: 'station-live' } });
  el.append(liveHost);
  const stopLive = online ? mountLive(liveHost, st, reload) : (liveHost.append(h('div.st-linkcard.off',
    iconEl('link', 'ic-14'), h('span', 'Direct link is only tried while the station is online.'))), null);

  // ---- consent asks waiting in Approvals (through IRIS)
  if (consent.length) {
    el.append(card('Consent asks waiting in Approvals', `${consent.length} — decide them in Approvals; the station is holding those runs`,
      h('div.list', consent.map((c) => h('div.item', h('div.grow', h('b', c.title), h('div.sub', `${fmt.ago(c.at)} · ${c.risk || 'medium'} risk`)))))));
  }

  // ---- what it has done (spine)
  el.append(card('What the station has done', `${runs.length ? fmt.int(runs.length) + ' events on the spine · 7 days' : 'nothing on the spine in 7 days'}`,
    runs.length ? h('div.st-events', runs.slice(0, 20).map((r) => h('div.st-ev',
      h('span.st-ev-t', fmt.timeS(r.at)), h('b.st-ev-type', r.type), h('span.st-ev-actor', r.actor || ''),
      r.detail ? h('span.st-ev-detail', r.detail) : null)))
      : emptyState('Quiet', 'Runs that start on the station show up here the moment they hit the spine.')));

  el.append(card('How this works', null, howTo()));
  return stopLive;
}

function howTo() {
  return h('div.st-howto',
    h('p', h('b', 'One Command Center. '), 'The station is a background process on your PC. It sends a heartbeat here every minute and its runs go to the same event spine as every IRIS agent, so this page is true from your phone too. When you open the Command Center on the PC itself, the page also talks to the station directly at 127.0.0.1 — that is when the live panels (runs, consent prompts, projects, E-STOP) appear.'),
    h('p', h('b', 'Start it: '), 'Desktop › IRIS-Station › start-iris-station.cmd. ', h('b', 'Keep it running at logon: '), 'run install-autostart.cmd once. ',
      h('b', 'Retire the old window: '), 'already done — opening 127.0.0.1:8787 in a browser now redirects here.'),
    h('p.small.muted', 'Security: a random website in your browser cannot drive the station. The sidecar only accepts this site’s origin, answers Chrome’s private-network check, and requires the per-launch pairing token that only the heartbeat carries to IRIS and only you can read.'));
}

// ---- the direct lane ------------------------------------------------------------------------------------
function mountLive(host, st, reload) {
  const base = `http://127.0.0.1:${st.port}`;
  const headers = { 'X-Iris-Pairing': st.pairing_token || '' };
  const opts = (extra = {}) => Object.assign({ mode: 'cors', cache: 'no-store', headers }, extra);
  // Chrome's Local Network Access wants the target address space declared; other browsers ignore the field.
  const fetchOpts = (extra = {}) => { const o = opts(extra); try { o.targetAddressSpace = 'loopback'; } catch { /* ignore */ } return o; };
  // /api/health answers plain "ok"; everything else answers JSON — read text and parse when it parses
  const get = (p) => fetch(base + p, fetchOpts()).then(async (r) => { if (!r.ok) throw new Error(`${p} → ${r.status}`); const t = await r.text(); try { return JSON.parse(t); } catch { return t.trim(); } });
  const post = (p, body) => fetch(base + p, fetchOpts({ method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body || {}) }))
    .then((r) => { if (!r.ok) throw new Error(`${p} → ${r.status}`); return r.json(); });

  const box = h('div.st-linkcard.probing', iconEl('link', 'ic-14'), h('span', `Trying the direct link to 127.0.0.1:${st.port}…`));
  host.append(box);
  let timer = null; let dead = false;

  const fail = (why) => {
    if (dead) return;
    clear(host);
    host.append(h('div.st-linkcard.off', iconEl('link', 'ic-14'),
      h('span', h('b', 'Not reachable from this browser. '), why, ' ', 'The station is online through IRIS; the live panels appear only in a browser on the PC that runs it.')));
  };

  const paint = async () => {
    let health;
    try { health = await Promise.race([get('/api/health'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500))]); }
    catch (e) { fail(e && /timeout/.test(e.message) ? 'It did not answer within 2.5 s.' : 'The browser blocked the loopback request or the station refused this origin.'); return false; }
    let ver, snap, halt, budget, projects, runs;
    try {
      [ver, snap, halt, budget, projects, runs] = await Promise.all([
        get('/api/version'), get('/api/state/snapshot'), get('/api/halt'), get('/api/budget/status'), get('/api/projects'), get('/api/runs?agent=*&limit=12'),
      ]);
    } catch (e) { fail(`Reached it, but the pairing token was refused (${e.message}). Restart the station so it publishes a fresh token.`); return false; }
    if (dead) return true;
    clear(host);
    host.append(h('div.st-linkcard.on', h('span.st-lamp.on'), h('span', h('b', 'LINKED'), ` · direct to 127.0.0.1:${st.port} · ${ver.harness || ver.app || 'station'} · health ${typeof health === 'string' ? health : (health.ok === false ? 'degraded' : 'ok')}`)));

    // consent prompts waiting on the station itself (the live, in-turn kind)
    const prompts = snap.prompts || [];
    const promptsCard = card('Waiting for you on the station', prompts.length ? `${prompts.length} permission prompt${prompts.length === 1 ? '' : 's'} — a run is paused until you answer` : 'no prompts',
      prompts.length ? h('div.list', prompts.map((p) => h('div.item',
        h('div.grow', h('b', `${p.agentId || 'agent'} asks permission`), h('div.sub', `run ${String(p.runId).slice(0, 8)} · prompt ${String(p.promptId).slice(0, 8)}`)),
        h('div.actions',
          h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: () => decide(p, 'once') }, 'Allow once'),
          h('button.btn.btn-sm', { type: 'button', onclick: () => decide(p, 'session') }, 'This session'),
          h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => decide(p, 'deny') }, 'Deny')))))
        : h('div.small.muted', 'Nothing is waiting. Prompts a run raises while you are away go to Approvals instead.'));
    const decide = async (p, decision) => {
      try { const r = await post('/api/consent', { runId: p.runId, promptId: p.promptId, decision }); toast({ title: r.ok ? `Answered: ${decision}` : 'Prompt already gone', kind: r.ok ? 'success' : 'warn' }); paint(); }
      catch (e) { toast({ title: 'Could not answer', message: e.message, kind: 'error' }); }
    };
    host.append(promptsCard);

    // live + recent runs
    const live = snap.runs || []; const hist = runs.runs || [];
    host.append(card('Runs', `${live.length} live · ${hist.length} recent`, [
      live.length ? h('div.list', live.map((r) => h('div.item', h('span.st-lamp.on'), h('div.grow', h('b', r.agentId || 'agent'), h('div.sub', `${r.source || 'run'} · started ${fmt.ago(r.startedAt)} · ${String(r.runId).slice(0, 8)}`))))) : null,
      hist.length ? h('div.st-runs', hist.map((r) => h('div.st-run',
        h('span.st-run-when', fmt.ago(r.ts || r.endedAt)),
        h('b.st-run-agent', r.agentId || 'agent'),
        pill(r.reason || 'done', `status ${r.reason === 'done' ? 'good' : r.reason === 'error' ? 'bad' : 'neutral'} nodot`),
        h('span.st-run-title', r.title || r.deliverable || ''),
        r.usd ? h('span.st-run-usd', fmt.money(r.usd, 3)) : null,
        r.model ? h('span.st-run-model', r.model) : null)))
        : h('div.small.muted', 'No runs recorded on this station yet.'),
    ]));

    // projects + budget + E-STOP
    const projs = projects.projects || [];
    host.append(h('div.row',
      h('div.f1', card('Projects on this PC', `${projs.length} known${projs.some((p) => p.blessed) ? ' · blessed ones can be worked autonomously' : ''}`,
        projs.length ? h('div.list', projs.map((p) => h('div.item', h('div.grow', h('b', p.name || p.root), h('div.sub.mono', p.root)), p.blessed ? pill('blessed', 'status good nodot') : pill('unblessed', 'status neutral nodot'))))
          : h('div.small.muted', 'No project folders registered on the station.'))),
      h('div.f1', card('Station governor', 'its own caps, separate from IRIS spend caps', [
        h('div.st-kv', h('span', 'spent today'), h('b', fmt.money(budget.spentToday || 0, 2))),
        h('div.st-kv', h('span', 'lifetime'), h('b', fmt.money(budget.lifetime || 0, 2))),
        h('div.st-kv', h('span', 'runs'), h('b', fmt.int(budget.runs || 0))),
        h('div.st-kv', h('span', 'caps'), h('b', ['run', 'day', 'global'].map((k) => `${k} ${fmt.money((budget.caps || {})[k === 'run' ? 'perRun' : k === 'day' ? 'perDay' : 'global'] || 0, 0)}`).join(' · '))),
        h('div.op-actions',
          halt.halted
            ? h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: async () => { if (!(await confirmDialog({ title: 'Resume the station', message: 'Lifts the E-STOP: cron, loops and the night shift arm again. Grants and budgets are untouched.', confirmText: 'Resume' }))) return; try { await post('/api/halt/resume', { confirm: true }); toast({ title: 'Station resumed', kind: 'success' }); paint(); } catch (e) { toast({ title: 'Could not resume', message: e.message, kind: 'error' }); } } }, iconEl('play', 'ic-14'), 'Resume')
            : h('button.btn.btn-sm.btn-danger', { type: 'button', onclick: async () => { if (!(await confirmDialog({ title: 'E-STOP the station', message: 'Kills every live run, aborts cron, loops and the night shift, and keeps them down until you resume. Nothing else changes.', confirmText: 'E-STOP', danger: true }))) return; try { const r = await post('/api/halt', {}); toast({ title: 'E-STOP engaged', message: `${r.halted || 0} run${r.halted === 1 ? '' : 's'} killed`, kind: 'warn' }); paint(); if (reload) reload(); } catch (e) { toast({ title: 'Could not halt', message: e.message, kind: 'error' }); } } }, iconEl('stop', 'ic-14'), 'E-STOP'),
          h('span.small.muted', halt.halted ? 'engaged — nothing autonomous runs on the station' : 'armed')),
      ]))));
    return true;
  };

  paint().then((ok) => { if (ok && !dead) timer = setInterval(() => { paint(); }, 20000); });
  return () => { dead = true; if (timer) clearInterval(timer); };
}
