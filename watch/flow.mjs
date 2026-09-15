// Options flow → the numbers the scorer consumes. Pure functions, no I/O, no model.
//
// Input is IRIS's normalized print, not a vendor payload. The Massive → normalized mapping
// lives in sidecar/providers/ and is verified against observed payloads; this file never sees
// a vendor field name. That boundary is what lets the vendor change without this changing.
//
// Everything here follows §8 of the implementation prompt: UNKNOWN is a valid side; a large
// call is not automatically a bullish opening purchase; duplicates and corrections do not
// double-count; dealer exposure is an estimate under a stated assumption, never "verified".

export const FLOW = Object.freeze({
  max_quote_age_ms: 2000,     // a print classified against a quote older than this is UNKNOWN
  midpoint_band: 0.25,        // inside the middle 25% of the spread → UNKNOWN (midpoint)
  unknown_share_cap: 0.5,     // if more than half of premium is unclassified, no directional estimate
  min_oi_coverage: 0.8,       // gamma needs OI on at least 80% of contracts, or it is null
});

/** Normalized print:
 *  { ref_id, seq, ts, underlying, right:'C'|'P', strike, expiry, multiplier,
 *    price, size, bid, ask, quote_ts, conditions:[], correction: null|'cancel'|'correct' } */

export function classifyPrint(p, F = FLOW) {
  const out = { ref_id: p.ref_id, side: 'unknown', basis: null, flow_eligible: true,
    premium: (Number(p.price) || 0) * (Number(p.size) || 0) * (Number(p.multiplier) || 100) };

  const conds = (p.conditions || []).map((c) => String(c).toLowerCase());
  if (conds.some((c) => /late|out.?of.?seq|prior.?ref|cancel/.test(c))) { out.flow_eligible = false; out.basis = 'condition:' + conds.join(','); return out; }

  const bid = num(p.bid), ask = num(p.ask), price = num(p.price);
  if (bid === null || ask === null || price === null) { out.basis = 'no_quote'; return out; }
  if (ask <= bid) { out.basis = 'crossed_or_locked'; return out; }
  if (p.quote_ts == null || p.ts == null || (Number(p.ts) - Number(p.quote_ts)) > F.max_quote_age_ms || Number(p.quote_ts) > Number(p.ts)) { out.basis = 'stale_quote'; return out; }

  const spread = ask - bid, mid = (bid + ask) / 2;
  if (price >= ask) { out.side = 'buy';  out.basis = 'at_or_above_ask'; return out; }
  if (price <= bid) { out.side = 'sell'; out.basis = 'at_or_below_bid'; return out; }
  if (Math.abs(price - mid) <= spread * F.midpoint_band / 2) { out.basis = 'midpoint'; return out; }
  out.side = price > mid ? 'buy' : 'sell'; out.basis = price > mid ? 'above_mid' : 'below_mid';
  return out;
}

/** Apply corrections and cancels, dedupe by ref_id. Later messages win. */
export function reconcile(prints) {
  const byRef = new Map();
  for (const p of prints) {
    if (!p.ref_id) continue;
    if (p.correction === 'cancel') { byRef.delete(p.ref_id); continue; }
    byRef.set(p.ref_id, p);   // first insert, or a 'correct' replacing it
  }
  return [...byRef.values()];
}

/**
 * One underlying, one window → the scorer's flow inputs.
 * baseline: { call_vol_avg20, put_vol_avg20 } for THIS name at THIS time of day, or null.
 */
export function aggregateFlow(prints, baseline, F = FLOW) {
  const rows = reconcile(prints).map((p) => ({ p, c: classifyPrint(p, F) })).filter((r) => r.c.flow_eligible);
  const agg = { call_vol: 0, put_vol: 0, call_prem: 0, put_prem: 0,
    buy_call_prem: 0, sell_call_prem: 0, buy_put_prem: 0, sell_put_prem: 0, unknown_prem: 0, prints: rows.length };
  for (const { p, c } of rows) {
    const isCall = p.right === 'C';
    if (isCall) { agg.call_vol += Number(p.size) || 0; agg.call_prem += c.premium; } else { agg.put_vol += Number(p.size) || 0; agg.put_prem += c.premium; }
    if (c.side === 'unknown') agg.unknown_prem += c.premium;
    else if (isCall) (c.side === 'buy' ? agg.buy_call_prem += c.premium : agg.sell_call_prem += c.premium);
    else             (c.side === 'buy' ? agg.buy_put_prem  += c.premium : agg.sell_put_prem  += c.premium);
  }
  const total = agg.call_prem + agg.put_prem;
  agg.unknown_share = total > 0 ? agg.unknown_prem / total : null;

  // Ratios vs the name's own baseline. No baseline → null, never 1.
  agg.call_vol_ratio = baseline && num(baseline.call_vol_avg20) ? agg.call_vol / baseline.call_vol_avg20 : null;
  agg.put_vol_ratio  = baseline && num(baseline.put_vol_avg20)  ? agg.put_vol  / baseline.put_vol_avg20  : null;

  // Directional estimate only when enough of the premium had a classifiable side.
  if (agg.unknown_share === null || agg.unknown_share > F.unknown_share_cap) {
    agg.net_directional_prem = null;
    agg.directional_note = agg.unknown_share === null ? 'no eligible prints' : `unclassified share ${agg.unknown_share.toFixed(2)} exceeds ${F.unknown_share_cap} — no directional read`;
  } else {
    agg.net_directional_prem = (agg.buy_call_prem + agg.sell_put_prem) - (agg.sell_call_prem + agg.buy_put_prem);
    agg.directional_note = 'estimate from aggressor-side classification; spreads are not grouped';
  }
  return agg;
}

/** 25-delta put skew from a chain snapshot: iv(put, |Δ|≈0.25) − iv(call, Δ≈0.25) at the nearest expiry ≥ minDte. */
export function putSkew25d(chain, { asOf, minDte = 20 } = {}) {
  const t0 = asOf ? new Date(asOf) : new Date();
  const dte = (exp) => (new Date(exp) - t0) / 86400000;
  const exps = [...new Set(chain.map((c) => c.expiry))].filter((e) => dte(e) >= minDte).sort((a, b) => dte(a) - dte(b));
  if (!exps.length) return { skew: null, note: `no expiry ≥ ${minDte} DTE` };
  const exp = exps[0];
  const pick = (right) => chain.filter((c) => c.expiry === exp && c.right === right && num(c.delta) !== null && num(c.iv) !== null)
    .sort((a, b) => Math.abs(Math.abs(a.delta) - 0.25) - Math.abs(Math.abs(b.delta) - 0.25))[0];
  const put = pick('P'), call = pick('C');
  if (!put || !call) return { skew: null, expiry: exp, note: 'no 25-delta put or call with IV at this expiry' };
  return { skew: put.iv - call.iv, expiry: exp, put: { strike: put.strike, delta: put.delta, iv: put.iv }, call: { strike: call.strike, delta: call.delta, iv: call.iv } };
}

/**
 * Dealer gamma sign near spot — an ESTIMATE under a stated assumption, never verified.
 * gex_$ = Σ gamma × OI × multiplier × spot² × 0.01, calls positive and puts negative under
 * the assumption that dealers are short customer calls and long customer puts. That assumption
 * is named in the output so nobody can read it as observed inventory.
 */
export function gexSign(chain, spot, { oiBusinessDate = null, F = FLOW } = {}) {
  const usable = chain.filter((c) => num(c.gamma) !== null);
  const withOi = usable.filter((c) => num(c.oi) !== null);
  const coverage = usable.length ? withOi.length / usable.length : 0;
  if (!usable.length || coverage < F.min_oi_coverage || !oiBusinessDate) {
    return { sign: null, gex_usd: null, coverage, assumption: 'dealers_short_customer', oi_business_date: oiBusinessDate,
      note: !oiBusinessDate ? 'OI business date unknown — refusing to compute' : `OI coverage ${coverage.toFixed(2)} below ${F.min_oi_coverage}` };
  }
  const s2 = Number(spot) ** 2 * 0.01;
  let gex = 0;
  for (const c of withOi) gex += (c.right === 'C' ? 1 : -1) * c.gamma * c.oi * (Number(c.multiplier) || 100) * s2;
  return { sign: gex > 0 ? 1 : gex < 0 ? -1 : 0, gex_usd: gex, coverage, assumption: 'dealers_short_customer', oi_business_date: oiBusinessDate,
    note: 'estimated exposure under a stated inventory assumption; not observed dealer positioning' };
}

function num(v) { return (v === null || v === undefined || Number.isNaN(Number(v))) ? null : Number(v); }
