// Agents — an interactive canvas (pan/zoom/drag/fit) of the agent constellation with a node inspector,
// plus the roster and the live-thinking stream. Node size ∝ 7-day spend; halo when failing; edges = shared tasks.

import { h, fmt, clear, truncate } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { S, setCount, on } from '../store.js';
import { pill, emptyState, bindTooltip, segmented } from '../ui.js';
import { svgEl } from '../charts.js';
import { subscribeStream, primeStreamCursor } from '../realtime.js';
import { load, card, agentPill, skelRows } from './_common.js';

const W = 1000; const H = 520;

export function render(root, route, ctx) {
  const host = h('div.stack');
  root.append(host);
  let unsub = null; let unsubRt = null;
  const state = { agent: S.prefs.streamAgent || '', kind: 'all', events: [], setSelected: null };

  load(host, 'iris2_agents', { p_hours: 168 }, (d, el) => {
    setCount('agents', d.live_now);
    S.counts.agentsSub = `${fmt.int(d.live_now)} live · ${fmt.int(d.calls_today)} model calls today · ${fmt.money(d.cost_today_usd)}`;
    ctx && ctx.setSub(S.counts.agentsSub);

    const cons = d.constellation || { agents: [], edges: [] };
    const cv = canvas(cons, (slug) => setAgent(slug), (a) => showInspector(a));
    state.setSelected = cv.setSelected;

    const dormantN = (cons.agents || []).filter((a) => a.state === 'dormant').length;
    const legend = h('div.legend',
      pill('working now', 'status good'), pill('active · 24 h', 'status primary'),
      pill('idle · 7 d', 'status info'), pill(`dormant${dormantN ? ` · ${dormantN}` : ''}`, 'status neutral'),
      pill('failing', 'status warn'));
    const consCard = card(
      h('h2', [iconEl('agents', 'ic-16'), ' Constellation']),
      'drag to pan · scroll to zoom · drag a node to move it · click a node to inspect',
      [cv.el, h('div.agc-legend-row', legend,
        h('span.small.muted', 'size = work done (events · tasks · claims · spend) · dashed = not in the registry · halo = failing · edges = shared tasks'))],
      { cls: 'f15' });

    const roster = (d.roster || []).slice().sort((a, b) => (b.cost_7d_usd - a.cost_7d_usd) || (b.runs_7d - a.runs_7d));
    const rosterCard = card(h('h2', 'Roster'), '7 days',
      roster.length ? h('div.tbl-wrap', h('table.tbl.compact',
        h('thead', h('tr', h('th', 'Agent'), h('th.num', 'Runs'), h('th.num', 'Cost'), h('th', 'Idle'))),
        h('tbody', roster.map((r) => h('tr.clickable', { tabindex: 0, onclick: () => setAgent(r.agent), onkeydown: (e) => { if (e.key === 'Enter') setAgent(r.agent); } },
          h('td', h('b', r.agent)), h('td.num', fmt.int(r.runs_7d)), h('td.num', fmt.money(r.cost_7d_usd)),
          h('td', r.state === 'failing' ? pill('failing', 'status warn') : r.idle_s === 0 ? h('span.muted', 'live') : h('span.muted', fmt.age(r.idle_s))))))))
        : emptyState('No agents in the window', 'Runs in the last 7 days populate the roster.'),
      { flush: true, cls: 'f1' });
    const rh = rosterCard.querySelector('.card-head'); if (rh) rh.style.padding = '14px 16px 6px';
    el.append(h('div.row.wrap-md', consCard, rosterCard));

    // ---- inspector (populated on node click)
    const insHost = cv.inspectorHost;
    function showInspector(a) {
      clear(insHost);
      if (!a) { insHost.classList.remove('open'); return; }
      const st = a.failing ? 'failing' : (a.state === 'working' || a.state === 'running') ? 'running' : a.state === 'active' ? 'active' : a.state === 'dormant' ? 'dormant' : 'idle';
      const tone = st === 'failing' ? 'warn' : st === 'running' ? 'good' : st === 'active' ? 'info' : 'neutral';
      const kv = (k, v) => (v == null || v === '' || v === '—' ? null : h('div.agc-kv', h('span.k', k), h('span.v', v)));
      insHost.append(
        h('div.agc-ins-head', h('div.agc-ins-title', a.name || a.slug), pill(st, `status ${tone} nodot`),
          h('button.agc-ins-x', { type: 'button', 'aria-label': 'Close', onclick: () => showInspector(null) }, iconEl('close', 'ic-14'))),
        h('div.agc-ins-slug', a.slug),
        a.task ? h('div.agc-ins-task', a.task) : null,
        h('div.agc-ins-kvs',
          kv('Model', a.model), kv('7-day spend', fmt.money(a.spend_7d_usd)),
          kv('Tasks', fmt.int(a.tasks)), kv('Claims', fmt.int(a.claims))),
        h('div.agc-ins-actions',
          h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: () => setAgent(state.agent === a.slug ? '' : a.slug) },
            iconEl('activity', 'ic-14'), state.agent === a.slug ? 'Clear stream filter' : 'Filter stream'),
          h('button.btn.btn-sm', { type: 'button', onclick: () => showInspector(null) }, 'Close')));
      insHost.classList.add('open');
    }

    // ---- live thinking (unchanged behavior)
    const streamList = h('div.stream', { role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions' });
    const rtPill = h('span');
    const agentChips = h('div.chips');
    const paintRt = () => { clear(rtPill); const st = S.realtime; rtPill.append(pill(S.preview ? 'sample stream' : st.state === 'live' ? 'realtime' : st.state === 'polling' ? 'polling 30 s' : st.state === 'connecting' ? 'connecting…' : st.state === 'error' ? 'stream error' : 'idle', `status ${st.state === 'live' ? 'good' : st.state === 'error' ? 'bad' : st.state === 'polling' ? 'warn' : 'neutral'}`)); };
    paintRt(); unsubRt = on('realtime', paintRt);
    const kinds = segmented([{ key: 'all', label: 'All' }, { key: 'error', label: 'Errors' }, { key: 'llm', label: 'LLM' }, { key: 'claim', label: 'Claims' }, { key: 'tool', label: 'Tools' }], state.kind, (k) => { state.kind = k; paintStream(); }, { label: 'Event kind' });
    const streamCard = card(h('h2', 'Live thinking'), h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' } }, rtPill, kinds), [agentChips, streamList]);
    el.append(streamCard);

    const paintChips = () => {
      clear(agentChips);
      const all = h('button.fchip', { type: 'button', 'aria-pressed': state.agent ? 'false' : 'true', onclick: () => setAgent('') }, 'All agents', h('span.cnt', String(state.events.length)));
      agentChips.append(all);
      const counts = {}; for (const e of state.events) counts[e.agent] = (counts[e.agent] || 0) + 1;
      const names = [...new Set([...cons.agents.map((a) => a.slug), ...Object.keys(counts)])].filter((n) => counts[n]).sort((a, b) => counts[b] - counts[a]).slice(0, 10);
      for (const n of names) agentChips.append(h('button.fchip', { type: 'button', 'aria-pressed': state.agent === n ? 'true' : 'false', onclick: () => setAgent(state.agent === n ? '' : n) }, n, h('span.cnt', String(counts[n]))));
    };
    const paintStream = () => {
      clear(streamList);
      const evs = state.events.filter((e) => (!state.agent || e.agent === state.agent) && (state.kind === 'all' || e.kind === state.kind)).slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 80);
      if (!evs.length) { streamList.append(emptyState('Nothing in the stream yet', state.agent ? `No events from ${state.agent} in this window.` : 'Events arrive live over the iris:stream channel; polling takes over if the channel drops.')); return; }
      for (const e of evs) streamList.append(streamRow(e));
    };
    function setAgent(slug) {
      state.agent = slug || ''; S.prefs.streamAgent = state.agent;
      if (state.setSelected) state.setSelected(state.agent);
      paintChips(); paintStream();
      if (state.agent) streamCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    streamList.append(skelRows(5, 'h-40'));
    call('iris2_stream', { p_limit: 60 }).then((s) => {
      state.events = (s.events || []).slice();
      if (s.next_after) primeStreamCursor(s.next_after);
      paintChips(); paintStream();
      unsub = subscribeStream((fresh) => {
        const seen = new Set(state.events.map((e) => String(e.id)));
        const add = fresh.filter((e) => !seen.has(String(e.id)));
        if (!add.length) return;
        state.events = [...add, ...state.events].slice(0, 400);
        paintChips(); paintStream();
        streamList.querySelectorAll('.stream-row').forEach((r) => { if (add.some((e) => String(e.id) === r.dataset.id)) r.classList.add('fresh'); });
      });
    }).catch((e) => { clear(streamList); streamList.append(h('div.error-box', `Stream unavailable · ${e.code || 'error'}: ${e.message}`)); });
    if (state.agent) setAgent(state.agent);
  });
  return () => { if (unsub) unsub(); if (unsubRt) unsubRt(); };
}

function streamRow(e) {
  const stripe = e.kind === 'error' ? 'stripe-HIGH' : e.kind === 'llm' ? 'stripe-LLM' : e.kind === 'claim' ? 'stripe-GOOD' : e.kind === 'tool' ? 'stripe-GOOD' : 'stripe-INFO';
  const cost = e.cost_usd != null && e.cost_usd !== '' ? fmt.money(e.cost_usd, 3) : '—';
  const row = h('div.item.stream-row', { class: stripe, dataset: { id: String(e.id) }, tabindex: 0 },
    h('span.at', { title: fmt.date(e.at) }, fmt.timeS(e.at)), h('span.agent', agentPill(e.agent)),
    h('span.what', h('span', e.event || e.detail || '—'), e.detail && e.event ? h('span.d', e.detail) : null),
    h('span.cost', cost));
  bindTooltip(row, () => h('div', h('b', `${e.agent} · ${e.kind}${e.phase ? ` · ${e.phase}` : ''}`), h('div.muted', [e.tool ? `tool ${e.tool}` : null, e.model ? `model ${e.model}` : null, e.tokens_in != null ? `${fmt.int(e.tokens_in)} in / ${fmt.int(e.tokens_out)} out` : null, e.ms != null ? fmt.ms(e.ms) : null, e.session_ref ? `session ${e.session_ref}` : null].filter(Boolean).join(' · ') || fmt.date(e.at))));
  return row;
}

/** Deterministic force layout into the W×H world. */
function layout(agents, edges) {
  const n = agents.length; if (!n) return [];
  const idx = new Map(agents.map((a, i) => [a.slug, i]));
  const pos = agents.map((a, i) => { const t = (i / n) * Math.PI * 2; return { x: W / 2 + Math.cos(t) * W * 0.30, y: H / 2 + Math.sin(t) * H * 0.32 }; });
  const es = edges.map((e) => [idx.get(e.a), idx.get(e.b), Number(e.w) || 1]).filter(([a, b]) => a != null && b != null && a !== b);
  for (let it = 0; it < 260; it++) {
    const fx = new Array(n).fill(0); const fy = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = pos[i].x - pos[j].x; let dy = (pos[i].y - pos[j].y) * 1.3; const d2 = Math.max(2600, dx * dx + dy * dy); const f = 90000 / d2;
      dx /= Math.sqrt(d2); dy /= Math.sqrt(d2); fx[i] += dx * f; fy[i] += dy * f; fx[j] -= dx * f; fy[j] -= dy * f;
    }
    for (const [a, b, w] of es) { const dx = pos[b].x - pos[a].x; const dy = pos[b].y - pos[a].y; const d = Math.max(1, Math.hypot(dx, dy)); const f = (d - 210) * 0.02 * Math.min(2, w); fx[a] += dx / d * f; fy[a] += dy / d * f; fx[b] -= dx / d * f; fy[b] -= dy / d * f; }
    for (let i = 0; i < n; i++) { fx[i] += (W / 2 - pos[i].x) * 0.004; fy[i] += (H / 2 - pos[i].y) * 0.006; pos[i].x += Math.max(-10, Math.min(10, fx[i])); pos[i].y += Math.max(-10, Math.min(10, fy[i])); }
  }
  return pos;
}

const nodeState = (a) => a.failing ? 'failing' : (a.state === 'working' || a.state === 'running') ? 'running' : a.state === 'active' ? 'active' : a.state === 'dormant' ? 'dormant' : 'idle';

/** The interactive canvas. Returns { el, inspectorHost, setSelected }. */
function canvas(cons, onPick, onInspect) {
  const agents = cons.agents || []; const edges = cons.edges || [];
  const wrap = h('div.agc-wrap');
  const svg = svgEl('svg', { class: 'agc-svg', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet', role: 'application', 'aria-label': `${agents.length} agents, ${edges.length} shared-task edges. Drag to pan, scroll to zoom.` });
  const gRoot = svgEl('g', { class: 'agc-root' });
  const gEdges = svgEl('g'); const gNodes = svgEl('g');
  gRoot.appendChild(gEdges); gRoot.appendChild(gNodes); svg.appendChild(gRoot);
  wrap.appendChild(svg);

  const inspectorHost = h('div.agc-inspector');
  wrap.appendChild(inspectorHost);

  if (!agents.length) {
    wrap.appendChild(h('div.agc-empty', 'No agents reported in this window.'));
    return { el: wrap, inspectorHost, setSelected: () => {} };
  }

  const pos = layout(agents, edges);
  const byslug = new Map(agents.map((a, i) => [a.slug, i]));
  /* SIZE = WORK DONE, on whichever axis this agent works — same correction as the Cortex.
     Sizing by 7-day spend alone made a crawler with 445 events in 24 hours the same size as a seat
     that has never run, because it spends nothing through the ledger. Each axis is normalised
     against its own maximum and the LARGEST is taken, so being dominant on ANY one axis reads big. */
  const AXES = [(a) => a.events_24h, (a) => a.tasks, (a) => a.claims, (a) => a.spend_7d_usd];
  const AX_MAX = AXES.map((fn) => Math.max(1e-9, ...agents.map((a) => Number(fn(a)) || 0)));
  const workOf = (a) => Math.max(...AXES.map((fn, i) => (Number(fn(a)) || 0) / AX_MAX[i]));

  // edges
  const edgeEls = [];
  for (const e of edges) { const a = byslug.get(e.a); const b = byslug.get(e.b); if (a == null || b == null) continue; const ln = svgEl('line', { class: `agc-edge w${Math.min(3, Number(e.w) || 1)}` }); edgeEls.push({ ln, a, b }); gEdges.appendChild(ln); }
  const drawEdges = () => { for (const { ln, a, b } of edgeEls) { ln.setAttribute('x1', pos[a].x.toFixed(1)); ln.setAttribute('y1', pos[a].y.toFixed(1)); ln.setAttribute('x2', pos[b].x.toFixed(1)); ln.setAttribute('y2', pos[b].y.toFixed(1)); } };

  // nodes (readable cards)
  const nodeEls = [];
  agents.forEach((a, i) => {
    const st = nodeState(a);
    const scale = 1 + Math.sqrt(workOf(a)) * 0.5; // 1..1.5
    const unreg = a.registered === false;
    const cardW = Math.round(150 * scale); const cardH = Math.round(48 * scale);
    const g = svgEl('g', { class: `agc-node${unreg ? ' is-unregistered' : ''}`, tabindex: 0, role: 'button', 'aria-label': `${a.name || a.slug} · ${st}${unreg ? ' · not in the agent registry' : ''} · ${fmt.money(a.spend_7d_usd)} in 7 days` });
    g.dataset.slug = a.slug; g.dataset.idx = String(i);
    if (a.failing) g.appendChild(svgEl('rect', { class: 'agc-halo', x: -cardW / 2 - 4, y: -cardH / 2 - 4, width: cardW + 8, height: cardH + 8, rx: 13 }));
    g.appendChild(svgEl('rect', { class: `agc-card st-${st}`, x: -cardW / 2, y: -cardH / 2, width: cardW, height: cardH, rx: 11 }));
    g.appendChild(svgEl('circle', { class: `agc-dot st-${st}`, cx: -cardW / 2 + 15, cy: -cardH / 2 + 16, r: 5 }));
    g.appendChild(svgEl('text', { class: 'agc-name', x: -cardW / 2 + 28, y: -cardH / 2 + 20 }, truncate(a.name || a.slug, 16)));
    // the meta line names the axis this agent is actually big on, rather than always quoting spend
    const meta = Number(a.events_24h) > 0 ? `${fmt.int(a.events_24h)} events · 24h`
      : Number(a.tasks) > 0 ? `${fmt.int(a.tasks)} tasks`
      : Number(a.spend_7d_usd) > 0 ? `${fmt.money(a.spend_7d_usd)} · 7d` : 'no activity';
    g.appendChild(svgEl('text', { class: 'agc-meta', x: -cardW / 2 + 15, y: cardH / 2 - 12 }, `${st} · ${meta}`));
    gNodes.appendChild(g);
    nodeEls.push({ g, i, slug: a.slug });
    bindTooltip(g, () => h('div', h('b', `${a.name || a.slug} · ${st}`), h('div.muted', `${a.task || '—'}`),
      h('div.muted', `${fmt.int(a.events_24h)} events · 24h · ${fmt.money(a.spend_7d_usd)} · 7d · ${fmt.int(a.tasks)} tasks · ${fmt.int(a.claims)} claims${a.model && a.model !== '—' ? ` · ${a.model}` : ''}`),
      unreg ? h('div.agc-unreg-note', 'Not in the agent registry — seen in the event stream only.') : null));
  });
  const positionNodes = () => { for (const { g, i } of nodeEls) g.setAttribute('transform', `translate(${pos[i].x.toFixed(1)},${pos[i].y.toFixed(1)})`); };
  positionNodes(); drawEdges();

  // view transform (pan/zoom)
  const view = { tx: 0, ty: 0, scale: 1 };
  const apply = () => gRoot.setAttribute('transform', `translate(${view.tx.toFixed(1)},${view.ty.toFixed(1)}) scale(${view.scale.toFixed(3)})`);
  const svgSize = () => { const r = svg.getBoundingClientRect(); return { w: r.width || W, h: r.height || H, rect: r }; };
  const clampScale = (s) => Math.max(0.35, Math.min(2.6, s));

  const fit = () => {
    const xs = pos.map((p) => p.x); const ys = pos.map((p) => p.y);
    const minX = Math.min(...xs) - 90, maxX = Math.max(...xs) + 90, minY = Math.min(...ys) - 40, maxY = Math.max(...ys) + 40;
    const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
    // world coords map through the svg viewBox (W×H) then CSS-scaled; work in viewBox units
    const s = clampScale(Math.min(W / bw, H / bh) * 0.95);
    view.scale = s; view.tx = (W - bw * s) / 2 - minX * s; view.ty = (H - bh * s) / 2 - minY * s;
    apply(); paintZoom();
  };

  const zoomLabel = h('span.agc-zoom-label', '100%');
  const paintZoom = () => { zoomLabel.textContent = `${Math.round(view.scale * 100)}%`; };
  const zoomAt = (cx, cy, factor) => {
    const ns = clampScale(view.scale * factor);
    const wx = (cx - view.tx) / view.scale, wy = (cy - view.ty) / view.scale;
    view.scale = ns; view.tx = cx - wx * ns; view.ty = cy - wy * ns; apply(); paintZoom();
  };
  // convert a client point to viewBox coordinates
  const toVB = (clientX, clientY) => { const { rect } = svgSize(); return { x: (clientX - rect.left) / (rect.width || W) * W, y: (clientY - rect.top) / (rect.height || H) * H }; };

  svg.addEventListener('wheel', (e) => { e.preventDefault(); const p = toVB(e.clientX, e.clientY); zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0016)); }, { passive: false });

  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    const nodeG = e.target.closest && e.target.closest('.agc-node');
    const p = toVB(e.clientX, e.clientY);
    if (nodeG) { const i = +nodeG.dataset.idx; drag = { type: 'node', i, g: nodeG, slug: nodeG.dataset.slug, sx: p.x, sy: p.y, ox: pos[i].x, oy: pos[i].y, moved: false }; }
    else { drag = { type: 'pan', sx: e.clientX, sy: e.clientY, otx: view.tx, oty: view.ty, moved: false }; svg.classList.add('grabbing'); }
    try { svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.type === 'pan') {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      const { rect } = svgSize(); const kx = W / (rect.width || W), ky = H / (rect.height || H);
      view.tx = drag.otx + dx * kx; view.ty = drag.oty + dy * ky; apply();
    } else {
      const p = toVB(e.clientX, e.clientY); const dx = p.x - drag.sx, dy = p.y - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      pos[drag.i].x = (drag.ox + dx / view.scale); pos[drag.i].y = (drag.oy + dy / view.scale);
      drag.g.setAttribute('transform', `translate(${pos[drag.i].x.toFixed(1)},${pos[drag.i].y.toFixed(1)})`); drawEdges();
    }
  });
  const endDrag = (e) => {
    if (drag && !drag.moved && drag.type === 'node') { const a = agents[drag.i]; setSelected(a.slug); onInspect(a); }
    svg.classList.remove('grabbing'); drag = null;
    try { svg.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  // keyboard: Enter/Space on a focused node opens the inspector
  gNodes.addEventListener('keydown', (e) => { const g = e.target.closest && e.target.closest('.agc-node'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); const a = agents[+g.dataset.idx]; setSelected(a.slug); onInspect(a); } });

  function setSelected(slug) {
    for (const { g, slug: s } of nodeEls) g.classList.toggle('selected', !!slug && s === slug);
  }

  // controls
  const ctrlBtn = (icon, label, fn) => h('button.agc-ctrl', { type: 'button', title: label, 'aria-label': label, onclick: fn }, iconEl(icon, 'ic-14'));
  const controls = h('div.agc-controls',
    ctrlBtn('plus', 'Zoom in', () => zoomAt(W / 2, H / 2, 1.2)),
    ctrlBtn('minus', 'Zoom out', () => zoomAt(W / 2, H / 2, 1 / 1.2)),
    zoomLabel,
    ctrlBtn('target', 'Fit to content', () => fit()));
  wrap.appendChild(controls);

  // initial fit after the element is measured
  requestAnimationFrame(() => fit());
  setTimeout(() => fit(), 60);

  return { el: wrap, inspectorHost, setSelected };
}
