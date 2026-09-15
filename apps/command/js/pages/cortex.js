// Cortex — the living command center. A full-viewport Canvas view of IRIS as a neural organism:
// a central nucleus (spend vs cap · gates · autonomy), agent nodes in an organic force field
// (size = 7-day spend, glow = live state), and REAL events flowing as particles into the core
// (live over iris:stream + the iris:events spine; recent seeded from iris2_events). Honest states
// only — motion is ambient (breathing/drift); particles fire on real events, never invented ones.

import { h, fmt, clear } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { S, on } from '../store.js';
import { navigate } from '../router.js';
import { subscribeStream } from '../realtime.js';
import { getClient } from '../auth.js';
import { load } from './_common.js';

const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// theme-aware palette read from the design tokens (re-read on theme change)
function palette() {
  const g = getComputedStyle(document.documentElement);
  const v = (n, f) => { const x = g.getPropertyValue(n).trim(); return x || f; };
  return {
    primary: v('--primary', '#8b7cf6'),
    good: v('--good', '#38b26f'),
    warn: v('--warn', '#d8a34a'),
    bad: v('--critical', v('--sev-high', '#e5674e')),
    info: v('--sev-info', '#5b9bd5'),
    fg: v('--foreground', '#e8e8ea'),
    muted: v('--muted-foreground', '#9a9aa2'),
    border: v('--border', '#2a2a31'),
    card: v('--card', '#141417'),
    bg: v('--background', '#0c0c0e'),
  };
}

const stateColor = (st, pal) =>
  st === 'failing' ? pal.bad :
  (st === 'working' || st === 'running') ? pal.good :
  st === 'active' ? pal.primary :
  st === 'dormant' ? pal.border : pal.info;

const nodeState = (a) => a.failing ? 'failing'
  : (a.state === 'working' || a.state === 'running') ? 'running'
  : a.state === 'active' ? 'active'
  : a.state === 'dormant' ? 'dormant' : 'idle';

const kindColor = (kind, pal) =>
  kind === 'error' ? pal.bad :
  kind === 'llm' ? pal.primary :
  kind === 'tool' ? pal.good :
  kind === 'claim' ? pal.good : pal.info;

export function render(root, route, ctx) {
  const host = h('div.cortex-full');
  root.append(host);
  const page = document.getElementById('page');
  if (page) page.classList.add('has-cortex');

  let stop = null;
  load(host, 'iris2_agents', { p_hours: 168 }, (d, el) => { stop = mount(d, el); });

  return () => {
    try { if (stop) stop(); } catch (e) { /* ignore */ }
    if (page) page.classList.remove('has-cortex');
  };
}

function mount(data, host) {
  const cons = (data && data.constellation) || { agents: [], edges: [] };
  const agents = cons.agents || [];
  const edges = cons.edges || [];
  let pal = palette();

  // ---- DOM: canvas + HUD overlays ----------------------------------------
  const canvas = h('canvas.cortex-canvas', { 'aria-hidden': 'true' });
  const hud = h('div.cortex-hud');

  const rtPill = h('span.cx-rt');
  const header = h('div.cx-header',
    h('div.cx-title', h('span.cx-kicker', 'IRIS'), h('h2', 'Cortex'),
      h('span.cx-sub', 'the living map — every agent, every signal, in real time')),
    h('div.cx-head-right', rtPill));

  const coreReadout = h('div.cx-core-readout');   // center overlay stats
  const kpiStrip = h('div.cx-kpis');
  const legend = h('div.cx-legend',
    legendDot('running', pal.good, 'working'),
    legendDot('active', pal.primary, 'active · 24h'),
    legendDot('idle', pal.info, 'idle'),
    legendDot('dormant', pal.border, 'dormant'),
    legendDot('failing', pal.bad, 'failing'),
    h('span.cx-leg', h('span.cx-leg-ring'), h('span', 'unregistered')));
  const ticker = h('div.cx-ticker', { role: 'log', 'aria-live': 'off' });
  const tickerWrap = h('div.cx-ticker-wrap', h('div.cx-ticker-head', iconEl('activity', 'ic-14'), h('span', 'event spine'), h('span.cx-ticker-count')), ticker);
  const inspector = h('div.cx-inspector', { hidden: true });

  hud.append(header, kpiStrip, coreReadout, legend, tickerWrap, inspector);

  /* REGISTRY COVERAGE. Ten of the agents on this canvas were never added to brain.agents — they are
     n8n workers observed in the event stream. They do most of the work (98.6% of the last 24h of
     events at the time this was written) and nothing governs, budgets or audits them by name. That
     is a finding, not a rendering detail, so it is stated on the page rather than left for someone
     to notice that the busy nodes have dashed rings. */
  const unreg = Number(data && data.unregistered_workers) || 0;
  const cov = data && data.registry_coverage_pct;
  if (unreg > 0) {
    hud.append(h('button.cx-coverage', {
      type: 'button',
      title: 'Open the agent registry',
      onclick: () => navigate('/agents'),
    },
      iconEl('alert', 'ic-14'),
      h('span.cx-cov-n', fmt.int(unreg)),
      h('span.cx-cov-l', unreg === 1 ? 'unregistered worker' : 'unregistered workers'),
      cov != null ? h('span.cx-cov-pct', `${fmt.num(cov, 1)}% of activity is from a registered agent`) : null));
  }

  if (!agents.length) {
    hud.append(h('div.cx-empty',
      h('div.cx-empty-orb'),
      h('h3', 'No agents reporting yet'),
      h('p', 'When agents run in the last 7 days they appear here as living nodes. The nucleus still shows live system state.')));
  }
  host.append(canvas, hud);

  // ---- simulation state ---------------------------------------------------
  const ctx = canvas.getContext('2d');
  let W = 0, Hh = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
  const core = { x: 0, y: 0, r: 46, pulse: 0, activity: 0 };
  /* NODE SIZE = WORK DONE, on whichever axis this agent actually works.
     This was sized by 7-day spend alone, and on real data that was close to useless: the busiest
     thing in the whole system (universal-crawler, 445 events in 24h) spends $0 through the ledger,
     so it rendered at the 9px floor — the same size as a seat that has never run. Meanwhile a
     single $9 agent took the entire scale.
     Each axis is normalised against its own maximum and the LARGEST is taken, not the sum: an
     agent that is dominant on ANY one axis reads as big. That is the point — a zero-spend crawler
     and a quiet expensive analyst are both important, for different reasons, and a sum would let
     one axis drown the other exactly as spend did. */
  const maxOf = (fn) => Math.max(1e-9, ...agents.map((a) => Number(fn(a)) || 0));
  const AXES = [
    (a) => a.events_24h,       // observed activity — what the stream saw
    (a) => a.tasks,            // work assigned through the task tree
    (a) => a.claims,           // knowledge filed for review
    (a) => a.spend_7d_usd,     // money actually spent
  ];
  const maxima = AXES.map(maxOf);
  const workOf = (a) => Math.max(...AXES.map((fn, i) => (Number(fn(a)) || 0) / maxima[i]));

  const nodes = agents.map((a, i) => {
    const st = nodeState(a);
    return {
      slug: a.slug, name: a.name || a.slug, st, raw: a,
      registered: a.registered !== false,
      work: workOf(a),
      r: 10 + Math.sqrt(workOf(a)) * 24,   // 10..34, sqrt so area reads proportional
      x: 0, y: 0, bx: 0, by: 0, vx: 0, vy: 0,
      phase: Math.random() * Math.PI * 2,
      pulse: 0, i,
    };
  });
  const bySlug = new Map(nodes.map((n) => [n.slug, n]));
  let particles = [];
  let hovered = null;

  /* The HUD floats over the canvas — legend bottom-left, event spine bottom-right, KPIs top-right,
     the coverage callout top-left. A node that settles under one of them is unreadable AND
     unclickable, which is how the busiest worker can end up hidden behind the ticker. Push each
     node out of whichever panel it landed in, along the shortest axis. */
  function hudRects() {
    const hr = host.getBoundingClientRect();
    const boxes = [];
    for (const el of hud.querySelectorAll('.cx-legend, .cx-ticker-wrap, .cx-kpis, .cx-coverage, .cx-header')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      boxes.push({ x0: r.left - hr.left - 10, y0: r.top - hr.top - 10, x1: r.right - hr.left + 10, y1: r.bottom - hr.top + 10 });
    }
    return boxes;
  }
  let HUD_BOXES = [];
  /* The event-spine panel GROWS as events arrive (0 → 7 rows), so boxes measured at layout time go
     stale and a node that was clear ends up behind it. Re-measure and re-settle the base positions
     whenever the HUD changes shape. Cheap, and it runs off a rAF so a burst of events costs one pass. */
  let reflowQueued = false;
  function reflowHud() {
    if (reflowQueued) return;
    reflowQueued = true;
    requestAnimationFrame(() => {
      reflowQueued = false;
      if (!W || !Hh) return;
      HUD_BOXES = hudRects();
      for (const nd of nodes) { nd.x = nd.bx; nd.y = nd.by; pushOutOfHud(nd); nd.bx = nd.x; nd.by = nd.y; }
      if (REDUCED) draw(0);
    });
  }
  function pushOutOfHud(nd) {
    for (const b of HUD_BOXES) {
      if (nd.x + nd.r < b.x0 || nd.x - nd.r > b.x1 || nd.y + nd.r < b.y0 || nd.y - nd.r > b.y1) continue;
      // shortest escape: left, right, up or down
      const dl = nd.x + nd.r - b.x0, dr = b.x1 - (nd.x - nd.r);
      const du = nd.y + nd.r - b.y0, dd = b.y1 - (nd.y - nd.r);
      const m = Math.min(dl, dr, du, dd);
      if (m === dl) nd.x = b.x0 - nd.r;
      else if (m === dr) nd.x = b.x1 + nd.r;
      else if (m === du) nd.y = b.y0 - nd.r;
      else nd.y = b.y1 + nd.r;
      nd.x = Math.max(nd.r + 8, Math.min(W - nd.r - 8, nd.x));
      nd.y = Math.max(nd.r + 74, Math.min(Hh - nd.r - 8, nd.y));
    }
  }

  // ---- layout: organic shell around the nucleus ---------------------------
  function layout() {
    HUD_BOXES = hudRects();
    const n = nodes.length; if (!n) return;
    const cx = W / 2, cy = Hh / 2;
    const ring = Math.max(120, Math.min(W, Hh) * 0.32);
    nodes.forEach((nd, i) => { const t = (i / n) * Math.PI * 2; nd.x = cx + Math.cos(t) * ring; nd.y = cy + Math.sin(t) * ring; });
    const idx = new Map(nodes.map((nd, i) => [nd.slug, i]));
    const es = edges.map((e) => [idx.get(e.a), idx.get(e.b), Number(e.w) || 1]).filter(([a, b]) => a != null && b != null && a !== b);
    for (let it = 0; it < 220; it++) {
      const fx = new Array(n).fill(0), fy = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        const d2 = Math.max(500, dx * dx + dy * dy), f = 26000 / d2, d = Math.sqrt(d2);
        dx /= d; dy /= d; fx[i] += dx * f; fy[i] += dy * f; fx[j] -= dx * f; fy[j] -= dy * f;
      }
      for (const [a, b, w] of es) { const dx = nodes[b].x - nodes[a].x, dy = nodes[b].y - nodes[a].y, d = Math.max(1, Math.hypot(dx, dy)), f = (d - 150) * 0.02 * Math.min(2, w); fx[a] += dx / d * f; fy[a] += dy / d * f; fx[b] -= dx / d * f; fy[b] -= dy / d * f; }
      for (let i = 0; i < n; i++) {
        // keep a comfortable shell distance from the nucleus
        const dx = nodes[i].x - cx, dy = nodes[i].y - cy, d = Math.max(1, Math.hypot(dx, dy));
        const target = ring * (nodes[i].st === 'running' ? 0.82 : nodes[i].st === 'dormant' ? 1.16 : 1);
        const rf = (target - d) * 0.03; fx[i] += dx / d * rf; fy[i] += dy / d * rf;
        nodes[i].x += Math.max(-14, Math.min(14, fx[i])); nodes[i].y += Math.max(-14, Math.min(14, fy[i]));
        // clamp inside viewport
        nodes[i].x = Math.max(nodes[i].r + 8, Math.min(W - nodes[i].r - 8, nodes[i].x));
        nodes[i].y = Math.max(nodes[i].r + 74, Math.min(Hh - nodes[i].r - 8, nodes[i].y));
        pushOutOfHud(nodes[i]);
      }
    }
    nodes.forEach((nd) => { nd.bx = nd.x; nd.by = nd.y; });
    core.x = cx; core.y = cy;
  }

  function resize() {
    const r = host.getBoundingClientRect();
    // width from the host box (fills the content column); height to the viewport bottom (robust
    // even if the page container isn't height-constrained). Desktop has no bottom tab bar.
    W = Math.max(320, r.width);
    Hh = Math.max(320, (window.innerHeight - r.top - 2) || r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = Hh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
    if (REDUCED) draw(0);   // static single paint
  }

  // ---- core stats from KPIs ----------------------------------------------
  const coreStat = { spend: null, cap: null, gatesGreen: null, gatesTotal: null, paused: false, needs: null };
  function readKpis() {
    const k = S.kpis || {};
    coreStat.spend = k.spend_today_usd; coreStat.cap = k.spend_cap_usd;
    const g = k.gates || {}; coreStat.gatesGreen = g.green; coreStat.gatesTotal = g.total;
    coreStat.needs = k.needs_you;
    paintHud();
  }
  function paintHud() {
    clear(kpiStrip);
    const stat = (label, value, tone) => h('button.cx-kpi', { class: tone ? `tone-${tone}` : '', type: 'button', onclick: () => navigate(label === 'need you' ? '/decisions' : label === 'gates' ? '/governance' : '/governance') },
      h('span.cx-kpi-v', value), h('span.cx-kpi-l', label));
    const pct = coreStat.cap ? coreStat.spend / coreStat.cap : 0;
    kpiStrip.append(
      stat('need you', coreStat.needs != null ? fmt.int(coreStat.needs) : '—', coreStat.needs > 0 ? 'warn' : ''),
      stat('spend today', coreStat.spend != null ? `${fmt.money(coreStat.spend)}` : '—', pct >= 1 ? 'bad' : pct >= 0.8 ? 'warn' : 'good'),
      stat('gates', coreStat.gatesTotal != null ? `${fmt.int(coreStat.gatesGreen)}/${fmt.int(coreStat.gatesTotal)}` : '—', (coreStat.gatesGreen === coreStat.gatesTotal && coreStat.gatesTotal) ? 'good' : 'warn'));
    clear(coreReadout);
    const pctTxt = coreStat.cap ? `${Math.round((coreStat.spend / coreStat.cap) * 100)}%` : '—';
    coreReadout.append(
      h('div.cx-core-agents', fmt.int(nodes.length)),
      h('div.cx-core-label', nodes.length === 1 ? 'agent' : 'agents'),
      h('div.cx-core-cap', `${pctTxt} of daily cap`));
  }

  // ---- realtime status pill ----------------------------------------------
  function paintRt() {
    clear(rtPill);
    const st = S.realtime;
    const label = S.preview ? 'sample stream' : st.state === 'live' ? 'live' : st.state === 'polling' ? 'polling 30s' : st.state === 'connecting' ? 'connecting…' : st.state === 'error' ? 'stream error' : 'idle';
    const tone = st.state === 'live' ? 'good' : st.state === 'error' ? 'bad' : st.state === 'polling' ? 'warn' : 'idle';
    rtPill.append(h('span.cx-rt-dot', { class: `t-${tone}` }), h('span', label));
  }

  // ---- event ticker + particle spawning ----------------------------------
  let tickerRows = [];
  function pushTicker(label, kind, at) {
    tickerRows.unshift({ label, kind, at: at || new Date().toISOString() });
    tickerRows = tickerRows.slice(0, 7);
    clear(ticker);
    for (const r of tickerRows) {
      ticker.append(h('div.cx-tick', { class: `k-${r.kind || 'info'}` },
        h('span.cx-tick-dot'), h('span.cx-tick-t', fmt.timeS ? fmt.timeS(r.at) : ''), h('span.cx-tick-x', r.label)));
    }
    const cnt = tickerWrap.querySelector('.cx-ticker-count'); if (cnt) cnt.textContent = tickerRows.length ? `${tickerRows.length}` : '';
    reflowHud();   // the panel just changed height — keep nodes out from under it
  }
  function spawnFor(slug, kind) {
    const n = slug && bySlug.get(slug);
    core.activity = Math.min(1, core.activity + 0.5);
    if (!n) { core.pulse = 1; return; }
    n.pulse = 1;
    if (REDUCED) return;
    particles.push({ fx: n.x, fy: n.y, tx: core.x, ty: core.y, t: 0, speed: 0.012 + Math.random() * 0.01, color: kindColor(kind, pal), target: n });
    if (particles.length > 160) particles = particles.slice(-160);
  }

  // ---- animation loop -----------------------------------------------------
  let raf = null, t0 = performance.now();
  function draw(now) {
    const time = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, Hh);
    // ambient vignette
    const grad = ctx.createRadialGradient(core.x, core.y, 20, core.x, core.y, Math.max(W, Hh) * 0.7);
    grad.addColorStop(0, withAlpha(pal.primary, 0.06)); grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, Hh);

    // links core -> node
    ctx.lineWidth = 1;
    for (const n of nodes) {
      const st = n.st;
      ctx.globalAlpha = st === 'running' ? 0.28 : st === 'dormant' ? 0.06 : 0.12;
      ctx.strokeStyle = stateColor(st, pal);
      ctx.beginPath(); ctx.moveTo(core.x, core.y); ctx.lineTo(n.x, n.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // shared-task edges (faint)
    ctx.strokeStyle = pal.border; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
    for (const e of edges) { const a = bySlug.get(e.a), b = bySlug.get(e.b); if (!a || !b) continue; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.globalAlpha = 1;

    // particles (real events flowing into the nucleus)
    for (const p of particles) {
      p.t += p.speed;
      const x = p.fx + (p.tx - p.fx) * ease(p.t), y = p.fy + (p.ty - p.fy) * ease(p.t);
      ctx.globalAlpha = 1 - p.t * 0.4;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    particles = particles.filter((p) => { if (p.t >= 1) { core.pulse = 1; return false; } return true; });

    // nodes
    for (const n of nodes) {
      if (!REDUCED) {
        // gentle breathing drift around base
        n.x = n.bx + Math.sin(time * 0.5 + n.phase) * 4;
        n.y = n.by + Math.cos(time * 0.4 + n.phase) * 4;
      }
      const col = stateColor(n.st, pal);
      const breath = REDUCED ? 0 : (Math.sin(time * 1.4 + n.phase) * 0.5 + 0.5);
      const isLive = n.st === 'running';
      const glow = (isLive ? 14 : 5) + breath * (isLive ? 10 : 3) + n.pulse * 22;
      // halo
      if (n.st === 'failing') { ctx.globalAlpha = 0.28 + (REDUCED ? 0 : breath * 0.2); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 10, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.shadowColor = col; ctx.shadowBlur = glow;
      // a dormant seat is present-but-idle, not dust: keep it legible enough to read as a deliberate
      // node. Below ~0.6 alpha on --border it disappears against the vignette entirely.
      ctx.fillStyle = withAlpha(n.st === 'dormant' ? pal.muted : col, n.st === 'dormant' ? 0.42 : 0.92);
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      /* UNREGISTERED: observed in the stream, absent from brain.agents. Drawn with a dashed ring so
         the canvas states the difference instead of quietly presenting them as governed agents. */
      if (!n.registered) {
        ctx.shadowBlur = 0; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.5;
        ctx.strokeStyle = withAlpha(pal.warn, 0.85); ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 4, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.shadowColor = col; ctx.shadowBlur = glow;
      }
      ctx.shadowBlur = 0;
      // inner core dot
      ctx.fillStyle = withAlpha(pal.bg, 0.55); ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 0.42, 0, Math.PI * 2); ctx.fill();
      // ring on hover
      if (hovered === n) { ctx.strokeStyle = pal.fg; ctx.globalAlpha = 0.9; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
      // label for larger / live / hovered nodes
      if (n.r > 15 || isLive || hovered === n) {
        ctx.fillStyle = pal.fg; ctx.globalAlpha = 0.92; ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(clip(n.name, 18), n.x, n.y + n.r + 15); ctx.globalAlpha = 1;
      }
      n.pulse *= 0.94;
    }

    // nucleus (IRIS core)
    drawCore(time);

    if (!REDUCED) raf = requestAnimationFrame(draw);
  }

  function drawCore(time) {
    const breath = REDUCED ? 0.5 : (Math.sin(time * 1.1) * 0.5 + 0.5);
    core.activity *= 0.98;
    const paused = coreStat.paused;
    const glowCol = paused ? pal.warn : pal.primary;
    const pct = coreStat.cap ? Math.min(1.2, coreStat.spend / coreStat.cap) : 0;
    // outer aura
    ctx.shadowColor = glowCol; ctx.shadowBlur = 30 + breath * 20 + core.activity * 40 + core.pulse * 30;
    ctx.fillStyle = withAlpha(glowCol, 0.16);
    ctx.beginPath(); ctx.arc(core.x, core.y, core.r + 16 + core.pulse * 8, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // spend ring (arc)
    ctx.lineWidth = 5; ctx.strokeStyle = withAlpha(pal.border, 0.9);
    ctx.beginPath(); ctx.arc(core.x, core.y, core.r + 8, 0, Math.PI * 2); ctx.stroke();
    if (coreStat.cap) {
      const spendCol = pct >= 1 ? pal.bad : pct >= 0.8 ? pal.warn : pal.good;
      ctx.strokeStyle = spendCol; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(core.x, core.y, core.r + 8, -Math.PI / 2, -Math.PI / 2 + Math.min(1, pct) * Math.PI * 2); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    // gates ring (segments)
    if (coreStat.gatesTotal) {
      const seg = coreStat.gatesTotal, gap = 0.06;
      for (let i = 0; i < seg; i++) {
        const a0 = -Math.PI / 2 + (i / seg) * Math.PI * 2 + gap, a1 = -Math.PI / 2 + ((i + 1) / seg) * Math.PI * 2 - gap;
        ctx.strokeStyle = i < coreStat.gatesGreen ? pal.good : pal.bad; ctx.globalAlpha = 0.8; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(core.x, core.y, core.r + 18, a0, a1); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // nucleus body
    const ng = ctx.createRadialGradient(core.x, core.y - core.r * 0.3, 4, core.x, core.y, core.r);
    ng.addColorStop(0, withAlpha(glowCol, 0.95)); ng.addColorStop(1, withAlpha(glowCol, 0.35));
    ctx.fillStyle = ng; ctx.beginPath(); ctx.arc(core.x, core.y, core.r * (0.9 + breath * 0.08 + core.pulse * 0.06), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = withAlpha(pal.bg, 0.35); ctx.beginPath(); ctx.arc(core.x, core.y, core.r * 0.5, 0, Math.PI * 2); ctx.fill();
    core.pulse *= 0.92;
  }

  // ---- interaction --------------------------------------------------------
  function nodeAt(mx, my) {
    let best = null, bd = 1e9;
    for (const n of nodes) { const d = Math.hypot(mx - n.x, my - n.y); if (d < n.r + 8 && d < bd) { bd = d; best = n; } }
    return best;
  }
  function onMove(e) {
    const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    const n = nodeAt(mx, my);
    if (n !== hovered) { hovered = n; canvas.style.cursor = n ? 'pointer' : 'default'; paintInspector(n, mx, my); if (REDUCED) draw(0); }
    else if (n) paintInspector(n, mx, my);
  }
  function paintInspector(n, mx, my) {
    if (!n) { inspector.hidden = true; return; }
    const a = n.raw; clear(inspector);
    const tone = n.st === 'failing' ? 'bad' : n.st === 'running' ? 'good' : n.st === 'active' ? 'primary' : 'idle';
    inspector.append(
      h('div.cx-ins-top', h('span.cx-ins-dot', { class: `t-${tone}` }), h('b', n.name), h('span.cx-ins-st', n.st)),
      a.task ? h('div.cx-ins-task', clip(a.task, 90)) : null,
      h('div.cx-ins-kv',
        kv('events · 24h', fmt.int(a.events_24h)), kv('7-day spend', fmt.money(a.spend_7d_usd)),
        kv('tasks', fmt.int(a.tasks)), kv('claims', fmt.int(a.claims)),
        a.model && a.model !== '—' ? kv('model', a.model) : null),
      // an unregistered worker is real and busy but ungoverned — say which, and why it matters
      n.registered ? null : h('div.cx-ins-warn',
        h('b', 'Not in the agent registry.'),
        ' Seen in the event stream but absent from brain.agents, so no policy, budget or audit is scoped to it by name.'),
      h('div.cx-ins-hint', 'click to open in Agents'));
    inspector.hidden = false;
    const iw = 240, ih = inspector.offsetHeight || 120;
    let x = mx + 18, y = my + 18;
    if (x + iw > W) x = mx - iw - 18; if (y + ih > Hh) y = my - ih - 18;
    inspector.style.left = Math.max(8, x) + 'px'; inspector.style.top = Math.max(66, y) + 'px';
  }
  function onClick(e) {
    const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    const n = nodeAt(mx, my);
    if (n) { try { S.prefs.streamAgent = n.slug; } catch (_) { /* ignore */ } navigate('/agents'); return; }
    if (Math.hypot(mx - core.x, my - core.y) < core.r + 10) navigate('/mission');
  }
  function onLeave() { hovered = null; inspector.hidden = true; if (REDUCED) draw(0); }

  // ---- wire up ------------------------------------------------------------
  resize();
  readKpis(); paintRt();
  const ro = new ResizeObserver(() => resize());
  ro.observe(host);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);
  const offKpis = on('kpis', readKpis);
  const offMission = on('mission:data', () => readKpis());
  const offRt = on('theme', () => { pal = palette(); });
  const offRtState = on('realtime', paintRt);

  // live agent activity → node pulses + particles + ticker
  const unsubStream = subscribeStream((fresh) => {
    for (const e of fresh) {
      spawnFor(e.agent, e.kind);
      pushTicker(`${e.agent} · ${e.event || e.phase || e.kind}`, e.kind, e.at);
    }
  });

  // the new event spine: seed recent, then subscribe to iris:events for live spine events
  let spineChannel = null;
  call('iris2_events', { p_limit: 24 }).then((d) => {
    const evs = (d && d.events) || [];
    for (const ev of evs.slice(0, 7).reverse()) pushTicker(spineLabel(ev), spineKind(ev.event_type), ev.occurred_at);
  }).catch(() => { /* spine reader optional */ });
  if (!S.preview) {
    try {
      const sb = getClient();
      spineChannel = sb.channel('iris:events', { config: { broadcast: { self: false }, private: true } });
      spineChannel.on('broadcast', { event: 'event' }, (msg) => {
        const ev = msg && (msg.payload || msg); if (!ev || !ev.event_type) return;
        pushTicker(spineLabel(ev), spineKind(ev.event_type), ev.occurred_at);
        // pulse the actor's node if it maps to one
        const slug = String(ev.actor || '').replace(/^agent:/, '');
        spawnFor(slug, spineKind(ev.event_type));
      });
      spineChannel.subscribe();
    } catch (_) { spineChannel = null; }
  }

  // kick the loop
  if (REDUCED) draw(performance.now()); else raf = requestAnimationFrame(draw);

  // cleanup
  return () => {
    if (raf) cancelAnimationFrame(raf);
    try { ro.disconnect(); } catch (_) { /* ignore */ }
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('click', onClick);
    offKpis(); offMission(); offRt(); offRtState();
    if (unsubStream) unsubStream();
    if (spineChannel) { try { getClient().removeChannel(spineChannel); } catch (_) { /* ignore */ } }
  };
}

// ---- helpers --------------------------------------------------------------
function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function kv(k, v) { return h('div.cx-kv', h('span.k', k), h('span.v', v)); }
function legendDot(cls, color, label) { return h('span.cx-leg', h('span.cx-leg-dot', { style: { background: color } }), label); }
function spineLabel(ev) {
  const t = ev.event_type || 'event';
  const who = (ev.actor || '').replace(/^agent:/, '');
  const p = ev.payload || {};
  const tail = p.title || p.model || p.status || p.kind || (ev.entity_type ? ev.entity_id : '');
  return `${who ? who + ' · ' : ''}${t}${tail ? ' · ' + clip(tail, 30) : ''}`;
}
function spineKind(type) {
  const t = String(type || '');
  if (t.includes('fail') || t.includes('denied') || t.includes('error')) return 'error';
  if (t.startsWith('usage') || t.startsWith('task')) return 'llm';
  if (t.startsWith('approval') || t.startsWith('proposal')) return 'claim';
  if (t.startsWith('signal')) return 'info';
  return 'tool';
}

// alpha compositing helper: wrap any CSS color with an opacity via a canvas-friendly form.
// We can't reliably parse oklch to rgba, so we lean on globalAlpha for most cases and use
// color-mix where supported for fills that must carry their own alpha.
function withAlpha(color, a) {
  const c = String(color).trim();
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split('').map((x) => x + x).join('');
    const n = parseInt(hex, 16);
    if (!Number.isNaN(n) && hex.length === 6) return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  // oklch()/rgb()/named → use color-mix to fold in transparency (supported in modern Chromium)
  return `color-mix(in oklab, ${c} ${Math.round(a * 100)}%, transparent)`;
}
