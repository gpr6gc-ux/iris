// Investing — rewritten 2026-09-06 into a decision-first surface (replaces the old screener/pressure noise).
// Everything is computed deterministically in the backend (market.technicals / market.regime / market.decisions)
// and served by iris2_investing: a market-regime read ("is it shaky?"), the watchlist as clear calls, and the
// strongest actionable longs/shorts — each with a plain-English why, an options posture, and key levels.
// Only four-gate-passed, liquidity-filtered decisions surface as actionable. Decision-support, not advice.

import { h, fmt } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { pill, emptyState, openPanel, toast, segmented } from '../ui.js';
import { sparkline } from '../charts.js';
import { load, card, kpi } from './_common.js';

export function render(root, _route, ctx) {
  if (ctx && ctx.setSub) ctx.setSub('deterministic decisions · market regime · dealer positioning (estimated)');
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_investing', {}, draw);
  return () => {};
}

// ---- helpers ----------------------------------------------------------------
const dirClass = (dir) => (dir === 'long' ? 'long' : dir === 'short' ? 'short' : 'neutral');
const regimeTone = (st) => (st === 'calm' ? 'good' : st === 'normal' ? 'primary' : st === 'elevated' ? 'warn' : 'bad');
const spct = (v, d = 1) => (v == null ? '—' : fmt.signed(Number(v) * 100, d) + '%');
const pctb = (v) => (v == null ? '—' : Number(v).toFixed(2));
const clampw = (n) => Math.max(3, Math.min(100, Number(n) || 0));

function postureBadge(c) {
  return h('span.posture-badge', { class: dirClass(c.direction) }, c.posture || '—');
}
function convMeter(c) {
  return h('div.conv', { title: `Conviction ${c.conviction ?? '—'} / 100 (${c.band || '—'})` },
    h('div.conv-bar', { class: dirClass(c.direction) }, h('i', { style: { width: clampw(c.conviction) + '%' } })),
    h('span.conv-n.num', String(c.conviction ?? '—')));
}
const levelChip = (label, val, cls = '', title = '') => h('div.lvl', { class: cls, title }, h('span.lvl-k', label), h('span.lvl-v.num', val == null ? '—' : fmt.money(val)));

// Exact market times: everything is stored in UTC and rendered in America/New_York with DST handled by Intl.
const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const etTime = (iso) => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : ET.format(d); };
const etDay = (ymd) => (ymd ? fmt.day(ymd) : '—');

// Freshness states are computed server-side against the exchange session calendar (market.daily_state / intraday_state).
const STATE = {
  LIVE: ['live', 'good'], LAST_SESSION: ['last session', 'good'], DELAYED: ['delayed', 'warn'], STALE: ['stale', 'bad'],
  INCOMPLETE: ['incomplete', 'warn'], DISCONNECTED: ['disconnected', 'bad'], HALTED: ['halted', 'warn'], UNAVAILABLE: ['unavailable', 'bad'], REFERENCE: ['reference', 'neutral'],
};
function statePill(state, extra) {
  const [label, tone] = STATE[state] || [String(state || 'unknown').toLowerCase(), 'neutral'];
  return pill(extra ? `${label} · ${extra}` : label, `status ${tone} nodot`);
}
const stopBasisText = (b) => ({ sma20: '20-day SMA', sma50: '50-day SMA', bb_lower: 'lower Bollinger band', bb_upper: 'upper Bollinger band', fallback_5pct: 'constructed 5% level (not an observed level)' }[b] || b || 'observed level');
const kvRow = (k, v) => h('div.kv', h('div.k', k), h('div.v', v == null ? '—' : v));
const behindText = (n) => (n == null ? '' : n === 0 ? '' : n === 1 ? '1 session behind' : `${n} sessions behind`);

// One row of the feed status strip: dataset · state · exact as-of · what it covers.
function feedRow(name, f, opts = {}) {
  if (!f) return h('div.feed-row', h('span.feed-k', name), statePill('UNAVAILABLE'), h('span.feed-when', '—'));
  const when = opts.intraday ? etTime(f.as_of) : etDay(f.as_of);
  const bits = [];
  if (f.sessions_behind != null && f.sessions_behind > 0) bits.push(behindText(f.sessions_behind));
  if (opts.intraday && f.age_s != null) bits.push(`${Math.round(f.age_s / 60)} min old`);
  if (f.tickers) bits.push(`${fmt.int(f.tickers)} tickers`);
  if (f.coverage_vs_prior != null) bits.push(`${Math.round(Number(f.coverage_vs_prior) * 100)}% of prior session`);
  if (f.oi_business_date) bits.push(`OI as of ${etDay(f.oi_business_date)}`);
  if (f.symbols) bits.push(`${f.symbols} underlyings`);
  if (f.model_version) bits.push(f.model_version);
  if (opts.intraday && f.basis && String(f.basis).startsWith('received_at')) bits.push('receipt time (source time not recorded)');
  return h('div.feed-row', { title: [f.source, f.cadence, f.basis].filter(Boolean).join(' · ') },
    h('span.feed-k', name), statePill(f.state), h('span.feed-when.num', when), h('span.feed-bits.muted.small', bits.join(' · ')));
}

function whyChips(why) {
  return h('div.why', (why || []).map((f) => h('span.why-chip', { class: (Number(f.points) >= 0 ? 'up' : 'down'), title: `${f.label}: ${f.points > 0 ? '+' : ''}${f.points}` },
    h('span.why-t', f.text))));
}

// ---- decision card (used for watchlist-with-data, longs, shorts) -------------
function decisionCard(c, { compact = false } = {}) {
  if (!c || c.status === 'no_price_data' || c.status === 'insufficient_history') {
    const hist = c && c.status === 'insufficient_history';
    return h('div.dec-card.nodata', { title: c && c.note ? c.note : '' },
      h('div.dec-top', h('div.dec-id', h('b', c ? c.symbol : '—'), c && c.name ? h('span.dec-name', c.name) : null),
        pill(hist ? `${c.bars}/${c.bars_needed || 60} bars` : 'no history', 'status neutral nodot')),
      h('div.dec-note', c && c.note ? c.note : 'No price history'));
  }
  const stale = c.price_state === 'STALE' || c.status === 'stale';
  const el = h('div.dec-card.clickable', { class: dirClass(c.direction) + (stale ? ' is-stale' : ''), tabindex: 0,
    onclick: () => openSecurity(c.symbol),
    onkeydown: (e) => { if (e.key === 'Enter') openSecurity(c.symbol); } },
    h('div.dec-top',
      h('div.dec-id', postureBadge(c), h('b', c.symbol),
        c.chg_1d != null ? h('span.dec-chg', { class: c.chg_1d < 0 ? 'dn' : 'up' }, spct(c.chg_1d)) : null),
      convMeter(c)),
    c.name && !compact ? h('div.dec-name', c.name) : null,
    h('div.dec-headline', c.headline || ''),
    (c.price_state && c.price_state !== 'LAST_SESSION') || stale
      ? h('div.dec-state', statePill(stale ? 'STALE' : c.price_state, behindText(c.sessions_behind)), h('span.small.muted', ` close of ${etDay(c.as_of)}`))
      : null,
    h('div.dec-levels',
      levelChip('Entry', c.entry, '', 'last close of the session dated as_of'),
      levelChip('Invalidate', c.stop, 'stop', `invalidation level = ${stopBasisText(c.stop_basis)}`),
      levelChip('2R scenario', c.target, 'tgt', 'entry + 2 × (entry − stop): a scenario reference level, not a forecast'),
      h('div.lvl', { title: 'distance from entry to the invalidation level; not portfolio risk, not a maximum loss' },
        h('span.lvl-k', 'Stop dist.'), h('span.lvl-v.num', c.risk_pct == null ? '—' : (Number(c.risk_pct) * 100).toFixed(1) + '%'))),
    !compact ? whyChips(c.why) : null,
    !compact && c.evidence_families != null ? h('div.small.muted.dec-fam', `${c.families_agree ?? '—'} of ${c.evidence_families} evidence families agree · ${c.stop_basis ? 'stop = ' + stopBasisText(c.stop_basis) : ''}`) : null);
  return el;
}

// ---- regime banner ----------------------------------------------------------
function regimeBanner(reg) {
  if (!reg) return null;
  const tone = regimeTone(reg.state);
  const stab = Math.round(Number(reg.stability) || 0);
  const label = reg.shaky ? 'Tread carefully' : reg.state === 'calm' ? 'Constructive' : 'Neutral / selective';
  return h('div.regime', { class: tone },
    h('div.regime-l',
      h('div.regime-eyebrow', iconEl('activity', 'ic-14'), 'Market regime'),
      h('div.regime-state', reg.state ? reg.state.toUpperCase() : '—'),
      h('div.regime-say', label)),
    h('div.regime-r',
      h('div.regime-meter-row',
        h('span.small.muted', 'Stability'),
        h('div.regime-meter', h('i', { class: tone, style: { width: clampw(stab) + '%' } })),
        h('span.regime-stab.num', String(stab))),
      h('div.regime-explain', reg.explain || ''),
      reg.contrib ? h('div.regime-chips',
        Object.entries(reg.contrib).sort((a, b) => b[1] - a[1]).map(([k, v]) => h('span.rchip', h('span.rchip-k', k), h('span.rchip-v.num', String(v))))) : null));
}

// ---- main draw --------------------------------------------------------------
function draw(d, host, reload) {
  const reg = d.regime || null;
  const counts = d.counts || {};
  const fr = d.freshness || {};
  const wl = d.watchlist || [];
  const longs = (d.longs || []).slice(0, 6);
  const shorts = (d.shorts || []).slice(0, 6);
  const feeds = d.feeds || {};
  const pricesState = feeds.prices ? feeds.prices.state : (fr.prices_stale ? 'STALE' : 'LAST_SESSION');
  const stale = pricesState === 'STALE' || pricesState === 'UNAVAILABLE';
  const by = counts.by_status || {};

  // Feed status first: exact as-of times and coverage, before any number that depends on them.
  host.append(card(
    h('h2', 'Data status'),
    h('span.hint-text', `last completed session ${feeds.prices && feeds.prices.last_completed_session ? etDay(feeds.prices.last_completed_session) : '—'} · times in ET`),
    [h('div.feed-strip',
      feedRow('Prices', feeds.prices),
      feedRow('Decisions', feeds.decisions ? { ...feeds.decisions, state: feeds.prices ? feeds.prices.state : 'UNAVAILABLE', as_of: feeds.decisions.as_of } : null),
      feedRow('Options chains', feeds.chains, { intraday: true }),
      feedRow('Macro (FRED)', feeds.macro),
      feedRow('Fundamentals', feeds.fundamentals)),
    h('div.small.muted.feed-counts',
      `${fmt.int(counts.actionable)} actionable of ${fmt.int(counts.universe)} scored` +
      (by.watch ? ` · ${fmt.int(by.watch)} watch` : '') + (by.stale ? ` · ${fmt.int(by.stale)} stale` : '') + (by.insufficient ? ` · ${fmt.int(by.insufficient)} insufficient history` : '') +
      (counts.priced_tickers ? ` · price feed covers ${fmt.int(counts.priced_tickers)} tickers` : '') +
      (d.multidim_mode ? ` · multi-dim gate: ${d.multidim_mode === 'families' ? 'independent evidence families' : 'legacy factor count'}` : ''))],
    { flush: false, cls: 'f1' }));

  // What changed — the prioritized change queue (deterministic ranking of material decision changes + catalysts).
  const queueHost = h('div.stack');
  host.append(queueHost);
  loadChangeQueue(queueHost);

  host.append(regimeBanner(reg));

  if (stale) host.append(h('div.notice.warn', iconEl('alert'), h('span', h('b', 'Prices are stale. '), `Every decision below is computed from the ${feeds.prices && feeds.prices.as_of ? etDay(feeds.prices.as_of) : 'last loaded'} session and is not actionable until the feed catches up (${feeds.prices && feeds.prices.sessions_behind != null ? feeds.prices.sessions_behind + ' sessions behind' : 'feed not reporting'}).`)));
  else if (pricesState === 'DELAYED') host.append(h('div.notice', iconEl('clock'), h('span', h('b', 'One session behind. '), `Decisions use the ${feeds.prices && feeds.prices.as_of ? etDay(feeds.prices.as_of) : 'last loaded'} close; the next session loads after the provider's end of day.`)));

  // Watchlist
  const wlCards = wl.map((c) => decisionCard(c, { compact: true }));
  host.append(card(
    h('h2', 'Your watchlist'),
    h('span.hint-text', `the ${wl.length || 12} names you track · click any for the full read`),
    [wl.length ? h('div.dec-grid', wlCards) : emptyState('No watchlist decisions', 'Add symbols to market.underlyings.')],
    { flush: false, cls: 'f1' }));

  // Strongest signals — two columns
  const longCol = card(
    h('h2', [iconEl('revenue', 'ic-16'), ' Strongest longs']),
    counts.longs ? h('span.hint-text', `top ${longs.length} of ${fmt.int(counts.longs)}`) : null,
    [longs.length ? h('div.dec-stack', longs.map((c) => decisionCard(c))) : emptyState('No actionable longs', 'Nothing clears the gates right now.')],
    { cls: 'f1' });
  const shortCol = card(
    h('h2', [iconEl('markets', 'ic-16'), ' Strongest shorts']),
    counts.shorts ? h('span.hint-text', `top ${shorts.length} of ${fmt.int(counts.shorts)}`) : null,
    [shorts.length ? h('div.dec-stack', shorts.map((c) => decisionCard(c))) : emptyState('No actionable shorts', 'Nothing clears the gates right now.')],
    { cls: 'f1' });
  host.append(h('div.row.wrap-md', longCol, shortCol));

  host.append(h('div.foot-note', d.scope_note || 'Decision-support only — not advice. Signals are deterministic (a model never sets a number).'));

  // Options positioning — the signal read first (what's actionable), then the per-name dealer
  // structure. Each section is isolated: a failure in one never breaks the decisions or the other.
  const sigHost = h('div.stack');
  host.append(sigHost);
  loadPositioningSignals(sigHost);

  const posHost = h('div.stack');
  host.append(posHost);
  loadPositioning(posHost);
}

// ---- change queue (what materially changed) ---------------------------------
function loadChangeQueue(host) {
  load(host, 'iris2_investing_queue', { p_since_sessions: 3 }, renderChangeQueue, {
    onError: () => { host.replaceChildren(); },
  });
}

const changeTone = (kind) => (kind === 'direction' ? 'warn' : kind === 'unsurfaced' || kind === 'stale' ? 'bad' : 'good');

function changeRow(it) {
  const c = it.card || {};
  const dir = dirClass(it.direction);
  return h('div.chg-row.clickable', { tabindex: 0, onclick: () => openSecurity(it.symbol), onkeydown: (e) => { if (e.key === 'Enter') openSecurity(it.symbol); } },
    h('div.chg-l',
      pill(it.change || it.kind, `status ${changeTone(it.kind)} nodot`),
      h('b.chg-sym', it.symbol),
      c.conviction != null ? h('span.chg-conv.num', { class: dir }, `${c.posture || ''} ${it.conviction}`) : null),
    h('div.chg-mid', c.headline || ''),
    h('div.chg-r',
      (it.price_state && it.price_state !== 'LAST_SESSION') ? statePill(it.kind === 'stale' ? 'STALE' : it.price_state) : null,
      c.stop != null ? h('span.small.muted', `inval. ${fmt.money(c.stop)}`) : null));
}

function upcomingRow(u) {
  return h('div.cat-row',
    h('span.cat-when.num', u.when_et || '—'),
    pill(u.confirmed ? 'confirmed' : 'estimated', `status ${u.confirmed ? 'good' : 'neutral'} nodot`),
    u.ticker ? h('b.cat-tk', u.ticker) : null,
    h('span.cat-h', u.headline || u.event_type || u.kind || ''));
}

function renderChangeQueue(d, host) {
  const items = d.items || [];
  const upcoming = d.upcoming || [];
  const win = d.window || {};
  const cards = [];
  if (items.length) {
    cards.push(h('div.chg-list', items.slice(0, 12).map(changeRow)));
    if (items.length > 12) cards.push(h('div.small.muted', { style: { marginTop: '6px' } }, `+${items.length - 12} more changes in the last ${win.since_sessions || 3} sessions`));
  } else {
    cards.push(emptyState('Nothing changed', `No decision flipped, surfaced or went stale in the last ${win.since_sessions || 3} sessions. A quiet queue is a valid outcome.`));
  }
  host.append(card(
    h('h2', 'What changed'),
    h('span.hint-text', `${items.length} material changes · last ${win.since_sessions || 3} sessions · ranked`),
    cards, { flush: false, cls: 'f1' }));

  host.append(card(
    h('h2', 'Upcoming catalysts'),
    h('span.hint-text', 'scheduled events · next 21 days · ET · confirmed vs estimated'),
    [upcoming.length ? h('div.cat-list', upcoming.map(upcomingRow))
      : emptyState('No scheduled catalysts', 'No confirmed or estimated events in the next 21 days for the names you track or that are surfaced. Unscheduled announcements are never predicted here.')],
    { flush: false, cls: 'f1' }));
}

// ---- dealer positioning (Lattice · Pulse · Vector) --------------------------
function loadPositioning(host) {
  load(host, 'iris2_positioning', {}, renderPositioning, {
    onError: () => { host.replaceChildren(h('div.foot-note', 'Dealer positioning is warming up — the options feed populates SPY/QQQ/IWM on the next market-hours run.')); },
  });
}

const gexB = (v) => (v == null ? '—' : (v >= 0 ? '+' : '−') + '$' + (Math.abs(v) / 1e9).toFixed(2) + 'B');

function latticeChart(u) {
  const grid = (u.lattice || []).filter((g) => u.spot && Math.abs(g.k - u.spot) <= u.spot * 0.06);
  if (grid.length < 3) return h('div.small.muted', 'Not enough near-the-money strikes to map.');
  const maxAbs = Math.max(1, ...grid.map((g) => Math.abs(g.dg)));
  const rows = [...grid].sort((a, b) => b.k - a.k).map((g) => {
    const w = (Math.abs(g.dg) / maxAbs) * 48;
    const pos = g.dg >= 0;
    const isCW = u.call_wall != null && Math.abs(g.k - u.call_wall) < 0.5;
    const isPW = u.put_wall != null && Math.abs(g.k - u.put_wall) < 0.5;
    const nearSpot = u.spot != null && Math.abs(g.k - u.spot) <= Math.max(0.5, u.spot * 0.0015);
    return h('div.lat-row', { class: `${isCW ? 'cw' : ''} ${isPW ? 'pw' : ''} ${nearSpot ? 'spot' : ''}`, title: `Strike ${g.k}: dealer γ ${gexB(g.dg)} · call OI ${fmt.int(g.coi)} · put OI ${fmt.int(g.poi)}` },
      h('span.lat-k.num', fmt.int(g.k), isCW ? h('span.lat-tag.cw', 'call wall') : isPW ? h('span.lat-tag.pw', 'put wall') : nearSpot ? h('span.lat-tag.spot', 'spot') : null),
      h('div.lat-track', h('div.lat-mid'), h('div.lat-bar', { class: pos ? 'pos' : 'neg', style: pos ? { left: '50%', width: w + '%' } : { right: '50%', width: w + '%' } })));
  });
  return h('div.lattice', h('div.lat-axis', h('span', 'puts / short γ'), h('span', 'calls / long γ')), h('div.lat-rows', rows));
}

function posPanel(u) {
  const tone = u.regime === 'negative' ? 'bad' : u.regime === 'positive' ? 'good' : 'neutral';
  return h('div.stack.tight',
    h('div.kpis',
      kpi('layers', 'Net dealer GEX', gexB(u.net_gex), `${u.regime === 'negative' ? 'short gamma · amplifying' : u.regime === 'positive' ? 'long gamma · suppressing' : 'balanced'} · spot ${fmt.money(u.spot)}`, tone),
      kpi('target', 'Call wall', fmt.money(u.call_wall), 'largest call-gamma strike above spot · estimate, conditional context', 'good'),
      kpi('target', 'Put wall', fmt.money(u.put_wall), 'largest put-gamma strike below spot · estimate, conditional context', 'bad'),
      kpi('activity', 'Put/Call', u.put_call_oi_ratio == null ? '—' : Number(u.put_call_oi_ratio).toFixed(2), `OI ratio · ${u.pulse && u.pulse.pc_vol_ratio ? Number(u.pulse.pc_vol_ratio).toFixed(2) + '× put vol' : 'flow'}`, (u.put_call_oi_ratio || 0) > 1.2 ? 'warn' : '')),
    h('div.pos-vector', iconEl('compass', 'ic-16'), h('span', u.vector || '')),
    h('div.row.wrap-md',
      card(h('h3', 'Lattice — dealer gamma by strike'), h('span.hint-text', 'where dealers are positioned'), [latticeChart(u)], { cls: 'f16' }),
      card(h('h3', 'Pulse — flow pressure'), h('span.hint-text', 'delayed-chain proxy, not live tape'), [
        u.pulse ? h('div.stack.tight',
          h('div.detail-grid',
            h('div.kv', h('div.k', 'Put volume'), h('div.v.num', fmt.int(u.pulse.put_vol))),
            h('div.kv', h('div.k', 'Call volume'), h('div.v.num', fmt.int(u.pulse.call_vol))),
            h('div.kv', h('div.k', 'Put/Call vol'), h('div.v.num', u.pulse.pc_vol_ratio == null ? '—' : Number(u.pulse.pc_vol_ratio).toFixed(2)))),
          h('div.small.muted', { style: { marginTop: '6px' } }, 'Most-active strikes'),
          h('div.dec-levels', (u.pulse.top || []).slice(0, 5).map((t) => h('div.lvl', h('span.lvl-k', '$' + fmt.int(t.k)), h('span.lvl-v.num', fmt.compact(t.v)))))) : h('div.small.muted', 'No flow data'),
      ], { cls: 'f1' })));
}

function renderPositioning(d, host) {
  const us = d.underlyings || [];
  if (!us.length) { host.append(h('div.foot-note', 'Dealer positioning populates SPY/QQQ/IWM on the next options-feed run.')); return; }
  const wrap = h('div.stack.tight');
  const body = h('div');
  let active = us[0].symbol;
  const drawOne = () => { const u = us.find((x) => x.symbol === active) || us[0]; body.replaceChildren(posPanel(u)); };
  const seg = us.length > 1 ? segmented(us.map((u) => ({ key: u.symbol, label: u.symbol })), active, (v) => { active = v; drawOne(); }) : null;
  wrap.append(h('div.card-head', h('h2', 'Dealer positioning'), h('div.hint', seg || h('span.hint-text', `${us.length} of ${(d.coverage && d.coverage.watchlist) || '—'} · CBOE delayed`))), body);
  drawOne();
  host.append(card(null, null, [wrap], { cls: 'f1' }));
  host.append(h('div.foot-note', d.note || ''));
}

// ---- options positioning signals (deterministic 4-gate detector) ------------
const KIND_LABEL = { gamma_regime: 'Gamma regime', pin: 'Pin', flip: 'Gamma flip', call_wall: 'Call wall', put_wall: 'Put wall', flow: 'Unusual flow' };
const dirArrow = (dir) => (dir > 0 ? '▲' : dir < 0 ? '▼' : '•');
function sigTone(s) {
  if (s.direction > 0) return 'good';
  if (s.direction < 0) return 'bad';
  return s.behavior === 'amplifying' || s.behavior === 'flip_risk' ? 'warn' : 'neutral';
}
const toneToDir = (t) => (t === 'good' ? 'long' : t === 'bad' ? 'short' : 'neutral');

function sigConv(s) {
  const tone = sigTone(s);
  return h('div.conv', { title: `Conviction ${s.conviction}/100 (${s.band})` },
    h('div.conv-bar', { class: toneToDir(tone) }, h('i', { style: { width: clampw(s.conviction) + '%' } })),
    h('span.conv-n.num', String(s.conviction ?? '—')));
}

function gateChips(g) {
  g = g || {};
  const items = [['Fresh', g.fresh], ['Multi-dim', g.multidim], ['Verified', g.verified], ['Explained', g.explained]];
  return h('div.gates', items.map(([label, pass]) =>
    h('span.gate', { class: pass ? 'on' : 'off', title: label + (pass ? ' — met' : ' — not met') },
      iconEl(pass ? 'check' : 'close', 'ic-12'), label)));
}

function signalCard(s) {
  const tone = sigTone(s);
  return h('div.sig-card', { class: `${tone} ${s.surfaced ? 'surfaced' : 'watch'}`, tabindex: 0,
    onclick: () => openSignal(s), onkeydown: (e) => { if (e.key === 'Enter') openSignal(s); } },
    h('div.sig-top',
      h('div.sig-id',
        h('span.sig-sym', s.symbol),
        h('span.sig-kind', { class: tone }, KIND_LABEL[s.kind] || s.kind),
        s.direction ? h('span.sig-dir', { class: s.direction > 0 ? 'up' : 'dn' }, dirArrow(s.direction)) : null),
      sigConv(s)),
    h('div.sig-headline', s.headline || ''),
    gateChips(s.gates),
    h('div.sig-foot',
      h('span.sig-band', { class: tone }, s.band || '—'),
      Number(s.novelty) >= 0.8 ? pill('new', 'status primary nodot') : null,
      h('span.small.muted', `noise ${Math.round((Number(s.noise_prob) || 0) * 100)}%`),
      h('span.small.muted', `${s.confirmations || 0} confirmations`)));
}

function loadPositioningSignals(host) {
  load(host, 'iris2_positioning_signals', {}, renderSignals, { onError: () => { host.replaceChildren(); } });
}

function renderSignals(d, host) {
  const sigs = d.signals || [];
  if (!sigs.length) return; // nothing yet; the lattice section below still renders
  const counts = d.counts || {};
  const surfaced = sigs.filter((s) => s.surfaced);
  const watch = sigs.filter((s) => !s.surfaced);
  const body = [
    h('div.card-head',
      h('h2', [iconEl('zap', 'ic-16'), ' Positioning signals']),
      h('div.hint', h('span.hint-text', `${fmt.int(counts.surfaced || 0)} surfaced · ${fmt.int(counts.watch || 0)} watch · CBOE 15-min delayed`))),
    surfaced.length
      ? h('div.sig-grid', surfaced.map(signalCard))
      : emptyState('No signals clear the gates', 'The dealer-gamma structure is quiet — nothing passes fresh + multi-dim + verified right now.'),
  ];
  if (watch.length) {
    body.push(h('details.sig-watch',
      h('summary', `${watch.length} watch — gated out (one confirmation, or ranked below the top two per name)`),
      h('div.sig-grid.dim', watch.map(signalCard))));
  }
  body.push(h('div.foot-note', d.note || ''));
  host.append(card(null, null, body, { cls: 'f1' }));
}

function openSignal(s) {
  const tone = sigTone(s);
  const ev = s.evidence || {};
  const kvv = (k, v) => h('div.kv', h('div.k', k), h('div.v', v == null ? '—' : v));
  openPanel({
    kicker: [
      h('span.posture-badge', { class: toneToDir(tone) }, KIND_LABEL[s.kind] || s.kind),
      pill(`${s.band || '—'} · ${s.conviction ?? '—'}`, `status ${tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : 'neutral'} nodot`),
      s.surfaced ? pill('surfaced', 'status good nodot') : pill('watch', 'status neutral nodot'),
    ],
    title: `${s.symbol} · ${s.name || ''}`,
    sub: [h('span', `${s.behavior || ''} · ${s.regime ? 'regime ' + s.regime + ' · ' : ''}as of ${s.as_of ? fmt.day(s.as_of) : '—'} · not advice`)],
    body: [
      h('div.dec-headline.dd-headline', s.headline || ''),
      s.invalidation ? h('div.sig-invalid', iconEl('alert', 'ic-14'), h('span', h('b', 'Invalidation: '), s.invalidation)) : null,
      h('h3.dd-h', 'Why it fired'),
      h('div.dd-factors', (s.factors || []).map((f) => h('div.dd-fac',
        h('div.dd-fac-top', h('span.dd-fac-l', f.label || f.k)),
        h('div.dd-fac-t.muted.small', f.text || '')))),
      h('h3.dd-h', 'Gates'),
      gateChips(s.gates),
      s.gate_detail ? h('div.small.muted', { style: { marginTop: '6px' } },
        `verified on ${(s.gate_detail.verified && s.gate_detail.verified.contracts) || '—'} contracts across ${(s.gate_detail.verified && s.gate_detail.verified.expiries) || '—'} expiries · data ${(s.gate_detail.fresh && s.gate_detail.fresh.age_min) || '—'} min old · ${s.confirmations || 0} confirming dimensions`) : null,
      h('h3.dd-h', 'Evidence'),
      h('div.detail-grid',
        kvv('Spot', fmt.money(ev.spot)),
        kvv('Net dealer GEX', gexB(ev.net_gex)),
        kvv('Gamma flip', ev.zero_gamma == null ? '—' : fmt.money(ev.zero_gamma)),
        kvv('Call wall', fmt.money(ev.call_wall)),
        kvv('Put wall', fmt.money(ev.put_wall)),
        kvv('Pin strike', ev.pin_strike == null ? '—' : fmt.money(ev.pin_strike)),
        kvv('Noise probability', Math.round((Number(s.noise_prob) || 0) * 100) + '%'),
        kvv('Novelty', s.novelty == null ? '—' : Number(s.novelty).toFixed(2))),
      h('div.foot-note', 'Deterministic dealer-positioning signal — every score is a fixed function of the option structure (a model never sets a number). Dealer long-call / short-put convention on the CBOE 15-minute-delayed chain. Decision-support, not advice.'),
    ],
  });
}

// ---- graded outcomes (append-only publications → market.outcomes) ------------
function outcomesBlock(sym) {
  const host = h('div.dd-outcomes', h('div.small.muted', 'loading graded outcomes…'));
  call('iris2_investing_outcomes', { p_symbol: sym }).then((o) => {
    host.replaceChildren();
    const hz = (o && o.summary && o.summary.horizons) || {};
    const keys = Object.keys(hz);
    if (!keys.length) {
      host.append(h('div.small.muted', `No graded outcomes yet. ${o && o.pending != null ? fmt.int(o.pending) + ' publications are waiting for their horizon to complete' : 'Publications are graded 5, 10 and 20 sessions after the first eligible execution'} — until then there is no evidence either way.`));
    } else {
      host.append(h('div.detail-grid', keys.sort().map((k) => {
        const x = hz[k];
        return kvRow(`${k} · n=${x.n}`, `hit ${Math.round(x.hit_rate * 100)}% [${Math.round(x.hit_rate_ci95[0] * 100)}–${Math.round(x.hit_rate_ci95[1] * 100)}] · net ${spct(x.mean_ret_net)} · AR ${spct(x.mean_ar)} · ${x.validation_status}`);
      })));
    }
    const mine = (o && o.symbol_outcomes) || [];
    if (mine.length) host.append(h('div.small.muted', { style: { marginTop: '6px' } }, `${sym}: ` + mine.map((m) => `${m.horizon} ${spct(m.ret_net)} (${m.exec_session}→${m.exit_session})`).join(' · ')));
    host.append(h('div.small.muted', { style: { marginTop: '6px' } }, 'Execution = first close at or after eligibility (5 min after publication, or after the next open); 10 bp round trip; SPY benchmark; stops not applied because daily closes cannot order intrabar hits.'));
  }).catch((e) => { host.replaceChildren(h('div.small.muted', `Outcomes unavailable: ${e.message || e}`)); });
  return host;
}

// ---- drill-down -------------------------------------------------------------
async function openSecurity(sym) {
  let d;
  try { d = await call('iris2_investing_security', { p_symbol: sym }); }
  catch (e) { toast({ title: 'Could not load', message: `${e.code || 'error'}: ${e.message}`, kind: 'error' }); return; }
  const c = d.decision || {}; const te = d.technicals || {}; const fu = d.fundamentals || {}; const facs = d.factors || [];
  const hist = (d.history || []).map((x) => Number(x.c)).filter(Number.isFinite);
  const kv = (k, v) => h('div.kv', h('div.k', k), h('div.v', v == null ? '—' : v));

  openPanel({
    kicker: [postureBadge(c), c.band ? pill(`${c.band} conviction · ${c.conviction}`, `status ${dirClass(c.direction) === 'long' ? 'good' : dirClass(c.direction) === 'short' ? 'bad' : 'neutral'} nodot`) : null,
      c.has_fundamentals ? pill('fundamentals', 'status neutral nodot') : pill('technicals only', 'status neutral nodot')],
    title: `${c.symbol || sym} · ${c.name || ''}`,
    sub: [h('span', `${c.regime ? 'regime ' + c.regime + ' · ' : ''}as of ${c.as_of ? fmt.day(c.as_of) : '—'} · not advice`)],
    body: [
      hist.length > 2 ? h('div.dd-spark', sparkline(hist, { w: 460, h: 90, color: c.direction === 'short' ? 'var(--sev-high)' : 'var(--primary)', label: `${sym} — last ${hist.length} closes` })) : null,
      h('div.dec-headline.dd-headline', c.headline || ''),
      (c.price_state && c.price_state !== 'LAST_SESSION') ? h('div.dec-state', statePill(c.price_state, behindText(c.sessions_behind)), h('span.small.muted', ` close of ${etDay(c.as_of)}`)) : null,
      h('div.dec-levels.dd-levels',
        levelChip('Entry', c.entry, '', 'last close of the session dated as_of'),
        levelChip('Invalidate', c.stop, 'stop', `invalidation level = ${stopBasisText(c.stop_basis)}`),
        levelChip('2R scenario', c.target, 'tgt', 'entry + 2 × (entry − stop): a scenario reference level, not a forecast'),
        h('div.lvl', { title: 'distance from entry to the invalidation level; not portfolio risk, not a maximum loss' },
          h('span.lvl-k', 'Stop dist.'), h('span.lvl-v.num', c.risk_pct == null ? '—' : (Number(c.risk_pct) * 100).toFixed(1) + '%'))),
      h('h3.dd-h', 'Where the levels come from'),
      h('div.detail-grid',
        kv('Entry', (c.levels && c.levels.entry) || 'last close'),
        kv('Invalidation', (c.levels && c.levels.stop) || stopBasisText(c.stop_basis)),
        kv('2R scenario', (c.levels && c.levels.target) || 'entry + 2 × (entry − stop); a reference level, not a forecast'),
        kv('Evidence families', c.evidence_families != null ? `${c.families_agree ?? '—'} of ${c.evidence_families} agree (trend · momentum · valuation)` : '—'),
        kv('Price state', c.price_state ? `${c.price_state.toLowerCase().replace('_', ' ')}${c.sessions_behind ? ' · ' + behindText(c.sessions_behind) : ''}` : '—'),
        kv('Model', c.model_version || '—')),
      h('h3.dd-h', 'Expression ideas'),
      h('div.dd-idea', iconEl('target', 'ic-14'), h('span', c.options || '—'),
        h('span.small.muted', ' — an idea by direction and regime only. No contract, quote, implied volatility, expiry or liquidity was checked; this is not a proposed trade.')),
      h('h3.dd-h', 'Why'),
      h('div.dd-factors', (facs || []).map((f) => h('div.dd-fac',
        h('div.dd-fac-top', h('span.dd-fac-l', f.label), h('span.dd-fac-p.num', { class: Number(f.points) >= 0 ? 'up' : 'down' }, `${Number(f.points) > 0 ? '+' : ''}${f.points}`)),
        h('div.dd-fac-bar', h('i', { class: Number(f.points) >= 0 ? 'up' : 'down', style: { width: Math.min(100, Math.abs(Number(f.points)) * 4) + '%' } })),
        h('div.dd-fac-t.muted.small', f.text)))),
      h('h3.dd-h', 'Technicals'),
      h('div.detail-grid',
        kv('Close', fmt.money(te.close)),
        kv('RSI(14)', te.rsi14 == null ? '—' : Math.round(te.rsi14)),
        kv('Bollinger %B', pctb(te.bb_pctb)),
        kv('20-day', fmt.money(te.sma20)), kv('50-day', fmt.money(te.sma50)), kv('200-day', fmt.money(te.sma200)),
        kv('vs 200-day', spct(te.dist_sma200)),
        kv('1m / 3m', `${spct(te.ret_1m)} / ${spct(te.ret_3m)}`),
        kv('52w position', te.pos_52w == null ? '—' : Math.round(te.pos_52w * 100) + '%'),
        kv('Realized vol', te.rvol_20 == null ? '—' : Math.round(te.rvol_20 * 100) + '%'),
        kv('Trend', te.trend_stack === 1 ? 'up-stack' : te.trend_stack === -1 ? 'down-stack' : 'mixed'),
        kv('Cross', te.cross_state || '—')),
      c.has_fundamentals ? h('h3.dd-h', 'Fundamentals') : null,
      c.has_fundamentals ? h('div.detail-grid',
        kv('Revenue (TTM)', fu.revenue_ttm == null ? '—' : '$' + fmt.compact(fu.revenue_ttm)),
        kv('Net income', fu.net_income_ttm == null ? '—' : '$' + fmt.compact(fu.net_income_ttm)),
        kv('Equity', fu.equity == null ? '—' : '$' + fmt.compact(fu.equity)),
        kv('Debt', fu.debt == null ? '—' : '$' + fmt.compact(fu.debt)),
        kv('Exchange', fu.exchange || '—'),
        kv('Sector', fu.sic_desc || '—')) : null,
      h('h3.dd-h', 'Comparable outcomes'),
      outcomesBlock(sym),
      h('div.foot-note', 'Deterministic technical + fundamental read, regime-conditioned. Decision-support, not advice; the price is the close of the session dated above. Scores are heuristic, not probabilities.'),
    ],
  });
}
