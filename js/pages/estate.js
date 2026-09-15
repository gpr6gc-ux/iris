// Estate — the cashflow-rental finder. Live for-sale inventory, underwritten deterministically on read
// (re.underwrite), ranked passing-first. One question per card: does this rental cash-flow at your terms?
// Reads iris2_estate_deals; adjusts the standing assumptions via iris2_estate_set_assumptions. No noise.

import { h, fmt, clear, extLink } from '../util.js';
import { iconEl } from '../icons.js';
import { call } from '../api.js';
import { toast, pill, emptyState, openDialog } from '../ui.js';
import { load } from './_common.js';

export function render(root, route) {
  const host = h('div.stack');
  root.append(host);
  load(host, 'iris2_estate_deals', { p_limit: 60 }, draw);
  return () => {};
}

// ---- tone helpers (semantic state, not the accent) -------------------------------------------------
const gradeTone = (g) => ({ A: 'good', B: 'good', C: 'warn', D: 'warn', F: 'bad' }[String(g || '').toUpperCase()] || 'neutral');
const cfTone = (v) => (v > 0 ? 'good' : v < 0 ? 'bad' : 'warn');
const cocTone = (v, t) => (v >= (t || 0.08) ? 'good' : v >= 0.05 ? 'warn' : 'bad');
const dscrTone = (v, t) => (v >= (t || 1.30) ? 'good' : v >= 1.20 ? 'warn' : 'bad');
const capTone = (v) => (v >= 0.08 ? 'good' : v >= 0.06 ? 'warn' : 'neutral');
const plural = (n, s, p) => (Number(n) === 1 ? s : (p || s + 's'));

function confChip(d) {
  const label = String(d.rent_confidence || 'NONE');
  const tone = /HIGH/.test(label) ? 'good' : /MED/.test(label) ? 'warn' : /LOW$/.test(label) ? 'warn' : 'neutral';
  const p = pill(label.toLowerCase().replace('-', '–'), `status ${tone} nodot`);
  p.title = d.rent_method === 'api' ? 'RentCast rent estimate for this listing'
    : d.rent_method === 'hud_fmr_metro' ? 'HUD Fair Market Rent for the metro, by bedroom (conservative)'
    : d.rent_method === 'hud_fmr_state' ? 'HUD Fair Market Rent, VA statewide, by bedroom (most conservative)'
    : 'no rent source attached';
  return p;
}

// ---- the page --------------------------------------------------------------------------------------
function draw(data, host, reload) {
  const deals = (data && data.deals) || [];
  const bb = (data && data.buy_box) || {};
  const counts = (data && data.counts) || {};
  const connected = !!(data && data.connected);

  // Nothing to show: either the feed isn't connected, or it is but nothing survived the box.
  if (!deals.length) {
    host.append(headStrip(bb, deals, reload, connected, counts));
    host.append(connected
      ? emptyState('No listings clear your box yet',
          `${fmt.int(counts.active_listings || 0)} active ${plural(counts.active_listings || 0, 'listing')} on file, none priced inside your buy box. Widen the price ceiling or unit count under Adjust.`,
          h('button.btn.btn-sm', { type: 'button', onclick: () => adjust(bb, reload) }, iconEl('settings'), 'Adjust assumptions'))
      : emptyState('Connect RentCast to find live rentals',
          'This finder underwrites real for-sale listings against your buy box and ranks the ones that cash-flow. It needs a live for-sale feed. Set RENTCAST_API_KEY in n8n and the nightly ingest will fill this in — until then there is no honest inventory to show.',
          extLink('https://www.rentcast.io/api', h('span.btn.btn-sm', iconEl('external', 'ic-14'), 'RentCast API'))));
    return;
  }

  const passing = deals.filter((d) => d.uw && d.uw.passes).length;
  host.append(headStrip(bb, deals, reload, connected, counts, passing));

  const grid = h('div.rental-grid');
  for (const d of deals) grid.append(dealCard(d, bb));
  host.append(grid);
  host.append(h('div.foot-note', { style: { marginTop: '12px' } },
    data.note || 'Deterministic underwriting on live for-sale inventory. Decision-support, not advice.'));
}

// The situation line + the assumptions the deals were screened against + actions.
function headStrip(bb, deals, reload, connected, counts, passing) {
  const total = deals.length;
  const fail = total - (passing || 0);
  const line = total
    ? h('div.estate-line',
        h('b', `${fmt.int(total)} for-sale ${plural(total, 'listing')} screened`), ' · ',
        h('span', { class: passing ? 'tone-good' : 'muted' }, `${fmt.int(passing || 0)} ${plural(passing || 0, 'clears', 'clear')} your buy box`), ' · ',
        h('span.muted', `${fmt.int(fail)} ${plural(fail, 'falls', 'fall')} short at ${fmt.pct((bb.rate || 0) * 100, 1)} / ${fmt.pct((bb.down || 0) * 100, 0)} down`))
    : h('div.estate-line', connected
        ? h('span.muted', 'No inventory inside your buy box right now.')
        : h('span.muted', 'RentCast is not connected — no live for-sale inventory yet.'));

  const chip = (label, val, title) => { const c = h('span.chip', h('span.lbl', label), h('span.txt', val)); if (title) c.title = title; return c; };
  const chips = h('div.estate-chips',
    chip('Rate', fmt.pct((bb.rate || 0) * 100, 2), '30-yr fixed used for the mortgage payment'),
    chip('Down', fmt.pct((bb.down || 0) * 100, 0), 'Down payment — the rest is financed'),
    chip('Max price', fmt.compact(bb.max_price || 0)),
    chip('Units', `≤ ${bb.max_units || 1}`),
    chip('DSCR', `≥ ${fmt.num(bb.target_dscr || 1.3, 2)}`, 'Net operating income ÷ debt service — 1.0 means rent just covers the mortgage'),
    chip('Cash-on-cash', `≥ ${fmt.pct((bb.target_coc || 0) * 100, 0)}`, 'Annual cash flow ÷ cash invested'));

  const actions = h('div.estate-actions',
    h('button.btn.btn-sm', { type: 'button', onclick: () => adjust(bb, reload) }, iconEl('settings'), 'Adjust'),
    h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: reload }, iconEl('refresh'), 'Refresh'));

  return h('div.estate-head', h('div.estate-head-top', h('div.estate-head-left', h('div.estate-title', iconEl('estate'), h('h2', 'Cashflow rental finder')), line), actions), chips);
}

// One listing → one decision. Grade + PASS/FALLS-SHORT, the four numbers that decide a rental, plain-English verdict.
function dealCard(d, bb) {
  const u = d.uw || {};
  const pass = !!u.passes;
  const gt = gradeTone(u.grade);
  const badge = h('div.grade-badge', { class: `g-${gt}` }, h('div.g', String(u.grade || '—')), h('div.gs', u.score != null ? `${fmt.int(Math.round(u.score))}/100` : ''));

  const sub = [d.city ? `${d.city}, ${d.state || 'VA'}` : (d.state || 'VA'),
    String(d.property_type || 'home').replace(/_/g, ' '),
    d.beds != null ? `${fmt.num(d.beds, 0)} bd` : null,
    d.baths != null ? `${fmt.num(d.baths, 1)} ba` : null,
    d.sqft ? `${fmt.int(d.sqft)} sqft` : null,
    (d.units || 1) > 1 ? `${d.units} units` : null,
    d.days_on_market != null ? `${fmt.int(d.days_on_market)}d on market` : null,
  ].filter(Boolean).join(' · ');

  const head = h('div.rental-head',
    badge,
    h('div.rental-id', h('div.addr', d.address || '—'), h('div.sub', sub)),
    pill(pass ? 'CASH-FLOWS' : 'FALLS SHORT', `status ${pass ? 'good' : 'bad'}`));

  const priceRow = h('div.rental-price',
    h('div.pr', h('span.n', fmt.money(d.price, 0)), h('span.k', 'purchase')),
    h('div.pr', h('span.n', `${fmt.money(d.rent, 0)}/mo`), h('span.k', 'est. rent'), confChip(d)));

  const tile = (label, value, tone, title) => { const t = h('div.rmetric', { class: `tone-${tone}` }, h('div.rk', label), h('div.rv', value)); if (title) t.title = title; return t; };
  const metrics = h('div.rental-metrics',
    tile('Cash flow / door', `${fmt.money(u.cash_flow_per_unit != null ? u.cash_flow_per_unit : u.cash_flow_mo, 0)}/mo`, cfTone(u.cash_flow_mo), 'Monthly cash left per unit after every expense, reserves and the mortgage'),
    tile('Cash-on-cash', fmt.pct((u.cash_on_cash || 0) * 100, 1), cocTone(u.cash_on_cash || 0, bb.target_coc), 'First-year cash flow ÷ cash you put in'),
    tile('DSCR', fmt.num(u.dscr, 2), dscrTone(u.dscr || 0, bb.target_dscr), 'Net operating income ÷ mortgage. Below 1.0 = rent does not cover the loan'),
    tile('Cap rate', fmt.pct((u.cap_rate || 0) * 100, 1), capTone(u.cap_rate || 0), 'Net operating income ÷ price — the unleveraged yield'));

  const verdict = h('div.rental-verdict', { class: pass ? 'ok' : 'no' }, iconEl(pass ? 'check' : 'alert', 'ic-14'), h('span', verdictText(u, bb)));

  const footer = h('div.rental-foot',
    h('span.rf', `Cash to close ${fmt.money(u.cash_required, 0)}`),
    h('span.rf', `GRM ${fmt.num(u.grm, 1)}`),
    h('span.rf', `1% rule ${fmt.pct((u.one_pct || 0) * 100, 2)}`),
    h('span', { style: { marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' } },
      d.url && /^https?:/i.test(d.url) ? extLink(d.url, h('span.btn.btn-sm.btn-ghost', iconEl('external', 'ic-14'), 'Listing')) : null));

  return h('div.card.rental-card', { class: pass ? 'is-pass' : 'is-fail' }, head, priceRow, metrics, verdict, footer, whyDetails(u));
}

function verdictText(u, bb) {
  if (u.passes) {
    return `Clears your box — ${fmt.money(u.cash_flow_per_unit != null ? u.cash_flow_per_unit : u.cash_flow_mo, 0)}/mo per door after everything, mortgage covered ${fmt.num(u.dscr, 2)}×, ${fmt.pct((u.cash_on_cash || 0) * 100, 1)} cash-on-cash.`;
  }
  const misses = [];
  if ((u.dscr || 0) < 1.20) misses.push(`debt only covered ${fmt.num(u.dscr, 2)}× (needs 1.20)`);
  if ((u.cash_flow_mo || 0) <= 0) misses.push(`cash flow is ${fmt.money(u.cash_flow_mo, 0)}/mo`);
  if ((u.cash_on_cash || 0) < 0.05) misses.push(`only ${fmt.pct((u.cash_on_cash || 0) * 100, 1)} cash-on-cash`);
  const lead = misses[0] || 'returns below your targets';
  return `Falls short — ${lead} at ${fmt.pct((bb.down || 0) * 100, 0)} down / ${fmt.pct((bb.rate || 0) * 100, 1)}.`;
}

// Score breakdown, tucked away — the sub-scores behind the grade. Open only if you want it.
function whyDetails(u) {
  const w = u.why || {};
  const rows = [['Cash flow', w.cf], ['DSCR', w.dscr], ['Cash-on-cash', w.coc], ['Cap rate', w.cap], ['Price-to-rent', w.ptr]]
    .filter(([, v]) => v != null);
  if (!rows.length) return null;
  const det = h('details.rental-why');
  det.append(h('summary', 'Why this score'));
  const body = h('div.why-body');
  for (const [k, v] of rows) {
    const val = Math.max(0, Math.min(100, Number(v)));
    body.append(h('div.why-row', h('span.wk', k), h('span.wbar', h('i', { style: { width: `${val}%` } })), h('span.wv', fmt.int(val))));
  }
  det.append(body);
  return det;
}

// ---- adjust the standing assumptions (patches the active buy box, server-side) ---------------------
function adjust(bb, reload) {
  const pctField = (key, label, val, step = 0.25) => ({ key, kind: 'pct', el: null,
    input: h('input.input', { type: 'number', step: String(step), value: val == null ? '' : String(+(val * 100).toFixed(2)), 'aria-label': label, id: `bb-${key}` }), label });
  const numField = (key, label, val, step = 1) => ({ key, kind: 'num', el: null,
    input: h('input.input', { type: 'number', step: String(step), value: val == null ? '' : String(val), 'aria-label': label, id: `bb-${key}` }), label });

  const fields = [
    pctField('interest_rate', 'Mortgage rate (%)', bb.rate, 0.125),
    pctField('down_payment_rate', 'Down payment (%)', bb.down, 1),
    numField('max_price', 'Max price ($)', bb.max_price, 5000),
    numField('max_units', 'Max units', bb.max_units, 1),
    pctField('vacancy_rate', 'Vacancy (%)', bb.vacancy, 0.5),
    pctField('management_rate', 'Management (%)', bb.management, 0.5),
    numField('target_dscr', 'Target DSCR', bb.target_dscr, 0.05),
    pctField('target_coc', 'Target cash-on-cash (%)', bb.target_coc, 0.5),
  ];
  const body = h('div.detail-grid', fields.map((f) => h('div.field', h('label', { for: `bb-${f.key}` }, f.label), f.input)));

  openDialog({
    title: 'Adjust your assumptions',
    sub: 'Rate, down payment and price move the numbers most. Patches the active buy box and re-underwrites every listing.',
    glow: true, body,
    actions: [
      { label: 'Cancel', class: 'btn-ghost' },
      { label: 'Apply & re-underwrite', class: 'btn-primary', icon: 'refresh', onClick: async () => {
        const patch = {};
        for (const f of fields) {
          const raw = f.input.value;
          if (raw === '' || !Number.isFinite(Number(raw))) continue;
          patch[f.key] = f.kind === 'pct' ? Number(raw) / 100 : Number(raw);
        }
        if (!Object.keys(patch).length) { toast({ title: 'Nothing to change', kind: 'warn' }); return false; }
        try {
          await call('iris2_estate_set_assumptions', { p_patch: patch }, { dedupe: false });
          toast({ title: 'Assumptions updated', message: 'Re-underwriting every listing against your new terms.', kind: 'success' });
          reload();
        } catch (e) {
          toast({ title: 'Could not update', message: `${e.code || 'error'}: ${e.message}`, kind: 'error', duration: 7000 });
          return false;
        }
      } },
    ],
  });
}
